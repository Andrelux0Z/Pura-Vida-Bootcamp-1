"use client";

import type { ReactNode } from "react";
import { CHAPTERS, type Chapter } from "@/story/chapters";
import styles from "./ChapterPanel.module.css";

type Props = {
  index: number;
  onGo: (index: number) => void;
  /** Contenido interactivo propio del capítulo. */
  children?: ReactNode;
};

export function ChapterProgress({ index, onGo }: Pick<Props, "index" | "onGo">) {
  return (
    <nav className={styles.progress} aria-label="Capítulos">
      {CHAPTERS.map((c, i) => (
        <button
          key={c.id}
          className={`${styles.step} ${i === index ? styles.current : ""} ${i < index ? styles.done : ""}`}
          onClick={() => onGo(i)}
          aria-current={i === index ? "step" : undefined}
          title={c.title}
        >
          <span className={styles.dot} />
          <span className={styles.stepLabel}>{c.short}</span>
        </button>
      ))}
    </nav>
  );
}

export default function ChapterPanel({ index, onGo, children }: Props) {
  const chapter: Chapter = CHAPTERS[index];
  const isFirst = index === 0;
  const isLast = index === CHAPTERS.length - 1;

  return (
    <section className={styles.panel} key={chapter.id}>
      <p className={styles.kicker}>{isFirst ? "Bienvenida" : `Capítulo ${index} de ${CHAPTERS.length - 1}`}</p>
      <h2 className={styles.title}>{chapter.title}</h2>
      {chapter.body.map((p) => (
        <p key={p} className={styles.body}>
          {p}
        </p>
      ))}

      {children && <div className={styles.extra}>{children}</div>}

      <div className={styles.nav}>
        {!isFirst && (
          <button className={styles.back} onClick={() => onGo(index - 1)}>
            ← Anterior
          </button>
        )}
        <button className={styles.next} onClick={() => onGo(isLast ? 0 : index + 1)}>
          {isFirst ? "Empezar viaje →" : isLast ? "Volver al inicio" : "Siguiente →"}
        </button>
      </div>
    </section>
  );
}
