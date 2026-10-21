import { describe, it, expect } from 'vitest';
import {
  leadName, homeLine, leadUrgency, leadQueue, findMatches, leadToProject, conversionLines, leadStats, lostReasons, draftProblems,
  blankDraft, readChat, phoneKey, type Lead,
} from '../../lib/leads';
import { dayKey } from '../../lib/opsDesk';

const DAY = 86400000;
const NOW = new Date('2026-10-19T13:00:00+05:30').getTime();
const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1', tenantId: 's', createdAt: NOW - 40 * 60000, createdBy: 'anushka@s.in', createdByName: 'Anushka', ownerEmail: 'anushka@s.in', ownerName: 'Anushka',
  people: [
    { id: 'a', name: 'Mr Rohan Mehta', role: 'Main contact', phone: '+91 98330 12345', email: 'rohan.mehta@gmail.com', main: true },
    { id: 'b', name: 'Mrs Kavya Mehta', role: 'Decides with him', phone: '+91 98330 67890', email: 'kavya.m@outlook.com', main: false },
  ],
  home: { where: 'Hiranandani, Powai · Tower B, 1402', type: '3 BHK', area: 1150, scope: ['Full home'], possession: 'Jan 2027', budget: '₹25–30 L' },
  source: 'instagram', sourceNote: '', enquiry: 'Need interiors for new 3bhk Powai', stage: 'new', lostReason: null,
  know: { decides: 'Both', style: 'Contemporary', seenWork: false }, next: null, touches: [], firstTouchAt: null, lastTouchAt: null,
  openRequest: null, projectId: null, updatedAt: NOW, updatedBy: 'anushka@s.in', ...over,
});

describe('a lead', () => {
  it('is named for the family when two people share a surname', () => {
    expect(leadName(lead())).toBe('Mehta family');
    expect(leadName(lead({ people: [lead().people[0]] }))).toBe('Mr Rohan Mehta');
    expect(homeLine(lead().home)).toBe('3 BHK · Hiranandani · 1,150 sq ft');
  });
  it('wants a call within the hour, then a next step, and notices when it goes quiet', () => {
    expect(leadUrgency(lead(), NOW)).toMatchObject({ tone: 'warn', waitedMin: 40 });
    expect(leadUrgency(lead({ createdAt: NOW - 90 * 60000 }), NOW).tone).toBe('bad');
    expect(leadUrgency(lead({ firstTouchAt: NOW - DAY, lastTouchAt: NOW - DAY, next: { text: 'Book a meeting', due: dayKey(NOW), kind: 'meeting' } }), NOW)).toMatchObject({ tone: 'warn', label: 'Book a meeting' });
    expect(leadUrgency(lead({ firstTouchAt: NOW - 7 * DAY, lastTouchAt: NOW - 6 * DAY }), NOW)).toMatchObject({ tone: 'bad', quietDays: 6 });
  });
  it('asks only for a name and one way to reach them', () => {
    const d = blankDraft(NOW);
    expect(draftProblems(d)).toEqual(['the main contact’s name', 'a phone or email to reach them']);
    d.people[0].name = 'Rohan';
    d.people[0].phone = '98330 12345';
    expect(draftProblems(d)).toEqual([]);
  });
});

describe('leads on the Today list', () => {
  it('puts a new enquiry on its owner’s list, and quiet ones and open requests in front of the leads', () => {
    const fresh = lead();
    const quiet = lead({ id: 'l2', ownerEmail: 'priya@s.in', ownerName: 'Priya', firstTouchAt: NOW - 20 * DAY, lastTouchAt: NOW - 12 * DAY });
    const ask = lead({ id: 'l3', stage: 'measured', firstTouchAt: NOW - 9 * DAY, lastTouchAt: NOW - DAY, openRequest: { at: NOW - DAY, by: 'anushka@s.in', byName: 'Anushka' } });
    const lost = lead({ id: 'l4', stage: 'lost' });
    const mine = leadQueue([fresh, quiet, ask, lost], 'anushka@s.in', false, NOW);
    expect(mine.map((q) => [q.kind, q.ref, q.group])).toEqual([['lead', 'l1', 'today']]);
    const lead_ = leadQueue([fresh, quiet, ask, lost], 'anish@s.in', true, NOW);
    expect(lead_.map((q) => [q.kind, q.ref])).toEqual([['lead', 'l2'], ['lead_open', 'l3']]);
  });
});

describe('duplicates', () => {
  it('finds an earlier lead or a client by phone or email, however it was typed', () => {
    expect(phoneKey('098330-12345')).toBe(phoneKey('+91 98330 12345'));
    const old = lead({ id: 'old', stage: 'lost', lostReason: 'Postponed', createdAt: new Date('2026-03-03').getTime(), home: { ...lead().home, type: '2 BHK', where: 'Chandivali' } });
    const projects = [{ id: 'p1', context: { name: 'Sea Breeze', clientName: 'Mrs Shah', clientEmail: 'KAVYA.M@outlook.com' } }];
    const m = findMatches([{ phone: '9833012345', email: '' }, { phone: '', email: 'kavya.m@outlook.com' }], [old], projects);
    expect(m.map((x) => [x.kind, x.id, x.by])).toEqual([['lead', 'old', 'phone'], ['client', 'p1', 'email']]);
    expect(m[0].detail).toMatch(/2 BHK in Chandivali\. Lost: "postponed"\./);
    expect(findMatches([{ phone: '', email: '' }], [old], projects)).toEqual([]);
  });
});

describe('from lead to project', () => {
  it('takes the people, the home and the brief, tagged Actual', () => {
    const p = leadToProject(lead());
    expect(p).toMatchObject({
      name: 'Mehta family · Hiranandani', clientName: 'Mr Rohan Mehta', clientEmail: 'rohan.mehta@gmail.com', clientPhone: '+91 98330 12345',
      location: 'Hiranandani, Powai · Tower B, 1402', area: 1150, config: '3 BHK', status: 'lead', isDummy: false, projectCategory: 'actual', leadId: 'l1',
    });
    expect(p.clientContacts).toEqual([{ id: 'b', name: 'Mrs Kavya Mehta', role: 'Decides with him', email: 'kavya.m@outlook.com', phone: '+91 98330 67890' }]);
    expect(p.clientBrief).toMatch(/Wants: Full home\. Style: Contemporary/);
    expect(JSON.stringify(p)).not.toContain('25–30');
    expect(conversionLines(lead())[0][1]).toBe('Mr Rohan Mehta (main) · Mrs Kavya Mehta · 2 emails, 2 phones');
  });
});

describe('this month', () => {
  it('counts new, meetings, won and the first call', () => {
    const s = leadStats([
      lead({ firstTouchAt: NOW - 40 * 60000 + 30 * 60000 }),
      lead({ id: 'b', stage: 'meeting' }),
      lead({ id: 'c', stage: 'won' }),
      lead({ id: 'd', stage: 'lost', lostReason: 'Budget' }), lead({ id: 'e', stage: 'lost', lostReason: 'Budget' }),
    ], NOW);
    expect([s.added, s.meetings, s.won, s.avgFirstCallMin]).toEqual([5, 2, 1, 30]);
    expect(lostReasons(s.lost)).toBe('budget (2)');
  });
});

describe('a pasted chat', () => {
  it('gives the sender, their number and the first message without the AI', () => {
    const r = readChat('[19/10/26, 10:02:11 AM] Rohan Mehta: Need interiors for new 3bhk Powai, budget ~30. My number +91 98330 12345, rohan@x.in');
    expect(r.people).toEqual([{ name: 'Rohan Mehta', phone: '+91 98330 12345', email: 'rohan@x.in' }]);
    expect(r.enquiry).toMatch(/^Need interiors/);
  });
});
