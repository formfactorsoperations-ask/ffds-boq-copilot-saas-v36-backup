/*
  The walls of the client's plan, found in the drawing itself.

  The AI reads each room and roughly where it is drawn, but its boxes are
  approximate: rooms overlap, gaps open between them, and a line plan drawn
  from them comes out broken. The drawing knows better. Walls are the thick,
  dark, unsaturated strokes; furniture, flooring, text and dimension lines are
  thin or coloured. So:

    1. darkMask      the dark grey pixels
    2. wallMask      only the strokes as thick as a wall: an opening (erode,
                     then dilate) sized from the drawing's own wall thickness,
                     so a rendered plan loses its furniture and a plain line
                     drawing keeps its thin walls
    3. snapToWalls   each edge of a room's box moved onto the wall line nearest
                     to it (the wall's centre), when a wall runs along enough
                     of that edge
    4. openingsOf    gaps in a room's wall: a door where another room is on the
                     other side, a window on an outside wall

  Pure: everything works on a mask, so it is tested without a canvas
  (services/planImage reads the image into one).
*/

export interface Mask {
  w: number;
  h: number;
  /** 1 where there is wall (or dark ink, before wallMask), row by row. */
  on: Uint8Array;
}

export interface PxRect { x: number; y: number; w: number; h: number }

export type Side = 'top' | 'bottom' | 'left' | 'right';

/** Dark, near-grey pixels: walls in a rendered plan and ink in a line drawing. */
export function darkMask(rgba: Uint8ClampedArray | number[], w: number, h: number, lumMax = 125, satMax = 45): Mask {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
    if (a !== undefined && a < 128) continue;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (lum < lumMax && sat < satMax) on[i] = 1;
  }
  return { w, h, on };
}

/** A square min (erode) or max (dilate) filter of radius k, done row then column. */
function filter(m: Mask, k: number, erode: boolean): Mask {
  if (k <= 0) return m;
  const { w, h } = m;
  const pass = (src: Uint8Array, horiz: boolean) => {
    const out = new Uint8Array(w * h);
    const len = horiz ? w : h, lines = horiz ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => (horiz ? l * w + i : i * w + l);
      // Running count of set pixels in the window [i-k, i+k].
      let count = 0;
      for (let i = 0; i <= Math.min(k, len - 1); i++) count += src[at(i)];
      for (let i = 0; i < len; i++) {
        const lo = i - k, hi = i + k;
        // Past the image's edge counts as no wall, so an erosion there clears.
        out[at(i)] = (erode ? count === 2 * k + 1 : count > 0) ? 1 : 0;
        if (lo >= 0) count -= src[at(lo)];
        if (hi + 1 < len) count += src[at(hi + 1)];
      }
    }
    return out;
  };
  return { w, h, on: pass(pass(m.on, true), false) };
}

export const erode = (m: Mask, k: number) => filter(m, k, true);
export const dilate = (m: Mask, k: number) => filter(m, k, false);

/**
 * How thick the drawing's walls are, in pixels: among the dark strokes that
 * run long (a wall, not a letter), the thickness most of them reach. A
 * rendered plan gives 6–12 px; a line drawing 1–3.
 */
export function wallThicknessPx(m: Mask): number {
  const { w, h, on } = m;
  const longRun = Math.max(12, Math.round(Math.min(w, h) * 0.06));
  const thick: number[] = [];
  // Horizontal strokes: a vertical cut through a long horizontal run measures its thickness.
  const runLen = (x: number, y: number, dx: number, dy: number) => {
    let n = 0;
    while (x >= 0 && y >= 0 && x < w && y < h && on[y * w + x]) { n++; x += dx; y += dy; }
    return n;
  };
  const step = Math.max(2, Math.round(Math.min(w, h) / 160));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (!on[y * w + x]) continue;
      const hr = runLen(x, y, 1, 0) + runLen(x, y, -1, 0) - 1;
      const vr = runLen(x, y, 0, 1) + runLen(x, y, 0, -1) - 1;
      if (hr >= longRun && vr < hr / 3) thick.push(vr);
      else if (vr >= longRun && hr < vr / 3) thick.push(hr);
    }
  }
  if (!thick.length) return 1;
  thick.sort((a, b) => a - b);
  return thick[Math.floor(thick.length * 0.7)];
}

/**
 * The walls alone: strokes at least about as thick as the drawing's walls.
 * The opening's radius is a fifth of the wall thickness, so the thinner
 * partitions of a plan survive while a 2 px bed outline or flooring joint does
 * not; a line drawing (walls under 5 px) is left as it is.
 */
export function wallMask(m: Mask): { mask: Mask; thickness: number; radius: number } {
  const thickness = wallThicknessPx(m);
  const radius = thickness >= 5 ? Math.max(1, Math.round(thickness / 5)) : 0;
  return { mask: radius ? dilate(erode(m, radius), radius) : m, thickness, radius };
}

const clampI = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** How much of the line x (or y) between a and b is wall, 0–1, looking `band` pixels either side. */
function coverAt(m: Mask, vertical: boolean, pos: number, a: number, b: number, band = 0): number {
  const lo = clampI(Math.min(a, b), 0, (vertical ? m.h : m.w) - 1);
  const hi = clampI(Math.max(a, b), 0, (vertical ? m.h : m.w) - 1);
  if (hi < lo) return 0;
  let n = 0;
  for (let t = lo; t <= hi; t++) {
    let hit = 0;
    for (let d = -band; d <= band && !hit; d++) {
      const p = Math.round(pos) + d;
      if (vertical ? p < 0 || p >= m.w : p < 0 || p >= m.h) continue;
      hit = vertical ? m.on[t * m.w + p] : m.on[p * m.w + t];
    }
    n += hit;
  }
  return n / (hi - lo + 1);
}

/**
 * The wall line an edge belongs to: within `tol` pixels of it, the run of
 * lines (x for a vertical edge, y for a horizontal one) along which wall
 * covers at least `minCover` of the edge's middle stretch; its centre, the
 * wall's centre line. The nearest such run wins, a stronger one breaking a
 * near tie. Null when no wall runs along the edge.
 */
export function wallLineNear(m: Mask, vertical: boolean, edge: number, a: number, b: number, tol: number, minCover = 0.3): number | null {
  const len = b - a;
  const s = a + len * 0.12, e = b - len * 0.12;
  const lo = clampI(edge - tol, 0, (vertical ? m.w : m.h) - 1);
  const hi = clampI(edge + tol, 0, (vertical ? m.w : m.h) - 1);
  const runs: { from: number; to: number; peak: number }[] = [];
  let cur: { from: number; to: number; peak: number } | null = null;
  for (let p = lo; p <= hi; p++) {
    const c = coverAt(m, vertical, p, s, e);
    if (c >= minCover) {
      if (cur && p === cur.to + 1) { cur.to = p; cur.peak = Math.max(cur.peak, c); }
      else { cur = { from: p, to: p, peak: c }; runs.push(cur); }
    } else cur = null;
  }
  if (!runs.length) return null;
  const scored = runs.map(r => {
    const c = (r.from + r.to) / 2;
    return { c, score: r.peak - 0.5 * (Math.abs(c - edge) / Math.max(tol, 1)) };
  }).sort((p, q) => q.score - p.score);
  return scored[0].c;
}

/**
 * A room's box with each edge moved onto its wall's centre line, where a wall
 * runs along it. Rooms either side of one wall end up on the same line, so
 * they share it. `snapped` counts the edges that moved onto a wall.
 */
export function snapToWalls(r: PxRect, m: Mask, tol: number): PxRect & { snapped: number } {
  let L = r.x, R = r.x + r.w, T = r.y, B = r.y + r.h, snapped = 0;
  const left = wallLineNear(m, true, L, T, B, tol);
  const right = wallLineNear(m, true, R, T, B, tol);
  const top = wallLineNear(m, false, T, L, R, tol);
  const bottom = wallLineNear(m, false, B, L, R, tol);
  if (left !== null) { L = left; snapped++; }
  if (right !== null) { R = right; snapped++; }
  if (top !== null) { T = top; snapped++; }
  if (bottom !== null) { B = bottom; snapped++; }
  // A snap that would turn the room inside out, or crush it, is not taken.
  if (R - L < r.w * 0.5) { L = r.x; R = r.x + r.w; }
  if (B - T < r.h * 0.5) { T = r.y; B = r.y + r.h; }
  return { x: L, y: T, w: R - L, h: B - T, snapped };
}

export interface Gap {
  side: Side;
  /** Pixels from the start of the side (its left or top end). */
  from: number;
  to: number;
}

/**
 * Gaps in a room's walls: stretches of a side, away from its corners, with no
 * wall in a band `band` pixels either side of the line. A side with almost
 * no wall at all is skipped: its wall was not found, which is not a gap.
 */
export function gapsOf(r: PxRect, m: Mask, band: number, minPx: number, maxPx: number): Gap[] {
  const out: Gap[] = [];
  const sides: { side: Side; vertical: boolean; pos: number; a: number; b: number }[] = [
    { side: 'top', vertical: false, pos: r.y, a: r.x, b: r.x + r.w },
    { side: 'bottom', vertical: false, pos: r.y + r.h, a: r.x, b: r.x + r.w },
    { side: 'left', vertical: true, pos: r.x, a: r.y, b: r.y + r.h },
    { side: 'right', vertical: true, pos: r.x + r.w, a: r.y, b: r.y + r.h },
  ];
  sides.forEach(sd => {
    const corner = band * 2 + 1;
    const s = Math.round(sd.a + corner), e = Math.round(sd.b - corner);
    if (e - s < minPx) return;
    if (coverAt(m, sd.vertical, sd.pos, s, e, band) < 0.25) return;
    let start: number | null = null;
    for (let t = s; t <= e + 1; t++) {
      const wall = t <= e && coverAt(m, sd.vertical, sd.pos, t, t, band) > 0;
      if (!wall && t <= e) { if (start === null) start = t; continue; }
      if (start !== null) {
        const len = t - start;
        if (len >= minPx && len <= maxPx) out.push({ side: sd.side, from: start - sd.a, to: t - sd.a });
        start = null;
      }
    }
  });
  return out;
}

/** How much of a side of a room has wall along it, 0–1, away from the corners. */
export function sideCover(r: PxRect, side: Side, m: Mask, band: number): number {
  const vertical = side === 'left' || side === 'right';
  const pos = side === 'left' ? r.x : side === 'right' ? r.x + r.w : side === 'top' ? r.y : r.y + r.h;
  const a = vertical ? r.y : r.x, b = vertical ? r.y + r.h : r.x + r.w;
  const corner = band * 2 + 1;
  return coverAt(m, vertical, pos, a + corner, b - corner, band);
}
