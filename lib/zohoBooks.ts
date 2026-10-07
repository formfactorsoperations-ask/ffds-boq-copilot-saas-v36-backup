/**
 * ZOHO BOOKS ADD-IN: the parts that are rules, not plumbing.
 *
 * Zoho Books is an optional add-in a studio switches on in Studio Settings;
 * nothing here runs for a studio that has not connected it. Everything in this
 * file is pure -- no network, no Firestore -- so the functions that talk to
 * Zoho and the tests that check them share one definition of "a correct
 * invoice": which GST split applies, what the next invoice number is, and what
 * the draft looks like.
 *
 * THE DRAFT IS NEVER SENT. `buildInvoicePayload` has no `send` field, and its
 * test asserts the body never grows one. A studio reviews the draft in Zoho
 * and sends it from there; an invoice that reaches a client before someone
 * has looked at it is expensive to unwind.
 */

// ── Zoho data centres ────────────────────────────────────────────────────────

export type ZohoRegion = 'in' | 'com' | 'eu' | 'au' | 'jp' | 'ca' | 'sa';

export interface ZohoRegionInfo {
  label: string;
  /** OAuth host: accounts.zoho.<tld> */
  accounts: string;
  /** REST host: www.zohoapis.<tld> */
  api: string;
  /** The web app, for "Open in Zoho" links. */
  app: string;
}

export const ZOHO_REGIONS: Record<ZohoRegion, ZohoRegionInfo> = {
  in: { label: 'India (zoho.in)', accounts: 'accounts.zoho.in', api: 'www.zohoapis.in', app: 'books.zoho.in' },
  com: { label: 'United States (zoho.com)', accounts: 'accounts.zoho.com', api: 'www.zohoapis.com', app: 'books.zoho.com' },
  eu: { label: 'Europe (zoho.eu)', accounts: 'accounts.zoho.eu', api: 'www.zohoapis.eu', app: 'books.zoho.eu' },
  au: { label: 'Australia (zoho.com.au)', accounts: 'accounts.zoho.com.au', api: 'www.zohoapis.com.au', app: 'books.zoho.com.au' },
  jp: { label: 'Japan (zoho.jp)', accounts: 'accounts.zoho.jp', api: 'www.zohoapis.jp', app: 'books.zoho.jp' },
  ca: { label: 'Canada (zohocloud.ca)', accounts: 'accounts.zohocloud.ca', api: 'www.zohoapis.ca', app: 'books.zohocloud.ca' },
  sa: { label: 'Saudi Arabia (zoho.sa)', accounts: 'accounts.zoho.sa', api: 'www.zohoapis.sa', app: 'books.zoho.sa' },
};

export const isZohoRegion = (v: unknown): v is ZohoRegion =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(ZOHO_REGIONS, v);

/**
 * The least the add-in needs. No UPDATE or DELETE scope: the grant cannot edit
 * or remove anything in the studio's books, only add drafts and contacts.
 */
export const ZOHO_SCOPES = [
  'ZohoBooks.invoices.CREATE',
  'ZohoBooks.invoices.READ',
  'ZohoBooks.contacts.CREATE',
  'ZohoBooks.contacts.READ',
  'ZohoBooks.settings.READ',
  'ZohoBooks.settings.CREATE',
].join(',');

// ── GST places of supply ─────────────────────────────────────────────────────

export interface GstState {
  /** The two digits a GSTIN begins with. */
  gst: string;
  /** The code Zoho Books takes as `place_of_supply`. */
  zoho: string;
  name: string;
}

export const GST_STATES: GstState[] = [
  { gst: '01', zoho: 'JK', name: 'Jammu & Kashmir' },
  { gst: '02', zoho: 'HP', name: 'Himachal Pradesh' },
  { gst: '03', zoho: 'PB', name: 'Punjab' },
  { gst: '04', zoho: 'CH', name: 'Chandigarh' },
  { gst: '05', zoho: 'UT', name: 'Uttarakhand' },
  { gst: '06', zoho: 'HR', name: 'Haryana' },
  { gst: '07', zoho: 'DL', name: 'Delhi' },
  { gst: '08', zoho: 'RJ', name: 'Rajasthan' },
  { gst: '09', zoho: 'UP', name: 'Uttar Pradesh' },
  { gst: '10', zoho: 'BR', name: 'Bihar' },
  { gst: '11', zoho: 'SK', name: 'Sikkim' },
  { gst: '12', zoho: 'AR', name: 'Arunachal Pradesh' },
  { gst: '13', zoho: 'NL', name: 'Nagaland' },
  { gst: '14', zoho: 'MN', name: 'Manipur' },
  { gst: '15', zoho: 'MZ', name: 'Mizoram' },
  { gst: '16', zoho: 'TR', name: 'Tripura' },
  { gst: '17', zoho: 'ML', name: 'Meghalaya' },
  { gst: '18', zoho: 'AS', name: 'Assam' },
  { gst: '19', zoho: 'WB', name: 'West Bengal' },
  { gst: '20', zoho: 'JH', name: 'Jharkhand' },
  { gst: '21', zoho: 'OD', name: 'Odisha' },
  { gst: '22', zoho: 'CG', name: 'Chhattisgarh' },
  { gst: '23', zoho: 'MP', name: 'Madhya Pradesh' },
  { gst: '24', zoho: 'GJ', name: 'Gujarat' },
  { gst: '26', zoho: 'DN', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { gst: '27', zoho: 'MH', name: 'Maharashtra' },
  { gst: '29', zoho: 'KA', name: 'Karnataka' },
  { gst: '30', zoho: 'GA', name: 'Goa' },
  { gst: '31', zoho: 'LD', name: 'Lakshadweep' },
  { gst: '32', zoho: 'KL', name: 'Kerala' },
  { gst: '33', zoho: 'TN', name: 'Tamil Nadu' },
  { gst: '34', zoho: 'PY', name: 'Puducherry' },
  { gst: '35', zoho: 'AN', name: 'Andaman & Nicobar Islands' },
  { gst: '36', zoho: 'TS', name: 'Telangana' },
  { gst: '37', zoho: 'AP', name: 'Andhra Pradesh' },
  { gst: '38', zoho: 'LA', name: 'Ladakh' },
];

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const normaliseGstin = (v: unknown): string => String(v ?? '').replace(/\s+/g, '').toUpperCase();
export const isValidGstin = (v: unknown): boolean => GSTIN_PATTERN.test(normaliseGstin(v));

/** The state a GSTIN was issued in, or null when it is not a GSTIN or the code is unknown. */
export function stateFromGstin(gstin: unknown): GstState | null {
  const g = normaliseGstin(gstin);
  if (g.length < 2) return null;
  return GST_STATES.find((s) => s.gst === g.slice(0, 2)) || null;
}

/** Accepts the Zoho code (MH), the GST code (27) or the name, in any case. */
export function resolveState(v: unknown): GstState | null {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return null;
  return GST_STATES.find((s) => s.zoho.toLowerCase() === t || s.gst === t || s.name.toLowerCase() === t) || null;
}

export type GstKind = 'intra' | 'inter' | 'unknown';

export interface GstSplit {
  kind: GstKind;
  /** What the invoice will read, e.g. "CGST 9% + SGST 9%". */
  label: string;
}

/**
 * Where the client is decides the split: the studio's own state means CGST and
 * SGST, anywhere else means IGST. Never defaulted -- when either state is not
 * known the answer is 'unknown' and the caller has to ask.
 */
export function gstSplit(studioState: GstState | null, clientState: GstState | null, ratePct: number): GstSplit {
  if (!(ratePct > 0)) return { kind: 'unknown', label: 'No GST' };
  if (!studioState || !clientState) return { kind: 'unknown', label: `GST ${ratePct}%` };
  if (studioState.gst === clientState.gst) {
    const half = ratePct / 2;
    return { kind: 'intra', label: `CGST ${half}% + SGST ${half}%` };
  }
  return { kind: 'inter', label: `IGST ${ratePct}%` };
}

export interface ZohoTax {
  tax_id: string;
  tax_name?: string;
  tax_percentage?: number;
  /** 'tax_group' for the CGST+SGST pair, 'tax' for a single tax such as IGST. */
  tax_type?: string;
  /** 'intra' or 'inter', as Zoho India marks them. */
  tax_specification?: string;
}

/**
 * The tax a line should carry.
 *
 * Zoho India marks each tax `intra` or `inter`, and the CGST+SGST pair as a
 * `tax_group`; that is the primary signal. Failing that (an older response, or
 * a studio that renamed things) it falls back to the usual names, "GST18" for
 * the group and "IGST18" for the inter-state tax. A lone 9% CGST is never
 * chosen for an 18% line: the percentage must match and, inside the state, it
 * must be the group.
 */
export function pickTaxId(taxes: ZohoTax[], kind: GstKind, ratePct: number): string | null {
  if (kind === 'unknown') return null;
  const named = (t: ZohoTax) => String(t.tax_name || '').trim().toUpperCase();
  const sameRate = (t: ZohoTax) => Math.abs(Number(t.tax_percentage) - ratePct) < 0.001;
  const matches = (t: ZohoTax) => {
    if (!sameRate(t)) return false;
    if (kind === 'inter') return t.tax_specification === 'inter' || (!t.tax_specification && named(t).startsWith('IGST'));
    const group = t.tax_type ? t.tax_type === 'tax_group' : true;
    return group && (t.tax_specification === 'intra' || (!t.tax_specification && /^GST/.test(named(t))));
  };
  const found = taxes.find(matches);
  return found ? found.tax_id : null;
}

// ── Invoice numbers ──────────────────────────────────────────────────────────

/** Today's date in India, as parts. A server clock in UTC would put 1 April, 00:30 IST in March. */
export function istDateParts(now: Date): { y: number; m: number; d: number } {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
}

export const isoDateIst = (now: Date): string => {
  const { y, m, d } = istDateParts(now);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Indian financial year, 1 April to 31 March: "2026-27". */
export function financialYear(now: Date): string {
  const { y, m } = istDateParts(now);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export type NumberingMode = 'zoho' | 'template';

export const DEFAULT_NUMBER_TEMPLATE = '{FY}/';
const TEMPLATE_PATTERN = /^[A-Za-z0-9/_.\-{} ]{1,40}$/;

/**
 * A template is the fixed part of the number; the sequence is appended, three
 * digits wide. `FFDS/{FY}/` gives FFDS/2026-27/001. Only {FY} is recognised.
 */
export function validateNumberTemplate(t: unknown): string | null {
  if (typeof t !== 'string' || !TEMPLATE_PATTERN.test(t)) {
    return 'Use letters, digits and / _ . - only, up to 40 characters.';
  }
  const stripped = t.replace(/\{FY\}/g, '');
  if (/[{}]/.test(stripped)) return 'Only {FY} is a recognised placeholder.';
  return null;
}

export const numberPrefix = (template: string, now: Date): string => template.replace(/\{FY\}/g, financialYear(now));

/**
 * The next number in a series: the highest sequence already used under this
 * financial year's prefix, plus one. Numbers that do not end in digits after
 * the prefix are not part of the series and are ignored.
 */
export function nextInvoiceNumber(template: string, now: Date, existing: string[]): string {
  const prefix = numberPrefix(template, now);
  let highest = 0;
  for (const n of existing) {
    if (typeof n !== 'string' || !n.startsWith(prefix)) continue;
    const tail = n.slice(prefix.length);
    if (/^\d+$/.test(tail)) highest = Math.max(highest, parseInt(tail, 10));
  }
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

// ── The draft ────────────────────────────────────────────────────────────────

export interface DraftInvoiceInput {
  customerId: string;
  /** YYYY-MM-DD */
  date: string;
  projectName: string;
  milestoneName: string;
  /** Ex-GST value of this invoice, whole rupees as the app computes it. */
  taxableAmount: number;
  /** 0 when this invoice carries no GST. */
  gstRatePct: number;
  hsnOrSac: string;
  itemId: string;
  taxId: string | null;
  placeOfSupply: string;
  gstin?: string;
  /** Concessions that come off after GST: the retainer already paid, and any goodwill discount. */
  retainerDeducted?: number;
  discountApplied?: number;
  discountReason?: string;
  /** Present only when the studio numbers invoices itself; otherwise Zoho assigns it. */
  invoiceNumber?: string;
  paymentTermsDays?: number;
  notes?: string;
}

export interface DraftInvoice {
  body: Record<string, unknown>;
  /** Query parameters, besides organization_id. */
  query: Record<string, string>;
}

export function buildInvoicePayload(i: DraftInvoiceInput): DraftInvoice {
  const taxable = Math.round(i.taxableAmount);
  const line: Record<string, unknown> = {
    item_id: i.itemId,
    name: i.milestoneName.slice(0, 100),
    description: `${i.projectName} — ${i.milestoneName}`.slice(0, 2000),
    rate: taxable,
    quantity: 1,
    hsn_or_sac: i.hsnOrSac,
  };
  if (i.gstRatePct > 0 && i.taxId) line.tax_id = i.taxId;

  const body: Record<string, unknown> = {
    customer_id: i.customerId,
    date: i.date,
    place_of_supply: i.placeOfSupply,
    gst_treatment: i.gstin ? 'business_gst' : 'consumer',
    line_items: [line],
  };
  if (i.gstin) body.gst_no = i.gstin;
  if (i.paymentTermsDays && i.paymentTermsDays > 0) body.payment_terms = Math.min(100, Math.round(i.paymentTermsDays));
  if (i.notes) body.notes = i.notes;

  // After-GST reductions travel as one negative adjustment, so Zoho's total is
  // the payable the studio's own schedule shows.
  const reductions: string[] = [];
  const retainer = Math.max(0, Math.round(i.retainerDeducted || 0));
  const discount = Math.max(0, Math.round(i.discountApplied || 0));
  if (retainer > 0) reductions.push('Less: initiation retainer already paid');
  if (discount > 0) reductions.push(i.discountReason ? `Less: concession — ${i.discountReason}` : 'Less: concession');
  if (retainer + discount > 0) {
    body.adjustment = -(retainer + discount);
    body.adjustment_description = reductions.join('; ').slice(0, 100);
  }

  const query: Record<string, string> = {};
  if (i.invoiceNumber) {
    body.invoice_number = i.invoiceNumber;
    query.ignore_auto_number_generation = 'true';
  }
  return { body, query };
}

/** What the studio's own schedule says this invoice totals, to compare with what Zoho returns. */
export const expectedInvoiceTotal = (taxable: number, gst: number, retainer = 0, discount = 0): number =>
  Math.max(0, Math.round(taxable) + Math.round(gst) - Math.round(retainer) - Math.round(discount));
