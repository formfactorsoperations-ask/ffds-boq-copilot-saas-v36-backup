/*
  WHAT THE CLIENTS COMPOSER WRITES (DESIGN.md "Clients: conversations").

  The thread's only write path is the Ops Desk follow-up log
  (projects/{id}/followUps, lib/opsDesk; owner's decision D2), so a message
  sent from Clients is a reminder on the Ops Desk too, and the other way round.

    - Open in WhatsApp: a WhatsApp line, "reminded", with the message as sent
      and its template as the subject. The milestone template, while an
      invoice is out, takes that payment's own subject (pay:{milestoneId}), so
      the Ops Desk counts it as a reminder for that payment.
    - Log their reply: "No answer" is no_answer; anything else is replied, with
      the mood written as lib/clientCare moodOf reads it ("… Mood: Positive.").
    - Add a note: a line from the team, "info".
    - The old notes kept in this browser (localStorage "ffds_client_notes")
      move once, when someone asks, each under an id made from the note, so a
      second move cannot write it twice (the rules refuse to change a line).

  Pure, so the tests run it.
*/
import type { Channel, Outcome, Subject } from './opsDesk';
import { paymentKey } from './opsDesk';
import type { ClientMilestone } from './clientMoney';
import type { TemplateId } from './clientNextMove';

export const NOTE_MAX = 2000;

export type ReplyMood = 'positive' | 'call' | 'changes' | 'none';
export const REPLY_MOODS: { id: ReplyMood; label: string }[] = [
  { id: 'positive', label: 'Positive' },
  { id: 'call', label: 'Needs a call' },
  { id: 'changes', label: 'Wants changes' },
  { id: 'none', label: 'No answer' },
];

export type ReplyFrom = 'whatsapp' | 'call' | 'email' | 'meeting';
export const REPLY_FROM: { id: ReplyFrom; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'call', label: 'Call' },
  { id: 'email', label: 'Email' },
  { id: 'meeting', label: 'Meeting' },
];

export interface FollowUpLine {
  channel: Channel;
  outcome: Outcome;
  note: string;
  subject: Subject | null;
}

const clean = (s: string) => String(s || '').replace(/\s+$/g, '').trim();

/** The subject a message goes out under: its template, or the outstanding payment for the milestone template. */
export function sendSubject(template: { id: TemplateId; title: string }, milestones: ClientMilestone[]): Subject {
  if (template.id === 'milestone') {
    const m = milestones.find((x) => x.status === 'invoiced' && !x.disputed);
    if (m) return { kind: 'payment', key: paymentKey(m.id), label: m.invoiceNumber ? `${m.name} (${m.invoiceNumber})` : m.name };
  }
  return { kind: 'general', key: `tpl:${template.id}`, label: template.title };
}

/** Open in WhatsApp, as a follow-up line. */
export function sentLine(text: string, subject: Subject): FollowUpLine {
  return { channel: 'whatsapp', outcome: 'reminded', note: clean(text).slice(0, NOTE_MAX), subject };
}

/** Their reply, as a follow-up line: the mood in the words moodOf reads. */
export function replyLine(mood: ReplyMood, said: string, from: ReplyFrom): FollowUpLine {
  const words = clean(said).replace(/\s*Mood:.*$/i, '');
  if (mood === 'none') return { channel: from, outcome: 'no_answer', note: (words || 'No answer').slice(0, NOTE_MAX), subject: null };
  const label = REPLY_MOODS.find((m) => m.id === mood)!.label;
  const tail = ` Mood: ${label}.`;
  const body = words || `Replied: ${label.toLowerCase()}.`;
  return { channel: from, outcome: 'replied', note: `${body.slice(0, NOTE_MAX - tail.length)}${tail}`, subject: null };
}

/** A note from the team. */
export function noteLine(text: string): FollowUpLine {
  return { channel: 'other', outcome: 'info', note: clean(text).slice(0, NOTE_MAX), subject: null };
}

/** A short, stable id for a client key, fit for a document id. */
export function keyHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export interface OldNote { id: string; text: string; createdAt: number; author: string }

/** The browser's old notes as follow-up lines, each with an id of its own and the day it was written. */
export function movedNotes(clientKey: string, notes: OldNote[]): Array<FollowUpLine & { id: string; at: number }> {
  return notes
    .filter((n) => n && clean(n.text))
    .map((n) => ({
      id: `note-${keyHash(clientKey)}-${String(n.id).replace(/[^A-Za-z0-9_-]/g, '')}`,
      at: Number(n.createdAt) > 0 ? Number(n.createdAt) : Date.now(),
      ...noteLine(`${clean(n.text)} (note by ${n.author || 'the team'}, moved from a browser)`),
    }));
}
