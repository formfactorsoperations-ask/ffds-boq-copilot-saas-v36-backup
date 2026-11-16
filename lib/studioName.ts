/*
  The studio's name on the documents a client receives.

  Each document page used to pick its own: the Execution Agreement and the
  Terms Docket read the studio's company name from Studio settings, while the
  Handover Docket skipped it and fell back to a hard-coded studio, so one
  project's documents could carry two different names. Every document asks
  here instead.
*/
export function studioDisplayName(
  settings?: { companyName?: string | null } | null,
  org?: { name?: string | null } | null,
): string {
  return settings?.companyName?.trim() || org?.name?.trim() || 'The Studio';
}
