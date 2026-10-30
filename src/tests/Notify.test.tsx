import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within, waitFor } from '@testing-library/react';
import { DEFAULT_PREFS, stamp, type NotifyPrefs, type Stored } from '../../lib/notify';

/* The inbox, without Firestore: the test plays the server's notes into the listener. */
const h = vi.hoisted(() => ({
  push: null as null | ((notes: any[]) => void),
  done: vi.fn(async () => {}),
  read: vi.fn(async () => {}),
  snooze: vi.fn(async () => {}),
  undo: vi.fn(async () => {}),
  prefs: null as any,
  save: vi.fn(async () => {}),
}));
vi.mock('../../services/notifyPrefsService', () => ({
  cachedPrefs: () => h.prefs, readPrefs: async () => h.prefs, savePrefs: h.save,
}));
vi.mock('../../services/inboxService', () => ({
  listenInbox: (_email: string, cb: (n: any[]) => void) => { h.push = cb; return () => { h.push = null; }; },
  markDone: h.done, markRead: h.read, snooze: h.snooze, undoDone: h.undo,
}));

const phone = vi.hoisted(() => ({
  state: 'off' as string,
  on: vi.fn(async () => 'on'),
  off: vi.fn(async () => 'off'),
  tap: null as null | ((id: string) => void),
}));
vi.mock('../../components/notify/notifyPush', () => ({
  phoneState: async () => phone.state,
  turnPhoneOn: phone.on,
  turnPhoneOff: phone.off,
  refreshPhone: async () => {},
  platformName: () => 'Android · Chrome',
  onPhoneTap: (fn: (id: string) => void) => { phone.tap = fn; return () => { phone.tap = null; }; },
}));

import { NotifyProvider, NOTE_EVENT, useInbox } from '../../components/notify/NotifyContext';
import CatchUp, { awaySummary, sinceAway } from '../../components/notify/CatchUp';
import NotifyBell from '../../components/notify/NotifyBell';
import NeedsYouBar from '../../components/notify/NeedsYouBar';
import NotifySettings from '../../components/notify/NotifySettings';
import WaitingOnYou from '../../components/notify/WaitingOnYou';
import { BellGlyph } from '../../components/notify/NotifyBits';

const note = (id: string, over: Partial<Stored> = {}): Stored => ({
  ...stamp({ kind: 'client.message', area: 'clients', level: 'needs', title: 'Mr Prasad Naik sent you a message', line: '“Walnut, not oak.”', projectId: 'p1', projectName: 'Harmony 704', route: 'comms-tracker', action: 'Reply', actor: 'Mr Prasad Naik', group: null, to: {} }, Date.now()),
  id, ...over,
});
const checkin = (id: string, who: string) => note(id, { kind: 'people.checkin', area: 'team', level: 'update', title: `${who} checked in`, line: '9:42 AM · at the office', projectId: null, projectName: null, route: 'people', action: null, actor: who, group: 'checkin:2026-10-22' });

const Tabs = () => {
  const inbox = useInbox()!;
  return <p data-testid="tabs">{(Object.entries(inbox.byTab) as [string, { needs: number; unread: number }][]).map(([t, c]) => `${t}:${c.needs}/${c.unread}`).sort().join(' ')}</p>;
};

function setup(onOpen = vi.fn(), tab?: string) {
  render(
    <NotifyProvider box="inbox/riya@ff.in" tab={tab} onOpen={onOpen}>
      <NotifyBell />
      <NeedsYouBar />
      <Tabs />
    </NotifyProvider>,
  );
  return onOpen;
}
const serve = (notes: Stored[]) => act(() => { h.push!(notes); });

beforeEach(() => { Object.values(h).forEach((f: any) => f?.mockClear?.()); phone.state = 'off'; phone.on.mockClear(); phone.off.mockClear(); try { window.localStorage.clear(); } catch { /* none */ } window.history.replaceState(null, '', '/'); h.prefs = { ...DEFAULT_PREFS, quiet: 'off' } as NotifyPrefs; document.title = 'StudioDesk'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('notifications in the app', () => {
  it('counts on the tabs and the bell the moment notes land, and shows the count in the browser tab', () => {
    setup();
    serve([note('a'), checkin('b', 'Arjun Rao')]);
    expect(screen.getByTestId('tabs').textContent).toBe('ops-desk:1/0 people:0/1');
    expect(screen.getByRole('button', { name: 'Notifications, 2 for you' })).toBeTruthy();
    expect(document.title).toBe('(2) StudioDesk');
  });

  it('clears a tab\'s badge once its screen is open, and keeps what waits on you in the bell', () => {
    setup(vi.fn(), 'ops-desk');
    serve([note('a'), checkin('b', 'Arjun Rao')]);
    expect(screen.getByTestId('tabs').textContent).toBe('people:0/1');
    expect(h.read).toHaveBeenCalledWith('inbox/riya@ff.in', ['a']);
    expect(screen.getByRole('button', { name: 'Notifications, 1 for you' })).toBeTruthy();
    /* One that lands while the tab is open is read too. */
    serve([note('c'), note('a', { readAt: 1 }), checkin('b', 'Arjun Rao')]);
    expect(screen.getByTestId('tabs').textContent).toBe('people:0/1');
    expect(h.read).toHaveBeenLastCalledWith('inbox/riya@ff.in', ['c']);
  });

  it('does not interrupt for what was already there, only for what arrives', () => {
    setup();
    serve([note('old')]);
    expect(screen.queryByRole('status')).toBeNull();
    serve([note('new', { title: 'Riya Menon asked for planned leave', kind: 'people.leave', action: 'Review' }), note('old')]);
    const bar = screen.getByRole('status');
    expect(within(bar).getByText('Riya Menon asked for planned leave')).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Review' })).toBeTruthy();
  });

  it('never puts a plain update in the bar, and announces every arrival to the screens', () => {
    setup();
    serve([]);
    const heard: string[] = [];
    const on = (e: Event) => heard.push((e as CustomEvent).detail.id);
    window.addEventListener(NOTE_EVENT, on);
    serve([checkin('c', 'Neha Kulkarni')]);
    window.removeEventListener(NOTE_EVENT, on);
    expect(screen.queryByRole('status')).toBeNull();
    expect(heard).toEqual(['c']);
  });

  it('the bar\'s button opens the screen and reads the note; closing keeps it in the bell', async () => {
    const onOpen = setup();
    serve([]);
    serve([note('x')]);
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Reply' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'x', route: 'comms-tracker', projectId: 'p1' }));
    expect(h.read).toHaveBeenCalledWith('inbox/riya@ff.in', ['x']);
    serve([note('y', { title: 'Site blocked at Harmony 704' }), note('x', { readAt: 1 })]);
    const bar = screen.getByRole('status', { name: 'Needs you: Site blocked at Harmony 704' });
    fireEvent.click(within(bar).getByRole('button', { name: 'Close. It stays in the bell' }));
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Needs you: Site blocked at Harmony 704' })).toBeNull(), { timeout: 3000 });
    expect(h.done).not.toHaveBeenCalled();
  });

  it('the bell lists notes by project, folds a burst of check-ins, and marks one done', () => {
    setup();
    const t = Date.now();
    serve([note('m', { at: t }), { ...checkin('k1', 'Arjun Rao'), at: t - 3000 }, { ...checkin('k2', 'Kabir Shah'), at: t - 2000 }, { ...checkin('k3', 'Neha Kulkarni'), at: t - 1000 }]);
    fireEvent.click(screen.getByRole('button', { name: /Notifications, \d for you/ }));
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText('Harmony 704')).toBeTruthy();
    expect(within(panel).getByText('3 people checked in')).toBeTruthy();
    const row = within(panel).getByText('Mr Prasad Naik sent you a message').closest('li')!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Mark done' }));
    expect(h.done).toHaveBeenCalledWith('inbox/riya@ff.in', ['m']);
  });
});

describe('away from the page, and each person\'s settings', () => {
  function withAlerts() {
    const shown: any[] = [];
    const N: any = vi.fn(function (this: any, title: string, opts: any) { shown.push({ title, ...opts }); this.close = () => {}; });
    N.permission = 'granted';
    N.requestPermission = vi.fn(async () => 'granted');
    vi.stubGlobal('Notification', N);
    return shown;
  }

  it('shows a desktop alert only when StudioDesk is not the window in front', () => {
    const shown = withAlerts();
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    setup();
    serve([]);
    serve([note('front')]);
    expect(shown).toHaveLength(0);
    focus.mockReturnValue(false);
    serve([note('away', { title: 'Riya Menon asked for planned leave' }), note('front')]);
    expect(shown.map((x) => x.title)).toEqual(['Riya Menon asked for planned leave']);
    expect(shown[0].body).toContain('Harmony 704');
  });

  it('keeps quiet in quiet hours, except for a blocked site', () => {
    const shown = withAlerts();
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    h.prefs = { ...DEFAULT_PREFS, quiet: 'night' };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T22:30:00'));
    setup();
    serve([]);
    serve([note('late-msg')]);
    expect(screen.queryByRole('status')).toBeNull();
    expect(shown).toHaveLength(0);
    serve([note('blocked', { kind: 'site.blocker', area: 'site', title: 'Site blocked at Palm Grove Villa 9' }), note('late-msg')]);
    expect(screen.getByRole('status', { name: 'Needs you: Site blocked at Palm Grove Villa 9' })).toBeTruthy();
    expect(shown.map((x) => x.title)).toEqual(['Site blocked at Palm Grove Villa 9']);
    vi.useRealTimers();
  });

  it('with "only late and from home", on-time check-ins do not count', () => {
    h.prefs = { ...DEFAULT_PREFS, quiet: 'off', checkins: 'exceptions' };
    setup();
    serve([checkin('a', 'Arjun Rao'), { ...checkin('b', 'Kabir Shah'), title: 'Kabir Shah checked in late', tags: ['late'] }]);
    expect(screen.getByTestId('tabs').textContent).toBe('people:0/1');
  });

  it('the settings window saves a change at once, for every device', () => {
    render(<NotifyProvider box="inbox/riya@ff.in" onOpen={vi.fn()}><NotifySettings onClose={vi.fn()} /></NotifyProvider>);
    fireEvent.click(screen.getByRole('switch', { name: 'Team in the bar' }));
    expect(h.save).toHaveBeenLastCalledWith('inbox/riya@ff.in', expect.objectContaining({ bar: expect.objectContaining({ team: false, clients: true }) }));
    fireEvent.click(screen.getByRole('radio', { name: 'Nights and weekends' }));
    expect(h.save).toHaveBeenLastCalledWith('inbox/riya@ff.in', expect.objectContaining({ quiet: 'nightAndWeekend' }));
    expect(screen.getByText(/Saved\. It holds on every device/)).toBeTruthy();
  });

  it('the Ops Desk queue lists who is waiting, oldest first, and turns rose after half an hour', () => {
    render(<NotifyProvider box="inbox/riya@ff.in" onOpen={vi.fn()}><WaitingOnYou /></NotifyProvider>);
    const t = Date.now();
    serve([note('new', { at: t - 2 * 60000, title: 'New enquiry from Aditi Joshi', kind: 'lead.new' }), note('old', { at: t - 35 * 60000 }), { ...checkin('c', 'Arjun Rao'), at: t }]);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => within(r).getAllByText(/./)[0].textContent)).toEqual(['Mr Prasad Naik sent you a message', 'New enquiry from Aditi Joshi']);
    expect(within(rows[0]).getByText(/^waiting 3[45]:/).className).toContain('rose');
    expect(within(rows[1]).getByText(/^waiting [12]:/).className).toContain('slate');
    expect(screen.getByText(/2 waiting · longest 3[45]:/)).toBeTruthy();
  });
});

describe('step 3: phones, catch-up and the client portal', () => {
  it('turns phone notifications on for this device, and then lets each kind reach the phone or not', async () => {
    render(<NotifyProvider box="inbox/riya@ff.in" onOpen={vi.fn()}><NotifySettings onClose={vi.fn()} /></NotifyProvider>);
    const sw = await screen.findByRole('switch', { name: 'Phone notifications on this device' });
    expect((screen.getByRole('switch', { name: 'Team on your phone' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(sw); });
    expect(phone.on).toHaveBeenCalledWith('inbox/riya@ff.in');
    expect(await screen.findByText('Phone notifications · Android · Chrome')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Team on your phone' }));
    expect(h.save).toHaveBeenLastCalledWith('inbox/riya@ff.in', expect.objectContaining({ phone: expect.objectContaining({ team: false, clients: true }) }));
  });

  it('says what to do when the phone cannot be turned on yet', async () => {
    phone.state = 'install';
    render(<NotifyProvider box="inbox/riya@ff.in" onOpen={vi.fn()}><NotifySettings onClose={vi.fn()} /></NotifyProvider>);
    expect(await screen.findByText(/add StudioDesk to your Home Screen first/)).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Phone notifications on this device' })).toBeNull();
  });

  it('a client sees only alerts and phone, not the studio\'s kinds, quiet hours or check-ins', async () => {
    render(<NotifyProvider box="portalInbox/c1" audience="client" onOpen={vi.fn()}><NotifySettings onClose={vi.fn()} /></NotifyProvider>);
    expect(screen.getByRole('heading', { name: 'Alerts on this device' })).toBeTruthy();
    expect(await screen.findByRole('switch', { name: 'Phone notifications on this device' })).toBeTruthy();
    expect(screen.queryByText('Quiet hours')).toBeNull();
    expect(screen.queryByText('Check-ins')).toBeNull();
  });

  it('a tapped phone notification opens its note, from the worker or from ?note=', async () => {
    window.history.replaceState(null, '', '/?note=b');
    const onOpen = setup();
    serve([note('a'), note('b', { title: 'Design meeting moved' })]);
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' })));
    expect(window.location.search).toBe('');
    act(() => { phone.tap!('a'); });
    await waitFor(() => expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' })));
  });

  it('back after hours away: says what came in, then deals who is waiting one at a time', async () => {
    const t = Date.now();
    window.localStorage.setItem('studiodesk.lastSeen.inbox/riya@ff.in', String(t - 6 * 3600000));
    const onOpen = vi.fn();
    render(<NotifyProvider box="inbox/riya@ff.in" onOpen={onOpen}><CatchUp /></NotifyProvider>);
    /* The first answer can be the cache's, empty; the catch-up waits for the notes to settle. */
    serve([]);
    serve([
      note('m1', { at: t - 3 * 3600000 }),
      note('m2', { at: t - 2 * 3600000, title: 'New enquiry from Aditi Joshi', kind: 'lead.new' }),
      { ...checkin('c1', 'Arjun Rao'), at: t - 3600000 },
      note('old', { at: t - 9 * 3600000, title: 'Before you left' }),
    ]);
    const card = await screen.findByRole('dialog', { name: 'While you were away' }, { timeout: 4000 });
    expect(within(card).getByText(/^3 new since/)).toBeTruthy();
    expect(within(card).getByText('2 from clients')).toBeTruthy();
    expect(within(card).getByText('1 from the team')).toBeTruthy();
    expect(within(card).getByText('Mr Prasad Naik sent you a message')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: /Skip/ }));
    expect(await within(card).findByText('New enquiry from Aditi Joshi')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Mark the updates read' }));
    expect(h.read).toHaveBeenCalledWith('inbox/riya@ff.in', ['c1']);
    fireEvent.click(within(card).getByRole('button', { name: 'Reply' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }));
    expect(screen.queryByRole('dialog', { name: 'While you were away' })).toBeNull();
  });

  it('does not show for a short break, a first visit, or a single note', () => {
    const t = Date.now();
    const two = [note('a', { at: t - 1000 }), note('b', { at: t - 2000 })];
    expect(sinceAway(two, t - 3600000, t)).toBeNull();
    expect(sinceAway(two, null, t)).toBeNull();
    expect(sinceAway([two[0]], t - 5 * 3600000, t)).toBeNull();
    expect(sinceAway(two, t - 5 * 3600000, t)?.map((n) => n.id)).toEqual(['a', 'b']);
    expect(awaySummary([{ area: 'clients', level: 'needs' }, { area: 'clients', level: 'update' }], true)).toEqual(['1 waiting for you', '1 update']);
  });
});

describe('one bell inside a project', () => {
  const alert = { id: 'a1', kind: 'client', label: 'From the client', title: 'Your client asked about Laminate', detail: '“E2E test selection” — still unanswered.', when: '14 days ago', goTo: 'materials', cta: 'Reply on SOF & Selections', severity: 1 } as any;

  it('counts what the project is waiting on with your notes, and lists it first', async () => {
    const onGo = vi.fn(), onDismiss = vi.fn();
    render(<NotifyProvider box="inbox/riya@ff.in" onOpen={vi.fn()}><NotifyBell project={{ name: 'New Project · ABC test client', alerts: [alert], onGo, onDismiss }} /></NotifyProvider>);
    serve([note('m1')]);
    const bell = screen.getByRole('button', { name: 'Notifications, 2 for you' });
    fireEvent.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText(/On this project · New Project · ABC test client/)).toBeTruthy();
    const text = panel.textContent || '';
    expect(text.indexOf('Your client asked about Laminate')).toBeLessThan(text.indexOf('Mr Prasad Naik sent you a message'));
    fireEvent.click(within(panel).getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('a1');
    fireEvent.click(within(panel).getByRole('button', { name: 'Reply on SOF & Selections' }));
    expect(onGo).toHaveBeenCalledWith('materials');
  });

  it('with nothing else, the project\'s alerts are the list, not "All caught up"', async () => {
    render(<NotifyProvider box="inbox/riya@ff.in" onOpen={vi.fn()}><NotifyBell project={{ name: 'Harmony 704', alerts: [alert], onGo: vi.fn(), onDismiss: vi.fn() }} /></NotifyProvider>);
    serve([]);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 for you' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(panel).queryByText('All caught up')).toBeNull();
    expect(within(panel).getByText('Your client asked about Laminate')).toBeTruthy();
  });
});

describe('the bell glyph', () => {
  it('gives each bell its own gradients, so a hidden bell earlier in the page cannot blank the visible one', () => {
    const { container } = render(<><div hidden><BellGlyph /></div><BellGlyph /></>);
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const second = container.querySelectorAll('svg')[1];
    expect(second.querySelector('path')!.getAttribute('fill')).toBe(`url(#${ids[1]})`);
  });
});
