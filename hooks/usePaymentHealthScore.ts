import { useState, useEffect } from 'react';
import { db } from '../services/firebaseClient';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

export interface PaymentHealth {
    healthStatus: 'green' | 'amber' | 'red' | 'neutral' | 'unconfigured' | 'fully_paid';
    healthRatio: number;
    completionPercent: number;
    expectedReceived: number;
    actualReceived: number;
    overdueCount: number;
    overdueAmount: number;
    outstandingAmount: number;
    loading: boolean;
    paymentMilestones?: any[];
}

export function calculateLocalPaymentHealth(paymentMilestones?: any[], legacySteps?: any[], legacyPayments?: any[]): PaymentHealth {
    let expectedReceived = 0;
    let actualReceived = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let outstandingAmount = 0;
    let completionPercent = 0;

    if (paymentMilestones && paymentMilestones.length > 0) {
        let totalMilestones = paymentMilestones.length;
        let completedMilestones = 0;

        paymentMilestones.forEach(m => {
            const baseAmount = m.lockedTaxableBase || 0;
            const rawAmount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * ((m.percentage || 0) / 100);
            const amount = rawAmount * 1.18; // Approx with GST

            if (m.status === 'paid' || m.status === 'invoiced') {
                expectedReceived += (m.percentage || 0);
            }
            if (m.status === 'paid') {
                actualReceived += (m.percentage || 0);
                completedMilestones++;
            }
            if (m.status === 'invoiced') {
                overdueCount++;
                overdueAmount += Math.round(amount);
                outstandingAmount += Math.round(amount);
            }
            if (m.status === 'pending') {
                // Next expected includes pending milestone values if their base is locked
                outstandingAmount += Math.round(amount);
            }
        });

        completionPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
    } else if (legacySteps && legacyPayments) {
        // Older projects fallback
        const totalSteps = legacySteps.length;
        const completedSteps = legacySteps.filter(s => s.status === 'completed');
        completionPercent = totalSteps > 0 ? (completedSteps.length / totalSteps) * 100 : 0;

        let hasPaymentTriggersMapped = false;

        legacyPayments.forEach((payment: any) => {
            if (payment.triggeredByStepNumber) {
                hasPaymentTriggersMapped = true;
            }
            
            const stepNumber = payment.triggeredByStepNumber;
            const step = legacySteps.find(s => s.stepNumber === stepNumber);
            
            if (step?.status === 'completed') {
                expectedReceived += (payment.milestonePercent || 0);
            }

            if (payment.status === 'received') {
                actualReceived += (payment.milestonePercent || 0);
            }

            if (payment.status === 'overdue') {
                overdueCount++;
                overdueAmount += (payment.amount || 0);
                outstandingAmount += (payment.amount || 0);
            }
            if (payment.status === 'pending') {
                outstandingAmount += (payment.amount || 0);
            }
        });

        if (legacyPayments.length === 0 || !hasPaymentTriggersMapped) {
            return {
                healthStatus: legacyPayments.length === 0 ? 'neutral' : 'unconfigured',
                healthRatio: 0,
                completionPercent,
                expectedReceived: legacyPayments.length === 0 ? 0 : expectedReceived,
                actualReceived: legacyPayments.length === 0 ? 0 : actualReceived,
                overdueCount: legacyPayments.length === 0 ? 0 : overdueCount,
                overdueAmount: legacyPayments.length === 0 ? 0 : overdueAmount,
                outstandingAmount: legacyPayments.length === 0 ? 0 : outstandingAmount,
                loading: false,
            };
        }
    } else {
        return {
            healthStatus: 'neutral',
            healthRatio: 0,
            completionPercent: 0,
            expectedReceived: 0,
            actualReceived: 0,
            overdueCount: 0,
            overdueAmount: 0,
            outstandingAmount: 0,
            loading: false,
        };
    }

    expectedReceived = Math.min(100, Math.round(expectedReceived));
    actualReceived = Math.min(100, Math.round(actualReceived));

    const healthRatio = expectedReceived > 0 ? actualReceived / expectedReceived : (actualReceived > 0 ? 1 : 0);
    
    let healthStatus: PaymentHealth['healthStatus'] = 'neutral';

    if (actualReceived >= 100 && overdueCount === 0) {
        healthStatus = 'fully_paid';
    } else if (healthRatio < 0.5 || overdueCount > 0) {
        healthStatus = 'red';
    } else if (healthRatio >= 0.5 && healthRatio !== 1 && overdueCount === 0) {
        healthStatus = 'amber';
    } else if (healthRatio >= 1.0 && overdueCount === 0) {
        healthStatus = expectedReceived === 0 && actualReceived === 0 ? 'neutral' : 'green';
    }

    return {
        healthStatus,
        healthRatio,
        completionPercent,
        expectedReceived,
        actualReceived,
        overdueCount,
        overdueAmount,
        outstandingAmount,
        loading: false,
        paymentMilestones
    };
}

export async function fetchPaymentHealthScore(projectId: string, studioId: string): Promise<PaymentHealth> {
    try {
        const projectRef = doc(db, `projects`, projectId);
        const stepProgressRef = collection(db, `studios/${studioId}/projects/${projectId}/stepProgress`);
        const paymentRequestsRef = collection(db, `studios/${studioId}/projects/${projectId}/paymentRequests`);

        const [projectSnap, stepsSnap, paymentsSnap] = await Promise.all([
            getDoc(projectRef),
            getDocs(stepProgressRef),
            getDocs(paymentRequestsRef)
        ]);

        if (!projectSnap.exists()) {
            return calculateLocalPaymentHealth();
        }
        
        let projectData = projectSnap.data();
        if (projectData.isCompressed && projectData.compressedData) {
            try {
                if (typeof window !== 'undefined' && (window as any).pako) {
                    const pako = (window as any).pako;
                    const binaryString = atob(projectData.compressedData);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    projectData = JSON.parse(pako.inflate(bytes, { to: 'string' }));
                }
            } catch (e) {
                console.warn("Failed to decompress project for payment health", e);
            }
        }
        const paymentMilestones: any[] = projectData.context?.paymentMilestones || [];

        // Older projects fallback
        const steps = stepsSnap.docs.map(d => d.data());
        const payments = paymentsSnap.docs.map(d => d.data());
        
        return calculateLocalPaymentHealth(paymentMilestones, steps, payments);
    } catch (error) {
        console.error("Error fetching payment health", error);
        throw error;
    }
}

export function usePaymentHealthScore(projectId: string | null | undefined, studioId: string | null | undefined, localMilestones?: any[]): PaymentHealth {
    const [health, setHealth] = useState<PaymentHealth>({
        healthStatus: 'neutral',
        healthRatio: 0,
        completionPercent: 0,
        expectedReceived: 0,
        actualReceived: 0,
        overdueCount: 0,
        overdueAmount: 0,
        outstandingAmount: 0,
        loading: true,
    });

    useEffect(() => {
        let mounted = true;
        const localMilestonesStr = JSON.stringify(localMilestones || []);

        if (localMilestones && localMilestones.length > 0) {
            setHealth(calculateLocalPaymentHealth(localMilestones));
            return;
        }

        if (!projectId?.trim() || !studioId?.trim()) {
            setHealth(calculateLocalPaymentHealth());
            return;
        }

        fetchPaymentHealthScore(projectId, studioId).then(res => {
            if (mounted) setHealth(res);
        }).catch(() => {
            if (mounted) setHealth(h => ({ ...h, loading: false }));
        });

        return () => { mounted = false; };
    }, [projectId, studioId, JSON.stringify(localMilestones || [])]);

    return health;
}
