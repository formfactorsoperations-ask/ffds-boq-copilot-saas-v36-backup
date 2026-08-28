import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProjectContext, FullBoqItem, DesignGateState } from '../../types';
import {
  migrateGate, computeItems, gateReadiness, EffectiveItem,
} from '../../lib/designGate';
import { usePageHeader } from '../../contexts/PageHeaderContext';
import {
  CheckCircle2, Circle, Lock, Sparkles, ShieldCheck, Snowflake, ReceiptText,
  ArrowRight, RotateCcw, AlertTriangle, X, Zap, Link2, PenLine, FileText,
  Compass, Layers, Sliders, Check, Eye, HelpCircle, HardHat, FileCheck, RefreshCw,
  FolderLock
} from 'lucide-react';

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  fullBoq?: FullBoqItem[];
  currentRole?: string;
}

const OWNER_ROLES = ['Super Admin', 'Admin', 'Ops Director', 'Principal Architect'];

export default function DesignCompleteGate({
  projectContext,
  setProjectContext,
  fullBoq = [],
  currentRole = 'Admin',
}: Props) {
  const isOwner = OWNER_ROLES.includes(currentRole);
  const gate: DesignGateState = useMemo(() => migrateGate(projectContext), [projectContext]);
  const items = useMemo(() => computeItems(gate, projectContext), [gate, projectContext]);
  const readiness = useMemo(() => gateReadiness(gate, projectContext), [gate, projectContext]);
  const frozenCount = fullBoq.length;

  const [confirmMode, setConfirmMode] = useState<null | { reason?: string }>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [signoffFor, setSignoffFor] = useState<string | null>(null);
  const [signoffRef, setSignoffRef] = useState('');
  const [reopenMode, setReopenMode] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const activated = gate.activated;

  // Key metrics for side telemetry card and top header vitals
  const drawingsCount = Array.isArray((projectContext as any)?.drawingTracker)
    ? (projectContext as any).drawingTracker.length
    : Object.keys((projectContext as any)?.drawingTracker || {}).length;
  const approvedDrawingsCount = Array.isArray((projectContext as any)?.drawingTracker)
    ? (projectContext as any).drawingTracker.filter((d: any) => d.status === 'Approved' || d.approvedAt).length
    : Object.values((projectContext as any)?.drawingTracker || {}).filter((d: any) => (d as any).status === 'Approved' || (d as any).approvedAt).length;

  const designDocsCount = projectContext.designDocuments?.length || 0;
  const currentStage = (projectContext.lifecycle?.stage as number) || (projectContext.currentStage as number) || 1;

  // Register vitals and badge with top PageTitleBlock (no action buttons in title section)
  usePageHeader({
    badge: activated
      ? 'Phase Closed (Locked)'
      : readiness.allClear
      ? 'Ready for Execution'
      : `${readiness.done}/${readiness.total} Cleared`,
    vitals: [
      {
        label: 'Readiness',
        value: `${readiness.pct}%`,
        tone: readiness.allClear ? 'good' : undefined,
      },
      {
        label: 'BOQ Lines',
        value: `${frozenCount} items`,
      },
      {
        label: 'Drawings',
        value: `${approvedDrawingsCount}/${drawingsCount} approved`,
      },
    ],
  }, [activated, readiness, frozenCount, drawingsCount, approvedDrawingsCount]);

  // ---- writes (all through context; the app auto-saves via dbService) ------

  const patchGate = (fn: (g: DesignGateState) => DesignGateState) => {
    setProjectContext(prev => ({ ...prev, designGate: fn(migrateGate(prev)) }));
  };

  /**
   * Primary toggle: if auto-detected or manual, clicking allows user to toggle or override state.
   */
  const toggleItem = (item: EffectiveItem) => {
    if (activated) return;
    if (item.ownerOnly && !isOwner) return;

    if (item.needsReference && !item.done) {
      setSignoffFor(item.key);
      setSignoffRef(item.reference || '');
      return;
    }

    patchGate(g => {
      const existingItems = g.items || [];
      const updated = existingItems.map(i => {
        if (i.key !== item.key) return i;

        // If currently done, clicking overrides to unchecked
        if (item.done) {
          return {
            ...i,
            done: false,
            manualOverride: 'unchecked' as const,
            confirmedAt: null,
            confirmedBy: null,
          };
        } else {
          // If currently undone, clicking overrides to checked
          return {
            ...i,
            done: true,
            manualOverride: 'checked' as const,
            confirmedAt: Date.now(),
            confirmedBy: currentRole,
          };
        }
      });
      return { ...g, items: updated };
    });
  };

  /**
   * Reset manual override back to default auto-detection / stored status
   */
  const resetItemOverride = (e: React.MouseEvent, itemKey: string) => {
    e.stopPropagation();
    if (activated) return;
    patchGate(g => ({
      ...g,
      items: g.items.map(i => i.key === itemKey ? { ...i, manualOverride: null } : i),
    }));
  };

  const saveSignoff = () => {
    if (!signoffFor || signoffRef.trim().length < 3) return;
    patchGate(g => ({
      ...g,
      items: g.items.map(i => i.key === signoffFor
        ? {
            ...i,
            done: true,
            reference: signoffRef.trim(),
            manualOverride: 'checked' as const,
            confirmedAt: Date.now(),
            confirmedBy: currentRole,
          }
        : i),
    }));
    setSignoffFor(null);
    setSignoffRef('');
  };

  const doActivate = (reason?: string) => {
    setProjectContext(prev => {
      const g = migrateGate(prev);
      const lc = prev.lifecycle || { stage: 1, subState: '', enteredStageAt: Date.now(), gates: {} as any, updatedAt: Date.now() };
      const now = Date.now();
      return {
        ...prev,
        boqFrozen: true,
        scopeAdditionsEnabled: true,
        designPhaseClosedAt: now,
        lifecycle: {
          ...lc,
          stage: Math.max((lc.stage as number) || 1, 5) as any,
          subState: 'Execution',
          enteredStageAt: now,
          gates: { ...(lc.gates || {}), designGateActive: { done: true, at: now, reference: 'design-gate' } } as any,
          updatedAt: now,
        },
        designGate: {
          ...g,
          activated: true,
          activatedAt: now,
          activatedBy: currentRole,
          proceedAnyway: reason ? { reason, by: currentRole, at: now } : g.proceedAnyway || null,
        },
      };
    });
    setConfirmMode(null);
    setReasonDraft('');
  };

  const doReopen = () => {
    if (reopenReason.trim().length < 10) return;
    setProjectContext(prev => {
      const g = migrateGate(prev);
      const lc = prev.lifecycle || ({} as any);
      const now = Date.now();
      return {
        ...prev,
        boqFrozen: false,
        lifecycle: {
          ...lc,
          stage: Math.min((lc.stage as number) || 5, 4) as any,
          subState: 'Reopened design phase',
          gates: { ...(lc.gates || {}), designGateActive: { done: false, at: null, reference: null } } as any,
          updatedAt: now,
        },
        designGate: {
          ...g,
          activated: false,
          activatedAt: null,
          reopened: [...(g.reopened || []), { reason: reopenReason.trim(), by: currentRole, at: now }],
        },
      };
    });
    setReopenMode(false);
    setReopenReason('');
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 pb-8">
      {/* Activated Status Notice */}
      {activated && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4.5 flex items-start justify-between gap-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-950">
                Design Gate Activated {gate.activatedAt ? `on ${new Date(gate.activatedAt).toLocaleDateString()}` : ''}
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                BOQ frozen with <strong>{frozenCount} line items</strong>. Rate baseline established.
                {gate.proceedAnyway && (
                  <span className="block mt-1 text-amber-800 font-medium italic">
                    Activated with early override: "{gate.proceedAnyway.reason}" (by {gate.proceedAnyway.by})
                  </span>
                )}
              </p>
            </div>
          </div>
          {!reopenMode && (
            <button
              onClick={() => setReopenMode(true)}
              className="px-3.5 py-1.5 rounded-xl border border-emerald-300 hover:bg-white text-emerald-900 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-700" /> Reopen Design
            </button>
          )}
        </motion.div>
      )}

      {/* Reopen Inline Card */}
      <AnimatePresence>
        {reopenMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl border border-amber-300 bg-amber-50/90 p-5 overflow-hidden shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              <AlertTriangle className="w-5 h-5 text-amber-700" />
              <h3 className="text-sm font-bold text-amber-950">Reopen the design phase?</h3>
            </div>
            <p className="text-xs text-amber-800 mb-3 leading-relaxed">
              This unfreezes BOQ line rates and steps the project back to Pre-Execution (Stage 4). Any payments collected in Money are unaffected.
            </p>
            <textarea
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              placeholder="State reason for reopening (e.g., Client requested major structural layout pivot, minimum 10 characters)..."
              className="w-full text-xs p-3 rounded-xl border border-amber-300 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-amber-400 h-20 resize-none"
            />
            <div className="flex justify-end gap-2.5 mt-3">
              <button
                onClick={() => { setReopenMode(false); setReopenReason(''); }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={doReopen}
                disabled={reopenReason.trim().length < 10}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl disabled:opacity-40 cursor-pointer shadow-xs"
              >
                Confirm Reopen
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main 2-Column Responsive Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Readiness Checklist (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Readiness Checklist</span>
                <h2 className="text-base font-bold text-slate-900">5-Point Design Handoff Audit</h2>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-slate-900">{readiness.pct}%</span>
                <span className="text-xs text-slate-400 block font-medium">{readiness.done} of {readiness.total} cleared</span>
              </div>
            </div>

            {/* Progress Track */}
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mb-5">
              <motion.div
                className={`h-full ${readiness.allClear ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                initial={{ width: 0 }}
                animate={{ width: `${readiness.pct}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            {/* Helper Notice regarding Auto vs Manual Override */}
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auto-status derived from project evidence. Click any item to manually override.</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">Interactive</span>
            </div>

            {/* Items List */}
            <div className="space-y-3">
              {items.map((item, idx) => {
                const isClickable = !activated && !(item.ownerOnly && !isOwner);
                const hasManualOverride = item.manualOverride !== null && item.manualOverride !== undefined;

                return (
                  <div
                    key={item.key}
                    onClick={() => isClickable && toggleItem(item)}
                    className={`rounded-xl border p-4 flex items-start gap-3.5 transition-all duration-200 select-none ${
                      item.done
                        ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/60'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {/* Checkbox Icon */}
                    <div className="shrink-0 mt-0.5">
                      {item.done ? (
                        <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : item.ownerOnly && !isOwner ? (
                        <div className="w-6 h-6 rounded-lg border-2 border-slate-200 flex items-center justify-center bg-slate-50">
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-lg border-2 border-slate-300 hover:border-indigo-600 flex items-center justify-center bg-white transition-colors">
                          <Circle className="w-3 h-3 text-transparent" />
                        </div>
                      )}
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[11px] font-mono font-bold text-slate-400">0{idx + 1}</span>
                        <p className={`text-sm font-bold ${item.done ? 'text-emerald-950' : 'text-slate-800'}`}>
                          {item.label}
                        </p>

                        {/* Status Badges */}
                        {item.source === 'auto' && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md">
                            Auto-Detected
                          </span>
                        )}
                        {item.source === 'override' && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                            Manual Override
                          </span>
                        )}
                        {item.ownerOnly && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            Owner Role
                          </span>
                        )}
                      </div>

                      {/* Evidence / Hint text */}
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {item.evidence ? (
                          <span className="text-slate-700 font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            {item.evidence}
                          </span>
                        ) : (
                          item.hint
                        )}
                      </p>

                      {/* Client Sign-off Reference */}
                      {item.reference && (
                        <p className="text-xs text-indigo-900 mt-1.5 flex items-center gap-1.5 font-medium bg-indigo-50/70 border border-indigo-100 px-2.5 py-1 rounded-lg truncate">
                          <Link2 className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                          <span>Sign-off: {item.reference}</span>
                        </p>
                      )}
                    </div>

                    {/* Right action tag / reset override */}
                    <div className="shrink-0 flex items-center gap-2 self-center">
                      {hasManualOverride && !activated && (
                        <button
                          onClick={(e) => resetItemOverride(e, item.key)}
                          title="Reset to automated status"
                          className="px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md border border-slate-200/80 flex items-center gap-1 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" /> Auto
                        </button>
                      )}

                      {item.needsReference && !item.done && isClickable && (
                        <span className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                          <PenLine className="w-3.5 h-3.5" /> Reference
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Telemetry, Project Readiness Context & Gate Impact (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Project Design Assets & Evidence Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Design Telemetry</span>
              <h2 className="text-base font-bold text-slate-900">Project Design Assets</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">Drawing Tracker</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-slate-900">{approvedDrawingsCount}</span>
                  <span className="text-xs text-slate-400 font-bold">/ {drawingsCount} approved</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">Design Docs</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-slate-900">{designDocsCount}</span>
                  <span className="text-xs text-slate-400 font-bold">PDF files</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">BOQ Line Items</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-slate-900">{frozenCount}</span>
                  <span className="text-xs text-slate-400 font-bold">specs</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">Current Lifecycle</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-extrabold text-indigo-600">Stage {currentStage}</span>
                </div>
              </div>
            </div>

            {/* Quick Evidence Checklist */}
            <div className="border-t border-slate-100 pt-3.5 space-y-2">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">Gate Signal Verification</span>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-600 flex items-center gap-2">
                  <Compass className="w-3.5 h-3.5 text-slate-400" /> Layout & Spaces Plan
                </span>
                <span className={`font-bold ${items[0]?.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {items[0]?.done ? 'Validated' : 'Pending'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-600 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-slate-400" /> Woodwork & Joinery
                </span>
                <span className={`font-bold ${items[1]?.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {items[1]?.done ? 'Validated' : 'Pending'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-600 flex items-center gap-2">
                  <HardHat className="w-3.5 h-3.5 text-slate-400" /> GFC Construction Issue
                </span>
                <span className={`font-bold ${items[3]?.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {items[3]?.done ? 'Validated' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Gate Impact & System Behavior Card */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-900">System Impact</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-white/80 p-3 rounded-xl border border-indigo-100/80">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Snowflake className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">BOQ Rates Freeze</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Locks baseline prices. Future scope edits route through signed Change Orders.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/80 p-3 rounded-xl border border-indigo-100/80">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Execution Phase Unlock</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Unlocks Stage 5 tools, procurement checklists, and site updates.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/80 p-3 rounded-xl border border-indigo-100/80">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <ReceiptText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Payment Continuity</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Design & execution collection schedules continue smoothly in Money.</p>
                </div>
              </div>
            </div>

            {/* Bottom Activation Action Area */}
            {!activated && (
              <div className="pt-2">
                {readiness.allClear ? (
                  <button
                    onClick={() => setConfirmMode({})}
                    className="w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <ShieldCheck className="w-4 h-4" /> Freeze Rates & Open Execution
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-100/80 border border-amber-200 rounded-xl px-3 py-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                      <span>{readiness.blockers.length} item{readiness.blockers.length === 1 ? '' : 's'} pending — you can still proceed with recorded reason.</span>
                    </div>
                    <button
                      onClick={() => { setReasonDraft(''); setConfirmMode({ reason: '' }); }}
                      className="w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      Proceed Anyway (Early Override) <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sign-off reference modal */}
      <AnimatePresence>
        {signoffFor && (
          <Modal onClose={() => setSignoffFor(null)}>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-slate-900">Record Client Sign-Off</h3>
                <p className="text-xs text-slate-500">Capture supporting evidence for final drawing approval</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 my-3 leading-relaxed">
              Enter the email thread subject, WhatsApp date/timestamp, or shared drive link where the client approved the final drawings:
            </p>
            <input
              autoFocus
              value={signoffRef}
              onChange={e => setSignoffRef(e.target.value)}
              placeholder="e.g., WhatsApp approval on 14 Aug — 'Drawings approved, start procurement'"
              className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-slate-50/50 outline-none focus:ring-2 focus:ring-indigo-300 text-slate-800"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setSignoffFor(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveSignoff}
                disabled={signoffRef.trim().length < 3}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl disabled:opacity-40 cursor-pointer shadow-xs"
              >
                Save Reference
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Confirm activation modal */}
      <AnimatePresence>
        {confirmMode && (
          <Modal onClose={() => setConfirmMode(null)}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Snowflake className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-slate-900">Freeze Design & Open Execution</h3>
                <p className="text-xs text-slate-500">Establish BOQ rate baseline and advance to Stage 5</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              This locks <strong>{frozenCount} BOQ lines</strong> and marks the design phase closed. Scope additions or modifications will require Change Orders. You can reopen the phase at any time.
            </p>

            {confirmMode.reason !== undefined && (
              <div className="mb-4">
                <label className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block mb-1">
                  Reason for Proceeding Early (Required)
                </label>
                <textarea
                  autoFocus
                  value={reasonDraft}
                  onChange={e => setReasonDraft(e.target.value)}
                  placeholder="e.g., Client verbally approved site handover; drawings being stamped concurrently (min 15 chars)..."
                  className="w-full text-xs p-3 rounded-xl border border-amber-300 bg-amber-50/50 outline-none focus:ring-2 focus:ring-amber-400 h-20 resize-none text-slate-800"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmMode(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => doActivate(confirmMode.reason !== undefined ? reasonDraft.trim() : undefined)}
                disabled={confirmMode.reason !== undefined && reasonDraft.trim().length < 15}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 disabled:opacity-40 cursor-pointer shadow-xs"
              >
                <ShieldCheck className="w-4 h-4" /> Confirm & Lock Baseline
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 border border-slate-200"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        {children}
      </motion.div>
    </div>
  );
}
