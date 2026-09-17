import React, { useState } from 'react';
import { SmartActionItem } from './types';
import { BoqItem, FullBoqItem, Item } from '../../types';
import { formatCurrency, formatINR } from '../../lib/utils';
import { generateEssentialTradeItems } from './healthEngine';
import { Zap, Check, ArrowRight, Sparkles, AlertCircle, ShieldAlert, Layers, Lock } from 'lucide-react';

interface SmartActionQueueProps {
  smartActions: SmartActionItem[];
  boq: FullBoqItem[];
  setBoq: React.Dispatch<React.SetStateAction<BoqItem[]>>;
  bank: Item[];
  onActionComplete?: (message: string) => void;
  /** A frozen BOQ is the contracted scope. Auto-fixes rewrite client-facing
      prices, so once it is frozen they must go through the variation flow
      instead -- otherwise this screen silently changes what was quoted while
      its own gate audit reports the baseline as protected. */
  boqFrozen?: boolean;
  /** Designers do not reprice. Defaults to false so a caller that forgets to
      pass a role gets the safe behaviour, not the permissive one. */
  canEdit?: boolean;
}

export const SmartActionQueue: React.FC<SmartActionQueueProps> = ({
  smartActions,
  boq,
  setBoq,
  bank,
  onActionComplete,
  boqFrozen = false,
  canEdit = false
}) => {
  const locked = boqFrozen || !canEdit;
  const lockReason = boqFrozen
    ? 'The BOQ is frozen. Raise a variation to change contracted prices.'
    : 'Your role cannot change pricing.';
  const [activeFixing, setActiveFixing] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // 1. SMART BIT: 1-Click Auto-Fix Margin Drags
  const handleAutoFixMargins = () => {
    if (locked) return;
    setActiveFixing('auto_fix_margins');
    setTimeout(() => {
      let count = 0;
      setBoq(prevBoq => {
        return prevBoq.map(item => {
          // Check if item margin is below safe benchmark (e.g., < 22%)
          const currentMargin = item.marginOverride ?? 0;
          if (currentMargin < 22) {
            count++;
            return {
              ...item,
              marginOverride: 28 // Normalize to healthy studio benchmark
            };
          }
          return item;
        });
      });
      setActiveFixing(null);
      const msg = `Smart Auto-Fix applied: Successfully normalized ${count || 'all'} low-margin items to 28% target margin.`;
      setSuccessNotice(msg);
      if (onActionComplete) onActionComplete(msg);
      setTimeout(() => setSuccessNotice(null), 5000);
    }, 400);
  };

  // 2. SMART BIT: Auto-Inject Missing Baseline Trade
  const handleInjectTrade = (tradeName: string) => {
    if (locked) return;
    setActiveFixing('inject_trade');
    setTimeout(() => {
      const newItems = generateEssentialTradeItems(tradeName.toLowerCase());
      if (newItems.length > 0) {
        setBoq(prev => [...prev, ...newItems]);
        const msg = `Injected essential trade bundle: Added ${tradeName} to BOQ scope.`;
        setSuccessNotice(msg);
        if (onActionComplete) onActionComplete(msg);
      }
      setActiveFixing(null);
      setTimeout(() => setSuccessNotice(null), 5000);
    }, 400);
  };

  if (smartActions.length === 0) {
    return (
      <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-emerald-900">Smart Audit Clean</h4>
            <p className="text-xs text-emerald-700 mt-0.5">No critical scope omissions or margin drags requiring immediate auto-correction.</p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100/70 px-3 py-1 rounded-full uppercase tracking-wider">
          All Systems Verified
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#B5945B]/15 text-[#B5945B] rounded-xl">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Smart Diagnostic Action Queue</h3>
            <p className="text-xs text-slate-500 mt-0.5">High-impact 1-click optimizations detected by the forensic engine</p>
          </div>
        </div>

        <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full self-start sm:self-auto">
          {smartActions.length} Smart Action{smartActions.length > 1 ? 's' : ''} Ready
        </span>
      </div>

      {locked && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-900">One-click fixes are disabled</p>
            <p className="text-[11.5px] text-amber-800 mt-0.5 leading-snug">{lockReason}</p>
          </div>
        </div>
      )}

      {successNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600" />
          {successNotice}
        </div>
      )}

      {/* Smart Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {smartActions.map(action => (
          <div
            key={action.id}
            className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-white transition-all flex flex-col justify-between group shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold font-mono tracking-widest uppercase px-2.5 py-0.5 rounded-md bg-[#3D52A0] text-white">
                  {action.badge}
                </span>
                <span className="text-xs font-bold text-emerald-600 font-mono">
                  {action.impact}
                </span>
              </div>

              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {action.title}
              </h4>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                {action.description}
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200/60 flex items-center justify-between">
              {action.type === 'auto_fix_margins' && (
                <button
                  onClick={handleAutoFixMargins}
                  disabled={locked || activeFixing === 'auto_fix_margins'}
                  title={locked ? lockReason : undefined}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {activeFixing === 'auto_fix_margins' ? 'Normalizing Margins...' : '1-Click Auto-Normalize to 28%'}
                </button>
              )}

              {action.type === 'inject_trade' && (
                <button
                  onClick={() => handleInjectTrade(action.data?.missingTrades?.[0] || 'Surface Protection')}
                  disabled={locked || activeFixing === 'inject_trade'}
                  title={locked ? lockReason : undefined}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Layers className="w-3.5 h-3.5" />
                  {activeFixing === 'inject_trade' ? 'Injecting Pack...' : `1-Click Auto-Inject ${action.data?.missingTrades?.[0] || 'Trade'}`}
                </button>
              )}

              {action.type === 'map_rooms' && (
                <div className="w-full text-xs text-slate-500 flex items-center justify-between">
                  <span>Target unquoted spaces in BOQ tab</span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              )}

              {action.type === 'fix_zero_rates' && (
                <button
                  onClick={handleAutoFixMargins}
                  disabled={locked}
                  title={locked ? lockReason : undefined}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Audit Line Item Pricing
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
