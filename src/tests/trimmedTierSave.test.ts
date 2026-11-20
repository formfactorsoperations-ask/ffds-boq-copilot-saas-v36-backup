/*
  Saving a project never empties an option whose lines it does not hold.

  A project too big for one Firestore document is stored with some options'
  lines left out (`boq: []`, `boqTrimmed: true`); the lines themselves live in
  projects/{id}/tierBoq/{tierId} and are put back when the project is opened.
  A copy that has not been opened still holds the empty options. Saving that
  copy (a portal link reissued from the Projects list, an auto-save landing
  before the lines arrive) used to write the empty list over the stored lines.
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cloud = { batch: [] as Array<{ path: string; data: any }>, docs: [] as Array<{ path: string; data: any }> };
const local = new Map<string, any>();

vi.mock('../../services/firebaseClient', () => ({ db: {}, auth: null, storage: null, functions: null, isFirebaseConfigured: () => true }));
vi.mock('idb-keyval', () => ({
  get: async (k: string) => local.get(k),
  set: async (k: string, v: any) => { local.set(k, v); },
  del: async (k: string) => { local.delete(k); },
}));
vi.mock('firebase/firestore', async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    doc: (_db: any, ...path: string[]) => ({ path: path.join('/') }),
    collection: (_db: any, ...path: string[]) => ({ path: path.join('/') }),
    query: (c: any) => c,
    where: () => ({}),
    setDoc: async (ref: any, data: any) => { cloud.docs.push({ path: ref.path, data }); },
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    getDocs: async () => ({ docs: [], empty: true, size: 0 }),
    writeBatch: () => ({
      set: (ref: any, data: any) => { cloud.batch.push({ path: ref.path, data }); },
      commit: async () => {},
    }),
  };
});

import { db, keepTrimmedLines, tierBoqsToWrite } from '../../services/dbService';

const line = (id: string) => ({ id, bankId: 'gen-014', qty: 10, baseRate: 1295 });
const project = (id: string, tiers: any[]): any => ({ id, lastModified: 1, context: { name: 'Prestige Gardens' }, tiers, activeTierId: tiers[0]?.id });
const sideStore = (projectId: string) => cloud.batch.filter((w) => w.path.startsWith(`projects/${projectId}/tierBoq/`));

beforeEach(() => { cloud.batch = []; cloud.docs = []; local.clear(); });

describe('a save and the options it does not hold', () => {
  it('writes the lines it has and leaves a trimmed option\'s stored lines alone', async () => {
    await db.saveProject(project('p1', [
      { id: 't1', name: 'Current', boq: [line('a'), line('b')] },
      { id: 't2', name: 'Older option', boq: [], boqTrimmed: true },
    ]));
    expect(sideStore('p1').map((w) => w.path)).toEqual(['projects/p1/tierBoq/t1']);
    expect(sideStore('p1')[0].data).toMatchObject({ tierId: 't1', itemCount: 2 });
  });

  it('still writes an option that is truly empty', async () => {
    await db.saveProject(project('p2', [{ id: 't1', name: 'Current', boq: [line('a')] }, { id: 't2', name: 'New option', boq: [] }]));
    expect(sideStore('p2').map((w) => [w.path, w.data.itemCount])).toEqual([['projects/p2/tierBoq/t1', 1], ['projects/p2/tierBoq/t2', 0]]);
  });

  it('writes the lines once they are loaded, and after an earlier trimmed save', async () => {
    const trimmed = project('p3', [{ id: 't1', name: 'Current', boq: [line('a')] }, { id: 't2', name: 'Older option', boq: [], boqTrimmed: true }]);
    await db.saveProject(trimmed);
    cloud.batch = [];
    // Opened: the lines are back (services/dbService hydrateTierBoqs).
    await db.saveProject({ ...trimmed, tiers: [trimmed.tiers[0], { id: 't2', name: 'Older option', boq: [line('x'), line('y'), line('z')], boqTrimmed: false }] });
    expect(sideStore('p3').map((w) => [w.path, w.data.itemCount])).toEqual([['projects/p3/tierBoq/t2', 3]]);
  });

  it('keeps the lines this device already holds for an option that arrives trimmed', async () => {
    await db.saveProject(project('p4', [{ id: 't1', name: 'Current', boq: [line('a')] }, { id: 't2', name: 'Older option', boq: [line('x'), line('y')] }]));
    await db.saveProject(project('p4', [{ id: 't1', name: 'Current', boq: [line('a'), line('b')] }, { id: 't2', name: 'Older option', boq: [], boqTrimmed: true }]));
    const stored = JSON.parse(local.get('ffds_project_library')).find((p: any) => p.id === 'p4');
    expect(stored.tiers[0].boq).toHaveLength(2);
    expect(stored.tiers[1].boq).toEqual([line('x'), line('y')]);
    expect(stored.tiers[1].boqTrimmed).toBe(false);
  });
});

describe('the two rules on their own', () => {
  it('tierBoqsToWrite: every option with an id and a list of lines, except one still waiting for its lines', () => {
    const tiers = [
      { id: 't1', boq: [line('a')] },
      { id: 't2', boq: [] },
      { id: 't3', boq: [], boqTrimmed: true },
      { id: 't4', boq: [line('b')], boqTrimmed: true },
      { id: 't5', boq: [line('c')], boqTrimmed: false },
      { boq: [line('d')] },
      { id: 't6' },
      null,
    ];
    // t4 is marked but holds lines: they were added on this copy and are saved.
    expect(tierBoqsToWrite(tiers).map((t: any) => t.id)).toEqual(['t1', 't2', 't4', 't5']);
    expect(tierBoqsToWrite(undefined as any)).toEqual([]);
  });

  it('keepTrimmedLines: fills a trimmed option from the copy already held, and nothing else', () => {
    const held = project('p', [{ id: 't1', boq: [line('old')] }, { id: 't2', boq: [line('x')] }, { id: 't3', boq: [] }]);
    const incoming = project('p', [{ id: 't1', boq: [line('new')] }, { id: 't2', boq: [], boqTrimmed: true }, { id: 't3', boq: [], boqTrimmed: true }, { id: 't4', boq: [], boqTrimmed: true }]);
    const out = keepTrimmedLines(incoming, held);
    expect(out.tiers[0]).toBe(incoming.tiers[0]);
    expect(out.tiers[1]).toMatchObject({ id: 't2', boq: [line('x')], boqTrimmed: false });
    // Nothing held for these: they stay marked as trimmed, to be filled on opening.
    expect(out.tiers[2]).toBe(incoming.tiers[2]);
    expect(out.tiers[3]).toBe(incoming.tiers[3]);
    // No trimmed option, or no copy held: the very same project back.
    expect(keepTrimmedLines(held, incoming)).toBe(held);
    expect(keepTrimmedLines(incoming, undefined)).toBe(incoming);
  });
});
