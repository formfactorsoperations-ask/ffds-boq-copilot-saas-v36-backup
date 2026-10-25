/**
 * Download PDF for the Classic Digital proposal.
 *
 * The Luxe Booklet is built from fixed `.ff-page` sheets, so its PDF is one
 * sheet per page. The classic proposal is one long scrolling document with no
 * sheets in it at all, which is why Download PDF used to stop at "Proposal
 * content is still loading" for every classic proposal: it found no pages.
 *
 * So the classic document is laid out once, off screen, at the sheet's width,
 * with every collapsed section opened and the screen-only furniture taken out
 * (the same things Save PDF hides through print CSS). That copy is then cut
 * into sheet-high bands, and each band is rasterised on its own. Handing the
 * whole document to html2canvas in one go returns a blank canvas at this
 * length, which the booklet export found out first.
 *
 * The cuts are placed between things, not through them: a cut never lands
 * inside an element shorter than most of a sheet, so a paragraph, a table row
 * or a card moves whole to the next page.
 */

export interface Range { top: number; bottom: number }

/** Elements shorter than this share of a sheet are never cut in two. */
const KEEP_WHOLE = 0.6;
/** A sheet is never filled to less than this share just to keep something whole. */
const MIN_FILL = 0.5;
/** How much of what follows a heading must share its sheet, in px. */
const HEADING_TAIL = 140;

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
  const fits = (y: number) => !keepWhole.some(r => r.top < y - 0.5 && r.bottom > y + 0.5);
  const candidates = Array.from(new Set(keepWhole.flatMap(r => [r.top, r.bottom])))
    .filter(y => y > 0 && y < total)
    .sort((a, b) => b - a);
  const hardBreaks = forced.filter(y => y > 0 && y < total).sort((a, b) => a - b);

  const sheets: Range[] = [];
  let start = 0;
  while (total - start > 1) {
    let limit = Math.min(total, start + sheetH);
    const hard = hardBreaks.find(y => y > start + 1 && y <= limit);
    let end: number;
    if (hard !== undefined) {
      end = hard;
    } else if (limit >= total) {
      end = total;
    } else {
      const floor = start + sheetH * MIN_FILL;
      end = candidates.find(y => y <= limit && y >= floor && fits(y)) ?? limit;
    }
    sheets.push({ top: start, bottom: end });
    start = end;
  }
  return sheets;
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

  host.appendChild(copy);
  document.body.appendChild(host);

  const images = Array.from(host.querySelectorAll('img'));
  await Promise.all(images.map(img => (img.complete ? null : new Promise(done => {
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  }))));
  if (document.fonts?.ready) await document.fonts.ready;

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
  await new Promise(done => requestAnimationFrame(() => done(null)));
  return host;
}
