/*
  Who is calling the server's /api routes.

  Every route on server.ts used to answer anyone on the internet, with CORS
  open to every origin: /api/send-email took the caller's own recipient, subject
  and body and sent them through the studio's Resend account, and the AI routes
  spent the studio's Gemini quota for whoever asked. Nothing checked that the
  caller had ever signed in.

  Now the browser sends its Firebase ID token and this checks it with Firebase
  itself, then reads the caller's own users/{uid} profile using that same token,
  so Firestore's rules decide what it may see exactly as they do in the app. An
  account with no profile role -- a stranger who signed in with Google, say --
  has nothing to call these routes for and is refused.

  Deliberately no admin credentials: the server never holds more authority than
  the person calling it. The web API key used for the lookup is the public one
  the browser bundle already carries.
*/

import type { Request, Response, NextFunction } from "express";
import { firebaseConfig } from "../services/firebaseConfig";

export interface Account {
  uid: string;
  email?: string;
  role: string;
  tenantId?: string;
}

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { account: Account; until: number }>();

async function lookUp(idToken: string): Promise<Account | null> {
  const hit = cache.get(idToken);
  if (hit && hit.until > Date.now()) return hit.account;

  const verify = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) },
  );
  if (!verify.ok) return null;
  const user = (await verify.json())?.users?.[0];
  if (!user?.localId) return null;

  const profile = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${encodeURIComponent(user.localId)}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!profile.ok) return null;
  const fields = (await profile.json())?.fields || {};
  const role = fields.role?.stringValue;
  if (!role) return null;

  const account: Account = {
    uid: user.localId,
    email: user.email,
    role,
    tenantId: fields.tenantId?.stringValue,
  };
  if (cache.size > 2000) cache.clear();
  cache.set(idToken, { account, until: Date.now() + CACHE_MS });
  return account;
}

/*
  A ceiling per person, not a quota anybody should reach in normal work: it is
  there so one leaked session cannot run up the email or AI bill overnight.
*/
const WINDOW_MS = 10 * 60 * 1000;
const calls = new Map<string, number[]>();

function underLimit(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (calls.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    calls.set(key, recent);
    return false;
  }
  recent.push(now);
  calls.set(key, recent);
  return true;
}

/**
 * Express middleware: refuse any caller who is not a signed-in account with a
 * profile, and anyone over their share of calls in the last ten minutes.
 */
export function requireAccount(maxPerWindow: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = String(req.headers.authorization || "");
    const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!idToken) {
      return res.status(401).json({ error: { message: "Sign in to continue." } });
    }
    let account: Account | null = null;
    try {
      account = await lookUp(idToken);
    } catch (e) {
      console.warn("requireAccount: lookup failed", (e as Error)?.message);
    }
    if (!account) {
      return res.status(401).json({ error: { message: "Your session has ended. Sign in again." } });
    }
    if (!underLimit(`${account.uid}:${req.path}`, maxPerWindow)) {
      return res.status(429).json({ error: { message: "Too many requests. Try again in a few minutes." } });
    }
    (req as any).account = account;
    next();
  };
}
