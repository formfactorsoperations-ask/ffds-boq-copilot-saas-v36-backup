/*
  PORTAL VISITS: when a client opens their portal, and what they look at
  (handoff "Clients overhaul", PR D; owner's decision D6, 25 Nov 2026).

  The portal tells the server, through the portalPing callable, which approved
  tab a signed-in client has open: when it loads, on every tab change and
  every minute while it is on screen. The callable keeps one document per
  client login and project, projects/{projectId}/portalVisits/{uid}, written
  only by the server. It never touches the project document, and it counts
  only a real client on their own project: the studio's own preview of the
  portal, and every studio role, write nothing.

    - A session starts when the last ping is more than 30 minutes old.
    - A tab counts once per session, so "opened Documents 3 times" means three
      separate sittings.
    - A ping under 45 seconds after the last, on the same tab, writes nothing.
    - The last 20 sessions are kept, with the tabs opened in each.

  The studio sees it on the Clients screen as one status line per project
  (portalStatus, below, first match wins) and as entries in the thread.
  Viewer-role staff see none of it (owner, 25 Nov 2026).

  This is personal data under India's DPDP Act, so the portal says so: one
  line under the sign-in button and one in the account menu (owner approved,
  25 Nov 2026). Nothing here adds or unlocks a portal tab (lib/portalTabs).

  Pure, and shared by the app and the Cloud Functions, so the tests run it.
*/
import { APPROVED_PORTAL_LENSES, APPROVED_DESIGN_SCOPE_TABS } from './portalTabs';

/**
 * The day tracking began: the day portalPing was first deployed. A client
 * given access before it, who has no visit since, "has not opened the portal
 * since tracking began", which is not the same as never.
 */
export const PORTAL_TRACKING_SINCE = '2026-11-25';
export const TRACKING_SINCE_MS = Date.parse(`${PORTAL_TRACKING_SINCE}T00:00:00+05:30`);

export const SESSION_GAP_MS = 30 * 60 * 1000;
export const THROTTLE_MS = 45 * 1000;
export const RECENT_SESSIONS = 20;
/** A client counts as on the portal now for 2 minutes after their last ping (it pings every minute while open). */
export const ON_NOW_MS = 2 * 60 * 1000;

/** The tab ids a ping may carry: the approved lenses and Design & Scope's two halves. Anything else is "other". */
const TAB_IDS = new Set<string>([...APPROVED_PORTAL_LENSES, ...APPROVED_DESIGN_SCOPE_TABS]);
export const tabIdOf = (tab: unknown): string => (typeof tab === 'string' && TAB_IDS.has(tab) ? tab : 'other');

/** What the client sees each tab called in their portal. */
export const TAB_LABEL: Record<string, string> = {
  overview: 'Everything',
  timeline: 'Timeline',
  decisions: 'Decisions',
  documents: 'Documents',
  financials: 'Payments',
  designScope: 'Design & Scope',
  drawings: 'Drawings & renders',
  scope: 'Scope & BOQ',
  other: 'the portal',
};
export const tabLabel = (id: string | null | undefined) => TAB_LABEL[String(id || 'other')] || 'the portal';

export interface PortalSession { at: number; tabs: string[] }

export interface PortalVisit {
  uid: string;
  email: string | null;
  /** The studio, so the Clients list reads its recent visits in one query. */
  tenantId: string;
  projectId: string;
  firstAt: number;
  lastAt: number;
  lastTab: string;
  sessions: number;
  /** Each tab, and how many sessions opened it. */
  tabs: Record<string, number>;
  /** The latest sessions first, at most 20. */
  recent: PortalSession[];
}

/**
 * The visit after one ping, or null when nothing should be written (the same
 * tab again within 45 seconds).
 */
export function nextVisit(prev: PortalVisit | null, ping: { uid: string; email: string | null; tenantId: string; projectId: string; tab: string; now: number }): PortalVisit | null {
  const tab = tabIdOf(ping.tab);
  const now = ping.now;
  if (!prev) {
    return {
      uid: ping.uid, email: ping.email, tenantId: ping.tenantId, projectId: ping.projectId,
      firstAt: now, lastAt: now, lastTab: tab, sessions: 1, tabs: { [tab]: 1 }, recent: [{ at: now, tabs: [tab] }],
    };
  }
  if (now - prev.lastAt < THROTTLE_MS && prev.lastTab === tab) return null;
  const recent = Array.isArray(prev.recent) ? prev.recent.map((s) => ({ at: s.at, tabs: [...(s.tabs || [])] })) : [];
  const tabs = { ...(prev.tabs || {}) };
  const fresh = now - prev.lastAt > SESSION_GAP_MS || recent.length === 0;
  let sessions = prev.sessions || 0;
  if (fresh) {
    sessions += 1;
    recent.unshift({ at: now, tabs: [tab] });
    tabs[tab] = (tabs[tab] || 0) + 1;
  } else if (!recent[0].tabs.includes(tab)) {
    recent[0].tabs.push(tab);
    tabs[tab] = (tabs[tab] || 0) + 1;
  }
  return {
    ...prev, email: ping.email ?? prev.email ?? null, tenantId: ping.tenantId, projectId: ping.projectId,
    lastAt: now, lastTab: tab, sessions, tabs, recent: recent.slice(0, RECENT_SESSIONS),
  };
}

/* ── The status line (one rule, used in the list, the thread header, the card and the modal) ── */

export type PortalLineRule = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface PortalLine {
  rule: PortalLineRule;
  text: string;
  tone: 'brand' | 'slate' | 'warn';
  /** On the portal now: the dot breathes. */
  live?: boolean;
  /** Rule 7: offer Give access beside it. */
  giveAccess?: boolean;
  /** Rule 1: the tab they have open. */
  tab?: string;
}

const PIPELINE = new Set(['lead', 'draft', 'proposal_sent', 'negotiation']);
const LOST = new Set(['lost', 'archived']);
const DELIVERED = new Set(['completed']);

const msOf = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};
const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", or a date. */
export function relative(at: number, now: number): string {
  const s = Math.max(0, now - at);
  if (s < 2 * 60000) return 'just now';
  if (s < 3600000) return `${Math.floor(s / 60000)} min ago`;
  if (s < 24 * 3600000) return `${Math.floor(s / 3600000)} h ago`;
  const d = Math.floor(s / 86400000);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return day(at);
}

/** When portal access was given on a project, if it ever was, and whether it is on now. */
export function accessOf(ctx: any): { on: boolean; ever: boolean; since: number | null } {
  const marks = Object.values((ctx?.clientPortal || {}) as Record<string, any>);
  const link = msOf(ctx?.portalAccess?.issuedAt);
  const live = marks.filter((m) => msOf(m?.issuedAt) && !msOf(m?.revokedAt));
  const revokedAll = marks.length > 0 && live.length === 0;
  const times = [...live.map((m) => msOf(m.issuedAt)!), ...(link && !revokedAll ? [link] : [])];
  return { on: times.length > 0, ever: marks.length > 0 || !!link, since: times.length ? Math.min(...times) : null };
}

/**
 * One project's portal status line, first match wins:
 *   1 on the portal now · 2 last visit · 3 not opened yet (access after tracking began)
 *   4 not opened since tracking began · 5 project not won · 6 legacy project · 7 no portal access yet.
 */
export function portalStatus(project: { context?: any }, visits: PortalVisit[], now: number): PortalLine {
  const ctx = project?.context || {};
  const status = String(ctx.status || 'draft');
  const latest = [...(visits || [])].sort((a, b) => b.lastAt - a.lastAt)[0];
  if (latest && now - latest.lastAt <= ON_NOW_MS) {
    return { rule: 1, text: `On the portal now · ${tabLabel(latest.lastTab)}`, tone: 'brand', live: true, tab: latest.lastTab };
  }
  if (latest) {
    const sessions = visits.reduce((n, v) => n + (v.sessions || 0), 0);
    return { rule: 2, text: `Last visit ${relative(latest.lastAt, now)} · opened ${sessions === 1 ? 'once' : `${sessions} times`}`, tone: 'slate' };
  }
  const access = accessOf(ctx);
  if (access.on) {
    return access.since != null && access.since >= TRACKING_SINCE_MS
      ? { rule: 3, text: `Portal not opened yet · access given ${day(access.since)}`, tone: 'warn' }
      : { rule: 4, text: `Portal not opened since tracking began on ${day(TRACKING_SINCE_MS)}`, tone: 'warn' };
  }
  if (PIPELINE.has(status) || LOST.has(status)) return { rule: 5, text: 'Project not won — no portal yet', tone: 'slate' };
  if (DELIVERED.has(status) && !access.ever) return { rule: 6, text: 'Legacy project — handed over before the portal', tone: 'slate' };
  return { rule: 7, text: 'No portal access yet', tone: 'warn', giveAccess: true };
}

/** For Viewer-role staff, who see no visits: only whether access was given. */
export function portalStatusForViewer(project: { context?: any }): PortalLine {
  return accessOf(project?.context).on
    ? { rule: 3, text: 'Portal access given', tone: 'slate' }
    : { rule: 7, text: 'No portal access yet', tone: 'slate' };
}

/** The client's best line across their projects: on now, then last visit, then the rest in rule order. */
export function bestLine(lines: PortalLine[]): PortalLine | null {
  return [...lines].sort((a, b) => a.rule - b.rule)[0] || null;
}

/** Sessions that started after a moment (our last message), across the client's visits. */
export function sessionsSince(visits: PortalVisit[], since: number): number {
  return visits.reduce((n, v) => n + (v.recent || []).filter((s) => s.at > since).length, 0);
}

/** The privacy line the portal shows (owner approved, 25 Nov 2026). */
export const privacyLine = (studioName?: string | null) =>
  `We record when you open this portal and which pages you view, so ${String(studioName || '').trim() || 'the studio'} can follow up on time.`;
