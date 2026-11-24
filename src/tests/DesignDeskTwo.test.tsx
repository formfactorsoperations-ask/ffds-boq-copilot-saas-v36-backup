import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';

/*
  Design Desk 2.0 on screen (components/designDesk2), with the studio's data
  stubbed: the switch between the two desks, Home's "Start here", a project's
  rooms, a room's drawings with their steps, sending, the three-step upload
  and All drawings.
*/

const h = vi.hoisted(() => ({ org: {} as any, studio: [] as any[], trackers: {} as Record<string, any[]>, submit: null as any, update: null as any, upload: null as any, versions: [] as any[], marks: [] as any[], approve: null as any, ret: null as any, mark: null as any, talk: [] as any[], post: null as any }));

vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => h.org }));
vi.mock('../../lib/pdfRender', () => ({ thumbnailOf: vi.fn(async () => null), pageCountOf: vi.fn(async () => 2), loadPdf: vi.fn(() => new Promise(() => undefined)), renderPage: vi.fn() }));
vi.mock('../../lib/pdfLandscape', () => ({ portraitPages: vi.fn(async () => 0), landscapeFile: vi.fn(async (file: File) => ({ file, turned: 0 })) }));
vi.mock('../../services/drawingReviewService', () => ({
  watchStudioReviews: (_o: string, cb: (r: any[]) => void) => { cb(h.studio); return () => undefined; },
  watchProjectDrawings: (_o: string, p: string, cb: (r: any[]) => void) => { cb(h.trackers[p] || []); return () => undefined; },
  watchDrawing: (_o: string, p: string, d: string, cb: (r: any) => void) => { cb([...h.studio, ...Object.values(h.trackers).flat()].find((x) => x.projectId === p && x.id === d) || null); return () => undefined; },
  watchVersions: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb(h.versions); return () => undefined; },
  watchMarks: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb(h.marks); return () => undefined; },
  watchRounds: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
  watchEvents: (_o: string, _p: string, _d: string, cb: (r: any[]) => void) => { cb([]); return () => undefined; },
  takeOpenRequest: () => null,
  returnFromDesk: vi.fn(),
  submitSheet: (...a: any[]) => h.submit(...a),
  fileUrl: () => Promise.reject(new Error('no files in tests')),
  fileBlob: () => Promise.reject(new Error('no files in tests')),
  uploadSheet: (...a: any[]) => h.upload(...a), withdrawSheet: vi.fn(), approveSheet: (...a: any[]) => h.approve(...a), returnSheet: (...a: any[]) => h.ret(...a), createMark: (...a: any[]) => h.mark(...a), deleteMark: vi.fn(),
  updateMark: vi.fn(), fixMark: vi.fn(), setAudience: vi.fn(), removeVersion: vi.fn(), clientReturn: vi.fn(), clientKeep: vi.fn(), call: vi.fn(), ReviewError: class extends Error {},
}));

vi.mock('../../services/roomMessageService', () => ({
  watchProjectMessages: (_o: string, p: string, cb: (r: any[]) => void) => { cb(h.talk.filter((m) => m.projectId === p)); return () => undefined; },
  postRoomMessage: (...a: any[]) => h.post(...a),
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
  h.upload = vi.fn(async () => ({ versionNo: 1 }));
  h.versions = []; h.marks = []; h.talk = []; h.post = vi.fn(async () => undefined);
  h.approve = vi.fn(async () => ({})); h.ret = vi.fn(async () => ({})); h.mark = vi.fn(async () => ({ mark: { id: 'new' } }));
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

  const v1 = { id: 'v1', n: 1, pdfPath: 'x.pdf', thumbPath: null, fileName: 'x.pdf', size: 1, pageCount: 1, note: '', by: person('Kabir'), at: NOW, source: 'upload' };

  it('opens a drawing on the new drawing screen and goes back where the person was', () => {
    org('Design Head', 'Head');
    h.versions = [v1];
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Check this drawing' })[0]);
    expect(screen.getByRole('heading', { name: 'Master Bedroom Wardrobe' })).toBeTruthy();
    expect(screen.getByText('Your turn')).toBeTruthy();
    /* Every review tool is in one bar under the drawing. */
    const bar = screen.getByRole('toolbar', { name: 'Drawing tools' });
    ['Select', 'Pin', 'Box', 'Arrow', 'Draw', 'Rotate the drawing', 'Zoom out', 'Zoom in'].forEach((n) => expect(within(bar).getByRole('button', { name: n })).toBeTruthy());
    expect(within(bar).getByRole('button', { name: /Full screen/ })).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Zoom in' }));
    expect(within(bar).getByRole('button', { name: /Zoom 120 percent/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'p' });
    expect(within(bar).getByRole('button', { name: 'Pin' }).getAttribute('aria-pressed')).toBe('true');
    /* The notes can be put away so the drawing has the whole width, and brought back. */
    fireEvent.click(within(bar).getByRole('button', { name: /Hide notes/ }));
    expect(screen.getByText('Your turn').closest('aside')?.hidden).toBe(true);
    fireEvent.click(within(bar).getByRole('button', { name: /Show notes/ }));
    expect(screen.getByText('Your turn').closest('aside')?.hidden).toBe(false);
    expect(screen.getByText('Step 2 of 4: Design Head checks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByText('Start here')).toBeTruthy();
  });

  it('lets the Design Head add a note, ask for changes and approve, with the same calls as today', async () => {
    org('Design Head', 'Head');
    h.versions = [v1];
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Check this drawing' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }));
    /* The pages wait a moment to learn which way the drawing reads; the note box comes with them. */
    fireEvent.change(await screen.findByPlaceholderText('What should change here?', {}, { timeout: 4000 }), { target: { value: 'Shutter 450 wide' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add the note' })); });
    expect(h.mark).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', drawingId: 'a' }, 0, { t: 'pin', x: 0.5, y: 0.45 }, 'Shutter 450 wide', false);
    /* Sending back with no notes on the sheet needs a line. */
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send back to Kabir' })); });
    expect(h.ret).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/A line for Kabir/), { target: { value: 'Redo the loft' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send back to Kabir' })); });
    expect(h.ret).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', drawingId: 'a' }, 7, 'Redo the loft');
    /* The next drawing waiting opens by itself; approve that one. */
    expect(screen.getByRole('heading', { name: 'Kitchen Elevation A' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve v1' })); });
    expect(h.approve).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', drawingId: 'b' }, 7);
  });

  it('blocks approval while a must-fix note is open', () => {
    org('Design Head', 'Head');
    h.versions = [v1];
    h.marks = [{ id: 'm1', versionId: 'v1', n: 1, page: 0, shape: { t: 'pin', x: 0.2, y: 0.2 }, text: 'Oven will not fit', blocking: true, status: 'OPEN', by: person('Head'), at: NOW, updatedAt: NOW }];
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Check this drawing' })[0]);
    expect(screen.getByText(/1 must-fix note is open/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Approve v1' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("gives a designer a sent-back drawing with its notes to tick and the upload button", () => {
    org('Designer', 'Riya');
    h.versions = [{ ...v1, by: person('Riya') }];
    h.marks = [{ id: 'm1', versionId: 'v1', n: 1, page: 0, shape: { t: 'pin', x: 0.2, y: 0.2 }, text: 'Deck level 150 below', blocking: false, status: 'OPEN', by: person('Head'), at: NOW, updatedAt: NOW }];
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Fix and upload again' })[0]);
    expect(screen.getByRole('heading', { name: 'Pool Deck Plan' })).toBeTruthy();
    expect(screen.getByText('0 of 1 fixed')).toBeTruthy();
    expect(screen.getByLabelText('Mark fixed')).toBeTruthy();
    /* A designer never gets the marking tools or the decision. */
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upload the fixed drawing' }));
    expect(screen.getByRole('dialog', { name: 'Upload Pool Deck Plan' })).toBeTruthy();
  });

  it('uploads a drawing in three steps: choose, check, send', async () => {
    org('Designer', 'Riya');
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: /Mehta residence/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kitchen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload the drawing' }));
    const dialog = screen.getByRole('dialog', { name: 'Upload Kitchen Plan' });
    expect(within(dialog).getByText(/step 1 of 3/)).toBeTruthy();
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    /* A CAD file is turned away in words, and nothing moves on. */
    fireEvent.change(input, { target: { files: [new File(['x'], 'kitchen plan.dwg')] } });
    expect(within(dialog).getByRole('alert').textContent).toMatch(/CAD file/);
    /* A PDF named after another drawing of the project is flagged, not refused. */
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'Foyer Ceiling Plan.pdf', { type: 'application/pdf' })] } }); });
    expect(within(dialog).getByText(/step 2 of 3/)).toBeTruthy();
    expect(within(dialog).getByText('Foyer Ceiling Plan')).toBeTruthy();
    expect(within(dialog).getByText(/a different drawing/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, this is it' }));
    expect(within(dialog).getByText(/step 3 of 3/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/A note for the Design Head/), { target: { value: 'First issue' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Send to the Design Head' })); });
    expect(h.upload).toHaveBeenCalledTimes(1);
    const [target, uid, file, opts] = h.upload.mock.calls[0];
    expect(target).toEqual({ orgId: 's', projectId: 'p1', drawingId: 'd' });
    expect(uid).toBe('riya');
    expect(file.name).toBe('Foyer Ceiling Plan.pdf');
    expect(opts.submit).toBe(true);
    expect(opts.note).toBe('First issue');
    expect(screen.queryByRole('dialog', { name: 'Upload Kitchen Plan' })).toBeNull();
  });

  it("shows a room's messages beside its drawings, and sends one", async () => {
    org('Designer', 'Riya');
    h.talk = [
      { id: 'm1', tenantId: 's', projectId: 'p1', room: 'Kitchen', text: 'Hob moves 300 left', at: NOW - 60_000, by: person('Head') },
      { id: 'm2', tenantId: 's', projectId: 'p1', room: 'Foyer', text: 'Ceiling at 2700', at: NOW, by: person('Head') },
    ];
    render(<DeskTwo projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: /Mehta residence/ }));
    /* The room card counts its messages. */
    expect(screen.getAllByText('1 message').length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /Kitchen/ }));
    const thread = screen.getByRole('region', { name: 'Messages for Kitchen' });
    expect(within(thread).getByText('Hob moves 300 left')).toBeTruthy();
    expect(within(thread).queryByText('Ceiling at 2700')).toBeNull();
    fireEvent.change(within(thread).getByLabelText('Write a message for Kitchen'), { target: { value: 'Done in v4' } });
    await act(async () => { fireEvent.click(within(thread).getByRole('button', { name: 'Send the message' })); });
    expect(h.post).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', room: 'Kitchen', text: 'Done in v4', by: { uid: 'riya', email: 'riya@studio.in', name: 'Riya' } });
  });
});
