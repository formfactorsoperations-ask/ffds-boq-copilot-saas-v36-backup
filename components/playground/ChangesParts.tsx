import React from 'react';
import { History, ChevronRight } from 'lucide-react';
import { Chip } from '../ui/kit';
import type { BoqItem, Item } from '../../types';
import { scopeChanges, changeWhy, PART_LABELS, TAG_TONE, type Changes, type ChangeTag } from '../../lib/playground/changes';
import type { LineAmountOptions } from '../../lib/playground/pricing';
import { resolveBoqLine } from '../../lib/boqPricing';
import { inr } from './playgroundUi';

/*
  Versions (BOQ Playground PR R, as in the approved mockup).

  ChangesPanel   in place of the Live BOQ while "Show changes since vN" is on:
                 the older version's price, the parts of the change (they add
                 up exactly), the newer price, and every changed line by room,
                 tagged, with its amount and why. A line taken out can be
                 restored. Moves are counted apart: a move is not a scope change.
  TagChip        a change's tag, in its tone
  Delta          +₹5,250 / −₹1,386 in rose or emerald
*/

export const TagChip = ({ tag }: { tag: ChangeTag }) => <Chip tone={TAG_TONE[tag]}>{tag}</Chip>;

export function Delta({ d, className = '' }: { d: number; className?: string }) {
  return <b className={`tabular-nums ${d > 0 ? 'text-rose-600' : d < 0 ? 'text-emerald-600' : 'text-slate-400'} ${className}`}>{Math.abs(d) < 1 ? '₹0' : `${d > 0 ? '+' : '−'}${inr(Math.abs(d))}`}</b>;
}

/** A revision of a signed BOQ (PR R2): its reasons and its actions, in the Changes panel. */
export interface RevisionPanel {
  /** "Revision 1" */
  title: string;
  /** The parts, as the Scope Revision document will have them. */
  parts: [string, number][];
  /** Changes that need a reason (by line id), and the reasons given. */
  need: Set<string>;
  reasons: Record<string, string>;
  /** Reasons can be changed: a draft. */
  editing: boolean;
  onReason: (id: string, reason: string) => void;
  /** Below the figures: the status and the revision's buttons. */
  actions: React.ReactNode;
}

export const REASON_OPTIONS = ['Client request', 'Design upgrade', 'Site condition', 'Value engineering', 'Correction'];

export function ChangesPanel({ changes, cur, baseName, sub, bankMap, opts, hideFigures, readOnly, onSel, onRestore, onHide, materialName, revision }: {
  changes: Changes;
  cur: BoqItem[];
  /** "v1" */
  baseName: string;
  /** "v1 · 12 Nov 2026" */
  sub: string;
  bankMap: Map<string, Item>;
  opts: { base: LineAmountOptions; cur: LineAmountOptions };
  hideFigures: boolean;
  readOnly: boolean;
  onSel: (id: string) => void;
  onRestore: (line: BoqItem) => void;
  onHide?: () => void;
  materialName?: (id: string) => string | undefined;
  revision?: RevisionPanel;
}) {
  const ch = scopeChanges(changes);
  const moved = changes.out.size - ch.length;
  const byId = new Map(cur.map(l => [l.id, l]));
  const byRoom = new Map<string, [string, NonNullable<ReturnType<typeof changes.out.get>>, BoqItem][]>();
  ch.forEach(([id, e]) => {
    const l = e.gone ? e.was! : byId.get(id)!;
    const room = l.roomId || 'Whole flat';
    if (!byRoom.has(room)) byRoom.set(room, []);
    byRoom.get(room)!.push([id, e, l]);
  });
  const dd = changes.after - changes.before;
  const segs = (revision ? revision.parts : PART_LABELS.map(([k, n]) => [n, changes.parts[k]] as [string, number])).filter(([, v]) => Math.abs(v) >= 1);
  return (
    <div className="p-4 space-y-3 hud-swap" aria-label="Changes" role="region">
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-xl grid place-items-center shrink-0 ${revision ? 'bg-amber-100 text-amber-700' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}><History className="w-4 h-4" aria-hidden /></span>
        <div className="min-w-0">
          <h2 className="font-bold text-slate-800 leading-tight">{revision ? revision.title : `Changes since ${baseName}`}</h2>
          <p className="text-[11px] text-slate-500">{sub}</p>
        </div>
        {onHide && (
          <button type="button" onClick={onHide} aria-label="Hide this panel" title="Hide this panel" className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>
      {!hideFigures && (
        <div className="rounded-xl border border-slate-200 p-3 text-xs">
          <div className="flex items-baseline justify-between"><span className="text-slate-500">{revision ? 'Signed' : baseName}</span><b className="tabular-nums">{inr(changes.before)}</b></div>
          {segs.map(([n, v]) => (
            <div key={n} className="flex items-baseline justify-between mt-1"><span className="text-slate-600">{n}</span><Delta d={v} /></div>
          ))}
          <div className="flex items-baseline justify-between text-sm mt-2 pt-2 border-t border-dashed border-slate-300"><span className="font-bold text-slate-800">{revision ? 'Revised' : 'This version'}</span><b className="font-black tabular-nums">{inr(changes.after)}</b></div>
          <div className={`text-right text-[11px] font-bold mt-0.5 ${dd > 0 ? 'text-rose-600' : dd < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
            {Math.abs(dd) < 1 ? 'No change in price' : `${dd > 0 ? '+' : '−'}${inr(Math.abs(dd))} · the parts add up exactly`}
          </div>
        </div>
      )}
      {revision?.actions}
      <div>
        {[...byRoom].map(([room, list]) => (
          <div key={room} className="mt-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pb-1 border-b border-dashed border-slate-300">{room}</div>
            {list.map(([id, e, l]) => (
              <div key={id} className="py-2 border-b border-slate-100 hud-row-in" data-change={id}>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={e.gone} onClick={() => onSel(id)}
                    className={`flex-1 min-w-0 text-left text-xs font-semibold truncate ${e.gone ? 'line-through text-slate-400' : 'text-slate-800 hover:text-[#3D52A0]'}`}>{resolveBoqLine(l, bankMap).name}</button>
                  <TagChip tag={e.tag} />
                  {!hideFigures && <Delta d={e.d} className="text-xs" />}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {changeWhy(e, l, bankMap, { ...opts, materialName, studio: !hideFigures })}
                  {e.gone && !readOnly && <> · <button type="button" onClick={() => onRestore(e.was!)} className="font-bold text-[#3D52A0] hover:underline">Restore</button></>}
                </div>
                {revision && revision.need.has(id) && (revision.editing ? (
                  <>
                    <label className="sr-only" htmlFor={`rs-${id}`}>Why it changed</label>
                    <select id={`rs-${id}`} value={revision.reasons[id] || ''} onChange={ev => revision.onReason(id, ev.target.value)}
                      className={`mt-1.5 w-full px-2 py-1 rounded-lg border text-[11px] font-semibold ${revision.reasons[id] ? 'border-slate-200 bg-white text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
                      {['', ...REASON_OPTIONS].map(r => <option key={r} value={r}>{r || 'Why did it change?'}</option>)}
                    </select>
                  </>
                ) : revision.reasons[id] ? <div className="text-[11px] text-slate-500 mt-0.5">Why: {revision.reasons[id]}</div> : null)}
              </div>
            ))}
          </div>
        ))}
        {byRoom.size === 0 && <p className="text-xs text-slate-500">{revision ? 'Change anything on the plan, in Rooms or in Sheet: each change lands here with its price.' : `This version matches ${baseName}.`}</p>}
      </div>
      {moved > 0 && <p className="text-[11px] text-slate-400">{moved} piece{moved > 1 ? 's' : ''} moved with no price change. A move is not a scope change.</p>}
    </div>
  );
}
