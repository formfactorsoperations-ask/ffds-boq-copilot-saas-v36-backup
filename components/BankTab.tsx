
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AIStrategy, Item } from '../types';
import { id as generateId } from '../lib/utils';
import Card from './shared/Card';
import BankItemCard from './BankItemCard';
import { ListIcon, GridIcon, UploadIcon, SparklesIcon, PlusIcon, ExportIcon, NewFileIcon } from './Icons';
import BulkImportModal from './BulkImportModal';

interface BankTabProps {
  bank: Item[];
  setBank: React.Dispatch<React.SetStateAction<Item[]>>;
  aiStrategy: AIStrategy;
  highlightedBankItemId: string | null;
  onHighlightClear: () => void;
}

const BankTab: React.FC<BankTabProps> = ({ bank, setBank, aiStrategy, highlightedBankItemId, onHighlightClear }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      onHighlightClear();
    };
  }, [searchTerm, selectedCategory, onHighlightClear]);

  const categories = useMemo(() => ['All', ...new Set(bank.map(item => item.cat))], [bank]);

  const filteredBank = useMemo(() => {
    return bank.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.cat === selectedCategory;
      const matchesSearch = (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
                            (item.specs || '').toLowerCase().includes((searchTerm || '').toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [bank, searchTerm, selectedCategory]);

  const stats = useMemo(() => {
      const totalItems = bank.length;
      const totalCategories = new Set(bank.map(i => i.cat)).size;
      const avgMargin = bank.length > 0 
        ? (bank.reduce((sum, i) => sum + i.margin, 0) / bank.length).toFixed(1)
        : '0.0';
      return { totalItems, totalCategories, avgMargin };
  }, [bank]);
  
  const handleAddItem = () => {
      const newItem: Item = {
          id: generateId(),
          name: '',
          cat: selectedCategory !== 'All' ? selectedCategory : 'General',
          specs: 'Standard specification',
          unit: 'nos',
          materials: 0,
          labor: 0,
          margin: 20
      };
      setBank(prev => [newItem, ...prev]);
  };

  // Text Import (via Modal)
  const handleBulkImportText = (items: Item[]) => {
      setBank(prev => [...items, ...prev]);
  };

  // JSON File Upload Import
  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = event.target?.result as string;
              const importedItems = JSON.parse(json);

              if (!Array.isArray(importedItems)) {
                  alert("Invalid format: The JSON file must contain an array of items.");
                  return;
              }

              // Merge Logic: Update if ID exists, Add if new
              setBank(prevBank => {
                  const bankMap = new Map(prevBank.map(i => [i.id, i]));
                  let newCount = 0;
                  let updateCount = 0;

                  importedItems.forEach((item: any) => {
                      if (item.id && item.name) {
                          if (bankMap.has(item.id)) {
                              bankMap.set(item.id, item); // Update existing
                              updateCount++;
                          } else {
                              bankMap.set(item.id, item); // Add new
                              newCount++;
                          }
                      }
                  });

                  alert(`Import Successful!\nUpdated: ${updateCount} items\nAdded: ${newCount} items`);
                  return Array.from(bankMap.values());
              });

          } catch (error) {
              console.error('Error parsing JSON:', error);
              alert('Failed to load JSON file. Please check the file format.');
          }
      };
      reader.readAsText(file);
      // Reset input
      e.target.value = ''; 
  };

  const handleExportBank = () => {
      const dataStr = JSON.stringify(bank, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FFDS_Item_Bank_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleUpdateItem = (id: string, updatedItem: Item) => {
    setBank(prev => prev.map(item => item.id === id ? updatedItem : item));
  };
  
  const handleDeleteItem = (id: string) => {
    setBank(prev => prev.filter(item => item.id !== id));
  };

  // Custom Grid Template: Added Total Cost column
  const gridTemplate = "minmax(220px, 3fr) minmax(100px, 1.2fr) minmax(60px, 0.6fr) minmax(90px, 1fr) minmax(80px, 0.9fr) minmax(80px, 0.9fr) minmax(70px, 0.8fr) minmax(100px, 1.1fr) 50px";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1. Header Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                  <ListIcon className="w-24 h-24" />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Library Size</p>
              <h2 className="text-4xl font-black">{stats.totalItems} <span className="text-lg font-medium text-slate-500">Items</span></h2>
              <div className="w-full bg-slate-800 h-1 mt-4 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full w-3/4"></div>
              </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden group hover:border-indigo-200 transition-colors">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <GridIcon className="w-24 h-24" />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Categories</p>
              <h2 className="text-4xl font-black text-slate-800">{stats.totalCategories}</h2>
              <p className="text-xs text-slate-500 mt-2">Active trades & groups</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden group hover:border-emerald-200 transition-colors">
              <div className="absolute top-0 right-0 p-4 opacity-5 text-emerald-600 group-hover:opacity-10 transition-opacity">
                  <SparklesIcon className="w-24 h-24" />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Avg. Margin</p>
              <h2 className="text-4xl font-black text-emerald-600">{stats.avgMargin}%</h2>
              <p className="text-xs text-slate-500 mt-2">Target profitability</p>
          </div>
      </div>

      <Card title="Item Library" className="min-h-[600px] flex flex-col">
        {/* 2. Controls Toolbar */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center mb-6">
            
            {/* Search & Filter */}
            <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto flex-grow min-w-0">
                <div className="relative w-full md:w-72 flex-shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                    <input 
                        type="text" 
                        placeholder="Search by name, spec, or tag..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition-all placeholder:text-slate-400"
                    />
                </div>
                
                <div className="flex-grow overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
                    <div className="flex gap-2">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all border
                                    ${selectedCategory === cat 
                                        ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }
                                `}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 w-full lg:w-auto flex-shrink-0 border-t lg:border-t-0 border-slate-100 pt-4 lg:pt-0 flex-wrap">
                <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200 mr-2">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        title="List View"
                    >
                        <ListIcon className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        title="Grid View"
                    >
                        <GridIcon className="w-4 h-4" />
                    </button>
                </div>

                <button 
                    onClick={handleExportBank}
                    className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                >
                    <ExportIcon className="w-4 h-4" /> Export
                </button>

                {/* Import Group */}
                <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                    <button 
                        onClick={() => setIsBulkModalOpen(true)}
                        className="px-3 py-1.5 bg-white text-slate-600 text-[10px] font-bold rounded-lg shadow-sm hover:text-indigo-600 transition-all whitespace-nowrap flex items-center gap-1"
                        title="Paste Text"
                    >
                        <ListIcon className="w-3 h-3" /> Paste Text
                    </button>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-white text-slate-600 text-[10px] font-bold rounded-lg shadow-sm hover:text-indigo-600 transition-all whitespace-nowrap flex items-center gap-1"
                        title="Upload JSON File"
                    >
                        <UploadIcon className="w-3 h-3" /> Upload JSON
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleJsonUpload} 
                        accept=".json" 
                        className="hidden" 
                    />
                </div>

                <button 
                    onClick={handleAddItem} 
                    className="ml-2 px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                    <PlusIcon className="w-4 h-4" /> Add Item
                </button>
            </div>
        </div>
        
        {/* 3. Content Area */}
        {viewMode === 'list' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col bg-white shadow-sm flex-grow">
                {/* List Header - Sticky */}
                <div className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 tracking-wider sticky top-0 z-10">
                    <div className="grid gap-4 p-3 items-center" style={{ gridTemplateColumns: gridTemplate }}>
                        <div className="pl-2">Item Details</div>
                        <div>Category</div>
                        <div className="text-center">Unit</div>
                        <div className="text-right text-blue-600">Total Cost</div>
                        <div className="text-right">Mat. Cost</div>
                        <div className="text-right">Lab. Cost</div>
                        <div className="text-right">Margin</div>
                        <div className="text-right">Sell Price</div>
                        <div></div>
                    </div>
                </div>
                
                {/* List Body */}
                <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px] bg-white">
                    {filteredBank.map(item => (
                        <BankItemCard 
                            key={item.id}
                            item={item}
                            onUpdate={handleUpdateItem}
                            onDelete={handleDeleteItem}
                            aiStrategy={aiStrategy}
                            isHighlighted={item.id === highlightedBankItemId}
                            viewMode="list"
                            gridTemplate={gridTemplate}
                        />
                    ))}
                    {filteredBank.length === 0 && (
                        <div className="py-20 text-center">
                            <p className="text-slate-400 text-sm">No items found matching your filters.</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto max-h-[700px] p-1">
                {filteredBank.map(item => (
                    <BankItemCard 
                        key={item.id}
                        item={item}
                        onUpdate={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        aiStrategy={aiStrategy}
                        isHighlighted={item.id === highlightedBankItemId}
                        viewMode="grid"
                    />
                ))}
            </div>
        )}
      </Card>

      <BulkImportModal 
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onImport={handleBulkImportText}
        existingCategories={categories}
      />
    </div>
  );
};

export default BankTab;
