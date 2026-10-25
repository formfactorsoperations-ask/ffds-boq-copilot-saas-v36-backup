/*
  Download PDF for the Classic Digital proposal: where the sheets are cut (lib/classicPdf.ts).
*/
import { test, expect } from 'vitest';
import { planSheetBreaks } from '../../lib/classicPdf';

test('a document shorter than a sheet is one sheet', () => {
  expect(planSheetBreaks(600, 1000, [])).toEqual([{ top: 0, bottom: 600 }]);
});

test('with nothing to keep whole, sheets are cut at the sheet height', () => {
  expect(planSheetBreaks(2500, 1000, [])).toEqual([
    { top: 0, bottom: 1000 },
    { top: 1000, bottom: 2000 },
    { top: 2000, bottom: 2500 },
  ]);
});

test('a card that would straddle the cut moves whole to the next sheet', () => {
  const card = { top: 900, bottom: 1200 };
  const sheets = planSheetBreaks(2000, 1000, [{ top: 0, bottom: 880 }, card]);
  expect(sheets[0]).toEqual({ top: 0, bottom: 900 });
  expect(sheets[1].top).toBe(900);
  expect(sheets.every(s => !(s.top > card.top && s.top < card.bottom))).toBe(true);
});

test('a sheet is not left mostly empty to keep something whole', () => {
  // The only clean break is at 200, a fifth of a sheet: cut through instead.
  const sheets = planSheetBreaks(1800, 1000, [{ top: 200, bottom: 1500 }]);
  expect(sheets[0]).toEqual({ top: 0, bottom: 1000 });
});

test('an annexure marked to start a page starts a fresh sheet', () => {
  expect(planSheetBreaks(1500, 1000, [], [400])).toEqual([
    { top: 0, bottom: 400 },
    { top: 400, bottom: 1400 },
    { top: 1400, bottom: 1500 },
  ]);
});

test('every pixel of the document lands on exactly one sheet', () => {
  const ranges = Array.from({ length: 60 }, (_, i) => ({ top: i * 97, bottom: i * 97 + 80 }));
  const sheets = planSheetBreaks(5820, 1123, ranges, [3000]);
  expect(sheets[0].top).toBe(0);
  expect(sheets[sheets.length - 1].bottom).toBe(5820);
  sheets.slice(1).forEach((s, i) => expect(s.top).toBe(sheets[i].bottom));
  sheets.forEach(s => expect(s.bottom - s.top).toBeLessThanOrEqual(1123));
});
