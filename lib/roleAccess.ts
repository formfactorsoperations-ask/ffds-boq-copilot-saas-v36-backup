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
import { hasRole, primaryRole, type RoleSet } from './roles';

const FINANCE_ROLES = new Set(['Super Admin', 'Admin', 'Ops Director', 'Owner']);

/* Every check here takes one role or all of a person's roles (lib/roles). */
export const seesStudioFinance = (role?: RoleSet): boolean => hasRole(role, FINANCE_ROLES);

/**
 * A Designer works drawings on the projects they are assigned to, and only
 * that. Every other screen they can reach is view-only, and the screens about
 * pricing, contracts and money are not offered at all.
 */
export const isDesignerRole = (role?: RoleSet): boolean => primaryRole(role) === 'Designer';

/*
  THE LIMITED ROLES.

  A Designer, a Client Relations executive, a Site Supervisor and a Vendor see
  only the projects they are assigned to, and of each only a copy the server
  makes with what their work needs (functions/src/teamView.ts). The database
  gives them nothing else, so these are not screens being hidden: the money is
  not in what their browser receives. A person is limited when their most
  senior role is one of these; any broader role alongside lifts it.
*/
export const LIMITED_ROLES = new Set(['Designer', 'Client Relations', 'Site Supervisor', 'Vendor']);
export const isLimitedRole = (role?: RoleSet): boolean => LIMITED_ROLES.has(primaryRole(role));
export const isClientRelationsRole = (role?: RoleSet): boolean => primaryRole(role) === 'Client Relations';

/** Which server-made copy a limited role reads: design (Designer), ops (Client Relations), site (Site Supervisor). A Vendor reads none. */
export type TeamViewKind = 'design' | 'ops' | 'site';
export function teamViewKindOf(role?: RoleSet): TeamViewKind | null {
  switch (primaryRole(role)) {
    case 'Designer': return 'design';
    case 'Client Relations': return 'ops';
    case 'Site Supervisor': return 'site';
    default: return null;
  }
}

/*
  What Client Relations may open, by allow-list, like a Designer. Read-only
  for now: their own working tools (the Ops Desk, the follow-up log) come with
  the next phase. Nothing about pricing, contracts or the studio's costs.
*/
export const CLIENT_RELATIONS_PROJECT_TABS = new Set([
  'comms-tracker', 'timeline', 'record-decision', 'drawing-tracker', 'design-gate', 'leadiq',
]);
export const CLIENT_RELATIONS_STUDIO_TABS = new Set(['home', 'projects', 'data-privacy', 'support', 'terms-of-use']);
export const CLIENT_RELATIONS_HOME_TAB = 'comms-tracker';

/** Whether a limited role may open this tab; a broad role may open anything (subject to the finance check). */
export function limitedMayOpen(role: RoleSet, tab?: string | null): boolean {
  const t = String(tab || '');
  const kind = primaryRole(role);
  if (kind === 'Designer') return designerMayOpen(t);
  if (kind === 'Client Relations') return STUDIO_TABS.has(t) ? CLIENT_RELATIONS_STUDIO_TABS.has(t) : CLIENT_RELATIONS_PROJECT_TABS.has(t);
  if (LIMITED_ROLES.has(kind)) return STUDIO_TABS.has(t) && CLIENT_RELATIONS_STUDIO_TABS.has(t);
  return true;
}

/** Where a limited role lands inside a project. */
export const limitedHomeTab = (role: RoleSet): string =>
  primaryRole(role) === 'Client Relations' ? CLIENT_RELATIONS_HOME_TAB : DESIGNER_HOME_TAB;

/** The one workspace a Designer may change. */
export const DESIGNER_EDITABLE_TABS = new Set(['drawing-tracker']);

/**
 * Studio-wide screens, as opposed to the screens inside an open project.
 * Mirrors the list App.tsx uses to decide `isProjectTab`.
 */
export const STUDIO_TABS = new Set([
  'home', 'reports', 'projects', 'clients', 'bank', 'templates', 'ai-settings', 'setup-wizard', 'design-review',
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
export const DESIGNER_STUDIO_TABS = new Set(['home', 'projects', 'design-review', 'data-privacy', 'support', 'terms-of-use']);

/*
  The studio screens in the top bar, and the roles that open each. The home
  page's dial offers the same ones, so it never shows a screen the top bar
  would not.
*/
const LEADS = ['Super Admin', 'Owner', 'Admin', 'Ops Director'];
export const STUDIO_TAB_ROLES: Record<string, string[]> = {
  home: [...LEADS, 'Design Head', 'Site Supervisor', 'Designer', 'Client Relations'],
  projects: [...LEADS, 'Design Head', 'Site Supervisor', 'Designer', 'Client Relations'],
  'design-review': [...LEADS, 'Design Head', 'Designer'],
  // Not for Designers: the client list carries account values, and a Designer's
  // work is reached through their assigned projects.
  clients: [...LEADS, 'Design Head', 'Site Supervisor'],
  reports: LEADS,
  'studio-settings': LEADS,
  'admin-templates-bank': LEADS,
};

/** Whether any of these roles opens this studio screen. Screens not listed are not role-gated here. */
export const mayOpenStudioTab = (tab: string, role?: RoleSet): boolean =>
  !STUDIO_TAB_ROLES[tab] || hasRole(role, STUDIO_TAB_ROLES[tab]);

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

/**
 * The projects a role may open: every one, or a limited role's assigned ones.
 * A limited role's library holds only its copies already (the database
 * decides), so this is the screen agreeing with it.
 */
export function visibleToRole<T extends { id?: string; context?: any }>(
  projects: T[], role?: string | null, email?: string | null, map?: ProjectDesignersMap | null,
): T[] {
  if (primaryRole(role) === 'Client Relations') {
    const me = String(email || '').trim().toLowerCase();
    return me ? projects.filter((p) => (p as any)._teamView === 'ops' || assignedDesignersFor(p, map).includes(me)) : [];
  }
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
