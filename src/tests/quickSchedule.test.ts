import { describe, it, expect } from 'vitest';
import { parseMilestones, draftStages, QUICK_EXAMPLE } from '../../lib/quickSchedule';
import { trackTotal } from '../../lib/moneyBoard';

let n = 0;
const newId = () => `q${n++}`;
const taxable = { design: 300000, execution: 2000000 };
const draft = (text: string, current: any[] = [], feeOnly = false) => draftStages({ text, current, taxable, feeOnly, newId });
const pcts = (d: ReturnType<typeof draft>, t: string) => d.milestones.filter(m => m.type === t).map(m => m.percentage);

describe('reading what the studio typed', () => {
  it('takes lines, commas, headings, shares, amounts and steps', () => {
    const lines = parseMilestones('Design: Concept 25%, 3D\n- Civil: demolition, masonry\nHandover ₹1,00,000\nFinishing 2.5L');
    expect(lines.map(l => [l.name, l.track, l.pct, l.amount])).toEqual([
      ['Concept', 'design', 25, undefined],
      ['3D', 'design', undefined, undefined],
      ['Civil', 'execution', undefined, undefined],
      ['Handover', 'execution', undefined, 100000],
      ['Finishing', 'execution', undefined, 250000],
    ]);
    expect(lines[2].steps).toEqual(['demolition', 'masonry']);
  });
  it('puts everything on design for a fee-only project', () => {
    expect(parseMilestones('Concept, Material, Handover', true).every(l => l.track === 'design')).toBe(true);
  });
});

describe('working out the stages', () => {
  it('shares what is left by what each stage usually carries, and each track makes 100%', () => {
    const d = draft(QUICK_EXAMPLE);
    expect(pcts(d, 'design')).toEqual([25, 40, 35]);
    expect(trackTotal(d.milestones.filter(m => m.type === 'design'), taxable.design).whole).toBe(true);
    expect(trackTotal(d.milestones.filter(m => m.type === 'execution'), taxable.execution).whole).toBe(true);
    const handover = d.milestones.find(m => m.name === 'Handover')!;
    expect(handover).toMatchObject({ isFixedAmount: true, fixedAmount: 100000, isHandoverAdvance: true, trigger: 'On completion of all work' });
    expect(d.milestones.every(m => (m.subSteps || []).length > 0 && m.trigger && m.unlocks)).toBe(true);
    expect(d.warnings).toEqual([]);
  });

  it('works from names alone', () => {
    const d = draft('Advance, 3D design, Drawings, Material, Civil, Painting, Handover');
    expect(d.milestones.map(m => m.type)).toEqual(['design', 'design', 'design', 'execution', 'execution', 'execution', 'execution']);
    expect(pcts(d, 'design').reduce((s, v) => s + v, 0)).toBe(100);
    expect(pcts(d, 'execution').reduce((s, v) => s + v, 0)).toBe(100);
    expect(d.stages[0].kind).toBe('concept');
  });

  it('keeps paid and invoiced milestones and shares only what is left', () => {
    const current: any[] = [
      { id: 'd1', type: 'design', name: 'Sign-up', percentage: 25, status: 'paid' },
      { id: 'd2', type: 'design', name: 'Layouts', percentage: 75, status: 'pending', date: '2026-12-01' },
      { id: 'e1', type: 'execution', name: 'Material', percentage: 100, status: 'pending' },
    ];
    const d = draft('Design: Layouts, GFC drawings', current);
    expect(d.milestones.filter(m => m.type === 'design').map(m => [m.id, m.percentage])).toEqual([['d1', 25], ['d2', 40], [expect.any(String), 35]]);
    expect(d.milestones.find(m => m.id === 'd2')!.date).toBe('2026-12-01');
    expect(d.untouched).toEqual(['execution']);
    expect(d.milestones.find(m => m.id === 'e1')).toBe(current[2]);
  });

  it('says when typed shares go over 100%', () => {
    expect(draft('Design: Concept 60%, 3D 50%').warnings[0]).toMatch(/adds up to 110%/);
  });
});

describe('headings', () => {
  it('a heading on its own line holds until the next one', () => {
    const lines = parseMilestones('Design\nStage A\nStage B\nExecution:\nStage C');
    expect(lines.map(l => l.track)).toEqual(['design', 'design', 'execution']);
  });
});
