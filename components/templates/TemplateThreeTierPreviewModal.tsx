import React, { useState, useMemo } from 'react';
import { Item, ProjectContext, BoqItem } from '../../types';
import { TemplateData, generateStandardPackages } from '../../lib/standardPackages';
import { formatINR, calculateSellPrice } from '../../lib/utils';
import { ShieldCheck, Check, Trophy, X, Layers, Building2, ChevronDown, ChevronUp, Filter, Sparkles } from 'lucide-react';

interface TemplateThreeTierPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  configName: string;
  templates: TemplateData;
  bank: Item[];
}

type ViewMode = 'by_room' | 'by_trade' | 'flat';

export const TemplateThreeTierPreviewModal: React.FC<TemplateThreeTierPreviewModalProps> = ({
  isOpen,
  onClose,
  configName,
  templates,
  bank
}) => {
  const [carpetArea, setCarpetArea] = useState(1000);
  const [ceilingHeight, setCeilingHeight] = useState(9.5);
  const [viewMode, setViewMode] = useState<ViewMode>('by_room');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all');

  const bankMap = useMemo(() => new Map<string, Item>(bank.map(i => [i.id, i])), [bank]);

  const simulatedContext: ProjectContext = useMemo(() => ({
    name: 'Simulated Client Apartment',
    type: 'TURNKEY',
    area: carpetArea,
    ceilingHeight: ceilingHeight,
    config: configName,
    rooms: []
  }), [carpetArea, ceilingHeight, configName]);

  const generatedTiers = useMemo(() => {
    if (!isOpen) return [];
    try {
      return generateStandardPackages(simulatedContext, bank, templates, 'tiered');
    } catch (e) {
      console.error("Simulation failed:", e);
      return [];
    }
  }, [isOpen, simulatedContext, bank, templates]);

  // Extract unique room names across all tiers for filter
  const allRooms = useMemo(() => {
    const set = new Set<string>();
    generatedTiers.forEach(tier => {
      tier.boq.forEach(item => {
        if (item.roomId) set.add(item.roomId);
      });
    });
    return Array.from(set);
  }, [generatedTiers]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 p-5 text-white flex items-center justify-between border-b border-sky-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-400/20 text-amber-300 rounded-xl border border-amber-400/30">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold tracking-tight">3-Tier Car-Variant Simulation</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">
                  {configName}
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Simulate how this template dynamically prices Base (Essential), Mid (Comfort), and Top (Harmony) turnkey proposals for client presentations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Simulation Controls & Presets */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-center gap-4">
            {/* Carpet Area Input */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Carpet Area:
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={carpetArea}
                  onChange={(e) => setCarpetArea(Math.max(200, Number(e.target.value)))}
                  className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-right focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                />
                <span className="text-xs font-semibold text-slate-500">sq ft</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="hidden sm:flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <span className="text-[11px] font-semibold text-slate-400">Presets:</span>
              {[
                { label: '650 sqft', val: 650 },
                { label: '1,000 sqft', val: 1000 },
                { label: '1,450 sqft', val: 1450 },
                { label: '2,200 sqft', val: 2200 }
              ].map(preset => (
                <button
                  key={preset.label}
                  onClick={() => setCarpetArea(preset.val)}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                    carpetArea === preset.val
                      ? 'bg-[#0066CC] text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Ceiling Height */}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Ceiling:
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  value={ceilingHeight}
                  onChange={(e) => setCeilingHeight(Math.max(7, Number(e.target.value)))}
                  className="w-16 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-right focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                />
                <span className="text-xs font-semibold text-slate-500">ft</span>
              </div>
            </div>
          </div>

          {/* View Mode & Filter */}
          <div className="flex items-center gap-3">
            {allRooms.length > 1 && (
              <div className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedRoomFilter}
                  onChange={(e) => setSelectedRoomFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                >
                  <option value="all">All Rooms ({allRooms.length})</option>
                  {allRooms.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
              <button
                onClick={() => setViewMode('by_room')}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  viewMode === 'by_room' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Room View
              </button>
              <button
                onClick={() => setViewMode('flat')}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  viewMode === 'flat' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Flat List
              </button>
            </div>
          </div>
        </div>

        {/* Tier Summary Benchmark Bar */}
        <div className="bg-sky-50/50 border-b border-sky-100 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Turnkey Sqft Benchmarks ({carpetArea} sq ft):</span>
          </div>
          <div className="flex items-center gap-6 font-bold">
            {generatedTiers.map((tier, idx) => {
              const sell = tier.summary.totalSell || 0;
              const ratePerSqft = carpetArea > 0 ? Math.round(sell / carpetArea) : 0;
              const color = idx === 0 ? 'text-emerald-700' : idx === 1 ? 'text-sky-700' : 'text-purple-700';
              return (
                <div key={tier.name} className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium text-[11px]">{tier.name.split(' ')[0]}:</span>
                  <span className={color}>₹{ratePerSqft}/sqft</span>
                  <span className="text-slate-400 text-[10px]">({formatINR(sell)})</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tier Cards Grid */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {generatedTiers.map((tier, idx) => {
              const tierColor = idx === 0 ? 'emerald' : idx === 1 ? 'sky' : 'purple';
              const tierIcon = idx === 0 ? ShieldCheck : idx === 1 ? Check : Trophy;
              const IconComp = tierIcon;

              const totalSellPrice = tier.summary.totalSell || 0;
              const totalBaseCost = tier.summary.totalCost || 0;
              const grossMargin = tier.summary.blendedGm || 0;
              const ratePerSqft = carpetArea > 0 ? Math.round(totalSellPrice / carpetArea) : 0;

              // Filter boq items
              const filteredBoq = selectedRoomFilter === 'all'
                ? tier.boq
                : tier.boq.filter(b => b.roomId === selectedRoomFilter);

              // Group items by room
              const roomGroups: Record<string, BoqItem[]> = {};
              filteredBoq.forEach(item => {
                const room = item.roomId || 'General Scope';
                if (!roomGroups[room]) roomGroups[room] = [];
                roomGroups[room].push(item);
              });

              return (
                <div
                  key={tier.name}
                  className={`border rounded-2xl overflow-hidden flex flex-col bg-white shadow-sm transition-all ${
                    idx === 1 ? 'ring-2 ring-[#0066CC] shadow-md' : 'border-slate-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`p-4 border-b ${
                    idx === 0
                      ? 'bg-emerald-50/70 border-emerald-100'
                      : idx === 1
                      ? 'bg-sky-50/70 border-sky-100'
                      : 'bg-purple-50/70 border-purple-100'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          idx === 0 ? 'bg-emerald-600 text-white' : idx === 1 ? 'bg-[#0066CC] text-white' : 'bg-purple-600 text-white'
                        }`}>
                          <IconComp className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-800 text-sm">{tier.name}</span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-white/80 border text-slate-700">
                        {idx === 0 ? 'Base Model' : idx === 1 ? 'Mid Model' : 'Top Model'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{tier.desc || 'Standard Package Tier'}</p>

                    {/* Financial Summary */}
                    <div className="mt-3 pt-3 border-t border-slate-200/60 flex justify-between items-baseline">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Estimated Quote</span>
                        <div className="flex items-baseline gap-1.5">
                          <p className="text-lg font-black text-slate-900">{formatINR(totalSellPrice)}</p>
                          <span className="text-[11px] font-bold text-slate-500">₹{ratePerSqft}/sft</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Margin</span>
                        <p className="text-xs font-bold text-emerald-600">~{grossMargin.toFixed(1)}%</p>
                        <p className="text-[10px] text-slate-400">Cost: {formatINR(totalBaseCost)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="p-4 flex-1 overflow-y-auto max-h-[420px] space-y-3 custom-scrollbar">
                    <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <span>Included Deliverables ({filteredBoq.length})</span>
                      <span>Qty • Est Amount</span>
                    </div>

                    {viewMode === 'by_room' ? (
                      Object.entries(roomGroups).map(([roomName, items]) => {
                        const roomTotal = items.reduce((sum, item) => {
                          const bankItem = bankMap.get(item.bankId);
                          if (!bankItem) return sum;
                          const itemMargin = item.marginOverride !== undefined ? item.marginOverride : (bankItem.margin || 20);
                          const sellRate = calculateSellPrice(bankItem.materials, bankItem.labor, itemMargin);
                          return sum + (sellRate * item.qty);
                        }, 0);

                        return (
                          <div key={roomName} className="space-y-1.5">
                            <div className="flex justify-between items-center bg-slate-100/80 px-2 py-1 rounded text-[11px] font-bold text-slate-700">
                              <span>{roomName} ({items.length})</span>
                              <span className="text-[#0066CC]">{formatINR(roomTotal)}</span>
                            </div>
                            <div className="space-y-1 pl-1">
                              {items.map((boqItem, itemIdx) => {
                                const bankItem = bankMap.get(boqItem.bankId);
                                const itemMargin = boqItem.marginOverride !== undefined ? boqItem.marginOverride : (bankItem?.margin || 20);
                                const sellRate = bankItem ? calculateSellPrice(bankItem.materials, bankItem.labor, itemMargin) : 0;

                                return (
                                  <div
                                    key={itemIdx}
                                    className="p-1.5 bg-slate-50/90 rounded-lg border border-slate-100 text-xs flex justify-between items-center hover:bg-white hover:border-slate-200 transition-colors"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <p className="font-bold text-slate-800 truncate text-[11px]">
                                        {bankItem ? bankItem.name : boqItem.bankId}
                                      </p>
                                      <p className="text-[10px] text-slate-400 truncate">
                                        {bankItem?.cat || 'General'} • {boqItem.rationale || 'Standard'}
                                      </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="font-semibold text-slate-700 text-[11px]">
                                        {boqItem.qty} {bankItem?.unit}
                                      </span>
                                      <p className="text-[10px] text-slate-500 font-medium">
                                        {formatINR(sellRate * boqItem.qty)}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      filteredBoq.map((boqItem, itemIdx) => {
                        const bankItem = bankMap.get(boqItem.bankId);
                        const itemMargin = boqItem.marginOverride !== undefined ? boqItem.marginOverride : (bankItem?.margin || 20);
                        const sellRate = bankItem ? calculateSellPrice(bankItem.materials, bankItem.labor, itemMargin) : 0;

                        return (
                          <div
                            key={itemIdx}
                            className="p-2 bg-slate-50/80 rounded-xl border border-slate-100 text-xs flex justify-between items-center hover:bg-white hover:border-slate-200 transition-colors"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-slate-800 truncate">{bankItem ? bankItem.name : boqItem.bankId}</p>
                              <p className="text-[10px] text-slate-400">
                                Room: <span className="font-semibold text-slate-600">{boqItem.roomId}</span> • {bankItem?.cat || 'Item'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-semibold text-slate-700">{boqItem.qty} {bankItem?.unit}</span>
                              <p className="text-[10px] text-slate-500">{formatINR(sellRate * boqItem.qty)}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 font-medium">
            *Pricing dynamically synthesized using studio Item Bank rates, margin multipliers, and room-specific area takeoffs.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all"
          >
            Close Simulation
          </button>
        </div>
      </div>
    </div>
  );
};

