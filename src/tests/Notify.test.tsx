import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within, waitFor } from '@testing-library/react';
import { stamp, type Stored } from '../../lib/notify';

/* The inbox, without Firestore: the test plays the server's notes into the listener. */
const h = vi.hoisted(() => ({
  push: null as null | ((notes: any[]) => void),
  done: vi.fn(async () => {}),
  read: vi.fn(async () => {}),
  snooze: vi.fn(async () => {}),
  undo: vi.fn(async () => {}),
}));
vi.mock('../../services/inboxService', () => ({
  listenInbox: (_email: string, cb: (n: any[]) => void) => { h.push = cb; return () => { h.push = null; }; },
  markDone: h.done, markRead: h.read, snooze: h.snooze, undoDone: h.undo,
}));

import { NotifyProvider, NOTE_EVENT, useInbox } from '../../components/notify/NotifyContext';
import NotifyBell from '../../components/notify/NotifyBell';
import NeedsYouBar from '../../components/notify/NeedsYouBar';

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

beforeEach(() => { Object.values(h).forEach((f: any) => f?.mockClear?.()); document.title = 'StudioDesk'; });
afterEach(() => cleanup());

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
