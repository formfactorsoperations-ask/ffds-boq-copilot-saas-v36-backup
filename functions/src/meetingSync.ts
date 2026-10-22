import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  deskPatchFromMinutes, deskPatchFromMirror, mirrorIdOf, mirrorWrite, requestIdOfMirror, DESK_PREFIX,
  designCopyIdOf, designCopyWrite, minutesMeetingFields,
} from "../../lib/meetingSync";
import type { VisitRequest } from "../../lib/clientCare";

/*
  KEEPING THE OPS DESK AND THE PROJECT'S MEETING LOG IN STEP (lib/meetingSync.ts
  has the rules): desk bookings both ways, and Design Desk reviews and minutes
  with no meeting added to the log. Each write only says what changed, so the two triggers that
  answer each other settle after one round.
*/

const db = () => admin.firestore();
const logPath = (tenantId: string, projectId: string) => `organizations/${tenantId}/projects/${projectId}/siteVisits`;
const withTimestamp = (data: Record<string, any>) => {
  const out = { ...data };
  if (typeof out.date === "number") out.date = Timestamp.fromMillis(out.date);
  if (typeof out.loggedAt === "number") out.loggedAt = Timestamp.fromMillis(out.loggedAt);
  return out;
};

/** Bring one desk booking's copy in the project's log up to date. */
export async function syncDeskBooking(projectId: string, requestId: string, request: VisitRequest | null, tenantId: string): Promise<"created" | "updated" | null> {
  if (!tenantId) return null;
  const ref = db().doc(`${logPath(tenantId, projectId)}/${mirrorIdOf(requestId)}`);
  const snap = await ref.get();
  const write = mirrorWrite(request ? { ...request, id: requestId } : null, snap.exists ? (snap.data() as any) : null, Date.now());
  if (!write) return null;
  if (write.kind === "create") await ref.create(withTimestamp(write.data)).catch((e: any) => { if (e?.code !== 6 /* ALREADY_EXISTS */) throw e; });
  else await ref.update(withTimestamp(write.data));
  return write.kind === "create" ? "created" : "updated";
}

/** A booking made or moved on the Ops Desk: its copy in the project's log follows. */
export const onVisitRequestWritten = onDocumentWritten("projects/{projectId}/visitRequests/{requestId}", async (event) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as any) : null;
  const after = event.data?.after?.exists ? (event.data.after.data() as any) : null;
  const tenantId = String(after?.tenantId || before?.tenantId || "");
  try {
    await syncDeskBooking(String(event.params.projectId), String(event.params.requestId), after, tenantId);
  } catch (e: any) {
    logger.error("[meetingSync] copy to the project's log failed", { projectId: event.params.projectId, requestId: event.params.requestId, error: String(e?.message || e) });
  }
});

/** A desk booking's copy changed on the project (deleted, cancelled, sent to the calendar): the booking follows. */
export const onDeskMeetingWritten = onDocumentWritten("organizations/{tenantId}/projects/{projectId}/siteVisits/{visitId}", async (event) => {
  const before = event.data?.before?.exists ? { id: event.params.visitId, ...(event.data.before.data() as any) } : null;
  const after = event.data?.after?.exists ? { id: event.params.visitId, ...(event.data.after.data() as any) } : null;
  const requestId = requestIdOfMirror(after || before);
  if (!requestId) return;
  const ref = db().doc(`projects/${event.params.projectId}/visitRequests/${requestId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const patch = deskPatchFromMirror({ id: requestId, ...(snap.data() as any) }, after, Date.now());
  if (patch) await ref.update(patch);
});

/** Add the meeting minutes were written for to the project's log, when nobody logged it. Once. */
export async function logMinutesMeeting(tenantId: string, projectId: string, momId: string, mom: any): Promise<boolean> {
  const fields = minutesMeetingFields(mom, Date.now());
  if (!fields) return false;
  const ref = db().doc(`${logPath(tenantId, projectId)}/${String(mom.meetingId)}`);
  const made = await ref.create(withTimestamp(fields)).then(() => true).catch((e: any) => { if (e?.code === 6 /* ALREADY_EXISTS */) return false; throw e; });
  await db().doc(`organizations/${tenantId}/projects/${projectId}/moms/${momId}`).update({ meetingLogged: true });
  return made;
}

/**
 * Minutes written: for a desk booking's meeting the booking is done, and for a
 * meeting nobody logged, the meeting goes in the project's log.
 */
export const onMinutesWritten = onDocumentWritten("organizations/{tenantId}/projects/{projectId}/moms/{momId}", async (event) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as any) : null;
  const after = event.data?.after?.exists ? (event.data.after.data() as any) : null;
  const meetingId = String(after?.meetingId || "");
  if (!after || !meetingId || String(before?.meetingId || "") === meetingId) return;
  const { tenantId, projectId, momId } = event.params;
  try {
    if (meetingId.startsWith(DESK_PREFIX)) {
      const ref = db().doc(`projects/${projectId}/visitRequests/${meetingId.slice(DESK_PREFIX.length)}`);
      const snap = await ref.get();
      const patch = snap.exists ? deskPatchFromMinutes({ id: snap.id, ...(snap.data() as any) }, after, Date.now()) : null;
      if (patch) await ref.update(patch);
      return;
    }
    await logMinutesMeeting(String(tenantId), String(projectId), String(momId), after);
  } catch (e: any) {
    logger.error("[meetingSync] minutes not tied to a meeting", { projectId, momId, error: String(e?.message || e) });
  }
});

/** Bring a Design Desk review's copy in the project's log up to date. */
export async function syncDesignMeeting(tenantId: string, projectId: string, meeting: any): Promise<boolean> {
  const ref = db().doc(`${logPath(tenantId, projectId)}/${designCopyIdOf(String(meeting.id))}`);
  const snap = await ref.get();
  const write = designCopyWrite(meeting, snap.exists ? (snap.data() as any) : null, Date.now());
  if (!write) return false;
  if (write.kind === "create") {
    await ref.create(withTimestamp(write.data)).catch((e: any) => { if (e?.code !== 6) throw e; });
    await db().doc(`organizations/${tenantId}/projects/${projectId}/designMeetings/${meeting.id}`).update({ meetingLogged: true });
  } else {
    await ref.update(withTimestamp(write.data));
  }
  return true;
}

/** A design review started, closed or cancelled on the Design Desk: the project's log follows. */
export const onDesignMeetingWritten = onDocumentWritten("organizations/{tenantId}/projects/{projectId}/designMeetings/{meetingId}", async (event) => {
  const after = event.data?.after?.exists ? (event.data.after.data() as any) : null;
  if (!after) return;
  try {
    await syncDesignMeeting(String(event.params.tenantId), String(event.params.projectId), { id: event.params.meetingId, ...after });
  } catch (e: any) {
    logger.error("[meetingSync] design review not logged", { projectId: event.params.projectId, meetingId: event.params.meetingId, error: String(e?.message || e) });
  }
});

/**
 * Every meeting of a studio checked against the project's log: desk bookings,
 * Design Desk reviews, and minutes with no meeting, for those made before this
 * ran and any change a trigger missed. Part of the Ops Desk's daily check
 * (functions/src/opsDesk.ts).
 */
export async function syncStudioMeetings(tenantId: string): Promise<number> {
  const projects = await db().collection("projects").where("tenantId", "==", tenantId).select().get();
  let changed = 0;
  const each = async (what: string, projectId: string, id: string, fn: () => Promise<unknown>) => {
    try { if (await fn()) changed++; } catch (e: any) { logger.error(`[meetingSync] sweep failed for ${what}`, { projectId, id, error: String(e?.message || e) }); }
  };
  for (const p of projects.docs) {
    const base = `organizations/${tenantId}/projects/${p.id}`;
    const [requests, designs, moms] = await Promise.all([
      db().collection(`projects/${p.id}/visitRequests`).get(),
      db().collection(`${base}/designMeetings`).get(),
      db().collection(`${base}/moms`).get(),
    ]);
    for (const r of requests.docs) await each("a booking", p.id, r.id, () => syncDeskBooking(p.id, r.id, r.data() as VisitRequest, tenantId));
    for (const m of designs.docs) await each("a design review", p.id, m.id, () => syncDesignMeeting(tenantId, p.id, { id: m.id, ...m.data() }));
    for (const m of moms.docs) await each("minutes", p.id, m.id, () => logMinutesMeeting(tenantId, p.id, m.id, m.data()));
  }
  return changed;
}
