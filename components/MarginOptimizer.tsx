import React, { useState } from 'react';
import { BoqItem, MarginSuggestion, AIStrategy, FullBoqItem } from '../types';
import { optimizeMargins, isAiAvailable } from '../services/geminiService';
import Card from './shared/Card';
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
    alert("Margin suggestions applied!");
    setSuggestions([]);
  };

  return (
    <Card title="AI Margin Optimizer" titleIcon={<SparklesIcon className="w-4 h-4" />}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Set a target Gross Margin, and let AI suggest intelligent adjustments to individual item margins.
        </p>
        <div className="flex flex-wrap items-center gap-4 p-3 bg-slate-50 rounded-lg">
          <label htmlFor="targetGm" className="font-semibold text-slate-700">Target GM %</label>
          <input
            id="targetGm"
            type="number"
            value={targetGm}
            onChange={(e) => setTargetGm(Number(e.target.value))}
            className="w-24 p-2 border border-slate-300 rounded-lg text-center font-bold"
          />
          <button
            onClick={handleSuggest}
            disabled={loading || !isAiAvailable() || boq.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Optimizing...' : 'Suggest Changes'}
          </button>
        </div>
        {!isAiAvailable() && <p className="text-xs text-amber-600">AI service not available. This feature is disabled.</p>}

        {suggestions.length > 0 && (
          <div>
            <h5 className="font-bold mb-2">Suggested Changes:</h5>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
              {suggestions.map(s => (
                <div key={s.itemId} className="text-sm p-2 bg-white border rounded-md">
                  <p className="font-bold">{s.itemName}</p>
                  <p>Margin: <span className="text-red-600">{s.currentMargin.toFixed(1)}%</span> → <span className="text-green-600 font-bold">{s.newMargin.toFixed(1)}%</span></p>
                  <p className="text-xs text-slate-500 italic">Rationale: {s.rationale}</p>
                </div>
              ))}
            </div>
            <button
              onClick={handleApply}
              className="mt-4 w-full px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg shadow-md hover:bg-emerald-700 transition"
            >
              Apply Suggestions
            </button>
          </div>
        )}
         {loading === false && suggestions.length === 0 && boq.length > 0 && hasClicked && (
             <p className="text-sm text-slate-500 mt-2">AI could not find any optimizations for the current target.</p>
         )}
         {!hasClicked && (
             <p className="text-sm text-slate-500 mt-2">No suggestions to display. Click "Suggest Changes" to begin.</p>
         )}
      </div>
    </Card>
  );
};

export default MarginOptimizer;
