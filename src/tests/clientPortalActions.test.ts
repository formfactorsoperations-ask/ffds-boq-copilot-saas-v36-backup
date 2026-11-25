import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const calls: Array<{ name: string; data: any }> = [];
vi.mock('../../services/firebaseClient', () => ({ functions: {}, db: null, auth: null }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: any, name: string) => async (data: any) => {
    calls.push({ name, data });
    return { data: { email: data.email, tempPassword: name === 'revokeClientLogin' ? undefined : 'Tmp-1234' } };
  },
}));

import { giveAccess, resetPassword, removeAccess, portalLink, inviteText } from '../../components/clients/portalActions';

const project = (ctx: any = {}): any => ({ id: 'p1', lastModified: 1, tiers: [], context: { name: 'Asha Home', clientName: 'Asha Rao', clientEmail: 'asha@mail.com', ...ctx } });

describe('client portal actions', () => {
  let saved: Array<{ id: string; patch: any }>;
  const save = async (id: string, patch: any) => { saved.push({ id, patch }); return 'saved' as const; };
  beforeEach(() => { calls.length = 0; saved = []; });

  it('gives access through createClientLogin and marks the project', async () => {
    const r = await giveAccess(project(), 'asha@mail.com', 'Asha Rao', 't1', 'owner@studio.in', save);
    expect(calls).toEqual([{ name: 'createClientLogin', data: { email: 'asha@mail.com', projectId: 'p1', tenantId: 't1', clientName: 'Asha Rao' } }]);
    expect(r).toEqual({ email: 'asha@mail.com', password: 'Tmp-1234', reset: false });
    expect(saved[0].patch.clientPortal['asha@mail.com']).toMatchObject({ issuedBy: 'owner@studio.in', revokedAt: null });
  });

  it('resets the password through resetClientPassword, as today', async () => {
    const r = await resetPassword(project(), 'asha@mail.com', 't1', 'o', save);
    expect(calls).toEqual([{ name: 'resetClientPassword', data: { email: 'asha@mail.com', tenantId: 't1' } }]);
    expect(r.reset).toBe(true);
  });

  it('removes access through revokeClientLogin and marks it taken away', async () => {
    const p = project({ clientPortal: { 'asha@mail.com': { issuedAt: 5, issuedBy: 'o', revokedAt: null, revokedBy: null } } });
    await removeAccess(p, 'asha@mail.com', 't1', 'o', save);
    expect(calls).toEqual([{ name: 'revokeClientLogin', data: { email: 'asha@mail.com', projectId: 'p1', tenantId: 't1' } }]);
    expect(saved[0].patch.clientPortal['asha@mail.com']).toMatchObject({ issuedAt: 5, revokedBy: 'o' });
    expect(saved[0].patch.clientPortal['asha@mail.com'].revokedAt).toBeGreaterThan(0);
  });

  it('copies the existing link, and makes and saves one only when there is none or a new one is asked for', async () => {
    const withLink = project({ portalAccess: { token: 'p1_abc', issuedAt: '2026-11-01T00:00:00Z' } });
    expect(await portalLink(withLink, save)).toMatch(/\/\?portal=p1_abc$/);
    expect(saved).toEqual([]);
    const made = await portalLink(project(), save);
    expect(made).toMatch(/\/\?portal=p1_[a-z0-9]+$/);
    expect(saved[0].patch.portalAccess.token).toBe(made.split('portal=')[1]);
    const fresh = await portalLink(withLink, save, true);
    expect(fresh).not.toMatch(/p1_abc$/);
    expect(saved).toHaveLength(2);
  });

  it('sends the link and the username, and the password only when asked', () => {
    const base = { clientName: 'Mrs. Asha Rao', studioName: 'Form Factors', link: 'https://x/?portal=p1_a', email: 'asha@mail.com' };
    const without = inviteText(base);
    expect(without).toBe('Hi Asha, your Form Factors client portal is ready.\nOpen: https://x/?portal=p1_a\nSign in with: asha@mail.com');
    expect(without).not.toContain('password');
    expect(inviteText({ ...base, password: 'Tmp-1234' })).toContain('Temporary password: Tmp-1234');
  });
});

describe('the client portal window', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../components/clients/ClientPortalModal.tsx'), 'utf8');
  const card = fs.readFileSync(path.resolve(__dirname, '../../components/clients/ClientCard.tsx'), 'utf8');
  const shell = fs.readFileSync(path.resolve(__dirname, '../../components/ClientsDirectory.tsx'), 'utf8');

  it('takes a second click to reset, to reissue and to remove', () => {
    expect(src).toMatch(/if \(armed !== 'reset'\) \{ setArmed\('reset'\); return; \}/);
    expect(src).toMatch(/if \(armed !== 'reissue'\) \{ setArmed\('reissue'\); return; \}/);
    expect(src).toMatch(/if \(armed !== 'remove'\) \{ setArmed\('remove'\); return; \}/);
    expect(src).toMatch(/window\.setTimeout\(\(\) => setArmed\(null\), 5000\)/);
  });

  it('says nothing new is added to the portal, and asks for an email first', () => {
    expect(src).toContain("They'll see the portal tabs you've already approved for clients. Nothing new is added.");
    expect(src).toContain('Add a client email to this project first — it is their username.');
    expect(src).toMatch(/useState\(false\)[\s\S]*Include the password/);
  });

  it('is offered only to the roles the login functions accept; others see the status line', () => {
    expect(shell).toMatch(/const canPortalWindow = canPortal && !!onUpdateClientProject;/);
    expect(card).toMatch(/\{canPortal && \(\s*<div className="mt-3 flex flex-wrap gap-2">/);
    expect(card).toMatch(/<PortalLineText line=\{x\.line\}/);
  });
});
