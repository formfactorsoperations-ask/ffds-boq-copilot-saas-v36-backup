import React from 'react';
import { formatCurrency } from '../lib/utils';
import { PaymentHealth, usePaymentHealthScore } from '../hooks/usePaymentHealthScore';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useOrg } from '../contexts/OrgContext';

export function ProjectPaymentBadge({ projectId, size = 'sm' }: { projectId: string, size?: 'sm' | 'md' }) {
    const { orgData } = useOrg();
    const health = usePaymentHealthScore(projectId, orgData?.tenantId || 'demo-tenant-01');
    return <PaymentHealthBadge health={health} size={size} />;
}

export function PaymentHealthBadge({ health, size = 'md' }: { health: PaymentHealth, size?: 'sm' | 'md' }) {
    if (!health) return null;
    if (health.loading) return <span className="text-sm text-slate-400">...</span>;

    if (health.healthStatus === 'unconfigured') {
        if (size === 'sm') return <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><div className="w-2 h-2 rounded-full bg-slate-300"></div>Unmapped</span>
        return <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-[11px] font-bold">Unmapped</span>;
    }
    if (health.healthStatus === 'neutral') {
        if (size === 'sm') return <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><div className="w-2 h-2 rounded-full bg-slate-300"></div>Not started</span>
        return <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-[11px] font-bold">Not started</span>;
    }
    if (health.healthStatus === 'fully_paid') {
        if (size === 'sm') return <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle className="w-3 h-3 text-emerald-500"/> Secured</span>
        return <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Secured</span>;
    }

    const { healthStatus, healthRatio, overdueAmount } = health;

    const statusConfig = {
        green: { dot: 'bg-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Healthy' },
        amber: { dot: 'bg-amber-500', bg: 'bg-amber-100', text: 'text-amber-800', label: 'Exposure' },
        red: { dot: 'bg-rose-500', bg: 'bg-rose-100', text: 'text-rose-800', label: 'Critical' }
    };

    const conf = statusConfig[healthStatus] || statusConfig['green'];

    if (size === 'sm') {
        return (
            <span className={`flex items-center gap-1.5 text-xs font-semibold ${conf.text.replace('800', '600')}`}>
                <div className={`w-2 h-2 rounded-full ${conf.dot}`}></div>
                {conf.label}
            </span>
        );
    }

    return (
        <span className={`${conf.bg} ${conf.text} px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap`}>
            <div className={`w-2 h-2 rounded-full ${conf.dot}`}></div>
            {conf.label} · {Math.round(healthRatio * 100)}%
        </span>
    );
}

export function PaymentHealthWidget({ health, contractValue, revisedContractValue }: { health: PaymentHealth, contractValue?: number | null, revisedContractValue?: number }) {
    if (!health) return null;
    if (health.loading) return <div className="p-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm min-w-[300px]">Loading ledger data...</div>;

    const cv = contractValue || 0;
    const rcv = revisedContractValue || cv;

    let designCollected = 0;
    let executionCollected = 0;
    let totalInvoiced = 0; // Everything strictly marked as invoiced or paid

    if (health.paymentMilestones && health.paymentMilestones.length > 0) {
        health.paymentMilestones.forEach((m: any) => {
            const baseAmount = m.lockedTaxableBase || cv;
            const amount = baseAmount * ((m.percentage || 0) / 100);

            if (m.status === 'invoiced' || m.status === 'paid') {
                totalInvoiced += amount;
            }

            if (m.status === 'paid') {
                if (m.type === 'design') designCollected += amount;
                else executionCollected += amount;
            }
        });
    } else {
        // Fallback to percentage logic
        const actualPercent = Math.min(100, Math.max(0, health.actualReceived));
        designCollected = (cv * actualPercent) / 100;
        totalInvoiced = (cv * health.expectedReceived) / 100;
    }

    const collectedAmt = designCollected + executionCollected;
    const pendingCollectionAmt = Math.max(0, totalInvoiced - collectedAmt);

    // Explicit metrics
    let riskLevel = 'Healthy';
    let riskBg = 'bg-white border-slate-200';
    let riskText = 'text-slate-900';

    if (health.healthStatus === 'unconfigured') {
        riskLevel = 'Unmapped Ledger';
        riskBg = 'bg-slate-50/50 border-slate-200';
        riskText = 'text-slate-500';
    } else if (health.healthStatus === 'neutral' && cv === 0) {
        riskLevel = 'No Financials';
        riskBg = 'bg-slate-50 border-slate-200';
        riskText = 'text-slate-500';
    } else if (health.overdueCount > 0) {
        riskLevel = 'Overdue Alert';
        riskBg = 'bg-rose-50/50 border-rose-200 shadow-sm ring-1 ring-rose-100 ring-inset';
        riskText = 'text-rose-700';
    } else if (pendingCollectionAmt > 0) {
        riskLevel = 'Pending Collection';
        riskBg = 'bg-amber-50/50 border-amber-200';
        riskText = 'text-amber-800';
    } else if (collectedAmt > 0 && collectedAmt >= cv * 0.95) {
        riskLevel = 'Fully Secured';
        riskBg = 'bg-emerald-50/50 border-emerald-200';
        riskText = 'text-emerald-800';
    }

    const collectedPercent = rcv > 0 ? (collectedAmt / rcv) * 100 : 0;
    const billedPercent = rcv > 0 ? (totalInvoiced / rcv) * 100 : 0;

    return (
        <div className={`text-left p-6 md:p-8 rounded-[2rem] flex flex-col justify-between w-full lg:flex-1 md:min-w-[300px] border transition-all ${riskBg}`}>
            <div>
                <div className="flex justify-between items-start mb-4 gap-2">
                    <p className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${health.overdueCount > 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                        Payment Ledger
                    </p>
                </div>
                
                <h3 className={`text-2xl md:text-[28px] font-light tracking-tight mb-2 ${riskText}`}>
                    {riskLevel}
                </h3>

                <p className={`text-sm font-medium ${health.overdueCount > 0 ? 'text-rose-600/80' : 'text-slate-500'}`}>
                   {health.healthStatus === 'unconfigured' ? 'Execute milestones to track cash flow.' :
                    health.overdueCount > 0 ? `${health.overdueCount} payment(s) marked as invoiced but no receipts logged.` :
                    pendingCollectionAmt > 0 ? `Waiting for payment receipts on raised invoices.` :
                    collectedAmt > 0 && collectedAmt >= cv * 0.95 ? 'All milestones marked as paid.' :
                    health.healthStatus === 'neutral' ? 'Waiting for first invoice trigger.' :
                    'Collections match or exceed current invoice baseline.'}
                </p>
            </div>

            {cv > 0 && health.healthStatus !== 'unconfigured' && (
                <div className="mt-6 pt-4 border-t border-slate-900/5">
                    {/* Visual Segment Bar */}
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Billed vs Collected</span>
                        <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider text-right">{Math.round(collectedPercent)}% Secured</span>
                    </div>

                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex mb-4 relative">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.min(100, collectedPercent)}%` }} />
                        {(billedPercent > collectedPercent) && (
                            <div className="bg-amber-400 h-full transition-all" style={{ width: `${Math.min(100, billedPercent - collectedPercent)}%` }} />
                        )}
                        {/* Orig Contract Marker */}
                        {rcv !== cv && cv > 0 && (
                            <div className="absolute top-0 bottom-0 w-[2px] bg-slate-400 group cursor-help z-10" style={{ left: `${Math.min(100, (cv / rcv) * 100)}%` }}>
                                 <div className="hidden group-hover:block absolute bottom-4 -right-16 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap shadow-md">
                                    Original Contract BOQ Limit
                                 </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="border-r border-slate-200 last:border-0 pr-3">
                             <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Revised BOQ</p>
                             <p className="text-sm font-bold text-slate-800">{formatCurrency(rcv)}</p>
                             {rcv !== cv && (
                                <p className="text-[9px] text-slate-400 mt-1" title="Original Budget">Orig: {formatCurrency(cv)}</p>
                             )}
                        </div>
                        <div className="border-r border-slate-200 last:border-0 pr-3 pl-1">
                             <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600/80 mb-1">Total Rcvd</p>
                             <p className="text-sm font-bold text-emerald-700">{formatCurrency(collectedAmt)}</p>
                             <div className="flex gap-2 mt-1 text-[9px] border-t border-emerald-100 pt-1">
                                 <span className="text-emerald-600/70" title="Design Fees">D: {formatCurrency(designCollected)}</span>
                                 <span className="text-emerald-600/70" title="Execution Fees">E: {formatCurrency(executionCollected)}</span>
                             </div>
                        </div>
                        <div className="border-r border-slate-200 last:border-0 pr-3 pl-1">
                             <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${health.overdueCount > 0 ? 'text-rose-500' : 'text-amber-600/80'}`}>Due Now</p>
                             <p className={`text-sm font-bold ${health.overdueCount > 0 ? 'text-rose-600' : 'text-amber-700'}`}>{formatCurrency(pendingCollectionAmt)}</p>
                        </div>
                        <div className="pl-1">
                             <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Unbilled</p>
                             <p className="text-sm font-bold text-slate-500">{formatCurrency(Math.max(0, rcv - totalInvoiced))}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
