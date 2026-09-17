import React, { useState, useMemo } from 'react';
import { FullBoqItem, BoqItem } from '../../types';
import { calculateSellPrice, calculateGrossMargin, formatCurrency, formatINR } from '../../lib/utils';
import { BRAND, CAUTION, GOOD, CRITICAL } from '../../lib/reportPalette';
import { Filter, ArrowUpDown, TrendingUp, AlertTriangle, CheckCircle, Search, SlidersHorizontal, Layers } from 'lucide-react';

interface ForensicMarginMatrixProps {
  boq: FullBoqItem[];
  setBoq: React.Dispatch<React.SetStateAction<BoqItem[]>>;
  isOwner?: boolean;
  /** Frozen BOQ = contracted scope. Repricing must go through a variation. */
  boqFrozen?: boolean;
}

export const ForensicMarginMatrix: React.FC<ForensicMarginMatrixProps> = ({ boq, setBoq, isOwner = false, boqFrozen = false }) => {
  const locked = boqFrozen || !isOwner;
  const lockReason = boqFrozen
    ? 'The BOQ is frozen. Raise a variation to change contracted prices.'
    : 'Your role cannot change pricing.';
  const [filterMode, setFilterMode] = useState<'all' | 'drags' | 'engines' | 'anomalies' | 'labor_heavy'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'profit' | 'margin' | 'sell' | 'cost'>('profit');
  const [sortAsc, setSortAsc] = useState(false);

  // 1. Compute Category Aggregations
  const categoryStats = useMemo(() => {
    const map: Record<string, {
      category: string;
      itemCount: number;
      totalCost: number;
      totalSell: number;
      netProfit: number;
      grossMargin: number;
      materialCost: number;
      laborCost: number;
    }> = {};

    let grandCost = 0;
    let grandSell = 0;

    boq.forEach(item => {
      const cat = item.cat || 'Uncategorized';
      const qty = Number(item.qty) || 0;
      const mat = (Number(item.materials) || 0) * qty;
      const lab = (Number(item.labor) || 0) * qty;
      const cost = mat + lab;
      const sell = calculateSellPrice(item.materials, item.labor, item.margin) * qty;
      const profit = sell - cost;

      if (!map[cat]) {
        map[cat] = {
          category: cat,
          itemCount: 0,
          totalCost: 0,
          totalSell: 0,
          netProfit: 0,
          grossMargin: 0,
          materialCost: 0,
          laborCost: 0
        };
      }

      map[cat].itemCount += 1;
      map[cat].totalCost += cost;
      map[cat].totalSell += sell;
      map[cat].netProfit += profit;
      map[cat].materialCost += mat;
      map[cat].laborCost += lab;

      grandCost += cost;
      grandSell += sell;
    });

    Object.values(map).forEach(cat => {
      cat.grossMargin = calculateGrossMargin(cat.totalSell, cat.totalCost);
    });

    return {
      list: Object.values(map).sort((a, b) => b.netProfit - a.netProfit),
      grandCost,
      grandSell,
      grandProfit: grandSell - grandCost,
      grandGm: calculateGrossMargin(grandSell, grandCost)
    };
  }, [boq]);

  // 2. Compute Item-Level Diagnostic Records
  const processedItems = useMemo(() => {
    return boq.map(item => {
      const qty = Number(item.qty) || 0;
      const matUnit = Number(item.materials) || 0;
      const labUnit = Number(item.labor) || 0;
      const unitCost = matUnit + labUnit;
      const margin = Number(item.margin) || 0;
      const unitSell = calculateSellPrice(matUnit, labUnit, margin);
      const totalCost = unitCost * qty;
      const totalSell = unitSell * qty;
      const netProfit = totalSell - totalCost;
      const matTotal = matUnit * qty;
      const labTotal = labUnit * qty;

      const isDrag = margin < 18;
      const isAnomaly = unitCost === 0 || unitSell === 0 || qty === 0;
      const isLaborHeavy = totalCost > 0 && (labTotal / totalCost) > 0.45;
      const isProfitEngine = netProfit > (categoryStats.grandProfit * 0.08) && margin >= 25;

      return {
        ...item,
        qty,
        matUnit,
        labUnit,
        unitCost,
        unitSell,
        totalCost,
        totalSell,
        netProfit,
        matTotal,
        labTotal,
        margin,
        isDrag,
        isAnomaly,
        isLaborHeavy,
        isProfitEngine
      };
    });
  }, [boq, categoryStats.grandProfit]);

  // 3. Filter and Sort Items
  const filteredItems = useMemo(() => {
    return processedItems.filter(item => {
      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = item.name?.toLowerCase().includes(term);
        const matchCat = item.cat?.toLowerCase().includes(term);
        const matchSpecs = item.specs?.toLowerCase().includes(term);
        if (!matchName && !matchCat && !matchSpecs) return false;
      }

      // Mode
      if (filterMode === 'drags') return item.isDrag;
      if (filterMode === 'engines') return item.isProfitEngine;
      if (filterMode === 'anomalies') return item.isAnomaly;
      if (filterMode === 'labor_heavy') return item.isLaborHeavy;
      return true;
    }).sort((a, b) => {
      let valA = a.netProfit;
      let valB = b.netProfit;
      if (sortField === 'margin') { valA = a.margin; valB = b.margin; }
      if (sortField === 'sell') { valA = a.totalSell; valB = b.totalSell; }
      if (sortField === 'cost') { valA = a.totalCost; valB = b.totalCost; }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [processedItems, filterMode, searchTerm, sortField, sortAsc]);

  // Quick Margin Quick-Tuner
  const handleQuickMarginAdjust = (itemId: string, newMargin: number) => {
    if (locked) return;
    setBoq(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, marginOverride: Math.max(0, Math.min(100, newMargin)) };
      }
      return item;
    }));
  };

  return (
    <div className="space-y-8">
      {/* 1. CATEGORY FORENSIC HEATMAP */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Trade & Category Margin Ledger</h3>
            <p className="text-xs text-slate-500 mt-0.5">Category-by-category gross profit yield and material vs labor balance</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-slate-500">Total Volume: <strong className="text-slate-800">{formatINR(categoryStats.grandSell)}</strong></span>
            <span className="text-slate-500">Gross Margin: <strong className="text-emerald-700">{categoryStats.grandGm.toFixed(1)}%</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryStats.list.map(cat => {
            const profitShare = categoryStats.grandProfit > 0 ? (cat.netProfit / categoryStats.grandProfit) * 100 : 0;
            const isHighYield = cat.grossMargin >= 22;
            const isLowYield = cat.grossMargin < 17;

            return (
              <div
                key={cat.category}
                className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-bold text-sm text-slate-900 truncate" title={cat.category}>
                      {cat.category}
                    </span>
                    <span
                      className="text-xs font-bold font-mono px-2 py-0.5 rounded-full"
                      style={{
                        color: '#fff',
                        background: isHighYield ? GOOD : isLowYield ? CRITICAL : CAUTION,
                      }}
                    >
                      {cat.grossMargin.toFixed(1)}% GM
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 my-2 border-y border-slate-200/60">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Sell Volume</span>
                      <p className="font-mono font-bold text-slate-700">{formatINR(cat.totalSell)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Net Profit</span>
                      <p className="font-mono font-bold text-emerald-600">{formatINR(cat.netProfit)}</p>
                    </div>
                  </div>

                  {/* Material vs Labor balance */}
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Mat: {formatINR(cat.materialCost)}</span>
                      <span>Lab: {formatINR(cat.laborCost)}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                      <div
                        className="h-full hud-charge"
                        style={{ background: BRAND, width: `${cat.totalCost > 0 ? (cat.materialCost / cat.totalCost) * 100 : 70}%` }}
                        title="Materials"
                      />
                      <div
                        className="h-full hud-charge"
                        style={{ background: CAUTION, animationDelay: '.1s', width: `${cat.totalCost > 0 ? (cat.laborCost / cat.totalCost) * 100 : 30}%` }}
                        title="Labor"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{cat.itemCount} items</span>
                  <span>{profitShare.toFixed(0)}% of total profit</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. DEEP LINE-ITEM AUDIT TABLE */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Line Item Forensic Audit</h3>
            <p className="text-xs text-slate-500 mt-0.5">Filter, inspect, and quick-tune margins on individual BOQ specifications</p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${filterMode === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              All ({processedItems.length})
            </button>
            <button
              onClick={() => setFilterMode('drags')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${filterMode === 'drags' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-600 hover:text-rose-800'}`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Margin Drags ({processedItems.filter(i => i.isDrag).length})
            </button>
            <button
              onClick={() => setFilterMode('engines')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${filterMode === 'engines' ? 'bg-[#3D52A0] text-white shadow-xs' : 'text-emerald-700 hover:text-emerald-900'}`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Profit Engines ({processedItems.filter(i => i.isProfitEngine).length})
            </button>
            <button
              onClick={() => setFilterMode('anomalies')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${filterMode === 'anomalies' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-700 hover:text-amber-900'}`}
            >
              ₹0 Anomalies ({processedItems.filter(i => i.isAnomaly).length})
            </button>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search items, categories, specs..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 w-full sm:w-auto justify-end">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Sort by:</span>
            <button
              onClick={() => { if (sortField === 'profit') setSortAsc(!sortAsc); else { setSortField('profit'); setSortAsc(false); } }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition-colors ${sortField === 'profit' ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              Profit {sortField === 'profit' ? (sortAsc ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => { if (sortField === 'margin') setSortAsc(!sortAsc); else { setSortField('margin'); setSortAsc(false); } }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition-colors ${sortField === 'margin' ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              Margin {sortField === 'margin' ? (sortAsc ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => { if (sortField === 'sell') setSortAsc(!sortAsc); else { setSortField('sell'); setSortAsc(false); } }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition-colors ${sortField === 'sell' ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              Sell Value {sortField === 'sell' ? (sortAsc ? '↑' : '↓') : ''}
            </button>
          </div>
        </div>

        {/* Forensic Items Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <th className="py-3 px-4">Line Item Specification</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3 text-right">Qty</th>
                <th className="py-3 px-3 text-right">Unit Cost</th>
                <th className="py-3 px-3 text-right">Unit Sell</th>
                <th className="py-3 px-3 text-right">Total Cost</th>
                <th className="py-3 px-3 text-right">Total Sell</th>
                <th className="py-3 px-3 text-right">Net Profit</th>
                <th className="py-3 px-3 text-center" title="Markup applied to cost on this line">Markup</th>
                <th className="py-3 px-4 text-center">Quick Tune</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 italic">
                    No line items match the selected filter criteria.
                  </td>
                </tr>
              )}
              {filteredItems.map(item => (
                <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${item.isDrag ? 'bg-rose-50/30' : item.isProfitEngine ? 'bg-emerald-50/20' : ''}`}>
                  <td className="py-3 px-4 font-medium text-slate-900 max-w-[280px]">
                    <div className="truncate font-semibold">{item.name}</div>
                    <div className="text-[10px] text-slate-400 truncate" title={item.specs}>{item.specs || item.rationale || '—'}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px] truncate max-w-[120px] font-mono">
                    {item.cat || '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-700">
                    {item.qty} <span className="text-[9px] text-slate-400">{item.unit || ''}</span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-500">
                    {formatINR(item.unitCost)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-medium text-slate-800">
                    {formatINR(item.unitSell)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-600 bg-slate-50/50">
                    {formatINR(item.totalCost)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 bg-slate-50/50">
                    {formatINR(item.totalSell)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                    {formatINR(item.netProfit)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-md font-mono font-bold text-[11px] ${item.margin < 18 ? 'bg-rose-100 text-rose-800' : item.margin >= 28 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                      {item.margin.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handleQuickMarginAdjust(item.id, item.margin - 5)}
                        disabled={locked}
                        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold font-mono text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={locked ? lockReason : "Reduce Margin -5%"}
                      >
                        -5%
                      </button>
                      <button
                        onClick={() => handleQuickMarginAdjust(item.id, 28)}
                        disabled={locked}
                        className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-[10px] font-bold text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={locked ? lockReason : "Reset to 28% Target"}
                      >
                        28%
                      </button>
                      <button
                        onClick={() => handleQuickMarginAdjust(item.id, item.margin + 5)}
                        disabled={locked}
                        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold font-mono text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Increase Margin +5%"
                      >
                        +5%
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
