import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock, Wallet, Check, MessageCircle, Flag, FileCheck2, Phone, Mail, Users, Plus, Star, Pen, FileText, Calendar, Target, X,
  Eye, UserPlus, Activity, ListChecks, Loader2,
} from '@/lib/lucide-shim';
import { ToastHost } from '../drawingReview/ui';
import ClientApproval from '../drawingReview/ClientApproval';
import { dayKey, daysBetween, addDays, inr, type WaitingItem, type Escalation } from '../../lib/opsDesk';
import { approvalStage, sheetLine, type ApprovalItem, type ApprovalStage } from '../../lib/designMeeting';
import { leadName, homeLine, mainPerson, isOpen as leadIsOpen, leadStats, sourceLabel, type Lead } from '../../lib/leads';
import { leadHeat, templateText } from '../../lib/leadSmart';
import { saveLead, withTouch } from '../../services/leadsService';
import { logFollowUp } from '../../services/opsDeskService';
import '../projectHeader/projectHeader.css';
import { clock12 } from '../../lib/peopleDesk';
import { payAgeing, payState, byLateness, runwayOf, APPROVAL_LABEL, HEALTH_LABEL } from '../../lib/opsDesk2';
import type { AskKind, VisitRequest } from '../../lib/clientCare';
import type { OpsMom } from '../../services/opsDeskService';
import { useDesk, fmtDay, fmtWhen, dialable, waLink } from './DeskBits';
import { reminderText } from './TodayView';
import { asMeeting, PresentedOutside } from './DrawingApprovals';
import { Band, Tiles, SeeAs, Amt, Fan, Countdown, RingSvg, type TileSpec } from './Od2Bits';

/*
  OPS DESK 2.1: every section of the desk in the approved look. Each screen
  opens on a band with its figures, then its cards. Everything reads the
  records the desk already keeps, so old and new records sit side by side,
  each in the column its status puts it in. The panels and sheets that save
  (log a follow-up, decide, review minutes, book a visit) are the desk's own.
*/

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ago = (at: number, now: number) => { const n = daysBetween(at, now); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };

/* ── Waiting on client ── */

type WaitFilter = 'all' | 'payment' | 'decision' | 'drawing';
interface WaitRow { key: string; kind: 'payment' | 'decision' | 'drawing'; projectId: string; projectName: string; label: string; days: number; late: number; chased: string; reminders: number; slip: number; amount?: number; w?: WaitingItem; item?: ApprovalItem }

export function WaitingScreen({ slipOf }: { slipOf: (w: WaitingItem) => number }) {
  const d = useDesk();
  const [f, setF] = useState<WaitFilter>('all');
  const rows: WaitRow[] = useMemo(() => {
    const out: WaitRow[] = d.waiting.map((w) => ({
      key: `${w.projectId}:${w.key}`, kind: w.kind, projectId: w.projectId, projectName: w.projectName, label: w.label, days: w.days, late: w.overdueDays || 0,
      chased: w.lastChaseAt ? `Last chased ${fmtWhen(w.lastChaseAt)} · ${plural(w.reminders, 'reminder')}` : 'Not chased yet', reminders: w.reminders, slip: slipOf(w), amount: w.amount, w,
    }));
    const ids = new Set(d.projects.map((p) => p.id));
    (d.approvals || []).filter((i) => ids.has(i.projectId)).forEach((i) => {
      const st = approvalStage({ approval: i.approval, confirmation: i.confirmation as any }, d.now);
      if (st !== 'sent' && st !== 'overdue') return;
      const r = runwayOf(st, i.approval, d.now);
      out.push({
        key: `ap:${i.meetingId}`, kind: 'drawing', projectId: i.projectId, projectName: i.projectName, label: `Approval: ${plural(i.sheets.length, 'drawing')}`,
        days: r?.day || 0, late: 0, chased: `${plural(r?.reminders || 0, 'reminder')} sent`, reminders: r?.reminders || 0, slip: st === 'overdue' ? Math.max(0, (r?.day || 5) - 5) : 0, item: i,
      });
    });
    return out.sort((a, b) => b.days - a.days);
  }, [d, slipOf]);
  const list = rows.filter((r) => f === 'all' || r.kind === f);
  const max = Math.max(10, ...rows.map((r) => r.days));
  const client = (id: string) => d.clients.find((c) => c.id === id)?.client || '';

  return (
    <>
      <Band eyebrow="Waiting on client" title="What the studio is waiting for" sub="Every payment, decision and approval the client owes, how long it has waited, when it was last chased, and how far it can push the handover.">
        <Tiles tiles={[
          { count: rows.length, title: 'Waiting', sub: d.isLead ? 'Across the desk' : 'Across your clients' },
          { count: rows.length ? Math.max(...rows.map((r) => r.days)) : 0, unit: 'd', title: 'Oldest', sub: 'Days waited' },
          { count: rows.filter((r) => r.slip).length, title: 'Pushing handover', sub: 'Each one adds days', alarm: rows.some((r) => r.slip >= 7) },
        ]} />
      </Band>
      <SeeAs />
      <div className="od-card od-toolbar">
        <div className="od-filters" role="group" aria-label="Show">
          {([['all', `All ${rows.length}`], ['payment', 'Payments'], ['decision', 'Decisions'], ['drawing', 'Approvals']] as [WaitFilter, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}
        </div>
        <span className="od-mut od-small">Oldest first. Remind opens WhatsApp with the right message and logs it.</span>
      </div>
      <div className="od-wlist">
        {!list.length ? <div className="od-lockbox"><Check /><b>Nothing is waiting on a client</b></div> : list.map((r, i) => {
          const tone = r.late || r.days >= 7 ? 'bad' : r.days >= 3 ? 'warn' : 'good';
          const Icon = r.kind === 'payment' ? Wallet : r.kind === 'drawing' ? FileCheck2 : Check;
          return (
            <div key={r.key} className={`od-wcard od-tilt od-in ${tone}`} style={{ ['--i' as any]: Math.min(i, 12) }}>
              <span className="od-wic"><Icon /></span>
              <div className="od-who">
                <b>{r.kind === 'payment' ? 'Payment' : r.kind === 'drawing' ? 'Drawing' : 'Decision'}: {r.label}</b>
                <small><button type="button" className="od-link" onClick={() => d.act.openClient(r.projectId)}>{r.projectName}</button>{client(r.projectId) ? ` · ${client(r.projectId)}` : ''}{r.late ? ` · ${r.late} days late` : ''}</small>
                <div className="od-wbar"><i style={{ width: `${Math.max(3, Math.min(100, (r.days / max) * 100))}%` }} /><span className="od-num">{plural(r.days, r.kind === 'drawing' ? 'working day' : 'day')}</span></div>
                <small>{r.chased}</small>
              </div>
              {r.kind === 'payment' && <Amt n={r.amount} />}
              {r.slip > 0 && <span className={`od-chip ${r.slip >= 7 ? 'bad' : 'warn'}`} title="An estimate: a late payment holds the next stage by the days it is late; a decision, by the days past a three-day grace period.">Handover +{r.slip}d</span>}
              {d.canWrite && (
                <div className="od-acts">
                  {r.w ? <button type="button" className="od-btn sm pri" onClick={() => d.act.sendReminder(r.w!, reminderText(d, r.w!))}><MessageCircle />Remind</button>
                    : <button type="button" className="od-btn sm pri" onClick={() => d.act.go('approvals')}><FileCheck2 />Open approval</button>}
                  {r.w && <button type="button" className="od-btn sm" onClick={() => d.act.log({ projectId: r.projectId, subjectKey: r.w!.key })}><Pen />Log</button>}
                  <button type="button" className="od-btn sm" onClick={() => d.act.escalate({ projectId: r.projectId, subjectKey: r.w?.key })}><Flag />Escalate</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── Payments ── */

export function PaymentsScreen() {
  const d = useDesk();
  const [view, setView] = useState<'chase' | 'project'>('chase');
  const items = d.waiting.filter((w) => w.kind === 'payment').sort(byLateness(d.now));
  const age = payAgeing(items);
  const max = Math.max(1, age.due.length, age.late1to7.length, age.late8.length);
  const tot = items.reduce((s, w) => s + (w.amount || 0), 0);
  const withMoney = d.projects.filter((p) => p.money && p.money.milestones.length);
  const paidRatio = (() => {
    if (!d.seesMoney) return null;
    const val = withMoney.reduce((s, p) => s + (p.money?.projectValue || 0), 0);
    const paid = withMoney.reduce((s, p) => s + (p.money?.totalPaid || 0), 0);
    return val ? paid / val : null;
  })();
  const toggle = (
    <div className="od-card od-toolbar">
      <div className="od-seg" role="group" aria-label="View">
        {([['chase', 'What to chase'], ['project', 'By project']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
      </div>
      <span className="od-mut od-small">{d.seesMoney ? 'Amounts shown for your role.' : 'Amounts are with the leads; a reminder fills in the invoice.'} Late {d.settings.paymentDueDays} days after the invoice.</span>
    </div>
  );
  return (
    <>
      <Band eyebrow="Payments" title={d.seesMoney ? 'Money to collect' : 'Payments to chase'}
        sub={d.seesMoney ? 'Every milestone invoiced and unpaid, with amounts.' : 'What to chase and when. The amounts stay with the leads.'}
        right={d.seesMoney && tot > 0 ? (
          <>
            <span className="od-bigout"><span className="od-eyebrow">Outstanding</span><b className="od-num">{inr(tot)}</b></span>
            {paidRatio != null && <RingSvg p={paidRatio} size={70} stroke={8} tone="good"><b className="od-num">{Math.round(paidRatio * 100)}%</b><small>paid</small></RingSvg>}
          </>
        ) : undefined}>
        <div className="od-age">
          {([['Due, not late yet', age.due.length, 'warn'], ['1 to 7 days late', age.late1to7.length, 'warn'], ['8 or more days late', age.late8.length, 'bad']] as const).map(([l, n, t]) => (
            <div key={l} className="od-agecol od-glass"><span className="od-eyebrow">{l}</span><div className="od-agebar"><i className={t} style={{ ['--h' as any]: `${(n / max) * 100}%` }} /></div><b className="od-num">{n}</b></div>
          ))}
        </div>
      </Band>
      <SeeAs />
      {toggle}
      {view === 'chase' ? (
        <div className="od-paylist">
          <section className="od-card flex items-start gap-3">
            <span className="od-tile"><Clock /></span>
            <div className="min-w-0"><b className="text-sm block">Reminders on days 1, 7 and 14</b>
              <small className="text-xs text-slate-500">On each of those days after a payment falls due, the reminder is written for you and put at the top of Today. You check it and send it; nothing goes to the client by itself. A promised date pauses them, and a missed one brings it back that day. They stop the moment it is paid.</small></div>
          </section>
          {!items.length ? <div className="od-lockbox"><Check /><b>Nothing to chase</b><span>No invoiced payment is unpaid.</span></div> : items.map((w, i) => {
            const s = payState(w, d.now);
            const c = d.clients.find((x) => x.id === w.projectId);
            return (
              <div key={`${w.projectId}:${w.key}`} className="od-paycard od-tilt od-in" style={{ ['--i' as any]: Math.min(i, 12) }}>
                <span className={`od-pdays ${s.state}`}><b className="od-num">{s.days}</b><small>{s.state === 'late' ? 'days late' : s.days ? 'days to go' : 'invoiced'}</small></span>
                <div className="od-who min-w-0">
                  <b>{w.label}</b>
                  <small><button type="button" className="od-link" onClick={() => d.act.openClient(w.projectId)}>{w.projectName}</button>{c?.client ? ` · ${c.client}` : ''}{w.dueKey ? ` · due ${fmtDay(w.dueKey)}` : ''}</small>
                  <span className="od-pips3" title="Reminders since the last reply or promise">{[0, 1, 2].map((k) => <i key={k} className={k < w.reminders ? 'on' : ''} />)}<small>{plural(w.reminders, 'reminder')}{w.lastChaseAt ? ` · last ${ago(w.lastChaseAt, d.now)}` : ''}</small></span>
                </div>
                <Amt n={w.amount} />
                {d.canWrite && (
                  <div className="od-acts !mt-0">
                    <button type="button" className="od-btn sm pri" onClick={() => d.act.sendReminder(w, reminderText(d, w))}><MessageCircle />Remind</button>
                    <button type="button" className="od-btn sm" onClick={() => d.act.promise(w)}><Calendar />Log a promise</button>
                    <button type="button" className="od-btn sm" onClick={() => d.act.log({ projectId: w.projectId, subjectKey: w.key, outcome: 'replied' })}><Check />They paid</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="od-list">
          {!withMoney.length ? <div className="od-lockbox"><Wallet /><b>No payment schedules on these projects yet</b></div> : withMoney.map((p, i) => {
            const m = p.money!;
            const shown = d.seesMoney && !m.amountsHidden && m.totalPaid != null;
            const paid = m.milestones.filter((x) => x.status === 'paid').length;
            return (
              <section key={p.id} className="od-card od-in" style={{ ['--i' as any]: Math.min(i, 10) }}>
                <div className="od-ch">
                  <RingSvg p={paid / Math.max(1, m.milestones.length)} size={52} stroke={6} tone="good"><b className="od-num">{paid}/{m.milestones.length}</b></RingSvg>
                  <div className="min-w-0"><h3>{p.name}</h3><p>{shown ? `Paid ${inr(m.totalPaid ?? 0)} of ${inr(m.projectValue ?? 0)} · ${inr(m.balanceDue ?? 0)} still to come` : `${paid} of ${m.milestones.length} milestones paid. Amounts are with the leads.`}</p></div>
                  <div className="od-r"><button type="button" className="od-btn sm" onClick={() => d.act.openClient(p.id)}><Users />Client</button></div>
                </div>
                <div className="od-scroll-x">
                  <table className="od-tbl min-w-[520px]">
                    <thead><tr><th>Milestone</th><th>Status</th>{shown && <th className="r">Owed</th>}<th>Invoice</th><th>Due</th><th /></tr></thead>
                    <tbody>
                      {m.milestones.map((ms) => {
                        const w = d.waiting.find((x) => x.projectId === p.id && x.key === `pay:${ms.id}`);
                        return (
                          <tr key={ms.id}>
                            <td><b>{ms.name}</b></td>
                            <td><span className={`od-chip ${ms.status === 'paid' ? 'good' : ms.status === 'invoiced' ? (w?.overdueDays ? 'bad' : 'warn') : ''}`}>{ms.status === 'invoiced' && w?.overdueDays ? `${w.overdueDays}d late` : ms.status}</span></td>
                            {shown && <td className="r"><b className="od-num">{inr(ms.owed ?? 0)}</b></td>}
                            <td>{ms.invoiceNumber || '—'}{ms.invoiceDate ? <small className="block od-mut">{fmtDay(String(ms.invoiceDate).slice(0, 10))}</small> : null}</td>
                            <td><small>{w?.dueKey ? fmtDay(w.dueKey) : ms.date ? fmtDay(String(ms.date).slice(0, 10)) : '—'}</small></td>
                            <td className="r">{w && d.canWrite && <button type="button" className="od-btn sm" onClick={() => d.act.sendReminder(w, reminderText(d, w))}><MessageCircle />Remind</button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── Client pulse ── */

export function PulseScreen({ onAsk }: { onAsk: (projectId: string, kind: AskKind) => void }) {
  const d = useDesk();
  const [open, setOpen] = useState<string | null>(null);
  const cs = [...d.clients].sort((a, b) => a.score - b.score);
  const avg = cs.length ? Math.round(cs.reduce((s, c) => s + c.score, 0) / cs.length) : 0;
  const prompts = (id: string) => d.pulseRows.find((r) => r.project.id === id)?.prompts || [];
  return (
    <>
      <Band eyebrow="Client pulse" title="How each client relationship stands" sub="Out of 100, lowest first, with every point gained or lost. When a client is happy, ask for a review or a referral.">
        <Tiles tiles={[
          { ring: { p: avg / 100, label: <><b className="od-num">{avg}</b><small>avg</small></>, tone: avg >= 70 ? 'good' : 'warn' }, title: 'Average', sub: d.isLead ? 'Across the desk' : 'Across your clients' },
          { count: cs.filter((c) => c.health === 'good').length, title: 'Happy', sub: 'Ready to ask for a review' },
          { count: cs.filter((c) => c.health === 'warn').length, title: 'Watching', sub: 'A touch this week helps' },
          { count: cs.filter((c) => c.health === 'bad').length, title: 'At risk', sub: 'Call today', alarm: cs.some((c) => c.health === 'bad') },
        ]} />
      </Band>
      <SeeAs />
      {!cs.length ? <div className="od-lockbox"><Activity /><b>No clients on the desk yet</b></div> : (
        <div className="od-pgrid2">
          {cs.map((c, i) => {
            const pts = [...c.pulse.reasons].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
            const asks = prompts(c.id);
            const phone = d.projects.find((p) => p.id === c.id)?.raw?.context?.clientPhone || c.phone;
            return (
              <div key={c.id} className={`od-pcard od-tilt od-in ${c.health}`} style={{ ['--i' as any]: Math.min(i, 12) }}>
                <div className="od-pc-top">
                  <RingSvg p={c.score / 100} size={64} stroke={7} tone={c.health}><b className="od-num">{c.score}</b></RingSvg>
                  <span><b>{c.name}</b><small>{[c.client, c.phase.line].filter(Boolean).join(' · ')}</small></span>
                  <span className={`od-chip ${c.health}`}>{HEALTH_LABEL[c.health]}</span>
                </div>
                <div className="od-pts">
                  {!pts.length && <span className="od-pt2">Nothing logged moves it yet; it starts at 80.</span>}
                  {(open === c.id ? pts : pts.slice(0, 2)).map((r, k) => <span key={k} className={`od-pt2 ${r.points > 0 ? 'up' : 'down'}`}><b className="od-num">{r.points > 0 ? '+' : '−'}{Math.abs(r.points)}</b>{r.label}</span>)}
                  {pts.length > 2 && <button type="button" className="od-link self-start" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Fewer' : `All ${pts.length} points`}</button>}
                  {c.pulse.confidence === 'low' && <small className="od-mut">An early read: little is logged yet.</small>}
                </div>
                <div className="od-acts">
                  {d.canWrite && asks.map((a) => <button key={a.kind} type="button" className="od-btn sm pri" onClick={() => onAsk(c.id, a.kind)}>{a.kind === 'review' ? <Star /> : <Users />}{a.kind === 'review' ? 'Ask for a review' : 'Ask for a referral'}</button>)}
                  {d.canWrite && !asks.length && (phone
                    ? <a className="od-btn sm pri" href={`tel:+${dialable(phone)}`} onClick={() => d.act.log({ projectId: c.id, channel: 'call' })}><Phone />Call</a>
                    : <button type="button" className="od-btn sm pri" onClick={() => d.act.log({ projectId: c.id })}><Pen />Log a touch</button>)}
                  <button type="button" className="od-btn sm" onClick={() => d.act.openClient(c.id)}>Open client</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── Follow-up log ── */

export function LogScreen({ onDone, busy }: { onDone: (id: string) => void; busy: string | null }) {
  const d = useDesk();
  const [f, setF] = useState<'all' | 'call' | 'whatsapp' | 'email' | 'mine'>('all');
  const week = d.followUps.filter((x) => x.at >= d.now - 7 * 86400000);
  const calls = d.followUps.filter((x) => x.channel === 'call');
  const reached = calls.filter((x) => x.outcome !== 'no_answer').length;
  const list = [...d.followUps].filter((x) => f === 'all' || (f === 'mine' ? x.by === d.me.email : x.channel === f)).sort((a, b) => b.at - a.at).slice(0, 200);
  const ICON = { call: Phone, whatsapp: MessageCircle, email: Mail, meeting: Users, other: MessageCircle } as const;
  return (
    <>
      <Band eyebrow="Follow-up log" title="Every call, WhatsApp and email" sub="Logged by hand, newest first. Tick a next step when it is done; open ones show on the owner’s Today list."
        right={d.canWrite ? <button type="button" className="od-btn pri pp-press" onClick={() => d.act.log({})}><Plus />Log a follow-up</button> : undefined}>
        <Tiles tiles={[
          { count: week.length, title: 'This week', sub: 'Touches logged' },
          { count: d.followUps.filter((x) => x.next && !x.nextDone).length, title: 'Next steps open', sub: 'On Today lists' },
          calls.length ? { ring: { p: reached / calls.length, label: <><b className="od-num">{Math.round((reached / calls.length) * 100)}%</b><small>reached</small></> }, title: 'Reach rate', sub: 'Calls answered' } : { big: '—', title: 'Reach rate', sub: 'No calls logged yet' },
        ]} />
      </Band>
      <SeeAs />
      <div className="od-card od-toolbar">
        <div className="od-filters" role="group" aria-label="Show">
          {([['all', 'All'], ['call', 'Calls'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['mine', 'Mine']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}
        </div>
        <span className="od-mut od-small">{list.length} shown</span>
      </div>
      {!list.length ? <div className="od-lockbox"><ListChecks /><b>Nothing logged yet</b><span>Use Log a follow-up after your next call.</span></div> : (
        <div className="od-river">
          {list.map((x, i) => {
            const Icon = ICON[x.channel] || MessageCircle;
            const tone = x.outcome === 'no_answer' ? 'warn' : x.outcome === 'replied' || x.outcome === 'promised' ? 'good' : 'brand';
            return (
              <div key={x.id} className={`od-rv od-in ${tone}`} style={{ ['--i' as any]: Math.min(i, 12) }}>
                <span className="od-rv-ic"><Icon /></span>
                <div className="od-rv-b">
                  <b><button type="button" className="od-link !text-[13px]" onClick={() => d.act.openClient(x.projectId)}>{x.projectName || 'Project'}</button>{x.subject ? ` · ${x.subject.label}` : ''}</b>
                  {x.note && <span className="od-txt !text-xs">{x.note}</span>}
                  <small>{x.byName || x.by} · {fmtWhen(x.at)} · <span className={`od-chip ${tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'brand'}`}>{String(x.outcome).replace('_', ' ')}</span></small>
                  {x.next && <span className={`od-next ${x.nextDone ? 'done' : ''}`}><Target />Next: {x.next.text} · {x.next.ownerName} · {fmtDay(x.next.due)}</span>}
                </div>
                {x.next && !x.nextDone && d.canWrite && <button type="button" className="od-btn sm self-start" disabled={busy === x.id} onClick={() => onDone(x.id)}><Check />Done</button>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── Escalations ── */

export function EscalationsScreen({ onDecide, onClose, busy }: { onDecide: (e: Escalation) => void; onClose: (e: Escalation) => void; busy: string | null }) {
  const d = useDesk();
  const es = d.escalations.filter((e) => e.status !== 'closed').sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.raisedAt - a.raisedAt);
  return (
    <>
      <Band eyebrow="Escalations" title={d.isLead ? 'Stuck things, put in front of you' : 'What you have put in front of the leads'}
        sub={d.isLead ? 'Decide each one; the decision goes back to whoever raised it.' : 'And their decisions. Close one once you have acted on it.'}
        right={d.canWrite ? <button type="button" className="od-btn pri pp-press" onClick={() => d.act.escalate({})}><Flag />Raise an escalation</button> : undefined}>
        <Tiles tiles={[
          { count: es.filter((e) => e.status === 'open').length, title: 'Waiting for a decision', sub: d.isLead ? 'Yours to decide' : 'With the leads', alarm: es.some((e) => e.status === 'open') },
          { count: es.filter((e) => e.status === 'decided').length, title: 'Decided', sub: 'Act, then close' },
          { count: es.filter((e) => e.auto).length, title: 'Raised by the daily check', sub: 'Stuck past the rules' },
        ]} />
      </Band>
      <SeeAs />
      <div className="od-list">
        {!es.length ? <div className="od-lockbox"><Flag /><b>No open escalations</b></div> : es.map((e, i) => (
          <section key={e.id} className={`od-card od-esc od-in ${e.status}`} style={{ ['--i' as any]: Math.min(i, 12) }}>
            <div className="od-mhead">
              <span className={`od-dot ${e.status === 'open' ? 'bad' : 'good'}`} />
              <div className="od-who"><b>{e.title}</b><small><button type="button" className="od-link" onClick={() => d.act.openClient(e.projectId)}>{e.projectName}</button> · {e.auto ? 'raised by the daily check' : `raised by ${e.raisedByName || e.raisedBy}`} · {ago(e.raisedAt, d.now)}</small></div>
              <span className={`od-chip ${e.status === 'open' ? 'bad' : 'good'}`}>{e.status === 'open' ? 'Waiting for a decision' : 'Decided'}</span>
            </div>
            {e.detail && <p className="od-txt">{e.detail}</p>}
            {e.status === 'decided' && <p className="od-decision"><b>{e.decidedByName || e.decidedBy}:</b> {e.decision}</p>}
            <div className="od-acts !mt-0">
              {e.status === 'open' && d.isLead && <button type="button" className="od-btn sm pri" onClick={() => onDecide(e)}>Decide</button>}
              {e.status === 'decided' && (e.raisedBy === d.me.email || e.auto || d.isLead) && d.canWrite && <button type="button" className="od-btn sm" disabled={busy === e.id} onClick={() => onClose(e)}><Check />Done, close it</button>}
              <button type="button" className="od-btn sm ghost" onClick={() => d.act.openClient(e.projectId)}>Open client</button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* ── Minutes ── */

export function MinutesScreen({ onReview, onWrite }: { onReview: (m: OpsMom) => void; onWrite: (projectId: string) => void }) {
  const d = useDesk();
  const ms = [...d.moms].sort((a, b) => Number(b.status === 'pending_review') - Number(a.status === 'pending_review') || (b.meetingDate || 0) - (a.meetingDate || 0));
  const toApprove = ms.filter((m) => m.status === 'pending_review');
  const monthStart = dayKey(d.now).slice(0, 7);
  const ST: Record<string, [string, string]> = { pending_review: ['brand', 'Awaiting approval'], draft: ['warn', 'Draft'] };
  return (
    <>
      <Band eyebrow="Minutes" title={d.isLead ? 'Minutes to approve' : 'Write the minutes, a lead approves them'}
        sub={d.isLead ? 'Written by Client Relations. Read, edit if needed, then approve: that finalises them and opens the email to the client.' : 'Write the minutes of a client meeting and send them for approval. They reach the client only once a lead approves them.'}>
        <Tiles tiles={[
          { count: toApprove.length, title: 'Awaiting approval', sub: d.isLead ? 'Waiting on you' : 'With a lead', alarm: d.isLead && toApprove.length > 0 },
          { count: ms.filter((m) => m.status === 'draft').length, title: 'Drafts', sub: 'Not sent yet' },
          { count: ms.filter((m) => m.status !== 'draft' && m.status !== 'pending_review' && m.meetingDate && dayKey(m.meetingDate).slice(0, 7) === monthStart).length, title: 'This month', sub: 'Approved' },
        ]} />
      </Band>
      <SeeAs />
      {d.canWrite && (
        <section className="od-card od-toolbar end">
          <label className="od-psel"><span className="od-eyebrow">Write minutes for</span>
            <select className="od-field" value="" onChange={(e) => e.target.value && onWrite(e.target.value)}>
              <option value="">Choose a project</option>
              {d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <span className="od-mut od-small">Each follow-up in the minutes goes on its owner’s Today list.</span>
        </section>
      )}
      <div className="od-list">
        {!ms.length ? <div className="od-lockbox"><FileText /><b>{d.isLead ? 'No minutes on the desk yet' : 'No minutes on your projects yet'}</b></div> : ms.map((m, i) => {
          const st = ST[m.status] || ['good', m.status.replace(/_/g, ' ')];
          const can = d.isLead || m.status === 'draft' || m.status === 'pending_review';
          return (
            <section key={`${m.projectId}:${m.id}`} className="od-card od-in" style={{ ['--i' as any]: Math.min(i, 12) }}>
              <div className="od-mhead">
                <span className="od-tile"><Pen /></span>
                <div className="od-who"><b>{m.meetingTitle || m.momRef || 'Meeting'}</b><small>{m.projectName}{m.momRef ? ` · ${m.momRef}` : ''}{m.meetingDate ? ` · ${fmtDay(dayKey(m.meetingDate))}` : ''}{m.raw?.preparedBy?.name ? ` · by ${m.raw.preparedBy.name}` : ''}</small></div>
                <span className={`od-chip ${st[0]}`}>{st[1]}</span>
                {can && <button type="button" className={`od-btn sm ${d.isLead && m.status === 'pending_review' ? 'pri' : ''}`} onClick={() => onReview(m)}>{d.isLead ? (m.status === 'pending_review' ? 'Review & approve' : 'Open') : m.status === 'draft' ? 'Edit & send' : 'Open'}</button>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ── Drawings for approval: the runway ── */

type ApFilter = 'open' | ApprovalStage | 'all';
export function ApprovalsScreen({ projects, lead, onChanged }: { projects: { id: string; name: string }[]; lead: boolean; onChanged: (projectId: string) => void }) {
  const d = useDesk();
  const items = d.approvals;
  const [pick, setPick] = useState('');
  const [f, setF] = useState<ApFilter>('open');
  const [recording, setRecording] = useState(false);
  const stageOf = (i: ApprovalItem) => approvalStage(asMeeting(i), d.now);
  const all = items || [];
  const n = (k: ApprovalStage) => all.filter((i) => stageOf(i) === k).length;
  const waiting = all.filter((i) => stageOf(i) !== 'approved');
  const cnt = (id: string) => waiting.filter((i) => i.projectId === id).length;
  const sorted = [...projects].sort((a, b) => cnt(b.id) - cnt(a.id) || a.name.localeCompare(b.name));
  const project = projects.find((p) => p.id === pick) || null;
  const list = all.filter((i) => (!project || i.projectId === project.id) && (f === 'all' || (f === 'open' ? stageOf(i) !== 'approved' : stageOf(i) === f)));
  const approved14 = all.filter((i) => stageOf(i) === 'approved' && (i.confirmation?.at || i.approval?.answeredAt || 0) >= d.now - 14 * 86400000).length;

  return (
    <>
      <Band eyebrow="Drawings for approval" title="From the meeting to the client’s written yes"
        sub="Pick the project, upload the drawings you choose to its Drive folder, send the approval email (it goes in your name, and replies come to you), then record their answer. Reminders go on working days 3 and 5.">
        <Tiles tiles={[
          { count: n('presented'), title: 'To send', sub: 'Shown, not emailed yet' },
          { count: n('sent') + n('overdue'), title: 'With clients', sub: 'Waiting on an answer' },
          { count: n('overdue'), title: 'Overdue', sub: 'Past the date in the email', alarm: n('overdue') > 0 },
          { count: approved14, title: 'Approved', sub: 'In the last 14 days' },
        ]} />
      </Band>
      <SeeAs />
      <section className="od-card od-toolbar end">
        <label className="od-psel"><span className="od-eyebrow">Project</span>
          <select className="od-field" value={pick} onChange={(e) => { setPick(e.target.value); setRecording(false); }}>
            <option value="">All projects ({waiting.length} waiting)</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>{p.name}{cnt(p.id) ? ` (${cnt(p.id)})` : ''}</option>)}
          </select>
        </label>
        <div className="od-filters" role="group" aria-label="Show">
          {([['open', `Waiting ${waiting.length}`], ['presented', `To send ${n('presented')}`], ['sent', `With client ${n('sent')}`], ['overdue', `Overdue ${n('overdue')}`], ['changes', `Changes ${n('changes')}`], ['approved', `Approved ${n('approved')}`], ['all', 'All']] as [ApFilter, string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>
          ))}
        </div>
      </section>
      <ToastHost>
        <div className="flex flex-col gap-3.5">
          {project && !recording && (
            <div className="od-outside-row"><Eye /><p>Showed <b>{project.name}</b>’s drawings outside the Studio Desk, at site or on WhatsApp?</p>
              <button type="button" className="od-btn" onClick={() => setRecording(true)}><Plus />Presented outside the Studio Desk</button></div>
          )}
          {project && recording && (
            <PresentedOutside orgId={d.tenantId} projectId={project.id} projectName={project.name} onCancel={() => setRecording(false)} onDone={() => { setRecording(false); onChanged(project.id); }} />
          )}
          {!project && <p className="od-mut od-small">Pick a project to record drawings presented outside the Studio Desk.</p>}
          {items === null ? <div className="od-lockbox"><Loader2 className="animate-spin" /><b>Loading the drawings…</b></div> : !list.length ? (
            <div className="od-lockbox"><FileCheck2 /><b>{project ? `Nothing from ${project.name} here` : 'Nothing here'}</b><span>Try another filter.</span></div>
          ) : (
            <div className="od-aplist">
              {list.map((i, k) => <ApCard key={i.meetingId} i={i} k={k} lead={lead} onChanged={onChanged} stage={stageOf(i)} />)}
            </div>
          )}
        </div>
      </ToastHost>
    </>
  );
}

const ApCard: React.FC<{ i: ApprovalItem; k: number; lead: boolean; stage: ApprovalStage; onChanged: (projectId: string) => void }> = ({ i, k, lead, stage, onChanged }) => {
  const d = useDesk();
  const m = asMeeting(i);
  const r = runwayOf(stage, i.approval, d.now);
  const rooms = new Map<string, ApprovalItem['sheets']>();
  i.sheets.forEach((s) => rooms.set(s.room, [...(rooms.get(s.room) || []), s]));
  const chip = { presented: ['warn', 'Send for approval'], sent: ['warn', 'Awaiting client'], overdue: ['bad', 'Approval overdue'], approved: ['good', 'Approved by client'], changes: ['bad', 'Client changes'] }[stage];
  const owner = d.isLead ? d.clients.find((c) => c.id === i.projectId) : null;
  return (
    <div className={`od-apcard od-in ${stage}`} style={{ ['--i' as any]: Math.min(k, 10) }}>
      <div className="od-ap-h">
        <span className="w-[78px] grid place-items-center"><Fan n={i.sheets.length} /></span>
        <div className="od-who">
          <b><button type="button" className="od-link !text-sm" onClick={() => d.act.openClient(i.projectId)}>{i.projectName}</button></b>
          <small>{i.outside ? `Presented outside the Studio Desk${i.how ? ` (${i.how})` : ''}` : 'Design meeting'} · {new Date(i.closedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}{i.presentedBy ? ` · by ${i.presentedBy}` : ''}{owner?.client ? ` · ${owner.client}` : ''}</small>
        </div>
        <span className={`od-chip ${chip[0]}`}>{chip[1]}</span>
        {r && <Countdown r={r} />}
      </div>
      <div className="od-rooms">
        {[...rooms].map(([room, sheets]) => <span key={room} className="od-room"><b>{room}</b>{sheets.map((s) => <span key={s.drawingId}>{s.name} <em>v{s.versionNo}</em></span>)}</span>)}
      </div>
      <ClientApproval orgId={d.tenantId} projectId={i.projectId} m={m} mine lead={lead} me={d.me} contact={i.contact} onChanged={() => onChanged(i.projectId)} />
      {stage === 'approved' && <span className="od-stamp">Approved</span>}
      <span className="od-sr">{APPROVAL_LABEL[stage]}: {i.sheets.map((s) => sheetLine(s.room, s.name)).join(', ')}</span>
    </div>
  );
};

/* ── Leads: the band, and calling mode ── */

export function LeadsBand({ onAdd, onPaste, onCalling }: { onAdd: () => void; onPaste: () => void; onCalling: () => void }) {
  const d = useDesk();
  const mine = d.leads.filter((l) => d.isLead || l.ownerEmail === d.me.email);
  const s = leadStats(mine, d.now);
  const hot = mine.filter((l) => leadIsOpen(l) && leadHeat(l, d.now)?.heat === 'hot');
  const closed = mine.filter((l) => (l.stage === 'won' || l.stage === 'lost') && (l.closedAt || 0) >= d.now - 90 * 86400000);
  const won = closed.filter((l) => l.stage === 'won');
  const toYes = won.map((l) => Math.max(0, ((l.closedAt || l.updatedAt) - l.createdAt) / 86400000));
  return (
    <Band eyebrow="Leads" title={d.isLead ? 'Everyone’s pipeline' : 'Your pipeline'} sub="From the first message to the yes. Won joins the project already opened for the proposal."
      right={<>
        <button type="button" className="od-btn pri pp-press" disabled={!hot.length} onClick={onCalling}><Phone />Start calling · {hot.length} hot</button>
        {d.canWrite && <button type="button" className="od-btn sm od-bandbtn" data-tour="lead-board" onClick={onAdd}><UserPlus />Add a lead</button>}
        {d.canWrite && <button type="button" className="od-btn sm od-bandbtn" onClick={onPaste}><MessageCircle />From a WhatsApp chat</button>}
      </>}>
      <Tiles tiles={[
        closed.length ? { ring: { p: won.length / closed.length, label: <><b className="od-num">{Math.round((won.length / closed.length) * 100)}%</b><small>win</small></> }, title: 'Win rate', sub: 'Last 90 days' } : { big: '—', title: 'Win rate', sub: 'Nothing closed in 90 days' },
        toYes.length ? { count: Math.round(toYes.reduce((a, b) => a + b, 0) / toYes.length), unit: 'd', title: 'Days to a yes', sub: 'On average' } : { big: '—', title: 'Days to a yes', sub: 'No wins in 90 days' },
        s.avgFirstCallMin != null ? { count: s.avgFirstCallMin, unit: 'm', title: 'First call', sub: 'Average wait this month' } : { big: '—', title: 'First call', sub: 'No new leads this month' },
        { count: hot.length, title: 'Hot now', sub: 'Call them first', alarm: hot.some((l) => !l.firstTouchAt) },
      ]} />
    </Band>
  );
}

export function CallingMode({ onClose, onSaved }: { onClose: () => void; onSaved: (l: Lead) => void }) {
  const d = useDesk();
  const [list] = useState(() => d.leads.filter((l) => leadIsOpen(l) && (d.isLead || l.ownerEmail === d.me.email) && leadHeat(l, d.now)?.heat === 'hot')
    .sort((a, b) => (leadHeat(b, d.now)?.score || 0) - (leadHeat(a, d.now)?.score || 0)));
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const l = list[idx] || null;
  const p = l ? mainPerson(l) : null;
  const log = async (reached: boolean | null) => {
    if (!l) return;
    if (reached === null) { setIdx((i) => i + 1); return; }
    setBusy(true); setErr(null);
    try {
      const next = await saveLead(withTouch(l, { kind: 'call', text: reached ? 'Reached on a call (calling mode)' : 'No answer (calling mode)', reached }, d.me), d.me.email);
      onSaved(next);
      setIdx((i) => i + 1);
    } catch { setErr('That call was not logged. Only its owner, or a lead, can change this lead.'); } finally { setBusy(false); }
  };
  return (
    <div className="od-ov od-fm" role="dialog" aria-modal="true" aria-label="Calling mode">
      <div className="od-fm-top">
        <div className="od-fm-dots">{list.map((x, i) => <i key={x.id} className={i < idx ? 'd' : i === idx ? 'c' : ''} />)}</div>
        <span className="od-fm-timer">Calling mode</span>
        <button type="button" className="od-btn sm" onClick={onClose}><X />Esc</button>
      </div>
      {l ? (
        <div className="od-fm-card" key={l.id}>
          <span className="od-eyebrow">{sourceLabel(l.source)} · {idx + 1} of {list.length}</span>
          <h2>{leadName(l)}</h2>
          <p>{[homeLine(l.home), p?.phone].filter(Boolean).join(' · ')}</p>
          <div className="od-fm-script"><span className="od-eyebrow">Open with</span><br />{templateText(l.stage === 'new' ? 'intro' : 'checkin', l, { me: d.me.name, studio: d.studioName })}</div>
          {err && <p className="!mt-3 !mb-0 text-rose-300">{err}</p>}
          <div className="od-fm-acts">
            {p?.phone && <a className="od-btn pri" href={`tel:+${dialable(p.phone)}`}><Phone />Call {p.name || ''}</a>}
            {p?.phone && <a className="od-btn" href={waLink(p.phone, templateText(l.stage === 'new' ? 'intro' : 'checkin', l, { me: d.me.name, studio: d.studioName }))} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
            {d.canWrite && <button type="button" className="od-btn" disabled={busy} onClick={() => log(true)}><Check />Reached · log it</button>}
            {d.canWrite && <button type="button" className="od-btn" disabled={busy} onClick={() => log(false)}><Clock />No answer · log it</button>}
            <button type="button" className="od-btn" onClick={() => log(null)}>Next</button>
          </div>
        </div>
      ) : (
        <div className="od-fm-card">
          <span className="od-eyebrow">All {list.length} called</span>
          <h2>Hot leads done.</h2>
          <p>Each call you logged is on its lead. Set the next step on the lead’s page.</p>
          <div className="od-fm-acts"><button type="button" className="od-btn pri" onClick={onClose}>Back to leads</button></div>
        </div>
      )}
    </div>
  );
}

/* ── Meetings & visits: the week above the board ── */

export function VisitsBand({ onLog }: { onLog: () => void }) {
  const d = useDesk();
  const today = dayKey(d.now);
  const dow = new Date(`${today}T12:00:00+05:30`).getUTCDay();
  const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const inWeek = d.visits.filter((v) => v.slot?.date && v.slot.date >= days[0] && v.slot.date <= days[6] && v.status !== 'cancelled');
  const toConfirm = d.visits.filter((v) => v.status === 'requested' || v.status === 'rescheduled').length;
  const toClose = d.visits.filter((v) => v.status === 'confirmed' && v.slot?.date && v.slot.date < today).length;
  const cls = (v: VisitRequest) => (v.source === 'lead' ? 'lead' : v.status === 'requested' || v.status === 'rescheduled' ? 'asked' : v.status === 'done' ? 'held' : '');
  return (
    <>
      <Band eyebrow="Meetings & visits" title="Every meeting and site visit, from the ask to the minutes" sub="Agree a time, confirm it on Google Calendar with a Meet link, move it, and close it out with the minutes."
        right={d.canWrite ? <button type="button" className="od-btn pri pp-press" onClick={onLog}><Plus />Log a request</button> : undefined}>
        <Tiles tiles={[
          { count: inWeek.length, title: 'This week', sub: 'Meetings and visits' },
          { count: toConfirm, title: 'To confirm', sub: 'Waiting on you' },
          { count: toClose, title: 'To close out', sub: 'Held, minutes not written', alarm: toClose > 0 },
        ]} />
      </Band>
      <div className="od-wk">
        {days.map((k) => {
          const dt = new Date(`${k}T12:00:00+05:30`);
          const vs = inWeek.filter((v) => v.slot!.date === k).sort((a, b) => a.slot!.time.localeCompare(b.slot!.time));
          return (
            <div key={k} className={`od-wkd ${k === today ? 'today' : ''}`}>
              <span className="od-eyebrow">{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
              <b className="od-num">{dt.getDate()}</b>
              {vs.map((v) => <button key={v.id} type="button" className={`od-ev2 ${cls(v)}`} onClick={() => (v.source === 'lead' && v.leadId ? d.act.openLead(v.leadId) : d.act.openClient(v.projectId))}>{clock12(v.slot!.time)} · {v.projectName}</button>)}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── A plain band for the screens whose body is unchanged ── */

export function SimpleBand({ eyebrow, title, sub, right, tiles }: { eyebrow: string; title: string; sub: string; right?: React.ReactNode; tiles?: TileSpec[] }) {
  return <Band eyebrow={eyebrow} title={title} sub={sub} right={right}>{tiles && <Tiles tiles={tiles} />}</Band>;
}

/** The body of a screen whose panel is the desk's own, inside a 2.1 card. */
export const Inner: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`od-card od-inner od-rise ${className}`} style={{ ['--d' as any]: 2 }}>{children}</section>
);

/* ── A promise to pay: the date, and it comes back that day if still unpaid ── */

export function PromiseSheet({ w, onClose, onSaved }: { w: WaitingItem; onClose: () => void; onSaved: () => void }) {
  const d = useDesk();
  const today = dayKey(d.now);
  const dow = new Date(`${today}T12:00:00+05:30`).getUTCDay();
  const nextOf = (target: number) => addDays(today, ((target - dow + 7) % 7) || 7);
  const end = (() => { const [y, m] = today.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); })();
  const picks: [string, string][] = [[nextOf(5), 'Friday'], [nextOf(1), 'Monday'], [addDays(today, 7), 'In a week'], [end > today ? end : addDays(today, 30), 'End of month']];
  const [day, setDay] = useState(picks[0][0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await logFollowUp({
        tenantId: d.tenantId, projectId: w.projectId, projectName: w.projectName, me: d.me, channel: 'call', outcome: 'promised',
        note: note.trim() || `Promised to pay by ${fmtDay(day)}.`, subject: { kind: 'payment', key: w.key, label: w.label },
        next: { text: `Check ${w.label} is paid (promised ${fmtDay(day)})`, ownerEmail: d.me.email, ownerName: d.me.name, due: day },
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.code === 'permission-denied' ? 'You cannot log on this project. Ask a lead to assign it to you.' : 'That was not saved. Try again.');
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Promise to pay">
      <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative phd-pop w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Promise to pay · {w.projectName}</p>
          <h3 className="font-bold text-slate-800 mt-1">When did they say?</h3>
          <p className="text-xs text-slate-500 mt-0.5">{w.label}. Reminders pause until then. If the day passes unpaid, it comes back to the top of your Today list.</p>
        </div>
        <div className="px-5 pb-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">{picks.map(([k, l]) => <button key={l} type="button" className={`od-btn sm ${day === k ? 'pri' : ''}`} onClick={() => setDay(k)}>{l} · {fmtDay(k)}</button>)}</div>
          <label className="flex flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Or a date</span>
            <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" min={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">What they said (optional)</span>
            <input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transfer on Friday after the salary comes in" /></label>
          {err && <p className="text-xs text-rose-700">{err}</p>}
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" className="od-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="od-btn pri" disabled={busy || !day} onClick={save}>{busy ? <Loader2 className="animate-spin" /> : <Calendar />}Log the promise</button>
        </div>
      </div>
    </div>
  );
}
