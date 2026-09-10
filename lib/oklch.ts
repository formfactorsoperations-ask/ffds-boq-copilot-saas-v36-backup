/*
  oklch() -> rgb() for canvas-based PDF rendering.

  Tailwind v4 emits its whole palette in oklch(). html2canvas — which
  html2pdf.js renders through — throws "Attempting to parse an unsupported
  color function" the moment it meets one, so every canvas-based PDF export in
  this app fails outright on a Tailwind v4 page.

  Neither `getComputedStyle` nor a canvas `fillStyle` round-trip will convert
  it for us: Chromium hands oklch back verbatim. So the conversion is done
  here, and the resulting rgb is written inline onto the cloned document that
  html2canvas is about to rasterise. The live page is never touched.
*/

/** Gamma-encode one linear-sRGB channel. */
const gamma = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));

const num = (raw: string, scale = 1): number => {
  const t = raw.trim();
  if (t === 'none') return 0;
  if (t.endsWith('%')) return (parseFloat(t) / 100) * scale;
  return parseFloat(t);
};

/**
 * Convert one `oklch(L C H)` / `oklch(L C H / A)` to `rgb()` / `rgba()`.
 * Returns null when the string is not one this parser recognises, so callers
 * can leave the original value alone rather than emitting something wrong.
 */
export const oklchToRgb = (input: string): string | null => {
  const m = /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)\s*(?:\/\s*([^\s/]+)\s*)?\)$/i.exec(input.trim());
  if (!m) return null;

  const L = num(m[1], 1);
  const C = num(m[2], 0.4);      // percentages on chroma are relative to 0.4
  const Hdeg = m[3].trim() === 'none' ? 0 : parseFloat(m[3]);
  const alpha = m[4] === undefined ? 1 : num(m[4], 1);
  if (!isFinite(L) || !isFinite(C) || !isFinite(Hdeg)) return null;

  const h = (Hdeg * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(h), C * Math.sin(h), alpha);
};

/**
 * Convert one `oklab(L a b)` / `oklab(L a b / A)` to `rgb()` / `rgba()`.
 *
 * Tailwind v4 emits this too — most visibly as the interpolation space in
 * `linear-gradient(in oklab, ...)` — and html2canvas rejects it exactly the
 * same way it rejects oklch.
 */
export const oklabStringToRgb = (input: string): string | null => {
  const m = /^oklab\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)\s*(?:\/\s*([^\s/]+)\s*)?\)$/i.exec(input.trim());
  if (!m) return null;
  const L = num(m[1], 1);
  const a = num(m[2], 0.4);
  const b = num(m[3], 0.4);
  const alpha = m[4] === undefined ? 1 : num(m[4], 1);
  if (!isFinite(L) || !isFinite(a) || !isFinite(b)) return null;
  return oklabToRgb(L, a, b, alpha);
};

/**
 * Convert one CSS `lab(L a b)` / `lch(L C H)` to `rgb()` / `rgba()`.
 *
 * Nothing in this app emits these today — Tailwind uses the ok* pair — but the
 * PDF helper this replaces handled them, so they stay supported rather than
 * quietly regressing. CSS Color 4 defines lab() against the **D50** white
 * point, which is the part hand-rolled versions usually get wrong.
 */
export const labStringToRgb = (input: string): string | null => {
  const m = /^(lab|lch)\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)\s*(?:\/\s*([^\s/]+)\s*)?\)$/i.exec(input.trim());
  if (!m) return null;

  const isLch = m[1].toLowerCase() === 'lch';
  const L = num(m[2], 100);            // lab lightness is 0..100
  const c1 = num(m[3], 125);
  const c2raw = m[4].trim();
  const alpha = m[5] === undefined ? 1 : num(m[5], 1);
  if (!isFinite(L) || !isFinite(c1)) return null;

  let A: number;
  let B: number;
  if (isLch) {
    const hDeg = c2raw === 'none' ? 0 : parseFloat(c2raw);
    if (!isFinite(hDeg)) return null;
    const h = (hDeg * Math.PI) / 180;
    A = c1 * Math.cos(h);
    B = c1 * Math.sin(h);
  } else {
    A = c1;
    B = num(c2raw, 125);
    if (!isFinite(B)) return null;
  }

  // CIELAB -> XYZ (D50)
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - B / 200;
  const d = 6 / 29;
  const finv = (t: number) => (t > d ? t * t * t : 3 * d * d * (t - 4 / 29));
  const X = 0.9642956764 * finv(fx);
  const Y = 1.0 * finv(fy);
  const Z = 0.8251046025 * finv(fz);

  // XYZ (D50) -> linear sRGB, Bradford-adapted
  const r = 3.1341359569 * X - 1.6173209458 * Y - 0.4906244118 * Z;
  const g = -0.9787553726 * X + 1.9161624667 * Y + 0.0334453456 * Z;
  const bl = 0.0719452663 * X - 0.2289913634 * Y + 1.4052825902 * Z;

  const R = clamp255(gamma(r));
  const G = clamp255(gamma(g));
  const Bv = clamp255(gamma(bl));

  return alpha >= 1
    ? `rgb(${R}, ${G}, ${Bv})`
    : `rgba(${R}, ${G}, ${Bv}, ${Math.max(0, Math.min(1, alpha))})`;
};

/** Shared tail of both conversions: oklab -> linear sRGB -> gamma -> rgb(). */
const oklabToRgb = (L: number, a: number, b: number, alpha: number): string => {
  // oklab -> LMS (cube roots undone)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const mm = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS -> linear sRGB
  const r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s;

  const R = clamp255(gamma(r));
  const G = clamp255(gamma(g));
  const B = clamp255(gamma(bl));

  return alpha >= 1
    ? `rgb(${R}, ${G}, ${B})`
    : `rgba(${R}, ${G}, ${B}, ${Math.max(0, Math.min(1, alpha))})`;
};

/**
 * Replace every modern-colour token inside a longer value — gradients, shadows.
 *
 * Covers three shapes html2canvas rejects:
 *   oklch(...) / oklab(...)  colour functions
 *   `in oklab` / `in oklch`  gradient interpolation hints, which Tailwind v4
 *                            puts on every gradient utility and which fail
 *                            even when both colour stops are plain rgb
 */
/*
  Something neutral to fall back on.

  Tailwind v4's shadow utilities use relative colour syntax —
  `oklab(from rgb(0 0 0 / 0.1) l a b / 5%)` — which would need a full
  channel-resolving colour engine to evaluate. Every occurrence of it here is a
  shadow tint, so an approximate translucent black is visually right, and a
  slightly-off shadow in a PDF beats an export that refuses to run.
*/
const UNRESOLVABLE_FALLBACK = 'rgba(0, 0, 0, 0.1)';

/**
 * Find complete `oklch(...)` / `oklab(...)` tokens, counting nested brackets so
 * a token containing `rgb(...)` is captured whole. A plain regex stops at the
 * first `)` and mangles exactly the values that matter.
 */
const replaceColorFns = (value: string): string => {
  // \b keeps `lab(` from matching inside `oklab(`.
  const re = /\b(?:oklch|oklab|lch|lab)\(/gi;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(value)) !== null) {
    const start = m.index;
    let depth = 0;
    let i = start + m[0].length - 1; // at the opening bracket
    for (; i < value.length; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break; // unbalanced; leave the rest alone

    const token = value.slice(start, i + 1);
    const converted = /^oklch\(/i.test(token)
      ? oklchToRgb(token)
      : /^oklab\(/i.test(token)
        ? oklabStringToRgb(token)
        : labStringToRgb(token);

    out += value.slice(last, start) + (converted ?? UNRESOLVABLE_FALLBACK);
    last = i + 1;
    re.lastIndex = last;
  }
  return out + value.slice(last);
};

export const convertOklchInValue = (value: string): string =>
  replaceColorFns(
    value.replace(/\bin\s+(?:oklab|oklch|lab|lch|srgb-linear|display-p3|xyz(?:-d[56]5)?)\b\s*,?\s*/gi, ''),
  );

/** Cheap pre-test: any colour form html2canvas would reject? */
const MODERN_COLOR_RE = /\b(?:oklch|oklab|lch|lab)\(|\bin\s+(?:oklab|oklch|lab|lch|srgb-linear|display-p3|xyz)/i;

/* Properties that can carry a colour, including the composite ones where an
   oklch can hide inside a gradient or a shadow. */
const COLOR_PROPS = [
  'color', 'background-color', 'background-image',
  // Physical and logical border colours. html2canvas reads the logical ones
  // too, and leaving them out was enough on its own to fail an export.
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-block-start-color', 'border-block-end-color',
  'border-inline-start-color', 'border-inline-end-color',
  'outline-color', 'text-decoration-color', 'text-emphasis-color',
  'box-shadow', 'text-shadow',
  'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color',
  'caret-color', 'accent-color', 'column-rule-color',
  '-webkit-text-fill-color', '-webkit-text-stroke-color',
];

/**
 * Inline an rgb equivalent for every oklch on every element of `doc`.
 *
 * Meant to run inside html2canvas's `onclone`, on the throwaway document it is
 * about to rasterise. Returns how many declarations were rewritten, which is
 * worth logging — zero on a Tailwind v4 page means the walk did not reach the
 * nodes and the export will fail.
 */
export const flattenOklchColors = (doc: Document): number => {
  const view = doc.defaultView;
  if (!view) return 0;
  let changed = 0;

  const visit = (el: Element) => {
    const cs = view.getComputedStyle(el);

    /*
      A named list, not every computed property.

      Enumerating the whole computed style looks more thorough and is much
      worse: custom properties inherit, so `getComputedStyle` hands back the
      entire Tailwind theme on every node, and writing that back inline stamps
      several hundred `--color-*` declarations onto all ~2,700 elements. It
      took twelve seconds and left the clone larger than the page.

      Custom properties do not need per-element treatment anyway — they are
      declared once on :root, and flattenOklchStylesheets already rewrites the
      rule that declares them, so every element inherits an rgb value.
    */
    for (const prop of COLOR_PROPS) {
      const value = cs.getPropertyValue(prop);
      if (!value || !MODERN_COLOR_RE.test(value)) continue;
      const next = convertOklchInValue(value);
      if (next === value) continue;
      // Never write back a value that still carries a token html2canvas
      // rejects — doing that put 281 unconverted colours onto the clone as
      // inline styles, which is worse than leaving the original rule to apply.
      if (MODERN_COLOR_RE.test(next)) continue;
      (el as HTMLElement).style.setProperty(prop, next, 'important');
      changed++;
    }
  };

  visit(doc.documentElement);
  doc.querySelectorAll('*').forEach(visit);

  /*
    Then the style attribute itself.

    The walk above only reads the colour properties it knows about, so it
    misses custom properties — `--tw-shadow`, `--tw-gradient-from` and friends
    — that Tailwind sets inline and that still carry an oklab the renderer
    will choke on. Rewriting the whole attribute catches those without having
    to enumerate every variable Tailwind might invent.
  */
  doc.querySelectorAll('*').forEach((el) => {
    /* The style attribute, whole. Custom properties such as --tw-shadow live
       here and never show up in the property list above. */
    const raw = el.getAttribute('style');
    if (raw && MODERN_COLOR_RE.test(raw)) {
      const next = convertOklchInValue(raw);
      if (next !== raw) {
        el.setAttribute('style', next);
        changed++;
      }
    }
    /* SVG paints through presentation attributes, not CSS. */
    for (const attr of ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color']) {
      const v = el.getAttribute(attr);
      if (v && MODERN_COLOR_RE.test(v)) {
        const next = convertOklchInValue(v);
        if (next !== v) {
          el.setAttribute(attr, next);
          changed++;
        }
      }
    }
  });

  return changed;
};

/**
 * Rewrite the cloned document's stylesheets themselves.
 *
 * Inlining computed styles per element is not enough: html2canvas also renders
 * ::before / ::after, and a pseudo-element has no node to hang an inline style
 * on. Its colour is only ever in a rule. So each sheet that mentions oklch or
 * oklab is serialised, converted, re-appended as a plain <style>, and the
 * original disabled — the rules keep their order, so the cascade is unchanged.
 *
 * Cross-origin sheets (Google Fonts) throw on `cssRules` and are skipped; they
 * carry @font-face, not colour.
 *
 * Returns the number of sheets rewritten.
 */
export const flattenOklchStylesheets = (doc: Document): number => {
  const converted: string[] = [];
  let sheets = 0;

  Array.from(doc.styleSheets).forEach((sheet) => {
    let text = '';
    try {
      const rules = (sheet as CSSStyleSheet).cssRules;
      if (!rules) return;
      text = Array.from(rules).map((r) => r.cssText).join('\n');
    } catch {
      return; // cross-origin
    }
    if (!MODERN_COLOR_RE.test(text)) return;

    converted.push(convertOklchInValue(text));
    try {
      (sheet as CSSStyleSheet).disabled = true;
    } catch { /* ignore */ }
    sheets++;
  });

  if (converted.length) {
    const style = doc.createElement('style');
    style.setAttribute('data-ff-oklch', 'converted');
    style.textContent = converted.join('\n');
    doc.head.appendChild(style);
  }
  return sheets;
};
