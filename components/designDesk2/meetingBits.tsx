import React, { useEffect, useRef, useState } from 'react';
import { Check, ClipboardCheck, Copy, IndianRupee, MapPin, MessageSquareText, PencilLine, Undo2 } from 'lucide-react';
import { costLine, plural, type DesignMeeting, type MeetingRoom } from '../../lib/designMeeting';
import { minutesText, type MeetingWay, type MinuteLine } from '../../lib/meetingMinutes';
import { roomLabel, useToast } from '../drawingReview/ui';
import { Btn, Tag, cx } from './parts';

/*
  DESIGN DESK 2.0 MEETINGS: the pieces the Meetings page and the meeting
  screen share. The minutes list, a room as the meeting recorded it, and how
  the client is seeing the drawings (remembered on this device).
*/

const WAY_KEY = 'ffds_dd2_meet_way';
export const savedWay = (): MeetingWay => { try { return localStorage.getItem(WAY_KEY) === 'room' ? 'room' : 'call'; } catch { return 'call'; } };
export const saveWay = (w: MeetingWay) => { try { localStorage.setItem(WAY_KEY, w); } catch { /* storage off */ } };

export const inr = (n: number | null | undefined) => (n === null || n === undefined ? '' : `₹${Math.abs(n).toLocaleString('en-IN')}`);

/* The emerald the shared meeting dialogs (sign, who presents, room marks, the approval email) take inside the new desk. */
export const DESK_ACCENT = { '--dd-accent': '#059669', '--dd-accent-deep': '#047857', '--dd-accent-ring': 'rgba(5,150,105,0.18)' } as React.CSSProperties;

const ICON: Record<MinuteLine['kind'], typeof Check> = {
  start: MessageSquareText, happy: Check, change: MapPin, sent: PencilLine, round: Undo2, bill: IndianRupee, waive: IndianRupee, open: Undo2, saved: ClipboardCheck, signed: PencilLine,
};

/** The minutes as a list that grows as buttons are pressed. `dark` is the meeting screen; light is the saved page. */
export const MinutesList: React.FC<{ lines: MinuteLine[]; dark?: boolean; className?: string }> = ({ lines, dark, className }) => {
  const box = useRef<HTMLOListElement>(null);
  /* A new line is brought into view, as someone taking minutes would turn the page. */
  useEffect(() => { const el = box.current; if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight }); }, [lines.length]);
  return (
    <ol ref={box} aria-label="Minutes" className={cx('flex flex-col gap-1.5 overflow-auto', className)}>
      {lines.map((l, i) => {
        const Icon = ICON[l.kind];
        const tone = l.kind === 'happy' || l.kind === 'saved' || l.kind === 'signed' ? 'emerald' : l.kind === 'change' || l.kind === 'sent' ? 'amber' : l.kind === 'round' || l.kind === 'bill' ? 'rose' : 'slate';
        const dot = dark
          ? { emerald: 'bg-emerald-500 text-white', amber: 'bg-amber-500 text-white', rose: 'bg-rose-500 text-white', slate: 'bg-slate-700 text-slate-200' }[tone]
          : { emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-800', rose: 'bg-rose-100 text-rose-700', slate: 'bg-slate-100 text-slate-600' }[tone];
        return (
          <li key={`${i}:${l.text}`} className={cx('hud-row-in flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-sm', dark ? 'bg-slate-800/70 text-slate-200' : 'bg-slate-50 text-slate-700')}>
            <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', dot)}><Icon size={11} strokeWidth={2.6} aria-hidden /></span>
            <span className="min-w-0 flex-1">{l.text}{l.studio && <span className={cx('ml-1.5 whitespace-nowrap text-xs font-bold', dark ? 'text-slate-400' : 'text-slate-400')}>Studio only</span>}</span>
          </li>
        );
      })}
    </ol>
  );
};

/** Copies the minutes the client may be given (no rounds, billing or costs). */
export const CopyMinutes: React.FC<{ title: string; lines: MinuteLine[] }> = ({ title, lines }) => {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(minutesText(title, lines));
      setDone(true); setTimeout(() => setDone(false), 2500);
      toast({ ok: true, title: 'Minutes copied', sub: 'Paste them into an email or WhatsApp. Billing and cost lines are left out.' });
    } catch { toast({ title: 'Not copied', sub: 'The browser did not allow it. Select the minutes and copy them by hand.' }); }
  };
  return <Btn kind="plain" icon={done ? Check : Copy} onClick={copy}>{done ? 'Copied' : 'Copy the minutes'}</Btn>;
};

/** A room as the meeting recorded it. `studio` adds the revision round, the billing choice and what each change costs. */
export const RoomResult: React.FC<{ r: MeetingRoom; included: number; studio: boolean; round?: number }> = ({ r, included, studio, round }) => {
  const n = round ?? r.round;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-base text-slate-800">{roomLabel(r.room)}</b>
        {r.outcome === 'agreed' ? <Tag tone="good" icon={Check}>Client is happy</Tag>
          : r.outcome === 'changes' ? <Tag tone="you" icon={MapPin}>{plural(r.changes.length, 'change')} to make</Tag>
          : <Tag>Not finished</Tag>}
        {studio && n > 0 && <Tag tone={n > included ? 'bad' : 'plain'}>Round {n} of {included} included</Tag>}
        {studio && r.charge && <Tag tone={r.charge.status === 'to_bill' ? 'bad' : r.charge.status === 'billed' ? 'good' : 'plain'}>{r.charge.status === 'to_bill' ? 'To bill' : r.charge.status === 'billed' ? 'Billed' : 'Waived'}{r.charge.fee !== null ? ` · ${inr(r.charge.fee)}` : ''}</Tag>}
      </div>
      <div className="mt-1 text-sm text-slate-500">{r.sheets.map((s) => `${s.name} v${s.versionNo}`).join(' · ')}</div>
      {r.outcome === 'changes' && r.changes.map((c) => (
        <div key={c.n} className="mt-1.5 flex items-start gap-2 text-sm text-slate-700">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-bold text-white">{c.n}</span>
          <span className="min-w-0 flex-1">{c.text} <span className="text-slate-400">({r.sheets.find((s) => s.drawingId === c.drawingId)?.name})</span>
            {studio && c.cost && <span className="block text-xs font-semibold text-amber-800">{costLine(c.cost)}. Estimate, to confirm.</span>}
          </span>
        </div>
      ))}
      {!r.outcome && <div className="mt-1 text-sm text-slate-500">It waits for the next meeting. Nothing was recorded for the client.</div>}
    </div>
  );
};

export const meetingTitle = (m: Pick<DesignMeeting, 'projectName' | 'closedAt' | 'startedAt'>, when: (t: number) => string) =>
  `Design meeting · ${m.projectName || 'the project'} · ${when(m.closedAt || m.startedAt)}`;
