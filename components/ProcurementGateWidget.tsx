import React from 'react';
import { ShieldAlert, ShieldCheck, Lock, Unlock, ArrowRight, ShoppingBag } from 'lucide-react';

interface ProcurementGateWidgetProps {
  paymentMilestones: any[];
  sofItems: any[];
  onOpenLedger: () => void;
}

export const ProcurementGateWidget = ({
  paymentMilestones = [],
  sofItems = [],
  onOpenLedger
}: ProcurementGateWidgetProps) => {
  // Find the Material Order Advance milestone (usually E1, 40%)
  const e1Milestone = paymentMilestones.find((m: any) => 
    m.type === 'execution' && (
      m.name?.toLowerCase().includes('e1') || 
      m.name?.toLowerCase().includes('material order advance') ||
      m.name?.toLowerCase().includes('advance')
    )
  );

  const e1Cleared = e1Milestone ? e1Milestone.status === 'paid' : false;
  const e1Invoiced = e1Milestone ? e1Milestone.status === 'invoiced' : false;

  // Items ready to be ordered (frozen) but blocked if E1 is not cleared
  const frozenItems = sofItems.filter((item: any) => item.status === 'frozen');
  const blockedCount = !e1Cleared ? frozenItems.length : 0;
  const releasedCount = e1Cleared ? frozenItems.length : 0;
  const orderedCount = sofItems.filter((item: any) => item.status === 'ordered' || item.status === 'delivered').length;

  return (
    <div className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col justify-between h-full min-h-[360px]">
      {/* Accent Line: Gold if locked, Emerald if cleared */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${e1Cleared ? 'bg-emerald-500' : 'bg-[#B5945B]/40'}`} />

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              e1Cleared 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                : 'bg-amber-50 border-amber-100 text-[#B5945B]'
            }`}>
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Procurement & PO Gate</h3>
          </div>
          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
            e1Cleared 
              ? 'bg-emerald-50 border-emerald-150 text-emerald-700' 
              : 'bg-[#FAF9F5] border-[#ebdcb9]/45 text-[#B5945B]'
          }`}>
            {e1Cleared ? 'Gate Open' : 'Gate Locked'}
          </span>
        </div>

        {/* E1 Status Card */}
        <div className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-all ${
          e1Cleared 
            ? 'bg-emerald-50/20 border-emerald-100' 
            : 'bg-amber-50/20 border-amber-100/60'
        }`}>
          <div className="mt-0.5 shrink-0">
            {e1Cleared ? (
              <div className="w-8 h-8 rounded-full bg-emerald-150/40 border border-emerald-200 flex items-center justify-center text-emerald-600 animate-pulse">
                <Unlock size={14} />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-100/40 border border-amber-200 flex items-center justify-center text-[#B5945B]">
                <Lock size={14} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-extrabold text-slate-900">
              E1 Milestone: {e1Milestone?.name || 'Material Order Advance (40%)'}
            </h4>
            <p className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">
              {e1Cleared ? (
                <span className="text-emerald-700 font-semibold">Payment Received! Procurement releases authorized to place with vendors.</span>
              ) : e1Invoiced ? (
                <span className="text-amber-600 font-semibold">Invoice issued to client. Awaiting payment clearance to unlock orders.</span>
              ) : (
                <span className="text-[#B5945B] font-semibold">Not invoiced. Request E1 advance to unlock procurement releases.</span>
              )}
            </p>
          </div>
        </div>

        {/* PO Compliance Metric Block */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Blocked POs</span>
            <span className={`text-base font-extrabold block mt-0.5 ${blockedCount > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
              {blockedCount}
            </span>
            <span className="text-[8px] text-slate-500 block mt-1 font-medium">Needs E1 Clearance</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Authorized POs</span>
            <span className="text-base font-extrabold text-slate-900 block mt-0.5">
              {releasedCount + orderedCount}
            </span>
            <span className="text-[8px] text-slate-500 block mt-1 font-medium">Ready or Placed</span>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 mt-5 shrink-0">
        <button 
          onClick={onOpenLedger}
          className="w-full text-center text-xs font-bold text-slate-900 hover:text-[#B5945B] transition-colors flex items-center justify-center gap-1.5"
        >
          <span>Open Financial Ledger</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
