
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FullBoqItem, Room, BoqItem } from '../types';
import { formatCurrency, calculateSellPrice } from '../lib/utils';
import { DeleteIcon, LinkIcon, WandIcon } from './Icons';
import { motion } from 'framer-motion';
import { refineItemSpecs, generateLumpsumBreakdown } from '../services/geminiService';

interface BoqItemCardProps {
  item: FullBoqItem;
  rooms: Room[];
  searchQuery?: string;
  onUpdate: (itemId: string, fieldOrUpdates: keyof BoqItem | Partial<BoqItem>, value?: any) => void;
  onDelete: (itemId: string) => void;
  onViewInBank: (bankId: string) => void;
}

const highlightText = (text: string, query?: string) => {
    if (!query || query.length < 2 || !text) return text;
    const parts = text.toString().split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() 
            ? <mark key={i} className="bg-amber-200 text-amber-900 px-0.5 rounded-sm">{part}</mark> 
            : part
    );
};

const CATEGORY_COLORS: Record<string, string> = {
    'carpentry': 'bg-amber-100 text-amber-700',
    'civil': 'bg-slate-200 text-slate-700',
    'electrical': 'bg-yellow-100 text-yellow-700',
    'plumbing': 'bg-blue-100 text-blue-700',
    'painting': 'bg-pink-100 text-pink-700',
    'finish': 'bg-purple-100 text-purple-700',
    'hvac': 'bg-cyan-100 text-cyan-700',
    'default': 'bg-indigo-50 text-indigo-700'
};

const getCategoryStyle = (category: string) => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('carpentry')) return CATEGORY_COLORS['carpentry'];
    if (cat.includes('civil')) return CATEGORY_COLORS['civil'];
    if (cat.includes('electrical')) return CATEGORY_COLORS['electrical'];
    if (cat.includes('plumbing')) return CATEGORY_COLORS['plumbing'];
    if (cat.includes('painting')) return CATEGORY_COLORS['painting'];
    if (cat.includes('finish') || cat.includes('decor')) return CATEGORY_COLORS['finish'];
    if (cat.includes('hvac') || cat.includes('ac')) return CATEGORY_COLORS['hvac'];
    return CATEGORY_COLORS['default'];
};

const getCategoryEmoji = (category: string) => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('civil')) return '🏗️';
    if (cat.includes('carpentry')) return '🪵';
    if (cat.includes('hardware')) return '🔩';
    if (cat.includes('finish')) return '🎨';
    if (cat.includes('paint')) return '🖌️';
    if (cat.includes('electrical')) return '💡';
    if (cat.includes('plumbing')) return '🚰';
    return '📦';
};

const EditableField: React.FC<{
    value: string | number;
    onChange: (value: string | number) => void;
    onBlur: () => void;
    className?: string;
    inputType?: 'text' | 'number';
    prefix?: string;
    suffix?: string;
    placeholder?: string;
}> = ({ value, onChange, onBlur, className, inputType = 'text', prefix = '', suffix = '', placeholder }) => {
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const handleBlur = () => {
        setIsEditing(false);
        onBlur();
    }

    if (isEditing) {
        return (
             <input
                ref={inputRef}
                type={inputType}
                value={value !== undefined ? value : ''}
                onChange={(e) => onChange(inputType === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                className={`bg-white border border-indigo-400 rounded-md outline-none ring-2 ring-indigo-100 text-center shadow-sm ${className}`}
                placeholder={placeholder}
            />
        )
    }

    return (
        <span onClick={() => setIsEditing(true)} className={`cursor-pointer hover:bg-white hover:shadow-sm rounded-md px-1 transition-all ${className} ${!value ? 'text-slate-300' : ''}`}>
           {prefix}{value}{suffix}
        </span>
    )
}

const BoqItemCard: React.FC<BoqItemCardProps> = ({ item, rooms, searchQuery, onUpdate, onDelete, onViewInBank }) => {
  const [isRefining, setIsRefining] = useState(false);
  const [isGeneratingBreakdown, setIsGeneratingBreakdown] = useState(false);
  
  const sellPrice = useMemo(() => calculateSellPrice(item.materials, item.labor, item.margin), [item.materials, item.labor, item.margin]);
  const totalLineItem = sellPrice * item.qty;
  const categoryStyle = getCategoryStyle(item.cat);

  // Initialize calculator defaults if not set, BUT only once
  useEffect(() => {
      // Check if we need to set defaults (only if ALL are empty/0)
      if (!item.calcMultiplier && !item.calcLength && !item.calcWidth) {
          let defaultM = 1;
          const name = (item.name || '').toLowerCase();
          const cat = (item.cat || '').toLowerCase();
          
          if (cat.includes('paint') && !name.includes('ceiling')) defaultM = 3.5; // Wall Paint
          else if (cat.includes('paint') && name.includes('ceiling')) defaultM = 1.0; // Ceiling Paint
          else if (name.includes('false ceiling')) defaultM = 1.25; // Cove/Drop factor
          else if (name.includes('flooring') || name.includes('tile')) defaultM = 1.1; // Wastage/Skirting
          
          // Only update if it's different to avoid loops
          if (defaultM !== 1) {
             onUpdate(item.id, { calcMultiplier: defaultM });
          }
      }
  }, []); // Run once on mount

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [specInput, setSpecInput] = useState(item.specs || '');

  // Keep specInput in sync with item.specs when it changes from outside
  useEffect(() => {
    setSpecInput(item.specs || '');
  }, [item.specs]);

  const handleMagicRationale = async () => {
      setIsRefining(true);
      const newSpecs = await refineItemSpecs(item.name, item.specs, "Modern");
      if (newSpecs) {
          onUpdate(item.id, 'rationale', `Spec Note: ${newSpecs}`);
      }
      setIsRefining(false);
  }

  const handleCalcChange = (field: 'l' | 'w' | 'm', val: number) => {
      const l = field === 'l' ? val : item.calcLength || 0;
      const w = field === 'w' ? val : item.calcWidth || 0;
      const m = field === 'm' ? val : item.calcMultiplier || 1;
      
      const newQty = parseFloat((l * w * m).toFixed(2));
      
      const updates: Partial<BoqItem> = {
          calcLength: l,
          calcWidth: w,
          calcMultiplier: m,
      };

      if (newQty > 0) {
          updates.qty = newQty;
      }

      onUpdate(item.id, updates);
  }

  const handleArrayChange = (field: 'inclusions' | 'exclusions', val: string) => {
      const arr = val.split(',').map(s => s.trim()).filter(s => s);
      onUpdate(item.id, field, arr);
  }

  const addBreakdownItem = () => {
      const currentBreakdown = item.lumpsumBreakdown || [];
      onUpdate(item.id, 'lumpsumBreakdown', [
          ...currentBreakdown, 
          { id: `lb_${Date.now()}`, description: '', estimatedValue: 0 }
      ]);
  };

  const updateBreakdownItem = (id: string, field: 'description' | 'estimatedValue', value: any) => {
      const currentBreakdown = item.lumpsumBreakdown || [];
      onUpdate(item.id, 'lumpsumBreakdown', currentBreakdown.map(b => 
          b.id === id ? { ...b, [field]: value } : b
      ));
  };

  const removeBreakdownItem = (id: string) => {
      const currentBreakdown = item.lumpsumBreakdown || [];
      onUpdate(item.id, 'lumpsumBreakdown', currentBreakdown.filter(b => b.id !== id));
  };

  const handleGenerateBreakdown = async () => {
      setIsGeneratingBreakdown(true);
      try {
          const breakdown = await generateLumpsumBreakdown(item.name, item.cat, sellPrice);
          if (breakdown && breakdown.length > 0) {
              onUpdate(item.id, 'lumpsumBreakdown', breakdown);
          }
      } catch (e) {
          console.error("Failed to generate breakdown", e);
      } finally {
          setIsGeneratingBreakdown(false);
      }
  };

  const isLumpsum = item.unit.toLowerCase() === 'ls' || item.unit.toLowerCase() === 'lumpsum' || item.cat.toLowerCase().includes('civil');

  const MotionDiv = motion.div as any;
  const MotionButton = motion.button as any;

  return (
    <MotionDiv 
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
        whileHover={{ y: -4, transition: { duration: 0.2 } }}
        className="glass-light rounded-2xl p-5 group relative transition-all duration-300 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] hover:border-indigo-200"
    >
        {/* Actions */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-2">
             <MotionButton whileHover={{scale: 1.1}} whileTap={{scale: 0.9}} onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className={`p-1.5 rounded-lg shadow-sm border transition-colors ${isAdvancedOpen ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200 hover:text-indigo-600'}`} title="Advanced Settings">
                <span className="text-xs font-bold px-1">⚙️</span>
            </MotionButton>
             <MotionButton whileHover={{scale: 1.1}} whileTap={{scale: 0.9}} onClick={() => onViewInBank(item.bankId)} className="p-1.5 bg-white text-indigo-600 rounded-lg shadow-sm border border-slate-100 hover:border-indigo-200" title="View in Bank">
                <LinkIcon className="w-3.5 h-3.5" />
            </MotionButton>
            <MotionButton whileHover={{scale: 1.1}} whileTap={{scale: 0.9}} onClick={() => onDelete(item.id)} className="p-1.5 bg-white text-rose-500 rounded-lg shadow-sm border border-slate-100 hover:border-rose-200" title="Remove Item">
                <DeleteIcon className="w-3.5 h-3.5" />
            </MotionButton>
        </div>

        {/* Header */}
        <div className="flex items-start gap-4 pr-16 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner ${categoryStyle} bg-opacity-30`}>
                {getCategoryEmoji(item.cat)}
            </div>
            <div>
                 <h3 className="text-base font-bold text-indigo-900 leading-tight mb-1.5">{highlightText(item.name, searchQuery)}</h3>
                 <div className="text-xs font-medium flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${categoryStyle} bg-opacity-20`}>{highlightText(item.cat, searchQuery)}</span>
                    <select 
                        value={item.roomId || 'Unassigned'} 
                        onChange={(e) => onUpdate(item.id, 'roomId', e.target.value === 'Unassigned' ? undefined : e.target.value)}
                        className="bg-transparent text-slate-400 hover:text-indigo-600 cursor-pointer outline-none text-[10px] font-bold uppercase tracking-wide max-w-[100px] truncate transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        title="Move to another room"
                    >
                        <option value="Unassigned">Unassigned</option>
                        {rooms.map(r => (
                            <option key={r.name} value={r.name}>{r.name}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
        
        {/* Specs */}
        <div className="relative group/specs mb-5">
            {isEditingSpecs ? (
                <textarea
                    autoFocus
                    value={specInput}
                    onChange={(e) => setSpecInput(e.target.value)}
                    onBlur={() => {
                        setIsEditingSpecs(false);
                        onUpdate(item.id, 'specs', specInput);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            setIsEditingSpecs(false);
                            onUpdate(item.id, 'specs', specInput);
                        }
                    }}
                    className="w-full text-xs text-slate-600 leading-relaxed bg-white p-2.5 rounded-lg border-2 border-indigo-400 outline-none resize-y min-h-[80px]"
                    placeholder="Enter scope notes..."
                />
            ) : !item.specs && sellPrice > 0 ? (
                <div 
                    onClick={() => setIsEditingSpecs(true)}
                    className="text-xs text-slate-400 italic leading-relaxed bg-slate-50/30 p-2.5 rounded-lg border border-dashed border-slate-300 cursor-pointer hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
                >
                    No description — tap to add scope notes
                </div>
            ) : (
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/50 group-hover:bg-white group-hover:border-indigo-100 transition-colors">
                    {highlightText(item.specs || '', searchQuery)}
                </p>
            )}
            {/* Rationale Display */}
            {item.rationale && (
                <p className="text-[10px] text-indigo-600 mt-2 italic px-1 font-medium">
                    {item.rationale}
                </p>
            )}
            
            <button 
                onClick={handleMagicRationale}
                disabled={isRefining}
                className="absolute bottom-[-10px] right-2 bg-indigo-50 border border-indigo-100 text-indigo-600 p-1.5 rounded-full shadow-sm hover:bg-indigo-600 hover:text-white transition-all opacity-0 group-hover/specs:opacity-100 z-10 scale-90 hover:scale-100"
                title="AI Magic Note"
            >
                <WandIcon className={`w-3 h-3 ${isRefining ? 'animate-spin' : ''}`} />
            </button>
        </div>

        {/* Advanced Settings Panel */}
        {isAdvancedOpen && (
            <div className="mb-5 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Base Rate (₹)</label>
                        <EditableField 
                            value={item.baseRate || item.materials}
                            onChange={(v) => onUpdate(item.id, 'baseRate', Number(v))}
                            onBlur={() => {}}
                            inputType="number"
                            className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 text-slate-700 font-medium"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Selected Rate (₹)</label>
                        <EditableField 
                            value={item.selectedRate || ''}
                            onChange={(v) => onUpdate(item.id, 'selectedRate', Number(v))}
                            onBlur={() => {}}
                            inputType="number"
                            className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 text-slate-700 font-medium"
                            placeholder="Pending"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Assumption Tag</label>
                        <select 
                            value={item.assumptionTag || 'none'}
                            onChange={(e) => onUpdate(item.id, 'assumptionTag', e.target.value === 'none' ? undefined : e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 text-slate-700 font-medium outline-none"
                        >
                            <option value="none">None</option>
                            <option value="client_to_provide">Client to Provide</option>
                            <option value="provisional_sum">Provisional Sum</option>
                            <option value="site_measurement">Site Measurement</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Inclusions (comma separated)</label>
                    <EditableField 
                        value={item.inclusions?.join(', ') || ''}
                        onChange={(v) => handleArrayChange('inclusions', String(v))}
                        onBlur={() => {}}
                        className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 text-slate-700 font-medium block text-left"
                        placeholder="e.g., Hardware, Polish, Installation"
                    />
                </div>
                <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Exclusions (comma separated)</label>
                    <EditableField 
                        value={item.exclusions?.join(', ') || ''}
                        onChange={(v) => handleArrayChange('exclusions', String(v))}
                        onBlur={() => {}}
                        className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 text-slate-700 font-medium block text-left"
                        placeholder="e.g., Civil changes, Electrical wiring"
                    />
                </div>
                
                {isLumpsum && (
                    <div className="pt-2 border-t border-indigo-100/50">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider">Lumpsum Breakdown</label>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleGenerateBreakdown} 
                                    disabled={isGeneratingBreakdown}
                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100/50 px-2 py-0.5 rounded flex items-center gap-1 disabled:opacity-50"
                                >
                                    <WandIcon className={`w-3 h-3 ${isGeneratingBreakdown ? 'animate-spin' : ''}`} />
                                    {isGeneratingBreakdown ? 'Generating...' : 'AI Breakdown'}
                                </button>
                                <button onClick={addBreakdownItem} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100/50 px-2 py-0.5 rounded">
                                    + Add Item
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {(item.lumpsumBreakdown || []).map((breakdown, idx) => (
                                <div key={breakdown.id} className="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200">
                                    <span className="text-[9px] font-bold text-slate-400 w-4 text-center">{idx + 1}.</span>
                                    <input 
                                        type="text" 
                                        value={breakdown.description || ''} 
                                        onChange={e => updateBreakdownItem(breakdown.id, 'description', e.target.value)}
                                        placeholder="Description (e.g., Demolition)"
                                        className="flex-1 text-xs outline-none bg-transparent"
                                    />
                                    <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                                        <span className="text-[10px] text-slate-400">₹</span>
                                        <input 
                                            type="number" 
                                            value={breakdown.estimatedValue || ''} 
                                            onChange={e => updateBreakdownItem(breakdown.id, 'estimatedValue', Number(e.target.value))}
                                            placeholder="Est. Value"
                                            className="w-16 text-xs outline-none bg-transparent text-right"
                                        />
                                    </div>
                                    <button onClick={() => removeBreakdownItem(breakdown.id)} className="text-rose-400 hover:text-rose-600 p-1">
                                        <DeleteIcon className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            {(!item.lumpsumBreakdown || item.lumpsumBreakdown.length === 0) && (
                                <p className="text-[10px] text-slate-500 italic text-center py-2">No breakdown provided. Add items to clarify lumpsum scope.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Financials Grid */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-5 p-2 bg-slate-50/30 rounded-xl border border-slate-100">
            <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Cost</label>
                <p className="font-semibold text-slate-600 mt-0.5">{formatCurrency(item.materials + item.labor)}</p>
            </div>
             <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Markup</label>
                <div className="font-bold text-emerald-600 mt-0.5">
                    <EditableField 
                        value={item.margin.toFixed(1)} 
                        onChange={v => onUpdate(item.id, 'marginOverride', v)} 
                        onBlur={() => {}}
                        inputType="number"
                        suffix="%"
                        className="px-1.5"
                    />
                </div>
            </div>
             <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Sell</label>
                <p className="font-bold text-indigo-900 mt-0.5">{formatCurrency(sellPrice)}</p>
            </div>
        </div>

        {/* Inline Calculator Inputs */}
        <div className="flex items-center gap-1 mb-4 bg-slate-50 border border-slate-100 rounded-lg p-1.5 justify-between">
            <div className="flex items-center gap-1 flex-1">
                <EditableField 
                    value={item.calcLength || ''}
                    onChange={(v) => handleCalcChange('l', Number(v))}
                    onBlur={() => {}}
                    inputType="number"
                    placeholder="L"
                    className="w-full text-center bg-white border border-slate-200 rounded text-xs font-medium text-slate-600"
                />
                <span className="text-[10px] text-slate-300">x</span>
                <EditableField 
                    value={item.calcWidth || ''}
                    onChange={(v) => handleCalcChange('w', Number(v))}
                    onBlur={() => {}}
                    inputType="number"
                    placeholder="W"
                    className="w-full text-center bg-white border border-slate-200 rounded text-xs font-medium text-slate-600"
                />
                <span className="text-[10px] text-slate-300">x</span>
                <EditableField 
                    value={item.calcMultiplier || ''}
                    onChange={(v) => handleCalcChange('m', Number(v))}
                    onBlur={() => {}}
                    inputType="number"
                    placeholder="M"
                    className="w-full text-center bg-white border border-slate-200 rounded text-xs font-medium text-indigo-500"
                />
            </div>
            <div className="text-[10px] font-bold text-slate-400 pl-2 border-l border-slate-200">= Qty</div>
        </div>

        {/* Footer: Quantity & Total */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1.5 gap-2 border border-slate-200">
                    <EditableField 
                        value={item.qty}
                        onChange={v => onUpdate(item.id, 'qty', v)}
                        onBlur={() => {}}
                        inputType="number"
                        className="w-12 font-bold text-sm bg-transparent text-indigo-950"
                    />
                    <span className="text-[10px] font-bold text-slate-400 border-l border-slate-300 pl-2">
                        {item.unit}
                    </span>
                </div>
            </div>
            <div className="text-right">
                <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Total</div>
                <div className="font-black text-xl text-indigo-950 tracking-tight leading-none mt-0.5">{formatCurrency(totalLineItem)}</div>
            </div>
        </div>

    </MotionDiv>
  );
};

export default BoqItemCard;
