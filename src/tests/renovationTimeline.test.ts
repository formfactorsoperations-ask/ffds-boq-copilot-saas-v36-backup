/*
  A renovation's timeline (lib/renovation): a finished flat starts with a
  strip-out sized by the flat, and takes longer lived in. The Timeline builds it
  as a stage of its own (lib/scheduleBuilder); the proposal reads the Timeline
  (lib/playground/brief proposalTimeline).
*/
import { describe, it, expect } from 'vitest';
import { renovationPlan, renovationRulesOf, livedInDays, DEFAULT_RENOVATION } from '../../lib/renovation';
import { buildScheduleFromProject, estimateSiteWorkDays, resolveProjectProgramme } from '../../lib/scheduleBuilder';
import { proposalTimeline, proposalNotes, RENOVATION_NOTE } from '../../lib/playground/brief';

const flat = (extra: any = {}): any => ({ name: 'Green World', config: '2-BHK', area: 695, rooms: [], ...extra });
const start = new Date('2026-12-09T00:00:00');

describe('the rules', () => {
  it('defaults: a day per 100 sq ft, 4 to 12, and 25% longer lived in', () => {
    expect(renovationRulesOf(null)).toEqual(DEFAULT_RENOVATION);
    expect(renovationRulesOf({ renovation: { stripOutMin: 6, stripOutMax: 3, livedInPercent: -5 } } as any)).toEqual({ stripOutPer100: 1, stripOutMin: 6, stripOutMax: 6, livedInPercent: 25 });
  });

  it('a finished flat only; sized by its area, within the bounds', () => {
    expect(renovationPlan(flat({ propertyStatus: 'finished' }))).toMatchObject({ renovation: true, stripOutDays: 7, livedIn: false, livedInPercent: 0 });
    expect(renovationPlan(flat({ propertyStatus: 'finished', area: 250 })).stripOutDays).toBe(4);
    expect(renovationPlan(flat({ propertyStatus: 'finished', area: 2400 })).stripOutDays).toBe(12);
    expect(renovationPlan(flat({ propertyStatus: 'finished', area: 0, rooms: [{ name: 'A', size: 500 }, { name: 'B', size: 120 }] })).stripOutDays).toBe(7);
    expect(renovationPlan(flat({ propertyStatus: 'semi_finished' })).renovation).toBe(false);
    expect(renovationPlan(flat({ propertyStatus: 'raw_shell' })).stripOutDays).toBe(0);
  });

  it('lived in, the site work takes longer', () => {
    const p = renovationPlan(flat({ propertyStatus: 'finished', livedInDuringWork: true }));
    expect(p).toMatchObject({ livedIn: true, livedInPercent: 25 });
    expect(livedInDays(40, p)).toBe(50);
    expect(livedInDays(40, { livedInPercent: 0 })).toBe(40);
  });
});

describe('the Timeline', () => {
  it('a finished flat: a strip-out stage before civil work, with its own days; the rest as before', () => {
    const vacant = estimateSiteWorkDays(flat({ propertyStatus: 'semi_finished' }), []);
    const reno = estimateSiteWorkDays(flat({ propertyStatus: 'finished' }), []);
    expect(reno.workDays).toBe(vacant.workDays + 7);
    const s = buildScheduleFromProject(flat({ propertyStatus: 'finished' }), []);
    const strip = s.tasks.find(t => t.id === 'exec-strip-out')!;
    expect(strip).toMatchObject({ title: 'Strip-out & Debris Removal', workDays: 7, dependencies: ['exec-site-prelims'] });
    expect(s.tasks.find(t => t.id === 'exec-civil-demolition')!.dependencies).toEqual(['exec-strip-out']);
    const exec = s.tasks.filter(t => t.kind === 'execution').reduce((a, t) => a + t.workDays, 0);
    expect(exec).toBe(reno.workDays);
  });

  it('lived in, the shared stages stretch by the studio’s %; the strip-out does not', () => {
    const v = estimateSiteWorkDays(flat({ propertyStatus: 'finished' }), []);
    const l = estimateSiteWorkDays(flat({ propertyStatus: 'finished', livedInDuringWork: true }), [], { ...DEFAULT_RENOVATION, livedInPercent: 20 });
    expect(l.workDays - 7).toBe(Math.round((v.workDays - 7) * 1.2));
  });

  it('a raw shell or semi-finished flat has no strip-out', () => {
    const s = buildScheduleFromProject(flat({ propertyStatus: 'raw_shell' }), []);
    expect(s.tasks.some(t => t.id === 'exec-strip-out')).toBe(false);
    expect(s.tasks.find(t => t.id === 'exec-civil-demolition')!.dependencies).toEqual(['exec-site-prelims']);
  });

  it('the programme the proposal reads carries the strip-out as a site phase', () => {
    const p = resolveProjectProgramme({ projectContext: flat({ propertyStatus: 'finished' }), boq: [], todayISO: '2026-11-26' });
    expect(p.sitePhases.find(x => x.id === 'exec-strip-out')?.durationDays).toBe(7);
  });
});

describe('the proposal’s timeline', () => {
  const plan = renovationPlan(flat({ propertyStatus: 'finished' }));

  it('without a Timeline: the strip-out row, then civil and interiors', () => {
    const t = proposalTimeline({ start, config: '2-BHK', civil: true, civilDays: 12, renovation: plan });
    expect(t.rows.map(r => [r.name, r.days])).toEqual([['Site measurement', 6], ['Layout and design', 14], ['Detailed BOQ and agreement', 6], ['Strip-out and debris removal', 7], ['Civil, then interiors', 72]]);
    expect(t.siteDays).toBe(79);
    expect(proposalNotes(flat({ propertyStatus: 'finished' }), t).timeline[1]).toBe('Your home is a renovation. The timeline starts with 7 working days to take out what is there today and clear the debris. We confirm it after the site measurement.');
  });

  it('lived in, without a Timeline: the site work stretched, the strip-out not', () => {
    const lived = renovationPlan(flat({ propertyStatus: 'finished', livedInDuringWork: true }));
    const t = proposalTimeline({ start, config: '2-BHK', civil: true, civilDays: 12, renovation: lived });
    expect(t.siteDays).toBe(Math.round(72 * 1.25) + 7);
    expect(proposalNotes(flat({ propertyStatus: 'finished' }), t).timeline[1]).toMatch(/takes about 25% longer than in a vacant flat\./);
  });

  it('from the Timeline: its strip-out days; a Timeline made before has none, and the note says it is a vacant flat’s', () => {
    const t = proposalTimeline({ start, civil: false, civilDays: 12, renovation: plan, programme: { designWorkDays: 30, siteWorkDays: 60, sitePhases: [{ id: 'exec-site-prelims', durationDays: 3 }, { id: 'exec-strip-out', durationDays: 8 }] } });
    expect(t.rows.slice(-2).map(r => [r.name, r.days])).toEqual([['Strip-out and debris removal', 8], ['Work on site', 52]]);
    const old = proposalTimeline({ start, civil: false, civilDays: 12, renovation: plan, programme: { designWorkDays: 30, siteWorkDays: 60, sitePhases: [] } });
    expect(old.stripOutDays).toBe(0);
    expect(proposalNotes(flat({ propertyStatus: 'finished' }), old).timeline[1]).toBe(RENOVATION_NOTE);
  });

  it('not a renovation: as before', () => {
    const t = proposalTimeline({ start, config: '2-BHK', civil: false, civilDays: 12, renovation: renovationPlan(flat()) });
    expect(t.rows.map(r => r.name)).toEqual(['Site measurement', 'Layout and design', 'Detailed BOQ and agreement', 'Work on site']);
    expect(t.siteDays).toBe(60);
  });
});
