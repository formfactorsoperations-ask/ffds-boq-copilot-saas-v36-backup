import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox, Clock, IndianRupee, ListChecks, Flag, FileText, Plus, RefreshCw, Check, ChevronRight, Phone, MessageCircle, Mail, Users,
} from '@/lib/lucide-shim';
import { useOrg } from '../../contexts/OrgContext';
import { hasRole, primaryRole } from '../../lib/roles';
import { clientMoneyOf, type ClientMoney } from '../../lib/clientMoney';
import {
  buildQueue, decisionWaiting, paymentWaiting, withChases, opsSettingsOf, inr, dayKey, daysBetween,
  type Escalation, type FollowUp, type QueueItem, type WaitingItem,
} from '../../lib/opsDesk';
import { loadProjectOps, loadStudioOps, markNextDone, closeEscalation, type OpsMom } from '../../services/opsDeskService';
import { LogFollowUpPanel, RaiseEscalationPanel, DecideEscalationPanel, btnPri, btnSec, type DeskProject, type LogPrefill, type Person } from './OpsDeskPanels';
import { MomReviewModal } from '../ops/MomReviewModal';
import { MomCaptureModal } from '../ops/MomCaptureModal';

/*
  THE OPS DESK (lib/opsDesk.ts).

  For Client Relations it is the working day: one list, overdue first, of
  their own next steps, late payments and decisions waiting on the client,
  and the decisions coming back from escalations. For the studio's leads it
  is where escalations are decided and minutes approved.
*/

type Section = 'today' | 'waiting' | 'payments' | 'log' | 'escalations' | 'minutes';
const LEADS = ['Super Admin', 'Owner', 'Admin', 'Ops Director'];
/* Projects with nothing left to chase. */
const QUIET = new Set(['lost', 'lead', 'draft']);

const CHANNEL_ICON: Record<string, React.ComponentType<any>> = { call: Phone, whatsapp: MessageCircle, email: Mail, meeting: Users, other: MessageCircle };
const fmtDay = (key?: string | null) => (key ? new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const fmtWhen = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const KIND_STYLE: Record<QueueItem['kind'], { bg: string; icon: React.ComponentType<any>; label: string }> = {
  next: { bg: 'bg-[#4F6BE8]', icon: ListChecks, label: 'Next step' },
  payment: { bg: 'bg-[#0F766E]', icon: IndianRupee, label: 'Payment' },
  decision: { bg: 'bg-[#B45309]', icon: Clock, label: 'Waiting on client' },
  mom_review: { bg: 'bg-[#6D5BD0]', icon: FileText, label: 'Minutes' },
  escalation_open: { bg: 'bg-[#B91C1C]', icon: Flag, label: 'Escalation' },
  escalation_decided: { bg: 'bg-[#B91C1C]', icon: Flag, label: 'Decision back' },
};
const GROUP_LABEL: Record<QueueItem['group'], string> = { overdue: 'Overdue', today: 'Today', week: 'This week', later: 'Later' };

export default function OpsDeskPage({ projects, onOpenProject }: {
  projects: any[];
  onOpenProject: (projectId: string, tab?: string) => void;
}) {
  const { orgData, currentRole, currentRoles, currentUserAuth, teamMembers } = useOrg() as any;
  const tenantId: string = orgData?.tenantId || '';
  const roles = currentRoles?.length ? currentRoles : [currentRole];
  const isLead = hasRole(roles, LEADS);
  const isCR = primaryRole(roles) === 'Client Relations';
  const settings = useMemo(() => opsSettingsOf(orgData), [orgData]);
  const team: Person[] = useMemo(() => ((orgData?.team || teamMembers || []) as any[])
    .filter((m) => m?.email && String(m.role) !== 'Client')
    .map((m) => ({ email: String(m.email).trim().toLowerCase(), name: m.name || m.email })), [orgData?.team, teamMembers]);
  const myEmail = String(currentUserAuth?.email || '').toLowerCase();
  const me: Person = { email: myEmail, name: team.find((t) => t.email === myEmail)?.name || currentUserAuth?.displayName || myEmail };

  const deskProjects = useMemo(() => projects
    .filter((p) => p?.id && !QUIET.has(String(p?.context?.status || '')))
    .map((p) => ({
      id: String(p.id),
      name: String(p.context?.name || 'Project'),
      clientName: String(p.context?.clientName || p.context?.client?.name || ''),
      status: String(p.context?.status || ''),
      money: ((p as any).clientMoney !== undefined ? (p as any).clientMoney : clientMoneyOf(p)) as ClientMoney | null,
    })), [projects]);

  const [section, setSection] = useState<Section>('today');
  const [loading, setLoading] = useState(true);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [decisions, setDecisions] = useState<Record<string, any[]>>({});
  const [moms, setMoms] = useState<OpsMom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const per = await Promise.all(deskProjects.map((p) => loadProjectOps(tenantId, p, isLead)));
      const decs: Record<string, any[]> = {};
      deskProjects.forEach((p, i) => { decs[p.id] = per[i].decisions; });
      if (isLead) {
        const studio = await loadStudioOps(tenantId);
        setFollowUps(studio.followUps);
        setEscalations(studio.escalations);
        setMoms(studio.moms);
      } else {
        setFollowUps(per.flatMap((x) => x.followUps));
        setEscalations(per.flatMap((x) => x.escalations).filter((e) => e.status !== 'closed'));
        setMoms(per.flatMap((x) => x.moms));
      }
      setDecisions(decs);
      setNow(Date.now());
    } catch (e: any) {
      setError('Some of the desk could not be loaded. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, isLead, deskProjects]);

  useEffect(() => { load(); }, [load]);

  const waiting: WaitingItem[] = useMemo(() => withChases(deskProjects.flatMap((p) => [
    ...paymentWaiting(p, p.money, settings, now),
    ...decisionWaiting(p, decisions[p.id] || [], now),
  ]), followUps), [deskProjects, decisions, followUps, settings, now]);

  const queue = useMemo(() => buildQueue({ now, me: myEmail, isLead, followUps, waiting, moms, escalations }), [now, myEmail, isLead, followUps, waiting, moms, escalations]);

  /* Panels */
  const [logFor, setLogFor] = useState<LogPrefill | null>(null);
  const [escFor, setEscFor] = useState<LogPrefill | null>(null);
  const [deciding, setDeciding] = useState<Escalation | null>(null);
  const [reviewing, setReviewing] = useState<OpsMom | null>(null);
  const [writingFor, setWritingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const done = async (f: FollowUp) => {
    setBusy(f.id);
    try { await markNextDone(f.projectId, f.id, myEmail); await load(); } catch { setError('That was not saved. Try again.'); } finally { setBusy(null); }
  };
  const close = async (e: Escalation) => {
    setBusy(e.id);
    try { await closeEscalation(e.projectId, e.id); await load(); } catch { setError('That was not saved. Try again.'); } finally { setBusy(null); }
  };

  const onItem = (q: QueueItem) => {
    if (q.kind === 'payment' || q.kind === 'decision') return setLogFor({ projectId: q.projectId, subjectKey: q.ref });
    if (q.kind === 'mom_review') return setReviewing(moms.find((m) => m.id === q.ref) || null);
    if (q.kind === 'escalation_open') return setDeciding(escalations.find((e) => e.id === q.ref) || null);
    if (q.kind === 'escalation_decided') return setSection('escalations');
    if (q.kind === 'next') return setSection('log');
  };

  const counts = {
    today: queue.filter((q) => q.group === 'overdue' || q.group === 'today').length,
    waiting: waiting.length,
    payments: waiting.filter((w) => w.kind === 'payment').length,
    log: followUps.length,
    escalations: escalations.filter((e) => e.status !== 'closed').length,
    minutes: isLead ? moms.filter((m) => m.status === 'pending_review').length : moms.filter((m) => m.status === 'draft' || m.status === 'pending_review').length,
  };
  const SECTIONS: { id: Section; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'today', label: 'Today', icon: Inbox },
    { id: 'waiting', label: 'Waiting on client', icon: Clock },
    { id: 'payments', label: 'Payments', icon: IndianRupee },
    { id: 'log', label: 'Follow-up log', icon: ListChecks },
    { id: 'escalations', label: 'Escalations', icon: Flag },
    { id: 'minutes', label: isLead ? 'Minutes to approve' : 'Minutes', icon: FileText },
  ];

  const canWrite = isLead || isCR || !['Viewer', 'Designer', 'Site Supervisor', 'Vendor'].includes(primaryRole(roles));
  const projectName = (id: string) => deskProjects.find((p) => p.id === id)?.name || '';

  if (!deskProjects.length && !loading) {
    return (
      <div className="px-4 sm:px-6 py-10 max-w-3xl">
        <h1 className="text-2xl font-extrabold text-slate-900">Ops Desk</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
          <p className="text-sm font-bold text-slate-800">No projects are on your desk yet.</p>
          <p className="text-[13px] text-slate-500 mt-1">{isCR ? 'Ask a lead to assign you projects in Studio settings → Team.' : 'Active projects appear here.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 sm:px-6 pt-4 pb-3 border-b border-slate-100">
        <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight">Ops Desk</h1>
        <p className="text-[14.5px] text-slate-500">{isLead ? 'Escalations to decide, minutes to approve, and every client follow-up' : 'Everything that needs you today, across your clients'}</p>
        <span className="flex-1" />
        <div className="flex flex-wrap gap-2 py-1">
          <button type="button" className={btnSec} onClick={load} disabled={loading} aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          {canWrite && <button type="button" className={btnSec} onClick={() => setEscFor({})}><Flag className="w-4 h-4" />Raise an escalation</button>}
          {canWrite && <button type="button" className={btnPri} onClick={() => setLogFor({})}><Plus className="w-4 h-4" />Log a follow-up</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Ops Desk sections" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible px-3 md:px-3 py-3 border-b md:border-b-0 md:border-r border-slate-100">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const on = section === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setSection(s.id)} aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] whitespace-nowrap text-left ${on ? 'bg-[#EEF1FB] text-[#3D52A0] font-extrabold' : 'text-slate-600 font-semibold hover:bg-slate-50'}`}>
                <Icon className={`w-4 h-4 ${on ? 'text-[#3D52A0]' : 'text-slate-400'}`} />
                <span>{s.label}</span>
                <span className={`ml-auto text-[11.5px] font-extrabold ${s.id === 'escalations' && counts.escalations ? 'text-rose-600' : 'text-slate-400'}`}>{counts[s.id] || ''}</span>
              </button>
            );
          })}
        </nav>

        <main className="px-4 sm:px-6 py-5 min-w-0 flex flex-col gap-4">
          {error && <p className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
          {loading && !followUps.length && <p className="text-[13px] text-slate-500">Loading your desk…</p>}

          {section === 'today' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <Stat n={queue.filter((q) => q.group === 'overdue').length} label="Overdue" tone="text-rose-700" />
                <Stat n={queue.filter((q) => q.group === 'today').length} label="Due today" tone="text-amber-700" />
                <Stat n={waiting.length} label="Waiting on client" onClick={() => setSection('waiting')} />
                <Stat n={counts.escalations} label={isLead ? 'Escalations open' : 'Escalations'} onClick={() => setSection('escalations')} />
              </div>
              {!loading && queue.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-[13.5px] text-slate-500">Nothing needs you right now.</div>
              )}
              {(['overdue', 'today', 'week', 'later'] as const).map((g) => {
                const list = queue.filter((q) => q.group === g);
                if (!list.length) return null;
                return (
                  <section key={g} className="flex flex-col gap-2">
                    <h2 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{GROUP_LABEL[g]}</h2>
                    {list.map((q) => {
                      const k = KIND_STYLE[q.kind];
                      const Icon = k.icon;
                      const fu = q.kind === 'next' ? followUps.find((f) => f.id === q.ref) : null;
                      return (
                        <div key={q.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 hover:border-[#C9CFE6] hover:shadow-sm transition">
                          <span className={`w-9 h-9 shrink-0 rounded-xl grid place-items-center text-white ${k.bg}`}><Icon className="w-4 h-4" /></span>
                          <button type="button" onClick={() => onItem(q)} className="min-w-0 flex-1 text-left">
                            <span className="block text-[14px] font-bold text-slate-900 line-clamp-2 sm:truncate">{q.title}</span>
                            <span className="block text-[12.5px] text-slate-500 line-clamp-2 sm:truncate"><b className="text-slate-700">{q.projectName}</b> · {k.label} · {q.detail}</span>
                          </button>
                          {q.due && <span className={`hidden sm:inline text-[11.5px] font-extrabold rounded-full px-2.5 py-1 ${g === 'overdue' ? 'bg-rose-50 text-rose-700' : g === 'today' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{g === 'overdue' ? `Due ${fmtDay(q.due)}` : g === 'today' ? 'Today' : fmtDay(q.due)}</span>}
                          {fu && <button type="button" className={btnSec} disabled={busy === fu.id} onClick={() => done(fu)}><Check className="w-4 h-4" />Done</button>}
                          {(q.kind === 'payment' || q.kind === 'decision') && canWrite && <button type="button" className={btnSec} onClick={() => setLogFor({ projectId: q.projectId, subjectKey: q.ref })}>Remind</button>}
                          <ChevronRight className="w-4 h-4 text-slate-300 hidden sm:block" />
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </>
          )}

          {section === 'waiting' && (
            <>
              <Intro title="Waiting on client" text="Every payment and decision the studio is waiting for, how long it has waited, and when it was last chased." />
              {waiting.length === 0 && !loading && <Empty text="Nothing is waiting on a client." />}
              {[...waiting].sort((a, b) => b.days - a.days).map((w) => (
                <div key={`${w.projectId}:${w.key}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-slate-900">{w.kind === 'payment' ? 'Payment' : 'Decision'}: {w.label}</p>
                    <p className="text-[12.5px] text-slate-500"><b className="text-slate-700">{w.projectName}</b> · waiting {w.days} day{w.days === 1 ? '' : 's'}
                      {w.kind === 'payment' && w.amount ? ` · ${inr(w.amount)}` : ''}{w.overdueDays ? ` · ${w.overdueDays} days late` : ''}
                      {' · '}{w.lastChaseAt ? `last chased ${fmtWhen(w.lastChaseAt)} (${w.reminders} reminder${w.reminders === 1 ? '' : 's'})` : 'not chased yet'}</p>
                  </div>
                  {canWrite && <button type="button" className={btnSec} onClick={() => setEscFor({ projectId: w.projectId, subjectKey: w.key })}><Flag className="w-4 h-4" />Escalate</button>}
                  {canWrite && <button type="button" className={btnPri} onClick={() => setLogFor({ projectId: w.projectId, subjectKey: w.key })}><MessageCircle className="w-4 h-4" />Remind</button>}
                </div>
              ))}
            </>
          )}

          {section === 'payments' && (
            <>
              <Intro title="Payments" text={`What each client has been invoiced, what they owe, and when it fell due (${settings.paymentDueDays} days after the invoice). Invoices are raised by the studio's leads.`} />
              {deskProjects.every((p) => !p.money) && !loading && <Empty text="No payment schedules on these projects yet." />}
              {deskProjects.filter((p) => p.money).map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 border-b border-slate-100">
                    <button type="button" className="text-[14.5px] font-extrabold text-slate-900 hover:text-[#3D52A0]" onClick={() => onOpenProject(p.id)}>{p.name}</button>
                    <span className="text-[12.5px] text-slate-500">Paid {inr(p.money!.totalPaid)} of {inr(p.money!.projectValue)} · <b className="text-slate-800">{inr(p.money!.balanceDue)} still to come</b></span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-[13px]">
                      <thead><tr className="text-left text-[10.5px] uppercase tracking-[0.1em] text-slate-500 bg-slate-50">
                        <th className="px-4 py-2 font-extrabold">Milestone</th><th className="px-3 py-2 font-extrabold">Status</th>
                        <th className="px-3 py-2 font-extrabold text-right">Owed</th><th className="px-3 py-2 font-extrabold">Invoiced</th><th className="px-3 py-2 font-extrabold">Due</th><th className="px-3 py-2" />
                      </tr></thead>
                      <tbody>
                        {p.money!.milestones.map((m) => {
                          const w = waiting.find((x) => x.projectId === p.id && x.key === `pay:${m.id}`);
                          return (
                            <tr key={m.id} className="border-t border-slate-100">
                              <td className="px-4 py-2 font-semibold text-slate-800">{m.name}{m.invoiceNumber ? <span className="text-slate-400 font-normal"> · {m.invoiceNumber}</span> : null}</td>
                              <td className="px-3 py-2"><span className={`text-[11px] font-extrabold uppercase tracking-wide rounded-full px-2 py-0.5 ${m.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : m.status === 'invoiced' ? (w?.overdueDays ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700') : 'bg-slate-100 text-slate-500'}`}>{m.status === 'invoiced' && w?.overdueDays ? `${w.overdueDays}d late` : m.status}</span></td>
                              <td className="px-3 py-2 text-right tabular-nums">{inr(m.owed)}</td>
                              <td className="px-3 py-2 text-slate-600">{m.invoiceDate ? fmtDay(String(m.invoiceDate).slice(0, 10)) : '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{w?.dueKey ? fmtDay(w.dueKey) : '—'}</td>
                              <td className="px-3 py-2 text-right">{w && canWrite && <button type="button" className={btnSec} onClick={() => setLogFor({ projectId: p.id, subjectKey: w.key })}>Remind</button>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}

          {section === 'log' && (
            <>
              <Intro title="Follow-up log" text="Every call, WhatsApp and email to a client, logged by hand, newest first. Tick a next step when it is done." />
              {followUps.length === 0 && !loading && <Empty text="Nothing logged yet. Use Log a follow-up after your next call." />}
              <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {[...followUps].sort((a, b) => b.at - a.at).slice(0, 200).map((f) => {
                  const Icon = CHANNEL_ICON[f.channel] || MessageCircle;
                  return (
                    <div key={f.id} className="flex gap-3 px-4 py-3">
                      <span className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 bg-slate-50 grid place-items-center text-slate-600"><Icon className="w-4 h-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] text-slate-800"><b>{f.projectName || projectName(f.projectId)}</b>{f.subject ? <span className="text-slate-500"> · {f.subject.label}</span> : null}</p>
                        {f.note && <p className="text-[13px] text-slate-700 whitespace-pre-line">{f.note}</p>}
                        <p className="text-[12px] text-slate-500">{f.byName || f.by} · {fmtWhen(f.at)} · {String(f.outcome).replace('_', ' ')} · logged by hand</p>
                        {f.next && (
                          <p className={`mt-1 text-[12.5px] ${f.nextDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                            Next: {f.next.text} · {f.next.ownerName} · {fmtDay(f.next.due)}
                          </p>
                        )}
                      </div>
                      {f.next && !f.nextDone && canWrite && <button type="button" className={`${btnSec} self-start`} disabled={busy === f.id} onClick={() => done(f)}><Check className="w-4 h-4" />Done</button>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {section === 'escalations' && (
            <>
              <Intro title="Escalations" text={isLead ? 'Stuck things put in front of the leads. Decide each one; the decision goes back to whoever raised it.' : 'What you have put in front of the leads, and their decisions. Close one once you have acted on it.'} />
              {escalations.filter((e) => e.status !== 'closed').length === 0 && !loading && <Empty text="No open escalations." />}
              {[...escalations].filter((e) => e.status !== 'closed').sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.raisedAt - a.raisedAt).map((e) => (
                <div key={e.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-slate-900">{e.title}</p>
                    <p className="text-[12.5px] text-slate-500"><b className="text-slate-700">{e.projectName}</b> · {e.auto ? 'raised by the daily check' : `raised by ${e.raisedByName || e.raisedBy}`} · {daysBetween(e.raisedAt, now) === 0 ? 'today' : `${daysBetween(e.raisedAt, now)} day${daysBetween(e.raisedAt, now) === 1 ? '' : 's'} ago`}</p>
                    {e.detail && <p className="text-[13px] text-slate-700 mt-1 whitespace-pre-line">{e.detail}</p>}
                    {e.status === 'decided' && <p className="mt-2 text-[13px] bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-3 py-2"><b>{e.decidedByName || e.decidedBy}:</b> {e.decision}</p>}
                  </div>
                  <span className={`text-[11px] font-extrabold uppercase tracking-wide rounded-full px-2.5 py-1 ${e.status === 'open' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{e.status === 'open' ? 'Waiting for a decision' : 'Decided'}</span>
                  {e.status === 'open' && isLead && <button type="button" className={btnPri} onClick={() => setDeciding(e)}>Decide</button>}
                  {e.status === 'decided' && (e.raisedBy === myEmail || e.auto || isLead) && canWrite && <button type="button" className={btnSec} disabled={busy === e.id} onClick={() => close(e)}><Check className="w-4 h-4" />Done, close it</button>}
                </div>
              ))}
            </>
          )}

          {section === 'minutes' && (
            <>
              <Intro title={isLead ? 'Minutes to approve' : 'Minutes'} text={isLead ? 'Minutes written by Client Relations. Read, edit if needed, then approve: that finalises them and opens the email to the client.' : 'Write the minutes of a client meeting and send them for approval. They reach the client only once a lead approves them.'} />
              {!isLead && canWrite && (
                <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-[220px] flex-1">
                    <label htmlFor="mom-project" className="block text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-slate-500 mb-1">Write minutes for</label>
                    <select id="mom-project" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13.5px]" value={writingFor || ''} onChange={(e) => setWritingFor(e.target.value || null)}>
                      <option value="">Choose a project</option>
                      {deskProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {moms.filter((m) => isLead ? m.status === 'pending_review' : true).length === 0 && !loading && <Empty text={isLead ? 'No minutes are waiting for approval.' : 'No minutes on your projects yet.'} />}
              {[...moms].filter((m) => isLead ? m.status === 'pending_review' : true).sort((a, b) => (b.meetingDate || 0) - (a.meetingDate || 0)).map((m) => (
                <div key={`${m.projectId}:${m.id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-slate-900">{m.meetingTitle || m.momRef || 'Meeting'}</p>
                    <p className="text-[12.5px] text-slate-500"><b className="text-slate-700">{m.projectName || projectName(m.projectId)}</b>{m.momRef ? ` · ${m.momRef}` : ''}{m.meetingDate ? ` · ${dayKey(m.meetingDate)}` : ''}</p>
                  </div>
                  <span className={`text-[11px] font-extrabold uppercase tracking-wide rounded-full px-2.5 py-1 ${m.status === 'pending_review' ? 'bg-indigo-50 text-[#2C3C78]' : m.status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {m.status === 'pending_review' ? 'Awaiting approval' : m.status === 'draft' ? 'Draft' : m.status.replace('_', ' ')}
                  </span>
                  {(isLead || m.status === 'draft' || m.status === 'pending_review') && (
                    <button type="button" className={isLead ? btnPri : btnSec} onClick={() => setReviewing(m)}>{isLead ? 'Review & approve' : m.status === 'draft' ? 'Edit & send' : 'Open'}</button>
                  )}
                </div>
              ))}
            </>
          )}
        </main>
      </div>

      {logFor && (
        <LogFollowUpPanel projects={deskProjects as DeskProject[]} waiting={waiting} team={team} me={me} tenantId={tenantId}
          studioName={orgData?.orgName || ''} prefill={logFor} onClose={() => setLogFor(null)} onSaved={() => { setLogFor(null); load(); }} />
      )}
      {escFor && (
        <RaiseEscalationPanel projects={deskProjects as DeskProject[]} waiting={waiting} me={me} tenantId={tenantId}
          prefill={escFor} onClose={() => setEscFor(null)} onSaved={() => { setEscFor(null); setSection('escalations'); load(); }} />
      )}
      {deciding && <DecideEscalationPanel escalation={deciding} me={me} onClose={() => setDeciding(null)} onSaved={() => { setDeciding(null); load(); }} />}
      {reviewing && (
        <MomReviewModal mom={reviewing.raw} projectId={reviewing.projectId} studioId={tenantId}
          projectContextName={reviewing.projectName || projectName(reviewing.projectId)} onClose={() => { setReviewing(null); load(); }} />
      )}
      {writingFor && (
        <MomCaptureModal
          visit={{ id: `ops-${Date.now()}`, type: 'client_meeting', title: 'Client meeting', date: Date.now(), notes: '', attendees: [] } as any}
          projectId={writingFor} studioId={tenantId} projectContextName={projectName(writingFor)}
          onClose={() => setWritingFor(null)}
          onSuccess={async (momId) => {
            const pid = writingFor;
            setWritingFor(null);
            await load();
            const p = deskProjects.find((x) => x.id === pid);
            if (p) {
              const fresh = await loadProjectOps(tenantId, p);
              const m = fresh.moms.find((x) => x.id === momId);
              if (m) setReviewing(m);
            }
          }}
        />
      )}
    </div>
  );
}

const Stat: React.FC<{ n: number; label: string; tone?: string; onClick?: () => void }> = ({ n, label, tone, onClick }) => {
  const body = (<><b className={`block text-[24px] font-extrabold leading-tight tabular-nums ${tone || 'text-slate-900'}`}>{n}</b><span className="text-[12.5px] font-semibold text-slate-500">{label}</span></>);
  return onClick
    ? <button type="button" onClick={onClick} className="text-left rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-[#C9CFE6]">{body}</button>
    : <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">{body}</div>;
};
const Intro: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div><h2 className="text-[18px] font-extrabold text-slate-900">{title}</h2><p className="text-[13.5px] text-slate-500 mt-0.5 max-w-3xl">{text}</p></div>
);
const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-[13.5px] text-slate-500">{text}</div>
);
