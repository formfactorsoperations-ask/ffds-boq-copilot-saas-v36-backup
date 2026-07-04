
import React, { useMemo, useEffect, useState } from 'react';
import { ProposalTier, ProjectContext, TimelinePhase, PaymentMilestone, FullBoqItem, ContractContent, ContractClause, ContractSubClause } from '../../types';
import { formatCurrency, calculateSellPrice, id as generateId } from '../../lib/utils';
import { FFDSLogo } from '../FFDSLogo';
import { PlusIcon, DeleteIcon, ShieldCheckIcon, AlertIcon, CheckBadgeIcon } from '../Icons';
import { useOrg } from '../../contexts/OrgContext';
import { functions } from '../../services/firebaseClient';
import { httpsCallable } from 'firebase/functions';
import { sendAgreementSignoffRequest } from '../../services/emailService';

interface ClientLevel3ContractProps {
    projectId?: string;
    tier: ProposalTier;
    projectContext: ProjectContext;
    setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
    fullBoq: FullBoqItem[];
    timelinePhases: TimelinePhase[];
    paymentMilestones: PaymentMilestone[];
    isEditing?: boolean;
    onContentUpdate?: (newContent: ContractContent) => void;
    onUpdateSchedule?: (milestones: PaymentMilestone[]) => void;
    settings?: any;
}

const SCOPE_TEMPLATES: Record<string, { excluded: string, optional: string }> = {
    'living': {
        excluded: "Loose furniture (sofa, coffee table, chairs), soft furnishings, decorative artifacts, wall art, TV, music system.",
        optional: "Wall panelling upgrades, additional lighting points."
    },
    'kitchen': {
        excluded: "White goods (hob, chimney, fridge, microwave, oven), loose organizers, gas pipeline work.",
        optional: "Premium hardware (Blum/Hafele), Quartz countertop upgrade."
    },
    'bedroom': {
        excluded: "Mattress, loose side tables, chairs, bed linen, curtains, AC machine.",
        optional: "Wardrobe internal organizers, dresser lighting."
    },
    'bathroom': {
        excluded: "Geyser, exhaust fan, accessories set, specialty fittings.",
        optional: "Glass shower partition, vanity counter."
    },
    'default': {
        excluded: "Civil work not explicitly mentioned, external windows, society deposits, debris removal beyond allowance.",
        optional: "Premium finish upgrades."
    }
};

const getScopeDetails = (roomName: string) => {
    const lower = roomName.toLowerCase();
    if (lower.includes('kitchen')) return SCOPE_TEMPLATES['kitchen'];
    if (lower.includes('bed') || lower.includes('master') || lower.includes('guest') || lower.includes('kid')) return SCOPE_TEMPLATES['bedroom'];
    if (lower.includes('bath') || lower.includes('toilet')) return SCOPE_TEMPLATES['bathroom'];
    if (lower.includes('living') || lower.includes('dining')) return SCOPE_TEMPLATES['living'];
    return SCOPE_TEMPLATES['default'];
};

// Helper to estimate duration based on config if timeline is empty
const getEstimatedDuration = (config: string, phases: TimelinePhase[]) => {
    // 1. If phases exist, sum them (User defined timeline)
    const phaseSum = phases.reduce((sum, p) => sum + p.durationDays, 0);
    if (phaseSum > 0) return phaseSum;

    // 2. Fallback to Config-based estimates
    const c = (config || '').toLowerCase();
    if (c.includes('1-bhk') || c.includes('studio')) return 45;
    if (c.includes('2-bhk')) return 60;
    if (c.includes('3-bhk')) return 75;
    if (c.includes('4-bhk') || c.includes('duplex')) return 90;
    if (c.includes('bath')) return 25;
    
    return 60; // Safe default
};

const EditableText: React.FC<{
    isEditing: boolean;
    value: string;
    onChange: (val: string) => void;
    className?: string;
    multiline?: boolean;
    placeholder?: string;
}> = ({ isEditing, value, onChange, className = "", multiline = false, placeholder }) => {
    const [localValue, setLocalValue] = useState(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const handleBlur = () => {
        if (localValue !== value) {
            onChange(localValue);
        }
    };

    if (isEditing) {
        if (multiline) {
            return (
                <textarea
                    value={localValue}
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    className={`w-full bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none resize-none transition-shadow shadow-inner ${className}`}
                    rows={6}
                />
            )
        }
        return (
            <input
                type="text"
                value={localValue}
                onChange={e => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                placeholder={placeholder}
                className={`w-full bg-blue-50 border-b-2 border-blue-300 focus:border-blue-500 outline-none px-2 py-1 rounded-t-md transition-colors ${className}`}
            />
        );
    }
    return <span className={`whitespace-pre-line block ${className}`}>{value || ''}</span>;
};

const ContractSection: React.FC<{ number: number; title: React.ReactNode; children: React.ReactNode, className?: string }> = ({ number, title, children, className = "" }) => (
    <div className={`mb-12 break-inside-avoid ${className}`}>
        <h3 className="text-xl font-bold text-indigo-950 uppercase tracking-wide border-b-2 border-indigo-950 pb-3 mb-6 font-opensans flex gap-2 items-start">
            <span className="text-slate-400">{number}.</span> 
            <div className="flex-grow">{title}</div>
        </h3>
        <div className="text-sm text-slate-700 leading-relaxed font-opensans">
            {children}
        </div>
    </div>
);

const formatContractDate = (dateStr?: string) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
};

const PaymentTable: React.FC<{ 
    milestones: PaymentMilestone[], 
    isEditing?: boolean,
    onUpdateMilestone?: (id: string, field: keyof PaymentMilestone, value: any) => void,
    onAddMilestone?: () => void,
    onDeleteMilestone?: (id: string) => void
}> = ({ milestones, isEditing, onUpdateMilestone, onAddMilestone, onDeleteMilestone }) => (
    <div className="mb-6 break-inside-avoid shadow-sm rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
            <thead className="bg-indigo-950 text-white font-bold text-[10px] uppercase">
                <tr>
                    <th className="text-left p-3 w-1/4">Stage</th>
                    <th className="text-left p-3">Milestone Trigger</th>
                    <th className="text-right p-3 w-24">% Value</th>
                    <th className="text-left p-3 w-32 border-l border-slate-700">Due Date</th>
                    {isEditing && <th className="w-10"></th>}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
                {milestones.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50 group">
                        <td className="p-3 font-bold text-indigo-900">
                            {isEditing ? (
                                <input 
                                    type="text" 
                                    value={m.name} 
                                    onChange={(e) => onUpdateMilestone && onUpdateMilestone(m.id, 'name', e.target.value)}
                                    className="w-full bg-white border border-indigo-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                            ) : m.name}
                        </td>
                        <td className="p-3 text-slate-600 text-xs">
                            {isEditing ? (
                                <input 
                                    type="text" 
                                    value={m.description} 
                                    onChange={(e) => onUpdateMilestone && onUpdateMilestone(m.id, 'description', e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 outline-none"
                                />
                            ) : m.description}
                        </td>
                        <td className="text-right p-3 font-mono font-bold text-indigo-950">
                            {isEditing ? (
                                <div className="flex items-center justify-end">
                                    <input 
                                        type="number" 
                                        value={m.percentage} 
                                        onChange={(e) => onUpdateMilestone && onUpdateMilestone(m.id, 'percentage', parseInt(e.target.value))}
                                        className="w-12 text-right bg-white border border-indigo-200 rounded px-1 py-1 outline-none"
                                    />
                                    <span className="ml-1">%</span>
                                </div>
                            ) : `${m.percentage}%`}
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-xs border-l border-slate-100 whitespace-nowrap">
                            {isEditing ? (
                                <input 
                                    type="date" 
                                    value={m.date} 
                                    onChange={(e) => onUpdateMilestone && onUpdateMilestone(m.id, 'date', e.target.value)}
                                    className="w-full bg-white border border-indigo-200 rounded px-1 py-1 outline-none"
                                />
                            ) : formatContractDate(m.date)}
                        </td>
                        {isEditing && (
                            <td className="p-2 text-center">
                                <button 
                                    onClick={() => onDeleteMilestone && onDeleteMilestone(m.id)}
                                    className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Delete Milestone"
                                >
                                    <DeleteIcon className="w-4 h-4" />
                                </button>
                            </td>
                        )}
                    </tr>
                ))}
            </tbody>
        </table>
        {isEditing && (
            <div className="bg-slate-50 p-2 border-t border-slate-200 flex justify-center">
                <button 
                    onClick={onAddMilestone}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
                >
                    <PlusIcon className="w-3 h-3" /> Add Milestone
                </button>
            </div>
        )}
    </div>
);

// --- NEW EXECUTION BLOCK (ADMIN CONTROLLED & CLIENT AUTO) ---
const ExecutionBlock: React.FC<{ clientName: string, location: string, projectId: string, setProjectContext: any, projectContext: ProjectContext, grandTotal: number }> = ({ clientName, location, projectId, setProjectContext, projectContext, grandTotal }) => {
    const { orgData } = useOrg();
    const [isSending, setIsSending] = useState(false);
    const [showSendConfirm, setShowSendConfirm] = useState(false);
    const [showMarkManual, setShowMarkManual] = useState(false);
    const [manualRef, setManualRef] = useState("Digital Confirmation");
    const [localError, setLocalError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const currentSignoff = projectContext.contractSignoff;
    const status = currentSignoff?.status || 'pending';

    const getSignoffUrl = (token: string) => {
        let appDomain = import.meta.env.VITE_APP_DOMAIN || window.location.origin;
        if (appDomain.includes('ais-dev-')) {
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        return `${appDomain}/?agreementSignoff=${token}`;
    };

    const sendEmailSignoff = async () => {
        setLocalError(null);
        if (!projectContext.clientEmail || !projectContext.clientEmail.trim()) {
            setLocalError("Client email is required to send the digital agreement. Please enter a valid email address in the input field below.");
            return;
        }

        setIsSending(true);
        try {
            // Wait briefly to ensure UI is ready
            await new Promise(r => setTimeout(r, 100));
            const element = document.getElementById('execution-contract-root');
            let pdfBase64;
            if (element) {
                try {
                    const html2pdfModule = await import('html2pdf.js');
                    const html2pdfObj = ((html2pdfModule as any).default || html2pdfModule) as any;
                    
                    if (typeof html2pdfObj !== 'function') {
                        throw new Error("html2pdf library loaded incorrectly");
                    }
                    
                    const opt = {
                        margin:       [10, 10, 15, 10] as [number, number, number, number], // top, left, bottom, right
                        filename:     'Execution_Agreement.pdf',
                        image:        { type: 'jpeg' as const, quality: 0.98 },
                        html2canvas:  { scale: 2, useCORS: true, logging: false },
                        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
                    };
                    pdfBase64 = await html2pdfObj().set(opt).from(element).outputPdf('datauristring');
                } catch (pdfErr) {
                    console.error("PDF generation failed, falling back without attachment", pdfErr);
                }
            }

            const result = await sendAgreementSignoffRequest(projectId || '', projectContext, grandTotal, pdfBase64, orgData?.tenantId || 'demo-tenant-01');
            
            if (!result.success) {
                setLocalError(`Error sending email (domain not verified?): ${result.error}`);
                // Status not updated, email failed
                return;
            }

            const newSignoff = {
                status: 'sent',
                token: result.token,
                sentAt: new Date().toISOString()
            };

            setProjectContext?.((prev: any) => ({ ...prev, contractSignoff: newSignoff }));
            setShowSendConfirm(false);
        } catch (err: any) {
            setLocalError(`System error: ${err.message}`);
        } finally {
            setIsSending(false);
        }
    };

    const handleMarkExecuted = () => {
        setLocalError(null);
        if (!manualRef.trim()) {
            setLocalError("Please enter an approval reference.");
            return;
        }
        const newSignoff = {
            status: 'signed',
            clientName: 'Manual Ops Entry',
            ipAddress: 'Internal',
            refId: manualRef,
            signedAt: new Date().toISOString()
        };
        setProjectContext?.((prev: any) => ({ ...prev, contractSignoff: newSignoff, contractStatus: 'executed' }));
        setShowMarkManual(false);
    };

    const handleReset = () => {
        // We can just reset directly because it is an admin action, or add a quick confirm UI if we want
        setProjectContext?.((prev: any) => ({ ...prev, contractSignoff: { status: 'pending' }, contractStatus: 'pending' }));
    };

    const handleCopy = (txt: string) => {
        navigator.clipboard.writeText(txt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // View: EXECUTED (Stamped)
    if (status === 'signed') {
        const timestamp = currentSignoff?.signedAt ? new Date(currentSignoff.signedAt).toLocaleString() : 'N/A';
        const refIdText = currentSignoff?.refId || `Token: ${currentSignoff?.token?.slice(-6) || 'Manual'}`;

        return (
            <div className="mt-12 relative group break-inside-avoid">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur opacity-10 group-hover:opacity-20 transition duration-500"></div>
                <div className="relative bg-white border-2 border-emerald-500/30 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between overflow-hidden gap-4">
                    <div className="absolute -right-4 -bottom-4 text-emerald-50 opacity-20 pointer-events-none">
                        <CheckBadgeIcon className="w-32 h-32" />
                    </div>
                    <div className="flex-1 z-10 w-full sm:w-auto">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-emerald-100 text-emerald-700 p-1 rounded-full"><CheckBadgeIcon className="w-5 h-5"/></span>
                            <h4 className="text-lg font-black text-emerald-800 uppercase tracking-widest">Digitally Executed</h4>
                        </div>
                        <p className="text-sm text-slate-600 font-medium">
                            Authorized by <span className="font-bold text-indigo-950">{currentSignoff?.clientName || clientName}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1 font-mono">Ref: {refIdText} • {timestamp}</p>
                        {currentSignoff?.ipAddress && currentSignoff?.ipAddress !== 'Internal' && (
                            <p className="text-[10px] text-slate-400 font-mono mt-1">IP: {currentSignoff.ipAddress}</p>
                        )}
                        <div className="mt-3">
                            <button onClick={handleReset} className="text-xs text-slate-400 font-bold hover:text-slate-600 underline cursor-pointer">Reset to Pending (Admin)</button>
                        </div>
                    </div>
                    <div className="text-right z-10 shrink-0">
                        <div className="border-2 border-emerald-600 text-emerald-700 px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest rotate-[-12deg] opacity-80 inline-block bg-white">
                            {currentSignoff?.ipAddress === 'Internal' ? 'Studio Verified' : 'Client Signed'}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // View: SENT
    if (status === 'sent') {
        const sentTimestamp = currentSignoff?.sentAt ? new Date(currentSignoff.sentAt).toLocaleString() : 'N/A';
        const link = currentSignoff?.token ? getSignoffUrl(currentSignoff.token) : '';

        return (
            <div className="mt-12 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl p-6 relative break-inside-avoid">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex-grow w-full md:w-auto">
                         <h4 className="text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                             Awaiting Client Signature
                         </h4>
                         <p className="text-xs max-w-xl">
                             Digital agreement active at {sentTimestamp}. Sent to <strong>{projectContext.clientEmail || 'Client'}</strong>.
                         </p>

                         {/* Direct Signature / Presentation Link for Sandbox/User */}
                         {link && (
                             <div className="mt-4 p-4 bg-white rounded-lg border border-amber-200 shadow-sm">
                                 <div className="flex items-center justify-between mb-2 pb-2 border-b border-amber-100">
                                     <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Digital Sign-Off URL</span>
                                     <button 
                                         onClick={() => handleCopy(link)}
                                         className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold rounded transition-all flex items-center gap-1 cursor-pointer"
                                     >
                                         {copied ? "Copied!" : "Copy Link"}
                                     </button>
                                 </div>
                                 <div className="text-[11px] font-mono break-all text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                                     {link}
                                 </div>
                                 <div className="mt-3 flex gap-2">
                                     <a 
                                         href={link} 
                                         target="_blank" 
                                         rel="noopener noreferrer" 
                                         className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold tracking-tight inline-flex items-center gap-1 shadow-sm cursor-pointer"
                                     >
                                         Open Sign-Off Screen &rarr;
                                     </a>
                                 </div>
                             </div>
                         )}

                         <div className="flex items-center gap-2 mt-4 text-xs font-bold">
                             <button onClick={() => setShowSendConfirm(true)} disabled={isSending} className="underline text-amber-700 hover:text-amber-900 cursor-pointer">
                                 {isSending ? 'Sending...' : 'Resend Email'}
                             </button>
                             <span className="text-amber-300">|</span>
                             <button onClick={handleReset} className="underline text-amber-700 hover:text-amber-900 cursor-pointer">Cancel Request</button>
                         </div>
                         {showSendConfirm && (
                             <div className="mt-4 p-4 border border-amber-300 bg-amber-100 rounded flex flex-col gap-2">
                                 <p className="text-xs font-bold">Confirm Resend Execution Agreement?</p>
                                 <div className="flex items-center gap-2">
                                     <button onClick={sendEmailSignoff} className="px-3 py-1 bg-amber-600 text-white rounded text-xs cursor-pointer">Yes, Resend</button>
                                     <button onClick={() => setShowSendConfirm(false)} className="px-3 py-1 bg-transparent border border-amber-600 text-amber-700 rounded text-xs cursor-pointer">Cancel</button>
                                 </div>
                             </div>
                         )}
                         {localError && <p className="text-red-600 text-xs mt-2">{localError}</p>}
                    </div>
                    <div className="no-print shrink-0 border-l border-amber-200 pl-6 space-y-2 w-full md:w-auto">
                        <button 
                            onClick={() => setShowMarkManual(!showMarkManual)}
                            className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-800 text-[10px] font-bold rounded-lg shadow-sm hover:bg-amber-100 transition-all uppercase tracking-widest cursor-pointer"
                        >
                            Override: Mark Executed
                        </button>
                        {showMarkManual && (
                             <div className="mt-2 p-3 border border-amber-300 bg-amber-100 rounded flex flex-col gap-2">
                                 <input type="text" value={manualRef} onChange={e => setManualRef(e.target.value)} className="text-xs p-1 border rounded w-full" placeholder="Reference (e.g. WhatsApp)" />
                                 <div className="flex items-center gap-2">
                                     <button onClick={handleMarkExecuted} className="px-3 py-1 bg-amber-700 text-white rounded text-xs cursor-pointer">Confirm Override</button>
                                     <button onClick={() => setShowMarkManual(false)} className="px-3 py-1 bg-transparent border border-amber-700 text-amber-800 rounded text-xs cursor-pointer">Cancel</button>
                                 </div>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // View: PENDING (Instructions)
    return (
        <div className="mt-12 bg-slate-50 border border-slate-200 rounded-xl p-6 relative break-inside-avoid">
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                <div className="flex-grow">
                    <h4 className="text-sm font-bold text-indigo-950 uppercase tracking-widest mb-2 flex items-center gap-2">
                        Execution Protocol
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-xl mb-4">
                        <strong>No physical signature required.</strong> To execute this agreement, click "Send agreement" to securely email the digital sign-off link to the client.
                    </p>

                    {/* Client Email Entry Input */}
                    <div className="mt-4 mb-5 p-4 border rounded-xl bg-indigo-50/50 border-indigo-150 max-w-xl">
                        <label className="block text-[11px] font-bold text-indigo-950 uppercase tracking-wider mb-1.5">
                            Client Email Address Setup
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input 
                                type="email" 
                                value={projectContext.clientEmail || ''} 
                                onChange={e => {
                                    const emailVal = e.target.value;
                                    setProjectContext?.((prev: any) => ({ ...prev, clientEmail: emailVal }));
                                }} 
                                className="flex-grow text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm" 
                                placeholder="Enter client's email address (e.g. client@example.com)" 
                            />
                            {projectContext.clientEmail && projectContext.clientEmail.includes('@') ? (
                                <span className="bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-bold tracking-tight rounded-md px-3 py-2 flex items-center justify-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                    Configured
                                </span>
                            ) : (
                                <span className="bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold tracking-tight rounded-md px-3 py-2 flex items-center justify-center gap-1">
                                    &#9888; Email Missing
                                </span>
                            )}
                        </div>
                        {!projectContext.clientEmail && (
                            <p className="text-[10px] text-red-600 font-semibold mt-2">
                                * An email address is required to dispatch the execution link. Please enter it above.
                            </p>
                        )}
                    </div>
                    {localError && (
                        <div className="text-red-600 text-xs mb-4 p-3.5 bg-red-50 rounded-lg border border-red-200/60 leading-relaxed">
                            <div className="font-bold mb-1">Email Transfer Interrupted:</div>
                            <p className="text-slate-600 text-[11px] mb-2">
                                {localError}
                            </p>
                            <div className="pt-2.5 border-t border-red-200/50 flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="font-bold text-red-800 text-[10px] uppercase tracking-wider block">Sandbox Controls:</span>
                                <button 
                                    onClick={async () => {
                                        setLocalError(null);
                                        setIsSending(true);
                                        try {
                                            const randomPart = Math.random().toString(36).substring(2, 15);
                                            const token = `AGREEMENT_${projectId}_${randomPart}`;
                                            const newSignoff = {
                                                status: 'sent',
                                                token: token,
                                                sentAt: new Date().toISOString()
                                            };
                                            setProjectContext?.((prev: any) => ({ ...prev, contractSignoff: newSignoff }));
                                        } catch (e: any) {
                                            setLocalError(e.message);
                                        } finally {
                                            setIsSending(false);
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md text-[10px] shadow-sm uppercase tracking-wider cursor-pointer inline-block text-center"
                                >
                                    Force Generate Digital Sign-Off Link (Sandbox Bypass)
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Admin Control - Hidden in Print */}
                <div className="no-print shrink-0 flex flex-col gap-2 min-w-[200px]">
                    {!showSendConfirm ? (
                        <button 
                            onClick={() => setShowSendConfirm(true)}
                            disabled={isSending}
                            className="flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition-all w-full"
                        >
                            <ShieldCheckIcon className="w-4 h-4" /> {isSending ? 'Sending...' : 'Send to Client'}
                        </button>
                    ) : (
                        <div className="p-3 border border-indigo-200 bg-indigo-50 rounded-lg flex flex-col gap-2">
                            <p className="text-xs font-bold text-indigo-900">Send Agreement via Email?</p>
                            <div className="flex items-center gap-2">
                                <button onClick={sendEmailSignoff} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-xs flex-1">Confirm</button>
                                <button onClick={() => setShowSendConfirm(false)} className="px-3 py-1 bg-white border border-indigo-200 text-indigo-700 font-bold rounded text-xs flex-1">Cancel</button>
                            </div>
                        </div>
                    )}
                    
                    {!showMarkManual ? (
                        <button 
                            onClick={() => setShowMarkManual(true)}
                            className="flex justify-center items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-[10px] uppercase tracking-widest font-bold rounded-lg hover:bg-slate-50 transition-all w-full"
                        >
                            Mark Manually
                        </button>
                    ) : (
                        <div className="p-3 border border-slate-200 bg-white shadow-sm rounded-lg flex flex-col gap-2 mt-2">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Manual Approval Reference</p>
                            <input type="text" value={manualRef} onChange={e => setManualRef(e.target.value)} className="text-xs p-2 border border-slate-200 rounded w-full outline-none focus:border-slate-400" placeholder="e.g. Email from Client" />
                            <div className="flex items-center gap-2">
                                <button onClick={handleMarkExecuted} className="px-3 py-2 bg-indigo-900 hover:bg-indigo-950 text-white font-bold rounded text-xs flex-1">Mark Executed</button>
                                <button onClick={() => setShowMarkManual(false)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded text-xs flex-1">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Print Fallback Visual Lines (Low opacity to de-emphasize but provide structure) */}
            <div className="mt-8 pt-6 border-t border-slate-200/60 grid grid-cols-2 gap-12 opacity-40 grayscale print:opacity-60">
                <div>
                    <div className="h-8 border-b border-slate-300 mb-1"></div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Client Authorization</p>
                </div>
                <div>
                    <div className="h-8 border-b border-slate-300 mb-1"></div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Studio Representative</p>
                </div>
            </div>
        </div>
    );
}

const ClientLevel3Contract: React.FC<ClientLevel3ContractProps> = ({ projectId, tier, projectContext, setProjectContext, fullBoq = [], timelinePhases = [], paymentMilestones = [], isEditing = false, onContentUpdate, onUpdateSchedule, settings }) => {
    const { orgData } = useOrg();
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const isDesignOnly = projectContext.proposalType === 'DESIGN_ONLY';
    
    const [operativeBoq, setOperativeBoq] = useState<any>(null);
    const [isLoadingBoq, setIsLoadingBoq] = useState(false);

    useEffect(() => {
        if (projectContext.operativeBoqVersion && projectId && functions) {
            setIsLoadingBoq(true);
            const getBoq = httpsCallable(functions, 'getOperativeBoq');
            getBoq({ orgId: orgData.tenantId, projectId })
                .then(res => {
                    setOperativeBoq(res.data);
                    setIsLoadingBoq(false);
                })
                .catch(err => {
                    console.error("Failed to load operative BOQ", err);
                    setIsLoadingBoq(false);
                });
        }
    }, [projectContext.operativeBoqVersion, projectId, orgData.tenantId]);

    const activeBoqList = (operativeBoq?.itemsSnapshot && !isEditing) ? operativeBoq.itemsSnapshot : fullBoq;
    const isShowingOperative = !!(operativeBoq?.itemsSnapshot && !isEditing);

    // Check GST Status
    const isExecutionGstWaived = projectContext?.financials?.executionGstEnabled === false;
    const gstNote = isExecutionGstWaived 
        ? "GST @ 18% applicable only on Design Fees. Execution billing is net of taxes (Vendor Direct / Cash)." 
        : "GST @ 18% applicable on all invoices.";

    // Calculate smart duration
    const calculatedDuration = getEstimatedDuration(projectContext.config, timelinePhases);

    // --- BALANCED DEFAULT CONTENT ---
    const defaultContent: ContractContent = {
        boqPresentationMode: 'detailed',
        titleLine1: "Execution Agreement",
        titleLine2: "Design-Led Turnkey Interior Execution",
        subTitle: "Project ID: PRE-" + new Date().getFullYear() + "-001",
        overviewTitle: "Preamble & Definitions",
        overviewText: `This Execution Agreement (“Agreement”) is entered into between ${projectContext.clientName || 'the Client'} and ${settings?.companyName || orgData.orgName || 'The Studio'}.\n\nThis Agreement governs the execution of interior works strictly as defined in the approved Level-2 Detailed Planning Proposal and the final BOQ. This document constitutes the final and binding understanding between the Client and ${settings?.companyName || orgData.orgName || 'The Studio'} with respect to scope, commercials, timelines, and responsibilities.`,
        scopeTitle: "Scope of Work – Room Wise",
        scopeNote: "Only items explicitly listed below form part of this contract. Any item, work, material, or service not expressly mentioned shall be deemed excluded.",
        boqTitle: "Final BOQ & Technical Specifications",
        boqNote: "The BOQ forms an integral part of this Agreement. All quantities, finishes, brands, and specifications are locked post sign-off. Any deviation shall be treated as a Change Request.",
        deliverablesTitle: "Design Deliverables & Revision Policy",
        deliverablesText: `• Good for Construction (GFC) drawings – Civil, Electrical, Plumbing, Carpentry\n• 3D Visuals – 3 to 4 views per room\n• Material & Selection Sheets`,
        revisionsText: orgData.defaultContractWordings?.revisionsText || `• Up to 2 major revision rounds per room during the design phase.\n• Any change requested after design sign-off or after execution commencement shall be treated as a Change Request with cost and timeline implications.`,
        paymentTitle: "Payment Terms & Execution Linkage",
        paymentNote: orgData.defaultContractWordings?.paymentTermsText || "",
        changeTitle: "Change Management (Variation Policy)",
        changeText: "Any addition, deletion, or modification to scope, specifications, materials, or design after sign-off must follow the Change Request process:\n1. Written request via email or WhatsApp.\n2. Cost and timeline impact assessment by Studio.\n3. Written approval prior to execution.",
        responsibilitiesTitle: "Mutual Commitments (Roles)",
        clientObsText: orgData.defaultContractWordings?.clientObsText || `• Timely approvals within 48 hours.\n• Adherence to payment schedule.\n• Providing uninterrupted site access, power, water, and permissions.\n• Clearing vendor invoices for client-procured items (As-Actuals).`,
        ffdsObsText: `• Translating approved design intent accurately to execution.\n• Providing periodic site supervision as per execution requirements.\n• Weekly progress updates via agreed communication channel.\n• Coordinating snag identification and rectification prior to handover.`,
        protocolsTitle: "Communication & Handover",
        commProtocolText: `Primary communication shall be through the official WhatsApp group and email. Escalations shall follow: Project Lead → Design Principal.`,
        forceMajeureText: orgData.defaultContractWordings?.forceMajeureText || `Execution timelines may extend due to:\n• Client-side delays (approvals, payments, scope changes)\n• Society or building restrictions\n• Vendor delays for client-procured items\n• Force majeure events beyond Studio control`,
        signoffTitle: "Acceptance & Sign-off",
        footerText: "Digitally generated by Copilot.",
        durationText: `${calculatedDuration} Days`,
        customClauses: [
            {
                id: 'as_actuals',
                title: "As-Actuals Items Clarification",
                text: `Items marked as “As Actuals” (e.g. Tiles, Sanitaryware, Lights) indicate Studio coordination, design specification, and execution integration only. Final procurement cost, vendor billing, and payments for such items shall be borne directly by the Client unless explicitly included in the BOQ rates.`
            },
            {
                id: 'dlp_clause',
                title: "Defect Liability Period (Warranty)",
                text: `The studio provides a warranty of ${settings?.projectTerms?.warrantyPeriod || '12 Months'} from project handover.`,
                subClauses: [
                    { id: 'dlp_1', title: "Coverage", text: "Workmanship defects in Joinery, Electrical, Plumbing, and Finishes." },
                    { id: 'dlp_2', title: "Exclusions", text: "Physical damage, water leakage from building source, voltage fluctuations, and normal wear & tear." }
                ]
            }
        ]
    };

    const content = projectContext.contractContent || defaultContent;

    useEffect(() => {
        if (!projectContext.contractContent && onContentUpdate) {
            onContentUpdate(defaultContent);
        }
    }, []);

    const updateContent = (field: keyof ContractContent, value: any) => {
        if (onContentUpdate) {
            onContentUpdate({ ...content, [field]: value });
        }
    };

    const handleScopeOverride = (roomName: string, type: 'included' | 'excluded', text: string) => {
        const overrides = content.scopeOverrides || {};
        const roomOverrides = overrides[roomName] || {};
        
        const newOverrides = {
            ...overrides,
            [roomName]: {
                ...roomOverrides,
                [type]: text
            }
        };
        
        updateContent('scopeOverrides', newOverrides);
    };

    const handleUpdateBoqSpec = (itemId: string, newSpec: string) => {
        const specs = content.boqItemSpecOverrides || {};
        updateContent('boqItemSpecOverrides', {
            ...specs,
            [itemId]: newSpec
        });
    };

    // --- Custom Clause Management ---
    const handleAddClause = () => {
        const newClause: ContractClause = {
            id: `custom_${Date.now()}`,
            title: "New Section Title",
            text: "Enter section content here..."
        };
        const newClauses = [...(content.customClauses || []), newClause];
        updateContent('customClauses', newClauses);
    };

    const handleUpdateClause = (id: string, field: 'title' | 'text', value: string) => {
        const newClauses = (content.customClauses || []).map(c => 
            c.id === id ? { ...c, [field]: value } : c
        );
        updateContent('customClauses', newClauses);
    };

    const handleUpdateMilestone = (id: string, field: keyof PaymentMilestone, value: any) => {
        if (!onUpdateSchedule) return;
        const updated = paymentMilestones.map(m => 
            m.id === id ? { ...m, [field]: value, ...(field === 'date' ? { isCustom: true } : {}) } : m
        );
        onUpdateSchedule(updated);
    };

    const handleAddMilestone = () => {
        if (!onUpdateSchedule) return;
        const newId = `exec_custom_${Date.now()}`;
        const newMilestone: PaymentMilestone = {
            id: newId,
            name: 'New Execution Milestone',
            description: 'Description for the new milestone',
            percentage: 0,
            date: new Date().toISOString().split('T')[0],
            status: 'pending',
            type: 'execution',
            isCustom: true
        };
        onUpdateSchedule([...paymentMilestones, newMilestone]);
    };

    const handleDeleteMilestone = (id: string) => {
        if (!onUpdateSchedule) return;
        const updated = paymentMilestones.filter(m => m.id !== id);
        onUpdateSchedule(updated);
    };

    const handleDeleteClause = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this section?")) {
            const newClauses = (content.customClauses || []).filter(c => c.id !== id);
            updateContent('customClauses', newClauses);
        }
    };

    // --- Sub-Clause Management ---
    const handleAddSubClause = (clauseId: string) => {
        const newSub: ContractSubClause = {
            id: `sub_${Date.now()}`,
            title: "Sub-point Title",
            text: "Sub-point description..."
        };
        const newClauses = (content.customClauses || []).map(c => 
            c.id === clauseId ? { ...c, subClauses: [...(c.subClauses || []), newSub] } : c
        );
        updateContent('customClauses', newClauses);
    };

    const handleUpdateSubClause = (clauseId: string, subId: string, field: 'title' | 'text', value: string) => {
        const newClauses = (content.customClauses || []).map(c => {
            if (c.id === clauseId) {
                const newSubs = (c.subClauses || []).map(s => 
                    s.id === subId ? { ...s, [field]: value } : s
                );
                return { ...c, subClauses: newSubs };
            }
            return c;
        });
        updateContent('customClauses', newClauses);
    };

    const handleDeleteSubClause = (e: React.MouseEvent, clauseId: string, subId: string) => {
        e.stopPropagation();
        if (confirm("Delete this sub-point?")) {
            const newClauses = (content.customClauses || []).map(c => {
                if (c.id === clauseId) {
                    return { ...c, subClauses: (c.subClauses || []).filter(s => s.id !== subId) };
                }
                return c;
            });
            updateContent('customClauses', newClauses);
        }
    };

    // --- Additional Scope Management ---
    const handleAddAdditionalScope = () => {
        const newScope = {
            id: `scope_${Date.now()}`,
            title: "New Scope Area",
            included: "• Item 1\n• Item 2",
            excluded: "Exclusions..."
        };
        const newScopes = [...(content.additionalScopes || []), newScope];
        updateContent('additionalScopes', newScopes);
    };

    const handleUpdateAdditionalScope = (id: string, field: 'title' | 'included' | 'excluded', value: string) => {
        const newScopes = (content.additionalScopes || []).map(s => 
            s.id === id ? { ...s, [field]: value } : s
        );
        updateContent('additionalScopes', newScopes);
    };

    const handleDeleteAdditionalScope = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Delete this scope section?")) {
            const newScopes = (content.additionalScopes || []).filter(s => s.id !== id);
            updateContent('additionalScopes', newScopes);
        }
    };

    // Calculate Financials Live
    const { 
        grossContractValue, 
        discountValue, 
        netTaxableValue, 
        totalGST, 
        grandTotal,
        gstBreakdown 
    } = useMemo(() => {
        // 1. Base Values
        const execBase = (!isEditing && operativeBoq?.totalsSnapshot) 
                         ? (operativeBoq.totalsSnapshot.firmTotal + operativeBoq.totalsSnapshot.estimateExposure)
                         : (activeBoqList || []).reduce((sum: number, item: any) => sum + calculateSellPrice(item.materials, item.labor, item.margin) * item.qty, 0);
        const designBase = tier.summary.designFee || 0;
        const gross = execBase + designBase;

        // 2. Discount Calculation
        const financials = projectContext.financials;
        let totalDiscount = financials?.goodwillDiscount || 0;
        
        let designDiscount = 0;
        let execDiscount = 0;
        let fixedDiscount = financials?.goodwillDiscount || 0;

        if (financials?.discounts) {
            financials.discounts.forEach(d => {
                if (d.type === 'fixed') {
                    fixedDiscount += d.value;
                } else if (d.type === 'percentage') {
                    if (d.target === 'design') {
                        const val = designBase * d.value / 100;
                        designDiscount += val;
                        totalDiscount += val;
                    } else {
                        const val = execBase * d.value / 100;
                        execDiscount += val;
                        totalDiscount += val;
                    }
                }
            });
        }

        // Prorate fixed discount for tax calculation
        const designRatio = gross > 0 ? designBase / gross : 0;
        const designFixedDist = fixedDiscount * designRatio;
        const execFixedDist = fixedDiscount * (1 - designRatio);

        const netDesign = Math.max(0, designBase - designDiscount - designFixedDist);
        const netExec = Math.max(0, execBase - execDiscount - execFixedDist);
        const netTaxable = netDesign + netExec;

        // 3. GST Calculation
        const gstRate = 0.18;
        const designGST = netDesign * gstRate;
        
        // Check if Execution GST is enabled (default to true if undefined, unless explicitly false)
        // However, in this app, the toggle usually starts false or true. 
        // Let's check the existing logic: const isExecutionGstWaived = projectContext?.financials?.executionGstEnabled === false;
        const isExecGstEnabled = financials?.executionGstEnabled !== false; 
        const execGST = isExecGstEnabled ? netExec * gstRate : 0;

        const gstTotal = designGST + execGST;

        return {
            grossContractValue: gross,
            // discountValue: totalDiscount + (financials?.goodwillDiscount || 0 !== fixedDiscount ? fixedDiscount : 0), // Fix double counting if logic mixed
            // Actually, let's simplify discount total:
            // totalDiscount calculated above includes percentage ones.
            // fixedDiscount includes goodwill + fixed items.
            // So total discount = sum of percentage discounts + sum of fixed discounts.
            // My previous logic for totalDiscount variable was slightly mixed. Let's fix it in the return.
            
            // Re-calc total discount cleanly for display
            discountValue: (designDiscount + execDiscount + fixedDiscount),
            
            netTaxableValue: netTaxable,
            totalGST: gstTotal,
            grandTotal: netTaxable + gstTotal,
            gstBreakdown: {
                design: designGST,
                execution: execGST
            }
        };
    }, [activeBoqList, isEditing, operativeBoq, tier.summary.designFee, projectContext.financials]);

    const designFeeValue = tier.summary.designFee || 0;
    const totalExecutionValue = grossContractValue - designFeeValue;

    // Filter payments - FOCUS ON PAYMENT SETTINGS for this agreement
    const executionMilestones = settings?.paymentMilestones?.milestones?.map((m: any, i: number) => ({
        id: `m_${i}`,
        name: m.label,
        description: m.trigger + (m.description && m.description !== m.trigger ? ` - ${m.description}` : ''),
        percentage: parseInt(m.percent) || 0,
        type: 'execution',
        date: ''
    })) || paymentMilestones.filter(m => m.type === 'execution');

    // Group BOQ
    const groupedBoq: { [key: string]: FullBoqItem[] } = {};
    (activeBoqList || []).forEach((item: any) => {
        const roomName = item.roomId || 'General';
        if (!groupedBoq[roomName]) groupedBoq[roomName] = [];
        groupedBoq[roomName].push(item);
    });

    let sectionCounter = 1;

    return (
        <div id="execution-contract-root" className="bg-white p-8 md:p-16 max-w-5xl mx-auto shadow-2xl my-8 font-opensans text-indigo-900 print:shadow-none print:my-0 print:w-full print:max-w-none print:p-0 print:mx-0">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b-4 border-indigo-950 pb-8 mb-12 gap-6 relative">
                {isShowingOperative && operativeBoq && (
                    <div className="absolute top-0 right-0 -mt-16 bg-blue-50 border border-blue-200 text-blue-800 text-[10px] uppercase font-bold py-1 px-3 rounded shadow-sm flex items-center space-x-1">
                        <CheckBadgeIcon className="w-3 h-3 text-blue-500" />
                        <span>Operative BOQ v{operativeBoq.versionNumber} &middot; {operativeBoq.changeOrderRef ? `incorporating ${operativeBoq.revisionSummary}` : 'Baseline'} &middot; issued {new Date(operativeBoq.issuedAt).toLocaleDateString()}</span>
                    </div>
                )}
                {isEditing && operativeBoq && (
                    <div className="absolute top-0 right-0 -mt-16 bg-amber-50 border border-amber-300 text-amber-800 text-[10px] uppercase font-bold py-1 px-3 rounded shadow-sm flex items-center space-x-1">
                        <AlertIcon className="w-3 h-3 text-amber-500" />
                        <span>Working copy has unversioned changes — not visible to client</span>
                    </div>
                )}
                <div className="flex-grow w-full">
                    <h1 className="text-4xl font-extrabold uppercase tracking-tight text-indigo-950 leading-none">
                        <EditableText isEditing={isEditing} value={content.titleLine1} onChange={v => updateContent('titleLine1', v)} />
                        <EditableText isEditing={isEditing} value={content.titleLine2} onChange={v => updateContent('titleLine2', v)} className="mt-2 text-blue-800" />
                    </h1>
                    <div className="mt-3 text-sm font-bold text-slate-500 uppercase tracking-widest">
                        <EditableText isEditing={isEditing} value={content.subTitle} onChange={v => updateContent('subTitle', v)} />
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <FFDSLogo customLogo={projectContext.logoImage} className="mb-4 flex items-end justify-end" />
                    <div className="text-xs text-slate-500 font-medium">
                        <p>Date: {today}</p>
                    </div>
                </div>
            </div>

            {/* 1. Context */}
            <ContractSection number={sectionCounter++} title={<EditableText isEditing={isEditing} value={content.overviewTitle} onChange={v => updateContent('overviewTitle', v)} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 mb-6">
                    <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-1 tracking-widest">Client</p>
                        <p className="font-bold text-lg text-indigo-950">{projectContext.clientName || projectContext.name}</p>
                        <p className="text-slate-600">{projectContext.location}</p>
                        {projectContext.config && <p className="text-xs text-slate-500 mt-1">{projectContext.config} Residence ({projectContext.area} sq.ft)</p>}
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-1 tracking-widest">Service Partner</p>
                        <p className="font-bold text-lg text-indigo-950">{settings?.companyName || orgData.orgName || 'Studio'}</p>
                        <p className="text-slate-600">{settings?.address || 'Thane, Maharashtra'}</p>
                        {settings?.gstNumber && <p className="text-xs text-slate-500 mt-1">GST: {settings.gstNumber}</p>}
                        {settings?.email && <p className="text-xs text-slate-500">{settings.email} {settings?.phone ? `| ${settings.phone}` : ''}</p>}
                    </div>
                </div>
                
                <div className="mb-8 text-slate-600 text-sm">
                    <EditableText isEditing={isEditing} value={content.overviewText} onChange={v => updateContent('overviewText', v)} multiline />
                </div>

                {/* Unified Value Block */}
                <div className="bg-indigo-950 text-white p-6 rounded-xl shadow-lg print:bg-white print:text-indigo-950 print:border-2 print:border-indigo-950">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                        <div className="flex-grow max-w-md">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Financial Summary</p>
                            
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-slate-300">
                                    <span>Gross Total</span>
                                    <span className="font-mono">{formatCurrency(grossContractValue)}</span>
                                </div>
                                
                                {discountValue > 0 && (
                                    <div className="flex justify-between text-emerald-400">
                                        <span>Discount</span>
                                        <span className="font-mono">-{formatCurrency(discountValue)}</span>
                                    </div>
                                )}

                                <div className="flex justify-between font-bold text-white pt-2 border-t border-slate-700">
                                    <span>Net Taxable Value</span>
                                    <span className="font-mono">{formatCurrency(netTaxableValue)}</span>
                                </div>

                                <div className="flex justify-between text-slate-400 text-xs pt-1">
                                    <span>GST (18%)</span>
                                    <span className="font-mono">{formatCurrency(totalGST)}</span>
                                </div>
                                
                                <div className="flex justify-between items-center pt-3 border-t border-slate-600 mt-2">
                                    <span className="text-base font-extrabold text-white uppercase tracking-wide">Grand Total</span>
                                    <div className="flex flex-col items-end">
                                      <span className="text-2xl font-extrabold text-amber-400 font-mono">{formatCurrency(grandTotal)}</span>
                                      {projectContext.estimateExposure ? (
                                        <span className="text-xs text-slate-400 mt-1 italic">of which {formatCurrency(projectContext.estimateExposure)} is estimated</span>
                                      ) : null}
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500 text-right mt-1">*Inclusive of all taxes</p>
                            </div>
                        </div>

                        <div className="text-right md:w-48 shrink-0 pt-2">
                            <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Estimated Duration</p>
                            <p className="text-xl font-bold flex items-center justify-end gap-2">
                                <EditableText 
                                    isEditing={isEditing} 
                                    value={content.durationText || `${calculatedDuration} Days`} 
                                    onChange={v => updateContent('durationText', v)} 
                                />
                                {isEditing && <span className="text-xs font-normal text-slate-500">(Edit)</span>}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">Commencing from site handover</p>
                        </div>
                    </div>
                </div>
            </ContractSection>

            {/* 2. Scope */}
            <ContractSection number={sectionCounter++} title={<EditableText isEditing={isEditing} value={content.scopeTitle} onChange={v => updateContent('scopeTitle', v)} />}>
                <div className="mb-6 italic text-slate-500 text-xs border-l-2 border-amber-400 pl-3 bg-amber-50 py-2">
                    <EditableText isEditing={isEditing} value={content.scopeNote} onChange={v => updateContent('scopeNote', v)} multiline />
                </div>
                <div className="space-y-8">
                    {Object.entries(groupedBoq).map(([room, items]) => {
                        const template = getScopeDetails(room);
                        
                        // Determine final text based on overrides or defaults
                        const overrides = content.scopeOverrides?.[room] || {};
                        
                        // Included Items
                        const defaultIncludedList = Array.from(new Set(items.map(i => (i.name || '').split('(')[0].trim())));
                        const defaultIncludedText = defaultIncludedList.map(i => "• " + i).join('\n');
                        const finalIncludedText = overrides.included !== undefined ? overrides.included : defaultIncludedText;

                        // Excluded Items
                        const defaultExcludedText = template.excluded;
                        const finalExcludedText = overrides.excluded !== undefined ? overrides.excluded : defaultExcludedText;

                        return (
                            <div key={room} className="break-inside-avoid border-b border-slate-100 pb-6 last:border-0">
                                <h4 className="font-bold text-indigo-950 text-base uppercase tracking-wide mb-3 flex justify-between items-center">
                                    {room}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 text-sm">
                                    <div className="md:col-span-8">
                                        <div className="mb-1 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Included</div>
                                        {isEditing ? (
                                            <textarea 
                                                value={finalIncludedText}
                                                onChange={(e) => handleScopeOverride(room, 'included', e.target.value)}
                                                className="w-full bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none resize-none min-h-[120px]"
                                            />
                                        ) : (
                                            <ul className="list-disc list-inside space-y-1 text-indigo-900 font-medium marker:text-emerald-300 text-xs">
                                                {finalIncludedText.split('\n').map((line, i) => {
                                                    // Clean bullet for cleaner re-rendering
                                                    const cleanLine = line.replace(/^[•-]\s*/, '').trim();
                                                    if (!cleanLine) return null;
                                                    return <li key={i}>{cleanLine}</li>;
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="md:col-span-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                        <div className="mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Excluded</div>
                                        <EditableText 
                                            isEditing={isEditing} 
                                            value={finalExcludedText} 
                                            onChange={(val) => handleScopeOverride(room, 'excluded', val)} 
                                            multiline
                                            className="text-xs text-slate-500 leading-relaxed" 
                                        />
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {/* Additional Manually Added Scopes */}
                    {(content.additionalScopes || []).map((scope) => (
                        <div key={scope.id} className="break-inside-avoid border-b border-slate-100 pb-6 last:border-0 relative group">
                            <h4 className="font-bold text-indigo-950 text-base uppercase tracking-wide mb-3 flex justify-between items-center">
                                <EditableText isEditing={isEditing} value={scope.title} onChange={v => handleUpdateAdditionalScope(scope.id, 'title', v)} />
                                {isEditing && (
                                    <button 
                                        onClick={(e) => handleDeleteAdditionalScope(e, scope.id)}
                                        className="text-red-500 hover:text-red-700 p-1"
                                        title="Delete Scope Section"
                                    >
                                        <DeleteIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 text-sm">
                                <div className="md:col-span-8">
                                    <div className="mb-1 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Included</div>
                                    <EditableText 
                                        isEditing={isEditing} 
                                        value={scope.included} 
                                        onChange={v => handleUpdateAdditionalScope(scope.id, 'included', v)} 
                                        multiline
                                        className="w-full min-h-[120px]"
                                    />
                                </div>
                                <div className="md:col-span-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                    <div className="mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Excluded</div>
                                    <EditableText 
                                        isEditing={isEditing} 
                                        value={scope.excluded} 
                                        onChange={v => handleUpdateAdditionalScope(scope.id, 'excluded', v)} 
                                        multiline
                                        className="text-xs text-slate-500 leading-relaxed" 
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    {isEditing && (
                        <button 
                            onClick={handleAddAdditionalScope}
                            className="mt-4 flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wide border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                            <PlusIcon className="w-4 h-4" /> Add Scope Area
                        </button>
                    )}
                </div>
            </ContractSection>

            {/* Standard Inclusions and Exclusions from Settings */}
            {(settings?.projectTerms?.standardInclusions?.length > 0 || settings?.projectTerms?.standardExclusions?.length > 0) && (
                <ContractSection number={sectionCounter++} title="Standard Inclusions & Exclusions">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {settings?.projectTerms?.standardInclusions?.length > 0 && (
                            <div>
                                <h5 className="font-bold text-emerald-800 text-sm mb-3 border-b border-emerald-200 pb-2">Always Included</h5>
                                <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
                                    {settings.projectTerms.standardInclusions.map((inc: any, i: number) => (
                                        <li key={`inc-${i}`}>{inc.item || inc}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {settings?.projectTerms?.standardExclusions?.length > 0 && (
                            <div>
                                <h5 className="font-bold text-red-800 text-sm mb-3 border-b border-red-200 pb-2">Strictly Excluded</h5>
                                <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
                                    {settings.projectTerms.standardExclusions.map((exc: any, i: number) => (
                                        <li key={`exc-${i}`}>{exc.item || exc}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                     </div>
                </ContractSection>
            )}

            {/* 2b. As Actuals (Custom Clause) */}
            {content.customClauses && content.customClauses.filter(c => c.id === 'as_actuals').map(clause => (
                <ContractSection key={clause.id} number={sectionCounter++} title={<EditableText isEditing={isEditing} value={clause.title} onChange={v => handleUpdateClause(clause.id, 'title', v)} />}>
                    <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                        <div className="text-xs text-blue-900 font-medium leading-relaxed">
                            <EditableText isEditing={isEditing} value={clause.text} onChange={v => handleUpdateClause(clause.id, 'text', v)} multiline />
                        </div>
                    </div>
                </ContractSection>
            ))}

            {/* Detailed BOQ & Specifications */}
            <ContractSection number={sectionCounter++} title={<EditableText isEditing={isEditing} value={content.boqTitle || "Final BOQ & Technical Specifications"} onChange={v => updateContent('boqTitle', v)} />}>
                
                {isEditing && (
                    <div className="mb-4 flex flex-col sm:flex-row items-center gap-4 bg-slate-100 p-3 rounded-lg border border-slate-200 print:hidden">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Presentation Mode:</span>
                        <div className="flex gap-4">
                            <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer px-3 py-2 rounded-md transition-colors ${content.boqPresentationMode === 'summary' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-indigo-900'}`}>
                                <input type="radio" name="boqMode" checked={content.boqPresentationMode === 'summary'} onChange={() => updateContent('boqPresentationMode', 'summary')} className="hidden" />
                                Pre-Signoff (Budget Roll-up)
                            </label>
                            <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer px-3 py-2 rounded-md transition-colors ${content.boqPresentationMode !== 'summary' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500 hover:text-indigo-900'}`}>
                                <input type="radio" name="boqMode" checked={content.boqPresentationMode !== 'summary'} onChange={() => updateContent('boqPresentationMode', 'detailed')} className="hidden" />
                                Post-Signoff (Detailed Annexure)
                            </label>
                        </div>
                    </div>
                )}

                <div className="mb-6 text-sm text-slate-600 italic bg-amber-50 p-3 rounded border-l-2 border-amber-300">
                    <EditableText 
                        isEditing={isEditing} 
                        value={content.boqNote || (content.boqPresentationMode === 'summary' 
                            ? "The following table provides a room-wise budget allocation based on the finalized conceptual design. Detailed unit specifications, brands, and line-item quantities will be published as an Execution Annexure post confirmation and mobilization payment."
                            : "The following table details the exact specifications, quantities, and rates for the finalized scope. Any item or finish not explicitly stated here is not considered part of the contract.")} 
                        onChange={v => updateContent('boqNote', v)} 
                        multiline 
                    />
                </div>
                
                {content.boqPresentationMode === 'summary' ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-indigo-900 text-white font-bold uppercase tracking-wider text-[10px]">
                                <tr>
                                    <th className="p-4 w-1/4">Location / Zone</th>
                                    <th className="p-4 w-1/2">Key Inclusions (High-Level)</th>
                                    <th className="p-4 w-1/4 text-right">Lumpsum Allocation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white border-b-2 border-indigo-900">
                                {Object.entries(groupedBoq).map(([room, items]) => {
                                    const roomTotal = items.reduce((sum: number, item: any) => sum + (item.finalCost !== undefined ? item.finalCost : (calculateSellPrice(item.materials, item.labor, item.margin) * item.qty)), 0);
                                    const uniqueKeys = Array.from(new Set(items.map((i: any) => i.cat || i.category || (i.name || i.description || '').split('(')[0].trim())));
                                    return (
                                        <tr key={`summary-${room}`} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-bold text-indigo-900 text-xs uppercase tracking-wide">{room}</td>
                                            <td className="p-4 text-xs text-slate-600 leading-relaxed font-medium">{uniqueKeys.join(' • ')}</td>
                                            <td className="p-4 font-mono font-bold text-indigo-950 text-right">{formatCurrency(roomTotal)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    Object.entries(groupedBoq).map(([room, items]) => (
                        <div key={`boq-${room}`} className="mb-8 break-inside-avoid">
                            <h4 className="font-bold text-white text-sm uppercase tracking-wide bg-indigo-900 p-2.5 rounded-t-lg">
                                {room}
                            </h4>
                            <table className="w-full text-xs text-left border-collapse border border-slate-200 rounded-b-lg overflow-hidden">
                                <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                                    <tr>
                                        <th className="p-3 border-b border-r border-slate-200 w-10 text-center">No.</th>
                                        <th className="p-3 border-b border-r border-slate-200 w-32">Sub-Category</th>
                                        <th className="p-3 border-b border-r border-slate-200">Description & Specifications</th>
                                        <th className="p-3 border-b border-r border-slate-200 w-16 text-center">Qty</th>
                                        <th className="p-3 border-b border-r border-slate-200 w-16 text-center">Unit</th>
                                        <th className="p-3 border-b border-r border-slate-200 w-28 text-right">Rate</th>
                                        <th className="p-3 border-b border-slate-200 w-32 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {items.map((item: any, index: number) => {
                                        const rate = item.unitCost !== undefined ? item.unitCost : calculateSellPrice(item.materials, item.labor, item.margin);
                                        const amount = item.finalCost !== undefined ? item.finalCost : rate * item.qty;
                                        const currentSpec = content.boqItemSpecOverrides?.[item.id] !== undefined ? content.boqItemSpecOverrides[item.id] : (item.internalSpecs || item.specs || item.commercialNote || '');
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-3 border-r border-slate-100 text-center text-slate-400 font-medium">{index + 1}</td>
                                                <td className="p-3 border-r border-slate-100 font-bold text-slate-600 text-[10px] uppercase tracking-wider">{item.cat || item.category || '-'}</td>
                                                <td className="p-3 border-r border-slate-100 text-slate-600 min-w-[250px]">
                                                    <div className="font-bold text-indigo-950 mb-1.5 text-sm leading-snug">
                                                        {item.name || item.description || 'Item'}
                                                        {item.boqStatus && <span className="ml-2 text-[9px] uppercase tracking-wider bg-slate-100 border border-slate-200 px-1 py-0.5 rounded text-slate-500">{item.boqStatus}</span>}
                                                    </div>
                                                    <EditableText 
                                                        isEditing={isEditing} 
                                                        value={currentSpec} 
                                                        onChange={v => handleUpdateBoqSpec(item.id, v)} 
                                                        multiline 
                                                        className="w-full text-xs leading-relaxed text-slate-600" 
                                                    />
                                                </td>
                                                <td className="p-3 border-r border-slate-100 text-center font-bold text-indigo-900 text-sm bg-slate-50/50">{item.qty}</td>
                                                <td className="p-3 border-r border-slate-100 text-center text-slate-600 uppercase text-[10px] font-bold bg-slate-50/50">{item.unit}</td>
                                                <td className="p-3 border-r border-slate-100 text-right font-mono text-slate-500">{formatCurrency(rate)}</td>
                                                <td className="p-3 text-right font-mono font-bold text-indigo-950">{formatCurrency(amount)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))
                )}
            </ContractSection>

            {/* 3. Deliverables */}
            <ContractSection number={sectionCounter++} title={<EditableText isEditing={isEditing} value={content.deliverablesTitle} onChange={v => updateContent('deliverablesTitle', v)} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h5 className="font-bold text-indigo-900 text-sm mb-2">Deliverables</h5>
                        <div className="text-xs text-slate-600 leading-relaxed">
                            <EditableText isEditing={isEditing} value={content.deliverablesText} onChange={v => updateContent('deliverablesText', v)} multiline />
                        </div>
                    </div>
                    <div>
                        <h5 className="font-bold text-indigo-900 text-sm mb-2">Revision Policy</h5>
                        <div className="text-xs text-slate-600 leading-relaxed">
                            <EditableText isEditing={isEditing} value={settings?.feeStructure?.revisionPolicy || content.revisionsText} onChange={v => updateContent('revisionsText', v)} multiline />
                        </div>
                    </div>
                </div>
            </ContractSection>

            {/* 4. Payments */}
            <ContractSection number={sectionCounter++} title={<EditableText isEditing={isEditing} value={content.paymentTitle} onChange={v => updateContent('paymentTitle', v)} />}>
                
                {/* Summary of Fees (Static - Intent Driven) */}
                <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center text-sm">
                    <div>
                        <span className="font-bold text-slate-700 block">A. Design Fees {(!projectContext.designFeeType || projectContext.designFeeType === 'percentage') ? `(${projectContext.designFee || 8}%)` : (projectContext.designFeeType === 'fixed_sqft' ? `(₹${projectContext.designFee}/sqft)` : `(Lumpsum)`)}</span>
                        <span className="text-xs text-slate-500">{settings?.feeStructure?.feeNote || 'Professional Fees (Billed Separately / As per Design Agreement)'}</span>
                    </div>
                    <div className="text-right">
                        <span className="font-bold text-indigo-900">{formatCurrency(designFeeValue)}</span>
                        <span className="text-[10px] text-slate-400 block">+ GST</span>
                    </div>
                </div>

                <div className="mb-2 font-bold text-indigo-900 text-sm">B. Execution Milestones</div>
                <div className="grid grid-cols-1 gap-8">
                    <PaymentTable 
                        milestones={executionMilestones} 
                        isEditing={isEditing}
                        onUpdateMilestone={handleUpdateMilestone}
                        onAddMilestone={handleAddMilestone}
                        onDeleteMilestone={handleDeleteMilestone}
                    />
                </div>
                
                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 text-xs text-amber-900 mt-4 rounded-r-lg">
                    <strong className="block mb-2 flex items-center gap-2"><AlertIcon className="w-3 h-3"/> Important Notes:</strong>
                    <ul className="list-disc list-inside space-y-1 font-medium">
                        <li>{gstNote}</li>
                        <li>Due dates are indicative and subject to change based on site conditions and approvals.</li>
                    </ul>
                    {(settings?.paymentMilestones?.paymentNote || content.paymentNote) && (
                        <div className="mt-3 pt-2 border-t border-amber-200/50">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-amber-800/70 mb-1 block">Additional Terms:</span>
                            <EditableText 
                                isEditing={isEditing} 
                                value={settings?.paymentMilestones?.paymentNote || content.paymentNote} 
                                onChange={v => updateContent('paymentNote', v)} 
                                multiline 
                                placeholder="Add specific payment terms here..."
                                className="text-amber-900"
                            />
                        </div>
                    )}
                </div>
            </ContractSection>

            {/* 5. Variation Policy */}
            <ContractSection number={sectionCounter++} title={<EditableText isEditing={isEditing} value={content.changeTitle} onChange={v => updateContent('changeTitle', v)} />}>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-600 font-medium">
                        <EditableText isEditing={isEditing} value={content.changeText} onChange={v => updateContent('changeText', v)} multiline />
                    </div>
                </div>
            </ContractSection>

            {/* 6. Mutual Commitments */}
            <ContractSection number={sectionCounter++} title={<EditableText isEditing={isEditing} value={content.responsibilitiesTitle} onChange={v => updateContent('responsibilitiesTitle', v)} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                        <h5 className="font-bold text-indigo-900 mb-3 border-b border-slate-200 pb-2 text-sm uppercase tracking-wider">Client: Enabling the Build</h5>
                        <div className="text-xs text-slate-600 leading-relaxed">
                            <EditableText isEditing={isEditing} value={content.clientObsText} onChange={v => updateContent('clientObsText', v)} multiline />
                        </div>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                        <h5 className="font-bold text-indigo-900 mb-3 border-b border-slate-200 pb-2 text-sm uppercase tracking-wider">{orgData?.orgName || 'Studio'}: Commitment to Quality</h5>
                        <div className="text-xs text-slate-600 leading-relaxed">
                            <EditableText isEditing={isEditing} value={content.ffdsObsText} onChange={v => updateContent('ffdsObsText', v)} multiline />
                        </div>
                    </div>
                </div>
            </ContractSection>

            {/* 7. Handover & Protocols */}
            <ContractSection number={sectionCounter++} title="Handover & Protocols">
                 <div className="space-y-6">
                    <div>
                        <h5 className="font-bold text-indigo-900 text-sm mb-2">Handover & Snag Closure</h5>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            A joint snag list shall be prepared at project completion. Snags must be mutually identified and recorded within 7 days of handover. Items raised beyond this period shall be treated as maintenance.
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm">
                            <p className="font-bold text-sm text-indigo-900 mb-2">Communication & Timeline Exclusions</p>
                            <div className="text-xs text-slate-600 leading-relaxed space-y-4">
                                <EditableText isEditing={isEditing} value={content.commProtocolText} onChange={v => updateContent('commProtocolText', v)} multiline />
                                <EditableText isEditing={isEditing} value={content.forceMajeureText} onChange={v => updateContent('forceMajeureText', v)} multiline />
                            </div>
                        </div>
                        {/* DLP Clause */}
                        {content.customClauses && content.customClauses.filter(c => c.id === 'dlp_clause').map(clause => (
                            <div key={clause.id} className="p-5 border border-emerald-100 rounded-xl bg-emerald-50/30 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-2 opacity-10">
                                    <ShieldCheckIcon className="w-16 h-16 text-emerald-600"/>
                                </div>
                                <p className="font-bold text-sm text-emerald-900 mb-2">
                                    <EditableText isEditing={isEditing} value={clause.title} onChange={v => handleUpdateClause(clause.id, 'title', v)} />
                                </p>
                                <div className="text-xs text-slate-600 mb-3">
                                    <EditableText isEditing={isEditing} value={clause.text} onChange={v => handleUpdateClause(clause.id, 'text', v)} multiline />
                                </div>
                                {clause.subClauses && (
                                    <ul className="text-xs text-slate-500 space-y-2 list-disc list-inside">
                                        {clause.subClauses.map(sub => (
                                            <li key={sub.id}><strong>{sub.title}:</strong> {sub.text}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                 </div>
            </ContractSection>

            {/* Custom Clauses Configured in Settings */}
            {(settings?.projectTerms?.contractClauses && settings.projectTerms.contractClauses.length > 0) ? (
                settings.projectTerms.contractClauses.map((clause: any, index: number) => (
                    <ContractSection 
                        key={index} 
                        number={sectionCounter++} 
                        title={
                            <div className="flex items-center gap-2">
                                <EditableText 
                                    isEditing={isEditing} 
                                    value={clause.clauseTitle} 
                                    onChange={() => {}} 
                                />
                            </div>
                        }
                    >
                        <div className="relative group space-y-4">
                            <EditableText 
                                isEditing={isEditing} 
                                value={clause.clauseText} 
                                onChange={() => {}} 
                                multiline 
                            />
                        </div>
                    </ContractSection>
                ))
            ) : (
                <ContractSection 
                    number={sectionCounter++} 
                    title="Standard Terms & Conditions"
                >
                    <div className="bg-red-50 p-4 border border-red-200 rounded-lg text-red-800 text-sm">
                        No contract clauses configured in Studio Settings. 
                        Please configure them via the Settings panel to populate this section.
                    </div>
                </ContractSection>
            )}

            {/* Add Section Button (Hidden since we read from settings now) */}
            {isEditing && (
                <div className="mb-12 border-2 border-dashed border-slate-200 rounded-xl p-8 flex justify-center items-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={handleAddClause}>
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                        <PlusIcon className="w-8 h-8" />
                        <span className="font-bold text-sm uppercase tracking-wide">Add New Contract Section</span>
                    </div>
                </div>
            )}

            {/* Sign-off & Execution Protocol */}
            <div className="mt-20 pt-10 border-t-4 border-indigo-950 break-inside-avoid">
                <h3 className="text-lg font-bold text-indigo-950 uppercase tracking-wide mb-6 font-opensans">
                    <EditableText isEditing={isEditing} value={content.signoffTitle} onChange={v => updateContent('signoffTitle', v)} />
                </h3>
                
                {/* Admin-Controlled Execution Block */}
                <ExecutionBlock 
                    clientName={projectContext.clientName || 'Client'} 
                    location={projectContext.location} 
                    projectId={projectId || ''}
                    setProjectContext={setProjectContext}
                    projectContext={projectContext}
                    grandTotal={grandTotal}
                />

                {/* Print/Fallback Footer */}
                <div className="hidden print:block mt-12">
                    <div className="grid grid-cols-2 gap-20">
                        <div>
                            <div className="h-24 border-b-2 border-slate-300 mb-3"></div>
                            <p className="font-bold text-indigo-950 text-lg">{projectContext.clientName || projectContext.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Client</p>
                        </div>
                        <div>
                            <div className="h-24 border-b-2 border-slate-300 mb-3"></div>
                            <p className="font-bold text-indigo-950 text-lg">For {settings?.companyName || orgData.orgName || 'Studio'}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Authorised Signatory</p>
                            <p className="text-[10px] text-slate-500">{settings?.address}</p>
                            {settings?.gstNumber && <p className="text-[10px] text-slate-500">GST: {settings.gstNumber}</p>}
                        </div>
                    </div>
                    <div className="mt-12 text-center text-[10px] text-slate-400 font-medium">
                        Signed at {projectContext.location} on {today}.
                    </div>
                </div>
            </div>

        </div>
    );
};

export default ClientLevel3Contract;
