/*
  Execution & Site, split into screens of summary-first sections (plan item 9).

  Pins: the stage's five screens, the one-line summaries and which section a
  screen opens first, that one section is open at a time, and that the old
  Execution & Ops links still land on the tool they named.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { NAV_CONFIG } from '../../components/navConfig';
import { SITE_MOVED_ROUTES } from '../../lib/siteRoutes';
import { isRouteHidden } from '../../lib/engagement';
import {
  snagLine, checklistLine, electricalLine, minutesLine, weeklyLine, firstToOpen, checklistProgress,
} from '../../lib/siteSections';
import SectionStack from '../../components/site/SectionStack';

vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ orgData: { tenantId: 't1' } }) }));
vi.mock('../../services/firebaseClient', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(),
  onSnapshot: (_q: any, ok: (s: any) => void) => { ok({ docs: [] }); return () => {}; },
}));
vi.mock('../../components/ops/SnagListManager', () => ({ default: () => <div>snag tool</div> }));
vi.mock('../../components/ops/PreHandoverChecklist', () => ({ default: ({ mode }: any) => <div>checklist tool {mode}</div> }));
vi.mock('../../components/ops/WeeklyPulseManager', () => ({ default: ({ mode }: any) => <div>weekly tool {mode}</div> }));
vi.mock('../../components/ops/MomActionTracker', () => ({ MomActionTracker: () => <div>minutes tool</div> }));
vi.mock('../../components/ops/DecisionTracker', () => ({ default: () => <div>decisions tool</div> }));
vi.mock('../../components/ExecutionWorkspace', () => ({ default: () => <div>packages tool</div> }));

afterEach(cleanup);

const ROOMS = [{ id: 'k', name: 'Kitchen' }, { id: 'l', name: 'Living' }] as any;

describe('Execution & Site screens', () => {
  it('stage 5 lists five screens, and Execution & Ops is gone', () => {
    const stage = NAV_CONFIG.find((s) => s.stage === 5)!;
    expect(stage.items.map((i) => [i.label, i.route])).toEqual([
      ['Site Control Room', 'site-ops'],
      ['Quality & Snags', 'site-quality'],
      ['Meetings & Reports', 'site-meetings'],
      ['Selections & Orders', 'materials'],
      ['Scope Additions', 'scope-additions'],
    ]);
  });

  it('old links land on the screen that now holds the tool', () => {
    expect(SITE_MOVED_ROUTES['mom-action-tracker']).toEqual({ route: 'site-meetings', focus: 'minutes' });
    expect(SITE_MOVED_ROUTES['update-client-feed']).toEqual({ route: 'site-meetings', focus: 'weekly' });
  });

  it('a design-only project has no site to check, but keeps its minutes', () => {
    expect(isRouteHidden('design_only', 'site-quality')).toBe(true);
    expect(isRouteHidden('design_only', 'site-meetings')).toBe(false);
  });
});

describe('section lines', () => {
  it('snags: open, high and waiting to verify', () => {
    expect(snagLine({ snagList: [] })).toEqual({ summary: 'Nothing logged yet', tone: 'none' });
    const snags = [
      { status: 'open', severity: 'high' }, { status: 'in_progress', severity: 'low' }, { status: 'resolved', severity: 'medium' },
    ] as any;
    expect(snagLine({ snagList: snags })).toEqual({ summary: '2 open · 1 high · 1 to verify', tone: 'bad' });
    expect(snagLine({ snagList: [{ status: 'verified', severity: 'high' }] as any }).tone).toBe('ok');
  });

  it('checklist: worked out as the checklist does, skipping checks marked not applicable', () => {
    const ctx = {
      rooms: ROOMS,
      qualityChecklist: {
        checkedState: { k: { paint: true, hardware: true, clean: true, electrical: true, plumbing: true }, l: { paint: true } },
        naState: { k: { debris: true } },
        customChecks: [{ id: 'c', roomId: 'l', checked: false }],
        elecVerified: { k: true },
      },
      electricalPointsPlan: [{ qty: 12 }, { qty: 9 }],
    } as any;
    // Kitchen 5 of 5 (debris not applicable); Living 1 of 7 (six standard + one custom).
    expect(checklistProgress(ctx)).toMatchObject({ total: 12, done: 6, pct: 50, roomsDone: 1, elecRooms: 1, points: 21 });
    expect(checklistLine(ctx)).toEqual({ summary: '50% done · 1 of 2 rooms complete', tone: 'warn' });
    expect(electricalLine(ctx)).toEqual({ summary: '21 points planned · 1 of 2 rooms verified', tone: 'warn' });
    expect(checklistLine({ rooms: [] } as any).tone).toBe('none');
  });

  it('minutes and weekly reports', () => {
    expect(minutesLine({ meetings: 0, open: 0, overdue: 0, toConfirm: 0 }).summary).toBe('No meeting recorded yet');
    expect(minutesLine({ meetings: 3, open: 5, overdue: 2, toConfirm: 1 }))
      .toEqual({ summary: '5 open actions · 2 overdue · 1 minutes to confirm', tone: 'bad' });
    const now = Date.parse('2026-11-16T10:00:00Z');
    const reports = [
      { weekNumber: 2, weekOf: '2026-11-02', publishedAt: Date.parse('2026-11-06T10:00:00Z') },
      { weekNumber: 1, weekOf: '2026-10-26', publishedAt: Date.parse('2026-10-30T10:00:00Z') },
    ] as any;
    expect(weeklyLine({ weeklyReports: reports }, now)).toEqual({ summary: "Week 2 issued 10 days ago · this week's is due", tone: 'warn' });
    expect(weeklyLine({ weeklyReports: [] }, now).summary).toBe('No report issued yet');
  });

  it('opens the first bad section, else the first that needs a look', () => {
    expect(firstToOpen([{ id: 'a', tone: 'ok' }, { id: 'b', tone: 'warn' }, { id: 'c', tone: 'bad' }])).toBe('c');
    expect(firstToOpen([{ id: 'a', tone: 'none' }, { id: 'b', tone: 'warn' }])).toBe('b');
    expect(firstToOpen([{ id: 'a', tone: 'none' }, { id: 'b', tone: 'none' }])).toBe('a');
  });
});

describe('SectionStack', () => {
  it('shows every line, and one section open at a time', () => {
    function Host() {
      const [open, setOpen] = React.useState<string | null>('one');
      return (
        <SectionStack label="Test" open={open} onOpen={setOpen} sections={[
          { id: 'one', title: 'One', icon: () => null, line: { summary: '3 open', tone: 'bad' }, render: () => <p>body one</p> },
          { id: 'two', title: 'Two', icon: () => null, line: { summary: 'All done', tone: 'ok' }, render: () => <p>body two</p> },
        ]} />
      );
    }
    render(<Host />);
    expect(screen.getByText('3 open')).toBeTruthy();
    expect(screen.getByText('All done')).toBeTruthy();
    expect(screen.getByText('body one')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Two/ }));
    expect(screen.queryByText('body one')).toBeNull();
    expect(screen.getByText('body two')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Two/ }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Two/ }));
    expect(screen.queryByText('body two')).toBeNull();
  });
});

describe('SiteOpsTab', () => {
  const base = { setProjectContext: vi.fn(), projectId: 'p1' } as any;

  it('Quality & snags opens the snag list when a high snag is open', async () => {
    const { default: SiteOpsTab } = await import('../../components/SiteOpsTab');
    render(<SiteOpsTab {...base} view="quality" projectContext={{ rooms: ROOMS, snagList: [{ status: 'open', severity: 'high' }] } as any} />);
    expect(screen.getByText('snag tool')).toBeTruthy();
    expect(screen.queryByText(/checklist tool/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Electrical points check/ }));
    expect(screen.getByText('checklist tool electrical-plan')).toBeTruthy();
    expect(screen.queryByText('snag tool')).toBeNull();
  });

  it('Meetings & reports opens the section an old link asked for', async () => {
    const { default: SiteOpsTab } = await import('../../components/SiteOpsTab');
    render(<SiteOpsTab {...base} view="meetings" focus="weekly" projectContext={{ weeklyReports: [] } as any} />);
    const list = screen.getByRole('list', { name: 'Meetings & reports' });
    expect(within(list).getByText('weekly tool reports')).toBeTruthy();
    expect(within(list).getByText('No meeting recorded yet')).toBeTruthy();
  });

  it('the site control room is the packages, with no tabs above them', async () => {
    const { default: SiteOpsTab } = await import('../../components/SiteOpsTab');
    render(<SiteOpsTab {...base} view="control" projectContext={{} as any} />);
    expect(screen.getByText('packages tool')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
