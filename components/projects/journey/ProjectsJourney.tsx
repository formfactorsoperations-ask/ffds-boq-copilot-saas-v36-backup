import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Gem, Plus, Search, SlidersHorizontal, Trash2, Users } from 'lucide-react';
import type { FullProjectData, ProjectStatus } from '../../../types';
import { useOrg } from '../../../contexts/OrgContext';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { seesStudioFinance, isLimitedRole } from '../../../lib/roleAccess';
import { buildDisplayNames } from '../../../lib/projectNaming';
import { classifyProject } from '../../../lib/projectClassification';
import { ENGAGEMENTS, engagementOf, type EngagementType } from '../../../lib/engagement';
import type { BoqTag } from '../../../lib/playground/versions';
import { STAGE, FOLDER_STAGES, type FolderStage } from '../../../lib/projectFolders';
import {
  projectIntel, buildRow, needsCounts, matchesKind, matchesStage, matchesBoq, matchesEngagement, matchesAlert,
  stripStages, toggleStage, needsYouOrder, groupRows, statusForStage, routeTab,
  withDue, journeyCounts, isDueThisWeek, todayKey, addDayKeys, dueLabel,
  type AlertFilter, type DueEntry, type CommandItem, type JourneyRow, type KindFilter, type StageFilter,
} from '../../../lib/projectsJourney';
import { Button, EmptyState, Segmented, LABEL } from '../../ui/kit';
import { Dot } from '../../ui/HudBits';
import { opsSettingsOf } from '../../../lib/opsDesk';
import { auth } from '../../../services/firebaseClient';
import { useProjectHealth } from '../../../services/projectHealthService';
import ProjectWeek from './ProjectWeek';
import AssignProjectsModal from '../../projectHeader/AssignProjectsModal';
import ProjectStatusTransitionModal from '../../ProjectStatusTransitionModal';
import JourneyStrip from './JourneyStrip';
import NeedsYou from './NeedsYou';
import TriageDeck from './TriageDeck';
import ProjectList from './ProjectList';
import ProjectBoard from './ProjectBoard';
import ProjectPeek from './ProjectPeek';
import CommandBar from './CommandBar';
import { PopMenu, type MenuItem } from './parts';
import '../../projectHeader/projectHeader.css';

/*
  PROJECTS: JOURNEY, NEEDS YOU, ONE LIST (DESIGN.md, approved 25 Nov 2026;
  mockup public/mockups/projects-journey-final-mockup.html).

  The title row keeps search (which opens Ctrl K), Assign designer and New
  project. Under it the Needs-you chips, the All / Actual / Dummy switch and
  one Filters menu for the rest (Untagged, unsigned contracts, at risk, BOQ,
  engagement). Then the journey strip, the Needs-you carousel, and one list
  seen as a List or a Board. No amounts on this screen.

  Phase 3: each next step has a day (lib/projectsJourney: kept on the project
  when someone sets it, else its own record, a payment's terms), shown as
  Overdue / Today / a day, and laid out on "This week"; and each List row has
  its health rings, drawings counted by functions/src/projectHealth.ts.

  Shown in place of the glass folders when the studio picks it in Studio
  settings (components/projects/ProjectsScreenSwitch).
*/

interface Props {
  projects: FullProjectData[];
  activeProjectId: string | null;
  onOpenProject: (project: FullProjectData, route?: string) => void;
  onCreateNew: () => void;
  /** Sample options for a first meeting (components/sampleOptions), for the roles that open it. */
  onOpenSampleOptions?: () => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (project: FullProjectData) => void;
  onQuickUpdate?: (projectId: string, field: string, value: any) => void;
  onStatusChange?: (projectId: string, newStatus: ProjectStatus, note?: string) => Promise<void> | void;
  loading?: boolean;
}

type View = 'list' | 'board' | 'week';
type GroupBy = 'stage' | 'designer';
const PREFS = 'sd.projects.journey';

const readPrefs = (): { view?: View; group?: GroupBy } => {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch { return {}; }
};

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export default function ProjectsJourney({
  projects, onOpenProject, onCreateNew, onOpenSampleOptions, onDeleteProject, onDuplicateProject, onQuickUpdate, onStatusChange, loading = false,
}: Props) {
  const { orgData, currentRole } = useOrg();

  /* ── Filters ── */
  const [stage, setStage] = useState<StageFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [alert, setAlert] = useState<AlertFilter | null>(null);
  const [boq, setBoq] = useState<'all' | BoqTag>('all');
  const [engagement, setEngagement] = useState<'all' | EngagementType>('all');
  const [view, setView] = useState<View>(() => readPrefs().view || 'list');
  const [group, setGroup] = useState<GroupBy>(() => readPrefs().group || 'stage');
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ view, group })); } catch { /* fine */ } }, [view, group]);

  /* ── Overlays ── */
  const [peek, setPeek] = useState<string | null>(null);
  const [cmd, setCmd] = useState(false);
  const [triage, setTriage] = useState(false);
  const [filtersAt, setFiltersAt] = useState<DOMRect | null>(null);
  const [menu, setMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusFor, setStatusFor] = useState<{ project: FullProjectData; to?: ProjectStatus } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  /* What the triage deck put off this time, with what each step's day was before: "Start again" puts it back. */
  const [snoozedHere, setSnoozedHere] = useState<Array<{ row: JourneyRow; was: DueEntry | undefined }>>([]);
  /* The clock the labels read: moves on each minute, so Today turns over at midnight. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const drawings = useProjectHealth(orgData?.tenantId, currentRole);

  /* ── What every part reads ── */
  const displayNames = useMemo(() => buildDisplayNames(projects), [projects]);
  const paymentDueDays = opsSettingsOf(orgData).paymentDueDays;
  const intel = useMemo(() => projectIntel(projects, currentRole, { paymentDueDays }), [projects, currentRole, paymentDueDays]);
  const rows = useMemo(
    () => projects.map((p) => buildRow(p, displayNames.get(p.id) || p.context?.name || 'Unnamed project', intel, orgData?.projectDesigners, orgData?.defaultProjectPhoto?.url)),
    [projects, displayNames, intel, orgData?.projectDesigners, orgData?.defaultProjectPhoto?.url],
  );
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const nameOf = useCallback((email: string) => {
    const m = orgData?.team?.find((t) => String(t.email || '').toLowerCase() === email);
    return m?.name || email.split('@')[0];
  }, [orgData?.team]);

  /* Unsigned and at risk (the Filters menu); the chips' blockers and due this week follow the Actual / Dummy switch only. */
  const counts = useMemo(() => needsCounts(projects, kind, intel), [projects, kind, intel]);
  const chips = useMemo(() => journeyCounts(rows.filter((r) => matchesKind(r.project, kind)), now), [rows, kind, now]);
  const alertOk = useCallback((r: JourneyRow) => (alert === 'due' ? isDueThisWeek(r, now) : matchesAlert(r.project, alert, intel)), [alert, now, intel]);
  /* Everything but the stage: the strip counts each stage under the other filters. */
  const filtered = useMemo(() => rows.filter((r) =>
    matchesKind(r.project, kind) && matchesBoq(r.project, boq) && matchesEngagement(r.project, engagement) && alertOk(r),
  ), [rows, kind, boq, engagement, alertOk]);
  const shown = useMemo(() => [...filtered.filter((r) => matchesStage(r.project, stage))].sort((a, b) => b.updated - a.updated), [filtered, stage]);
  const strip = useMemo(() => stripStages(filtered), [filtered]);
  const needs = useMemo(() => needsYouOrder(shown, now), [shown, now]);
  const groups = useMemo(() => groupRows(shown, group, nameOf), [shown, group, nameOf]);
  const hasUntagged = useMemo(() => projects.some((p) => classifyProject(p) === 'untagged'), [projects]);
  const engagementsInUse = useMemo(() => ENGAGEMENTS.filter((d) => projects.some((p) => engagementOf(p.context) === d.id)), [projects]);
  const moreFilters = (kind === 'untagged' ? 1 : 0) + (alert === 'unsigned' || alert === 'risk' ? 1 : 0) + (boq !== 'all' ? 1 : 0) + (engagement !== 'all' ? 1 : 0);

  /* ── Actions ── */
  const open = useCallback((r: JourneyRow, route?: string) => {
    setPeek(null); setCmd(false); setTriage(false);
    onOpenProject(r.project, routeTab(route));
  }, [onOpenProject]);
  const doStep = useCallback((r: JourneyRow) => open(r, r.next?.route), [open]);
  const tag = (r: JourneyRow, isDummy: boolean) => onQuickUpdate?.(r.id, 'isDummy', isDummy);
  const changeStage = (r: JourneyRow, to?: FolderStage | 'closed') =>
    setStatusFor({ project: r.project, to: to ? statusForStage(to) : undefined });
  const runCommand = (it: CommandItem) => {
    if (it.kind === 'project') { setCmd(false); setPeek(it.row.id); return; }
    open(it.row, it.route);
  };
  /* A next step's day, kept on the project (context.nextStepDue). Null takes a day set by hand off. */
  const setDue = (r: JourneyRow, day: string | null, snoozed = false) => {
    if (!r.action || !onQuickUpdate) return;
    onQuickUpdate(r.id, 'nextStepDue', withDue((r.project.context as any)?.nextStepDue, r.action.id, day, auth?.currentUser?.email, Date.now(), snoozed));
  };
  const snooze = (r: JourneyRow) => {
    const was = (r.project.context as any)?.nextStepDue?.[r.action!.id] as DueEntry | undefined;
    setSnoozedHere((s) => [...s, { row: r, was }]);
    setDue(r, addDayKeys(todayKey(Date.now()), 1), true);
  };
  const unsnoozeHere = () => {
    for (const { row, was } of snoozedHere) {
      if (!row.action || !onQuickUpdate) continue;
      const map = { ...((row.project.context as any)?.nextStepDue || {}) };
      if (was) map[row.action.id] = was; else delete map[row.action.id];
      onQuickUpdate(row.id, 'nextStepDue', map);
    }
    setSnoozedHere([]);
  };
  const clearFilters = () => { setStage('all'); setKind('all'); setAlert(null); setBoq('all'); setEngagement('all'); };

  /* Ctrl / Cmd K opens the command bar, and "/" too, while this screen is up. Captured first, so the project sidebar's Jump to does not also open. */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); e.stopPropagation();
        setCmd((v) => !v);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setCmd(true);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);

  /* Search, Assign designer and New project sit in the title row, beside the page name. */
  usePageHeader({
    actions: (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setCmd(true)} aria-label="Search or jump to (Ctrl K)"
          className="flex items-center gap-2 h-10 w-full sm:w-64 px-3 rounded-lg border border-slate-300 bg-white text-left text-sm text-slate-400 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]">
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">Search or jump to…</span>
          <span className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-md px-1.5 bg-slate-50 whitespace-nowrap">Ctrl K</span>
        </button>
        {seesStudioFinance(currentRole) && <Button icon={Users} onClick={() => setAssignOpen(true)}>Assign designer</Button>}
        {onOpenSampleOptions && <Button icon={Gem} onClick={onOpenSampleOptions}>Sample options</Button>}
        {!isLimitedRole(currentRole) && <Button variant="primary" icon={Plus} onClick={onCreateNew}>New project</Button>}
      </div>
    ),
  }, [currentRole, onCreateNew, onOpenSampleOptions]);

  const peekRow = peek ? byId.get(peek) : undefined;
  const menuRow = menu ? byId.get(menu.id) : undefined;
  const listLabel = stage === 'all' ? 'All projects' : stage === 'closed' ? 'Lost and terminated' : STAGE[stage].label;

  const filterItems: MenuItem[] = [
    ...(hasUntagged ? [{ heading: 'Show' }, { label: 'Untagged only', checked: kind === 'untagged', onSelect: () => setKind(kind === 'untagged' ? 'all' : 'untagged') }] : []),
    { heading: 'Needs you' },
    { label: `Contracts unsigned · ${counts.unsigned}`, checked: alert === 'unsigned', onSelect: () => setAlert(alert === 'unsigned' ? null : 'unsigned') },
    { label: `At risk · ${counts.risk}`, checked: alert === 'risk', onSelect: () => setAlert(alert === 'risk' ? null : 'risk') },
    { heading: 'BOQ' },
    ...([['all', 'Any BOQ'], ['playground', 'Playground'], ['classic', 'Classic'], ['none', 'None yet']] as const).map(([k, l]) => ({
      label: l, checked: boq === k, onSelect: () => setBoq(k),
    })),
    ...(engagementsInUse.length > 1 ? [
      { heading: 'Engagement' },
      ...([{ id: 'all', short: 'Any engagement' }, ...engagementsInUse] as { id: 'all' | EngagementType; short: string }[]).map((e) => ({
        label: e.short, checked: engagement === e.id, onSelect: () => setEngagement(e.id),
      })),
    ] : []),
    ...(moreFilters ? [{ divider: true }, { label: 'Clear these filters', onSelect: () => { if (kind === 'untagged') setKind('all'); if (alert === 'unsigned' || alert === 'risk') setAlert(null); setBoq('all'); setEngagement('all'); } }] : []),
  ];

  const rowMenu = (r: JourneyRow): MenuItem[] => [
    { label: 'Open', onSelect: () => setPeek(r.id) },
    ...r.files.slice(0, 3).map((f) => ({ label: f.name, onSelect: () => open(r, f.route) })),
    { divider: true },
    { heading: 'Change stage' },
    ...FOLDER_STAGES.filter((s) => s.id !== r.stage && s.id !== 'terminated').map((s) => ({ label: s.label, dot: s.color, onSelect: () => changeStage(r, s.id) })),
    ...(r.action && onQuickUpdate ? [
      { divider: true },
      { heading: r.due ? `Due · ${dueLabel(r.due.day, now)}` : 'Due · no day yet' },
      { label: 'Today', checked: r.due?.day === todayKey(now), onSelect: () => setDue(r, todayKey(Date.now())) },
      { label: 'Tomorrow', checked: r.due?.day === addDayKeys(todayKey(now), 1), onSelect: () => setDue(r, addDayKeys(todayKey(Date.now()), 1)) },
      { label: 'In a week', checked: r.due?.day === addDayKeys(todayKey(now), 7), onSelect: () => setDue(r, addDayKeys(todayKey(Date.now()), 7)) },
      ...(r.due?.source === 'set' ? [{ label: 'Clear the day', onSelect: () => setDue(r, null) }] : []),
    ] : []),
    { divider: true },
    { label: 'Clone as template', onSelect: () => onDuplicateProject(r.project) },
    { label: selected.has(r.id) ? 'Unselect' : 'Select', onSelect: () => setSelected((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }) },
    { label: 'Delete', danger: true, onSelect: () => setDeleteIds([r.id]) },
  ];

  return (
    <div className="pj space-y-4 px-4 pb-10">
      {/* Needs you, the Actual / Dummy switch and the Filters menu */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl pl-3.5 pr-2 py-1.5 shadow-sm">
          {chips.blocker + chips.due === 0 ? (
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-600 py-1"><Dot tone="good" /> Nothing is waiting on you.</span>
          ) : (
            <>
              <span className={LABEL}>Needs you</span>
              {chips.blocker > 0 && (
                <button type="button" aria-pressed={alert === 'blocker'} onClick={() => setAlert(alert === 'blocker' ? null : 'blocker')}
                  className={cx('px-3 py-1 rounded-full text-xs font-bold border border-rose-200 bg-rose-50 text-rose-700 transition-shadow', alert === 'blocker' && 'ring-[3px] ring-rose-500/20')}>
                  <span className="tabular-nums">{chips.blocker}</span> blocker{chips.blocker === 1 ? '' : 's'}
                </button>
              )}
              {chips.due > 0 && (
                <button type="button" aria-pressed={alert === 'due'} onClick={() => setAlert(alert === 'due' ? null : 'due')}
                  className={cx('px-3 py-1 rounded-full text-xs font-bold border border-amber-200 bg-amber-50 text-amber-700 transition-shadow', alert === 'due' && 'ring-[3px] ring-amber-600/20')}>
                  <span className="tabular-nums">{chips.due}</span> due this week
                </button>
              )}
            </>
          )}
        </div>
        <span className="flex-1" />
        <Segmented<'all' | 'actual' | 'dummy'>
          label="Actual or dummy"
          size="sm"
          value={kind === 'untagged' ? null : kind}
          onChange={setKind}
          options={[{ id: 'all', label: 'All' }, { id: 'actual', label: 'Actual' }, { id: 'dummy', label: 'Dummy' }]}
        />
        <Button size="sm" icon={SlidersHorizontal} aria-haspopup="menu" aria-expanded={!!filtersAt}
          className={moreFilters ? '!border-[#3D52A0] !text-[#3D52A0]' : undefined}
          onClick={(e) => setFiltersAt(filtersAt ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}>
          Filters{moreFilters ? ` · ${moreFilters}` : ''}
        </Button>
      </div>

      {loading && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 flex items-center justify-center gap-2.5">
          <Dot tone="warn" live />
          <p className="text-sm font-bold text-slate-800">Loading your projects…</p>
        </div>
      )}
      {!loading && projects.length === 0 && (
        <EmptyState icon={FolderOpen}
          title={isLimitedRole(currentRole) ? 'No projects are assigned to you yet' : 'No projects yet'}
          text={isLimitedRole(currentRole)
            ? "Ask your studio to add you to a project: they tick your name in Studio settings → Team, or on the project's team."
            : 'Start one from a lead with New project.'} />
      )}

      {projects.length > 0 && (
        <>
          <JourneyStrip stages={strip.stages} closed={strip.closed} selected={stage} onSelect={(s) => setStage((cur) => toggleStage(cur, s))} />

          <NeedsYou rows={needs} now={now} onOpen={(r) => setPeek(r.id)} onDo={doStep} onTriage={() => setTriage(true)} />

          <div className="flex flex-wrap items-center gap-2.5 pt-1.5">
            <b className="font-bold text-slate-800">{listLabel}</b>
            <span className="text-[11px] text-slate-500">
              <span className="tabular-nums">{shown.length}</span> shown
              {stage !== 'all' && <> · <button type="button" className="font-bold text-[#3D52A0]" onClick={() => setStage('all')}>Show all</button></>}
            </span>
            <span className="flex-1" />
            {view === 'list' && (
              <span className="flex items-center gap-2">
                <span className={LABEL}>Group by</span>
                <Segmented<GroupBy> label="Group by" size="sm" value={group} onChange={setGroup}
                  options={[{ id: 'stage', label: 'Stage' }, { id: 'designer', label: 'Designer' }]} />
              </span>
            )}
            <Segmented<View> label="View" size="sm" glide value={view} onChange={setView}
              options={[{ id: 'list', label: 'List' }, { id: 'board', label: 'Board' }, { id: 'week', label: 'This week' }]} />
          </div>

          {selected.size > 0 && (
            <div className="rounded-2xl border border-[#3D52A0]/25 bg-[#3D52A0]/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap hud-swap">
              <p className="text-sm font-bold text-[#334486]"><span className="tabular-nums">{selected.size}</span> project{selected.size === 1 ? '' : 's'} selected</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="quiet" onClick={() => setSelected(new Set())}>Clear</Button>
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setDeleteIds([...selected])}>Delete <span className="tabular-nums">{selected.size}</span></Button>
              </div>
            </div>
          )}

          <div key={view} className="hud-swap">
            {shown.length === 0 ? (
              <EmptyState icon={Search} title="No project matches" text="Nothing here under these filters."
                action={<Button size="sm" onClick={clearFilters}>Clear the filters</Button>} />
            ) : view === 'list' ? (
              <ProjectList groups={groups} by={group} selected={selected} nameOf={nameOf} drawings={drawings} now={now}
                onOpen={(r) => setPeek(r.id)} onDo={doStep} onFile={(r, route) => open(r, route)}
                onMenu={(r, at) => setMenu({ id: r.id, at })} onTag={tag} />
            ) : view === 'board' ? (
              <ProjectBoard rows={shown} stage={stage} nameOf={nameOf}
                onOpen={(r) => setPeek(r.id)} onDo={doStep} onMove={(r, to) => changeStage(r, to)} onTag={tag} />
            ) : (
              <ProjectWeek rows={shown} nameOf={nameOf} now={now}
                onOpen={(r) => setPeek(r.id)} onDo={doStep} onMove={(r, day) => setDue(r, day)} />
            )}
          </div>
        </>
      )}

      {filtersAt && <PopMenu anchor={filtersAt} items={filterItems} onClose={() => setFiltersAt(null)} />}
      {menu && menuRow && <PopMenu anchor={menu.at} items={rowMenu(menuRow)} onClose={() => setMenu(null)} />}
      {peekRow && (
        <ProjectPeek row={peekRow} nameOf={nameOf} now={now} onClose={() => setPeek(null)}
          onOpenProject={(r) => open(r)} onFile={(r, route) => open(r, route)} onDo={doStep}
          onChangeStage={(r) => { setPeek(null); changeStage(r); }} onClone={(r) => { setPeek(null); onDuplicateProject(r.project); }} onTag={tag} />
      )}
      {cmd && <CommandBar rows={rows} onRun={runCommand} onClose={() => setCmd(false)} />}
      {triage && (
        <TriageDeck rows={needs} onClose={() => setTriage(false)} onDo={doStep}
          onOpen={(r) => { setTriage(false); setPeek(r.id); }}
          onSnooze={snooze}
          onRestart={unsnoozeHere} />
      )}
      {assignOpen && <AssignProjectsModal onClose={() => setAssignOpen(false)} />}
      {statusFor && (
        <ProjectStatusTransitionModal
          project={statusFor.project}
          isOpen
          initialStatus={statusFor.to}
          onClose={() => setStatusFor(null)}
          onStatusChange={async (id, status, note) => {
            if (onStatusChange) await onStatusChange(id, status, note);
            else onQuickUpdate?.(id, 'status', status);
            setStatusFor(null);
          }}
        />
      )}
      {deleteIds && deleteIds.length > 0 && (
        <DeleteProjects names={deleteIds.map((id) => byId.get(id)?.name || 'Unnamed project')} onCancel={() => setDeleteIds(null)}
          onConfirm={() => { deleteIds.forEach((id) => onDeleteProject(id)); setSelected(new Set()); setDeleteIds(null); }} />
      )}
    </div>
  );
}

/** Deleting one project or several: named, not counted, on the AssignProjectsModal pattern. */
function DeleteProjects({ names, onCancel, onConfirm }: { names: string[]; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);
  const one = names.length === 1;
  return createPortal(
    <div className="pj-overlay fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Delete projects">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="phd-pop relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Delete</p>
          <h3 className="font-bold text-slate-800 mt-1">{one ? 'Delete this project?' : `Delete ${names.length} projects?`}</h3>
          <ul className="mt-3 max-h-48 overflow-y-auto space-y-1">
            {names.map((n, i) => <li key={i} className="text-sm font-semibold text-slate-700">{n}</li>)}
          </ul>
          <p className="text-xs text-slate-500 mt-3">
            This cannot be undone. Everything hanging off {one ? 'it' : 'them'} goes too: the BOQ, decisions, purchase orders and documents.{' '}
            <span className="font-semibold text-slate-700">Any client portal among them is taken down at the same time.</span>
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-3.5 bg-slate-50 border-t border-slate-100">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" icon={Trash2} onClick={onConfirm}>{one ? 'Delete permanently' : `Delete ${names.length} permanently`}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
