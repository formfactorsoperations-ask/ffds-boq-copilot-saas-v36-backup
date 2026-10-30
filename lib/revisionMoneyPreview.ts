import type { DocumentIssue, Item, ProjectContext, ProposalTier } from '../types';
import { buildBankMap } from './boqPricing';
import { computeRevision, signedLinesFrom } from './scopeRevision';
import { draftOfRecord, revisionFromDraft } from './scopeDraft';
import { isSentBack } from './scopeChangeRequest';
import { computeSchedule, ScheduleResult } from './paymentSchedule';

/*
  WHAT A SCOPE REVISION WOULD DO TO THE MONEY, BEFORE IT DOES IT.

  The Money tab bills the approved scope, and the approved scope changes only
  when the studio applies a revision the client approved. That is deliberate:
  a revision in draft, with the client, or sent back must not move a single
  figure the studio collects against. But it left the studio unable to see what
  a revision means for the milestones until it was too late to say so to the
  client.

  So this works out the open revision's revised execution value (from the draft
  while it is being edited, from the issued document once it is issued) and runs
  the Money tab's own schedule engine on it, exactly as it will run once the
  revision is applied: same discounts, GST, billable share, retainer, invoiced
  and paid milestones. It is a preview. Nothing here is stored.
*/

export type PendingRevisionState = 'draft' | 'with_client' | 'sent_back' | 'approved';

export interface PendingRevision {
  id: string;
  number: number;
  state: PendingRevisionState;
  reference: string | null;
  /** Execution scope in force now, before discount. */
  v1Total: number;
  /** The revised execution scope, before discount. */
  v2Total: number;
}

const OPEN = new Set(['draft', 'issued', 'signed']);

/** The revision still open on this project, with its revised total; null when there is none. */
export function pendingRevision(ctx: ProjectContext, tiers: ProposalTier[], bank: Item[]): PendingRevision | null {
  const rec = (ctx.scopeRevisions || [])
    .filter(r => OPEN.has(r.status))
    .sort((a, b) => b.number - a.number)[0];
  if (!rec) return null;
  const issue: DocumentIssue | null = rec.issueId
    ? (ctx.documents?.issues || []).find(i => i.id === rec.issueId) || null
    : null;

  let v1Total: number;
  let v2Total: number;
  if (rec.status !== 'draft' && issue?.snapshot?.v2) {
    /* Issued: the frozen figures the client is looking at. */
    v1Total = Number(issue.snapshot.v1?.total) || 0;
    v2Total = Number(issue.snapshot.v2.total) || 0;
  } else {
    /* Still a draft: what it prices to now, as the Revisions screen shows it. */
    const base = tiers.find(t => t.id === rec.baseTierId);
    if (!base) return null;
    const bankMap = buildBankMap(bank, ctx.adHocItems);
    const signed = signedLinesFrom(base.boq, bankMap);
    const result = rec.draft || !rec.imported?.length
      ? revisionFromDraft(signed, draftOfRecord(rec, signed, base.boq, bankMap))
      : computeRevision(signed, rec.imported, rec.settings);
    v1Total = result.v1Total;
    v2Total = result.v2Total;
  }
  if (!(v2Total > 0)) return null;

  const approved = !!(issue?.clientSignature || issue?.recordedApproval);
  const state: PendingRevisionState = rec.status === 'draft' || !issue
    ? 'draft'
    : approved ? 'approved' : isSentBack(issue) ? 'sent_back' : 'with_client';
  return { id: rec.id, number: rec.number, state, reference: issue?.reference || rec.reference || null, v1Total, v2Total };
}

export interface MilestoneShift {
  id: string;
  name: string;
  type: 'design' | 'execution';
  status: string;
  /** Invoiced or paid: billed at its locked amount, so it does not move. */
  cleared: boolean;
  now: number;
  revised: number;
  change: number;
}

export interface RevisionMoneyPreview {
  rows: MilestoneShift[];
  now: ScheduleResult;
  revised: ScheduleResult;
  /** Execution after discount, now and revised. */
  taxableNow: number;
  taxableRevised: number;
  /** Contract with GST, now and revised. */
  grossNow: number;
  grossRevised: number;
  /**
   * Execution the milestones cannot carry: every execution milestone already
   * billed, or billed beyond the revised value. Positive is a balance the
   * client will owe; negative, a credit owed to them. The revised Payment
   * Schedule adds a stage for it when the revision is applied.
   */
  unscheduled: number;
}

type ScheduleArgs = Parameters<typeof computeSchedule>[0];

/**
 * The schedule now, and as it will be once the revision is applied. `args` are
 * the very arguments the Money tab computes its schedule with, so the two can
 * only differ by the revision.
 */
export function previewRevisionMoney(args: ScheduleArgs, v2Total: number): RevisionMoneyPreview {
  const now = computeSchedule(args);
  /* Applying makes the revised BOQ the tier in force and its total the approved value. */
  const revised = computeSchedule({
    ...args,
    tierSummary: { ...(args.tierSummary || {}), totalSell: v2Total },
    overrides: { ...(args.overrides || {}), approvedExecutionValue: v2Total },
  });
  const rows: MilestoneShift[] = now.amounts.map(a => {
    const b = revised.byId[a.id];
    const r = b ? b.owed : a.owed;
    return { id: a.id, name: a.name, type: a.type, status: a.status, cleared: a.cleared, now: a.owed, revised: r, change: r - a.owed };
  });
  /* What the execution milestones add up to, against what the revised contract asks for. */
  const execBase = revised.amounts.filter(a => a.type === 'execution').reduce((s, a) => s + a.base, 0);
  const gap = Math.round(revised.totals.taxableExecution - execBase);
  return {
    rows,
    now,
    revised,
    taxableNow: now.totals.taxableExecution,
    taxableRevised: revised.totals.taxableExecution,
    grossNow: now.totals.grossProjectValue,
    grossRevised: revised.totals.grossProjectValue,
    unscheduled: Math.abs(gap) > 10 ? gap : 0,
  };
}
