"use client";

import { useEffect, useRef, useState } from "react";
import type { Engine } from "@/three/engine";
import { CHAPTERS } from "@/story/chapters";
import ChapterPanel, { ChapterProgress } from "./ChapterPanel";
import styles from "./Universe.module.css";

export default function Universe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [piloting, setPiloting] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [turbo, setTurbo] = useState(false);
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    let disposed = false;
    let instance: Engine | null = null;
    // Three.js solo existe en el navegador: se carga aquí y no en el servidor
    import("@/three/engine").then(({ Engine }) => {
      if (disposed || !containerRef.current) return;
      instance = new Engine(containerRef.current, {
        onPilotChange: setPiloting,
        onSpeed: (v, t) => {
          setSpeed(v);
          setTurbo(t);
        },
      });
      instance.setView(CHAPTERS[0].view, 4); // vuelo de entrada
      setEngine(instance);
      requestAnimationFrame(() => setReady(true));
    });
    return () => {
      disposed = true;
      instance?.dispose();
      setEngine(null);
    };
  }, []);

  function goTo(index: number) {
    setChapter(index);
    engine?.setView(CHAPTERS[index].view);
  }

  return (
    <div className={styles.root}>
      <div ref={containerRef} className={styles.canvas} />

      <div className={`${styles.loading} ${ready ? styles.hidden : ""}`}>GENERANDO GALAXIA…</div>

      <button
        className={styles.mode}
        onClick={(e) => {
          engine?.togglePiloting();
          e.currentTarget.blur();
        }}
      >
        {piloting ? "🔭 Volver al viaje (C)" : "🚀 Pilotar nave (C)"}
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
            <div><b>C</b> volver al viaje</div>
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
        <>
          <ChapterProgress index={chapter} onGo={goTo} />
          {chapter === 0 && (
            <div className={styles.hero}>
              <h1>Stellar</h1>
              <p>Mueve el ratón para perturbar las estrellas · Clic para lanzar una onda · Arrastra para orbitar</p>
            </div>
          )}
          <ChapterPanel index={chapter} onGo={goTo} />
        </>
      )}
    </div>
  );
}
