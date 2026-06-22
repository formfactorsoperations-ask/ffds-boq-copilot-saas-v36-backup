

import React, { useState } from 'react';
import { BoqItem, FullBoqItem } from '../types';
import { getAiCoachSuggestions, isAiAvailable } from '../services/geminiService';
import Card from './shared/Card';
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
    <Card title="AI Coach" titleIcon={<SparklesIcon className="w-4 h-4" />}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Get AI-powered insights and recommendations to improve your project's profitability.
        </p>
        {!isAiAvailable() && <p className="text-xs text-amber-600">AI service not available. This feature is disabled.</p>}
        <button
          onClick={handleGetInsights}
          disabled={loading || !isAiAvailable() || !boq || boq.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold mb-4 rounded-lg shadow-sm hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
             <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Analyzing...</>
          ) : 'Get AI Insights'}
        </button>

        {error ? (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg border border-red-200 text-sm font-bold">
                {error}
                <button onClick={handleGetInsights} className="ml-3 underline hover:text-red-800">Retry</button>
            </div>
        ) : suggestions.length > 0 ? (
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
            <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-widest mb-3 border-b border-indigo-200 pb-2">Strategic Recommendations</h4>
            <ul className="space-y-3 text-sm text-slate-800">
              {suggestions.map((s, i) => (
                <li key={i} className="flex gap-2">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
};

export default AICoach;
