import { describe, it, expect } from 'vitest';
import { startPlanRevision, withPlanBoq, planRevisionResult, needingReason, issuePlanRevision, withdrawPlanRevision, signedPlanRevision } from '../../lib/playground/revision';
import { buildDetailedBoqSnapshot } from '../../lib/detailedBoq';
import { issueDocument, signIssue } from '../../services/documentIssueEngine';
import { publish } from '../../lib/clientVisibility';
import { PLAYGROUND_PRICING, playgroundTotals } from '../../lib/playground/pricing';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { appliedContext, appliedTier } from '../../lib/scopeApply';
import { lockedTierId } from '../../lib/scopeFlow';

const I = (id: string, name: string, cat: string, unit: string, materials: number, labor: number, margin = 25): any => ({ id, name, cat, unit, materials, labor, margin, specs: `${name} words` });
const bank: any[] = [
  I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft', 1500, 400),
  I('tv', 'TV unit', 'Carpentry', 'sq ft', 1400, 400),
  I('st', 'Study unit', 'Carpentry', 'sq ft', 1300, 400),
  I('hw', 'Hinged wardrobe', 'Carpentry', 'sq ft', 1300, 400),
  I('paint', 'Wall painting, two coats', 'Painting', 'sq ft', 18, 9),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const rooms: any[] = [
  { name: 'Living', size: 182, unit: 'sq ft', plan: { x: 0, y: 0, w: 13, h: 14 } },
  { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 13, y: 0, w: 12, h: 10 } },
];
/* Odd quantities, so every amount rounds up. */
const boq: any[] = [
  { id: 'a', bankId: 'w', qty: 41.3, roomId: 'Bedroom', calcLength: 5.9, calcWidth: 7, sizeUnit: 'ft', place: { x: 14, y: 1, rot: 0 } },
  { id: 'b', bankId: 'tv', qty: 7.88, roomId: 'Living' },
  { id: 'c', bankId: 'w', qty: 22.1, roomId: 'Living' },
  { id: 'd', bankId: 'paint', qty: 333.3, roomId: 'Living' },
];
const base: any = { id: 't1', name: 'Comfort Upgrade', boq, boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING, summary: {} };
const ctx0: any = { name: 'Palacia – 3BHK', clientName: 'Meera Shah', rooms, designFeeType: 'percentage', designFee: 10, scopeFlow: { enabled: true }, approvedTierId: 't1' };
/* The signed Detailed BOQ v1, as signing a Playground version issues it now. */
function signedProject() {
  const v1 = buildDetailedBoqSnapshot({ context: ctx0, tier: base, bankMap, version: 1, reference: 'PB-DB-2026-PAL-01', approval: { mode: 'portal' } as any });
  let ctx = issueDocument('detailed_boq', v1, { issuedBy: 'Studio', reference: 'PB-DB-2026-PAL-01' })(ctx0);
  const id = ctx.documents!.issues[0].id;
  ctx = { ...ctx, documents: { ...ctx.documents!, issues: ctx.documents!.issues.map(i => ({ ...i, clientVisibility: publish('Studio') })) } };
  ctx = signIssue(id, { name: 'Meera Shah', signedAt: Date.UTC(2026, 10, 12) })(ctx);
  return { ctx, v1: ctx.documents!.issues[0] };
}

describe('documents of a Playground version are priced as Money reads it', () => {
  it('the Detailed BOQ rounds each line up to ₹100, at its unit rate, and totals what Money shows', () => {
    const { v1 } = signedProject();
    const money = playgroundTierSummary(base, bankMap, ctx0).totalSell;
    expect(v1.snapshot.total).toBe(money);
    v1.snapshot.rooms.flatMap((r: any) => r.lines).forEach((l: any) => expect(l.amount % 100).toBe(0));
    const tv = v1.snapshot.rooms.flatMap((r: any) => r.lines).find((l: any) => l.id === 'b');
    expect(tv.amount).toBeGreaterThan(tv.qty * tv.rate);
    expect(tv.amount - tv.qty * tv.rate).toBeLessThan(100);
    // A Classic version keeps exact amounts.
    const classic = buildDetailedBoqSnapshot({ context: ctx0, tier: { id: 'c', boq }, bankMap, version: 1, reference: 'X', approval: { mode: 'portal' } as any });
    expect(classic.total).not.toBe(money);
  });
});

describe('a signed Playground BOQ revised on the plan', () => {
  const start = () => startPlanRevision({ base, number: 1, id: 'srev-1', by: 'Priya', at: 1, bankMap, rooms });

  it('starts as the signed BOQ, nothing changed', () => {
    const rec = start();
    expect(rec).toMatchObject({ status: 'draft', baseTierId: 't1', number: 1 });
    expect(rec.playground!.boq).toEqual(boq);
    expect(rec.playground!.boq).not.toBe(boq);
    const { result } = planRevisionResult(rec, base, bankMap, rooms);
    expect(result.change).toBe(0);
    expect(result.v1Total).toBe(playgroundTotals(boq, bankMap, { rules: PLAYGROUND_PRICING, rooms }).sell);
  });

  it('each change lands in the draft against the signed line of the same id; the parts add up to the change exactly', () => {
    const work = [
      { ...boq[0], qty: 56, calcLength: 8 },                  // size
      { ...boq[1], marginOverride: 30 },                      // rate
      { ...boq[2], bankId: 'hw' },                            // redesigned
      // d: removed
      { id: 'n', bankId: 'st', qty: 20.4, roomId: 'Living' }, // new
    ];
    const rec = withPlanBoq(start(), { boq: work }, base, bankMap, rooms);
    const { result, draft } = planRevisionResult(rec, base, bankMap, rooms);
    const kinds = Object.fromEntries(result.rooms.flatMap(r => r.lines).map(l => [l.id, l.kind]));
    expect(kinds).toEqual({ a: 'qty', b: 'rate', c: 'redesign', n: 'new', 'removed:d': 'removed' });
    expect(result.v2Total).toBe(playgroundTotals(work, bankMap, { rules: PLAYGROUND_PRICING, rooms }).sell);
    expect(Math.abs(result.bridgeGap)).toBeLessThan(0.01);
    const sum = Object.values(result.bridge).reduce((a, v) => a + v, 0);
    expect(Math.round(sum)).toBe(Math.round(result.change));
    expect(rec.draft).toEqual(draft);
    expect(needingReason(result, {})).toEqual(['a', 'b', 'c', 'n', 'removed:d']);
    expect(needingReason(result, { a: 'Client request', b: 'Design upgrade', c: 'Design upgrade', n: 'Client request', d: 'Value engineering' })).toEqual([]);
  });

  it('issues the same Scope Revision document, with each reason, in the client’s portal; the signed BOQ stays in force', () => {
    const { ctx, v1 } = signedProject();
    let rec = withPlanBoq(start(), { boq: [{ ...boq[0], qty: 56, calcLength: 8 }, boq[1], boq[2]] }, base, bankMap, rooms);
    const ctx1 = { ...ctx, scopeRevisions: [rec] };
    // No reason yet: not issued.
    expect(issuePlanRevision({ ctx: ctx1, rec, base, v1, bankMap, by: 'Priya', v2TierId: 'tv2' })).toEqual({ problem: '2 changes have no reason. The client reads the reason beside each change.' });
    rec = withPlanBoq(rec, { reasons: { a: 'Client request', d: 'Value engineering' } }, base, bankMap, rooms);
    const out = issuePlanRevision({ ctx: { ...ctx1, scopeRevisions: [rec] }, rec, base, v1, bankMap, by: 'Priya', v2TierId: 'tv2', at: 5 });
    if ('problem' in out) throw new Error(out.problem);
    expect(out.reference).toBe('PB-DB-2026-PAL-01-REV-01');
    const lines = out.snapshot.rooms.flatMap(r => r.lines);
    expect(lines.map(l => [l.name, l.tag, l.reason])).toEqual([['Sliding wardrobe', 'SIZE', 'Client request'], ['Wall painting, two coats', 'REMOVED', 'Value engineering']]);
    expect(out.snapshot.v2.total).toBe(playgroundTotals(rec.playground!.boq, bankMap, { rules: PLAYGROUND_PRICING, rooms }).sell);
    const next = out.update({ ...ctx1, scopeRevisions: [rec] });
    const issue = next.documents!.issues.find(i => i.kind === 'scope_revision')!;
    expect(issue.clientVisibility?.state).toBe('published');
    expect(next.scopeRevisions![0]).toMatchObject({ status: 'issued', issueId: issue.id, reference: out.reference, v2TierId: 'tv2' });
    // The signed BOQ is still the contract.
    expect(lockedTierId(next)).toBe('t1');
    // Withdrawn: a draft again, the document withdrawn.
    const back = withdrawPlanRevision(next.scopeRevisions![0], 9)(next);
    expect(back.scopeRevisions![0]).toMatchObject({ status: 'draft', issueId: null });
    expect(back.documents!.issues.find(i => i.id === issue.id)!.withdrawnAt).toBe(9);
  });

  it('signed by the client, it applies as the next version, drawn as it was revised, and becomes the contract', () => {
    const { ctx, v1 } = signedProject();
    const work = [{ ...boq[0], qty: 56, calcLength: 8 }, boq[1], boq[2], boq[3]];
    const rec = withPlanBoq(start(), { boq: work, reasons: { a: 'Client request' } }, base, bankMap, rooms);
    const out = issuePlanRevision({ ctx: { ...ctx, scopeRevisions: [rec] }, rec, base, v1, bankMap, by: 'Priya', v2TierId: 'tv2', at: 5 });
    if ('problem' in out) throw new Error(out.problem);
    let next = out.update({ ...ctx, scopeRevisions: [rec] });
    const issue = next.documents!.issues.find(i => i.kind === 'scope_revision')!;
    next = signIssue(issue.id, { name: 'Meera Shah', signedAt: 20 })(next);
    const signedIssue = next.documents!.issues.find(i => i.id === issue.id)!;
    const issued = next.scopeRevisions![0];
    const s = signedPlanRevision(issued, base, bankMap, rooms);
    expect(s.priced).toBe(signedIssue.snapshot.v2.total);
    const input = { rec: issued, issue: signedIssue, base, revisedBoq: s.revisedBoq, priced: s.priced, v1Total: s.v1Total, ctx: next, by: 'Priya', at: 30, tierId: 'tv2', extra: { boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING } as any };
    const tier = appliedTier(input);
    expect(tier).toMatchObject({ id: 'tv2', parentTierId: 't1', lifecycleTag: 'Current contract', boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING });
    expect(tier.boq[0].place).toEqual(boq[0].place);
    const applied = appliedContext(input)(next);
    expect(applied.approvedTierId).toBe('tv2');
    expect(applied.financials!.approvedExecutionValue).toBe(s.priced);
    expect(applied.scopeRevisions![0]).toMatchObject({ status: 'applied', appliedTierId: 'tv2' });
    expect(lockedTierId(applied)).toBe('tv2');
  });
});
