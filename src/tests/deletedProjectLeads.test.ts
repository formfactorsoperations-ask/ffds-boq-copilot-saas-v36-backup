/*
  A project assigned to a lead is deleted: the lead is let go, so it can start
  a new project. Before, it kept the id of the deleted project and was left
  out of New Project for good.
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  leads: {} as Record<string, any>,
  projects: new Set<string>(),
  tenantCopies: new Set<string>(),
  writes: [] as [string, any][],
}));

vi.mock('../../services/firebaseClient', () => ({ db: {}, functions: {} }));
vi.mock('../../services/aiClient', () => ({ getAi: () => null, aiIsReachable: () => false }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: any, name: string) => ({ name }),
  where: (field: string, _op: string, value: any) => ({ field, value }),
  query: (base: any, ...filters: any[]) => ({ base, filters }),
  doc: (_db: any, path: string, id: string) => ({ path: `${path}/${id}` }),
  getDocs: async (q: any) => {
    const docs = Object.entries(h.leads)
      .filter(([, d]) => q.filters.every((f: any) => d[f.field] === f.value))
      .map(([id, d]) => ({ id, data: () => d }));
    return { docs, size: docs.length };
  },
  getDoc: async (r: any) => {
    const [base, ...rest] = r.path.split('/');
    const id = rest[rest.length - 1];
    if (base === 'projects') {
      /* The rules read the project's tenant, so a deleted one is refused, not missing. */
      if (!h.projects.has(id)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      return { exists: () => true };
    }
    return { exists: () => h.tenantCopies.has(id) };
  },
  setDoc: async (r: any, data: any) => { h.writes.push([r.path, data]); },
  deleteDoc: async () => undefined,
}));

import { unlinkLeadsFromProject, releaseDeletedProjectLinks } from '../../services/leadsService';
import { unlinkDeletedProject, startableLeads, type Lead } from '../../lib/leads';

const me = { email: 'anish@ffds.in', name: 'Anish K' };

function lead(id: string, projectId: string | null, stage = 'proposal'): Lead {
  return {
    id, tenantId: 's1', createdAt: 1, createdBy: 'riya@ffds.in', createdByName: 'Riya', ownerEmail: 'riya@ffds.in', ownerName: 'Riya',
    people: [{ id: 'p', name: 'Mrs Naik', role: '', phone: '+91 98200 00000', email: '', main: true }],
    home: { where: 'Thane', type: '2-BHK', area: 650, scope: [], possession: '', budget: '' },
    source: 'referral', sourceNote: '', enquiry: '', stage, lostReason: null, know: { decides: '', style: '', seenWork: false },
    next: null, touches: [], firstTouchAt: null, lastTouchAt: null, openRequest: null, projectId, updatedAt: 1, updatedBy: '',
  } as Lead;
}

beforeEach(() => {
  h.leads = {}; h.projects = new Set(); h.tenantCopies = new Set(); h.writes = [];
});

describe('A lead whose project is deleted', () => {
  it('is free to start a new project, with a note, at the same stage', () => {
    const l = unlinkDeletedProject(lead('a', 'p1', 'won'), me, 100, 'Naik 2-BHK');
    expect(l).toMatchObject({ projectId: null, stage: 'won' });
    expect(l.touches.at(-1)?.text).toBe('Its project Naik 2-BHK was deleted, so the lead is free for a new one');
    expect(startableLeads([l]).map((x) => x.id)).toEqual(['a']);
  });

  it('is let go when the project is deleted, and only its own leads are', async () => {
    const { id: _a, ...a } = lead('a', 'p1');
    const { id: _b, ...b } = lead('b', 'p2');
    h.leads = { a, b };
    expect(await unlinkLeadsFromProject('s1', 'p1', me, 'Naik 2-BHK')).toBe(1);
    expect(h.writes.map(([p]) => p)).toEqual(['leads/a']);
    expect(h.writes[0][1]).toMatchObject({ projectId: null, updatedBy: 'anish@ffds.in' });
  });

  it('deleted before this fix is let go when the leads are next read; one still there is kept', async () => {
    h.projects = new Set(['p-live', 'p-other']);
    h.tenantCopies = new Set(['p-copy-only']);
    const ls = [lead('a', 'p-gone'), lead('b', 'p-live'), lead('c', 'p-known'), lead('d', null), lead('e', 'p-copy-only')];
    const out = await releaseDeletedProjectLinks(ls, new Set(['p-known']), me);
    expect(out.map((l) => [l.id, l.projectId])).toEqual([['a', null], ['b', 'p-live'], ['c', 'p-known'], ['d', null], ['e', 'p-copy-only']]);
    expect(h.writes.map(([p]) => p)).toEqual(['leads/a']);
  });
});
