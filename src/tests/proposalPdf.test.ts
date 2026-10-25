/*
  Download PDF for the Client Proposal (lib/proposalPdf.ts): the guards that keep
  it from hanging and from copying the whole app into every capture.
*/
import { test, expect, vi } from 'vitest';
import { withTimeout, onlyInside, PdfTimeoutError, sheetFor } from '../../lib/proposalPdf';

test('a step that never finishes ends in a timeout error, not a wait forever', async () => {
  vi.useFakeTimers();
  const never = new Promise<string>(() => {});
  const result = withTimeout(never, 60_000, 'Capturing page 3');
  vi.advanceTimersByTime(60_000);
  await expect(result).rejects.toBeInstanceOf(PdfTimeoutError);
  await expect(result).rejects.toThrow('Capturing page 3 took longer than 60s');
  vi.useRealTimers();
});

test('a step that finishes in time passes its result through', async () => {
  await expect(withTimeout(Promise.resolve(7), 1000, 'x')).resolves.toBe(7);
  await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'x')).rejects.toThrow('boom');
});

test('a capture copies the proposal, its ancestors and the head — never the rest of the app', () => {
  document.head.innerHTML = '<style id="tw">.x{}</style>';
  document.body.innerHTML = `
    <div id="app"><nav id="nav"><img id="avatar"></nav>
      <main id="main"><div id="proposal"><h1 id="title">Proposal</h1></div><aside id="side"></aside></main>
    </div>
    <iframe id="auth"></iframe>`;
  const skip = onlyInside(document.getElementById('proposal')!);
  const skipped = (id: string) => skip(document.getElementById(id)!);
  expect(skipped('app')).toBe(false);      // an ancestor
  expect(skipped('main')).toBe(false);     // an ancestor
  expect(skipped('proposal')).toBe(false); // itself
  expect(skipped('title')).toBe(false);    // inside it
  expect(skipped('tw')).toBe(false);       // the stylesheets
  expect(skipped('nav')).toBe(true);       // the rest of the app...
  expect(skipped('avatar')).toBe(true);
  expect(skipped('side')).toBe(true);
  expect(skipped('auth')).toBe(true);      // ...including frames that never finish loading
});

test('the sheet matches A4 in either orientation', () => {
  expect(sheetFor('portrait')).toMatchObject({ wMm: 210, hMm: 297, wPx: 794 });
  expect(sheetFor('landscape')).toMatchObject({ wMm: 297, hMm: 210, wPx: 1123 });
});

test('the html2canvas fixes still apply after being batched (read everything, then write)', async () => {
  const { neutraliseHtml2CanvasQuirks } = await import('../../lib/pdfUtils');
  document.body.innerHTML = `
    <div id="pill" style="display:inline-flex"><b>DESIGN</b></div>
    <span id="link" style="display:inline;border-bottom:2px solid rgb(61, 82, 160)">engagement.</span>
    <p id="plain">text</p>`;
  neutraliseHtml2CanvasQuirks(document);
  const el = (id: string) => document.getElementById(id) as HTMLElement;
  expect(el('pill').style.display).toBe('inline-block');
  expect(el('link').style.textDecoration).toContain('underline');
  expect(el('link').style.borderBottomStyle).toBe('none');
  expect(el('plain').getAttribute('style')).toBeNull();
});
