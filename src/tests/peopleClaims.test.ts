import { describe, it, expect } from 'vitest';
import { DEFAULT_POLICY, scopeSnapshot, type Person, type RequestRecord, type Snapshot } from '../../lib/peopleDesk';
import {
  cleanClaim, kmAmount, cleanRates, canDecide, canDelete, decideClaim, payClaim, withdrawClaim, claimsView, totalsOf, claimsMonth, claimsCsv, recentTrips,
  DEFAULT_RATES, type Claim,
} from '../../lib/peopleClaims';
import { claimLoggedDraft, claimDecidedDraft, claimDeletedDraft, foldedTitle } from '../../lib/notify';
import { leaveYear, leaveYearCsv } from '../../lib/peopleView';

const person = (id: string, over: Partial<Person> = {}): Person => ({ id, name: id.toUpperCase(), title: '', teamId: 'design', managerId: '', accessRole: 'employee', active: true, email: `${id}@studio.in`, ...over });
const TODAY = '2026-11-04';
const anish = person('anish', { accessRole: 'admin', name: 'Anish K' });
const meera = person('meera', { accessRole: 'admin', name: 'Meera S' });
const riya = person('riya', { name: 'Riya Shah' });
const team = [anish, meera, riya];
const trip = (over: Record<string, unknown> = {}) => ({ date: TODAY, purpose: 'Site visit', place: 'Bandra site', from: 'Office', to: 'Bandra', mode: 'bike', amount: 96, ...over });
const claimOf = (over: Partial<Claim> = {}): Claim => ({
  id: 'riya_1', personId: 'riya', ...cleanClaim(trip(), DEFAULT_RATES, TODAY), receipt: false, status: 'Pending', createdAt: `${TODAY}T10:00:00Z`, decisions: [], ...over,
});

describe('logging a trip (the owner, 4 Nov 2026: amount first)', () => {
  it('claims what the person says it cost; km, when given for own bike or car, are kept with the studio rate', () => {
    expect(cleanClaim(trip(), DEFAULT_RATES, TODAY)).toMatchObject({ amount: 96, km: 0, roundTrip: false, rate: 0 });
    expect(cleanClaim(trip({ km: 12, roundTrip: true }), { bike: 5, car: 12 }, TODAY)).toMatchObject({ amount: 96, km: 12, roundTrip: true, rate: 5 });
    expect(cleanClaim(trip({ mode: 'cab', amount: '340.4', km: 12 }), DEFAULT_RATES, TODAY)).toMatchObject({ amount: 340, km: 0, rate: 0 });
    expect(cleanClaim(trip({ mode: 'car', km: '', amount: 150 }), DEFAULT_RATES, TODAY).km).toBe(0);
  });
  it('works out an amount from km, for the helper', () => {
    expect(kmAmount(6, true, 2)).toBe(24);
    expect(kmAmount(7.5, false, 4)).toBe(30);
  });
  it('says what is missing, in words', () => {
    expect(() => cleanClaim(trip({ place: '' }), DEFAULT_RATES, TODAY)).toThrow(/where you went/);
    expect(() => cleanClaim(trip({ amount: '' }), DEFAULT_RATES, TODAY)).toThrow(/what the trip cost/);
    expect(() => cleanClaim(trip({ amount: 0 }), DEFAULT_RATES, TODAY)).toThrow(/what the trip cost/);
    expect(() => cleanClaim(trip({ amount: 200000 }), DEFAULT_RATES, TODAY)).toThrow(/more than one trip/);
    expect(() => cleanClaim(trip({ km: -3 }), DEFAULT_RATES, TODAY)).toThrow(/distance/);
    expect(() => cleanClaim(trip({ date: '2026-11-05' }), DEFAULT_RATES, TODAY)).toThrow(/once it has happened/);
    expect(() => cleanClaim(trip({ date: '2026-07-01' }), DEFAULT_RATES, TODAY)).toThrow(/older than 90 days/);
    expect(() => cleanClaim(trip({ purpose: 'Holiday' }), DEFAULT_RATES, TODAY)).toThrow(/what the trip was for/);
    expect(() => cleanClaim(trip({ mode: 'jet' }), DEFAULT_RATES, TODAY)).toThrow(/how you travelled/);
  });
  it('keeps the rates sensible', () => {
    expect(cleanRates({ bike: '4.5', car: 11 })).toEqual({ bike: 4.5, car: 11 });
    expect(() => cleanRates({ bike: -1, car: 10 })).toThrow(/bike rate/);
  });
});

describe('founders decide and pay back', () => {
  it('a founder decides anyone’s trips but their own, unless they are the only founder', () => {
    expect(canDecide(anish, { personId: 'riya' }, team)).toBe(true);
    expect(canDecide(riya, { personId: 'riya' }, team)).toBe(false);
    expect(canDecide(anish, { personId: 'anish' }, team)).toBe(false);
    expect(canDecide(anish, { personId: 'anish' }, [anish, riya])).toBe(true);
  });
  it('approves, turns down with a reason, and pays back once', () => {
    const c = claimOf();
    const ok = decideClaim(c, anish, team, 'approve', '', 'now');
    expect([ok.status, ok.decisions[0].byName]).toEqual(['Approved', 'Anish K']);
    expect(() => decideClaim(c, anish, team, 'reject', 'no', 'now')).toThrow(/Say why/);
    expect(decideClaim(c, anish, team, 'reject', 'Personal trip', 'now').status).toBe('Rejected');
    expect(() => decideClaim(ok, meera, team, 'approve', '', 'now')).toThrow(/already approved/);
    expect(() => payClaim(c, anish, team, 'now')).toThrow(/Only an approved claim/);
    const paid = payClaim(ok, meera, team, 'now');
    expect(paid.status).toBe('Paid');
    expect(() => payClaim(paid, meera, team, 'now')).toThrow(/Already paid/);
    expect(() => decideClaim(c, riya, team, 'approve', '', 'now')).toThrow(/Only a founder/);
  });
  it('the person can take back a trip only while it waits', () => {
    expect(withdrawClaim(claimOf(), riya, 'now').status).toBe('Withdrawn');
    expect(() => withdrawClaim(claimOf(), anish, 'now')).toThrow(/Only the person/);
    expect(() => withdrawClaim(claimOf({ status: 'Approved' }), riya, 'now')).toThrow(/still waiting/);
  });
});

describe('deleting a trip (the owner, 4 Nov 2026)', () => {
  it('its person, until it is approved; a founder, anyone else’s at any stage', () => {
    for (const status of ['Pending', 'Rejected', 'Withdrawn'] as const) expect(canDelete(riya, { personId: 'riya', status })).toBe(true);
    for (const status of ['Approved', 'Paid'] as const) expect(canDelete(riya, { personId: 'riya', status })).toBe(false);
    expect(canDelete(riya, { personId: 'anish', status: 'Pending' })).toBe(false);
    expect(canDelete(anish, { personId: 'riya', status: 'Paid' })).toBe(true);
    expect(canDelete(anish, { personId: 'anish', status: 'Approved' })).toBe(false);
    expect(canDelete({ ...anish, active: false }, { personId: 'riya', status: 'Pending' })).toBe(false);
  });
  it('tells the person when a founder deletes theirs', () => {
    expect(claimDeletedDraft({ amount: 96, place: 'Bandra site', date: TODAY }, { byName: 'Anish K', toEmail: 'riya@studio.in' }))
      .toMatchObject({ kind: 'claims.deleted', title: 'Anish K deleted your trip claim of ₹96', section: 'travel' });
  });
});

describe('what each person sees, and the totals', () => {
  const list = [
    claimOf({ id: 'a', date: '2026-11-01', status: 'Pending', amount: 100 }),
    claimOf({ id: 'b', date: '2026-11-02', status: 'Approved', amount: 200 }),
    claimOf({ id: 'c', date: '2026-11-03', status: 'Paid', amount: 300 }),
    claimOf({ id: 'd', date: '2026-11-03', status: 'Rejected', amount: 50 }),
    claimOf({ id: 'e', date: '2026-11-03', status: 'Withdrawn', amount: 70 }),
    claimOf({ id: 'f', personId: 'anish', date: '2026-10-30', status: 'Pending', amount: 40 }),
  ];
  it('someone sees their own; a founder also sees what waits for them and what to pay back', () => {
    const r = claimsView(list, riya, team, DEFAULT_RATES);
    expect([r.founder, r.all.length, r.toDecide.length, r.mine.map((c) => c.id)]).toEqual([false, 0, 0, ['c', 'd', 'e', 'b', 'a']]);
    const a = claimsView(list, anish, team, DEFAULT_RATES);
    expect(a.toDecide.map((c) => c.id)).toEqual(['a']); // never their own: Meera decides that one
    expect(a.toPay.map((c) => c.id)).toEqual(['b']);
    expect(claimsView(list, meera, team, DEFAULT_RATES).toDecide.map((c) => c.id)).toEqual(['f', 'a']);
  });
  it('totals count trips taken back nowhere, and turned down only as turned down', () => {
    expect(totalsOf(list.slice(0, 5))).toMatchObject({ trips: 3, claimed: 600, waiting: 100, approved: 500, paid: 300, rejected: 50 });
  });
  it('the month, person by person, the most claimed first, and its spreadsheet', () => {
    const m = claimsMonth(list, '2026-11', (id) => team.find((p) => p.id === id)?.name || id);
    expect(m.rows.map((r) => [r.name, r.totals.claimed])).toEqual([['Riya Shah', 600]]);
    expect(m.totals.claimed).toBe(600);
    const csv = claimsCsv(list, '2026-11', (id) => team.find((p) => p.id === id)?.name || id).split('\n');
    expect(csv).toHaveLength(5); // the header and four trips (the one taken back is left out)
    expect(csv[1]).toContain('Riya Shah,Site visit,Bandra site');
  });
  it('offers recent trips to repeat, once each', () => {
    expect(recentTrips([claimOf({ id: '1' }), claimOf({ id: '2' }), claimOf({ id: '3', place: 'Tile shop' })]).map((c) => c.id)).toEqual(['1', '3']);
  });
});

describe('telling people', () => {
  it('asks the founders, folding a person’s trips in a day', () => {
    const d = claimLoggedDraft({ id: 'x', date: TODAY, place: 'Bandra site', amount: 96, purpose: 'Site visit' }, { name: 'Riya Shah', personId: 'riya', emails: ['anish@studio.in'] })!;
    expect([d.title, d.level, d.section, d.group]).toEqual(['Riya Shah logged a trip: ₹96', 'needs', 'travel', `claims:riya:${TODAY}`]);
    expect(foldedTitle({ kind: d.kind, title: d.title, count: 3, actor: d.actor })).toBe('Riya Shah logged 3 trips');
    expect(claimLoggedDraft({ id: 'x', date: TODAY, place: 'x', amount: 1, purpose: 'x' }, { name: 'R', personId: 'r', emails: [] })).toBeNull();
  });
  it('tells the person of a decision or a payment', () => {
    expect(claimDecidedDraft({ status: 'Rejected', amount: 96, count: 1, place: 'Bandra site', note: 'Personal' }, { byName: 'Anish K', toEmail: 'riya@studio.in' }).title).toBe('Your trip claim of ₹96 was not approved');
    expect(claimDecidedDraft({ status: 'Paid', amount: 1200, count: 4 }, { byName: 'Anish K', toEmail: 'riya@studio.in' }).title).toBe('₹1,200 paid back for 4 trips');
  });
});

describe('the leave year (the owner, 4 Nov 2026)', () => {
  const req = (id: string, employeeId: string, type: any, dates: string[], status: any = 'Approved'): RequestRecord => ({
    id, employeeId, kind: 'leave', type, start: dates[0], end: dates[dates.length - 1], portion: 'Full day', days: dates.map((date) => ({ date, units: 1 })),
    reason: '', status, version: 1, createdAt: `${dates[0]}T00:00:00Z`, decisions: [],
  });
  const snap = (me: Person, people: Person[], requests: RequestRecord[]): Snapshot => ({
    me, people, policy: DEFAULT_POLICY, attendance: [], requests, availability: [], balances: {}, serverTime: `${TODAY}T06:00:00Z`, revision: 1,
  });
  const ravi = person('ravi', { managerId: 'meena', entitlements: { 2026: { PL: 15 } } });
  const tara = person('tara');
  const requests = [
    req('1', 'ravi', 'PL', ['2026-05-04', '2026-05-05']),
    req('2', 'ravi', 'SL', ['2026-09-10']),
    req('3', 'ravi', 'PL', ['2026-12-01'], 'Pending'),
    req('4', 'ravi', 'WFH', ['2026-10-01']),
    req('5', 'tara', 'CL', ['2026-06-02']),
    req('6', 'ravi', 'PL', ['2026-02-02']), // the year before
  ];
  it('shows taken, waiting and left by type, and when in the year', () => {
    const rows = leaveYear(snap(person('boss', { accessRole: 'admin' }), [ravi, tara], requests), '2026');
    const r = rows.find((x) => x.person.id === 'ravi')!;
    expect([r.balances.PL.entitled, r.balances.PL.used, r.balances.PL.reserved, r.balances.PL.available]).toEqual([15, 2, 1, 12]);
    expect([r.taken, r.left, r.wfh]).toEqual([3, 12 + 5 + 6, 1]);
    expect(r.byMonth[1]).toBe(2); // May, the second month from April
    expect(r.byMonth[5]).toBe(1); // September
    expect(rows.map((x) => x.person.id)).toEqual(['boss', 'ravi', 'tara']);
    expect(leaveYearCsv(rows, '2026').split('\n')[2]).toContain('RAVI,15,2,1,12');
  });
  it('a manager sees themselves and their people only', () => {
    const meena = person('meena', { accessRole: 'manager' });
    expect(leaveYear(snap(meena, [ravi, tara], requests.filter((r) => r.employeeId === 'ravi')), '2026').map((x) => x.person.id)).toEqual(['meena', 'ravi']);
  });
  it('hands each approver their people’s allowances, and nobody else’s', () => {
    const boss = person('boss', { accessRole: 'manager', entitlements: { 2026: { PL: 14 } } });
    const mine = person('mine', { managerId: 'boss', entitlements: { 2026: { PL: 15 } } });
    const other = person('other', { entitlements: { 2026: { PL: 18 } } });
    const store = { people: [boss, mine, other], policy: DEFAULT_POLICY, attendance: [], requests: [], events: [] };
    const seen = Object.fromEntries(scopeSnapshot(store, 'boss', `${TODAY}T06:00:00Z`).people.map((p) => [p.id, p.entitlements]));
    expect(seen).toEqual({ boss: { 2026: { PL: 14 } }, mine: { 2026: { PL: 15 } }, other: undefined });
    expect(scopeSnapshot(store, 'mine', `${TODAY}T06:00:00Z`).people.find((p) => p.id === 'boss')?.entitlements).toBeUndefined();
  });
});
