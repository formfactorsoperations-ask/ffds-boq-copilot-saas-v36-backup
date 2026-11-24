import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { byDay, canUseRoomMessages, cleanMessage, countByRoom, dayLabel, roomThread, MAX_MESSAGE, type RoomMessage } from '../../lib/roomMessages';
import { resolveAudience, roomMessageDraft } from '../../lib/notify';

/*
  Room messages (lib/roomMessages.ts): who has them, what a message may be,
  how a thread is shown, who is told (lib/notify roomMessageDraft), and the
  thread on screen (components/roomMessages/RoomThread).
*/

const h = vi.hoisted(() => ({ post: null as any }));
vi.mock('../../services/roomMessageService', () => ({ postRoomMessage: (...a: any[]) => h.post(...a), watchProjectMessages: () => () => undefined }));

import RoomThread from '../../components/roomMessages/RoomThread';

const NOW = new Date(2026, 10, 24, 15, 0).getTime();
const msg = (id: string, room: string, at: number, by = 'Mayuri', text = `Note ${id}`): RoomMessage =>
  ({ id, tenantId: 's', projectId: 'p1', room, text, at, by: { uid: by.toLowerCase(), email: `${by.toLowerCase()}@studio.in`, name: by } });

describe('who has room messages', () => {
  it('is the design leads and the roles that work on assigned projects', () => {
    ['Design Head', 'Owner', 'Admin', 'Ops Director', 'Super Admin', 'Designer', 'Client Relations', 'Site Supervisor'].forEach((r) => expect(canUseRoomMessages(r)).toBe(true));
    ['Viewer', 'Vendor', 'Client', '', null].forEach((r) => expect(canUseRoomMessages(r as any)).toBe(false));
    expect(canUseRoomMessages(['Viewer', 'Design Head'])).toBe(true);
  });
});

describe('a message', () => {
  it('is trimmed, loses long runs of blank lines and stops at the limit', () => {
    expect(cleanMessage('  Hob moves 300 left  \r\n\r\n\r\n\r\nSee the pin \n')).toBe('Hob moves 300 left\n\nSee the pin');
    expect(cleanMessage('   ')).toBe('');
    expect(cleanMessage(null)).toBe('');
    expect(cleanMessage('x'.repeat(MAX_MESSAGE + 50))).toHaveLength(MAX_MESSAGE);
  });
});

describe('a thread', () => {
  const all = [msg('c', 'Kitchen', NOW - 60_000), msg('a', 'Kitchen', NOW - 2 * 86_400_000), msg('b', 'Kitchen', NOW - 86_400_000), msg('z', 'Foyer', NOW)];
  it('is one room, oldest first, and counts by room', () => {
    expect(roomThread(all, 'Kitchen').map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(countByRoom(all)).toEqual({ Kitchen: 3, Foyer: 1 });
  });
  it('is split into days with plain headings', () => {
    expect(dayLabel(NOW - 60_000, NOW)).toBe('Today');
    expect(dayLabel(NOW - 86_400_000, NOW)).toBe('Yesterday');
    expect(dayLabel(NOW - 2 * 86_400_000, NOW)).toMatch(/22/);
    const days = byDay(roomThread(all, 'Kitchen'), NOW);
    expect(days.map((d) => d.label).slice(1)).toEqual(['Yesterday', 'Today']);
    expect(days.map((d) => d.messages.length)).toEqual([1, 1, 1]);
  });
});

describe('who is told about a message', () => {
  const team = [
    { email: 'head@studio.in', role: 'Design Head' }, { email: 'owner@studio.in', role: 'Owner' }, { email: 'ops@studio.in', role: 'Ops Director' },
    { email: 'riya@studio.in', role: 'Designer' }, { email: 'kabir@studio.in', role: 'Designer' }, { email: 'cr@studio.in', role: 'Client Relations' },
    { email: 'site@studio.in', role: 'Site Supervisor' }, { email: 'viewer@studio.in', role: 'Viewer' }, { email: 'client@x.com', role: 'Client' },
  ];
  it('says who wrote, in which room, and opens the project\'s Drawings', () => {
    const d = roomMessageDraft({ projectId: 'p1', projectName: 'Harmony 704', room: 'Kitchen', text: 'Hob moves 300 left', actor: 'Riya' }, ['riya@studio.in'])!;
    expect(d.title).toBe('Riya wrote in Kitchen');
    expect(d.line).toBe('“Hob moves 300 left”');
    expect(d.route).toBe('drawing-tracker');
    expect(d.kind).toBe('design.roomMessage');
    expect(d.level).toBe('update');
    expect(roomMessageDraft({ projectId: 'p1', projectName: null, room: 'General / Project-Wide', text: 'x', actor: '' }, [])!.title).toBe('Someone wrote in Whole home');
    expect(roomMessageDraft({ projectId: 'p1', projectName: null, room: 'Kitchen', text: '   ', actor: 'Riya' }, [])).toBeNull();
  });
  it('reaches the leads and the people on the project, never the writer, another role or a client', () => {
    const d = roomMessageDraft({ projectId: 'p1', projectName: null, room: 'Kitchen', text: 'Hi', actor: 'Riya' }, ['Riya@studio.in', 'cr@studio.in', 'site@studio.in', 'client@x.com', 'gone@studio.in'])!;
    const to = resolveAudience(d.to, { team, actorEmail: 'riya@studio.in' }).sort();
    expect(to).toEqual(['cr@studio.in', 'head@studio.in', 'ops@studio.in', 'owner@studio.in', 'site@studio.in']);
  });
});

describe('the thread on screen', () => {
  const me = { uid: 'riya', email: 'riya@studio.in', name: 'Riya' };
  beforeEach(() => { cleanup(); h.post = vi.fn(async () => undefined); });
  const show = (messages: RoomMessage[] | null, error: string | null = null) =>
    render(<RoomThread orgId="s" projectId="p1" room="Kitchen" roomName="Kitchen" messages={messages} error={error} me={me} />);

  it('shows the room\'s messages by day, and "You" on your own', () => {
    show([msg('a', 'Kitchen', Date.now() - 86_400_000), msg('b', 'Kitchen', Date.now(), 'Riya', 'On it'), msg('z', 'Foyer', Date.now(), 'Kabir', 'Elsewhere')]);
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('On it')).toBeTruthy();
    expect(screen.queryByText('Elsewhere')).toBeNull();
  });
  it('sends what is written and clears the box', async () => {
    show([]);
    expect(screen.getByText(/No messages in this room yet/)).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send the message' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const box = screen.getByLabelText('Write a message for Kitchen') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '  Hob moves 300 left  ' } });
    await act(async () => { fireEvent.click(send); });
    expect(h.post).toHaveBeenCalledWith({ orgId: 's', projectId: 'p1', room: 'Kitchen', text: 'Hob moves 300 left', by: me });
    expect(box.value).toBe('');
  });
  it('says so when a message cannot be sent, and keeps the words', async () => {
    h.post = vi.fn(async () => { throw new Error('You cannot write in this room.'); });
    show([]);
    const box = screen.getByLabelText('Write a message for Kitchen') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Hello' } });
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true }); });
    expect(screen.getByRole('alert').textContent).toMatch(/cannot write in this room/);
    expect(box.value).toBe('Hello');
  });
  it('shows why instead of the box when the messages cannot be read', () => {
    show(null, 'Messages are for the design leads and the people assigned to this project.');
    expect(screen.getByText(/Messages are for the design leads/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send the message' })).toBeNull();
  });
});
