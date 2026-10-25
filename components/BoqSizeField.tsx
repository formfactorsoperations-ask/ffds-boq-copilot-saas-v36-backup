import React, { useEffect, useState } from 'react';
import { BoqItem } from '../types';
import {
  SizeUnit, LineSize, readSize, qtyFromSize, sizeUpdates, CLEAR_SIZE, formatSize,
  parseSize, basisOfUnit,
} from '../lib/boqSize';

/*
  The size of a piece, typed once, and the quantity that follows from it.

  Two shapes of the same control: a full panel for the Focus Editor and the
  card view, where there is room to say what each box is; and a single text
  cell for the Excel view, where "7 x 8" or "2100 x 2400 mm" is quicker to
  type than three boxes. Both write the same fields through lib/boqSize.ts.
*/

type SizedLine = Pick<BoqItem, 'id' | 'qty' | 'calcLength' | 'calcWidth' | 'calcMultiplier' | 'sizeUnit'> & { unit?: string };

const UNIT_CHOICES: SizeUnit[] = ['ft', 'in', 'mm', 'm'];
const UNIT_KEY = 'ffds_boq_size_unit';

/** The unit this studio last typed a size in, remembered per browser. */
export function useSizeUnit(): [SizeUnit, (u: SizeUnit) => void] {
  const [unit, setUnit] = useState<SizeUnit>(() => {
    try {
      const v = localStorage.getItem(UNIT_KEY) as SizeUnit | null;
      return v && UNIT_CHOICES.includes(v) ? v : 'ft';
    } catch { return 'ft'; }
  });
  const remember = (u: SizeUnit) => {
    setUnit(u);
    try { localStorage.setItem(UNIT_KEY, u); } catch { /* private mode */ }
  };
  return [unit, remember];
}

/** Why a size gave no quantity. (The project is not strict, so the union does not narrow.) */
const reasonOf = (r: ReturnType<typeof qtyFromSize>): string => ('reason' in r ? r.reason : '');

const num = (v: string): number | undefined => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const fieldCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50 tabular-nums';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';

/** The full control: unit, dimensions, pieces, and what they come to. */
export const SizePanel: React.FC<{
  line: SizedLine;
  onChange: (updates: Partial<BoqItem>) => void;
  disabled?: boolean;
}> = ({ line, onChange, disabled }) => {
  const [defaultUnit, rememberUnit] = useSizeUnit();
  const stored = readSize(line);
  const unit: SizeUnit = stored?.unit || (line.sizeUnit as SizeUnit) || defaultUnit;
  const basis = basisOfUnit(line.unit);
  const size: LineSize = { a: stored?.a, b: stored?.b, nos: line.calcMultiplier || undefined, unit };
  const result = qtyFromSize(stored ? size : null, line.unit);
  const overridden = result.ok && Math.abs(result.qty - (Number(line.qty) || 0)) > 0.01;

  const write = (next: Partial<LineSize>) => onChange(sizeUpdates({ ...size, ...next }, line.unit));

  const firstLabel = basis === 'length' ? 'Length' : 'Width';
  const showSecond = basis !== 'length';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="size-panel">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={labelCls.replace(' mb-1.5', '')}>Size</span>
        <div className="inline-flex p-1 rounded-xl bg-slate-100" role="group" aria-label="Size unit">
          {UNIT_CHOICES.map(u => (
            <button
              key={u}
              type="button"
              disabled={disabled}
              aria-pressed={unit === u}
              onClick={() => { rememberUnit(u); if (stored) write({ unit: u }); else onChange({ sizeUnit: u }); }}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-colors ${unit === u ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >{u}</button>
          ))}
        </div>
      </div>

      <div className={`grid gap-2 items-end ${showSecond ? 'grid-cols-[1fr_auto_1fr_auto_72px]' : 'grid-cols-[1fr_auto_72px]'}`}>
        <div>
          <label className={labelCls}>{firstLabel}</label>
          <input
            type="number" inputMode="decimal" step="any" min="0" disabled={disabled}
            aria-label={`${firstLabel} (${unit})`}
            value={size.a ?? ''}
            onChange={e => write({ a: num(e.target.value) })}
            placeholder={unit}
            className={fieldCls}
          />
        </div>
        {showSecond && (<>
          <span className="pb-2 text-slate-400 text-sm">×</span>
          <div>
            <label className={labelCls}>Height</label>
            <input
              type="number" inputMode="decimal" step="any" min="0" disabled={disabled}
              aria-label={`Height (${unit})`}
              value={size.b ?? ''}
              onChange={e => write({ b: num(e.target.value) })}
              placeholder={unit}
              className={fieldCls}
            />
          </div>
        </>)}
        <span className="pb-2 text-slate-400 text-sm">×</span>
        <div>
          <label className={labelCls} title="How many identical pieces">Nos</label>
          <input
            type="number" inputMode="decimal" step="any" min="0" disabled={disabled}
            aria-label="Number of pieces"
            value={line.calcMultiplier && line.calcMultiplier !== 1 ? line.calcMultiplier : ''}
            onChange={e => write({ nos: num(e.target.value) })}
            placeholder="1"
            className={fieldCls}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 min-h-[20px]">
        {result.ok ? (
          <span className="text-[11px] text-slate-500" data-testid="size-working">
            {result.working}{!overridden && <span className="text-emerald-700 font-semibold"> · sets the quantity</span>}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">
            {stored ? reasonOf(result) : basis === 'count'
              ? 'Optional: the size is noted on the line, quantity is the number of pieces'
              : basis === 'lump'
                ? 'Optional: the size is noted on the line'
                : `Type the size and the quantity is worked out in ${line.unit || 'the item unit'}`}
          </span>
        )}
        {stored && !disabled && (
          <button type="button" onClick={() => onChange(CLEAR_SIZE)} className="text-[11px] font-bold text-slate-400 hover:text-slate-700 shrink-0">Clear size</button>
        )}
      </div>

      {overridden && result.ok && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
          <span className="text-[11px] text-amber-800">Quantity {line.qty} was typed in; the size gives {result.qty}.</span>
          {!disabled && (
            <button type="button" onClick={() => onChange({ qty: result.qty })} className="text-[11px] font-bold text-amber-800 hover:text-amber-900 shrink-0">Use {result.qty}</button>
          )}
        </div>
      )}
    </div>
  );
};

/** One text cell: "7 x 8", "2100 x 2400 mm", "7'6\" x 8'". Commits on Enter or leaving the cell. */
export const SizeCell: React.FC<{
  line: SizedLine;
  onChange: (updates: Partial<BoqItem>) => void;
  defaultUnit: SizeUnit;
  disabled?: boolean;
}> = ({ line, onChange, defaultUnit, disabled }) => {
  const shown = formatSize(readSize(line));
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) { setText(shown); setBad(false); } }, [shown, editing]);

  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (t === shown) return;
    if (!t) { onChange(CLEAR_SIZE); setBad(false); return; }
    const parsed = parseSize(t, defaultUnit);
    if (!parsed) { setBad(true); setEditing(true); return; }
    setBad(false);
    onChange(sizeUpdates(parsed, line.unit));
  };

  const result = qtyFromSize(readSize(line), line.unit);
  const overridden = result.ok && Math.abs(result.qty - (Number(line.qty) || 0)) > 0.01;

  return (
    <div>
      <input
        type="text"
        disabled={disabled}
        aria-label="Size"
        aria-invalid={bad || undefined}
        value={text}
        placeholder="W × H"
        onFocus={() => setEditing(true)}
        onChange={e => { setText(e.target.value); setBad(false); }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setText(shown); setBad(false); setEditing(false); (e.target as HTMLInputElement).blur(); }
        }}
        title={bad ? `Couldn't read that size. Try 7 x 8, 2100 x 2400 mm or 7'6" x 8'` : 'Width × height, in ft unless you type a unit. Add "x 2" for two pieces.'}
        className={`bg-transparent border-b outline-none transition-all w-full px-1 py-0.5 text-xs tabular-nums ${
          bad ? 'border-rose-400 text-rose-700' : 'border-transparent hover:border-slate-300 focus:border-[#3D52A0] focus:bg-white text-slate-700'
        }`}
      />
      {bad && <div className="text-[10px] text-rose-600 mt-0.5">Try 7 x 8 or 2100 x 2400 mm</div>}
      {!bad && result.ok && (
        <div className={`text-[10px] mt-0.5 ${overridden ? 'text-amber-700' : 'text-slate-400'}`} title={result.working}>
          {overridden ? `size gives ${result.qty}` : `= ${result.qty} ${line.unit || ''}`}
        </div>
      )}
    </div>
  );
};

/** "7 × 8 ft" for showing on a line, or nothing. */
export const sizeLabel = (line: SizedLine): string => formatSize(readSize(line));
