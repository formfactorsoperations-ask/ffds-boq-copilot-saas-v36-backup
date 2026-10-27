import { onCall, HttpsError, type FunctionsErrorCode } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { requireStaff, rateLimiter } from "./guards";
import { notify } from "./notify";
import { peopleDrafts } from "../../lib/notify";
import {
  DomainError, addDays, businessDate, canReview, execute, isLate, peopleOf, personByEmail, policyOf, scopeSnapshot, validateConfiguration,
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

  Speed (the People page has to feel instant):
  - Both callables and the notification trigger run in asia-south1, beside the
    database. In us-central1 every read crossed the Pacific and back.
  - A snapshot reads only what the person may see: their own attendance and
    their reports' for a manager, the whole studio only for Ops and admins.
    Everyone's leave is read only for the calendar window.
  - A refresh names the version it already has; when nothing has changed the
    answer is "unchanged" rather than the whole snapshot again.
  - A command answers with what it changed and leaves notifications to
    peopleOutbox, so a check-in does not wait for them.
*/

/** Where the People functions run: beside the database (Firestore is in asia-south1). */
export const PEOPLE_REGION = "asia-south1";

const db = () => admin.firestore();
const base = (tenantId: string) => `peopleDesk/${tenantId}`;
/** How much attendance a snapshot carries; leave requests reach back far enough for three financial years. */
const ATTENDANCE_DAYS = 120;
const REQUEST_DAYS = 800;
const underLimit = rateLimiter(240, 10 * 60 * 1000);
/* `in` queries take up to 30 values. */
const IN_MAX = 30;

/*
  The studio record, kept for a minute per running instance: every call needs
  the team and the policy, and they change rarely. A change in Studio settings
  reaches People within a minute.
*/
const ORG_TTL = 60 * 1000;
const orgCache = new Map<string, { at: number; org: any }>();
async function orgOf(tenantId: string, fresh = false): Promise<any> {
  const hit = orgCache.get(tenantId);
  if (!fresh && hit && Date.now() - hit.at < ORG_TTL) return hit.org;
  const org = (await db().doc(`organizations/${tenantId}`).get()).data() || {};
  orgCache.set(tenantId, { at: Date.now(), org });
  return org;
}

/** Bump the studio's People revision: any write a snapshot would show. Works in a transaction or a batch. */
export function bumpRevision(w: { set: (ref: any, data: any, opts: any) => any }, tenantId: string, now: string) {
  w.set(db().doc(`${base(tenantId)}/meta/state`), { revision: FieldValue.increment(1), updatedAt: now }, { merge: true });
}

/* A short fingerprint of the team and policy, so a change in Studio settings counts as a new version. */
function fingerprint(v: unknown): string {
  const str = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

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

export interface Ctx { tenantId: string; people: Person[]; policy: Policy; me: Person; print?: string }

export async function contextOf(request: any): Promise<Ctx> {
  /* The platform owner belongs to no one studio: they name the one they are viewing (as zohoBooks does). */
  const asked = String(request.data?.tenantId || "");
  /* Every browser names its studio, so its record is read alongside the profile rather than after it. */
  const early = /^[A-Za-z0-9_-]{1,128}$/.test(asked) ? orgOf(asked).catch(() => null) : null;
  const staff = await requireStaff(request);
  const tenantId = staff.tenantId || (staff.platformOwner && /^[A-Za-z0-9_-]{1,128}$/.test(asked) ? asked : null);
  if (!tenantId) throw new HttpsError("permission-denied", "Open People from your studio.");
  if (!underLimit(staff.uid)) throw new HttpsError("resource-exhausted", "Too many requests. Wait a minute and try again.");
  /* Started with the profile read (the browser names its studio); used only when it is the studio the profile says. */
  let org = asked === tenantId && early ? await early : await orgOf(tenantId);
  /* Someone just added to the team is not turned away by a copy from before they were. */
  if (!personByEmail(peopleOf(org), staff.email)?.active) org = await orgOf(tenantId, true);
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
  return { tenantId, people, policy, me, print: fingerprint({ people, policy }) };
}

/** The version a snapshot is of: the studio's People revision, the team and policy, and the day. */
async function versionOf(ctx: Ctx, today: string): Promise<string> {
  const meta = (await db().doc(`${base(ctx.tenantId)}/meta/state`).get()).data();
  return `${Number(meta?.revision || 0)}.${ctx.print || ""}.${today}`;
}

/* Run one query per batch of IDs (`in` takes up to 30) and put the results together. */
async function byEmployees(ids: string[], q: (chunk: string[]) => FirebaseFirestore.Query) {
  const parts = [];
  for (let i = 0; i < ids.length; i += IN_MAX) parts.push(q(ids.slice(i, i + IN_MAX)).get());
  return (await Promise.all(parts)).flatMap((r) => r.docs);
}

/**
 * What the signed-in person may see, or null when it is still the version
 * they named (`since`).
 */
async function snapshotFor(ctx: Ctx, now: string, month = "", since = ""): Promise<Snapshot | null> {
  const today = businessDate(now, ctx.policy.timezone);
  /* Asked "anything new?": answer that first. Otherwise read the version alongside the data. */
  const versionRead = versionOf(ctx, today);
  if (since && !month && since === (await versionRead)) return null;
  const from = addDays(today, -ATTENDANCE_DAYS);
  const requestsFrom = new Date(Date.parse(now) - REQUEST_DAYS * 86400000).toISOString();
  /* An older month asked for (the monthly report), on top of the recent four. */
  const older = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && `${month}-31` < from;
  const root = base(ctx.tenantId);
  /* The same people scopeSnapshot lets them see. Ops and admins see everyone, so they read the studio. */
  const seen = ctx.people.filter((p) => p.id === ctx.me.id || canReview(ctx.me, p)).map((p) => p.id);
  const everyone = ctx.people.every((p) => seen.includes(p.id));

  const studioWide = async () => {
    const [attendance, requests, past] = await Promise.all([
      db().collection(`${root}/attendance`).where("date", ">=", from).get(),
      db().collection(`${root}/requests`).where("createdAt", ">=", requestsFrom).get(),
      older ? db().collection(`${root}/attendance`).where("date", ">=", `${month}-01`).where("date", "<=", `${month}-31`).get() : null,
    ]);
    return { attendance: [...attendance.docs, ...(past?.docs || [])], requests: requests.docs };
  };
  const scoped = async () => {
    const att = db().collection(`${root}/attendance`), req = db().collection(`${root}/requests`);
    const [attendance, mine, around, past] = await Promise.all([
      byEmployees(seen, (c) => att.where("employeeId", "in", c).where("date", ">=", from)),
      byEmployees(seen, (c) => req.where("employeeId", "in", c).where("createdAt", ">=", requestsFrom)),
      /* Everyone else's leave, for the calendar and who is away: only what reaches into the window. */
      req.where("end", ">=", from).get().then((r) => r.docs),
      older ? byEmployees(seen, (c) => att.where("employeeId", "in", c).where("date", ">=", `${month}-01`).where("date", "<=", `${month}-31`)) : [],
    ]);
    const byId = new Map([...around, ...mine].map((d) => [d.id, d]));
    return { attendance: [...attendance, ...past], requests: [...byId.values()] };
  };

  let docs: { attendance: FirebaseFirestore.QueryDocumentSnapshot[]; requests: FirebaseFirestore.QueryDocumentSnapshot[] };
  if (everyone) docs = await studioWide();
  else {
    try {
      docs = await scoped();
    } catch (e: any) {
      /* An index still building (code 9) must not leave People empty: read the studio as before. */
      if (Number(e?.code) !== 9) throw e;
      logger.warn("peopleDesk: scoped read needs an index; reading the studio", { message: e?.message });
      docs = await studioWide();
    }
  }
  const store: Store = {
    people: ctx.people, policy: ctx.policy,
    attendance: docs.attendance.map((d) => d.data() as Attendance),
    requests: docs.requests.map((d) => d.data() as RequestRecord),
    events: [],
  };
  return { ...scopeSnapshot(store, ctx.me.id, now), version: await versionRead };
}

export const peopleSnapshot = onCall({ cors: true, region: PEOPLE_REGION }, async (request) => {
  try {
    const ctx = await contextOf(request);
    const now = new Date().toISOString();
    const snapshot = await snapshotFor(ctx, now, String(request.data?.month || ""), String(request.data?.since || ""));
    /* The studio it answered for: the browser keeps a snapshot when its own idea of the studio catches up. */
    return snapshot ? { ok: true, snapshot, tenantId: ctx.tenantId } : { ok: true, unchanged: true, serverTime: now, tenantId: ctx.tenantId };
  } catch (e) {
    return fail(e);
  }
});

const SAFE_ID = /^[A-Za-z0-9_-]{1,300}$/;

export const peopleCommand = onCall({ cors: true, region: PEOPLE_REGION }, async (request) => {
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
      if (prior.exists) return { replay: true, event: null as Event | null };

      tx.set(evRef, plain(event));
      if (event.session) tx.set(db().doc(`${root}/attendance/${event.session.id}`), plain(event.session));
      if (event.request) tx.set(db().doc(`${root}/requests/${event.request.id}`), plain(event.request));
      tx.set(ledgerRef, { revision: Number(ledger.data()?.revision || 0) + 1, updatedAt: now }, { merge: true });
      bumpRevision(tx, ctx.tenantId, now);
      /* Their lead hears from peopleOutbox, a moment later, so the person is not kept waiting (lib/notify). */
      tx.set(db().doc(`${root}/outbox/ev_${scoped}`), plain({
        action: command.action, session: event.session || null, request: event.request || null, actor: ctx.me, at: now,
      }));
      return { replay: false, event };
    });

    /* A browser that can merge the change gets only the change; anything else gets the snapshot, as before. */
    if (request.data?.delta === true) {
      const ev = outcome.event;
      return { ok: true, replay: outcome.replay, serverTime: now, change: ev ? { session: ev.session || null, request: ev.request || null } : null };
    }
    return { ok: true, replay: outcome.replay, snapshot: await snapshotFor(ctx, now) };
  } catch (e) {
    return fail(e);
  }
});

/*
  A check-in or check-out, a request to decide, or the decision: the people it
  concerns hear of it (lib/notify). Written by peopleCommand in the same
  transaction as the change, sent here so the command answers at once.
  A retried command writes no second entry, so it is told once.
*/
export const peopleOutbox = onDocumentCreated({ document: "peopleDesk/{tenantId}/outbox/{id}", region: PEOPLE_REGION }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const o: any = snap.data() || {};
  const tenantId = String(event.params.tenantId);
  try {
    const org = await orgOf(tenantId);
    const people = peopleOf(org);
    /* The platform owner acts without being on the team. */
    if (o.actor?.id && !people.some((p) => p.id === o.actor.id)) people.push(o.actor);
    const policy = policyOf(org);
    const actor: Person = o.actor;
    const session: Attendance | undefined = o.session || undefined;
    const request: RequestRecord | undefined = o.request || undefined;
    const employee = people.find((p) => p.id === (request?.employeeId || session?.employeeId)) || actor;
    const late = o.action === "checkin" && !!session && isLate(session, policy);
    await notify({ tenantId, actorEmail: actor?.email || null, org },
      peopleDrafts({ action: String(o.action), session, request }, { actor, employee, people, timezone: policy.timezone, late }));
  } catch (e: any) {
    logger.error("peopleOutbox failed", { tenantId, message: e?.message || String(e) });
  }
  await snap.ref.delete().catch(() => undefined);
});
