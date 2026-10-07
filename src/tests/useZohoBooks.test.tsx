import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const svc = vi.hoisted(() => {
  class ZohoCallError extends Error {
    constructor(message: string, public code = '', public reason = '') { super(message); }
    get isUnavailable() { return this.code === 'no-backend' || this.code === 'functions/not-found' || this.code === 'not-found'; }
  }
  return { zohoCall: vi.fn(), ZohoCallError };
});
vi.mock('../../services/zohoBooksService', () => svc);

let tenant = 't1';
vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ orgData: { tenantId: tenant } }) }));

import { useZohoBooks } from '../../hooks/useZohoBooks';

const CONNECTED = { connected: true, canManage: true, canRaise: true };
// What the browser actually sees when the function is not deployed: a failed request, code 'functions/internal'.
const unreachable = () => svc.zohoCall.mockRejectedValue(new svc.ZohoCallError('internal', 'functions/internal'));

let n = 0;
beforeEach(() => {
  svc.zohoCall.mockReset();
  localStorage.clear();
  tenant = `studio-${++n}`; // the hook caches per studio for the session
});

describe('useZohoBooks', () => {
  it('reports a connected studio and remembers it', async () => {
    svc.zohoCall.mockResolvedValue(CONNECTED);
    const { result } = renderHook(() => useZohoBooks());
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(localStorage.getItem(`ffds_zoho_connected:${tenant}`)).toBe('1');
  });

  it('treats an unreachable server as OFF for a studio that never connected, so invoicing carries on', async () => {
    unreachable();
    const { result } = renderHook(() => useZohoBooks());
    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.connected).toBe(false);
    expect(result.current.unknown).toBe(false);
    expect(result.current.status?.unavailable).toBe(true);
  });

  it('does NOT fall back to local numbering for a studio last seen connected', async () => {
    localStorage.setItem(`ffds_zoho_connected:${tenant}`, '1');
    unreachable();
    const { result } = renderHook(() => useZohoBooks());
    await waitFor(() => expect(result.current.unknown).toBe(true));
    expect(result.current.connected).toBe(false);
    expect(result.current.status).toBeNull();
  });

  it('treats a missing backend as OFF even for a studio last seen connected', async () => {
    localStorage.setItem(`ffds_zoho_connected:${tenant}`, '1');
    svc.zohoCall.mockRejectedValue(new svc.ZohoCallError('No server is configured.', 'no-backend'));
    const { result } = renderHook(() => useZohoBooks());
    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.unknown).toBe(false);
  });

  it('recovers when a later check succeeds', async () => {
    unreachable();
    const { result } = renderHook(() => useZohoBooks());
    await waitFor(() => expect(result.current.status?.unavailable).toBe(true));
    svc.zohoCall.mockResolvedValue(CONNECTED);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.connected).toBe(true);
  });
});
