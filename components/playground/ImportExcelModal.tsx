import React, { useMemo, useRef, useState } from 'react';
import { Upload, X, Check, Table2, FileText, AlertTriangle } from 'lucide-react';
import { Button, Chip, LABEL, type Tone } from '../ui/kit';
import type { BoqItem, Item } from '../../types';
import {
  readStudio, studioDiff, applyStudio, readVendor, importPlan, importLines, lineIdAt,
  type ExcelContext, type StudioChange, type StudioMeta, type VendorRow, type Grid, type ChangeKind,
} from '../../lib/playground/excel';
import { readBook } from '../../lib/playground/excelBook';
import { marginFloorFor, type MarginFloors } from '../../lib/playground/issues';
import { inr } from './playgroundUi';

/*
  Import Excel (BOQ Playground PR 6, the approved mockup's dialog).

  First, what the sheet is: a studio copy exported from this Playground and
  edited in Excel, or any other sheet (an old BOQ, a vendor quote, a client's
  list). A studio copy is read by its Line IDs: changed, new and missing rows,
  each priced, applied in one undo. Any other sheet is read as today's Excel
  import reads it, and each row is shown where it lands and how it is priced.
  Nothing is written until Apply or Add, and nothing goes into the Item Bank
  unless the Owner ticks it.
*/

type Step =
  | { k: 'pick' }
  | { k: 'studio'; file: string; meta: StudioMeta; changes: StudioChange[]; unchanged: number; changedSince: boolean }
  | { k: 'other'; file: string; rows: VendorRow[]; matched: [string, string][]; sheets: number };

const GROUPS: [ChangeKind, string, Tone, string | null][] = [
  ['chg', 'Changed', 'warn', null],
  ['new', 'New', 'good', 'A row with no Line ID is a new line. Matched by name to the Item Bank, so it takes the bank’s cost and material specs.'],
  ['del', 'Missing from the sheet', 'bad', 'A deleted row is never removed on its own. Tick it to delete the line.'],
];
const money = (d: number) => (Math.abs(d) < 1 ? '₹0' : `${d > 0 ? '+' : '−'}${inr(Math.abs(d))}`);

export default function ImportExcelModal({ project, option, tierId, boq, ctx, bank, floors, isOwner, seesMargins, newId, onApply, onAdd, onClose }: {
  project: string;
  option: string;
  tierId: string;
  boq: BoqItem[];
  ctx: ExcelContext;
  bank: Item[];
  floors?: MarginFloors | null;
  /** The Owner may add a row's item to the Item Bank. */
  isOwner: boolean;
  /** Costs, markups and margins are shown. */
  seesMargins: boolean;
  newId: () => string;
  /** A studio copy's picked changes: the whole BOQ after, as one write. */
  onApply: (next: BoqItem[], msg: string) => void;
  /** Another sheet's rows: the lines to add, the Item Bank items the Owner ticked, and each line's rate in the sheet. */
  onAdd: (lines: BoqItem[], items: Item[], msg: string, rates: (number | undefined)[]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ k: 'pick' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [fallback, setFallback] = useState<string>(ctx.rooms?.[0]?.name || '');
  const [costs, setCosts] = useState<Record<number, number>>({});
  const [toBank, setToBank] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement | null>(null);
  const want = useRef<'studio' | 'other' | null>(null);

  const read = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const book = await readBook(await file.arrayBuffer());
      const studio = readStudio(book);
      if (studio && want.current !== 'other') {
        const d = studioDiff(studio, boq, { ...ctx, bank, newId });
        setSel(new Set(d.changes.map((c, i) => (c.kind === 'del' ? -1 : i)).filter(i => i >= 0)));
        setStep({ k: 'studio', file: file.name, meta: studio.meta, ...d });
        return;
      }
      const names = Object.keys(book);
      const first = names.find(n => readVendor(book[n] as Grid).rows.length) || names[0];
      const v = readVendor((book[first] || []) as Grid);
      if (!v.rows.length) { setErr('No item column was found in this sheet. The first rows need a heading such as Item, Description or Particulars.'); return; }
      if (want.current === 'studio' && !studio) setErr('This is not a studio copy exported from the Playground, so it is read as any other sheet.');
      setCosts({}); setToBank(new Set());
      setStep({ k: 'other', file: file.name, rows: v.rows, matched: v.matched, sheets: names.length });
    } catch (e: any) {
      setErr(`The file could not be read: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const choose = (k: 'studio' | 'other' | null) => { want.current = k; fileRef.current?.click(); };

  const plan = useMemo(() => (step.k === 'other'
    ? importPlan(step.rows, { bank, bankMap: ctx.bankMap, rooms: ctx.rooms || [], boq, newId: () => 'tmp', floors, fallbackRoom: fallback || null, costs })
    : []), [step, bank, ctx, boq, floors, fallback, costs]);

  const wrap = (title: string, sub: string, body: React.ReactNode, foot?: React.ReactNode) => (
    <div className="fixed inset-0 z-[300] grid place-items-center p-4">
      <div onClick={onClose} className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" />
      <section className="relative w-full max-w-[880px] max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl phd-pop" role="dialog" aria-modal="true" aria-labelledby="imt"
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Upload className="w-4 h-4" aria-hidden /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Import Excel</div>
            <h2 id="imt" className="text-lg font-bold text-slate-800 truncate">{title}</h2>
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {err && <p role="alert" className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 inline-flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />{err}</p>}
          {body}
        </div>
        {foot && <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 justify-end flex-wrap rounded-b-3xl">{foot}</div>}
      </section>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" aria-label="Excel file" onChange={e => { const f = e.target.files?.[0]; if (f) read(f); }} />
    </div>
  );

  if (step.k === 'pick') {
    return wrap('What are you bringing in?', 'Choose the kind of sheet, then the file. A studio copy is recognised on its own.', (
      <>
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['studio', Table2, 'A studio copy, edited in Excel', 'Exported from this Playground. Rows keep their Line ID, so each row updates its own line. You see every change before it is saved.'],
            ['other', FileText, 'Any other sheet', 'An old BOQ, a vendor quote or a client’s list. Columns are matched as today, then you see where every row lands and how it is priced.'],
          ] as ['studio' | 'other', React.ElementType, string, string][]).map(([k, I, t, sub]) => (
            <button key={k} type="button" disabled={busy} onClick={() => choose(k)} className="text-left rounded-2xl border border-slate-200 p-4 hover:border-[#3D52A0]/40 hover:shadow-md transition-shadow disabled:opacity-50">
              <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><I className="w-4 h-4" aria-hidden /></span>
              <div className="mt-3 font-bold text-slate-800">{t}</div>
              <p className="text-xs text-slate-500 mt-1">{sub}</p>
              <div className="mt-3 text-xs font-bold text-[#3D52A0]">Choose the file →</div>
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 p-5 text-center text-xs text-slate-500"
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { want.current = null; read(f); } }}>
          <Upload className="w-4 h-4 inline -mt-0.5" aria-hidden /> {busy ? 'Reading the sheet…' : <>Drop an .xlsx here, or <button type="button" onClick={() => choose(null)} className="font-bold text-[#3D52A0] hover:underline">choose a file</button>. Nothing is saved until you apply it.</>}
        </div>
      </>
    ));
  }

  if (step.k === 'studio') {
    const { changes, meta } = step;
    const total = changes.reduce((a, c, i) => a + (sel.has(i) ? c.delta : 0), 0);
    const when = meta.exportedAt ? new Date(meta.exportedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const other = meta.tierId && meta.tierId !== tierId;
    const ids = new Map(boq.filter(l => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted').map((l, i) => [l.id, lineIdAt(i)]));
    const sub = `Belongs to ${meta.project || project} · ${meta.option || option}${when ? ` · exported ${when}` : ''} · ${step.changedSince ? 'the BOQ has changed since: each row is read against today’s' : 'the BOQ has not changed since'}`;
    const toggle = (i: number) => setSel(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
    return wrap(step.file, sub, (
      <>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2 mb-4">
          <Check className="w-3.5 h-3.5" aria-hidden />A studio copy, read by its Line IDs. {step.unchanged} rows are unchanged and left alone.
        </div>
        {other && <p className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">It was exported from {meta.option}; it is read against {option}.</p>}
        {!changes.length && <p className="text-sm text-slate-600">Nothing in the sheet differs from the BOQ.</p>}
        {GROUPS.map(([k, title, tone, note]) => {
          const rs = changes.map((c, i) => [c, i] as const).filter(([c]) => c.kind === k);
          if (!rs.length) return null;
          return (
            <div key={k} className="mb-4">
              <div className="flex items-center gap-2 mb-2"><Chip tone={tone}>{title}</Chip><span className="text-xs text-slate-500">{rs.length}</span></div>
              <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {rs.map(([c, i]) => (
                  <label key={i} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={sel.has(i)} onChange={() => toggle(i)} className="w-4 h-4 accent-[#3D52A0]" aria-label={`${c.name}: ${c.what}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">{c.name} <span className="text-xs font-normal text-slate-500">· {c.room}{c.id && ids.get(c.id) ? ` · ${ids.get(c.id)}` : ''}</span></span>
                      <span className="block text-xs text-slate-500">{c.what}</span>
                    </span>
                    <b className={`text-sm tabular-nums ${c.delta > 0.5 ? 'text-rose-600' : c.delta < -0.5 ? 'text-emerald-600' : 'text-slate-400'}`}>{money(c.delta)}</b>
                  </label>
                ))}
              </div>
              {note && <p className="text-[11px] text-slate-500 mt-1.5">{note}</p>}
            </div>
          );
        })}
      </>
    ), (
      <>
        <span className="mr-auto text-xs text-slate-600">Total moves by <b className="tabular-nums">{total >= 0 ? '+' : '−'}{inr(Math.abs(total))}</b> · one undo step</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={Check} disabled={!sel.size} onClick={() => {
          const n = sel.size;
          onApply(applyStudio(boq, changes, sel), `${n} change${n === 1 ? '' : 's'} from ${step.file} applied. Undo puts the BOQ back.`);
        }}>Apply changes</Button>
      </>
    ));
  }

  /* Any other sheet. */
  const needsRoom = plan.some(p => p.lands === 'room');
  return wrap(step.file, `Sheet 1 of ${step.sheets} · ${step.rows.length} priced rows · read like today’s Excel import, then placed`, (
    <>
      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 mb-4">
        Columns matched as today: {step.matched.map(([h, k], i) => <React.Fragment key={h}>{i ? ', ' : ''}<b>{h}</b>{h.toLowerCase() === k.toLowerCase() ? '' : ` → ${k}`}</React.Fragment>)}. Sizes in the item name (“6 x 2 ft”) are read as width × height.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 760 }}>
          <thead><tr className={`${LABEL} text-left`}><th className="py-2 pr-2">In the sheet</th><th className="py-2 px-2">Becomes</th><th className="py-2 px-2">Lands</th><th className="py-2 pl-2">Price</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {plan.map((p, i) => {
              const unit = p.item?.unit || (p.line as any).unit || '';
              const rate = p.row.rate ?? p.cost * (1 + p.markup / 100);
              return (
                <tr key={i} className="align-top">
                  <td className="py-2.5 pr-2">
                    <div className="font-semibold text-slate-800">{p.row.sheet}</div>
                    <div className="text-[11px] text-slate-500">{p.row.room || 'No location'} · {p.row.size ? `${p.row.size.w} × ${p.row.size.h} ft` : `${p.row.qty ?? 1} ${p.row.unit || unit}`}</div>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="font-semibold text-slate-800">{p.item?.name || (p.line as any).name}</div>
                    <div className="mt-0.5">{p.item ? <Chip tone="brand">Item Bank · with its specs</Chip> : <Chip tone="warn">Not in the Item Bank</Chip>}</div>
                    {!p.item && (
                      <label className={`mt-1 flex items-center gap-1.5 text-[11px] ${isOwner ? 'text-slate-600' : 'text-slate-400'}`} title={isOwner ? undefined : 'Only the Owner adds to the Item Bank'}>
                        <input type="checkbox" disabled={!isOwner} checked={toBank.has(i)} onChange={() => setToBank(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="w-3.5 h-3.5 accent-[#3D52A0]" />
                        Add to the Item Bank (Owner)
                      </label>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {p.lands === 'plan' && <><Chip tone="good">On the plan</Chip><div className="text-[11px] text-slate-500 mt-0.5">{p.room}, on a free wall</div></>}
                    {p.lands === 'waits' && <><Chip tone="slate">Room list</Chip><div className="text-[11px] text-slate-500 mt-0.5">{p.room} · no free wall, waits under Needs a place</div></>}
                    {p.lands === 'list' && <><Chip tone="slate">Room list</Chip><div className="text-[11px] text-slate-500 mt-0.5">{p.room}</div></>}
                    {p.lands === 'room' && (
                      <>
                        <Chip tone="warn">Needs a room</Chip>
                        <select aria-label={`Room for ${p.row.sheet}`} value={fallback} onChange={e => setFallback(e.target.value)}
                          className="mt-1 block w-full px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold">
                          {(ctx.rooms || []).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                        </select>
                      </>
                    )}
                  </td>
                  <td className="py-2.5 pl-2">
                    <div className="text-xs"><b className="tabular-nums">{inr(rate)}</b> <span className="text-slate-500">/{unit} {p.row.rate !== undefined ? 'in the sheet' : 'from the bank'}</span></div>
                    {seesMargins && (p.item ? (
                      <>
                        <div className="text-[11px] text-slate-500">Bank cost {inr(p.cost)} → markup <b>{p.markup.toFixed(1)}%</b> meets it</div>
                        <div className={`text-[11px] font-bold ${p.underFloor ? 'text-rose-600' : 'text-emerald-600'}`}>{p.margin.toFixed(1)}% margin{p.underFloor ? ' · under your floor' : ''}</div>
                      </>
                    ) : (
                      <>
                        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">Cost
                          <input aria-label={`Cost of ${p.row.sheet}`} inputMode="decimal" value={costs[i] ?? p.cost} onChange={e => { const v = Number(e.target.value.replace(/[₹,\s]/g, '')); setCosts(c => ({ ...c, [i]: Number.isFinite(v) ? v : 0 })); }}
                            className="w-20 px-1.5 py-0.5 rounded-md border border-slate-300 text-xs font-bold tabular-nums" />
                          <span>{p.margin.toFixed(0)}% margin</span>
                        </label>
                        {costs[i] === undefined && <div className="text-[11px] text-slate-400">Starts at 20% margin; type the real cost</div>}
                      </>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-3">Nothing is written to the Item Bank unless you tick it. Lines not in the bank say so in the Live BOQ until they are added.{needsRoom ? ' Rows with no room the project has go to the room picked under Needs a room.' : ''}</p>
      {seesMargins && plan.some(p => p.underFloor) && <p className="text-[11px] text-rose-600 mt-1">Floor: {marginFloorFor(undefined, floors)}% margin.</p>}
    </>
  ), (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" icon={Check} disabled={!plan.length} onClick={() => {
        const { lines, items } = importLines(plan, toBank, newId);
        const fresh = lines.map(l => ({ ...l, id: newId() }));
        onAdd(fresh, items, `${fresh.length} line${fresh.length === 1 ? '' : 's'} added from ${step.file}${items.length ? `, ${items.length} added to the Item Bank` : ''}. Undo takes them out.`, plan.map(p => (p.item ? p.row.rate : undefined)));
      }}>Add {plan.length} lines</Button>
    </>
  ));
}
