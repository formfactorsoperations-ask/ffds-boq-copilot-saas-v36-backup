/*
  NOTIFICATIONS: WHO IS TOLD WHAT.

  Every update used to be worked out by the screen that owned it, when that
  screen was opened: a client's reply showed only in that project's Client
  Comms, a leave request only in People's approvals. So an update was seen
  when somebody happened to look.

  Now the server call that saves a change also writes a note into the inbox
  of each person who should hear about it (inbox/{email}/notes, written only
  by the Admin SDK), and every open StudioDesk listens to its own inbox. The
  note arrives about as fast as the change is saved.

  This file decides what a note says and who it is for. It is pure and shared
  by the app and the Cloud Functions (functions/src/notify.ts resolves the
  audience to email addresses and writes the notes).

  Two levels, and only one of them interrupts:

    needs   someone is waiting on you: a client's message, a leave request,
            a blocked site. Shown in the bar at the bottom with its button.
    update  worth knowing: a check-in, a signature, an approval. Counted on
            the tab and listed in the bell; never a pop-up.

  Rules every builder follows:
    - the person who made the change is never told (the resolver drops them);
    - money stays with the finance roles: no note carries an amount;
    - every note opens the screen that owns the decision (`route`), and
      nothing is approved or sent from a note without that screen's checks.
*/
import { LEAVE_LABELS, clock12, type Attendance, type Person, type RequestRecord } from './peopleDesk';

export type NoteLevel = 'needs' | 'update';
/** The top-bar tab a note belongs to: clients (Ops Desk), team (People), design (Design Desk), site, money. */
export type NoteArea = 'clients' | 'team' | 'design' | 'site' | 'money';
/** People on the project, by the server's copies: ops = Client Relations, design = Designers, site = Site Supervisors. */
export type ProjectSeat = 'ops' | 'design' | 'site';

/** Who a note is for, before it is resolved to email addresses. */
export interface Audience {
  /** Everyone on the studio's team holding any of these roles. */
  roles?: string[];
  /** The people assigned to the note's project, by seat. */
  project?: ProjectSeat[];
  /** Named people. */
  emails?: string[];
}

export interface Note {
  kind: string;
  area: NoteArea;
  level: NoteLevel;
  title: string;
  /** One line under the title. */
  line: string;
  projectId: string | null;
  projectName: string | null;
  /** The screen to open: a studio tab (people, ops-desk, design-review) or, with projectId, a project tab. */
  route: string;
  /** The button on a "needs" note; it opens `route`. */
  action: string | null;
  /** Who made the change, as a name, and their initials for the face on the note. */
  actor: string | null;
  initials: string;
  /** Notes with the same group arriving together are shown as one ("4 people checked in"). */
  group: string | null;
  /** Small facts a person's settings can filter on: a check-in that was "late" or from "home". */
  tags?: string[];
  at: number;
  readAt: number | null;
  doneAt: number | null;
  snoozedUntil: number | null;
}

/** A note as a builder returns it: what it says, and who it is for. */
export interface Draft extends Omit<Note, 'at' | 'readAt' | 'doneAt' | 'snoozedUntil' | 'initials'> {
  to: Audience;
}

/** Studio tabs a note can open. Anything else is a tab inside the note's project. */
export const STUDIO_ROUTES = new Set(['home', 'people', 'ops-desk', 'design-review', 'projects', 'reports']);

/** The top-bar tab whose badge counts a note. */
export const AREA_TAB: Record<NoteArea, string> = {
  clients: 'ops-desk',
  team: 'people',
  design: 'design-review',
  site: 'projects',
  money: 'reports',
};

const LEADS = ['Owner', 'Admin', 'Ops Director'];
const clip = (s: unknown, n = 140) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};
const quote = (s: unknown) => (String(s ?? '').trim() ? `“${clip(s, 120)}”` : '');

export function initialsOf(name: string | null | undefined): string {
  const words = String(name || '').replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return ((words[0]?.[0] || 'S') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/** Inbox documents are keyed by the lowercased email; Firestore ids cannot contain "/". */
export const inboxKey = (email: string) => String(email || '').trim().toLowerCase();

/** Where a person's notes and settings live: a studio member's by email, a client's by their sign-in. */
export const staffBox = (email: string | null | undefined) => (inboxKey(email || '') ? `inbox/${inboxKey(email || '')}` : null);
export const clientBox = (uid: string | null | undefined) => (uid ? `portalInbox/${uid}` : null);

/** A note ready to store: a draft without its audience, stamped. */
export function stamp(d: Draft, at: number): Note {
  const { to: _to, ...rest } = d;
  return { ...rest, initials: initialsOf(d.actor), at, readAt: null, doneAt: null, snoozedUntil: null };
}

/** Whether a note is still open in someone's inbox right now. */
export const isOpen = (n: Pick<Note, 'doneAt' | 'snoozedUntil'>, now = Date.now()) =>
  !n.doneAt && !(n.snoozedUntil && n.snoozedUntil > now);

/* ── From the client portal ──────────────────────────────────────────────── */

const DOC_NAMES: Record<string, string> = { terms: 'the Terms Docket', contract: 'the Execution Agreement', handover: 'the handover docket' };

/**
 * A client's action in the portal (services/clientPortalActions.ts). Reading
 * and downloading are left out: they belong in a morning summary, not an inbox.
 */
export function clientActionDraft(action: any, p: { actor: string; projectId: string; projectName: string | null }): Draft | null {
  const base = { projectId: p.projectId, projectName: p.projectName, actor: p.actor, group: null, area: 'clients' as NoteArea };
  const who = p.actor || 'Your client';
  switch (action?.type) {
    case 'sendMessage':
      return { ...base, kind: 'client.message', level: 'needs', title: `${who} sent you a message`, line: quote(action.text), route: 'comms-tracker', action: 'Reply', to: { project: ['ops'], roles: ['Ops Director'] } };
    case 'requestIssueChanges':
      return { ...base, kind: 'client.changes', level: 'needs', title: `${who} sent a scope revision back for changes`, line: quote(action.message) || 'Changes asked for', route: 'client-portal', action: 'Open the revision', to: { project: ['ops'], roles: ['Ops Director', 'Owner', 'Design Head'] } };
    case 'approveIssue':
      return { ...base, kind: 'client.approved', level: 'update', title: `${who} approved a scope document`, line: `Approved as ${clip(action.name, 60)}`, route: 'client-portal', action: null, to: { project: ['ops'], roles: ['Ops Director', 'Owner'] } };
    case 'signDocument':
      return { ...base, kind: 'client.signed', level: 'update', title: `${who} signed ${DOC_NAMES[action.docType] || 'a document'}`, line: 'Signed in the client portal', route: 'client-portal', action: null, to: { project: ['ops'], roles: LEADS } };
    case 'signIssue':
      return { ...base, kind: 'client.signed', level: 'update', title: `${who} signed a document`, line: 'Signed in the client portal', route: 'client-portal', action: null, to: { project: ['ops'], roles: ['Ops Director', 'Owner'] } };
    case 'raiseQuery':
      return { ...base, kind: 'client.query', level: 'needs', title: `${who} asked about a clause`, line: quote(action.question), route: 'client-portal', action: 'Answer', to: { project: ['ops'], roles: ['Ops Director'] } };
    case 'raiseDispute':
      return { ...base, kind: 'client.dispute', level: 'needs', title: `${who} raised a dispute`, line: quote(action.reason), route: 'client-portal', action: 'Open it', to: { project: ['ops'], roles: LEADS } };
    case 'querySelection':
      return { ...base, kind: 'client.finish', level: 'needs', title: `${who} asked about a finish`, line: quote(action.question), route: 'materials', action: 'Reply', to: { project: ['design', 'ops'] } };
    case 'confirmSelection':
      return { ...base, area: 'design', kind: 'client.finishConfirmed', level: 'update', title: `${who} confirmed a finish`, line: 'On SOF & Selections', route: 'materials', action: null, to: { project: ['design'], roles: ['Design Head'] } };
    case 'confirmMeeting':
      return { ...base, area: 'design', kind: 'client.meetingConfirmed', level: 'update', title: `${who} confirmed the design meeting record`, line: `Confirmed as ${clip(action.name, 60)}`, route: 'design-review', action: null, to: { project: ['design', 'ops'], roles: ['Design Head'] } };
    default:
      return null;
  }
}

/* ── People: attendance and leave ────────────────────────────────────────── */

/**
 * Who hears about this person's attendance and leave: their manager, or when
 * they have none, the studio's Ops and admins (who may approve anyone).
 */
export function approversOf(person: Pick<Person, 'id' | 'managerId'>, people: Person[]): string[] {
  const live = people.filter((p) => p.active && p.id !== person.id && p.email);
  const manager = live.find((p) => p.id === person.managerId);
  const chosen = manager ? [manager] : live.filter((p) => p.accessRole === 'ops' || p.accessRole === 'admin');
  return [...new Set(chosen.map((p) => inboxKey(p.email!)))];
}

const MODE_LINE: Record<string, string> = { Office: 'at the office', WFH: 'from home', Site: 'at a site' };
function hoursBetween(a: string, b: string): string {
  const mins = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}
const span = (r: RequestRecord) => (r.start === r.end ? r.start : `${r.start} to ${r.end}`);

/**
 * The notes one People command produces (lib/peopleDesk.ts execute). `late`
 * is worked out by the caller with the studio's policy.
 */
export function peopleDrafts(
  e: { action: string; session?: Attendance; request?: RequestRecord },
  p: { actor: Person; employee: Person; people: Person[]; timezone: string; late?: boolean },
): Draft[] {
  const base = { area: 'team' as NoteArea, projectId: null, projectName: null, route: 'people' };
  const approvers = approversOf(p.employee, p.people);
  const name = p.employee.name;
  const s = e.session, r = e.request;
  if (e.action === 'checkin' && s) {
    const where = s.mode === 'Site' && s.site ? `at ${clip(s.site, 40)}` : MODE_LINE[s.mode] || '';
    const tags = [p.late ? 'late' : '', s.mode === 'WFH' ? 'home' : ''].filter(Boolean);
    return [{ ...base, kind: 'people.checkin', level: 'update', title: p.late ? `${name} checked in late` : `${name} checked in`, line: `${clock12(s.checkIn, p.timezone)} · ${where}`, action: null, actor: name, group: `checkin:${s.date}`, tags, to: { emails: approvers } }];
  }
  if (e.action === 'checkout' && s?.checkOut) {
    return [{ ...base, kind: 'people.checkout', level: 'update', title: `${name} checked out`, line: `${clock12(s.checkOut, p.timezone)} · ${hoursBetween(s.checkIn, s.checkOut)} today`, action: null, actor: name, group: `checkout:${s.date}`, to: { emails: approvers } }];
  }
  if (!r) return [];
  const label = r.kind === 'correction' ? 'an attendance correction' : (LEAVE_LABELS[r.type] || 'leave').toLowerCase();
  if (e.action === 'request' && r.status === 'Pending') {
    const days = r.days.reduce((n, d) => n + d.units, 0);
    return [{ ...base, kind: 'people.leave', level: 'needs', title: `${name} asked for ${label}`, line: `${span(r)} · ${days} day${days === 1 ? '' : 's'}${r.reason ? ` · ${quote(r.reason)}` : ''}`, action: 'Review', actor: name, group: null, to: { emails: approvers } }];
  }
  if (e.action === 'correction' && r.status === 'Pending') {
    return [{ ...base, kind: 'people.correction', level: 'needs', title: `${name} asked to correct ${r.start}`, line: r.reason ? quote(r.reason) : 'Check-in or check-out to change', action: 'Review', actor: name, group: null, to: { emails: approvers } }];
  }
  if (e.action === 'cancel') {
    return [{ ...base, kind: 'people.cancel', level: 'needs', title: `${name} asked to cancel approved ${label}`, line: span(r), action: 'Review', actor: name, group: null, to: { emails: approvers } }];
  }
  if (e.action === 'withdraw') {
    return [{ ...base, kind: 'people.withdrawn', level: 'update', title: `${name} withdrew a request for ${label}`, line: span(r), action: null, actor: name, group: null, to: { emails: approvers } }];
  }
  if (e.action === 'decide' && p.employee.email) {
    const word = r.status === 'Approved' ? 'approved' : r.status === 'Cancelled' ? 'cancelled' : r.status === 'Rejected' ? 'declined' : r.status.toLowerCase();
    return [{ ...base, kind: 'people.decided', level: 'update', title: `Your ${label} was ${word}`, line: `${span(r)} · by ${p.actor.name}`, action: null, actor: p.actor.name, group: null, to: { emails: [inboxKey(p.employee.email)] } }];
  }
  return [];
}

/* ── Ops Desk escalations ────────────────────────────────────────────────── */

export function escalationDraft(
  esc: any,
  stage: 'raised' | 'decided',
  p: { projectId: string; leads: string[]; projectOps: string[] },
): Draft {
  const base = { area: 'clients' as NoteArea, projectId: p.projectId, projectName: esc?.projectName || null, route: 'ops-desk', group: null };
  if (stage === 'raised') {
    return { ...base, kind: 'ops.escalation', level: 'needs', title: `Escalation for you: ${clip(esc?.title, 90)}`, line: clip(esc?.detail || esc?.category || ''), action: 'Decide', actor: esc?.auto ? 'The daily check' : esc?.raisedByName || null, to: { emails: p.leads } };
  }
  const to = esc?.auto ? p.projectOps : [String(esc?.raisedBy || '')].filter(Boolean);
  return { ...base, kind: 'ops.decided', level: 'needs', title: `Decided: ${clip(esc?.title, 90)}`, line: quote(esc?.decision) || 'Act on it, then close it', action: 'Act on it', actor: esc?.decidedByName || null, to: { emails: to } };
}

/* ── Design Desk reviews ─────────────────────────────────────────────────── */

export function reviewDraft(
  kind: 'submit' | 'approve' | 'return' | 'clientReturn',
  p: { projectId: string; projectName: string | null; sheet: string; actor: string; designerEmail?: string | null; reason?: string | null },
): Draft | null {
  const base = { area: 'design' as NoteArea, projectId: p.projectId, projectName: p.projectName, route: 'design-review', actor: p.actor, group: null };
  const sheet = clip(p.sheet || 'A sheet', 60);
  if (kind === 'submit') return { ...base, kind: 'design.submitted', level: 'needs', title: `${p.actor} sent ${sheet} for review`, line: 'Waiting for the Design Head', action: 'Review now', to: { roles: ['Design Head'] } };
  if (!p.designerEmail) return null;
  const to = { emails: [inboxKey(p.designerEmail)] };
  if (kind === 'approve') return { ...base, kind: 'design.approved', level: 'update', title: `${sheet} is approved`, line: p.reason ? quote(p.reason) : `Approved by ${p.actor}`, action: null, to };
  return { ...base, kind: 'design.returned', level: 'needs', title: `${sheet} came back with changes`, line: p.reason ? quote(p.reason) : kind === 'clientReturn' ? 'Changes the client asked for' : `Returned by ${p.actor}`, action: 'See the marks', to };
}

/* ── Site ────────────────────────────────────────────────────────────────── */

export function siteDraft(action: any, p: { projectId: string; projectName: string | null; actor: string }): Draft | null {
  const base = { area: 'site' as NoteArea, projectId: p.projectId, projectName: p.projectName, actor: p.actor, group: null, route: 'site-ops' };
  const where = p.projectName || 'a site';
  if (action?.type === 'blocker') return { ...base, kind: 'site.blocker', level: 'needs', title: `Site blocked at ${where}`, line: quote(action.text), action: 'Open the blocker', to: { project: ['ops'], roles: ['Ops Director', 'Owner'] } };
  if (action?.type === 'resolveBlocker') return { ...base, kind: 'site.unblocked', level: 'update', title: `A blocker at ${where} is resolved`, line: `Resolved by ${p.actor}`, action: null, to: { project: ['site', 'ops'], roles: ['Ops Director'] } };
  if (action?.type === 'update') return { ...base, kind: 'site.update', level: 'update', title: `New site update at ${where}`, line: quote(action.text) || 'Posted from site', action: null, to: { project: ['ops'] } };
  return null;
}

/* ── Leads ───────────────────────────────────────────────────────────────── */

/** A website enquiry: to the person the studio's rules made its owner (lib/leadForm ownerFor), and the Ops Director. */
export function leadDraft(e: { name?: string; wants?: string; home?: string }, ownerEmail: string): Draft {
  const bits = [e.wants, e.home].map((x) => clip(x, 50)).filter(Boolean).join(' · ');
  return {
    kind: 'lead.new', area: 'clients', level: 'needs', title: `New enquiry from ${clip(e.name, 60) || 'the website'}`,
    line: bits || 'From the website form', projectId: null, projectName: null, route: 'ops-desk', action: 'Call them',
    actor: e.name || null, group: null, to: { emails: [inboxKey(ownerEmail)].filter(Boolean), roles: ['Ops Director'] },
  };
}

/* ── Who, as email addresses ─────────────────────────────────────────────── */

const rolesOfRow = (m: any): string[] => [m?.role, ...(Array.isArray(m?.roles) ? m.roles : [])].map((r) => String(r || '').trim()).filter(Boolean);

/**
 * An audience as the email addresses of real team members.
 *
 * `assigned` is the project's people (the studio's projectDesigners map, every
 * role) and `site` its Site Supervisors; a seat is the assigned people holding
 * that seat's role. Only addresses on the team list survive, clients never do,
 * and the person who made the change is always dropped.
 */
export function resolveAudience(
  to: Audience,
  p: { team: any[]; assigned?: string[]; site?: string[]; actorEmail?: string | null },
): string[] {
  const team = (Array.isArray(p.team) ? p.team : []).filter((m) => m && m.email && !rolesOfRow(m).includes('Client'));
  const byEmail = new Map(team.map((m) => [inboxKey(m.email), m]));
  const has = (email: string, role: string) => rolesOfRow(byEmail.get(email)).includes(role);
  const out = new Set<string>();
  for (const r of to.roles || []) for (const m of team) if (rolesOfRow(m).includes(r)) out.add(inboxKey(m.email));
  const assigned = (p.assigned || []).map(inboxKey);
  const site = (p.site || []).map(inboxKey);
  for (const seat of to.project || []) {
    const pool = seat === 'site' ? [...site, ...assigned] : assigned;
    const role = seat === 'ops' ? 'Client Relations' : seat === 'design' ? 'Designer' : 'Site Supervisor';
    for (const e of pool) if (has(e, role)) out.add(e);
  }
  for (const e of to.emails || []) out.add(inboxKey(e));
  const actor = inboxKey(p.actorEmail || '');
  return [...out].filter((e) => e && e !== actor && byEmail.has(e));
}

/* ── In the app ──────────────────────────────────────────────────────────── */

export interface Stored extends Note { id: string }

/**
 * Notes as the bell lists them: open ones only, and a burst of the same group
 * (four check-ins this morning) folded into one entry that counts them.
 */
export function foldGroups(notes: Stored[], now = Date.now()): (Stored & { count: number; members: Stored[] })[] {
  const out: (Stored & { count: number; members: Stored[] })[] = [];
  const byGroup = new Map<string, Stored & { count: number; members: Stored[] }>();
  for (const n of [...notes].filter((x) => isOpen(x, now)).sort((a, b) => b.at - a.at)) {
    const g = n.group ? byGroup.get(n.group) : undefined;
    if (g) { g.count++; g.members.push(n); continue; }
    const entry = { ...n, count: 1, members: [n] };
    out.push(entry);
    if (n.group) byGroup.set(n.group, entry);
  }
  return out;
}

/** The title of a folded entry: "4 people checked in". */
export function foldedTitle(e: { kind: string; title: string; count: number }): string {
  if (e.count < 2) return e.title;
  if (e.kind === 'people.checkin') return `${e.count} people checked in`;
  if (e.kind === 'people.checkout') return `${e.count} people checked out`;
  return `${e.title} and ${e.count - 1} more`;
}

/** Counts for the tab badges: the number waiting on you, and whether anything new is unread. */
export function tabCounts(notes: Note[], now = Date.now()): Record<string, { needs: number; unread: number }> {
  const out: Record<string, { needs: number; unread: number }> = {};
  for (const n of notes) {
    if (!isOpen(n, now)) continue;
    const tab = AREA_TAB[n.area] || 'home';
    const c = (out[tab] ||= { needs: 0, unread: 0 });
    if (n.level === 'needs') c.needs++;
    else if (!n.readAt) c.unread++;
  }
  return out;
}

/* ── Each person's settings: what interrupts them, and when ──────────────── */

export type QuietHours = 'off' | 'night' | 'nightAndWeekend';
export interface NotifyPrefs {
  /** The bar at the bottom, by kind. The bell and the badges always get everything. */
  bar: Record<NoteArea, boolean>;
  /** A desktop alert when StudioDesk is not the window in front, by kind. */
  desktop: Record<NoteArea, boolean>;
  /** A phone (or computer) notification when StudioDesk is closed, by kind, on devices the person turned it on for. */
  phone: Record<NoteArea, boolean>;
  /** A soft chime with the bar. Off unless the person turns it on. */
  sound: boolean;
  /** No bar, alert or chime from 8 PM to 8 AM (and at weekends); the counts still change. */
  quiet: QuietHours;
  /** Every check-in, or only the late ones and those from home. */
  checkins: 'all' | 'exceptions';
}

const AREAS: NoteArea[] = ['clients', 'team', 'design', 'site', 'money'];
const allOn = () => Object.fromEntries(AREAS.map((a) => [a, true])) as Record<NoteArea, boolean>;
export const DEFAULT_PREFS: NotifyPrefs = { bar: allOn(), desktop: allOn(), phone: allOn(), sound: false, quiet: 'night', checkins: 'all' };

/** What always gets through, whatever the settings and the hour: a blocked site and a client's dispute. */
export const ALWAYS_KINDS = new Set(['site.blocker', 'client.dispute']);

/** Settings as stored (or missing, or from an older version), made whole. */
export function cleanPrefs(raw: any): NotifyPrefs {
  const r = raw && typeof raw === 'object' ? raw : {};
  const flags = (v: any) => Object.fromEntries(AREAS.map((a) => [a, v && typeof v[a] === 'boolean' ? v[a] : true])) as Record<NoteArea, boolean>;
  return {
    bar: flags(r.bar),
    desktop: flags(r.desktop),
    phone: flags(r.phone),
    sound: r.sound === true,
    quiet: r.quiet === 'off' || r.quiet === 'nightAndWeekend' ? r.quiet : 'night',
    checkins: r.checkins === 'exceptions' ? 'exceptions' : 'all',
  };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** The hour and weekday at `when`, in a time zone (the server's push uses the person's own), or in this device's. */
function clockAt(when: Date, tz?: string | null): { hour: number; day: number } {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(when);
      const hour = Number(parts.find((x) => x.type === 'hour')?.value);
      const day = DAYS.indexOf(String(parts.find((x) => x.type === 'weekday')?.value));
      if (Number.isFinite(hour) && day >= 0) return { hour: hour % 24, day };
    } catch { /* an unknown zone: fall through to this device's clock */ }
  }
  return { hour: when.getHours(), day: when.getDay() };
}

/** Quiet hours are 8 PM to 8 AM in the person's own time; with weekends, Saturday and Sunday all day too. */
export function isQuiet(prefs: Pick<NotifyPrefs, 'quiet'>, when: Date, tz?: string | null): boolean {
  if (prefs.quiet === 'off') return false;
  const { hour, day } = clockAt(when, tz);
  if (hour >= 20 || hour < 8) return true;
  return prefs.quiet === 'nightAndWeekend' && (day === 0 || day === 6);
}

export type Channel = 'bar' | 'desktop' | 'phone' | 'sound';
/** Whether a note may interrupt through this channel now. Only "needs you" ever interrupts. */
export function interrupts(n: Pick<Note, 'kind' | 'level' | 'area'>, prefs: NotifyPrefs, when: Date, channel: Channel, tz?: string | null): boolean {
  if (n.level !== 'needs') return false;
  if (channel === 'sound' && !prefs.sound) return false;
  if (ALWAYS_KINDS.has(n.kind)) return true;
  if (isQuiet(prefs, when, tz)) return false;
  if (channel === 'desktop') return prefs.desktop[n.area] !== false;
  if (channel === 'phone') return prefs.phone[n.area] !== false;
  return prefs.bar[n.area] !== false;
}

/** Whether a note counts and lists at all: with "only late and from home", an on-time check-in at the office does not. */
export function counted(n: Pick<Note, 'kind' | 'tags'>, prefs: Pick<NotifyPrefs, 'checkins'>): boolean {
  if (n.kind !== 'people.checkin' || prefs.checkins === 'all') return true;
  return (n.tags || []).some((t) => t === 'late' || t === 'home');
}

/* ── To the client, in the portal ────────────────────────────────────────── */

const DOC_LABEL: Record<string, string> = {
  terms_docket: 'the Terms Docket', payment_schedule: 'the payment schedule', execution_agreement: 'the Execution Agreement',
  onboarding_kit: 'your onboarding kit', handover_docket: 'the handover docket', snag_list: 'the snag list',
  detailed_boq: 'the detailed BOQ', scope_revision: 'a scope revision',
};
/** Documents a client reads and keeps; every other kind asks them to approve or sign. */
const READ_ONLY_DOCS = new Set(['onboarding_kit']);
const ids = (xs: any): Set<string> => new Set((Array.isArray(xs) ? xs : []).map((x: any) => String(x?.id || '')).filter(Boolean));
const fresh = (before: any, after: any): any[] => { const had = ids(before); return (Array.isArray(after) ? after : []).filter((x: any) => x?.id && !had.has(String(x.id))); };

/**
 * What became new for the client when the studio released their portal: the
 * difference between two builds of portalView/current (lib/portalProjection).
 * Only additions and answers count, so the client's own actions (which also
 * rebuild the view) never notify them. The very first build is one note, not
 * a flood; more than five things at once become one note that counts them.
 */
export function portalDrafts(before: any, after: any, p: { projectId: string; studioName?: string | null }): Draft[] {
  if (!after) return [];
  const projectName = String(after?.context?.name || '') || null;
  const actor = p.studioName || 'The studio';
  const base = { area: 'clients' as NoteArea, projectId: p.projectId, projectName, actor, group: null, to: {} as Audience };
  if (!before) {
    return [{ ...base, kind: 'portal.ready', level: 'update', title: 'Your project portal is ready', line: 'Everything the studio shares with you will be here', route: 'overview', action: null }];
  }
  const b = before?.context || {}, a = after?.context || {};
  const out: Draft[] = [];
  for (const d of fresh(b.documents?.issues, a.documents?.issues)) {
    const label = DOC_LABEL[d.kind] || 'a document';
    const readOnly = READ_ONLY_DOCS.has(d.kind);
    out.push({ ...base, kind: 'portal.document', level: readOnly ? 'update' : 'needs', title: `New for you: ${label}${Number(d.version) > 1 ? ` (version ${d.version})` : ''}`, line: readOnly ? 'Yours to read and keep' : 'Please read it, then approve it or ask about it', route: 'documents', action: readOnly ? null : 'Read it' });
  }
  for (const m of fresh(b.momHistory, a.momHistory)) {
    out.push({ ...base, kind: 'portal.minutes', level: 'needs', title: `Minutes: ${clip(m.title, 70) || 'your meeting'}`, line: 'Please read them and acknowledge', route: 'feed', action: 'Read the minutes' });
  }
  const beforeSel = new Map((Array.isArray(b.materialSelections) ? b.materialSelections : []).map((x: any) => [String(x?.id), x]));
  for (const s of Array.isArray(a.materialSelections) ? a.materialSelections : []) {
    const was: any = beforeSel.get(String(s?.id));
    if (s?.studioReply && s.studioReply !== was?.studioReply) {
      out.push({ ...base, kind: 'portal.answer', level: 'needs', title: `The studio answered your question about ${clip(s.itemName, 50) || 'a finish'}`, line: quote(s.studioReply), route: 'materials', action: 'Read the answer' });
    } else if (!was && s?.id && !s.clientConfirmedAt) {
      out.push({ ...base, kind: 'portal.finish', level: 'needs', title: `A finish waits for you: ${clip(s.itemName, 50) || 'a selection'}`, line: 'Have a look and confirm it, or ask about it', route: 'materials', action: 'Choose' });
    }
  }
  for (const m of fresh(before?.designRecord, after?.designRecord)) {
    if (m?.confirmation) continue;
    out.push({ ...base, kind: 'portal.meeting', level: 'needs', title: 'Your design meeting record is ready', line: 'Check what was agreed, room by room, and confirm it', route: 'designScope:record', action: 'Confirm it' });
  }
  const beforePay = new Map((Array.isArray(b.paymentMilestones) ? b.paymentMilestones : []).map((x: any) => [String(x?.id), x]));
  for (const m of Array.isArray(a.paymentMilestones) ? a.paymentMilestones : []) {
    const was: any = beforePay.get(String(m?.id));
    if (m?.status === 'invoiced' && was?.status !== 'invoiced') {
      out.push({ ...base, kind: 'portal.invoice', level: 'needs', title: `Invoice raised: ${clip(m.name, 60) || 'a milestone'}`, line: m.invoiceNumber ? `Invoice ${clip(m.invoiceNumber, 30)}` : 'On your payment schedule', route: 'financials', action: 'See the schedule' });
    }
  }
  for (const d of fresh(b.projectDecisions, a.projectDecisions)) {
    if (d?.clientConfirmedAt) continue;
    out.push({ ...base, kind: 'portal.decision', level: 'needs', title: `A decision waits for you: ${clip(d.title, 60) || 'one item'}`, line: clip(d.description, 120) || 'Choose, or ask about it', route: 'decisions', action: 'Decide' });
  }
  const news = [...fresh(b.siteUpdates, a.siteUpdates), ...fresh(b.projectUpdates, a.projectUpdates)];
  if (news.length) {
    out.push({ ...base, kind: 'portal.update', level: 'update', title: news.length === 1 ? `New from your project: ${clip(news[0].title, 60) || 'an update'}` : `${news.length} new updates from your project`, line: clip(news[0].note || news[0].summary, 120) || 'With photos where there are some', route: 'feed', action: null });
  }
  if (out.length > 5) {
    const needs = out.filter((d) => d.level === 'needs').length;
    return [{ ...base, kind: 'portal.many', level: needs ? 'needs' : 'update', title: `${out.length} new things in your portal`, line: out.slice(0, 3).map((d) => d.title).join(' · '), route: 'overview', action: needs ? 'Have a look' : null }];
  }
  return out;
}
