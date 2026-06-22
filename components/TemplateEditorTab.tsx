
import React, { useState, useMemo } from 'react';
import { Item } from '../types';
import { TemplateData } from '../lib/standardPackages';
import Card from './shared/Card';
import { ListIcon, PlusIcon, DeleteIcon, CheckIcon, SparklesIcon, TrophyIcon, ShieldCheckIcon } from './Icons';
import { motion, AnimatePresence } from 'framer-motion';

interface TemplateEditorTabProps {
    bank: Item[];
    templates: TemplateData;
    setTemplates: React.Dispatch<React.SetStateAction<TemplateData>>;
}

const TemplateEditorTab: React.FC<TemplateEditorTabProps> = ({ bank, templates, setTemplates }) => {
    const [activeConfig, setActiveConfig] = useState('2-BHK');
    const [activeRoomType, setActiveRoomType] = useState('living');
    const [searchTerm, setSearchTerm] = useState('');

    const configOptions = Object.keys(templates || {});
    const roomTypes = ['living', 'bedroom', 'kitchen', 'bathroom', 'dining', 'general'];

    const bankMap = useMemo(() => new Map(bank.map(i => [i.id, i])), [bank]);

    // Current items in the selected template
    const currentTemplateIds = templates[activeConfig]?.[activeRoomType] || [];
    
    // Filter bank items (exclude already added ones for clarity, or just mark them)
    const filteredBank = useMemo(() => {
        return bank.filter(item => {
            const matchesSearch = (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
                                  (item.cat || '').toLowerCase().includes((searchTerm || '').toLowerCase());
            return matchesSearch;
        });
    }, [bank, searchTerm]);

    const handleAddItem = (itemId: string) => {
        if (currentTemplateIds.includes(itemId)) return;
        
        setTemplates(prev => ({
            ...prev,
            [activeConfig]: {
                ...prev[activeConfig],
                [activeRoomType]: [...(prev[activeConfig][activeRoomType] || []), itemId]
            }
        }));
    };

    const handleRemoveItem = (itemId: string) => {
        setTemplates(prev => ({
            ...prev,
            [activeConfig]: {
                ...prev[activeConfig],
                [activeRoomType]: prev[activeConfig][activeRoomType].filter(id => id !== itemId)
            }
        }));
    };

    const MotionDiv = motion.div as any;

    return (
        <div className="space-y-6 max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col">
            
            {/* Header / Selectors */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <span className="p-1.5 bg-orange-100 text-orange-600 rounded-lg"><ListIcon className="w-5 h-5"/></span>
                        Standard Templates
                    </h2>
                    <p className="text-xs text-slate-500 font-medium ml-9">Configure the <strong>Fully Loaded Master List</strong>. The system automatically creates Base and Mid variants.</p>
                </div>

                <div className="flex gap-4">
                    <div className="bg-slate-100 p-1 rounded-xl flex">
                        {configOptions.map(conf => (
                            <button
                                key={conf}
                                onClick={() => setActiveConfig(conf)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeConfig === conf ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {conf}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6 flex-grow min-h-0">
                
                {/* LEFT: Configuration Pane (8 Columns) */}
                <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 min-h-0 h-full">
                    
                    {/* Room Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2 shrink-0 custom-scrollbar">
                        {roomTypes.map(rt => (
                            <button
                                key={rt}
                                onClick={() => setActiveRoomType(rt)}
                                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${
                                    activeRoomType === rt 
                                        ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                {rt.charAt(0).toUpperCase() + rt.slice(1)} Scope
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow min-h-0">
                        {/* BANK */}
                        <Card title="Item Bank" className="flex flex-col h-full min-h-0 bg-slate-50 border-slate-200">
                            <div className="mb-4">
                                <input 
                                    type="text" 
                                    placeholder="Search items to add..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>
                            
                            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                {filteredBank.map(item => {
                                    const isAdded = currentTemplateIds.includes(item.id);
                                    return (
                                        <div 
                                            key={item.id} 
                                            className={`p-3 bg-white border rounded-xl flex justify-between items-center transition-all ${isAdded ? 'opacity-50 border-slate-100' : 'hover:border-indigo-300 hover:shadow-sm border-slate-200'}`}
                                        >
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                                                <p className="text-[10px] text-slate-500">{item.cat} • {item.unit}</p>
                                            </div>
                                            <button 
                                                onClick={() => handleAddItem(item.id)}
                                                disabled={isAdded}
                                                className={`p-2 rounded-lg transition-colors ${isAdded ? 'text-emerald-500 cursor-default' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'}`}
                                            >
                                                {isAdded ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        {/* SELECTED */}
                        <Card title={`Master Scope: ${activeConfig} > ${activeRoomType}`} className="flex flex-col h-full min-h-0 border-indigo-100 ring-4 ring-indigo-50/50">
                            <div className="mb-4 flex justify-between items-center">
                                <p className="text-xs text-slate-500">
                                    Items here define the "Top Model".
                                </p>
                                <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold">{currentTemplateIds.length} Items</span>
                            </div>

                            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                <AnimatePresence>
                                    {currentTemplateIds.length === 0 && (
                                        <div className="h-full flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded-xl">
                                            No items in this template yet. Add from left.
                                        </div>
                                    )}
                                    {currentTemplateIds.map(id => {
                                        const item = bankMap.get(id);
                                        if (!item) return null; // Should not happen
                                        return (
                                            <MotionDiv 
                                                key={id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                className="p-3 bg-white border border-indigo-100 rounded-xl flex justify-between items-center shadow-sm"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-1.5 h-8 bg-indigo-500 rounded-full"></div>
                                                    <div>
                                                        <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                                                        <p className="text-[10px] text-slate-500">{item.cat}</p>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => handleRemoveItem(id)}
                                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                >
                                                    <DeleteIcon className="w-4 h-4" />
                                                </button>
                                            </MotionDiv>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* RIGHT: Logic Explainer (4 Columns) */}
                <div className="col-span-12 lg:col-span-4 h-full">
                    <Card title="Car Variant Logic" className="h-full bg-slate-900 text-white border-slate-800">
                        <div className="space-y-6">
                            <p className="text-sm text-slate-400">
                                The system generates 3 options by <strong>subtracting features</strong> from your Master List. <br/>
                                <span className="text-xs text-slate-500">*Civil & Loose Furniture are excluded from all options.</span>
                            </p>

                            <div className="space-y-4">
                                {/* Tier 1 */}
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 relative overflow-hidden group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-1.5 bg-emerald-900/50 rounded-lg text-emerald-400 border border-emerald-500/20">
                                            <ShieldCheckIcon className="w-4 h-4" />
                                        </div>
                                        <h4 className="font-bold text-emerald-400 text-sm">1. Essential (Base Model)</h4>
                                    </div>
                                    <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                                        <li><strong>Scope:</strong> Only Basics (Kitchen, Wardrobes, Paint, Elec)</li>
                                        <li><strong>Removed:</strong> False Ceiling, Panelling, TV Units, Shoe Racks</li>
                                        <li><strong>Spec:</strong> Economy (0.8mm Lam)</li>
                                    </ul>
                                </div>

                                {/* Tier 2 */}
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 relative overflow-hidden group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-1.5 bg-blue-900/50 rounded-lg text-blue-400 border border-blue-500/20">
                                            <CheckIcon className="w-4 h-4" />
                                        </div>
                                        <h4 className="font-bold text-blue-400 text-sm">2. Comfort (Mid Model)</h4>
                                    </div>
                                    <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                                        <li><strong>Scope:</strong> Base + Functional Adds (False Ceiling, TV Unit)</li>
                                        <li><strong>Removed:</strong> Panelling, Headboards, Vanities</li>
                                        <li><strong>Spec:</strong> Standard (1mm Lam, Soft Close)</li>
                                    </ul>
                                </div>

                                {/* Tier 3 */}
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 relative overflow-hidden group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-1.5 bg-purple-900/50 rounded-lg text-purple-400 border border-purple-500/20">
                                            <TrophyIcon className="w-4 h-4" />
                                        </div>
                                        <h4 className="font-bold text-purple-400 text-sm">3. Harmony (Top Model)</h4>
                                    </div>
                                    <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                                        <li><strong>Scope:</strong> Full Master List (Everything on Left)</li>
                                        <li><strong>Added:</strong> Panelling, Headboards, Vanities</li>
                                        <li><strong>Spec:</strong> Premium (Acrylic/PU)</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-3 bg-indigo-900/30 border border-indigo-500/30 rounded-lg text-xs text-indigo-200">
                                <SparklesIcon className="w-3 h-3 inline mr-1" />
                                <strong>Tip:</strong> Add ALL joinery items (including luxury ones) to the list on the left. The system will intelligently filter them out for Base/Mid variants.
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default TemplateEditorTab;
