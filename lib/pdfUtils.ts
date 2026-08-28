/**
 * Shared utility for generating PDF options with html2pdf.js / html2canvas.
 * Converts modern CSS color functions like `oklab`, `oklch`, `lab`, and `lch` that html2canvas cannot parse natively
 * into plain `rgb(...)` / `rgba(...)` strings across stylesheets, inline styles, and computed properties.
 */

function clamp01(val: number): number {
  return Math.max(0, Math.min(1, val));
}

function oklabToRgb(l: number, a: number, b: number, alpha: number = 1): string {
  // Normalize L to 0..1
  if (l > 1) l = l / 100;
  l = clamp01(l);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 0.1291980507 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  const toSrgb = (c: number) => {
    const clamped = clamp01(c);
    return clamped <= 0.0031308
      ? Math.round(clamped * 12.92 * 255)
      : Math.round((1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255);
  };

  const r = toSrgb(rLin);
  const g = toSrgb(gLin);
  const bVal = toSrgb(bLin);

  if (alpha < 1) {
    return `rgba(${r}, ${g}, ${bVal}, ${Math.max(0, Math.min(1, alpha))})`;
  }
  return `rgb(${r}, ${g}, ${bVal})`;
}

function parseAngle(val: string): number {
  val = val.trim().toLowerCase();
  if (val.endsWith('deg')) return parseFloat(val);
  if (val.endsWith('rad')) return (parseFloat(val) * 180) / Math.PI;
  if (val.endsWith('turn')) return parseFloat(val) * 360;
  return parseFloat(val) || 0;
}

function oklchToRgb(l: number, c: number, h: number, alpha: number = 1): string {
  if (l > 1) l = l / 100;
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  return oklabToRgb(l, a, b, alpha);
}

function labToRgb(l: number, a: number, b: number, alpha: number = 1): string {
  // Approximate standard CIELAB to RGB
  if (l > 1) l = l / 100;
  l = clamp01(l);
  const y = (l + 0.16) / 1.16;
  const x = a / 500 + y;
  const z = y - b / 200;

  const fInv = (t: number) => (t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787);
  const xN = 0.95047 * fInv(x);
  const yN = 1.00000 * fInv(y);
  const zN = 1.08883 * fInv(z);

  const rLin = 3.2406 * xN - 1.5372 * yN - 0.4986 * zN;
  const gLin = -0.9689 * xN + 1.8758 * yN + 0.0415 * zN;
  const bLin = 0.0557 * xN - 0.2040 * yN + 1.0570 * zN;

  const toSrgb = (c: number) => {
    const clamped = clamp01(c);
    return clamped <= 0.0031308
      ? Math.round(clamped * 12.92 * 255)
      : Math.round((1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255);
  };

  const r = toSrgb(rLin);
  const g = toSrgb(gLin);
  const bVal = toSrgb(bLin);

  if (alpha < 1) {
    return `rgba(${r}, ${g}, ${bVal}, ${alpha})`;
  }
  return `rgb(${r}, ${g}, ${bVal})`;
}

export function convertColorFunctionToRgb(match: string, type: string, argsStr: string): string {
  try {
    const typeLower = type.toLowerCase();
    const parts = argsStr.split('/');
    const mainArgs = parts[0].trim().replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    let alpha = 1;
    if (parts[1]) {
      const alphaStr = parts[1].trim();
      alpha = alphaStr.endsWith('%') ? parseFloat(alphaStr) / 100 : parseFloat(alphaStr);
      if (isNaN(alpha)) alpha = 1;
    }

    const p0Str = mainArgs[0] || '0';
    const p0 = p0Str.endsWith('%') ? parseFloat(p0Str) / 100 : parseFloat(p0Str);
    const p1 = parseFloat(mainArgs[1] || '0');
    const p2Str = mainArgs[2] || '0';

    if (isNaN(p0) || isNaN(p1)) {
      return 'rgb(51, 65, 85)';
    }

    if (typeLower === 'oklab') {
      const p2 = parseFloat(p2Str);
      return oklabToRgb(p0, p1, isNaN(p2) ? 0 : p2, alpha);
    } else if (typeLower === 'oklch') {
      const h = parseAngle(p2Str);
      return oklchToRgb(p0, p1, h, alpha);
    } else if (typeLower === 'lab') {
      const p2 = parseFloat(p2Str);
      return labToRgb(p0 * 100, p1, isNaN(p2) ? 0 : p2, alpha);
    } else if (typeLower === 'lch') {
      const h = parseAngle(p2Str);
      const hRad = (h * Math.PI) / 180;
      const a = p1 * Math.cos(hRad);
      const b = p1 * Math.sin(hRad);
      return labToRgb(p0 * 100, a, b, alpha);
    }

    return 'rgb(51, 65, 85)';
  } catch (e) {
    return 'rgb(51, 65, 85)';
  }
}

export function sanitizeCssColorString(str: string): string {
  if (!str || typeof str !== 'string') return str;
  const strLower = str.toLowerCase();
  if (!strLower.includes('oklab') && !strLower.includes('oklch') && !strLower.includes('lab(') && !strLower.includes('lch(')) {
    return str;
  }

  return str.replace(/(oklab|oklch|lab|lch)\s*\(([^)]+)\)/gi, (match, type, args) => {
    return convertColorFunctionToRgb(match, type, args);
  });
}

const KEBAB_COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'fill',
  'stroke',
  'box-shadow',
  'text-shadow',
  'text-decoration-color',
  'caret-color',
  'accent-color',
  'column-rule-color',
  'background-image'
];

export function prepareClonedDocForPdf(clonedDoc: Document, targetElementId?: string) {
  if (!clonedDoc) return;

  // 1. Sanitize all <style> elements across the cloned document
  const styleElements = Array.from(clonedDoc.querySelectorAll('style'));
  styleElements.forEach((styleEl) => {
    const rawCss = styleEl.textContent || '';
    if (rawCss.toLowerCase().includes('oklab') || rawCss.toLowerCase().includes('oklch') || rawCss.toLowerCase().includes('lab(') || rawCss.toLowerCase().includes('lch(')) {
      const sanitized = sanitizeCssColorString(rawCss);
      const replacement = clonedDoc.createElement('style');
      replacement.textContent = sanitized;
      if (styleEl.parentNode) {
        styleEl.parentNode.replaceChild(replacement, styleEl);
      } else {
        styleEl.textContent = sanitized;
      }
    }
  });

  // 2. Iterate all elements from documentElement down to all children
  const rootElements: HTMLElement[] = [];
  if (clonedDoc.documentElement) rootElements.push(clonedDoc.documentElement as HTMLElement);
  if (clonedDoc.body) rootElements.push(clonedDoc.body as HTMLElement);
  
  const allNodes = clonedDoc.querySelectorAll('*');
  allNodes.forEach((node) => {
    rootElements.push(node as HTMLElement);
  });

  const win = clonedDoc.defaultView || window;

  rootElements.forEach((htmlEl) => {
    if (!htmlEl || !htmlEl.style) return;

    // A. Check inline style attribute
    const styleAttr = htmlEl.getAttribute('style');
    if (styleAttr && (styleAttr.toLowerCase().includes('oklab') || styleAttr.toLowerCase().includes('oklch') || styleAttr.toLowerCase().includes('lab(') || styleAttr.toLowerCase().includes('lch('))) {
      htmlEl.setAttribute('style', sanitizeCssColorString(styleAttr));
    }

    // A2. Check SVG color attributes
    ['fill', 'stroke', 'stop-color'].forEach((attr) => {
      const attrVal = htmlEl.getAttribute(attr);
      if (attrVal && (attrVal.toLowerCase().includes('oklab') || attrVal.toLowerCase().includes('oklch') || attrVal.toLowerCase().includes('lab(') || attrVal.toLowerCase().includes('lch('))) {
        htmlEl.setAttribute(attr, sanitizeCssColorString(attrVal));
      }
    });

    // B. Check computed styles for all color properties using proper kebab-case names
    try {
      const computed = win.getComputedStyle(htmlEl);
      if (computed) {
        KEBAB_COLOR_PROPERTIES.forEach((prop) => {
          const compVal = computed.getPropertyValue(prop);
          if (compVal && (compVal.toLowerCase().includes('oklab') || compVal.toLowerCase().includes('oklch') || compVal.toLowerCase().includes('lab(') || compVal.toLowerCase().includes('lch('))) {
            const rgbVal = sanitizeCssColorString(compVal);
            htmlEl.style.setProperty(prop, rgbVal, 'important');
          }
        });
      }
    } catch (e) {
      // ignore getComputedStyle exceptions
    }
  });
}


