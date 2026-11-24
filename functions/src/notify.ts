import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireStaff } from "./guards";
import { cleanEmails } from "./designViewStrip";
import { supervisorEmails } from "./teamView";
import { cleanPrefs, clientBox, inboxKey, interrupts, refs, resolveAudience, staffBox, stamp, type Draft, type Note } from "../../lib/notify";

/*
  WRITING NOTES (lib/notify.ts decides what they say and who they are for).

  Called by the server calls that save a change -- a client's portal action,
  a People command, a site action, a Design Desk review, an escalation, a
  website enquiry -- straight after the change is saved, so a note reaches the
  open StudioDesk of everyone it is for in about the time it took to save.

  Best effort. A note that fails to write is logged and dropped: the change it
  describes has already happened, and refusing the client's signature because
  the Ops Director's inbox could not be written would be the wrong way round.

  Notes live at inbox/{email}/notes/{id}, keyed by the lowercased address the
  studio's team list holds, which is also how a person is admitted to the
  studio (access.ts). Only the Admin SDK writes them; a person may read their
  own and mark them read, done or snoozed (firestore.rules). A client's live
  at portalInbox/{uid}/notes (portalNotify.ts).

  A "needs you" note also goes to the person's phone, on each device they
  turned phone notifications on for ({box}/devices), unless their own settings
  or quiet hours, in their own time zone, say not ({box}.prefs, .tz). The
  message carries data only -- the note's id, title and line -- and the
  service worker shows it (sw/firebase-messaging-sw.ts). A token the browser
  has dropped is deleted the first time a send to it fails.

  A note that says what it is about (Note.ref: a leave request, an escalation)
  is also listed at noteRefs/{studio}/refs/{ref}, so that when that thing is
  dealt with, `settle` can mark the note done in every inbox it went to: the
  approver who did not decide it stops being asked. Only the Admin SDK reads or
  writes that list (firestore.rules denies what it does not name).
*/

const db = () => admin.firestore();
/** No one person gets more than this from one change, and no change writes to more than this many people. */
const MAX_RECIPIENTS = 40;

export interface Where {
  tenantId: string;
  /** The project the change is on, for the project's seats (Client Relations, Designers, Supervisors). */
  projectId?: string | null;
  /** Who made the change; they are never told. */
  actorEmail?: string | null;
  /** The studio record, when the caller already has it. */
  org?: any;
  /** The project as stored, when the caller already has it (for its named Supervisors). */
  project?: any;
}

async function audienceContext(w: Where) {
  const org = w.org || (await db().doc(`organizations/${w.tenantId}`).get()).data() || {};
  const team: any[] = Array.isArray(org.team) ? org.team : [];
  const assigned = w.projectId ? cleanEmails(org?.projectDesigners?.[w.projectId]) : [];
  const site = w.projectId && w.project ? supervisorEmails(w.project, team) : [];
  return { team, assigned, site };
}

/** One note for one person: where it goes, and what it says. */
export interface Delivery { box: string; note: Note & { tenantId: string } }

/** No more than this many phone notifications to one person from one change; the bell has the rest. */
const MAX_PUSHES = 3;
const DEAD_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Send a person their "needs you" notes as phone notifications, within their settings. Never throws. */
async function push(box: string, notes: { id: string; note: Note }[]): Promise<void> {
  const needs = notes.filter((x) => x.note.level === "needs");
  if (!needs.length) return;
  try {
    const [settings, devices] = await Promise.all([db().doc(box).get(), db().collection(`${box}/devices`).get()]);
    if (devices.empty) return;
    const data = settings.data() || {};
    const prefs = cleanPrefs(data.prefs), when = new Date();
    const send = needs.filter((x) => interrupts(x.note, prefs, when, "phone", typeof data.tz === "string" ? data.tz : null)).slice(-MAX_PUSHES);
    if (!send.length) return;
    const targets = devices.docs.map((d) => ({ ref: d.ref, token: String(d.data()?.token || "") })).filter((t) => t.token);
    if (!targets.length) return;
    const dead = new Set<number>();
    for (const x of send) {
      const res = await admin.messaging().sendEachForMulticast({
        tokens: targets.map((t) => t.token),
        data: {
          noteId: x.id,
          title: clip(x.note.title || "StudioDesk", 120),
          body: clip([x.note.line, x.note.projectName].filter(Boolean).join(" · "), 240),
        },
        webpush: { headers: { Urgency: "high", TTL: String(24 * 60 * 60) } },
      });
      res.responses.forEach((r, i) => { if (!r.success && DEAD_TOKEN.has(String(r.error?.code || ""))) dead.add(i); });
    }
    await Promise.all([...dead].map((i) => targets[i].ref.delete().catch(() => {})));
  } catch (e: any) {
    logger.warn("[notify] could not send phone notifications", { box: box.split("/")[0], message: e?.message });
  }
}

/** Where the notes about one thing are listed, for `settle`. */
const refDoc = (tenantId: string, ref: string) =>
  db().doc(`noteRefs/${tenantId}/refs/${ref.replace(/[^A-Za-z0-9:_-]/g, "_").slice(0, 300)}`);

/**
 * The thing these notes were about is dealt with: mark them done wherever they
 * went, so nobody is still asked. `onlyEmail` settles one person's copy and
 * leaves the rest (a birthday card is signed by each person for themselves).
 * Never throws.
 */
export async function settle(tenantId: string, list: (string | null | undefined)[], onlyEmail?: string | null): Promise<number> {
  const wanted = [...new Set(list.filter(Boolean) as string[])];
  if (!tenantId || !wanted.length) return 0;
  const only = onlyEmail ? `${staffBox(inboxKey(onlyEmail))}/` : null;
  if (onlyEmail && !only) return 0;
  let n = 0;
  for (const ref of wanted) {
    try {
      const reg = refDoc(tenantId, ref);
      const all: string[] = ((await reg.get()).data()?.paths || []).filter((x: any) => typeof x === "string");
      const paths = only ? all.filter((x) => x.startsWith(only)) : all;
      if (!paths.length) continue;
      const now = Date.now();
      for (let i = 0; i < paths.length; i += 400) {
        const batch = db().batch();
        /* Merged, so a note that is somehow gone is not a failure for the rest. */
        paths.slice(i, i + 400).forEach((x) => batch.set(db().doc(x), { doneAt: now, settledAt: now }, { merge: true }));
        await batch.commit();
      }
      if (paths.length === all.length) await reg.delete();
      else await reg.update({ paths: admin.firestore.FieldValue.arrayRemove(...paths) });
      n += paths.length;
    } catch (e: any) {
      logger.warn("[notify] could not settle notes", { ref: ref.split(":")[0], message: e?.message });
    }
  }
  return n;
}

/** Write notes, then send the phone notifications they call for. Never throws. */
export async function deliver(list: Delivery[]): Promise<number> {
  if (!list.length) return 0;
  try {
    const batch = db().batch();
    const byBox = new Map<string, { id: string; note: Note }[]>();
    const byRef = new Map<string, { tenantId: string; ref: string; paths: string[] }>();
    for (const d of list) {
      const ref = db().doc(d.box).collection("notes").doc();
      batch.set(ref, d.note);
      byBox.set(d.box, [...(byBox.get(d.box) || []), { id: ref.id, note: d.note }]);
      if (d.note.ref && d.note.tenantId) {
        const key = `${d.note.tenantId}|${d.note.ref}`;
        const g = byRef.get(key) || { tenantId: d.note.tenantId, ref: d.note.ref, paths: [] };
        g.paths.push(ref.path);
        byRef.set(key, g);
      }
    }
    for (const g of byRef.values()) {
      batch.set(refDoc(g.tenantId, g.ref), { paths: admin.firestore.FieldValue.arrayUnion(...g.paths), at: Date.now() }, { merge: true });
    }
    await batch.commit();
    await Promise.all([...byBox.entries()].map(([box, notes]) => push(box, notes)));
    return list.length;
  } catch (e: any) {
    logger.error("[notify] could not write notes", { kinds: [...new Set(list.map((d) => d.note.kind))], message: e?.message });
    return 0;
  }
}

/** Write each draft into the inbox of everyone it resolves to. Never throws. */
export async function notify(w: Where, drafts: (Draft | null | undefined)[]): Promise<number> {
  const list = drafts.filter(Boolean) as Draft[];
  if (!list.length || !w.tenantId) return 0;
  try {
    const ctx = await audienceContext(w);
    const at = Date.now();
    const out: Delivery[] = [];
    for (const d of list) {
      const to = resolveAudience(d.to, { ...ctx, actorEmail: w.actorEmail }).slice(0, MAX_RECIPIENTS);
      const note = { ...stamp(d, at), tenantId: w.tenantId };
      for (const email of to) {
        const box = staffBox(email);
        if (box) out.push({ box, note });
      }
    }
    return await deliver(out);
  } catch (e: any) {
    logger.error("[notify] could not write notes", { tenantId: w.tenantId, kinds: list.map((d) => d.kind), message: e?.message });
    return 0;
  }
}

/** The same, to a project's clients in their portal (portalNotify.ts). */
export async function notifyClients(tenantId: string, uids: string[], drafts: Draft[]): Promise<number> {
  if (!drafts.length || !uids.length) return 0;
  const at = Date.now();
  const out: Delivery[] = [];
  for (const d of drafts) {
    const note = { ...stamp(d, at), tenantId };
    for (const uid of uids.slice(0, MAX_RECIPIENTS)) {
      const box = clientBox(uid);
      if (box) out.push({ box, note });
    }
  }
  return deliver(out);
}

/*
  Some things are dealt with in the browser, with no server call of their own
  to settle from: the studio marking a client's messages dealt with, or
  answering a question about a finish (both are saved with the project). The
  screen says so here. Any member of the studio may, for a project of their
  own studio; all it can do is mark those notes done, and a note marked done
  can be brought back from the bell's Done list.
*/
export const settleNotes = onCall({ cors: true }, async (request) => {
  const staff = await requireStaff(request);
  const projectId = String(request.data?.projectId || "");
  const what = String(request.data?.what || "");
  const id = String(request.data?.id || "");
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(projectId) || (id && !/^[A-Za-z0-9_.:-]{1,120}$/.test(id))) throw new HttpsError("invalid-argument", "Which project?");
  const [project] = await db().getAll(db().doc(`projects/${projectId}`), { fieldMask: ["tenantId"] });
  const tenantId = String(project.data()?.tenantId || "");
  if (!tenantId || (!staff.platformOwner && tenantId !== staff.tenantId)) throw new HttpsError("permission-denied", "That project is not in your studio.");
  const ref = what === "messages" ? refs.messages(projectId) : what === "finish" && id ? refs.finish(projectId, id) : null;
  if (!ref) throw new HttpsError("invalid-argument", "Nothing to settle.");
  return { ok: true, settled: await settle(tenantId, [ref]) };
});
