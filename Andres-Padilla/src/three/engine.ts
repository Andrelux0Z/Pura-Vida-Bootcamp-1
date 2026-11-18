import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createBackgroundStars, createGalaxy, type GalaxyUniforms } from "./galaxy";
import { NO_INPUT, Ship, type ShipInput } from "./ship";
import { CHAIN_FACING, CHAIN_POS, type View } from "@/story/scenes";
import { BlockchainScene } from "./blockchain";
import { NetworkScene } from "./network";

/** Algo con objetos pulsables (`userData.pickIndex`) que reacciona al hover. */
export type Pickable = {
  pickables: THREE.Object3D[];
  setHover(index: number | null): void;
};

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export type EngineCallbacks = {
  onPilotChange?: (piloting: boolean) => void;
  onSpeed?: (speed: number, turbo: boolean) => void;
};

/** Teclas que no deben hacer scroll en la página mientras se pilota. */
const BLOCKED_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

/**
 * Motor 3D de la experiencia: galaxia, nave, cámara y bucle de animación.
 * Se monta sobre un contenedor del DOM y se limpia con `dispose()`.
 */
export class Engine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly ship = new Ship();
  readonly chain = new BlockchainScene();
  readonly network = new NetworkScene();

  // Qué objetos se pueden pulsar ahora mismo (depende del capítulo)
  private pickTarget: Pickable | null = null;
  private onPick: ((index: number) => void) | null = null;
  private onLedger: (() => void) | null = null;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private controls: OrbitControls;
  private uniforms: GalaxyUniforms;
  private clock = new THREE.Clock();
  private frame = 0;

  private piloting = false;
  private keys: Record<string, boolean> = {};

  // Transición de cámara entre capítulos
  private view: View | null = null;
  private tween: {
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
    duration: number;
  } | null = null;
  private shipTarget: THREE.Vector3 | null = null;

  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointer = new THREE.Vector2();
  private mouseTarget = new THREE.Vector3(999, 0, 999);
  private mouseInside = false;
  private downAt: [number, number] | null = null;

  private _tmp = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _fwd = new THREE.Vector3();
  private lastSpeedReport = -1;
  private resizeObserver: ResizeObserver;

  constructor(
    private container: HTMLElement,
    private callbacks: EngineCallbacks = {},
  ) {
    const w = container.clientWidth;
    const h = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    this.camera.position.set(0, 40, 60); // empieza lejos; el primer capítulo vuela hacia dentro

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 40;

    // Post-procesado (bloom)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.4, 0.2));
    this.composer.addPass(new OutputPass());

    // Galaxia y fondo
    const galaxy = createGalaxy(this.renderer.getPixelRatio());
    this.uniforms = galaxy.uniforms;
    this.scene.add(galaxy.points, createBackgroundStars());

    // Luces (para iluminar la nave)
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 10, 7);
    this.scene.add(sun);
    this.scene.add(new THREE.PointLight(0xffaa66, 40, 0, 2)); // luz cálida del núcleo

    // Nave
    this.ship.group.position.set(4, 0.8, 9);
    this.ship.group.lookAt(8, 0.8, 18);
    this.scene.add(this.ship.group, this.ship.trail);

    // Cadena de bloques del capítulo 1
    this.chain.place(new THREE.Vector3(...CHAIN_POS), new THREE.Vector3(...CHAIN_FACING));
    this.scene.add(this.chain.group);

    // Red de validadores del capítulo 2
    this.scene.add(this.network.group);

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(container);

    this.addListeners();
    this.loop();
  }

  // ---------- API pública ----------

  /**
   * Lleva la cámara (y la nave) a la vista de un capítulo con una transición suave.
   */
  setView(view: View, duration = 2.6) {
    this.view = view;
    this.shipTarget = new THREE.Vector3(...view.ship);
    if (this.piloting) return; // se aplicará al dejar de pilotar
    this.tween = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: new THREE.Vector3(...view.camera),
      toTarget: new THREE.Vector3(...view.target),
      t: 0,
      duration,
    };
    // Durante la transición no se limita la distancia ni se deja orbitar
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 200;
  }

  setPiloting(on: boolean) {
    if (on === this.piloting) return;
    this.piloting = on;
    this.tween = null;
    this.controls.enabled = !on;
    this.controls.autoRotate = false;
    if (!on) {
      this.camera.up.set(0, 1, 0);
      this.camera.fov = 60;
      this.camera.updateProjectionMatrix();
      this.mouseInside = false;
      // Vuelve a la vista del capítulo actual
      this.controls.target.copy(this.ship.group.position);
      if (this.view) this.setView(this.view, 2);
    }
    this.callbacks.onPilotChange?.(on);
  }

  /** Elige qué objetos se pueden pulsar y qué hacer al pulsarlos (null = nada pulsable). */
  setPickTarget(target: Pickable | null, handler: ((index: number) => void) | null = null) {
    this.pickTarget?.setHover(null);
    this.renderer.domElement.style.cursor = "";
    this.pickTarget = target;
    this.onPick = target ? handler : null;
  }

  /** Se llama cada vez que la red de validadores cierra un ledger. */
  setLedgerListener(listener: (() => void) | null) {
    this.onLedger = listener;
  }

  togglePiloting() {
    this.setPiloting(!this.piloting);
  }

  /** Lanza una onda expansiva desde un punto del plano de la galaxia. */
  shockwave(origin: THREE.Vector3, color: THREE.ColorRepresentation = 0xffffff) {
    this.uniforms.uShockOrigin.value.copy(origin);
    this.uniforms.uShockColor.value.set(color);
    this.uniforms.uShockTime.value = 0;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.removeListeners();
    this.controls.dispose();
    this.composer.dispose();
    this.scene.traverse((obj) => {
      const o = obj as THREE.Mesh;
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- Entrada ----------

  private aim(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private pointOnPlane() {
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? hit : null;
  }

  /** Índice del objeto pulsable bajo el puntero, o `null`. */
  private pick(): number | null {
    if (!this.pickTarget) return null;
    const hit = this.raycaster.intersectObjects(this.pickTarget.pickables, false)[0];
    return hit ? (hit.object.userData.pickIndex as number) : null;
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.piloting) return;
    this.aim(e);
    const h = this.pointOnPlane();
    this.mouseInside = !!h;
    if (h) this.mouseTarget.copy(h);

    if (this.pickTarget) {
      const index = this.pick();
      this.pickTarget.setHover(index);
      this.renderer.domElement.style.cursor = index !== null ? "pointer" : "";
    }
  };

  private onPointerLeave = () => {
    if (!this.piloting) this.mouseInside = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.downAt = [e.clientX, e.clientY];
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.piloting || !this.downAt) return;
    // Solo es "clic" si el puntero casi no se movió (si no, fue un arrastre para orbitar)
    if (Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) > 5) return;
    this.aim(e);
    if (this.onPick) {
      const index = this.pick();
      if (index !== null) {
        this.onPick(index);
        return;
      }
    }
    const h = this.pointOnPlane();
    if (h) this.shockwave(h);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    this.keys[e.code] = true;
    if (this.piloting && BLOCKED_KEYS.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "KeyC") this.togglePiloting();
    if (e.code === "KeyF" && this.piloting) this.shockwave(this.ship.group.position);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onBlur = () => {
    this.keys = {};
  };

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  };

  private addListeners() {
    const c = this.renderer.domElement;
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerleave", this.onPointerLeave);
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  private removeListeners() {
    const c = this.renderer.domElement;
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private readInput(): ShipInput {
    if (!this.piloting) return NO_INPUT;
    const k = (c: string) => (this.keys[c] ? 1 : 0);
    const acel = k("KeyW") - k("KeyS") * 0.6;
    return {
      acel,
      yaw: THREE.MathUtils.clamp(k("KeyA") + k("ArrowLeft") - k("KeyD") - k("ArrowRight"), -1, 1),
      pitch: k("ArrowUp") - k("ArrowDown"),
      roll: k("KeyQ") - k("KeyE"),
      turbo: !!(this.keys.ShiftLeft || this.keys.ShiftRight) && acel > 0,
      freno: !!this.keys.Space,
    };
  }

  // ---------- Bucle ----------

  private updateChaseCamera(dt: number) {
    const cam = this.camera;
    const nave = this.ship.group;
    const s = 1 - Math.exp(-dt * 6);

    this._tmp.set(0, 0.55, 2.0).applyQuaternion(nave.quaternion).add(nave.position);
    cam.position.lerp(this._tmp, 1 - Math.exp(-dt * 5));
    this._up.set(0, 1, 0).applyQuaternion(nave.quaternion);
    cam.up.lerp(this._up, 1 - Math.exp(-dt * 3)).normalize();
    this.ship.forward(this._fwd);
    this._look.copy(this._fwd).multiplyScalar(3).add(nave.position);
    cam.lookAt(this._look);
    const fovObj = 60 + this.ship.velocity.length() * 1.6;
    cam.fov += (fovObj - cam.fov) * s;
    cam.updateProjectionMatrix();

    // La nave perturba las estrellas a su paso
    this.mouseTarget.copy(nave.position);
    this.mouseInside = true;
  }

  private updateTween(dt: number) {
    const tw = this.tween;
    if (!tw) return;
    tw.t = Math.min(tw.t + dt / tw.duration, 1);
    const k = easeInOutCubic(tw.t);
    this.camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
    this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    if (tw.t >= 1) {
      this.tween = null;
      const v = this.view;
      this.controls.enabled = true;
      this.controls.autoRotate = !!v?.autoRotate;
      this.controls.minDistance = v?.minDistance ?? 3;
      this.controls.maxDistance = v?.maxDistance ?? 40;
    }
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const u = this.uniforms;

    u.uTime.value += dt * 0.3;
    u.uShockTime.value += dt;
    u.uMouse.value.lerp(this.mouseTarget, 0.15);
    u.uMouseStrength.value += ((this.mouseInside ? 1 : 0) - u.uMouseStrength.value) * 0.08;

    this.chain.update(dt, t);
    this.network.cameraQuat.copy(this.camera.quaternion);
    if (this.network.update(dt, t)) {
      // La red cerró un ledger: una onda dorada recorre la galaxia
      this.shockwave(new THREE.Vector3(0, 0, 0), 0xffc857);
      this.onLedger?.();
    }

    const input = this.readInput();
    if (this.piloting) {
      this.ship.update(dt, t, input, true);
      this.updateChaseCamera(dt);
      const speed = Math.round(this.ship.velocity.length() * 100);
      if (speed !== this.lastSpeedReport) {
        this.lastSpeedReport = speed;
        this.callbacks.onSpeed?.(speed, input.turbo);
      }
    } else {
      if (this.shipTarget) this.ship.autopilot(dt, t, this.shipTarget);
      else this.ship.update(dt, t, NO_INPUT, false);
      this.updateTween(dt);
      this.controls.update();
    }

    this.composer.render();
  };
}
