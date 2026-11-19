import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { Chip } from '../ui/kit';
import type { BoqItem, Room } from '../../types';
import { SCOPE_BUCKETS } from '../../lib/scopeBuckets';
import { round2 } from '../../lib/playground/geometry';
import { PieceThumb } from './pieceArt';
import { inr, marginTone, Scrub, withCost, withMarkup, withRate, type LineModel } from './playgroundUi';
import type { ShareRow } from './LiveBoq';
import { currentVersion, type MaterialSpecsBank } from '../../lib/materialSpecs';

/*
  The Sheet lens (was Excel): every line in a grid, grouped by room, each with
  its picture, the words the client reads, and its numbers. Drag a number
  sideways to change it (Shift for fine steps) or click it to type. Pick lines
  to change their markup together, mark them bought by the client, or delete
  them. A whole-flat line opens out into its rooms.
*/

const STATUS_CHIP: Record<string, [string, 'warn' | 'slate' | 'good']> = {
  client_procured: ['By client', 'slate'],
  excluded: ['Excluded', 'slate'],
  provisional_sum: ['Provisional', 'warn'],
  pending_finalisation: ['To confirm', 'warn'],
};

export default function SheetLens({ rooms, models, shares, roomTotals, sel, readOnly, seesMargins, hideFigures, floor, query, onSel, onReplace, onReplaceMany, onDelete, onFullGrid, specBank, onUpdateLines }: {
  rooms: Room[];
  models: LineModel[];
  shares: Map<string, ShareRow[]>;
  roomTotals: Map<string, number>;
  sel: string | null;
  readOnly: boolean;
  seesMargins: boolean;
  hideFigures: boolean;
  floor: number;
  query: (m: LineModel) => boolean;
  onSel: (id: string) => void;
  onReplace: (line: BoqItem) => void;
  onReplaceMany: (lines: BoqItem[]) => void;
  onDelete: (ids: string[]) => void;
  /** Opens the full grid (statuses, linkage, notes, labour), as the Excel view had it. */
  onFullGrid?: () => void;
  /** The Material specs bank (S2): each line's parts as chips. */
  specBank?: MaterialSpecsBank | null;
  /** Takes these lines to the current versions of their materials. */
  onUpdateLines?: (ids: string[]) => void;
}) {
  /* The mockup's spec chips: the first three parts, their material and version, amber when a newer one is out. */
  const specChips = (m: LineModel) => {
    const ms = m.line.materialSpecs;
    if (!specBank || !ms || !Object.keys(ms).length) {
      const imported = /imported via excel/i.test(m.words);
      return <span className={`text-[10px] font-bold ${imported ? 'text-amber-700' : 'text-slate-400'}`}>{imported ? 'No spec words' : 'Typed by hand'}</span>;
    }
    return Object.entries(ms).slice(0, 3).map(([part, sp]) => {
      const mat = specBank.materials.find(x => x.id === sp.id);
      const old = m.stale.includes(part);
      return (
        <span key={part} title={`${part}: ${mat?.name || sp.id}`} className={`inline-flex items-center gap-1 mr-1 mb-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${old ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
          {mat?.swatch && <svg viewBox="0 0 3 3" className="w-2.5 h-2.5 rounded-full border border-slate-300" aria-hidden><rect width="3" height="3" fill={`url(#${mat.swatch})`} /></svg>}
          {(mat?.name || sp.id).split(/[ ,]/)[0]} v{sp.v}{old ? `→${currentVersion(specBank, sp.id)?.v}` : ''}
        </span>
      );
    });
  };
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const money = seesMargins && !hideFigures;
  const showAmount = !hideFigures;
  const N = 4 + (money ? 3 : 0) - (showAmount ? 0 : 1);
  const realNames = rooms.map(r => r.name);
  const order = [...realNames, ...SCOPE_BUCKETS, ...models.map(m => m.room)].filter((n, i, a) => a.indexOf(n) === i);
  const groups = order.map(name => ({ name, ms: models.filter(m => m.room === name && query(m)) })).filter(g => g.ms.length);
  const toggle = (set: Set<string>, id: string, on?: boolean) => { const s = new Set(set); (on ?? !s.has(id)) ? s.add(id) : s.delete(id); return s; };
  const picked = models.filter(m => picks.has(m.line.id));
  const total = models.filter(m => m.billable && !m.separate).reduce((a, m) => a + m.amount, 0);

  const th = 'px-2 py-2 bg-white sticky top-0 z-[2]';
  const row = (m: LineModel) => {
    const l = m.line;
    const typed = !l.byRoom && !(m.size && l.place && /sq|r\s*ft|rft|running/i.test(m.unit));
    const st = STATUS_CHIP[String(l.boqStatus || '')];
    const from = l.byRoom ? ' · by room' : !typed ? ' · from size' : '';
    const isOpen = open.has(l.id);
    return (
      <React.Fragment key={l.id}>
        <tr onClick={() => onSel(l.id)} className={`border-t border-slate-100 cursor-pointer ${sel === l.id ? 'bg-[#3D52A0]/[0.07]' : 'bg-white hover:bg-slate-50'}`}>
          <td className="px-2" onClick={e => e.stopPropagation()}>
            <input type="checkbox" checked={picks.has(l.id)} disabled={readOnly} onChange={() => setPicks(p => toggle(p, l.id))} aria-label={`Pick ${m.name}`} className="w-4 h-4 accent-[#3D52A0]" />
          </td>
          <td className="px-2 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-9 h-7 shrink-0">
                {m.draw && m.size ? <PieceThumb kind={m.draw.kind} w={m.size.w} d={m.size.d} words={m.words} {...m.art} className="w-9 h-7" /> : <span className="w-9 h-7 grid place-items-center text-slate-300"><Layers className="w-3.5 h-3.5" aria-hidden /></span>}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{m.name}{st && <> <span className="align-middle"><Chip tone={st[1]}>{st[0]}</Chip></span></>}</div>
                <div className="text-[11px] text-slate-500 truncate">{m.words || 'No words yet'}</div>
                {specBank && <div className="mt-1 leading-none">{specChips(m)}</div>}
                {l.byRoom && (
                  <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => toggle(o, l.id)); }} className="mt-1 text-[11px] font-bold text-[#3D52A0] hover:underline">
                    {isOpen ? 'Hide' : 'Show'} the rooms
                  </button>
                )}
              </div>
            </div>
          </td>
          <td className="px-2 text-right" onClick={e => typed && e.stopPropagation()}>
            {typed && !readOnly
              ? <Scrub variant="cell" label={`${m.name} quantity`} value={m.qty} step={1} pxPerStep={8} format={v => v.toLocaleString('en-IN')} onCommit={v => onReplace({ ...l, qty: v })} />
              : <span className="text-sm font-bold text-slate-800 tabular-nums">{m.qty.toLocaleString('en-IN')}</span>}
            <div className="text-[10px] text-slate-400 -mt-0.5">{m.unit}{from}</div>
          </td>
          {money && <>
            <td className="px-1" onClick={e => e.stopPropagation()}><Scrub variant="cell" label={`${m.name} cost`} value={m.cost} step={10} pxPerStep={2} format={inr} disabled={readOnly} onCommit={v => onReplace(withCost(m, v))} /></td>
            <td className="px-1" onClick={e => e.stopPropagation()}>
              <Scrub variant="cell" label={`${m.name} markup`} value={m.markup} step={0.5} pxPerStep={4} max={400} format={v => `${v.toFixed(1)}%`} disabled={readOnly} onCommit={v => onReplace(withMarkup(m, v))} />
              <div className={`text-[10px] font-bold text-right pr-1.5 -mt-0.5 ${marginTone(m.margin, floor)}`}>{m.margin.toFixed(1)}% GM</div>
            </td>
            <td className="px-1" onClick={e => e.stopPropagation()}><Scrub variant="cell" label={`${m.name} rate`} value={m.rate} step={10} pxPerStep={2} format={inr} disabled={readOnly} onCommit={v => onReplace(withRate(m, v))} /></td>
          </>}
          {showAmount && <td className={`px-2 text-right text-sm font-black tabular-nums ${m.billable && !m.separate ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{inr(m.amount)}</td>}
        </tr>
        {l.byRoom && isOpen && rooms.map(r => {
          const s = (shares.get(r.name) || []).find(x => x.model.line.id === l.id);
          return (
            <tr key={`${l.id}-${r.name}`} className="bg-slate-50/80 text-xs border-t border-slate-100">
              <td />
              <td className={`pl-12 pr-2 py-1 ${s ? 'text-slate-600' : 'text-slate-400'}`}>{r.name}{s ? '' : ' · left out'}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s ? round2(s.qty) : '—'}</td>
              {money && <><td /><td /><td /></>}
              {showAmount && <td className={`px-2 text-right tabular-nums font-bold ${s ? 'text-slate-700' : 'text-slate-300'}`}>{s ? inr(s.amount) : '—'}</td>}
            </tr>
          );
        })}
      </React.Fragment>
    );
  };

  return (
    <div className="p-3">
      <div className="rounded-2xl bg-white border border-slate-200 overflow-x-auto">
        <table className="w-full" style={{ tableLayout: 'fixed', minWidth: 36 + 92 + (money ? 268 : 0) + 100 + 250 }}>
          <colgroup>
            <col style={{ width: 36 }} /><col /><col style={{ width: 92 }} />
            {money && <><col style={{ width: 92 }} /><col style={{ width: 84 }} /><col style={{ width: 92 }} /></>}
            {showAmount && <col style={{ width: 100 }} />}
          </colgroup>
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className={th}><span className="sr-only">Pick</span></th>
              <th className={th}>Item · what the client reads</th>
              <th className={`${th} text-right`}>Qty</th>
              {money && <><th className={`${th} text-right`}>Cost ↔</th><th className={`${th} text-right`}>Markup ↔</th><th className={`${th} text-right`}>Rate ↔</th></>}
              {showAmount && <th className={`${th} text-right`}>Amount</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const all = g.ms.every(m => picks.has(m.line.id));
              const gm = g.ms.filter(m => m.billable && !m.separate);
              const gt = roomTotals.get(g.name) ?? gm.reduce((a, m) => a + m.amount, 0);
              const cost = gm.reduce((a, m) => a + m.cost * m.qty, 0), sell = gm.reduce((a, m) => a + m.amount, 0);
              const mg = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
              return (
                <React.Fragment key={g.name}>
                  <tr className="bg-slate-100/90">
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={all} disabled={readOnly} aria-label={`Pick every line in ${g.name}`} className="w-4 h-4 accent-[#3D52A0]"
                        onChange={() => setPicks(p => { let s = p; g.ms.forEach(m => { s = toggle(s, m.line.id, !all); }); return s; })} />
                    </td>
                    <td colSpan={N - 1} className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">{g.name}</span>
                        <span className="text-[11px] text-slate-500">{g.ms.length} line{g.ms.length === 1 ? "" : "s"}</span>
                        {showAmount && <span className="ml-auto text-xs font-black text-slate-800 tabular-nums">{inr(gt)}</span>}
                        {money && <span className={`text-[10px] font-bold ${marginTone(mg, floor)}`}>{mg.toFixed(1)}%</span>}
                      </div>
                    </td>
                  </tr>
                  {g.ms.map(row)}
                </React.Fragment>
              );
            })}
            {groups.length === 0 && <tr><td colSpan={N} className="p-8 text-center text-sm text-slate-500">No line matches.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td />
              <td colSpan={N - 2} className="px-2 py-2 text-xs text-slate-500">
                Drag a number sideways to change it · Shift for fine steps · click it to type
                {onFullGrid && <> · <button type="button" onClick={onFullGrid} className="font-bold text-[#3D52A0] hover:underline">Open the full grid</button> for status, linkage and notes</>}
              </td>
              <td className="px-2 py-2 text-right text-sm font-black tabular-nums">{showAmount ? inr(total) : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {picks.size > 0 && !readOnly && (
        <div className="sticky bottom-0 z-[3] mt-3 rounded-2xl bg-slate-800 text-white shadow-2xl px-3 py-2 flex items-center gap-2 flex-wrap hud-panel-in">
          <b className="text-xs">{picks.size} picked</b>
          {money && <>
            <button type="button" onClick={() => onReplaceMany(picked.map(m => withMarkup(m, Math.max(0, m.markup - 1))))} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold">Markup −1%</button>
            <button type="button" onClick={() => onReplaceMany(picked.map(m => withMarkup(m, m.markup + 1)))} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold">Markup +1%</button>
          </>}
          {onUpdateLines && <button type="button" onClick={() => onUpdateLines(picked.map(m => m.line.id))} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold">Update specs</button>}
          <button type="button" onClick={() => onReplaceMany(picked.map(m => ({ ...m.line, boqStatus: 'client_procured' } as BoqItem)))} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold">Client procured</button>
          <button type="button" onClick={() => { onDelete([...picks]); setPicks(new Set()); }} className="px-2 py-1 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-xs font-bold">Delete</button>
          <button type="button" onClick={() => setPicks(new Set())} className="ml-auto text-xs font-bold text-white/70 hover:text-white">Clear</button>
        </div>
      )}
    </div>
  );
}
