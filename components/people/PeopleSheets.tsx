import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Sun, Users, Sparkles } from '@/lib/lucide-shim';
import { LEAVE_LABELS, addDays, isOff, smartPreview, timeLabel, type Attendance, type LeaveType, type Mode, type Portion, type Snapshot } from '../../lib/peopleDesk';
import { fyLabel, personName, todayOf } from '../../lib/peopleView';
import { runPeople } from '../../services/peopleService';
import { Sheet, Label, input, btnPri, btnSec } from '../opsDesk/OpsDeskPanels';
import { Glide, Notice, rowV, listV } from './PeopleBits';

/*
  Asking for leave, and for a correction to a day's attendance
  (lib/peopleDesk execute: request, correction). The leave form shows, as
  you choose the dates, how many days it charges, the break it makes with
  the studio's offs, who else is away, and what is left afterwards.
*/

const niceDay = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const TYPES: LeaveType[] = ['PL', 'SL', 'CL', 'COMP', 'WFH'];

export function LeaveSheet({ snapshot, onClose, onSaved, start: start0 }: { snapshot: Snapshot; onClose: () => void; onSaved: (msg: string) => void; start?: string }) {
  const today = todayOf(snapshot);
  const firstWorking = (from: string) => { let d = from; for (let i = 0; i < 14 && isOff(d, snapshot.policy); i++) d = addDays(d, 1); return d; };
  const [type, setType] = useState<LeaveType>('PL');
  const [start, setStart] = useState(start0 || firstWorking(addDays(today, 1)));
  const [end, setEnd] = useState(start0 || firstWorking(addDays(today, 1)));
  const [portion, setPortion] = useState<Portion>('Full day');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const single = start === end;
  const preview = useMemo(() => {
    try { return { ok: smartPreview(snapshot, start, end < start ? start : end, single ? portion : 'Full day') }; } catch (e: any) { return { err: String(e?.message || e) } as const; }
  }, [snapshot, start, end, portion, single]);
  const p = 'ok' in preview ? preview.ok : null;
  const others = p ? p.conflicts.filter((c) => c.employeeId !== snapshot.me.id) : [];
  const balanceLines = p && type !== 'WFH'
    ? Object.entries(p.byYear).map(([fy, u]) => {
      const units = Number(u);
      const b = snapshot.balances[fy]?.[type];
      return { fy, units, available: b ? b.available : null, after: b ? b.available - units : null };
    })
    : [];
  const short = balanceLines.some((l) => l.after != null && l.after < 0);

  /* A day next to a weekend or holiday, so one day off becomes a longer break. */
  const longerBreak = () => {
    for (let i = 1; i < 45; i++) {
      const d = addDays(today, i);
      if (!isOff(d, snapshot.policy) && (isOff(addDays(d, -1), snapshot.policy) || isOff(addDays(d, 1), snapshot.policy))) { setStart(d); setEnd(d); setPortion('Full day'); return; }
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await runPeople('request', { type, start, end: end < start ? start : end, portion: single ? portion : 'Full day', reason: reason.trim() });
    setSaving(false);
    if ('error' in r) { setError(r.error); return; }
    onSaved(type === 'WFH' ? 'Work from home requested.' : `${LEAVE_LABELS[type]} requested. Your approver has it now.`);
  };

  return (
    <Sheet eyebrow="People" title={type === 'WFH' ? 'Ask to work from home' : 'Apply for leave'}
      sub="Weekly offs and studio holidays are never counted. Your manager, or an admin, decides." onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} disabled={saving || !p || short} onClick={save}><Check className="w-4 h-4" />{saving ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div>
        <Label>Type</Label>
        <Glide id="leave-type" label="Leave type" value={type} onChange={setType} options={TYPES.map((t) => ({ id: t, label: t === 'WFH' ? 'Work from home' : LEAVE_LABELS[t] }))} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div><Label htmlFor="lv-start">From</Label><input id="lv-start" type="date" className={input} value={start} min={addDays(today, -60)} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></div>
        <div><Label htmlFor="lv-end">To</Label><input id="lv-end" type="date" className={input} value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
        <button type="button" className={`${btnSec} whitespace-nowrap`} onClick={longerBreak}><Sun className="w-4 h-4" />Make a longer break</button>
      </div>
      <AnimatePresence initial={false}>
        {single && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Label>How much of the day</Label>
            <Glide id="leave-portion" label="Portion" value={portion} onChange={setPortion} options={[{ id: 'Full day', label: 'Full day' }, { id: 'First half', label: 'First half' }, { id: 'Second half', label: 'Second half' }]} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-live="polite">
        {p ? (
          <motion.div variants={listV} initial="hidden" animate="show" key={`${start}${end}${portion}${type}`} className="flex flex-col gap-3">
            <motion.div variants={rowV} className="grid grid-cols-3 gap-3">
              {[
                [String(p.units), type === 'WFH' ? 'days from home' : 'days charged'],
                [String(p.breakDays), 'days away, with offs'],
                [String(others.length), 'others away then'],
              ].map(([n, l]) => (
                <div key={l} className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                  <p className="text-sm font-black text-slate-800 tabular-nums">{n}</p>
                  <p className="text-[11px] text-slate-500">{l}</p>
                </div>
              ))}
            </motion.div>
            <motion.div variants={rowV} className="flex flex-wrap gap-1.5">
              {p.days.map((d) => (
                <span key={d.date} className="px-2 py-0.5 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-[11px] font-semibold">{niceDay(d.date)}{d.units < 1 ? ' ½' : ''}</span>
              ))}
            </motion.div>
            <motion.p variants={rowV} className="text-xs text-slate-500 flex items-start gap-2"><Sparkles className="w-3.5 h-3.5 mt-0.5 text-[#3D52A0]" />
              Away {niceDay(p.breakStart)} to {niceDay(p.breakEnd)}, counting the studio's offs around it.</motion.p>
            {balanceLines.map((l) => (
              <motion.p key={l.fy} variants={rowV} className={`text-xs ${l.after != null && l.after < 0 ? 'text-rose-700 font-semibold' : 'text-slate-600'}`}>
                {fyLabel(l.fy)}: uses {l.units} of your {l.available ?? '—'} {LEAVE_LABELS[type].toLowerCase()} days{l.after != null && l.after >= 0 ? `, leaving ${l.after}.` : '.'}{l.after != null && l.after < 0 ? ' Not enough balance.' : ''}
              </motion.p>
            ))}
            {others.length > 0 && (
              <motion.p variants={rowV} className="text-xs text-amber-900 flex items-start gap-2"><Users className="w-3.5 h-3.5 mt-0.5" />
                Also away: {others.map((o) => `${personName(snapshot, o.employeeId)}${o.status === 'Pending' ? ' (asked)' : ''}`).join(', ')}.</motion.p>
            )}
          </motion.div>
        ) : (
          <p className="text-xs text-slate-600">{'err' in preview ? preview.err : ''}</p>
        )}
      </div>
      <div>
        <Label htmlFor="lv-reason">Note for your approver (optional)</Label>
        <textarea id="lv-reason" className={`${input} min-h-[70px]`} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Only your approver and People admins see this." />
      </div>
      <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
    </Sheet>
  );
}

/** "11:40" on the session's date, as the instant the server expects (India time). */
const instant = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

export function CorrectionSheet({ snapshot, session, sites, onClose, onSaved }: {
  snapshot: Snapshot; session: Attendance; sites: string[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const tz = snapshot.policy.timezone;
  const [inAt, setInAt] = useState(timeLabel(session.checkIn, tz));
  const [outAt, setOutAt] = useState(session.checkOut ? timeLabel(session.checkOut, tz) : snapshot.policy.end);
  const [mode, setMode] = useState<Mode>(session.mode);
  const [site, setSite] = useState(session.site || '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = snapshot.requests.some((r) => r.kind === 'correction' && r.correction?.sessionId === session.id && r.status === 'Pending');

  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await runPeople('correction', {
      sessionId: session.id, version: session.version, checkIn: instant(session.date, inAt), checkOut: instant(session.date, outAt), mode, site: mode === 'Site' ? site : '', reason: reason.trim(),
    });
    setSaving(false);
    if ('error' in r) { setError(r.error); return; }
    onSaved('Correction sent for approval.');
  };

  return (
    <Sheet eyebrow="People" title="Ask for a correction" sub={`${new Date(`${session.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}. The day changes only once your approver agrees.`} onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} disabled={saving || pending || reason.trim().length < 3 || outAt <= inAt} onClick={save}><Check className="w-4 h-4" />{saving ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      {pending && <Notice text="A correction for this day is already waiting for approval." tone="bad" />}
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="cr-in">Checked in at</Label><input id="cr-in" type="time" className={input} value={inAt} onChange={(e) => setInAt(e.target.value)} /></div>
        <div><Label htmlFor="cr-out">Checked out at</Label><input id="cr-out" type="time" className={input} value={outAt} onChange={(e) => setOutAt(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>Worked</Label><Glide id="cr-mode" label="Worked" value={mode} onChange={setMode} options={[{ id: 'Office', label: 'Office' }, { id: 'Site', label: 'Site' }, { id: 'WFH', label: 'From home' }]} /></div>
        {mode === 'Site' && (
          <div className="flex-1 min-w-[180px]"><Label htmlFor="cr-site">Site</Label>
            <select id="cr-site" className={input} value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="">Choose</option>{[...new Set([...sites, session.site].filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
        )}
      </div>
      <div>
        <Label htmlFor="cr-reason">What happened</Label>
        <textarea id="cr-reason" className={`${input} min-h-[70px]`} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Forgot to check out after the site visit" />
      </div>
      {outAt <= inAt && <p className="text-[11px] text-rose-700">Check-out must be after check-in.</p>}
      <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
    </Sheet>
  );
}
