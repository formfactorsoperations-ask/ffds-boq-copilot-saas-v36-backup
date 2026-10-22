import { getCachedAccessToken, setCachedAccessToken } from './authService';
import { auth } from './firebaseClient';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { CALENDAR_SCOPE, CALENDAR_MESSAGES, CalendarErrorKind, calendarErrorKind } from '../lib/calendarErrors';

// The cached token is only ever one from connectGoogleCalendar, so it always asked for calendar access.
// The Google sign-in token does not, and treating it as "connected" sent calendar calls out that Google refused with 403.
export const isGoogleCalendarConnected = () => !!getCachedAccessToken();

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

export const connectGoogleCalendar = async () => {
  if (!auth) throw new Error("Firebase Auth not initialized");

  const provider = new GoogleAuthProvider();
  provider.addScope(CALENDAR_SCOPE);
  provider.setCustomParameters({
    prompt: 'consent'
  });

  try {
    let userCredential;

    // We just want the token. signInWithPopup will change the user session if it's a different account.
    // If the user wants to use a different GMail account specifically for Calendar,
    // it's best to just do signInWithPopup. They will technically switch Firebase Auth users.
    // But since this is what was requested (a separate step), we'll do signInWithPopup.
    userCredential = await signInWithPopup(auth, provider);

    const credential = GoogleAuthProvider.credentialFromResult(userCredential);
    if (!credential?.accessToken) return false;

    // Google's consent screen lets the user untick calendar access, and the token still comes back.
    // Check it can read the calendar before calling it connected.
    const probe = await calendarFetch(credential.accessToken, 'GET', '/calendars/primary/events?maxResults=1');
    if (!probe.ok) {
      setCachedAccessToken(null);
      throw new GoogleCalendarError(calendarErrorKind(probe.status, await probe.text()), probe.status);
    }
    setCachedAccessToken(credential.accessToken);
    return true;
  } catch (error) {
    console.error("Failed to connect Google Calendar", error);
    throw error;
  }
};

export const callGoogleCalendarAPI = async (method: string, endpoint: string, body?: any) => {
  const token = getCachedAccessToken();
  if (!token) throw new GoogleCalendarError('not-connected', 401);

  const response = await calendarFetch(token, method, endpoint, body);

  if (!response.ok) {
    const errorText = await response.text();
    const kind = calendarErrorKind(response.status, errorText);
    if (kind === 'scope' || kind === 'expired') {
      setCachedAccessToken(null); // Clear the token so the app asks to connect again
    }
    console.error(`Google Calendar API Error: ${response.status} - ${errorText}`);
    throw kind === 'other'
      ? new Error(`Google Calendar API Error: ${response.status} - ${errorText}`)
      : new GoogleCalendarError(kind, response.status);
  }

  return response.json();
};
