/*
  DRAWINGS READ LANDSCAPE.

  A designer's export often comes out of CAD as portrait pages with the
  drawing lying on its side. Turning the sheet on screen (R in the Design
  Desk) only turns it on that screen: the file stays portrait, so every
  download, every copy put on Drive and every print came out portrait.

  So the file itself is turned. Each portrait page gets a quarter turn in its
  /Rotate entry: the drawing is not redrawn or recompressed, just shown the
  right way round by every PDF reader. A page that already reads landscape is
  left alone, so turning a file twice changes nothing.

  Used when a designer uploads a PDF (the version is stored landscape) and
  when the studio downloads a sheet (versions uploaded before this).
*/
import { PDFDocument, degrees } from 'pdf-lib';

/** Which way to turn portrait pages: clockwise, anticlockwise, or not at all. */
export type TurnWay = 'right' | 'left' | 'keep';

/** A page reads portrait as it is displayed: its size, swapped when its /Rotate is a quarter turn. */
export function readsPortrait(width: number, height: number, rotate: number): boolean {
  const quarter = ((((rotate % 360) + 360) % 360) / 90) % 2 === 1;
  const w = quarter ? height : width;
  const h = quarter ? width : height;
  return h > w * 1.01;
}

/** The page's new /Rotate after turning it the given way. */
export function turnedRotation(rotate: number, way: Exclude<TurnWay, 'keep'>): number {
  return ((((rotate + (way === 'right' ? 90 : 270)) % 360) + 360) % 360);
}

export interface Turned {
  bytes: Uint8Array;
  /** How many pages were turned; 0 means the file is returned exactly as it came. */
  turned: number;
  pages: number;
}

/** How many pages of a PDF read portrait. Null when the file cannot be read (the server explains why). */
export async function portraitPages(bytes: ArrayBuffer | Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPages().filter((p) => {
      const { width, height } = p.getSize();
      return readsPortrait(width, height, p.getRotation().angle);
    }).length;
  } catch {
    return null;
  }
}

/** The PDF with every portrait page turned to landscape. A file it cannot read, or with nothing to turn, comes back untouched. */
export async function landscapePdf(bytes: ArrayBuffer | Uint8Array, way: TurnWay = 'right'): Promise<Turned> {
  const original = ArrayBuffer.isView(bytes) ? (bytes as Uint8Array) : new Uint8Array(bytes);
  if (way === 'keep') return { bytes: original, turned: 0, pages: 0 };
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(original, { updateMetadata: false });
  } catch {
    return { bytes: original, turned: 0, pages: 0 };
  }
  const pages = doc.getPages();
  let turned = 0;
  pages.forEach((p) => {
    const { width, height } = p.getSize();
    const rotate = p.getRotation().angle;
    if (!readsPortrait(width, height, rotate)) return;
    p.setRotation(degrees(turnedRotation(rotate, way)));
    turned++;
  });
  if (!turned) return { bytes: original, turned: 0, pages: pages.length };
  return { bytes: await doc.save(), turned, pages: pages.length };
}

/** The same, as a File the uploader can send, keeping its name. */
export async function landscapeFile(file: File, way: TurnWay = 'right'): Promise<{ file: File; turned: number }> {
  const out = await landscapePdf(await file.arrayBuffer(), way);
  if (!out.turned) return { file, turned: 0 };
  return { file: new File([out.bytes as unknown as BlobPart], file.name, { type: 'application/pdf', lastModified: file.lastModified }), turned: out.turned };
}
