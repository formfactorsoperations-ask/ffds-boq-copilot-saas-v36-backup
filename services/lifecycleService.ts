import { doc, getDoc, setDoc, collection, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from './firebaseClient';
import { ProjectContext, ProjectLifecycle } from '../types';

export type LifecycleEvent = 
    | { type: 'ADVANCE'; toStage: number }
    | { type: 'RETREAT'; toStage: number; reason: string }
    | { type: 'GATE_ACTIVATE'; gate: keyof ProjectLifecycle['gates']; reference?: string };

export class LifecycleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LifecycleError';
    }
}

export const getInitialLifecycle = (): ProjectLifecycle => ({
    stage: 1,
    subState: 'New Lead',
    enteredStageAt: Date.now(),
    gates: {
        proposalAccepted: { done: false, at: null, reference: null },
        contractSigned: { done: false, at: null, reference: null },
        designGateActive: { done: false, at: null, reference: null },
        handoverComplete: { done: false, at: null, reference: null }
    },
    updatedAt: Date.now()
});

export const advance = async (
    orgId: string, 
    projectId: string, 
    event: LifecycleEvent, 
    userId?: string, 
    userName?: string
): Promise<ProjectLifecycle> => {
    const projectRef = doc(db, `organizations/${orgId}/projects/${projectId}`);
    const feedRef = doc(collection(db, `organizations/${orgId}/projects/${projectId}/liveFeed`));
    
    return await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(projectRef);
        if (!snap.exists()) {
            throw new LifecycleError('Project not found');
        }
        
        const data = snap.data();
        let currentContext: ProjectContext = data.context || {};
        let lifecycle: ProjectLifecycle = currentContext.lifecycle || getInitialLifecycle();
        
        if (!lifecycle.gates) {
            lifecycle = getInitialLifecycle();
        }
        
        const now = Date.now();
        const clone = JSON.parse(JSON.stringify(lifecycle)) as ProjectLifecycle;
        let feedEventText = '';
        
        if (event.type === 'GATE_ACTIVATE') {
            if (clone.gates[event.gate].done) {
                 // Idempotent: gate is already active
                 return clone;
            }
            clone.gates[event.gate] = {
                done: true,
                at: now,
                reference: event.reference || null
            };
            feedEventText = `🔓 Gate activated: ${event.gate}`;
        } else if (event.type === 'ADVANCE') {
            const targetStage = event.toStage as ProjectLifecycle['stage'];
            if (targetStage === clone.stage) {
                // Idempotent: already at the target stage
                return clone;
            }
            if (targetStage < clone.stage) {
                // Idempotent: already past or at the target stage
                return clone;
            }
            
            if (targetStage >= 5) {
                if (!clone.gates.designGateActive.done) {
                    clone.gates.designGateActive = {
                        done: true,
                        at: now,
                        reference: 'auto-activated-on-advance'
                    };
                }
            }
            
            if (targetStage >= 6) {
                // Block transition to Stage 6 if the Ops Matrix (Execution progress) is 0%
                const journeySummary = currentContext.journeySummary;
                if (journeySummary) {
                    const execProgress = journeySummary.phaseProgress?.[4];
                    const execDone = execProgress?.done || 0;
                    if (execDone === 0) {
                        throw new LifecycleError(`Cannot advance to Stage 6: No operational steps completed in Execution phase (Ops Matrix progress is 0%).`);
                    }
                }
            }
            
            clone.stage = targetStage;
            clone.subState = `Entered Stage ${targetStage}`;
            clone.enteredStageAt = now;
            feedEventText = `🚀 Project advanced to Stage ${targetStage}`;
        } else if (event.type === 'RETREAT') {
            if (!event.reason || event.reason.trim().length === 0) {
                 throw new LifecycleError(`Backward transitions require a reason`);
            }
            const targetStage = event.toStage as ProjectLifecycle['stage'];
            if (targetStage >= clone.stage) {
                throw new LifecycleError(`RETREAT must go to an earlier stage`);
            }
            clone.stage = targetStage;
            clone.subState = `Retreated to Stage ${targetStage} (Reason: ${event.reason})`;
            clone.enteredStageAt = now;
            feedEventText = `⚠️ Project retreated to Stage ${targetStage}. Reason: ${event.reason}`;
        }
        
        clone.updatedAt = now;
        clone.updatedBy = userId || null;
        
        transaction.update(projectRef, {
            'context.lifecycle': clone,
            'status': getLegacyStatusFromStage(clone.stage),
            'currentStage': clone.stage
        });
        
        if (feedEventText) {
            transaction.set(feedRef, {
                type: 'system',
                text: feedEventText,
                timestamp: serverTimestamp(),
                userId: userId || null,
                userName: userName || null
            });
        }
        
        return clone;
    });
};

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
