import React from 'react';
import type { PieceKind } from '../../types';

/*
  BOQ Playground: how a piece looks from above (the approved mockup's drawings).

  Each kind is drawn around its centre in feet, its back at the top (y = −depth/2)
  and its front at the bottom, so the plan's `place` turns it onto any wall.
  Wood, stone and fabric colours live only inside these drawings: they are the
  materials, not the app's palette.

  The finish comes from the line's spec words (walnut, oak, ash, graphite,
  white), so a line priced in walnut is drawn in walnut.
*/

/** One set of patterns for every drawing on the page. Mount once, hidden. */
export function ArtDefs() {
  const grain = (id: string, base: string, a: string, b: string, wa = 0.035, wb = 0.025) => (
    <pattern id={id} width="3" height=".5" patternUnits="userSpaceOnUse">
      <rect width="3" height=".5" fill={base} />
      <path d="M0 .13Q.8 .06 1.5 .15T3 .11" stroke={a} strokeWidth={wa} fill="none" />
      <path d="M0 .37Q1 .31 1.7 .41T3 .35" stroke={b} strokeWidth={wb} fill="none" />
    </pattern>
  );
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        {grain('pg-w-ash', '#e4d6bf', '#cdbb9c', '#d3c3a6', 0.03, 0.022)}
        {grain('pg-w-oak', '#cba57b', '#ad8556', '#b48d61')}
        {grain('pg-w-walnut', '#7a5436', '#5c3c25', '#674530', 0.04, 0.03)}
        <pattern id="pg-w-graphite" width="3" height=".5" patternUnits="userSpaceOnUse"><rect width="3" height=".5" fill="#4b505a" /><path d="M0 .25H3" stroke="#555a65" strokeWidth=".02" /></pattern>
        <linearGradient id="pg-g-ivory" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7f2e8" /><stop offset=".55" stopColor="#ece4d4" /><stop offset="1" stopColor="#f4eee2" /></linearGradient>
        <pattern id="pg-st-quartz" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><rect width="1.2" height="1.2" fill="#ecebe7" /><circle cx=".2" cy=".3" r=".035" fill="#cfccc4" /><circle cx=".8" cy=".7" r=".03" fill="#d6d3cc" /><circle cx=".55" cy=".15" r=".02" fill="#c7c3ba" /></pattern>
        <pattern id="pg-st-granite" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><rect width="1.2" height="1.2" fill="#2d2f33" /><circle cx=".2" cy=".3" r=".04" fill="#55585e" /><circle cx=".8" cy=".7" r=".035" fill="#4a4d52" /></pattern>
        <linearGradient id="pg-g-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e5e7eb" /><stop offset=".5" stopColor="#c3c8d0" /><stop offset="1" stopColor="#e9ebef" /></linearGradient>
        <pattern id="pg-dots" width="1" height="1" patternUnits="userSpaceOnUse"><circle cx=".5" cy=".5" r=".04" fill="#cfd6e2" /></pattern>
        <pattern id="pg-hatch" width=".4" height=".4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".4" height=".4" fill="#fffbeb" /><path d="M0 0V.4" stroke="#f59e0b" strokeWidth=".06" /></pattern>
        {/* The Civil layer (PR C): a new floor, waterproofing, a wall broken, a wall built. */}
        <pattern id="pg-civ-floor" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#fef3c7" fillOpacity=".8" /><path d="M0 0H2M0 0V2" stroke="#d97706" strokeWidth=".05" strokeOpacity=".7" /></pattern>
        <pattern id="pg-civ-waterproof" width=".6" height=".6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V.6" stroke="#0284c7" strokeWidth=".06" strokeOpacity=".55" /></pattern>
        <pattern id="pg-civ-break" width=".3" height=".3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".3" height=".3" fill="#ffe4e6" /><path d="M0 0V.3" stroke="#e11d48" strokeWidth=".07" /></pattern>
        <pattern id="pg-civ-build" width=".25" height=".25" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width=".25" height=".25" fill="#cbd5e1" /><path d="M0 0V.25" stroke="#334155" strokeWidth=".06" /></pattern>
        <filter id="pg-sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx=".1" dy=".16" stdDeviation=".14" floodColor="#0f172a" floodOpacity=".28" /></filter>
        <filter id="pg-sh2" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx=".05" dy=".08" stdDeviation=".08" floodColor="#0f172a" floodOpacity=".22" /></filter>
      </defs>
    </svg>
  );
}

export interface Finish { fill: string; base: string }

const FINISHES: [RegExp, Finish][] = [
  [/walnut|wenge|dark\s*wood/i, { fill: 'url(#pg-w-walnut)', base: '#7a5436' }],
  [/graphite|charcoal|black|anthracite|dark\s*gr[ae]y/i, { fill: 'url(#pg-w-graphite)', base: '#4b505a' }],
  [/\bash\b|maple|birch|light\s*wood|natural\s*oak|beech/i, { fill: 'url(#pg-w-ash)', base: '#e4d6bf' }],
  [/white|ivory|cream|frosty|off[-\s]?white|lacquer|acrylic|pu\s*finish/i, { fill: 'url(#pg-g-ivory)', base: '#efe8da' }],
  [/oak|teak|veneer|wood/i, { fill: 'url(#pg-w-oak)', base: '#cba57b' }],
];
const DEFAULT_FINISH: Finish = { fill: 'url(#pg-w-oak)', base: '#cba57b' };

/** The finish a line is drawn in, read from its spec words. */
export function finishOf(words: string | undefined | null): Finish {
  const w = words || '';
  for (const [re, f] of FINISHES) if (re.test(w)) return f;
  return DEFAULT_FINISH;
}
const topOf = (words: string | undefined | null) => (/granite|black\s*galaxy/i.test(words || '') ? 'url(#pg-st-granite)' : 'url(#pg-st-quartz)');

const FAB = { linen: '#d6cebd', charcoal: '#5d6169', sand: '#c9b79a' };
const fabricOf = (words: string | undefined | null) => (/charcoal|grey|gray|dark/i.test(words || '') ? FAB.charcoal : FAB.linen);

/** A colour lightened (f > 0) or darkened (f < 0). */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = f < 0 ? 0 : 255, t = Math.abs(f);
  r = Math.round(r + (m - r) * t); g = Math.round(g + (m - g) * t); b = Math.round(b + (m - b) * t);
  return `rgb(${r},${g},${b})`;
}

export interface ArtProps {
  kind: PieceKind;
  /** Width along the back and depth, in feet. */
  w: number;
  d: number;
  /** The line's spec words, for its finish. */
  words?: string | null;
  /** Hung on the wall (an overhead unit, a loft): drawn as a dashed outline, no shadow. */
  high?: boolean;
  /** Not billed: drawn faded. */
  faded?: boolean;
  /** No shadow (thumbnails at small size, room minis). */
  flat?: boolean;
  /** The finish and countertop from the line's materials (S2), over what the words suggest. */
  fill?: string;
  base?: string;
  top?: string;
}

const ED = 'rgba(15,23,42,.5)';
const EW = 0.035;

/** A piece drawn from above, centred on 0,0. */
export function PieceArt({ kind, w: W, d, words, high, faded, flat, fill, base, top: topFill }: ArtProps) {
  const D = Math.max(d, 0.12);
  const x0 = -W / 2, y0 = -D / 2;
  const F = fill ? { fill, base: base || '#c9a37a' } : finishOf(words);
  const topOfLine = (w: string | null | undefined) => topFill || topOf(w);
  const out: React.ReactNode[] = [];
  let k = 0;
  const R = (x: number, y: number, w: number, h: number, fill: string, ex: React.SVGProps<SVGRectElement> = {}) =>
    out.push(<rect key={k++} x={x} y={y} width={Math.max(w, 0.01)} height={Math.max(h, 0.01)} fill={fill} {...ex} />);
  const Ln = (a: number, b: number, c: number, e: number, col = 'rgba(15,23,42,.35)', sw = 0.03, ex: React.SVGProps<SVGLineElement> = {}) =>
    out.push(<line key={k++} x1={a} y1={b} x2={c} y2={e} stroke={col} strokeWidth={sw} {...ex} />);
  const edge = { stroke: ED, strokeWidth: EW };

  switch (kind) {
    case 'wardrobe':
    case 'cabinet': {
      R(x0, y0, W, D, F.fill, { ...edge, rx: 0.04 });
      R(x0, D / 2 - 0.1, W, 0.1, 'rgba(0,0,0,.16)');
      const n = Math.max(kind === 'wardrobe' ? 2 : 1, Math.round(W / (kind === 'wardrobe' ? 1.6 : 1.4)));
      for (let i = 1; i < n; i++) Ln(x0 + (W * i) / n, y0 + 0.05, x0 + (W * i) / n, D / 2);
      for (let i = 0; i < n; i++) {
        const cx = x0 + (W * (i + 0.5)) / n + (i % 2 ? -0.18 : 0.18) * (W / n > 1 ? 1 : 0.5);
        R(cx - 0.04, D / 2 - 0.2, 0.08, 0.12, 'rgba(15,23,42,.55)', { rx: 0.02 });
      }
      Ln(x0 + 0.05, y0 + 0.06, x0 + W - 0.05, y0 + 0.06, 'rgba(255,255,255,.45)', 0.04);
      if (kind === 'wardrobe') Ln(x0 + 0.2, 0, x0 + W - 0.2, 0, 'rgba(15,23,42,.25)', 0.025, { strokeDasharray: '.14 .1' });
      break;
    }
    case 'tv':
      R(x0, y0, W, D, F.fill, { ...edge, rx: 0.04 });
      R(x0, D / 2 - 0.09, W, 0.09, 'rgba(0,0,0,.16)');
      Ln(0, y0 + 0.1, 0, D / 2);
      R(-W * 0.4, y0 + 0.04, W * 0.8, 0.13, '#1f2937', { rx: 0.05 });
      break;
    case 'panel':
      R(x0, y0, W, D, F.fill, edge);
      for (let x = x0 + 0.18; x < W / 2; x += 0.25) Ln(x, y0, x, D / 2, 'rgba(15,23,42,.25)', 0.02);
      break;
    case 'bed': {
      const fab = fabricOf(words);
      R(x0, y0, W, D, 'url(#pg-w-oak)', { ...edge, rx: 0.12 });
      R(x0, y0, W, 0.42, shade('#c9a37a', -0.25), { rx: 0.08 });
      R(x0 + 0.14, y0 + 0.45, W - 0.28, D - 0.6, '#fbfaf6', { rx: 0.18 });
      const pw = (W - 0.62) / 2;
      const pillow = { rx: 0.3, stroke: 'rgba(15,23,42,.15)', strokeWidth: 0.025 };
      R(x0 + 0.24, y0 + 0.6, pw, 0.95, '#ffffff', pillow);
      R(x0 + 0.38 + pw, y0 + 0.6, pw, 0.95, '#ffffff', pillow);
      R(x0 + 0.1, y0 + D * 0.38, W - 0.2, D * 0.62 - 0.2, fab, { rx: 0.16 });
      R(x0 + 0.1, y0 + D * 0.38, W - 0.2, 0.32, shade(fab, 0.25), { rx: 0.12 });
      break;
    }
    case 'sofa': {
      const fab = fabricOf(words);
      const dk = shade(fab, -0.22);
      R(x0, y0, W, D, dk, { rx: 0.35 });
      R(x0, y0, W, 0.85, shade(fab, -0.1), { rx: 0.3 });
      R(x0, y0, 0.62, D, dk, { rx: 0.28 });
      R(W / 2 - 0.62, y0, 0.62, D, dk, { rx: 0.28 });
      const n = 3, sw = (W - 1.24) / n;
      for (let i = 0; i < n; i++) R(x0 + 0.62 + i * sw + 0.03, y0 + 0.85, sw - 0.06, D - 1, fab, { rx: 0.18 });
      break;
    }
    case 'dtable': {
      for (let i = 0; i < 3; i++) {
        const x = x0 + (W * (i + 0.5)) / 3;
        R(x - 0.42, y0 - 0.75, 0.84, 0.62, FAB.sand, { rx: 0.2 });
        R(x - 0.42, D / 2 + 0.13, 0.84, 0.62, FAB.sand, { rx: 0.2 });
      }
      R(x0, y0, W, D, 'url(#pg-w-oak)', { ...edge, rx: 0.2 });
      break;
    }
    case 'desk':
      out.push(<circle key={k++} cx={0} cy={D / 2 + 0.75} r={0.55} fill={FAB.charcoal} opacity={0.9} />);
      R(x0, y0, W, D, F.fill, { ...edge, rx: 0.05 });
      R(x0, y0, W, 0.35, shade(F.base, -0.15));
      R(-0.55, -0.2, 1.1, 0.75, '#334155', { rx: 0.06 });
      break;
    case 'base': {
      R(x0, y0, W, D, topOfLine(words), edge);
      R(x0, D / 2 - 0.12, W, 0.12, F.base);
      if (W >= 3) {
        const sx = x0 + Math.min(W * 0.3, W - 1);
        R(sx - 0.75, y0 + 0.35, 1.5, 1.1, 'url(#pg-g-steel)', { rx: 0.18, stroke: 'rgba(15,23,42,.3)', strokeWidth: 0.025 });
      }
      if (W >= 5) {
        const hx = x0 + W * 0.72;
        R(hx - 0.85, y0 + 0.3, 1.7, 1.2, '#1f2937', { rx: 0.1 });
        [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.3], [0.4, 0.3]].forEach(([a, b]) =>
          out.push(<circle key={k++} cx={hx + a} cy={y0 + 0.9 + b} r={0.2} fill="none" stroke="#6b7280" strokeWidth={0.05} />));
      }
      break;
    }
    case 'wallunit':
    case 'loft': {
      const dash = { strokeDasharray: '.2 .15' };
      R(x0, y0, W, D, F.base, { fillOpacity: 0.3, stroke: shade(F.base, -0.45), strokeWidth: 0.04, strokeDasharray: '.25 .15' });
      Ln(x0, y0, W / 2, D / 2, 'rgba(15,23,42,.25)', 0.025, dash);
      Ln(W / 2, y0, x0, D / 2, 'rgba(15,23,42,.25)', 0.025, dash);
      break;
    }
    case 'vanity':
      R(x0, y0, W, D, topOfLine(words), { ...edge, rx: 0.08 });
      out.push(<ellipse key={k++} cx={0} cy={0.05} rx={Math.min(0.7, W * 0.3)} ry={D * 0.3} fill="#fff" stroke="rgba(15,23,42,.3)" strokeWidth={0.03} />);
      break;
    case 'glass':
      R(x0, y0, W, D, 'rgba(186,206,230,.6)', { stroke: '#94a3b8', strokeWidth: 0.03 });
      break;
    default:
      R(x0, y0, W, D, 'url(#pg-hatch)', { stroke: '#d97706', strokeWidth: 0.05 });
  }
  const isHigh = high ?? (kind === 'wallunit' || kind === 'loft');
  return (
    <g filter={!isHigh && !flat ? 'url(#pg-sh)' : undefined} opacity={faded && !flat ? 0.82 : undefined}>
      {out}
    </g>
  );
}

/** A small picture of a piece, for the library, the Live BOQ and the Sheet. */
export function PieceThumb({ kind, w, d, words, fill, base, top, className = 'w-full h-14' }: Omit<ArtProps, 'flat'> & { className?: string }) {
  const D = Math.max(d, 0.12);
  const pad = Math.max(w, D) * 0.1 + 0.35;
  const ex = kind === 'desk' ? 1.5 : kind === 'dtable' ? 0.85 : 0;
  const above = kind === 'dtable' ? 0.85 : 0;
  return (
    <svg className={className} viewBox={`${-w / 2 - pad} ${-D / 2 - pad - above} ${w + pad * 2} ${D + pad * 2 + ex + above}`} preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      <PieceArt kind={kind} w={w} d={D} words={words} fill={fill} base={base} top={top} />
    </svg>
  );
}

/**
 * A line's look from its materials: the outer finish's pattern and the
 * countertop's. A finish shown in a shade of its range (PR M) is drawn in that
 * shade's colour; `hexOf` gives it.
 */
export function artOfSpecs<S extends { id: string; shade?: string }>(
  specs: Record<string, S> | null | undefined,
  materials: { id: string; fam: string; swatch?: string; base?: string }[] | null | undefined,
  hexOf?: (spec: S) => string | undefined,
): { fill?: string; base?: string; top?: string } {
  if (!specs || !materials) return {};
  const out: { fill?: string; base?: string; top?: string } = {};
  Object.values(specs).forEach(s => {
    const m = materials.find(x => x.id === s.id);
    if (!m?.swatch) return;
    const hex = hexOf?.(s);
    if (m.fam === 'top') out.top = hex || `url(#${m.swatch})`;
    else if (!out.fill) { out.fill = hex || `url(#${m.swatch})`; out.base = hex || m.base; }
  });
  return out;
}
