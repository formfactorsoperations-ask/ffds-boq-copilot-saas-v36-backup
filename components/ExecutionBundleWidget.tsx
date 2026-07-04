import React, { useMemo } from 'react';
import { ArrowRight, HardHat, CheckCircle2, ShieldAlert, PlayCircle } from 'lucide-react';
import { generateBundlesFromBoq } from './ExecutionWorkspace';

export function ExecutionBundleWidget({ 
  executionData, 
  boq, 
  onClick 
}: { 
  executionData: any;
  boq: any[];
  onClick: () => void;
}) {
  const fallbackBundles = useMemo(() => generateBundlesFromBoq(boq || []), [boq]);
  const bundles = executionData?.bundles && executionData.bundles.length > 0 
    ? executionData.bundles 
    : fallbackBundles;

  const activeCount = bundles.filter((b: any) => b.status === "active").length;
  const blockedCount = bundles.filter((b: any) => b.status === "blocked").length;
  const completedCount = bundles.filter((b: any) => b.status === "completed").length;
  
  const totalBundles = bundles.length;
  const progressPct = totalBundles > 0 ? Math.round((completedCount / totalBundles) * 100) : 0;

  // Bottlenecks
  const sofBlocked = bundles.filter((b: any) => b.status === 'blocked' && !b.gatekeepers?.sof).length;
  const gfcBlocked = bundles.filter((b: any) => b.status === 'blocked' && !b.gatekeepers?.gfc).length;
  const commBlocked = bundles.filter((b: any) => b.status === 'blocked' && !b.gatekeepers?.payment).length;
  const siteBlocked = bundles.filter((b: any) => b.status === 'blocked' && !b.gatekeepers?.site).length;

  // Find a bundle that needs attention (blocked, or active and can be completed)
  const urgentBundle = bundles.find((b: any) => b.status === 'blocked' || b.status === 'active') || bundles[0];

  return (
    <div 
      onClick={onClick} 
      className="col-span-1 bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col cursor-pointer hover:shadow-lg transition-all min-h-[450px] h-full relative"
    >
      <h2 className="text-2xl font-light tracking-tighter text-indigo-950 mb-2">Execution</h2>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Bundles & Progress</p>
      
      <div className="flex items-center gap-6 mb-8">
        <div className={`text-6xl font-light tracking-tighter ${progressPct === 100 ? 'text-emerald-500' : progressPct > 0 ? 'text-indigo-500' : 'text-slate-400'}`}>
          {progressPct}%
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-indigo-900">{completedCount} of {totalBundles}</span>
          <span className="text-xs text-slate-500">Bundles Completed</span>
        </div>
      </div>

      <div className="space-y-4 flex-grow">
        <div className="flex gap-2">
            <div className="flex-1 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-emerald-600">{activeCount}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600/70">Active</span>
            </div>
            <div className="flex-1 bg-rose-50/50 border border-rose-100 rounded-2xl p-3 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-rose-600">{blockedCount}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-rose-600/70">Blocked</span>
            </div>
            <div className="flex-1 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-3 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-indigo-600">{completedCount}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-600/70">Done</span>
            </div>
        </div>

        {blockedCount > 0 && (
            <div className="flex gap-1.5 justify-between py-2 border-b border-slate-100">
                <div className="flex flex-col items-center flex-1">
                    <span className="text-[9px] font-bold uppercase text-slate-400">SOF</span>
                    <span className={`text-xs font-bold ${sofBlocked > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{sofBlocked}</span>
                </div>
                <div className="flex flex-col items-center flex-1">
                    <span className="text-[9px] font-bold uppercase text-slate-400">GFC</span>
                    <span className={`text-xs font-bold ${gfcBlocked > 0 ? 'text-rose-500' : 'text-slate-300'}`}>{gfcBlocked}</span>
                </div>
                <div className="flex flex-col items-center flex-1">
                    <span className="text-[9px] font-bold uppercase text-slate-400">Comm</span>
                    <span className={`text-xs font-bold ${commBlocked > 0 ? 'text-indigo-500' : 'text-slate-300'}`}>{commBlocked}</span>
                </div>
                <div className="flex flex-col items-center flex-1">
                    <span className="text-[9px] font-bold uppercase text-slate-400">Site</span>
                    <span className={`text-xs font-bold ${siteBlocked > 0 ? 'text-emerald-500' : 'text-slate-300'}`}>{siteBlocked}</span>
                </div>
            </div>
        )}

        {urgentBundle ? (
          <div className={`p-4 rounded-2xl border mt-2 ${
             urgentBundle.status === 'active' ? 'border-emerald-200 bg-emerald-50/30' : 
             urgentBundle.status === 'blocked' ? 'border-rose-200 bg-rose-50/30' : 
             'border-slate-200 bg-slate-50/30'
          }`}>
             <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-white text-slate-600 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200">
                    {urgentBundle.code}
                </span>
                <h4 className="text-xs font-bold text-indigo-950 truncate">{urgentBundle.name}</h4>
             </div>
             <p className="text-[10px] text-slate-600 line-clamp-2 leading-relaxed mb-3">
                {urgentBundle.actToday || 'Review bundle gates and update execution status.'}
             </p>
             <div className="flex items-center justify-between">
                <span className={`text-[9px] font-bold uppercase tracking-widest ${
                    urgentBundle.status === 'active' ? 'text-emerald-600' : 
                    urgentBundle.status === 'blocked' ? 'text-rose-600' : 'text-slate-500'
                }`}>
                    {urgentBundle.status}
                </span>
                {urgentBundle.status === 'active' && <PlayCircle className="w-4 h-4 text-emerald-500" />}
                {urgentBundle.status === 'blocked' && <ShieldAlert className="w-4 h-4 text-rose-400" />}
                {urgentBundle.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100 h-32">
              <HardHat className="w-8 h-8 text-slate-300 mb-2" />
              <span className="text-xs font-medium text-slate-500">No active bundles</span>
          </div>
        )}
      </div>

      <div className="mt-4 text-right">
        <span className="text-sm font-semibold text-indigo-600 flex items-center gap-1 justify-end">
          Execution Workspace <ArrowRight className="w-4 h-4"/>
        </span>
      </div>
    </div>
  );
}
