import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

/*
  Design Desk 2.0, Phase 3A on screen (components/designDesk2/smart.tsx):
  Home's "Worth knowing", the site date on a drawing, and Nudge.
*/

const h = vi.hoisted(() => ({ site: null as any, nudge: null as any }));
vi.mock('../../services/drawingReviewService', () => ({
  setSiteDate: (...a: any[]) => h.site(...a),
  nudgeHolder: (...a: any[]) => h.nudge(...a),
}));

import { NudgeButton, SiteLine, SiteTag, WorthKnowing } from '../../components/designDesk2/smart';

const DAY = 86_400_000;
const iso = (days: number) => { const d = new Date(Date.now() + days * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const rahul = { uid: 'r', email: 'rahul@studio.in', name: 'Rahul Verma' };
const row = (id: string, name: string, state: string | null, x: any = {}) => ({
  id, orgId: 's', projectId: x.projectId || 'p1', name, roomName: 'Kitchen', siteDate: x.site ?? null, isGapFlagged: !!x.gap, companionOf: x.pair ?? null, gfcStatus: null, approvedAt: null,
  review: state ? { state, audience: 'client', designer: rahul, versionId: 'v1', versionNo: 1, submittedAt: Date.now() - (x.held ?? 0) * DAY, decidedAt: Date.now() - (x.held ?? 0) * DAY, updatedAt: Date.now(), ...(x.review || {}) } : undefined,
}) as any;
const head = { reviewer: true, email: 'anish@studio.in' };
const designer = { reviewer: false, email: 'priya@studio.in' };

beforeEach(() => {
  cleanup();
  h.site = vi.fn(async () => undefined);
  h.nudge = vi.fn(async () => ({ to: 'the Design Head' }));
});

describe('Worth knowing, on Home', () => {
  const rows = [
    row('k2', 'Kitchen elevation A', 'IN_REVIEW', { site: iso(4) }),
    row('k3', 'Kitchen elevation B', null, { site: iso(-2), gap: true, pair: 'k1' }),
    row('k1', 'Kitchen plan', 'APPROVED'),
    row('l1', 'Living false ceiling', 'DRAFT', { site: iso(40) }),
  ];
  const props = { rows, projectName: () => 'Mehta Residence', open: vi.fn(), goProject: vi.fn(), goMeetings: vi.fn() };

  it('tells the Design Head about site dates at risk, missing drawings and rounds to bill', () => {
    const open = vi.fn(), goProject = vi.fn(), goMeetings = vi.fn();
    render(<WorthKnowing {...props} open={open} goProject={goProject} goMeetings={goMeetings} reviewer
      rounds={[{ projectId: 'p1', projectName: 'Mehta Residence', meetingId: 'm1', room: 'Living & dining', round: 3, included: 2, changes: 2, closedAt: 1 }]} />);
    expect(screen.getByText('Living & dining is on revision round 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bill or waive it' }));
    expect(goMeetings).toHaveBeenCalledWith('p1');
    /* The late one first; the drawing with weeks to spare is not listed. */
    expect(screen.getByText('2 drawings may miss the site date')).toBeTruthy();
    expect(screen.getByText(/^Kitchen elevation B \(site needed it .*\) · Kitchen elevation A \(site needs it .*\)$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the first' }));
    expect(open).toHaveBeenCalledWith(rows[1]);
    expect(screen.getByText('1 drawing is missing beside its pair')).toBeTruthy();
    expect(screen.getByText('Kitchen elevation B has no drawing uploaded yet, and Kitchen plan, which goes with it, is already ahead.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Mehta Residence' }));
    expect(goProject).toHaveBeenCalledWith('p1');
    /* Nothing is promised about reminders going by themselves: there are none. */
    expect(screen.queryByText(/Reminders go out on their own/)).toBeNull();
  });

  it('does not show a Designer the missing drawings or the rounds, and says so when nothing is at risk', () => {
    render(<WorthKnowing {...props} rows={[rows[3]]} reviewer={false} />);
    expect(screen.queryByText(/missing beside/)).toBeNull();
    expect(screen.queryByText(/revision round/)).toBeNull();
    expect(screen.getByText('No site date is at risk and nothing is missing.')).toBeTruthy();
  });
});

describe('the site date on a drawing', () => {
  it('shows a tag only when the date is at risk', () => {
    const { rerender } = render(<SiteTag d={row('a', 'A', 'IN_REVIEW', { site: iso(4) })} />);
    expect(screen.getByText(/^Site needs it /)).toBeTruthy();
    rerender(<SiteTag d={row('a', 'A', 'IN_REVIEW', { site: iso(40) })} />);
    expect(screen.queryByText(/Site needs it/)).toBeNull();
  });

  it('lets a lead set it, and only shows it to everyone else', async () => {
    const d = row('a', 'A', 'IN_REVIEW');
    const { unmount } = render(<SiteLine d={d} canSet />);
    expect(screen.getByText('No site date yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set the site date' }));
    await act(async () => { fireEvent.change(screen.getByLabelText(/Site needs it on/), { target: { value: '2026-12-01' } }); });
    expect(h.site).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', drawingId: 'a' }, '2026-12-01');
    unmount();
    /* A Designer sees the warning but has no way to change the date; with no date they see nothing. */
    const { container, unmount: off } = render(<SiteLine d={row('a', 'A', 'IN_REVIEW', { site: iso(4) })} canSet={false} />);
    expect(screen.getByText(/At this pace it will be late/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    off();
    expect(render(<SiteLine d={d} canSet={false} />).container.textContent).toBe('');
    expect(container).toBeTruthy();
  });
});

describe('Nudge', () => {
  it('reminds whoever has held the drawing a day or more, once, and offers nothing for WhatsApp', async () => {
    const d = row('b1', 'Master wardrobe', 'IN_REVIEW', { held: 3 });
    render(<NudgeButton d={d} viewer={designer} projectName="Kapoor Villa" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nudge the Design Head about Master wardrobe' })); });
    expect(h.nudge).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', drawingId: 'b1' });
    const done = screen.getByRole('button', { name: 'Nudge the Design Head about Master wardrobe' }) as HTMLButtonElement;
    expect(done.textContent).toBe('Reminded');
    expect(done.disabled).toBe(true);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is not offered to the person holding it, for a drawing held under a day, or when nobody holds it', () => {
    const cases: [any, any][] = [
      [row('a', 'A', 'IN_REVIEW', { held: 3 }), head],
      [row('a', 'A', 'CHANGES_REQUESTED', { held: 3 }), { reviewer: false, email: 'rahul@studio.in' }],
      [row('a', 'A', 'IN_REVIEW', { held: 0.5 }), designer],
      [row('a', 'A', 'APPROVED', { held: 5 }), designer],
    ];
    cases.forEach(([d, viewer]) => {
      const { container, unmount } = render(<NudgeButton d={d} viewer={viewer} projectName="P" />);
      expect(container.textContent).toBe('');
      unmount();
    });
    /* The Design Head can nudge a designer who has had changes for days. */
    render(<NudgeButton d={row('a', 'A', 'CHANGES_REQUESTED', { held: 3 })} viewer={head} projectName="P" />);
    expect(screen.getByRole('button', { name: 'Nudge Rahul about A' })).toBeTruthy();
  });

  it('waits a few hours after the last reminder', () => {
    render(<NudgeButton d={row('a', 'A', 'IN_REVIEW', { held: 3, review: { nudgedAt: Date.now() - 3_600_000 } })} viewer={designer} projectName="P" />);
    const b = screen.getByRole('button', { name: /Nudge/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('A reminder went a short while ago. Try again in a few hours.');
  });
});
