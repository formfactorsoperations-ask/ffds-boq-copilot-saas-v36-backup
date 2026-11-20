import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Chip, EmptyState } from '../ui/kit';
import type { Item } from '../../types';
import { supplyOf, unitEstimate, SUPPLY_LABEL } from '../../lib/playground/supply';
import { inr } from './playgroundUi';

/*
  The library's By client tab (BOQ Playground PR X, as in the approved
  mockup): the Item Bank's items bought by the client or paid to the vendor at
  actuals, each added to the room picked in "Add to". They go on their own
  list and never change the price, offers, fee, GST or payment schedule.
*/

export function SupplyLibrary({ items, rooms, dest, readOnly, hideFigures, onDest, onAdd }: {
  items: Item[];
  /** Where they can go: the rooms, then the whole flat. */
  rooms: string[];
  dest: string;
  readOnly: boolean;
  hideFigures: boolean;
  onDest: (room: string) => void;
  onAdd: (item: Item) => void;
}) {
  return (
    <>
      <div className="px-3">
        <div className="text-[11px] text-slate-500 mt-1.5">Bought by the client, or paid to the vendor at actuals. They go on their own list and never change the price, offers, fee, GST or payment schedule.</div>
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor="pg-sep-room" className="text-[11px] font-bold text-slate-500 shrink-0">Add to</label>
          <select id="pg-sep-room" value={dest} onChange={e => onDest(e.target.value)} disabled={readOnly}
            className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-300 text-xs font-semibold bg-white">
            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {items.map((it, i) => {
          const s = supplyOf(it)!;
          return (
            <div key={it.id} data-supply-item={it.id} className="hud-row-in rounded-xl border border-slate-200 bg-white p-2.5" style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}>
              <div className="text-xs font-bold text-slate-800 leading-tight">{it.name}</div>
              {it.specs && <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{it.specs}</div>}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <Chip>{SUPPLY_LABEL[s]}</Chip>
                <span className="text-[10px] font-bold text-slate-500 tabular-nums">{s === 'actuals' && !hideFigures ? `≈ ${inr(unitEstimate(it))} est.` : ''}</span>
                {!readOnly && (
                  <button type="button" onClick={() => onAdd(it)} aria-label={`Add ${it.name} to ${dest}`}
                    className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold bg-[#3D52A0] text-white hover:bg-[#334486]">Add</button>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <EmptyState icon={PackageOpen} title="Nothing bought by the client yet"
            text="In the Item Bank, set an item’s Supplied to Bought by client or At actuals. It shows here, to add to a room on its own list." />
        )}
      </div>
    </>
  );
}
