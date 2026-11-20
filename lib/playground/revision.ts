/**
 * BOQ Playground PR R — a signed BOQ revised on the plan.
 *
 * Today's Scope Revision flow, with the plan as its editor. A revision keeps
 * the revised BOQ as drawn (`ScopeRevisionRecord.playground.boq`: pieces,
 * civil work, room shares) and why each line changed; its ScopeDraft is
 * derived from that on every change, line by line against the signed lines
 * (each line keeps its id, so nothing has to be matched), so Revision Studio,
 * the Money preview and the Scope Revision document read it unchanged.
 * Amounts are the client's, rounded up to ₹100 a line, as the Detailed BOQ
 * the client signed has them (lib/playground/pricing docPricingOf).
 *
 * Pure.
 */
import type { BoqItem, DocumentIssue, Item, ProjectContext, ProposalTier } from '../../types';
import { isBillable } from '../boqPricing';
import { signedLinesFrom, type ScopeRevisionRecord, type SignedLine, type RevisionResult } from '../scopeRevision';
import { revisionFromDraft, draftSettings, type ScopeDraft, type DraftLine } from '../scopeDraft';
import { buildDetailedBoqSnapshot, detailedBoqReference, normaliseUnit, clientDescription, displayName } from '../detailedBoq';
import { buildScopeRevisionSnapshot, scopeRevisionReference, type ScopeRevisionSnapshot } from '../scopeDocuments';
import { detailedBoqVersion } from '../scopeFlow';
import { issueDocument } from '../../services/documentIssueEngine';
import { publish, isVisibleToClient } from '../clientVisibility';
import { defaultTotalsOptions } from '../scopeTotals';
import { docPricingOf, docLine } from './pricing';
import { unitCostOf } from './excel';

/** Why a line changed, as the mockup offers it. */
export const REVISION_REASONS = ['Client request', 'Design upgrade', 'Site condition', 'Value engineering', 'Correction'] as const;

const live = (l: BoqItem) => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted';

/** The signed version's lines, priced as its Detailed BOQ is. */
export const signedLinesOf = (base: ProposalTier, bankMap: Map<string, Item>, rooms: ProjectContext['rooms']) =>
  signedLinesFrom(base.boq || [], bankMap, docPricingOf(base, rooms, bankMap));

/**
 * The revision's draft, from the BOQ as drawn: one draft line per priced line,
 * at its plan quantity and its rounded amount (the rate is that over the
 * quantity, so qty × rate is what the client is charged), tied to the signed
 * line of the same id. A signed line no longer drawn is a removal.
 */
export function draftFromPlan(args: {
  signed: SignedLine[]; boq: BoqItem[]; base: ProposalTier; bankMap: Map<string, Item>; rooms: ProjectContext['rooms'];
  reasons?: Record<string, string>; summary?: string; roomNotes?: Record<string, string>;
}): ScopeDraft {
  const { signed, bankMap, reasons = {} } = args;
  /* The revised BOQ is priced by the signed version's rules, measured on its own plan. */
  const pricing = docPricingOf({ ...args.base, boq: args.boq }, args.rooms, bankMap);
  const byId = new Map(signed.map(s => [s.lineId, s]));
  const lines: DraftLine[] = [];
  (args.boq || []).filter(l => live(l) && isBillable(l)).forEach(l => {
    const d = docLine(l, bankMap, pricing);
    if (!(d.qty > 0)) return;
    const s = byId.get(String(l.id));
    const name = d.r.name;
    const room = d.r.room;
    const rate = pricing ? d.amount / d.qty : d.r.rate;
    const same = !!s && Math.abs(s.qty - d.qty) < 1e-9 && Math.abs(s.amount - d.amount) < 0.005 && s.name === name && s.room === room;
    const item = bankMap.get(l.bankId);
    lines.push({
      id: String(l.id),
      signedLineId: s ? s.lineId : null,
      room, name,
      unit: normaliseUnit(d.r.unit),
      qty: d.qty,
      rate,
      source: same ? 'signed' : 'edit',
      ...(d.r.asActuals ? { asActuals: true } : {}),
      bankId: l.bankId || null,
      cost: unitCostOf(l, bankMap),
      description: clientDescription(l, item) || null,
      editNote: reasons[String(l.id)] || null,
    });
  });
  return { lines, roomOf: {}, sectionCompare: [], basis: 1, excel: null, summary: args.summary || '', roomNotes: args.roomNotes || {} };
}

/** What the revision comes to against the signed version: the same result the document is built from. */
export function planRevisionResult(rec: ScopeRevisionRecord, base: ProposalTier, bankMap: Map<string, Item>, rooms: ProjectContext['rooms']): { signed: SignedLine[]; draft: ScopeDraft; result: RevisionResult } {
  const signed = signedLinesOf(base, bankMap, rooms);
  const draft = draftFromPlan({ signed, boq: rec.playground?.boq || [], base, bankMap, rooms, reasons: rec.playground?.reasons, summary: rec.draft?.summary, roomNotes: rec.draft?.roomNotes });
  return { signed, draft, result: revisionFromDraft(signed, draft) };
}

/** A new revision of the signed version, to change on the plan: its BOQ as signed, nothing changed yet. */
export function startPlanRevision(args: { base: ProposalTier; number: number; id: string; by: string; at: number; bankMap: Map<string, Item>; rooms: ProjectContext['rooms'] }): ScopeRevisionRecord {
  const { base, at } = args;
  const boq = JSON.parse(JSON.stringify(base.boq || []));
  const signed = signedLinesOf(base, args.bankMap, args.rooms);
  const draft = draftFromPlan({ signed, boq, base, bankMap: args.bankMap, rooms: args.rooms });
  return {
    id: args.id,
    number: args.number,
    status: 'draft',
    createdAt: at,
    createdBy: args.by,
    updatedAt: at,
    baseTierId: base.id,
    source: { fileName: '', sheetName: '', importedAt: at, lineCount: 0, listTotal: 0 },
    imported: [],
    settings: draftSettings(draft),
    draft,
    playground: { boq, reasons: {} },
  } as ScopeRevisionRecord;
}

/** The revision with its BOQ (and reasons) changed: the draft follows. */
export function withPlanBoq(rec: ScopeRevisionRecord, next: { boq?: BoqItem[]; reasons?: Record<string, string> }, base: ProposalTier, bankMap: Map<string, Item>, rooms: ProjectContext['rooms'], at = Date.now()): ScopeRevisionRecord {
  const playground = { boq: next.boq ?? rec.playground?.boq ?? [], reasons: next.reasons ?? rec.playground?.reasons ?? {} };
  const signed = signedLinesOf(base, bankMap, rooms);
  const draft = draftFromPlan({ signed, boq: playground.boq, base, bankMap, rooms, reasons: playground.reasons, summary: rec.draft?.summary, roomNotes: rec.draft?.roomNotes });
  return { ...rec, playground, draft, settings: draftSettings(draft), updatedAt: at };
}

/** The changed lines (by draft line id, a removal as `removed:{id}`) that still need a reason. */
export function needingReason(result: RevisionResult, reasons: Record<string, string>): string[] {
  return result.rooms.flatMap(r => r.lines).filter(l => l.kind !== 'same').map(l => l.id)
    .filter(id => !(reasons[id] || reasons[id.replace(/^removed:/, '')] || '').trim());
}

export type IssueOutcome =
  | { problem: string }
  | { update: (prev: ProjectContext) => ProjectContext; reference: string; snapshot: ScopeRevisionSnapshot };

/**
 * The revision issued to the client: the same Scope Revision document as today
 * (the revised Detailed BOQ as its attachment, the change in six parts), with
 * each change's reason, put in the client's portal to sign. The signed BOQ
 * stays the contract until they do.
 */
export function issuePlanRevision(args: {
  ctx: ProjectContext; rec: ScopeRevisionRecord; base: ProposalTier; v1: DocumentIssue; bankMap: Map<string, Item>;
  by: string; orgName?: string | null; v2TierId: string; at?: number;
}): IssueOutcome {
  const { ctx, rec, base, v1, bankMap, by } = args;
  const reasons = rec.playground?.reasons || {};
  const { signed, draft, result } = planRevisionResult(rec, base, bankMap, ctx.rooms);
  const missing = needingReason(result, reasons);
  if (missing.length) return { problem: `${missing.length} change${missing.length === 1 ? ' has' : 's have'} no reason. The client reads the reason beside each change.` };
  if (!result.rooms.some(r => r.lines.some(l => l.kind !== 'same'))) return { problem: 'Nothing has changed against the signed BOQ yet.' };
  if (Math.abs(result.bridgeGap) > 0.01) return { problem: 'The parts of the change do not add up. Nothing was issued.' };
  const reference = scopeRevisionReference(ctx, v1.reference, rec.number);
  const n = detailedBoqVersion(v1) + 1;
  const v2 = buildDetailedBoqSnapshot({
    context: ctx,
    tier: { id: args.v2TierId, boq: rec.playground?.boq || [], pricingRules: base.pricingRules },
    bankMap,
    version: n,
    reference: detailedBoqReference(ctx, n),
    approval: { mode: 'via_revision', revisionReference: reference } as any,
    org: { orgName: args.orgName || null },
    replaces: { reference: v1.reference, total: result.v1Total },
  });
  if (Math.abs(v2.total - result.v2Total) > 0.01) return { problem: 'The revised Detailed BOQ does not price to the revision. Nothing was issued.' };
  const snapshot = buildScopeRevisionSnapshot({
    context: ctx,
    number: rec.number,
    reference,
    result,
    settings: draftSettings(draft),
    v1: { reference: v1.reference, total: result.v1Total, approvedOn: (v1 as any).recordedApproval?.approvedAt || (v1.clientSignature as any)?.signedAt || null, fingerprint: v1.contentHash },
    v2,
    issuedBy: by,
    org: { orgName: args.orgName || null },
    signed,
    reasons,
  });
  const withTotals = { ...snapshot, clientTotals: defaultTotalsOptions(ctx) } as ScopeRevisionSnapshot;
  const update = (prev: ProjectContext): ProjectContext => {
    const withIssue = issueDocument('scope_revision', withTotals, { issuedBy: by, reference, materialSections: [] })(prev);
    const issues = withIssue.documents!.issues;
    const issued = issues[issues.length - 1];
    const at = args.at ?? Date.now();
    /* In the client's portal, with the Detailed BOQ it revises, to sign there as today. */
    const published = issues.map(i => {
      if (i.id === issued.id) return { ...i, clientVisibility: publish(by), sentAt: at, releasedVia: ['portal'] as ('portal' | 'email')[] };
      if (i.id === v1.id && !isVisibleToClient(i as any)) return { ...i, clientVisibility: publish(by) };
      return i;
    });
    const nextRec: ScopeRevisionRecord = {
      ...rec, draft, settings: draftSettings(draft), status: 'issued', updatedAt: at,
      issueId: issued.id, reference, v2Reference: v2.reference, v2Total: v2.total, v2TierId: args.v2TierId,
    };
    return { ...withIssue, documents: { ...withIssue.documents!, issues: published }, scopeRevisions: (withIssue.scopeRevisions || []).map(r => (r.id === rec.id ? nextRec : r)) };
  };
  return { update, reference, snapshot: withTotals };
}

/** Back to a draft to change: the issued document is withdrawn (unless already signed); nothing in force moves. */
export const withdrawPlanRevision = (rec: ScopeRevisionRecord, at = Date.now(), reason = 'Withdrawn by the studio before signature') => (prev: ProjectContext): ProjectContext => ({
  ...prev,
  documents: prev.documents
    ? { ...prev.documents, issues: prev.documents.issues.map(i => (i.id === rec.issueId && !i.clientSignature && !(i as any).recordedApproval ? { ...i, withdrawnAt: at, withdrawnReason: reason } : i)) }
    : prev.documents,
  scopeRevisions: (prev.scopeRevisions || []).map(r => (r.id === rec.id ? { ...r, status: 'draft', issueId: null, updatedAt: at } : r)),
});

/** The revision as the client signed it, ready to apply: the BOQ as drawn, and what it prices to. */
export function signedPlanRevision(rec: ScopeRevisionRecord, base: ProposalTier, bankMap: Map<string, Item>, rooms: ProjectContext['rooms']) {
  const { result } = planRevisionResult(rec, base, bankMap, rooms);
  return { revisedBoq: JSON.parse(JSON.stringify(rec.playground?.boq || [])), priced: result.v2Total, v1Total: result.v1Total };
}

/** The line's name as the client reads it, for a removed line's row. */
export const lineName = (l: BoqItem, bankMap: Map<string, Item>) => displayName(bankMap.get(l.bankId)?.name || (l as { name?: string }).name || 'Line');
