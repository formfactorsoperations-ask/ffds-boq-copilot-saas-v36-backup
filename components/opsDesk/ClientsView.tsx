import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Phone, MessageCircle, Mail, CalendarCheck, Plus, FolderOpen, Clock, Wallet, Activity, Layers, Key, LayoutGrid, FileCheck2, Check,
  Flag, FileText, ListChecks, Target, Users, IndianRupee, ArrowRight, Pen,
} from '@/lib/lucide-shim';
import { CountUp } from '../ui/HudBits';
import { dayKey, daysBetween, decisionKey, paymentKey } from '../../lib/opsDesk';
import { logLine } from '../../lib/opsTeam';
import { clientPeople } from '../../lib/clientContacts';
import { clock12 } from '../../lib/peopleDesk';
import { approvalStage, approvalAt, sheetLine, type ApprovalItem } from '../../lib/designMeeting';
import { PHASES, HEALTH_LABEL, matchesClient, runwayOf, APPROVAL_LABEL, shortDate, payState, type ClientFilter } from '../../lib/opsDesk2';
import { useDesk, fmtDay, fmtWhen, dialable, waLink, type DeskClient } from './DeskBits';
import { ClientWall } from './ClientWall';
import { wallItem, briefOf } from './MyDay';
import { reminderText } from './TodayView';
import { RingSvg, SeeAs, Amt, Fan, Countdown, ScoreBar } from './Od2Bits';

/*
  CLIENTS (Ops Desk 2.1). Every client on the desk on the wall or in a grid,
  how they feel, the handovers coming and what they owe us; and one client's
  page: progress, health and handover in rings, the journey from proposal to
  handover, and the story of the project as one river of events, with its
  drawings, decisions and payments. Amounts show only for the roles that see
  the studio's money.
*/

const FILTERS: { id: ClientFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'attention', label: 'Needs you' }, { id: 'handover', label: 'Near handover' }, { id: 'design', label: 'In design' }, { id: 'site', label: 'On site' },
];

export function ClientsScreen() {
  const d = useDesk();
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [view, setView] = useState<'wall' | 'grid'>(() => { try { return (localStorage.getItem('opsDesk.clientView') as any) || 'wall'; } catch { return 'wall'; } });
  const pickView = (v: 'wall' | 'grid') => { setView(v); try { localStorage.setItem('opsDesk.clientView', v); } catch { /* private window */ } };
  const all = d.clients;
  const shown = all.filter((c) => matchesClient(c, filter));
  const counts = { good: all.filter((c) => c.health === 'good').length, warn: all.filter((c) => c.health === 'warn').length, bad: all.filter((c) => c.health === 'bad').length };
  const soon = all.filter((c) => !c.phase.complete && c.handoverDays != null && c.handoverDays >= 0 && c.handoverDays <= 40).sort((a, b) => (a.handoverDays || 0) - (b.handoverDays || 0));
  const waiting = d.waiting.length + (d.approvals || []).filter((i) => ['sent', 'overdue'].includes(approvalStage({ approval: i.approval, confirmation: i.confirmation as any }, d.now)) && d.clients.some((c) => c.id === i.projectId)).length;
  const title = d.isLead ? 'Every project on the desk' : 'Your clients';
  const sub = d.isLead ? 'Every owner’s projects. Tap a card to open the client.' : 'The projects assigned to you. Tap a card for everything you may see of it.';
  const filterLabels = FILTERS.map((f) => ({ id: f.id, label: f.id === 'all' ? `All ${all.length}` : f.label }));
  const toggle = <button type="button" className="od-ib" aria-label={view === 'wall' ? 'Show as a grid' : 'Show as the wall'} onClick={() => pickView(view === 'wall' ? 'grid' : 'wall')}>{view === 'wall' ? <LayoutGrid /> : <Layers />}</button>;

  return (
    <div className="flex flex-col gap-5">
      {view === 'wall' ? (
        <ClientWall tall title={title} sub={sub} items={shown.map(wallItem)} filters={filterLabels} filter={filter} onFilter={(f) => setFilter(f as ClientFilter)} onOpen={d.act.openClient} right={toggle} />
      ) : (
        <section className="od-band od-rise">
          <div className="od-band-h">
            <div className="min-w-0"><span className="od-eyebrow">Clients</span><h2>{title}</h2><p>{sub}</p></div>
            <div className="od-r">
              <div className="od-filters" role="group" aria-label="Show">{filterLabels.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
              {toggle}
            </div>
          </div>
          {shown.length ? (
            <div className="od-cgrid">
              {shown.map((c, i) => (
                <button key={c.id} type="button" className="od-gcard od-glass od-in" style={{ ['--i' as any]: i }} onClick={() => d.act.openClient(c.id)}>
                  <RingSvg p={c.progress / 100} size={56} stroke={6} tone={c.health}><b className="od-num">{c.progress}%</b></RingSvg>
                  <span className="od-gc-b">
                    <span className="od-eyebrow">{c.phase.line}</span>
                    <b>{c.name}</b>
                    <small>{[c.client, c.line].filter(Boolean).join(' · ')}</small>
                    <span className={`od-chip ${c.health}`}>{HEALTH_LABEL[c.health]} · {c.score}</span>
                  </span>
                  <small className="col-span-2 text-xs text-slate-600 truncate">{c.next}</small>
                </button>
              ))}
            </div>
          ) : <div className="px-5 pb-5"><div className="od-empty2">No clients here.</div></div>}
        </section>
      )}
      <SeeAs />
      <div className="od-thirds">
        <section className="od-card od-rise" style={{ ['--d' as any]: 2 }}>
          <div className="od-ch"><span className="od-tile"><Activity /></span><div><h3>How they feel</h3><p>Health of your clients today</p></div></div>
          <div className="od-hbar">
            {(['good', 'warn', 'bad'] as const).map((k) => counts[k] ? <i key={k} style={{ flex: counts[k], background: `var(--od-${k}-dot)` }} /> : null)}
          </div>
          <div className="od-hleg"><span><b className="od-num">{counts.good}</b>happy</span><span><b className="od-num">{counts.warn}</b>watching</span><span><b className="od-num">{counts.bad}</b>at risk</span></div>
          <button type="button" className="od-link mt-3" onClick={() => d.act.go('pulse')}>Open Client pulse →</button>
        </section>
        <section className="od-card od-rise" style={{ ['--d' as any]: 3 }}>
          <div className="od-ch"><span className="od-tile"><Key /></span><div><h3>Handovers coming</h3><p>In the next 40 days</p></div></div>
          {!soon.length ? <div className="od-empty2">No handover in the next 40 days.</div> : soon.slice(0, 5).map((c) => (
            <button key={c.id} type="button" className="od-mini-row" onClick={() => d.act.openClient(c.id)}>
              <span className="od-cd !flex-none od-num">{c.handoverDays}<small>days</small></span>
              <span><b>{c.name}</b><small>{c.client} · {shortDate(c.handoverKey, d.now)}</small></span>
            </button>
          ))}
        </section>
        <section className="od-card od-rise" style={{ ['--d' as any]: 4 }}>
          <div className="od-ch"><span className="od-tile"><Clock /></span><div><h3>Waiting on clients</h3><p>Payments, decisions and drawings they owe</p></div></div>
          <p className="od-bign od-num"><CountUp value={waiting} /></p>
          <button type="button" className="od-btn sm" onClick={() => d.act.go('waiting')}>See what is waiting <ArrowRight /></button>
        </section>
      </div>
    </div>
  );
}

/* ── One client ──────────────────────────────────────────────────────────── */

type Tab = 'story' | 'drawings' | 'decisions' | 'payments';
type StoryFilter = 'all' | 'touches' | 'drawings' | 'decisions' | 'money' | 'meetings';
interface Ev { at: number; f: StoryFilter; icon: React.ComponentType<any>; tone: 'brand' | 'good' | 'warn' | 'bad'; title: string; sub: string; next?: { text: string; done: boolean }; amount?: number | null }

const WAITING_DEC = new Set(['notified', 'drawing_pending', 'drawing_sent']);
const toMs = (v: any): number | null => {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};
const decText = (x: any) => String(x?.decisionText || x?.title || 'Decision').trim();

export function ClientPage({ id }: { id: string }) {
  const d = useDesk();
  const c = d.clients.find((x) => x.id === id) || null;
  const p = d.projects.find((x) => x.id === id) || null;
  const [tab, setTab] = useState<Tab>('story');
  const [sf, setSf] = useState<StoryFilter>('all');
  if (!c || !p) {
    return (
      <div className="od-lockbox"><Layers /><b>This client is not on your desk</b><span>{d.isLead ? 'Choose another set of projects at the top.' : 'Ask a lead to assign it to you in Studio settings → Team.'}</span>
        <button type="button" className="od-btn sm" onClick={() => d.act.go('clients')}>Back to clients</button></div>
    );
  }
  const ctx = p.raw?.context || {};
  const people = clientPeople(ctx);
  const main = people[0];
  const today = dayKey(d.now);
  const logs = d.followUps.filter((f) => f.projectId === id).sort((a, b) => b.at - a.at);
  const lastAt = logs[0]?.at || null;
  const nextVisit = d.visits.filter((v) => v.projectId === id && v.slot?.date && v.slot.date >= today && v.status !== 'cancelled' && v.status !== 'done')
    .sort((a, b) => `${a.slot!.date}${a.slot!.time}`.localeCompare(`${b.slot!.date}${b.slot!.time}`))[0];
  const draws = (d.approvals || []).filter((i) => i.projectId === id);
  const decs = d.decisions[id] || [];
  const waitingHere = d.waiting.filter((w) => w.projectId === id);
  const ms = p.money?.milestones || [];
  const nextPay = ms.find((m) => m.status !== 'paid');
  const owesCount = waitingHere.length + draws.filter((i) => ['sent', 'overdue'].includes(approvalStage({ approval: i.approval, confirmation: i.confirmation as any }, d.now))).length;
  const worst = c.pulse.reasons.filter((r) => r.points < 0).sort((a, b) => a.points - b.points)[0];
  const names = people.slice(0, 2).map((x) => x.name).filter(Boolean).join(' & ') || c.client || 'The client';

  const tabs: [Tab, string, number][] = [['story', 'Story', 0], ['drawings', 'Drawings', draws.length], ['decisions', 'Decisions', decs.length], ['payments', 'Payments', ms.length]];

  return (
    <div className="flex flex-col gap-5">
      <section className="od-band od-c3 od-rise">
        <div className="od-c3-top">
          <button type="button" className="od-back" onClick={() => d.act.go('clients')}><ChevronLeft />All clients</button>
          <span className={`od-chip ${c.health}`}>{HEALTH_LABEL[c.health]}</span>
        </div>
        <div className="od-c3-g">
          <div className="od-c3-l min-w-0">
            <span className="od-eyebrow">{[c.phase.line, c.line].filter(Boolean).join(' · ')}</span>
            <h2>{c.name}</h2>
            <p>{names}{main?.phone ? <> · <span className="od-num">{main.phone}</span></> : null}</p>
            <div className="od-acts">
              {main?.phone && <a className="od-btn sm od-bandbtn" href={`tel:+${dialable(main.phone)}`} onClick={() => d.canWrite && d.act.log({ projectId: id, channel: 'call' })}><Phone />Call</a>}
              {main?.phone && <a className="od-btn sm od-bandbtn" href={waLink(main.phone, `Hi ${main.name || ''},`)} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
              {main?.email && <a className="od-btn sm od-bandbtn" href={`mailto:${people.map((x) => x.email).filter(Boolean).join(',')}`}><Mail />Email</a>}
              {d.canWrite && <button type="button" className="od-btn sm od-bandbtn" onClick={() => d.act.log({ projectId: id })}><Plus />Log</button>}
              {d.canWrite && <button type="button" className="od-btn sm od-bandbtn" onClick={() => d.act.bookVisit(id)}><CalendarCheck />Book a meeting</button>}
              <button type="button" className="od-btn sm od-bandbtn" onClick={() => d.act.openProject(id)}><FolderOpen />Open project</button>
            </div>
          </div>
          <div className="od-c3-r">
            <div className="od-c3-stat od-glass"><RingSvg p={c.progress / 100} size={96} stroke={9} tone={c.health}><b className="od-num">{c.progress}%</b><small>done</small></RingSvg></div>
            <div className="od-c3-stat od-glass"><span className="od-eyebrow">Health</span><b className="od-big od-num"><CountUp value={c.score} /></b><ScoreBar score={c.score} tone={c.health} /></div>
            <div className="od-c3-stat od-glass"><span className="od-eyebrow">Handover</span><b className="od-big od-num">{c.phase.complete ? <Check className="w-7 h-7 text-emerald-600" /> : c.handoverDays != null ? <>{c.handoverDays < 0 ? <span className="text-rose-700">{-c.handoverDays}</span> : <CountUp value={c.handoverDays} />}<small>{c.handoverDays < 0 ? 'd late' : 'd'}</small></> : '—'}</b><small className="od-eyebrow">{c.phase.complete ? 'Handed over' : shortDate(c.handoverKey, d.now)}</small></div>
          </div>
        </div>
        <div className="od-journey" aria-label={`Journey: ${c.phase.name}`}>
          {PHASES.map((s, i) => <span key={s} className={`od-jn ${c.phase.complete || i < c.phase.index ? 'd' : i === c.phase.index ? 'c' : ''}`}><i />{s}</span>)}
        </div>
        <div className="od-c3-chips">
          <span className="od-gchip od-glass"><Clock />{owesCount} waiting on {c.client || 'the client'}</span>
          <span className="od-gchip od-glass"><Wallet />{nextPay ? `${nextPay.name}${nextPay.invoiceNumber ? ` · ${nextPay.invoiceNumber}` : ''} · ${nextPay.status}` : ms.length ? 'Every milestone paid' : 'No payment schedule yet'}</span>
          <span className="od-gchip od-glass"><Activity />{worst ? worst.label : 'On track'}</span>
          <span className="od-gchip od-glass"><MessageCircle />{lastAt ? (daysBetween(lastAt, d.now) ? `Last spoke ${daysBetween(lastAt, d.now)} days ago` : 'Spoke today') : 'Nothing logged yet'}</span>
          {nextVisit && <span className="od-gchip od-glass"><CalendarCheck />{new Date(`${nextVisit.slot!.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} {clock12(nextVisit.slot!.time)} · {nextVisit.purpose || 'Meeting'}</span>}
        </div>
      </section>
      <SeeAs />
      <div className="od-ptabs" role="group" aria-label="Client">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {tab === k && <motion.span layoutId="od-ptab" className="od-ind" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
            <span>{l}{n ? ` · ${n}` : ''}</span>
          </button>
        ))}
      </div>
      <div key={tab} className="od-rise">
        {tab === 'story' && <Story c={c} sf={sf} setSf={setSf} />}
        {tab === 'drawings' && <Drawings items={draws} />}
        {tab === 'decisions' && <Decisions projectId={id} decs={decs} client={c.client} />}
        {tab === 'payments' && <Payments projectId={id} />}
      </div>
      {people.length > 1 && <p className="text-[11px] text-slate-500">On the client’s side: {people.map((x) => `${x.name}${x.role ? ` (${x.role})` : x.main ? ' (main)' : ''}`).join(' · ')}</p>}
    </div>
  );
}

function Story({ c, sf, setSf }: { c: DeskClient; sf: StoryFilter; setSf: (s: StoryFilter) => void }) {
  const d = useDesk();
  const id = c.id;
  const p = d.projects.find((x) => x.id === id)!;
  const events = useMemo<Ev[]>(() => {
    const ev: Ev[] = [];
    d.followUps.filter((f) => f.projectId === id).forEach((f) => ev.push({
      at: f.at, f: 'touches', icon: f.channel === 'call' ? Phone : f.channel === 'email' ? Mail : f.channel === 'meeting' ? Users : MessageCircle,
      tone: f.outcome === 'replied' || f.outcome === 'promised' ? 'good' : f.outcome === 'no_answer' || f.outcome === 'reminded' ? 'warn' : 'brand',
      title: logLine(f), sub: `${f.byName || f.by} · ${fmtWhen(f.at)}${f.note ? ` · ${f.note.split('\n')[0].slice(0, 120)}` : ''}`,
      next: f.next ? { text: `${f.next.text} · ${f.next.ownerName} · ${fmtDay(f.next.due)}`, done: f.nextDone } : undefined,
    }));
    d.escalations.filter((e) => e.projectId === id).forEach((e) => ev.push({
      at: e.raisedAt, f: 'touches', icon: Flag, tone: e.status === 'open' ? 'bad' : 'good',
      title: `Escalation: ${e.title}`, sub: `${e.auto ? 'Raised by the daily check' : `Raised by ${e.raisedByName || e.raisedBy}`} · ${fmtWhen(e.raisedAt)}${e.status === 'decided' || e.status === 'closed' ? ` · decided${e.decision ? `: ${e.decision}` : ''}` : ''}`,
    }));
    d.moms.filter((m) => m.projectId === id && m.meetingDate).forEach((m) => ev.push({
      at: m.meetingDate as number, f: 'meetings', icon: FileText, tone: m.status === 'pending_review' || m.status === 'draft' ? 'warn' : 'good',
      title: `Minutes${m.momRef ? ` ${m.momRef}` : ''}: ${m.meetingTitle || 'Meeting'}`, sub: `${m.status === 'pending_review' ? 'Awaiting approval' : m.status === 'draft' ? 'Draft' : m.status.replace(/_/g, ' ')} · ${fmtDay(dayKey(m.meetingDate as number))}`,
    }));
    d.visits.filter((v) => v.projectId === id && v.slot?.date).forEach((v) => ev.push({
      at: new Date(`${v.slot!.date}T${v.slot!.time || '12:00'}:00+05:30`).getTime() || v.createdAt, f: 'meetings', icon: CalendarCheck,
      tone: v.status === 'done' ? 'good' : v.status === 'cancelled' ? 'bad' : v.status === 'confirmed' ? 'brand' : 'warn',
      title: v.purpose || 'Meeting', sub: `${v.status === 'requested' ? 'Asked for' : v.status.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase())} · ${fmtDay(v.slot!.date)} ${clock12(v.slot!.time)}`,
    }));
    (d.approvals || []).filter((i) => i.projectId === id).forEach((i) => {
      const st = approvalStage({ approval: i.approval, confirmation: i.confirmation as any }, d.now);
      ev.push({
        at: approvalAt({ approval: i.approval, confirmation: i.confirmation as any }) || i.approval?.sentAt || i.closedAt, f: 'drawings', icon: FileCheck2,
        tone: st === 'approved' ? 'good' : st === 'overdue' || st === 'changes' ? 'bad' : 'warn',
        title: `${i.sheets.length} drawing${i.sheets.length === 1 ? '' : 's'} · ${APPROVAL_LABEL[st].toLowerCase()}`, sub: i.sheets.slice(0, 3).map((s) => sheetLine(s.room, s.name)).join(' · '),
      });
    });
    (d.decisions[id] || []).forEach((x) => ev.push({
      at: toMs(x.signoffRequestSentAt) ?? toMs(x.notifiedAt) ?? toMs(x.createdAt) ?? 0, f: 'decisions', icon: Check,
      tone: WAITING_DEC.has(String(x.status)) ? 'warn' : 'good', title: decText(x), sub: `${WAITING_DEC.has(String(x.status)) ? 'Waiting on the client' : String(x.status || 'agreed').replace(/_/g, ' ')}${x.roomName ? ` · ${x.roomName}` : ''}`,
    }));
    (p.money?.milestones || []).filter((m) => m.status === 'paid' || m.status === 'invoiced').forEach((m) => {
      const w = d.waiting.find((x) => x.projectId === id && x.key === paymentKey(m.id));
      ev.push({
        at: toMs(m.invoiceDate) ?? toMs(m.date) ?? 0, f: 'money', icon: IndianRupee, tone: m.status === 'paid' ? 'good' : w?.overdueDays ? 'bad' : 'warn',
        title: `${m.name} · ${m.status === 'paid' ? 'paid' : w?.overdueDays ? `${w.overdueDays} days late` : 'invoiced'}`, sub: [m.invoiceNumber, m.invoiceDate ? fmtDay(String(m.invoiceDate).slice(0, 10)) : ''].filter(Boolean).join(' · '),
        amount: m.owed,
      });
    });
    return ev.filter((e) => e.at).sort((a, b) => b.at - a.at);
  }, [d, id, p]);
  const shown = events.filter((e) => sf === 'all' || e.f === sf).slice(0, 60);
  const b = c.nextItem ? briefOf(d, c.nextItem) : null;
  const open = d.queue.filter((q) => q.projectId === id);

  return (
    <div className="od-two">
      <section className="od-card">
        <div className="od-ch">
          <span className="od-tile"><Layers /></span>
          <div><h3>The story so far</h3><p>Everything that happened on {c.name}, newest first.</p></div>
          <div className="od-r od-filters" role="group" aria-label="Show">
            {([['all', 'All'], ['touches', 'Calls & messages'], ['meetings', 'Meetings'], ['drawings', 'Drawings'], ['decisions', 'Decisions'], ['money', 'Money']] as [StoryFilter, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={sf === k} onClick={() => setSf(k)}>{l}</button>
            ))}
          </div>
        </div>
        {!shown.length ? <div className="od-empty2">Nothing here yet.</div> : (
          <div className="od-river">
            {shown.map((e, i) => {
              const Icon = e.icon;
              return (
                <div key={`${e.at}${i}`} className={`od-rv od-in ${e.tone}`} style={{ ['--i' as any]: Math.min(i, 12) }}>
                  <span className="od-rv-ic"><Icon /></span>
                  <div className="od-rv-b"><b>{e.title}</b><small>{e.sub}</small>{e.next && <span className={`od-next ${e.next.done ? 'done' : ''}`}><Target />Next: {e.next.text}</span>}</div>
                  {e.f === 'money' && e.amount != null && <Amt n={e.amount} />}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <div className="od-stack-col">
        <section className="od-card od-focus-card od-tilt">
          <span className="od-eyebrow">Next step</span>
          <h4>{c.next}</h4>
          <p className="text-xs text-slate-500">{c.nextWhy}</p>
          {b && d.canWrite && (
            <div className="od-acts">
              <button type="button" className="od-btn pri" onClick={b.primary.run}><b.primary.icon />{b.primary.label}</button>
              {b.whatsapp && <button type="button" className="od-btn" onClick={b.whatsapp}><MessageCircle />WhatsApp it</button>}
              <button type="button" className="od-btn" onClick={() => d.act.later(b.q)}><Clock />Later today</button>
            </div>
          )}
        </section>
        <section className="od-card">
          <div className="od-ch"><span className="od-tile"><ListChecks /></span><div><h3>Open with this client</h3><p>{open.length ? `${open.length} on the desk` : 'Nothing open. A good moment to check in.'}</p></div></div>
          {open.slice(0, 8).map((q) => (
            <button key={q.id} type="button" className="od-mini-row" onClick={() => d.act.openItem(q)}>
              <span className={`od-dot ${q.group === 'overdue' ? 'bad' : q.group === 'today' ? 'warn' : 'good'}`} />
              <span><b>{q.title}</b><small>{q.detail}</small></span>
            </button>
          ))}
        </section>
        <section className="od-card">
          <div className="od-ch"><span className="od-tile"><Activity /></span><div><h3>Health · {c.score}</h3><p>Every point it gained or lost</p></div></div>
          <div className="od-pts">
            {c.pulse.reasons.length ? c.pulse.reasons.map((r, i) => (
              <span key={i} className={`od-pt2 ${r.points > 0 ? 'up' : 'down'}`}><b className="od-num">{r.points > 0 ? '+' : '−'}{Math.abs(r.points)}</b>{r.label}</span>
            )) : <span className="od-pt2">Nothing logged yet moves it; it starts at 80.</span>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Drawings({ items }: { items: ApprovalItem[] }) {
  const d = useDesk();
  if (d.approvals === null) return <div className="od-lockbox"><FileCheck2 /><b>Drawings for approval are with operations and the leads</b></div>;
  return (
    <section className="od-card">
      <div className="od-ch"><span className="od-tile"><FileCheck2 /></span><div><h3>Drawings for approval</h3><p>Only the client’s written yes, or the Design Head taking it as approved, counts.</p></div>
        <div className="od-r"><button type="button" className="od-btn sm" onClick={() => d.act.go('approvals')}><FileCheck2 />Open approvals</button></div></div>
      {!items.length ? <div className="od-empty2">No drawings shown to the client yet.</div> : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {items.map((i) => {
            const st = approvalStage({ approval: i.approval, confirmation: i.confirmation as any }, d.now);
            const r = runwayOf(st, i.approval, d.now);
            return (
              <div key={i.meetingId} className="od-apcard od-tilt flex items-center gap-3" data-stage={st}>
                <Fan n={i.sheets.length} />
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <span className={`od-chip self-start ${st === 'approved' ? 'good' : st === 'overdue' || st === 'changes' ? 'bad' : st === 'sent' ? 'warn' : 'brand'}`}>{APPROVAL_LABEL[st]}</span>
                  <b className="text-sm truncate">{i.sheets.length} sheet{i.sheets.length === 1 ? '' : 's'} · {i.outside ? 'shown outside' : 'design meeting'}</b>
                  <small className="text-[11px] text-slate-500 truncate">{i.sheets.map((s) => sheetLine(s.room, s.name)).join(' · ')}</small>
                </div>
                {r && <Countdown r={r} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Decisions({ projectId, decs, client }: { projectId: string; decs: any[]; client: string }) {
  const d = useDesk();
  const list = [...decs].sort((a, b) => Number(WAITING_DEC.has(String(b.status))) - Number(WAITING_DEC.has(String(a.status))));
  return (
    <section className="od-card">
      <div className="od-ch"><span className="od-tile"><Check /></span><div><h3>Decisions</h3><p>What was agreed, and what {client || 'the client'} still owes.</p></div></div>
      {!list.length ? <div className="od-empty2">No decisions on this project yet.</div> : list.map((x) => {
        const open = WAITING_DEC.has(String(x.status));
        const w = d.waiting.find((y) => y.projectId === projectId && y.key === decisionKey(String(x.id)));
        return (
          <div key={x.id} className={`od-dec ${open ? 'open' : ''}`}>
            <span className={`od-dot ${open ? 'warn' : 'good'}`} />
            <div className="od-who"><b>{decText(x)}</b><small>{[x.roomName, open ? (w ? `waiting ${w.days} day${w.days === 1 ? '' : 's'}` : 'waiting on the client') : String(x.status || 'agreed').replace(/_/g, ' ')].filter(Boolean).join(' · ')}</small></div>
            {open && d.canWrite ? (
              w ? <button type="button" className="od-btn sm" onClick={() => d.act.sendReminder(w, reminderText(d, w))}><MessageCircle />Nudge</button>
                : <button type="button" className="od-btn sm" onClick={() => d.act.log({ projectId, subjectKey: decisionKey(String(x.id)) })}><Pen />Log</button>
            ) : !open ? <span className="od-chip good">Agreed</span> : null}
          </div>
        );
      })}
    </section>
  );
}

function Payments({ projectId }: { projectId: string }) {
  const d = useDesk();
  const p = d.projects.find((x) => x.id === projectId)!;
  const ms = p.money?.milestones || [];
  const shown = d.seesMoney && p.money && !p.money.amountsHidden;
  const outstanding = shown ? ms.filter((m) => m.status !== 'paid').reduce((s, m) => s + (m.owed || 0), 0) : 0;
  return (
    <section className="od-card">
      <div className="od-ch"><span className="od-tile"><Wallet /></span>
        <div><h3>Payment journey</h3><p>{shown ? 'Every milestone, with amounts.' : 'Name, status, invoice and date: enough to chase. Amounts are with the leads.'}</p></div>
        {shown && ms.length > 0 && <div className="od-r flex-col !items-end"><span className="od-eyebrow">Outstanding</span><b className="od-bigamt od-num">₹{outstanding.toLocaleString('en-IN')}</b></div>}
      </div>
      {!ms.length ? <div className="od-empty2">No payment schedule on this project yet.</div> : (
        <div className="od-pj">
          {ms.map((m) => {
            const w = d.waiting.find((x) => x.projectId === projectId && x.key === paymentKey(m.id));
            const s = w ? payState(w, d.now) : null;
            const st = m.status === 'paid' ? 'paid' : s?.state === 'late' ? 'late' : m.status === 'invoiced' ? 'due' : '';
            return (
              <div key={m.id} className={`od-pjn ${st}`}>
                <span className="od-pjd">{st === 'paid' ? <Check /> : st === 'late' ? '!' : ''}</span>
                <b>{m.name}</b>
                <small>{m.invoiceNumber || 'Not invoiced'} · {m.status === 'paid' ? 'Paid' : s?.state === 'late' ? `${s.days} days late` : m.status === 'invoiced' ? (w?.dueKey ? `Due ${fmtDay(w.dueKey)}` : 'Invoiced') : m.date ? fmtDay(String(m.date).slice(0, 10)) : 'Later'}</small>
                <Amt n={m.owed} />
                {w && d.canWrite && <button type="button" className="od-btn sm" onClick={() => d.act.sendReminder(w, reminderText(d, w))}><MessageCircle />Remind</button>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
