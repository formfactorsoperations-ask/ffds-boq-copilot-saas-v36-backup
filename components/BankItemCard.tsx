import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Item, AIStrategy, FullProjectData } from '../types';
import { splitCost, isAiAvailable } from '../services/geminiService';
import { formatCurrency, calculateSellPrice } from '../lib/utils';
import { DeleteIcon, WandIcon } from './Icons';
import { UOM_OPTIONS } from '../constants';
import { Sparkles, Copy, Trash2, Building2 } from 'lucide-react';

interface BankItemCardProps {
  item: Item;
  onUpdate: (id: string, updatedItem: Item) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (item: Item) => void;
  aiStrategy: AIStrategy;
  isHighlighted?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  viewMode?: 'grid' | 'list';
  gridTemplate?: string;
  projects?: FullProjectData[];
  onViewProjectUsage?: (item: Item) => void;
}

const FastInput: React.FC<{
  value: string | number;
  onChange: (val: string | number) => void;
  type?: 'text' | 'number';
  className?: string;
  placeholder?: string;
  onBlur?: () => void;
}> = ({ value, onChange, type = 'text', className = '', placeholder, onBlur }) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);
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
      className={`bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 rounded px-1.5 py-0.5 outline-none transition-all w-full text-slate-800 placeholder:text-slate-300 ${className}`}
    />
  );
};

const BankItemCard: React.FC<BankItemCardProps> = ({
  item,
  onUpdate,
  onDelete,
  onDuplicate,
  aiStrategy,
  isHighlighted,
  isSelected,
  onToggleSelect,
  viewMode = 'grid',
  gridTemplate,
  projects = [],
  onViewProjectUsage,
}) => {
  const [isSplitting, setIsSplitting] = useState(false);

  const totalCost = useMemo(
    () => (item.materials || 0) + (item.labor || 0),
    [item.materials, item.labor]
  );
  const sellPrice = useMemo(
    () => calculateSellPrice(item.materials, item.labor, item.margin),
    [item.materials, item.labor, item.margin]
  );

  // Compute matched projects count
  const projectCount = useMemo(() => {
    if (!projects || projects.length === 0) return 0;
    const targetId = item.id;
    const targetName = (item.name || '').trim().toLowerCase();
    const matched = new Set<string>();

    projects.forEach((proj) => {
      proj.tiers?.forEach((tier) => {
        tier.boq?.forEach((boqItem) => {
          if (
            (boqItem.bankId && boqItem.bankId === targetId) ||
            (boqItem.name && boqItem.name.trim().toLowerCase() === targetName)
          ) {
            matched.add(proj.id);
          }
        });
      });

      proj.canonical?.boq?.items?.forEach((cItem) => {
        if (
          (cItem.bankId && cItem.bankId === targetId) ||
          (cItem.name && cItem.name.trim().toLowerCase() === targetName)
        ) {
          matched.add(proj.id);
        }
      });
    });

    return matched.size;
  }, [item, projects]);

  const handleUpdate = (field: keyof Item, value: any) => {
    onUpdate(item.id, { ...item, [field]: value });
  };

  const handleTotalCostChange = (newTotal: number) => {
    const materials = Math.round(newTotal * 0.65);
    const labor = Math.round(newTotal * 0.35);
    onUpdate(item.id, { ...item, materials, labor });
  };

  const handleSellPriceChange = (newSellPrice: number) => {
    const cost = totalCost;
    if (cost > 0) {
      const newMargin = ((newSellPrice / cost) - 1) * 100;
      handleUpdate('margin', parseFloat(newMargin.toFixed(2)));
    }
  };

  const handleCostSplit = async () => {
    if (!isAiAvailable()) return;
    setIsSplitting(true);
    try {
      const { materials, labor } = await splitCost(item, totalCost, aiStrategy);
      onUpdate(item.id, { ...item, materials, labor });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSplitting(false);
    }
  };

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv
      id={`bank-item-${item.id}`}
      layout
      className={`bg-white rounded-2xl p-5 border shadow-2xs hover:shadow-md transition-all group relative flex flex-col justify-between ${
        isSelected
          ? 'border-[#0066CC] ring-2 ring-sky-100 bg-sky-50/20'
          : isHighlighted
          ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/20'
          : 'border-slate-200/80 hover:border-sky-300'
      }`}
    >
      <div>
        {/* Top bar with Selection checkbox, category tag, and actions */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={isSelected || false}
                onChange={() => onToggleSelect(item.id)}
                className="rounded border-slate-300 text-[#0066CC] focus:ring-[#0066CC] cursor-pointer"
              />
            )}
            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border border-slate-200/60">
              {item.cat || 'General'}
            </span>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCostSplit}
              disabled={isSplitting}
              className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors"
              title="AI Cost Split"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSplitting ? 'animate-spin' : ''}`} />
            </button>
            {onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate(item)}
                className="p-1 text-slate-400 hover:text-[#0066CC] hover:bg-sky-50 rounded transition-colors"
                title="Duplicate Item"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
              title="Delete Item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Item Name & Linked Projects Badge */}
        <div className="mb-1">
          <FastInput
            value={item.name}
            onChange={(v) => handleUpdate('name', v)}
            className="font-extrabold text-sm text-slate-900"
            placeholder="Item Name (e.g. Wardrobe)"
          />
          {projectCount > 0 && (
            <button
              type="button"
              onClick={() => onViewProjectUsage && onViewProjectUsage(item)}
              className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#0066CC] rounded-full text-[10px] font-extrabold transition-colors cursor-pointer"
              title={`Used in ${projectCount} project(s). Click to view details.`}
            >
              <Building2 className="w-3 h-3" />
              {projectCount} {projectCount === 1 ? 'Project' : 'Projects'}
            </button>
          )}
        </div>

        {/* Specs */}
        <FastInput
          value={item.specs}
          onChange={(v) => handleUpdate('specs', v)}
          className="text-[11px] text-slate-500 mb-1"
          placeholder="Public Concept Specs (L1/L2 Proposal)"
        />

        {/* Internal Specs */}
        <FastInput
          value={item.internalSpecs || ''}
          onChange={(v) => handleUpdate('internalSpecs', v)}
          className="text-[11px] text-slate-500 italic bg-amber-50/40 border-l-2 border-amber-300 pl-1.5 mb-3"
          placeholder="Internal Execution Docs (Post-Signoff/Portal Data)"
        />

        {/* Cost & Margin Metrics */}
        <div className="grid grid-cols-3 gap-2 mb-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
          <div>
            <label className="text-[9px] font-extrabold text-slate-400 uppercase block mb-0.5">
              Cost
            </label>
            <div className="font-mono text-xs text-blue-700 font-bold">
              {formatCurrency(totalCost)}
            </div>
          </div>
          <div>
            <label className="text-[9px] font-extrabold text-slate-400 uppercase block mb-0.5">
              Margin
            </label>
            <div className="flex items-center gap-0.5">
              <FastInput
                type="number"
                value={item.margin}
                onChange={(v) => handleUpdate('margin', v)}
                className={`text-xs font-bold font-mono bg-white ${
                  (item.margin || 0) < 15 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              />
              <span className="text-[10px] text-slate-400">%</span>
            </div>
          </div>
          <div>
            <label
              className="text-[9px] font-extrabold text-slate-400 uppercase block mb-0.5"
              title="Area Coefficient Multiplier"
            >
              Coeff
            </label>
            <FastInput
              type="number"
              value={item.areaMultiplierCoefficient || 1}
              onChange={(v) => handleUpdate('areaMultiplierCoefficient', v)}
              className="text-xs font-bold text-[#0066CC] bg-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* Footer with Unit and Selling Price */}
      <div className="flex justify-between items-end border-t border-slate-100 pt-3">
        <div>
          <label className="text-[9px] font-extrabold text-slate-400 uppercase block mb-0.5">
            Unit
          </label>
          <select
            value={item.unit}
            onChange={(e) => handleUpdate('unit', e.target.value)}
            className="text-xs font-bold text-slate-600 bg-transparent outline-none cursor-pointer uppercase"
          >
            {UOM_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <label className="text-[9px] font-extrabold text-slate-400 uppercase block mb-0.5">
            Sell Price
          </label>
          <FastInput
            type="number"
            value={parseFloat(sellPrice.toFixed(0))}
            onChange={(v) => handleSellPriceChange(v as number)}
            className="text-base font-black text-slate-900 bg-transparent text-right p-0 font-mono"
          />
        </div>
      </div>
    </MotionDiv>
  );
};

export default BankItemCard;
