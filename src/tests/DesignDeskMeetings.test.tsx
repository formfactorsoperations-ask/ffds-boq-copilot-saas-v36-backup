import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import type { DesignMeeting } from '../../lib/designMeeting';

/*
  Design Desk 2.0, Phase 2 on screen: the Meetings page (three steps, record
  outside, waiting for the client) and the meeting screen (rooms, a change
  with its cost and the round warning, the minutes, bill or waive, "Meeting
  saved" with the approval email). The designMeeting function is stubbed; the
  calls must be the ones today's meeting makes.
*/

const h = vi.hoisted(() => ({ start: null as any, decide: null as any, close: null as any, cancel: null as any, outside: null as any, approvable: [] as any[], charge: null as any, upright: false }));

vi.mock('../../services/designMeetingService', () => ({
  startMeeting: (...a: any[]) => h.start(...a),
  decideRoom: (...a: any[]) => h.decide(...a),
  closeMeeting: (...a: any[]) => h.close(...a),
  cancelMeeting: (...a: any[]) => h.cancel(...a),
  updateCharge: (...a: any[]) => h.charge(...a),
  watchLayoutSetup: (_o: string, _p: string, cb: (s: any) => void) => { cb(null); return () => undefined; },
  listApprovable: async () => ({ projectName: 'Mehta Residence', drawings: h.approvable }),
  recordPresentedOutside: (...a: any[]) => h.outside(...a),
  saveLayoutRooms: vi.fn(), signMeeting: vi.fn(), setPresenters: vi.fn(), sendApproval: vi.fn(), recordApproval: vi.fn(),
}));
vi.mock('../../services/drawingReviewService', () => ({ fileUrl: () => Promise.reject(new Error('no files in tests')), fileBlob: () => Promise.reject(new Error('no files in tests')) }));
vi.mock('../../lib/pdfRender', () => ({ loadPdf: vi.fn(() => Promise.resolve({ numPages: 1, getPage: async () => ({ getViewport: () => (h.upright ? { width: 700, height: 1000 } : { width: 1000, height: 700 }) }) })), renderPage: vi.fn(), isCancelled: () => false, thumbnailOf: vi.fn(), pageCountOf: vi.fn() }));
vi.mock('../../lib/pdfLandscape', () => ({ landscapePdf: vi.fn() }));
/* The drawing itself: a stand-in that pins a change where it is told to. */
vi.mock('../../components/drawingReview/PdfStage', () => ({
  default: (p: any) => <div><button type="button" data-testid="drawing" data-pins={p.marks.length} data-zoom={p.zoom} data-turn={p.turn} disabled={!p.canMark} onClick={() => p.onShape?.({ t: 'pin', x: 0.5, y: 0.4 })}>the drawing</button>{p.overlay}</div>,
}));
vi.mock('../../components/drawingReview/ClientApproval', () => ({
  default: (p: any) => <div data-testid="approval" data-open={p.startOpen ? 'yes' : 'no'}>approval for {p.m.id}</div>,
  ApprovalChip: () => null,
}));
vi.mock('../../components/drawingReview/LayoutPlan', () => ({ LayoutPanel: (p: any) => <div data-testid={p.compact ? 'plan-small' : 'plan'} data-turn={p.turn} data-zoom={p.zoom}>plan</div>, LayoutRooms: () => null }));
vi.mock('../../components/drawingReview/DeskParts', () => ({ ProjectMark: () => null, SheetThumb: () => null }));

import MeetingsPage from '../../components/designDesk2/MeetingsPage';
import MeetingScreen from '../../components/designDesk2/MeetingScreen';

const NOW = Date.now();
const head = { uid: 'head', email: 'anish@studio.in', name: 'Anish' };
const drawing = (id: string, name: string, room: string, state: string, extra: any = {}) => ({
  id, orgId: 's', projectId: 'p1', name, roomName: room,
  review: { schema: 1, state, audience: 'client', versionId: 'v1', versionNo: extra.v || 1, pdfPath: 'x.pdf', thumbPath: null, presenters: extra.presenters || [], designer: head, rev: 1 },
}) as any;
const drawings = [
  drawing('l1', 'Living false ceiling', 'Living & dining', 'APPROVED'),
  drawing('m1', 'Master bed back', 'Master bedroom', 'APPROVED', { v: 2, presenters: ['priya@studio.in'] }),
  drawing('k2', 'Kitchen elevation A', 'Kitchen', 'IN_REVIEW'),
];
const sh = (id: string, name: string, v = 1) => ({ drawingId: id, name, versionId: 'v1', versionNo: v, pdfPath: 'x.pdf', thumbPath: null, pageCount: 1 });
const room = (name: string, sheets: any[], over: any = {}) => ({ room: name, sheets, outcome: null, changes: [], round: 0, charge: null, ...over });
const meeting = (over: Partial<DesignMeeting> = {}): DesignMeeting => ({
  id: 'm9', orgId: 's', projectId: 'p1', projectName: 'Mehta Residence', state: 'OPEN', rev: 1, attendees: 'Mrs Mehta', includedRounds: 2,
  startedAt: NOW - 60_000, startedBy: head, closedAt: null, closedBy: null,
  rooms: [room('Living & dining', [sh('l1', 'Living false ceiling')]), room('Master bedroom', [sh('m1', 'Master bed back', 2)])],
  ...over,
});
/* Two earlier meetings where the client asked for changes in Living & dining: its two included rounds are used. */
const past: DesignMeeting[] = [1, 2].map((n) => meeting({ id: `old${n}`, state: 'CLOSED', closedAt: NOW - n * 86_400_000,
  rooms: [room('Living & dining', [sh('l1', 'Living false ceiling')], { outcome: 'changes', round: n, changes: [{ n: 1, drawingId: 'l1', page: 0, shape: { t: 'pin', x: 0.1, y: 0.1 }, text: 'Earlier change' }] })] }));

const page = (over: any = {}) => (
  <MeetingsPage orgId="s" projectId="p1" projectName="Mehta Residence" drawings={drawings} meetings={past} canRun canBill presenter={false} me={head} designers={[]}
    onResume={vi.fn()} projects={[{ id: 'p1', name: 'Mehta Residence', code: 'MR', color: '#000' }]} onPickProject={vi.fn()} {...over} />
);
const screenOf = (m: DesignMeeting, over: any = {}) => (
  <MeetingScreen orgId="s" projectId="p1" projectName="Mehta Residence" look={{ code: 'MR', color: '#000', soft: '#eee' }} meeting={m} meetings={[...past, m]} lead me={head} onExit={vi.fn()} {...over} />
);
/* Saves a room's decision the way the function answers: the meeting, one revision on. */
const answer = (m: DesignMeeting) => vi.fn(async (_t: any, _id: string, name: string, outcome: any, changes: any[] = []) => {
  m = { ...m, rev: m.rev + 1, rooms: m.rooms.map((r) => (r.room === name ? { ...r, outcome, changes } : r)) };
  return m;
});

beforeEach(() => {
  cleanup();
  localStorage.clear();
  h.start = vi.fn(async () => meeting());
  h.cancel = vi.fn(async () => null);
  h.outside = vi.fn(async () => ({}));
  h.charge = vi.fn(async () => null);
  h.approvable = [{ drawingId: 'l1', name: 'Living false ceiling', room: 'Living & dining', versionNo: 1 }];
  h.upright = false;
});

describe('the Meetings page', () => {
  it('starts a meeting in three steps: rooms, who is attending, how the client sees it', async () => {
    const onResume = vi.fn();
    render(page({ onResume }));
    /* Ready rooms are ticked, with the rounds each has used; a room still with the Design Head cannot be shown. */
    expect((screen.getByLabelText('Show Living & dining') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('2 of 2 included rounds used')).toBeTruthy();
    expect(screen.getByText('0 of 2 included rounds used')).toBeTruthy();
    expect((screen.getByLabelText('Show Kitchen') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Not ready yet')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Show Master bedroom'));
    fireEvent.change(screen.getByLabelText('Who is attending'), { target: { value: 'Mrs Mehta' } });
    fireEvent.click(screen.getByRole('radio', { name: /Sitting with you/ }));
    expect(screen.getByRole('radio', { name: /Sitting with you/ }).getAttribute('aria-checked')).toBe('true');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start the meeting' })); });
    expect(h.start).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1' }, ['Living & dining'], 'Mrs Mehta', null);
    expect(onResume).toHaveBeenCalled();
    /* The choice is remembered for the meeting screen and the next meeting. */
    expect(localStorage.getItem('ffds_dd2_meet_way')).toBe('room');
  });

  it('lists the projects with what each has ready to show, the ready ones first', () => {
    const onPickProject = vi.fn();
    render(page({ projectId: null, onPickProject, projects: [
      { id: 'p3', name: 'Shah Apartment', code: 'SA', color: '#000', ready: [] },
      { id: 'p2', name: 'Kapoor Villa', code: 'KV', color: '#000', ready: ['Kitchen'] },
      { id: 'p1', name: 'Mehta Residence', code: 'MR', color: '#000', ready: ['Living & dining', 'Master bedroom', 'General / Project-Wide'] },
    ] }));
    expect(screen.getByRole('heading', { name: 'Ready to show a client' })).toBeTruthy();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    /* Most rooms ready first, with the rooms named; the project with nothing ready sits apart, below. */
    expect(buttons[0]).toBe('Mehta ResidenceLiving & dining, Master bedroom, Whole home3 rooms ready');
    expect(buttons[1]).toBe('Kapoor VillaKitchen1 room ready');
    expect(screen.getByRole('heading', { name: 'Nothing ready yet' })).toBeTruthy();
    expect(buttons[2]).toBe('Shah Apartment');
    fireEvent.click(screen.getByRole('button', { name: /Kapoor Villa/ }));
    expect(onPickProject).toHaveBeenCalledWith('p2');
  });

  it('says so when no project has a room ready', () => {
    render(page({ projectId: null, projects: [{ id: 'p3', name: 'Shah Apartment', code: 'SA', color: '#000', ready: [] }] }));
    expect(screen.getByText(/No project has a room ready yet\. A room is ready once the Design Head has approved a drawing in it that is for the client\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shah Apartment' })).toBeTruthy();
  });

  it('offers to resume a meeting left open, and starts no second one', () => {
    const onResume = vi.fn();
    const open = meeting({ rooms: [room('Living & dining', [sh('l1', 'Living false ceiling')], { outcome: 'agreed' }), room('Master bedroom', [sh('m1', 'Master bed back', 2)])] });
    render(page({ meetings: [...past, open], onResume }));
    expect(screen.getByText('Your meeting with Mrs Mehta is still open')).toBeTruthy();
    expect(screen.getByText(/1 of 2 rooms done/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start the meeting' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume the meeting' }));
    expect(onResume).toHaveBeenCalledWith(open);
  });

  it('records drawings shown outside the desk', async () => {
    render(page());
    fireEvent.click(screen.getByRole('button', { name: 'Record it' }));
    const box = screen.getByRole('dialog', { name: 'Record drawings shown outside the desk' });
    fireEvent.click(await within(box).findByLabelText(/Living false ceiling/));
    fireEvent.change(within(box).getByLabelText('How did you show them?'), { target: { value: 'On WhatsApp' } });
    await act(async () => { fireEvent.click(within(box).getByRole('button', { name: 'Save the record' })); });
    expect(h.outside).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1' }, ['l1'], 'Shown on WhatsApp', expect.any(Number));
  });

  it('lists the meetings waiting for the client, and the rounds to bill only for those who bill', () => {
    const who = { status: 'to_bill', fee: null, note: null, ref: null, decidedBy: head, decidedAt: NOW, updatedBy: head, updatedAt: NOW };
    const held = meeting({ id: 'held', state: 'CLOSED', closedAt: NOW - 3_600_000, approval: { status: 'awaiting', sentAt: null, sentBy: null, sentTo: [], driveLink: null, dueAt: null, reminders: [], answeredAt: null, via: null, note: null, recordedBy: null, recordedAt: null },
      rooms: [room('Master bedroom', [sh('m1', 'Master bed back', 2)], { outcome: 'agreed' }), room('Living & dining', [sh('l1', 'Living false ceiling')], { outcome: 'changes', round: 3, charge: who, changes: [{ n: 1, drawingId: 'l1', page: 0, shape: { t: 'pin', x: 0.1, y: 0.1 }, text: 'Warmer light' }] })] });
    const { unmount } = render(page({ meetings: [held, ...past] }));
    expect(screen.getByTestId('approval').textContent).toBe('approval for held');
    expect(screen.getByText('Revision rounds to bill')).toBeTruthy();
    expect(screen.getByText('Living & dining · round 3 of 2 included')).toBeTruthy();
    unmount();
    /* A Designer who presents sees neither the fees nor the list to bill. */
    render(page({ meetings: [held, ...past], canRun: false, canBill: false, presenter: true, me: { uid: 'priya', email: 'priya@studio.in', name: 'Priya' } }));
    expect(screen.queryByText('Revision rounds to bill')).toBeNull();
    expect((screen.getByLabelText('Show Master bedroom') as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText(/The Design Head has not given you a drawing here to present/)).toBeTruthy();
  });
});

describe('the meeting screen', () => {
  it('pins a change with its cost, warns before a chargeable round, and writes the minutes', async () => {
    const m = meeting();
    h.decide = answer(m);
    render(screenOf(m));
    /* The round counter is on screen for the room being shown. */
    expect(screen.getByText('Living & dining: 2 of 2 included rounds used')).toBeTruthy();
    const minutes = screen.getByRole('list', { name: 'Minutes' });
    expect(within(minutes).getByText(/Meeting started with Mrs Mehta/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a change' }));
    fireEvent.click(await screen.findByTestId('drawing'));
    fireEvent.change(screen.getByLabelText('What does the client want changed here?'), { target: { value: 'Cove light on a dimmer' } });
    expect(screen.getByRole('alert').textContent).toMatch(/This starts revision round 3 for Living & dining.*You choose to bill or waive it when you finish/);
    fireEvent.click(screen.getByRole('radio', { name: 'Costs more' }));
    fireEvent.change(screen.getByLabelText('About how many rupees'), { target: { value: '6500' } });
    fireEvent.change(screen.getByLabelText('What on the BOQ it touches'), { target: { value: 'dimmer driver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add the change' }));
    /* The change is listed with its estimate, and the minutes already have it. */
    expect(screen.getByText('About +₹6,500 on the BOQ (dimmer driver)')).toBeTruthy();
    expect(within(minutes).getByText('Living & dining, change 1 on Living false ceiling: Cove light on a dimmer')).toBeTruthy();
    expect(within(minutes).getByText(/revision round 3 started/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Done: 1 change for this room' })); });
    expect(h.decide).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1' }, 'm9', 'Living & dining', 'changes',
      [{ n: 1, drawingId: 'l1', page: 0, shape: { t: 'pin', x: 0.5, y: 0.4 }, text: 'Cove light on a dimmer', cost: { kind: 'more', amount: 6500, note: 'dimmer driver' } }]);
  });

  it('finishes with bill or waive, saves, and shows the minutes and the drafted approval email', async () => {
    const m = meeting({ rooms: [
      room('Living & dining', [sh('l1', 'Living false ceiling')], { outcome: 'changes', changes: [{ n: 1, drawingId: 'l1', page: 0, shape: { t: 'pin', x: 0.5, y: 0.4 }, text: 'Cove light on a dimmer' }] }),
      room('Master bedroom', [sh('m1', 'Master bed back', 2)], { outcome: 'agreed' }),
    ] });
    const saved = { ...m, state: 'CLOSED' as const, closedAt: NOW, rev: 5, approval: { status: 'awaiting' as const, sentAt: null, sentBy: null, sentTo: [], driveLink: null, dueAt: null, reminders: [], answeredAt: null, via: null, note: null, recordedBy: null, recordedAt: null } };
    h.close = vi.fn(async () => saved);
    render(screenOf(m));
    fireEvent.click(screen.getByRole('button', { name: 'Finish the meeting' }));
    expect(screen.getByRole('heading', { name: 'Finish the meeting' })).toBeTruthy();
    /* Round 3 of 2: it cannot be saved until it is billed or waived. */
    expect((screen.getByRole('button', { name: 'Save the meeting' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Waive it this time' }));
    expect(screen.getByText('Living & dining: round 3 is waived this time.')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save the meeting' })); });
    expect(h.close).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1' }, 'm9', 1, { 'Living & dining': 'waived' });
    expect(screen.getByRole('heading', { name: 'Meeting saved' })).toBeTruthy();
    expect(screen.getByText("Meeting saved. 1 room waits for the client's approval in writing.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy the minutes' })).toBeTruthy();
    /* The approval email opens already drafted. */
    expect(screen.getByTestId('approval').getAttribute('data-open')).toBe('yes');
    expect(screen.getByRole('button', { name: 'Client signs now' })).toBeTruthy();
  });

  it('can be finished and saved when the client has not decided on any room', async () => {
    const m = meeting();
    h.close = vi.fn(async () => ({ ...m, state: 'CLOSED', closedAt: NOW, rev: 2, approval: null }));
    render(screenOf(m));
    /* Finish is not held back until a room is marked happy or given a change. */
    const finish = screen.getByRole('button', { name: 'Finish the meeting' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(false);
    fireEvent.click(finish);
    expect(screen.getByText(/The client did not decide on any room\. You can still save the meeting/)).toBeTruthy();
    expect(screen.getAllByText('No decision')).toHaveLength(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save the meeting' })); });
    expect(h.close).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1' }, 'm9', 1, {});
    expect(screen.getByRole('heading', { name: 'Meeting saved' })).toBeTruthy();
    expect(screen.getByText('Meeting saved with no room decided.')).toBeTruthy();
    /* Nothing was agreed, so there is no approval to ask for and nothing to sign. */
    expect(screen.queryByTestId('approval')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Client signs now' })).toBeNull();
  });

  it('shows a Designer the round warning but no cost, no fees and no billing choice', async () => {
    const m = meeting();
    h.decide = answer(m);
    h.close = vi.fn(async () => ({ ...m, state: 'CLOSED', closedAt: NOW }));
    render(screenOf(m, { lead: false, me: { uid: 'priya', email: 'priya@studio.in', name: 'Priya' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a change' }));
    fireEvent.click(await screen.findByTestId('drawing'));
    fireEvent.change(screen.getByLabelText('What does the client want changed here?'), { target: { value: 'Warmer light' } });
    expect(screen.getByRole('alert').textContent).toMatch(/The Design Head decides whether to bill it/);
    expect(screen.queryByText(/What does it do to the BOQ/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add the change' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Done: 1 change for this room' })); });
    expect(h.decide.mock.calls[0][4][0].cost).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Finish the meeting' }));
    expect(screen.queryByRole('radio', { name: 'Bill this round' })).toBeNull();
    expect(screen.getByText(/It waits for the Design Head to bill or waive it/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save the meeting' })); });
    expect(h.close).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1' }, 'm9', 2, {});
  });

  it('zooms with Ctrl + scroll from anywhere on the viewer, in whichever room is open', async () => {
    render(screenOf(meeting()));
    const viewer = (await screen.findByTestId('drawing')).closest('section')!;
    const zoom = () => screen.getByTitle('Fit the drawing (0)').textContent;
    expect(zoom()).toBe('100%');
    /* Plain scrolling moves the page; it does not zoom. */
    fireEvent.wheel(viewer, { deltaY: -100 });
    expect(zoom()).toBe('100%');
    fireEvent.wheel(viewer, { deltaY: -100, ctrlKey: true });
    expect(zoom()).toBe('115%');
    /* The second room: the viewer is the same one, so the scroll still zooms. */
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Rooms to show' })).getByRole('button', { name: /Master bedroom/ }));
    fireEvent.wheel(await screen.findByTestId('drawing'), { deltaY: 100, ctrlKey: true });
    expect(zoom()).toBe('100%');
    fireEvent.wheel(screen.getByRole('toolbar', { name: 'Drawing controls' }), { deltaY: -100, ctrlKey: true });
    expect(zoom()).toBe('115%');
    expect(screen.getByTestId('drawing').getAttribute('data-zoom')).toBe('1.15');
  });

  it('lets the drawing be dragged to move around, but not while a change is being placed', async () => {
    render(screenOf(meeting()));
    const stage = (await screen.findByTestId('drawing')).parentElement!.parentElement!.parentElement as HTMLElement;
    expect(stage.style.cursor).toBe('grab');
    /* Press and pull: the view moves the way the hand does. */
    fireEvent.pointerDown(stage, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(stage, { pointerId: 1, pointerType: 'mouse', clientX: 398, clientY: 299 });
    expect(stage.style.cursor).toBe('grab');
    fireEvent.pointerMove(stage, { pointerId: 1, pointerType: 'mouse', clientX: 340, clientY: 260 });
    expect(stage.style.cursor).toBe('grabbing');
    expect([stage.scrollLeft, stage.scrollTop]).toEqual([60, 40]);
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: 'mouse' });
    expect(stage.style.cursor).toBe('grab');
    /* With Add a change on, a press on the drawing places the pin instead. */
    fireEvent.click(screen.getByRole('button', { name: 'Add a change' }));
    expect(stage.style.cursor).toBe('');
    fireEvent.pointerDown(stage, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(stage, { pointerId: 2, pointerType: 'mouse', clientX: 300, clientY: 200 });
    expect([stage.scrollLeft, stage.scrollTop]).toEqual([60, 40]);
  });

  it('shows a layout plan stored upright in landscape, and lets it be turned and zoomed', async () => {
    h.upright = true;
    const layout = { drawingId: 'a1', name: 'Layout plan', versionId: 'v1', versionNo: 4, pdfPath: 'plan.pdf', pageCount: 1, rooms: {} };
    render(screenOf(meeting({ layout })));
    /* Beside the drawing and on its own tab, the plan is turned to read landscape. */
    expect((await screen.findByTestId('plan-small')).getAttribute('data-turn')).toBe('270');
    fireEvent.click(screen.getByRole('button', { name: 'Layout plan' }));
    const plan = await screen.findByTestId('plan');
    expect(plan.getAttribute('data-turn')).toBe('270');
    fireEvent.wheel(plan, { deltaY: -100, ctrlKey: true });
    expect(screen.getByTestId('plan').getAttribute('data-zoom')).toBe('1.15');
    /* The rotate button turns the plan, not the drawing, and the choice is remembered. */
    fireEvent.click(screen.getByRole('button', { name: 'Rotate the layout plan' }));
    expect(screen.getByTestId('plan').getAttribute('data-turn')).toBe('0');
    expect(localStorage.getItem('ffds_dr_turn_p1_a1')).toBe('0');
    expect(localStorage.getItem('ffds_dr_turn_p1_l1')).toBeNull();
  });

  it('puts a living pin on each change, and marks a decided room with a tick or its count', async () => {
    const m = meeting();
    h.decide = answer(m);
    render(screenOf(m));
    fireEvent.click(screen.getByRole('button', { name: 'Add a change' }));
    fireEvent.click(await screen.findByTestId('drawing'));
    fireEvent.change(screen.getByLabelText('What does the client want changed here?'), { target: { value: 'Warmer cove light' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add the change' }));
    /* The pin opens the client's words beside it, and lights the change in the list. */
    const pin = screen.getByRole('button', { name: 'Change 1: Warmer cove light' });
    expect(pin.className).toContain('is-off');
    fireEvent.click(screen.getByRole('button', { name: 'Stop adding' }));
    expect(pin.className).not.toContain('is-off');
    fireEvent.mouseEnter(pin);
    expect(within(screen.getByRole('tooltip')).getByText('Warmer cove light')).toBeTruthy();
    expect(document.querySelector('.dd2-note.is-hot')).toBeTruthy();
    fireEvent.mouseLeave(pin);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Done: 1 change for this room' })); });
    expect(screen.getByRole('status', { name: '1 change noted' })).toBeTruthy();
  });

  it('lets a decided room be reopened, and leaves the meeting open when left', async () => {
    const m = meeting({ rooms: [room('Living & dining', [sh('l1', 'Living false ceiling')], { outcome: 'agreed' }), room('Master bedroom', [sh('m1', 'Master bed back', 2)])] });
    h.decide = answer(m);
    const onExit = vi.fn();
    render(screenOf(m, { onExit }));
    /* It opens on the first room still to decide. */
    expect(screen.getByText('Master bedroom: what does the client say?')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Rooms to show' })).getByRole('button', { name: /Living & dining/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reopen this room' })); });
    expect(h.decide).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1' }, 'm9', 'Living & dining', null);
    fireEvent.click(screen.getByRole('button', { name: 'Leave for now' }));
    expect(onExit).toHaveBeenCalledWith();
  });
});
