import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Timer } from '@/lib/lucide-shim';
import { type Stored } from '../../lib/notify';
import { DoneTick } from '../people/PeopleBits';
import { Chip, Panel, type ChipTone } from '../opsDesk/DeskBits';
import { useInbox } from './NotifyContext';
import { NoteCoin, TICK_MS, waited } from './NotifyBits';

/*
  WAITING ON YOU (pattern 12 in the round-two mockups): on the Ops Desk, only
  the things someone is waiting for -- a client's message, a revision sent
  back, an escalation, a new enquiry, a blocked site -- oldest first, each
  with a live timer. It turns amber at 10 minutes and rose at 30, so no client
  is left waiting by accident. Answering one opens the screen that owns it;
  Done takes it off here and out of the bell, and so does dealing with the
  thing itself: a message marked dealt with, an escalation decided, a lead
  called (lib/notify Note.ref). Plain updates never come here.

  A row's tile leans to the pointer and turns over to a tick when it is done;
  after half an hour a rose halo breathes around it, and its timer chip turns
  over each time it changes colour.
*/

const DESK = /^(client|ops|lead|site)\./;
const AMBER = 10, ROSE = 30;

const toneFor = (mins: number): ChipTone => (mins >= ROSE ? 'rose' : mins >= AMBER ? 'amber' : 'slate');

const rowV = {
  hidden: { opacity: 0, rotateX: -45, y: -6 },
  show: { opacity: 1, rotateX: 0, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: 40, height: 0, transition: { duration: 0.22 } },
};

export default function WaitingOnYou() {
  const inbox = useInbox();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  /* Done: the tile turns over to a tick, then the row leaves. */
  const [ticked, setTicked] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);
  if (!inbox) return null;
  const finish = (id: string) => {
    setTicked((t) => [...t, id]);
    timers.current.push(window.setTimeout(() => inbox.done_([id]), TICK_MS));
  };
  const list: Stored[] = inbox.waiting.filter((n) => DESK.test(n.kind));
  const longest = list.length ? now - list[0].at : 0;

  return (
    <Panel icon={Timer} title="Waiting on you" tour="waiting"
      blurb="Only what someone is waiting for, oldest first. Amber after 10 minutes, rose after 30. Each leaves once it is dealt with."
      right={list.length ? <Chip tone={toneFor(longest / 60000)}>{list.length} waiting · longest {waited(longest)}</Chip> : undefined}>
      {!list.length ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-4">
          <DoneTick size={32} />
          <p className="text-xs text-slate-500">Nobody is waiting on you. A client's message or a new enquiry will show here the moment it arrives.</p>
        </div>
      ) : (
        <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          className="divide-y divide-slate-100 -mx-1" style={{ perspective: 900 }}>
          <AnimatePresence initial={false}>
            {list.map((n) => {
              const mins = (now - n.at) / 60000;
              const done = ticked.includes(n.id);
              return (
                <motion.li key={n.id} layout variants={rowV} exit="exit" style={{ transformOrigin: '50% 0%' }}
                  className="nt-row group flex items-start gap-3 px-1 py-3">
                  <NoteCoin note={n} done={done} urgent={mins >= ROSE} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                    {n.line && <p className="text-xs text-slate-500 truncate">{n.line}</p>}
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">{[n.projectName, n.actor].filter(Boolean).join(' · ')}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button type="button" onClick={() => inbox.openNote(n)}
                        className="pp-press px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486]">{n.action || 'Open'}</button>
                      <button type="button" onClick={() => finish(n.id)} disabled={done}
                        className="disabled:opacity-60 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"><Check className="w-3.5 h-3.5" />Done</button>
                    </div>
                  </div>
                  <span className="shrink-0 tabular-nums" title={`Waiting since ${new Date(n.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}>
                    <span key={toneFor(mins)} className="nt-flip"><Chip tone={toneFor(mins)}>waiting {waited(now - n.at)}</Chip></span>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </Panel>
  );
}
