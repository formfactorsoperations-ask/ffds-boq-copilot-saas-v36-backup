import {
  DEFAULT_NUMBER_TEMPLATE,
  NumberingMode,
  ZOHO_REGIONS,
  ZohoRegion,
  ZohoTax,
  buildInvoicePayload,
  expectedInvoiceTotal,
  gstSplit,
  isValidGstin,
  isoDateIst,
  nextInvoiceNumber,
  normaliseGstin,
  numberPrefix,
  pickTaxId,
  resolveState,
  stateFromGstin,
} from "../../lib/zohoBooks";

/**
 * THE ZOHO BOOKS CLIENT.
 *
 * Plain functions over an injected `fetch` and two small stores, so the whole
 * invoice flow can be exercised in a test without Zoho or Firestore. The
 * callable in zohoBooks.ts supplies the real ones.
 *
 * What this talks to, and nothing else: OAuth token exchange, organisations,
 * contacts (search, read, create), taxes, one service item per track, invoice
 * numbers, and invoice create/read. It never calls an update, delete, send or
 * email endpoint, and the OAuth grant it is given has no scope that would let
 * it (see ZOHO_SCOPES).
 */

export interface ZohoSettings {
  numbering: { mode: NumberingMode; template: string };
  hsnDesign: string;
  hsnExecution: string;
  designItemName: string;
  executionItemName: string;
  /** Days to pay, or null to let Zoho apply the customer's own terms. */
  paymentTermsDays: number | null;
  /** The Zoho items found or created for each track, so they are looked up once. */
  itemIds: { design?: string; execution?: string };
}

export const DEFAULT_ZOHO_SETTINGS: ZohoSettings = {
  numbering: { mode: "zoho", template: DEFAULT_NUMBER_TEMPLATE },
  hsnDesign: "998391",
  hsnExecution: "998391",
  designItemName: "Interior design services",
  executionItemName: "Interior execution services",
  paymentTermsDays: null,
  itemIds: {},
};

export interface ZohoConnection {
  region: ZohoRegion;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Absent until the studio has chosen one, when its login reaches several. */
  organizationId?: string;
  organizationName?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  settings: ZohoSettings;
  connectedAt: number;
  connectedBy: string;
}

export interface ConnectionStore {
  save(c: ZohoConnection): Promise<void>;
}

export interface LinkRecord {
  invoiceId: string;
  invoiceNumber: string;
  createdAt: number;
}

export interface LinkStore {
  get(key: string): Promise<LinkRecord | null>;
  set(key: string, rec: LinkRecord): Promise<void>;
}

export class ZohoError extends Error {
  constructor(message: string, public status = 0, public zohoCode?: number) {
    super(message);
  }
}

/** A precondition the studio can fix in the app, as opposed to a Zoho failure. */
export class NeedsAttention extends Error {
  constructor(public reason: "place_of_supply" | "studio_gstin" | "tax_missing" | "invoice_sent", message: string) {
    super(message);
  }
}

type FetchFn = (url: string, init?: any) => Promise<any>;

const TIMEOUT_MS = 20000;

async function timedFetch(fetchImpl: FetchFn, url: string, init: any): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new ZohoError("Zoho Books did not answer in time.", 504);
    throw new ZohoError(`Could not reach Zoho Books: ${e?.message || e}`, 502);
  } finally {
    clearTimeout(t);
  }
}

async function oauth(fetchImpl: FetchFn, region: ZohoRegion, path: string, form: Record<string, string>): Promise<any> {
  const res = await timedFetch(fetchImpl, `https://${ZOHO_REGIONS[region].accounts}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  // Zoho answers a rejected grant with HTTP 200 and an `error` field.
  if (!res.ok || json.error) throw new ZohoError(describeOAuthError(json.error), res.status || 400);
  return json;
}

function describeOAuthError(code: unknown): string {
  switch (code) {
    case "invalid_code":
      return "That grant code was not accepted. Codes work once and expire in minutes: generate a fresh one and paste it straight away.";
    case "invalid_client":
    case "invalid_client_secret":
      return "Zoho did not recognise the client ID or secret. Check them and the data centre you picked.";
    case "access_denied":
      return "Zoho refused access. Make sure the grant was created by a user who can administer Zoho Books.";
    default:
      return `Zoho rejected the sign-in${code ? ` (${String(code)})` : ""}.`;
  }
}

/** Trade the one-time grant code for a long-lived refresh token. */
export async function exchangeGrantCode(
  fetchImpl: FetchFn, region: ZohoRegion, clientId: string, clientSecret: string, code: string,
): Promise<{ refreshToken: string; accessToken: string; expiresAt: number }> {
  const json = await oauth(fetchImpl, region, "/oauth/v2/token", {
    grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code,
  });
  if (!json.refresh_token) {
    throw new ZohoError("Zoho did not return a refresh token. Generate a new grant code and try again.", 400);
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  };
}

export async function revokeRefreshToken(fetchImpl: FetchFn, region: ZohoRegion, token: string): Promise<void> {
  try {
    await timedFetch(fetchImpl, `https://${ZOHO_REGIONS[region].accounts}/oauth/v2/token/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch { /* disconnecting must not hinge on Zoho answering */ }
}

export class ZohoBooksApi {
  constructor(
    private conn: ZohoConnection,
    private store: ConnectionStore,
    private fetchImpl: FetchFn = (u, i) => fetch(u, i),
    private nowMs: () => number = () => Date.now(),
  ) {}

  get connection(): ZohoConnection { return this.conn; }

  private async accessToken(force = false): Promise<string> {
    const c = this.conn;
    if (!force && c.accessToken && (c.accessTokenExpiresAt || 0) - this.nowMs() > 120000) return c.accessToken;
    const json = await oauth(this.fetchImpl, c.region, "/oauth/v2/token", {
      grant_type: "refresh_token", refresh_token: c.refreshToken, client_id: c.clientId, client_secret: c.clientSecret,
    });
    c.accessToken = json.access_token;
    c.accessTokenExpiresAt = this.nowMs() + (Number(json.expires_in) || 3600) * 1000;
    await this.store.save(c);
    return c.accessToken as string;
  }

  async request(
    method: "GET" | "POST", path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown; needsOrg?: boolean } = {},
  ): Promise<any> {
    const needsOrg = opts.needsOrg !== false;
    if (needsOrg && !this.conn.organizationId) throw new ZohoError("No Zoho Books organisation is selected.", 400);

    const attempt = async (force: boolean) => {
      const url = new URL(`https://${ZOHO_REGIONS[this.conn.region].api}/books/v3${path}`);
      if (needsOrg) url.searchParams.set("organization_id", this.conn.organizationId as string);
      for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      const token = await this.accessToken(force);
      const res = await timedFetch(this.fetchImpl, url.toString(), {
        method,
        headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const json: any = await res.json().catch(() => ({}));
      return { res, json };
    };

    let { res, json } = await attempt(false);
    if (res.status === 401) ({ res, json } = await attempt(true)); // the cached token was revoked or expired early
    if (!res.ok || (json.code !== undefined && json.code !== 0)) {
      throw new ZohoError(json.message || `Zoho Books answered ${res.status}.`, res.status, json.code);
    }
    return json;
  }

  async organizations(): Promise<{ id: string; name: string }[]> {
    const json = await this.request("GET", "/organizations", { needsOrg: false });
    return (json.organizations || []).map((o: any) => ({ id: String(o.organization_id), name: String(o.name || o.organization_id) }));
  }

  async searchContacts(query: string): Promise<{ id: string; name: string; company: string }[]> {
    const json = await this.request("GET", "/contacts", {
      query: { contact_type: "customer", search_text: query.slice(0, 100), per_page: 15, sort_column: "contact_name" },
    });
    return (json.contacts || []).map((c: any) => ({
      id: String(c.contact_id), name: String(c.contact_name || ""), company: String(c.company_name || ""),
    }));
  }

  async getContact(id: string): Promise<{ id: string; name: string; gstin: string; placeOfContact: string; gstTreatment: string }> {
    const json = await this.request("GET", `/contacts/${encodeURIComponent(id)}`);
    const c = json.contact || {};
    return {
      id: String(c.contact_id || id),
      name: String(c.contact_name || ""),
      gstin: normaliseGstin(c.gst_no),
      placeOfContact: String(c.place_of_contact || ""),
      gstTreatment: String(c.gst_treatment || ""),
    };
  }

  async createContact(i: { name: string; email?: string; phone?: string; gstin?: string; placeOfSupply?: string }): Promise<{ id: string; name: string }> {
    const body: Record<string, unknown> = {
      contact_name: i.name.slice(0, 200),
      contact_type: "customer",
      customer_sub_type: i.gstin ? "business" : "individual",
      gst_treatment: i.gstin ? "business_gst" : "consumer",
    };
    if (i.gstin) body.gst_no = i.gstin;
    if (i.placeOfSupply) body.place_of_contact = i.placeOfSupply;
    if (i.email || i.phone) {
      body.contact_persons = [{
        first_name: i.name.slice(0, 100), email: i.email || undefined, phone: i.phone || undefined, is_primary_contact: true,
      }];
    }
    const json = await this.request("POST", "/contacts", { body });
    return { id: String(json.contact?.contact_id), name: String(json.contact?.contact_name || i.name) };
  }

  async taxes(): Promise<ZohoTax[]> {
    const json = await this.request("GET", "/settings/taxes", { query: { per_page: 200 } });
    return (json.taxes || [])
      .filter((t: any) => !t.is_inactive)
      .map((t: any) => ({
        tax_id: String(t.tax_id), tax_name: t.tax_name, tax_percentage: Number(t.tax_percentage),
        tax_type: t.tax_type, tax_specification: t.tax_specification,
      }));
  }

  /** The Zoho item an invoice line points at: found by name, or created once. */
  async serviceItemId(kind: "design" | "execution"): Promise<string> {
    const s = this.conn.settings;
    const cached = s.itemIds[kind];
    if (cached) return cached;
    const name = kind === "design" ? s.designItemName : s.executionItemName;
    const hsn = kind === "design" ? s.hsnDesign : s.hsnExecution;
    const found = await this.request("GET", "/items", { query: { search_text: name, per_page: 50 } });
    const match = (found.items || []).find((it: any) => String(it.name || "").trim().toLowerCase() === name.trim().toLowerCase());
    let id: string;
    if (match) {
      id = String(match.item_id);
    } else {
      const made = await this.request("POST", "/items", {
        body: { name, rate: 0, product_type: "service", item_type: "sales", hsn_or_sac: hsn },
      });
      id = String(made.item?.item_id);
    }
    s.itemIds = { ...s.itemIds, [kind]: id };
    await this.store.save(this.conn);
    return id;
  }

  /** Every invoice number under a prefix, drafts and voids included, which is what keeps a series gap-free. */
  async invoiceNumbersWithPrefix(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (let page = 1; page <= 10; page++) {
      const json = await this.request("GET", "/invoices", {
        query: { invoice_number_startswith: prefix, per_page: 200, page, sort_column: "invoice_number" },
      });
      for (const inv of json.invoices || []) out.push(String(inv.invoice_number));
      if (!json.page_context?.has_more_page) break;
    }
    return out;
  }

  async getInvoice(id: string): Promise<{ id: string; number: string; status: string; total: number } | null> {
    try {
      const json = await this.request("GET", `/invoices/${encodeURIComponent(id)}`);
      const inv = json.invoice || {};
      return { id: String(inv.invoice_id || id), number: String(inv.invoice_number || ""), status: String(inv.status || ""), total: Number(inv.total) || 0 };
    } catch (e) {
      if (e instanceof ZohoError && (e.status === 404 || e.zohoCode === 1002)) return null;
      throw e;
    }
  }

  async createInvoice(body: Record<string, unknown>, query: Record<string, string>): Promise<{ id: string; number: string; status: string; total: number }> {
    const json = await this.request("POST", "/invoices", { body, query });
    const inv = json.invoice || {};
    return { id: String(inv.invoice_id), number: String(inv.invoice_number || ""), status: String(inv.status || "draft"), total: Number(inv.total) || 0 };
  }

  invoiceUrl(invoiceId: string): string {
    return `https://${ZOHO_REGIONS[this.conn.region].app}/app/${this.conn.organizationId}#/invoices/${invoiceId}`;
  }
}

// ── Raising one invoice ──────────────────────────────────────────────────────

export interface RaiseInput {
  projectId: string;
  milestoneId: string;
  projectName: string;
  milestoneName: string;
  milestoneType: "design" | "execution";
  /** Ex-GST, as the studio's schedule computes it. */
  taxableAmount: number;
  gstAmount: number;
  gstRatePct: number;
  retainerDeducted: number;
  discountApplied: number;
  discountReason?: string;
  contactId: string;
  gstin?: string;
  placeOfSupply?: string;
}

export interface RaiseResult {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  /** What Zoho says the invoice totals. */
  total: number;
  /** What the studio's schedule says it should total. */
  expectedTotal: number;
  url: string;
  /** True when this milestone already had a draft in Zoho and it was handed back. */
  reused: boolean;
  gstLabel: string;
  placeOfSupply: string;
}

export interface RaiseDeps {
  api: ZohoBooksApi;
  links: LinkStore;
  linkKey: string;
  studioGstin: string;
  now?: Date;
}

/**
 * Create the draft invoice for one milestone.
 *
 * Idempotent per milestone: if a draft was already made for it, that draft is
 * returned instead of a second one, so a retry after a dropped connection does
 * not litter the studio's books. A draft is only ever created, never sent.
 */
export async function raiseDraftInvoice(input: RaiseInput, deps: RaiseDeps): Promise<RaiseResult> {
  const { api, links, linkKey } = deps;
  const now = deps.now || new Date();
  const expectedTotal = expectedInvoiceTotal(input.taxableAmount, input.gstAmount, input.retainerDeducted, input.discountApplied);

  const prior = await links.get(linkKey);
  if (prior) {
    const existing = await api.getInvoice(prior.invoiceId);
    if (existing && existing.status === "draft") {
      return {
        invoiceId: existing.id, invoiceNumber: existing.number, status: existing.status, total: existing.total,
        expectedTotal, url: api.invoiceUrl(existing.id), reused: true, gstLabel: "", placeOfSupply: "",
      };
    }
    if (existing && existing.status !== "void") {
      throw new NeedsAttention("invoice_sent", `Zoho already has invoice ${existing.number} for this milestone, and it is ${existing.status}, not a draft. Open it in Zoho Books.`);
    }
    // Deleted or voided in Zoho: the studio wants a fresh one.
  }

  const studioState = stateFromGstin(deps.studioGstin);
  if (!studioState) {
    throw new NeedsAttention("studio_gstin", "Add the studio's GSTIN in Studio Settings so the GST split can be worked out.");
  }

  const contact = await api.getContact(input.contactId);
  const suppliedGstin = normaliseGstin(input.gstin);
  const gstin = isValidGstin(suppliedGstin) ? suppliedGstin : (isValidGstin(contact.gstin) ? contact.gstin : "");
  const clientState = resolveState(input.placeOfSupply) || resolveState(contact.placeOfContact) || stateFromGstin(gstin);
  if (!clientState) {
    throw new NeedsAttention("place_of_supply", "Choose the client's state (place of supply) so the right GST split is applied.");
  }

  const split = gstSplit(studioState, clientState, input.gstRatePct);
  let taxId: string | null = null;
  if (input.gstRatePct > 0) {
    taxId = pickTaxId(await api.taxes(), split.kind, input.gstRatePct);
    if (!taxId) {
      throw new NeedsAttention("tax_missing", `Zoho Books has no ${split.kind === "inter" ? "IGST" : "GST"} ${input.gstRatePct}% tax. Add it under Settings → Taxes in Zoho Books.`);
    }
  }

  const s = api.connection.settings;
  const itemId = await api.serviceItemId(input.milestoneType);
  const build = (invoiceNumber?: string) => buildInvoicePayload({
    customerId: input.contactId,
    date: isoDateIst(now),
    projectName: input.projectName,
    milestoneName: input.milestoneName,
    taxableAmount: input.taxableAmount,
    gstRatePct: input.gstRatePct,
    hsnOrSac: input.milestoneType === "design" ? s.hsnDesign : s.hsnExecution,
    itemId,
    taxId,
    placeOfSupply: clientState.zoho,
    gstin: gstin || undefined,
    retainerDeducted: input.retainerDeducted,
    discountApplied: input.discountApplied,
    discountReason: input.discountReason,
    invoiceNumber,
    paymentTermsDays: s.paymentTermsDays || undefined,
  });

  const ownNumbers = s.numbering.mode === "template";
  const pick = async () => nextInvoiceNumber(s.numbering.template, now, await api.invoiceNumbersWithPrefix(numberPrefix(s.numbering.template, now)));

  let created;
  if (ownNumbers) {
    let draft = build(await pick());
    try {
      created = await api.createInvoice(draft.body, draft.query);
    } catch (e) {
      // Two people raising invoices at once can pick the same number. Zoho refuses the second; take the next.
      if (!(e instanceof ZohoError) || !/already exist|duplicate|unique/i.test(e.message)) throw e;
      draft = build(await pick());
      created = await api.createInvoice(draft.body, draft.query);
    }
  } else {
    const draft = build();
    created = await api.createInvoice(draft.body, draft.query);
  }

  await links.set(linkKey, { invoiceId: created.id, invoiceNumber: created.number, createdAt: Date.now() });
  return {
    invoiceId: created.id, invoiceNumber: created.number, status: created.status, total: created.total,
    expectedTotal, url: api.invoiceUrl(created.id), reused: false, gstLabel: split.label, placeOfSupply: clientState.zoho,
  };
}
