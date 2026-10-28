/*
  People in the browser: the snapshot and the commands go through the Cloud
  Functions (functions/src/peopleDesk.ts); nothing is read from the database
  directly. One shared store, so Home's My day card and the People screen
  show the same day and refresh together.
*/
import { useEffect, useSyncExternalStore } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, functionsIn } from './firebaseClient';
import type { Command, Snapshot } from '../lib/peopleDesk';
import { mergeChange, newCommandId } from '../lib/peopleView';
import { useOrg } from '../contexts/OrgContext';

export interface Reading { lat: number; lng: number; accuracyM: number }
type Located = { reading: Reading | null; why?: 'denied' | 'unavailable' | 'timeout' };

/* ── Where the person is ─────────────────────────────────────────────────── */

const asReading = (p: GeolocationPosition): Reading => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy || 0) });
function position(options: PositionOptions): Promise<Located> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ reading: null, why: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ reading: asReading(p) }),
      (e) => resolve({ reading: null, why: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }),
      options,
    );
  });
}

/** Where the person is, from their browser; null when they decline, or it takes too long. */
export function readLocation(timeoutMs = 15000): Promise<Located> {
  return position({ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 });
}

/* The last good reading this session, so a check-in rarely waits for one. */
let lastReading: { reading: Reading; at: number } | null = null;
const remember = (l: Located) => { if (l.reading) lastReading = { reading: l.reading, at: Date.now() }; return l; };

/**
 * Take a reading ahead of the tap, when the browser already allows location:
 * the My day card calls this as it opens. Never asks for permission itself.
 */
export async function warmLocation(): Promise<void> {
  try {
    const p = await (navigator as any)?.permissions?.query?.({ name: 'geolocation' });
    if (p?.state !== 'granted') return;
  } catch { return; }
  if (lastReading && Date.now() - lastReading.at < 60000) return;
  remember(await position({ enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }));
}

/**
 * A reading for a check-in or check-out, quickly. It used to wait for a GPS
 * fix every time (up to 15 seconds indoors). Now: a recent reading if one is
 * good enough; else a quick, coarse one, kept when it is already accurate to
 * `goodWithinM`; else a precise one, for whatever is left of `maxWaitMs`.
 * The best reading found is returned; the server decides what it means.
 */
export async function locate(o: { goodWithinM: number; maxWaitMs: number; freshMs?: number }): Promise<Located> {
  const started = Date.now();
  if (lastReading && Date.now() - lastReading.at < (o.freshMs ?? 120000) && lastReading.reading.accuracyM <= o.goodWithinM) return { reading: lastReading.reading };
  const quick = remember(await position({ enableHighAccuracy: false, maximumAge: o.freshMs ?? 120000, timeout: Math.min(2500, o.maxWaitMs) }));
  if (quick.why === 'denied') return quick;
  if (quick.reading && quick.reading.accuracyM <= o.goodWithinM) return quick;
  const left = o.maxWaitMs - (Date.now() - started);
  if (left < 500) return quick.reading ? quick : { reading: lastReading?.reading || null, why: quick.why };
  const precise = remember(await position({ enableHighAccuracy: true, maximumAge: 30000, timeout: left }));
  if (precise.reading && (!quick.reading || precise.reading.accuracyM <= quick.reading.accuracyM)) return precise;
  return quick.reading ? quick : precise;
}

/* ── The store ───────────────────────────────────────────────────────────── */

interface State {
  snapshot: Snapshot | null;
  loading: boolean;
  /** Why People could not open; only while there is nothing to show. */
  error: string | null;
  /** The last refresh failed; what is on screen is from `at`. */
  stale: boolean;
  at: number;
}
let state: State = { snapshot: null, loading: false, error: null, stale: false, at: 0 };
/* The studio being viewed. Staff belong to one; the platform owner names it (functions/src/peopleDesk.ts). */
let tenantId = '';
/* The studio the snapshot on screen came from, as the server says. */
let loadedFor = '';
/* Who is signed in: a different person never sees the last one's snapshot. */
let signedIn = '';
/* Bumped on every reset: an answer to a request made before it is dropped. */
let generation = 0;
/* Bumped when a command's result lands: a refresh that set off before it is older and is dropped. */
let writes = 0;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export const messageOf = (e: any): string => {
  const code = String(e?.code || '');
  if (code.endsWith('unauthenticated')) return 'Please sign in again.';
  if (code.endsWith('deadline-exceeded')) return 'People is taking too long to answer. Check your connection and try again.';
  if (code.endsWith('unavailable')) return 'People could not be reached. Check your connection and try again.';
  if (code.endsWith('not-found') && /function/i.test(String(e?.message))) return 'People is not switched on yet. Ask an admin to deploy it.';
  return e?.message && !/^internal$/i.test(e.message) ? String(e.message) : 'People did not answer. Check your connection and try again.';
};
export const transient = (e: any) => /unavailable|deadline-exceeded|internal/.test(String(e?.code || ''));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/*
  The People functions run in asia-south1, beside the database. Until they are
  deployed there, the same call goes to the us-central1 copy: a function that
  is not there answers "not found", or fails its CORS check, which the SDK
  reports as a bare "internal". A command is safe to send twice (its ID).
*/
const PEOPLE_REGION = 'asia-south1';
const notThere = (e: any) => /not-found/.test(String(e?.code || '')) || (/internal/.test(String(e?.code || '')) && /^internal$/i.test(String(e?.message || '')));
export async function callPeople(name: string, data: Record<string, unknown>, timeout: number): Promise<any> {
  const near = functionsIn(PEOPLE_REGION);
  if (near) {
    try {
      return (await httpsCallable(near, name, { timeout })(data)).data;
    } catch (e) {
      if (!notThere(e) || !functions) throw e;
    }
  }
  return (await httpsCallable(functions!, name, { timeout })(data)).data;
}

let inflight: Promise<void> | null = null;
/* A refresh after the one in flight, which may have set off before a command and so be dropped. */
const refreshAfter = (): Promise<void> => (inflight ? inflight.then(() => refreshPeople()) : refreshPeople());
/**
 * Bring the snapshot up to date. It names the version it has, and hears
 * "unchanged" when nothing has moved. The first load is tried twice before
 * People says it could not open; a refresh that fails keeps what is on screen.
 */
export function refreshPeople(): Promise<void> {
  if (inflight) return inflight;
  if (!functions) { set({ error: 'People needs the studio to be connected.', loading: false }); return Promise.resolve(); }
  const gen = generation, wrote = writes;
  const since = state.snapshot?.version || '';
  set({ loading: true });
  const p: Promise<void> = (async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await callPeople('peopleSnapshot', { tenantId, ...(since ? { since } : {}) }, 30000);
        if (gen !== generation || wrote !== writes) return;
        if (r?.tenantId) loadedFor = String(r.tenantId);
        /* Unchanged: the same object stays, so nothing on screen recomputes. */
        if (r?.unchanged && state.snapshot) set({ error: null, stale: false, at: Date.now() });
        else if (r?.snapshot) set({ snapshot: r.snapshot, error: null, stale: false, at: Date.now() });
        return;
      } catch (e) {
        if (gen !== generation) return;
        if (attempt === 1 && transient(e)) { await pause(600); continue; }
        if (state.snapshot) set({ stale: true });
        else set({ error: messageOf(e) });
        return;
      }
    }
  })().finally(() => { if (inflight === p) { inflight = null; set({ loading: false }); } });
  inflight = p;
  return p;
}

/**
 * Send one action. A connection that drops is retried once with the same
 * command ID, which the server answers with the first outcome rather than
 * acting twice. The answer is only what changed, put into the snapshot on
 * screen; a changed request also moves leave balances, so a refresh follows.
 */
export async function runPeople(action: Command['action'], data: Command['data']): Promise<{ ok: true; snapshot?: Snapshot } | { ok: false; error: string }> {
  if (!functions) return { ok: false, error: 'People needs the studio to be connected.' };
  const command: Command = { id: newCommandId(), action, data };
  const gen = generation;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await callPeople('peopleCommand', { command, tenantId, delta: true }, 40000);
      if (gen !== generation) return { ok: true };
      writes++;
      if (r?.snapshot) {
        /* A server that does not send changes yet answers with the whole snapshot. */
        set({ snapshot: r.snapshot, error: null, stale: false, at: Date.now() });
      } else if (r?.change && state.snapshot) {
        set({ snapshot: mergeChange(state.snapshot, r.change), error: null });
        if (r.change.request) refreshAfter();
      } else {
        /* A repeat of a command already applied, or nothing on screen to merge into: fetch the state. */
        await refreshAfter();
      }
      return { ok: true, snapshot: state.snapshot || undefined };
    } catch (e: any) {
      if (attempt === 1 && transient(e)) continue;
      return { ok: false, error: transient(e) ? 'That may have been saved. Refresh to check before trying again.' : messageOf(e) };
    }
  }
  return { ok: false, error: 'People did not answer.' };
}

/**
 * A month's attendance older than the snapshot's four months (the monthly
 * report reaching into imported history), for the studio being viewed.
 */
export async function fetchPeopleMonth(month: string): Promise<Snapshot | null> {
  if (!functions || !tenantId) return null;
  const r = await callPeople('peopleSnapshot', { tenantId, month }, 30000);
  return (r?.snapshot as Snapshot) || null;
}

/** One step of a People Hub import (functions/src/peopleImport.ts). Only those who run People may. */
export async function peopleImportCall(studio: string, data: Record<string, unknown>): Promise<any> {
  if (!functions) throw new Error('People needs the studio to be connected.');
  try {
    const r: any = await httpsCallable(functions, 'peopleImport', { timeout: 120000 })({ tenantId: studio, ...data });
    return r.data;
  } catch (e: any) {
    throw new Error(messageOf(e));
  }
}

/** The studio People is showing, for the office guide's calls (services/peopleGuideService.ts). */
export const peopleStudio = () => tenantId;

/** Start loading People before it is needed (after sign-in, or on the way to the People tab). */
export function prefetchPeople(): void {
  if (!state.snapshot && !inflight && tenantId) refreshPeople();
}

/** The shared snapshot; loads on first use, and again when the tab comes back after half a minute. */
export function usePeople(enabled = true) {
  const org: any = useOrg();
  const studio = String(org?.orgData?.tenantId || '');
  const uid = String(org?.currentUserAuth?.uid || '');
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    /* Off for those not on People: nothing is fetched for them. */
    if (!studio || !enabled) return;
    const otherPerson = !!signedIn && !!uid && uid !== signedIn;
    if (uid) signedIn = uid;
    if (studio !== tenantId || otherPerson) {
      const first = !tenantId;
      tenantId = studio;
      /*
        The studio first comes from this browser's memory, then from the
        account. The server already answered for the account's studio, so a
        snapshot from it is kept; anything else starts again.
      */
      if (otherPerson || (!first && loadedFor !== studio)) {
        generation++;
        inflight = null;
        loadedFor = '';
        set({ snapshot: null, error: null, stale: false, loading: false, at: 0 });
      }
    }
    if (!state.snapshot && !inflight) refreshPeople();
    const onFocus = () => { if (Date.now() - state.at > 30000) refreshPeople(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [studio, enabled, uid]);
  return { ...s, refresh: refreshPeople, run: runPeople };
}
