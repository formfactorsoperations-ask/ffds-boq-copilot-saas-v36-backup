
import React, { useState } from 'react';
import { FullBoqItem, ValueEngineeringSuggestion, BoqItem } from '../types';
import { suggestValueEngineering, isAiAvailable } from '../services/geminiService';
import Card from './shared/Card';
import { SparklesIcon, WandIcon } from './Icons';
import { formatCurrency } from '../lib/utils';

interface ValueEngineeringProps {
    boq: FullBoqItem[];
    setBoq: React.Dispatch<React.SetStateAction<BoqItem[]>>;
}

const ValueEngineering: React.FC<ValueEngineeringProps> = ({ boq, setBoq }) => {
    const [suggestions, setSuggestions] = useState<ValueEngineeringSuggestion[]>([]);
    const [loading, setLoading] = useState(false);

    const handleAnalyze = async () => {
        setLoading(true);
        const result = await suggestValueEngineering(boq);
        setSuggestions(result);
        setLoading(false);
    };

    const handleApply = (suggestion: ValueEngineeringSuggestion) => {
        setBoq(prev => prev.map(item => {
            if (item.id === suggestion.originalItemId) {
                // Determine new item cost basis approx based on savings
                // Savings = (OldCost - NewCost)
                // NewCost = OldCost - Savings
                // NewCost per unit = (Total New Cost) / Qty
                
                // Note: We can't change the bank Item specs directly here cleanly without breaking the bank link.
                // Best approach for this MVP: Update the rationale with the new specs and add a margin override to reflect cost saving if possible, 
                // OR ideally, we assume the user will manually swap. 
                // For this implementation, we will append the suggestion to the rationale so the designer can act.
                
                return {
                    ...item,
                    rationale: `VALUE ENG: ${suggestion.alternativeName}. ${suggestion.impactAnalysis}. Specs: ${suggestion.alternativeSpecs}`
                };
            }
            return item;
        }));
        
        // Remove applied suggestion
        setSuggestions(prev => prev.filter(s => s.originalItemId !== suggestion.originalItemId));
        alert("Suggestion applied to item Rationale. Please review and adjust specs manually if needed.");
    };

    return (
        <Card title="Smart Value Engineering" titleIcon={<WandIcon className="w-4 h-4"/>}>
            <p className="text-sm text-slate-600 mb-4">
                AI analyzes your high-cost items and suggests alternative materials or specs to reduce the budget without losing the design intent.
            </p>
            
            <button 
                onClick={handleAnalyze} 
                disabled={loading || !isAiAvailable() || boq.length === 0}
                className="mb-6 w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
                {loading ? 'Analyzing Options...' : <><SparklesIcon className="w-4 h-4" /> Find Cost Savings</>}
            </button>

            <div className="space-y-4">
                {suggestions.map((s, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm">{s.originalItemName}</h4>
                                <p className="text-xs text-slate-500 strike-through">Current Cost: {formatCurrency(s.originalCost)}</p>
                            </div>
                            <div className="text-right">
                                <span className="inline-block bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-xs font-bold">
                                    Save {formatCurrency(s.projectedSavings)}
                                </span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3 mb-3 bg-slate-50 p-2 rounded-lg">
                            <span className="text-xl">👉</span>
                            <div>
                                <p className="font-bold text-slate-800 text-sm">{s.alternativeName}</p>
                                <p className="text-[10px] text-slate-500 leading-tight">{s.alternativeSpecs}</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-600 italic mb-3">"{s.impactAnalysis}"</p>

                        <button 
                            onClick={() => handleApply(s)}
                            className="w-full py-2 bg-white border border-indigo-200 text-indigo-700 font-bold text-xs rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                            Apply Suggestion
                        </button>
                    </div>
                ))}
                {suggestions.length === 0 && !loading && (
                    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-xl">
                        No active suggestions. Run analysis to see opportunities.
                    </div>
                )}
            </div>
        </Card>
    );
};

export default ValueEngineering;
