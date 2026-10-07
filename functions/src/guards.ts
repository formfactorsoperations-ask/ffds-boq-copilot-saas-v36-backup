import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/*
  WHO MAY USE THE STUDIO'S PAID SERVICES.

  Signing in proves only that somebody holds a Google account or a password:
  Google sign-in is open, so "signed in" includes every stranger who clicks the
  button. The AI and email functions spend the studio's money and speak with
  its name, so they ask the caller's profile -- written only by the Admin SDK
  (syncStudioAccess, createStaffLogin) -- for a studio and a staff role.
*/

export const PLATFORM_OWNER_EMAILS = ["formfactors.operations@gmail.com"];

/** Studio roles, as syncStudioAccess hands them out. Clients and vendors are not staff. */
export const STAFF_ROLES = new Set(["Super Admin", "Owner", "Admin", "Ops Director", "Designer", "Site Supervisor", "Viewer"]);

export interface Staff {
  uid: string;
  email: string;
  role: string;
  tenantId: string | null;
  platformOwner: boolean;
}

export async function requireStaff(request: any, allowed: Set<string> = STAFF_ROLES): Promise<Staff> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid as string;
  const email = String(request.auth.token?.email || "").trim().toLowerCase();
  if (request.auth.token?.email_verified === true && PLATFORM_OWNER_EMAILS.includes(email)) {
    return { uid, email, role: "Super Admin", tenantId: null, platformOwner: true };
  }
  const profile: any = (await admin.firestore().doc(`users/${uid}`).get()).data() || {};
  const role = String(profile.role || "");
  if (!profile.tenantId || !allowed.has(role)) {
    throw new HttpsError("permission-denied", "This account cannot use that.");
  }
  return { uid, email, role, tenantId: String(profile.tenantId), platformOwner: false };
}

/**
 * A ceiling per person and per instance: one leaked session cannot run up the
 * bill. In memory, so it resets when an instance is recycled; it is a brake,
 * not an accounting.
 */
export function rateLimiter(max: number, windowMs: number) {
  const calls = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (calls.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      calls.set(key, recent);
      return false;
    }
    recent.push(now);
    calls.set(key, recent);
    return true;
  };
}
