import { onCall, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import { rateLimiter, requireStaff, STAFF_ROLES } from "./guards";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

/**
 * STUDIO EMAIL, SENT FROM THE SERVER.
 *
 * This was the /api/send-email route in server.ts. The app published on AI
 * Studio's *.ai.studio domain is served as static files and server.ts does
 * not run there, so every email the app sent from the published site failed
 * (the route answered with index.html). As a callable it works wherever the
 * app is served, and the Resend key stays a Firebase secret.
 *
 * The rules are the route's own, unchanged: signed-in accounts with a studio
 * profile only, one to ten valid recipients, a subject of up to 300
 * characters, and the sending address is always the studio's own -- the
 * caller may choose how the name reads, never the address.
 *
 * Needs, once:
 *
 *   firebase functions:secrets:set RESEND_API_KEY
 *   firebase functions:secrets:set EMAIL_FROM     (e.g. hello@yourstudio.in)
 *   firebase deploy --only functions:sendStudioEmail
 */

const OPTS: CallableOptions = { secrets: ["RESEND_API_KEY", "EMAIL_FROM"], cors: true, timeoutSeconds: 30 };

/** A ceiling per person, as on the server: one leaked session cannot run up the bill. */
const underLimit = rateLimiter(60, 10 * 60 * 1000);

/*
  Staff who send mail as the studio. A client login used to qualify -- any
  profile with a role did -- so a client, or anyone holding a client's
  password, could send any message to anyone from the studio's verified
  domain, under the studio's name. A Viewer is read-only, so not them either.
*/
const SENDERS = new Set([...STAFF_ROLES].filter((r) => r !== "Viewer"));

export const sendStudioEmail = onCall(OPTS, async (request) => {
  const staff = await requireStaff(request, SENDERS);
  if (!underLimit(staff.uid)) {
    throw new HttpsError("resource-exhausted", "Too many requests. Try again in a few minutes.");
  }

  const { to, cc, subject, html, from, attachments } = (request.data || {}) as any;

  const recipients = (Array.isArray(to) ? to : String(to || "").split(","))
    .map((r: any) => String(r).trim())
    .filter(Boolean);
  const validAddress = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  if (!recipients.length || recipients.length > 10 || recipients.some((r: string) => !validAddress.test(r))) {
    throw new HttpsError("invalid-argument", "Between one and ten valid recipient addresses are needed.");
  }
  const ccList = (Array.isArray(cc) ? cc : String(cc || "").split(","))
    .map((r: any) => String(r).trim())
    .filter(Boolean);
  if (ccList.length > 10 || ccList.some((r: string) => !validAddress.test(r))) {
    throw new HttpsError("invalid-argument", "Up to ten valid CC addresses are allowed.");
  }
  if (!subject || String(subject).length > 300) {
    throw new HttpsError("invalid-argument", "A subject of up to 300 characters is needed.");
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    logger.warn("[sendStudioEmail] RESEND_API_KEY not configured. Simulating dispatch.", { to: recipients });
    return { success: true, sandbox: true, message: "Email simulated in sandbox mode (RESEND_API_KEY not configured)." };
  }

  const senderAddress = (process.env.EMAIL_FROM || "onboarding@resend.dev").trim();
  const displayName = String(from || "").split("<")[0].replace(/["\r\n]/g, "").trim().slice(0, 60);
  const senderEmail = displayName && !senderAddress.includes("<") ? `${displayName} <${senderAddress}>` : senderAddress;

  const payload: any = { from: senderEmail, to: recipients, subject: String(subject), html };
  if (ccList.length) payload.cc = ccList;
  if (Array.isArray(attachments) && attachments.length > 0) payload.attachments = attachments;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
    if (!response.ok) {
      logger.error("[sendStudioEmail] Resend refused the email", { status: response.status, data });
      throw new HttpsError("internal", data?.message || data?.error?.message || `Resend error ${response.status}`);
    }
    return { success: true, data };
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    if (e?.name === "AbortError") {
      throw new HttpsError("deadline-exceeded", "The email service did not answer in time.");
    }
    logger.error("[sendStudioEmail] failed", { message: e?.message });
    throw new HttpsError("internal", e?.message || "Failed to send email");
  } finally {
    clearTimeout(timeoutId);
  }
});
