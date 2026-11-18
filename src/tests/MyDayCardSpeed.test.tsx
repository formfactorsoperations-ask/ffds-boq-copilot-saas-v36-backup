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
});
