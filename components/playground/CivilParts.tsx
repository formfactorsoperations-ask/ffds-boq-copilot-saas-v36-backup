import React, { useEffect, useState } from 'react';
import { Sparkles, PackagePlus } from 'lucide-react';
import { Button, Chip, LABEL } from '../ui/kit';
import type { BoqItem, Item, PropertyStatus, Room } from '../../types';
import {
  CIVIL_TOOLS, civilDerivation, segLength, withSegmentLength, civilQty, isWet, toolOf, canRefloor, missingStandardItems, type CivilTool, type CivilItems,
} from '../../lib/playground/civil';
import { round2 } from '../../lib/playground/geometry';
import { inr, type LineModel } from './playgroundUi';

/*
  The Civil layer's parts (BOQ Playground PR C, as in the approved mockup).

  CivilPanel   over the plan while the Civil layer is on: the five tools, what
               the brief asks for, the civil lines and their total, and Start
               from the brief
  CivilBlock   in a civil line's inspector: how it is measured, and a wall's
               length typed
  CivilRoom    in a room's inspector: re-floor, wall tiles and waterproofing
               toggled for the room, and its civil lines
*/

export function CivilPanel({ left, tool, site, siteStatus, ask, lines, total, hideFigures, readOnly, items, bank, isOwner, onTool, onBrief, onAddItems }: {
  left: number;
  tool: CivilTool | null;
  /** The site, as the chip says it: Renovation, Semi-finished, Raw shell. */
  site?: string;
  /** The site's state: a raw shell re-floors without taking an old floor up. */
  siteStatus?: PropertyStatus;
  /** What the brief asks for, in words; empty when it asks for no civil work. */
  ask: string;
  lines: number;
  total: number;
  hideFigures: boolean;
  readOnly: boolean;
  /** The Item Bank's civil items: a tool with none says so. */
  items: CivilItems;
  /** The Item Bank, for the standard civil items it lacks. */
  bank: Item[];
  isOwner: boolean;
  onTool: (t: CivilTool) => void;
  onBrief: () => void;
  /** The Owner adds the standard civil items the bank lacks. */
  onAddItems: () => void;
}) {
  const has = (t: CivilTool) => (t === 'floor' ? canRefloor(items, siteStatus) : !!items.items[t]);
  // The Owner's button shows while the bank lacks any standard civil item (re-flooring's two lines need both of theirs).
  const missing = missingStandardItems(bank, () => '');
  return (
    <div className="absolute z-10 w-[214px] rounded-2xl bg-white/95 border border-slate-200 shadow-md p-2 hud-panel-in" style={{ left, top: 52 }} aria-label="Civil work" role="region">
      <div className="px-1 flex items-center justify-between gap-2"><span className={LABEL}>Civil work</span>{site && <Chip tone="warn">{site}</Chip>}</div>
      <p className="px-1 mt-0.5 text-[11px] text-slate-500 leading-snug">{ask ? `The brief asks for ${ask}. ` : ''}Quantities come from the plan.</p>
      <div className="mt-1.5 space-y-0.5">
        {CIVIL_TOOLS.map(t => (
          <button key={t.tool} type="button" aria-pressed={tool === t.tool} disabled={readOnly} onClick={() => onTool(t.tool)}
            className={`w-full text-left px-2 py-1.5 rounded-xl flex items-center gap-2 disabled:opacity-40 ${tool === t.tool ? 'bg-[#3D52A0]/10 ring-1 ring-[#3D52A0]/30' : 'hover:bg-slate-50'}`}>
            <span className="w-4 h-4 rounded-md shrink-0" style={{ background: t.colour }} />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-800">{t.label}</span>
              <span className={`block text-[10px] ${has(t.tool) ? 'text-slate-500' : 'text-amber-700'}`}>{has(t.tool) ? t.hint : 'Not in the Item Bank yet'}</span>
            </span>
          </button>
        ))}
      </div>
      {missing.length > 0 && isOwner && !readOnly && (
        <button type="button" onClick={onAddItems} className="mt-1 w-full text-left px-2 py-1 rounded-lg text-[11px] font-bold text-[#3D52A0] hover:bg-[#3D52A0]/10 inline-flex items-center gap-1.5">
          <PackagePlus className="w-3.5 h-3.5" aria-hidden />Add the standard civil items
        </button>
      )}
      <div className="mt-1.5 pt-1.5 border-t border-slate-100 px-1 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">{lines} civil line{lines === 1 ? '' : 's'}</span>
        {!hideFigures && <b className="tabular-nums text-slate-800">{inr(total)}</b>}
      </div>
      {!readOnly && <div className="mt-1.5"><Button size="sm" variant="primary" icon={Sparkles} onClick={onBrief}>Start from the brief</Button></div>}
    </div>
  );
}

/** How a civil line is measured, and a wall's length. */
export function CivilBlock({ line, room, unit, readOnly, onReplace }: {
  line: BoqItem;
  room: Room | undefined;
  unit: string;
  readOnly: boolean;
  onReplace: (l: BoqItem, msg?: string) => void;
}) {
  const civil = line.civil!;
  const g = civil.segment;
  const [len, setLen] = useState(g ? String(round2(segLength(g))) : '');
  useEffect(() => { setLen(g ? String(round2(segLength(g))) : ''); }, [g?.join(',')]);
  const commit = () => {
    if (!g) return;
    const v = Number(len);
    if (!(v > 0)) { setLen(String(round2(segLength(g)))); return; }
    const segment = withSegmentLength(g, Math.min(40, v), room);
    const next = { ...line, civil: { ...civil, segment }, qty: civilQty({ ...civil, segment }, room, unit) ?? line.qty };
    if (segment.join() !== g.join()) onReplace(next, `${toolOf(civil.type === 'build' ? 'build' : 'break').label}: ${round2(segLength(segment))} ft long.`);
    else setLen(String(round2(segLength(g))));
  };
  return (
    <div className="rounded-xl border border-slate-200 p-3 text-xs">
      <div className={`${LABEL} mb-1`}>How it is measured</div>
      <p className="text-slate-700">{civilDerivation(civil, room)}: <b className="tabular-nums">{line.qty.toLocaleString('en-IN')} {unit}</b></p>
      <p className="text-[11px] text-slate-500 mt-1">Follows the room’s size. Site measurement confirms it before the Detailed BOQ.</p>
      {g && !readOnly && (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor={`civlen-${line.id}`} className="text-slate-600">Length</label>
          <input id={`civlen-${line.id}`} value={len} inputMode="decimal" onChange={e => setLen(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }}
            className="w-16 px-1.5 py-1 rounded-md border border-slate-300 text-right font-bold tabular-nums" />
          <span className="text-slate-500">ft</span>
        </div>
      )}
    </div>
  );
}

/** A room's civil work: the room tools toggled for it, and its civil lines. */
export function CivilRoom({ room, lines, readOnly, onToggle, onSel }: {
  room: Room;
  lines: LineModel[];
  readOnly: boolean;
  onToggle: (tool: 'floor' | 'walls7' | 'waterproof') => void;
  onSel: (id: string) => void;
}) {
  const on = (t: CivilTool) => lines.some(m => m.line.civil && (t === 'floor' ? m.line.civil.type === 'floor' || m.line.civil.type === 'floorRemove' : m.line.civil.type === t));
  const tools = (['floor', 'walls7', 'waterproof'] as const).filter(t => t !== 'waterproof' || isWet(room));
  return (
    <div>
      <div className={`${LABEL} mb-1.5`}>Civil work in this room</div>
      <div className="flex flex-wrap gap-1.5">
        {tools.map(t => (
          <button key={t} type="button" disabled={readOnly} aria-pressed={on(t)} onClick={() => onToggle(t)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border disabled:opacity-50 ${on(t) ? 'bg-[#3D52A0] text-white border-transparent' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{toolOf(t).label}</button>
        ))}
      </div>
      {lines.length > 0 && (
        <div className="mt-1.5 rounded-xl border border-slate-200 divide-y divide-slate-100">
          {lines.map(m => (
            <button key={m.line.id} type="button" onClick={() => onSel(m.line.id)} className="w-full px-3 py-1.5 flex justify-between gap-2 text-xs text-left hover:bg-slate-50">
              <span className="min-w-0"><b className="block font-semibold text-slate-700 truncate">{m.name}</b><span className="block text-[10px] text-slate-400">{civilDerivation(m.line.civil!, room)}</span></span>
              <span className="tabular-nums font-bold whitespace-nowrap">{m.qty.toLocaleString('en-IN')} {m.unit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
