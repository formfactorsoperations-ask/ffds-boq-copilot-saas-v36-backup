import { useState, useEffect } from 'react';
import { doc, collection, onSnapshot, query, where, Timestamp, getDocs, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { db as firestoreDb } from '../services/firebaseClient';
import { StudioSettings } from './useStudioSettings';

export interface PaymentRequest {
  id: string;
  milestoneLabel: string;
  milestonePercent: number;
  amount: number | null;
  triggeredByStepNumber: number;
  triggeredAt: any;
  status: 'pending' | 'overdue' | 'received';
  overrideReason?: string;
  receivedAt?: string;
  receivedAmount?: number;
  overdueAt?: any;
  reminderCount?: number;
  lastReminderAt?: any;
  reminderLog?: { sentAt: string, sentBy: string, messagePreview: string }[];
  escalationLevel?: 0 | 1 | 2 | 3;
  autoReminderLogged?: boolean;
}

export function usePaymentRequests(projectId: string, studioId: string) {
    const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!projectId?.trim() || !studioId?.trim() || !firestoreDb) {
            setLoading(false);
            return;
        }

        const prRef = collection(firestoreDb, `studios/${studioId}/projects/${projectId}/paymentRequests`);
        const unsubscribe = onSnapshot(prRef, (snapshot) => {
            const reqs: PaymentRequest[] = [];
            snapshot.forEach((doc) => {
                reqs.push({ id: doc.id, ...doc.data() } as PaymentRequest);
            });
            // sort by trigger time
            reqs.sort((a, b) => b.triggeredByStepNumber - a.triggeredByStepNumber);
            setPaymentRequests(reqs);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching payment requests:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [projectId, studioId]);

    const activeRequest = paymentRequests.find(pr => pr.status === 'pending' || pr.status === 'overdue');

    const markAsReceived = async (reqId: string, receivedAmount: number, receivedAt: string) => {
        if (!firestoreDb || !projectId || !studioId) return;
        const reqRef = doc(firestoreDb, `studios/${studioId}/projects/${projectId}/paymentRequests`, reqId);
        const batch = writeBatch(firestoreDb);
        batch.set(reqRef, {
            status: 'received',
            receivedAmount,
            receivedAt,
        }, { merge: true });
        
        // Also clear activePaymentRequest on project
        const projectRef = doc(firestoreDb, `studios/${studioId}/projects`, projectId);
        batch.update(projectRef, { activePaymentRequest: null });
        
        await batch.commit();
    };

    const overridePaymentGate = async (reqId: string, overrideReason: string) => {
        if (!firestoreDb || !projectId || !studioId) return;
        const reqRef = doc(firestoreDb, `studios/${studioId}/projects/${projectId}/paymentRequests`, reqId);
        const batch = writeBatch(firestoreDb);
        batch.set(reqRef, {
            overrideReason
        }, { merge: true });
        
        // Clear activePaymentRequest on project so the gate opens
        const projectRef = doc(firestoreDb, `studios/${studioId}/projects`, projectId);
        batch.update(projectRef, { activePaymentRequest: null });
        
        await batch.commit();
    };

    const markReminderSent = async (reqId: string, sentBy: string, messagePreview: string) => {
        if (!firestoreDb || !projectId || !studioId) return;
        const req = paymentRequests.find(r => r.id === reqId);
        if (!req) return;
        
        const reqRef = doc(firestoreDb, `studios/${studioId}/projects/${projectId}/paymentRequests`, reqId);
        const count = (req.reminderCount || 0) + 1;
        const logEntry = {
            sentAt: new Date().toISOString(),
            sentBy,
            messagePreview
        };
        const currentLog = req.reminderLog || [];

        await setDoc(reqRef, {
            reminderCount: count,
            lastReminderAt: Timestamp.now(),
            reminderLog: [...currentLog, logEntry]
        }, { merge: true });
    };

    return { paymentRequests, activeRequest, loading, markAsReceived, overridePaymentGate, markReminderSent };
}

export function usePaymentOverdueCheck(projectId: string, studioId: string) {
    useEffect(() => {
        if (!projectId?.trim() || !studioId?.trim() || !firestoreDb) return;

        const checkOverdue = async () => {
            try {
                const settingsRef = doc(firestoreDb, `studios/${studioId}/settings`, 'main');
                const settingsSnap = await getDoc(settingsRef);
                const settings = settingsSnap.data() as StudioSettings;
                const overdueDaysThreshold = settings?.paymentMilestones?.overdueDaysThreshold || 7;

                const prRef = collection(firestoreDb, `studios/${studioId}/projects/${projectId}/paymentRequests`);
                const q = query(prRef, where('status', '==', 'pending'));
                const pendingSnaps = await getDocs(q);

                if (pendingSnaps.empty) return;

                const batch = writeBatch(firestoreDb);
                const now = new Date();
                let hasUpdates = false;

                pendingSnaps.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.triggeredAt) {
                        const triggeredDate = data.triggeredAt.toDate ? data.triggeredAt.toDate() : new Date(data.triggeredAt);
                        const diffTime = Math.abs(now.getTime() - triggeredDate.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                        
                        if (diffDays > overdueDaysThreshold) {
                            batch.update(docSnap.ref, {
                                status: 'overdue',
                                overdueAt: Timestamp.now()
                            });
                            hasUpdates = true;
                        }
                    }
                });

                if (hasUpdates) {
                    await batch.commit();
                }
            } catch (err) {
                console.error("Error checking for overdue payments:", err);
            }
        };

        checkOverdue();
        const interval = setInterval(checkOverdue, 24 * 60 * 60 * 1000); // Check every 24 hours
        return () => clearInterval(interval);
    }, [projectId, studioId]);
}
