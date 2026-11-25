import { describe, it, expect } from 'vitest';
import { greeting, holderOf, homeLists, mainAction, stepsOf, whereLine, type FlowRow } from '../../lib/designDesk2';

/*
  Design Desk 2.0's plain words (lib/designDesk2): the numbered steps, the
  one-sentence "where it is now", who has the drawing, the one main button and
  Home's lists.
*/

const person = (name: string) => ({ uid: name.toLowerCase(), email: `${name.toLowerCase()}@studio.in`, name });
const row = (id: string, state: string | null, extra: any = {}): FlowRow => ({
  id, projectId: extra.projectId || 'p1', name: extra.name || `Drawing ${id}`, roomName: 'Kitchen', targetDate: extra.targetDate,
  approvedAt: extra.approvedAt ?? null, gfcStatus: extra.gfc ?? null,
  review: state ? {
    schema: 1, orgId: 's', projectId: 'p1', drawingId: id, state, rev: 1, audience: extra.audience || 'client', versionId: 'v1', versionNo: 1, pdfPath: 'x.pdf',
    thumbPath: null, pageCount: 1, openRoundId: null, attempts: 1, designer: person(extra.by || 'Riya'), submittedAt: extra.submittedAt || 1, decidedBy: null,
    decidedAt: null, reason: null, selfApproved: false, marksTotal: extra.open || 0, marksOpen: extra.open || 0, marksSeq: 0, updatedAt: 1,
    clientChanges: extra.client ? { meetingId: 'm', at: 1, count: extra.client, pending: true, by: person('Head') } : null,
  } as any : undefined,
});
const head = { reviewer: true, email: 'head@studio.in' };
const riya = { reviewer: false, email: 'riya@studio.in' };
const kabir = { reviewer: false, email: 'kabir@studio.in' };

describe('steps', () => {
  it('walks a client drawing through four steps', () => {
    expect(stepsOf(row('a', null))).toEqual({ labels: ['Upload the drawing', 'Design Head checks', 'Client signs off', 'Sent to site'], current: 0 });
    expect(stepsOf(row('a', 'DRAFT')).current).toBe(0);
    expect(stepsOf(row('a', 'IN_REVIEW')).current).toBe(1);
    expect(stepsOf(row('a', 'APPROVED')).current).toBe(2);
    expect(stepsOf(row('a', 'APPROVED', { approvedAt: 5 })).current).toBe(3);
    expect(stepsOf(row('a', 'APPROVED', { approvedAt: 5, gfc: 'issued' })).current).toBe(4);
  });
  it('puts a drawing sent back for changes on step one again', () => {
    expect(stepsOf(row('a', 'CHANGES_REQUESTED', { open: 2 })).current).toBe(0);
  });
  it('has no client step for a studio-only drawing', () => {
    const s = stepsOf(row('a', 'APPROVED', { audience: 'studio' }));
    expect(s.labels).toEqual(['Upload the drawing', 'Design Head checks', 'Sent to site']);
    expect(s.current).toBe(2);
    expect(stepsOf(row('a', 'APPROVED', { audience: 'studio', gfc: 'issued' })).current).toBe(3);
  });
  it("keeps a drawing with the client's changes waiting on the Design Head", () => {
    expect(stepsOf(row('a', 'APPROVED', { client: 2 })).current).toBe(1);
  });
});

describe('where it is now', () => {
  it('speaks to the person reading it', () => {
    expect(whereLine(row('a', 'IN_REVIEW'), head)).toBe('Riya sent this for you to check.');
    expect(whereLine(row('a', 'IN_REVIEW'), riya)).toBe('The Design Head is checking it.');
    expect(whereLine(row('a', 'CHANGES_REQUESTED', { open: 2 }), riya)).toBe('The Design Head asked for 2 changes. Make them and upload it again.');
    expect(whereLine(row('a', 'CHANGES_REQUESTED', { open: 1 }), head)).toBe('Riya is making 1 change.');
    expect(whereLine(row('a', 'DRAFT'), riya)).toBe('You uploaded it. Send it to the Design Head.');
    expect(whereLine(row('a', 'DRAFT'), kabir)).toBe('Riya uploaded it and has not sent it yet.');
    expect(whereLine(row('a', null), riya)).toBe('Nobody has uploaded this drawing yet.');
  });
  it('says what happens after the studio approves', () => {
    expect(whereLine(row('a', 'APPROVED'), head)).toBe('Approved by the studio. Show it to the client at the next meeting.');
    expect(whereLine(row('a', 'APPROVED', { approvedAt: 5 }), head)).toBe('The client signed it off. It can go to site.');
    expect(whereLine(row('a', 'APPROVED', { audience: 'studio' }), head)).toBe('Approved. It stays inside the studio and can go to site.');
    expect(whereLine(row('a', 'APPROVED', { approvedAt: 5, gfc: 'issued' }), riya)).toBe('Sent to site.');
    expect(whereLine(row('a', 'APPROVED', { client: 2 }), head)).toBe('The client asked for 2 changes at the meeting. Decide what goes to Riya.');
    expect(whereLine(row('a', 'APPROVED', { client: 2 }), riya)).toBe('The client asked for changes. The Design Head looks at them first.');
  });
});

describe('who has it and the one button', () => {
  it('names the holder, and "You" when it is this person\'s turn', () => {
    expect(holderOf(row('a', null), head)).toBeNull();
    expect(holderOf(row('a', 'IN_REVIEW'), head)).toBe('You');
    expect(holderOf(row('a', 'IN_REVIEW'), riya)).toBe('Design Head');
    expect(holderOf(row('a', 'CHANGES_REQUESTED'), head)).toBe('Riya');
    expect(holderOf(row('a', 'CHANGES_REQUESTED'), riya)).toBe('You');
    expect(holderOf(row('a', 'APPROVED'), riya)).toBe('Client');
    expect(holderOf(row('a', 'APPROVED', { approvedAt: 5 }), riya)).toBe('Ready for site');
    expect(holderOf(row('a', 'APPROVED', { approvedAt: 5, gfc: 'issued' }), riya)).toBe('Sent to site');
  });
  it('offers one main button per drawing', () => {
    expect(mainAction(row('a', 'IN_REVIEW'), head, true)).toEqual({ kind: 'check', label: 'Check this drawing', primary: true });
    expect(mainAction(row('a', 'APPROVED', { client: 1 }), head, true).kind).toBe('client');
    expect(mainAction(row('a', 'CHANGES_REQUESTED'), riya, true).label).toBe('Fix and upload again');
    expect(mainAction(row('a', 'DRAFT'), riya, true).label).toBe('Send to the Design Head');
    expect(mainAction(row('a', null), riya, true).label).toBe('Upload the drawing');
    /* Somebody else's draft, or a role that cannot upload: just Open. */
    expect(mainAction(row('a', 'DRAFT'), kabir, true)).toEqual({ kind: 'open', label: 'Open', primary: false });
    expect(mainAction(row('a', null), kabir, false).kind).toBe('open');
  });
});

describe('Home lists', () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const rows = [
    row('late', 'IN_REVIEW', { targetDate: yesterday, submittedAt: 9 }),
    row('older', 'IN_REVIEW', { submittedAt: 2 }),
    row('back', 'CHANGES_REQUESTED', { by: 'Kabir' }),
    row('client', 'APPROVED'),
    row('site', 'APPROVED', { approvedAt: 5, gfc: 'issued' }),
    row('none', null),
  ];
  it('starts the Design Head on the most urgent drawing to check', () => {
    const l = homeLists(rows, head);
    expect(l.start?.id).toBe('late');
    expect(l.todo.map((d) => d.id)).toEqual(['older']);
    expect(l.waiting.map((d) => d.id).sort()).toEqual(['back', 'client']);
  });
  it("shows a designer their own drawings that are with someone else", () => {
    const l = homeLists(rows, riya);
    expect(l.start).toBeNull();
    expect(l.waiting.map((d) => d.id).sort()).toEqual(['client', 'late', 'older']);
    expect(homeLists(rows, kabir).start?.id).toBe('back');
  });
  it('greets by the time of day', () => {
    expect(greeting(new Date(2026, 10, 24, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 10, 24, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 10, 24, 19))).toBe('Good evening');
  });
});
