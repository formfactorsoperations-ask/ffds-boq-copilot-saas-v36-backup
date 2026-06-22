import React, { useState } from 'react';
import { FullBoqItem, ProfitabilityHotspot } from '../types';
import { analyzeProfitability, isAiAvailable } from '../services/geminiService';
import Card from './shared/Card';
import { SparklesIcon } from './Icons';
import { formatCurrency } from '../lib/utils';

interface ProfitabilityHotspotsProps {
    boq: FullBoqItem[];
}

const HotspotList: React.FC<{ title: string; items: ProfitabilityHotspot[]; color: string }> = ({ title, items, color }) => (
    <div>
        <h4 className={`font-bold mb-2 text-sm text-${color}-700`}>{title}</h4>
        <div className="space-y-2">
            {items.map(item => (
                <div key={item.itemId} className={`p-2 bg-${color}-50 border-l-4 border-${color}-400 rounded-r-lg`}>
                    <p className="font-bold text-xs text-slate-800">{item.itemName}</p>
                    <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Profit: <span className="font-semibold text-slate-700">{formatCurrency(item.totalProfit)}</span></span>
                        <span>Margin: <span className="font-semibold text-slate-700">{item.profitMargin.toFixed(1)}%</span></span>
                    </div>
                    <p className="text-[10px] text-slate-500 italic mt-1">"{item.rationale}"</p>
                </div>
            ))}
        </div>
    </div>
);

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
        <Card title="Profitability Hotspots">
            <p className="text-sm text-slate-600 mb-4">
                Identify which items are your "Profit Engines" and which are "Margin Drags" to get a clearer picture of your project's financial drivers.
            </p>
            <button
                onClick={handleAnalyze}
                disabled={loading || !isAiAvailable() || boq.length === 0}
                className="w-full mb-4 py-2 bg-slate-800 text-white font-bold rounded-lg text-sm disabled:opacity-50"
            >
                {loading ? 'Analyzing...' : 'Find Hotspots'}
            </button>
            {hotspots && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <HotspotList title="🚀 Profit Engines" items={hotspots.engines} color="emerald" />
                    <HotspotList title="⚓ Margin Drags" items={hotspots.drags} color="amber" />
                </div>
            )}
        </Card>
    );
};

export default ProfitabilityHotspots;
