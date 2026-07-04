import React, { useState } from 'react';
import { FullBoqItem, ProfitabilityHotspot } from '../types';
import { analyzeProfitability, isAiAvailable } from '../services/geminiService';
import { formatCurrency } from '../lib/utils';
import { TrendingUpIcon, AlertCircleIcon } from './Icons';

interface ProfitabilityHotspotsProps {
    boq: FullBoqItem[];
}

const HotspotList: React.FC<{ title: string; items: ProfitabilityHotspot[]; mode: 'engine' | 'drag' }> = ({ title, items, mode }) => {
    const isEngine = mode === 'engine';
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h4 className={`font-bold mb-4 text-[10px] uppercase tracking-widest flex items-center gap-2 ${isEngine ? 'text-emerald-500' : 'text-amber-500'}`}>
                {isEngine ? <TrendingUpIcon className="w-4 h-4" /> : <AlertCircleIcon className="w-4 h-4" />} {title}
            </h4>
            <div className="space-y-3">
                {items.length === 0 && <p className="text-xs text-slate-400 italic">No significant items found.</p>}
                {items.map(item => (
                    <div key={item.itemId} className={`p-4 rounded-xl border ${isEngine ? 'bg-emerald-50/50 border-emerald-100' : 'bg-amber-50/50 border-amber-100'}`}>
                        <p className="font-bold text-sm text-indigo-950 leading-tight mb-2">{item.itemName}</p>
                        <div className="flex gap-4 mb-3">
                            <div>
                                <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider">Profit</span>
                                <span className={`font-mono font-bold text-sm ${isEngine ? 'text-emerald-700' : 'text-amber-700'}`}>{formatCurrency(item.totalProfit)}</span>
                            </div>
                            <div>
                                <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider">Margin</span>
                                <span className="font-mono font-bold text-sm text-slate-700">{item.profitMargin.toFixed(1)}%</span>
                            </div>
                        </div>
                        <p className={`text-[10px] leading-relaxed pt-3 border-t ${isEngine ? 'border-emerald-200 text-emerald-800' : 'border-amber-200 text-amber-800'}`}>
                            "{item.rationale}"
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

const ProfitabilityHotspots: React.FC<ProfitabilityHotspotsProps> = ({ boq }) => {
    const [hotspots, setHotspots] = useState<{ engines: ProfitabilityHotspot[], drags: ProfitabilityHotspot[] } | null>(null);
    const [loading, setLoading] = useState(false);

    const handleAnalyze = async () => {
        setLoading(true);
        const result = await analyzeProfitability(boq);
        setHotspots(result);
        setLoading(false);
    };

    return (
        <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
            <div className="mb-6">
                <h3 className="text-xl font-light tracking-tight text-indigo-950 leading-none mb-1">Profitability Hotspots</h3>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Identify top performers and margin drags</p>
            </div>
            
            <p className="text-sm text-slate-600 mb-6">
                Analyze your line items to uncover the hidden financial drivers of your project.
            </p>

            {hotspots ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <HotspotList title="Profit Engines" items={hotspots.engines} mode="engine" />
                    <HotspotList title="Margin Drags" items={hotspots.drags} mode="drag" />
                </div>
            ) : (
                <button
                    onClick={handleAnalyze}
                    disabled={loading || !isAiAvailable() || boq.length === 0}
                    className="flex w-full items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-indigo-950 font-bold text-[11px] uppercase tracking-[0.2em] rounded-full hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {loading ? (
                         <div className="flex items-center gap-2">
                             <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin"></div> 
                             Analyzing Pipeline
                         </div>
                    ) : 'Reveal Hotspots'}
                </button>
            )}
        </div>
    );
};

export default ProfitabilityHotspots;
