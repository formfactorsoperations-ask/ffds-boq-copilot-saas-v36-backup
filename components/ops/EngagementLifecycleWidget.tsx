import React, { useState } from 'react';
import { ProjectContext } from '../../types';
import { getTermsSettings, getPaymentStructure } from '../../services/engagementService';
import { useOrg } from '../../contexts/OrgContext';
import { Lock } from 'lucide-react';

export function EngagementLifecycleWidget({ projectContext, setProjectContext }: { projectContext: ProjectContext, setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>> }) {
    const { orgData, currentRole } = useOrg();
        const [isIssuing, setIsIssuing] = useState(false);
    const [isAcknowledging, setIsAcknowledging] = useState(false);
    const [confirmRevert, setConfirmRevert] = useState(false);

    const engagement = projectContext.engagement || {
        status: 'draft',
        designFee: null,
        executionValue: null,
        docketRef: null,
        termsVersion: null,
        paymentScheduleVersion: null,
        issuedAt: null,
        acknowledgedAt: null,
        acknowledgedVia: null,
        lockedSnapshot: null
    };

    const isOwner = currentRole === 'Super Admin' || currentRole === 'Admin';

    const handleIssue = async () => {
        if (!isOwner) return;
        setIsIssuing(true);
        try {
            const orgId = orgData?.tenantId || 'demo-tenant-01';
            const termsSettings = await getTermsSettings(orgId);
            const paymentStructure = await getPaymentStructure(orgId);

            if (!termsSettings || !paymentStructure) {
                console.warn("Please configure Terms and Payment Structure in Studio Settings first.");
                return;
            }

            const year = new Date().getFullYear();
            const seq = String(Math.floor(Math.random() * 900) + 100);
            const docketRef = engagement.docketRef || `${termsSettings.docketRefPrefix || 'FFDS-TD'}-${year}-${seq}`;

            const termsVersion = engagement.termsVersion ? engagement.termsVersion + 1 : 1;
            const paymentVersion = engagement.paymentScheduleVersion ? engagement.paymentScheduleVersion + 1 : 4;

            const settingsHash = JSON.stringify({ termsSettings, paymentStructure, orgData, projectContext });
            
            // Generate simple HTML representation (we use JSON serialization to guarantee exact reproduction)
            const termsHtml = `<div><h1>Terms of Engagement v${termsVersion}</h1><pre>${JSON.stringify(termsSettings, null, 2)}</pre></div>`;
            const paymentHtml = `<div><h1>Payment Schedule v${paymentVersion}</h1><pre>${JSON.stringify(paymentStructure, null, 2)}</pre></div>`;

            const originalNetDesign = engagement.designFee || 0;
            const originalNetExecution = engagement.executionValue || 0;
            const contractValue = originalNetExecution + originalNetDesign;

            let newAdvances = [];
            
            if (projectContext.paymentMilestones && projectContext.paymentMilestones.length > 0) {
                let dIndex = 0;
                let eIndex = 0;
                newAdvances = projectContext.paymentMilestones.map((m) => {
                    const originalBaseAmount = m.type === 'execution' ? originalNetExecution : originalNetDesign;
                    let amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (originalBaseAmount * (m.percentage / 100));
                    amount = Math.round(amount);
                    const advCode = m.type === 'design' ? `D${++dIndex}` : `E${++eIndex}`;
                    return {
                        advanceCode: m.description && m.description.match(/^[DEH][0-9]$/) ? m.description : advCode,
                        label: (m.name || '').replace(' (Gross)', ''),
                        phase: m.type as 'design' | 'execution' | 'handover',
                        percentage: m.percentage,
                        isFixedAmount: m.isFixedAmount,
                        fixedAmount: m.fixedAmount,
                        amount: amount,
                        dueCondition: m.trigger || (m.type === 'execution' ? 'Advance before ' + (m.name || '').replace(' (Gross)', '').toLowerCase() : 'On completion of ' + (m.name || '').replace(' (Gross)', '')),
                        unlocks: m.unlocks || '',
                        status: 'pending',
                        invoiceRef: null,
                        receivedAt: null,
                        isHandoverAdvance: m.isHandoverAdvance || false
                    };
                });
            } else {
                let i = 0;
                for (const m of paymentStructure.designStages) {
                    newAdvances.push({
                        advanceCode: m.code || `D${i+1}`,
                        label: m.name,
                        phase: 'design',
                        percentage: m.pct,
                        amount: Math.round((m.pct / 100) * originalNetDesign),
                        dueCondition: m.trigger,
                        unlocks: m.unlocks,
                        status: 'pending',
                        isHandoverAdvance: false,
                        invoiceRef: null,
                        receivedAt: null
                    });
                    i++;
                }
                for (const m of paymentStructure.executionStages) {
                    newAdvances.push({
                        advanceCode: m.code || `E${i+1}`,
                        label: m.name,
                        phase: 'execution',
                        percentage: m.pct,
                        amount: Math.round((m.pct / 100) * originalNetExecution),
                        dueCondition: m.trigger,
                        unlocks: m.unlocks,
                        status: 'pending',
                        isHandoverAdvance: m.name.toLowerCase().includes('handover') || (m.trigger && m.trigger.toLowerCase().includes('handover')) || false,
                        invoiceRef: null,
                        receivedAt: null
                    });
                    i++;
                }
            }

            const lockedSnapshot = {
                termsHtml,
                paymentHtml,
                settingsHash,
                issuedAt: Date.now(),
                termsSettings,
                paymentStructure,
                advances: newAdvances
            };

            const history = engagement.history || [];
            if (engagement.status === 'issued' || engagement.status === 'acknowledged') {
                history.push({
                    status: engagement.status,
                    docketRef: engagement.docketRef,
                    termsVersion: engagement.termsVersion,
                    paymentScheduleVersion: engagement.paymentScheduleVersion,
                    issuedAt: engagement.issuedAt,
                    acknowledgedAt: engagement.acknowledgedAt,
                    acknowledgedVia: engagement.acknowledgedVia,
                    lockedSnapshot: engagement.lockedSnapshot
                });
            }

            const updatedEngagement = {
                ...engagement,
                status: 'issued' as const,
                docketRef,
                termsVersion,
                paymentScheduleVersion: paymentVersion,
                issuedAt: Date.now(),
                lockedSnapshot,
                history,
                acknowledgedAt: null,
                acknowledgedVia: null
            };

            setProjectContext(prev => ({
                ...prev,
                engagement: updatedEngagement
            }));

        } catch (err) {
            console.error(err);
            console.error("Failed to issue engagement documents.");
        } finally {
            setIsIssuing(false);
        }
    };

    const handleAcknowledge = (via: 'WhatsApp' | 'email') => {
        if (!isOwner) return;
        setIsAcknowledging(true);
        try {
            const updatedEngagement = {
                ...engagement,
                status: 'acknowledged' as const,
                acknowledgedAt: Date.now(),
                acknowledgedVia: via
            };

            setProjectContext(prev => ({
                ...prev,
                engagement: updatedEngagement
            }));
            
        } catch (err) {
            console.error(err);
        } finally {
            setIsAcknowledging(false);
        }
    };


    const handleRevert = () => {
        if (!isOwner) return;
        if (!confirmRevert) {
            setConfirmRevert(true);
            setTimeout(() => setConfirmRevert(false), 3000);
            return;
        }
        
        try {
            setConfirmRevert(false);
            const history = engagement.history || [];
            if (engagement.status === 'issued' || engagement.status === 'acknowledged') {
                history.push({
                    status: 'reverted_to_draft',
                    docketRef: engagement.docketRef,
                    termsVersion: engagement.termsVersion,
                    paymentScheduleVersion: engagement.paymentScheduleVersion,
                    issuedAt: engagement.issuedAt,
                    acknowledgedAt: engagement.acknowledgedAt,
                    revertedAt: Date.now()
                });
            }
            
            const updatedEngagement = {
                ...engagement,
                status: 'draft',
                lockedSnapshot: null,
                issuedAt: null,
                acknowledgedAt: null,
                acknowledgedVia: null,
                history
            };
            setProjectContext(prev => ({
                ...prev,
                engagement: updatedEngagement
            }));
        } catch (err) {
            console.error(err);
        }
    };

    return (

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-indigo-500" />
                    Engagement Lifecycle
                </h3>
                <p className="text-sm text-slate-500">
                    Status: <span className="font-bold text-indigo-700 capitalize">{engagement.status || 'draft'}</span>
                    {engagement.docketRef && ` • Ref: ${engagement.docketRef} • Terms v${engagement.termsVersion} • Payment v${engagement.paymentScheduleVersion}`}
                </p>
            </div>
            
            {isOwner && (
                <div className="flex gap-2">
                    {(!engagement.status || engagement.status === 'draft') && (
                        <button 
                            onClick={handleIssue} 
                            disabled={isIssuing}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition"
                        >
                            {isIssuing ? 'Issuing...' : 'Issue Documents'}
                        </button>
                    )}
                    {engagement.status === 'issued' && (
                        <>
                            <button 
                                onClick={() => handleAcknowledge('WhatsApp')} 
                                disabled={isAcknowledging}
                                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-emerald-700 transition"
                            >
                                Ack via WhatsApp
                            </button>
                            <button 
                                onClick={() => handleAcknowledge('email')} 
                                disabled={isAcknowledging}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition"
                            >
                                Ack via Email
                            </button>
                        </>
                    )}
                    {(engagement.status === 'issued' || engagement.status === 'acknowledged') && (
                        <>
                            <button 
                                onClick={handleRevert} 
                                className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-red-100 transition"
                            >
                                {confirmRevert ? 'Click to Confirm' : 'Revert to Draft'}
                            </button>
                            <button 
                                onClick={handleIssue} 
                                disabled={isIssuing}
                                className="bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-200 transition"
                            >
                                {isIssuing ? 'Re-issuing...' : 'Re-issue'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
