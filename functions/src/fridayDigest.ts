import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as pako from "pako";
import { requireStaff, rateLimiter } from "./guards";
import { sendMail } from "./mail";
import { storedProject as stored } from "./designViewStrip";
import { isTeamViewMember } from "./teamView";
import { digestEmail, digestRecipients } from "../../lib/fridayDigest";

/*
  THE FRIDAY DIGEST, BY EMAIL (lib/fridayDigest.ts).

  Sends one client's weekly update from the studio's address, and only one a
  lead has approved: the approval is checked here again, whatever the screen
  says. It goes to the client's own addresses on the project, with replies to
  the person who sent it, and is then marked sent and logged on the client's
  follow-up log. Client Relations may send only on the projects assigned to
  them; the studio's leads and senior staff on any project of their studio.

  Needs the same secrets as the studio's other mail:
    firebase functions:secrets:set RESEND_API_KEY
    firebase functions:secrets:set EMAIL_FROM
*/

const db = () => admin.firestore();
const SENDERS = new Set(["Super Admin", "Owner", "Admin", "Ops Director", "Design Head", "Client Relations"]);
const underLimit = rateLimiter(80, 10 * 60 * 1000);
const storedProject = (data: any) => stored(data, (b64) => Buffer.from(pako.inflate(Buffer.from(b64, "base64"))).toString("utf-8"));

export const sendFridayDigest = onCall({ secrets: ["RESEND_API_KEY", "EMAIL_FROM"], cors: true, timeoutSeconds: 30 }, async (request) => {
  const staff = await requireStaff(request, SENDERS);
  if (!underLimit(staff.uid)) throw new HttpsError("resource-exhausted", "Too many emails at once. Try again in a few minutes.");
  const projectId = String(request.data?.projectId || "");
  const week = String(request.data?.week || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId) || !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new HttpsError("invalid-argument", "Which project and week?");

  const snap = await db().doc(`projects/${projectId}`).get();
  const project = snap.exists ? storedProject(snap.data()) : null;
  const tenantId = project?.tenantId || snap.data()?.tenantId || null;
  if (!project || !tenantId || (!staff.platformOwner && staff.tenantId !== tenantId)) throw new HttpsError("not-found", "That project could not be found.");
  if (staff.role === "Client Relations" && !(await isTeamViewMember(projectId, tenantId, staff.email, "ops"))) {
    throw new HttpsError("permission-denied", "This project is not assigned to you.");
  }

  const ref = db().doc(`projects/${projectId}/digests/${week}`);
  const digest = (await ref.get()).data();
  if (!digest || digest.tenantId !== tenantId) throw new HttpsError("not-found", "There is no update for that week.");
  if (digest.status === "sent") throw new HttpsError("already-exists", "This update was already sent.");
  if (digest.status !== "approved") throw new HttpsError("failed-precondition", "A lead approves the update before it can be sent.");

  const to = digestRecipients(project.context || {});
  if (!to.length) throw new HttpsError("failed-precondition", "The client has no email address on the project.");
  const org = (await db().doc(`organizations/${tenantId}`).get()).data() || {};
  const studio = String(org.orgName || "").slice(0, 80);
  const mail = digestEmail({ subject: String(digest.subject || ""), body: String(digest.body || ""), photos: Array.isArray(digest.photos) ? digest.photos : [] }, studio);
  const sent = await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: staff.email, fromName: studio || null });

  const now = Date.now();
  await ref.update({ status: "sent", sentAt: now, sentBy: staff.email, sentVia: "email", updatedAt: now });
  const name = String((Array.isArray(org.team) ? org.team : []).find((m: any) => String(m?.email || "").toLowerCase() === staff.email)?.name || staff.email);
  await db().collection(`projects/${projectId}/followUps`).add({
    tenantId, projectId, projectName: String(digest.projectName || project.context?.name || ""), at: now, by: staff.email, byName: name,
    channel: "email", note: `Friday update for the week of ${week} emailed to ${to.join(", ")}.`.slice(0, 2000), subject: null,
    outcome: "info", next: null, nextDone: false, manual: true,
  });
  logger.info("sendFridayDigest", { projectId, week, by: staff.email, recipients: to.length, sandbox: !!sent.sandbox });
  return { sent: true, sandbox: !!sent.sandbox, to };
});
