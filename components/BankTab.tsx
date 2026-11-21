import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AIStrategy, Item, FullProjectData } from '../types';
import { id as generateId, formatCurrency } from '../lib/utils';
import { useOrg } from '../contexts/OrgContext';
import { useStudioSettings, CustomBundle } from '../hooks/useStudioSettings';
import { INITIAL_BANK, UOM_OPTIONS } from '../constants';
import BulkImportModal from './BulkImportModal';
import BankSpecImportModal from './bank/BankSpecImportModal';
import { applySpecs, buildSpecSheetWorkbook, specSheetName } from '../lib/bankSpecs';
import { downloadWorkbook } from '../lib/scopeWorkbook';
import { buildBankUsageExport, bankUsageFileName } from '../lib/bankUsageExport';
import { Button, EmptyState, PanelHead } from './ui/kit';
import BankCommandBar from './bank/BankCommandBar';
import { CountUp } from './ui/HudBits';
import { addToBank, isMergedCopy } from '../lib/bankMatch';
import { bankUsageIndex, projectsUsingItem } from '../lib/bankUsage';
import PriceLockModal from './bank/PriceLockModal';
import RepeatedItemsModal from './bank/RepeatedItemsModal';
import { duplicateGroups } from '../lib/bankMatch';
import BankSpreadsheetTable from './bank/BankSpreadsheetTable';
import BankCategoryGroupedView from './bank/BankCategoryGroupedView';
import BankBulkActionModal, { BulkActionType } from './bank/BankBulkActionModal';
import BankItemProjectUsageModal from './bank/BankItemProjectUsageModal';
import BankItemCard from './BankItemCard';
import type { MaterialSpecsBank } from '../lib/materialSpecs';
import { recipeOf } from '../lib/lineSpecs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Download, Sparkles, PackageCheck, Percent, TrendingUp, Trash2, X, FolderEdit, Ruler, Edit2, PackagePlus, Filter, Lock,
} from '@/lib/lucide-shim';

interface BankTabProps {
  bank: Item[];
  setBank: React.Dispatch<React.SetStateAction<Item[]>>;
  aiStrategy: AIStrategy;
  highlightedBankItemId: string | null;
  onHighlightClear: () => void;
  projects?: FullProjectData[];
  /** BOQ Playground S2: the Material specs bank. With it, items show their recipe and the No recipe filter appears. */
  specs?: MaterialSpecsBank;
  onOpenRecipe?: (id: string) => void;
  /** Lock prices (lib/priceLock.ts). Given to the owner; without it the button is not drawn. */
  priceLock?: { read: (stored?: boolean) => Promise<FullProjectData[]>; save: (project: FullProjectData) => Promise<void> };
  /** Repeated items (lib/bankDuplicates.ts): the owner may pick the one item kept for a name. */
  canSettle?: boolean;
}

const BankTab: React.FC<BankTabProps> = ({
  bank: wholeBank,
  setBank,
  aiStrategy,
  highlightedBankItemId,
  onHighlightClear,
  projects = [],
  specs,
  onOpenRecipe,
  priceLock,
  canSettle = false,
}) => {
  const { orgData } = useOrg();
  /*
    The screen works on the items. A copy of another item (lib/bankMatch.ts)
    stays in the bank, so old lines still find it, but is left off this list
    unless asked for. Everything that saves works on the whole bank: setBank
    takes the previous bank, and the exports and Lock prices are given it whole.
  */
  const [showCopies, setShowCopies] = useState(false);
  const copyCount = useMemo(() => wholeBank.filter(isMergedCopy).length, [wholeBank]);
  const bank = useMemo(() => (showCopies || !copyCount ? wholeBank : wholeBank.filter((i) => !isMergedCopy(i))), [wholeBank, showCopies, copyCount]);
  const { settings, updateSettings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
  const customBundles = useMemo(() => settings?.customBundles || [], [settings]);

  // Main View Mode: 'spreadsheet' | 'grouped' | 'grid' | 'bundles'
  /* With the BOQ Playground on, the bank opens on its cards, where each item shows its recipe. */
  const [viewMode, setViewMode] = useState<'spreadsheet' | 'grouped' | 'grid' | 'bundles'>(specs ? 'grid' : 'spreadsheet');

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
  const [healthFilter, setHealthFilter] = useState<'all' | 'low-margin' | 'missing-specs' | 'multiplier' | 'in-active-projects' | 'no-recipe'>('all');
  const noRecipeCount = useMemo(() => (specs ? bank.filter((i) => !recipeOf(i, specs)).length : 0), [bank, specs]);

  // Multi-Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Bulk Action Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkModalInitialTab, setBulkModalInitialTab] = useState<BulkActionType>('margin');

  // Project Usage Modal State
  const [usageModalItem, setUsageModalItem] = useState<Item | null>(null);

  // Bulk Text/Excel Import Modal
  const [isTextImportOpen, setIsTextImportOpen] = useState(false);
  // Specs in from Excel: one sheet for the whole bank, not one card at a time.
  const [isSpecImportOpen, setIsSpecImportOpen] = useState(false);
  const studioName = settings?.companyName || orgData?.orgName || 'Studio';
  const handleExportSpecs = async () => {
    try {
      downloadWorkbook(await buildSpecSheetWorkbook(bank, studioName), specSheetName(studioName));
    } catch (err) {
      console.error('Spec sheet export failed:', err);
      alert('The spec sheet could not be made. Please try again.');
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  /* Where the list starts: Add item brings it into view. */
  const listTopRef = useRef<HTMLDivElement>(null);

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

  /*
    Which projects use each item. The projects' lines are walked once, when the
    projects change (lib/bankUsage.ts); a change to the bank, which is every
    keystroke in it, then costs one lookup an item.
  */
  const usageIndex = useMemo(() => bankUsageIndex(projects), [projects]);
  const projectItemUsageMap = useMemo(() => {
    const map = new Map<string, ReadonlySet<string>>(); // itemId -> Set<projectId>
    bank.forEach((item) => map.set(item.id, projectsUsingItem(usageIndex, item)));
    return map;
  }, [bank, usageIndex]);
  /* The same, as the count each row and card shows. */
  const projectCounts = useMemo(() => {
    const map = new Map<string, number>();
    projectItemUsageMap.forEach((set, id) => map.set(id, set.size));
    return map;
  }, [projectItemUsageMap]);

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
      } else if (healthFilter === 'no-recipe') {
        if (!specs || recipeOf(item, specs)) return false;
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
  }, [bank, searchTerm, selectedCategory, selectedProjectId, healthFilter, projectItemUsageMap, specs]);

  // Executive Statistics
  const stats = useMemo(() => {
    const totalItems = bank.length;
    const totalCategories = new Set(bank.map((i) => i.cat || 'General')).size;
    /* A margin typed into a sheet can arrive as text; one such item must not spoil the average. */
    const avgMargin = bank.length > 0
      ? bank.reduce((sum, i) => sum + (Number(i.margin) || 0), 0) / bank.length
      : 0;
    const lowMarginCount = bank.filter((i) => (i.margin || 0) < 15).length;
    const itemsInProjectsCount = bank.filter((i) => (projectItemUsageMap.get(i.id)?.size || 0) > 0).length;
    /* Counted the way the filters below decide, so a pill's number is what picking it shows. */
    const missingSpecsCount = bank.filter((i) => !(i.specs && i.specs.trim().length > 0)).length;
    const multiplierCount = bank.filter((i) => !!i.areaMultiplierCoefficient && i.areaMultiplierCoefficient !== 1).length;
    return { totalItems, totalCategories, avgMargin, lowMarginCount, itemsInProjectsCount, missingSpecsCount, multiplierCount };
  }, [bank, projectItemUsageMap]);

  const categoryCounts = useMemo(() => {
    const n = new Map<string, number>();
    bank.forEach((i) => { const c = i.cat || 'General'; n.set(c, (n.get(c) || 0) + 1); });
    return categories.map((name) => ({ name, count: name === 'All' ? bank.length : n.get(name) || 0 }));
  }, [bank, categories]);

  const projectOptions = useMemo(
    () => projects.map((proj) => ({ id: proj.id, label: `${proj.context?.name || 'Untitled project'} (${proj.context?.clientName || 'Client'})` })),
    [projects],
  );

  const filtersOn = !!searchTerm.trim() || selectedCategory !== 'All' || selectedProjectId !== 'All' || healthFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('All');
    setSelectedProjectId('All');
    setHealthFilter('all');
  };

  // ==========================================
  // SELECTION HANDLERS
  // ==========================================
  /*
    These four are handed to every row and card. They are kept the same from
    one render to the next (useCallback), so a row that is remembered is not
    drawn again when a different one is edited.
  */
  const handleToggleSelectItem = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  /*
    Reaching the end of the list brings the next page in, so reading down the
    bank is one scroll rather than a button every sixty rows. It is still a
    page at a time: the cost that made the cap necessary is paid in small
    pieces, and only by someone who scrolled that far. The buttons stay for
    the keyboard, and where the browser cannot watch for it.
  */
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || hiddenCount <= 0 || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisibleCount((n) => n + PAGE);
    }, { rootMargin: '0px 0px 400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hiddenCount, viewMode, visibleCount]);

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
    /*
      The new item goes first in the list. A search or a filter left on would
      hide it (it has no name yet and a 20% margin), and Add would look as if
      it did nothing; from the room kits there is no list at all.
    */
    setSearchTerm('');
    setSelectedProjectId('All');
    setHealthFilter('all');
    if (viewMode === 'bundles') setViewMode(specs ? 'grid' : 'spreadsheet');
    listTopRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };

  const handleUpdateItem = useCallback((id: string, updatedItem: Item) => {
    setBank((prev) => prev.map((item) => (item.id === id ? updatedItem : item)));
  }, [setBank]);

  const handleDeleteItem = useCallback((id: string) => {
    setBank((prev) => prev.filter((item) => item.id !== id));
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [setBank]);

  /* The screen above passes a new function each time it draws; the cards are given one that stays. */
  const openRecipeRef = useRef(onOpenRecipe);
  openRecipeRef.current = onOpenRecipe;
  const openRecipe = useCallback((id: string) => openRecipeRef.current?.(id), []);

  const handleDuplicateItem = useCallback((item: Item) => {
    const dup: Item = {
      ...item,
      id: generateId(),
      name: `${item.name} (Copy)`,
    };
    setBank((prev) => [dup, ...prev]);
  }, [setBank]);

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
    const exportList = selectedItems.length > 0 ? selectedItems : wholeBank;
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

  const [isPriceLockOpen, setIsPriceLockOpen] = useState(false);
  const [isRepeatedOpen, setIsRepeatedOpen] = useState(false);
  const repeatedCount = useMemo(() => (canSettle ? duplicateGroups(wholeBank).length : 0), [canSettle, wholeBank]);

  /* Which project line uses which item, at what price (lib/bankUsageExport.ts). Reads only. */
  const handleExportUsage = () => {
    try {
      const studio = orgData?.orgName || 'Studio';
      const data = buildBankUsageExport(wholeBank, projects, { studio });
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = bankUsageFileName(studio);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Usage export failed:', err);
      alert('The usage file could not be made. Please try again.');
    }
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
      '🤖 StudioDesk AI: Initializing room-level bundle synthesis...',
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
      <BankCommandBar
        stats={stats}
        noRecipeCount={specs ? noRecipeCount : null}
        copyCount={copyCount}
        showCopies={showCopies}
        onToggleCopies={() => setShowCopies((v) => !v)}
        view={viewMode}
        onView={setViewMode}
        bundleCount={customBundles.length}
        health={healthFilter}
        onHealth={setHealthFilter}
        search={searchTerm}
        onSearch={setSearchTerm}
        categories={categoryCounts}
        category={selectedCategory}
        onCategory={setSelectedCategory}
        projects={projectOptions}
        projectId={selectedProjectId}
        onProject={setSelectedProjectId}
        matching={filteredBank.length}
        filtersOn={filtersOn}
        onClearFilters={clearFilters}
        onImportSheet={() => setIsTextImportOpen(true)}
        onImportSpecs={() => setIsSpecImportOpen(true)}
        onImportJson={() => fileInputRef.current?.click()}
        onExportJson={handleExportBank}
        onExportUsage={handleExportUsage}
        usageTitle={`Download which project lines use each item and at what price, across ${projects.length} project${projects.length === 1 ? '' : 's'}. Nothing is changed.`}
        onLockPrices={priceLock ? () => setIsPriceLockOpen(true) : undefined}
        onRepeated={canSettle && (repeatedCount > 0 || copyCount > 0) ? () => setIsRepeatedOpen(true) : undefined}
        repeatedCount={repeatedCount}
        onAiKits={handleAiSynthesis}
        aiBusy={isAiSynthesizing}
        onAdd={handleAddItem}
      />
      <input type="file" ref={fileInputRef} onChange={handleJsonUpload} accept=".json" className="hidden" />

      {/* 4. MAIN VIEWS RENDER. Keyed on the view, so one arrives (hud-swap) rather than cutting to the next. */}
      <div ref={listTopRef} key={viewMode} className="hud-swap scroll-mt-4 space-y-6">
      {viewMode !== 'bundles' && filteredBank.length === 0 && (
        <EmptyState
          icon={Search}
          title={bank.length === 0 ? 'The bank is empty' : 'Nothing matches'}
          text={bank.length === 0 ? 'Add the first item, or import a sheet of them.' : 'No item passes the search and filters that are on.'}
          action={bank.length === 0
            ? <Button size="sm" variant="primary" icon={Plus} onClick={handleAddItem}>Add item</Button>
            : <Button size="sm" icon={X} onClick={clearFilters}>Clear filters</Button>}
          className="bg-white hud-panel-in"
        />
      )}

      {viewMode === 'spreadsheet' && filteredBank.length > 0 && (
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
          onViewProjectUsage={setUsageModalItem}
          projectCounts={projectCounts}
        />
      )}

      {viewMode === 'grouped' && filteredBank.length > 0 && (
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
          onViewProjectUsage={setUsageModalItem}
          projectCounts={projectCounts}
        />
      )}

      {viewMode === 'grid' && filteredBank.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleBank.map((item, i) => (
            /* Cards rise in a row at a time; a page loaded later starts its own count. */
            <div key={item.id} className="hud-row-in min-w-0 grid" style={{ animationDelay: `${Math.min(i % PAGE, 11) * 25}ms` }}>
            <BankItemCard
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
              onViewProjectUsage={setUsageModalItem}
              projectCount={projectCounts.get(item.id) || 0}
              specBank={specs}
              onOpenRecipe={openRecipe}
            />
            </div>
          ))}
        </div>
      )}

      {/*
        Nothing is hidden silently: the count is always visible, and the way to
        see the rest is one click away. Rendering more is a deliberate choice
        because it is the expensive one.
      */}
      {viewMode !== 'bundles' && hiddenCount > 0 && (
        <div ref={moreRef} className="flex flex-wrap items-center justify-center gap-3 py-2">
          <span className="text-xs text-slate-500">
            Showing <span className="font-bold text-slate-800 tabular-nums">{visibleBank.length}</span> of {filteredBank.length} items
          </span>
          <Button size="sm" variant="primary" onClick={() => setVisibleCount((n) => n + PAGE)}>
            Show {Math.min(PAGE, hiddenCount)} more
          </Button>
          <Button size="sm" onClick={() => setVisibleCount(filteredBank.length)} title="Draws every row at once, which is slower on a large bank">
            Show all {filteredBank.length}
          </Button>
        </div>
      )}

      {/* VIEW: ROOM BUNDLES & KITS */}
      {viewMode === 'bundles' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <PanelHead
              icon={PackageCheck}
              title="Room kits"
              blurb="Items that go into a room together, so a whole room is added to a proposal in one click."
              aside={<Button size="sm" variant="primary" icon={Plus} onClick={() => setIsCreatingBundle(true)}>Create kit</Button>}
            />

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
                      className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3D52A0]"
                    />
                    <input
                      type="text"
                      placeholder="Description (Optional summary of items)"
                      value={newBundleDesc}
                      onChange={(e) => setNewBundleDesc(e.target.value)}
                      className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3D52A0]"
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
                                isPicked ? 'bg-[#3D52A0]/10 text-[#3D52A0] font-bold' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isPicked}
                                  onChange={() => {}}
                                  className="rounded text-[#3D52A0]"
                                />
                                <span>{item.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 tabular-nums">
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
                      className="px-5 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                    >
                      Save Room Kit
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bundles List */}
            {customBundles.length === 0 ? (
              <EmptyState
                icon={PackageCheck}
                title="No room kits yet"
                text="Make one from items you pick, or let AI room kits put the first few together."
                action={<Button size="sm" icon={Plus} onClick={() => setIsCreatingBundle(true)}>Create kit</Button>}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customBundles.map((bundle, bundleIndex) => {
                  const isEditing = editingBundleId === bundle.id;
                  const isExpanded = expandedBundleIds.has(bundle.id);
                  const bundleItems = bank.filter((i) => bundle.itemIds.includes(i.id));
                  const bundleTotalCost = bundleItems.reduce((sum, i) => sum + (i.materials || 0) + (i.labor || 0), 0);

                  return (
                    <div
                      key={bundle.id}
                      className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 pp-lift hud-row-in hover:border-[#3D52A0]/40 flex flex-col justify-between"
                      style={{ animationDelay: `${Math.min(bundleIndex, 11) * 30}ms` }}
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
                                className="px-3 py-1 bg-[#3D52A0] text-white rounded-lg text-xs font-bold"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
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
                          <span>{bundleItems.length} {bundleItems.length === 1 ? 'item' : 'items'}</span>
                          <span>•</span>
                          <span>Base cost {formatCurrency(bundleTotalCost)}</span>
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
                        <div className="space-y-2 p-2 bg-[#3D52A0]/5 rounded-xl border border-[#3D52A0]/20">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase text-[#3D52A0]">
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
                                  className="p-1.5 text-[11px] hover:bg-[#3D52A0]/10 cursor-pointer flex justify-between"
                                >
                                  <span>{item.name}</span>
                                  <Plus className="w-3 h-3 text-[#3D52A0]" />
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsAddingItemToBundleId(bundle.id)}
                          className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          Add item to kit
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

      </div>

      {/* 5. The selection bar: rises from the foot of the screen while items are ticked. */}
      <AnimatePresence>
        {selectedItemIds.size > 0 && (
          <motion.div
            role="region"
            aria-label="Selected items"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="fixed bottom-6 inset-x-4 max-w-4xl mx-auto z-40 bg-[#12182F]/95 backdrop-blur-md text-white rounded-2xl px-4 py-3 shadow-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <span className="min-w-8 h-8 px-2 bg-[#3D52A0] rounded-full flex items-center justify-center text-sm font-black tabular-nums">
                <CountUp value={selectedItemIds.size} />
              </span>
              <div>
                <div className="text-sm font-bold">{selectedItemIds.size === 1 ? 'Item selected' : 'Items selected'}</div>
                <div className="text-[11px] text-slate-400">Change them together</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ['category', 'Change category', FolderEdit],
                ['margin', 'Revise margin', Percent],
                ['cost', 'Rate inflation', TrendingUp],
                ['uom', 'Set unit', Ruler],
                ['bundle', 'Package to kit', PackagePlus],
              ] as Array<[BulkActionType, string, React.ComponentType<any>]>).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => openBulkModalWithTab(tab)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors motion-safe:active:scale-[0.97]"
                >
                  <Icon className="w-3.5 h-3.5 text-slate-300" />
                  {label}
                </button>
              ))}

              <button
                type="button"
                onClick={handleBulkDelete}
                className="p-2 text-rose-400 hover:text-white hover:bg-rose-600 rounded-xl transition-colors"
                title="Delete selected items"
                aria-label="Delete selected items"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setSelectedItemIds(new Set())}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                title="Clear selection"
                aria-label="Clear selection"
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

      {isSpecImportOpen && (
        <BankSpecImportModal
          bank={bank}
          onExport={handleExportSpecs}
          onClose={() => setIsSpecImportOpen(false)}
          onApply={(updates) => {
            setBank((prev) => applySpecs(prev, updates));
            setIsSpecImportOpen(false);
            alert(`Specifications updated on ${updates.size} item${updates.size === 1 ? '' : 's'}.`);
          }}
        />
      )}

      {isPriceLockOpen && priceLock && (
        <PriceLockModal
          bank={wholeBank}
          studio={orgData?.orgName || 'Studio'}
          read={priceLock.read}
          save={priceLock.save}
          onClose={() => setIsPriceLockOpen(false)}
        />
      )}

      {isRepeatedOpen && canSettle && (
        <RepeatedItemsModal bank={wholeBank} projects={projects} setBank={setBank} read={priceLock?.read} onClose={() => setIsRepeatedOpen(false)} />
      )}

      {/* 8. BULK IMPORT MODAL (CSV/Excel) */}
      <BulkImportModal
        isOpen={isTextImportOpen}
        onClose={() => setIsTextImportOpen(false)}
        onImport={(importedItems) => {
          // One the bank already has by name and unit goes in as its copy, not as another item.
          setBank((prev) => addToBank(prev, importedItems, 'start'));
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
                  <Sparkles className="w-4 h-4 text-slate-300" />
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

              <div className="p-5 space-y-2 max-h-72 overflow-y-auto text-xs text-slate-300">
                {aiLogMessages.map((msg, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {msg}
                  </div>
                ))}
                {isAiSynthesizing && (
                  <div className="flex items-center gap-2 text-slate-300 pt-2">
                    <div className="w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                    <span>Synthesizing recipes...</span>
                  </div>
                )}
              </div>

              {!isAiSynthesizing && (
                <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => setShowAiConsole(false)}
                    className="px-4 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white rounded-xl text-xs font-bold uppercase tracking-wider"
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
