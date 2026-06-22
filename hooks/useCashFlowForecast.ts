import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebaseClient';

export interface CashFlowItem {
    id: string;
    projectId: string;
    projectName: string;
    clientName: string;
    clientPhone: string;
    amount: number;
    status: string;
    milestoneLabel: string;
    daysOverdue?: number;
    expectedDate?: string | null; // ISO string
    lastReminderAt?: any;
    reminderCount?: number;
}

export interface CashFlowForecast {
    monthlyForecast: { month: string; label: string; total: number; items: CashFlowItem[] }[];
    overdueTotal: number;
    overdueItems: CashFlowItem[];
    unscheduledTotal: number;
    unscheduledItems: CashFlowItem[];
    next30DaysTotal: number;
    next90DaysTotal: number;
    currentMonthTotal: number;
    loading: boolean;
    error: any;
}

// In-memory cache for simplicity
const CACHE: Record<string, { data: CashFlowForecast, timestamp: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

export function useCashFlowForecast(studioId: string | null | undefined) {
    const [forecast, setForecast] = useState<CashFlowForecast>({
        monthlyForecast: [],
        overdueTotal: 0,
        overdueItems: [],
        unscheduledTotal: 0,
        unscheduledItems: [],
        next30DaysTotal: 0,
        next90DaysTotal: 0,
        currentMonthTotal: 0,
        loading: true,
        error: null,
    });

    const fetchForecast = useCallback(async (bypassCache = false) => {
        if (!studioId) return;

        if (!bypassCache && CACHE[studioId] && (Date.now() - CACHE[studioId].timestamp) < CACHE_TTL_MS) {
            setForecast({ ...CACHE[studioId].data, loading: false });
            return;
        }

        setForecast(prev => ({ ...prev, loading: true }));

        try {
            const { db: dbService } = await import('../services/dbService');
            const projects = await dbService.getProjects();

            let allItems: CashFlowItem[] = [];

            const now = new Date();
            const sixMonthsFromNow = new Date();
            sixMonthsFromNow.setMonth(now.getMonth() + 6);

            const projectPromises = projects.map(async (projectData) => {
                const projectId = projectData.id;
                
                // Get timeline phases from subcollection to map expected dates
                const timelineRef = collection(db, `studios/${studioId}/projects/${projectId}/timelinePhases`);
                const timelineSnap = await getDocs(timelineRef);
                const timelineMap: Record<number, string> = {};
                // We'll also build a text-based map to fuzzy match "unlocks" string from milestones
                const timelineTextMap: Record<string, string> = {};
                
                timelineSnap.docs.forEach(td => {
                    const tData = td.data();
                    if (tData.stepNumber && tData.endDate) {
                        timelineMap[tData.stepNumber] = tData.endDate;
                    }
                    if (tData.name && tData.endDate) {
                        timelineTextMap[tData.name.toLowerCase()] = tData.endDate;
                    }
                });

                // Fetch real payment requests (legacy/automated)
                const paymentRequestsRef = collection(db, `studios/${studioId}/projects/${projectId}/paymentRequests`);
                const paymentsSnap = await getDocs(paymentRequestsRef);

                paymentsSnap.docs.forEach(payDoc => {
                    const payData = payDoc.data();
                    
                    if (payData.status !== 'pending' && payData.status !== 'overdue') {
                        return; // Ignore received or drafted
                    }

                    let expectedDate: string | null = null;
                    if (payData.triggeredByStepNumber && timelineMap[payData.triggeredByStepNumber]) {
                        expectedDate = timelineMap[payData.triggeredByStepNumber];
                    } else if (payData.triggeredAt) {
                        let triggeredDate = new Date(payData.triggeredAt);
                        if (payData.triggeredAt.toDate) {
                            triggeredDate = payData.triggeredAt.toDate();
                        }
                        triggeredDate.setDate(triggeredDate.getDate() + 7);
                        expectedDate = triggeredDate.toISOString();
                    }

                    if (expectedDate && new Date(expectedDate) > sixMonthsFromNow) {
                        return; // Exclude beyond 6 months
                    }

                    let daysOverdue = 0;
                    if (payData.status === 'overdue' && expectedDate) {
                         const expDate = new Date(expectedDate);
                         if (now > expDate) {
                             daysOverdue = Math.floor((now.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24));
                         } else if (payData.overdueAt) {
                             // fallback
                             const overdueDate = payData.overdueAt.toDate ? payData.overdueAt.toDate() : new Date(payData.overdueAt);
                             daysOverdue = Math.floor((now.getTime() - overdueDate.getTime()) / (1000 * 60 * 60 * 24));
                         }
                    }

                    allItems.push({
                        id: payDoc.id,
                        projectId,
                        projectName: projectData.context?.name || 'Unknown Project',
                        clientName: projectData.context?.clientName || 'Client',
                        clientPhone: projectData.context?.clientPhone || '',
                        amount: payData.amount || 0,
                        status: payData.status,
                        milestoneLabel: payData.milestoneLabel || 'Payment Request',
                        expectedDate,
                        daysOverdue,
                        lastReminderAt: payData.lastReminderAt,
                        reminderCount: payData.reminderCount
                    });
                });

                // Fetch milestones from Payment Calculator context
                const paymentMilestones: any[] = projectData.context?.paymentMilestones || [];
                const financials: any = projectData.context?.financials || {};
                
                // Need original base amounts to calculate
                let totalProjectValue = 0;
                let activeTier = null;
                if (projectData.activeTierId && projectData.tiers) {
                    activeTier = projectData.tiers.find((t: any) => t.id === projectData.activeTierId);
                    if (activeTier) totalProjectValue = activeTier.summary?.totalSell || 0;
                } else if (projectData.tiers && projectData.tiers.length > 0) {
                    activeTier = projectData.tiers[0];
                    totalProjectValue = activeTier.summary?.totalSell || 0;
                }

                // Get split values if possible
                const originalNetDesign = activeTier?.summary?.totalDesign || 0;
                const originalNetExecution = activeTier?.summary?.totalExecution || 0;

                paymentMilestones.forEach(m => {
                    // Include 'invoiced' as pending since it blocks execution until 'paid'
                    if (m.status === 'paid') return;
                    
                    const isOverdue = m.status === 'overdue';
                    
                    // Simple text-based matching for unlocks -> timeline date
                    let expectedDate: string | null = null;
                    if (m.unlocks) {
                        const unlockText = m.unlocks.toLowerCase();
                        for (const [phaseName, endDate] of Object.entries(timelineTextMap)) {
                            if (unlockText.includes(phaseName) || phaseName.includes(unlockText)) {
                                expectedDate = endDate;
                                break;
                            }
                        }
                    }

                    if (m.invoiceDate && !expectedDate) {
                        expectedDate = m.invoiceDate; // fallback to invoice date
                    }

                    // Calculate amount using lockedTaxableBase or approximate
                    const baseAmount = m.type === 'execution' ? (financials.approvedExecutionValue || originalNetExecution) : (financials.approvedDesignValue || originalNetDesign);
                    const origBase = m.type === 'execution' ? originalNetExecution : originalNetDesign;
                    
                    let amount = 0;
                    if (m.status === 'invoiced') {
                        amount = (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                    } else {
                        amount = baseAmount * (m.percentage / 100);
                    }

                    if (amount <= 0) return; // Skip zero-value gates

                    // For now, exclude beyond 6 months if we have a date
                    if (expectedDate && new Date(expectedDate) > sixMonthsFromNow) {
                        return; 
                    }

                    let daysOverdue = 0;
                    if (m.invoiceDate) {
                        const invDate = new Date(m.invoiceDate);
                        if (now > invDate) {
                            // Assume payment due in 7 days after invoice
                            const dueDate = new Date(invDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                            if (now > dueDate) {
                                daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                            }
                        }
                    }

                    allItems.push({
                        id: `ms_${projectId}_${m.id}`,
                        projectId,
                        projectName: projectData.context?.name || 'Unknown Project',
                        clientName: projectData.context?.clientName || 'Client',
                        clientPhone: projectData.context?.clientPhone || '',
                        amount,
                        status: daysOverdue > 0 ? 'overdue' : 'pending',
                        milestoneLabel: m.name || 'Milestone',
                        expectedDate,
                        daysOverdue,
                        lastReminderAt: null,
                        reminderCount: 0
                    });
                });
            });

            await Promise.all(projectPromises);

            const overdueItems = allItems.filter(i => i.status === 'overdue');
            const overdueTotal = overdueItems.reduce((sum, item) => sum + item.amount, 0);

            const unscheduledItems = allItems.filter(i => !i.expectedDate);
            const unscheduledTotal = unscheduledItems.reduce((sum, item) => sum + item.amount, 0);

            const scheduledItems = allItems.filter(i => i.expectedDate);
            
            // Group by month
            const monthlyMap: Record<string, { month: string; label: string; total: number; items: CashFlowItem[] }> = {};
            
            const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            const next90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
            
            let next30DaysTotal = overdueTotal; // overdue is also expected immediately
            let next90DaysTotal = overdueTotal;
            let currentMonthTotal = overdueTotal;

            const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            scheduledItems.forEach(item => {
                const ed = new Date(item.expectedDate!);
                const monthKey = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}`;
                const label = ed.toLocaleString('default', { month: 'short', year: 'numeric' });

                if (ed <= next30Days) next30DaysTotal += item.amount;
                if (ed <= next90Days) next90DaysTotal += item.amount;
                if (monthKey === currentMonthKey) currentMonthTotal += item.amount;

                if (!monthlyMap[monthKey]) {
                    monthlyMap[monthKey] = { month: monthKey, label, total: 0, items: [] };
                }
                
                monthlyMap[monthKey].total += item.amount;
                monthlyMap[monthKey].items.push(item);
            });

            const monthlyForecast = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

            const result: CashFlowForecast = {
                monthlyForecast,
                overdueTotal,
                overdueItems,
                unscheduledTotal,
                unscheduledItems,
                next30DaysTotal,
                next90DaysTotal,
                currentMonthTotal,
                loading: false,
                error: null,
            };

            CACHE[studioId] = { data: result, timestamp: Date.now() };
            setForecast(result);

        } catch (error) {
            console.error("Error fetching cash flow forecast:", error);
            setForecast(prev => ({ ...prev, loading: false, error }));
        }
    }, [studioId]);

    useEffect(() => {
        fetchForecast();
    }, [fetchForecast]);

    return { ...forecast, refresh: () => fetchForecast(true) };
}
