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

import { NotifyProvider, NOTE_EVENT, useInbox } from '../../components/notify/NotifyContext';
import NotifyBell from '../../components/notify/NotifyBell';
import NeedsYouBar from '../../components/notify/NeedsYouBar';
import NotifySettings from '../../components/notify/NotifySettings';
import WaitingOnYou from '../../components/notify/WaitingOnYou';

const note = (id: string, over: Partial<Stored> = {}): Stored => ({
  ...stamp({ kind: 'client.message', area: 'clients', level: 'needs', title: 'Mr Prasad Naik sent you a message', line: '“Walnut, not oak.”', projectId: 'p1', projectName: 'Harmony 704', route: 'comms-tracker', action: 'Reply', actor: 'Mr Prasad Naik', group: null, to: {} }, Date.now()),
  id, ...over,
});
const checkin = (id: string, who: string) => note(id, { kind: 'people.checkin', area: 'team', level: 'update', title: `${who} checked in`, line: '9:42 AM · at the office', projectId: null, projectName: null, route: 'people', action: null, actor: who, group: 'checkin:2026-10-22' });

const Tabs = () => {
  const inbox = useInbox()!;
  return <p data-testid="tabs">{(Object.entries(inbox.byTab) as [string, { needs: number; unread: number }][]).map(([t, c]) => `${t}:${c.needs}/${c.unread}`).sort().join(' ')}</p>;
};

function setup(onOpen = vi.fn()) {
  render(
    <NotifyProvider email="riya@ff.in" onOpen={onOpen}>
      <NotifyBell />
      <NeedsYouBar />
      <Tabs />
    </NotifyProvider>,
  );
  return onOpen;
}
const serve = (notes: Stored[]) => act(() => { h.push!(notes); });

beforeEach(() => { Object.values(h).forEach((f: any) => f?.mockClear?.()); h.prefs = { ...DEFAULT_PREFS, quiet: 'off' } as NotifyPrefs; document.title = 'StudioDesk'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('notifications in the app', () => {
  it('counts on the tabs and the bell the moment notes land, and shows the count in the browser tab', () => {
    setup();
    serve([note('a'), checkin('b', 'Arjun Rao')]);
    expect(screen.getByTestId('tabs').textContent).toBe('ops-desk:1/0 people:0/1');
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeTruthy();
    expect(document.title).toBe('(2) StudioDesk');
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
    expect(h.read).toHaveBeenCalledWith('riya@ff.in', ['x']);
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
    fireEvent.click(screen.getByRole('button', { name: /Notifications, \d unread/ }));
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText('Harmony 704')).toBeTruthy();
    expect(within(panel).getByText('3 people checked in')).toBeTruthy();
    const row = within(panel).getByText('Mr Prasad Naik sent you a message').closest('li')!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Mark done' }));
    expect(h.done).toHaveBeenCalledWith('riya@ff.in', ['m']);
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
    render(<NotifyProvider email="riya@ff.in" uid="u1" onOpen={vi.fn()}><NotifySettings onClose={vi.fn()} /></NotifyProvider>);
    fireEvent.click(screen.getByRole('switch', { name: 'Team in the bar' }));
    expect(h.save).toHaveBeenLastCalledWith('u1', expect.objectContaining({ bar: expect.objectContaining({ team: false, clients: true }) }));
    fireEvent.click(screen.getByRole('radio', { name: 'Nights and weekends' }));
    expect(h.save).toHaveBeenLastCalledWith('u1', expect.objectContaining({ quiet: 'nightAndWeekend' }));
    expect(screen.getByText(/Saved\. It holds on every device/)).toBeTruthy();
  });

  it('the Ops Desk queue lists who is waiting, oldest first, and turns rose after half an hour', () => {
    render(<NotifyProvider email="riya@ff.in" onOpen={vi.fn()}><WaitingOnYou /></NotifyProvider>);
    const t = Date.now();
    serve([note('new', { at: t - 2 * 60000, title: 'New enquiry from Aditi Joshi', kind: 'lead.new' }), note('old', { at: t - 35 * 60000 }), { ...checkin('c', 'Arjun Rao'), at: t }]);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => within(r).getAllByText(/./)[0].textContent)).toEqual(['Mr Prasad Naik sent you a message', 'New enquiry from Aditi Joshi']);
    expect(within(rows[0]).getByText(/^waiting 3[45]:/).className).toContain('rose');
    expect(within(rows[1]).getByText(/^waiting [12]:/).className).toContain('slate');
    expect(screen.getByText(/2 waiting · longest 3[45]:/)).toBeTruthy();
  });
});
