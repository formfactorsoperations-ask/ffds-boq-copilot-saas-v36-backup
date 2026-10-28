import { describe, it, expect } from 'vitest';
import { contextWithApproved, tiersWithApproved, describeApproval, contextWithoutApproved, tiersWithoutApproved, previousBaseline } from '../../lib/tierApproval';
import { projectBenchmark, otherBenchmarks, medianGm, closestInSize } from '../../lib/tierBenchmarks';

const tier = (id: string, totalSell: number, designFee = totalSell * 0.1, extra: any = {}): any => ({
  id, name: id.toUpperCase(), timestamp: 1, boq: [],
  summary: { totalSell, designFee, totalRevenue: totalSell + designFee, totalCost: 0, totalGm: 20, itemCount: 0, blendedGm: 25 },
  ...extra,
});

describe('contextWithApproved', () => {
  const a = tier('a', 500000);
  const b = tier('b', 700000);

  it('sets the baseline and its values', () => {
    const ctx = contextWithApproved({ name: 'Flat' } as any, a, [a, b], 1000);
    expect(ctx.approvedTierId).toBe('a');
    expect(ctx.financials).toMatchObject({ approvedExecutionValue: 500000, approvedDesignValue: 50000, paymentSnapshots: [] });
  });

  it('snapshots the contract it replaces — the step Sync used to skip', () => {
    const booked = contextWithApproved({ name: 'Flat', paymentMilestones: [{ id: 'm1' }] } as any, a, [a, b], 1000);
    const revised = contextWithApproved(booked, b, [a, b], 2000);
    expect(revised.approvedTierId).toBe('b');
    expect(revised.financials!.paymentSnapshots).toEqual([
      expect.objectContaining({ tierId: 'a', tierName: 'A', timestamp: 2000, approvedExecutionValue: 500000, approvedDesignValue: 50000, milestones: [{ id: 'm1' }] }),
    ]);
  });

  it('re-syncing the baseline over itself does not snapshot it', () => {
    const booked = contextWithApproved({ name: 'Flat' } as any, a, [a, b], 1000);
    const edited = tier('a', 520000);
    const resynced = contextWithApproved(booked, edited, [edited, b], 2000);
    expect(resynced.financials!.paymentSnapshots).toEqual([]);
    expect(resynced.financials!.approvedExecutionValue).toBe(520000);
  });

  it('never snapshots the same contract twice', () => {
    let ctx = contextWithApproved({ name: 'Flat' } as any, a, [a, b], 1);
    ctx = contextWithApproved(ctx, b, [a, b], 2);
    ctx = contextWithApproved(ctx, a, [a, b], 3);
    ctx = contextWithApproved(ctx, b, [a, b], 4);
    expect(ctx.financials!.paymentSnapshots!.map((s: any) => s.tierId)).toEqual(['a', 'b']);
  });

  it('keeps the engagement in step', () => {
    const ctx = contextWithApproved({ name: 'Flat', engagement: { executionValue: 0, designFee: 0 } } as any, b, [a, b], 1);
    expect(ctx.engagement).toMatchObject({ executionValue: 700000, designFee: 70000 });
  });
});

describe('tiersWithApproved', () => {
  it('records who approved and when, and supersedes the old contract', () => {
    const out = tiersWithApproved([tier('a', 1), tier('b', 1)], 'b', 'a', { at: 5, by: 'Priya' });
    expect(out[1]).toMatchObject({ lifecycleTag: 'Current contract', approval: { at: 5, by: 'Priya' } });
    expect(out[0].lifecycleTag).toBe('Superseded');
  });

  it('re-syncing keeps the original approval', () => {
    const approved = tier('a', 1, 0, { approval: { at: 1, by: 'Priya' } });
    const out = tiersWithApproved([approved], 'a', 'a', { at: 9, by: 'Rahul' });
    expect(out[0].approval).toEqual({ at: 1, by: 'Priya' });
  });
});

describe('reverting an approval', () => {
  const a = tier('a', 500000);
  const b = tier('b', 700000);

  it('with nothing approved before, leaves nothing approved', () => {
    const booked = contextWithApproved({ name: 'Flat' } as any, a, [a, b], 1);
    const undone = contextWithoutApproved(booked, [a, b]);
    expect(undone.approvedTierId).toBeUndefined();
    expect(previousBaseline(booked, [a, b])).toBeNull();
  });

  it('puts the replaced contract back, with its booked values, and drops its snapshot', () => {
    const booked = contextWithApproved({ name: 'Flat', engagement: { executionValue: 0, designFee: 0 } } as any, a, [a, b], 1);
    const revised = contextWithApproved(booked, b, [a, b], 2);
    const undone = contextWithoutApproved(revised, [a, b]);
    expect(undone.approvedTierId).toBe('a');
    expect(undone.financials).toMatchObject({ approvedExecutionValue: 500000, approvedDesignValue: 50000, paymentSnapshots: [] });
    expect(undone.engagement).toMatchObject({ executionValue: 500000, designFee: 50000 });
  });

  it('skips a replaced contract whose option has since been deleted', () => {
    const booked = contextWithApproved({ name: 'Flat' } as any, a, [a, b], 1);
    const revised = contextWithApproved(booked, b, [a, b], 2);
    expect(contextWithoutApproved(revised, [b]).approvedTierId).toBeUndefined();
  });

  it('makes the option a draft again and the restored one the contract', () => {
    const approved = tiersWithApproved([tier('a', 1, 0, { approval: { at: 1, by: 'Priya' } }), tier('b', 1)], 'b', 'a', { at: 5, by: 'Rahul' });
    const out = tiersWithoutApproved(approved, 'b', 'a');
    expect(out[1].lifecycleTag).toBe('Draft');
    expect(out[1].approval).toBeUndefined();
    expect(out[0]).toMatchObject({ lifecycleTag: 'Current contract', approval: { at: 1, by: 'Priya' } });
  });
});

describe('describeApproval', () => {
  it('names the person and the day', () => {
    const at = new Date('2026-10-25T10:00:00Z').getTime();
    expect(describeApproval({ approval: { at, by: 'Priya' } })).toBe('approved by Priya on 25 Oct 2026');
  });
  it('says only "approved" for an older option with no record, rather than guessing', () => {
    expect(describeApproval({})).toBe('approved');
  });
});

const project = (id: string, name: string, area: number, gm: number | undefined, value = 1000000): any => ({
  id, activeTierId: 't', context: { name, area },
  tiers: [{ id: 't', name: 'T', timestamp: 1, boq: [{ id: 'x' }], summary: { totalRevenue: value, totalSell: value, blendedGm: gm, itemCount: 12 } }],
});

describe('benchmarks', () => {
  it('reads a project off its approved option, else its active one', () => {
    const p: any = project('p1', 'One', 900, 24);
    p.tiers.push({ id: 'appr', name: 'Approved', timestamp: 2, boq: [], summary: { totalRevenue: 2000000, blendedGm: 30, itemCount: 5 } });
    p.context.approvedTierId = 'appr';
    expect(projectBenchmark(p)).toMatchObject({ value: 2000000, gm: 30, itemsCount: 5 });
  });

  it('skips projects with nothing priced instead of inventing a GM', () => {
    expect(projectBenchmark(project('p', 'Empty', 500, undefined))).toBeNull();
    expect(projectBenchmark(project('p', 'Zero', 500, 20, 0))).toBeNull();
    expect(projectBenchmark({ id: 'p', context: { name: 'No tiers' }, tiers: [] } as any)).toBeNull();
  });

  it('leaves the current project out, by id', () => {
    const list = [project('me', 'Same name', 465, 20), project('other', 'Same name', 500, 22)];
    expect(otherBenchmarks(list, { id: 'me' }).map(b => b.id)).toEqual(['other']);
  });

  it('the median is the studio\'s own, or nothing', () => {
    expect(medianGm([])).toBeNull();
    const list = otherBenchmarks([project('a', 'A', 1, 20), project('b', 'B', 1, 30), project('c', 'C', 1, 22)], {});
    expect(medianGm(list)).toBe(22);
    expect(medianGm(list.slice(0, 2))).toBe(25);
  });

  it('closest in size, nearest first; no comparables means none', () => {
    const list = otherBenchmarks([project('a', 'Big', 2000, 20), project('b', 'Near', 500, 21), project('c', 'Unknown', 0, 23)], {});
    expect(closestInSize(list, 465).map(b => b.name)).toEqual(['Near', 'Big']);
    expect(closestInSize([], 465)).toEqual([]);
  });
});
