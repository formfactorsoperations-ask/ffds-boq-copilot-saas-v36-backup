import { costLine, isOverIncluded, plural, type DesignMeeting, type MeetingChange } from './designMeeting';

/*
  MINUTES THAT WRITE THEMSELVES (Design Desk 2.0, Phase 2).

  A design meeting's minutes are not typed: they are read off what was pressed.
  The meeting already records who attended, each room's outcome, every change
  pinned on a drawing and the billing choice for a round past the included
  ones (lib/designMeeting.ts), so a line per fact is the minutes. Nothing new
  is stored: the same meeting always reads as the same minutes, during the
  meeting, on the "Meeting saved" page and a year later.

  A line marked `studio` is for the studio only (revision rounds, billing and
  what a change costs on the BOQ). The text that is copied or handed to the
  client leaves those out.
*/

export type MinuteKind = 'start' | 'happy' | 'change' | 'sent' | 'round' | 'bill' | 'waive' | 'open' | 'saved' | 'signed';

export interface MinuteLine {
  kind: MinuteKind;
  text: string;
  room?: string;
  /** Rounds, billing and costs: shown to the studio, left out of what the client is given. */
  studio?: boolean;
}

/** How the client is seeing the drawings, as chosen before the meeting started. */
export type MeetingWay = 'room' | 'call';
export const WAYS: Record<MeetingWay, { title: string; line: string }> = {
  room: { title: 'Sitting with you', line: 'Turn your screen to the client, or put the drawing on a TV with Full screen.' },
  call: { title: 'On Google Meet or Zoom', line: 'The desk opens a clean client window. You share that window in your call.' },
};

const label = (room: string) => (room === 'General / Project-Wide' ? 'Whole home' : room);

export interface MinutesInput {
  meeting: Pick<DesignMeeting, 'attendees' | 'rooms' | 'state' | 'includedRounds' | 'confirmation' | 'outside'>;
  /** Changes noted in a room that is still open, before its decision is saved. */
  live?: Record<string, MeetingChange[]>;
  /** Client revision rounds each room has already used in earlier meetings (lib/designMeeting clientRoundsByRoom). */
  used?: Record<string, number>;
  /** The billing choices made on the finishing page, before the meeting is saved. */
  charges?: Record<string, 'to_bill' | 'waived'>;
  way?: MeetingWay | null;
  /** The page is the end of the meeting: rooms nobody decided are written down as having no decision. */
  ending?: boolean;
}

/** The meeting as lines, in the order things happen: the start, then room by room, then the end. */
export function minutesOf({ meeting: m, live = {}, used = {}, charges = {}, way, ending }: MinutesInput): MinuteLine[] {
  const out: MinuteLine[] = [];
  const closed = m.state === 'CLOSED';
  out.push({ kind: 'start', text: `Meeting started${m.attendees ? ` with ${m.attendees}` : ''}.${way ? ` ${WAYS[way].title}.` : ''}` });

  m.rooms.forEach((r) => {
    const room = label(r.room);
    const sheet = (id: string) => r.sheets.find((s) => s.drawingId === id)?.name || 'the drawing';
    if (r.outcome === 'agreed') {
      out.push({ kind: 'happy', room: r.room, text: `${room}: the client is happy with ${r.sheets.map((s) => `${s.name} v${s.versionNo}`).join(', ')} as shown.` });
      return;
    }
    const changes = r.outcome === 'changes' ? r.changes : live[r.room] || [];
    changes.forEach((c) => {
      out.push({ kind: 'change', room: r.room, text: `${room}, change ${c.n} on ${sheet(c.drawingId)}: ${c.text}` });
      if (c.cost) out.push({ kind: 'change', room: r.room, studio: true, text: `Change ${c.n}: ${costLine(c.cost).replace(/^./, (x) => x.toLowerCase())}. An estimate, to confirm.` });
    });
    if (changes.length) {
      const round = r.outcome === 'changes' && r.round ? r.round : (used[r.room] || 0) + 1;
      if (isOverIncluded(round, m.includedRounds)) {
        out.push({ kind: 'round', room: r.room, studio: true, text: `${room}: revision round ${round} started. ${plural(m.includedRounds, 'round')} ${m.includedRounds === 1 ? 'is' : 'are'} included, so it can be charged.` });
        const choice = r.charge?.status || charges[r.room];
        if (choice === 'waived') out.push({ kind: 'waive', room: r.room, studio: true, text: `${room}: round ${round} is waived this time.` });
        else if (choice) out.push({ kind: 'bill', room: r.room, studio: true, text: `${room}: round ${round} goes on the list to bill.` });
      }
    }
    if (r.outcome === 'changes') {
      out.push({ kind: 'sent', room: r.room, text: `${room}: ${plural(r.changes.length, 'change')} to make. ${r.changes.length === 1 ? 'It goes' : 'They go'} to the Design Head, pinned on the drawing.` });
    } else if (ending || closed) {
      out.push({ kind: 'open', room: r.room, text: `${room}: no decision at this meeting. It can be shown again at the next one.` });
    }
  });

  if (closed) {
    const agreed = m.rooms.filter((r) => r.outcome === 'agreed').length;
    const none = !m.rooms.some((r) => r.outcome);
    out.push({ kind: 'saved', text: agreed ? `Meeting saved. ${plural(agreed, 'room')} ${agreed === 1 ? 'waits' : 'wait'} for the client's approval in writing.` : none ? 'Meeting saved with no room decided.' : 'Meeting saved.' });
    if (m.confirmation?.at) out.push({ kind: 'signed', text: `${m.confirmation.name} ${m.confirmation.via === 'portal' ? 'confirmed the record in the portal' : "signed the record on the studio's screen"}.` });
  }
  return out;
}

/** The minutes as plain text, to copy into an email or WhatsApp. Studio-only lines are left out unless asked for. */
export function minutesText(title: string, lines: MinuteLine[], withStudio = false): string {
  const body = lines.filter((l) => withStudio || !l.studio).map((l) => `- ${l.text}`);
  return [title, '', ...body].join('\n');
}

/** How long a meeting has run, as 07:42 or 1:07:42. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(x)}` : `${two(m)}:${two(x)}`;
}

/** "2 of 2 included rounds used", for a room, from the rounds used before this meeting. */
export function roundsLine(used: number, included: number): string {
  return used > included ? `${plural(used, 'round')} used, ${included} included` : `${used} of ${plural(included, 'included round')} used`;
}

/** True when the next change in this room starts a round past the included ones. */
export const nextRoundCharged = (used: number, included: number) => isOverIncluded(used + 1, included);
