import { describe, it, expect } from 'vitest';
import {
  clientPulse, moodOf, toneOf, heardFromClient, isPraise, bandOf, PULSE_START,
  materialise, progressOf, setItem, addItem, checklistHints, documentsMessage,
  moveVisit, visitMessage, slotText, askState, askPrompts, askMessage, careQueue,
  fromSiteVisit, visitCalendarEvent, visitCalendarMove, guestEmails,
  type VisitRequest, type PulseInputs, type CareProject,
} from '../../lib/clientCare';
import { buildQueue, opsSettingsOf, type FollowUp, type WaitingItem, type Escalation } from '../../lib/opsDesk';

const NOW = new Date('2026-10-11T10:00:00+05:30').getTime();
const DAY = 86400000;
const me = { email: 'Riya@s.in', name: 'Riya' };

const fu = (over: Partial<FollowUp>): FollowUp => ({
  id: Math.random().toString(36).slice(2), tenantId: 's', projectId: 'p1', projectName: 'Kapoor Villa', at: NOW - DAY, by: 'riya@s.in', byName: 'Riya',
  channel: 'call', note: '', subject: null, outcome: 'info', next: null, nextDone: false, manual: true, ...over,
});
const wait = (over: Partial<WaitingItem>): WaitingItem => ({
  key: 'dec:d1', kind: 'decision', projectId: 'p1', projectName: 'Kapoor Villa', label: 'Master bath tiles', since: NOW - 3 * DAY, days: 3, reminders: 0, lastChaseAt: null, ...over,
});
const base = (over: Partial<PulseInputs> = {}): PulseInputs => ({
  waiting: [], followUps: [], escalations: [], moms: [], visits: [], money: null, targetHandover: null, now: NOW, ...over,
});

describe('reading a follow-up', () => {
  it('finds the mood a capture noted, and its tone', () => {
    expect(moodOf('WhatsApp chat: Undecided on tiles. Mood: Anxious about delays ("Please don\'t delay").')).toBe('Anxious about delays');
    expect(moodOf('Called, no answer')).toBeNull();
    expect(toneOf('Anxious about delays')).toBe('negative');
    expect(toneOf('Happy with progress')).toBe('positive');
    expect(toneOf('Calm')).toBe('neutral');
  });

  it('knows when the client spoke, and when they praised the work', () => {
    expect(heardFromClient(fu({ outcome: 'replied' }))).toBe(true);
    expect(heardFromClient(fu({ channel: 'meeting' }))).toBe(true);
    expect(heardFromClient(fu({ note: 'Call: agreed the tiles' }))).toBe(true);
    expect(heardFromClient(fu({ outcome: 'reminded', channel: 'whatsapp', note: 'Sent a reminder' }))).toBe(false);
    expect(isPraise(fu({ note: 'Call: walked the site. Mood: Delighted with the kitchen.' }))).toBe(true);
    expect(isPraise(fu({ note: 'Call: walked the site. Mood: Worried, but happy with the kitchen.' }))).toBe(false);
  });
});

describe('the client pulse', () => {
  it('starts at 80 with nothing logged, and says it is an early read', () => {
    const p = clientPulse(base());
    expect(p).toMatchObject({ score: PULSE_START, band: 'good', confidence: 'low', reasons: [] });
  });

  it('loses points for late money, stuck decisions, silence and an open escalation, each with a reason', () => {
    const p = clientPulse(base({
      waiting: [
        wait({ kind: 'payment', key: 'pay:m2', label: 'Carpentry stage', days: 16, overdueDays: 9, reminders: 2 }),
        wait({ days: 15 }),
      ],
      followUps: [fu({ at: NOW - 20 * DAY, outcome: 'replied' }), fu({ at: NOW - 2 * DAY, outcome: 'reminded', next: { text: 'Call again', ownerEmail: 'riya@s.in', ownerName: 'Riya', due: '2026-10-09' } })],
      escalations: [{ id: 'e1', status: 'open', title: 'Payment 2 late' } as Escalation],
    }));
    const by = Object.fromEntries(p.reasons.map((r) => [r.label, r.points]));
    expect(by['Payment 9 days late: Carpentry stage']).toBe(-8);
    expect(by['Decision waiting 15 days: Master bath tiles']).toBe(-8);
    expect(by['2 reminders unanswered']).toBe(-5);
    expect(by['Not heard from them in 20 days']).toBe(-8);
    expect(by['1 next step of ours overdue']).toBe(-4);
    expect(by['Escalation open: Payment 2 late']).toBe(-8);
    expect(p.score).toBe(80 - 8 - 8 - 5 - 8 - 4 - 8);
    expect(p.band).toBe('at_risk');
    expect(p.reasons[0].points).toBeLessThan(0);
  });

  it('gains for recent contact, good mood and payments on time, and never leaves 0 to 100', () => {
    const p = clientPulse(base({
      followUps: [fu({ at: NOW - DAY, note: 'Call: saw the kitchen. Mood: Delighted with progress.', outcome: 'info' })],
      money: { projectValue: 1, totalPaid: 1, balanceDue: 0, milestones: [{ id: 'd', type: 'design', name: 'Design advance', percentage: 50, status: 'paid', owed: 1, invoiceNumber: null, invoiceDate: null, date: null }] },
    }));
    expect(p.score).toBe(95);
    const worst = clientPulse(base({
      waiting: Array.from({ length: 6 }, (_, n) => wait({ key: `pay:${n}`, kind: 'payment', overdueDays: 40, reminders: 3 })),
      escalations: Array.from({ length: 4 }, (_, n) => ({ id: `e${n}`, status: 'open', title: 'x' } as Escalation)),
      followUps: [fu({ at: NOW - 40 * DAY, outcome: 'replied', note: 'Mood: Furious.' })],
      moms: [{ status: 'correction_requested' }],
      visits: [{ status: 'confirmed', reschedules: 3 }],
    }));
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.band).toBe('at_risk');
    expect(bandOf(70)).toBe('good');
    expect(bandOf(69)).toBe('watch');
    expect(bandOf(44)).toBe('at_risk');
  });

  it('grows more sure as the log fills', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, k) => fu({ at: NOW - k * DAY }));
    expect(clientPulse(base({ followUps: lines(2) })).confidence).toBe('low');
    expect(clientPulse(base({ followUps: lines(5) })).confidence).toBe('medium');
    expect(clientPulse(base({ followUps: lines(9) })).confidence).toBe('high');
  });
});

describe('checklists', () => {
  it('lays saved states over the studio list and keeps the project’s own items', () => {
    const c = materialise('documents', { items: [
      { id: 'floor_plan', state: 'received', at: 1, by: 'a', byName: 'A', note: '', label: 'ignored', custom: false },
      { id: 'xyz', label: 'Car parking allotment letter', state: 'requested', at: 2, by: 'a', byName: 'A', note: '', custom: true },
      { id: 'billing', state: 'done' as any, at: 1, by: 'a', byName: 'A', note: '', label: '', custom: false },
    ] });
    expect(c.items[0]).toMatchObject({ id: 'floor_plan', label: 'Floor plan or builder drawings', state: 'received' });
    expect(c.items.find((x) => x.id === 'billing')?.state).toBe('missing');
    expect(c.items[c.items.length - 1]).toMatchObject({ id: 'xyz', label: 'Car parking allotment letter', custom: true, state: 'requested' });
  });

  it('counts progress without the items marked not needed', () => {
    let c = materialise('onboarding', null);
    const total = c.items.length;
    c = setItem(c, 'welcome', { state: 'done' }, me, NOW);
    c = setItem(c, 'group', { state: 'na' }, me, NOW);
    expect(progressOf(c)).toMatchObject({ done: 1, total: total - 1, settled: false });
    expect(c.items[0]).toMatchObject({ by: 'riya@s.in', byName: 'Riya', at: NOW });
    for (const x of c.items) c = setItem(c, x.id, { state: x.state === 'na' ? 'na' : 'done' }, me, NOW);
    expect(progressOf(c).settled).toBe(true);
    expect(addItem(c, '  Parking sticker  ', me, NOW).items.at(-1)).toMatchObject({ label: 'Parking sticker', state: 'open', custom: true });
    expect(addItem(c, '   ', me, NOW)).toBe(c);
  });

  it('hints from the client’s side of the money, and drafts the documents message', () => {
    const money = { projectValue: 2, totalPaid: 1, balanceDue: 1, milestones: [
      { id: 'd', type: 'design' as const, name: 'Design advance', percentage: 50, status: 'paid', owed: 1, invoiceNumber: null, invoiceDate: null, date: null },
      { id: 'e', type: 'execution' as const, name: 'Handover', percentage: 10, status: 'pending', owed: 1, invoiceNumber: null, invoiceDate: null, date: null },
    ] };
    expect(checklistHints('onboarding', money)).toEqual({ design_advance: 'Design advance shows as paid' });
    expect(checklistHints('handover', money)).toEqual({ final_payment: '1 milestone still unpaid' });
    let c = materialise('documents', null);
    for (const x of c.items.slice(2)) c = setItem(c, x.id, { state: 'received' }, me, NOW);
    const msg = documentsMessage(c, { clientName: 'Mrs Kapoor', projectName: 'Kapoor Villa', senderName: 'Riya', studioName: 'FF' });
    expect(msg).toContain('1. Floor plan or builder drawings\n2. Billing name');
    expect(msg).not.toContain('Society NOC');
  });
});

const visit = (over: Partial<VisitRequest> = {}): VisitRequest => ({
  id: 'v1', tenantId: 's', projectId: 'p1', projectName: 'Kapoor Villa', kind: 'site_visit', mode: 'in_person', purpose: 'check the kitchen cut-outs',
  requestedBy: 'client', status: 'requested', slot: null, reschedules: 0, history: [], createdAt: NOW - DAY, createdBy: 'riya@s.in', createdByName: 'Riya',
  updatedAt: NOW - DAY, updatedBy: 'riya@s.in', ...over,
});

describe('meeting and site visit requests', () => {
  it('moves through requested, confirmed and rescheduled, keeping the history', () => {
    expect(moveVisit(visit(), 'confirmed', {}, me, NOW)).toEqual({ ok: false, error: 'Choose a date and a time first.' });
    const c = moveVisit(visit(), 'confirmed', { slot: { date: '2026-10-14', time: '11:00' } }, me, NOW);
    expect(c.ok && c.patch).toMatchObject({ status: 'confirmed', slot: { date: '2026-10-14', time: '11:00' }, reschedules: 0 });
    const v2 = visit({ ...(c.ok ? c.patch : {}) });
    expect(moveVisit(v2, 'rescheduled', { slot: { date: '2026-10-14', time: '11:00' } }, me, NOW)).toEqual({ ok: false, error: 'Choose a different time to reschedule.' });
    const r = moveVisit(v2, 'rescheduled', { slot: { date: '2026-10-15', time: '16:30' }, note: 'Site not ready' }, me, NOW);
    expect(r.ok && r.patch).toMatchObject({ status: 'rescheduled', reschedules: 1 });
    expect(r.ok && r.patch.history.map((h) => h.status)).toEqual(['confirmed', 'rescheduled']);
    expect(moveVisit(visit({ status: 'done' }), 'cancelled', {}, me, NOW).ok).toBe(false);
    expect(moveVisit(visit(), 'done', {}, me, NOW).ok).toBe(false);
  });

  it('drafts the confirmation, the new time and the reminder', () => {
    const v = visit({ slot: { date: '2026-10-14', time: '16:30' } });
    expect(slotText(v.slot)).toBe('14 Oct, 4:30 pm');
    const ctx = { clientName: 'Mrs Kapoor', projectName: 'Kapoor Villa', senderName: 'Riya', studioName: 'FF' };
    expect(visitMessage('confirm', v, ctx)).toContain('Confirming our site visit for Kapoor Villa on 14 Oct, 4:30 pm at the site to check the kitchen cut-outs.');
    expect(visitMessage('reschedule', { ...v, mode: 'video' }, ctx)).toContain('Would 14 Oct, 4:30 pm on a video call');
    expect(visitMessage('reminder', v, ctx)).toContain('tomorrow, 14 Oct, 4:30 pm');
  });
});

describe('reviews and referrals', () => {
  const good = clientPulse(base({ followUps: [fu({ outcome: 'replied' })] }));
  it('are prompted after handover or praise, while the client is happy', () => {
    expect(askPrompts({ followUps: [], handedOver: true, pulse: good, latePayment: false, openEscalation: false, now: NOW }).map((a) => a.kind)).toEqual(['review', 'referral']);
    const praise = [fu({ at: NOW - 3 * DAY, note: 'Call: saw the wardrobes. Mood: Thrilled.' })];
    expect(askPrompts({ followUps: praise, handedOver: false, pulse: good, latePayment: false, openEscalation: false, now: NOW })[0].reason).toBe('Praised the work on 8 Oct');
    expect(askPrompts({ followUps: [], handedOver: false, pulse: good, latePayment: false, openEscalation: false, now: NOW })).toEqual([]);
  });

  it('are held while money is late, an escalation is open or the pulse is not good', () => {
    const p = { followUps: [], handedOver: true, pulse: good, now: NOW };
    expect(askPrompts({ ...p, latePayment: true, openEscalation: false })).toEqual([]);
    expect(askPrompts({ ...p, latePayment: false, openEscalation: true })).toEqual([]);
    expect(askPrompts({ ...p, pulse: { ...good, band: 'watch' }, latePayment: false, openEscalation: false })).toEqual([]);
  });

  it('rest a month between asks, stop after two, and stop once done', () => {
    const ask = (at: number, outcome: FollowUp['outcome'] = 'reminded') => fu({ at, outcome, subject: { kind: 'general', key: 'ask:review', label: 'Google review' } });
    const p = { handedOver: true, pulse: good, latePayment: false, openEscalation: false, now: NOW };
    expect(askPrompts({ ...p, followUps: [ask(NOW - 10 * DAY)] }).map((a) => a.kind)).toEqual(['referral']);
    expect(askPrompts({ ...p, followUps: [ask(NOW - 40 * DAY)] })[0]).toMatchObject({ kind: 'review', asks: 1 });
    expect(askPrompts({ ...p, followUps: [ask(NOW - 90 * DAY), ask(NOW - 40 * DAY)] }).map((a) => a.kind)).toEqual(['referral']);
    expect(askState([ask(NOW - 40 * DAY), ask(NOW - 5 * DAY, 'replied')], 'review')).toMatchObject({ asks: 1, done: true });
  });

  it('puts the studio’s review link in the message', () => {
    const ctx = { clientName: 'Mrs Kapoor', projectName: 'Kapoor Villa', senderName: 'Riya', studioName: 'FF', reviewLink: 'https://g.page/r/abc/review' };
    expect(askMessage('review', ctx)).toContain('https://g.page/r/abc/review');
    expect(askMessage('referral', ctx)).toContain('introduction');
    expect(opsSettingsOf({ opsDesk: { reviewLink: 'https://g.page/r/abc/review' } }).reviewLink).toBe('https://g.page/r/abc/review');
    expect(opsSettingsOf({ opsDesk: { reviewLink: 'javascript:alert(1)' } }).reviewLink).toBe('');
  });
});

describe('client care on the desk', () => {
  const proj = (over: Partial<CareProject> = {}): CareProject => ({ id: 'p1', name: 'Kapoor Villa', status: 'execution', targetHandover: null, checklists: {}, visits: [], prompts: [], ...over });

  it('asks for a time on a request, a reminder the day before, and a close-out after', () => {
    const q = careQueue([proj({ visits: [
      visit({ id: 'a', updatedAt: NOW - 3 * DAY }),
      visit({ id: 'b', status: 'confirmed', slot: { date: '2026-10-12', time: '11:00' } }),
      visit({ id: 'c', status: 'confirmed', slot: { date: '2026-10-09', time: '11:00' } }),
      visit({ id: 'd', status: 'confirmed', slot: { date: '2026-10-20', time: '11:00' } }),
      visit({ id: 'e', status: 'done', slot: { date: '2026-10-01', time: '11:00' } }),
    ] })], [], false, NOW);
    expect(q.map((x) => [x.ref, x.group, x.title.split(':')[0]])).toEqual([
      ['a', 'overdue', 'Agree a time'], ['b', 'today', 'Tomorrow'], ['c', 'overdue', 'Close out'],
    ]);
  });

  it('chases asked-for documents after a rest, and warns of a handover two weeks out', () => {
    let docs = materialise('documents', null);
    docs = setItem(docs, 'floor_plan', { state: 'requested' }, me, NOW - 4 * DAY);
    const q = careQueue([proj({ targetHandover: '2026-10-20', checklists: { documents: docs } })], [], false, NOW);
    expect(q.map((x) => x.title)).toEqual(['Chase 1 document', 'Handover in 9 days']);
    const chased = [fu({ at: NOW - DAY, subject: { kind: 'general', key: 'docs', label: 'Documents' } })];
    expect(careQueue([proj({ checklists: { documents: docs } })], chased, false, NOW)).toEqual([]);
  });

  it('asks a lead to mark a finished checklist complete, and sorts in with the rest of the desk', () => {
    let c = materialise('onboarding', null);
    for (const x of c.items) c = setItem(c, x.id, { state: 'done' }, me, NOW);
    const care = careQueue([proj({ checklists: { onboarding: c }, prompts: [{ kind: 'review', reason: 'Handed over', asks: 0 }] })], [], true, NOW);
    expect(care.map((x) => x.kind)).toEqual(['checklist', 'ask']);
    expect(careQueue([proj({ checklists: { onboarding: c } })], [], false, NOW)).toEqual([]);
    const q = buildQueue({ now: NOW, me: 'riya@s.in', isLead: true, followUps: [], waiting: [], moms: [], escalations: [], extra: care });
    expect(q.map((x) => x.kind)).toEqual(['checklist', 'ask']);
  });
});

describe('meetings logged on the project', () => {
  const p = { id: 'p1', name: 'Unique Vistas' };
  const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });

  it('show on the desk: ahead is confirmed, past is done, cancelled stays cancelled', () => {
    const ahead = fromSiteVisit({ id: 'sv1', type: 'client_meeting', title: 'Kitchen review', date: ts('2026-10-14T00:00:00Z'), startTime: '16:30', isVirtual: true, meetingMode: 'google_meet', googleMeetUrl: 'https://meet.google.com/abc-defg-hij', status: 'active', loggedAt: ts('2026-10-10T09:00:00Z') }, p, 's', NOW)!;
    expect(ahead).toMatchObject({ id: 'project:sv1', projectId: 'p1', projectName: 'Unique Vistas', kind: 'meeting', mode: 'video', purpose: 'Kitchen review', status: 'confirmed', slot: { date: '2026-10-14', time: '16:30' }, meetUrl: 'https://meet.google.com/abc-defg-hij', source: 'project' });
    expect(fromSiteVisit({ id: 'sv2', type: 'site_visit', title: 'Walk', date: '2026-10-09', startTime: '10:00' }, p, 's', NOW)).toMatchObject({ kind: 'site_visit', mode: 'in_person', status: 'done', slot: { date: '2026-10-09', time: '10:00' }, meetUrl: null });
    expect(fromSiteVisit({ id: 'sv3', type: 'measurement_survey', title: 'Measure', date: ts('2026-10-20T00:00:00Z'), status: 'cancelled' }, p, 's', NOW)).toMatchObject({ kind: 'measurement', status: 'cancelled', slot: { date: '2026-10-20', time: '10:00' } });
    expect(fromSiteVisit({ id: 'sv4', type: 'vendor_meeting', isVirtual: true, meetingMode: 'phone', date: { seconds: new Date('2026-10-12T04:30:00Z').getTime() / 1000 } }, p, 's', NOW)).toMatchObject({ mode: 'call', status: 'confirmed' });
    expect(fromSiteVisit({}, p, 's', NOW)).toBeNull();
  });

  it('come up on the queue the day before, and in the client care counts, like a desk booking', () => {
    const v = fromSiteVisit({ id: 'sv1', type: 'client_meeting', title: 'Kitchen review', date: '2026-10-12', startTime: '11:00' }, p, 's', NOW)!;
    const q = careQueue([{ id: 'p1', name: 'Unique Vistas', status: 'execution', targetHandover: null, checklists: {}, visits: [v], prompts: [] }], [], false, NOW);
    expect(q.map((x) => x.title)).toEqual(['Tomorrow: Meeting · Kitchen review']);
  });
});

describe('google calendar and meet', () => {
  const v = { kind: 'meeting' as const, mode: 'video' as const, purpose: 'review the kitchen', slot: { date: '2026-10-14', time: '23:30' } };

  it('books the time in India, with a Meet link for a video call and the guests invited', () => {
    const ev = visitCalendarEvent(v, { projectName: 'Kapoor Villa', clientName: 'Mr Kapoor', guests: ['a@b.in', 'nope'], requestId: 'r1' });
    expect(ev.summary).toBe('Meeting: Kapoor Villa · review the kitchen');
    expect(ev.start).toEqual({ dateTime: '2026-10-14T23:30:00+05:30', timeZone: 'Asia/Kolkata' });
    expect(ev.end).toEqual({ dateTime: '2026-10-15T00:30:00+05:30', timeZone: 'Asia/Kolkata' });
    expect(ev.attendees).toEqual([{ email: 'a@b.in' }]);
    expect(ev.conferenceData.createRequest).toEqual({ requestId: 'r1', conferenceSolutionKey: { type: 'hangoutsMeet' } });
    expect(visitCalendarEvent({ ...v, mode: 'in_person' }, { projectName: 'K', clientName: '', guests: [], requestId: 'r2', place: 'Site' })).not.toHaveProperty('conferenceData');
    expect(() => visitCalendarEvent({ ...v, slot: null }, { projectName: 'K', clientName: '', guests: [], requestId: 'r3' })).toThrow();
    expect(visitCalendarMove({ date: '2026-10-15', time: '09:00' })).toEqual({ start: { dateTime: '2026-10-15T09:00:00+05:30', timeZone: 'Asia/Kolkata' }, end: { dateTime: '2026-10-15T10:00:00+05:30', timeZone: 'Asia/Kolkata' } });
  });

  it('reads a typed guest list, and puts the link in the message', () => {
    expect(guestEmails('A@b.in, c@d.com; a@b.in  junk')).toEqual(['a@b.in', 'c@d.com']);
    const ctx = { clientName: 'Mr Kapoor', projectName: 'Kapoor Villa', senderName: 'Riya', studioName: 'FFDS' };
    const msg = visitMessage('confirm', { ...v, meetUrl: 'https://meet.google.com/abc-defg-hij' }, ctx);
    expect(msg).toContain('on a video call to review the kitchen.');
    expect(msg).toContain('Join here: https://meet.google.com/abc-defg-hij');
    expect(visitMessage('confirm', v, ctx)).toContain('(we will share the link)');
  });
});
