/*
  WHO SEES WHAT ON THE OPS DESK (Ops Desk 2.1, phase 2; owner's choice, 11 Nov 2026).

  Client Relations (the ops exec) reads a copy of each assigned project that
  the server makes without the money (functions/src/teamView.ts). Five more
  things can go into that copy, each behind a switch the Owner or the Ops
  Director turns on in the desk's "Who sees what". Every switch starts off,
  so nothing changes for anyone until a lead turns one on, and what is off is
  never written into the copy at all: hiding it on the screen would not keep
  it from the browser.

    site      the site team's updates and blockers (never the order list or costs)
    messages  the client's portal messages, with every amount masked
    proposal  which proposal the client accepted: its name, never its price
    drive     the link to the project's Google Drive folder of approved drawings
    cover     a colleague's projects for set days, given by a lead; it ends by itself

  Pure, with no Firebase imports, so the server and the app share it.
*/

export type OpsAccessKey = 'site' | 'messages' | 'proposal' | 'drive' | 'cover';
export const OPS_ACCESS_KEYS: OpsAccessKey[] = ['site', 'messages', 'proposal', 'drive', 'cover'];
export type OpsAccess = Record<OpsAccessKey, boolean>;
export const NO_ACCESS: OpsAccess = { site: false, messages: false, proposal: false, drive: false, cover: false };

export const ACCESS_META: Record<OpsAccessKey, { label: string; why: string }> = {
  site: { label: 'Site updates, photos and blockers', why: 'What the site team reports, to answer the client and build the weekly update. The order list and its costs stay out.' },
  messages: { label: 'The client’s portal messages', why: 'Answer the client without asking around. Every amount in a message is masked.' },
  proposal: { label: 'Which proposal the client accepted', why: 'The option’s name, never its price.' },
  drive: { label: 'The project’s Google Drive folder', why: 'Send approved drawings from one place.' },
  cover: { label: 'Cover for a colleague’s projects', why: 'A lead gives you a colleague’s projects for set days. It ends by itself.' },
};

/** What stays the same whatever the switches say. */
export const ALWAYS: [string, boolean][] = [
  ['Client, contacts, stages and handover', true], ['Drawings and their approval', true], ['Decisions and minutes', true],
  ['Payment milestones: name, status, invoice, date', true], ['BOQ lines by quantity', true],
  ['Payment amounts and totals', false], ['Rates, costs, margins, vendor quotes', false], ['Agreements and signed documents', false],
  ['Projects not assigned to them (except cover)', false],
];

/** The studio's switches. Only `true` turns one on; anything else is off. */
export function opsAccessOf(org: any): OpsAccess {
  const a = org?.opsDesk?.access || {};
  return Object.fromEntries(OPS_ACCESS_KEYS.map((k) => [k, a[k] === true])) as OpsAccess;
}

/* ── Amounts in a client's message ───────────────────────────────────────── */

/**
 * Every amount in a message, masked: rupee figures in any of the ways people
 * write them (₹, Rs, INR, "/-", lakh, lac, crore, k), and long figures with
 * Indian or Western commas. Dates, phone numbers and small counts stay.
 */
export function maskAmounts(text: string): string {
  let s = String(text ?? '');
  const num = String.raw`\d[\d,]*(?:\.\d+)?`;
  s = s.replace(new RegExp(String.raw`(?:₹|\bRs\.?|\bINR)\s*${num}(?:\s*(?:lakhs?|lacs?|crores?|cr|k|l)\b)?(?:\s*\/-)?`, 'gi'), '₹ amount');
  s = s.replace(new RegExp(String.raw`\b${num}\s*(?:lakhs?|lacs?|crores?|cr)\b`, 'gi'), '₹ amount');
  s = s.replace(new RegExp(String.raw`\b${num}\s*\/-`, 'g'), '₹ amount');
  s = s.replace(/\b\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d+)?\b/g, '₹ amount');
  return s;
}

/* ── What the switches add to the copy ───────────────────────────────────── */

const SITE_KEYS = ['id', 'date', 'at', 'createdAt', 'title', 'text', 'note', 'description', 'by', 'author', 'reportedBy', 'images', 'photos', 'photoUrls', 'resolved', 'resolvedAt', 'severity', 'status', 'type', 'bundleId', 'room'];
const pick = (o: any, keys: string[]) => {
  const out: any = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of keys) if (o[k] !== undefined) out[k] = typeof o[k] === 'string' ? String(o[k]).slice(0, 2000) : o[k];
  return out;
};

export interface OpsExtras {
  /** Which switches are on, so the screens can say what is off. */
  opsAccess: OpsAccess;
  siteWork?: { updates: any[]; blockers: any[] };
  portalMessages?: { id: string; text: string; sentAt: string; sentBy: string; aboutLabel: string | null; readAt: string | null }[];
  acceptedProposal?: { name: string; at: number | null; via: string | null } | null;
  driveFolder?: string | null;
}

/**
 * What the switches add to the Client Relations copy of a project. Only the
 * fields named here are taken, so nothing with money in it can ride along.
 */
export function opsExtrasOf(project: any, access: OpsAccess, drive?: { link?: string | null } | null): OpsExtras {
  const out: OpsExtras = { opsAccess: access };
  const ctx = project?.context || {};
  if (access.site) {
    const ex = project?.activeProject?.executionData || {};
    out.siteWork = {
      updates: (Array.isArray(ex.updates) ? ex.updates : []).slice(0, 60).map((u: any) => pick(u, SITE_KEYS)),
      blockers: (Array.isArray(ex.blockers) ? ex.blockers : []).slice(0, 60).map((b: any) => pick(b, SITE_KEYS)),
    };
  }
  if (access.messages) {
    out.portalMessages = (Array.isArray(ctx.clientMessages) ? ctx.clientMessages : []).slice(-80).map((m: any) => ({
      id: String(m?.id || ''), text: maskAmounts(String(m?.text || '')).slice(0, 4000), sentAt: String(m?.sentAt || ''), sentBy: String(m?.sentBy || ''),
      aboutLabel: m?.aboutLabel ? maskAmounts(String(m.aboutLabel)).slice(0, 200) : null, readAt: m?.readAt ? String(m.readAt) : null,
    }));
  }
  if (access.proposal) out.acceptedProposal = acceptedProposalOf(ctx);
  if (access.drive) out.driveFolder = drive?.link && /^https:\/\/drive\.google\.com\//.test(drive.link) ? drive.link : null;
  return out;
}

/** The proposal the client accepted, by name: the accepted tier, or the option they chose. Never its price. */
export function acceptedProposalOf(ctx: any): { name: string; at: number | null; via: string | null } | null {
  const a = ctx?.proposalAcceptance;
  if (a?.accepted && a.tierName) return { name: String(a.tierName).slice(0, 120), at: typeof a.at === 'number' ? a.at : null, via: a.via || null };
  const d = ctx?.proposalDecision;
  const chosen = d?.selected && Array.isArray(d.options) ? d.options.find((o: any) => o?.id === d.selected) : null;
  if (chosen?.title) return { name: maskAmounts(String(chosen.title)).slice(0, 120), at: null, via: null };
  return null;
}

/* ── Cover for a colleague ───────────────────────────────────────────────── */

export interface OpsCover {
  id: string;
  /** Who covers. */
  email: string;
  name: string;
  /** Whose projects. */
  forEmail: string;
  forName: string;
  projectIds: string[];
  /** The last moment of cover: the end of the chosen day in India. */
  until: number;
  by: string;
  byName: string;
  at: number;
}

const clean = (e: any) => String(e || '').trim().toLowerCase();
export function coversOf(org: any): OpsCover[] {
  const list = Array.isArray(org?.opsDesk?.cover) ? org.opsDesk.cover : [];
  return list
    .filter((c: any) => c && clean(c.email) && Array.isArray(c.projectIds) && typeof c.until === 'number')
    .map((c: any) => ({
      id: String(c.id || ''), email: clean(c.email), name: String(c.name || c.email), forEmail: clean(c.forEmail), forName: String(c.forName || c.forEmail || ''),
      projectIds: c.projectIds.map(String).slice(0, 200), until: c.until, by: clean(c.by), byName: String(c.byName || ''), at: Number(c.at) || 0,
    }));
}

/** Cover that holds now, and only while the cover switch is on. */
export const activeCovers = (org: any, now: number): OpsCover[] => (opsAccessOf(org).cover ? coversOf(org).filter((c) => c.until > now) : []);

/** Who covers this project now, to add to its copy's members. */
export const coverEmailsFor = (projectId: string, org: any, now: number): string[] =>
  [...new Set(activeCovers(org, now).filter((c) => c.projectIds.includes(projectId)).map((c) => c.email))];

/** When the next cover ends, for the hourly check that takes it away; null with none left. */
export function nextCoverEnd(covers: OpsCover[], now: number): number | null {
  const live = covers.filter((c) => c.until > now).map((c) => c.until);
  return live.length ? Math.min(...live) : null;
}

/** The end of a day (YYYY-MM-DD) in India, for "cover until". */
export const endOfDayIST = (key: string) => new Date(`${key}T23:59:59.999+05:30`).getTime();
