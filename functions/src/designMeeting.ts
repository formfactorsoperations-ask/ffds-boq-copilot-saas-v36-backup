import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { resolveActor, person, type Actor } from "./drawingReview";
import {
  canRunMeeting, canSetAudience, cleanText, storeShape, safeId,
  type ReviewSummary, type ReviewMark, type ReviewEvent,
} from "../../lib/drawingReview";
import {
  presentableRooms, clientRoundsByRoom, includedRoundsFrom, isOverIncluded, cleanChanges, cleanFee,
  type DesignMeeting, type MeetingRoom, type MeetingSheet, type RoomCharge, type ChargeStatus, type RoomDrawing,
} from "../../lib/designMeeting";

/*
  DESIGN MEETINGS, ON THE SERVER.

  The Design Head (or the studio's Owner or an Admin) presents approved rooms
  to the client and records, room by room, whether the client agreed or asked
  for changes. Only this function writes a meeting, and only it turns the
  client's changes into notes on the sheets, so what the client was shown and
  what they asked for cannot be edited afterwards from a browser.

  Closing a meeting:
    - checks every sheet is still on the version that was shown;
    - pins the client's changes on those sheets as notes for the Design Head,
      who sends them on to the designer (drawingReview: clientReturn) or keeps
      the sheet approved (clientKeep);
    - counts a revision round for each room with changes, and records a
      chargeable round past the studio's included rounds as to bill or waived.
*/

const db = () => admin.firestore();
const projectPath = (orgId: string, projectId: string) => `organizations/${orgId}/projects/${projectId}`;
type Input = Record<string, any>;

function meetingRef(orgId: string, projectId: string, meetingId: unknown) {
  if (!safeId(meetingId)) throw new HttpsError("invalid-argument", "Which meeting?");
  return db().doc(`${projectPath(orgId, projectId)}/designMeetings/${meetingId}`);
}

function mustRun(actor: Actor) {
  if (!canRunMeeting(actor.role)) throw new HttpsError("permission-denied", "Only the Design Head, the Owner or an Admin runs a design meeting.");
}

async function start(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustRun(actor);
  const wanted: string[] = Array.isArray(input.rooms) ? [...new Set(input.rooms.map((r: unknown) => String(r)).filter(Boolean))].slice(0, 30) as string[] : [];
  if (!wanted.length) throw new HttpsError("invalid-argument", "Pick at least one room to present.");
  const base = projectPath(orgId, projectId);
  const open = await db().collection(`${base}/designMeetings`).where("state", "==", "OPEN").limit(1).get();
  if (!open.empty) throw new HttpsError("failed-precondition", "A meeting is already open for this project. Finish or cancel it first.", { meetingId: open.docs[0].id });

  const tracker = await db().collection(`${base}/drawingTracker`).get();
  const drawings: RoomDrawing[] = tracker.docs.map((d) => ({ id: d.id, name: String(d.data().name || "Drawing"), roomName: d.data().roomName || null, review: d.data().review || null }));
  const rooms = presentableRooms(drawings);
  const chosen: MeetingRoom[] = wanted.map((name) => {
    const r = rooms.find((x) => x.room === name);
    if (!r) throw new HttpsError("failed-precondition", `${name} has no drawings for the client.`);
    if (!r.ready) throw new HttpsError("failed-precondition", `${name} is not ready: ${r.why}.`);
    const sheets: MeetingSheet[] = r.sheets.map((d) => {
      const s = d.review as ReviewSummary;
      return { drawingId: d.id, name: d.name, versionId: s.versionId!, versionNo: s.versionNo, pdfPath: s.pdfPath, thumbPath: s.thumbPath, pageCount: s.pageCount ?? null };
    });
    return { room: name, sheets, outcome: null, changes: [], round: 0, charge: null };
  });

  const [projectSnap, termsSnap] = await Promise.all([db().doc(base).get(), db().doc(`organizations/${orgId}/settings/terms`).get()]);
  const ref = db().collection(`${base}/designMeetings`).doc();
  const now = Date.now();
  const meeting: DesignMeeting = {
    id: ref.id, orgId, projectId, projectName: actor.projectName, state: "OPEN", rev: 1,
    attendees: cleanText(input.attendees, 300),
    includedRounds: includedRoundsFrom(projectSnap.data(), termsSnap.data()),
    rooms: chosen, startedAt: now, startedBy: person(actor), closedAt: null, closedBy: null,
  };
  await ref.set(meeting);
  return { meeting };
}

async function decide(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustRun(actor);
  const ref = meetingRef(orgId, projectId, input.meetingId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    if (m.state !== "OPEN") throw new HttpsError("failed-precondition", "This meeting is already closed.");
    const i = m.rooms.findIndex((r) => r.room === String(input.room || ""));
    if (i < 0) throw new HttpsError("invalid-argument", "That room is not in this meeting.");
    const outcome = input.outcome === "agreed" || input.outcome === "changes" ? input.outcome : null;
    const changes = outcome === "changes" ? cleanChanges(input.changes, m.rooms[i].sheets) : [];
    if (outcome === "changes" && !changes.length) throw new HttpsError("invalid-argument", "Pin at least one change on the drawing, or mark the room agreed.");
    const rooms = m.rooms.map((r, k) => (k === i ? { ...r, outcome, changes } : r));
    const next = { ...m, rooms, rev: m.rev + 1 };
    tx.update(ref, { rooms: rooms.map((r) => ({ ...r, changes: r.changes.map((c) => ({ ...c, shape: storeShape(c.shape) })) })), rev: next.rev });
    return { meeting: next };
  });
}

async function close(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustRun(actor);
  const ref = meetingRef(orgId, projectId, input.meetingId);
  const base = projectPath(orgId, projectId);
  const charges: Record<string, unknown> = input.charges && typeof input.charges === "object" ? input.charges : {};
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    if (m.state !== "OPEN") throw new HttpsError("failed-precondition", "This meeting is already closed.");
    if (input.expectedRev !== undefined && Number(input.expectedRev) !== m.rev) throw new HttpsError("aborted", "The meeting changed a moment ago. Refresh and try again.");
    const decided = m.rooms.filter((r) => r.outcome);
    if (!decided.length) throw new HttpsError("failed-precondition", "Mark at least one room agreed or with changes, or cancel the meeting.");

    /* Every read before any write. */
    const ids = [...new Set(decided.flatMap((r) => r.sheets.map((s) => s.drawingId)))];
    const drawingSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const id of ids) drawingSnaps.set(id, await tx.get(db().doc(`${base}/drawingTracker/${id}`)));
    const closed = await tx.get(db().collection(`${base}/designMeetings`).where("state", "==", "CLOSED"));
    const used = clientRoundsByRoom(closed.docs.map((d) => d.data() as DesignMeeting), m.id);

    for (const r of decided) {
      for (const sh of r.sheets) {
        const s: ReviewSummary | undefined = drawingSnaps.get(sh.drawingId)?.data()?.review;
        if (!s || s.versionId !== sh.versionId || s.state !== "APPROVED" || s.clientChanges?.pending) {
          throw new HttpsError("failed-precondition", `${sh.name} changed during the meeting, so what the client saw is no longer current. Present ${r.room} again.`);
        }
      }
    }

    const now = Date.now();
    const by = person(actor);
    const rooms: MeetingRoom[] = m.rooms.map((r) => {
      if (r.outcome !== "changes") return { ...r, round: 0, charge: null };
      const round = (used[r.room] || 0) + 1;
      if (!isOverIncluded(round, m.includedRounds)) return { ...r, round, charge: null };
      const status = charges[r.room];
      if (status !== "to_bill" && status !== "waived") {
        throw new HttpsError("invalid-argument", `${r.room} goes to round ${round} and ${m.includedRounds} are included. Choose to bill it or waive it.`);
      }
      const charge: RoomCharge = { status, fee: null, note: null, ref: null, decidedBy: by, decidedAt: now, updatedBy: by, updatedAt: now };
      return { ...r, round, charge };
    });

    for (const r of rooms.filter((x) => x.outcome)) {
      for (const sh of r.sheets) {
        const dref = db().doc(`${base}/drawingTracker/${sh.drawingId}`);
        const s = drawingSnaps.get(sh.drawingId)!.data()!.review as ReviewSummary;
        const mine = r.changes.filter((c) => c.drawingId === sh.drawingId);
        if (r.outcome === "agreed" || !mine.length) {
          tx.set(dref.collection("reviewEvents").doc(), { type: "client", at: now, by, versionNo: sh.versionNo, text: r.outcome === "agreed" ? "Agreed with the client at the design meeting" : "Shown at the design meeting; the client's changes were on other sheets of the room" } as ReviewEvent);
          continue;
        }
        let seq = s.marksSeq || 0;
        mine.forEach((c) => {
          const mref = dref.collection("reviewMarks").doc();
          seq += 1;
          const mark: ReviewMark = { id: mref.id, versionId: sh.versionId, n: seq, page: c.page, shape: c.shape, text: c.text, blocking: false, status: "OPEN", by, at: now, updatedAt: now, source: "client", meetingId: m.id };
          tx.set(mref, { ...mark, shape: storeShape(mark.shape) });
        });
        tx.update(dref, { review: {
          ...s, rev: s.rev + 1, marksSeq: seq, marksTotal: (s.marksTotal || 0) + mine.length, marksOpen: (s.marksOpen || 0) + mine.length,
          clientChanges: { meetingId: m.id, at: now, count: mine.length, pending: true, by }, updatedAt: now,
        } });
        tx.set(dref.collection("reviewEvents").doc(), { type: "client", at: now, by, versionNo: sh.versionNo, text: `The client asked for ${mine.length} change${mine.length === 1 ? "" : "s"} at the design meeting` } as ReviewEvent);
      }
    }

    const stored = rooms.map((r) => ({ ...r, changes: r.changes.map((c) => ({ ...c, shape: storeShape(c.shape) })) }));
    tx.update(ref, { state: "CLOSED", rooms: stored, closedAt: now, closedBy: by, rev: m.rev + 1 });
    return { meeting: { ...m, state: "CLOSED", rooms, closedAt: now, closedBy: by, rev: m.rev + 1 } as DesignMeeting };
  });
}

async function cancel(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustRun(actor);
  const ref = meetingRef(orgId, projectId, input.meetingId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    if (m.state !== "OPEN") throw new HttpsError("failed-precondition", "Only an open meeting can be cancelled.");
    tx.update(ref, { state: "CANCELLED", closedAt: Date.now(), closedBy: person(actor), rev: m.rev + 1 });
    return { meeting: { ...m, state: "CANCELLED" } };
  });
}

/* The billing list: a chargeable round's fee, and whether it was billed or waived. */
async function charge(actor: Actor, orgId: string, projectId: string, input: Input) {
  if (!canSetAudience(actor.role)) throw new HttpsError("permission-denied", "Only the Design Head, Ops or the studio's leads update revision billing.");
  const ref = meetingRef(orgId, projectId, input.meetingId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    const i = m.rooms.findIndex((r) => r.room === String(input.room || ""));
    if (m.state !== "CLOSED" || i < 0 || !m.rooms[i].charge) throw new HttpsError("failed-precondition", "There is no chargeable revision for that room in this meeting.");
    const prev = m.rooms[i].charge!;
    const status: ChargeStatus = ["to_bill", "billed", "waived"].includes(input.status) ? input.status : prev.status;
    const fee = input.fee !== undefined ? cleanFee(input.fee) : prev.fee;
    if (input.fee !== undefined && input.fee !== null && input.fee !== "" && fee === null) throw new HttpsError("invalid-argument", "Enter the fee as a number of rupees.");
    if (status === "billed" && !fee) throw new HttpsError("invalid-argument", "Set the fee before marking it billed.");
    const next: RoomCharge = {
      ...prev, status, fee,
      note: input.note !== undefined ? cleanText(input.note, 300) || null : prev.note,
      ref: input.ref !== undefined ? cleanText(input.ref, 80) || null : prev.ref,
      updatedBy: person(actor), updatedAt: Date.now(),
    };
    const rooms = m.rooms.map((r, k) => (k === i ? { ...r, charge: next } : r));
    tx.update(ref, { rooms, rev: m.rev + 1 });
    return { meeting: { ...m, rooms, rev: m.rev + 1 } };
  });
}

export const designMeeting = onCall({ cors: true, timeoutSeconds: 60 }, async (request) => {
  const input: Input = request.data || {};
  const { orgId, projectId, action } = input;
  if (![orgId, projectId].every(safeId)) throw new HttpsError("invalid-argument", "Which project?");
  try {
    const actor = await resolveActor(request, orgId, projectId);
    switch (action) {
      case "start": return await start(actor, orgId, projectId, input);
      case "room": return await decide(actor, orgId, projectId, input);
      case "close": return await close(actor, orgId, projectId, input);
      case "cancel": return await cancel(actor, orgId, projectId, input);
      case "charge": return await charge(actor, orgId, projectId, input);
      default: throw new HttpsError("invalid-argument", "Unknown action.");
    }
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    logger.error("designMeeting failed", { action, orgId, projectId, message: e?.message, stack: e?.stack });
    throw new HttpsError("internal", "Something went wrong on our side. Try again in a moment.");
  }
});
