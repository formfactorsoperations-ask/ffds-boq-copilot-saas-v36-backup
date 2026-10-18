import { describe, it, expect } from 'vitest';
import { buildScheduleFromProject } from '../../lib/scheduleBuilder';
import {
  computeSchedule, reorderTaskInLane, gateHeldChain, releaseBeforeGate, planStartAt, toDayNum, toISO,
  type ScheduleResult,
} from '../../lib/schedule';
import { ProjectSchedule } from '../../types';
import { buildProgramme } from '../../components/client/programme';

const TODAY = '2026-10-18';

const BOQ: any[] = [
  { cat: 'Site Preliminaries', qty: 1, materials: 100, labor: 100 },
  { cat: 'Civil & Demolition', qty: 1, materials: 300, labor: 100 },
  { cat: 'Plumbing', qty: 1, materials: 300, labor: 100 },
  { cat: 'Electrical', qty: 1, materials: 300, labor: 100 },
  { cat: 'Carpentry', qty: 1, materials: 900, labor: 100 },
  { cat: 'Painting', qty: 1, materials: 200, labor: 100 },
];

function programme(target = '2027-02-15'): ProjectSchedule {
  const s = buildScheduleFromProject({ targetHandoverDate: target } as any, BOQ, {
    designSteps: [
      { stepNumber: 1, title: 'Concept', startDate: '2026-08-01', durationDays: 10 },
      { stepNumber: 2, title: 'Design development', startDate: '2026-08-15', durationDays: 10 },
    ],
  });
  return { ...s, projectStartISO: '2026-08-01' };
}

const task = (r: ScheduleResult, id: string) => r.tasks.find(t => t.id === id)!;
const lastOtherEnd = (r: ScheduleResult) =>
  Math.max(...r.tasks.filter(t => t.id !== 'ms-handover').map(t => t.plannedEndDay));
const withDesignDays = (s: ProjectSchedule, days: number): ProjectSchedule =>
  ({ ...s, tasks: s.tasks.map(t => (t.id === 'design-2' ? { ...t, workDays: days } : t)) });

describe('Handover moves with the programme', () => {
  it('moves as far as the Design Gate when design runs longer', () => {
    const before = computeSchedule(programme(), TODAY);
    const after = computeSchedule(withDesignDays(programme(), 40), TODAY);

    const gateMoved = task(after, 'ms-design-gate').plannedStartDay - task(before, 'ms-design-gate').plannedStartDay;
    const handoverMoved = task(after, 'ms-handover').plannedStartDay - task(before, 'ms-handover').plannedStartDay;

    expect(gateMoved).toBeGreaterThan(20);
    // Same working-day shift; calendar days can differ by a holiday or two.
    expect(Math.abs(handoverMoved - gateMoved)).toBeLessThanOrEqual(3);
  });

  it('does not shorten the trades to hold the target handover', () => {
    const s = withDesignDays(programme('2026-12-01'), 40);
    const r = computeSchedule(s, TODAY);

    r.tasks.forEach(t => {
      expect(t.workDays).toBe(s.tasks.find(x => x.id === t.id)!.workDays);
    });
    expect(r.overrunWorkDays).toBeGreaterThan(0);
    expect(r.catchUp).toBeDefined();
    expect(r.catchUp!.factor).toBeLessThan(1);
  });

  it('waits for every stage, even after the lane is reordered', () => {
    const s = programme();
    const moved = reorderTaskInLane(s.tasks, 'exec-paint-final', 'exec-carp-carcass', 'before');
    const r = computeSchedule({ ...s, tasks: moved }, TODAY);
    expect(task(r, 'ms-handover').plannedStartDay).toBeGreaterThan(lastOtherEnd(r));
  });

  it('still comes last when its stored predecessor is deleted', () => {
    const s = programme();
    const r = computeSchedule({ ...s, tasks: s.tasks.filter(t => t.id !== 'exec-paint-final') }, TODAY);
    expect(task(r, 'ms-handover').plannedStartDay).toBeGreaterThan(lastOtherEnd(r));
  });

  it('waits for a stage added after the trades', () => {
    const s = programme();
    const extra = {
      id: 'deep-clean', title: 'Deep cleaning', kind: 'execution' as const, workDays: 4,
      dependencies: ['exec-paint-final'], status: 'pending' as const,
    };
    const r = computeSchedule({ ...s, tasks: [...s.tasks, extra] }, TODAY);
    expect(task(r, 'ms-handover').plannedStartDay).toBeGreaterThan(task(r, 'deep-clean').plannedEndDay);
  });

  it('is the last row', () => {
    const r = computeSchedule(programme(), TODAY);
    expect(r.tasks[r.tasks.length - 1].id).toBe('ms-handover');
  });

  it('keeps the stored dependencies as they were saved', () => {
    const s = programme();
    const r = computeSchedule(s, TODAY);
    expect(task(r, 'ms-handover').dependencies).toEqual(s.tasks.find(t => t.id === 'ms-handover')!.dependencies);
  });
});

describe('Starting execution before the Design Gate', () => {
  const release = (s: ProjectSchedule, ids: string[]): ProjectSchedule => ({
    ...s,
    tasks: s.tasks.map(t => (ids.includes(t.id)
      ? { ...t, earlyStart: { reason: 'Client approved the demolition plan', at: 1 } }
      : t)),
  });

  it('lets released work start before the gate while the rest waits for it', () => {
    const s = release(withDesignDays(programme(), 40), ['exec-site-prelims', 'exec-civil-demolition']);
    const r = computeSchedule(s, TODAY);
    const gate = task(r, 'ms-design-gate').plannedStartDay;

    // Released work starts with the project, alongside the first design step.
    expect(task(r, 'exec-site-prelims').plannedStartDay).toBe(task(r, 'design-1').plannedStartDay);
    expect(task(r, 'exec-site-prelims').plannedStartDay).toBeLessThan(gate);
    expect(task(r, 'exec-civil-demolition').plannedStartDay).toBeLessThan(gate);
    expect(task(r, 'exec-civil-demolition').plannedStartDay).toBeGreaterThan(task(r, 'exec-site-prelims').plannedEndDay);

    // Plumbing follows demolition, but is still held by the gate.
    expect(task(r, 'exec-plumb-concealed').plannedStartDay).toBeGreaterThan(gate);
    expect(task(r, 'exec-elec-conduit').plannedStartDay).toBeGreaterThan(gate);
  });

  it('does not move the gate itself', () => {
    const s = withDesignDays(programme(), 40);
    const before = computeSchedule(s, TODAY);
    const after = computeSchedule(release(s, ['exec-site-prelims', 'exec-civil-demolition']), TODAY);
    expect(task(after, 'ms-design-gate').plannedStartDay).toBe(task(before, 'ms-design-gate').plannedStartDay);
  });

  it('says which predecessor is still holding released work back', () => {
    const r = computeSchedule(release(programme(), ['exec-civil-demolition']), TODAY);
    expect(task(r, 'exec-civil-demolition').earlyStartHeldBy)
      .toEqual({ id: 'exec-site-prelims', title: 'Site Setup & Preliminaries' });
    expect(task(r, 'exec-civil-demolition').plannedStartDay).toBeGreaterThan(task(r, 'ms-design-gate').plannedStartDay);
  });

  it('marks what the gate holds back', () => {
    const r = computeSchedule(programme(), TODAY);
    expect(task(r, 'exec-site-prelims').behindDesignGate).toBe(true);
    expect(task(r, 'exec-paint-final').behindDesignGate).toBe(true);
    expect(task(r, 'design-1').behindDesignGate).toBe(false);
    expect(task(r, 'ms-handover').behindDesignGate).toBe(false);
  });

  it('moving demolition ahead of the gate takes site setup with it', () => {
    const s = programme();
    expect(gateHeldChain(s.tasks, 'exec-civil-demolition')).toEqual(['exec-site-prelims', 'exec-civil-demolition']);

    const next = releaseBeforeGate(withDesignDays(s, 40), 'exec-civil-demolition', 'Plan approved', { startISO: '2026-09-01', at: 5 });
    const r = computeSchedule(next, TODAY);
    expect(task(r, 'exec-site-prelims').earlyStart).toEqual({ reason: 'Plan approved', at: 5 });
    expect(task(r, 'exec-civil-demolition').earlyStartHeldBy).toBeUndefined();
    expect(task(r, 'exec-civil-demolition').plannedStartDay).toBe(toDayNum('2026-09-01'));
    expect(task(r, 'exec-civil-demolition').plannedStartDay).toBeLessThan(task(r, 'ms-design-gate').plannedStartDay);
    expect(task(r, 'exec-plumb-concealed').plannedStartDay).toBeGreaterThan(task(r, 'ms-design-gate').plannedStartDay);
  });

  it('works for any trade, not just demolition: carpentry takes everything ahead of it', () => {
    const s = withDesignDays(programme(), 40);
    const chain = gateHeldChain(s.tasks, 'exec-carp-carcass');
    expect(chain[chain.length - 1]).toBe('exec-carp-carcass');
    expect(chain).toEqual(expect.arrayContaining(['exec-site-prelims', 'exec-civil-demolition', 'exec-elec-wiring']));

    const r = computeSchedule(releaseBeforeGate(s, 'exec-carp-carcass', 'Kitchen design frozen'), TODAY);
    const gate = task(r, 'ms-design-gate').plannedStartDay;
    expect(task(r, 'exec-carp-carcass').plannedStartDay).toBeLessThan(gate);
    // The work after carpentry still waits for the gate.
    expect(task(r, 'exec-paint-first').plannedStartDay).toBeGreaterThan(gate);
  });

  it('has nothing to release for design work or work already released', () => {
    const s = programme();
    expect(gateHeldChain(s.tasks, 'design-1')).toEqual([]);
    const released = releaseBeforeGate(s, 'exec-site-prelims', 'Plan approved');
    expect(gateHeldChain(released.tasks, 'exec-site-prelims')).toEqual([]);
    expect(releaseBeforeGate(released, 'exec-site-prelims', 'again')).toBe(released);
  });

  it('changes nothing on a programme with nothing released', () => {
    const s = programme();
    const r = computeSchedule(s, TODAY);
    const gate = task(r, 'ms-design-gate').plannedStartDay;
    r.tasks.filter(t => t.behindDesignGate).forEach(t => expect(t.plannedStartDay).toBeGreaterThan(gate));
  });
});

describe('Client portal programme', () => {
  const lifecycle: any = {
    stages: [1, 2, 3, 4, 5, 6].map(n => ({
      stageNumber: n, name: `Stage ${n}`, shortName: `Stage ${n}`, status: n === 2 ? 'active' : n < 2 ? 'completed' : 'pending',
    })),
  };

  it('puts Handover in the last stage, after every other dated point', () => {
    const p = buildProgramme(withDesignDays(programme(), 40), lifecycle, true);
    const handover = p.stages[5].milestones.find(m => m.id === 'ms-handover')!;
    const gate = p.stages[3].milestones.find(m => m.id === 'ms-design-gate')!;
    expect(handover).toBeDefined();
    expect(handover.day).toBeGreaterThan(gate.day);
    expect(handover.day).toBeGreaterThanOrEqual(Math.max(...p.stages.slice(0, 5).map(s => s.endDay)));
  });

  it('shows released site work as starting early', () => {
    const s = withDesignDays(programme(), 40);
    const released = {
      ...s,
      tasks: s.tasks.map(t => (t.id === 'exec-site-prelims' || t.id === 'exec-civil-demolition'
        ? { ...t, earlyStart: { reason: 'Client approved the demolition plan', at: 1 } }
        : t)),
    };
    const p = buildProgramme(released, lifecycle, true);
    const marks = p.stages.flatMap(st => st.milestones);
    const gate = marks.find(m => m.id === 'ms-design-gate')!;
    const civil = marks.find(m => m.id === 'early-exec-civil-demolition')!;
    expect(civil.label).toBe('Civil & Demolition Works starts early');
    expect(civil.day).toBeLessThan(gate.day);
  });
});

describe('Running stages in parallel', () => {
  const FULL_BOQ: any[] = [...BOQ, { cat: 'False Ceiling', qty: 1, materials: 200, labor: 100 }];
  const full = (): ProjectSchedule => {
    const s = buildScheduleFromProject({ targetHandoverDate: '2027-02-15' } as any, FULL_BOQ, {
      designSteps: [{ stepNumber: 1, title: 'Concept', startDate: '2026-08-01', durationDays: 10 }],
    });
    return { ...s, projectStartISO: '2026-08-01' };
  };

  it('starts a stage the given working days before its predecessor finishes', () => {
    const s = full();
    const r0 = computeSchedule(s, TODAY);
    const civil = task(r0, 'exec-civil-demolition');
    const withOverlap = { ...s, tasks: s.tasks.map(t => (t.id === 'exec-elec-conduit' ? { ...t, overlapDays: 3 } : t)) };
    const r = computeSchedule(withOverlap, TODAY);
    const conduit = task(r, 'exec-elec-conduit');
    expect(conduit.plannedStartDay).toBeLessThan(civil.plannedEndDay + 1);
    expect(conduit.plannedStartDay).toBeGreaterThan(civil.plannedStartDay);
  });

  it('never starts before its predecessor starts, however large the overlap', () => {
    const s = full();
    const r = computeSchedule({ ...s, tasks: s.tasks.map(t => (t.id === 'exec-elec-conduit' ? { ...t, overlapDays: 99 } : t)) }, TODAY);
    expect(task(r, 'exec-elec-conduit').plannedStartDay).toBe(task(r, 'exec-civil-demolition').plannedStartDay);
  });

  it('dragging conduits into the end of demolition reports the days saved', () => {
    const s = full();
    const r0 = computeSchedule(s, TODAY);
    const civil = task(r0, 'exec-civil-demolition');
    const plan = planStartAt(s, 'exec-elec-conduit', civil.plannedEndDay - 2, TODAY);
    expect(plan.changed).toBe(true);
    expect(plan.overlapDays).toBeGreaterThan(0);
    expect(plan.alongside).toContain('Civil & Demolition Works');
    // Conduits share the critical path with plumbing here, so check the sign only.
    expect(plan.savedWorkDays).toBeGreaterThanOrEqual(0);
    expect(computeSchedule(plan.schedule, TODAY).tasks.find(t => t.id === 'exec-elec-conduit')!.plannedStartDay)
      .toBe(plan.startDay);
  });

  it('dragging ceiling framing back past flooring runs it alongside demolition', () => {
    const s = full();
    const r0 = computeSchedule(s, TODAY);
    const civil = task(r0, 'exec-civil-demolition');
    const plan = planStartAt(s, 'exec-ceiling-framing', civil.plannedEndDay - 1, TODAY);
    expect(plan.relinked.length).toBeGreaterThan(0);
    expect(plan.alongside).toContain('Civil & Demolition Works');
    expect(plan.startDay).toBeLessThanOrEqual(civil.plannedEndDay);
    expect(plan.savedWorkDays).toBeGreaterThan(0);
    const after = computeSchedule(plan.schedule, TODAY);
    // The ceiling is still not closed before the concealed services are in.
    const boarding = after.tasks.find(t => t.id === 'exec-ceiling-boarding')!;
    expect(boarding.plannedStartDay).toBeGreaterThan(task(after, 'exec-plumb-concealed').plannedEndDay);
    expect(task(after, 'ms-handover').plannedStartDay).toBeGreaterThan(
      Math.max(...after.tasks.filter(t => t.id !== 'ms-handover').map(t => t.plannedEndDay)));
  });

  it('stops at the Design Gate for work not released early', () => {
    const s = full();
    const r0 = computeSchedule(s, TODAY);
    const plan = planStartAt(s, 'exec-site-prelims', task(r0, 'ms-design-gate').plannedStartDay - 10, TODAY);
    expect(plan.heldBy?.isDesignGate).toBe(true);
    expect(plan.changed).toBe(false);
  });

  it('dragging later than the predecessors allow sets an earliest start', () => {
    const s = full();
    const r0 = computeSchedule(s, TODAY);
    const later = task(r0, 'exec-paint-final').plannedStartDay + 10;
    const plan = planStartAt(s, 'exec-paint-final', later, TODAY);
    expect(plan.schedule.tasks.find(t => t.id === 'exec-paint-final')!.notBeforeISO).toBe(toISO(plan.startDay));
    expect(plan.savedWorkDays).toBeLessThan(0);
  });
});
