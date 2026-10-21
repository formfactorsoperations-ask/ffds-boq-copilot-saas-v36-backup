import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sunset, CheckCircle2, CircleDot, Check, X } from '@/lib/lucide-shim';
import { Confetti, DoneTick, Glide, IconTile, listV, rowV } from '../people/PeopleBits';
import { dayKey, addDays, type QueueItem } from '../../lib/opsDesk';
import { btnPri, btnSec, input } from './OpsDeskPanels';
import { useDesk, BRAND_EYEBROW, EYEBROW, firstName } from './DeskBits';
import '../projectHeader/projectHeader.css';

/*
  CLOSING THE DAY (mockup OD5). One tap at the end of the day: what was closed,
  what rolls to tomorrow (or to a day you pick), and an optional note for the
  lead, who reads it and tomorrow's list on their own desk. A next step moves
  to its new day; anything else rests until then.
*/

export interface Rolled { q: QueueItem; to: string }

export function DayClose({ leadName, onClose, onSave }: {
  leadName: string;
  onClose: () => void;
  onSave: (rolled: Rolled[], note: string) => Promise<void>;
}) {
  const d = useDesk();
  const today = dayKey(d.now);
  const tomorrow = addDays(today, 1);
  const open = d.queue.filter((q) => q.group === 'overdue' || q.group === 'today');
  const [when, setWhen] = useState<Record<string, string>>(() => Object.fromEntries(open.map((q) => [q.id, tomorrow])));
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = d.done.length + open.length;
  const dateLabel = new Date(d.now).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(open.map((q) => ({ q, to: when[q.id] || tomorrow })), note.trim());
      setSaved(true);
      window.setTimeout(onClose, 1600);
    } catch {
      setError('That was not saved. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Close my day">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 pt-5 pb-4 flex items-start gap-3">
          <span className="group"><IconTile icon={Sunset} size="sm" className="!w-9 !h-9 !rounded-xl" /></span>
          <div className="flex-1">
            <p className={BRAND_EYEBROW}>Day done · {dateLabel}</p>
            <h3 className="text-lg font-bold text-slate-800">{d.done.length} of {total} done. {open.length ? 'Here is what rolls to tomorrow.' : 'Nothing rolls over.'}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        {saved ? (
          <div className="relative px-6 py-12 grid place-items-center text-center">
            <Confetti pieces={26} spread={130} />
            <DoneTick size={64} />
            <p className="mt-4 font-bold text-slate-800">Day closed. See you tomorrow, {firstName(d.me.name)}.</p>
            <p className="text-xs text-slate-500 mt-1">{leadName} sees your note and tomorrow’s list on their desk.</p>
          </div>
        ) : (
          <div className="px-6 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className={EYEBROW}>Closed today</p>
              {!d.done.length ? <p className="mt-2 text-xs text-slate-500">Nothing logged today yet.</p> : (
                <motion.ul variants={listV} initial="hidden" animate="show" className="mt-2 flex flex-col gap-1.5 text-xs text-slate-700">
                  {d.done.slice(0, 15).map((x) => <motion.li variants={rowV} key={x.id} className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-px" /><span>{x.title} <span className="text-slate-500">· {x.project}</span></span></motion.li>)}
                </motion.ul>
              )}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <p className={EYEBROW}>Rolls to another day</p>
              {!open.length ? <p className="mt-2 text-xs text-slate-500">Everything due today is done.</p> : (
                <motion.ul variants={listV} initial="hidden" animate="show" className="mt-2 flex flex-col gap-2.5 text-xs text-slate-700">
                  {open.slice(0, 20).map((q) => (
                    <motion.li variants={rowV} key={q.id} className="flex flex-col gap-1.5">
                      <span className="flex items-start gap-2"><CircleDot className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-px" /><span className="flex-1">{q.title}<span className="text-slate-500"> · {q.projectName}</span></span></span>
                      <span className="flex flex-wrap items-center gap-2 pl-5">
                        <Glide id={`roll-${q.id}`} label="When" value={pick[q.id] ? 'pick' : 'tomorrow'}
                          onChange={(v) => { setPick({ ...pick, [q.id]: v === 'pick' }); if (v === 'tomorrow') setWhen({ ...when, [q.id]: tomorrow }); }}
                          options={[{ id: 'tomorrow', label: 'Tomorrow' }, { id: 'pick', label: 'Pick a day' }]} />
                        {pick[q.id] && <input type="date" aria-label="Move to" className={`${input} !w-auto !py-1 !text-xs`} min={tomorrow} value={when[q.id]} onChange={(e) => setWhen({ ...when, [q.id]: e.target.value || tomorrow })} />}
                      </span>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4 flex flex-col">
              <label htmlFor="day-note" className={EYEBROW}>Note for {leadName} (optional)</label>
              <textarea id="day-note" className={`${input} mt-2 flex-1 min-h-[110px] text-xs`} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Mrs Kapoor may want a third stone sample. Can the designer bring one on Wednesday?" />
            </div>
          </div>
        )}
        {!saved && (
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex flex-wrap items-center gap-3">
            <span className="text-[11px] text-slate-500 flex-1">{error ? <span className="text-rose-700">{error}</span> : `${leadName} sees your note and tomorrow’s list on their desk.`}</span>
            <button type="button" className={btnSec} onClick={onClose}>Not yet</button>
            <button type="button" className={`${btnPri} pp-press`} onClick={save} disabled={saving}><Check className="w-4 h-4" />{saving ? 'Closing…' : 'Close my day'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
