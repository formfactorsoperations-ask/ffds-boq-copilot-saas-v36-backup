import React, { useState, useMemo, useEffect } from 'react';
import { Item, AIStrategy } from '../types';
import { TemplateData, INITIAL_TEMPLATES, getSmartDefaultCoefficient } from '../lib/standardPackages';
import { drawOf, standardSizeOf } from '../lib/playground/pieces';
import { ftin } from '../lib/playground/geometry';
import { basisOfUnit } from '../lib/boqSize';
import { roomScopesOf, gradesFor, withGrades, prunedMarks, roleOf } from '../lib/templateOptions';
import { GRADES, GRADE_TIER, type Grade } from '../lib/materialSpecs';
import { typologiesOf, optionSetupOf, withOptionSetup, isStandardSetup } from '../lib/optionSetup';
import OptionSetupModal from './templates/OptionSetupModal';
import { formatINR, calculateSellPrice, id as generateId } from '../lib/utils';
import { AiGeneratedTemplateResult, aiSuggestRoomItems } from '../services/geminiService';
import { AiTemplateArchitectModal } from './templates/AiTemplateArchitectModal';
import { AiTemplateAuditDrawer } from './templates/AiTemplateAuditDrawer';
import { TemplateThreeTierPreviewModal } from './templates/TemplateThreeTierPreviewModal';
import { AddTypologyModal } from './templates/AddTypologyModal';
import { AddRoomScopeModal } from './templates/AddRoomScopeModal';
import { TemplateMetricsBar, TradeCoverage } from './templates/TemplateMetricsBar';
import { Button, Chip, EmptyState, INPUT, LABEL } from './ui/kit';
import { Tile } from './bank/BankCommandBar';
import { listV } from './people/PeopleBits';
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
} from '@/lib/lucide-shim';
import { addToBank, pickable } from '../lib/bankMatch';
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
  /* The typologies: the studio's option setup is saved beside them (lib/optionSetup). */
  const configOptions = Object.keys(typologiesOf(templates || {}));
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<string>(configOptions[0] || '2-BHK');

  // Ensure activeConfig is valid if templates change
  useEffect(() => {
    if (!templates[activeConfig] && configOptions.length > 0) {
      setActiveConfig(configOptions[0]);
    }
  }, [templates, activeConfig, configOptions]);

  // Current room types for the active configuration
  /* The room scopes; which options take each item is saved beside them (lib/templateOptions). */
  const currentConfigRooms = roomScopesOf(templates[activeConfig] || {});
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

  /* The rows whose specification is shown in full. */
  const [openSpecs, setOpenSpecs] = useState<Set<string>>(new Set());
  const toggleSpecs = (id: string) => setOpenSpecs(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
    return pickable(bank).filter(item => {
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
      [activeConfig]: prunedMarks({
        ...(prev[activeConfig] || {}),
        [activeRoomType]: (prev[activeConfig]?.[activeRoomType] || []).filter(id => id !== itemId)
      })
    }));
  };

  /* Which options take an item: all three is a must-have, fewer an extra. */
  const handleToggleGrade = (itemId: string, grade: Grade) => {
    setTemplates(prev => {
      const cur = gradesFor(prev[activeConfig], activeRoomType, itemId);
      const next = cur.includes(grade) ? cur.filter(g => g !== grade) : [...cur, grade];
      return { ...prev, [activeConfig]: withGrades(prev[activeConfig] || {}, activeRoomType, itemId, next) };
    });
  };

  // Clear all items in active room
  const handleClearRoom = () => {
    if (window.confirm(`Clear all items from "${activeRoomType}" scope?`)) {
      setTemplates(prev => ({
        ...prev,
        [activeConfig]: prunedMarks({
          ...(prev[activeConfig] || {}),
          [activeRoomType]: []
        })
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
          [activeConfig]: prunedMarks(copy)
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

      // One the bank already has by name and unit goes in as its copy (lib/bankMatch.ts).
      setBank(prev => addToBank(prev, newBankItems));
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

  /* ── What the screen shows, worked out once per change ─────────────────── */

  const roomLabel = (rk: string) => rk.replace(/_/g, ' ');

  /* The open room's items as rows: everything a row says, so the list below only draws. */
  const rows = currentRoomItemIds.map((itemId) => {
    const item = bankMap.get(itemId);
    if (!item) return null;
    const draw = drawOf(item);
    const standard = standardSizeOf(item);
    const basis = basisOfUnit(item.unit);
    const coeff = getSmartDefaultCoefficient(item);
    const grades = gradesFor(templates[activeConfig], activeRoomType, itemId);
    return {
      item, grades, role: roleOf(grades), coeff,
      rate: calculateSellPrice(item.materials, item.labor, item.margin || 20),
      /* The size a new BOQ starts this item at (Item bank, "On the plan"). */
      size: standard && draw ? `${ftin(draw.w)}${basis === 'area' ? ` × ${ftin(draw.h)}` : ''} · ${standard.qty} ${item.unit}` : null,
      noSize: !standard && (basis === 'area' || basis === 'length') && coeff === undefined,
    };
  }).filter(Boolean) as Array<{ item: Item; grades: Grade[]; role: 'must' | 'extra' | 'none'; coeff: number | undefined; rate: number; size: string | null; noSize: boolean }>;
  /* Ids the room lists that the bank no longer has. They were skipped without a word. */
  const missing = currentRoomItemIds.length - rows.length;
  const takenBy = (g: Grade) => rows.filter((r) => r.grades.includes(g)).length;

  /* The figures for the whole typology. */
  const figures = useMemo(() => {
    const scopes = roomScopesOf(templates[activeConfig] || {});
    let items = 0, extras = 0, noSize = 0;
    const unique = new Set<string>();
    Object.entries(scopes).forEach(([rk, ids]) => (ids || []).forEach((id) => {
      const item = bankMap.get(id);
      if (!item) return;
      items++; unique.add(id);
      if (roleOf(gradesFor(templates[activeConfig], rk, id)) !== 'must') extras++;
      const basis = basisOfUnit(item.unit);
      if (!standardSizeOf(item) && (basis === 'area' || basis === 'length') && getSmartDefaultCoefficient(item) === undefined) noSize++;
    }));
    return { rooms: Object.keys(scopes).length, items, unique: unique.size, extras, noSize };
  }, [templates, activeConfig, bankMap]);

  const BANK_SHOWN = 80;
  const iconButton = 'p-1.5 rounded-lg text-slate-400 transition-colors hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30';

  return (
    <div className="space-y-4 w-full">
      {/* The typologies, and what can be done to the one that is open. */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 hud-panel-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <div role="radiogroup" aria-label="Typology" className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
              {configOptions.map((conf) => {
                const on = activeConfig === conf;
                return (
                  <button key={conf} type="button" role="radio" aria-checked={on} onClick={() => setActiveConfig(conf)}
                    className={`relative px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${on ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                    {on && <motion.span layoutId="tpl-typology" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <span className="relative">{conf}</span>
                  </button>
                );
              })}
            </div>
            <Button size="sm" variant="quiet" icon={Plus} onClick={() => setIsAddTypologyOpen(true)}>New typology</Button>
          </div>
          <TemplateMetricsBar
            canDelete={configOptions.length > 1}
            onOpenAiArchitect={() => setIsAiArchitectOpen(true)}
            onOpenAiAudit={() => setIsAiAuditOpen(true)}
            onOpenTierPreview={() => setIsTierPreviewOpen(true)}
            onDuplicateConfig={handleDuplicateConfig}
            onDeleteConfig={handleDeleteConfig}
            onExportTemplates={handleExportTemplates}
            onImportTemplates={handleImportTemplates}
            onOpenOptionSetup={() => setIsSetupOpen(true)}
            setupChanged={!isStandardSetup(optionSetupOf(templates))}
          />
        </div>

        <motion.div key={activeConfig} variants={listV} initial="hidden" animate="show" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Tile icon={Building} label="Room scopes" value={figures.rooms} sub={`In ${activeConfig}`} />
          <Tile icon={Layers} label="Items" value={figures.items} sub={`${figures.unique} different items from the bank`} />
          <Tile icon={Sliders} label="Extras" value={figures.extras} sub="Not taken by all three options" />
          <Tile icon={Info} tone={figures.noSize > 0 ? 'warn' : 'ok'} dot={figures.noSize > 0 ? 'warn' : 'good'} label="No standard size" value={figures.noSize}
            sub={figures.noSize > 0 ? 'Sized from the room until set in the Item bank' : 'Every measured item has one'} />
        </motion.div>

        <TradeCoverage templates={templates} activeConfig={activeConfig} bank={bank} />
      </section>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[210px_minmax(0,1fr)_360px] items-start">
        {/* The rooms of this typology. */}
        <nav aria-label="Room scopes" className="lg:col-span-2 xl:col-span-1 bg-white rounded-2xl border border-slate-200 p-2 flex flex-wrap xl:flex-col gap-1 hud-panel-in">
          {currentRoomKeys.map((rk) => {
            const on = activeRoomType === rk;
            return (
              <button key={rk} type="button" onClick={() => setActiveRoomType(rk)} aria-current={on ? 'true' : undefined}
                className={`relative xl:w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${on ? 'text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                {on && <motion.span layoutId="tpl-room" className="absolute inset-0 rounded-xl bg-[#3D52A0] shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative capitalize whitespace-nowrap">{roomLabel(rk)}</span>
                <span className={`relative text-[11px] tabular-nums ${on ? 'text-white/80' : 'text-slate-400'}`}>{(currentConfigRooms[rk] || []).length}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setIsAddRoomScopeOpen(true)}
            className="xl:w-full px-3 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-[#3D52A0] flex items-center gap-1.5 transition-colors hover:bg-[#3D52A0]/5 hover:border-[#3D52A0]/40">
            <Plus className="w-3.5 h-3.5" aria-hidden />Add room
          </button>
        </nav>

        {/* The open room: everything it can get, with nothing cut short and no box to scroll inside. */}
        <section key={`${activeConfig}|${activeRoomType}`} aria-label={`${roomLabel(activeRoomType)} in ${activeConfig}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm min-w-0 hud-swap">
          <div className="p-5 border-b border-slate-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{activeConfig}</p>
                <h2 className="font-bold text-slate-800 capitalize mt-1">{roomLabel(activeRoomType)}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Everything this room can get. E, C and H mark the options that take each item: Essential, Comfort, Harmony.</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {currentRoomItemIds.length > 0 && <Button size="sm" variant="quiet" onClick={handleClearRoom} title="Take every item out of this room">Clear room</Button>}
                {currentRoomKeys.length > 1 && (
                  <button type="button" onClick={() => handleDeleteRoomScope(activeRoomType)} className={`${iconButton} hover:!text-rose-600 hover:!bg-rose-50`}
                    title="Delete this room from the typology" aria-label={`Delete ${roomLabel(activeRoomType)} from ${activeConfig}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip tone="brand">{rows.length} {rows.length === 1 ? 'item' : 'items'}</Chip>
              {GRADES.map((g) => <Chip key={g} tone="slate" title={`${GRADE_TIER[g]} takes ${takenBy(g)} of them`}>{g === 'P' ? 'H' : g} · {takenBy(g)}</Chip>)}
              {missing > 0 && <Chip tone="warn" title="The room lists items the Item bank no longer has. They are left out of a new BOQ.">{missing} no longer in the bank</Chip>}
            </div>
          </div>

          {/* What AI would add here. */}
          {roomAiSuggestions.length > 0 && (
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`${LABEL} flex items-center gap-1.5`}><Sparkles className="w-3.5 h-3.5 text-[#3D52A0]" aria-hidden />Suggested for this room</span>
                <button type="button" onClick={loadRoomAiSuggestions} disabled={isLoadingRoomAi} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${isLoadingRoomAi ? 'motion-safe:animate-spin' : ''}`} aria-hidden />Refresh
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {roomAiSuggestions.map((sug, idx) => (
                  <button key={`${sug.item.id}-${idx}`} type="button" onClick={() => handleAddItem(sug.item.id)} title={sug.reason || undefined}
                    className="group hud-row-in px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 text-left transition-colors hover:border-[#3D52A0]/40 hover:text-[#3D52A0] motion-safe:active:scale-[0.97]"
                    style={{ animationDelay: `${Math.min(idx, 10) * 25}ms` }}>
                    <Plus className="w-3 h-3 text-[#3D52A0] shrink-0 transition-transform group-hover:rotate-90" aria-hidden />
                    <span>{sug.item.name}</span>
                    <span className="text-[11px] font-normal text-slate-400">{sug.item.unit}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Layers} title="Nothing in this room yet" text="Add items from the Item bank beside this list, or pick one of the suggestions." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              <AnimatePresence initial={false}>
                {rows.map((r, idx) => {
                  const open = openSpecs.has(r.item.id);
                  const hasSpecs = !!(r.item.specs && r.item.specs.trim());
                  return (
                    <motion.li key={r.item.id} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22 }} className="group px-5 py-3.5 flex flex-wrap items-start gap-x-4 gap-y-2 transition-colors hover:bg-slate-50">
                      <span className="w-6 pt-0.5 text-xs font-bold text-slate-400 tabular-nums text-right shrink-0">{idx + 1}</span>
                      <div className="min-w-0 flex-1 basis-64">
                        {/* The whole name: it wraps, it is not cut. */}
                        <p className="text-sm font-semibold text-slate-800 break-words">{r.item.name}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-slate-500">
                          <Chip tone="slate">{r.item.cat || 'General'}</Chip>
                          <span>per {r.item.unit}</span>
                          <span className="font-bold text-slate-800 tabular-nums">{formatINR(r.rate)}</span>
                          {r.size ? (
                            <Chip tone="brand" title="The standard size from the Item bank: every new BOQ starts this item at it.">{r.size}</Chip>
                          ) : r.noSize ? (
                            <Chip tone="warn" title="Set its standard size in the Item bank. Until then a new BOQ sizes it from the room.">No standard size yet</Chip>
                          ) : null}
                          {r.coeff !== undefined && <span title="Sized as this share of the room's floor area">{r.coeff}× room area</span>}
                        </div>
                        {hasSpecs && (
                          <button type="button" onClick={() => toggleSpecs(r.item.id)} aria-expanded={open}
                            className={`mt-1.5 w-full text-left text-xs text-slate-500 hover:text-slate-700 ${open ? 'block whitespace-pre-line' : 'line-clamp-2'}`}
                            title={open ? 'Show less' : 'Show the whole specification'}>
                            {r.item.specs}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        {r.role !== 'must' && <Chip tone={r.role === 'none' ? 'bad' : 'slate'}>{r.role === 'none' ? 'In no option' : 'Extra'}</Chip>}
                        <div className="inline-flex gap-1" role="group" aria-label={`Options that take ${r.item.name}`}>
                          {GRADES.map((g) => {
                            const on = r.grades.includes(g);
                            return (
                              <button key={g} type="button" aria-pressed={on} title={`${GRADE_TIER[g]}: ${on ? 'takes this item' : 'does not take this item'}`}
                                onClick={() => handleToggleGrade(r.item.id, g)}
                                className={`w-7 h-7 rounded-lg text-[10px] font-bold border transition-colors motion-safe:active:scale-90 ${on ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'bg-white border-slate-300 text-slate-400 hover:bg-slate-50'}`}>
                                {g === 'P' ? 'H' : g}
                              </button>
                            );
                          })}
                        </div>
                        <button type="button" onClick={() => handleRemoveItem(r.item.id)} className={`${iconButton} hover:!text-rose-600 hover:!bg-rose-50`}
                          title="Take out of this room" aria-label={`Take ${r.item.name} out of ${roomLabel(activeRoomType)}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {/* The Item bank, to add from. It stays beside the room while the room is read. */}
        <aside aria-label="Item bank" className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-w-0 lg:sticky lg:top-2 lg:max-h-[calc(100vh-7rem)] hud-panel-in">
          <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><List className="w-4 h-4 text-[#3D52A0]" aria-hidden />Add from the Item bank</h2>
              <Chip tone="slate">{filteredBank.length}</Chip>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
              <input type="text" aria-label="Search the Item bank" placeholder="Search the Item bank" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape' && searchTerm) { e.stopPropagation(); setSearchTerm(''); } }}
                className={`${INPUT} !py-1.5 !pl-8 !pr-8`} />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select aria-label="Trade" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className={`${INPUT} !py-1.5 bg-white cursor-pointer`}>
              <option value="ALL">All trades</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
            {filteredBank.length === 0 && <li className="p-6 text-center text-xs text-slate-500">No item matches.</li>}
            {filteredBank.slice(0, BANK_SHOWN).map((item) => {
              const isAdded = currentRoomItemIds.includes(item.id);
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => handleAddItem(item.id)} disabled={isAdded} aria-label={isAdded ? `${item.name} is in this room` : `Add ${item.name}`}
                    title={item.specs || undefined}
                    className={`group w-full px-4 py-2.5 flex items-start gap-3 text-left transition-colors ${isAdded ? 'cursor-default' : 'hover:bg-[#3D52A0]/5'}`}>
                    <span className={`mt-0.5 w-6 h-6 rounded-lg grid place-items-center shrink-0 transition-colors ${isAdded ? 'bg-emerald-100 text-emerald-700' : 'bg-[#3D52A0]/10 text-[#3D52A0] group-hover:bg-[#3D52A0] group-hover:text-white'}`}>
                      {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90" />}
                    </span>
                    <span className={`min-w-0 flex-1 ${isAdded ? 'opacity-60' : ''}`}>
                      <span className="block text-xs font-semibold text-slate-800 break-words">{item.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {item.cat || 'General'} · per {item.unit} · <span className="font-bold text-slate-700 tabular-nums">{formatINR(calculateSellPrice(item.materials, item.labor, item.margin || 20))}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredBank.length > BANK_SHOWN && <li className="px-4 py-3 text-[11px] text-slate-500 text-center">The first {BANK_SHOWN} of {filteredBank.length}. Search to find the rest.</li>}
          </ul>
        </aside>
      </div>

      {/* Modals & Drawers */}
      {isSetupOpen && (
        <OptionSetupModal setup={optionSetupOf(templates)} onClose={() => setIsSetupOpen(false)}
          onSave={(next) => setTemplates(prev => withOptionSetup(prev, next))} />
      )}

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
