import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { deskPatchFromMinutes, deskPatchFromMirror, mirrorIdOf, mirrorWrite, requestIdOfMirror, DESK_PREFIX } from "../../lib/meetingSync";
import type { VisitRequest } from "../../lib/clientCare";

/*
  KEEPING THE OPS DESK AND THE PROJECT'S MEETING LOG IN STEP (lib/meetingSync.ts
  has the rules). Each write only says what changed, so the two triggers that
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

/** Minutes written for a desk booking's meeting: the booking is done. */
export const onDeskMinutesWritten = onDocumentWritten("organizations/{tenantId}/projects/{projectId}/moms/{momId}", async (event) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as any) : null;
  const after = event.data?.after?.exists ? (event.data.after.data() as any) : null;
  const meetingId = String(after?.meetingId || "");
  if (!after || !meetingId.startsWith(DESK_PREFIX) || String(before?.meetingId || "") === meetingId) return;
  const ref = db().doc(`projects/${event.params.projectId}/visitRequests/${meetingId.slice(DESK_PREFIX.length)}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const patch = deskPatchFromMinutes({ id: snap.id, ...(snap.data() as any) }, after, Date.now());
  if (patch) await ref.update(patch);
});

/**
 * Every desk booking of a studio checked against the project's log: for the
 * bookings made before this ran, and any change a trigger missed. Part of the
 * Ops Desk's daily check (functions/src/opsDesk.ts).
 */
export async function syncStudioMeetings(tenantId: string): Promise<number> {
  const projects = await db().collection("projects").where("tenantId", "==", tenantId).select().get();
  let changed = 0;
  for (const p of projects.docs) {
    const requests = await db().collection(`projects/${p.id}/visitRequests`).get();
    for (const r of requests.docs) {
      try {
        if (await syncDeskBooking(p.id, r.id, r.data() as VisitRequest, tenantId)) changed++;
      } catch (e: any) {
        logger.error("[meetingSync] sweep failed for a booking", { projectId: p.id, requestId: r.id, error: String(e?.message || e) });
      }
    }
  }
  return changed;
}
