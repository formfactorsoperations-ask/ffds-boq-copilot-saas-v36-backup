/*
  Every studio setting, described once.

  The settings screen had thirty-eight fields spread across six accordions with
  titles like "Studio Profile, Branding & Signatory Authority", all closed by
  default. Finding the GSTIN field meant opening each one and reading. Nothing
  told you which fields were still empty, and several of them silently decide
  whether a contract or an invoice comes out correct.

  So the fields are described as data rather than only as markup: one list that
  the search box, the section rail and the readiness gauge all read from. A
  field added to a section here is searchable and counted without touching any
  of the three.
*/

import { OrganizationContext } from '../types';

export type SectionId =
  | 'identity'
  | 'team'
  | 'financial'
  | 'contract'
  | 'portal'
  | 'appearance'
  | 'system';

export interface SettingsSection {
  id: SectionId;
  label: string;
  /** What this section is for, in the studio's terms rather than the schema's. */
  blurb: string;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'identity', label: 'Studio identity', blurb: 'Legal name, contact details and who signs contracts' },
  { id: 'team', label: 'Team & roles', blurb: 'Who works here and what each person can reach' },
  { id: 'financial', label: 'Money', blurb: 'Bank account, UPI, GST and the default design fee' },
  { id: 'contract', label: 'Contract terms', blurb: 'Standing wording, fee tranches and lead times' },
  { id: 'portal', label: 'Client portal', blurb: 'What clients see and how they are nudged' },
  { id: 'appearance', label: 'Appearance', blurb: 'Typeface, palette and table density' },
  { id: 'system', label: 'Data & integrations', blurb: 'Calendar sync, backups and the audit trail' },
];

/** How badly a missing value hurts. */
export type Criticality = 'required' | 'recommended' | 'optional';

export interface SettingsField {
  /** Path within the organization document. Dotted for nested values. */
  key: string;
  label: string;
  section: SectionId;
  criticality: Criticality;
  /** What breaks when this is empty — shown against the field, not in a tooltip. */
  consequence?: string;
  /** Extra words someone might search for that are not in the label. */
  aliases?: string[];
}

/*
  `required` is reserved for fields that make a document wrong rather than plain.
  A missing signatory name prints a contract nobody has signed; a missing GSTIN
  prints an invoice that is not a tax invoice. A missing tagline prints a
  slightly barer cover page, which is why it is not on this list.
*/
export const SETTINGS_FIELDS: SettingsField[] = [
  // Identity
  { key: 'orgName', label: 'Studio name', section: 'identity', criticality: 'required', consequence: 'Every document header and the client portal use this' },
  { key: 'legalName', label: 'Legal entity name', section: 'identity', criticality: 'required', consequence: 'Contracts are signed in this name', aliases: ['company', 'pvt ltd', 'llp'] },
  { key: 'orgLogo', label: 'Studio logo', section: 'identity', criticality: 'recommended', consequence: 'Proposals and invoices fall back to plain text' },
  { key: 'tagline', label: 'Tagline', section: 'identity', criticality: 'optional' },
  { key: 'contactEmail', label: 'Contact email', section: 'identity', criticality: 'required', consequence: 'Clients reply to this address' },
  { key: 'contactPhone', label: 'Contact phone', section: 'identity', criticality: 'recommended' },
  { key: 'officeAddress', label: 'Registered address', section: 'identity', criticality: 'required', consequence: 'Required on a tax invoice' },
  { key: 'cityState', label: 'City & state', section: 'identity', criticality: 'recommended', consequence: 'Decides CGST/SGST versus IGST on invoices' },
  { key: 'website', label: 'Website', section: 'identity', criticality: 'optional' },
  { key: 'instagramUrl', label: 'Instagram', section: 'identity', criticality: 'optional', aliases: ['social'] },
  { key: 'about', label: 'About the studio', section: 'identity', criticality: 'recommended', consequence: 'Used on the proposal introduction page' },
  { key: 'credentials', label: 'Credentials', section: 'identity', criticality: 'optional', consequence: 'Listed in the client portal footer' },
  { key: 'signatoryName', label: 'Authorised signatory', section: 'identity', criticality: 'required', consequence: 'Contracts print an unsigned signature block without it', aliases: ['sign', 'principal'] },
  { key: 'signatoryTitle', label: 'Signatory title', section: 'identity', criticality: 'required', consequence: 'Appears beneath the signature' },

  // Money
  { key: 'gstin', label: 'GSTIN', section: 'financial', criticality: 'required', consequence: 'Without it an invoice is not a tax invoice', aliases: ['tax id', 'gst number'] },
  { key: 'defaultGstRate', label: 'Default GST rate', section: 'financial', criticality: 'required', consequence: 'Applied to every new BOQ' },
  { key: 'bankDetails.accountName', label: 'Account name', section: 'financial', criticality: 'required', consequence: 'Payment instructions on invoices' },
  { key: 'bankDetails.bankName', label: 'Bank', section: 'financial', criticality: 'required' },
  { key: 'bankDetails.accountNumber', label: 'Account number', section: 'financial', criticality: 'required', consequence: 'Clients cannot pay without it' },
  { key: 'bankDetails.ifscCode', label: 'IFSC code', section: 'financial', criticality: 'required', aliases: ['neft', 'rtgs'] },
  { key: 'bankDetails.upiId', label: 'UPI ID', section: 'financial', criticality: 'recommended', aliases: ['gpay', 'phonepe'] },
  { key: 'bankDetails.qrCodeImage', label: 'Payment QR code', section: 'financial', criticality: 'optional' },
  { key: 'designFeePercentage', label: 'Default design fee %', section: 'financial', criticality: 'recommended', consequence: 'Pre-fills the fee on a new proposal' },

  // Contract terms
  { key: 'defaultContractWordings.paymentTermsText', label: 'Payment terms wording', section: 'contract', criticality: 'required', consequence: 'Printed verbatim in every contract' },
  { key: 'defaultContractWordings.revisionsText', label: 'Revisions wording', section: 'contract', criticality: 'recommended', consequence: 'Defines how many rounds are included' },
  { key: 'defaultContractWordings.forceMajeureText', label: 'Force majeure wording', section: 'contract', criticality: 'recommended' },
  { key: 'defaultContractWordings.clientObsText', label: 'Client obligations wording', section: 'contract', criticality: 'recommended' },
  { key: 'procurementLeadTimeWeeks', label: 'Procurement lead time', section: 'contract', criticality: 'recommended', consequence: 'Feeds the programme dates' },

  // Client portal
  { key: 'businessHours', label: 'Business hours', section: 'portal', criticality: 'recommended', consequence: 'Shown to clients in the portal' },
  { key: 'pmResponseTime', label: 'Response time commitment', section: 'portal', criticality: 'recommended' },
  { key: 'siteVisitPolicy', label: 'Site visit policy', section: 'portal', criticality: 'optional' },
  { key: 'escalationPolicy', label: 'Escalation policy', section: 'portal', criticality: 'optional' },

  // Appearance
  { key: 'themeColor', label: 'Brand colour', section: 'appearance', criticality: 'recommended', consequence: 'Accent colour across documents' },
];

/** Read a possibly-dotted key off the organization document. */
export function readField(org: Partial<OrganizationContext> | undefined, key: string): unknown {
  if (!org) return undefined;
  return key.split('.').reduce<any>((node, part) => (node == null ? undefined : node[part]), org);
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return true;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return Boolean(value);
}

export interface Readiness {
  requiredTotal: number;
  requiredFilled: number;
  recommendedTotal: number;
  recommendedFilled: number;
  /** Required completion, 0-100 — what the gauge shows. */
  pct: number;
  missingRequired: SettingsField[];
  missingRecommended: SettingsField[];
  bySection: Record<SectionId, { total: number; filled: number; missingRequired: number }>;
}

/**
 * How ready this studio is to issue a correct document.
 *
 * The gauge reports required fields only. Mixing in the optional ones would
 * let a studio sit at 80% while missing the GSTIN, which is the single field
 * that decides whether an invoice is valid.
 */
export function assessReadiness(org: Partial<OrganizationContext> | undefined): Readiness {
  const bySection = {} as Readiness['bySection'];
  for (const s of SETTINGS_SECTIONS) bySection[s.id] = { total: 0, filled: 0, missingRequired: 0 };

  const missingRequired: SettingsField[] = [];
  const missingRecommended: SettingsField[] = [];
  let requiredTotal = 0, requiredFilled = 0, recommendedTotal = 0, recommendedFilled = 0;

  for (const field of SETTINGS_FIELDS) {
    const filled = isFilled(readField(org, field.key));
    const bucket = bySection[field.section];
    if (bucket) {
      bucket.total++;
      if (filled) bucket.filled++;
    }

    if (field.criticality === 'required') {
      requiredTotal++;
      if (filled) requiredFilled++;
      else { missingRequired.push(field); if (bucket) bucket.missingRequired++; }
    } else if (field.criticality === 'recommended') {
      recommendedTotal++;
      if (filled) recommendedFilled++;
      else missingRecommended.push(field);
    }
  }

  return {
    requiredTotal,
    requiredFilled,
    recommendedTotal,
    recommendedFilled,
    pct: requiredTotal ? Math.round((requiredFilled / requiredTotal) * 100) : 100,
    missingRequired,
    missingRecommended,
    bySection,
  };
}

/** Fields matching a query, best matches first. */
export function searchSettings(query: string): SettingsField[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { field: SettingsField; score: number }[] = [];

  for (const field of SETTINGS_FIELDS) {
    const label = field.label.toLowerCase();
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if (field.aliases?.some((a) => a.toLowerCase().includes(q))) score = 45;
    else if (field.key.toLowerCase().includes(q)) score = 30;
    else if (field.consequence?.toLowerCase().includes(q)) score = 15;
    if (score) scored.push({ field, score });
  }

  return scored.sort((a, b) => b.score - a.score || a.field.label.localeCompare(b.field.label)).map((s) => s.field);
}
