/**
 * Preparing a cloned document for html2pdf.js / html2canvas.
 *
 * html2canvas cannot parse the modern CSS colour functions, and Tailwind v4
 * writes its entire palette in them, so every canvas-based PDF export in this
 * app throws "Attempting to parse an unsupported color function" before it
 * draws anything. This module makes a throwaway clone safe to rasterise.
 *
 * The conversion itself lives in ./oklch, which is unit-tested against
 * Chromium's own colour conversions. This file used to carry a second,
 * independent implementation of the same maths; that copy had three defects
 * worth naming, because any re-implementation invites them again:
 *
 *   - its oklab->LMS matrix used 0.1291980507 where the standard is
 *     1.2914855480, a factor of ten that skewed anything blue or yellow;
 *   - it matched colour functions with /\(([^)]+)\)/, which stops at the first
 *     bracket and so cut Tailwind's own shadow value —
 *     `oklab(from rgb(0 0 0 / 0.1) l a b / 5%)` — in half;
 *   - it only scanned <style> elements, which works under the dev server but
 *     finds nothing in a production build, where CSS arrives as <link>.
 *
 * The exported names and signatures are unchanged, so the twelve components
 * that call `prepareClonedDocForPdf` need no edit.
 */

import {
  convertOklchInValue,
  flattenOklchColors,
  flattenOklchStylesheets,
} from './oklch';

/**
 * Convert any oklch/oklab/lab/lch inside a CSS value string to rgb().
 * Kept for callers that only need the string transform.
 */
export function sanitizeCssColorString(str: string): string {
  if (!str || typeof str !== 'string') return str;
  return convertOklchInValue(str);
}

/**
 * Make `clonedDoc` safe for html2canvas.
 *
 * Runs from html2canvas's `onclone`, so it only ever touches the throwaway
 * document about to be rasterised — the live page is untouched.
 *
 * `targetElementId` is accepted for call-site compatibility; the whole cloned
 * document is sanitised regardless, since a colour inherited from an ancestor
 * outside the target still reaches the render.
 */
/**
 * Stop every transition and animation in the cloned document.
 *
 * Two reasons, and the first is not cosmetic. While a colour transition is in
 * flight, Chromium reports the interpolated value as `oklab(...)` — and a
 * running transition sits *above* author `!important` in the cascade, so an
 * inline rgb written onto that element is simply ignored. Fifteen elements
 * mid-hover were enough to fail an entire export.
 *
 * The second reason is that a document captured mid-animation prints a
 * half-faded element, which is not what anyone wants in a client PDF.
 */
export function freezeMotionForPdf(clonedDoc: Document): void {
  const style = clonedDoc.createElement('style');
  style.setAttribute('data-ff-freeze', 'motion');
  style.textContent =
    '*, *::before, *::after {' +
    'transition: none !important;' +
    'animation: none !important;' +
    '}';
  (clonedDoc.head || clonedDoc.documentElement).appendChild(style);
}

/**
 * Work around two html2canvas layout quirks, on the clone only.
 *
 * Both were found by rasterising a page and counting pixels, because both look
 * perfectly correct on screen:
 *
 *   1. An `inline-flex` container renders its background and border but *drops
 *      any element child entirely*. A badge reading "DESIGN + PLAN + BUILD"
 *      came out as an empty grey pill. Bare text inside the same container is
 *      fine; it is specifically an element child that disappears. `flex`,
 *      `block` and `inline-block` are all unaffected.
 *
 *   2. A bottom border on an *inline* element is drawn across the full width of
 *      the line box rather than under the text. Where the run ends on a short
 *      final line, the border trails off as a rule to the margin — under
 *      "engagement." it ran the width of the page.
 */
export function neutraliseHtml2CanvasQuirks(clonedDoc: Document): void {
  const view = clonedDoc.defaultView;
  if (!view) return;

  clonedDoc.querySelectorAll('*').forEach((el) => {
    const cs = view.getComputedStyle(el);

    if (cs.display === 'inline-flex') {
      (el as HTMLElement).style.setProperty('display', 'inline-block', 'important');
    }

    const bw = parseFloat(cs.borderBottomWidth || '0');
    if (cs.display === 'inline' && bw > 0 && cs.borderBottomStyle !== 'none') {
      const colour = cs.borderBottomColor;
      (el as HTMLElement).style.setProperty('border-bottom', 'none', 'important');
      (el as HTMLElement).style.setProperty('text-decoration', 'underline', 'important');
      (el as HTMLElement).style.setProperty('text-decoration-color', colour, 'important');
      (el as HTMLElement).style.setProperty('text-underline-offset', '3px', 'important');
    }
  });
}

export function prepareClonedDocForPdf(clonedDoc: Document, targetElementId?: string): void {
  if (!clonedDoc) return;

  // Motion first — an in-flight transition outranks anything written below.
  freezeMotionForPdf(clonedDoc);

  // Then the renderer's own blind spots, before colours are read off the clone.
  neutraliseHtml2CanvasQuirks(clonedDoc);

  // Stylesheets next: a ::before / ::after has no node to hang an inline
  // style on, so its colour can only be reached through the rule itself.
  flattenOklchStylesheets(clonedDoc);

  // Then computed styles, inline style attributes and SVG paint attributes.
  flattenOklchColors(clonedDoc);
}
