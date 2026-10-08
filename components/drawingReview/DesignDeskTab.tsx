import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Inbox, LayoutGrid, Loader2, PenTool, Presentation, Send } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { canReview, canRunMeeting, canSetAudience, canUpload, stateOf } from '../../lib/drawingReview';
import type { DesignMeeting } from '../../lib/designMeeting';
import { attention, projectLook, pushRecent, reviewQueue, statsOf, suggestions as pickSuggestions, type Suggestion, type Viewer } from '../../lib/designDesk';
import { watchStudioReviews, watchProjectDrawings, takeOpenRequest, submitSheet, type ReviewDrawing } from '../../services/drawingReviewService';
import SheetStudio, { type Me } from './SheetStudio';
import ProjectBand, { type ProjectInfo } from './ProjectBand';
import ForYou, { type DragKit } from './ForYou';
import AllSheets, { type SheetFilter } from './AllSheets';
import AddPdfs from './AddPdfs';
import Meetings from './Meetings';
import MeetingMode from './MeetingMode';
import { watchMeetings } from '../../services/designMeetingService';
import { ToastHost, ReviewStyles, useToast, firstName, roomLabel } from './ui';
import { DeskStyles } from './DeskParts';

/*
  DESIGN DESK, the studio tab where drawings are reviewed.

  One home for everybody. "For you" lists what needs this person now (the
  Design Head's review queue, a designer's sheets to fix and send); "All
  sheets" shows where everything stands. The band at the top says which
  project you are in and switches it. PDFs can be dropped anywhere; a ready
  sheet can be dragged to the Design Head to send it. Opening a sheet
  replaces the view with the review screen; leaving it comes back here.
  "Meetings" is where the Design Head presents a project's approved rooms to
  the client, and where chargeable revision rounds are billed or waived.
*/

interface Props {
  projects: any[];
  /** The project open elsewhere in the app; a designer starts there. */
  activeProjectId?: string | null;
}

const PREF = 'ffds_design_review_project';
/* Designers watch each of their projects' trackers; past this many, only the open one is watched. */
const MAX_WATCHED = 24;

function usePref<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; } catch { return initial; } });
  const set = useCallback((next: T | ((p: T) => T)) => setV((p) => {
    const val = typeof next === 'function' ? (next as (p: T) => T)(p) : next;
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage off */ }
    return val;
  }), [key]);
  return [v, set];
}

export default function DesignDeskTab(props: Props) {
  return (
    <ToastHost>
      <ReviewStyles />
      <DeskStyles />
      <Desk {...props} />
    </ToastHost>
  );
}

function Desk({ projects, activeProjectId }: Props) {
  const toast = useToast();
  const { orgData, currentRole, currentUserAuth } = useOrg();
  const orgId = orgData?.tenantId || 'demo-tenant-01';
  const role = String(currentRole || '');
  const reviewer = canReview(role);
  const uploader = canUpload(role);
  const canRun = canRunMeeting(role);
  const canBill = canSetAudience(role);
  const meetsTab = canRun || canBill;
  const me: Me = {
    uid: currentUserAuth?.uid || '',
    email: String(currentUserAuth?.email || '').toLowerCase(),
    name: currentUserAuth?.displayName || currentUserAuth?.email || 'You',
  };
  const viewer: Viewer = useMemo(() => ({ reviewer, email: me.email }), [reviewer, me.email]);
  const k = (name: string) => `ffds_desk_${name}_${me.uid || 'anon'}`;

  const list = useMemo(() => (projects || [])
    .map((p: any) => ({
      id: String(p.id),
      name: String(p.context?.name || p.name || p.context?.clientName || 'Untitled project'),
      client: p.context?.clientName ? String(p.context.clientName) : undefined,
    }))
    /* A name that already carries the client ("New Project · ABC") does not repeat it. */
    .map((p) => ({ ...p, client: p.client && !p.name.toLowerCase().includes(p.client.toLowerCase()) ? p.client : undefined }))
    .filter((p) => p.id), [projects]);
  const listKey = list.map((p) => p.id).join(',');

  /* ------------------------------------------------------------ where we are */
  const [project, setProjectRaw] = useState<string>(() => {
    if (!reviewer && activeProjectId) return activeProjectId;
    try { const saved = localStorage.getItem(PREF); if (saved) return saved; } catch { /* storage off */ }
    return reviewer ? 'all' : activeProjectId || 'all';
  });
  const [pinned, setPinned] = usePref<string[]>(k('pinned'), []);
  const [recent, setRecent] = usePref<string[]>(k('recent'), activeProjectId ? [activeProjectId] : []);
  const [dismissed, setDismissed] = usePref<Record<string, number>>(k('dismissed'), {});
  const [tab, setTab] = useState<'foryou' | 'all' | 'meetings'>('foryou');
  const [room, setRoom] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<SheetFilter>('all');
  const pickProject = useCallback((id: string) => {
    setProjectRaw(id); setRoom(null);
    try { localStorage.setItem(PREF, id); } catch { /* storage off */ }
    if (id !== 'all') setRecent((r) => pushRecent(r, id));
  }, [setRecent]);
  useEffect(() => {
    if (project !== 'all' && list.length && !list.some((p) => p.id === project) && !reviewer) setProjectRaw(list.length > 1 ? 'all' : list[0].id);
  }, [listKey, project, reviewer]);

  /* ------------------------------------------------------------ data */
  const [studio, setStudio] = useState<ReviewDrawing[] | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  useEffect(() => {
    if (!reviewer) return;
    return watchStudioReviews(orgId, (rows) => { setStudio(rows); setStudioError(null); },
      (e) => setStudioError(/index/i.test(String(e?.message)) ? 'The review index is still building. Try again in a few minutes.' : 'Check the connection and try again.'));
  }, [orgId, reviewer]);

  const [trackers, setTrackers] = useState<Record<string, ReviewDrawing[]>>({});
  const watched = useMemo(() => {
    if (reviewer) return project !== 'all' ? [project] : [];
    const ids = list.map((p) => p.id);
    return ids.length > MAX_WATCHED ? (project !== 'all' ? [project] : []) : ids;
  }, [reviewer, project, listKey]);
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

  /* Every drawing the desk knows: the studio's reviewed sheets, with each watched project's full tracker in place of its part. */
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

  const infos: ProjectInfo[] = useMemo(() => {
    const ids = [...new Set([...list.map((p) => p.id), ...rows.map((d) => d.projectId)])];
    return ids.map((id) => {
      const its = rows.filter((d) => d.projectId === id);
      const look = projectOf(id);
      return { id, name: look.name, client: names.get(id)?.client, code: look.code, color: look.color, soft: look.soft, stats: statsOf(its), need: attention(its, viewer) };
    });
  }, [rows, listKey, names, viewer]);

  const isAll = project === 'all';
  const scope = useMemo(() => (isAll ? rows : rows.filter((d) => d.projectId === project)), [rows, project, isAll]);
  const inScope = useCallback((d: ReviewDrawing) => isAll || d.projectId === project, [isAll, project]);
  const loading = reviewer ? studio === null && !studioError : (isAll ? !Object.keys(trackers).length && list.length > 0 : !trackers[project]);
  /* Across every project the Design Head sees only sheets with a PDF; inside one, the whole tracker. */
  const partial = reviewer && isAll;

  /* ------------------------------------------------------------ design meetings */
  const [meetings, setMeetings] = useState<DesignMeeting[] | null>(null);
  const [running, setRunning] = useState<DesignMeeting | null>(null);
  useEffect(() => {
    setMeetings(null); setRunning(null);
    if (!meetsTab || isAll) return;
    return watchMeetings(orgId, project, setMeetings, () => setMeetings([]));
  }, [orgId, project, isAll, meetsTab]);
  /* The live copy wins once it arrives; a meeting someone cancelled elsewhere ends here too. */
  const live = running ? (meetings || []).find((m) => m.id === running.id) || running : null;
  useEffect(() => {
    if (live && live.state === 'CANCELLED') { setRunning(null); toast({ title: 'This meeting was cancelled', sub: 'Nothing was recorded for the client.' }); }
  }, [live?.state]);

  /* ------------------------------------------------------------ the sheet screen */
  const [open, setOpen] = useState<{ projectId: string; drawingId: string } | null>(() => takeOpenRequest());
  const openSheet = useCallback((d: { projectId: string; id: string }) => {
    setOpen({ projectId: d.projectId, drawingId: d.id });
    setRecent((r) => pushRecent(r, d.projectId));
    window.scrollTo({ top: 0 });
  }, [setRecent]);
  const queue = useMemo(() => (reviewer ? reviewQueue(scope).map((d) => ({ projectId: d.projectId, drawingId: d.id })) : []), [scope, reviewer]);

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

  const remind = useCallback((d: ReviewDrawing) => {
    const to = d.review?.designer?.email;
    if (!to) return;
    const r = d.review!;
    const project = projectOf(d.projectId).name;
    const status = stateOf(r) === 'CHANGES_REQUESTED'
      ? `It came back with ${r.marksTotal || 'some'} note${r.marksTotal === 1 ? '' : 's'}${r.marksOpen ? `, ${r.marksOpen} still open` : ''}.`
      : `v${r.versionNo} is uploaded but has not been sent for review yet.`;
    const body = `Hi ${firstName(r.designer?.name)},\n\nA quick reminder about ${d.name} (${project}, ${roomLabel(d.roomName)}). ${status}\n\nYou will find it in Design Desk.\n\nThanks`;
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Reminder: ${d.name}`)}&body=${encodeURIComponent(body)}`;
    toast({ title: `Opening an email to ${firstName(r.designer?.name)}`, sub: 'Edit it before you send if you like.' });
  }, [projectOf, toast]);

  const isDismissed = useCallback((key: string) => !!dismissed[key], [dismissed]);
  const dismiss = (key: string) => setDismissed((d) => {
    const cutoff = Date.now() - 30 * 86_400_000;
    const kept = Object.fromEntries(Object.entries(d).filter(([, t]) => t > cutoff));
    return { ...kept, [key]: Date.now() };
  });
  const cards = useMemo(() => pickSuggestions({ scope, all: rows, viewer, projectName: (id) => projectOf(id).name, inScope, isDismissed }), [scope, rows, viewer, projectOf, inScope, isDismissed]);
  const onSuggestion = (s: Suggestion) => {
    switch (s.kind) {
      case 'stale': if (s.row) remind(s.row as ReviewDrawing); break;
      case 'readyDue': if (s.row) send(s.row as ReviewDrawing); break;
      case 'notStarted': if (s.projectId) { pickProject(s.projectId); setTab('all'); setFilter('NONE'); } break;
      case 'present': if (s.projectId) { pickProject(s.projectId); setTab('all'); setFilter('all'); setRoom(s.room || null); } break;
      case 'elsewhere': pickProject('all'); break;
      default: if (s.row) openSheet(s.row);
    }
  };

  /* ------------------------------------------------------------ drag a ready sheet to send it */
  const [dragging, setDragging] = useState<string | null>(null);
  const [zoneHot, setZoneHot] = useState(false);
  const drag: DragKit = {
    can: (d) => uploader && stateOf(d.review) === 'DRAFT',
    start: (d) => (e) => {
      const key = `${d.projectId}/${d.id}`;
      e.dataTransfer.setData('text/drawing', key);
      e.dataTransfer.effectAllowed = 'move';
      /* Shown on the next tick: changing the page inside dragstart can cancel the drag. */
      setTimeout(() => setDragging(key), 0);
    },
    end: () => { setDragging(null); setZoneHot(false); },
    dragging,
  };
  const dragSheet = dragging ? rows.find((d) => `${d.projectId}/${d.id}` === dragging) : null;

  /* ------------------------------------------------------------ PDFs dropped anywhere */
  const [add, setAdd] = useState<File[] | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    if (open || live || !uploader) return;
    const has = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => { if (!has(e)) return; depth.current++; setFileOver(true); };
    const leave = (e: DragEvent) => { if (!has(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setFileOver(false); };
    const over = (e: DragEvent) => { if (has(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault(); depth.current = 0; setFileOver(false);
      const fs = Array.from(e.dataTransfer!.files);
      if (fs.length) setAdd(fs);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [open, !!live, uploader]);

  const current = infos.find((p) => p.id === project);
  const forYouCount = attention(scope, viewer);
  const openMeeting = (meetings || []).some((m) => m.state === 'OPEN');
  const segBtn = (on: boolean) => `inline-flex min-h-[38px] items-center gap-1.5 rounded-[9px] px-4 text-[13.5px] font-bold transition ${on ? 'bg-white text-[#17191E] shadow-[0_1px_2px_rgba(23,25,30,0.12)]' : 'text-[#4F535C] hover:text-[#17191E]'}`;

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 pb-36 pt-6 text-[#17191E] md:px-5">
      {live && !open ? (
        <MeetingMode key={live.id} orgId={orgId} projectId={project} projectName={projectOf(project).name} look={projectOf(project)}
          meeting={live} meetings={meetings || []}
          onExit={(to) => { setRunning(null); setTab(to || 'meetings'); window.scrollTo({ top: 0 }); }} />
      ) : open ? (
        <SheetStudio
          key={`${open.projectId}/${open.drawingId}`}
          orgId={orgId} projectId={open.projectId} drawingId={open.drawingId} projectName={projectOf(open.projectId).name}
          look={projectOf(open.projectId)} projectNeeds={attention(rows.filter((d) => d.projectId === open.projectId && d.id !== open.drawingId), viewer)}
          role={role} me={me} queue={queue}
          onClose={() => setOpen(null)}
          onOpen={(n) => openSheet({ projectId: n.projectId, id: n.drawingId })}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <h1 className="flex-auto font-display text-[30px] font-semibold tracking-tight">Design Desk</h1>
            <div className="inline-flex gap-0.5 rounded-xl bg-[#EBEBE5] p-[3px]" role="tablist" aria-label="Design Desk views">
              <button type="button" role="tab" aria-selected={tab === 'foryou'} onClick={() => setTab('foryou')} className={segBtn(tab === 'foryou')}>
                <Inbox size={16} />For you{forYouCount > 0 && <span className="text-[12px] text-[#3A3FB8]">{forYouCount}</span>}
              </button>
              <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')} className={segBtn(tab === 'all')}>
                <LayoutGrid size={16} />All sheets
              </button>
              {meetsTab && (
                <button type="button" role="tab" aria-selected={tab === 'meetings'} onClick={() => setTab('meetings')} className={segBtn(tab === 'meetings')}>
                  <Presentation size={16} />Meetings{openMeeting && <span className="h-2 w-2 rounded-full bg-[#C77A1A]" title="A meeting is open" />}
                </button>
              )}
            </div>
            {uploader && (
              <button type="button" onClick={() => setAdd([])} title="Or drop PDFs anywhere on this page"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#DCDCD5] bg-white px-[18px] text-[14px] font-bold transition hover:border-[#A9AAA2] active:scale-[.98]">
                <FileUp size={16} />Add PDFs
              </button>
            )}
          </div>

          {!list.length && !rows.length && !loading ? (
            <div className="mx-auto max-w-md py-24 text-center text-[#5F636D]"><PenTool className="mx-auto mb-3" /><p className="text-lg font-semibold text-[#17191E]">No projects yet</p><p className="mt-1">When the studio assigns you to a project, its drawings appear here.</p></div>
          ) : (
            <>
              <ProjectBand current={current ? project : 'all'} projects={infos} allStats={statsOf(rows)} allNeed={attention(rows, viewer)}
                reviewer={reviewer} pinned={pinned} recent={recent} onPick={pickProject} partial={partial}
                onTogglePin={(id) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
              {studioError ? (
                <div className="mx-auto max-w-md py-20 text-center text-[#5F636D]"><p className="text-lg font-semibold text-[#17191E]">The desk could not load.</p><p className="mt-1">{studioError}</p></div>
              ) : loading ? (
                <div className="grid min-h-[30vh] place-items-center"><Loader2 className="animate-spin text-[#8A8E97]" /></div>
              ) : tab === 'meetings' && meetsTab ? (
                <Meetings orgId={orgId} projectId={isAll || !current ? null : project} projectName={current?.name || ''} look={current ? projectOf(project) : null}
                  drawings={scope} meetings={meetings} canRun={canRun} canBill={canBill} onResume={(m) => { setRunning(m); window.scrollTo({ top: 0 }); }}
                  projects={infos.map((p) => ({ id: p.id, name: p.name, code: p.code, color: p.color }))} onPickProject={pickProject} />
              ) : tab === 'foryou' ? (
                <ForYou scope={scope} all={rows} viewer={viewer} uploader={uploader} isAll={isAll || !current} scopeName={current?.name || 'this project'}
                  projectOf={projectOf} suggestions={cards} onSuggestion={onSuggestion} onDismiss={dismiss}
                  onOpen={openSheet} onSend={send} sending={sending} onRemind={remind} onGoProject={pickProject} drag={drag} />
              ) : (
                <AllSheets scope={scope} isAll={isAll || !current} projects={infos} projectOf={projectOf} q={q} setQ={setQ} filter={filter} setFilter={setFilter}
                  room={room} setRoom={setRoom} onOpen={openSheet} onPickProject={pickProject} reviewer={reviewer} drag={drag} partial={partial} />
              )}
            </>
          )}
        </>
      )}

      {!open && !live && fileOver && (
        <div className="pointer-events-none fixed inset-0 z-[110] grid place-items-center p-6" style={{ background: 'rgba(23,25,30,.55)', backdropFilter: 'blur(3px)' }}>
          <div className="dd-breathe max-w-[540px] rounded-[28px] border-[2.5px] border-dashed border-white px-10 py-14 text-center text-white">
            <h2 className="font-display text-[28px] font-semibold">Drop to place your sheets{current ? ` in ${current.name}` : ''}</h2>
            <p className="mt-1.5 opacity-90">{current ? 'Each PDF lands on the drawing it belongs to.' : 'Choose the project next; each PDF then lands on the drawing it belongs to.'}</p>
          </div>
        </div>
      )}

      {!open && !live && dragSheet && (
        <div className="dd-pop fixed bottom-6 left-1/2 z-[70] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-[22px] border-[2.5px] border-dashed px-6 py-5 text-center transition-colors"
          style={{ background: zoneHot ? '#4146C8' : '#ECEDFB', color: zoneHot ? '#fff' : '#23266F', borderColor: zoneHot ? '#fff' : '#4146C8', boxShadow: '0 24px 50px -20px rgba(23,25,30,.45)', transformOrigin: 'center' }}
          onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('text/drawing')) { e.preventDefault(); setZoneHot(true); } }}
          onDragLeave={() => setZoneHot(false)}
          onDrop={(e) => {
            e.preventDefault();
            const key = e.dataTransfer.getData('text/drawing') || dragging;
            const d = rows.find((x) => `${x.projectId}/${x.id}` === key);
            setDragging(null); setZoneHot(false);
            if (d) send(d);
          }}>
          <div className="flex items-center justify-center gap-2 font-display text-[19px] font-semibold"><Send size={18} />{zoneHot ? `Let go to send ${dragSheet.name}` : `Drop here to send ${dragSheet.name} to the Design Head`}</div>
          <div className="mt-0.5 text-[13px] opacity-85">Nothing goes to the client from here.</div>
        </div>
      )}

      {add && (
        <AddPdfs orgId={orgId} me={me} files={add} projectId={current ? project : null}
          projects={(isAll || !current ? [...infos].sort((a, b) => (recent.indexOf(a.id) + 1 || 999) - (recent.indexOf(b.id) + 1 || 999) || a.name.localeCompare(b.name)) : infos)
            .filter((p) => reviewer || list.some((x) => x.id === p.id)).map((p) => ({ id: p.id, name: p.name, code: p.code, color: p.color }))}
          onClose={() => setAdd(null)}
          onDone={(pid) => { if (!isAll && pid !== project) pickProject(pid); }} />
      )}
    </div>
  );
}
