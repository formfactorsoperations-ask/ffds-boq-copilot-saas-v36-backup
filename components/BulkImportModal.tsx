import React, { useState, useCallback } from 'react';
import { BoqItem } from '../types';
import { id as generateId } from '../lib/utils';
import { Upload, AlertTriangle, Check } from '@/lib/lucide-shim';
import BankModal from './bank/BankModal';
import { Button, Chip, SummaryStrip, StateDot, INPUT, LABEL } from './ui/kit';

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

    const STEPS = ['Choose a file', 'Match columns', 'Check and import'];

    return (
        <BankModal
            label="Import from Excel"
            eyebrow="Import"
            title="Import from Excel"
            blurb="Bring items in from a sheet: choose the file, match its columns, then check what will come in."
            size="2xl"
            onClose={onClose}
            tools={!frozen ? (
                /* Where you are in the three steps. */
                <ol className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {STEPS.map((label, i) => {
                        const n = i + 1;
                        const done = step > n;
                        const on = step === n;
                        return (
                            <li key={label} aria-current={on ? 'step' : undefined} className={`flex items-center gap-2 text-xs font-semibold ${on ? 'text-slate-800' : 'text-slate-400'}`}>
                                <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold transition-colors ${done ? 'bg-emerald-100 text-emerald-700' : on ? 'bg-[#3D52A0] text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {done ? <Check className="w-3 h-3" /> : n}
                                </span>
                                {label}
                            </li>
                        );
                    })}
                </ol>
            ) : undefined}
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    {!frozen && step === 2 && <Button variant="primary" onClick={validateAndProcess}>Check the rows</Button>}
                    {!frozen && step === 3 && validItems.length > 0 && (
                        <Button variant="primary" icon={Check} onClick={commitImport}>Import {validItems.length} {validItems.length === 1 ? 'item' : 'items'}</Button>
                    )}
                </>
            }
        >
            <div key={frozen ? 'frozen' : step} className="hud-swap">
                {frozen ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 flex items-start gap-3" role="alert">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" aria-hidden />
                        <div>
                            <p className="text-sm font-semibold text-rose-800">Import is blocked</p>
                            <p className="text-xs text-rose-700 mt-0.5">The Operative BOQ is frozen. Adding items in bulk after the freeze would skip the Change Order flow. Use Scope Additions instead.</p>
                        </div>
                    </div>
                ) : step === 1 ? (
                    <label className="group relative block rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center cursor-pointer transition-colors hover:border-[#3D52A0]/50 hover:bg-slate-50 focus-within:border-[#3D52A0]">
                        <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <span className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
                            <Upload className="w-5 h-5" aria-hidden />
                        </span>
                        <span className="block text-sm font-semibold text-slate-700">Drop the file here, or click to choose one</span>
                        <span className="block text-xs text-slate-500 mt-0.5">.xlsx, .xls or .csv. The first row should be the column names.</span>
                    </label>
                ) : step === 2 ? (
                    <div className="space-y-5">
                        <div>
                            <p className="text-sm font-semibold text-slate-800">Match the columns</p>
                            <p className="text-xs text-slate-500 mt-0.5">Say which column of the sheet holds each field. The ones we could guess are filled in.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {MAPPABLE_FIELDS.map((f, i) => (
                                <label key={f.key} className="block hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                                    <span className={`${LABEL} flex items-center gap-1.5 mb-1.5`}>
                                        {f.label}
                                        {f.required && (mapping[f.key] ? <StateDot tone="good" /> : <Chip tone="warn">Needed</Chip>)}
                                    </span>
                                    <select
                                        value={mapping[f.key] || ''}
                                        onChange={(e) => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                                        className={`${INPUT} bg-white`}
                                    >
                                        <option value="">Not in the sheet</option>
                                        {headers.map((h, idx) => (
                                            <option key={idx} value={String(idx)}>{h || `Column ${idx + 1}`}</option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>

                        <div>
                            <p className={`${LABEL} mb-1.5`}>First rows of the sheet ({parsedData.length} in all)</p>
                            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                <table className="w-full text-left text-xs whitespace-nowrap">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            {headers.map((h, i) => <th key={i} scope="col" className={`${LABEL} px-3 py-2.5`}>{h || `Column ${i + 1}`}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {parsedData.slice(0, 5).map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                {headers.map((_, colIdx) => (
                                                    <td key={colIdx} className="px-3 py-2 text-slate-600">{row[colIdx]}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5">
                        <SummaryStrip stats={[
                            { label: 'Ready to import', value: validItems.length, sub: 'These rows pass every check', tone: validItems.length > 0 ? 'good' : 'slate' },
                            { label: 'Rows with a problem', value: errors.length, sub: errors.length > 0 ? 'Left out of the import' : 'Nothing is left out', tone: errors.length > 0 ? 'bad' : 'good' },
                            { label: 'Rows in the sheet', value: parsedData.length, sub: 'Not counting the heading' },
                        ]} />

                        {errors.length > 0 && (
                            <div>
                                <p className={`${LABEL} mb-1.5`}>What is wrong</p>
                                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th scope="col" className={`${LABEL} px-3 py-2.5 w-16`}>Row</th>
                                                <th scope="col" className={`${LABEL} px-3 py-2.5`}>Problem</th>
                                                <th scope="col" className={`${LABEL} px-3 py-2.5`}>What the row says</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {errors.slice(0, 10).map((err, i) => (
                                                <tr key={i} className="hud-row-in" style={{ animationDelay: `${i * 25}ms` }}>
                                                    <td className="px-3 py-2 font-bold tabular-nums text-slate-800">{err.rowIndex}</td>
                                                    <td className="px-3 py-2 font-semibold text-rose-700">{err.errors.join(', ')}</td>
                                                    <td className="px-3 py-2 text-slate-500 truncate max-w-md">{err.data?.slice(0, 5).join(' | ')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {errors.length > 10 && <div className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">The first 10 of {errors.length}.</div>}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </BankModal>
    );
};

export default BulkImportModal;
