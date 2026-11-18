/*
  The page bar's breadcrumb inside a project (components/projectNav/PageCrumbs).
  The stage opens every stage (locked ones refuse), the stage's screens sit beside
  it one click apart, and a hub screen lists the hub.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import PageCrumbs from '../../components/projectNav/PageCrumbs';
import type { SidebarStage } from '../../components/projectNav/ProjectSidebar';

afterEach(cleanup);

const STAGES: SidebarStage[] = [
  { stage: 1, label: 'Initial Consultation', screens: [{ route: 'leadiq', label: 'Brief & Site' }], locked: false, state: 'done' },
  { stage: 2, label: 'Scope & Strategy', screens: [
    { route: 'ops', label: 'Pricing & Tiers' }, { route: 'boq-editor', label: 'BOQ Editor' }, { route: 'analytics', label: 'Money & Offers' },
  ], locked: false, state: 'now' },
  { stage: 5, label: 'Execution & Site', screens: [{ route: 'site-ops', label: 'Execution & Ops' }], locked: true, lockNote: 'Unlocks when the agreement is signed', state: 'todo' },
];
const HUB = [{ route: 'ops-matrix', label: 'Ops Matrix' }, { route: 'history', label: 'History' }];

function setup(activeTab: string, title: string) {
  const onGo = vi.fn();
  render(<PageCrumbs activeTab={activeTab} title={title} stages={STAGES} hub={HUB} home={{ route: 'dashboard', label: 'Hub' }} onGo={onGo} />);
  return { onGo, nav: screen.getByRole('navigation', { name: 'Breadcrumb' }) };
}

describe('Page bar breadcrumb', () => {
  it('names the page and puts the stage’s screens one click apart', () => {
    const { nav, onGo } = setup('analytics', 'Money & Offers');
    expect(screen.getByRole('heading', { level: 1, name: 'Money & Offers' })).toBeTruthy();
    const row = within(nav).getByRole('radiogroup', { name: 'Scope & Strategy screens' });
    expect(within(row).getByRole('radio', { name: 'Money & Offers' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(row).getByRole('radio', { name: 'Pricing & Tiers' }));
    expect(onGo).toHaveBeenCalledWith('ops', 2);
    // The pill moves on the click, before the page has changed.
    expect(within(row).getByRole('radio', { name: 'Pricing & Tiers' }).getAttribute('aria-checked')).toBe('true');
  });

  it('the stage opens every stage; one opens its first screen, a locked one does not', () => {
    const { nav, onGo } = setup('analytics', 'Money & Offers');
    fireEvent.click(within(nav).getByRole('button', { name: 'Scope & Strategy: change stage' }));
    const menu = screen.getByRole('menu', { name: 'Scope & Strategy: change stage' });
    const current = within(menu).getByRole('menuitem', { name: /Scope & Strategy/ });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(within(current).getByText('NOW')).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Execution & Site/ }));
    expect(onGo).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Initial Consultation/ }));
    expect(onGo).toHaveBeenCalledWith('leadiq', 1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape closes the list', () => {
    const { nav } = setup('ops', 'Pricing & Tiers');
    fireEvent.click(within(nav).getByRole('button', { name: 'Scope & Strategy: change stage' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a screen alone in its stage is just its name', () => {
    const { nav } = setup('leadiq', 'Brief & Site');
    expect(within(nav).queryByRole('radiogroup')).toBeNull();
    expect(within(nav).queryByRole('button', { name: /other screens/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Brief & Site' })).toBeTruthy();
  });

  it('a hub screen reads Project Hub and lists the hub', () => {
    const { nav, onGo } = setup('ops-matrix', 'Ops Matrix');
    fireEvent.click(within(nav).getByRole('button', { name: 'Ops Matrix: other screens' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'History' }));
    expect(onGo).toHaveBeenCalledWith('history', undefined);
    expect(within(nav).getByRole('button', { name: 'Project Hub: change stage' })).toBeTruthy();
  });
});
