import { describe, it, expect } from 'vitest';
import { cleanChanges, cleanCost, costLine, costTotal, portalDesignRecord, type DesignMeeting, type MeetingChange } from '../../lib/designMeeting';
import { clock, minutesOf, minutesText, nextRoundCharged, roundsLine } from '../../lib/meetingMinutes';

/*
  Design Desk 2.0, Phase 2: the minutes that write themselves
  (lib/meetingMinutes.ts) and the cost estimate on a client's change
  (lib/designMeeting.ts: ChangeCost).
*/

const who = { uid: 'h', email: 'head@studio.in', name: 'Anish' };
const sheet = (id: string, name: string) => ({ drawingId: id, name, versionId: 'v1', versionNo: 2, pdfPath: 'x.pdf', thumbPath: null, pageCount: 1 });
const change = (n: number, drawingId: string, text: string, cost?: MeetingChange['cost']): MeetingChange => ({ n, drawingId, page: 0, shape: { t: 'pin', x: 0.4, y: 0.4 }, text, ...(cost ? { cost } : {}) });
const meeting = (over: Partial<DesignMeeting> = {}): DesignMeeting => ({
  id: 'm1', orgId: 's', projectId: 'p1', projectName: 'Mehta Residence', state: 'OPEN', rev: 1, attendees: 'Mrs Mehta', includedRounds: 2,
  startedAt: 1, startedBy: who, closedAt: null, closedBy: null,
  rooms: [
    { room: 'Living & dining', sheets: [sheet('l1', 'Living false ceiling')], outcome: null, changes: [], round: 0, charge: null },
    { room: 'Kitchen', sheets: [sheet('k1', 'Kitchen plan')], outcome: null, changes: [], round: 0, charge: null },
    { room: 'General / Project-Wide', sheets: [sheet('a1', 'Layout plan')], outcome: null, changes: [], round: 0, charge: null },
  ],
  ...over,
});

describe('the cost estimate on a change', () => {
  it('keeps a direction, a rounded figure and a short note, and nothing else', () => {
    expect(cleanCost({ kind: 'more', amount: '6500.4', note: '  dimmer driver  ', junk: 1 })).toEqual({ kind: 'more', amount: 6500, note: 'dimmer driver' });
    expect(cleanCost({ kind: 'none', amount: 900 })).toEqual({ kind: 'none', amount: null, note: null });
    expect(cleanCost({ kind: 'less', amount: -5 })).toEqual({ kind: 'less', amount: null, note: null });
    expect(cleanCost({ kind: 'more', amount: 99_000_000 })?.amount).toBeNull();
    expect(cleanCost({ kind: 'free' })).toBeNull();
    expect(cleanCost('6500')).toBeNull();
    expect(cleanCost(null)).toBeNull();
  });

  it('reads as one plain line', () => {
    expect(costLine({ kind: 'more', amount: 6500, note: 'dimmer driver and switch' })).toBe('About +₹6,500 on the BOQ (dimmer driver and switch)');
    expect(costLine({ kind: 'less', amount: 125000, note: null })).toBe('About −₹1,25,000 on the BOQ');
    expect(costLine({ kind: 'none', amount: null, note: null })).toBe('No cost change on the BOQ');
    expect(costLine({ kind: 'more', amount: null, note: null })).toBe('Costs more on the BOQ, figure to follow');
    expect(costLine(null)).toBe('');
  });

  it('adds up more and less, and counts the ones with no figure', () => {
    const t = costTotal([change(1, 'l1', 'a', { kind: 'more', amount: 6500, note: null }), change(2, 'l1', 'b', { kind: 'less', amount: 2000, note: null }), change(3, 'l1', 'c', { kind: 'more', amount: null, note: null }), change(4, 'l1', 'd', { kind: 'none', amount: null, note: null }), change(5, 'l1', 'e')]);
    expect(t).toEqual({ net: 4500, open: 1, any: true });
    expect(costTotal([change(1, 'l1', 'a')]).any).toBe(false);
  });

  it('is saved with the change, and a change without one stays as it was', () => {
    const out = cleanChanges([{ ...change(1, 'l1', 'Cove on a dimmer'), cost: { kind: 'more', amount: 6500, note: 'dimmer' } }, change(2, 'l1', 'Fan in the centre'), { ...change(3, 'zz', 'not this room') }], [{ drawingId: 'l1' }]);
    expect(out).toHaveLength(2);
    expect(out[0].cost).toEqual({ kind: 'more', amount: 6500, note: 'dimmer' });
    expect('cost' in out[1]).toBe(false);
  });

  it("never reaches the client's portal record", () => {
    const m = meeting({ state: 'CLOSED', closedAt: 5, rooms: [{ room: 'Living & dining', sheets: [sheet('l1', 'Living false ceiling')], outcome: 'changes', changes: [change(1, 'l1', 'Cove on a dimmer', { kind: 'more', amount: 6500, note: 'driver and switch' })], round: 1, charge: null }] });
    expect(JSON.stringify(portalDesignRecord([m]))).not.toMatch(/6500|cost|driver/);
    expect(portalDesignRecord([m])[0].rooms[0].changes).toEqual(['Cove on a dimmer']);
  });
});

describe('minutes that write themselves', () => {
  it('start with who attended and how the client is seeing the drawings', () => {
    expect(minutesOf({ meeting: meeting(), way: 'call' })).toEqual([{ kind: 'start', text: 'Meeting started with Mrs Mehta. On Google Meet or Zoom.' }]);
    expect(minutesOf({ meeting: meeting({ attendees: '' }) })[0].text).toBe('Meeting started.');
  });

  it('gain a line as each change is pinned, before the room is decided', () => {
    const lines = minutesOf({ meeting: meeting(), live: { Kitchen: [change(1, 'k1', 'Tall unit in a darker laminate')] } });
    expect(lines.map((l) => l.text)).toEqual(['Meeting started with Mrs Mehta.', 'Kitchen, change 1 on Kitchen plan: Tall unit in a darker laminate']);
  });

  it('say what each room ended with, and call the whole-home room by its plain name', () => {
    const m = meeting();
    m.rooms[0] = { ...m.rooms[0], outcome: 'agreed' };
    m.rooms[1] = { ...m.rooms[1], outcome: 'changes', changes: [change(1, 'k1', 'Tall unit in a darker laminate'), change(2, 'k1', 'Hob to the left')] };
    const text = minutesOf({ meeting: m, ending: true }).map((l) => l.text);
    expect(text).toContain('Living & dining: the client is happy with Living false ceiling v2 as shown.');
    expect(text).toContain('Kitchen: 2 changes to make. They go to the Design Head, pinned on the drawing.');
    expect(text).toContain('Whole home: no decision at this meeting. It can be shown again at the next one.');
  });

  it('mark rounds, billing and costs as studio only, and leave them out of what is copied', () => {
    const m = meeting();
    m.rooms[0] = { ...m.rooms[0], outcome: 'changes', changes: [change(1, 'l1', 'Cove light on a dimmer', { kind: 'more', amount: 6500, note: 'dimmer driver' })] };
    const lines = minutesOf({ meeting: m, used: { 'Living & dining': 2 }, charges: { 'Living & dining': 'to_bill' } });
    const studio = lines.filter((l) => l.studio).map((l) => l.text);
    expect(studio).toEqual([
      'Change 1: about +₹6,500 on the BOQ (dimmer driver). An estimate, to confirm.',
      'Living & dining: revision round 3 started. 2 rounds are included, so it can be charged.',
      'Living & dining: round 3 goes on the list to bill.',
    ]);
    const copied = minutesText('Design meeting · Mehta Residence · 24 Nov', lines);
    expect(copied).toContain('- Living & dining, change 1 on Living false ceiling: Cove light on a dimmer');
    expect(copied).not.toMatch(/₹|round 3|bill/);
    expect(minutesText('x', lines, true)).toMatch(/round 3 goes on the list to bill/);
  });

  it('record a meeting that ended with no room decided, and keep it out of what the client sees', () => {
    const m = meeting({ state: 'CLOSED', closedAt: 9 });
    const text = minutesOf({ meeting: m }).map((l) => l.text);
    expect(text).toEqual([
      'Meeting started with Mrs Mehta.',
      'Living & dining: no decision at this meeting. It can be shown again at the next one.',
      'Kitchen: no decision at this meeting. It can be shown again at the next one.',
      'Whole home: no decision at this meeting. It can be shown again at the next one.',
      'Meeting saved with no room decided.',
    ]);
    /* Nothing was recorded for the client, so their portal has no entry for it; a meeting with a decision still shows. */
    const decided = meeting({ id: 'm2', state: 'CLOSED', closedAt: 12 });
    decided.rooms[0] = { ...decided.rooms[0], outcome: 'agreed' };
    expect(portalDesignRecord([m])).toEqual([]);
    expect(portalDesignRecord([m, decided]).map((x) => x.id)).toEqual(['m2']);
  });

  it('read the same from a saved meeting, with the waiver and the signature', () => {
    const m = meeting({ state: 'CLOSED', closedAt: 9, confirmation: { via: 'studio', name: 'Mrs Mehta', email: null, uid: null, at: 10 } });
    m.rooms[0] = { ...m.rooms[0], outcome: 'changes', changes: [change(1, 'l1', 'Warmer light')], round: 3, charge: { status: 'waived', fee: null, note: null, ref: null, decidedBy: who, decidedAt: 9, updatedBy: who, updatedAt: 9 } };
    m.rooms[1] = { ...m.rooms[1], outcome: 'agreed' };
    const text = minutesOf({ meeting: m }).map((l) => l.text);
    expect(text).toContain('Living & dining: round 3 is waived this time.');
    expect(text).toContain("Meeting saved. 1 room waits for the client's approval in writing.");
    expect(text[text.length - 1]).toBe("Mrs Mehta signed the record on the studio's screen.");
  });
});

describe('the round counter and the clock', () => {
  it('says how many included rounds a room has used', () => {
    expect(roundsLine(0, 2)).toBe('0 of 2 included rounds used');
    expect(roundsLine(2, 2)).toBe('2 of 2 included rounds used');
    expect(roundsLine(1, 1)).toBe('1 of 1 included round used');
    expect(roundsLine(3, 2)).toBe('3 rounds used, 2 included');
  });
  it('warns when the next change starts a round that can be charged', () => {
    expect(nextRoundCharged(1, 2)).toBe(false);
    expect(nextRoundCharged(2, 2)).toBe(true);
    expect(nextRoundCharged(0, 0)).toBe(true);
  });
  it('counts the meeting in minutes and seconds, then hours', () => {
    expect(clock(0)).toBe('00:00');
    expect(clock(462_000)).toBe('07:42');
    expect(clock(4_062_000)).toBe('1:07:42');
    expect(clock(-5)).toBe('00:00');
  });
});
