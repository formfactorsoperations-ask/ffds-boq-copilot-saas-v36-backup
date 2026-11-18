/*
  The My day card shows a check-in the moment the location is in hand, and
  confirms it when the server answers (components/people/MyDayCard.tsx).
*/
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DEFAULT_POLICY, type Snapshot } from '../../lib/peopleDesk';

const me = { id: 'me', name: 'Me', title: '', teamId: 't', managerId: '', accessRole: 'employee' as const, active: true };
const snapshot: Snapshot = {
  me, people: [me], policy: { ...DEFAULT_POLICY, holidays: [], weeklyOffDays: [], requireLocation: true } as any,
  attendance: [], requests: [], availability: [], balances: {}, serverTime: '2026-10-27T05:00:00.000Z', revision: 0,
};
let finish: (v: any) => void = () => undefined;
const run = vi.fn(() => new Promise((r) => { finish = r; }));
vi.mock('../../services/peopleService', () => ({
  usePeople: () => ({ snapshot, loading: false, error: null, stale: false, at: 0, run, refresh: vi.fn() }),
  locate: vi.fn(async () => ({ reading: { lat: 19, lng: 72, accuracyM: 30 } })),
  warmLocation: vi.fn(async () => undefined),
}));

describe('My day', () => {
  it('shows the check-in at once, and confirms it when the server answers', async () => {
    const { default: MyDayCard } = await import('../../components/people/MyDayCard');
    render(<MyDayCard variant="full" lamp={false} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check in/ })); });
    expect(screen.getByText('Checked in · saving…')).toBeTruthy();
    expect(run).toHaveBeenCalledWith('checkin', expect.objectContaining({ mode: 'Office', location: { lat: 19, lng: 72, accuracyM: 30 } }));
    /* Check-out waits for the saved session. */
    expect((screen.getByRole('button', { name: /Check(ing)? out/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish({ ok: true }); });
    expect(screen.getByText('Checked in. Have a good day.')).toBeTruthy();
  });

  it('on People, checks in through the lamp: pull the cord, then start the day', async () => {
    run.mockClear();
    const { default: MyDayCard } = await import('../../components/people/MyDayCard');
    render(<MyDayCard variant="full" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Check in$/ })); });
    /* The window opens dark, with nothing to press but the cord. */
    const dialog = screen.getByRole('dialog', { name: 'Start your day' });
    expect(dialog).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start my day/ })).toBeNull();
    expect(run).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Pull the cord to turn the lamp on/ })); });
    expect(await screen.findByText("The light's on for you.", undefined, { timeout: 3000 })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start my day/ })); });
    expect(run).toHaveBeenCalledWith('checkin', expect.objectContaining({ mode: 'Office' }));
    await act(async () => { finish({ ok: true }); });
    expect(screen.getAllByText('Checked in. Have a good day.').length).toBeGreaterThan(0);
  });

  it('runs a practice lamp from ?try-lamp=in that saves nothing', async () => {
    run.mockClear();
    window.history.pushState({}, '', '/?try-lamp=in');
    const { default: MyDayCard } = await import('../../components/people/MyDayCard');
    render(<MyDayCard variant="full" />);
    expect(screen.getByRole('dialog', { name: 'Start your day' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Pull the cord to turn the lamp on/ })); });
    expect(await screen.findByText('Practice', undefined, { timeout: 3000 })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start my day/ })); });
    expect(await screen.findByText('Practice done. Nothing was saved.', undefined, { timeout: 3000 })).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/');
  });

  it('offers check-in while yesterday waits on its correction, and says so', async () => {
    const old = { id: 'old', employeeId: 'me', date: '2026-10-26', checkIn: '2026-10-26T04:00:00.000Z', mode: 'Office', site: '', version: 1 } as any;
    snapshot.attendance = [old];
    const { default: MyDayCard } = await import('../../components/people/MyDayCard');
    const { unmount } = render(<MyDayCard variant="full" lamp={false} />);
    expect(screen.getByText(/was never checked out/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Check in$/ })).toBeNull();
    unmount();
    snapshot.requests = [{ id: 'r1', employeeId: 'me', kind: 'correction', type: 'PL', start: '2026-10-26', end: '2026-10-26', portion: 'Full day', days: [], reason: 'Forgot', status: 'Pending', version: 1, createdAt: '2026-10-27T00:00:00Z', decisions: [],
      correction: { sessionId: 'old', sessionVersion: 1, checkIn: '2026-10-26T04:00:00Z', checkOut: '2026-10-26T12:00:00Z', mode: 'Office', site: '' } } as any];
    render(<MyDayCard variant="full" lamp={false} />);
    expect(screen.getByText(/is waiting for approval\. You can still check in today\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Check in$/ })).toBeTruthy();
    snapshot.attendance = [];
    snapshot.requests = [];
  });

  it('ends the day with the lamp already lit: pulling the cord switches it off and checks out', async () => {
    run.mockClear();
    snapshot.attendance = [{ id: 'at1', employeeId: 'me', date: '2026-10-27', checkIn: '2026-10-27T04:00:00.000Z', mode: 'Office', site: '', version: 1 } as any];
    const { default: MyDayCard } = await import('../../components/people/MyDayCard');
    render(<MyDayCard variant="full" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Check out$/ })); });
    expect(screen.getByRole('dialog', { name: 'End your day' })).toBeTruthy();
    /* Lit from the start: the card and its button are there, and the cord turns the lamp off. */
    expect(screen.getByRole('button', { name: /End my day/ })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Pull the cord to turn the lamp off/ })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(run).toHaveBeenCalledWith('checkout', expect.objectContaining({ sessionId: 'at1', version: 1 }));
    await act(async () => { finish({ ok: true }); });
    expect(screen.getAllByText('Checked out. Enjoy your evening.').length).toBeGreaterThan(0);
    snapshot.attendance = [];
  });

  it("opens the lamp from Home's My day pin too", async () => {
    run.mockClear();
    const { default: MyDayCard } = await import('../../components/people/MyDayCard');
    render(<MyDayCard variant="pin" lamp />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Check in$/ })); });
    expect(screen.getByRole('dialog', { name: 'Start your day' })).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });
});
