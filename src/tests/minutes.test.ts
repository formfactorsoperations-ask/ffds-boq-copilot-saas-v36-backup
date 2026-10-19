import { describe, it, expect } from 'vitest';
import {
  toLegacy, fromLegacy, fromStructured, lineRefs, checksOf, readyToSend, flowStep, statusChip, diffTopics,
  clientView, cleanCorrections, correctionText, openFromEarlier, guessKind, queueScopeLines, withQueueState,
  fullTrail, clientContactOf, isMinutesLead, dueFromKey, keyOfDue, quickDues,
  type MinutesTopic, type MinutesLine,
} from '../../lib/minutes';

const NOW = new Date('2026-10-12T16:00:00+05:30').getTime();
const DUE = dueFromKey('2026-10-15')!;

const line = (over: Partial<MinutesLine>): MinutesLine => ({ id: Math.random().toString(36).slice(2), kind: 'note', text: 'x', ...over });
const topics = (): MinutesTopic[] => [
  { id: 't1', title: 'Kitchen layout', lines: [
    line({ id: 'd1', kind: 'decision', text: 'L-shaped kitchen approved.' }),
    line({ id: 'a1', kind: 'action', text: 'Share the revised elevation.', owner: { side: 'ffds', name: 'Tanvi' }, due: DUE, flags: { drawing: true } }),
  ] },
  { id: 't2', title: 'Living room', lines: [
    line({ id: 'q1', kind: 'question', text: 'Can the AC drain go behind the TV wall?', owner: { side: 'vendor', name: 'Sharma Carpentry' }, due: DUE }),
    line({ id: 'q2', kind: 'question', text: 'Warm or neutral lights?' }),
    line({ id: 'n1', kind: 'note', text: 'Client prefers 3000K.' }),
    line({ id: 'a2', kind: 'action', text: 'Pick the handle finish.', owner: { side: 'client', name: 'Mrs Naik' }, due: DUE }),
  ] },
];

describe('references', () => {
  it('numbers decisions D1… and owned actions and questions A1… in reading order', () => {
    expect(lineRefs(topics())).toEqual({ d1: 'D1', a1: 'A1', q1: 'A2', a2: 'A3' });
  });
});

describe('older readers', () => {
  it('writes the lines out as decisions, actions and notes', () => {
    const out = toLegacy(topics(), [
      { momId: 'm0', ref: 'MOM-2026-006', actionId: 'x', text: 'Confirm the appliance list', ownerName: 'Mrs Naik', outcome: 'open' },
      { momId: 'm0', ref: 'MOM-2026-006', actionId: 'y', text: 'Lighting layout', ownerName: 'Tanvi', outcome: 'done' },
    ]);
    expect(out.decisions).toEqual([{ id: 'd1', text: 'Kitchen layout: L-shaped kitchen approved.' }]);
    expect(out.actionItems.map((a) => [a.id, a.owner, a.ownerName, a.dueDate])).toEqual([
      ['a1', 'ffds', 'Tanvi', DUE], ['q1', 'vendor', 'Sharma Carpentry', DUE], ['a2', 'client', 'Mrs Naik', DUE],
    ]);
    expect(out.actionItems[0].flags).toEqual({ scope: false, drawing: true, siteCondition: false, cost: false });
    expect(out.actionItems[1].text).toBe('Open question: Can the AC drain go behind the TV wall?');
    expect(out.notes.map((n) => n.text)).toEqual(['Living room: Open question: Warm or neutral lights?', 'Living room: Client prefers 3000K.']);
    expect(out.carriedForward).toEqual([{ text: 'Confirm the appliance list', ref: 'MOM-2026-006', owner: 'Mrs Naik' }]);
  });
  it('leaves out empty lines', () => {
    expect(toLegacy([{ id: 't', title: '', lines: [line({ kind: 'decision', text: '  ' })] }]).decisions).toEqual([]);
  });
  it('reads older minutes as one "Discussion" topic, worded as they were', () => {
    const t = fromLegacy({ decisions: [{ id: 'd', text: 'Go with oak.' }], actionItems: [{ id: 'a', text: 'Send drawing', owner: 'ffds', ownerName: 'Tanvi', dueDate: DUE, status: 'done' }], notes: [{ id: 'n', text: 'Warm lights' }] });
    expect(t).toHaveLength(1);
    expect(t[0].title).toBe('Discussion');
    expect(t[0].lines.map((l) => [l.kind, l.text, l.owner?.name, l.status])).toEqual([
      ['decision', 'Go with oak.', undefined, undefined], ['action', 'Send drawing', 'Tanvi', 'done'], ['note', 'Warm lights', undefined, undefined],
    ]);
  });
});

describe('notes into points', () => {
  it('keeps the topics the notes gave, every line marked to check', () => {
    const t = fromStructured({ topics: [{ title: 'Wardrobe', lines: [{ kind: 'decision', text: 'Fluted glass' }, { kind: 'action', text: 'Pick handle', owner: 'client', ownerName: 'Mrs Naik' }, { kind: 'odd', text: 'Hmm' }, { text: '' }] }] });
    expect(t[0].title).toBe('Wardrobe');
    expect(t[0].lines.map((l) => [l.kind, l.fromNotes, l.owner?.side])).toEqual([['decision', true, undefined], ['action', true, 'client'], ['note', true, undefined]]);
  });
  it('reads the older shape under one topic', () => {
    const t = fromStructured({ decisions: [{ text: 'A' }], actionItems: [{ text: 'B', owner: 'ffds', ownerName: '' }], notes: [] });
    expect(t[0].lines.map((l) => [l.kind, l.owner])).toEqual([['decision', undefined], ['action', null]]);
  });
  it('sorts a typed point by its words', () => {
    expect(guessKind('Client to send tile choice by Friday')).toBe('action');
    expect(guessKind('Can the AC drain be rerouted?')).toBe('question');
    expect(guessKind('L-shaped kitchen approved')).toBe('decision');
    expect(guessKind('Family of four')).toBe('note');
  });
});

describe('before you send', () => {
  it('blocks on an action with no owner or date, and on unchecked points', () => {
    const t = topics();
    t[0].lines[1] = { ...t[0].lines[1], owner: null, due: null, fromNotes: true };
    const c = checksOf({ topics: t, attendees: [{ name: 'A', side: 'client' }] });
    expect(readyToSend(c)).toBe(false);
    expect(c.filter((x) => !x.ok).map((x) => x.text)).toEqual([
      '1 action has no owner', '1 action has no due date', '1 point from notes not checked yet', '"In brief" is empty', 'No next meeting set',
    ]);
  });
  it('is ready when only the nice-to-haves are missing', () => {
    expect(readyToSend(checksOf({ topics: topics() }))).toBe(true);
  });
  it('wants last meeting\'s actions marked', () => {
    const carried = [{ momId: 'm', ref: 'R', actionId: 'x', text: 'T', ownerName: 'O', outcome: null }];
    expect(readyToSend(checksOf({ topics: topics(), carried }))).toBe(false);
    expect(readyToSend(checksOf({ topics: topics(), carried: [{ ...carried[0], outcome: 'done' as const }] }))).toBe(true);
  });
  it('wants at least one point', () => {
    expect(readyToSend(checksOf({ topics: [] }))).toBe(false);
  });
});

describe('the flow', () => {
  it('maps each status to its step', () => {
    expect(flowStep({ status: 'draft' })).toBe(0);
    expect(flowStep({ status: 'pending_review' })).toBe(1);
    expect(flowStep({ status: 'finalised' })).toBe(2);
    expect(flowStep({ status: 'shared' })).toBe(3);
    expect(flowStep({ status: 'acknowledged' })).toBe(4);
    expect(flowStep({ status: 'correction_requested', revisionStage: 'pending_review' })).toBe(1);
  });
  it('names the status as people say it', () => {
    expect(statusChip({ status: 'pending_review' }, 'Anish').label).toBe('With Anish');
    expect(statusChip({ status: 'draft', trail: [{ step: 'returned', at: 1, by: 'a', byName: 'A' }] } as any).label).toBe('Returned with notes');
    expect(statusChip({ status: 'shared' }).label).toBe('Waiting for client');
    expect(statusChip({ status: 'correction_requested' }).tone).toBe('rose');
  });
  it('only leads approve', () => {
    expect(isMinutesLead(['Ops Director'])).toBe(true);
    expect(isMinutesLead(['Design Head', 'Admin'])).toBe(true);
    expect(isMinutesLead('Client Relations')).toBe(false);
    expect(isMinutesLead(['Designer'])).toBe(false);
  });
  it('adds the client\'s confirmation and correction to the record, once', () => {
    const t = fullTrail({ trail: [{ step: 'sent', at: 10, by: 'a', byName: 'Anushka' }], acknowledgedAt: 30, acknowledgedBy: 'Mr Naik', correctionRequest: { by: 'Mr Naik', at: 20 } });
    expect(t.map((e) => e.step)).toEqual(['sent', 'correction_asked', 'confirmed']);
  });
});

describe('changes only', () => {
  it('finds new, changed and removed lines', () => {
    const before = topics();
    const after = topics();
    after[0].lines[0] = { ...after[0].lines[0], text: 'L-shaped kitchen approved, tall unit left.' };
    after[1].lines = after[1].lines.filter((l) => l.id !== 'n1');
    after[1].lines.push(line({ id: 'new', kind: 'decision', text: 'Bronze glass.' }));
    const d = diffTopics(before, after);
    expect([...d.changed].sort()).toEqual(['d1', 'new']);
    expect(d.removed.map((r) => r.line.id)).toEqual(['n1']);
  });
  it('counts a new owner or date as a change', () => {
    const after = topics();
    after[0].lines[1] = { ...after[0].lines[1], due: DUE + 86400000 };
    expect([...diffTopics(topics(), after).changed]).toEqual(['a1']);
  });
});

describe('what the client reads', () => {
  it('names the client "You" and never names a vendor', () => {
    const v = clientView(topics(), 'Form Factors', () => 'Thu 15 Oct');
    expect(v.agreed.map((l) => l.ref)).toEqual(['D1']);
    expect(v.next.map((l) => [l.ref, l.owner])).toEqual([
      ['A1', 'Form Factors · by Thu 15 Oct'], ['A2', 'Form Factors · by Thu 15 Oct'], ['A3', 'You · by Thu 15 Oct'],
    ]);
    expect(JSON.stringify(v)).not.toContain('Sharma');
  });
  it('keeps only corrections on real lines, trimmed and capped', () => {
    const out = cleanCorrections([
      { lineId: 'a2', ref: 'A3', text: '  Antique brass, not black. ' },
      { lineId: 'nope', ref: 'A9', text: 'x' },
      { lineId: 'd1', ref: 'D1', text: '   ' },
    ], topics());
    expect(out).toEqual([{ lineId: 'a2', ref: 'A3', text: 'Antique brass, not black.' }]);
    expect(correctionText(out)).toBe('A3: Antique brass, not black.');
  });
});

describe('from the last meeting', () => {
  it('lists open actions from issued minutes, newest first, each once', () => {
    const moms = [
      { id: 'm1', status: 'shared', momRef: 'R1', meetingDate: 1, actionItems: [{ id: 'x', text: 'Confirm appliances', status: 'open', ownerName: 'Mrs Naik' }] },
      { id: 'm2', status: 'acknowledged', momRef: 'R2', meetingDate: 2, actionItems: [{ id: 'y', text: 'Confirm appliances', status: 'open' }, { id: 'z', text: 'Done thing', status: 'done' }] },
      { id: 'm3', status: 'draft', momRef: 'R3', meetingDate: 3, actionItems: [{ id: 'w', text: 'Draft only', status: 'open' }] },
    ];
    const out = openFromEarlier(moms);
    expect(out.map((c) => [c.ref, c.actionId, c.outcome])).toEqual([['R2', 'y', null]]);
  });
});

describe('the scope queue', () => {
  it('queues cost and scope actions once, and keeps where the queue moved them', () => {
    const t = topics();
    t[0].lines[1].flags = { cost: true };
    const q = queueScopeLines(t, 'anish@s.in', NOW);
    expect(q[0].lines[1].scopeRequest).toEqual({ status: 'queued', queuedAt: NOW, queuedBy: 'anish@s.in' });
    expect(queueScopeLines(q, 'x', NOW + 1)[0].lines[1].scopeRequest.queuedBy).toBe('anish@s.in');
    expect(toLegacy(q).actionItems[0].scopeRequest.status).toBe('queued');
    const back = withQueueState(q, [{ id: 'a1', scopeRequest: { status: 'added', addedTo: 'Scope Revision 2' } }]);
    expect(back[0].lines[1].scopeRequest.status).toBe('added');
  });
});

describe('the client and dates', () => {
  it('reads every email on the project', () => {
    expect(clientContactOf({ clientName: ' Mr Naik ', clientEmail: 'a@x.in, b@x.in;bad, a@x.in', clientPhone: '' }))
      .toEqual({ name: 'Mr Naik', emails: ['a@x.in', 'b@x.in'], phone: null });
  });
  it('keeps a due date on its day in India', () => {
    expect(keyOfDue(DUE)).toBe('2026-10-15');
    expect(dueFromKey('15/10/2026')).toBeNull();
    expect(quickDues(NOW).map((q) => [q.label, keyOfDue(q.at)])).toEqual([['Tomorrow', '2026-10-13'], ['Fri', '2026-10-16'], ['Next week', '2026-10-19']]);
  });
});
