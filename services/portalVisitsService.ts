/*
  Portal visits, both ends (lib/portalVisits).

  The portal: usePortalPing tells the portalPing function which approved tab
  a signed-in client has open, when the portal loads, on every tab change and
  every minute while the page is on screen. Fire and forget: a failure is
  ignored and never shown to the client. Only a real client pings: the
  studio's preview of the portal (source 'preview') never does, and the
  function would refuse a studio user anyway.

  The studio (Clients screen; never for a Viewer, whom the rules refuse):
    - loadRecentVisits: the studio's visits of the last day, in one query, for
      the list's "on the portal now", read on load and every 2 minutes;
    - watchClientVisits: a live listener on the opened client's projects only,
      so "on the portal now" follows them. No listeners for the list.
*/
import { useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, collectionGroup, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db, functions } from './firebaseClient';
import type { PortalVisit } from '../lib/portalVisits';

const PING_EVERY_MS = 60 * 1000;

function ping(projectId: string, tab: string) {
  if (!functions || !projectId) return;
  try {
    httpsCallable(functions, 'portalPing')({ projectId, tab }).catch(() => undefined);
  } catch {
    /* Never the client's problem. */
  }
}

/** In the client's portal: which tab is open, for the studio's follow-up. `enabled` only for a real client. */
export function usePortalPing(projectId: string | null | undefined, tab: string, enabled: boolean) {
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    if (enabled && projectId) ping(projectId, tab);
  }, [enabled, projectId, tab]);

  useEffect(() => {
    if (!enabled || !projectId) return;
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    const tick = window.setInterval(() => { if (visible()) ping(projectId, tabRef.current); }, PING_EVERY_MS);
    const back = () => { if (visible()) ping(projectId, tabRef.current); };
    document.addEventListener('visibilitychange', back);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', back);
    };
  }, [enabled, projectId]);
}

const rows = (snap: any): PortalVisit[] => snap.docs.map((d: any) => d.data() as PortalVisit);

/** The studio's visits since a moment, in one query (index: portalVisits tenantId, lastAt desc). */
export async function loadRecentVisits(tenantId: string, sinceMs: number): Promise<PortalVisit[]> {
  if (!db || !tenantId) return [];
  return getDocs(query(collectionGroup(db, 'portalVisits'), where('tenantId', '==', tenantId), where('lastAt', '>=', sinceMs), orderBy('lastAt', 'desc'), limit(500)))
    .then(rows);
}

/** Live: every client login's visits on these projects. Returns the unsubscribe. */
export function watchClientVisits(projectIds: string[], onChange: (visits: PortalVisit[]) => void): () => void {
  if (!db || projectIds.length === 0) { onChange([]); return () => undefined; }
  const byProject = new Map<string, PortalVisit[]>();
  const emit = () => onChange([...byProject.values()].flat());
  const stops = projectIds.map((pid) => onSnapshot(
    collection(db!, `projects/${pid}/portalVisits`),
    (snap) => { byProject.set(pid, rows(snap).map((v) => ({ ...v, projectId: v.projectId || pid }))); emit(); },
    (e) => { console.warn('Clients: portal visits', e?.code || e); byProject.set(pid, []); emit(); },
  ));
  return () => stops.forEach((s) => s());
}
