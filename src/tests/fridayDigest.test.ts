/* The Friday digest (lib/fridayDigest). Made-up data only. */
import { describe, it, expect } from 'vitest';
import { digestWeekOf, weekWindow, pulseFor, draftDigest, digestEmail } from '../../lib/fridayDigest';

/* Wednesday 11 November 2026 in India; the week's Friday is 13 November. */
const NOW = new Date('2026-11-11T14:00:00+05:30').getTime();
const at = (key: string) => new Date(`${key}T12:00:00+05:30`).getTime();

describe('the week', () => {
  it('belongs to its Friday, Monday to Sunday', () => {
    expect(digestWeekOf(NOW)).toBe('2026-11-13');
    expect(digestWeekOf(at('2026-11-09'))).toBe('2026-11-13');
    expect(digestWeekOf(at('2026-11-14'))).toBe('2026-11-13');
    expect(digestWeekOf(at('2026-11-15'))).toBe('2026-11-13');
    expect(digestWeekOf(at('2026-11-16'))).toBe('2026-11-20');
  });

  it('covers Saturday to Friday', () => {
    const w = weekWindow('2026-11-13');
    expect(new Date(w.from).toISOString()).toBe('2026-11-06T18:30:00.000Z');
    expect(new Date(w.to).toISOString()).toBe('2026-11-13T18:29:59.999Z');
  });
});

const base = { week: '2026-11-13', projectName: 'Sea Breeze', client: 'Mrs Shah & Mr Shah', sender: 'Anushka', studio: 'Form Factors', progress: 81 };

describe('drafting from the records', () => {
  it('uses the week’s Weekly Pulse when there is one, without payment asks', () => {
    const ctx = {
      targetHandoverDate: '2026-12-03',
      weeklyReports: [
        { id: 'w1', weekOf: '2026-11-09', weekNumber: 12, thisWeek: 'Living room putty and first coat.\nKitchen shutters fixed.', nextWeek: 'Final coat in all rooms.',
          photos: ['https://x/1.jpg', 'data:image/png;base64,AAA'], asks: [{ kind: 'decision', label: 'Wardrobe handles by Wednesday', detail: '' }, { kind: 'payment', label: 'Payment 3 of ₹3,20,000', detail: '' }] },
        { id: 'w0', weekOf: '2026-11-02', weekNumber: 11, thisWeek: 'Old week', nextWeek: '' },
      ],
    };
    expect(pulseFor(ctx, '2026-11-13')?.id).toBe('w1');
    const d = draftDigest({ ...base, ctx });
    expect(d.sources[0]).toBe('Weekly Pulse, week 12');
    expect(d.done).toEqual(['Living room putty and first coat.', 'Kitchen shutters fixed.']);
    expect(d.next).toEqual(['Final coat in all rooms.']);
    expect(d.asks).toEqual(['Wardrobe handles by Wednesday']);
    expect(d.photos).toEqual(['https://x/1.jpg']);
    expect(d.body).toContain('Hi Mrs Shah, here is how Sea Breeze moved this week.');
    expect(d.body).toContain('81% done · handover 3 December');
    expect(d.body).not.toContain('3,20,000');
    expect(d.body).not.toContain('Payment');
    expect(d.body.endsWith('Anushka, Form Factors')).toBe(true);
  });

  it('drafts from site updates, approvals, decisions and visits without one', () => {
    const d = draftDigest({
      ...base,
      ctx: { siteUpdates: [{ id: 's1', date: '2026-11-10', title: 'Master bath fittings in', type: 'site', images: ['https://x/2.jpg'] }, { id: 's0', date: '2026-10-01', title: 'Old', type: 'site' }] },
      siteUpdates: [{ id: 'u1', date: '2026-11-12', text: 'Paid the vendor ₹45,000 for hinges; hinges fixed' }],
      approvals: [
        { sheets: [{ room: 'Kitchen', name: 'Layout' }], stage: 'approved', approvedAt: at('2026-11-09') },
        { sheets: [{ room: 'Bedroom', name: 'Wardrobe' }, { room: 'Bedroom', name: 'Loft' }], stage: 'sent', approvedAt: null },
      ],
      decisions: [{ id: 'd1', decisionText: 'Laminate shade for the TV unit', status: 'notified' }],
      visits: [{ purpose: 'Site visit', slot: { date: '2026-11-15', time: '11:00' }, status: 'confirmed' }],
    });
    expect(d.done).toEqual(['Master bath fittings in', 'Paid the vendor ₹ amount for hinges; hinges fixed', 'Your approval of Kitchen – Layout is recorded, thank you']);
    expect(d.next).toEqual(['Site visit on Sun, 15 Nov at 11:00 AM']);
    expect(d.asks).toEqual(['Your choice on Laminate shade for the TV unit', 'Your written approval of 2 drawings, by replying to our email']);
    expect(d.photos).toEqual(['https://x/2.jpg']);
    expect(d.quiet).toBe(false);
    expect(d.body).not.toContain('45,000');
  });

  it('says so when the week was quiet', () => {
    const d = draftDigest({ ...base, ctx: {} });
    expect(d.quiet).toBe(true);
    expect(d.sources).toEqual(['Nothing recorded this week']);
    expect(d.body).toContain('A quieter week');
  });
});

describe('the email', () => {
  it('escapes the text, masks money again and links the photos', () => {
    const e = digestEmail({ subject: 'Update', body: 'Hi <b>Mrs Shah</b>,\nPaid Rs 5,000', photos: ['https://x/1.jpg', 'javascript:alert(1)'] }, 'Form Factors');
    expect(e.html).toContain('Hi &lt;b&gt;Mrs Shah&lt;/b&gt;,<br>');
    expect(e.html).not.toContain('5,000');
    expect(e.html).toContain('<a href="https://x/1.jpg">Photo 1</a>');
    expect(e.html).not.toContain('javascript');
    expect(e.text).toContain('Photo 1: https://x/1.jpg');
  });
});

import { digestQueue } from '../../lib/fridayDigest';

describe('on the Today list', () => {
  const projects = [{ id: 'a', name: 'Sea Breeze', inWork: true }, { id: 'b', name: 'Harmony 704', inWork: true }, { id: 'c', name: 'Lodha Amara', inWork: false }];
  const friday = new Date('2026-11-13T10:00:00+05:30').getTime();

  it('gives a lead each update to approve', () => {
    const q = digestQueue({ projects, digests: { a: { status: 'pending_review', preparedByName: 'Anushka' } }, isLead: true, canWrite: true, week: '2026-11-13', now: NOW });
    expect(q.map((x) => x.title)).toEqual(['Approve the Friday update: Sea Breeze']);
  });

  it('gives the writer what was sent back, what to send, and on Friday what to write', () => {
    const q = digestQueue({ projects, digests: { a: { status: 'returned', reviewNote: 'Add the laminate date' }, b: { status: 'approved' } }, isLead: false, canWrite: true, week: '2026-11-13', now: NOW });
    expect(q.map((x) => x.title)).toEqual(['Friday update sent back: Sea Breeze', 'Send the Friday update: Harmony 704']);
    const fri = digestQueue({ projects, digests: {}, isLead: false, canWrite: true, week: '2026-11-13', now: friday });
    expect(fri).toHaveLength(1);
    expect(fri[0]).toMatchObject({ title: 'Write this week’s Friday updates', detail: '2 clients still to write' });
  });

  it('asks nothing of someone who cannot write', () => {
    expect(digestQueue({ projects, digests: { b: { status: 'approved' } }, isLead: false, canWrite: false, week: '2026-11-13', now: friday })).toEqual([]);
  });
});
