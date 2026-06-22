
import React, { useMemo, useState, useEffect } from 'react';
import { BoqItem, Item, AggregatedCategory, AIStrategy, FullBoqItem, ProposalTier, ProjectContext } from '../types';
import { calculateSellPrice, formatCurrency, calculateGrossMargin } from '../lib/utils';
import { generateExecutiveSummary, isAiAvailable } from '../services/geminiService';
import Card from './shared/Card';
import AICoach from './AICoach';
import MarginOptimizer from './MarginOptimizer';
import ScenarioSimulator from './ScenarioSimulator';
import { SparklesIcon, TrophyIcon, DashboardIcon, WandIcon, TrendingUpIcon, ArrowRightIcon, ListIcon } from './Icons';
import ValueEngineering from './ValueEngineering';
import ProfitabilityHotspots from './ProfitabilityHotspots';

// --- MODERN VISUAL COMPONENTS ---

const DonutChart: React.FC<{ 
    segments: { color: string; value: number; label: string }[]; 
    total: number;
    centerLabel: string;
    centerSub: string;
}> = ({ segments, total, centerLabel, centerSub }) => {
    let cumulativePercent = 0;
    const gradientString = segments.map(seg => {
        const start = cumulativePercent;
        const percent = (seg.value / total) * 100;
        cumulativePercent += percent;
        return `${seg.color} ${start}% ${cumulativePercent}%`;
    }).join(', ');

    return (
        <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 shrink-0">
                <div 
                    className="w-full h-full rounded-full"
                    style={{ background: `conic-gradient(${gradientString})` }}
                ></div>
                <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center text-center z-10 shadow-inner">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{centerSub}</span>
                    <span className="text-sm font-black text-slate-800 leading-tight">{centerLabel}</span>
                </div>
            </div>
            <div className="space-y-2 flex-grow">
                {segments.map((seg, i) => (
                    <div key={i} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{background: seg.color}}></span>
                            <span className="text-slate-600 font-medium">{seg.label}</span>
                        </div>
                        <div className="text-right">
                            <span className="font-bold text-slate-800 block">{formatCurrency(seg.value)}</span>
                            <span className="text-[10px] text-slate-400">({((seg.value/total)*100).toFixed(0)}%)</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ProfitDriverRow: React.FC<{ 
    label: string, 
    sell: number, 
    profit: number, 
    percentOfTotalProfit: number,
    gm: number 
}> = ({ label, sell, profit, percentOfTotalProfit, gm }) => {
    return (
        <div className="group relative">
            <div className="flex justify-between items-end mb-1 text-xs">
                <span className="font-bold text-slate-700">{label}</span>
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[10px]">{formatCurrency(sell)} Vol</span>
                    <span className={`font-bold ${gm < 20 ? 'text-red-500' : 'text-emerald-600'}`}>{gm.toFixed(0)}% GM</span>
                </div>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex shadow-inner">
                <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 rounded-full group-hover:from-indigo-600 group-hover:to-blue-700 transition-colors relative" 
                    style={{ width: `${Math.max(percentOfTotalProfit, 2)}%` }} 
                ></div>
            </div>
            <div className="flex justify-between mt-1 text-[10px]">
                <span className="text-slate-400">Contribution</span>
                <span className="font-bold text-indigo-700">{formatCurrency(profit)} Profit</span>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

interface AnalyticsTabProps {
  boq: FullBoqItem[];
  setBoq: React.Dispatch<React.SetStateAction<BoqItem[]>>;
  bank: Item[];
  activeTab: string;
  aiStrategy: AIStrategy;
  tiers?: ProposalTier[];
  projectContext?: ProjectContext;
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ boq, setBoq, bank, activeTab, aiStrategy, tiers = [], projectContext }) => {
  const [viewMode, setViewMode] = useState<'overview' | 'details' | 'lab'>('overview');
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Helper to calculate Design Fee
  const calculateDesignFee = (totalExecutionSell: number) => {
      if (!projectContext) return 0;
      const { designFee, designFeeType, area } = projectContext;
      
      if (!designFee && !designFeeType) return totalExecutionSell * 0.10;
      if (designFeeType === 'fixed_lumpsum') return designFee || 0;
      if (designFeeType === 'fixed_sqft') return (designFee || 0) * (area || 0);
      return totalExecutionSell * ((designFee || 10) / 100);
  };

  // 1. Calculate Active Tier Detailed Stats
  const activeAggregates = useMemo(() => {
    const byCat: { [key: string]: AggregatedCategory & { profit: number } } = {};
    let totalCost = 0;
    let totalMaterials = 0;
    let totalLabor = 0;
    let totalSell = 0;

    boq.forEach(item => {
      const cat = item.cat || 'Uncategorized';
      if (!byCat[cat]) {
        byCat[cat] = { cost: 0, sell: 0, profit: 0, items: [] };
      }
      
      const itemCost = (item.materials + item.labor) * item.qty;
      const itemSell = calculateSellPrice(item.materials, item.labor, item.margin) * item.qty;
      const itemProfit = itemSell - itemCost;

      byCat[cat].cost += itemCost;
      byCat[cat].sell += itemSell;
      byCat[cat].profit += itemProfit;
      byCat[cat].items.push(item);
      
      totalCost += itemCost;
      totalMaterials += item.materials * item.qty;
      totalLabor += item.labor * item.qty;
      totalSell += itemSell;
    });
    
    const execGm = calculateGrossMargin(totalSell, totalCost);
    const execProfit = totalSell - totalCost;

    const designFee = calculateDesignFee(totalSell);
    const totalRevenue = totalSell + designFee;
    const totalProfit = execProfit + designFee; 
    const blendedGm = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return { byCat, totalCost, totalMaterials, totalLabor, totalSell, execGm, execProfit, designFee, totalRevenue, totalProfit, blendedGm };
  }, [boq, projectContext]);

  // 2. Calculate Line Item Detailed Data
  const lineItemData = useMemo(() => {
      return boq.map(item => {
          const unitCost = (item.materials + item.labor);
          const unitSell = calculateSellPrice(item.materials, item.labor, item.margin);
          const totalCost = unitCost * item.qty;
          const totalSell = unitSell * item.qty;
          const totalMat = item.materials * item.qty;
          const totalLab = item.labor * item.qty;
          const profit = totalSell - totalCost;
          const contribution = activeAggregates.execProfit > 0 
            ? (profit / activeAggregates.execProfit) * 100 
            : 0;

          return {
              ...item,
              unitCost,
              unitSell,
              totalCost,
              totalSell,
              totalMat,
              totalLab,
              profit,
              contribution
          };
      }).sort((a, b) => b.profit - a.profit); // Default sort by profit desc
  }, [boq, activeAggregates]);

  // 3. Calculate Comparison Data for All Tiers
  const comparisonData = useMemo(() => {
      if (!tiers || tiers.length === 0) return [];
      const bankMap = new Map<string, Item>(bank.map(i => [i.id, i]));
      if (projectContext?.adHocItems) {
          projectContext.adHocItems.forEach(i => bankMap.set(i.id, i));
      }
      
      return tiers.map(tier => {
          let tCost = 0;
          let tSell = 0;
          tier.boq.forEach(bi => {
              const bItem = bankMap.get(bi.bankId);
              if (bItem) {
                  const itemCost = (bItem.materials + bItem.labor) * bi.qty;
                  const m = bi.marginOverride ?? bItem.margin;
                  const itemSell = calculateSellPrice(bItem.materials, bItem.labor, m) * bi.qty;
                  tCost += itemCost;
                  tSell += itemSell;
              }
          });

          const designFee = calculateDesignFee(tSell);
          const totalRev = tSell + designFee;
          const execProfit = tSell - tCost;
          const totalProfit = execProfit + designFee;
          const blendedGm = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;

          return {
              id: tier.id,
              name: tier.name,
              executionSell: tSell,
              executionCost: tCost,
              executionGm: calculateGrossMargin(tSell, tCost),
              designFee,
              totalRevenue: totalRev,
              totalProfit: totalProfit,
              blendedGm
          };
      });
  }, [tiers, bank, projectContext]);

  // Sort by PROFIT CONTRIBUTION, not just volume
  const sortedByProfit = useMemo(() => {
      // Cast to any to avoid "unknown" property access error if inference fails
      return Object.entries(activeAggregates.byCat).sort(([, a], [, b]) => (b as any).profit - (a as any).profit);
  }, [activeAggregates.byCat]);

  const [summaryError, setSummaryError] = useState<string | null>(null);

  const handleGenerateSummary = async () => {
      if (!isAiAvailable() || boq.length === 0) return;
      setLoadingSummary(true);
      setSummaryError(null);
      try {
          const rawBoq: BoqItem[] = boq.map(({ id, bankId, qty, marginOverride, rationale, roomId }) => ({ id, bankId, qty, marginOverride, rationale, roomId }));
          const result = await generateExecutiveSummary(rawBoq, {
              totalSell: activeAggregates.totalSell,
              profit: activeAggregates.execProfit,
              grossMargin: activeAggregates.execGm,
              categoryBreakdown: activeAggregates.byCat,
          });
          setSummary(result);
      } catch (e: any) {
          console.error("Failed to generate summary:", e);
          setSummaryError(e.message || "Analysis failed");
      } finally {
          setLoadingSummary(false);
      }
  }

  useEffect(() => {
      if (activeTab === 'analytics' && boq.length > 0 && !summary) {
          handleGenerateSummary();
      }
  }, [activeTab, boq.length]);

  if (boq.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <h3 className="text-lg font-semibold text-slate-700">Analytics Dashboard</h3>
          <p className="text-slate-500 mt-2">Add items to your BOQ to see analytics and AI insights.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6" id="analytics">
        
        {/* VIEW TOGGLE */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                <button 
                    onClick={() => setViewMode('overview')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${viewMode === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <DashboardIcon className="w-4 h-4" /> Performance HQ
                </button>
                <button 
                    onClick={() => setViewMode('details')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${viewMode === 'details' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <ListIcon className="w-4 h-4" /> Item Breakdown
                </button>
                <button 
                    onClick={() => setViewMode('lab')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${viewMode === 'lab' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <WandIcon className="w-4 h-4" /> Simulation Lab
                </button>
            </div>
            
            {viewMode === 'overview' && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider px-2 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live Financials
                </div>
            )}
        </div>

        {/* --- MODE 1: PERFORMANCE HQ --- */}
        {viewMode === 'overview' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* 1. FINANCIAL PULSE (HERO SECTION) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* A. NET PROFIT HERO */}
                    <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between shadow-xl ring-1 ring-slate-800">
                        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                            <TrendingUpIcon className="w-32 h-32" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">Net Profit Projection</p>
                            <h3 className="text-4xl lg:text-5xl font-black tracking-tight">{formatCurrency(activeAggregates.totalProfit)}</h3>
                            <div className="mt-6 flex items-center gap-3">
                                <div className="bg-emerald-900/50 border border-emerald-500/30 px-3 py-1.5 rounded-lg backdrop-blur-md">
                                    <span className="text-emerald-300 font-bold text-sm">{activeAggregates.blendedGm.toFixed(1)}% blended margin</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-slate-700/50 flex justify-between items-center text-xs text-slate-400 font-medium">
                            <span>Exec Profit: <span className="text-white">{formatCurrency(activeAggregates.execProfit)}</span></span>
                            <span>Design Fee: <span className="text-white">{formatCurrency(activeAggregates.designFee)}</span></span>
                        </div>
                    </div>

                    {/* B. COST STRUCTURE DONUT */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Financial Flow</h4>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Revenue</p>
                                <p className="text-lg font-black text-slate-900">{formatCurrency(activeAggregates.totalRevenue)}</p>
                            </div>
                        </div>
                        <div className="flex-grow flex items-center justify-center">
                            <DonutChart 
                                total={activeAggregates.totalRevenue}
                                centerLabel={formatCurrency(activeAggregates.totalCost)}
                                centerSub="Cost"
                                segments={[
                                    { color: '#fbbf24', value: activeAggregates.totalMaterials, label: 'Materials' }, // Amber
                                    { color: '#64748b', value: activeAggregates.totalLabor, label: 'Labor' },       // Slate
                                    { color: '#10b981', value: activeAggregates.totalProfit, label: 'Net Profit' }  // Emerald
                                ]}
                            />
                        </div>
                    </div>

                    {/* C. AI BRIEF */}
                    <div className="bg-gradient-to-br from-indigo-50 to-white rounded-3xl p-6 border border-indigo-100 shadow-sm flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                                <SparklesIcon className="w-4 h-4" />
                            </div>
                            <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wide">Strategic Brief</h4>
                        </div>
                        <div className="flex-grow overflow-y-auto max-h-[140px] pr-2 custom-scrollbar">
                            {loadingSummary ? (
                                <div className="space-y-2 animate-pulse mt-2">
                                    <div className="h-2 bg-indigo-200 rounded w-3/4"></div>
                                    <div className="h-2 bg-indigo-200 rounded w-full"></div>
                                    <div className="h-2 bg-indigo-200 rounded w-5/6"></div>
                                </div>
                            ) : summaryError ? (
                                <div className="text-red-600 text-xs mt-2 border border-red-200 bg-red-50 p-2 rounded">
                                    <strong>Error:</strong> {summaryError}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-600 leading-relaxed font-medium mt-2">
                                    {summary ? summary : "No summary generated. Click below to analyze."}
                                </p>
                            )}
                        </div>
                        <button onClick={handleGenerateSummary} className="mt-4 text-[10px] uppercase tracking-wider font-bold text-indigo-600 hover:text-indigo-800 self-start flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                            Refresh Analysis <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* 2. PROFITABILITY DRIVERS (Leaderboard) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card title="Profit Drivers" className="h-full">
                        <p className="text-xs text-slate-500 mb-6">Categories ranked by contribution to Net Profit.</p>
                        <div className="space-y-5">
                            {sortedByProfit.slice(0, 5).map(([cat, data]) => {
                                const percent = (data.profit / activeAggregates.totalProfit) * 100;
                                const gm = calculateGrossMargin(data.sell, data.cost);
                                return (
                                    <ProfitDriverRow 
                                        key={cat}
                                        label={cat}
                                        sell={data.sell}
                                        profit={data.profit}
                                        gm={gm}
                                        percentOfTotalProfit={percent}
                                    />
                                )
                            })}
                        </div>
                    </Card>

                    {/* AI Coach Integration */}
                    <div className="h-full">
                        <AICoach boq={boq} aggregates={{ ...activeAggregates, totalGm: activeAggregates.execGm }} />
                    </div>
                </div>

                {/* 3. VISUAL OPTION COMPARISON */}
                {comparisonData.length > 0 && (
                    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="p-6 bg-slate-50 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <TrophyIcon className="w-5 h-5 text-amber-500" />
                                Commercial Comparison
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 text-left">
                                        <th className="p-4 pl-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Option</th>
                                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Revenue</th>
                                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell w-1/3 text-center">Profitability</th>
                                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Net Profit</th>
                                        <th className="p-4 pr-6 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Blended GM</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {comparisonData.map((row, idx) => {
                                        const isBest = row.totalProfit === Math.max(...comparisonData.map(c => c.totalProfit));
                                        const maxProfit = Math.max(...comparisonData.map(c => c.totalProfit));
                                        const barWidth = (row.totalProfit / maxProfit) * 100;

                                        return (
                                            <tr key={row.id} className="hover:bg-slate-50/80 transition-colors group">
                                                <td className="p-4 pl-6">
                                                    <div className="font-bold text-slate-800">{row.name}</div>
                                                    {isBest && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase tracking-wide">Highest Profit</span>}
                                                </td>
                                                <td className="p-4 text-right font-mono text-slate-600">
                                                    {formatCurrency(row.totalRevenue)}
                                                </td>
                                                <td className="p-4 hidden md:table-cell align-middle">
                                                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex items-center">
                                                        <div 
                                                            className={`h-full rounded-full transition-all duration-500 ${isBest ? 'bg-emerald-500' : 'bg-slate-400'}`} 
                                                            style={{ width: `${barWidth}%` }}
                                                        ></div>
                                                    </div>
                                                </td>
                                                <td className={`p-4 text-right font-mono font-bold ${isBest ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                    {formatCurrency(row.totalProfit)}
                                                </td>
                                                <td className="p-4 pr-6 text-right">
                                                    <span className={`font-bold ${row.blendedGm > 30 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                        {row.blendedGm.toFixed(1)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- MODE 2: DETAILS (ITEM BREAKDOWN) --- */}
        {viewMode === 'details' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card title="Line Item Profitability">
                    <p className="text-sm text-slate-500 mb-4">Detailed breakdown of unit financials and total profitability for every item in the active tier.</p>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
                        <table className="w-full text-xs text-left whitespace-nowrap table-fixed min-w-[1200px]">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                                <tr>
                                    <th className="p-3 pl-4 w-64 sticky left-0 bg-slate-50 z-10 shadow-sm">Item Details</th>
                                    <th className="p-3 w-32">Category</th>
                                    <th className="p-3 text-right w-20">Qty</th>
                                    
                                    {/* Unit Economics */}
                                    <th className="p-3 text-right w-28 bg-blue-50/20 text-slate-600">Unit Cost</th>
                                    <th className="p-3 text-right w-28 bg-indigo-50/20 text-indigo-700">Unit Sell</th>
                                    
                                    {/* Total Costs Broken Down */}
                                    <th className="p-3 text-right w-28 text-slate-400">Total Mat</th>
                                    <th className="p-3 text-right w-28 text-slate-400">Total Lab</th>
                                    <th className="p-3 text-right w-28 font-bold text-slate-700 bg-slate-100">Total Cost</th>
                                    
                                    {/* Financials */}
                                    <th className="p-3 text-right w-28 font-bold text-indigo-700 bg-indigo-50">Total Sell</th>
                                    <th className="p-3 text-right w-28 font-black text-emerald-600 bg-emerald-50">Net Profit</th>
                                    <th className="p-3 text-right w-20">GM %</th>
                                    <th className="p-3 pr-4 text-right w-20">% Contrib.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {lineItemData.map((item, i) => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="p-3 pl-4 font-medium text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                            <div className="truncate" title={item.name}>{item.name}</div>
                                            <div className="text-[9px] text-slate-400 font-normal truncate max-w-[200px]" title={item.specs}>{item.specs}</div>
                                        </td>
                                        <td className="p-3 text-slate-500 truncate">{item.cat}</td>
                                        <td className="p-3 text-right font-mono text-slate-600">{item.qty} <span className="text-[9px] text-slate-400">{item.unit}</span></td>
                                        
                                        {/* Units */}
                                        <td className="p-3 text-right font-mono text-slate-500 bg-blue-50/10">{formatCurrency(item.unitCost)}</td>
                                        <td className="p-3 text-right font-mono text-indigo-700 font-medium bg-indigo-50/10">{formatCurrency(item.unitSell)}</td>
                                        
                                        {/* Total Components */}
                                        <td className="p-3 text-right font-mono text-slate-400 text-[10px]">{formatCurrency(item.totalMat)}</td>
                                        <td className="p-3 text-right font-mono text-slate-400 text-[10px]">{formatCurrency(item.totalLab)}</td>
                                        <td className="p-3 text-right font-mono font-bold text-slate-600 bg-slate-50">{formatCurrency(item.totalCost)}</td>
                                        
                                        {/* Totals */}
                                        <td className="p-3 text-right font-mono font-bold text-indigo-700 bg-indigo-50/30">{formatCurrency(item.totalSell)}</td>
                                        <td className="p-3 text-right font-mono font-black text-emerald-600 bg-emerald-50/30">{formatCurrency(item.profit)}</td>
                                        
                                        <td className="p-3 text-right">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.margin < 15 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {item.margin.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="p-3 pr-4 text-right font-mono text-slate-500 text-[10px]">
                                            {item.contribution.toFixed(1)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        )}

        {/* --- MODE 3: SIMULATION LAB --- */}
        {viewMode === 'lab' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-6">
                    <ScenarioSimulator boq={boq} projectContext={projectContext} />
                    <MarginOptimizer boq={boq} setBoq={setBoq} aiStrategy={aiStrategy} />
                </div>
                <div className="space-y-6">
                    <ProfitabilityHotspots boq={boq} />
                    <ValueEngineering boq={boq} setBoq={setBoq} />
                </div>
            </div>
        )}

    </div>
  );
};

export default AnalyticsTab;
