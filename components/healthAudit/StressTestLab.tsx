import React, { useState } from 'react';
import { formatCurrency, formatINR } from '../../lib/utils';
import { Activity, TrendingDown, DollarSign, AlertCircle, Percent, RefreshCw, Sparkles, Scale } from 'lucide-react';

interface StressTestLabProps {
  totalSell: number;
  totalCost: number;
  materialCost: number;
  laborCost: number;
  designFee: number;
}

export const StressTestLab: React.FC<StressTestLabProps> = ({
  totalSell,
  totalCost,
  materialCost,
  laborCost,
  designFee
}) => {
  // Scenario 1: Material Cost Inflation (%)
  const [materialInflationPct, setMaterialInflationPct] = useState<number>(10);

  // Scenario 2: Labor Cost Overrun (%)
  const [laborOverrunPct, setLaborOverrunPct] = useState<number>(15);

  // Scenario 3: Client Discount Simulation (%)
  const [clientDiscountPct, setClientDiscountPct] = useState<number>(5);

  // Baseline Financials
  const baselineProfit = (totalSell - totalCost) + designFee;
  const baselineRevenue = totalSell + designFee;
  const baselineBlendedMargin = baselineRevenue > 0 ? (baselineProfit / baselineRevenue) * 100 : 0;

  // Stressed Financials
  const stressedMaterialCost = materialCost * (1 + materialInflationPct / 100);
  const stressedLaborCost = laborCost * (1 + laborOverrunPct / 100);
  const stressedTotalCost = stressedMaterialCost + stressedLaborCost;

  const stressedSell = totalSell * (1 - clientDiscountPct / 100);
  const stressedRevenue = stressedSell + designFee;
  const stressedProfit = (stressedSell - stressedTotalCost) + designFee;
  const stressedBlendedMargin = stressedRevenue > 0 ? (stressedProfit / stressedRevenue) * 100 : 0;
  const profitErosion = baselineProfit - stressedProfit;

  // Safe Discount Ceiling Calculation (Threshold: Minimum 20% Blended Margin)
  // Target: (Sell*(1-d) - TotalCost + DesignFee) / (Sell*(1-d) + DesignFee) = 0.20
  // Solving for max allowed discount ₹:
  const minMarginTarget = 0.20;
  const minRequiredProfit = stressedTotalCost / (1 - minMarginTarget) * minMarginTarget;
  const minAllowedRevenue = stressedTotalCost + minRequiredProfit;
  const maxDiscountValue = Math.max(0, baselineRevenue - minAllowedRevenue);
  const maxDiscountPercent = baselineRevenue > 0 ? (maxDiscountValue / baselineRevenue) * 100 : 0;

  const handleReset = () => {
    setMaterialInflationPct(0);
    setLaborOverrunPct(0);
    setClientDiscountPct(0);
  };

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Forensic Stress-Test & Simulation Lab</h3>
            <p className="text-xs text-slate-500 mt-0.5">Simulate material inflation shocks, labor delays, and client discount limits</p>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-xl transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reset Variables
        </button>
      </div>

      {/* Hero Stress Impact Result */}
      <div className="relative overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 rounded-2xl bg-slate-900 text-white border border-slate-800 hud-frame hud-frame-dark">
        <span className="hud-scan" />
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-800 pb-6 lg:pb-0 lg:pr-6 flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#B5945B]">Stressed Net Profit</span>
            <p className="text-3xl lg:text-4xl font-extralight tracking-tighter mt-1 font-mono">
              {formatINR(stressedProfit)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${stressedBlendedMargin >= 22 ? 'bg-emerald-500/20 text-emerald-300' : stressedBlendedMargin >= 15 ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {stressedBlendedMargin.toFixed(1)}% Blended Margin
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
            Baseline: <strong className="text-white font-mono">{formatINR(baselineProfit)}</strong> ({baselineBlendedMargin.toFixed(1)}%)
          </div>
        </div>

        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-800 pb-6 lg:pb-0 lg:pr-6 flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-rose-400">Profit Erosion Exposure</span>
            <p className="text-3xl lg:text-4xl font-extralight tracking-tighter mt-1 font-mono text-rose-400">
              -{formatINR(profitErosion)}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Combined shock from raw material escalation, site delays and negotiation discounts.
            </p>
          </div>
        </div>

        {/* Safe Discount Ceiling */}
        <div className="lg:col-span-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400">Client Discount Safe Ceiling</span>
            <p className="text-3xl lg:text-4xl font-extralight tracking-tighter mt-1 font-mono text-emerald-400">
              {maxDiscountPercent.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Max allowable discount: <strong className="text-white font-mono">{formatINR(maxDiscountValue)}</strong> before breaching the 20% margin redline.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Simulation Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Slider 1: Material Cost Inflation */}
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Material Inflation Spike
            </label>
            <span className="font-mono font-bold text-sm text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
              +{materialInflationPct}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={materialInflationPct}
            onChange={e => setMaterialInflationPct(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />

          <div className="flex justify-between text-[11px] text-slate-500 font-mono pt-1">
            <span>Baseline: {formatINR(materialCost)}</span>
            <span className="text-rose-600 font-bold">+{formatINR(stressedMaterialCost - materialCost)}</span>
          </div>
          <p className="text-[11px] text-slate-500">Simulates plywood, hardware, and veneer market rate surges.</p>
        </div>

        {/* Slider 2: Labor Overrun */}
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Site Labor Delay & Overrun
            </label>
            <span className="font-mono font-bold text-sm text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
              +{laborOverrunPct}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="40"
            step="1"
            value={laborOverrunPct}
            onChange={e => setLaborOverrunPct(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
          />

          <div className="flex justify-between text-[11px] text-slate-500 font-mono pt-1">
            <span>Baseline: {formatINR(laborCost)}</span>
            <span className="text-rose-600 font-bold">+{formatINR(stressedLaborCost - laborCost)}</span>
          </div>
          <p className="text-[11px] text-slate-500">Simulates subcontractor delays, site rework, and extended daily wages.</p>
        </div>

        {/* Slider 3: Client Discount */}
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Negotiated Client Discount
            </label>
            <span className="font-mono font-bold text-sm text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
              {clientDiscountPct}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="25"
            step="0.5"
            value={clientDiscountPct}
            onChange={e => setClientDiscountPct(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
          />

          <div className="flex justify-between text-[11px] text-slate-500 font-mono pt-1">
            <span>Discount ₹: {formatINR(totalSell * (clientDiscountPct / 100))}</span>
            <span className={clientDiscountPct > maxDiscountPercent ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
              {clientDiscountPct > maxDiscountPercent ? 'Exceeds Safe Limit!' : 'Safe Zone'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500">Simulates closing concession discounts before contract signoff.</p>
        </div>
      </div>
    </div>
  );
};
