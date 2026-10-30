import { describe, it, expect } from 'vitest';
import {
  fyOf, signedWork, landedIn, appBands, appFunnel, actualLeads, goalsReport, planOf, storedPlan, linesToOverheads,
  isFounder, bandIndex, SHEET_BANDS, SHEET_FUNNEL, DEFAULT_PLAN, MONTH, type FounderPlan, type GoalsInput,
} from '../../lib/founderGoals';
import type { ProjectFact } from '../../lib/ownerReports';
import type { Lead } from '../../lib/leads';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 30);
const DAY = 86400000;

const fact = (id: string, over: Partial<ProjectFact> = {}): ProjectFact => ({
  id, name: `Project ${id}`, client: `Client ${id}`, status: 'execution', area: 1000,
  bookedAt: at(2026, 10, 1), execution: 900000, design: 100000, plannedCost: 750000, committed: 0,
  milestones: [], additions: [], targetHandoverAt: null, handedOverAt: null, snags: [], decisions: [],
  schedule: null, designers: [], supervisors: [], ...over,
});

const lead = (id: string, over: Partial<Lead> = {}): Lead => ({
  id, tenantId: 't', createdAt: at(2026, 9, 1), createdBy: 'a', createdByName: 'A', ownerEmail: 'a', ownerName: 'A',
  people: [], home: { where: '', type: '', area: null, scope: [], possession: '', budget: '' }, source: 'instagram', sourceNote: '',
  enquiry: '', stage: 'new', lostReason: null, know: { decides: '', style: '', seenWork: false }, next: null, touches: [],
  firstTouchAt: null, lastTouchAt: null, openRequest: null, projectId: null, updatedAt: at(2026, 9, 1), updatedBy: 'a', ...over,
});

const plan = (over: Partial<FounderPlan> = {}): FounderPlan => ({
  ...DEFAULT_PLAN,
  studio: [{ name: 'Salaries (3 people)', amount: 75000 }, { name: 'Rent', amount: 26250 }, { name: 'Marketing', amount: 10000 }, { name: 'Subscriptions', amount: 5000 }, { name: 'Electricity', amount: 3000 }, { name: 'Wi-Fi', amount: 1500 }],
  home: [{ name: 'Card', amount: 80000 }, { name: 'EMIs', amount: 35000 }, { name: 'Maids', amount: 29000 }, { name: 'Others', amount: 20000 }, { name: 'Miscellaneous', amount: 10000 }],
  cash: 1200000,
  ...over,
});

const input = (over: Partial<GoalsInput> = {}): GoalsInput => ({
  facts: [], leads: [], plan: plan(), overheads: { salaries: 0, rent: 0, other: 0 },
  team: { designers: 2, supervisors: 1, perDesigner: 4, perSupervisor: 3 }, now: NOW, ...over,
});

describe('who sees it', () => {
  it('lets in only the two founders, whatever the case', () => {
    expect(isFounder('Formfactors.Operations@gmail.com')).toBe(true);
    expect(isFounder('formfactorsdesignstudio@gmail.com ')).toBe(true);
    expect(isFounder('tanvi@formfactorsdesignstudio.com')).toBe(false);
    expect(isFounder(null)).toBe(false);
  });
});

describe('the financial year', () => {
  it('runs from 1 April in four quarters, and finds the current one', () => {
    const fy = fyOf(NOW);
    expect(fy.label).toBe('FY 26–27');
    expect(fy.current).toBe(2);
    expect(fy.quarters[2].span).toBe('Oct–Dec');
    expect(fy.quarters[2].start).toBe(new Date(2026, 9, 1).getTime());
    expect(fy.quarters[2].end).toBe(new Date(2027, 0, 1).getTime());
    expect(fyOf(at(2027, 2, 10)).label).toBe('FY 26–27');
    expect(fyOf(at(2027, 2, 10)).current).toBe(3);
    expect(fyOf(at(2027, 4, 1)).label).toBe('FY 27–28');
  });
});

describe('bands', () => {
  it('puts a project in the band its value falls in', () => {
    expect(bandIndex(300000)).toBe(0);
    expect(bandIndex(500000)).toBe(1);
    expect(bandIndex(1999999)).toBe(2);
    expect(bandIndex(3500000)).toBe(4);
  });
});

describe('signed work and when its margin lands', () => {
  it('takes margin from the planned cost, and the run from booking to handover', () => {
    const [w] = signedWork([fact('a', { targetHandoverAt: at(2026, 12, 31) })], SHEET_BANDS);
    expect(w.margin).toBe(250000);
    expect(w.marginEstimated).toBe(false);
    expect(w.runEstimated).toBe(false);
  });
  it("falls back to the band's margin and run when the project does not say", () => {
    const [w] = signedWork([fact('a', { plannedCost: 0 })], SHEET_BANDS);
    expect(w.margin).toBe(250000);
    expect(w.marginEstimated).toBe(true);
    expect(w.runEstimated).toBe(true);
    expect(Math.round((w.end - w.start) / MONTH)).toBe(3);
  });
  it('leaves out proposals and projects with no booking date', () => {
    expect(signedWork([fact('a', { status: 'proposal_sent' }), fact('b', { bookedAt: null })], SHEET_BANDS)).toHaveLength(0);
  });
  it('spreads margin evenly across the run', () => {
    const work = signedWork([fact('a', { bookedAt: at(2026, 10, 1, 0), targetHandoverAt: at(2026, 12, 31, 0) })], SHEET_BANDS);
    const all = landedIn(work, 0, Infinity);
    expect(all).toBeCloseTo(250000);
    const half = landedIn(work, at(2026, 10, 1, 0), (at(2026, 10, 1, 0) + at(2026, 12, 31, 0)) / 2);
    expect(half).toBeCloseTo(125000);
  });
});

describe("the app's figures", () => {
  it("takes each band's value, margin and run from its own projects, and the mix from the last year", () => {
    const facts = [
      fact('a', { bookedAt: at(2026, 6, 1), targetHandoverAt: at(2026, 9, 1) }),
      fact('b', { bookedAt: at(2026, 7, 1), targetHandoverAt: at(2026, 10, 1) }),
      fact('c', { bookedAt: at(2026, 8, 1), execution: 250000, design: 50000, plannedCost: 240000 }),
    ];
    const { bands, basedOn } = appBands(facts, NOW);
    expect(basedOn).toBe(3);
    expect(bands[1].value).toBe(1000000);
    expect(bands[1].margin).toBe(25);
    expect(bands[1].months).toBe(3);
    expect(bands[0].margin).toBe(20);
    expect(bands[0].mix).toBe(33);
    expect(bands.reduce((s, b) => s + b.mix, 0)).toBe(100);
    expect(bands[1].mix).toBe(67);
    expect(bands[3]).toMatchObject({ value: SHEET_BANDS[3].value, margin: SHEET_BANDS[3].margin });
  });

  it("works the funnel out from the year's leads", () => {
    const stage = (to: string) => ({ id: to, at: 0, by: '', byName: '', kind: 'stage' as const, text: `Moved to ${to}` });
    const leads = [
      ...Array.from({ length: 4 }, (_, k) => lead(`n${k}`)),
      lead('m1', { stage: 'meeting' }), lead('m2', { stage: 'measured' }),
      lead('p1', { stage: 'proposal', source: 'referral' }),
      lead('w1', { stage: 'won', createdAt: at(2026, 7, 1), updatedAt: at(2026, 9, 10), source: 'referral' }),
      lead('w2', { stage: 'won', createdAt: at(2026, 7, 1), updatedAt: at(2026, 9, 20) }),
      lead('l1', { stage: 'lost', touches: [stage('Proposal sent')] }),
    ];
    const flow = appFunnel(leads, [], NOW);
    expect(flow.basedOn).toBe(10);
    expect(flow.funnel.meet).toBe(60);
    expect(flow.funnel.prop).toBe(67);
    expect(flow.funnel.win).toBe(67);
    expect(flow.funnel.cycle).toBe(76);
    expect(flow.funnel.referral).toBe(20);
    expect(flow.actual.leads).toBe(2.7);
  });

  it("uses the sheet's rates until there are five leads", () => {
    const flow = appFunnel([lead('a', { stage: 'won' })], [], NOW);
    expect(flow.funnel).toMatchObject({ meet: SHEET_FUNNEL.meet, prop: SHEET_FUNNEL.prop, win: SHEET_FUNNEL.win });
  });

  it('leaves out leads tied to a Dummy project', () => {
    const out = actualLeads([lead('a', { projectId: 'x' }), lead('b', { projectId: 'y' }), lead('c')], new Set(['x']));
    expect(out.map((l) => l.id)).toEqual(['b', 'c']);
  });
});

describe('the stored plan', () => {
  it('cleans what it reads, and keeps what the founders set', () => {
    const p = planOf({ cash: '1200000', buffer: -3, rebuild: 0, growth: 15, tier: 'nonsense', home: [{ name: 'EMIs', amount: '35000' }], funnel: { win: 40, meet: '' } });
    expect(p.cash).toBe(1200000);
    expect(p.buffer).toBe(0);
    expect(p.rebuild).toBe(1);
    expect(p.tier).toBeNull();
    expect(p.home).toEqual([{ name: 'EMIs', amount: 35000 }]);
    expect(p.funnel).toEqual({ win: 40 });
    expect(p.bands).toBeNull();
    expect(p.studio).toBeNull();
    expect(planOf(null)).toEqual(DEFAULT_PLAN);
    expect(Object.keys(storedPlan(p, 'me', 1)).sort()).toEqual(['bands', 'buffer', 'cash', 'cashAt', 'funnel', 'growth', 'home', 'rebuild', 'studio', 'tier', 'updatedAt', 'updatedBy']);
  });
  it("folds the studio's lines back into Set targets' three overheads", () => {
    expect(linesToOverheads(plan().studio!)).toEqual({ salaries: 75000, rent: 26250, other: 19500 });
  });
});

describe('the goal', () => {
  it('builds Break even, Sustain and Grow on each other, and recommends Sustain while the buffer is short', () => {
    const r = goalsReport(input());
    expect(r.monthly).toBe(294750);
    expect(r.qCosts).toBe(884250);
    expect(r.bufferTarget).toBe(1768500);
    expect(r.rebuildQ).toBeCloseTo(142125);
    expect(r.tierVal.sustain).toBeCloseTo(1026375);
    expect(r.tierVal.grow).toBeCloseTo(1026375 + 132637.5);
    expect(r.recommended).toBe('sustain');
    expect(r.tier).toBe('sustain');
  });

  it('recommends Grow once cash covers the buffer, and follows the level the founders pick', () => {
    expect(goalsReport(input({ plan: plan({ cash: 2000000 }) })).recommended).toBe('grow');
    const r = goalsReport(input({ plan: plan({ tier: 'survive' }) }));
    expect(r.goal).toBe(r.qCosts);
  });

  it("uses Set targets' overheads until the founders list their own studio costs", () => {
    const r = goalsReport(input({ plan: plan({ studio: null }), overheads: { salaries: 75000, rent: 26250, other: 0 } }));
    expect(r.studioFromTargets).toBe(true);
    expect(r.studio.map((l) => l.name)).toEqual(['Salaries', 'Rent']);
    expect(r.studioTotal).toBe(101250);
  });
});

describe('projects and leads to the goal', () => {
  const r = goalsReport(input({ plan: plan({ bands: SHEET_BANDS }) }));
  it('works a typical project out from the mix', () => {
    expect(r.avgMargin).toBeCloseTo(273750);
    expect(r.avgMonths).toBeCloseTo(3.25);
  });
  it('counts projects a year and a quarter for each level', () => {
    expect(r.perYear).toEqual({ survive: 13, sustain: 15, grow: 17 });
    expect(r.perQGoal).toBe(4);
  });
  it('works leads back from signings at the studio rates', () => {
    expect(r.conv).toBeCloseTo(0.1155);
    expect(r.leadsNeed).toBe(12);
  });
  it('says how many of one size alone would do it', () => {
    expect(r.alone.map((a) => a.n)).toEqual([14, 5, 3, 2, 2]);
  });
});

describe('this quarter', () => {
  it('splits signed margin into earned so far and still to land', () => {
    const facts = [fact('a', { bookedAt: at(2026, 10, 1, 0), targetHandoverAt: at(2026, 12, 31, 23) })];
    const r = goalsReport(input({ facts }));
    expect(r.earned + r.expected).toBeCloseTo(250000, -2);
    expect(r.earned).toBeGreaterThan(70000);
    expect(r.earned).toBeLessThan(90000);
    expect(r.gap).toBeCloseTo(r.goal - r.projected);
  });
});

describe('runway', () => {
  it('says when cash runs out if nothing new signs', () => {
    const r = goalsReport(input({ plan: plan({ cash: 600000 }) }));
    expect(r.runway).toHaveLength(13);
    expect(r.runwayOut.none).not.toBeNull();
    /* ₹6L at ₹2.95L a month: about two months. */
    expect(((r.runwayOut.none as number) - NOW) / MONTH).toBeCloseTo(2.04, 1);
    expect(r.runway![12].goal).toBeGreaterThan(r.runway![12].none);
  });
  it('has no runway without cash, and asks for it first', () => {
    const r = goalsReport(input({ plan: plan({ cash: null }) }));
    expect(r.runway).toBeNull();
    expect(r.moves[0].title).toMatch(/Enter the cash/);
  });
});

describe('the pipeline', () => {
  it('weights proposals by their odds and what they land before the quarter ends', () => {
    const facts = [fact('p', { status: 'negotiation', bookedAt: null, execution: 2600000, design: 0, plannedCost: 1950000 })];
    const r = goalsReport(input({ facts }));
    const p = r.pipe[0];
    expect(p.odds).toBeCloseTo(0.6);
    /* ₹6.5L over a 6-month run, signed 13 Nov: about a quarter of it lands by 31 Dec. */
    expect(p.land).toBeGreaterThan(130000);
    expect(p.land).toBeLessThan(180000);
    expect(r.pipeWeighted).toBeCloseTo(p.land * 0.6);
  });
});

describe('capacity and moves', () => {
  it('asks for a Site Supervisor when the sites outgrow them', () => {
    const facts = ['a', 'b', 'c', 'd'].map((id) => fact(id));
    const r = goalsReport(input({ facts }));
    expect(r.sites).toBe(4);
    expect(r.needSupervisors).toBe(2);
    expect(r.moves.some((m) => m.tag === 'Team')).toBe(true);
    expect(r.hireCost).toBe(25000);
  });
});

describe('the year', () => {
  it('counts what each quarter earned and booked', () => {
    const facts = [fact('a', { bookedAt: at(2026, 5, 1, 0), targetHandoverAt: at(2026, 5, 31, 0) })];
    const r = goalsReport(input({ facts }));
    expect(r.quarters[0].earned).toBeCloseTo(250000);
    expect(r.quarters[0].booked).toBe(1000000);
    expect(r.quarters[0].signed).toBe(1);
    expect(r.quarters[2].now).toBe(true);
    expect(r.fyGoal).toBeCloseTo(r.goal * 4);
    expect(r.fyHave).toBeCloseTo(250000);
    void DAY;
  });
});
