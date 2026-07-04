
import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloseIcon, UploadIcon, CheckIcon, ArrowRightIcon, PlusIcon, FileSpreadsheetIcon, GridIcon, SparklesIcon } from './Icons';
import { Item, ProposalTier } from '../types';
import { id as generateId, formatCurrency } from '../lib/utils';

interface ExcelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (newTier: ProposalTier, newBankItems: Item[]) => void;
    bank: Item[]; 
    projectId: string; 
}

const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose, onImport, bank, projectId }) => {
    // STEPS: upload -> sheet_select -> mapping -> review
    const [step, setStep] = useState<'upload' | 'sheet_select' | 'mapping' | 'review'>('upload');
    
    // Excel Data State
    const [workbook, setWorkbook] = useState<any>(null);
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [selectedSheetName, setSelectedSheetName] = useState('');
    
    // Parsed Content State
    const [rawRows, setRawRows] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [previewRow, setPreviewRow] = useState<any[]>([]); // To show sample data
    
    const [fileInputKey, setFileInputKey] = useState(Date.now()); 
    const [mergedCount, setMergedCount] = useState(0);
    
    // Mapping State
    const [map, setMap] = useState({
        name: '',
        category: '',
        qty: '',
        rate: '', // Client Rate (Sell Price)
        unit: '',
        specs: '', // Description/Specs
        room: '' // Room/Location
    });

    // Processed Data
    const [processedItems, setProcessedItems] = useState<{
        tempId: string;
        name: string;
        category: string;
        qty: number;
        rate: number;
        unit: string;
        specs: string;
        room: string;
        status: 'match' | 'new';
        matchedBankId?: string;
        baseCost?: number; 
    }[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const data = evt.target?.result;
            if (!data) return;

            try {
                const XLSX = await import('xlsx');
                const wb = XLSX.read(data, { type: 'array' });
                setWorkbook(wb);
                setSheetNames(wb.SheetNames);
                
                if (wb.SheetNames.length > 1) {
                    setStep('sheet_select');
                } else {
                    // Auto-select first if only one
                    selectSheet(wb, wb.SheetNames[0]);
                }
            } catch (error) {
                console.error("Excel parse error:", error);
                alert("Failed to parse Excel file. Ensure it is a valid .xlsx or .xls file.");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const selectSheet = async (wb: any, name: string) => {
        setSelectedSheetName(name);
        const ws = wb.Sheets[name];
        const XLSX = await import('xlsx');
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }); // Array of Arrays

        if (jsonData.length > 0) {
            // Basic Header Detection: Look for first row with multiple strings
            // For now, assume Row 0 is header
            const headerRow = jsonData[0] as string[];
            const dataRows = jsonData.slice(1);
            
            setHeaders(headerRow);
            setRawRows(dataRows);
            setPreviewRow(dataRows[0] || []); // Store first data row for preview

            // Smart Auto-Mapping
            const h = headerRow.map(s => String(s || '').toLowerCase());
            const newMap = { ...map };
            
            // Helper to find index based on keywords
            const findCol = (keywords: string[]) => {
                const idx = h.findIndex(s => keywords.some(k => s.includes(k)));
                return idx !== -1 ? headerRow[idx] : '';
            };

            newMap.name = findCol(['item', 'description', 'particular', 'desc', 'scope']);
            newMap.category = findCol(['cat', 'group', 'trade']);
            newMap.qty = findCol(['qty', 'quan', 'nos']);
            newMap.rate = findCol(['rate', 'price', 'amount', 'cost']);
            newMap.unit = findCol(['unit', 'uom']);
            newMap.specs = findCol(['spec', 'detail', 'remark', 'technical']);
            newMap.room = findCol(['room', 'loc', 'area', 'space', 'zone']);

            setMap(newMap);
            setStep('mapping');
        } else {
            alert("This sheet appears to be empty.");
        }
    };

    const handleProcess = () => {
        if (!map.name || !map.qty || !map.rate) {
            alert("Please map at least Name, Qty and Rate columns.");
            return;
        }

        const nameIdx = headers.indexOf(map.name);
        const catIdx = headers.indexOf(map.category);
        const qtyIdx = headers.indexOf(map.qty);
        const rateIdx = headers.indexOf(map.rate);
        const unitIdx = headers.indexOf(map.unit);
        const specsIdx = headers.indexOf(map.specs);
        const roomIdx = headers.indexOf(map.room);

        // 1. Initial Extraction
        const rawExtracted = rawRows.map(row => {
            const name = row[nameIdx];
            
            // Helper to clean numbers (remove '₹', ',', 'approx')
            const parseNum = (val: any) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                const clean = String(val).replace(/[^0-9.-]+/g,"");
                return parseFloat(clean) || 0;
            };

            const qty = parseNum(row[qtyIdx]);
            const rate = parseNum(row[rateIdx]);
            const category = catIdx > -1 ? row[catIdx] : 'Imported';
            const unit = unitIdx > -1 ? row[unitIdx] : 'nos';
            const specs = specsIdx > -1 ? row[specsIdx] : '';
            const room = roomIdx > -1 ? row[roomIdx] : 'General';

            // Strict Validation: Skip rows without valid Name or Rate
            if (!name || name === 'Unknown Item' || !rate) return null;

            return {
                name: String(name).trim(),
                category: String(category || 'Imported'),
                qty,
                rate,
                unit: String(unit || 'nos'),
                specs: String(specs || ''),
                room: String(room || 'General')
            };
        }).filter(Boolean) as any[];

        // 2. Intelligent Deduplication
        const uniqueItemsMap = new Map<string, any>();
        let dupesFound = 0;

        rawExtracted.forEach(item => {
            // Key: Name + Rate + Room (Separate items per room generally safer for import)
            const key = `${item.name.toLowerCase()}_${item.rate}_${item.room.toLowerCase()}`;
            
            if (uniqueItemsMap.has(key)) {
                const existing = uniqueItemsMap.get(key);
                existing.qty += item.qty; // Sum quantity
                dupesFound++;
            } else {
                uniqueItemsMap.set(key, item);
            }
        });

        const uniqueItems = Array.from(uniqueItemsMap.values());
        setMergedCount(dupesFound);

        // 3. Match against Bank & Final Structure
        const finalResults = uniqueItems.map(item => {
            // Check Bank for Match
            const exactMatch = bank.find(i => (i.name || '').toLowerCase() === item.name.toLowerCase());
            
            let status: 'match' | 'new' = 'new';
            let matchedBankId = undefined;
            let baseCost = 0;

            if (exactMatch) {
                status = 'match';
                matchedBankId = exactMatch.id;
                baseCost = exactMatch.materials + exactMatch.labor;
            } else {
                status = 'new';
                // Reverse Calculate Cost (Assumed 20% Margin)
                // Sell = Cost / 0.8  => Cost = Sell * 0.8
                baseCost = item.rate * 0.8; 
            }

            return {
                tempId: generateId(),
                ...item,
                status,
                matchedBankId,
                baseCost
            };
        });

        setProcessedItems(finalResults);
        setStep('review');
    };

    const handleFinalImport = () => {
        const newBankItems: Item[] = [];
        const newBoqItems: any[] = []; 
        let totalSell = 0;
        let totalCost = 0;

        processedItems.forEach(p => {
            let bankId = p.matchedBankId;

            if (p.status === 'new') {
                // Create New Bank Item
                const newItem: Item = {
                    id: generateId(), 
                    name: p.name,
                    cat: p.category,
                    specs: p.specs || 'Imported via Excel',
                    unit: p.unit,
                    // Split base cost 65/35
                    materials: Math.round(p.baseCost! * 0.65),
                    labor: Math.round(p.baseCost! * 0.35),
                    margin: 20 // Default base margin
                };
                newBankItems.push(newItem);
                bankId = newItem.id;
            }

            // Create BOQ Item
            // Ensure Sell Price matches Excel Rate using override
            const refItem = p.status === 'new' ? newBankItems.find(i => i.id === bankId)! : bank.find(i => i.id === bankId)!;
            const cost = refItem.materials + refItem.labor;
            
            let marginOverride = 20; 
            if (p.rate > 0 && cost > 0) {
                // Gross Margin formula: (Sell - Cost) / Sell
                // margin = (1 - Cost/Sell) * 100
                marginOverride = (1 - (cost / p.rate)) * 100;
            }

            totalSell += p.rate * p.qty;
            totalCost += cost * p.qty;

            // Construct Rationale
            // If it's a match, preserve the Excel specs in rationale so specific details aren't lost
            const rationale = p.status === 'match' && p.specs && p.specs !== refItem.specs 
                ? `Imported: ${p.specs}` 
                : 'Imported';

            newBoqItems.push({
                id: generateId(),
                bankId: bankId!,
                qty: p.qty,
                // Use higher precision to ensure the Sell Price is recalculated exactly close to imported Rate
                marginOverride: parseFloat(marginOverride.toFixed(4)),
                roomId: p.room, 
                rationale: rationale
            });
        });

        const totalGm = totalSell > 0 ? ((totalSell - totalCost) / totalSell) * 100 : 0;

        const newTier: ProposalTier = {
            id: generateId(),
            name: `${selectedSheetName} (${new Date().toLocaleDateString()})`,
            timestamp: Date.now(),
            boq: newBoqItems,
            projectContext: {} as any, // Merged in parent
            summary: {
                totalSell, 
                totalCost, 
                totalGm, 
                itemCount: newBoqItems.length, 
                totalRevenue: totalSell, // Design fee added later in main flow
                designFee: 0, 
                blendedGm: 0
            }
        };

        onImport(newTier, newBankItems);
        handleClose();
    };

    const handleClose = () => {
        setStep('upload');
        setWorkbook(null);
        setSheetNames([]);
        setRawRows([]);
        setProcessedItems([]);
        setMergedCount(0);
        setFileInputKey(Date.now());
        onClose();
    };

    const MappingField = ({ label, fieldKey, required = false }: { label: string, fieldKey: 'name' | 'qty' | 'rate' | 'category' | 'unit' | 'specs' | 'room', required?: boolean }) => {
        const value = map[fieldKey];
        const isMapped = !!value;
        // Find a preview value based on current selection
        const colIndex = headers.indexOf(value);
        const sampleValue = colIndex !== -1 ? previewRow[colIndex] : null;

        return (
            <div className={`p-3 rounded-xl border transition-all ${isMapped ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
                <div className="flex justify-between items-center mb-2">
                    <label className={`text-xs font-bold uppercase tracking-wider ${isMapped ? 'text-indigo-700' : 'text-slate-500'}`}>
                        {label} {required && <span className="text-red-500">*</span>}
                    </label>
                    {isMapped && <CheckIcon className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
                
                <select 
                    value={value} 
                    onChange={e => setMap({...map, [fieldKey]: e.target.value})} 
                    className={`w-full p-2 rounded-lg text-sm outline-none border focus:ring-2 focus:ring-indigo-200 ${isMapped ? 'bg-white border-indigo-100 font-medium text-indigo-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                >
                    <option value="">Select Column...</option>
                    {headers.map((h, i) => {
                        const sample = previewRow[i] ? `(e.g. ${String(previewRow[i]).substring(0, 15)}...)` : '';
                        return (
                            <option key={h} value={h}>
                                {h} {sample}
                            </option>
                        );
                    })}
                </select>
                
                {isMapped && sampleValue && (
                    <div className="mt-2 text-[10px] text-indigo-500 font-medium truncate">
                        Preview: <span className="text-indigo-800">{sampleValue}</span>
                    </div>
                )}
            </div>
        );
    };

    const MotionDiv = motion.div as any;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-indigo-950/60 backdrop-blur-sm">
                <MotionDiv 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[95vh] md:max-h-[90vh] overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-3 md:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                                <FileSpreadsheetIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-indigo-900 leading-none">Import External BOQ</h3>
                                <div className="flex items-center gap-2 mt-1.5">
                                    {['Upload', 'Select Sheet', 'Map Columns', 'Review'].map((s, i) => {
                                        const steps = ['upload', 'sheet_select', 'mapping', 'review'];
                                        const currentIdx = steps.indexOf(step);
                                        const isActive = i === currentIdx;
                                        const isPast = i < currentIdx;
                                        
                                        return (
                                            <div key={s} className="flex items-center gap-2">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-indigo-600' : isPast ? 'text-emerald-600' : 'text-slate-300'}`}>
                                                    {s}
                                                </span>
                                                {i < 3 && <span className="text-slate-200 text-[10px]">/</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <button onClick={handleClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                            <CloseIcon className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-[#F8FAFC]">
                        
                        {/* STEP 1: UPLOAD */}
                        {step === 'upload' && (
                            <div className="flex flex-col items-center justify-center h-full min-h-[300px] border-2 border-dashed border-slate-300 rounded-3xl bg-white hover:bg-slate-50 transition-all cursor-pointer relative group">
                                <input 
                                    key={fileInputKey}
                                    type="file" 
                                    accept=".xlsx, .xls, .csv" 
                                    onChange={handleFileUpload} 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className="p-6 bg-indigo-50 rounded-full mb-6 group-hover:scale-110 transition-transform">
                                    <UploadIcon className="w-10 h-10 text-indigo-500" />
                                </div>
                                <h4 className="text-xl font-bold text-indigo-900 mb-2">Drop your Excel file here</h4>
                                <p className="text-sm text-slate-500">Supports .xlsx, .xls, .csv</p>
                            </div>
                        )}

                        {/* STEP 2: SHEET SELECTION */}
                        {step === 'sheet_select' && workbook && (
                            <div className="max-w-2xl mx-auto">
                                <h4 className="text-lg font-bold text-indigo-900 mb-6 text-center">Select a Sheet to Import</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {sheetNames.map(name => (
                                        <button
                                            key={name}
                                            onClick={() => selectSheet(workbook, name)}
                                            className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all text-left flex items-center justify-between group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center text-green-700">
                                                    <GridIcon className="w-4 h-4" />
                                                </div>
                                                <span className="font-bold text-slate-700 group-hover:text-indigo-700">{name}</span>
                                            </div>
                                            <ArrowRightIcon className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* STEP 3: MAPPING */}
                        {step === 'mapping' && (
                            <div className="max-w-4xl mx-auto">
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 flex items-start gap-3">
                                    <SparklesIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                                    <div>
                                        <h5 className="font-bold text-blue-800 text-sm">Smart Auto-Map Active</h5>
                                        <p className="text-xs text-blue-600 mt-1">We've tried to match your columns automatically. Please verify the mappings below.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Left: Critical Fields */}
                                    <div className="space-y-4">
                                        <h5 className="text-sm font-bold text-indigo-950 border-b border-slate-200 pb-2 mb-4">Required Fields</h5>
                                        <MappingField label="Item Description" fieldKey="name" required />
                                        <MappingField label="Quantity" fieldKey="qty" required />
                                        <MappingField label="Client Rate (Price)" fieldKey="rate" required />
                                    </div>

                                    {/* Right: Optional Fields */}
                                    <div className="space-y-4">
                                        <h5 className="text-sm font-bold text-indigo-950 border-b border-slate-200 pb-2 mb-4">Optional Details</h5>
                                        <MappingField label="Room / Location" fieldKey="room" />
                                        <MappingField label="Category / Group" fieldKey="category" />
                                        <MappingField label="Unit (e.g. sqft)" fieldKey="unit" />
                                        <MappingField label="Specifications / Notes" fieldKey="specs" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 4: REVIEW */}
                        {step === 'review' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div>
                                        <h4 className="font-bold text-indigo-900">Review Data</h4>
                                        <div className="flex gap-2 text-xs text-slate-500 mt-1">
                                            <p>Found {processedItems.length} unique items.</p>
                                            {mergedCount > 0 && (
                                                <span className="text-amber-600 font-bold flex items-center gap-1 bg-amber-50 px-2 rounded-full border border-amber-100">
                                                    <SparklesIcon className="w-3 h-3" /> Merged {mergedCount} duplicates
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">
                                            {(processedItems || []).filter(p => p.status === 'match').length} Matched in Bank
                                        </div>
                                        <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">
                                            {(processedItems || []).filter(p => p.status === 'new').length} New Items
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="max-h-[400px] overflow-y-auto">
                                        <table className="w-full text-xs text-left bg-white">
                                            <thead className="bg-slate-50 font-bold text-slate-500 sticky top-0 shadow-sm z-10">
                                                <tr>
                                                    <th className="p-3 pl-6 border-b">Status</th>
                                                    <th className="p-3 border-b">Room</th>
                                                    <th className="p-3 border-b">Item Name</th>
                                                    <th className="p-3 border-b text-right">Qty</th>
                                                    <th className="p-3 border-b text-right">Rate</th>
                                                    <th className="p-3 border-b text-right pr-6">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {processedItems.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                        <td className="p-3 pl-6">
                                                            {item.status === 'match' ? (
                                                                <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Matched</span>
                                                            ) : (
                                                                <span className="text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded">New</span>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-slate-600">{item.room}</td>
                                                        <td className="p-3 font-medium text-indigo-900">
                                                            {item.name}
                                                            <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{item.specs}</div>
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-slate-600">{item.qty}</td>
                                                        <td className="p-3 text-right font-mono text-slate-600">{formatCurrency(item.rate)}</td>
                                                        <td className="p-3 text-right font-bold text-indigo-950 pr-6">{formatCurrency(item.rate * item.qty)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <div className="p-4 bg-slate-100 rounded-xl text-xs text-slate-600 flex gap-2 items-start">
                                    <span className="text-lg">💡</span>
                                    <p>New items will be added to your <strong>Item Bank</strong> automatically. We reverse-calculate the base cost assuming a 20% margin to maintain data consistency.</p>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-slate-200 bg-white flex justify-between items-center">
                        <div>
                            {step === 'sheet_select' && (
                                <button onClick={() => setStep('upload')} className="text-slate-500 font-bold text-xs hover:text-indigo-900">
                                    ← Change File
                                </button>
                            )}
                            {step === 'mapping' && (
                                <button onClick={() => setStep('sheet_select')} className="text-slate-500 font-bold text-xs hover:text-indigo-900">
                                    ← Change Sheet
                                </button>
                            )}
                            {step === 'review' && (
                                <button onClick={() => setStep('mapping')} className="text-slate-500 font-bold text-xs hover:text-indigo-900">
                                    ← Edit Mapping
                                </button>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button onClick={handleClose} className="px-5 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded-xl transition-colors">
                                Cancel
                            </button>
                            
                            {step === 'mapping' && (
                                <button 
                                    onClick={handleProcess} 
                                    className="px-8 py-2.5 bg-indigo-950 text-white font-bold text-sm rounded-xl hover:bg-indigo-950 shadow-lg flex items-center gap-2 transition-all"
                                >
                                    Verify Data <ArrowRightIcon className="w-4 h-4" />
                                </button>
                            )}

                            {step === 'review' && (
                                <button 
                                    onClick={handleFinalImport} 
                                    className="px-8 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                    Import {processedItems.length} Items
                                </button>
                            )}
                        </div>
                    </div>
                </MotionDiv>
            </div>
        </AnimatePresence>
    );
};

export default ExcelImportModal;
