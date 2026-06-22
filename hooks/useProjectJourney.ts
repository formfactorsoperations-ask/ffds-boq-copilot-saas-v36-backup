import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../services/firebaseClient';
import { collection, doc, onSnapshot, updateDoc, setDoc, writeBatch, Timestamp, getDocs } from 'firebase/firestore';
import { JOURNEY_STEPS, PHASES, JourneyStepDef } from '../constants/journeyConstants';
import { ProjectContext, CommunicationLogItem, PaymentMilestone, TermsDocket, SOFItem, RevisionAction, ManualJourneyStep } from '../types';
import { useOrg } from '../contexts/OrgContext';

export interface StepWithStatus extends JourneyStepDef {
  status: 'done' | 'active' | 'pending' | 'locked';
  completedAt: Date | null;
  completedByName: string | null;
  isAutoDerived: boolean;
}

export function useProjectJourney(projectId: string, projectContext: ProjectContext | null) {
  const { currentUserAuth } = useOrg();
  const [manualSteps, setManualSteps] = useState<Record<string, ManualJourneyStep>>({});
  const [commsLog, setCommsLog] = useState<Record<string, CommunicationLogItem>>({});
  const [termsDockets, setTermsDockets] = useState<TermsDocket[]>([]);
  const [revisions, setRevisions] = useState<RevisionAction[]>([]);
  const [loading, setLoading] = useState(true);

  // Load Subcollections
  useEffect(() => {
    if (!projectId || !db) return;
    
    // We reuse existing listeners ideally, but subcollections might not be in projectContext except some.
    // Payment schedules are in projectContext for us. Revisions are context.boqRevisions.
    setRevisions(projectContext?.boqRevisions || []);
    setTermsDockets(projectContext?.termsDockets || []);
    
    // Comms Log
    const unsubComms = onSnapshot(collection(db, `projects/${projectId}/communicationLog`), (snap) => {
        const logs: Record<string, CommunicationLogItem> = {};
        snap.docs.forEach(d => {
            const data = d.data() as CommunicationLogItem;
            logs[data.key] = data;
        });
        setCommsLog(logs);
    });

    // Manual Journey Steps
    const unsubJourney = onSnapshot(collection(db, `projects/${projectId}/journeySteps`), (snap) => {
        const steps: Record<string, ManualJourneyStep> = {};
        snap.docs.forEach(d => {
            steps[d.id] = d.data() as ManualJourneyStep;
        });
        setManualSteps(steps);
        setLoading(false);
    });

    return () => {
        unsubComms();
        unsubJourney();
    };
  }, [projectId, projectContext]);

  const evaluateAutoStep = useCallback((step: JourneyStepDef): boolean => {
    if (!projectContext) return false;
    
    // Short circuit rules evaluation
    switch (step.id) {
        case 'terms_docket_acknowledged':
            return termsDockets.some(d => d.status === 'acknowledged');
            
        case 'brief_frozen':
            return !!projectContext.briefFrozenAt; 
            
        case 'space_planning_presented':
            return commsLog['space_planning_review']?.status === 'sent';
            
        case 'visuals_3d_shared':
            return commsLog['3d_visuals_review']?.status === 'sent';
            
        case 'revisions_incorporated':
            return revisions.length > 0 || commsLog['revision_acknowledged']?.status === 'sent';
            
        case 'design_approved':
            return !!projectContext.designApprovedAt;
            
        case 'boq_shared':
            return commsLog['design_approval_boq']?.status === 'sent';
            
        case 'payment_schedule_sent':
            return commsLog['payment_schedule_sent']?.status === 'sent';
            
        case 'agreement_signed':
            return commsLog['contract_sent']?.status === 'sent';
            
        case 'design_fee_received':
            return (projectContext.paymentMilestones || []).some(m => m.type === 'design' && m.status === 'paid');
            
        case 'onboarding_kit_sent':
            return commsLog['onboarding_kit_sent']?.status === 'sent';
            
        case 'exec_advance_1_received':{
            const execMilestones = (projectContext.paymentMilestones || []).filter(m => m.type === 'execution');
            return execMilestones.length > 0 && execMilestones[0].status === 'paid';
        }
        case 'exec_start_notified':
            return commsLog['execution_start']?.status === 'sent';
            
        case 'exec_advance_2_received':{
            const execMilestones2 = (projectContext.paymentMilestones || []).filter(m => m.type === 'execution');
            return execMilestones2.length > 1 && execMilestones2[1].status === 'paid';
        }
        case 'selections_locked': {
            const materialSelections = projectContext.materialSelections || [];
            return materialSelections.length > 0 && materialSelections.every(i => i.status === 'locked' || i.status === 'ordered');
        }
        case 'exec_advance_3_requested':{
            const execMilestones3 = (projectContext.paymentMilestones || []).filter(m => m.type === 'execution');
            return execMilestones3.length > 2 && (execMilestones3[2].status === 'invoiced' || execMilestones3[2].status === 'paid');
        }
        case 'site_update_shared':
            return commsLog['painting_stage_start']?.status === 'sent';
            
        case 'handover_advance_received':
            return (projectContext.paymentMilestones || []).some(m => m.isHandoverAdvance && m.status === 'paid');
            
        case 'handover_dossier_sent':
            return commsLog['handover_warranty']?.status === 'sent';
            
        case 'warranty_activated':{
            const allPaid = (projectContext.paymentMilestones || []).length > 0 && (projectContext.paymentMilestones || []).every(m => m.status === 'paid');
            return !!projectContext.handoverDate && allPaid;
        }
        default:
            return false;
    }
  }, [projectContext, termsDockets, commsLog, revisions]);

  const computedSteps = useMemo(() => {
    const steps: StepWithStatus[] = JOURNEY_STEPS.map(s => ({
        ...s,
        status: 'pending',
        completedAt: null,
        completedByName: null,
        isAutoDerived: s.statusSource === 'auto'
    }));

    let activeSetInPhase: boolean[] = [false, false, false, false, false, false];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // 1. Check prerequisites
        let isLocked = false;
        for (const prereqId of step.prerequisiteIds) {
            const prereq = steps.find(s => s.id === prereqId);
            if (!prereq || prereq.status !== 'done') {
                isLocked = true;
                break;
            }
        }

        if (isLocked) {
            step.status = 'locked';
            continue;
        }

        // 2. Evaluate own status
        const manualState = manualSteps[step.id];
        const isManuallyDone = manualState && manualState.status === 'done';

        if (isManuallyDone) {
            step.status = 'done';
            step.completedAt = manualState.completedAt ? manualState.completedAt.toDate() : null;
            step.completedByName = manualState.completedByName;
        } else if (step.statusSource === 'auto') {
            const isDone = evaluateAutoStep(step);
            if (isDone) {
                step.status = 'done';
            } else {
                if (!activeSetInPhase[step.phase]) {
                    step.status = 'active';
                    activeSetInPhase[step.phase] = true;
                } else {
                    step.status = 'pending';
                }
            }
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
  }, [evaluateAutoStep, manualSteps]);

  const phaseProgress = useMemo(() => {
      return PHASES.map((p, i) => {
          const phaseSteps = computedSteps.filter(s => s.phase === i);
          const done = phaseSteps.filter(s => s.status === 'done').length;
          return { done, total: phaseSteps.length, pct: phaseSteps.length ? Math.round((done / phaseSteps.length) * 100) : 0 };
      });
  }, [computedSteps]);

  const overall = useMemo(() => {
      const done = computedSteps.filter(s => s.status === 'done').length;
      return { done, total: computedSteps.length, pct: Math.round((done / computedSteps.length) * 100) };
  }, [computedSteps]);

  const stepsByPhase = useMemo(() => {
      return computedSteps.reduce((acc, step) => {
          if (!acc[step.phase]) acc[step.phase] = [];
          acc[step.phase].push(step);
          return acc;
      }, {} as Record<number, StepWithStatus[]>);
  }, [computedSteps]);

  const activeSteps = useMemo(() => computedSteps.filter(s => s.status === 'active'), [computedSteps]);
  const nextStep = useMemo(() => computedSteps.find(s => s.status === 'pending' || s.status === 'active') || null, [computedSteps]);

  // Debounced Journey Summary Save to Project Document
  useEffect(() => {
      if (!projectId || !db || loading) return;
      const handler = setTimeout(() => {
          setDoc(doc(db, 'projects', projectId), {
              'context.journeySummary': {
                  done: overall.done,
                  total: overall.total,
                  pct: overall.pct,
                  active: activeSteps.length,
                  phaseProgress
              }
          }, { merge: true }).catch(console.error);
      }, 2000);
      return () => clearTimeout(handler);
  }, [overall.done, activeSteps.length, projectId, loading]);

  const markStepDone = async (stepId: string, note?: string) => {
      if (!projectId || !db) return;
      await setDoc(doc(db, `projects/${projectId}/journeySteps/${stepId}`), {
          status: 'done',
          completedAt: Timestamp.now(),
          completedBy: currentUserAuth?.uid || null,
          completedByName: currentUserAuth?.displayName || null,
          note: note || null
      }, { merge: true });
  };

  const markStepPending = async (stepId: string) => {
      if (!projectId || !db) return;
      await setDoc(doc(db, `projects/${projectId}/journeySteps/${stepId}`), {
          status: 'pending',
          completedAt: null,
          completedBy: null,
          completedByName: null
      }, { merge: true });
  };

  return {
    stepsByPhase,
    phaseProgress,
    overall,
    activeSteps,
    nextStep,
    loading,
    markStepDone,
    markStepPending
  };
}
