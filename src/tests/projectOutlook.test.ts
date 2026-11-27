/*
  Where the project is heading (smart workspace, PR 5; owner, 27 Nov 2026): the
  handover forecast with its reasons and lever, run on the real programme
  engine, and the margin from the project's P&L (lib/projectOutlook).
*/
import { describe, it, expect } from 'vitest';
import { buildScheduleFromProject } from '../../lib/scheduleBuilder';
import { computeSchedule } from '../../lib/schedule';
import { handoverOutlook, handoverLine, marginOutlook } from '../../lib/projectOutlook';
import { projectSignals } from '../../lib/projectSignals';
import type { ProjectSchedule } from '../../types';

const TODAY = '2026-10-18';
const BOQ: any[] = [
  { cat: 'Site Preliminaries', qty: 1, materials: 100, labor: 100 },
  { cat: 'Civil & Demolition', qty: 1, materials: 300, labor: 100 },
  { cat: 'Electrical', qty: 1, materials: 300, labor: 100 },
  { cat: 'Carpentry', qty: 1, materials: 900, labor: 100 },
  { cat: 'Painting', qty: 1, materials: 200, labor: 100 },
];
function programme(target: string): ProjectSchedule {
  const s = buildScheduleFromProject({ targetHandoverDate: target } as any, BOQ, {
    designSteps: [
      { stepNumber: 1, title: 'Concept', startDate: '2026-08-01', durationDays: 10 },
      { stepNumber: 2, title: 'Design development', startDate: '2026-08-15', durationDays: 10 },
    ],
  });
  return { ...s, projectStartISO: '2026-08-01' };
}

describe('handoverOutlook', () => {
  it('says the forecast is on target when it is', () => {
    const s = programme('2027-12-31');
    const o = handoverOutlook(s, computeSchedule(s, TODAY), TODAY)!;
    expect(o.lateWorkDays).toBeLessThanOrEqual(0);
    expect(handoverLine(o)).toMatch(/^Likely .* · on target$/);
    expect(o.lever).toBeNull();
  });

  it('says how far past the target it runs, and what the rest would have to run at', () => {
    const s = programme('2026-11-15');
    const r = computeSchedule(s, TODAY);
    const o = handoverOutlook(s, r, TODAY)!;
    expect(o.forecastISO).toBe(r.finishISO);
    expect(o.lateWorkDays).toBeGreaterThan(0);
    expect(handoverLine(o)).toMatch(/working days? past target$/);
    expect(o.lever?.text).toMatch(/^To make the target, the remaining work has to run at \d+% of its planned time\.$/);
  });

  it('finds the hold that costs most and works out, by running the programme again, the date without it', () => {
    const base = programme('2026-11-15');
    const firstExec = computeSchedule(base, TODAY).tasks.find((t) => t.kind === 'execution')!;
    const s: ProjectSchedule = { ...base, holds: [{ id: 'h1', scope: 'site', fromISO: firstExec.startISO, workDays: 10, reason: 'Payment not received', at: 1 }] };
    const r = computeSchedule(s, TODAY);
    const o = handoverOutlook(s, r, TODAY)!;
    expect(o.reasons[0]).toMatch(/^Payment not received: a hold of 10 working days moves handover \d+ days$/);
    expect(o.lever?.text).toMatch(/^Without the "Payment not received" hold, handover moves to /);
    expect(o.lever!.forecastISO! < r.finishISO!).toBe(true);
  });

  it('is nothing without a forecast', () => {
    expect(handoverOutlook(programme('2027-01-01'), { finishISO: null } as any)).toBeNull();
  });
});

describe('marginOutlook', () => {
  const pnl = (over: any = {}): any => ({
    contractedTotal: 1000000, hasProcurement: true, quotedMargin: 310000, currentMargin: 264000, quotedMarginPct: 31, currentMarginPct: 26.4,
    overspentEnvelopes: [{ roomId: 'Kitchen', category: 'Carpentry', overBy: 9400 }, { roomId: 'Hall', category: 'Painting', overBy: 2000 }],
    uncostedLines: 3, committedCost: 400000, receivedFromClient: 250000, confidence: 'partly-committed', ...over,
  });

  it('says quoted against on track for, what moved it, and the cash committed past what was paid', () => {
    const m = marginOutlook(pnl())!;
    expect(m).toMatchObject({ quotedPct: 31, currentPct: 26.4, movedBy: 46000, uncostedLines: 3, exposure: 150000, tone: 'turn' });
    expect(m.overspent[0]).toEqual({ where: 'Kitchen · Carpentry', overBy: 9400 });
  });

  it('reads the plan as the plan before anything is ordered, and is rose past a quarter lost', () => {
    expect(marginOutlook(pnl({ hasProcurement: false, overspentEnvelopes: [] }))).toMatchObject({ currentPct: 31, movedBy: 0, tone: 'plain' });
    expect(marginOutlook(pnl({ currentMargin: 200000, currentMarginPct: 20 }))!.tone).toBe('late');
  });

  it('is nothing before anything is sold', () => {
    expect(marginOutlook(pnl({ contractedTotal: 0 }))).toBeNull();
    expect(marginOutlook(null)).toBeNull();
  });
});

describe('the handover and money signals', () => {
  it('puts a late forecast on Plan & timeline in place of the journey-based check', () => {
    const s = projectSignals({ context: { status: 'execution', currentStage: 5, targetHandoverDate: '2020-01-01', journeySummary: { pct: 40 } }, money: null, alerts: [], drawings: null, handover: { lateWorkDays: 7, line: 'Likely 9 Feb ’27 · 7 working days past target' } });
    const ids = s.map((x) => x.id);
    expect(ids).toContain('handover-forecast');
    expect(ids).not.toContain('risk-handover-slip');
  });

  it('runs the cash check on the real P&L for those who see it', () => {
    const p: any = { hasProcurement: true, committedCost: 400000, receivedFromClient: 50000, contractedTotal: 1000000, quotedMargin: 300000, currentMargin: 300000 };
    const ids = projectSignals({ context: { status: 'execution', currentStage: 5 }, money: null, alerts: [], drawings: null, pnl: p }).map((x) => x.id);
    expect(ids).toContain('risk-cash-exposure');
    expect(projectSignals({ context: { status: 'execution', currentStage: 5 }, money: null, alerts: [], drawings: null }).map((x) => x.id)).not.toContain('risk-cash-exposure');
  });
});
