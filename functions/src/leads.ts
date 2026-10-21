import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as pako from "pako";
import { createHash, timingSafeEqual } from "crypto";
import { requireStaff, rateLimiter } from "./guards";
import { sendMail, card, SECRETS } from "./opsDesk";
import { storedProject } from "./designViewStrip";
import { findMatches, homeLine, leadName, LEAD_STAGES, sourceLabel, type Lead } from "../../lib/leads";
import {
  cleanEnquiry, enquiryProblems, enquiryText, hourKey, leadFormOf, leadFromEnquiry, looksLikeABot, ownerFor, recentSameLead, tenantOfToken,
  FORM_BY, FORM_BY_NAME, PER_SENDER_HOUR, PER_STUDIO_HOUR,
} from "../../lib/leadForm";

/*
  LEADS ON THE SERVER (lib/leads.ts, lib/leadForm.ts).

  leadForm: the studio's public enquiry form. Anyone can open it, so it only
  answers for a link the studio issued and switched on, and it writes the lead
  itself: the browser never touches the leads collection. A bot filling the
  hidden field, or a form sent within seconds of opening, is thanked and
  dropped. Limits per hour hold across instances (leadFormLimits, written here
  only). The same person writing again within a day is added to their lead.

  leadMatches: before a lead is added, whether its phone or email belongs to an
  earlier lead or a client anywhere in the studio, including leads the caller
  cannot open. It answers with names, stages and owners only; nothing about
  money or the project itself.
*/

const db = () => admin.firestore();
const inflate = (b64: string) => Buffer.from(pako.inflate(Buffer.from(b64, "base64"))).toString("utf-8");

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const looksLikeAnId = (name: unknown) => !name || /^[a-z0-9]+([-_][a-z0-9]+)+$/.test(String(name));

async function studioForToken(token: string): Promise<{ tenantId: string; org: any } | null> {
  const tenantId = tenantOfToken(token);
  if (!tenantId) return null;
  const snap = await db().collection("organizations").doc(tenantId).get();
  if (!snap.exists) return null;
  const org = snap.data();
  const f = leadFormOf(org);
  if (!f.enabled || !f.token || !sameToken(f.token, token)) return null;
  return { tenantId, org };
}

/** Reserve one submission for the studio and one for the sender in this hour, or say no. */
async function withinLimits(tenantId: string, sender: string, now: number): Promise<boolean> {
  const hk = hourKey(now);
  const studioRef = db().collection("leadFormLimits").doc(`${tenantId}_${hk}`);
  const senderRef = db().collection("leadFormLimits").doc(`s_${sender}_${hk}`);
  return db().runTransaction(async (tx) => {
    const [s, p] = await Promise.all([tx.get(studioRef), tx.get(senderRef)]);
    const sn = Number(s.data()?.n || 0);
    const pn = Number(p.data()?.n || 0);
    if (sn >= PER_STUDIO_HOUR || pn >= PER_SENDER_HOUR) return false;
    const expireAt = Timestamp.fromMillis(now + 2 * 86400000);
    tx.set(studioRef, { n: sn + 1, tenantId, hour: hk, expireAt });
    tx.set(senderRef, { n: pn + 1, tenantId, hour: hk, expireAt });
    return true;
  });
}

/* A brake on the public door as well (per instance): opening the form costs a read. */
const doors = rateLimiter(120, 60000);
const senderIp = (request: any) => {
  const raw = request.rawRequest as any;
  return String(raw?.headers?.["x-forwarded-for"] || raw?.ip || "").split(",")[0].trim();
};

export const leadForm = onCall({ cors: true, secrets: SECRETS, timeoutSeconds: 30 }, async (request) => {
  const action = String(request.data?.action || "");
  const token = String(request.data?.token || "");
  if (!doors(senderIp(request) || "unknown")) return action === "door" ? { open: false } : { ok: false, reason: "busy" };
  const studio = await studioForToken(token).catch((e) => { logger.warn("leadForm: lookup failed", { message: e?.message }); return null; });
  /* Every refusal looks the same, so the form cannot be used to test which studios exist. */
  if (!studio) return action === "door" ? { open: false } : { ok: false, reason: "closed" };
  const { tenantId, org } = studio;
  const name = looksLikeAnId(org?.orgName) ? null : String(org.orgName);

  if (action === "door") {
    return { open: true, name, logo: org?.orgLogo || null, phone: org?.contactPhone || null, email: org?.contactEmail || null };
  }
  if (action !== "submit") return { ok: false, reason: "closed" };

  const now = Date.now();
  const e = cleanEnquiry(request.data?.enquiry);
  if (looksLikeABot(e, now)) {
    logger.info("leadForm: dropped as automatic", { tenantId });
    return { ok: true, name };
  }
  const problems = enquiryProblems(e);
  if (problems.length) return { ok: false, reason: "invalid", problems };

  const sender = createHash("sha256").update(`${tenantId}|${senderIp(request)}`).digest("hex").slice(0, 24);
  if (!(await withinLimits(tenantId, sender, now))) return { ok: false, reason: "busy" };

  const snap = await db().collection("leads").where("tenantId", "==", tenantId).get();
  const leads = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Lead[];

  /* The same person again within a day: add it to their lead. */
  const same = recentSameLead(e, leads, now);
  if (same) {
    await db().collection("leads").doc(same).update({
      touches: FieldValue.arrayUnion({
        id: `t${now.toString(36)}`, at: now, by: FORM_BY, byName: FORM_BY_NAME, kind: "note",
        text: `Wrote again through the website form.\n${enquiryText(e)}`.slice(0, 500),
      }),
      updatedAt: now, updatedBy: FORM_BY,
    });
    return { ok: true, name };
  }

  const owner = ownerFor(leadFormOf(org), org?.team, leads);
  if (!owner) return { ok: false, reason: "closed" };
  const ref = db().collection("leads").doc();
  const lead = leadFromEnquiry(e, { tenantId, owner, now, id: ref.id });
  await ref.set(lead);
  logger.info("leadForm: lead added", { tenantId, leadId: ref.id, owner: owner.email });

  /* The owner hears at once: a new enquiry should be called within the hour. */
  try {
    await sendMail([owner.email], `New enquiry: ${e.name}`, card(`New enquiry from the website: ${e.name}`, [
      ["Phone", e.phone || "—"], ["Email", e.email || "—"], ["Home", homeLine(lead.home) || "—"],
      ["Wants", e.scope.join(", ") || "—"], ["Message", e.message || "—"],
    ], "It is on your Ops Desk under Leads. Call within the hour."));
  } catch (err: any) {
    logger.warn("leadForm: owner email failed", { message: err?.message });
  }
  return { ok: true, name };
});

/* ── The duplicate check ─────────────────────────────────────────────────── */

const DESK_ROLES = new Set(["Super Admin", "Owner", "Admin", "Ops Director", "Client Relations"]);
const LEAD_ROLES = new Set(["Super Admin", "Owner", "Admin", "Ops Director"]);
const checks = rateLimiter(60, 60000);

/* Each studio's client contacts, kept for a few minutes: every project is read and inflated to build it. */
type ContactRow = { id: string; context: { name: string; clientName: string; clientPhone: string; clientEmail: string; clientContacts: any[] } };
const contactCache = new Map<string, { at: number; rows: ContactRow[] }>();
async function clientContacts(tenantId: string): Promise<ContactRow[]> {
  const hit = contactCache.get(tenantId);
  if (hit && Date.now() - hit.at < 5 * 60000) return hit.rows;
  const snap = await db().collection("projects").where("tenantId", "==", tenantId).get();
  const rows: ContactRow[] = [];
  for (const d of snap.docs) {
    const p = storedProject(d.data(), inflate);
    const c = p?.context || {};
    if (String(c.status || "") === "lost") continue;
    rows.push({ id: d.id, context: {
      name: String(c.name || ""), clientName: String(c.clientName || ""), clientPhone: String(c.clientPhone || ""),
      clientEmail: String(c.clientEmail || ""), clientContacts: Array.isArray(c.clientContacts) ? c.clientContacts.slice(0, 12) : [],
    } });
  }
  contactCache.set(tenantId, { at: Date.now(), rows });
  return rows;
}

export const leadMatches = onCall({ cors: true, memory: "512MiB", timeoutSeconds: 60 }, async (request) => {
  const staff = await requireStaff(request, DESK_ROLES);
  const tenantId = staff.tenantId || (staff.platformOwner ? String(request.data?.tenantId || "") : "");
  if (!tenantId) return { matches: [] };
  if (!checks(staff.uid)) throw new HttpsError("resource-exhausted", "Too many checks. Wait a minute.");

  const people = (Array.isArray(request.data?.people) ? request.data.people : []).slice(0, 8)
    .map((p: any) => ({ phone: String(p?.phone || "").slice(0, 30), email: String(p?.email || "").slice(0, 120) }));
  if (!people.some((p: any) => p.phone || p.email)) return { matches: [] };

  const [leadSnap, projects, orgSnap] = await Promise.all([
    db().collection("leads").where("tenantId", "==", tenantId).get(),
    clientContacts(tenantId),
    db().collection("organizations").doc(tenantId).get(),
  ]);
  const leads = leadSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Lead[];
  const isLead = staff.platformOwner || LEAD_ROLES.has(staff.role);
  const assigned: Record<string, string[]> = orgSnap.data()?.projectDesigners || {};

  const matches = findMatches(people, leads, projects, String(request.data?.ignoreLeadId || "") || undefined).map((m) => {
    if (m.kind === "lead") {
      const l = leads.find((x) => x.id === m.id);
      const mine = isLead || l?.ownerEmail === staff.email;
      return { ...m, ownerName: l?.ownerName || l?.ownerEmail || "", mine,
        stageLabel: l ? (l.stage === "lost" ? "Lost" : l.stage === "won" ? "Won" : LEAD_STAGES.find((s) => s.id === l.stage)?.label || "") : "",
        title: l ? leadName(l) : m.name, source: l ? sourceLabel(l.source) : "" };
    }
    const mine = isLead || (assigned[m.id] || []).map((e) => String(e).toLowerCase()).includes(staff.email);
    return { ...m, mine };
  });
  return { matches };
});
