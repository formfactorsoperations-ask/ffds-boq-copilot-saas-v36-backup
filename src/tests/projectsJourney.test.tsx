/*
  Projects: journey, needs you, one list (DESIGN.md, approved 25 Nov 2026).

  Pins: the shared logic (stage counts, needs-you order, grouping by stage and
  designer, the command bar, the lane → status map, the route hint stripped
  before a screen opens, due days, the week); the screen (the journey strip
  filters and a second click clears it, the next step opens its screen, a
  sticker click never opens the project, a board drop opens the status window
  at that stage, Ctrl K, the triage keys, no amounts); and the studio switch
  picking the folders unless the new screen is chosen.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';

const org: any = { orgData: { tenantId: 't1', team: [{ id: 'm', name: 'Mayuri K', email: 'mayuri@studio.in', role: 'Designer' }], projectDesigners: {} }, currentRole: 'Admin' };
vi.mock('../../services/firebaseClient', () => ({ db: {}, auth: null, storage: null, functions: null, isFirebaseConfigured: () => true }));
vi.mock('firebase/firestore', async (orig) => {
  const real: any = await orig();
  return { ...real, collection: () => ({}), collectionGroup: () => ({}), doc: () => ({}), query: () => ({}), where: () => ({}),
    getDoc: async () => ({ exists: () => false, data: () => undefined }), getDocs: async () => ({ docs: [], empty: true, size: 0 }), onSnapshot: () => () => {} };
});
vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ ...org, updateOrgData: async () => {}, teamMembers: [] }) }));
/* Each project's next step comes from its own record here, so the tests choose it. */
vi.mock('../../services/nextActionEngine', () => ({ getNextActions: (c: any) => (c?.project?._next ? [c.project._next] : []) }));
/* Drawing counts as functions/src/projectHealth.ts keeps them. */
vi.mock('../../services/projectHealthService', () => ({ useProjectHealth: () => new Map([['p4', { total: 10, issued: 7 }]]) }));

import {
  buildRow, projectIntel, stripStages, needsYouOrder, groupRows, commandResults, statusForStage, routeTab, toggleStage,
  needsCounts, matchesStage, dueOfStep, withDue, weekDays, dueLabel, isDueThisWeek, journeyCounts, todayKey, weekColumnOf,
} from '../../lib/projectsJourney';

afterEach(cleanup);
/* Wednesday 25 Nov 2026, 2:30 pm in India: the week is Mon 23 to Sat 28. */
const NOW = Date.parse('2026-11-25T09:00:00Z');
beforeEach(() => {
  try { localStorage.clear(); } catch { /* none */ }
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); });

const step = (id: string, title: string, priority: 'blocker' | 'due' | 'suggested', route = 'site-ops') =>
  ({ id, title, why: '', ctaLabel: title, route, priority, roles: [] });

const project = (id: string, status: string, extra: any = {}) => ({
  id, tenantId: 't1', lastModified: Number(id.replace(/\D/g, '')) || 1,
  context: { name: `Project ${id}`, clientName: `Client ${id}`, status, config: '2-BHK', area: 700, location: 'Thane', isDummy: false, rooms: [], ...extra },
  tiers: [], activeTierId: null,
});

const BOOK = [
  project('p1', 'lead', { _next: step('a1', 'Book site visit', 'suggested', 'leadiq'), assignedDesigners: ['mayuri@studio.in'] }),
  project('p2', 'proposal_sent', { _next: step('a2', 'Revise proposal', 'due', 'client') }),
  project('p3', 'won', { _next: step('a3', 'Collect execution advance', 'blocker', 'payment-calc?focus=e1') }),
  project('p4', 'execution', { _next: step('a4', 'Slab inspection sign-off', 'blocker'), assignedDesigners: ['mayuri@studio.in'],
    designDocuments: [{ url: 'https://x/old.jpg', addedAt: 1 }, { url: 'https://x/new.jpg', addedAt: 9 }, { url: 'https://x/plan.pdf', addedAt: 20 }] }),
  project('p5', 'execution', { isDummy: true }),
  project('p6', 'completed'),
  project('p7', 'lost'),
  project('p8', 'lost', { termination: { at: 1 } }),
];
const rowsOf = (book: any[] = BOOK) => {
  const intel = projectIntel(book as any, 'Admin');
  return book.map((p) => buildRow(p as any, p.context.name, intel, {}));
};

describe('the shared logic', () => {
  it('counts each live stage with its blockers, and the closed ones apart', () => {
    const { stages, closed } = stripStages(rowsOf());
    expect(stages.map((s) => [s.stage, s.rows.length, s.blocked])).toEqual([
      ['lead', 1, 0], ['proposal', 1, 0], ['won', 1, 1], ['execution', 2, 1], ['completed', 1, 0],
    ]);
    expect(closed).toBe(2);
    expect(matchesStage(BOOK[7] as any, 'closed')).toBe(true);
  });

  it('a click on a stage filters to it, and a second click shows them all', () => {
    expect(toggleStage('all', 'won')).toBe('won');
    expect(toggleStage('won', 'won')).toBe('all');
    expect(toggleStage('won', 'closed')).toBe('closed');
  });

  it('puts blockers first, then due, then the rest; the earlier day first; a snoozed step stays out until its day', () => {
    const rows = rowsOf();
    expect(needsYouOrder(rows, NOW).map((r) => r.id)).toEqual(['p3', 'p4', 'p2', 'p1']);
    const dated = rowsOf(BOOK.map((p) => p.id === 'p4' ? project('p4', 'execution', { ...p.context, nextStepDue: { a4: { day: '2026-11-24', at: 1 } } })
      : p.id === 'p3' ? project('p3', 'won', { ...p.context, nextStepDue: { a3: { day: '2026-11-27', at: 1 } } }) : p));
    expect(needsYouOrder(dated, NOW).map((r) => r.id).slice(0, 2)).toEqual(['p4', 'p3']);
    const snoozed = rowsOf(BOOK.map((p) => p.id === 'p3' ? project('p3', 'won', { ...p.context, nextStepDue: { a3: { day: '2026-11-26', at: 1, snoozed: true } } }) : p));
    expect(needsYouOrder(snoozed, NOW).map((r) => r.id)).toEqual(['p4', 'p2', 'p1']);
    expect(needsYouOrder(snoozed, Date.parse('2026-11-26T05:00:00Z')).map((r) => r.id)).toContain('p3');
  });

  it('the Needs-you counts follow the Actual / Dummy switch only', () => {
    const intel = projectIntel(BOOK as any, 'Admin');
    expect(needsCounts(BOOK as any, 'all', intel)).toMatchObject({ blocker: 2, due: 1 });
    expect(needsCounts(BOOK as any, 'dummy', intel)).toMatchObject({ blocker: 0, due: 0 });
  });

  it('uses the latest render that is a picture as the photo', () => {
    expect(rowsOf()[3].photo).toBe('https://x/new.jpg');
    expect(rowsOf()[0].photo).toBeNull();
  });

  it('groups by stage in journey order, or by designer with each one\'s live count', () => {
    const rows = rowsOf();
    expect(groupRows(rows, 'stage').map((g) => g.key)).toEqual(['lead', 'proposal', 'won', 'execution', 'completed', 'lost', 'terminated']);
    const byDesigner = groupRows(rows, 'designer', () => 'Mayuri K');
    expect(byDesigner[0]).toMatchObject({ label: 'Mayuri K', live: 2 });
    expect(byDesigner[0].rows.map((r) => r.id)).toEqual(['p1', 'p4']);
    expect(byDesigner[byDesigner.length - 1].label).toBe('No designer yet');
  });

  it('the command bar offers what is due and what is recent, then finds projects, steps and screens', () => {
    const rows = rowsOf();
    const empty = commandResults(rows, '');
    expect(empty.filter((i) => i.group === 'Do next').map((i) => i.row.id)).toEqual(['p3', 'p4', 'p2']);
    expect(empty.filter((i) => i.group === 'Recent projects')[0].row.id).toBe('p8');
    const found = commandResults(rows, 'project p4');
    expect(found.map((i) => i.group)).toEqual(['Projects', 'Do next', 'Jump to', 'Jump to']);
    expect(found.find((i) => i.kind === 'step')!.sub).toBe('Project p4 · opens Site control room');
  });

  it('a lane gives its status, and closed means lost', () => {
    expect(['lead', 'proposal', 'won', 'execution', 'completed', 'closed'].map((s) => statusForStage(s as any)))
      .toEqual(['lead', 'proposal_sent', 'won', 'execution', 'completed', 'lost']);
  });

  it('opens the tab, not the hint after "?"', () => {
    expect(routeTab('payment-calc?focus=e1')).toBe('payment-calc');
    expect(routeTab('site-ops')).toBe('site-ops');
    expect(routeTab(undefined)).toBeUndefined();
  });

  it('a step\'s day: the one set on the project, else its own record, else none', () => {
    const a = step('a1', 'Collect', 'due', 'payment-calc') as any;
    expect(dueOfStep(undefined, a)).toBeNull();
    expect(dueOfStep(undefined, { ...a, dueKey: '2026-11-27' })).toEqual({ day: '2026-11-27', source: 'record' });
    expect(dueOfStep({ a1: { day: '2026-11-24', at: 1 } }, { ...a, dueKey: '2026-11-27' })).toEqual({ day: '2026-11-24', source: 'set' });
    expect(dueOfStep({ other: { day: '2026-11-24', at: 1 } }, a)).toBeNull();
    const map = withDue({ x: { day: '2026-11-20', at: 1 } }, 'a1', '2026-11-26', 'me@studio.in', 5, true);
    expect(map).toEqual({ x: { day: '2026-11-20', at: 1 }, a1: { day: '2026-11-26', at: 5, by: 'me@studio.in', snoozed: true } });
    expect(withDue(map, 'a1', null)).toEqual({ x: { day: '2026-11-20', at: 1 } });
  });

  it('the week is Monday to Saturday in India\'s time; labels read Overdue, Today, a day or a date', () => {
    expect(todayKey(NOW)).toBe('2026-11-25');
    expect(weekDays(NOW)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28']);
    /* Late on Sunday night in India is still Sunday: the week shown is the one ending the day before. */
    expect(weekDays(Date.parse('2026-11-29T17:00:00Z'))[0]).toBe('2026-11-23');
    expect(weekDays(Date.parse('2026-11-29T19:00:00Z'))[0]).toBe('2026-11-30');
    expect(['2026-11-24', '2026-11-25', '2026-11-27', '2026-12-02'].map((d) => dueLabel(d, NOW))).toEqual(['Overdue', 'Today', 'Fri', '2 Dec']);
  });

  it('This week puts a step with no day on today, an older overdue one on Monday, and leaves out next week', () => {
    const at = (day?: string) => ({ due: day ? { day, source: 'set' as const } : null });
    expect(weekColumnOf(at(), NOW)).toBe('2026-11-25');
    expect(weekColumnOf(at('2026-11-18'), NOW)).toBe('2026-11-23');
    expect(weekColumnOf(at('2026-11-24'), NOW)).toBe('2026-11-24');
    expect(weekColumnOf(at('2026-12-01'), NOW)).toBeNull();
    /* Sunday: the week shown is the one just ended, so a step with no day sits on its Saturday. */
    expect(weekColumnOf(at(), Date.parse('2026-11-29T10:00:00Z'))).toBe('2026-11-28');
  });

  it('due this week: a Due step on or before Saturday, overdue, or with no day; the chips count them', () => {
    const r = (priority: any, day?: string, extra: any = {}) => ({ action: step('a', 't', priority), due: day ? { day, source: 'set' as const, ...extra } : null });
    expect(isDueThisWeek(r('due', '2026-11-28'), NOW)).toBe(true);
    expect(isDueThisWeek(r('due', '2026-11-20'), NOW)).toBe(true);
    expect(isDueThisWeek(r('due', '2026-11-30'), NOW)).toBe(false);
    expect(isDueThisWeek(r('due', '2026-11-27', { snoozed: true }), NOW)).toBe(false);
    expect(isDueThisWeek(r('due'), NOW)).toBe(true);
    expect(isDueThisWeek(r('suggested', '2026-11-25'), NOW)).toBe(false);
    expect(isDueThisWeek(r('blocker', '2026-11-25'), NOW)).toBe(false);
    expect(journeyCounts(rowsOf(), NOW)).toEqual({ blocker: 2, due: 1 });
  });
});

describe('the Projects screen', () => {
  const mount = async (book: any[] = BOOK) => {
    const { default: ProjectsJourney } = await import('../../components/projects/journey/ProjectsJourney');
    const onOpenProject = vi.fn();
    const onStatusChange = vi.fn();
    const onQuickUpdate = vi.fn();
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(<ProjectsJourney projects={book as any} activeProjectId={null} onOpenProject={onOpenProject}
        onCreateNew={() => {}} onDeleteProject={() => {}} onDuplicateProject={() => {}} onStatusChange={onStatusChange} onQuickUpdate={onQuickUpdate} />);
    });
    return { view: view!, onOpenProject, onStatusChange, onQuickUpdate };
  };
  const rowCount = (v: ReturnType<typeof render>) => v.container.querySelectorAll('[data-testid^="journey-row-"]').length;

  it('the journey strip filters the list, and a second click shows every project', async () => {
    const { view } = await mount();
    expect(rowCount(view)).toBe(8);
    const strip = within(screen.getByRole('navigation', { name: 'Stages' }));
    fireEvent.click(strip.getByRole('button', { name: /On site/ }));
    expect(rowCount(view)).toBe(2);
    fireEvent.click(strip.getByRole('button', { name: /On site/ }));
    expect(rowCount(view)).toBe(8);
    fireEvent.click(strip.getByRole('button', { name: /Closed/ }));
    expect(rowCount(view)).toBe(2);
  });

  it('the next-step button opens its screen, without the hint after "?"', async () => {
    const { onOpenProject } = await mount();
    const card = screen.getByRole('button', { name: 'Project p3: Collect execution advance' });
    fireEvent.click(within(card).getByRole('button', { name: 'Fix it' }));
    expect(onOpenProject).toHaveBeenCalledTimes(1);
    expect(onOpenProject.mock.calls[0][0].id).toBe('p3');
    expect(onOpenProject.mock.calls[0][1]).toBe('payment-calc');
  });

  it('a row opens the preview, and Open project opens the project', async () => {
    const { onOpenProject } = await mount();
    fireEvent.click(screen.getByTestId('journey-row-p4'));
    const dialog = screen.getByRole('dialog', { name: 'Project p4' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open project' }));
    expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'p4' }), undefined);
  });

  it('a sticker click never opens the project; an Untagged one offers the tag', async () => {
    const { onOpenProject, onQuickUpdate } = await mount([project('u1', 'lead', { isDummy: undefined })]);
    const row = screen.getByTestId('journey-row-u1');
    fireEvent.click(within(row).getByRole('button', { name: /^Untagged/ }));
    expect(onOpenProject).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(row).getByRole('menuitem', { name: /Tag as Dummy/ }));
    expect(onQuickUpdate).toHaveBeenCalledWith('u1', 'isDummy', true);
  });

  it('dropping a card on another lane opens the status window at that stage', async () => {
    const { view } = await mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Board' }));
    const store: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => { store[k] = v; }, getData: (k: string) => store[k], effectAllowed: '' };
    fireEvent.dragStart(screen.getByTestId('card-p2'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('lane-won'), { dataTransfer });
    expect(view.container.ownerDocument.body.textContent).toContain('Project Lifecycle & Status Studio');
  });

  it('Ctrl K opens the command bar, and a project in it opens the preview', async () => {
    await mount();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('textbox', { name: 'Find a project or do its next step' });
    fireEvent.change(input, { target: { value: 'project p2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Project p2' })).toBeTruthy();
  });

  it('the triage deck counts through; left snoozes to tomorrow, right does the step', async () => {
    const { onOpenProject, onQuickUpdate } = await mount();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Go through them' }));
      const deck = screen.getByRole('dialog', { name: 'Go through what needs you' });
      expect(deck.textContent).toContain('1 of 4');
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      act(() => { vi.advanceTimersByTime(400); });
      expect(deck.textContent).toContain('2 of 4');
      /* The most recently touched blocker comes first; left puts its step off to tomorrow, on the project. */
      expect(onQuickUpdate).toHaveBeenCalledWith('p4', 'nextStepDue', { a4: expect.objectContaining({ day: '2026-11-26', snoozed: true }) });
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      act(() => { vi.advanceTimersByTime(400); });
      expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'p3' }), 'payment-calc');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no amounts', async () => {
    const { view } = await mount();
    expect(view.container.textContent || '').not.toMatch(/₹|\bRs\.?\s?\d|\blakhs?\b|\bcrores?\b/i);
  });

  const DATED = () => BOOK.map((p) =>
    p.id === 'p2' ? project('p2', 'proposal_sent', { ...p.context, _next: { ...p.context._next, dueKey: '2026-11-27' } })
    : p.id === 'p3' ? project('p3', 'won', { ...p.context, nextStepDue: { a3: { day: '2026-11-20', at: 1 } } })
    : p.id === 'p4' ? project('p4', 'execution', { ...p.context, snagList: [{ status: 'open' }, { status: 'verified' }, { status: 'resolved' }] })
    : p);

  it('a row says when its step is due, and its health: journey, drawings issued, open snags', async () => {
    await mount(DATED());
    expect(within(screen.getByTestId('journey-row-p2')).getByText('Fri')).toBeTruthy();
    expect(within(screen.getByTestId('journey-row-p3')).getByText('Overdue')).toBeTruthy();
    const p4 = screen.getByTestId('journey-row-p4');
    expect(p4.textContent).toMatch(/7\/10\s*dwg/);
    expect(p4.textContent).toMatch(/1\s*snag(?!s)/);
    expect(within(p4).getByLabelText(/Drawings 7\/10 issued · Snags 2\/3 closed/)).toBeTruthy();
    expect(screen.getByTestId('journey-row-p1').textContent).toContain('No dwg');
  });

  it('the Needs-you chip counts what is due this week', async () => {
    await mount(DATED());
    expect(screen.getByRole('button', { name: /2 blockers/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /1 due this week/ })).toBeTruthy();
  });

  it('This week lays the steps on their days; a drop moves the day, kept on the project', async () => {
    const { onQuickUpdate } = await mount(DATED());
    fireEvent.click(screen.getByRole('radio', { name: 'This week' }));
    expect(within(screen.getByTestId('day-2026-11-27')).getByTestId('week-card-p2')).toBeTruthy();
    /* No strip above the week: a step with no day sits on today, one overdue from before Monday on Monday. */
    expect(screen.queryByRole('region', { name: 'Not on a day this week' })).toBeNull();
    const today = within(screen.getByTestId('day-2026-11-25'));
    expect(today.getByText('Today')).toBeTruthy();
    expect(today.getByTestId('week-card-p1')).toBeTruthy();
    const monday = within(screen.getByTestId('day-2026-11-23'));
    expect(monday.getByTestId('week-card-p3')).toBeTruthy();
    expect(monday.getByText('Overdue')).toBeTruthy();
    const store: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => { store[k] = v; }, getData: (k: string) => store[k], effectAllowed: '' };
    fireEvent.dragStart(screen.getByTestId('week-card-p1'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('day-2026-11-24'), { dataTransfer });
    expect(onQuickUpdate).toHaveBeenCalledWith('p1', 'nextStepDue', { a1: expect.objectContaining({ day: '2026-11-24' }) });
  });

  it('··· sets the step\'s day too, for a touch screen', async () => {
    const { onQuickUpdate } = await mount(DATED());
    fireEvent.click(screen.getByRole('button', { name: 'More for Project p2' }));
    expect(screen.getByText('Due · Fri')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tomorrow' }));
    expect(onQuickUpdate).toHaveBeenCalledWith('p2', 'nextStepDue', { a2: expect.objectContaining({ day: '2026-11-26' }) });
  });
});

describe('the studio switch', () => {
  it('shows the glass folders unless the studio picked the new screen', async () => {
    const { default: Switch } = await import('../../components/projects/ProjectsScreenSwitch');
    const props = { projects: [project('s1', 'lead')] as any, activeProjectId: null, onOpenProject: () => {}, onCreateNew: () => {}, onDeleteProject: () => {}, onDuplicateProject: () => {} };
    org.orgData.projectsScreen = undefined;
    let v: ReturnType<typeof render>;
    await act(async () => { v = render(<Switch {...props} />); });
    expect(v!.container.querySelector('[data-testid="project-folder-s1"]')).toBeTruthy();
    cleanup();
    org.orgData.projectsScreen = 'journey';
    await act(async () => { v = render(<Switch {...props} />); });
    expect(await screen.findByTestId('journey-row-s1')).toBeTruthy();
    org.orgData.projectsScreen = undefined;
  });
});
