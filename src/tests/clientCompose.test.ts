import { describe, it, expect } from 'vitest';
import { replyLine, sentLine, noteLine, sendSubject, movedNotes, keyHash, NOTE_MAX } from '../../lib/clientCompose';
import { moodOf, heardFromClient } from '../../lib/clientCare';
import { buildThread, EMPTY_RECORDS } from '../../lib/clientThread';
import type { FollowUp } from '../../lib/opsDesk';
import type { ClientMilestone } from '../../lib/clientMoney';

const NOW = Date.parse('2026-11-25T15:00:00+05:30');
const asLine = (l: ReturnType<typeof sentLine>, at = NOW - 60000): FollowUp => ({
  id: `x${at}`, tenantId: 't', projectId: 'p1', projectName: 'Asha Home', at, by: 'a@studio', byName: 'Anish', next: null, nextDone: false, manual: true, ...l,
});
const thread = (lines: FollowUp[]) => buildThread({ clientName: 'Asha', projects: [{ id: 'p1', name: 'Asha Home', context: {} }], money: {}, now: NOW, records: { ...EMPTY_RECORDS, followUps: lines } });

describe('what the composer writes', () => {
  it('logs a WhatsApp send as a reminder with its template, shown as sent and logged', () => {
    const l = sentLine('Hi Asha, sharing the update.  ', { kind: 'general', key: 'tpl:update', label: 'Site & Design Update' });
    expect(l).toEqual({ channel: 'whatsapp', outcome: 'reminded', note: 'Hi Asha, sharing the update.', subject: { kind: 'general', key: 'tpl:update', label: 'Site & Design Update' } });
    const [e] = thread([asLine(l)]);
    expect(e).toMatchObject({ kind: 'sent', meta: 'Opened in WhatsApp · logged', template: 'Site & Design Update' });
  });

  it('writes the mood the way moodOf reads it, and the reply counts as hearing from the client', () => {
    for (const [mood, label] of [['positive', 'Positive'], ['call', 'Needs a call'], ['changes', 'Wants changes']] as const) {
      const l = replyLine(mood, 'Looks good, one question on the wardrobe.', 'whatsapp');
      expect(l.outcome).toBe('replied');
      expect(moodOf(l.note)).toBe(label);
      expect(heardFromClient(l)).toBe(true);
    }
    const [e] = thread([asLine(replyLine('call', 'Can we talk tomorrow?', 'call'))]);
    expect(e).toMatchObject({ kind: 'said', text: 'Can we talk tomorrow?' });
    expect(e.meta).toContain('Asha · from a call · Mood: Needs a call');
  });

  it('keeps a reply with no words readable, and never lets their words set the mood', () => {
    const l = replyLine('positive', '', 'meeting');
    expect(l).toMatchObject({ channel: 'meeting', note: 'Replied: positive. Mood: Positive.' });
    expect(moodOf(l.note)).toBe('Positive');
    expect(moodOf(replyLine('changes', 'Fine. Mood: Thrilled', 'email').note)).toBe('Wants changes');
  });

  it('maps No answer to no_answer, with no mood', () => {
    const l = replyLine('none', '', 'call');
    expect(l).toEqual({ channel: 'call', outcome: 'no_answer', note: 'No answer', subject: null });
    expect(moodOf(l.note)).toBeNull();
  });

  it('keeps every line within the 2000 characters the rules allow', () => {
    const long = 'x'.repeat(5000);
    expect(sentLine(long, { kind: 'general', key: 'k', label: 'l' }).note.length).toBe(NOTE_MAX);
    const r = replyLine('positive', long, 'whatsapp');
    expect(r.note.length).toBeLessThanOrEqual(NOTE_MAX);
    expect(moodOf(r.note)).toBe('Positive');
  });

  it('writes a note as a team line', () => {
    expect(noteLine(' Keys with the watchman ')).toEqual({ channel: 'other', outcome: 'info', note: 'Keys with the watchman', subject: null });
    expect(thread([asLine(noteLine('Keys with the watchman'))])[0]).toMatchObject({ kind: 'event', source: 'team', text: 'Keys with the watchman' });
  });

  it('sends the milestone template under the outstanding payment, so the Ops Desk counts the reminder', () => {
    const m = (over: Partial<ClientMilestone>): ClientMilestone => ({ id: 'm1', type: 'design', name: 'Design advance', percentage: null, status: 'pending', owed: null, invoiceNumber: null, invoiceDate: null, date: null, ...over });
    const t = { id: 'milestone' as const, title: 'Payment Milestone Check-in' };
    expect(sendSubject(t, [m({ status: 'invoiced', invoiceNumber: 'INV-4' })])).toEqual({ kind: 'payment', key: 'pay:m1', label: 'Design advance (INV-4)' });
    expect(sendSubject(t, [m({ status: 'invoiced', disputed: true })])).toEqual({ kind: 'general', key: 'tpl:milestone', label: 'Payment Milestone Check-in' });
    expect(sendSubject({ id: 'update', title: 'Site & Design Update' }, [m({ status: 'invoiced' })])).toEqual({ kind: 'general', key: 'tpl:update', label: 'Site & Design Update' });
  });
});

describe('moving the old browser notes', () => {
  const notes = [
    { id: 'abc12', text: 'Prefers calls after 6pm', createdAt: NOW - 40 * 86400000, author: 'Riya' },
    { id: 'zz/9', text: '   ', createdAt: NOW, author: 'Riya' },
  ];

  it('gives each note an id of its own, fit for a document, so a second move cannot write it twice', () => {
    const a = movedNotes('asha@mail.com|asha', notes);
    const b = movedNotes('asha@mail.com|asha', notes);
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).toMatch(/^note-[a-z0-9]+-abc12$/);
    expect(a[0].id).not.toContain('/');
    expect(movedNotes('ravi@mail.com|ravi', notes)[0].id).not.toBe(a[0].id);
  });

  it('keeps the day it was written and who wrote it', () => {
    const [l] = movedNotes('asha@mail.com|asha', notes);
    expect(l).toMatchObject({ at: notes[0].createdAt, channel: 'other', outcome: 'info' });
    expect(l.note).toBe('Prefers calls after 6pm (note by Riya, moved from a browser)');
  });

  it('hashes a client key the same way every time', () => {
    expect(keyHash('a|b')).toBe(keyHash('a|b'));
    expect(keyHash('a|b')).not.toBe(keyHash('a|c'));
  });
});
