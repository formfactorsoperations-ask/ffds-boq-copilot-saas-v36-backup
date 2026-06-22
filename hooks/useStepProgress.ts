import { useState, useEffect } from 'react';
import { doc, collection, setDoc, getDoc, getDocs, onSnapshot, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db as firestoreDb } from '../services/firebaseClient';
import { StudioSettings } from './useStudioSettings';

export type StepStatus = 'not_started' | 'in_progress' | 'completed';

export interface DeliverableProgress {
  id: string; 
  label: string;
  checked: boolean;
  checkedBy?: string; 
  fileUrl?: string | null;
  fileName?: string | null;
}

export interface StepProgress {
  stepNumber: number;
  title: string;
  status: StepStatus;
  clientSignoffRequired: boolean;
  clientSignoffReceived: boolean;
  clientSignoffAt?: string | null;
  deliverables: DeliverableProgress[];
  completedAt?: string | null;
  completedBy?: string | null;
}

export async function initProjectStepProgress(projectId: string, studioId: string, studioSettings: StudioSettings) {
    if (!firestoreDb) return;
    try {
        const batch = writeBatch(firestoreDb);
        const stepsRef = collection(firestoreDb, `studios/${studioId}/projects/${projectId}/stepProgress`);
        
        if (!studioSettings.designProcess || !studioSettings.designProcess.steps) return;
        
        studioSettings.designProcess.steps.forEach((step) => {
            const docRef = doc(stepsRef, String(step.stepNumber));
            const deliverables: DeliverableProgress[] = step.deliverables.map((d, i) => ({
                id: `del_${i}`,
                label: d,
                checked: false,
                fileUrl: null,
                fileName: null,
            }));
            
            const stepData: StepProgress = {
                stepNumber: step.stepNumber,
                title: step.title,
                status: step.stepNumber === 1 ? 'in_progress' : 'not_started',
                clientSignoffRequired: !!step.clientSignoffRequired,
                clientSignoffReceived: false,
                clientSignoffAt: null,
                deliverables,
                completedAt: null,
                completedBy: null,
            };
            
            batch.set(docRef, stepData);
        });
        
        await batch.commit();
        console.log(`Initialized step progress for project ${projectId}`);
    } catch (e) {
        console.error("Failed to initialize step progress:", e);
    }
}

export function useStepProgress(projectId: string, studioId: string) {
    const [steps, setSteps] = useState<StepProgress[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!projectId?.trim() || !studioId?.trim() || !firestoreDb) {
            setLoading(false);
            return;
        }

        const stepsRef = collection(firestoreDb, `studios/${studioId}/projects/${projectId}/stepProgress`);
        const unsubscribe = onSnapshot(stepsRef, (snapshot) => {
            const loadedSteps: StepProgress[] = [];
            snapshot.forEach((doc) => {
                loadedSteps.push(doc.data() as StepProgress);
            });
            loadedSteps.sort((a, b) => a.stepNumber - b.stepNumber);
            setSteps(loadedSteps);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching step progress:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [projectId, studioId]);

    const updateDeliverable = async (stepNumber: number, deliverableId: string, updates: Partial<DeliverableProgress>) => {
        if (!firestoreDb) return;
        try {
            const stepDocRef = doc(firestoreDb, `studios/${studioId}/projects/${projectId}/stepProgress`, String(stepNumber));
            const step = steps.find(s => s.stepNumber === stepNumber);
            if (!step) return;

            const updatedDeliverables = step.deliverables.map(del => {
                if (del.id === deliverableId) {
                    return { ...del, ...updates };
                }
                return del;
            });

            await setDoc(stepDocRef, { deliverables: updatedDeliverables }, { merge: true });
        } catch (err) {
            console.error("Error updating deliverable:", err);
        }
    };

    const updateClientSignoff = async (stepNumber: number, clientSignoffReceived: boolean) => {
        if (!firestoreDb) return;
        try {
            const stepDocRef = doc(firestoreDb, `studios/${studioId}/projects/${projectId}/stepProgress`, String(stepNumber));
            await setDoc(stepDocRef, { 
                clientSignoffReceived,
                clientSignoffAt: clientSignoffReceived ? new Date().toISOString() : null
            }, { merge: true });
        } catch (err) {
            console.error("Error updating client signoff:", err);
        }
    }

    const markStepComplete = async (stepNumber: number, userEmail?: string) => {
        if (!firestoreDb) return;
        try {
            const step = steps.find(s => s.stepNumber === stepNumber);
            if (!step) return;

            const allDeliverablesChecked = step.deliverables.every(d => d.checked);
            if (!allDeliverablesChecked) {
                console.warn("Cannot complete step: not all deliverables are checked.");
                return;
            }

            if (step.clientSignoffRequired && !step.clientSignoffReceived) {
                console.warn("Cannot complete step: client signoff required but not received.");
                return;
            }

            // Determine if a milestone trigger is configured
            const projectRef = doc(firestoreDb, `studios/${studioId}/projects`, projectId);
            const settingsRef = doc(firestoreDb, `studios/${studioId}/settings`, 'main');
            const batch = writeBatch(firestoreDb);

            const [projectSnap, settingsSnap] = await Promise.all([
                 getDoc(projectRef),
                 getDoc(settingsRef)
            ]);

            let activePaymentRequestId = null;

            if (projectSnap.exists() && settingsSnap.exists()) {
                 const projectData = projectSnap.data();
                 const settingsData = settingsSnap.data() as StudioSettings;

                 const stepConfig = settingsData.designProcess?.steps?.find(s => s.stepNumber === stepNumber);
                 if (stepConfig && stepConfig.triggersMilestoneLabel) {
                      // Check if we already created a payment request for this step to maintain idempotency
                      const paymentRequestsRef = collection(firestoreDb, `studios/${studioId}/projects/${projectId}/paymentRequests`);
                      const existingRequestsSnap = await getDocs(paymentRequestsRef);
                      const alreadyTriggered = existingRequestsSnap.docs.some(d => d.data().triggeredByStepNumber === stepNumber);

                      if (!alreadyTriggered) {
                          const milestone = settingsData.paymentMilestones?.milestones?.find(m => m.label === stepConfig.triggersMilestoneLabel);
                          if (milestone) {
                              const contractValue = projectData.context?.financials?.totalContractValue || projectData.financials?.totalContractValue || null;
                              const amount = contractValue ? (milestone.percent / 100) * contractValue : null;

                              const newPaymentRequestRef = doc(paymentRequestsRef);
                              batch.set(newPaymentRequestRef, {
                                  milestoneLabel: milestone.label,
                                  milestonePercent: milestone.percent,
                                  amount: amount,
                                  triggeredByStepNumber: stepNumber,
                                  triggeredAt: serverTimestamp(),
                                  status: 'pending'
                              });

                              activePaymentRequestId = newPaymentRequestRef.id;
                              batch.update(projectRef, { activePaymentRequest: activePaymentRequestId });
                          }
                      } else {
                          console.log(`Payment request for step ${stepNumber} already exists. Skipping.`);
                      }
                 }
            }

            const stepDocRef = doc(firestoreDb, `studios/${studioId}/projects/${projectId}/stepProgress`, String(stepNumber));
            
            batch.set(stepDocRef, {
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: userEmail || 'Unknown',
            }, { merge: true });

            const nextStep = steps.find(s => s.stepNumber === stepNumber + 1);
            if (nextStep && nextStep.status === 'not_started') {
                 const nextStepRef = doc(firestoreDb, `studios/${studioId}/projects/${projectId}/stepProgress`, String(stepNumber + 1));
                 batch.set(nextStepRef, { status: 'in_progress' }, { merge: true });
            } else if (!nextStep) {
                 // Final step completed, update project status
                 if (!activePaymentRequestId) {
                    batch.update(projectRef, { 'context.status': 'completed' });
                 } else {
                    batch.update(projectRef, { 'context.status': 'completed', activePaymentRequest: activePaymentRequestId });
                 }
            }

            await batch.commit();

            console.log(`Step ${stepNumber} complete.`);

        } catch (err) {
            console.error("Error marking step complete:", err);
        }
    };

    return { steps, updateDeliverable, updateClientSignoff, markStepComplete, loading };
}
