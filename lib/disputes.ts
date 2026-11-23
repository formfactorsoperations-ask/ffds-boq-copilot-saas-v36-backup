/*
  A PAYMENT DISPUTE ON A PROJECT.

  Modelled on a real one (a 2BHK handed over in May 2026). The client moved
  in, refused further work, and contested five BOQ lines as not built to the
  drawings. He held back the whole balance for 38 days while the two sides
  traded positions by email, then it closed "full and final, without
  admission" at a large concession on execution and a smaller one on the
  design fee, paid into the two heads separately.

  What that needs from the software:

    - the amount in dispute by head (execution, design), as it stood;
    - the issues, each against a BOQ line: what was billed and what the
      client wants taken off;
    - the positions each side took, in order, with the amount on the table;
    - a settlement by head. The difference between what was claimed and what
      was settled is a concession, and it is written onto the unpaid
      invoices as their own concession (PaymentMilestone.discountAmount), so
      Money, the client's figures and the reports all read the settled sum
      and the contract itself is not rewritten.

  A dispute does not change the project's status: a handed-over project stays
  handed over. It is a record beside it (`context.disputes`), one open at a
  time. Pure: no React, no Firestore.
*/
import type { ScheduleResult } from './paymentSchedule';

export type DisputeTrack = 'execution' | 'design';
export type DisputeStatus = 'open' | 'settled' | 'withdrawn';

export interface DisputeIssue {
  id: string;
  title: string;
  /** The BOQ line or drawing it is about, as the studio refers to it. */
  ref?: string;
  /** What that line was billed at. */
  billed: number;
  /** What the client wants taken off it. */
  claimed: number;
}

/** One side's position on a day: an email, a call, a proposal. */
export interface DisputePosition {
  id: string;
  on: string;
  by: 'client' | 'studio';
  note: string;
  /** The total the client would pay under this position, if it named one. */
  amount?: number | null;
}

export interface DisputeAmounts { execution: number; design: number }

export interface DisputeResolution {
  on: string;
  by: string;
  /** What the client pays to close it, by head. */
  settled: DisputeAmounts;
  /** claimed - settled, by head: what the studio gives up. */
  concession: DisputeAmounts;
  reason: string;
  /** Settled for closure only; neither side accepts the other's account. */
  withoutAdmission: boolean;
  /** Where the concession was written, so it can be taken off again. */
  appliedTo: { milestoneId: string; amount: number }[];
  /** Concession with no unpaid invoice to sit on. */
  unallocated: number;
}

export interface ProjectDispute {
  id: string;
  title: string;
  summary: string;
  raisedBy: 'client' | 'studio';
  openedOn: string;
  openedBy: string;
  /** The project's status when it was raised. */
  stage: string;
  /** Unpaid by head when it was raised: what the studio says is owed. */
  claimed: DisputeAmounts;
  /** The client has barred further work on site. */
  workStopped?: boolean;
  issues: DisputeIssue[];
  positions: DisputePosition[];
  status: DisputeStatus;
  resolution?: DisputeResolution | null;
  closedOn?: string | null;
  closedNote?: string | null;
}

const R = Math.round;
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const pos = (v: unknown) => Math.max(0, R(num(v)));
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const inr = (v: number) => `₹${R(Math.abs(v)).toLocaleString('en-IN')}`;
const trackOf = (m: any): DisputeTrack => (m?.type === 'execution' ? 'execution' : 'design');
const total = (a: DisputeAmounts) => a.execution + a.design;

export const disputesOf = (ctx: any): ProjectDispute[] => (Array.isArray(ctx?.disputes) ? ctx.disputes : []);
export const openDispute = (ctx: any): ProjectDispute | null => disputesOf(ctx).find((d) => d.status === 'open') || null;
export const inDispute = (ctx: any): boolean => !!openDispute(ctx);

/** What is unpaid on each head: the invoices raised and the milestones still to bill. */
export function outstandingByTrack(ctx: any, schedule: ScheduleResult | null): DisputeAmounts {
  const out: DisputeAmounts = { execution: 0, design: 0 };
  for (const m of (Array.isArray(ctx?.paymentMilestones) ? ctx.paymentMilestones : []) as any[]) {
    if (m?.status === 'paid') continue;
    out[trackOf(m)] += num(schedule?.byId?.[m.id]?.owed);
  }
  return { execution: R(out.execution), design: R(out.design) };
}

export interface DisputeDraft {
  title: string;
  summary: string;
  raisedBy: 'client' | 'studio';
  openedOn: string;
  claimed: DisputeAmounts;
  workStopped?: boolean;
  issues: DisputeIssue[];
}

export const cleanIssues = (issues: DisputeIssue[]): DisputeIssue[] => (issues || [])
  .filter((i) => String(i?.title || '').trim())
  .map((i) => {
    const billed = pos(i.billed);
    return { id: i.id || uid('iss'), title: String(i.title).trim(), ref: String(i.ref || '').trim() || undefined, billed, claimed: billed > 0 ? Math.min(pos(i.claimed), billed) : pos(i.claimed) };
  });

/** What the client's issues add up to. */
export const issuesTotal = (d: Pick<ProjectDispute, 'issues'> | null | undefined) => {
  const issues = d?.issues || [];
  return { billed: issues.reduce((s, i) => s + num(i.billed), 0), claimed: issues.reduce((s, i) => s + num(i.claimed), 0) };
};

/** The amount last put on the table, and by whom. */
export const latestOffer = (d: ProjectDispute | null | undefined): DisputePosition | null =>
  [...(d?.positions || [])].reverse().find((p) => p.amount != null) || null;

/** Days it has been (or was) open. */
export function daysOpen(d: ProjectDispute, now: number = Date.now()): number {
  const start = new Date(`${d.openedOn}T00:00:00`).getTime();
  const end = d.status === 'open' ? now : new Date(`${d.closedOn || d.openedOn}T00:00:00`).getTime();
  return isFinite(start) && isFinite(end) ? Math.max(0, Math.floor((end - start) / 86400000)) : 0;
}

const withHistory = (ctx: any, actor: string, category: 'money' | 'stage', summary: string, detail: string | null, now: number) => [
  { id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`, at: now, actor, category, summary, detail },
  ...(Array.isArray(ctx?.history) ? ctx.history : []),
].slice(0, 150);

const replace = (ctx: any, id: string, fn: (d: ProjectDispute) => ProjectDispute) =>
  disputesOf(ctx).map((d) => (d.id === id ? fn(d) : d));

/** Raises a dispute. One at a time: a second is refused while one is open. */
export function raiseDispute(ctx: any, draft: DisputeDraft, actor: string, now: number = Date.now()): any {
  if (openDispute(ctx)) return ctx;
  const dispute: ProjectDispute = {
    id: uid('dsp'),
    title: String(draft.title || '').trim() || 'Payment dispute',
    summary: String(draft.summary || '').trim(),
    raisedBy: draft.raisedBy,
    openedOn: draft.openedOn,
    openedBy: actor,
    stage: String(ctx?.status || 'draft'),
    claimed: { execution: pos(draft.claimed?.execution), design: pos(draft.claimed?.design) },
    workStopped: !!draft.workStopped,
    issues: cleanIssues(draft.issues),
    positions: [],
    status: 'open',
    resolution: null,
  };
  return {
    ...ctx,
    disputes: [...disputesOf(ctx), dispute],
    history: withHistory(ctx, actor, 'money', `Dispute raised: ${dispute.title}`,
      `${inr(total(dispute.claimed))} unpaid is in dispute${dispute.issues.length ? `, over ${dispute.issues.length} item${dispute.issues.length === 1 ? '' : 's'}` : ''}.`, now),
  };
}

/** Corrects the dispute's own details while it is open. */
export function editDispute(ctx: any, id: string, draft: DisputeDraft): any {
  return {
    ...ctx,
    disputes: replace(ctx, id, (d) => (d.status !== 'open' ? d : {
      ...d,
      title: String(draft.title || '').trim() || d.title,
      summary: String(draft.summary || '').trim(),
      raisedBy: draft.raisedBy,
      openedOn: draft.openedOn || d.openedOn,
      claimed: { execution: pos(draft.claimed?.execution), design: pos(draft.claimed?.design) },
      workStopped: !!draft.workStopped,
      issues: cleanIssues(draft.issues),
    })),
  };
}

/** Logs a position: what one side said, and the amount it put on the table. */
export function addPosition(ctx: any, id: string, p: Omit<DisputePosition, 'id'>, actor: string, now: number = Date.now()): any {
  const note = String(p.note || '').trim();
  if (!note && p.amount == null) return ctx;
  const entry: DisputePosition = { id: uid('pos'), on: p.on, by: p.by, note, amount: p.amount == null ? null : pos(p.amount) };
  return {
    ...ctx,
    disputes: replace(ctx, id, (d) => ({ ...d, positions: [...d.positions, entry].sort((a, b) => a.on.localeCompare(b.on)) })),
    history: withHistory(ctx, actor, 'money', `Dispute: ${p.by === 'client' ? 'client' : 'studio'} position${entry.amount != null ? ` at ${inr(entry.amount)}` : ''}`, note || null, now),
  };
}

export const removePosition = (ctx: any, id: string, positionId: string): any => ({
  ...ctx,
  disputes: replace(ctx, id, (d) => ({ ...d, positions: d.positions.filter((p) => p.id !== positionId) })),
});

/** The concession a settlement means, by head. Never negative: settling above the claim concedes nothing. */
export const concessionFor = (claimed: DisputeAmounts, settled: DisputeAmounts): DisputeAmounts => ({
  execution: Math.max(0, pos(claimed.execution) - pos(settled.execution)),
  design: Math.max(0, pos(claimed.design) - pos(settled.design)),
});

/**
 * Where a concession lands: on the unpaid invoices of its head first, then on
 * milestones still to bill, each up to what it is owed.
 */
export function allocateConcession(ctx: any, schedule: ScheduleResult | null, concession: DisputeAmounts) {
  const milestones: any[] = Array.isArray(ctx?.paymentMilestones) ? ctx.paymentMilestones : [];
  const appliedTo: { milestoneId: string; amount: number }[] = [];
  let unallocated = 0;
  (['execution', 'design'] as const).forEach((track) => {
    let left = pos(concession[track]);
    const rows = milestones.filter((m) => trackOf(m) === track && m?.status !== 'paid');
    const ordered = [...rows.filter((m) => m.status === 'invoiced'), ...rows.filter((m) => m.status !== 'invoiced')];
    for (const m of ordered) {
      if (left <= 0) break;
      const room = pos(schedule?.byId?.[m.id]?.invoiceTotal);
      const take = Math.min(room, left);
      if (take > 0) { appliedTo.push({ milestoneId: String(m.id), amount: take }); left -= take; }
    }
    unallocated += left;
  });
  return { appliedTo, unallocated };
}

export interface SettleInput {
  settled: DisputeAmounts;
  on: string;
  reason: string;
  withoutAdmission: boolean;
  actor: string;
  now?: number;
}

/** Closes the dispute at the settled amounts and writes the concession onto the unpaid invoices. */
export function settleDispute(ctx: any, id: string, schedule: ScheduleResult | null, input: SettleInput): any {
  const d = disputesOf(ctx).find((x) => x.id === id);
  if (!d || d.status !== 'open') return ctx;
  const now = input.now ?? Date.now();
  const settled = { execution: pos(input.settled.execution), design: pos(input.settled.design) };
  const concession = concessionFor(d.claimed, settled);
  const { appliedTo, unallocated } = allocateConcession(ctx, schedule, concession);
  const reason = String(input.reason || '').trim() || `Dispute settlement: ${d.title}`;
  const add = new Map(appliedTo.map((a) => [a.milestoneId, a.amount]));
  const paymentMilestones = (ctx.paymentMilestones || []).map((m: any) => (add.has(String(m.id))
    ? { ...m, discountAmount: pos(m.discountAmount) + add.get(String(m.id))!, discountReason: [m.discountReason, reason].filter(Boolean).join('; ') }
    : m));
  const resolution: DisputeResolution = { on: input.on, by: input.actor, settled, concession, reason, withoutAdmission: !!input.withoutAdmission, appliedTo, unallocated };
  return {
    ...ctx,
    paymentMilestones,
    disputes: replace(ctx, id, (x) => ({ ...x, status: 'settled', resolution, closedOn: input.on, closedNote: reason })),
    history: withHistory(ctx, input.actor, 'money', `Dispute settled at ${inr(total(settled))}`,
      `${d.title}. ${inr(total(d.claimed))} was claimed; ${inr(total(concession))} conceded (execution ${inr(concession.execution)}, design ${inr(concession.design)})${input.withoutAdmission ? ', full and final, without admission' : ''}.`, now),
  };
}

/** Takes a settlement back: the concession comes off the invoices and the dispute is open again. */
export function reopenDispute(ctx: any, id: string, actor: string, now: number = Date.now()): any {
  const d = disputesOf(ctx).find((x) => x.id === id);
  if (!d || d.status === 'open' || openDispute(ctx)) return ctx;
  const off = new Map((d.resolution?.appliedTo || []).map((a) => [a.milestoneId, a.amount]));
  const paymentMilestones = (ctx.paymentMilestones || []).map((m: any) => {
    if (!off.has(String(m.id))) return m;
    const left = Math.max(0, pos(m.discountAmount) - off.get(String(m.id))!);
    const { discountAmount: _a, discountReason: _r, ...rest } = m;
    return left > 0 ? { ...m, discountAmount: left } : rest;
  });
  return {
    ...ctx,
    paymentMilestones,
    disputes: replace(ctx, id, (x) => ({ ...x, status: 'open', resolution: null, closedOn: null, closedNote: null })),
    history: withHistory(ctx, actor, 'money', `Dispute reopened: ${d.title}`, d.resolution ? 'The settlement concession was taken off the invoices.' : null, now),
  };
}

/** The client drops it, or it is resolved with nothing conceded. */
export function withdrawDispute(ctx: any, id: string, how: { on: string; note: string; actor: string; now?: number }): any {
  const d = disputesOf(ctx).find((x) => x.id === id);
  if (!d || d.status !== 'open') return ctx;
  const now = how.now ?? Date.now();
  return {
    ...ctx,
    disputes: replace(ctx, id, (x) => ({ ...x, status: 'withdrawn', closedOn: how.on, closedNote: String(how.note || '').trim() || null })),
    history: withHistory(ctx, how.actor, 'money', `Dispute closed with nothing conceded: ${d.title}`, String(how.note || '').trim() || null, now),
  };
}

/* ── Out of the overdue chase ───────────────────────────────────────────── */

const dayStart = (iso: unknown): number | null => {
  if (!iso) return null;
  const t = new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime();
  return isFinite(t) ? t : null;
};

/** When each head was held in a dispute: from the day it was raised to the day it closed (null while open). */
export function disputeWindows(ctx: any): { track: DisputeTrack; from: number; to: number | null }[] {
  const out: { track: DisputeTrack; from: number; to: number | null }[] = [];
  for (const d of disputesOf(ctx)) {
    const from = dayStart(d.openedOn);
    if (from == null) continue;
    const to = d.status === 'open' ? null : (dayStart(d.closedOn) ?? from);
    (['execution', 'design'] as const).forEach((track) => { if (num(d.claimed?.[track]) > 0) out.push({ track, from, to }); });
  }
  return out;
}

/**
 * Whether an unpaid invoice is held in a dispute at a moment: its head is
 * part of a dispute that was open then. Such an invoice is owed but is not
 * late, and nobody should be told to chase it: the dispute is the chase.
 */
export function heldInDispute(ctx: any, milestone: any, at: number = Date.now()): boolean {
  if (!milestone || milestone.status === 'paid') return false;
  const track = trackOf(milestone);
  return disputeWindows(ctx).some((w) => w.track === track && at >= w.from && (w.to == null || at < w.to));
}
