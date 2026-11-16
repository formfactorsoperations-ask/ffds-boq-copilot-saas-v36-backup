/*
  Routes that moved when Execution & Ops was split (plan item 9).

  The Documents rows ("Meeting actions", "Weekly pulse reports"), the Project
  Hub's "Open actions" and saved links still use these ids. App sends each to
  the screen that now holds the tool, with the section to open.
*/
export const SITE_MOVED_ROUTES: Record<string, { route: string; focus: string }> = {
  'mom-action-tracker': { route: 'site-meetings', focus: 'minutes' },
  'update-client-feed': { route: 'site-meetings', focus: 'weekly' },
};
