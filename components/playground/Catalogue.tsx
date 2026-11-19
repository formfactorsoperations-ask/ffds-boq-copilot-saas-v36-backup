import React, { useMemo, useState } from 'react';
import { Sparkles, X, Search, Plus, Boxes, Users } from 'lucide-react';
import { EmptyState, INPUT } from '../ui/kit';
import type { Item, PieceKind } from '../../types';
import { calculateSellPrice } from '../../lib/utils';
import { drawableItems } from '../../lib/playground/board';
import { PieceThumb } from './pieceArt';
import { inr } from './playgroundUi';

/*
  The studio design library (the approved mockup's catalogue), over the left of
  the stage. Every Item Bank item that draws, as a picture with its price per
  unit: drag one onto the plan or a room card, or press + to add it to the room
  you are in. Room kits and the client's own items come in later parts of the
  Playground and say so.
*/

const CATS = ['All', 'Storage', 'Living', 'Bedroom', 'Kitchen', 'Bath'] as const;
type Cat = typeof CATS[number];
const CAT_OF: Record<PieceKind, Cat> = {
  wardrobe: 'Storage', cabinet: 'Storage', loft: 'Storage', generic: 'Storage',
  tv: 'Living', sofa: 'Living', dtable: 'Living', panel: 'Living',
  bed: 'Bedroom', desk: 'Bedroom',
  base: 'Kitchen', wallunit: 'Kitchen',
  vanity: 'Bath', glass: 'Bath',
};
type Tab = 'pieces' | 'kits' | 'client';

export default function Catalogue({ bank, readOnly, onClose, onAdd, addLabel }: {
  bank: Item[];
  readOnly: boolean;
  onClose: () => void;
  /** The + on a tile: adds the item where the screen says (the selected room). */
  onAdd: (item: Item) => void;
  addLabel: string;
}) {
  const [tab, setTab] = useState<Tab>('pieces');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('All');
  const all = useMemo(() => drawableItems(bank), [bank]);
  const list = all.filter(({ item, draw }) => (cat === 'All' || CAT_OF[draw.kind] === cat) && (!q.trim() || item.name.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <aside className="rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col min-h-0 overflow-hidden w-full h-full" aria-label="Studio design library">
      <div className="px-3 pt-3">
        <div className="flex items-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#3D52A0] inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" aria-hidden />Studio design library</div>
          <button type="button" onClick={onClose} aria-label="Close the library" className="ml-auto -mr-1 p-1 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-3.5 h-3.5" aria-hidden /></button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-0.5 p-0.5 rounded-xl bg-slate-100" role="radiogroup" aria-label="Library">
          {([['pieces', 'Pieces'], ['kits', 'Kits'], ['client', 'By client']] as [Tab, string][]).map(([k, n]) => (
            <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => setTab(k)}
              className={`py-1 rounded-lg text-[11px] font-bold ${tab === k ? 'bg-white text-[#3D52A0] shadow-sm' : 'text-slate-600'}`}>{n}</button>
          ))}
        </div>
        {tab === 'pieces' && <>
          <div className="text-[11px] text-slate-500 mt-1.5">Drag onto the plan or a room card. Each comes with its words from the Item Bank.</div>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter catalog by name…" aria-label="Filter the catalogue" className={`${INPUT} !pl-8 !py-1.5`} />
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {CATS.map(c => (
              <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold ${cat === c ? 'bg-[#3D52A0] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c}</button>
            ))}
          </div>
        </>}
      </div>
      {tab === 'pieces' ? (
        <div className="flex-1 overflow-auto p-3 grid grid-cols-2 gap-2 content-start">
          {list.map(({ item, draw }, i) => (
            <div key={item.id} draggable={!readOnly}
              onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'copy'; }}
              className={`hud-row-in relative rounded-xl border border-slate-200 bg-white p-2 ${readOnly ? '' : 'cursor-grab hover:border-[#3D52A0]/40 hover:shadow-md'}`}
              style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }} title={readOnly ? item.name : `Drag ${item.name} onto the plan`}>
              <span className="block"><PieceThumb kind={draw.kind} w={draw.w} d={draw.d} words={item.specs} /></span>
              <span className="block text-[11px] font-semibold text-slate-800 leading-tight mt-1 line-clamp-2">{item.name}</span>
              <span className="block text-[10px] font-bold text-slate-500 tabular-nums">{inr(calculateSellPrice(item.materials, item.labor, item.margin))}/{item.unit}</span>
              {!readOnly && (
                <button type="button" onClick={() => onAdd(item)} aria-label={`Add ${item.name} ${addLabel}`} title={`Add ${addLabel}`}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-white/90 border border-slate-200 text-slate-600 hover:bg-[#3D52A0] hover:text-white grid place-items-center">
                  <Plus className="w-3 h-3" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {list.length === 0 && <p className="col-span-2 text-xs text-slate-500 px-1">No item in the bank draws by that name.</p>}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3">
          {tab === 'kits'
            ? <EmptyState icon={Boxes} title="Room kits come next" text="A saved room (its pieces and their sizes) dropped onto another room in one go. Arrives with the kits part of the Playground." />
            : <EmptyState icon={Users} title="The client’s own items come next" text="Things the client buys or already owns, drawn on the plan and kept out of the price. Arrives with the by-client part of the Playground." />}
        </div>
      )}
    </aside>
  );
}
