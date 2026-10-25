/*
  LEADS: an enquiry from its first message to a signed project.

  A lead lives in its own collection (leads/{id}, firestore.rules), not as a
  project, so Client Relations can take one from the first call to a site
  measurement without ever opening a project, which carries the studio's fees
  and money. When the site is measured, Client Relations asks a lead (Owner,
  Admin or Ops Director) to open the project; everything collected goes with
  it (leadToProject below) and the project comes back on their desk.

  Who may do what (approved with the mockups, 19 Oct 2026):
    Client Relations: add and edit their own leads, see the budget the client
    said, mark one lost, ask for the project to be opened.
    The leads: all of that for everyone's leads, plus open the project and
    delete a lead.

  Pure, and shared by the screens and the tests.
*/
import { addDays, dayKey, daysBetween, type QueueItem } from './opsDesk';
import type { VisitMode, VisitRequest } from './clientCare';

export type LeadStage = 'new' | 'talking' | 'meeting' | 'measured' | 'proposal' | 'won' | 'lost';
export type LeadSource = 'instagram' | 'website' | 'referral' | 'walkin' | 'architect' | 'repeat' | 'other';
export type FirstStep = 'call' | 'whatsapp' | 'meeting';
export type TouchKind = 'call' | 'whatsapp' | 'email' | 'meeting' | 'note' | 'stage';

/** The stages a lead moves through, in order. Won and lost leave the board for the list. */
export const LEAD_STAGES: { id: LeadStage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'talking', label: 'Talking' },
  { id: 'meeting', label: 'Meeting booked' },
  { id: 'measured', label: 'Site measured' },
  { id: 'proposal', label: 'Proposal sent' },
  { id: 'won', label: 'Won' },
];
export const BOARD_STAGES: LeadStage[] = ['new', 'talking', 'meeting', 'measured', 'proposal'];

export const LEAD_SOURCES: { id: LeadSource; label: string }[] = [
  { id: 'instagram', label: 'Instagram' }, { id: 'website', label: 'Website' }, { id: 'referral', label: 'Referral' },
  { id: 'walkin', label: 'Walk-in' }, { id: 'architect', label: 'Architect' }, { id: 'repeat', label: 'Repeat client' },
  { id: 'other', label: 'Other' },
];
export const sourceLabel = (s: LeadSource | string | null | undefined) => LEAD_SOURCES.find((x) => x.id === s)?.label || 'Other';

export const SCOPES = ['Full home', 'Kitchen', 'Wardrobes', 'Living', 'Bathrooms', 'Only furniture'] as const;
export const LOST_REASONS = ['Budget', 'Went with a contractor', 'Went with another studio', 'Postponed', 'No reply', 'Other'] as const;

export interface LeadPerson {
  id: string;
  name: string;
  /** "Decides with him", "Father", "Their architect". */
  role: string;
  phone: string;
  email: string;
  /** The first person: the one we call, and who signs later. */
  main: boolean;
}

export interface LeadHome {
  where: string;
  /** "3 BHK", "Villa", "Clinic". */
  type: string;
  /** Carpet area in sq ft, as said. */
  area: number | null;
  scope: string[];
  /** "Jan 2027". */
  possession: string;
  /**
   * What the client said they want to spend, in their words ("₹25–30 L").
   * Kept with the lead for the people working it to see, and never printed.
   */
  budget: string;
}

/** The questions for the first call, which later fill the project brief. */
export interface LeadKnow { decides: string; style: string; seenWork: boolean }

export interface LeadTouch {
  id: string;
  at: number;
  by: string;
  byName: string;
  kind: TouchKind;
  text: string;
  /** For a call: whether anyone answered. */
  reached?: boolean | null;
}

export interface LeadNext {
  text: string;
  due: string /* YYYY-MM-DD */;
  kind: FirstStep;
  /** A meeting booked with the lead (kind 'meeting'): its time, how it is held, and its Google Meet link and calendar event. */
  time?: string | null;
  mode?: VisitMode | null;
  meetUrl?: string | null;
  calendarEventId?: string | null;
  calendarAccount?: string | null;
}

/**
 * A note kept on the lead: what the studio knows that is not a touch (a
 * preference, a warning, what was promised). Pinned notes sit at the top.
 */
export interface LeadNote {
  id: string;
  at: number;
  by: string;
  byName: string;
  text: string;
  pinned: boolean;
  editedAt?: number | null;
}

export type LeadMeetingStatus = 'done' | 'missed' | 'cancelled';
export const LEAD_MEETING_STATUS_LABEL: Record<LeadMeetingStatus, string> = { done: 'Held', missed: 'Did not happen', cancelled: 'Cancelled' };

/**
 * A meeting with the lead that is over: held, missed or cancelled. Booked
 * meetings live in `next` until then; this keeps them once they are done, so
 * the Ops Desk can show every meeting with a lead (leadMeetingRows).
 */
export interface LeadMeetingLog {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  time: string | null;
  mode: VisitMode | null;
  purpose: string;
  status: LeadMeetingStatus;
  /** What came of it, in a line. */
  outcome: string;
  at: number;
  by: string;
  byName: string;
}

export interface Lead {
  id: string;
  tenantId: string;
  createdAt: number;
  createdBy: string;
  createdByName: string;
  ownerEmail: string;
  ownerName: string;
  people: LeadPerson[];
  home: LeadHome;
  source: LeadSource;
  /** Who referred them, or which architect. */
  sourceNote: string;
  /** The first message, in the client's words. */
  enquiry: string;
  stage: LeadStage;
  lostReason: string | null;
  know: LeadKnow;
  next: LeadNext | null;
  touches: LeadTouch[];
  /** Notes kept on the lead, newest last. Missing on older leads and on ones from the website form. */
  notes?: LeadNote[];
  /** Meetings that are over, newest last. Missing until one is closed out. */
  meetings?: LeadMeetingLog[];
  firstTouchAt: number | null;
  lastTouchAt: number | null;
  /** Client Relations asked a lead to open the project. */
  openRequest: { at: number; by: string; byName: string } | null;
  /** Set when a lead opened it. */
  projectId: string | null;
  updatedAt: number;
  updatedBy: string;
}

/* ── Rules of the desk ──────────────────────────────────────────────────── */

/** A new enquiry should be called within the hour. */
export const FIRST_CALL_MINUTES = 60;
/** No touch for this many days puts the lead at the top of its owner's Today list... */
export const QUIET_DAYS = 5;
/** ...and this many, in front of the leads. */
export const QUIET_DAYS_LEAD = 10;

const MIN = 60000;

export const isOpen = (l: Pick<Lead, 'stage'>) => l.stage !== 'won' && l.stage !== 'lost';

/** "Mehta family" when two people share a surname, else the main contact's name. */
export function leadName(l: Pick<Lead, 'people'>): string {
  const people = (l.people || []).filter((p) => p.name.trim());
  const main = people.find((p) => p.main) || people[0];
  if (!main) return 'New lead';
  const surname = (n: string) => n.trim().split(/\s+/).slice(-1)[0].toLowerCase();
  const s = surname(main.name);
  if (people.length > 1 && people.filter((p) => surname(p.name) === s).length > 1) {
    const word = main.name.trim().split(/\s+/).slice(-1)[0];
    return `${word} family`;
  }
  return main.name.trim();
}

const nf = new Intl.NumberFormat('en-IN');
/** "3 BHK · Powai · 1,150 sq ft". */
export function homeLine(h: Partial<LeadHome> | null | undefined): string {
  if (!h) return '';
  const where = String(h.where || '').split(/[·,]/)[0].trim();
  return [h.type, where, h.area ? `${nf.format(h.area)} sq ft` : ''].map((x) => String(x || '').trim()).filter(Boolean).join(' · ');
}

export const mainPerson = (l: Pick<Lead, 'people'>): LeadPerson | null => (l.people || []).find((p) => p.main) || l.people?.[0] || null;

/** The lead's state light and what to do next, for its card. */
export function leadUrgency(l: Lead, now: number): { tone: 'ok' | 'warn' | 'bad'; label: string; waitedMin: number | null; quietDays: number } {
  const today = dayKey(now);
  const quietDays = daysBetween(l.lastTouchAt ?? l.createdAt, now);
  if (!isOpen(l)) return { tone: 'ok', label: l.stage === 'won' ? 'Won' : 'Lost', waitedMin: null, quietDays };
  if (!l.firstTouchAt) {
    const waited = Math.max(0, Math.round((now - l.createdAt) / MIN));
    return { tone: waited >= FIRST_CALL_MINUTES ? 'bad' : 'warn', label: waited >= FIRST_CALL_MINUTES ? 'Call now, it has waited' : 'Call within the hour', waitedMin: waited, quietDays };
  }
  if (quietDays >= QUIET_DAYS) return { tone: 'bad', label: `Quiet for ${quietDays} days`, waitedMin: null, quietDays };
  if (l.next) {
    const label = l.next.text;
    return { tone: l.next.due < today ? 'bad' : l.next.due === today ? 'warn' : 'ok', label, waitedMin: null, quietDays };
  }
  return { tone: 'warn', label: 'Set a next step', waitedMin: null, quietDays };
}

/** "40 min", "3 h", "2 d". */
export function waitedLabel(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

/**
 * The leads on a person's Today list. Their own: a new enquiry not yet
 * called, a next step that is due, a lead gone quiet. A lead (Owner, Admin,
 * Ops Director) also sees every lead quiet for ten days, and every request to
 * open a project.
 */
export function leadQueue(leads: Lead[], me: string, isLead: boolean, now: number): QueueItem[] {
  const mine = String(me || '').toLowerCase();
  const today = dayKey(now);
  const out: QueueItem[] = [];
  for (const l of leads) {
    if (!isOpen(l)) continue;
    const name = leadName(l);
    const owned = l.ownerEmail === mine;
    const u = leadUrgency(l, now);
    if (isLead && l.openRequest && !l.projectId) {
      out.push({
        id: `leadopen:${l.id}`, group: 'today', kind: 'lead_open', projectId: '', projectName: `Lead · ${sourceLabel(l.source)}`,
        title: `Open the project: ${name}`, detail: `${l.openRequest.byName || l.openRequest.by} asked ${daysBetween(l.openRequest.at, now) ? `${daysBetween(l.openRequest.at, now)} days ago` : 'today'} · ${homeLine(l.home)}`,
        due: today, ref: l.id,
      });
    }
    if (owned) {
      if (!l.firstTouchAt) {
        out.push({
          id: `lead:${l.id}`, group: u.tone === 'bad' ? 'overdue' : 'today', kind: 'lead', projectId: '', projectName: `Lead · ${sourceLabel(l.source)}`,
          title: `New lead: ${name}${l.home.type ? `, ${l.home.type}` : ''}${l.home.where ? ` ${l.home.where.split(/[·,]/)[0].trim()}` : ''}`,
          detail: `came in ${waitedLabel(u.waitedMin || 0)} ago; call within the hour`, due: today, ref: l.id,
        });
      } else if (u.quietDays >= QUIET_DAYS) {
        out.push({
          id: `lead:${l.id}`, group: 'overdue', kind: 'lead', projectId: '', projectName: `Lead · ${sourceLabel(l.source)}`,
          title: `Gone quiet: ${name}`, detail: `no touch for ${u.quietDays} days${l.next ? ` · next: ${l.next.text}` : ''}`, due: l.next?.due || today, ref: l.id,
        });
      } else if (l.next && l.next.due <= addDays(today, 7)) {
        out.push({
          id: `lead:${l.id}`, group: l.next.due < today ? 'overdue' : l.next.due === today ? 'today' : 'week', kind: 'lead', projectId: '',
          projectName: `Lead · ${sourceLabel(l.source)}`, title: `${l.next.text}: ${name}`, detail: homeLine(l.home) || 'Lead', due: l.next.due, ref: l.id,
        });
      }
    } else if (isLead && l.firstTouchAt && u.quietDays >= QUIET_DAYS_LEAD) {
      out.push({
        id: `leadquiet:${l.id}`, group: 'today', kind: 'lead', projectId: '', projectName: `Lead · ${l.ownerName || l.ownerEmail}`,
        title: `Quiet for ${u.quietDays} days: ${name}`, detail: `${l.ownerName || l.ownerEmail}'s lead · ${homeLine(l.home)}`, due: today, ref: l.id,
      });
    }
  }
  return out;
}

/* ── Duplicates ─────────────────────────────────────────────────────────── */

/** The last ten digits, so "+91 98330 12345" and "098330-12345" match. */
export const phoneKey = (p: string | null | undefined) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-10) : '';
};
export const emailKey = (e: string | null | undefined) => String(e || '').trim().toLowerCase();

export interface Match { kind: 'lead' | 'client'; id: string; name: string; detail: string; by: 'phone' | 'email' }

/**
 * Earlier leads and clients with the same phone or email as anyone on this
 * one, so the desk can say "we may know them" before a duplicate is made.
 * Only what the person can already read is searched.
 */
export function findMatches(
  people: Pick<LeadPerson, 'phone' | 'email'>[],
  leads: Lead[],
  projects: { id: string; context?: any }[],
  ignoreLeadId?: string,
): Match[] {
  const phones = new Set(people.map((p) => phoneKey(p.phone)).filter(Boolean));
  const emails = new Set(people.map((p) => emailKey(p.email)).filter((e) => e.includes('@')));
  if (!phones.size && !emails.size) return [];
  const out: Match[] = [];
  for (const l of leads) {
    if (l.id === ignoreLeadId) continue;
    const hit = l.people.find((p) => phones.has(phoneKey(p.phone)) || emails.has(emailKey(p.email)));
    if (!hit) continue;
    const when = new Date(l.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    out.push({
      kind: 'lead', id: l.id, name: hit.name || leadName(l), by: phones.has(phoneKey(hit.phone)) ? 'phone' : 'email',
      detail: `enquired ${when}${l.home.type ? ` for a ${l.home.type}` : ''}${l.home.where ? ` in ${l.home.where.split(/[·,]/)[0].trim()}` : ''}. ${l.stage === 'lost' ? `Lost${l.lostReason ? `: "${l.lostReason.toLowerCase()}"` : ''}.` : l.stage === 'won' ? 'Won.' : `Still open (${LEAD_STAGES.find((s) => s.id === l.stage)?.label || l.stage}).`}`,
    });
  }
  for (const p of projects) {
    const c = p.context || {};
    const contacts = [{ phone: c.clientPhone, email: c.clientEmail }, ...(Array.isArray(c.clientContacts) ? c.clientContacts : [])];
    const hit = contacts.find((x: any) => phones.has(phoneKey(x?.phone)) || String(x?.email || '').split(/[,;]/).some((e: string) => emails.has(emailKey(e))));
    if (!hit) continue;
    out.push({
      kind: 'client', id: String(p.id), name: String(c.clientName || 'A client'), by: phones.has(phoneKey((hit as any).phone)) ? 'phone' : 'email',
      detail: `is the client on ${c.name || 'a project'}.`,
    });
  }
  return out.slice(0, 4);
}

/* ── Turning a lead into a project ──────────────────────────────────────── */

/**
 * What the new project starts with: the people (the main contact where the
 * thirty screens that read one client look, the others as client contacts,
 * lib/clientContacts), the home, the brief in the client's words, and an
 * Actual tag, since a lead is real work by definition.
 */
export function leadToProject(l: Lead): Record<string, any> {
  const main = mainPerson(l);
  const others = l.people.filter((p) => p !== main && (p.name.trim() || p.email.trim() || p.phone.trim()));
  const brief = [
    l.home.scope.length ? `Wants: ${l.home.scope.join(', ')}.` : '',
    l.know.style ? `Style: ${l.know.style}.` : '',
    l.know.decides ? `Who decides: ${l.know.decides}.` : '',
    l.home.possession ? `Possession: ${l.home.possession}.` : '',
    l.enquiry ? `First message: "${l.enquiry.slice(0, 400)}"` : '',
    /* Pinned notes are what the team agreed matters; they go with the lead. */
    (l.notes || []).some((n) => n.pinned) ? `Notes: ${(l.notes || []).filter((n) => n.pinned).map((n) => n.text.replace(/\s+/g, ' ').trim()).join(' · ').slice(0, 600)}` : '',
  ].filter(Boolean).join(' ');
  return {
    name: [leadName(l), l.home.where.split(/[·,]/)[0].trim()].filter(Boolean).join(' · ').slice(0, 120),
    clientName: main?.name.trim() || leadName(l),
    clientEmail: main?.email.trim() || '',
    clientPhone: main?.phone.trim() || '',
    clientContacts: others.map((p) => ({ id: p.id, name: p.name.trim(), role: p.role.trim() || null, email: p.email.trim() || null, phone: p.phone.trim() || null })),
    location: l.home.where.trim() || 'Mumbai',
    area: l.home.area || 0,
    config: l.home.type || '2-BHK',
    clientBrief: brief.slice(0, 2000),
    status: 'lead',
    isDummy: false,
    projectCategory: 'actual',
    leadId: l.id,
  };
}

/** What the conversion sheet lists, each line as it will land on the project. */
export function conversionLines(l: Lead): [string, string][] {
  const people = l.people.filter((p) => p.name.trim());
  const emails = people.filter((p) => p.email.trim()).length;
  const phones = people.filter((p) => p.phone.trim()).length;
  const calls = l.touches.filter((t) => t.kind !== 'stage' && t.kind !== 'note').length;
  const meetings = l.touches.filter((t) => t.kind === 'meeting').length;
  const notes = (l.notes || []).length;
  const pinned = (l.notes || []).filter((n) => n.pinned).length;
  return [
    ['People', `${people.map((p, i) => `${p.name}${i === 0 ? ' (main)' : ''}`).join(' · ')} · ${emails} email${emails === 1 ? '' : 's'}, ${phones} phone${phones === 1 ? '' : 's'}`],
    ['Home', [l.home.type, l.home.where, l.home.area ? `${nf.format(l.home.area)} sq ft` : ''].filter(Boolean).join(' · ') || 'Not filled in'],
    ['Brief', [l.home.scope.join(', '), l.know.style, l.home.possession ? `possession ${l.home.possession}` : ''].filter(Boolean).join(' · ') || 'Not filled in'],
    ['Touches', `${calls} calls and messages, ${meetings} meeting${meetings === 1 ? '' : 's'}, kept with the lead`],
    ...(notes ? [['Notes', `${notes} note${notes === 1 ? '' : 's'} kept with the lead${pinned ? `; the ${pinned} pinned go into the brief` : ''}`] as [string, string]] : []),
  ];
}

/* ── This month ─────────────────────────────────────────────────────────── */

export function leadStats(leads: Lead[], now: number) {
  const month = dayKey(now).slice(0, 7);
  const inMonth = (ms: number | null | undefined) => !!ms && dayKey(ms).slice(0, 7) === month;
  const fresh = leads.filter((l) => inMonth(l.createdAt));
  const reached = (l: Lead, s: LeadStage) => BOARD_STAGES.indexOf(s) >= 0 && (l.stage === 'won' || BOARD_STAGES.indexOf(l.stage) >= BOARD_STAGES.indexOf(s));
  const firsts = leads.filter((l) => l.firstTouchAt && inMonth(l.createdAt)).map((l) => Math.max(0, (l.firstTouchAt as number) - l.createdAt) / MIN);
  return {
    added: fresh.length,
    meetings: fresh.filter((l) => reached(l, 'meeting')).length,
    won: leads.filter((l) => l.stage === 'won' && inMonth(l.updatedAt)).length,
    lost: leads.filter((l) => l.stage === 'lost' && inMonth(l.updatedAt)),
    wonList: leads.filter((l) => l.stage === 'won' && inMonth(l.updatedAt)),
    avgFirstCallMin: firsts.length ? Math.round(firsts.reduce((a, b) => a + b, 0) / firsts.length) : null,
  };
}

/** "budget (2), went with a contractor (1)". */
export function lostReasons(lost: Lead[]): string {
  const n = new Map<string, number>();
  for (const l of lost) {
    const r = (l.lostReason || 'Other').toLowerCase();
    n.set(r, (n.get(r) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r, c]) => `${r} (${c})`).join(', ');
}

/* ── New leads, and what a pasted chat gives ────────────────────────────── */

export const newPersonId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const blankPerson = (main = false): LeadPerson => ({ id: newPersonId(), name: '', role: main ? 'Main contact' : '', phone: '', email: '', main });

export interface LeadDraft {
  people: LeadPerson[];
  home: LeadHome;
  source: LeadSource;
  sourceNote: string;
  enquiry: string;
  next: LeadNext;
}

export function blankDraft(now: number): LeadDraft {
  const at = new Date(now + 5.5 * 3600000);
  const time = at.getUTCHours() < 18 ? 'today' : 'tomorrow';
  return {
    people: [blankPerson(true)],
    home: { where: '', type: '', area: null, scope: [], possession: '', budget: '' },
    source: 'instagram', sourceNote: '', enquiry: '',
    next: { kind: 'call', text: 'Call to understand the brief', due: time === 'today' ? dayKey(now) : addDays(dayKey(now), 1) },
  };
}

/** Whether a draft has what a lead needs now: a name and one way to reach them. */
export function draftProblems(d: Pick<LeadDraft, 'people' | 'next'>): string[] {
  const main = d.people[0];
  const out: string[] = [];
  if (!main?.name.trim()) out.push('the main contact’s name');
  if (!main?.phone.trim() && !main?.email.trim()) out.push('a phone or email to reach them');
  if (main?.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(main.email.trim())) out.push('an email that looks right');
  if (!d.next.text.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(d.next.due)) out.push('a first step with a date');
  return out;
}

/**
 * The fields a pasted chat gives without the AI: phone numbers, emails and
 * the WhatsApp sender's name. The AI (services/leadsService) does better when
 * it is reachable; this is what is left when it is not.
 */
export function readChat(text: string): { people: { name: string; phone: string; email: string }[]; enquiry: string } {
  const t = String(text || '');
  const phones = [...new Set((t.match(/(?:\+?\d[\d\s-]{8,}\d)/g) || []).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => phoneKey(p)))];
  const emails = [...new Set(t.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi) || [])];
  /* "[19/10/26, 10:02:11 AM] Rohan Mehta: Need interiors..." or "19/10/26, 10:02 - Rohan Mehta: ..." */
  const senders = [...t.matchAll(/^\s*\[?[\d/.,\s:apmAPM-]+\]?\s*-?\s*([^:\n]{2,40}):\s*(.+)$/gm)];
  const names = [...new Set(senders.map((m) => m[1].trim()).filter((n) => !/^\+?\d[\d\s-]+$/.test(n)))];
  const enquiry = senders.length ? senders[0][2].trim() : t.trim().split('\n')[0] || '';
  const n = Math.max(names.length ? 1 : 0, phones.length ? 1 : 0, emails.length ? 1 : 0);
  const people = Array.from({ length: n }, (_, i) => ({ name: names[i] || '', phone: phones[i] || '', email: emails[i] || '' }));
  return { people, enquiry: enquiry.slice(0, 500) };
}

/* ── A meeting booked with a lead, on the Ops Desk's Meetings & visits ───── */

/**
 * The meeting booked as a lead's next step, as Meetings & visits lists it:
 * the lead has no project yet, so it is its own row ("Lead · Mehta family"),
 * opened on the lead. Null when the next step is not a meeting.
 */
export function leadMeeting(l: Lead): VisitRequest | null {
  const n = l.next;
  if (!n || n.kind !== 'meeting' || !/^\d{4}-\d{2}-\d{2}$/.test(n.due) || !isOpen(l)) return null;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(n.time || '')) ? String(n.time) : '';
  return {
    id: `lead:${l.id}`, tenantId: l.tenantId, projectId: '', projectName: `Lead · ${leadName(l)}`,
    kind: 'meeting', mode: n.mode || 'in_person', purpose: n.text, requestedBy: 'studio',
    status: time ? 'confirmed' : 'requested', slot: time ? { date: n.due, time } : null, reschedules: 0, history: [],
    createdAt: l.updatedAt, createdBy: l.ownerEmail, createdByName: l.ownerName, updatedAt: l.updatedAt, updatedBy: l.updatedBy,
    meetUrl: n.meetUrl || null, calendarEventId: n.calendarEventId || null, calendarAccount: n.calendarAccount || null,
    source: 'lead', leadId: l.id,
  };
}

/* ── Every meeting with a lead, for the Ops Desk ────────────────────────── */

export type LeadMeetingRowStatus = 'upcoming' | 'needs_time' | 'to_close' | LeadMeetingStatus;
export const LEAD_MEETING_ROW_LABEL: Record<LeadMeetingRowStatus, string> = {
  upcoming: 'Coming up', needs_time: 'Needs a time', to_close: 'Past, to close out', ...LEAD_MEETING_STATUS_LABEL,
};

export interface LeadMeetingRow {
  key: string;
  leadId: string;
  leadName: string;
  home: string;
  ownerName: string;
  stage: LeadStage;
  /** Set once the lead became a project. */
  projectId: string | null;
  purpose: string;
  date: string;
  time: string | null;
  mode: VisitMode | null;
  status: LeadMeetingRowStatus;
  outcome: string;
  meetUrl: string | null;
}

/**
 * Every meeting with a lead, booked or over, newest past last: the one booked
 * as the lead's next step, the ones closed out on the lead (`meetings`), and
 * meetings logged as a touch. A lead has no project, so none of these is on a
 * project's timeline; this is where they are tracked.
 */
export function leadMeetingRows(leads: Lead[], now: number, pastDays = 90): LeadMeetingRow[] {
  const today = dayKey(now);
  const since = addDays(today, -pastDays);
  const rows: LeadMeetingRow[] = [];
  for (const l of leads) {
    const base = { leadId: l.id, leadName: leadName(l), home: homeLine(l.home), ownerName: l.ownerName || l.ownerEmail, stage: l.stage, projectId: l.projectId };
    const n = l.next;
    if (n && n.kind === 'meeting' && /^\d{4}-\d{2}-\d{2}$/.test(n.due) && isOpen(l)) {
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(n.time || '')) ? String(n.time) : null;
      rows.push({
        ...base, key: `next:${l.id}`, purpose: n.text, date: n.due, time, mode: n.mode || null, outcome: '', meetUrl: n.meetUrl || null,
        status: n.due < today ? 'to_close' : time ? 'upcoming' : 'needs_time',
      });
    }
    for (const m of l.meetings || []) {
      if (m.date < since) continue;
      rows.push({ ...base, key: `log:${l.id}:${m.id}`, purpose: m.purpose, date: m.date, time: m.time, mode: m.mode, status: m.status, outcome: m.outcome, meetUrl: null });
    }
    /* A meeting logged as a touch ("Meeting: walked through the moodboard"), unless closing out a booked one wrote it. */
    const closed = new Set((l.meetings || []).map((m) => m.at));
    for (const t of l.touches || []) {
      if (t.kind !== 'meeting' || closed.has(t.at)) continue;
      const date = dayKey(t.at);
      if (date < since) continue;
      rows.push({ ...base, key: `touch:${l.id}:${t.id}`, purpose: t.text, date, time: null, mode: null, status: 'done', outcome: '', meetUrl: null });
    }
  }
  const open = (r: LeadMeetingRow) => r.status === 'upcoming' || r.status === 'needs_time' || r.status === 'to_close';
  const when = (r: LeadMeetingRow) => `${r.date}${r.time || ''}`;
  return rows.sort((a, b) => (open(a) === open(b) ? (open(a) ? when(a).localeCompare(when(b)) : when(b).localeCompare(when(a))) : open(a) ? -1 : 1));
}

/**
 * Close out the meeting booked as the lead's next step: it moves to the lead's
 * meetings, and a held one is a touch too (it was contact). The caller saves.
 */
export function closeLeadMeeting(l: Lead, status: LeadMeetingStatus, outcome: string, me: { email: string; name: string }, at: number): Lead {
  const n = l.next;
  if (!n || n.kind !== 'meeting') return l;
  const by = me.email.toLowerCase();
  const id = `m${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const log: LeadMeetingLog = {
    id, date: n.due, time: n.time || null, mode: n.mode || null, purpose: n.text.slice(0, 200), status, outcome: outcome.trim().slice(0, 300), at, by, byName: me.name,
  };
  const word = status === 'done' ? `${n.text}${log.outcome ? `: ${log.outcome}` : ''}` : `${LEAD_MEETING_STATUS_LABEL[status]}: ${n.text}${log.outcome ? ` (${log.outcome})` : ''}`;
  const touch: LeadTouch = { id: `t${id}`, at, by, byName: me.name, kind: status === 'done' ? 'meeting' : 'note', text: word.slice(0, 500), reached: null };
  const contact = status === 'done';
  return {
    ...l,
    next: null,
    meetings: [...(l.meetings || []), log].slice(-200),
    touches: [...l.touches, touch].slice(-300),
    firstTouchAt: contact && !l.firstTouchAt ? at : l.firstTouchAt,
    lastTouchAt: contact ? at : l.lastTouchAt,
    stage: contact && (l.stage === 'new' || l.stage === 'talking') ? 'meeting' : l.stage,
  };
}

/* ── Notes ──────────────────────────────────────────────────────────────── */

export const NOTE_MAX = 1500;

/** Pinned first, then newest first. */
export const sortedNotes = (notes: LeadNote[] | null | undefined): LeadNote[] =>
  [...(notes || [])].sort((a, b) => (a.pinned === b.pinned ? b.at - a.at : a.pinned ? -1 : 1));

export function addNote(l: Lead, text: string, me: { email: string; name: string }, at: number, pinned = false): Lead {
  const t = text.trim().slice(0, NOTE_MAX);
  if (!t) return l;
  const note: LeadNote = { id: `n${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, at, by: me.email.toLowerCase(), byName: me.name, text: t, pinned, editedAt: null };
  return { ...l, notes: [...(l.notes || []), note].slice(-200) };
}

export function editNote(l: Lead, id: string, change: { text?: string; pinned?: boolean }, at: number): Lead {
  return {
    ...l,
    notes: (l.notes || []).map((n) => (n.id !== id ? n : {
      ...n,
      ...(change.text != null ? { text: change.text.trim().slice(0, NOTE_MAX) || n.text, editedAt: at } : {}),
      ...(change.pinned != null ? { pinned: change.pinned } : {}),
    })),
  };
}

export const removeNote = (l: Lead, id: string): Lead => ({ ...l, notes: (l.notes || []).filter((n) => n.id !== id) });
