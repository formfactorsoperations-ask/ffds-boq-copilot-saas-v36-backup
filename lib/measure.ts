/*
  MEASURE ON THE DRAWING (Design Desk 2.0, Phase 3A).

  A PDF page has a real paper size, in points (72 to the inch). A line drawn
  between two points on it is therefore so many millimetres on paper, and the
  drawing's scale (1 : 20 on its title block) turns that into the real
  length. The scale is set once by hand per drawing: typed from the title
  block, or worked out by drawing along a dimension that is written on the
  drawing and typing what it says. Nothing here reads the title block itself.
*/

const MM_PER_PT = 25.4 / 72;

/** A line between two points, as fractions of the page as it is stored. */
export interface Span { x: number; y: number; x2: number; y2: number }

/** How long a line is on paper, in millimetres, given the page's size in points. */
export function paperMm(s: Span, widthPt: number, heightPt: number): number {
  if (!(widthPt > 0) || !(heightPt > 0)) return 0;
  return Math.hypot((s.x2 - s.x) * widthPt, (s.y2 - s.y) * heightPt) * MM_PER_PT;
}

/** The scales drawings are usually made at: 1 : n. */
export const COMMON_SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200];
export const QUICK_SCALES = [10, 20, 25, 50, 100];

/** A scale a person typed (the n of 1 : n), or null. */
export function cleanScale(raw: unknown): number | null {
  const n = Number(String(raw ?? '').replace(/^\s*1\s*[:/]\s*/, '').trim());
  return Number.isFinite(n) && n >= 0.1 && n <= 5000 ? Math.round(n * 100) / 100 : null;
}

/**
 * The scale that makes a line of `paper` millimetres read as `real`
 * millimetres. A result within 3% of a usual scale is taken as that scale,
 * since a hand-drawn line never lands exactly on the dimension's ends.
 */
export function scaleFromKnown(paper: number, real: number): number | null {
  if (!(paper > 0.5) || !(real > 0)) return null;
  const n = real / paper;
  const near = COMMON_SCALES.find((c) => Math.abs(n - c) / c <= 0.03);
  return cleanScale(near ?? n);
}

/** A real length in words: "845 mm", "1,240 mm (1.24 m)". */
export function lengthLabel(mm: number): string {
  const r = Math.round(mm);
  const text = `${r.toLocaleString('en-IN')} mm`;
  return r >= 1000 ? `${text} (${(r / 1000).toFixed(2)} m)` : text;
}

/** What a measured line reads as: the real length when the scale is known, else its length on paper. */
export function measureLabel(paper: number, scale: number | null | undefined): string {
  return scale ? lengthLabel(paper * scale) : `${Math.round(paper)} mm on paper`;
}
