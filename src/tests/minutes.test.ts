import { describe, it, expect } from 'vitest';
import {
  toLegacy, fromLegacy, fromStructured, lineRefs, checksOf, readyToSend, flowStep, statusChip, diffTopics,
  clientView, cleanCorrections, correctionText, openFromEarlier, guessKind, queueScopeLines, withQueueState,
  fullTrail, clientContactOf, isMinutesLead, dueFromKey, keyOfDue, quickDues,
  designReviewFrom, designReviewCounts, reviewsWithoutMinutes, decisionsLog, studioFollowUps, followUpId, clientMaySee,
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

/* ── Part 2 ─────────────────────────────────────────────────────────────── */
import {
  splitPrivate, mergePrivate, outboxOf, waitingFromMinutes, templatesFor, defaultTemplate, isLogOnly, selectionText,
} from '../../lib/minutes';

const part2 = (): MinutesTopic[] => [
  { id: 'k', title: 'Kitchen', lines: [
    line({ id: 's1', kind: 'selection', text: 'Caesarstone Frosty Carrina, 20 mm', meta: { item: 'Countertop', choice: 'approved' } }),
    line({ id: 'p1', kind: 'studio_only', text: 'Client hinted at a tighter budget.' }),
    line({ id: 'r1', kind: 'requirement', text: 'Tall unit for oven', meta: { room: 'Kitchen', priority: 'must' } }),
  ] },
  { id: 'b', title: 'Budget', lines: [line({ id: 'p2', kind: 'studio_only', text: 'Budget band 25-30 L.' })] },
  { id: 'w', title: 'Wardrobe', lines: [line({ id: 'c1', kind: 'design_change', text: 'Move wardrobe 150 mm', meta: { sheet: 'Bedroom plan' } })] },
];

describe('studio-only lines', () => {
  it('never reach the minutes document, and come back where they were', () => {
    const { shared, priv } = splitPrivate(part2());
    expect(JSON.stringify(shared)).not.toContain('budget');
    expect(JSON.stringify(shared)).not.toContain('Budget');
    expect(shared.map((t) => t.id)).toEqual(['k', 'w']);
    expect(mergePrivate(shared, priv)).toEqual(part2());
  });
  it('are left out of the older fields, the client view and the PDF refs', () => {
    const legacy = toLegacy(part2());
    expect(JSON.stringify(legacy)).not.toContain('tighter budget');
    expect(legacy.decisions.map((d) => d.text)).toEqual(['Kitchen: Selected: Countertop: Caesarstone Frosty Carrina, 20 mm', 'Wardrobe: Design change: Move wardrobe 150 mm']);
    const v = clientView(part2(), 'Studio', () => '');
    expect(JSON.stringify(v)).not.toContain('budget');
    expect(lineRefs(part2())).toEqual({ s1: 'S1', r1: 'R1', c1: 'C1' });
  });
});

describe('where lines go', () => {
  it('collects requirements, selections and design changes once approved', () => {
    const o = outboxOf(part2());
    expect(o.requirements).toEqual([{ lineId: 'r1', text: 'Tall unit for oven', room: 'Kitchen', priority: 'must' }]);
    expect(o.selections).toEqual([{ lineId: 's1', text: 'Caesarstone Frosty Carrina, 20 mm', item: 'Countertop', room: 'Kitchen', choice: 'approved' }]);
    expect(o.designChanges[0]).toMatchObject({ lineId: 'c1', sheet: 'Bedroom plan', room: 'Wardrobe' });
    expect(selectionText(part2()[0].lines[0])).toBe('Countertop: Caesarstone Frosty Carrina, 20 mm');
  });
  it('offers each only until it is added, and only from issued minutes', () => {
    const o = outboxOf(part2());
    const moms = [
      { id: 'm1', format: 2, status: 'shared', momRef: 'R1', outbox: o, filed: { s1: { at: 1 } } },
      { id: 'm2', format: 2, status: 'draft', outbox: o },
    ];
    expect(waitingFromMinutes(moms, 'selections')).toEqual([]);
    expect(waitingFromMinutes(moms, 'requirements').map((w) => [w.momId, w.item.lineId])).toEqual([['m1', 'r1']]);
  });
});

describe('meetings across the project', () => {
  it('puts this stage first, and keeps proposal minutes for leads', () => {
    const forCr = templatesFor(4, false);
    expect(forCr.slice(0, 2).map((t) => t.id)).toEqual(['design_review', 'material_selection']);
    expect(forCr.some((t) => t.leadOnly)).toBe(false);
    expect(templatesFor(3, true).slice(0, 2).map((t) => t.id)).toEqual(['proposal', 'negotiation']);
  });
  it('picks a template from the meeting type and stage', () => {
    expect(defaultTemplate('internal_meeting', 4).id).toBe('internal');
    expect(defaultTemplate('site_visit', 6).id).toBe('snag_walk');
    expect(defaultTemplate('client_meeting', 1).id).toBe('discovery');
    expect(isLogOnly('vendor_meeting')).toBe(true);
    expect(isLogOnly('client_meeting')).toBe(false);
  });
  it('carries unanswered questions to the next minutes', () => {
    const earlier = [{ id: 'm', status: 'acknowledged', format: 2, momRef: 'R', meetingDate: 1, actionItems: [],
      topics: [{ id: 't', title: 'Living', lines: [line({ id: 'q', kind: 'question', text: 'AC drain behind the TV wall?' })] }] }];
    expect(openFromEarlier(earlier).map((c) => [c.actionId, c.text, c.ownerName])).toEqual([['q', 'Open question: AC drain behind the TV wall?', 'To answer']]);
  });
  it('reads the new kinds from notes, never studio-only', () => {
    const t = fromStructured({ topics: [{ title: 'Kitchen', lines: [
      { kind: 'selection', text: 'Frosty Carrina', item: 'Countertop', room: 'Kitchen', choice: 'approved' },
      { kind: 'studio_only', text: 'Budget' },
    ] }] });
    expect(t[0].lines.map((l) => [l.kind, l.meta?.item ?? null, l.meta?.choice ?? null])).toEqual([['selection', 'Countertop', 'approved'], ['note', null, null]]);
  });
});

describe('design review minutes', () => {
  const meeting = {
    id: 'dm1', state: 'CLOSED', closedAt: 5, startedAt: 1, attendees: 'Mr & Mrs Naik', includedRounds: 2,
    startedBy: { name: 'Tanvi' }, confirmation: { via: 'portal', name: 'Prasad Naik', at: 6 },
    rooms: [
      { room: 'Kitchen', outcome: 'agreed', round: 0, changes: [], sheets: [{ drawingId: 'k', name: 'Kitchen plan', versionNo: 3 }], charge: null },
      { room: 'Kids room', outcome: 'changes', round: 3, sheets: [{ drawingId: 's', name: 'Study unit', versionNo: 3 }],
        changes: [{ n: 4, drawingId: 's', page: 0, shape: {}, text: 'Study table 1200 mm.' }], charge: { status: 'to_bill', fee: 5000 } },
      { room: 'Guest', outcome: null, round: 0, changes: [], sheets: [] },
    ],
  };
  it('keeps rooms, outcomes and changes, and no fee', () => {
    const r = designReviewFrom(meeting)!;
    expect(r.rooms.map((x) => [x.room, x.outcome, x.round, x.beyond])).toEqual([['Kitchen', 'agreed', null, false], ['Kids room', 'changes', 3, true]]);
    expect(r.rooms[1].changes).toEqual([{ n: 4, text: 'Study table 1200 mm.', sheet: 'Study unit' }]);
    expect(JSON.stringify(r)).not.toMatch(/fee|charge|5000/);
    expect(r.confirmed).toEqual({ name: 'Prasad Naik', at: 6, via: 'portal' });
    expect(designReviewCounts(r)).toEqual({ rooms: 2, agreed: 1, withChanges: 1, changes: 1, beyond: 1 });
  });
  it('reads the portal copy Client Relations can see', () => {
    const r = designReviewFrom({ id: 'dm1', heldAt: 5, presentedBy: 'Tanvi', attendees: '', confirmation: null,
      rooms: [{ room: 'Kids room', outcome: 'changes', sheets: [{ drawingId: 's', name: 'Study unit', versionNo: 3 }], changes: ['Study table 1200 mm.'], pins: [{ n: 4, drawingId: 's' }] }] })!;
    expect(r.rooms[0]).toEqual({ room: 'Kids room', outcome: 'changes', round: null, beyond: false, sheets: [{ name: 'Study unit', versionNo: 3 }], changes: [{ n: 4, text: 'Study table 1200 mm.', sheet: 'Study unit' }] });
  });
  it('skips an open review, and reviews that already have minutes', () => {
    expect(designReviewFrom({ ...meeting, state: 'OPEN' })).toBeNull();
    const r = designReviewFrom(meeting)!;
    expect(reviewsWithoutMinutes([r], [{ designReview: { meetingId: 'dm1' } }])).toEqual([]);
  });
  it('lets minutes with only the review through the checks', () => {
    const r = designReviewFrom(meeting)!;
    const base = { topics: [{ id: 't', title: 'Also discussed', lines: [] }], attendees: [{ name: 'A', side: 'client' }] };
    expect(readyToSend(checksOf(base))).toBe(false);
    expect(readyToSend(checksOf({ ...base, designReview: r }))).toBe(true);
  });
});

describe('the decisions log', () => {
  it('lists what was agreed on issued minutes, newest first, and older decisions too', () => {
    const moms = [
      { id: 'a', format: 2, status: 'acknowledged', momRef: 'M1', meetingDate: 1, topics: topics() },
      { id: 'b', status: 'shared', momRef: 'M0', meetingDate: 2, decisions: [{ text: 'Wall to come down.' }] },
      { id: 'c', format: 2, status: 'draft', meetingDate: 3, topics: topics() },
      { id: 'd', format: 2, status: 'finalised', meetingType: 'internal_meeting', meetingDate: 4, topics: topics() },
    ];
    expect(decisionsLog(moms).map((d) => [d.momRef, d.ref, d.text, d.confirmed, d.earlier])).toEqual([
      ['M0', '', 'Wall to come down.', false, true],
      ['M1', 'D1', 'L-shaped kitchen approved.', true, false],
    ]);
  });
});

describe('actions onto the Ops Desk', () => {
  it('takes the studio\'s open, owned and dated actions only', () => {
    const t = topics();
    t[0].lines[1].owner = { side: 'ffds', name: 'Tanvi', email: 'Tanvi@Studio.in' };
    t[0].lines.push(line({ id: 'a3', kind: 'action', text: 'No date', owner: { side: 'ffds', name: 'Tanvi', email: 't@s.in' } }));
    t[0].lines.push(line({ id: 'a4', kind: 'action', text: 'Done', owner: { side: 'ffds', name: 'Tanvi', email: 't@s.in' }, due: DUE, status: 'done' }));
    expect(studioFollowUps(t)).toEqual([{ lineId: 'a1', text: 'Share the revised elevation.', ownerEmail: 'tanvi@studio.in', ownerName: 'Tanvi', due: '2026-10-15' }]);
    expect(followUpId('m/1', 'a1')).toBe('mom-m_1-a1');
  });
});

describe('what the client sees in the portal', () => {
  it('shows new minutes once sent, never internal ones; older ones by their flag', () => {
    expect(clientMaySee({ format: 2, status: 'finalised' }, true)).toBe(false);
    expect(clientMaySee({ format: 2, status: 'shared' }, false)).toBe(true);
    expect(clientMaySee({ format: 2, status: 'shared', meetingType: 'vendor_meeting' }, true)).toBe(false);
    expect(clientMaySee({ status: 'shared' }, false)).toBe(false);
  });
});
