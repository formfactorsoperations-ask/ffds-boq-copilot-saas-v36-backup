import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Home as HomeIcon, List, Loader2, Presentation, Undo2 } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { usePageHeader } from '../../contexts/PageHeaderContext';
import { canPresentAssigned, canReview, canRunMeeting, canSetAudience, canUpload, stateOf } from '../../lib/drawingReview';
import { sendsApprovals, type DesignMeeting } from '../../lib/designMeeting';
import { attention, projectLook, reviewQueue, statsOf, type Viewer } from '../../lib/designDesk';
import { mainAction } from '../../lib/designDesk2';
import { canUseRoomMessages } from '../../lib/roomMessages';
import { useProjectMessages } from '../roomMessages/useProjectMessages';
import { useProjectTeam } from '../../services/projectTeam';
import { watchStudioReviews, watchProjectDrawings, takeOpenRequest, returnFromDesk, submitSheet, type ReviewDrawing, type DeskOrigin } from '../../services/drawingReviewService';
import { watchMeetings } from '../../services/designMeetingService';
import type { Me } from '../drawingReview/SheetStudio';
import AddPdfs from '../drawingReview/AddPdfs';
import { ToastHost, ReviewStyles, useToast } from '../drawingReview/ui';
import { DeskStyles } from '../drawingReview/DeskParts';
import { MotionStyles } from '../drawingReview/motion';
import { AllDrawings, Home, ProjectPage, RoomPage, type DeskCtx, type ProjectCard } from './pages';
import UploadWizard from './UploadWizard';
import DrawingScreen from './DrawingScreen';
import MeetingsPage from './MeetingsPage';
import MeetingScreen from './MeetingScreen';
import { cx } from './parts';
import '../projectHeader/projectHeader.css';

/*
  DESIGN DESK 2.0, the frame (build plan, Phase 1).

  A green rail with Home, All drawings and Meetings, and one page beside it.
  Home says what to do first; a project opens to its rooms, a room to its
  drawings. The drawings, their states and every rule are today's: this reads
  the same data as components/drawingReview/DesignDeskTab and calls the same
  functions. Opening a drawing shows the new drawing screen (DrawingScreen);
  a drawing with no PDF yet goes straight to the three-step upload. Meetings
  is the new Meetings page and meeting screen (Phase 2), on today's meeting
  rules.
*/

interface Props {
  projects: any[];
  /** The project open elsewhere in the app. */
  activeProjectId?: string | null;
  /** Shown to people who may switch the studio back to today's desk. */
  onUseClassic?: () => void;
}

type Page = { at: 'home' } | { at: 'all' } | { at: 'meetings' } | { at: 'project'; projectId: string } | { at: 'room'; projectId: string; room: string };

/* Designers watch each of their projects' trackers; past this many, only the open one is watched. */
const MAX_WATCHED = 24;

export default function DeskTwo(props: Props) {
  return (
    <ToastHost>
      <ReviewStyles />
      <DeskStyles />
      <MotionStyles />
      <Desk {...props} />
    </ToastHost>
  );
}

function Desk({ projects, activeProjectId, onUseClassic }: Props) {
  const toast = useToast();
  const { orgData, currentRole, currentRoles, currentUserAuth } = useOrg();
  const orgId = orgData?.tenantId || 'demo-tenant-01';
  const role: string[] = currentRoles?.length ? currentRoles : [String(currentRole || '')];
  const reviewer = canReview(role);
  const uploader = canUpload(role);
  const canRun = canRunMeeting(role);
  const canBill = canSetAudience(role);
  const presenter = canPresentAssigned(role);
  const approver = sendsApprovals(role);
  const meetsTab = canRun || canBill || presenter;
  const team = useProjectTeam();
  const me: Me = {
    uid: currentUserAuth?.uid || '',
    email: String(currentUserAuth?.email || '').toLowerCase(),
    name: currentUserAuth?.displayName || currentUserAuth?.email || 'You',
  };
  const viewer: Viewer = useMemo(() => ({ reviewer, email: me.email }), [reviewer, me.email]);

  const list = useMemo(() => (projects || [])
    .map((p: any) => ({
      id: String(p.id),
      name: String(p.context?.name || p.name || p.context?.clientName || 'Untitled project'),
      client: p.context?.clientName ? String(p.context.clientName) : undefined,
    }))
    .map((p) => ({ ...p, client: p.client && !p.name.toLowerCase().includes(p.client.toLowerCase()) ? p.client : undefined }))
    .filter((p) => p.id), [projects]);
  const listKey = list.map((p) => p.id).join(',');

  /* ------------------------------------------------------------ where we are */
  const [page, setPage] = useState<Page>({ at: 'home' });
  const go = useCallback((p: Page) => { setPage(p); window.scrollTo({ top: 0 }); }, []);
  const pageProject = page.at === 'project' || page.at === 'room' ? page.projectId : null;
  /* Meetings works on one project at a time: the one last opened, else the one open elsewhere in the app. */
  const [meetProject, setMeetProject] = useState<string | null>(activeProjectId || null);
  useEffect(() => { if (pageProject) setMeetProject(pageProject); }, [pageProject]);
  const [q, setQ] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  /* ------------------------------------------------------------ data (as today's desk) */
  const [studio, setStudio] = useState<ReviewDrawing[] | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  useEffect(() => {
    if (!reviewer) return;
    return watchStudioReviews(orgId, (rows) => { setStudio(rows); setStudioError(null); },
      (e) => setStudioError(/index/i.test(String(e?.message)) ? 'The review index is still building. Try again in a few minutes.' : 'Check the connection and try again.'));
  }, [orgId, reviewer]);

  const [trackers, setTrackers] = useState<Record<string, ReviewDrawing[]>>({});
  const focus = pageProject || (page.at === 'meetings' ? meetProject : null);
  const watched = useMemo(() => {
    if (reviewer) return focus ? [focus] : [];
    const ids = list.map((p) => p.id);
    return ids.length > MAX_WATCHED ? (focus ? [focus] : []) : ids;
  }, [reviewer, focus, listKey]);
  const watchedKey = watched.join(',');
  useEffect(() => {
    const offs = watched.map((id) => watchProjectDrawings(orgId, id,
      (rows) => setTrackers((t) => ({ ...t, [id]: rows })),
      () => setTrackers((t) => ({ ...t, [id]: [] }))));
    return () => {
      offs.forEach((f) => f());
      setTrackers((t) => { const n = { ...t }; watched.forEach((id) => delete n[id]); return n; });
    };
  }, [orgId, watchedKey]);

  /* Every drawing the desk knows: the studio's reviewed drawings, with each watched project's full tracker in place of its part. */
  const rows = useMemo(() => {
    const by = new Map<string, ReviewDrawing[]>();
    (studio || []).forEach((d) => by.set(d.projectId, [...(by.get(d.projectId) || []), d]));
    (Object.entries(trackers) as [string, ReviewDrawing[]][]).forEach(([pid, l]) => by.set(pid, l));
    const allowed = reviewer ? null : new Set(list.map((p) => p.id));
    return [...by.entries()].filter(([pid]) => !allowed || allowed.has(pid)).flatMap(([, l]) => l);
  }, [studio, trackers, reviewer, listKey]);

  const names = useMemo(() => {
    const m = new Map<string, { name: string; client?: string }>();
    (studio || []).forEach((d) => { if (d.review?.projectName && !m.has(d.projectId)) m.set(d.projectId, { name: d.review.projectName }); });
    list.forEach((p) => m.set(p.id, { name: p.name, client: p.client }));
    return m;
  }, [studio, listKey]);
  const projectOf = useCallback((id: string) => {
    const n = names.get(id)?.name || 'Project';
    return { name: n, ...projectLook(id, n) };
  }, [names]);

  const cards: ProjectCard[] = useMemo(() => {
    const ids = [...new Set([...list.map((p) => p.id), ...rows.map((d) => d.projectId)])];
    return ids.map((id) => {
      const its = rows.filter((d) => d.projectId === id);
      const look = projectOf(id);
      return { id, name: look.name, client: names.get(id)?.client, code: look.code, color: look.color, soft: look.soft, total: its.length, need: attention(its, viewer), done: statsOf(its).approved };
    }).sort((a, b) => b.need - a.need || a.name.localeCompare(b.name));
  }, [rows, listKey, names, viewer]);

  const loadingAll = reviewer ? studio === null && !studioError : !Object.keys(trackers).length && list.length > 0;
  const loadingProject = !!pageProject && !trackers[pageProject] && (reviewer || watched.includes(pageProject));

  /* ------------------------------------------------------------ design meetings */
  const [meetings, setMeetings] = useState<DesignMeeting[] | null>(null);
  const [running, setRunning] = useState<DesignMeeting | null>(null);
  const meetOn = page.at === 'meetings' && meetsTab && !!meetProject;
  useEffect(() => {
    setMeetings(null); setRunning(null);
    if (!meetOn || !meetProject) return;
    return watchMeetings(orgId, meetProject, setMeetings, () => setMeetings([]));
  }, [orgId, meetProject, meetOn]);
  const live = running ? (meetings || []).find((m) => m.id === running.id) || running : null;
  useEffect(() => {
    if (live && live.state === 'CANCELLED') { setRunning(null); toast({ title: 'This meeting was cancelled', sub: 'Nothing was recorded for the client.' }); }
  }, [live?.state]);
  const designersOf = (id: string | null) => {
    const proj = (projects || []).find((p: any) => String(p.id) === id);
    if (!proj) return [];
    return team.designersOn(proj).map((email) => {
      const m = team.designers.find((t) => t.email === email);
      return m ? (m.role === 'Designer' ? { email, name: m.name } : null) : { email, name: email };
    }).filter((x): x is { email: string; name: string } => !!x);
  };

  /* ------------------------------------------------------------ one drawing open */
  const [request] = useState(() => takeOpenRequest());
  const [open, setOpen] = useState<{ projectId: string; drawingId: string } | null>(() =>
    request ? { projectId: request.projectId, drawingId: request.drawingId } : null);
  const [origin, setOrigin] = useState<DeskOrigin | null>(() => request?.from || null);
  const goBack = useCallback(() => {
    if (!origin) return;
    setOpen(null); setOrigin(null);
    returnFromDesk(origin);
  }, [origin]);
  const openSheet = useCallback((d: { projectId: string; id: string }) => {
    setOpen({ projectId: d.projectId, drawingId: d.id });
    window.scrollTo({ top: 0 });
  }, []);
  const queue = useMemo(() => (reviewer ? reviewQueue(rows).map((d) => ({ projectId: d.projectId, drawingId: d.id })) : []), [rows, reviewer]);

  /* ------------------------------------------------------------ actions */
  const [sending, setSending] = useState<Set<string>>(new Set());
  const send = useCallback(async (d: ReviewDrawing) => {
    const key = `${d.projectId}/${d.id}`;
    if (stateOf(d.review) !== 'DRAFT') return;
    setSending((s) => new Set(s).add(key));
    try {
      await submitSheet({ orgId, projectId: d.projectId, drawingId: d.id }, d.review?.rev);
      toast({ ok: true, title: `${d.name} is with the Design Head`, sub: 'Nothing goes to the client from here.' });
    } catch (e: any) {
      toast({ title: 'Not sent', sub: e?.message });
    } finally {
      setSending((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  }, [orgId, toast]);
  const [add, setAdd] = useState<{ projectId: string | null } | null>(null);
  /* The drawing the three-step upload is open on, by key, so the wizard always has its latest revision. */
  const [up, setUpRaw] = useState<ReviewDrawing | null>(null);
  const setUp = (d: ReviewDrawing | null) => setUpRaw(d);
  const upDrawing = up ? rows.find((d) => d.projectId === up.projectId && d.id === up.id) || up : null;

  /* The open project's room messages, for the roles that have them (lib/roomMessages.ts). */
  const talks = canUseRoomMessages(role);
  const talk = useProjectMessages(orgId, pageProject, talks);

  const ctx: DeskCtx = {
    rows, viewer, uploader, meName: me.name, projectOf, sending,
    act: (d) => { const k = mainAction(d, viewer, uploader).kind; if (k === 'send') send(d); else if (k === 'upload') setUp(d); else openSheet(d); },
    open: openSheet,
    upload: (d) => setUp(d),
    goProject: (id) => go({ at: 'project', projectId: id }),
    goRoom: (projectId, room) => go({ at: 'room', projectId, room }),
    goMeetings: meetsTab ? () => go({ at: 'meetings' }) : undefined,
    addPdfs: (projectId) => setAdd({ projectId: projectId || null }),
    talk: talks ? { orgId, me: { uid: me.uid, email: me.email, name: me.name }, messages: talk.messages, error: talk.error } : undefined,
  };

  /* A drawing under review or a meeting in progress has the screen to itself, without the page title. */
  const fullScreen = !!(open || live);
  usePageHeader({ hidden: fullScreen }, [fullScreen]);

  const need = attention(rows, viewer);
  const tabs: { at: 'home' | 'all' | 'meetings'; label: string; icon: typeof HomeIcon; count?: number }[] = [
    { at: 'home', label: 'Home', icon: HomeIcon, count: need },
    { at: 'all', label: 'All drawings', icon: List },
    ...(meetsTab ? [{ at: 'meetings' as const, label: 'Meetings', icon: Presentation }] : []),
  ];
  const tabOn = page.at === 'project' || page.at === 'room' ? 'home' : page.at;

  if (live && !open && meetProject) {
    return (
      <React.Fragment key={live.id}><MeetingScreen orgId={orgId} projectId={meetProject} projectName={projectOf(meetProject).name} look={projectOf(meetProject)}
        meeting={live} meetings={meetings || []} lead={canRun} me={me}
        onExit={(to) => { setRunning(null); go(to === 'home' ? { at: 'home' } : { at: 'meetings' }); }} /></React.Fragment>
    );
  }
  const wizard = upDrawing && (
    <UploadWizard orgId={orgId} me={me} drawing={upDrawing} projectName={projectOf(upDrawing.projectId).name}
      siblings={rows.filter((d) => d.projectId === upDrawing.projectId)} onClose={() => setUp(null)} />
  );
  if (open) {
    /* Back goes where the person came from: another part of the app, or the page of the desk they were on. */
    const backLabel = origin?.label || (page.at === 'room' ? (page.room === 'General / Project-Wide' ? 'Whole home' : page.room) : page.at === 'project' ? projectOf(page.projectId).name : page.at === 'all' ? 'All drawings' : page.at === 'meetings' ? 'Meetings' : 'Home');
    return (
      <div className="w-full pb-2">
        <React.Fragment key={`${open.projectId}/${open.drawingId}`}><DrawingScreen
          orgId={orgId} projectId={open.projectId} drawingId={open.drawingId} projectName={projectOf(open.projectId).name}
          role={role} me={me} viewer={viewer} queue={queue}
          onClose={origin ? goBack : () => setOpen(null)}
          backLabel={backLabel}
          onOpen={(n) => openSheet({ projectId: n.projectId, id: n.drawingId })}
          onUpload={setUp}
        /></React.Fragment>
        {wizard}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 pb-24 lg:flex-row lg:items-start">
      <nav aria-label="Design Desk" className="hud-panel-in flex shrink-0 gap-1 overflow-x-auto rounded-2xl bg-[#0C1F1A] p-2 lg:sticky lg:top-4 lg:w-[212px] lg:flex-col lg:p-3">
        {tabs.map((t) => {
          const on = tabOn === t.at;
          return (
            <button key={t.at} type="button" onClick={() => go({ at: t.at })} aria-current={on ? 'page' : undefined}
              className={cx('flex min-h-[44px] items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors', on ? 'bg-emerald-600 text-white shadow-sm hud-rail-active' : 'text-emerald-100 hover:bg-white/10 hover:text-white')}>
              <t.icon size={18} aria-hidden />{t.label}
              {!!t.count && <span className="ml-auto grid h-6 min-w-[24px] place-items-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950" title="Drawings that need you">{t.count}</span>}
            </button>
          );
        })}
        {onUseClassic && (
          <button type="button" onClick={onUseClassic} title="Switch this studio back to the earlier Design Desk"
            className="flex min-h-[44px] items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-emerald-100 hover:bg-white/10 hover:text-white lg:mt-6">
            <Undo2 size={18} aria-hidden />Use the old desk
          </button>
        )}
      </nav>

      <main key={page.at === 'room' ? `room:${page.projectId}:${page.room}` : page.at === 'project' ? `project:${page.projectId}` : page.at} className="hud-swap min-w-0 flex-1">
        {studioError ? (
          <div className="mx-auto max-w-md py-20 text-center text-slate-500"><p className="text-lg font-bold text-slate-800">The desk could not load.</p><p className="mt-1">{studioError}</p></div>
        ) : page.at === 'home' ? (
          loadingAll ? <div className="grid min-h-[40vh] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>
            : <Home c={ctx} projects={cards} canMeet={meetsTab} />
        ) : page.at === 'project' ? (
          <ProjectPage c={ctx} projectId={page.projectId} client={names.get(page.projectId)?.client} loading={loadingProject} onBack={() => go({ at: 'home' })} />
        ) : page.at === 'room' ? (
          <RoomPage c={ctx} projectId={page.projectId} room={page.room} onBack={() => go({ at: 'project', projectId: page.projectId })} />
        ) : page.at === 'all' ? (
          <AllDrawings c={ctx} q={q} setQ={setQ} onlyMine={onlyMine} setOnlyMine={setOnlyMine} partial={reviewer} loading={loadingAll} />
        ) : (
          <MeetingsPage orgId={orgId} projectId={meetProject && cards.some((p) => p.id === meetProject) ? meetProject : null}
            projectName={meetProject ? projectOf(meetProject).name : ''}
            drawings={meetProject ? rows.filter((d) => d.projectId === meetProject) : []} meetings={meetings} canRun={canRun} canBill={canBill} presenter={presenter} approver={approver} me={me}
            designers={designersOf(meetProject)}
            onResume={(m) => { setRunning(m); window.scrollTo({ top: 0 }); }}
            projects={cards.map((p) => ({ id: p.id, name: p.name, code: p.code, color: p.color }))} onPickProject={(id) => setMeetProject(id === 'all' ? null : id)} />
        )}
      </main>

      {wizard}

      {add && (
        <AddPdfs orgId={orgId} me={me} files={[]} projectId={add.projectId}
          projects={cards.filter((p) => reviewer || list.some((x) => x.id === p.id)).map((p) => ({ id: p.id, name: p.name, code: p.code, color: p.color }))}
          onClose={() => setAdd(null)}
          onDone={(pid) => { setAdd(null); go({ at: 'project', projectId: pid }); }} />
      )}
    </div>
  );
}
