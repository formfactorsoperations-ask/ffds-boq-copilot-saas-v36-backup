/*
  People's office guide in the browser: the guide, the essentials, the cards,
  the kudos wall and your emergency contacts, through the Cloud Functions
  (functions/src/peopleGuide.ts); nothing is read from the database directly.
  One shared view, so the Today banner and the guide's sections agree.
*/
import { useEffect, useSyncExternalStore } from 'react';
import type { GuideView } from '../lib/peopleGuide';
import { newCommandId } from '../lib/peopleView';
import { functions } from './firebaseClient';
import { callPeople, messageOf, transient } from './peopleService';
import { useOrg } from '../contexts/OrgContext';

interface State { view: GuideView | null; loading: boolean; error: string | null; at: number }
let state: State = { view: null, loading: false, error: null, at: 0 };
/* The studio the view is of, and who it was for: a different studio or person starts again (it holds their emergency contacts). */
let studio = '';
let viewer = '';
let generation = 0;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

let inflight: Promise<void> | null = null;
export function refreshGuide(): Promise<void> {
  if (inflight) return inflight;
  if (!functions || !studio) return Promise.resolve();
  const gen = generation;
  set({ loading: true });
  const p: Promise<void> = (async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await callPeople('peopleGuide', { tenantId: studio }, 30000);
        if (gen === generation && r?.view) set({ view: r.view, error: null, at: Date.now() });
        return;
      } catch (e) {
        if (gen !== generation) return;
        if (attempt === 1 && transient(e)) continue;
        set({ error: messageOf(e) });
        return;
      }
    }
  })().finally(() => { if (inflight === p) { inflight = null; set({ loading: false }); } });
  inflight = p;
  return p;
}

/**
 * Change something in the guide. Thank-yous and emergency openings carry an
 * ID, so a retry after a dropped connection acts once; everything else is
 * safe to send twice.
 */
export async function runGuide(action: string, data: Record<string, unknown>): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
  if (!functions || !studio) return { ok: false, error: 'People needs the studio to be connected.' };
  const sent = { id: newCommandId(), ...data };
  const gen = generation;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await callPeople('peopleGuideCommand', { tenantId: studio, action, data: sent }, 40000);
      if (gen === generation && r?.view) set({ view: r.view, error: null, at: Date.now() });
      return { ok: true, result: r };
    } catch (e: any) {
      if (attempt === 1 && transient(e)) continue;
      return { ok: false, error: transient(e) ? 'That may have been saved. Refresh to check before trying again.' : messageOf(e) };
    }
  }
  return { ok: false, error: 'People did not answer.' };
}

/** The shared view: loads with People, and again when the tab comes back after a minute. */
export function useGuide(enabled = true) {
  const org: any = useOrg();
  const tenant = String(org?.orgData?.tenantId || '');
  const uid = String(org?.currentUserAuth?.uid || '');
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (!tenant || !enabled) return;
    if (tenant !== studio || uid !== viewer) {
      studio = tenant;
      viewer = uid;
      generation++;
      inflight = null;
      set({ view: null, error: null, loading: false, at: 0 });
    }
    if (!state.view && !inflight) refreshGuide();
    const onFocus = () => { if (Date.now() - state.at > 60000) refreshGuide(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tenant, enabled, uid]);
  return { ...s, refresh: refreshGuide, run: runGuide };
}
