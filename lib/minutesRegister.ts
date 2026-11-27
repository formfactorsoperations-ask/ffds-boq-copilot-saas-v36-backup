/*
  THE MINUTES REGISTER: every minutes of one project, as one list.

  Each minutes falls in one of four piles by where it stands, so a lead can
  see at a glance what is still being written, what the studio still has to
  approve or send, what waits on the client and what is settled. The list is
  grouped by the month the meeting was held, newest first, and searches the
  title, the reference, the decisions and the actions.
*/
import { audienceOf, isLogOnly, statusChip, type ChipTone, type MeetingAudience } from './minutes';

export type RegisterPile = 'draft' | 'studio' | 'client' | 'settled';
export type RegisterFilter = 'all' | RegisterPile;

export const PILE_LABEL: Record<RegisterPile, string> = {
  draft: 'Drafts',
  studio: 'With the studio',
  client: 'Waiting for client',
  settled: 'Confirmed',
};

/** Where a minutes stands: being written, with the studio, with the client, or settled. */
export function pileOf(m: any): RegisterPile {
  if (m?.revisionStage === 'draft') return 'draft';
  if (m?.revisionStage === 'pending_review') return 'studio';
  switch (String(m?.status || 'draft')) {
    case 'acknowledged': return 'settled';
    case 'shared':
    case 'correction_requested': return 'client';
    case 'pending_review': return 'studio';
    case 'finalised': return isLogOnly(m?.meetingType) ? 'settled' : 'studio';
    default: return 'draft';
  }
}

const OLD_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: 'Draft', tone: 'slate' },
  pending_review: { label: 'With a lead', tone: 'amber' },
  finalised: { label: 'Finalised', tone: 'brand' },
  shared: { label: 'Waiting for client', tone: 'amber' },
  acknowledged: { label: 'Confirmed', tone: 'emerald' },
  correction_requested: { label: 'Correction asked', tone: 'rose' },
};

/** The status chip for a minutes in either format. */
export const chipOf = (m: any): { label: string; tone: ChipTone } =>
  m?.format === 2 ? statusChip(m) : OLD_STATUS[String(m?.status)] || OLD_STATUS.draft;

const toMs = (v: any): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; }
  return 0;
};

/** When the meeting was held, else when its minutes were started. */
export const meetingMs = (m: any): number => toMs(m?.meetingDate) || toMs(m?.createdAt);

export interface RegisterRow {
  id: string;
  title: string;
  ref: string;
  rev: number;
  at: number;
  audience: MeetingAudience;
  pile: RegisterPile;
  chip: { label: string; tone: ChipTone };
  decisions: number;
  actions: number;
  open: number;
  attendees: number;
  earlierFormat: boolean;
  draft: boolean;
  /** Lower-cased text the search looks through. */
  haystack: string;
}

export function registerRow(m: any): RegisterRow {
  const acts = (Array.isArray(m?.actionItems) ? m.actionItems : []).filter((a: any) => a?.status !== 'cancelled');
  const decisions = Array.isArray(m?.decisions) ? m.decisions : [];
  const text = (x: any) => (typeof x === 'string' ? x : String(x?.text || x?.description || x?.decision || ''));
  return {
    id: String(m?.id || ''),
    title: String(m?.meetingTitle || 'Meeting'),
    ref: String(m?.momRef || ''),
    rev: Number(m?.rev) || 0,
    at: meetingMs(m),
    audience: audienceOf(m?.meetingType),
    pile: pileOf(m),
    chip: chipOf(m),
    decisions: decisions.length,
    actions: acts.length,
    open: acts.filter((a: any) => a?.status !== 'done').length,
    attendees: Array.isArray(m?.attendees) ? m.attendees.length : 0,
    earlierFormat: m?.format !== 2,
    draft: String(m?.status || 'draft') === 'draft',
    haystack: [m?.meetingTitle, m?.momRef, ...decisions.map(text), ...acts.map(text)].filter(Boolean).join(' \n ').toLowerCase(),
  };
}

export interface RegisterQuery {
  pile: RegisterFilter;
  audience: 'all' | MeetingAudience;
  search: string;
  newestFirst: boolean;
}

export interface MonthGroup { key: string; label: string; rows: RegisterRow[] }

const monthOf = (ms: number) => {
  if (!ms) return { key: '0000-00', label: 'No date' };
  const d = new Date(ms);
  const key = d.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Kolkata' });
  const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return { key, label };
};

/** The rows the filters keep, sorted by meeting date and grouped by month. */
export function buildRegister(rows: RegisterRow[], q: RegisterQuery): MonthGroup[] {
  const needle = q.search.trim().toLowerCase();
  const kept = rows
    .filter((r) => (q.pile === 'all' || r.pile === q.pile) && (q.audience === 'all' || r.audience === q.audience))
    .filter((r) => !needle || r.haystack.includes(needle))
    .sort((a, b) => (q.newestFirst ? b.at - a.at : a.at - b.at) || a.ref.localeCompare(b.ref));
  const groups: MonthGroup[] = [];
  for (const r of kept) {
    const m = monthOf(r.at);
    const last = groups[groups.length - 1];
    if (last && last.key === m.key) last.rows.push(r);
    else groups.push({ ...m, rows: [r] });
  }
  return groups;
}

/** How many minutes sit in each pile and each kind of meeting. */
export function registerCounts(rows: RegisterRow[]) {
  const pile: Record<RegisterPile, number> = { draft: 0, studio: 0, client: 0, settled: 0 };
  const audience: Record<MeetingAudience, number> = { client: 0, internal: 0, vendor: 0 };
  let corrections = 0;
  for (const r of rows) {
    pile[r.pile] += 1;
    audience[r.audience] += 1;
    if (r.chip.label === 'Correction asked') corrections += 1;
  }
  return { total: rows.length, pile, audience, corrections };
}
