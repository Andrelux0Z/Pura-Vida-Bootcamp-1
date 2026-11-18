"use client";

import { useEffect, useRef, useState } from "react";
import type { Engine } from "@/three/engine";
import styles from "./Universe.module.css";

export default function Universe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [piloting, setPiloting] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [turbo, setTurbo] = useState(false);

  useEffect(() => {
    let disposed = false;
    // Three.js solo existe en el navegador: se carga aquí y no en el servidor
    import("@/three/engine").then(({ Engine }) => {
      if (disposed || !containerRef.current) return;
      engineRef.current = new Engine(containerRef.current, {
        onPilotChange: setPiloting,
        onSpeed: (v, t) => {
          setSpeed(v);
          setTurbo(t);
        },
      });
      requestAnimationFrame(() => setReady(true));
    });
    return () => {
      disposed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className={styles.root}>
      <div ref={containerRef} className={styles.canvas} />

      <div className={`${styles.loading} ${ready ? styles.hidden : ""}`}>GENERANDO GALAXIA…</div>

      <button
        className={styles.mode}
        onClick={(e) => {
          engineRef.current?.togglePiloting();
          e.currentTarget.blur();
        }}
      >
        {piloting ? "🔭 Vista libre (C)" : "🚀 Pilotar nave (C)"}
      </button>

      {piloting ? (
        <>
          <div className={styles.help}>
            <div><b>W / S</b> acelerar / retroceder</div>
            <div><b>A / D</b> girar izquierda / derecha</div>
            <div><b>↑ / ↓</b> subir / bajar el morro</div>
            <div><b>Q / E</b> alabeo (rodar)</div>
            <div><b>Shift</b> turbo</div>
            <div><b>Espacio</b> frenar</div>
            <div><b>F</b> lanzar onda expansiva</div>
            <div><b>C</b> volver a vista libre</div>
          </div>
          <div className={styles.hud}>
            <div className={styles.turbo} style={{ visibility: turbo ? "visible" : "hidden" }}>
              TURBO
            </div>
            <div className={styles.num}>{speed}</div>
            <div className={styles.lbl}>VELOCIDAD</div>
          </div>
        </>
      ) : (
        <div className={styles.title}>
          <h1>Stellar</h1>
          <p>Mueve el ratón para perturbar las estrellas · Clic para lanzar una onda · Arrastra para orbitar</p>
        </div>
      )}
    </div>
  );
}
