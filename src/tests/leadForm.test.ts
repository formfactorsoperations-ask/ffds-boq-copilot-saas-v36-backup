import { describe, it, expect } from 'vitest';
import {
  cleanEnquiry, enquiryProblems, looksLikeABot, leadFromEnquiry, recentSameLead, ownerFor, tenantOfToken, newFormToken, formLink, embedCode,
  leadFormOf, hourKey, MIN_FILL_MS,
} from '../../lib/leadForm';
import { opsSettingsOf } from '../../lib/opsDesk';

const NOW = new Date('2026-10-21T11:00:00+05:30').getTime();
const raw = (over: any = {}) => ({ name: '  Neha  Shah ', phone: '+91 98111 22233', email: 'NEHA@x.in', where: 'Powai', type: '3 BHK', scope: ['Full home', 'Kitchen'], message: 'Hi', website: '', openedAt: NOW - 20000, ...over });

describe('the form link', () => {
  it('names the studio, and nothing but a well-formed link does', () => {
    const t = newFormToken('studio_a', (n) => 'x'.repeat(n));
    expect(t).toBe(`studio_a.${'x'.repeat(24)}`);
    expect(tenantOfToken(t)).toBe('studio_a');
    expect(tenantOfToken('studio_a.short')).toBeNull();
    expect(tenantOfToken('../etc.xxxxxxxxxxxxxxxxxxxxxxxx')).toBeNull();
    expect(tenantOfToken('')).toBeNull();
    expect(formLink('https://app.x/', t, 'instagram')).toBe(`https://app.x/?enquire=${t}&src=instagram`);
    expect(formLink('https://app.x', t)).toBe(`https://app.x/?enquire=${t}`);
    expect(embedCode('https://app.x', t)).toContain('&embed=1');
  });
  it('is kept with the Ops Desk settings, so saving them never drops it', () => {
    const org = { opsDesk: { leadForm: { enabled: true, token: `s.${'a'.repeat(24)}`, ownerEmail: ' PRIYA@s.in ' } } };
    expect(leadFormOf(org)).toEqual({ enabled: true, token: `s.${'a'.repeat(24)}`, ownerEmail: 'priya@s.in' });
    expect(opsSettingsOf({ opsDesk: { leadForm: { enabled: true, token: 'bad' } } }).leadForm).toEqual({ enabled: true, token: '', ownerEmail: '' });
  });
});

describe('an enquiry', () => {
  it('is trimmed and cut to size, and its source checked', () => {
    const e = cleanEnquiry(raw({ source: 'instagram', message: 'x'.repeat(5000) }));
    expect([e.name, e.email, e.source, e.message.length]).toEqual(['Neha Shah', 'neha@x.in', 'instagram', 1000]);
    expect(cleanEnquiry(raw({ source: 'nonsense' })).source).toBe('website');
  });
  it('needs a name and a way to reach them', () => {
    expect(enquiryProblems(cleanEnquiry(raw()))).toEqual([]);
    expect(enquiryProblems(cleanEnquiry(raw({ name: 'N', phone: '12', email: '' })))).toEqual(['your name', 'a phone number or email to reach you']);
    expect(enquiryProblems(cleanEnquiry(raw({ phone: '', email: 'not-an-email' })))).toContain('an email that looks right');
  });
  it('is dropped when a bot filled the hidden field or sent it too fast', () => {
    expect(looksLikeABot(cleanEnquiry(raw()), NOW)).toBe(false);
    expect(looksLikeABot(cleanEnquiry(raw({ website: 'http://spam' })), NOW)).toBe(true);
    expect(looksLikeABot(cleanEnquiry(raw({ openedAt: NOW - MIN_FILL_MS + 500 })), NOW)).toBe(true);
    expect(looksLikeABot(cleanEnquiry(raw({ openedAt: 0 })), NOW)).toBe(true);
  });
  it('becomes a new lead with a call today, marked as from the form', () => {
    const l = leadFromEnquiry(cleanEnquiry(raw()), { tenantId: 's', owner: { email: 'priya@s.in', name: 'Priya' }, now: NOW, id: 'abc12345xyz' });
    expect(l).toMatchObject({ tenantId: 's', ownerEmail: 'priya@s.in', stage: 'new', source: 'website', createdBy: 'website-form', projectId: null, firstTouchAt: null });
    expect(l.people[0]).toMatchObject({ name: 'Neha Shah', phone: '+91 98111 22233', email: 'neha@x.in', main: true });
    expect(l.home).toMatchObject({ where: 'Powai', type: '3 BHK', scope: ['Full home', 'Kitchen'], budget: '' });
    expect(l.next).toEqual({ text: 'Call to understand the brief', due: '2026-10-21', kind: 'call' });
    expect(l.touches[0].text).toMatch(/^Enquiry from the website form\.\nHi\nHome: 3 BHK, Powai\nWants: Full home, Kitchen/);
  });
});

describe('the same person twice', () => {
  const lead = (over: any) => ({ id: 'l1', createdAt: NOW - 3600000, stage: 'new', people: [{ phone: '098111-22233', email: '' }], ...over });
  it('adds to their lead within a day, and starts a new one after', () => {
    expect(recentSameLead(cleanEnquiry(raw()), [lead({})] as any, NOW)).toBe('l1');
    expect(recentSameLead(cleanEnquiry(raw()), [lead({ createdAt: NOW - 2 * 86400000 })] as any, NOW)).toBeNull();
    expect(recentSameLead(cleanEnquiry(raw()), [lead({ stage: 'lost' })] as any, NOW)).toBeNull();
    expect(recentSameLead(cleanEnquiry(raw({ phone: '', email: 'neha@x.in' })), [lead({ people: [{ phone: '', email: 'Neha@X.in' }] })] as any, NOW)).toBe('l1');
  });
});

describe('who gets it', () => {
  const team = [
    { email: 'anish@s.in', name: 'Anish', role: 'Ops Director' },
    { email: 'anushka@s.in', name: 'Anushka', role: 'Client Relations' },
    { email: 'priya@s.in', name: 'Priya', role: 'Designer', roles: ['Client Relations'] },
  ];
  it('is the chosen person, else the Client Relations person with fewest new leads, else a lead', () => {
    expect(ownerFor({ ownerEmail: 'anish@s.in' }, team, [])).toEqual({ email: 'anish@s.in', name: 'Anish' });
    expect(ownerFor({ ownerEmail: 'gone@s.in' }, team, [{ ownerEmail: 'anushka@s.in', stage: 'new' }] as any)).toEqual({ email: 'priya@s.in', name: 'Priya' });
    expect(ownerFor({ ownerEmail: '' }, [team[0]], [])).toEqual({ email: 'anish@s.in', name: 'Anish' });
    expect(ownerFor({ ownerEmail: '' }, [], [])).toBeNull();
  });
  it('counts submissions by the hour, in India', () => {
    expect(hourKey(NOW)).toBe('2026-10-21T11');
  });
});
