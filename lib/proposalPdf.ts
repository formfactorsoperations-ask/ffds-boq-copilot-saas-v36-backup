/**
 * Download PDF for the Client Proposal, both formats.
 *
 * Why this is its own module, and why it is shaped the way it is.
 *
 * html2canvas copies the *whole document* into an iframe on every call and
 * then walks every element of that copy (and prepareClonedDocForPdf walks it
 * again, reading computed styles). The proposal sits inside the full studio
 * app, so each call was copying and restyling the entire app, and the export
 * made one call per sheet. A classic proposal took well over a minute on a
 * fast machine and looked hung on a slower one.
 *
 * Three things keep it quick and bounded:
 *
 *   1. `onlyInside` tells html2canvas to skip everything that is not the
 *      proposal (or an ancestor of it, or the stylesheets in <head>), so a
 *      copy is the size of the proposal, not of the app.
 *   2. Classic Digital is captured in a few tall chunks and sliced into
 *      sheets locally, instead of one capture per sheet.
 *   3. Every wait has a ceiling. A stalled image, a font that never settles
 *      or a capture that never returns ends in a clear message, never in a
 *      button that says "Building PDF…" forever.
 */

import type { jsPDF as JsPdf } from 'jspdf';
import { prepareClonedDocForPdf } from './pdfUtils';
import { stageForPdf, planSheetBreaks, keepWholeRanges, forcedBreaks, groupIntoChunks, optionLinkSpots, type Range, type Spot } from './classicPdf';

export type PageOrientation = 'portrait' | 'landscape';

/** The sheet, in millimetres and in CSS pixels at 96dpi. */
export interface Sheet { wMm: number; hMm: number; padMm: number; wPx: number }

export const sheetFor = (orientation: PageOrientation): Sheet =>
  orientation === 'landscape'
    ? { wMm: 297, hMm: 210, padMm: 14, wPx: 1123 }
    : { wMm: 210, hMm: 297, padMm: 16, wPx: 794 };

const SCALE = 2;
/* A capture is held as one canvas; keep it well inside what every browser will allocate. */
const MAX_CANVAS_PIXELS = 16_000_000;
/* Ceilings. Generous for a slow laptop, short enough that nobody waits on a hang. */
const CAPTURE_TIMEOUT_MS = 60_000;
const IMAGE_TIMEOUT_MS = 8_000;
/** Classic Digital: white band above and below the content on each sheet. */
const CLASSIC_MARGIN_MM = 10;

export class PdfTimeoutError extends Error {}

export function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfTimeoutError(`${what} took longer than ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * For html2canvas's `ignoreElements`: copy only `scope`, its ancestors and the
 * document head. Everything else on the page — the rest of the app — is skipped.
 */
export const onlyInside = (scope: Element) => (el: Element): boolean =>
  !(el.contains(scope) || scope.contains(el) || (el.ownerDocument?.head?.contains(el) ?? false));

type Html2Canvas = (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;

export interface PdfProgress { done: number; total: number }

/** Build the PDF for the proposal rendered under `root`. The caller saves it. */
export async function buildProposalPdf(
  root: HTMLElement,
  orientation: PageOrientation,
  onProgress: (p: PdfProgress) => void = () => {},
): Promise<JsPdf> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const sheet = sheetFor(orientation);

  // The Luxe Booklet is built from sheets; Classic Digital has none.
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.ff-page'));
  if (pages.length > 0) {
    await addBookletPages(pdf, pages, sheet, html2canvas as unknown as Html2Canvas, onProgress);
  } else {
    await addClassicSheets(pdf, root, sheet, html2canvas as unknown as Html2Canvas, onProgress);
  }
  return pdf;
}

const capture = (html2canvas: Html2Canvas, el: HTMLElement, opts: Record<string, unknown>, what: string) =>
  withTimeout(html2canvas(el, {
    scale: SCALE,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    imageTimeout: IMAGE_TIMEOUT_MS,
    ...opts,
  }), CAPTURE_TIMEOUT_MS, what).catch(err => {
    // A capture that never returned leaves its hidden working copy in the page.
    document.querySelectorAll('iframe.html2canvas-container').forEach(f => f.remove());
    throw err;
  });

/** The scale a classic band is printed at: 1, or a touch less when it took in a sliver (MAX_STRETCH). */
const fitOf = (band: Range, bandH: number) => Math.min(1, bandH / (band.bottom - band.top));

/** A region of `canvas` as a white-backed JPEG, ready for jsPDF. */
function sliceToJpeg(canvas: HTMLCanvasElement, top: number, height: number): string {
  const slice = document.createElement('canvas');
  slice.width = canvas.width;
  slice.height = height;
  const ctx = slice.getContext('2d');
  if (!ctx) throw new Error('The browser could not allocate a canvas for the PDF');
  // Paint white first: a slice shorter than a full sheet would otherwise
  // carry transparent pixels into the PDF as black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, slice.width, slice.height);
  ctx.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
  const data = slice.toDataURL('image/jpeg', 0.92);
  slice.width = slice.height = 0;
  return data;
}

/*
  Classic Digital: one long document. Lay it out off screen at the sheet's
  width, plan where the sheets break (lib/classicPdf.ts), capture it in a few
  tall chunks and cut each chunk into its sheets.
*/
async function addClassicSheets(
  pdf: JsPdf, root: HTMLElement, sheet: Sheet, html2canvas: Html2Canvas, onProgress: (p: PdfProgress) => void,
) {
  const pxPerMm = sheet.wPx / sheet.wMm;
  const bandH = Math.floor((sheet.hMm - CLASSIC_MARGIN_MM * 2) * pxPerMm);
  const host = await stageForPdf(root, sheet.wPx, bandH);
  try {
    const bands = planSheetBreaks(Math.ceil(host.scrollHeight), bandH, keepWholeRanges(host, bandH), forcedBreaks(host));
    const maxChunkH = Math.floor(MAX_CANVAS_PIXELS / (sheet.wPx * SCALE) / SCALE);
    const chunks = groupIntoChunks(bands, maxChunkH);
    let done = 0;
    onProgress({ done, total: bands.length });

    let first = true;
    for (const chunk of chunks) {
      const span: Range = { top: chunk[0].top, bottom: chunk[chunk.length - 1].bottom };
      const canvas = await capture(html2canvas, host, {
        y: span.top,
        width: sheet.wPx,
        height: span.bottom - span.top,
        ignoreElements: onlyInside(host),
        onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc),
      }, 'Capturing the proposal');

      const k = canvas.height / (span.bottom - span.top);
      for (const band of chunk) {
        const top = Math.round((band.top - span.top) * k);
        const height = Math.max(1, Math.min(canvas.height - top, Math.round((band.bottom - band.top) * k)));
        if (!first) pdf.addPage();
        first = false;
        const fit = fitOf(band, bandH);
        pdf.addImage(
          sliceToJpeg(canvas, top, height), 'JPEG',
          (sheet.wMm * (1 - fit)) / 2, CLASSIC_MARGIN_MM,
          sheet.wMm * fit, ((band.bottom - band.top) / pxPerMm) * fit,
        );
        onProgress({ done: ++done, total: bands.length });
      }
      canvas.width = canvas.height = 0;
    }

    addOptionLinks(pdf, host, bands, pxPerMm, bandH, sheet);
  } finally {
    host.remove();
  }
}

/*
  Make the option cards clickable in the PDF: each jumps to its own option's
  scope, and each scope's "Back to all options" jumps back. Sheets are numbered
  from 1 in the order the bands were added.
*/
function addOptionLinks(pdf: JsPdf, host: HTMLElement, bands: Range[], pxPerMm: number, bandH: number, sheet: Sheet) {
  const spots = optionLinkSpots(host);
  if (!spots) return;
  const sheetAt = (y: number) => {
    const i = bands.findIndex(b => y >= b.top && y < b.bottom);
    return i < 0 ? bands.length : i + 1;
  };
  const link = (spot: Spot, toY: number) => {
    const page = sheetAt(spot.top);
    const band = bands[page - 1];
    if (!band) return;
    const bottom = Math.min(spot.bottom, band.bottom);
    // Placed exactly as the band's image was: shrunk to fit and centred if it ran long.
    const fit = fitOf(band, bandH);
    pdf.setPage(page);
    pdf.link(
      (sheet.wMm * (1 - fit)) / 2 + (spot.left / pxPerMm) * fit,
      CLASSIC_MARGIN_MM + ((spot.top - band.top) / pxPerMm) * fit,
      (spot.width / pxPerMm) * fit,
      ((bottom - spot.top) / pxPerMm) * fit,
      // Sheet edges are whole pixels (lib/classicPdf.ts rounds them); a target a
      // fraction above its edge would otherwise land on the sheet before.
      { pageNumber: sheetAt(Math.round(toY) + 1), magFactor: 'Fit' },
    );
  };
  spots.cards.forEach(card => link(card.spot, card.scopeTop));
  // A one-line target is easy to miss, and html2canvas sets text a touch lower than
  // the page lays it out: give the way back a generous click area.
  spots.backs.forEach(back => link({ ...back, top: back.top - 8, bottom: back.bottom + 30 }, spots.optionsTop));
  pdf.setPage(bands.length);
}

/*
  Luxe Booklet: one capture per `.ff-page`, at the sheet's own geometry.

  Each capture copies only its own page. Page numbers are a CSS counter that
  counts the pages before this one, which are not in the copy, so the number
  is written into the copy's page instead.
*/
async function addBookletPages(
  pdf: JsPdf, pages: HTMLElement[], sheet: Sheet, html2canvas: Html2Canvas, onProgress: (p: PdfProgress) => void,
) {
  let first = true;
  onProgress({ done: 0, total: pages.length });

  for (const [index, page] of pages.entries()) {
    const canvas = await capture(html2canvas, page, {
      /*
        Pin the layout width to the sheet. Without this the PDF is laid out
        at whatever width the studio's browser window happens to be, so the
        same proposal exports differently on two machines.
      */
      windowWidth: sheet.wPx,
      width: sheet.wPx,
      ignoreElements: onlyInside(page),
      onclone: (clonedDoc: Document, clonedPage?: HTMLElement) => {
        /*
          Tailwind v4 writes its palette in oklch()/oklab(), which
          html2canvas cannot parse — it throws before drawing anything.
          Rewrite those to rgb on the throwaway clone first.
        */
        prepareClonedDocForPdf(clonedDoc);
        // The counter cannot count pages that are not in the copy: write the number in.
        clonedPage?.querySelectorAll('.ff-pageno').forEach(n => { n.textContent = String(index + 1); });

        const st = clonedDoc.createElement('style');
        st.textContent = `
          .ff-page {
            box-sizing: border-box;
            width: ${sheet.wMm}mm; padding: ${sheet.padMm}mm;
            margin: 0; border: 0; box-shadow: none; overflow: visible;
          }
          .ff-page:not(.ff-page-flow) { height: ${sheet.hMm}mm; }
          .ff-page-flow { height: auto; min-height: ${sheet.hMm}mm; }
          .proposal-container, .vnext-proposal-wrapper {
            box-shadow: none; border: 0; border-radius: 0;
            margin: 0; padding: 0; background: #fff;
          }
          .ff-ed { background: none !important; box-shadow: none !important; }
          /* html2canvas rasterises under screen media, so @media print
             never runs here — the editing furniture has to be hidden
             explicitly or it prints into the client's PDF. */
          .ff-edlist-tools, .ff-edlist-item-tools { display: none !important; }
          .no-print { display: none !important; }
          .ff-pageno::before { content: none !important; }
        `;
        clonedDoc.head.appendChild(st);
      },
    }, `Capturing page ${index + 1}`);

    const pxPerMm = canvas.width / sheet.wMm;
    const sliceHpx = Math.max(1, Math.floor(sheet.hMm * pxPerMm));

    /*
      Walk the page in sheet-high slices, and stop when what is left is a
      sliver rather than a sheet.

      A 297mm page rounds to a canvas a pixel or two taller than the
      computed slice height, so dividing with ceil() emitted a second,
      essentially empty sheet after every single page — the booklet came out
      with a blank between each leaf. Anything under 2% of a sheet is
      rounding noise, not content.
    */
    const MIN_SLICE = Math.max(4, Math.round(sliceHpx * 0.02));
    let offset = 0;
    while (canvas.height - offset > MIN_SLICE) {
      const hpx = Math.min(sliceHpx, canvas.height - offset);
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(sliceToJpeg(canvas, offset, hpx), 'JPEG', 0, 0, sheet.wMm, hpx / pxPerMm);
      offset += hpx;
    }
    canvas.width = canvas.height = 0;
    onProgress({ done: index + 1, total: pages.length });
  }
}
