
import React, { useState, useMemo, useEffect } from 'react';
import { FullBoqItem, ProjectContext } from '../types';
import { calculateSellPrice, formatCurrency, calculateGrossMargin } from '../lib/utils';
import Card from './shared/Card';
import { TrendingUpIcon, BrainIcon } from './Icons';

interface ScenarioSimulatorProps {
  boq: FullBoqItem[];
  projectContext?: ProjectContext;
}

const ScenarioSimulator: React.FC<ScenarioSimulatorProps> = ({ boq, projectContext }) => {
  const [activeLever, setActiveLever] = useState<'margin' | 'materials' | 'design'>('margin');
  const [sliderValue, setSliderValue] = useState<number>(0);

  // Initialize/Reset slider when lever changes
  useEffect(() => {
      if (activeLever === 'margin') setSliderValue(0); 
      else if (activeLever === 'materials') setSliderValue(0);
      else if (activeLever === 'design') {
          // Initialize with current percentage if applicable, else 0 deviation
          if (projectContext?.designFeeType === 'percentage') {
              setSliderValue(projectContext.designFee || 10);
          } else {
              setSliderValue(0);
          }
      }
  }, [activeLever, projectContext]);

  // Calculations
  const simulation = useMemo(() => {
    // 1. BASELINE (Current State)
    let baseExecSell = 0;
    let baseExecCost = 0;
    
    boq.forEach(item => {
        baseExecSell += calculateSellPrice(item.materials, item.labor, item.margin) * item.qty;
        baseExecCost += (item.materials + item.labor) * item.qty;
    });

    // Helper to get design fee based on execution value
    const getDesignFee = (execValue: number, isBaseline = false) => {
        // If calculating baseline, use context values strictly
        if (isBaseline || !projectContext) {
            if (!projectContext) return execValue * 0.1;
            const { designFee, designFeeType, area } = projectContext;
            if (designFeeType === 'fixed_lumpsum') return designFee || 0;
            if (designFeeType === 'fixed_sqft') return (designFee || 0) * (area || 0);
            return execValue * ((designFee || 10) / 100);
        }

        // If simulating and lever is 'design', apply slider overrides
        if (activeLever === 'design') {
            if (projectContext.designFeeType === 'percentage') {
                return execValue * (sliderValue / 100); // Slider is the new %
            } else {
                // Fixed fee: Slider is % deviation (e.g. +10%)
                const base = getDesignFee(execValue, true);
                return base * (1 + sliderValue / 100);
            }
        }
        
        // If simulating execution levers, fee might change if it's percentage based
        return getDesignFee(execValue, true);
    };

    const baseDesignFee = getDesignFee(baseExecSell, true);
    const baseTotalRev = baseExecSell + baseDesignFee;
    const baseTotalProfit = (baseExecSell - baseExecCost) + baseDesignFee;
    const baseBlendedGm = baseTotalRev > 0 ? (baseTotalProfit / baseTotalRev) * 100 : 0;

    // 2. SIMULATION
    let simExecSell = 0;
    let simExecCost = 0;

    boq.forEach(item => {
        let { materials, labor, margin } = item;
        
        // Apply Execution Levers
        if (activeLever === 'materials') {
            materials = materials * (1 + sliderValue / 100);
        } else if (activeLever === 'margin') {
            // Apply relative percentage change to margin
            // e.g. 15% margin + 10% change = 16.5% margin
            margin = margin * (1 + sliderValue / 100);
        }

        const itemCost = (materials + labor) * item.qty;
        const itemSell = calculateSellPrice(materials, labor, margin) * item.qty;
        
        simExecCost += itemCost;
        simExecSell += itemSell;
    });

    const simDesignFee = getDesignFee(simExecSell);
    const simTotalRev = simExecSell + simDesignFee;
    const simTotalProfit = (simExecSell - simExecCost) + simDesignFee;
    const simBlendedGm = simTotalRev > 0 ? (simTotalProfit / simTotalRev) * 100 : 0;

    return {
        base: { rev: baseTotalRev, profit: baseTotalProfit, gm: baseBlendedGm, fee: baseDesignFee },
        sim: { rev: simTotalRev, profit: simTotalProfit, gm: simBlendedGm, fee: simDesignFee }
    };

  }, [boq, activeLever, sliderValue, projectContext]);

  // Labels & Ranges
  const isPercentageFee = projectContext?.designFeeType === 'percentage';
  let min = -25, max = 25, step = 1, suffix = '%';
  let label = `Change ${activeLever} by`;

  if (activeLever === 'design') {
      if (isPercentageFee) {
          min = 5; max = 25; step = 0.5; suffix = '%';
          label = "Set Design Fee to";
      } else {
          label = "Adjust Fee Value by";
      }
  }

  return (
    <Card title="Financial Simulator" titleIcon={<TrendingUpIcon className="w-4 h-4" />}>
      <div className="space-y-6">
        <p className="text-sm text-slate-600">
          Model the impact of changing execution margins, material costs, or design fees on your total profitability.
        </p>

        {/* 1. Control Panel */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* Lever Selector */}
            <div className="flex bg-white p-1 rounded-lg border border-slate-200 mb-6 shadow-sm">
                <button 
                    onClick={() => setActiveLever('margin')}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${activeLever === 'margin' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Exec. Margin
                </button>
                <button 
                    onClick={() => setActiveLever('materials')}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${activeLever === 'materials' ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Material Cost
                </button>
                <button 
                    onClick={() => setActiveLever('design')}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${activeLever === 'design' ? 'bg-fuchsia-100 text-fuchsia-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Design Fee
                </button>
            </div>

            {/* Slider */}
            <div className="px-2">
                <div className="flex justify-between text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                    <span>{label}</span>
                    <span className="text-indigo-600 text-base">{sliderValue > 0 && activeLever !== 'design' ? '+' : ''}{sliderValue}{suffix}</span>
                </div>
                <input 
                    type="range" 
                    min={min} 
                    max={max} 
                    step={step}
                    value={sliderValue}
                    onChange={(e) => setSliderValue(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-medium">
                    <span>{min}{suffix}</span>
                    <span>{max}{suffix}</span>
                </div>
            </div>
        </div>

        {/* 2. Results Comparison */}
        <div className="grid grid-cols-2 gap-4">
            <ResultCard 
                title="Current State" 
                revenue={simulation.base.rev} 
                profit={simulation.base.profit} 
                gm={simulation.base.gm}
                fee={simulation.base.fee}
                variant="neutral"
            />
            <ResultCard 
                title="Simulated" 
                revenue={simulation.sim.rev} 
                profit={simulation.sim.profit} 
                gm={simulation.sim.gm} 
                fee={simulation.sim.fee}
                variant="active"
                deltaProfit={simulation.sim.profit - simulation.base.profit}
            />
        </div>
      </div>
    </Card>
  );
};

const ResultCard: React.FC<{ 
    title: string, revenue: number, profit: number, gm: number, fee: number, variant: 'neutral' | 'active', deltaProfit?: number 
}> = ({ title, revenue, profit, gm, fee, variant, deltaProfit }) => {
    const isNeutral = variant === 'neutral';
    
    return (
        <div className={`p-4 rounded-xl border ${isNeutral ? 'bg-slate-50 border-slate-200' : 'bg-white border-indigo-200 shadow-md ring-1 ring-indigo-100'}`}>
            <h4 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isNeutral ? 'text-slate-400' : 'text-indigo-600'}`}>{title}</h4>
            
            <div className="space-y-3">
                <div>
                    <p className="text-[10px] text-slate-500 font-medium">Total Profit</p>
                    <div className="flex items-end gap-2">
                        <p className={`text-xl font-black ${isNeutral ? 'text-slate-700' : deltaProfit && deltaProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {formatCurrency(profit)}
                        </p>
                    </div>
                    {deltaProfit !== undefined && deltaProfit !== 0 && (
                        <p className={`text-[10px] font-bold ${deltaProfit > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {deltaProfit > 0 ? '+' : ''}{formatCurrency(deltaProfit)}
                        </p>
                    )}
                </div>

                <div className="pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Revenue</span>
                        <span className="font-bold text-slate-700">{formatCurrency(revenue)}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Design Fee</span>
                        <span className="font-bold text-slate-700">{formatCurrency(fee)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Blended GM</span>
                        <span className={`font-bold ${gm < 20 ? 'text-red-500' : 'text-emerald-600'}`}>{gm.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ScenarioSimulator;
