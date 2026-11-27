import type { ProjectContext, ProposalTier, DocumentIssue } from '../types';
import type { ScopeRevisionRecord } from './scopeRevision';
import { optionChains, chainOf } from './optionChains';

/*
  BOQ REVISIONS: HOW MANY ARE STILL TO BE DONE (Project Reports).

  A BOQ is revised in two ways, and the report counts both:

  - Before signing, by a new version of the option the client is pricing
    (lib/optionChains: v1, v2, v3 of "Comfort Upgrade").
  - After signing, by a Scope Revision (lib/scopeRevision): drafted, issued to
    the client, approved (or sent back for changes) and then applied to the BOQ.

  "To be done" is every Scope Revision not yet applied, by who holds it, plus
  the cost and scope items that meetings have queued for the next revision
  (hooks/useMomScopeQueue). Withdrawn revisions count for nothing.

  The studio's change ledger (context.boqRevisions) says why lines moved, by
  the reason the studio gave.

  Pure: the report passes in the queued meeting items it reads.
*/

export type RevisionHolder = 'studio' | 'client';

export interface OpenRevision {
  id: string;
  number: number;
  /** What is left to do, said plainly. */
  state: 'drafting' | 'reworking' | 'sent-back' | 'with-client' | 'to-apply';
  label: string;
  holder: RevisionHolder;
  /** When it last moved. */
  at: number;
}

export interface BoqRevisionInsight {
  /** Scope Revisions not yet applied, oldest first. */
  open: OpenRevision[];
  /** Of those, the ones on the studio's desk. */
  withStudio: number;
  /** Of those, the ones waiting on the client. */
  withClient: number;
  /** Items from meetings waiting to go into a revision. */
  queued: number;
  /** Open revisions plus queued meeting items: the headline "to be done". */
  toDo: number;
  /** Scope Revisions applied to the BOQ. */
  applied: number;
  /** Times the client sent a version back for changes, across all revisions. */
  sentBackTimes: number;
  /** Versions of the client's option made before signing, past the first. */
  preSignRevisions: number;
  /** The option those versions belong to, if any. */
  optionName: string | null;
  /** The change ledger: lines changed, by reason, most first. */
  ledger: { total: number; byReason: { reason: string; count: number }[] };
}

export const OPEN_STATE_LABEL: Record<OpenRevision['state'], string> = {
  drafting: 'Being drafted',
  reworking: 'Being revised after the client sent it back',
  'sent-back': 'Sent back by the client for changes',
  'with-client': 'With the client to approve',
  'to-apply': 'Approved, to apply to the BOQ',
};

const SCOPE_CHANGE_TYPES = new Set(['ADD', 'REMOVE', 'REVISE_QTY', 'REVISE_RATE']);

const issuesFor = (issues: DocumentIssue[], number: number) => issues
  .filter((i) => i.kind === 'scope_revision' && (i.snapshot as any)?.number === number && !i.withdrawnAt)
  .sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));

export function boqRevisionInsight(
  ctx: ProjectContext | null | undefined,
  tiers: ProposalTier[] | null | undefined,
  activeTierId: string | null | undefined,
  queuedFromMeetings = 0,
): BoqRevisionInsight {
  const c: any = ctx || {};
  const records: ScopeRevisionRecord[] = (c.scopeRevisions || []).filter((r: any) => r && r.status !== 'withdrawn');
  const issues: DocumentIssue[] = c.documents?.issues || [];

  const open: OpenRevision[] = [];
  let applied = 0;
  records.forEach((r) => {
    if (r.status === 'applied') { applied++; return; }
    const latest = issuesFor(issues, r.number)[0];
    const everSentBack = issues.some((i) => i.kind === 'scope_revision' && (i.snapshot as any)?.number === r.number && (i as any).changesRequested);
    let state: OpenRevision['state'];
    if (r.status === 'signed') state = 'to-apply';
    else if (r.status === 'issued') state = latest && (latest as any).changesRequested ? 'sent-back' : 'with-client';
    else state = everSentBack ? 'reworking' : 'drafting';
    open.push({
      id: r.id, number: r.number, state, label: OPEN_STATE_LABEL[state],
      holder: state === 'with-client' ? 'client' : 'studio',
      at: Math.max(r.updatedAt || 0, latest?.issuedAt || 0),
    });
  });
  open.sort((a, b) => a.number - b.number);

  const sentBackTimes = issues.filter((i) => i.kind === 'scope_revision' && (i as any).changesRequested).length;

  /* Before signing: the versions of the option the client is pricing. */
  const chain = chainOf(optionChains((tiers || []).filter(Boolean)), c.approvedTierId || activeTierId);
  const preSignRevisions = chain ? Math.max(0, chain.versions.length - 1) : 0;

  const counts = new Map<string, number>();
  const ledgerRows = (c.boqRevisions || []).filter((r: any) => r && SCOPE_CHANGE_TYPES.has(r.type));
  ledgerRows.forEach((r: any) => {
    const reason = String(r.reasonCategory || '').trim() || 'No reason given';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  });
  const byReason = [...counts.entries()].map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  const withClient = open.filter((o) => o.holder === 'client').length;
  const queued = Math.max(0, Math.floor(queuedFromMeetings) || 0);
  return {
    open,
    withStudio: open.length - withClient,
    withClient,
    queued,
    toDo: open.length + queued,
    applied,
    sentBackTimes,
    preSignRevisions,
    optionName: chain ? (chain.root.name || null) : null,
    ledger: { total: ledgerRows.length, byReason },
  };
}

/*
  MEETINGS AND HOURS (Project Reports).

  From the meetings and site visits logged on the project (siteVisits), the
  same records the Hub's Activity tab counts: a cancelled one counts for nothing,
  and a meeting is any record that is not a site visit.
*/

export interface TimeSpent {
  meetings: number;
  meetingHours: number;
  online: number;
  inPerson: number;
  /** Meetings with no duration logged, so the hours are short by them. */
  meetingsWithoutTime: number;
  siteVisits: number;
  siteHours: number;
  totalHours: number;
  /** Minutes per meeting, over the meetings that have a duration. */
  avgMeetingMinutes: number | null;
  /** Meetings and site visits in the last 30 days. */
  last30: number;
  lastAt: number | null;
}

const msOf = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; }
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return 0;
};

const hrs = (minutes: number) => Math.round(minutes / 6) / 10;

export function timeSpent(visits: any[] | null | undefined, now = Date.now()): TimeSpent {
  const live = (visits || []).filter((v) => v && v.status !== 'cancelled');
  const meets = live.filter((v) => v.type !== 'site_visit');
  const sites = live.filter((v) => v.type === 'site_visit');
  const mins = (v: any) => Math.max(0, Number(v.durationMinutes) || 0);
  const meetMinutes = meets.reduce((s, v) => s + mins(v), 0);
  const siteMinutes = sites.reduce((s, v) => s + mins(v), 0);
  const timed = meets.filter((v) => mins(v) > 0);
  const dates = live.map((v) => msOf(v.date)).filter(Boolean);
  return {
    meetings: meets.length,
    meetingHours: hrs(meetMinutes),
    online: meets.filter((v) => !!v.isVirtual).length,
    inPerson: meets.filter((v) => !v.isVirtual).length,
    meetingsWithoutTime: meets.length - timed.length,
    siteVisits: sites.length,
    siteHours: hrs(siteMinutes),
    totalHours: hrs(meetMinutes + siteMinutes),
    avgMeetingMinutes: timed.length ? Math.round(timed.reduce((s, v) => s + mins(v), 0) / timed.length) : null,
    last30: dates.filter((d) => d <= now && now - d <= 30 * 86400000).length,
    lastAt: dates.filter((d) => d <= now).sort((a, b) => b - a)[0] || null,
  };
}
