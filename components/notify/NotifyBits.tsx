import React, { useId } from 'react';
import {
  AlarmClock, AlertTriangle, BadgeCheck, CalendarCheck, CalendarDays, Check, CircleHelp, Clock, DoorOpen, FileSignature,
  FileText, HardHat, IndianRupee, Layers, LogOut, MessageSquare, NotebookPen, Palette, PenTool, Sparkles, Undo2, UserPlus, Gavel,
} from '@/lib/lucide-shim';
import { foldedTitle, type Stored } from '../../lib/notify';
import { IconTile, type RingTone } from '../people/PeopleBits';
import './notifyStyles';

/* Shared pieces of the notification kit: what each kind of note looks like, the counts, one row. */

const KIND: Record<string, { icon: React.ComponentType<any>; tone: RingTone }> = {
  'client.message': { icon: MessageSquare, tone: 'brand' },
  'client.changes': { icon: Undo2, tone: 'warn' },
  'client.approved': { icon: BadgeCheck, tone: 'ok' },
  'client.signed': { icon: FileSignature, tone: 'ok' },
  'client.query': { icon: CircleHelp, tone: 'brand' },
  'client.dispute': { icon: AlertTriangle, tone: 'bad' },
  'client.finish': { icon: Palette, tone: 'brand' },
  'client.finishConfirmed': { icon: Palette, tone: 'ok' },
  'client.meetingConfirmed': { icon: CalendarCheck, tone: 'ok' },
  'people.checkin': { icon: DoorOpen, tone: 'ok' },
  'people.checkout': { icon: LogOut, tone: 'slate' },
  'people.leave': { icon: CalendarDays, tone: 'brand' },
  'people.correction': { icon: Clock, tone: 'brand' },
  'people.cancel': { icon: CalendarDays, tone: 'warn' },
  'people.withdrawn': { icon: CalendarDays, tone: 'slate' },
  'people.decided': { icon: CalendarCheck, tone: 'ok' },
  'ops.escalation': { icon: AlertTriangle, tone: 'bad' },
  'ops.decided': { icon: Gavel, tone: 'brand' },
  'design.submitted': { icon: PenTool, tone: 'brand' },
  'design.approved': { icon: Check, tone: 'ok' },
  'design.returned': { icon: Undo2, tone: 'warn' },
  'site.blocker': { icon: HardHat, tone: 'bad' },
  'site.unblocked': { icon: HardHat, tone: 'ok' },
  'site.update': { icon: HardHat, tone: 'brand' },
  'lead.new': { icon: UserPlus, tone: 'brand' },
  /* To the client, in their portal. */
  'portal.ready': { icon: Sparkles, tone: 'brand' },
  'portal.document': { icon: FileText, tone: 'brand' },
  'portal.minutes': { icon: NotebookPen, tone: 'brand' },
  'portal.answer': { icon: MessageSquare, tone: 'brand' },
  'portal.finish': { icon: Palette, tone: 'brand' },
  'portal.meeting': { icon: CalendarCheck, tone: 'brand' },
  'portal.invoice': { icon: IndianRupee, tone: 'warn' },
  'portal.decision': { icon: CircleHelp, tone: 'brand' },
  'portal.update': { icon: HardHat, tone: 'ok' },
  'portal.many': { icon: Layers, tone: 'brand' },
};
export const kindOf = (n: Pick<Stored, 'kind'>) => KIND[n.kind] || { icon: Sparkles, tone: 'brand' as RingTone };
/** A late check-in reads amber, whatever its kind says. */
export const toneOf = (n: Pick<Stored, 'kind' | 'title' | 'tags'>): RingTone =>
  (n.kind === 'people.checkin' && ((n.tags || []).includes('late') || /\blate$/.test(n.title)) ? 'warn' : kindOf(n).tone);

export const NoteTile: React.FC<{ note: Pick<Stored, 'kind' | 'title' | 'tags'>; size?: 'sm' | 'md' | 'lg' }> = ({ note, size = 'md' }) =>
  <IconTile icon={kindOf(note).icon} tone={toneOf(note)} size={size} />;

/** "just now", "4 min", "2 h", "Tue". */
export function ago(at: number, now = Date.now()): string {
  const m = Math.round((now - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return new Date(at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Snooze choices: an hour from now, and tomorrow at 9. */
export const SNOOZES: { label: string; until: () => number }[] = [
  { label: 'For an hour', until: () => Date.now() + 3600000 },
  { label: 'Until tomorrow, 9 AM', until: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); } },
];

/**
 * The count on a tab or the bell. A number when someone is waiting on you
 * (rose, with a breathing halo); a brand dot when there is only something new
 * to read; nothing otherwise. `key` on the number makes it turn over when it changes.
 */
export const Count: React.FC<{ needs: number; unread?: number; className?: string; label?: string }> = ({ needs, unread = 0, className = '-top-1 -right-1', label }) => {
  if (needs > 0) {
    return (
      <span className={`nt-count ${className}`} aria-label={label || `${needs} need you`}>
        <span key={needs} className="nt-flip">{needs > 99 ? '99+' : needs}</span>
      </span>
    );
  }
  if (unread > 0) return <span className={`nt-dot ${className}`} aria-label={label || 'New updates'} />;
  return null;
};

/**
 * The studio's brushed-metal bell (HubAlertsBell's), with a clapper that lags the body.
 *
 * Its gradients get ids of their own. With one shared id, the bell in the
 * phone header (hidden on a desktop) came first in the page, Chrome resolved
 * every bell's fill to that hidden gradient, and the top bar's bell painted
 * nothing at all.
 */
export const BellGlyph: React.FC<{ size?: number }> = ({ size = 24 }) => {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const body = `nt-bell-body-${id}`, sheen = `nt-bell-sheen-${id}`;
  return (
  <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" className="block overflow-visible">
    <defs>
      <linearGradient id={body} x1="14%" y1="4%" x2="86%" y2="96%">
        <stop offset="0" stopColor="#E8ECF7" />
        <stop offset="52%" stopColor="#A9B4D4" />
        <stop offset="100%" stopColor="#5C6894" />
      </linearGradient>
      <radialGradient id={sheen} cx="32%" cy="22%" r="52%">
        <stop offset="0" stopColor="#fff" stopOpacity=".75" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
    </defs>
    <g className="nt-bell-body">
      <circle cx="22" cy="6.4" r="2.7" fill={`url(#${body})`} />
      <path d="M22 8C15 8 9.5 13.5 9.5 20.5V27L6 32.5h32L34.5 27v-6.5C34.5 13.5 29 8 22 8Z" fill={`url(#${body})`} />
      <path d="M22 8C15 8 9.5 13.5 9.5 20.5V27L6 32.5h32L34.5 27v-6.5C34.5 13.5 29 8 22 8Z" fill={`url(#${sheen})`} />
      <path d="M15 14.5c1.6-3 4.2-4.7 7-4.9" stroke="#fff" strokeOpacity=".7" strokeWidth="1.7" strokeLinecap="round" fill="none" />
    </g>
    <g className="nt-bell-clap">
      <circle cx="22" cy="36" r="3.1" fill={`url(#${body})`} />
    </g>
  </svg>
  );
};

/** The title of a row, with a folded burst counted. */
export const titleOf = (n: Stored & { count?: number }) => foldedTitle({ kind: n.kind, title: n.title, count: n.count || 1 });

/** Faces for a folded burst: up to four initials, overlapping. */
export const Faces: React.FC<{ members: Stored[] }> = ({ members }) => (
  <span className="flex -space-x-1.5 mt-1.5">
    {members.slice(0, 4).map((m) => (
      <span key={m.id} className="w-5 h-5 rounded-full bg-gradient-to-br from-[#4C65B5] to-[#3D52A0] text-white text-[10px] font-bold grid place-items-center ring-2 ring-white">{m.initials.slice(0, 2)}</span>
    ))}
    {members.length > 4 && <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold grid place-items-center ring-2 ring-white">+{members.length - 4}</span>}
  </span>
);

export { AlarmClock };
