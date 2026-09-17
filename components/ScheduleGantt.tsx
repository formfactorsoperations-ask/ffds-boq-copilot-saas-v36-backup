import React, { useMemo, useState } from 'react';
import MilestoneIcon from './MilestoneIcon';
import { newSequenceWarnings, SequenceWarning } from '../lib/scheduleBuilder';
import { ProjectSchedule, ScheduleGate, ScheduleHold, ProjectContext } from '../types';
import WavyText from './ui/WavyText';
import { StepDeliverableChecklist } from './studio/StepDeliverableChecklist';
import {
  computeSchedule, varianceReport, daysLostByReason, ineffectiveHolds, holdImpact,
  freezeBaseline, setTaskProgress, reorderTaskInLane, toDayNum, toISO, isWorkingDay, weekdayOf, GATE_LABEL,
  workingDaysBetween, DEFAULT_CALENDAR,
  type ResolvedTask,
} from '../lib/schedule';
import { markersByDay, MARKER_LABEL } from '../lib/scheduleMarkers';
import {
  Calendar, Pin, PauseCircle, AlertTriangle, Zap, Lock, Check, Circle, Play, Users, FileText, Printer, X, RefreshCw,
  Plus, Trash2, Clock, ShieldAlert, Pencil, ArrowUp, ArrowDown, HelpCircle, Info, ListChecks,
} from 'lucide-react';

// ============================================================================
// ScheduleGantt — the whole lifecycle as one dependency graph.
//
// Reads everything from lib/schedule; this file only draws. Durations are
// working days, so bar widths come from the calendar rather than from
// end-minus-start.
// ============================================================================

export const HOLD_REASONS = [
  'Payment overdue', 'Client decision pending', 'Society / building restriction',
  'Public or labour holiday', 'Material not delivered', 'Vendor unavailable',
  'Site access denied', 'Force majeure', 'Rework / snagging', 'Scope change under discussion',
];

type Zoom = 'day' | 'week' | 'month';
const PX: Record<Zoom, number> = { day: 24, week: 7, month: 2.8 };

const KIND_COLOR: Record<string, string> = {
  design: '#4338ca', procurement: '#0284c7', execution: '#059669', milestone: '#141235',
};
const STATUS_COLOR: Record<string, string> = {
  completed: '#4338ca', in_progress: '#059669', blocked: '#e11d48', pending: '#94a3b8',
};

/*
  Where each stage stands, in a word.

  The row carried a 1.5px coloured dot, which is a legend you have to remember
  rather than a label you can read. Anyone scanning thirteen rows for "what is
  actually finished" was reading the bars and guessing.
*/
const STATUS_TAG: Record<string, { label: string; className: string }> = {
  completed:   { label: 'Done',        className: 'bg-indigo-50 text-indigo-700 border-indigo-200/60' },
  in_progress: { label: 'Running',     className: 'bg-emerald-50 text-emerald-700 border-emerald-200/60' },
  blocked:     { label: 'Blocked',     className: 'bg-rose-50 text-rose-700 border-rose-200/60' },
  pending:     { label: 'Not started', className: 'bg-slate-100 text-slate-500 border-slate-200/60' },
};

const TAG_BASE = 'text-[8px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider shrink-0';

/**
 * "in 9 working days", "today", "4 working days late".
 *
 * A milestone's whole meaning is when it happens, and a date alone makes the
 * reader do the arithmetic against a calendar they cannot see. The count is in
 * working days because that is what the schedule runs on — a Friday deadline
 * three days out is not three days of work away if two of them are a weekend.
 */
function untilLabel(days: number): string {
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} working day${days === 1 ? '' : 's'}`;
  return `${-days} working day${days === -1 ? '' : 's'} late`;
}

/** "12 Aug" — short enough to sit beside a bar without becoming the bar. */
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * The status tag, plus the overrun that the schedule has already absorbed.
 *
 * `driftDays` is the working days a task's forecast moved purely because it is
 * unfinished and time has passed — the days the studio used to have to notice
 * and type in by hand. Saying it out loud is the point: the bar quietly getting
 * longer is easy to miss, and it is what pushes everything downstream.
 */
function StatusTags({ task }: { task: ResolvedTask }) {
  /*
    Nothing is said about work that has not started.

    Every row began life as a "Not started" chip, so the column filled with the
    least interesting fact on the screen and truncated the titles to make room
    for it. The dot at the head of the row already carries it, and a reader
    scanning for what is finished or late is not scanning for what has not begun.
  */
  const tag = task.status === 'pending' ? null : (STATUS_TAG[task.status] || null);
  return (
    <>
      {tag && <span className={`${TAG_BASE} ${tag.className}`}>{tag.label}</span>}
      {task.overrunning && (
        <span
          className={`${TAG_BASE} bg-amber-100 text-amber-900 border-amber-300/70`}
          title={`Still open ${task.driftDays} working day${task.driftDays === 1 ? '' : 's'} past its planned end. Everything that depends on it has moved with it.`}
        >
          +{task.driftDays}d over
        </span>
      )}
      {task.overdueToStart && !task.overrunning && (
        <span
          className={`${TAG_BASE} bg-amber-50 text-amber-800 border-amber-200/70`}
          title={`Should have started ${task.driftDays} working day${task.driftDays === 1 ? '' : 's'} ago; forecast from today.`}
        >
          Late start
        </span>
      )}
    </>
  );
}

interface Props {
  schedule: ProjectSchedule;
  onChange?: (next: ProjectSchedule) => void;
  onReset?: () => void;
  readOnly?: boolean;
  projectContext?: ProjectContext;
  phases?: any[];
  projectId?: string;
  onUpdateDeliverable?: (stepNumber: number, deliverableId: string, updates: any) => void;
  onUpdateSignoff?: (stepNumber: number, clientSignoffReceived: boolean) => void;
  onCompleteStep?: (stepNumber: number) => void;
}

export default function ScheduleGantt({
  schedule,
  onChange,
  onReset,
  readOnly = false,
  projectContext,
  phases,
  projectId,
  onUpdateDeliverable,
  onUpdateSignoff,
  onCompleteStep,
}: Props) {
  const [zoom, setZoom] = useState<Zoom>('week');
  const [showBaseline, setShowBaseline] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /*
    Dragging a row is the Predecessor dropdown, done faster.

    The rows are a dependency graph rather than a list, so a drag only means
    something once it is translated into predecessors — which is exactly what
    the detail panel already edits, one task at a time. Here it is the same edit
    applied to a whole lane: pull the task out of the chain and splice it back
    in where it was dropped.
  */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  /*
    Which edge of the target row the drop lands on.

    'before' alone could not express every move: a task could never be sent to
    the end of its lane, and "put GFC after the last drawing but before the
    gate" — the move this exists for — had nowhere to land, because everything
    between them belongs to another lane and refuses the drop.
  */
  const [dropPos, setDropPos] = useState<'before' | 'after'>('before');

  const canDrag = (t: ResolvedTask) => !readOnly && !!onChange && t.kind !== 'milestone';


  /*
    A move the building does not allow gets a question, not a refusal.

    Nothing physical stops final paint being dragged above the carpentry it is
    painting, and the chart will draw it happily. But a studio that wants second
    fix before the ceiling boards — because the boards are late and the
    electrician is on site today — knows something the template does not, so
    this asks and then does as it is told.

    The move is held in state rather than applied: `pendingMove.tasks` is the
    schedule they get if they confirm.
  */
  const [pendingMove, setPendingMove] = useState<
    { tasks: any[]; warnings: SequenceWarning[]; title: string } | null
  >(null);

  const handleDrop = (targetId: string) => {
    const source = dragId;
    const position = dropPos;
    setDragId(null);
    setDropTargetId(null);
    if (!source || !onChange) return;

    const base = schedule.tasks?.length ? schedule.tasks : result.tasks;
    const next = reorderTaskInLane(base as any, source, targetId, position);
    // Identity means the move was refused — across lanes, or onto a milestone.
    if (next === base) return;

    const warnings = newSequenceWarnings(base as any, next);
    if (warnings.length) {
      setPendingMove({
        tasks: next,
        warnings,
        title: base.find(t => t.id === source)?.title || 'This stage',
      });
      return;
    }
    onChange({ ...schedule, tasks: next as any });
  };

  const confirmMove = () => {
    if (pendingMove && onChange) onChange({ ...schedule, tasks: pendingMove.tasks as any });
    setPendingMove(null);
  };
  const [holdOpen, setHoldOpen] = useState<null | 'site' | 'trade'>(null);
  const [markerDay, setMarkerDay] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [blockedAlert, setBlockedAlert] = useState<string[] | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  const result = useMemo(() => computeSchedule(schedule), [schedule]);

  const totalProjectDays = useMemo(() => {
    if (!result.startISO || !result.finishISO) return 0;
    const start = new Date(result.startISO).getTime();
    const finish = new Date(result.finishISO).getTime();
    return Math.ceil((finish - start) / (1000 * 60 * 60 * 24)) + 1;
  }, [result.startISO, result.finishISO]);

  const byDay = useMemo(() => markersByDay(schedule.markers || []), [schedule.markers]);
  const variance = useMemo(() => varianceReport(result), [result]);
  const lost = useMemo(() => daysLostByReason(schedule.holds || [], result), [schedule.holds, result]);
  const idle = useMemo(() => ineffectiveHolds(schedule.holds || [], result), [schedule.holds, result]);
  const trades = useMemo(
    () => [...new Set((schedule.tasks || []).map(t => t.trade).filter(Boolean))] as string[],
    [schedule.tasks],
  );

  const todayDayNum = useMemo(() => toDayNum(new Date().toISOString().slice(0, 10)), []);
  /*
    The next milestone still ahead of today. One flag flies faster so the eye
    lands on the thing that is actually coming, rather than on whichever
    milestone happens to sit highest.
  */
  const nextMilestoneId = useMemo(() => {
    const ahead = result.tasks
      .filter(t => t.kind === 'milestone' && t.startDay >= todayDayNum
        && t.status !== 'completed' && !t.actualEndISO)
      .sort((a, b) => a.startDay - b.startDay);
    return ahead.length ? ahead[0].id : null;
  }, [result.tasks, todayDayNum]);

  const span = useMemo(() => {
    if (!result.tasks.length) return { from: 0, to: 0, days: 0 };
    const from = Math.min(...result.tasks.map(t => t.startDay), todayDayNum) - 3;
    const to = Math.max(
      ...result.tasks.map(t => t.endDay),
      schedule.targetHandoverISO ? toDayNum(schedule.targetHandoverISO) : 0,
      todayDayNum
    ) + 5;
    return { from, to, days: to - from };
  }, [result.tasks, schedule.targetHandoverISO, todayDayNum]);

  const px = (days: number) => days * PX[zoom];
  const left = (day: number) => px(day - span.from);
  const selected = result.tasks.find(t => t.id === selectedId) || null;

  const selectedDesignStepNum = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === 'design' || selected.id.startsWith('design')) {
      const match = selected.id.match(/\d+/);
      return match ? parseInt(match[0], 10) : null;
    }
    return null;
  }, [selected]);

  const selectedPhase = useMemo(() => {
    if (!selectedDesignStepNum || !phases) return null;
    return phases.find((p: any) => p.stepNumber === selectedDesignStepNum) || null;
  }, [selectedDesignStepNum, phases]);

  const handleUpdateStartDate = (val: string) => {
    if (!onChange) return;
    onChange({
      ...schedule,
      projectStartISO: val || undefined
    });
  };

  const handleUpdateHandoverDate = (val: string) => {
    if (!onChange) return;
    onChange({
      ...schedule,
      targetHandoverISO: val || undefined
    });
  };

  const commitHold = (hold: ScheduleHold) => {
    if (!onChange) return;
    const impact = holdImpact(schedule, hold);
    onChange({ ...schedule, holds: [...(schedule.holds || []), hold] });
    setHoldOpen(null);
    if (impact.pinnedBlocked.length) {
      setBlockedAlert(impact.pinnedBlocked);
    }
  };

  const handleLiftHold = (holdId: string) => {
    if (!onChange || !schedule.holds) return;
    onChange({
      ...schedule,
      holds: schedule.holds.map(h => h.id === holdId ? { ...h, liftedAt: Date.now() } : h)
    });
  };

  if (!result.tasks.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-12 text-center">
        <Calendar className="w-7 h-7 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-900">No schedule yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Generate one from the BOQ, or add design steps to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 5-column KPI Headline */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-left">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Schedule Start</p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {result.startISO ? new Date(result.startISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Configured start anchor</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Projected Finish</p>
            <p className="text-lg font-bold mt-1" style={{
              color: (result.overrunWorkDays ?? 0) > 0 ? '#e11d48' : '#059669',
            }}>
              {result.finishISO ? new Date(result.finishISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Estimated end date</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Total Duration</p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {totalProjectDays ? `${totalProjectDays} days` : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Total project timeline</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Target Handover</p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {schedule.targetHandoverISO ? new Date(schedule.targetHandoverISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not configured'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Deadline target</p>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Status Variance</p>
            {result.overrunWorkDays != null ? (
              <>
                <p className="text-lg font-bold mt-1" style={{
                  color: result.overrunWorkDays > 0 ? '#e11d48' : '#059669',
                }}>
                  {result.overrunWorkDays > 0 ? `+${result.overrunWorkDays}d Slip` : `${Math.abs(result.overrunWorkDays)}d Buffer`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">
                  {result.overrunWorkDays > 0 ? 'Projected overrun' : 'Ahead of target'}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-slate-400 mt-1">—</p>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">Configure target to calculate</p>
              </>
            )}
          </div>
        </div>
        {result.cycles.length > 0 && (
          <p className="mt-3 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            Circular dependency between {result.cycles.length} tasks — they are shown at the project start
            until the loop is broken.
          </p>
        )}
        {result.compressionInfo?.isCompressed && (
          <div className="mt-3 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs leading-relaxed space-y-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>Target Handover Limit Met & Timeline Optimized</span>
            </div>
            <p>
              The standard project timeline projected a finish date of{' '}
              <strong className="text-amber-950 font-bold">
                {new Date(result.compressionInfo.originalFinishISO).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </strong>
              , which would exceed the Target Handover deadline of{' '}
              <strong className="text-amber-950 font-bold">
                {new Date(schedule.targetHandoverISO!).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </strong>{' '}
              by <strong className="text-amber-950 font-bold">{result.compressionInfo.shortfallDays} working days</strong>.
            </p>
            <p>
              To fit the target deadline, the scheduling engine has automatically optimized trade durations by{' '}
              <strong className="text-amber-950 font-bold">
                {Math.round((1 - result.compressionInfo.compressionFactor) * 100)}%
              </strong>
              .
            </p>
            <div className="pt-2 border-t border-amber-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] uppercase font-bold tracking-wider text-amber-800">
              <div>
                Available Working Days: <span className="text-amber-950 font-extrabold">{result.compressionInfo.availableWorkingDays}d</span>
              </div>
              <div>
                Required Working Days: <span className="text-amber-950 font-extrabold">{result.compressionInfo.requiredWorkingDays}d</span>
              </div>
              <div>
                Sundays (Sunday Offs): <span className="text-amber-950 font-extrabold">{result.compressionInfo.sundaysCount}d</span>
              </div>
              <div>
                Public Holidays: <span className="text-amber-950 font-extrabold">{result.compressionInfo.holidaysCount}d</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Date Configuration Form Controls */}
      {!readOnly && onChange && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl bg-white border border-slate-200 p-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Configure Project Start Date
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={schedule.projectStartISO || result.startISO || ""}
                onChange={e => handleUpdateStartDate(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-300 font-medium bg-slate-50"
              />
              <span className="text-[11px] text-slate-400">
                Anchors all independent tasks
              </span>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Configure Target Handover Date
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={schedule.targetHandoverISO || ""}
                onChange={e => handleUpdateHandoverDate(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-300 font-medium bg-slate-50"
              />
              <span className="text-[11px] text-slate-400">
                Used to compute overrun/variance
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {(['day', 'week', 'month'] as Zoom[]).map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
                zoom === z ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              {z}
            </button>
          ))}
        </div>
        <button onClick={() => setShowBaseline(s => !s)}
          className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
            showBaseline ? 'border-sky-200 text-[#334486] bg-sky-50' : 'border-slate-200 text-slate-500 bg-white'}`}>
          ▤ Baseline
        </button>
        <button onClick={() => setShowLegend(s => !s)}
          className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors flex items-center gap-1.5 ${
            showLegend ? 'border-sky-300 text-sky-800 bg-sky-50 shadow-xs' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`}>
          <HelpCircle className="w-3.5 h-3.5 text-sky-600" />
          <span>Legend &amp; Guide</span>
        </button>
        {!readOnly && onChange && (
          <>
            <button onClick={() => setShowAddModal(true)}
              className="px-3 py-2 rounded-xl text-[11px] font-bold border border-slate-200 text-slate-900 bg-white hover:bg-slate-50 transition-colors flex items-center gap-1 shadow-sm">
              <Plus className="w-3.5 h-3.5 text-amber-600" />Add stage
            </button>
            <button onClick={() => setHoldOpen('site')}
              className="px-3 py-2 rounded-xl text-[11px] font-bold border border-rose-200 text-rose-700 bg-rose-50/60">
              <PauseCircle className="w-3.5 h-3.5 inline mr-1" />Pause site
            </button>
            <button onClick={() => setHoldOpen('trade')}
              className="px-3 py-2 rounded-xl text-[11px] font-bold border border-slate-200 text-slate-600 bg-white">
              <PauseCircle className="w-3.5 h-3.5 inline mr-1" />Hold trade
            </button>
            {!schedule.baselineAt && (
              <button onClick={() => onChange(freezeBaseline(schedule))}
                className="px-3 py-2 rounded-xl text-[11px] font-bold border border-sky-200 text-[#334486] bg-white">
                <Lock className="w-3.5 h-3.5 inline mr-1" />Freeze baseline
              </button>
            )}
            {onReset && (
              <button onClick={onReset}
                className="px-3 py-2 rounded-xl text-[11px] font-bold border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100/80 transition-colors flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" />Reset schedule
              </button>
            )}
          </>
        )}
        <span className="text-[11px] text-slate-400 ml-auto">
          {zoom === 'day' ? 'Grey columns are non-working days' : 'Zoom to Day to see individual dates'}
        </span>
      </div>

      {/* Visual Legend & Guide */}
      {showLegend && (
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50/80 via-white to-amber-50/60 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Timeline Legend &amp; Visual Guide</h4>
                <p className="text-[10px] text-slate-500">Understanding stages, status indicators, event logs, and timeline markers</p>
              </div>
            </div>
            <button onClick={() => setShowLegend(false)} className="text-[11px] font-bold text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Category / Lanes */}
            <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/60 space-y-1.5 shadow-2xs">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Stage Lanes</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/60 font-bold uppercase">Design</span>
                <span className="text-[11px] text-slate-600">Concept to Design Freeze</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200/60 font-bold uppercase">Execution</span>
                <span className="text-[11px] text-slate-600">Site trades &amp; installation</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200/60 font-bold uppercase">Procurement</span>
                <span className="text-[11px] text-slate-600">Materials &amp; factory orders</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-slate-900 rotate-45 shrink-0 inline-block ml-1" />
                <span className="text-[11px] text-slate-600 ml-1">Milestone / Stage Gate (0d)</span>
              </div>
            </div>

            {/* Status Icons */}
            <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/60 space-y-1.5 shadow-2xs">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Indicators</p>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] text-slate-600"><strong>Critical Path</strong> (drives handover)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[11px] text-slate-600"><strong>Pinned Date</strong> (fixed constraint)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <PauseCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="text-[11px] text-slate-600"><strong>On Hold</strong> (active trade/site pause)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-xs border border-dashed border-slate-400 inline-block shrink-0" />
                <span className="text-[11px] text-slate-600"><strong>Baseline</strong> (contractual plan)</span>
              </div>
            </div>

            {/* Site Visits & MoMs */}
            <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/60 space-y-1.5 shadow-2xs">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Site Logs &amp; Events</p>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] text-slate-600"><strong>MoM Log</strong> (meeting decisions)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[11px] text-slate-600"><strong>Client Meeting</strong> (discussions)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
                <span className="text-[11px] text-slate-600"><strong>Site Inspection</strong> (engineer visit)</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 italic">Click any event marker to view logged minutes.</p>
            </div>

            {/* Timeline Guides */}
            <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/60 space-y-1.5 shadow-2xs">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Timeline Guides</p>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded-full text-[8px] font-bold bg-amber-500 text-white">TODAY</span>
                <span className="text-[11px] text-slate-600">Current calendar date anchor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-white text-rose-600 border border-rose-300">TARGET</span>
                <span className="text-[11px] text-slate-600">Configured target handover date</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 bg-slate-100 border border-slate-200 inline-block" />
                <span className="text-[11px] text-slate-600">Non-working days (Sundays)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex">
          <div className="w-64 lg:w-80 shrink-0 border-r border-slate-200">
            {byDay.size > 0 && (
              <div className="h-8 border-b border-slate-200 bg-slate-50/90 px-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Users className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 truncate">
                    Site Logs &amp; Events
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0" title="Green: MoM • Amber: Client Meeting • Blue: Site Inspection">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="MoM Minutes" />
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" title="Client Meeting" />
                  <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" title="Site Inspection" />
                </div>
              </div>
            )}
            <div className="h-9 border-b border-slate-200 bg-slate-50 px-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700">Stages &amp; Trades</span>
                <span className="text-[9px] font-bold text-slate-500 font-mono bg-slate-200/60 px-1.5 py-0.5 rounded">
                  {result.tasks.length}
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setShowLegend(s => !s)}
                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border transition-all ${
                  showLegend ? 'bg-sky-100 text-sky-800 border-sky-300' : 'text-slate-500 bg-white border-slate-200 hover:border-slate-300 hover:text-slate-800'
                }`}
                title="Toggle visual legend & guide"
              >
                <HelpCircle className="w-3 h-3 text-sky-600" />
                <span>Legend</span>
              </button>
            </div>
            {result.tasks.map((t, idx) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                draggable={canDrag(t)}
                onDragStart={e => {
                  if (!canDrag(t)) return;
                  setDragId(t.id);
                  e.dataTransfer.effectAllowed = 'move';
                  // Firefox will not start a drag without payload.
                  e.dataTransfer.setData('text/plain', t.id);
                }}
                onDragEnd={() => { setDragId(null); setDropTargetId(null); }}
                onDragOver={e => {
                  const from = dragId && result.tasks.find(x => x.id === dragId);
                  // Only show a drop line where the drop would actually be taken.
                  if (!from || from.id === t.id || from.kind !== t.kind || t.kind === 'milestone') return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  // Top half drops above the row, bottom half below it.
                  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const pos = e.clientY - box.top < box.height / 2 ? 'before' : 'after';
                  if (dropTargetId !== t.id) setDropTargetId(t.id);
                  if (dropPos !== pos) setDropPos(pos);
                }}
                onDragLeave={() => { if (dropTargetId === t.id) setDropTargetId(null); }}
                onDrop={e => { e.preventDefault(); handleDrop(t.id); }}
                title={canDrag(t) ? 'Drag to re-sequence within its lane' : undefined}
                className={`w-full h-9 px-3 flex items-center gap-2 border-b text-left text-xs transition-colors group ${
                  dropTargetId === t.id
                    ? (dropPos === 'before'
                        ? 'border-t-2 border-t-sky-500 border-b-slate-100'
                        : 'border-b-2 border-b-sky-500 border-t-transparent')
                    : 'border-slate-100'
                } ${dragId === t.id ? 'opacity-40' : ''} ${
                  canDrag(t) ? 'cursor-grab active:cursor-grabbing' : ''
                } ${selectedId === t.id ? 'bg-sky-50 font-semibold' : 'hover:bg-slate-50'}`}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: STATUS_COLOR[t.status] || '#94a3b8' }} />
                {t.kind === 'design' || t.id === 'ms-design-gate' ? (
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/40 font-bold uppercase tracking-wider shrink-0">
                    Design
                  </span>
                ) : (
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200/40 font-bold uppercase tracking-wider shrink-0">
                    Execution
                  </span>
                )}
                <span className="flex-1 truncate text-slate-800">{t.title}</span>
                <StatusTags task={t} />
                {t.pinned && <Pin className="w-3 h-3 text-slate-400 shrink-0" />}
                {t.onCriticalPath && <Zap className="w-3 h-3 text-amber-500 shrink-0" />}
                {!!t.heldBy.length && <PauseCircle className="w-3 h-3 text-rose-500 shrink-0" />}
                {!readOnly && (
                  <Pencil className="w-3 h-3 text-slate-300 group-hover:text-slate-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-x-auto">
            <div style={{ width: px(span.days), position: 'relative' }}>
              {/* Meetings and site visits — a record of who was there and when,
                  which is usually why a bar moved. */}
              {byDay.size > 0 && (
                <div className="h-8 border-b border-slate-200 bg-slate-50/40 relative">
                  {[...byDay.entries()].map(([iso, group]) => {
                    const d = toDayNum(iso);
                    if (d < span.from || d > span.to) return null;
                    const lead = group[0];
                    return (
                      <button
                        key={iso}
                        onClick={() => setMarkerDay(markerDay === iso ? null : iso)}
                        title={group.map(g => `${MARKER_LABEL[g.kind]}: ${g.title}`).join('\n')}
                        className="absolute top-1.5 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white border border-slate-200 shadow-xs hover:border-sky-300 hover:shadow-sm transition-all group z-10"
                        style={{ left: left(d) + px(0.5) }}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full grid place-items-center text-[8px] font-black text-white shrink-0 ${
                          lead.kind === 'mom' ? 'bg-emerald-500'
                            : lead.kind === 'client_meeting' ? 'bg-amber-500' : 'bg-sky-500'}`}>
                          {group.length > 1 ? group.length : <Users className="w-2 h-2" />}
                        </span>
                        <span className="text-[9px] font-bold text-slate-600 group-hover:text-slate-900 hidden sm:inline whitespace-nowrap">
                          {group.length > 1 ? `${group.length} logs` : (MARKER_LABEL[lead.kind] || 'Event')}
                        </span>
                      </button>
                    );
                  })}
                  <span className="absolute right-3 top-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Site Logs &amp; MoMs
                  </span>
                </div>
              )}

              {/* Header */}
              <div className="h-9 border-b border-slate-200 bg-slate-50 relative">
                {zoom === 'day'
                  ? Array.from({ length: span.days }, (_, i) => {
                      const d = span.from + i;
                      const off = !isWorkingDay(schedule.calendar, d);
                      return (
                        <div key={i} className="absolute top-0 bottom-0 text-[8px] text-center"
                          style={{ left: px(i), width: px(1), background: off ? '#f1f3f8' : undefined }}>
                          <div className="text-slate-400 pt-1">{'MTWTFSS'[weekdayOf(d)]}</div>
                          <div className="text-slate-600 font-bold">{new Date(toISO(d)).getUTCDate()}</div>
                        </div>
                      );
                    })
                  : monthTicks(span.from, span.days).map(m => (
                      <div key={m.day} className="absolute top-0 bottom-0 px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-r border-slate-200"
                        style={{ left: px(m.day - span.from) }}>{m.label}</div>
                    ))}
              </div>

              {/* Rows */}
              {result.tasks.map((t, rowIndex) => (
                <div key={t.id} className="gt-row h-9 border-b border-slate-100 relative">
                  {zoom === 'day' && Array.from({ length: span.days }, (_, i) => {
                    const d = span.from + i;
                    return isWorkingDay(schedule.calendar, d) ? null : (
                      <div key={i} className="absolute top-0 bottom-0 bg-slate-100/70"
                        style={{ left: px(i), width: px(1) }} />
                    );
                  })}

                  {showBaseline && t.baselineStartISO && (
                    <div className="absolute top-1 h-7 rounded border border-dashed border-slate-300"
                      style={{ left: left(toDayNum(t.baselineStartISO)), width: Math.max(px(t.baselineWorkDays || t.workDays), 4) }} />
                  )}

                  {t.kind === 'milestone' ? (
                    /*
                      A milestone is a date, and it was the one thing on the
                      chart that would not tell you its date. Bars carry theirs
                      in a tooltip and open the detail panel when clicked; a
                      milestone was a plain div — no title, not selectable — so
                      the Design Gate could be read off the ruler by eye or not
                      at all.
                    */
                    (() => {
                      /*
                        Reached is not the same as late, and both were drawn the
                        same. A milestone the studio has signed off should stop
                        counting down — the countdown on a passed date reads as
                        an alarm about something that already happened.
                      */
                      const reached = t.status === 'completed' || !!t.actualEndISO;
                      const until = workingDaysBetween(
                        schedule.calendar || DEFAULT_CALENDAR, todayDayNum, t.startDay) - 1;
                      /*
                        Grey is behind us, green is ahead, rose is late — three
                        states readable without a legend. The green is kept
                        light: a programme with every milestone still to come
                        should not turn into a wall of saturated colour.
                      */
                      const tone = reached
                        ? { pole: '#94a3b8', ink: 'text-slate-400', name: 'text-slate-500' }
                        : t.overdueToStart
                          ? { pole: '#e11d48', ink: 'text-rose-600', name: 'text-rose-800' }
                          : { pole: '#22c55e', ink: 'text-green-700', name: 'text-green-900' };
                      return (
                        <button
                          onClick={() => setSelectedId(t.id)}
                          title={`${t.title} — ${new Date(t.startISO).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}${
                            reached ? ' · reached' : t.overdueToStart ? ` · ${t.driftDays} working days late` : ''
                          }${t.slipDays > 0 ? ` · moved ${t.slipDays} working days since the baseline was frozen` : ''}`}
                          className="gt-milestone-wrap absolute top-1.5 flex items-center gap-1.5 cursor-pointer group"
                          style={{ left: left(t.startDay) }}
                        >
                          <span
                            className={`ff-flag${nextMilestoneId === t.id ? ' ff-flag--next' : ''}`}
                            style={{ color: tone.pole }}
                          />
                          {/* The flag says a date lands here, which is true of
                              every row. The icon says which date. */}
                          <MilestoneIcon
                            label={t.milestoneLabel || t.title}
                            className={`w-3 h-3 shrink-0 ${tone.name}`}
                          />
                          <span className={`text-[9px] font-black whitespace-nowrap group-hover:underline ${tone.name}`}>
                            {t.title}
                          </span>
                          <span className={`text-[9px] font-semibold tabular-nums whitespace-nowrap ${tone.ink}`}>
                            {shortDate(t.startISO)} · {reached ? 'reached' : untilLabel(until)}
                          </span>
                          {/*
                            How far this date has walked away from the one the
                            studio froze. A milestone slipping is the single
                            number a programme review is actually about, and it
                            was only visible by opening the detail panel and
                            comparing two dates by eye.
                          */}
                          {!reached && t.slipDays > 0 && (
                            <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200/70 whitespace-nowrap">
                              +{t.slipDays}d vs baseline
                            </span>
                          )}
                        </button>
                      );
                    })()
                  ) : (
                    <button onClick={() => setSelectedId(t.id)}
                      title={`${t.title} (${t.workDays} working days: ${t.startISO} to ${t.endISO})`}
                      className={`gt-bar absolute top-2 h-5 rounded flex items-center justify-between px-1 text-[9px] font-bold text-white overflow-hidden gap-1${
                        t.onCriticalPath ? ' gt-bar--critical' : ''
                      }`}
                      style={{
                        left: left(t.startDay),
                        width: Math.max(px(t.endDay - t.startDay + 1), 6),
                        /* backgroundColor, not the `background` shorthand: the
                           shorthand resets background-image and would wipe out
                           the extrusion gradient .gt-bar paints on top. */
                        backgroundColor: t.openGates.length ? STATUS_COLOR.blocked : (KIND_COLOR[t.kind] || '#64748b'),
                      }}>
                      {px(t.endDay - t.startDay + 1) > 50 ? (
                        <>
                          <span className="truncate flex-1 text-left min-w-0">{t.title}</span>
                          <span className="shrink-0 font-extrabold text-[8px] bg-black/15 px-1 rounded-sm leading-tight">
                            {t.workDays}d
                          </span>
                        </>
                      ) : (
                        px(t.endDay - t.startDay + 1) > 20 ? (
                          <span className="w-full text-center shrink-0 text-[8px] font-extrabold">
                            {t.workDays}d
                          </span>
                        ) : null
                      )}
                    </button>
                  )}

                  {/* The dates, on the chart.

                      A Gantt that will not tell you when anything happens makes
                      you count gridlines. They sit after the bar rather than
                      inside it: the bar is already carrying a title and a day
                      count, and squeezing dates in there is what forces every
                      label to truncate. */}
                  {t.kind !== 'milestone' && (
                    <span
                      className="gt-dates ff-banner-wrap absolute top-[7px] pointer-events-none"
                      style={{
                        left: left(t.endDay + 1) + 6,
                        color: t.driftDays > 0 ? '#d97706' : (KIND_COLOR[t.kind] || '#94a3b8'),
                        /* Every banner starts at a different point in the cycle,
                           so the column reads as cloth in a breeze rather than
                           as one animation playing thirteen times in unison. */
                        ['--ff-delay' as string]: `-${(rowIndex * 370) % 5200}ms`,
                      } as React.CSSProperties}
                    >
                      <span className="ff-banner-pole" />
                      <span className={`ff-banner text-[8.5px] font-semibold tabular-nums whitespace-nowrap ${
                        t.driftDays > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {shortDate(t.startISO)} – {shortDate(t.endISO)}
                        {t.driftDays > 0 && <span className="font-black"> · +{t.driftDays}d</span>}
                      </span>
                    </span>
                  )}
                </div>
              ))}

              {/* Today line */}
              {todayDayNum >= span.from && todayDayNum <= span.to && (
                <div
                  className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center"
                  style={{ left: left(todayDayNum) + px(0.5), width: 0 }}
                >
                  <div 
                    className="sticky top-0 z-30 -translate-x-1/2 pointer-events-auto"
                    style={{ marginTop: byDay.size > 0 ? '33px' : '4px' }}
                  >
                    <span 
                      className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-md border border-amber-300/80 whitespace-nowrap flex items-center gap-1 cursor-default"
                      title={`Today: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Today
                    </span>
                  </div>
                  <div className="gt-today-line w-[2px] h-full bg-amber-500/90 border-r border-dashed border-amber-600/70" />
                </div>
              )}

              {/* Target line */}
              {schedule.targetHandoverISO && (
                <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-rose-500 z-10 pointer-events-none"
                  style={{ left: left(toDayNum(schedule.targetHandoverISO)) }}>
                  <span 
                    className="absolute left-1 text-[9px] font-bold text-rose-600 bg-white px-1.5 py-0.5 rounded border border-rose-200 whitespace-nowrap shadow-xs pointer-events-auto"
                    style={{ top: byDay.size > 0 ? '34px' : '4px' }}
                    title={`Target Handover: ${new Date(schedule.targetHandoverISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  >
                    Target
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">
            Where the days went — {variance.totalDays} total
          </p>
          {variance.rows.length === 0
            ? <p className="text-xs text-slate-400">Nothing lost against the baseline yet.</p>
            : variance.rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0 text-xs">
                <span className="font-bold tabular-nums text-rose-600 w-9 text-right">+{r.days}d</span>
                <span className="flex-1 truncate">{r.cause}</span>
                <span className="text-slate-400 truncate max-w-[40%]">{r.title}</span>
              </div>
            ))}
          <p className="text-[10px] text-slate-400 mt-2">
            Each hold is counted once. Delay a task inherited from its predecessor belongs to whoever
            caused it, not to the task that waited.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">
            {selected ? 'Selected' : 'Select a bar'}
          </p>
          {!selected ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">Click any task to see its gates, dependencies and dates.</p>
              
              {schedule.holds && schedule.holds.filter(h => !h.liftedAt).length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Active Site / Trade Holds</p>
                  <div className="space-y-2">
                    {schedule.holds.filter(h => !h.liftedAt).map((h) => (
                      <div key={h.id} className="p-3 rounded-xl bg-rose-50/50 border border-rose-100 flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                              {h.scope === 'site' ? 'Site Hold' : `Trade: ${h.target}`}
                            </span>
                            <p className="text-xs font-bold text-slate-800 mt-1">{h.reason}</p>
                            {h.note && <p className="text-[11px] text-slate-500 italic mt-0.5">"{h.note}"</p>}
                          </div>
                          <span className="text-xs font-bold text-rose-600 shrink-0">+{h.workDays}d</span>
                        </div>
                        {!readOnly && onChange && (
                          <button
                            onClick={() => handleLiftHold(h.id)}
                            className="w-full py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            🔓 Lift Hold & Resume Work
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5 text-xs">
              <p className="font-bold text-slate-900 text-sm">{selected.title}</p>
              <Row k="Runs" v={`${selected.startISO} → ${selected.endISO}`} />
              <Row k="Duration" v={`${selected.workDays} working days`} />
              {selected.trade && <Row k="Trade" v={selected.trade} />}
              {selected.orderByISO && <Row k="Order by" v={`${selected.orderByISO} · ${selected.leadTimeDays}d lead`} />}
              <Row k="Float" v={selected.onCriticalPath ? 'On the critical path' : `${selected.floatDays} working days`} />
              {selected.driftDays > 0 && (
                <Row
                  k={selected.overrunning ? 'Running over' : 'Late to start'}
                  v={`${selected.driftDays} working day${selected.driftDays === 1 ? '' : 's'} — forecast moved to today because this is not finished`}
                  tone="bad"
                />
              )}
              {selected.openGates.length > 0 && (
                <Row k="Blocked by" v={selected.openGates.map(g => GATE_LABEL[g as ScheduleGate]).join(', ')} tone="bad" />
              )}
              {selected.heldBy.map((h, i) => (
                <div key={i} className="flex flex-col gap-1 py-1.5 border-b border-slate-100 last:border-0">
                  <div className="flex gap-3 text-xs">
                    <span className="text-slate-400 w-24 shrink-0 font-bold uppercase text-[9px] mt-0.5">On hold</span>
                    <span className="flex-1 text-rose-600 font-semibold">{h.workDays}d — {h.reason}</span>
                  </div>
                  {!readOnly && onChange && (
                    <div className="pl-[108px]">
                      <button
                        onClick={() => handleLiftHold(h.holdId)}
                        className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-[9px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        🔓 Lift Hold / Resume
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {selected.pinConflict && <Row k="Pin conflict" v={selected.pinConflict} tone="bad" />}
              {selected.actualStartISO && (
                <Row k="Actually ran" v={`${selected.actualStartISO}${selected.actualEndISO ? ` → ${selected.actualEndISO}` : ' → in progress'}`} />
              )}

              {!readOnly && onChange && (
                <>
                  {/* Manual override. The site is the authority: once a task is
                      marked started or done it is anchored to those dates, and
                      holds and slipping predecessors stop moving it. */}
                  <div className="pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Progress</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {([
                        ['pending', 'Not started', Circle],
                        ['in_progress', 'Started', Play],
                        ['completed', 'Done', Check],
                      ] as const).map(([status, label, Icon]) => (
                        <button
                          key={status}
                          onClick={() => onChange(setTaskProgress(schedule, selected.id, status, { resolved: selected }))}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                            selected.status === status
                              ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white border-[#334486]'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-sky-200'}`}>
                          <Icon className="w-3 h-3 inline mr-1" />{label}
                        </button>
                      ))}
                    </div>
                    {selected.status === 'completed' && (
                      <p className="text-[10px] text-slate-400 mt-1.5">
                        Anchored to its real dates — holds and predecessors no longer move it.
                        Set back to Not started to hand it back to the schedule.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <button
                      onClick={() => onChange({
                        ...schedule,
                        tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, pinned: !t.pinned } : t),
                      })}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                        selected.pinned ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white border-[#334486]' : 'bg-white text-slate-600 border-slate-200'}`}
                    >
                      <Pin className="w-3 h-3 inline mr-1" />{selected.pinned ? 'Pinned' : 'Pin this date'}
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-100 mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Edit Stage Properties</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Move Stage Up"
                          disabled={schedule.tasks.findIndex(t => t.id === selected.id) <= 0}
                          onClick={() => {
                            const idx = schedule.tasks.findIndex(t => t.id === selected.id);
                            if (idx > 0) {
                              const updated = [...schedule.tasks];
                              const temp = updated[idx];
                              updated[idx] = updated[idx - 1];
                              updated[idx - 1] = temp;
                              onChange({ ...schedule, tasks: updated });
                            }
                          }}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="Move Stage Down"
                          disabled={schedule.tasks.findIndex(t => t.id === selected.id) >= schedule.tasks.length - 1}
                          onClick={() => {
                            const idx = schedule.tasks.findIndex(t => t.id === selected.id);
                            if (idx >= 0 && idx < schedule.tasks.length - 1) {
                              const updated = [...schedule.tasks];
                              const temp = updated[idx];
                              updated[idx] = updated[idx + 1];
                              updated[idx + 1] = temp;
                              onChange({ ...schedule, tasks: updated });
                            }
                          }}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Stage Name</label>
                      <input
                        type="text"
                        value={selected.title}
                        onChange={e => {
                          onChange({
                            ...schedule,
                            tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, title: e.target.value } : t)
                          });
                        }}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Phase / Category</label>
                      <div className="grid grid-cols-3 gap-1">
                        {(['design', 'execution', 'procurement'] as const).map(k => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              onChange({
                                ...schedule,
                                tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, kind: k } : t)
                              });
                            }}
                            className={`py-1 px-2 rounded-lg text-[10px] font-bold uppercase transition-colors border ${
                              selected.kind === k
                                ? 'bg-sky-50 text-[#334486] border-sky-300 shadow-xs'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-white'
                            }`}
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selected.kind !== 'milestone' && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Trade / Speciality</label>
                        <input
                          type="text"
                          placeholder="e.g. Carpentry, Civil, Electrical, Painting..."
                          value={selected.trade || ""}
                          onChange={e => {
                            onChange({
                              ...schedule,
                              tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, trade: e.target.value || undefined } : t)
                            });
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                        />
                      </div>
                    )}

                    {selected.kind !== 'milestone' && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Duration (Working Days)</label>
                        <input
                          type="number"
                          min={1}
                          value={selected.workDays}
                          onChange={e => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val > 0) {
                              onChange({
                                ...schedule,
                                tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, workDays: val } : t)
                              });
                            }
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Predecessor / Dependency</label>
                      <select
                        value={selected.dependencies?.[0] || ""}
                        onChange={e => {
                          const dep = e.target.value;
                          onChange({
                            ...schedule,
                            tasks: (schedule.tasks?.length ? schedule.tasks : result.tasks).map(t => t.id === selected.id ? { ...t, dependencies: dep ? [dep] : [] } : t)
                          });
                        }}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                      >
                        <option value="">No dependency (Starts with project start)</option>
                        {['design', 'execution', 'procurement', 'milestone'].map(groupKind => {
                          const groupTasks = (schedule.tasks?.length ? schedule.tasks : result.tasks).filter(
                            t => t.id !== selected.id && t.kind === groupKind
                          );
                          if (groupTasks.length === 0) return null;
                          return (
                            <optgroup key={groupKind} label={`${groupKind.toUpperCase()} STAGES`}>
                              {groupTasks.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.title} {t.trade ? `(${t.trade})` : ''} [{t.workDays}d]
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>

                    {selected.kind !== 'milestone' && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Earliest Start Date (Constraint)</label>
                        <input
                          type="date"
                          value={selected.notBeforeISO || ""}
                          onChange={e => {
                            const val = e.target.value;
                            onChange({
                              ...schedule,
                              tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, notBeforeISO: val || undefined } : t)
                            });
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">Forces this stage to start on or after this date.</span>
                      </div>
                    )}

                    {selected.pinned && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Pinned Start Date Override</label>
                        <input
                          type="date"
                          value={selected.baselineStartISO || selected.startISO || ""}
                          onChange={e => {
                            const val = e.target.value;
                            if (val) {
                              onChange({
                                ...schedule,
                                tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, baselineStartISO: val } : t)
                              });
                            }
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">Overrides predecessors to lock the start date exactly.</span>
                      </div>
                    )}

                    {selected.status === 'in_progress' && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Actual Start Date</label>
                        <input
                          type="date"
                          value={selected.actualStartISO || ""}
                          onChange={e => {
                            const val = e.target.value;
                            onChange({
                              ...schedule,
                              tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, actualStartISO: val || undefined } : t)
                            });
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                        />
                      </div>
                    )}

                    {selected.status === 'completed' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Actual Start</label>
                          <input
                            type="date"
                            value={selected.actualStartISO || ""}
                            onChange={e => {
                              const val = e.target.value;
                              onChange({
                                ...schedule,
                                tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, actualStartISO: val || undefined } : t)
                              });
                            }}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Actual Completion</label>
                          <input
                            type="date"
                            value={selected.actualEndISO || ""}
                            onChange={e => {
                              const val = e.target.value;
                              onChange({
                                ...schedule,
                                tasks: schedule.tasks.map(t => t.id === selected.id ? { ...t, actualEndISO: val || undefined } : t)
                              });
                            }}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:border-sky-300 font-medium"
                          />
                        </div>
                      </div>
                    )}

                    <div className="pt-2">
                      {deleteConfirmId === selected.id ? (
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-2 mt-2">
                          <p className="text-[11px] font-medium text-rose-800">
                            Are you sure you want to delete this stage? This cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                onChange({
                                  ...schedule,
                                  tasks: schedule.tasks.filter(t => t.id !== selected.id),
                                });
                                setSelectedId(null);
                                setDeleteConfirmId(null);
                              }}
                              className="flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors text-center cursor-pointer"
                            >
                              Yes, Delete
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors text-center cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setDeleteConfirmId(selected.id);
                          }}
                          className="w-full px-3 py-1.5 rounded-lg text-[11px] font-bold border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100/80 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete Stage
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Step Progress Checklist for Design Stages */}
              {selectedPhase && selectedPhase.stepProgress && onUpdateDeliverable && (
                <div className="pt-3 border-t border-slate-100 mt-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-slate-700" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Design Stage Deliverables &amp; Sign-off
                    </span>
                  </div>
                  <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-3">
                    <StepDeliverableChecklist
                      step={selectedPhase.stepProgress}
                      projectId={projectId || ''}
                      onUpdateDeliverable={onUpdateDeliverable}
                      onUpdateSignoff={onUpdateSignoff || (() => {})}
                      onCompleteStep={onCompleteStep || (() => {})}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* What happened on a day someone was on site */}
      {markerDay && byDay.get(markerDay) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              {new Date(markerDay).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <button onClick={() => setMarkerDay(null)} className="text-[11px] font-bold text-slate-400 hover:text-[#334486]">
              Close
            </button>
          </div>
          {byDay.get(markerDay)!.map(m => (
            <div key={m.id} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                m.kind === 'mom' ? 'bg-emerald-50 text-emerald-700'
                  : m.kind === 'client_meeting' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                {MARKER_LABEL[m.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900">{m.title}</p>
                {m.detail && <p className="text-[11px] text-slate-500">{m.detail}</p>}
              </div>
              {!!m.openActions && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">
                  {m.openActions} open
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Core Scheduling Engine & Hold Mechanics Illustration (Removed per user request) */}

      {holdOpen && (
        <HoldDialog scope={holdOpen} trades={trades} onCancel={() => setHoldOpen(null)} onApply={commitHold} />
      )}

      {showAddModal && (
        <AddStageDialog
          tasks={schedule.tasks?.length ? schedule.tasks : result.tasks}
          trades={trades}
          onCancel={() => setShowAddModal(false)}
          onApply={(newTask) => {
            const currentTasks = schedule.tasks?.length ? schedule.tasks : result.tasks;
            if (onChange) {
              onChange({
                ...schedule,
                tasks: [...currentTasks, newTask]
              });
            }
            setSelectedId(newTask.id);
            setShowAddModal(false);
          }}
        />
      )}

      {blockedAlert && (
        <div className="fixed inset-0 z-[220] bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm flex items-center justify-center p-5 no-print"
          onClick={() => setBlockedAlert(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" /> Pinned Stages Blocked
            </h3>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              The following stages are pinned to their current dates, so they were not moved by the active hold/pause:
            </p>
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 max-h-40 overflow-y-auto mb-4 space-y-1">
              {blockedAlert.map((name, i) => (
                <div key={i} className="text-xs text-rose-900 font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
                  {name}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
              These stages may now conflict with the preceding work. We recommend unpinning them or manually re-planning their dependencies.
            </p>
            <div className="flex justify-end">
              <button onClick={() => setBlockedAlert(null)} className="px-4 py-2 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white rounded-xl text-xs font-bold hover:bg-[#334486] shadow-sm transition-colors">
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
          The sequence question.

          Phrased as what the trades do, not as a rule being broken: the studio
          is the one who knows whether today's exception is worth it, and a
          dialog that lectures gets clicked through without being read. Cancel
          is the default action — the move has not been applied yet.
      */}
      {pendingMove && (
        <div className="fixed inset-0 z-[220] bg-[#3D52A0]/90 backdrop-blur-md flex items-center justify-center p-5 no-print"
          onClick={() => setPendingMove(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-amber-700 flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" /> Out of build sequence
            </h3>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Moving <b className="text-slate-800">{pendingMove.title}</b> there puts it ahead of work
              it is normally built after:
            </p>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 max-h-44 overflow-y-auto mb-4 space-y-1.5">
              {pendingMove.warnings.slice(0, 6).map((w, i) => (
                <div key={i} className="text-xs text-amber-900 font-medium flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0 mt-1.5" />
                  {w.reason}
                </div>
              ))}
              {pendingMove.warnings.length > 6 && (
                <div className="text-[11px] text-amber-700 font-semibold pl-3.5">
                  and {pendingMove.warnings.length - 6} more
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
              Site sometimes has a reason the programme does not — a trade on site today, a
              material still in transit. Nothing is stopping you; the dates will recalculate
              either way.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingMove(null)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors">
                Keep it where it was
              </button>
              <button onClick={confirmMove}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 shadow-sm transition-colors">
                Move it anyway
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// React.FC, not a bare arrow: with this project's TS/JSX config a plain arrow
// component is not recognised as a component when given a `key`, and fails to
// compile with "Property 'key' does not exist".
const Row: React.FC<{ k: string; v: string; tone?: 'bad' }> = ({ k, v, tone }) => (
  <div className="flex gap-3 py-1 border-b border-slate-100 last:border-0">
    <span className="text-slate-400 w-24 shrink-0">{k}</span>
    <span className={`flex-1 ${tone === 'bad' ? 'text-rose-600 font-semibold' : 'text-slate-700'}`}>{v}</span>
  </div>
);

function monthTicks(from: number, days: number) {
  const out: { day: number; label: string }[] = [];
  let last = -1;
  for (let i = 0; i < days; i++) {
    const d = new Date(toISO(from + i));
    if (d.getUTCMonth() !== last) {
      last = d.getUTCMonth();
      out.push({ day: from + i, label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) });
    }
  }
  return out;
}

function HoldDialog({ scope, trades, onCancel, onApply }: {
  scope: 'site' | 'trade'; trades: string[];
  onCancel: () => void; onApply: (h: ScheduleHold) => void;
}) {
  const [trade, setTrade] = useState(trades[0] || '');
  const [reason, setReason] = useState(HOLD_REASONS[0]);
  const [days, setDays] = useState(7);
  const [fromISO, setFrom] = useState(toISO(Math.floor(Date.now() / 86400000)));
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-[120] bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm flex items-center justify-center p-5"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <h3 className="font-serif text-lg font-semibold text-slate-900">
          {scope === 'site' ? 'Pause the whole site' : 'Hold a trade'}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5 mb-4">
          {scope === 'site'
            ? 'Stops every lane. Downstream work slides by the days lost.'
            : 'Stops one trade; the others keep running.'}
        </p>

        {scope === 'trade' && (
          <Field label="Trade">
            <select value={trade} onChange={e => setTrade(e.target.value)} className={INPUT}>
              {trades.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
        )}
        <Field label="Reason">
          <select value={reason} onChange={e => setReason(e.target.value)} className={INPUT}>
            {HOLD_REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="From">
          <input type="date" value={fromISO} onChange={e => setFrom(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Working days lost">
          <input type="number" min={1} value={days} onChange={e => setDays(Math.max(1, +e.target.value || 1))} className={INPUT} />
        </Field>
        <Field label="Note">
          <input value={note} onChange={e => setNote(e.target.value)} className={INPUT}
            placeholder="e.g. society AGM restricted access" />
        </Field>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onApply({
              id: `hold-${Date.now()}`, scope, target: scope === 'trade' ? trade : undefined,
              fromISO, workDays: days, reason, note: note || undefined, at: Date.now(),
            })}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white text-sm font-bold">
            Apply hold
          </button>
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500">
            Cancel
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Recorded with its reason, so it can be counted later. Pinned dates report a conflict instead of moving.
        </p>
      </div>
    </div>
  );
}

const INPUT = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-300';
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-3">
    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
    {children}
  </div>
);

interface IllustrationProps {
  schedule: ProjectSchedule;
  result: any;
  isPrintMode?: boolean;
}

const ScheduleMechanicsIllustration: React.FC<IllustrationProps> = ({ schedule, result, isPrintMode = false }) => {
  const startStr = result.startISO ? new Date(result.startISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const finishStr = result.finishISO ? new Date(result.finishISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const targetStr = schedule.targetHandoverISO ? new Date(schedule.targetHandoverISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const overrun = result.overrunWorkDays;
  const isCompressed = result.compressionInfo?.compressionFactor && result.compressionInfo.compressionFactor < 1;
  const compressionPercent = result.compressionInfo?.compressionFactor ? Math.round((1 - result.compressionInfo.compressionFactor) * 100) : 0;

  if (isPrintMode) {
    return (
      <div className="pt-6 border-t border-slate-100 mt-6 text-slate-800 font-sans break-inside-avoid">
        <div className="border-t border-[#d4af37] pt-4 mb-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">
            TIMELINE PACING &amp; BUFFER GUIDE
          </h4>
          <p className="text-[11px] text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Project schedule status and safety buffer overview.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          <div className="border border-slate-200 p-3 rounded bg-slate-50/50 space-y-2">
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-900">
              Project Timeline &amp; Safety Buffer
            </h5>
            <div className="h-4 w-full bg-slate-100 rounded border border-slate-200 flex overflow-hidden relative text-[9px] font-bold">
              <div className="h-full bg-slate-800 text-white flex items-center justify-center px-2" style={{ width: '70%' }}>
                Execution Phase
              </div>
              {overrun != null ? (
                overrun > 0 ? (
                  <div className="h-full bg-rose-100 text-rose-800 flex items-center justify-center px-2 flex-1">
                    Shortfall: {overrun}d
                  </div>
                ) : (
                  <div className="h-full bg-emerald-100 text-emerald-800 flex items-center justify-center px-2 flex-1">
                    Buffer: {Math.abs(overrun)}d
                  </div>
                )
              ) : (
                <div className="h-full bg-slate-200 text-slate-500 flex items-center justify-center px-2 flex-1">
                  Buffer Open
                </div>
              )}
            </div>
            <div className="text-[10px] text-slate-600 font-mono space-y-0.5">
              <div>• Start Anchor: {startStr}</div>
              <div>• Projected End: {finishStr}</div>
              {targetStr && <div>• Target Handover: {targetStr}</div>}
            </div>
          </div>

          <div className="border border-slate-200 p-3 rounded bg-slate-50/50 space-y-2">
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-900">
              Hold &amp; Shift Protection
            </h5>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Site holds pause calendar dates directly. Tasks shift smoothly together as one block without inflating trade durations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Live Screen View: Simple, friendly, diagram-first visual guide
  return (
    <div className="bg-white border border-[#EBEAE5] rounded-[24px] p-6 shadow-xs text-left mt-8 font-sans">
      {/* Friendly Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              How Your Timeline Works
            </h3>
          </div>
          <div className="mt-0.5">
            <WavyText
              text="A simple visual guide to timeline pacing, safety buffers, and site hold protection."
              className="text-[11px] font-medium text-slate-500"
            />
          </div>
        </div>
        <div className="px-3 py-1 bg-sky-50/80 text-[#3D52A0] text-[10px] uppercase tracking-wider font-extrabold rounded-full border border-sky-100 flex items-center gap-1.5">
          <span>🎯</span> Handover Assurance
        </div>
      </div>

      {/* Visual Diagram Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Diagram 1: Visual Timeline & Buffer Bar */}
        <div className="bg-slate-50/70 rounded-2xl border border-slate-200/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">📊</span>
              <h4 className="text-xs font-bold text-slate-900">
                1. Timeline &amp; Safety Buffer Bar
              </h4>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Visual Pacing</span>
          </div>

          {/* Interactive Visual Bar */}
          <div className="p-3 bg-white border border-slate-200/80 rounded-xl shadow-xs space-y-2.5">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1">🚀 Start ({startStr})</span>
              <span className="flex items-center gap-1">🎯 Finish ({finishStr})</span>
              <span className="flex items-center gap-1">🏁 Target ({targetStr || 'Not Set'})</span>
            </div>
            
            {/* Diagram Bar */}
            <div className="h-5 w-full bg-slate-100 rounded-lg flex overflow-hidden relative border border-slate-200/80 p-0.5">
              <div className="h-full bg-[#3D52A0] text-white text-[9px] font-bold rounded-md flex items-center justify-center px-2 transition-all" style={{ width: '68%' }}>
                Active Execution
              </div>
              {overrun != null ? (
                overrun > 0 ? (
                  <div className="h-full bg-rose-500 text-white text-[9px] font-extrabold rounded-md flex items-center justify-center px-1 flex-1 ml-0.5 animate-pulse">
                    ⚠️ {overrun}d Delay Shortfall
                  </div>
                ) : (
                  <div className="h-full bg-emerald-500 text-white text-[9px] font-extrabold rounded-md flex items-center justify-center px-1 flex-1 ml-0.5">
                    🛡️ {Math.abs(overrun)}d Safety Buffer
                  </div>
                )
              ) : (
                <div className="h-full bg-slate-200 text-slate-500 text-[9px] font-bold rounded-md flex items-center justify-center flex-1 ml-0.5">
                  Target Deadline Not Set
                </div>
              )}
            </div>

            {/* Quick Summary Pill */}
            <div className="flex items-center justify-between pt-1 text-[11px] font-medium text-slate-600">
              <span>Timeline Margin:</span>
              <span className={`font-bold px-2.5 py-0.5 rounded-md text-[10px] ${
                overrun != null && overrun <= 0 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : overrun != null && overrun > 0
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {overrun != null 
                  ? (overrun <= 0 ? `🛡️ ${Math.abs(overrun)} Days Buffer Remaining` : `⚠️ Overdue by ${overrun} Days`)
                  : 'Set a target date above to track buffer'}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal">
            {isCompressed ? (
              <span className="text-slate-800 font-semibold">
                ⚡ <strong className="text-[#3D52A0]">Auto-Pacing Active:</strong> Remaining trades are auto-adjusted by {compressionPercent}% to ensure handover deadline is met.
              </span>
            ) : (
              <span>Your safety buffer protects the target handover date from minor on-site delays.</span>
            )}
          </p>
        </div>

        {/* Diagram 2: Non-Compounding Site Holds */}
        <div className="bg-slate-50/70 rounded-2xl border border-slate-200/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">⏸️</span>
              <h4 className="text-xs font-bold text-slate-900">
                2. Smart Site Holds (Zero Multiplied Delays)
              </h4>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Calendar Protection</span>
          </div>

          {/* Side-by-Side Diagram */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-rose-600 text-[9px] uppercase tracking-wider flex items-center gap-1">
                ❌ Old Method
              </div>
              <div className="space-y-1">
                <div className="h-2.5 bg-slate-200 rounded-full w-full"></div>
                <div className="h-2.5 bg-rose-200 rounded-full w-4/5"></div>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight">
                Delays add up on top of each trade, causing timeline snowballing.
              </p>
            </div>

            <div className="p-3 bg-[#3D52A0] text-white rounded-xl space-y-1.5 shadow-xs">
              <div className="font-bold text-amber-300 text-[9px] uppercase tracking-wider flex items-center gap-1">
                ✅ Copilot Blockout
              </div>
              <div className="space-y-1">
                <div className="h-2.5 bg-sky-200/40 rounded-full w-full flex overflow-hidden">
                  <div className="w-1/3 bg-amber-400"></div>
                  <div className="w-2/3 bg-white"></div>
                </div>
              </div>
              <p className="text-[9px] text-sky-100 leading-tight">
                Pauses freeze calendar dates directly. Tasks shift smoothly together.
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal">
            When a site hold occurs, calendar days pause. Work resumes without artificially inflating task estimates.
          </p>
        </div>
      </div>

      {/* Simple 3-Step Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
        <div className="p-3 rounded-xl border border-slate-150 bg-slate-50/50 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-100 text-[#3D52A0] flex items-center justify-center font-bold text-xs shrink-0">
            1
          </div>
          <div>
            <h5 className="text-[11px] font-bold text-slate-800">Start Anchor</h5>
            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Anchors overall execution dates to physical calendar days.</p>
          </div>
        </div>

        <div className="p-3 rounded-xl border border-slate-150 bg-slate-50/50 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
            2
          </div>
          <div>
            <h5 className="text-[11px] font-bold text-slate-800">Safety Buffer</h5>
            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Absorbs minor hiccups before affecting final handover.</p>
          </div>
        </div>

        <div className="p-3 rounded-xl border border-slate-150 bg-slate-50/50 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
            3
          </div>
          <div>
            <h5 className="text-[11px] font-bold text-slate-800">Handover Protected</h5>
            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Keeps promised delivery dates safe and client-ready.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ReportProps {
  projectContext?: ProjectContext;
  schedule: ProjectSchedule;
  result: any;
  variance: any;
  lost: any[];
  onClose: () => void;
}

function ScheduleAnalysisReportModal({ projectContext, schedule, result, variance, lost, onClose }: ReportProps) {
  const criticalPathTasks = result.tasks.filter((t: any) => t.onCriticalPath && t.status !== 'completed');
  const blockedTasks = result.tasks.filter((t: any) => t.openGates && t.openGates.length > 0);
  const totalHoldsCount = schedule.holds?.length || 0;
  const totalDaysLost = lost.reduce((sum: number, l: any) => sum + l.days, 0);

  const recommendations = [];
  if ((result.overrunWorkDays ?? 0) > 0) {
    recommendations.push({
      title: "CRITICAL PATH VELOCITY",
      desc: `The project is currently slipping by ${result.overrunWorkDays} working days. Focus resources and schedule overtime/additional labor on critical path tasks, particularly: ${criticalPathTasks.slice(0, 3).map((t: any) => t.title).join(', ')}.`
    });
  } else if (result.overrunWorkDays != null) {
    recommendations.push({
      title: "BUFFER RETENTION",
      desc: `The schedule is healthy with a ${Math.abs(result.overrunWorkDays)} working day buffer. Guard critical phase transitions and avoid overlapping subsequent trades prematurely to maintain this margin.`
    });
  } else {
    recommendations.push({
      title: "TIMELINE HEALTH",
      desc: "Set a Target Handover Date to monitor project buffer and automatically calculate timeline variances."
    });
  }

  if (totalHoldsCount > 0) {
    recommendations.push({
      title: "RESOLVE ACTIVE HALTS",
      desc: `With ${totalHoldsCount} site/trade holds recorded (costing ${totalDaysLost} total days), prioritize resolving outstanding disputes, building restrictions, or material delays immediately.`
    });
  }

  const hasGFCBlock = blockedTasks.some((t: any) => t.openGates && t.openGates.includes('gfc'));
  const hasPaymentBlock = blockedTasks.some((t: any) => t.openGates && (t.openGates.includes('payment_cleared') || t.openGates.includes('e1_cleared')));
  
  if (hasGFCBlock) {
    recommendations.push({
      title: "GFC DRAWING RELEASE",
      desc: "Ensure all outstanding Good-for-Construction (GFC) drawing packages are approved and signed off by the design team to release downstream execution lanes."
    });
  }

  if (hasPaymentBlock) {
    recommendations.push({
      title: "FINANCIAL MILESTONES",
      desc: "Some tasks are currently gated by uncleared payments. Fast-track client invoice reviews and milestone clearing to prevent vendor order delays."
    });
  }

  if (recommendations.length < 3) {
    recommendations.push({
      title: "PROCUREMENT ALIGNMENT",
      desc: "Coordinate with vendors to align material deliveries precisely with trade start times to avoid holding materials on-site."
    });
  }

  return (
    <div className="fixed inset-0 z-[150] bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm flex justify-center overflow-y-auto p-4 md:p-10 no-print-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          body > * {
            display: none !important;
          }
          #timeline-analysis-report-print, #timeline-analysis-report-print * {
            display: block !important;
          }
          #timeline-analysis-report-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
      
      <div className="bg-white rounded-2xl w-full max-w-4xl p-6 md:p-8 shadow-2xl relative border border-slate-200 h-fit my-auto">
        {/* Top bar (No Print) */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6 no-print">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-900" />
            <h3 className="font-serif text-lg font-semibold text-slate-900">Timeline Analysis Report</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Print Report
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Section */}
        <div id="timeline-analysis-report-print" className="space-y-6 text-slate-800 font-sans text-sm">
          {/* Cover / Header */}
          <div className="text-center pb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">BOQ Copilot · Timeline Audit</p>
            <h2 className="font-serif text-2xl font-semibold text-slate-900 mt-1 uppercase tracking-wide">
              Timeline Analysis Report
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Generated on {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <div className="h-[1px] bg-[#d4af37] w-full my-4" />
          </div>

          {/* Project Details */}
          <div className="bg-slate-50/60 rounded-xl border border-slate-100 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Project Name</p>
              <p className="font-semibold text-slate-900 mt-0.5 truncate">{projectContext?.name || "Live Project"}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Client Name</p>
              <p className="font-semibold text-slate-700 mt-0.5 truncate">{projectContext?.clientName || "—"}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Site Location</p>
              <p className="font-semibold text-slate-700 mt-0.5 truncate">{projectContext?.location || "—"}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Area / Config</p>
              <p className="font-semibold text-slate-700 mt-0.5">
                {projectContext?.area ? `${projectContext.area} sqft` : ""}
                {projectContext?.config ? ` (${projectContext.config})` : ""}
                {!projectContext?.area && !projectContext?.config ? "—" : ""}
              </p>
            </div>
          </div>

          {/* KPI Summary Grid */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-1">
              Timeline Performance Indicators
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="border border-slate-100 p-3 rounded-lg text-left bg-white">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Start Anchor</p>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {result.startISO ? new Date(result.startISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "—"}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {schedule.projectStartISO ? "Custom date configured" : "Derived earliest"}
                </p>
              </div>

              <div className="border border-slate-100 p-3 rounded-lg text-left bg-white">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Projected Finish</p>
                <p className="text-lg font-bold mt-1" style={{
                  color: (result.overrunWorkDays ?? 0) > 0 ? '#e11d48' : '#059669',
                }}>
                  {result.finishISO ? new Date(result.finishISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "—"}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Estimated end date</p>
              </div>

              <div className="border border-slate-100 p-3 rounded-lg text-left bg-white">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Target Handover</p>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {schedule.targetHandoverISO ? new Date(schedule.targetHandoverISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "—"}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Deadline target</p>
              </div>

              <div className="border border-slate-100 p-3 rounded-lg text-left bg-white">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Variance status</p>
                {result.overrunWorkDays != null ? (
                  <>
                    <p className="text-lg font-bold mt-1" style={{
                      color: result.overrunWorkDays > 0 ? '#e11d48' : '#059669',
                    }}>
                      {result.overrunWorkDays > 0 ? `+${result.overrunWorkDays}d Delay` : `${Math.abs(result.overrunWorkDays)}d Buffer`}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">
                      {result.overrunWorkDays > 0 ? "Projected overrun" : "Project on schedule"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-slate-400 mt-1">—</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Target not set</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Active Holds & Delays */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 border-b border-slate-100 pb-1">
                Holds & Impact Summary
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                  <span className="text-slate-500">Total Site/Trade Holds</span>
                  <span className="font-bold text-slate-900">{totalHoldsCount} recorded</span>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                  <span className="text-slate-500">Working Days Lost</span>
                  <span className="font-bold text-rose-600">+{totalDaysLost}d total</span>
                </div>
                {schedule.holds && schedule.holds.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {schedule.holds.map((h: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-100 text-xs">
                        <div className="flex justify-between font-bold text-slate-900">
                          <span>{h.scope === 'site' ? "Whole Site Pause" : `Hold: ${h.target}`}</span>
                          <span className="text-rose-600">+{h.workDays}d</span>
                        </div>
                        <p className="text-slate-500 text-[11px] mt-0.5">Reason: {h.reason}</p>
                        {h.note && <p className="text-slate-400 text-[10px] mt-0.5 italic">"{h.note}"</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic pt-2">No active site or trade holds recorded.</p>
                )}
              </div>
            </div>

            {/* Critical Path Tasks */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 border-b border-slate-100 pb-1">
                Current Critical Path (Zero Float)
              </h4>
              <p className="text-[11px] text-slate-500 mb-2">
                Any delay on these tasks will directly push out the final completion date.
              </p>
              {criticalPathTasks.length > 0 ? (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {criticalPathTasks.map((t: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{t.title}</p>
                        <p className="text-[10px] text-slate-400">{t.startISO} to {t.endISO} · {t.workDays}d</p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                        t.status === 'in_progress' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {t.status === 'in_progress' ? 'Running' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic pt-2">No critical path tasks identified.</p>
              )}
            </div>
          </div>

          {/* Timeline Mechanics & Hold Impact Illustration */}
          <ScheduleMechanicsIllustration schedule={schedule} result={result} isPrintMode={true} />

          {/* Actionable Recommendations */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-1">
              Action Plan & Recommendations
            </h4>
            <div className="space-y-3">
              {recommendations.map((rec: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-amber-50/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#d4af37] shrink-0 mt-1.5" />
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{rec.title}</h5>
                    <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">{rec.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="text-center pt-4 text-[9px] text-slate-400 uppercase tracking-widest no-print font-medium">
            End of Report
          </div>
        </div>
      </div>
    </div>
  );
}

function AddStageDialog({ tasks, trades = [], onCancel, onApply }: {
  tasks: any[];
  trades?: string[];
  onCancel: () => void;
  onApply: (t: any) => void;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'design' | 'execution' | 'procurement' | 'milestone'>('execution');
  const [trade, setTrade] = useState(trades[0] || 'Carpentry');
  const [workDays, setWorkDays] = useState(5);
  const [depId, setDepId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    if (!title.trim()) {
      setError('Please enter a stage title');
      return;
    }
    const id = `custom-${kind}-${Math.random().toString(36).substr(2, 9)}`;
    const newTask = {
      id,
      title: title.trim(),
      kind,
      workDays: kind === 'milestone' ? 0 : workDays,
      dependencies: depId ? [depId] : [],
      status: 'pending',
      trade: kind === 'execution' ? trade : undefined,
    };
    onApply(newTask);
  };

  return (
    <div className="fixed inset-0 z-[210] bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm flex items-center justify-center p-5 no-print"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h3 className="font-serif text-lg font-semibold text-slate-900 flex items-center gap-2 mb-1">
          ✨ Add Custom Stage/Task
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Create a new stage, task, or milestone in the project schedule dependency graph.
        </p>

        <Field label="Stage Title">
          <input 
            type="text" 
            placeholder="e.g. Wardrobe Shutters Mounting" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            className={INPUT} 
          />
        </Field>

        <Field label="Category/Lane">
          <select 
            value={kind} 
            onChange={e => {
              const k = e.target.value as any;
              setKind(k);
              if (k === 'milestone') setWorkDays(0);
            }} 
            className={INPUT}
          >
            <option value="design">Design</option>
            <option value="execution">Execution</option>
            <option value="procurement">Procurement</option>
            <option value="milestone">Milestone (0 days)</option>
          </select>
        </Field>

        {kind === 'execution' && (
          <Field label="Trade">
            <select value={trade} onChange={e => setTrade(e.target.value)} className={INPUT}>
              {trades.length > 0 ? (
                trades.map(t => <option key={t} value={t}>{t}</option>)
              ) : (
                <>
                  <option value="Site & Preliminaries">Site & Preliminaries</option>
                  <option value="Civil & Demolition">Civil & Demolition</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Electrical">Electrical</option>
                  <option value="False Ceiling">False Ceiling</option>
                  <option value="Flooring & Tiling">Flooring & Tiling</option>
                  <option value="Carpentry">Carpentry</option>
                  <option value="Painting & Finishing">Painting & Finishing</option>
                  <option value="Other works">Other works</option>
                </>
              )}
            </select>
          </Field>
        )}

        {kind !== 'milestone' && (
          <Field label="Duration (Working Days)">
            <input 
              type="number" 
              min={1} 
              value={workDays} 
              onChange={e => setWorkDays(Math.max(1, +e.target.value || 1))} 
              className={INPUT} 
            />
          </Field>
        )}

        <Field label="Predecessor (Dependency)">
          <select value={depId} onChange={e => setDepId(e.target.value)} className={INPUT}>
            <option value="">No dependency (Starts with project start)</option>
            {['design', 'execution', 'procurement', 'milestone'].map(groupKind => {
              const groupTasks = tasks.filter(t => t.kind === groupKind);
              if (groupTasks.length === 0) return null;
              return (
                <optgroup key={groupKind} label={`${groupKind.toUpperCase()} STAGES`}>
                  {groupTasks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title} {t.trade ? `(${t.trade})` : ''} [{t.workDays || 0}d]
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>

        {error && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 mt-3 font-medium">
            ⚠️ {error}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleApply} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 hover:bg-[#334486] shadow-sm transition-all">
            Add Stage
          </button>
        </div>
      </div>
    </div>
  );
}
