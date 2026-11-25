import { describe, it, expect } from 'vitest';
import { buildThread, groupThread, dayGroupOf, EMPTY_RECORDS, type ThreadInput, type ThreadRecords } from '../../lib/clientThread';
import { withoutAmounts, type ClientMoney } from '../../lib/clientMoney';
import type { FollowUp } from '../../lib/opsDesk';

const NOW = Date.parse('2026-11-25T15:00:00+05:30');
const DAY = 86400000;
const ago = (d: number) => NOW - d * DAY;

const f = (projectId: string, daysAgo: number, over: Partial<FollowUp> = {}): FollowUp => ({
  id: `${projectId}-${daysAgo}-${over.outcome || 'reminded'}`, tenantId: 't', projectId, projectName: '', at: ago(daysAgo), by: 'a@studio', byName: 'Anish',
  channel: 'whatsapp', note: 'Sharing the drawings', subject: { kind: 'general', key: 'tpl:review', label: 'Drawings / BOQ Review' },
  outcome: 'reminded', next: null, nextDone: false, manual: true, ...over,
});

const money = (milestones: any[]): ClientMoney => ({
  projectValue: 1000000, totalPaid: 300000, balanceDue: 700000,
  milestones: milestones.map((m, i) => ({ id: `m${i}`, type: 'design', name: `Stage ${i + 1}`, percentage: 10, status: 'pending', owed: 300000, invoiceNumber: null, invoiceDate: null, date: null, paidDate: null, ...m })),
});

const input = (over: Partial<ThreadInput> & { records?: Partial<ThreadRecords> } = {}): ThreadInput => ({
  clientName: 'Asha',
  projects: [{ id: 'p1', name: 'Asha Home', context: {} }],
  money: {},
  now: NOW,
  ...over,
  records: { ...EMPTY_RECORDS, ...(over.records || {}) },
});

describe('the client thread', () => {
  it('puts what we sent on the right, what they said on the left, and team notes as cards, in date order', () => {
    const t = buildThread(input({ records: { followUps: [
      f('p1', 1, { outcome: 'replied', channel: 'call', note: 'Call: Happy with the plan Mood: Pleased.' }),
      f('p1', 3),
      f('p1', 2, { outcome: 'info', channel: 'other', note: 'Site keys with the watchman' }),
    ] } }));
    expect(t.map((e) => [e.kind, e.side])).toEqual([['sent', 'studio'], ['event', 'studio'], ['said', 'client']]);
    expect(t[0]).toMatchObject({ text: 'Sharing the drawings', meta: 'Opened in WhatsApp · logged', template: 'Drawings / BOQ Review', source: 'sent' });
    expect(t[1]).toMatchObject({ source: 'team', meta: 'Logged by Anish' });
    expect(t[2].text).toBe('Happy with the plan');
    expect(t[2].meta).toContain('Asha · from a call · Mood: Pleased');
  });

  it('never says delivered or read', () => {
    const t = buildThread(input({ records: { followUps: [f('p1', 1)] } }));
    expect(JSON.stringify(t)).not.toMatch(/deliver|read\b/i);
  });

  it('merges several projects into one thread, each entry tagged with its project', () => {
    const t = buildThread(input({
      projects: [{ id: 'p1', name: 'Asha Home', context: {} }, { id: 'p2', name: 'Asha Villa', context: { proposalSentAt: new Date(ago(4)).toISOString() } }],
      records: { followUps: [f('p1', 2), f('p2', 1, { outcome: 'replied', note: 'Will call back' }), f('p9', 1)] },
    }));
    expect(t.map((e) => e.projectName)).toEqual(['Asha Villa', 'Asha Home', 'Asha Villa']);
    expect(t.map((e) => e.text)).toEqual(['Proposal sent', 'Sharing the drawings', 'Will call back']);
  });

  it('leaves the tag off when there is one project', () => {
    const t = buildThread(input({ records: { followUps: [f('p1', 1)] } }));
    expect(t[0].projectName).toBeNull();
  });

  it('shows payments with their figure, and without it where amounts are hidden', () => {
    const m = money([{ status: 'paid', invoiceDate: new Date(ago(10)).toISOString(), paidDate: '2026-11-20', invoiceNumber: 'INV-7' }]);
    const shown = buildThread(input({ money: { p1: m } }));
    expect(shown.map((e) => e.text)).toEqual(['Invoice raised · Stage 1 · ₹3,00,000', 'Paid a stage · Stage 1 · ₹3,00,000']);
    const hidden = buildThread(input({ money: { p1: withoutAmounts(m) } }));
    expect(hidden.map((e) => e.text)).toEqual(['Invoice raised · Stage 1', 'Paid a stage · Stage 1']);
    expect(JSON.stringify(hidden)).not.toContain('₹');
  });

  it('adds an Unpaid sticker past 15 days, for the longest, and not for a disputed invoice', () => {
    const late = money([
      { status: 'invoiced', invoiceDate: new Date(ago(20)).toISOString() },
      { status: 'invoiced', invoiceDate: new Date(ago(40)).toISOString(), disputed: true },
    ]);
    const t = buildThread(input({ money: { p1: late } }));
    expect(t[t.length - 1]).toMatchObject({ kind: 'sticker', text: 'Unpaid · 20 days', tone: 'bad' });
    const fresh = buildThread(input({ money: { p1: money([{ status: 'invoiced', invoiceDate: new Date(ago(15)).toISOString() }]) } }));
    expect(fresh.some((e) => e.kind === 'sticker')).toBe(false);
  });

  it('adds No reply in n days when our message is the last word and 10 days old', () => {
    const t = buildThread(input({ records: { followUps: [f('p1', 12)] } }));
    expect(t[t.length - 1]).toMatchObject({ kind: 'sticker', text: 'No reply in 12 days', tone: 'warn' });
    expect(buildThread(input({ records: { followUps: [f('p1', 9)] } })).some((e) => e.kind === 'sticker')).toBe(false);
    /* A reply logged, or something the client did in their portal, is an answer. */
    expect(buildThread(input({ records: { followUps: [f('p1', 14), f('p1', 12, { outcome: 'replied', note: 'Ok' })] } })).some((e) => e.kind === 'sticker')).toBe(false);
    const portal = buildThread(input({
      projects: [{ id: 'p1', name: 'Asha Home', context: { clientMessages: [{ id: 'c1', text: 'Is Friday fine?', sentAt: new Date(ago(11)).toISOString() }] } }],
      records: { followUps: [f('p1', 13)] },
    }));
    expect(portal.some((e) => e.kind === 'sticker')).toBe(false);
  });

  it('shows Agreement signed as a gold sticker, but not a gate filled in by the migration', () => {
    const signed = buildThread(input({ projects: [{ id: 'p1', name: 'Asha Home', context: { executionSignoff: { status: 'signed', signedAt: new Date(ago(30)).toISOString() } } }] }));
    expect(signed[0]).toMatchObject({ kind: 'sticker', text: 'Agreement signed', tone: 'gold' });
    const assumed = buildThread(input({ projects: [{ id: 'p1', name: 'Asha Home', context: { lifecycle: { gates: { contractSigned: { done: true, at: ago(30), reference: 'legacy' } } } } }] }));
    expect(assumed).toEqual([]);
    const gate = buildThread(input({ projects: [{ id: 'p1', name: 'Asha Home', context: { lifecycle: { gates: { contractSigned: { done: true, at: ago(30), reference: 'abc123' } } } } }] }));
    expect(gate[0].text).toBe('Agreement signed');
  });

  it('lists what the client did in their portal, and the enquiry, visits, minutes and sign-offs', () => {
    const t = buildThread(input({
      projects: [{ id: 'p1', name: 'Asha Home', context: {
        documents: { issues: [{ id: 'i1', kind: 'detailed_boq', clientSignature: { signedAt: new Date(ago(3)).toISOString() }, clientDownloads: [{ at: ago(4), format: 'excel' }, { at: ago(4) + 60000, format: 'record' }] }], queries: [{ id: 'q1', documentKind: 'terms_docket', clauseRef: '4.2', raisedAt: ago(5), question: 'Is GST extra?' }] },
        materialSelections: [{ id: 's1', itemName: 'Oak veneer', clientConfirmedAt: new Date(ago(2)).toISOString() }],
      } }],
      records: {
        leadCreatedAt: { p1: ago(60) },
        visits: [{ id: 'v1', projectId: 'p1', kind: 'site_visit', status: 'done', purpose: 'Measurements', history: [{ at: ago(20), status: 'done' }] } as any],
        moms: [{ id: 'mm1', projectId: 'p1', meetingTitle: 'Kitchen review', sharedAt: ago(19), acknowledgedAt: ago(18) }],
        meetings: [{ id: 'd1', projectId: 'p1', state: 'CLOSED', closedAt: ago(8), rooms: [{ room: 'Kitchen', outcome: 'agreed' }, { room: 'Bedroom', outcome: 'changes' }] as any, confirmation: null, approval: { status: 'approved', answeredAt: ago(6) } as any }],
      },
    }));
    expect(t.map((e) => e.text)).toEqual([
      'Enquiry received',
      'Site visit done',
      'Minutes shared · Kitchen review',
      'Confirmed the minutes · Kitchen review',
      'Design meeting held',
      'Signed off the drawings · Kitchen',
      'Asked about clause 4.2 of the Terms Docket',
      'Downloaded the detailed BOQ',
      'Approved the detailed BOQ',
      'Confirmed Oak veneer',
    ]);
    expect(t.find((e) => e.text.startsWith('Signed off'))!.source).toBe('design');
    expect(t.find((e) => e.text.startsWith('Asked about'))!).toMatchObject({ source: 'portal', side: 'client', detail: 'Is GST extra?' });
  });

  it('groups the days as Earlier, This week, Yesterday and Today, in India time', () => {
    expect(dayGroupOf(NOW - 3600000, NOW)).toBe('Today');
    expect(dayGroupOf(ago(1), NOW)).toBe('Yesterday');
    expect(dayGroupOf(ago(4), NOW)).toBe('This week');
    expect(dayGroupOf(ago(9), NOW)).toBe('Earlier');
    const t = buildThread(input({ records: { followUps: [f('p1', 9), f('p1', 4), f('p1', 1), f('p1', 0.01)] } }));
    expect(groupThread(t, NOW).map((g) => [g.group, g.entries.length])).toEqual([['Earlier', 1], ['This week', 1], ['Yesterday', 1], ['Today', 1]]);
  });

  it('is empty with nothing recorded', () => {
    expect(buildThread(input())).toEqual([]);
  });
});
