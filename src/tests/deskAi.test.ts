import { describe, it, expect } from 'vitest';
import {
  MAX_AI_CHANGES, REPEAT_MAX_DRAWINGS, changePrompt, freshRepeats, noteKey, noteRegion, notesToAsk, padRegion, parseChangeNames, parseRepeats, recentDrawingsOf, repeatLine, repeatPrompt,
  type PastNote,
} from '../../lib/deskAi';

/*
  Design Desk 2.0, the two AI features (lib/deskAi.ts): what is asked of the
  model, and how little of its answer is taken on trust.
*/

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 24);

describe('changes found for you: what is sent', () => {
  it('grows an outlined area a little and keeps it on the page', () => {
    const r = padRegion({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
    expect(r.x).toBeCloseTo(0.46); expect(r.y).toBeCloseTo(0.46); expect(r.w).toBeCloseTo(0.18); expect(r.h).toBeCloseTo(0.18);
    const edge = padRegion({ x: 0.98, y: 0, w: 0.02, h: 0.01 });
    expect(edge.x + edge.w).toBeLessThanOrEqual(1.000001);
    expect(edge.y).toBe(0);
  });

  it('looks around a pin, and at the whole of a box, an arrow or a sketch', () => {
    const pin = noteRegion({ t: 'pin', x: 0.5, y: 0.5 });
    expect(pin.w).toBeCloseTo(0.24); expect(pin.h).toBeCloseTo(0.24);
    const box = noteRegion({ t: 'rect', x: 0.2, y: 0.3, w: 0.2, h: 0.1 });
    expect(box.x).toBeCloseTo(0.15); expect(box.w).toBeCloseTo(0.3);
    const arrow = noteRegion({ t: 'arrow', x: 0.8, y: 0.8, x2: 0.6, y2: 0.7 });
    expect(arrow.x).toBeCloseTo(0.53); expect(arrow.y).toBeCloseTo(0.63);
    const pen = noteRegion({ t: 'pen', pts: [[0.1, 0.1], [0.3, 0.2]] });
    expect(pen.x).toBeCloseTo(0.04); expect(pen.w).toBeCloseTo(0.32);
  });

  it('asks about the areas by number and the notes by letter, never by a real id', () => {
    const p = changePrompt(2, [{ key: noteKey(0), text: 'Tall unit 600 deep,\n not 450' }, { key: noteKey(1), text: 'Skirting 100 high' }]);
    expect(p).toContain('There are 2 CHANGED AREAS');
    expect(p).toContain('NOTE A asked: Tall unit 600 deep, not 450');
    expect(p).toContain('NOTE B asked: Skirting 100 high');
    expect(p).toContain('Prefer "unsure" to a guess.');
    expect(changePrompt(0, [])).toContain('There are no changed areas to name.');
  });
});

describe('changes found for you: what is believed', () => {
  const ids = ['m7', 'm9'];

  it('keeps a name for each area sent and a verdict for each note sent', () => {
    const out = parseChangeNames(JSON.stringify({
      changes: [{ n: 1, name: 'tall unit moved left.' }, { n: 2, name: 'Dimension changed to 600' }],
      notes: [{ key: 'A', verdict: 'fixed', why: 'Depth now reads 600' }, { key: 'b', verdict: 'same', why: 'No skirting height shown' }],
    }), 2, ids);
    expect(out.names).toEqual({ 1: 'Tall unit moved left', 2: 'Dimension changed to 600' });
    expect(out.notes).toEqual({ m7: { verdict: 'fixed', why: 'Depth now reads 600' }, m9: { verdict: 'same', why: 'No skirting height shown' } });
  });

  it('drops an area or a note that was not sent, a made-up verdict and an empty name', () => {
    const out = parseChangeNames(JSON.stringify({
      changes: [{ n: 3, name: 'Not an area' }, { n: 0, name: 'Nor this' }, { n: 1, name: '   ' }, { n: 2, name: 'Shelf added' }, { n: 2, name: 'Said twice' }],
      notes: [{ key: 'C', verdict: 'fixed', why: 'no such note' }, { key: 'A', verdict: 'approved', why: 'not a verdict' }, { key: 'B', verdict: 'unsure' }],
    }), 2, ids);
    expect(out.names).toEqual({ 2: 'Shelf added' });
    expect(out.notes).toEqual({ m9: { verdict: 'unsure', why: '' } });
  });

  it('reads an answer wrapped in a code fence, and gives nothing for one that is not JSON', () => {
    expect(parseChangeNames('```json\n{"changes":[{"n":1,"name":"Note added"}]}\n```', 1, []).names).toEqual({ 1: 'Note added' });
    expect(parseChangeNames('I could not compare these.', 3, ids)).toEqual({ names: {}, notes: {} });
    expect(parseChangeNames('', 3, ids)).toEqual({ names: {}, notes: {} });
  });

  it('strips markup and clips a long name', () => {
    const out = parseChangeNames(JSON.stringify({ changes: [{ n: 1, name: `<b>${'x'.repeat(200)}</b>` }] }), MAX_AI_CHANGES, []);
    expect(out.names[1]).not.toMatch(/[<>]/);
    expect(out.names[1].length).toBeLessThanOrEqual(60);
  });
});

describe('repeat mistakes', () => {
  const rahul = 'rahul@studio.in';
  const row = (id: string, email: string, marks: number, daysAgo: number) => ({ id, projectId: 'p1', name: `Drawing ${id}`, review: { designer: { email }, marksTotal: marks, updatedAt: NOW - daysAgo * DAY } });
  const note = (n: number, drawing: string, text: string, daysAgo = n): PastNote => ({ id: `n${n}`, drawingId: `p1/${drawing}`, drawing, text, at: NOW - daysAgo * DAY });

  it("reads the designer's recent drawings that have notes, not the one being checked", () => {
    const rows = [row('a', rahul, 2, 3), row('b', rahul, 0, 4), row('c', 'priya@studio.in', 5, 1), row('d', 'RAHUL@studio.in', 1, 70), row('e', rahul, 1, 10), row('now', rahul, 3, 0)];
    expect(recentDrawingsOf(rows, 'Rahul@Studio.in', NOW, { projectId: 'p1', id: 'now' }).map((d) => d.id)).toEqual(['a', 'e']);
    expect(recentDrawingsOf(rows, null, NOW)).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => row(`x${i}`, rahul, 1, i));
    expect(recentDrawingsOf(many, rahul, NOW)).toHaveLength(REPEAT_MAX_DRAWINGS);
  });

  it('sends the notes of the last 60 days, newest first, numbered', () => {
    const asked = notesToAsk([note(1, 'A', 'Skirting height missing', 5), note(2, 'B', 'Old one', 80), note(3, 'C', '   ', 1), note(4, 'D', 'Hinge side not shown', 2)], NOW);
    expect(asked.map((n) => n.id)).toEqual(['n4', 'n1']);
    const p = repeatPrompt(asked);
    expect(p).toContain('1 | D | Hinge side not shown');
    expect(p).toContain('2 | A | Skirting height missing');
    expect(p).toContain('fewer than three different drawings');
  });

  const asked = [
    note(1, 'Master wardrobe', 'Skirting height not marked'), note(2, 'Kitchen plan', 'Mark the skirting height'), note(3, 'Living TV wall', 'No skirting height'),
    note(4, 'Kitchen plan', 'Skirting again'), note(5, 'Foyer', 'Hinge side not shown'), note(6, 'Pooja', 'Show the hinge side'),
  ];

  it('counts the drawings itself, and keeps only a mistake noted on three or more', () => {
    const out = parseRepeats(JSON.stringify({ repeats: [
      { title: 'skirting height not marked.', note: 'Mark the skirting height.', ids: [1, 2, 3, 4], drawings: 99 },
      { title: 'Hinge side not shown', note: 'Show the hinge side.', ids: [5, 6] },
    ] }), asked);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Skirting height not marked', drawings: 3, notes: 4, suggestion: 'Mark the skirting height.', examples: ['Master wardrobe', 'Kitchen plan', 'Living TV wall'] });
  });

  it('ignores numbers that were never sent, and lets a note count for one mistake only', () => {
    const out = parseRepeats(JSON.stringify({ repeats: [
      { title: 'Skirting', note: 'x', ids: [1, 2, 3, 41, -2, 'abc'] },
      { title: 'The same notes again', note: 'y', ids: [1, 2, 3] },
      { title: '', note: 'no title', ids: [1, 2, 3] },
    ] }), asked);
    expect(out.map((r) => r.title)).toEqual(['Skirting']);
    expect(out[0].notes).toBe(3);
    expect(parseRepeats('not json', asked)).toEqual([]);
    expect(parseRepeats('{"repeats":"none"}', asked)).toEqual([]);
  });

  it('says it in one sentence, and Home shows only what is recent and has something to say', () => {
    const r = parseRepeats(JSON.stringify({ repeats: [{ title: 'Skirting height not marked', note: 'Mark it.', ids: [1, 2, 3] }] }), asked)[0];
    expect(repeatLine('Rahul Verma', r)).toBe('Rahul has had this note on 3 drawings in the last 60 days (Master wardrobe, Kitchen plan, Living TV wall). Check it on this one.');
    const memos = [
      { email: 'a@x', name: 'A', at: NOW - DAY, repeats: [{ ...r, drawings: 3 }] },
      { email: 'b@x', name: 'B', at: NOW - 2 * DAY, repeats: [{ ...r, drawings: 5 }] },
      { email: 'c@x', name: 'C', at: NOW - DAY, repeats: [] },
      { email: 'd@x', name: 'D', at: NOW - 9 * DAY, repeats: [r] },
    ];
    expect(freshRepeats(memos, NOW).map((m) => m.email)).toEqual(['b@x', 'a@x']);
  });
});
