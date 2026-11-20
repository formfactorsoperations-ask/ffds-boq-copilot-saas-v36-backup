import type { DocumentIssue, FinancialConfig, ProjectContext, ProposalTier } from '../types';
import type { ScopeRevisionRecord } from './scopeRevision';
import { issueDocument } from '../services/documentIssueEngine';
import { publish } from './clientVisibility';
import { scheduleForRevision, withRevisedSchedule } from './paymentScheduleRevision';

/**
 * A signed Scope Revision, applied: the revised BOQ becomes a new version of
 * the option and the contract in force; the next Detailed BOQ is issued from
 * the signed revision's own snapshot; the financials, payment snapshots and
 * revisions record the change; the next Payment Schedule version is staged
 * for the studio to release. Revision Studio and the BOQ Playground both apply
 * through here, so a revision made on either lands the same way.
 */
export interface ApplyRevisionInput {
  rec: ScopeRevisionRecord;
  /** The signed (or recorded) scope_revision issue. */
  issue: DocumentIssue;
  base: ProposalTier;
  /** The revised BOQ: rebuilt from the draft, or, for a revision made on the plan, its lines as drawn. */
  revisedBoq: any[];
  /** What the revised BOQ prices to: the signed revision's total. */
  priced: number;
  /** The signed scope's total, when the financials do not hold it. */
  v1Total: number;
  ctx: ProjectContext;
  by: string;
  at: number;
  /** The new version's id (the one the revision was issued with, if any). */
  tierId: string;
  /** More of the new version: a Playground version keeps its format and pricing rules. */
  extra?: Partial<ProposalTier>;
}

/** The new version of the option: the contract in force. */
export function appliedTier(a: ApplyRevisionInput): ProposalTier {
  return {
    id: a.tierId,
    name: `Detailed BOQ v${a.issue.snapshot.v2.version} · Scope Revision ${a.rec.number}`,
    timestamp: a.at,
    parentTierId: a.base.id,
    lifecycleTag: 'Current contract',
    projectContext: { ...a.ctx },
    boq: a.revisedBoq,
    summary: { ...a.base.summary, totalSell: a.priced, itemCount: a.revisedBoq.filter((b: any) => b.qty > 0).length },
    ...(a.extra || {}),
  } as ProposalTier;
}

/** The project once the revision is applied. */
export const appliedContext = (a: ApplyRevisionInput) => (prev: ProjectContext): ProjectContext => {
  const { rec, issue, base, priced, at, by, tierId } = a;
  const v2Snapshot = { ...issue.snapshot.v2, tierId, approval: { mode: 'via_revision', revisionReference: issue.reference } };
  const withBoq = issueDocument('detailed_boq', v2Snapshot, { issuedBy: by, reference: v2Snapshot.reference, materialSections: [] })(prev);
  const issues = withBoq.documents!.issues;
  const created = issues[issues.length - 1];
  const stamped = issues.map(i => (i.id === created.id ? { ...i, signedVia: issue.id, clientVisibility: publish(by) } : i));
  const fin: FinancialConfig = (prev.financials || {}) as FinancialConfig;
  const snapshots = fin.paymentSnapshots || [];
  /* The client's schedule was issued on the old value: stage the next
     version on the new one, for the studio to release as usual. */
  const designValue = fin.approvedDesignValue ?? (prev as any).engagement?.designFee ?? 0;
  const nextSchedule = scheduleForRevision(prev, {
    executionValue: priced,
    designValue,
    note: `Re-issued for Scope Revision ${rec.number} (${issue.reference}): execution scope ₹${Math.round(fin.approvedExecutionValue ?? a.v1Total).toLocaleString('en-IN')} → ₹${Math.round(priced).toLocaleString('en-IN')}.`,
    issuedBy: by,
    id: `ps_sr${rec.number}_${at.toString(36)}`,
    at,
  });
  return {
    ...withBoq,
    ...(nextSchedule ? { paymentSchedules: withRevisedSchedule(prev, nextSchedule) } : {}),
    documents: { ...withBoq.documents!, issues: stamped },
    approvedTierId: tierId,
    financials: {
      ...fin,
      approvedExecutionValue: priced,
      paymentSnapshots: snapshots.some(s => s.tierId === base.id) ? snapshots : [...snapshots, {
        tierId: base.id,
        tierName: base.name,
        timestamp: at,
        approvedExecutionValue: fin.approvedExecutionValue ?? a.v1Total,
        approvedDesignValue: fin.approvedDesignValue ?? 0,
        milestones: prev.paymentMilestones || [],
        billablePercent: fin.billablePercent,
        executionGstEnabled: fin.executionGstEnabled,
      } as any],
      paymentRevisions: [...(fin.paymentRevisions || []), {
        id: `sr-${rec.number}-${at}`,
        date: new Date(at).toISOString(),
        previousExecutionValue: fin.approvedExecutionValue ?? a.v1Total,
        newExecutionValue: priced,
        previousDesignValue: fin.approvedDesignValue ?? 0,
        newDesignValue: fin.approvedDesignValue ?? 0,
        reason: `Scope Revision ${rec.number} signed (${issue.reference})`,
      } as any],
    },
    scopeRevisions: (prev.scopeRevisions || []).map(r => (r.id === rec.id
      ? { ...r, status: 'applied', appliedAt: at, appliedBy: by, appliedTierId: tierId, detailedIssueId: created.id, updatedAt: at }
      : r)),
  };
};
