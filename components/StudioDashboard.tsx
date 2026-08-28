
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProjectContext, Item, BoqItem, Room, AIStrategy, FullBoqItem, CommandAction, ProposalTier, AuditResult } from '../types';
import { id as generateId, calculateSellPrice } from '../lib/utils';
import RoomCard from './RoomCard';
import StudioExcelGrid from './StudioExcelGrid';
import AddItemModal from './AddItemModal';
import InteractiveBoqEditor from './InteractiveBoqEditor';
import BulkImportModal from './BulkImportModal';
import TakeoffPanel from './TakeoffPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheckIcon, GridIcon, ListIcon, SaveIcon, CheckIcon, ExportIcon, CalculatorIcon } from './Icons';
import { Search, X, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { useOrg } from '../contexts/OrgContext';
import { useStudioSettings } from '../hooks/useStudioSettings';
import { db as dbService } from '../services/dbService';
import { db, functions } from '../services/firebaseClient';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, getDoc, query, collection } from 'firebase/firestore';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { prepareClonedDocForPdf } from '../lib/pdfUtils';

interface StudioDashboardProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    tiers: ProposalTier[];
    setTiers: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
    activeTierId: string | null;
    bank: Item[];
    aiStrategy: AIStrategy;
    onViewInBank: (bankId: string) => void;
    onSaveProject: () => void;
    projectId?: string;
    projectArchitecture?: 'legacy' | 'canonical';
    onUpgradeArchitecture?: () => void;
}

// Helper function for applying command actions
import { INITIAL_BANK } from '../constants';

const applyCommandAction = (boq: BoqItem[], action: CommandAction, bank: Item[]): BoqItem[] => {
    const bankMap = new Map(bank.map(item => [item.id, item]));

    const filterItem = (item: BoqItem): boolean => {
        const bankItem = bankMap.get(item.bankId);
        if (!bankItem) return false;

        const { roomIds, categories, itemIds } = action.filters;
        if (roomIds && !roomIds.includes(item.roomId || '')) return false;
        if (categories && !categories.includes(bankItem.cat)) return false;
        if (itemIds && !itemIds.includes(item.id)) return false;
        return true;
    };

    if (action.action === 'delete') {
        return boq.filter(item => !filterItem(item));
    }

    if (action.action === 'update') {
        return boq.map(item => {
            if (filterItem(item)) {
                let updatedItem = { ...item };
                if (action.changes.margin) {
                    const bankItem = bankMap.get(item.bankId)!;
                    const currentMargin = item.marginOverride ?? bankItem.margin;
                    const change = action.changes.margin;
                    updatedItem.marginOverride = change.type === 'absolute' ? change.value : currentMargin * (1 + change.value / 100);
                }
                if (action.changes.qty) {
                    const change = action.changes.qty;
                    updatedItem.qty = change.type === 'absolute' ? change.value : item.qty * (1 + change.value / 100);
                }
                return updatedItem;
            }
            return item;
        });
    }
    return boq;
};

const container = {
  show: {
    transition: {
      staggerChildren: 0.15
    }
  }
};

const itemVar = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 12 } }
};

const StudioDashboard: React.FC<StudioDashboardProps> = ({ projectContext, setProjectContext, tiers, setTiers, activeTierId, bank, aiStrategy, onViewInBank, onSaveProject, projectId, projectArchitecture, onUpgradeArchitecture }) => {
  const { orgData, currentRole } = useOrg();
  const isOwner = ['Super Admin', 'Admin', 'Ops Director'].includes(currentRole);
  
  const { settings, updateSettings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const handleSelectItemToggle = (itemId: string) => {
      setSelectedItemIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(itemId)) {
              newSet.delete(itemId);
          } else {
              newSet.add(itemId);
          }
          return newSet;
      });
  };

  const handleSaveAsBundle = async (itemIds: string[], defaultName?: string) => {
      const bundleName = window.prompt("Enter a name for this custom bundle:", defaultName || "Custom Bundle");
      if (!bundleName) return;

      const bundleDesc = window.prompt("Enter a short description for this bundle:", `Custom bundle containing ${itemIds.length} items.`);
      
      const newBundle = {
          id: `custom-bundle-${Date.now()}`,
          name: bundleName,
          description: bundleDesc || '',
          itemIds: itemIds
      };

      const existingBundles = settings?.customBundles || [];
      const updatedBundles = [...existingBundles, newBundle];

      try {
          await updateSettings('customBundles', updatedBundles);
          alert(`Successfully saved "${bundleName}" as a Custom Bundle! It is now instantly reusable across all projects.`);
      } catch (err) {
          console.error("Error saving bundle", err);
          alert("Failed to save custom bundle. Please try again.");
      }
  };

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null); // For AddItemModal
  const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
        const [viewMode, setViewMode] = useState<'cards' | 'excel' | 'interactive' | 'takeoff'>('interactive');
  
  // Versions state
                

  const [highlightedItemIds, setHighlightedItemIds] = useState<string[]>([]);
    
    const [marginAnalytics, setMarginAnalytics] = useState<any>(null);

  useEffect(() => {
     if (isOwner && projectId && db) {
         const maRef = doc(db, `organizations/${orgData.tenantId}/projects/${projectId}/marginAnalytics/current`);
         const unsub = onSnapshot(maRef, (snap) => {
             if (snap.exists()) setMarginAnalytics(snap.data());
         });
         return unsub;
     }
  }, [projectId, orgData.tenantId, isOwner, db]);

    
        const handleDownloadPDF = async (version?: string) => {
      try {
          const html2pdfModule = await import('html2pdf.js');
          const html2pdfObj = ((html2pdfModule as any).default || html2pdfModule) as any;
          if (typeof html2pdfObj !== 'function') {
              throw new Error("html2pdf library loaded incorrectly");
          }

          const element = document.getElementById('boq-editor-content');
          if (!element) {
             alert('Cannot find element to export.');
             return;
          }
          const opt = {
              margin: 0.5,
              filename: `SOF_${projectContext.name || 'Project'}_${version || 'Draft'}.pdf`,
              image: { type: 'jpeg' as const, quality: 0.98 },
              html2canvas: { 
                scale: 2, 
                useCORS: true,
                onclone: (clonedDoc: Document) => {
                  prepareClonedDocForPdf(clonedDoc, 'boq-editor-content');
                }
              },
              jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' as const }
          };
          html2pdfObj().set(opt).from(element).save();
      } catch (err) {
          console.error("Failed to load html2pdf", err);
          alert("Failed to export PDF.");
      }
  };

  
  
  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Save State
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  
  // Ref to track the save timeout to prevent updates on unmount
  const saveTimeoutRef = useRef<any>(null);

  useEffect(() => {
      // Cleanup timeout on unmount
      return () => {
          if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
          }
      };
  }, []);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (((e.metaKey || e.ctrlKey) && e.key === 'f') || (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
              e.preventDefault();
              searchInputRef.current?.focus();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeTier = tiers.find(t => t.id === activeTierId);
  const rooms = projectContext?.rooms || [];

  
  const bankMap = useMemo(() => {
    const map = new Map(bank.map(item => [item.id, item]));
    if (projectContext?.adHocItems) {
        projectContext.adHocItems.forEach(i => map.set(i.id, i));
    }
    return map;
  }, [bank, projectContext?.adHocItems]);

  const fullBoq = useMemo((): FullBoqItem[] => {
    if (!activeTier) return [];
    return (activeTier.boq || []).map(boqItem => {
        const initialBankItem = INITIAL_BANK.find(i => i.id === boqItem.bankId);
        const bankItem = bankMap.get(boqItem.bankId) || initialBankItem || {
            id: boqItem.bankId,
            name: (boqItem as any).name || (boqItem as any).item || boqItem.rationale || 'Custom / Legacy Item',
            cat: boqItem.roomId || 'General Scope',
            materials: 0,
            labor: 0,
            margin: boqItem.marginOverride ?? 0,
            unit: 'lumpsum',
            specs: 'Details missing from bank'
        } as Item;
        
        const effectiveMargin = boqItem.marginOverride ?? bankItem.margin;
        const effectiveMaterials = boqItem.baseRate !== undefined ? boqItem.baseRate : bankItem.materials;
        const { id, ...bankRest } = bankItem;
        return {
            ...bankRest,
            ...boqItem,
            id: boqItem.id,
            materials: effectiveMaterials,
            margin: effectiveMargin
        };
    });
  }, [activeTier, bankMap]);

  const groupedItems = useMemo(() => {
    const grouped: { [key: string]: FullBoqItem[] } = {};
    const unassigned: FullBoqItem[] = [];
    const validRoomNames = new Set((projectContext.rooms || []).map(r => r.name));

    fullBoq.forEach(item => {
      const roomName = item.roomId;
      if (roomName && validRoomNames.has(roomName)) {
        if (!grouped[roomName]) grouped[roomName] = [];
        grouped[roomName].push(item);
      } else {
        unassigned.push(item);
      }
    });
    
    // Sort items by category within each room for cleaner display
    Object.keys(grouped).forEach(room => {
        grouped[room].sort((a, b) => a.cat.localeCompare(b.cat));
    });

    return { grouped, unassigned };
  }, [fullBoq, projectContext.rooms]);

    const [isGlobalMarkupOpen, setIsGlobalMarkupOpen] = useState(false);
    const [globalMarkupValue, setGlobalMarkupValue] = useState(20);

  // UPDATED: Supports both single field update AND partial object update
  const handleUpdateItem = (itemId: string, fieldOrUpdates: keyof BoqItem | Partial<BoqItem>, value?: any) => {
    setTiers(prev => prev.map(tier => {
        if (tier.id !== activeTierId) return tier;
        return {
            ...tier,
            boq: (tier.boq || []).map(item => {
                if (item.id !== itemId) return item;
                
                // If it's an object update
                if (typeof fieldOrUpdates === 'object' && fieldOrUpdates !== null) {
                    return { ...item, ...fieldOrUpdates };
                }
                
                // If it's a single field update
                return { ...item, [fieldOrUpdates as keyof BoqItem]: value };
            })
        };
    }));
  };

  const handleBulkUpdateItems = (updates: {itemId: string, updates: Partial<BoqItem>}[]) => {
      setTiers(prev => prev.map(tier => {
          if (tier.id !== activeTierId) return tier;
          
          const updateMap = new Map(updates.map(u => [u.itemId, u.updates]));
          
          return {
              ...tier,
              boq: (tier.boq || []).map(item => {
                  if (!updateMap.has(item.id)) return item;
                  const itemUpdates = updateMap.get(item.id);
                  return { ...item, ...itemUpdates };
              })
          };
      }));
  };

  const handleApplyGlobalMarkup = () => {
      const updates: { itemId: string, updates: Partial<BoqItem> }[] = [];
      fullBoq.forEach(item => {
          if (!item.materials && !item.labor) return; // skip items without cost
          updates.push({
              itemId: item.id,
              updates: { marginOverride: globalMarkupValue }
          });
      });

      if (updates.length > 0) {
          handleBulkUpdateItems(updates);
      }
      setIsGlobalMarkupOpen(false);
  };

  const handleDeleteItem = (itemId: string) => {
    setTiers(prev => prev.map(tier => {
        if (tier.id !== activeTierId) return tier;
        return {
            ...tier,
            boq: tier.boq.filter(item => item.id !== itemId)
        };
    }));
  };

  const handleOpenAddModal = (roomName: string) => {
      setActiveRoomId(roomName);
      setIsModalOpen(true);
  }

  const handleAddItems = (items: Item[], qtys: { [itemId: string]: number }, rationales: { [itemId: string]: string }) => {
      if (!activeTierId || !activeRoomId) return;
      const newBoqItems: BoqItem[] = items.map(item => ({
          id: generateId(),
          bankId: item.id,
          qty: qtys[item.id] || 1,
          roomId: activeRoomId === 'Unassigned' ? undefined : activeRoomId,
          rationale: rationales[item.id] || '',
          baseRate: item.materials,
      }));

      setTiers(prev => prev.map(tier => {
          if (tier.id !== activeTierId) return tier;
          return { ...tier, boq: [...tier.boq, ...newBoqItems] };
      }));
  };


  const handleManualSave = () => {
      // Clear any existing timeout
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }

      setIsSaving(true);
      
      // Simulate save delay to give feedback
      saveTimeoutRef.current = setTimeout(() => {
          setIsSaving(false);
          setLastSaved(new Date());
          saveTimeoutRef.current = null;
          if (onSaveProject) {
              onSaveProject();
          }
      }, 600);
  }

  const handleExportExcelWithFormulas = () => {
        if (!fullBoq.length) {
            alert("No data to export.");
            return;
        }

        // CSV Header with Columns matching the logic
        // A: Room, B: Item, C: Cat, D: Specs, E: Unit, F: Mat, G: Lab, H: Cost(Form), I: Margin, J: Sell(Form), K: Qty, L: Total(Form)
        const headers = [
            "Room", "Item Name", "Category", "Description", "Unit", 
            "Material Cost", "Labor Cost", "Total Unit Cost", "Margin %", "Unit Sell Price", "Qty", "Total Amount"
        ];
        
        let csvContent = headers.join(",") + "\n";
        let currentRow = 2; // Data starts at row 2

        // Sort by Room
        const sortedItems = [...fullBoq].sort((a, b) => (a.roomId || 'Unassigned').localeCompare(b.roomId || 'Unassigned'));

        sortedItems.forEach(item => {
            const room = item.roomId || 'Unassigned';
            
            // Escape double quotes for CSV
            const escape = (s: string) => `"${(s || '').toString().replace(/"/g, '""')}"`;

            // Data Fields
            const name = escape(item.name);
            const cat = escape(item.cat);
            const specs = escape(item.specs);
            const unit = item.unit;
            
            const mat = item.materials || 0;
            const lab = item.labor || 0;
            const margin = item.margin || 0;
            const qty = item.qty || 0;

            // Excel Formulas (Relative to current row)
            // H = F + G
            const fTotalCost = `=F${currentRow}+G${currentRow}`;
            // J = H * (1 + I/100)
            const fSellPrice = `=H${currentRow}*(1+(I${currentRow}/100))`;
            // L = J * K
            const fTotalAmount = `=J${currentRow}*K${currentRow}`;

            const row = [
                escape(room), name, cat, specs, unit,
                mat, lab, fTotalCost, margin, fSellPrice, qty, fTotalAmount
            ];
            
            csvContent += row.join(",") + "\n";
            currentRow++;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${(projectContext.name || 'Project').replace(/\s+/g, '_')}_BOQ_LiveFormulas.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
  };

  const MotionDiv = motion.div as any;

  usePageHeader({
    badge: activeTier?.name || '',
    vitals: [
        { label: "AREA", value: (projectContext.area || 0) + ' sq ft' },
        { label: "CONFIG", value: projectContext.config || 'N/A' },
        { label: "STYLE", value: projectContext.theme || 'N/A' },
        { label: "ITEMS", value: String(activeTier?.boq?.length || 0) },
        { label: "ROOMS", value: String(rooms.length || 0) }
    ].filter(Boolean)
  }, [activeTier?.name, activeTier?.boq?.length, rooms.length]);

  if (!activeTier) return <div>Please select a proposal tier.</div>;

  return (
    <div id="boq-editor-content" className="space-y-8 pb-12 print:space-y-0 print:pb-0">
      
      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block w-full pt-8 pb-6 border-b-2 border-sky-900 mb-6">
          <div className="flex justify-between items-end">
              <div>
                  <h1 className="text-3xl font-black tracking-tighter text-slate-900 mb-1">SCHEDULE OF FINISHES</h1>
                  <h2 className="text-lg font-bold text-slate-600 uppercase tracking-widest">{projectContext.name}</h2>
              </div>
              <div className="text-right">
                  <div className="font-bold text-slate-800 tracking-tight">FORM FACTORS DESIGN STUDIO</div>
                  <div className="text-xs text-slate-500 uppercase font-medium mt-1">Ref: 'Draft' | Date: {new Date().toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}</div>
              </div>
          </div>
      </div>

            {/* Unified Compact Toolbar Row */}
      <div className="mb-6 flex flex-col lg:flex-row gap-3 items-center justify-between bg-white border border-slate-200/90 p-2.5 rounded-2xl shadow-sm">
          {/* Smaller Focus Editor / Excel / Cards / Plan Takeoff View Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0 w-full lg:w-auto overflow-x-auto gap-1">
              <button 
                  onClick={() => setViewMode('interactive')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap ${viewMode === 'interactive' ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                  <Sparkles className="w-3.5 h-3.5" /> Focus Editor
              </button>
              <button 
                  onClick={() => setViewMode('excel')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap ${viewMode === 'excel' ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                  <ListIcon className="w-3.5 h-3.5" /> Excel
              </button>
              <button 
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap ${viewMode === 'cards' ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                  <GridIcon className="w-3.5 h-3.5" /> Cards
              </button>
              <button 
                  onClick={() => setViewMode('takeoff')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap ${viewMode === 'takeoff' ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                  <ListIcon className="w-3.5 h-3.5" /> Plan Takeoff
              </button>
          </div>
          
          {/* Search Box */}
          <div className="relative group flex-1 w-full min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#0066CC] transition-colors" />
              <input 
                  ref={searchInputRef}
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search items by name, description, or category... (Cmd/Ctrl+F)"
                  className="w-full pl-9 pr-9 py-1.5 bg-slate-50/70 border border-slate-200/80 rounded-xl focus:bg-white focus:outline-none focus:border-[#0066CC] focus:ring-2 focus:ring-[#0066CC]/10 transition-all text-xs font-medium text-slate-700"
              />
              {searchQuery && (
                  <button 
                     onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                     className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
                  >
                      <X className="w-3.5 h-3.5" />
                  </button>
              )}
          </div>

          {/* Action Buttons: Save Changes, Global Margin, Import Excel, Export CSV */}
          <div className="flex items-center gap-2 shrink-0 w-full lg:w-auto justify-end">
              <button 
                  onClick={handleManualSave}
                  disabled={isSaving}
                  className={`px-3 py-1.5 text-xs border font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 ${isSaving ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'}`}
                  title="Save current changes locally"
              >
                  {isSaving ? (
                      <>
                          <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-white rounded-full animate-spin"></div>
                          <span>Saving...</span>
                      </>
                  ) : (
                      <>
                          <CheckIcon className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                      </>
                  )}
              </button>

              <div className="relative">
                  <button
                      onClick={() => setIsGlobalMarkupOpen(!isGlobalMarkupOpen)}
                      className={`p-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:text-[#0066CC] hover:border-sky-200 hover:shadow-sm transition-all ${isGlobalMarkupOpen ? 'ring-2 ring-sky-200 border-sky-300 text-[#0066CC]' : ''}`}
                      title="Set Global Margin"
                  >
                      <CalculatorIcon className="w-4 h-4" />
                  </button>
                  {isGlobalMarkupOpen && (
                      <div className="absolute top-full right-0 mt-2 p-4 bg-white rounded-xl shadow-xl border border-slate-200 z-50 w-64 origin-top-right animate-in fade-in zoom-in duration-200">
                          <label className="block text-xs font-bold text-slate-700 mb-2 whitespace-normal break-words">Set global margin % for ALL items</label>
                          <input 
                              type="number" 
                              value={globalMarkupValue}
                              onChange={e => setGlobalMarkupValue(Number(e.target.value))}
                              className="w-full border border-slate-300 rounded-lg p-2 text-sm mb-3 focus:outline-none focus:border-[#0066CC]" 
                          />
                          <div className="flex justify-end gap-2 text-xs">
                              <button onClick={() => setIsGlobalMarkupOpen(false)} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
                              <button onClick={handleApplyGlobalMarkup} className="px-3 py-1.5 bg-[#0066CC] text-white rounded-lg hover:bg-[#0055B3] font-bold shadow-sm">Apply All</button>
                          </div>
                      </div>
                  )}
              </div>

              <button 
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-3 py-1.5 bg-sky-50 border border-sky-200 text-[#0055B3] font-bold rounded-xl hover:bg-sky-100 transition-all text-xs flex items-center gap-1.5"
                  title="Paste or upload items from Excel"
              >
                  <ListIcon className="w-3.5 h-3.5" />
                  <span>Import Excel</span>
              </button>

              <button 
                  onClick={handleExportExcelWithFormulas}
                  className="p-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all"
                  title="Export Excel with Live Formulas"
              >
                  <ExportIcon className="w-4 h-4" />
              </button>
          </div>
      </div>

      
      

      <div className="space-y-8">
          
          {/* Main Editor (Full Width) */}
          <div className="w-full">
              
              {/* INTERACTIVE WORKSPACE MODE */}
              {viewMode === 'interactive' && (
                  <MotionDiv initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}>
                      <InteractiveBoqEditor 
                        items={fullBoq} 
                        rooms={projectContext.rooms}
                        bank={bank}
                        customBundles={settings?.customBundles}
                        onUpdate={handleUpdateItem}
                        onBulkUpdate={handleBulkUpdateItems}
                        onDelete={handleDeleteItem}
                        setTiers={setTiers}
                        activeTierId={activeTierId}
                        boqFrozen={projectContext.boqFrozen}
                      />
                  </MotionDiv>
              )}

              {/* EXCEL MODE */}
              {viewMode === 'excel' && (
                  <MotionDiv initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}>
                      <StudioExcelGrid 
                        items={fullBoq} 
                        rooms={projectContext.rooms}
                        onUpdate={handleUpdateItem}
                        onBulkUpdate={handleBulkUpdateItems}
                        onDelete={handleDeleteItem}
                        onViewInBank={onViewInBank}
                        onAddItem={handleOpenAddModal}
                        isOwner={isOwner}
                        boqFrozen={projectContext.boqFrozen}
                        highlightedItemIds={highlightedItemIds}
                        
                        marginAnalytics={marginAnalytics}
                        searchQuery={searchQuery}
                      />
                  </MotionDiv>
              )}

              {/* CARDS MODE */}
              {viewMode === 'cards' && (
                  <MotionDiv variants={container} initial="hidden" animate="show">
                    {(projectContext.rooms || []).map(room => (
                        <MotionDiv key={room.name} variants={itemVar}>
                            <RoomCard
                                room={room}
                                items={groupedItems.grouped[room.name] || []}
                                allRooms={projectContext.rooms || []}
                                searchQuery={searchQuery}
                                onUpdate={handleUpdateItem}
                                onBulkUpdate={handleBulkUpdateItems}
                                onDelete={handleDeleteItem}
                                onAddItem={() => handleOpenAddModal(room.name)}
                                onViewInBank={onViewInBank}
                                selectedItemIds={selectedItemIds}
                                onSelectItemToggle={handleSelectItemToggle}
                                onSaveAsBundle={handleSaveAsBundle}
                            />
                        </MotionDiv>
                    ))}
                    
                    {/* Unassigned Items */}
                    {groupedItems.unassigned.length > 0 && (
                        <MotionDiv variants={itemVar}>
                            <RoomCard
                                room={{ name: 'Unassigned', size: 0, unit: 'sq ft' }}
                                items={groupedItems.unassigned}
                                allRooms={projectContext.rooms}
                                searchQuery={searchQuery}
                                onUpdate={handleUpdateItem}
                                onBulkUpdate={handleBulkUpdateItems}
                                onDelete={handleDeleteItem}
                                onAddItem={() => handleOpenAddModal('Unassigned')}
                                onViewInBank={onViewInBank}
                                selectedItemIds={selectedItemIds}
                                onSelectItemToggle={handleSelectItemToggle}
                                onSaveAsBundle={handleSaveAsBundle}
                            />
                        </MotionDiv>
                    )}
                  </MotionDiv>
              )}

              {/* PLAN TAKEOFF MODE */}
              {viewMode === 'takeoff' && (
                  <MotionDiv initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}>
                      <TakeoffPanel 
                        projectContext={projectContext}
                        setProjectContext={setProjectContext}
                        tiers={tiers}
                        setTiers={setTiers}
                        activeTierId={activeTierId}
                        bank={bank}
                      />
                  </MotionDiv>
              )}
          </div>
          
          {/* Totals Breakdown */}
          {(() => {
              let firmTotal = 0;
              let estimateExposure = 0;
              let clientProcuredCount = 0;
              let excludedCount = 0;
              let firmBaseCost = 0;
              let firmMarginValue = 0;
              
              fullBoq.forEach(item => {
                  const basePrice = (item.materials + item.labor) * item.qty;
                  const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin) * item.qty;
                  const marginVal = sellPrice - basePrice;
                  
                  if (item.boqStatus === 'client_procured') {
                      clientProcuredCount++;
                  } else if (item.boqStatus === 'excluded') {
                      excludedCount++;
                  } else if (item.boqStatus === 'as_actuals' || item.boqStatus === 'provisional_sum' || item.boqStatus === 'pending_finalisation') {
                      estimateExposure += sellPrice;
                  } else if (item.boqStatus !== 'deleted' && item.boqStatus !== 'substituted') {
                      firmTotal += sellPrice;
                      firmBaseCost += basePrice;
                      firmMarginValue += marginVal;
                  }
              });
              
              const grandTotal = firmTotal + estimateExposure;
              const firmMarginPercent = firmTotal > 0 ? ((firmTotal - firmBaseCost) / firmBaseCost) * 100 : 0;
              
              return (
                  <div className="pt-4">
                      <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-5 text-sm flex flex-col lg:flex-row justify-between gap-6">
                          {/* Financials (Owners Only) */}
                          {isOwner ? (
                              <div className="flex flex-1 gap-6">
                                  {/* Base Costs */}
                                  <div className="flex flex-col flex-1 border-r border-slate-100 pr-6 justify-center">
                                      <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mb-1">Project Base Cost</span>
                                      <span className="font-mono text-slate-800 font-bold text-lg tabular-nums">₹ {firmBaseCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                      <div className="text-[10px] font-medium text-slate-500 mt-0.5">Materials + Labor</div>
                                  </div>
                                  {/* Margin */}
                                  <div className="flex flex-col flex-1 border-r border-slate-100 pr-6 justify-center">
                                      <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mb-1">Firm Margin</span>
                                      <span className="font-mono text-emerald-600 font-bold text-lg tabular-nums">₹ {firmMarginValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                      <div className="mt-0.5"><span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{firmMarginPercent.toFixed(1)}% Avg</span></div>
                                  </div>
                                  {/* Value */}
                                  <div className="flex flex-col flex-1 border-r border-slate-100 pr-6 justify-center">
                                      <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mb-1">Firm Scope Value</span>
                                      <span className="font-mono text-slate-900 font-bold text-lg tabular-nums">₹ {firmTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                      <div className="text-[10px] font-medium text-slate-500 mt-0.5">Total Billable</div>
                                  </div>
                              </div>
                          ) : (
                              <div className="flex flex-1 items-center justify-center border-r border-slate-100 pr-6">
                                  <span className="text-slate-400 text-xs font-medium italic">Financial details restricted to Owner role.</span>
                              </div>
                          )}
                          
                          {/* Item Counts (Everyone) */}
                          <div className="flex flex-col flex-1 border-r border-slate-100 pr-6 justify-center gap-1.5">
                               <div className="flex justify-between items-center">
                                   <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Client-Procured</span>
                                   <span className="font-bold text-slate-700 text-xs">{clientProcuredCount} items</span>
                               </div>
                               <div className="flex justify-between items-center">
                                   <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Excluded</span>
                                   <span className="font-bold text-slate-700 text-xs">{excludedCount} items</span>
                               </div>
                               <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-1.5">
                                       <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Estimated Value</span>
                                       <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1 rounded">EST</span>
                                   </div>
                                   <span className="font-bold text-slate-700 text-xs">{estimateExposure > 0 ? (isOwner ? `₹ ${estimateExposure.toLocaleString('en-IN')}` : 'Included') : 'None'}</span>
                               </div>
                          </div>

                          {/* Grand Total */}
                          <div className="flex flex-col min-w-[180px] justify-center items-end">
                              <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mb-1">Total Project Value</span>
                              {isOwner ? (
                                  <span className="font-mono text-sky-700 font-bold text-2xl tabular-nums">₹ {grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                              ) : (
                                  <span className="font-mono text-slate-300 font-bold text-2xl tabular-nums">₹ --</span>
                              )}
                          </div>
                      </div>
                  </div>
              );
          })()}
      </div>

      
      <AddItemModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        bank={bank}
        onAdd={handleAddItems}
        room={(projectContext.rooms || []).find(r => r.name === activeRoomId) || { name: 'General', size: 0, unit: 'sq ft' }}
        projectContext={projectContext}
      />

      <BulkImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={(items) => {
            setTiers(prev => prev.map(tier => {
                if (tier.id !== activeTierId) return tier;
                return { ...tier, boq: [...tier.boq, ...items] };
            }));
        }}
        frozen={projectContext.boqFrozen}
        rooms={projectContext.rooms}
        isOwner={isOwner}
      />

      {/* Floating Action Bar for Selected Items */}
      <AnimatePresence>
          {selectedItemIds.size > 0 && (
              <motion.div 
                  initial={{ opacity: 0, y: 50, x: "-50%" }}
                  animate={{ opacity: 1, y: 0, x: "-50%" }}
                  exit={{ opacity: 0, y: 50, x: "-50%" }}
                  className="fixed bottom-6 left-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl z-50 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 border border-slate-800 backdrop-blur-md max-w-4xl w-[calc(100%-2rem)] sm:w-auto"
              >
                  <div className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-[#0066CC] rounded-full flex items-center justify-center text-xs font-bold shadow-inner">
                          {selectedItemIds.size}
                      </span>
                      <span className="text-sm font-semibold text-slate-200">items selected</span>
                  </div>

                  <div className="hidden sm:block h-6 w-[1px] bg-slate-800" />

                  <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
                      <button 
                          onClick={() => {
                              const selectedBoqItems = fullBoq.filter(i => selectedItemIds.has(i.id));
                              const bankIds = selectedBoqItems.map(i => i.bankId);
                              if (bankIds.length > 0) {
                                  handleSaveAsBundle(bankIds);
                                  setSelectedItemIds(new Set());
                              }
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold rounded-xl text-xs hover:from-amber-400 hover:to-amber-500 transition-all shadow-md flex items-center gap-1.5"
                      >
                          📦 Save as Custom Bundle
                      </button>

                      <button 
                          onClick={() => {
                              const promptMargin = window.prompt("Enter margin % to apply to all selected items:", "20");
                              if (promptMargin !== null) {
                                  const marginValue = parseFloat(promptMargin);
                                  if (!isNaN(marginValue)) {
                                      const updates: { itemId: string; updates: Partial<BoqItem> }[] = Array.from(selectedItemIds).map((id) => ({
                                          itemId: id as string,
                                          updates: { marginOverride: marginValue }
                                      }));
                                      handleBulkUpdateItems(updates);
                                      setSelectedItemIds(new Set());
                                      alert(`Successfully updated margin to ${marginValue}% for ${updates.length} items!`);
                                  }
                              }
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-1.5"
                      >
                          ⚡ Set Margin %
                      </button>

                      <button 
                          onClick={() => {
                              const findStr = window.prompt("Enter text to find in specifications (e.g. Commercial):");
                              if (!findStr) return;
                              const replaceStr = window.prompt(`Replace "${findStr}" with (e.g. Marine Grade):`);
                              if (replaceStr === null) return;

                              const updates: any[] = [];
                              Array.from(selectedItemIds).forEach(id => {
                                  const item = fullBoq.find(i => i.id === id);
                                  if (item) {
                                      const oldSpecs = item.specs || '';
                                      const regex = new RegExp(findStr, 'gi');
                                      if (regex.test(oldSpecs)) {
                                          const newSpecs = oldSpecs.replace(regex, replaceStr);
                                          updates.push({ itemId: id, updates: { specs: newSpecs } });
                                      }
                                  }
                              });

                              if (updates.length > 0) {
                                  handleBulkUpdateItems(updates);
                                  setSelectedItemIds(new Set());
                                  alert(`Successfully replaced specs in ${updates.length} items!`);
                              } else {
                                  alert(`No matching text "${findStr}" found in selected items' specifications.`);
                              }
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-1.5"
                      >
                          ✏️ Bulk Spec Swap
                      </button>
                      
                      <button 
                          onClick={() => setSelectedItemIds(new Set())}
                          className="text-xs text-slate-400 hover:text-white font-bold hover:underline px-2 py-1"
                      >
                          Clear
                      </button>
                  </div>
              </motion.div>
          )}
      </AnimatePresence>
      
    </div>
  );
};

export default StudioDashboard;
