import "./depth3d.css";

/**
 * Writes the cursor's offset from a panel's centre into --d3-x / --d3-y, as
 * signed fractions in [-0.5, 0.5]. depth3d.css turns those into an angle.
 *
 * One delegated listener rather than per-component handlers, so no component
 * has to know this exists.
 *
 * This selector is deliberately looser than the CSS one: it has no guards for
 * tables, scrollers or modals. A panel the CSS excludes simply ends up with
 * two custom properties nothing reads, which costs nothing and keeps the
 * decision about what tilts in one place -- the stylesheet.
 */
const SCOPE = ".w-full.space-y-8.animate-in.fade-in";
const PANEL = `${SCOPE} :is(.rounded-2xl, .rounded-3xl).bg-white`;

let panel: HTMLElement | null = null;
let box: DOMRect | null = null;

function release() {
  panel?.style.removeProperty("--d3-x");
  panel?.style.removeProperty("--d3-y");
  panel = null;
  box = null;
}

function onMove(e: MouseEvent) {
  const target = e.target as Element | null;
  const hit = (target?.closest?.(PANEL) ?? null) as HTMLElement | null;

  if (hit !== panel) {
    release();
    panel = hit;
    // Measured once on entry: getBoundingClientRect on every move forces a
    // layout flush, and the box does not change while the cursor crosses it.
    box = hit?.getBoundingClientRect() ?? null;
  }
  if (!panel || !box) return;

  panel.style.setProperty("--d3-x", ((e.clientX - box.left) / box.width - 0.5).toFixed(3));
  panel.style.setProperty("--d3-y", ((e.clientY - box.top) / box.height - 0.5).toFixed(3));
}

if (
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  document.addEventListener("mousemove", onMove, { passive: true });
  // A cached box goes stale the moment the page moves under the cursor.
  document.addEventListener("scroll", release, { passive: true, capture: true });
}
