import React, { useMemo, useState } from 'react';
import { Receipt as ReceiptIcon, ChevronLeft, ChevronRight, X, Lock, RotateCw, Copy, Trash2, Map as MapIcon, Layers, MapPin, PaintRoller, PenLine } from 'lucide-react';
import { Button, Chip, Segmented, LABEL } from '../ui/kit';
import type { BoqItem, Item, PricingRules, Room } from '../../types';
import { SCOPE_BUCKETS } from '../../lib/scopeBuckets';
import { ftin, round2 } from '../../lib/playground/geometry';
import { roomShares, measureRoom, planVsRule, byRoomQty, RULE_WALL, type MeasureContext } from '../../lib/playground/rooms';
import { lineAmountsByRoom } from '../../lib/playground/pricing';
import { unshare, shareIntoRooms, shareBasisFor, isWholeFlatLine } from '../../lib/playground/versions';
import { resizedTo, turnedLine } from '../../lib/playground/board';
import { ISSUE_LABEL, type IssueKind } from '../../lib/playground/issues';
import { basisOfUnit, readSize, parseSize, formatSize, sizeUpdates } from '../../lib/boqSize';
import { PieceThumb } from './pieceArt';
import { inr, marginTone, Scrub, withCost, withMarkup, withRate, type LineModel } from './playgroundUi';

/*
  The right-hand panel of the BOQ Playground (the approved mockup's inspector).

  With nothing selected it is the Live BOQ: the version as the client is
  charged it, room by room, each line with its picture and its words, the
  whole-flat services shared into the rooms, and the work total. Select a line
  and it becomes that line's inspector; select a room and it becomes the room's.
*/

const thumbOf = (m: LineModel, cls: string) => (m.draw && m.size
  ? <PieceThumb kind={m.draw.kind} w={m.size.w} d={m.size.d} words={m.words} className={cls} />
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

export function Receipt({ models, rooms, roomTotals, shares, workTotal, tierName, sel, onSel, onRoom, hideFigures, hint, onHint, onLens, onHide }: {
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
}) {
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
                  <span className="block text-xs font-semibold text-slate-700 truncate">{m.name}</span>
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

export function LineInspector({ m, index, count, issues, rooms, bankMap, rules, readOnly, seesMargins, hideFigures, floor, onReplace, onStep, onClose, onDuplicate, onDelete, onTakeOff, onPlace }: {
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
  onReplace: (line: BoqItem) => void;
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
  const qtyLabel = line.byRoom ? 'Whole flat, room by room'
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
            onCommit={v => onReplace(resizedTo(line, m.item, v, m.size!.h, m.size!.d))} />
          <Scrub label="Height" value={m.size.h} step={0.25} min={0.5} pxPerStep={6} format={ftin} disabled={readOnly}
            onCommit={v => onReplace(resizedTo(line, m.item, m.size!.w, v, m.size!.d))} />
          <Scrub label="Depth" value={m.size.d} step={0.25} min={0.25} pxPerStep={6} format={ftin} disabled={readOnly}
            onCommit={v => onReplace(resizedTo(line, m.item, m.size!.w, m.size!.h, v))} />
          <Scrub label="Turn" value={line.place!.rot} step={15} min={0} max={345} pxPerStep={3} format={v => `${Math.round(v)}°`} disabled={readOnly}
            onCommit={v => onReplace({ ...line, place: { ...line.place!, rot: ((Math.round(v) % 360) + 360) % 360 } })} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#3D52A0]/[0.05] border border-[#3D52A0]/15 px-3 py-2">
        <span className="text-xs text-slate-600">{qtyLabel}</span>
        {!sizeDriven && !line.byRoom && !readOnly ? (
          <span className="w-28">
            <Scrub variant="cell" label="Quantity" value={m.qty} step={1} min={0} pxPerStep={8} format={v => `${v.toLocaleString('en-IN')} ${m.unit}`}
              onCommit={v => onReplace({ ...line, qty: v })} className="!text-xl !font-black" />
          </span>
        ) : (
          <span className="text-xl font-black text-slate-800 tabular-nums">{m.qty.toLocaleString('en-IN')} <span className="text-xs font-semibold text-slate-500">{m.unit}</span></span>
        )}
      </div>

      {measured && !line.place && !line.byRoom && <SizeField line={line} unit={m.unit} readOnly={readOnly} onReplace={onReplace} />}

      {line.byRoom && <SplitBlock m={m} rooms={rooms} bankMap={bankMap} rules={rules} readOnly={readOnly} hideFigures={hideFigures} onReplace={onReplace} />}
      {basis && !readOnly && rooms.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-xs font-bold text-slate-800">Typed for the whole flat, not split yet</div>
          <p className="text-[11px] text-slate-600 mt-0.5">{m.qty.toLocaleString('en-IN')} {m.unit} as one figure. Split it by room so each room carries its share, measured from the plan.</p>
          <div className="mt-2"><Button size="sm" variant="primary" onClick={() => onReplace({ ...shareIntoRooms(line, basis, rooms), roomId: line.roomId || 'Whole flat' })}>Split by room</Button></div>
        </div>
      )}

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
            <p className="text-[11px] text-slate-500 mt-1">{line.specs != null ? 'Typed on this line.' : 'From the Item Bank.'} The client reads these words.</p>
          </>
        )}
      </div>

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

/** A whole-flat line's rooms: on or off, each share measured or typed, and its amount. */
function SplitBlock({ m, rooms, bankMap, rules, readOnly, hideFigures, onReplace }: {
  m: LineModel; rooms: Room[]; bankMap: Map<string, Item>; rules: PricingRules | null; readOnly: boolean; hideFigures: boolean; onReplace: (l: BoqItem) => void;
}) {
  const line = m.line;
  const split = line.byRoom!;
  const shares = roomShares(split, rooms);
  const amounts = lineAmountsByRoom(line, bankMap, { rules, rooms });
  const paint = split.basis === 'wallPaint' || split.basis === 'ceilingPaint';
  const ruleTotal = paint ? rooms.reduce((a, r) => a + (shares.get(r.name) ? planVsRule(split.basis as 'wallPaint' | 'ceilingPaint', r).rule : 0), 0) : 0;
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <span className={LABEL}>By room</span>
        {!readOnly && <button type="button" onClick={() => onReplace(unshare(line))} className="text-[11px] font-bold text-[#3D52A0] hover:underline">One figure for the flat</button>}
      </div>
      {paint && !readOnly && (
        <div className="px-3 pt-2">
          <Segmented<'plan' | 'rule'> size="sm" label={`How ${m.name} is measured`} value={split.rule ? 'rule' : 'plan'}
            onChange={v => onReplace(setSplit(line, { ...split, rule: v === 'rule' || undefined }, rooms))}
            options={[{ id: 'plan', label: 'From the plan' }, { id: 'rule', label: `Carpet-area rule · ${Math.round(ruleTotal)}` }]} />
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {rooms.map(r => <React.Fragment key={r.name}><ShareRowEdit line={line} room={r} q={shares.get(r.name) || 0} amount={amounts.get(r.name) || 0} unit={m.unit} readOnly={readOnly} hideFigures={hideFigures} rooms={rooms} onReplace={onReplace} /></React.Fragment>)}
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

export function RoomInspector({ room, models, shares, total, rooms, bankMap, rules, measure, readOnly, hideFigures, canPaint, onAddPainting, onSel, onClose, onReplace }: {
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
}) {
  const p = room.plan;
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
