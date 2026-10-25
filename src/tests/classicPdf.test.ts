/*
  Download PDF for the Classic Digital proposal: where the sheets are cut (lib/classicPdf.ts).
*/
import { test, expect } from 'vitest';
import { planSheetBreaks, MAX_STRETCH } from '../../lib/classicPdf';

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
  sheets.forEach(s => expect(s.bottom - s.top).toBeLessThanOrEqual(1123 * (1 + MAX_STRETCH)));
});

test('a sliver before a fresh-sheet section is taken in, not printed on a sheet of its own', () => {
  // The options card ends 30px past the sheet, then the scope starts a fresh sheet.
  const sheets = planSheetBreaks(2000, 1000, [], [1030]);
  expect(sheets.slice(0, 2)).toEqual([{ top: 0, bottom: 1030 }, { top: 1030, bottom: 2000 }]);
  // ...but more than a sliver still gets its own sheet.
  expect(planSheetBreaks(2000, 1000, [], [1200])[0]).toEqual({ top: 0, bottom: 1000 });
  // ...and the same at the end of the document.
  expect(planSheetBreaks(1040, 1000, [])).toEqual([{ top: 0, bottom: 1040 }]);
});

test('a cut may fall between two touching cards, never inside overlapping ones', async () => {
  const { mergeRanges } = await import('../../lib/classicPdf');
  // Touching spans stay separate (the seam between them is a fine cut); overlapping ones merge.
  expect(mergeRanges([{ top: 0, bottom: 100 }, { top: 100, bottom: 200 }, { top: 150, bottom: 260 }]))
    .toEqual([{ top: 0, bottom: 100 }, { top: 100, bottom: 260 }]);
  const sheets = planSheetBreaks(1000, 500, [{ top: 0, bottom: 300 }, { top: 300, bottom: 600 }]);
  expect(sheets[0]).toEqual({ top: 0, bottom: 300 });
});

test('thousands of elements plan in a blink', () => {
  // Every element of a long proposal: nested, overlapping, many.
  const ranges = Array.from({ length: 20000 }, (_, i) => ({ top: (i * 7) % 18000, bottom: ((i * 7) % 18000) + 40 + (i % 90) }));
  const started = Date.now();
  const sheets = planSheetBreaks(18000, 1050, ranges, [9000]);
  expect(Date.now() - started).toBeLessThan(200);
  expect(sheets[sheets.length - 1].bottom).toBe(18000);
});

test('sheets are captured in chunks no taller than the canvas allows', async () => {
  const { groupIntoChunks } = await import('../../lib/classicPdf');
  const sheets = [0, 1, 2, 3, 4].map(i => ({ top: i * 1000, bottom: (i + 1) * 1000 }));
  expect(groupIntoChunks(sheets, 2500).map(c => c.length)).toEqual([2, 2, 1]);
  expect(groupIntoChunks(sheets, 500).map(c => c.length)).toEqual([1, 1, 1, 1, 1]);
  expect(groupIntoChunks([], 2500)).toEqual([]);
});

test('the PDF carries every option, and its cards know where each option starts', async () => {
  const { stageForPdf, optionLinkSpots } = await import('../../lib/classicPdf');
  const card = (id: string, active = false) => `
    <div class="tier-option-card" data-tier-id="${id}">
      ${active ? '<div class="viewing-badge">Viewing Details</div>' : ''}
      <div class="cta-text">${active ? 'Showing Room-wise Scope Below ↓' : 'Click to View Detailed Scope'}</div>
    </div>`;
  const scope = (id: string, shown: boolean) =>
    `<section id="roomwise-content-${id}" class="roomwise-content ${shown ? 'block' : 'hidden'}" style="display:${shown ? 'block' : 'none'}">Scope ${id}</section>`;
  const root = document.createElement('div');
  root.innerHTML = `
    <section id="options">${card('a', true)}${card('b')}${card('c')}</section>
    <details id="scope-breakdown"><summary>Detailed Scope Breakdown</summary>${scope('a', true)}${scope('b', false)}${scope('c', false)}</details>`;
  document.body.appendChild(root);

  const host = await stageForPdf(root, 794, 1000);
  const scopes = Array.from(host.querySelectorAll<HTMLElement>('.roomwise-content'));
  expect(scopes.map(s => s.style.display)).toEqual(['block', 'block', 'block']);
  // Each option after the first starts its own sheet; so does the section.
  expect(scopes.map(s => s.classList.contains('page-break-before'))).toEqual([false, true, true]);
  expect(host.querySelector('[id="scope-breakdown"]')!.classList.contains('page-break-before')).toBe(true);
  expect(host.querySelectorAll('[data-pdf-back-to-options]')).toHaveLength(3);
  expect(host.querySelector('.viewing-badge')).toBeNull();
  expect(Array.from(host.querySelectorAll('.cta-text')).every(c => c.textContent === 'See this option’s detailed scope →')).toBe(true);

  const spots = optionLinkSpots(host)!;
  expect(spots.cards.map(c => c.tierId)).toEqual(['a', 'b', 'c']);
  expect(spots.backs).toHaveLength(3);
  // The live proposal on screen is untouched.
  expect(root.querySelectorAll('[data-pdf-back-to-options]')).toHaveLength(0);
  host.remove();
  root.remove();
});

test('with a single option nothing is expanded or linked', async () => {
  const { stageForPdf, optionLinkSpots } = await import('../../lib/classicPdf');
  const root = document.createElement('div');
  root.innerHTML = `<section id="options"><div class="tier-option-card" data-tier-id="a"></div></section>
    <section id="roomwise-content-a" class="roomwise-content">Scope</section>`;
  document.body.appendChild(root);
  const host = await stageForPdf(root, 794, 1000);
  expect(host.querySelectorAll('[data-pdf-back-to-options]')).toHaveLength(0);
  expect(optionLinkSpots(host)).toBeNull();
  host.remove();
  root.remove();
});
