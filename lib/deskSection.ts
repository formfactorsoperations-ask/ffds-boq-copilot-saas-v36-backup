/*
  THE OPS DESK, OPENED AT A SECTION.

  A note in the bell or the "needs you" bar can open the Ops Desk where the
  thing is dealt with (Escalations, Leads), as lib/peopleSection.ts does for
  People. The section waits here until the desk takes it, or is handed over at
  once when the desk is already open. No imports, so the shell can use it
  without loading the desk.
*/
const SECTION_EVENT = 'ffds:desk-section';
let wantedSection = '';
export function openDeskSection(section: string): void {
  wantedSection = section;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SECTION_EVENT, { detail: section }));
}
/** The section asked for; empty when none was. Only reads it (see lib/peopleSection.ts for why). */
export function wantedDeskSection(): string {
  return wantedSection;
}
export function clearDeskSection(): void {
  wantedSection = '';
}
/** Told when a section is asked for while the desk is open. */
export function onDeskSection(fn: (section: string) => void): () => void {
  const on = (e: Event) => { const s = String((e as CustomEvent).detail || ''); if (s) { wantedSection = ''; fn(s); } };
  window.addEventListener(SECTION_EVENT, on);
  return () => window.removeEventListener(SECTION_EVENT, on);
}
