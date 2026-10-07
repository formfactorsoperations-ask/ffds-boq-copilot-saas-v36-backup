import { onCall, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { rateLimiter, requireStaff, STAFF_ROLES } from "./guards";
import {
  DEFAULT_ZOHO_SETTINGS,
  LinkRecord,
  NeedsAttention,
  RaiseInput,
  ZohoBooksApi,
  ZohoConnection,
  ZohoError,
  ZohoSettings,
  exchangeGrantCode,
  raiseDraftInvoice,
  revokeRefreshToken,
} from "./zohoBooksApi";
import { isValidGstin, isZohoRegion, normaliseGstin, resolveState, validateNumberTemplate } from "../../lib/zohoBooks";

/**
 * ZOHO BOOKS, AS AN OPTIONAL ADD-IN.
 *
 * One callable, several actions, because they share a single gate: a signed-in
 * staff member of a studio that has switched the add-in on.
 *
 *   status              who may do what, and whether this studio is connected
 *   connect             trade a one-time Zoho grant code for a refresh token
 *   selectOrganization  when the Zoho login reaches more than one books
 *   saveSettings        numbering, HSN codes, item names, payment terms
 *   disconnect          forget the credentials and revoke the token
 *   searchContacts / getContact / createContact
 *   pushInvoice         create ONE DRAFT invoice; never sends it
 *
 * Where the credentials live: `zohoBooksConnections/{tenantId}`, a top-level
 * collection no rule opens to a browser, so only this function (Admin SDK) can
 * read or write it. A studio's client secret and refresh token never reach the
 * app, not even to its owner. `status` returns the connection's shape and
 * nothing in it that could be used to sign in.
 *
 * Studios that do not use Zoho Books never touch any of this: with no
 * connection document `status` says "not connected" and the app behaves as it
 * always did.
 */

const OPTS: CallableOptions = { cors: true, timeoutSeconds: 60 };

const underLimit = rateLimiter(60, 10 * 60 * 1000);

/** Who may connect, change settings or disconnect. */
const MANAGERS = new Set(["Super Admin", "Owner", "Admin"]);
/** Who may raise an invoice. Money screens are not for everyone on the team. */
const RAISERS = new Set([...MANAGERS, "Ops Director"]);

const db = () => admin.firestore();

const idPart = (v: unknown, what: string): string => {
  const s = String(v ?? "").trim();
  if (!s || s.length > 120 || /[\/\s]/.test(s)) throw new HttpsError("invalid-argument", `A valid ${what} is needed.`);
  return s;
};

const text = (v: unknown, what: string, max: number, min = 1): string => {
  const s = String(v ?? "").trim();
  if (s.length < min || s.length > max) throw new HttpsError("invalid-argument", `${what} must be ${min}–${max} characters.`);
  return s;
};

const money = (v: unknown, what: string): number => {
  const n = Number(v);
  if (!isFinite(n) || n < 0 || n > 1e10) throw new HttpsError("invalid-argument", `${what} is not a valid amount.`);
  return n;
};

function toHttps(e: unknown): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof NeedsAttention) return new HttpsError("failed-precondition", e.message, { reason: e.reason });
  if (e instanceof ZohoError) {
    const transient = e.status === 0 || e.status >= 500;
    logger.warn("[zohoBooks] Zoho error", { status: e.status, zohoCode: e.zohoCode, message: e.message });
    return new HttpsError(transient ? "unavailable" : "failed-precondition", e.message);
  }
  logger.error("[zohoBooks] unexpected", { message: (e as any)?.message });
  return new HttpsError("internal", "Something went wrong talking to Zoho Books.");
}

async function loadConnection(tenantId: string): Promise<ZohoConnection | null> {
  const snap = await db().doc(`zohoBooksConnections/${tenantId}`).get();
  if (!snap.exists) return null;
  const d = snap.data() as ZohoConnection;
  // Settings written by an older build may lack newer fields.
  return { ...d, settings: { ...DEFAULT_ZOHO_SETTINGS, ...(d.settings || {}), itemIds: { ...(d.settings?.itemIds || {}) } } };
}

const saveConnection = (tenantId: string) => async (c: ZohoConnection) => {
  await db().doc(`zohoBooksConnections/${tenantId}`).set(c);
};

function apiFor(tenantId: string, conn: ZohoConnection): ZohoBooksApi {
  return new ZohoBooksApi(conn, { save: saveConnection(tenantId) });
}

function publicStatus(conn: ZohoConnection | null, pendingOrgs: { id: string; name: string }[] | null, staff: { role: string }) {
  const canManage = MANAGERS.has(staff.role);
  const canRaise = RAISERS.has(staff.role);
  if (!conn) return { connected: false, canManage, canRaise };
  const { itemIds: _ids, ...settings } = conn.settings;
  return {
    connected: !!conn.organizationId,
    region: conn.region,
    organizationName: conn.organizationName || null,
    needsOrganization: conn.organizationId ? null : pendingOrgs,
    settings,
    canManage,
    canRaise,
  };
}

function validateSettings(raw: any): Pick<ZohoSettings, "numbering" | "hsnDesign" | "hsnExecution" | "designItemName" | "executionItemName" | "paymentTermsDays"> {
  const mode = raw?.numbering?.mode === "template" ? "template" : "zoho";
  const template = String(raw?.numbering?.template ?? DEFAULT_ZOHO_SETTINGS.numbering.template);
  if (mode === "template") {
    const problem = validateNumberTemplate(template);
    if (problem) throw new HttpsError("invalid-argument", problem);
  }
  const hsn = (v: unknown, what: string) => {
    const s = String(v ?? "").trim();
    if (!/^\d{4,8}$/.test(s)) throw new HttpsError("invalid-argument", `${what} must be a 4–8 digit HSN/SAC code.`);
    return s;
  };
  const days = raw?.paymentTermsDays;
  const terms = days === null || days === undefined || days === "" ? null : Math.round(Number(days));
  if (terms !== null && (!isFinite(terms) || terms < 0 || terms > 100)) {
    throw new HttpsError("invalid-argument", "Payment terms must be between 0 and 100 days.");
  }
  return {
    numbering: { mode, template: mode === "template" ? template : DEFAULT_ZOHO_SETTINGS.numbering.template },
    hsnDesign: hsn(raw?.hsnDesign, "Design HSN/SAC"),
    hsnExecution: hsn(raw?.hsnExecution, "Execution HSN/SAC"),
    designItemName: text(raw?.designItemName, "Design item name", 100),
    executionItemName: text(raw?.executionItemName, "Execution item name", 100),
    paymentTermsDays: terms || null,
  };
}

export const zohoBooks = onCall(OPTS, async (request) => {
  const staff = await requireStaff(request, STAFF_ROLES);
  if (!underLimit(staff.uid)) throw new HttpsError("resource-exhausted", "Too many requests. Try again in a few minutes.");

  const data: any = request.data || {};
  const tenantId = staff.tenantId || (staff.platformOwner ? idPart(data.tenantId, "studio") : null);
  if (!tenantId) throw new HttpsError("permission-denied", "This account is not part of a studio.");

  const action = String(data.action || "");

  const requireRole = (allowed: Set<string>, what: string) => {
    if (!allowed.has(staff.role)) throw new HttpsError("permission-denied", `Only an Owner or Admin can ${what}.`);
  };
  const requireConnected = async () => {
    const conn = await loadConnection(tenantId);
    if (!conn || !conn.organizationId) throw new HttpsError("failed-precondition", "Zoho Books is not connected for this studio.");
    return conn;
  };

  try {
    switch (action) {
      case "status": {
        const conn = await loadConnection(tenantId);
        let pending: { id: string; name: string }[] | null = null;
        if (conn && !conn.organizationId && MANAGERS.has(staff.role)) pending = await apiFor(tenantId, conn).organizations();
        return publicStatus(conn, pending, staff);
      }

      case "connect": {
        requireRole(MANAGERS, "connect Zoho Books");
        const region = data.region;
        if (!isZohoRegion(region)) throw new HttpsError("invalid-argument", "Choose the Zoho data centre your account is on.");
        const clientId = text(data.clientId, "Client ID", 100, 10);
        const clientSecret = text(data.clientSecret, "Client secret", 100, 10);
        const code = text(data.code, "Grant code", 200, 10);

        const grant = await exchangeGrantCode((u, i) => fetch(u, i), region, clientId, clientSecret, code);
        const conn: ZohoConnection = {
          region, clientId, clientSecret,
          refreshToken: grant.refreshToken,
          accessToken: grant.accessToken,
          accessTokenExpiresAt: grant.expiresAt,
          settings: { ...DEFAULT_ZOHO_SETTINGS, itemIds: {} },
          connectedAt: Date.now(),
          connectedBy: staff.email,
        };
        // Save before anything else: the grant code is spent and cannot be replayed.
        await saveConnection(tenantId)(conn);

        const api = apiFor(tenantId, conn);
        const orgs = await api.organizations();
        if (orgs.length === 0) {
          throw new HttpsError("failed-precondition", "That Zoho login has no Zoho Books organisation.");
        }
        if (orgs.length === 1) {
          conn.organizationId = orgs[0].id;
          conn.organizationName = orgs[0].name;
          await saveConnection(tenantId)(conn);
          return publicStatus(conn, null, staff);
        }
        return publicStatus(conn, orgs, staff);
      }

      case "selectOrganization": {
        requireRole(MANAGERS, "choose the Zoho Books organisation");
        const conn = await loadConnection(tenantId);
        if (!conn) throw new HttpsError("failed-precondition", "Connect Zoho Books first.");
        const orgs = await apiFor(tenantId, conn).organizations();
        const pick = orgs.find((o) => o.id === String(data.organizationId));
        if (!pick) throw new HttpsError("invalid-argument", "That organisation is not on this Zoho login.");
        if (conn.organizationId !== pick.id) conn.settings.itemIds = {}; // items belong to an organisation
        conn.organizationId = pick.id;
        conn.organizationName = pick.name;
        await saveConnection(tenantId)(conn);
        return publicStatus(conn, null, staff);
      }

      case "saveSettings": {
        requireRole(MANAGERS, "change the Zoho Books settings");
        const conn = await loadConnection(tenantId);
        if (!conn) throw new HttpsError("failed-precondition", "Connect Zoho Books first.");
        const next = validateSettings(data.settings);
        // A renamed or re-coded item is a different item; look it up again.
        const itemIds = { ...conn.settings.itemIds };
        if (next.designItemName !== conn.settings.designItemName || next.hsnDesign !== conn.settings.hsnDesign) delete itemIds.design;
        if (next.executionItemName !== conn.settings.executionItemName || next.hsnExecution !== conn.settings.hsnExecution) delete itemIds.execution;
        conn.settings = { ...next, itemIds };
        await saveConnection(tenantId)(conn);
        return publicStatus(conn, null, staff);
      }

      case "disconnect": {
        requireRole(MANAGERS, "disconnect Zoho Books");
        const conn = await loadConnection(tenantId);
        if (conn) {
          await revokeRefreshToken((u, i) => fetch(u, i), conn.region, conn.refreshToken);
          await db().doc(`zohoBooksConnections/${tenantId}`).delete();
        }
        return { connected: false, canManage: true, canRaise: RAISERS.has(staff.role) };
      }

      case "searchContacts": {
        requireRole(RAISERS, "look up Zoho customers");
        const conn = await requireConnected();
        const q = String(data.query ?? "").trim();
        return { contacts: q ? await apiFor(tenantId, conn).searchContacts(q) : [] };
      }

      case "getContact": {
        requireRole(RAISERS, "look up Zoho customers");
        const conn = await requireConnected();
        const c = await apiFor(tenantId, conn).getContact(idPart(data.contactId, "customer"));
        return { contact: { ...c, placeOfSupply: (resolveState(c.placeOfContact) || null)?.zoho || null } };
      }

      case "createContact": {
        requireRole(RAISERS, "create Zoho customers");
        const conn = await requireConnected();
        const gstin = normaliseGstin(data.gstin);
        if (gstin && !isValidGstin(gstin)) throw new HttpsError("invalid-argument", "That GSTIN does not look right.");
        const state = resolveState(data.placeOfSupply);
        const created = await apiFor(tenantId, conn).createContact({
          name: text(data.name, "Customer name", 200),
          email: String(data.email || "").trim().slice(0, 100) || undefined,
          phone: String(data.phone || "").trim().slice(0, 50) || undefined,
          gstin: gstin || undefined,
          placeOfSupply: state?.zoho,
        });
        return { contact: created };
      }

      case "pushInvoice": {
        requireRole(RAISERS, "raise invoices in Zoho Books");
        const conn = await requireConnected();
        const projectId = idPart(data.projectId, "project");
        const milestoneId = idPart(data.milestoneId, "milestone");
        const type = data.milestoneType === "execution" ? "execution" : data.milestoneType === "design" ? "design" : null;
        if (!type) throw new HttpsError("invalid-argument", "The milestone type is missing.");
        const rate = money(data.gstRatePct, "GST rate");
        if (rate > 40) throw new HttpsError("invalid-argument", "That GST rate is not valid.");
        const taxable = money(data.taxableAmount, "Taxable amount");
        if (taxable <= 0) throw new HttpsError("invalid-argument", "There is nothing to invoice on this milestone.");

        const input: RaiseInput = {
          projectId, milestoneId,
          projectName: text(data.projectName, "Project name", 200),
          milestoneName: text(data.milestoneName, "Milestone name", 200),
          milestoneType: type,
          taxableAmount: taxable,
          gstAmount: money(data.gstAmount, "GST amount"),
          gstRatePct: rate,
          retainerDeducted: money(data.retainerDeducted ?? 0, "Retainer"),
          discountApplied: money(data.discountApplied ?? 0, "Discount"),
          discountReason: String(data.discountReason || "").trim().slice(0, 80) || undefined,
          contactId: idPart(data.contactId, "customer"),
          gstin: String(data.gstin || ""),
          placeOfSupply: String(data.placeOfSupply || ""),
        };

        const org = (await db().doc(`organizations/${tenantId}`).get()).data() || {};
        const linkRef = (key: string) => db().doc(`zohoInvoiceLinks/${key}`);
        const result = await raiseDraftInvoice(input, {
          api: apiFor(tenantId, conn),
          studioGstin: String(org.gstin || org.gstNumber || ""),
          linkKey: `${tenantId}__${projectId}__${milestoneId}`,
          links: {
            get: async (key) => {
              const s = await linkRef(key).get();
              return s.exists ? (s.data() as LinkRecord) : null;
            },
            set: async (key, rec) => { await linkRef(key).set({ ...rec, tenantId, projectId, milestoneId, by: staff.email }); },
          },
        });
        logger.info("[zohoBooks] draft invoice", { tenantId, projectId, milestoneId, number: result.invoiceNumber, reused: result.reused });
        return result;
      }

      default:
        throw new HttpsError("invalid-argument", "Unknown action.");
    }
  } catch (e) {
    throw toHttps(e);
  }
});
