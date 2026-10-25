/**
 * Download PDF for the Classic Digital proposal: laying it out and cutting it
 * into sheets. lib/proposalPdf.ts does the capturing.
 *
 * The Luxe Booklet is built from fixed `.ff-page` sheets, so its PDF is one
 * sheet per page. The classic proposal is one long scrolling document with no
 * sheets in it at all.
 *
 * So the classic document is laid out once, off screen, at the sheet's width,
 * with every collapsed section opened and the screen-only furniture taken out
 * (the same things Save PDF hides through print CSS). That copy is then cut
 * into sheet-high bands.
 *
 * The cuts are placed between things, not through them: a cut never lands
 * inside an element shorter than most of a sheet, so a paragraph, a table row
 * or a card moves whole to the next page, and a heading moves with the start
 * of what it heads.
 */

export interface Range { top: number; bottom: number }

/** Elements shorter than this share of a sheet are never cut in two. */
const KEEP_WHOLE = 0.6;
/** A sheet is never filled to less than this share just to keep something whole. */
const MIN_FILL = 0.5;
/** How much of what follows a heading must share its sheet, in px. */
const HEADING_TAIL = 140;
/** Ceilings on the waits while the copy settles, so a stalled image cannot hang the export. */
const IMAGES_TIMEOUT_MS = 10_000;
const FONTS_TIMEOUT_MS = 3_000;
const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/**
 * Merge spans that overlap into one, so "is this position inside something?"
 * is a binary search. Spans that only touch stay separate: the point where
 * one card ends and the next begins is a fine place to cut.
 */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.filter(r => r.bottom > r.top).sort((a, b) => a.top - b.top);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.top < last.bottom) last.bottom = Math.max(last.bottom, r.bottom);
    else out.push({ ...r });
  }
  return out;
}

/** The merged span `y` falls strictly inside, if any. */
function spanAround(merged: Range[], y: number): Range | undefined {
  let lo = 0, hi = merged.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = merged[mid];
    if (y <= r.top) hi = mid - 1;
    else if (y >= r.bottom) lo = mid + 1;
    else return r;
  }
  return undefined;
}

/**
 * Where each sheet starts and ends, in px from the top of the document.
 *
 * `keepWhole` are the spans no cut may fall inside; `forced` are positions
 * that must start a new sheet (an annexure that prints on a fresh page).
 */
export function planSheetBreaks(
  total: number,
  sheetH: number,
  keepWhole: Range[],
  forced: number[] = [],
): Range[] {
  if (total <= 0 || sheetH <= 0) return [];
  const merged = mergeRanges(keepWhole);
  const hardBreaks = forced.filter(y => y > 0 && y < total).sort((a, b) => a - b);

  const sheets: Range[] = [];
  let start = 0;
  while (total - start > 1) {
    const limit = Math.min(total, start + sheetH);
    const hard = hardBreaks.find(y => y > start + 1 && y <= limit);
    let end: number;
    if (hard !== undefined) {
      end = hard;
    } else if (limit >= total) {
      end = total;
    } else {
      // Cut at the limit unless that splits something; then cut above it,
      // unless that would leave the sheet mostly empty.
      const around = spanAround(merged, limit);
      end = around && around.top >= start + sheetH * MIN_FILL ? around.top : limit;
    }
    sheets.push({ top: start, bottom: end });
    start = end;
  }
  return sheets;
}

/**
 * Consecutive sheets grouped so each group is at most `maxH` tall, to capture
 * a group in one go. A sheet taller than `maxH` (it cannot be) still gets a group.
 */
export function groupIntoChunks(sheets: Range[], maxH: number): Range[][] {
  const chunks: Range[][] = [];
  for (const s of sheets) {
    const current = chunks[chunks.length - 1];
    if (current && s.bottom - current[0].top <= maxH) current.push(s);
    else chunks.push([s]);
  }
  return chunks;
}

/** The spans inside `host` that should not be cut, relative to its top. */
export function keepWholeRanges(host: HTMLElement, sheetH: number): Range[] {
  const origin = host.getBoundingClientRect().top;
  const ranges: Range[] = [];
  host.querySelectorAll<HTMLElement>('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.height > sheetH * KEEP_WHOLE) return;
    ranges.push({ top: Math.round(r.top - origin), bottom: Math.round(r.bottom - origin) });
  });
  // A heading travels with the start of what it heads, never alone at the foot of a sheet.
  host.querySelectorAll<HTMLElement>('summary, h1, h2, h3').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    ranges.push({ top: Math.round(r.top - origin), bottom: Math.round(r.bottom - origin + HEADING_TAIL) });
  });
  return ranges;
}

/** Positions inside `host` that start a fresh sheet, relative to its top. */
export function forcedBreaks(host: HTMLElement): number[] {
  const origin = host.getBoundingClientRect().top;
  const before = Array.from(host.querySelectorAll<HTMLElement>('.page-break-before, .break-before-page'))
    .map(el => Math.round(el.getBoundingClientRect().top - origin));
  const after = Array.from(host.querySelectorAll<HTMLElement>('[class*="page-break-after-always"], [class*="break-after-page"]'))
    .map(el => Math.round(el.getBoundingClientRect().bottom - origin));
  return [...before, ...after];
}

/* Resolve after `ms` whatever happens, so a wait can be capped with Promise.race. */
const after = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

/**
 * Lay a copy of the proposal out off screen at `widthPx`, as it should print.
 * `sheetH` is the printable height of one sheet, in px.
 * The caller removes the returned host when it is done with it.
 */
export async function stageForPdf(root: HTMLElement, widthPx: number, sheetH: number): Promise<HTMLElement> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:absolute;top:0;left:-20000px;width:${widthPx}px;background:#fff;pointer-events:none;`;

  const copy = root.cloneNode(true) as HTMLElement;
  copy.style.minHeight = '0';
  // What print CSS hides from Save PDF, this hides from Download PDF.
  copy.querySelectorAll('.no-print, [class*="print:hidden"]').forEach(el => el.remove());
  copy.querySelectorAll<HTMLElement>('[class*="print:block"]').forEach(el => el.classList.remove('hidden'));
  // The client reads every section in the PDF, not only the ones open on screen.
  copy.querySelectorAll('details').forEach(d => { (d as HTMLDetailsElement).open = true; });
  copy.querySelectorAll('img[loading="lazy"]').forEach(img => img.removeAttribute('loading'));
  // The cover fills the browser window on screen; on paper it fills one sheet.
  copy.querySelectorAll<HTMLElement>('.h-screen').forEach(el => {
    el.style.height = `${sheetH}px`;
    el.style.minHeight = '0';
  });
  // A scroll box shows a window onto its list on screen; on paper the whole list prints.
  copy.querySelectorAll<HTMLElement>('[class*="max-h-"][class*="overflow-y-auto"], [class*="max-h-"][class*="overflow-auto"]').forEach(el => {
    el.style.maxHeight = 'none';
    el.style.overflow = 'visible';
  });

  host.appendChild(copy);
  document.body.appendChild(host);

  const images = Array.from(host.querySelectorAll('img')).filter(img => !img.complete);
  const loaded = Promise.all(images.map(img => new Promise(done => {
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  })));
  await Promise.race([loaded, after(IMAGES_TIMEOUT_MS)]);
  /*
    html2canvas waits, with no limit of its own, for its copy of the page to
    finish loading. An image that is still loading now would hold that up
    indefinitely, so it is left out of the PDF instead. Embedded frames hold
    it up the same way and cannot be drawn anyway.
  */
  images.filter(img => !img.complete).forEach(img => {
    img.removeAttribute('srcset');
    img.src = BLANK_PIXEL;
  });
  host.querySelectorAll('iframe, object, embed').forEach(el => el.remove());
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, after(FONTS_TIMEOUT_MS)]);
  // Let layout settle. A timer, not requestAnimationFrame: rAF never fires in a background tab.
  await after(50);

  /*
    Headings are sized by the browser window, not the sheet, so on a narrow
    sheet a big project name breaks mid-word ("Kalpat / aru"). Step it down
    until every word fits its column.
  */
  host.querySelectorAll<HTMLElement>('h1, h2').forEach(h => {
    h.style.overflowWrap = 'normal';
    h.style.wordBreak = 'normal';
    let size = parseFloat(getComputedStyle(h).fontSize);
    while (h.scrollWidth > h.clientWidth + 1 && size > 18) {
      size = Math.floor(size * 0.9);
      h.style.fontSize = `${size}px`;
    }
  });
  return host;
}
