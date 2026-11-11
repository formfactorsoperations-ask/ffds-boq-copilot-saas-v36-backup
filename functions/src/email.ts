import { onCall, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import { rateLimiter, requireStaff, STAFF_ROLES } from "./guards";
import * as admin from "firebase-admin";
import { sendMail } from "./mail";

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

  return sendMail({
    to: recipients, cc: ccList, subject: String(subject), html,
    fromName: from ? String(from) : null,
    attachments: Array.isArray(attachments) ? attachments : undefined,
  });
});
