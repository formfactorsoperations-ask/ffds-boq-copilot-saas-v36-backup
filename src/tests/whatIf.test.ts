import { describe, it, expect } from 'vitest';
import {
  simulate, bestMove, easiest, realityChecks, monthsFrom, cardsOf, cardOf, nextQuarterOf, firstNewMonth, TERMS, USUAL_PACE,
  type WhatIfInput,
} from '../../lib/whatIf';
import { SHEET_BANDS, isCounted, setCounted, planOf, type Play } from '../../lib/founderGoals';
import type { ProjectFact, MilestoneFact } from '../../lib/ownerReports';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 11, 2);
const L = 100000;

const ms = (id: string, amount: number, status: MilestoneFact['status'], dueAt: number | null = null): MilestoneFact =>
  ({ id, name: id, type: 'execution', status, amount, invoicedAt: null, paidAt: null, dueAt });

const fact = (id: string, over: Partial<ProjectFact> = {}): ProjectFact => ({
  id, name: `Project ${id}`, client: '', status: 'execution', area: 1000,
  bookedAt: at(2026, 10, 1, 0), execution: 10 * L, design: 0, plannedCost: 7.5 * L, committed: 0,
  milestones: [], additions: [], targetHandoverAt: at(2026, 12, 31, 0), handedOverAt: null, snags: [], decisions: [],
  schedule: null, designers: [], supervisors: [], ...over,
});

const input = (over: Partial<WhatIfInput> = {}): WhatIfInput => ({
  now: NOW, cash: 12 * L, monthly: 3 * L, buffer: 18 * L, goal: 13.3 * L,
  facts: [], bands: SHEET_BANDS, pipeline: [], conv: 0.1155, leadsPerMonth: 9, cycleDays: 42, capacity: 8, ...over,
});
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const months = monthsFrom(NOW);
const key = (k: number) => months[k].key;

describe('the months', () => {
  it('starts today and runs twelve months', () => {
    expect(months).toHaveLength(12);
    expect(months[0].start).toBe(NOW);
    expect(months[0].key).toBe('2026-11');
    expect(months[2].short).toBe('Jan 27');
    expect(months[11].long).toBe('October 2027');
  });
  it('knows the quarter after this one, across the year end too', () => {
    expect(nextQuarterOf(NOW).label).toBe('Q4');
    expect(nextQuarterOf(at(2027, 2, 10)).label).toBe('Q1');
    expect(nextQuarterOf(at(2027, 2, 10)).start).toBe(new Date(2027, 3, 1).getTime());
  });
});

describe('signed work', () => {
  /* ₹11.8L of milestones with GST on a ₹10L contract: ₹3.54L paid, ₹4.72L invoiced, ₹3.54L still to bill. */
  const f = fact('a', { milestones: [ms('m1', 354000, 'paid'), ms('m2', 472000, 'invoiced'), ms('m3', 354000, 'pending')] });

  it('brings in what its milestones still owe, before GST, and never what is paid', () => {
    const s = simulate(input({ facts: [f] }), []);
    expect(sum(s.months.map((m) => m.inSigned))).toBeCloseTo(7 * L, -2);
    expect(s.months[0].inSigned).toBeGreaterThan(4 * L);
    expect(s.months[3].inSigned).toBe(0);
  });

  it('pays its remaining vendor costs over what is left of its run', () => {
    const s = simulate(input({ facts: [f] }), []);
    const left = (at(2026, 12, 31, 0) - NOW) / (at(2026, 12, 31, 0) - at(2026, 10, 1, 0));
    expect(sum(s.months.map((m) => m.cost))).toBeCloseTo(7.5 * L * left, -2);
    expect(s.months[2].cost).toBe(0);
  });

  it('puts a dated milestone in its month, and an overdue one in this month', () => {
    const g = fact('b', { milestones: [ms('x', 5 * L, 'pending', at(2027, 2, 10)), ms('y', 5 * L, 'pending', at(2026, 10, 15))] });
    const s = simulate(input({ facts: [g] }), []);
    expect(s.months[3].inSigned).toBeCloseTo(5 * L);
    expect(s.months[0].inSigned).toBeCloseTo(5 * L);
  });

  it('pays like a new project when it has no milestones', () => {
    const s = simulate(input({ facts: [fact('c')] }), []);
    const total = sum(s.months.map((m) => m.inSigned));
    expect(total).toBeGreaterThan(TERMS.end / 100 * 10 * L);
    expect(total).toBeLessThan(10 * L * (TERMS.mid + TERMS.end) / 100);
  });

  it('charges only the days left in this month for studio and home', () => {
    const s = simulate(input(), []);
    expect(s.months[0].fixed).toBeLessThan(3 * L);
    expect(s.months[0].fixed).toBeGreaterThan(2.7 * L);
    expect(s.months[1].fixed).toBeCloseTo(3 * L);
  });
});

describe('placed projects', () => {
  const play: Play = { kind: 'new', ref: '2', month: key(1) };

  it('pays 30% when it signs, the rest across its run and at handover', () => {
    const s = simulate(input(), [play]);
    /* ₹15L over 3 months: ₹4.5L advance and ₹3L in December, ₹3L in January and February, ₹1.5L in March. */
    expect(s.months[1].inNew).toBeCloseTo(7.5 * L);
    expect(s.months[2].inNew).toBeCloseTo(3 * L);
    expect(s.months[4].inNew).toBeCloseTo(1.5 * L);
    expect(s.months[1].cost).toBeCloseTo(3.75 * L);
    expect(s.months[1].signings).toBe(1);
    expect(s.months[2].live).toBe(1);
  });

  it('counts its margin towards the next quarter while it runs in it', () => {
    const base = simulate(input(), []);
    const s = simulate(input(), [play]);
    /* Runs December to February: January and February land in Q4, ₹1.25L each. */
    expect(s.nqMargin - base.nqMargin).toBeCloseTo(2.5 * L);
  });

  it('ignores a card that is no longer there', () => {
    const s = simulate(input(), [{ kind: 'pipe', ref: 'gone', month: key(1) }]);
    expect(sum(s.months.map((m) => m.inNew))).toBe(0);
  });
});

describe('the answer and the goals', () => {
  it('says when cash runs short, and when it is back', () => {
    const s = simulate(input({ cash: 2 * L }), []);
    expect(s.out).toBe(0);
    expect(s.lasts).toBe(false);
    /* A long job whose one payment lands in January: short now, back in January. */
    const dip = simulate(input({ cash: 2 * L, facts: [fact('d', { targetHandoverAt: at(2027, 10, 31, 0), milestones: [ms('x', 10 * L, 'pending', at(2027, 1, 10))] })] }), []);
    expect(dip.out).toBe(0);
    expect(dip.up).toBe(2);
  });

  it('lights the goals: cash lasts, buffer back by the end of next quarter, next quarter goal met', () => {
    const rich = simulate(input({ cash: 60 * L, goal: 1 }), [{ kind: 'new', ref: '2', month: key(1) }]);
    expect(rich.lasts).toBe(true);
    expect(rich.bufferOk).toBe(true);
    expect(rich.goalOk).toBe(true);
    expect(rich.wins).toBe(3);
  });

  it('slips every payment still to come a month when clients pay late', () => {
    const f = fact('a', { milestones: [ms('m1', 5 * L, 'paid'), ms('m2', 5 * L, 'invoiced')] });
    const onTime = simulate(input({ facts: [f] }), []);
    const late = simulate(input({ facts: [f] }), [], true);
    expect(onTime.months[0].inSigned).toBeCloseTo(5 * L);
    expect(late.months[0].inSigned).toBe(0);
    expect(late.months[1].inSigned).toBeCloseTo(5 * L);
  });
});

describe('the cards', () => {
  it('makes a card for each proposal and each size, with the band run', () => {
    const c = cardsOf([{ id: 'p1', name: 'Mehta villa', value: 26 * L, margin: 6.5 * L, odds: 0.6, stage: 'Negotiating', signsBy: at(2026, 11, 16) }], SHEET_BANDS);
    expect(c.pipe[0]).toMatchObject({ kind: 'pipe', ref: 'p1', months: 6, label: 'Mehta villa · 60%' });
    expect(c.sizes.map((s) => s.ref)).toEqual(['0', '1', '2', '3', '4']);
    expect(c.sizes[2]).toMatchObject({ value: 15 * L, margin: 3.75 * L, months: 3 });
    expect(cardOf(c, { kind: 'pipe', ref: 'p1', month: key(0) })?.name).toBe('Mehta villa');
  });
});

describe('advice', () => {
  const pipeline = [{ id: 'p1', name: 'Mehta villa', value: 26 * L, margin: 6.5 * L, odds: 0.6, stage: 'Negotiating', signsBy: at(2026, 11, 16) }];

  it('suggests a real proposal before a new project', () => {
    const m = bestMove(input({ pipeline }), []);
    expect(m?.play.kind).toBe('pipe');
  });

  it('never suggests a new project before a lead could sign, or past the usual pace', () => {
    const first = firstNewMonth(input());
    expect(first).toBe(1);
    let plays: Play[] = [];
    for (let g = 0; g < 8; g++) { const m = bestMove(input(), plays); if (!m) break; plays = [...plays, m.play]; }
    expect(plays.every((p) => months.findIndex((x) => x.key === p.month) >= first)).toBe(true);
    const perMonth = new Map<string, number>();
    plays.forEach((p) => perMonth.set(p.month, (perMonth.get(p.month) || 0) + 1));
    expect(Math.max(...perMonth.values())).toBeLessThanOrEqual(USUAL_PACE);
  });

  it('finds the easiest way to every goal', () => {
    const plays = easiest(input({ pipeline }));
    expect(plays[0]).toMatchObject({ kind: 'pipe', ref: 'p1', month: key(0) });
    expect(simulate(input({ pipeline }), plays).wins).toBe(3);
    const perMonth = new Map<string, number>();
    plays.forEach((p) => perMonth.set(p.month, (perMonth.get(p.month) || 0) + 1));
    expect(Math.max(...perMonth.values())).toBeLessThanOrEqual(USUAL_PACE);
  });

  it('checks leads, timing, the team, pace and the riskiest proposal', () => {
    const plays: Play[] = [
      { kind: 'pipe', ref: 'p1', month: key(0) },
      { kind: 'new', ref: '1', month: key(0) },
      ...Array.from({ length: 3 }, () => ({ kind: 'new' as const, ref: '2', month: key(1) })),
    ];
    const i = input({ pipeline, capacity: 3 });
    const checks = realityChecks(i, plays, simulate(i, plays));
    const titles = checks.map((c) => c.title);
    expect(titles).toContain('Short of leads');
    expect(titles.some((t) => /too soon/.test(t))).toBe(true);
    expect(titles.some((t) => /Team over/.test(t))).toBe(true);
    expect(titles).toContain('3 signings in Dec');
    expect(titles).toContain("If Mehta villa doesn't sign");
  });
});

describe('which projects count', () => {
  it('counts Actual unless left out, and anything the founders tick in', () => {
    const plan = { include: ['u1'], exclude: ['a2'] };
    expect(isCounted('a1', 'actual', plan)).toBe(true);
    expect(isCounted('a2', 'actual', plan)).toBe(false);
    expect(isCounted('u1', 'untagged', plan)).toBe(true);
    expect(isCounted('t1', 'test', plan)).toBe(false);
  });
  it('keeps only the choices that differ from the tag', () => {
    let p = { include: [] as string[], exclude: [] as string[] };
    p = setCounted(p, 'a1', 'actual', false);
    expect(p).toEqual({ include: [], exclude: ['a1'] });
    p = setCounted(p, 'a1', 'actual', true);
    expect(p).toEqual({ include: [], exclude: [] });
    p = setCounted(p, 'u1', 'untagged', true);
    expect(p).toEqual({ include: ['u1'], exclude: [] });
  });
  it('reads stored choices and plays, dropping anything malformed', () => {
    const p = planOf({ include: ['u1', 'u1', 3], exclude: 'x', plays: [{ kind: 'new', ref: '2', month: '2026-12' }, { kind: 'odd', ref: '1', month: '2026-12' }, { kind: 'pipe', ref: 'p', month: 'Dec' }] });
    expect(p.include).toEqual(['u1', '3']);
    expect(p.exclude).toEqual([]);
    expect(p.plays).toEqual([{ kind: 'new', ref: '2', month: '2026-12' }]);
  });
});
