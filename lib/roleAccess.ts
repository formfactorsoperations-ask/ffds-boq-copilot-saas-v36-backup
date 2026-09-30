/**
 * Who sees the studio's own finances.
 *
 * Client prices -- selling rates, BOQ and quote totals -- are what the client
 * sees, and anyone working on a project may see them too. The studio's side of
 * the money is different: margins, cost and buy rates, profit, what has been
 * collected, and the Reports that add it all up. Those are for the roles that
 * run the business.
 *
 * Checks were scattered as `currentRole === 'Designer'`, some of them against
 * the wrong field entirely (`orgData.role`, which the studio record never
 * has), so a Designer saw margins on most screens. Everything asks here now.
 *
 * This decides what is SHOWN. A studio member's browser still receives the
 * project as stored; separating the numbers themselves is a larger change.
 */
const FINANCE_ROLES = new Set(['Super Admin', 'Admin', 'Ops Director', 'Owner']);

export const seesStudioFinance = (role?: string | null): boolean =>
  FINANCE_ROLES.has(String(role || ''));

/**
 * A Designer works drawings on the projects they are assigned to, and only
 * that. Every other screen they can reach is view-only, and the screens about
 * pricing, contracts and money are not offered at all.
 */
export const isDesignerRole = (role?: string | null): boolean => role === 'Designer';

/** The one workspace a Designer may change. */
export const DESIGNER_EDITABLE_TABS = new Set(['drawing-tracker']);

/**
 * Studio-wide screens, as opposed to the screens inside an open project.
 * Mirrors the list App.tsx uses to decide `isProjectTab`.
 */
export const STUDIO_TABS = new Set([
  'home', 'reports', 'projects', 'clients', 'bank', 'templates', 'ai-settings', 'setup-wizard',
  'studio-settings', 'terms-and-payment', 'communication-templates', 'saas-dashboard',
  'admin-templates-bank', 'data-privacy', 'support', 'terms-of-use',
]);

/*
  What a Designer may open, by allow-list rather than by hiding.

  Hiding screen by screen kept leaking: the Client Portal showed payments,
  Documents showed contracts, History had a Money filter, Execution & Ops had
  procurement. So a Designer gets exactly the screens their work needs --
  drawings, the gate they feed, the brief, the design decisions and the
  programme -- and everything else, present or added later, stays closed.
*/
export const DESIGNER_PROJECT_TABS = new Set([
  'drawing-tracker', 'design-gate', 'leadiq', 'record-decision', 'timeline',
]);
export const DESIGNER_STUDIO_TABS = new Set(['projects', 'data-privacy', 'support', 'terms-of-use']);

/** Where a Designer lands inside a project. */
export const DESIGNER_HOME_TAB = 'drawing-tracker';

export const designerMayOpen = (tab?: string | null): boolean => {
  const t = String(tab || '');
  return STUDIO_TABS.has(t) ? DESIGNER_STUDIO_TABS.has(t) : DESIGNER_PROJECT_TABS.has(t);
};

const cleanEmails = (list: any): string[] =>
  (Array.isArray(list) ? list : [])
    .map((e: any) => String(e || '').trim().toLowerCase())
    .filter(Boolean);

/** Designers recorded on the project itself (the first way assignments were kept). */
export const assignedDesignersOf = (ctx: any): string[] => cleanEmails(ctx?.assignedDesigners);

/**
 * Who designs a project: the studio record's `projectDesigners` map, which is
 * where assignments are kept now, else what the project itself recorded.
 *
 * The map lives on organizations/{tenant} so that assigning many projects at
 * once -- from a Designer's Team row or the Projects list -- is one small
 * write rather than a re-save of every project, and so the rules can read it.
 */
export type ProjectDesignersMap = Record<string, string[]>;

export function assignedDesignersFor(project: { id?: string; context?: any } | null | undefined, map?: ProjectDesignersMap | null): string[] {
  const id = project?.id;
  if (id && map && Object.prototype.hasOwnProperty.call(map, id)) return cleanEmails(map[id]);
  return assignedDesignersOf(project?.context);
}

/** The projects a role may open: every one, or a Designer's assigned ones. */
export function visibleToRole<T extends { id?: string; context?: any }>(
  projects: T[], role?: string | null, email?: string | null, map?: ProjectDesignersMap | null,
): T[] {
  if (!isDesignerRole(role)) return projects;
  const me = String(email || '').trim().toLowerCase();
  if (!me) return [];
  return projects.filter((p) => assignedDesignersFor(p, map).includes(me));
}

/**
 * Workspace tabs that are wholly about the studio's money. A role that does
 * not see studio finance is turned away from these even if it reaches one by a
 * link or a button, not only by the tab being hidden.
 */
export const FINANCE_TABS = new Set([
  'ops',              // Pricing & Tiers
  'analytics',        // Health Check & Audit
  'payment-calc',     // Money / Payment Schedule
  'project-reports',  // project Reports
  'reports',          // studio Reports
  'admin-templates-bank', // item bank: cost and buy rates
]);
