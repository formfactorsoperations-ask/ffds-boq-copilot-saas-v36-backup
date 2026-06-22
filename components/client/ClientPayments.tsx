
import React, { useState } from 'react';
import { PaymentMilestone, ProposalContent, ProjectContext } from '../../types';
import { CalendarIcon, PencilIcon, CheckIcon, ScissorsIcon, DeleteIcon, AlertIcon, PlusIcon } from '../Icons';
import { formatCurrency } from '../../lib/utils';

interface ClientPaymentsProps {
    paymentMilestones: PaymentMilestone[];
    content?: ProposalContent['payments'];
    mode?: 'standard' | 'design_only' | 'pmc';
    projectContext?: ProjectContext;
    onUpdateSchedule?: (milestones: PaymentMilestone[], config: { signupDate?: string, possessionDate?: string }) => void;
    // New props for detailed breakdown
    financials?: {
        design: { taxable: number, gst: number, total: number },
        execution: { taxable: number, gst: number, total: number }
    };
    designTotal?: number; // Legacy prop fallback
    executionTotal?: number; // Legacy prop fallback
}

// Robust Date Helper (Timezone Safe)
const addDays = (dateStr: string, days: number): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    date.setHours(12, 0, 0, 0); 
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
};

const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const getProjectWeek = (startDateStr: string, currentDateStr: string) => {
    if (!startDateStr || !currentDateStr) return '-';
    const start = new Date(startDateStr);
    const current = new Date(currentDateStr);
    const diffTime = current.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return 'Immediate';
    const week = Math.ceil(diffDays / 7);
    return `Week ${week}`;
};

// Default Offsets
const DEFAULT_OFFSETS: Record<string, number> = {
    'd1': 0,   'd2': 10,  'd3': 30,  'd4': 75,
    'e1': 5,   'e2': 15,  'e3': 45,  'e4': 75
};

const ClientPayments: React.FC<ClientPaymentsProps> = ({ paymentMilestones, content, mode = 'standard', projectContext, onUpdateSchedule, financials, designTotal, executionTotal }) => {
    const [isEditing, setIsEditing] = useState(false);
    
    // Derived state from context
    const signupDate = projectContext?.paymentScheduleConfig?.signupDate || new Date().toISOString().split('T')[0];
    const possessionDate = projectContext?.paymentScheduleConfig?.possessionDate || addDays(signupDate, 14);
    const initiationFee = projectContext?.financials?.initiationFeePaid || 4999;

    // --- RECALCULATE DATES ---
    const recalculateDates = (anchors: { start: string, exec: string }, currentMilestones: PaymentMilestone[]) => {
        return currentMilestones.map(m => {
            if (m.isCustom) return m; 

            const isExecution = m.type === 'execution';
            const anchor = isExecution ? anchors.exec : anchors.start;
            
            // Logic to find offset
            let offset = 0;
            const baseId = m.id.split('_')[0];
            if (DEFAULT_OFFSETS[baseId] !== undefined) {
                offset = DEFAULT_OFFSETS[baseId];
                if (m.id.endsWith('_b')) offset += 14; 
            } else {
                offset = isExecution ? 30 : 15;
            }

            return { ...m, date: addDays(anchor, offset) };
        });
    };

    // --- HANDLERS ---

    const handleDateChange = (type: 'signup' | 'possession', val: string) => {
        if (!onUpdateSchedule) return;
        const newConfig = {
            signupDate: type === 'signup' ? val : signupDate,
            possessionDate: type === 'possession' ? val : possessionDate
        };
        const updatedMilestones = recalculateDates({ start: newConfig.signupDate, exec: newConfig.possessionDate }, paymentMilestones);
        onUpdateSchedule(updatedMilestones, newConfig);
    };

    const handleUpdateMilestone = (idx: number, field: keyof PaymentMilestone, value: any) => {
        if (!onUpdateSchedule) return;
        const updated = [...paymentMilestones];
        updated[idx] = { ...updated[idx], [field]: value };
        if (field === 'date') updated[idx].isCustom = true;
        onUpdateSchedule(updated, {});
    };

    const handleSplitMilestone = (idx: number) => {
        if (!onUpdateSchedule) return;
        const original = paymentMilestones[idx];
        const splitA = Math.ceil(original.percentage / 2);
        const splitB = original.percentage - splitA;

        const partA: PaymentMilestone = {
            ...original,
            id: `${original.id}_a`,
            name: `${original.name} (Part 1)`,
            percentage: splitA,
            description: "Initial mobilization / partial order"
        };

        const partB: PaymentMilestone = {
            ...original,
            id: `${original.id}_b`,
            name: `${original.name} (Part 2)`,
            percentage: splitB,
            description: "Balance completion",
            date: original.date ? addDays(original.date, 14) : undefined,
            isCustom: true
        };

        const newMilestones = [...paymentMilestones];
        newMilestones.splice(idx, 1, partA, partB);
        onUpdateSchedule(newMilestones, {});
    };

    const handleDeleteMilestone = (idx: number) => {
        if (!onUpdateSchedule) return;
        const newMilestones = paymentMilestones.filter((_, i) => i !== idx);
        onUpdateSchedule(newMilestones, {});
    };

    const handleResetDefaults = () => {
        if (!onUpdateSchedule || !confirm("Reset payment schedule to defaults? Custom dates will be lost.")) return;
        const defaults: PaymentMilestone[] = [
            { id: 'd1', type: 'design', name: 'Sign-up & Concept', percentage: 20, description: 'Retainer & Concept Direction' },
            { id: 'd2', type: 'design', name: 'Design Development & 3D', percentage: 35, description: 'Layouts, Visuals & Material Selection' },
            { id: 'd3', type: 'design', name: 'Technical Documentation', percentage: 35, description: 'Detailed GFC Drawings & Services' },
            { id: 'd4', type: 'design', name: 'Project Handover & Closeout', percentage: 10, description: 'Project Sign-off & Final Handover' },
            { id: 'e1', type: 'execution', name: 'Material Order Advance', percentage: 10, description: 'Day 1 – Day 5' },
            { id: 'e2', type: 'execution', name: 'Material Procurement + Structural Works', percentage: 40, description: 'Day 10 – Day 20' },
            { id: 'e3', type: 'execution', name: 'Mid Execution (Outer Laminate Start)', percentage: 40, description: 'Day 35 – Day 55' },
            { id: 'e4', type: 'execution', name: 'Completion and Handover', percentage: 10, description: 'Day 60 – Day 75' },
        ];
        const fresh = recalculateDates({ start: signupDate, exec: possessionDate }, defaults);
        onUpdateSchedule(fresh, {});
    };

    const handleAddMilestone = (type: 'design' | 'execution') => {
        if (!onUpdateSchedule) return;
        const newMilestone: PaymentMilestone = {
            id: `new_${Date.now()}`,
            type,
            name: 'New Milestone',
            percentage: 0,
            description: '',
            status: 'pending'
        };
        onUpdateSchedule([...paymentMilestones, newMilestone], {});
    };

    // --- RENDER HELPERS ---
    
    const designMilestones = paymentMilestones.filter(m => m.type === 'design');
    const executionMilestones = paymentMilestones.filter(m => m.type === 'execution');
    const designTotalPercent = designMilestones.reduce((acc, m) => acc + m.percentage, 0);
    const executionTotalPercent = executionMilestones.reduce((acc, m) => acc + m.percentage, 0);

    const renderRow = (m: PaymentMilestone, globalIdx: number, type: 'design' | 'execution', internalIndex: number) => {
        // Use detailed financials if available, else simple calc
        let taxable = 0;
        let gst = 0;
        let total = 0;

        if (financials) {
            const baseData = financials[type];
            // Split logic: Pro-rata distribution
            // Note: This logic assumes percentages are on the TAXABLE base
            taxable = (baseData.taxable * m.percentage) / 100;
            gst = (baseData.gst * m.percentage) / 100;
            total = taxable + gst;
        } else {
            // Fallback for Level 1 or when detailed data missing
            const gross = type === 'design' ? (designTotal || 0) : (executionTotal || 0);
            total = (gross * m.percentage) / 100;
        }

        // Logic for First Design Milestone Deduction
        const isFirstDesign = type === 'design' && internalIndex === 0;
        if (isFirstDesign && initiationFee > 0) {
            // Calculate new net total
            const netTotal = Math.max(0, total - initiationFee);
            
            // Recalculate taxable and GST breakdown based on the NEW net total
            // Assuming tax rate is proportional (e.g. if GST was 18% of taxable, it remains so)
            if (total > 0 && financials) {
                const effectiveTaxRate = financials[type].gst / financials[type].taxable;
                // New formula: NetTotal = NewTaxable * (1 + rate)
                // NewTaxable = NetTotal / (1 + rate)
                
                // Safety check for NaN
                const rate = isNaN(effectiveTaxRate) ? 0 : effectiveTaxRate;
                
                taxable = netTotal / (1 + rate);
                gst = netTotal - taxable;
            } else if (total > 0) {
                // Fallback estimate if no financials
                // Assume 18% GST standard
                taxable = netTotal / 1.18;
                gst = netTotal - taxable;
            }
            
            total = netTotal;
        }

        return (
            <tr key={m.id} className="group hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 border-b border-slate-100 align-top">
                    {isEditing ? (
                        <div className="space-y-1">
                            <input 
                                type="text" 
                                value={m.name} 
                                onChange={(e) => handleUpdateMilestone(globalIdx, 'name', e.target.value)}
                                className="w-full font-bold text-sm bg-white border border-indigo-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <input 
                                type="text" 
                                value={m.description} 
                                onChange={(e) => handleUpdateMilestone(globalIdx, 'description', e.target.value)}
                                className="w-full text-xs text-slate-500 bg-white border border-slate-200 rounded px-2 py-1 outline-none"
                            />
                        </div>
                    ) : (
                        <div>
                            <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                            <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">{m.description}</div>
                        </div>
                    )}
                </td>
                
                <td className="py-3 px-2 text-right border-b border-slate-100 align-top w-16">
                    {isEditing ? (
                        <input 
                            type="number" 
                            value={m.percentage} 
                            onChange={(e) => handleUpdateMilestone(globalIdx, 'percentage', parseInt(e.target.value))}
                            className="w-10 text-right font-bold text-sm bg-white border border-indigo-200 rounded px-1 py-1 outline-none"
                        />
                    ) : (
                        <span className="font-bold text-slate-900 text-sm">{m.percentage}%</span>
                    )}
                </td>

                {/* Breakdown Columns - Only show if detailed financials exist */}
                {financials && (
                    <>
                        <td className="py-3 px-2 text-right border-b border-slate-100 align-top w-24">
                            <span className="text-xs text-slate-500 font-medium">{formatCurrency(taxable)}</span>
                        </td>
                        <td className="py-3 px-2 text-right border-b border-slate-100 align-top w-20">
                            <span className="text-xs text-slate-400">{gst > 0 ? formatCurrency(gst) : '₹0'}</span>
                        </td>
                    </>
                )}

                <td className={`py-3 px-4 text-right border-b border-slate-100 align-top w-32 ${financials ? 'bg-slate-50/50' : ''}`}>
                    {total > 0 ? (
                        <div>
                            <span className="font-mono font-bold text-slate-800 text-sm">{formatCurrency(total)}</span>
                            {isFirstDesign && initiationFee > 0 && (
                                <div className="text-[9px] text-slate-400 italic mt-0.5 whitespace-nowrap">
                                    (Less {formatCurrency(initiationFee)} adj.)
                                </div>
                            )}
                        </div>
                    ) : (
                        <span className="text-xs text-slate-300 italic">-</span>
                    )}
                </td>

                <td className="py-3 px-4 border-b border-slate-100 align-top w-32">
                    {isEditing ? (
                        <input 
                            type="date" 
                            value={m.date || ''} 
                            onChange={(e) => handleUpdateMilestone(globalIdx, 'date', e.target.value)}
                            className="w-full text-xs bg-white border border-indigo-200 rounded px-1 py-1 font-mono text-slate-600 outline-none"
                        />
                    ) : (
                        <div>
                            <div className="font-bold text-indigo-900 text-xs flex items-center gap-2">
                                {formatDate(m.date || '')}
                                {m.isCustom && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" title="Custom Date"></span>}
                            </div>
                            <div className="text-[9px] uppercase font-bold tracking-wider text-indigo-400">
                                {getProjectWeek(signupDate, m.date || '')}
                            </div>
                        </div>
                    )}
                </td>

                {isEditing && (
                    <td className="py-3 px-2 border-b border-slate-100 w-16 text-right align-middle">
                        <div className="flex gap-1 justify-end">
                            {m.percentage >= 10 && (
                                <button 
                                    onClick={() => handleSplitMilestone(globalIdx)}
                                    className="p-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"
                                    title="Split"
                                >
                                    <ScissorsIcon className="w-3 h-3" />
                                </button>
                            )}
                            <button 
                                onClick={() => handleDeleteMilestone(globalIdx)}
                                className="p-1 bg-red-50 text-red-500 rounded hover:bg-red-100"
                                title="Remove"
                            >
                                <DeleteIcon className="w-3 h-3" />
                            </button>
                        </div>
                    </td>
                )}
            </tr>
        );
    }

    const data = content || { title: "Payment Milestones", subtitle: "Payments are tied to clear progress." };

    return (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 relative group/container">
            
            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                <div className="flex-grow">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Commercial Terms</div>
                    <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{data.title}</h2>
                    <p className="mt-2 text-slate-600 max-w-2xl text-sm leading-relaxed whitespace-pre-line">
                        {data.subtitle}
                    </p>
                </div>

                {/* CONTROLS */}
                <div className="flex flex-col items-end gap-3 no-print">
                    <div className="flex gap-2">
                        {isEditing && (
                            <button 
                                onClick={handleResetDefaults}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 transition-colors"
                            >
                                Reset Defaults
                            </button>
                        )}
                        <button 
                            onClick={() => setIsEditing(!isEditing)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm border ${isEditing ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                            {isEditing ? <><CheckIcon className="w-4 h-4" /> Save Schedule</> : <><PencilIcon className="w-4 h-4" /> Customize Milestones</>}
                        </button>
                    </div>
                    
                    {/* Anchor Date Inputs */}
                    <div className={`flex gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100 transition-all ${isEditing ? 'opacity-100 pointer-events-auto' : 'opacity-60 pointer-events-none'}`}>
                        <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Start Date</label>
                            <input type="date" value={signupDate} onChange={e => handleDateChange('signup', e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none w-24 cursor-pointer" />
                        </div>
                        {mode !== 'design_only' && (
                            <div className="flex flex-col pl-3 border-l border-slate-200">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Exec Start</label>
                                <input type="date" value={possessionDate} onChange={e => handleDateChange('possession', e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none w-24 cursor-pointer" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- TABLES --- */}
            <div className={`mt-6 grid gap-8 ${mode === 'standard' || mode === 'pmc' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                
                {/* DESIGN TABLE */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                        <h4 className="font-bold text-slate-700 text-sm">Part A: Design Fees</h4>
                        <div className="text-right">
                            {financials && <span className="block text-xs font-bold text-slate-800">{formatCurrency(financials.design.total)}</span>}
                            {!financials && designTotal && <span className="block text-xs font-bold text-slate-800">{formatCurrency(designTotal)}</span>}
                            <span className={`text-[10px] font-bold ${designTotalPercent !== 100 ? 'text-red-500' : 'text-emerald-600'}`}>
                                Total: {designTotalPercent}%
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[300px]">
                            <thead className="bg-white text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-2">Milestone</th>
                                    <th className="px-2 py-2 text-right">Val</th>
                                    {financials && (
                                        <>
                                            <th className="px-2 py-2 text-right">Base</th>
                                            <th className="px-2 py-2 text-right">GST</th>
                                        </>
                                    )}
                                    <th className="px-4 py-2 text-right">Total</th>
                                    <th className="px-4 py-2">Date</th>
                                    {isEditing && <th className="px-2 py-2"></th>}
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {designMilestones.map((m, i) => renderRow(m, (paymentMilestones || []).indexOf(m), 'design', i))}
                            </tbody>
                        </table>
                        {isEditing && (
                            <div className="p-2 bg-slate-50 border-t border-slate-100 flex justify-center">
                                <button 
                                    onClick={() => handleAddMilestone('design')}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-all"
                                >
                                    <PlusIcon className="w-3 h-3" /> Add Design Milestone
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* EXECUTION TABLE */}
                {mode !== 'design_only' && (
                    <div className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                            <h4 className="font-bold text-slate-700 text-sm">Part B: Execution</h4>
                            <div className="text-right">
                                {financials && <span className="block text-xs font-bold text-slate-800">{formatCurrency(financials.execution.total)}</span>}
                                {!financials && executionTotal && <span className="block text-xs font-bold text-slate-800">{formatCurrency(executionTotal)}</span>}
                                <span className={`text-[10px] font-bold ${executionTotalPercent !== 100 ? 'text-red-500' : 'text-emerald-600'}`}>
                                    Total: {executionTotalPercent}%
                                </span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[300px]">
                                <thead className="bg-white text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-2">Milestone</th>
                                        <th className="px-2 py-2 text-right">Val</th>
                                        {financials && (
                                            <>
                                                <th className="px-2 py-2 text-right">Base</th>
                                                <th className="px-2 py-2 text-right">GST</th>
                                            </>
                                        )}
                                        <th className="px-4 py-2 text-right">Total</th>
                                        <th className="px-4 py-2">Date</th>
                                        {isEditing && <th className="px-2 py-2"></th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-white">
                                    {executionMilestones.map((m, i) => renderRow(m, (paymentMilestones || []).indexOf(m), 'execution', i))}
                                </tbody>
                            </table>
                            {isEditing && (
                                <div className="p-2 bg-slate-50 border-t border-slate-100 flex justify-center">
                                    <button 
                                        onClick={() => handleAddMilestone('execution')}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-all"
                                    >
                                        <PlusIcon className="w-3 h-3" /> Add Execution Milestone
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Warning if totals don't match 100% */}
            {(designTotalPercent !== 100 || (mode !== 'design_only' && executionTotalPercent !== 100)) && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 text-sm font-bold no-print">
                    <AlertIcon className="w-5 h-5" />
                    Warning: Milestone percentages do not add up to 100%. Please adjust.
                </div>
            )}

            <div className="text-[10px] text-slate-400 text-center mt-6 flex flex-col items-center gap-1">
                <p className="italic">* Milestone dates are tied to project progress. Delays in site possession or approvals may shift subsequent dates.</p>
                {mode !== 'design_only' && <p className="font-medium text-indigo-400">Design completes in ~5 weeks. Execution timeline runs parallel post-possession.</p>}
            </div>
        </section>
    );
};

export default ClientPayments;
