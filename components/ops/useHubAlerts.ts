import { useEffect, useMemo, useState } from 'react';
import { readPortalView } from '../../services/portalViewService';
import { buildHubAlerts, HubAlert } from '../../lib/hubAlerts';

/**
 * What is waiting on you on one project (lib/hubAlerts): a client question
 * still unanswered, work the portal has not been sent, money due.
 *
 * This used to be its own bell at the end of the project hub row. The studio's
 * notification bell (components/notify/NotifyBell) now sits there too, and two
 * bells side by side read as a mistake, so these alerts are the first section
 * of that one bell instead ("On this project"), and count on it.
 *
 * It sends nothing. Each alert routes to the screen that owns the decision --
 * anything client-facing goes to the Client Portal tab -- so the figures are
 * checked in place and a human presses Release. The publish controls stay the
 * only path to a client.
 */
export function useHubAlerts(projectId: string | undefined, projectContext: any): { alerts: HubAlert[]; dismiss: (id: string) => void } {
  const [view, setView] = useState<any | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  /* The client's stored copy, which is half of every comparison below. */
  useEffect(() => {
    let alive = true;
    if (!projectId) { setView(null); return; }
    readPortalView(projectId).then(v => { if (alive) setView(v); }).catch(() => {});
    return () => { alive = false; };
  }, [projectId, projectContext]);

  const alerts = useMemo(
    () => buildHubAlerts({ context: projectContext, view }).filter(a => !dismissed.includes(a.id)),
    [projectContext, view, dismissed],
  );
  return { alerts, dismiss: (id: string) => setDismissed(d => [...d, id]) };
}
