import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

/* The top bar without Firestore: storage mode and the signed-in person are set by the test. */
const h = vi.hoisted(() => ({ isCloud: true }));
vi.mock('../../services/dbService', () => ({ db: { get isCloud() { return h.isCloud; } } }));
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({
    orgData: { orgName: 'Form Factors' },
    currentRole: 'Admin',
    currentRoles: ['Admin'],
    currentUserAuth: { displayName: 'Anish K', email: 'anish@example.com' },
  }),
}));
vi.mock('../../components/notify/NotifyBell', () => ({ default: () => null }));
vi.mock('../../components/notify/NotifyContext', () => ({ useInbox: () => null }));
vi.mock('../../components/CloudConfigModal', () => ({ default: () => null }));
vi.mock('../../components/ui/RefreshApp', () => ({ RefreshAppButton: () => null }));
vi.mock('../../components/ui/HideFigures', () => ({ HideFiguresButton: () => null }));

/* jsdom has no ResizeObserver; the bar only uses it to keep the tab highlight in place. */
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

import Header from '../../components/Header';

const renderBar = (aiStatus: any) =>
  render(<Header activeTab="home" setActiveTab={() => {}} aiStatus={aiStatus} onLogout={() => {}} />);
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Anish K/ }));

afterEach(() => { cleanup(); h.isCloud = true; });

describe('top bar storage and AI state', () => {
  it('has no Live pill on the bar', () => {
    renderBar('online');
    const bar = screen.getByRole('banner');
    expect(within(bar).queryByText('Live')).toBeNull();
    expect(within(bar).queryByLabelText(/Cloud sync active/)).toBeNull();
  });

  it('shows no light on the avatar when storage and AI are live', () => {
    renderBar('online');
    expect(screen.queryByTestId('health-light')).toBeNull();
    openMenu();
    const row = screen.getByRole('menuitem', { name: /Storage & sync/ });
    expect(within(row).getByText('Live')).toBeTruthy();
    expect(within(row).getByText('Cloud sync on · AI online')).toBeTruthy();
  });

  it('shows an amber light when storage is local only', () => {
    h.isCloud = false;
    renderBar('online');
    const light = screen.getByTestId('health-light');
    expect(light.querySelector('.text-amber-500')).toBeTruthy();
    openMenu();
    const row = screen.getByRole('menuitem', { name: /Storage & sync/ });
    expect(within(row).getByText('Local')).toBeTruthy();
    expect(within(row).getByText('Saved on this computer only · AI online')).toBeTruthy();
  });

  it('shows an amber light when the AI key is missing', () => {
    renderBar('unavailable');
    expect(screen.getByTestId('health-light').querySelector('.text-amber-500')).toBeTruthy();
    openMenu();
    expect(within(screen.getByRole('menuitem', { name: /Storage & sync/ })).getByText('AI off')).toBeTruthy();
  });

  it('shows a rose light and says why when the AI key is refused', () => {
    renderBar('error');
    expect(screen.getByTestId('health-light').querySelector('.text-rose-500')).toBeTruthy();
    expect(screen.getByRole('button', { name: /AI error, check the key/ })).toBeTruthy();
    openMenu();
    expect(within(screen.getByRole('menuitem', { name: /Storage & sync/ })).getByText('AI error')).toBeTruthy();
  });
});
