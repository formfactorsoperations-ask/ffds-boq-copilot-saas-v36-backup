import React from "react";

/**
 * Cursor tilt for a panel.
 *
 * Kept as a hook rather than reusing CardContainer from ui/3d-card, because
 * these panels are grid children with column spans -- wrapping them in that
 * component's centring flex box would fight the grid. The maths is the same:
 * offset from the panel's centre, scaled to a few degrees.
 *
 * The caller supplies the angle. Small cards can take 6-7 degrees; a tall
 * panel full of rows needs far less, or the bottom row swings noticeably while
 * you are trying to click the top one.
 */
export function useTilt(maxDeg = 6) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const reduce =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `rotateY(${x * maxDeg * 2}deg) rotateX(${-y * maxDeg * 2}deg)`;
  };

  const onMouseLeave = () => {
    if (ref.current) ref.current.style.transform = "rotateY(0deg) rotateX(0deg)";
  };

  return { ref, onMouseMove, onMouseLeave };
}
