/*
  THE WEBSITE ENQUIRY FORM (lib/leads.ts has what a lead is).

  A studio turns on a public form in Studio settings → Ops Desk and puts its
  link on the website, the Instagram bio or a QR code. Whoever fills it in
  becomes a new lead on the Ops Desk, owned by the person the studio chose,
  with the first step to call within the hour.

  The page is public, so the server (functions/src/leads.ts) writes the lead
  and checks every submission: the studio's own token, a hidden field only a
  bot fills in, a minimum time to fill, limits per hour, and the fields
  themselves. A second enquiry from the same phone or email within a day is
  added to the first lead instead of making another.

  Pure, and shared by the page, the server and the tests.
*/
import { dayKey, opsSettingsOf, type LeadFormSettings } from './opsDesk';
import { blankPerson, emailKey, phoneKey, LEAD_SOURCES, type Lead, type LeadSource } from './leads';

export type { LeadFormSettings };

/** The studio's form settings (kept with the rest of the Ops Desk's, lib/opsDesk opsSettingsOf). */
export const leadFormOf = (org: any) => opsSettingsOf(org).leadForm;

/** A new link for this studio. The old one stops working the moment the new one is saved. */
export function newFormToken(tenantId: string, random: (n: number) => string): string {
  return `${tenantId}.${random(24)}`;
}

/** The studio a link names, or null when it is not one of ours. */
export function tenantOfToken(token: string): string | null {
  const t = String(token || '');
  const at = t.lastIndexOf('.');
  if (at <= 0 || t.length > 160) return null;
  const tenant = t.slice(0, at);
  return /^[A-Za-z0-9_-]{1,80}$/.test(tenant) && /^[A-Za-z0-9]{16,64}$/.test(t.slice(at + 1)) ? tenant : null;
}

export const formLink = (origin: string, token: string, source?: LeadSource) =>
  `${origin.replace(/\/+$/, '')}/?enquire=${encodeURIComponent(token)}${source && source !== 'website' ? `&src=${source}` : ''}`;

export const embedCode = (origin: string, token: string) =>
  `<iframe src="${formLink(origin, token)}&embed=1" title="Enquiry" style="width:100%;max-width:640px;height:820px;border:0" loading="lazy"></iframe>`;

/* ── What the form sends ─────────────────────────────────────────────────── */

export const HOME_TYPES = ['1 BHK', '2 BHK', '3 BHK', '4 BHK+', 'Villa', 'Office', 'Other'] as const;

export interface Enquiry {
  name: string;
  phone: string;
  email: string;
  where: string;
  type: string;
  scope: string[];
  possession: string;
  message: string;
  source: LeadSource;
  /** The hidden field: a person never sees it, so anything in it is a bot. */
  website: string;
  /** When the page was opened, in ms. */
  openedAt: number;
}

/** Seconds a person needs at least, to read the form and type a name and number. */
export const MIN_FILL_MS = 3000;

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** The enquiry as the server will keep it: trimmed, cut to size, the source checked. */
export function cleanEnquiry(raw: any): Enquiry {
  const source = LEAD_SOURCES.some((s) => s.id === raw?.source) ? (raw.source as LeadSource) : 'website';
  return {
    name: clip(raw?.name, 80),
    phone: clip(raw?.phone, 30),
    email: clip(raw?.email, 120).toLowerCase(),
    where: clip(raw?.where, 160),
    type: clip(raw?.type, 40),
    scope: (Array.isArray(raw?.scope) ? raw.scope : []).map((s: unknown) => clip(s, 40)).filter(Boolean).slice(0, 6),
    possession: clip(raw?.possession, 40),
    message: String(raw?.message ?? '').trim().slice(0, 1000),
    source,
    website: clip(raw?.website, 200),
    openedAt: Number(raw?.openedAt) || 0,
  };
}

/** What is wrong with it, in words the person filling it in understands. Empty when it can be sent. */
export function enquiryProblems(e: Pick<Enquiry, 'name' | 'phone' | 'email'>): string[] {
  const out: string[] = [];
  if (e.name.trim().length < 2) out.push('your name');
  const phoneOk = !!phoneKey(e.phone);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.email.trim());
  if (!phoneOk && !emailOk) out.push('a phone number or email to reach you');
  if (e.email.trim() && !emailOk) out.push('an email that looks right');
  return out;
}

/** Whether the server should quietly drop it: a bot filled the hidden field, or it came too fast. */
export function looksLikeABot(e: Pick<Enquiry, 'website' | 'openedAt'>, now: number): boolean {
  if (e.website) return true;
  if (!e.openedAt || now - e.openedAt < MIN_FILL_MS || e.openedAt > now + 60000) return true;
  return false;
}

/* ── Turning it into a lead ──────────────────────────────────────────────── */

export const FORM_BY = 'website-form';
export const FORM_BY_NAME = 'Website form';

/** The text of the enquiry, as the first touch on the lead. */
export function enquiryText(e: Enquiry): string {
  return [
    e.message,
    e.type || e.where ? `Home: ${[e.type, e.where].filter(Boolean).join(', ')}` : '',
    e.scope.length ? `Wants: ${e.scope.join(', ')}` : '',
    e.possession ? `Possession: ${e.possession}` : '',
  ].filter(Boolean).join('\n').slice(0, 1500);
}

/** A new lead from the form, owned by whoever the studio chose. */
export function leadFromEnquiry(e: Enquiry, x: { tenantId: string; owner: { email: string; name: string }; now: number; id: string }): Omit<Lead, 'id'> {
  const person = { ...blankPerson(true), id: `p${x.id.slice(0, 8)}`, name: e.name, phone: e.phone, email: e.email };
  return {
    tenantId: x.tenantId, createdAt: x.now, createdBy: FORM_BY, createdByName: FORM_BY_NAME,
    ownerEmail: x.owner.email, ownerName: x.owner.name,
    people: [person],
    home: { where: e.where, type: e.type, area: null, scope: e.scope, possession: e.possession, budget: '' },
    source: e.source, sourceNote: e.source === 'website' ? '' : 'Through the website form', enquiry: e.message.slice(0, 2000),
    stage: 'new', lostReason: null, know: { decides: '', style: '', seenWork: false },
    next: { text: 'Call to understand the brief', due: dayKey(x.now), kind: 'call' },
    touches: [{ id: `t${x.now.toString(36)}`, at: x.now, by: FORM_BY, byName: FORM_BY_NAME, kind: 'note', text: `Enquiry from the website form.\n${enquiryText(e)}`.slice(0, 500) }],
    firstTouchAt: null, lastTouchAt: null, openRequest: null, projectId: null, updatedAt: x.now, updatedBy: FORM_BY,
  };
}

/**
 * The same person writing again within a day: their lead, so the second
 * message is added to it rather than starting another.
 */
export function recentSameLead(e: Pick<Enquiry, 'phone' | 'email'>, leads: Pick<Lead, 'id' | 'people' | 'createdAt' | 'stage'>[], now: number): string | null {
  const p = phoneKey(e.phone);
  const m = emailKey(e.email);
  const hit = leads.find((l) => now - l.createdAt < 86400000 && l.stage !== 'won' && l.stage !== 'lost'
    && (l.people || []).some((x) => (p && phoneKey(x.phone) === p) || (m && m.includes('@') && emailKey(x.email) === m)));
  return hit ? hit.id : null;
}

/**
 * Who a new enquiry goes to: the person the studio chose if they are still on
 * the team, else the Client Relations person with the fewest new leads, else
 * the studio's first Owner, Admin or Ops Director.
 */
export function ownerFor(settings: Pick<LeadFormSettings, 'ownerEmail'>, team: any[], leads: Pick<Lead, 'ownerEmail' | 'stage'>[]): { email: string; name: string } | null {
  const people = (Array.isArray(team) ? team : []).filter((m) => m?.email).map((m) => ({
    email: String(m.email).trim().toLowerCase(), name: String(m.name || m.email),
    roles: [m.role, ...(Array.isArray(m.roles) ? m.roles : [])].map(String),
  }));
  const chosen = people.find((p) => p.email === settings.ownerEmail);
  if (chosen) return { email: chosen.email, name: chosen.name };
  const cr = people.filter((p) => p.roles.includes('Client Relations'));
  if (cr.length) {
    const load = (e: string) => leads.filter((l) => l.ownerEmail === e && l.stage === 'new').length;
    const pick = [...cr].sort((a, b) => load(a.email) - load(b.email) || a.name.localeCompare(b.name))[0];
    return { email: pick.email, name: pick.name };
  }
  const lead = people.find((p) => p.roles.some((r) => r === 'Ops Director' || r === 'Owner' || r === 'Admin'));
  return lead ? { email: lead.email, name: lead.name } : null;
}

/** The hour a submission falls in, for the limits per hour. */
export const hourKey = (now: number) => `${dayKey(now)}T${new Date(now + 5.5 * 3600000).getUTCHours().toString().padStart(2, '0')}`;
/** Submissions allowed per studio, and per sender, in an hour. */
export const PER_STUDIO_HOUR = 30;
export const PER_SENDER_HOUR = 4;

