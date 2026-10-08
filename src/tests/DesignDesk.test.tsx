import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';

/*
  Design Desk on screen, with the studio's data stubbed: the Design Head's
  and a designer's home, the project switcher, sending by button and by
  dragging, search, and opening a sheet.
*/

const h = vi.hoisted(() => ({ org: {} as any, studio: [] as any[], trackers: {} as Record<string, any[]>, submit: null as any }));

vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => h.org }));
vi.mock('../../lib/pdfRender', () => ({ thumbnailOf: vi.fn(async () => null), loadPdf: vi.fn(), renderPage: vi.fn() }));
vi.mock('../../services/drawingReviewService', () => {
  const none = () => () => undefined;
  return {
    watchStudioReviews: (_o: string, cb: (r: any[]) => void) => { cb(h.studio); return () => undefined; },
    watchProjectDrawings: (_o: string, p: string, cb: (r: any[]) => void) => { cb(h.trackers[p] || []); return () => undefined; },
    watchDrawing: (_o: string, p: string, d: string, cb: (r: any) => void) => { cb([...h.studio, ...Object.values(h.trackers).flat()].find((x) => x.projectId === p && x.id === d) || null); return () => undefined; },
    watchVersions: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
    watchMarks: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
    watchRounds: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
    watchEvents: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
    takeOpenRequest: () => null,
    submitSheet: (...a: any[]) => h.submit(...a),
    fileUrl: () => Promise.reject(new Error('no files in tests')),
    fileBlob: () => Promise.reject(new Error('no files in tests')),
    uploadSheet: vi.fn(), withdrawSheet: vi.fn(), approveSheet: vi.fn(), returnSheet: vi.fn(), createMark: vi.fn(), deleteMark: vi.fn(),
    updateMark: vi.fn(), fixMark: vi.fn(), setAudience: vi.fn(), removeVersion: vi.fn(), ReviewError: class extends Error {}, watchSub: none,
  };
});

import DesignDeskTab from '../../components/drawingReview/DesignDeskTab';

const NOW = Date.now();
const person = (name: string) => ({ uid: name.toLowerCase(), email: `${name.toLowerCase()}@studio.in`, name });
const sheet = (id: string, projectId: string, name: string, state: string | null, extra: any = {}) => ({
  id, orgId: 's', projectId, name, roomName: extra.room || 'Kitchen', targetDate: extra.targetDate,
  review: state ? {
    schema: 1, orgId: 's', projectId, projectName: projectId === 'p1' ? 'Harmony 704' : 'Palm Grove Villa', drawingId: id, state, rev: 7, audience: 'client',
    versionId: 'v1', versionNo: extra.v || 1, pdfPath: 'x.pdf', thumbPath: null, pageCount: 1, openRoundId: null, attempts: extra.attempts || 1,
    designer: person(extra.by || 'Riya'), submittedAt: NOW - 3_600_000, decidedBy: null, decidedAt: extra.decidedAt || null, reason: null,
    selfApproved: false, marksTotal: extra.marks || 0, marksOpen: extra.open || 0, marksSeq: 0, updatedAt: NOW,
  } : undefined,
});
const yesterday = new Date(NOW - 86_400_000).toISOString().slice(0, 10);

const projects = [
  { id: 'p1', context: { name: 'Harmony 704', clientName: 'Mehta residence' } },
  { id: 'p2', context: { name: 'Palm Grove Villa', clientName: 'Iyer family' } },
];

function data() {
  const p1 = [
    sheet('a', 'p1', 'Master Bedroom Wardrobe', 'IN_REVIEW', { by: 'Kabir', targetDate: yesterday, room: 'Master Bedroom' }),
    sheet('b', 'p1', 'Kitchen Elevation A', 'IN_REVIEW', { attempts: 3 }),
    sheet('c', 'p1', 'Foyer Ceiling Plan', 'DRAFT', { room: 'Foyer' }),
    sheet('d', 'p1', 'Kids Room Elevation', null, { room: 'Kids Room' }),
    sheet('e', 'p1', 'Living Room Layout', 'APPROVED', { room: 'Living Room' }),
  ];
  const p2 = [sheet('f', 'p2', 'Pool Deck Plan', 'CHANGES_REQUESTED', { marks: 2, open: 1, decidedAt: NOW - 3_600_000, room: 'Pool Deck' })];
  h.trackers = { p1, p2 };
  h.studio = [...p1, ...p2].filter((d) => d.review);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  data();
  h.submit = vi.fn(async () => ({}));
  window.scrollTo = vi.fn() as any;
});

const asHead = () => { h.org = { orgData: { tenantId: 's' }, currentRole: 'Design Head', currentUserAuth: { uid: 'head', email: 'head@studio.in', displayName: 'Design Head' } }; };
const asRiya = () => { h.org = { orgData: { tenantId: 's' }, currentRole: 'Designer', currentUserAuth: { uid: 'riya', email: 'riya@studio.in', displayName: 'Riya' } }; };

describe('Design Desk', () => {
  it('opens the Design Head on every project, with her review queue first', () => {
    asHead();
    render(<DesignDeskTab projects={projects} />);
    expect(screen.getByRole('heading', { name: 'Design Desk' })).toBeTruthy();
    expect(screen.getByText('All projects')).toBeTruthy();
    expect(screen.getByText('sheets waiting for your review')).toBeTruthy();
    expect(screen.getByText(/Most urgent: Master Bedroom Wardrobe/)).toBeTruthy();
    expect(screen.getByText('Waiting for your review')).toBeTruthy();
    /* Worth a look: the overdue sheet and the third round. */
    expect(screen.getByText(/Master Bedroom Wardrobe is overdue 1 d/)).toBeTruthy();
    expect(screen.getByText(/Kitchen Elevation A is on round 3/)).toBeTruthy();
  });

  it('switches project from the band, by search and Enter', () => {
    asHead();
    render(<DesignDeskTab projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: /Switch project/ }));
    const dialog = screen.getByRole('dialog', { name: 'Switch project' });
    const box = within(dialog).getByLabelText('Find a project');
    fireEvent.change(box, { target: { value: 'palm' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.queryByRole('dialog', { name: 'Switch project' })).toBeNull();
    expect(screen.getByText('Working in')).toBeTruthy();
    expect(screen.getAllByText('Palm Grove Villa').length).toBeGreaterThan(0);
    expect(screen.getByText('Iyer family')).toBeTruthy();
  });

  it('gives a designer her sheets to fix and send, and sends with the button', async () => {
    asRiya();
    render(<DesignDeskTab projects={projects} activeProjectId="p1" />);
    expect(screen.getByText('Ready to send')).toBeTruthy();
    expect(screen.getByText(/Pool Deck Plan: 1 note to fix/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Send v1' })[0]); });
    expect(h.submit).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', drawingId: 'c' }, 7);
  });

  it('sends a ready sheet dragged onto the Design Head', async () => {
    vi.useFakeTimers();
    asRiya();
    render(<DesignDeskTab projects={projects} activeProjectId="p1" />);
    const store: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => { store[k] = v; }, getData: (k: string) => store[k] || '', types: ['text/drawing'], effectAllowed: '' };
    const row = screen.getByRole('button', { name: 'Open Foyer Ceiling Plan' }).parentElement!;
    fireEvent.dragStart(row, { dataTransfer });
    await act(async () => { vi.runAllTimers(); });
    const zone = screen.getByText(/Drop here to send Foyer Ceiling Plan/).closest('div')!.parentElement!;
    fireEvent.dragOver(zone, { dataTransfer });
    await act(async () => { fireEvent.drop(zone, { dataTransfer }); });
    vi.useRealTimers();
    expect(h.submit).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', drawingId: 'c' }, 7);
  });

  it('lists every project as a tile, and searches sheets across them', () => {
    asHead();
    render(<DesignDeskTab projects={projects} />);
    fireEvent.click(screen.getByRole('tab', { name: /All sheets/ }));
    expect(screen.getByRole('button', { name: 'Open Harmony 704' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Palm Grove Villa' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search sheets'), { target: { value: 'wardrobe' } });
    expect(screen.getByRole('button', { name: 'Open Master Bedroom Wardrobe' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Pool Deck Plan' })).toBeNull();
  });

  it('opens a sheet in focus and comes back', () => {
    asRiya();
    render(<DesignDeskTab projects={projects} activeProjectId="p1" />);
    fireEvent.click(screen.getByRole('tab', { name: /All sheets/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Kids Room Elevation' }));
    expect(screen.getByRole('heading', { name: 'Kids Room Elevation' })).toBeTruthy();
    expect(screen.getByText('A clear desk')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Design Desk/ }));
    expect(screen.getByRole('heading', { name: 'Design Desk' })).toBeTruthy();
  });
});
