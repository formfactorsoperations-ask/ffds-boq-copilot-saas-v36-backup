import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as pako from "pako";
import { requireStaff, rateLimiter } from "./guards";
import { storedProject } from "./designViewStrip";
import { findMatches, leadName, LEAD_STAGES, sourceLabel, type Lead } from "../../lib/leads";

/*
  LEADS ON THE SERVER (lib/leads.ts).

  leadMatches: before a lead is added, whether its phone or email belongs to an
  earlier lead or a client anywhere in the studio, including leads the caller
  cannot open. It answers with names, stages and owners only; nothing about
  money or the project itself.
*/

const db = () => admin.firestore();
const inflate = (b64: string) => Buffer.from(pako.inflate(Buffer.from(b64, "base64"))).toString("utf-8");

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
