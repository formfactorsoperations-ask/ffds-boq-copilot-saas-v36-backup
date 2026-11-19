/**
 * Annexure A — the Commercial Terms & Conditions every proposal ends with.
 *
 * The clauses used to be written into the booklet's markup, so the validity
 * period (15 days), the warranty (6 months on carpentry) and the assumptions
 * were the same on every proposal, whatever Terms & Payment said. Now:
 *
 *   • the wording is held in Terms & Payment (`TermsSettings.annexure`), with
 *     today's wording as the default, so the booklet and the PDF print one text;
 *   • the validity period is `TermsSettings.proposalValidityDays` (default 15);
 *   • the warranty is read from `TermsSettings.warrantyPeriods`;
 *   • the assumptions switch to the renovation set when the BOQ has civil work;
 *   • the exclusions still follow the BOQ, as they did.
 *
 * Each default clause keeps the key the booklet's inline editor stored it under
 * (`id`), so a clause a studio already reworded on one project keeps its words.
 * Clauses may carry {{tokens}}, filled per project by `fillClause`.
 */
import type { TermsSettings } from '../types';

export interface AnnexClause {
  /** The booklet's edit key for this clause; new clauses get a fresh one. */
  id: string;
  text: string;
}

export interface AnnexureClauses {
  /** 3 · Taxes. */
  taxes: AnnexClause[];
  /** 4 · Payment terms. */
  paymentTerms: AnnexClause[];
  /** 5 · Project initiation fee: covered, and not covered. */
  initiationCovered: AnnexClause[];
  initiationNotCovered: AnnexClause[];
  /** 6 · Scope, quantities and variations (the carpentry clause follows the BOQ and is added after these). */
  scope: AnnexClause[];
  /** 8 · Programme and start conditions. */
  startConditions: AnnexClause[];
  /** 9 · Assumptions, for an interiors-only project and for one with civil work. */
  assumptions: AnnexClause[];
  renovationAssumptions: AnnexClause[];
  /** 9 · Client responsibilities. */
  clientResponsibilities: AnnexClause[];
  /** 10 · Materials, samples and workmanship. */
  materials: AnnexClause[];
  /** 11 · Handover, warranty and validity: the warranty and validity sentences are added from settings. */
  handover: AnnexClause[];
  handoverAfter: AnnexClause[];
  /** 11 · After the validity sentence. */
  closing: AnnexClause[];
}

export type AnnexureKey = keyof AnnexureClauses;

/** The studio's default validity, in days from the date of issue. */
export const DEFAULT_VALIDITY_DAYS = 15;

/** Terms & Payment's standard warranty periods (services/engagementService FFDS_TERMS_DEFAULTS). */
export const DEFAULT_WARRANTY_PERIODS: TermsSettings['warrantyPeriods'] = [
  { trade: 'Civil work and carpentry', months: 12 },
  { trade: 'Painting and electrical', months: 6 },
];

/** The Project Initiation Fee the proposal quotes when the project has not recorded one. */
export const STANDARD_INITIATION_FEE = 4999;

const c = (id: string, text: string): AnnexClause => ({ id, text });

/** Today's wording, clause for clause, with the booklet's edit keys. */
export const ANNEXURE_DEFAULTS: AnnexureClauses = {
  taxes: [
    c('5a972bbe', 'GST shall be applicable on amounts invoiced by {{companyName}} at the prevailing statutory rate, currently {{gstRate}}%, on both the execution value and the design and coordination fee.'),
    c('6277da00', 'Where a direct client purchase or a payment to a third-party supplier is specifically agreed and documented in writing, that item shall be invoiced separately by the respective supplier and falls outside the FFDS contracted value.'),
    c('951a9977', 'Any change in statutory rates or the introduction of any new levy after the date of this proposal shall apply to invoices raised thereafter.'),
  ],
  paymentTerms: [
    c('e5896545', 'All stage payments are payable in advance of the corresponding stage. Material orders are placed only against cleared funds.'),
    c('annex.4.shares', 'Design fee shares are percentages of {{designFee}}; execution shares are percentages of {{executionValue}}. Stage amounts are rounded to the nearest rupee, with the first stage of each carrying the rounding adjustment so that stages sum exactly to the net taxable value.'),
    c('7ed2b5a5', 'GST is added on each invoice at the prevailing rate.'),
    c('12eac516', 'The Project Initiation Fee of {{initiationFee}} is adjusted against the Design 1 invoice and is not additional to the total above.'),
    c('db32bcf7', 'Delays in approvals or payments will proportionately revise the project programme.'),
  ],
  initiationCovered: [
    c('c7d19951', 'Site measurement'),
    c('c944f2ce', 'Requirement documentation'),
    c('a2587158', 'Preliminary scope validation'),
  ],
  initiationNotCovered: [
    c('dcaf0421', '✕ Layouts and space planning'),
    c('0a39764b', '✕ 3D visualisation'),
    c('ef057aa4', '✕ GFC and joinery drawings'),
    c('596fda86', '✕ Schedule of Finishes'),
    c('ea7bccb7', '✕ Final BOQ'),
  ],
  scope: [
    c('d0bdccbc', 'Only items listed in the proposal booklet are included. Any item not written into the scope is not included.'),
    c('49611ff2', 'Quantities are as presently measured or estimated and are re-verified at site validation. Variation of more than 5% on any line will be notified in writing with the revised value before the affected work is ordered or commenced. Quantities are then adjusted to actual measured quantity at the rates underlying this proposal.'),
    c('f8a0f6fc', 'Any addition, deletion or specification change after design freeze will be quoted as a written variation and becomes payable with the next stage invoice once approved.'),
    c('844cdbdf', "Items marked as actuals are billed at actual supplier cost against the client's approved selection and are not part of the fixed value. An indicative allowance for electrical fittings will be issued with the Schedule of Finishes for budgeting."),
  ],
  startConditions: [
    c('234b3c76', 'Design and material selection freeze, with the Schedule of Finishes approved in writing'),
    c('8ce93c71', 'Receipt of the required stage payment'),
    c('eccf2fa5', 'Availability of the site for uninterrupted work, vacant and free of stored goods'),
    c('74529f93', 'Society permissions, work timings and lift or hoist access confirmed'),
  ],
  assumptions: [
    c('290937c5', 'Single continuous mobilisation, flat vacant and available'),
    c('3fd1e7c5', 'Existing walls, slab, flooring and plumbing sound and reusable as-is'),
    c('1f030dd5', 'Existing distribution board adequate for the proposed load'),
    c('bc0d9cf4', 'Normal society working hours, lift or hoist access available'),
    c('9281477b', 'Water and power available at site for construction use'),
    c('a515cc89', 'No structural alteration, waterproofing or slab work required'),
  ],
  renovationAssumptions: [
    c('290937c5', 'Single continuous mobilisation, flat vacant and available'),
    c('reno.structure', 'Slab and structure sound; walls marked for breaking are non-structural, confirmed by the society or a structural engineer before work starts'),
    c('reno.finishes', 'Flooring, tiling and waterproofing only where listed in this proposal; elsewhere existing finishes stay'),
    c('1f030dd5', 'Existing distribution board adequate for the proposed load'),
    c('bc0d9cf4', 'Normal society working hours, lift or hoist access available'),
    c('9281477b', 'Water and power available at site for construction use'),
  ],
  clientResponsibilities: [
    c('98841019', 'Timely approval of layouts, 3D views, samples and the Schedule of Finishes'),
    c('fe404b04', 'Society intimation, permissions and any refundable deposits'),
    c('8b9f6596', 'Statutory, municipal and society charges'),
    c('3ac27417', 'Vacant possession of the flat for the execution period'),
    c('bc982e1e', 'Selection of electrical fittings and appliances within the agreed window'),
    c('bb5a4459', 'Stage payments in advance of each stage'),
    c('454e9d53', 'Attendance at the joint snag inspection before handover'),
  ],
  materials: [
    c('012d8dd8', 'Final brands, shades and finishes are selected against physical samples during the Schedule of Finishes stage and recorded in writing.'),
    c('annex.10.equivalent', 'Where a specified brand is unavailable, {{companyName}} will propose an equivalent of the same or higher grade for written approval before ordering. No substitution will be made without approval.'),
    c('03e3b121', 'Carpentry is built to approved GFC drawings. Exposed surfaces are laminated, edges banded and carcass interiors finished. Electrical points are tested and recorded before ceiling closure.'),
  ],
  handover: [
    c('f5d39714', 'Handover follows closure of the joint snag list, deep cleaning of the worked areas, and release of the handover dossier and warranty note.'),
  ],
  handoverAfter: [
    c('27cd97b9', 'Manufacturer warranties on hardware, laminates, paint and electrical fittings apply as issued by the respective brand.'),
    c('992a1058', 'Warranty excludes damage arising from misuse, water ingress, alteration by others and normal wear.'),
  ],
  closing: [
    c('9dbf30b1', 'On confirmation, the turnkey agreement and the final BOQ together form the contract; the proposal booklet forms the basis of scope.'),
  ],
};

/** The headings the Terms & Payment editor shows for each list. */
export const ANNEXURE_SECTIONS: { key: AnnexureKey; title: string; note?: string }[] = [
  { key: 'taxes', title: '3 · Taxes' },
  { key: 'paymentTerms', title: '4 · Payment terms' },
  { key: 'initiationCovered', title: '5 · Covered by the initiation fee' },
  { key: 'initiationNotCovered', title: '5 · Not covered by the initiation fee' },
  { key: 'scope', title: '6 · Scope, quantities and variations', note: 'The carpentry clause follows the BOQ and is added after these.' },
  { key: 'startConditions', title: '8 · Start conditions' },
  { key: 'assumptions', title: '9 · Assumptions, interiors only' },
  { key: 'renovationAssumptions', title: '9 · Assumptions, with civil work', note: 'Used instead when the BOQ has civil work: wall breaks, new walls, re-flooring, waterproofing.' },
  { key: 'clientResponsibilities', title: '9 · Client responsibilities' },
  { key: 'materials', title: '10 · Materials, samples and workmanship' },
  { key: 'handover', title: '11 · Handover, before the warranty', note: 'The warranty is written from Warranty Periods, and the validity from the validity period.' },
  { key: 'handoverAfter', title: '11 · Handover, after the warranty' },
  { key: 'closing', title: '11 · After the validity sentence' },
];

/** The words the clauses may use, filled per project. */
export const ANNEXURE_TOKENS = ['companyName', 'gstRate', 'designFee', 'executionValue', 'initiationFee'] as const;

/** The studio's Annexure A: its saved lists where it has them, today's wording where it does not. */
export function annexureOf(terms: Pick<TermsSettings, 'annexure'> | null | undefined): AnnexureClauses {
  const saved = (terms?.annexure || {}) as Partial<AnnexureClauses>;
  const out = {} as AnnexureClauses;
  (Object.keys(ANNEXURE_DEFAULTS) as AnnexureKey[]).forEach((k) => {
    const list = saved[k];
    out[k] = Array.isArray(list)
      ? list.filter((x) => x && typeof x.text === 'string').map((x, i) => ({ id: x.id || `${k}.${i}`, text: x.text }))
      : ANNEXURE_DEFAULTS[k];
  });
  return out;
}

/** Fills {{tokens}} in a clause. An unknown token is left as written, so a typo shows rather than vanishing. */
export function fillClause(text: string, values: Partial<Record<(typeof ANNEXURE_TOKENS)[number], string>>): string {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name) =>
    (values as Record<string, string | undefined>)[name] ?? all);
}

/** The studio's validity period in days: a whole number of at least 1, else the default. */
export function validityDaysOf(terms: Pick<TermsSettings, 'proposalValidityDays'> | null | undefined): number {
  const d = Math.round(Number(terms?.proposalValidityDays));
  return Number.isFinite(d) && d >= 1 ? d : DEFAULT_VALIDITY_DAYS;
}

/** The last day the proposal holds: the issue date plus the validity period. */
export function validUntil(issued: Date, days: number): Date {
  const d = new Date(issued.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Clause 11's validity sentence. */
export function validitySentence(days: number, issued: Date): string {
  return `This proposal is valid for ${days} days from ${longDate(issued)}, until ${longDate(validUntil(issued, days))}, and supersedes all prior estimates, verbal indications and written communication on this project. Where any earlier document conflicts, the proposal booklet and this Annexure prevail.`;
}

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`;

/**
 * Clause 11's warranty sentence, from Terms & Payment's warranty periods:
 * "…a workmanship warranty from handover of 12 months on civil work and
 * carpentry, and 6 months on painting and electrical, covering…".
 */
export function warrantySentence(companyName: string, periods: TermsSettings['warrantyPeriods'] | null | undefined): string {
  const who = companyName || 'The studio';
  // A studio that has never saved Terms & Payment has the standard periods it would be seeded with.
  const ps = (periods ?? DEFAULT_WARRANTY_PERIODS).filter((p) => p && p.trade && Number(p.months) > 0);
  if (!ps.length) {
    return `${who} provides a workmanship warranty of 6 months from handover on carpentry executed under this contract, covering manufacturing and installation defects.`;
  }
  const parts = ps.map((p) => `${months(Number(p.months))} on ${lower(p.trade.trim())}`);
  const list = parts.length === 1 ? parts[0]
    : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  return `${who} provides a workmanship warranty from handover of ${list} executed under this contract, covering manufacturing and installation defects.`;
}

/*
  Civil work, for the assumptions. A line is civil when it is on the civil
  layer (PR C), or its category or name says it breaks, builds, re-floors or
  waterproofs. Lines out of the scope do not count.
*/
const CIVIL_CAT = /^(civil|civil works?|demolition|waterproofing)$/i;
const CIVIL_NAME = /\b(demolition|demolish|wall\s*break|break(ing)?\s+(the\s+)?(brick\s+)?wall|new\s+wall|brick\s*wall|block\s*wall|hack(ing)?|remove\s+existing\s+(floor\s+)?tiles?|tile\s+removal|waterproof(ing)?|re-?flooring|debris)\b/i;
const OUT_OF_SCOPE = new Set(['deleted', 'substituted', 'excluded', 'client_procured']);

export function hasCivilWork(lines: Array<{ name?: string; cat?: string; category?: string; civil?: unknown; boqStatus?: string }> | null | undefined): boolean {
  return (lines || []).some((l) => {
    if (!l || OUT_OF_SCOPE.has(String(l.boqStatus || ''))) return false;
    if (l.civil) return true;
    return CIVIL_CAT.test(String(l.cat || l.category || '').trim()) || CIVIL_NAME.test(String(l.name || ''));
  });
}

/** The assumptions to print: the renovation set when there is civil work. */
export function assumptionsFor(a: AnnexureClauses, civil: boolean): AnnexClause[] {
  return civil ? a.renovationAssumptions : a.assumptions;
}

/** A fresh id for a clause added in the editor. */
export const newClauseId = (key: AnnexureKey) => `${key}.${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
