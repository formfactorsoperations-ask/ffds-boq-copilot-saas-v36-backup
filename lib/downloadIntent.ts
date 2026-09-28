/**
 * "Download" on a document the board cannot render itself.
 *
 * The Client Proposal and the Quality & Handover Checklist are built on their
 * own pages, each with its own PDF export. The Documents board's Download
 * opens the page with a one-shot intent; the page takes it once it has
 * rendered and runs its own export. Nothing is duplicated, and an intent that
 * is never taken simply expires.
 */

const KEY = 'ffds:download-intent';
const TTL_MS = 30_000;

export function requestDownload(docId: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ docId, at: Date.now() }));
  } catch {
    /* storage blocked: the page opens and the studio clicks its own button */
  }
}

/** True once, for the page the intent names, within its lifetime. */
export function takeDownloadIntent(docId: string): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const { docId: id, at } = JSON.parse(raw);
    if (id !== docId) return false;
    sessionStorage.removeItem(KEY);
    return Date.now() - at < TTL_MS;
  } catch {
    return false;
  }
}

/** Whether an unexpired intent names this page, without taking it. */
export function hasDownloadIntent(docId: string): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const { docId: id, at } = JSON.parse(raw);
    return id === docId && Date.now() - at < TTL_MS;
  } catch {
    return false;
  }
}

/**
 * For a page's mount effect: once `selector` has rendered, take this page's
 * intent and run its export. Returns the effect cleanup.
 *
 * The intent is taken only when the export actually fires. Taking it on mount
 * lost it in development, where React runs every effect twice: the first run
 * took the intent, its cleanup cancelled the wait, and the second run found
 * nothing left to take.
 */
export function onDownloadIntent(docId: string, selector: string, runExport: () => void): () => void {
  if (!hasDownloadIntent(docId)) return () => {};
  return whenPresent(selector, () => {
    if (takeDownloadIntent(docId)) runExport();
  });
}

/**
 * Wait for an element to exist, then run `fn`. For pages whose export needs
 * rendered content that arrives after the first paint.
 */
export function whenPresent(selector: string, fn: () => void, timeoutMs = 12_000): () => void {
  const started = Date.now();
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    if (document.querySelector(selector)) {
      // One more beat for fonts and images to settle.
      window.setTimeout(() => { if (!stopped) fn(); }, 400);
      return;
    }
    if (Date.now() - started < timeoutMs) window.setTimeout(tick, 250);
  };
  tick();
  return () => { stopped = true; };
}
