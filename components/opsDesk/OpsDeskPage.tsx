import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Inbox, Clock, IndianRupee, ListChecks, Flag, FileText, Plus, RefreshCw, Check, Phone, MessageCircle, Mail, Users, Mic, Search, CalendarClock,
  Activity, CalendarCheck, ClipboardCheck, UserPlus, GraduationCap, Sunset, Eye,
} from '@/lib/lucide-shim';
import { useOrg } from '../../contexts/OrgContext';
import { hasRole, primaryRole, memberRoles } from '../../lib/roles';
import { seesStudioFinance, assignedDesignersFor } from '../../lib/roleAccess';
import { clientMoneyOf, withoutAmounts, type ClientMoney } from '../../lib/clientMoney';
import {
  buildQueue, decisionWaiting, paymentWaiting, withChases, opsSettingsOf, inr, dayKey, daysBetween,
  type Escalation, type FollowUp, type QueueItem, type WaitingItem,
} from '../../lib/opsDesk';
import {
  DESK_SCOPES, inDeskScope, scopeCounts, doneToday, dayRing, withSnoozes, liveSnoozes, teamRows, personQueue, weekNumbers, guideProgress,
  type DeskScope, type GuideStep, type GuideStepId,
} from '../../lib/opsTeam';
import { leadQueue, leadToProject, isOpen as leadIsOpen, type Lead } from '../../lib/leads';
import { loadProjectOps, loadStudioOps, markNextDone, closeEscalation, logFollowUp, type OpsMom } from '../../services/opsDeskService';
import { loadLeads, saveLead, withTouch, deleteLead } from '../../services/leadsService';
import {
  loadDeskRecord, saveDeskRecord, loadTeamRecords, closeDay, loadDayNotes, markNoteRead, moveNextStep, type DeskRecord, type DayNote,
} from '../../services/opsPeopleService';
import { useProjectTeam } from '../../services/projectTeam';
import { LogFollowUpPanel, RaiseEscalationPanel, DecideEscalationPanel, btnPri, btnSec, btnSm, input, type DeskProject, type LogPrefill, type Person } from './OpsDeskPanels';
import { StudioBar, BarStrip, BarChip, BarButton } from '../ui/StudioBar';
import { CountUp, Dot } from '../ui/HudBits';
import { Glide, Ring, Notice, listV, rowV } from '../people/PeopleBits';
import { MomReviewModal } from '../ops/MomReviewModal';
import { MomCaptureModal } from '../ops/MomCaptureModal';
import AssignProjectsModal from '../projectHeader/AssignProjectsModal';
import { handoverSlip } from '../../lib/opsAssist';
import { clientContactOf } from '../../lib/minutes';
import { CapturePanel, AskProjectPanel, MeetingPrepPanel } from './OpsAssist';
import { clientPulse, askPrompts, careQueue, type AskKind, type Checklist, type ChecklistKind, type VisitRequest, type VisitStatus } from '../../lib/clientCare';
import { PulseList, AskSheet, ChecklistsView, VisitsView, VisitSheet, askReasonOf, type PulseRow } from './ClientCare';
import {
  DeskProvider, Panel, Rail, Empty, Loading, Chip, deskSectionV, fmtDay, fmtWhen, firstName, waLink,
  type Desk, type DeskProjectFull, type RailGroup, type Section,
} from './DeskBits';
import { TodayView } from './TodayView';
import { ClientSheet } from './ClientSheet';
import { FirstWeek, Spotlight, type AskPerson } from './FirstWeek';
import { DayClose, type Rolled } from './DayClose';
import { TeamView } from './TeamView';
import { LeadsBoard, LeadPage, AddLeadSheet, OpenProjectSheet } from './LeadsView';

/*
  THE OPS DESK (lib/opsDesk.ts, lib/opsTeam.ts, lib/leads.ts).

  For Client Relations it is the working day: it opens on the one thing to do
  now, then the day in order, each row able to say why it is there; their
  clients, their week and their leads; a first-week guide while they are new;
  and closing the day with a note for the lead. For the studio's leads it is
  also where escalations are decided, minutes approved, leads opened as
  projects, and each person's desk seen at a glance, with the studio's real
  projects apart from its dummy ones. The smart assist (OpsAssist.tsx) captures
  chats and calls, answers questions about a project and prepares meetings.
  Client care (ClientCare.tsx) reads each client's pulse, works the checklists,
  books meetings and visits, and asks for reviews and referrals.

  Client Relations never sees an amount: their copy of each project has none
  (functions/src/teamViewStrip.ts), and the screens here leave them out for
  anyone who does not see the studio's money.
*/

interface ProjectCare { checklists: Partial<Record<ChecklistKind, Checklist>>; visits: VisitRequest[] }
const LEADS = ['Super Admin', 'Owner', 'Admin', 'Ops Director'];
/* Projects with nothing left to chase: lost ones, and drafts that never came from a lead on the desk. */
const quiet = (p: any) => {
  const s = String(p?.context?.status || '');
  return s === 'lost' || ((s === 'lead' || s === 'draft') && !p?.context?.leadId);
};
const SCOPE_KEY = 'opsDesk.scope';

const CHANNEL_ICON: Record<string, React.ComponentType<any>> = { call: Phone, whatsapp: MessageCircle, email: Mail, meeting: Users, other: MessageCircle };
const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';

export default function OpsDeskPage({ projects, onOpenProject, onCreateFromLead }: {
  projects: any[];
  onOpenProject: (projectId: string, tab?: string) => void;
  /** A lead opens a project from a lead (lib/leads leadToProject); resolves to the new project's id. */
  onCreateFromLead?: (context: Record<string, any>) => Promise<string>;
}) {
  const { orgData, currentRole, currentRoles, currentUserAuth, teamMembers } = useOrg() as any;
  const still = useReducedMotion();
  const tenantId: string = orgData?.tenantId || '';
  const roles = currentRoles?.length ? currentRoles : [currentRole];
  const isLead = hasRole(roles, LEADS);
  const isCR = primaryRole(roles) === 'Client Relations';
  const seesMoney = seesStudioFinance(roles);
  const settings = useMemo(() => opsSettingsOf(orgData), [orgData]);
  const rawTeam: any[] = useMemo(() => ((orgData?.team || teamMembers || []) as any[]).filter((m) => m?.email && String(m.role) !== 'Client'), [orgData?.team, teamMembers]);
  const team: Person[] = useMemo(() => rawTeam.map((m) => ({ email: String(m.email).trim().toLowerCase(), name: m.name || m.email })), [rawTeam]);
  const myEmail = String(currentUserAuth?.email || '').toLowerCase();
  const me: Person = { email: myEmail, name: team.find((t) => t.email === myEmail)?.name || currentUserAuth?.displayName || myEmail };
  const { map: assignMap, toggle: assign } = useProjectTeam();

  /* The leads choose which projects the desk works on: actual, dummy, untagged or all (lib/opsTeam). */
  const [scope, setScopeState] = useState<DeskScope>(() => {
    try { return (localStorage.getItem(SCOPE_KEY) as DeskScope) || 'actual'; } catch { return 'actual'; }
  });
  const setScope = (s: DeskScope) => { setScopeState(s); try { localStorage.setItem(SCOPE_KEY, s); } catch { /* private window */ } };
  const live = useMemo(() => projects.filter((p) => p?.id && !quiet(p)), [projects]);
  const counts = useMemo(() => scopeCounts(live), [live]);
  const scoped = useMemo(() => (isLead ? live.filter((p) => inDeskScope(p, scope)) : live), [live, isLead, scope]);

  const deskProjects: DeskProjectFull[] = useMemo(() => scoped.map((p) => {
    const money = ((p as any).clientMoney !== undefined ? (p as any).clientMoney : clientMoneyOf(p)) as ClientMoney | null;
    return {
      id: String(p.id),
      name: String(p.context?.name || 'Project'),
      clientName: String(p.context?.clientName || p.context?.client?.name || ''),
      status: String(p.context?.status || ''),
      targetHandover: (p.context?.targetHandoverDate as string | undefined) || null,
      money: seesMoney ? money : withoutAmounts(money),
      location: String(p.context?.location || ''),
      config: String(p.context?.config || ''),
      raw: p,
    };
  }), [scoped, seesMoney]);
  const ids = useMemo(() => new Set(deskProjects.map((p) => p.id)), [deskProjects]);

  const [section, setSection] = useState<Section>('today');
  const [loading, setLoading] = useState(true);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [decisions, setDecisions] = useState<Record<string, any[]>>({});
  const [moms, setMoms] = useState<OpsMom[]>([]);
  const [care, setCare] = useState<Record<string, ProjectCare>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [record, setRecord] = useState<DeskRecord | null>(null);
  const [teamRecords, setTeamRecords] = useState<DeskRecord[]>([]);
  const [notes, setNotes] = useState<DayNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      /* The newer records are read on their own, so the desk still opens before their rules are deployed. */
      const [ls, rec, recs, ns] = await Promise.all([
        loadLeads(tenantId, myEmail, isLead).catch((e) => { console.warn('Ops Desk leads', e?.code || e); return [] as Lead[]; }),
        loadDeskRecord(tenantId, me).catch(() => null),
        isLead ? loadTeamRecords(tenantId).catch(() => [] as DeskRecord[]) : Promise.resolve([] as DeskRecord[]),
        isLead ? loadDayNotes(tenantId, dayKey(Date.now() - 7 * 86400000)).catch(() => [] as DayNote[]) : Promise.resolve([] as DayNote[]),
      ]);
      setLeads(ls);
      setRecord(rec);
      setTeamRecords(recs);
      setNotes(ns);
      setNow(Date.now());
    } catch (e: any) {
      setError('Some of the desk could not be loaded. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, isLead, deskProjects, myEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  /* For a lead, the studio-wide records are cut to the projects in scope, so Dummy work stays apart. */
  const fu = useMemo(() => (isLead ? followUps.filter((f) => ids.has(f.projectId)) : followUps), [followUps, ids, isLead]);
  const esc = useMemo(() => (isLead ? escalations.filter((e) => ids.has(e.projectId)) : escalations), [escalations, ids, isLead]);
  const mm = useMemo(() => (isLead ? moms.filter((m) => ids.has(m.projectId)) : moms), [moms, ids, isLead]);

  const waiting: WaitingItem[] = useMemo(() => withChases(deskProjects.flatMap((p) => [
    ...paymentWaiting(p, p.money, settings, now),
    ...decisionWaiting(p, decisions[p.id] || [], now),
  ]), fu), [deskProjects, decisions, fu, settings, now]);

  const pulseRows: PulseRow[] = useMemo(() => deskProjects.map((p) => {
    const w = waiting.filter((x) => x.projectId === p.id);
    const f = fu.filter((x) => x.projectId === p.id);
    const e = esc.filter((x) => x.projectId === p.id);
    const pulse = clientPulse({
      waiting: w, followUps: f, escalations: e, moms: mm.filter((x) => x.projectId === p.id), visits: care[p.id]?.visits || [], money: p.money, targetHandover: p.targetHandover, now,
    });
    const handedOver = p.status === 'completed' || !!care[p.id]?.checklists.handover?.completedAt;
    const prompts = askPrompts({ followUps: f, handedOver, pulse, latePayment: w.some((x) => (x.overdueDays || 0) > 0), openEscalation: e.some((x) => x.status === 'open'), now });
    return { project: p as DeskProject, pulse, prompts };
  }), [deskProjects, waiting, fu, esc, mm, care, now]);

  const careItems = useMemo(() => careQueue(deskProjects.map((p) => ({
    id: p.id, name: p.name, status: p.status, targetHandover: p.targetHandover,
    checklists: care[p.id]?.checklists || {}, visits: care[p.id]?.visits || [],
    prompts: pulseRows.find((r) => r.project.id === p.id)?.prompts || [],
  })), fu, isLead, now), [deskProjects, care, pulseRows, fu, isLead, now]);

  const [bumped, setBumped] = useState<string[]>([]);
  const queue = useMemo(() => {
    const all = buildQueue({ now, me: myEmail, isLead, followUps: fu, waiting, moms: mm, escalations: esc, extra: [...careItems, ...leadQueue(leads, myEmail, isLead, now)] });
    const { shown } = withSnoozes(all, record?.snoozes, now);
    const order = { overdue: 0, today: 1, week: 2, later: 3 } as const;
    /* "Later today" sends a row to the end of its day; the order is otherwise the desk's. */
    return shown.map((q, i) => ({ q, i })).sort((a, b) => order[a.q.group] - order[b.q.group] || Number(bumped.includes(a.q.id)) - Number(bumped.includes(b.q.id)) || a.i - b.i).map((x) => x.q);
  }, [now, myEmail, isLead, fu, waiting, mm, esc, careItems, leads, record?.snoozes, bumped]);
  const allVisits = useMemo(() => Object.values(care).flatMap((c: ProjectCare) => c.visits), [care]);
  const done = useMemo(() => doneToday(fu, myEmail, now), [fu, myEmail, now]);
  const ring = dayRing(queue, done);

  /* ── Panels ── */
  const [logFor, setLogFor] = useState<LogPrefill | null>(null);
  const [escFor, setEscFor] = useState<LogPrefill | null>(null);
  const [deciding, setDeciding] = useState<Escalation | null>(null);
  const [reviewing, setReviewing] = useState<OpsMom | null>(null);
  const [writingFor, setWritingFor] = useState<{ projectId: string; notes: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [askFor, setAskFor] = useState<{ projectId: string; kind: AskKind } | null>(null);
  const [visitAct, setVisitAct] = useState<{ visit: VisitRequest | null; to: VisitStatus | null; projectId?: string } | null>(null);
  const [careFocus, setCareFocus] = useState<{ projectId: string; kind: ChecklistKind }>({ projectId: '', kind: 'onboarding' });
  const [clientFor, setClientFor] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ paste: boolean } | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [closing, setClosing] = useState(false);
  const [spot, setSpot] = useState<GuideStep | null>(null);
  const [askQ, setAskQ] = useState<string>('');
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const go = (s: Section) => { setSection(s); if (s !== 'leads') setLeadOpen(null); };
  const done_ = async (f: FollowUp) => {
    setBusy(f.id);
    try { await markNextDone(f.projectId, f.id, myEmail); await load(); } catch { setError('That was not saved. Try again.'); } finally { setBusy(null); }
  };
  const close = async (e: Escalation) => {
    setBusy(e.id);
    try { await closeEscalation(e.projectId, e.id); await load(); } catch { setError('That was not saved. Try again.'); } finally { setBusy(null); }
  };
  const openLead = (id: string) => { setSection('leads'); setLeadOpen(id); };

  const onItem = (q: QueueItem) => {
    if (q.kind === 'payment' || q.kind === 'decision') return setLogFor({ projectId: q.projectId, subjectKey: q.ref });
    if (q.kind === 'mom_review') return setReviewing(mm.find((m) => m.id === q.ref) || null);
    if (q.kind === 'escalation_open') return setDeciding(esc.find((e) => e.id === q.ref) || null);
    if (q.kind === 'escalation_decided') return go('escalations');
    if (q.kind === 'lead' || q.kind === 'lead_open') return openLead(q.ref);
    if (q.kind === 'next') {
      const f = fu.find((x) => x.id === q.ref);
      return f ? done_(f) : go('log');
    }
    if (q.kind === 'visit') {
      const v = allVisits.find((x) => x.id === q.ref);
      if (!v) return go('visits');
      const today = dayKey(now);
      return setVisitAct({ visit: v, to: v.status === 'confirmed' ? (v.slot && v.slot.date < today ? 'done' : 'confirmed') : 'confirmed' });
    }
    if (q.kind === 'documents' || q.kind === 'checklist') {
      setCareFocus({ projectId: q.projectId, kind: q.ref as ChecklistKind });
      return go('checklists');
    }
    if (q.kind === 'ask') return setAskFor({ projectId: q.projectId, kind: q.ref as AskKind });
  };

  /* Send a ready reminder on WhatsApp, and log it so the daily check counts it. */
  const sendReminder = async (w: WaitingItem, text: string) => {
    const p = deskProjects.find((x) => x.id === w.projectId);
    const phone = clientContactOf(p?.raw?.context).phone;
    window.open(waLink(phone, text), '_blank', 'noopener');
    try {
      await logFollowUp({
        tenantId, projectId: w.projectId, projectName: w.projectName, me, channel: 'whatsapp', outcome: 'reminded',
        note: `Sent on WhatsApp: ${text.split('\n').find((l) => l.trim() && !/^hi\b/i.test(l.trim())) || 'reminder'}`.slice(0, 300),
        subject: { kind: w.kind, key: w.key, label: w.label }, next: null,
      });
      setNotice('Reminder logged. It comes back on your desk in three days if there is no reply.');
      await load();
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'You cannot log on this project. Ask a lead to assign it to you.' : 'The reminder was sent but not logged. Log it by hand.');
    }
  };

  const saveRecord = async (r: DeskRecord) => {
    setRecord(r);
    try { await saveDeskRecord(r); } catch { setError('Your desk could not be saved. Try again.'); }
  };

  /* ── People ── */
  const leadPeople = rawTeam.filter((m) => memberRoles(m).some((r) => r === 'Ops Director' || r === 'Owner' || r === 'Admin'));
  const opener = firstName((leadPeople.find((m) => memberRoles(m).includes('Ops Director')) || leadPeople[0])?.name || 'a lead');
  const crPeople: Person[] = rawTeam.filter((m) => memberRoles(m).includes('Client Relations')).map((m) => ({ email: String(m.email).toLowerCase(), name: m.name || m.email }));
  const askPeople: AskPerson[] = rawTeam
    .filter((m) => String(m.email).toLowerCase() !== myEmail && !memberRoles(m).every((r) => r === 'Vendor' || r === 'Viewer'))
    .sort((a, b) => Number(memberRoles(b).some((r) => LEADS.includes(r))) - Number(memberRoles(a).some((r) => LEADS.includes(r))))
    .slice(0, 6)
    .map((m) => ({ email: String(m.email).toLowerCase(), name: m.name || m.email, role: memberRoles(m).join(' + '), phone: String(m.phone || m.mobile || '') }));

  /* ── The lead's view of the team ── */
  const projectsOf = useCallback((email: string) => deskProjects.filter((p) => assignedDesignersFor(p.raw, assignMap).includes(email)).map((p) => p.id), [deskProjects, assignMap]);
  const teamInput = { now, projectsOf, followUps: fu, waiting, moms: mm, escalations: esc, leads };
  const rows = useMemo(() => (isLead ? teamRows({
    ...teamInput,
    people: crPeople.map((p) => {
      const rec = teamRecords.find((r) => r.email === p.email);
      return { ...p, role: 'Client Relations', isNew: !!rec && now - rec.startedAt < 7 * 86400000 };
    }),
  }) : []), [isLead, crPeople.map((p) => p.email).join(','), teamRecords, now, fu, waiting, mm, esc, leads, projectsOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const atRisk = pulseRows.filter((r) => r.pulse.band === 'at_risk').length;
  const overdue = queue.filter((q) => q.group === 'overdue').length;
  const dueToday = queue.filter((q) => q.group === 'today').length;
  const leadsToCall = leads.filter((l) => leadIsOpen(l) && (l.ownerEmail === myEmail || isLead) && (!l.firstTouchAt || (l.openRequest && !l.projectId && isLead))).length;
  const n = {
    today: overdue + dueToday,
    leads: leadsToCall,
    pulse: atRisk,
    waiting: waiting.length,
    payments: waiting.filter((w) => w.kind === 'payment').length,
    visits: allVisits.filter((v) => v.status === 'requested' || v.status === 'rescheduled').length,
    minutes: isLead ? mm.filter((m) => m.status === 'pending_review').length : mm.filter((m) => m.status === 'draft' || m.status === 'pending_review').length,
    log: 0,
    checklists: careItems.filter((q) => q.kind === 'documents' || q.kind === 'checklist').length,
    escalations: esc.filter((e) => e.status !== 'closed').length,
    team: rows.filter((r) => r.overdue).length,
  };
  const progress = record ? guideProgress(record.guide, {
    logged: fu.some((f) => f.by === myEmail), minutes: mm.some((m) => String(m.raw?.preparedBy?.email || '').toLowerCase() === myEmail),
    lead: leads.some((l) => l.createdBy === myEmail), escalated: esc.some((e) => e.raisedBy === myEmail),
  }) : null;
  const groups: RailGroup[] = [
    { items: [{ id: 'today', label: 'Today', icon: Inbox, n: n.today, alert: overdue > 0 }] },
    { label: 'Clients', items: [
      { id: 'leads', label: 'Leads', icon: UserPlus, n: n.leads },
      { id: 'pulse', label: 'Client pulse', icon: Activity, n: n.pulse, alert: true },
      { id: 'waiting', label: 'Waiting on client', icon: Clock, n: n.waiting },
      { id: 'payments', label: 'Payments', icon: IndianRupee, n: n.payments },
    ] },
    { label: 'Meetings', items: [
      { id: 'visits', label: 'Meetings & visits', icon: CalendarCheck, n: n.visits },
      { id: 'minutes', label: 'Minutes', icon: FileText, n: n.minutes, tour: 'minutes' },
      { id: 'prep', label: 'Meeting prep', icon: CalendarClock },
    ] },
    { label: 'Records', items: [
      { id: 'log', label: 'Follow-up log', icon: ListChecks },
      { id: 'checklists', label: 'Checklists', icon: ClipboardCheck, n: n.checklists },
      { id: 'escalations', label: 'Escalations', icon: Flag, n: n.escalations, alert: true },
    ] },
    ...(isLead ? [{ label: 'Team', items: [{ id: 'team' as Section, label: 'The team', icon: Eye, n: n.team, alert: true }] }] : []),
    { label: 'Help', items: [
      { id: 'ask', label: 'Ask a project', icon: Search },
      { id: 'guide', label: !isLead && record && now - record.startedAt < 14 * 86400000 && progress && progress.count < progress.total ? `Your first week · ${progress.count}/${progress.total}` : 'How the desk works', icon: GraduationCap },
    ] },
  ];

  const canWrite = isLead || isCR || !['Viewer', 'Designer', 'Site Supervisor', 'Vendor'].includes(primaryRole(roles));
  const projectName = (id: string) => deskProjects.find((p) => p.id === id)?.name || '';
  const hour = Number(new Date(now).toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const due = overdue + dueToday;
  const clientsWord = `${deskProjects.length} client${deskProjects.length === 1 ? '' : 's'}`;

  const desk: Desk = {
    tenantId, studioName: orgData?.orgName || '', me, isLead, isCR, canWrite, seesMoney, now, loading, settings, team,
    projects: deskProjects, queue, waiting, followUps: fu, escalations: esc, moms: mm, visits: allVisits, pulseRows, leads, done, record, bumped,
    act: {
      go, log: setLogFor, escalate: setEscFor, capture: () => setCapturing(true), openItem: onItem, openClient: setClientFor, openLead,
      addLead: () => setAdding({ paste: false }), bookVisit: (projectId) => setVisitAct({ visit: null, to: null, projectId }),
      openProject: (id, tab) => onOpenProject(id, tab), markDone: done_, later: (q) => setBumped((b) => [...b.filter((x) => x !== q.id), q.id]),
      sendReminder, refresh: load, closeDay: () => setClosing(true),
    },
  };

  const currentLead = leadOpen ? leads.find((l) => l.id === leadOpen) || null : null;
  const replaceLead = (l: Lead) => setLeads((ls) => ls.map((x) => (x.id === l.id ? l : x)));

  return (
    <DeskProvider value={desk}>
    <div className="pb-28">
      {/* Named by the shell's title row, like Projects; this is the bar under it. */}
      <StudioBar className="mb-4">
        <BarStrip label="Your day">
          <Ring value={ring.ratio} size={34} stroke={4} tone={ring.total && ring.done === ring.total ? 'ok' : 'brand'} label={`${ring.done} of ${ring.total} done today`}>
            <span className="block text-[10px] leading-none font-black text-slate-800 tabular-nums"><CountUp value={ring.done} />/{ring.total}</span>
          </Ring>
          <span className="text-xs font-semibold text-slate-700 mr-1">
            {loading ? 'Loading your desk…' : due
              ? `${hello}, ${firstName(me.name)}. Start with the one at the top.`
              : `${hello}, ${firstName(me.name)}. Nothing is due today across ${isLead ? 'the studio’s' : 'your'} ${clientsWord}.`}
          </span>
          {!loading && (
            <>
              <BarChip n={overdue} word="overdue" tone="bad" onClick={() => go('today')} />
              <BarChip n={dueToday} word="due today" tone="warn" onClick={() => go('today')} />
              <BarChip n={atRisk} word={atRisk === 1 ? 'client at risk' : 'clients at risk'} tone="bad" onClick={() => go('pulse')} />
              <BarChip n={done.length} word="done today" tone="ok" onClick={() => go('today')} />
            </>
          )}
        </BarStrip>
        {canWrite && (
          <>
            <BarButton onClick={() => setCapturing(true)}><Mic className="w-4 h-4" />Capture a chat or call</BarButton>
            <BarButton data-tour="lead" onClick={() => setAdding({ paste: false })}><UserPlus className="w-4 h-4" />Add a lead</BarButton>
            <BarButton data-tour="escalate" onClick={() => setEscFor({})}><Flag className="w-4 h-4" />Raise an escalation</BarButton>
            {!isLead && <BarButton onClick={() => setClosing(true)}><Sunset className="w-4 h-4" />Close my day</BarButton>}
            <BarButton primary data-tour="log" className="pp-press" onClick={() => setLogFor({})}><Plus className="w-4 h-4" />Log a follow-up</BarButton>
          </>
        )}
      </StudioBar>

      {/* The toolbar, as on Projects: which projects the desk is looking at, and a refresh. */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 pb-3 mb-6 border-b border-slate-200/50">
        {isLead ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Projects:</span>
            <Glide id="desk-scope" label="Which projects" value={scope} onChange={setScope}
              options={DESK_SCOPES.map((s) => ({ id: s.id, label: `${s.label} ${counts[s.id]}` }))} />
          </div>
        ) : <span />}
        <button type="button" onClick={load} disabled={loading} aria-label="Refresh" title="Refresh"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 hover:border-slate-400 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <AnimatePresence>{notice && <div className="mb-4"><Notice text={notice} onClose={() => setNotice(null)} /></div>}</AnimatePresence>

      {!deskProjects.length && !loading && !leads.length ? (
        <Panel icon={Inbox} title={isLead && scope !== 'all' ? `No ${DESK_SCOPES.find((s) => s.id === scope)?.label.toLowerCase()} projects on the desk` : 'No projects on your desk yet'}
          blurb={isCR ? 'Ask a lead to assign you projects in Studio settings → Team. You can add leads meanwhile.' : isLead && scope !== 'all' ? 'Choose another set of projects above, or tag projects Actual or Dummy on their context card.' : 'Active projects appear here.'}>
          {canWrite ? <button type="button" className={btnSec} onClick={() => setAdding({ paste: false })}><UserPlus className="w-4 h-4" />Add a lead</button> : null}
        </Panel>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-6 items-start">
        <Rail groups={groups} on={section} onPick={go} />

        <div className="min-w-0" style={{ perspective: 1600 }}>
          {error && <p className="mb-4 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
          <AnimatePresence mode="wait">
          <motion.div key={section === 'leads' ? `leads:${leadOpen || ''}` : section} variants={still ? undefined : deskSectionV} initial={still ? false : 'hidden'} animate="show" exit="exit"
            className="flex flex-col gap-6 min-w-0" style={{ transformOrigin: '50% 0%' }}>

          {section === 'today' && <TodayView />}

          {section === 'leads' && (currentLead ? (
            <LeadPage lead={currentLead} owners={crPeople} opener={opener} onBack={() => setLeadOpen(null)}
              onSaved={replaceLead}
              onDelete={async (l) => { try { await deleteLead(l.id); setLeads((ls) => ls.filter((x) => x.id !== l.id)); setLeadOpen(null); } catch { setError('The lead was not deleted. Try again.'); } }}
              onOpenProject={setConverting} />
          ) : (
            <LeadsBoard onOpen={setLeadOpen} onAdd={() => setAdding({ paste: false })} onPaste={() => setAdding({ paste: true })} />
          ))}

          {section === 'team' && isLead && (
            <TeamView rows={rows}
              queueOf={(email) => personQueue(email, teamInput)}
              doneOf={(email) => doneToday(fu, email, now)}
              notes={notes}
              guideOf={(email) => {
                const rec = teamRecords.find((r) => r.email === email);
                return guideProgress(rec?.guide, { logged: fu.some((f) => f.by === email), minutes: false, lead: leads.some((l) => l.createdBy === email), escalated: esc.some((e) => e.raisedBy === email) }).count;
              }}
              week={weekNumbers(fu, leads, esc, now)}
              onAssign={setAssignFor}
              onRead={async (note) => { try { await markNoteRead(note, myEmail); setNotes((ns) => ns.map((x) => (x === note ? { ...x, readBy: [...(x.readBy || []), myEmail] } : x))); } catch { setError('That was not saved. Try again.'); } }} />
          )}

          {section === 'guide' && (
            <FirstWeek people={askPeople}
              onShowMe={(s) => { if (s.target === 'clients' || s.target === 'today') setSection('today'); window.setTimeout(() => setSpot(s), 450); }}
              onTick={(id: GuideStepId) => record && saveRecord({ ...record, guide: { ...record.guide, [id]: Date.now() } })}
              onHide={() => record && saveRecord({ ...record, guideHiddenUntil: dayKey(now + 86400000) })}
              onAsk={(q) => { setAskQ(q); go('ask'); }} />
          )}

          {section === 'waiting' && (
            <Panel icon={Clock} title="Waiting on client" blurb="Every payment and decision the studio is waiting for, how long it has waited, when it was last chased, and how far it can push the handover.">
              {loading && !waiting.length ? <Loading /> : waiting.length === 0 ? <Empty icon={Clock} text="Nothing is waiting on a client." /> : (
                <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {[...waiting].sort((a, b) => b.days - a.days).map((w) => {
                    const slip = handoverSlip(w, deskProjects.find((p) => p.id === w.projectId)?.targetHandover);
                    return (
                    <motion.div variants={rowV} key={`${w.projectId}:${w.key}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <Dot tone={w.overdueDays || w.days >= 7 ? 'bad' : w.days >= 3 ? 'warn' : 'ok'} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{w.kind === 'payment' ? 'Payment' : 'Decision'}: {w.label}</p>
                        <p className="text-xs text-slate-500"><button type="button" className="font-semibold text-slate-700 hover:text-[#3D52A0] hover:underline" onClick={() => setClientFor(w.projectId)}>{w.projectName}</button> · waiting {w.days} day{w.days === 1 ? '' : 's'}
                          {w.kind === 'payment' && w.amount && seesMoney ? ` · ${inr(w.amount)}` : ''}{w.overdueDays ? ` · ${w.overdueDays} day${w.overdueDays === 1 ? '' : 's'} late` : ''}</p>
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
                    </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </Panel>
          )}

          {section === 'payments' && (
            deskProjects.every((p) => !p.money) && !loading
              ? <Panel icon={IndianRupee} title="Payments" blurb="No payment schedules on these projects yet.">{null}</Panel>
              : deskProjects.filter((p) => p.money).map((p) => {
                const m = p.money!;
                const shown = seesMoney && !m.amountsHidden && m.totalPaid != null;
                const paid = m.milestones.filter((x) => x.status === 'paid').length;
                return (
                <Panel key={p.id} icon={IndianRupee} title={p.name}
                  blurb={shown
                    ? `Paid ${inr(m.totalPaid ?? 0)} of ${inr(m.projectValue ?? 0)} · ${inr(m.balanceDue ?? 0)} still to come. Late ${settings.paymentDueDays} days after the invoice.`
                    : `${paid} of ${m.milestones.length} milestones paid. Late ${settings.paymentDueDays} days after the invoice. Amounts are with the leads.`}
                  right={<button type="button" className={btnSm} onClick={() => setClientFor(p.id)}><Users className="w-3.5 h-3.5" />Client</button>}>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead><tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
                        <th className="px-3 py-2">Milestone</th><th className="px-3 py-2">Status</th>
                        {shown && <th className="px-3 py-2 text-right">Owed</th>}<th className="px-3 py-2">Invoiced</th><th className="px-3 py-2">Due</th><th className="px-3 py-2" />
                      </tr></thead>
                      <motion.tbody variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100">
                        {m.milestones.map((ms) => {
                          const w = waiting.find((x) => x.projectId === p.id && x.key === `pay:${ms.id}`);
                          return (
                            <motion.tr variants={rowV} key={ms.id}>
                              <td className="px-3 py-2 text-sm font-semibold text-slate-800">{ms.name}{ms.invoiceNumber ? <span className="font-mono text-xs font-normal text-slate-400"> · {ms.invoiceNumber}</span> : null}</td>
                              <td className="px-3 py-2"><span className={`${chip} ${ms.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : ms.status === 'invoiced' ? (w?.overdueDays ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700') : 'bg-slate-100 text-slate-600'}`}>{ms.status === 'invoiced' && w?.overdueDays ? `${w.overdueDays}d late` : ms.status}</span></td>
                              {shown && <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{inr(ms.owed ?? 0)}</td>}
                              <td className="px-3 py-2 text-slate-600">{ms.invoiceDate ? fmtDay(String(ms.invoiceDate).slice(0, 10)) : '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{w?.dueKey ? fmtDay(w.dueKey) : '—'}</td>
                              <td className="px-3 py-2 text-right">{w && canWrite && <button type="button" className={btnSm} onClick={() => setLogFor({ projectId: p.id, subjectKey: w.key })}>Remind</button>}</td>
                            </motion.tr>
                          );
                        })}
                      </motion.tbody>
                    </table>
                  </div>
                </Panel>
                );
              })
          )}

          {section === 'log' && (
            <Panel icon={ListChecks} title="Follow-up log" blurb="Every call, WhatsApp and email to a client, logged by hand, newest first. Tick a next step when it is done.">
              {loading && !fu.length ? <Loading /> : fu.length === 0 ? <Empty icon={ListChecks} text="Nothing logged yet. Use Log a follow-up after your next call." /> : (
                <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {[...fu].sort((a, b) => b.at - a.at).slice(0, 200).map((f) => {
                    const Icon = CHANNEL_ICON[f.channel] || MessageCircle;
                    return (
                      <motion.div variants={rowV} key={f.id} className="group flex gap-3 px-3 py-2.5">
                        <span className="pp-tile w-8 h-8 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0]"><Icon className="w-4 h-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800"><button type="button" className="hover:text-[#3D52A0] hover:underline" onClick={() => setClientFor(f.projectId)}>{f.projectName || projectName(f.projectId)}</button>{f.subject ? <span className="font-normal text-slate-500"> · {f.subject.label}</span> : null}</p>
                          {f.note && <p className="text-xs text-slate-700 whitespace-pre-line">{f.note}</p>}
                          <p className="text-[11px] text-slate-500">{f.byName || f.by} · {fmtWhen(f.at)} · {String(f.outcome).replace('_', ' ')} · logged by hand</p>
                          {f.next && (
                            <p className={`mt-1 text-xs ${f.nextDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>Next: {f.next.text} · {f.next.ownerName} · {fmtDay(f.next.due)}</p>
                          )}
                        </div>
                        {f.next && !f.nextDone && canWrite && <button type="button" className={`${btnSm} self-start`} disabled={busy === f.id} onClick={() => done_(f)}><Check className="w-3.5 h-3.5" />Done</button>}
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </Panel>
          )}

          {section === 'escalations' && (
            <Panel icon={Flag} title="Escalations" blurb={isLead ? 'Stuck things put in front of the leads. Decide each one; the decision goes back to whoever raised it.' : 'What you have put in front of the leads, and their decisions. Close one once you have acted on it.'}>
              {esc.filter((e) => e.status !== 'closed').length === 0 ? (loading ? <Loading /> : <Empty icon={Flag} text="No open escalations." />) : (
                <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {[...esc].filter((e) => e.status !== 'closed').sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.raisedAt - a.raisedAt).map((e) => (
                    <motion.div variants={rowV} key={e.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
                      <span className="pt-1.5"><Dot tone={e.status === 'open' ? 'bad' : 'ok'} live={e.status === 'open'} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                        <p className="text-xs text-slate-500"><button type="button" className="font-semibold text-slate-700 hover:text-[#3D52A0] hover:underline" onClick={() => setClientFor(e.projectId)}>{e.projectName}</button> · {e.auto ? 'raised by the daily check' : `raised by ${e.raisedByName || e.raisedBy}`} · {daysBetween(e.raisedAt, now) === 0 ? 'today' : `${daysBetween(e.raisedAt, now)} day${daysBetween(e.raisedAt, now) === 1 ? '' : 's'} ago`}</p>
                        {e.detail && <p className="text-xs text-slate-700 mt-1 whitespace-pre-line">{e.detail}</p>}
                        {e.status === 'decided' && <p className="mt-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-3 py-2"><b>{e.decidedByName || e.decidedBy}:</b> {e.decision}</p>}
                      </div>
                      <span className={`${chip} ${e.status === 'open' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{e.status === 'open' ? 'Waiting for a decision' : 'Decided'}</span>
                      {e.status === 'open' && isLead && <button type="button" className={btnSm} onClick={() => setDeciding(e)}>Decide</button>}
                      {e.status === 'decided' && (e.raisedBy === myEmail || e.auto || isLead) && canWrite && <button type="button" className={btnSm} disabled={busy === e.id} onClick={() => close(e)}><Check className="w-3.5 h-3.5" />Done, close it</button>}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </Panel>
          )}

          {section === 'minutes' && (
            <Panel icon={FileText} title={isLead ? 'Minutes to approve' : 'Minutes'} blurb={isLead ? 'Minutes written by Client Relations. Read, edit if needed, then approve: that finalises them and opens the email to the client.' : 'Write the minutes of a client meeting and send them for approval. They reach the client only once a lead approves them.'}>
              <div className="flex flex-col gap-4">
                {canWrite && (
                  <div className="max-w-sm">
                    <label htmlFor="mom-project" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Write minutes for</label>
                    <select id="mom-project" className={input} value={writingFor?.projectId || ''} onChange={(e) => setWritingFor(e.target.value ? { projectId: e.target.value, notes: '' } : null)}>
                      <option value="">Choose a project</option>
                      {deskProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                {mm.filter((m) => (isLead ? m.status === 'pending_review' : true)).length === 0 ? (loading ? <Loading /> : <Empty icon={FileText} text={isLead ? 'No minutes are waiting for approval.' : 'No minutes on your projects yet.'} />) : (
                  <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {[...mm].filter((m) => (isLead ? m.status === 'pending_review' : true)).sort((a, b) => (b.meetingDate || 0) - (a.meetingDate || 0)).map((m) => (
                      <motion.div variants={rowV} key={`${m.projectId}:${m.id}`} className="group flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <span className="pp-tile w-8 h-8 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0]"><FileText className="w-4 h-4" /></span>
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
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </Panel>
          )}

          {section === 'pulse' && (
            <Panel icon={Activity} title="Client pulse" blurb="How each client relationship stands, out of 100, lowest first, with every point it gained or lost. Ask for a review or a referral when a client is happy.">
              {loading && !fu.length ? <Loading /> : (
                <PulseList rows={pulseRows} onAsk={(projectId, kind) => setAskFor({ projectId, kind })} onOpenProject={(id) => setClientFor(id)} />
              )}
            </Panel>
          )}

          {section === 'visits' && (
            <Panel icon={CalendarCheck} title="Meetings & visits" blurb="Every meeting and site visit a client asked for, or the studio needs: agree a time, confirm it, move it, and close it out with the minutes.">
              <div className="flex flex-col gap-4">
                {canWrite && <button type="button" className={`${btnSec} self-start`} onClick={() => setVisitAct({ visit: null, to: null })}><Plus className="w-4 h-4" />Log a request</button>}
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
            <Panel key={`ask:${askQ}`} icon={Search} title="Ask a project" blurb={`Answers about one project from its payments, decisions, minutes and follow-ups, with where each came from. Costs and margins are never part of it${seesMoney ? '' : ', nor are amounts'}.`}>
              <AskProjectPanel projects={deskProjects as DeskProject[]} rawProjects={scoped} waiting={waiting} tenantId={tenantId} initialQuestion={askQ} />
            </Panel>
          )}

          {section === 'prep' && (
            <Panel icon={CalendarClock} title="Meeting prep" blurb="Before a client meeting: what each side owes, where the payments stand, what was said last time, and an agenda to send or to start the minutes from.">
              <MeetingPrepPanel projects={deskProjects as DeskProject[]} rawProjects={scoped} waiting={waiting} tenantId={tenantId} canWrite={canWrite && !isLead}
                onStartMinutes={(projectId, notes) => setWritingFor({ projectId, notes })} />
            </Panel>
          )}
          </motion.div>
          </AnimatePresence>
        </div>
      </div>
      )}

      {logFor && (
        <LogFollowUpPanel projects={deskProjects as DeskProject[]} waiting={waiting} team={team} me={me} tenantId={tenantId}
          studioName={orgData?.orgName || ''} prefill={logFor} onClose={() => setLogFor(null)} onSaved={() => { setLogFor(null); load(); }} />
      )}
      {escFor && (
        <RaiseEscalationPanel projects={deskProjects as DeskProject[]} waiting={waiting} me={me} tenantId={tenantId}
          prefill={escFor} onClose={() => setEscFor(null)} onSaved={() => { setEscFor(null); go('escalations'); load(); }} />
      )}
      {capturing && (
        <CapturePanel projects={deskProjects as DeskProject[]} waiting={waiting} me={me} tenantId={tenantId}
          onClose={() => setCapturing(false)} onSaved={(escalated) => { setCapturing(false); go(escalated ? 'escalations' : 'log'); load(); }} />
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
            go('visits');
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
      <AnimatePresence>{clientFor && <ClientSheet key={clientFor} projectId={clientFor} onClose={() => setClientFor(null)} />}</AnimatePresence>
      {adding && (
        <AddLeadSheet owners={crPeople} paste={adding.paste} onClose={() => setAdding(null)}
          onOpenExisting={(id) => { setAdding(null); openLead(id); }}
          onCreated={(l) => { setAdding(null); setLeads((ls) => [l, ...ls]); openLead(l.id); setNotice(`Lead added. ${l.next ? `First step: ${l.next.text}.` : ''}`); }} />
      )}
      {converting && (
        <OpenProjectSheet lead={converting} opener={opener} onClose={() => setConverting(null)}
          onAsk={async () => {
            const l = withTouch({ ...converting, openRequest: { at: Date.now(), by: myEmail, byName: me.name } }, { kind: 'stage', text: `Asked ${opener} to open the project` }, me);
            replaceLead(await saveLead(l, myEmail));
            setConverting(null);
            setNotice(`${opener} has it on their desk. The project comes back to you, assigned to you, once it is open.`);
          }}
          onOpen={async () => {
            if (!onCreateFromLead) throw new Error('Opening a project is not available here.');
            const projectId = await onCreateFromLead(leadToProject(converting));
            const l = withTouch({ ...converting, stage: 'won', projectId }, { kind: 'stage', text: 'Won: the project is open' }, me);
            replaceLead(await saveLead(l, myEmail));
            if (converting.ownerEmail && converting.ownerEmail !== myEmail) await assign({ id: projectId }, converting.ownerEmail).catch(() => undefined);
            setConverting(null);
            setNotice(`The project is open and on ${converting.ownerName || 'the owner'}’s desk.`);
          }} />
      )}
      {closing && (
        <DayClose leadName={opener}
          onClose={() => setClosing(false)}
          onSave={async (rolled: Rolled[], note: string) => {
            const snoozes = { ...liveSnoozes(record?.snoozes, now) };
            for (const { q, to } of rolled) {
              const f = q.kind === 'next' ? fu.find((x) => x.id === q.ref) : null;
              if (f?.next) await moveNextStep(f.projectId, f.id, f.next, to, myEmail);
              else snoozes[q.id] = to;
            }
            if (record) await saveDeskRecord({ ...record, snoozes });
            await closeDay({
              tenantId, email: myEmail, name: me.name, day: dayKey(now), note,
              closed: done.map((x) => `${x.title} · ${x.project}`.slice(0, 200)).slice(0, 60),
              rolled: rolled.map(({ q, to }) => ({ title: `${q.title} · ${q.projectName}`.slice(0, 200), to })).slice(0, 60),
            });
            if (record) setRecord({ ...record, snoozes });
            load();
          }} />
      )}
      {spot && (
        <Spotlight step={spot} index={(['clients', 'today', 'log', 'escalate', 'minutes', 'lead'] as GuideStepId[]).indexOf(spot.id) + 1}
          onBack={() => setSpot(null)}
          onDone={() => { const id = spot.id; setSpot(null); if (record) saveRecord({ ...record, guide: { ...record.guide, [id]: Date.now() } }); }} />
      )}
      {assignFor && <AssignProjectsModal designerEmail={assignFor} onClose={() => { setAssignFor(null); }} />}
    </div>
    </DeskProvider>
  );
}
