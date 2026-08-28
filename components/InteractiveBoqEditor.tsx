import React, { useState, useMemo, useEffect } from 'react';
import { ProjectContext, Item, BoqItem, Room, FullBoqItem } from '../types';
import { calculateSellPrice, formatCurrency, generateId } from '../lib/utils';
import { ADDON_BUNDLES } from '../lib/standardPackages';
import { 
  FolderIcon, 
  Trash2, 
  Plus, 
  Minus,
  Search, 
  Check, 
  AlertCircle,
  FileSpreadsheet,
  Layers2,
  ChevronRight,
  Sparkles,
  Calculator,
  Grid,
  TrendingUp,
  Sliders,
  X,
  PlusCircle,
  FolderOpen,
  Briefcase,
  Edit2,
  ArrowRight,
  Layers,
  CheckCircle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MarginDeviationIndicator } from './MarginDeviationIndicator';

interface InteractiveBoqEditorProps {
  items: FullBoqItem[];
  rooms: Room[];
  bank: Item[];
  customBundles?: { id: string; name: string; description: string; itemIds: string[] }[];
  onUpdate: (itemId: string, fieldOrUpdates: keyof BoqItem | Partial<BoqItem>, value?: any) => void;
  onBulkUpdate?: (updates: { itemId: string; updates: Partial<BoqItem> }[]) => void;
  onDelete: (itemId: string) => void;
  setTiers: React.Dispatch<React.SetStateAction<any[]>>;
  activeTierId: string | null;
  boqFrozen?: boolean;
}

export const InteractiveBoqEditor: React.FC<InteractiveBoqEditorProps> = ({
  items,
  rooms,
  bank,
  customBundles = [],
  onUpdate,
  onBulkUpdate,
  onDelete,
  setTiers,
  activeTierId,
  boqFrozen = false
}) => {
  // Navigation & Filtering State
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.name || 'All Rooms');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Custom View: Split-Pane Selection State
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Library state (Design Bank)
  const [libSearch, setLibSearch] = useState<string>('');
  const [libCategory, setLibCategory] = useState<string>('All');
  const [libTab, setLibTab] = useState<'items' | 'bundles'>('items');

  // Success indicator state for quick adds
  const [addedIndicator, setAddedIndicator] = useState<{ [key: string]: boolean }>({});

  // Reset selected item if room changes
  useEffect(() => {
    setSelectedItemId(null);
  }, [selectedRoomId]);

  // Memoize room statistics
  const roomStats = useMemo(() => {
    const stats: Record<string, { count: number; total: number; materials: number; labor: number }> = {};
    
    // Initialize
    rooms.forEach(r => {
      stats[r.name] = { count: 0, total: 0, materials: 0, labor: 0 };
    });
    stats['Unassigned'] = { count: 0, total: 0, materials: 0, labor: 0 };

    items.forEach(item => {
      const room = item.roomId || 'Unassigned';
      if (!stats[room]) {
        stats[room] = { count: 0, total: 0, materials: 0, labor: 0 };
      }
      const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
      const rowTotal = sellPrice * item.qty;
      
      if (item.boqStatus !== 'deleted' && item.boqStatus !== 'substituted' && item.boqStatus !== 'excluded' && item.boqStatus !== 'client_procured') {
        stats[room].count += 1;
        stats[room].total += rowTotal;
        stats[room].materials += (item.materials || 0) * item.qty;
        stats[room].labor += (item.labor || 0) * item.qty;
      }
    });

    return stats;
  }, [items, rooms]);

  // Project-wide stats
  const projectStats = useMemo(() => {
    let count = 0;
    let grandTotal = 0;
    let firmTotal = 0;
    let estimateExposure = 0;
    let materialsCost = 0;
    let laborCost = 0;

    items.forEach(item => {
      const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
      const val = sellPrice * item.qty;
      
      if (item.boqStatus !== 'deleted' && item.boqStatus !== 'substituted') {
        if (item.boqStatus !== 'excluded' && item.boqStatus !== 'client_procured') {
          count++;
          grandTotal += val;
          materialsCost += (item.materials || 0) * item.qty;
          laborCost += (item.labor || 0) * item.qty;

          if (['as_actuals', 'provisional_sum', 'pending_finalisation'].includes(item.boqStatus || '')) {
            estimateExposure += val;
          } else {
            firmTotal += val;
          }
        }
      }
    });

    const profit = grandTotal - (materialsCost + laborCost);
    const avgMargin = grandTotal > 0 ? (profit / grandTotal) * 100 : 0;

    return { count, grandTotal, firmTotal, estimateExposure, materialsCost, laborCost, profit, avgMargin };
  }, [items]);

  // Combine standard and custom bundles
  const allBundles = useMemo(() => {
    const standard = ADDON_BUNDLES.map(b => ({ ...b, isCustom: false }));
    const custom = customBundles.map(b => ({ ...b, isCustom: true, icon: '🌟' }));
    return [...custom, ...standard];
  }, [customBundles]);

  // Filter items for the active view
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Room match
      const roomMatch = selectedRoomId === 'All Rooms' || item.roomId === selectedRoomId || (selectedRoomId === 'Unassigned' && !item.roomId);
      if (!roomMatch) return false;

      // Category match
      const catMatch = activeCategory === 'All' || item.cat === activeCategory;
      if (!catMatch) return false;

      // Search query match
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const nameMatch = (item.name || '').toLowerCase().includes(query);
        const specsMatch = (item.specs || '').toLowerCase().includes(query);
        const catNameMatch = (item.cat || '').toLowerCase().includes(query);
        return nameMatch || specsMatch || catNameMatch;
      }

      return true;
    });
  }, [items, selectedRoomId, activeCategory, searchQuery]);

  // Get active selected item details
  const activeSelectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return items.find(i => i.id === selectedItemId) || null;
  }, [items, selectedItemId]);

  // Get unique categories of current room's items
  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    items.forEach(item => {
      const roomMatch = selectedRoomId === 'All Rooms' || item.roomId === selectedRoomId || (selectedRoomId === 'Unassigned' && !item.roomId);
      if (roomMatch && item.cat) {
        categories.add(item.cat);
      }
    });
    return ['All', ...Array.from(categories)];
  }, [items, selectedRoomId]);

  // Bank search/filters
  const filteredBank = useMemo(() => {
    return bank.filter(item => {
      const searchMatch = libSearch === '' || 
        item.name.toLowerCase().includes(libSearch.toLowerCase()) || 
        item.specs.toLowerCase().includes(libSearch.toLowerCase());
      
      const catMatch = libCategory === 'All' || item.cat === libCategory;
      return searchMatch && catMatch;
    });
  }, [bank, libSearch, libCategory]);

  // Bank unique categories
  const bankCategories = useMemo(() => {
    const categories = new Set<string>();
    bank.forEach(item => {
      if (item.cat) categories.add(item.cat);
    });
    return ['All', ...Array.from(categories)];
  }, [bank]);

  // Quick Actions: Quantity Increments/Decrements
  const handleQtyChange = (itemId: string, currentQty: number, increment: boolean) => {
    const nextQty = increment ? currentQty + 1 : Math.max(0.5, currentQty - 1);
    onUpdate(itemId, 'qty', nextQty);
  };

  // Quick actions: Add item
  const handleQuickAddItem = (bankItem: Item) => {
    let targetRoom: string | undefined = selectedRoomId === 'All Rooms' ? (rooms[0]?.name || undefined) : selectedRoomId;
    if (targetRoom === 'Unassigned') targetRoom = undefined;

    const newId = generateId();
    const newBoqItem: BoqItem = {
      id: newId,
      bankId: bankItem.id,
      qty: 1,
      roomId: targetRoom,
      rationale: 'Added via Focus Studio Workspace',
      baseRate: bankItem.materials,
      marginOverride: bankItem.margin,
      boqStatus: 'included_ffds_scope'
    };

    setTiers(prev => prev.map(tier => {
      if (tier.id !== activeTierId) return tier;
      return { ...tier, boq: [...(tier.boq || []), newBoqItem] };
    }));

    // Select the newly added item immediately for high productivity editing!
    setSelectedItemId(newId);

    // Trigger success indicator
    setAddedIndicator(prev => ({ ...prev, [bankItem.id]: true }));
    setTimeout(() => {
      setAddedIndicator(prev => ({ ...prev, [bankItem.id]: false }));
    }, 1200);
  };

  // Quick actions: Add Bundle
  const handleQuickAddBundle = (bundle: typeof allBundles[0]) => {
    let targetRoom: string | undefined = selectedRoomId === 'All Rooms' ? (rooms[0]?.name || undefined) : selectedRoomId;
    if (targetRoom === 'Unassigned') targetRoom = undefined;

    const newItems: BoqItem[] = [];
    bundle.itemIds.forEach(itemId => {
      const bankItem = bank.find(bi => bi.id === itemId);
      if (bankItem) {
        newItems.push({
          id: generateId(),
          bankId: bankItem.id,
          qty: 1,
          roomId: targetRoom,
          rationale: `Added from Bundle: ${bundle.name}`,
          baseRate: bankItem.materials,
          marginOverride: bankItem.margin,
          boqStatus: 'included_ffds_scope'
        });
      }
    });

    if (newItems.length === 0) return;

    setTiers(prev => prev.map(tier => {
      if (tier.id !== activeTierId) return tier;
      return { ...tier, boq: [...(tier.boq || []), ...newItems] };
    }));

    setAddedIndicator(prev => ({ ...prev, [bundle.id]: true }));
    setTimeout(() => {
      setAddedIndicator(prev => ({ ...prev, [bundle.id]: false }));
    }, 1200);
  };

  // Helper to map category names to nice emoji visual representations
  const getCategoryEmoji = (category?: string): string => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('wood') || cat.includes('carpentry') || cat.includes('furniture')) return '🛋️';
    if (cat.includes('electrical') || cat.includes('light')) return '⚡';
    if (cat.includes('civil') || cat.includes('flooring') || cat.includes('tile')) return '🧱';
    if (cat.includes('painting') || cat.includes('wall')) return '🎨';
    if (cat.includes('kitchen')) return '🍳';
    if (cat.includes('ceiling') || cat.includes('pop')) return '📐';
    if (cat.includes('plumbing') || cat.includes('bath')) return '🚿';
    return '📦';
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-140px)] min-h-[850px] overflow-hidden">
      
      {/* 1. HORIZONTAL SPACE NAVIGATOR (Keeps track of room totals seamlessly) */}
      <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-3.5 shadow-2xs shrink-0">
        <div className="flex justify-between items-center mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Design Spaces Overview</span>
            <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
              {rooms.length} Rooms registered
            </span>
          </div>
          <div className="text-xs text-slate-500 font-normal">
            BOQ Total: <strong className="font-mono text-slate-900 text-sm font-bold tabular-nums">{formatCurrency(projectStats.grandTotal)}</strong>
          </div>
        </div>

        {/* Scrollable strip of horizontal space cards */}
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200">
          
          {/* ALL SPACES CARD */}
          <button
            onClick={() => {
              setSelectedRoomId('All Rooms');
              setActiveCategory('All');
            }}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 ${
              selectedRoomId === 'All Rooms'
                ? 'bg-[#0066CC] border-[#0066CC] text-white shadow-md'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-700'
            }`}
          >
            <div className={`p-2 rounded-lg shrink-0 ${selectedRoomId === 'All Rooms' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600 shadow-sm'}`}>
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-grow">
              <div className={`text-xs font-black truncate ${selectedRoomId === 'All Rooms' ? 'text-white' : 'text-slate-900 group-hover:text-slate-900'}`}>
                All Rooms combined
              </div>
              <div className="flex justify-between items-center mt-0.5">
                <span className={`text-[9px] font-bold ${selectedRoomId === 'All Rooms' ? 'text-slate-300' : 'text-slate-500'}`}>
                  {items.filter(i => i.boqStatus !== 'deleted' && i.boqStatus !== 'excluded').length} items
                </span>
                <span className={`text-xs font-mono font-black ${selectedRoomId === 'All Rooms' ? 'text-white' : 'text-slate-800'}`}>
                  {formatCurrency(projectStats.grandTotal)}
                </span>
              </div>
            </div>
          </button>

          {/* ROOM CARDS */}
          {rooms.map(room => {
            const stats = roomStats[room.name] || { count: 0, total: 0 };
            const isActive = selectedRoomId === room.name;

            return (
              <button
                key={room.name}
                onClick={() => {
                  setSelectedRoomId(room.name);
                  setActiveCategory('All');
                }}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 group ${
                  isActive
                    ? 'bg-[#0066CC] border-[#0066CC] text-white shadow-md'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-700'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                  isActive 
                    ? 'bg-white/15 text-white' 
                    : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                }`}>
                  <Grid className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-grow">
                  <div className={`text-xs font-black truncate ${isActive ? 'text-white' : 'text-slate-900 group-hover:text-slate-900'}`}>
                    {room.name}
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <span className={`text-[9px] font-bold ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                      {stats.count} items • {room.size} {room.unit}
                    </span>
                    <span className={`text-xs font-mono font-black ${isActive ? 'text-white' : 'text-slate-800'}`}>
                      {formatCurrency(stats.total)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}

          {/* UNASSIGNED */}
          {roomStats['Unassigned']?.count > 0 && (
            <button
              onClick={() => {
                setSelectedRoomId('Unassigned');
                setActiveCategory('All');
              }}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 ${
                selectedRoomId === 'Unassigned'
                  ? 'bg-[#0066CC] border-[#0066CC] text-white shadow-md'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-700'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${
                selectedRoomId === 'Unassigned' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-grow">
                <div className={`text-xs font-black truncate ${selectedRoomId === 'Unassigned' ? 'text-white' : 'text-slate-900'}`}>Unassigned Items</div>
                <div className="flex justify-between items-center mt-0.5">
                  <span className={`text-[9px] font-bold ${selectedRoomId === 'Unassigned' ? 'text-slate-300' : 'text-slate-400'}`}>
                    {roomStats['Unassigned'].count} items
                  </span>
                  <span className={`text-xs font-mono font-black ${selectedRoomId === 'Unassigned' ? 'text-white' : 'text-slate-800'}`}>
                    {formatCurrency(roomStats['Unassigned'].total)}
                  </span>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 2. LOWER SPLIT-PANE SECTION (Gives a clean, non-spreadsheet visual view) */}
      <div className="flex-grow flex flex-col lg:flex-row gap-5 overflow-hidden min-h-0">
        
        {/* LEFT COLUMN: Premium Design Item Cards Deck (60% width) */}
        <div className="w-full lg:w-[58%] bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full overflow-hidden">
          
          {/* Header & Internal Filters */}
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#0066CC]">Active Workspace</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              </div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 mt-0.5">
                {selectedRoomId}
                <span className="text-xs text-slate-500 font-bold">({filteredItems.length} design components)</span>
              </h2>
            </div>

            {/* Quick Filter Box */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search specs or names..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0066CC] w-44 shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Sub-Category Tags strip inside space */}
          {uniqueCategories.length > 2 && (
            <div className="px-3 py-2 border-b border-slate-50 bg-white flex flex-wrap gap-1 overflow-x-auto shrink-0">
              {uniqueCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    setSelectedItemId(null); // Clear selected item when filter changes
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${
                    activeCategory === cat
                      ? 'bg-[#0066CC] text-white shadow-sm'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* ITEM DECK CARDS STACK */}
          <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-slate-50/30">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-12 h-12 bg-sky-50 text-[#0066CC] rounded-2xl flex items-center justify-center mb-3">
                  <Briefcase className="w-6 h-6" />
                </div>
                <h3 className="text-slate-800 font-black text-sm mb-1">No Design Items Listed</h3>
                <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                  There are no components defined for this room. Use the **Studio Catalog & Bundles** panel on the right to instantly drop pre-configured design items into this space!
                </p>
              </div>
            ) : (
              filteredItems.map(item => {
                const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
                const totalSell = sellPrice * item.qty;
                const isSelected = selectedItemId === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`p-3.5 rounded-2xl border transition-all text-xs flex flex-col md:flex-row gap-3 items-start md:items-center justify-between cursor-pointer relative ${
                      isSelected
                        ? 'bg-sky-50 border-sky-300 shadow-md ring-2 ring-[#0066CC]/10'
                        : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Visual Card Left-half: Identifier & Info */}
                    <div className="flex gap-3 items-start min-w-0 flex-grow">
                      <div className="w-9 h-9 flex items-center justify-center rounded-xl text-lg shrink-0 bg-slate-50 border border-slate-100">
                        {getCategoryEmoji(item.cat)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-xs leading-tight group-hover:text-slate-800">
                            {item.name}
                          </span>
                          <span className="text-[8px] uppercase tracking-widest font-black text-slate-400">
                            {item.cat}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                          {item.specs || 'Click card to edit detailed finishes and specifications...'}
                        </p>
                        
                        {/* Compact Rate Tag */}
                        <div className="text-[10px] text-slate-400 mt-1 font-medium flex items-center gap-1.5">
                          <span>Unit Rate:</span>
                          <strong className="font-mono text-slate-700">{formatCurrency(sellPrice)} / {item.unit}</strong>
                          <span className="text-slate-200">|</span>
                          <span className="text-slate-400 flex items-center gap-1.5 flex-wrap">
                            Margin: <strong className="text-slate-700">{item.margin}%</strong>
                            <MarginDeviationIndicator margin={item.margin} />
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Visual Card Right-half: Action Stepper & Totals */}
                    <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto pt-2.5 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                      
                      {/* Tactile Quantity Stepper */}
                      <div 
                        className="flex items-center gap-1 bg-slate-50 border border-slate-150 p-1 rounded-xl shadow-inner"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQtyChange(item.id, item.qty, false);
                          }}
                          className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 transition-colors shrink-0"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        
                        <div className="flex flex-col items-center justify-center min-w-[54px] max-w-[70px]">
                          <input
                            type="number"
                            step="any"
                            value={item.qty}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 0) {
                                onUpdate(item.id, 'qty', val);
                              } else if (e.target.value === '') {
                                onUpdate(item.id, 'qty', 0);
                              }
                            }}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (isNaN(val) || val <= 0) {
                                onUpdate(item.id, 'qty', 1);
                              }
                            }}
                            className="w-full text-center font-mono font-black text-xs text-slate-900 bg-transparent border-0 p-0 m-0 focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0"
                          />
                          <span className="block text-[7px] uppercase font-bold text-slate-400 select-none pointer-events-none -mt-0.5 leading-none">{item.unit}</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQtyChange(item.id, item.qty, true);
                          }}
                          className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 transition-colors shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Prominent Formatted Price */}
                      <div className="text-right min-w-[100px]">
                        <div className="text-xs font-black text-slate-900 font-mono">
                          {formatCurrency(totalSell)}
                        </div>
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">
                          Subtotal
                        </span>
                      </div>

                      {/* Inline Delete trigger */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(item.id);
                        }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete component"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Left panel subtotal summary */}
          <div className="p-3.5 border-t border-slate-100 bg-slate-50/40 shrink-0 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Selected Room Subtotal:</span>
            <strong className="font-mono text-slate-900 font-black text-base">
              {formatCurrency(
                selectedRoomId === 'All Rooms' 
                  ? projectStats.grandTotal 
                  : (roomStats[selectedRoomId]?.total || 0)
              )}
            </strong>
          </div>
        </div>

        {/* RIGHT COLUMN: Contextual Inspector & Action Studio (42% width) */}
        <div className="w-full lg:w-[42%] bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full overflow-hidden">
          
          {/* INSPECTOR STATE A: Selected Item Specification Editor */}
          {activeSelectedItem ? (
            <div className="flex flex-col h-full overflow-hidden">
              
              {/* Editor Header */}
              <div className="p-3.5 border-b border-slate-100 bg-sky-50/30 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-sky-100 text-sky-800 rounded-lg flex items-center justify-center text-xs">
                    <Edit2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#0066CC]">Component Inspector</span>
                    <h3 className="text-xs font-black text-slate-900 truncate max-w-[210px]">{activeSelectedItem.name}</h3>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedItemId(null)}
                  className="px-2.5 py-1 text-[10px] font-black bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg flex items-center gap-1 shadow-sm transition-all"
                >
                  <X className="w-3 h-3" /> Close Editor
                </button>
              </div>

              {/* Form container scrollable */}
              <div className="flex-grow overflow-y-auto p-4 space-y-4">
                
                {/* 1. Item name */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    Design Item Name
                  </label>
                  <input
                    type="text"
                    value={activeSelectedItem.name || ''}
                    onChange={e => onUpdate(activeSelectedItem.id, 'name', e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0066CC] focus:ring-1 focus:ring-sky-100 rounded-xl text-xs font-extrabold text-slate-900 transition-all shadow-inner"
                  />
                </div>

                {/* 2. Full specification details (Large, spacious text box) */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    Finishes & Technical Specifications
                  </label>
                  <textarea
                    rows={4}
                    value={activeSelectedItem.specs || ''}
                    onChange={e => onUpdate(activeSelectedItem.id, 'specs', e.target.value)}
                    placeholder="E.g., 18mm Century Laminate, heavy duty hardware, premium PU paint finish..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0066CC] focus:ring-1 focus:ring-sky-100 rounded-xl text-xs font-medium text-slate-700 transition-all leading-relaxed shadow-inner"
                  />
                </div>

                {/* Grid 3-cols: Category, Unit, & Quantity */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      Design Category
                    </label>
                    <input
                      type="text"
                      value={activeSelectedItem.cat || ''}
                      onChange={e => onUpdate(activeSelectedItem.id, 'category', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0066CC] focus:ring-1 focus:ring-sky-100 rounded-xl text-xs font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      Measurement Unit
                    </label>
                    <input
                      type="text"
                      value={activeSelectedItem.unit || ''}
                      onChange={e => onUpdate(activeSelectedItem.id, 'unit', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0066CC] focus:ring-1 focus:ring-sky-100 rounded-xl text-xs font-bold text-slate-800 text-center uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#0066CC] mb-1 font-extrabold">
                      Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={activeSelectedItem.qty}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0) {
                          onUpdate(activeSelectedItem.id, 'qty', val);
                        } else if (e.target.value === '') {
                          onUpdate(activeSelectedItem.id, 'qty', 0);
                        }
                      }}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (isNaN(val) || val <= 0) {
                          onUpdate(activeSelectedItem.id, 'qty', 1);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-sky-50/50 border border-sky-200 focus:bg-white focus:border-[#0066CC] focus:ring-1 focus:ring-sky-100 rounded-xl text-xs font-black text-slate-900 font-mono text-center"
                    />
                  </div>
                </div>

                {/* Total Unit Cost (Combined) Helper */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Total Unit Cost (Combined Mat + Lab)
                    </label>
                    <span className="text-[9px] text-[#0066CC] font-bold bg-sky-50/60 px-1.5 py-0.5 rounded-md">
                      Auto-Splits 65:35 or Bank Ratio
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      value={Math.round((activeSelectedItem.materials || 0) + (activeSelectedItem.labor || 0)) || ''}
                      onChange={e => {
                        const totalVal = Number(e.target.value) || 0;
                        const bankItem = bank.find(i => i.id === activeSelectedItem.bankId);
                        let materialRatio = 0.65;
                        let laborRatio = 0.35;
                        
                        if (bankItem) {
                          const bankTotal = (bankItem.materials || 0) + (bankItem.labor || 0);
                          if (bankTotal > 0) {
                            materialRatio = (bankItem.materials || 0) / bankTotal;
                            laborRatio = (bankItem.labor || 0) / bankTotal;
                          }
                        }
                        
                        const newMaterials = parseFloat((totalVal * materialRatio).toFixed(2));
                        const newLabor = parseFloat((totalVal * laborRatio).toFixed(2));
                        
                        onUpdate(activeSelectedItem.id, {
                          baseRate: newMaterials,
                          labor: newLabor
                        });
                      }}
                      placeholder="Enter combined total cost to auto-split..."
                      className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0066CC] focus:ring-1 focus:ring-sky-100 rounded-xl text-xs font-mono font-black text-slate-900 shadow-inner"
                    />
                  </div>
                </div>

                {/* Grid 2-cols: Materials & Labor rates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      Material Rate (Cost)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        value={activeSelectedItem.materials}
                        onChange={e => onUpdate(activeSelectedItem.id, 'baseRate', Number(e.target.value) || 0)}
                        className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0066CC] focus:ring-1 focus:ring-sky-100 rounded-xl text-xs font-mono font-bold text-slate-800 text-right shadow-inner"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      Labor Rate (Cost)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        value={activeSelectedItem.labor}
                        onChange={e => onUpdate(activeSelectedItem.id, 'labor', Number(e.target.value) || 0)}
                        className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0066CC] focus:ring-1 focus:ring-sky-100 rounded-xl text-xs font-mono font-bold text-slate-800 text-right shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Profit Margin Slider with Real-Time calculations */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Studio Profit Margin (%)
                    </label>
                    <span className="text-xs font-black text-[#0055B3] font-mono bg-sky-50 px-2 py-0.5 rounded">
                      {activeSelectedItem.margin}%
                    </span>
                  </div>
                  
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="1"
                    value={activeSelectedItem.margin}
                    onChange={e => onUpdate(activeSelectedItem.id, 'marginOverride', Number(e.target.value) || 0)}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0066CC] mb-3"
                  />

                  {/* Calculations feedback details */}
                  <div className="space-y-1 pt-1 border-t border-slate-200/50 text-[11px] text-slate-500">
                    <div className="flex justify-between items-center">
                      <span>Total Unit Cost (Mat + Lab):</span>
                      <span className="font-mono text-slate-700">
                        {formatCurrency((activeSelectedItem.materials || 0) + (activeSelectedItem.labor || 0))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Client Sell Price (Unit):</span>
                      <span className="font-mono text-slate-900 font-extrabold">
                        {formatCurrency(calculateSellPrice(activeSelectedItem.materials, activeSelectedItem.labor, activeSelectedItem.margin))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-dashed border-slate-200 text-emerald-600 font-bold">
                      <span>Projected Studio Profit (Total):</span>
                      <span className="font-mono text-xs font-black">
                        {formatCurrency(
                          (calculateSellPrice(activeSelectedItem.materials, activeSelectedItem.labor, activeSelectedItem.margin) - 
                          ((activeSelectedItem.materials || 0) + (activeSelectedItem.labor || 0))) * activeSelectedItem.qty
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. Space Assignment */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    Reassign to Design Space
                  </label>
                  <select
                    value={activeSelectedItem.roomId || 'Unassigned'}
                    onChange={e => {
                      const value = e.target.value === 'Unassigned' ? undefined : e.target.value;
                      onUpdate(activeSelectedItem.id, 'roomId', value);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0066CC] rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="Unassigned">Unassigned Items</option>
                    {rooms.map(r => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Sticky bottom save/confirm notification */}
              <div className="p-3 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 text-center font-medium">
                ✨ Subtotals and margin schedules recalculate on-the-fly
              </div>
            </div>
          ) : (
            
            /* INSPECTOR STATE B: Design Bank Catalog (When no item is selected) */
            <div className="flex flex-col h-full overflow-hidden">
              
              {/* Tab headers */}
              <div className="px-4 pt-3 border-b border-slate-100 bg-slate-50/40 shrink-0">
                <div className="mb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" /> Studio Design Library
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Add standard items or pre-made bundles into <strong>{selectedRoomId}</strong>.
                  </p>
                </div>

                <div className="flex border-b border-slate-100 pb-1.5">
                  <button
                    onClick={() => setLibTab('items')}
                    className={`flex-1 pb-1 text-xs font-black text-center border-b-2 transition-all ${
                      libTab === 'items'
                        ? 'border-[#0066CC] text-slate-800'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Catalog Items ({filteredBank.length})
                  </button>
                  <button
                    onClick={() => setLibTab('bundles')}
                    className={`flex-1 pb-1 text-xs font-black text-center border-b-2 transition-all ${
                      libTab === 'bundles'
                        ? 'border-[#0066CC] text-slate-800'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Room Packages ({allBundles.length})
                  </button>
                </div>
              </div>

              {/* Tab 1: Catalog search & items list */}
              {libTab === 'items' && (
                <div className="flex flex-col flex-grow overflow-hidden">
                  
                  {/* Internal library search bar */}
                  <div className="p-3 bg-slate-50/50 border-b border-slate-100 space-y-2 shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter catalog by name..."
                        value={libSearch}
                        onChange={e => setLibSearch(e.target.value)}
                        className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-150 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0066CC] transition-all shadow-sm"
                      />
                      {libSearch && (
                        <button onClick={() => setLibSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 font-bold">
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Horizontal categories list inside bank */}
                    <div className="flex gap-1 overflow-x-auto pb-1 max-h-8 scrollbar-none">
                      {bankCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setLibCategory(cat)}
                          className={`px-2 py-0.5 rounded text-[9px] font-black shrink-0 transition-all ${
                            libCategory === cat
                              ? 'bg-[#0066CC] text-white shadow-sm'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Catalog components loop */}
                  <div className="flex-grow overflow-y-auto p-4 space-y-2.5 bg-slate-50/20">
                    {filteredBank.length === 0 ? (
                      <div className="text-center py-10 text-xs text-slate-400">
                        No catalog templates found
                      </div>
                    ) : (
                      filteredBank.map(bankItem => {
                        const isAdded = addedIndicator[bankItem.id];
                        return (
                          <div
                            key={bankItem.id}
                            className={`p-3 rounded-2xl border transition-all text-xs flex gap-3 items-start relative overflow-hidden group ${
                              isAdded 
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'
                            }`}
                          >
                            {isAdded && (
                              <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none animate-pulse"></div>
                            )}

                            <div className="flex-grow min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-extrabold text-slate-900 text-xs leading-tight block truncate group-hover:text-slate-800">
                                  {bankItem.name}
                                </span>
                                <span className="text-[8px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wider font-black">
                                  {bankItem.unit}
                                </span>
                              </div>
                              
                              <p className="text-[10px] text-slate-400 leading-snug mt-1 line-clamp-2" title={bankItem.specs}>
                                {bankItem.specs || "No specifications loaded."}
                              </p>

                              <div className="flex justify-between items-center mt-2 border-t border-slate-50 pt-1.5">
                                <span className="text-[10px] text-slate-500">
                                  Base Cost: <strong className="font-mono text-slate-700">{formatCurrency(bankItem.materials)}</strong>
                                </span>
                                <span className="text-[8px] text-slate-400 font-extrabold bg-sky-50/50 px-1.5 py-0.5 rounded uppercase">
                                  {bankItem.cat}
                                </span>
                              </div>
                            </div>

                            {/* TAP TO ADD BUTTON */}
                            <button
                              type="button"
                              onClick={() => handleQuickAddItem(bankItem)}
                              disabled={isAdded}
                              className={`p-1.5 rounded-lg transition-all self-center shadow-sm flex items-center justify-center shrink-0 ${
                                isAdded
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-sky-50 hover:bg-[#0066CC] text-[#0055B3] hover:text-white border border-sky-100'
                              }`}
                            >
                              {isAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Standard Room Packages (Bundles) */}
              {libTab === 'bundles' && (
                <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-slate-50/20">
                  {allBundles.map(bundle => {
                    const isAdded = addedIndicator[bundle.id];
                    return (
                      <div
                        key={bundle.id}
                        className={`p-3.5 rounded-2xl border transition-all relative overflow-hidden group ${
                          isAdded
                            ? 'bg-emerald-50 border-emerald-200'
                            : bundle.isCustom
                              ? 'bg-amber-50/40 border-amber-100 hover:border-amber-400'
                              : 'bg-white border-slate-100 hover:border-sky-400'
                        }`}
                      >
                        {bundle.isCustom && (
                          <span className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-bl tracking-widest">
                            Custom
                          </span>
                        )}

                        <div className="flex gap-3 items-start">
                          <div className={`text-xl w-8 h-8 flex items-center justify-center rounded-full shrink-0 ${
                            bundle.isCustom ? 'bg-amber-100' : 'bg-sky-50'
                          }`}>
                            {bundle.icon}
                          </div>

                          <div className="flex-grow min-w-0">
                            <h4 className="font-extrabold text-slate-900 text-xs truncate pr-10">{bundle.name}</h4>
                            <p className="text-[10px] text-slate-400 leading-normal mt-0.5 line-clamp-2">
                              {bundle.description}
                            </p>
                            
                            <div className="flex items-center justify-between mt-3 border-t border-slate-100/60 pt-2">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
                                bundle.isCustom ? 'bg-amber-100 text-amber-800' : 'bg-sky-50/80 text-[#0055B3]'
                              }`}>
                                {bundle.itemIds.length} Items
                              </span>

                              <button
                                type="button"
                                onClick={() => handleQuickAddBundle(bundle)}
                                disabled={isAdded}
                                className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all flex items-center gap-1 shadow-sm ${
                                  isAdded
                                    ? 'bg-emerald-500 text-white'
                                    : bundle.isCustom
                                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                      : 'bg-[#0066CC] hover:bg-[#0055B3] text-white'
                                }`}
                              >
                                {isAdded ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" /> Added!
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" /> Add Package
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default InteractiveBoqEditor;
