import { prepareClonedDocForPdf } from './pdfUtils';

/**
 * One document on screen, out as an A4 PDF.
 *
 * Every document page in the app used to carry its own html2pdf call with its
 * own margins, footer and page-break rules. This is the shared one, used by the
 * Documents board and the client's document vault.
 *
 * Rendered once, sliced after. html2pdf hands the whole element to
 * html2canvas in one go, and past about 32,000 canvas pixels the canvas comes
 * back structurally valid and entirely blank (the Client Proposal export hit
 * exactly this). So the element is rendered once at a scale that keeps the
 * canvas under the browser's limit, then cut into A4 pages. The cuts land
 * between rows and blocks where possible, never through a line of a table.
 */

/** A4, in millimetres. */
const PAGE = { w: 210, h: 297 };
/** Top leaves room for the running header, bottom for the footer. */
const MARGIN = { top: 14, bottom: 16, side: 12 };
const PX_PER_MM = 96 / 25.4;

/** The width to lay a document out at so it fills the page at 1:1. */
export const PDF_CONTENT_WIDTH_PX = Math.round((PAGE.w - 2 * MARGIN.side) * PX_PER_MM);
const PAGE_CONTENT_HEIGHT_PX = Math.floor((PAGE.h - MARGIN.top - MARGIN.bottom) * PX_PER_MM);

/** Headings that should not be left alone at the foot of a page. */
const KEEP_WITH_NEXT = 'h1,h2,h3,h4,h5,[data-pdf-keep-next]';
/** How much of what follows a heading must fit under it, in CSS pixels. */
const KEEP_WITH_NEXT_PX = 64;

/** Blocks a page break should not cut through, when they fit on a page. */
const KEEP_TOGETHER = [
  'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'p', 'li', 'img', 'figure', 'dt', 'dd',
  '.break-inside-avoid', '[data-pdf-keep]',
].join(',');

export interface PdfOptions {
  filename: string;
  /** Printed at the top of every page after the first. */
  title: string;
  studioName: string;
  contactEmail?: string;
  /** Stamp every page DRAFT: the document was built from live data, not issued. */
  draft?: boolean;
  /** The document's status, marked on every page (see drawStatusMarks). */
  ribbon?: PdfRibbon | null;
  /** More blocks a page break should not cut through, beyond KEEP_TOGETHER. */
  keepTogether?: string;
}

export type PdfRibbonTone = 'signed' | 'approved' | 'issued' | 'draft';
export interface PdfRibbon {
  label: string;
  tone: PdfRibbonTone;
}

const STATUS_RGB: Record<PdfRibbonTone, [number, number, number]> = {
  signed: [18, 105, 76],
  approved: [27, 107, 112],
  issued: [61, 82, 160],
  draft: [168, 50, 74],
};

/** Opacity for what is drawn next, where the jsPDF build supports it. */
function withOpacity(pdf: any, opacity: number, draw: () => void) {
  const GState = pdf.GState;
  if (!GState) { draw(); return; }
  pdf.saveGraphicsState();
  pdf.setGState(new GState({ opacity }));
  draw();
  pdf.restoreGraphicsState();
}

/** A small status icon, drawn as strokes: a tick, a clock or a pen. */
function drawStatusIcon(pdf: any, tone: PdfRibbonTone, x: number, y: number, size: number) {
  pdf.setLineWidth(0.35);
  pdf.setLineCap('round');
  pdf.setLineJoin('round');
  const u = size / 16;
  if (tone === 'issued') {
    pdf.circle(x + 8 * u, y + 8 * u, 5.6 * u, 'S');
    pdf.lines([[0, 3.2 * u], [2 * u, 1.4 * u]], x + 8 * u, y + 5 * u, [1, 1], 'S', false);
  } else if (tone === 'draft') {
    pdf.lines([[2 * u, 2 * u], [-6.5 * u, 6.5 * u], [-2 * u, 0], [0, -2 * u], [6.5 * u, -6.5 * u]], x + 10.5 * u, y + 3.5 * u, [1, 1], 'S', true);
  } else {
    pdf.lines([[3 * u, 3 * u], [6 * u, -7 * u]], x + 3.5 * u, y + 8.5 * u, [1, 1], 'S', false);
  }
}

/**
 * The status marks every page carries, chosen from the mockups (round 2,
 * options 3 and 6):
 *
 *  - a binding rail: a fine rule in the status colour down the left margin,
 *    fading towards the foot, with the status set vertically at its top;
 *  - a corner glow: a soft wash of the status colour in the top-right corner,
 *    with a small icon and the status word.
 *
 * Both sit in the margins, clear of the content, and are drawn in vector so
 * they stay sharp at any zoom.
 */
function drawStatusMarks(pdf: any, ribbon: PdfRibbon) {
  const W = PAGE.w;
  const H = PAGE.h;
  const [r, g, b] = STATUS_RGB[ribbon.tone];
  const label = ribbon.label.toUpperCase();

  // Corner glow: overlapping ellipses from the corner, each nearly clear, so
  // their overlap reads as a soft radial wash.
  pdf.setFillColor(r, g, b);
  const rings = 44;
  for (let i = 0; i < rings; i++) {
    const t = 1 - i / rings;
    withOpacity(pdf, 0.0078, () => pdf.ellipse(W, 0, 64 * t, 50 * t, 'F'));
  }

  // Its label: icon and word, right-aligned in the top margin.
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  const spacing = 0.55;
  const wordW = pdf.getTextWidth(label) + spacing * (label.length - 1);
  const iconSize = 2.6;
  const right = W - MARGIN.side;
  const baseline = 9.2;
  pdf.setTextColor(r, g, b);
  pdf.text(label, right - wordW, baseline, { charSpace: spacing });
  pdf.setDrawColor(r, g, b);
  drawStatusIcon(pdf, ribbon.tone, right - wordW - iconSize - 1.1, baseline - iconSize + 0.35, iconSize);

  // Binding rail: a fine rule down the left margin, fading to the foot.
  const x = 6.6;
  const top = 17.5;
  const bottom = H - 17.5;
  const lineW = 0.45;
  const steps = 36;
  const seg = (bottom - top) / steps;
  pdf.setFillColor(r, g, b);
  for (let i = 0; i < steps; i++) {
    withOpacity(pdf, 1 - (i / steps) * 0.72, () => pdf.rect(x - lineW / 2, top + i * seg, lineW, seg + 0.05, 'F'));
  }

  // The rail's label, set vertically at its top on a clear patch of paper.
  pdf.setFontSize(5.2);
  const railSpacing = 0.9;
  const railW = pdf.getTextWidth(label) + railSpacing * (label.length - 1);
  const cap = 5.2 * 0.3528 * 0.72;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x - cap / 2 - 0.9, top - 0.6, cap + 1.8, railW + 2.4, 'F');
  pdf.setTextColor(r, g, b);
  // Reads bottom to top, as a spine does; the baseline sits on the rail's centre.
  pdf.text(label, x + cap / 2, top + railW + 0.6, { angle: 90, charSpace: railSpacing });
}

/** A filename that survives every operating system. */
export function pdfFilename(...parts: (string | number | null | undefined)[]): string {
  const name = parts
    .filter(p => p !== null && p !== undefined && String(p).trim() !== '')
    .map(p => String(p).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' '))
    .join(' - ');
  return `${name || 'Document'}.pdf`;
}

/**
 * Where each page ends, in CSS pixels from the top of the element.
 *
 * A page ends at its full height unless something small enough to move would
 * be cut there, in which case it ends above that thing. `[data-pdf-break-before]`
 * always starts a new page (the signature certificate does).
 */
function pageBreaks(el: HTMLElement, pageHeight: number, keep = KEEP_TOGETHER, firstHeight = pageHeight): number[] {
  const origin = el.getBoundingClientRect().top;
  const total = el.scrollHeight;
  const blocks = Array.from(el.querySelectorAll<HTMLElement>(keep))
    .map(b => {
      const r = b.getBoundingClientRect();
      return { top: r.top - origin, bottom: r.bottom - origin };
    })
    .filter(b => b.bottom - b.top > 0 && b.bottom - b.top < pageHeight * 0.9);
  const heads = Array.from(el.querySelectorAll<HTMLElement>(KEEP_WITH_NEXT)).map(h => {
    const r = h.getBoundingClientRect();
    return { top: r.top - origin, bottom: r.bottom - origin };
  });
  const forced = Array.from(el.querySelectorAll<HTMLElement>('[data-pdf-break-before]'))
    .map(b => b.getBoundingClientRect().top - origin)
    .filter(y => y > 0)
    .sort((a, b) => a - b);

  const ends: number[] = [];
  let start = 0;
  while (start < total - 1) {
    // The first page may already be partly used by the previous section.
    const limit = ends.length ? pageHeight : firstHeight;
    let end = Math.min(start + limit, total);
    const hardStop = forced.find(y => y > start + 1 && y < end);
    if (hardStop !== undefined) {
      end = hardStop;
    } else if (end < total) {
      const cut = blocks.filter(b => b.top < end && b.bottom > end && b.top > start + limit * 0.3);
      if (cut.length) end = Math.min(...cut.map(b => b.top));
      // A heading with too little of its content under it moves to the next page.
      const orphan = heads.filter(h => h.top > start + limit * 0.3 && h.top < end && h.bottom + KEEP_WITH_NEXT_PX > end);
      if (orphan.length) end = Math.min(end, ...orphan.map(h => h.top));
    }
    // Never stall: a page always moves forward.
    if (end <= start + 1) end = Math.min(start + pageHeight, total);
    ends.push(end);
    start = end;
  }
  return ends;
}

/** Load the html2canvas and jsPDF modules the app already bundles. */
async function tools() {
  const [h2c, jspdf] = await Promise.all([import('html2canvas'), import('jspdf')]);
  return { html2canvas: (h2c as any).default || h2c, jsPDF: (jspdf as any).jsPDF || (jspdf as any).default };
}

/** One element drawn to a canvas, with where its pages end. */
interface Capture {
  canvas: HTMLCanvasElement;
  scale: number;
  /** Page ends, in CSS pixels from the element's top. */
  ends: number[];
  /** The element's width in CSS pixels; the page scales to it. */
  width: number;
}

async function capture(el: HTMLElement, html2canvas: any, keep: string, firstPageMm?: number): Promise<Capture> {
  /* Some sheets are drawn at a fixed A4 width (the onboarding kit and the
     agreement are 794px) and ran past the 703px page area, so the capture cut
     the end off every line. The document is captured at its full natural width
     and scaled down to the page instead. */
  const width = Math.max(el.offsetWidth, el.scrollWidth);
  /* The copy html2canvas draws is laid out again inside its own frame, where
     fonts load afresh, so it can come out a little taller or shorter than the
     page on screen. Room is left for that, and the page breaks are measured
     on the copy itself, just before it is drawn. */
  const height = Math.ceil(el.scrollHeight * 1.15);
  // The canvas limit is about 32,767px on its long side; stay well under it.
  const scale = Math.max(0.75, Math.min(2, 30000 / Math.max(height, 1)));
  const pageHeight = Math.floor(PAGE_CONTENT_HEIGHT_PX * (width / PDF_CONTENT_WIDTH_PX));
  const pxPerMm = width / (PAGE.w - 2 * MARGIN.side);
  const firstHeight = firstPageMm !== undefined ? Math.floor(firstPageMm * pxPerMm) : pageHeight;
  let ends: number[] = [];

  el.setAttribute('data-pdf-stage', '1');
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      /* A desktop window, always. The copy is laid out in a frame this wide,
         and the document sheets carry phone-width rules (one-column grids,
         tighter padding) that fired whenever the studio's own window was
         narrow: a PDF made on a phone came out in the phone layout. The page
         breaks are measured on this copy, so they follow the same layout. */
      windowWidth: 1280,
      windowHeight: height,
      width,
      height,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: async (doc: Document) => {
        prepareClonedDocForPdf(doc);
        const stage = doc.querySelector<HTMLElement>('[data-pdf-stage]');
        if (stage) {
          stage.style.left = '0px';
          stage.style.top = '0px';
          stage.style.transform = 'none';
          // Wide enough for the widest sheet, so the certificate matches it.
          stage.style.width = `${width}px`;
        }
        const st = doc.createElement('style');
        // html2canvas draws under screen media, so print rules never run.
        st.textContent = '.no-print,[data-pdf-hide]{display:none!important}';
        doc.head.appendChild(st);
        if ((doc as any).fonts?.ready) await (doc as any).fonts.ready;
        // Measured here, on the copy that is actually drawn.
        ends = pageBreaks(stage || el, pageHeight, keep, firstHeight);
      },
    });
  } finally {
    el.removeAttribute('data-pdf-stage');
  }
  if (!ends.length) ends = pageBreaks(el, pageHeight, keep, firstHeight);
  return { canvas, scale, ends, width };
}

/**
 * Cut a capture into A4 pages and add them to `pdf`. The first slice goes on a
 * new page, or at `firstY` mm on the current one. Returns where the content
 * ends on the last page, in mm from the top.
 */
function addPages(pdf: any, cap: Capture, startOnNewPage: boolean, firstY: number = MARGIN.top): number {
  const contentW = PAGE.w - 2 * MARGIN.side;
  const mmPerPx = contentW / cap.width;
  let start = 0;
  let bottom = MARGIN.top;
  cap.ends.forEach((end, i) => {
    const sliceH = Math.max(1, Math.round((end - start) * cap.scale));
    const slice = document.createElement('canvas');
    slice.width = cap.canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(cap.canvas, 0, Math.round(start * cap.scale), cap.canvas.width, sliceH, 0, 0, cap.canvas.width, sliceH);
    if (i > 0 || startOnNewPage) pdf.addPage();
    const y = i === 0 && !startOnNewPage ? firstY : MARGIN.top;
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN.side, y, contentW, (end - start) * mmPerPx);
    bottom = y + (end - start) * mmPerPx;
    start = end;
  });
  return bottom;
}

/** Running header, footer, page numbers and status marks on every page. */
function finishPages(pdf: any, opts: PdfOptions) {
  const pages = pdf.internal.getNumberOfPages();
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    if (i > 1) {
      pdf.text(opts.title, MARGIN.side, 8);
      // The top-right corner carries the status when there is one.
      if (!opts.ribbon) pdf.text(opts.studioName, PAGE.w - MARGIN.side, 8, { align: 'right' });
    }
    pdf.text(
      opts.contactEmail ? `${opts.studioName} · ${opts.contactEmail}` : opts.studioName,
      MARGIN.side,
      PAGE.h - 7,
    );
    pdf.text(`Page ${i} of ${pages}`, PAGE.w - MARGIN.side, PAGE.h - 7, { align: 'right' });

    /* A draft says so in its top margin and through its status marks. The
       large diagonal watermark it used to carry is gone at the studio's
       request. */
    if (opts.draft) {
      pdf.setTextColor(185, 28, 60);
      pdf.setFontSize(8);
      pdf.text(`DRAFT · not issued · built from project data on ${today}`, PAGE.w / 2, i > 1 ? 12 : 8, { align: 'center' });
    }

    if (opts.ribbon) drawStatusMarks(pdf, opts.ribbon);
  }
}

const keepSelector = (opts: PdfOptions) => (opts.keepTogether ? `${KEEP_TOGETHER},${opts.keepTogether}` : KEEP_TOGETHER);

/**
 * Render `el` to a PDF and hand it to the browser as a download.
 *
 * `el` should be laid out at {@link PDF_CONTENT_WIDTH_PX}. It may sit off
 * screen: the clone is moved into view before it is drawn.
 */
export async function downloadElementAsPdf(el: HTMLElement, opts: PdfOptions): Promise<void> {
  const { html2canvas, jsPDF } = await tools();
  if (document.fonts?.ready) await document.fonts.ready;
  const cap = await capture(el, html2canvas, keepSelector(opts));
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  addPages(pdf, cap, false);
  finishPages(pdf, opts);
  pdf.save(opts.filename);
}

/**
 * Render a long document section by section: each section starts a new page,
 * and is drawn on its own so the whole document never has to fit one canvas.
 * A 25-page agreement drawn as one canvas comes out at the lowest scale the
 * canvas limit allows; drawn per section, every page stays sharp.
 */
export async function downloadSectionsAsPdf(
  sections: HTMLElement[],
  opts: PdfOptions & {
    /**
     * Let a section continue on the page the previous one ended on, when at
     * least this share of a page is left (0 to 1). Off: every section starts
     * a new page.
     */
    flowWhenRemaining?: number;
  },
): Promise<void> {
  if (!sections.length) throw new Error('Nothing to print.');
  const { html2canvas, jsPDF } = await tools();
  if (document.fonts?.ready) await document.fonts.ready;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const keep = keepSelector(opts);
  const contentH = PAGE.h - MARGIN.top - MARGIN.bottom;
  const GAP = 6;
  let bottom: number | null = null;
  for (const section of sections) {
    const remaining = bottom === null ? contentH : PAGE.h - MARGIN.bottom - (bottom + GAP);
    const flow = bottom !== null && opts.flowWhenRemaining !== undefined && remaining >= contentH * opts.flowWhenRemaining;
    const cap = await capture(section, html2canvas, keep, flow ? remaining : undefined);
    bottom = addPages(pdf, cap, bottom !== null && !flow, flow ? (bottom as number) + GAP : MARGIN.top);
  }
  finishPages(pdf, opts);
  pdf.save(opts.filename);
}
