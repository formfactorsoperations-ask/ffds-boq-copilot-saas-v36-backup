import React, { useState, useMemo, useEffect } from 'react';
import { Item, AIStrategy } from '../types';
import { TemplateData, INITIAL_TEMPLATES, getSmartDefaultCoefficient } from '../lib/standardPackages';
import { formatINR, calculateSellPrice, id as generateId } from '../lib/utils';
import { AiGeneratedTemplateResult, aiSuggestRoomItems } from '../services/geminiService';
import { AiTemplateArchitectModal } from './templates/AiTemplateArchitectModal';
import { AiTemplateAuditDrawer } from './templates/AiTemplateAuditDrawer';
import { TemplateThreeTierPreviewModal } from './templates/TemplateThreeTierPreviewModal';
import { AddTypologyModal } from './templates/AddTypologyModal';
import { AddRoomScopeModal } from './templates/AddRoomScopeModal';
import { TemplateMetricsBar } from './templates/TemplateMetricsBar';
import {
  List,
  Plus,
  Trash2,
  Check,
  Sparkles,
  ShieldCheck,
  Trophy,
  Layers,
  Search,
  Building,
  Filter,
  X,
  ChevronRight,
  Info,
  Sliders,
  RefreshCw,
  FolderPlus,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TemplateEditorTabProps {
  bank: Item[];
  setBank?: React.Dispatch<React.SetStateAction<Item[]>>;
  templates: TemplateData;
  setTemplates: React.Dispatch<React.SetStateAction<TemplateData>>;
  aiStrategy?: AIStrategy;
}

export const TemplateEditorTab: React.FC<TemplateEditorTabProps> = ({
  bank,
  setBank,
  templates = INITIAL_TEMPLATES,
  setTemplates,
  aiStrategy = 'balanced'
}) => {
  const configOptions = Object.keys(templates || {});
  const [activeConfig, setActiveConfig] = useState<string>(configOptions[0] || '2-BHK');

  // Ensure activeConfig is valid if templates change
  useEffect(() => {
    if (!templates[activeConfig] && configOptions.length > 0) {
      setActiveConfig(configOptions[0]);
    }
  }, [templates, activeConfig, configOptions]);

  // Current room types for the active configuration
  const currentConfigRooms = templates[activeConfig] || {};
  const currentRoomKeys = Object.keys(currentConfigRooms);
  
  const [activeRoomType, setActiveRoomType] = useState<string>(currentRoomKeys[0] || 'living');

  useEffect(() => {
    if (!currentConfigRooms[activeRoomType] && currentRoomKeys.length > 0) {
      setActiveRoomType(currentRoomKeys[0]);
    }
  }, [activeConfig, templates, activeRoomType, currentRoomKeys]);

  // Search & Filter in Item Bank Pane
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modals state
  const [isAiArchitectOpen, setIsAiArchitectOpen] = useState(false);
  const [isAiAuditOpen, setIsAiAuditOpen] = useState(false);
  const [isTierPreviewOpen, setIsTierPreviewOpen] = useState(false);
  const [isAddTypologyOpen, setIsAddTypologyOpen] = useState(false);
  const [isAddRoomScopeOpen, setIsAddRoomScopeOpen] = useState(false);

  // AI Smart Room Recommendations
  const [roomAiSuggestions, setRoomAiSuggestions] = useState<Array<{ item: Item; reason: string }>>([]);
  const [isLoadingRoomAi, setIsLoadingRoomAi] = useState(false);

  const bankMap = useMemo(() => new Map(bank.map(i => [i.id, i])), [bank]);

  // Current items in selected room
  const currentRoomItemIds = currentConfigRooms[activeRoomType] || [];

  // Available categories in bank
  const categories = useMemo(() => {
    const set = new Set<string>();
    bank.forEach(i => {
      if (i.cat) set.add(i.cat);
    });
    return Array.from(set).sort();
  }, [bank]);

  // Filtered Bank Items
  const filteredBank = useMemo(() => {
    return bank.filter(item => {
      const matchesSearch =
        (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.cat || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.specs || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === 'ALL' || item.cat === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [bank, searchTerm, selectedCategory]);

  // Load AI suggestions for room when room or active config changes
  const loadRoomAiSuggestions = async () => {
    if (!activeRoomType || !activeConfig) return;
    setIsLoadingRoomAi(true);
    try {
      const suggestions = await aiSuggestRoomItems(activeRoomType, activeConfig, currentRoomItemIds, bank);
      setRoomAiSuggestions(suggestions);
    } catch (e) {
      console.error("Failed to load room AI recommendations:", e);
    } finally {
      setIsLoadingRoomAi(false);
    }
  };

  useEffect(() => {
    // Only load if current room has items or empty
    loadRoomAiSuggestions();
  }, [activeRoomType, activeConfig, currentRoomItemIds.length]);

  // Add Item to active room
  const handleAddItem = (itemId: string) => {
    if (currentRoomItemIds.includes(itemId)) return;

    setTemplates(prev => ({
      ...prev,
      [activeConfig]: {
        ...(prev[activeConfig] || {}),
        [activeRoomType]: [...(prev[activeConfig]?.[activeRoomType] || []), itemId]
      }
    }));
  };

  // Remove Item from active room
  const handleRemoveItem = (itemId: string) => {
    setTemplates(prev => ({
      ...prev,
      [activeConfig]: {
        ...(prev[activeConfig] || {}),
        [activeRoomType]: (prev[activeConfig]?.[activeRoomType] || []).filter(id => id !== itemId)
      }
    }));
  };

  // Clear all items in active room
  const handleClearRoom = () => {
    if (window.confirm(`Clear all items from "${activeRoomType}" scope?`)) {
      setTemplates(prev => ({
        ...prev,
        [activeConfig]: {
          ...(prev[activeConfig] || {}),
          [activeRoomType]: []
        }
      }));
    }
  };

  // Add a new typology / template
  const handleAddTypology = (configName: string, initialRooms: string[], cloneFromConfig?: string) => {
    let newRoomData: Record<string, string[]> = {};
    if (cloneFromConfig && templates[cloneFromConfig]) {
      newRoomData = JSON.parse(JSON.stringify(templates[cloneFromConfig]));
    } else {
      initialRooms.forEach(roomKey => {
        newRoomData[roomKey] = [];
      });
    }

    setTemplates(prev => ({
      ...prev,
      [configName]: newRoomData
    }));
    setActiveConfig(configName);
    if (initialRooms.length > 0) {
      setActiveRoomType(initialRooms[0]);
    }
  };

  // Add a new room scope to active template
  const handleAddRoomScope = (roomKey: string) => {
    setTemplates(prev => ({
      ...prev,
      [activeConfig]: {
        ...(prev[activeConfig] || {}),
        [roomKey]: prev[activeConfig]?.[roomKey] || []
      }
    }));
    setActiveRoomType(roomKey);
  };

  // Delete room scope from active template
  const handleDeleteRoomScope = (roomKey: string) => {
    if (currentRoomKeys.length <= 1) {
      alert("A template must contain at least one room scope.");
      return;
    }
    if (window.confirm(`Delete the "${roomKey}" scope and all its assigned items from "${activeConfig}"?`)) {
      setTemplates(prev => {
        const copy = { ...(prev[activeConfig] || {}) };
        delete copy[roomKey];
        return {
          ...prev,
          [activeConfig]: copy
        };
      });
      const remaining = currentRoomKeys.filter(k => k !== roomKey);
      if (remaining.length > 0) {
        setActiveRoomType(remaining[0]);
      }
    }
  };

  // Duplicate current configuration
  const handleDuplicateConfig = () => {
    const newName = `${activeConfig} (Copy)`;
    handleAddTypology(newName, currentRoomKeys, activeConfig);
  };

  // Delete active configuration
  const handleDeleteConfig = () => {
    if (configOptions.length <= 1) {
      alert("You cannot delete the only remaining template.");
      return;
    }
    if (window.confirm(`Are you sure you want to permanently delete the "${activeConfig}" template package?`)) {
      setTemplates(prev => {
        const copy = { ...prev };
        delete copy[activeConfig];
        return copy;
      });
      const remaining = configOptions.filter(c => c !== activeConfig);
      if (remaining.length > 0) {
        setActiveConfig(remaining[0]);
      }
    }
  };

  // Adopt AI Generated Template
  const handleAdoptAiTemplate = (result: AiGeneratedTemplateResult, autoAddBankItems: boolean) => {
    // 1. If new items are needed and setBank exists, add them to Master Bank
    if (autoAddBankItems && result.newItemsNeeded && result.newItemsNeeded.length > 0 && setBank) {
      const newBankItems: Item[] = result.newItemsNeeded.map(newItem => ({
        id: generateId(),
        name: newItem.name,
        cat: newItem.cat,
        specs: newItem.specs,
        unit: newItem.unit,
        materials: newItem.materials,
        labor: newItem.labor,
        margin: newItem.margin,
        areaMultiplierCoefficient: newItem.areaMultiplierCoefficient
      }));

      setBank(prev => [...prev, ...newBankItems]);
    }

    // 2. Add template
    setTemplates(prev => ({
      ...prev,
      [result.configName]: result.rooms
    }));

    setActiveConfig(result.configName);
    const rooms = Object.keys(result.rooms);
    if (rooms.length > 0) {
      setActiveRoomType(rooms[0]);
    }
  };

  // Auto-add audit gaps
  const handleAddAuditGaps = (itemsToAdd: Array<{ roomType: string; itemId: string }>) => {
    setTemplates(prev => {
      const active = { ...(prev[activeConfig] || {}) };
      itemsToAdd.forEach(({ roomType, itemId }) => {
        const currentList = active[roomType] || [];
        if (!currentList.includes(itemId)) {
          active[roomType] = [...currentList, itemId];
        }
      });
      return {
        ...prev,
        [activeConfig]: active
      };
    });
  };

  // Export Templates JSON
  const handleExportTemplates = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(templates, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `standard_templates_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import Templates JSON
  const handleImportTemplates = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target?.result as string);
            if (typeof parsed === 'object' && Object.keys(parsed).length > 0) {
              setTemplates(parsed);
              alert("Templates successfully imported!");
            } else {
              alert("Invalid templates JSON structure.");
            }
          } catch (err) {
            alert("Error parsing JSON file.");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-4 w-full h-[calc(100vh-120px)] flex flex-col">
      {/* Top Bar: Typology Switcher + Add Typology */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-50 text-[#0066CC] rounded-xl border border-sky-100">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
              Standard BOQ Templates
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Top Harmony Master Scope. Auto-derives Essential (Base) and Comfort (Mid) client proposals.
            </p>
          </div>
        </div>

        {/* Typology Switcher Pills */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 custom-scrollbar">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 shrink-0">
            {configOptions.map(conf => (
              <button
                key={conf}
                onClick={() => setActiveConfig(conf)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeConfig === conf
                    ? 'bg-white text-[#0055B3] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {conf}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsAddTypologyOpen(true)}
            className="px-3 py-1.5 bg-sky-50 text-[#0066CC] hover:bg-[#0066CC] hover:text-white border border-sky-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New Typology
          </button>
        </div>
      </div>

      {/* Metrics & Action Bar */}
      <TemplateMetricsBar
        activeConfig={activeConfig}
        templates={templates}
        bank={bank}
        onOpenAiArchitect={() => setIsAiArchitectOpen(true)}
        onOpenAiAudit={() => setIsAiAuditOpen(true)}
        onOpenTierPreview={() => setIsTierPreviewOpen(true)}
        onDuplicateConfig={handleDuplicateConfig}
        onDeleteConfig={handleDeleteConfig}
        onExportTemplates={handleExportTemplates}
        onImportTemplates={handleImportTemplates}
      />

      {/* Room Scope Tabs */}
      <div className="flex items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar flex-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Room Scopes:
          </span>
          {currentRoomKeys.map(rk => {
            const count = (currentConfigRooms[rk] || []).length;
            const isActive = activeRoomType === rk;
            return (
              <button
                key={rk}
                onClick={() => setActiveRoomType(rk)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 border ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="capitalize">{rk.replace(/_/g, ' ')}</span>
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setIsAddRoomScopeOpen(true)}
            className="px-3 py-1.5 border border-dashed border-sky-300 text-[#0066CC] hover:bg-sky-50 rounded-xl text-xs font-bold flex items-center gap-1 transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Room Scope
          </button>
        </div>

        {currentRoomKeys.length > 1 && (
          <button
            onClick={() => handleDeleteRoomScope(activeRoomType)}
            className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
            title="Delete this room scope"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete Scope</span>
          </button>
        )}
      </div>

      {/* Main Dual-Pane Workspace */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* LEFT PANE: Master Item Bank Explorer (5 Cols) */}
        <div className="col-span-12 lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <List className="w-4 h-4 text-[#0066CC]" />
                Master Item Bank
              </span>
              <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                {filteredBank.length} items
              </span>
            </div>

            {/* Search & Category Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search bank items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-800"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-36 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#0066CC]"
              >
                <option value="ALL">All Trades</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* List of Bank Items */}
          <div className="p-3 flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {filteredBank.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 italic">
                No items found matching your filter.
              </div>
            ) : (
              filteredBank.map(item => {
                const isAdded = currentRoomItemIds.includes(item.id);
                const baseCost = (item.materials || 0) + (item.labor || 0);
                const sellRate = calculateSellPrice(item.materials, item.labor, item.margin || 20);
                const smartCoeff = getSmartDefaultCoefficient(item);

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                      isAdded
                        ? 'bg-slate-50/80 border-slate-200 opacity-60'
                        : 'bg-white border-slate-200 hover:border-sky-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-slate-800 text-xs truncate">{item.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                          {item.cat || 'Item'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {item.unit}
                        </span>
                        {smartCoeff !== undefined && (
                          <span className="text-[9px] font-bold bg-amber-50 text-amber-800 px-1 py-0.2 rounded border border-amber-200">
                            ~{smartCoeff}x Area
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-700">
                          {formatINR(sellRate)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddItem(item.id)}
                      disabled={isAdded}
                      className={`p-2 rounded-xl transition-all shrink-0 ${
                        isAdded
                          ? 'bg-emerald-50 text-emerald-600 cursor-default'
                          : 'bg-sky-50 text-[#0066CC] hover:bg-[#0066CC] hover:text-white border border-sky-100'
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

        {/* RIGHT PANE: Configured Master Scope for the Room (7 Cols) */}
        <div className="col-span-12 lg:col-span-7 bg-white rounded-2xl border border-sky-100 ring-2 ring-sky-50 shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-200 bg-gradient-to-r from-sky-50/50 via-white to-sky-50/50 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#0066CC]" />
              <div>
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  {activeConfig} &gt; {activeRoomType.replace(/_/g, ' ')} Scope
                </span>
                <p className="text-[11px] text-slate-500">
                  Fully loaded deliverables for this room in the Master Top Model.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-sky-100 text-[#0055B3] rounded-full text-xs font-bold">
                {currentRoomItemIds.length} Items
              </span>
              {currentRoomItemIds.length > 0 && (
                <button
                  onClick={handleClearRoom}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="Clear room"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* AI Smart Room Suggestions Strip */}
          {roomAiSuggestions.length > 0 && (
            <div className="p-3 bg-gradient-to-r from-amber-50/80 to-sky-50/60 border-b border-amber-200/60 shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  AI Suggested Additions for this Room:
                </span>
                <button
                  onClick={loadRoomAiSuggestions}
                  disabled={isLoadingRoomAi}
                  className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingRoomAi ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {roomAiSuggestions.map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAddItem(sug.item.id)}
                    className="px-2.5 py-1 bg-white border border-amber-200 hover:border-[#0066CC] hover:bg-sky-50 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs group"
                  >
                    <Plus className="w-3 h-3 text-[#0066CC] group-hover:scale-125 transition-transform" />
                    <span>{sug.item.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({sug.item.unit})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Configured Room Items List */}
          <div className="p-3.5 flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {currentRoomItemIds.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl space-y-3 text-slate-400">
                <Layers className="w-10 h-10 text-slate-300 stroke-1" />
                <div>
                  <p className="font-bold text-sm text-slate-700">No items in this room scope yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Select items from the Master Item Bank on the left, or use the AI Suggestions above to populate this scope.
                  </p>
                </div>
              </div>
            ) : (
              <AnimatePresence>
                {currentRoomItemIds.map((itemId, idx) => {
                  const item = bankMap.get(itemId);
                  if (!item) return null;

                  const baseCost = (item.materials || 0) + (item.labor || 0);
                  const sellRate = calculateSellPrice(item.materials, item.labor, item.margin || 20);
                  const smartCoeff = getSmartDefaultCoefficient(item);

                  return (
                    <motion.div
                      key={itemId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="p-3 bg-white border border-slate-200 hover:border-sky-200 rounded-xl flex items-center justify-between shadow-2xs group transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <span className="text-xs font-bold text-slate-400 w-5 shrink-0 text-center">
                          {idx + 1}
                        </span>
                        <div className="w-1.5 h-8 bg-[#0066CC] rounded-full shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-xs truncate">{item.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-500">
                              {item.cat || 'General'}
                            </span>
                            <span className="text-[10px] text-slate-400">•</span>
                            <span className="text-[10px] font-semibold text-slate-600">
                              Unit: {item.unit}
                            </span>
                            {smartCoeff !== undefined && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-100">
                                Coeff: {smartCoeff}x Room Area
                              </span>
                            )}
                            <span className="text-[10px] font-black text-slate-900">
                              {formatINR(sellRate)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveItem(itemId)}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        title="Remove from room scope"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Modals & Drawers */}
      <AiTemplateArchitectModal
        isOpen={isAiArchitectOpen}
        onClose={() => setIsAiArchitectOpen(false)}
        bank={bank}
        existingConfigs={configOptions}
        aiStrategy={aiStrategy}
        onApplyTemplate={handleAdoptAiTemplate}
      />

      <AiTemplateAuditDrawer
        isOpen={isAiAuditOpen}
        onClose={() => setIsAiAuditOpen(false)}
        configName={activeConfig}
        rooms={currentConfigRooms}
        bank={bank}
        aiStrategy={aiStrategy}
        onAddMissingItems={handleAddAuditGaps}
      />

      <TemplateThreeTierPreviewModal
        isOpen={isTierPreviewOpen}
        onClose={() => setIsTierPreviewOpen(false)}
        configName={activeConfig}
        templates={templates}
        bank={bank}
      />

      <AddTypologyModal
        isOpen={isAddTypologyOpen}
        onClose={() => setIsAddTypologyOpen(false)}
        existingConfigs={configOptions}
        onAddConfig={handleAddTypology}
      />

      <AddRoomScopeModal
        isOpen={isAddRoomScopeOpen}
        onClose={() => setIsAddRoomScopeOpen(false)}
        existingRooms={currentRoomKeys}
        onAddRoom={handleAddRoomScope}
      />
    </div>
  );
};

export default TemplateEditorTab;
