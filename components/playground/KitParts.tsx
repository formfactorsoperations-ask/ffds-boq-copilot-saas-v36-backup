import React from 'react';
import { Boxes, HardHat, Check, X } from 'lucide-react';
import { Button, LABEL } from '../ui/kit';
import type { BoqItem, Item, Room } from '../../types';
import { kitRows, rowOn, kitHasCivil, kitItemNames, kitCandidates, kitKind, type Kit } from '../../lib/playground/kits';
import { civilDims } from '../../lib/playground/civil';
import { ftin } from '../../lib/playground/geometry';
import { inr, lakh } from './playgroundUi';

/*
  Room kits (BOQ Playground PR K, as in the approved mockup).

  KitLibrary   the library's Kits tab: each kit from the Item Bank's bundles, to
               drag onto a room on the plan or a room card, or Apply
  KitModal     the preview: the rooms it lands in, each room's lines sized from
               it, what the room already has unticked; Add N lines
*/

/** The text a dragged kit carries: the plan and the room cards tell it from an item by this. */
export const KIT_DRAG = 'kit:';
/** The drag's own type, readable while it is over the plan (the text is not, until the drop). */
export const KIT_TYPE = 'application/x-room-kit';

export function KitLibrary({ kits, bankMap, readOnly, hideFigures, estimate, onApply }: {
  kits: Kit[];
  bankMap: Map<string, Item>;
  readOnly: boolean;
  hideFigures: boolean;
  /** What the kit comes to in a room of its kind, and that room's name. */
  estimate: (k: Kit) => { room: string; amount: number } | null;
  onApply: (kitId: string) => void;
}) {
  return (
    <div className="hud-swap flex-1 overflow-auto p-3 space-y-2">
      {kits.map((k, i) => {
        const civ = kitHasCivil(k, bankMap);
        const Icon = civ ? HardHat : Boxes;
        const est = hideFigures ? null : estimate(k);
        return (
          <div key={k.id} draggable={!readOnly} data-kit={k.id}
            onDragStart={e => { e.dataTransfer.setData('text/plain', `${KIT_DRAG}${k.id}`); e.dataTransfer.setData(KIT_TYPE, k.id); e.dataTransfer.effectAllowed = 'copy'; }}
            className={`group hud-row-in rounded-xl border border-slate-200 bg-white p-2.5 transition-[box-shadow,border-color,scale] duration-200 ease-out ${readOnly ? '' : 'phd-lift cursor-grab active:cursor-grabbing hover:border-[#3D52A0]/40 hover:shadow-md motion-safe:active:scale-[0.98]'}`}
            style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}>
            <div className="flex items-start gap-2">
              <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 transition-transform duration-300 motion-safe:group-hover:-rotate-6 motion-safe:group-hover:scale-110 ${civ ? 'bg-amber-50 text-amber-700' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}><Icon className="w-4 h-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 leading-tight">{k.name}</div>
                <div className="text-[10px] text-slate-500">{k.items.length} item{k.items.length === 1 ? '' : 's'} · {kitKind(k, bankMap)}</div>
              </div>
            </div>
            <div className="mt-1.5 text-[10px] text-slate-500 leading-snug line-clamp-2">{kitItemNames(k, bankMap).join(' · ')}</div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-slate-500 tabular-nums truncate">{est && est.amount > 0 ? `≈ ${lakh(est.amount)} in the ${est.room}` : ''}</span>
              {!readOnly && (
                <button type="button" onClick={() => onApply(k.id)} aria-label={`Apply ${k.name}`}
                  className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold bg-[#3D52A0] text-white hover:bg-[#334486] transition-all duration-150 motion-safe:hover:scale-105 motion-safe:active:scale-95">Apply</button>
              )}
            </div>
          </div>
        );
      })}
      {kits.length === 0 && <p className="text-xs text-slate-500 px-1">No bundles in the Item Bank yet.</p>}
      <p className="text-[11px] text-slate-500 px-1">Built a room you like? Select it and choose Save this room as a kit.</p>
    </div>
  );
}

const NO_ID = () => 'preview';

export function KitModal({ kit, rooms, picked, off, boq, bankMap, amount, hideFigures, addsDebris, onRoom, onTick, onClose, onApply }: {
  kit: Kit;
  rooms: Room[];
  picked: string[];
  off: Record<string, boolean>;
  boq: BoqItem[];
  bankMap: Map<string, Item>;
  /** A line's client amount. */
  amount: (l: BoqItem) => number;
  hideFigures: boolean;
  /** Applying it brings debris removal in, once across the flat. */
  addsDebris: boolean;
  onRoom: (name: string) => void;
  onTick: (key: string, on: boolean) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const civ = kitHasCivil(kit, bankMap);
  const Icon = civ ? HardHat : Boxes;
  const cand = kitCandidates(kit, rooms, picked);
  let count = 0, sum = 0;
  const blocks = picked.map(name => rooms.find(r => r.name === name)).filter((r): r is Room => !!r).map(room => {
    const { rows } = kitRows(kit, room, { boq, bankMap, newId: NO_ID });
    const d = civilDims(room);
    return { room, d, rows: rows.map(r => { const on = rowOn(r, off); const a = amount(r.line); if (on) { count++; sum += a; } return { r, on, a }; }) };
  });
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-4 phd-scrim" style={{ background: 'rgba(15,23,42,.45)' }} role="dialog" aria-modal="true" aria-label="Apply a room kit">
      <div className="phd-pop w-full max-w-[620px] max-h-[88vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start gap-3">
          <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${civ ? 'bg-amber-50 text-amber-700' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}><Icon className="w-5 h-5" aria-hidden /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Room kit · Item Bank → {kit.source}</div>
            <h2 className="text-lg font-bold text-slate-800">{kit.name}</h2>
            <p className="text-xs text-slate-500">Every line is sized from the room it lands in: civil from the floor and walls, carpentry placed on a free wall. Untick what this client doesn’t need.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>
        <div className="px-5 pt-3 flex flex-wrap items-center gap-1.5">
          <span className={`${LABEL} mr-1`}>Rooms</span>
          {cand.map(r => {
            const on = picked.includes(r.name);
            return (
              <button key={r.name} type="button" aria-pressed={on} onClick={() => onRoom(r.name)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${on ? 'bg-[#3D52A0] text-white border-transparent' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{r.name}</button>
            );
          })}
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-3">
          {blocks.map(({ room, d, rows }) => (
            <div key={room.name} className="rounded-xl border border-slate-200 overflow-hidden" role="group" aria-label={room.name}>
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex justify-between gap-2 text-xs">
                <b className="text-slate-800">{room.name}</b>
                <span className="text-slate-500">{d ? `${ftin(d.w)} × ${ftin(d.h)} · ${ftin(d.height)} high` : ''}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {rows.map(({ r, on, a }) => (
                  <label key={r.key} className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50 ${on ? '' : 'opacity-60'}`}>
                    <input type="checkbox" checked={on} onChange={e => onTick(r.key, e.target.checked)} aria-label={`${r.item.name} in ${room.name}`} className="w-3.5 h-3.5 accent-[#3D52A0]" />
                    <span className="flex-1 min-w-0">
                      <b className="block font-semibold text-slate-800 truncate">{r.item.name}</b>
                      <span className={`block text-[10px] ${r.dup ? 'text-amber-700' : 'text-slate-500'}`}>{r.why}</span>
                    </span>
                    <span className="tabular-nums text-slate-600 whitespace-nowrap">{r.qty.toLocaleString('en-IN')} {r.unit}</span>
                    {!hideFigures && <b className="tabular-nums w-20 text-right">{inr(a)}</b>}
                  </label>
                ))}
                {rows.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">None of this kit’s items is in the Item Bank any more.</p>}
              </div>
            </div>
          ))}
          {blocks.length === 0 && <p className="text-sm text-slate-500">Pick a room above.</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500 flex-1">
            {count} line{count === 1 ? '' : 's'}{!hideFigures && <> · <b className="text-slate-800 tabular-nums">{inr(sum)}</b></>}{addsDebris && count > 0 ? ' · debris removal added once' : ''}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!count} onClick={onApply}>Add {count} line{count === 1 ? '' : 's'}</Button>
        </div>
      </div>
    </div>
  );
}
