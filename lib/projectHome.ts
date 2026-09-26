/**
 * Project Home — the data behind the project dashboard.
 *
 * Pure functions only: every figure the page draws is worked out here from
 * records the app already keeps, so it can be checked against the screens that
 * own those records. Nothing here invents a number. Where a record is missing
 * the model says so, and the page shows an empty state rather than a guess.
 *
 *   Journey       the Ops Matrix steps (services/journeyEngine)
 *   Drawings      the Drawing Tracker, read through lib/drawingIntel
 *   Payments      lib/paymentSchedule's computeSchedule
 *   Programme     lib/schedule's planned dates
 *   Cost          the BOQ, costed as materials + labour (as lib/projectPnl does)
 *   Activity      site visits, meetings, payments, decisions, cleared steps
 *   Portal        the projection the client actually reads
 */
import type { StepWithStatus } from '../services/journeyEngine';
import type { DrawingTrackerItem, PaymentMilestone, ProjectDecisionRecord, MOM, FullBoqItem } from '../types';
import type { ScheduleResult as PaymentResult } from './paymentSchedule';
import { turnaroundOf, msOf } from './drawingIntel';
import { PHASES } from '../constants/journeyConstants';

export const DAY = 86400000;
export const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const todayISO = () => isoOf(Date.now());
export const dayNum = (iso: string) => Math.round(new Date(iso + 'T00:00:00Z').getTime() / DAY);

/** A date-ish value (Firestore Timestamp, ms, ISO string, Date) as ms, or 0. */
export function anyMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

export const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

/** ₹2,44,571 → ₹2.45L, ₹80,000 → ₹80K. For labels too small for the full figure. */
export const inrShort = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L` : `₹${Math.round(n / 1000)}K`;

/* ─────────────────────────────── Journey ─────────────────────────────── */

/**
 * How long a phase took, the way the Ops Matrix measures it
 * (components/ops/journey/ProjectJourneyPage.tsx, `phaseSpan`): only steps with
 * a real timestamp count, and two are needed to measure a span at all.
 */
export function phaseSpan(steps: StepWithStatus[]): string | null {
  const stamps = steps
    .filter(s => s.status === 'done' && s.completedAt)
    .map(s => s.completedAt!.getTime())
    .sort((a, b) => a - b);
  if (stamps.length < 2) return null;
  const days = Math.round((stamps[stamps.length - 1] - stamps[0]) / DAY);
  return days <= 0 ? 'same day' : `${days} days`;
}

export interface PhaseCell {
  index: number;
  name: string;
  done: number;
  total: number;
  state: 'done' | 'now' | 'todo';
  note: string;
}

export function journeyStrip(
  stepsByPhase: Record<number, StepWithStatus[]>,
  phaseProgress: { done: number; total: number; pct: number }[],
  activeIndex: number,
): PhaseCell[] {
  return PHASES.map((p, i) => {
    const prog = phaseProgress[i] || { done: 0, total: (stepsByPhase[i] || []).length, pct: 0 };
    const complete = prog.total > 0 && prog.done >= prog.total;
    const state: PhaseCell['state'] = complete ? 'done' : i === activeIndex ? 'now' : 'todo';
    const span = complete ? phaseSpan(stepsByPhase[i] || []) : null;
    const note = state === 'done'
      ? `${prog.done}/${prog.total}${span ? ` · ${span}` : ''}`
      : state === 'now' ? `${prog.done}/${prog.total} · now` : `${prog.done}/${prog.total}`;
    return {
      index: i,
      // The Ops Matrix's own names, sentence-cased to match the rest of the page.
      name: p.name.replace('Pre-Execution', 'Pre-execution'),
      done: prog.done,
      total: prog.total,
      state,
      note,
    };
  });
}

/* ─────────────────────────────── Drawings ────────────────────────────── */

export type DrawingState = 'approved' | 'client' | 'revise' | 'none';

export interface DrawingCell {
  id: string;
  name: string;
  type: string;
  room: string | null;
  state: DrawingState;
  round: number;
  daysWithClient: number | null;
}

export interface DrawingModel {
  total: number;
  issued: number;
  approved: number;
  withClient: number;
  inRevision: number;
  notIssued: number;
  /** Column headings: the drawing types that recur across rooms. */
  types: string[];
  rooms: { room: string; cells: Record<string, DrawingCell | undefined> }[];
  /** Drawings that belong to no single room, or to a type too rare to be a column. */
  wide: DrawingCell[];
}

const STATE_OF: Record<string, DrawingState> = {
  approved: 'approved',
  with_client: 'client',
  with_studio: 'revise',
  not_started: 'none',
};

/** "Carpentry Detail - Room Bedroom 2" → "Carpentry detail". */
function typeOf(name: string, room: string | undefined): string | null {
  const parts = String(name || '').split(' - ');
  if (parts.length < 2 || !room) return null;
  if (!parts.slice(1).join(' - ').toLowerCase().includes(room.toLowerCase())) return null;
  const t = parts[0].trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function drawingModel(items: DrawingTrackerItem[], roomOrder: string[] = []): DrawingModel {
  const cells: DrawingCell[] = (items || []).map(d => {
    const t = turnaroundOf(d);
    const room = d.roomName && !/general|project[- ]wide/i.test(d.roomName) ? d.roomName : null;
    return {
      id: d.id,
      name: d.name,
      type: typeOf(d.name, room || undefined) || '',
      room,
      state: STATE_OF[t.state] || 'none',
      round: t.currentRound || 0,
      daysWithClient: t.daysWithClient,
    };
  });

  const count = (s: DrawingState) => cells.filter(c => c.state === s).length;
  const typeFreq = new Map<string, number>();
  cells.filter(c => c.room && c.type).forEach(c => typeFreq.set(c.type, (typeFreq.get(c.type) || 0) + 1));
  // A type only earns a column if it recurs; at most three columns stay readable.
  const types = [...typeFreq.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

  const byRoom = new Map<string, Record<string, DrawingCell | undefined>>();
  const wide: DrawingCell[] = [];
  cells.forEach(c => {
    if (c.room && types.includes(c.type)) {
      const r = byRoom.get(c.room) || {};
      if (!r[c.type]) { r[c.type] = c; byRoom.set(c.room, r); return; }
    }
    wide.push(c);
  });

  const rank = (r: string) => { const i = roomOrder.indexOf(r); return i < 0 ? 999 : i; };
  const rooms = [...byRoom.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([room, c]) => ({ room, cells: c }));

  const notIssued = count('none');
  return {
    total: cells.length,
    issued: cells.length - notIssued,
    approved: count('approved'),
    withClient: count('client'),
    inRevision: count('revise'),
    notIssued,
    types,
    rooms,
    wide,
  };
}

/* ─────────────────────────────── Payments ────────────────────────────── */

export interface PaymentRung {
  id: string;
  name: string;
  type: 'design' | 'execution';
  amount: number;
  state: 'paid' | 'due' | 'up';
  trigger: string;
  invoiced: boolean;
}

export interface PaymentModel {
  gross: number;
  collected: number;
  dueNow: number;
  later: number;
  rungs: PaymentRung[];
  due: PaymentRung[];
  laterCount: number;
}

/**
 * Which payments are due now.
 *
 * The studio's terms put each payment BEFORE the work it releases. So once the
 * design phase has started, every design payment is due; once contracting has
 * started, the first execution payment (the mobilisation advance) is due. An
 * invoice that has been raised and not paid is always due. Everything else is
 * later. Planned milestone dates are deliberately not used: they are plans,
 * not facts, and clients dispute dates that were never agreed.
 */
export function paymentModel(
  result: PaymentResult | null,
  milestones: PaymentMilestone[],
  phaseProgress: { done: number; total: number; pct: number }[],
): PaymentModel {
  const empty = { gross: 0, collected: 0, dueNow: 0, later: 0, rungs: [], due: [], laterCount: 0 };
  if (!result || !result.amounts?.length) return empty;
  const byId = new Map((milestones || []).map(m => [m.id, m]));
  const designStarted = (phaseProgress[1]?.done || 0) > 0;
  const contractingStarted = (phaseProgress[2]?.done || 0) > 0;
  let firstExecSeen = false;

  const rungs: PaymentRung[] = result.amounts.map(a => {
    const m: any = byId.get(a.id) || {};
    const paid = a.status === 'paid';
    const invoiced = a.status === 'invoiced' || (!!m.invoiceDate && !paid);
    let state: PaymentRung['state'] = 'up';
    if (paid) state = 'paid';
    else if (invoiced) state = 'due';
    else if (a.type === 'design' && designStarted) state = 'due';
    else if (a.type === 'execution' && contractingStarted && !firstExecSeen) state = 'due';
    if (a.type === 'execution' && !paid) firstExecSeen = true;
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      amount: a.invoiceTotal,
      state,
      trigger: String(m.trigger || m.description || ''),
      invoiced,
    };
  });

  const sum = (s: PaymentRung['state']) => rungs.filter(r => r.state === s).reduce((t, r) => t + r.amount, 0);
  const due = rungs.filter(r => r.state === 'due');
  return {
    gross: result.totals.grossProjectValue,
    collected: result.totals.totalPaid,
    dueNow: sum('due'),
    later: sum('up'),
    rungs,
    due,
    laterCount: rungs.filter(r => r.state === 'up').length,
  };
}

/* ─────────────────────────────── Programme ───────────────────────────── */

export interface GanttRow {
  id: string;
  title: string;
  kind: 'design' | 'execution' | 'milestone' | string;
  start: string;
  end: string;
  status: string;
}

export interface GatePin {
  at: string;
  label: string;
  name: string;
  trigger: string;
}

/**
 * Pin each due payment to the task it releases, by matching the words in its
 * trigger against the task names. No match, no pin — a pin in the wrong place
 * would say something the terms do not.
 */
const GATE_WORDS: [RegExp, RegExp][] = [
  [/gfc|good.for.construction|working drawing/i, /good.for.construction|gfc|working drawing/i],
  [/mobilis|site set|demolition|civil/i, /site set|mobilis|prelim|demolition/i],
  [/layout|3d|design development|concept/i, /concept|layout|3d|elevation/i],
  [/carcass|carpentry|first.fix|ceiling|electr/i, /carcass|ceiling|electrical|first.fix/i],
  [/laminate|shutter|finish|paint/i, /laminate|shutter|paint|finish/i],
];

export function gatePins(due: PaymentRung[], rows: GanttRow[]): GatePin[] {
  const pins: GatePin[] = [];
  due.forEach(r => {
    const rule = GATE_WORDS.find(([t]) => t.test(r.trigger) || t.test(r.name));
    if (!rule) return;
    const task = rows.find(t => t.kind !== 'milestone' && t.status !== 'completed' && rule[1].test(t.title))
      || rows.find(t => t.kind !== 'milestone' && rule[1].test(t.title));
    if (!task) return;
    // "Before release of GFC drawings" lands at the end of that task; everything
    // else lands where the work it releases begins.
    const at = /release|before release/i.test(r.trigger) && /gfc|good.for/i.test(r.trigger) ? task.end : task.start;
    pins.push({ at, label: inrShort(r.amount), name: r.name, trigger: r.trigger });
  });
  return pins;
}

/* ───────────────────────────────── Cost ──────────────────────────────── */

export const COST_COLOURS = ['#334486', '#7091E6', '#B5945B', '#ADBBDA', '#D9CBAE'];

export interface CostModel {
  total: number;
  lines: number;
  cats: { name: string; amount: number; colour: string }[];
  rooms: { name: string; amount: number }[];
}

/** Planned cost is materials + labour per line — the figure lib/projectPnl calls `plannedCost`. */
export function costModel(boq: FullBoqItem[], rooms: { id: string; name: string }[] = []): CostModel {
  const roomName = new Map(rooms.map(r => [r.id, r.name]));
  const cats = new Map<string, number>();
  const byRoom = new Map<string, number>();
  let total = 0;
  (boq || []).forEach((it: any) => {
    const cost = ((Number(it.materials) || 0) + (Number(it.labor) || 0)) * (Number(it.qty) || 0);
    if (!cost) return;
    total += cost;
    const c = String(it.cat || it.category || 'Other');
    cats.set(c, (cats.get(c) || 0) + cost);
    // BOQ lines usually carry the room's name in `roomId` (rooms have no ids of their own), so fall back to it.
    const r = roomName.get(it.roomId) || it.roomName || it.room || (typeof it.roomId === 'string' && it.roomId.trim()) || 'Unassigned';
    byRoom.set(r, (byRoom.get(r) || 0) + cost);
  });
  const sorted = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push(['Other', rest]);
  return {
    total,
    lines: (boq || []).length,
    cats: top.map(([name, amount], i) => ({ name, amount, colour: COST_COLOURS[i % COST_COLOURS.length] })),
    rooms: [...byRoom.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
  };
}

/* ─────────────────────────────── Activity ────────────────────────────── */

export type ActivityKind = 'meet' | 'site' | 'pay' | 'dec' | 'step';

export interface ActivityItem {
  ms: number;
  kind: ActivityKind;
  title: string;
  meta: string;
  /** Meetings and site visits only. */
  minutes?: number;
  online?: boolean;
}

export function activityItems(args: {
  visits: any[];
  milestones: PaymentMilestone[];
  paidAmounts: Map<string, number>;
  decisions: ProjectDecisionRecord[];
  steps: StepWithStatus[];
}): ActivityItem[] {
  const out: ActivityItem[] = [];
  (args.visits || []).forEach(v => {
    if (v.status === 'cancelled') return;
    const ms = anyMs(v.date);
    if (!ms) return;
    const site = v.type === 'site_visit';
    const bits = [v.durationMinutes ? `${v.durationMinutes} min` : '', v.isVirtual ? 'Online' : (v.location || ''),
      (v.attendees || []).length ? `${v.attendees.length} attendees` : ''].filter(Boolean);
    out.push({ ms, kind: site ? 'site' : 'meet', title: v.title || (site ? 'Site visit' : 'Meeting'), meta: bits.join(' · '),
      minutes: Number(v.durationMinutes) || 0, online: !!v.isVirtual });
  });
  (args.milestones || []).forEach((m: any) => {
    if (m.status !== 'paid') return;
    const ms = anyMs(m.invoiceDate) || anyMs(m.date);
    if (!ms) return;
    const amt = args.paidAmounts.get(m.id);
    out.push({ ms, kind: 'pay', title: `${m.name} received`, meta: amt ? inr(amt) : 'Payment' });
  });
  const decByDay = new Map<string, number>();
  (args.decisions || []).forEach(d => { const ms = anyMs(d.date); if (ms) decByDay.set(isoOf(ms), (decByDay.get(isoOf(ms)) || 0) + 1); });
  decByDay.forEach((n, iso) => out.push({ ms: dayNum(iso) * DAY, kind: 'dec', title: `${n} decision${n > 1 ? 's' : ''} raised`, meta: 'Decisions' }));
  const stepByDay = new Map<string, number>();
  (args.steps || []).forEach(s => { if (s.status === 'done' && s.completedAt) { const iso = isoOf(s.completedAt.getTime()); stepByDay.set(iso, (stepByDay.get(iso) || 0) + 1); } });
  stepByDay.forEach((n, iso) => out.push({ ms: dayNum(iso) * DAY, kind: 'step', title: `${n} Ops Matrix step${n > 1 ? 's' : ''} cleared`, meta: 'Ops Matrix' }));
  return out.sort((a, b) => b.ms - a.ms);
}

/** Monday of the week `weeksBack` weeks before this one. */
export function calendarStart(weeks = 8, now = Date.now()): number {
  const today = dayNum(isoOf(now));
  const dow = (new Date(today * DAY).getUTCDay() + 6) % 7; // Monday = 0
  return today - dow - (weeks - 1) * 7;
}

export interface TimelineToken {
  key: string;
  kind: ActivityKind;
  /** Position along the line, 0–100. */
  x: number;
  iso: string;
  title: string;
  detail: string;
  minutes: number;
  online: boolean;
  /** 0 = just above the line; higher lanes lift tokens that would collide. Payments hang below. */
  lane: number;
  below: boolean;
}

export interface TimelineModel {
  weeks: { x: number; label: string }[];
  tokens: TimelineToken[];
  todayX: number;
  lanes: number;
  /** The stretch since the last meeting or site visit, when it has run two weeks or more. */
  quiet: { fromX: number; days: number } | null;
}

/**
 * The Activity timeline: eight weeks ending this week, one token per event —
 * same-day events of one kind merge — lifted into lanes so neighbours never
 * overlap. Pure; the panel only draws it.
 */
export function timelineModel(items: ActivityItem[], now = Date.now(), weeks = 8): TimelineModel {
  const start = calendarStart(weeks, now);
  const span = weeks * 7;
  const today = dayNum(isoOf(now));
  const X = (d: number) => ((d - start + 0.5) / span) * 100;

  const groups = new Map<string, ActivityItem[]>();
  items.forEach(it => {
    const d = dayNum(isoOf(it.ms));
    if (d < start || d > today) return;
    const k = `${d}|${it.kind}`;
    groups.set(k, [...(groups.get(k) || []), it]);
  });
  const merged = [...groups.entries()].map(([k, list]) => {
    const [d, kind] = k.split('|');
    const first = list[0];
    const many = list.length > 1;
    return {
      d: Number(d), kind: kind as ActivityKind,
      title: many && (kind === 'meet' || kind === 'site') ? `${list.length} ${kind === 'site' ? 'site visits' : 'meetings'}` : first.title,
      detail: many && (kind === 'meet' || kind === 'site') ? list.map(l => l.title).join(', ') : first.meta,
      minutes: list.reduce((s, l) => s + (l.minutes || 0), 0),
      online: list.every(l => l.online),
    };
  }).sort((a, b) => a.d - b.d || a.kind.localeCompare(b.kind));

  // A token needs about four days of room at the usual card width.
  const GAP = 4.5;
  const laneEnds: number[] = [];
  let lanes = 1;
  const tokens: TimelineToken[] = merged.map((m, i) => {
    const below = m.kind === 'pay';
    let lane = 0;
    if (!below) {
      while (laneEnds[lane] !== undefined && m.d - laneEnds[lane] < GAP) lane++;
      lane = Math.min(lane, 2); // three lanes at most; a fourth same-week event overlaps rather than leave the card
      laneEnds[lane] = m.d;
      lanes = Math.max(lanes, lane + 1);
    }
    return { key: `${m.d}-${m.kind}-${i}`, kind: m.kind, x: X(m.d), iso: isoOf(m.d * DAY), title: m.title, detail: m.detail,
      minutes: m.minutes, online: m.online, lane, below };
  });

  const lastContact = items.filter(i => i.kind === 'meet' || i.kind === 'site').map(i => dayNum(isoOf(i.ms))).filter(d => d <= today)
    .sort((a, b) => b - a)[0];
  const quietDays = lastContact !== undefined ? today - lastContact : 0;
  const quiet = lastContact !== undefined && quietDays >= 14
    ? { fromX: Math.max(0, X(lastContact)), days: quietDays } : null;

  return {
    weeks: Array.from({ length: weeks }, (_, k) => ({ x: (k / weeks) * 100, label: shortDate((start + k * 7) * DAY) })),
    tokens, todayX: X(today), lanes: Math.min(lanes, 3), quiet,
  };
}

/* ─────────────────────────────── Meetings ────────────────────────────── */

export interface FollowUps {
  items: { text: string; due: number | null; meeting: string; meetingMs: number }[];
  total: number;
}

/** The studio's own open action items, from minutes that have left draft. */
export function studioFollowUps(moms: MOM[]): FollowUps {
  const items: FollowUps['items'] = [];
  (moms || [])
    .filter(m => m.status !== 'draft')
    .sort((a, b) => (anyMs(b.meetingDate) || 0) - (anyMs(a.meetingDate) || 0))
    .forEach(m => (m.actionItems || []).forEach(a => {
      if (a.status !== 'open' || (a.owner && a.owner !== 'ffds')) return;
      items.push({ text: a.text, due: a.dueDate || null, meeting: m.meetingTitle || 'Meeting', meetingMs: anyMs(m.meetingDate) });
    }));
  return { items, total: items.length };
}

/* ─────────────────────────────── Portal ──────────────────────────────── */

export interface PortalModel {
  sentAt: number | null;
  sees: { section: string; count: number }[];
  behind: boolean;
  programmeMissing: boolean;
  linkExpires: number | null;
  linkExpired: boolean;
}

/**
 * The client's copy against the project.
 *
 * Compared section by section, like PortalPublishControls does — but only on
 * sections this page can rebuild faithfully from the project alone. Scope
 * lines, the programme and the money are assembled in App from the tier and
 * the item bank, so rebuilding them here would report a difference that is
 * only this page's missing inputs.
 */
export function portalModel(
  sent: { section: string; count: number }[] | null,
  sentAt: string | null,
  current: { section: string; count: number }[],
  portalAccess: any,
  hasProgramme: boolean,
): PortalModel {
  const skip = new Set(['Scope lines', 'Programme tasks']);
  const sentMap = new Map((sent || []).map(r => [r.section, r.count]));
  const nowMap = new Map(current.map(r => [r.section, r.count]));
  let behind = false;
  new Set([...sentMap.keys(), ...nowMap.keys()]).forEach(k => {
    if (!skip.has(k) && (sentMap.get(k) || 0) !== (nowMap.get(k) || 0)) behind = true;
  });
  const exp = portalAccess?.expiresAt ? anyMs(portalAccess.expiresAt) : null;
  return {
    sentAt: sentAt ? anyMs(sentAt) : null,
    sees: (sent || []).filter(r => r.count > 0),
    behind: !!sent && behind,
    programmeMissing: !!sent && hasProgramme && !(sentMap.get('Programme tasks') || 0),
    linkExpires: exp,
    linkExpired: !!exp && exp < Date.now(),
  };
}

export { msOf };
