/*
  HIDE FIGURES: the studio's side of the money, off the screen for a while.

  In a pitch or on a call the screen is shared, and a client must not see
  margins, cost and buy rates, profit or other clients' collections. Turning
  this on makes `seesStudioFinance` (lib/roleAccess) answer no for everyone,
  so every screen that already hides those numbers from a Designer hides them
  now too; the screens that are wholly about money are covered (App.tsx).
  Client prices -- sell rates, BOQ and quote totals -- stay, because the client
  is meant to see them.

  It belongs to this browser, not to the person or the studio: the screen
  being shared is this one. Kept across reloads so a refresh mid-call does not
  bring the numbers back.
*/

const KEY = 'studiodesk.hideFigures';

const read = (): boolean => {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === '1'; } catch { return false; }
};

let hidden = read();
const listeners = new Set<() => void>();

export const figuresHidden = (): boolean => hidden;

export function setFiguresHidden(on: boolean): void {
  if (on === hidden) return;
  hidden = on;
  try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private window: still works until reload */ }
  listeners.forEach((l) => l());
}

export const toggleFiguresHidden = () => setFiguresHidden(!hidden);

export function subscribeFiguresHidden(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/* Another tab of the app on the same screen follows suit. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    const on = e.newValue === '1';
    if (on !== hidden) { hidden = on; listeners.forEach((l) => l()); }
  });
}

/** Alt+Shift+H, so it can be flipped mid-call without looking for the button. */
export const isHideFiguresShortcut = (e: KeyboardEvent): boolean =>
  e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyH' || e.key.toLowerCase() === 'h');
