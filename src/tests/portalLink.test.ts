import { describe, it, expect } from 'vitest';
import { issuePortalAccess, portalTokenOf, projectIdFromToken } from '../../services/portalAccessService';
import { portalModel } from '../../lib/projectHome';

/*
  A client's portal link does not expire and is not replaced behind the
  studio's back. Their own login is what lets them in; the link only names the
  project. Unique Vistas was sent a link on 18 Oct and by 6 Nov the app showed
  a different one.
*/

describe('the client portal link', () => {
  it('is issued without an expiry', () => {
    const a = issuePortalAccess('mmq0f5dp-l0j6ory-18', 'client@example.com');
    expect(a.expiresAt).toBeUndefined();
    expect(projectIdFromToken(a.token)).toBe('mmq0f5dp-l0j6ory-18');
  });

  it('keeps a link issued with an old expiry, even after that date', () => {
    const ctx = { portalAccess: { token: 'p1_abc', expiresAt: '2020-01-01T00:00:00Z', issuedAt: '2019-12-01T00:00:00Z' } };
    expect(portalTokenOf(ctx)).toBe('p1_abc');
  });

  it('is absent only when none was ever issued', () => {
    expect(portalTokenOf({})).toBeNull();
    expect(portalTokenOf(undefined)).toBeNull();
    expect(portalModel(null, null, [], undefined, false).hasLink).toBe(false);
    expect(portalModel(null, null, [], { token: 'p1_abc', expiresAt: '2020-01-01T00:00:00Z' }, false).hasLink).toBe(true);
  });
});
