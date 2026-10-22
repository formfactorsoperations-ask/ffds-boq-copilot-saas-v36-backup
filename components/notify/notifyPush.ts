import { getApps } from 'firebase/app';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseClient';
import { askDesktop, desktopPermission } from './notifyChannels';

/*
  PHONE NOTIFICATIONS (pattern 13 in the round-two mockups).

  A "needs you" note reaches a phone, or a laptop with StudioDesk closed,
  through Firebase Cloud Messaging. Each person turns it on per device from
  "What reaches you": the browser asks once, this device's push token is kept
  at {box}/devices/{id} (inbox/{email} for the studio, portalInbox/{uid} for
  a client), and the server sends to every token the person has, inside their
  own settings and quiet hours (functions/src/notify.ts). Turning it off
  forgets the token here and on the server.

  The worker that shows them is /firebase-messaging-sw.js (sw/, bundled by
  build.js). It needs the public half of the project's Web Push certificate
  in VITE_FIREBASE_VAPID_KEY; without it this says "needs setup" and nothing
  else changes. On an iPhone, a web app may only notify once it has been
  added to the Home Screen (iOS 16.4 and later).
*/

export type PhoneState = 'unsupported' | 'setup' | 'install' | 'denied' | 'off' | 'on';

const VAPID: string = (() => {
  try { return String((import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || ''); } catch { return ''; }
})();
const SW_URL = '/firebase-messaging-sw.js';
const SW_SCOPE = '/firebase-cloud-messaging-push-scope';
const onKey = (box: string) => `studiodesk.phone.${box}`;
const DEVICE_KEY = 'studiodesk.deviceId';

const ios = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const installed = () => {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true; } catch { return false; }
};

function deviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) { id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; window.localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch {
    return 'this-browser';
  }
}

/** "Android · Chrome", "iPhone · Safari", "Windows · Edge": how the device reads in the person's list. */
export function platformName(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'This device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${browser}`;
}

const remembered = (box: string) => { try { return window.localStorage.getItem(onKey(box)) === '1'; } catch { return false; } };
const remember = (box: string, on: boolean) => { try { if (on) window.localStorage.setItem(onKey(box), '1'); else window.localStorage.removeItem(onKey(box)); } catch { /* private window */ } };

async function supported(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try { return await (await import('firebase/messaging')).isSupported(); } catch { return false; }
}

/** Where this device stands for one person's phone notifications. */
export async function phoneState(box: string | null | undefined): Promise<PhoneState> {
  if (!box) return 'unsupported';
  if (ios() && !installed()) return 'install';
  if (!(await supported())) return 'unsupported';
  if (!VAPID) return 'setup';
  if (desktopPermission() === 'denied') return 'denied';
  return remembered(box) && desktopPermission() === 'granted' ? 'on' : 'off';
}

async function token(): Promise<string> {
  const { getMessaging, getToken } = await import('firebase/messaging');
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  return getToken(getMessaging(getApps()[0]), { vapidKey: VAPID, serviceWorkerRegistration: reg });
}

async function keep(box: string, t: string): Promise<void> {
  if (!db) throw new Error('offline');
  await setDoc(doc(db, box, 'devices', deviceId()), { token: t, platform: platformName(), at: Date.now() });
}

/** Ask the browser, then keep this device's token. Resolves to where it ended up. */
export async function turnPhoneOn(box: string | null | undefined): Promise<PhoneState> {
  const state = await phoneState(box);
  if (!box || state === 'unsupported' || state === 'setup' || state === 'install' || state === 'denied') return state;
  if ((await askDesktop()) !== 'granted') return desktopPermission() === 'denied' ? 'denied' : 'off';
  await keep(box, await token());
  remember(box, true);
  return 'on';
}

export async function turnPhoneOff(box: string | null | undefined): Promise<PhoneState> {
  if (!box) return 'unsupported';
  remember(box, false);
  try { if (db) await deleteDoc(doc(db, box, 'devices', deviceId())); } catch { /* the server drops a dead token on its own */ }
  try {
    const { getMessaging, deleteToken } = await import('firebase/messaging');
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (reg) { await deleteToken(getMessaging(getApps()[0])); await reg.unregister(); }
  } catch { /* nothing more to forget */ }
  return phoneState(box);
}

/** On each visit with it on: the browser may have rotated the token, so keep the current one. */
export async function refreshPhone(box: string | null | undefined): Promise<void> {
  if (!box || (await phoneState(box)) !== 'on') return;
  try { await keep(box, await token()); } catch { /* try again next visit */ }
}

/** The worker asks an open StudioDesk to open the note that was tapped. */
export function onPhoneTap(fn: (noteId: string) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  const on = (e: MessageEvent) => { if (e.data?.type === 'studiodesk:open-note' && e.data.noteId) fn(String(e.data.noteId)); };
  navigator.serviceWorker.addEventListener('message', on);
  return () => navigator.serviceWorker.removeEventListener('message', on);
}
