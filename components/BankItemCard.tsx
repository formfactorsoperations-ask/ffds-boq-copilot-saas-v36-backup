import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Item, AIStrategy } from '../types';
import { splitCost, isAiAvailable } from '../services/geminiService';
import { formatCurrency, calculateSellPrice } from '../lib/utils';
import { DeleteIcon, WandIcon } from './Icons';
import { UOM_OPTIONS } from '../constants';

interface BankItemCardProps {
  item: Item;
  onUpdate: (id: string, updatedItem: Item) => void;
  onDelete: (id: string) => void;
  aiStrategy: AIStrategy;
  isHighlighted?: boolean;
  viewMode?: 'grid' | 'list';
  gridTemplate?: string; // Passed from parent for strict alignment in list view
}

// --- HELPER: Fast Transparent Input ---
// Allows editing without "click to edit" mode switching. Looks like text, acts like input.
const FastInput: React.FC<{
    value: string | number;
    onChange: (val: string | number) => void;
    type?: 'text' | 'number';
    className?: string;
    placeholder?: string;
    onBlur?: () => void;
}> = ({ value, onChange, type = 'text', className = "", placeholder, onBlur }) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => { setLocalValue(value); }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalValue(val);
        // Instant update for text, debounced could be added if needed but raw speed is requested
        if (type === 'number') {
            const num = parseFloat(val);
            if (!isNaN(num)) onChange(num);
            else if (val === '') onChange(0);
        } else {
            onChange(val);
        }
    };

    return (
        <input 
            type={type}
            value={localValue}
            onChange={handleChange}
            onBlur={onBlur}
            placeholder={placeholder}
            className={`bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 rounded px-1.5 py-0.5 outline-none transition-all w-full text-slate-800 placeholder:text-slate-300 ${className}`}
        />
    );
};

const BankItemCard: React.FC<BankItemCardProps> = ({ item, onUpdate, onDelete, aiStrategy, isHighlighted, viewMode = 'grid', gridTemplate }) => {
  const [isSplitting, setIsSplitting] = useState(false);

  // Memoized calculations
  const totalCost = useMemo(() => (item.materials || 0) + (item.labor || 0), [item.materials, item.labor]);
  const sellPrice = useMemo(() => calculateSellPrice(item.materials, item.labor, item.margin), [item.materials, item.labor, item.margin]);

  const handleUpdate = (field: keyof Item, value: any) => {
    onUpdate(item.id, { ...item, [field]: value });
  };

  // Logic to split Total Cost into Material (65%) and Labor (35%) automatically
  const handleTotalCostChange = (newTotal: number) => {
      const materials = Math.round(newTotal * 0.65);
      const labor = Math.round(newTotal * 0.35);
      onUpdate(item.id, { ...item, materials, labor });
  };

  // Smart Reverse Calculation: Update Sell Price -> Updates Margin
  const handleSellPriceChange = (newSellPrice: number) => {
      const cost = totalCost;
      if (cost > 0) {
          const newMargin = ((newSellPrice / cost) - 1) * 100;
          handleUpdate('margin', parseFloat(newMargin.toFixed(2)));
      }
  };

  // AI Helper
  const handleCostSplit = async () => {
      if (!isAiAvailable()) return;
      setIsSplitting(true);
      const { materials, labor } = await splitCost(item, totalCost, aiStrategy);
      onUpdate(item.id, { ...item, materials, labor });
      setIsSplitting(false);
  }

  // --- LIST VIEW ---
  if (viewMode === 'list') {
      return (
        <div 
            id={`bank-item-${item.id}`}
            className={`grid gap-4 p-2 items-center hover:bg-slate-50 transition-colors group relative ${isHighlighted ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'border-l-4 border-transparent'}`}
            style={{ gridTemplateColumns: gridTemplate }}
        >
            {/* 1. Name & Specs */}
            <div className="flex flex-col justify-center pl-2 space-y-1">
                <FastInput 
                    value={item.name} 
                    onChange={v => handleUpdate('name', v)} 
                    className="font-bold text-sm" 
                    placeholder="Item Name"
                />
                <FastInput 
                    value={item.specs} 
                    onChange={v => handleUpdate('specs', v)} 
                    className="text-[11px] text-slate-500 bg-slate-50/50" 
                    placeholder="Public Concept Specs (L1/L2 Proposal)"
                />
                <FastInput 
                    value={item.internalSpecs || ''} 
                    onChange={v => handleUpdate('internalSpecs', v)} 
                    className="text-[11px] text-slate-500 italic bg-amber-50/30 border-l-2 border-amber-200 pl-1.5" 
                    placeholder="Internal Execution Docs (Post-Signoff/Portal Data, won't show in L1/L2)"
                />
            </div>

            {/* 2. Category */}
            <div>
                <FastInput value={item.cat} onChange={v => handleUpdate('cat', v)} className="text-xs font-medium text-slate-600 bg-slate-100/50 rounded-md text-center" />
            </div>

            {/* 3. Unit */}
            <div>
                <select 
                    value={item.unit} 
                    onChange={e => handleUpdate('unit', e.target.value)}
                    className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-indigo-400 rounded px-1 py-0.5 text-xs text-slate-600 font-medium outline-none cursor-pointer text-center appearance-none"
                >
                    {UOM_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </div>

            {/* 4. Total Cost (Smart Driver) */}
            <div className="relative group/total bg-blue-50/50 rounded-md">
                <FastInput 
                    type="number" 
                    value={totalCost} 
                    onChange={(v) => handleTotalCostChange(Number(v))} 
                    className="text-right text-xs font-bold text-blue-700"
                />
                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[9px] text-blue-300 pointer-events-none opacity-0 group-hover/total:opacity-100">Tot</span>
            </div>

            {/* 5. Material Cost */}
            <div className="relative group/cost">
                <FastInput 
                    type="number" 
                    value={item.materials} 
                    onChange={v => handleUpdate('materials', v)} 
                    className="text-right text-xs font-mono text-slate-600"
                />
                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[9px] text-slate-300 pointer-events-none opacity-0 group-hover/cost:opacity-100">Mat</span>
            </div>

            {/* 6. Labor Cost */}
            <div className="relative group/cost">
                <FastInput 
                    type="number" 
                    value={item.labor} 
                    onChange={v => handleUpdate('labor', v)} 
                    className="text-right text-xs font-mono text-slate-600"
                />
                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[9px] text-slate-300 pointer-events-none opacity-0 group-hover/cost:opacity-100">Lab</span>
            </div>

            {/* 7. Margin % */}
            <div className="relative">
                <FastInput 
                    type="number" 
                    value={item.margin} 
                    onChange={v => handleUpdate('margin', v)} 
                    className={`text-right text-xs font-bold font-mono ${item.margin < 15 ? 'text-amber-600' : 'text-emerald-600'}`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">%</span>
            </div>

            {/* 8. Sell Price (Reverse Calc) */}
            <div>
                <FastInput 
                    type="number" 
                    value={parseFloat(sellPrice.toFixed(0))} 
                    onChange={v => handleSellPriceChange(v as number)} 
                    className="text-right text-sm font-bold text-slate-900 font-mono bg-slate-50/50"
                />
            </div>

            {/* 9. Actions */}
            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={() => onDelete(item.id)} 
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete Item"
                >
                    <DeleteIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
      );
  }

  const MotionDiv = motion.div as any;

  // --- GRID VIEW ---
  return (
    <MotionDiv 
        id={`bank-item-${item.id}`}
        layout
        className={`bg-white rounded-2xl p-5 border shadow-sm hover:shadow-lg transition-all group relative ${isHighlighted ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-100 hover:border-indigo-200'}`}
    >
        <div className="flex justify-between items-start mb-3">
            <div className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                {item.cat}
            </div>
            <button onClick={() => onDelete(item.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <DeleteIcon className="w-4 h-4" />
            </button>
        </div>

        <FastInput 
            value={item.name} 
            onChange={v => handleUpdate('name', v)} 
            className="font-bold text-base text-slate-900 mb-1" 
            placeholder="Item Name"
        />
        
        <FastInput 
            value={item.specs} 
            onChange={v => handleUpdate('specs', v)} 
            className="text-[11px] text-slate-500 mb-1"
            placeholder="Public Concept Specs (L1/L2 Proposal)"
        />

        <FastInput 
            value={item.internalSpecs || ''} 
            onChange={v => handleUpdate('internalSpecs', v)} 
            className="text-[11px] text-slate-500 italic bg-amber-50/50 border-l-2 border-amber-200 pl-1.5 mb-4"
            placeholder="Internal Execution Docs (Post-Signoff/Portal Data, won't show in L1/L2)"
        />

        <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
            <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Cost</label>
                <div className="font-mono text-xs text-slate-600 font-semibold">{formatCurrency(totalCost)}</div>
            </div>
            <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Margin</label>
                <FastInput 
                    type="number" 
                    value={item.margin} 
                    onChange={v => handleUpdate('margin', v)} 
                    className="text-xs font-bold text-emerald-600 bg-white"
                />
            </div>
        </div>

        <div className="flex justify-between items-end border-t border-slate-100 pt-3">
            <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Unit</label>
                <select 
                    value={item.unit} 
                    onChange={e => handleUpdate('unit', e.target.value)}
                    className="text-xs font-medium text-slate-600 bg-transparent outline-none cursor-pointer"
                >
                    {UOM_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </div>
            <div className="text-right">
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Sell Price</label>
                <FastInput 
                    type="number" 
                    value={parseFloat(sellPrice.toFixed(0))} 
                    onChange={v => handleSellPriceChange(v as number)} 
                    className="text-lg font-black text-slate-900 bg-transparent text-right p-0"
                />
            </div>
        </div>
    </MotionDiv>
  );
};

export default BankItemCard;