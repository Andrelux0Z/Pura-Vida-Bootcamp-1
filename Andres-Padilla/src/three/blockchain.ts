import * as THREE from "three";
import type { BlockStatus } from "@/story/blockchainModel";

// Cadena de bloques de cristal del capítulo 1, con copias de la red alrededor.

const SPACING = 1.55;
const SIZE = 0.9;

export const CHAIN_COLORS: Record<BlockStatus, number> = {
  ok: 0xffc857, // dorado: confirmado y aceptado
  broken: 0xff3b4e, // rojo: cadena rota
  rejected: 0xff8a3c, // naranja: coherente pero distinta a la red
};

const REPLICA_OFFSETS: [number, number, number][] = [
  [-3.4, 2.0, -2.6],
  [3.5, 2.2, -3.1],
  [-3.8, -1.7, -2.9],
  [3.2, -1.9, -2.3],
];

type BlockView = {
  root: THREE.Group;
  spin: THREE.Group;
  cube: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  inner: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  txs: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[];
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTexture: THREE.CanvasTexture;
  labelKey: string;
  scale: number;
};

export type ChainState = {
  status: BlockStatus[];
  links: boolean[];
  hashes: string[];
  selected: number | null;
};

export class BlockchainScene {
  readonly group = new THREE.Group();
  /** Mallas que se pueden pulsar; `userData.blockIndex` dice qué bloque es. */
  readonly pickables: THREE.Object3D[] = [];

  private blocks: BlockView[] = [];
  private links: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  private replicas: THREE.Group[] = [];
  private replicaLines: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private state: ChainState | null = null;
  private hovered: number | null = null;
  private rejectPulse = 0;
  private baseY = 0;
  private lineCalm = new THREE.Color(0x8fa8ff);
  private lineAlert = new THREE.Color(CHAIN_COLORS.broken);

  constructor(private count = 5) {
    const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE, SIZE, SIZE));
    const innerGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE * 0.92, SIZE * 0.92, SIZE * 0.92));

    for (let i = 0; i < count; i++) {
      const root = new THREE.Group();
      root.position.x = (i - (count - 1) / 2) * SPACING;
      const spin = new THREE.Group();
      root.add(spin);

      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(SIZE, SIZE, SIZE),
        new THREE.MeshStandardMaterial({
          color: 0x1b2a4a,
          emissive: 0x0b1530,
          metalness: 0.1,
          roughness: 0.15,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      cube.userData.blockIndex = i;
      spin.add(cube);
      this.pickables.push(cube);

      const edges = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({ color: CHAIN_COLORS.ok, transparent: true }),
      );
      const inner = new THREE.LineSegments(
        innerGeo,
        new THREE.LineBasicMaterial({ color: CHAIN_COLORS.ok, transparent: true, opacity: 0.45 }),
      );
      spin.add(edges, inner);

      // Transacciones flotando dentro del bloque
      const txs: BlockView["txs"] = [];
      for (let k = 0; k < 3; k++) {
        const tx = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xbfd4ff }),
        );
        spin.add(tx);
        txs.push(tx);
      }

      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 512;
      labelCanvas.height = 160;
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      labelTexture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false }),
      );
      label.scale.set(1.3, 0.41, 1);
      label.position.y = SIZE * 0.95;
      root.add(label);

      this.group.add(root);
      this.blocks.push({
        root,
        spin,
        cube,
        edges,
        inner,
        txs,
        label,
        labelCanvas,
        labelTexture,
        labelKey: "",
        scale: 1,
      });
    }

    // Enlaces de luz entre bloques
    for (let i = 0; i < count - 1; i++) {
      const len = SPACING - SIZE;
      const link = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, len, 10),
        new THREE.MeshBasicMaterial({ color: CHAIN_COLORS.ok, transparent: true }),
      );
      link.rotation.z = Math.PI / 2;
      link.position.x = (i + 0.5 - (count - 1) / 2) * SPACING;
      this.group.add(link);
      this.links.push(link);
    }

    // Copias de la cadena en otras computadoras de la red
    for (const off of REPLICA_OFFSETS) {
      const rep = new THREE.Group();
      rep.position.set(...off);
      rep.scale.setScalar(0.3);
      for (let i = 0; i < count; i++) {
        const e = new THREE.LineSegments(
          edgesGeo,
          new THREE.LineBasicMaterial({ color: CHAIN_COLORS.ok, transparent: true, opacity: 0.75 }),
        );
        e.position.x = (i - (count - 1) / 2) * SPACING;
        rep.add(e);
        if (i < count - 1) {
          const l = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, SPACING - SIZE, 6),
            new THREE.MeshBasicMaterial({ color: CHAIN_COLORS.ok, transparent: true, opacity: 0.75 }),
          );
          l.rotation.z = Math.PI / 2;
          l.position.x = (i + 0.5 - (count - 1) / 2) * SPACING;
          rep.add(l);
        }
      }
      this.group.add(rep);
      this.replicas.push(rep);

      // Línea tenue que une cada copia con la cadena principal
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...off),
        new THREE.Vector3(0, 0, 0),
      ]);
      const line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0.18 }),
      );
      this.group.add(line);
      this.replicaLines.push(line);
    }
  }

  /** Coloca la cadena en `position` mirando hacia `facing` (la cámara de su capítulo). */
  place(position: THREE.Vector3, facing: THREE.Vector3) {
    this.group.position.copy(position);
    this.baseY = position.y;
    this.group.lookAt(facing.x, position.y, facing.z);
  }

  setState(state: ChainState) {
    const wasRejected = this.state?.status.includes("rejected") ?? false;
    this.state = state;
    if (!wasRejected && state.status.includes("rejected") && !state.status.includes("broken")) {
      this.rejectPulse = 1;
    }
    state.status.forEach((s, i) => this.drawLabel(i, s, state.hashes[i] ?? ""));
  }

  setHover(index: number | null) {
    this.hovered = index;
  }

  update(dt: number, t: number) {
    const st = this.state;
    this.group.position.y = this.baseY + Math.sin(t * 0.8) * 0.08; // flotación muy suave

    this.blocks.forEach((b, i) => {
      const status = st?.status[i] ?? "ok";
      const color = CHAIN_COLORS[status];
      const selected = st?.selected === i;
      const hovered = this.hovered === i;

      const target = selected ? 1.16 : hovered ? 1.07 : 1;
      b.scale += (target - b.scale) * (1 - Math.exp(-dt * 8));
      b.root.scale.setScalar(b.scale);

      b.spin.rotation.y = Math.sin(t * 0.5 + i) * 0.25;
      b.spin.rotation.x = Math.sin(t * 0.4 + i * 1.7) * 0.08;

      const flicker = status === "broken" ? 0.65 + Math.sin(t * 9 + i) * 0.35 : 1;
      b.edges.material.color.set(color);
      b.edges.material.opacity = flicker;
      b.inner.material.color.set(color);
      b.inner.material.opacity = (selected ? 0.8 : 0.4) * flicker;
      b.cube.material.emissive.set(selected ? color : 0x0b1530);
      b.cube.material.emissiveIntensity = selected ? 0.18 : 1;

      b.txs.forEach((tx, k) => {
        const a = t * (0.7 + k * 0.25) + k * 2.1 + i;
        tx.position.set(Math.cos(a) * 0.22, Math.sin(a * 1.3) * 0.18, Math.sin(a) * 0.22);
        tx.material.color.set(status === "ok" ? 0xbfd4ff : color);
      });
    });

    this.links.forEach((l, i) => {
      const ok = st?.links[i] ?? true;
      const leftStatus = st?.status[i] ?? "ok";
      const color = ok ? CHAIN_COLORS[leftStatus === "broken" ? "broken" : leftStatus] : CHAIN_COLORS.broken;
      l.material.color.set(color);
      // Un enlace roto parpadea y se adelgaza
      l.material.opacity = ok ? 0.95 : 0.35 + Math.abs(Math.sin(t * 7 + i)) * 0.5;
      l.scale.set(ok ? 1 : 0.6, ok ? 1 : 0.55, ok ? 1 : 0.6);
    });

    // Las copias "rechazan" con un destello cuando tu cadena difiere de la suya
    this.rejectPulse = Math.max(0, this.rejectPulse - dt * 0.6);
    const differs = st?.status.some((s) => s !== "ok") ?? false;
    this.replicaLines.forEach((line, i) => {
      const base = differs ? 0.35 + Math.sin(t * 3 + i) * 0.15 : 0.18;
      line.material.opacity = base + this.rejectPulse * 0.6;
      line.material.color.copy(differs ? this.lineAlert : this.lineCalm);
    });
    this.replicas.forEach((r, i) => {
      r.rotation.y = Math.sin(t * 0.3 + i) * 0.15;
      const s = 0.3 * (1 + this.rejectPulse * 0.25 * Math.sin(t * 20));
      r.scale.setScalar(s);
    });
  }

  private drawLabel(i: number, status: BlockStatus, hash: string) {
    const b = this.blocks[i];
    const key = `${status}|${hash}`;
    if (key === b.labelKey) return;
    b.labelKey = key;

    const c = b.labelCanvas;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = "center";
    g.shadowColor = "rgba(120,160,255,0.8)";
    g.shadowBlur = 12;
    g.fillStyle = "#ffffff";
    g.font = "600 46px system-ui, sans-serif";
    g.fillText(i === 0 ? "GÉNESIS" : `BLOQUE ${i}`, c.width / 2, 58);
    g.font = "36px ui-monospace, Consolas, monospace";
    g.fillStyle = `#${CHAIN_COLORS[status].toString(16).padStart(6, "0")}`;
    g.shadowColor = g.fillStyle;
    g.fillText(hash ? `#${hash.slice(0, 10)}…` : "…", c.width / 2, 122);
    b.labelTexture.needsUpdate = true;
  }

  /** Número de bloques (para la interfaz). */
  get size() {
    return this.count;
  }
}
