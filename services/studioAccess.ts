import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseClient';

/**
 * What the server says this account is. See functions/src/access.ts.
 *
 * `none` means signed in, but on no studio's team and not a client: a Google
 * account that found the sign-in page. They get nothing.
 */
export type StudioAccess =
  | { access: 'studio'; tenantId: string | null; role: string }
  | { access: 'client'; tenantId: string | null; role: 'Client'; projectIds: string[] }
  | { access: 'none' };

/**
 * Settle the signed-in user's studio and role on the server.
 *
 * Returns null when the function cannot be reached -- offline, or not yet
 * deployed -- so callers can fall back to the profile already stored. They
 * must never fall back to writing one: the rules refuse it, and that refusal
 * is the point.
 */
export async function syncStudioAccess(): Promise<StudioAccess | null> {
  if (!functions) return null;
  try {
    const call = httpsCallable<void, StudioAccess>(functions, 'syncStudioAccess');
    return (await call()).data;
  } catch (e) {
    console.warn('syncStudioAccess unavailable; using the stored profile', e);
    return null;
  }
}

export interface PortalDoorBrand {
  name?: string | null;
  logo?: string | null;
  phone?: string | null;
  email?: string | null;
}

/**
 * The studio's name and logo for a portal link's sign-in screen, checked
 * against the link on the server. Empty for any link it does not recognise.
 */
export async function portalDoor(token: string): Promise<PortalDoorBrand> {
  if (!functions || !token) return {};
  try {
    const call = httpsCallable<{ token: string }, PortalDoorBrand>(functions, 'portalDoor');
    return (await call({ token })).data || {};
  } catch {
    return {};
  }
}

export interface StaffLogin {
  uid: string;
  email: string;
  role: string;
  tempPassword: string;
  /** True when the account already existed and only its password was reset. */
  reissued: boolean;
}

/**
 * Create or reset the login for someone on the studio's saved team list.
 * Throws with the server's own message, which is written for the person
 * pressing the button ("Save the team with this person on it first...").
 */
export async function createStaffLogin(tenantId: string, email: string): Promise<StaffLogin> {
  if (!functions) throw new Error('Cannot reach the server. Please try again shortly.');
  const call = httpsCallable<{ tenantId: string; email: string }, StaffLogin>(functions, 'createStaffLogin');
  return (await call({ tenantId, email })).data;
}

export const NO_STUDIO_MESSAGE =
  "This account isn't part of a studio yet. Ask your studio to add your email to its team, then sign in again.";
