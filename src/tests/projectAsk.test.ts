/*
  Ask this project and its promises (smart workspace, PR 4; owner, 27 Nov
  2026): the record the AI reads, the answer made safe, when a search is a
  question, and what is promised and still open (lib/projectAsk).
*/
import { describe, it, expect } from 'vitest';
import { askRecord, normaliseAnswer, looksLikeQuestion, promisesOf, PROJECT_ASK_INSTRUCTIONS } from '../../lib/projectAsk';

const SCREENS = [{ route: 'record-decision', name: 'Record Decision' }, { route: 'payment-calc', name: 'Money' }];

describe('askRecord', () => {
  it('carries the brief, the recent story and open snags, and the screens to point at', () => {
    const story: any[] = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, at: Date.parse('2026-11-01') + i * 3600000, kind: 'event', side: 'studio', text: `item ${i}`, projectId: 'p1', convs: ['plan'], route: null }));
    const r = askRecord({
      brief: { id: 'p1' } as any, story,
      snags: [{ roomName: 'Hall', description: 'Ceiling off level', severity: 'high', status: 'open', raisedAt: Date.parse('2026-11-20') }, { roomName: 'Hall', description: 'done', status: 'verified' }],
      screens: SCREENS,
    });
    expect(r.story).toHaveLength(80);
    expect(r.story[79].text).toBe('item 99');
    expect(r.snags).toEqual([{ room: 'Hall', text: 'Ceiling off level', severity: 'high', status: 'open', raised: '2026-11-20' }]);
    expect(r.screens).toEqual(SCREENS);
  });

  it('is told never to write to the client and to keep to the record', () => {
    expect(PROJECT_ASK_INSTRUCTIONS).toMatch(/Never write a message to the client/);
    expect(PROJECT_ASK_INSTRUCTIONS).toMatch(/only the JSON record/);
  });
});

describe('normaliseAnswer', () => {
  it('keeps only screens this person may open, and says so when there is no answer', () => {
    const a = normaliseAnswer({ answer: 'On 18 Nov the client chose acrylic shutters.', sources: ['Decision: Kitchen shutters'], routes: ['record-decision', 'execution-agreement', 'record-decision'] }, SCREENS);
    expect(a).toEqual({ answer: 'On 18 Nov the client chose acrylic shutters.', sources: ['Decision: Kitchen shutters'], routes: ['record-decision'] });
    expect(normaliseAnswer({}, SCREENS)).toEqual({ answer: "The records here don't say.", sources: [], routes: [] });
  });
});

describe('looksLikeQuestion', () => {
  it('tells a question from a screen name', () => {
    expect(looksLikeQuestion('What did the client decide about kitchen shutters')).toBe(true);
    expect(looksLikeQuestion('who approved the living room?')).toBe(true);
    expect(looksLikeQuestion('Money')).toBe(false);
    expect(looksLikeQuestion('Pricing & Tiers')).toBe(false);
    expect(looksLikeQuestion('scope strategy')).toBe(false);
  });
});

describe('promisesOf', () => {
  const fu = (id: string, note: string, next: string | null, due: string, done = false): any => ({
    id, projectId: 'p1', at: 1, by: 'm@ff.in', byName: 'Mayuri', channel: 'call', outcome: 'info', note,
    next: next ? { text: next, ownerEmail: 'm@ff.in', ownerName: 'Mayuri', due } : undefined, nextDone: done,
  });
  const p = promisesOf({
    today: '2026-11-27',
    followUps: [
      fu('a', 'We promised: Send the shutter samples', 'Send the shutter samples', '2026-11-25'),
      fu('b', 'Client promised: Pay the balance by Friday', 'Check: Pay the balance by Friday', '2026-11-29'),
      fu('c', 'Date to remember: family visit', 'Remember: family visit', '2026-12-10'),
      fu('d', 'We promised: done already', 'Old thing', '2026-11-01', true),
      fu('e', 'Client asked: which handles', 'Answer: which handles', '2026-11-28'),
    ],
    actions: [
      { text: 'Share revised kitchen drawings', side: 'studio', ownerName: 'Riya', due: '2026-11-30', from: 'MoM-014' },
      { text: 'Confirm the marble choice', side: 'client', ownerName: null, due: '2026-11-20', from: 'MoM-014' },
      { text: 'Vendor to visit', side: 'other', ownerName: null, due: null, from: 'MoM-014' },
    ],
  });

  it("splits ours from the client's, leaving out dates to remember and what is done", () => {
    expect(p.ours.map((x) => x.text)).toEqual(['Send the shutter samples', 'Answer: which handles', 'Share revised kitchen drawings']);
    expect(p.theirs.map((x) => x.text)).toEqual(['Confirm the marble choice', 'Pay the balance by Friday']);
  });

  it('puts late ones first and counts them', () => {
    expect(p.ours[0].late).toBe(true);
    expect(p.theirs[0].late).toBe(true);
    expect(p.late).toBe(2);
  });

  it('says where each came from, so a follow-up can be marked done here', () => {
    expect(p.ours[0].from).toEqual({ kind: 'follow-up', followUpId: 'a', by: 'Mayuri' });
    expect(p.ours[2].from).toEqual({ kind: 'minutes', ref: 'MoM-014' });
  });
});
