import React, { useEffect, useState } from 'react';

/*
  A number field for the founders' assumptions. It keeps what is typed ("2.",
  or nothing at all) while the plan holds a clean number, so a figure can be
  cleared and retyped without the field filling itself with a zero. Styled as
  TargetsModal's fields.
*/

const shown = (v: number | null) => (v == null || !Number.isFinite(v) ? '' : String(Math.round(v * 100) / 100));

export const NumInput: React.FC<{
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  pre?: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  /** Narrow, for a table cell. */
  narrow?: boolean;
}> = ({ label, value, onChange, pre, unit, step = 1, min = 0, max, narrow }) => {
  const [text, setText] = useState(shown(value));
  /* Follow the plan when it changes from elsewhere (a reset), not while this field is being typed in. */
  useEffect(() => {
    const t = text.trim();
    /* A cleared field the plan reads as zero stays cleared. */
    if (t === '' ? value != null && value !== 0 : Number(t) !== value) setText(shown(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className={`flex items-center gap-1.5 min-w-0 ${narrow ? 'max-w-[150px]' : ''}`}>
      {pre && <span className="text-xs text-slate-500">{pre}</span>}
      <input type="number" inputMode="decimal" aria-label={label} step={step} min={min} max={max} value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === '') { onChange(null); return; }
          const v = Number(t);
          if (Number.isFinite(v)) onChange(max != null ? Math.min(max, v) : v);
        }}
        className="w-full min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
      {unit && <span className="text-xs text-slate-500 whitespace-nowrap">{unit}</span>}
    </span>
  );
};
