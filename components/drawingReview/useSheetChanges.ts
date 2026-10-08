import { useEffect, useState } from 'react';
import { fileBlob } from '../../services/drawingReviewService';
import { loadPdf, renderPage } from '../../lib/pdfRender';
import { diffSheets, type SheetDiff } from '../../lib/sheetDiff';

/*
  Where a sheet changed since its last version: both pages drawn off screen at
  one size, compared, and remembered for the session.
*/

const WIDTH = 900;
const cache = new Map<string, Promise<SheetDiff>>();

async function pixels(path: string, page: number) {
  const doc = await loadPdf(path, async () => (await fileBlob(path)).arrayBuffer());
  if (page >= doc.numPages) return null;
  const canvas = document.createElement('canvas');
  await renderPage(doc, page, canvas, WIDTH, 0);
  const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function compute(current: string, previous: string, page: number): Promise<SheetDiff> {
  const key = `${current}|${previous}|${page}`;
  if (!cache.has(key)) {
    const p = Promise.all([pixels(current, page), pixels(previous, page)]).then(([a, b]) => (a && b ? diffSheets(a, b) : { kind: 'size' as const }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

export function useSheetChanges(current: string | null | undefined, previous: string | null | undefined, page: number, enabled: boolean) {
  const [state, setState] = useState<{ busy: boolean; diff: SheetDiff | null }>({ busy: false, diff: null });
  useEffect(() => {
    let live = true;
    if (!enabled || !current || !previous) { setState({ busy: false, diff: null }); return; }
    setState({ busy: true, diff: null });
    compute(current, previous, page)
      .then((diff) => live && setState({ busy: false, diff }))
      .catch(() => live && setState({ busy: false, diff: null }));
    return () => { live = false; };
  }, [current, previous, page, enabled]);
  return state;
}
