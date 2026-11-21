import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Item, AIStrategy, FullProjectData } from '../../types';
import { UOM_OPTIONS } from '../../constants';
import { calculateSellPrice } from '../../lib/utils';
import { splitCost, isAiAvailable } from '../../services/geminiService';
import { bankUsageIndex, projectsUsingItem } from '../../lib/bankUsage';
import { LABEL } from '../ui/kit';
import { drawOf, standardSizeOf, canHaveSize } from '../../lib/playground/pieces';
import { ftin } from '../../lib/playground/geometry';
import { basisOfUnit } from '../../lib/boqSize';
import { EASE } from '../people/PeopleBits';
import { Trash2, Copy, Sparkles, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Building2, Lock } from '@/lib/lucide-shim';

/*
  The Item bank as a sheet (DESIGN.md "Item bank motion").

  Three things made it heavy to work in, and none of them was how it looked:

  - Every keystroke drew all sixty rows again, because a change to one item
    makes a new bank. Each row is now remembered (`Row`), so typing in one row
    draws that row.
  - The rows were sorted again on every keystroke, so renaming an item while
    sorted by name sent the row away from under the cursor. The order is now
    worked out when the sort or the set of rows changes, not while typing.
  - A number could not be emptied to type a new one: it snapped to 0. A number
    field now keeps what is being typed until the cursor leaves it.

  Enter moves down the column and Shift+Enter up, as in a sheet.
*/

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
  /** How many projects use each item, when the screen has already counted. Without it the sheet counts for itself. */
  projectCounts?: Map<string, number>;
  /** Opens the item's drawer at its standard size ("On the plan"). Without it the sheet shows the size and does not open it. */
  onOpenSize?: (id: string) => void;
}

export type SortField = 'name' | 'cat' | 'unit' | 'materials' | 'labor' | 'totalCost' | 'margin' | 'sellPrice' | 'areaMultiplierCoefficient' | 'projectUsage';

/* One field in a row: no box until it is pointed at or typed in. */
const CELL = 'w-full bg-transparent rounded-md px-1.5 py-1 text-xs outline-none border border-transparent hover:border-slate-200 hover:bg-white focus:bg-white focus:border-[#3D52A0] focus:ring-2 focus:ring-[#3D52A0]/20 transition-colors';
const ICON_BUTTON = 'p-1.5 rounded-lg text-slate-400 transition-colors hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 disabled:opacity-50';

/** A number that keeps what is being typed, so it can be emptied and retyped; the item still changes as you type. */
const NumCell: React.FC<{
  value: number;
  onCommit: (n: number) => void;
  col: string;
  label: string;
  /** What an emptied field means. */
  empty?: number;
  step?: string;
  min?: string;
  title?: string;
  className?: string;
}> = ({ value, onCommit, col, label, empty = 0, step, min = '0', title, className = '' }) => {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      data-col={col}
      aria-label={label}
      title={title}
      step={step}
      min={min}
      value={draft ?? String(value)}
      onFocus={(e) => { setDraft(String(value)); e.currentTarget.select(); }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        onCommit(Number.isNaN(n) ? empty : n);
      }}
      onBlur={() => setDraft(null)}
      className={`${CELL} tabular-nums ${className}`}
    />
  );
};

interface RowActions {
  update: (id: string, item: Item) => void;
  remove: (id: string) => void;
  duplicate: (item: Item) => void;
  toggleSelect: (id: string) => void;
  toggleExpand: (id: string) => void;
  usage: (item: Item) => void;
  split: (item: Item) => void;
  /** Opens the item's standard size; absent where the screen has no drawer. */
  size?: (id: string) => void;
}

interface RowProps {
  item: Item;
  selected: boolean;
  highlighted: boolean;
  expanded: boolean;
  projectCount: number;
  categories: string[];
  aiOn: boolean;
  splitting: boolean;
  delay: number;
  still: boolean;
  act: RowActions;
}

const Row = React.memo<RowProps>(({ item, selected, highlighted, expanded, projectCount, categories, aiOn, splitting, delay, still, act }) => {
  const totalCost = (Number(item.materials) || 0) + (Number(item.labor) || 0);
  const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
  const margin = Number(item.margin) || 0;
  const set = (field: keyof Item, val: any) => act.update(item.id, { ...item, [field]: val });
  const name = item.name || 'this item';
  /* The standard size (lib/playground/pieces): shown in place of the room factor, which a sized item does not use. */
  const standard = standardSizeOf(item);
  const draw = standard ? drawOf(item) : null;
  const sizeLabel = standard && draw
    ? `${ftin(draw.w)}${basisOfUnit(item.unit) === 'area' ? ` × ${ftin(draw.h)}` : ''}`
    : canHaveSize(item) ? 'Set size' : null;

  return (
    <>
      <tr
        id={`bank-row-${item.id}`}
        data-row
        className={`group hud-row-in transition-colors ${selected ? 'bg-[#3D52A0]/5' : highlighted ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
        style={{ animationDelay: `${delay}ms` }}
      >
        <td className={`py-2 px-3 text-center transition-shadow ${selected ? 'shadow-[inset_3px_0_0_#3D52A0]' : ''}`}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => act.toggleSelect(item.id)}
            aria-label={`Select ${name}`}
            className="rounded border-slate-300 text-[#3D52A0] focus:ring-[#3D52A0] cursor-pointer"
          />
        </td>

        <td className="py-2 px-2">
          <div className="flex items-center gap-1">
            <input
              type="text"
              data-col="name"
              aria-label="Item name"
              title={item.name || undefined}
              value={item.name || ''}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Item name, e.g. Wardrobe with loft"
              className={`${CELL} font-bold text-slate-800 placeholder:font-semibold placeholder:text-slate-300`}
            />
            <button
              type="button"
              onClick={() => act.toggleExpand(item.id)}
              aria-expanded={expanded}
              aria-label={expanded ? `Hide the specification of ${name}` : `Open the specification of ${name}`}
              title={expanded ? 'Hide the specification' : 'Open the specification and internal notes'}
              className={`${ICON_BUTTON} shrink-0`}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180 text-[#3D52A0]' : ''}`} />
            </button>
          </div>
          {!expanded && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => act.toggleExpand(item.id)}
              className="block w-full text-left px-1.5 text-[11px] text-slate-500 truncate hover:text-slate-700"
            >
              {item.specs || <span className="text-slate-400">No specification yet</span>}
            </button>
          )}
        </td>

        <td className="py-2 px-2 text-center">
          {projectCount > 0 ? (
            <button
              type="button"
              onClick={() => act.usage(item)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-[10px] font-bold tabular-nums whitespace-nowrap transition-colors hover:bg-[#3D52A0]/20"
              title={`Used in ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}. Open the list.`}
            >
              <Building2 className="w-3 h-3" aria-hidden />
              {projectCount}
            </button>
          ) : (
            <span className="text-xs text-slate-300" title="No project uses this item">–</span>
          )}
        </td>

        <td className="py-2 px-2">
          <select
            data-col="cat"
            aria-label="Category"
            value={item.cat || 'General'}
            onChange={(e) => set('cat', e.target.value)}
            className={`${CELL} font-semibold text-slate-700 cursor-pointer`}
          >
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </td>

        <td className="py-2 px-2">
          <select
            data-col="unit"
            aria-label="Unit"
            value={item.unit || 'nos'}
            onChange={(e) => set('unit', e.target.value)}
            className={`${CELL} font-semibold text-slate-600 uppercase cursor-pointer`}
          >
            {UOM_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </td>

        <td className="py-2 px-2">
          <NumCell col="materials" label="Material cost" value={Number(item.materials) || 0} onCommit={(n) => set('materials', n)} className="text-right text-slate-700" />
        </td>

        <td className="py-2 px-2">
          <NumCell col="labor" label="Labour cost" value={Number(item.labor) || 0} onCommit={(n) => set('labor', n)} className="text-right text-slate-700" />
        </td>

        <td className="py-2 px-2">
          <NumCell
            col="totalCost"
            label="Total cost"
            value={totalCost}
            /* A cost typed as one figure is split 65% material, 35% labour. */
            onCommit={(n) => act.update(item.id, { ...item, materials: Math.round(n * 0.65), labor: Math.round(n * 0.35) })}
            title="Material plus labour. Typing a total splits it 65% material, 35% labour."
            className="text-right font-bold text-slate-800 !bg-slate-100/70 focus:!bg-white"
          />
        </td>

        <td className="py-2 px-2">
          <div className="flex items-center justify-end gap-1">
            <NumCell
              col="margin"
              label="Margin percent"
              step="0.5"
              value={margin}
              onCommit={(n) => set('margin', n)}
              className={`text-right font-bold ${margin >= 20 ? 'text-emerald-700 !bg-emerald-50' : margin >= 15 ? 'text-amber-700 !bg-amber-50' : 'text-rose-700 !bg-rose-50'} focus:!bg-white`}
            />
            <span className="text-[10px] font-bold text-slate-400" aria-hidden>%</span>
          </div>
        </td>

        <td className="py-2 px-2">
          <NumCell
            col="sellPrice"
            label="Sell price"
            value={Math.round(sellPrice)}
            /* A price typed here is turned back into the margin that gives it. */
            onCommit={(n) => { if (totalCost > 0) set('margin', parseFloat((((n / totalCost) - 1) * 100).toFixed(2))); }}
            title="Cost plus margin. Typing a price sets the margin that gives it."
            className="text-right font-black text-slate-800"
          />
        </td>

        <td className="py-2 px-2 text-center">
          {/* A thing that is made starts at its standard size; only a surface or a service is sized by a factor on the room. */}
          {sizeLabel ? (
            <button type="button" onClick={() => act.size?.(item.id)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${standard ? 'bg-[#3D52A0]/10 text-[#3D52A0] hover:bg-[#3D52A0]/20' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
              title={standard ? `The standard size every new BOQ starts ${name} at. Open it to change` : `No standard size yet: a new BOQ sizes ${name} from the room. Open it to set one`}
              aria-label={standard ? `Standard size of ${name}: ${sizeLabel}` : `Set the standard size of ${name}`}>
              {sizeLabel}
            </button>
          ) : (
          <NumCell
            col="coeff"
            label="Area factor"
            step="0.05"
            min="0.1"
            empty={1}
            value={Number(item.areaMultiplierCoefficient) || 1}
            onCommit={(n) => set('areaMultiplierCoefficient', n || 1)}
            title="Multiplies the quantity worked out from a room's size"
            className="text-center font-semibold text-slate-600"
          />
          )}
        </td>

        <td className="py-2 pl-1 pr-3">
          {/* Dim until the row is pointed at or tabbed into, but never hidden: a tablet has no hover. */}
          <div className="flex items-center justify-end gap-0.5 opacity-50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {aiOn && (
              <button type="button" onClick={() => act.split(item)} disabled={splitting} className={ICON_BUTTON}
                title="Split the cost into material and labour with AI" aria-label={`Split the cost of ${name} with AI`}>
                <Sparkles className={`w-3.5 h-3.5 ${splitting ? 'motion-safe:animate-spin' : ''}`} />
              </button>
            )}
            <button type="button" onClick={() => act.duplicate(item)} className={ICON_BUTTON} title="Duplicate" aria-label={`Duplicate ${name}`}>
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => act.remove(item.id)} title="Delete" aria-label={`Delete ${name}`}
              className={`${ICON_BUTTON} hover:!text-rose-600 hover:!bg-rose-50`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.tr key="specs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: still ? 0 : 0.2 }} className="bg-slate-50">
            <td colSpan={12} className="p-0">
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: still ? 0 : 0.26, ease: EASE }} className="overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 py-4 pl-12">
                  <label className="block">
                    <span className={`${LABEL} block mb-1.5`}>Specification the client sees</span>
                    <textarea
                      value={item.specs || ''}
                      onChange={(e) => set('specs', e.target.value)}
                      placeholder="e.g. Commercial ply with 1mm laminate, soft-close hinges"
                      className="w-full h-32 resize-y px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
                    />
                  </label>
                  <label className="block">
                    <span className={`${LABEL} flex items-center gap-1 mb-1.5`}><Lock className="w-3 h-3" aria-hidden />Internal execution notes</span>
                    <textarea
                      value={item.internalSpecs || ''}
                      onChange={(e) => set('internalSpecs', e.target.value)}
                      placeholder="e.g. Factory cut-list, carcass joinery, site checklist. The client never sees this."
                      className="w-full h-32 resize-y px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
                    />
                  </label>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
});
Row.displayName = 'BankSpreadsheetRow';

/* A column head: a button that sorts by its column, and says so. */
const Head: React.FC<{
  field: SortField;
  sort: { field: SortField; asc: boolean; onSort: (f: SortField) => void };
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  title?: string;
}> = ({ field, sort, children, align = 'left', className = '', title }) => {
  const on = sort.field === field;
  const Arrow = !on ? ArrowUpDown : sort.asc ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={on ? (sort.asc ? 'ascending' : 'descending') : 'none'} className={`p-0 ${className}`}>
      <button
        type="button"
        onClick={() => sort.onSort(field)}
        title={title}
        className={`group/col w-full flex items-center gap-1 px-2 py-3 ${LABEL} transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:bg-slate-100 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''} ${on ? '!text-[#3D52A0]' : ''}`}
      >
        <span className="whitespace-nowrap">{children}</span>
        <Arrow className={`w-3 h-3 shrink-0 transition-opacity ${on ? '' : 'opacity-0 group-hover/col:opacity-60 group-focus-visible/col:opacity-60'}`} aria-hidden />
      </button>
    </th>
  );
};

/* The first rows rise in one after another; a page loaded later starts its own count. */
const STAGGER_ROWS = 14;
const PAGE = 60;

const BankSpreadsheetTable: React.FC<BankSpreadsheetTableProps> = (props) => {
  const { items, selectedItemIds, onToggleSelectAll, isAllSelected, aiStrategy, categories, highlightedBankItemId, projects = [], projectCounts } = props;
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const still = !!useReducedMotion();
  const aiOn = isAiAvailable();

  /* How many projects use each item: the screen's count when it has one, else counted here in one pass. */
  const ownCounts = useMemo(() => {
    if (projectCounts) return null;
    const index = bankUsageIndex(projects);
    return new Map(items.map((i) => [i.id, projectsUsingItem(index, i).size] as [string, number]));
  }, [projectCounts, items, projects]);
  const counts = projectCounts || ownCounts!;

  /*
    The row's buttons, as one object that never changes, so a remembered row is
    not drawn again just because the screen above made new functions. Each
    calls whatever the screen passed most recently.
  */
  const latest = useRef(props);
  latest.current = props;
  const strategy = useRef(aiStrategy);
  strategy.current = aiStrategy;
  const act = useMemo<RowActions>(() => ({
    update: (id, item) => latest.current.onUpdateItem(id, item),
    remove: (id) => latest.current.onDeleteItem(id),
    duplicate: (item) => latest.current.onDuplicateItem(item),
    toggleSelect: (id) => latest.current.onToggleSelectItem(id),
    usage: (item) => latest.current.onViewProjectUsage?.(item),
    size: (id) => latest.current.onOpenSize?.(id),
    toggleExpand: (id) => setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }),
    split: async (item) => {
      if (!isAiAvailable()) return;
      setSplittingId(item.id);
      try {
        const totalCost = (Number(item.materials) || 0) + (Number(item.labor) || 0);
        const { materials, labor } = await splitCost(item, totalCost, strategy.current);
        latest.current.onUpdateItem(item.id, { ...item, materials, labor });
      } catch (e) {
        console.error('AI Cost Split failed', e);
      } finally {
        setSplittingId(null);
      }
    },
  }), []);

  /* The same list of categories from one keystroke to the next, unless a category really changed. */
  const categoryKey = categories.join('\u0001');
  const categoryOptions = useMemo(() => categories.filter((c) => c !== 'All'), [categoryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  /*
    The order is set when the sort changes or rows come and go, and held while
    an item is edited: a row being renamed stays where it is until the sort is
    asked for again.
  */
  const idsKey = items.map((i) => i.id).join('\u0001');
  const order = useMemo(() => {
    const value = (i: Item): any => {
      if (sortField === 'totalCost') return (Number(i.materials) || 0) + (Number(i.labor) || 0);
      if (sortField === 'sellPrice') return calculateSellPrice(i.materials, i.labor, i.margin);
      if (sortField === 'projectUsage') return counts.get(i.id) || 0;
      return i[sortField as keyof Item];
    };
    return [...items].sort((a, b) => {
      const valA = value(a);
      const valB = value(b);
      if (typeof valA === 'string') {
        const comp = valA.localeCompare(String(valB || ''));
        return sortAsc ? comp : -comp;
      }
      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return sortAsc ? numA - numB : numB - numA;
    }).map((i) => i.id);
  }, [idsKey, sortField, sortAsc]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i] as [string, Item])), [items]);

  /* Enter goes down the column, Shift+Enter up. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key !== 'Enter') return;
    const el = e.target as HTMLElement;
    const col = el.getAttribute?.('data-col');
    if (!col || el.tagName === 'SELECT') return;
    let row = el.closest('tr[data-row]') as HTMLElement | null;
    do {
      row = (e.shiftKey ? row?.previousElementSibling : row?.nextElementSibling) as HTMLElement | null;
    } while (row && !row.hasAttribute('data-row'));
    const next = row?.querySelector<HTMLElement>(`[data-col="${col}"]`);
    if (!next) return;
    e.preventDefault();
    next.focus();
  };

  const sort = { field: sortField, asc: sortAsc, onSort: handleSort };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        {/* Fixed columns: the name takes what is left, and nothing is cut off at a laptop's width. */}
        <table className="w-full table-fixed text-left border-collapse min-w-[1204px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 select-none">
              <th scope="col" className="py-3 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected && items.length > 0}
                  onChange={onToggleSelectAll}
                  className="rounded border-slate-300 text-[#3D52A0] focus:ring-[#3D52A0] cursor-pointer"
                  title="Select or clear every item that passes the filters"
                  aria-label="Select every item that passes the filters"
                />
              </th>
              <Head sort={sort} field="name" >Item and specification</Head>
              <Head sort={sort} field="projectUsage" align="center" className="w-[72px]" title="How many projects use the item">Projects</Head>
              <Head sort={sort} field="cat" className="w-36">Category</Head>
              <Head sort={sort} field="unit" className="w-[104px]">Unit</Head>
              <Head sort={sort} field="materials" align="right" className="w-[88px]">Material ₹</Head>
              <Head sort={sort} field="labor" align="right" className="w-[88px]">Labour ₹</Head>
              <Head sort={sort} field="totalCost" align="right" className="w-24" title="Material plus labour">Cost ₹</Head>
              <Head sort={sort} field="margin" align="right" className="w-[92px]">Margin</Head>
              <Head sort={sort} field="sellPrice" align="right" className="w-[104px]" title="Cost plus margin">Sell price ₹</Head>
              <Head sort={sort} field="areaMultiplierCoefficient" align="center" className="w-[92px]" title="The standard size a new BOQ starts the item at. For a surface or a service, the factor on the quantity worked out from a room's size">Size / factor</Head>
              <th scope="col" className="w-[104px] px-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs" onKeyDown={onKeyDown}>
            {order.map((id, i) => {
              const item = byId.get(id);
              if (!item) return null;
              return (
                <Row
                  key={id}
                  item={item}
                  selected={selectedItemIds.has(id)}
                  highlighted={highlightedBankItemId === id}
                  expanded={expandedItemIds.has(id)}
                  projectCount={counts.get(id) || 0}
                  categories={categoryOptions}
                  aiOn={aiOn}
                  splitting={splittingId === id}
                  delay={Math.min(i % PAGE, STAGGER_ROWS) * 18}
                  still={still}
                  act={act}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BankSpreadsheetTable;
