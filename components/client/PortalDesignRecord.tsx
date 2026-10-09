import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, CalendarDays, Check, Clock, Eye, Loader2, PenLine, Presentation, Undo2 } from '@/lib/lucide-shim';
import { cleanSignerName, plural, type PortalDesignMeeting } from '../../lib/designMeeting';
import { confirmDesignMeeting } from '../../services/clientPortalActions';
import PortalMeetingViewer from './PortalMeetingViewer';

/*
  THE CLIENT'S DESIGN RECORD.

  Every design meeting held with the client, room by room: the drawings shown
  (and which version), what they agreed and what they asked to change. A
  meeting they have not confirmed yet asks them to, with their name; the
  studio records their login and the time.
*/

interface Props {
  projectId: string;
  record: PortalDesignMeeting[];
  /** Only in the client's own session; the studio's preview shows the record without the button. */
  canConfirm: boolean;
  onRecord: (next: PortalDesignMeeting[]) => void;
  /** The client's name, run across the drawings when they open them. */
  clientName?: string;
}

const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const room = (r: string) => (/^general/i.test(r) ? 'Whole home' : r);

export default function PortalDesignRecord({ projectId, record, canConfirm, onRecord, clientName }: Props) {
  const waiting = record.filter((m) => !m.confirmation);

  if (!record.length) {
    return (
      <div className="p-16 text-center border border-dashed border-slate-200 rounded-2xl text-slate-500">
        <Presentation className="w-6 h-6 mx-auto mb-2 text-slate-400" />
        <p className="font-bold text-slate-800">No design meetings yet</p>
        <p className="text-xs mt-1">When your designer presents your rooms, what you agree and what you ask to change appears here.</p>
      </div>
    );
  }

  return (
    <motion.div key="record" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">Your design record</h2>
        <p className="text-xs text-slate-500 font-medium">
          {waiting.length
            ? `${plural(waiting.length, 'meeting')} waiting for your confirmation. Please read each one through and confirm it.`
            : 'Every meeting is confirmed. This is what was agreed, room by room.'}
        </p>
      </div>
      {record.map((m) => <MeetingCard key={m.id} m={m} projectId={projectId} canConfirm={canConfirm} onRecord={onRecord} clientName={clientName || 'you'} />)}
    </motion.div>
  );
}

type CardProps = { m: PortalDesignMeeting; projectId: string; canConfirm: boolean; onRecord: (r: PortalDesignMeeting[]) => void; clientName: string };

const MeetingCard: React.FC<CardProps> = ({ m, projectId, canConfirm, onRecord, clientName }) => {
  const [name, setName] = useState('');
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agreed = m.rooms.filter((r) => r.outcome === 'agreed').length;
  const changed = m.rooms.filter((r) => r.outcome === 'changes').length;

  async function confirm() {
    if (!cleanSignerName(name)) { setError('Type your full name to confirm.'); return; }
    setBusy(true); setError(null);
    try {
      const next = await confirmDesignMeeting(projectId, m.id, name.trim());
      if (next) onRecord(next);
    } catch (e: any) {
      setError(e?.message || 'That did not go through. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <div className={`bg-white rounded-3xl p-6 sm:p-8 border shadow-2xs ${m.confirmation ? 'border-slate-200/80' : 'border-amber-300 ring-4 ring-amber-50'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-sky-50 text-[#334486] flex items-center justify-center shrink-0"><CalendarDays className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-slate-900 text-xl tracking-tight">Design meeting, {day(m.heldAt)}</h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {[m.presentedBy && `Presented by ${m.presentedBy}`, m.attendees && `with ${m.attendees}`].filter(Boolean).join(' ')}
            {m.presentedBy || m.attendees ? ' · ' : ''}
            {[agreed && `${plural(agreed, 'room')} agreed`, changed && `${plural(changed, 'room')} with changes`].filter(Boolean).join(', ')}
          </p>
        </div>
        {m.confirmation
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800"><BadgeCheck className="w-3.5 h-3.5" />Confirmed</span>
          : <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800"><Clock className="w-3.5 h-3.5" />Waiting for you</span>}
      </div>
      {canConfirm ? (
        <button type="button" onClick={() => setViewing(true)}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#334486] hover:border-[#3D52A0] cursor-pointer">
          <Eye className="w-4 h-4" />See the drawings with your changes
        </button>
      ) : (
        <p className="mt-3 text-xs text-slate-500">The client sees the drawings from this meeting here, with their changes pinned. View only, with their name across every page.</p>
      )}
      {viewing && <PortalMeetingViewer projectId={projectId} meeting={m} clientName={clientName} onClose={() => setViewing(false)} />}

      <div className="mt-5 space-y-3">
        {m.rooms.map((r) => (
          <div key={r.room} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900">{room(r.room)}</span>
              {r.outcome === 'agreed'
                ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800"><Check className="w-3 h-3" />Agreed</span>
                : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800"><Undo2 className="w-3 h-3" />{plural(r.changes.length, 'change')}</span>}
            </div>
            <p className="text-xs text-slate-500 mt-1">{r.sheets.map((s) => `${s.name} (version ${s.versionNo})`).join(' · ')}</p>
            {r.changes.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">You asked us to change</div>
                <ol className="mt-1.5 space-y-1 text-sm text-slate-800 list-decimal pl-5">
                  {r.changes.map((c, i) => <li key={i}>{c}</li>)}
                </ol>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5">
        {m.confirmation ? (
          <p className="text-sm text-slate-600 flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{m.confirmation.via === 'portal' ? 'Confirmed' : 'Signed at the studio'} by <b className="text-slate-900">{m.confirmation.name}</b> on {day(m.confirmation.at)}.</span>
          </p>
        ) : canConfirm ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">Is this a true record of the meeting? Confirming tells your designer to go ahead on the rooms you agreed, and with the changes you asked for.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Type your full name"
                aria-label="Your full name"
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30" />
              <button type="button" onClick={confirm} disabled={busy || !cleanSignerName(name)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] px-5 text-sm font-bold text-white disabled:opacity-40 cursor-pointer">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}Confirm this record
              </button>
            </div>
            {error && <p className="text-xs font-bold text-rose-700">{error}</p>}
            <p className="text-[11px] text-slate-400">Something not right? Message your designer before confirming.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500 flex items-center gap-2"><Clock className="w-4 h-4 shrink-0" />Waiting for the client to confirm.</p>
        )}
      </div>
    </div>
  );
};
