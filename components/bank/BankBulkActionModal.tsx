import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Item } from '../../types';
import { UOM_OPTIONS } from '../../constants';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { Percent, TrendingUp, FolderEdit, Ruler, Check, ArrowRight, PackagePlus, Plus } from '@/lib/lucide-shim';
import { CustomBundle } from '../../hooks/useStudioSettings';
import { Button, Segmented, INPUT, LABEL } from '../ui/kit';
import BankModal from './BankModal';

/*
  Item bank → change the ticked items together (DESIGN.md "Item bank motion").

  One window, five things it can do. Each shows what the first few items
  become before anything is saved; Apply writes all of them at once.

  It opens on the action that was clicked (`initialTab`). It used to open on
  Margin whichever button was pressed, because the tab asked for was never
  passed in.
*/

export type BulkActionType = 'margin' | 'cost' | 'category' | 'uom' | 'multiplier' | 'bundle';

interface BankBulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: Item[];
  allCategories: string[];
  onApplyBulkUpdate: (updatedItems: Item[]) => void;
  onCreateCustomBundle?: (bundle: CustomBundle) => void;
  /** The action the window opens on. */
  initialTab?: BulkActionType;
}

const TABS: Array<{ id: BulkActionType; label: string; icon: React.ComponentType<any> }> = [
  { id: 'category', label: 'Category', icon: FolderEdit },
  { id: 'margin', label: 'Margin', icon: Percent },
  { id: 'cost', label: 'Rates', icon: TrendingUp },
  { id: 'uom', label: 'Unit', icon: Ruler },
  { id: 'bundle', label: 'Room kit', icon: PackagePlus },
];

const PREVIEW = 3;
const signed = (n: number) => (n > 0 ? `+${n}%` : `${n}%`);

/** A choice among a few: white, and brand when picked. */
const Pick: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode; className?: string }> = ({ on, onClick, children, className = '' }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors motion-safe:active:scale-[0.97] ${on ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'} ${className}`}>
    {children}
  </button>
);

/** A figure typed in, with a row of common values beside it. */
const Amount: React.FC<{ label: string; value: number; onChange: (n: number) => void; presets: number[]; show: (n: number) => string; hint?: string }> = ({ label, value, onChange, presets, show, hint }) => {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <label className="block">
        <span className={`${LABEL} block mb-1.5`}>{label}</span>
        <span className="flex flex-wrap items-center gap-2">
          <input type="number" step="0.5" value={draft ?? String(value)}
            onFocus={(e) => { setDraft(String(value)); e.currentTarget.select(); }}
            onChange={(e) => { setDraft(e.target.value); onChange(parseFloat(e.target.value) || 0); }}
            onBlur={() => setDraft(null)}
            className={`${INPUT} !w-28 font-bold tabular-nums`} />
          {presets.map((n) => <Pick key={n} on={value === n} onClick={() => { setDraft(null); onChange(n); }}>{show(n)}</Pick>)}
        </span>
      </label>
      {hint && <p className="text-[11px] text-slate-500 mt-1.5">{hint}</p>}
    </div>
  );
};

const BankBulkActionModal: React.FC<BankBulkActionModalProps> = ({
  isOpen,
  onClose,
  selectedItems,
  allCategories,
  onApplyBulkUpdate,
  onCreateCustomBundle,
  initialTab = 'margin',
}) => {
  const [activeTab, setActiveTab] = useState<BulkActionType>(initialTab);
  /* Each time it opens, it opens on what was asked for. */
  useEffect(() => { if (isOpen) setActiveTab(TABS.some((t) => t.id === initialTab) ? initialTab : 'margin'); }, [isOpen, initialTab]);

  // Margin states
  const [marginMode, setMarginMode] = useState<'set' | 'adjust'>('set');
  const [targetMargin, setTargetMargin] = useState<number>(25);
  const [marginDelta, setMarginDelta] = useState<number>(5);

  // Cost states
  const [costTarget, setCostTarget] = useState<'all' | 'materials' | 'labor'>('all');
  const [costPercentChange, setCostPercentChange] = useState<number>(10);

  // Category state
  const categories = useMemo(() => allCategories.filter((c) => c !== 'All'), [allCategories]);
  const [targetCategory, setTargetCategory] = useState<string>(categories[0] || 'General');
  const [isCustomCategory, setIsCustomCategory] = useState<boolean>(false);
  const [customCategoryName, setCustomCategoryName] = useState<string>('');

  // UOM state
  const [targetUom, setTargetUom] = useState<string>(UOM_OPTIONS[0] || 'nos');

  // Multiplier state
  const [targetMultiplier] = useState<number>(1.0);

  // Bundle state
  const [bundleName, setBundleName] = useState<string>('');
  const [bundleDesc, setBundleDesc] = useState<string>('');

  // Compute preview of updated items
  const previewUpdatedItems = useMemo(() => {
    return selectedItems.map((item) => {
      const next = { ...item };

      if (activeTab === 'margin') {
        if (marginMode === 'set') {
          next.margin = Number(targetMargin) || 0;
        } else {
          next.margin = Math.max(0, parseFloat(((item.margin || 0) + (Number(marginDelta) || 0)).toFixed(2)));
        }
      } else if (activeTab === 'cost') {
        const factor = 1 + (Number(costPercentChange) || 0) / 100;
        if (costTarget === 'all') {
          next.materials = Math.round((item.materials || 0) * factor);
          next.labor = Math.round((item.labor || 0) * factor);
        } else if (costTarget === 'materials') {
          next.materials = Math.round((item.materials || 0) * factor);
        } else if (costTarget === 'labor') {
          next.labor = Math.round((item.labor || 0) * factor);
        }
      } else if (activeTab === 'category') {
        const cat = isCustomCategory ? customCategoryName.trim() : targetCategory;
        if (cat) next.cat = cat;
      } else if (activeTab === 'uom') {
        next.unit = targetUom;
      } else if (activeTab === 'multiplier') {
        next.areaMultiplierCoefficient = Number(targetMultiplier) || 1;
      }

      return next;
    });
  }, [
    selectedItems,
    activeTab,
    marginMode,
    targetMargin,
    marginDelta,
    costTarget,
    costPercentChange,
    isCustomCategory,
    customCategoryName,
    targetCategory,
    targetUom,
    targetMultiplier,
  ]);

  if (!isOpen) return null;

  const count = selectedItems.length;
  const things = count === 1 ? 'item' : 'items';
  /* What stops Apply, said on the button rather than in an alert after it is pressed. */
  const blocked = activeTab === 'bundle' && !bundleName.trim() ? 'Give the kit a name'
    : activeTab === 'category' && isCustomCategory && !customCategoryName.trim() ? 'Type the new category'
    : null;

  const handleApply = () => {
    if (blocked) return;
    if (activeTab === 'bundle') {
      onCreateCustomBundle?.({
        id: `custom-bundle-${Date.now()}`,
        name: bundleName.trim(),
        description: bundleDesc.trim() || `Made from ${count} ${things} in the bank.`,
        itemIds: selectedItems.map((i) => i.id),
      });
      onClose();
      return;
    }
    onApplyBulkUpdate(previewUpdatedItems);
    onClose();
  };

  /* Old value, an arrow, new value: the new one in brand when it differs. */
  const change = (from: React.ReactNode, to: React.ReactNode, same: boolean) => (
    <span className="flex items-center gap-1.5 tabular-nums">
      <span className={same ? 'text-slate-500' : 'text-slate-400 line-through'}>{from}</span>
      <ArrowRight className="w-3 h-3 text-slate-300" aria-hidden />
      <span className={`font-bold ${same ? 'text-slate-500' : 'text-[#3D52A0]'}`}>{to}</span>
    </span>
  );

  return (
    <BankModal
      label="Change the selected items"
      title="Change the selected items"
      blurb={`${count} ${things} ticked. Nothing is saved until you apply.`}
      onClose={onClose}
      tools={
        <div role="tablist" aria-label="What to change" className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
          {TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => setActiveTab(t.id)}
                className={`group relative px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${on ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                {on && <motion.span layoutId="bank-bulk-tab" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative inline-flex items-center gap-1.5">
                  <t.icon className={`w-3.5 h-3.5 transition-transform duration-300 ${on ? 'text-[#3D52A0] scale-110' : 'text-slate-400 group-hover:-rotate-12'}`} aria-hidden />
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={handleApply} disabled={!!blocked} title={blocked || undefined}>
            {activeTab === 'bundle' ? 'Save room kit' : `Apply to ${count} ${things}`}
          </Button>
        </>
      }
    >
      <div key={activeTab} className="hud-swap space-y-5" role="tabpanel">
        {activeTab === 'margin' && (
          <>
            <Segmented label="How to change the margin" value={marginMode} onChange={setMarginMode}
              options={[{ id: 'set', label: 'Set one margin' }, { id: 'adjust', label: 'Raise or lower' }]} />
            {marginMode === 'set' ? (
              <Amount label="Margin for every item (%)" value={targetMargin} onChange={setTargetMargin} presets={[15, 20, 25, 30, 35]} show={(n) => `${n}%`} />
            ) : (
              <Amount label="Add to each item's margin (%)" value={marginDelta} onChange={setMarginDelta} presets={[-5, -2, 2, 5, 10]} show={signed}
                hint="A margin never goes below 0%." />
            )}
          </>
        )}

        {activeTab === 'cost' && (
          <>
            <div>
              <span className={`${LABEL} block mb-1.5`}>Which cost</span>
              <Segmented label="Which cost" value={costTarget} onChange={setCostTarget}
                options={[{ id: 'all', label: 'Material and labour' }, { id: 'materials', label: 'Material only' }, { id: 'labor', label: 'Labour only' }]} />
            </div>
            <Amount label="Change by (%)" value={costPercentChange} onChange={setCostPercentChange} presets={[-10, -5, 5, 8, 10, 15]} show={signed}
              hint="For a vendor price rise or a new rate card. Margins stay as they are, so sell prices move with the cost." />
          </>
        )}

        {activeTab === 'category' && (
          <div>
            <span className={`${LABEL} block mb-1.5`}>Move to</span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <Pick key={cat} on={!isCustomCategory && targetCategory === cat} onClick={() => { setTargetCategory(cat); setIsCustomCategory(false); }}>{cat}</Pick>
              ))}
              <Pick on={isCustomCategory} onClick={() => setIsCustomCategory(true)} className="inline-flex items-center gap-1">
                <Plus className="w-3 h-3" aria-hidden />New category
              </Pick>
            </div>
            {isCustomCategory && (
              <label className="block mt-3 hud-row-in">
                <span className={`${LABEL} block mb-1.5`}>New category</span>
                <input autoFocus type="text" placeholder="e.g. Automation, Signage, Landscaping" value={customCategoryName}
                  onChange={(e) => setCustomCategoryName(e.target.value)} className={INPUT} />
              </label>
            )}
          </div>
        )}

        {activeTab === 'uom' && (
          <div>
            <span className={`${LABEL} block mb-1.5`}>Unit for every item</span>
            <div className="flex flex-wrap gap-1.5">
              {UOM_OPTIONS.map((uom) => <Pick key={uom} on={targetUom === uom} onClick={() => setTargetUom(uom)} className="uppercase min-w-[4rem]">{uom}</Pick>)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Only the unit changes. Rates are not converted.</p>
          </div>
        )}

        {activeTab === 'bundle' && (
          <>
            <p className="text-xs text-slate-500">
              The {count} ticked {things} become a room kit, so they are added to a room together in one click. The items themselves are not changed.
            </p>
            <label className="block">
              <span className={`${LABEL} block mb-1.5`}>Kit name</span>
              <input autoFocus type="text" placeholder="e.g. Master bedroom" value={bundleName} onChange={(e) => setBundleName(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className={`${LABEL} block mb-1.5`}>Description (optional)</span>
              <textarea placeholder="What the kit covers" value={bundleDesc} onChange={(e) => setBundleDesc(e.target.value)} className={`${INPUT} h-20 resize-none`} />
            </label>
            <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
              {selectedItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <span className="flex-1 min-w-0 font-semibold text-slate-700 truncate">{item.name || 'Unnamed item'}</span>
                  <span className="text-slate-500 shrink-0">{item.cat || 'General'}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* What the first few become. */}
        {activeTab !== 'bundle' && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className={LABEL}>What changes</span>
              {count > PREVIEW && <span className="text-[11px] text-slate-500">First {PREVIEW} of {count}</span>}
            </div>
            <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {selectedItems.slice(0, PREVIEW).map((item, idx) => {
                const updated = previewUpdatedItems[idx];
                if (!updated) return null;
                const origCost = (item.materials || 0) + (item.labor || 0);
                const newCost = (updated.materials || 0) + (updated.labor || 0);
                const origSell = calculateSellPrice(item.materials, item.labor, item.margin);
                const newSell = calculateSellPrice(updated.materials, updated.labor, updated.margin);
                return (
                  <li key={item.id} className="hud-row-in flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-xs" style={{ animationDelay: `${idx * 30}ms` }}>
                    <span className="flex-1 basis-40 min-w-0">
                      <span className="block font-semibold text-slate-800 truncate">{item.name || 'Unnamed item'}</span>
                      <span className="block text-[11px] text-slate-500">{item.cat || 'General'} · {item.unit}</span>
                    </span>
                    {activeTab === 'margin' && change(`${item.margin || 0}%`, `${updated.margin}%`, (item.margin || 0) === updated.margin)}
                    {activeTab === 'cost' && change(formatCurrency(origCost), formatCurrency(newCost), origCost === newCost)}
                    {activeTab === 'category' && change(item.cat || 'General', updated.cat || 'General', (item.cat || 'General') === (updated.cat || 'General'))}
                    {activeTab === 'uom' && change(item.unit, updated.unit, item.unit === updated.unit)}
                    <span className="text-right shrink-0 w-24">
                      <span className={`${LABEL} block`}>Sell price</span>
                      <span className={`font-bold tabular-nums ${Math.round(origSell) === Math.round(newSell) ? 'text-slate-800' : 'text-[#3D52A0]'}`}>{formatCurrency(newSell)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </BankModal>
  );
};

export default BankBulkActionModal;
