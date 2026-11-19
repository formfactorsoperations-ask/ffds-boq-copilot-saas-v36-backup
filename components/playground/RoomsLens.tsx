import React from 'react';
import { Plus, Map as MapIcon, Layers } from 'lucide-react';
import type { BoqItem, Item, Room } from '../../types';
import { SCOPE_BUCKETS } from '../../lib/scopeBuckets';
import { ftin, round2 } from '../../lib/playground/geometry';
import { boardPieces } from '../../lib/playground/pieces';
import { PieceArt, PieceThumb } from './pieceArt';
import { inr, lakh, marginTone, avgMarkup, setAvgMarkup, Scrub, type LineModel } from './playgroundUi';
import type { ShareRow } from './LiveBoq';

/*
  The Rooms lens (was Cards): a card per room with the room drawn small and its
  pieces in it, every line with its picture and amount, the room's share of the
  whole-flat services, the room's markup to drag, and Add. The project's scopes
  (Civil, Functional, Others) follow as cards without a drawing.
*/

export default function RoomsLens({ rooms, models, shares, roomTotals, bankMap, sel, selRoom, readOnly, seesMargins, hideFigures, floor, query, onSel, onRoom, onAdd, onShowOnPlan, onDropItem, onReplaceMany }: {
  rooms: Room[];
  models: LineModel[];
  shares: Map<string, ShareRow[]>;
  roomTotals: Map<string, number>;
  bankMap: Map<string, Item>;
  sel: string | null;
  selRoom: string | null;
  readOnly: boolean;
  seesMargins: boolean;
  hideFigures: boolean;
  floor: number;
  query: (m: LineModel) => boolean;
  onSel: (id: string) => void;
  onRoom: (name: string) => void;
  onAdd: (room: string) => void;
  onShowOnPlan: (room: string) => void;
  onDropItem: (itemId: string, room: string) => void;
  onReplaceMany: (lines: BoqItem[]) => void;
}) {
  const realNames = rooms.map(r => r.name);
  const artOf = (id: string) => models.find(m => m.line.id === id)?.art;
  const others = Array.from(new Set(models.map(m => m.room))).filter(n => !realNames.includes(n) && !SCOPE_BUCKETS.includes(n as any));
  const cards: { name: string; room?: Room }[] = [
    ...rooms.map(r => ({ name: r.name, room: r })),
    ...[...SCOPE_BUCKETS, ...others].filter(n => models.some(m => m.room === n)).map(n => ({ name: n })),
  ];

  return (
    <div className="p-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))' }}>
      {cards.map(({ name, room }, i) => {
        const ms = models.filter(m => m.room === name && !(m.line.byRoom && realNames.length) && !m.separate && query(m));
        const all = models.filter(m => m.room === name && !m.separate);
        const billed = all.filter(m => m.billable && !m.line.byRoom);
        const total = room ? roomTotals.get(name) || 0 : all.filter(m => m.billable).reduce((a, m) => a + m.amount, 0);
        const cost = billed.reduce((a, m) => a + m.cost * m.qty, 0);
        const sell = billed.reduce((a, m) => a + m.amount, 0);
        const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
        const amk = avgMarkup(billed);
        const on = selRoom === name;
        const roomShares = room ? (shares.get(name) || []) : [];
        return (
          <div key={name} data-roomcard={name}
            onDragOver={e => { if (!readOnly) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
            onDrop={e => { e.preventDefault(); if (!readOnly) onDropItem(e.dataTransfer.getData('text/plain'), name); }}
            className={`hud-row-in rounded-2xl bg-white border ${on ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/20' : 'border-slate-200'} overflow-hidden flex flex-col`}
            style={{ animationDelay: `${i * 30}ms` }}>
            {room && (
              <button type="button" onClick={() => onRoom(name)} className="block bg-slate-50 border-b border-slate-100 p-1.5" aria-label={`Open ${name}`}>
                <RoomMini room={room} lines={all.map(m => m.line)} bankMap={bankMap} art={artOf} />
              </button>
            )}
            <div className="px-3 pt-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">{name}</div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  {room?.plan ? `${ftin(room.plan.w)} × ${ftin(room.plan.h)} · ${Math.round(room.plan.w * room.plan.h)} sq ft` : room ? (Number(room.size) ? `${Math.round(Number(room.size))} sq ft` : 'Not on the plan yet') : 'Lines for the whole flat'}
                </div>
              </div>
              <div className="text-right shrink-0">
                {!all.length && !total ? <div className="text-sm font-bold text-slate-400">Empty</div> : <>
                  {!hideFigures && <div className="text-base font-black tabular-nums leading-tight">{inr(total)}</div>}
                  <div className={`text-[10px] font-bold ${hideFigures || !seesMargins ? 'text-slate-500' : marginTone(margin, floor)}`}>{all.length} item{all.length === 1 ? "" : "s"}{hideFigures || !seesMargins ? '' : ` · ${margin.toFixed(1)}%`}</div>
                </>}
              </div>
            </div>
            <div className="px-1.5 py-1.5 flex-1">
              {ms.map(m => (
                <button key={m.line.id} type="button" onClick={() => onSel(m.line.id)}
                  className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-lg text-left ${sel === m.line.id ? 'bg-[#3D52A0]/[0.08]' : 'hover:bg-slate-50'}`}>
                  <span className="w-7 h-6 shrink-0">
                    {m.draw && m.size ? <PieceThumb kind={m.draw.kind} w={m.size.w} d={m.size.d} words={m.words} {...m.art} className="w-7 h-6" /> : <span className="w-7 h-6 grid place-items-center text-slate-300"><Layers className="w-3 h-3" aria-hidden /></span>}
                  </span>
                  <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate">{m.name}{m.line.byRoom ? <span className="font-normal text-slate-400"> · shared into the rooms</span> : null}</span>
                  {m.stale.length > 0 && <span className="px-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">new spec</span>}
                  {!hideFigures && <span className={`text-xs font-bold tabular-nums ${m.billable ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{lakh(m.amount)}</span>}
                </button>
              ))}
              {roomShares.map(s => (
                <button key={s.model.line.id} type="button" onClick={() => onSel(s.model.line.id)} className="w-full flex items-center gap-2 px-1.5 py-1 rounded-lg text-left hover:bg-slate-50">
                  <span className="w-7 h-6 shrink-0 grid place-items-center text-slate-400"><Layers className="w-3.5 h-3.5" aria-hidden /></span>
                  <span className="flex-1 min-w-0 text-xs text-slate-600 truncate">{s.model.name} <span className="text-slate-400 tabular-nums">· {round2(s.qty)} {s.model.unit}</span></span>
                  {!hideFigures && <span className="text-xs font-bold tabular-nums text-slate-600">{lakh(s.amount)}</span>}
                </button>
              ))}
              {!ms.length && !roomShares.length && (
                <div className="mx-1.5 my-1 rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-400 px-3 py-4 text-center">Drag an item here</div>
              )}
            </div>
            <div className="px-2 py-2 border-t border-slate-100 flex items-center gap-1 whitespace-nowrap">
              {seesMargins && !hideFigures && billed.length > 0 && (
                <span className="w-[128px]">
                  <Scrub variant="cell" label={`Markup for ${name}`} value={amk} step={0.5} pxPerStep={4} max={400} disabled={readOnly}
                    format={v => `Markup ${v.toFixed(1)}% ↔`} onCommit={v => onReplaceMany(setAvgMarkup(billed, v))}
                    className="!text-left !text-[11px] border border-slate-200 !px-2" />
                </span>
              )}
              {!readOnly && (
                <button type="button" onClick={() => onAdd(name)} className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#3D52A0] hover:bg-[#3D52A0]/10 inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" aria-hidden />Add
                </button>
              )}
              {room?.plan && (
                <button type="button" onClick={() => onShowOnPlan(name)} title="Show on the plan" className="ml-auto px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 inline-flex items-center gap-1">
                  <MapIcon className="w-3 h-3" aria-hidden />Plan
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The room drawn small, with its pieces, flat. */
function RoomMini({ room, lines, bankMap, art }: { room: Room; lines: BoqItem[]; bankMap: Map<string, Item>; art?: (id: string) => LineModel['art'] | undefined }) {
  const r = room.plan;
  if (!r) return <div className="h-28 grid place-items-center text-[11px] text-slate-400">Not on the plan yet</div>;
  const pad = 0.35;
  const pieces = boardPieces(lines, bankMap).sort((a, b) => Number(a.high) - Number(b.high));
  return (
    <svg viewBox={`${r.x - pad} ${r.y - pad} ${r.w + pad * 2} ${r.h + pad * 2}`} className="w-full h-28" preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#fbfaf7" stroke="#334155" strokeWidth={0.22} />
      {pieces.map(p => (
        <g key={p.id} transform={`translate(${p.place.x} ${p.place.y}) rotate(${p.place.rot})`}>
          <PieceArt kind={p.draw.kind} w={p.size.w} d={p.size.d} words={p.line.specs ?? p.item?.specs} high={p.high} flat {...(art?.(p.id) || {})} />
        </g>
      ))}
    </svg>
  );
}
