import React from 'react';
import { Check, X, Shield, Lock, FileCheck, ClipboardList, Package, Award, ArrowRight } from 'lucide-react';

interface HandoverReadinessWidgetProps {
  paymentMilestones: any[];
  snagList: any[];
  sofItems: any[];
  selections: any[];
  onOpenSiteOps: () => void;
  currentStage?: number;
}

export const HandoverReadinessWidget = ({
  paymentMilestones = [],
  snagList = [],
  sofItems = [],
  selections = [],
  onOpenSiteOps,
  currentStage = 1
}: HandoverReadinessWidgetProps) => {
  const isExecutionOrHandover = currentStage >= 5;

  // 1. E4 Payment Gate (Completion & Handover - 10%)
  const e4Milestone = paymentMilestones.find((m: any) => 
    m.type === 'execution' && (
      m.name?.toLowerCase().includes('e4') || 
      m.name?.toLowerCase().includes('handover') || 
      m.isHandoverAdvance
    )
  );
  const e4Satisfied = e4Milestone ? e4Milestone.status === 'paid' : false;

  // 2. Snag List Gate (Fully closed - open/in_progress count is 0)
  const openSnags = snagList.filter((item: any) => item.status === 'open' || item.status === 'in_progress').length;
  const snagsSatisfied = openSnags === 0 && snagList.length > 0;

  // 3. SOF Items Gate (All items delivered)
  const undeliveredSof = sofItems.filter((item: any) => item.status !== 'delivered').length;
  const sofSatisfied = undeliveredSof === 0 && sofItems.length > 0;

  // 4. CR & Selections Gate (Only satisfied if there are selections created and signed off)
  const pendingCRs = selections.filter((item: any) => item.clientSignoffStatus === 'pending' || item.status === 'pending_approval').length;
  const crSatisfied = selections.length > 0 && pendingCRs === 0;

  // Aggregate satisfaction (0% if still in pre-execution stages)
  const satisfiedCount = isExecutionOrHandover ? ((e4Satisfied ? 1 : 0) + (snagsSatisfied ? 1 : 0) + (sofSatisfied ? 1 : 0) + (crSatisfied ? 1 : 0)) : 0;
  const isReady = satisfiedCount === 4;

  return (
    <div className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col justify-between h-full min-h-[360px]">
      {/* Accent Line: Gold if fully ready, Indigo/Amber if pending */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${isReady ? 'bg-[#B5945B]' : 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/20'}`} />

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              isReady 
                ? 'bg-[#FAF9F5] border-[#ebdcb9]/40 text-[#B5945B]' 
                : 'bg-sky-50/50 border-sky-100/30 text-slate-900'
            }`}>
              <Award className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Handover Checklist</h3>
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
            isReady 
              ? 'bg-[#FAF9F5] border border-[#ebdcb9]/30 text-[#B5945B]' 
              : 'bg-slate-50 border border-slate-150 text-slate-500'
          }`}>
            {satisfiedCount} / 4 Passed
          </span>
        </div>

        {!isExecutionOrHandover && (
          <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Project in Stage {currentStage}: Handover gates unlock in Stage 6</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-200/60 px-2 py-0.5 rounded-md shrink-0">Stage 6 Gate</span>
          </div>
        )}

        {/* Dynamic Status Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>Overall Readiness</span>
            <span className="font-extrabold text-slate-900">{Math.round((satisfiedCount / 4) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${isReady ? 'bg-[#B5945B]' : 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20'}`} 
              style={{ width: `${(satisfiedCount / 4) * 100}%` }} 
            />
          </div>
        </div>

        {/* 4 checklist rows */}
        <div className="space-y-2.5 pt-1.5">
          {/* E4 Payment Row */}
          <div className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                e4Satisfied ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {e4Satisfied ? <Check size={12} strokeWidth={3} /> : <Lock size={10} />}
              </div>
              <span className="font-bold text-slate-900 truncate">E4 Handover Payment Cleared</span>
            </div>
            <span className={`text-[10px] font-bold ${e4Satisfied ? 'text-emerald-600' : 'text-slate-400'}`}>
              {e4Satisfied ? 'Paid' : 'Pending'}
            </span>
          </div>

          {/* Snags Row */}
          <div className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                snagsSatisfied ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {snagsSatisfied ? <Check size={12} strokeWidth={3} /> : <X size={11} strokeWidth={2.5} className="text-slate-400" />}
              </div>
              <span className="font-bold text-slate-900 truncate">Snag List Fully Closed</span>
            </div>
            <span className={`text-[10px] font-bold ${snagsSatisfied ? 'text-emerald-600' : 'text-slate-400'}`}>
              {snagsSatisfied ? 'Closed' : `${openSnags} open`}
            </span>
          </div>

          {/* SOF Deliveries Row */}
          <div className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                sofSatisfied ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {sofSatisfied ? <Check size={12} strokeWidth={3} /> : <X size={11} strokeWidth={2.5} className="text-slate-400" />}
              </div>
              <span className="font-bold text-slate-900 truncate">All SOF Items Delivered</span>
            </div>
            <span className={`text-[10px] font-bold ${sofSatisfied ? 'text-emerald-600' : 'text-slate-400'}`}>
              {sofSatisfied ? 'Delivered' : `${undeliveredSof} left`}
            </span>
          </div>

          {/* CRs Signed Off Row */}
          <div className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                crSatisfied ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {crSatisfied ? <Check size={12} strokeWidth={3} /> : <X size={11} strokeWidth={2.5} className="text-slate-400" />}
              </div>
              <span className="font-bold text-slate-900 truncate">Change Requests Signed Off</span>
            </div>
            <span className={`text-[10px] font-bold ${crSatisfied ? 'text-emerald-600' : 'text-slate-400'}`}>
              {crSatisfied ? 'Settled' : `${pendingCRs} pending`}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 mt-5 shrink-0">
        <button 
          onClick={onOpenSiteOps}
          className="w-full text-center text-xs font-bold text-slate-900 hover:text-[#B5945B] transition-colors flex items-center justify-center gap-1.5"
        >
          <span>Open Site Control Room</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
