/*
  The one-line summaries on the Execution & Site screens (DESIGN.md "Summary-first sections").

  Each screen in stage 5 stacks its tools as sections. A closed section shows
  one line saying where that tool stands, and the screen opens the section that
  needs someone first. These are the numbers behind those lines, worked out from
  the same project fields the tools themselves read, so the line and the tool
  never disagree.
*/
import type { ProjectContext, WeeklyReport } from '../types';

export type SectionTone = 'bad' | 'warn' | 'ok' | 'none';

export interface SectionLine {
  /** One line, e.g. "3 open · 1 high". */
  summary: string;
  tone: SectionTone;
}

/* The six checks every room gets before handover. Shared with the client's printed report. */
export const STANDARD_CHECKS = [
  { id: 'paint', label: 'Final Paint Touch-ups (Skirting, Grooves & Cornice)', category: 'Finishes & Paint' },
  { id: 'hardware', label: 'Cabinet Shutters Aligned & Hardware Tightened', category: 'Woodwork & Hardware' },
  { id: 'clean', label: 'Deep Cleaning (Inside Cabinets, Drawers & Floors)', category: 'Cleaning & Handover' },
  { id: 'electrical', label: 'All Switchboards Clean, Straight & Plate Covers Snapped', category: 'Electrical & Fixtures' },
  { id: 'plumbing', label: 'Angle Cocks, Faucets & Drain Lines Leak-tested', category: 'Plumbing & Sanitary' },
  { id: 'debris', label: 'Site Debris Cleared & Surface Protection Removed', category: 'Cleaning & Handover' },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Quality & snags
// ---------------------------------------------------------------------------

export function snagCounts(ctx: Pick<ProjectContext, 'snagList'>) {
  const snags = ctx.snagList || [];
  const open = snags.filter((s) => s.status === 'open' || s.status === 'in_progress').length;
  const awaiting = snags.filter((s) => s.status === 'resolved').length;
  const high = snags.filter((s) => s.severity === 'high' && (s.status === 'open' || s.status === 'in_progress')).length;
  return { total: snags.length, open, awaiting, high };
}

export function snagLine(ctx: Pick<ProjectContext, 'snagList'>): SectionLine {
  const c = snagCounts(ctx);
  if (c.total === 0) return { summary: 'Nothing logged yet', tone: 'none' };
  if (c.open === 0) {
    return c.awaiting
      ? { summary: `All fixed · ${c.awaiting} waiting for the client to verify`, tone: 'warn' }
      : { summary: `All ${c.total} closed`, tone: 'ok' };
  }
  const parts = [`${c.open} open`];
  if (c.high) parts.push(`${c.high} high`);
  if (c.awaiting) parts.push(`${c.awaiting} to verify`);
  return { summary: parts.join(' · '), tone: c.high ? 'bad' : 'warn' };
}

/** The pre-handover checklist, worked out exactly as PreHandoverChecklist does. */
export function checklistProgress(ctx: Pick<ProjectContext, 'rooms' | 'qualityChecklist' | 'electricalPointsPlan'>) {
  const q: any = ctx.qualityChecklist || {};
  const checked = q.checkedState && typeof q.checkedState === 'object' ? q.checkedState : {};
  const na = q.naState && typeof q.naState === 'object' ? q.naState : {};
  const elec = q.elecVerified && typeof q.elecVerified === 'object' ? q.elecVerified : {};
  const customs: any[] = Array.isArray(q.customChecks) ? q.customChecks : [];
  const rooms = (ctx.rooms || []) as any[];
  let total = 0;
  let done = 0;
  let roomsDone = 0;
  let elecRooms = 0;
  for (const room of rooms) {
    const id = room.id || room.name;
    const roomChecks = checked[id] && typeof checked[id] === 'object' ? checked[id] : {};
    const roomNA = na[id] && typeof na[id] === 'object' ? na[id] : {};
    const std = STANDARD_CHECKS.filter((c) => !roomNA[c.id]);
    const mine = customs.filter((c) => c && c.roomId === id);
    const t = std.length + mine.length;
    const d = std.filter((c) => !!roomChecks[c.id]).length + mine.filter((c) => c.checked).length;
    total += t;
    done += d;
    if (t === 0 || d === t) roomsDone += 1;
    if (elec[id]) elecRooms += 1;
  }
  const points = (ctx.electricalPointsPlan || []).reduce((s, p) => {
    const n = typeof p?.qty === 'number' ? p.qty : parseInt(p?.qty as any) || 0;
    return s + (isNaN(n) ? 0 : n);
  }, 0);
  return { rooms: rooms.length, total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0, roomsDone, elecRooms, points };
}

export function checklistLine(ctx: Pick<ProjectContext, 'rooms' | 'qualityChecklist' | 'electricalPointsPlan'>): SectionLine {
  const p = checklistProgress(ctx);
  if (p.rooms === 0) return { summary: 'Add rooms to the project to start the checklist', tone: 'none' };
  if (p.done === 0) return { summary: `Not started · ${plural(p.rooms, 'room')}`, tone: 'none' };
  if (p.done === p.total) return { summary: `All ${plural(p.rooms, 'room')} checked`, tone: 'ok' };
  return { summary: `${p.pct}% done · ${p.roomsDone} of ${plural(p.rooms, 'room')} complete`, tone: 'warn' };
}

export function electricalLine(ctx: Pick<ProjectContext, 'rooms' | 'qualityChecklist' | 'electricalPointsPlan'>): SectionLine {
  const p = checklistProgress(ctx);
  if (p.rooms === 0) return { summary: 'Add rooms to the project to check the points', tone: 'none' };
  const pts = p.points ? `${plural(p.points, 'point')} planned · ` : '';
  if (p.elecRooms === 0) return { summary: `${pts}no room verified yet`, tone: 'none' };
  if (p.elecRooms === p.rooms) return { summary: `${pts}every room verified`, tone: 'ok' };
  return { summary: `${pts}${p.elecRooms} of ${plural(p.rooms, 'room')} verified`, tone: 'warn' };
}

// ---------------------------------------------------------------------------
// Meetings & reports
// ---------------------------------------------------------------------------

/** Counts from lib/minutes trackedActions plus the minutes themselves. */
export function minutesLine(c: { open: number; overdue: number; toConfirm: number; meetings: number }): SectionLine {
  if (c.meetings === 0) return { summary: 'No meeting recorded yet', tone: 'none' };
  const parts: string[] = [];
  parts.push(c.open ? `${c.open} open ${c.open === 1 ? 'action' : 'actions'}` : 'No open actions');
  if (c.overdue) parts.push(`${c.overdue} overdue`);
  if (c.toConfirm) parts.push(`${c.toConfirm} minutes to confirm`);
  return { summary: parts.join(' · '), tone: c.overdue ? 'bad' : c.open || c.toConfirm ? 'warn' : 'ok' };
}

const DAY = 86_400_000;

/** The last report issued, and whether this week's is still to go. */
export function weeklyLine(ctx: Pick<ProjectContext, 'weeklyReports'>, now = Date.now()): SectionLine {
  const reports: WeeklyReport[] = [...(ctx.weeklyReports || [])].sort((a, b) => b.weekNumber - a.weekNumber);
  if (reports.length === 0) return { summary: 'No report issued yet', tone: 'none' };
  const last = reports[0];
  const issued = reports.filter((r) => r.publishedAt).length;
  const lastDate = last.publishedAt || Date.parse(last.weekOf) || 0;
  const days = lastDate ? Math.floor((now - lastDate) / DAY) : null;
  const head = `Week ${last.weekNumber} ${last.publishedAt ? 'issued' : 'drafted'}`;
  const tail = `${issued} of ${plural(reports.length, 'report')} sent`;
  if (days !== null && days >= 7) return { summary: `${head} ${days} days ago · this week's is due`, tone: 'warn' };
  return { summary: `${head} · ${tail}`, tone: last.publishedAt ? 'ok' : 'warn' };
}

// ---------------------------------------------------------------------------
// Which section opens first
// ---------------------------------------------------------------------------

/**
 * The section a screen opens with: the first that is bad, else the first that
 * needs a look, else the first with anything in it, else the first.
 */
export function firstToOpen<T extends { id: string; tone: SectionTone }>(sections: T[]): string | null {
  if (sections.length === 0) return null;
  return (
    sections.find((s) => s.tone === 'bad') ||
    sections.find((s) => s.tone === 'warn') ||
    sections.find((s) => s.tone === 'ok') ||
    sections[0]
  ).id;
}
