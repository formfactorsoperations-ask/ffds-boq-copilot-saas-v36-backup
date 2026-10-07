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
 *   unknown                      the server could not be asked. A connected
 *                                studio must not quietly fall back to local
 *                                invoice numbers, so callers wait and retry
 *
 * A function that is not deployed counts as "off", not "unknown": a studio
 * that never opted in must not be held up by it.
 */

const cache = new Map<string, ZohoStatus>();
const OFF: ZohoStatus = { connected: false, canManage: false, canRaise: false };

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
      setStatus(s);
      return s;
    } catch (e) {
      if (e instanceof ZohoCallError && e.isUnavailable) {
        setStatus(OFF);
        return OFF;
      }
      setUnknown(true);
      return null;
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
