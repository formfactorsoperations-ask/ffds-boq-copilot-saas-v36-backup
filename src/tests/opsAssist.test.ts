import { describe, it, expect } from 'vitest';
import {
  handoverSlip, projectSlipDays, buildProjectBrief, meetingPrep, agendaText, normaliseCapture, captureToRecords, DECISION_GRACE_DAYS,
} from '../../lib/opsAssist';
import { draftMessage, type WaitingItem } from '../../lib/opsDesk';
import { opsViewOf } from '../../functions/src/teamViewStrip';

const NOW = new Date('2026-10-11T10:00:00+05:30').getTime();
const DAY = 86400000;
const w = (over: Partial<WaitingItem>): WaitingItem => ({
  key: 'dec:d1', kind: 'decision', projectId: 'p1', projectName: 'Kapoor Villa', label: 'Master bath tiles', since: NOW - 9 * DAY, days: 9, reminders: 1, lastChaseAt: null, ...over,
});

describe('delay to handover', () => {
  it('counts a decision after the grace period, a payment by its lateness', () => {
    expect(handoverSlip(w({}), '2026-12-20')).toEqual({ days: 9 - DECISION_GRACE_DAYS, handoverKey: '2026-12-20', newHandoverKey: '2026-12-26' });
    expect(handoverSlip(w({ days: 2 }), '2026-12-20').days).toBe(0);
    expect(handoverSlip(w({ kind: 'payment', key: 'pay:m2', days: 11, overdueDays: 4 }), null)).toEqual({ days: 4, handoverKey: null, newHandoverKey: null });
    expect(projectSlipDays([handoverSlip(w({}), null), handoverSlip(w({ kind: 'payment', overdueDays: 4 }), null)])).toBe(6);
  });

  it('is said in the firmer messages, never the gentle one', () => {
    const c = { clientName: 'Mrs Kapoor', projectName: 'Kapoor Villa', label: 'the master bath tiles', days: 9, senderName: 'Riya', studioName: 'FF', slipDays: 6, newHandoverKey: '2026-12-26' };
    expect(draftMessage('decision', 'clear', c)).toContain('could move the handover by about 6 days, to around 26 Dec');
    expect(draftMessage('decision', 'firm', c)).toContain('about 6 days');
    expect(draftMessage('decision', 'gentle', c)).not.toContain('handover');
    expect(draftMessage('decision', 'clear', { ...c, slipDays: 0 })).not.toContain('handover');
  });
});

const fullProject: any = {
  id: 'p1', tenantId: 's', activeTierId: 't1',
  tiers: [{ id: 't1', summary: { totalSell: 1000000, designFee: 100000, margin: 0.3 }, boq: [{ id: 'l1', baseRate: 900, marginOverride: 0.4 }] }],
  timeline: [{ phaseName: 'Carpentry', startDay: 30, durationDays: 20, description: '' }],
  context: {
    name: 'Kapoor Villa', clientName: 'Mrs Kapoor', status: 'execution', targetHandoverDate: '2026-12-20',
    financials: { approvedExecutionValue: 1000000, billablePercent: 60, discounts: [] },
    paymentMilestones: [{ id: 'e1', type: 'execution', name: 'Carpentry stage', percentage: 40, status: 'invoiced', invoiceNumber: 'FF-14', invoiceDate: '2026-10-01' }],
    procurement: [{ vendor: 'Ply Co', buyRate: 72 }],
  },
};
const inputs = {
  followUps: [{ id: 'f1', tenantId: 's', projectId: 'p1', projectName: 'Kapoor Villa', at: NOW - DAY, by: 'riya@s.in', byName: 'Riya', channel: 'whatsapp', note: 'Asked about wardrobe dates', subject: null, outcome: 'info', next: { text: 'Confirm wardrobe dates', ownerEmail: 'riya@s.in', ownerName: 'Riya', due: '2026-10-12' }, nextDone: false, manual: true }] as any,
  escalations: [{ id: 'e1', status: 'decided', title: 'Extra wardrobe', decision: 'Send a quote by Friday' }] as any,
  decisions: [{ id: 'd1', status: 'drawing_sent', decisionText: 'Master bath tiles', roomName: 'Master bath' }],
  moms: [{ id: 'm1', status: 'shared', meetingTitle: 'Site visit', momRef: 'MOM-2026-014', meetingDate: NOW - 2 * DAY, raw: {
    summary: 'Tiles shortlisted; wardrobe dates to be confirmed.',
    actionItems: [
      { text: 'Send tile options', owner: 'ffds', ownerName: 'Tanvi', status: 'open', dueDate: NOW + 2 * DAY },
      { text: 'Choose master bath tiles', owner: 'client', status: 'open' },
      { text: 'Old one', owner: 'ffds', status: 'done' },
    ] } }],
};

describe('the project brief', () => {
  const view = opsViewOf(fullProject);
  const brief = buildProjectBrief(view, inputs, [w({})], NOW);
  const json = JSON.stringify(brief);

  it('has what a client asks about', () => {
    expect(brief).toMatchObject({ name: 'Kapoor Villa', clientName: 'Mrs Kapoor', targetHandover: '2026-12-20' });
    expect(brief.money?.milestones[0]).toMatchObject({ name: 'Carpentry stage', status: 'invoiced', invoiceNumber: 'FF-14' });
    expect(brief.actions.map((a) => [a.side, a.text])).toEqual([['studio', 'Send tile options'], ['client', 'Choose master bath tiles']]);
    expect(brief.waiting[0]).toMatchObject({ label: 'Master bath tiles', slipDays: 6 });
    expect(brief.lastMeeting).toMatchObject({ ref: 'MOM-2026-014' });
    expect(brief.followUps[0].next).toContain('Confirm wardrobe dates');
    expect(brief.escalations[0].decision).toBe('Send a quote by Friday');
  });

  it('carries no cost, margin or rate, so neither does anything sent to the AI', () => {
    for (const word of ['margin', 'baseRate', 'buyRate', 'billablePercent', 'procurement', 'totalSell']) expect(json, word).not.toContain(word);
  });

  it('prepares a meeting: both sides open, money, and an agenda', () => {
    const prep = meetingPrep(brief);
    expect(prep.ours.map((a) => a.text)).toEqual(['Send tile options']);
    expect(prep.theirs.map((a) => a.text)).toEqual(['Choose master bath tiles']);
    expect(prep.moneyLine).toMatch(/Carpentry stage/);
    expect(prep.agenda[0]).toMatch(/^Decision: Master bath tiles/);
    expect(prep.agenda[prep.agenda.length - 1]).toBe('Next dates, and who does what');
    expect(agendaText('Kapoor Villa', ['One', 'Two'], '14 Oct')).toBe('Agenda: Kapoor Villa, 14 Oct\n\n1. One\n2. Two');
  });
});

describe('capture', () => {
  const raw = {
    summary: 'Undecided on tiles; worried about wardrobe timing.', mood: 'Anxious about delays', moodQuote: "Please don't delay again",
    items: [
      { kind: 'our_promise', text: 'Send both tile options shown in the bathroom', due: '2026-10-13' },
      { kind: 'client_promise', text: 'Choose tiles after seeing the options', due: '' },
      { kind: 'date', text: 'Guest room needed by 20 Dec', due: '2026-12-20' },
      { kind: 'extra_work', text: 'Add a study table in bedroom 2', due: 'soon' },
      { kind: 'made_up', text: 'ignored' },
      { kind: 'open_question', text: '' },
    ],
  };

  it('keeps only known kinds, real dates and bounded text', () => {
    const c = normaliseCapture(raw);
    expect(c.items.map((i) => [i.kind, i.due])).toEqual([
      ['our_promise', '2026-10-13'], ['client_promise', null], ['date', '2026-12-20'], ['extra_work', null],
    ]);
    expect(normaliseCapture(null)).toEqual({ summary: '', mood: '', moodQuote: '', items: [] });
  });

  it('turns ticked items into follow-up lines with next steps, and extra work into an escalation', () => {
    const c = normaliseCapture(raw);
    c.items[2].selected = false;
    const { lines, escalations } = captureToRecords(c, 'WhatsApp chat', '2026-10-11');
    expect(lines[0]).toMatchObject({ outcome: 'promised', next: null, withSubject: true });
    expect(lines[0].note).toMatch(/^WhatsApp chat: Undecided on tiles.*Mood: Anxious about delays/);
    expect(lines.slice(1).map((l) => [l.note, l.next])).toEqual([
      ['We promised: Send both tile options shown in the bathroom', { text: 'Send both tile options shown in the bathroom', due: '2026-10-13' }],
      ['Client promised: Choose tiles after seeing the options', { text: 'Check: Choose tiles after seeing the options', due: '2026-10-14' }],
    ]);
    expect(escalations).toEqual([{ title: 'Extra work asked for: Add a study table in bedroom 2', detail: expect.stringContaining('WhatsApp chat'), category: 'scope' }]);
  });
});
