import React, { useMemo, useState } from 'react';
import { Receipt as ReceiptIcon, ChevronLeft, ChevronRight, X, Lock, RotateCw, Copy, Trash2, Map as MapIcon, Layers, MapPin, PaintRoller, PenLine, Check } from 'lucide-react';
import { Button, Chip, Segmented, LABEL } from '../ui/kit';
import type { BoqItem, Item, PricingRules, Room } from '../../types';
import { SCOPE_BUCKETS } from '../../lib/scopeBuckets';
import { ftin, round2 } from '../../lib/playground/geometry';
import { roomShares, measureRoom, planVsRule, byRoomQty, measureShare, RULE_WALL, RULE_CEILING, type MeasureContext } from '../../lib/playground/rooms';
import type { ShareBasis } from '../../types';
import { currentVersion, versionAt, materialsIn, type MaterialSpecsBank, type MaterialRange } from '../../lib/materialSpecs';
import { recipeOf, finishPartOf, withPart, updatedLine, withOwnWords, withRecipeWords, finishDelta, withShade } from '../../lib/lineSpecs';
import { AlertTriangle } from 'lucide-react';
import { lineAmountsByRoom } from '../../lib/playground/pricing';
import { unshare, shareIntoRooms, shareBasisFor, isWholeFlatLine } from '../../lib/playground/versions';
import { resizedTo, turnedLine } from '../../lib/playground/board';
import { ISSUE_LABEL, type IssueKind } from '../../lib/playground/issues';
import { basisOfUnit, readSize, parseSize, formatSize, sizeUpdates } from '../../lib/boqSize';
import { PieceThumb } from './pieceArt';
import { CivilBlock, CivilRoom } from './CivilParts';
import { inr, lakh, marginTone, Scrub, withCost, withMarkup, withRate, type LineModel } from './playgroundUi';

/*
  The right-hand panel of the BOQ Playground (the approved mockup's inspector).

  With nothing selected it is the Live BOQ: the version as the client is
  charged it, room by room, each line with its picture and its words, the
  whole-flat services shared into the rooms, and the work total. Select a line
  and it becomes that line's inspector; select a room and it becomes the room's.
*/

const thumbOf = (m: LineModel, cls: string) => (m.draw && m.size
  ? <PieceThumb kind={m.draw.kind} w={m.size.w} d={m.size.d} words={m.words} {...m.art} className={cls} />
  : <span className={`${cls} grid place-items-center text-slate-300`}><Layers className="w-3.5 h-3.5" aria-hidden /></span>);

export interface ShareRow { model: LineModel; qty: number; amount: number }

/** Each room's shares of the whole-flat lines. */
export function useShareRows(models: LineModel[], rooms: Room[], bankMap: Map<string, Item>, rules: PricingRules | null, measure?: MeasureContext) {
  return useMemo(() => {
    const out = new Map<string, ShareRow[]>();
    models.filter(m => m.line.byRoom && m.billable && !m.separate).forEach(m => {
      const qs = roomShares(m.line.byRoom!, rooms, measure);
      const am = lineAmountsByRoom(m.line, bankMap, { rules, rooms, measure });
      qs.forEach((q, room) => { if (q > 0) out.set(room, [...(out.get(room) || []), { model: m, qty: q, amount: am.get(room) || 0 }]); });
    });
    return out;
  }, [models, rooms, bankMap, rules, measure]);
}

/* ───────────────────────────── the Live BOQ ───────────────────────────── */

export function Receipt({ models, rooms, roomTotals, shares, workTotal, tierName, sel, onSel, onRoom, hideFigures, hint, onHint, onLens, onHide, onUpdateStale }: {
  models: LineModel[];
  rooms: Room[];
  roomTotals: Map<string, number>;
  shares: Map<string, ShareRow[]>;
  workTotal: number;
  tierName: string;
  sel: string | null;
  onSel: (id: string) => void;
  onRoom: (name: string) => void;
  hideFigures: boolean;
  hint: boolean;
  onHint: () => void;
  onLens: (l: 'sheet' | 'rooms' | 'plan') => void;
  onHide?: () => void;
  /** Takes every line on an older version to the current ones (a draft only). */
  onUpdateStale?: () => void;
}) {
  const stale = models.filter(m => m.stale.length);
  const realNames = rooms.map(r => r.name);
  const order = [...realNames, ...SCOPE_BUCKETS, ...models.map(m => m.room)].filter((n, i, a) => a.indexOf(n) === i);
  const groups = order.map(name => ({
    name,
    ms: models.filter(m => m.room === name && !(m.line.byRoom && realNames.length) && !m.separate),
    real: realNames.includes(name),
  })).filter(g => g.ms.length || (g.real && (roomTotals.get(g.name) || 0) > 0));
  const shared = models.filter(m => m.line.byRoom && !m.separate);
  const separate = models.filter(m => m.separate);
  const groupTotal = (g: { name: string; ms: LineModel[]; real: boolean }) =>
    roomTotals.get(g.name) ?? g.ms.filter(m => m.billable).reduce((a, m) => a + m.amount, 0);

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><ReceiptIcon className="w-4 h-4" aria-hidden /></span>
        <div>
          <h2 className="font-bold text-slate-800 leading-tight">Live BOQ</h2>
          <p className="text-[11px] text-slate-500">{models.length} lines · {tierName}</p>
        </div>
        {onHide && (
          <button type="button" onClick={onHide} aria-label="Hide the Live BOQ" title="Hide the Live BOQ" className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>
      {hint && <HintCard onDone={onHint} onLens={onLens} onFocus={() => { const first = models[0]; if (first) onSel(first.line.id); }} />}
      {stale.length > 0 && onUpdateStale && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 hud-panel-in">
          <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" aria-hidden />Newer material specs are out</div>
          <p className="text-[11px] text-amber-800/80 mt-0.5">{stale.length} line{stale.length === 1 ? '' : 's'} here use{stale.length === 1 ? 's' : ''} an older version. Nothing changes until you update.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" icon={Check} onClick={onUpdateStale}>Update {stale.length} line{stale.length === 1 ? '' : 's'}</Button>
            <Button size="sm" onClick={() => onSel(stale[0].line.id)}>Review one by one</Button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {groups.map(g => (
          <div key={g.name}>
            <button type="button" onClick={() => g.real && onRoom(g.name)} className="w-full flex items-baseline justify-between px-1 pb-1 border-b border-dashed border-slate-300">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{g.name}</span>
              {!hideFigures && <span className="text-xs font-black text-slate-700 tabular-nums">{inr(groupTotal(g))}</span>}
            </button>
            {g.ms.map(m => (
              <button key={m.line.id} type="button" onClick={() => onSel(m.line.id)}
                className={`w-full flex items-start gap-2 px-1 py-1.5 rounded-lg text-left ${sel === m.line.id ? 'bg-[#3D52A0]/[0.08]' : 'hover:bg-slate-50'}`}>
                <span className="w-7 h-6 shrink-0 mt-0.5">{thumbOf(m, 'w-7 h-6')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-700 truncate">{m.name}{m.stale.length > 0 && <> <span className="inline-block px-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold align-middle">new spec</span></>}</span>
                  <span className="block text-[10px] text-slate-500 truncate">{m.words}</span>
                </span>
                {!hideFigures && <span className={`text-xs font-black tabular-nums ${m.billable ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{inr(m.amount)}</span>}
              </button>
            ))}
            {g.real && (shares.get(g.name) || []).map(s => (
              <button key={s.model.line.id} type="button" onClick={() => onSel(s.model.line.id)} className="w-full flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-slate-50 text-left">
                <span className="w-7 h-5 shrink-0 grid place-items-center text-slate-300"><Layers className="w-3 h-3" aria-hidden /></span>
                <span className="min-w-0 flex-1 text-[11px] text-slate-500 truncate">{s.model.name} · {round2(s.qty)} {s.model.unit}</span>
                {!hideFigures && <span className="text-[11px] font-bold tabular-nums text-slate-600">{inr(s.amount)}</span>}
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && <p className="text-xs text-slate-500">Nothing in this BOQ yet. Open the library and drag an item onto a room.</p>}
        {shared.length > 0 && realNames.length > 0 && (
          <p className="text-[11px] text-slate-400">{shared.map(m => m.name).join(' and ')} {shared.length > 1 ? 'are' : 'is'} one line each for the flat, shared into the rooms above.</p>
        )}
      </div>
      <div className="mt-4 pt-3 border-t-2 border-dashed border-slate-300 flex justify-between text-sm">
        <span className="font-bold text-slate-800">Work total</span>
        {!hideFigures && <b className="font-black tabular-nums">{inr(workTotal)}</b>}
      </div>
      {separate.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Separate · not in the price</span>
            <span className="text-[10px] text-slate-400">{separate.length} items</span>
          </div>
          {separate.map(m => (
            <button key={m.line.id} type="button" onClick={() => onSel(m.line.id)} className="w-full flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-white text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-700 truncate">{m.name}</span>
                <span className="block text-[10px] text-slate-500">{m.room} · {m.line.boqStatus === 'client_procured' ? 'Bought by the client' : 'At actuals, paid to the vendor'}</span>
              </span>
              {!hideFigures && <span className="text-[11px] font-bold tabular-nums text-slate-500">{m.line.boqStatus === 'client_procured' ? '—' : `≈ ${inr(m.rate * m.qty)}`}</span>}
            </button>
          ))}
          <p className="text-[10px] text-slate-500 px-1 mt-1">On their own page for the client. No effect on the price, the fee, GST or the payment schedule.</p>
        </div>
      )}
    </div>
  );
}

function HintCard({ onDone, onLens, onFocus }: { onDone: () => void; onLens: (l: 'sheet' | 'rooms' | 'plan') => void; onFocus: () => void }) {
  const tiles: [string, string, () => void][] = [
    ['Focus Editor', 'Click any line', onFocus],
    ['Excel', 'Sheet', () => onLens('sheet')],
    ['Cards', 'Rooms', () => onLens('rooms')],
    ['Plan Takeoff', 'Plan · a room', () => onLens('plan')],
  ];
  return (
    <div className="mt-3 rounded-xl border border-[#3D52A0]/20 bg-[#3D52A0]/[0.04] p-3 hud-panel-in">
      <div className="flex items-center">
        <span className="text-xs font-bold text-slate-800">The four modes are now one tab</span>
        <button type="button" onClick={onDone} className="ml-auto text-[11px] font-bold text-[#3D52A0] hover:underline">Got it</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {tiles.map(([was, now, go]) => (
          <button key={was} type="button" onClick={go} className="text-left rounded-lg bg-white border border-slate-200 px-2 py-1.5 hover:border-[#3D52A0]/40">
            <span className="block text-[10px] line-through text-slate-400">{was}</span>
            <span className="block text-xs font-bold text-slate-800">{now}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────── a line ───────────────────────────── */

export function LineInspector({ m, index, count, issues, rooms, bankMap, rules, readOnly, seesMargins, hideFigures, floor, specBank, offerUpdates, onOpenRecipe, onReplace, onStep, onClose, onDuplicate, onDelete, onTakeOff, onPlace }: {
  m: LineModel;
  index: number;
  count: number;
  issues: IssueKind[];
  rooms: Room[];
  bankMap: Map<string, Item>;
  rules: PricingRules | null;
  readOnly: boolean;
  seesMargins: boolean;
  hideFigures: boolean;
  floor: number;
  /** The Material specs bank (S2): with it, a line built from a recipe shows its parts. */
  specBank?: MaterialSpecsBank | null;
  /** This option may take newer versions of its materials (a draft). */
  offerUpdates?: boolean;
  onOpenRecipe?: (itemId: string) => void;
  onReplace: (line: BoqItem, msg?: string) => void;
  onStep: (d: number) => void;
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTakeOff: () => void;
  onPlace: () => void;
}) {
  const line = m.line;
  const [editWords, setEditWords] = useState<string | null>(null);
  const basisU = basisOfUnit(m.unit);
  const measured = basisU === 'area' || basisU === 'length';
  /* A placed measured piece takes its size from the plan; an unplaced measured line from a typed size. */
  const sizeDriven = measured && (!!line.place && !!m.size || !!readSize({ ...line, unit: m.unit }));
  const basis = !line.byRoom && isWholeFlatLine(line) ? shareBasisFor(m.item) : null;
  const civil = !!line.civil;
  const qtyLabel = civil ? 'Measured from the plan' : line.byRoom ? 'Whole flat, room by room'
    : sizeDriven && line.place && m.size && basisU === 'area' ? `${ftin(m.size.w)} × ${ftin(m.size.h)} high`
    : sizeDriven ? 'Running length' : 'Quantity';
  const placed = !!line.place;

  return (
    <div className="p-4 space-y-3 hud-swap">
      <div className="flex items-start gap-3">
        <span className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 shrink-0 overflow-hidden">{thumbOf(m, 'w-12 h-12')}</span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-slate-800 truncate">{m.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[11px] text-slate-500 truncate flex-1 min-w-0">{m.room}{m.cat ? ` · ${m.cat}` : ''}</span>
            <button type="button" onClick={() => onStep(-1)} aria-label="Previous line" title="Previous line" className="p-1 rounded-md text-slate-500 hover:bg-slate-100"><ChevronLeft className="w-3.5 h-3.5" aria-hidden /></button>
            <span className="text-[10px] font-bold text-slate-400 tabular-nums">{index + 1} of {count}</span>
            <button type="button" onClick={() => onStep(1)} aria-label="Next line" title="Next line" className="p-1 rounded-md text-slate-500 hover:bg-slate-100"><ChevronRight className="w-3.5 h-3.5" aria-hidden /></button>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0"><X className="w-4 h-4" aria-hidden /></button>
      </div>

      {issues.length > 0 && <div className="flex flex-wrap gap-1">{issues.map(i => <Chip key={i} tone="warn">{ISSUE_LABEL[i]}</Chip>)}</div>}

      {m.size && placed && (
        <div className="grid grid-cols-4 gap-1.5">
          <Scrub label={/r\s*ft|rft|running/i.test(m.unit) ? 'Length' : 'Width'} value={m.size.w} step={0.25} min={0.5} pxPerStep={6} format={ftin} disabled={readOnly}
            onCommit={v => onReplace(resizedTo(line, m.pieceItem, v, m.size!.h, m.size!.d))} />
          <Scrub label="Height" value={m.size.h} step={0.25} min={0.5} pxPerStep={6} format={ftin} disabled={readOnly}
            onCommit={v => onReplace(resizedTo(line, m.pieceItem, m.size!.w, v, m.size!.d))} />
          <Scrub label="Depth" value={m.size.d} step={0.25} min={0.25} pxPerStep={6} format={ftin} disabled={readOnly}
            onCommit={v => onReplace(resizedTo(line, m.pieceItem, m.size!.w, m.size!.h, v))} />
          <Scrub label="Turn" value={line.place!.rot} step={15} min={0} max={345} pxPerStep={3} format={v => `${Math.round(v)}°`} disabled={readOnly}
            onCommit={v => onReplace({ ...line, place: { ...line.place!, rot: ((Math.round(v) % 360) + 360) % 360 } })} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#3D52A0]/[0.05] border border-[#3D52A0]/15 px-3 py-2">
        <span className="text-xs text-slate-600">{qtyLabel}</span>
        {!sizeDriven && !line.byRoom && !civil && !readOnly ? (
          <span className="w-28">
            <Scrub variant="cell" label="Quantity" value={m.qty} step={1} min={0} pxPerStep={8} format={v => `${v.toLocaleString('en-IN')} ${m.unit}`}
              onCommit={v => onReplace({ ...line, qty: v })} className="!text-xl !font-black" />
          </span>
        ) : (
          <span className="text-xl font-black text-slate-800 tabular-nums">{m.qty.toLocaleString('en-IN')} <span className="text-xs font-semibold text-slate-500">{m.unit}</span></span>
        )}
      </div>

      {civil && <CivilBlock line={line} room={rooms.find(r => r.name === line.roomId)} unit={m.unit} readOnly={readOnly} onReplace={onReplace} />}
      {measured && !line.place && !line.byRoom && !civil && <SizeField line={line} unit={m.unit} readOnly={readOnly} onReplace={onReplace} />}

      {line.byRoom && <SplitBlock m={m} rooms={rooms} bankMap={bankMap} rules={rules} readOnly={readOnly} hideFigures={hideFigures} onReplace={onReplace} />}
      {basis && !readOnly && rooms.length > 0 && <SplitOffer m={m} basis={basis} rooms={rooms} hideFigures={hideFigures} onReplace={onReplace} />}

      {specBank && line.materialSpecs && Object.keys(line.materialSpecs).length ? (
        <SpecBlock m={m} bank={specBank} readOnly={readOnly} offerUpdates={!!offerUpdates} hideFigures={hideFigures} onOpenRecipe={onOpenRecipe} onReplace={onReplace} />
      ) : (
      <div className={`rounded-xl border p-3 ${m.words && !/imported via excel/i.test(m.words) ? 'border-slate-200' : 'border-amber-200 bg-amber-50/60'}`}>
        <div className="flex items-center justify-between">
          <span className={LABEL}>Spec words</span>
          {!readOnly && editWords == null && <button type="button" onClick={() => setEditWords(m.words)} className="text-[11px] font-bold text-[#3D52A0] hover:underline inline-flex items-center gap-1"><PenLine className="w-3 h-3" aria-hidden />Edit</button>}
        </div>
        {editWords != null ? (
          <div className="mt-1.5 space-y-2">
            <textarea aria-label="Spec words" rows={3} value={editWords} onChange={e => setEditWords(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
            <div className="flex gap-2 justify-end">
              <Button size="sm" onClick={() => setEditWords(null)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={() => { onReplace({ ...line, specs: editWords }); setEditWords(null); }}>Save words</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-700 mt-1">{m.words || 'None yet'}</p>
            <p className="text-[11px] text-slate-500 mt-1">{specBank && m.item && !recipeOf(m.item, specBank) ? 'Typed by hand: this Item Bank item has no recipe yet.' : line.specs != null ? 'Typed on this line.' : 'From the Item Bank.'}</p>
          </>
        )}
      </div>
      )}

      {seesMargins && !hideFigures && (
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className={LABEL}>Price</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#3D52A0]"><Lock className="w-3 h-3" aria-hidden />Studio only</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Scrub label={`Cost/${m.unit || 'unit'}`} value={m.cost} step={10} pxPerStep={2} format={inr} disabled={readOnly} onCommit={v => onReplace(withCost(m, v))} />
            <Scrub label="Markup" value={m.markup} step={0.5} pxPerStep={4} max={400} format={v => `${v.toFixed(1)}%`} disabled={readOnly} onCommit={v => onReplace(withMarkup(m, v))} />
            <Scrub label="Rate" value={m.rate} step={10} pxPerStep={2} format={inr} disabled={readOnly} onCommit={v => onReplace(withRate(m, v))} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-[11px] font-bold ${marginTone(m.margin, floor)}`}>{m.margin.toFixed(1)}% margin</span>
            <span className="text-lg font-black text-slate-800 tabular-nums">{m.separate ? 'Not in the price' : m.billable ? inr(m.amount) : 'Not billed'}</span>
          </div>
        </div>
      )}
      {!seesMargins && !hideFigures && (
        <div className="rounded-xl border border-slate-200 px-3 py-2 flex items-baseline justify-between">
          <span className={LABEL}>Amount</span>
          <span className="text-lg font-black text-slate-800 tabular-nums">{m.billable ? inr(m.amount) : 'Not billed'}</span>
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {placed && <Button size="sm" icon={RotateCw} onClick={() => onReplace(turnedLine(line, 90))}>Turn 90°</Button>}
          {placed && <Button size="sm" icon={MapPin} onClick={onTakeOff}>Take off the plan</Button>}
          {!placed && m.draw && <Button size="sm" icon={MapPin} onClick={onPlace}>Place on the plan</Button>}
          <Button size="sm" icon={Copy} onClick={onDuplicate}>Duplicate</Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={onDelete}>Delete</Button>
        </div>
      )}
    </div>
  );
}

/** The size of a measured line not on the plan, typed as on site ("7 x 8", "6'6\" x 7'"): the quantity follows. */
function SizeField({ line, unit, readOnly, onReplace }: { line: BoqItem; unit: string; readOnly: boolean; onReplace: (l: BoqItem) => void }) {
  const shown = formatSize(readSize({ ...line, unit }));
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (text.trim() === shown) return;
    const size = parseSize(text);
    if (!size) { setBad(!!text.trim()); return; }
    setBad(false);
    onReplace({ ...line, ...sizeUpdates(size, unit) });
  };
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <label className={`${LABEL} block`} htmlFor={`size-${line.id}`}>Size</label>
      <input id={`size-${line.id}`} aria-label="Size" value={text} disabled={readOnly} placeholder={basisOfUnit(unit) === 'length' ? 'e.g. 8 ft' : 'e.g. 7 x 8'}
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
      <p className={`text-[11px] mt-1 ${bad ? 'text-rose-600' : 'text-slate-500'}`}>{bad ? 'Write it as width x height, in feet unless you say otherwise.' : `The quantity follows the size, in ${unit}.`}</p>
    </div>
  );
}

const BASIS_NAME: Record<ShareBasis, string> = {
  wallPaint: 'walls from the plan', ceilingPaint: 'ceilings from the plan', paint: 'walls and ceilings',
  falseCeiling: 'false ceiling area', points: 'points by room', carpetArea: 'floor area',
};

/** A whole-flat line, room by room (the approved mockup's split block). */
function SplitBlock({ m, rooms, bankMap, rules, readOnly, hideFigures, onReplace }: {
  m: LineModel; rooms: Room[]; bankMap: Map<string, Item>; rules: PricingRules | null; readOnly: boolean; hideFigures: boolean; onReplace: (l: BoqItem) => void;
}) {
  const line = m.line;
  const split = line.byRoom!;
  const shares = roomShares(split, rooms);
  const amounts = lineAmountsByRoom(line, bankMap, { rules, rooms });
  const paint = split.basis === 'wallPaint' || split.basis === 'ceilingPaint';
  const on = rooms.filter(r => (shares.get(r.name) || 0) > 0 || split.rooms?.[r.name]?.on === true);
  const total = byRoomQty(split, rooms);
  const unkept = { ...split, keep: undefined };
  const sumMeasured = round2(Array.from(roomShares(unkept, rooms).values()).reduce((a, b) => a + b, 0));
  const vs = paint ? on.map(r => planVsRule(split.basis as 'wallPaint' | 'ceilingPaint', r)) : [];
  const pl = vs.reduce((a, v) => a + v.plan, 0), ru = vs.reduce((a, v) => a + v.rule, 0);
  const set = (next: NonNullable<BoqItem['byRoom']>) => onReplace(setSplit(line, next, rooms));

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <span className={LABEL}>Room by room</span>
        <span className="text-[10px] text-slate-500">{on.length} of {rooms.length} rooms · {BASIS_NAME[split.basis]}</span>
      </div>
      {Number(split.keep) > 0 && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800">
          The typed total of {split.keep} {m.unit} is kept and shared in proportion.{' '}
          {!readOnly && <button type="button" onClick={() => set({ ...split, keep: undefined })} className="font-bold underline">Use the room figures ({sumMeasured})</button>}
        </div>
      )}
      <table className="w-full text-xs">
        <tbody>
          {rooms.map(r => {
            const q = shares.get(r.name) || 0;
            const s = split.rooms?.[r.name] || {};
            const isOn = q > 0 || s.on === true;
            const mq = round2(measureShare(split.basis, r, {}, !!split.rule));
            const v = paint ? planVsRule(split.basis as 'wallPaint' | 'ceilingPaint', r) : null;
            const setRoom = (patch: { on?: boolean; qty?: number }) => {
              const rs = { ...(split.rooms || {}) };
              const cur: { on?: boolean; qty?: number } = { ...(rs[r.name] || {}), ...patch };
              if (cur.qty === undefined) delete cur.qty;
              rs[r.name] = cur;
              set({ ...split, rooms: rs });
            };
            return (
              <tr key={r.name} className={`border-b border-slate-100 ${isOn ? '' : 'bg-slate-50/60'}`}>
                <td className="pl-3 py-1.5 w-7 align-top">
                  <input type="checkbox" checked={isOn} disabled={readOnly} onChange={e => setRoom({ on: e.target.checked })} aria-label={`${r.name} takes a share`} className="mt-0.5 w-3.5 h-3.5 accent-[#3D52A0]" />
                </td>
                <td className="py-1.5 pr-1 align-top">
                  <div className={`font-semibold truncate ${isOn ? 'text-slate-700' : 'text-slate-400'}`}>{r.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {!isOn ? 'left out' : v ? <><span className={split.rule ? '' : 'font-bold text-slate-600'}>plan {v.plan}</span> · <span className={split.rule ? 'font-bold text-slate-600' : ''}>carpet rule {v.rule}</span></> : split.basis === 'points' ? `room standard ${mq}` : `measured ${mq}`}
                  </div>
                </td>
                <td className="py-1.5 pr-1 text-right w-[80px] align-top">
                  <input inputMode="decimal" disabled={readOnly || !isOn} aria-label={`${r.name}: share`}
                    value={s.qty != null ? String(s.qty) : ''} placeholder={isOn ? String(round2(q)) : '—'}
                    onChange={e => setRoom({ qty: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                    className={`w-[72px] px-1.5 py-1 rounded-md border text-right tabular-nums text-xs ${s.qty != null ? 'border-[#3D52A0] bg-[#3D52A0]/5 font-bold text-slate-800' : 'border-slate-200 placeholder:text-slate-400'}`} />
                </td>
                {!hideFigures && <td className={`py-1.5 pr-3 text-right tabular-nums font-bold w-[74px] align-top pt-2.5 ${isOn ? 'text-slate-800' : 'text-slate-300'}`}>{inr(amounts.get(r.name) || 0)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td />
            <td className="py-2 font-bold text-slate-800">Whole flat</td>
            <td className="py-2 pr-1 text-right font-black tabular-nums">{round2(total).toLocaleString('en-IN')} <span className="font-normal text-slate-500">{m.unit}</span></td>
            {!hideFigures && <td className="py-2 pr-3 text-right font-black tabular-nums">{inr(m.amount)}</td>}
          </tr>
        </tfoot>
      </table>
      {paint && (
        <div className="px-3 py-2.5 border-t border-slate-100">
          <div className={`${LABEL} mb-1.5`}>Measure from</div>
          {readOnly ? <p className="text-xs text-slate-700">{split.rule ? 'The carpet-area rule' : 'The plan'}</p> : (
            <Segmented<'plan' | 'rule'> size="sm" label="Measure from" value={split.rule ? 'rule' : 'plan'}
              onChange={v => set({ ...split, rule: v === 'rule' || undefined })}
              options={[{ id: 'plan', label: 'The plan' }, { id: 'rule', label: `Carpet area × ${split.basis === 'wallPaint' ? RULE_WALL : RULE_CEILING}` }]} />
          )}
          <p className="text-[11px] text-slate-500 mt-1.5">The plan gives {pl.toLocaleString('en-IN')} {m.unit}; today’s rule gives {ru.toLocaleString('en-IN')} ({ru >= pl ? '+' : '−'}{Math.round((Math.abs(ru - pl) / Math.max(pl, 1)) * 100)}%). The rule is kept for rooms with no dimensions.</p>
        </div>
      )}
      <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-500">
        A faint figure is {split.basis === 'points' ? 'the room standard' : 'measured from the plan'}. Type over it for one room; clear it to go back. Untick a room to leave it out.
        {!readOnly && <> <button type="button" onClick={() => onReplace(unshare(line))} className="font-bold text-[#3D52A0] hover:underline">One figure for the flat</button></>}
      </div>
      <div className="px-3 py-2.5 border-t border-slate-100">
        <div className={`${LABEL} mb-1.5`}>The client sees</div>
        {!readOnly && (
          <Segmented<'flat' | 'rooms'> size="sm" label="Client view" value={split.client || 'flat'}
            onChange={v => set({ ...split, client: v })}
            options={[{ id: 'flat', label: 'One line for the flat' }, { id: 'rooms', label: 'A line in each room' }]} />
        )}
        <p className="text-[11px] text-slate-500 mt-1.5">{split.client === 'rooms'
          ? `The client BOQ prints ${m.name.toLowerCase()} under each room with that room’s quantity. Same rate, same total.`
          : `The client BOQ prints one line for ${round2(total).toLocaleString('en-IN')} ${m.unit}, as today.`}</p>
      </div>
    </div>
  );
}

/** A whole-flat line typed as one figure: split it by the room figures, or keep the figure and share it out. */
function SplitOffer({ m, basis, rooms, hideFigures, onReplace }: { m: LineModel; basis: ShareBasis; rooms: Room[]; hideFigures: boolean; onReplace: (l: BoqItem) => void }) {
  const line = m.line;
  const fresh = { basis, rooms: {}, client: 'flat' as const };
  const shares = roomShares(fresh, rooms);
  const sum = round2(Array.from(shares.values()).reduce((a, b) => a + b, 0));
  const d = (sum - m.qty) * m.rate;
  const split = (keep?: number) => {
    const s = shareIntoRooms(line, basis, rooms);
    onReplace({ ...s, roomId: line.roomId || 'Whole flat', ...(keep ? { byRoom: { ...s.byRoom!, keep }, qty: keep } : {}) });
  };
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
      <div className="text-xs font-bold text-slate-800">Typed as {m.qty.toLocaleString('en-IN')} {m.unit} for the whole flat</div>
      <p className="text-[11px] text-slate-600">Split it so each room carries its share, and change one room at a time. The room {basis === 'points' ? 'standards' : 'figures'} come to {sum.toLocaleString('en-IN')} {m.unit}:</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
        {rooms.map(r => <span key={r.name} className="flex justify-between gap-2"><span className="truncate">{r.name}</span><b className="tabular-nums">{round2(shares.get(r.name) || 0)}</b></span>)}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="primary" onClick={() => split()}>Use the room figures{hideFigures ? '' : ` (${d >= 0 ? '+' : '−'}${inr(Math.abs(d))})`}</Button>
        <Button size="sm" onClick={() => split(m.qty)}>Keep {m.qty.toLocaleString('en-IN')}, share it out</Button>
      </div>
    </div>
  );
}

/** A line built from a recipe: its parts, their versions, the finish as tiles, and the words they make. */
function SpecBlock({ m, bank, readOnly, offerUpdates, hideFigures, onOpenRecipe, onReplace }: {
  m: LineModel; bank: MaterialSpecsBank; readOnly: boolean; offerUpdates: boolean; hideFigures: boolean;
  onOpenRecipe?: (itemId: string) => void; onReplace: (l: BoqItem, msg?: string) => void;
}) {
  const line = m.line;
  /* A finish priced as a range: shown in a shade, which names it and never moves the price. */
  const shadeRow = (part: string, s: { shade?: string }, r: MaterialRange) => (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-700 truncate">Shade: {s.shade || <span className="font-semibold text-slate-500">chosen at Selections</span>}</span>
        <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{r.count.toLocaleString('en-IN')}+ · one price</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
        {r.examples.map(e => {
          const on = s.shade === e.name;
          return (
            <button key={e.name} type="button" disabled={readOnly} title={e.name} aria-label={`Show it in ${e.name}`} aria-pressed={on}
              onClick={() => onReplace(withShade(bank, line, m.item, part, on ? null : e.name), on ? `${m.name}: shade left for Selections` : `${m.name}: shown in ${e.name}. Same price, any shade in the range costs the same.`)}
              className={`w-5 h-5 rounded-full border ${on ? 'ring-2 ring-[#3D52A0] ring-offset-1 border-white' : 'border-slate-300'}`} style={{ background: e.hex }} />
          );
        })}
        {r.count > r.examples.length && <span className="text-[10px] font-bold text-slate-400 ml-0.5">+{(r.count - r.examples.length).toLocaleString('en-IN')} at the studio</span>}
      </div>
    </div>
  );
  const recipe = m.item ? recipeOf(m.item, bank) : null;
  const fin = finishPartOf(recipe)?.part;
  const stale = offerUpdates ? m.stale : [];
  const [own, setOwn] = useState<string>(line.specs || '');
  const shortName = (n: string) => n.split(',')[0].replace(' laminate', '').replace('Natural veneer', 'Veneer').replace(' high gloss', '');
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <span className={LABEL}>Material specs</span>
        {onOpenRecipe && m.item && <button type="button" onClick={() => onOpenRecipe(m.item!.id)} className="text-[11px] font-bold text-[#3D52A0] hover:underline">Item recipe ↗</button>}
      </div>
      {stale.length > 0 && !readOnly && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-[11px] text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
          <span className="flex-1">Newer spec out for {stale.join(', ').toLowerCase()}.</span>
          <button type="button" onClick={() => onReplace(updatedLine(bank, line, m.item))} className="px-2 py-1 rounded-lg bg-[#3D52A0] text-white font-bold">Update</button>
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {Object.entries(line.materialSpecs || {}).map(([part, s]) => {
          const mat = bank.materials.find(x => x.id === s.id);
          const h = versionAt(bank, s.id, s.v);
          const now = currentVersion(bank, s.id)?.v || s.v;
          const old = offerUpdates && s.v < now;
          const isFin = part === fin;
          return (
            <div key={part} className="px-3 py-2">
              <div className="text-[11px] font-bold text-slate-500 mb-1">{part}</div>
              <div className="flex items-center gap-2">
                {isFin || !mat ? (
                  <span className="flex-1 text-xs font-semibold text-slate-800 truncate">{mat?.name || s.id}</span>
                ) : (
                  <select aria-label={part} value={s.id} disabled={readOnly} onChange={e => onReplace(withPart(bank, line, m.item, part, e.target.value))}
                    className="min-w-0 flex-1 px-1.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold bg-white disabled:bg-slate-50">
                    {materialsIn(bank, mat.fam).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
                <span title={h?.at ? new Date(h.at).toLocaleDateString('en-GB') : 'Studio standard'}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${old ? 'bg-amber-100 text-amber-700' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}>v{s.v}{old ? ` → v${now}` : ''}</span>
              </div>
              {isFin && mat && (
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {materialsIn(bank, mat.fam).map(x => {
                    const d = finishDelta(bank, line, m.item, part, x.id, m.markup, m.qty);
                    const on = x.id === mat.id;
                    return (
                      <button key={x.id} type="button" disabled={readOnly} aria-pressed={on} title={x.name}
                        onClick={() => !on && onReplace(withPart(bank, line, m.item, part, x.id))}
                        className={`rounded-lg p-1 border ${on ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/25' : 'border-slate-200 hover:border-slate-300'}`}>
                        <svg viewBox="0 0 3 1.4" className="w-full h-6 rounded" aria-hidden focusable="false"><rect width="3" height="1.4" fill={x.swatch ? `url(#${x.swatch})` : '#e2e8f0'} /></svg>
                        <span className="block text-[10px] font-bold text-slate-600 truncate">{shortName(x.name)}</span>
                        {!hideFigures && <span className={`block text-[10px] font-bold tabular-nums ${Math.abs(d) < 1 ? 'text-slate-400' : d > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{Math.abs(d) < 1 ? 'now' : `${d > 0 ? '+' : '−'}${lakh(Math.abs(d))}`}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {!isFin && h?.range && <div className="text-[10px] text-slate-400 mt-1">Any of {h.range.count.toLocaleString('en-IN')}+ {h.range.unit}, picked at Selections</div>}
              {isFin && h?.range && shadeRow(part, s, h.range)}
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2.5 bg-[#3D52A0]/[0.04] border-t border-slate-100">
        <div className="flex items-center justify-between">
          <span className={LABEL}>What the client reads</span>
          {!readOnly && (line.specsOwn
            ? <button type="button" onClick={() => onReplace(withRecipeWords(bank, line))} className="text-[11px] font-bold text-[#3D52A0] hover:underline">Back to the recipe</button>
            : <button type="button" onClick={() => { setOwn(line.specs || ''); onReplace(withOwnWords(line)); }} className="text-[11px] font-bold text-[#3D52A0] hover:underline">Write my own</button>)}
        </div>
        {line.specsOwn && !readOnly ? (
          <>
            <textarea aria-label="Own words" rows={3} value={own} onChange={e => setOwn(e.target.value)} onBlur={() => own !== line.specs && onReplace(withOwnWords(line, own))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] bg-white" />
            <p className="text-[11px] text-amber-700 mt-1">Own words do not follow new versions.</p>
          </>
        ) : <p className="text-xs text-slate-700 mt-1">{line.specs}</p>}
      </div>
    </div>
  );
}

const setSplit = (line: BoqItem, byRoom: NonNullable<BoqItem['byRoom']>, rooms: Room[]): BoqItem => {
  const b = { ...byRoom };
  if (!b.rule) delete (b as any).rule;
  return { ...line, byRoom: b, qty: byRoomQty(b, rooms) };
};

function ShareRowEdit({ line, room, q, amount, unit, readOnly, hideFigures, rooms, onReplace }: {
  line: BoqItem; room: Room; q: number; amount: number; unit: string; readOnly: boolean; hideFigures: boolean; rooms: Room[]; onReplace: (l: BoqItem) => void;
}) {
  const s = line.byRoom!.rooms?.[room.name] || {};
  const on = q > 0 || s.on === true;
  const set = (patch: { on?: boolean; qty?: number }) => {
    const rs = { ...(line.byRoom!.rooms || {}) };
    const cur: { on?: boolean; qty?: number } = { ...(rs[room.name] || {}), ...patch };
    if (cur.qty === undefined) delete cur.qty;
    rs[room.name] = cur;
    onReplace(setSplit(line, { ...line.byRoom!, rooms: rs }, rooms));
  };
  return (
    <div className={`px-3 py-2 text-xs flex items-center gap-2 ${on ? '' : 'bg-slate-50/60'}`}>
      <input type="checkbox" checked={on} disabled={readOnly} onChange={e => set({ on: e.target.checked })}
        aria-label={`${room.name} takes a share`} className="w-3.5 h-3.5 accent-[#3D52A0] shrink-0" />
      <span className={`flex-1 min-w-0 truncate ${on ? 'text-slate-700' : 'text-slate-400'}`}>{room.name}{on ? '' : ' · left out'}</span>
      <input inputMode="decimal" disabled={readOnly || !on} aria-label={`${room.name}: share`}
        value={s.qty != null ? String(s.qty) : ''} placeholder={on ? String(round2(q)) : '—'}
        onChange={e => set({ qty: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
        className={`w-16 px-1.5 py-1 rounded-md border text-right tabular-nums ${s.qty != null ? 'border-[#3D52A0] bg-[#3D52A0]/5 font-bold' : 'border-slate-200 placeholder:text-slate-400'}`} />
      <span className="text-[10px] text-slate-400 w-8">{unit}</span>
      {!hideFigures && <b className={`tabular-nums w-[76px] text-right ${on ? 'text-slate-800' : 'text-slate-300'}`}>{inr(amount)}</b>}
    </div>
  );
}

/* ───────────────────────────── a room ───────────────────────────── */

export function RoomInspector({ room, models, shares, total, rooms, bankMap, rules, measure, readOnly, hideFigures, canPaint, onAddPainting, onSel, onClose, onReplace, civilShown, onCivil }: {
  room: Room;
  models: LineModel[];
  shares: ShareRow[];
  total: number;
  rooms: Room[];
  bankMap: Map<string, Item>;
  rules: PricingRules | null;
  measure?: MeasureContext;
  readOnly: boolean;
  hideFigures: boolean;
  canPaint: boolean;
  onAddPainting: () => void;
  onSel: (id: string) => void;
  onClose: () => void;
  onReplace: (l: BoqItem) => void;
  /** The Civil layer is on: the room's civil work is shown even when it has none (PR C). */
  civilShown?: boolean;
  /** A room tool toggled for the room: re-flooring, wall tiles, waterproofing. */
  onCivil?: (tool: 'floor' | 'walls7' | 'waterproof') => void;
}) {
  const p = room.plan;
  const civilLines = models.filter(m => m.line.civil);
  const mr = measureRoom(room, measure);
  const servicesTotal = shares.reduce((a, s) => a + s.amount, 0);
  const own = total - servicesTotal;
  const kind = (room.kind || '').toString();
  return (
    <div className="p-4 space-y-3 hud-swap">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><MapIcon className="w-5 h-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-slate-800">{room.name}</div>
          <div className="text-[11px] text-slate-500">{models.length} items{hideFigures ? '' : ` · ${inr(total)}`}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
      </div>
      {p && (
        <div className="grid grid-cols-3 gap-1.5">
          {[['Length', ftin(p.w)], ['Width', ftin(p.h)], ['Height', ftin(Number(room.height) > 0 ? Number(room.height) : 10)]].map(([a, b]) => (
            <div key={a} className="rounded-xl border border-slate-200 px-2.5 py-1.5"><div className={LABEL}>{a}</div><div className="text-sm font-black tabular-nums">{b}</div></div>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className={LABEL}>{p ? 'Measured from the plan' : 'Measured'}</span>
          <span className="text-[10px] text-slate-500">{room.doors ?? 1} door{(room.doors ?? 1) === 1 ? '' : 's'} · {room.windows ?? 0} window{room.windows === 1 ? '' : 's'}</span>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          <div className="px-3 py-2 flex justify-between"><span className="text-slate-600">Floor area</span><b className="tabular-nums">{Math.round(mr.area)} sq ft</b></div>
          <div className="px-3 py-2">
            <div className="flex justify-between"><span className="text-slate-600">Walls to paint</span><b className="tabular-nums">{Math.round(mr.wall)} sq ft</b></div>
            <div className="text-[10px] text-slate-400 mt-0.5">{mr.derivation}</div>
            {!/toilet|bath/i.test(kind + room.name) && <div className="text-[10px] text-amber-700 mt-0.5">Carpet-area rule (× {RULE_WALL}) would say {Math.round(mr.area * RULE_WALL)} sq ft</div>}
          </div>
          <div className="px-3 py-2 flex justify-between"><span className="text-slate-600">Ceiling</span><b className="tabular-nums">{Math.round(mr.ceiling)} sq ft</b></div>
        </div>
      </div>

      <div>
        <div className={`${LABEL} mb-1.5`}>Services in this room</div>
        {shares.length > 0 ? (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {shares.map(s => (
              <div key={s.model.line.id}>
                <button type="button" onClick={() => onSel(s.model.line.id)} className="block w-full text-left px-3 pt-2 text-xs font-semibold text-slate-700 hover:text-[#3D52A0]">{s.model.name}</button>
                <ShareRowEdit line={s.model.line} room={room} q={s.qty} amount={s.amount} unit={s.model.unit} readOnly={readOnly} hideFigures={hideFigures} rooms={rooms} onReplace={onReplace} />
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-slate-500">No whole-flat service shared into this room yet.</p>}
        {canPaint && !readOnly && <div className="mt-2"><Button size="sm" icon={PaintRoller} onClick={onAddPainting}>Add painting from the plan</Button></div>}
        <p className="text-[11px] text-slate-500 mt-1">One line for the flat, one rate. This room’s share is measured here and can be typed over.</p>
      </div>

      {onCivil && p && (civilShown || civilLines.length > 0) && <CivilRoom room={room} lines={civilLines} readOnly={readOnly} onToggle={onCivil} onSel={onSel} />}

      <div>
        <div className={`${LABEL} mb-1.5`}>Items in this room</div>
        {models.map(m => (
          <button key={m.line.id} type="button" onClick={() => onSel(m.line.id)} className="w-full flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50 text-left">
            <span className="w-7 h-6 shrink-0">{thumbOf(m, 'w-7 h-6')}</span>
            <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate">{m.name}</span>
            {!hideFigures && <span className="text-xs font-bold tabular-nums">{inr(m.amount)}</span>}
          </button>
        ))}
        {models.length === 0 && <p className="text-xs text-slate-500">No items yet. Drag from the library onto the room.</p>}
      </div>

      {!hideFigures && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-slate-600">Items</span><b className="tabular-nums">{inr(own)}</b></div>
          <div className="flex justify-between"><span className="text-slate-600">Share of services</span><b className="tabular-nums">{inr(servicesTotal)}</b></div>
          <div className="flex justify-between pt-1 border-t border-slate-200 text-sm"><span className="font-bold text-slate-800">{room.name}</span><b className="font-black tabular-nums">{inr(total)}</b></div>
        </div>
      )}
    </div>
  );
}
