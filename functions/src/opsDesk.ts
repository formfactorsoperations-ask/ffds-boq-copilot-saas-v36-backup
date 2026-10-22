import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { PLATFORM_OWNER_EMAILS } from "./guards";
import { escalationRecipientsOf, opsSettingsOf, sweepCandidates, type FollowUp } from "../../lib/opsDesk";
import { escalationDraft } from "../../lib/notify";
import { notify } from "./notify";
import { syncStudioMeetings } from "./meetingSync";

/*
  THE OPS DESK'S SERVER SIDE (lib/opsDesk.ts has the rules of it).

  An escalation is only useful if the people who decide it hear about it. So
  when one is raised -- by Client Relations, or by the daily check -- the
  studio's chosen leads (by default its Owners and Admins) get an email, and
  when a lead decides it the person who raised it gets the decision.

  The daily check raises an escalation by itself when a payment or decision
  has had enough unanswered reminders for long enough, once per episode of
  chasing (sweepCandidates).

  Mail goes through Resend with the studio-email secrets. Without a key it is
  recorded as simulated, as sendStudioEmail does.
*/

const db = () => admin.firestore();
export const SECRETS = ["RESEND_API_KEY", "EMAIL_FROM"];
const DAY = 86400000;

export async function sendMail(to: string[], subject: string, html: string): Promise<{ sandbox: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.warn("[opsDesk] RESEND_API_KEY not configured. Email simulated.", { to, subject });
    return { sandbox: true };
  }
  const from = (process.env.EMAIL_FROM || "onboarding@resend.dev").trim();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: from.includes("<") ? from : `StudioDesk <${from}>`, to: to.slice(0, 10), subject: subject.slice(0, 300), html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { sandbox: false };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function card(title: string, rows: [string, string][], footer: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0F172A">
    <h2 style="font-size:18px;margin:0 0 12px">${esc(title)}</h2>
    <table style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#64748B;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join("")}</table>
    <p style="font-size:13px;color:#64748B;margin-top:16px">${esc(footer)}</p></div>`;
}

/** Everyone assigned to a project as Client Relations, for an escalation nobody in particular raised. */
async function opsMembers(projectId: string): Promise<string[]> {
  const v = (await db().doc(`projects/${projectId}/teamView/ops`).get()).data();
  return Array.isArray(v?.members) ? v!.members : [];
}

export const onEscalationWritten = onDocumentWritten(
  { document: "projects/{projectId}/escalations/{escalationId}", secrets: SECRETS },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after) return;
    const ref = event.data!.after.ref;

    if (!before && after.status === "open") {
      const org = (await db().doc(`organizations/${after.tenantId}`).get()).data();
      const to = escalationRecipientsOf(org);
      /* In their StudioDesk first, the email after (lib/notify). */
      await notify({ tenantId: after.tenantId, projectId: String(event.params.projectId), actorEmail: after.raisedBy || null, org },
        [escalationDraft(after, "raised", { projectId: String(event.params.projectId), leads: to, projectOps: [] })]);
      if (!to.length) {
        await ref.update({ notifiedTo: [], notifiedAt: Date.now(), notifyNote: "Nobody to tell: choose people in Studio settings → Ops Desk." });
        return;
      }
      try {
        const sent = await sendMail(to, `Escalation: ${after.title} · ${after.projectName}`, card(
          after.title,
          [["Project", after.projectName], ["Category", after.category], ["Raised by", after.auto ? "The daily check" : after.raisedByName || after.raisedBy], ["Details", after.detail || "—"]],
          "Decide it on the Ops Desk in StudioDesk. Your decision goes back to whoever raised it.",
        ));
        await ref.update({ notifiedTo: to, notifiedAt: Date.now(), notifySandbox: sent.sandbox });
      } catch (e: any) {
        logger.error("[opsDesk] escalation email failed", { message: e?.message });
        await ref.update({ notifiedTo: [], notifiedAt: Date.now(), notifyNote: String(e?.message || e).slice(0, 300) });
      }
      return;
    }

    if (before?.status === "open" && after.status === "decided") {
      const to = after.auto ? await opsMembers(String(event.params.projectId)) : [String(after.raisedBy || "")].filter(Boolean);
      await notify({ tenantId: after.tenantId, projectId: String(event.params.projectId), actorEmail: after.decidedBy || null },
        [escalationDraft(after, "decided", { projectId: String(event.params.projectId), leads: [], projectOps: to })]);
      if (!to.length) return;
      try {
        await sendMail(to, `Decided: ${after.title} · ${after.projectName}`, card(
          `Decision on: ${after.title}`,
          [["Project", after.projectName], ["Decided by", after.decidedByName || after.decidedBy], ["Decision", after.decision || "—"]],
          "Act on it, then close it on the Ops Desk.",
        ));
      } catch (e: any) {
        logger.error("[opsDesk] decision email failed", { message: e?.message });
      }
    }
  },
);

/** Run the daily check for one studio. Returns how many escalations it raised. */
export async function sweepStudio(tenantId: string, now = Date.now()): Promise<number> {
  const org = (await db().doc(`organizations/${tenantId}`).get()).data();
  const settings = opsSettingsOf(org);
  const since = now - 90 * DAY;
  const snap = await db().collectionGroup("followUps").where("tenantId", "==", tenantId).where("at", ">=", since).get();
  const followUps = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FollowUp[];
  let raised = 0;
  for (const c of sweepCandidates(followUps, settings, now)) {
    const ref = db().doc(`projects/${c.projectId}/escalations/${c.escalationId}`);
    const days = Math.floor((now - (c.state.firstReminderAt || now)) / DAY);
    try {
      await ref.create({
        tenantId, projectId: c.projectId, projectName: c.projectName,
        title: `${c.subject.kind === "payment" ? "Payment" : "Decision"} unanswered: ${c.subject.label}`.slice(0, 200),
        detail: `${c.state.reminders} reminders over ${days} days with no reply from the client.`,
        category: c.subject.kind === "payment" ? "payment" : "other",
        subjectKey: c.subject.key, raisedBy: "", raisedByName: "The daily check", raisedAt: now, auto: true, status: "open",
      });
      raised++;
    } catch (e: any) {
      if (e?.code !== 6 /* ALREADY_EXISTS */) throw e;
    }
  }
  return raised;
}

/** Every morning at 9, India time. */
export const opsDeskDailyCheck = onSchedule({ schedule: "0 9 * * *", timeZone: "Asia/Kolkata" }, async () => {
  const orgs = await db().collection("organizations").get();
  let total = 0;
  let synced = 0;
  for (const o of orgs.docs) {
    try { total += await sweepStudio(o.id); } catch (e: any) { logger.error("[opsDesk] sweep failed", { tenant: o.id, message: e?.message }); }
    /* And every desk booking checked against the project's meeting log (functions/src/meetingSync.ts). */
    try { synced += await syncStudioMeetings(o.id); } catch (e: any) { logger.error("[opsDesk] meeting sync failed", { tenant: o.id, message: e?.message }); }
  }
  logger.info("[opsDesk] daily check", { studios: orgs.size, raised: total, meetingsSynced: synced });
});

const LEADS = new Set(["Super Admin", "Owner", "Admin", "Ops Director"]);

/** The same check, on demand, for a lead's own studio (or any, for the platform owner). */
export const opsDeskCheckNow = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const email = String(request.auth.token?.email || "").toLowerCase();
  const platform = request.auth.token?.email_verified === true && PLATFORM_OWNER_EMAILS.includes(email);
  const profile: any = (await db().doc(`users/${request.auth.uid}`).get()).data() || {};
  const tenantId = String(request.data?.tenantId || profile.tenantId || "");
  if (!tenantId) throw new HttpsError("invalid-argument", "Which studio?");
  if (!platform && (profile.tenantId !== tenantId || !LEADS.has(String(profile.role || "")))) {
    throw new HttpsError("permission-denied", "Only the studio's Owner, Admin or Ops Director can run this.");
  }
  return { raised: await sweepStudio(tenantId), meetingsSynced: await syncStudioMeetings(tenantId) };
});

