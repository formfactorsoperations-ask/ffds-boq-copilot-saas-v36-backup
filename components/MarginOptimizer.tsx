import React, { useState } from 'react';
import { BoqItem, MarginSuggestion, AIStrategy, FullBoqItem } from '../types';
import { optimizeMargins, isAiAvailable } from '../services/geminiService';
import { SparklesIcon } from './Icons';

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
  };

  return (
    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-white border border-slate-200 text-indigo-600 rounded-full shadow-sm">
          <SparklesIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-light tracking-tight text-indigo-950 leading-none">AI Engine</h3>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">Margin Optimizer</p>
        </div>
      </div>
      
      <div className="space-y-6">
        <p className="text-sm text-slate-600">
          Set a target Gross Margin, and let AI systematically adjust line-item margins using market pricing strategies.
        </p>

        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="targetGm" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Target Margin %</label>
            <div className="relative">
                <input
                  id="targetGm"
                  type="number"
                  value={targetGm}
                  onChange={(e) => setTargetGm(Number(e.target.value))}
                  className="w-full bg-slate-50 font-mono font-bold text-indigo-950 text-lg p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
            </div>
          </div>
          <div className="w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-6">
              <button
                onClick={handleSuggest}
                disabled={loading || !isAiAvailable() || boq.length === 0}
                className="flex w-full items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 text-white font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
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
        
        {!isAiAvailable() && <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-2">AI service not available.</p>}

        {suggestions.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Suggested Changes</h5>
            </div>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto custom-scrollbar">
              {suggestions.map(s => (
                <div key={s.itemId} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-sm text-indigo-950 leading-tight pr-4">{s.itemName}</p>
                      <div className="flex items-center gap-2 shrink-0 bg-slate-100 px-2 py-1 rounded">
                          <span className="text-slate-500 font-mono text-xs">{s.currentMargin.toFixed(1)}%</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-indigo-600 font-bold font-mono text-xs">{s.newMargin.toFixed(1)}%</span>
                      </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic leading-relaxed pt-2 border-t border-slate-100/50">"{s.rationale}"</p>
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200">
                <button
                  onClick={handleApply}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 text-white font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl hover:bg-emerald-600 transition-colors shadow-sm"
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
