/*
  Projects, Phase 3 (DESIGN.md "Projects: journey, needs you, one list"):
  the data behind the due days and the health rings.

  Pins: a payment step is due the studio's payment terms after its invoice,
  else on its planned date (the real engine); a drawing counts as issued once
  a round has gone to the client or the GFC is out; snags closed are resolved
  or verified; and the Cloud Function counts a project's drawings into
  organizations/{orgId}/projectHealth/{id}, skips a write when nothing
  changed, and lets only a studio's senior roles rebuild the counts.
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextActions } from '../../services/nextActionEngine';
import { drawingCounts, isIssued, snagCounts, healthOf, share } from '../../lib/projectHealth';

/* ── A stand-in Firestore for the function's counting ── */
const store = new Map<string, any>();
const writes: string[] = [];
const fakeDb: any = {
  doc: (path: string) => ({
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (v: any, o?: any) => { writes.push(path); store.set(path, o?.merge ? { ...(store.get(path) || {}), ...v } : v); },
  }),
  collection: (path: string) => {
    const docs = () => [...store.entries()].filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
      .map(([k, v]) => ({ id: k.slice(path.length + 1), data: () => v }));
    const q: any = { get: async () => { const d = docs(); return { docs: d, size: d.length }; }, select: () => q };
    return q;
  },
};
const staff = (role: string, tenantId: string | null, platformOwner = false) => ({ uid: role, email: `${role}@x.in`, role, tenantId, platformOwner });

beforeEach(() => { store.clear(); writes.length = 0; });

describe('when a payment step is due', () => {
  const ctx = (m: any) => ({ lifecycle: { stage: 4 }, paymentMilestones: [m] });

  it('invoiced: the studio\'s payment terms after the invoice date', () => {
    const [step] = getNextActions({ project: ctx({ id: 'e1', status: 'invoiced', invoiceDate: '2026-11-20' }), paymentDueDays: 10 }, 'Owner');
    expect(step).toMatchObject({ id: 'stage4_e1', dueKey: '2026-11-30' });
    const [seven] = getNextActions({ project: ctx({ id: 'e1', status: 'invoiced', invoiceDate: '2026-11-20' }) }, 'Owner');
    expect(seven.dueKey).toBe('2026-11-27');
  });

  it('not invoiced yet: its planned date; neither: no day', () => {
    expect(getNextActions({ project: ctx({ id: 'e1', status: 'pending', date: '2026-12-05' }) }, 'Owner')[0].dueKey).toBe('2026-12-05');
    expect(getNextActions({ project: ctx({ id: 'e1', status: 'pending' }) }, 'Owner')[0].dueKey).toBeUndefined();
  });

  it('a step that is not a payment has no day of its own', () => {
    const steps = getNextActions({ project: { lifecycle: { stage: 4 }, paymentMilestones: [] } }, 'Owner');
    expect(steps.find((s) => s.id === 'stage4_mobilize')?.dueKey).toBeUndefined();
  });
});

describe('what the rings count', () => {
  it('a drawing is issued once a round went to the client, or the GFC is out, or it was approved', () => {
    expect(isIssued({ rounds: [{ status: 'not_issued' }] })).toBe(false);
    expect(isIssued({ rounds: [{ status: 'issued' }] })).toBe(true);
    expect(isIssued({ rounds: [{ status: 'approved' }] })).toBe(true);
    expect(isIssued({ rounds: [], gfc: { status: 'issued' } })).toBe(true);
    expect(isIssued({ rounds: [], approvedAt: 5 })).toBe(true);
    expect(drawingCounts([{ rounds: [{ status: 'issued' }] }, { rounds: [] }, null])).toEqual({ total: 2, issued: 1 });
  });

  it('snags closed are resolved or verified', () => {
    expect(snagCounts({ snagList: [{ status: 'open' }, { status: 'in_progress' }, { status: 'resolved' }, { status: 'verified' }] })).toEqual({ total: 4, closed: 2 });
    expect(snagCounts({})).toEqual({ total: 0, closed: 0 });
  });

  it('the journey ring fills by step and is empty when closed; nothing to count is an empty ring', () => {
    expect(healthOf(2, null, {}).journey).toBeCloseTo(0.6);
    expect(healthOf(-1, null, {}).journey).toBeNull();
    expect(share(3, 0)).toBe(0);
    expect(share(7, 10)).toBeCloseTo(0.7);
  });
});

describe('the drawing counts function', () => {
  const tracker = (n: number, issued: number) => {
    for (let i = 0; i < n; i++) store.set(`organizations/s1/projects/p1/drawingTracker/d${i}`, { rounds: [{ status: i < issued ? 'issued' : 'not_issued' }] });
  };

  it('a drawing written: the project\'s counts follow, and an unchanged count is not written again', async () => {
    const { writeDrawingCounts } = await import('../../functions/src/projectHealth');
    tracker(4, 1);
    expect(await writeDrawingCounts(fakeDb, 's1', 'p1')).toBe('written');
    expect(store.get('organizations/s1/projectHealth/p1')).toMatchObject({ projectId: 'p1', drawings: { total: 4, issued: 1 } });
    expect(await writeDrawingCounts(fakeDb, 's1', 'p1')).toBe('unchanged');
    expect(writes.length).toBe(1);
    store.set('organizations/s1/projects/p1/drawingTracker/d1', { rounds: [{ status: 'approved' }] });
    await writeDrawingCounts(fakeDb, 's1', 'p1');
    expect(store.get('organizations/s1/projectHealth/p1').drawings).toEqual({ total: 4, issued: 2 });
  });

  it('only a studio\'s Super Admin, Owner, Admin or Ops Director may count every project, and only their own studio', async () => {
    const { rebuildFor, SENIOR } = await import('../../functions/src/projectHealth');
    expect([...SENIOR]).toEqual(['Super Admin', 'Owner', 'Admin', 'Ops Director']);
    store.set('organizations/s1/projects/p1', { tenantId: 's1' });
    store.set('organizations/s1/projects/p2', { tenantId: 's1' });
    tracker(3, 3);
    await expect(rebuildFor(fakeDb, staff('Owner', 's1'), 's2')).rejects.toThrow(/Not your studio/);
    expect(await rebuildFor(fakeDb, staff('Owner', 's1'), null)).toEqual({ projects: 2, written: 2, unchanged: 0 });
    expect(store.get('organizations/s1/projectHealth/p1').drawings).toEqual({ total: 3, issued: 3 });
    expect(store.get('organizations/s1/projectHealth/p2').drawings).toEqual({ total: 0, issued: 0 });
    expect(await rebuildFor(fakeDb, staff('Super Admin', null, true), 's1')).toEqual({ projects: 2, written: 0, unchanged: 2 });
  });
});
