/*
  A PROJECT DROPPED BEFORE IT IS FINISHED.

  A project can end early: the client never signs the execution agreement, the
  studio stops because it was not signed, the client asks to stop, or the
  studio has to. Marking such a project "Lost" was the only thing on offer,
  and it got the money wrong three ways: the reports dropped the cash already
  collected along with the contract, nothing said what the studio keeps and
  what goes back, and the client's portal stayed open.

  A termination is a record on the project (`context.termination`) beside the
  status, which goes to `lost` so every screen that already files a closed
  project away keeps doing so. The record carries the settlement:

    studio keeps  =  design contract x share done
                   + execution contract x share done      (both with their GST)
                   + other charges to recover
    net           =  studio keeps - collected so far

  A positive net is a balance the client still owes; a negative one is a
  refund the studio owes. It stays open until the money moves (or is waived).

  Pure: no React, no Firestore. Shared by the screens, the reports and tests.
*/
import type { ScheduleResult } from './paymentSchedule';

export type TerminationReason =
  | 'agreement_not_signed'
  | 'studio_discontinued'
  | 'client_request'
  | 'studio_unavoidable'
  | 'other';

export const TERMINATION_REASONS: { id: TerminationReason; label: string; by: 'client' | 'studio'; blurb: string }[] = [
  { id: 'agreement_not_signed', label: 'Client did not sign the execution agreement', by: 'client', blurb: 'The agreement was sent and never signed.' },
  { id: 'studio_discontinued', label: 'Studio stopped: agreement not signed', by: 'studio', blurb: 'The studio is ending its services because the agreement is not signed.' },
  { id: 'client_request', label: 'Client asked to stop', by: 'client', blurb: 'The client ended the project for reasons of their own.' },
  { id: 'studio_unavoidable', label: 'Studio had to stop', by: 'studio', blurb: 'The studio is ending the project for a reason it could not avoid.' },
  { id: 'other', label: 'Another reason', by: 'studio', blurb: 'Say what happened in the note.' },
];

const STAGE_WORDS: Record<string, string> = {
  lead: 'a new lead', draft: 'being drafted', proposal_sent: 'at proposal', negotiation: 'in negotiation',
  won: 'won, before site work', execution: 'on site', work_paused: 'on hold', completed: 'handed over',
};
/** Where the project stood when it was terminated, in words: "on site". Kept so the record says how far it got. */
export const stageWhenEnded = (t: { prevStatus?: string } | null | undefined): string | null =>
  (t?.prevStatus && STAGE_WORDS[t.prevStatus]) || null;

export const reasonLabel = (r: unknown): string =>
  TERMINATION_REASONS.find((x) => x.id === r)?.label || 'Terminated';

/** How "what the studio keeps" is worked out. */
export type SettlementBasis = 'prorata' | 'keep_paid' | 'refund_all' | 'custom';

export const SETTLEMENT_BASES: { id: SettlementBasis; label: string; blurb: string }[] = [
  { id: 'prorata', label: 'Pro-rata', blurb: 'Keep the share of each fee that matches the work done.' },
  { id: 'keep_paid', label: 'Keep what is paid', blurb: 'Nothing goes back and nothing more is owed.' },
  { id: 'refund_all', label: 'Refund in full', blurb: 'Everything collected goes back to the client.' },
  { id: 'custom', label: 'Set an amount', blurb: 'Type the amount the studio keeps, GST included.' },
];

export type SettlementStatus = 'open' | 'settled' | 'waived';

/** What the project's money looked like on the day it was terminated. All figures include GST. */
export interface SettlementInputs {
  /** Design contract with its GST. */
  designGross: number;
  /** Execution contract with its GST. */
  executionGross: number;
  /** The same two before GST, for the reports. */
  designTaxable: number;
  executionTaxable: number;
  /** Everything the client has paid, retainer included. */
  collected: number;
  /** Invoices raised and not paid. The settlement replaces them. */
  invoicedUnpaid: number;
  /** A starting point for the design share done: the share of the design fee already billed. */
  suggestedDesignPct: number;
  /** The same for execution; 0 before execution starts. */
  suggestedExecutionPct: number;
}

/** What the studio owner chooses in the terminate dialog. */
export interface SettlementDraft {
  basis: SettlementBasis;
  designDonePct: number;
  executionDonePct: number;
  /** Costs to recover on top (a site survey, material already ordered), GST included. */
  charges: number;
  chargesNote?: string;
  /** For basis `custom`: the amount the studio keeps, GST included. */
  customAmount?: number;
}

export interface TerminationSettlement extends SettlementDraft {
  designGross: number;
  executionGross: number;
  /** Kept from each track, GST included. Zero unless the basis is pro-rata. */
  designKept: number;
  executionKept: number;
  /** What the studio keeps in all, GST included. */
  entitled: number;
  /** The same before GST, split by track, for the reports' booked value. */
  keptExGst: { design: number; execution: number };
  collected: number;
  invoicedUnpaid: number;
  /** entitled - collected. Above zero the client owes it; below zero the studio refunds it. */
  net: number;
  status: SettlementStatus;
  /** The day the refund was paid or the balance came in (yyyy-mm-dd). */
  settledOn?: string | null;
  settledNote?: string | null;
  settledBy?: string | null;
}

export interface ProjectTermination {
  /** When it was recorded. */
  at: number;
  by: string;
  /** The day the termination takes effect (yyyy-mm-dd). */
  effectiveOn: string;
  reason: TerminationReason;
  initiatedBy: 'client' | 'studio';
  note: string;
  /** Where the project stood, so reopening puts it back. */
  prevStatus: string;
  prevStage: number | null;
  settlement: TerminationSettlement;
  /** When the client's portal was closed. */
  portalRevokedAt?: number | null;
}

const R = Math.round;
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const clampPct = (v: unknown) => Math.min(100, Math.max(0, num(v)));

export const isTerminated = (ctx: any): boolean => !!ctx?.termination && ctx?.status === 'lost';

/** Whether there is anything to settle: a contract in force or money already in. */
export function needsSettlement(ctx: any, schedule: ScheduleResult | null): boolean {
  const milestones: any[] = Array.isArray(ctx?.paymentMilestones) ? ctx.paymentMilestones : [];
  if (milestones.some((m) => m?.status === 'paid' || m?.status === 'invoiced')) return true;
  if ((schedule?.totals?.totalPaid || 0) > 0) return true;
  if (num(ctx?.financials?.initiationFeePaid) > 0) return true;
  return ['won', 'execution', 'work_paused', 'completed'].includes(String(ctx?.status || ''));
}

/** The money as it stands, read off the one payment schedule (lib/paymentSchedule). */
export function settlementInputs(ctx: any, schedule: ScheduleResult | null): SettlementInputs {
  const t = schedule?.totals;
  const milestones: any[] = Array.isArray(ctx?.paymentMilestones) ? ctx.paymentMilestones : [];
  const billedShare = (track: 'design' | 'execution') => clampPct(
    milestones
      .filter((m) => (m?.type === 'execution' ? 'execution' : 'design') === track && (m?.status === 'paid' || m?.status === 'invoiced'))
      .reduce((s, m) => s + num(m?.percentage), 0),
  );
  const invoicedUnpaid = milestones
    .filter((m) => m?.status === 'invoiced')
    .reduce((s, m) => s + num(schedule?.byId?.[m.id]?.owed), 0);
  const startedOnSite = ['execution', 'work_paused', 'completed'].includes(String(ctx?.status || ''));
  return {
    designGross: R(num(t?.taxableDesign) + num(t?.gstOnDesign)),
    executionGross: R(num(t?.taxableExecution) + num(t?.gstOnExecution)),
    designTaxable: R(num(t?.taxableDesign)),
    executionTaxable: R(num(t?.taxableExecution)),
    collected: R(num(t?.totalPaid)),
    invoicedUnpaid: R(invoicedUnpaid),
    suggestedDesignPct: billedShare('design'),
    suggestedExecutionPct: startedOnSite ? billedShare('execution') : 0,
  };
}

/** The draft the dialog opens with: pro-rata on what has been billed. */
export const defaultDraft = (i: SettlementInputs): SettlementDraft => ({
  basis: 'prorata',
  designDonePct: i.suggestedDesignPct,
  executionDonePct: i.suggestedExecutionPct,
  charges: 0,
  chargesNote: '',
});

/** Works the settlement out. Never negative on what the studio keeps. */
export function computeSettlement(i: SettlementInputs, d: SettlementDraft): TerminationSettlement {
  const designDonePct = clampPct(d.designDonePct);
  const executionDonePct = clampPct(d.executionDonePct);
  const charges = Math.max(0, R(num(d.charges)));
  const gross = i.designGross + i.executionGross;
  const taxable = i.designTaxable + i.executionTaxable;
  /* Before GST, a lump amount is taken to carry the contract's own blend of GST. */
  const exGst = (v: number) => (gross > 0 ? v * (taxable / gross) : v);

  let designKept = 0, executionKept = 0, entitled = 0;
  let kept = { design: 0, execution: 0 };
  if (d.basis === 'prorata') {
    designKept = R(i.designGross * designDonePct / 100);
    executionKept = R(i.executionGross * executionDonePct / 100);
    entitled = designKept + executionKept + charges;
    kept = {
      design: R(i.designTaxable * designDonePct / 100 + exGst(charges)),
      execution: R(i.executionTaxable * executionDonePct / 100),
    };
  } else {
    entitled = d.basis === 'keep_paid' ? i.collected
      : d.basis === 'refund_all' ? 0
        : Math.max(0, R(num(d.customAmount)));
    /* A lump is filed against design first: that is the work done before execution. */
    const ex = R(exGst(entitled));
    const design = Math.min(ex, i.designTaxable > 0 ? i.designTaxable : ex);
    kept = { design, execution: Math.max(0, ex - design) };
  }

  const net = R(entitled - i.collected);
  return {
    basis: d.basis,
    designDonePct, executionDonePct,
    charges: d.basis === 'prorata' ? charges : 0,
    chargesNote: d.basis === 'prorata' ? String(d.chargesNote || '').trim() : '',
    ...(d.basis === 'custom' ? { customAmount: entitled } : {}),
    designGross: i.designGross, executionGross: i.executionGross,
    designKept, executionKept, entitled,
    keptExGst: kept,
    collected: i.collected,
    invoicedUnpaid: i.invoicedUnpaid,
    net,
    /* Nothing to move is nothing to chase. */
    status: net === 0 ? 'settled' : 'open',
    settledOn: null, settledNote: null, settledBy: null,
  };
}

/** One line for the settlement: who owes whom, and whether it is done. */
export function settlementLine(s: TerminationSettlement | null | undefined): { kind: 'refund' | 'balance' | 'even'; amount: number; text: string } {
  const net = num(s?.net);
  if (!s || net === 0) return { kind: 'even', amount: 0, text: 'Nothing to refund and nothing owed' };
  const amount = Math.abs(net);
  if (net < 0) {
    return { kind: 'refund', amount, text: s.status === 'settled' ? 'Refund paid to the client' : s.status === 'waived' ? 'Refund waived by the client' : 'Refund due to the client' };
  }
  return { kind: 'balance', amount, text: s.status === 'settled' ? 'Balance received from the client' : s.status === 'waived' ? 'Balance written off' : 'Balance due from the client' };
}

export interface TerminateInput {
  reason: TerminationReason;
  note: string;
  effectiveOn: string;
  settlement: TerminationSettlement;
  actor: string;
  /** Emails whose portal access is being taken away. */
  portalEmails?: string[];
  now?: number;
}

const histId = (now: number) => `hist_${now}_${Math.random().toString(36).substring(2, 7)}`;
const inr = (v: number) => `₹${R(Math.abs(v)).toLocaleString('en-IN')}`;

/** The project as it is saved once terminated. Milestones are left as they were: the record is the truth from here. */
export function applyTermination(ctx: any, input: TerminateInput): any {
  const now = input.now ?? Date.now();
  const by = TERMINATION_REASONS.find((r) => r.id === input.reason)?.by || 'studio';
  const line = settlementLine(input.settlement);
  const termination: ProjectTermination = {
    at: now,
    by: input.actor,
    effectiveOn: input.effectiveOn,
    reason: input.reason,
    initiatedBy: by,
    note: String(input.note || '').trim(),
    prevStatus: String(ctx?.status || 'draft'),
    prevStage: typeof ctx?.lifecycle?.stage === 'number' ? ctx.lifecycle.stage : null,
    settlement: input.settlement,
    portalRevokedAt: now,
  };
  const clientPortal = { ...(ctx?.clientPortal || {}) };
  for (const email of input.portalEmails || []) {
    const key = String(email || '').trim().toLowerCase();
    if (key && clientPortal[key]?.issuedAt) clientPortal[key] = { ...clientPortal[key], revokedAt: now, revokedBy: input.actor };
  }
  const history = [
    {
      id: histId(now), at: now, actor: input.actor, category: 'stage',
      summary: `Project terminated: ${reasonLabel(input.reason)}`,
      detail: [
        termination.note || null,
        `Studio keeps ${inr(input.settlement.entitled)} of ${inr(input.settlement.collected)} collected. ${line.text}${line.amount ? `: ${inr(line.amount)}` : ''}. Client portal closed.`,
      ].filter(Boolean).join(' '),
    },
    ...(Array.isArray(ctx?.history) ? ctx.history : []),
  ].slice(0, 150);
  return {
    ...ctx,
    status: 'lost',
    statusPin: { status: 'lost', stage: termination.prevStage || 1, at: now, journeyStage: null },
    termination,
    clientPortal,
    history,
  };
}

/** Marks the refund paid, the balance received, or the amount waived. */
export function settleTermination(
  ctx: any,
  how: { status: 'settled' | 'waived' | 'open'; on?: string | null; note?: string | null; actor: string; now?: number },
): any {
  const t: ProjectTermination | undefined = ctx?.termination;
  if (!t) return ctx;
  const now = how.now ?? Date.now();
  const settlement: TerminationSettlement = {
    ...t.settlement,
    status: how.status,
    settledOn: how.status === 'open' ? null : (how.on || new Date(now).toISOString().slice(0, 10)),
    settledNote: how.status === 'open' ? null : (String(how.note || '').trim() || null),
    settledBy: how.status === 'open' ? null : how.actor,
  };
  const line = settlementLine(settlement);
  const summary = how.status === 'open'
    ? 'Termination settlement reopened'
    : `Termination: ${line.text.toLowerCase()}${line.amount ? ` (${inr(line.amount)})` : ''}`;
  return {
    ...ctx,
    termination: { ...t, settlement },
    history: [
      { id: histId(now), at: now, actor: how.actor, category: 'money', summary, detail: settlement.settledNote || null },
      ...(Array.isArray(ctx?.history) ? ctx.history : []),
    ].slice(0, 150),
  };
}

/** Changes the settlement figures after the fact (a wrong share, a late charge). Keeps who settled what only if the net is unchanged. */
export function reviseSettlement(ctx: any, next: TerminationSettlement, actor: string, now: number = Date.now()): any {
  const t: ProjectTermination | undefined = ctx?.termination;
  if (!t) return ctx;
  const same = next.net === t.settlement.net;
  const settlement: TerminationSettlement = same
    ? { ...next, status: t.settlement.status, settledOn: t.settlement.settledOn, settledNote: t.settlement.settledNote, settledBy: t.settlement.settledBy }
    : next;
  const line = settlementLine(settlement);
  return {
    ...ctx,
    termination: { ...t, settlement },
    history: [
      {
        id: histId(now), at: now, actor, category: 'money',
        summary: 'Termination settlement changed',
        detail: `Studio keeps ${inr(settlement.entitled)}. ${line.text}${line.amount ? `: ${inr(line.amount)}` : ''}.`,
      },
      ...(Array.isArray(ctx?.history) ? ctx.history : []),
    ].slice(0, 150),
  };
}

/** Undoes a termination: the project goes back to where it stood. The portal stays closed until it is sent again. */
export function reinstateProject(ctx: any, actor: string, now: number = Date.now()): any {
  const t: ProjectTermination | undefined = ctx?.termination;
  if (!t) return ctx;
  const status = t.prevStatus && t.prevStatus !== 'lost' ? t.prevStatus : 'draft';
  const { termination: _gone, ...rest } = ctx;
  return {
    ...rest,
    status,
    statusPin: { status, stage: t.prevStage || ctx?.lifecycle?.stage || 1, at: now, journeyStage: null },
    history: [
      {
        id: histId(now), at: now, actor, category: 'stage',
        summary: 'Termination undone: project reopened',
        detail: 'The client portal stays closed until it is sent again and logins are given back.',
      },
      ...(Array.isArray(ctx?.history) ? ctx.history : []),
    ].slice(0, 150),
  };
}

/** What a terminated project is worth to the studio: what it keeps, GST included. Null when not terminated. */
export const terminatedValue = (ctx: any): number | null =>
  isTerminated(ctx) ? num(ctx.termination?.settlement?.entitled) : null;

const dayMs = (s: unknown): number | null => {
  if (!s) return null;
  const t = new Date(String(s)).getTime();
  return isFinite(t) ? t : null;
};

/**
 * The settlement as one more payment row, for the reports: a refund paid is
 * cash out on its day, a balance due is an unpaid invoice until it comes in.
 * A refund still owed has moved no money yet, and a waived amount never will.
 */
export function settlementRow(ctx: any): { status: 'invoiced' | 'paid'; amount: number; invoicedAt: number | null; paidAt: number | null } | null {
  if (!isTerminated(ctx)) return null;
  const t: ProjectTermination = ctx.termination;
  const s = t.settlement;
  if (!s || s.net === 0 || s.status === 'waived') return null;
  const raisedAt = dayMs(t.effectiveOn) ?? t.at;
  if (s.status === 'settled') return { status: 'paid', amount: s.net, invoicedAt: raisedAt, paidAt: dayMs(s.settledOn) ?? raisedAt };
  return s.net > 0 ? { status: 'invoiced', amount: s.net, invoicedAt: raisedAt, paidAt: null } : null;
}
