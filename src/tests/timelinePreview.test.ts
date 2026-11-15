import { describe, it, expect } from 'vitest';
import {
  buildScheduleFromProject, estimateSiteWorkDays, previewTemplateProgramme, splitWorkDays, templatePhases,
  resolveProjectProgramme, programmeAsProposalPhases,
} from '../../lib/scheduleBuilder';
import { computeSchedule, programmeSpanDays } from '../../lib/schedule';

const TODAY = '2026-11-14';

// The studio's default design process (hooks/useStudioSettings.ts): 7+14+21+14+7 = 63 days,
// three of which are site steps the builder replaces with the BOQ's trades.
const STEPS = [
  { stepNumber: 1, title: 'Discovery & SOF', defaultDuration: 7 },
  { stepNumber: 2, title: 'Concept & 3D', defaultDuration: 14 },
  { stepNumber: 3, title: 'Procurement & Carpentry', defaultDuration: 21 },
  { stepNumber: 4, title: 'Finishes & Installation', defaultDuration: 14 },
  { stepNumber: 5, title: 'Handover', defaultDuration: 7 },
];

const line = (cat: string, value: number, room = 'Living') => ({ cat, qty: 1, materials: value, labor: 0, room }) as any;
const BOQ_2BHK = [
  line('Civil', 20000), line('Plumbing', 30000, 'Bath'), line('Electrical', 30000),
  line('False Ceiling', 40000), line('Flooring', 50000), line('Carpentry', 400000, 'Bedroom'),
  line('Painting', 30000, 'Kitchen'),
];
const ctx = (area: number, rooms: number) =>
  ({ area, rooms: Array.from({ length: rooms }, (_, i) => ({ name: `R${i}`, size: 50, unit: 'sq ft' })) }) as any;

describe('Timeline: the preview is the chart', () => {
  it('promises the same handover and duration the Gantt shows after generating', () => {
    const preview = previewTemplateProgramme(ctx(650, 9), BOQ_2BHK, '2026-11-14', STEPS, TODAY);

    // What the Timeline renders once the phases exist: derived schedule -> computeSchedule.
    const generated = buildScheduleFromProject(ctx(650, 9), BOQ_2BHK, {
      designSteps: templatePhases('2026-11-14', STEPS),
    });
    const chart = computeSchedule(generated, TODAY);

    expect(preview.totalDays).toBe(programmeSpanDays(chart));
    expect(preview.finishISO).toBe(
      new Date(Math.max(...chart.tasks.map(t => t.plannedEndDay)) * 86400000).toISOString().slice(0, 10),
    );
    expect(preview.designWorkDays).toBe(21); // the two design steps; site steps come from the BOQ
  });

  it('sizes a small flat shorter than a large home', () => {
    const small = previewTemplateProgramme(ctx(650, 5), BOQ_2BHK, '2026-11-14', STEPS, TODAY);
    const large = previewTemplateProgramme(ctx(3000, 16), BOQ_2BHK, '2026-11-14', STEPS, TODAY);
    expect(large.siteWorkDays).toBeGreaterThan(small.siteWorkDays);
    expect(large.totalDays).toBeGreaterThan(small.totalDays);
  });

  it('has no site days for a design-only project', () => {
    const p = previewTemplateProgramme({ ...ctx(650, 5), engagementType: 'design_only' }, BOQ_2BHK, '2026-11-14', STEPS, TODAY);
    expect(p.siteWorkDays).toBe(0);
  });
});

describe('estimateSiteWorkDays', () => {
  it('lands a 650 sq ft 2BHK turnkey job between 45 and 60 working days', () => {
    const { workDays } = estimateSiteWorkDays(ctx(650, 9), BOQ_2BHK);
    expect(workDays).toBeGreaterThanOrEqual(45);
    expect(workDays).toBeLessThanOrEqual(60);
  });

  it('is shorter when the BOQ has no civil or carpentry', () => {
    const full = estimateSiteWorkDays(ctx(650, 5), BOQ_2BHK).workDays;
    const paintOnly = estimateSiteWorkDays(ctx(650, 5), [line('Painting', 30000)]).workDays;
    expect(paintOnly).toBeLessThan(full);
  });

  it('stays within 25 to 120 working days', () => {
    expect(estimateSiteWorkDays(ctx(100, 1), [line('Decor', 1)]).workDays).toBe(25);
    expect(estimateSiteWorkDays(ctx(50000, 80), BOQ_2BHK).workDays).toBe(120);
  });
});

describe('splitWorkDays', () => {
  it('adds up to the total instead of rounding every stage up', () => {
    const days = splitWorkDays([0.3, 0.2, 0.15, 0.15, 0.1, 0.05, 0.05], 55);
    expect(days.reduce((a, b) => a + b, 0)).toBe(55);
    expect(Math.min(...days)).toBeGreaterThanOrEqual(2);
  });

  it('keeps each stage at its minimum when the total is too small to share', () => {
    expect(splitWorkDays([1, 1, 1], 4)).toEqual([2, 2, 2]);
  });
});

describe('One programme for the Timeline, proposal and agreement', () => {
  const C = ctx(650, 9);

  it('before generating, quotes exactly what Generate will produce', () => {
    const resolved = resolveProjectProgramme({ projectContext: C, boq: BOQ_2BHK, steps: STEPS, kickoffISO: '2026-11-14', todayISO: TODAY });
    const preview = previewTemplateProgramme(C, BOQ_2BHK, '2026-11-14', STEPS, TODAY);
    expect(resolved.source).toBe('estimate');
    expect(resolved.totalDays).toBe(preview.totalDays);
    expect(resolved.siteWorkDays).toBe(preview.siteWorkDays);
  });

  it('after generating, reads the generated phases', () => {
    const phases = templatePhases('2026-11-14', STEPS);
    const resolved = resolveProjectProgramme({ projectContext: C, boq: BOQ_2BHK, phases, steps: STEPS, todayISO: TODAY });
    const chart = computeSchedule(buildScheduleFromProject(C, BOQ_2BHK, { designSteps: phases }), TODAY);
    expect(resolved.source).toBe('timeline');
    expect(resolved.totalDays).toBe(programmeSpanDays(chart));
  });

  it('prefers the studio\'s saved schedule, edits and all', () => {
    const base = buildScheduleFromProject(C, BOQ_2BHK, { designSteps: templatePhases('2026-11-14', STEPS) });
    const edited = { ...base, tasks: base.tasks.map(t => (t.id === 'exec-carp-carcass' ? { ...t, workDays: t.workDays + 10 } : t)) };
    const plain = resolveProjectProgramme({ projectContext: C, boq: BOQ_2BHK, phases: templatePhases('2026-11-14', STEPS), todayISO: TODAY });
    const saved = resolveProjectProgramme({ projectContext: C, boq: BOQ_2BHK, saved: edited, phases: templatePhases('2026-11-14', STEPS), todayISO: TODAY });
    expect(saved.source).toBe('saved');
    expect(saved.siteWorkDays).toBe(plain.siteWorkDays + 10);
  });

  it('gives the proposal phases that add up to the Timeline total', () => {
    const p = resolveProjectProgramme({ projectContext: C, boq: BOQ_2BHK, steps: STEPS, kickoffISO: '2026-11-14', todayISO: TODAY });
    const phases = programmeAsProposalPhases(p);
    expect(phases[0].phaseName).toBe('Design & Planning');
    expect(phases[0].durationDays).toBe(p.designDays);
    expect(phases.reduce((s, ph) => s + ph.durationDays, 0)).toBe(p.totalDays);
    expect(phases.slice(1).reduce((s, ph) => s + ph.durationDays, 0)).toBe(p.siteDays);
    phases.slice(1).forEach((ph, i) => expect(ph.startDay).toBe(phases[i].startDay + phases[i].durationDays));
    expect(phases.map(ph => ph.phaseName)).toEqual([
      'Design & Planning', 'Site Setup & Rough-ins', 'Structure & Utilities', 'Finishes & Surfaces', 'Final Handover',
    ]);
  });

  it('gives a design-only project one design phase', () => {
    const p = resolveProjectProgramme({ projectContext: { ...C, engagementType: 'design_only' }, boq: BOQ_2BHK, steps: STEPS, kickoffISO: '2026-11-14', todayISO: TODAY });
    const phases = programmeAsProposalPhases(p);
    expect(phases).toHaveLength(1);
    expect(phases[0].durationDays).toBe(p.totalDays);
    expect(p.siteWorkDays).toBe(0);
  });
});
