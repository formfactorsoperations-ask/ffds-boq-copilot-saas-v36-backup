/*
  THE TABS A CLIENT'S PORTAL MAY SHOW. CHANGING THIS LIST NEEDS THE STUDIO
  OWNER'S APPROVAL.

  The portal is the studio's face to its clients, and every tab on it is
  something the studio has to stand behind. A "Design record" tab once appeared
  in a client's portal as a side effect of holding a design meeting, without
  anyone at the studio having decided the client should see it. The owner has
  asked that no tab ever reaches a client that way again.

  So the portal draws only the tabs named here (components/ClientPortal.tsx
  filters its tab bars through approvedLenses and approvedDesignScopeTabs), and
  src/tests/portalTabs.test.ts pins this list exactly. Adding a tab means
  changing this file and that test, in a pull request the owner approves.
*/

/** The tab bar across the top of the portal. */
export const APPROVED_PORTAL_LENSES = ['overview', 'timeline', 'decisions', 'documents', 'financials', 'designScope'] as const;

/** The tabs inside Design & Scope. */
export const APPROVED_DESIGN_SCOPE_TABS = ['drawings', 'scope'] as const;

export type ApprovedLens = typeof APPROVED_PORTAL_LENSES[number];
export type ApprovedDesignScopeTab = typeof APPROVED_DESIGN_SCOPE_TABS[number];

/** Only the approved tabs, in the order given. Anything else is left out. */
export function approvedLenses<T extends { id: string }>(tabs: T[]): T[] {
  return tabs.filter((t) => (APPROVED_PORTAL_LENSES as readonly string[]).includes(t.id));
}

export function approvedDesignScopeTabs<T extends { id: string }>(tabs: T[]): T[] {
  return tabs.filter((t) => (APPROVED_DESIGN_SCOPE_TABS as readonly string[]).includes(t.id));
}
