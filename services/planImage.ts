/*
  A plan as an image the BOQ Playground can draw on.

  The plan sheet measures everything in the image's own pixels, so it must
  always be the same image at the same size. A PDF plan (the brief's, or one
  uploaded) is drawn once — page 1, MAX_PLAN_EDGE on its long side — saved to
  Storage as a JPEG, and that image is what the plan uses from then on. The
  PDF itself stays where it was.
*/
import { downscalePlanToBase64, stripDataUrlPrefix, MAX_PLAN_EDGE, PLAN_JPEG_QUALITY } from '../lib/imageDownscale';
import { pdfjs } from '../lib/pdfRender';
import { uploadPlanImage } from './planStorage';

const isPdf = (file: Blob) => file.type === 'application/pdf';

/** Page `page` of a PDF as a JPEG, MAX_PLAN_EDGE on its long side, base64 without the data: prefix. */
async function pdfPageAsJpeg(file: Blob, page = 1): Promise<string> {
  const m = await pdfjs();
  const doc = await m.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const p = await doc.getPage(Math.min(doc.numPages, Math.max(1, page)));
    const base = p.getViewport({ scale: 1 });
    const scale = MAX_PLAN_EDGE / Math.max(base.width, base.height);
    const viewport = p.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvasContext: ctx, viewport }).promise;
    return stripDataUrlPrefix(canvas.toDataURL('image/jpeg', PLAN_JPEG_QUALITY));
  } finally {
    doc.destroy();
  }
}

/** A plan file (image or PDF) as a JPEG or PNG the plan can use, base64. */
export async function planImageFromFile(file: File, page = 1): Promise<string> {
  if (isPdf(file)) return pdfPageAsJpeg(file, page);
  return downscalePlanToBase64(file);
}

/** The plan at a URL (the brief's plan), fetched and made into an image the same way. */
export async function planImageFromUrl(url: string, page = 1): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The plan could not be fetched (HTTP ${res.status})`);
  const blob = await res.blob();
  const type = blob.type && blob.type !== 'application/octet-stream'
    ? blob.type
    : /^data:application\/pdf|\.pdf(\?|#|$)/i.test(url) ? 'application/pdf' : 'image/jpeg';
  return planImageFromFile(new File([blob], 'plan', { type }), page);
}

/** An image's natural size in pixels. */
export function imageSizeOf(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('The plan image could not be read'));
    img.src = src;
  });
}

const dataUrl = (b64: string) => `data:${b64.startsWith('iVBORw0KGgo') ? 'image/png' : 'image/jpeg'};base64,${b64}`;

/** Saves a plan image to Storage and returns its URL and size. */
export async function storePlanImage(tenantId: string | undefined, base64: string): Promise<{ imageUrl: string; imagePx: { w: number; h: number }; base64: string }> {
  const imagePx = await imageSizeOf(dataUrl(base64));
  const imageUrl = await uploadPlanImage(tenantId, base64, 'plans');
  return { imageUrl, imagePx, base64 };
}

/** The base64 of the plan image at a URL, for reading rooms off it. */
export async function planBase64FromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The plan could not be fetched (HTTP ${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Could not read the plan'));
    r.onloadend = () => resolve(stripDataUrlPrefix(String(r.result || '')));
    r.readAsDataURL(blob);
  });
}

/**
 * The walls of a plan image (lib/playground/walls): read on a canvas at most
 * WALL_READ_EDGE on its long side, the dark strokes found, the thin ones
 * (furniture, flooring, text) taken out. Null where there is no canvas.
 */
export const WALL_READ_EDGE = 1200;
export async function wallMaskOfImage(base64: string): Promise<{ mask: import('../lib/playground/walls').Mask; thickness: number } | null> {
  if (typeof document === 'undefined') return null;
  const { darkMask, wallMask } = await import('../lib/playground/walls');
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('The plan image could not be read'));
    i.src = dataUrl(base64);
  });
  const s = Math.min(1, WALL_READ_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const { mask, thickness } = wallMask(darkMask(ctx.getImageData(0, 0, w, h).data, w, h));
  return { mask, thickness };
}
