import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PartyPopper, Cake, Star, Send, RefreshCw, Gift } from '@/lib/lucide-shim';
import type { CardView, GuideView } from '../../lib/peopleGuide';
import { runGuide } from '../../services/peopleGuideService';
import { btnSec } from '../opsDesk/OpsDeskPanels';
import { Panel, Empty, Notice, Ring, Skeleton, Confetti, listV, rowV, EASE } from './PeopleBits';
import { Face, chip, firstName, fromNow, niceDay } from './GuideBits';

/*
  CELEBRATIONS (lib/peopleGuide.ts; approved mockup C, 27 Oct 2026).

  Birthdays (for those who show theirs) and work anniversaries, with a card
  the whole studio signs. A card opens the day before, so it is full by the
  morning, and stays open three days after; its person sees it from the day
  itself. One wish a person, which they can change.
*/

const occasionLine = (c: { kind: string; years?: number }) =>
  c.kind === 'birthday' ? 'Birthday' : `${c.years} year${c.years === 1 ? '' : 's'} at the studio`;

export function CelebrationsSection({ view, meId, error, onRefresh }: { view: GuideView | null; meId: string; error: string | null; onRefresh: () => void }) {
  const [at, setAt] = useState<string | null>(null);
  if (!view) {
    return (
      <Panel icon={PartyPopper} title="Celebrations" blurb="Birthdays and work anniversaries, with a card the whole studio signs.">
        {error ? <Empty icon={PartyPopper} text={error}><button type="button" className={btnSec} onClick={onRefresh}><RefreshCw className="w-4 h-4" />Try again</button></Empty>
          : <Skeleton className="h-72 rounded-2xl" />}
      </Panel>
    );
  }
  const names = new Map(view.entries.map((e) => [e.id, e.name]));
  const card = view.cards.find((c) => c.id === at) || view.cards.find((c) => c.days === 0) || view.cards[0] || null;
  return (
    <Panel icon={PartyPopper} title="Celebrations" blurb="Birthdays and work anniversaries, with a card the whole studio signs. A card opens the day before, so it is full by the morning.">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
        <div className="min-w-0 flex flex-col gap-3">
          {view.cards.length > 1 && (
            <div role="tablist" aria-label="Cards open now" className="flex flex-wrap gap-2">
              {view.cards.map((c) => {
                const on = c.id === card?.id;
                return (
                  <button key={c.id} type="button" role="tab" aria-selected={on} onClick={() => setAt(c.id)}
                    className={`relative px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${on ? 'text-white' : 'text-slate-700 bg-slate-100 hover:bg-slate-200'}`}>
                    {on && <motion.span layoutId="card-pick" className="absolute inset-0 rounded-xl bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                    <span className="relative">{firstName(names.get(c.personId) || '')} · {c.kind === 'birthday' ? 'birthday' : `${c.years} yr${c.years === 1 ? '' : 's'}`} · {fromNow(c.days).toLowerCase()}</span>
                  </button>
                );
              })}
            </div>
          )}
          {card ? <CardStage key={card.id} card={card} name={names.get(card.personId) || ''} meId={meId} />
            : <Empty icon={Gift} text="No card is open right now. A card opens the day before someone's birthday or work anniversary." />}
        </div>

        <aside className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Coming up · next 30 days</p>
          {view.upcoming.length === 0 ? <p className="text-xs text-slate-500">Nothing in the next 30 days. Birthdays and joining dates are added in the office guide.</p> : (
            <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
              {view.upcoming.slice(0, 8).map((o) => (
                <motion.li key={o.id} variants={rowV} className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-2.5 py-2">
                  <Ring value={1 - o.days / 30} size={40} stroke={3} tone={o.days === 0 ? 'ok' : o.kind === 'anniversary' ? 'warn' : 'brand'} label={`${names.get(o.personId)}: ${fromNow(o.days)}`}>
                    {o.kind === 'birthday' ? <Cake className="w-3.5 h-3.5 text-[#3D52A0]" /> : <Star className="w-3.5 h-3.5 text-amber-600" />}
                  </Ring>
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-semibold text-slate-800 truncate">{names.get(o.personId)}</span>
                    <span className="text-[11px] text-slate-500">{occasionLine(o)} · {niceDay(o.date)}</span>
                  </span>
                  <span className={`${chip} ${o.days === 0 ? 'bg-emerald-100 text-emerald-700' : o.kind === 'anniversary' ? 'bg-amber-100 text-amber-700' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}>{fromNow(o.days)}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </aside>
      </div>
    </Panel>
  );
}

/* ── The card: a cover that opens, and the wishes inside ─────────────────── */

const CardStage: React.FC<{ card: CardView; name: string; meId: string }> = ({ card, name, meId }) => {
  const mine = card.wishes.find((w) => w.by === meId);
  const [text, setText] = useState(mine?.text || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  useEffect(() => { if (!burst) return; const t = window.setTimeout(() => setBurst(0), 1500); return () => window.clearTimeout(t); }, [burst]);
  const sign = async () => {
    setSaving(true);
    setError(null);
    const r = await runGuide('wish', { cardId: card.id, text });
    setSaving(false);
    if ('error' in r) { setError(r.error); return; }
    setBurst(Date.now());
  };
  return (
    <div className="pp-3d relative rounded-2xl bg-gradient-to-b from-slate-50 to-[#3D52A0]/5 border border-slate-200 p-5 sm:p-8 overflow-hidden">
      <div className="flex flex-col md:flex-row justify-center pp-keep">
        <motion.div className="relative md:w-60 min-h-[220px] md:min-h-[340px] rounded-t-2xl md:rounded-tr-md md:rounded-l-2xl md:rounded-bl-2xl bg-gradient-to-br from-[#3D52A0] to-[#334486] text-white p-6 flex flex-col justify-between shadow-[-18px_30px_40px_-24px_rgba(18,24,47,0.6)]"
          style={{ transformOrigin: 'right center', transformPerspective: 1600 }}
          initial={{ rotateY: 0 }} animate={{ rotateY: -24 }} transition={{ duration: 1.4, delay: 0.25, ease: EASE }}>
          {card.kind === 'birthday' ? <Cake className="w-10 h-10" strokeWidth={1.6} /> : <Star className="w-10 h-10" strokeWidth={1.6} />}
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">{niceDay(card.date)}</span>
            <span className="block mt-1.5 text-2xl font-black leading-tight">
              {card.kind === 'birthday' ? `Happy birthday, ${firstName(name)}` : `${card.years} year${card.years === 1 ? '' : 's'} with us, ${firstName(name)}`}
            </span>
            <span className="block mt-2 text-xs text-white/85">From everyone at the studio</span>
          </span>
        </motion.div>
        <div className="relative md:w-80 min-h-[340px] rounded-b-2xl md:rounded-bl-md md:rounded-r-2xl md:rounded-tl-md bg-white border border-slate-200 p-4 flex flex-col gap-2 shadow-[18px_30px_40px_-24px_rgba(18,24,47,0.4)]">
          {burst > 0 && <Confetti pieces={22} spread={120} />}
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{card.wishes.length ? `${card.wishes.length} ${card.wishes.length === 1 ? 'person has' : 'people have'} signed` : 'Be the first to sign'}</p>
          <motion.ul variants={listV} initial="hidden" animate="show" className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-64 pr-1">
            <AnimatePresence initial={false}>
              {card.wishes.map((w) => (
                <motion.li key={w.by} layout variants={rowV} initial="hidden" animate="show" exit={{ opacity: 0 }} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-700 whitespace-pre-line">{w.text}</p>
                  <p className="text-[11px] font-bold text-[#3D52A0] mt-0.5">{w.name}</p>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
          {card.mine ? (
            <p className="text-xs font-semibold text-emerald-700 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">This card is for you. Enjoy it.</p>
          ) : (
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              {error && <Notice text={error} tone="bad" />}
              <div className="flex gap-2">
                <input aria-label="Your wish" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
                  placeholder={card.signed ? 'Change your wish' : 'Write your wish'} value={text} maxLength={280} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && !saving) sign(); }} />
                <button type="button" className="pp-press inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50" disabled={saving || !text.trim()} onClick={sign}>
                  <Send className="w-4 h-4" />{saving ? 'Signing…' : card.signed ? 'Update' : 'Sign'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── On Today: a birthday or anniversary today ───────────────────────────── */

export function CelebrationBanner({ view, onOpen }: { view: GuideView | null; onOpen: () => void }) {
  const today = (view?.cards || []).filter((c) => c.days === 0);
  if (!view || !today.length) return null;
  const names = new Map(view.entries.map((e) => [e.id, e.name]));
  const mine = today.find((c) => c.mine);
  const c = mine || today[0];
  const name = names.get(c.personId) || '';
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}
      className="group pp-glass relative overflow-hidden rounded-3xl px-5 py-4 flex flex-wrap items-center gap-4">
      <span className="pp-glow" />
      <Confetti pieces={18} spread={110} />
      <span className="relative"><Face name={name} here size="lg" /></span>
      <div className="relative flex-1 min-w-[220px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 flex items-center gap-1.5">
          {c.kind === 'birthday' ? <Cake className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}{c.kind === 'birthday' ? 'Birthday today' : 'Work anniversary today'}
        </p>
        <p className="font-bold text-slate-800 mt-1">
          {mine ? (c.kind === 'birthday' ? `Happy birthday, ${firstName(name)}!` : `${c.years} year${c.years === 1 ? '' : 's'} with the studio. Thank you, ${firstName(name)}!`)
            : c.kind === 'birthday' ? `It's ${name}'s birthday` : `${name}: ${c.years} year${c.years === 1 ? '' : 's'} with the studio`}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {c.wishes.length ? `${c.wishes.length} ${c.wishes.length === 1 ? 'person has' : 'people have'} signed the card` : 'Nobody has signed the card yet'}
          {today.length > 1 ? ` · and ${today.length - 1} more today` : ''}
        </p>
      </div>
      <div className="relative flex items-center gap-2">
        {!mine && c.signed && <span className={`${chip} bg-emerald-100 text-emerald-700`}>You signed</span>}
        <button type="button" onClick={onOpen} className="pp-press inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">
          <PartyPopper className="w-4 h-4" />{mine ? 'Open your card' : c.signed ? 'See the card' : 'Sign the card'}
        </button>
      </div>
    </motion.section>
  );
}
