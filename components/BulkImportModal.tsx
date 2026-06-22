import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BoqItem } from '../types';
import { id as generateId } from '../lib/utils';
import { X } from 'lucide-react';

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (items: any[]) => void;
    frozen?: boolean;
    rooms: {name: string}[];
    isOwner?: boolean;
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose, onImport, frozen, rooms, isOwner }) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<any[]>([]);
    const [validItems, setValidItems] = useState<any[]>([]);

    const MAPPABLE_FIELDS = [
        { key: 'name', label: 'Item Name/Description', required: true },
        { key: 'category', label: 'Category', required: true },
        { key: 'room', label: 'Room', required: true },
        { key: 'unit', label: 'Unit', required: true },
        { key: 'qty', label: 'Quantity', required: true },
        ...(isOwner ? [{ key: 'unitCost', label: 'Unit Cost', required: false }] : []),
        { key: 'notes', label: 'Commercial Note', required: false }
    ];

    const parseFile = async (data: ArrayBuffer) => {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
            if (json.length < 2) return alert('File seems empty or has no data rows.');
            
            const hdrs = json[0].map(h => String(h || '').trim());
            setHeaders(hdrs);
            
            const dataRows = json.slice(1).filter(r => r.some(c => c !== undefined && c !== null && c !== ''));
            setParsedData(dataRows);
            
            // Auto guess mapping
            const initialMap: Record<string, string> = {};
            hdrs.forEach((h, idx) => {
                const hl = h.toLowerCase();
                if (hl.includes('desc') || hl.includes('name') || hl.includes('item')) initialMap['name'] = String(idx);
                if (hl.includes('cat')) initialMap['category'] = String(idx);
                if (hl.includes('room') || hl.includes('area')) initialMap['room'] = String(idx);
                if (hl === 'uom' || hl.includes('unit')) initialMap['unit'] = String(idx);
                if (hl === 'qty' || hl.includes('quant')) initialMap['qty'] = String(idx);
                if (isOwner && (hl.includes('cost') || hl.includes('rate') || hl.includes('price'))) initialMap['unitCost'] = String(idx);
                if (hl.includes('note') || hl.includes('comm')) initialMap['notes'] = String(idx);
            });
            setMapping(initialMap);
            setStep(2);
        } catch (e) {
            alert('Failed to parse file.');
            console.error(e);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            if (evt.target?.result) await parseFile(evt.target.result as ArrayBuffer);
        };
        reader.readAsArrayBuffer(file);
    };

    const validateAndProcess = () => {
        const reqs = MAPPABLE_FIELDS.filter(f => f.required);
        const missing = reqs.filter(r => !mapping[r.key]);
        if (missing.length > 0) return alert(`Please map required fields: ${missing.map(m => m.label).join(', ')}`);

        const valids: any[] = [];
        const errs: any[] = [];

        parsedData.forEach((row, i) => {
            const item: any = {};
            const itemErrors: string[] = [];

            MAPPABLE_FIELDS.forEach(field => {
                const colIdx = mapping[field.key];
                if (colIdx !== undefined) {
                    item[field.key] = row[parseInt(colIdx)];
                }
            });

            if (!item.name) itemErrors.push('Missing Name/Description');
            if (!item.category) itemErrors.push('Missing Category');
            
            let qty = parseFloat(item.qty);
            if (isNaN(qty) || qty < 0) itemErrors.push('Invalid Quantity');
            item.qty = qty || 0;

            if (isOwner && mapping['unitCost'] !== undefined) {
                let cost = parseFloat(item.unitCost);
                if (isNaN(cost)) cost = 0;
                item.unitCost = cost;
            } else {
                item.unitCost = 0;
            }

            if (itemErrors.length > 0) {
                errs.push({ rowIndex: i + 2, data: row, errors: itemErrors });
            } else {
                valids.push(item);
            }
        });

        setValidItems(valids);
        setErrors(errs);
        setStep(3);
    };

    const commitImport = () => {
        const finalItems = validItems.map(vi => ({
            id: generateId(),
            name: vi.name,
            description: vi.name,
            cat: vi.category,
            roomId: vi.room, // Note: would need fuzzy match logic against existing rooms ideally
            unit: vi.unit,
            qty: vi.qty,
            baseRate: vi.unitCost || 0,
            boqStatus: 'included_ffds_scope',
            linkage: { type: 'direct_execution', label: `Imported ${new Date().toLocaleDateString()}` },
            statusHistory: [{
                changedAt: new Date().toISOString(),
                from: 'unassigned',
                to: 'included_ffds_scope',
                changedBy: isOwner ? 'Owner' : 'Designer',
                reason: 'Bulk Excel Import'
            }]
        }));
        onImport(finalItems);
        onClose();
        setTimeout(() => {
            setStep(1);
            setParsedData([]);
        }, 300);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-auto flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Bulk Import from Excel</h2>
                            <p className="text-sm text-slate-500 font-medium">Standardize and ingest external scopes rapidly.</p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white shadow-sm border border-slate-200 p-2 rounded-xl transition-all">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                        {frozen ? (
                            <div className="p-8 text-center text-rose-600 bg-rose-50 rounded-xl border border-rose-100 flex flex-col items-center">
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 text-rose-500 font-bold text-2xl">!</div>
                                <h3 className="text-lg font-bold mb-2">Import Blocked</h3>
                                <p className="font-medium max-w-md mx-auto">The Operative BOQ is frozen. Bulk adding items post-freeze bypasses the Change Order flow and exposes the firm to scope creep. Use the Scope Addition module to add new items safely.</p>
                            </div>
                        ) : step === 1 ? (
                            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center bg-slate-50 hover:bg-slate-100 transition-colors relative cursor-pointer group">
                                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform text-indigo-500 font-bold text-xl">
                                    XLSX
                                </div>
                                <h3 className="text-lg font-bold text-slate-700 mb-2">Drop your BOQ file here, or click to browse</h3>
                                <p className="text-sm text-slate-500 font-medium">Supports .xlsx and .csv formats.</p>
                            </div>
                        ) : step === 2 ? (
                            <div>
                                <div className="mb-6">
                                    <h3 className="font-bold text-slate-800 mb-2">Map Columns</h3>
                                    <p className="text-sm text-slate-500">Match your Excel columns to the system fields.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {MAPPABLE_FIELDS.map(f => (
                                        <div key={f.key} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                {f.label} {f.required && <span className="text-red-500">*</span>}
                                            </label>
                                            <select 
                                                value={mapping[f.key] || ''}
                                                onChange={(e) => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                                                className="w-full bg-white border border-slate-300 p-2.5 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                            >
                                                <option value="">-- Ignore / Not Mapped --</option>
                                                {headers.map((h, i) => (
                                                    <option key={i} value={String(i)}>{h || `Column ${i+1}`}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>

                                <h3 className="font-bold text-slate-800 mt-10 mb-4">Data Preview ({parsedData.length} rows detected)</h3>
                                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                                            <tr>
                                                {headers.map((h, i) => <th key={i} className="p-3">{h || `Col ${i+1}`}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsedData.slice(0, 5).map((row, i) => (
                                                <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                                                    {headers.map((_, colIdx) => (
                                                        <td key={colIdx} className="p-3 text-slate-600">{row[colIdx]}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="mb-8 grid grid-cols-2 gap-6">
                                    <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <div className="text-emerald-700 font-bold text-lg mb-1">Ready to Import</div>
                                            <div className="text-emerald-600/80 text-sm font-medium">These lines pass all checks.</div>
                                        </div>
                                        <div className="text-4xl shadow-[inset_0_-8px_0_rgba(16,185,129,0.2)] font-black text-emerald-600">{validItems.length}</div>
                                    </div>
                                    <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <div className="text-rose-700 font-bold text-lg mb-1">Row Errors</div>
                                            <div className="text-rose-600/80 text-sm font-medium">Will be skipped.</div>
                                        </div>
                                        <div className="text-4xl shadow-[inset_0_-8px_0_rgba(244,63,94,0.2)] font-black text-rose-600">{errors.length}</div>
                                    </div>
                                </div>

                                {errors.length > 0 && (
                                    <div>
                                        <h3 className="font-bold text-slate-800 mb-4">Error Log</h3>
                                        <div className="overflow-x-auto border border-rose-200 rounded-xl bg-rose-50/50">
                                            <table className="w-full text-left text-sm text-rose-900">
                                                <thead className="bg-rose-100/50 border-b border-rose-200 font-bold text-rose-700">
                                                    <tr>
                                                        <th className="p-3 w-20">Row</th>
                                                        <th className="p-3">Issue(s)</th>
                                                        <th className="p-3">Row Summary</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {errors.slice(0, 10).map((err, i) => (
                                                        <tr key={i} className="border-b border-rose-100 last:border-0 hover:bg-rose-50 transition-colors">
                                                            <td className="p-3 font-mono font-bold text-rose-600">{err.rowIndex}</td>
                                                            <td className="p-3 font-medium">{err.errors.join(', ')}</td>
                                                            <td className="p-3 font-mono text-xs opacity-70 truncate max-w-md">{err.data?.slice(0,5).join(' | ')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {errors.length > 10 && <div className="p-3 text-center text-rose-500 text-xs font-bold bg-white/50 border-t border-rose-100">Showing first 10 errors.</div>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-between items-center">
                        <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                            Cancel
                        </button>
                        {!frozen && step === 2 && (
                            <button onClick={validateAndProcess} className="px-6 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all hover:shadow-indigo-200 hover:-translate-y-0.5">
                                Validate Data
                            </button>
                        )}
                        {!frozen && step === 3 && validItems.length > 0 && (
                            <button onClick={commitImport} className="px-6 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all hover:shadow-emerald-200 hover:-translate-y-0.5">
                                Import {validItems.length} Items
                            </button>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default BulkImportModal;
