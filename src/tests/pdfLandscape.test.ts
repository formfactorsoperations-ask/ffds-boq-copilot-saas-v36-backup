import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { landscapePdf, portraitPages, readsPortrait, turnedRotation } from '../../lib/pdfLandscape';

async function pdf(pages: { w: number; h: number; rotate?: number }[]) {
  const doc = await PDFDocument.create();
  pages.forEach(({ w, h, rotate }) => { const p = doc.addPage([w, h]); if (rotate) p.setRotation(degrees(rotate)); });
  return doc.save();
}
const rotations = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

describe('drawings read landscape', () => {
  it('knows a portrait page, counting its /Rotate', () => {
    expect(readsPortrait(842, 1191, 0)).toBe(true);
    expect(readsPortrait(1191, 842, 0)).toBe(false);
    expect(readsPortrait(842, 1191, 90)).toBe(false);
    expect(readsPortrait(1191, 842, 270)).toBe(true);
    expect(readsPortrait(1000, 1000, 0)).toBe(false);
  });

  it('turns right or left', () => {
    expect(turnedRotation(0, 'right')).toBe(90);
    expect(turnedRotation(0, 'left')).toBe(270);
    expect(turnedRotation(270, 'right')).toBe(0);
  });

  it('turns only the portrait pages', async () => {
    const bytes = await pdf([{ w: 842, h: 1191 }, { w: 1191, h: 842 }, { w: 1191, h: 842, rotate: 90 }]);
    expect(await portraitPages(bytes)).toBe(2);
    const out = await landscapePdf(bytes, 'right');
    expect(out.turned).toBe(2);
    expect(await rotations(out.bytes)).toEqual([90, 0, 180]);
    expect(await portraitPages(out.bytes)).toBe(0);
  });

  it('changes nothing the second time, or when kept', async () => {
    const bytes = await pdf([{ w: 842, h: 1191 }]);
    const once = await landscapePdf(bytes, 'left');
    expect(await rotations(once.bytes)).toEqual([270]);
    const twice = await landscapePdf(once.bytes, 'left');
    expect(twice.turned).toBe(0);
    expect(twice.bytes).toBe(once.bytes);
    const kept = await landscapePdf(bytes, 'keep');
    expect(kept.turned).toBe(0);
    expect(kept.bytes).toEqual(bytes);
  });

  it('hands back a file it cannot read untouched', async () => {
    const junk = new TextEncoder().encode('not a pdf');
    expect(await portraitPages(junk)).toBeNull();
    expect((await landscapePdf(junk)).bytes).toBe(junk);
  });
});
