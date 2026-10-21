import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, PlayCircle, Check, BookOpen, Users, Sparkles, MessageCircle, ArrowRight } from '@/lib/lucide-shim';
import { Coin, IconTile, listV, rowV } from '../people/PeopleBits';
import { GLOSSARY, GUIDE_STEPS, guideProgress, type GuideStep, type GuideStepId } from '../../lib/opsTeam';
import { dayKey } from '../../lib/opsDesk';
import { btnSec } from './OpsDeskPanels';
import { useDesk, seenSteps, Panel, Avatar, BRAND_EYEBROW, firstName, waLink, cardV } from './DeskBits';

/*
  THE FIRST WEEK (mockup OD4). A new joiner's guide, on their real clients:
  six short steps, each with "Show me" pointing at the real button on the
  screen. Beside it, the desk's words explained, who to ask, and questions they
  can put to the desk. The steps the desk can see for itself (a call logged,
  minutes written, a lead added) tick themselves.
*/

export interface AskPerson { email: string; name: string; role: string; phone: string }

export function FirstWeek({ people, onShowMe, onTick, onHide, onAsk }: {
  people: AskPerson[];
  onShowMe: (s: GuideStep) => void;
  onTick: (id: GuideStepId) => void;
  onHide: () => void;
  onAsk: (q: string) => void;
}) {
  const d = useDesk();
  const g = guideProgress(d.record?.guide, seenSteps(d));
  const [q, setQ] = useState('');
  const hidden = !!d.record?.guideHiddenUntil && d.record.guideHiddenUntil > dayKey(d.now);
  const clients = d.projects.length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      <motion.section variants={cardV} initial="hidden" animate="show" className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-start gap-4">
          <IconTile icon={GraduationCap} size="md" />
          <div className="flex-1 min-w-0">
            <p className={BRAND_EYEBROW}>{d.isLead ? 'How the desk works' : 'Your first week'} · {g.count} of {g.total} done</p>
            <h3 className="text-xl font-bold text-slate-800">Welcome to the Ops Desk, {firstName(d.me.name)}</h3>
            <p className="text-sm text-slate-600 mt-1">Six short steps, each on your real {clients ? `${clients} client${clients === 1 ? '' : 's'}` : 'clients'}. Each takes about five minutes; “Show me” points at the place on the screen.</p>
          </div>
          {!d.isLead && <button type="button" className={`${btnSec} !text-xs !py-1.5`} onClick={onHide} disabled={hidden}>{hidden ? 'Hidden until tomorrow' : 'Hide until tomorrow'}</button>}
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 mt-5 overflow-hidden">
          <motion.div className="h-full bg-[#3D52A0] rounded-full" initial={{ width: 0 }} animate={{ width: `${(g.count / g.total) * 100}%` }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        <motion.div variants={listV} initial="hidden" animate="show" className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {GUIDE_STEPS.map((s, i) => {
            const done = g.done.has(s.id);
            const next = g.next?.id === s.id;
            return (
              <motion.div variants={rowV} key={s.id}
                className={`group rounded-xl border p-4 flex gap-3 pp-lift ${done ? 'border-emerald-200 bg-emerald-50/40' : next ? 'border-[#3D52A0]/40 bg-[#3D52A0]/5' : 'border-slate-200'}`}>
                <Coin size={28} shown={done} delay={0.2 + i * 0.08}
                  front={<span className="w-7 h-7 rounded-full grid place-items-center bg-emerald-600 text-white"><Check className="w-4 h-4" /></span>}
                  back={<span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-black ${next ? 'bg-[#3D52A0] text-white' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{s.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{s.detail}</p>
                  {!done && (
                    <button type="button" onClick={() => onShowMe(s)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#3D52A0] hover:underline">
                      <PlayCircle className="w-3.5 h-3.5" />Show me
                    </button>
                  )}
                  {!done && !['log', 'minutes', 'lead'].includes(s.id) && (
                    <button type="button" onClick={() => onTick(s.id)} className="mt-2 ml-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700">
                      <Check className="w-3.5 h-3.5" />Done
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
        {g.count === g.total && (
          <p className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">All six done. The desk is yours; the ? on any row still opens its playbook.</p>
        )}
      </motion.section>

      <div className="flex flex-col gap-6">
        <Panel icon={BookOpen} title="Words on the desk" blurb="What the desk’s own words mean">
          <motion.dl variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2.5 text-xs">
            {GLOSSARY.map(([k, v]) => (
              <motion.div variants={rowV} key={k}><dt className="font-bold text-slate-800">{k}</dt><dd className="text-slate-600">{v}</dd></motion.div>
            ))}
          </motion.dl>
        </Panel>
        <Panel icon={Users} title="Who to ask" blurb="From Studio settings → Team">
          {!people.length ? <p className="text-xs text-slate-500">Nobody on the team list yet.</p> : (
            <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
              {people.map((p) => (
                <motion.div variants={rowV} key={p.email} className="flex items-center gap-2.5">
                  <Avatar name={p.name} />
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p><p className="text-[11px] text-slate-500 truncate">{p.role}</p></div>
                  {p.phone
                    ? <a href={waLink(p.phone, `Hi ${firstName(p.name)}, `)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${p.name}`} className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-slate-100"><MessageCircle className="w-4 h-4" /></a>
                    : <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-slate-100"><MessageCircle className="w-4 h-4" /></a>}
                </motion.div>
              ))}
            </motion.div>
          )}
        </Panel>
        <Panel icon={Sparkles} title="Ask the desk" blurb="Plain questions, answered from your projects">
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAsk(q.trim()); }} className="flex gap-2">
            <input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
              placeholder="What did we promise Mr Naik?" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Your question" />
            <button type="submit" className="px-3 rounded-lg bg-[#3D52A0] text-white hover:bg-[#334486]" aria-label="Ask"><ArrowRight className="w-4 h-4" /></button>
          </form>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {['What is due this week?', 'Who hasn’t replied in 5 days?', 'What is waiting on the client?'].map((x) => (
              <button key={x} type="button" onClick={() => onAsk(x)} className="px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">{x}</button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── "Show me": a light on the real button, with the step beside it ──────── */

export function Spotlight({ step, index, onBack, onDone }: { step: GuideStep; index: number; onBack: () => void; onDone: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    let raf = 0;
    const find = () => document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    const el = find();
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const track = () => {
      const e = find();
      setRect(e ? e.getBoundingClientRect() : null);
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => cancelAnimationFrame(raf);
  }, [step.target]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onBack]);
  if (typeof document === 'undefined') return null;
  const pad = 8;
  const box = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const below = box ? box.top + box.height + 180 < window.innerHeight : true;
  const tipTop = box ? (below ? box.top + box.height + 12 : Math.max(12, box.top - 160)) : window.innerHeight / 2 - 80;
  const tipLeft = box ? Math.min(Math.max(12, box.left), window.innerWidth - 360) : window.innerWidth / 2 - 170;
  return createPortal(
    <div className="fixed inset-0 z-[400]" role="dialog" aria-label={`Step ${index} of 6: ${step.title}`}>
      <div className="absolute inset-0" onClick={onBack} />
      <AnimatePresence>
        {box && (
          <motion.div key="ring" className="absolute rounded-2xl pointer-events-none"
            initial={{ opacity: 0, scale: 1.25 }} animate={{ opacity: 1, scale: 1, left: box.left, top: box.top, width: box.width, height: box.height }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            style={{ boxShadow: '0 0 0 9999px rgba(18, 24, 47, 0.45), 0 0 0 4px rgba(61, 82, 160, 0.45)' }} />
        )}
      </AnimatePresence>
      <motion.div initial={{ opacity: 0, y: 12, rotateX: -25 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        style={{ top: tipTop, left: tipLeft, transformPerspective: 800 }}
        className="absolute w-[340px] max-w-[calc(100vw-24px)] rounded-xl bg-slate-800 text-white text-xs p-3 shadow-xl">
        <p className="font-bold">Step {index} of 6 · {step.title}</p>
        <p className="mt-1 text-slate-200">{step.tip}</p>
        {!box && <p className="mt-1 text-amber-200">This is on another screen size; look for it in the menu.</p>}
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={onBack} className="px-2 py-1 rounded-md bg-white/15 font-bold hover:bg-white/25">Back</button>
          <button type="button" onClick={onDone} className="px-2 py-1 rounded-md bg-white text-slate-800 font-bold hover:bg-slate-100">Got it</button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

