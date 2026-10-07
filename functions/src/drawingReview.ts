import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { createHash } from "crypto";
import { PLATFORM_OWNER_EMAILS } from "./guards";
import {
  allowed, refusal, canReview, canUpload, canSetAudience, cleanShape, cleanText, guessAudience, storeShape,
  uploadPrefix, versionsPrefix, safeId, MAX_PDF_BYTES, MAX_THUMB_BYTES,
  type ReviewSummary, type ReviewPerson, type ReviewVersion, type ReviewRound, type ReviewMark, type ReviewEvent,
} from "../../lib/drawingReview";

/*
  DESIGN REVIEW, ON THE SERVER.

  Every step a drawing takes through review -- a PDF arriving, being sent to
  the Design Head, coming back with notes, being approved -- is decided here,
  with the caller's own profile, and written here. The browser cannot write
  any of it: the rules refuse the review summary and its subcollections to
  every browser, and the uploaded file only becomes a version once this has
  read it, checked it is a PDF, fingerprinted it and moved it where no browser
  can overwrite it.

  One callable with an action name, so the sign-in and scope checks are in one
  place and cannot drift between seven functions.
*/

const db = () => admin.firestore();
const bucket = () => admin.storage().bucket();

interface Actor extends ReviewPerson {
  role: string;
  platformOwner: boolean;
  projectName: string | null;
}

const STAFF_WITH_PROJECTS = new Set(["Owner", "Admin", "Ops Director", "Design Head", "Site Supervisor", "Viewer", "Super Admin"]);

/** Who is calling, and whether they may touch this project at all. */
async function resolveActor(request: any, orgId: string, projectId: string): Promise<Actor> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = String(request.auth.uid);
  const email = String(request.auth.token?.email || "").trim().toLowerCase();
  const token = request.auth.token || {};

  const projectSnap = await db().doc(`projects/${projectId}`).get();
  const projectTenant = projectSnap.exists ? (projectSnap.data()?.tenantId ?? null) : null;
  const projectInOrg = projectSnap.exists && (projectTenant === orgId || (projectTenant == null && orgId === "demo-tenant-01"));
  if (!projectInOrg) throw new HttpsError("not-found", "That project could not be found.");
  const projectName = String(projectSnap.data()?.context?.name || "").slice(0, 120) || null;

  if (token.email_verified === true && PLATFORM_OWNER_EMAILS.includes(email)) {
    return { uid, email, name: String(token.name || email), role: "Super Admin", platformOwner: true, projectName };
  }

  const profile: any = (await db().doc(`users/${uid}`).get()).data() || {};
  const role = String(profile.role || "");
  const name = String(profile.displayName || profile.name || token.name || email || "Studio");
  if (String(profile.tenantId || "") !== orgId) throw new HttpsError("permission-denied", "This project belongs to another studio.");

  if (role === "Designer") {
    const view = (await db().doc(`projects/${projectId}/designView/current`).get()).data();
    const assigned = view && view.tenantId === orgId && Array.isArray(view.designers) && view.designers.includes(email);
    if (!assigned) throw new HttpsError("permission-denied", "You are not assigned to this project.");
  } else if (!STAFF_WITH_PROJECTS.has(role)) {
    throw new HttpsError("permission-denied", "This account cannot use Design Review.");
  }
  return { uid, email, name, role, platformOwner: false, projectName };
}

const person = (a: Actor): ReviewPerson => ({ uid: a.uid, email: a.email, name: a.name });

function blankSummary(orgId: string, projectId: string, drawingId: string, name: string): ReviewSummary {
  return {
    schema: 1, orgId, projectId, drawingId, state: "DRAFT", rev: 0, audience: guessAudience(name),
    versionId: null, versionNo: 0, pdfPath: null, thumbPath: null, pageCount: null,
    openRoundId: null, attempts: 0, designer: null, submittedAt: null,
    decidedBy: null, decidedAt: null, reason: null, selfApproved: false,
    marksTotal: 0, marksOpen: 0, marksSeq: 0, updatedAt: Date.now(),
  };
}

/** A stale screen gets told, instead of acting on a sheet that moved on. */
function checkRev(summary: Partial<ReviewSummary> | undefined, expectedRev: unknown, required: boolean) {
  if (expectedRev === undefined || expectedRev === null) {
    if (required) throw new HttpsError("invalid-argument", "Refresh and try again.");
    return;
  }
  if (Number(expectedRev) !== Number(summary?.rev ?? 0)) {
    throw new HttpsError("aborted", "Someone else changed this sheet a moment ago. Refresh to see the latest.");
  }
}

function legacyPending(data: any, at: number, by: string) {
  return { roundNumber: Number(data?.currentRound) || 1, submittedAt: at, submittedBy: by };
}

/* ------------------------------------------------------------- the file */

interface CheckedFile { buffer: Buffer; size: number; sha256: string; pageCount: number | null }

async function readUpload(path: string): Promise<CheckedFile> {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("not-found", "The upload did not arrive. Try again.");
  const [meta] = await file.getMetadata();
  const size = Number(meta.size || 0);
  if (size <= 0) throw new HttpsError("invalid-argument", "That file is empty.");
  if (size > MAX_PDF_BYTES) throw new HttpsError("invalid-argument", "That PDF is over 25 MB. Export it smaller and try again.");
  const [buffer] = await file.download();
  /* What the file is, from its bytes: a renamed image or document is refused here, whatever its name says. */
  if (buffer.subarray(0, 1024).indexOf("%PDF-") < 0) throw new HttpsError("invalid-argument", "That file is not a PDF.");
  if (buffer.indexOf("/Encrypt") >= 0) throw new HttpsError("invalid-argument", "That PDF is password-protected. Export it without a password.");
  const pages = buffer.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g);
  return { buffer, size, sha256: createHash("sha256").update(buffer).digest("hex"), pageCount: pages ? pages.length : null };
}

async function readThumb(path: string): Promise<boolean> {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return false;
  const [meta] = await file.getMetadata();
  if (Number(meta.size || 0) > MAX_THUMB_BYTES) return false;
  const [head] = await file.download({ start: 0, end: 7 });
  return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

/* ------------------------------------------------------------- actions */

type Input = Record<string, any>;

async function finalize(actor: Actor, orgId: string, projectId: string, drawingId: string, input: Input) {
  if (!canUpload(actor.role)) throw new HttpsError("permission-denied", "This account cannot upload drawings.");
  const prefix = uploadPrefix(orgId, projectId, drawingId, actor.uid);
  const uploadPath = String(input.uploadPath || "");
  const thumbIn = input.thumbPath ? String(input.thumbPath) : null;
  if (!uploadPath.startsWith(prefix) || uploadPath.includes("..") || !/\.pdf$/i.test(uploadPath)) {
    throw new HttpsError("invalid-argument", "That upload is not in this drawing's folder.");
  }
  if (thumbIn && (!thumbIn.startsWith(prefix) || thumbIn.includes("..") || !/\.png$/i.test(thumbIn))) {
    throw new HttpsError("invalid-argument", "That preview is not in this drawing's folder.");
  }

  const drawingRef = db().doc(`organizations/${orgId}/projects/${projectId}/drawingTracker/${drawingId}`);

  /* Retried after a timeout: the first call already made the version. */
  const earlier = await drawingRef.collection("reviewVersions").where("source", "==", uploadPath).limit(1).get();
  if (!earlier.empty) {
    const v = earlier.docs[0].data() as ReviewVersion;
    const now = (await drawingRef.get()).data()?.review;
    return { versionId: v.id, versionNo: v.n, review: now, repeated: true };
  }

  const checked = await readUpload(uploadPath);
  const versionId = `v${Date.now().toString(36)}_${checked.sha256.slice(0, 10)}`;
  const finalPdf = `${versionsPrefix(orgId, projectId, drawingId)}${versionId}.pdf`;
  const finalThumb = thumbIn && (await readThumb(thumbIn)) ? `${versionsPrefix(orgId, projectId, drawingId)}${versionId}.png` : null;

  /*
    Storage and Firestore share no transaction. So the file is copied to its
    final, browser-proof place first, then the version is recorded; if the
    record fails, the copy is removed again. A version is never recorded
    without its file.
  */
  await bucket().file(uploadPath).copy(bucket().file(finalPdf));
  if (finalThumb && thumbIn) await bucket().file(thumbIn).copy(bucket().file(finalThumb));

  const now = Date.now();
  const note = cleanText(input.note, 500);
  const fileName = cleanText(input.fileName, 160) || "drawing.pdf";
  let result: any;
  try {
    result = await db().runTransaction(async (tx) => {
      const snap = await tx.get(drawingRef);
      if (!snap.exists) throw new HttpsError("not-found", "That drawing is no longer in the tracker.");
      const data = snap.data() || {};
      const prev: ReviewSummary | undefined = data.review;
      if (!allowed("finalize", prev)) throw new HttpsError("failed-precondition", refusal("finalize", prev));
      checkRev(prev, input.expectedRev, false);

      /* Notes the designer ticked off on the last version now point at the version that fixes them. */
      const prevMarks = prev?.versionId
        ? await tx.get(drawingRef.collection("reviewMarks").where("versionId", "==", prev.versionId))
        : null;

      const base = prev && prev.versionNo !== undefined ? prev : blankSummary(orgId, projectId, drawingId, data.name || "");
      const n = (base.versionNo || 0) + 1;
      const version: ReviewVersion = {
        id: versionId, n, pdfPath: finalPdf, thumbPath: finalThumb, fileName, size: checked.size,
        sha256: checked.sha256, pageCount: checked.pageCount, note, by: person(actor), at: now, source: uploadPath,
      };
      const next: ReviewSummary = {
        ...blankSummary(orgId, projectId, drawingId, data.name || ""),
        ...base,
        schema: 1, orgId, projectId, drawingId, projectName: actor.projectName,
        audience: base.audience || guessAudience(data.name || ""),
        state: "DRAFT", rev: (base.rev || 0) + 1,
        versionId, versionNo: n, pdfPath: finalPdf, thumbPath: finalThumb, pageCount: checked.pageCount,
        openRoundId: null, designer: person(actor), submittedAt: null,
        decidedBy: null, decidedAt: null, reason: null, selfApproved: false,
        marksTotal: 0, marksOpen: 0, marksSeq: 0, updatedAt: now,
      };
      const events: ReviewEvent[] = [{ type: "uploaded", at: now, by: person(actor), versionNo: n, text: note || fileName }];
      const patch: any = {};

      if (input.submit === true) {
        const roundRef = drawingRef.collection("reviewRounds").doc();
        const attempt = (base.attempts || 0) + 1;
        const round: ReviewRound = { id: roundRef.id, attempt, versionId, versionNo: n, submittedBy: person(actor), submittedAt: now, status: "OPEN" };
        tx.set(roundRef, round);
        Object.assign(next, { state: "IN_REVIEW", openRoundId: roundRef.id, attempts: attempt, submittedAt: now });
        events.push({ type: "submitted", at: now, by: person(actor), versionNo: n, roundId: roundRef.id, text: note });
        patch.pendingReview = legacyPending(data, now, actor.name);
      }

      prevMarks?.docs.forEach((m) => {
        if (m.data().status === "FIXED") tx.update(m.ref, { fixedInVersionNo: n });
      });
      tx.set(drawingRef.collection("reviewVersions").doc(versionId), version);
      tx.update(drawingRef, { ...patch, review: next });
      events.forEach((e) => tx.set(drawingRef.collection("reviewEvents").doc(), e));
      return { versionId, versionNo: n, review: next };
    });
  } catch (e) {
    await bucket().file(finalPdf).delete().catch(() => undefined);
    if (finalThumb) await bucket().file(finalThumb).delete().catch(() => undefined);
    throw e;
  }
  await bucket().file(uploadPath).delete().catch(() => undefined);
  if (thumbIn) await bucket().file(thumbIn).delete().catch(() => undefined);
  return result;
}

async function submit(actor: Actor, drawingRef: FirebaseFirestore.DocumentReference, input: Input) {
  if (!canUpload(actor.role)) throw new HttpsError("permission-denied", "This account cannot send drawings for review.");
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(drawingRef);
    if (!snap.exists) throw new HttpsError("not-found", "That drawing is no longer in the tracker.");
    const data = snap.data() || {};
    const s: ReviewSummary | undefined = data.review;
    if (!allowed("submit", s) || !s?.versionId) throw new HttpsError("failed-precondition", refusal("submit", s));
    checkRev(s, input.expectedRev, false);
    const now = Date.now();
    const roundRef = drawingRef.collection("reviewRounds").doc();
    const attempt = (s.attempts || 0) + 1;
    const note = cleanText(input.note, 500);
    tx.set(roundRef, { id: roundRef.id, attempt, versionId: s.versionId, versionNo: s.versionNo, submittedBy: person(actor), submittedAt: now, status: "OPEN" } as ReviewRound);
    const next: ReviewSummary = { ...s, projectName: actor.projectName ?? s.projectName ?? null, state: "IN_REVIEW", rev: s.rev + 1, openRoundId: roundRef.id, attempts: attempt, submittedAt: now, updatedAt: now };
    tx.update(drawingRef, { review: next, pendingReview: legacyPending(data, now, actor.name) });
    tx.set(drawingRef.collection("reviewEvents").doc(), { type: "submitted", at: now, by: person(actor), versionNo: s.versionNo, roundId: roundRef.id, text: note } as ReviewEvent);
    return { review: next };
  });
}

async function withdraw(actor: Actor, drawingRef: FirebaseFirestore.DocumentReference, input: Input) {
  if (!canUpload(actor.role)) throw new HttpsError("permission-denied", "This account cannot pull drawings back.");
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(drawingRef);
    const s: ReviewSummary | undefined = snap.data()?.review;
    if (!allowed("withdraw", s) || !s?.openRoundId) throw new HttpsError("failed-precondition", refusal("withdraw", s));
    checkRev(s, input.expectedRev, false);
    const now = Date.now();
    tx.update(drawingRef.collection("reviewRounds").doc(s.openRoundId), { status: "WITHDRAWN", decidedBy: person(actor), decidedAt: now });
    const next: ReviewSummary = { ...s, state: "DRAFT", rev: s.rev + 1, openRoundId: null, submittedAt: null, updatedAt: now };
    tx.update(drawingRef, { review: next, pendingReview: null });
    tx.set(drawingRef.collection("reviewEvents").doc(), { type: "withdrawn", at: now, by: person(actor), versionNo: s.versionNo, roundId: s.openRoundId } as ReviewEvent);
    return { review: next };
  });
}

async function decide(actor: Actor, drawingRef: FirebaseFirestore.DocumentReference, input: Input, kind: "approve" | "return") {
  if (!canReview(actor.role)) throw new HttpsError("permission-denied", "Only the Design Head can approve or return a sheet.");
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(drawingRef);
    if (!snap.exists) throw new HttpsError("not-found", "That drawing is no longer in the tracker.");
    const s: ReviewSummary | undefined = snap.data()?.review;
    if (!allowed(kind, s) || !s?.openRoundId) throw new HttpsError("failed-precondition", refusal(kind, s));
    checkRev(s, input.expectedRev, true);
    const marks = await tx.get(drawingRef.collection("reviewMarks").where("versionId", "==", s.versionId));
    const open = marks.docs.map((d) => d.data() as ReviewMark).filter((m) => m.status === "OPEN");
    const reason = cleanText(input.reason, 1000);
    if (kind === "approve" && open.some((m) => m.blocking)) {
      throw new HttpsError("failed-precondition", "Some notes are marked must-fix. Untick them or return the sheet.");
    }
    if (kind === "return" && !reason && marks.empty) {
      throw new HttpsError("invalid-argument", "Mark the sheet or write a line before returning it.");
    }
    const now = Date.now();
    const selfApproved = !!s.designer && s.designer.email === actor.email;
    tx.update(drawingRef.collection("reviewRounds").doc(s.openRoundId), {
      status: kind === "approve" ? "APPROVED" : "CHANGES_REQUESTED",
      decidedBy: person(actor), decidedAt: now, reason: reason || null, selfApproved,
    });
    const next: ReviewSummary = {
      ...s, state: kind === "approve" ? "APPROVED" : "CHANGES_REQUESTED", rev: s.rev + 1, openRoundId: null,
      decidedBy: person(actor), decidedAt: now, reason: reason || null, selfApproved: kind === "approve" && selfApproved, updatedAt: now,
    };
    tx.update(drawingRef, { review: next, pendingReview: null });
    tx.set(drawingRef.collection("reviewEvents").doc(), {
      type: kind === "approve" ? "approved" : "returned", at: now, by: person(actor), versionNo: s.versionNo, roundId: s.openRoundId,
      text: kind === "approve" ? (selfApproved ? "Self-approved" : reason) : reason || `${marks.size} note${marks.size === 1 ? "" : "s"} on the sheet`,
    } as ReviewEvent);
    return { review: next };
  });
}

async function mark(actor: Actor, drawingRef: FirebaseFirestore.DocumentReference, input: Input) {
  const op = String(input.op || "");
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(drawingRef);
    if (!snap.exists) throw new HttpsError("not-found", "That drawing is no longer in the tracker.");
    const s: ReviewSummary | undefined = snap.data()?.review;
    if (!s?.versionId) throw new HttpsError("failed-precondition", "There is no sheet to mark yet.");
    const now = Date.now();

    if (op === "create") {
      if (!canReview(actor.role)) throw new HttpsError("permission-denied", "Only the Design Head marks sheets.");
      if (s.state !== "IN_REVIEW") throw new HttpsError("failed-precondition", "Notes go on a sheet while it is being reviewed.");
      const shape = cleanShape(input.shape);
      const text = cleanText(input.text);
      const page = Math.max(0, Math.min(500, Math.floor(Number(input.page) || 0)));
      if (!shape) throw new HttpsError("invalid-argument", "That mark is not on the sheet.");
      if (!text) throw new HttpsError("invalid-argument", "Write what should change.");
      const ref = drawingRef.collection("reviewMarks").doc();
      const n = (s.marksSeq || 0) + 1;
      const m: ReviewMark = { id: ref.id, versionId: s.versionId, n, page, shape, text, blocking: input.blocking === true, status: "OPEN", by: person(actor), at: now, updatedAt: now };
      tx.set(ref, { ...m, shape: storeShape(m.shape) });
      tx.update(drawingRef, { review: { ...s, marksSeq: n, marksTotal: (s.marksTotal || 0) + 1, marksOpen: (s.marksOpen || 0) + 1, updatedAt: now } });
      return { mark: m };
    }

    if (!safeId(input.markId)) throw new HttpsError("invalid-argument", "Which note?");
    const ref = drawingRef.collection("reviewMarks").doc(input.markId);
    const ms = await tx.get(ref);
    if (!ms.exists) throw new HttpsError("not-found", "That note is gone.");
    const m = ms.data() as ReviewMark;
    if (m.versionId !== s.versionId) throw new HttpsError("failed-precondition", "That note is on an older version.");

    if (op === "update" || op === "delete") {
      if (!canReview(actor.role)) throw new HttpsError("permission-denied", "Only the Design Head changes notes.");
      if (s.state !== "IN_REVIEW") throw new HttpsError("failed-precondition", "Notes can only be changed while the sheet is being reviewed.");
      if (op === "delete") {
        tx.delete(ref);
        tx.update(drawingRef, { review: { ...s, marksTotal: Math.max(0, (s.marksTotal || 0) - 1), marksOpen: Math.max(0, (s.marksOpen || 0) - (m.status === "OPEN" ? 1 : 0)), updatedAt: now } });
        return { deleted: m.id };
      }
      const patch: any = { updatedAt: now };
      if (input.text !== undefined) {
        const text = cleanText(input.text);
        if (!text) throw new HttpsError("invalid-argument", "Write what should change.");
        patch.text = text;
      }
      if (input.blocking !== undefined) patch.blocking = input.blocking === true;
      if (input.shape !== undefined) {
        const shape = cleanShape(input.shape);
        if (!shape) throw new HttpsError("invalid-argument", "That mark is not on the sheet.");
        patch.shape = storeShape(shape);
      }
      tx.update(ref, patch);
      return { mark: { ...m, ...patch } };
    }

    if (op === "fix" || op === "unfix") {
      if (!canUpload(actor.role)) throw new HttpsError("permission-denied", "This account cannot tick off notes.");
      if (s.state !== "CHANGES_REQUESTED") throw new HttpsError("failed-precondition", "Notes are ticked off after the sheet comes back.");
      const fixed = op === "fix";
      if ((m.status === "FIXED") === fixed) return { mark: m };
      tx.update(ref, { status: fixed ? "FIXED" : "OPEN", fixedBy: fixed ? person(actor) : null, fixedAt: fixed ? now : null, updatedAt: now });
      tx.update(drawingRef, { review: { ...s, marksOpen: Math.max(0, (s.marksOpen || 0) + (fixed ? -1 : 1)), updatedAt: now } });
      return { mark: { ...m, status: fixed ? "FIXED" : "OPEN" } };
    }
    throw new HttpsError("invalid-argument", "Unknown note action.");
  });
}

/*
  Taking back a wrong upload.

  Only a version nobody has reviewed: still on the desk, or pulled back before
  the Design Head decided, and without her notes on it. Anything reviewed is
  history and stays. The sheet returns to the version before, in the state
  that version was left in, or to having no sheet at all.
*/
async function removeVersion(actor: Actor, drawingRef: FirebaseFirestore.DocumentReference, input: Input) {
  if (!canUpload(actor.role)) throw new HttpsError("permission-denied", "This account cannot remove drawings.");
  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(drawingRef);
    if (!snap.exists) throw new HttpsError("not-found", "That drawing is no longer in the tracker.");
    const s: ReviewSummary | undefined = snap.data()?.review;
    if (!s?.versionId || !allowed("remove", s)) {
      throw new HttpsError("failed-precondition", s?.state === "IN_REVIEW"
        ? "This PDF is with the Design Head. Pull it back first, then remove it."
        : "Only a PDF that has not been reviewed can be removed. Reviewed versions stay in the history.");
    }
    checkRev(s, input.expectedRev, true);
    if (input.versionId && input.versionId !== s.versionId) throw new HttpsError("aborted", "A newer PDF arrived a moment ago. Refresh to see it.");

    const verRef = drawingRef.collection("reviewVersions").doc(s.versionId);
    const verSnap = await tx.get(verRef);
    if (!verSnap.exists) throw new HttpsError("not-found", "That version is already gone.");
    const v = verSnap.data() as ReviewVersion;
    if (v.by?.uid !== actor.uid && !canSetAudience(actor.role)) {
      throw new HttpsError("permission-denied", "Only the person who uploaded this PDF, or the Design Head, can remove it.");
    }
    const roundsHere = await tx.get(drawingRef.collection("reviewRounds").where("versionId", "==", s.versionId));
    if (roundsHere.docs.some((r) => ["APPROVED", "CHANGES_REQUESTED"].includes(r.data().status))) {
      throw new HttpsError("failed-precondition", "This version has been reviewed, so it stays in the history.");
    }
    const marksHere = await tx.get(drawingRef.collection("reviewMarks").where("versionId", "==", s.versionId).limit(1));
    if (!marksHere.empty) throw new HttpsError("failed-precondition", "The Design Head has left notes on this version, so it stays in the history.");

    const before = await tx.get(drawingRef.collection("reviewVersions").where("n", "<", v.n).orderBy("n", "desc").limit(1));
    const prev = before.empty ? null : (before.docs[0].data() as ReviewVersion);
    const prevRounds = prev ? await tx.get(drawingRef.collection("reviewRounds").where("versionId", "==", prev.id)) : null;
    const prevMarks = prev ? await tx.get(drawingRef.collection("reviewMarks").where("versionId", "==", prev.id)) : null;

    const now = Date.now();
    let next: any;
    if (!prev) {
      next = {
        ...s, versionId: null, versionNo: 0, pdfPath: null, thumbPath: null, pageCount: null, openRoundId: null,
        submittedAt: null, decidedBy: null, decidedAt: null, reason: null, selfApproved: false,
        marksTotal: 0, marksOpen: 0, marksSeq: 0, rev: s.rev + 1, updatedAt: now,
      };
      delete next.state;
    } else {
      const decided = (prevRounds?.docs.map((d) => d.data() as ReviewRound) || [])
        .filter((r) => r.status === "APPROVED" || r.status === "CHANGES_REQUESTED")
        .sort((a, b) => b.attempt - a.attempt)[0];
      const marks = prevMarks?.docs.map((d) => d.data() as ReviewMark) || [];
      next = {
        ...s,
        state: decided?.status === "APPROVED" ? "APPROVED" : decided?.status === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "DRAFT",
        versionId: prev.id, versionNo: prev.n, pdfPath: prev.pdfPath, thumbPath: prev.thumbPath, pageCount: prev.pageCount,
        openRoundId: null, submittedAt: null,
        decidedBy: decided?.decidedBy || null, decidedAt: decided?.decidedAt || null, reason: decided?.reason || null,
        selfApproved: decided?.status === "APPROVED" && !!decided?.selfApproved,
        marksTotal: marks.length, marksOpen: marks.filter((m) => m.status === "OPEN").length,
        marksSeq: marks.reduce((mx, m) => Math.max(mx, m.n || 0), 0),
        rev: s.rev + 1, updatedAt: now,
      };
      prevMarks?.docs.forEach((d) => {
        if (d.data().fixedInVersionNo === v.n) tx.update(d.ref, { fixedInVersionNo: admin.firestore.FieldValue.delete() });
      });
    }
    tx.delete(verRef);
    tx.update(drawingRef, { review: next });
    tx.set(drawingRef.collection("reviewEvents").doc(), { type: "removed", at: now, by: person(actor), versionNo: v.n, text: v.fileName } as ReviewEvent);
    return { review: next, files: [v.pdfPath, v.thumbPath].filter(Boolean) as string[] };
  });
  /* The file goes after the record: a failed delete leaves an unreferenced object, never a record without its file. */
  for (const f of result.files) await bucket().file(f).delete().catch(() => undefined);
  return { review: result.review };
}

async function setAudience(actor: Actor, orgId: string, projectId: string, drawingId: string, drawingRef: FirebaseFirestore.DocumentReference, input: Input) {
  if (!canSetAudience(actor.role)) throw new HttpsError("permission-denied", "Only the Design Head or the studio's leads decide who a drawing is for.");
  const audience = input.audience === "studio" ? "studio" : input.audience === "client" ? "client" : null;
  if (!audience) throw new HttpsError("invalid-argument", "Client or studio?");
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(drawingRef);
    if (!snap.exists) throw new HttpsError("not-found", "That drawing is no longer in the tracker.");
    const now = Date.now();
    /* No review yet: keep the choice without inventing a state (Firestore refuses undefined values). */
    const fresh: any = blankSummary(orgId, projectId, drawingId, snap.data()?.name || "");
    delete fresh.state;
    const s: ReviewSummary = snap.data()?.review || fresh;
    const next = { ...s, audience, updatedAt: now };
    tx.update(drawingRef, { review: next });
    tx.set(drawingRef.collection("reviewEvents").doc(), { type: "audience", at: now, by: person(actor), text: audience === "client" ? "Shown to the client" : "Studio only" } as ReviewEvent);
    return { review: next };
  });
}

/* --------------------------------------------------------- the callable */

export const drawingReview = onCall({ cors: true, memory: "1GiB", timeoutSeconds: 120 }, async (request) => {
  const input: Input = request.data || {};
  const { orgId, projectId, drawingId, action } = input;
  if (![orgId, projectId, drawingId].every(safeId)) throw new HttpsError("invalid-argument", "Which drawing?");
  try {
    const actor = await resolveActor(request, orgId, projectId);
    const drawingRef = db().doc(`organizations/${orgId}/projects/${projectId}/drawingTracker/${drawingId}`);
    switch (action) {
      /* Asked before an upload starts, so a refusal is explained before any bytes move. */
      case "check": {
        if (!canUpload(actor.role)) throw new HttpsError("permission-denied", "This account cannot upload drawings.");
        const snap = await drawingRef.get();
        if (!snap.exists) throw new HttpsError("not-found", "That drawing is no longer in the tracker.");
        if (!allowed("finalize", snap.data()?.review)) throw new HttpsError("failed-precondition", refusal("finalize", snap.data()?.review));
        return { ok: true };
      }
      case "finalize": return await finalize(actor, orgId, projectId, drawingId, input);
      case "submit": return await submit(actor, drawingRef, input);
      case "withdraw": return await withdraw(actor, drawingRef, input);
      case "approve": return await decide(actor, drawingRef, input, "approve");
      case "return": return await decide(actor, drawingRef, input, "return");
      case "mark": return await mark(actor, drawingRef, input);
      case "audience": return await setAudience(actor, orgId, projectId, drawingId, drawingRef, input);
      case "remove": return await removeVersion(actor, drawingRef, input);
      default: throw new HttpsError("invalid-argument", "Unknown action.");
    }
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    logger.error("drawingReview failed", { action, orgId, projectId, drawingId, message: e?.message, stack: e?.stack });
    throw new HttpsError("internal", "Something went wrong on our side. Try again in a moment.");
  }
});
