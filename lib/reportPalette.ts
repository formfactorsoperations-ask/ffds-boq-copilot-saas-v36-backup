/**
 * REPORT PALETTE — one set of colours for every reporting surface.
 *
 * Before this file there were two competing sets. The project report used a
 * muted trio (#0E7C5A / #C77700 / #B4436A) while the Health Check & Audit
 * screen used raw Tailwind defaults (#10B981 / #F59E0B / #EF4444), and the two
 * screens disagreed on the brand blue as well (#0066CC vs #0284C7). The same
 * project could therefore be "green" on one screen and a different green on the
 * other, which quietly undermines the numbers: if the colours are not the same
 * language, neither are the readings.
 *
 * The muted set wins because it sits on milky white without vibrating, and it
 * leaves the brand blue as the loudest colour on the page — which is the point.
 *
 * SEMANTIC, not decorative. GOOD/CAUTION/CRITICAL carry meaning and are never
 * used for ordinary chrome. BRAND is the studio's blue and is the default for
 * neutral data. GOLD is the studio's accent hairline, never a fill.
 */

/* Brand — the only saturated blue in the product. */
export const BRAND       = '#0066CC';
export const BRAND_HOVER = '#0055B3';

/* Studio accent. Hairlines, locks and dashed borders only. */
export const GOLD        = '#B5945B';

/* Semantic. Muted on purpose so a page of them stays readable. */
export const GOOD        = '#0E7C5A';
export const CAUTION     = '#C77700';
export const CRITICAL    = '#B4436A';

/* Neutral data and chrome. */
export const NEUTRAL     = '#64748B';
export const NEUTRAL_DIM = '#94A3B8';
export const TRACK       = '#E9EDF2';

/* Surfaces. Milky white, not pure white — matches the rest of the app. */
export const CREAM       = '#FAF9F6';

/** Score -> colour, shared by every gauge so 70 means the same thing anywhere. */
export const scoreTone = (pct: number): string =>
  pct >= 80 ? GOOD : pct >= 65 ? BRAND : pct >= 50 ? CAUTION : CRITICAL;

/** Tailwind classes for the same three states, for pills and panels. */
export const TONE_CLASS = {
  good:     { text: 'text-emerald-800', bg: 'bg-emerald-50',  border: 'border-emerald-200', dot: 'bg-emerald-600' },
  caution:  { text: 'text-amber-800',   bg: 'bg-amber-50',    border: 'border-amber-200',   dot: 'bg-amber-500' },
  critical: { text: 'text-rose-800',    bg: 'bg-rose-50',     border: 'border-rose-200',    dot: 'bg-rose-500' },
  brand:    { text: 'text-sky-800',     bg: 'bg-sky-50',      border: 'border-sky-200',     dot: 'bg-sky-600' },
} as const;
