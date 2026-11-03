import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HandHeart, Heart, Pin, RefreshCw, X } from '@/lib/lucide-shim';
import { KUDOS_TAGS, type GuideView, type Kudos, type KudosTag } from '../../lib/peopleGuide';
import { runGuide, playedMoments, markPlayed } from '../../services/peopleGuideService';
import { Label, input, btnSec } from '../opsDesk/OpsDeskPanels';
import { Panel, Empty, Notice, Glide, Skeleton, Confetti, ConfettiShower, EASE } from './PeopleBits';
import { chip, firstName, niceDay } from './GuideBits';

/*
  THE KUDOS WALL (lib/peopleGuide.ts; approved mockup E, 27 Oct 2026).

  A short, specific thank-you, pinned up for the whole studio. The person
  thanked hears of it (lib/notify kudosDraft). Notes hang slightly tilted from
  their pin and straighten when pointed at; the wall reaches back two months.
  Whoever wrote a note, or an admin, can take it down.
*/

/* Paper and pin, in the brand and state colours only, in turn. */
const PAPER = [
  { bg: 'bg-[#3D52A0]/5', pin: 'bg-[#3D52A0]' },
  { bg: 'bg-emerald-50', pin: 'bg-emerald-500' },
  { bg: 'bg-amber-50', pin: 'bg-amber-500' },
  { bg: 'bg-rose-50', pin: 'bg-rose-500' },
];
const TILT = [-2.2, 1.6, -1.2, 2, -1.6, 1.2];
const monthOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function KudosWallSection({ view, meId, error, onRefresh }: { view: GuideView | null; meId: string; error: string | null; onRefresh: () => void }) {
  const [to, setTo] = useState('');
  const [tag, setTag] = useState<KudosTag>(KUDOS_TAGS[0]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [show, setShow] = useState<'all' | 'mine'>('all');
  /*
    Thank-yous pinned up since this person last saw the wall (the owner, 3 Nov
    2026): a shower of confetti over the wall, and a glowing "New" on each, once.
  */
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [shower, setShower] = useState(0);
  useEffect(() => {
    if (!view || !meId) return;
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    const played = playedMoments(meId, 'wall');
    const ids = view.kudos.filter((k) => k.from !== meId && k.at >= week && !played.has(k.id)).map((k) => k.id);
    if (!ids.length) return;
    markPlayed(meId, 'wall', ids);
    setFresh((f) => new Set([...f, ...ids]));
    setShower(Date.now());
  }, [view, meId]);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(t); }, [notice]);
  useEffect(() => { if (!burst) return; const t = window.setTimeout(() => setBurst(0), 1500); return () => window.clearTimeout(t); }, [burst]);

  if (!view) {
    return (
      <Panel icon={HandHeart} title="Kudos wall" blurb="Thank someone in front of the studio.">
        {error ? <Empty icon={HandHeart} text={error}><button type="button" className={btnSec} onClick={onRefresh}><RefreshCw className="w-4 h-4" />Try again</button></Empty>
          : <Skeleton className="h-64 rounded-2xl" />}
      </Panel>
    );
  }
  const names = new Map(view.entries.map((e) => [e.id, e.name]));
  const others = view.entries.filter((e) => e.id !== meId);
  const pin = async () => {
    setSaving(true);
    setProblem(null);
    const r = await runGuide('kudos', { to, tag, text });
    setSaving(false);
    if ('error' in r) { setProblem(r.error); return; }
    setNotice(`Pinned up. ${firstName(names.get(to) || '')} will hear about it.`);
    setText('');
    setTo('');
    setBurst(Date.now());
  };
  const notes = view.kudos.filter((k) => show === 'all' || k.to === meId);
  const months: { label: string; notes: Kudos[] }[] = [];
  for (const k of notes) {
    const label = monthOf(k.at);
    const last = months[months.length - 1];
    if (last?.label === label) last.notes.push(k); else months.push({ label, notes: [k] });
  }

  return (
    <Panel icon={HandHeart} title="Kudos wall" blurb="Thank someone in front of the studio. Short, specific, and it stays up for two months."
      aside={<Glide id="kudos-show" label="Show" value={show} onChange={setShow} options={[{ id: 'all', label: 'Everyone' }, { id: 'mine', label: 'Thanks to me' }]} />}>
      <AnimatePresence>{notice && <Notice text={notice} onClose={() => setNotice(null)} />}</AnimatePresence>
      <div className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 flex flex-col gap-3 mb-6 mt-1">
        {burst > 0 && <Confetti pieces={22} spread={120} />}
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
          <div>
            <Label htmlFor="kd-to">Thank</Label>
            <select id="kd-to" className={input} value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Pick someone</option>
              {others.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="kd-text">What did they do?</Label>
            <input id="kd-text" className={input} value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="Got the site ready a day early so the client could walk through on Sunday." />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Glide id="kudos-tag" label="What it was for" value={tag} onChange={setTag} options={KUDOS_TAGS.map((t) => ({ id: t, label: t }))} />
          <button type="button" className="pp-press ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50"
            disabled={saving || !to || text.trim().length < 3} onClick={pin}>
            <Pin className="w-4 h-4" />{saving ? 'Pinning…' : 'Pin it up'}
          </button>
        </div>
        {problem && <Notice text={problem} tone="bad" />}
      </div>

      <div className="relative">
      {shower > 0 && <ConfettiShower key={shower} pieces={26} spread={150} />}
      {months.length === 0 ? (
        <Empty icon={HandHeart} text={show === 'mine' ? 'No thank-yous to you in the last two months yet.' : 'Nothing pinned up yet. Be the first to thank someone.'} />
      ) : months.map((m) => (
        <div key={m.label} className="mb-6 last:mb-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-4">{m.label} · {m.notes.length} thank-you{m.notes.length === 1 ? '' : 's'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-6">
            <AnimatePresence initial={true}>
              {m.notes.map((k, i) => (
                <Note key={k.id} k={k} i={i} isNew={fresh.has(k.id)} toName={names.get(k.to) || 'Someone'} fromName={names.get(k.from) || 'Someone who has left'} meId={meId} canRemove={k.from === meId || view.canEdit} onError={setProblem} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      ))}
      </div>
    </Panel>
  );
}

const Note: React.FC<{ k: Kudos; i: number; isNew?: boolean; toName: string; fromName: string; meId: string; canRemove: boolean; onError: (m: string) => void }> = ({ k, i, isNew = false, toName, fromName, meId, canRemove, onError }) => {
  const still = useReducedMotion();
  const paper = PAPER[i % PAPER.length];
  const tilt = still ? 0 : TILT[i % TILT.length];
  const hearted = k.hearts.includes(meId);
  const [busy, setBusy] = useState(false);
  const act = async (action: string, data: Record<string, unknown>) => {
    setBusy(true);
    const r = await runGuide(action, data);
    setBusy(false);
    if ('error' in r) onError(r.error);
  };
  return (
    <motion.div layout initial={{ opacity: 0, y: -24, rotate: tilt, scale: 0.96 }} animate={{ opacity: 1, y: 0, rotate: tilt, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      whileHover={still ? undefined : { rotate: 0, y: -3 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay: Math.min(i, 8) * 0.06 }}
      style={{ transformOrigin: '50% 0%' }}
      className={`group relative min-h-[150px] rounded-2xl border border-slate-900/5 ${paper.bg} px-4 pt-5 pb-3 flex flex-col gap-2 shadow-[0_10px_20px_-16px_rgba(15,23,42,0.4)] hover:shadow-[0_18px_34px_-20px_rgba(61,82,160,0.55)] transition-shadow`}>
      <span className={`absolute -top-1.5 left-1/2 -ml-1.5 w-3 h-3 rounded-full ${paper.pin} shadow`} aria-hidden />
      {isNew && (
        /* New since you last looked: a ring that glows a few times, then stays. */
        <motion.span aria-hidden className="pointer-events-none absolute -inset-1 rounded-[20px] ring-2 ring-emerald-400"
          initial={{ opacity: 0 }} animate={still ? { opacity: 0.8 } : { opacity: [0, 1, 0.3, 1, 0.3, 0.8] }} transition={{ duration: 3, delay: 0.4 }} />
      )}
      <span className="flex items-center gap-1.5">
        <span className={`${chip} bg-white/80 text-slate-700`}>{k.tag}</span>
        {isNew && <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.5 }} className={`${chip} bg-emerald-100 text-emerald-700`}>New</motion.span>}
      </span>
      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line">{k.text}</p>
      <span className="mt-auto flex items-center gap-2">
        <span className="flex-1 text-[11px] text-slate-600"><b className="text-slate-800">{toName}{k.to === meId ? ' (you)' : ''}</b> · from {fromName} · {niceDay(k.at)}</span>
        {canRemove && (
          <button type="button" disabled={busy} onClick={() => act('unkudos', { kudosId: k.id })} aria-label="Take this down"
            className="w-7 h-7 rounded-lg grid place-items-center text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white/70 hover:text-rose-600 transition">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <motion.button type="button" disabled={busy} whileTap={{ scale: 0.85 }} onClick={() => act('heart', { kudosId: k.id, on: !hearted })}
          aria-pressed={hearted} aria-label={hearted ? 'Take your heart back' : 'Add a heart'}
          className={`inline-flex items-center gap-1 text-[11px] font-bold ${hearted ? 'text-rose-600' : 'text-slate-500 hover:text-rose-600'}`}>
          <motion.span key={String(hearted)} initial={{ scale: hearted ? 0.4 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }} className="inline-flex">
            <Heart className="w-3.5 h-3.5" fill={hearted ? 'currentColor' : 'none'} />
          </motion.span>
          {k.hearts.length}
        </motion.button>
      </span>
    </motion.div>
  );
};
