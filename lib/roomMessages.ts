import { hasRole, type RoleSet } from './roles';

/*
  ROOM MESSAGES (Design Desk 2.0, Phase 1).

  A short thread per room of a project, for the people who work on its
  drawings. Who that is was decided by the owner on 24 Nov 2026:

    - the studio's leads on design: Design Head, Owner, Admin, Ops Director;
    - the Designers, Client Relations and Site Supervisors assigned to the
      project.

  A client never reads or writes them. The security rules decide
  (firestore.rules, projects/{projectId}/roomMessages); this file is the same
  list for the screens, the limits on a message, and how a thread is shown.
  A message is never edited or deleted.
*/

export interface MessagePerson { uid: string; email: string; name: string }

export interface RoomMessage {
  id: string;
  tenantId: string;
  projectId: string;
  /** The room's name as the drawings carry it; GENERAL_ROOM for the whole home. */
  room: string;
  text: string;
  by: MessagePerson;
  /** When it was written, in milliseconds. */
  at: number;
}

export const MAX_MESSAGE = 2000;
export const MAX_ROOM_NAME = 120;

/** The leads who read every project's messages; the security rules name the same four. */
export const MESSAGE_LEADS = ['Design Head', 'Owner', 'Admin', 'Ops Director', 'Super Admin'];
/** The roles that read the messages of the projects they are assigned to. */
export const MESSAGE_ASSIGNED = ['Designer', 'Client Relations', 'Site Supervisor'];

/** Whether this person's role can use room messages at all. For an assigned role, the rules also check the project. */
export const canUseRoomMessages = (role?: RoleSet) => hasRole(role, [...MESSAGE_LEADS, ...MESSAGE_ASSIGNED]);

/** A message as it is stored: trimmed, without long runs of blank lines, and no longer than the limit. */
export function cleanMessage(raw: unknown): string {
  return String(raw ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_MESSAGE);
}

/** The messages of one room, oldest first. */
export function roomThread(all: RoomMessage[], room: string): RoomMessage[] {
  return all.filter((m) => m.room === room).sort((a, b) => a.at - b.at);
}

/** How many messages each room has, for the room cards. */
export function countByRoom(all: RoomMessage[]): Record<string, number> {
  const out: Record<string, number> = {};
  all.forEach((m) => { out[m.room] = (out[m.room] || 0) + 1; });
  return out;
}

/** "Today", "Yesterday" or "Mon 23 Nov": the heading above a day's messages. */
export function dayLabel(at: number, now = Date.now()): string {
  const day = (t: number) => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** A thread split into days, each with its heading. */
export function byDay(thread: RoomMessage[], now = Date.now()): { label: string; messages: RoomMessage[] }[] {
  const out: { label: string; messages: RoomMessage[] }[] = [];
  thread.forEach((m) => {
    const label = dayLabel(m.at, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.messages.push(m); else out.push({ label, messages: [m] });
  });
  return out;
}
