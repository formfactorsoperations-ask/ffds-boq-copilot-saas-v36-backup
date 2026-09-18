import React, { useRef, createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, collection, onSnapshot, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { JOURNEY_STEPS, PHASES, STAGE_LABELS, JourneyStepDef } from '../constants/journeyConstants';
import { ProjectContext, CommunicationLogItem, TermsDocket, RevisionAction, ManualJourneyStep } from '../types';
import { useOrg } from '../contexts/OrgContext';

export interface StepWithStatus extends JourneyStepDef {
  status: 'done' | 'active' | 'pending' | 'locked';
  completedAt: Date | null;
  completedByName: string | null;
  isAutoDerived: boolean;
}

export interface JourneyContextType {
  steps: StepWithStatus[];
  stepsByPhase: Record<number, StepWithStatus[]>;
  phaseProgress: { done: number; total: number; pct: number }[];
  overall: { done: number; total: number; pct: number };
  activeSteps: StepWithStatus[];
  nextStep: StepWithStatus | null;
  loading: boolean;
  markStepDone: (stepId: string, note?: string) => Promise<void>;
  markStepPending: (stepId: string) => Promise<void>;
}

export const JourneyContext = createContext<JourneyContextType | null>(null);

export function useJourney() {
  const context = useContext(JourneyContext);
  if (!context) {
    throw new Error('useJourney must be used within a JourneyProvider');
  }
  return context;
}

interface JourneyProviderProps {
  projectId: string;
  projectContext: ProjectContext | null;
  setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext | null>>;
  children: React.ReactNode;
}

export function JourneyProvider({ projectId, projectContext, setProjectContext, children }: JourneyProviderProps) {
  const { currentUserAuth } = useOrg();
  const [manualSteps, setManualSteps] = useState<Record<string, ManualJourneyStep>>({});
  const [commsLog, setCommsLog] = useState<Record<string, CommunicationLogItem>>({});
  const [termsDockets, setTermsDockets] = useState<TermsDocket[]>([]);
  const [revisions, setRevisions] = useState<RevisionAction[]>([]);
  const [loading, setLoading] = useState(true);

  // Load subcollections and listen in real-time
  useEffect(() => {
    if (!projectId || !db) {
      setLoading(false);
      return;
    }
    
    setLoading(true);

    // Listen to communications log in real-time
    const unsubComms = onSnapshot(collection(db, `projects/${projectId}/communicationLog`), (snap) => {
      const logs: Record<string, CommunicationLogItem> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as CommunicationLogItem;
        logs[data.key] = data;
      });
      setCommsLog(logs);
    }, (err) => {
      // An unhandled listener rejection fails the Firestore async queue and every
      // later call in the page throws INTERNAL ASSERTION FAILED (b815) — one
      // denied read takes the whole app down. Degrade instead.
      console.warn('Communication log unavailable:', err?.code || err);
      setCommsLog({});
    });

    // Listen to manual journey steps in real-time
    const unsubJourney = onSnapshot(collection(db, `projects/${projectId}/journeySteps`), (snap) => {
      const steps: Record<string, ManualJourneyStep> = {};
      snap.docs.forEach((d) => {
        steps[d.id] = d.data() as ManualJourneyStep;
      });
      setManualSteps(steps);
      setLoading(false);
    }, (err) => {
      // Journey steps are advisory; without them the engine falls back to
      // automatic rules rather than stalling the whole project view.
      console.warn('Journey steps unavailable:', err?.code || err);
      setManualSteps({});
      setLoading(false);
    });

    return () => {
      unsubComms();
      unsubJourney();
    };
    // ONLY projectId.
    //
    // This array used to carry `projectContext?.boqRevisions` and
    // `projectContext?.termsDockets`. Those are arrays on the project context,
    // and the context object is rebuilt on virtually every edit anywhere in the
    // app — so their *identity* changed constantly even when their contents did
    // not. Each change tore down both watch streams and immediately reopened
    // them.
    //
    // That churn is what produces
    //   FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9 / b815)
    // in WatchChangeAggregator: the SDK receives a response for a target it has
    // just dropped. Long-polling widens the window, and StrictMode's double
    // mount doubles it again, but the resubscription loop is the actual defect —
    // the transport and StrictMode only make it easier to hit.
    //
    // Once the queue asserts it is poisoned, so every later Firestore call in
    // the page throws too, including unrelated writes like saveBank. One
    // mis-specified dependency array took down the whole app.
    //
    // Seeding revisions and terms dockets from the context is a separate
    // concern and now lives in its own effect below.
  }, [projectId]);

  // Seed from the context whenever it changes. Cheap, synchronous, and — unlike
  // the listeners above — safe to re-run as often as the context updates.
  useEffect(() => {
    setRevisions(projectContext?.boqRevisions || []);
  }, [projectContext?.boqRevisions]);

  useEffect(() => {
    setTermsDockets(projectContext?.termsDockets || []);
  }, [projectContext?.termsDockets]);

  // Evaluate automatic rules
  const evaluateAutoStep = useCallback((step: JourneyStepDef): boolean => {
    if (!projectContext) return false;
    const currentStage = projectContext.lifecycle?.stage || projectContext.currentStage || 1;
    const isPastStage = currentStage > (step.phase + 1);
    
    switch (step.id) {
      case 'terms_docket_acknowledged':
        return termsDockets.some((d) => d.status === 'acknowledged' || d.status === 'signed' || (d as any).isAcknowledged) ||
          (projectContext as any).engagement?.status === 'acknowledged' ||
          (projectContext as any).engagement?.status === 'signed' ||
          (projectContext as any).termsSignoff?.status === 'signed' ||
          !!projectContext.designAgreementSignoff ||
          !!projectContext.lifecycle?.gates?.proposalAccepted?.done ||
          currentStage >= 2 ||
          projectContext.status !== 'lead';
        
      case 'brief_frozen':
        return !!projectContext.briefFrozenAt || 
          isPastStage || 
          currentStage >= 3 || 
          ((projectContext.rooms?.length || 0) > 0 && !!projectContext.area && projectContext.name !== 'New Project');
        
      case 'space_planning_presented':
        return commsLog['space_planning_review']?.status === 'sent' || 
          isPastStage || 
          currentStage >= 3 || 
          (projectContext.designDocuments?.length || 0) > 0 || 
          (projectContext.rooms?.length || 0) > 0;
        
      case 'visuals_3d_shared':
        return commsLog['3d_visuals_review']?.status === 'sent' || 
          isPastStage || 
          currentStage >= 3 || 
          !!projectContext.designApprovedAt;
        
      case 'revisions_incorporated':
        return revisions.length > 0 || 
          (projectContext.boqRevisions?.length || 0) > 0 || 
          commsLog['revision_acknowledged']?.status === 'sent' || 
          isPastStage || 
          currentStage >= 4;
        
      case 'design_approved':
        return !!projectContext.designApprovedAt || 
          !!projectContext.lifecycle?.gates?.designGateActive?.done || 
          isPastStage || 
          currentStage >= 4;
        
      case 'boq_shared':
        return commsLog['design_approval_boq']?.status === 'sent' || 
          !!projectContext.boqFrozen || 
          !!projectContext.operativeBoqVersion || 
          isPastStage || 
          currentStage >= 4;
        
      case 'payment_schedule_sent':
        return commsLog['payment_schedule_sent']?.status === 'sent' || 
          (projectContext.paymentMilestones?.length || 0) > 0 || 
          isPastStage || 
          currentStage >= 4;
        
      case 'agreement_signed':
        return commsLog['contract_sent']?.status === 'sent' || 
          !!projectContext.lifecycle?.gates?.contractSigned?.done || 
          (projectContext as any).contractSignoff?.status === 'signed' || 
          isPastStage || 
          currentStage >= 5;
        
      case 'design_fee_received':
        return (projectContext.paymentMilestones || []).some((m) => m.type === 'design' && m.status === 'paid') || 
          (projectContext.paymentMilestones || []).some((m) => m.status === 'paid') || 
          isPastStage || 
          currentStage >= 5;
        
      case 'onboarding_kit_sent':
        return commsLog['onboarding_kit_sent']?.status === 'sent' || 
          !!(projectContext as any).onboardingSentAt || 
          isPastStage || 
          currentStage >= 5;
        
      case 'exec_advance_1_received': {
        const execMilestones = (projectContext.paymentMilestones || []).filter((m) => m.type === 'execution');
        return (execMilestones.length > 0 && execMilestones[0].status === 'paid') || isPastStage || currentStage >= 6;
      }
      case 'exec_start_notified':
        return commsLog['execution_start']?.status === 'sent' || isPastStage || currentStage >= 6;
        
      case 'exec_advance_2_received': {
        const execMilestones2 = (projectContext.paymentMilestones || []).filter((m) => m.type === 'execution');
        return (execMilestones2.length > 1 && execMilestones2[1].status === 'paid') || isPastStage || currentStage >= 6;
      }
      case 'selections_locked': {
        const materialSelections = projectContext.materialSelections || [];
        return (materialSelections.length > 0 && materialSelections.every((i) => i.status === 'locked' || i.status === 'ordered' || i.status === 'approved')) || isPastStage || currentStage >= 6;
      }
      case 'exec_advance_3_requested': {
        const execMilestones3 = (projectContext.paymentMilestones || []).filter((m) => m.type === 'execution');
        return (execMilestones3.length > 2 && (execMilestones3[2].status === 'invoiced' || execMilestones3[2].status === 'paid')) || isPastStage || currentStage >= 6;
      }
      case 'site_update_shared':
        return commsLog['painting_stage_start']?.status === 'sent' || 
          ((projectContext.siteUpdates?.length || 0) + (projectContext.projectUpdates?.length || 0) > 0) || 
          isPastStage || 
          currentStage >= 6;
        
      case 'handover_advance_received':
        return (projectContext.paymentMilestones || []).some((m) => m.isHandoverAdvance && m.status === 'paid') || currentStage >= 7;
        
      case 'handover_dossier_sent':
        return commsLog['handover_warranty']?.status === 'sent' || !!projectContext.handoverDate || currentStage >= 7;
        
      case 'warranty_activated': {
        const allPaid = (projectContext.paymentMilestones || []).length > 0 && (projectContext.paymentMilestones || []).every((m) => m.status === 'paid');
        return (!!projectContext.handoverDate && allPaid) || currentStage >= 7 || projectContext.status === 'completed';
      }
      default:
        return false;
    }
  }, [projectContext, termsDockets, commsLog, revisions]);

  // Compute absolute current state of all 34 steps
  const computedSteps = useMemo(() => {
    const steps: StepWithStatus[] = JOURNEY_STEPS.map((s) => ({
      ...s,
      status: 'pending',
      completedAt: null,
      completedByName: null,
      isAutoDerived: s.statusSource === 'auto',
    }));

    const currentStage = projectContext?.lifecycle?.stage || projectContext?.currentStage || 1;
    const isProjectComplete = currentStage >= 7 || projectContext?.status === 'completed';
    let activeSetInPhase: boolean[] = [false, false, false, false, false, false];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const isPastPhase = currentStage > (step.phase + 1);
      
      if (isProjectComplete) {
        step.status = 'done';
        step.completedAt = step.completedAt || new Date();
        step.completedByName = step.completedByName || 'System Auto-close';
        continue;
      }

      // 1. Manual done state check (highest priority override)
      const manualState = manualSteps[step.id];
      const isManuallyDone = manualState && manualState.status === 'done';
      const isManuallyPending = manualState && manualState.status === 'pending';

      if (isManuallyDone) {
        step.status = 'done';
        step.completedAt = manualState.completedAt ? manualState.completedAt.toDate() : null;
        step.completedByName = manualState.completedByName;
        continue;
      }

      // 2. Check prerequisites lock state
      let isLocked = false;
      if (!isPastPhase) {
        for (const prereqId of step.prerequisiteIds) {
          const prereq = steps.find((s) => s.id === prereqId);
          if (!prereq || prereq.status !== 'done') {
            isLocked = true;
            break;
          }
        }
      }

      if (isLocked) {
        step.status = 'locked';
        continue;
      }

      // 3. Evaluate active/pending status
      const autoEnabled = projectContext?.autoStageCompletion !== false;

      if (isManuallyPending) {
        if (!activeSetInPhase[step.phase]) {
          step.status = 'active';
          activeSetInPhase[step.phase] = true;
        } else {
          step.status = 'pending';
        }
      } else if (step.statusSource === 'auto' && autoEnabled) {
        const isDone = evaluateAutoStep(step);
        if (isDone) {
          step.status = 'done';
          /*
            `new Date()` here was a lie told every render.

            `steps` is rebuilt above with completedAt: null, so the old
            `step.completedAt || new Date()` could only ever be now — the
            screen showed a self-validating step as cleared at whatever moment
            the memo last ran. The real first sighting is persisted by the
            effect below; until one exists the honest answer is nothing.
          */
          const rec = manualSteps[step.id];
          const seen = rec?.firstDoneObserved ? rec.firstDoneAt : null;
          step.completedAt = seen?.toDate ? seen.toDate() : (seen instanceof Date ? seen : null);
          step.completedByName = step.completedByName || 'Completed automatically';
        } else {
          if (!activeSetInPhase[step.phase]) {
            step.status = 'active';
            activeSetInPhase[step.phase] = true;
          } else {
            step.status = 'pending';
          }
        }
      } else if (isPastPhase && step.statusSource === 'manual') {
        // In a past stage that has already been cleared, mark manual historical
        // milestones done. No date is invented — this is inferred from the
        // stage having moved on, and nobody recorded when it happened.
        step.status = 'done';
        step.completedAt = null;
        step.completedByName = step.completedByName || 'Cleared with the stage';
      } else {
        if (!activeSetInPhase[step.phase]) {
          step.status = 'active';
          activeSetInPhase[step.phase] = true;
        } else {
          step.status = 'pending';
        }
      }
    }

    return steps;
  }, [evaluateAutoStep, manualSteps, projectContext]);

  /*
    Stamp a self-validating step the first time it is seen done.

    Written under firstDoneAt only, with no status field, so the auto
    rule remains the authority: a record here must never turn a step
    into a manual done that then ignores its own prerequisites.

    Steps already done before this shipped get stamped on first load,
    which records when the app noticed rather than when the work
    happened. That is why the field is not called completedAt and why
    phase timing below ignores anything stamped in the same pass.
  */
  /* Steps this session has watched sitting open, so a later done is real. */
  const seenOpenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    computedSteps.forEach((s) => { if (s.status !== 'done') seenOpenRef.current.add(s.id); });
  }, [computedSteps]);

  useEffect(() => {
    if (loading || !projectId || !db) return;
    const unstamped = computedSteps.filter(
      (s) => s.status === 'done' && s.isAutoDerived && !manualSteps[s.id]?.firstDoneAt,
    );
    if (unstamped.length === 0) return;
    unstamped.forEach((s) => {
      setDoc(
        doc(db, `projects/${projectId}/journeySteps/${s.id}`),
        {
          firstDoneAt: Timestamp.now(),
          // True only when this session watched the step turn from open to
          // done. A step already done when the app first looked is a backfill:
          // the stamp records when we noticed, which is not when it happened,
          // so nothing downstream is allowed to treat it as a completion time.
          firstDoneObserved: seenOpenRef.current.has(s.id),
        },
        { merge: true },
      ).catch((err) => console.warn('Could not stamp journey step:', s.id, err?.code || err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedSteps, manualSteps, loading, projectId]);

  // Phase Progress calculation
  const phaseProgress = useMemo(() => {
    return PHASES.map((p, i) => {
      const phaseSteps = computedSteps.filter((s) => s.phase === i);
      const done = phaseSteps.filter((s) => s.status === 'done').length;
      return {
        done,
        total: phaseSteps.length,
        pct: phaseSteps.length ? Math.round((done / phaseSteps.length) * 100) : 0,
      };
    });
  }, [computedSteps]);

  // Overall progress
  const overall = useMemo(() => {
    const done = computedSteps.filter((s) => s.status === 'done').length;
    return {
      done,
      total: computedSteps.length,
      pct: Math.round((done / computedSteps.length) * 100),
    };
  }, [computedSteps]);

  // Steps grouped by Phase
  const stepsByPhase = useMemo(() => {
    return computedSteps.reduce((acc, step) => {
      if (!acc[step.phase]) acc[step.phase] = [];
      acc[step.phase].push(step);
      return acc;
    }, {} as Record<number, StepWithStatus[]>);
  }, [computedSteps]);

  const activeSteps = useMemo(() => computedSteps.filter((s) => s.status === 'active'), [computedSteps]);
  const nextStep = useMemo(() => computedSteps.find((s) => s.status === 'pending' || s.status === 'active') || null, [computedSteps]);

  // Auto-sync between steps and project lifecycle stages & gates
  useEffect(() => {
    if (!projectId || !db || loading || !projectContext) return;

    // Determine the suggested Stage based on step completions
    let suggestedStage = 1;
    
    // Check Phase completions to auto-advance
    const ph0Done = phaseProgress[0]?.pct === 100; // Acquisition -> Proposal & Pitch (Stage 2)
    const ph1Done = phaseProgress[1]?.pct === 100; // Design -> Design & Approvals (Stage 3)
    const ph2Done = phaseProgress[2]?.pct === 100; // Contracting -> Pre-Execution (Stage 4)
    const ph3Done = phaseProgress[3]?.pct === 100; // Pre-Execution -> Execution (Stage 5)
    const ph4Done = phaseProgress[4]?.pct === 100; // Execution -> Handover & Closeout (Stage 6)
    const ph5Done = phaseProgress[5]?.pct === 100; // Handover -> Completed (Stage 7)

    if (ph5Done) suggestedStage = 7;
    else if (ph4Done || computedSteps.some(s => s.phase === 5 && s.status === 'done')) suggestedStage = 6;
    else if (ph3Done || computedSteps.some(s => s.phase === 4 && s.status === 'done')) suggestedStage = 5;
    else if (ph2Done || computedSteps.some(s => s.phase === 3 && s.status === 'done')) suggestedStage = 4;
    else if (ph1Done || computedSteps.some(s => s.phase === 2 && s.status === 'done')) suggestedStage = 3;
    else if (ph0Done || computedSteps.some(s => s.phase === 1 && s.status === 'done')) suggestedStage = 2;

    // Gate evaluations
    const proposalAcceptedDone = computedSteps.some(s => s.id === 'discovery_completed' && s.status === 'done');
    const contractSignedDone = computedSteps.some(s => s.id === 'agreement_signed' && s.status === 'done');
    const designGateActiveDone = computedSteps.some(s => s.id === 'design_approved' && s.status === 'done');
    const handoverCompleteDone = computedSteps.some(s => s.id === 'keys_handed_over' && s.status === 'done');

    const currentStage = projectContext.lifecycle?.stage || 1;
    const currentGates = (projectContext.lifecycle?.gates || {}) as any;

    const isAutoSyncEnabled = projectContext.autoStageCompletion !== false;
    const needsStageUpdate = isAutoSyncEnabled 
      ? suggestedStage !== currentStage 
      : suggestedStage > currentStage;
    const needsGateUpdate = 
      !!proposalAcceptedDone !== !!currentGates.proposalAccepted?.done ||
      !!contractSignedDone !== !!currentGates.contractSigned?.done ||
      !!designGateActiveDone !== !!currentGates.designGateActive?.done ||
      !!handoverCompleteDone !== !!currentGates.handoverComplete?.done;

    if (needsStageUpdate || needsGateUpdate) {
      const now = Date.now();
      
       const getLegacyStatusFromStage = (stage: number): string => {
        switch (stage) {
          case 1: return 'lead';
          case 2: return 'won';
          case 3: return 'won';
          case 4: return 'won';
          case 5: return 'execution';
          case 6: return 'execution';
          case 7: return 'completed';
          default: return 'lead';
        }
      };

      const updatedGates = {
        proposalAccepted: {
          done: proposalAcceptedDone,
          at: currentGates.proposalAccepted?.at || (proposalAcceptedDone ? now : null),
          reference: currentGates.proposalAccepted?.reference || (proposalAcceptedDone ? 'auto-sync-journey' : null)
        },
        contractSigned: {
          done: contractSignedDone,
          at: currentGates.contractSigned?.at || (contractSignedDone ? now : null),
          reference: currentGates.contractSigned?.reference || (contractSignedDone ? 'auto-sync-journey' : null)
        },
        designGateActive: {
          done: designGateActiveDone,
          at: currentGates.designGateActive?.at || (designGateActiveDone ? now : null),
          reference: currentGates.designGateActive?.reference || (designGateActiveDone ? 'auto-sync-journey' : null)
        },
        handoverComplete: {
          done: handoverCompleteDone,
          at: currentGates.handoverComplete?.at || (handoverCompleteDone ? now : null),
          reference: currentGates.handoverComplete?.reference || (handoverCompleteDone ? 'auto-sync-journey' : null)
        }
      };

      const finalStage = needsStageUpdate ? suggestedStage : currentStage;

      const updatedLifecycle = {
        ...projectContext.lifecycle,
        stage: finalStage as any,
        subState: currentStage !== finalStage ? `Entered Stage ${finalStage}` : (projectContext.lifecycle?.subState || `Stage ${currentStage}`),
        enteredStageAt: currentStage !== finalStage ? now : (projectContext.lifecycle?.enteredStageAt || now),
        gates: updatedGates,
        updatedAt: now,
        updatedBy: currentUserAuth?.uid || 'system'
      };

      // 1. Update React state immediately
      if (setProjectContext) {
        setProjectContext((prev) => {
          if (!prev) return null;
          const prevStage = prev.lifecycle?.stage || 1;
          const prevGates = (prev.lifecycle?.gates || {}) as any;
          const isGateEqual = (g1: any, g2: any) => {
            return (!g1 && !g2) || (!!g1?.done === !!g2?.done && g1?.reference === g2?.reference);
          };
          const isSummaryEqual = prev.journeySummary?.pct === overall.pct && prev.journeySummary?.done === overall.done;
          if (
            prevStage === finalStage &&
            isGateEqual(prevGates.proposalAccepted, updatedGates.proposalAccepted) &&
            isGateEqual(prevGates.contractSigned, updatedGates.contractSigned) &&
            isGateEqual(prevGates.designGateActive, updatedGates.designGateActive) &&
            isGateEqual(prevGates.handoverComplete, updatedGates.handoverComplete) &&
            isSummaryEqual
          ) {
            return prev;
          }
          return {
            ...prev,
            status: getLegacyStatusFromStage(finalStage) as any,
            currentStage: finalStage,
            lifecycle: updatedLifecycle,
            journeySummary: {
              done: overall.done,
              total: overall.total,
              pct: overall.pct,
              active: activeSteps.length,
              phaseProgress,
            }
          };
        });
      }

      // 2. Write to Firestore
      const updatePayload = {
        status: getLegacyStatusFromStage(finalStage),
        currentStage: finalStage,
        'context.status': getLegacyStatusFromStage(finalStage),
        'context.lifecycle': updatedLifecycle,
        'context.journeySummary': {
          done: overall.done,
          total: overall.total,
          pct: overall.pct,
          active: activeSteps.length,
          phaseProgress,
        }
      };

      if (db) {
        updateDoc(doc(db, 'projects', projectId), updatePayload)
          .then(() => {
            console.log(`[Journey Engine] Auto-synced Project Stage and Gates: Stage ${suggestedStage}`);
          })
          .catch(console.error);
      }
    } else {
      // Sync journeySummary to React state if different
      if (setProjectContext) {
        setProjectContext((prev) => {
          if (!prev) return prev;
          if (
            prev.journeySummary?.pct === overall.pct &&
            prev.journeySummary?.done === overall.done &&
            prev.journeySummary?.total === overall.total
          ) {
            return prev;
          }
          return {
            ...prev,
            journeySummary: {
              done: overall.done,
              total: overall.total,
              pct: overall.pct,
              active: activeSteps.length,
              phaseProgress,
            }
          };
        });
      }

      // Debounced Journey Summary Save to Project Document
      if (db) {
        const handler = setTimeout(() => {
          setDoc(
            doc(db, 'projects', projectId),
            {
              'context.journeySummary': {
                done: overall.done,
                total: overall.total,
                pct: overall.pct,
                active: activeSteps.length,
                phaseProgress,
              },
            },
            { merge: true }
          ).catch(console.error);
        }, 2000);
        return () => clearTimeout(handler);
      }
    }
  }, [overall.done, overall.total, overall.pct, activeSteps.length, projectId, loading, computedSteps, phaseProgress, projectContext?.journeySummary?.pct, projectContext?.journeySummary?.done, setProjectContext, currentUserAuth]);

  // Action: Mark Step Done
  const markStepDone = useCallback(async (stepId: string, note?: string) => {
    // Optimistic local update
    setManualSteps((prev) => ({
      ...prev,
      [stepId]: {
        id: stepId,
        status: 'done',
        completedAt: Timestamp.now(),
        completedBy: currentUserAuth?.uid || null,
        completedByName: currentUserAuth?.displayName || null,
        note: note || null,
      }
    }));

    if (!projectId || !db) return;
    await setDoc(
      doc(db, `projects/${projectId}/journeySteps/${stepId}`),
      {
        status: 'done',
        completedAt: Timestamp.now(),
        completedBy: currentUserAuth?.uid || null,
        completedByName: currentUserAuth?.displayName || null,
        note: note || null,
      },
      { merge: true }
    );
  }, [projectId, currentUserAuth]);

  // Action: Mark Step Pending
  const markStepPending = useCallback(async (stepId: string) => {
    // Optimistic local update
    setManualSteps((prev) => ({
      ...prev,
      [stepId]: {
        id: stepId,
        status: 'pending',
        completedAt: null,
        completedBy: null,
        completedByName: null,
      }
    }));

    if (!projectId || !db) return;
    await setDoc(
      doc(db, `projects/${projectId}/journeySteps/${stepId}`),
      {
        status: 'pending',
        completedAt: null,
        completedBy: null,
        completedByName: null,
      },
      { merge: true }
    );
  }, [projectId]);

  const value = useMemo(() => ({
    steps: computedSteps,
    stepsByPhase,
    phaseProgress,
    overall,
    activeSteps,
    nextStep,
    loading,
    markStepDone,
    markStepPending,
  }), [computedSteps, stepsByPhase, phaseProgress, overall, activeSteps, nextStep, loading, markStepDone, markStepPending]);

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}
