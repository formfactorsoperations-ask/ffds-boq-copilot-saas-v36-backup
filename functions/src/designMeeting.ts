import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { sendMail } from "./mail";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { resolveActor, person, type Actor } from "./drawingReview";
import {
  canRunMeeting, canPresentAssigned, canSetAudience, cleanText, storeShape, safeId, trackerPatch, clientPending, reclaimPatch, projectNameOf,
  type ReviewSummary, type ReviewMark, type ReviewEvent,
} from "../../lib/drawingReview";
import {
  presentableRooms, clientRoundsByRoom, includedRoundsFrom, isOverIncluded, cleanChanges, cleanFee,
  cleanSignerName, cleanSignature, portalDesignRecord, cleanRoomBoxes, cleanPresenters, mayRunThis, GENERAL_ROOM,
  needsApproval, blankApproval, approvalSheets, approvalEmail, addWorkingDays, reminderDue, mayDeem, agreementsFrom,
  cleanEmails, cleanLink, cleanEmailText, cleanEmailSubject, textEmailHtml, APPROVAL_WORKING_DAYS, sendsApprovals, needsApproval as needsWrittenApproval, type ClientApproval, type ApprovalVia, type ApprovalItem,
  type DesignMeeting, type MeetingConfirmation, type PortalDesignMeeting, type MeetingLayout, type LayoutSetup, type MeetingRoom, type MeetingSheet, type RoomCharge, type ChargeStatus, type RoomDrawing,
} from "../../lib/designMeeting";

/*
  DESIGN MEETINGS, ON THE SERVER.

  The Design Head (or the studio's Owner or an Admin) presents approved rooms
  to the client and records, room by room, whether the client agreed or asked
  for changes. A Designer on the project may present too, but only the
  approved drawings the Design Head assigned to them (presenters, below),
  only carry on meetings they started, and never decide revision billing: a
  chargeable round from their meeting waits on the list to bill for the
  Design Head to bill or waive. Only this function writes a meeting, and only it turns the
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

/** The Design Head, the Owner or an Admin: any meeting, any approved room, and billing. */
const isLead = (actor: Actor) => canRunMeeting(actor.roles);

/* Leads, and Designers presenting what the Design Head gave them. */
function mustPresent(actor: Actor) {
  if (!isLead(actor) && !canPresentAssigned(actor.roles)) throw new HttpsError("permission-denied", "Only the Design Head, the Owner, an Admin or the project's designer presents a design meeting.");
}

/* A Designer carries on only the meetings they started; a lead, any. */
function mustRunThis(actor: Actor, m: DesignMeeting) {
  mustPresent(actor);
  if (!mayRunThis(m, { uid: actor.uid, lead: isLead(actor) })) {
    throw new HttpsError("permission-denied", `${m.startedBy?.name || "Someone else"} is running this meeting. Only they, the Design Head or an Admin can carry it on.`);
  }
}

async function start(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustPresent(actor);
  const wanted: string[] = Array.isArray(input.rooms) ? [...new Set(input.rooms.map((r: unknown) => String(r)).filter(Boolean))].slice(0, 30) as string[] : [];
  if (!wanted.length) throw new HttpsError("invalid-argument", "Pick at least one room to present.");
  const base = projectPath(orgId, projectId);
  const open = await db().collection(`${base}/designMeetings`).where("state", "==", "OPEN").limit(1).get();
  if (!open.empty) throw new HttpsError("failed-precondition", "A meeting is already open for this project. Finish or cancel it first.", { meetingId: open.docs[0].id });

  const tracker = await db().collection(`${base}/drawingTracker`).get();
  const drawings: RoomDrawing[] = tracker.docs.map((d) => ({ id: d.id, name: String(d.data().name || "Drawing"), roomName: d.data().roomName || null, review: d.data().review || null }));
  /* A Designer presents only the approved drawings the Design Head assigned to them. */
  const rooms = presentableRooms(drawings, isLead(actor) ? null : actor.email);
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
  mustPresent(actor);
  const ref = meetingRef(orgId, projectId, input.meetingId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    mustRunThis(actor, m);
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
  mustPresent(actor);
  const ref = meetingRef(orgId, projectId, input.meetingId);
  const base = projectPath(orgId, projectId);
  const charges: Record<string, unknown> = input.charges && typeof input.charges === "object" ? input.charges : {};
  const out = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    mustRunThis(actor, m);
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
      /* Billing is the Design Head's: from a Designer's meeting the round waits on the list to bill, to be billed or waived there. */
      const status = isLead(actor) ? charges[r.room] : "to_bill";
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
          tx.set(dref.collection("reviewEvents").doc(), { type: "client", at: now, by, versionNo: sh.versionNo, text: r.outcome === "agreed" ? "Agreed with the client at the design meeting; waiting for their approval in writing" : "Shown at the design meeting; the client's changes were on other sheets of the room" } as ReviewEvent);
          /* Agreeing at the meeting is not the approval: that comes back in writing (recordApproval, below). */
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
    /* Rooms the client agreed now wait for their approval in writing. */
    const approval: ClientApproval | null = needsApproval({ state: "CLOSED", rooms }) ? blankApproval() : null;
    tx.update(ref, { state: "CLOSED", rooms: stored, closedAt: now, closedBy: by, rev: m.rev + 1, approval });
    return { meeting: { ...m, state: "CLOSED", rooms, closedAt: now, closedBy: by, rev: m.rev + 1, approval } as DesignMeeting };
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
  mustPresent(actor);
  const name = cleanSignerName(input.name);
  if (!name) throw new HttpsError("invalid-argument", "Type the client's name as they would sign it.");
  const signature = cleanSignature(input.signature);
  if (!signature) throw new HttpsError("invalid-argument", "Ask the client to sign in the box first.");
  const ref = meetingRef(orgId, projectId, input.meetingId);
  const out = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    mustRunThis(actor, m);
    if (m.state !== "CLOSED") throw new HttpsError("failed-precondition", "Save the meeting before the client confirms it.");
    if (m.confirmation?.at) throw new HttpsError("failed-precondition", "The client has already confirmed this meeting.");
    const snaps = await readAgreedSheets(tx, orgId, projectId, m);
    const now = Date.now();
    const confirmation: MeetingConfirmation = { via: "studio", name, email: null, uid: null, at: now, signature, recordedBy: person(actor) };
    /* The client's signature on the record is their approval in writing. */
    const approval = settleApproval(m, "approved", "signature", now, `Signed by ${name} in the studio`, person(actor), now);
    const result = writeApprovedSheets(tx, orgId, projectId, m, snaps, now, person(actor), "Approved by the client: signed the meeting record in the studio");
    tx.update(ref, { confirmation, rev: m.rev + 1, ...(approval ? { approval } : {}) });
    return { meeting: { ...m, confirmation, rev: m.rev + 1, ...(approval ? { approval } : {}) }, ...result };
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
    const snaps = await readAgreedSheets(tx, orgId, p.projectId, m);
    const now = Date.now();
    const confirmation: MeetingConfirmation = {
      via: "portal", name, email: p.email, uid: p.uid, at: now,
      ip: p.ip, userAgent: String(p.userAgent || "").slice(0, 300),
    };
    const client = { uid: p.uid, email: p.email || "", name };
    const approval = settleApproval(m, "approved", "portal", now, `Confirmed by ${name} in the portal`, client, now);
    writeApprovedSheets(tx, orgId, p.projectId, m, snaps, now, client, "Approved by the client: confirmed the meeting record in the portal");
    tx.update(ref, { confirmation, rev: m.rev + 1, ...(approval ? { approval } : {}) });
  });
  return refreshPortalRecord(orgId, p.projectId);
}

/*
  Where each room is on the layout plan, marked once per project. An open
  meeting on the same plan picks the boxes up straight away.
*/
async function layoutRooms(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustPresent(actor);
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
  mustPresent(actor);
  const ref = meetingRef(orgId, projectId, input.meetingId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That meeting could not be found.");
    const m = snap.data() as DesignMeeting;
    mustRunThis(actor, m);
    if (m.state !== "OPEN") throw new HttpsError("failed-precondition", "Only an open meeting can be cancelled.");
    tx.update(ref, { state: "CANCELLED", closedAt: Date.now(), closedBy: person(actor), rev: m.rev + 1 });
    return { meeting: { ...m, state: "CANCELLED" } };
  });
}

/*
  Which Designers may present which drawings: the Design Head's choice, kept
  on each sheet's review (review.presenters) so it follows the sheet through
  new versions. Only the project's own Designers can be named. Takes
  { drawings: { [drawingId]: emails[] } }, up to 200 sheets at once.
*/
export const MAX_PRESENTER_SHEETS = 200;
async function presenters(actor: Actor, orgId: string, projectId: string, input: Input) {
  if (!isLead(actor)) throw new HttpsError("permission-denied", "Only the Design Head, the Owner or an Admin chooses who presents a drawing.");
  const wanted = input.drawings && typeof input.drawings === "object" && !Array.isArray(input.drawings) ? Object.entries(input.drawings as Record<string, unknown>) : [];
  if (!wanted.length) throw new HttpsError("invalid-argument", "Which drawings?");
  if (wanted.length > MAX_PRESENTER_SHEETS) throw new HttpsError("invalid-argument", `At most ${MAX_PRESENTER_SHEETS} drawings at a time.`);
  if (!wanted.every(([id]) => safeId(id))) throw new HttpsError("invalid-argument", "Which drawings?");
  const view = (await db().doc(`projects/${projectId}/designView/current`).get()).data();
  const designers: string[] = view && view.tenantId === orgId && Array.isArray(view.designers) ? view.designers : [];
  const base = projectPath(orgId, projectId);
  const out: Record<string, string[]> = {};
  await db().runTransaction(async (tx) => {
    const refs = wanted.map(([id]) => db().doc(`${base}/drawingTracker/${id}`));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    snaps.forEach((snap, i) => {
      const s = snap.data()?.review as ReviewSummary | undefined;
      if (!snap.exists || !s || s.versionNo === undefined) throw new HttpsError("failed-precondition", `${snap.data()?.name || "That drawing"} has no PDF yet.`);
      const emails = cleanPresenters(wanted[i][1], designers);
      out[snap.id] = emails;
      tx.update(refs[i], { "review.presenters": emails });
    });
  });
  return { presenters: out };
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

/* ------------------------------------------------------------ the client's written approval */

/*
  After a meeting, the rooms the client agreed wait for their approval in
  writing (lib/designMeeting: ClientApproval). The studio sends the approval
  email from here, the reminders go on working days 3 and 5
  (designApprovalReminders, below), and the studio records the client's
  answer: approved (their reply pasted in), changes, or, once the date in the
  email has passed, taken as approved by the Design Head. Approving writes
  the Drawings table in the same transaction, on the versions the client was
  shown; a sheet that has moved on since is left as it is and named.
*/

type Snaps = Map<string, FirebaseFirestore.DocumentSnapshot>;

/** The agreed rooms' drawings, read before any write. */
async function readAgreedSheets(tx: FirebaseFirestore.Transaction, orgId: string, projectId: string, m: DesignMeeting): Promise<Snaps> {
  const base = projectPath(orgId, projectId);
  const snaps: Snaps = new Map();
  for (const sh of approvalSheets(m)) {
    if (!snaps.has(sh.drawingId)) snaps.set(sh.drawingId, await tx.get(db().doc(`${base}/drawingTracker/${sh.drawingId}`)));
  }
  return snaps;
}

/** Approves the agreed sheets in the Drawings table: only those still on the version the client was shown. */
function writeApprovedSheets(tx: FirebaseFirestore.Transaction, orgId: string, projectId: string, m: DesignMeeting, snaps: Snaps,
  at: number, by: { uid: string; email: string; name: string }, text: string): { approved: string[]; movedOn: string[] } {
  const base = projectPath(orgId, projectId);
  const approved: string[] = [];
  const movedOn: string[] = [];
  for (const sh of approvalSheets(m)) {
    const snap = snaps.get(sh.drawingId);
    const s: ReviewSummary | undefined = snap?.data()?.review;
    if (!snap?.exists || !s || s.state !== "APPROVED" || s.versionNo !== sh.versionNo || clientPending(s)) { movedOn.push(sh.name); continue; }
    const dref = db().doc(`${base}/drawingTracker/${sh.drawingId}`);
    const patch = trackerPatch(snap.data(), s, { meetingId: m.id, at, versionNo: sh.versionNo }, Date.now());
    if (patch) tx.update(dref, patch);
    tx.set(dref.collection("reviewEvents").doc(), { type: "client", at: Date.now(), by, versionNo: sh.versionNo, text } as ReviewEvent);
    approved.push(sh.name);
  }
  return { approved, movedOn };
}

/** The meeting's approval, settled. Null for a meeting that never asked for one (no agreed rooms). */
function settleApproval(m: DesignMeeting, status: "approved" | "deemed" | "changes", via: ApprovalVia, answeredAt: number, note: string | null,
  by: { uid: string; email: string; name: string }, now: number): ClientApproval | null {
  if (!needsApproval(m)) return null;
  return { ...blankApproval(), ...(m.approval || {}), status, via, answeredAt, note, recordedBy: by, recordedAt: now };
}

function mustAwait(m: DesignMeeting) {
  if (m.state !== "CLOSED") throw new HttpsError("failed-precondition", "Save the meeting first.");
  if (!needsApproval(m)) throw new HttpsError("failed-precondition", "The client did not agree any room at this meeting, so there is nothing to approve.");
  if (m.confirmation?.at || m.approval?.status === "approved" || m.approval?.status === "deemed") {
    throw new HttpsError("failed-precondition", "The client's approval is already recorded for this meeting.");
  }
}

/*
  Who sends the approval email and records the answer: operations (the Ops
  Director, and Client Relations on their own projects; resolveActor already
  checked the project is theirs), and, as before, whoever ran the meeting or
  the Design Head. The email goes out in the sender's name and the client's
  reply comes back to them.
*/
function mustHandleApproval(actor: Actor, m: DesignMeeting) {
  if (sendsApprovals(actor.roles)) return;
  mustRunThis(actor, m);
}

/** What the approval email needs that the meeting does not carry: the client and the studio, from the project. */
async function projectContact(projectId: string) {
  const ctx = (await db().doc(`projects/${projectId}`).get()).data()?.context || {};
  return {
    clientName: String(ctx.clientName || "").trim().slice(0, 80),
    clientEmails: cleanEmails(ctx.clientEmail || "") || [],
    studioName: String(ctx.portalStudio?.name || "").trim().slice(0, 80),
  };
}

async function sendApproval(actor: Actor, orgId: string, projectId: string, input: Input) {
  const ref = meetingRef(orgId, projectId, input.meetingId);
  const to = cleanEmails(input.to);
  if (!to || !to.length) throw new HttpsError("invalid-argument", "Add the client's email address.");
  const cc = cleanEmails(input.cc || []);
  if (!cc) throw new HttpsError("invalid-argument", "One of the CC addresses is not an email address.");
  const driveLink = input.driveLink ? cleanLink(input.driveLink) : null;
  if (input.driveLink && !driveLink) throw new HttpsError("invalid-argument", "The Drive link has to start with https://");
  const clientName = cleanSignerName(input.clientName);
  if (!clientName) throw new HttpsError("invalid-argument", "Write the client's name as the email should greet them.");
  const contact = await projectContact(projectId);

  /* Checked first, sent next, recorded last: a failed send records nothing, a failed record is reported. */
  const first = await ref.get();
  const m0 = first.data() as DesignMeeting | undefined;
  if (!m0) throw new HttpsError("not-found", "That meeting could not be found.");
  mustHandleApproval(actor, m0);
  mustAwait(m0);
  const now = Date.now();
  const dueAt = addWorkingDays(now, APPROVAL_WORKING_DAYS);
  const sheets = approvalSheets(m0);
  const standard = approvalEmail({ kind: "request", clientName, projectName: actor.projectName || m0.projectName || "your project", sheets, driveLink, dueAt, senderName: actor.name, studioName: contact.studioName });
  /* The sender may have edited the wording: their subject and text, made safe (lib/designMeeting textEmailHtml). */
  const subject = input.subject !== undefined ? cleanEmailSubject(input.subject) : standard.subject;
  const body = input.body !== undefined ? cleanEmailText(input.body) : null;
  if (!subject) throw new HttpsError("invalid-argument", "Write a subject for the email.");
  if (body !== null && body.length < 20) throw new HttpsError("invalid-argument", "The email is empty. Write it, or go back to the standard wording.");
  const mail = body !== null ? { subject, html: textEmailHtml(body), text: body } : { ...standard, subject };
  const copies = [...new Set([actor.email, ...cc].filter((e) => e && !to.includes(e)))];
  const sent = await sendMail({ to, cc: copies, replyTo: actor.email, subject: mail.subject, html: mail.html, text: mail.text, fromName: actor.name });

  const out = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const m = snap.data() as DesignMeeting;
    mustAwait(m);
    const approval: ClientApproval = {
      ...blankApproval(), ...(m.approval || {}),
      status: "awaiting", sentAt: now, sentBy: person(actor), sentTo: to, cc: copies, clientName, studioName: contact.studioName,
      driveLink, dueAt, reminders: [], answeredAt: null, via: null, note: null, recordedBy: null, recordedAt: null,
    };
    tx.update(ref, { approval, rev: m.rev + 1 });
    return { meeting: { ...m, approval, rev: m.rev + 1 } };
  });
  return { ...out, sandbox: !!sent.sandbox };
}

async function recordApproval(actor: Actor, orgId: string, projectId: string, input: Input) {
  const outcome = input.outcome === "approved" || input.outcome === "changes" || input.outcome === "deemed" ? input.outcome : null;
  if (!outcome) throw new HttpsError("invalid-argument", "Approved, changes, or taken as approved?");
  const note = cleanText(input.note, 2000) || null;
  if (outcome === "changes" && !note) throw new HttpsError("invalid-argument", "Paste what the client asked to change.");
  const ref = meetingRef(orgId, projectId, input.meetingId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const m = snap.data() as DesignMeeting | undefined;
    if (!m) throw new HttpsError("not-found", "That meeting could not be found.");
    mustHandleApproval(actor, m);
    mustAwait(m);
    const now = Date.now();
    if (outcome === "deemed") {
      if (!isLead(actor)) throw new HttpsError("permission-denied", "Only the Design Head, the Owner or an Admin takes drawings as approved.");
      if (!mayDeem(m.approval, now)) throw new HttpsError("failed-precondition", "The date in the approval email has not passed yet.");
    }
    /* The date on the client's reply: not before the meeting, not in the future. Taken as approved: the date in the email. */
    const asked = Number(input.answeredAt);
    const answeredAt = outcome === "deemed" ? m.approval!.dueAt! : Number.isFinite(asked) && asked >= (m.closedAt || 0) && asked <= now ? asked : now;
    const snaps = outcome === "changes" ? new Map() as Snaps : await readAgreedSheets(tx, orgId, projectId, m);
    const approval = settleApproval(m, outcome, outcome === "deemed" ? "deemed" : "email", answeredAt,
      outcome === "deemed" ? note || `No answer by ${new Date(m.approval!.dueAt!).toISOString().slice(0, 10)}; taken as approved, as the approval email said.` : note, person(actor), now)!;
    let result = { approved: [] as string[], movedOn: [] as string[] };
    if (outcome !== "changes") {
      result = writeApprovedSheets(tx, orgId, projectId, m, snaps, answeredAt, person(actor),
        outcome === "deemed" ? "Taken as approved: the client did not answer by the date in the approval email" : "Approved by the client in writing (email)");
    }
    tx.update(ref, { approval, rev: m.rev + 1 });
    return { meeting: { ...m, approval, rev: m.rev + 1 }, ...result };
  });
}

/*
  The project's held meetings with agreed rooms, for operations on the Ops
  Desk, who do not read meetings themselves: what was agreed, where its
  approval stands, and who the client is. Nothing about billing, the files or
  the client's pins.
*/
async function approvals(actor: Actor, orgId: string, projectId: string): Promise<{ items: ApprovalItem[] }> {
  mustSendApprovals(actor);
  const held = await db().collection(`${projectPath(orgId, projectId)}/designMeetings`).where("state", "==", "CLOSED").get();
  const contact = await projectContact(projectId);
  const items: ApprovalItem[] = held.docs
    .map((d) => ({ ...(d.data() as DesignMeeting), id: d.id }))
    .filter((m) => needsWrittenApproval(m))
    .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    .slice(0, 20)
    .map((m) => ({
      meetingId: m.id, projectId, projectName: actor.projectName || m.projectName || "Project", closedAt: m.closedAt || m.startedAt,
      presentedBy: m.startedBy?.name || "", sheets: approvalSheets(m), approval: m.approval || null,
      outside: !!m.outside, how: m.outside ? m.attendees || "" : undefined,
      confirmation: m.confirmation?.at ? { via: m.confirmation.via, name: m.confirmation.name, at: m.confirmation.at } : null,
      contact: { name: contact.clientName, email: contact.clientEmails.join(", "), studio: contact.studioName },
    }));
  return { items };
}

/*
  DRAWINGS PRESENTED OUTSIDE THE STUDIO DESK.

  Not every presentation happens in a design meeting here: drawings are
  shown at site, in person or sent on WhatsApp. Operations record that the
  client saw them, picking the Design Head-approved client drawings; that
  makes a held meeting with those rooms agreed (presentedOutside, with how
  and when), and from there the approval runs exactly as after a meeting:
  the email, Drive, reminders and the client's answer.
*/
function mustSendApprovals(actor: Actor) {
  if (!sendsApprovals(actor.roles) && !isLead(actor) && !canPresentAssigned(actor.roles)) {
    throw new HttpsError("permission-denied", "This account does not send approval emails.");
  }
}

/** The project's client drawings the Design Head has approved and the client has not: what can be sent for approval. */
async function approvable(actor: Actor, orgId: string, projectId: string) {
  mustSendApprovals(actor);
  const tracker = await db().collection(`${projectPath(orgId, projectId)}/drawingTracker`).get();
  const drawings = tracker.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(({ data }) => {
      const s = data.review as ReviewSummary | undefined;
      return !!s && s.state === "APPROVED" && !!s.versionId && (s.audience || "client") === "client" && !clientPending(s) && data.approvedAt == null;
    })
    .map(({ id, data }) => ({ drawingId: id, name: String(data.name || "Drawing"), room: data.roomName || GENERAL_ROOM, versionNo: (data.review as ReviewSummary).versionNo }))
    .sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name));
  return { projectName: actor.projectName, drawings };
}

async function presentedOutside(actor: Actor, orgId: string, projectId: string, input: Input) {
  mustSendApprovals(actor);
  const ids: string[] = Array.isArray(input.drawingIds) ? [...new Set(input.drawingIds.map((x: unknown) => String(x)))].filter(safeId).slice(0, 40) as string[] : [];
  if (!ids.length) throw new HttpsError("invalid-argument", "Tick the drawings the client was shown.");
  const how = cleanText(input.how, 200) || "Presented outside the Studio Desk";
  const on = Number(input.presentedOn);
  const now = Date.now();
  const presentedOn = Number.isFinite(on) && on <= now && on > now - 365 * 86_400_000 ? on : now;
  const base = projectPath(orgId, projectId);
  const ref = db().collection(`${base}/designMeetings`).doc();
  return db().runTransaction(async (tx) => {
    const snaps = await Promise.all(ids.map((id) => tx.get(db().doc(`${base}/drawingTracker/${id}`))));
    const byRoom = new Map<string, MeetingSheet[]>();
    snaps.forEach((snap) => {
      const data = snap.data();
      const s = data?.review as ReviewSummary | undefined;
      if (!snap.exists || !s || s.state !== "APPROVED" || !s.versionId || (s.audience || "client") !== "client" || clientPending(s)) {
        throw new HttpsError("failed-precondition", `${data?.name || "A drawing"} is not approved by the Design Head for the client, so it cannot be sent for approval yet.`);
      }
      const room = String(data!.roomName || GENERAL_ROOM);
      byRoom.set(room, [...(byRoom.get(room) || []), {
        drawingId: snap.id, name: String(data!.name || "Drawing"), versionId: s.versionId, versionNo: s.versionNo,
        pdfPath: s.pdfPath, thumbPath: s.thumbPath, pageCount: s.pageCount ?? null,
      }]);
    });
    const rooms: MeetingRoom[] = [...byRoom].map(([room, sheets]) => ({ room, sheets, outcome: "agreed", changes: [], round: 0, charge: null }));
    const by = person(actor);
    const meeting: DesignMeeting = {
      id: ref.id, orgId, projectId, projectName: actor.projectName, state: "CLOSED", rev: 1,
      attendees: how, includedRounds: 0, rooms, startedAt: presentedOn, startedBy: by, closedAt: presentedOn, closedBy: by,
      approval: blankApproval(), outside: true,
    };
    tx.set(ref, meeting);
    snaps.forEach((snap) => tx.set(snap.ref.collection("reviewEvents").doc(), {
      type: "client", at: now, by, versionNo: (snap.data()!.review as ReviewSummary).versionNo, text: `Shown to the client outside the Studio Desk (${how}); waiting for their approval in writing`,
    } as ReviewEvent));
    return { meeting };
  });
}

/*
  Brings a project's drawings in line with the written-approval rule, once
  each: a sheet the old name guess made studio-only (and the Design Head
  never marked so) becomes the client's, and an approval in the table that
  the client never gave goes back to waiting for them (lib/drawingReview:
  reclaimPatch). Run from the Drawings table by the studio's leads; it writes
  only what is wrong, so running it again writes nothing.
*/
async function reconcile(actor: Actor, orgId: string, projectId: string) {
  if (!canSetAudience(actor.roles)) throw new HttpsError("permission-denied", "Only the Design Head or the studio's leads can do this.");
  const base = projectPath(orgId, projectId);
  const [tracker, held] = await Promise.all([
    db().collection(`${base}/drawingTracker`).get(),
    db().collection(`${base}/designMeetings`).where("state", "==", "CLOSED").get(),
  ]);
  const meetings = held.docs.map((d) => ({ ...(d.data() as DesignMeeting), id: d.id }));
  const agreements = agreementsFrom(meetings);
  /* When each drawing's room was agreed at a meeting: the old close wrote its approval at exactly that time. */
  const closedAt: Record<string, number[]> = {};
  meetings.forEach((m) => m.rooms.forEach((r) => {
    if (r.outcome === "agreed" && m.closedAt) r.sheets.forEach((sh) => (closedAt[sh.drawingId] = [...(closedAt[sh.drawingId] || []), m.closedAt!]));
  }));
  let audience = 0, reclaimed = 0;
  for (const d of tracker.docs) {
    const data = d.data();
    let review: ReviewSummary | undefined = data.review;
    if (!review) continue;
    const write: Record<string, any> = {};
    if (!review.audienceChecked) {
      let next: ReviewSummary = { ...review, audienceChecked: true };
      if (review.audience === "studio") {
        const chose = await d.ref.collection("reviewEvents").where("type", "==", "audience").limit(1).get();
        if (chose.empty) { next = { ...next, audience: "client" }; audience++; }
      }
      review = next;
      write.review = next;
    }
    const patch = reclaimPatch(data as any, review, agreements[d.id], closedAt[d.id] || []);
    if (patch) { Object.assign(write, patch); reclaimed++; }
    if (Object.keys(write).length) await d.ref.update(write);
    if (patch) await d.ref.collection("reviewEvents").add({ type: "client", at: Date.now(), by: person(actor), versionNo: review.versionNo, text: "Back to waiting for the client: approved in the table before the client approved it in writing" } as ReviewEvent);
  }
  return { audience, reclaimed };
}

/*
  The reminders: every morning, each approval email still unanswered gets
  its reminder on working days 3 and 5 after it went, from the person who
  sent it (replies go to them). Once the date in the email passes, the studio
  sees it as overdue and the Design Head decides.
*/
export const designApprovalReminders = onSchedule(
  { schedule: "every day 10:00", timeZone: "Asia/Kolkata", secrets: ["RESEND_API_KEY", "EMAIL_FROM"], timeoutSeconds: 300 },
  async () => {
    const now = Date.now();
    const waiting = await db().collectionGroup("designMeetings").where("approval.status", "==", "awaiting").get();
    for (const doc of waiting.docs) {
      const m = doc.data() as DesignMeeting;
      const which = reminderDue(m.approval, now);
      if (which === null || !m.approval?.sentTo?.length || !m.approval.dueAt) continue;
      const a = m.approval;
      try {
        /* Claimed first, so a retried run never sends the same reminder twice. */
        const claimed = await db().runTransaction(async (tx) => {
          const fresh = (await tx.get(doc.ref)).data() as DesignMeeting;
          if (reminderDue(fresh.approval, now) !== which) return false;
          tx.update(doc.ref, { "approval.reminders": [...(fresh.approval!.reminders || []), now] });
          return true;
        });
        if (!claimed) continue;
        const mail = approvalEmail({
          kind: "reminder", reminder: which, clientName: a.clientName || "there",
          projectName: (m.projectId ? projectNameOf((await db().doc(`projects/${m.projectId}`).get()).data()) : null) || m.projectName || "your project",
          sheets: approvalSheets(m), driveLink: a.driveLink, dueAt: a.dueAt!, senderName: a.sentBy?.name || "", studioName: a.studioName || "",
        });
        await sendMail({ to: a.sentTo, cc: a.cc || [], replyTo: a.sentBy?.email || null, subject: mail.subject, html: mail.html, text: mail.text, fromName: a.sentBy?.name || null });
        logger.info("Drawings approval reminder sent", { path: doc.ref.path, reminder: which + 1 });
      } catch (e: any) {
        logger.error("Drawings approval reminder failed", { path: doc.ref.path, message: e?.message });
      }
    }
  },
);

export const designMeeting = onCall({ cors: true, timeoutSeconds: 120, secrets: ["RESEND_API_KEY", "EMAIL_FROM"] }, async (request) => {
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
      case "presenters": return await presenters(actor, orgId, projectId, input);
      case "sendApproval": return await sendApproval(actor, orgId, projectId, input);
      case "recordApproval": return await recordApproval(actor, orgId, projectId, input);
      case "reconcile": return await reconcile(actor, orgId, projectId);
      case "approvals": return await approvals(actor, orgId, projectId);
      case "approvable": return await approvable(actor, orgId, projectId);
      case "presentedOutside": return await presentedOutside(actor, orgId, projectId, input);
      default: throw new HttpsError("invalid-argument", "Unknown action.");
    }
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    logger.error("designMeeting failed", { action, orgId, projectId, message: e?.message, stack: e?.stack });
    throw new HttpsError("internal", "Something went wrong on our side. Try again in a moment.");
  }
});
