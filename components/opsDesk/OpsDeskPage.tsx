import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNoteArrivals } from '../notify/NotifyContext';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Inbox, Clock, IndianRupee, ListChecks, Flag, FileText, Plus, RefreshCw, Search, CalendarClock,
  Activity, CalendarCheck, ClipboardCheck, UserPlus, GraduationCap, Eye, Layers, Sun,
} from '@/lib/lucide-shim';
import { useOrg } from '../../contexts/OrgContext';
import { FileCheck2 } from 'lucide-react';
import { listApprovals } from '../../services/designMeetingService';
import { approvalStage, sendsApprovals, type ApprovalItem } from '../../lib/designMeeting';
import { projectNameOf } from '../../lib/drawingReview';
import { hasRole, primaryRole, memberRoles } from '../../lib/roles';
import { seesStudioFinance, assignedDesignersFor } from '../../lib/roleAccess';
import { clientMoneyOf, withoutAmounts, type ClientMoney } from '../../lib/clientMoney';
import {
  buildQueue, decisionWaiting, paymentWaiting, withChases, opsSettingsOf, dayKey, type Escalation, type FollowUp, type QueueItem, type WaitingItem,
} from '../../lib/opsDesk';
import {
  DESK_SCOPES, inDeskScope, scopeCounts, doneToday, withSnoozes, liveSnoozes, teamRows, personQueue, weekNumbers, guideProgress,
  type DeskScope, type GuideStep, type GuideStepId,
} from '../../lib/opsTeam';
import { leadQueue, leadToProject, leadMeeting, linkLeadProject, isOpen as leadIsOpen, type Lead } from '../../lib/leads';
import { projectGuesses, projectRefOf } from '../../lib/leadSmart';
import { loadProjectOps, loadStudioOps, markNextDone, closeEscalation, logFollowUp, type OpsMom } from '../../services/opsDeskService';
import { loadLeads, saveLead, withTouch, deleteLead } from '../../services/leadsService';
import {
  loadDeskRecord, saveDeskRecord, loadTeamRecords, closeDay, loadDayNotes, loadMyDay, markNoteRead, moveNextStep, type DeskRecord, type DayNote,
} from '../../services/opsPeopleService';
import { useProjectTeam } from '../../services/projectTeam';
import { LogFollowUpPanel, RaiseEscalationPanel, DecideEscalationPanel, btnSec, type DeskProject, type LogPrefill, type Person } from './OpsDeskPanels';
import { Glide, Notice } from '../people/PeopleBits';
import { MomReviewModal } from '../ops/MomReviewModal';
import { MomCaptureModal } from '../ops/MomCaptureModal';
import AssignProjectsModal from '../projectHeader/AssignProjectsModal';
import { handoverSlip } from '../../lib/opsAssist';
import { clientContactOf } from '../../lib/minutes';
import { CapturePanel, AskProjectPanel, MeetingPrepPanel } from './OpsAssist';
import { CalendarAccountBar } from './MeetLink';
import { mirrorVisitOf } from '../../lib/meetingSync';
import { clientPulse, askPrompts, careQueue, type AskKind, type Checklist, type ChecklistKind, type VisitRequest, type VisitStatus } from '../../lib/clientCare';
import { AskSheet, ChecklistsView, VisitsView, VisitSheet, askReasonOf, type PulseRow } from './ClientCare';
import {
  DeskProvider, Panel, Loading, deskSectionV, firstName, waLink,
  type Desk, type DeskProjectFull, type DeskClient, type Section,
} from './DeskBits';
import { MyDay, FocusMode } from './MyDay';
import { ClientsScreen, ClientPage } from './ClientsView';
import { CommandPalette } from './CommandPalette';
import {
  WaitingScreen, PaymentsScreen, PulseScreen, LogScreen, EscalationsScreen, MinutesScreen, ApprovalsScreen, LeadsBand, CallingMode, VisitsBand, SimpleBand, Inner,
} from './DeskScreens';
import { DeskRail, SeeAs, useTiltCards, type DeskRailItem } from './Od2Bits';
import { healthOf, phaseOf, progressOf, daysUntil, streakOf, lastDays } from '../../lib/opsDesk2';
import { FirstWeek, Spotlight, type AskPerson } from './FirstWeek';
import { DayClose, type Rolled } from './DayClose';
import { TeamView } from './TeamView';
import { LeadsBoard, LeadPage, AddLeadSheet, OpenProjectSheet, LeadMeetingsTable } from './LeadsView';

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
      name: projectNameOf(p) || 'Project',
      clientName: String(p.context?.clientName || p.context?.client?.name || ''),
      clientEmail: clientContactOf(p.context).emails[0] || '',
      status: String(p.context?.status || ''),
      targetHandover: (p.context?.targetHandoverDate as string | undefined) || null,
      money: seesMoney ? money : withoutAmounts(money),
      location: String(p.context?.location || ''),
      config: String(p.context?.config || ''),
      raw: p,
    };
  }), [scoped, seesMoney]);
  const ids = useMemo(() => new Set(deskProjects.map((p) => p.id)), [deskProjects]);
  const projectRefs = useMemo(() => live.map(projectRefOf), [live]);

  const [section, setSection] = useState<Section>('today');
  const [loading, setLoading] = useState(true);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [decisions, setDecisions] = useState<Record<string, any[]>>({});
  const [moms, setMoms] = useState<OpsMom[]>([]);

  /*
    Drawings for approval: held design meetings whose agreed rooms wait for the
    client's written approval. Operations sends the email and records the
    answer here; the server hands the list over (designMeeting: approvals).
  */
  const sendsDrawingApprovals = sendsApprovals(roles) || isLead;
  const [approvalItems, setApprovalItems] = useState<ApprovalItem[] | null>(null);
  /*
    Every project the person can see, not only the desk's Actual/Dummy choice:
    a test or dummy project's approvals are found here too, and the panel
    picks one project at a time itself.
  */
  const approvalProjectList = useMemo(() => live.slice(0, 60).map((p) => ({ id: String(p.id), name: projectNameOf(p) || 'Project' })), [live]);
  const approvalProjects = useMemo(() => approvalProjectList.map((p) => p.id).join('|'), [approvalProjectList]);
  const loadApprovals = useCallback(async (only?: string) => {
    if (!tenantId || !sendsDrawingApprovals) return;
    const ids = only ? [only] : approvalProjects.split('|').filter(Boolean);
    const lists = await Promise.all(ids.map((projectId) => listApprovals({ orgId: tenantId, projectId }).catch(() => [] as ApprovalItem[])));
    const fresh = lists.flat();
    setApprovalItems((prev) => (only ? [...(prev || []).filter((i) => i.projectId !== only), ...fresh] : fresh)
      .sort((a, b) => b.closedAt - a.closedAt));
  }, [tenantId, sendsDrawingApprovals, approvalProjects]);
  useEffect(() => { void loadApprovals(); }, [loadApprovals]);
  const [care, setCare] = useState<Record<string, ProjectCare>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [record, setRecord] = useState<DeskRecord | null>(null);
  const [teamRecords, setTeamRecords] = useState<DeskRecord[]>([]);
  const [notes, setNotes] = useState<DayNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  /* A reload because a note arrived is quiet: no spinner, no "Loading" in the bar. */
  const quietLoad = useRef(false);
  const load = useCallback(async () => {
    if (!tenantId) return;
    const spin = !quietLoad.current;
    quietLoad.current = false;
    if (spin) setLoading(true);
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
      if (spin) setLoading(false);
    }
  }, [tenantId, isLead, deskProjects, myEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  /* The days this person closed, for the streak on My day: the last three weeks, read once and after each close. */
  const [closedDays, setClosedDays] = useState<string[]>([]);
  const [closedTick, setClosedTick] = useState(0);
  useEffect(() => {
    if (!tenantId || !myEmail || isLead) return;
    let live = true;
    Promise.all(lastDays(Date.now(), 21).map((day) => loadMyDay(tenantId, myEmail, day).catch(() => null)))
      .then((notes) => { if (live) setClosedDays(notes.filter(Boolean).map((n) => (n as DayNote).day)); });
    return () => { live = false; };
  }, [tenantId, myEmail, isLead, closedTick]);

  /* A client's reply, an escalation or a new enquiry: the desk catches up at once, once for a burst (components/notify). */
  const arrival = useRef<number | null>(null);
  useNoteArrivals((n) => /^(client|ops|lead|site)\./.test(n.kind), () => {
    if (arrival.current) window.clearTimeout(arrival.current);
    arrival.current = window.setTimeout(() => { arrival.current = null; quietLoad.current = true; load(); }, 700);
  });

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
  /* The projects' meetings and visits, and the meetings booked with leads (lib/leads leadMeeting). */
  const allVisits = useMemo(() => [
    ...Object.values(care).flatMap((c: ProjectCare) => c.visits),
    ...(leads.map(leadMeeting).filter(Boolean) as VisitRequest[]),
  ], [care, leads]);
  const done = useMemo(() => doneToday(fu, myEmail, now), [fu, myEmail, now]);

  /* ── Panels ── */
  const [logFor, setLogFor] = useState<LogPrefill | null>(null);
  const [escFor, setEscFor] = useState<LogPrefill | null>(null);
  const [deciding, setDeciding] = useState<Escalation | null>(null);
  const [reviewing, setReviewing] = useState<OpsMom | null>(null);
  /* `visit`: the desk booking's meeting in the project's log (lib/meetingSync), so the minutes are tied to it. */
  const [writingFor, setWritingFor] = useState<{ projectId: string; notes: string; visit?: ReturnType<typeof mirrorVisitOf> } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [askFor, setAskFor] = useState<{ projectId: string; kind: AskKind } | null>(null);
  const [visitAct, setVisitAct] = useState<{ visit: VisitRequest | null; to: VisitStatus | null; projectId?: string } | null>(null);
  const [careFocus, setCareFocus] = useState<{ projectId: string; kind: ChecklistKind }>({ projectId: '', kind: 'onboarding' });
  const [clientId, setClientId] = useState<string | null>(null);
  const setClientFor = (id: string | null) => { if (!id) return; setClientId(id); setSection('client'); setLeadOpen(null); window.scrollTo?.({ top: 0, behavior: still ? 'auto' : 'smooth' }); };
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const [calling, setCalling] = useState(false);
  const [leadOpen, setLeadOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ paste: boolean } | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [closing, setClosing] = useState(false);
  const [spot, setSpot] = useState<GuideStep | null>(null);
  const [askQ, setAskQ] = useState<string>('');
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const go = (s: Section) => { setSection(s); if (s !== 'leads') setLeadOpen(null); if (s !== 'client') setClientId(null); };
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
    approvals: (approvalItems || []).filter((i) => approvalStage({ approval: i.approval, confirmation: i.confirmation as any }) !== 'approved').length,
    escalations: esc.filter((e) => e.status !== 'closed').length,
    team: rows.filter((r) => r.overdue).length,
  };
  const progress = record ? guideProgress(record.guide, {
    logged: fu.some((f) => f.by === myEmail), minutes: mm.some((m) => String(m.raw?.preparedBy?.email || '').toLowerCase() === myEmail),
    lead: leads.some((l) => l.createdBy === myEmail), escalated: esc.some((e) => e.raisedBy === myEmail),
  }) : null;
  const groups: { label?: string; items: DeskRailItem<Section>[] }[] = [
    { label: 'Today', items: [
      { id: 'today', label: 'My day', icon: Sun, n: n.today, alert: overdue > 0 },
      { id: 'waiting', label: 'Waiting on client', icon: Clock, n: n.waiting },
    ] },
    { label: 'Clients', items: [
      { id: 'clients', label: 'Clients', icon: Layers, n: deskProjects.length },
      { id: 'pulse', label: 'Client pulse', icon: Activity, n: n.pulse, alert: true },
      { id: 'leads', label: 'Leads', icon: UserPlus, n: n.leads, alert: true },
      ...(sendsDrawingApprovals ? [{ id: 'approvals' as Section, label: 'Drawings for approval', icon: FileCheck2, n: n.approvals, alert: (approvalItems || []).some((i) => approvalStage({ approval: i.approval, confirmation: i.confirmation as any }) === 'overdue') }] : []),
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
  const paletteSections = groups.flatMap((g) => g.items.map((x) => ({ id: x.id, label: x.label, icon: x.icon })));

  /*
    The 2.1 view of each client (lib/opsDesk2): health from the pulse, the
    step from proposal to handover from the project's status, progress from
    its journey, and the first thing on the desk for it.
  */
  const clients: DeskClient[] = useMemo(() => deskProjects.map((p) => {
    const row = pulseRows.find((r) => r.project.id === p.id);
    const pulse = row?.pulse || { score: 80, band: 'good' as const, confidence: 'low' as const, reasons: [], lastHeardAt: null };
    const ctx = p.raw?.context || {};
    const handover = care[p.id]?.checklists.handover;
    const phase = phaseOf({ ...ctx, status: p.status }, { now, handoverStarted: !!handover && (handover.items || []).some((x: any) => x?.state && x.state !== 'open') });
    const item = queue.find((q) => q.projectId === p.id) || null;
    const worst = pulse.reasons.filter((r) => r.points < 0).sort((a, b) => a.points - b.points)[0];
    const people = ctx.clientName || ctx.client?.name || p.clientName;
    return {
      id: p.id, name: p.name, client: String(people || ''), line: [p.config, p.location].filter(Boolean).join(' · '), phone: String(ctx.clientPhone || ''),
      health: healthOf(pulse.band), score: pulse.score, pulse, phase, progress: progressOf(ctx, phase),
      handoverKey: p.targetHandover, handoverDays: daysUntil(p.targetHandover, now),
      next: item ? item.title : worst ? worst.label : phase.complete ? 'Handed over. Ask for a review when the time is right.' : 'Nothing due. A good moment to check in.',
      nextWhy: item ? `${item.detail}` : worst ? 'What the pulse says' : 'Nothing is waiting on this client.',
      nextItem: item,
    };
  }), [deskProjects, pulseRows, care, queue, now]);

  const canWrite = isLead || isCR || !['Viewer', 'Designer', 'Site Supervisor', 'Vendor'].includes(primaryRole(roles));
  const projectName = (id: string) => deskProjects.find((p) => p.id === id)?.name || '';

  const desk: Desk = {
    tenantId, studioName: orgData?.orgName || '', me, isLead, isCR, canWrite, seesMoney, now, loading, settings, team,
    projects: deskProjects, projectRefs, queue, waiting, followUps: fu, escalations: esc, moms: mm, visits: allVisits, pulseRows, leads, done, record, bumped,
    clients, closedDays, decisions, approvals: sendsDrawingApprovals ? approvalItems : null, teamRows: rows, clientId,
    act: {
      go, log: setLogFor, escalate: setEscFor, capture: () => setCapturing(true), openItem: onItem, openClient: setClientFor, openLead,
      addLead: () => setAdding({ paste: false }), bookVisit: (projectId) => setVisitAct({ visit: null, to: null, projectId }),
      openProject: (id, tab) => onOpenProject(id, tab), markDone: done_, later: (q) => setBumped((b) => [...b.filter((x) => x !== q.id), q.id]),
      sendReminder, refresh: load, closeDay: () => setClosing(true),
      palette: () => setPaletteOpen(true), focus: () => setFocusing(true),
    },
  };

  const currentLead = leadOpen ? leads.find((l) => l.id === leadOpen) || null : null;
  const replaceLead = (l: Lead) => setLeads((ls) => ls.map((x) => (x.id === l.id ? l : x)));

  /*
    A lead joins its project on its own: a project is opened in StudioDesk for
    the proposal, so once a lead is at Site measured, Proposal sent or Won and
    has none, the one project with the same client phone or email is linked,
    with a note in its touches. Names alone are only offered (WonSheet), never
    linked unasked. Each lead is tried once per visit.
  */
  const autoLinked = useRef(new Set<string>());
  useEffect(() => {
    if (!canWrite || !leads.length || !projectRefs.length) return;
    const taken = new Set<string>(leads.filter((l) => l.projectId).map((l) => l.projectId!));
    for (const l of leads) {
      if (l.projectId || autoLinked.current.has(l.id) || !['measured', 'proposal', 'won'].includes(l.stage) || !(isLead || l.ownerEmail === myEmail)) continue;
      autoLinked.current.add(l.id);
      const g = projectGuesses(l, projectRefs, taken);
      const top = g[0];
      if (!top || top.score < 90 || (g[1] && g[1].score >= top.score) || taken.has(top.project.id)) continue;
      taken.add(top.project.id);
      saveLead(linkLeadProject(l, top.project, me, Date.now()), myEmail).then(replaceLead).catch(() => undefined);
    }
  }, [leads, projectRefs, canWrite, isLead, myEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Ctrl K (or /) opens the palette from anywhere on the desk; cards lean towards the pointer. */
  const rootRef = useRef<HTMLDivElement>(null);
  useTiltCards(rootRef);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement | null)?.tagName || '') || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !document.querySelector('[role="dialog"]')) { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <DeskProvider value={desk}>
    <div className="od2 pb-28" ref={rootRef}>
      {/* Named by the shell's title row, like Projects. Under it, the desk's toolbar: search, which projects, refresh, log. */}
      <div className="od-top">
        <button type="button" className="od-kbar" onClick={() => setPaletteOpen(true)} aria-label="Search or run a command" aria-keyshortcuts="Control+K">
          <Search /><span className="od-lbl">Search or say what to do…</span><kbd className="od-kbd">Ctrl K</kbd>
        </button>
        {isLead && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Projects:</span>
            <Glide id="desk-scope" label="Which projects" value={scope} onChange={setScope}
              options={DESK_SCOPES.map((s) => ({ id: s.id, label: `${s.label} ${counts[s.id]}` }))} />
          </div>
        )}
        <span className="flex-1" />
        <button type="button" onClick={load} disabled={loading} aria-label="Refresh" title="Refresh" className="od-btn sm">
          <RefreshCw className={loading ? 'animate-spin' : ''} />Refresh
        </button>
        {canWrite && <button type="button" className="od-btn pri pp-press" onClick={() => setLogFor({})}><Plus />Log a follow-up</button>}
      </div>

      <AnimatePresence>{notice && <div className="mb-4"><Notice text={notice} onClose={() => setNotice(null)} /></div>}</AnimatePresence>

      {!deskProjects.length && !loading && !leads.length ? (
        <Panel icon={Inbox} title={isLead && scope !== 'all' ? `No ${DESK_SCOPES.find((s) => s.id === scope)?.label.toLowerCase()} projects on the desk` : 'No projects on your desk yet'}
          blurb={isCR ? 'Ask a lead to assign you projects in Studio settings → Team. You can add leads meanwhile.' : isLead && scope !== 'all' ? 'Choose another set of projects above, or tag projects Actual or Dummy on their context card.' : 'Active projects appear here.'}>
          {canWrite ? <button type="button" className={btnSec} onClick={() => setAdding({ paste: false })}><UserPlus className="w-4 h-4" />Add a lead</button> : null}
        </Panel>
      ) : (
      <div className="od-shell">
        <DeskRail groups={groups} on={section === 'client' ? 'clients' : section} onPick={go} />

        <div className="od-main">
          {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
          {/*
            A section turns in when it changes. No exit is waited on: a swap that waits
            for the old section to finish leaving can be left waiting (framer-motion 11
            with React 19), and the screen then stays empty with no error.
          */}
          <motion.div key={section === 'leads' ? `leads:${leadOpen || ''}` : section === 'client' ? `client:${clientId}` : section} variants={still ? undefined : deskSectionV} initial={still ? false : 'hidden'} animate="show"
            className="flex flex-col gap-5 min-w-0" style={{ transformOrigin: '50% 0%' }}>

          {section === 'today' && <MyDay />}
          {section === 'clients' && <ClientsScreen />}
          {section === 'client' && clientId && <ClientPage id={clientId} />}

          {section === 'leads' && (currentLead ? (
            <LeadPage lead={currentLead} owners={crPeople} opener={opener} onBack={() => setLeadOpen(null)}
              onSaved={replaceLead}
              onDelete={async (l) => { try { await deleteLead(l.id); setLeads((ls) => ls.filter((x) => x.id !== l.id)); setLeadOpen(null); } catch { setError('The lead was not deleted. Try again.'); } }}
              onOpenProject={setConverting} />
          ) : (
            <>
              <LeadsBand onAdd={() => setAdding({ paste: false })} onPaste={() => setAdding({ paste: true })} onCalling={() => setCalling(true)} />
              <SeeAs />
              <LeadsBoard hideHead opener={opener} onOpen={setLeadOpen} onAdd={() => setAdding({ paste: false })} onPaste={() => setAdding({ paste: true })} onMoved={replaceLead} onConvert={setConverting} />
            </>
          ))}

          {section === 'team' && isLead && (
            <>
              <SimpleBand eyebrow="The team" title="Everyone’s desk at a glance" sub="Who has what today, what they closed, how their first week is going, and the note they left when they closed the day."
                tiles={[
                  { count: rows.reduce((s, r) => s + (r.total - r.done), 0), title: 'Open today', sub: 'Across the team' },
                  { count: rows.reduce((s, r) => s + r.done, 0), title: 'Done today', sub: 'So far' },
                  { count: weekNumbers(fu, leads, esc, now).logged, title: 'Touches this week', sub: 'Calls, WhatsApps, emails' },
                ]} />
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
            </>
          )}

          {section === 'guide' && (
            <>
              <SimpleBand eyebrow="How the desk works" title={progress ? `Your first week · ${progress.count} of ${progress.total}` : 'How the desk works'}
                sub="The things that make the desk yours. “Show me” takes you there and lights the button."
                tiles={[
                  ...(progress ? [{ ring: { p: progress.count / Math.max(1, progress.total), label: <b className="od-num">{progress.count}/{progress.total}</b> }, title: 'First week', sub: 'Steps done' }] : []),
                  ...(!isLead ? [{ count: streakOf(closedDays, now), unit: 'd', title: 'Streak', sub: 'Days closed in a row' }] : []),
                ]} />
              <FirstWeek people={askPeople}
                onShowMe={(s) => { if (s.target === 'clients' || s.target === 'today') setSection('today'); window.setTimeout(() => setSpot(s), 450); }}
                onTick={(id: GuideStepId) => record && saveRecord({ ...record, guide: { ...record.guide, [id]: Date.now() } })}
                onHide={() => record && saveRecord({ ...record, guideHiddenUntil: dayKey(now + 86400000) })}
                onAsk={(q) => { setAskQ(q); go('ask'); }} />
            </>
          )}

          {section === 'approvals' && sendsDrawingApprovals && (
            <ApprovalsScreen projects={approvalProjectList} lead={hasRole(roles, new Set(['Design Head', 'Owner', 'Admin', 'Super Admin']))}
              onChanged={(projectId) => { void loadApprovals(projectId); }} />
          )}

          {section === 'waiting' && <WaitingScreen slipOf={(w) => handoverSlip(w, deskProjects.find((p) => p.id === w.projectId)?.targetHandover).days} />}

          {section === 'payments' && <PaymentsScreen />}

          {section === 'log' && <LogScreen busy={busy} onDone={(id) => { const f = fu.find((x) => x.id === id); if (f) void done_(f); }} />}

          {section === 'escalations' && <EscalationsScreen busy={busy} onDecide={setDeciding} onClose={(e) => { void close(e); }} />}

          {section === 'minutes' && <MinutesScreen onReview={setReviewing} onWrite={(projectId) => setWritingFor({ projectId, notes: '' })} />}

          {section === 'pulse' && <PulseScreen onAsk={(projectId, kind) => setAskFor({ projectId, kind })} />}

          {section === 'visits' && (
            <>
              <VisitsBand onLog={() => setVisitAct({ visit: null, to: null })} />
              <SeeAs />
              <Inner>
                <div className="flex flex-col gap-4">
                  {canWrite && <CalendarAccountBar onError={setError} />}
                  {loading && !allVisits.length ? <Loading /> : <VisitsView visits={allVisits.filter((v) => v.source !== 'lead')} projects={deskProjects as DeskProject[]} canWrite={canWrite} now={now} onAct={(visit, to) => setVisitAct({ visit, to })} onOpenLead={openLead} />}
                </div>
              </Inner>
              {/* Leads have no project yet, so their meetings are tracked apart, each marked as a lead's (lib/leads leadMeetingRows). */}
              <LeadMeetingsTable onOpenLead={openLead} />
            </>
          )}

          {section === 'checklists' && (
            <>
              <SimpleBand eyebrow="Checklists" title="Onboarding, documents and handover" sub="Client Relations works them; a lead marks each one complete."
                tiles={[
                  { count: n.checklists, title: 'Waiting on you', sub: 'Items to chase or tick', alarm: n.checklists > 0 },
                  { count: deskProjects.filter((p) => care[p.id]?.checklists.handover?.completedAt).length, title: 'Handed over', sub: 'Handover marked complete' },
                  { count: deskProjects.filter((p) => care[p.id]?.checklists.onboarding?.completedAt).length, title: 'Onboarded', sub: 'Onboarding marked complete' },
                ]} />
              <SeeAs />
              <Inner>
                <ChecklistsView projects={deskProjects as DeskProject[]} care={Object.fromEntries(Object.entries(care).map(([k, v]: [string, ProjectCare]) => [k, v.checklists]))}
                  money={Object.fromEntries(deskProjects.map((p) => [p.id, p.money]))}
                  focus={{ projectId: careFocus.projectId || deskProjects[0]?.id || '', kind: careFocus.kind }} onFocus={setCareFocus}
                  me={me} isLead={isLead} canWrite={canWrite} tenantId={tenantId} studioName={orgData?.orgName || ''} onChanged={load} />
              </Inner>
            </>
          )}

          {section === 'ask' && (
            <>
              <SimpleBand eyebrow="Ask a project" title="Ask anything about a project" sub={`Answers from its payments, decisions, minutes and follow-ups, with where each came from. Costs and margins are never part of it${seesMoney ? '' : ', nor are amounts'}.`} />
              <Inner key={`ask:${askQ}`}>
                <AskProjectPanel projects={deskProjects as DeskProject[]} rawProjects={scoped} waiting={waiting} tenantId={tenantId} initialQuestion={askQ} />
              </Inner>
            </>
          )}

          {section === 'prep' && (
            <>
              <SimpleBand eyebrow="Meeting prep" title="Before you meet a client" sub="What each side owes, where the payments stand, what was said last time, and an agenda to send or to start the minutes from." />
              <SeeAs />
              <Inner>
                <MeetingPrepPanel projects={deskProjects as DeskProject[]} rawProjects={scoped} waiting={waiting} tenantId={tenantId} canWrite={canWrite && !isLead}
                  onStartMinutes={(projectId, notes) => setWritingFor({ projectId, notes })} />
              </Inner>
            </>
          )}
          </motion.div>
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
            if (r.status === 'done' && canWrite) setWritingFor({ projectId: r.projectId, notes: r.notes, visit: r.visit ? mirrorVisitOf(r.visit) : undefined });
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
          visit={(writingFor.visit ? { ...writingFor.visit, notes: writingFor.notes } : { id: `ops-${Date.now()}`, type: 'client_meeting', title: 'Client meeting', date: Date.now(), notes: writingFor.notes, attendees: [] }) as any}
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
      {paletteOpen && <CommandPalette sections={paletteSections} onClose={() => setPaletteOpen(false)} />}
      {focusing && <FocusMode onClose={() => setFocusing(false)} />}
      {calling && <CallingMode onClose={() => setCalling(false)} onSaved={replaceLead} />}
      {adding && (
        <AddLeadSheet owners={crPeople} paste={adding.paste} onClose={() => setAdding(null)}
          onOpenExisting={(id) => { setAdding(null); openLead(id); }}
          onCreated={(l) => { setAdding(null); setLeads((ls) => [l, ...ls]); openLead(l.id); setNotice(`Lead added. ${l.next ? `First step: ${l.next.text}.` : ''}`); }} />
      )}
      {converting && (
        <OpenProjectSheet lead={converting} opener={opener} onClose={() => setConverting(null)}
          onAsk={async () => {
            const l = withTouch({ ...converting, openRequest: { at: Date.now(), by: myEmail, byName: me.name } }, { kind: 'stage', text: `Asked ${opener} to open the project for the proposal` }, me);
            replaceLead(await saveLead(l, myEmail));
            setConverting(null);
            setNotice(`${opener} has it on their desk. The project comes back to you, assigned to you, once it is open.`);
          }}
          onOpen={async () => {
            if (!onCreateFromLead) throw new Error('Opening a project is not available here.');
            const projectId = await onCreateFromLead(leadToProject(converting));
            /* Opened for the proposal, and linked to the lead; it is won later, when the client says yes. */
            const early = ['new', 'talking', 'meeting', 'measured'].includes(converting.stage);
            const l = withTouch({ ...converting, stage: early ? 'proposal' : converting.stage, projectId, openRequest: null }, { kind: 'stage', text: early ? 'Moved to Proposal sent' : 'The project is open for the proposal' }, me);
            replaceLead(await saveLead(l, myEmail));
            if (converting.ownerEmail && converting.ownerEmail !== myEmail) await assign({ id: projectId }, converting.ownerEmail).catch(() => undefined);
            setConverting(null);
            setNotice(`The project is open, linked to the lead and on ${converting.ownerName || 'the owner'}’s desk.`);
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
            setClosedDays((ds) => [...new Set([dayKey(now), ...ds])]);
            setClosedTick((t) => t + 1);
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
