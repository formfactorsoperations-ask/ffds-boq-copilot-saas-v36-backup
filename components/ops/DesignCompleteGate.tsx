import React, { useState, useEffect } from 'react';
import { db } from '../../services/firebaseClient';
import { collection, doc, onSnapshot, writeBatch, serverTimestamp, getDocs, updateDoc } from 'firebase/firestore';
import { useOrg } from '../../contexts/OrgContext';
import { ProjectContext, FullBoqItem } from '../../types';
import { CheckCircle2, Lock, FileSignature, Zap, Settings, RefreshCw, Activity, AlertTriangle } from 'lucide-react';
import { assessGateReadiness } from '../../services/geminiService';

interface Props {
    projectId: string;
    projectContext: ProjectContext;
    fullBoq: FullBoqItem[];
}

const DEFAULT_GATE = {
    checklist: {
        item_1: { done: false, confirmedBy: null, confirmedAt: null, description: "Floor layout and space plan confirmed issued" },
        item_2: { done: false, confirmedBy: null, confirmedAt: null, description: "All rooms with joinery/furniture covered" },
        item_3: { done: false, autoChecked: true, confirmedAt: null, description: "Electrical looping and services layout confirmed" },
        item_4: { done: false, confirmedBy: null, confirmedAt: null, ownerOnly: true, description: "Good-For-Construction drawings marked final" },
        item_5: { done: false, autoTriggered: true, description: "Rate snapshot locked. No further BOQ edits allowed after activation." },
        item_6: { done: false, confirmedBy: null, confirmedAt: null, signOffReference: null, description: "Client has approved the final drawing set" }
    },
    gateActivated: false,
    activatedAt: null,
    activatedBy: null,
    stage3InvoiceId: null,
    readinessScore: 0,
    lastAssessedAt: null
};

export default function DesignCompleteGate({ projectId, projectContext, fullBoq }: Props) {
    const { orgData, currentRole, currentUserAuth } = useOrg();
    const orgId = orgData?.tenantId || 'demo-tenant-01';
    
    const [gate, setGate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isActivating, setIsActivating] = useState(false);
    const [isAssessing, setIsAssessing] = useState(false);
    
    const isOwner = ['Super Admin', 'Admin', 'Ops Director'].includes(currentRole);

    useEffect(() => {
        if (!projectId) return;

        // Sync drawing tracker for item 3
        const checkElectricalDrawing = async () => {
             const drawingsSnap = await getDocs(collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`));
             const drawing = drawingsSnap.docs.find(d => d.id === 'electrical_looping_layout' || d.data().name?.toLowerCase().includes('electrical'));
             return drawing?.data()?.approvedAt != null;
        };

        const unsubGate = onSnapshot(doc(db, `organizations/${orgId}/projects/${projectId}/designGate`, 'main'), async (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                
                // Auto check item 3 if pending
                if (!data.checklist.item_3.done) {
                    const elChecked = await checkElectricalDrawing();
                    if (elChecked) {
                         const batch = writeBatch(db);
                         batch.update(doc(db, `organizations/${orgId}/projects/${projectId}/designGate`, 'main'), {
                             'checklist.item_3.done': true,
                             'checklist.item_3.confirmedAt': serverTimestamp()
                         });
                         await batch.commit();
                         return; // Re-triggers snapshot
                    }
                }
                setGate(data);
                setLoading(false);
            } else {
                // Initialize
                const batch = writeBatch(db);
                batch.set(doc(db, `organizations/${orgId}/projects/${projectId}/designGate`, 'main'), DEFAULT_GATE);
                await batch.commit();
            }
        });

        return () => unsubGate();
    }, [projectId, orgId]);

    const handleToggleChecklist = async (key: string) => {
        if (!gate) return;
        const item = gate.checklist[key];
        
        if (item.autoChecked || item.autoTriggered) return; // Cannot manually toggle
        if (item.ownerOnly && !isOwner) {
            alert('Only Principal Architect / Admin can confirm this item.');
            return;
        }

        let extraFields = {};
        if (key === 'item_6' && !item.done) {
            const ref = prompt("Please enter Sign-Off Reference (Email subject or WhatsApp link):");
            if (!ref) return;
            extraFields = { signOffReference: ref };
        }

        const isNowDone = !item.done;

        await writeBatch(db).update(doc(db, `organizations/${orgId}/projects/${projectId}/designGate`, 'main'), {
            [`checklist.${key}.done`]: isNowDone,
            [`checklist.${key}.confirmedBy`]: isNowDone ? (currentUserAuth?.uid || currentRole) : null,
            [`checklist.${key}.confirmedAt`]: isNowDone ? serverTimestamp() : null,
            ...extraFields
        }).commit();
    };

    const handleActivateGate = async () => {
        if (!gate) return;
        
        // Ensure all required items are checked (1,2,3,4,6)
        const cl = gate.checklist;
        if (!cl.item_1.done || !cl.item_2.done || !cl.item_3.done || !cl.item_4.done || !cl.item_6.done) {
            alert("All checklist items must be completed before activation");
            return;
        }

        setIsActivating(true);
        try {
            const batch = writeBatch(db);
            
            // Step 1: Freeze BOQ & Create Snapshots
            batch.update(doc(db, `organizations/${orgId}/projects`, projectId), {
                boqFrozen: true
            });
            
            // Loop through all items and save unitCostSnapshot into them
            fullBoq.forEach(boqItem => {
                 const unitCost = (boqItem.materials || 0) + (boqItem.labor || 0);
                 batch.update(doc(db, `organizations/${orgId}/projects/${projectId}/boq`, boqItem.id), {
                     unitCostSnapshot: unitCost,
                     frozenAt: serverTimestamp()
                 });
            });

            // Step 2: Generate Stage 3 Invoice
            const designFee = projectContext.designFee || 0;
            const stage3Amount = designFee * 0.35; // 35%
            
            const invoiceId = `INV-${Date.now()}`;
            batch.set(doc(db, `organizations/${orgId}/invoices`, invoiceId), {
                 projectId,
                 amount: stage3Amount,
                 milestone: 'Stage 3: Design Complete',
                 createdAt: serverTimestamp(),
                 status: 'invoiced'
            });

            // Update project design payment stages if we created them in types
            batch.update(doc(db, `organizations/${orgId}/projects`, projectId), {
                 'designPaymentStages.stage3': {
                      amount: stage3Amount,
                      status: 'invoiced',
                      invoiceGeneratedAt: serverTimestamp(),
                      invoiceId: invoiceId
                 }
            });

            // Step 3 & 4: Advance project lifecycle and Scope Additions
            batch.update(doc(db, `organizations/${orgId}/projects`, projectId), {
                 currentStage: 6, // Execution
                 status: 'execution',
                 designPhaseClosedAt: serverTimestamp(),
                 scopeAdditionsEnabled: true
            });

            // Step 5: Update designGate
            batch.update(doc(db, `organizations/${orgId}/projects/${projectId}/designGate`, 'main'), {
                 gateActivated: true,
                 activatedAt: serverTimestamp(),
                 activatedBy: currentUserAuth?.uid || currentRole,
                 stage3InvoiceId: invoiceId,
                 'checklist.item_5.done': true,
                 'checklist.item_5.confirmedAt': serverTimestamp()
            });

            // Step 6: Live Feed Events
            const feedRef1 = doc(collection(db, `organizations/${orgId}/projects/${projectId}/liveFeed`));
            batch.set(feedRef1, {
                 type: 'milestone',
                 text: `🔒 Design phase formally closed \u2014 ${projectContext.name}`,
                 timestamp: serverTimestamp()
            });
            const feedRef2 = doc(collection(db, `organizations/${orgId}/projects/${projectId}/liveFeed`));
            batch.set(feedRef2, {
                 type: 'finance',
                 text: `💰 Stage 3 invoice generated \u2014 ₹${stage3Amount.toLocaleString('en-IN')} \u2014 ${invoiceId}`,
                 timestamp: serverTimestamp()
            });

            await batch.commit();

        } catch (error) {
            console.error("Failed to activate gate", error);
            alert("Transaction failed. Gate was not activated.");
        } finally {
            setIsActivating(false);
        }
    };

    if (loading) return null;

    const itemsArray = [
        gate?.checklist?.item_1,
        gate?.checklist?.item_2,
        gate?.checklist?.item_3,
        gate?.checklist?.item_4,
        gate?.checklist?.item_5,
        gate?.checklist?.item_6,
    ];
    
    const checkedCount = (itemsArray || []).filter(i => i?.done).length;
    const progressPercent = (checkedCount / 6) * 100;
    const allChecked = checkedCount === 6;

    const designFee = projectContext.designFee || 0;
    const stage3Amount = designFee * 0.35; 

    const handleAssessReadiness = async () => {
        setIsAssessing(true);
        try {
            const drawingsSnap = await getDocs(collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`));
            const drawingTracker = drawingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const result = await assessGateReadiness(projectContext, gate.checklist, drawingTracker);
            if (result) {
                await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/designGate`, 'main'), {
                    readinessCheck: result,
                    readinessScore: result.readinessScore || 0,
                    lastAssessedAt: serverTimestamp()
                });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsAssessing(false);
        }
    };

    const handleActivateGateWithConfirm = () => {
        if (confirm("This will freeze the BOQ and generate the Stage 3 invoice. This cannot be undone. Proceed?")) {
            handleActivateGate();
        }
    };

    if (gate?.gateActivated) {
        return (
            <div className="bg-[#f0fdf4] border border-[#86efac] rounded-[10px] p-4 flex flex-col justify-center h-[80px] w-full max-w-2xl mx-auto my-6 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <h3 className="text-[#15803d] font-bold text-[14px]">
                            ✓ Design Phase Closed — {gate.activatedAt ? new Date(gate.activatedAt.seconds * 1000).toLocaleDateString() : 'Just now'}
                        </h3>
                        <p className="text-[12px] text-slate-700 mt-0.5">
                            Stage 3 Invoice #{gate.stage3InvoiceId} generated — ₹{stage3Amount.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[12px] text-slate-500">
                            BOQ frozen. Any new scope via Scope Additions module.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const checklistRender = [
        { key: 'item_1', title: 'Layout drawings issued', ...gate.checklist.item_1 },
        { key: 'item_2', title: 'Elevation drawings issued', ...gate.checklist.item_2 },
        { key: 'item_3', title: 'Electrical / MEP layout issued', ...gate.checklist.item_3 },
        { key: 'item_4', title: 'GFC drawing set finalized', ...gate.checklist.item_4 },
        { key: 'item_5', title: 'BOQ frozen \u2014 rate snapshot taken', ...gate.checklist.item_5 },
        { key: 'item_6', title: 'Client digital sign-off received', ...gate.checklist.item_6 },
    ];

    return (
        <div className="bg-[#eff6ff] border border-[#93c5fd] rounded-[10px] p-6 max-w-2xl mx-auto my-6 shadow-sm">
            <div className="mb-4">
                <h2 className="text-[14px] font-bold text-[#1e40af]">Design Phase Closeout Checklist</h2>
                <p className="text-[12px] text-[#3b82f6]">Complete all items to generate Stage 3 invoice and advance to Execution</p>
            </div>
            
            <div className="w-full bg-[#e2e8f0] h-[4px] rounded-[4px] mb-5 overflow-hidden">
                <div 
                    className="bg-[#15803d] h-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            {/* Readiness Assessor */}
            <div className="mb-6 border border-indigo-100 bg-indigo-50/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-600" />
                        <h3 className="text-[13px] font-bold text-indigo-900">System Readiness Assessor</h3>
                        {gate.readinessCheck?.readinessScore !== undefined && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${gate.readinessCheck.readinessScore >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                Score: {gate.readinessCheck.readinessScore}/100
                            </span>
                        )}
                    </div>
                    <button 
                        onClick={handleAssessReadiness}
                        disabled={isAssessing}
                        className="text-[11px] font-medium bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                    >
                        {isAssessing ? 'Assessing...' : 'Run Analysis'}
                    </button>
                </div>
                
                {gate.readinessCheck ? (
                    <div className="space-y-3">
                        <p className="text-[12px] text-slate-700 italic">{gate.readinessCheck.summary}</p>
                        
                        {gate.readinessCheck.blockers && gate.readinessCheck.blockers.length > 0 && (
                            <div className="space-y-2">
                                {gate.readinessCheck.blockers.map((blocker: any, idx: number) => (
                                    <div key={idx} className={`flex items-start gap-2 p-2 rounded text-left ${blocker.severity === 'critical' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                                        <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${blocker.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                                        <div>
                                            <p className="text-[11px] font-bold">{blocker.item}</p>
                                            <p className="text-[11px] opacity-80">{blocker.reason}</p>
                                            {blocker.action && <p className="text-[10px] mt-1 font-medium bg-white/50 inline-block px-1.5 py-0.5 rounded">Action: {blocker.action}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-[11px] text-slate-500">Run the System Assessor to check for missing drawings or blockers before activating the gate.</p>
                )}
            </div>

            <div className="flex flex-col gap-2">
                {checklistRender.map((item, idx) => {
                    const isLocked = item.ownerOnly && !isOwner;
                    return (
                        <div key={item.key} 
                             onClick={() => handleToggleChecklist(item.key)}
                             className={`p-3 rounded flex items-center gap-3 transition-colors ${item.autoTriggered || isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${item.done ? 'bg-[#dcfce7] border border-[#86efac]' : 'bg-white border border-[#d1d5db] hover:border-blue-300'}`}>
                            
                            <div className="flex-shrink-0">
                                {item.done ? (
                                    <div className="w-[18px] h-[18px] rounded-[4px] bg-[#15803d] flex items-center justify-center text-white">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </div>
                                ) : (
                                    <div className="w-[18px] h-[18px] rounded-[4px] border-2 border-slate-300 flex items-center justify-center">
                                        {isLocked && <Lock className="w-3 h-3 text-slate-400" />}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 text-left">
                                <h4 className={`text-[13px] font-medium leading-none ${item.done ? 'text-[#15803d]' : 'text-slate-700'}`}>
                                    {item.title}
                                    {(item.autoChecked || item.autoTriggered) && <span className="text-slate-400 ml-1 font-normal">(auto)</span>}
                                </h4>
                                {item.signOffReference && (
                                    <p className="text-[11px] text-slate-500 font-medium mt-1">Ref: {item.signOffReference}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {allChecked && (
                <div className="mt-5 animate-in fade-in slide-in-from-bottom-2">
                    <button 
                        disabled={isActivating}
                        onClick={handleActivateGateWithConfirm}
                        className="w-full py-3 rounded-[4px] font-bold text-[14px] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #2563eb, #1e40af)' }}
                    >
                        {isActivating ? (
                            <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</span>
                        ) : (
                            `Activate Design Gate \u2014 Generate Stage 3 Invoice \u20b9${stage3Amount.toLocaleString('en-IN')}`
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
