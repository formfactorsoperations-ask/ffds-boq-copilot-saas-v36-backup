import {
  ProjectSchedule, ScheduleTask, ProjectContext, FullBoqItem, WorkCalendar,
} from '../types';
import { DEFAULT_CALENDAR, toISO, toDayNum, laneOrder } from './schedule';

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

/**
 * Working days for a trade, scaled by its share of the BOQ value.
 *
 * A rough first pass on purpose: the studio corrects these, and a wrong
 * duration that is visible and editable beats an invisible assumption.
 */
const durationFor = (share: number, totalWorkDays: number): number =>
  Math.max(3, Math.round(share * totalWorkDays));

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
  { id: 'civil-demolition', title: 'Civil & Demolition Works', trade: 'Civil & Demolition', share: 1.0, dependsOnStages: ['site-prelims'] },
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
  const totalWorkDays = opts.executionWorkDays ?? 75;   // ~15 weeks, mid of the studio's own range

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

  // If no design steps provided, use the studio's standard 5-step design process
  if (steps.length === 0) {
    steps = [
      { stepNumber: 1, title: 'Discovery & Statement of Function (SOF)', durationDays: 6 },
      { stepNumber: 2, title: '2D Spatial Layouts & Moodboards', durationDays: 8 },
      { stepNumber: 3, title: '3D Visualisations & Material Selections', durationDays: 10 },
      { stepNumber: 4, title: 'Good-For-Construction (GFC) Drawings', durationDays: 8 },
      { stepNumber: 5, title: 'BOQ Freeze & Design Sign-off', durationDays: 5 }
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

  // ---- Execution lane, from the templates hoisted above -------------------
  const activeTemplates = byTrade.size > 0
    ? EXECUTION_TEMPLATES.filter(t => byTrade.has(t.trade))
    : EXECUTION_TEMPLATES.filter(t => t.trade !== 'Other works');
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

  activeTemplates.forEach(template => {
    const tradeValue = byTrade.get(template.trade) || 0;
    const share = totalValue > 0 ? tradeValue / totalValue : 1 / Math.max(1, ordered.length);
    const totalTradeDuration = durationFor(share, totalWorkDays);
    const stageDuration = Math.max(2, Math.round(template.share * totalTradeDuration));

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
