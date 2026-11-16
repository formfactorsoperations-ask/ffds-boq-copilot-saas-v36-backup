/*
  The project sidebar: it replaced the five header rows (DESIGN.md "Project sidebar").
  It collapses to icons and back, keeps that and its width, opens a stage's screens,
  refuses locked stages, and Ctrl/Cmd K jumps to any screen by name.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ProjectSidebar, { type SidebarStage } from '../../components/projectNav/ProjectSidebar';

afterEach(cleanup);
beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

const STAGES: SidebarStage[] = [
  { stage: 1, label: 'Initial Consultation', screens: [{ route: 'leadiq', label: 'Brief & Site' }], locked: false, state: 'done' },
  { stage: 2, label: 'Scope & Strategy', screens: [{ route: 'ops', label: 'Pricing & Tiers' }, { route: 'boq-editor', label: 'BOQ Editor' }], locked: false, state: 'todo' },
  { stage: 5, label: 'Execution & Site', screens: [{ route: 'site-ops', label: 'Execution & Ops' }], locked: true, lockNote: 'Unlocks when the agreement is signed', state: 'todo' },
];

function setup(extra: Partial<React.ComponentProps<typeof ProjectSidebar>> = {}) {
  const onGo = vi.fn();
  const home = vi.fn();
  render(
    <ProjectSidebar
      projectId="p1" activeTab="ops" onGo={onGo} home={{ route: 'dashboard', label: 'Hub' }}
      stages={STAGES} selectedStage={2}
      hub={[{ route: 'payment-calc', label: 'Money', badge: '7 open', tone: 'warn' }, { route: 'history', label: 'History' }]}
      counts={(r) => (r === 'history' ? { needs: 2, unread: 0 } : { needs: 0, unread: 0 })}
      project={{ name: 'Palacia 3BHK', sub: 'Mrs Jamkar · Thane', initials: 'PB' }}
      status={{ label: 'Proposal sent', onClick: vi.fn() }}
      progress={{ pct: 35, next: 'Agreement Signed' }}
      studioHome={{ label: 'Studio home', onClick: home }}
      user={{ name: 'Anish K', role: 'Super Admin' }}
      menu={[{ label: 'Projects', icon: () => null, onClick: vi.fn() }]}
      mobileOpen={false} onMobileClose={vi.fn()}
      {...extra}
    />,
  );
  return { onGo, home, nav: screen.getByRole('complementary', { name: 'Project navigation' }) };
}

describe('Project sidebar', () => {
  it('shows Studio home, the project, its journey and the hub, with counts', () => {
    const { nav, home } = setup();
    fireEvent.click(within(nav).getByRole('button', { name: /Studio home/ }));
    expect(home).toHaveBeenCalled();
    expect(within(nav).getByText('Palacia 3BHK')).toBeTruthy();
    expect(within(nav).getByText('Agreement Signed')).toBeTruthy();
    expect(within(nav).getByText('7 open')).toBeTruthy();
    expect(within(nav).getByText('2')).toBeTruthy(); // History: two waiting on you
    expect(within(nav).getByRole('button', { name: /Pricing & Tiers/ }).className).toContain('is-on');
  });

  it('a stage opens its first screen; a locked stage does not', () => {
    const { nav, onGo } = setup();
    fireEvent.click(within(nav).getByRole('button', { name: /Initial Consultation/ }));
    expect(onGo).toHaveBeenCalledWith('leadiq', 1);
    onGo.mockClear();
    fireEvent.click(within(nav).getByRole('button', { name: /Execution & Site/ }));
    expect(onGo).not.toHaveBeenCalled();
  });

  it('collapses to icons and remembers it', () => {
    const { nav } = setup();
    fireEvent.click(within(nav).getByRole('button', { name: 'Collapse sidebar' }));
    expect(nav.className).toContain('is-closed');
    expect(JSON.parse(localStorage.getItem('sd.projectSidebar') || '{}').open).toBe(false);
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(nav.className).not.toContain('is-closed');
  });

  it('Ctrl/Cmd K jumps to a screen by name', () => {
    const { onGo } = setup();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const box = screen.getByRole('textbox', { name: 'Jump to a screen' });
    fireEvent.change(box, { target: { value: 'boq' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onGo).toHaveBeenCalledWith('boq-editor', 2);
  });

  it('the person menu holds the studio screens', () => {
    const { nav } = setup();
    fireEvent.click(within(nav).getByRole('button', { name: /Anish K/ }));
    expect(screen.getByRole('menuitem', { name: /Projects/ })).toBeTruthy();
  });
});
