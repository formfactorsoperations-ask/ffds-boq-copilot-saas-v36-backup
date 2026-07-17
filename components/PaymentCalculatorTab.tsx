
import React, { useState, useEffect, useMemo } from 'react';
import { ProjectContext, ProposalTier, PaymentMilestone, FullProjectData, PaymentStatus, ProjectDiscount } from '../types';
import { formatCurrency, id as generateId } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import Card from './shared/Card';
import { CalculatorIcon, ShieldCheckIcon, AlertIcon, CheckIcon, PencilIcon, ChevronDownIcon, ChevronUpIcon, DeleteIcon, PlusIcon, ScissorsIcon, ClockIcon } from './Icons';
import { useOrg } from '../contexts/OrgContext';
import { FFDS_PAYMENT_STRUCTURE_DEFAULTS } from '../services/engagementService';

interface PaymentCalculatorTabProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeTier?: ProposalTier;
    allProjects: FullProjectData[];
}

const DEFAULT_MILESTONES: PaymentMilestone[] = [
    { id: 'd1', type: 'design', name: 'Design Advance 1', percentage: 20, description: 'Retainer', unlocks: 'Commencement of Discovery & Concept Phase' },
    { id: 'd2', type: 'design', name: 'Design Advance 2', percentage: 35, description: 'Layouts', unlocks: 'Commencement of Design & 3D Visuals' },
    { id: 'd3', type: 'design', name: 'Design Advance 3', percentage: 35, description: 'GFCs', unlocks: 'Technical Drawings & BOQ Planning' },
    { id: 'd4', type: 'design', name: 'Design Final Advance', percentage: 10, description: 'Closeout', unlocks: 'Final Design Handover & Approvals' },
    { id: 'e1', type: 'execution', name: 'Execution Advance 1', percentage: 10, description: 'Start', unlocks: 'Site Mobilization & Ordering' },
    { id: 'e2', type: 'execution', name: 'Execution Advance 2', percentage: 40, description: 'Structural', unlocks: 'Civil & Core Material Procurement' },
    { id: 'e3', type: 'execution', name: 'Execution Advance 3', percentage: 40, description: 'Finishing', unlocks: 'Carpentry, Painting & Finishes' },
    { id: 'e4', type: 'execution', name: 'Execution Final Advance', percentage: 10, description: 'Handover', unlocks: 'Handover Document & Keys', isHandoverAdvance: true },
];

const PaymentCalculatorTab: React.FC<PaymentCalculatorTabProps> = ({ projectContext, setProjectContext, activeTier, allProjects = [] }) => {
    // --- STATE ---
    const { orgData } = useOrg();
    const financials = projectContext.financials || {
        initiationFeePaid: 4999,
        billablePercent: 100,
        executionGstEnabled: true,
        projectedCashValue: 0,
        taxLimitYearly: 2000000,
        goodwillDiscount: 0,
        discounts: []
    };

    const [gstRate, setGstRate] = useState<number>(projectContext.gstRate || 18);
    const [initiationFee, setInitiationFee] = useState<number>(financials.initiationFeePaid);
    const [billablePercent, setBillablePercent] = useState<number>(financials.billablePercent);
    const [executionGstEnabled, setExecutionGstEnabled] = useState<boolean>(financials.executionGstEnabled);
    const [cashLimit, setCashLimit] = useState<number>(financials.taxLimitYearly);
    
    // Discounts
    const [discounts, setDiscounts] = useState<ProjectDiscount[]>(financials.discounts || []);
    const [newDiscount, setNewDiscount] = useState<Partial<ProjectDiscount>>({
        name: '', value: 0, type: 'percentage', target: 'execution'
    });
    const [showDiscountForm, setShowDiscountForm] = useState(false);

    // Reset Confirm State
    const [isResetting, setIsResetting] = useState(false);

    // Compare Revision State
    const [compareRevision, setCompareRevision] = useState<any>(null);

    const milestones = projectContext.paymentMilestones || [];

    // Payment Schedule Logic
    const paymentSchedules = projectContext.paymentSchedules || [];
    const latestSchedule = paymentSchedules.length > 0 ? paymentSchedules.reduce((a, b) => a.version > b.version ? a : b) : null;
    const hasUnsavedScheduleChanges = latestSchedule && (
        milestones.length !== latestSchedule.advances.length ||
        milestones.some((m, i) => {
            const adv = latestSchedule.advances[i];
            if (!adv) return true;
            return m.percentage !== adv.percentage || 
                   (m.unlocks || '') !== adv.unlocks || 
                   m.name !== adv.label; 
        })
    );

    const handleGenerateSchedule = () => {
        // Contract value is sum of execution and design value
        const contractValue = taxableExecution + taxableDesign;

        // Pre-calculate design items remaining base
        const paidDesign = designMilestones.filter(m => m.status === 'paid' || m.status === 'invoiced');
        const unpaidDesign = designMilestones.filter(m => m.status !== 'paid' && m.status !== 'invoiced');
        let lockedDesignBase = 0;
        paidDesign.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                lockedDesignBase += m.fixedAmount;
            } else {
                lockedDesignBase += (m.lockedTaxableBase || taxableDesign) * (m.percentage / 100);
            }
        });
        const remainingDesignBase = taxableDesign - lockedDesignBase;

        // Pre-calculate execution items remaining base
        const paidExec = executionMilestones.filter(m => m.status === 'paid' || m.status === 'invoiced');
        const unpaidExec = executionMilestones.filter(m => m.status !== 'paid' && m.status !== 'invoiced');
        let lockedExecBase = 0;
        paidExec.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                lockedExecBase += m.fixedAmount;
            } else {
                lockedExecBase += (m.lockedTaxableBase || taxableExecution) * (m.percentage / 100);
            }
        });
        const remainingExecBase = taxableExecution - lockedExecBase;


        let designIndex = 0;
        let execIndex = 0;
        const newAdvances = milestones.map((m, i) => {
            let rowBaseOriginal = 0;
            const isExecution = m.type === 'execution';
            const unpaidItems = isExecution ? unpaidExec : unpaidDesign;
            const remainingBaseAmount = isExecution ? remainingExecBase : remainingDesignBase;
            const originalBaseAmount = isExecution ? taxableExecution : taxableDesign;
            
            const isCleared = m.status === 'paid' || m.status === 'invoiced';
            if (isCleared) {
                rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : ((m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100));
            } else {
                if (m.isFixedAmount && m.fixedAmount !== undefined) {
                    rowBaseOriginal = m.fixedAmount;
                } else {
                    const fixedPendingTotal = unpaidItems.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
                    const remainingBaseForPercentages = Math.max(0, remainingBaseAmount - fixedPendingTotal);
                    
                    const unpaidPctExcludingFixed = unpaidItems.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
                    const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                    rowBaseOriginal = remainingBaseForPercentages * relativePct;
                }
            }
            rowBaseOriginal = Math.round(rowBaseOriginal);

            const advCode = m.type === 'design' ? `D${++designIndex}` : `E${++execIndex}`;

            return {
                advanceCode: m.description && m.description.match(/^[DEH][0-9]$/) ? m.description : advCode,
                label: (m.name || '').replace(' (Gross)', ''),
                phase: m.type as 'design' | 'execution' | 'handover',
                percentage: m.percentage,
                isFixedAmount: m.isFixedAmount,
                fixedAmount: m.fixedAmount,
                amount: rowBaseOriginal,
                dueCondition: m.trigger || (m.type === 'execution' ? 'Advance before ' + (m.name || '').replace(' (Gross)', '').toLowerCase() : 'On completion of ' + (m.name || '').replace(' (Gross)', '')),
                unlocks: m.unlocks || '',
                status: m.status === 'invoiced' ? 'advance_requested' : m.status === 'paid' ? 'received' : 'pending',
                invoiceRef: m.invoiceNumber || null,
                receivedAt: null,
                isHandoverAdvance: m.isHandoverAdvance || false
            };
        });

        const newSchedule = {
            id: 'ps_' + Math.random().toString(36).substring(2, 9),
            version: latestSchedule ? latestSchedule.version + 1 : 1,
            versionLabel: 'v' + (latestSchedule ? latestSchedule.version + 1 : 1) + '.0',
            status: 'draft',
            docketRef: latestSchedule ? latestSchedule.docketRef : 'WILL_BIND_LATER',
            issuedAt: Date.now(),
            issuedBy: 'pm_auto',
            contractValue: contractValue,
            advances: newAdvances as any,
            revisionNote: latestSchedule ? 'Milestone adjustments' : '',
            supersededBy: null,
            snapshotEngagement: {
                designFee: taxableDesign,
                executionValue: taxableExecution
            }
        };

        const updatedSchedules = [...paymentSchedules];
        if (latestSchedule) {
            const idx = updatedSchedules.findIndex(s => s.id === latestSchedule.id);
            if (idx >= 0) {
                updatedSchedules[idx] = { ...updatedSchedules[idx], supersededBy: newSchedule.id };
            }
        }
        updatedSchedules.push(newSchedule as any);

        setProjectContext(prev => ({ ...prev, paymentSchedules: updatedSchedules as any }));
        alert('Payment Schedule v' + newSchedule.version + ' Generated. You can view it in the Client Outputs section.');
    };

    const getDefaultMilestones = () => {
        const paymentStr = (orgData as any).paymentStructure;
        const structure = paymentStr?.designStages ? paymentStr : FFDS_PAYMENT_STRUCTURE_DEFAULTS;
        
        return [
            ...structure.designStages.map((s: any, i: number) => ({
                id: `d${i + 1}`,
                type: 'design' as const,
                name: s.name,
                percentage: s.pct,
                description: s.code,
                unlocks: s.unlocks || '',
                trigger: s.trigger || ''
            })),
            ...structure.executionStages.map((s: any, i: number) => ({
                id: `e${i + 1}`,
                type: 'execution' as const,
                name: s.name,
                percentage: s.pct,
                description: s.code,
                unlocks: s.unlocks || '',
                trigger: s.trigger || '',
                isHandoverAdvance: s.code === 'E8' || s.name.toLowerCase().includes('handover') || i === structure.executionStages.length - 1
            }))
        ];
    };

    // --- DEFAULTS ---
    useEffect(() => {
        if (!projectContext.paymentMilestones || projectContext.paymentMilestones.length === 0) {
            setProjectContext(prev => ({ ...prev, paymentMilestones: getDefaultMilestones() }));
        }
    }, []);

    const autoBalanceMilestones = (items: PaymentMilestone[], phase: string, changedId?: string) => {
        const phaseItems = items.filter(m => m.type === phase);
        const baseAmount = phase === 'design' ? originalNetDesign : originalNetExecution;
        
        let lockedPercent = 0;
        let adjustableItems: PaymentMilestone[] = [];
        
        // First pass: identify locked and adjustable items
        phaseItems.forEach(m => {
            const isLocked = m.status === 'paid' || m.status === 'invoiced' || m.isFixedAmount || m.isCustom || m.id === changedId;
            if (isLocked) {
                if (m.isFixedAmount && m.fixedAmount !== undefined) {
                    lockedPercent += baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0;
                } else {
                    lockedPercent += m.percentage;
                }
            } else {
                adjustableItems.push(m);
            }
        });

        // If everything is locked but we need to balance (e.g. they edited the last adjustable one)
        // We will unlock all pending percentage-based items EXCEPT the one they just changed
        if (adjustableItems.length === 0) {
            lockedPercent = 0;
            phaseItems.forEach(m => {
                const isForceLocked = m.status === 'paid' || m.status === 'invoiced' || m.isFixedAmount || m.id === changedId;
                if (isForceLocked) {
                    if (m.isFixedAmount && m.fixedAmount !== undefined) {
                        lockedPercent += baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0;
                    } else {
                        lockedPercent += m.percentage;
                    }
                } else {
                    m.isCustom = false; // Unlock it
                    adjustableItems.push(m);
                }
            });
        }
        
        const remainingPercent = Math.max(0, 100 - lockedPercent);
        
        if (adjustableItems.length > 0 || phaseItems.some(m => m.isFixedAmount)) {
            const currentAdjustableSum = adjustableItems.reduce((sum, m) => sum + m.percentage, 0);
            
            let totalAssigned = 0;
            let adjustedCount = 0;
            
            items = items.map(m => {
                if (m.type === phase) {
                    if (m.isFixedAmount && m.fixedAmount !== undefined) {
                        return { ...m, percentage: Math.round(baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0) };
                    } else if (adjustableItems.some(a => a.id === m.id)) {
                        adjustedCount++;
                        let newPct = 0;
                        
                        if (adjustedCount === adjustableItems.length) {
                            // For the last item, just give it whatever is left of the remaining percent to avoid rounding errors
                            newPct = Math.max(0, Math.round(remainingPercent - totalAssigned));
                        } else {
                            if (currentAdjustableSum > 0) {
                                newPct = Math.round((m.percentage / currentAdjustableSum) * remainingPercent);
                            } else {
                                newPct = Math.round(remainingPercent / adjustableItems.length);
                            }
                        }
                        totalAssigned += newPct;
                        return { ...m, percentage: newPct };
                    }
                }
                return m;
            });
        }
        
        return items;
    };

    const handleUpdateMilestone = (index: number, updates: Partial<PaymentMilestone>) => {
        let newMilestones = [...milestones];
        
        // If they manually edit percentage or amount, lock it as custom
        if (updates.percentage !== undefined || updates.fixedAmount !== undefined) {
            updates.isCustom = true;
        }
        
        newMilestones[index] = { ...newMilestones[index], ...updates };
        
        if (updates.percentage !== undefined || updates.fixedAmount !== undefined || updates.isFixedAmount !== undefined) {
             newMilestones = autoBalanceMilestones(newMilestones, newMilestones[index].type, newMilestones[index].id);
        }
        
        setProjectContext(prev => ({ ...prev, paymentMilestones: newMilestones }));
    };

    const handleAddMilestone = (type: 'design' | 'execution') => {
        const newMilestone: PaymentMilestone = {
            id: generateId(),
            type,
            name: 'New Milestone',
            percentage: 0,
            description: '',
            status: 'pending'
        };
        const newMilestones = [...milestones, newMilestone];
        setProjectContext(prev => ({ ...prev, paymentMilestones: autoBalanceMilestones(newMilestones, type) }));
    };

    const handleDeleteMilestone = (index: number) => {
        const newMilestones = [...milestones];
        const type = newMilestones[index].type;
        newMilestones.splice(index, 1);
        setProjectContext(prev => ({ ...prev, paymentMilestones: autoBalanceMilestones(newMilestones, type) }));
    };

    const handleRevertRevision = (revision: any) => {
        setProjectContext(prev => {
            const currentFinancials = prev.financials || {};
            const newRevisions = [...(currentFinancials.paymentRevisions || [])];
            
            newRevisions.push({
                id: Math.random().toString(36).substr(2, 9),
                date: new Date().toISOString(),
                previousExecutionValue: currentFinancials.approvedExecutionValue,
                newExecutionValue: revision.previousExecutionValue,
                previousDesignValue: currentFinancials.approvedDesignValue,
                newDesignValue: revision.previousDesignValue,
                reason: `Reverted to values from ${new Date(revision.date).toLocaleString()}`
            });

            return {
                ...prev,
                financials: {
                    ...currentFinancials,
                    approvedExecutionValue: revision.previousExecutionValue,
                    approvedDesignValue: revision.previousDesignValue,
                    paymentRevisions: newRevisions
                }
            };
        });
    };

    const handleReset = () => {
        if (!isResetting) {
            setIsResetting(true);
            setTimeout(() => setIsResetting(false), 3000);
            return;
        }

        const defaultFinancials = {
            initiationFeePaid: 4999,
            billablePercent: 100,
            executionGstEnabled: true,
            projectedCashValue: 0,
            taxLimitYearly: 2000000,
            goodwillDiscount: 0,
            discounts: []
        };

        setInitiationFee(defaultFinancials.initiationFeePaid);
        setBillablePercent(defaultFinancials.billablePercent);
        setExecutionGstEnabled(defaultFinancials.executionGstEnabled);
        setCashLimit(defaultFinancials.taxLimitYearly);
        setDiscounts([]);

        setProjectContext(prev => ({ 
            ...prev, 
            paymentMilestones: getDefaultMilestones(), 
            financials: defaultFinancials 
        }));

        setIsResetting(false);
    };

    const handleLoadDefaults = () => {
        if (!window.confirm("This will overwrite your current milestones with the Studio Defaults. Continue?")) return;
        setProjectContext(prev => ({ ...prev, paymentMilestones: getDefaultMilestones() }));
    };

    const handleInvoiceAction = (index: number, action: 'generate_invoice' | 'mark_paid' | 'revert_invoice', lockedTaxableBase?: number) => {
        const m = milestones[index];
        const projectCode = (projectContext?.name || 'PRJ').substring(0, 3).toUpperCase();
        const seq = String(index + 1).padStart(2, '0');
        
        let invNumber = '';
        if (billablePercent > 0) {
            invNumber = `INV-026-${projectCode}-${seq}`;
        } else {
            invNumber = `INV-CASH-${projectCode}-${seq}`;
        }

        if (action === 'generate_invoice' || action === 'mark_paid') {
            const engagementStatus = projectContext.engagement?.status;
            if (engagementStatus !== 'acknowledged') {
                alert("Issue and obtain client acknowledgement of the Terms Docket and Payment Schedule before recording any advance.");
                return;
            }
        }

        if (action === 'generate_invoice') {
            handleUpdateMilestone(index, { 
                status: 'invoiced', 
                invoiceNumber: invNumber, 
                invoiceDate: new Date().toISOString(),
                lockedTaxableBase: lockedTaxableBase
            });
        } else if (action === 'mark_paid') {
            handleUpdateMilestone(index, { status: 'paid' });
        } else if (action === 'revert_invoice') {
            handleUpdateMilestone(index, { 
                status: 'pending', 
                invoiceNumber: undefined, 
                invoiceDate: undefined,
                lockedTaxableBase: undefined
            });
        }
    };

    // --- DISCOUNT HANDLERS ---
    const handleAddDiscount = () => {
        if (!newDiscount.name || !newDiscount.value) return;
        const discount: ProjectDiscount = {
            id: generateId(),
            name: newDiscount.name,
            value: Number(newDiscount.value),
            type: newDiscount.type || 'percentage',
            target: newDiscount.target || 'execution'
        };
        setDiscounts([...discounts, discount]);
        setNewDiscount({ name: '', value: 0, type: 'percentage', target: 'execution' });
        setShowDiscountForm(false);
    };

    const handleRemoveDiscount = (id: string) => {
        setDiscounts(discounts.filter(d => d.id !== id));
    };

    // --- SUB-STAGE HANDLERS ---
    const handleAddSubStep = (index: number) => {
        const m = milestones[index];
        const newStep = { id: generateId(), label: 'New Requirement', isDone: false };
        handleUpdateMilestone(index, { subSteps: [...(m.subSteps || []), newStep] });
    };

    const handleToggleSubStep = (mIndex: number, sIndex: number) => {
        const m = milestones[mIndex];
        if (!m.subSteps) return;
        const newSteps = [...m.subSteps];
        newSteps[sIndex] = { ...newSteps[sIndex], isDone: !newSteps[sIndex].isDone };
        handleUpdateMilestone(mIndex, { subSteps: newSteps });
    };

    const handleDeleteSubStep = (mIndex: number, sIndex: number) => {
        const m = milestones[mIndex];
        if (!m.subSteps) return;
        const newSteps = m.subSteps.filter((_, i) => i !== sIndex);
        handleUpdateMilestone(mIndex, { subSteps: newSteps });
    };

    const handleUpdateSubStepLabel = (mIndex: number, sIndex: number, label: string) => {
        const m = milestones[mIndex];
        if (!m.subSteps) return;
        const newSteps = [...m.subSteps];
        newSteps[sIndex] = { ...newSteps[sIndex], label };
        handleUpdateMilestone(mIndex, { subSteps: newSteps });
    };


    // --- CALCULATIONS ENGINE ---

    const originalExecutionTotal = activeTier?.summary.totalSell || 0;
    const originalDesignFee = activeTier?.summary.designFee || 0;

    const rawExecutionTotal = financials.approvedExecutionValue ?? originalExecutionTotal;
    const rawDesignFee = financials.approvedDesignValue ?? originalDesignFee;

    // 1. Apply Discounts (Pre-Tax)
    const calculateDiscountValue = (base: number, target: 'execution' | 'design') => {
        const targetDiscounts = discounts.filter(d => d.target === target);
        let totalDeduction = 0;
        targetDiscounts.forEach(d => {
            if (d.type === 'percentage') {
                totalDeduction += base * (d.value / 100);
            } else {
                totalDeduction += d.value;
            }
        });
        return totalDeduction;
    };

    const originalExecutionDiscountVal = calculateDiscountValue(originalExecutionTotal, 'execution');
    const originalNetExecution = Math.max(0, originalExecutionTotal - originalExecutionDiscountVal);

    const originalDesignDiscountVal = calculateDiscountValue(originalDesignFee, 'design');
    const originalNetDesign = Math.max(0, originalDesignFee - originalDesignDiscountVal);

    const executionDiscountVal = calculateDiscountValue(rawExecutionTotal, 'execution');
    const designDiscountVal = calculateDiscountValue(rawDesignFee, 'design');

    // Net Taxable Base
    const taxableExecution = Math.max(0, rawExecutionTotal - executionDiscountVal);
    const taxableDesign = Math.max(0, rawDesignFee - designDiscountVal);

    // 2. Filter Milestones
    const executionMilestones = milestones.filter(m => m.type === 'execution');
    const designMilestones = milestones.filter(m => m.type === 'design');
    
    // 3. Splits (on Taxable Base)
    const executionBillable = taxableExecution * (billablePercent / 100);
    const executionCash = taxableExecution * ((100 - billablePercent) / 100);

    // 4. GST (Liability) - Calculated on Taxable Amount
    const gstOnExecution = executionGstEnabled ? (executionBillable * (gstRate / 100)) : 0;
    const gstOnDesign = taxableDesign * (gstRate / 100);
    const totalGST = gstOnExecution + gstOnDesign;

    // 5. Totals & Net
    // "Official Revenue" = Taxable Billable + Taxable Design
    const totalOfficialRevenue = executionBillable + taxableDesign; 
    
    // Gross Project Value = (Taxable Exe + Taxable Design) + GST + Cash Component
    // = (Net Exe + Net Design) + GST
    const grossProjectValue = (taxableExecution + taxableDesign) + totalGST;
    
    // 6. Final Receivables
    const netReceivable = grossProjectValue - initiationFee;

    // Calculate Total Paid and Remaining Balance
    const totalPaid = useMemo(() => {
        let paid = initiationFee; // Initiation fee is already paid
        
        // Sum up paid milestones
        designMilestones.forEach((m, i) => {
            if (m.status === 'paid') {
                let rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || originalNetDesign) * (m.percentage / 100);
                rowBaseOriginal = Math.round(rowBaseOriginal);
                let rowBillable = Math.round(rowBaseOriginal);
                let rowGST = Math.round(rowBillable * (gstRate / 100));
                let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                
                if (i === 0 && initiationFee > 0) {
                    rowInvoiceTotal = Math.max(0, rowInvoiceTotal - initiationFee);
                }
                paid += rowInvoiceTotal;
            }
        });

        executionMilestones.forEach((m) => {
            if (m.status === 'paid') {
                let rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || originalNetExecution) * (m.percentage / 100);
                rowBaseOriginal = Math.round(rowBaseOriginal);
                let rowBillable = Math.round(rowBaseOriginal * (billablePercent / 100));
                const applicableGstRate = executionGstEnabled ? gstRate : 0;
                let rowGST = Math.round(rowBillable * (applicableGstRate / 100));
                let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                
                // Add cash component to paid amount
                const rowCash = Math.round(rowBaseOriginal * ((100 - billablePercent) / 100));
                paid += rowInvoiceTotal + rowCash;
            }
        });

        return paid;
    }, [designMilestones, executionMilestones, originalNetDesign, originalNetExecution, gstRate, initiationFee, billablePercent, executionGstEnabled]);

    const remainingBalance = grossProjectValue - totalPaid;
    
    // 6. Global FY Tracking
    const otherProjectsCash = useMemo(() => {
        return allProjects
            .filter(p => p.context?.name !== projectContext?.name) 
            .reduce((sum, p) => sum + (p.context?.financials?.projectedCashValue || 0), 0);
    }, [allProjects, projectContext?.name]);

    const totalFYCash = otherProjectsCash + executionCash;
    const cashUtilization = (totalFYCash / cashLimit) * 100;
    const isRiskHigh = totalFYCash > cashLimit;

    // Persistence
    useEffect(() => {
        const newConfig = {
            initiationFeePaid: initiationFee,
            billablePercent,
            executionGstEnabled,
            projectedCashValue: executionCash,
            taxLimitYearly: cashLimit,
            goodwillDiscount: 0, // Deprecated in UI but kept in type
            discounts,
            approvedExecutionValue: financials.approvedExecutionValue,
            approvedDesignValue: financials.approvedDesignValue
        };
        const timer = setTimeout(() => {
            if (JSON.stringify(projectContext.financials) !== JSON.stringify(newConfig)) {
                setProjectContext(prev => ({ ...prev, financials: newConfig }));
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [initiationFee, billablePercent, executionGstEnabled, executionCash, cashLimit, discounts, financials.approvedExecutionValue, financials.approvedDesignValue]);


    const renderSplitTable = (
        items: PaymentMilestone[], 
        baseAmount: number, 
        originalBaseAmount: number,
        isExecution: boolean, 
        title: string
    ) => {
        let totalEffectivePercent = 0;
        items.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                totalEffectivePercent += baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0;
            } else {
                totalEffectivePercent += m.percentage;
            }
        });
        const isBalanced = Math.abs(totalEffectivePercent - 100) < 0.1;

        const paidItems = items.filter(m => m.status === 'paid' || m.status === 'invoiced');
        const unpaidItems = items.filter(m => m.status !== 'paid' && m.status !== 'invoiced');
        const unpaidPct = unpaidItems.reduce((sum, m) => sum + m.percentage, 0);
        
        let lockedBase = 0;
        paidItems.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                lockedBase += m.fixedAmount;
            } else {
                lockedBase += (m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100);
            }
        });
        const remainingBaseAmount = baseAmount - lockedBase;

        return (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-8">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-indigo-900">{title} Tracking</h3>
                        <div className="text-xs text-slate-500 mt-1 flex gap-4 items-center">
                            {baseAmount !== originalBaseAmount ? (
                                <div className="flex items-center gap-2">
                                    <span className="line-through text-slate-400" title="Original Taxable Base">Orig: {formatCurrency(originalBaseAmount)}</span>
                                    <span className="text-indigo-600 font-bold" title="Revised Taxable Base">Rev: {formatCurrency(baseAmount)}</span>
                                </div>
                            ) : (
                                <span>Taxable Base: <span className="font-mono font-bold text-slate-700">{formatCurrency(baseAmount)}</span></span>
                            )}
                            {isExecution && (
                                <>
                                    {billablePercent < 100 && (
                                        <span className="text-amber-700 font-bold bg-amber-50 px-1.5 rounded border border-amber-100">
                                            Split: {billablePercent}% / {100 - billablePercent}%
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    <div className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${isBalanced ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        Total: {totalEffectivePercent.toFixed(1).replace('.0', '')}%
                    </div>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase">
                        <tr>
                            <th className="p-4 w-[35%]">Stage & Conditions</th>
                            <th className="p-4 w-24 text-center">% / Amt</th>
                            <th className="p-4 text-right bg-blue-50/30 text-blue-800">Invoice Amount</th>
                            {isExecution && billablePercent < 100 && (
                                <th className="p-4 text-right bg-amber-50/30 text-amber-800">Cash</th>
                            )}
                            <th className="p-4 text-center w-32">Status</th>
                            <th className="p-4 text-right w-32">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {items.map((m, i) => {
                            // Row Logic based on TAXABLE Amount
                            const isCleared = m.status === 'paid' || m.status === 'invoiced';
                            let rowBaseOriginal = 0;
                            let effectiveTaxableBaseForLocking = baseAmount;
                            if (isCleared) {
                                rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : ((m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100));
                                effectiveTaxableBaseForLocking = m.lockedTaxableBase || originalBaseAmount;
                            } else {
                                if (m.isFixedAmount && m.fixedAmount !== undefined) {
                                    rowBaseOriginal = m.fixedAmount;
                                } else {
                                    const fixedPendingTotal = unpaidItems.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
                                    const remainingBaseForPercentages = Math.max(0, remainingBaseAmount - fixedPendingTotal);
                                    
                                    const unpaidPctExcludingFixed = unpaidItems.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
                                    const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                                    rowBaseOriginal = remainingBaseForPercentages * relativePct;
                                }
                                effectiveTaxableBaseForLocking = m.percentage > 0 ? (rowBaseOriginal / (m.percentage / 100)) : baseAmount;
                            }
                            rowBaseOriginal = Math.round(rowBaseOriginal);
                            
                            let rowBillable = Math.round(isExecution ? rowBaseOriginal * (billablePercent / 100) : rowBaseOriginal);
                            const rowCash = Math.round(isExecution ? rowBaseOriginal * ((100 - billablePercent) / 100) : 0);
                            
                            const applicableGstRate = isExecution ? (executionGstEnabled ? gstRate : 0) : gstRate;
                            let rowGST = Math.round(rowBillable * (applicableGstRate / 100));
                            
                            // Calculate Raw Invoice Total
                            let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                            
                            let deductedInitiationFee = 0;
                            if (!isExecution && i === 0 && initiationFee > 0) {
                                deductedInitiationFee = Math.min(rowInvoiceTotal, initiationFee);
                                rowInvoiceTotal = Math.max(0, rowInvoiceTotal - initiationFee);
                            }
                            
                            const mainIndex = milestones.findIndex(x => x.id === m.id);
                            
                            const statusColor = m.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : m.status === 'invoiced' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200';

                            if (deductedInitiationFee > 0) {
                                return (
                                    <React.Fragment key={m.id}>
                                        <tr className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-4 align-top">
                                                <div className="flex items-start gap-2">
                                                    <button onClick={() => { /* Expand handled locally */ }} className="mt-1 text-slate-400 hover:text-indigo-600">
                                                        {m.subSteps && m.subSteps.length > 0 ? <ChevronDownIcon className="w-4 h-4" /> : <div className="w-4" />}
                                                    </button>
                                                    <div className="flex-grow">
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="text" 
                                                                value={m.name + ' (Gross)'} 
                                                                onChange={e => handleUpdateMilestone(mainIndex, { name: e.target.value.replace(' (Gross)', '') })}
                                                                className="w-full bg-transparent outline-none font-bold text-indigo-900 mb-1 focus:border-b focus:border-indigo-300"
                                                            />
                                                            {(!m.status || m.status === 'pending') && (
                                                                <button 
                                                                    onClick={() => handleDeleteMilestone(mainIndex)}
                                                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    title="Delete Milestone"
                                                                >
                                                                    <DeleteIcon className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col gap-1 mt-1">
                                                            <input type="text" value={m.trigger || ''} onChange={e => handleUpdateMilestone(mainIndex, { trigger: e.target.value })} placeholder="Paid When / Trigger..." className="text-[10px] uppercase tracking-wider font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded w-full outline-none focus:bg-white focus:border-indigo-300" />
                                                            <input type="text" value={m.unlocks || ''}
                                                                onChange={e => handleUpdateMilestone(mainIndex, { unlocks: e.target.value })}
                                                                placeholder="Unlocks what..."
                                                                className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded w-full outline-none focus:bg-indigo-100 focus:border-indigo-300"
                                                            />
                                                        </div>
                                                        {/* Sub-steps Preview */}
                                                        {m.subSteps && m.subSteps.length > 0 && (
                                                            <div className="mt-2 space-y-1">
                                                                {m.subSteps.map((step, sIdx) => (
                                                                    <div key={step.id} className="flex items-center gap-2 text-xs">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={step.isDone} 
                                                                            onChange={() => handleToggleSubStep(mainIndex, sIdx)}
                                                                            className="rounded text-indigo-600 w-3 h-3 cursor-pointer"
                                                                        />
                                                                        <input 
                                                                            value={step.label || ''}
                                                                            onChange={(e) => handleUpdateSubStepLabel(mainIndex, sIdx, e.target.value)}
                                                                            className={`bg-transparent outline-none w-full ${step.isDone ? 'text-slate-400 line-through' : 'text-slate-600'}`}
                                                                        />
                                                                        <button onClick={() => handleDeleteSubStep(mainIndex, sIdx)} className="text-slate-300 hover:text-red-500 px-1 opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-[10px]"><DeleteIcon className="w-3 h-3" /></span></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <button onClick={() => handleAddSubStep(mainIndex)} className="mt-2 text-[10px] text-indigo-600 font-bold flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                                                            <PencilIcon className="w-3 h-3" /> Add Release Condition
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center align-top">
                                                <div className="flex flex-col items-center justify-center gap-1.5">
                                                    <div className="flex items-center justify-center bg-slate-200/60 rounded overflow-hidden p-0.5">
                                                        <button 
                                                            onClick={() => handleUpdateMilestone(mainIndex, { isFixedAmount: false })}
                                                            className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm transition-all ${!m.isFixedAmount ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                                                            title="Percentage Mode"
                                                        >
                                                            %
                                                        </button>
                                                        <button 
                                                            onClick={() => handleUpdateMilestone(mainIndex, { isFixedAmount: true, fixedAmount: m.fixedAmount || rowBaseOriginal })}
                                                            className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm transition-all ${m.isFixedAmount ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                                                            title="Fixed Amount Mode"
                                                        >
                                                            ₹
                                                        </button>
                                                    </div>
                                                    {!m.isFixedAmount ? (
                                                        <input 
                                                            type="number" 
                                                            value={m.percentage} 
                                                            onChange={e => handleUpdateMilestone(mainIndex, { percentage: Number(e.target.value) })}
                                                            className="w-12 text-center font-bold text-indigo-900 outline-none bg-slate-100 rounded focus:ring-2 focus:ring-indigo-200"
                                                        />
                                                    ) : (
                                                        <input 
                                                            type="number" 
                                                            value={m.fixedAmount || 0} 
                                                            onChange={e => handleUpdateMilestone(mainIndex, { fixedAmount: Number(e.target.value) })}
                                                            className="w-28 text-center font-bold text-indigo-900 outline-none bg-amber-50 border border-amber-200 rounded focus:ring-2 focus:ring-amber-400"
                                                        />
                                                    )}
                                                </div>
                                            </td>
                                            
                                            {/* Invoice Column */}
                                            <td className="p-4 text-right font-mono text-blue-700 bg-blue-50/10 border-l border-slate-100 align-top">
                                                <div className="font-bold">{formatCurrency(rowInvoiceTotal + deductedInitiationFee)}</div>
                                                <div className="text-[9px] text-slate-400">
                                                    (Base: {formatCurrency(rowBillable)} + {applicableGstRate}% GST)
                                                </div>
                                            </td>

                                            <td className="p-4 text-center align-top">
                                                <div className={`px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                                                    {m.status || 'Pending'}
                                                </div>
                                                {m.invoiceNumber && (
                                                    <div className="text-[9px] text-slate-500 font-mono mt-1">{m.invoiceNumber}</div>
                                                )}
                                            </td>

                                            <td className="p-4 text-right align-top">
                                                {!m.status || m.status === 'pending' ? (
                                                    <button 
                                                        onClick={() => handleInvoiceAction(mainIndex, 'generate_invoice', effectiveTaxableBaseForLocking)}
                                                        className="px-3 py-1.5 bg-indigo-950 text-white text-xs font-bold rounded shadow hover:bg-indigo-950 transition-all"
                                                    >
                                                        Raise Invoice
                                                    </button>
                                                ) : m.status === 'invoiced' ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button 
                                                            onClick={() => handleInvoiceAction(mainIndex, 'revert_invoice')}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                            title="Revert Invoice"
                                                        >
                                                            <RotateCcw className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleInvoiceAction(mainIndex, 'mark_paid')}
                                                            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded shadow-sm hover:bg-emerald-200 transition-all"
                                                        >
                                                            Mark Paid
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-emerald-600 text-xs font-bold flex items-center justify-end gap-1">
                                                        <CheckIcon className="w-3 h-3" /> Done
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                        <tr className="bg-amber-50/30 border-t border-amber-100/50">
                                            <td className="p-4 pl-12 text-amber-800 text-xs font-medium">↳ Less: Project Initiation Fee (Paid)</td>
                                            <td className="p-4 text-center text-amber-600">-</td>
                                            <td className="p-4 text-right font-mono text-amber-700 font-bold border-l border-slate-100">-{formatCurrency(deductedInitiationFee)}</td>
                                            <td className="p-4 text-center">
                                                <span className="px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border-emerald-200">Paid</span>
                                            </td>
                                            <td className="p-4 text-right">-</td>
                                        </tr>
                                        <tr className="bg-blue-50/30 border-t border-blue-100/50">
                                            <td className="p-4 pl-12 text-blue-800 text-xs font-bold">↳ Balance Payable</td>
                                            <td className="p-4 text-center text-blue-600">-</td>
                                            <td className="p-4 text-right font-mono text-blue-800 font-bold border-l border-slate-100">{formatCurrency(rowInvoiceTotal)}</td>
                                            <td className="p-4 text-center">
                                                <div className={`px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                                                    {m.status || 'Pending'}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">-</td>
                                        </tr>
                                    </React.Fragment>
                                );
                            }

                            return (
                                <React.Fragment key={m.id}>
                                    <tr className="hover:bg-slate-50 transition-colors group">
                                        <td className="p-4 align-top">
                                            <div className="flex items-start gap-2">
                                                <button onClick={() => { /* Expand handled locally */ }} className="mt-1 text-slate-400 hover:text-indigo-600">
                                                    {m.subSteps && m.subSteps.length > 0 ? <ChevronDownIcon className="w-4 h-4" /> : <div className="w-4" />}
                                                </button>
                                                <div className="flex-grow">
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="text" 
                                                            value={m.name} 
                                                            onChange={e => handleUpdateMilestone(mainIndex, { name: e.target.value })}
                                                            className="w-full bg-transparent outline-none font-bold text-indigo-900 mb-1 focus:border-b focus:border-indigo-300"
                                                        />
                                                        {(!m.status || m.status === 'pending') && (
                                                            <button 
                                                                onClick={() => handleDeleteMilestone(mainIndex)}
                                                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Delete Milestone"
                                                            >
                                                                <DeleteIcon className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col gap-1 mt-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={m.isHandoverAdvance || false}
                                                                    onChange={(e) => handleUpdateMilestone(mainIndex, { isHandoverAdvance: e.target.checked })}
                                                                    className="w-3 h-3 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                                                                />
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase">Is Handover Advance (Clause 6.4)</span>
                                                            </label>
                                                        </div>
                                                        {m.isHandoverAdvance && (
                                                            <div className="bg-amber-50 border-l-2 border-amber-500 px-2 py-1 mb-1">
                                                                <span className="text-[10px] uppercase text-amber-700 font-bold block">Tags final advance unlocking Dossier, Keys & Warranty.</span>
                                                            </div>
                                                        )}
                                                        <input type="text" value={m.trigger || ''} onChange={e => handleUpdateMilestone(mainIndex, { trigger: e.target.value })} placeholder="Paid When / Trigger..." className="text-[10px] uppercase tracking-wider font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded w-full outline-none focus:bg-white focus:border-indigo-300" />
                                                            <input type="text" value={m.unlocks || ''}
                                                            onChange={e => handleUpdateMilestone(mainIndex, { unlocks: e.target.value })}
                                                            placeholder="Unlocks what..."
                                                            className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded w-full outline-none focus:bg-indigo-100 focus:border-indigo-300"
                                                        />
                                                    </div>
                                                    {/* Sub-steps Preview */}
                                                    {m.subSteps && m.subSteps.length > 0 && (
                                                        <div className="mt-2 space-y-1">
                                                            {m.subSteps.map((step, sIdx) => (
                                                                <div key={step.id} className="flex items-center gap-2 text-xs">
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={step.isDone} 
                                                                        onChange={() => handleToggleSubStep(mainIndex, sIdx)}
                                                                        className="rounded text-indigo-600 w-3 h-3 cursor-pointer"
                                                                    />
                                                                    <input 
                                                                        value={step.label || ''}
                                                                        onChange={(e) => handleUpdateSubStepLabel(mainIndex, sIdx, e.target.value)}
                                                                        className={`bg-transparent outline-none w-full ${step.isDone ? 'text-slate-400 line-through' : 'text-slate-600'}`}
                                                                    />
                                                                    <button onClick={() => handleDeleteSubStep(mainIndex, sIdx)} className="text-slate-300 hover:text-red-500 px-1 opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-[10px]"><DeleteIcon className="w-3 h-3" /></span></button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <button onClick={() => handleAddSubStep(mainIndex)} className="mt-2 text-[10px] text-indigo-600 font-bold flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                                                        <PencilIcon className="w-3 h-3" /> Add Release Condition
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center align-top">
                                            <div className="flex flex-col items-center justify-center gap-1.5">
                                                <div className="flex items-center justify-center bg-slate-200/60 rounded overflow-hidden p-0.5">
                                                    <button 
                                                        onClick={() => handleUpdateMilestone(mainIndex, { isFixedAmount: false })}
                                                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm transition-all ${!m.isFixedAmount ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                                                        title="Percentage Mode"
                                                    >
                                                        %
                                                    </button>
                                                    <button 
                                                        onClick={() => handleUpdateMilestone(mainIndex, { isFixedAmount: true, fixedAmount: m.fixedAmount || rowBaseOriginal })}
                                                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm transition-all ${m.isFixedAmount ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                                                        title="Fixed Amount Mode"
                                                    >
                                                        ₹
                                                    </button>
                                                </div>
                                                {!m.isFixedAmount ? (
                                                    <input 
                                                        type="number" 
                                                        value={m.percentage} 
                                                        onChange={e => handleUpdateMilestone(mainIndex, { percentage: Number(e.target.value) })}
                                                        className="w-12 text-center font-bold text-indigo-900 outline-none bg-slate-100 rounded focus:ring-2 focus:ring-indigo-200"
                                                    />
                                                ) : (
                                                    <input 
                                                        type="number" 
                                                        value={m.fixedAmount || 0} 
                                                        onChange={e => handleUpdateMilestone(mainIndex, { fixedAmount: Number(e.target.value) })}
                                                        className="w-28 text-center font-bold text-indigo-900 outline-none bg-amber-50 border border-amber-200 rounded focus:ring-2 focus:ring-amber-400"
                                                    />
                                                )}
                                            </div>
                                        </td>
                                        
                                        {/* Invoice Column */}
                                        <td className="p-4 text-right font-mono text-blue-700 bg-blue-50/10 border-l border-slate-100 align-top">
                                            <div className="font-bold">{formatCurrency(rowInvoiceTotal)}</div>
                                            <div className="text-[9px] text-slate-400">
                                                (Base: {formatCurrency(rowBillable)} + {applicableGstRate}% GST)
                                            </div>
                                        </td>

                                        {/* Cash Column */}
                                        {isExecution && billablePercent < 100 && (
                                            <td className="p-4 text-right font-mono text-amber-700 bg-amber-50/10 border-l border-slate-100 font-bold align-top">
                                                {formatCurrency(rowCash)}
                                            </td>
                                        )}

                                        <td className="p-4 text-center align-top">
                                            <div className={`px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                                                {m.status || 'Pending'}
                                            </div>
                                            {m.invoiceNumber && (
                                                <div className="text-[9px] text-slate-500 font-mono mt-1">{m.invoiceNumber}</div>
                                            )}
                                        </td>

                                        <td className="p-4 text-right align-top">
                                            {!m.status || m.status === 'pending' ? (
                                                <button 
                                                    onClick={() => handleInvoiceAction(mainIndex, 'generate_invoice', effectiveTaxableBaseForLocking)}
                                                    className="px-3 py-1.5 bg-indigo-950 text-white text-xs font-bold rounded shadow hover:bg-indigo-950 transition-all"
                                                >
                                                    Raise Invoice
                                                </button>
                                            ) : m.status === 'invoiced' ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button 
                                                        onClick={() => handleInvoiceAction(mainIndex, 'revert_invoice')}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                        title="Revert Invoice"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleInvoiceAction(mainIndex, 'mark_paid')}
                                                        className="px-3 py-1.5 bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded shadow-sm hover:bg-emerald-200 transition-all"
                                                    >
                                                        Mark Paid
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-emerald-600 text-xs font-bold flex items-center justify-end gap-1">
                                                    <CheckIcon className="w-3 h-3" /> Done
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                    <button 
                        onClick={() => handleAddMilestone(isExecution ? 'execution' : 'design')}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-lg shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-all"
                    >
                        <PlusIcon className="w-4 h-4" /> Add {isExecution ? 'Execution' : 'Design'} Milestone
                    </button>
                </div>
            </div>
        );
    };

    if (!activeTier) {
        return (
            <Card>
                <div className="text-center py-12 text-slate-400">
                    <p>Please select a project tier to enable calculations.</p>
                </div>
            </Card>
        )
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in">
            
            {/* Payment Schedule Banner */}
            {(!latestSchedule || hasUnsavedScheduleChanges) && (
                <div className={`p-4 rounded-xl border flex items-center justify-between shadow-sm ${latestSchedule ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'}`}>
                    <div>
                        <h3 className={`text-sm font-bold ${latestSchedule ? 'text-amber-800' : 'text-indigo-800'}`}>
                            {latestSchedule ? `Milestones have changed since the last Payment Schedule (v${latestSchedule.version}).` : 'No Advance Payment Schedule document generated yet.'}
                        </h3>
                        <p className={`text-xs mt-1 ${latestSchedule ? 'text-amber-700' : 'text-indigo-600'}`}>
                            {latestSchedule ? 'Generate a revised Payment Schedule to keep the client updated.' : 'Generate the document from these milestones to send to the client.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {latestSchedule && <button className="text-sm font-semibold text-amber-700 hover:text-amber-900">Later</button>}
                        <button onClick={handleGenerateSchedule} className={`px-4 py-2 text-sm font-bold rounded-lg shadow-sm text-white transition-all ${latestSchedule ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                            {latestSchedule ? `Generate Revised Schedule (v${latestSchedule.version + 1})` : 'Generate Payment Schedule'}
                        </button>
                    </div>
                </div>
            )}

            {/* 1. CONFIGURATION HEADER */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-8 relative">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    <button 
                        onClick={handleLoadDefaults}
                        className="text-xs font-bold transition-all px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                        Load Studio Defaults
                    </button>
                    <button 
                        onClick={handleReset}
                        className={`text-xs font-bold transition-all flex items-center gap-1 px-3 py-1.5 rounded-lg border ${
                            isResetting 
                                ? 'bg-red-500 text-white border-red-500 hover:bg-red-600' 
                                : 'text-red-500 hover:text-red-700 bg-red-50 border-red-100'
                        }`}
                    >
                        {isResetting ? 'Click Again to Confirm Reset' : 'Reset Everything'}
                    </button>
                </div>

                {/* LEFT COLUMN: ADJUSTMENTS */}
                <div className="flex-1 space-y-6">
                    <div>
                        <h2 className="text-2xl font-black text-indigo-950 flex items-center gap-3">
                            <span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><CalculatorIcon className="w-6 h-6"/></span>
                            Payment Ops & Invoicing
                        </h2>
                        <p className="text-sm text-slate-500 mt-2">
                            Manage residential payment schedules, track invoice status, and handle cash flow splits for <strong>{activeTier?.name || 'Active Tier'}</strong>.
                        </p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex justify-between items-center">
                            Discounts & Adjustments
                            <button onClick={() => setShowDiscountForm(!showDiscountForm)} className="text-indigo-600 hover:text-indigo-800 text-[10px] flex items-center gap-1">
                                <PlusIcon className="w-3 h-3" /> Add Discount
                            </button>
                        </h4>
                        
                        {showDiscountForm && (
                            <div className="mb-4 p-3 bg-white rounded-lg border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <input 
                                        placeholder="Discount Label" 
                                        value={newDiscount.name} 
                                        onChange={e => setNewDiscount({...newDiscount, name: e.target.value})}
                                        className="text-xs p-1.5 border rounded outline-none"
                                    />
                                    <div className="flex">
                                        <input 
                                            type="number" 
                                            placeholder="Value" 
                                            value={newDiscount.value || ''} 
                                            onChange={e => setNewDiscount({...newDiscount, value: Number(e.target.value)})}
                                            className="w-16 text-xs p-1.5 border rounded-l outline-none"
                                        />
                                        <select 
                                            value={newDiscount.type}
                                            onChange={e => setNewDiscount({...newDiscount, type: e.target.value as any})}
                                            className="text-xs p-1.5 border-y border-r rounded-r bg-slate-50 outline-none"
                                        >
                                            <option value="percentage">%</option>
                                            <option value="fixed">₹</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <select 
                                        value={newDiscount.target}
                                        onChange={e => setNewDiscount({...newDiscount, target: e.target.value as any})}
                                        className="text-xs p-1.5 border rounded bg-white outline-none w-32"
                                    >
                                        <option value="execution">On Execution</option>
                                        <option value="design">On Design Fee</option>
                                    </select>
                                    <button 
                                        onClick={handleAddDiscount}
                                        className="text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {/* Standard Initiation Fee */}
                            <div className="flex justify-between items-center text-xs p-2 bg-white rounded border border-slate-100">
                                <span className="text-slate-600 font-medium">Initiation Fee Paid</span>
                                <input 
                                    type="number" 
                                    value={initiationFee} 
                                    onChange={e => setInitiationFee(Number(e.target.value))}
                                    className="w-20 text-right font-bold text-indigo-900 outline-none border-b border-dashed border-slate-300 focus:border-indigo-500" 
                                />
                            </div>

                            {/* Active Discounts List */}
                            {discounts.map(discount => (
                                <div key={discount.id} className="flex justify-between items-center text-xs p-2 bg-red-50 rounded border border-red-100 group">
                                    <div className="flex items-center gap-2">
                                        <span className="text-red-700 font-medium">{discount.name}</span>
                                        <span className="text-[9px] text-red-400 bg-white px-1 rounded uppercase tracking-wider">{discount.target}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold text-red-700">
                                            -{discount.type === 'percentage' ? `${discount.value}%` : formatCurrency(discount.value)}
                                        </span>
                                        <button onClick={() => handleRemoveDiscount(discount.id)} className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <DeleteIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {discounts.length === 0 && <p className="text-[10px] text-slate-400 italic text-center py-1">No additional discounts applied.</p>}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: TAX & RATIO */}
                <div className="flex-1 bg-indigo-950 rounded-2xl p-6 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><ShieldCheckIcon className="w-24 h-24" /></div>
                    
                    <div className="relative z-10">
                        <div className="flex justify-between items-end mb-4">
                            <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Execution Billable Ratio</label>
                            <div className="text-right">
                                <span className="text-2xl font-black">{billablePercent}%</span>
                                <span className="text-xs text-slate-400 ml-2">Official</span>
                            </div>
                        </div>

                        <input 
                            type="range" 
                            min="0" max="100" step="5"
                            value={billablePercent}
                            onChange={(e) => setBillablePercent(Number(e.target.value))}
                            className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />

                        <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-between">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        checked={executionGstEnabled} 
                                        onChange={e => setExecutionGstEnabled(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                </div>
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Charge GST ({gstRate}%)</span>
                            </label>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 font-bold uppercase">Non-Billable / Cash</p>
                                <p className="text-lg font-mono text-amber-400 font-bold">{formatCurrency(executionCash)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. FINANCIAL SUMMARY TABLE (NEW) */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase">
                        <tr>
                            <th className="p-4 text-left">Component</th>
                            <th className="p-4 text-right">Gross Value</th>
                            <th className="p-4 text-right text-red-600">Discount</th>
                            <th className="p-4 text-right bg-blue-50/30 text-blue-900">Taxable Value</th>
                            <th className="p-4 text-right text-slate-500">GST ({gstRate}%)</th>
                            <th className="p-4 text-right font-black">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {/* Execution Row */}
                        <tr>
                            <td className="p-4 font-bold text-slate-700">Execution Scope</td>
                            <td className="p-4 text-right text-slate-600">{formatCurrency(rawExecutionTotal)}</td>
                            <td className="p-4 text-right text-red-600 font-medium">-{formatCurrency(executionDiscountVal)}</td>
                            <td className="p-4 text-right font-bold text-blue-900 bg-blue-50/10">{formatCurrency(taxableExecution)}</td>
                            <td className="p-4 text-right text-slate-500">{executionGstEnabled ? formatCurrency(gstOnExecution) : '₹0'}</td>
                            <td className="p-4 text-right font-bold">{formatCurrency(taxableExecution + (executionGstEnabled ? gstOnExecution : 0))}</td>
                        </tr>
                        {/* Design Row */}
                        <tr>
                            <td className="p-4 font-bold text-slate-700">Design Fee</td>
                            <td className="p-4 text-right text-slate-600">{formatCurrency(rawDesignFee)}</td>
                            <td className="p-4 text-right text-red-600 font-medium">-{formatCurrency(designDiscountVal)}</td>
                            <td className="p-4 text-right font-bold text-blue-900 bg-blue-50/10">{formatCurrency(taxableDesign)}</td>
                            <td className="p-4 text-right text-slate-500">{formatCurrency(gstOnDesign)}</td>
                            <td className="p-4 text-right font-bold">{formatCurrency(taxableDesign + gstOnDesign)}</td>
                        </tr>
                        {/* Grand Total Row */}
                        <tr className="bg-slate-50 font-bold">
                            <td className="p-4 text-indigo-950">GRAND TOTAL</td>
                            <td className="p-4 text-right">{formatCurrency(rawExecutionTotal + rawDesignFee)}</td>
                            <td className="p-4 text-right text-red-700">-{formatCurrency(executionDiscountVal + designDiscountVal)}</td>
                            <td className="p-4 text-right text-blue-900 bg-blue-100/20">{formatCurrency(taxableExecution + taxableDesign)}</td>
                            <td className="p-4 text-right text-slate-600">{formatCurrency(totalGST)}</td>
                            <td className="p-4 text-right text-lg text-indigo-950">{formatCurrency(grossProjectValue)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* 3. BREAKDOWN TABLES */}
            <div className="grid grid-cols-1 gap-8">
                {renderSplitTable(
                    designMilestones, 
                    taxableDesign, 
                    originalNetDesign,
                    false, 
                    "Design Fees"
                )}
                {renderSplitTable(
                    executionMilestones, 
                    taxableExecution, 
                    originalNetExecution,
                    true, 
                    "Execution Milestones"
                )}
            </div>

            {/* 4. REVISION HISTORY */}
            {financials.paymentRevisions && financials.paymentRevisions.length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <h2 className="text-xl font-black text-indigo-950 mb-4 flex items-center gap-2">
                        <span className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><ClockIcon className="w-5 h-5"/></span>
                        Payment Revisions History
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Reason</th>
                                    <th className="p-4 text-right">Execution Value</th>
                                    <th className="p-4 text-right">Design Value</th>
                                    <th className="p-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {[...financials.paymentRevisions].reverse().map((rev) => (
                                    <tr key={rev.id} className="hover:bg-slate-50">
                                        <td className="p-4 text-slate-600">{new Date(rev.date).toLocaleString()}</td>
                                        <td className="p-4 text-indigo-900 font-medium">{rev.reason || 'Manual Revision'}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-slate-400 line-through text-xs">{formatCurrency(rev.previousExecutionValue || 0)}</span>
                                                <span className="text-indigo-600 font-bold">{formatCurrency(rev.newExecutionValue || 0)}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-slate-400 line-through text-xs">{formatCurrency(rev.previousDesignValue || 0)}</span>
                                                <span className="text-indigo-600 font-bold">{formatCurrency(rev.newDesignValue || 0)}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button 
                                                    onClick={() => setCompareRevision(rev)}
                                                    className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors border border-blue-200"
                                                >
                                                    Compare
                                                </button>
                                                <button 
                                                    onClick={() => handleRevertRevision(rev)}
                                                    className="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold transition-colors border border-amber-200"
                                                >
                                                    Revert
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 5. NET RECEIVABLE FOOTER */}
            <div className="bg-indigo-950 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex-1">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gross Project Value</p>
                    <h2 className="text-2xl font-black text-slate-200">{formatCurrency(grossProjectValue)}</h2>
                    <p className="text-[10px] text-slate-500 mt-1">Includes all taxes and cash components</p>
                </div>
                
                <div className="flex-1 border-l border-slate-700 pl-6">
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Total Paid</p>
                    <h2 className="text-2xl font-black text-emerald-300">{formatCurrency(totalPaid)}</h2>
                    <p className="text-[10px] text-slate-500 mt-1">Initiation fee + Paid milestones</p>
                </div>

                <div className="flex-1 border-l border-slate-700 pl-6 text-right">
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Remaining Balance</p>
                    <h2 className="text-4xl font-black text-amber-300">{formatCurrency(remainingBalance)}</h2>
                    <p className="text-[10px] text-slate-500 mt-1">To be collected</p>
                </div>
            </div>

            {/* COMPARE REVISION MODAL */}
            <AnimatePresence>
                {compareRevision && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/50 backdrop-blur-sm p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h2 className="text-xl font-bold text-indigo-950">Version Comparison</h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Comparing <span className="font-semibold text-slate-700">{new Date(compareRevision.date).toLocaleString()}</span> vs Current
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setCompareRevision(null)}
                                    className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                                >
                                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            
                            <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Previous Version */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="bg-slate-50 p-4 border-b border-slate-200">
                                            <h3 className="font-bold text-indigo-900 text-center">Previous Version</h3>
                                            <div className="flex justify-between mt-2 text-sm">
                                                <span className="text-slate-500">Execution: <span className="font-bold text-indigo-950">{formatCurrency(compareRevision.previousExecutionValue)}</span></span>
                                                <span className="text-slate-500">Design: <span className="font-bold text-indigo-950">{formatCurrency(compareRevision.previousDesignValue)}</span></span>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">Milestone Breakdown</h4>
                                            <div className="space-y-2">
                                                {milestones.map(m => {
                                                    const isCleared = m.status === 'paid' || m.status === 'invoiced';
                                                    const baseAmount = m.type === 'execution' ? compareRevision.previousExecutionValue : compareRevision.previousDesignValue;
                                                    const origBase = m.type === 'execution' ? originalNetExecution : originalNetDesign;
                                                    
                                                    // Use lockedTaxableBase if available, otherwise fallback to origBase
                                                    let amount = 0;
                                                    if (isCleared) {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                                                    } else {
                                                        // This is a simplified approximation for the modal
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100); 
                                                    }
                                                    
                                                    const billable = m.type === 'execution' ? amount * (billablePercent / 100) : amount;
                                                    const gst = billable * (m.type === 'execution' ? (executionGstEnabled ? gstRate : 0) : gstRate) / 100;
                                                    let total = billable + gst;
                                                    
                                                    const firstDesignMilestoneId = milestones.find(x => x.type === 'design')?.id;
                                                    if (m.id === firstDesignMilestoneId && initiationFee > 0) {
                                                        total = Math.max(0, total - initiationFee);
                                                    }

                                                    return (
                                                        <div key={m.id} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded border border-slate-100">
                                                            <span className="text-slate-600 truncate pr-2" title={m.name}>{m.percentage}% - {m.name}</span>
                                                            <span className="font-bold text-indigo-950">{formatCurrency(total)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Current Version */}
                                    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden ring-1 ring-indigo-500/10">
                                        <div className="bg-indigo-50 p-4 border-b border-indigo-100">
                                            <h3 className="font-bold text-indigo-900 text-center">Current Version</h3>
                                            <div className="flex justify-between mt-2 text-sm">
                                                <span className="text-indigo-700">Execution: <span className="font-bold text-indigo-900">{formatCurrency(financials.approvedExecutionValue || originalNetExecution)}</span></span>
                                                <span className="text-indigo-700">Design: <span className="font-bold text-indigo-900">{formatCurrency(financials.approvedDesignValue || originalNetDesign)}</span></span>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <h4 className="font-semibold text-xs text-indigo-400 uppercase tracking-wider mb-2">Milestone Breakdown</h4>
                                            <div className="space-y-2">
                                                {milestones.map(m => {
                                                    const isCleared = m.status === 'paid' || m.status === 'invoiced';
                                                    const baseAmount = m.type === 'execution' ? (financials.approvedExecutionValue || originalNetExecution) : (financials.approvedDesignValue || originalNetDesign);
                                                    const origBase = m.type === 'execution' ? originalNetExecution : originalNetDesign;
                                                    
                                                    let amount = 0;
                                                    if (isCleared) {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                                                    } else {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100); 
                                                    }
                                                    
                                                    const billable = m.type === 'execution' ? amount * (billablePercent / 100) : amount;
                                                    const gst = billable * (m.type === 'execution' ? (executionGstEnabled ? gstRate : 0) : gstRate) / 100;
                                                    let total = billable + gst;
                                                    
                                                    const firstDesignMilestoneId = milestones.find(x => x.type === 'design')?.id;
                                                    if (m.id === firstDesignMilestoneId && initiationFee > 0) {
                                                        total = Math.max(0, total - initiationFee);
                                                    }

                                                    return (
                                                        <div key={m.id} className="flex justify-between items-center text-sm p-2 bg-indigo-50/50 rounded border border-indigo-100">
                                                            <span className="text-slate-600 truncate pr-2" title={m.name}>{m.percentage}% - {m.name}</span>
                                                            <span className="font-bold text-indigo-700">{formatCurrency(total)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3">
                                <button 
                                    onClick={() => setCompareRevision(null)}
                                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Close
                                </button>
                                <button 
                                    onClick={() => {
                                        handleRevertRevision(compareRevision);
                                        setCompareRevision(null);
                                    }}
                                    className="px-4 py-2 bg-amber-500 text-white font-bold rounded-lg shadow-sm hover:bg-amber-600 transition-colors flex items-center gap-2"
                                >
                                    <ClockIcon className="w-4 h-4" />
                                    Revert to Previous
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default PaymentCalculatorTab;
