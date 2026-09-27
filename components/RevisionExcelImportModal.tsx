import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Upload,
  FileSpreadsheet,
  Check,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  PlusCircle,
  Trash2,
  TrendingUp,
  TrendingDown,
  Layers,
  Search,
  Filter,
  Info,
  HelpCircle,
} from 'lucide-react';
import { Item, RevisionAction, ActionType } from '../types';
import { formatINR } from '../lib/utils';

export interface BaselineBoqItem {
  id: string;
  bankId?: string;
  item: string;
  section: string;
  category?: string;
  qty: number;
  rate: number;
  unit: string;
  total: number;
  inclusions?: string[];
  exclusions?: string[];
}

export interface DiffComparisonRow {
  id: string; // unique row id
  selected: boolean;
  status: 'add' | 'revise_qty' | 'revise_rate' | 'replace' | 'remove' | 'unchanged';
  actionType?: ActionType;
  section: string;
  itemName: string;
  baselineItem?: BaselineBoqItem;
  importedItem?: {
    name: string;
    section: string;
    qty: number;
    rate: number;
    unit: string;
    specs: string;
  };
  baselineQty: number;
  baselineRate: number;
  baselineTotal: number;
  revisedQty: number;
  revisedRate: number;
  revisedTotal: number;
  deltaTotal: number;
  unit: string;
  matchScore: number;
  notes: string;
}

export interface RevisionExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  baselineBoq: BaselineBoqItem[];
  bank: Item[];
  onApplyImport: (
    actions: RevisionAction[],
    newBankItems: Item[],
    summaryText: string
  ) => void;
}

export const RevisionExcelImportModal: React.FC<RevisionExcelImportModalProps> = ({
  isOpen,
  onClose,
  baselineBoq,
  bank,
  onApplyImport,
}) => {
  // Steps: 'upload' -> 'mapping' -> 'review'
  const [step, setStep] = useState<'upload' | 'mapping' | 'review'>('upload');

  // Workbook and raw parsing
  const [workbook, setWorkbook] = useState<any>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Column Mapping
  const [colMap, setColMap] = useState({
    name: '',
    section: '',
    qty: '',
    rate: '',
    unit: '',
    specs: '',
  });

  // Diff comparison results
  const [diffRows, setDiffRows] = useState<DiffComparisonRow[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'changes' | 'add' | 'revisions' | 'remove' | 'unchanged'>('changes');
  const [searchQuery, setSearchQuery] = useState('');
  const [registerInBank, setRegisterInBank] = useState(true);
  const [removeMissingItems, setRemoveMissingItems] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep('upload');
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setHeaders([]);
    setRawRows([]);
    setPreviewRows([]);
    setFileName('');
    setIsParsing(false);
    setErrorMsg(null);
    setColMap({ name: '', section: '', qty: '', rate: '', unit: '', specs: '' });
    setDiffRows([]);
    setFilterTab('changes');
    setSearchQuery('');
  };

  const handleModalClose = () => {
    resetState();
    onClose();
  };

  const parseNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const normalizeStr = (s: string): string => {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // 1. File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsParsing(true);
    setErrorMsg(null);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const buffer = evt.target?.result;
        if (!buffer) return;

        try {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(buffer, { type: 'array' });
          setWorkbook(wb);
          setSheetNames(wb.SheetNames);

          const defaultSheet = wb.SheetNames[0];
          setSelectedSheet(defaultSheet);
          processSheet(wb, defaultSheet);
        } catch (err: any) {
          console.error('Failed to parse Excel file:', err);
          setErrorMsg('Could not read Excel file. Please ensure it is a valid .xlsx or .csv file.');
          setIsParsing(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error loading file. Please try again.');
      setIsParsing(false);
    }
  };

  // 2. Process Chosen Sheet & Guess Column Mapping
  const processSheet = async (wb: any, sheetName: string) => {
    setSelectedSheet(sheetName);
    setIsParsing(true);
    setErrorMsg(null);

    try {
      const XLSX = await import('xlsx');
      const ws = wb.Sheets[sheetName];
      if (!ws) {
        setErrorMsg('Selected sheet not found in workbook.');
        setIsParsing(false);
        return;
      }

      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (!rows || rows.length === 0) {
        setErrorMsg('The selected sheet is empty.');
        setIsParsing(false);
        return;
      }

      // Find the most likely header row (first row with multiple text columns)
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(rows.length, 6); i++) {
        const row = rows[i] || [];
        const textCount = row.filter((c: any) => typeof c === 'string' && c.trim().length > 0).length;
        const hasKeyword = row.some((c: any) => {
          const s = String(c || '').toLowerCase();
          return s.includes('item') || s.includes('desc') || s.includes('rate') || s.includes('qty') || s.includes('particular');
        });
        if (hasKeyword || textCount >= 3) {
          headerRowIndex = i;
          break;
        }
      }

      const detectedHeaders = (rows[headerRowIndex] || []).map((h: any, idx: number) => {
        const val = String(h || '').trim();
        return val || `Column ${idx + 1}`;
      });

      const dataRows = rows.slice(headerRowIndex + 1).filter((r: any[]) => {
        // filter out completely blank rows
        return r && r.some((c: any) => c !== null && c !== undefined && String(c).trim() !== '');
      });

      setHeaders(detectedHeaders);
      setRawRows(dataRows);
      setPreviewRows(dataRows.slice(0, 4));

      // Smart column auto-matching
      const hLower = detectedHeaders.map((h: string) => h.toLowerCase());
      const findMatchingCol = (keywords: string[]) => {
        const idx = hLower.findIndex((h: string) => keywords.some((k) => h.includes(k)));
        return idx !== -1 ? detectedHeaders[idx] : '';
      };

      const guessedMap = {
        name: findMatchingCol(['item', 'description', 'particular', 'scope', 'work', 'name', 'product', 'title']),
        section: findMatchingCol(['room', 'section', 'space', 'area', 'location', 'category', 'cat', 'trade', 'zone']),
        qty: findMatchingCol(['qty', 'quantity', 'nos', 'count', 'area', 'sqft', 'sft']),
        rate: findMatchingCol(['rate', 'unit rate', 'price', 'unit price', 'cost', 'sell']),
        unit: findMatchingCol(['unit', 'uom', 'measure']),
        specs: findMatchingCol(['spec', 'specs', 'specification', 'details', 'remarks', 'notes', 'inclusions', 'brand']),
      };

      setColMap(guessedMap);
      setStep('mapping');
      setIsParsing(false);
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Failed to process sheet: ' + (e.message || 'Unknown error'));
      setIsParsing(false);
    }
  };

  // 3. Compare Processed Excel Rows with Active Baseline BOQ
  const handleProcessAndCompare = () => {
    if (!colMap.name || !colMap.qty || !colMap.rate) {
      setErrorMsg('Please select at least "Item Name", "Quantity", and "Rate" columns.');
      return;
    }

    const nameIdx = headers.indexOf(colMap.name);
    const sectionIdx = headers.indexOf(colMap.section);
    const qtyIdx = headers.indexOf(colMap.qty);
    const rateIdx = headers.indexOf(colMap.rate);
    const unitIdx = headers.indexOf(colMap.unit);
    const specsIdx = headers.indexOf(colMap.specs);

    let currentSectionHeader = 'General Scope';
    const parsedExcelItems: {
      name: string;
      section: string;
      qty: number;
      rate: number;
      unit: string;
      specs: string;
    }[] = [];

    // Parse each row
    rawRows.forEach((row) => {
      const rawName = String(row[nameIdx] || '').trim();
      const rawSection = sectionIdx !== -1 ? String(row[sectionIdx] || '').trim() : '';
      const rawQty = parseNumber(row[qtyIdx]);
      const rawRate = parseNumber(row[rateIdx]);
      const rawUnit = unitIdx !== -1 ? String(row[unitIdx] || 'nos').trim() : 'nos';
      const rawSpecs = specsIdx !== -1 ? String(row[specsIdx] || '').trim() : '';

      if (!rawName) return;

      // Section header detection (e.g. Row where only name exists and qty=0, rate=0)
      if (rawQty === 0 && rawRate === 0 && !rawSection) {
        // Likely a category/space header
        currentSectionHeader = rawName;
        return;
      }

      parsedExcelItems.push({
        name: rawName,
        section: rawSection || currentSectionHeader,
        qty: rawQty,
        rate: rawRate,
        unit: rawUnit || 'nos',
        specs: rawSpecs,
      });
    });

    if (parsedExcelItems.length === 0) {
      setErrorMsg('No valid item rows found in the sheet with the selected mapping.');
      return;
    }

    // Matching Algorithm against baselineBoq
    const matchedBaselineIds = new Set<string>();
    const comparisonResults: DiffComparisonRow[] = [];

    // Helper: calculate token overlap / string similarity
    const calculateSimilarity = (s1: string, s2: string): number => {
      const n1 = normalizeStr(s1);
      const n2 = normalizeStr(s2);
      if (n1 === n2) return 1.0;
      if (n1.includes(n2) || n2.includes(n1)) return 0.85;

      const words1 = new Set(n1.split(' ').filter((w) => w.length > 2));
      const words2 = new Set(n2.split(' ').filter((w) => w.length > 2));
      if (words1.size === 0 || words2.size === 0) return 0;

      let intersection = 0;
      words1.forEach((w) => {
        if (words2.has(w)) intersection++;
      });
      return (2 * intersection) / (words1.size + words2.size);
    };

    parsedExcelItems.forEach((imp, impIdx) => {
      let bestMatch: BaselineBoqItem | null = null;
      let highestScore = 0;

      baselineBoq.forEach((base) => {
        if (matchedBaselineIds.has(base.id)) return;

        const isSameSection = normalizeStr(base.section) === normalizeStr(imp.section);
        const nameSim = calculateSimilarity(base.item, imp.name);

        let score = 0;
        if (isSameSection) {
          score = nameSim * 100;
        } else {
          score = nameSim * 70; // penalty for different section
        }

        if (score > highestScore && score >= 55) {
          highestScore = score;
          bestMatch = base;
        }
      });

      if (bestMatch) {
        matchedBaselineIds.add((bestMatch as BaselineBoqItem).id);
        const b = bestMatch as BaselineBoqItem;

        const qtyDiffers = Math.abs(b.qty - imp.qty) >= 0.001;
        const rateDiffers = Math.abs(b.rate - imp.rate) >= 0.01;
        const nameDiffers = normalizeStr(b.item) !== normalizeStr(imp.name);

        const revTotal = imp.qty * imp.rate;
        const delta = revTotal - b.total;

        let status: 'unchanged' | 'revise_qty' | 'revise_rate' | 'replace' = 'unchanged';
        let actionType: ActionType | undefined = undefined;
        let notes = '';

        if (!qtyDiffers && !rateDiffers && !nameDiffers) {
          status = 'unchanged';
          notes = 'Exact match with active baseline. No change required.';
        } else if (nameDiffers || (qtyDiffers && rateDiffers)) {
          status = 'replace';
          actionType = 'REPLACE';
          notes = nameDiffers
            ? `Specification replaced: "${b.item}" ➔ "${imp.name}"`
            : `Quantity and rate both revised`;
        } else if (qtyDiffers) {
          status = 'revise_qty';
          actionType = 'REVISE_QTY';
          notes = `Quantity changed: ${b.qty} ➔ ${imp.qty} ${imp.unit}`;
        } else if (rateDiffers) {
          status = 'revise_rate';
          actionType = 'REVISE_RATE';
          notes = `Unit rate changed: ${formatINR(b.rate)} ➔ ${formatINR(imp.rate)}`;
        }

        comparisonResults.push({
          id: `match_${b.id}_${impIdx}`,
          selected: status !== 'unchanged',
          status,
          actionType,
          section: imp.section,
          itemName: imp.name,
          baselineItem: b,
          importedItem: imp,
          baselineQty: b.qty,
          baselineRate: b.rate,
          baselineTotal: b.total,
          revisedQty: imp.qty,
          revisedRate: imp.rate,
          revisedTotal: revTotal,
          deltaTotal: delta,
          unit: imp.unit || b.unit,
          matchScore: highestScore,
          notes,
        });
      } else {
        // New item addition
        const revTotal = imp.qty * imp.rate;
        comparisonResults.push({
          id: `new_item_${impIdx}`,
          selected: true,
          status: 'add',
          actionType: 'ADD',
          section: imp.section,
          itemName: imp.name,
          importedItem: imp,
          baselineQty: 0,
          baselineRate: 0,
          baselineTotal: 0,
          revisedQty: imp.qty,
          revisedRate: imp.rate,
          revisedTotal: revTotal,
          deltaTotal: revTotal,
          unit: imp.unit,
          matchScore: 0,
          notes: 'New item in revised Excel scope.',
        });
      }
    });

    // Check baseline items missing from Excel
    // By default, select them for removal so the revised Excel defines the exact scope (no double-counting)
    baselineBoq.forEach((base) => {
      if (!matchedBaselineIds.has(base.id)) {
        comparisonResults.push({
          id: `missing_${base.id}`,
          selected: true, // Selected by default so original items go away
          status: 'remove',
          actionType: 'REMOVE',
          section: base.section,
          itemName: base.item,
          baselineItem: base,
          baselineQty: base.qty,
          baselineRate: base.rate,
          baselineTotal: base.total,
          revisedQty: 0,
          revisedRate: 0,
          revisedTotal: 0,
          deltaTotal: -base.total,
          unit: base.unit,
          matchScore: 0,
          notes: 'Excluded from revised Excel — removed to make revised Excel the exact project scope.',
        });
      }
    });

    setDiffRows(comparisonResults);
    setRemoveMissingItems(true);
    setStep('review');
    setErrorMsg(null);
  };

  // Metrics summary
  const summaryMetrics = useMemo(() => {
    const selectedRows = diffRows.filter((r) => r.selected);
    const addedCount = selectedRows.filter((r) => r.status === 'add').length;
    const qtyCount = selectedRows.filter((r) => r.status === 'revise_qty').length;
    const rateCount = selectedRows.filter((r) => r.status === 'revise_rate').length;
    const replacedCount = selectedRows.filter((r) => r.status === 'replace').length;
    const removedCount = selectedRows.filter((r) => r.status === 'remove').length;
    const unchangedCount = diffRows.filter((r) => r.status === 'unchanged').length;
    const netDelta = selectedRows.reduce((sum, r) => sum + r.deltaTotal, 0);

    const baselineTotal = baselineBoq.reduce((acc, b) => acc + b.total, 0);
    const revisedScopeTotal = Math.max(0, baselineTotal + netDelta);

    return {
      totalExcelRows: rawRows.length,
      selectedCount: selectedRows.length,
      addedCount,
      qtyCount,
      rateCount,
      replacedCount,
      removedCount,
      unchangedCount,
      baselineTotal,
      revisedScopeTotal,
      netDelta,
    };
  }, [diffRows, rawRows, baselineBoq]);

  // Filtered rows for review table
  const displayedRows = useMemo(() => {
    return diffRows.filter((row) => {
      // Tab filter
      if (filterTab === 'changes' && (row.status === 'unchanged' || !row.selected)) return false;
      if (filterTab === 'add' && row.status !== 'add') return false;
      if (filterTab === 'revisions' && row.status !== 'revise_qty' && row.status !== 'revise_rate' && row.status !== 'replace') return false;
      if (filterTab === 'remove' && row.status !== 'remove') return false;
      if (filterTab === 'unchanged' && row.status !== 'unchanged') return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = row.itemName.toLowerCase().includes(q);
        const matchesSection = row.section.toLowerCase().includes(q);
        const matchesNotes = row.notes.toLowerCase().includes(q);
        return matchesName || matchesSection || matchesNotes;
      }

      return true;
    });
  }, [diffRows, filterTab, searchQuery]);

  const toggleRowSelected = (rowId: string) => {
    setDiffRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleAllVisible = (select: boolean) => {
    const visibleIds = new Set(displayedRows.map((r) => r.id));
    setDiffRows((prev) =>
      prev.map((r) => (visibleIds.has(r.id) ? { ...r, selected: select } : r))
    );
  };

  const handleToggleRemoveMissing = (enabled: boolean) => {
    setRemoveMissingItems(enabled);
    setDiffRows((prev) =>
      prev.map((r) => (r.status === 'remove' ? { ...r, selected: enabled } : r))
    );
  };

  // 4. Confirm and Apply Revisions
  const handleApplyFinal = () => {
    const selectedItems = diffRows.filter((r) => r.selected);
    if (selectedItems.length === 0) {
      setErrorMsg('Please select at least one change to apply.');
      return;
    }

    const generatedActions: RevisionAction[] = [];
    const newBankItems: Item[] = [];
    const existingBankNames = new Set(bank.map((i) => i.name.toLowerCase().trim()));

    selectedItems.forEach((row, idx) => {
      const actionId = 'act_imp_' + Math.random().toString(36).substring(2, 9);

      if (row.status === 'add') {
        const itemBankId =
          'ADHOC_IMP_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6) + '_' + idx;

        // Register in bank if opted
        if (registerInBank && !existingBankNames.has(row.itemName.toLowerCase().trim())) {
          existingBankNames.add(row.itemName.toLowerCase().trim());
          newBankItems.push({
            id: itemBankId,
            name: row.itemName,
            cat: row.section || 'General Scope',
            specs: row.importedItem?.specs || 'Imported via revised BOQ Excel',
            internalSpecs: 'Excel Revised Import',
            unit: row.unit || 'nos',
            materials: Math.round(row.revisedRate * 0.7),
            labor: Math.round(row.revisedRate * 0.3),
            margin: 0,
          });
        }

        generatedActions.push({
          id: actionId,
          type: 'ADD',
          section: row.section,
          item: row.itemName,
          newValue: {
            bankId: itemBankId,
            item: row.itemName,
            qty: row.revisedQty,
            rate: row.revisedRate,
            unit: row.unit,
            total: row.revisedTotal,
            inclusions: row.importedItem?.specs ? [row.importedItem.specs] : [],
          },
          reasonCategory: 'Excel Scope Import',
          note: row.notes || 'Imported from revised Excel BOQ',
          timestamp: Date.now(),
        });
      } else if (row.status === 'revise_qty' && row.baselineItem) {
        generatedActions.push({
          id: actionId,
          type: 'REVISE_QTY',
          targetId: row.baselineItem.id,
          section: row.section,
          item: row.baselineItem.item,
          oldValue: row.baselineQty,
          newValue: row.revisedQty,
          reasonCategory: 'Quantity Adjustment',
          note: row.notes,
          timestamp: Date.now(),
        });
      } else if (row.status === 'revise_rate' && row.baselineItem) {
        generatedActions.push({
          id: actionId,
          type: 'REVISE_RATE',
          targetId: row.baselineItem.id,
          section: row.section,
          item: row.baselineItem.item,
          oldValue: row.baselineRate,
          newValue: row.revisedRate,
          reasonCategory: 'Rate Calibration',
          note: row.notes,
          timestamp: Date.now(),
        });
      } else if (row.status === 'replace' && row.baselineItem) {
        const itemBankId =
          'ADHOC_REP_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6) + '_' + idx;

        if (registerInBank && !existingBankNames.has(row.itemName.toLowerCase().trim())) {
          existingBankNames.add(row.itemName.toLowerCase().trim());
          newBankItems.push({
            id: itemBankId,
            name: row.itemName,
            cat: row.section || 'General Scope',
            specs: row.importedItem?.specs || 'Replacement scope from Excel',
            internalSpecs: 'Excel Replacement Scope',
            unit: row.unit || 'nos',
            materials: Math.round(row.revisedRate * 0.7),
            labor: Math.round(row.revisedRate * 0.3),
            margin: 0,
          });
        }

        generatedActions.push({
          id: actionId,
          type: 'REPLACE',
          targetId: row.baselineItem.id,
          section: row.section,
          item: row.baselineItem.item,
          oldValue: {
            item: row.baselineItem.item,
            qty: row.baselineQty,
            rate: row.baselineRate,
            unit: row.baselineItem.unit,
            total: row.baselineTotal,
          },
          newValue: {
            bankId: itemBankId,
            item: row.itemName,
            qty: row.revisedQty,
            rate: row.revisedRate,
            unit: row.unit,
            total: row.revisedTotal,
            inclusions: row.importedItem?.specs ? [row.importedItem.specs] : [],
          },
          reasonCategory: 'Specification Upgrade / Replace',
          note: row.notes,
          timestamp: Date.now(),
        });
      } else if (row.status === 'remove' && row.baselineItem) {
        generatedActions.push({
          id: actionId,
          type: 'REMOVE',
          targetId: row.baselineItem.id,
          section: row.section,
          item: row.baselineItem.item,
          oldValue: {
            item: row.baselineItem.item,
            qty: row.baselineQty,
            rate: row.baselineRate,
            total: row.baselineTotal,
          },
          reasonCategory: 'Scope Reduction',
          note: row.notes,
          timestamp: Date.now(),
        });
      }
    });

    const summary = `Imported ${generatedActions.length} revised BOQ actions (${newBankItems.length} new items added to bank). Net variance: ${summaryMetrics.netDelta >= 0 ? '+' : ''}${formatINR(summaryMetrics.netDelta)}.`;

    onApplyImport(generatedActions, newBankItems, summary);
    handleModalClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="bg-white rounded-2xl shadow-card border border-slate-200 w-full max-w-5xl my-auto overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200/90 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#4f46e5]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Import Revised BOQ (Excel / Spreadsheet)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-[#4f46e5] border border-indigo-200/60">
                  Smart Mapper
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload your updated spreadsheet, match columns, compare against the active baseline, and stage all revisions automatically.
              </p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Step Breadcrumbs */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center gap-6 text-xs font-bold text-slate-500 shrink-0">
          <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-[#4f46e5]' : 'text-slate-700'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${step === 'upload' ? 'bg-[#4f46e5] text-white' : 'bg-slate-200 text-slate-700'}`}>
              1
            </span>
            <span>Upload File</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
          <div className={`flex items-center gap-2 ${step === 'mapping' ? 'text-[#4f46e5]' : step === 'review' ? 'text-slate-700' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${step === 'mapping' ? 'bg-[#4f46e5] text-white' : step === 'review' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
              2
            </span>
            <span>Map Columns</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
          <div className={`flex items-center gap-2 ${step === 'review' ? 'text-[#4f46e5]' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${step === 'review' ? 'bg-[#4f46e5] text-white' : 'bg-slate-200 text-slate-400'}`}>
              3
            </span>
            <span>Review BOQ Diffs & Item Bank Sync</span>
          </div>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-rose-800 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-grow space-y-6">
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-[#4f46e5] bg-slate-50/60 hover:bg-indigo-50/20 rounded-2xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-[#4f46e5] group-hover:border-indigo-200 transition-all">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Click to select or drag and drop your revised BOQ spreadsheet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Supports Microsoft Excel (<code className="font-mono text-slate-700">.xlsx</code>, <code className="font-mono text-slate-700">.xls</code>) and <code className="font-mono text-slate-700">.csv</code>
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Sample Guidance */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Info className="w-4 h-4 text-[#4f46e5]" />
                  <span>How the smart comparison works:</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1 list-disc pl-5">
                  <li>
                    <strong>Exact & Fuzzy Matching:</strong> Existing line items in the active BOQ are matched by description and room/section.
                  </li>
                  <li>
                    <strong>Automatic Diff Detection:</strong> Identifies whether an item has changed in quantity, unit rate, or if it was replaced by a new specification.
                  </li>
                  <li>
                    <strong>New Items to Bank:</strong> Brand-new items detected in the Excel will be queued as additions and automatically registered into your Item Bank.
                  </li>
                  <li>
                    <strong>Safe Staging:</strong> Nothing is committed until you inspect the side-by-side diff table and click &ldquo;Apply Revisions&rdquo;.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {step === 'mapping' && (
            <div className="space-y-6">
              {/* Sheet selector (if multiple) */}
              {sheetNames.length > 1 && (
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#4f46e5]" />
                    Select Excel Sheet:
                  </span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => processSheet(workbook, e.target.value)}
                    className="p-1.5 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#4f46e5]"
                  >
                    {sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Column Selectors */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Match Columns from &ldquo;{fileName}&rdquo;
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Name */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Item Name / Description <span className="text-rose-500">*</span></span>
                      {colMap.name && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </label>
                    <select
                      value={colMap.name}
                      onChange={(e) => setColMap({ ...colMap, name: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#4f46e5]"
                    >
                      <option value="">Select column...</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Section / Room */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Room / Section / Space</span>
                      {colMap.section && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </label>
                    <select
                      value={colMap.section}
                      onChange={(e) => setColMap({ ...colMap, section: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#4f46e5]"
                    >
                      <option value="">(Optional - use section headers)</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Quantity <span className="text-rose-500">*</span></span>
                      {colMap.qty && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </label>
                    <select
                      value={colMap.qty}
                      onChange={(e) => setColMap({ ...colMap, qty: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#4f46e5]"
                    >
                      <option value="">Select column...</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Rate */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Unit Rate / Sell Price (₹) <span className="text-rose-500">*</span></span>
                      {colMap.rate && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </label>
                    <select
                      value={colMap.rate}
                      onChange={(e) => setColMap({ ...colMap, rate: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#4f46e5]"
                    >
                      <option value="">Select column...</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Unit */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Unit (e.g. sft, nos)</span>
                      {colMap.unit && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </label>
                    <select
                      value={colMap.unit}
                      onChange={(e) => setColMap({ ...colMap, unit: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#4f46e5]"
                    >
                      <option value="">(Default: nos)</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Specs / Remarks */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Specs / Inclusions / Notes</span>
                      {colMap.specs && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </label>
                    <select
                      value={colMap.specs}
                      onChange={(e) => setColMap({ ...colMap, specs: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#4f46e5]"
                    >
                      <option value="">(Optional specifications)</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sample Data Preview Table */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    First 4 Rows Preview from Spreadsheet
                  </span>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          {headers.map((h, i) => (
                            <th key={i} className="px-3.5 py-2.5 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-600">
                        {previewRows.map((r, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50/80">
                            {headers.map((_, cIdx) => (
                              <td key={cIdx} className="px-3.5 py-2 whitespace-nowrap font-medium">
                                {r[cIdx] !== undefined ? String(r[cIdx]) : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: REVIEW & CONFIRM */}
          {step === 'review' && (
            <div className="space-y-5">
              {/* Target Scope & Baseline Comparison Banner */}
              <div className="p-4 bg-indigo-50/70 border border-indigo-200/90 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#4f46e5] shrink-0" />
                    <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider">
                      Authoritative Scope Enforcement
                    </span>
                  </div>
                  <p className="text-xs text-indigo-900/80">
                    The revised Excel is treated as the project scope. All {summaryMetrics.removedCount} items present in the baseline but absent from the Excel are marked for removal to prevent double-counting.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <label className="flex items-center gap-2 p-2 px-3 bg-white/90 border border-indigo-200 rounded-xl cursor-pointer hover:bg-white text-xs font-bold text-slate-800 transition-colors shadow-2xs">
                    <input
                      type="checkbox"
                      checked={removeMissingItems}
                      onChange={(e) => handleToggleRemoveMissing(e.target.checked)}
                      className="w-4 h-4 rounded text-[#4f46e5] focus:ring-[#4f46e5] border-slate-300 cursor-pointer"
                    />
                    <span>Remove {summaryMetrics.removedCount} Missing Original Items</span>
                  </label>
                </div>
              </div>

              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs text-center">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Target Excel Scope</div>
                  <div className="text-sm font-extrabold text-[#4f46e5] mt-1">{formatINR(summaryMetrics.revisedScopeTotal)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{summaryMetrics.totalExcelRows} rows</div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs text-center">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Baseline Scope</div>
                  <div className="text-sm font-extrabold text-slate-800 mt-1">{formatINR(summaryMetrics.baselineTotal)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{baselineBoq.length} line items</div>
                </div>

                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 text-center">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase">+ New Additions</div>
                  <div className="text-lg font-extrabold text-emerald-700 mt-0.5">{summaryMetrics.addedCount}</div>
                </div>

                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-center">
                  <div className="text-[10px] font-bold text-amber-800 uppercase">✎ Scope Revisions</div>
                  <div className="text-lg font-extrabold text-amber-700 mt-0.5">{summaryMetrics.qtyCount + summaryMetrics.rateCount + summaryMetrics.replacedCount}</div>
                </div>

                <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200/80 text-center">
                  <div className="text-[10px] font-bold text-rose-800 uppercase">⛔ Removed from Scope</div>
                  <div className="text-lg font-extrabold text-rose-700 mt-0.5">{summaryMetrics.removedCount}</div>
                </div>

                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-center">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Net BOQ Variance</div>
                  <div
                    className={`text-sm font-extrabold mt-1 truncate ${
                      summaryMetrics.netDelta > 0
                        ? 'text-amber-700'
                        : summaryMetrics.netDelta < 0
                        ? 'text-emerald-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {summaryMetrics.netDelta === 0
                      ? '₹0'
                      : `${summaryMetrics.netDelta > 0 ? '+' : ''}${formatINR(summaryMetrics.netDelta)}`}
                  </div>
                </div>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-100/70 p-1.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1 overflow-x-auto text-xs font-bold text-slate-600">
                  <button
                    onClick={() => setFilterTab('changes')}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                      filterTab === 'changes'
                        ? 'bg-white text-[#4f46e5] shadow-2xs font-extrabold'
                        : 'hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    Active Changes ({summaryMetrics.selectedCount})
                  </button>
                  <button
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                      filterTab === 'all'
                        ? 'bg-white text-[#4f46e5] shadow-2xs font-extrabold'
                        : 'hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    All Items ({diffRows.length})
                  </button>
                  <button
                    onClick={() => setFilterTab('add')}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                      filterTab === 'add'
                        ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                        : 'hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    New Additions ({summaryMetrics.addedCount})
                  </button>
                  <button
                    onClick={() => setFilterTab('revisions')}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                      filterTab === 'revisions'
                        ? 'bg-white text-amber-700 shadow-2xs font-extrabold'
                        : 'hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    Revisions ({summaryMetrics.qtyCount + summaryMetrics.rateCount + summaryMetrics.replacedCount})
                  </button>
                  <button
                    onClick={() => setFilterTab('remove')}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                      filterTab === 'remove'
                        ? 'bg-white text-rose-700 shadow-2xs font-extrabold'
                        : 'hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    Missing / Removed ({summaryMetrics.removedCount})
                  </button>
                </div>

                <div className="relative w-full sm:w-56 shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search items or rooms..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#4f46e5]"
                  />
                </div>
              </div>

              {/* Bulk select / deselect bar */}
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 px-1">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleAllVisible(true)}
                    className="text-[#4f46e5] hover:underline font-bold"
                  >
                    Select All Visible
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    onClick={() => toggleAllVisible(false)}
                    className="text-slate-500 hover:text-slate-800"
                  >
                    Deselect All Visible
                  </button>
                </div>
                <div className="text-slate-500 text-[11px]">
                  Showing {displayedRows.length} of {diffRows.length} items
                </div>
              </div>

              {/* Diff Review Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-96 shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="w-10 px-3 py-3 text-center">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-3 py-3">Section / Room</th>
                      <th className="px-3 py-3">Item Description</th>
                      <th className="px-3 py-3 text-center">Change Type</th>
                      <th className="px-3 py-3 text-right">Baseline (Old)</th>
                      <th className="px-3 py-3 text-right">Revised (New)</th>
                      <th className="px-3 py-3 text-right">Variance Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          No items match the current filter or search criteria.
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((row) => (
                        <tr
                          key={row.id}
                          className={`transition-colors ${
                            row.selected ? 'bg-indigo-50/20 hover:bg-indigo-50/30' : 'hover:bg-slate-50/60 opacity-60'
                          }`}
                        >
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => toggleRowSelected(row.id)}
                              className="w-4 h-4 rounded text-[#4f46e5] focus:ring-[#4f46e5] border-slate-300 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">
                            <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
                              {row.section}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-800">
                            <div>{row.itemName}</div>
                            {row.notes && (
                              <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                                {row.notes}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            {row.status === 'add' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                + New Item
                              </span>
                            )}
                            {row.status === 'revise_qty' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                ✎ Qty Change
                              </span>
                            )}
                            {row.status === 'revise_rate' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                                ⚡ Rate Change
                              </span>
                            )}
                            {row.status === 'replace' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                ⇄ Replaced
                              </span>
                            )}
                            {row.status === 'remove' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                ⛔ Removed
                              </span>
                            )}
                            {row.status === 'unchanged' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                                − Unchanged
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap font-medium text-slate-500">
                            {row.baselineQty > 0 ? (
                              <div>
                                {row.baselineQty} {row.unit} @ {formatINR(row.baselineRate)}
                                <div className="text-[11px] font-bold text-slate-700">
                                  {formatINR(row.baselineTotal)}
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap font-semibold text-slate-800">
                            {row.revisedQty > 0 ? (
                              <div>
                                {row.revisedQty} {row.unit} @ {formatINR(row.revisedRate)}
                                <div className="text-[11px] font-bold text-[#4f46e5]">
                                  {formatINR(row.revisedTotal)}
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right whitespace-nowrap font-extrabold ${
                              row.deltaTotal > 0
                                ? 'text-amber-700'
                                : row.deltaTotal < 0
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {row.deltaTotal === 0
                              ? '₹0'
                              : `${row.deltaTotal > 0 ? '+' : ''}${formatINR(row.deltaTotal)}`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Item Bank Sync Option */}
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="registerBankCheck"
                    checked={registerInBank}
                    onChange={(e) => setRegisterInBank(e.target.checked)}
                    className="w-4 h-4 rounded text-[#4f46e5] focus:ring-[#4f46e5] border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="registerBankCheck" className="text-xs font-bold text-slate-800 cursor-pointer">
                    Automatically add newly detected items into the Item Bank for future projects
                  </label>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  {summaryMetrics.addedCount + summaryMetrics.replacedCount} candidate items
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-200/90 bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            {step === 'mapping' && (
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
              >
                Back to Upload
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={() => setStep('mapping')}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
              >
                Back to Column Mapping
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleModalClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>

            {step === 'mapping' && (
              <button
                onClick={handleProcessAndCompare}
                className="px-5 py-2.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5"
              >
                <span>Compare with Active BOQ</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 'review' && (
              <button
                onClick={handleApplyFinal}
                disabled={summaryMetrics.selectedCount === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center gap-2 ${
                  summaryMetrics.selectedCount > 0
                    ? 'bg-[#4f46e5] hover:bg-[#4338ca] text-white'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Apply {summaryMetrics.selectedCount} Revisions to Studio</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
