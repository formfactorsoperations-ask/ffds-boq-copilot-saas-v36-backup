
import React, { useMemo, useState, useEffect } from 'react';
import { BoqItem, Item, AggregatedCategory, AIStrategy, FullBoqItem, ProposalTier, ProjectContext } from '../types';
import { calculateSellPrice, formatCurrency, calculateGrossMargin } from '../lib/utils';
import { generateExecutiveSummary, isAiAvailable } from '../services/geminiService';
import Card from './shared/Card';
import AICoach from './AICoach';
import MarginOptimizer from './MarginOptimizer';
import ScenarioSimulator from './ScenarioSimulator';
import { SparklesIcon, TrophyIcon, DashboardIcon, WandIcon, TrendingUpIcon, ArrowRightIcon, ListIcon } from './Icons';
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
                    <span className="text-sm font-black text-indigo-900 leading-tight">{centerLabel}</span>
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
                            <span className="font-bold text-indigo-900 block">{formatCurrency(seg.value)}</span>
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

import { INITIAL_BANK } from '../constants';

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
              const bItem = bankMap.get(bi.bankId) || INITIAL_BANK.find(i => i.id === bi.bankId);
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
        <div className="flex justify-center mb-10 w-full px-4">
            <div className="inline-flex flex-wrap md:flex-nowrap items-center gap-1 bg-slate-100/50 backdrop-blur-xl p-1.5 rounded-[2rem] border border-slate-200/60 shadow-sm relative w-full md:w-auto overflow-hidden">
                <div className="absolute inset-y-1.5 rounded-[1.5rem] bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] z-0 transition-all duration-300 ease-out" style={{
                        width: '33.33%',
                        left: viewMode === 'overview' ? '0%' : viewMode === 'details' ? '33.33%' : '66.66%'
                }}></div>
                
                <button 
                    onClick={() => setViewMode('overview')}
                    className={`relative z-10 w-full md:w-[160px] py-3 text-[11px] font-bold uppercase tracking-[0.2em] rounded-[1.5rem] transition-all duration-300 flex items-center justify-center gap-2 ${viewMode === 'overview' ? 'text-indigo-950' : 'text-slate-400 hover:text-slate-600'}`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                    <DashboardIcon className="w-3.5 h-3.5" /> Performance HQ
                </button>
                <button 
                    onClick={() => setViewMode('details')}
                    className={`relative z-10 w-full md:w-[160px] py-3 text-[11px] font-bold uppercase tracking-[0.2em] rounded-[1.5rem] transition-all duration-300 flex items-center justify-center gap-2 ${viewMode === 'details' ? 'text-indigo-950' : 'text-slate-400 hover:text-slate-600'}`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                    <ListIcon className="w-3.5 h-3.5" /> Breakdown
                </button>
                <button 
                    onClick={() => setViewMode('lab')}
                    className={`relative z-10 w-full md:w-[160px] py-3 text-[11px] font-bold uppercase tracking-[0.2em] rounded-[1.5rem] transition-all duration-300 flex items-center justify-center gap-2 ${viewMode === 'lab' ? 'text-indigo-950' : 'text-slate-400 hover:text-slate-600'}`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                    <WandIcon className="w-3.5 h-3.5" /> Sim Lab
                </button>
            </div>
        </div>

        {/* --- MODE 1: PERFORMANCE HQ --- */}
        {viewMode === 'overview' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* 1. FINANCIAL PULSE (HERO SECTION) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* A. NET PROFIT HERO */}
                    <div className="bg-indigo-950 text-white rounded-[2rem] p-8 relative overflow-hidden flex flex-col justify-between shadow-xl">
                        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                            <TrendingUpIcon className="w-40 h-40" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Net Profit Projection</p>
                            <h3 className="text-5xl lg:text-6xl font-light tracking-tighter">{formatCurrency(activeAggregates.totalProfit)}</h3>
                            <div className="mt-8 flex items-center gap-3">
                                <span className="text-emerald-400 font-bold text-sm bg-emerald-400/10 px-3 py-1.5 rounded-full">{activeAggregates.blendedGm.toFixed(1)}% Blended Margin</span>
                            </div>
                        </div>
                        <div className="mt-8 pt-6 border-t border-indigo-900 flex justify-between items-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                            <span>Exec Profit: <span className="text-white">{formatCurrency(activeAggregates.execProfit)}</span></span>
                            <span>Design Fee: <span className="text-white">{formatCurrency(activeAggregates.designFee)}</span></span>
                        </div>
                    </div>

                    {/* B. OPTION COMPARISON (Replacing Cost Structure Donut for ops focus) */}
                    <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Commercial Comparison</p>
                        </div>
                        <div className="flex-grow flex flex-col justify-center space-y-4">
                             {comparisonData.slice(0, 3).map((row, idx) => {
                                 const isBest = row.totalProfit === Math.max(...comparisonData.map(c => c.totalProfit));
                                 const maxProfit = Math.max(...comparisonData.map(c => c.totalProfit));
                                 const barWidth = row.totalProfit > 0 ? (row.totalProfit / maxProfit) * 100 : 0;
                                 return (
                                     <div key={row.id}>
                                         <div className="flex justify-between text-xs mb-1">
                                             <span className="font-bold text-slate-700 truncate mr-2">{row.name}</span>
                                             <span className={`font-mono ${isBest ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}>{formatCurrency(row.totalProfit)}</span>
                                         </div>
                                         <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                             <div className={`h-full rounded-full ${isBest ? 'bg-emerald-500' : 'bg-slate-300'}`} style={{ width: `${barWidth}%` }}></div>
                                         </div>
                                     </div>
                                 )
                             })}
                             {comparisonData.length === 0 && (
                                 <p className="text-xs text-slate-400 italic">Configure options in the BOQ tab.</p>
                             )}
                        </div>
                    </div>

                    {/* C. AI BRIEF */}
                    <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm flex flex-col">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-slate-100 text-slate-600 rounded-full">
                                <SparklesIcon className="w-4 h-4" />
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Strategic AI Brief</p>
                        </div>
                        <div className="flex-grow overflow-y-auto max-h-[140px] pr-2 custom-scrollbar">
                            {loadingSummary ? (
                                <div className="space-y-3 animate-pulse mt-2">
                                    <div className="h-2 bg-slate-200 rounded w-3/4"></div>
                                    <div className="h-2 bg-slate-200 rounded w-full"></div>
                                    <div className="h-2 bg-slate-200 rounded w-5/6"></div>
                                </div>
                            ) : summaryError ? (
                                <div className="text-rose-600 text-xs mt-2 border border-rose-200 bg-rose-50 p-2 rounded">
                                    <strong>Error:</strong> {summaryError}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-700 leading-relaxed mt-2">
                                    {summary ? summary : "No summary generated. Click below to analyze."}
                                </p>
                            )}
                        </div>
                        <button onClick={handleGenerateSummary} className="mt-6 text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-indigo-950 transition-colors flex items-center justify-between w-full pt-4 border-t border-slate-100">
                            Refresh Analysis <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* 2. PROFITABILITY DRIVERS (Leaderboard) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                        <div className="mb-8">
                            <h3 className="text-xl font-light tracking-tight text-indigo-950">Profit Drivers</h3>
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">Categories ranked by net contribution</p>
                        </div>
                        <div className="space-y-5">
                            {sortedByProfit.slice(0, 5).map(([cat, data]) => {
                                const percent = activeAggregates.totalProfit > 0 ? (data.profit / activeAggregates.totalProfit) * 100 : 0;
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
                    </div>

                    {/* AI Coach Integration */}
                    <div className="h-full">
                        <AICoach boq={boq} aggregates={{ ...activeAggregates, totalGm: activeAggregates.execGm }} />
                    </div>
                </div>
            </div>
        )}

        {/* --- MODE 2: DETAILS (ITEM BREAKDOWN) --- */}
        {viewMode === 'details' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
                    <div className="mb-8">
                        <h3 className="text-xl font-light tracking-tight text-indigo-950">Line Item Profitability</h3>
                        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">Detailed breakdown of unit financials for every item</p>
                    </div>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
                        <table className="w-full text-xs text-left whitespace-nowrap table-fixed min-w-[1200px]">
                            <thead className="bg-[#f0f2f5] text-slate-500 font-bold uppercase border-b border-slate-200">
                                <tr>
                                    <th className="p-3 pl-4 w-64 sticky left-0 bg-[#f0f2f5] z-10 shadow-sm">Item Details</th>
                                    <th className="p-3 w-32">Category</th>
                                    <th className="p-3 text-right w-20">Qty</th>
                                    
                                    {/* Unit Economics */}
                                    <th className="p-3 text-right w-28 text-slate-600 border-l border-slate-200/50">Unit Cost</th>
                                    <th className="p-3 text-right w-28 text-slate-700">Unit Sell</th>
                                    
                                    {/* Total Costs Broken Down */}
                                    <th className="p-3 text-right w-28 text-slate-400 border-l border-slate-200/50">Total Mat</th>
                                    <th className="p-3 text-right w-28 text-slate-400">Total Lab</th>
                                    <th className="p-3 text-right w-28 font-bold text-slate-700 bg-slate-200">Total Cost</th>
                                    
                                    {/* Financials */}
                                    <th className="p-3 text-right w-28 font-bold text-slate-700 border-l border-slate-200/50">Total Sell</th>
                                    <th className="p-3 text-right w-28 font-black text-emerald-700">Net Profit</th>
                                    <th className="p-3 text-right w-20">GM %</th>
                                    <th className="p-3 pr-4 text-right w-20">% Contrib.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {lineItemData.map((item, i) => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="p-3 pl-4 font-medium text-indigo-900 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                            <div className="truncate" title={item.name}>{item.name}</div>
                                            <div className="text-[9px] text-slate-400 font-normal truncate max-w-[200px]" title={item.specs}>{item.specs}</div>
                                        </td>
                                        <td className="p-3 text-slate-500 truncate font-mono text-[10px]">{item.cat}</td>
                                        <td className="p-3 text-right font-mono text-slate-600">{item.qty} <span className="text-[9px] text-slate-400">{item.unit}</span></td>
                                        
                                        {/* Units */}
                                        <td className="p-3 text-right font-mono text-slate-500">{formatCurrency(item.unitCost)}</td>
                                        <td className="p-3 text-right font-mono text-slate-700 font-medium">{formatCurrency(item.unitSell)}</td>
                                        
                                        {/* Total Components */}
                                        <td className="p-3 text-right font-mono text-slate-400 text-[10px]">{formatCurrency(item.totalMat)}</td>
                                        <td className="p-3 text-right font-mono text-slate-400 text-[10px]">{formatCurrency(item.totalLab)}</td>
                                        <td className="p-3 text-right font-mono font-bold text-slate-600 bg-slate-50">{formatCurrency(item.totalCost)}</td>
                                        
                                        {/* Totals */}
                                        <td className="p-3 text-right font-mono font-bold text-slate-700">{formatCurrency(item.totalSell)}</td>
                                        <td className="p-3 text-right font-mono font-black text-emerald-600 bg-emerald-50/50">{formatCurrency(item.profit)}</td>
                                        
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
                </div>
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
                    
                </div>
            </div>
        )}

    </div>
  );
};

export default AnalyticsTab;
