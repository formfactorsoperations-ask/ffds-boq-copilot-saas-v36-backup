
import React, { useState, useMemo, useEffect } from 'react';
import { FullBoqItem, ProjectContext } from '../types';
import { calculateSellPrice, formatCurrency } from '../lib/utils';
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
    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-white border border-slate-200 text-indigo-600 rounded-full shadow-sm">
          <BrainIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-light tracking-tight text-indigo-950 leading-none">Scenario Simulator</h3>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">Impact modeling</p>
        </div>
      </div>
      
      <div className="space-y-8">
        <p className="text-sm text-slate-600">
          Model the impact of changing execution margins, material costs, or design fees on your total profitability.
        </p>

        {/* 1. Control Panel */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            {/* Lever Selector */}
            <div className="flex bg-slate-100 p-1 rounded-xl mb-8">
                <button 
                    onClick={() => setActiveLever('margin')}
                    className={`flex-1 py-2.5 text-[10px] uppercase tracking-[0.2em] font-bold rounded-lg transition-all ${activeLever === 'margin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Exec. Margin
                </button>
                <button 
                    onClick={() => setActiveLever('materials')}
                    className={`flex-1 py-2.5 text-[10px] uppercase tracking-[0.2em] font-bold rounded-lg transition-all ${activeLever === 'materials' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Material Cost
                </button>
                <button 
                    onClick={() => setActiveLever('design')}
                    className={`flex-1 py-2.5 text-[10px] uppercase tracking-[0.2em] font-bold rounded-lg transition-all ${activeLever === 'design' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Design Fee
                </button>
            </div>

            {/* Slider */}
            <div className="px-2">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-[0.2em]">
                    <span>{label}</span>
                    <span className="text-indigo-950 text-lg font-mono tracking-tighter">{sliderValue > 0 && activeLever !== 'design' ? '+' : ''}{sliderValue}{suffix}</span>
                </div>
                <input 
                    type="range" 
                    min={min} 
                    max={max} 
                    step={step}
                    value={sliderValue}
                    onChange={(e) => setSliderValue(Number(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-3 font-mono font-bold">
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
    </div>
  );
};

const ResultCard: React.FC<{ 
    title: string, revenue: number, profit: number, gm: number, fee: number, variant: 'neutral' | 'active', deltaProfit?: number 
}> = ({ title, revenue, profit, gm, fee, variant, deltaProfit }) => {
    const isNeutral = variant === 'neutral';
    
    return (
        <div className={`p-6 rounded-2xl border ${isNeutral ? 'bg-[#f0f2f5] border-slate-200' : 'bg-indigo-950 border-indigo-900 shadow-xl'}`}>
            <h4 className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-6 ${isNeutral ? 'text-slate-400' : 'text-slate-400'}`}>{title}</h4>
            
            <div className="space-y-6">
                <div>
                    <p className={`text-[9px] uppercase tracking-widest font-bold mb-1 ${isNeutral ? 'text-slate-500' : 'text-slate-500'}`}>Total Profit</p>
                    <div className="flex items-end gap-2">
                        <p className={`text-3xl font-light tracking-tighter ${isNeutral ? 'text-indigo-950' : deltaProfit && deltaProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(profit)}
                        </p>
                    </div>
                    {deltaProfit !== undefined && deltaProfit !== 0 && (
                        <p className={`text-[10px] font-bold mt-1 tracking-widest uppercase ${deltaProfit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {deltaProfit > 0 ? 'PROFIT GAIN: +' : 'PROFIT LOSS: '}{formatCurrency(deltaProfit)}
                        </p>
                    )}
                </div>

                <div className={`pt-4 border-t ${isNeutral ? 'border-slate-300' : 'border-indigo-900'}`}>
                    <div className="flex justify-between text-xs mb-2">
                        <span className={isNeutral ? 'text-slate-500' : 'text-slate-400'}>Revenue</span>
                        <span className={`font-mono ${isNeutral ? 'font-bold text-slate-700' : 'font-light text-slate-200'}`}>{formatCurrency(revenue)}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-2">
                        <span className={isNeutral ? 'text-slate-500' : 'text-slate-400'}>Design Fee</span>
                        <span className={`font-mono ${isNeutral ? 'font-bold text-slate-700' : 'font-light text-slate-200'}`}>{formatCurrency(fee)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className={isNeutral ? 'text-slate-500' : 'text-slate-400'}>Blended GM</span>
                        <span className={`font-mono font-bold ${gm < 20 ? 'text-rose-500' : 'text-emerald-500'}`}>{gm.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ScenarioSimulator;
