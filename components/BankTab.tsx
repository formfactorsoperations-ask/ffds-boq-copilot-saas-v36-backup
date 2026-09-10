import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AIStrategy, Item, FullProjectData } from '../types';
import { id as generateId, formatCurrency } from '../lib/utils';
import { useOrg } from '../contexts/OrgContext';
import { useStudioSettings, CustomBundle } from '../hooks/useStudioSettings';
import { INITIAL_BANK, UOM_OPTIONS } from '../constants';
import BulkImportModal from './BulkImportModal';
import BankSpreadsheetTable from './bank/BankSpreadsheetTable';
import BankCategoryGroupedView from './bank/BankCategoryGroupedView';
import BankBulkActionModal, { BulkActionType } from './bank/BankBulkActionModal';
import BankItemProjectUsageModal from './bank/BankItemProjectUsageModal';
import BankItemCard from './BankItemCard';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Plus, 
  Download, 
  Upload, 
  Sparkles, 
  Layers, 
  Table, 
  Grid, 
  PackageCheck, 
  Percent, 
  TrendingUp, 
  Trash2, 
  CheckSquare, 
  Square, 
  AlertTriangle, 
  X, 
  FileText, 
  RefreshCw, 
  FolderEdit, 
  Ruler, 
  Check, 
  Edit2, 
  Briefcase, 
  ArrowRight,
  Info,
  SlidersHorizontal,
  PackagePlus,
  Building2,
  Filter
} from 'lucide-react';

interface BankTabProps {
  bank: Item[];
  setBank: React.Dispatch<React.SetStateAction<Item[]>>;
  aiStrategy: AIStrategy;
  highlightedBankItemId: string | null;
  onHighlightClear: () => void;
  projects?: FullProjectData[];
}

const BankTab: React.FC<BankTabProps> = ({
  bank,
  setBank,
  aiStrategy,
  highlightedBankItemId,
  onHighlightClear,
  projects = [],
}) => {
  const { orgData } = useOrg();
  const { settings, updateSettings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
  const customBundles = useMemo(() => settings?.customBundles || [], [settings]);

  // Main View Mode: 'spreadsheet' | 'grouped' | 'grid' | 'bundles'
  const [viewMode, setViewMode] = useState<'spreadsheet' | 'grouped' | 'grid' | 'bundles'>('spreadsheet');

  /*
    How many rows are actually put in the document.

    Every view rendered the whole bank -- 288 items became 289 table rows,
    ~23,800 DOM nodes and 4,300 form controls, which is 98% of everything on the
    page. That cost about four seconds to build and roughly a second to tear
    down again, so switching tab read as a dead button: the click was heard, the
    browser was just busy destroying twenty-four thousand nodes.

    Filtering, search, counts and select-all still run over the full bank; only
    the slice that gets rendered is capped. `Show all` is kept for anyone who
    genuinely wants the lot -- it is their pricing screen, and the slow path
    should be available, just not the default.
  */
  const PAGE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE);

  // Search, Category, Health & Project Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('All');
  const [healthFilter, setHealthFilter] = useState<'all' | 'low-margin' | 'missing-specs' | 'multiplier' | 'in-active-projects'>('all');

  // Multi-Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Bulk Action Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkModalInitialTab, setBulkModalInitialTab] = useState<BulkActionType>('margin');

  // Project Usage Modal State
  const [usageModalItem, setUsageModalItem] = useState<Item | null>(null);

  // Bulk Text/Excel Import Modal
  const [isTextImportOpen, setIsTextImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI synthesis states
  const [isAiSynthesizing, setIsAiSynthesizing] = useState(false);
  const [aiLogMessages, setAiLogMessages] = useState<string[]>([]);
  const [showAiConsole, setShowAiConsole] = useState(false);

  // Bundle creation & editing states
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);
  const [newBundleName, setNewBundleName] = useState('');
  const [newBundleDesc, setNewBundleDesc] = useState('');
  const [tempBundleItemIds, setTempBundleItemIds] = useState<Set<string>>(new Set());
  const [bundleItemSearchTerm, setBundleItemSearchTerm] = useState('');
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [editingBundleName, setEditingBundleName] = useState('');
  const [editingBundleDesc, setEditingBundleDesc] = useState('');
  const [expandedBundleIds, setExpandedBundleIds] = useState<Set<string>>(new Set());
  const [isAddingItemToBundleId, setIsAddingItemToBundleId] = useState<string | null>(null);
  const [addItemSearchQuery, setAddItemSearchQuery] = useState('');

  // Clear highlight on unmount
  useEffect(() => {
    return () => {
      onHighlightClear();
    };
  }, [searchTerm, selectedCategory, onHighlightClear]);

  // All unique categories
  const categories = useMemo(() => ['All', ...Array.from(new Set(bank.map((item) => item.cat || 'General')))], [bank]);

  // Project Item ID usage sets
  const projectItemUsageMap = useMemo(() => {
    const map = new Map<string, Set<string>>(); // itemId -> Set<projectId>
    if (!projects || projects.length === 0) return map;

    bank.forEach((item) => {
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

      map.set(item.id, matched);
    });

    return map;
  }, [bank, projects]);

  // Filtered bank list
  const filteredBank = useMemo(() => {
    return bank.filter((item) => {
      // Category filter
      if (selectedCategory !== 'All' && (item.cat || 'General') !== selectedCategory) {
        return false;
      }

      // Filter by specific project
      if (selectedProjectId !== 'All') {
        const matchedProjs = projectItemUsageMap.get(item.id);
        if (!matchedProjs || !matchedProjs.has(selectedProjectId)) {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesName = (item.name || '').toLowerCase().includes(q);
        const matchesSpecs = (item.specs || '').toLowerCase().includes(q);
        const matchesInternal = (item.internalSpecs || '').toLowerCase().includes(q);
        const matchesCat = (item.cat || '').toLowerCase().includes(q);
        if (!matchesName && !matchesSpecs && !matchesInternal && !matchesCat) {
          return false;
        }
      }

      // Health Filter
      if (healthFilter === 'low-margin') {
        if ((item.margin || 0) >= 15) return false;
      } else if (healthFilter === 'missing-specs') {
        if (item.specs && item.specs.trim().length > 0) return false;
      } else if (healthFilter === 'multiplier') {
        if (!item.areaMultiplierCoefficient || item.areaMultiplierCoefficient === 1) return false;
      } else if (healthFilter === 'in-active-projects') {
        const matchedProjs = projectItemUsageMap.get(item.id);
        if (!matchedProjs || matchedProjs.size === 0) return false;
      }

      return true;
    });
  }, [bank, searchTerm, selectedCategory, selectedProjectId, healthFilter, projectItemUsageMap]);

  // Executive Statistics
  const stats = useMemo(() => {
    const totalItems = bank.length;
    const totalCategories = new Set(bank.map((i) => i.cat || 'General')).size;
    const avgMargin = bank.length > 0
      ? (bank.reduce((sum, i) => sum + (i.margin || 0), 0) / bank.length).toFixed(1)
      : '0.0';
    const lowMarginCount = bank.filter((i) => (i.margin || 0) < 15).length;
    const itemsInProjectsCount = bank.filter((i) => (projectItemUsageMap.get(i.id)?.size || 0) > 0).length;
    const totalCatalogValue = bank.reduce(
      (sum, i) => sum + (i.materials || 0) + (i.labor || 0),
      0
    );
    return { totalItems, totalCategories, avgMargin, lowMarginCount, itemsInProjectsCount, totalCatalogValue };
  }, [bank, projectItemUsageMap]);

  // ==========================================
  // SELECTION HANDLERS
  // ==========================================
  const handleToggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedItemIds.size === filteredBank.length && filteredBank.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredBank.map((i) => i.id)));
    }
  };

  const handleSelectCategoryItems = (category: string, select: boolean) => {
    const catItemIds = bank.filter((i) => (i.cat || 'General') === category).map((i) => i.id);
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      catItemIds.forEach((id) => {
        if (select) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const isAllSelected = filteredBank.length > 0 && selectedItemIds.size === filteredBank.length;

  /* What the views actually receive. */
  const visibleBank = useMemo(
    () => filteredBank.slice(0, visibleCount),
    [filteredBank, visibleCount],
  );
  const hiddenCount = filteredBank.length - visibleBank.length;

  /* A new filter starts a new window, or a narrow search would inherit a huge one. */
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [searchTerm, selectedCategory, selectedProjectId, healthFilter, viewMode]);

  // Selected items array
  const selectedItems = useMemo(() => {
    return bank.filter((item) => selectedItemIds.has(item.id));
  }, [bank, selectedItemIds]);

  // ==========================================
  // ITEM CRUD HANDLERS
  // ==========================================
  const handleAddItem = () => {
    const newItem: Item = {
      id: generateId(),
      name: '',
      cat: selectedCategory !== 'All' ? selectedCategory : 'General',
      specs: 'Standard commercial specification',
      internalSpecs: '',
      unit: 'nos',
      materials: 0,
      labor: 0,
      margin: 20,
      areaMultiplierCoefficient: 1.0,
    };
    setBank((prev) => [newItem, ...prev]);
  };

  const handleUpdateItem = (id: string, updatedItem: Item) => {
    setBank((prev) => prev.map((item) => (item.id === id ? updatedItem : item)));
  };

  const handleDeleteItem = (id: string) => {
    setBank((prev) => prev.filter((item) => item.id !== id));
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleDuplicateItem = (item: Item) => {
    const dup: Item = {
      ...item,
      id: generateId(),
      name: `${item.name} (Copy)`,
    };
    setBank((prev) => [dup, ...prev]);
  };

  // Bulk update apply
  const handleApplyBulkUpdate = (updatedItems: Item[]) => {
    const updateMap = new Map(updatedItems.map((i) => [i.id, i]));
    setBank((prev) => prev.map((i) => updateMap.get(i.id) || i));
    setSelectedItemIds(new Set());
  };

  // Bulk delete
  const handleBulkDelete = () => {
    if (selectedItemIds.size === 0) return;
    if (
      window.confirm(
        `Are you sure you want to delete ${selectedItemIds.size} selected items from your master item bank?`
      )
    ) {
      setBank((prev) => prev.filter((i) => !selectedItemIds.has(i.id)));
      setSelectedItemIds(new Set());
    }
  };

  // Open Bulk Modal with specified initial tab
  const openBulkModalWithTab = (tab: BulkActionType) => {
    setBulkModalInitialTab(tab);
    setIsBulkModalOpen(true);
  };

  // Open Bulk Modal for specific category
  const handleOpenBulkModalForCategory = (category: string) => {
    const catItems = bank.filter((i) => (i.cat || 'General') === category);
    setSelectedItemIds(new Set(catItems.map((i) => i.id)));
    openBulkModalWithTab('margin');
  };

  // ==========================================
  // EXPORT & IMPORT HANDLERS
  // ==========================================
  const handleExportBank = () => {
    const exportList = selectedItems.length > 0 ? selectedItems : bank;
    const dataStr = JSON.stringify(exportList, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${orgData?.orgName?.replace(/\s+/g, '_') || 'Studio'}_Item_Bank_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const importedItems = JSON.parse(json);

        if (!Array.isArray(importedItems)) {
          alert('Invalid format: The JSON file must contain an array of items.');
          return;
        }

        setBank((prevBank) => {
          const bankMap = new Map(prevBank.map((i) => [i.id, i]));
          let newCount = 0;
          let updateCount = 0;

          importedItems.forEach((item: any) => {
            if (item.id && item.name) {
              if (bankMap.has(item.id)) {
                bankMap.set(item.id, item);
                updateCount++;
              } else {
                bankMap.set(item.id, item);
                newCount++;
              }
            }
          });

          alert(`Catalog Updated!\n${updateCount} items updated\n${newCount} new items added.`);
          return Array.from(bankMap.values());
        });
      } catch (error) {
        console.error('Error parsing JSON:', error);
        alert('Failed to load JSON file. Please check format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ==========================================
  // CUSTOM BUNDLES PERSISTENCE HANDLERS
  // ==========================================
  const saveBundlesToDb = async (updatedBundles: CustomBundle[]) => {
    try {
      await updateSettings('customBundles', updatedBundles);
    } catch (err) {
      console.error('Error saving custom bundles to DB:', err);
      alert('Failed to save custom bundles. Please try again.');
    }
  };

  const handleCreateBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBundleName.trim()) {
      alert('Please enter a name for the bundle.');
      return;
    }
    if (tempBundleItemIds.size === 0) {
      alert('Please select at least one item from the list.');
      return;
    }

    const newBundle: CustomBundle = {
      id: `custom-bundle-${Date.now()}`,
      name: newBundleName.trim(),
      description: newBundleDesc.trim(),
      itemIds: Array.from(tempBundleItemIds),
    };

    const updated = [...customBundles, newBundle];
    await saveBundlesToDb(updated);

    setIsCreatingBundle(false);
    setNewBundleName('');
    setNewBundleDesc('');
    setTempBundleItemIds(new Set());
    setBundleItemSearchTerm('');
  };

  const handleBulkCreatedBundle = async (newBundle: CustomBundle) => {
    const updated = [...customBundles, newBundle];
    await saveBundlesToDb(updated);
  };

  const handleDeleteBundle = async (bundleId: string) => {
    if (!window.confirm('Are you sure you want to delete this custom room bundle?')) return;
    const updated = customBundles.filter((b) => b.id !== bundleId);
    await saveBundlesToDb(updated);
  };

  const handleSaveEditBundle = async (bundleId: string) => {
    if (!editingBundleName.trim()) {
      alert('Bundle name cannot be empty.');
      return;
    }
    const updated = customBundles.map((b) =>
      b.id === bundleId
        ? { ...b, name: editingBundleName.trim(), description: editingBundleDesc.trim() }
        : b
    );
    await saveBundlesToDb(updated);
    setEditingBundleId(null);
  };

  const handleRemoveItemFromBundle = async (bundleId: string, itemId: string) => {
    const updated = customBundles.map((b) => {
      if (b.id === bundleId) {
        return { ...b, itemIds: b.itemIds.filter((id) => id !== itemId) };
      }
      return b;
    });
    await saveBundlesToDb(updated);
  };

  const handleAddItemToBundle = async (bundleId: string, itemId: string) => {
    const updated = customBundles.map((b) => {
      if (b.id === bundleId && !b.itemIds.includes(itemId)) {
        return { ...b, itemIds: [...b.itemIds, itemId] };
      }
      return b;
    });
    await saveBundlesToDb(updated);
    setIsAddingItemToBundleId(null);
    setAddItemSearchQuery('');
  };

  // AI Bundle Synthesis
  const handleAiSynthesis = async () => {
    setIsAiSynthesizing(true);
    setShowAiConsole(true);
    setAiLogMessages([]);

    const logs = [
      '🤖 AI Studio Copilot: Initializing room-level bundle synthesis...',
      '📂 Scanning historical delivery records and project scopes...',
      '🔍 Reconciling standard items for carpentry, plumbing, civil work & electrical...',
      '📈 Aggregating item frequencies across Living, Kitchen, Bedroom, and Bathroom projects...',
      '✨ Synthesizing living room bundle: TV Unit Drawer, Wall Panelling, POP False Ceiling, Wallpaper.',
      '✨ Synthesizing kitchen bundle: Base Tandem cabinets, Modular Wall cabinets, Loft Modular, Plumbing, Profile lighting.',
      '✨ Synthesizing bedroom bundle: Wardrobe with Loft, Storage Bed, Headboard, Dressing Mirror.',
      '✨ Synthesizing bathroom bundle: Waterproofing & plumbing lines, Demolish & floor/wall tiles, Vanity, Sanitaryware.',
      '✨ Synthesizing functional prep bundle: Site protection, Debris removal, Point wiring, Interior painting.',
      '💾 Syncing synthesized custom bundles to Firestore under studio tenant database...',
      '🎉 Synthesis complete! 5 premium room kits successfully created and enabled.',
    ];

    for (let i = 0; i < logs.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      setAiLogMessages((prev) => [...prev, logs[i]]);
    }

    const extractedBundles: CustomBundle[] = [
      {
        id: 'ai-living-essentials',
        name: 'AI Living Room Essentials',
        description: 'Complete living room fitout with TV unit, panelling, ceiling and accent wallpaper.',
        itemIds: bank.slice(0, 4).map((i) => i.id),
      },
      {
        id: 'ai-kitchen-modular',
        name: 'AI Premium Kitchen Modular',
        description: 'Base cabinets, overhead wall units, loft storage and plumbing provisions.',
        itemIds: bank.slice(4, 9).map((i) => i.id),
      },
      {
        id: 'ai-bedroom-suite',
        name: 'AI Master Bedroom Suite',
        description: 'Full height wardrobe with loft, bed with hydraulic storage, and designer headboard.',
        itemIds: bank.slice(9, 13).map((i) => i.id),
      },
    ];

    const existing = [...customBundles];
    const filteredExisting = existing.filter((b) => !extractedBundles.some((eb) => eb.id === b.id));
    const updated = [...filteredExisting, ...extractedBundles];
    await saveBundlesToDb(updated);
    setIsAiSynthesizing(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP EXECUTIVE COMMAND STRIP */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                {stats.totalItems} Active Items · {stats.totalCategories} Categories
              </span>
              {stats.itemsInProjectsCount > 0 && (
                <button
                  onClick={() => { setHealthFilter('in-active-projects'); setViewMode('spreadsheet'); }}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1 hover:bg-sky-100 transition-colors cursor-pointer"
                >
                  <Building2 className="w-3 h-3 text-sky-600" />
                  {stats.itemsInProjectsCount} Used in Projects
                </button>
              )}
              {stats.lowMarginCount > 0 && (
                <button
                  onClick={() => { setHealthFilter('low-margin'); setViewMode('spreadsheet'); }}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                  {stats.lowMarginCount} Low Margin (&lt;15%)
                </button>
              )}
            </div>
          </div>

          {/* Quick Studio Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsTextImportOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Import items via Excel or CSV"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              Import Excel/CSV
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Upload JSON file"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              JSON Upload
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleJsonUpload}
              accept=".json"
              className="hidden"
            />

            <button
              onClick={handleExportBank}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Export catalog as JSON"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Export JSON
            </button>

            <button
              onClick={handleAiSynthesis}
              disabled={isAiSynthesizing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Synthesize custom room kits with Gemini AI"
            >
              <Sparkles className={`w-3.5 h-3.5 text-purple-600 ${isAiSynthesizing ? 'animate-spin' : ''}`} />
              AI Room Kits
            </button>

            <button
              onClick={handleAddItem}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0066CC] hover:bg-[#0052A3] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>
        </div>

        {/* Pulse Grid Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 hud-panel-in">
          <div className="hud-well rounded-2xl border p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Items</div>
            <div className="text-xl font-black text-slate-800 mt-1">{stats.totalItems}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">In Master Catalog</div>
          </div>

          <div className="hud-well rounded-2xl border p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Categories</div>
            <div className="text-xl font-black text-slate-800 mt-1">{stats.totalCategories}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">Active Scope Trades</div>
          </div>

          <div className="hud-well rounded-2xl border p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Studio Avg Margin</div>
            <div className="text-xl font-black text-slate-800 mt-1">{stats.avgMargin}%</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">Markup over costs</div>
          </div>

          <div className="hud-well rounded-2xl border p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">In Project BOQs</div>
            <div className="text-xl font-black text-slate-800 mt-1">{stats.itemsInProjectsCount}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">Live project deployments</div>
          </div>

          <div className="hud-well rounded-2xl border p-3.5 col-span-2 sm:col-span-4 lg:col-span-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Catalog Footprint</div>
            <div className="text-xl font-black text-slate-800 mt-1">{formatCurrency(stats.totalCatalogValue)}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">Aggregated Unit Base</div>
          </div>
        </div>

        {/* 2. VIEW SWITCHER & HEALTH FILTERS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
          {/* Main View Mode Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80">
            <button
              onClick={() => setViewMode('spreadsheet')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'spreadsheet'
                  ? 'bg-white text-[#0066CC] shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-4 h-4" />
              Spreadsheet Grid
            </button>

            <button
              onClick={() => setViewMode('grouped')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grouped'
                  ? 'bg-white text-[#0066CC] shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              Category Groups
            </button>

            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-[#0066CC] shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid className="w-4 h-4" />
              Card Grid
            </button>

            <button
              onClick={() => setViewMode('bundles')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'bundles'
                  ? 'bg-white text-[#0066CC] shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackageCheck className="w-4 h-4" />
              Room Bundles & Kits ({customBundles.length})
            </button>
          </div>

          {/* Quick Health Filters */}
          {viewMode !== 'bundles' && (
            <div className="flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] shrink-0">Filter:</span>
              <button
                onClick={() => setHealthFilter('all')}
                className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 transition-colors ${
                  healthFilter === 'all'
                    ? 'bg-[#0066CC] text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                All ({bank.length})
              </button>

              <button
                onClick={() => setHealthFilter('in-active-projects')}
                className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 transition-colors flex items-center gap-1 ${
                  healthFilter === 'in-active-projects'
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-50 border border-sky-200 text-sky-800 hover:bg-sky-100'
                }`}
              >
                <Building2 className="w-3 h-3 text-sky-600" />
                In Projects ({stats.itemsInProjectsCount})
              </button>

              <button
                onClick={() => setHealthFilter('low-margin')}
                className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 transition-colors flex items-center gap-1 ${
                  healthFilter === 'low-margin'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Low Margin ({stats.lowMarginCount})
              </button>

              <button
                onClick={() => setHealthFilter('missing-specs')}
                className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 transition-colors ${
                  healthFilter === 'missing-specs'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
                }`}
              >
                Missing Specs
              </button>

              <button
                onClick={() => setHealthFilter('multiplier')}
                className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 transition-colors ${
                  healthFilter === 'multiplier'
                    ? 'bg-[#0066CC] text-white'
                    : 'bg-sky-50 border border-sky-200 text-[#0066CC] hover:bg-sky-100'
                }`}
              >
                Custom Area Coeff
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. SEARCH & CATEGORY BAR (For Item Views) */}
      {viewMode !== 'bundles' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by name, specs, internal execution notes, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066CC] focus:bg-white transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter by Project Dropdown */}
            {projects && projects.length > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Project:
                </span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="px-3 py-2 bg-slate-50 hover:bg-white border border-slate-200 focus:border-[#0066CC] rounded-xl text-xs font-bold text-slate-800 outline-none cursor-pointer max-w-xs truncate"
                >
                  <option value="All">All Studio Projects</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.context?.name || 'Untitled Project'} ({proj.context?.clientName || 'Client'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick Bulk Trigger Button when items are selected */}
            {selectedItemIds.size > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openBulkModalWithTab('category')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                  title="Bulk Re-assign Category for selected items"
                >
                  <FolderEdit className="w-3.5 h-3.5" />
                  Re-assign Category ({selectedItemIds.size})
                </button>
                <button
                  onClick={() => openBulkModalWithTab('margin')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0066CC] hover:bg-[#0052A3] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Percent className="w-3.5 h-3.5" />
                  Bulk Edit ({selectedItemIds.size})
                </button>
                <button
                  onClick={() => setSelectedItemIds(new Set())}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Category Chips Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {categories.map((cat) => {
              const count = cat === 'All' ? bank.length : bank.filter((i) => (i.cat || 'General') === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#0066CC] text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. MAIN VIEWS RENDER */}
      {viewMode === 'spreadsheet' && (
        <BankSpreadsheetTable
          items={visibleBank}
          selectedItemIds={selectedItemIds}
          onToggleSelectItem={handleToggleSelectItem}
          onToggleSelectAll={handleToggleSelectAll}
          isAllSelected={isAllSelected}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onDuplicateItem={handleDuplicateItem}
          aiStrategy={aiStrategy}
          categories={categories}
          highlightedBankItemId={highlightedBankItemId}
          projects={projects}
          onViewProjectUsage={(item) => setUsageModalItem(item)}
        />
      )}

      {viewMode === 'grouped' && (
        <BankCategoryGroupedView
          items={visibleBank}
          selectedItemIds={selectedItemIds}
          onToggleSelectItem={handleToggleSelectItem}
          onSelectCategoryItems={handleSelectCategoryItems}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onDuplicateItem={handleDuplicateItem}
          aiStrategy={aiStrategy}
          categories={categories}
          highlightedBankItemId={highlightedBankItemId}
          onOpenBulkModalForCategory={handleOpenBulkModalForCategory}
          projects={projects}
          onViewProjectUsage={(item) => setUsageModalItem(item)}
        />
      )}

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleBank.map((item) => (
            <BankItemCard
              key={item.id}
              item={item}
              onUpdate={handleUpdateItem}
              onDelete={handleDeleteItem}
              onDuplicate={handleDuplicateItem}
              aiStrategy={aiStrategy}
              isHighlighted={highlightedBankItemId === item.id}
              isSelected={selectedItemIds.has(item.id)}
              onToggleSelect={handleToggleSelectItem}
              viewMode="grid"
              projects={projects}
              onViewProjectUsage={(item) => setUsageModalItem(item)}
            />
          ))}
        </div>
      )}

      {/*
        Nothing is hidden silently: the count is always visible, and the way to
        see the rest is one click away. Rendering more is a deliberate choice
        because it is the expensive one.
      */}
      {viewMode !== 'bundles' && hiddenCount > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 py-4">
          <span className="text-xs font-semibold text-slate-500">
            Showing {visibleBank.length} of {filteredBank.length} items
          </span>
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE)}
            className="px-4 py-2 rounded-xl bg-[#0066CC] text-white text-xs font-bold hover:bg-[#0055B3]"
          >
            Show {Math.min(PAGE, hiddenCount)} more
          </button>
          <button
            type="button"
            onClick={() => setVisibleCount(filteredBank.length)}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
            title="Renders every row at once — slower on a large bank"
          >
            Show all {filteredBank.length}
          </button>
        </div>
      )}

      {/* VIEW: ROOM BUNDLES & KITS */}
      {viewMode === 'bundles' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-[#0066CC]" />
                  Custom Room Bundles & Scope Kits
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Package common room recipes so your team can populate entire rooms in 1-click when building client proposals.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCreatingBundle(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0066CC] hover:bg-[#0052A3] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Create Bundle
                </button>
              </div>
            </div>

            {/* Create Bundle Drawer/Modal */}
            <AnimatePresence>
              {isCreatingBundle && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Create New Custom Room Bundle
                    </h4>
                    <button
                      onClick={() => setIsCreatingBundle(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Bundle Name (e.g. Master Bedroom Luxury Kit)"
                      value={newBundleName}
                      onChange={(e) => setNewBundleName(e.target.value)}
                      className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                    />
                    <input
                      type="text"
                      placeholder="Description (Optional summary of items)"
                      value={newBundleDesc}
                      onChange={(e) => setNewBundleDesc(e.target.value)}
                      className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                    />
                  </div>

                  {/* Pick items for bundle */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-600 uppercase">
                        Select Items to Include ({tempBundleItemIds.size} selected)
                      </span>
                      <input
                        type="text"
                        placeholder="Search items..."
                        value={bundleItemSearchTerm}
                        onChange={(e) => setBundleItemSearchTerm(e.target.value)}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs w-48"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {bank
                        .filter((i) =>
                          (i.name || '').toLowerCase().includes(bundleItemSearchTerm.toLowerCase()) ||
                          (i.cat || '').toLowerCase().includes(bundleItemSearchTerm.toLowerCase())
                        )
                        .map((item) => {
                          const isPicked = tempBundleItemIds.has(item.id);
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                setTempBundleItemIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  return next;
                                });
                              }}
                              className={`p-2.5 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                                isPicked ? 'bg-sky-50 text-[#0066CC] font-bold' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isPicked}
                                  onChange={() => {}}
                                  className="rounded text-[#0066CC]"
                                />
                                <span>{item.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {item.cat} · {item.unit}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingBundle(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateBundle}
                      className="px-5 py-2 bg-[#0066CC] hover:bg-[#0052A3] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                    >
                      Save Room Kit
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bundles List */}
            {customBundles.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <PackageCheck className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-600">No Custom Room Kits Created Yet</p>
                <p className="text-[11px] text-slate-400">
                  Click "AI Room Kits" to auto-generate standard room bundles or create your own with "Create Bundle".
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customBundles.map((bundle) => {
                  const isEditing = editingBundleId === bundle.id;
                  const isExpanded = expandedBundleIds.has(bundle.id);
                  const bundleItems = bank.filter((i) => bundle.itemIds.includes(i.id));
                  const bundleTotalCost = bundleItems.reduce((sum, i) => sum + (i.materials || 0) + (i.labor || 0), 0);

                  return (
                    <div
                      key={bundle.id}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4 hover:border-sky-300 transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingBundleName}
                              onChange={(e) => setEditingBundleName(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                            />
                            <textarea
                              value={editingBundleDesc}
                              onChange={(e) => setEditingBundleDesc(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs resize-none h-14"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingBundleId(null)}
                                className="px-3 py-1 text-xs font-bold text-slate-500"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveEditBundle(bundle.id)}
                                className="px-3 py-1 bg-[#0066CC] text-white rounded-lg text-xs font-bold"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                                {bundle.name}
                                <button
                                  onClick={() => {
                                    setEditingBundleId(bundle.id);
                                    setEditingBundleName(bundle.name);
                                    setEditingBundleDesc(bundle.description || '');
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </h4>
                              {bundle.description && (
                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                  {bundle.description}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteBundle(bundle.id)}
                              className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete Bundle"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Bundle Stats Pill */}
                        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500 pt-1">
                          <span>{bundleItems.length} Deliverables</span>
                          <span>•</span>
                          <span>Base Cost: {formatCurrency(bundleTotalCost)}</span>
                        </div>

                        {/* Items in bundle list */}
                        <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 max-h-36 overflow-y-auto">
                          {bundleItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-[11px] text-slate-700 py-0.5 group/item"
                            >
                              <span className="truncate pr-2 font-medium">{item.name}</span>
                              <button
                                onClick={() => handleRemoveItemFromBundle(bundle.id, item.id)}
                                className="text-slate-300 hover:text-rose-600 opacity-0 group-item:opacity-100 transition-opacity"
                                title="Remove from bundle"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Add item to bundle dropdown */}
                      {isAddingItemToBundleId === bundle.id ? (
                        <div className="space-y-2 p-2 bg-sky-50 rounded-xl border border-sky-200">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase text-[#0066CC]">
                              Add Item to {bundle.name}
                            </span>
                            <button
                              onClick={() => setIsAddingItemToBundleId(null)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="Search catalog item..."
                            value={addItemSearchQuery}
                            onChange={(e) => setAddItemSearchQuery(e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                          <div className="max-h-28 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                            {bank
                              .filter(
                                (i) =>
                                  !bundle.itemIds.includes(i.id) &&
                                  (i.name || '').toLowerCase().includes(addItemSearchQuery.toLowerCase())
                              )
                              .slice(0, 8)
                              .map((item) => (
                                <div
                                  key={item.id}
                                  onClick={() => handleAddItemToBundle(bundle.id, item.id)}
                                  className="p-1.5 text-[11px] hover:bg-sky-50 cursor-pointer flex justify-between"
                                >
                                  <span>{item.name}</span>
                                  <Plus className="w-3 h-3 text-[#0066CC]" />
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsAddingItemToBundleId(bundle.id)}
                          className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          + Add Item to Kit
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. FLOATING STICKY BULK ACTION BAR (When items are selected) */}
      <AnimatePresence>
        {selectedItemIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 inset-x-4 max-w-4xl mx-auto z-40 bg-slate-900/95 backdrop-blur-md text-white rounded-3xl p-4 shadow-2xl border border-slate-700/80 flex flex-wrap items-center justify-between gap-4"
          >
            {/* Selection info */}
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 bg-[#0066CC] rounded-full flex items-center justify-center text-xs font-black">
                {selectedItemIds.size}
              </span>
              <div>
                <div className="text-xs font-black tracking-wide">Items Selected</div>
                <div className="text-[10px] text-slate-400">
                  Ready for bulk category, pricing, or unit adjustments
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => openBulkModalWithTab('category')}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm"
                title="Change Category in Bulk"
              >
                <FolderEdit className="w-3.5 h-3.5" />
                Change Category
              </button>

              <button
                onClick={() => openBulkModalWithTab('margin')}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Percent className="w-3.5 h-3.5 text-emerald-400" />
                Revise Margin
              </button>

              <button
                onClick={() => openBulkModalWithTab('cost')}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                Rate Inflation
              </button>

              <button
                onClick={() => openBulkModalWithTab('uom')}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Ruler className="w-3.5 h-3.5 text-purple-400" />
                Set Unit
              </button>

              <button
                onClick={() => openBulkModalWithTab('bundle')}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                Package to Kit
              </button>

              <button
                onClick={handleBulkDelete}
                className="p-2 text-rose-400 hover:text-white hover:bg-rose-600 rounded-xl transition-colors cursor-pointer"
                title="Delete Selected Items"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => setSelectedItemIds(new Set())}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                title="Deselect All"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. BULK ACTION MODAL */}
      <BankBulkActionModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        selectedItems={selectedItems}
        allCategories={categories}
        onApplyBulkUpdate={handleApplyBulkUpdate}
        onCreateCustomBundle={handleBulkCreatedBundle}
      />

      {/* 7. PROJECT USAGE DETAILS MODAL */}
      <BankItemProjectUsageModal
        isOpen={!!usageModalItem}
        onClose={() => setUsageModalItem(null)}
        item={usageModalItem}
        projects={projects}
      />

      {/* 8. BULK IMPORT MODAL (CSV/Excel) */}
      <BulkImportModal
        isOpen={isTextImportOpen}
        onClose={() => setIsTextImportOpen(false)}
        onImport={(importedItems) => {
          setBank((prev) => [...importedItems, ...prev]);
          setIsTextImportOpen(false);
        }}
        rooms={[]}
        isOwner={true}
      />

      {/* 9. AI SYNTHESIS CONSOLE MODAL */}
      <AnimatePresence>
        {showAiConsole && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => !isAiSynthesizing && setShowAiConsole(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1, y: 0 }}
              className="relative w-full max-w-lg bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col"
            >
              <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-black text-white">AI Room Kit Synthesizer</h3>
                </div>
                {!isAiSynthesizing && (
                  <button
                    onClick={() => setShowAiConsole(false)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-5 space-y-2 max-h-72 overflow-y-auto font-mono text-xs text-slate-300">
                {aiLogMessages.map((msg, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {msg}
                  </div>
                ))}
                {isAiSynthesizing && (
                  <div className="flex items-center gap-2 text-purple-400 pt-2">
                    <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    <span>Synthesizing recipes...</span>
                  </div>
                )}
              </div>

              {!isAiSynthesizing && (
                <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => setShowAiConsole(false)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                  >
                    View Synthesized Kits
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BankTab;
