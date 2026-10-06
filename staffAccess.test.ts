/*
  Leaving a studio's team ends access, checked without a server:
    npx vitest run staffAccess.test.ts --environment node

  firebase-admin is replaced by an in-memory store, so nothing here touches
  the live project.
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({
  docs: new Map<string, any>(),
  authUsers: new Map<string, { uid: string; email: string; disabled?: boolean }>(),
  revoked: [] as string[],
}));

vi.mock('./functions/node_modules/firebase-admin/lib/index.js', () => {
  const DELETE = Symbol('delete');
  const docRef = (path: string) => ({
    id: path.split('/').pop(),
    get: async () => ({ exists: store.docs.has(path), id: path.split('/').pop(), data: () => store.docs.get(path) }),
    set: async (data: any, opts?: any) => {
      const next = { ...(opts?.merge ? store.docs.get(path) || {} : {}) };
      Object.entries(data).forEach(([k, v]) => { if (v === DELETE) delete next[k]; else next[k] = v; });
      store.docs.set(path, next);
    },
  });
  const firestore: any = () => ({
    collection: (c: string) => ({
      doc: (id: string) => docRef(`${c}/${id}`),
      get: async () => ({
        docs: [...store.docs.entries()].filter(([k]) => k.startsWith(`${c}/`) && k.split('/').length === 2)
          .map(([k, v]) => ({ id: k.split('/')[1], data: () => v, exists: true })),
      }),
    }),
    doc: (p: string) => docRef(p),
  });
  firestore.FieldValue = { delete: () => DELETE };
  const auth = () => ({
    getUserByEmail: async (email: string) => {
      const u = [...store.authUsers.values()].find((x) => x.email === email);
      if (!u) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
      return u;
    },
    getUser: async (uid: string) => store.authUsers.get(uid),
    revokeRefreshTokens: async (uid: string) => { store.revoked.push(uid); },
    updateUser: async (uid: string, p: any) => { Object.assign(store.authUsers.get(uid)!, p); },
  });
  return { firestore, auth, default: { firestore, auth } };
});

import { syncStudioAccess, onStudioTeamChange, sweepStaffAccess } from './functions/src/access';

const team = (rows: [string, string][]) => rows.map(([email, role]) => ({ email, role, name: email.split('@')[0] }));
const call = (fn: any, uid: string, email: string, data: any = {}) =>
  fn.run({ auth: { uid, token: { email, email_verified: true } }, data });
const teamChange = (before: any[], after: any[]) =>
  (onStudioTeamChange as any).run({
    params: { orgId: 'studio' },
    data: { before: { data: () => ({ team: before }) }, after: { data: () => ({ team: after }) } },
  });

beforeEach(() => {
  store.docs.clear(); store.authUsers.clear(); store.revoked.length = 0;
  store.docs.set('organizations/studio', { team: team([['ana@s.com', 'Admin'], ['dev@s.com', 'Designer']]) });
  store.docs.set('users/u-ana', { tenantId: 'studio', role: 'Admin', email: 'ana@s.com' });
  store.docs.set('users/u-dev', { tenantId: 'studio', role: 'Designer', email: 'dev@s.com' });
  store.authUsers.set('u-ana', { uid: 'u-ana', email: 'ana@s.com' });
  store.authUsers.set('u-dev', { uid: 'u-dev', email: 'dev@s.com' });
});

describe('leaving the team', () => {
  it('ends access at once when a person is taken off the team list', async () => {
    await teamChange(team([['ana@s.com', 'Admin'], ['dev@s.com', 'Designer']]), team([['ana@s.com', 'Admin']]));
    const dev = store.docs.get('users/u-dev');
    expect(dev.role).toBeUndefined();
    expect(dev.tenantId).toBeUndefined();
    expect(dev.revokedFrom).toBe('studio');
    expect(store.authUsers.get('u-dev')!.disabled).toBe(true);
    expect(store.revoked).toContain('u-dev');
    expect(store.docs.get('users/u-ana').role).toBe('Admin'); // untouched
  });

  it('copies a changed role onto the profile and signs them out', async () => {
    await teamChange(team([['ana@s.com', 'Admin']]), team([['ana@s.com', 'Designer']]));
    expect(store.docs.get('users/u-ana').role).toBe('Designer');
    expect(store.revoked).toContain('u-ana');
    expect(store.authUsers.get('u-ana')!.disabled).toBeUndefined();
  });

  it('leaves a client, and staff of another studio, alone', async () => {
    store.docs.set('users/u-dev', { tenantId: 'other', role: 'Admin' });
    await teamChange(team([['dev@s.com', 'Designer']]), []);
    expect(store.docs.get('users/u-dev').role).toBe('Admin');
  });

  it('refuses a person no longer on the team at sign-in', async () => {
    store.docs.set('organizations/studio', { team: team([['ana@s.com', 'Admin']]) });
    const r = await call(syncStudioAccess, 'u-dev', 'dev@s.com');
    expect(r.access).toBe('none');
    expect(store.docs.get('users/u-dev').role).toBeUndefined();
  });

  it('still lets a team member in', async () => {
    const r = await call(syncStudioAccess, 'u-dev', 'dev@s.com');
    expect(r).toMatchObject({ access: 'studio', tenantId: 'studio', role: 'Designer' });
  });

  it('does not treat a "Client" row on the team as a seat (it used to grant Viewer)', async () => {
    store.docs.set('organizations/studio', { team: team([['ana@s.com', 'Admin'], ['dev@s.com', 'Client']]) });
    const r = await call(syncStudioAccess, 'u-dev', 'dev@s.com');
    expect(r.access).toBe('none');
  });
});

describe('sweep', () => {
  it('lists strays on a dry run and changes nothing; revokes them when applied', async () => {
    store.docs.set('organizations/studio', { team: team([['ana@s.com', 'Admin']]) });
    const owner = 'formfactors.operations@gmail.com';
    const dry = await call(sweepStaffAccess, 'u-owner', owner);
    expect(dry.strays.map((s: any) => s.uid)).toEqual(['u-dev']);
    expect(store.docs.get('users/u-dev').role).toBe('Designer');
    await call(sweepStaffAccess, 'u-owner', owner, { apply: true });
    expect(store.docs.get('users/u-dev').role).toBeUndefined();
  });

  it('is refused to anyone but the platform owner', async () => {
    await expect(call(sweepStaffAccess, 'u-ana', 'ana@s.com')).rejects.toThrow(/Platform admin/);
  });
});

import { requireStaff, STAFF_ROLES } from './functions/src/guards';

describe('the paid services (AI, email) are for staff', () => {
  const req = (uid: string, email = 'x@x.com') => ({ auth: { uid, token: { email, email_verified: true } } });
  it('lets staff in', async () => {
    await expect(requireStaff(req('u-dev'))).resolves.toMatchObject({ role: 'Designer', tenantId: 'studio' });
  });
  it('refuses a client, a stranger with no profile, and a signed-out caller', async () => {
    store.docs.set('users/u-client', { tenantId: 'studio', role: 'Client', projectIds: ['p1'] });
    await expect(requireStaff(req('u-client'))).rejects.toThrow(/cannot use/);
    await expect(requireStaff(req('u-nobody'))).rejects.toThrow(/cannot use/);
    await expect(requireStaff({})).rejects.toThrow(/Sign in/);
  });
  it('refuses a Viewer where only senders are allowed (studio email)', async () => {
    store.docs.set('users/u-view', { tenantId: 'studio', role: 'Viewer' });
    const senders = new Set([...STAFF_ROLES].filter((r) => r !== 'Viewer'));
    await expect(requireStaff(req('u-view'), senders)).rejects.toThrow(/cannot use/);
  });
  it('lets the platform owner in on a verified address only', async () => {
    await expect(requireStaff(req('u-o', 'formfactors.operations@gmail.com'))).resolves.toMatchObject({ platformOwner: true });
    await expect(requireStaff({ auth: { uid: 'u-o', token: { email: 'formfactors.operations@gmail.com', email_verified: false } } })).rejects.toThrow();
  });
});
