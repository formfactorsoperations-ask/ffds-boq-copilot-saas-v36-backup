/*
  HOME STORIES: the cards at the top of Home (components/home/StoryDeck.tsx).

  Each card is one thing worth knowing, with the one button that acts on it,
  sorted into a few rings a person can tap to filter by. Under them sits a
  strip of five swatches: the studio's (or a designer's) numbers at a glance.

  Everything here comes from what StudioDesk already holds: the projects and
  their payment milestones, the Design Desk's sheets, the meetings and visits
  booked with clients, and People. A card with nothing to say is left out,
  never padded; money appears only for the roles that see the studio's money.

  Three views, by role:
    studio    Owners, Admins, Ops Director (with money) and the Design Head,
              Client Relations and Site Supervisor (without)
    designer  a Designer: only their sheets and their projects
*/
import { stateOf } from './drawingReview';
import { dueOf, type DeskRow, type Viewer } from './designDesk';
import { mySheets, reviewInbox, type Upcoming, type TeamToday } from './homeWidgets';
import { clientMoneyOf } from './clientMoney';
import { paymentWaiting, dayKey, type WaitingItem } from './opsDesk';
import { clock12 } from './peopleDesk';

const DAY = 86_400_000;

export type Material = 'indigo' | 'periwinkle' | 'brass' | 'rose' | 'sage' | 'navy';
export type RingId = 'money' | 'design' | 'clients' | 'site' | 'team' | 'sheets' | 'reviews' | 'meetings' | 'wins';

/** Where a card's button goes: a tab, a sheet on the Design Desk, or a project. */
export type StoryAction =
  | { kind: 'tab'; tab: string; label: string }
  | { kind: 'sheet'; projectId: string; drawingId: string; label: string }
  | { kind: 'project'; projectId: string; label: string };

export interface Story {
  id: string;
  ring: RingId;
  /** The small caps over the figure, e.g. "DUE IN 7 DAYS". */
  eyebrow: string;
  /** The big figure or word on the card's swatch. */
  figure: string;
  headline: string;
  reason: string;
  action: StoryAction;
  /** 0 is the most pressing; the deck opens on it. */
  weight: number;
}
export interface Ring { id: RingId; label: string; material: Material; count: number; glyph?: string }
export interface Swatch { id: string; material: Material; figure: string; label: string; sub: string }
export interface Stories { view: 'studio' | 'designer'; rings: Ring[]; cards: Story[]; swatches: Swatch[] }

export interface StoryInput {
  now: Date;
  view: 'studio' | 'designer';
  /** Sees the studio's money (lib/roleAccess seesStudioFinance). */
  finance: boolean;
  viewer: Viewer;
  projects: any[];
  counts: { active: number; pipeline: number; booked: number; open: number; winRate: number };
  /** The Design Desk's sheets this person may see; null while loading. */
  rows: DeskRow[] | null;
  visits: Upcoming[] | null;
  team: TeamToday | null;
  /** Invoiced, unpaid milestones (paymentsOf); only for those who see money. */
  payments: WaitingItem[];
  /** Turns an amount into ₹1.84 Cr / ₹14.2L. */
  money: (n: number) => string;
}

const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const first = (name?: string | null) => String(name || '').trim().split(/\s+/)[0] || 'Someone';
const nameOf = (p: any) => String(p?.context?.name || p?.name || 'Project');
const KIND: Record<string, string> = { meeting: 'Meeting', site_visit: 'Site visit', measurement: 'Measurement' };
const whenOf = (u: Upcoming) => (u.daysAway === 0 ? 'today' : u.daysAway === 1 ? 'tomorrow'
  : new Date(`${u.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));

/** Invoiced and unpaid milestones across the projects, from the client's side of the money. */
export function paymentsOf(projects: any[], dueDays: number, now: number): WaitingItem[] {
  const out: WaitingItem[] = [];
  for (const p of projects) {
    const status = String(p?.context?.status || '');
    if (['lost', 'archived'].includes(status)) continue;
    out.push(...paymentWaiting({ id: String(p.id), name: nameOf(p) }, clientMoneyOf(p), { paymentDueDays: dueDays } as any, now));
  }
  return out;
}

/** Sheets decided in the last seven days: approved, and all decided (approved or sent back). */
function decidedThisWeek(rows: DeskRow[], now: Date, only?: (d: DeskRow) => boolean) {
  const from = now.getTime() - 7 * DAY;
  const recent = rows.filter((d) => (d.review?.decidedAt || 0) >= from && (!only || only(d)));
  const approved = recent.filter((d) => stateOf(d.review) === 'APPROVED');
  const decided = recent.filter((d) => ['APPROVED', 'CHANGES_REQUESTED'].includes(stateOf(d.review)));
  return { approved, decided, firstTime: approved.filter((d) => (d.review?.attempts || 0) <= 1) };
}

export function buildStories(i: StoryInput): Stories {
  return i.view === 'designer' ? designerStories(i) : studioStories(i);
}

/* ── The studio's view ───────────────────────────────────────────────────── */

function studioStories(i: StoryInput): Stories {
  const cards: Story[] = [];
  const now = i.now.getTime();
  const today = dayKey(now);
  const in7 = dayKey(now + 7 * DAY);

  /* Money, for those who see it */
  let due7 = 0, late = 0;
  if (i.finance) {
    const pays = i.payments;
    const lateItems = pays.filter((p) => (p.overdueDays || 0) > 0).sort((a, b) => (b.overdueDays || 0) - (a.overdueDays || 0));
    const soon = pays.filter((p) => !(p.overdueDays || 0) && (p.dueKey || '') >= today && (p.dueKey || '') <= in7);
    late = lateItems.reduce((n, p) => n + (p.amount || 0), 0);
    due7 = soon.reduce((n, p) => n + (p.amount || 0), 0) + late;
    if (due7 > 0) {
      const worst = lateItems[0];
      cards.push({
        id: 'money-due', ring: 'money', eyebrow: 'Due in 7 days', figure: i.money(due7),
        headline: `${plural(soon.length + lateItems.length, 'invoice')}${late ? `, ${i.money(late)} of it late` : ''}`,
        reason: worst ? `${worst.projectName} is ${plural(worst.overdueDays || 0, 'day')} late on ${worst.label}.` : 'Nothing is late yet. A reminder now keeps it that way.',
        action: { kind: 'tab', tab: 'ops-desk', label: worst ? `Chase ${worst.projectName}` : 'Open Ops Desk' }, weight: worst ? 0 : 3,
      });
    }
    if (i.counts.booked > 0 || i.counts.open > 0) {
      cards.push({
        id: 'money-booked', ring: 'money', eyebrow: 'Booked, active work', figure: i.money(i.counts.booked),
        headline: `${plural(i.counts.active, 'active project')}`,
        reason: `${i.money(Math.max(0, i.counts.open - i.counts.booked))} more in the pipeline, at a ${i.counts.winRate}% win rate.`,
        action: { kind: 'tab', tab: 'reports', label: 'Open the reports' }, weight: 6,
      });
    }
  }

  /* Design */
  const rows = i.rows || [];
  if (i.rows) {
    const inbox = reviewInbox(rows, i.viewer, i.now);
    if (inbox.waiting.length) {
      const oldest = [...inbox.waiting].sort((a, b) => (a.review?.submittedAt || 0) - (b.review?.submittedAt || 0))[0];
      const days = inbox.oldestDays || 0;
      cards.push({
        id: 'design-waiting', ring: 'design', eyebrow: 'Waiting for review', figure: String(inbox.waiting.length),
        headline: `${inbox.waiting.length === 1 ? 'sheet' : 'sheets'} to review${inbox.overdue ? `, ${inbox.overdue} overdue` : ''}`,
        reason: `Oldest is ${first(oldest.review?.designer?.name)}'s ${oldest.name}, ${days ? plural(days, 'day') : 'sent today'}.`,
        action: i.viewer.reviewer ? { kind: 'sheet', projectId: oldest.projectId, drawingId: oldest.id, label: 'Start reviewing' } : { kind: 'tab', tab: 'design-review', label: 'Open Design Desk' },
        weight: inbox.overdue ? 0 : 1,
      });
    }
    if (inbox.clientChanges) cards.push({
      id: 'design-client', ring: 'design', eyebrow: 'Client changes', figure: String(inbox.clientChanges),
      headline: `approved ${inbox.clientChanges === 1 ? 'sheet has' : 'sheets have'} changes from a meeting`,
      reason: 'Edit them and send the sheet back to its designer, or keep it approved.',
      action: { kind: 'tab', tab: 'design-review', label: 'See the changes' }, weight: 2,
    });
    const week = decidedThisWeek(rows, i.now);
    if (week.decided.length) cards.push({
      id: 'design-approved', ring: 'design', eyebrow: 'Approved this week', figure: `${week.approved.length}/${week.decided.length}`,
      headline: `${Math.round((week.firstTime.length / Math.max(1, week.approved.length)) * 100)}% first time`,
      reason: `${plural(week.approved.length, 'sheet')} approved and ${week.decided.length - week.approved.length} sent back in seven days.`,
      action: { kind: 'tab', tab: 'design-review', label: 'See the sheets' }, weight: 7,
    });
  }

  /* Clients */
  const visits = i.visits || [];
  const asked = visits.filter((u) => u.visit.status === 'requested' || u.visit.status === 'rescheduled');
  if (asked.length) {
    const u = asked[0];
    cards.push({
      id: 'clients-confirm', ring: 'clients', eyebrow: 'To confirm', figure: String(asked.length),
      headline: `${(KIND[u.visit.kind] || 'Meeting').toLowerCase()} with ${u.visit.projectName}`,
      reason: `Asked for ${whenOf(u)}${u.time ? ` at ${clock12(u.time)}` : ''}. Confirm it or offer another time.`,
      action: { kind: 'tab', tab: 'ops-desk', label: 'Confirm it' }, weight: u.daysAway <= 2 ? 1 : 3,
    });
  }
  const week = visits.filter((u) => u.daysAway <= 7);
  if (week.length) {
    const u = week[0];
    cards.push({
      id: 'clients-week', ring: 'clients', eyebrow: 'Meetings this week', figure: String(week.length),
      headline: week.slice(0, 2).map((x) => `${x.visit.projectName} ${whenOf(x)}`).join(', '),
      reason: `Next: ${(KIND[u.visit.kind] || 'Meeting').toLowerCase()}${u.time ? ` at ${clock12(u.time)}` : ''}, ${u.visit.status === 'confirmed' ? 'confirmed' : 'not yet confirmed'}.`,
      action: { kind: 'tab', tab: 'ops-desk', label: 'See the week' }, weight: 4,
    });
  }

  /* Site */
  const onSite = i.projects.filter((p) => p?.context?.status === 'execution');
  if (onSite.length) {
    const visit = visits.find((u) => u.visit.kind !== 'meeting');
    cards.push({
      id: 'site-execution', ring: 'site', eyebrow: 'On site', figure: String(onSite.length),
      headline: `${onSite.length === 1 ? 'project' : 'projects'} in execution`,
      reason: visit ? `Next on site: ${(KIND[visit.visit.kind] || 'visit').toLowerCase()} at ${visit.visit.projectName}, ${whenOf(visit)}.` : onSite.slice(0, 3).map(nameOf).join(', ') + '.',
      action: onSite.length === 1 ? { kind: 'project', projectId: String(onSite[0].id), label: `Open ${nameOf(onSite[0])}` } : { kind: 'tab', tab: 'projects', label: 'Open the projects' },
      weight: 5,
    });
  }

  /* Team */
  if (i.rows && i.viewer.reviewer) {
    const load = new Map<string, { name: string; open: number; late: number }>();
    for (const d of rows) {
      const s = stateOf(d.review);
      const who = d.review?.designer;
      if (!who?.email || !['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'].includes(s)) continue;
      const e = load.get(who.email) || { name: who.name || who.email, open: 0, late: 0 };
      e.open++;
      if (dueOf(d.targetDate, i.now)?.tone === 'late') e.late++;
      load.set(who.email, e);
    }
    const list = [...load.values()].sort((a, b) => b.late - a.late || b.open - a.open);
    if (list.length) {
      const top = list[0];
      const light = list.length > 1 ? list[list.length - 1] : null;
      cards.push({
        id: 'team-load', ring: 'team', eyebrow: 'Team load', figure: String(top.open),
        headline: `sheets with ${first(top.name)}${top.late ? `, ${top.late} late` : ''}`,
        reason: light && light.open < top.open ? `${first(light.name)} has the fewest (${light.open}).` : 'The work is evenly spread.',
        action: { kind: 'tab', tab: 'design-review', label: 'Open Design Desk' }, weight: top.late ? 2 : 8,
      });
    }
  }
  if (i.team && i.team.away.length + i.team.home.length) {
    const out = [...i.team.away, ...i.team.home];
    cards.push({
      id: 'team-away', ring: 'team', eyebrow: 'Out today', figure: String(out.length),
      headline: `${out.length === 1 ? 'person' : 'people'} away or working from home`,
      reason: out.slice(0, 4).map((a) => `${first(a.name)}${a.mode === 'WFH' ? ' (home)' : ''}`).join(', ') + '.',
      action: { kind: 'tab', tab: 'people', label: 'See the team' }, weight: 9,
    });
  }

  /* The swatches */
  const sw: Swatch[] = [];
  const decided = i.rows ? decidedThisWeek(rows, i.now) : null;
  const approvedSw: Swatch = { id: 'approved', material: 'sage', figure: decided ? `${decided.approved.length}/${decided.decided.length}` : '–', label: 'Approved', sub: 'sheets this week' };
  if (i.finance) {
    sw.push(
      { id: 'booked', material: 'indigo', figure: i.money(i.counts.booked), label: 'Booked', sub: `${plural(i.counts.active, 'active project')}` },
      { id: 'pipeline', material: 'periwinkle', figure: i.money(Math.max(0, i.counts.open - i.counts.booked)), label: 'Pipeline', sub: `${i.counts.winRate}% win rate` },
      { id: 'due', material: 'brass', figure: i.money(due7), label: 'Due', sub: 'next 7 days' },
      { id: 'late', material: 'rose', figure: i.money(late), label: 'Late', sub: late ? 'past due' : 'nothing late' },
      approvedSw,
    );
  } else {
    const inbox = i.rows ? reviewInbox(rows, i.viewer, i.now) : null;
    sw.push(
      { id: 'active', material: 'indigo', figure: String(i.counts.active), label: 'Active', sub: 'projects' },
      { id: 'pipeline', material: 'periwinkle', figure: String(i.counts.pipeline), label: 'Pipeline', sub: 'projects' },
      { id: 'waiting', material: 'brass', figure: inbox ? String(inbox.waiting.length) : '–', label: 'To review', sub: inbox?.oldestDays ? `oldest ${inbox.oldestDays} d` : 'sheets' },
      { id: 'overdue', material: 'rose', figure: inbox ? String(inbox.overdue) : '–', label: 'Overdue', sub: 'sheets' },
      approvedSw,
    );
  }

  const rings: Ring[] = ([
    { id: 'money', label: 'Money', material: 'brass', glyph: '₹' },
    { id: 'design', label: 'Design', material: 'indigo' },
    { id: 'clients', label: 'Clients', material: 'rose' },
    { id: 'site', label: 'Site', material: 'sage' },
    { id: 'team', label: 'Team', material: 'navy' },
  ] as Omit<Ring, 'count'>[])
    .map((r) => ({ ...r, count: cards.filter((c) => c.ring === r.id).length }))
    .filter((r) => r.count > 0);
  return { view: 'studio', rings, cards: cards.sort((a, b) => a.weight - b.weight), swatches: sw };
}

/* ── A designer's view ───────────────────────────────────────────────────── */

function designerStories(i: StoryInput): Stories {
  const cards: Story[] = [];
  const rows = i.rows || [];
  const m = mySheets(rows, i.viewer, i.now);
  const mine = (d: DeskRow) => d.review?.designer?.email === i.viewer.email;

  const fix = m.fix[0];
  if (fix) {
    const due = dueOf(fix.targetDate, i.now);
    cards.push({
      id: 'sheets-fix', ring: 'sheets', eyebrow: 'Up next', figure: fix.roomName || fix.name,
      headline: `Round ${(fix.review?.attempts || 1) + 1}${due ? ` · ${due.label.toLowerCase()}` : ''}`,
      reason: `${fix.name}: ${fix.review?.marksOpen ? `${plural(fix.review.marksOpen, 'note')} still open` : 'sent back with changes'}.${m.fix.length > 1 ? ` ${m.fix.length - 1} more to fix.` : ''}`,
      action: { kind: 'sheet', projectId: fix.projectId, drawingId: fix.id, label: 'Open the notes' }, weight: 0,
    });
  }
  const draft = m.drafts[0];
  if (draft) cards.push({
    id: 'sheets-send', ring: 'sheets', eyebrow: 'Ready to send', figure: String(m.drafts.length),
    headline: draft.name,
    reason: m.drafts.length > 1 ? `And ${plural(m.drafts.length - 1, 'other draft')}. Send each for review when you are happy.` : 'Send it for review when you are happy.',
    action: { kind: 'sheet', projectId: draft.projectId, drawingId: draft.id, label: 'Send it' }, weight: dueOf(draft.targetDate, i.now)?.tone === 'late' ? 1 : 2,
  });
  if (m.waiting.length) {
    const oldest = [...m.waiting].sort((a, b) => (a.review?.submittedAt || 0) - (b.review?.submittedAt || 0))[0];
    const days = oldest.review?.submittedAt ? Math.floor((i.now.getTime() - oldest.review.submittedAt) / DAY) : 0;
    cards.push({
      id: 'reviews-waiting', ring: 'reviews', eyebrow: 'With the reviewer', figure: String(m.waiting.length),
      headline: `oldest ${days ? plural(days, 'day') : 'sent today'}`,
      reason: `${oldest.name} is the one waiting longest.`,
      action: { kind: 'tab', tab: 'design-review', label: 'See them' }, weight: 5,
    });
  }
  const next = (i.visits || [])[0];
  if (next) cards.push({
    id: 'meetings-next', ring: 'meetings', eyebrow: `${whenOf(next)}${next.time ? ` ${clock12(next.time)}` : ''}`, figure: KIND[next.visit.kind] || 'Meeting',
    headline: next.visit.projectName,
    reason: next.visit.status === 'confirmed' ? 'Confirmed with the client.' : 'Asked for; not yet confirmed.',
    action: { kind: 'tab', tab: 'design-review', label: 'Prepare' }, weight: next.daysAway <= 1 ? 1 : 4,
  });
  const week = decidedThisWeek(rows, i.now, mine);
  if (week.approved.length) cards.push({
    id: 'wins-week', ring: 'wins', eyebrow: 'Approved this week', figure: String(week.approved.length),
    headline: `${week.firstTime.length} of them first time`,
    reason: week.firstTime.length === week.approved.length ? 'Every one approved first time.' : 'Nice going.',
    action: { kind: 'tab', tab: 'design-review', label: 'See them' }, weight: 9,
  });

  const dueSoon = [...m.fix, ...m.drafts].filter((d) => ['late', 'soon'].includes(dueOf(d.targetDate, i.now)?.tone || ''));
  const swatches: Swatch[] = [
    { id: 'fix', material: 'brass', figure: String(m.fix.length), label: 'To fix', sub: `${plural(m.fix.reduce((n, d) => n + (d.review?.marksOpen || 0), 0), 'note')} open` },
    { id: 'waiting', material: 'indigo', figure: String(m.waiting.length), label: 'With the reviewer', sub: 'waiting' },
    { id: 'send', material: 'periwinkle', figure: String(m.drafts.length), label: 'To send', sub: m.drafts[0]?.name || 'drafts' },
    { id: 'approved', material: 'sage', figure: String(week.approved.length), label: 'Approved', sub: 'this week' },
    { id: 'due', material: 'rose', figure: String(dueSoon.length), label: 'Due soon', sub: 'in three days' },
  ];
  const rings: Ring[] = ([
    { id: 'sheets', label: 'My sheets', material: 'indigo' },
    { id: 'reviews', label: 'Reviews', material: 'brass' },
    { id: 'meetings', label: 'Meetings', material: 'rose' },
    { id: 'wins', label: 'Wins', material: 'sage' },
  ] as Omit<Ring, 'count'>[])
    .map((r) => ({ ...r, count: cards.filter((c) => c.ring === r.id).length }))
    .filter((r) => r.count > 0);
  return { view: 'designer', rings, cards: cards.sort((a, b) => a.weight - b.weight), swatches };
}
