import React, { useState } from 'react';
import { showSuccessWithNext } from './SuccessWithNextToast';
import { BoqItem, MarginSuggestion, AIStrategy, FullBoqItem } from '../types';
import { optimizeMargins, isAiAvailable } from '../services/geminiService';
import { SparklesIcon } from './Icons';
import { UI_STYLES, UI_CONSTANTS } from '../lib/UIConstants';

interface MarginOptimizerProps {
  boq: FullBoqItem[];
  setBoq: React.Dispatch<React.SetStateAction<BoqItem[]>>;
  aiStrategy: AIStrategy;
}

const MarginOptimizer: React.FC<MarginOptimizerProps> = ({ boq, setBoq, aiStrategy }) => {
  const [targetGm, setTargetGm] = useState<number>(35);
  const [suggestions, setSuggestions] = useState<MarginSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);

  const handleSuggest = async () => {
    setHasClicked(true);
    setLoading(true);
    setSuggestions([]);
    
    // Pass the full boq object directly as the service expects it
    const result = await optimizeMargins(boq, targetGm, aiStrategy);
    setSuggestions(result);
    setLoading(false);
  };

  const handleApply = () => {
    setBoq(currentBoq => {
      const updatedBoq = [...currentBoq];
      suggestions.forEach(suggestion => {
        const itemIndex = updatedBoq.findIndex(item => item.id === suggestion.itemId);
        if (itemIndex > -1) {
          updatedBoq[itemIndex] = { ...updatedBoq[itemIndex], marginOverride: suggestion.newMargin };
        }
      });
      return updatedBoq;
    });
    setHasClicked(false);
    setSuggestions([]);
    showSuccessWithNext('Health check completed and margins optimized');
  };

  return (
    <div className="bg-[#FDFDFB] p-6 rounded-xl border border-slate-200/80 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-[#FDFDFB] border border-slate-200/80 text-[#3D52A0] rounded-full shadow-sm">
          <SparklesIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className={UI_STYLES.font.h2}>AI Engine</h3>
          <p className="text-[11px] text-[#C5A85C] font-bold uppercase tracking-widest mt-1">Margin Optimizer</p>
        </div>
      </div>
      
      <div className="space-y-6">
        <p className={UI_STYLES.font.body}>
          Set a target Gross Margin, and let AI systematically adjust line-item margins using market pricing strategies.
        </p>

        <div className="flex flex-wrap items-center gap-4 bg-slate-50/50 p-4 rounded-lg border border-slate-200/80 shadow-sm">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="targetGm" className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Margin %</label>
            <div className="relative">
                <input
                  id="targetGm"
                  type="number"
                  value={targetGm}
                  onChange={(e) => setTargetGm(Number(e.target.value))}
                  className="w-full bg-[#FDFDFB] font-mono font-bold text-[#0F172A] text-base p-3 rounded-lg border border-slate-200/80 focus:outline-none focus:border-[#C5A85C] focus:ring-1 focus:ring-[#C5A85C] transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
            </div>
          </div>
          <div className="w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-6">
              <button
                onClick={handleSuggest}
                disabled={loading || !isAiAvailable() || boq.length === 0}
                className={`${UI_STYLES.button.md} ${UI_STYLES.button.primary} w-full`}
              >
                {loading ? (
                    <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> 
                        Generating
                    </div>
                ) : 'Run Simulation'}
              </button>
          </div>
        </div>
        
        {!isAiAvailable() && <p className="text-xs text-rose-500 font-bold uppercase tracking-widest mt-2">AI service not available.</p>}

        {suggestions.length > 0 && (
          <div className="bg-[#FDFDFB] rounded-xl border border-slate-200/80 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 bg-slate-50/50 border-b border-slate-200/80">
                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Suggested Changes</h5>
            </div>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto custom-scrollbar">
              {suggestions.map(s => (
                <div key={s.itemId} className="p-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-base text-[#0F172A] leading-tight pr-4">{s.itemName}</p>
                      <div className="flex items-center gap-2 shrink-0 bg-slate-100 px-2 py-1 rounded">
                          <span className="text-slate-500 font-mono text-sm">{s.currentMargin.toFixed(1)}%</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-[#3D52A0] font-bold font-mono text-sm">{s.newMargin.toFixed(1)}%</span>
                      </div>
                  </div>
                  <p className="text-sm text-slate-500 italic leading-relaxed pt-2 border-t border-slate-100/50">"{s.rationale}"</p>
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-50/50 border-t border-slate-200/80">
                <button
                  onClick={handleApply}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg transition-colors shadow-sm active:scale-[0.98]"
                >
                  Accept & Apply
                </button>
            </div>
          </div>
        )}
         {loading === false && suggestions.length === 0 && boq.length > 0 && hasClicked && (
             <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-4">Simulation found no safe optimizations.</p>
         )}
      </div>
    </div>
  );
};

export default MarginOptimizer;
