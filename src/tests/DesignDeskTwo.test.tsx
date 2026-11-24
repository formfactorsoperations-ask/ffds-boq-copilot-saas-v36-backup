import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';

/*
  Design Desk 2.0 on screen (components/designDesk2), with the studio's data
  stubbed: the switch between the two desks, Home's "Start here", a project's
  rooms, a room's drawings with their steps, sending, and All drawings.
*/

const h = vi.hoisted(() => ({ org: {} as any, studio: [] as any[], trackers: {} as Record<string, any[]>, submit: null as any, update: null as any }));

vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => h.org }));
vi.mock('../../lib/pdfRender', () => ({ thumbnailOf: vi.fn(async () => null), loadPdf: vi.fn(() => new Promise(() => undefined)), renderPage: vi.fn() }));
vi.mock('../../services/drawingReviewService', () => ({
  watchStudioReviews: (_o: string, cb: (r: any[]) => void) => { cb(h.studio); return () => undefined; },
  watchProjectDrawings: (_o: string, p: string, cb: (r: any[]) => void) => { cb(h.trackers[p] || []); return () => undefined; },
  watchDrawing: (_o: string, p: string, d: string, cb: (r: any) => void) => { cb([...h.studio, ...Object.values(h.trackers).flat()].find((x) => x.projectId === p && x.id === d) || null); return () => undefined; },
  watchVersions: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
  watchMarks: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
  watchRounds: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
  watchEvents: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
  takeOpenRequest: () => null,
  returnFromDesk: vi.fn(),
  submitSheet: (...a: any[]) => h.submit(...a),
  fileUrl: () => Promise.reject(new Error('no files in tests')),
  fileBlob: () => Promise.reject(new Error('no files in tests')),
  uploadSheet: vi.fn(), withdrawSheet: vi.fn(), approveSheet: vi.fn(), returnSheet: vi.fn(), createMark: vi.fn(), deleteMark: vi.fn(),
  updateMark: vi.fn(), fixMark: vi.fn(), setAudience: vi.fn(), removeVersion: vi.fn(), clientReturn: vi.fn(), clientKeep: vi.fn(), call: vi.fn(), ReviewError: class extends Error {},
}));

import DesignDeskSwitch from '../../components/designDesk2/DesignDeskSwitch';
import DeskTwo from '../../components/designDesk2/DeskTwo';

const NOW = Date.now();
const person = (name: string) => ({ uid: name.toLowerCase(), email: `${name.toLowerCase()}@studio.in`, name });
const sheet = (id: string, projectId: string, name: string, state: string | null, extra: any = {}) => ({
  id, orgId: 's', projectId, name, roomName: extra.room || 'Kitchen', targetDate: extra.targetDate, approvedAt: null, gfcStatus: null,
  review: state ? {
    schema: 1, orgId: 's', projectId, projectName: projectId === 'p1' ? 'Harmony 704' : 'Palm Grove Villa', drawingId: id, state, rev: 7, audience: 'client',
    versionId: 'v1', versionNo: extra.v || 1, pdfPath: 'x.pdf', thumbPath: null, pageCount: 1, openRoundId: null, attempts: 1,
    designer: person(extra.by || 'Riya'), submittedAt: NOW - 3_600_000, decidedBy: null, decidedAt: null, reason: null,
    selfApproved: false, marksTotal: extra.open || 0, marksOpen: extra.open || 0, marksSeq: 0, updatedAt: NOW,
  } : undefined,
});
const yesterday = new Date(NOW - 86_400_000).toISOString().slice(0, 10);
const projects = [
  { id: 'p1', context: { name: 'Harmony 704', clientName: 'Mehta residence' } },
  { id: 'p2', context: { name: 'Palm Grove Villa', clientName: 'Iyer family' } },
];

beforeEach(() => {
  cleanup();
  localStorage.clear();
  const p1 = [
    sheet('a', 'p1', 'Master Bedroom Wardrobe', 'IN_REVIEW', { by: 'Kabir', targetDate: yesterday, room: 'Master Bedroom' }),
    sheet('b', 'p1', 'Kitchen Elevation A', 'IN_REVIEW'),
    sheet('c', 'p1', 'Foyer Ceiling Plan', 'DRAFT', { room: 'Foyer' }),
    sheet('d', 'p1', 'Kitchen Plan', null),
    sheet('e', 'p1', 'Living Room Layout', 'APPROVED', { room: 'Living Room' }),
  ];
  const p2 = [sheet('f', 'p2', 'Pool Deck Plan', 'CHANGES_REQUESTED', { open: 2, room: 'Pool Deck' })];
  h.trackers = { p1, p2 };
  h.studio = [...p1, ...p2].filter((d) => d.review);
  h.submit = vi.fn(async () => ({}));
  h.update = vi.fn();
  window.scrollTo = vi.fn() as any;
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

const org = (role: string, name: string, extra: any = {}) => { h.org = { orgData: { tenantId: 's', ...extra }, updateOrgData: h.update, currentRole: role, currentUserAuth: { uid: name.toLowerCase(), email: `${name.toLowerCase()}@studio.in`, displayName: name } }; };

describe('the switch between the two desks', () => {
  it("keeps today's desk by default and offers the new one to senior roles", () => {
    org('Design Head', 'Head');
    render(<DesignDeskSwitch projects={projects} />);
    expect(screen.getByRole('tablist', { name: 'Design Desk views' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Switch the studio to the new desk' }));
    expect(h.update).toHaveBeenCalledWith({ designDesk: 'new' });
  });
  it('does not offer the switch to a Designer', () => {
    org('Designer', 'Riya');
    render(<DesignDeskSwitch projects={projects} />);
    expect(screen.queryByRole('button', { name: 'Switch the studio to the new desk' })).toBeNull();
  });
  it('shows the new desk once the studio has switched, with the way back', async () => {
    org('Design Head', 'Head', { designDesk: 'new' });
    render(<DesignDeskSwitch projects={projects} />);
    expect(await screen.findByRole('navigation', { name: 'Design Desk' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Use the old desk/ }));
    expect(h.update).toHaveBeenCalledWith({ designDesk: 'classic' });
  });
});

describe('Design Desk 2.0', () => {
  it('starts the Design Head on the most urgent drawing, with one button', () => {
    org('Design Head', 'Head');
    render(<DeskTwo projects={projects} />);
    expect(screen.getByText('2 drawings need you today')).toBeTruthy();
    expect(screen.getByText('Start here')).toBeTruthy();
    expect(screen.getByText('Kabir sent this for you to check.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Check this drawing' }).length).toBe(2);
    expect(screen.getByText('Then do these')).toBeTruthy();
    /* Back with a designer, and approved but not yet shown to the client. */
    expect(screen.getByText('Waiting for someone else')).toBeTruthy();
    expect(screen.getByText('Riya is making 2 changes.')).toBeTruthy();
    expect(screen.getByText('Approved in the studio. Show it to the client at the next meeting.')).toBeTruthy();
  });

  it('opens a project to its rooms and a room to its drawings with their steps', () => {
    org('Design Head', 'Head');
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: /Mehta residence/ }));
    expect(screen.getByText(/Pick a room to see its drawings/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kitchen/ }));
    expect(screen.getByRole('heading', { name: 'Kitchen' })).toBeTruthy();
    /* The whole tracker of the open project: the drawing nobody has started shows too. */
    expect(screen.getByText('Nobody has uploaded this drawing yet.')).toBeTruthy();
    const steps = screen.getAllByRole('list', { name: 'Steps' });
    expect(steps.length).toBe(2);
    expect(within(steps[0]).getByText('Design Head checks').closest('li')?.getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: 'Harmony 704' }));
    expect(screen.getByText(/Pick a room to see its drawings/)).toBeTruthy();
  });

  it("sends a designer's own drawing from its one button", async () => {
    org('Designer', 'Riya');
    render(<DeskTwo projects={projects} />);
    expect(screen.getByText('You uploaded it. Send it to the Design Head.')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Send to the Design Head' })[0]); });
    expect(h.submit).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', drawingId: 'c' }, 7);
    /* Designers have no Meetings tab unless they present; they never see the switch. */
    expect(screen.queryByRole('button', { name: /Use the old desk/ })).toBeNull();
  });

  it('lists every drawing with where it is now, and filters by search and Only mine', () => {
    org('Designer', 'Riya');
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: 'All drawings' }));
    expect(screen.getByText('6 drawings')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search drawings'), { target: { value: 'pool' } });
    expect(screen.getByText('1 drawing')).toBeTruthy();
    expect(screen.getByText('The Design Head asked for 2 changes. Make them and upload it again.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search drawings'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Only mine'));
    /* Kabir's wardrobe and the drawing nobody started drop out. */
    expect(screen.getByText('4 drawings')).toBeTruthy();
  });

  it("opens a drawing in the review screen and comes back", () => {
    org('Design Head', 'Head');
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Check this drawing' })[0]);
    expect(screen.getByRole('heading', { name: 'Master Bedroom Wardrobe' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Design Desk/ }));
    expect(screen.getByText('Start here')).toBeTruthy();
  });
});
