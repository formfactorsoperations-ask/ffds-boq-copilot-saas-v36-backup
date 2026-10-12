/*
  HOME: "Ask the studio" (DESIGN.md → "Ask the studio").

  A question about the studio, answered from a short record built here from
  what Home already reads: the projects this person may see, the Design
  Desk's sheets, client meetings and visits, the projects that need someone,
  who is away today, and, for finance roles only, what clients owe. Nothing
  else leaves the browser; the AI never sees money a person may not see.
*/
import { stateOf } from './drawingReview';
import type { DeskRow } from './designDesk';
import type { TeamToday, Upcoming } from './homeWidgets';
import type { WaitingItem } from './opsDesk';

export interface StudioRecordInput {
  view: 'studio' | 'designer';
  /** Sees studio finance (lib/roleAccess): only then does money go in. */
  finance: boolean;
  /** Today as YYYY-MM-DD. */
  today: string;
  projects: any[];
  rows: DeskRow[] | null;
  visits: Upcoming[] | null;
  attention: { project: any; worst: string; actions: any[]; idle: number }[];
  team: TeamToday | null;
  payments: WaitingItem[];
  money: (n: number) => string;
}

const STATE: Record<string, string> = {
  DRAFT: 'draft, not sent', IN_REVIEW: 'with the reviewer', CHANGES_REQUESTED: 'sent back with changes', APPROVED: 'approved',
};
const nameOf = (p: any) => String(p?.context?.name || p?.context?.clientName || p?.name || 'Project');
const dateOf = (v: any): string | null => {
  if (!v) return null;
  const t = typeof v === 'number' ? v : v?.seconds ? v.seconds * 1000 : Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};
const LIVE = (p: any) => !['lost', 'archived'].includes(String(p?.context?.status || ''));

/** The record the AI reads, as compact JSON. Capped so a large studio still fits. */
export function studioRecord(i: StudioRecordInput): string {
  const names = new Map(i.projects.map((p) => [String(p.id), nameOf(p)]));
  const projects = i.projects.filter(LIVE).slice(0, 60).map((p) => ({
    name: nameOf(p),
    client: p?.context?.clientName || null,
    stage: p?.context?.status || 'draft',
    handover: dateOf(p?.context?.targetHandoverDate),
    designers: Array.isArray(p?.context?.assignedDesigners) ? p.context.assignedDesigners.slice(0, 4) : undefined,
  }));
  const sheets = (i.rows || []).filter((d) => stateOf(d.review) !== 'NONE' || d.targetDate).slice(0, 150).map((d) => ({
    sheet: d.name,
    project: names.get(d.projectId) || (d.review as any)?.projectName || 'Project',
    room: d.roomName || null,
    state: STATE[stateOf(d.review)] || 'no PDF yet',
    designer: d.review?.designer?.name || null,
    due: d.targetDate || null,
    notesOpen: d.review?.marksOpen || undefined,
    clientChanges: d.review?.clientChanges?.pending ? true : undefined,
  }));
  const meetings = (i.visits || []).slice(0, 20).map((u) => ({
    what: u.visit.kind, project: u.visit.projectName, date: u.date, time: u.time || null, status: u.visit.status, mode: u.visit.mode,
  }));
  const needs = i.attention.slice(0, 20).map((r) => ({
    project: nameOf(r.project), flag: r.worst === 'blocker' ? 'blocked' : r.worst === 'due' ? 'due' : 'can wait',
    next: r.actions[0]?.title || null, idleDays: r.idle,
  }));
  const team = i.team ? {
    working: Math.max(0, i.team.team - i.team.away.length), onTeam: i.team.team,
    onLeave: i.team.away.map((a) => a.name), fromHome: i.team.home.map((a) => a.name), askedOff: i.team.asked.map((a) => a.name),
    nextHoliday: i.team.nextHoliday ? `${i.team.nextHoliday.name}, ${i.team.nextHoliday.date}` : null,
  } : null;
  const owed = i.finance ? i.payments.filter((w) => w.kind === 'payment').slice(0, 30).map((w) => ({
    project: w.projectName, what: w.label, amount: w.amount != null ? i.money(w.amount) : null, overdueDays: w.overdueDays || 0, reminders: w.reminders,
  })) : undefined;
  return JSON.stringify({ today: i.today, view: i.view, projects, sheets, meetings, needs, team, owed });
}

export const ASK_STUDIO_INSTRUCTIONS = `You answer questions about an interior design studio for one of its team, using only the JSON record given.
Rules:
- Answer in one to four plain sentences, or a short list when the question asks for several things. Name projects, people, dates and amounts exactly as the record has them.
- If the record does not say, answer "The records here don't say." and suggest where in StudioDesk to look (Projects, Design Desk, Ops Desk or People).
- The record has no money unless it has "owed". If asked about money without it, say it isn't something they can see here.
- Never guess at reasons someone is away; the record does not hold them.
- sources: the parts of the record you used, as short labels (e.g. "Harmony 704", "Sheets", "Meetings", "Team today").`;

/** Questions to start from, by who is asking. */
export function suggestionsFor(view: 'studio' | 'designer', finance: boolean): string[] {
  if (view === 'designer') return ['What is due this week?', 'Which of my sheets came back with changes?', 'What meetings do I have coming up?'];
  return [finance ? 'Who owes us money?' : 'Which projects are blocked?', 'What is waiting for review?', 'Who is away today?'];
}
