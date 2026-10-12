/*
  People in the browser: the snapshot and the commands go through the Cloud
  Functions (functions/src/peopleDesk.ts); nothing is read from the database
  directly. One shared store, so Home's My day card and the People screen
  show the same day and refresh together.
*/
import { useEffect, useSyncExternalStore } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseClient';
import type { Command, Snapshot } from '../lib/peopleDesk';
import { newCommandId } from '../lib/peopleView';
import { useOrg } from '../contexts/OrgContext';

export interface Reading { lat: number; lng: number; accuracyM: number }

/** Where the person is, from their browser; null when they decline, or it takes too long. */
export function readLocation(timeoutMs = 15000): Promise<{ reading: Reading | null; why?: 'denied' | 'unavailable' | 'timeout' }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ reading: null, why: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ reading: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy || 0) } }),
      (e) => resolve({ reading: null, why: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

/* ── The store ───────────────────────────────────────────────────────────── */

interface State { snapshot: Snapshot | null; loading: boolean; error: string | null; at: number }
let state: State = { snapshot: null, loading: false, error: null, at: 0 };
/* The studio being viewed. Staff belong to one; the platform owner names it (functions/src/peopleDesk.ts). */
let tenantId = '';
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

const messageOf = (e: any): string => {
  const code = String(e?.code || '');
  if (code.endsWith('unauthenticated')) return 'Please sign in again.';
  if (code.endsWith('not-found') && /function/i.test(String(e?.message))) return 'People is not switched on yet. Ask an admin to deploy it.';
  return e?.message && !/^internal$/i.test(e.message) ? String(e.message) : 'People did not answer. Check your connection and try again.';
};
const transient = (e: any) => /unavailable|deadline-exceeded|internal/.test(String(e?.code || ''));

let inflight: Promise<void> | null = null;
export function refreshPeople(): Promise<void> {
  if (inflight) return inflight;
  if (!functions) { set({ error: 'People needs the studio to be connected.', loading: false }); return Promise.resolve(); }
  set({ loading: true });
  inflight = httpsCallable(functions, 'peopleSnapshot', { timeout: 30000 })({ tenantId })
    .then((r: any) => set({ snapshot: r.data.snapshot, error: null, at: Date.now() }))
    .catch((e) => set({ error: messageOf(e) }))
    .finally(() => { set({ loading: false }); inflight = null; });
  return inflight;
}

/**
 * Send one action. A connection that drops is retried once with the same
 * command ID, which the server answers with the first outcome rather than
 * acting twice.
 */
export async function runPeople(action: Command['action'], data: Command['data']): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!functions) return { ok: false, error: 'People needs the studio to be connected.' };
  const command: Command = { id: newCommandId(), action, data };
  const call = httpsCallable(functions, 'peopleCommand', { timeout: 40000 });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r: any = await call({ command, tenantId });
      set({ snapshot: r.data.snapshot, error: null, at: Date.now() });
      return { ok: true };
    } catch (e: any) {
      if (attempt === 1 && transient(e)) continue;
      return { ok: false, error: transient(e) ? 'That may have been saved. Refresh to check before trying again.' : messageOf(e) };
    }
  }
  return { ok: false, error: 'People did not answer.' };
}

/** The shared snapshot; loads on first use, and again when the tab comes back after half a minute. */
export function usePeople() {
  const studio = String((useOrg() as any)?.orgData?.tenantId || '');
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (!studio) return;
    if (studio !== tenantId) { tenantId = studio; set({ snapshot: null, error: null, at: 0 }); inflight = null; refreshPeople(); return; }
    if (!state.snapshot && !state.loading) refreshPeople();
    const onFocus = () => { if (Date.now() - state.at > 30000) refreshPeople(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [studio]);
  return { ...s, refresh: refreshPeople, run: runPeople };
}
