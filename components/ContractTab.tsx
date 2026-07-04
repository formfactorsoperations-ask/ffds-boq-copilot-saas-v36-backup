
import React, { useState, useMemo, useEffect } from 'react';
import { ProposalTier, FullBoqItem, Item, TimelinePhase, PaymentMilestone, ContractContent, ProjectContext } from '../types';
import Card from './shared/Card';
import ClientLevel3Contract from './client/ClientLevel3Contract';
import { PrintIcon, PencilIcon, SaveIcon, ExportIcon } from './Icons';
import { formatCurrency } from '../lib/utils';

interface ContractTabProps {
    projectId: string;
    tiers: ProposalTier[];
    activeTier: ProposalTier | undefined;
    timelinePhases: TimelinePhase[];
    bank: Item[];
    projectContext?: ProjectContext; 
    setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

const ContractTab: React.FC<ContractTabProps> = ({ projectId, tiers, activeTier, timelinePhases, bank, projectContext, setProjectContext }) => {
    const [selectedTierId, setSelectedTierId] = useState<string>(activeTier?.id || tiers[0]?.id || '');
    const [isEditing, setIsEditing] = useState(false);

    const selectedTier = useMemo(() => tiers.find(t => t.id === selectedTierId), [tiers, selectedTierId]);
    
    // Prioritize passed projectContext (Live from App), fallback to tier context
    const currentContext = projectContext || selectedTier?.projectContext;
    
    const bankMap = useMemo(() => new Map(bank.map(item => [item.id, item])), [bank]);

    // --- GENERATE DEFAULTS IF MISSING ---
    useEffect(() => {
        if (currentContext && !currentContext.contractContent && setProjectContext) {
            // Trigger default population if empty. 
            setProjectContext(prev => ({
                ...prev,
                contractContent: {
                    ...prev.contractContent,
                    boqPresentationMode: 'detailed'
                } as ContractContent
            }));
        }
    }, [currentContext, setProjectContext]);

    // USE LIVE MILESTONES FROM CONTEXT IF AVAILABLE, ELSE DEFAULTS
    const paymentMilestones: PaymentMilestone[] = currentContext?.paymentMilestones || [
        { id: 'd1', type: 'design', name: 'Sign-up & Concept', percentage: 20, description: 'Retainer & Concept Direction' },
        { id: 'd2', type: 'design', name: 'Design Development & 3D', percentage: 35, description: 'Layouts, Visuals & Material Selection' },
        { id: 'd3', type: 'design', name: 'Technical Documentation', percentage: 35, description: 'Detailed GFC Drawings & Services' },
        { id: 'd4', type: 'design', name: 'Handover & Closeout', percentage: 10, description: 'Final Set Release' },
        { id: 'e1', type: 'execution', name: 'Material Order Advance', percentage: 10, description: 'Day 1 – Day 5' },
        { id: 'e2', type: 'execution', name: 'Material Procurement + Structural Works', percentage: 40, description: 'Day 6 – Day 35' },
        { id: 'e3', type: 'execution', name: 'Mid Execution (Outer Laminate Start)', percentage: 40, description: 'Day 36 – Day 65' },
        { id: 'e4', type: 'execution', name: 'Completion and Handover', percentage: 10, description: 'Day 66 – Day 90' },
    ];

    const fullBoq = useMemo(() => {
        if (!selectedTier) return [];
        return (selectedTier.boq || []).map(boqItem => {
            const bankItem = bankMap.get(boqItem.bankId);
            if (!bankItem) return null;
            const effectiveMargin = boqItem.marginOverride ?? bankItem.margin;
            const { id, ...bankRest } = bankItem;
            return {
                ...bankRest,
                ...boqItem,
                id: boqItem.id,
                margin: effectiveMargin
            };
        }).filter((i): i is FullBoqItem => i !== null);
    }, [selectedTier, bankMap]);

    const handlePrintContract = () => {
        const contractContent = document.querySelector('.contract-container');
        if (!contractContent) {
            alert('Contract content not ready.');
            return;
        }

        const doc = document.cloneNode(true) as Document;
        doc.body.innerHTML = '';
        doc.body.appendChild(contractContent.cloneNode(true));
        doc.body.className = 'bg-white p-0 m-0'; 
        doc.title = `Contract_${selectedTier?.name}`;

        doc.querySelectorAll('.no-print, script[type="module"], script[type="importmap"]').forEach(el => el.remove());
        // Flatten inputs for print
        doc.querySelectorAll('input, textarea').forEach((el: any) => {
            const span = document.createElement('span');
            span.textContent = el.value;
            span.className = el.className;
            // Remove border classes for print clean look
            span.className = span.className.replace(/border-.*?/g, '').replace(/bg-.*?/g, '');
            el.parentNode?.replaceChild(span, el);
        });

        const script = document.createElement('script');
        script.textContent = `
            window.onload = () => {
                setTimeout(() => {
                    window.print();
                }, 800);
            };
        `;
        doc.body.appendChild(script);

        const htmlContent = doc.documentElement.outerHTML;
        const blob = new Blob([`<!DOCTYPE html>${htmlContent}`], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        const pdfWindow = window.open(url, '_blank');
        if (!pdfWindow) {
            alert('Pop-up blocked. Please allow popups for this site to print the contract.');
        }
    };

    const handleExportHtml = () => {
        const contractContent = document.querySelector('.contract-container');
        if (!contractContent) {
            alert('Contract content not ready.');
            return;
        }

        const doc = document.cloneNode(true) as Document;
        const wrapper = contractContent.cloneNode(true) as HTMLElement;
        
        // Remove interactive elements
        wrapper.querySelectorAll('.no-print, button, input[type="checkbox"]').forEach(el => el.remove());
        
        // Convert inputs to text for export
        wrapper.querySelectorAll('input, textarea').forEach((el: any) => {
            const span = document.createElement('span');
            span.textContent = el.value;
            // Basic styling for the text
            span.style.whiteSpace = "pre-wrap";
            el.parentNode?.replaceChild(span, el);
        });

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Contract - ${currentContext?.name}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: "Open Sans", sans-serif; background: white; color: #1e293b; padding: 40px; }
                    .contract-container { max-width: 210mm; margin: 0 auto; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="contract-container">
                    ${wrapper.innerHTML}
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cName = (currentContext?.name || 'Project').replace(/\s+/g, '_');
        const tName = (selectedTier?.name || 'Tier').replace(/\s+/g, '_');
        a.download = `Contract_${cName}_${tName}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleContentUpdate = (newContent: ContractContent) => {
        if (setProjectContext) {
            setProjectContext(prev => ({ ...prev, contractContent: newContent }));
        }
    };

    const handleUpdateSchedule = (milestones: PaymentMilestone[]) => {
        if (setProjectContext) {
            setProjectContext(prev => ({ ...prev, paymentMilestones: milestones }));
        }
    };

    if (!currentContext) return null;

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <Card title="Level 3: Execution Agreement" titleIcon={<span className="text-xl">⚖️</span>}>
                <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-slate-50 rounded-xl no-print justify-between">
                    <div className="flex-grow max-w-md">
                        <label className="text-xs font-bold text-slate-500 uppercase">Select Approved Option for Contract</label>
                        <select 
                            value={selectedTierId} 
                            onChange={e => setSelectedTierId(e.target.value)}
                            className="w-full p-2 bg-white border rounded-lg mt-1"
                        >
                            {tiers.map((t, idx) => {
                                const total = t.summary.totalSell > 0 ? t.summary.totalSell : 'N/A';
                                return (
                                    <option key={`${t.id}-${idx}`} value={t.id}>{t.name} - {typeof total === 'number' ? formatCurrency(total) : total}</option>
                                )
                            })}
                        </select>
                    </div>
                    <div className="flex gap-3 mt-5 md:mt-0">
                        <button 
                            onClick={() => setIsEditing(!isEditing)}
                            className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-2 ${isEditing ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                        >
                            {isEditing ? <><SaveIcon className="w-3.5 h-3.5"/> Done Editing</> : <><PencilIcon className="w-3.5 h-3.5" /> Edit Text</>}
                        </button>
                        <button 
                            type="button"
                            onClick={handleExportHtml}
                            className="px-5 py-2 bg-white text-slate-700 border border-slate-300 font-bold text-xs rounded-xl shadow-sm hover:bg-slate-50 flex items-center gap-2 transition-transform active:scale-95"
                        >
                            <ExportIcon className="w-3.5 h-3.5"/> Export HTML
                        </button>
                        <button 
                            type="button"
                            onClick={handlePrintContract}
                            className="px-6 py-2 bg-indigo-900 text-white font-bold text-xs rounded-xl shadow-lg hover:bg-indigo-950 flex items-center gap-2 transition-transform active:scale-95"
                        >
                            <PrintIcon className="w-3.5 h-3.5"/> Print PDF
                        </button>
                    </div>
                </div>

                {selectedTier ? (
                    <div className="contract-container bg-slate-100 p-8 rounded-xl shadow-inner overflow-auto max-h-[800px] border border-slate-200 print:max-h-none print:overflow-visible print:bg-white print:p-0 print:border-none print:shadow-none">
                        <ClientLevel3Contract 
                            projectId={projectId}
                            tier={selectedTier} 
                            projectContext={currentContext!} 
                            setProjectContext={setProjectContext}
                            fullBoq={fullBoq} 
                            timelinePhases={timelinePhases} 
                            paymentMilestones={paymentMilestones} 
                            isEditing={isEditing}
                            onContentUpdate={handleContentUpdate}
                            onUpdateSchedule={handleUpdateSchedule}
                        />
                    </div>
                ) : (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                        <p className="text-slate-400 text-sm">Select an approved option to view the Level 3 Execution Agreement.</p>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ContractTab;
