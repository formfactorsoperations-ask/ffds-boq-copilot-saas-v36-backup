/*
  PDF pages on a canvas, for Design Review.

  pdf.js renders a page; everything drawn on top (pins, boxes, arrows) is the
  studio's own overlay, positioned in fractions of the page so it lands on the
  same spot at any zoom. The library loads only when a drawing is first opened.

  The parsing worker comes from the CDN at the exact version installed: the
  production bundle is a single esbuild file, which has no way to emit the
  worker as its own asset. pdf.js wraps a cross-origin worker itself.
*/
import type { PDFDocumentProxy } from 'pdfjs-dist';

const PDFJS_VERSION = '4.10.38';
let lib: Promise<typeof import('pdfjs-dist')> | null = null;

export function pdfjs() {
  if (!lib) {
    lib = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
      return m;
    });
    lib.catch(() => { lib = null; });
  }
  return lib;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

/** One parsed document per file, kept for the session. */
export function loadPdf(key: string, bytes: () => Promise<ArrayBuffer>): Promise<PDFDocumentProxy> {
  if (!docs.has(key)) {
    const p = (async () => {
      const m = await pdfjs();
      return m.getDocument({ data: new Uint8Array(await bytes()), isEvalSupported: false }).promise;
    })();
    p.catch(() => docs.delete(key));
    docs.set(key, p);
  }
  return docs.get(key)!;
}

export interface Rendered { width: number; height: number }

/**
 * Draws one page into a canvas, `cssWidth` pixels wide on screen and sharp on
 * high-density screens. Returns the page's displayed size, which the overlay
 * uses to turn pointer positions into fractions of the page.
 */
export async function renderPage(doc: PDFDocumentProxy, pageIndex: number, canvas: HTMLCanvasElement, cssWidth: number, turn = 0): Promise<Rendered> {
  const page = await doc.getPage(Math.min(doc.numPages, Math.max(1, pageIndex + 1)));
  /* `turn` is the viewer's own rotation (0, 90, 180, 270), on top of any the PDF carries. */
  const rotation = (((page.rotate || 0) + turn) % 360 + 360) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  const scale = cssWidth / base.width;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: scale * dpr, rotation });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { width: viewport.width / dpr, height: viewport.height / dpr };
}

/** A small picture of page one, made in the browser from the file being uploaded. */
export async function thumbnailOf(file: File, width = 520): Promise<Blob | null> {
  try {
    const m = await pdfjs();
    const doc = await m.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    doc.destroy();
    return blob;
  } catch {
    return null;
  }
}

/** Opens a dropped file just far enough to say whether pdf.js can read it. */
export async function pageCountOf(file: File): Promise<number | null> {
  try {
    const m = await pdfjs();
    const doc = await m.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const n = doc.numPages;
    doc.destroy();
    return n;
  } catch {
    return null;
  }
}
