/*
  WHAT IF: the founders' board for "if we sign these, how does cash look?"

  From the mockup approved on 2 Nov 2026: cards for the proposals in the
  pipeline and for new projects of each size, placed on the months they might
  sign; one answer (how long cash lasts), three goals to light up, a calendar
  and a timeline of the next twelve months, a reality check and the next best
  move. A planning board, not a report: nothing here changes a project.

  How cash moves, month by month:
    - Signed work brings in what its payment milestones still owe, scaled to
      the contract before GST: an invoiced or overdue one this month, a dated
      one in its month, an undated one spread over the rest of the run. Work
      with no milestones pays like a new project would.
    - Signed work's vendor costs (contract less margin) go out evenly over
      what is left of its run.
    - A placed project pays 30% when it signs, 60% across its run and 10% at
      handover; its vendor costs go out evenly across the run.
    - Studio and household costs go out every month; this month only for the
      days left in it.
    - "Clients pay a month late" moves every payment still to come a month on.

  Pure, and shared by the screen and the tests.
*/
import { BANDS, fyOf, landedIn, signedWork, type Band, type Play, type Quarter } from './founderGoals';
import type { ProjectFact } from './ownerReports';
import { inr } from './ownerReports';

const DAY = 86400000;
export const HORIZON = 12;
/** How a new project pays: % at signing, % across the run, % at handover. */
export const TERMS = { adv: 30, mid: 60, end: 10 };
/** Signings a month the studio can usually manage; more is a stretch. */
export const USUAL_PACE = 2;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthKeyOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export interface Month { key: string; start: number; end: number; label: string; short: string; long: string }
/** This month and the eleven after it. This month starts now: what is behind us is not planned. */
export function monthsFrom(now: number): Month[] {
  const d = new Date(now);
  return Array.from({ length: HORIZON }, (_, k) => {
    const start = new Date(d.getFullYear(), d.getMonth() + k, 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + k + 1, 1).getTime();
    const m = new Date(start);
    return { key: monthKeyOf(start), start: k === 0 ? now : start, end, label: MON[m.getMonth()], short: `${MON[m.getMonth()]} ${String(m.getFullYear() % 100).padStart(2, '0')}`, long: `${MONTH_LONG[m.getMonth()]} ${m.getFullYear()}` };
  });
}
const indexAt = (months: Month[], t: number) => {
  if (t < months[0].start) return 0;
  const k = months.findIndex((m) => t >= m.start && t < m.end);
  return k < 0 ? HORIZON : k;
};

/* ── The cards ──────────────────────────────────────────────────────────── */

export interface Card {
  kind: 'pipe' | 'new';
  ref: string;
  name: string;
  value: number;
  margin: number;
  /** Months the work runs. */
  months: number;
  /** Chance it signs, 0 to 1; new projects have none. */
  odds: number | null;
  stage: string;
  /** When a proposal usually signs. */
  signsBy: number | null;
  label: string;
}
export interface PipelineDeal { id: string; name: string; value: number; margin: number; odds: number; stage: string; signsBy: number }

export const SIZE_NAMES = ['Small job', 'Apartment', 'Large home', 'Villa', 'Big villa'];

/** The proposals in the pipeline, and one card for each size band. */
export function cardsOf(pipeline: PipelineDeal[], bands: Band[]): { pipe: Card[]; sizes: Card[] } {
  const runOf = (value: number) => {
    const k = Math.max(0, BANDS.findIndex((b) => value < b.max));
    return Math.max(1, Math.round(bands[k]?.months || 3));
  };
  return {
    pipe: pipeline.map((p) => ({
      kind: 'pipe' as const, ref: p.id, name: p.name, value: p.value, margin: p.margin, months: runOf(p.value),
      odds: p.odds, stage: p.stage, signsBy: p.signsBy, label: `${p.name} · ${Math.round(p.odds * 100)}%`,
    })),
    sizes: bands.map((b, k) => ({
      kind: 'new' as const, ref: String(k), name: SIZE_NAMES[k], value: b.value, margin: b.value * b.margin / 100, months: Math.max(1, Math.round(b.months)),
      odds: null, stage: BANDS[k].label, signsBy: null, label: `${inr(b.value)} ${SIZE_NAMES[k].toLowerCase()}`,
    })),
  };
}
export const cardOf = (cards: { pipe: Card[]; sizes: Card[] }, p: Play) =>
  (p.kind === 'pipe' ? cards.pipe : cards.sizes).find((c) => c.ref === p.ref) || null;

/* ── Running the months ─────────────────────────────────────────────────── */

export interface WhatIfInput {
  now: number;
  cash: number;
  /** Studio and household costs a month. */
  monthly: number;
  buffer: number;
  /** What a quarter has to earn, at the founders' level. */
  goal: number;
  /** Counted projects only. */
  facts: ProjectFact[];
  bands: Band[];
  pipeline: PipelineDeal[];
  /** Lead to signed, 0 to 1. */
  conv: number;
  leadsPerMonth: number;
  cycleDays: number;
  /** Live projects the team can carry. */
  capacity: number;
}

export interface MonthRow extends Month {
  inSigned: number;
  inNew: number;
  cost: number;
  fixed: number;
  net: number;
  cash: number;
  live: number;
  signings: number;
  handovers: string[];
}
export interface Bar { name: string; from: number; to: number; kind: 'signed' | 'pipe' | 'new'; value: number; odds: number | null; handover: boolean }

const SIGNED = ['won', 'execution', 'work_paused', 'completed'];

/** The quarter after this one, and the month it ends in. */
export function nextQuarterOf(now: number): Quarter {
  const fy = fyOf(now);
  const cur = fy.quarters[fy.current];
  return cur.index < 3 ? fy.quarters[cur.index + 1] : fyOf(cur.end).quarters[0];
}

export function simulate(i: WhatIfInput, plays: Play[], late = false) {
  const months = monthsFrom(i.now);
  const rows: MonthRow[] = months.map((m) => ({ ...m, inSigned: 0, inNew: 0, cost: 0, fixed: 0, net: 0, cash: 0, live: 0, signings: 0, handovers: [] }));
  const shift = late ? 1 : 0;
  const pay = (k: number, key: 'inSigned' | 'inNew', v: number) => { const j = Math.max(0, k) + shift; if (j < HORIZON && v) rows[j][key] += v; };
  /* Spread an amount over a span of time by how much of it falls in each month. */
  const spread = (from: number, to: number, total: number, put: (k: number, v: number) => void) => {
    if (to <= from || !total) return;
    rows.forEach((r, k) => { const o = Math.min(to, r.end) - Math.max(from, r.start); if (o > 0) put(k, total * o / (to - from)); });
  };

  /* Signed work. */
  const work = signedWork(i.facts.filter((f) => SIGNED.includes(f.status)), i.bands);
  const factOf = new Map(i.facts.map((f) => [f.id, f]));
  const bars: Bar[] = [];
  for (const w of work) {
    const from = Math.max(i.now, w.start);
    const left = w.end > from ? (w.end - from) / (w.end - w.start) : 0;
    spread(from, w.end, (w.value - w.margin) * left, (k, v) => { rows[k].cost += v; });
    const ms = factOf.get(w.id)?.milestones || [];
    const total = ms.reduce((s, m) => s + m.amount, 0);
    if (total > 0) {
      const scale = w.value / total;
      const undated: number[] = [];
      for (const m of ms) {
        if (m.status === 'paid') continue;
        const v = m.amount * scale;
        if (m.status === 'invoiced' || (m.dueAt != null && m.dueAt < months[0].end)) pay(0, 'inSigned', v);
        else if (m.dueAt != null) { const k = indexAt(months, m.dueAt); if (k < HORIZON) pay(k, 'inSigned', v); }
        else undated.push(v);
      }
      const owed = undated.reduce((s, v) => s + v, 0);
      if (owed) {
        if (w.end <= months[0].end) pay(0, 'inSigned', owed);
        else spread(months[0].start, w.end, owed, (k, v) => pay(k, 'inSigned', v));
      }
    } else {
      /* No milestones: what is left of the run pays as a new project would. */
      spread(from, w.end, w.value * TERMS.mid / 100 * left, (k, v) => pay(k, 'inSigned', v));
      if (w.end >= i.now) pay(indexAt(months, w.end), 'inSigned', w.value * TERMS.end / 100);
    }
    rows.forEach((r) => { if (w.start < r.end && w.end > r.start) r.live++; });
    const endK = indexAt(months, w.end);
    if (w.end >= i.now && endK < HORIZON) rows[endK].handovers.push(w.name);
    if (w.end > i.now) bars.push({ name: w.name, from: indexAt(months, Math.max(i.now, w.start)), to: Math.min(HORIZON - 1, endK), kind: 'signed', value: w.value, odds: null, handover: endK < HORIZON });
  }

  /* Placed projects. */
  const cards = cardsOf(i.pipeline, i.bands);
  const land = new Array(HORIZON).fill(0);
  for (const p of plays) {
    const c = cardOf(cards, p);
    const s = months.findIndex((m) => m.key === p.month);
    if (!c || s < 0) continue;
    const r = c.months;
    pay(s, 'inNew', c.value * TERMS.adv / 100);
    for (let j = 0; j < r; j++) {
      pay(s + j, 'inNew', c.value * TERMS.mid / 100 / r);
      if (s + j < HORIZON) { rows[s + j].cost += (c.value - c.margin) / r; rows[s + j].live++; land[s + j] += c.margin / r; }
    }
    pay(s + r, 'inNew', c.value * TERMS.end / 100);
    rows[s].signings++;
    bars.push({ name: c.kind === 'pipe' ? c.name : `New ${c.name.toLowerCase()} · ${inr(c.value)}`, from: s, to: Math.min(HORIZON - 1, s + r - 1), kind: c.kind, value: c.value, odds: c.odds, handover: s + r - 1 < HORIZON });
  }

  /* Cash, month by month. */
  let cash = i.cash;
  for (const r of rows) {
    const first = new Date(new Date(r.start).getFullYear(), new Date(r.start).getMonth(), 1).getTime();
    r.fixed = i.monthly * (r.end - r.start) / (r.end - first);
    r.net = r.inSigned + r.inNew - r.cost - r.fixed;
    cash += r.net;
    r.cash = cash;
  }

  const nq = nextQuarterOf(i.now);
  const nqEnd = indexAt(months, nq.end - DAY);
  const out = rows.findIndex((r) => r.cash < 0);
  const back = rows.findIndex((r) => r.cash >= i.buffer);
  const nqMargin = landedIn(work, nq.start, nq.end) + rows.reduce((s, r, k) => (r.start >= nq.start && r.start < nq.end ? s + land[k] : s), 0);
  const lasts = out < 0;
  const bufferOk = back >= 0 && back <= nqEnd;
  const goalOk = nqMargin >= i.goal && i.goal > 0;
  /* After a dip: the month cash is back above zero, and if it falls again. */
  let up = -1, again = -1;
  if (out >= 0) for (let k = out + 1; k < HORIZON; k++) { if (up < 0 && rows[k].cash >= 0) up = k; else if (up >= 0 && again < 0 && rows[k].cash < 0) again = k; }
  return {
    months: rows, bars, work, cards,
    out: out < 0 ? null : out, up: up < 0 ? null : up, again: again < 0 ? null : again,
    back: back < 0 ? null : back,
    nextQuarter: nq, nqEnd, nqMargin, cashAtNqEnd: rows[Math.min(nqEnd, HORIZON - 1)].cash,
    lasts, bufferOk, goalOk,
    wins: (lasts ? 1 : 0) + (bufferOk ? 1 : 0) + (goalOk ? 1 : 0),
    reach: out < 0 ? HORIZON : out,
  };
}
export type Simulation = ReturnType<typeof simulate>;

/* ── Advice ─────────────────────────────────────────────────────────────── */

/** The first month a lead that comes in today could sign. */
export const firstNewMonth = (i: WhatIfInput) => Math.min(HORIZON - 1, indexAt(monthsFrom(i.now), i.now + i.cycleDays * DAY));

const busy = (plays: Play[], key: string) => plays.filter((p) => p.month === key).length >= USUAL_PACE;

export interface Move { play: Play; sim: Simulation; win: number; reach: number; cash: number }

/** Real proposals first, then the smallest new project that moves the plan; never past the usual pace, never a new project before a lead could sign. */
export function bestMove(i: WhatIfInput, plays: Play[], late = false): Move | null {
  const now = simulate(i, plays, late);
  if (now.wins === 3) return null;
  const months = monthsFrom(i.now);
  const used = new Set(plays.filter((p) => p.kind === 'pipe').map((p) => p.ref));
  const tries: { play: Play; rank: number }[] = [];
  for (const c of now.cards.pipe) {
    if (used.has(c.ref)) continue;
    const k = indexAt(months, c.signsBy || i.now);
    for (const m of [k, k + 1]) if (m < HORIZON && !busy(plays, months[m].key)) tries.push({ play: { kind: 'pipe', ref: c.ref, month: months[m].key }, rank: 0 });
  }
  const first = firstNewMonth(i);
  for (let t = 0; t < Math.min(4, now.cards.sizes.length); t++) {
    for (let m = first; m < Math.min(HORIZON, first + 5); m++) if (!busy(plays, months[m].key)) tries.push({ play: { kind: 'new', ref: String(t), month: months[m].key }, rank: 1 + t });
  }
  const moves = tries.map((x) => {
    const sim = simulate(i, [...plays, x.play], late);
    return { ...x, sim, win: sim.wins - now.wins, reach: sim.reach - now.reach, cash: sim.cashAtNqEnd - now.cashAtNqEnd, month: months.findIndex((m) => m.key === x.play.month) };
  });
  const pick = (list: typeof moves, by: (a: typeof moves[0], b: typeof moves[0]) => number) => [...list].sort(by)[0] || null;
  const best = pick(moves.filter((x) => x.win > 0), (a, b) => a.rank - b.rank || a.month - b.month)
    || pick(moves.filter((x) => x.reach > 0), (a, b) => a.rank - b.rank || b.reach - a.reach || a.month - b.month)
    || pick(moves.filter((x) => x.cash > 0), (a, b) => a.rank - b.rank || b.cash - a.cash);
  return best ? { play: best.play, sim: best.sim, win: best.win, reach: best.reach, cash: best.cash } : null;
}

/** The easiest way: every proposal in the month it usually signs, then new projects of the size that needs the fewest signings, one or two a month, until every goal lights up. */
export function easiest(i: WhatIfInput, late = false): Play[] {
  const months = monthsFrom(i.now);
  const sim0 = simulate(i, [], late);
  const base: Play[] = [];
  for (const c of sim0.cards.pipe) {
    let k = indexAt(months, c.signsBy || i.now);
    while (k < HORIZON && busy(base, months[k].key)) k++;
    if (k < HORIZON) base.push({ kind: 'pipe', ref: c.ref, month: months[k].key });
  }
  const fill = (size: number) => {
    const plays = [...base];
    let m = firstNewMonth(i);
    for (let g = 0; g < 12 && simulate(i, plays, late).wins < 3; g++) {
      while (m < HORIZON - 1 && busy(plays, months[m].key)) m++;
      plays.push({ kind: 'new', ref: String(size), month: months[m].key });
    }
    const s = simulate(i, plays, late);
    return { plays, wins: s.wins, reach: s.reach };
  };
  if (simulate(i, base, late).wins === 3) return base;
  /* Fewest signings to light every goal, the smaller size on a tie (a ₹50L villa is never the easy way); else whichever gets furthest. */
  const tries = [0, 1, 2, 3].filter((k) => k < i.bands.length).map(fill);
  const wins = tries.filter((t) => t.wins === 3).sort((a, b) => a.plays.length - b.plays.length);
  return (wins[0] || [...tries].sort((a, b) => b.wins - a.wins || b.reach - a.reach)[0]).plays;
}

export interface Check { tone: 'ok' | 'warn'; title: string; line: string }

/** A few plain checks on whether the plan is believable. */
export function realityChecks(i: WhatIfInput, plays: Play[], sim: Simulation, late = false): Check[] {
  const months = monthsFrom(i.now);
  const at = (p: Play) => months.findIndex((m) => m.key === p.month);
  const news = plays.filter((p) => p.kind === 'new');
  const out: Check[] = [];
  if (!news.length) out.push({ tone: 'ok', title: 'No new leads needed', line: 'Everything on the board is already in your pipeline.' });
  else {
    const last = Math.max(...news.map(at));
    const need = i.conv > 0 ? Math.ceil(news.length / i.conv) : Infinity;
    const have = Math.round(i.leadsPerMonth * (last + 1));
    out.push(have >= need
      ? { tone: 'ok', title: 'Enough leads', line: `${news.length} new ${news.length === 1 ? 'project needs' : 'projects need'} about ${need} leads by ${months[last].label}; at ${Math.round(i.leadsPerMonth * 10) / 10} a month you get ${have}.` }
      : { tone: 'warn', title: 'Short of leads', line: `${news.length} new projects need about ${need === Infinity ? 'more' : need} leads by ${months[last].label}; at ${Math.round(i.leadsPerMonth * 10) / 10} a month you get ${have}. Push marketing, or move one later.` });
    const first = firstNewMonth(i);
    if (news.some((p) => at(p) < first)) out.push({ tone: 'warn', title: `${months[0].label}${first > 1 ? ` and ${months[first - 1].label}` : ''} are too soon for a new lead`, line: `A new lead takes about ${Math.round(i.cycleDays)} days to sign. Only proposals already out can sign before ${months[first].label}.` });
  }
  const peak = sim.months.reduce((a, b) => (b.live > a.live ? b : a), sim.months[0]);
  out.push(peak.live > i.capacity
    ? { tone: 'warn', title: `Team over in ${peak.label}`, line: `${peak.live} projects running; the team carries ${i.capacity}. Plan a hire before then.` }
    : { tone: 'ok', title: 'The team can carry it', line: `Busiest month is ${peak.label} with ${peak.live} projects; the team carries ${i.capacity}.` });
  const crowded = sim.months.reduce((a, b) => (b.signings > a.signings ? b : a), sim.months[0]);
  if (crowded.signings > USUAL_PACE) out.push({ tone: 'warn', title: `${crowded.signings} signings in ${crowded.label}`, line: `The studio usually signs ${USUAL_PACE} a month at most. Spread them out to be safe.` });
  const pipes = plays.filter((p) => p.kind === 'pipe').map((p) => ({ p, c: cardOf(sim.cards, p) })).filter((x) => x.c);
  if (pipes.length) {
    const weakest = pipes.sort((a, b) => (a.c!.odds ?? 1) - (b.c!.odds ?? 1))[0];
    const without = simulate(i, plays.filter((p) => p !== weakest.p), late);
    const holds = without.lasts || without.reach >= sim.reach;
    out.push({ tone: holds ? 'ok' : 'warn', title: `If ${weakest.c!.name} doesn't sign`, line: `It is a ${Math.round((weakest.c!.odds ?? 0) * 100)}% chance. Without it, cash ${without.lasts ? 'still lasts the year' : `runs short in ${months[without.out as number].long}`}.` });
  }
  return out;
}

