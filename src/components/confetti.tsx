"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

const COLORS = [
  "var(--primary)",
  "var(--status-on-track)",
  "var(--status-heads-up)",
  "var(--status-plenty-left)",
];

// Deterministic pseudo-random so the burst is varied without calling the impure
// Math.random during render (react-compiler purity). Seeded by piece index.
function rand(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A lightweight, dependency-free confetti burst. Pieces fall and drift from the
 * top of the nearest positioned ancestor, so wrap it in a `relative` container.
 * Mounts once (render it conditionally) to play the animation a single time.
 */
export function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: rand(i, 1) * 100,
        drift: (rand(i, 2) - 0.5) * 160,
        delay: rand(i, 3) * 0.3,
        duration: 1.7 + rand(i, 4) * 1.3,
        rotate: rand(i, 5) * 720 - 360,
        color: COLORS[i % COLORS.length],
        size: 6 + rand(i, 6) * 7,
        round: rand(i, 7) > 0.5,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: "-12%", x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: "130%", x: p.drift, rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? "9999px" : "2px",
          }}
        />
      ))}
    </div>
  );
}
