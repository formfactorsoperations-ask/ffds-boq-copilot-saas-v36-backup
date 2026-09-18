import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Lock, Check, ArrowRight, Activity, CheckCircle2, FastForward, AlertTriangle, Zap, Sparkles } from 'lucide-react';
import { useProjectJourney, StepWithStatus } from '../../../hooks/useProjectJourney';
import { PHASES } from '../../../constants/journeyConstants';
import { ProjectContext } from '../../../types';
import { db } from '../../../services/firebaseClient';
import { doc, updateDoc } from 'firebase/firestore';
import * as Illus from './JourneyIllustrations';

/*
  The Ops Matrix.

  Everything this screen could tell you was already being computed and thrown
  away: the hook returns `nextStep` and `activeSteps`, and the old page
  destructured both on line one and rendered neither, under a subtitle that
  promises "what is outstanding". It also opted out of the house typeface in
  eleven places (two font-serif, nine font-mono) and painted itself in 54
  slate greys that belong to no other screen in the app.

  So: same six phases, same steps, same sign-off and access actions, same
  retrofit and auto-completion controls. What changed is that the screen now
  leads with the answer, and is written in the app's own type and colour.
*/

const INK = '#12182F';
const PRIMARY = '#3D52A0';
const MUTED = '#5A628A';
const SOFT = '#8E96B8';
const LINE = '#E2E5F0';
const PALE = '#ADBBDA';

interface ProjectJourneyPageProps {
    projectId: string;
    projectContext: ProjectContext | null;
    onClose: () => void;
    onNavigate?: (tab: string) => void;
}

export default function ProjectJourneyPage({ projectId, projectContext, onClose, onNavigate }: ProjectJourneyPageProps) {
    const {
        steps, stepsByPhase, phaseProgress, overall,
        markStepDone, markStepPending, loading, nextStep,
    } = useProjectJourney(projectId, projectContext);
    const [focusedPhase, setFocusedPhase] = useState<number | null>(null);
    const [retrofitMode, setRetrofitMode] = useState<boolean>(false);
    const stillMotion = useReducedMotion();

    /*
      Which step is waiting on which.

      Built from prerequisiteIds, so a locked row can name the step actually
      holding it up, and an open one can say how much it releases. Both
      directions come from the same pass.
    */
    const graph = useMemo(() => {
        const byId = new Map<string, StepWithStatus>();
        (steps || []).forEach(s => byId.set(s.id, s));
        const unblocks = new Map<string, number>();
        (steps || []).forEach(s => {
            (s.prerequisiteIds || []).forEach(pid => {
                if (byId.get(pid)?.status !== 'done') unblocks.set(pid, (unblocks.get(pid) || 0) + 1);
            });
        });
        const blockedBy = (s: StepWithStatus) =>
            (s.prerequisiteIds || [])
                .map(pid => byId.get(pid))
                .find(p => p && p.status !== 'done') || null;
        return { unblocks, blockedBy };
    }, [steps]);

    /*
      Of what is left, how much the app will tick off on its own.

      `openNow` counts active AND pending, because that is what the "Open now"
      group below shows. Counting only the hook's active list read "1 gateway
      open" above a list of two, with a Sign off button on the one it had not
      counted.
    */
    const forecast = useMemo(() => {
        const notDone = (steps || []).filter(s => s.status !== 'done');
        const openNow = (steps || []).filter(s => s.status === 'active' || s.status === 'pending');
        return {
            open: notDone.length,
            auto: notDone.filter(s => s.isAutoDerived).length,
            openNow: openNow.length,
            needsSignoff: openNow.filter(s => !s.isAutoDerived).length,
        };
    }, [steps]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center p-12 h-full">
                <span className="text-[11px] uppercase tracking-widest font-bold animate-pulse" style={{ color: SOFT }}>
                    Reading the project…
                </span>
            </div>
        );
    }

    const enginePhase = phaseProgress.findIndex(p => p.pct < 100) !== -1
        ? phaseProgress.findIndex(p => p.pct < 100)
        : PHASES.length - 1;

    const displayPhaseIndex = focusedPhase !== null ? focusedPhase : enginePhase;
    const currentPhaseDef = PHASES[displayPhaseIndex];
    const currentSteps = stepsByPhase[displayPhaseIndex] || [];
    const isProjectComplete = (projectContext?.lifecycle?.stage || 1) >= 7 || projectContext?.status === 'completed';

    const completedSteps = currentSteps.filter(s => s.status === 'done');
    const pendingSteps = currentSteps.filter(s => s.status === 'pending' || s.status === 'active');
    const lockedSteps = currentSteps.filter(s => s.status === 'locked');

    const handleRetrofitPhase = () => {
        if (!retrofitMode) {
            setRetrofitMode(true);
            setTimeout(() => setRetrofitMode(false), 5000);
            return;
        }
        currentSteps.forEach(step => { if (step.status !== 'done') markStepDone(step.id); });
        setRetrofitMode(false);
    };

    const rise = stillMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

    return (
        <div className="flex flex-col max-w-[1600px] mx-auto pb-24">

            {/* ── What to do now ─────────────────────────────────────────── */}
            <motion.div
                {...rise}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border bg-white p-5 relative overflow-hidden"
                style={{ borderColor: LINE }}
            >
                <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: nextStep ? PRIMARY : '#CBD1E4' }} />

                <div className="flex flex-wrap items-start justify-between gap-4 pl-1">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5" style={{ color: PRIMARY }} />
                            <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Do this next</h2>
                        </div>

                        {nextStep ? (
                            <div className="flex items-start gap-3 mt-2">
                                {/*
                                  JourneyIllustrations ships a line drawing for every
                                  step and nothing imported it. One per step, in
                                  currentColor, is exactly what it was drawn for.
                                */}
                                <StepIllustration id={nextStep.illustration} />
                                <div className="min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-[22px] leading-none font-black" style={{ color: INK }}>{nextStep.title}</span>
                                    {nextStep.isAutoDerived && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full border px-1.5 py-0.5"
                                              style={{ color: PRIMARY, borderColor: PALE, background: '#EDE8F5' }}>
                                            <Zap className="w-2.5 h-2.5" /> ticks itself
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] mt-1.5 leading-snug" style={{ color: SOFT }}>
                                    {nextStep.description}
                                </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs mt-2 leading-relaxed" style={{ color: MUTED }}>
                                Nothing is waiting on you. Every step on this project is cleared.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {nextStep?.linkedTab && onNavigate && (
                            <button
                                onClick={() => onNavigate(nextStep.linkedTab!)}
                                className="text-[11px] font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl text-white transition-colors flex items-center gap-2"
                                style={{ background: PRIMARY }}
                            >
                                Open {nextStep.linkedFeature?.split('→').pop()?.trim() || 'task'}
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            aria-label="Close the Ops Matrix"
                            className="p-2 rounded-xl transition-colors hover:bg-[#F6F7FB]"
                            style={{ color: SOFT }}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* the three counts that say how much work is really left */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pt-3 border-t pl-1" style={{ borderColor: '#EDEFF7' }}>
                    <Readout value={`${forecast.openNow}`} label={forecast.openNow === 1 ? 'gateway open' : 'gateways open'} />
                    <Readout value={`${forecast.needsSignoff}`} label="need your sign-off" tone={forecast.needsSignoff > 0 ? 'warn' : 'plain'} />
                    <Readout value={`${forecast.auto}`} label={`of ${forecast.open} remaining tick themselves`} />
                    <div className="flex-1" />
                    <div className="flex items-center gap-2.5">
                        <input
                            type="checkbox"
                            id="autoStageCompletionToggle"
                            checked={projectContext?.autoStageCompletion !== false}
                            onChange={async (e) => {
                                if (!projectId) return;
                                try {
                                    await updateDoc(doc(db, 'projects', projectId), {
                                        autoStageCompletion: e.target.checked,
                                        'context.autoStageCompletion': e.target.checked,
                                    });
                                } catch (err) {
                                    console.error('Failed to toggle auto stage completion:', err);
                                }
                            }}
                            className="w-4 h-4 rounded cursor-pointer accent-[#3D52A0]"
                            style={{ borderColor: LINE }}
                        />
                        <label htmlFor="autoStageCompletionToggle" className="text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none" style={{ color: MUTED }}>
                            Auto-complete steps
                        </label>
                    </div>
                </div>
            </motion.div>

            {/* ── The six phases, as one spine ───────────────────────────── */}
            <motion.div
                {...rise}
                transition={{ duration: 0.34, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border bg-white p-5 mt-4"
                style={{ borderColor: LINE }}
            >
                <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Project lifecycle</h3>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: MUTED }}>
                        <b style={{ color: INK }}>{overall.done}</b> of {overall.total} cleared · {overall.pct}%
                    </span>
                </div>

                <div className="flex items-stretch gap-1.5">
                    {PHASES.map((p, i) => {
                        const prog = phaseProgress[i] || { done: 0, total: 0, pct: 0 };
                        const span = phaseSpan(stepsByPhase[i] || []);
                        const isShown = displayPhaseIndex === i;
                        const isEngine = enginePhase === i;
                        const isPast = i < enginePhase;
                        return (
                            <button
                                key={p.id}
                                onClick={() => setFocusedPhase(i)}
                                aria-current={isShown ? 'true' : undefined}
                                className="flex-1 min-w-0 text-left rounded-xl px-2.5 py-2 transition-colors group"
                                style={{ background: isShown ? '#EDE8F5' : 'transparent' }}
                                title={`${p.name} — ${prog.done}/${prog.total}`}
                            >
                                <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: '#EDEFF7' }}>
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{ background: isPast || prog.pct === 100 ? '#2F9E6E' : PRIMARY }}
                                        initial={stillMotion ? false : { width: 0 }}
                                        animate={{ width: `${prog.pct}%` }}
                                        transition={{ duration: 0.7, delay: 0.15 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                    />
                                </div>
                                {/*
                                  The name owns its own line. Sharing it with the NOW
                                  badge squeezed the label out entirely at phone width,
                                  leaving a column that read only "NOW".
                                */}
                                <span className="block text-[11px] font-bold truncate" style={{ color: isShown ? INK : MUTED }}>{p.name}</span>
                                <span className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[10px] tabular-nums shrink-0" style={{ color: SOFT }}>{prog.done}/{prog.total}</span>
                                    {isEngine && (
                                        <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-[1px] rounded shrink-0"
                                              style={{ color: PRIMARY, background: '#fff', border: `1px solid ${PALE}` }}>now</span>
                                    )}
                                    {span && (
                                        <span className="text-[10px] tabular-nums truncate" style={{ color: PALE }}>· {span}</span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </motion.div>

            {/* ── The selected phase ─────────────────────────────────────── */}
            <div className="mt-4">
                <div className="flex flex-wrap items-end justify-between gap-4 mb-3 px-1">
                    <div className="min-w-0">
                        <h2 className="text-lg font-black tracking-tight" style={{ color: INK }}>{currentPhaseDef.name}</h2>
                        <p className="text-[11px] mt-0.5" style={{ color: SOFT }}>{currentPhaseDef.desc}</p>
                    </div>
                    {(pendingSteps.length > 0 || lockedSteps.length > 0) && (
                        <button
                            onClick={handleRetrofitPhase}
                            title="Marks every remaining step in this phase as done"
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors border shrink-0"
                            style={retrofitMode
                                ? { color: '#9F1239', background: '#FFF1F2', borderColor: '#FECDD3' }
                                : { color: SOFT, background: 'transparent', borderColor: LINE }}
                        >
                            {retrofitMode ? <AlertTriangle className="w-3.5 h-3.5" /> : <FastForward className="w-3.5 h-3.5" />}
                            {retrofitMode ? 'Confirm — complete all?' : 'Retrofit phase'}
                        </button>
                    )}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={displayPhaseIndex}
                        initial={stillMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={stillMotion ? undefined : { opacity: 0, y: -6 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="space-y-6"
                    >
                        <Group title="Open now" icon={<Activity className="w-3.5 h-3.5" style={{ color: PRIMARY }} />} steps={pendingSteps}>
                            {pendingSteps.map((step, i) => (
                                <StepRow key={step.id} step={step} index={i} still={!!stillMotion}
                                    unblocks={graph.unblocks.get(step.id) || 0}
                                    onInteract={() => markStepDone(step.id)}
                                    onNavigate={onNavigate && step.linkedTab ? () => onNavigate(step.linkedTab!) : undefined} />
                            ))}
                        </Group>

                        <Group title="Waiting on something else" icon={<Lock className="w-3 h-3" style={{ color: SOFT }} />} steps={lockedSteps}>
                            {lockedSteps.map((step, i) => (
                                <StepRow key={step.id} step={step} index={i} still={!!stillMotion} locked
                                    blockedBy={graph.blockedBy(step)?.title || null}
                                    onInteract={() => markStepDone(step.id)}
                                    onNavigate={onNavigate && step.linkedTab ? () => onNavigate(step.linkedTab!) : undefined} />
                            ))}
                        </Group>

                        <Group title="Cleared" icon={<CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#2F9E6E' }} />} steps={completedSteps}>
                            {completedSteps.map((step, i) => (
                                <StepRow key={step.id} step={step} index={i} still={!!stillMotion}
                                    onUndo={isProjectComplete ? undefined : () => markStepPending(step.id)}
                                    onNavigate={onNavigate && step.linkedTab ? () => onNavigate(step.linkedTab!) : undefined} />
                            ))}
                        </Group>

                        {currentSteps.length === 0 && (
                            <div className="text-center py-16 border border-dashed rounded-2xl text-xs" style={{ borderColor: LINE, color: SOFT }}>
                                No steps are defined for this phase.
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

/**
 * How long a phase actually took, in days, or nothing.
 *
 * Only steps carrying a real timestamp count, and two are needed to measure a
 * span at all. Anything completed before timestamps were recorded returns
 * nothing rather than a zero, because a zero would read as "done in a day".
 */
function phaseSpan(steps: StepWithStatus[]): string | null {
    const stamps = steps
        .filter(s => s.status === 'done' && s.completedAt)
        .map(s => s.completedAt!.getTime())
        .sort((a, b) => a - b);
    if (stamps.length < 2) return null;
    const days = Math.round((stamps[stamps.length - 1] - stamps[0]) / 86400000);
    return days <= 0 ? 'same day' : `${days}d`;
}

function StepIllustration({ id }: { id?: string }) {
    const name = 'Illu' + String(id || '')
        .split('_')
        .filter(Boolean)
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join('');
    const Drawing = (Illus as Record<string, React.FC | undefined>)[name];
    if (!Drawing) return null;
    return (
        <span className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center p-2"
              style={{ background: '#EDE8F5', color: PRIMARY }} aria-hidden>
            <Drawing />
        </span>
    );
}

function Readout({ value, label, tone = 'plain' }: { value: string; label: string; tone?: 'plain' | 'warn' }) {
    return (
        <span className="text-[11px]" style={{ color: SOFT }}>
            <b className="tabular-nums" style={{ color: tone === 'warn' ? '#B45309' : INK }}>{value}</b> {label}
        </span>
    );
}

function Group({ title, icon, steps, children }: { title: string; icon: React.ReactNode; steps: StepWithStatus[]; children: React.ReactNode }) {
    if (steps.length === 0) return null;
    return (
        <div>
            <div className="flex items-center gap-2 pb-2 mb-2.5 border-b" style={{ borderColor: '#EDEFF7' }}>
                {icon}
                <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>{title}</h3>
                <span className="text-[10px] tabular-nums" style={{ color: PALE }}>{steps.length}</span>
            </div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function StepRow({
    step, index, still, locked = false, unblocks = 0, blockedBy = null, onInteract, onUndo, onNavigate,
}: {
    /* Declared because this project's React types do not special-case it. */
    key?: string | number;
    step: StepWithStatus;
    index: number;
    still: boolean;
    locked?: boolean;
    unblocks?: number;
    blockedBy?: string | null;
    onInteract?: () => void;
    onUndo?: () => void;
    onNavigate?: () => void;
}) {
    const isDone = step.status === 'done';
    const isActive = step.status === 'active';

    return (
        <motion.div
            initial={still ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: Math.min(index * 0.035, 0.25), ease: [0.22, 1, 0.36, 1] }}
            className="group flex flex-col md:flex-row md:items-center justify-between gap-3 py-3.5 px-4 rounded-2xl border bg-white transition-colors"
            style={{
                borderColor: isActive ? PRIMARY : LINE,
                boxShadow: isActive ? '0 0 0 1px rgba(61,82,160,.25)' : undefined,
                opacity: locked ? 0.75 : 1,
            }}
        >
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                      style={isDone ? { background: '#DCFCE7', border: '2px solid #2F9E6E' }
                          : locked ? { border: `2px solid ${LINE}` }
                          : isActive ? { background: PRIMARY, border: `2px solid ${PRIMARY}` }
                          : { border: `2px solid ${PALE}` }}>
                    {isDone ? <Check className="w-3 h-3" style={{ color: '#2F9E6E' }} />
                        : locked ? <Lock className="w-2.5 h-2.5" style={{ color: PALE }} />
                        : isActive ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold tracking-tight" style={{ color: locked ? MUTED : INK }}>{step.title}</span>
                        {step.isAutoDerived && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-[2px]"
                                  style={{ color: PRIMARY, background: '#EDE8F5' }}>
                                <Zap className="w-2.5 h-2.5" /> auto
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] leading-snug mt-0.5" style={{ color: SOFT }}>{step.description}</p>

                    {/* what is holding this up, or what it releases */}
                    {locked && blockedBy && (
                        <p className="text-[10px] mt-1.5 font-semibold" style={{ color: '#B45309' }}>
                            Waiting on: {blockedBy}
                        </p>
                    )}
                    {!locked && !isDone && unblocks > 0 && (
                        <p className="text-[10px] mt-1.5 font-semibold" style={{ color: PRIMARY }}>
                            Completing this unblocks {unblocks} {unblocks === 1 ? 'step' : 'steps'}
                        </p>
                    )}
                    {isDone && step.completedAt && (
                        <p className="text-[10px] mt-1.5 tabular-nums" style={{ color: PALE }}>
                            Cleared {step.completedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {step.completedByName ? ` · ${step.completedByName}` : ''}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 pl-8 md:pl-0">
                {step.linkedFeature && (
                    <button
                        onClick={onNavigate}
                        disabled={!step.linkedTab || locked}
                        className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 border disabled:cursor-not-allowed"
                        style={step.linkedTab && !locked
                            ? { color: PRIMARY, background: '#F6F7FB', borderColor: LINE }
                            : { color: PALE, background: 'transparent', borderColor: 'transparent' }}
                    >
                        Open <ArrowRight className="w-3 h-3" />
                    </button>
                )}
                {!isDone && onInteract && (
                    <button
                        onClick={onInteract}
                        className="text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded-xl text-white transition-colors"
                        style={{ background: PRIMARY }}
                    >
                        Sign off
                    </button>
                )}
                {isDone && onUndo && (
                    <button
                        onClick={onUndo}
                        className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl transition-colors hover:bg-[#F6F7FB]"
                        style={{ color: SOFT }}
                    >
                        Undo
                    </button>
                )}
            </div>
        </motion.div>
    );
}
