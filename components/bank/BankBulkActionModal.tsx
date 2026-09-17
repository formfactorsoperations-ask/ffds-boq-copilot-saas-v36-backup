import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Item } from '../../types';
import { UOM_OPTIONS } from '../../constants';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { 
  X, 
  Percent, 
  TrendingUp, 
  FolderEdit, 
  Ruler, 
  Layers, 
  Sparkles, 
  Check, 
  AlertTriangle,
  ArrowRight,
  PackagePlus
} from 'lucide-react';
import { CustomBundle } from '../../hooks/useStudioSettings';

export type BulkActionType = 'margin' | 'cost' | 'category' | 'uom' | 'multiplier' | 'bundle';

interface BankBulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: Item[];
  allCategories: string[];
  onApplyBulkUpdate: (updatedItems: Item[]) => void;
  onCreateCustomBundle?: (bundle: CustomBundle) => void;
}

const BankBulkActionModal: React.FC<BankBulkActionModalProps> = ({
  isOpen,
  onClose,
  selectedItems,
  allCategories,
  onApplyBulkUpdate,
  onCreateCustomBundle,
}) => {
  const [activeTab, setActiveTab] = useState<BulkActionType>('margin');

  // Margin states
  const [marginMode, setMarginMode] = useState<'set' | 'adjust'>('set');
  const [targetMargin, setTargetMargin] = useState<number>(25);
  const [marginDelta, setMarginDelta] = useState<number>(5);

  // Cost states
  const [costTarget, setCostTarget] = useState<'all' | 'materials' | 'labor'>('all');
  const [costPercentChange, setCostPercentChange] = useState<number>(10);

  // Category state
  const [targetCategory, setTargetCategory] = useState<string>(allCategories[0] || 'General');
  const [isCustomCategory, setIsCustomCategory] = useState<boolean>(false);
  const [customCategoryName, setCustomCategoryName] = useState<string>('');

  // UOM state
  const [targetUom, setTargetUom] = useState<string>(UOM_OPTIONS[0] || 'nos');

  // Multiplier state
  const [targetMultiplier, setTargetMultiplier] = useState<number>(1.0);

  // Bundle state
  const [bundleName, setBundleName] = useState<string>('');
  const [bundleDesc, setBundleDesc] = useState<string>('');

  // Compute preview of updated items
  const previewUpdatedItems = useMemo(() => {
    return selectedItems.map((item) => {
      let next = { ...item };

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
    targetMultiplier
  ]);

  const handleApply = () => {
    if (activeTab === 'bundle') {
      if (!bundleName.trim()) {
        alert('Please enter a name for the new room bundle.');
        return;
      }
      if (onCreateCustomBundle) {
        const newBundle: CustomBundle = {
          id: `custom-bundle-${Date.now()}`,
          name: bundleName.trim(),
          description: bundleDesc.trim() || `Bundle created from ${selectedItems.length} catalog items.`,
          itemIds: selectedItems.map((i) => i.id),
        };
        onCreateCustomBundle(newBundle);
      }
      onClose();
      return;
    }

    onApplyBulkUpdate(previewUpdatedItems);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-[#3D52A0]/10 text-[#3D52A0] rounded-full text-xs font-black uppercase tracking-wider">
                Bulk Studio Action
              </span>
              <span className="text-xs font-bold text-slate-500">
                {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight mt-1">
              Bulk Catalog Management
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1 px-6 pt-4 bg-white border-b border-slate-100 overflow-x-auto">
          <button
            onClick={() => setActiveTab('margin')}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'margin'
                ? 'border-[#3D52A0] text-[#3D52A0]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Percent className="w-3.5 h-3.5" /> Margin Revision
          </button>
          <button
            onClick={() => setActiveTab('cost')}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'cost'
                ? 'border-[#3D52A0] text-[#3D52A0]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Rate Inflation
          </button>
          <button
            onClick={() => setActiveTab('category')}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'category'
                ? 'border-[#3D52A0] text-[#3D52A0]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FolderEdit className="w-3.5 h-3.5" /> Re-assign Category
          </button>
          <button
            onClick={() => setActiveTab('uom')}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'uom'
                ? 'border-[#3D52A0] text-[#3D52A0]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" /> Standardize Unit
          </button>
          <button
            onClick={() => setActiveTab('bundle')}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'bundle'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PackagePlus className="w-3.5 h-3.5" /> Package to Bundle
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* TAB 1: MARGIN */}
          {activeTab === 'margin' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMarginMode('set')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    marginMode === 'set'
                      ? 'border-[#3D52A0] bg-sky-50/50 ring-2 ring-sky-100'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-extrabold text-slate-900">Set Uniform Margin</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Apply exact % to all selected items</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMarginMode('adjust')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    marginMode === 'adjust'
                      ? 'border-[#3D52A0] bg-sky-50/50 ring-2 ring-sky-100'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-extrabold text-slate-900">Adjust Existing Margin</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Add or subtract delta (+/- %)</div>
                </button>
              </div>

              {marginMode === 'set' ? (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                    Target Margin Percentage (%)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={targetMargin}
                      onChange={(e) => setTargetMargin(parseFloat(e.target.value) || 0)}
                      className="w-32 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3D52A0]"
                    />
                    <div className="flex items-center gap-1.5">
                      {[15, 20, 25, 30, 35].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTargetMargin(preset)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                    Margin Delta Adjustment (+/- %)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      value={marginDelta}
                      onChange={(e) => setMarginDelta(parseFloat(e.target.value) || 0)}
                      className="w-32 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3D52A0]"
                    />
                    <div className="flex items-center gap-1.5">
                      {[-5, -2, 2, 5, 10].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setMarginDelta(preset)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                        >
                          {preset > 0 ? `+${preset}%` : `${preset}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COST INFLATION */}
          {activeTab === 'cost' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-2">
                  Apply Inflation / Rate Revision To
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCostTarget('all')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      costTarget === 'all'
                        ? 'border-[#3D52A0] bg-sky-50/50 text-[#3D52A0]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Both (Mat + Lab)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCostTarget('materials')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      costTarget === 'materials'
                        ? 'border-[#3D52A0] bg-sky-50/50 text-[#3D52A0]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Material Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setCostTarget('labor')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      costTarget === 'labor'
                        ? 'border-[#3D52A0] bg-sky-50/50 text-[#3D52A0]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Labor Only
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                  Percentage Cost Shift (%)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.5"
                    value={costPercentChange}
                    onChange={(e) => setCostPercentChange(parseFloat(e.target.value) || 0)}
                    className="w-32 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3D52A0]"
                  />
                  <div className="flex items-center gap-1.5">
                    {[-10, -5, 5, 8, 10, 15].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCostPercentChange(preset)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                      >
                        {preset > 0 ? `+${preset}%` : `${preset}%`}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 italic mt-1">
                  Example: +8% simulates a general raw materials or vendor price escalation.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: CATEGORY */}
          {activeTab === 'category' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                  Target Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {allCategories.filter((c) => c !== 'All').map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setTargetCategory(cat);
                        setIsCustomCategory(false);
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                        !isCustomCategory && targetCategory === cat
                          ? 'bg-[#3D52A0] border-[#3D52A0] text-white shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomCategory(true)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                      isCustomCategory
                        ? 'bg-[#3D52A0] border-[#3D52A0] text-white'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    + New Custom Category
                  </button>
                </div>
              </div>

              {isCustomCategory && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                    Enter New Category Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Automation & Smart Home, Signage, Landscaping..."
                    value={customCategoryName}
                    onChange={(e) => setCustomCategoryName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3D52A0]"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 4: UOM */}
          {activeTab === 'uom' && (
            <div className="space-y-4">
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                Standardize Unit of Measurement (UOM)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {UOM_OPTIONS.map((uom) => (
                  <button
                    key={uom}
                    type="button"
                    onClick={() => setTargetUom(uom)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      targetUom === uom
                        ? 'bg-[#3D52A0] border-[#3D52A0] text-white shadow-2xs font-extrabold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold'
                    }`}
                  >
                    <span className="text-xs uppercase">{uom}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: BUNDLE */}
          {activeTab === 'bundle' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200/80 space-y-2">
                <div className="text-xs font-extrabold text-emerald-900">
                  Package {selectedItems.length} items into a reusable Room Bundle
                </div>
                <p className="text-[11px] text-emerald-700">
                  This bundle will be saved to your studio's custom templates so you can add all these items to any room with 1-click in the future.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                  Bundle Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Master Bedroom Luxury Package"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                  Description
                </label>
                <textarea
                  placeholder="Brief summary of what this room kit covers..."
                  value={bundleDesc}
                  onChange={(e) => setBundleDesc(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 h-20 resize-none"
                />
              </div>
            </div>
          )}

          {/* LIVE IMPACT PREVIEW (First 3 Items) */}
          {activeTab !== 'bundle' && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Live Preview (First 3 items)
                </span>
                <span className="text-[10px] font-bold text-[#3D52A0]">
                  {selectedItems.length} items will be updated
                </span>
              </div>

              <div className="space-y-2">
                {selectedItems.slice(0, 3).map((item, idx) => {
                  const updated = previewUpdatedItems[idx];
                  if (!updated) return null;

                  const origCost = (item.materials || 0) + (item.labor || 0);
                  const newCost = (updated.materials || 0) + (updated.labor || 0);
                  const origSell = calculateSellPrice(item.materials, item.labor, item.margin);
                  const newSell = calculateSellPrice(updated.materials, updated.labor, updated.margin);

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-900 truncate">{item.name || 'Untitled Item'}</div>
                        <div className="text-[10px] text-slate-400">{item.cat} · {item.unit}</div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                        {activeTab === 'margin' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">{item.margin}%</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="font-bold text-emerald-600">{updated.margin}%</span>
                          </div>
                        )}

                        {activeTab === 'cost' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">{formatCurrency(origCost)}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="font-bold text-blue-600">{formatCurrency(newCost)}</span>
                          </div>
                        )}

                        {activeTab === 'category' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">{item.cat}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="font-bold text-[#3D52A0]">{updated.cat}</span>
                          </div>
                        )}

                        {activeTab === 'uom' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">{item.unit}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="font-bold text-purple-600">{updated.unit}</span>
                          </div>
                        )}

                        <div className="text-right">
                          <div className="text-[9px] text-slate-400 uppercase">Sell Price</div>
                          <div className="font-bold text-slate-900">{formatCurrency(newSell)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-sm transition-all cursor-pointer ${
              activeTab === 'bundle'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-[#3D52A0] hover:bg-[#0052A3]'
            }`}
          >
            <Check className="w-4 h-4" />
            {activeTab === 'bundle'
              ? 'Save Room Bundle'
              : `Apply to ${selectedItems.length} Items`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default BankBulkActionModal;
