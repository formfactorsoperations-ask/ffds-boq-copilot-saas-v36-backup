import {
  ProjectSchedule, ScheduleTask, ProjectContext, FullBoqItem, WorkCalendar,
} from '../types';
import { renovationPlan, livedInDays, DEFAULT_RENOVATION, type RenovationRules, type RenovationPlan } from './renovation';
import {
  DEFAULT_CALENDAR, toISO, toDayNum, laneOrder, isDesignGateTask, isHandoverTask,
  nextWorkingDay, workSpanEnd, workingDaysBetween, computeSchedule, programmeSpanDays,
} from './schedule';
import { engagementOf } from './engagement';

// ============================================================================
// scheduleBuilder — derive a first schedule from what the project already knows.
//
// Nothing here is invented: design steps come from the studio's own process,
// execution tasks from the BOQ's trades in the sequence ExecutionWorkspace
// already sorts them, procurement from procurementLeadTimeWeeks, and the target
// from targetHandoverDate. All three are existing fields the Timeline has never
// read.
//
// The result is a starting point a human then edits — durations especially,
// which are a guess until the studio corrects them.
// ============================================================================

/** Trade sequence, mirroring ExecutionWorkspace.getSortWeight so the two agree. */
const TRADE_ORDER: { match: RegExp; trade: string }[] = [
  { match: /site|services|preliminar|general/i, trade: 'Site & Preliminaries' },
  { match: /civil|demolition/i, trade: 'Civil & Demolition' },
  { match: /plumb/i, trade: 'Plumbing' },
  { match: /electric|wiring|hvac|\bac\b/i, trade: 'Electrical' },
  { match: /ceiling|gypsum/i, trade: 'False Ceiling' },
  { match: /floor|tiling|stone|marble/i, trade: 'Flooring & Tiling' },
  { match: /carpentry|woodwork|modular|kitchen|wardrobe/i, trade: 'Carpentry' },
  { match: /paint|finishing|polish/i, trade: 'Painting & Finishing' },
];

const tradeOf = (cat: string): string => {
  const hit = TRADE_ORDER.find(t => t.match.test(cat || ''));
  return hit ? hit.trade : 'Other works';
};

/*
  Working days split across stages so they add up to the total asked for.
  Each stage's weight is its trade's share of the BOQ value times its share of
  that trade -- a rough first pass on purpose: a wrong duration that is visible
  and editable beats an invisible assumption.

  Each stage used to be rounded on its own and then floored at 2 days (and its
  trade at 3), so a 75-day site programme came out at 85 or more: every stage
  rounded up a little and nothing took it back. Largest remainders hand out
  the leftover days instead, so the stages sum to `total` whenever there are
  enough days for every stage to get its minimum.
*/
export function splitWorkDays(weights: number[], total: number, min = 2): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const raw = weights.map(w => (sum > 0 ? Math.max(0, w) / sum : 1 / weights.length) * total);
  const days = raw.map(r => Math.max(min, Math.floor(r)));
  let left = total - days.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) days[byRemainder[k % days.length].i]++;
  // The minimums overshot: take the excess back from the longest stages.
  while (left < 0) {
    let longest = -1;
    days.forEach((d, i) => { if (d > min && (longest < 0 || d > days[longest])) longest = i; });
    if (longest < 0) break;
    days[longest]--;
    left++;
  }
  return days;
}

/** What sized the site programme, so the Timeline can say why it is as long as it is. */
export interface SiteSizing {
  /** All the site's working days: the strip-out of a renovation included. */
  workDays: number;
  areaSqFt: number;
  rooms: number;
  scopes: { civil: boolean; carpentry: boolean; services: boolean; painting: boolean };
  /** A renovation: its strip-out, and how much longer it takes lived in (lib/renovation). */
  renovation: RenovationPlan;
}

/*
  How many working days the site takes, from the size of the home and what is
  being built.

  This replaces a flat 75 days for every project, which gave a 650 sq ft
  repaint the same programme as a 3,000 sq ft villa. The shape is the one the
  old "smart" builder in the Timeline already used -- a base, more for area and
  rooms, more for each kind of work in the BOQ -- so there is one rule, here,
  for every way a timeline gets made. It is a starting point: the studio edits
  the bars.
*/
export function estimateSiteWorkDays(
  projectContext: Partial<ProjectContext> | undefined,
  boq: FullBoqItem[] = [],
  rules: RenovationRules = DEFAULT_RENOVATION,
): SiteSizing {
  const ctx: any = projectContext || {};
  const roomsList: any[] = Array.isArray(ctx.rooms) ? ctx.rooms : [];
  const measured = roomsList.reduce((sum, r) => sum + (Number(r?.size) || 0), 0);
  const areaSqFt = Number(ctx.area) > 0 ? Number(ctx.area) : measured > 0 ? measured : 1000;

  const live = boq.filter(i => ((i as any).qty ?? (i as any).quantity ?? 1) > 0);
  const boqRooms = new Set(live.map(i => (i as any).room || (i as any).roomName).filter(Boolean));
  const rooms = roomsList.length || boqRooms.size || 3;

  const trades = new Set(live.map(i => tradeOf((i as any).cat || (i as any).category || '')));
  // No BOQ yet: plan for a full turnkey job rather than an empty one.
  const all = live.length === 0;
  const scopes = {
    civil: all || trades.has('Civil & Demolition'),
    carpentry: all || trades.has('Carpentry'),
    services: all || trades.has('Plumbing') || trades.has('Electrical'),
    painting: all || trades.has('Painting & Finishing'),
  };

  let days = 25;
  days += Math.max(0, Math.round((areaSqFt - 500) / 100));
  days += Math.max(0, rooms - 4);
  if (scopes.civil) days += 5;
  if (scopes.carpentry) days += 10;
  if (scopes.services) days += 5;
  if (scopes.painting) days += 3;

  /*
    A renovation (a finished flat): lived in, the work goes room by room and
    takes longer; and it starts with the strip-out, a stage of its own.
  */
  const renovation = renovationPlan(projectContext, rules);
  const work = livedInDays(Math.min(120, Math.max(25, days)), renovation);
  return { workDays: work + renovation.stripOutDays, areaSqFt, rooms, scopes, renovation };
}

/*
  The canonical build sequence, at module scope so it has two readers.

  It used to live inside buildScheduleFromProject, which made it a detail of
  how a first schedule is generated. It is more than that: `dependsOnStages`
  is the studio's statement of what physically has to be finished before what,
  and the drag-to-reorder check reads the same table rather than carrying a
  second copy that could drift away from it.
*/
interface StageTemplate {
  id: string;
  title: string;
  trade: string;
  share: number; // fraction of the trade's total duration
  dependsOnStages: string[]; // list of stage IDs it depends on
}

const EXECUTION_TEMPLATES: StageTemplate[] = [
  { id: 'site-prelims', title: 'Site Setup & Preliminaries', trade: 'Site & Preliminaries', share: 1.0, dependsOnStages: [] },
  /* A renovation only (lib/renovation): what is there today taken out and the debris cleared, before civil work. Its days are its own, not a share. */
  { id: 'strip-out', title: 'Strip-out & Debris Removal', trade: 'Civil & Demolition', share: 0, dependsOnStages: ['site-prelims'] },
  { id: 'civil-demolition', title: 'Civil & Demolition Works', trade: 'Civil & Demolition', share: 1.0, dependsOnStages: ['strip-out'] },
  { id: 'plumb-concealed', title: 'Plumbing - Concealed Piping', trade: 'Plumbing', share: 0.6, dependsOnStages: ['civil-demolition'] },
  { id: 'elec-conduit', title: 'Electrical - Conduit & First-Fixing', trade: 'Electrical', share: 0.35, dependsOnStages: ['civil-demolition'] },
  { id: 'flooring-tiling', title: 'Flooring & Tiling Works', trade: 'Flooring & Tiling', share: 1.0, dependsOnStages: ['plumb-concealed', 'elec-conduit'] },
  { id: 'ceiling-framing', title: 'False Ceiling - Framing & Channeling', trade: 'False Ceiling', share: 0.5, dependsOnStages: ['flooring-tiling'] },
  { id: 'elec-wiring', title: 'Electrical - Wiring & Box Installation', trade: 'Electrical', share: 0.35, dependsOnStages: ['ceiling-framing'] },
  { id: 'ceiling-boarding', title: 'False Ceiling - Sheet Boarding & Taping', trade: 'False Ceiling', share: 0.5, dependsOnStages: ['elec-wiring'] },
  { id: 'carp-carcass', title: 'Carpentry - Carcass & Woodwork Structure', trade: 'Carpentry', share: 0.6, dependsOnStages: ['ceiling-boarding'] },
  { id: 'paint-first', title: 'Painting - Primer & First Coats', trade: 'Painting & Finishing', share: 0.5, dependsOnStages: ['carp-carcass'] },
  { id: 'carp-shutters', title: 'Carpentry - Laminates, Shutters & Hardware', trade: 'Carpentry', share: 0.4, dependsOnStages: ['paint-first'] },
  { id: 'elec-final', title: 'Electrical - Final Fixtures & Plates', trade: 'Electrical', share: 0.3, dependsOnStages: ['carp-shutters'] },
  { id: 'plumb-fixtures', title: 'Plumbing - Sanitary Fixture Fittings', trade: 'Plumbing', share: 0.4, dependsOnStages: ['elec-final'] },
  { id: 'paint-final', title: 'Painting - Final Touchups & Coating', trade: 'Painting & Finishing', share: 0.5, dependsOnStages: ['plumb-fixtures'] },
  { id: 'other-works', title: 'Other Miscellaneous Works', trade: 'Other works', share: 1.0, dependsOnStages: ['paint-final'] }
];

export interface BuildOptions {
  /** Total execution working days to distribute. Default from studio history. */
  executionWorkDays?: number;
  calendar?: WorkCalendar;
  /** The studio's renovation rules (Terms & Payment); missing, the defaults. */
  renovation?: RenovationRules;
  /** Design steps already tracked, newest schema from useTimelinePhases. */
  designSteps?: { stepNumber: number; title: string; startDate?: string; endDate?: string; durationDays?: number }[];
}

export function buildScheduleFromProject(
  projectContext: ProjectContext | undefined,
  boq: FullBoqItem[] = [],
  opts: BuildOptions = {},
): ProjectSchedule {
  const calendar = opts.calendar || DEFAULT_CALENDAR;
  const tasks: ScheduleTask[] = [];
  const todayISO = toISO(Math.floor(Date.now() / 86400000));

  // ---- Execution lane, by trade (calculated early to know if we have trades) ----
  const byTrade = new Map<string, number>();
  boq.forEach(item => {
    const value = (item.qty || 0) * ((item.materials || 0) + (item.labor || 0));
    const t = tradeOf(item.cat || (item as any).category || '');
    byTrade.set(t, (byTrade.get(t) || 0) + value);
  });

  const totalValue = [...byTrade.values()].reduce((a, b) => a + b, 0);
  // Sized from the home and its scope (estimateSiteWorkDays), unless the caller says otherwise.
  const sizing = estimateSiteWorkDays(projectContext, boq, opts.renovation);
  const totalWorkDays = opts.executionWorkDays ?? sizing.workDays;
  /* A renovation's strip-out is a stage of its own, with its own days; the rest is shared out as before. */
  const stripOutDays = sizing.renovation.stripOutDays;

  const ordered = TRADE_ORDER
    .map(t => t.trade)
    .concat('Other works')
    .filter(t => byTrade.has(t));

  // ---- Design lane ---------------------------------------------------------
  let steps = opts.designSteps || [];

  // Filter out any steps that correspond to execution, procurement, or handover phases to prevent duplicates or misplaced stages
  steps = steps.filter(s => {
    const title = s.title || '';
    return !(/procurement|carpentry|execution|finishes|finishing|installation|handover|closeout|site|civil|tiling|flooring|electrical|plumbing|painting|completion|snag/i.test(title));
  });

  // A design-only project: the studio designs, the client's contractors build (lib/engagement.ts).
  const designOnly = engagementOf(projectContext) === 'design_only';

  // If no design steps provided, use the studio's standard 5-step design process
  if (steps.length === 0) {
    steps = [
      { stepNumber: 1, title: 'Discovery & Statement of Function (SOF)', durationDays: 6 },
      { stepNumber: 2, title: '2D Spatial Layouts & Moodboards', durationDays: 8 },
      { stepNumber: 3, title: '3D Visualisations & Material Selections', durationDays: 10 },
      { stepNumber: 4, title: 'Good-For-Construction (GFC) Drawings', durationDays: 8 },
      { stepNumber: 5, title: designOnly ? 'Final Selections & Design Sign-off' : 'BOQ Freeze & Design Sign-off', durationDays: 5 }
    ];
  }

  let prevDesignId: string | null = null;
  steps.forEach(s => {
    const id = `design-${s.stepNumber}`;
    tasks.push({
      id,
      title: s.title || `Step ${s.stepNumber}`,
      kind: 'design',
      dependencies: prevDesignId ? [prevDesignId] : [],
      workDays: Math.max(1, s.durationDays || 5),
      notBeforeISO: s.startDate?.slice(0, 10) || todayISO,
      status: 'pending',
    });
    prevDesignId = id;
  });

  /*
    Design Gate is the handoff: execution cannot begin before it closes.

    It depends on EVERY design task, not merely the last one added. Depending on
    `prevDesignId` alone made the rule an accident of insertion order — the gate
    was after the last step in the array, and any design work that arrived out of
    order, or was added later with a date of its own, sat outside the chain
    entirely. A Good-For-Construction drawing could then be scheduled after
    demolition had started, which is the one thing the gate exists to prevent.

    Depending on all of them says the rule directly: the gate closes when design
    is finished, whatever order the steps were written in.
  */
  const gateId = 'ms-design-gate';
  if (steps.length) {
    const designTaskIds = tasks.filter(t => t.kind === 'design').map(t => t.id);
    tasks.push({
      id: gateId, title: 'Design Gate', kind: 'milestone', workDays: 0,
      dependencies: designTaskIds, status: 'pending',
    });
  }

  /*
    A design-only project ends with the design. There is no execution, no
    procurement and no site handover to plan: the gate is the GFC release and
    the programme closes on the design closeout.
  */
  if (designOnly) {
    return designOnlyProgramme({
      tasks,
      holds: [],
      calendar,
      baselineAt: null,
      targetHandoverISO: projectContext?.targetHandoverDate
        ? String(projectContext.targetHandoverDate).slice(0, 10)
        : undefined,
    });
  }

  // ---- Execution lane, from the templates hoisted above -------------------
  const activeTemplates = (byTrade.size > 0
    ? EXECUTION_TEMPLATES.filter(t => byTrade.has(t.trade) || t.id === 'strip-out')
    : EXECUTION_TEMPLATES.filter(t => t.trade !== 'Other works'))
    .filter(t => t.id !== 'strip-out' || stripOutDays > 0);
  const activeTemplateIds = new Set(activeTemplates.map(t => `exec-${t.id}`));

  const findActivePredecessors = (stageId: string): string[] => {
    const template = EXECUTION_TEMPLATES.find(t => t.id === stageId);
    if (!template) return [];
    const preds: string[] = [];
    template.dependsOnStages.forEach(depId => {
      const depActive = activeTemplates.some(at => at.id === depId);
      if (depActive) {
        preds.push(`exec-${depId}`);
      } else {
        preds.push(...findActivePredecessors(depId));
      }
    });
    return preds;
  };

  /*
    Without a priced BOQ the execution days are shared evenly between the trades.

    The fallback was `1 / ordered.length`, but `ordered` lists the BOQ's trades,
    so with no BOQ it was empty and every trade got the whole 75 days: fifteen
    stages back to back came to about two years. That is every project without
    a BOQ, including a design-only project moved to turnkey.
  */
  const shared = activeTemplates.filter(t => t.id !== 'strip-out');
  const tradeCount = new Set(shared.map(t => t.trade)).size;
  const sharedDays = splitWorkDays(
    shared.map(template => {
      const tradeValue = byTrade.get(template.trade) || 0;
      const share = totalValue > 0 ? tradeValue / totalValue : 1 / Math.max(1, tradeCount);
      return share * template.share;
    }),
    Math.max(shared.length, totalWorkDays - stripOutDays),
  );
  const stageDays = activeTemplates.map(t => (t.id === 'strip-out' ? stripOutDays : sharedDays[shared.indexOf(t)]));
  activeTemplates.forEach((template, index) => {
    const stageDuration = stageDays[index];

    const id = `exec-${template.id}`;
    const directDeps = findActivePredecessors(template.id);
    
    // Fallback to Design Gate if no active predecessors in the execution flow
    const resolvedDeps = directDeps.length > 0 
      ? directDeps.filter(d => activeTemplateIds.has(d))
      : [gateId].filter(d => tasks.some(t => t.id === d));

    tasks.push({
      id,
      title: template.title,
      kind: 'execution',
      trade: template.trade,
      dependencies: resolvedDeps,
      workDays: stageDuration,
      status: 'pending',
      gates: { sof: true, gfc: true, payment: true, site: true },
    });
  });

  // ---- Procurement --------------------------------------------------------
  const leadWeeks = projectContext?.procurementLeadTimeWeeks;
  if (leadWeeks && ordered.length) {
    tasks.push({
      id: 'proc-materials',
      title: 'Long-lead materials',
      kind: 'procurement',
      dependencies: steps.length ? [gateId] : [],
      workDays: 5,
      leadTimeDays: leadWeeks * 7,
      status: 'pending',
      note: `${leadWeeks} week lead time from the project brief`,
    });
  }

  // ---- Handover -----------------------------------------------------------
  const lastActiveStageId = activeTemplates.length > 0 
    ? `exec-${activeTemplates[activeTemplates.length - 1].id}` 
    : null;

  if (lastActiveStageId) {
    tasks.push({
      id: 'ms-handover', title: 'Handover', kind: 'milestone', workDays: 0,
      dependencies: [lastActiveStageId], status: 'pending',
    });
  }

  return {
    tasks,
    holds: [],
    calendar,
    baselineAt: null,
    targetHandoverISO: projectContext?.targetHandoverDate
      ? String(projectContext.targetHandoverDate).slice(0, 10)
      : undefined,
  };
}

/*
  A schedule as a design-only project runs it.

  Drops execution and procurement work (whatever a saved schedule or an old
  BOQ put there), names the Design Gate for its job, GFC Release, and closes the
  programme on a Design Closeout milestone after it. Design tasks, holds,
  progress and the baseline are kept as they are. Used both by the builder and
  on schedules saved before the project became design only.
*/
function designOnlyProgramme(schedule: ProjectSchedule): ProjectSchedule {
  const dropped = new Set(
    schedule.tasks
      .filter(t => t.kind === 'execution' || t.kind === 'procurement' || isHandoverTask(t))
      .map(t => t.id),
  );
  const kept = schedule.tasks
    .filter(t => !dropped.has(t.id))
    .map(t => {
      const dependencies = (t.dependencies || []).filter(d => !dropped.has(d));
      const named = isDesignGateTask(t) ? { title: 'GFC Release' } : {};
      return { ...t, ...named, dependencies };
    });
  const gate = kept.find(isDesignGateTask);
  const designIds = kept.filter(t => t.kind === 'design').map(t => t.id);
  const closeoutDeps = gate ? [gate.id] : designIds.slice(-1);
  if (closeoutDeps.length) {
    kept.push({
      id: 'ms-handover', title: 'Design Closeout', kind: 'milestone', workDays: 0,
      dependencies: closeoutDeps, status: 'pending',
    });
  }
  return {
    ...schedule,
    tasks: kept,
    holds: schedule.holds || [],
  };
}

/**
 * A saved or derived schedule, as the project's engagement runs it. Turnkey
 * schedules come back unchanged; a design-only one loses its site work.
 */
export function scheduleForEngagement<T extends ProjectSchedule | null | undefined>(
  schedule: T,
  projectContext: { engagementType?: unknown } | null | undefined,
): T {
  if (!schedule || !schedule.tasks || engagementOf(projectContext) !== 'design_only') return schedule;
  return designOnlyProgramme(schedule) as T;
}

/**
 * Whether a saved schedule was planned for the engagement the project has now.
 *
 * False for a turnkey project whose saved schedule has no site work (saved
 * while it was design only), and for a design-only project whose saved
 * schedule still has some (saved while it was turnkey). The Timeline offers to
 * rebuild it either way.
 */
export function scheduleMatchesEngagement(
  schedule: ProjectSchedule | null | undefined,
  projectContext: { engagementType?: unknown } | null | undefined,
): boolean {
  if (!schedule?.tasks?.length) return true;
  const hasSite = schedule.tasks.some(t => t.kind === 'execution' || t.kind === 'procurement');
  return engagementOf(projectContext) === 'design_only' ? !hasSite : hasSite;
}

/** True when the project has enough to draw a schedule worth looking at. */
export function canBuildSchedule(boq: FullBoqItem[] = [], designSteps: any[] = []): boolean {
  return boq.length > 0 || designSteps.length > 0;
}


// ============================================================================
// Sequence check — is the order the studio just dragged into buildable?
//
// The Gantt lets a row be dragged up or down its lane, which is the right tool
// and a dangerous one: nothing physical stops you putting final paint before
// the carpentry it is painting, and the chart will happily draw it.
//
// The knowledge needed to catch that is already written down. EXECUTION_TEMPLATES
// is the canonical build sequence — `dependsOnStages` says which trade has to be
// finished before which — so the check reads that table rather than inventing a
// second one that could drift away from it. Anything the studio wrote itself,
// with a title the table does not recognise, falls back to the coarse trade
// order in TRADE_ORDER.
//
// It warns; it never refuses. A studio that wants second-fix electricals before
// the ceiling boards, because the boards are late and the sparky is on site
// today, knows something the table does not.
// ============================================================================

export interface SequenceWarning {
  /** The task now scheduled too early. */
  taskId: string;
  title: string;
  /** The task it is normally built after. */
  afterId: string;
  afterTitle: string;
  reason: string;
}

/** Everything that must be finished before `id`, followed transitively. */
function precedingStages(id: string, seen = new Set<string>()): Set<string> {
  const template = EXECUTION_TEMPLATES.find(t => t.id === id);
  if (!template) return seen;
  template.dependsOnStages.forEach(dep => {
    if (seen.has(dep)) return;
    seen.add(dep);
    precedingStages(dep, seen);
  });
  return seen;
}

/** `exec-civil-demolition` → `civil-demolition`, when the table knows it. */
const templateIdOf = (taskId: string): string | null => {
  const bare = taskId.replace(/^exec-/, '');
  return EXECUTION_TEMPLATES.some(t => t.id === bare) ? bare : null;
};

const tradeRank = (task: ScheduleTask): number => {
  const hay = `${task.trade || ''} ${task.title || ''}`;
  const i = TRADE_ORDER.findIndex(t => t.match.test(hay));
  return i < 0 ? TRADE_ORDER.length : i;
};

/**
 * Pairs in this execution lane that are built in the wrong order.
 *
 * Compared against the same call on the schedule before an edit, so the studio
 * is told about the problem it just introduced rather than every departure from
 * the template that was already there and deliberate.
 */
export function sequenceWarnings(tasks: ScheduleTask[]): SequenceWarning[] {
  const ordered = laneOrder(tasks, 'execution');
  if (ordered.length < 2) return [];

  const out: SequenceWarning[] = [];
  const positionOf = new Map(ordered.map((t, i) => [t.id, i]));

  ordered.forEach((task, i) => {
    const tid = templateIdOf(task.id);

    if (tid) {
      // Precise: the table names exactly what has to come first.
      const must = precedingStages(tid);
      ordered.forEach(other => {
        const otherTid = templateIdOf(other.id);
        if (!otherTid || !must.has(otherTid)) return;
        if ((positionOf.get(other.id) ?? 0) < i) return;   // already ahead, fine
        out.push({
          taskId: task.id, title: task.title,
          afterId: other.id, afterTitle: other.title,
          reason: `${task.title} is built after ${other.title}, not before it.`,
        });
      });
      return;
    }

    /*
      A task the studio wrote itself. The trade order is all that is known, so
      the test is coarser: only flag it against the task immediately in front,
      and only when the trades are genuinely out of sequence. Two tasks of the
      same trade say nothing about which comes first.
    */
    const prev = ordered[i - 1];
    if (!prev || templateIdOf(prev.id)) return;
    const a = tradeRank(task);
    const p = tradeRank(prev);
    if (a >= p || a === TRADE_ORDER.length || p === TRADE_ORDER.length) return;
    out.push({
      taskId: task.id, title: task.title,
      afterId: prev.id, afterTitle: prev.title,
      reason: `${TRADE_ORDER[a].trade} normally comes before ${TRADE_ORDER[p].trade}.`,
    });
  });

  return out;
}

/**
 * The warnings an edit *introduces* — what the studio needs to be asked about.
 *
 * A schedule already out of template order stays that way silently: it was
 * either edited deliberately or built from a BOQ with trades the template does
 * not cover, and re-reporting it on every drag would train everyone to click
 * through the dialog without reading it.
 */
export function newSequenceWarnings(before: ScheduleTask[], after: ScheduleTask[]): SequenceWarning[] {
  const known = new Set(sequenceWarnings(before).map(w => `${w.taskId}>${w.afterId}`));
  return sequenceWarnings(after).filter(w => !known.has(`${w.taskId}>${w.afterId}`));
}

// ---------------------------------------------------------------------------
// Generating from the studio's process template
// ---------------------------------------------------------------------------

export interface TemplateStep { stepNumber: number; title: string; defaultDuration?: number }

/**
 * The phases "Generate via Studio Template" writes: each process step, back to
 * back from the kickoff, on working days. Pure, so the preview on the empty
 * Timeline and the generator itself are the same calculation.
 */
export function templatePhases(kickoffISO: string, steps: TemplateStep[] = []) {
  let from = toDayNum(kickoffISO.slice(0, 10));
  return steps.map(step => {
    const durationDays = step.defaultDuration || 14;
    const startDay = nextWorkingDay(DEFAULT_CALENDAR, from);
    const endDay = workSpanEnd(DEFAULT_CALENDAR, startDay, durationDays);
    from = endDay + 1;
    return {
      stepNumber: step.stepNumber,
      title: step.title,
      startDate: toISO(startDay) + 'T00:00:00.000Z',
      endDate: toISO(endDay) + 'T23:59:59.000Z',
      durationDays,
    };
  });
}

/**
 * A programme as the proposal, the agreement and the Timeline all state it.
 * Working days exclude Sundays and holidays; plain days are calendar days,
 * counted the way the Gantt's Total Duration counts them.
 */
export interface ProgrammeSummary {
  /** saved: the studio's saved schedule. timeline: generated phases. estimate: what Generate would produce. */
  source: 'saved' | 'timeline' | 'estimate';
  startISO: string | null;
  designGateISO: string | null;
  finishISO: string | null;
  /** Working days from the first design step to the end of the last one. */
  designWorkDays: number;
  /** Working days after design, to handover. 0 for a design-only project. */
  siteWorkDays: number;
  /** Calendar days, start to handover, both ends counted. */
  totalDays: number;
  /** Calendar days of design, from the start to the end of the last design step. */
  designDays: number;
  /** Calendar days after design, to handover. */
  siteDays: number;
  /** The site tasks, as the proposal's stage cards read them (lib/programmeStages). */
  sitePhases: { id: string; phaseName: string; startDay: number; durationDays: number }[];
}

export function summariseProgramme(
  schedule: ProjectSchedule,
  source: ProgrammeSummary['source'],
  projectContext?: ProjectContext,
  todayISO?: string,
): ProgrammeSummary {
  const result = computeSchedule(schedule, todayISO);
  const cal = schedule.calendar || DEFAULT_CALENDAR;
  const startDay = result.startISO ? toDayNum(result.startISO) : null;
  const gate = result.tasks.find(isDesignGateTask);
  const finishDay = result.tasks.length ? Math.max(...result.tasks.map(t => t.plannedEndDay)) : null;
  const designOnly = engagementOf(projectContext) === 'design_only';
  const designEnds = result.tasks.filter(t => t.kind === 'design').map(t => t.plannedEndDay);
  const designEnd = designEnds.length ? Math.max(...designEnds) : null;
  const totalDays = programmeSpanDays(result);
  const designDays = startDay !== null && designEnd !== null ? designEnd - startDay + 1 : 0;
  return {
    source,
    startISO: result.startISO,
    designGateISO: gate ? toISO(gate.plannedEndDay) : null,
    finishISO: finishDay !== null ? toISO(finishDay) : null,
    designWorkDays: startDay !== null && designEnd !== null ? workingDaysBetween(cal, startDay, designEnd) : 0,
    siteWorkDays: !designOnly && designEnd !== null && finishDay !== null
      ? workingDaysBetween(cal, designEnd + 1, finishDay)
      : 0,
    totalDays,
    designDays,
    siteDays: designOnly ? 0 : Math.max(0, totalDays - designDays),
    sitePhases: designOnly || startDay === null ? [] : result.tasks
      .filter(t => t.kind === 'execution')
      .sort((a, b) => a.plannedStartDay - b.plannedStartDay)
      .map(t => ({ id: t.id, phaseName: t.title, startDay: t.plannedStartDay - startDay, durationDays: t.workDays })),
  };
}

export interface ProgrammePreview extends ProgrammeSummary {
  sizing: SiteSizing;
}

/*
  What the Timeline will show once it is generated, before it is.

  The empty Timeline promised "~63 days" by adding up the process template's
  step durations, three of which are site steps the builder replaces with the
  BOQ's trades. The chart then showed 128. This runs the real pipeline --
  template phases, buildScheduleFromProject, computeSchedule -- so the promise
  and the chart cannot disagree.
*/
export function previewTemplateProgramme(
  projectContext: ProjectContext | undefined,
  boq: FullBoqItem[],
  kickoffISO: string,
  steps: TemplateStep[],
  todayISO?: string,
  renovation?: RenovationRules,
): ProgrammePreview {
  const designSteps = templatePhases(kickoffISO, steps);
  const schedule = buildScheduleFromProject(projectContext, boq, { designSteps, renovation });
  return {
    ...summariseProgramme(schedule, 'estimate', projectContext, todayISO),
    sizing: estimateSiteWorkDays(projectContext, boq, renovation),
  };
}

/*
  A saved schedule with its design tasks brought up to date from the design
  phases -- the same sync the Timeline runs when it opens (TimelineTab), so a
  schedule saved before the design dates last moved reads as the chart will.
*/
export function withDesignPhases(
  schedule: ProjectSchedule,
  phases: { stepNumber: number; startDate?: string; durationDays?: number }[] = [],
): ProjectSchedule {
  if (!phases.length) return schedule;
  let changed = false;
  const tasks = schedule.tasks.map(t => {
    if (t.kind !== 'design') return t;
    const phase = phases.find(p => p.stepNumber === parseInt(t.id.replace('design-', ''), 10));
    if (!phase) return t;
    const workDays = Math.max(1, phase.durationDays || 5);
    const notBeforeISO = phase.startDate?.slice(0, 10);
    if (t.workDays === workDays && t.notBeforeISO === notBeforeISO) return t;
    changed = true;
    return { ...t, workDays, notBeforeISO };
  });
  return changed ? { ...schedule, tasks } : schedule;
}

/*
  The project's programme, whichever stage the Timeline is at -- the one figure
  the proposal and the Execution Agreement state.

  The same order the Timeline itself uses: the studio's saved schedule first,
  then the schedule derived from generated phases, and before anything has been
  generated, exactly what "Generate" would produce. The proposal used to carry
  its own guesses (14 design days, 45-90 by BHK) and the agreement a flat 60,
  none of which matched the chart.
*/
export function resolveProjectProgramme(input: {
  projectContext: ProjectContext | undefined;
  boq: FullBoqItem[];
  saved?: ProjectSchedule | null;
  phases?: { stepNumber: number; title: string; startDate?: string; endDate?: string; durationDays?: number }[];
  steps?: TemplateStep[];
  kickoffISO?: string;
  todayISO?: string;
  /** The studio's renovation rules (Terms & Payment); missing, the defaults. */
  renovation?: RenovationRules;
}): ProgrammeSummary {
  const { projectContext, boq, saved, phases = [], steps = [], todayISO, renovation } = input;
  const fromSaved = scheduleForEngagement(saved || null, projectContext);
  if (fromSaved && fromSaved.tasks?.length) {
    return summariseProgramme(withDesignPhases(fromSaved, phases), 'saved', projectContext, todayISO);
  }
  if (phases.length) {
    return summariseProgramme(
      buildScheduleFromProject(projectContext, boq, { designSteps: phases, renovation }), 'timeline', projectContext, todayISO,
    );
  }
  const kickoff = (input.kickoffISO || todayISO || toISO(Math.floor(Date.now() / 86400000))).slice(0, 10);
  const designSteps = steps.length ? templatePhases(kickoff, steps) : undefined;
  return summariseProgramme(
    buildScheduleFromProject(projectContext, boq, { designSteps, renovation }), 'estimate', projectContext, todayISO,
  );
}

// ---------------------------------------------------------------------------
// The programme in the proposal's five phases
// ---------------------------------------------------------------------------

/* The proposal's phases, in order, and which site stages each one covers. */
const PROPOSAL_PHASES: { phaseName: string; description: string; stages: string[] }[] = [
  {
    phaseName: 'Site Setup & Rough-ins',
    description: 'Site mobilization, surface protection laying, demolition/civil alterations, and plumbing/electrical cabling rough-ins.',
    stages: ['site-prelims', 'strip-out', 'civil-demolition', 'plumb-concealed', 'elec-conduit'],
  },
  {
    phaseName: 'Structure & Utilities',
    description: 'Flooring, false ceiling framing and boarding, wiring, and plywood carcass assembly.',
    stages: ['flooring-tiling', 'ceiling-framing', 'elec-wiring', 'ceiling-boarding', 'carp-carcass'],
  },
  {
    phaseName: 'Finishes & Surfaces',
    description: 'Wall putty, priming and first coats, laminates, shutters and hardware.',
    stages: ['paint-first', 'carp-shutters'],
  },
  {
    phaseName: 'Final Handover',
    description: 'Electrical fixture fits, sanitary fittings, final paint coat, deep cleaning, snag list closure, and handover.',
    stages: ['elec-final', 'plumb-fixtures', 'paint-final', 'other-works'],
  },
];

/**
 * The programme as the proposal's phase list (Design & Planning, then up to
 * four site phases), in calendar days laid end to end: day 1 is the start, and
 * the phases add up to `totalDays`, the Timeline's Total Duration.
 *
 * Every part of the proposal that quotes a duration -- the snapshot, the
 * booklet, the schedule section -- reads this list, so they all state the
 * Timeline's figure rather than guesses of their own. Stages the studio added
 * by hand join the phase of the stage before them.
 */
export function programmeAsProposalPhases(p: ProgrammeSummary): {
  phaseName: string; description: string; startDay: number; durationDays: number;
}[] {
  if (!p.totalDays) return [];
  const design = {
    phaseName: 'Design & Planning',
    description: 'Comprehensive 3D visualizations, material selection, layout signing, and Good-for-Construction (GFC) drawings creation.',
    startDay: 1,
    durationDays: Math.max(1, Math.min(p.designDays || p.totalDays, p.totalDays)),
  };
  if (!p.sitePhases.length || design.durationDays >= p.totalDays) return [{ ...design, durationDays: p.totalDays }];

  const phaseOf = (id: string): number | undefined => {
    const stage = id.replace(/^exec-/, '');
    const i = PROPOSAL_PHASES.findIndex(ph => ph.stages.includes(stage));
    return i >= 0 ? i : undefined;
  };
  // First day (1-based) each phase begins on; a phase never starts before the one ahead of it.
  const firstDay = new Map<number, number>();
  let current = 0;
  p.sitePhases.forEach(t => {
    current = Math.max(current, phaseOf(t.id) ?? current);
    const day = Math.max(design.durationDays + 1, t.startDay + 1);
    if (!firstDay.has(current) || day < firstDay.get(current)!) firstDay.set(current, day);
  });

  const order = [...firstDay.keys()].sort((a, b) => a - b);
  const starts = order.map(i => firstDay.get(i)!);
  starts[0] = design.durationDays + 1; // site work follows design without a gap
  for (let k = 1; k < starts.length; k++) starts[k] = Math.max(starts[k], starts[k - 1] + 1);

  const site = order
    .map((i, k) => ({
      phaseName: PROPOSAL_PHASES[i].phaseName,
      description: PROPOSAL_PHASES[i].description,
      startDay: starts[k],
      durationDays: (k + 1 < starts.length ? starts[k + 1] : p.totalDays + 1) - starts[k],
    }))
    .filter(ph => ph.durationDays > 0);
  return [design, ...site];
}
