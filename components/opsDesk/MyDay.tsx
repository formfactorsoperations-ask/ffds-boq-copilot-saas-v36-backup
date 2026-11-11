import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Target, Mic, UserPlus, Plus, Flag, Moon, Clock, Check, Phone, MessageCircle, ArrowRight, Calendar, Video, MapPin, Activity, Wallet, Users,
  Flame, Maximize2, Inbox, GraduationCap, Gift, Key, Star, PartyPopper, Send,
} from '@/lib/lucide-shim';
import { CountUp } from '../ui/HudBits';
import { Confetti } from '../people/PeopleBits';
import WaitingOnYou from '../notify/WaitingOnYou';
import { dayKey, type QueueItem } from '../../lib/opsDesk';
import { dayRing, explain, guideProgress } from '../../lib/opsTeam';
import { handoverSlip } from '../../lib/opsAssist';
import { leadName, mainPerson, isOpen as leadIsOpen, BOARD_STAGES, LEAD_STAGES, homeLine, sourceLabel, type Lead } from '../../lib/leads';
import { leadHeat, templateText } from '../../lib/leadSmart';
import {
  greeting, countWord, streakOf, weekStrip, todayTimeline, clockLabel, inLabel, payState, byLateness, matchesClient, HEALTH_LABEL,
  type ClientFilter,
} from '../../lib/opsDesk2';
import { clock12 } from '../../lib/peopleDesk';
import { useDesk, seenSteps, dialable, waLink, firstName, type Desk, type DeskClient } from './DeskBits';
import { KIND, ACTION, reminderText, TodayList, ThisWeek } from './TodayView';
import { ClientWall, type WallItem } from './ClientWall';
import { Amt, ScoreBar, initialsOf, useMinute } from './Od2Bits';

/*
  MY DAY (Ops Desk 2.1, mockup approved 11 Nov 2026).

  A greeting that names what will make the day, a ring that fills as work is
  done and the streak kept by closing the day; the client wall; then the
  bento: Up next as a stack of cards with what to say ready, today's meetings
  and visits on one line with "now", the client pulse, payments to chase,
  the leads at a glance, who on the team is on what (for the leads), and the
  whole day in order underneath, with why each row is there. Everything is
  read from the desk; nothing new is stored.
*/

const due = (q: QueueItem) => q.group === 'overdue' || q.group === 'today';

/** What one item on the desk asks for: why, what to say, and the button that does it. */
export function useItemBrief(q: QueueItem | null) {
  const d = useDesk();
  return useMemo(() => (q ? briefOf(d, q) : null), [q, d]); // eslint-disable-line react-hooks/exhaustive-deps
}

export interface Brief {
  q: QueueItem;
  tag: string;
  tone: 'bad' | 'warn' | 'brand';
  when: string;
  why: string;
  sayLabel: string;
  say: string;
  lead: Lead | null;
  phone: string;
  /** Opens WhatsApp with the reminder and logs it. */
  whatsapp: (() => void) | null;
  primary: { label: string; icon: React.ComponentType<any>; run: () => void; done: boolean };
}

export function briefOf(d: Desk, q: QueueItem): Brief {
  const w = d.waiting.find((x) => x.projectId === q.projectId && x.key === q.ref) || null;
  const project = d.projects.find((p) => p.id === q.projectId);
  const slip = w ? handoverSlip(w, project?.targetHandover).days : 0;
  const e = explain(q, { waiting: w, settings: d.settings, slipDays: slip });
  const lead = q.kind === 'lead' || q.kind === 'lead_open' ? d.leads.find((l) => l.id === q.ref) || null : null;
  const phone = String((lead ? mainPerson(lead)?.phone : project?.raw?.context?.clientPhone) || '');
  const fu = q.kind === 'next' ? d.followUps.find((f) => f.id === q.ref) || null : null;
  let say = e.todo;
  let sayLabel = 'What to do';
  if (w) { say = reminderText(d, w, q); sayLabel = 'What to say'; }
  else if (lead) { say = templateText(lead.stage === 'new' ? 'intro' : 'checkin', lead, { me: d.me.name, studio: d.studioName }); sayLabel = 'What to say'; }
  const callable = (q.kind === 'payment' || q.kind === 'decision' || q.kind === 'lead') && !!dialable(phone);
  const primary = fu
    ? { label: 'Mark it done', icon: Check, done: true, run: () => { void d.act.markDone(fu); } }
    : callable
      ? { label: 'Call now', icon: Phone, done: false, run: () => { window.location.href = `tel:+${dialable(phone)}`; if (lead) d.act.openLead(lead.id); else d.act.log({ projectId: q.projectId, subjectKey: q.ref, channel: 'call' }); } }
      : { label: ACTION[q.kind], icon: ArrowRight, done: false, run: () => d.act.openItem(q) };
  return {
    q, tag: KIND[q.kind].label, tone: q.group === 'overdue' ? 'bad' : q.kind === 'payment' || q.kind === 'escalation_open' ? 'warn' : 'brand',
    when: q.group === 'overdue' ? 'Overdue' : q.group === 'today' ? 'Today' : q.due ? new Date(`${q.due}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'This week',
    why: e.why, sayLabel, say, lead, phone,
    whatsapp: w && d.canWrite ? () => { void d.act.sendReminder(w, reminderText(d, w, q)); } : null,
    primary,
  };
}

export function MyDay() {
  const d = useDesk();
  const [filter, setFilter] = useState<ClientFilter>('all');
  const open = d.queue;
  const dueItems = open.filter(due);
  const ring = dayRing(open, d.done);
  const counts = { bad: d.clients.filter((c) => c.health === 'bad').length, warn: d.clients.filter((c) => c.health === 'warn').length, good: d.clients.filter((c) => c.health === 'good').length };
  const progress = d.record ? guideProgress(d.record.guide, seenSteps(d)) : null;
  const newJoiner = !!d.record && !d.isLead && progress && progress.count < progress.total
    && d.now - d.record.startedAt < 14 * 86400000 && (!d.record.guideHiddenUntil || d.record.guideHiddenUntil <= dayKey(d.now));
  const wall: WallItem[] = d.clients.filter((c) => matchesClient(c, filter)).map(wallItem);

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <Hero ring={ring} dueItems={dueItems} counts={counts} />
      {newJoiner && progress && (
        <button type="button" onClick={() => d.act.go('guide')} className="od-card od-lift od-rise text-left flex items-center gap-3" style={{ ['--d' as any]: 1 }}>
          <span className="od-tile"><GraduationCap /></span>
          <span className="flex-1 min-w-0">
            <span className="od-eyebrow">Your first week · {progress.count} of {progress.total} done</span>
            <span className="block text-sm font-semibold truncate">Next: {progress.next?.title}</span>
          </span>
          <ArrowRight className="w-4 h-4 text-[#3D52A0]" />
        </button>
      )}
      <WaitingOnYou />
      {d.clients.length > 0 && (
        <ClientWall tour="clients" title={d.isLead ? 'Every project on the desk' : 'Your clients'}
          sub="Every live project on one curved wall. Drag it, or tap a card to open the client."
          items={wall} filter={filter} onFilter={(f) => setFilter(f as ClientFilter)}
          filters={[{ id: 'all', label: `All ${d.clients.length}` }, { id: 'attention', label: 'Needs you' }, { id: 'handover', label: 'Near handover' }]}
          onOpen={(id) => d.act.openClient(id)} />
      )}
      <div className="od-bento">
        <UpNextStack items={dueItems} />
        <TodayLine />
        <PulseTiles />
        <PaymentsCard />
        <LeadsCard />
        <MomentsCard />
        {d.isLead && d.teamRows.length ? <TeamCard /> : <div className="od-c-5 od-rise" style={{ ['--d' as any]: 9 }}><ThisWeek /></div>}
        <section className="od-card od-rise" style={{ ['--d' as any]: 10 }} data-tour="today">
          <div className="od-ch">
            <span className="od-tile"><Inbox /></span>
            <div><h3>The day, in order</h3><p>{d.isLead ? 'Escalations to decide and minutes to approve come first, then your own.' : 'Overdue first, then today. Every row says why it is here.'}</p></div>
          </div>
          <TodayList queue={open} done={d.done} />
        </section>
      </div>
    </div>
  );
}

export const wallItem = (c: DeskClient): WallItem => ({
  id: c.id, name: c.name, client: c.client, line: c.line, stage: c.phase.line, phaseIndex: c.phase.index, health: c.health, progress: c.progress, next: c.next,
});

/* ── The hero: the day ring, the greeting, the streak, the quick actions ── */

function Hero({ ring, dueItems, counts }: { ring: { done: number; total: number; ratio: number }; dueItems: QueueItem[]; counts: { bad: number; warn: number; good: number } }) {
  const d = useDesk();
  const C = 276.46;
  const [off, setOff] = useState(C);
  useEffect(() => { const id = window.setTimeout(() => setOff(C * (1 - ring.ratio)), 60); return () => window.clearTimeout(id); }, [ring.ratio]);
  const n = dueItems.length;
  const streak = streakOf(d.closedDays, d.now);
  const week = weekStrip(d.closedDays, d.now);
  const closedToday = d.closedDays.includes(dayKey(d.now));
  const [party, setParty] = useState(false);
  const first = dueItems[0], second = dueItems[1];
  const sub = d.loading ? 'Loading your desk…'
    : !n ? (d.queue.length ? 'What is left is for later this week.' : 'Log a call, add a lead, or look in on a client.')
      : `${first.title}${first.projectName ? ` (${first.projectName})` : ''}${second ? `, then ${second.title.replace(/^./, (c) => c.toLowerCase())}` : ''}. ${n > 2 ? 'The rest can follow.' : ''}`;
  const date = new Date(d.now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

  return (
    <section className="od-card od-hero od-rise" data-tour="upnext">
      <div className="od-hero-g">
        <div className="od-dayring" role="img" aria-label={`${ring.done} of ${ring.total} done today`}>
          <svg viewBox="0 0 104 104" aria-hidden><circle className="bgc" cx="52" cy="52" r="44" /><circle className="fg" cx="52" cy="52" r="44" strokeDasharray={C} strokeDashoffset={off} /></svg>
          <div className="lbl"><div><b className="od-num"><CountUp value={ring.done} />/{ring.total}</b><br /><span>done</span></div></div>
        </div>
        <div className="od-hello min-w-0">
          <span className="od-eyebrow">{date}</span>
          <h1>{greeting(d.now)}, {firstName(d.me.name)}. {n ? <><em>{countWord(n)} {n === 1 ? 'thing' : 'things'}</em> will make today.</> : <><em>Nothing</em> is due today.</>}</h1>
          <p>{sub}</p>
          <div className="od-stats">
            <button type="button" className="od-stat" onClick={() => d.act.go('pulse')}><span className="od-dot bad" /><b className="od-num"><CountUp value={counts.bad} /></b> {counts.bad === 1 ? 'client' : 'clients'} at risk</button>
            <button type="button" className="od-stat" onClick={() => d.act.go('pulse')}><span className="od-dot warn" /><b className="od-num"><CountUp value={counts.warn} /></b> watching</button>
            <button type="button" className="od-stat" onClick={() => d.act.go('pulse')}><span className="od-dot good" /><b className="od-num"><CountUp value={counts.good} /></b> happy</button>
            <span className="od-stat"><Check /><b className="od-num"><CountUp value={d.done.length} /></b> done today</span>
          </div>
        </div>
        {!d.isLead && (
          <div className="od-streak relative">
            <span className="od-flame"><Flame /><span><span className="od-num">{streak}</span>-day streak</span></span>
            <div className="od-week" aria-label="This week">
              {week.map((w) => <span key={w.key} className={`${w.done ? 'd' : ''} ${w.today ? 't' : ''}`} title={w.done ? 'Closed' : w.today ? 'Today' : ''}>{w.letter}</span>)}
            </div>
            <small className="od-eyebrow">{closedToday ? 'Today is closed' : 'Close the day to keep it'}</small>
            {party && <span className="absolute right-8 top-0"><Confetti /></span>}
          </div>
        )}
      </div>
      {d.canWrite && (
        <div className="od-qa">
          <button type="button" className="od-btn pri pp-press" onClick={d.act.focus} disabled={!n}><Target />Start focus mode</button>
          <button type="button" className="od-btn" onClick={d.act.capture}><Mic />Capture a call</button>
          <button type="button" className="od-btn" data-tour="lead" onClick={d.act.addLead}><UserPlus />Add a lead</button>
          <button type="button" className="od-btn" data-tour="log" onClick={() => d.act.log({})}><Plus />Log a follow-up</button>
          <button type="button" className="od-btn" data-tour="escalate" onClick={() => d.act.escalate({})}><Flag />Raise an escalation</button>
          {!d.isLead && <button type="button" className="od-btn ghost" onClick={() => { setParty(true); window.setTimeout(() => setParty(false), 1600); d.act.closeDay(); }}><Moon />Close my day</button>}
        </div>
      )}
    </section>
  );
}

/* ── Up next: a stack of cards, one at a time ── */

function UpNextStack({ items }: { items: QueueItem[] }) {
  const d = useDesk();
  const [out, setOut] = useState<{ id: string; how: 'done' | 'snooze' } | null>(null);
  const top = items.slice(0, 3);
  const rest = items.slice(3, 9);
  const briefs = top.map((q) => briefOf(d, q));
  const act = (how: 'done' | 'snooze') => {
    const b = briefs[0];
    if (!b || out) return;
    if (how === 'snooze') { setOut({ id: b.q.id, how }); window.setTimeout(() => { d.act.later(b.q); setOut(null); }, 380); return; }
    if (b.primary.done) { setOut({ id: b.q.id, how }); window.setTimeout(() => { b.primary.run(); setOut(null); }, 380); return; }
    b.primary.run();
  };
  /* D does the top card, S sends it to later today, F opens focus mode. Not while typing or with a dialog open. */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = document.activeElement as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.closest('[role="dialog"]'))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'd' && d.canWrite) act('done');
      else if (key === 's') act('snooze');
      else if (key === 'f' && items.length) d.act.focus();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <section className="od-card od-c-focus od-rise" style={{ ['--d' as any]: 2 }}>
      <div className="od-ch">
        <span className="od-tile"><Target /></span>
        <div><h3>Up next</h3><p>One thing at a time, with what to say ready.</p></div>
        <div className="od-r"><button type="button" className="od-btn sm" onClick={d.act.focus} disabled={!items.length}><Maximize2 />Focus mode</button></div>
      </div>
      <div className="od-stackbox">
        {!items.length ? (
          <div className="od-stack-empty">
            <div><Check className="w-5 h-5 mx-auto text-emerald-600" /><b>All clear for today</b>{d.isLead ? 'Nothing waits on you.' : 'Close your day to keep the streak.'}
              {!d.isLead && d.canWrite && <div className="mt-3"><button type="button" className="od-btn pri" onClick={d.act.closeDay}><Moon />Close my day</button></div>}
            </div>
          </div>
        ) : [...briefs].reverse().map((b, ri, arr) => {
          const depth = arr.length - 1 - ri;
          const gone = out && out.id === b.q.id ? (out.how === 'done' ? 'out-done' : 'out-snooze') : '';
          return (
            <article key={b.q.id} className={`od-fcard ${depth === 0 ? 'top' : ''} ${gone}`} aria-hidden={depth ? true : undefined}
              style={{ transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`, zIndex: 10 - depth, filter: depth ? 'saturate(.6)' : undefined }}>
              <div className="od-row">
                <span className={`od-chip ${b.tone}`}>{b.tag}</span>
                <span className="od-chip"><Clock />{b.when}</span>
                {b.q.projectId && d.clients.some((c) => c.id === b.q.projectId)
                  ? <button type="button" className="od-link ml-auto" tabIndex={depth ? -1 : 0} onClick={() => d.act.openClient(b.q.projectId)}>{b.q.projectName} →</button>
                  : b.lead ? <button type="button" className="od-link ml-auto" tabIndex={depth ? -1 : 0} onClick={() => d.act.openLead(b.lead!.id)}>{leadName(b.lead)} →</button> : null}
              </div>
              <h4>{b.q.title}</h4>
              <p className="od-why">{b.why}</p>
              <p className="od-script"><span className="od-eyebrow">{b.sayLabel}</span>{b.say}</p>
              {d.canWrite && (
                <div className="od-acts">
                  <button type="button" className="od-btn pri" tabIndex={depth ? -1 : 0} onClick={() => act('done')}><b.primary.icon />{b.primary.label}</button>
                  {b.whatsapp && <button type="button" className="od-btn" tabIndex={depth ? -1 : 0} onClick={b.whatsapp}><MessageCircle />WhatsApp it</button>}
                  <button type="button" className="od-btn" tabIndex={depth ? -1 : 0} onClick={() => act('snooze')}><Clock />Later today</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {(rest.length > 0 || d.done.length > 0) && (
        <div className="od-qlist">
          {rest.map((q) => (
            <button key={q.id} type="button" onClick={() => d.act.openItem(q)}>
              <span className={`od-dot ${q.group === 'overdue' ? 'bad' : 'warn'}`} /><span className="od-q">{q.title} · {q.projectName}</span><span className="od-t">{q.group === 'overdue' ? 'Overdue' : 'Today'}</span>
            </button>
          ))}
          {d.done.slice(0, 4).map((x) => <button key={x.id} type="button" className="done" disabled><Check /><span className="od-q">{x.title}</span></button>)}
        </div>
      )}
      <div className="od-keys"><span><kbd className="od-kbd">D</kbd> do the top one</span><span><kbd className="od-kbd">S</kbd> later today</span><span><kbd className="od-kbd">F</kbd> focus mode</span><span><kbd className="od-kbd">Ctrl K</kbd> search</span></div>
    </section>
  );
}

/* ── Focus mode: the day, full screen, one at a time ── */

export function FocusMode({ onClose }: { onClose: () => void }) {
  const d = useDesk();
  const items = d.queue.filter(due);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [t0] = useState(Date.now());
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const list = [...items.filter((q) => !skipped.includes(q.id)), ...items.filter((q) => skipped.includes(q.id))];
  const q = list[0] || null;
  const b = q ? briefOf(d, q) : null;
  const total = items.length + d.done.length;
  const secs = Math.floor((tick - t0) / 1000);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="od-ov od-fm" role="dialog" aria-modal="true" aria-label="Focus mode" ref={box} tabIndex={-1}>
      <div className="od-fm-top">
        <div className="od-fm-dots">{Array.from({ length: Math.min(total, 24) }, (_, i) => <i key={i} className={i < d.done.length ? 'd' : i === d.done.length ? 'c' : ''} />)}</div>
        <span className="od-fm-timer">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
        <button type="button" className="od-btn sm" onClick={onClose}>Esc · close</button>
      </div>
      {b ? (
        <div className="od-fm-card" key={b.q.id}>
          <span className="od-eyebrow">{b.tag} · {b.q.projectName} · {d.done.length + 1} of {total}</span>
          <h2>{b.q.title}</h2>
          <p>{b.why}</p>
          <div className="od-fm-script"><span className="od-eyebrow">{b.sayLabel}</span><br />{b.say}</div>
          {d.canWrite && (
            <div className="od-fm-acts">
              <button type="button" className="od-btn pri" onClick={() => { b.primary.run(); if (!b.primary.done) onClose(); }}><b.primary.icon />{b.primary.label}</button>
              {b.whatsapp && <button type="button" className="od-btn" onClick={b.whatsapp}><MessageCircle />WhatsApp it</button>}
              <button type="button" className="od-btn" onClick={() => { d.act.later(b.q); setSkipped((s) => [...s, b.q.id]); }}><Clock />Later today</button>
              <button type="button" className="od-btn" onClick={() => setSkipped((s) => [...s.filter((x) => x !== b.q.id), b.q.id])}>Next</button>
            </div>
          )}
        </div>
      ) : (
        <div className="od-fm-card">
          <span className="od-eyebrow">All {total} done</span>
          <h2>That is the day. Nicely done.</h2>
          <p>{d.isLead ? 'Nothing else waits on you today.' : 'Close the day to roll anything new to tomorrow and keep your streak.'}</p>
          <div className="od-fm-acts">
            {!d.isLead && d.canWrite && <button type="button" className="od-btn pri" onClick={() => { onClose(); d.act.closeDay(); }}><Moon />Close my day</button>}
            <button type="button" className="od-btn" onClick={onClose}>Back to the desk</button>
          </div>
          <span className="inline-block mt-4"><Confetti /></span>
        </div>
      )}
    </div>
  );
}

/* ── Today, on one line ── */

const VISIT_ICON = { video: Video, call: Phone, in_person: MapPin } as const;

function TodayLine() {
  const d = useDesk();
  const now = useMinute();
  const t = todayTimeline(d.visits, Math.max(now, d.now));
  let placed = false;
  return (
    <section className="od-card od-c-5 od-lift od-rise" style={{ ['--d' as any]: 3 }}>
      <div className="od-ch">
        <span className="od-tile"><Calendar /></span>
        <div><h3>Today</h3><p>Meetings and visits, with the red line at now.</p></div>
        <div className="od-r"><span className="od-chip brand">{t.nextIn != null ? `Next in ${inLabel(t.nextIn)}` : 'Nothing left today'}</span></div>
      </div>
      {!t.rows.length ? (
        <div className="od-empty2">Nothing booked for today. <button type="button" className="od-link" onClick={() => d.act.go('visits')}>Meetings & visits</button></div>
      ) : (
        <div className="od-tl">
          {t.rows.map((r) => {
            const before = !placed && r.at > t.nowAt;
            if (before) placed = true;
            const Icon = VISIT_ICON[r.visit.mode] || MapPin;
            return (
              <React.Fragment key={r.visit.id}>
                {before && <div className="od-now"><span>{clockLabel(t.nowAt)}</span></div>}
                <div className={`od-ev ${r.past ? 'past' : ''}`}>
                  <span className="od-tm od-num">{clock12(r.visit.slot!.time).replace(/\s?[AP]M$/i, '')}</span>
                  <Icon />
                  <div className="min-w-0">
                    <b className="truncate">{r.visit.purpose || 'Meeting'} · {r.visit.projectName}</b>
                    <small>{r.visit.status === 'requested' || r.visit.status === 'rescheduled' ? 'Not confirmed yet' : r.visit.kind === 'site_visit' ? 'Site visit' : r.visit.kind === 'measurement' ? 'Measurement' : 'Meeting'}{r.visit.source === 'lead' ? ' · a lead' : ''}</small>
                  </div>
                  {r.visit.meetUrl && !r.past && <a className="od-btn sm pri" href={r.visit.meetUrl} target="_blank" rel="noopener noreferrer"><Video />Join Meet</a>}
                </div>
              </React.Fragment>
            );
          })}
          {!placed && <div className="od-now"><span>{clockLabel(t.nowAt)}</span></div>}
        </div>
      )}
    </section>
  );
}

/* ── The client pulse, as tiles ── */

function PulseTiles() {
  const d = useDesk();
  const rows = [...d.clients].sort((a, b) => a.score - b.score).slice(0, 8);
  return (
    <section className="od-card od-c-5 od-lift od-rise" style={{ ['--d' as any]: 4 }}>
      <div className="od-ch">
        <span className="od-tile"><Activity /></span>
        <div><h3>Client pulse</h3><p>Health out of 100, from replies, payments, visits and promises kept.</p></div>
        <div className="od-r"><button type="button" className="od-link" onClick={() => d.act.go('pulse')}>All →</button></div>
      </div>
      {!rows.length ? <div className="od-empty2">No clients yet.</div> : (
        <div className="od-pulse">
          {rows.map((c) => (
            <button key={c.id} type="button" className={`od-pt ${c.health}`} onClick={() => d.act.openClient(c.id)} title={c.nextWhy}>
              <b>{c.name}</b>
              <span className="od-sc"><strong className="od-num">{c.score}</strong><small>{HEALTH_LABEL[c.health]}</small></span>
              <ScoreBar score={c.score} tone={c.health} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Payments to chase ── */

function PaymentsCard() {
  const d = useDesk();
  const rows = d.waiting.filter((w) => w.kind === 'payment').sort(byLateness(d.now)).slice(0, 5);
  const tot = rows.reduce((s, w) => s + (w.amount || 0), 0);
  return (
    <section className="od-card od-c-6 od-lift od-rise" style={{ ['--d' as any]: 5 }}>
      <div className="od-ch">
        <span className="od-tile"><Wallet /></span>
        <div><h3>Payments to chase</h3><p>{d.seesMoney ? 'Due and late, oldest first, with amounts.' : 'What to chase and when. Amounts stay with the leads.'}</p></div>
        <div className="od-r"><button type="button" className="od-link" onClick={() => d.act.go('payments')}>All →</button></div>
      </div>
      {!rows.length ? <div className="od-empty2">Nothing to chase.</div> : (
        <>
          <div className="od-meter" aria-hidden>
            {rows.map((w) => {
              const s = payState(w, d.now);
              return <i key={w.key + w.projectId} style={{ flex: d.seesMoney && tot ? (w.amount || 0) / tot : 1, background: `var(--od-${s.state === 'late' ? 'bad' : s.days <= 7 ? 'warn' : 'good'}-dot)` }} />;
            })}
          </div>
          <div>
            {rows.map((w) => {
              const s = payState(w, d.now);
              return (
                <div key={w.key + w.projectId} className="od-prow">
                  <span className={`od-dot ${s.state === 'late' ? 'bad' : 'warn'}`} />
                  <div className="od-who"><b>{w.projectName}</b><small>{w.label}{w.reminders ? ` · ${w.reminders} reminder${w.reminders === 1 ? '' : 's'}` : ''}</small></div>
                  <span className={`od-chip ${s.state === 'late' ? 'bad' : 'warn'}`}>{s.state === 'late' ? `${s.days} days late` : s.days ? `Due in ${s.days} days` : 'Invoiced'}</span>
                  <Amt n={w.amount} />
                  {d.canWrite && <button type="button" className="od-btn sm" onClick={() => d.act.sendReminder(w, reminderText(d, w))}><MessageCircle />Remind</button>}
                </div>
              );
            })}
            {d.seesMoney && tot > 0 && <div className="od-prow justify-end"><small>Outstanding</small><span className="od-amt od-num">₹{tot.toLocaleString('en-IN')}</span></div>}
          </div>
        </>
      )}
    </section>
  );
}

/* ── The leads, at a glance ── */

function LeadsCard() {
  const d = useDesk();
  const mine = d.leads.filter((l) => d.isLead || l.ownerEmail === d.me.email);
  const stages = [...BOARD_STAGES, 'won' as const].map((id) => ({ id, label: LEAD_STAGES.find((s) => s.id === id)?.label || id, n: mine.filter((l) => l.stage === id).length }));
  const max = Math.max(1, ...stages.map((s) => s.n));
  const hot = mine.filter(leadIsOpen).map((l) => ({ l, h: leadHeat(l, d.now) })).sort((a, b) => (b.h?.score || 0) - (a.h?.score || 0)).slice(0, 3);
  return (
    <section className="od-card od-c-6 od-lift od-rise" style={{ ['--d' as any]: 6 }}>
      <div className="od-ch">
        <span className="od-tile"><UserPlus /></span>
        <div><h3>Leads</h3><p>The board, at a glance. Hot ones first.</p></div>
        <div className="od-r"><button type="button" className="od-link" onClick={() => d.act.go('leads')}>Open the board →</button></div>
      </div>
      <div className="od-funnel">
        {stages.map((s) => (
          <button key={s.id} type="button" className={`od-fs ${s.id === 'won' ? 'won' : ''}`} style={{ ['--w' as any]: `${(s.n / max) * 100}%` }} onClick={() => d.act.go('leads')}>
            <b className="od-num"><CountUp value={s.n} /></b><span>{s.label}</span>
          </button>
        ))}
      </div>
      {!hot.length ? <div className="od-empty2">No open leads. {d.canWrite && <button type="button" className="od-link" onClick={d.act.addLead}>Add a lead</button>}</div> : hot.map(({ l, h }) => {
        const p = mainPerson(l);
        return (
          <div key={l.id} className={`od-hot ${h?.heat === 'warm' ? 'w' : h?.heat === 'cold' ? 'c' : ''}`}>
            <div role="button" tabIndex={0} className="cursor-pointer" onClick={() => d.act.openLead(l.id)} onKeyDown={(e) => { if (e.key === 'Enter') d.act.openLead(l.id); }}>
              <b>{leadName(l)}</b><small>{[homeLine(l.home), sourceLabel(l.source), LEAD_STAGES.find((s) => s.id === l.stage)?.label].filter(Boolean).join(' · ')}</small>
            </div>
            {p?.phone && (
              <div className="od-r">
                <a className="od-btn sm" href={`tel:+${dialable(p.phone)}`} aria-label={`Call ${leadName(l)}`} onClick={() => d.act.openLead(l.id)}><Phone /></a>
                <a className="od-btn sm" href={waLink(p.phone, templateText(l.stage === 'new' ? 'intro' : 'checkin', l, { me: d.me.name, studio: d.studioName }))} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${leadName(l)}`}><MessageCircle /></a>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ── Who's on what: the Client Relations team, for the leads ── */

function TeamCard() {
  const d = useDesk();
  return (
    <section className="od-card od-c-5 od-lift od-rise" style={{ ['--d' as any]: 9 }}>
      <div className="od-ch">
        <span className="od-tile"><Users /></span>
        <div><h3>Who’s on what</h3><p>The Client Relations team today. Open a person’s day on The team.</p></div>
        <div className="od-r"><button type="button" className="od-link" onClick={() => d.act.go('team')}>The team →</button></div>
      </div>
      {d.teamRows.map((r, i) => (
        <div key={r.person.email} className="od-mate">
          <span className={`od-av ${i % 2 ? 'alt' : ''}`}>{initialsOf(r.person.name)}<i className={r.overdue ? 'busy' : ''} /></span>
          <div><b>{r.person.name}</b><small>{r.overdue ? `${r.overdue} overdue` : r.total - r.done ? `${r.total - r.done} open today` : 'All done today'} · {r.clients} client{r.clients === 1 ? '' : 's'}</small></div>
          <div className="od-load"><span className="od-num">{r.done}/{r.total} today</span><div className="od-mini"><i style={{ width: `${r.total ? Math.min(100, (r.done / r.total) * 100) : 0}%` }} /></div></div>
        </div>
      ))}
    </section>
  );
}

/* ── Client moments: small touches, with the message drafted ── */

const MOMENT_ICON = { handover_soon: Key, design_approved: PartyPopper, handover_month: Gift, handover_year: Star } as const;

function MomentsCard() {
  const d = useDesk();
  const [sent, setSent] = useState<string[]>([]);
  const list = d.moments.slice(0, 6);
  return (
    <section className="od-card od-c-7 od-lift od-rise" style={{ ['--d' as any]: 8 }}>
      <div className="od-ch">
        <span className="od-tile"><Gift /></span>
        <div><h3>Client moments</h3><p>Small touches the desk spots for you, with the message drafted. You check it, you send it.</p></div>
      </div>
      {!list.length ? <div className="od-empty2">Nothing to mark this week. Handovers, approved designs and anniversaries show up here.</div> : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {list.map((m) => {
            const Icon = MOMENT_ICON[m.kind];
            const done = sent.includes(m.id);
            const phone = d.clients.find((c) => c.id === m.projectId)?.phone || '';
            return (
              <div key={m.id} className={`rounded-2xl border border-slate-200 p-3 flex gap-2.5 items-start transition-opacity ${done ? 'opacity-50' : ''}`}>
                <span className={`od-tile !w-[34px] !h-[34px] ${m.kind === 'handover_soon' || m.kind === 'handover_year' ? '!bg-emerald-100 !text-emerald-700' : ''}`}><Icon /></span>
                <div className="min-w-0">
                  <b className="text-sm block">{m.title}</b>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">{m.body}</p>
                  {d.canWrite && !done && (
                    <div className="od-acts !mt-0">
                      <button type="button" className="od-btn sm pri" disabled={!dialable(phone)} title={dialable(phone) ? 'Opens WhatsApp with the message ready, and logs it' : 'No phone number on this client'}
                        onClick={() => { setSent((s) => [...s, m.id]); void d.act.sendMoment(m); }}><Send />{m.act}</button>
                      <button type="button" className="od-btn sm ghost" onClick={() => { setSent((s) => [...s, m.id]); d.act.doneMoment(m); }}><Check />Done</button>
                    </div>
                  )}
                  {done && <span className="od-chip good"><Check />Done</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
