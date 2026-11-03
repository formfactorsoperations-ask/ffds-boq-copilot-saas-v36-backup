/*
  PEOPLE, OPENED AT A SECTION.

  Open People at a section (Celebrations, Kudos…) from elsewhere: a note in the
  bell, or a Home pin. The section waits here until People takes it, or is
  handed over at once when People is already open. No imports, so the shell
  can use it without loading People.
*/
const SECTION_EVENT = 'ffds:people-section';
let wantedSection = '';
export function openPeopleSection(section: string): void {
  wantedSection = section;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SECTION_EVENT, { detail: section }));
}
/**
 * The section asked for; empty when none was. Only reads it: People clears it
 * once it is on screen (clearPeopleSection), because React may run a first
 * render twice (StrictMode, or a render it sets aside) and a read that also
 * cleared would leave the second run with nothing, opening Today instead.
 */
export function wantedPeopleSection(): string {
  return wantedSection;
}
export function clearPeopleSection(): void {
  wantedSection = '';
}
/** Told when a section is asked for while People is open. */
export function onPeopleSection(fn: (section: string) => void): () => void {
  const on = (e: Event) => { const s = String((e as CustomEvent).detail || ''); if (s) { wantedSection = ''; fn(s); } };
  window.addEventListener(SECTION_EVENT, on);
  return () => window.removeEventListener(SECTION_EVENT, on);
}

