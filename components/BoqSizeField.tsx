import React, { useEffect, useState } from 'react';
import { BoqItem } from '../types';
import {
  SizeUnit, readSize, qtyFromSize, sizeUpdates, CLEAR_SIZE, formatSize,
  parseSize,
} from '../lib/boqSize';

/*
  The size of a piece, typed once, and the quantity that follows from it.

  One text cell, in the full grid (Sheet → Open the full grid), where "7 x 8"
  or "2100 x 2400 mm" is quicker to type than three boxes. It writes the same
  fields as the BOQ Playground's inspector, through lib/boqSize.ts. (The panel
  shape went with the Focus Editor and the card view, PR 7b.)
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
