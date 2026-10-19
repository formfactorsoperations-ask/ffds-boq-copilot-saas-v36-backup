import { describe, it, expect } from 'vitest';
import {
  buildQueue, chaseState, dueForEscalation, paymentWaiting, decisionWaiting, withChases, draftMessage,
  opsSettingsOf, escalationRecipientsOf, dayKey, DEFAULT_OPS_SETTINGS, FollowUp, paymentKey,
} from '../../lib/opsDesk';

const DAY = 86400000;
const NOW = new Date('2026-10-11T10:00:00+05:30').getTime();
const P = { id: 'p1', name: 'Kapoor Villa' };

const fu = (over: Partial<FollowUp>): FollowUp => ({
  id: Math.random().toString(36).slice(2), tenantId: 's', projectId: 'p1', projectName: 'Kapoor Villa', at: NOW, by: 'riya@s.in',
  byName: 'Riya', channel: 'call', note: '', subject: null, outcome: 'info', next: null, nextDone: false, manual: true, ...over,
});

describe('settings', () => {
  it('defaults and clamps', () => {
    expect(opsSettingsOf(null)).toEqual(DEFAULT_OPS_SETTINGS);
    expect(opsSettingsOf({ opsDesk: { paymentDueDays: 15, escalateAfterReminders: 0, escalationRecipients: [' A@x.in '] } }))
      .toEqual({ paymentDueDays: 15, escalateAfterReminders: 2, escalateAfterDays: 7, escalationRecipients: ['a@x.in'], reviewLink: '', newMinutes: false, minutesFollowUps: true });
  });
  it('escalates to the Owners and Admins unless the studio chose people', () => {
    const team = [
      { email: 'anish@s.in', role: 'Owner' }, { email: 'mayuri@s.in', role: 'Design Head', roles: ['Admin'] },
      { email: 'tanvi@s.in', role: 'Designer' }, { email: 'riya@s.in', role: 'Client Relations' },
    ];
    expect(escalationRecipientsOf({ team })).toEqual(['anish@s.in', 'mayuri@s.in']);
    expect(escalationRecipientsOf({ team, opsDesk: { escalationRecipients: ['ops@s.in'] } })).toEqual(['ops@s.in']);
  });
});

describe('what the studio is waiting on', () => {
  const money = {
    projectValue: 1000000, totalPaid: 200000, balanceDue: 800000,
    milestones: [
      { id: 'm1', type: 'design', name: 'Design advance', percentage: 50, status: 'paid', owed: 50000, invoiceNumber: 'FF-1', invoiceDate: '2026-09-01', date: null },
      { id: 'm2', type: 'execution', name: 'Carpentry stage', percentage: 40, status: 'invoiced', owed: 472000, invoiceNumber: 'FF-14', invoiceDate: '2026-10-01', date: null },
      { id: 'm3', type: 'execution', name: 'Handover', percentage: 10, status: 'pending', owed: 118000, invoiceNumber: null, invoiceDate: null, date: '2026-12-01' },
    ],
  } as any;

  it('lists invoiced, unpaid milestones with their due date and lateness', () => {
    const [w] = paymentWaiting(P, money, DEFAULT_OPS_SETTINGS, NOW);
    expect(paymentWaiting(P, money, DEFAULT_OPS_SETTINGS, NOW)).toHaveLength(1);
    expect(w).toMatchObject({ key: 'pay:m2', label: 'Carpentry stage (FF-14)', amount: 472000, dueKey: '2026-10-08', overdueDays: 3, days: 10 });
    expect(paymentWaiting(P, money, { ...DEFAULT_OPS_SETTINGS, paymentDueDays: 15 }, NOW)[0].overdueDays).toBe(0);
    expect(paymentWaiting(P, null, DEFAULT_OPS_SETTINGS, NOW)).toEqual([]);
  });

  it('lists decisions sent and not yet signed', () => {
    const decs = [
      { id: 'd1', status: 'drawing_sent', decisionText: 'Master bath tiles', signoffRequestSentAt: { seconds: (NOW - 9 * DAY) / 1000 } },
      { id: 'd2', status: 'signed', decisionText: 'Ceiling' },
      { id: 'd3', status: 'draft', decisionText: 'Not sent' },
    ];
    const w = decisionWaiting(P, decs, NOW);
    expect(w.map((x) => [x.key, x.days])).toEqual([['dec:d1', 9]]);
  });
});

describe('reminders and escalation', () => {
  const key = paymentKey('m2');
  it('counts reminders since the last reply', () => {
    const log = [
      fu({ at: NOW - 20 * DAY, subject: { kind: 'payment', key, label: '' }, outcome: 'reminded' }),
      fu({ at: NOW - 15 * DAY, subject: { kind: 'payment', key, label: '' }, outcome: 'promised' }),
      fu({ at: NOW - 8 * DAY, subject: { kind: 'payment', key, label: '' }, outcome: 'reminded' }),
      fu({ at: NOW - 2 * DAY, subject: { kind: 'payment', key, label: '' }, outcome: 'no_answer' }),
      fu({ at: NOW - 1 * DAY, subject: { kind: 'payment', key: 'pay:other', label: '' }, outcome: 'reminded' }),
    ];
    const st = chaseState(log, key);
    expect(st).toMatchObject({ reminders: 2, firstReminderAt: NOW - 8 * DAY, lastAt: NOW - 2 * DAY, lastReplyAt: NOW - 15 * DAY });
    expect(dueForEscalation(st, DEFAULT_OPS_SETTINGS, NOW)).toBe(true);
    expect(dueForEscalation(st, { ...DEFAULT_OPS_SETTINGS, escalateAfterDays: 10 }, NOW)).toBe(false);
    expect(dueForEscalation(chaseState(log.slice(0, 3), key), DEFAULT_OPS_SETTINGS, NOW)).toBe(false);
  });
});

describe('the queue', () => {
  const today = dayKey(NOW);
  const waiting = withChases([
    { key: 'pay:m2', kind: 'payment', projectId: 'p1', projectName: 'Kapoor Villa', label: 'Carpentry', since: NOW - 10 * DAY, days: 10, amount: 1, dueKey: '2026-10-08', overdueDays: 3, reminders: 0, lastChaseAt: null },
    { key: 'pay:m9', kind: 'payment', projectId: 'p1', projectName: 'Kapoor Villa', label: 'Chased', since: NOW - 10 * DAY, days: 10, amount: 1, dueKey: '2026-10-08', overdueDays: 3, reminders: 0, lastChaseAt: null },
    { key: 'dec:d1', kind: 'decision', projectId: 'p1', projectName: 'Kapoor Villa', label: 'Tiles', since: NOW - 9 * DAY, days: 9, reminders: 0, lastChaseAt: null },
    { key: 'dec:d2', kind: 'decision', projectId: 'p1', projectName: 'Kapoor Villa', label: 'Fresh', since: NOW - 1 * DAY, days: 1, reminders: 0, lastChaseAt: null },
  ], [fu({ at: NOW - DAY, subject: { kind: 'payment', key: 'pay:m9', label: '' }, outcome: 'reminded' })]);
  const followUps = [
    fu({ id: 'f1', next: { text: 'Call back about wardrobe dates', ownerEmail: 'riya@s.in', ownerName: 'Riya', due: '2026-10-10' } }),
    fu({ id: 'f2', next: { text: 'Send tile options', ownerEmail: 'tanvi@s.in', ownerName: 'Tanvi', due: today } }),
    fu({ id: 'f3', next: { text: 'Done already', ownerEmail: 'riya@s.in', ownerName: 'Riya', due: today }, nextDone: true }),
    fu({ id: 'f4', next: { text: 'Next week', ownerEmail: 'riya@s.in', ownerName: 'Riya', due: '2026-10-14' } }),
  ];
  const moms = [{ id: 'mo1', projectId: 'p1', projectName: 'Kapoor Villa', status: 'pending_review', meetingTitle: 'Site visit' }];
  const escalations: any[] = [
    { id: 'e1', projectId: 'p1', projectName: 'Kapoor Villa', title: 'Payment 2 late', status: 'open', raisedBy: 'riya@s.in', raisedByName: 'Riya', raisedAt: NOW - DAY, auto: false },
    { id: 'e2', projectId: 'p1', projectName: 'Kapoor Villa', title: 'Extra wardrobe', status: 'decided', decision: 'Send a quote', decidedByName: 'Mayuri', raisedBy: 'riya@s.in', raisedAt: NOW - 3 * DAY, auto: false },
  ];

  it("gives Client Relations their own next steps, late payments and waiting decisions, oldest first", () => {
    const q = buildQueue({ now: NOW, me: 'Riya@s.in', isLead: false, followUps, waiting, moms, escalations });
    expect(q.map((i) => [i.group, i.kind, i.ref])).toEqual([
      ['overdue', 'payment', 'pay:m2'],
      ['overdue', 'next', 'f1'],
      ['today', 'escalation_decided', 'e2'],
      ['today', 'decision', 'dec:d1'],
      ['week', 'next', 'f4'],
    ]);
  });

  it('gives a lead the minutes to approve and the escalations to decide', () => {
    const q = buildQueue({ now: NOW, me: 'mayuri@s.in', isLead: true, followUps, waiting: [], moms, escalations });
    expect(q.map((i) => i.kind)).toEqual(['escalation_open', 'mom_review']);
  });
});

describe('messages to copy', () => {
  const c = { clientName: 'Mrs Kapoor', projectName: 'Kapoor Villa', label: 'Carpentry stage', amount: 472000, dueKey: '2026-10-08', days: 10, senderName: 'Riya', studioName: 'Form Factors' };
  it('names the amount and date, and gets firmer without threatening', () => {
    expect(draftMessage('payment', 'gentle', c)).toContain('₹4,72,000');
    expect(draftMessage('payment', 'gentle', c)).toContain('8 Oct');
    expect(draftMessage('payment', 'firm', c)).toContain('10 days');
    expect(draftMessage('decision', 'clear', { ...c, label: 'the master bath tiles' })).toContain('approval on the master bath tiles');
    for (const t of ['gentle', 'clear', 'firm'] as const) expect(draftMessage('general', t, c)).toMatch(/^Hi Mrs Kapoor,/);
  });
});

describe('the daily check', () => {
  it('picks the subjects gone unanswered, once per episode', async () => {
    const { sweepCandidates } = await import('../../lib/opsDesk');
    const s = { kind: 'payment' as const, key: 'pay:m2', label: 'Carpentry' };
    const log = [
      fu({ projectId: 'p1', at: NOW - 9 * DAY, subject: s, outcome: 'reminded' }),
      fu({ projectId: 'p1', at: NOW - 3 * DAY, subject: s, outcome: 'no_answer' }),
      fu({ projectId: 'p2', at: NOW - 9 * DAY, subject: s, outcome: 'reminded' }),
      fu({ projectId: 'p1', at: NOW - 9 * DAY, subject: { kind: 'general', key: 'g', label: '' }, outcome: 'reminded' }),
      fu({ projectId: 'p1', at: NOW - 8 * DAY, subject: { kind: 'general', key: 'g', label: '' }, outcome: 'reminded' }),
    ];
    const c = sweepCandidates(log, DEFAULT_OPS_SETTINGS, NOW);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ projectId: 'p1', escalationId: `auto_pay_m2_${NOW - 9 * DAY}` });
  });
});
