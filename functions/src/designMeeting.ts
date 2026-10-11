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
  cleanSignerName, cleanSignature, portalDesignRecord, cleanRoomBoxes,
  type DesignMeeting, type MeetingConfirmation, type PortalDesignMeeting, type MeetingLayout, type LayoutSetup, type MeetingRoom, type MeetingSheet, type RoomCharge, type ChargeStatus, type RoomDrawing,
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

  The client then confirms the record: by signing on the studio's screen
  (sign, below), or in their portal (submitClientAction: confirmMeeting, which
  calls confirmMeetingByClient). Held meetings are copied, reduced, into the
  client's portal view so they can see and confirm them.
*/

const db = () => admin.firestore();
const bucket = () => admin.storage().bucket();
const projectPath = (orgId: string, projectId: string) => `organizations/${orgId}/projects/${projectId}`;
type Input = Record<string, any>;

function meetingRef(orgId: string, projectId: string, meetingId: unknown) {
  if (!safeId(meetingId)) throw new HttpsError("invalid-argument", "Which meeting?");
  return db().doc(`${projectPath(orgId, projectId)}/designMeetings/${meetingId}`);
}

function mustRun(actor: Actor) {
  if (!canRunMeeting(actor.roles)) throw new HttpsError("permission-denied", "Only the Design Head, the Owner or an Admin runs a design meeting.");
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

  /* The layout plan shown beside each room: an approved sheet, on its approved version. */
  let layout: MeetingLayout | null = null;
  if (input.layoutDrawingId) {
    const d = tracker.docs.find((x) => x.id === String(input.layoutDrawingId));
    const s = d?.data().review as ReviewSummary | undefined;
    if (!d || !s || s.state !== "APPROVED" || !s.versionId) throw new HttpsError("failed-precondition", "The layout plan must be an approved sheet.");
    const setup = (await db().doc(`${base}/designLayout/current`).get()).data() as LayoutSetup | undefined;
    layout = {
      drawingId: d.id, name: String(d.data().name || "Layout plan"), versionId: s.versionId, versionNo: s.versionNo,
      pdfPath: s.pdfPath, pageCount: s.pageCount ?? null, rooms: setup?.drawingId === d.id ? cleanRoomBoxes(setup.rooms) : {},
    };
  }

  const [projectSnap, termsSnap] = await Promise.all([db().doc(base).get(), db().doc(`organizations/${orgId}/settings/terms`).get()]);
  const ref = db().collection(`${base}/designMeetings`).doc();
  const now = Date.now();
  const meeting: DesignMeeting = {
    id: ref.id, orgId, projectId, projectName: actor.projectName, state: "OPEN", rev: 1,
    attendees: cleanText(input.attendees, 300),
    includedRounds: includedRoundsFrom(projectSnap.data(), termsSnap.data()),
    rooms: chosen, startedAt: now, startedBy: person(actor), closedAt: null, closedBy: null, layout,
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
  const out = await db().runTransaction(async (tx) => {
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
  await refreshPortalRecord(orgId, projectId);
  return out;
}

/*
  The client's portal copy (projects/{p}/portalView/current) carries the held
  meetings, so a meeting reaches the client without waiting for the studio to
  re-send the portal. Only ever updated, never created: publishing the portal
  stays the studio's decision. A failure here never undoes the meeting itself.
*/
export async function refreshPortalRecord(orgId: string, projectId: string): Promise<PortalDesignMeeting[] | null> {
  const viewRef = db().doc(`projects/${projectId}/portalView/current`);
  const held = db().collection(`${projectPath(orgId, projectId)}/designMeetings`).where("state", "==", "CLOSED");
  try {
    return await db().runTransaction(async (tx) => {
      const view = await tx.get(viewRef);
      const snap = await tx.get(held);
      const record = portalDesignRecord(snap.docs.map((d) => ({ ...(d.data() as DesignMeeting), id: d.id })));
      if (!view.exists) return record;
      tx.update(viewRef, { designRecord: record.length ? record : admin.firestore.FieldValue.delete() });
      return record;
    });
  } catch (e: any) {
    logger.warn("Portal design record not refreshed", { orgId, projectId, message: e?.message });
    return null;
  }
}

/* The client signs the record on the studio's screen, with the studio's login holding it. */
async function sign(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustRun(actor);
  const name = cleanSignerName(input.name);
  if (!name) throw new HttpsError("invalid-argument", "Type the client's name as they would sign it.");
  const signature = cleanSignature(input.signature);
  if (!signature) throw new HttpsError("invalid-argument", "Ask the client to sign in the box first.");
  const ref = meetingRef(orgId, projectId, input.meetingId);
  const out = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    if (m.state !== "CLOSED") throw new HttpsError("failed-precondition", "Save the meeting before the client confirms it.");
    if (m.confirmation?.at) throw new HttpsError("failed-precondition", "The client has already confirmed this meeting.");
    const confirmation: MeetingConfirmation = { via: "studio", name, email: null, uid: null, at: Date.now(), signature, recordedBy: person(actor) };
    tx.update(ref, { confirmation, rev: m.rev + 1 });
    return { meeting: { ...m, confirmation, rev: m.rev + 1 } };
  });
  await refreshPortalRecord(orgId, projectId);
  return out;
}

/*
  The client confirms a held meeting from their portal. The caller has already
  been checked as this project's client (assertPortalClient); the meeting must
  be held and unconfirmed. Their login, address and the server's time are the
  record; the name is theirs to type, as on any other approval in the portal.
*/
export async function confirmMeetingByClient(p: {
  tenantId: unknown; projectId: string; meetingId: unknown; name: unknown;
  uid: string; email: string | null; ip: string | null; userAgent: string;
}): Promise<PortalDesignMeeting[] | null> {
  if (!safeId(p.tenantId) || !safeId(p.projectId)) throw new HttpsError("permission-denied", "This project is not open to you.");
  const name = cleanSignerName(p.name);
  if (!name) throw new HttpsError("invalid-argument", "Type your full name to confirm.");
  const orgId = String(p.tenantId);
  const ref = meetingRef(orgId, p.projectId, p.meetingId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const m = snap.data() as DesignMeeting | undefined;
    if (!m || m.state !== "CLOSED") throw new HttpsError("not-found", "That meeting is not in your design record.");
    if (m.confirmation?.at) throw new HttpsError("failed-precondition", "This meeting is already confirmed.");
    const confirmation: MeetingConfirmation = {
      via: "portal", name, email: p.email, uid: p.uid, at: Date.now(),
      ip: p.ip, userAgent: String(p.userAgent || "").slice(0, 300),
    };
    tx.update(ref, { confirmation, rev: m.rev + 1 });
  });
  return refreshPortalRecord(orgId, p.projectId);
}

/*
  Where each room is on the layout plan, marked once per project. An open
  meeting on the same plan picks the boxes up straight away.
*/
async function layoutRooms(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustRun(actor);
  if (!safeId(input.drawingId)) throw new HttpsError("invalid-argument", "Which layout plan?");
  const base = projectPath(orgId, projectId);
  const d = await db().doc(`${base}/drawingTracker/${input.drawingId}`).get();
  if (!d.exists || !d.data()?.review?.versionId) throw new HttpsError("failed-precondition", "That drawing has no PDF to mark.");
  const setup: LayoutSetup = { drawingId: d.id, rooms: cleanRoomBoxes(input.rooms), updatedAt: Date.now(), updatedBy: person(actor) };
  await db().doc(`${base}/designLayout/current`).set(setup);
  const open = await db().collection(`${base}/designMeetings`).where("state", "==", "OPEN").get();
  for (const o of open.docs) {
    const m = o.data() as DesignMeeting;
    if (m.layout?.drawingId === d.id) await o.ref.update({ "layout.rooms": setup.rooms, rev: m.rev + 1 });
  }
  return { layout: setup };
}

/*
  A drawing from a held meeting, for the client's portal. Only a sheet the
  meeting showed, or its layout plan, on the version it was shown at. The
  client's portal shows it with their name across it and offers no download;
  each opening is recorded on the meeting (one per ten minutes), so the
  studio can say when they looked.
*/
export const MAX_PORTAL_PDF_BYTES = 18 * 1024 * 1024;
export async function portalSheetFor(p: { tenantId: unknown; projectId: string; meetingId: unknown; drawingId: unknown; uid: string }) {
  if (!safeId(p.tenantId) || !safeId(p.projectId)) throw new HttpsError("permission-denied", "This project is not open to you.");
  const ref = meetingRef(String(p.tenantId), p.projectId, p.meetingId);
  const snap = await ref.get();
  const m = snap.data() as DesignMeeting | undefined;
  if (!m || m.state !== "CLOSED") throw new HttpsError("not-found", "That meeting is not in your design record.");
  const id = String(p.drawingId || "");
  const sheet = m.rooms.filter((r) => r.outcome).flatMap((r) => r.sheets).find((s) => s.drawingId === id)
    || (m.layout?.drawingId === id ? m.layout : null);
  if (!sheet || !sheet.pdfPath) throw new HttpsError("not-found", "That drawing is not in this meeting.");
  const file = bucket().file(sheet.pdfPath);
  const [meta] = await file.getMetadata();
  if (Number(meta.size) > MAX_PORTAL_PDF_BYTES) throw new HttpsError("failed-precondition", "This drawing is too large to show here. Ask your designer for a copy.");
  const [bytes] = await file.download();

  const now = Date.now();
  const views = Array.isArray(m.views) ? m.views : [];
  const last = [...views].reverse().find((v) => v.uid === p.uid);
  const next = !last || now - last.at > 10 * 60 * 1000 ? [...views, { at: now, uid: p.uid }].slice(-100) : views;
  if (next !== views) await ref.update({ views: next });
  return {
    name: sheet.name, versionNo: sheet.versionNo, data: bytes.toString("base64"),
    views: next.filter((v) => v.uid === p.uid).map((v) => v.at),
  };
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
  if (!canSetAudience(actor.roles)) throw new HttpsError("permission-denied", "Only the Design Head, Ops or the studio's leads update revision billing.");
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
      case "sign": return await sign(actor, orgId, projectId, input);
      case "layoutRooms": return await layoutRooms(actor, orgId, projectId, input);
      default: throw new HttpsError("invalid-argument", "Unknown action.");
    }
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    logger.error("designMeeting failed", { action, orgId, projectId, message: e?.message, stack: e?.stack });
    throw new HttpsError("internal", "Something went wrong on our side. Try again in a moment.");
  }
});
