
import React, { useState, useMemo, useEffect } from 'react';
import { Item, Room, ProjectContext, QuantitySuggestion } from '../types';
import { formatCurrency } from '../lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { estimateQuantity, isAiAvailable } from '../services/geminiService';
import { SparklesIcon, ListIcon, GridIcon, CheckIcon } from './Icons';
import { ADDON_BUNDLES, calculateQuantity } from '../lib/standardPackages';
import { INITIAL_BANK } from '../constants';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  bank: Item[];
  onAdd: (items: Item[], qtys: { [itemId: string]: number }, rationales: { [itemId: string]: string }) => void;
  room: Room;
  projectContext: ProjectContext;
}

type Stage = 'select' | 'review';
type Mode = 'items' | 'bundles';

const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, bank, onAdd, room, projectContext }) => {
  const [stage, setStage] = useState<Stage>('select');
  const [mode, setMode] = useState<Mode>('items');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<{ [itemId: string]: { qty: number; rationale: string; isLoading: boolean } }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = useMemo(() => ['All', ...new Set(bank.map(item => item.cat))], [bank]);
  
  const filteredBank = useMemo(() => {
    return bank.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.cat === selectedCategory;
      const matchesSearch = (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
                            (item.specs || '').toLowerCase().includes((searchTerm || '').toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [bank, searchTerm, selectedCategory]);

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };
  
  const handleQuantityChange = (itemId: string, qty: number) => {
    setQuantities(prev => ({ ...prev, [itemId]: { ...prev[itemId], qty: Math.max(0, qty) } }));
  };

  const handleNext = () => {
    setStage('review');
    const itemsToReview = bank.filter(i => selectedItems.has(i.id));
    
    itemsToReview.forEach(async (item) => {
        // If bundle already set the quantity, don't overwrite/re-estimate
        if (quantities[item.id] && quantities[item.id].qty > 0) return;

        setQuantities(prev => ({...prev, [item.id]: { qty: 1, rationale: '', isLoading: true }}));
        const suggestion: QuantitySuggestion = await estimateQuantity(item, room, projectContext);
        setQuantities(prev => ({...prev, [item.id]: { qty: suggestion.qty || 1, rationale: suggestion.rationale || 'Could not estimate.', isLoading: false }}));
    })
  };

  const handleSelectBundle = (bundleId: string) => {
      const bundle = ADDON_BUNDLES.find(b => b.id === bundleId);
      if (!bundle) return;

      const newQuantities: any = {};
      const newSelection = new Set<string>();

      bundle.itemIds.forEach(id => {
          // Robust lookup: Check active bank first, fallback to initial bank if local db is stale
          let item = bank.find(i => i.id === id);
          if (!item) {
              item = INITIAL_BANK.find(i => i.id === id);
          }

          if (item) {
              newSelection.add(id);
              // Use standard calculation logic
              const qty = calculateQuantity(item, room.size, projectContext.ceilingHeight || 9.5);
              newQuantities[id] = { 
                  qty, 
                  rationale: `Bundle: ${bundle.name}`, 
                  isLoading: false 
              };
          }
      });

      setSelectedItems(newSelection);
      setQuantities(newQuantities);
      setStage('review');
  };

  const handleAddClick = () => {
    // Collect items from both active bank AND fallback bank if needed
    const itemsToAdd = Array.from(selectedItems).map(id => {
        return bank.find(i => i.id === id) || INITIAL_BANK.find(i => i.id === id);
    }).filter((i): i is Item => !!i);

    const finalQtys = Object.fromEntries(Object.entries(quantities || {}).map(([id, data]) => [id, (data as any).qty]));
    const finalRationales = Object.fromEntries(Object.entries(quantities || {}).map(([id, data]) => [id, (data as any).rationale]));
    onAdd(itemsToAdd, finalQtys, finalRationales);
    handleClose();
  };

  const handleClose = () => {
      onClose();
      // Reset state for next time
      setTimeout(() => {
        setStage('select');
        setMode('items');
        setSelectedItems(new Set());
        setQuantities({});
        setSearchTerm('');
      }, 300); // Delay to allow exit animation
  }

  const MotionDiv = motion.div as any;

  if (!isOpen) return null;

  // We need to merge items for review from bank and fallback just in case
  const itemsForReview = Array.from(selectedItems).map(id => {
      return bank.find(i => i.id === id) || INITIAL_BANK.find(i => i.id === id);
  }).filter((i): i is Item => !!i);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
          >
            <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                  <h3 className="text-xl font-bold">Add to <span className="text-blue-600">{room.name}</span></h3>
                  <p className="text-xs text-slate-500">
                    {stage === 'select' ? "Choose individual items or use a smart bundle." : `Reviewing ${selectedItems.size} items.`}
                  </p>
              </div>
              {stage === 'select' && (
                  <div className="flex bg-white rounded-lg p-1 border border-slate-200">
                      <button 
                        onClick={() => setMode('items')} 
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'items' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                          Individual Items
                      </button>
                      <button 
                        onClick={() => setMode('bundles')} 
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${mode === 'bundles' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                          <SparklesIcon className="w-3 h-3" /> Smart Bundles
                      </button>
                  </div>
              )}
            </div>
            
            {stage === 'select' && mode === 'items' && (
                <>
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-b">
                    <input type="text" placeholder="Search by name or specs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="w-full p-2 border rounded-lg bg-white text-sm" >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-2 bg-slate-50/50">
                {filteredBank.map(item => (
                    <div key={item.id} onClick={() => toggleItemSelection(item.id)} className={`p-3 border rounded-lg cursor-pointer transition-all flex justify-between items-center ${selectedItems.has(item.id) ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-200' : 'bg-white hover:border-blue-300'}`} >
                        <div>
                            <p className="font-bold text-sm text-slate-800">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.cat} • {item.specs}</p>
                        </div>
                        <div className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            {formatCurrency(item.materials + item.labor)}
                        </div>
                    </div>
                ))}
                </div>
                </>
            )}

            {stage === 'select' && mode === 'bundles' && (
                <div className="flex-grow overflow-y-auto p-6 bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {ADDON_BUNDLES.map(bundle => (
                            <div 
                                key={bundle.id} 
                                onClick={() => handleSelectBundle(bundle.id)}
                                className="bg-white border-2 border-indigo-100 rounded-xl p-5 hover:border-indigo-500 hover:shadow-lg transition-all cursor-pointer group"
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="text-2xl bg-indigo-50 w-10 h-10 flex items-center justify-center rounded-full group-hover:scale-110 transition-transform">{bundle.icon}</div>
                                    <h4 className="font-bold text-slate-800">{bundle.name}</h4>
                                </div>
                                <p className="text-xs text-slate-500 mb-4 h-8">{bundle.description}</p>
                                <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{bundle.itemIds.length} Items</span>
                                    <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">Select & Review →</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {stage === 'review' && (
                 <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                    {itemsForReview.map(item => (
                        <div key={item.id} className="p-3 border bg-white rounded-lg shadow-sm">
                           <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-bold text-sm">{item.name}</p>
                                    <p className="text-xs text-slate-500">{item.cat} • Unit: {item.unit}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-semibold uppercase text-slate-400">Qty</label>
                                    <input type="number" min="0" value={quantities[item.id]?.qty || 0} disabled={quantities[item.id]?.isLoading} onChange={e => handleQuantityChange(item.id, parseFloat(e.target.value))} className="w-20 p-1.5 border border-slate-300 rounded text-center font-bold text-slate-800" />
                                </div>
                           </div>
                           <div className="mt-2 text-xs text-indigo-700 italic bg-indigo-50 border border-indigo-100 p-2 rounded-md flex gap-2">
                            {quantities[item.id]?.isLoading ? (
                                <span className="animate-pulse">AI is calculating...</span>
                            ) : (
                                <>
                                <SparklesIcon className="w-3 h-3 shrink-0 mt-0.5"/>
                                <span><strong>Logic:</strong> {quantities[item.id]?.rationale}</span>
                                </>
                            )}
                           </div>
                        </div>
                    ))}
                 </div>
            )}


            <div className="p-4 border-t flex justify-between bg-white rounded-b-2xl">
              <div>
                {stage === 'review' && (
                    <button onClick={() => setStage('select')} className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 text-sm">
                        ← Back
                    </button>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={handleClose} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 text-sm">
                    Cancel
                </button>
                {stage === 'select' ? (
                    <button onClick={handleNext} disabled={selectedItems.size === 0} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg shadow-md hover:bg-black disabled:bg-slate-300 disabled:shadow-none transition-all text-sm">
                        Review Selection ({selectedItems.size})
                    </button>
                ) : (
                     <button onClick={handleAddClick} disabled={selectedItems.size === 0} className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg shadow-md hover:bg-emerald-700 disabled:bg-slate-300 disabled:shadow-none transition-all text-sm flex items-center gap-2">
                        <CheckIcon className="w-4 h-4" /> Add to {room.name}
                    </button>
                )}
              </div>
            </div>
          </MotionDiv>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AddItemModal;
