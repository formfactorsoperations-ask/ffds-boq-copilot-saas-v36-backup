

import React, { useState } from 'react';
import { BoqItem, FullBoqItem } from '../types';
import { getAiCoachSuggestions, isAiAvailable } from '../services/geminiService';
import { SparklesIcon } from './Icons';

interface AICoachProps {
  boq: FullBoqItem[];
  aggregates: any; // Simplified for this component
}

const AICoach: React.FC<AICoachProps> = ({ boq, aggregates }) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetInsights = async () => {
    setLoading(true);
    setError(null);
    try {
        const rawBoq: BoqItem[] = boq.map(({ id, bankId, qty, marginOverride, rationale, roomId }) => ({
            id, bankId, qty, marginOverride, rationale, roomId
        }));
        const result = await getAiCoachSuggestions(rawBoq, aggregates);
        setSuggestions(result);
    } catch (e: any) {
        console.error("AI Coach failed:", e);
        setError(e.message || "Failed to generate AI insights.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-white border border-slate-200 text-indigo-950 rounded-full shadow-sm">
          <SparklesIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-light tracking-tight text-indigo-950 leading-none">AI Coach</h3>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">Margin Optimization</p>
        </div>
      </div>
      
      <div className="space-y-4">
        <p className="text-sm text-slate-600 mb-6">
          Get AI-powered insights and recommendations to improve your project's profitability and mitigate financial risks.
        </p>
        {!isAiAvailable() && <p className="text-xs text-amber-600 font-bold uppercase tracking-widest">AI disabled</p>}
        
        {suggestions.length === 0 && !loading && !error && (
            <button
              onClick={handleGetInsights}
              disabled={!isAiAvailable() || !boq || boq.length === 0}
              className="flex w-full items-center justify-center gap-2 px-6 py-3 bg-indigo-950 text-white font-bold text-[11px] uppercase tracking-[0.2em] rounded-full hover:bg-indigo-900 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              Analyze Metrics
            </button>
        )}

        {loading && (
             <div className="flex w-full items-center justify-center gap-3 px-6 py-3 bg-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-[0.2em] rounded-full">
                 <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-600 rounded-full animate-spin"></div> 
                 Processing
             </div>
        )}

        {error && (
            <div className="bg-rose-50 text-rose-600 p-4 rounded-xl border border-rose-200 text-sm font-bold">
                {error}
                <button onClick={handleGetInsights} className="ml-3 underline hover:text-rose-800">Retry</button>
            </div>
        )}
        
        {suggestions.length > 0 && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Strategic Recommendations</h4>
            <ul className="space-y-4 text-sm text-indigo-900">
              {suggestions.map((s, i) => (
                <li key={i} className="flex gap-3 leading-relaxed">
                    <span className="text-emerald-500 font-bold mt-0.5 opacity-50">+</span>
                    <span>{s}</span>
                </li>
              ))}
            </ul>
             <button
              onClick={handleGetInsights}
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-[0.2em] rounded-full hover:bg-slate-50 transition-colors"
            >
               Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AICoach;
