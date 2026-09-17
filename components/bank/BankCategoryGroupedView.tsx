import React, { useState } from 'react';
import { Item, AIStrategy, FullProjectData } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import BankSpreadsheetTable from './BankSpreadsheetTable';
import { 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  Percent, 
  Sparkles, 
  TrendingUp, 
  CheckSquare,
  Square
} from 'lucide-react';

interface BankCategoryGroupedViewProps {
  items: Item[];
  selectedItemIds: Set<string>;
  onToggleSelectItem: (id: string) => void;
  onSelectCategoryItems: (category: string, select: boolean) => void;
  onUpdateItem: (id: string, updatedItem: Item) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (item: Item) => void;
  aiStrategy: AIStrategy;
  categories: string[];
  highlightedBankItemId: string | null;
  onOpenBulkModalForCategory: (category: string) => void;
  projects?: FullProjectData[];
  onViewProjectUsage?: (item: Item) => void;
}

const BankCategoryGroupedView: React.FC<BankCategoryGroupedViewProps> = ({
  items,
  selectedItemIds,
  onToggleSelectItem,
  onSelectCategoryItems,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  aiStrategy,
  categories,
  highlightedBankItemId,
  onOpenBulkModalForCategory,
  projects = [],
  onViewProjectUsage,
}) => {
  // Collapsed categories state (all expanded by default)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Group items by category
  const grouped = React.useMemo(() => {
    const map: Record<string, Item[]> = {};
    items.forEach((item) => {
      const cat = item.cat || 'General';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return map;
  }, [items]);

  const groupKeys = Object.keys(grouped).sort();

  return (
    <div className="space-y-4">
      {groupKeys.map((category) => {
        const catItems = grouped[category] || [];
        const isCollapsed = collapsedCats.has(category);
        const selectedCount = catItems.filter((i) => selectedItemIds.has(i.id)).length;
        const isAllCatSelected = catItems.length > 0 && selectedCount === catItems.length;

        // Stats for category
        const avgMargin = catItems.length > 0
          ? (catItems.reduce((sum, i) => sum + (i.margin || 0), 0) / catItems.length).toFixed(1)
          : '0.0';
        const totalCatCost = catItems.reduce(
          (sum, i) => sum + (i.materials || 0) + (i.labor || 0),
          0
        );

        return (
          <div
            key={category}
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all"
          >
            {/* Category Header */}
            <div className="p-4 bg-slate-50/80 border-b border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectCategoryItems(category, !isAllCatSelected)}
                  className="text-slate-500 hover:text-[#3D52A0] transition-colors p-1"
                  title={isAllCatSelected ? 'Deselect all items in this category' : 'Select all items in this category'}
                >
                  {isAllCatSelected ? (
                    <CheckSquare className="w-4 h-4 text-[#3D52A0]" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                <div 
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">
                    {category}
                  </h3>
                  <span className="px-2 py-0.5 bg-slate-200/70 text-slate-700 rounded-full text-[10px] font-extrabold">
                    {catItems.length} {catItems.length > 1 ? 'items' : 'item'}
                  </span>
                </div>
              </div>

              {/* Category Metrics & Actions */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-3 text-slate-600 font-semibold">
                  <span className="text-[11px]">
                    Avg Margin:{' '}
                    <strong className={Number(avgMargin) < 15 ? 'text-rose-600' : 'text-emerald-700'}>
                      {avgMargin}%
                    </strong>
                  </span>
                  <span className="text-[11px] text-slate-400">|</span>
                  <span className="text-[11px]">
                    Value: <strong>{formatCurrency(totalCatCost)}</strong>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenBulkModalForCategory(category)}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-[#3D52A0] shadow-2xs transition-colors cursor-pointer"
                >
                  Bulk Edit {category}
                </button>

                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                >
                  {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Category Table */}
            {!isCollapsed && (
              <BankSpreadsheetTable
                items={catItems}
                selectedItemIds={selectedItemIds}
                onToggleSelectItem={onToggleSelectItem}
                onToggleSelectAll={() => onSelectCategoryItems(category, !isAllCatSelected)}
                isAllSelected={isAllCatSelected}
                onUpdateItem={onUpdateItem}
                onDeleteItem={onDeleteItem}
                onDuplicateItem={onDuplicateItem}
                aiStrategy={aiStrategy}
                categories={categories}
                highlightedBankItemId={highlightedBankItemId}
                projects={projects}
                onViewProjectUsage={onViewProjectUsage}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BankCategoryGroupedView;
