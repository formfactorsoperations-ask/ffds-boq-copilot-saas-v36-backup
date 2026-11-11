import React from "react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  Transition,
} from "framer-motion";

// Liquid Glass Flip Card
// True optical liquid-glass slab with shared Snell's-law convex bevel displacement map,
// thick inner meniscus highlights, diagonal specular sheen, interactive pointer reflection,
// prism edge flare at 90°, and smooth 60fps spring flip physics.

const RAD = Math.PI / 180;

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

const clamp01 = (value: number) => clamp(value, 0, 1);

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const num = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Signed angle of the visible half-turn in [-90, 90]. The card is never seen from behind. */
const halfTurn = (turn: number) => turn - 180 * Math.round(turn / 180);
const sideOf = (turn: number): "front" | "back" =>
  Math.abs(Math.round(turn / 180)) % 2 === 0 ? "front" : "back";
const edgeOf = (turn: number) => Math.abs(Math.sin(halfTurn(turn) * RAD));

/** CSS box shorthand (1–4 values) → [top, right, bottom, left]. */
function boxSides(
  value: number | string | undefined,
  fallback: string,
): [string, string, string, string] {
  const raw =
    typeof value === "number"
      ? `${value}px`
      : String(value ?? "").trim() || fallback;
  const parts = raw.split(/\s+/).filter(Boolean);
  const [top, right = top, bottom = top, left = right] = parts;
  return [top, right, bottom, left];
}

// ── Shared Snell's-law convex squircle bevel displacement map (computed once) ──
const LENS_SVG_ID = "lgf-shared-lens-svg";
const LENS_FILTER_ID = "lgf-shared-liquid-lens";

function buildSharedBevelMap() {
  if (typeof document === "undefined") return null;
  const w = 180;
  const h = 210;
  const r = 20;
  const b = 26;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(w, h);
  const data = image.data;

  // 128-step Snell's-law deflection table across a convex quarter-circle bevel
  const samples = 128;
  const profile = new Float32Array(samples);
  let peak = 0.0001;
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const edge = 1 - u;
    const z = Math.pow(Math.max(0, 1 - edge * edge), 0.25);
    const slope =
      (-0.5 * edge) / Math.max(0.06, Math.pow(1 - edge * edge, 0.75));
    const angle = Math.atan(Math.abs(slope));
    const refracted = Math.asin(Math.min(0.98, Math.sin(angle) / 1.5));
    const shift = Math.tan(angle - refracted) * z;
    profile[i] = shift;
    if (shift > peak) peak = shift;
  }
  for (let i = 0; i < samples; i++) profile[i] /= peak;

  const halfW = w / 2;
  const halfH = h / 2;
  const innerW = halfW - r;
  const innerH = halfH - r;

  for (let py = 0; py < h; py++) {
    const dy = py + 0.5 - halfH;
    const ay = Math.abs(dy) - innerH;
    for (let px = 0; px < w; px++) {
      const dx = px + 0.5 - halfW;
      const ax = Math.abs(dx) - innerW;
      const outside = Math.hypot(Math.max(ax, 0), Math.max(ay, 0));
      const inside = Math.min(Math.max(ax, ay), 0);
      const sdf = outside + inside - r;
      let vx = 0;
      let vy = 0;
      if (sdf < 0 && sdf > -b) {
        const u = clamp01(-sdf / b);
        const mag = profile[Math.min(samples - 1, (u * (samples - 1)) | 0)];
        let nx = 0;
        let ny = 0;
        if (ax > 0 && ay > 0) {
          const len = Math.hypot(ax, ay) || 1;
          nx = (dx < 0 ? -ax : ax) / len;
          ny = (dy < 0 ? -ay : ay) / len;
        } else if (ax > ay) {
          nx = dx < 0 ? -1 : 1;
        } else {
          ny = dy < 0 ? -1 : 1;
        }
        vx = -nx * mag;
        vy = -ny * mag;
      }
      const index = (py * w + px) * 4;
      data[index] = clamp(Math.round(128 + vx * 127), 0, 255);
      data[index + 1] = clamp(Math.round(128 + vy * 127), 0, 255);
      data[index + 2] = 128;
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return { url: canvas.toDataURL("image/png"), w, h };
}

function ensureLiquidLensInjected() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LENS_SVG_ID)) return;
  const map = buildSharedBevelMap();
  if (!map) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.id = LENS_SVG_ID;
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute(
    "style",
    "position:fixed;width:0;height:0;pointer-events:none;overflow:hidden",
  );

  const defs = document.createElementNS(svgNS, "defs");
  const filter = document.createElementNS(svgNS, "filter");
  filter.id = LENS_FILTER_ID;
  filter.setAttribute("x", "-12%");
  filter.setAttribute("y", "-12%");
  filter.setAttribute("width", "124%");
  filter.setAttribute("height", "124%");
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const feGaussian = document.createElementNS(svgNS, "feGaussianBlur");
  feGaussian.setAttribute("in", "SourceGraphic");
  feGaussian.setAttribute("stdDeviation", "12");
  feGaussian.setAttribute("result", "blurred");

  const feImage = document.createElementNS(svgNS, "feImage");
  feImage.setAttribute("href", map.url);
  feImage.setAttribute("x", "0");
  feImage.setAttribute("y", "0");
  feImage.setAttribute("width", "100%");
  feImage.setAttribute("height", "100%");
  feImage.setAttribute("preserveAspectRatio", "none");
  feImage.setAttribute("result", "lensMap");

  const feDisp = document.createElementNS(svgNS, "feDisplacementMap");
  feDisp.setAttribute("in", "blurred");
  feDisp.setAttribute("in2", "lensMap");
  feDisp.setAttribute("scale", "26");
  feDisp.setAttribute("xChannelSelector", "R");
  feDisp.setAttribute("yChannelSelector", "G");
  feDisp.setAttribute("result", "refracted");

  const feColor = document.createElementNS(svgNS, "feColorMatrix");
  feColor.setAttribute("in", "refracted");
  feColor.setAttribute("type", "saturate");
  feColor.setAttribute("values", "1.45");

  filter.appendChild(feGaussian);
  filter.appendChild(feImage);
  filter.appendChild(feDisp);
  filter.appendChild(feColor);
  defs.appendChild(filter);
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

const STYLE_ELEMENT_ID = "lgf-shared-styles";

const styles = `
.lgf{position:relative;box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-tap-highlight-color:transparent}
.lgf *,.lgf *::before,.lgf *::after{box-sizing:border-box}
.lgf a,.lgf img{-webkit-user-drag:none}
.lgf-stage{position:relative;display:grid;width:100%;height:100%}
.lgf-card{position:relative;display:grid;grid-template:minmax(0,1fr)/minmax(0,1fr);width:100%;height:100%;border-radius:var(--lgf-radius);color:var(--lgf-text);transform-origin:50% 50%;-webkit-tap-highlight-color:transparent;touch-action:pan-y;outline:none;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.lgf[data-axis=vertical] .lgf-card{touch-action:pan-x}
.lgf[data-live=true][data-trigger=click] .lgf-card{cursor:pointer}
.lgf[data-live=true][data-dragging=true] .lgf-card{cursor:grabbing}
.lgf-body{position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.lgf[data-shadow=soft] .lgf-body,.lgf[data-shadow=prism] .lgf-body{box-shadow:0 2px 4px rgba(15,23,42,.04),0 12px 28px -8px rgba(15,23,42,.08),0 28px 56px -16px rgba(61,82,160,.14),0 0 0 1px rgba(255,255,255,.75)}
.lgf-surface{position:absolute;inset:0;overflow:hidden;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,.52) 0%,rgba(255,255,255,.22) 38%,rgba(255,255,255,.14) 64%,rgba(255,255,255,.44) 100%)}
.lgf[data-surface=dark] .lgf-surface{background:linear-gradient(155deg,rgba(255,255,255,.15),rgba(255,255,255,.03) 48%,rgba(255,255,255,.09))}
.lgf-layer{position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.lgf-tint{background:var(--lgf-tint);opacity:var(--lgf-tint-alpha)}
.lgf-shoulder{box-shadow:inset 0 2px 1.5px rgba(255,255,255,1),inset 0 -2px 2px rgba(255,255,255,.82),inset 2px 0 2px rgba(255,255,255,.88),inset -2px 0 2px rgba(255,255,255,.65),inset 0 22px 38px -18px rgba(255,255,255,.78),inset 0 -24px 40px -22px rgba(61,82,160,.09),inset 0 0 18px rgba(255,255,255,.45)}
.lgf[data-surface=dark] .lgf-shoulder{box-shadow:inset 0 1.5px 1.5px rgba(255,255,255,.65),inset 0 -1px 1px rgba(255,255,255,.22),inset 1px 0 1px rgba(255,255,255,.28),inset -1px 0 1px rgba(255,255,255,.14),inset 0 26px 40px -34px rgba(255,255,255,.42),inset 0 -30px 44px -36px rgba(0,0,0,.46)}
.lgf-bezel{background:radial-gradient(115% 85% at 12% 6%,rgba(255,255,255,.82) 0%,rgba(255,255,255,.22) 32%,rgba(255,255,255,0) 58%),linear-gradient(128deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,0) 36%,rgba(255,255,255,0) 68%,rgba(255,255,255,.38) 100%),radial-gradient(95% 75% at 90% 94%,rgba(99,102,241,.08) 0%,rgba(99,102,241,0) 58%)}
.lgf-band{position:absolute;top:-35%;bottom:-35%;left:-60%;width:220%;pointer-events:none;will-change:transform,opacity;background:linear-gradient(104deg,rgba(255,255,255,0) 36%,rgba(255,255,255,.18) 41%,rgba(255,255,255,.65) 46.5%,rgba(255,255,255,.95) 48.6%,rgba(255,255,255,.35) 52%,rgba(255,255,255,0) 58%)}
.lgf-fresnel{background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(255,255,255,.24) 52%,rgba(255,255,255,.62))}
.lgf-rim{position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask-composite:exclude}
.lgf-face{grid-area:1/1;position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;padding:var(--lgf-padding);border-radius:inherit;will-change:opacity,transform}
.lgf-face[data-active=false]{pointer-events:none}
a.lgf-face{color:inherit;text-decoration:none;outline:none;-webkit-user-drag:none}
.lgf[data-live=true] a.lgf-face{cursor:pointer}
a.lgf-face:focus-visible{outline:2px solid var(--lgf-focus);outline-offset:4px}
.lgf[data-reduced=true] .lgf-face{transition:opacity .32s ease}
.lgf-top{display:flex;align-items:center;min-width:0;min-height:40px;padding-right:52px}
.lgf-main{display:flex;flex-direction:column;align-items:flex-start;gap:12px;min-width:0;margin-top:auto;padding-top:28px}
.lgf-eyebrow{display:inline-flex;align-items:center;max-width:100%;height:28px;padding:0 12px;overflow:hidden;border-radius:999px;font-size:12px;line-height:1;font-weight:500;letter-spacing:.01em;white-space:nowrap;text-overflow:ellipsis;color:var(--lgf-soft);background:var(--lgf-chip);box-shadow:inset 0 1px 0 var(--lgf-chip-hi),inset 0 -1px 0 var(--lgf-chip-lo)}
.lgf-title{margin:0;max-width:100%;white-space:pre-line;overflow-wrap:break-word;text-wrap:balance;color:var(--lgf-text);text-shadow:var(--lgf-text-shadow)}
.lgf-text{margin:0;max-width:100%;white-space:pre-line;overflow-wrap:break-word;text-wrap:pretty;color:var(--lgf-soft);text-shadow:var(--lgf-text-shadow)}
.lgf-cta-line{display:flex;max-width:100%}
.lgf-cta{position:relative;display:inline-flex;align-items:center;gap:10px;max-width:100%;height:44px;margin:4px 0 0;padding:0 16px 0 20px;border:0;border-radius:999px;font:inherit;font-weight:500;line-height:1;letter-spacing:-.005em;white-space:nowrap;color:var(--lgf-text);text-decoration:none;background:var(--lgf-chip);box-shadow:inset 0 1px 0 var(--lgf-chip-hi),inset 0 -1px 0 var(--lgf-chip-lo),0 10px 22px -12px rgba(0,0,0,.45);-webkit-tap-highlight-color:transparent;transition:background-color .25s ease}
.lgf-cta-label{overflow:hidden;text-overflow:ellipsis}
.lgf-cta[data-kind=link],.lgf-cta[data-kind=button]{cursor:pointer}
.lgf-cta[data-kind=none],.lgf-cta[data-kind=card]{cursor:inherit}
.lgf-cta:focus-visible{outline:2px solid var(--lgf-focus);outline-offset:3px}
.lgf-cta-icon{display:block;flex-shrink:0;width:16px;height:16px;transition:transform .4s cubic-bezier(.2,.8,.2,1)}
.lgf-flip{position:absolute;z-index:30;top:var(--lgf-pt);right:var(--lgf-pr);display:grid;place-items:center;width:36px;height:36px;margin:0;padding:0;border:1px solid rgba(255,255,255,.92);border-radius:999px;font:inherit;color:#334155;background:linear-gradient(135deg,rgba(255,255,255,.72) 0%,rgba(255,255,255,.36) 100%);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:inset 0 1.5px 1px rgba(255,255,255,1),inset 0 -1px 1px rgba(148,163,184,.2),0 6px 16px -4px rgba(15,23,42,.12);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:background-color .2s ease,opacity .2s ease,transform .2s ease,box-shadow .2s ease,color .2s ease}
.lgf-flip:hover{transform:scale(1.08);color:#3D52A0;box-shadow:inset 0 1.5px 1px rgba(255,255,255,1),0 8px 20px -4px rgba(61,82,160,.22)}
.lgf-flip svg{display:block;width:15px;height:15px;pointer-events:none}
.lgf-flip:focus-visible{outline:2px solid var(--lgf-focus);outline-offset:3px}
.lgf[data-flip-button=false] .lgf-flip{opacity:0}
.lgf[data-flip-button=false] .lgf-flip:focus-visible{opacity:1}
.lgf[data-live=false] .lgf-flip{cursor:default}
@media (hover:hover) and (pointer:fine){
  .lgf[data-live=true] .lgf-flip:hover,.lgf-cta[data-kind=link]:hover,.lgf-cta[data-kind=button]:hover,.lgf[data-live=true] a.lgf-face:hover .lgf-cta{background:var(--lgf-chip-hover)}
  .lgf-cta[data-kind=link]:hover .lgf-cta-icon,.lgf-cta[data-kind=button]:hover .lgf-cta-icon,.lgf[data-live=true] a.lgf-face:hover .lgf-cta-icon{transform:translateX(3px)}
}
.lgf-slot{position:relative;display:flex;flex:1;min-width:0;min-height:0}
.lgf-slot>*{flex:1;min-width:0;min-height:0}
.lgf-deco{position:absolute;left:50%;top:50%;pointer-events:none;-webkit-user-select:none;user-select:none}
.lgf[data-live=true] .lgf-deco{will-change:transform,opacity}
.lgf-edge{opacity:0;border-radius:999px;overflow:hidden;-webkit-mask:linear-gradient(180deg,transparent,#000 14%,#000 86%,transparent);mask:linear-gradient(180deg,transparent,#000 14%,#000 86%,transparent);background:linear-gradient(90deg,rgba(255,255,255,.88),rgba(255,255,255,.28) 30%,rgba(255,255,255,.18) 50%,rgba(255,255,255,.32) 70%,rgba(255,255,255,.92))}
.lgf-edge-spectrum{position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,70,130,0),rgba(255,122,84,.92) 17%,rgba(255,232,128,.92) 33%,#fff 50%,rgba(96,222,255,.92) 67%,rgba(142,112,255,.92) 83%,rgba(170,92,255,0))}
.lgf[data-axis=vertical] .lgf-edge{-webkit-mask:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);mask:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(255,255,255,.28) 30%,rgba(255,255,255,.18) 50%,rgba(255,255,255,.32) 70%,rgba(255,255,255,.92))}
.lgf[data-axis=vertical] .lgf-edge-spectrum{background:linear-gradient(180deg,rgba(255,70,130,0),rgba(255,122,84,.92) 17%,rgba(255,232,128,.92) 33%,#fff 50%,rgba(96,222,255,.92) 67%,rgba(142,112,255,.92) 83%,rgba(170,92,255,0))}
.lgf-flare{opacity:0;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(120,200,255,.26) 28%,rgba(255,255,255,.88) 50%,rgba(255,150,200,.26) 72%,rgba(255,255,255,0));-webkit-mask:linear-gradient(180deg,transparent,#000 22%,#000 78%,transparent);mask:linear-gradient(180deg,transparent,#000 22%,#000 78%,transparent)}
.lgf[data-axis=vertical] .lgf-flare{background:linear-gradient(180deg,rgba(255,255,255,0),rgba(120,200,255,.26) 28%,rgba(255,255,255,.88) 50%,rgba(255,150,200,.26) 72%,rgba(255,255,255,0));-webkit-mask:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)}
.lgf-ground{top:100%}
.lgf-shadow{background:radial-gradient(closest-side,rgba(15,23,42,.15),rgba(61,82,160,.05) 55%,rgba(15,23,42,0))}
.lgf-caustic{background:linear-gradient(90deg,rgba(255,80,120,0) 4%,rgba(255,110,90,.75) 20%,rgba(255,214,102,.8) 36%,rgba(120,240,170,.75) 52%,rgba(80,200,255,.8) 68%,rgba(150,110,255,.75) 84%,rgba(190,90,255,0) 96%);-webkit-mask:radial-gradient(closest-side,#000 0%,rgba(0,0,0,.55) 45%,transparent 100%);mask:radial-gradient(closest-side,#000 0%,rgba(0,0,0,.55) 45%,transparent 100%)}
@media (prefers-reduced-transparency:reduce){
  .lgf .lgf-surface{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgba(255,255,255,.92)!important}
}
@media (forced-colors:active){
  .lgf-card{border:2px solid CanvasText}
  .lgf-body,.lgf-deco{display:none}
  .lgf-flip,.lgf-cta{border:1px solid ButtonText}
}
`;

function ensureStylesInjected() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing) {
    existing.textContent = styles;
    return;
  }
  const styleEl = document.createElement("style");
  styleEl.id = STYLE_ELEMENT_ID;
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

function useSlotReveal(
  presence: ReturnType<typeof useTransform<number, number>>,
  staged: boolean,
) {
  const opacity = useTransform(presence, (p) =>
    staged ? smooth(0.02, 0.55, p) : p > 0 ? 1 : 0,
  );
  const y = useTransform(opacity, (o) => (staged ? (1 - o) * 6 : 0));
  return { opacity, y };
}

function useReveal(
  presence: ReturnType<typeof useTransform<number, number>>,
  index: number,
  staged: boolean,
) {
  const opacity = useTransform(presence, (p) =>
    staged ? smooth(0, 1, (p - 0.12 - 0.1 * index) / 0.48) : 1,
  );
  const y = useTransform(opacity, (o) => (staged ? (1 - o) * 8 : 0));
  return { opacity, y };
}

function SlotFill({ node }: { node: React.ReactNode }) {
  const child = React.Children.toArray(node)[0];
  if (!React.isValidElement(child)) return null;
  const element = child as React.ReactElement<{ style?: React.CSSProperties }>;
  return React.cloneElement(element, {
    style: { ...(element.props.style || {}), width: "100%", height: "100%" },
  });
}

const FlipIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M19.5 10.5A7.6 7.6 0 0 0 6.1 6.6L4.5 8.2" />
    <path d="M4.5 3.9v4.3h4.3" />
    <path d="M4.5 13.5a7.6 7.6 0 0 0 13.4 3.9l1.6-1.6" />
    <path d="M19.5 20.1v-4.3h-4.3" />
  </svg>
);

const ArrowIcon = () => (
  <svg
    className="lgf-cta-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export interface LiquidGlassOptics {
  blur?: number;
  depth?: number;
  refraction?: number;
  dispersion?: number;
  light?: number;
}

export interface LiquidGlassFlipCardProps {
  frontEyebrow?: string;
  frontTitle?: string;
  frontText?: string;
  frontLayer?: React.ReactNode;
  backEyebrow?: string;
  backTitle?: string;
  backText?: string;
  buttonLabel?: string;
  link?: string;
  newTab?: boolean;
  linkArea?: "card" | "button";
  backLayer?: React.ReactNode;
  startSide?: "front" | "back";
  trigger?: "hover" | "click";
  drag?: boolean;
  axis?: "horizontal" | "vertical";
  flipTransition?: Transition;
  liquidity?: number;
  tilt?: number;
  flipButton?: boolean;
  surface?: "light" | "dark";
  material?: "clear" | "frosted" | "tinted";
  tint?: string;
  textColor?: string;
  titleFont?: React.CSSProperties;
  bodyFont?: React.CSSProperties;
  radius?: number | string;
  padding?: number | string;
  optics?: LiquidGlassOptics;
  shadow?: "prism" | "soft" | "none";
  onFlip?: (nextSide: "front" | "back") => void;
  onButtonTap?: () => void;
  focusColor?: string;
  style?: React.CSSProperties;
  className?: string;
  ariaLabel?: string;
}

export default function LiquidGlassFlipCard(props: LiquidGlassFlipCardProps) {
  const {
    frontEyebrow = "01 — Vision",
    frontTitle = "Crafted\nwith light",
    frontText = "",
    frontLayer,
    backEyebrow = "01 — Vision",
    backTitle = "",
    backText = "Every edge bends the scene behind it. Every turn sends a band of light across the glass.",
    buttonLabel = "Learn more",
    link = "",
    newTab = false,
    linkArea = "card",
    backLayer,
    startSide = "front",
    trigger = "click",
    drag = true,
    axis = "horizontal",
    liquidity = 40,
    tilt = 50,
    flipButton = true,
    surface = "light",
    material = "clear",
    tint = "#FFFFFF",
    textColor,
    titleFont = {},
    bodyFont = {},
    radius = "24px",
    padding = "20px",
    optics = {},
    shadow = "prism",
    onFlip,
    onButtonTap,
    focusColor = "#3D52A0",
    style,
    className = "",
    ariaLabel,
  } = props;

  React.useEffect(() => {
    ensureStylesInjected();
    ensureLiquidLensInjected();
  }, []);

  const prefersReduced = useReducedMotion();
  const reduced = !!prefersReduced;
  const live = true;
  const vertical = axis === "vertical";
  const hoverMode = trigger === "hover";

  const dragAllowed = (pointerType: string) =>
    live && drag && (!hoverMode || pointerType !== "mouse");

  const trimmedLink = typeof link === "string" ? link.trim() : "";
  const cardLink = !!trimmedLink && hoverMode && linkArea !== "button";

  const blur =
    clamp(num(optics.blur, 14), 0, 32) + (material === "frosted" ? 6 : 0);
  const depth = clamp(num(optics.depth, 28), 6, 60);
  const dispersion = clamp01(num(optics.dispersion, 55) / 100);
  const light = clamp01(num(optics.light, 90) / 100);
  const tiltMax = 5.5 * clamp01(num(tilt, 50) / 100);
  const gel = clamp01(num(liquidity, 40) / 100);
  const thickness = clamp(Math.round(depth * 0.4), 6, 18);

  const radiusCSS =
    typeof radius === "number"
      ? `${Math.max(0, radius)}px`
      : String(radius || "24px");
  const paddingCSS =
    typeof padding === "number"
      ? `${Math.max(0, padding)}px`
      : String(padding || "20px");
  const [padTop, padRight] = boxSides(paddingCSS, "20px");

  // ── Flip state ────────────────────────────────────────────────────────────
  const startTurn = startSide === "back" ? 180 : 0;
  const turn = useMotionValue(startTurn);
  const homeRef = React.useRef(startTurn);
  const targetRef = React.useRef(startTurn);
  const animationRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const [side, setSide] = React.useState<"front" | "back">(startSide);
  const sideRef = React.useRef<"front" | "back">(startSide);
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    animationRef.current?.stop();
    turn.jump(startTurn);
    homeRef.current = startTurn;
    targetRef.current = startTurn;
    sideRef.current = startSide;
    setSide(startSide);
  }, [startTurn, startSide, turn]);

  React.useEffect(() => () => animationRef.current?.stop(), []);

  useMotionValueEvent(turn, "change", (value) => {
    const next = sideOf(value);
    if (next !== sideRef.current) {
      sideRef.current = next;
      setSide(next);
    }
  });

  const settle = React.useCallback(
    (target: number) => {
      if (Math.abs(target) >= 3600) {
        const wrapped = target % 360;
        turn.jump(wrapped);
        targetRef.current = wrapped;
        homeRef.current = ((homeRef.current % 360) + 360) % 360;
      }
    },
    [turn],
  );

  const runTo = React.useCallback(
    (target: number, velocity?: number) => {
      animationRef.current?.stop();
      if (!live || reduced) {
        turn.jump(target);
        settle(target);
        return;
      }
      animationRef.current = animate(turn, target, {
        type: "spring",
        stiffness: 64,
        damping: 14,
        mass: 0.9,
        ...(typeof velocity === "number" && Number.isFinite(velocity)
          ? { velocity }
          : {}),
        onComplete: () => settle(target),
      });
    },
    [live, reduced, settle, turn],
  );

  const flip = React.useCallback(
    (direction: number) => {
      const next = targetRef.current + 180 * direction;
      targetRef.current = next;
      runTo(next);
      onFlip?.(sideOf(next));
    },
    [runTo, onFlip],
  );

  // ── Geometry ──────────────────────────────────────────────────────────────
  const stageRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 360, h: 420 });
  const span = vertical ? size.h : size.w;
  const perspective = clamp((span || 360) * 3.2, 1000, 2600);
  const geometry = React.useRef({ w: 360, h: 420, perspective: 1150 });
  geometry.current = {
    w: size.w || 360,
    h: size.h || 420,
    perspective,
  };

  React.useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    let frame = 0;
    const apply = (w: number, h: number) => {
      if (!w || !h) return;
      setSize((previous) =>
        previous.w === w && previous.h === h ? previous : { w, h },
      );
    };
    /*
      The size comes from the observer, which reports it as soon as the card is
      first laid out and on every change after.

      It used to be read straight away on mount as well, with offsetWidth. On a
      screen mounting forty of these, each read forced the whole page through
      layout while the next card was still being added -- a quarter of a second
      of forced layouts on the Projects screen. The observer's box size needs
      no layout at all, and is applied a frame later as before.
    */
    if (typeof ResizeObserver === "undefined") {
      apply(element.offsetWidth, element.offsetHeight);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.borderBoxSize?.[0];
      const w = box ? Math.round(box.inlineSize) : element.offsetWidth;
      const h = box ? Math.round(box.blockSize) : element.offsetHeight;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apply(w, h));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const cornerRadius = parseFloat(radiusCSS) || 24;

  // ── Motion graph ──────────────────────────────────────────────────────────
  const half = useTransform(turn, halfTurn);
  const edge = useTransform(turn, edgeOf);
  const velocity = useVelocity(turn);
  const squashTarget = useTransform(velocity, (v) =>
    clamp(Math.abs(v) / 1200, 0, 1),
  );
  const squash = useSpring(squashTarget, {
    stiffness: 280,
    damping: 18,
    mass: 0.65,
  });
  const press = useSpring(0, { stiffness: 480, damping: 32, mass: 0.55 });
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const px = useSpring(rawX, { stiffness: 180, damping: 24, mass: 0.6 });
  const py = useSpring(rawY, { stiffness: 180, damping: 24, mass: 0.6 });
  const engage = useSpring(0, { stiffness: 150, damping: 22, mass: 0.7 });

  const cardTransform = useTransform(
    [half, edge, px, py, engage, squash, press],
    ([d, e, x, y, h, q, p]: number[]) => {
      const face = 1 - e;
      const tx = -y * h * tiltMax * face;
      const ty = x * h * tiltMax * face;
      const lift = h * face * 6;
      const along = 1 + 0.038 * gel * q - 0.01 * p;
      const across = 1 - 0.018 * gel * q - 0.01 * p;
      const depthStr = `perspective(${geometry.current.perspective.toFixed(1)}px)`;
      return vertical
        ? `${depthStr} translateZ(${lift.toFixed(2)}px) rotateX(${(-d + tx).toFixed(3)}deg) rotateY(${ty.toFixed(3)}deg) scale3d(${along.toFixed(4)}, ${across.toFixed(4)}, 1)`
        : `${depthStr} translateZ(${lift.toFixed(2)}px) rotateX(${tx.toFixed(3)}deg) rotateY(${(d + ty).toFixed(3)}deg) scale3d(${across.toFixed(4)}, ${along.toFixed(4)}, 1)`;
    },
  );

  // The glass edge, drawn in screen space at the projected leading edge of the slab.
  const edgeTransform = useTransform(
    [half, squash],
    ([d, q]: number[]) => {
      const { w, h, perspective: p } = geometry.current;
      const s = Math.abs(Math.sin(d * RAD));
      const c = Math.cos(d * RAD);
      const extent = vertical ? h : w;
      const k = p / Math.max(1, p - (extent / 2) * s);
      const offset = -Math.sign(d) * (extent / 2) * c * k;
      const along = (1 + 0.038 * gel * q) * k;
      const width = Math.max(0.001, s * k);
      return vertical
        ? `translate3d(0px, ${offset.toFixed(2)}px, 0px) scale(${along.toFixed(4)}, ${width.toFixed(4)})`
        : `translate3d(${offset.toFixed(2)}px, 0px, 0px) scale(${width.toFixed(4)}, ${along.toFixed(4)})`;
    },
  );

  const flareTransform = useTransform(
    [half, squash],
    ([d, q]: number[]) => {
      const { w, h, perspective: p } = geometry.current;
      const s = Math.abs(Math.sin(d * RAD));
      const c = Math.cos(d * RAD);
      const extent = vertical ? h : w;
      const k = p / Math.max(1, p - (extent / 2) * s);
      const offset = -Math.sign(d) * (extent / 2) * c * k;
      const along = (1 + 0.038 * gel * q) * k;
      return vertical
        ? `translate3d(0px, ${offset.toFixed(2)}px, 0px) scale(${along.toFixed(4)}, 1)`
        : `translate3d(${offset.toFixed(2)}px, 0px, 0px) scale(1, ${along.toFixed(4)})`;
    },
  );

  const edgeOpacity = useTransform(edge, (e) => smooth(0.78, 0.96, e));
  const spectrumOpacity = useTransform(
    edge,
    (e) => (0.25 + 0.75 * dispersion) * smooth(0.88, 0.992, e),
  );
  const flareOpacity = useTransform(
    edge,
    (e) => Math.min(1, light * 1.15) * smooth(0.9, 0.996, e),
  );

  const leadingEdgeLight = useTransform(half, (d) => {
    const a = smooth(0.12, 0.8, Math.abs(Math.sin(d * RAD))) * light;
    if (a < 0.003) return "none";
    const direction = vertical
      ? d > 0
        ? "to bottom"
        : "to top"
      : d > 0
        ? "to right"
        : "to left";
    return `linear-gradient(${direction}, rgba(255,255,255,${(0.75 * a).toFixed(3)}) 0px, rgba(255,255,255,${(0.32 * a).toFixed(3)}) 4px, rgba(255,255,255,${(0.12 * a).toFixed(3)}) 16px, rgba(255,255,255,0) 42px)`;
  });

  const groundTransform = useTransform(half, (d) => {
    const c = Math.abs(Math.cos(d * RAD));
    return vertical
      ? `translateX(-50%) scale(1, ${(0.55 + 0.45 * c).toFixed(4)})`
      : `translateX(-50%) scale(${(0.28 + 0.72 * c).toFixed(4)}, 1)`;
  });

  const causticTransform = useTransform(half, (d) => {
    const { w, perspective: p } = geometry.current;
    const s = Math.sin(d * RAD);
    const c = Math.abs(Math.cos(d * RAD));
    let shift = 0;
    if (!vertical) {
      const right = 1 / Math.max(0.05, 1 + ((w / 2) * s) / p);
      const left = 1 / Math.max(0.05, 1 - ((w / 2) * s) / p);
      shift = ((w / 2) * c * (right - left)) / 2;
    }
    return `translate(calc(-50% + ${shift.toFixed(2)}px), 0px) scale(${(0.55 + 0.45 * c).toFixed(4)}, 1)`;
  });

  const shadowOpacity = useTransform(edge, (e) => 0.6 + 0.4 * (1 - e));
  const causticOpacity = useTransform(
    edge,
    (e) => light * dispersion * 0.85 * smooth(0.12, 0.95, e),
  );

  const lightAngle = useTransform(
    [turn, px, engage],
    ([t, x, h]: number[]) => 205 + t * 2 + x * h * 22,
  );
  const rimBackground = useMotionTemplate`conic-gradient(from ${lightAngle}deg at 50% 50%, rgba(255,255,255,1) 0deg, rgba(148,163,184,.38) 38deg, rgba(255,255,255,.92) 76deg, rgba(99,102,241,.28) 120deg, rgba(255,255,255,.78) 160deg, rgba(255,255,255,1) 195deg, rgba(148,163,184,.42) 225deg, rgba(255,255,255,.88) 262deg, rgba(56,189,248,.28) 304deg, rgba(255,255,255,.85) 338deg, rgba(255,255,255,1) 360deg)`;
  const spectrumAngle = useTransform(lightAngle, (a) => a + 48);
  const spectrumBackground = useMotionTemplate`conic-gradient(from ${spectrumAngle}deg at 50% 50%, #ff5f6d, #ffc371, #f4f86f, #58e8a2, #47c7ff, #8a7dff, #ff6fd8, #ff5f6d)`;
  const rimSpectrumOpacity = useTransform(
    edge,
    (e) => dispersion * (0.18 + 0.82 * Math.pow(e, 0.8)) * 0.72,
  );

  const bandX = useTransform(
    [half, px, engage],
    ([d, x, h]: number[]) => {
      const sweep =
        d === 0 ? -1.4 : clamp((d - 45 * Math.sign(d)) / 34, -1.4, 1.4);
      return `${(sweep * 46 + x * h * 5).toFixed(3)}%`;
    },
  );
  const bandOpacity = useTransform(
    [edge, engage],
    ([e, h]: number[]) => light * (0.16 * h + 0.85 * smooth(0.05, 0.45, e)),
  );
  const fresnelOpacity = useTransform(
    edge,
    (e) => light * 0.5 * Math.pow(e, 2.4),
  );
  const lightX = useTransform(px, (x) => 50 + x * 42);
  const lightY = useTransform(py, (y) => 50 + y * 40);
  const pointerLight = useMotionTemplate`radial-gradient(ellipse 68% 52% at ${lightX}% ${lightY}%, rgba(255,255,255,.82), rgba(255,255,255,.28) 44%, rgba(255,255,255,0) 76%)`;
  const pointerOpacity = useTransform(
    [engage, edge],
    ([h, e]: number[]) => h * (1 - e) * light,
  );

  const rippleX = useMotionValue(50);
  const rippleY = useMotionValue(50);
  const ripple = useMotionValue(1);
  const rippleInner = useTransform(ripple, (r) => 6 + r * 40);
  const rippleOuter = useTransform(ripple, (r) => 18 + r * 95);
  const rippleBackground = useMotionTemplate`radial-gradient(circle at ${rippleX}% ${rippleY}%, rgba(255,255,255,.78) 0%, rgba(224,231,255,.32) ${rippleInner}%, rgba(255,255,255,0) ${rippleOuter}%)`;
  const rippleOpacity = useTransform(
    ripple,
    (r) => light * Math.pow(1 - r, 1.3),
  );

  const iconRotate = useTransform(turn, (t) => t);
  const staged = live && !reduced;
  const frontPresence = useTransform(turn, (t) =>
    sideOf(t) === "front" ? 1 - edgeOf(t) : 0,
  );
  const backPresence = useTransform(turn, (t) =>
    sideOf(t) === "back" ? 1 - edgeOf(t) : 0,
  );

  const frontSlot = useSlotReveal(frontPresence, staged);
  const backSlot = useSlotReveal(backPresence, staged);
  const front0 = useReveal(frontPresence, 0, staged);
  const front1 = useReveal(frontPresence, 1, staged);
  const front2 = useReveal(frontPresence, 2, staged);
  const back0 = useReveal(backPresence, 0, staged);
  const back1 = useReveal(backPresence, 1, staged);
  const back2 = useReveal(backPresence, 2, staged);
  const back3 = useReveal(backPresence, 3, staged);

  // ── Pointer & drag ────────────────────────────────────────────────────────
  const pointer = React.useRef<{
    id: number;
    x: number;
    y: number;
    start: number;
    active: boolean;
    moved: boolean;
    rect: DOMRect;
    type: string;
  } | null>(null);

  const hoverRectRef = React.useRef<DOMRect | null>(null);
  const stageRect = () =>
    hoverRectRef.current || stageRef.current?.getBoundingClientRect() || null;

  const trackPointer = (clientX: number, clientY: number, rect: DOMRect) => {
    rawX.set(
      clamp(((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -1, 1),
    );
    rawY.set(
      clamp(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1, -1, 1),
    );
  };

  const pushDirection = (clientX: number, clientY: number, rect: DOMRect) =>
    vertical
      ? clientY >= rect.top + rect.height / 2
        ? 1
        : -1
      : clientX >= rect.left + rect.width / 2
        ? 1
        : -1;

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest(
      "a:not(.lgf-face),button,input,textarea,select,[data-lgf-interactive]",
    );

  const suppressClickUntil = React.useRef(0);
  const suppressNextClick = () => {
    suppressClickUntil.current = performance.now() + 450;
  };
  const onFaceClick = (event: React.MouseEvent) => {
    if (performance.now() < suppressClickUntil.current) {
      suppressClickUntil.current = 0;
      event.preventDefault();
    }
  };

  const hoverTimer = React.useRef<number | undefined>(undefined);
  const hoverDirection = React.useRef(1);
  const hovering = React.useRef(false);

  React.useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const onPointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live || event.pointerType !== "mouse") return;
    const rect = stageRef.current?.getBoundingClientRect() ?? null;
    hoverRectRef.current = rect;
    if (!rect) return;
    trackPointer(event.clientX, event.clientY, rect);
    if (!reduced) engage.set(1);
    if (!hoverMode) return;
    hovering.current = true;
    const direction = -pushDirection(event.clientX, event.clientY, rect);
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      if (!hovering.current || sideOf(targetRef.current) !== startSide) return;
      hoverDirection.current = direction;
      const next = targetRef.current + 180 * direction;
      targetRef.current = next;
      runTo(next);
      onFlip?.(sideOf(next));
    }, 70);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live || event.pointerType !== "mouse") return;
    hoverRectRef.current = null;
    engage.set(0);
    if (pointer.current && !pointer.current.active) {
      pointer.current = null;
      press.set(0);
    }
    if (!hoverMode) return;
    hovering.current = false;
    window.clearTimeout(hoverTimer.current);
    if (sideOf(targetRef.current) === startSide) return;
    const next = targetRef.current - 180 * hoverDirection.current;
    targetRef.current = next;
    runTo(next);
    onFlip?.(sideOf(next));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live || event.button !== 0 || isInteractiveTarget(event.target)) return;
    const rect = stageRef.current?.getBoundingClientRect() ?? null;
    hoverRectRef.current = rect;
    if (!rect) return;
    suppressClickUntil.current = 0;
    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: turn.get(),
      active: false,
      moved: false,
      rect,
      type: event.pointerType,
    };
    if (!reduced) {
      press.set(1);
      rippleX.set(
        clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      );
      rippleY.set(
        clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
      );
      ripple.jump(0);
      animate(ripple, 1, { duration: 0.75, ease: [0.2, 0.7, 0.2, 1] });
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    const state = pointer.current;
    if (event.pointerType === "mouse" && !(state && state.active)) {
      const rect = stageRect();
      if (rect) trackPointer(event.clientX, event.clientY, rect);
    }
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    const along = vertical ? dy : dx;
    const across = vertical ? dx : dy;
    if (!state.active) {
      if (!state.moved && dx * dx + dy * dy > 100) state.moved = true;
      if (
        !dragAllowed(state.type) ||
        Math.abs(along) < 8 ||
        Math.abs(along) < Math.abs(across) * 1.2
      )
        return;
      state.active = true;
      animationRef.current?.stop();
      state.start = turn.get();
      state.x = event.clientX;
      state.y = event.clientY;
      setDragging(true);
      engage.set(0);
      press.set(0);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture error if detached
      }
      return;
    }
    const extent = vertical ? state.rect.height : state.rect.width;
    const delta = vertical
      ? event.clientY - state.y
      : event.clientX - state.x;
    turn.set(state.start + (delta / Math.max(120, extent * 0.9)) * 180);
  };

  const finishDrag = (cancelled: boolean) => {
    suppressNextClick();
    const base = targetRef.current;
    const current = turn.get();
    const speed = turn.getVelocity();
    const projected = cancelled ? current : current + speed * 0.16;
    const next = clamp(
      Math.round(projected / 180) * 180,
      base - 180,
      base + 180,
    );
    targetRef.current = next;
    runTo(next, speed);
    if (next !== base) onFlip?.(sideOf(next));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointer.current;
    if (!state || state.id !== event.pointerId) return;
    pointer.current = null;
    press.set(0);
    if (state.active) {
      setDragging(false);
      finishDrag(false);
      return;
    }
    if (state.moved) {
      suppressNextClick();
      return;
    }
    if (cardLink) {
      if (state.type !== "mouse" && sideOf(targetRef.current) === startSide) {
        suppressNextClick();
        flip(pushDirection(event.clientX, event.clientY, state.rect));
      }
      return;
    }
    if (!hoverMode || state.type !== "mouse") {
      flip(pushDirection(event.clientX, event.clientY, state.rect));
    }
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointer.current;
    if (!state || state.id !== event.pointerId) return;
    pointer.current = null;
    press.set(0);
    if (state.active) {
      setDragging(false);
      finishDrag(true);
    }
  };

  // Hidden faces leave the accessibility tree and the tab order.
  const frontRef = React.useRef<HTMLElement | null>(null);
  const backRef = React.useRef<HTMLElement | null>(null);
  const setFrontRef = React.useCallback((element: HTMLElement | null) => {
    frontRef.current = element;
  }, []);
  const setBackRef = React.useCallback((element: HTMLElement | null) => {
    backRef.current = element;
  }, []);

  React.useEffect(() => {
    frontRef.current?.toggleAttribute("inert", side !== "front");
    backRef.current?.toggleAttribute("inert", side !== "back");
  }, [side, cardLink]);

  // ── Render ────────────────────────────────────────────────────────────────
  const dark = surface === "dark";
  const tintAlpha =
    material === "tinted"
      ? 0.28
      : material === "frosted"
        ? dark
          ? 0.16
          : 0.45
        : dark
          ? 0.08
          : 0.18;

  const rootStyle: React.CSSProperties & Record<string, unknown> = {
    width: "100%",
    height: "100%",
    ...style,
    "--lgf-radius": radiusCSS,
    "--lgf-padding": paddingCSS,
    "--lgf-pt": padTop,
    "--lgf-pr": padRight,
    "--lgf-text": textColor || (dark ? "#FFFFFF" : "#0F172A"),
    "--lgf-soft": textColor
      ? `color-mix(in srgb, ${textColor} 78%, transparent)`
      : dark
        ? "rgba(255,255,255,.82)"
        : "rgba(15,23,42,.68)",
    "--lgf-chip": dark ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.55)",
    "--lgf-chip-hover": dark
      ? "rgba(255,255,255,.26)"
      : "rgba(255,255,255,.82)",
    "--lgf-chip-hi": dark ? "rgba(255,255,255,.52)" : "rgba(255,255,255,.98)",
    "--lgf-chip-lo": dark ? "rgba(255,255,255,.12)" : "rgba(148,163,184,.18)",
    "--lgf-text-shadow": dark
      ? "0 1px 3px rgba(5,12,30,.32)"
      : "0 1px 0 rgba(255,255,255,.85)",
    "--lgf-tint": tint,
    "--lgf-tint-alpha": tintAlpha,
    "--lgf-focus": focusColor,
  };

  // Chromium supports url(#lgf-shared-liquid-lens) in backdrop-filter; Safari/Firefox gracefully use the blur+saturate fallback
  const cssBackdropFilter = `blur(${blur}px) saturate(1.85) brightness(1.04)`;
  const svgBackdropFilter = `url(#${LENS_FILTER_ID}) blur(${Math.max(6, blur - 4)}px) saturate(1.75) brightness(1.03)`;

  const titleStyle: React.CSSProperties = {
    fontSize: 34,
    fontWeight: 500,
    letterSpacing: "-0.035em",
    lineHeight: 1.05,
    ...titleFont,
  };
  const bodyStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: "-0.005em",
    lineHeight: 1.5,
    ...bodyFont,
  };
  const eyebrowStyle: React.CSSProperties = {
    fontFamily: bodyStyle.fontFamily,
  };

  const ctaKind = cardLink
    ? "card"
    : trimmedLink
      ? "link"
      : typeof onButtonTap === "function"
        ? "button"
        : "none";
  const label = buttonLabel?.trim() || "";
  const ctaContent = (
    <>
      <span className="lgf-cta-label">{label}</span>
      <ArrowIcon />
    </>
  );

  let cta: React.ReactNode = null;
  if (label) {
    if (ctaKind === "link") {
      cta = (
        <a
          className="lgf-cta"
          data-kind="link"
          href={trimmedLink}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener noreferrer" : undefined}
          draggable={false}
        >
          {ctaContent}
        </a>
      );
    } else if (ctaKind === "button") {
      cta = (
        <button
          className="lgf-cta"
          data-kind="button"
          type="button"
          onClick={() => onButtonTap?.()}
        >
          {ctaContent}
        </button>
      );
    } else {
      cta = (
        <span className="lgf-cta" data-kind={ctaKind}>
          {ctaContent}
        </span>
      );
    }
  }

  const hasFrontLayer = React.Children.count(frontLayer) > 0;
  const hasBackLayer = React.Children.count(backLayer) > 0;
  const cardLabel =
    ariaLabel ||
    (frontTitle || "").split("\n").join(" ").trim() ||
    "Flip card";
  const causticVisible = shadow === "prism";
  const edgeSpan = Math.max(
    0,
    (vertical ? size.w || 360 : size.h || 420) - 2 * cornerRadius,
  );
  const shadowVisible = shadow !== "none";

  const renderFace = (target: "front" | "back", children: React.ReactNode) => {
    const isActiveFace = side === target;
    const shared = {
      ref: target === "front" ? setFrontRef : setBackRef,
      className: "lgf-face",
      "data-active": isActiveFace,
      "aria-hidden": !isActiveFace,
      style: {
        opacity: isActiveFace ? 1 : 0,
      },
    };
    if (!cardLink) return <div {...shared}>{children}</div>;
    return (
      <a
        {...shared}
        data-link="true"
        href={trimmedLink}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        draggable={false}
        onClick={onFaceClick}
      >
        {children}
      </a>
    );
  };

  return (
    <div
      className={`lgf ${className}`}
      style={rootStyle}
      role="group"
      aria-roledescription="flip card"
      aria-label={cardLabel}
      data-axis={axis}
      data-surface={surface}
      data-shadow={shadow}
      data-trigger={trigger}
      data-live={live}
      data-reduced={reduced}
      data-dragging={dragging}
      data-flip-button={flipButton}
    >
      <div
        ref={stageRef}
        className="lgf-stage"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {shadowVisible ? (
          <motion.div
            className="lgf-deco lgf-ground lgf-shadow"
            aria-hidden="true"
            style={{
              width: "78%",
              height: 32,
              marginTop: 0,
              transform: live ? groundTransform : "translateX(-50%)",
              opacity: live ? shadowOpacity : 1,
            }}
          />
        ) : null}

        {causticVisible ? (
          <motion.div
            className="lgf-deco lgf-ground lgf-caustic"
            aria-hidden="true"
            style={{
              width: "64%",
              height: 24,
              marginTop: 8,
              transform: live ? causticTransform : "translate(-50%, 0px)",
              opacity: live ? causticOpacity : 0,
            }}
          />
        ) : null}

        <motion.div
          ref={cardRef}
          className="lgf-card"
          style={{
            transform: cardTransform,
            willChange: live ? "transform" : undefined,
          }}
        >
          <div className="lgf-body" aria-hidden="true">
            <div
              className="lgf-surface"
              style={{
                WebkitBackdropFilter: cssBackdropFilter,
                backdropFilter: svgBackdropFilter,
              }}
            >
              <div className="lgf-layer lgf-tint" />
              <div className="lgf-layer lgf-bezel" />
              <div className="lgf-layer lgf-shoulder" />
              <motion.div
                className="lgf-band"
                style={{ x: bandX, opacity: bandOpacity }}
              />
              <motion.div
                className="lgf-layer lgf-fresnel"
                style={{ opacity: fresnelOpacity }}
              />
              {live ? (
                <motion.div
                  className="lgf-layer"
                  style={{ background: leadingEdgeLight }}
                />
              ) : null}
              <motion.div
                className="lgf-layer"
                style={{ background: pointerLight, opacity: pointerOpacity }}
              />
              <motion.div
                className="lgf-layer"
                style={{ background: rippleBackground, opacity: rippleOpacity }}
              />
            </div>
            <motion.div
              className="lgf-rim"
              style={{ background: rimBackground }}
            />
            {dispersion > 0 ? (
              <motion.div
                className="lgf-rim"
                style={{
                  background: spectrumBackground,
                  opacity: rimSpectrumOpacity,
                }}
              />
            ) : null}
          </div>

          <button
            type="button"
            className="lgf-flip"
            aria-label={
              side === "front" ? "Flip card to back" : "Flip card to front"
            }
            title={
              side === "front"
                ? "Flip for scope, documents & actions"
                : "Flip back to project overview"
            }
            tabIndex={live ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              if (live) flip(1);
            }}
          >
            <motion.span
              style={{
                display: "grid",
                rotate: live && !reduced ? iconRotate : 0,
              }}
            >
              <FlipIcon />
            </motion.span>
          </button>

          {renderFace(
            "front",
            hasFrontLayer ? (
              <motion.div
                className="lgf-slot"
                style={{ opacity: frontSlot.opacity, y: frontSlot.y }}
              >
                <SlotFill node={frontLayer} />
              </motion.div>
            ) : (
              <>
                <motion.div
                  className="lgf-top"
                  style={{
                    ...eyebrowStyle,
                    opacity: front0.opacity,
                    y: front0.y,
                  }}
                >
                  {frontEyebrow?.trim() ? (
                    <span className="lgf-eyebrow">{frontEyebrow}</span>
                  ) : null}
                </motion.div>
                <div className="lgf-main">
                  {frontTitle?.trim() ? (
                    <motion.p
                      className="lgf-title"
                      style={{
                        ...titleStyle,
                        opacity: front1.opacity,
                        y: front1.y,
                      }}
                    >
                      {frontTitle}
                    </motion.p>
                  ) : null}
                  {frontText?.trim() ? (
                    <motion.p
                      className="lgf-text"
                      style={{
                        ...bodyStyle,
                        opacity: front2.opacity,
                        y: front2.y,
                      }}
                    >
                      {frontText}
                    </motion.p>
                  ) : null}
                </div>
              </>
            ),
          )}

          {renderFace(
            "back",
            hasBackLayer ? (
              <motion.div
                className="lgf-slot"
                style={{ opacity: backSlot.opacity, y: backSlot.y }}
              >
                <SlotFill node={backLayer} />
              </motion.div>
            ) : (
              <>
                <motion.div
                  className="lgf-top"
                  style={{
                    ...eyebrowStyle,
                    opacity: back0.opacity,
                    y: back0.y,
                  }}
                >
                  {backEyebrow?.trim() ? (
                    <span className="lgf-eyebrow">{backEyebrow}</span>
                  ) : null}
                </motion.div>
                <div className="lgf-main">
                  {backTitle?.trim() ? (
                    <motion.p
                      className="lgf-title"
                      style={{
                        ...titleStyle,
                        opacity: back1.opacity,
                        y: back1.y,
                      }}
                    >
                      {backTitle}
                    </motion.p>
                  ) : null}
                  {backText?.trim() ? (
                    <motion.p
                      className="lgf-text"
                      style={{
                        ...bodyStyle,
                        opacity: back2.opacity,
                        y: back2.y,
                      }}
                    >
                      {backText}
                    </motion.p>
                  ) : null}
                  {cta ? (
                    <motion.div
                      className="lgf-cta-line"
                      style={{
                        ...bodyStyle,
                        opacity: back3.opacity,
                        y: back3.y,
                      }}
                    >
                      {cta}
                    </motion.div>
                  ) : null}
                </div>
              </>
            ),
          )}
        </motion.div>

        <motion.div
          className="lgf-deco lgf-edge"
          aria-hidden="true"
          style={{
            width: vertical ? edgeSpan : thickness,
            height: vertical ? thickness : edgeSpan,
            marginLeft: -(vertical ? edgeSpan : thickness) / 2,
            marginTop: -(vertical ? thickness : edgeSpan) / 2,
            transform: edgeTransform,
            opacity: live ? edgeOpacity : 0,
          }}
        >
          <motion.div
            className="lgf-edge-spectrum"
            style={{ opacity: spectrumOpacity }}
          />
        </motion.div>

        <motion.div
          className="lgf-deco lgf-flare"
          aria-hidden="true"
          style={{
            width: vertical ? edgeSpan : 88,
            height: vertical ? 88 : edgeSpan,
            marginLeft: -(vertical ? edgeSpan : 88) / 2,
            marginTop: -(vertical ? 88 : edgeSpan) / 2,
            transform: flareTransform,
            opacity: live ? flareOpacity : 0,
          }}
        />
      </div>
    </div>
  );
}
