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
import { pickable } from '../../lib/bankMatch';
import { drawOf } from '../../lib/playground/pieces';
import { supplyOf } from '../../lib/playground/supply';
import { tradeIcon } from '../ui/tradeIcon';
import { WORK_TYPE } from '../../lib/playground/works';

/*
  The studio design library (the approved mockup's catalogue), over the left of
  the stage. Every Item Bank item that draws, as a picture with its price per
  unit: drag one onto the plan or a room card, or press + to add it to the room
  you are in. Works holds the items that are not drawn (civil, plumbing,
  electrical, painting, site work), each with its trade's mark: + adds one to
  the room you are in, sized from that room. The Kits tab holds the Item Bank's
  bundles as room kits (PR K); By client, the items bought by the client or at
  actuals (PR X).
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
type Tab = 'pieces' | 'works' | 'kits' | 'client';

export default function Catalogue({ bank, readOnly, onClose, onAdd, addLabel, artOf, kits = [], bankMap, hideFigures = false, kitEstimate, onKit, places = [], onAddSupplied, onAddWork, workRoom = null, measureWork, onCustom }: {
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
  /** The + on a Works tile: adds the item to the room the screen says, sized from it. Without it there is no Works tab. */
  onAddWork?: (item: Item) => void;
  /** The room a work's + goes to: the one in hand on the plan, or none. */
  workRoom?: string | null;
  /** What a work comes to in that room, and how (lib/playground/works). */
  measureWork?: (item: Item) => { qty: number; how: string } | null;
  /** Something the Item Bank does not have: opens the custom item form, with what was typed, the tab's trade, and whether it is a work (measured from its room). */
  onCustom?: (name: string, cat?: string, work?: boolean) => void;
}) {
  /* "Not in the bank?": a tile at the top of Pieces and Works, and the offer when a filter finds nothing. */
  const customTile = (cat?: string, work = false) => onCustom && !readOnly && (
    <button type="button" onClick={() => onCustom(q.trim(), cat, work)} data-custom-item
      className="hud-row-in col-span-2 rounded-xl border border-dashed border-[#3D52A0]/40 bg-[#3D52A0]/[0.03] px-3 py-2 text-left inline-flex items-center gap-2 hover:bg-[#3D52A0]/[0.07] hover:border-[#3D52A0]/60 active:scale-[0.98] transition-[background-color,border-color,scale] duration-150">
      <span className="w-7 h-7 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Plus className="w-3.5 h-3.5" aria-hidden /></span>
      <span className="min-w-0"><span className="block text-xs font-bold text-[#3D52A0]">{work ? 'Add a custom work' : 'Add a custom item'}</span><span className="block text-[11px] text-slate-500">{work ? 'Not in the Item Bank · measured from the room' : 'Not in the Item Bank'}</span></span>
    </button>
  );
  const noneFound = (what: string, cat?: string, work = false) => (
    <div className="col-span-2 px-1 text-xs text-slate-500">
      {what}
      {onCustom && !readOnly && q.trim() && (
        <button type="button" onClick={() => onCustom(q.trim(), cat, work)} className="block mt-1.5 font-bold text-[#3D52A0] hover:underline text-left">Add “{q.trim()}” as a custom {work ? 'work' : 'item'}</button>
      )}
    </div>
  );
  const [dest, setDest] = useState('Whole flat');
  /* What is offered: the items, never a copy of one (lib/bankMatch.ts). */
  const offered = useMemo(() => pickable(bank), [bank]);
  const supplied = useMemo(() => suppliedItems(offered), [offered]);
  const [tab, setTab] = useState<Tab>('pieces');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('All');
  const all = useMemo(() => drawableItems(offered), [offered]);
  /* Works: what the bank has that is neither drawn nor bought by the client. */
  const works = useMemo(() => offered.filter(i => !drawOf(i) && !supplyOf(i)).sort((a, b) => a.name.localeCompare(b.name)), [offered]);
  const workCats = useMemo(() => {
    const n = new Map<string, number>();
    works.forEach(i => n.set(i.cat || 'General', (n.get(i.cat || 'General') || 0) + 1));
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [works]);
  const [workCat, setWorkCat] = useState('All');
  const workList = works.filter(i => (workCat === 'All' || (i.cat || 'General') === workCat) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase())));
  const tabs: [Tab, string][] = onAddWork
    ? [['pieces', 'Pieces'], ['works', 'Works'], ['kits', 'Kits'], ['client', 'By client']]
    : [['pieces', 'Pieces'], ['kits', 'Kits'], ['client', 'By client']];
  const list = all.filter(({ item, draw }) => (cat === 'All' || CAT_OF[draw.kind] === cat) && (!q.trim() || item.name.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <aside className="rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col min-h-0 overflow-hidden w-full h-full" aria-label="Studio design library">
      <div className="px-3 pt-3">
        <div className="flex items-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#3D52A0] inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" aria-hidden />Studio design library</div>
          <button type="button" onClick={onClose} aria-label="Close the library" className="ml-auto -mr-1 p-1 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-3.5 h-3.5" aria-hidden /></button>
        </div>
        <div className={`mt-2 grid ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-0.5 p-0.5 rounded-xl bg-slate-100`} role="radiogroup" aria-label="Library">
          {tabs.map(([k, n]) => (
            <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => setTab(k)}
              className={`py-1 rounded-lg text-[11px] font-bold transition-all duration-200 ${tab === k ? 'bg-white text-[#3D52A0] shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>{n}</button>
          ))}
        </div>
        {tab === 'kits' && <div className="text-[11px] text-slate-500 mt-1.5">From the Item Bank’s bundles. Drop a kit on a room: every line is sized from that room.</div>}
        {tab === 'works' && <>
          <div className="text-[11px] text-slate-500 mt-1.5">Civil, plumbing, electrical and site work. Drag one onto a room: its quantity is measured from that room.</div>
          <div className={`mt-1.5 text-[11px] font-semibold ${workRoom ? 'text-[#3D52A0]' : 'text-amber-700'}`} role="status">
            {workRoom ? `+ adds to ${workRoom}, with the quantity shown.` : 'Click a room on the plan to use +.'}
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter works by name…" aria-label="Filter the works" className={`${INPUT} !pl-8 !py-1.5`} />
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {['All', ...workCats].map(c => (
              <button key={c} type="button" onClick={() => setWorkCat(c)} aria-pressed={workCat === c}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors duration-150 ${workCat === c ? 'bg-[#3D52A0] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c}</button>
            ))}
          </div>
        </>}
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
          {customTile('Carpentry')}
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
          {list.length === 0 && noneFound('No item in the bank draws by that name.', 'Carpentry')}
        </div>
      ) : tab === 'works' ? (
        <div key="works" className="hud-swap flex-1 overflow-auto p-3 grid grid-cols-2 gap-2 content-start">
          {customTile(workCat !== 'All' ? workCat : 'Civil', true)}
          {workList.map((item, i) => {
            const Icon = tradeIcon(`${item.name} ${item.cat}`);
            const m = workRoom ? measureWork?.(item) : null;
            return (
              <React.Fragment key={item.id}><LibTile i={i} readOnly={readOnly} title={readOnly ? item.name : `Drag ${item.name} onto a room`}
                onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.setData(WORK_TYPE, '1'); e.dataTransfer.effectAllowed = 'copy'; }}
                thumb={<span className="w-full h-12 rounded-lg bg-slate-50 grid place-items-center text-slate-400"><Icon className="w-5 h-5" aria-hidden /></span>}>
                <span className="block text-[11px] font-semibold text-slate-800 leading-tight mt-1 line-clamp-2">{item.name}</span>
                <span className="block text-[10px] font-bold text-slate-500 tabular-nums">{inr(calculateSellPrice(item.materials, item.labor, item.margin))}/{item.unit}</span>
                {m && <span className="block text-[10px] font-semibold text-[#3D52A0] tabular-nums" title={`In ${workRoom}: ${m.how}`}>{m.qty} {item.unit} here</span>}
                {!readOnly && (
                  <button type="button" onClick={() => onAddWork?.(item)} disabled={!workRoom}
                    aria-label={workRoom ? `Add ${item.name} to ${workRoom}` : `Add ${item.name}: click a room on the plan first`}
                    title={workRoom ? `Add to ${workRoom}${m ? `: ${m.qty} ${item.unit}, ${m.how}` : ''}` : 'Click a room on the plan first, or drag this onto a room'}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-white/90 border border-slate-200 text-slate-600 enabled:hover:bg-[#3D52A0] enabled:hover:text-white enabled:hover:border-transparent enabled:hover:scale-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 grid place-items-center">
                    <Plus className="w-3 h-3" aria-hidden />
                  </button>
                )}
              </LibTile></React.Fragment>
            );
          })}
          {workList.length === 0 && noneFound('No work in the bank by that name.', workCat !== 'All' ? workCat : 'Civil', true)}
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
