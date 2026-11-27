import type { DrawingTrackerItem } from '../types';
import type { ClientMoney } from './clientMoney';
import { siteRisks, heldBy, roundsToBill, type SmartRow, type SiteRisk, type Held, type RoundToBill } from './deskSmart';
import type { DesignMeeting } from './designMeeting';
import { summariseTurnaround, turnaroundOf } from './drawingIntel';
import { clientPulse, materialise, progressOf, type Checklist, type ChecklistKind, type Pulse, type VisitRequest } from './clientCare';
import { decisionWaiting, paymentWaiting, withChases, type Escalation, type FollowUp, type OpsSettings, type WaitingItem } from './opsDesk';
import { phaseOf } from './opsDesk2';
import { nextMove, type NextMove } from './clientNextMove';
import { STATUS_TO_BUCKET } from './clientGroups';
import { DIGEST_STATUS_LABEL, type Digest } from './fridayDigest';

/*
  THE SMART WORKSPACE, PR 2 (owner, 27 Nov 2026): the Design card, the client
  pulse, this week's update, and handover readiness, for the Conversations
  workspace. Each one reads rules the app already has and tests:

    lib/deskSmart       which drawings will hold up site, who in the studio is
                        holding each, revision rounds still to bill or waive;
    lib/drawingIntel    drawings the client has had too long;
    lib/clientCare      the client pulse (as the Ops Desk works it out) and
                        the handover checklist;
    lib/clientNextMove  the next move with this client (as Clients says it);
    lib/fridayDigest    this week's update to the client.

  Nothing here writes or sends. Pure, so the tests run it.
*/

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ───────────── design ───────────── */

export interface SiteLine {
  id: string;
  name: string;
  risk: SiteRisk;
  /** Who in the studio has it, and for how long; null when nobody in the studio does. */
  held: Held | null;
  /** Days the client has had it, when it is with them. */
  withClientDays: number | null;
}

export interface DesignPicture {
  /** Drawings late for site, or that will be at this pace, or ready and needed soon; the most urgent first. */
  site: SiteLine[];
  /** Drawings the client has had more than a week (lib/drawingIntel). */
  clientHolding: { count: number; worst: { name: string; days: number } | null };
  /** Revision rounds past the included ones, not billed or waived. Empty for a role that does not bill. */
  rounds: RoundToBill[];
}

/**
 * The Design conversation's card. `rows` are the Drawing Tracker's rows as the
 * Design Desk reads them (services/drawingReviewService toDrawing); `items`
 * the same rows raw, which drawingIntel reads. Null when there is nothing to say.
 */
export function designPicture(i: {
  projectId: string; projectName: string; rows: SmartRow[]; items: DrawingTrackerItem[];
  meetings: DesignMeeting[] | null; now: number; staleAfterDays?: number;
}): DesignPicture | null {
  const byId = new Map((i.items || []).map((d) => [d.id, d]));
  const site = siteRisks(i.rows || [], new Date(i.now)).map(({ d, risk }) => {
    const raw = byId.get(d.id);
    const t = raw ? turnaroundOf(raw, i.now) : null;
    return {
      id: d.id, name: (d as any).name || raw?.name || 'Drawing', risk,
      held: heldBy(d.review, i.now),
      withClientDays: t && t.state === 'with_client' ? t.daysWithClient : null,
    };
  });
  const turn = summariseTurnaround(i.items || [], i.staleAfterDays ?? 7, i.now);
  const clientHolding = { count: turn.stale, worst: turn.worst && turn.worst.days > turn.staleAfterDays ? turn.worst : null };
  const rounds = i.meetings ? roundsToBill({ [i.projectId]: i.meetings }, () => i.projectName) : [];
  if (!site.length && !clientHolding.worst && !rounds.length) return null;
  return { site, clientHolding, rounds };
}

/** "With the Design Head 2 days", "With Riya 1 day", "With the client 9 days", or null. */
export function holderLine(s: Pick<SiteLine, 'held' | 'withClientDays'>, designerName?: string | null): string | null {
  if (s.held) {
    const who = s.held.who === 'head' ? 'the Design Head' : (String(designerName || '').split(/[\s@]/)[0] || 'the designer');
    return `With ${who} ${plural(s.held.days, 'day')}`;
  }
  if (s.withClientDays != null) return `With the client ${plural(s.withClientDays, 'day')}`;
  return null;
}

/* ───────────── the client ───────────── */

export interface CareRecords {
  followUps: FollowUp[];
  escalations: Escalation[];
  decisions: any[];
  moms: { status: string }[];
  visits: Pick<VisitRequest, 'reschedules' | 'status'>[];
  checklists: Partial<Record<ChecklistKind, Checklist>>;
}

/**
 * The client pulse for one project, worked out exactly as the Ops Desk works
 * it out (components/opsDesk/OpsDeskPage): what the client owes and has not
 * decided, chased from the follow-up log, then lib/clientCare clientPulse.
 */
export function projectPulse(i: {
  project: { id: string; name: string; targetHandover: string | null };
  money: ClientMoney | null; care: CareRecords; settings: OpsSettings; now: number;
}): Pulse {
  const waiting = projectWaiting(i);
  return clientPulse({
    waiting, followUps: i.care.followUps, escalations: i.care.escalations.filter((e) => e.status !== 'closed'),
    moms: i.care.moms, visits: i.care.visits, money: i.money, targetHandover: i.project.targetHandover, now: i.now,
  });
}

/** What the client owes and has not decided on this project, chased from the follow-up log, as the Ops Desk lists it. */
export function projectWaiting(i: { project: { id: string; name: string }; money: ClientMoney | null; care: Pick<CareRecords, 'decisions' | 'followUps'>; settings: OpsSettings; now: number }): WaitingItem[] {
  return withChases([
    ...paymentWaiting(i.project, i.money, i.settings, i.now),
    ...decisionWaiting(i.project, i.care.decisions, i.now),
  ], i.care.followUps);
}

/** The next move with this client, as the Clients screen words it. */
export function projectNextMove(i: { status: string; money: ClientMoney | null; followUps: FollowUp[]; now: number }): NextMove {
  const last = i.followUps.reduce((m, f) => Math.max(m, f.at || 0), 0);
  return nextMove({
    bucket: STATUS_TO_BUCKET[i.status] || 'pipeline',
    milestones: i.money?.milestones || [],
    quietDays: last ? Math.floor((i.now - last) / 86400000) : null,
    now: i.now,
  });
}

/* ───────────── this week's update ───────────── */

export interface DigestLine { text: string; detail: string | null; tone: 'turn' | 'done' | 'plain' }

/** Whether the project is in work, so a weekly update is due (as the Ops Desk decides it). */
export function inWork(ctx: any, now: number): boolean {
  const ph = phaseOf(ctx || {}, { now });
  return ph.index >= 1 && !ph.complete;
}

/**
 * This week's update to the client (lib/fridayDigest), in one line for the
 * Client & portal conversation. A person writes it, a lead approves it, and it
 * is sent from the Ops Desk; this only says where it stands. Null when no
 * update is due, or it was skipped this week.
 */
export function digestLine(d: Pick<Digest, 'status' | 'preparedByName' | 'reviewNote' | 'sentAt'> | null, i: { inWork: boolean; now: number }): DigestLine | null {
  if (!i.inWork) return null;
  const IST = 5.5 * 3600000;
  const dow = new Date(i.now + IST).getUTCDay();
  const late = dow === 4 || dow === 5 || dow === 6 || dow === 0;
  const by = d?.preparedByName ? `Written by ${d.preparedByName}` : null;
  if (!d) return late ? { text: 'This week’s update is still to write', detail: 'Drafted from the week’s records on the Ops Desk', tone: 'turn' } : null;
  switch (d.status) {
    case 'draft': return { text: 'This week’s update is a draft', detail: by, tone: late ? 'turn' : 'plain' };
    case 'pending_review': return { text: 'This week’s update is waiting for approval', detail: by, tone: 'turn' };
    case 'returned': return { text: 'This week’s update was sent back', detail: d.reviewNote || by, tone: 'turn' };
    case 'approved': return { text: 'This week’s update is approved and ready to send', detail: by, tone: 'turn' };
    case 'sent': return {
      text: 'This week’s update went to the client',
      detail: d.sentAt ? new Date(d.sentAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : DIGEST_STATUS_LABEL.sent,
      tone: 'done',
    };
    default: return null;
  }
}

/* ───────────── handover readiness ───────────── */

export interface Readiness { done: number; total: number; pct: number; outstanding: string[]; settled: boolean }

/**
 * The handover checklist (lib/clientCare) as one figure, from the Execution
 * phase on. Null before then, or when the checklist has nothing in it.
 */
export function handoverReadiness(ctx: any, checklists: Partial<Record<ChecklistKind, Checklist>> | null | undefined, now: number): Readiness | null {
  if (phaseOf(ctx || {}, { now }).index < 3) return null;
  const p = progressOf(materialise('handover', checklists?.handover || null));
  if (!p.total) return null;
  return { done: p.done, total: p.total, pct: Math.round((p.done / p.total) * 100), outstanding: p.outstanding.map((x) => x.label), settled: p.settled };
}
