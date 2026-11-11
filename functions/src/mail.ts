import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

/*
  ONE WAY TO SEND THE STUDIO'S MAIL FROM THE SERVER.

  Through Resend, from the studio's verified address (EMAIL_FROM), with the
  caller choosing only how the name reads. Used by the studio's own emails
  (email.ts) and by the drawings approval emails and their reminders
  (designMeeting.ts). Without RESEND_API_KEY, or in the local emulators,
  nothing is sent and the caller is told it was simulated.

  A function that calls this declares the secrets:
    { secrets: ["RESEND_API_KEY", "EMAIL_FROM"] }
*/

export interface Mail {
  to: string[];
  cc?: string[];
  /** Where the client's reply goes: the person who sent it, so "Approved" lands in a real inbox. */
  replyTo?: string | null;
  subject: string;
  html: string;
  text?: string;
  /** How the sender's name reads; never the address. */
  fromName?: string | null;
  attachments?: unknown[];
}

export interface Sent { success: true; sandbox?: boolean; message?: string; data?: any }

export function senderFor(name?: string | null): string {
  const address = (process.env.EMAIL_FROM || "onboarding@resend.dev").trim();
  const display = String(name || "").split("<")[0].replace(/["\r\n]/g, "").trim().slice(0, 60);
  return display && !address.includes("<") ? `${display} <${address}>` : address;
}

export async function sendMail(mail: Mail): Promise<Sent> {
  const key = process.env.RESEND_API_KEY;
  /* Never from the local emulators: a test run must not email a real client. */
  if (!key || process.env.FUNCTIONS_EMULATOR === "true") {
    logger.warn("[mail] RESEND_API_KEY not configured, or running in the emulator. Simulating dispatch.", { to: mail.to });
    return { success: true, sandbox: true, message: "Email simulated in sandbox mode (RESEND_API_KEY not configured)." };
  }
  const payload: any = { from: senderFor(mail.fromName), to: mail.to, subject: mail.subject, html: mail.html };
  if (mail.text) payload.text = mail.text;
  if (mail.cc?.length) payload.cc = mail.cc;
  if (mail.replyTo) payload.reply_to = mail.replyTo;
  if (Array.isArray(mail.attachments) && mail.attachments.length) payload.attachments = mail.attachments;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { message: text }; }
    if (!response.ok) {
      logger.error("[mail] Resend refused the email", { status: response.status, data });
      throw new HttpsError("internal", data?.message || data?.error?.message || `Resend error ${response.status}`);
    }
    return { success: true, data };
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    if (e?.name === "AbortError") throw new HttpsError("deadline-exceeded", "The email service did not answer in time.");
    logger.error("[mail] failed", { message: e?.message });
    throw new HttpsError("internal", e?.message || "Failed to send email");
  } finally {
    clearTimeout(timeoutId);
  }
}
