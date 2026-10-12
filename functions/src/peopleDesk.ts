import { onCall, HttpsError, type FunctionsErrorCode } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { requireStaff, rateLimiter } from "./guards";
import {
  DomainError, addDays, businessDate, execute, peopleOf, personByEmail, policyOf, scopeSnapshot, validateConfiguration,
  type Attendance, type Command, type Event, type Person, type Policy, type RequestRecord, type Snapshot, type Store,
} from "../../lib/peopleDesk";

/*
  PEOPLE, ON THE SERVER (lib/peopleDesk.ts has the rules).

  Attendance, leave requests and the journal of every change live under
  peopleDesk/{studio}, which no browser may read or write (firestore.rules):
  everything goes through these two functions.

    peopleSnapshot  what the signed-in person may see: their own records,
                    their reports' (managers), everyone's (Ops and admins),
                    and only availability for anyone else.
    peopleCommand   check in, check out, request leave or a correction,
                    decide, withdraw, cancel.

  The person is found by the verified email of their sign-in, on the studio's
  team (Studio settings → Team); what they may do follows their StudioDesk
  roles and the managers set in Studio settings → People. Each command runs
  in a transaction that also bumps the employee's ledger document, so two
  commands for one person are applied one after the other, and its journal
  entry makes a retried command return its first outcome.
*/

const db = () => admin.firestore();
const base = (tenantId: string) => `peopleDesk/${tenantId}`;
/** How much attendance a snapshot carries; leave requests reach back far enough for three financial years. */
const ATTENDANCE_DAYS = 120;
const REQUEST_DAYS = 800;
const underLimit = rateLimiter(240, 10 * 60 * 1000);

const STATUS: Record<number, FunctionsErrorCode> = {
  400: "invalid-argument", 401: "unauthenticated", 403: "permission-denied", 404: "not-found",
  409: "failed-precondition", 429: "resource-exhausted", 503: "failed-precondition",
};
export function fail(e: any): never {
  if (e instanceof HttpsError) throw e;
  if (e instanceof DomainError) throw new HttpsError(STATUS[e.status] || "invalid-argument", e.message, { code: e.code });
  logger.error("peopleDesk failed", { message: e?.message || String(e) });
  throw new HttpsError("internal", "People could not complete that. Try again; repeating it is safe.");
}

/* Firestore keeps no undefined values; a JSON round trip drops them. */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export interface Ctx { tenantId: string; people: Person[]; policy: Policy; me: Person }

export async function contextOf(request: any): Promise<Ctx> {
  const staff = await requireStaff(request);
  /* The platform owner belongs to no one studio: they name the one they are viewing (as zohoBooks does). */
  const asked = String(request.data?.tenantId || "");
  const tenantId = staff.tenantId || (staff.platformOwner && /^[A-Za-z0-9_-]{1,128}$/.test(asked) ? asked : null);
  if (!tenantId) throw new HttpsError("permission-denied", "Open People from your studio.");
  if (!underLimit(staff.uid)) throw new HttpsError("resource-exhausted", "Too many requests. Wait a minute and try again.");
  const org = (await db().doc(`organizations/${tenantId}`).get()).data() || {};
  const people = peopleOf(org);
  const policy = policyOf(org);
  validateConfiguration(people, policy);
  let me = personByEmail(people, staff.email);
  /* The platform owner looking in on a studio whose team does not list them: they see it as an admin. */
  if (!me && staff.platformOwner) {
    me = { id: "platform-owner", name: String(request.auth?.token?.name || "Platform owner").slice(0, 80), title: "Platform owner", teamId: "leadership", managerId: "", accessRole: "admin", active: true, email: staff.email, entitlements: {} };
    people.push(me);
  }
  if (!me || !me.active) {
    throw new HttpsError("permission-denied", "You are not on attendance yet. Ask an admin to add you in Studio settings → People.");
  }
  return { tenantId, people, policy, me };
}

async function snapshotFor(ctx: Ctx, now: string, month = ""): Promise<Snapshot> {
  const today = businessDate(now, ctx.policy.timezone);
  const from = addDays(today, -ATTENDANCE_DAYS);
  /* An older month asked for (the monthly report), on top of the recent four. */
  const older = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && `${month}-31` < from;
  const [attendance, requests, past] = await Promise.all([
    db().collection(`${base(ctx.tenantId)}/attendance`).where("date", ">=", from).get(),
    db().collection(`${base(ctx.tenantId)}/requests`).where("createdAt", ">=", new Date(Date.parse(now) - REQUEST_DAYS * 86400000).toISOString()).get(),
    older ? db().collection(`${base(ctx.tenantId)}/attendance`).where("date", ">=", `${month}-01`).where("date", "<=", `${month}-31`).get() : null,
  ]);
  const store: Store = {
    people: ctx.people, policy: ctx.policy,
    attendance: [...attendance.docs, ...(past?.docs || [])].map((d) => d.data() as Attendance),
    requests: requests.docs.map((d) => d.data() as RequestRecord),
    events: [],
  };
  return scopeSnapshot(store, ctx.me.id, now);
}

export const peopleSnapshot = onCall({ cors: true }, async (request) => {
  try {
    const ctx = await contextOf(request);
    return { ok: true, snapshot: await snapshotFor(ctx, new Date().toISOString(), String(request.data?.month || "")) };
  } catch (e) {
    return fail(e);
  }
});

const SAFE_ID = /^[A-Za-z0-9_-]{1,300}$/;

export const peopleCommand = onCall({ cors: true }, async (request) => {
  try {
    const ctx = await contextOf(request);
    const command = request.data?.command as Command;
    if (!command || typeof command !== "object" || typeof command.id !== "string" || typeof command.action !== "string") {
      throw new DomainError("INVALID", "Invalid request.");
    }
    if (JSON.stringify(command).length > 8000) throw new DomainError("INVALID", "Request is too large.");
    const now = new Date().toISOString();
    const root = base(ctx.tenantId);

    const outcome = await db().runTransaction(async (tx) => {
      const scoped = `${ctx.me.id.length}_${ctx.me.id}_${command.id}`;
      const evRef = db().doc(`${root}/journal/ev_${scoped}`);
      const prior = await tx.get(evRef);

      /* Whose records this changes: the actor's own, or the requester's for a decision. */
      let employeeId = ctx.me.id;
      let original: RequestRecord | null = null;
      if (["decide", "withdraw", "cancel"].includes(command.action)) {
        const rid = String((command.data as any)?.requestId || "");
        if (!SAFE_ID.test(rid)) throw new DomainError("NOT_FOUND", "Request not found.", 404);
        const r = await tx.get(db().doc(`${root}/requests/${rid}`));
        if (r.exists) {
          original = r.data() as RequestRecord;
          employeeId = original.employeeId;
        }
      }
      const ledgerRef = db().doc(`${root}/members/${employeeId}`);
      const ledger = await tx.get(ledgerRef);
      const [requests, recent] = await Promise.all([
        tx.get(db().collection(`${root}/requests`).where("employeeId", "==", employeeId)),
        tx.get(db().collection(`${root}/attendance`).where("employeeId", "==", employeeId).orderBy("date", "desc").limit(5)),
      ]);
      const attendance = recent.docs.map((d) => d.data() as Attendance);
      const sessionId = command.action === "correction" ? String((command.data as any)?.sessionId || "") : original?.correction?.sessionId || "";
      if (sessionId && SAFE_ID.test(sessionId) && !attendance.some((a) => a.id === sessionId)) {
        const s = await tx.get(db().doc(`${root}/attendance/${sessionId}`));
        if (s.exists) attendance.push(s.data() as Attendance);
      }

      const store: Store = {
        people: ctx.people, policy: ctx.policy, attendance,
        requests: requests.docs.map((d) => d.data() as RequestRecord),
        events: prior.exists ? [prior.data() as Event] : [],
      };
      const event = execute(store, ctx.me.id, command, now);
      if (prior.exists) return { replay: true };

      tx.set(evRef, plain(event));
      if (event.session) tx.set(db().doc(`${root}/attendance/${event.session.id}`), plain(event.session));
      if (event.request) tx.set(db().doc(`${root}/requests/${event.request.id}`), plain(event.request));
      tx.set(ledgerRef, { revision: Number(ledger.data()?.revision || 0) + 1, updatedAt: now }, { merge: true });
      return { replay: false };
    });

    return { ok: true, replay: outcome.replay, snapshot: await snapshotFor(ctx, now) };
  } catch (e) {
    return fail(e);
  }
});
