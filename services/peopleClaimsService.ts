/*
  Travel claims in the browser (lib/peopleClaims.ts): your trips, and for the
  founders everyone's, through the Cloud Functions (functions/src/peopleClaims.ts);
  nothing is read from the database directly. One shared view, so the rail's
  count, Approvals, Travel and the monthly report agree.
*/
import { useEffect, useSyncExternalStore } from 'react';
import type { ClaimsView } from '../lib/peopleClaims';
import { newCommandId } from '../lib/peopleView';
import { functions } from './firebaseClient';
import { callPeople, messageOf, transient } from './peopleService';
import { useOrg } from '../contexts/OrgContext';

interface State { view: ClaimsView | null; loading: boolean; error: string | null; at: number }
let state: State = { view: null, loading: false, error: null, at: 0 };
/* The studio and person the view is of: a different one starts again. */
let studio = '';
let viewer = '';
let generation = 0;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

let inflight: Promise<void> | null = null;
export function refreshClaims(): Promise<void> {
  if (inflight) return inflight;
  if (!functions || !studio) return Promise.resolve();
  const gen = generation;
  set({ loading: true });
  const p: Promise<void> = (async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await callPeople('peopleClaims', { tenantId: studio }, 30000);
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

/** Change something: a trip carries an ID, so a retry after a dropped connection logs it once; decisions are safe to send twice. */
export async function runClaims(action: string, data: Record<string, unknown>): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
  if (!functions || !studio) return { ok: false, error: 'Travel claims need the studio to be connected.' };
  const sent = { id: newCommandId(), ...data };
  const gen = generation;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await callPeople('peopleClaimsCommand', { tenantId: studio, action, data: sent }, 60000);
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
export function useClaims(enabled = true) {
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
    if (!state.view && !inflight) refreshClaims();
    const onFocus = () => { if (Date.now() - state.at > 60000) refreshClaims(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tenant, enabled, uid]);
  return { ...s, refresh: refreshClaims, run: runClaims };
}

/* ── Receipts ────────────────────────────────────────────────────────────── */

/** A receipt photo, made small enough to keep beside the trip (long edge 1400 px, JPEG); a PDF goes as it is. */
export function receiptOf(file: File): Promise<{ type: string; data: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const url = String(reader.result || '');
      const raw = url.slice(url.indexOf(',') + 1);
      if (file.type === 'application/pdf') {
        if (raw.length > 880000) { reject(new Error('That PDF is too large. Take a photo of the receipt instead.')); return; }
        resolve({ type: 'application/pdf', data: raw, preview: '' });
        return;
      }
      if (!file.type.startsWith('image/')) { reject(new Error('Add a photo or a PDF of the receipt.')); return; }
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that photo.'));
      img.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Could not read that photo.')); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const q of [0.75, 0.6, 0.45]) {
          const out = canvas.toDataURL('image/jpeg', q);
          const data = out.slice(out.indexOf(',') + 1);
          if (data.length <= 880000) { resolve({ type: 'image/jpeg', data, preview: out }); return; }
        }
        reject(new Error('That photo is too large. Try a closer photo of the receipt.'));
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  });
}

/** Open a trip's receipt in a new tab. */
export async function openReceipt(claimId: string): Promise<string | null> {
  const w = window.open('', '_blank');
  const r = await runClaims('receipt', { claimId });
  if ('error' in r) { w?.close(); return r.error; }
  const { type, data } = r.result.receipt || {};
  const bytes = Uint8Array.from(atob(String(data || '')), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  if (w) w.location.href = url; else window.open(url, '_blank');
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return null;
}
