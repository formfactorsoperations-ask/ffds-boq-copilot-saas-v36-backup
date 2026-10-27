/*
  People, made fast (27 Oct 2026): the store keeps the newest answer and asks
  "anything new?", a command's change is merged into what is on screen, the
  location reading takes the quick path when it can, and the date formatters
  are made once.
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_POLICY, availabilityOf, businessDate, timeLabel, type Attendance, type RequestRecord, type Snapshot } from '../../lib/peopleDesk';
import { mergeChange } from '../../lib/peopleView';

/* The callables, answered by hand: `calls` records what was asked; `answer` decides the reply. */
const calls: { region: string; name: string; data: any; resolve: (v: any) => void; reject: (e: any) => void }[] = [];
vi.mock('firebase/functions', () => ({
  httpsCallable: (fns: any, name: string) => (data: any) => new Promise((resolve, reject) => calls.push({ region: fns.region, name, data, resolve: (v) => resolve({ data: v }), reject })),
}));
vi.mock('../../services/firebaseClient', () => ({
  functions: { region: 'us-central1' },
  functionsIn: (region: string) => ({ region }),
}));
vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({}) }));

const flush = () => new Promise((r) => setTimeout(r, 0));
const policy = { ...DEFAULT_POLICY, holidays: [] };
const me = { id: 'me', name: 'Me', title: '', teamId: 't', managerId: '', accessRole: 'employee' as const, active: true };
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  me, people: [me], policy, attendance: [], requests: [], availability: [], balances: {}, serverTime: '2026-10-27T05:00:00.000Z', revision: 0, version: 'v1', ...over,
});
const session = (over: Partial<Attendance> = {}): Attendance => ({ id: 's1', employeeId: 'me', date: '2026-10-27', checkIn: '2026-10-27T05:00:00.000Z', mode: 'Office', site: '', version: 1, ...over });
const leave = (over: Partial<RequestRecord> = {}): RequestRecord => ({
  id: 'r1', employeeId: 'me', kind: 'leave', type: 'PL', start: '2026-11-02', end: '2026-11-02', portion: 'Full day', status: 'Pending', days: [{ date: '2026-11-02', units: 1 }], createdAt: '2026-10-27T05:00:00.000Z', version: 1,
  ...over,
} as any);

describe('the store', () => {
  let svc: typeof import('../../services/peopleService');
  beforeEach(async () => {
    calls.length = 0;
    vi.resetModules();
    svc = await import('../../services/peopleService');
  });
  it('asks asia-south1 first, and the us-central1 copy only when the function is not there yet', async () => {
    const done = svc.refreshPeople();
    expect(calls[0]).toMatchObject({ region: 'asia-south1', name: 'peopleSnapshot' });
    calls[0].reject({ code: 'functions/not-found', message: 'not found' });
    await flush();
    expect(calls[1]).toMatchObject({ region: 'us-central1', name: 'peopleSnapshot' });
    calls[1].resolve({ ok: true, snapshot: snap() });
    await done;
  });

  it('tries the first load twice before saying People could not open', async () => {
    const done = svc.refreshPeople();
    calls[0].reject({ code: 'functions/deadline-exceeded', message: 'deadline-exceeded' });
    await new Promise((r) => setTimeout(r, 700));
    expect(calls).toHaveLength(2);
    calls[1].resolve({ ok: true, snapshot: snap() });
    await done;
  });

  it('keeps a check-in that lands while an older refresh is on its way', async () => {
    /* Something on screen first. */
    const first = svc.refreshPeople();
    calls[0].resolve({ ok: true, snapshot: snap() });
    await first;
    /* A refresh sets off, carrying the version it has; then a check-in. */
    const refresh = svc.refreshPeople();
    expect(calls[1].data).toMatchObject({ since: 'v1' });
    const checkin = svc.runPeople('checkin', { mode: 'Office', site: '' } as any);
    await flush();
    expect(calls[2]).toMatchObject({ name: 'peopleCommand', data: { delta: true } });
    calls[2].resolve({ ok: true, replay: false, change: { session: session(), request: null } });
    const r: any = await checkin;
    expect(r.ok).toBe(true);
    expect(r.snapshot.attendance.map((a: Attendance) => a.id)).toEqual(['s1']);
    /* The older refresh answers last, from before the check-in: it is dropped (the next refresh still names v1). */
    calls[1].resolve({ ok: true, snapshot: snap({ version: 'v2' }) });
    await refresh;
    const again = svc.refreshPeople();
    expect(calls[3].data).toMatchObject({ since: 'v1' });
    calls[3].resolve({ ok: true, unchanged: true });
    await again;
  });

  it('a request also moves balances, so a refresh follows the merge', async () => {
    const first = svc.refreshPeople();
    calls[0].resolve({ ok: true, snapshot: snap() });
    await first;
    const run = svc.runPeople('request', {} as any);
    await flush();
    calls[1].resolve({ ok: true, replay: false, change: { session: null, request: leave() } });
    const r: any = await run;
    expect(r.snapshot.availability).toHaveLength(1);
    await flush();
    expect(calls[2]).toMatchObject({ name: 'peopleSnapshot' });
  });

  it('still takes the whole snapshot from a server that does not send changes', async () => {
    const run = svc.runPeople('checkin', {} as any);
    await flush();
    calls[0].resolve({ ok: true, replay: false, snapshot: snap({ attendance: [session()] }) });
    const r: any = await run;
    expect(r.snapshot.attendance).toHaveLength(1);
  });
});

describe("a command's change, merged", () => {
  it('replaces or adds the session, and shows a leave request as availability', () => {
    const s = snap({ attendance: [session({ checkOut: undefined })] });
    const out = mergeChange(s, { session: session({ checkOut: '2026-10-27T13:00:00.000Z', version: 2 }) });
    expect(out.attendance).toHaveLength(1);
    expect(out.attendance[0].version).toBe(2);
    const asked = mergeChange(s, { request: leave() });
    expect(asked.availability).toEqual([availabilityOf(leave())]);
    const withdrawn = mergeChange(asked, { request: leave({ status: 'Withdrawn' as any }) });
    expect(withdrawn.availability).toEqual([]);
    expect(mergeChange(s, { session: null, request: null })).toBe(s);
  });
});

describe('locating', () => {
  const fix = (accuracy: number) => ({ coords: { latitude: 19, longitude: 72, accuracy } });
  let asked: PositionOptions[];
  const geo = (answers: Array<number | 'denied'>) => {
    asked = [];
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: any, fail: any, o: PositionOptions) => {
          asked.push(o);
          const a = answers.shift();
          setTimeout(() => (a === 'denied' ? fail({ code: 1 }) : a === undefined ? fail({ code: 3 }) : ok(fix(a))), 0);
        },
      },
    });
  };

  it('keeps a quick reading that is already precise enough, without waiting for GPS', async () => {
    vi.resetModules();
    const { locate } = await import('../../services/peopleService');
    geo([40]);
    const r = await locate({ goodWithinM: 100, maxWaitMs: 10000 });
    expect(r.reading?.accuracyM).toBe(40);
    expect(asked).toHaveLength(1);
    expect(asked[0].enableHighAccuracy).toBe(false);
  });

  it('asks for a precise reading when the quick one is too coarse, and reuses it next time', async () => {
    vi.resetModules();
    const { locate } = await import('../../services/peopleService');
    geo([1500, 25]);
    const r = await locate({ goodWithinM: 100, maxWaitMs: 10000 });
    expect(r.reading?.accuracyM).toBe(25);
    expect(asked.map((o) => o.enableHighAccuracy)).toEqual([false, true]);
    const again = await locate({ goodWithinM: 100, maxWaitMs: 10000 });
    expect(again.reading?.accuracyM).toBe(25);
    expect(asked).toHaveLength(2);
  });

  it('says so at once when location is blocked', async () => {
    vi.resetModules();
    const { locate } = await import('../../services/peopleService');
    geo(['denied']);
    expect(await locate({ goodWithinM: 100, maxWaitMs: 10000 })).toEqual({ reading: null, why: 'denied' });
  });
});

describe('dates, with formatters made once', () => {
  it('reads the same in each timezone, called again and again', () => {
    for (let i = 0; i < 3; i++) {
      expect(businessDate('2026-10-27T20:00:00.000Z', 'Asia/Kolkata')).toBe('2026-10-28');
      expect(businessDate('2026-10-27T20:00:00.000Z', 'America/New_York')).toBe('2026-10-27');
      expect(timeLabel('2026-10-27T04:12:00.000Z', 'Asia/Kolkata')).toBe('09:42');
      expect(timeLabel('2026-10-27T04:12:00.000Z', 'UTC')).toBe('04:12');
    }
  });
});
