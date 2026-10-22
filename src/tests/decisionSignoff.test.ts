import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  A client signed in to the portal answers a decision (decisionsService
  recordClientSignoff). The rules admit them by their sign-in and project, so
  the 30-day `tokenExpiresAt` from the old emailed link must not stop them.
*/
const h = vi.hoisted(() => ({ data: null as any, update: vi.fn(async () => {}) }));
vi.mock('../../services/firebaseClient', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (...path: any[]) => ({ path: path.slice(1).join('/') }),
  getDoc: async () => ({ exists: () => !!h.data, data: () => h.data }),
  updateDoc: h.update,
  collection: vi.fn(), collectionGroup: vi.fn(), query: vi.fn(), where: vi.fn(), getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  addDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(), arrayUnion: (...v: any[]) => ({ arrayUnion: v }),
  serverTimestamp: () => 'now', Timestamp: { now: () => 'now', fromDate: (d: Date) => ({ toDate: () => d }) },
}));

import { recordClientSignoff } from '../../services/decisionsService';

beforeEach(() => { h.update.mockClear(); });

describe('a client answering a decision in the portal', () => {
  it('is recorded even when the decision went out more than 30 days ago', async () => {
    h.data = { signoffToken: 'p1_d1_tok', status: 'drawing_sent', clientEmail: 'client@example.com', tokenExpiresAt: { toDate: () => new Date('2026-09-05') } };
    await recordClientSignoff('p1_d1_tok', 'approved', 'Mr Prasad Naik', '', '');
    expect(h.update).toHaveBeenCalledWith({ path: 'projects/p1/decisions/d1' }, expect.objectContaining({ status: 'signed' }));
  });

  it('still refuses a token that does not match the decision', async () => {
    h.data = { signoffToken: 'p1_d1_other', status: 'drawing_sent' };
    await expect(recordClientSignoff('p1_d1_tok', 'approved', 'Mr Prasad Naik', '', '')).rejects.toThrow(/Invalid or expired/);
    expect(h.update).not.toHaveBeenCalled();
  });
});
