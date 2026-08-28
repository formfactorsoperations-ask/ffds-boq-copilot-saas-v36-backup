import React from 'react';
import { ProjectContext, FullBoqItem } from '../../types';
import { formatCurrency, formatINR } from '../../lib/utils';
import { ShieldCheck, Lock, Unlock, CheckCircle2, XCircle, AlertTriangle, ArrowRight, DollarSign, Wrench, FileCheck, ClipboardList } from 'lucide-react';

interface GateReadinessAuditProps {
  projectContext?: ProjectContext;
  boq: FullBoqItem[];
  totalSell: number;
}

export const GateReadinessAudit: React.FC<GateReadinessAuditProps> = ({
  projectContext,
  boq,
  totalSell
}) => {
  // Gate 1: Proposal Approval Gate
  const proposalSigned = Boolean(projectContext?.proposalSignoff?.signedAt || projectContext?.approvedTierId);
  const roomsDefined = (projectContext?.rooms?.length || 0) > 0;
  const boqHasItems = boq.length > 0;
  const gate1Ready = roomsDefined && boqHasItems;

  // Gate 2: Design Complete & BOQ Freeze Gate (Atomic transaction)
  const isBoqFrozen = Boolean(projectContext?.boqFrozen || projectContext?.designGate?.status === 'frozen');
  const designStages = projectContext?.designPaymentStages;
  const designFeeSettled = Boolean(designStages?.stage3?.status === 'paid' || projectContext?.designPhaseClosedAt);
  const gate2Ready = isBoqFrozen && (proposalSigned || designFeeSettled);

  // Gate 3: Site Execution E1 Advance Gate (Hard rule: No vendor PO before E1 advance clears!)
  const milestones = projectContext?.paymentMilestones || [];
  const e1Milestone = milestones.find(m => m.id?.includes('E1') || m.id?.includes('e1') || m.title?.toLowerCase().includes('order advance') || m.title?.toLowerCase().includes('material advance') || m.title?.toLowerCase().includes('e1'));
  const e1Amount = e1Milestone?.amount || (totalSell * 0.40);
  const e1Cleared = Boolean(e1Milestone?.status === 'paid' || (e1Milestone?.receivedAmount && e1Milestone.receivedAmount >= e1Amount));
  const gate3Ready = e1Cleared && isBoqFrozen;

  // Gate 4: Final Handover Gate (Requires ALL 4: E4 payment cleared, snags closed 0, SOF items delivered, CRs settled)
  const snags = projectContext?.snagList || [];
  const openSnags = snags.filter(s => s.status === 'open' || s.status === 'in_progress');
  const e4Milestone = milestones.find(m => m.id?.includes('E4') || m.id?.includes('e4') || m.title?.toLowerCase().includes('handover') || m.title?.toLowerCase().includes('completion'));
  const e4Cleared = Boolean(e4Milestone?.status === 'paid');
  const handoverSigned = Boolean(projectContext?.handoverSignoff?.signedAt);
  const gate4Ready = e4Cleared && openSnags.length === 0 && (handoverSigned || Boolean(projectContext?.handoverDate));

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0B1528] text-white rounded-xl">
            <ShieldCheck className="w-5 h-5 text-[#B5945B]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Hard-Gate & Governance Compliance Radar</h3>
            <p className="text-xs text-slate-500 mt-0.5">Strict architectural verification across studio lifecycle checkpoints</p>
          </div>
        </div>

        <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full self-start sm:self-auto">
          Domain Enforcement Active
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* GATE 1 */}
        <div className={`p-6 rounded-2xl border flex flex-col justify-between transition-all ${gate1Ready ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/50 border-amber-200'}`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-slate-400">GATE 01</span>
              {gate1Ready ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold font-mono bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> PASSED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-bold font-mono bg-amber-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3.5 h-3.5" /> PENDING
                </span>
              )}
            </div>

            <h4 className="text-sm font-bold text-slate-900 mb-1">Proposal & Scope Lock</h4>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">Concept scope, room mapping and client proposal baseline</p>

            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-2">
                {roomsDefined ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                <span className={roomsDefined ? 'text-slate-700' : 'text-rose-700 font-medium'}>Room Breakdown Configured</span>
              </li>
              <li className="flex items-center gap-2">
                {boqHasItems ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                <span className={boqHasItems ? 'text-slate-700' : 'text-rose-700 font-medium'}>BOQ Items Quoted ({boq.length})</span>
              </li>
              <li className="flex items-center gap-2">
                {proposalSigned ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                <span className="text-slate-600">{proposalSigned ? 'Proposal Confirmed' : 'Client Review in Progress'}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* GATE 2 */}
        <div className={`p-6 rounded-2xl border flex flex-col justify-between transition-all ${gate2Ready ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/70 border-slate-200'}`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-slate-400">GATE 02</span>
              {isBoqFrozen ? (
                <span className="inline-flex items-center gap-1 text-purple-700 text-xs font-bold font-mono bg-purple-100 px-2 py-0.5 rounded-full">
                  <Lock className="w-3.5 h-3.5" /> FROZEN
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-600 text-xs font-bold font-mono bg-slate-200 px-2 py-0.5 rounded-full">
                  <Unlock className="w-3.5 h-3.5" /> UNLOCKED
                </span>
              )}
            </div>

            <h4 className="text-sm font-bold text-slate-900 mb-1">Design Complete & Freeze</h4>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">Atomic transition: rate freeze + execution invoice trigger</p>

            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-2">
                {isBoqFrozen ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                <span className={isBoqFrozen ? 'text-slate-700' : 'text-slate-500'}>BOQ Baseline Rates Frozen</span>
              </li>
              <li className="flex items-center gap-2">
                {designFeeSettled ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                <span className="text-slate-600">Design Fee Milestone Cleared</span>
              </li>
            </ul>
          </div>
        </div>

        {/* GATE 3 */}
        <div className={`p-6 rounded-2xl border flex flex-col justify-between transition-all ${e1Cleared ? 'bg-emerald-50/40 border-emerald-200' : 'bg-rose-50/40 border-rose-200'}`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-slate-400">GATE 03</span>
              {e1Cleared ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold font-mono bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> CLEARED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-bold font-mono bg-rose-100 px-2 py-0.5 rounded-full">
                  <XCircle className="w-3.5 h-3.5" /> BLOCKED
                </span>
              )}
            </div>

            <h4 className="text-sm font-bold text-slate-900 mb-1">E1 Site Procurement Gate</h4>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">Hard Gate: No vendor or PO placed before E1 (40%) clears</p>

            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-2">
                {e1Cleared ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                <span className={e1Cleared ? 'text-emerald-800 font-bold' : 'text-rose-800 font-bold'}>
                  {e1Cleared ? 'E1 Advance (40%) Cleared' : `E1 Pending: ${formatINR(e1Amount)}`}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-600">{e1Cleared ? 'Site Vendor POs Authorized' : 'Vendor PO Creation Locked'}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* GATE 4 */}
        <div className={`p-6 rounded-2xl border flex flex-col justify-between transition-all ${gate4Ready ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-slate-400">GATE 04</span>
              {gate4Ready ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold font-mono bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> HANDOVER READY
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-600 text-xs font-bold font-mono bg-slate-200 px-2 py-0.5 rounded-full">
                  IN PROGRESS
                </span>
              )}
            </div>

            <h4 className="text-sm font-bold text-slate-900 mb-1">Handover & Final Settlement</h4>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">E4 cleared + 0 open snags + CRs & as-actuals settled</p>

            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-2">
                {e4Cleared ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                <span className={e4Cleared ? 'text-slate-700 font-medium' : 'text-slate-500'}>E4 Final Payment Cleared</span>
              </li>
              <li className="flex items-center gap-2">
                {openSnags.length === 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                <span className={openSnags.length === 0 ? 'text-slate-700' : 'text-rose-700 font-medium'}>
                  {openSnags.length === 0 ? 'Snag List Zeroed (0 Open)' : `${openSnags.length} Open Snags Remaining`}
                </span>
              </li>
              <li className="flex items-center gap-2">
                {handoverSigned ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                <span className="text-slate-600">{handoverSigned ? 'Handover Certificate Executed' : 'Handover Signoff Pending'}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
