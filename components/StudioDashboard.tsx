
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProjectContext, Item, BoqItem, Room, AIStrategy, FullBoqItem, CommandAction, ProposalTier, AuditResult } from '../types';
import { id as generateId, calculateSellPrice } from '../lib/utils';
import CommandBar from './CommandBar';
import RoomCard from './RoomCard';
import StudioExcelGrid from './StudioExcelGrid';
import AddItemModal from './AddItemModal';
import BoqPackageCreator from './BoqPackageCreator';
import BulkImportModal from './BulkImportModal';
import { processCommand, auditProject, isAiAvailable } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheckIcon, GridIcon, ListIcon, SaveIcon, CheckIcon, ExportIcon, CalculatorIcon } from './Icons';
import { Search, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useOrg } from '../contexts/OrgContext';
import { db, functions } from '../services/firebaseClient';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, getDoc, query, collection } from 'firebase/firestore';

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

const StudioDashboard: React.FC<StudioDashboardProps> = ({ projectContext, setProjectContext, tiers, setTiers, activeTierId, bank, aiStrategy, onViewInBank, onSaveProject, projectId }) => {
  const { orgData, currentRole } = useOrg();
  const isOwner = ['Super Admin', 'Admin', 'Ops Director'].includes(currentRole);
  
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null); // For AddItemModal
  const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'excel'>('excel');
  
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
              html2canvas: { scale: 2, useCORS: true },
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
    const validRoomNames = new Set(projectContext.rooms.map(r => r.name));

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

  const handleProcessCommand = async (command: string) => {
      if (!activeTier) return;
      const { actions, summary } = await processCommand(command, activeTier.boq, projectContext, bank);
      
      let updatedBoq = [...activeTier.boq];
      actions.forEach(action => {
          updatedBoq = applyCommandAction(updatedBoq, action, bank);
      });

      setTiers(prev => prev.map(tier => {
          if (tier.id !== activeTierId) return tier;
          return { ...tier, boq: updatedBoq };
      }));
      
      alert(`Command Executed: ${summary}`);
  };

  const handlePackageCreated = (newBoq: BoqItem[]) => {
      setTiers(prev => prev.map(tier => {
          if (tier.id !== activeTierId) return tier;
          return { ...tier, boq: newBoq };
      }));
  }

  const handleRunAudit = async () => {
      if (!isAiAvailable()) return;
      setIsAuditing(true);
      setAuditResult(null);
      setAuditError(null);
      try {
          const result = await auditProject(projectContext, fullBoq);
          setAuditResult(result);
      } catch (e: any) {
          console.error("Smart Audit failed:", e);
          setAuditError(e.message || "Failed to run Smart Audit");
      } finally {
          setIsAuditing(false);
      }
  }

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

  if (!activeTier) return <div>Please select a proposal tier.</div>;

  return (
    <div id="boq-editor-content" className="space-y-8 pb-12 print:space-y-0 print:pb-0">
      
      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block w-full pt-8 pb-6 border-b-2 border-indigo-900 mb-6">
          <div className="flex justify-between items-end">
              <div>
                  <h1 className="text-3xl font-black tracking-tighter text-indigo-950 mb-1">SCHEDULE OF FINISHES</h1>
                  <h2 className="text-lg font-bold text-slate-600 uppercase tracking-widest">{projectContext.name}</h2>
              </div>
              <div className="text-right">
                  <div className="font-bold text-indigo-900 tracking-tight">FORM FACTORS DESIGN STUDIO</div>
                  <div className="text-xs text-slate-500 uppercase font-medium mt-1">Ref: 'Draft' | Date: {new Date().toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}</div>
              </div>
          </div>
      </div>

      {/* Header Area */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-4 print:hidden">
          <div>
            <h2 className="text-2xl font-black text-indigo-900 tracking-tight">Studio Editor <span className="text-indigo-600 text-lg align-top font-bold bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 ml-2">{activeTier.name}</span></h2>
            <p className="text-slate-500 font-medium">Build and refine your scope room by room.</p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center justify-start lg:justify-end">
              {/* Manual Save Button */}
              <div className="flex flex-col items-end mr-2">
                  <button 
                    onClick={handleManualSave}
                    disabled={isSaving}
                    className={`px-4 py-2 border font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 ${isSaving ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}
                    title="Save current changes locally"
                  >
                      {isSaving ? (
                          <>
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin"></div>
                            Saving...
                          </>
                      ) : (
                          <>
                            <CheckIcon className="w-4 h-4" /> Save Changes
                          </>
                      )}
                  </button>
                  <span className="text-[10px] text-slate-400 font-medium mt-1 pr-1">
                      {isSaving ? 'Syncing...' : `All changes saved`}
                  </span>
              </div>

              
              
              
              
              
              

              
              {/* View Toggle */}
              <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm self-start">
                  <button 
                    onClick={() => setViewMode('cards')}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'cards' ? 'bg-slate-100 text-indigo-900 shadow-inner' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                      <GridIcon className="w-4 h-4" /> Cards
                  </button>
                  <button 
                    onClick={() => setViewMode('excel')}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'excel' ? 'bg-indigo-50 text-indigo-700 shadow-inner' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                      <ListIcon className="w-4 h-4" /> Excel
                  </button>
              </div>

              {/* Set Global Markup */}
              <div className="relative self-start">
                  <button
                      onClick={() => setIsGlobalMarkupOpen(!isGlobalMarkupOpen)}
                      className={`p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:text-indigo-600 hover:border-indigo-200 hover:shadow-md transition-all ${isGlobalMarkupOpen ? 'ring-2 ring-indigo-200 border-indigo-300 text-indigo-600' : ''}`}
                      title="Set Global Markup"
                  >
                      <CalculatorIcon className="w-5 h-5" />
                  </button>
                  {isGlobalMarkupOpen && (
                      <div className="absolute top-full right-0 mt-2 p-4 bg-white rounded-xl shadow-xl border border-slate-200 z-50 w-64 origin-top-right animate-in fade-in zoom-in duration-200">
                          <label className="block text-xs font-bold text-slate-700 mb-2 whitespace-normal break-words">Set global markup % for ALL items</label>
                          <input 
                             type="number" 
                             value={globalMarkupValue}
                             onChange={e => setGlobalMarkupValue(Number(e.target.value))}
                             className="w-full border border-slate-300 rounded-lg p-2 text-sm mb-3 focus:outline-none focus:border-indigo-500" 
                          />
                          <div className="flex justify-end gap-2 text-xs">
                              <button onClick={() => setIsGlobalMarkupOpen(false)} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
                              <button onClick={handleApplyGlobalMarkup} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-sm">Apply All</button>
                          </div>
                      </div>
                  )}
              </div>

              {/* Bulk Import Button */}
              <button 
                onClick={() => setIsImportModalOpen(true)}
                className="px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 hover:shadow-md transition-all self-start text-xs flex items-center gap-2"
                title="Paste or upload items from Excel"
              >
                  <ListIcon className="w-4 h-4" /> Import Excel
              </button>

              {/* Excel Export Button */}
              <button 
                onClick={handleExportExcelWithFormulas}
                className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl hover:bg-emerald-100 hover:shadow-md transition-all self-start"
                title="Export Excel with Live Formulas"
              >
                  <ExportIcon className="w-5 h-5" />
              </button>

              <button 
                onClick={onSaveProject}
                className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:text-indigo-600 hover:border-indigo-200 hover:shadow-md transition-all self-start"
                title="Download Project Backup (JSON)"
              >
                  <SaveIcon className="w-5 h-5" />
              </button>

              <button 
                onClick={handleRunAudit}
                disabled={isAuditing || !isAiAvailable()}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-200/50 hover:scale-[1.02] transition-all flex items-center gap-2 self-start"
              >
                {isAuditing ? 'Auditing...' : <><ShieldCheckIcon className="w-5 h-5" /> Smart Audit</>}
              </button>
          </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
              ref={searchInputRef}
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search items by name, description, or category... (Cmd/Ctrl+F)"
              className="w-full pl-12 pr-12 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm font-medium text-slate-700"
          />
          {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} 
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                  <X className="w-4 h-4" />
              </button>
          )}
      </div>

      {/* Audit Result Banner */}
      <AnimatePresence>
        {auditError && (
            <MotionDiv initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl shadow-sm p-4 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative">
                    <button onClick={() => setAuditError(null)} className="absolute top-4 right-4 text-red-400 hover:text-red-600">✕</button>
                    <div className="flex items-center gap-3 text-red-700">
                        <AlertCircle className="w-5 h-5" />
                        <div>
                            <span className="font-bold block">Audit Failed</span>
                            <span className="text-sm">{auditError}</span>
                        </div>
                    </div>
                    <button onClick={handleRunAudit} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-bold rounded-lg transition-colors whitespace-nowrap">
                        Retry Audit
                    </button>
                </div>
            </MotionDiv>
        )}
        {auditResult && (
            <MotionDiv initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-white border-l-4 border-indigo-500 rounded-r-xl shadow-md p-6 mb-8 relative">
                    <button onClick={() => setAuditResult(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">✕</button>
                    <div className="flex items-center gap-4 mb-4">
                        <div className={`text-4xl font-black ${auditResult.score > 80 ? 'text-emerald-500' : auditResult.score > 50 ? 'text-amber-500' : 'text-red-500'}`}>{auditResult.score}</div>
                        <div>
                            <h4 className="font-bold text-indigo-900">Project Health Score</h4>
                            <p className="text-xs text-slate-500">AI analysis of scope completeness and logic.</p>
                        </div>
                    </div>
                    {((auditResult.missingItems?.length || 0) === 0 && (auditResult.warnings?.length || 0) === 0 && (auditResult.suggestions?.length || 0) === 0) ? (
                        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg flex items-center gap-3">
                            <CheckCircle2 className="w-6 h-6" />
                            <span className="font-bold">No issues found.</span> The scope appears well-structured.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                            {(auditResult.missingItems?.length || 0) > 0 && (
                                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                    <strong className="text-red-700 block mb-2">Missing Essentials</strong>
                                    <ul className="list-disc list-inside text-red-600 space-y-1">{auditResult.missingItems?.slice(0,3).map((item, i) => <li key={i}>{item}</li>)}</ul>
                                </div>
                            )}
                            {(auditResult.warnings?.length || 0) > 0 && (
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                                    <strong className="text-amber-700 block mb-2">Logic Warnings</strong>
                                    <ul className="list-disc list-inside text-amber-600 space-y-1">{auditResult.warnings?.slice(0,3).map((item, i) => <li key={i}>{item}</li>)}</ul>
                                </div>
                            )}
                            {(auditResult.suggestions?.length || 0) > 0 && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                    <strong className="text-blue-700 block mb-2">Smart Suggestions</strong>
                                    <ul className="list-disc list-inside text-blue-600 space-y-1">{auditResult.suggestions?.slice(0,3).map((item, i) => <li key={i}>{item}</li>)}</ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </MotionDiv>
        )}
      </AnimatePresence>

      <div className="space-y-8">
          
          {/* Main Editor (Full Width) */}
          <div className="w-full">
              
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
                    {projectContext.rooms.map(room => (
                        <MotionDiv key={room.name} variants={itemVar}>
                            <RoomCard
                                room={room}
                                items={groupedItems.grouped[room.name] || []}
                                allRooms={projectContext.rooms}
                                searchQuery={searchQuery}
                                onUpdate={handleUpdateItem}
                                onBulkUpdate={handleBulkUpdateItems}
                                onDelete={handleDeleteItem}
                                onAddItem={() => handleOpenAddModal(room.name)}
                                onViewInBank={onViewInBank}
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
                            />
                        </MotionDiv>
                    )}
                  </MotionDiv>
              )}
          </div>
          
          {/* Totals Breakdown */}
          {(() => {
              let firmTotal = 0;
              let estimateExposure = 0;
              let clientProcuredCount = 0;
              let excludedCount = 0;
              
              fullBoq.forEach(item => {
                  const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
                  const val = sellPrice * item.qty;
                  
                  if (item.boqStatus === 'client_procured') {
                      clientProcuredCount++;
                  } else if (item.boqStatus === 'excluded') {
                      excludedCount++;
                  } else if (item.boqStatus === 'as_actuals' || item.boqStatus === 'provisional_sum' || item.boqStatus === 'pending_finalisation') {
                      estimateExposure += val;
                  } else if (item.boqStatus !== 'deleted' && item.boqStatus !== 'substituted') {
                      firmTotal += val;
                  }
              });
              
              const grandTotal = firmTotal + estimateExposure;
              
              return (
                  <div className="flex justify-end pt-4">
                      <div className="w-full sm:w-[360px] bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-sm">
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-slate-600 font-medium">Firm scope</span>
                              <span className="font-mono text-indigo-900 font-bold">₹ {firmTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="flex justify-between items-center mb-3">
                              <div className="flex items-center gap-2">
                                  <span className="text-slate-600 font-medium">Estimated items</span>
                                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded cursor-help" title="As actuals, provisional sum, or pending finalisation">EST</span>
                              </div>
                              <span className="font-mono text-amber-600 font-bold">₹ {estimateExposure.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-slate-100 pt-3 mb-3">
                              <span className="text-indigo-900 font-bold text-base">Grand total</span>
                              <span className="font-mono text-indigo-950 font-black text-lg">₹ {grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs text-slate-400">
                              <span>Client-procured: {clientProcuredCount} items (₹0 in FFDS billing) &middot; Excluded: {excludedCount}</span>
                          </div>
                      </div>
                  </div>
              );
          })()}

          {/* AI Tools Section (Bottom) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-200">
              <CommandBar onProcessCommand={handleProcessCommand} />
              <BoqPackageCreator projectContext={projectContext} bank={bank} onPackageCreated={handlePackageCreated} />
          </div>
      </div>

      
      <AddItemModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        bank={bank}
        onAdd={handleAddItems}
        room={projectContext.rooms.find(r => r.name === activeRoomId) || { name: 'General', size: 0, unit: 'sq ft' }}
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
    </div>
  );
};

export default StudioDashboard;
