import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox, Clock, IndianRupee, ListChecks, Flag, FileText, Plus, RefreshCw, Check, Phone, MessageCircle, Mail, Users, Mic, Search, CalendarClock,
  Activity, CalendarCheck, ClipboardCheck, FolderOpen, Star,
} from '@/lib/lucide-shim';
import { useOrg } from '../../contexts/OrgContext';
import { hasRole, primaryRole } from '../../lib/roles';
import { clientMoneyOf, type ClientMoney } from '../../lib/clientMoney';
import {
  buildQueue, decisionWaiting, paymentWaiting, withChases, opsSettingsOf, inr, dayKey, daysBetween,
  type Escalation, type FollowUp, type QueueItem, type WaitingItem,
} from '../../lib/opsDesk';
import { loadProjectOps, loadStudioOps, markNextDone, closeEscalation, type OpsMom } from '../../services/opsDeskService';
import { LogFollowUpPanel, RaiseEscalationPanel, DecideEscalationPanel, btnPri, btnSec, btnSm, input, type DeskProject, type LogPrefill, type Person } from './OpsDeskPanels';
import ConsoleHeader from '../ui/ConsoleHeader';
import { CountUp, Dot } from '../ui/HudBits';
import { MomReviewModal } from '../ops/MomReviewModal';
import { MomCaptureModal } from '../ops/MomCaptureModal';
import { handoverSlip } from '../../lib/opsAssist';
import { clientContactOf } from '../../lib/minutes';
import { CapturePanel, AskProjectPanel, MeetingPrepPanel } from './OpsAssist';
import { clientPulse, askPrompts, careQueue, type AskKind, type Checklist, type ChecklistKind, type VisitRequest, type VisitStatus } from '../../lib/clientCare';
import { PulseList, AskSheet, ChecklistsView, VisitsView, VisitSheet, askReasonOf, type PulseRow } from './ClientCare';

/*
  THE OPS DESK (lib/opsDesk.ts).

  For Client Relations it is the working day: one list, overdue first, of
  their own next steps, late payments and decisions waiting on the client,
  and the decisions coming back from escalations. For the studio's leads it
  is where escalations are decided and minutes approved. The smart assist
  (OpsAssist.tsx) captures chats and calls, answers questions about a
  project and prepares client meetings. Client care (ClientCare.tsx) reads
  each client's pulse, works the checklists and documents, books meetings
  and visits, and asks for reviews and referrals.
*/

interface ProjectCare { checklists: Partial<Record<ChecklistKind, Checklist>>; visits: VisitRequest[] }
type Section = 'today' | 'pulse' | 'waiting' | 'payments' | 'visits' | 'checklists' | 'log' | 'escalations' | 'minutes' | 'ask' | 'prep';
const LEADS = ['Super Admin', 'Owner', 'Admin', 'Ops Director'];
/* Projects with nothing left to chase. */
const QUIET = new Set(['lost', 'lead', 'draft']);

const CHANNEL_ICON: Record<string, React.ComponentType<any>> = { call: Phone, whatsapp: MessageCircle, email: Mail, meeting: Users, other: MessageCircle };
const fmtDay = (key?: string | null) => (key ? new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const fmtWhen = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/* Each kind of item names itself; the state light, not a colour per kind, says how urgent it is (DESIGN.md). */
const KIND: Record<QueueItem['kind'], { icon: React.ComponentType<any>; label: string }> = {
  next: { icon: ListChecks, label: 'Next step' },
  payment: { icon: IndianRupee, label: 'Payment' },
  decision: { icon: Clock, label: 'Waiting on client' },
  mom_review: { icon: FileText, label: 'Minutes' },
  escalation_open: { icon: Flag, label: 'Escalation' },
  escalation_decided: { icon: Flag, label: 'Decision back' },
  visit: { icon: CalendarCheck, label: 'Meeting or visit' },
  documents: { icon: FolderOpen, label: 'Documents' },
  checklist: { icon: ClipboardCheck, label: 'Checklist' },
  ask: { icon: Star, label: 'Client care' },
};
const GROUP_TONE: Record<QueueItem['group'], 'bad' | 'warn' | 'ok'> = { overdue: 'bad', today: 'warn', week: 'ok', later: 'ok' };
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
      targetHandover: (p.context?.targetHandoverDate as string | undefined) || null,
      money: ((p as any).clientMoney !== undefined ? (p as any).clientMoney : clientMoneyOf(p)) as ClientMoney | null,
    })), [projects]);

  const [section, setSection] = useState<Section>('today');
  const [loading, setLoading] = useState(true);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [decisions, setDecisions] = useState<Record<string, any[]>>({});
  const [moms, setMoms] = useState<OpsMom[]>([]);
  const [care, setCare] = useState<Record<string, ProjectCare>>({});
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const per = await Promise.all(deskProjects.map((p) => loadProjectOps(tenantId, p, isLead)));
      const decs: Record<string, any[]> = {};
      const cared: Record<string, ProjectCare> = {};
      deskProjects.forEach((p, i) => { decs[p.id] = per[i].decisions; cared[p.id] = { checklists: per[i].checklists, visits: per[i].visits }; });
      setCare(cared);
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

  /* Client care: each project's pulse and whether to ask for a review or referral (lib/clientCare). */
  const pulseRows: PulseRow[] = useMemo(() => deskProjects.map((p) => {
    const w = waiting.filter((x) => x.projectId === p.id);
    const f = followUps.filter((x) => x.projectId === p.id);
    const e = escalations.filter((x) => x.projectId === p.id);
    const pulse = clientPulse({
      waiting: w, followUps: f, escalations: e, moms: moms.filter((x) => x.projectId === p.id), visits: care[p.id]?.visits || [], money: p.money, targetHandover: p.targetHandover, now,
    });
    const handedOver = p.status === 'completed' || !!care[p.id]?.checklists.handover?.completedAt;
    const prompts = askPrompts({ followUps: f, handedOver, pulse, latePayment: w.some((x) => (x.overdueDays || 0) > 0), openEscalation: e.some((x) => x.status === 'open'), now });
    return { project: p, pulse, prompts };
  }), [deskProjects, waiting, followUps, escalations, moms, care, now]);

  const careItems = useMemo(() => careQueue(deskProjects.map((p) => ({
    id: p.id, name: p.name, status: p.status, targetHandover: p.targetHandover,
    checklists: care[p.id]?.checklists || {}, visits: care[p.id]?.visits || [],
    prompts: pulseRows.find((r) => r.project.id === p.id)?.prompts || [],
  })), followUps, isLead, now), [deskProjects, care, pulseRows, followUps, isLead, now]);

  const queue = useMemo(() => buildQueue({ now, me: myEmail, isLead, followUps, waiting, moms, escalations, extra: careItems }), [now, myEmail, isLead, followUps, waiting, moms, escalations, careItems]);
  const allVisits = useMemo(() => Object.values(care).flatMap((c: ProjectCare) => c.visits), [care]);

  /* Panels */
  const [logFor, setLogFor] = useState<LogPrefill | null>(null);
  const [escFor, setEscFor] = useState<LogPrefill | null>(null);
  const [deciding, setDeciding] = useState<Escalation | null>(null);
  const [reviewing, setReviewing] = useState<OpsMom | null>(null);
  const [writingFor, setWritingFor] = useState<{ projectId: string; notes: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [askFor, setAskFor] = useState<{ projectId: string; kind: AskKind } | null>(null);
  const [visitAct, setVisitAct] = useState<{ visit: VisitRequest | null; to: VisitStatus | null; projectId?: string } | null>(null);
  const [careFocus, setCareFocus] = useState<{ projectId: string; kind: ChecklistKind }>({ projectId: '', kind: 'onboarding' });
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
    if (q.kind === 'visit') {
      const v = allVisits.find((x) => x.id === q.ref);
      if (!v) return setSection('visits');
      const today = dayKey(now);
      return setVisitAct({ visit: v, to: v.status === 'confirmed' ? (v.slot && v.slot.date < today ? 'done' : 'confirmed') : 'confirmed' });
    }
    if (q.kind === 'documents' || q.kind === 'checklist') {
      setCareFocus({ projectId: q.projectId, kind: q.ref as ChecklistKind });
      return setSection('checklists');
    }
    if (q.kind === 'ask') return setAskFor({ projectId: q.projectId, kind: q.ref as AskKind });
  };
  const atRisk = pulseRows.filter((r) => r.pulse.band === 'at_risk').length;

  const counts = {
    today: queue.filter((q) => q.group === 'overdue' || q.group === 'today').length,
    waiting: waiting.length,
    payments: waiting.filter((w) => w.kind === 'payment').length,
    log: followUps.length,
    escalations: escalations.filter((e) => e.status !== 'closed').length,
    minutes: isLead ? moms.filter((m) => m.status === 'pending_review').length : moms.filter((m) => m.status === 'draft' || m.status === 'pending_review').length,
    ask: 0,
    prep: 0,
    pulse: atRisk,
    visits: allVisits.filter((v) => v.status === 'requested' || v.status === 'rescheduled').length,
    checklists: careItems.filter((q) => q.kind === 'documents' || q.kind === 'checklist').length,
  };
  const SECTIONS: { id: Section; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'today', label: 'Today', icon: Inbox },
    { id: 'pulse', label: 'Client pulse', icon: Activity },
    { id: 'waiting', label: 'Waiting on client', icon: Clock },
    { id: 'payments', label: 'Payments', icon: IndianRupee },
    { id: 'visits', label: 'Meetings & visits', icon: CalendarCheck },
    { id: 'checklists', label: 'Checklists', icon: ClipboardCheck },
    { id: 'log', label: 'Follow-up log', icon: ListChecks },
    { id: 'escalations', label: 'Escalations', icon: Flag },
    { id: 'minutes', label: isLead ? 'Minutes to approve' : 'Minutes', icon: FileText },
    { id: 'ask', label: 'Ask a project', icon: Search },
    { id: 'prep', label: 'Meeting prep', icon: CalendarClock },
  ];

  const canWrite = isLead || isCR || !['Viewer', 'Designer', 'Site Supervisor', 'Vendor'].includes(primaryRole(roles));
  const projectName = (id: string) => deskProjects.find((p) => p.id === id)?.name || '';

  const overdue = queue.filter((q) => q.group === 'overdue').length;
  const dueToday = queue.filter((q) => q.group === 'today').length;
  const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';

  return (
    <div className="pb-28">
      <ConsoleHeader
        title="Ops Desk"
        state={loading ? 'Loading' : overdue ? `${overdue} overdue` : dueToday ? `${dueToday} due today` : 'Up to date'}
        tone={overdue ? 'bad' : dueToday ? 'warn' : 'ok'}
        live={loading}
        blurb={isLead
          ? 'Escalations to decide, minutes to approve, and every client follow-up across the studio.'
          : 'Everything that needs you today across your clients: next steps, payments, decisions and replies from the leads.'}
        actions={canWrite ? (
          <>
            <button type="button" className={btnPri} onClick={() => setLogFor({})}><Plus className="w-4 h-4" />Log a follow-up</button>
            <button type="button" className={btnSec} onClick={() => setCapturing(true)}><Mic className="w-4 h-4" />Capture a chat or call</button>
            <button type="button" className={btnSec} onClick={() => setEscFor({})}><Flag className="w-4 h-4" />Raise an escalation</button>
            <button type="button" className={btnSec} onClick={load} disabled={loading} aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          </>
        ) : undefined}
        panel={
          <div className="w-full md:w-[260px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Where things stand</div>
            <div className="mt-3 space-y-1">
              {([
                ['Overdue', overdue, 'today', 'bad'],
                ['Due today', dueToday, 'today', 'warn'],
                ['Waiting on client', waiting.length, 'waiting', 'ok'],
                ['Clients at risk', atRisk, 'pulse', 'bad'],
                [isLead ? 'Escalations to decide' : 'Open escalations', counts.escalations, 'escalations', counts.escalations ? 'bad' : 'ok'],
              ] as [string, number, Section, 'bad' | 'warn' | 'ok'][]).map(([label, n, target, tone], i) => (
                <button key={label} type="button" onClick={() => setSection(target)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-slate-100 hud-row-in"
                  style={{ animationDelay: `${i * 30}ms` }}>
                  <Dot tone={n ? tone : 'ok'} />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{label}</span>
                  <span className="text-xs font-black text-slate-800 tabular-nums"><CountUp value={n} /></span>
                </button>
              ))}
            </div>
          </div>
        }
      />

      {!deskProjects.length && !loading ? (
        <Panel icon={Inbox} title="No projects on your desk yet" blurb={isCR ? 'Ask a lead to assign you projects in Studio settings → Team.' : 'Active projects appear here.'}>{null}</Panel>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
        <nav aria-label="Ops Desk sections" className="lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {SECTIONS.map((x, i) => {
            const Icon = x.icon;
            const on = section === x.id;
            const n = counts[x.id];
            return (
              <button key={x.id} type="button" onClick={() => setSection(x.id)} aria-current={on ? 'page' : undefined}
                className={`lg:w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors hud-row-in whitespace-nowrap ${on ? 'bg-[#3D52A0] text-white shadow-sm hud-rail-active' : 'text-slate-700 hover:bg-slate-100'}`}
                style={{ animationDelay: `${i * 30}ms` }}>
                <Icon className={`w-4 h-4 shrink-0 ${on ? 'text-white' : 'text-slate-400'}`} />
                <span className="text-sm font-semibold flex-1 min-w-0 truncate">{x.label}</span>
                {n > 0 && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${on ? 'bg-white/20 text-white' : x.id === 'escalations' || x.id === 'pulse' || (x.id === 'today' && overdue) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{n}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div key={section} className="space-y-6 min-w-0 hud-swap">
          {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

          {section === 'today' && (
            <Panel icon={Inbox} title="Today" blurb={isLead ? 'Escalations to decide and minutes to approve come first, then your own next steps.' : 'Overdue first, then today, then the rest of the week. Payments and decisions come back three days after you chase them.'}>
              {loading && !queue.length ? <Loading /> : queue.length === 0 ? <Empty text="Nothing needs you right now." /> : (
                <div className="space-y-5">
                  {(['overdue', 'today', 'week', 'later'] as const).map((g) => {
                    const list = queue.filter((q) => q.group === g);
                    if (!list.length) return null;
                    return (
                      <div key={g}>
                        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2"><Dot tone={GROUP_TONE[g]} />{GROUP_LABEL[g]}</p>
                        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                          {list.map((q, i) => {
                            const k = KIND[q.kind];
                            const Icon = k.icon;
                            const fu = q.kind === 'next' ? followUps.find((f) => f.id === q.ref) : null;
                            return (
                              <div key={q.id} className="flex items-center gap-3 px-3 py-2.5 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                                <span className="w-8 h-8 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><Icon className="w-4 h-4" /></span>
                                <button type="button" onClick={() => onItem(q)} className="min-w-0 flex-1 text-left">
                                  <span className="block text-sm font-semibold text-slate-800 truncate">{q.title}</span>
                                  <span className="block text-xs text-slate-500 truncate"><b className="font-semibold text-slate-700">{q.projectName}</b> · {k.label} · {q.detail}</span>
                                </button>
                                {q.due && g !== 'today' && <span className={`hidden sm:inline ${chip} ${g === 'overdue' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{g === 'overdue' ? `Due ${fmtDay(q.due)}` : fmtDay(q.due)}</span>}
                                {fu && <button type="button" className={btnSm} disabled={busy === fu.id} onClick={() => done(fu)}><Check className="w-3.5 h-3.5" />Done</button>}
                                {(q.kind === 'payment' || q.kind === 'decision') && canWrite && <button type="button" className={btnSm} onClick={() => setLogFor({ projectId: q.projectId, subjectKey: q.ref })}>Remind</button>}
                                {(q.kind === 'escalation_open' || q.kind === 'mom_review') && <button type="button" className={btnSm} onClick={() => onItem(q)}>{q.kind === 'mom_review' ? 'Review' : 'Decide'}</button>}
                                {(q.kind === 'visit' || q.kind === 'documents' || q.kind === 'checklist' || q.kind === 'ask') && canWrite && (
                                  <button type="button" className={btnSm} onClick={() => onItem(q)}>{q.kind === 'ask' ? 'Ask' : q.kind === 'documents' ? 'Chase' : 'Open'}</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}

          {section === 'waiting' && (
            <Panel icon={Clock} title="Waiting on client" blurb="Every payment and decision the studio is waiting for, how long it has waited, when it was last chased, and how far it can push the handover.">
              {loading && !waiting.length ? <Loading /> : waiting.length === 0 ? <Empty text="Nothing is waiting on a client." /> : (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {[...waiting].sort((a, b) => b.days - a.days).map((w, i) => {
                    const slip = handoverSlip(w, deskProjects.find((p) => p.id === w.projectId)?.targetHandover);
                    return (
                    <div key={`${w.projectId}:${w.key}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                      <Dot tone={w.overdueDays || w.days >= 7 ? 'bad' : w.days >= 3 ? 'warn' : 'ok'} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{w.kind === 'payment' ? 'Payment' : 'Decision'}: {w.label}</p>
                        <p className="text-xs text-slate-500"><b className="font-semibold text-slate-700">{w.projectName}</b> · waiting {w.days} day{w.days === 1 ? '' : 's'}
                          {w.kind === 'payment' && w.amount ? ` · ${inr(w.amount)}` : ''}{w.overdueDays ? ` · ${w.overdueDays} day${w.overdueDays === 1 ? '' : 's'} late` : ''}</p>
                        <p className="text-[11px] text-slate-500">{w.lastChaseAt ? `Last chased ${fmtWhen(w.lastChaseAt)} · ${w.reminders} reminder${w.reminders === 1 ? '' : 's'}` : 'Not chased yet'}</p>
                      </div>
                      {slip.days > 0 && (
                        <span className={`${chip} ${slip.days >= 7 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}
                          title="An estimate: a late payment holds the next stage by the days it is late; a decision, by the days past a three-day grace period.">
                          Handover +{slip.days}d{slip.newHandoverKey ? ` · ${fmtDay(slip.newHandoverKey)}` : ''}
                        </span>
                      )}
                      {canWrite && <button type="button" className={btnSm} onClick={() => setEscFor({ projectId: w.projectId, subjectKey: w.key })}><Flag className="w-3.5 h-3.5" />Escalate</button>}
                      {canWrite && <button type="button" className={btnSm} onClick={() => setLogFor({ projectId: w.projectId, subjectKey: w.key })}><MessageCircle className="w-3.5 h-3.5" />Remind</button>}
                    </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}

          {section === 'payments' && (
            deskProjects.every((p) => !p.money) && !loading
              ? <Panel icon={IndianRupee} title="Payments" blurb="No payment schedules on these projects yet.">{null}</Panel>
              : deskProjects.filter((p) => p.money).map((p) => (
                <Panel key={p.id} icon={IndianRupee} title={p.name}
                  blurb={`Paid ${inr(p.money!.totalPaid)} of ${inr(p.money!.projectValue)} · ${inr(p.money!.balanceDue)} still to come. Late ${settings.paymentDueDays} days after the invoice.`}>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead><tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
                        <th className="px-3 py-2">Milestone</th><th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Owed</th><th className="px-3 py-2">Invoiced</th><th className="px-3 py-2">Due</th><th className="px-3 py-2" />
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {p.money!.milestones.map((m, i) => {
                          const w = waiting.find((x) => x.projectId === p.id && x.key === `pay:${m.id}`);
                          return (
                            <tr key={m.id} className="hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                              <td className="px-3 py-2 text-sm font-semibold text-slate-800">{m.name}{m.invoiceNumber ? <span className="font-mono text-xs font-normal text-slate-400"> · {m.invoiceNumber}</span> : null}</td>
                              <td className="px-3 py-2"><span className={`${chip} ${m.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : m.status === 'invoiced' ? (w?.overdueDays ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700') : 'bg-slate-100 text-slate-600'}`}>{m.status === 'invoiced' && w?.overdueDays ? `${w.overdueDays}d late` : m.status}</span></td>
                              <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{inr(m.owed)}</td>
                              <td className="px-3 py-2 text-slate-600">{m.invoiceDate ? fmtDay(String(m.invoiceDate).slice(0, 10)) : '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{w?.dueKey ? fmtDay(w.dueKey) : '—'}</td>
                              <td className="px-3 py-2 text-right">{w && canWrite && <button type="button" className={btnSm} onClick={() => setLogFor({ projectId: p.id, subjectKey: w.key })}>Remind</button>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ))
          )}

          {section === 'log' && (
            <Panel icon={ListChecks} title="Follow-up log" blurb="Every call, WhatsApp and email to a client, logged by hand, newest first. Tick a next step when it is done.">
              {loading && !followUps.length ? <Loading /> : followUps.length === 0 ? <Empty text="Nothing logged yet. Use Log a follow-up after your next call." /> : (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {[...followUps].sort((a, b) => b.at - a.at).slice(0, 200).map((f, i) => {
                    const Icon = CHANNEL_ICON[f.channel] || MessageCircle;
                    return (
                      <div key={f.id} className="flex gap-3 px-3 py-2.5 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                        <span className="w-8 h-8 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><Icon className="w-4 h-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">{f.projectName || projectName(f.projectId)}{f.subject ? <span className="font-normal text-slate-500"> · {f.subject.label}</span> : null}</p>
                          {f.note && <p className="text-[13px] text-slate-700 whitespace-pre-line">{f.note}</p>}
                          <p className="text-[11px] text-slate-500">{f.byName || f.by} · {fmtWhen(f.at)} · {String(f.outcome).replace('_', ' ')} · logged by hand</p>
                          {f.next && (
                            <p className={`mt-1 text-xs ${f.nextDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>Next: {f.next.text} · {f.next.ownerName} · {fmtDay(f.next.due)}</p>
                          )}
                        </div>
                        {f.next && !f.nextDone && canWrite && <button type="button" className={`${btnSm} self-start`} disabled={busy === f.id} onClick={() => done(f)}><Check className="w-3.5 h-3.5" />Done</button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}

          {section === 'escalations' && (
            <Panel icon={Flag} title="Escalations" blurb={isLead ? 'Stuck things put in front of the leads. Decide each one; the decision goes back to whoever raised it.' : 'What you have put in front of the leads, and their decisions. Close one once you have acted on it.'}>
              {escalations.filter((e) => e.status !== 'closed').length === 0 ? (loading ? <Loading /> : <Empty text="No open escalations." />) : (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {[...escalations].filter((e) => e.status !== 'closed').sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.raisedAt - a.raisedAt).map((e, i) => (
                    <div key={e.id} className="flex flex-wrap items-start gap-3 px-3 py-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                      <span className="pt-1.5"><Dot tone={e.status === 'open' ? 'bad' : 'ok'} live={e.status === 'open'} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                        <p className="text-xs text-slate-500"><b className="font-semibold text-slate-700">{e.projectName}</b> · {e.auto ? 'raised by the daily check' : `raised by ${e.raisedByName || e.raisedBy}`} · {daysBetween(e.raisedAt, now) === 0 ? 'today' : `${daysBetween(e.raisedAt, now)} day${daysBetween(e.raisedAt, now) === 1 ? '' : 's'} ago`}</p>
                        {e.detail && <p className="text-[13px] text-slate-700 mt-1 whitespace-pre-line">{e.detail}</p>}
                        {e.status === 'decided' && <p className="mt-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-3 py-2"><b>{e.decidedByName || e.decidedBy}:</b> {e.decision}</p>}
                      </div>
                      <span className={`${chip} ${e.status === 'open' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{e.status === 'open' ? 'Waiting for a decision' : 'Decided'}</span>
                      {e.status === 'open' && isLead && <button type="button" className={btnSm} onClick={() => setDeciding(e)}>Decide</button>}
                      {e.status === 'decided' && (e.raisedBy === myEmail || e.auto || isLead) && canWrite && <button type="button" className={btnSm} disabled={busy === e.id} onClick={() => close(e)}><Check className="w-3.5 h-3.5" />Done, close it</button>}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {section === 'minutes' && (
            <Panel icon={FileText} title={isLead ? 'Minutes to approve' : 'Minutes'} blurb={isLead ? 'Minutes written by Client Relations. Read, edit if needed, then approve: that finalises them and opens the email to the client.' : 'Write the minutes of a client meeting and send them for approval. They reach the client only once a lead approves them.'}>
              <div className="space-y-4">
                {canWrite && (
                  <div className="max-w-sm">
                    <label htmlFor="mom-project" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Write minutes for</label>
                    <select id="mom-project" className={input} value={writingFor?.projectId || ''} onChange={(e) => setWritingFor(e.target.value ? { projectId: e.target.value, notes: '' } : null)}>
                      <option value="">Choose a project</option>
                      {deskProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                {moms.filter((m) => isLead ? m.status === 'pending_review' : true).length === 0 ? (loading ? <Loading /> : <Empty text={isLead ? 'No minutes are waiting for approval.' : 'No minutes on your projects yet.'} />) : (
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {[...moms].filter((m) => isLead ? m.status === 'pending_review' : true).sort((a, b) => (b.meetingDate || 0) - (a.meetingDate || 0)).map((m, i) => (
                      <div key={`${m.projectId}:${m.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                        <span className="w-8 h-8 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><FileText className="w-4 h-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">{m.meetingTitle || m.momRef || 'Meeting'}</p>
                          <p className="text-xs text-slate-500"><b className="font-semibold text-slate-700">{m.projectName || projectName(m.projectId)}</b>{m.momRef ? <span className="font-mono"> · {m.momRef}</span> : ''}{m.meetingDate ? ` · ${fmtDay(dayKey(m.meetingDate))}` : ''}</p>
                        </div>
                        <span className={`${chip} ${m.status === 'pending_review' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : m.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {m.status === 'pending_review' ? 'Awaiting approval' : m.status === 'draft' ? 'Draft' : m.status.replace('_', ' ')}
                        </span>
                        {(isLead || m.status === 'draft' || m.status === 'pending_review') && (
                          <button type="button" className={btnSm} onClick={() => setReviewing(m)}>{isLead ? 'Review & approve' : m.status === 'draft' ? 'Edit & send' : 'Open'}</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          )}

          {section === 'pulse' && (
            <Panel icon={Activity} title="Client pulse" blurb="How each client relationship stands, out of 100, lowest first, with every point it gained or lost. Ask for a review or a referral when a client is happy.">
              {loading && !followUps.length ? <Loading /> : (
                <PulseList rows={pulseRows} onAsk={(projectId, kind) => setAskFor({ projectId, kind })}
                  onOpenProject={(id) => { setCareFocus({ projectId: id, kind: careFocus.kind }); setSection('checklists'); }} />
              )}
            </Panel>
          )}

          {section === 'visits' && (
            <Panel icon={CalendarCheck} title="Meetings & visits" blurb="Every meeting and site visit a client asked for, or the studio needs: agree a time, confirm it, move it, and close it out with the minutes.">
              <div className="space-y-4">
                {canWrite && <button type="button" className={btnSec} onClick={() => setVisitAct({ visit: null, to: null })}><Plus className="w-4 h-4" />Log a request</button>}
                {loading && !allVisits.length ? <Loading /> : <VisitsView visits={allVisits} projects={deskProjects as DeskProject[]} canWrite={canWrite} now={now} onAct={(visit, to) => setVisitAct({ visit, to })} />}
              </div>
            </Panel>
          )}

          {section === 'checklists' && (
            <Panel icon={ClipboardCheck} title="Checklists" blurb="Onboarding, the documents the studio needs from the client, and handover. Client Relations works them; a lead marks each one complete.">
              <ChecklistsView projects={deskProjects as DeskProject[]} care={Object.fromEntries(Object.entries(care).map(([k, v]: [string, ProjectCare]) => [k, v.checklists]))}
                money={Object.fromEntries(deskProjects.map((p) => [p.id, p.money]))}
                focus={{ projectId: careFocus.projectId || deskProjects[0]?.id || '', kind: careFocus.kind }} onFocus={setCareFocus}
                me={me} isLead={isLead} canWrite={canWrite} tenantId={tenantId} studioName={orgData?.orgName || ''} onChanged={load} />
            </Panel>
          )}

          {section === 'ask' && (
            <Panel icon={Search} title="Ask a project" blurb="Answers about one project from its payments, decisions, minutes and follow-ups, with where each came from. Costs and margins are never part of it.">
              <AskProjectPanel projects={deskProjects as DeskProject[]} rawProjects={projects} waiting={waiting} tenantId={tenantId} />
            </Panel>
          )}

          {section === 'prep' && (
            <Panel icon={CalendarClock} title="Meeting prep" blurb="Before a client meeting: what each side owes, the money, what was said last time, and an agenda to send or to start the minutes from.">
              <MeetingPrepPanel projects={deskProjects as DeskProject[]} rawProjects={projects} waiting={waiting} tenantId={tenantId} canWrite={canWrite && !isLead}
                onStartMinutes={(projectId, notes) => setWritingFor({ projectId, notes })} />
            </Panel>
          )}
        </div>
      </div>
      )}

      {logFor && (
        <LogFollowUpPanel projects={deskProjects as DeskProject[]} waiting={waiting} team={team} me={me} tenantId={tenantId}
          studioName={orgData?.orgName || ''} prefill={logFor} onClose={() => setLogFor(null)} onSaved={() => { setLogFor(null); load(); }} />
      )}
      {escFor && (
        <RaiseEscalationPanel projects={deskProjects as DeskProject[]} waiting={waiting} me={me} tenantId={tenantId}
          prefill={escFor} onClose={() => setEscFor(null)} onSaved={() => { setEscFor(null); setSection('escalations'); load(); }} />
      )}
      {capturing && (
        <CapturePanel projects={deskProjects as DeskProject[]} waiting={waiting} me={me} tenantId={tenantId}
          onClose={() => setCapturing(false)} onSaved={(escalated) => { setCapturing(false); setSection(escalated ? 'escalations' : 'log'); load(); }} />
      )}
      {askFor && (() => {
        const p = deskProjects.find((x) => x.id === askFor.projectId);
        return p ? (
          <AskSheet project={p as DeskProject} kind={askFor.kind} reason={askReasonOf(pulseRows.find((r) => r.project.id === p.id)?.prompts || [], askFor.kind)}
            me={me} tenantId={tenantId} studioName={orgData?.orgName || ''} reviewLink={settings.reviewLink}
            onClose={() => setAskFor(null)} onSaved={() => { setAskFor(null); load(); }} />
        ) : null;
      })()}
      {visitAct && (
        <VisitSheet projects={deskProjects as DeskProject[]} visit={visitAct.visit} to={visitAct.to} prefillProjectId={visitAct.projectId}
          me={me} tenantId={tenantId} studioName={orgData?.orgName || ''}
          onClose={() => setVisitAct(null)}
          onSaved={(r) => {
            setVisitAct(null);
            setSection('visits');
            load();
            if (r.status === 'done' && canWrite) setWritingFor({ projectId: r.projectId, notes: r.notes });
          }} />
      )}
      {deciding && <DecideEscalationPanel escalation={deciding} me={me} onClose={() => setDeciding(null)} onSaved={() => { setDeciding(null); load(); }} />}
      {reviewing && (
        <MomReviewModal mom={reviewing.raw} projectId={reviewing.projectId} studioId={tenantId}
          projectContextName={reviewing.projectName || projectName(reviewing.projectId)}
          client={clientContactOf(projects.find((p) => String(p?.id) === reviewing.projectId)?.context)}
          onClose={() => { setReviewing(null); load(); }} />
      )}
      {writingFor && (
        <MomCaptureModal
          visit={{ id: `ops-${Date.now()}`, type: 'client_meeting', title: 'Client meeting', date: Date.now(), notes: writingFor.notes, attendees: [] } as any}
          projectId={writingFor.projectId} studioId={tenantId} projectContextName={projectName(writingFor.projectId)}
          onClose={() => setWritingFor(null)}
          onSuccess={async (momId) => {
            const pid = writingFor.projectId;
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

/* The Studio settings card (DESIGN.md): icon chip, title, one line of why, then the content. */
const Panel: React.FC<{ icon: React.ComponentType<any>; title: string; blurb: string; children: React.ReactNode }> = ({ icon: Icon, title, blurb, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
    <div className={`flex items-start gap-3 ${children ? 'mb-5' : ''}`}>
      <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></div>
      <div className="min-w-0">
        <h2 className="font-bold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
      </div>
    </div>
    {children}
  </section>
);
const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">{text}</p>
);
const Loading: React.FC = () => (
  <p className="flex items-center gap-2 text-xs text-slate-500 py-2"><Dot tone="warn" live />Loading your desk…</p>
);
