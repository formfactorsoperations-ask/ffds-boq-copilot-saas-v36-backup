import React, { useState, useMemo } from 'react';
import { Item, AIStrategy, FullProjectData } from '../../types';
import { UOM_OPTIONS } from '../../constants';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { splitCost, isAiAvailable } from '../../services/geminiService';
import { 
  Trash2, 
  Copy, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
  ExternalLink
} from 'lucide-react';

interface BankSpreadsheetTableProps {
  items: Item[];
  selectedItemIds: Set<string>;
  onToggleSelectItem: (id: string) => void;
  onToggleSelectAll: () => void;
  isAllSelected: boolean;
  onUpdateItem: (id: string, updatedItem: Item) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (item: Item) => void;
  aiStrategy: AIStrategy;
  categories: string[];
  highlightedBankItemId: string | null;
  projects?: FullProjectData[];
  onViewProjectUsage?: (item: Item) => void;
}

export type SortField = 'name' | 'cat' | 'unit' | 'materials' | 'labor' | 'totalCost' | 'margin' | 'sellPrice' | 'areaMultiplierCoefficient' | 'projectUsage';

const BankSpreadsheetTable: React.FC<BankSpreadsheetTableProps> = ({
  items,
  selectedItemIds,
  onToggleSelectItem,
  onToggleSelectAll,
  isAllSelected,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  aiStrategy,
  categories,
  highlightedBankItemId,
  projects = [],
  onViewProjectUsage,
}) => {
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [splittingId, setSplittingId] = useState<string | null>(null);

  // Precompute project count map for fast rendering & sorting
  const projectCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!projects || projects.length === 0) return map;

    items.forEach((item) => {
      const targetId = item.id;
      const targetName = (item.name || '').trim().toLowerCase();
      const matchedProjects = new Set<string>();

      projects.forEach((proj) => {
        // Tiers
        proj.tiers?.forEach((tier) => {
          tier.boq?.forEach((boqItem) => {
            if (
              (boqItem.bankId && boqItem.bankId === targetId) ||
              (boqItem.name && boqItem.name.trim().toLowerCase() === targetName)
            ) {
              matchedProjects.add(proj.id);
            }
          });
        });

        // Canonical BOQ
        proj.canonical?.boq?.items?.forEach((cItem) => {
          if (
            (cItem.bankId && cItem.bankId === targetId) ||
            (cItem.name && cItem.name.trim().toLowerCase() === targetName)
          ) {
            matchedProjects.add(proj.id);
          }
        });
      });

      map.set(item.id, matchedProjects.size);
    });

    return map;
  }, [items, projects]);

  const toggleExpand = (id: string) => {
    setExpandedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Sorting
  const sortedItems = [...items].sort((a, b) => {
    let valA: any = a[sortField as keyof Item];
    let valB: any = b[sortField as keyof Item];

    if (sortField === 'totalCost') {
      valA = (a.materials || 0) + (a.labor || 0);
      valB = (b.materials || 0) + (b.labor || 0);
    } else if (sortField === 'sellPrice') {
      valA = calculateSellPrice(a.materials, a.labor, a.margin);
      valB = calculateSellPrice(b.materials, b.labor, b.margin);
    } else if (sortField === 'projectUsage') {
      valA = projectCountMap.get(a.id) || 0;
      valB = projectCountMap.get(b.id) || 0;
    }

    if (typeof valA === 'string') {
      const comp = valA.localeCompare(String(valB || ''));
      return sortAsc ? comp : -comp;
    }
    const numA = Number(valA) || 0;
    const numB = Number(valB) || 0;
    return sortAsc ? numA - numB : numB - numA;
  });

  const handleFieldChange = (item: Item, field: keyof Item, val: any) => {
    onUpdateItem(item.id, { ...item, [field]: val });
  };

  // Auto split total cost 65% mat / 35% lab
  const handleTotalCostChange = (item: Item, newTotal: number) => {
    const materials = Math.round(newTotal * 0.65);
    const labor = Math.round(newTotal * 0.35);
    onUpdateItem(item.id, { ...item, materials, labor });
  };

  // Reverse calculate margin from sell price
  const handleSellPriceChange = (item: Item, newSellPrice: number) => {
    const cost = (item.materials || 0) + (item.labor || 0);
    if (cost > 0) {
      const newMargin = ((newSellPrice / cost) - 1) * 100;
      handleFieldChange(item, 'margin', parseFloat(newMargin.toFixed(2)));
    }
  };

  const handleAiCostSplit = async (item: Item) => {
    if (!isAiAvailable()) return;
    setSplittingId(item.id);
    try {
      const totalCost = (item.materials || 0) + (item.labor || 0);
      const { materials, labor } = await splitCost(item, totalCost, aiStrategy);
      onUpdateItem(item.id, { ...item, materials, labor });
    } catch (e) {
      console.error('AI Cost Split failed', e);
    } finally {
      setSplittingId(null);
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover/col:opacity-100" />;
    return sortAsc ? <ArrowUp className="w-3 h-3 text-[#0066CC]" /> : <ArrowDown className="w-3 h-3 text-[#0066CC]" />;
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1240px]">
          {/* Table Header */}
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-black text-slate-600 uppercase tracking-wider select-none">
              {/* Checkbox */}
              <th className="py-3.5 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected && items.length > 0}
                  onChange={onToggleSelectAll}
                  className="rounded border-slate-300 text-[#0066CC] focus:ring-[#0066CC] cursor-pointer"
                  title="Select / Deselect all filtered items"
                />
              </th>

              {/* Item Name & Specs */}
              <th 
                onClick={() => handleSort('name')}
                className="py-3.5 px-4 min-w-[280px] cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Item & Specifications</span>
                  {renderSortIcon('name')}
                </div>
              </th>

              {/* Linked Projects */}
              <th 
                onClick={() => handleSort('projectUsage')}
                className="py-3.5 px-3 w-28 text-center cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
                title="Number of active project BOQs utilizing this item"
              >
                <div className="flex items-center justify-center gap-1.5 text-sky-700 font-extrabold">
                  <span>Projects</span>
                  {renderSortIcon('projectUsage')}
                </div>
              </th>

              {/* Category */}
              <th 
                onClick={() => handleSort('cat')}
                className="py-3.5 px-3 min-w-[130px] cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Category</span>
                  {renderSortIcon('cat')}
                </div>
              </th>

              {/* Unit */}
              <th 
                onClick={() => handleSort('unit')}
                className="py-3.5 px-2.5 w-20 text-center cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Unit</span>
                  {renderSortIcon('unit')}
                </div>
              </th>

              {/* Material Cost */}
              <th 
                onClick={() => handleSort('materials')}
                className="py-3.5 px-3 w-28 text-right cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Material (₹)</span>
                  {renderSortIcon('materials')}
                </div>
              </th>

              {/* Labor Cost */}
              <th 
                onClick={() => handleSort('labor')}
                className="py-3.5 px-3 w-28 text-right cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Labor (₹)</span>
                  {renderSortIcon('labor')}
                </div>
              </th>

              {/* Total Cost */}
              <th 
                onClick={() => handleSort('totalCost')}
                className="py-3.5 px-3 w-32 text-right cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
                title="Total Cost = Material + Labor. Editing auto-splits 65% Material / 35% Labor."
              >
                <div className="flex items-center justify-end gap-1.5 text-blue-700 font-extrabold">
                  <span>Total Cost (₹)</span>
                  {renderSortIcon('totalCost')}
                </div>
              </th>

              {/* Margin */}
              <th 
                onClick={() => handleSort('margin')}
                className="py-3.5 px-3 w-24 text-right cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Margin %</span>
                  {renderSortIcon('margin')}
                </div>
              </th>

              {/* Sell Price */}
              <th 
                onClick={() => handleSort('sellPrice')}
                className="py-3.5 px-4 w-32 text-right cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
                title="Selling Rate = Cost * (1 + Margin%). Editing auto-adjusts margin."
              >
                <div className="flex items-center justify-end gap-1.5 text-slate-900 font-black">
                  <span>Sell Price (₹)</span>
                  {renderSortIcon('sellPrice')}
                </div>
              </th>

              {/* Qty Coeff */}
              <th 
                onClick={() => handleSort('areaMultiplierCoefficient')}
                className="py-3.5 px-2.5 w-20 text-center cursor-pointer group/col hover:bg-slate-100/60 transition-colors"
                title="Area multiplier coefficient used when generating BOQs from room dimensions"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Coeff</span>
                  {renderSortIcon('areaMultiplierCoefficient')}
                </div>
              </th>

              {/* Actions */}
              <th className="py-3.5 px-3 w-20 text-right">
                <span>Actions</span>
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 text-xs">
            {sortedItems.map((item) => {
              const isSelected = selectedItemIds.has(item.id);
              const isExpanded = expandedItemIds.has(item.id);
              const totalCost = (item.materials || 0) + (item.labor || 0);
              const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
              const isHighlighted = highlightedBankItemId === item.id;
              const projectCount = projectCountMap.get(item.id) || 0;

              return (
                <React.Fragment key={item.id}>
                  <tr 
                    id={`bank-row-${item.id}`}
                    className={`transition-colors group hover:bg-slate-50/80 ${
                      isSelected
                        ? 'bg-sky-50/60'
                        : isHighlighted
                        ? 'bg-amber-50/60'
                        : 'bg-white'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectItem(item.id)}
                        className="rounded border-slate-300 text-[#0066CC] focus:ring-[#0066CC] cursor-pointer"
                      />
                    </td>

                    {/* Item Name & Specs */}
                    <td className="py-2.5 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.name || ''}
                            onChange={(e) => handleFieldChange(item, 'name', e.target.value)}
                            placeholder="Item Name (e.g. Wardrobe with Loft)"
                            className="font-extrabold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#0066CC] rounded px-1.5 py-0.5 text-xs w-full outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.id)}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
                            title={isExpanded ? 'Hide Specs' : 'View/Edit Public & Internal Specs'}
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Inline brief specs preview if not expanded */}
                        {!isExpanded && (
                          <div className="text-[11px] text-slate-500 line-clamp-1 px-1.5">
                            {item.specs || <span className="text-slate-300 italic">No public specification entered</span>}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Linked Projects Badge */}
                    <td className="py-2.5 px-3 text-center">
                      {projectCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => onViewProjectUsage && onViewProjectUsage(item)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#0066CC] rounded-full text-[10px] font-extrabold transition-colors cursor-pointer"
                          title={`Used in ${projectCount} project(s). Click to view details.`}
                        >
                          <Building2 className="w-3 h-3" />
                          {projectCount} {projectCount === 1 ? 'Proj' : 'Projs'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-medium">0 Proj</span>
                      )}
                    </td>

                    {/* Category */}
                    <td className="py-2.5 px-3">
                      <select
                        value={item.cat || 'General'}
                        onChange={(e) => handleFieldChange(item, 'cat', e.target.value)}
                        className="w-full bg-slate-50 hover:bg-white border border-slate-200 focus:border-[#0066CC] rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                      >
                        {categories.filter(c => c !== 'All').map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </td>

                    {/* Unit */}
                    <td className="py-2.5 px-2.5 text-center">
                      <select
                        value={item.unit || 'nos'}
                        onChange={(e) => handleFieldChange(item, 'unit', e.target.value)}
                        className="bg-transparent hover:bg-white border border-transparent hover:border-slate-200 focus:border-[#0066CC] rounded px-1.5 py-1 text-xs text-center font-bold text-slate-600 outline-none cursor-pointer uppercase"
                      >
                        {UOM_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>

                    {/* Material Cost */}
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min="0"
                        value={item.materials || 0}
                        onChange={(e) => handleFieldChange(item, 'materials', parseFloat(e.target.value) || 0)}
                        className="w-full text-right font-mono text-xs text-slate-700 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#0066CC] rounded px-1.5 py-1 outline-none transition-all"
                      />
                    </td>

                    {/* Labor Cost */}
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min="0"
                        value={item.labor || 0}
                        onChange={(e) => handleFieldChange(item, 'labor', parseFloat(e.target.value) || 0)}
                        className="w-full text-right font-mono text-xs text-slate-700 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#0066CC] rounded px-1.5 py-1 outline-none transition-all"
                      />
                    </td>

                    {/* Total Cost (65/35 smart splitter) */}
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min="0"
                        value={totalCost}
                        onChange={(e) => handleTotalCostChange(item, parseFloat(e.target.value) || 0)}
                        className="w-full text-right font-mono text-xs font-bold text-blue-700 bg-blue-50/40 hover:bg-blue-50 focus:bg-white border border-transparent hover:border-blue-200 focus:border-blue-500 rounded px-1.5 py-1 outline-none transition-all"
                        title="Editing Total Cost auto-splits 65% Material / 35% Labor"
                      />
                    </td>

                    {/* Margin % */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={item.margin || 0}
                          onChange={(e) => handleFieldChange(item, 'margin', parseFloat(e.target.value) || 0)}
                          className={`w-14 text-right font-mono text-xs font-bold rounded px-1 py-1 border border-transparent hover:border-slate-200 focus:border-[#0066CC] outline-none transition-all ${
                            (item.margin || 0) >= 20
                              ? 'text-emerald-700 bg-emerald-50/50'
                              : (item.margin || 0) >= 15
                              ? 'text-amber-700 bg-amber-50/50'
                              : 'text-rose-700 bg-rose-50/60 font-black'
                          }`}
                        />
                        <span className="text-[10px] text-slate-400 font-bold">%</span>
                      </div>
                    </td>

                    {/* Sell Price (Reverse Calculation) */}
                    <td className="py-2.5 px-4 text-right">
                      <input
                        type="number"
                        min="0"
                        value={Math.round(sellPrice)}
                        onChange={(e) => handleSellPriceChange(item, parseFloat(e.target.value) || 0)}
                        className="w-full text-right font-mono text-xs font-black text-slate-900 bg-slate-50/60 hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0066CC] rounded px-1.5 py-1 outline-none transition-all"
                        title="Selling Price = Cost * (1 + Margin%). Editing auto-updates margin %."
                      />
                    </td>

                    {/* Qty Multiplier Coeff */}
                    <td className="py-2.5 px-2.5 text-center">
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={item.areaMultiplierCoefficient || 1}
                        onChange={(e) => handleFieldChange(item, 'areaMultiplierCoefficient', parseFloat(e.target.value) || 1)}
                        className="w-14 text-center font-mono text-xs font-bold text-[#0066CC] bg-sky-50/50 hover:bg-white focus:bg-white border border-transparent hover:border-sky-200 focus:border-[#0066CC] rounded px-1 py-1 outline-none transition-all"
                        title="Area multiplier coefficient"
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleAiCostSplit(item)}
                          disabled={splittingId === item.id}
                          className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                          title="AI Cost Split (Derive Material vs Labor)"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${splittingId === item.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateItem(item)}
                          className="p-1 text-slate-400 hover:text-[#0066CC] hover:bg-sky-50 rounded transition-colors"
                          title="Duplicate Item"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Specifications Row */}
                  {isExpanded && (
                    <tr className="bg-slate-50/80 border-b border-slate-200/80">
                      <td colSpan={12} className="p-4 pl-12 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Public Concept Specs (L1/L2) */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                              Public Concept Specs (L1/L2 Proposal)
                            </label>
                            <textarea
                              value={item.specs || ''}
                              onChange={(e) => handleFieldChange(item, 'specs', e.target.value)}
                              placeholder="e.g. Commercial ply with 1mm laminate, Soft-close Hettich hinges..."
                              className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0066CC] h-18 resize-none shadow-2xs"
                            />
                          </div>

                          {/* Internal Execution Docs (L3) */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1">
                              Internal Execution Docs (Post-Signoff / Site Portal)
                            </label>
                            <textarea
                              value={item.internalSpecs || ''}
                              onChange={(e) => handleFieldChange(item, 'internalSpecs', e.target.value)}
                              placeholder="e.g. Factory fabrication cut-list, carcass joinery details, site checklist notes..."
                              className="w-full p-2 bg-amber-50/40 border border-amber-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 h-18 resize-none shadow-2xs"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BankSpreadsheetTable;
