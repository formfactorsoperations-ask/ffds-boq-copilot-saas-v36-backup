/*
  Which options take each Standard template item.

  A template lists a room's items once. The owner marks each for the options
  that take it; unmarked means all three, so a template saved before this reads
  as it did. The generator leaves an item out of an option that does not take it.
*/
import { describe, it, expect } from 'vitest';
import { INITIAL_BANK } from '../../constants';
import { generateStandardPackages, INITIAL_TEMPLATES } from '../../lib/standardPackages';
import { OPTIONS_KEY, roomScopesOf, gradesFor, withGrades, prunedMarks, roleOf, optionMarks } from '../../lib/templateOptions';
import { quickBuild } from '../../lib/playground/quickBuild';
import type { Item } from '../../types';

const bank = INITIAL_BANK as Item[];
const name = (id: string) => bank.find(i => i.id === id)?.name || id;
let n = 0;
const rooms = quickBuild({ size: '3-BHK', carpet: 1050, bank, newId: () => `r${++n}` }).rooms;
const ctx: any = { name: 'Dummy', type: 'TURNKEY', area: 1050, config: '3-BHK', rooms, ceilingHeight: 9.5 };
const base = INITIAL_TEMPLATES['3-BHK'];
const lines = (templates: any) => generateStandardPackages(ctx, bank, templates, 'tiered').map(t => t.boq.map(l => `${l.bankId}@${l.roomId}`).sort());

describe('marking an item for options', () => {
  it('an unmarked item is taken by all three, and the template is not changed', () => {
    expect(gradesFor(base, 'bedroom', 'gen-014')).toEqual(['E', 'C', 'P']);
    expect(roleOf(['E', 'C', 'P'])).toBe('must');
    expect(OPTIONS_KEY in base).toBe(false);
  });

  it('saves the mark beside the room scopes and reads it back', () => {
    const t = withGrades(base, 'bedroom', 'gen-016', ['C', 'P']);
    expect(t[OPTIONS_KEY]).toEqual(['bedroom|gen-016|CP']);
    expect(gradesFor(t, 'bedroom', 'gen-016')).toEqual(['C', 'P']);
    expect(roleOf(gradesFor(t, 'bedroom', 'gen-016'))).toBe('extra');
    expect(roomScopesOf(t)).toEqual(base);
  });

  it('marking all three again clears it, and none keeps the item listed and left out', () => {
    const t = withGrades(base, 'bedroom', 'gen-016', ['P']);
    expect(OPTIONS_KEY in withGrades(t, 'bedroom', 'gen-016', ['P', 'E', 'C'])).toBe(false);
    const none = withGrades(base, 'bedroom', 'gen-016', []);
    expect(gradesFor(none, 'bedroom', 'gen-016')).toEqual([]);
    expect(roleOf([])).toBe('none');
    expect(roomScopesOf(none).bedroom).toContain('gen-016');
  });

  it('a mark is per room scope', () => {
    const t = withGrades({ ...base, living: [...base.living, 'gen-016'] }, 'living', 'gen-016', ['P']);
    expect(gradesFor(t, 'living', 'gen-016')).toEqual(['P']);
    expect(gradesFor(t, 'bedroom', 'gen-016')).toEqual(['E', 'C', 'P']);
  });

  it('drops the mark of an item taken off its scope', () => {
    const t = withGrades(base, 'bedroom', 'gen-016', ['P']);
    const off = prunedMarks({ ...t, bedroom: t.bedroom.filter(i => i !== 'gen-016') });
    expect(optionMarks(off).size).toBe(0);
    expect(OPTIONS_KEY in off).toBe(false);
  });
});

describe('a generated BOQ follows the marks', () => {
  it('with no marks every option gets what it got before', () => {
    expect(lines({ ...INITIAL_TEMPLATES, '3-BHK': { ...base } })).toEqual(lines(INITIAL_TEMPLATES));
  });

  it('leaves an item out of the options that do not take it, in every room of the scope', () => {
    const marked = { ...INITIAL_TEMPLATES, '3-BHK': withGrades(base, 'bedroom', 'gen-016', ['C', 'P']) };
    const [e, c, p] = lines(marked);
    const has = (l: string[]) => l.filter(x => x.startsWith('gen-016@')).length;
    expect(name('gen-016')).toBe('HEADBOARD');
    expect([has(e), has(c), has(p)]).toEqual([0, 3, 3]);
  });

  it('an item marked for no option is in none', () => {
    const marked = { ...INITIAL_TEMPLATES, '3-BHK': withGrades(base, 'general', 'gen-027', []) };
    lines(marked).forEach(l => expect(l.some(x => x.startsWith('gen-027@'))).toBe(false));
  });

  it('never reads the marks as a room', () => {
    const marked = { ...INITIAL_TEMPLATES, '3-BHK': withGrades(base, 'bedroom', 'gen-016', ['P']) };
    generateStandardPackages({ ...ctx, rooms: [] }, bank, marked, 'tiered').forEach(t => {
      expect(t.projectContext.rooms.some(r => /options/i.test(r.name))).toBe(false);
      expect(t.boq.some(l => /options/i.test(l.roomId || ''))).toBe(false);
    });
  });

  it('a built-in extra the studio lists is the template’s to place', () => {
    // Curtains go into Complete Harmony's living room and bedrooms by a rule in code. Listed in the living scope
    // and marked for no option, they are in none.
    const before = lines(INITIAL_TEMPLATES)[2].filter(x => x.startsWith('gen-045@')).length;
    expect(before).toBeGreaterThan(0);
    const listed = withGrades({ ...base, living: [...base.living, 'gen-045'] }, 'living', 'gen-045', []);
    lines({ ...INITIAL_TEMPLATES, '3-BHK': listed }).forEach(l => expect(l.some(x => x.startsWith('gen-045@'))).toBe(false));
  });
});
