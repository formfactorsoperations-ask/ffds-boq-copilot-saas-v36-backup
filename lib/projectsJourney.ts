/*
  Projects: journey, needs you, one list (DESIGN.md, approved 25 Nov 2026).

  Everything the Projects screen works out rather than draws. It builds on
  lib/projectFolders (stages, their colours, the Actual / Dummy tag, the files
  that matter at each stage, the next-step button) and on
  services/nextActionEngine (each project's top action) rather than repeating
  them, and the glass-folder desk (components/ProjectListTab) reads the same
  filters and Needs-you counts from here, so the two screens always agree
  while the studio switch keeps both.
*/
import type { FullProjectData, ProjectStatus } from '../types';
import { getNextActions, type NextAction } from '../services/nextActionEngine';
import { buildDocumentCompleteness, type DocumentCompleteness } from './documentCompleteness';
import { classifyProject } from './projectClassification';
import { engagementOf, type EngagementType } from './engagement';
import { boqTagOf, type BoqTag } from './playground/versions';
import { assignedDesignersFor, type ProjectDesignersMap } from './roleAccess';
import { coverCandidates } from './coverPhoto';
import {
  STAGE, stageOfProject, kindOf, folderFiles, folderNext,
  type FolderStage, type KindTag, type RoutedFile, type FolderNext,
} from './projectFolders';

/* ── Each project's top action, worked out once per screen ──────────────── */

/** Projects with nothing left to do: no next step is asked of them. */
export const DORMANT = ['completed', 'lost', 'archived'];

export interface ProjectIntel {
  action: NextAction | null;
  docs: DocumentCompleteness;
}

/**
 * The top next step (services/nextActionEngine) and the document check of
 * every project. Both walk a project's whole context, and the strip, the
 * Needs-you counts, the carousel and every row want the same answers, so they
 * are worked out once and read many times.
 */
export function projectIntel(projects: FullProjectData[], role?: string | null): Map<string, ProjectIntel> {
  const map = new Map<string, ProjectIntel>();
  for (const proj of projects) {
    const c: any = proj.context || {};
    const status = (c.status || 'draft') as string;
    const actions = DORMANT.includes(status)
      ? []
      : getNextActions(
          {
            project: proj.context,
            designPaymentStages: c.paymentMilestones,
            designGate: c.designGate,
            drawingTrackerSummary: null,
            scopeAdditionsSummary: {
              pending: (c.scopeAdditions || []).filter((sa: any) => sa.status === 'pending_approval' || sa.status === 'pending').length,
            },
            timeline: null,
          },
          role || 'Admin',
        );
    map.set(proj.id, { action: actions[0] || null, docs: buildDocumentCompleteness(proj.context) });
  }
  return map;
}

/* ── Filters (both Projects screens) ────────────────────────────────────── */

export type KindFilter = 'all' | 'actual' | 'dummy' | 'untagged';
export type AlertFilter = 'blocker' | 'due' | 'unsigned' | 'risk';
/** A stage, every stage, or Closed (lost and terminated together). */
export type StageFilter = 'all' | FolderStage | 'closed';

/** The five stages a live project moves through, in order. */
export const FLOW: FolderStage[] = ['lead', 'proposal', 'won', 'execution', 'completed'];
/** Lost and terminated: shown together as "Closed". */
export const CLOSED: FolderStage[] = ['lost', 'terminated'];
/** The steps under the journey bar. */
export const STEP_WORDS = ['Lead', 'Quote', 'Won', 'Site', 'Done'];

export const matchesKind = (proj: FullProjectData, kind: KindFilter) =>
  kind === 'all' || classifyProject(proj) === (kind === 'dummy' ? 'test' : kind);

export const matchesStage = (proj: FullProjectData, stage: StageFilter | string) => {
  if (stage === 'all') return true;
  const s = stageOfProject(proj);
  return stage === 'closed' ? CLOSED.includes(s) : s === stage;
};

export const matchesBoq = (proj: FullProjectData, b: 'all' | BoqTag) => b === 'all' || boqTagOf(proj.tiers) === b;

export const matchesEngagement = (proj: FullProjectData, e: 'all' | EngagementType) =>
  e === 'all' || engagementOf(proj.context) === e;

export const isAtRisk = (proj: FullProjectData) => (((proj as any).decisionBrainOutput?.riskScore || 0) > 0);

export function matchesAlert(proj: FullProjectData, alert: AlertFilter | null, intel: Map<string, ProjectIntel>) {
  if (!alert) return true;
  const it = intel.get(proj.id);
  if (alert === 'unsigned') return !!it?.docs.unsignedContract;
  if (alert === 'risk') return isAtRisk(proj);
  return it?.action?.priority === alert;
}

/** True when every word typed appears somewhere in `words` (the name, the client, the place, the stage…). */
export function matchesSearch(query: string, words: Array<string | null | undefined>) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return words.filter(Boolean).join(' ').toLowerCase().includes(q);
}

export interface NeedsCounts { blocker: number; due: number; unsigned: number; risk: number; total: number }

/**
 * The Needs-you counts. They follow the Actual / Dummy switch and nothing
 * else: filtering to Handed over should not make three live blockers vanish
 * from the top of the page.
 */
export function needsCounts(projects: FullProjectData[], kind: KindFilter, intel: Map<string, ProjectIntel>): NeedsCounts {
  let blocker = 0, due = 0, unsigned = 0, risk = 0;
  for (const proj of projects) {
    if (!matchesKind(proj, kind)) continue;
    const it = intel.get(proj.id);
    if (it?.action?.priority === 'blocker') blocker++;
    else if (it?.action?.priority === 'due') due++;
    if (it?.docs.unsignedContract) unsigned++;
    if (isAtRisk(proj)) risk++;
  }
  return { blocker, due, unsigned, risk, total: blocker + due + unsigned + risk };
}

/* ── One row per project ────────────────────────────────────────────────── */

export interface JourneyRow {
  id: string;
  project: FullProjectData;
  name: string;
  client: string;
  /** Type · area · place. */
  meta: string;
  stage: FolderStage;
  kind: KindTag;
  boq: BoqTag;
  /** The screens that matter at its stage (lib/projectFolders folderFiles). */
  files: RoutedFile[];
  /** The next-step button, or null when nothing is pending. */
  next: FolderNext | null;
  action: NextAction | null;
  /** Designer emails. */
  designers: string[];
  /** The project's photo, or null for the stage-tinted "No render yet" tile. */
  photo: string | null;
  /** Every photo it could show, best first: the next is tried when one fails to load. */
  photos: string[];
  updated: number;
}

/**
 * The project's photos, best first (lib/coverPhoto): the cover set for it,
 * else the latest render the client approved, else the latest render (Drive
 * links turned into images). The screen draws the first that loads, and the
 * stage-tinted "No render yet" tile when none does.
 */
export function photosOf(project: FullProjectData): string[] {
  return coverCandidates(project.context as any, 900).map((c) => c.url!).filter(Boolean);
}

/** The project's photo: the first of its photos, or null. */
export const photoOf = (project: FullProjectData): string | null => photosOf(project)[0] || null;

export function metaOf(project: FullProjectData): string {
  const c: any = project.context || {};
  return [
    c.config || c.bhk,
    Number(c.area) > 0 ? `${Math.round(Number(c.area)).toLocaleString('en-IN')} sft` : null,
    c.location || c.city,
  ].filter(Boolean).join(' · ');
}

export function buildRow(
  project: FullProjectData,
  name: string,
  intel: Map<string, ProjectIntel>,
  designersMap?: ProjectDesignersMap | null,
): JourneyRow {
  const c: any = project.context || {};
  const action = intel.get(project.id)?.action || null;
  return {
    id: project.id,
    project,
    name,
    client: c.clientName || 'No client yet',
    meta: metaOf(project),
    stage: stageOfProject(project),
    kind: kindOf(project),
    boq: boqTagOf(project.tiers),
    files: folderFiles(project),
    next: folderNext(action),
    action,
    designers: assignedDesignersFor(project, designersMap),
    ...(() => { const photos = photosOf(project); return { photos, photo: photos[0] || null }; })(),
    updated: Number(project.lastModified) || 0,
  };
}

/** The words a row is found by: what it shows, its stage, its status. */
export const rowWords = (r: JourneyRow) => [
  r.name, r.project.context?.name, r.client, r.meta, (r.project.context as any)?.city,
  STAGE[r.stage].label, r.project.context?.status,
];

/* ── The journey strip ──────────────────────────────────────────────────── */

export interface StripStage { stage: FolderStage; rows: JourneyRow[]; blocked: number }

/** The five live stages with their projects and blockers, and how many are closed. */
export function stripStages(rows: JourneyRow[]): { stages: StripStage[]; closed: number } {
  const stages = FLOW.map((stage) => {
    const at = rows.filter((r) => r.stage === stage);
    return { stage, rows: at, blocked: at.filter((r) => r.action?.priority === 'blocker').length };
  });
  return { stages, closed: rows.filter((r) => CLOSED.includes(r.stage)).length };
}

/** A click on a stage filters to it; a second click shows every stage again. */
export const toggleStage = (current: StageFilter, clicked: StageFilter): StageFilter => (current === clicked ? 'all' : clicked);

/* ── Needs you ──────────────────────────────────────────────────────────── */

export const rankOf = (r: JourneyRow) =>
  !r.action ? 3 : r.action.priority === 'blocker' ? 0 : r.action.priority === 'due' ? 1 : 2;

/** A snoozed step's key: one project's one action. */
export const snoozeKey = (r: Pick<JourneyRow, 'id' | 'action'>) => `${r.id}:${r.action?.id || 'next'}`;

/** Projects with a next step, blockers first, then due, then the rest; snoozed ones left out. */
export function needsYouOrder(rows: JourneyRow[], snoozed: Set<string> = new Set()): JourneyRow[] {
  return rows
    .filter((r) => r.next && !snoozed.has(snoozeKey(r)))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rankOf(a.r) - rankOf(b.r) || a.i - b.i)
    .map(({ r }) => r);
}

/*
  Snoozing from the triage deck ("left snoozes to tomorrow"). Phase 1 keeps it
  on this device, by project and step; when next steps carry due dates
  (Phase 3) a snooze moves the date on the project instead.
*/
const SNOOZE_KEY = 'sd.projects.snoozed';

export const startOfTomorrow = (now: number) => {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};

function readSnoozes(): Record<string, number> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SNOOZE_KEY) : null;
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeSnoozes(v: Record<string, number>) {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(v)); } catch { /* private mode: the snooze lasts for this visit */ }
}

/** The steps still snoozed at `now`; expired ones are dropped. */
export function activeSnoozes(now: number = Date.now()): Set<string> {
  const all = readSnoozes();
  const live: Record<string, number> = {};
  for (const [k, until] of Object.entries(all)) if (Number(until) > now) live[k] = Number(until);
  if (Object.keys(live).length !== Object.keys(all).length) writeSnoozes(live);
  return new Set(Object.keys(live));
}

export function snoozeUntilTomorrow(key: string, now: number = Date.now()) {
  writeSnoozes({ ...readSnoozes(), [key]: startOfTomorrow(now) });
}

export function unsnooze(keys: string[]) {
  const all = readSnoozes();
  for (const k of keys) delete all[k];
  writeSnoozes(all);
}

/* ── Group by stage or designer ─────────────────────────────────────────── */

export interface RowGroup {
  key: string;
  label: string;
  /** The stage colour, for a stage group. */
  color?: string;
  /** A designer's email, for a designer group. */
  email?: string;
  rows: JourneyRow[];
  /** A designer's projects still under way (lead to on site). */
  live: number;
}

const LIVE: FolderStage[] = ['lead', 'proposal', 'won', 'execution'];
const ORDER: FolderStage[] = [...FLOW, ...CLOSED];

export function groupRows(rows: JourneyRow[], by: 'stage' | 'designer', nameOf: (email: string) => string = (e) => e): RowGroup[] {
  const live = (rs: JourneyRow[]) => rs.filter((r) => LIVE.includes(r.stage)).length;
  if (by === 'stage') {
    return ORDER
      .map((s) => ({ key: s, label: STAGE[s].label, color: STAGE[s].color, rows: rows.filter((r) => r.stage === s) }))
      .filter((g) => g.rows.length)
      .map((g) => ({ ...g, live: live(g.rows) }));
  }
  /* A project with two designers is in both their groups: it is on both their plates. */
  const byEmail = new Map<string, JourneyRow[]>();
  const none: JourneyRow[] = [];
  for (const r of rows) {
    if (!r.designers.length) none.push(r);
    for (const e of r.designers) byEmail.set(e, [...(byEmail.get(e) || []), r]);
  }
  const step = (r: JourneyRow) => ORDER.indexOf(r.stage);
  const groups: RowGroup[] = [...byEmail.entries()]
    .map(([email, rs]) => ({ key: email, email, label: nameOf(email), rows: [...rs].sort((a, b) => step(a) - step(b)), live: live(rs) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (none.length) groups.push({ key: '__none', label: 'No designer yet', rows: [...none].sort((a, b) => step(a) - step(b)), live: live(none) });
  return groups;
}

/* ── Ctrl K ─────────────────────────────────────────────────────────────── */

/** "Pali Bungalow · opens Site control room": the screen named when one of its files opens it. */
export function stepSub(r: JourneyRow): string {
  const tab = routeTab(r.next?.route);
  const file = r.files.find((f) => routeTab(f.route) === tab);
  return file ? `${r.name} · opens ${file.name}` : `${r.name} · ${STAGE[r.stage].label}`;
}

export interface CommandItem {
  group: 'Do next' | 'Recent projects' | 'Projects' | 'Jump to';
  kind: 'step' | 'project' | 'file';
  row: JourneyRow;
  title: string;
  sub: string;
  /** The screen it opens, for a step or a file. */
  route?: string;
}

/**
 * The command bar. Empty, it offers the steps that block or are due and the
 * projects touched most recently; as you type, the projects that match, the
 * steps that match, and the screens of the projects that match.
 */
export function commandResults(rows: JourneyRow[], query: string): CommandItem[] {
  const q = query.trim().toLowerCase();
  const step = (r: JourneyRow): CommandItem => ({
    group: 'Do next', kind: 'step', row: r, title: r.next!.label, sub: stepSub(r), route: r.next!.route,
  });
  const proj = (group: 'Recent projects' | 'Projects') => (r: JourneyRow): CommandItem => ({
    group, kind: 'project', row: r, title: r.name, sub: [STAGE[r.stage].label, r.client, (r.project.context as any)?.location || (r.project.context as any)?.city].filter(Boolean).join(' · '),
  });
  if (!q) {
    const due = needsYouOrder(rows).filter((r) => r.action && r.action.priority !== 'suggested').slice(0, 5).map(step);
    const recent = [...rows].sort((a, b) => b.updated - a.updated).slice(0, 5).map(proj('Recent projects'));
    return [...due, ...recent];
  }
  const found = rows.filter((r) => matchesSearch(q, rowWords(r)));
  const steps = needsYouOrder(rows).filter((r) => matchesSearch(q, [r.next?.label, r.action?.title, r.name])).slice(0, 4).map(step);
  const files: CommandItem[] = [];
  for (const r of found.slice(0, 3)) {
    for (const f of r.files.slice(0, 2)) files.push({ group: 'Jump to', kind: 'file', row: r, title: f.name, sub: r.name, route: f.route });
  }
  return [...found.slice(0, 6).map(proj('Projects')), ...steps, ...files];
}

/* ── Moving a project ───────────────────────────────────────────────────── */

/** The status a project is given when it is dragged to a stage's lane. Closed means lost; a termination is offered by the status window. */
export function statusForStage(stage: FolderStage | 'closed'): ProjectStatus {
  switch (stage) {
    case 'lead': return 'lead';
    case 'proposal': return 'proposal_sent';
    case 'won': return 'won';
    case 'execution': return 'execution';
    case 'completed': return 'completed';
    default: return 'lost';
  }
}

/**
 * The screen a next step or file opens. Some routes carry a hint after "?"
 * ("site-ops?focus=snags"); the tab is what comes before it, and opening the
 * whole string as a tab drew a blank screen.
 */
export const routeTab = (route?: string | null) => (route ? route.split('?')[0] : undefined);
