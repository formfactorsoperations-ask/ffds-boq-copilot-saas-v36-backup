import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Item, AIStrategy, FullProjectData } from '../types';
import { splitCost, isAiAvailable } from '../services/geminiService';
import { formatCurrency, calculateSellPrice } from '../lib/utils';
import { UOM_OPTIONS } from '../constants';
import { Sparkles, Copy, Trash2, Building2, Lock } from '@/lib/lucide-shim';
import type { MaterialSpecsBank } from '../lib/materialSpecs';
import { recipeOf, specsFromRecipe, composeWords } from '../lib/lineSpecs';
import { drawOf, standardSizeOf, canHaveSize } from '../lib/playground/pieces';
import { ftin } from '../lib/playground/geometry';
import { basisOfUnit } from '../lib/boqSize';
import Swatch from './materialSpecs/Swatch';
import { Chip, LABEL } from './ui/kit';
import { bankUsageIndex, projectsUsingItem } from '../lib/bankUsage';
import './people/peopleStyles';
import { supplyOf, SUPPLY_LABEL } from '../lib/playground/supply';

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
  /** How many projects use the item, when the screen has already counted. Without it the card counts for itself. */
  projectCount?: number;
  /** BOQ Playground S2: the Material specs bank. With it, the card shows the item's recipe and opens its drawer. */
  specBank?: MaterialSpecsBank;
  /** Opens the item's drawer; 'size' at its standard size ("On the plan"). */
  onOpenRecipe?: (id: string, section?: 'size') => void;
}

const FastInput: React.FC<{
  value: string | number;
  onChange: (val: string | number) => void;
  type?: 'text' | 'number';
  className?: string;
  placeholder?: string;
  onBlur?: () => void;
  /* A specification is written in lines (summary, then SCOPE, MATERIAL …).
     A one-line input drops line breaks the moment it is typed into. */
  multiline?: boolean;
}> = ({ value, onChange, type = 'text', className = '', placeholder, onBlur, multiline }) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

  if (multiline) {
    return (
      <textarea
        value={localValue}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={String(localValue || '').includes('\n') ? 4 : 2}
        className={`bg-transparent border border-transparent hover:border-slate-200 hover:bg-white focus:bg-white focus:border-[#3D52A0] focus:ring-2 focus:ring-[#3D52A0]/20 rounded-md px-1.5 py-0.5 outline-none transition-colors w-full text-slate-800 placeholder:text-slate-300 resize-y ${className}`}
      />
    );
  }

  return (
    <input
      type={type}
      value={localValue}
      onChange={handleChange}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`bg-transparent border border-transparent hover:border-slate-200 hover:bg-white focus:bg-white focus:border-[#3D52A0] focus:ring-2 focus:ring-[#3D52A0]/20 rounded-md px-1.5 py-0.5 outline-none transition-colors w-full text-slate-800 placeholder:text-slate-300 ${className}`}
    />
  );
};

/* A small button in the card's corner. */
const ICON_BUTTON = 'p-1.5 rounded-lg text-slate-400 transition-colors hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 disabled:opacity-50';
/* A select that looks like text until it is pointed at. */
const QUIET_SELECT = 'max-w-full -ml-1 px-1 py-0.5 rounded-md border border-transparent bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer transition-colors hover:border-slate-200 hover:bg-white focus:border-[#3D52A0] focus:ring-2 focus:ring-[#3D52A0]/20';

/* The margin bar is full at 40%; below 15% is the studio's low-margin line. */
const MARGIN_FULL = 40;

const BankItemCard: React.FC<BankItemCardProps> = ({
  item,
  onUpdate,
  onDelete,
  onDuplicate,
  aiStrategy,
  isHighlighted,
  isSelected,
  onToggleSelect,
  projects,
  onViewProjectUsage,
  projectCount: countGiven,
  specBank,
  onOpenRecipe,
}) => {
  /* The recipe and what it makes at Comfort, as the mockup's card shows them. */
  const recipe = specBank ? recipeOf(item, specBank) : null;
  const recipeSpecs = recipe && specBank ? specsFromRecipe(specBank, recipe, 'C') : null;
  /* The standard size, for an item that is made and measured by area or length (not a surface or a service). */
  const standard = standardSizeOf(item);
  const sizeBasis = basisOfUnit(item.unit);
  const sizeDraw = drawOf(item);
  const sizeChip = standard && sizeDraw
    ? `Size ${ftin(sizeDraw.w)}${sizeBasis === 'area' ? ` × ${ftin(sizeDraw.h)}` : ''}`
    : canHaveSize(item) ? 'Set size' : null;
  const recipeWords = recipeSpecs && specBank ? composeWords(specBank, recipeSpecs) : '';
  const [isSplitting, setIsSplitting] = useState(false);
  const aiOn = isAiAvailable();

  const totalCost = (Number(item.materials) || 0) + (Number(item.labor) || 0);
  const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
  const margin = Number(item.margin) || 0;
  const marginTone = margin >= 20 ? 'good' : margin >= 15 ? 'warn' : 'bad';
  const supply = supplyOf(item);
  const name = item.name || 'this item';

  const ownCount = useMemo(
    () => (countGiven == null && projects && projects.length ? projectsUsingItem(bankUsageIndex(projects), item).size : 0),
    [countGiven, projects, item.id, item.name], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const projectCount = countGiven ?? ownCount;

  const handleUpdate = (field: keyof Item, value: any) => {
    onUpdate(item.id, { ...item, [field]: value });
  };

  /* A price typed here is turned back into the margin that gives it. */
  const handleSellPriceChange = (newSellPrice: number) => {
    if (totalCost > 0) {
      const newMargin = ((newSellPrice / totalCost) - 1) * 100;
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

  return (
    <article
      id={`bank-item-${item.id}`}
      aria-label={item.name || 'New item'}
      className={`group relative h-full min-w-0 bg-white rounded-2xl border p-5 flex flex-col gap-3 pp-lift transition-colors ${
        isSelected
          ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/15'
          : isHighlighted
          ? 'border-amber-400 ring-2 ring-amber-100'
          : 'border-slate-200 hover:border-[#3D52A0]/40'
      }`}
    >
      {/* What it is, and what can be done to it. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected || false}
              onChange={() => onToggleSelect(item.id)}
              aria-label={`Select ${name}`}
              className="mr-0.5 rounded border-slate-300 text-[#3D52A0] focus:ring-[#3D52A0] cursor-pointer"
            />
          )}
          <Chip tone="slate">{item.cat || 'General'}</Chip>
          {specBank && (
            <button type="button" onClick={() => onOpenRecipe?.(item.id)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${recipe ? 'bg-[#3D52A0]/10 text-[#3D52A0] hover:bg-[#3D52A0]/20' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
              title={recipe ? `Recipe: ${recipe.name}. Open it` : 'No recipe yet. Open the item to start one'}>
              {recipe ? 'Recipe' : 'No recipe'}
            </button>
          )}
          {/* The standard size every new BOQ starts the item at; set in the drawer, "On the plan". */}
          {specBank && sizeChip && (
            <button type="button" onClick={() => onOpenRecipe?.(item.id, 'size')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${standard ? 'bg-[#3D52A0]/10 text-[#3D52A0] hover:bg-[#3D52A0]/20' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
              title={standard ? 'The standard size every new BOQ starts this item at. Open it to change' : 'No standard size yet: a new BOQ sizes it from the room. Open it to set one'}>
              {sizeChip}
            </button>
          )}
          {supply && <Chip tone="warn">{SUPPLY_LABEL[supply]}</Chip>}
        </div>

        {/* Dim until the card is pointed at or tabbed into, but never hidden: a tablet has no hover. */}
        <div className="flex items-center gap-0.5 -mr-1.5 -mt-1 shrink-0 opacity-50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {aiOn && (
            <button type="button" onClick={handleCostSplit} disabled={isSplitting} className={ICON_BUTTON}
              title="Split the cost into material and labour with AI" aria-label={`Split the cost of ${name} with AI`}>
              <Sparkles className={`w-3.5 h-3.5 ${isSplitting ? 'motion-safe:animate-spin' : ''}`} />
            </button>
          )}
          {onDuplicate && (
            <button type="button" onClick={() => onDuplicate(item)} className={ICON_BUTTON} title="Duplicate" aria-label={`Duplicate ${name}`}>
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" onClick={() => onDelete(item.id)} title="Delete" aria-label={`Delete ${name}`}
            className={`${ICON_BUTTON} hover:!text-rose-600 hover:!bg-rose-50`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Its name, and who uses it. */}
      <div className="-mx-1.5">
        <FastInput
          value={item.name}
          onChange={(v) => handleUpdate('name', v)}
          className="font-bold text-sm !text-slate-800"
          placeholder="Item name, e.g. Wardrobe"
        />
        {projectCount > 0 && (
          <button
            type="button"
            onClick={() => onViewProjectUsage && onViewProjectUsage(item)}
            className="inline-flex items-center gap-1 ml-1.5 mt-1 px-2 py-0.5 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-[10px] font-bold transition-colors hover:bg-[#3D52A0]/20"
            title={`Used in ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}. Open the list.`}
          >
            <Building2 className="w-3 h-3" aria-hidden />
            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          </button>
        )}
      </div>

      {/* Specs: from the recipe when it has one (BOQ Playground S2), else typed. */}
      {recipeSpecs && specBank ? (
        <button type="button" onClick={() => onOpenRecipe?.(item.id)} className="block w-full text-left rounded-lg -m-1 p-1 transition-colors hover:bg-slate-50">
          <span className="flex flex-wrap gap-1">
            {Object.entries(recipeSpecs).slice(0, 4).map(([part, sp]) => {
              const m = specBank.materials.find(x => x.id === sp.id);
              return (
                <span key={part} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-semibold text-slate-600">
                  {m?.swatch && <Swatch mat={m} className="w-3 h-3 rounded-full" />}{part}: {(m?.name || '').split(',')[0]} <span className="text-[#3D52A0]">v{sp.v}</span>
                </span>
              );
            })}
          </span>
          <span className="mt-2 block text-xs text-slate-600 line-clamp-2">{recipeWords}</span>
        </button>
      ) : (
        <div className="-mx-1.5">
          <FastInput
            value={item.specs}
            multiline
            onChange={(v) => handleUpdate('specs', v)}
            className="text-xs !text-slate-600"
            placeholder="Specification the client sees"
          />
        </div>
      )}

      {/* Internal notes: the client never sees these. */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 pl-2 pr-0.5">
        <Lock className="w-3 h-3 shrink-0 text-slate-400" aria-hidden />
        <FastInput
          value={item.internalSpecs || ''}
          onChange={(v) => handleUpdate('internalSpecs', v)}
          className="text-[11px] !text-slate-600"
          placeholder="Internal execution notes"
        />
      </div>

      <div className="mt-auto space-y-3">
        {/* Cost, margin and the area factor. */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 pt-2.5 pb-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0">
              <span className={`${LABEL} block`}>Cost</span>
              <span className="mt-1 block px-1.5 text-xs font-bold text-slate-800 tabular-nums truncate" title="Material plus labour">{formatCurrency(totalCost)}</span>
            </div>
            <label className="block min-w-0">
              <span className={`${LABEL} block`}>Margin</span>
              <span className="mt-0.5 flex items-center gap-0.5">
                <FastInput
                  type="number"
                  value={item.margin}
                  onChange={(v) => handleUpdate('margin', v)}
                  className={`!w-14 text-xs font-bold tabular-nums ${marginTone === 'good' ? '!text-emerald-700' : marginTone === 'warn' ? '!text-amber-700' : '!text-rose-700'}`}
                />
                <span className="text-[10px] font-bold text-slate-400" aria-hidden>%</span>
              </span>
            </label>
            <label className="block min-w-0" title="Multiplies the quantity worked out from a room's size">
              <span className={`${LABEL} block`}>Factor</span>
              <span className="mt-0.5 block">
                <FastInput
                  type="number"
                  value={item.areaMultiplierCoefficient || 1}
                  onChange={(v) => handleUpdate('areaMultiplierCoefficient', v)}
                  className="text-xs font-semibold !text-slate-700 tabular-nums"
                />
              </span>
            </label>
          </div>
          {/* The margin as a bar: it grows in, and follows the figure as it is typed. */}
          <div className="mt-2.5 h-1 rounded-full bg-slate-200 overflow-hidden" role="img" aria-label={`Margin ${margin}%${margin < 15 ? ', under the 15% line' : ''}`}>
            <motion.div
              className={`h-full w-full rounded-full ${marginTone === 'good' ? 'bg-emerald-500' : marginTone === 'warn' ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ originX: 0 }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: Math.max(0.03, Math.min(1, margin / MARGIN_FULL)) }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Unit, who supplies it, and what it sells for. */}
        <div className="flex items-end justify-between gap-3">
          <label className="block min-w-0">
            <span className={`${LABEL} block`}>Unit</span>
            <select
              value={item.unit}
              onChange={(e) => handleUpdate('unit', e.target.value)}
              className={`${QUIET_SELECT} uppercase`}
            >
              {UOM_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          {/* BOQ Playground X: bought by the client, or at actuals, keeps its lines out of every figure. */}
          <div className="min-w-0">
            <label htmlFor={`supply-${item.id}`} className={`${LABEL} block`}>
              Supplied
            </label>
            <select
              id={`supply-${item.id}`}
              value={supply || ''}
              onChange={(e) => handleUpdate('supply', e.target.value || null)}
              className={QUIET_SELECT}
            >
              <option value="">By the studio</option>
              <option value="client">Bought by client</option>
              <option value="actuals">At actuals</option>
            </select>
          </div>
          <label className="block w-32 shrink-0 text-right">
            <span className={`${LABEL} block`}>Sell price ₹</span>
            <FastInput
              type="number"
              value={parseFloat(sellPrice.toFixed(0))}
              onChange={(v) => handleSellPriceChange(v as number)}
              className="text-base font-black !text-slate-800 text-right tabular-nums"
            />
          </label>
        </div>
      </div>
    </article>
  );
};

/*
  Remembered: a change to one item makes a new bank, and without this every
  card on the screen was drawn again for each letter typed into one of them.
*/
export default React.memo(BankItemCard);
