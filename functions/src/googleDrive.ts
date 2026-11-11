import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { randomBytes } from "crypto";
import { requireStaff } from "./guards";
import { landscapePdf } from "../../lib/pdfLandscape";
import {
  DRIVE_SCOPE, ROOT_FOLDER, FOLDER_MIME, DRIVE_ADMIN_ROLES, callbackUrl, folderLink, projectFolderName, drawingFileName,
  type DriveStatus,
} from "../../lib/googleDrive";
import { safeId, projectNameOf, canRunMeeting, canSetAudience } from "../../lib/drawingReview";
import { sendsApprovals } from "../../lib/designMeeting";
import { resolveActor } from "./drawingReview";

/*
  GOOGLE DRIVE, ON THE SERVER (lib/googleDrive says what and why).

  - googleDrive (callable): the connection's status, starting the
    connection, disconnecting, a project's folder link, and uploading the
    approved drawings operations picked into the project's folder.
  - driveOAuthCallback (https): where Google sends the studio back after it
    allows the app. Swaps the one-time code for a refresh token.

  Nothing is copied by itself: a drawing reaches Drive only when someone
  picks it in the approval email's form and uploads it.

  The refresh token lives in driveConnections/{tenantId}, which no browser can
  read (firestore.rules), like the Zoho Books token. Needs, once:

    firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
    firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
*/

const SECRETS = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"];
const db = () => admin.firestore();
const conn = (tenantId: string) => db().doc(`driveConnections/${tenantId}`);
const projectIdOf = () => String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "");
const redirectUri = () => callbackUrl(projectIdOf());
const STATE_TTL = 15 * 60 * 1000;

function clientCreds() {
  const id = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const secret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!id || !secret) throw new HttpsError("failed-precondition", "Google Drive is not set up for this app yet. Add the OAuth client ID and secret first.");
  return { id, secret };
}

/** Where the studio may be sent back to: the app's own address, never anywhere else. */
function cleanReturn(raw: unknown): string | null {
  try {
    const u = new URL(String(raw || ""));
    const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    return u.protocol === "https:" || local ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

async function form(url: string, body: Record<string, string>) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** A short-lived access token from the stored refresh token. A revoked one disconnects the studio and says so. */
async function accessToken(tenantId: string): Promise<string | null> {
  const snap = await conn(tenantId).get();
  const refresh = snap.data()?.refreshToken;
  if (!refresh) return null;
  const { id, secret } = clientCreds();
  const { ok, data } = await form("https://oauth2.googleapis.com/token", { client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" });
  if (ok && data.access_token) return String(data.access_token);
  if (data?.error === "invalid_grant") {
    await conn(tenantId).set({ refreshToken: admin.firestore.FieldValue.delete(), lastError: { at: Date.now(), message: "Google Drive was disconnected (the access was removed in Google). Connect it again in Studio settings." } }, { merge: true });
    return null;
  }
  throw new Error(`Google refused the token refresh: ${data?.error || "unknown"}`);
}

async function drive(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || `Drive error ${res.status}`), { status: res.status });
  return data;
}

/** A folder the app made, still there and not in the bin. */
async function stillThere(token: string, id: string | undefined | null): Promise<boolean> {
  if (!id) return false;
  try {
    const f = await drive(token, `files/${encodeURIComponent(id)}?fields=id,trashed`);
    return !!f.id && !f.trashed;
  } catch {
    return false;
  }
}

async function makeFolder(token: string, name: string, parent: string | null): Promise<string> {
  const f = await drive(token, "files?fields=id", { method: "POST", body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }) });
  return String(f.id);
}

/** The project's folder (Studio Desk / <Project>), made and shared with "anyone with the link can view" the first time. */
async function projectFolder(tenantId: string, token: string, projectId: string): Promise<{ id: string; link: string }> {
  const data = (await conn(tenantId).get()).data() || {};
  let root: string = data.rootFolderId;
  if (!(await stillThere(token, root))) {
    root = await makeFolder(token, ROOT_FOLDER, null);
    await conn(tenantId).set({ rootFolderId: root }, { merge: true });
  }
  const name = projectFolderName(projectNameOf((await db().doc(`projects/${projectId}`).get()).data()));
  const known = data.projects?.[projectId];
  if (known?.folderId && (await stillThere(token, known.folderId))) {
    /* Named before the project's name was read right (or the project was renamed): the folder follows. */
    if (known.name !== name) {
      await drive(token, `files/${encodeURIComponent(known.folderId)}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await conn(tenantId).set({ projects: { [projectId]: { name } } }, { merge: true });
    }
    return { id: known.folderId, link: known.link || folderLink(known.folderId) };
  }
  const id = await makeFolder(token, name, root);
  await drive(token, `files/${encodeURIComponent(id)}/permissions?sendNotificationEmail=false`, { method: "POST", body: JSON.stringify({ type: "anyone", role: "reader" }) });
  const link = folderLink(id);
  await conn(tenantId).set({ projects: { [projectId]: { folderId: id, link, name } } }, { merge: true });
  return { id, link };
}

/** A PDF into a folder, by Drive's resumable upload (drawings run to 25 MB). */
async function uploadPdf(token: string, folderId: string, name: string, bytes: Uint8Array): Promise<{ id: string; link: string | null }> {
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/pdf", "X-Upload-Content-Length": String(bytes.length) },
    body: JSON.stringify({ name, parents: [folderId], mimeType: "application/pdf" }),
  });
  const session = start.headers.get("location");
  if (!start.ok || !session) throw new Error(`Drive did not start the upload (${start.status})`);
  const put = await fetch(session, { method: "PUT", headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.length) }, body: Buffer.from(bytes) });
  const out: any = await put.json().catch(() => ({}));
  if (!put.ok || !out.id) throw new Error(out?.error?.message || `Drive upload failed (${put.status})`);
  return { id: String(out.id), link: out.webViewLink || null };
}

function statusOf(data: any): DriveStatus {
  return {
    connected: !!data?.refreshToken, email: data?.email || null, connectedAt: data?.connectedAt || null,
    connectedBy: data?.connectedByName || null, lastError: data?.lastError || null,
  };
}

/*
  One approved client drawing into its project's folder, landscape, once per
  version: a record under driveConnections/{tenant}/files claims it first, so
  a drawing ticked twice is not copied twice. Says what happened to it. A failure is recorded (and shown in Studio
  settings), and a later run tries again.
*/
type CopyResult = "copied" | "already" | "not-approved" | "studio" | "failed";
async function copyDrawing(orgId: string, token: string, projectId: string, drawingId: string, d: any): Promise<CopyResult> {
  const review = d?.review;
  if (!review || review.state !== "APPROVED" || !review.pdfPath || !review.versionId) return "not-approved";
  if ((review.audience || "client") !== "client") return "studio";
  const record = conn(orgId).collection("files").doc(`${projectId}_${drawingId}_${review.versionId}`.slice(0, 400));
  const claimed = await db().runTransaction(async (tx) => {
    const r = await tx.get(record);
    if (r.exists && r.data()?.status !== "failed") return false;
    tx.set(record, { status: "copying", projectId, drawingId, versionNo: review.versionNo, at: Date.now() });
    return true;
  });
  if (!claimed) return "already";
  try {
    const [bytes] = await admin.storage().bucket().file(review.pdfPath).download();
    const { bytes: landscape } = await landscapePdf(new Uint8Array(bytes));
    const folder = await projectFolder(orgId, token, projectId);
    const file = await uploadPdf(token, folder.id, drawingFileName(d.roomName, String(d.name || "Drawing"), review.versionNo), landscape);
    await record.set({ status: "copied", fileId: file.id, link: file.link, folderLink: folder.link, at: Date.now() }, { merge: true });
    logger.info("Approved drawing copied to Drive", { orgId, projectId, drawingId, versionNo: review.versionNo });
    return "copied";
  } catch (e: any) {
    logger.error("Copy to Drive failed", { orgId, projectId, drawingId, message: e?.message });
    await record.set({ status: "failed", error: String(e?.message || "").slice(0, 300) }, { merge: true });
    await conn(orgId).set({ lastError: { at: Date.now(), message: `${String(d?.name || "A drawing")}: ${String(e?.message || "could not be copied").slice(0, 240)}` } }, { merge: true });
    return "failed";
  }
}

/* ---------------------------------------------------------------- the callable */

export const googleDrive = onCall({ cors: true, secrets: SECRETS, timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  const staff = await requireStaff(request);
  const input: any = request.data || {};
  const tenantId = staff.platformOwner ? String(input.tenantId || "") : String(staff.tenantId || "");
  if (!safeId(tenantId)) throw new HttpsError("invalid-argument", "Which studio?");
  const lead = staff.platformOwner || DRIVE_ADMIN_ROLES.has(staff.role);

  switch (input.action) {
    case "status":
      return statusOf((await conn(tenantId).get()).data());

    case "start": {
      if (!lead) throw new HttpsError("permission-denied", "Only the studio's Owner or an Admin connects Google Drive.");
      const back = cleanReturn(input.returnTo);
      if (!back) throw new HttpsError("invalid-argument", "Open this from the app to connect.");
      const { id } = clientCreds();
      const state = `${tenantId}.${randomBytes(24).toString("hex")}`;
      const name = String(request.auth?.token?.name || staff.email);
      await conn(tenantId).set({ pending: { state, uid: staff.uid, name, at: Date.now(), returnTo: back } }, { merge: true });
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: id, redirect_uri: redirectUri(), response_type: "code", scope: DRIVE_SCOPE,
        access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
      }).toString();
      return { url: url.toString() };
    }

    case "disconnect": {
      if (!lead) throw new HttpsError("permission-denied", "Only the studio's Owner or an Admin disconnects Google Drive.");
      const refresh = (await conn(tenantId).get()).data()?.refreshToken;
      if (refresh) await form("https://oauth2.googleapis.com/revoke", { token: refresh }).catch(() => undefined);
      /* The folders stay in Drive and keep their links; the app just stops writing to them. */
      await conn(tenantId).set({ refreshToken: admin.firestore.FieldValue.delete(), email: null, pending: admin.firestore.FieldValue.delete(), lastError: null }, { merge: true });
      return statusOf({});
    }

    /* The project's folder link, for the approval email: made now if no drawing has been copied yet. */
    case "folder": {
      const projectId = String(input.projectId || "");
      if (!safeId(projectId)) throw new HttpsError("invalid-argument", "Which project?");
      const p = (await db().doc(`projects/${projectId}`).get()).data();
      if (!p || (p.tenantId ?? null) !== tenantId) throw new HttpsError("not-found", "That project could not be found.");
      /* Only a folder already made: nothing is created or copied until someone uploads drawings. */
      const known = (await conn(tenantId).get()).data()?.projects?.[projectId];
      return { link: known?.folderId ? known.link || folderLink(known.folderId) : null };
    }

    /*
      The drawings operations picked, into the project's folder. Only that
      project's drawings, only approved client drawings, each version once.
      Client Relations only on the projects assigned to them (resolveActor).
    */
    case "upload": {
      const projectId = String(input.projectId || "");
      if (!safeId(projectId)) throw new HttpsError("invalid-argument", "Which project?");
      const ids: string[] = Array.isArray(input.drawingIds) ? [...new Set(input.drawingIds.map((x: unknown) => String(x)))].filter(safeId).slice(0, 30) as string[] : [];
      if (!ids.length) throw new HttpsError("invalid-argument", "Tick the drawings to upload.");
      const actor = await resolveActor(request, tenantId, projectId);
      if (!sendsApprovals(actor.roles) && !canRunMeeting(actor.roles) && !canSetAudience(actor.roles)) {
        throw new HttpsError("permission-denied", "This account does not upload drawings to Drive.");
      }
      const token = await accessToken(tenantId);
      if (!token) throw new HttpsError("failed-precondition", "Google Drive is not connected. The Owner connects it in Studio settings → Google Drive.");
      const folder = await projectFolder(tenantId, token, projectId);
      const results: Record<string, CopyResult> = {};
      for (const id of ids) {
        const snap = await db().doc(`organizations/${tenantId}/projects/${projectId}/drawingTracker/${id}`).get();
        results[id] = snap.exists ? await copyDrawing(tenantId, token, projectId, id, snap.data()) : "not-approved";
      }
      return { link: folder.link, folderName: projectFolderName(actor.projectName), results };
    }

    default:
      throw new HttpsError("invalid-argument", "Unknown action.");
  }
});

/* ---------------------------------------------------------------- back from Google */

const page = (title: string, line: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
  + `<body style="font-family:Arial,sans-serif;max-width:520px;margin:64px auto;padding:0 16px;color:#17191E"><h2>${title}</h2><p>${line}</p></body>`;

export const driveOAuthCallback = onRequest({ secrets: SECRETS, timeoutSeconds: 60 }, async (req, res) => {
  const state = String(req.query.state || "");
  const code = String(req.query.code || "");
  const tenantId = state.split(".")[0];
  if (!safeId(tenantId) || state.length < 40) { res.status(400).send(page("That link is not valid", "Start again from Studio settings → Google Drive.")); return; }
  const ref = conn(tenantId);
  const pending = (await ref.get()).data()?.pending;
  if (!pending || pending.state !== state || Date.now() - Number(pending.at || 0) > STATE_TTL) {
    res.status(400).send(page("That link has expired", "Start again from Studio settings → Google Drive."));
    return;
  }
  const back = (outcome: string) => `${pending.returnTo}?drive=${outcome}`;
  if (!code) {
    await ref.set({ pending: admin.firestore.FieldValue.delete() }, { merge: true });
    res.redirect(back("cancelled"));
    return;
  }
  try {
    const { id, secret } = clientCreds();
    const { ok, data } = await form("https://oauth2.googleapis.com/token", { code, client_id: id, client_secret: secret, redirect_uri: redirectUri(), grant_type: "authorization_code" });
    if (!ok || !data.refresh_token) throw new Error(data?.error_description || data?.error || "Google did not hand over access.");
    const about = await drive(String(data.access_token), "about?fields=user(emailAddress)");
    await ref.set({
      refreshToken: String(data.refresh_token), email: String(about?.user?.emailAddress || "") || null,
      connectedAt: Date.now(), connectedBy: pending.uid, connectedByName: pending.name || null, lastError: null,
      pending: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    res.redirect(back("connected"));
  } catch (e: any) {
    logger.error("Google Drive connection failed", { tenantId, message: e?.message });
    await ref.set({ pending: admin.firestore.FieldValue.delete(), lastError: { at: Date.now(), message: String(e?.message || "Could not connect.").slice(0, 300) } }, { merge: true });
    res.redirect(back("error"));
  }
});
