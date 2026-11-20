import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import '../projectHeader/projectHeader.css';
import { Sparkles, X, Search, Plus } from 'lucide-react';
import { INPUT } from '../ui/kit';
import type { Item, PieceKind } from '../../types';
import { calculateSellPrice } from '../../lib/utils';
import { drawableItems } from '../../lib/playground/board';
import { PieceThumb } from './pieceArt';
import { inr } from './playgroundUi';
import { KitLibrary } from './KitParts';
import { SupplyLibrary } from './SupplyParts';
import { suppliedItems } from '../../lib/playground/supply';
import type { Kit } from '../../lib/playground/kits';

/*
  The studio design library (the approved mockup's catalogue), over the left of
  the stage. Every Item Bank item that draws, as a picture with its price per
  unit: drag one onto the plan or a room card, or press + to add it to the room
  you are in. The Kits tab holds the Item Bank's bundles as room kits (PR K);
  By client, the items bought by the client or at actuals (PR X).
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

export default function Catalogue({ bank, readOnly, onClose, onAdd, addLabel, artOf, kits = [], bankMap, hideFigures = false, kitEstimate, onKit, places = [], onAddSupplied }: {
  bank: Item[];
  readOnly: boolean;
  onClose: () => void;
  /** The + on a tile: adds the item where the screen says (the selected room). */
  onAdd: (item: Item) => void;
  addLabel: string;
  /** How an item looks in its recipe's finish at this option's grade (S2). */
  artOf?: (item: Item) => { fill?: string; base?: string; top?: string };
  /** Room kits, from the Item Bank's bundles (PR K). */
  kits?: Kit[];
  bankMap?: Map<string, Item>;
  hideFigures?: boolean;
  kitEstimate?: (k: Kit) => { room: string; amount: number } | null;
  /** A kit's Apply: opens its preview. */
  onKit?: (kitId: string) => void;
  /** Where a By client item can go: the rooms, then the whole flat (PR X). */
  places?: string[];
  onAddSupplied?: (item: Item, room: string) => void;
}) {
  const [dest, setDest] = useState('Whole flat');
  const supplied = useMemo(() => suppliedItems(bank), [bank]);
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
              className={`py-1 rounded-lg text-[11px] font-bold transition-all duration-200 ${tab === k ? 'bg-white text-[#3D52A0] shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>{n}</button>
          ))}
        </div>
        {tab === 'kits' && <div className="text-[11px] text-slate-500 mt-1.5">From the Item Bank’s bundles. Drop a kit on a room: every line is sized from that room.</div>}
        {tab === 'pieces' && <>
          <div className="text-[11px] text-slate-500 mt-1.5">Drag onto the plan or a room card. Each comes with its words from the Item Bank.</div>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter catalog by name…" aria-label="Filter the catalogue" className={`${INPUT} !pl-8 !py-1.5`} />
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {CATS.map(c => (
              <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors duration-150 ${cat === c ? 'bg-[#3D52A0] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c}</button>
            ))}
          </div>
        </>}
      </div>
      {tab === 'pieces' ? (
        <div key="pieces" className="hud-swap flex-1 overflow-auto p-3 grid grid-cols-2 gap-2 content-start">
          {list.map(({ item, draw }, i) => (
            <React.Fragment key={item.id}><LibTile i={i} readOnly={readOnly} title={readOnly ? item.name : `Drag ${item.name} onto the plan`}
              onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'copy'; }}
              thumb={<PieceThumb kind={draw.kind} w={draw.w} d={draw.d} words={item.specs} {...(artOf?.(item) || {})} />}>
              <span className="block text-[11px] font-semibold text-slate-800 leading-tight mt-1 line-clamp-2">{item.name}</span>
              <span className="block text-[10px] font-bold text-slate-500 tabular-nums">{inr(calculateSellPrice(item.materials, item.labor, item.margin))}/{item.unit}</span>
              {!readOnly && (
                <button type="button" onClick={() => onAdd(item)} aria-label={`Add ${item.name} ${addLabel}`} title={`Add ${addLabel}`}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-white/90 border border-slate-200 text-slate-600 hover:bg-[#3D52A0] hover:text-white hover:border-transparent hover:scale-110 active:scale-95 transition-all duration-150 grid place-items-center">
                  <Plus className="w-3 h-3" aria-hidden />
                </button>
              )}
            </LibTile></React.Fragment>
          ))}
          {list.length === 0 && <p className="col-span-2 text-xs text-slate-500 px-1">No item in the bank draws by that name.</p>}
        </div>
      ) : tab === 'kits' ? (
        <KitLibrary kits={kits} bankMap={bankMap || new Map(bank.map(i => [i.id, i]))} readOnly={readOnly} hideFigures={hideFigures}
          estimate={k => kitEstimate?.(k) ?? null} onApply={id => onKit?.(id)} />
      ) : (
        <SupplyLibrary items={supplied} rooms={places.length ? places : ['Whole flat']} dest={places.includes(dest) ? dest : (places[places.length - 1] || 'Whole flat')}
          readOnly={readOnly} hideFigures={hideFigures} onDest={setDest} onAdd={it => onAddSupplied?.(it, places.includes(dest) ? dest : (places[places.length - 1] || 'Whole flat'))} />
      )}
    </aside>
  );
}

/*
  A library tile, with the motion the owner asked for (20 Nov 2026, as the
  mockup's pg-tile): it lifts on hover and its picture gives a little wiggle;
  it presses in on click and fades while it is being dragged. Transitions and
  framer-motion only, no new keyframes; still under reduced motion.
*/
export function LibTile({ i, readOnly, title, thumb, onDragStart, children, className = '' }: {
  i: number;
  readOnly: boolean;
  title?: string;
  thumb: React.ReactNode;
  onDragStart: (e: React.DragEvent) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const still = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  return (
    <div draggable={!readOnly} title={title}
      onDragStart={e => { setDragging(true); onDragStart(e); }} onDragEnd={() => setDragging(false)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className={`hud-row-in relative rounded-xl border bg-white p-2 transition-[box-shadow,border-color,opacity,scale] duration-200 ease-out ${dragging ? 'opacity-50 scale-95' : ''} ${readOnly ? 'border-slate-200' : `phd-lift cursor-grab active:cursor-grabbing border-slate-200 hover:border-[#3D52A0]/40 hover:shadow-md ${still ? '' : 'active:scale-[0.98]'}`} ${className}`}
      style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }}>
      <motion.span className="block origin-center" animate={hover && !still && !readOnly ? { rotate: [0, -7, 7, 0] } : { rotate: 0 }} transition={{ duration: 0.42, ease: 'easeInOut' }}>
        {thumb}
      </motion.span>
      {children}
    </div>
  );
}
