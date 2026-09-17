
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FullBoqItem, Room, BoqItem } from '../types';
import { formatCurrency, calculateSellPrice } from '../lib/utils';
import { DeleteIcon, LinkIcon, WandIcon } from './Icons';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Coins, Tag, ChevronDown, ChevronUp, AlignLeft, Info, Sparkles, AlertCircle, Percent } from 'lucide-react';
import { refineItemSpecs, generateLumpsumBreakdown } from '../services/geminiService';
import { MarginDeviationIndicator } from './MarginDeviationIndicator';

interface BoqItemCardProps {
  item: FullBoqItem;
  rooms: Room[];
  searchQuery?: string;
  onUpdate: (itemId: string, fieldOrUpdates: keyof BoqItem | Partial<BoqItem>, value?: any) => void;
  onDelete: (itemId: string) => void;
  onViewInBank: (bankId: string) => void;
  isSelected?: boolean;
  onSelectToggle?: () => void;
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
    'default': 'bg-sky-50 text-[#334486]'
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
                className={`bg-white border border-sky-400 rounded-md outline-none ring-2 ring-sky-100 text-center shadow-sm ${className}`}
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

const BoqItemCard: React.FC<BoqItemCardProps> = ({ item, rooms, searchQuery, onUpdate, onDelete, onViewInBank, isSelected = false, onSelectToggle }) => {
  const [isRefining, setIsRefining] = useState(false);
  const [isGeneratingBreakdown, setIsGeneratingBreakdown] = useState(false);
  
  const sellPrice = useMemo(() => calculateSellPrice(item.materials, item.labor, item.margin), [item.materials, item.labor, item.margin]);
  const totalLineItem = sellPrice * item.qty;
  const categoryStyle = getCategoryStyle(item.cat);

  const getDefaultMultiplier = (itemName?: string, itemCat?: string) => {
    const name = (itemName || '').toLowerCase();
    const cat = (itemCat || '').toLowerCase();
    if (cat.includes('paint') && !name.includes('ceiling')) return 3.5; // Wall Paint
    if (cat.includes('paint') && name.includes('ceiling')) return 1.0; // Ceiling Paint
    if (name.includes('false ceiling')) return 1.25; // Cove/Drop factor
    if (name.includes('flooring') || name.includes('tile')) return 1.1; // Wastage/Skirting
    return 1;
  };

  const defaultMultiplier = useMemo(() => getDefaultMultiplier(item.name, item.cat), [item.name, item.cat]);

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);


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
      const m = field === 'm' ? val : item.calcMultiplier || defaultMultiplier;
      
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
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
        className={`bg-white rounded-md border transition-all duration-200 hover:shadow-md ${isSelected ? 'ring-2 ring-[#3D52A0] border-transparent shadow-sm' : 'border-slate-300 hover:border-slate-400'} flex flex-col overflow-hidden relative group`}
    >
        {/* Hover Actions */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-1.5 z-10">
             <MotionButton whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className={`p-1.5 rounded-md shadow-sm border transition-colors flex items-center justify-center ${isAdvancedOpen ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-[#3D52A0]'}`} title="Advanced Settings">
                {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </MotionButton>
             <MotionButton whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => onViewInBank(item.bankId)} className="p-1.5 bg-white text-slate-400 rounded-md shadow-sm border border-slate-200 hover:border-slate-300 hover:text-[#3D52A0]" title="View in Bank">
                <LinkIcon className="w-3.5 h-3.5" />
            </MotionButton>
            <MotionButton whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => onDelete(item.id)} className="p-1.5 bg-white text-rose-400 rounded-md shadow-sm border border-slate-200 hover:border-rose-200 hover:text-rose-500 hover:bg-rose-50" title="Remove Item">
                <DeleteIcon className="w-3.5 h-3.5" />
            </MotionButton>
        </div>

        <div className="p-4 flex-1">
            {/* Header Area */}
            <div className="flex gap-3 items-start mb-3">
                {onSelectToggle && (
                    <div className="pt-1.5" onClick={(e) => e.stopPropagation()}>
                        <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onSelectToggle()}
                            className="w-4 h-4 rounded text-[#3D52A0] focus:ring-[#3D52A0] border-slate-300 cursor-pointer shadow-sm transition-all"
                        />
                    </div>
                )}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-sm ${categoryStyle} bg-opacity-20 shrink-0`}>
                    {getCategoryEmoji(item.cat)}
                </div>
                <div className="flex-1 pr-24">
                    <h3 className="text-[13px] font-bold text-slate-800 leading-tight mb-2 tracking-tight">
                        {highlightText(item.name, searchQuery)}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-sm text-[9px] uppercase font-bold tracking-wide ${categoryStyle} bg-opacity-20 border border-transparent`}>
                            {highlightText(item.cat, searchQuery)}
                        </span>
                        
                        {/* BOQ Status Badge */}
                        <div className="relative inline-block">
                            <select 
                                value={item.boqStatus || 'included_ffds_scope'}
                                onChange={(e) => onUpdate(item.id, 'boqStatus', e.target.value)}
                                className={`appearance-none border text-[9px] font-bold uppercase tracking-wide cursor-pointer transition-colors max-w-[150px] px-2.5 py-0.5 pr-6 rounded-sm outline-none focus:ring-1 focus:ring-[#3D52A0] ${
                                    item.boqStatus === 'excluded' || item.boqStatus === 'deleted' ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' :
                                    item.boqStatus === 'client_procured' ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' :
                                    item.boqStatus === 'approved_variation' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' :
                                    item.boqStatus === 'pending_finalisation' || item.boqStatus === 'on_hold' ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100' :
                                    'bg-[#3D52A0]/5 text-[#3D52A0] border-[#3D52A0]/20 hover:bg-[#3D52A0]/10'
                                }`}
                                onClick={(e) => e.stopPropagation()}
                                title="BOQ Status"
                            >
                                <option value="included_ffds_scope">FFDS Scope</option>
                                <option value="pending_finalisation">Pending Fin.</option>
                                <option value="client_procured">Client Procured</option>
                                <option value="as_actuals">As Actuals</option>
                                <option value="provisional_sum">Provisional Sum</option>
                                <option value="approved_variation">Approved Var.</option>
                                <option value="on_hold">On Hold</option>
                                <option value="substituted">Substituted</option>
                                <option value="excluded">Excluded</option>
                                <option value="deleted">Deleted</option>
                            </select>
                            <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 ${
                                item.boqStatus === 'excluded' || item.boqStatus === 'deleted' ? 'text-rose-400' :
                                item.boqStatus === 'client_procured' ? 'text-amber-400' :
                                item.boqStatus === 'approved_variation' ? 'text-emerald-400' :
                                item.boqStatus === 'pending_finalisation' || item.boqStatus === 'on_hold' ? 'text-orange-400' :
                                'text-[#3D52A0]/60'
                            }`}>
                                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                        <div className="relative inline-block">
                            <select 
                                value={item.roomId || 'Unassigned'} 
                                onChange={(e) => onUpdate(item.id, 'roomId', e.target.value === 'Unassigned' ? undefined : e.target.value)}
                                className="appearance-none bg-slate-100 hover:bg-slate-200 border border-transparent text-slate-600 focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0] outline-none rounded-sm px-2.5 py-0.5 pr-6 text-[9px] font-bold uppercase tracking-wide cursor-pointer transition-colors max-w-[140px]"
                                onClick={(e) => e.stopPropagation()}
                                title="Assign to Room"
                            >
                                <option value="Unassigned">Unassigned</option>
                                {rooms.map(r => (
                                    <option key={r.name} value={r.name}>{r.name}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-sm text-[9px] uppercase font-bold tracking-wide bg-slate-100 text-slate-500">
                            {isLumpsum ? 'Lumpsum' : 'Itemized'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Specs Area */}
            <div className="relative group/specs mb-3">
                <textarea
                    value={item.specs}
                    onChange={(e) => onUpdate(item.id, 'specs', e.target.value)}
                    placeholder="Enter item specifications..."
                    className="w-full text-[11px] text-slate-600 leading-relaxed bg-transparent hover:bg-slate-50 focus:bg-white p-2 rounded border border-transparent hover:border-slate-200 focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0] outline-none resize-y min-h-[48px] transition-all"
                />
                {item.rationale && (
                    <p className="text-[10px] text-[#3D52A0] mt-1 italic px-2 font-medium bg-sky-50/50 py-1 rounded">
                        {item.rationale}
                    </p>
                )}
                
                {/* AI Refine Button */}
                <button 
                    onClick={handleMagicRationale}
                    disabled={isRefining}
                    className="absolute bottom-1 right-2 bg-white border border-slate-200 text-[#3D52A0] p-1.5 rounded shadow-sm hover:border-[#3D52A0] hover:bg-sky-50 transition-all opacity-0 group-hover/specs:opacity-100 z-10"
                    title="AI Enhance Specs"
                >
                    <WandIcon className={`w-3 h-3 ${isRefining ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Advanced Settings */}
            <AnimatePresence>
            {isAdvancedOpen && (
                <MotionDiv 
                    initial={{height: 0, opacity: 0, marginTop: 0}} 
                    animate={{height: 'auto', opacity: 1, marginTop: 16}} 
                    exit={{height: 0, opacity: 0, marginTop: 0}} 
                    transition={{duration: 0.2}} 
                    className="overflow-hidden"
                >
                <div className="mb-2 p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-4 shadow-sm relative">
                    <div className="grid grid-cols-4 gap-3">
                        {/* Type */}
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Type</label>
                            <EditableField 
                                value={item.type}
                                onChange={v => onUpdate(item.id, 'type', v)}
                                onBlur={() => {}}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
                            />
                        </div>
                        {/* Cost */}
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Cost (₹)</label>
                            <div className="flex gap-1">
                                <EditableField 
                                    value={item.materials}
                                    onChange={v => onUpdate(item.id, 'materials', v)}
                                    onBlur={() => {}}
                                    inputType="number"
                                    className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium text-center"
                                    placeholder="Mat"
                                />
                                <EditableField 
                                    value={item.labor}
                                    onChange={v => onUpdate(item.id, 'labor', v)}
                                    onBlur={() => {}}
                                    inputType="number"
                                    className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium text-center"
                                    placeholder="Lab"
                                />
                            </div>
                        </div>
                        {/* Selected Rate */}
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Selected Rate (₹)</label>
                            <EditableField 
                                value={item.selectedRate}
                                onChange={v => onUpdate(item.id, 'selectedRate', v)}
                                onBlur={() => {}}
                                inputType="number"
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
                            />
                        </div>
                        {/* Assumption Tag */}
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Assumption Tag</label>
                            <select 
                                value={item.assumptionTag || 'none'}
                                onChange={e => onUpdate(item.id, 'assumptionTag', e.target.value === 'none' ? undefined : e.target.value)}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium outline-none focus:border-[#3D52A0]"
                            >
                                <option value="none">None</option>
                                <option value="client_to_provide">Client to Provide</option>
                                <option value="provisional_sum">Provisional Sum</option>
                                <option value="site_measurement">Site Measurement</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Inclusions</label>
                            <EditableField 
                                value={item.inclusions?.join(', ') || ''}
                                onChange={(v) => handleArrayChange('inclusions', String(v))}
                                onBlur={() => {}}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium block text-left"
                                placeholder="e.g., Hardware, Polish"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Exclusions</label>
                            <EditableField 
                                value={item.exclusions?.join(', ') || ''}
                                onChange={(v) => handleArrayChange('exclusions', String(v))}
                                onBlur={() => {}}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium block text-left"
                                placeholder="e.g., Civil changes"
                            />
                        </div>
                    </div>
                    {/* Dimensions Calculator */}
                    <div className="p-2.5 bg-white rounded-md border border-slate-200 shadow-sm mt-3">
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                                <span className="text-[11px] bg-slate-100 p-0.5 rounded">📐</span> Auto-Calculate Quantity
                            </label>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                L × W × Mult = <span className="text-[#3D52A0]">Qty</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 mb-1 block uppercase tracking-wider">Length (L)</label>
                                <input 
                                    type="number"
                                    value={item.calcLength || ''}
                                    onChange={e => handleCalcChange('l', Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-sm px-2 py-1.5 text-slate-700 font-medium outline-none focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0] transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 mb-1 block uppercase tracking-wider">Width (W)</label>
                                <input 
                                    type="number"
                                    value={item.calcWidth || ''}
                                    onChange={e => handleCalcChange('w', Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-sm px-2 py-1.5 text-slate-700 font-medium outline-none focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0] transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 mb-1 block uppercase tracking-wider" title="Wastage or Area Multiplier">Multiplier (M)</label>
                                <input 
                                    type="number"
                                    value={item.calcMultiplier || 1}
                                    onChange={e => handleCalcChange('m', Number(e.target.value))}
                                    step="0.1"
                                    className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-sm px-2 py-1.5 text-slate-700 font-medium outline-none focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0] transition-all"
                                />
                            </div>
                        </div>
                    </div>
                    {/* Lumpsum Breakdown */}
                    {isLumpsum && (
                        <div className="pt-2 border-t border-slate-200">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[9px] font-bold text-[#3D52A0] uppercase tracking-wider">Lumpsum Breakdown</label>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={handleGenerateBreakdown} 
                                        disabled={isGeneratingBreakdown}
                                        className="text-[10px] font-bold text-[#3D52A0] hover:text-[#334486] bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                                    >
                                        <WandIcon className={`w-3 h-3 ${isGeneratingBreakdown ? 'animate-spin' : ''}`} />
                                        AI Breakdown
                                    </button>
                                    <button onClick={addBreakdownItem} className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-2 py-1 rounded transition-colors">
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
                                            placeholder="Description"
                                            className="flex-1 text-[11px] outline-none bg-transparent font-medium text-slate-700"
                                        />
                                        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                                            <span className="text-[10px] text-slate-400">₹</span>
                                            <input 
                                                type="number" 
                                                value={breakdown.estimatedValue || ''} 
                                                onChange={e => updateBreakdownItem(breakdown.id, 'estimatedValue', Number(e.target.value))}
                                                placeholder="Value"
                                                className="w-16 text-[11px] outline-none bg-transparent text-right font-bold text-slate-700"
                                            />
                                        </div>
                                        <button onClick={() => removeBreakdownItem(breakdown.id)} className="text-rose-400 hover:text-rose-600 p-1">
                                            <DeleteIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {(!item.lumpsumBreakdown || item.lumpsumBreakdown.length === 0) && (
                                    <p className="text-[10px] text-slate-400 italic text-center py-2 bg-white rounded border border-slate-100">No breakdown provided.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                </MotionDiv>
            )}
            </AnimatePresence>
        </div>

        {/* Premium Financials Footer */}
        <div className="bg-gradient-to-r from-slate-50 to-white border-t border-slate-100 p-3 px-4 flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
            
            {/* Visual Profit Progress Bar Background (Subtle) */}
            <div className="absolute bottom-0 left-0 h-0.5 bg-slate-100 w-full">
                <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${Math.min(100, Math.max(0, (sellPrice - (item.materials + item.labor)) / sellPrice * 100))}%` }} 
                    className="h-full bg-emerald-400"
                    transition={{ duration: 1, ease: "easeOut" }}
                />
            </div>

            {/* Rates Area */}
            <div className="flex items-center gap-5 relative z-10">
                <div className="group/cost cursor-help">
                     <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                        <Coins className="w-2.5 h-2.5" /> Base Cost
                     </div>
                     <div className="font-semibold text-slate-600 text-xs transition-colors group-hover/cost:text-slate-900">{formatCurrency(item.materials + item.labor)}</div>
                </div>
                <div className="w-px h-6 bg-slate-200"></div>
                <div className="group/margin">
                     <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                        <TrendingUp className="w-2.5 h-2.5 text-emerald-500" /> Margin
                     </div>
                     <div className="flex items-center gap-1.5 font-bold text-emerald-600 text-xs">
                        <EditableField 
                            value={item.margin.toFixed(1)} 
                            onChange={v => onUpdate(item.id, 'marginOverride', v)} 
                            onBlur={() => {}}
                            inputType="number"
                            className="w-12 text-center bg-white border border-emerald-200 hover:border-emerald-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded py-0.5 shadow-sm transition-all"
                        />
                        <span className="text-[10px] text-emerald-500/70">%</span>
                     </div>
                </div>
                <div className="w-px h-6 bg-slate-200"></div>
                <div className="group/sell">
                     <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                        <Tag className="w-2.5 h-2.5" /> Sell Rate
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-800 text-xs group-hover/sell:text-[#3D52A0] transition-colors">{formatCurrency(sellPrice)}</div>
                        {/* Profit Tag */}
                        <div className="hidden sm:flex items-center gap-0.5 text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold border border-emerald-100" title="Profit per item">
                            +{formatCurrency(sellPrice - (item.materials + item.labor))}
                        </div>
                     </div>
                </div>
            </div>

            {/* Total Area */}
            <div className="flex items-center gap-4 bg-white py-1.5 px-3 rounded-lg border border-slate-200 shadow-sm relative z-10 transition-transform hover:scale-[1.02] hover:shadow-md duration-200">
                <div className="flex items-center gap-2 pr-3 border-r border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qty</span>
                    <div className="flex items-center gap-1">
                        <EditableField 
                            value={item.qty}
                            onChange={v => onUpdate(item.id, 'qty', v)}
                            onBlur={() => {}}
                            inputType="number"
                            className="w-12 font-bold text-sm bg-sky-50/50 border border-transparent hover:border-sky-200 focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0] focus:bg-white rounded text-center text-[#3D52A0] py-0.5 transition-all shadow-inner"
                        />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.unit}</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-0.5">Total Value</div>
                    <motion.div 
                        key={totalLineItem}
                        initial={{ scale: 1.1, color: '#3D52A0' }}
                        animate={{ scale: 1, color: '#0f172a' }}
                        transition={{ duration: 0.3 }}
                        className="font-black text-lg text-slate-900 tracking-tight leading-none"
                    >
                        {formatCurrency(totalLineItem)}
                    </motion.div>
                </div>
            </div>
        </div>
    </MotionDiv>
  );
}
export default BoqItemCard;
