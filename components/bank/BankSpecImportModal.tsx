import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Download, FileSpreadsheet, X } from '@/lib/lucide-shim';
import { Item } from '../../types';
import {
  BANK_BYTES_LIMIT, SpecMatch, SpecSheetRow, applySpecs, bankBytes, matchSpecRows, parseSpecSheet, specUpdates,
} from '../../lib/bankSpecs';
import { isPlaceholderText } from '../../lib/detailedBoq';
import '../projectHeader/projectHeader.css';

interface Props {
  bank: Item[];
  /** Writes the specs into the bank; the bank's own auto-save stores it. */
  onApply: (updates: Map<string, string>) => void;
  /** Downloads the spec sheet to fill in. */
  onExport: () => void;
  onClose: () => void;
}

type Filter = 'attention' | 'update' | 'all';

const STATUS: Record<SpecMatch['status'], { label: string; tone: string }> = {
  update: { label: 'Will update', tone: 'bg-[#3D52A0]/10 text-[#3D52A0]' },
  same: { label: 'Unchanged', tone: 'bg-slate-100 text-slate-600' },
  unmatched: { label: 'No match', tone: 'bg-amber-100 text-amber-700' },
  ambiguous: { label: 'Pick one', tone: 'bg-amber-100 text-amber-700' },
  conflict: { label: 'Same item twice', tone: 'bg-rose-100 text-rose-700' },
  skipped: { label: 'Skipped', tone: 'bg-slate-100 text-slate-600' },
};

const kb = (n: number) => `${Math.round(n / 1000).toLocaleString('en-IN')} KB`;

/**
 * Item Bank → Import specs.
 *
 * Reads the spec sheet back (or any client sheet with a Specification column),
 * ties each row to one bank item, and shows exactly what will change before
 * anything does. Only `specs` is written. A row the studio cannot tie to an
 * item is picked by hand or skipped; nothing is added to the bank.
 */
export default function BankSpecImportModal({ bank, onApply, onExport, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<SpecSheetRow[] | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('attention');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const byId = useMemo(() => new Map(bank.map(i => [i.id, i])), [bank]);
  const sortedBank = useMemo(() => [...bank].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))), [bank]);
  const matches = useMemo(() => (rows ? matchSpecRows(rows, bank, picks) : []), [rows, bank, picks]);
  const updates = useMemo(() => specUpdates(matches), [matches]);
  const count = (s: SpecMatch['status'][]) => matches.filter(m => s.includes(m.status)).length;
  const attention = count(['unmatched', 'ambiguous', 'conflict']);
  const sizeNow = useMemo(() => bankBytes(bank), [bank]);
  const sizeAfter = useMemo(() => (updates.size ? bankBytes(applySpecs(bank, updates)) : sizeNow), [bank, updates, sizeNow]);
  const tooBig = sizeAfter > BANK_BYTES_LIMIT;

  const shown = matches.filter(m =>
    filter === 'all' ? true : filter === 'update' ? m.status === 'update' : ['unmatched', 'ambiguous', 'conflict'].includes(m.status));

  // Land on the list that matters: what needs a decision, else what will change.
  useEffect(() => {
    if (rows) setFilter(attention ? 'attention' : 'update');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const read = async (file: File) => {
    setReading(true);
    setError('');
    setPicks({});
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      /* The sheet with the most specifications: the bank export has one sheet
         of items and a guide; a client BOQ may have several sheets. */
      const parsed = wb.SheetNames.map(n => parseSpecSheet(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }) as any[][]));
      const best = parsed.filter(p => p.rows.length).sort((a, b) => b.rows.length - a.rows.length)[0];
      if (!best) {
        setRows(null);
        setError(parsed[0]?.error || 'No specifications were found in this file.');
      } else {
        setRows(best.rows);
      }
      setFileName(file.name);
    } catch {
      setRows(null);
      setError('This file could not be read. Save it as .xlsx and try again.');
    } finally {
      setReading(false);
    }
  };

  const pick = (key: string, value: string) => setPicks(prev => ({ ...prev, [key]: value }));

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Import specifications">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="p-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Item specs</p>
              <h3 className="font-bold text-slate-800 mt-1">Update specifications from Excel</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">
                Only the specification of each item changes. Rates, margins and internal notes stay as they are, and no item is added.
                Every project that uses an item shows its specification from here.
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" /> {reading ? 'Reading…' : rows ? 'Choose another file' : 'Choose the filled sheet'}
            </button>
            <button
              type="button"
              onClick={onExport}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Download the spec sheet
            </button>
            {fileName && <span className="text-[11px] text-slate-500 truncate max-w-[240px]">{fileName}</span>}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }}
            />
          </div>
          {error && <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}

          {rows && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#3D52A0]/10 text-[#3D52A0]">{updates.size} to update</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">{count(['same'])} unchanged</span>
                {attention > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">{attention} need you</span>}
                {count(['skipped']) > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">{count(['skipped'])} skipped</span>}
              </div>
              <div className="inline-flex p-1 rounded-xl bg-slate-100" role="group" aria-label="Which rows to show">
                {([['attention', `Need you (${attention})`], ['update', `To update (${updates.size})`], ['all', `All (${matches.length})`]] as [Filter, string][]).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFilter(v)}
                    aria-pressed={filter === v}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${filter === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!rows && !error && (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">Download the spec sheet, fill the Specification column, then choose it here.</p>
              <p className="text-xs text-slate-500">A client BOQ with a Specifications column works too: rows are matched to items by name.</p>
            </div>
          )}
          {rows && shown.length === 0 && (
            <p className="p-8 text-center text-xs text-slate-500">
              {filter === 'attention' ? 'Nothing needs you: every row is tied to one item.' : 'No rows here.'}
            </p>
          )}
          <div className="divide-y divide-slate-100">
            {shown.map((m, i) => {
              const item = m.itemId ? byId.get(m.itemId) : undefined;
              const st = STATUS[m.status];
              const needsPick = m.status === 'unmatched' || m.status === 'ambiguous';
              const was = item && !isPlaceholderText(item.specs) ? String(item.specs).split('\n')[0] : '';
              const closest = m.status === 'unmatched' && m.candidates[0] ? byId.get(m.candidates[0]) : undefined;
              return (
                <div key={m.key} className="px-5 py-3 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item?.name || m.row.name}</p>
                      <p className="text-[11px] text-slate-500">
                        Row {m.row.row}
                        {item && item.name !== m.row.name ? ` · the sheet says “${m.row.name}”` : ''}
                        {m.how === 'id' ? ' · matched by item ID' : m.how === 'name' ? ' · matched by name' : m.how === 'picked' ? ' · picked by you' : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${st.tone}`}>{st.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-700 line-clamp-2">{m.row.spec.split('\n')[0]}</p>
                  {m.status === 'update' && <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">{was ? `Was: ${was}` : 'No specification yet'}</p>}
                  {needsPick && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {closest && (
                        <button type="button" onClick={() => pick(m.key, closest.id)} className="px-3 py-2 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] text-xs font-bold hover:bg-[#3D52A0]/15 cursor-pointer">
                          Use “{closest.name}”
                        </button>
                      )}
                      <select
                        value=""
                        onChange={e => e.target.value && pick(m.key, e.target.value)}
                        className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
                        aria-label={`Bank item for row ${m.row.row}`}
                      >
                        <option value="">{m.status === 'ambiguous' ? 'Several items have this name: pick one…' : 'Pick the bank item…'}</option>
                        {m.candidates.length > 0 && (
                          <optgroup label="Closest">
                            {m.candidates.map(id => <option key={id} value={id}>{byId.get(id)?.name} · {byId.get(id)?.cat}</option>)}
                          </optgroup>
                        )}
                        <optgroup label="All items">
                          {sortedBank.map(it => <option key={it.id} value={it.id}>{it.name} · {it.cat}</option>)}
                        </optgroup>
                      </select>
                      <button type="button" onClick={() => pick(m.key, 'skip')} className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer">Skip this row</button>
                    </div>
                  )}
                  {m.status === 'conflict' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-[11px] text-rose-700">Row {m.conflictWith} gives this item a different specification, and is the one used.</p>
                      <button type="button" onClick={() => pick(m.conflictWith!, 'skip')} className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer">Use this row instead</button>
                      <button type="button" onClick={() => pick(m.key, 'skip')} className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer">Skip this row</button>
                    </div>
                  )}
                  {(m.status === 'skipped' || m.how === 'picked') && (
                    <button
                      type="button"
                      onClick={() => setPicks(prev => { const next = { ...prev }; delete next[m.key]; return next; })}
                      className="mt-1 text-[11px] font-bold text-[#3D52A0] hover:text-[#334486] cursor-pointer"
                    >
                      Undo
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-[11px] flex items-center gap-1.5 ${tooBig ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
            {tooBig && <AlertTriangle className="w-3.5 h-3.5" />}
            {tooBig
              ? `The bank would be ${kb(sizeAfter)}, over the ${kb(BANK_BYTES_LIMIT)} it can be saved at. Shorten or split the specs and import fewer at a time.`
              : `Item Bank size ${updates.size ? `after this: ${kb(sizeAfter)}` : kb(sizeNow)} of ${kb(BANK_BYTES_LIMIT)}`}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 cursor-pointer">Cancel</button>
            <button
              type="button"
              onClick={() => onApply(updates)}
              disabled={!updates.size || tooBig}
              className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Update {updates.size} item{updates.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
