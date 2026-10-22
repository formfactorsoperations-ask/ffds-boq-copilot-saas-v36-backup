import { auth } from './firebaseClient';
import { getApps, initializeApp } from 'firebase/app';
import {
  Auth, GoogleAuthProvider, browserPopupRedirectResolver, inMemoryPersistence, initializeAuth, signInWithPopup, signOut,
} from 'firebase/auth';
import { CALENDAR_SCOPE, CALENDAR_MESSAGES, CalendarErrorKind, calendarErrorKind } from '../lib/calendarErrors';

/*
  The Google accounts the app writes calendar events with.

  Signing in to a calendar account used to go through the app's own sign-in,
  so picking another Google account in the popup signed the whole app in as
  that account. It now goes through a second, memory-only Firebase Auth: the
  app stays signed in as the person using it, and they can add as many Google
  accounts as they like (their own, the studio's) and choose which one a
  meeting is created from. Its Meet link comes from that account.

  Access tokens last an hour and are kept in memory only. The accounts'
  addresses, and which one is in use, are remembered in this browser so the
  next sign-in can go straight to the right account.
*/

export interface CalendarAccount {
  email: string;
  name: string;
  /** False once its hour is up, or Google refused it: signing in again brings it back. */
  live: boolean;
}

interface Held { email: string; name: string; token: string | null; expiresAt: number }

const KNOWN_KEY = 'ffds_calendar_accounts';
const ACTIVE_KEY = 'ffds_calendar_active';
const TOKEN_LIFE = 55 * 60000;

const held = new Map<string, Held>();
let active: string | null = null;
const listeners = new Set<() => void>();

(() => {
  try {
    const known = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]');
    if (Array.isArray(known)) for (const k of known) if (k?.email) held.set(String(k.email), { email: String(k.email), name: String(k.name || ''), token: null, expiresAt: 0 });
    active = localStorage.getItem(ACTIVE_KEY) || null;
  } catch { /* private window: nothing remembered */ }
})();

const remember = () => {
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify([...held.values()].map(({ email, name }) => ({ email, name }))));
    if (active) localStorage.setItem(ACTIVE_KEY, active); else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* private window */ }
};
const changed = () => { remember(); listeners.forEach((fn) => fn()); };
const liveToken = (h?: Held | null) => (h && h.token && h.expiresAt > Date.now() ? h.token : null);
const dropToken = (email: string) => {
  const h = held.get(email);
  if (h) { h.token = null; h.expiresAt = 0; changed(); }
};

/** Every account signed in on this browser, the one in use first. */
export const calendarAccounts = (): CalendarAccount[] =>
  [...held.values()]
    .map((h) => ({ email: h.email, name: h.name, live: !!liveToken(h) }))
    .sort((a, b) => Number(b.email === active) - Number(a.email === active) || a.email.localeCompare(b.email));
/** The account meetings are created from unless another is chosen. */
export const activeCalendarAccount = () => (active && held.has(active) ? active : null);
export const setActiveCalendarAccount = (email: string) => { if (held.has(email)) { active = email; changed(); } };
export const isCalendarAccountLive = (email: string | null | undefined) => !!(email && liveToken(held.get(email)));
/** Sign an account out of the calendar here. Its events stay in its calendar. */
export const forgetCalendarAccount = (email: string) => {
  held.delete(email);
  if (active === email) active = held.keys().next().value || null;
  changed();
};
export const onCalendarAccountsChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

// The token in use was only ever given by a calendar sign-in, so it always asked for calendar access.
// The app's Google sign-in token does not, and treating it as "connected" sent calendar calls out that Google refused with 403.
export const isGoogleCalendarConnected = () => isCalendarAccountLive(activeCalendarAccount());

/** A Calendar API refusal, with a plain message and whether connecting again can fix it. */
export class GoogleCalendarError extends Error {
  kind: CalendarErrorKind;
  status: number;
  constructor(kind: CalendarErrorKind, status: number) {
    super(CALENDAR_MESSAGES[kind]);
    this.name = 'GoogleCalendarError';
    this.kind = kind;
    this.status = status;
  }
  get needsReconnect() { return this.kind === 'not-connected' || this.kind === 'scope' || this.kind === 'expired'; }
}

const calendarFetch = (token: string, method: string, endpoint: string, body?: any) =>
  fetch(`https://www.googleapis.com/calendar/v3${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

/* The second sign-in: same Firebase project, kept in memory, never the app's session. */
let calendarAuth: Auth | null = null;
const calendarSignIn = (): Auth => {
  if (calendarAuth) return calendarAuth;
  if (!auth) throw new Error("Firebase Auth not initialized");
  const app = getApps().find((a) => a.name === 'calendar-accounts') || initializeApp(auth.app.options, 'calendar-accounts');
  calendarAuth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  return calendarAuth;
};

/**
 * Sign in a Google account for the calendar, and make it the one in use.
 * `loginHint` goes straight to that account (signing it in again); without it
 * Google asks which account. Call it from the click itself, before any await,
 * or the browser blocks the popup.
 */
export const addCalendarAccount = async (loginHint?: string): Promise<CalendarAccount> => {
  const signIn = calendarSignIn();
  const provider = new GoogleAuthProvider();
  provider.addScope(CALENDAR_SCOPE);
  provider.setCustomParameters(loginHint ? { login_hint: loginHint, prompt: 'consent' } : { prompt: 'select_account consent' });

  try {
    const result = await signInWithPopup(signIn, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const email = String(result.user.email || '').toLowerCase();
    const name = String(result.user.displayName || '');
    signOut(signIn).catch(() => { /* memory only: nothing to keep */ });
    if (!credential?.accessToken || !email) throw new GoogleCalendarError('not-connected', 401);

    // Google's consent screen lets the user untick calendar access, and the token still comes back.
    // Check it can read the calendar before calling it connected.
    const probe = await calendarFetch(credential.accessToken, 'GET', '/calendars/primary/events?maxResults=1');
    if (!probe.ok) throw new GoogleCalendarError(calendarErrorKind(probe.status, await probe.text()), probe.status);

    held.set(email, { email, name, token: credential.accessToken, expiresAt: Date.now() + TOKEN_LIFE });
    active = email;
    changed();
    return { email, name, live: true };
  } catch (error) {
    console.error("Failed to connect Google Calendar", error);
    throw error;
  }
};

/** Sign in a calendar account (Google asks which) and use it. True once connected. */
export const connectGoogleCalendar = async () => !!(await addCalendarAccount());

/** A Calendar API call, as the account in use or as `account`. */
export const callGoogleCalendarAPI = async (method: string, endpoint: string, body?: any, account?: string | null) => {
  const email = account || activeCalendarAccount();
  const token = email ? liveToken(held.get(email)) : null;
  if (!email || !token) throw new GoogleCalendarError(email && held.has(email) ? 'expired' : 'not-connected', 401);

  const response = await calendarFetch(token, method, endpoint, body);

  if (!response.ok) {
    const errorText = await response.text();
    const kind = calendarErrorKind(response.status, errorText);
    if (kind === 'scope' || kind === 'expired') {
      dropToken(email); // so the app asks to connect again
    }
    console.error(`Google Calendar API Error: ${response.status} - ${errorText}`);
    throw kind === 'other'
      ? new Error(`Google Calendar API Error: ${response.status} - ${errorText}`)
      : new GoogleCalendarError(kind, response.status);
  }

  return response.status === 204 ? null : response.json();
};
