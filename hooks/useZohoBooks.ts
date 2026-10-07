import { useCallback, useEffect, useState } from 'react';
import { useOrg } from '../contexts/OrgContext';
import { ZohoCallError, ZohoStatus, zohoCall } from '../services/zohoBooksService';

/**
 * Whether this studio has switched on the optional Zoho Books add-in.
 *
 * Asked once per studio per session and shared. Three outcomes, kept apart on
 * purpose:
 *
 *   status.connected === true    raise invoices in Zoho
 *   status.connected === false   the add-in is off or was never set up; the app
 *                                behaves exactly as it did before it existed
 *   unknown                      the server could not be asked, AND this browser
 *                                last saw the studio connected. A connected
 *                                studio must not quietly fall back to local
 *                                invoice numbers, so callers wait and retry.
 *
 * A function that is not deployed looks, from the browser, exactly like a
 * network failure (the 404 carries no CORS headers). So an unreachable server
 * only blocks invoicing for a studio this browser has seen connected; for
 * everyone else it means "off". Otherwise merging the add-in would stop every
 * studio that never opted in from raising invoices until the function was
 * deployed.
 */

const cache = new Map<string, ZohoStatus>();
/** Off, with a note for the settings card that the service could not be reached or is not deployed. */
const OFF: ZohoStatus = { connected: false, canManage: false, canRaise: false, unavailable: true };

const flagKey = (tenantId: string) => `ffds_zoho_connected:${tenantId}`;
const wasConnected = (tenantId: string): boolean => {
  try { return localStorage.getItem(flagKey(tenantId)) === '1'; } catch { return false; }
};
const remember = (tenantId: string, connected: boolean) => {
  try { localStorage.setItem(flagKey(tenantId), connected ? '1' : '0'); } catch { /* private mode: the flag is a safeguard, not a requirement */ }
};

export function useZohoBooks() {
  const { orgData } = useOrg();
  const tenantId = orgData?.tenantId;
  const [status, setStatusState] = useState<ZohoStatus | null>(tenantId ? cache.get(tenantId) || null : null);
  const [unknown, setUnknown] = useState(false);
  const [loading, setLoading] = useState(false);

  const setStatus = useCallback((next: ZohoStatus) => {
    if (tenantId) cache.set(tenantId, next);
    setStatusState(next);
    setUnknown(false);
  }, [tenantId]);

  /** Resolves to the fresh status, or null when the server could not be asked. */
  const refresh = useCallback(async (): Promise<ZohoStatus | null> => {
    if (!tenantId) return null;
    setLoading(true);
    try {
      const s = await zohoCall<ZohoStatus>('status', {}, tenantId);
      remember(tenantId, s.connected);
      setStatus(s);
      return s;
    } catch (e) {
      if (!(e instanceof ZohoCallError && e.isUnavailable) && wasConnected(tenantId)) {
        setUnknown(true);
        return null;
      }
      setStatus(OFF);
      return OFF;
    } finally {
      setLoading(false);
    }
  }, [tenantId, setStatus]);

  useEffect(() => {
    if (tenantId && !cache.has(tenantId)) void refresh();
    else if (tenantId) setStatusState(cache.get(tenantId) || null);
  }, [tenantId, refresh]);

  return { status, connected: !!status?.connected, unknown, loading, refresh, setStatus, tenantId };
}
