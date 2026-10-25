import React from 'react';
import { parseSpec, specLabel, ParsedSpec } from '../../lib/specText';
import { isPlaceholderText } from '../../lib/detailedBoq';

/**
 * A BOQ line's specification on the client's Design & Scope tab.
 *
 * The client asked to see what each line includes, excludes and is made of
 * before signing it. Hiding all of that behind a click per line meant nobody
 * read it, so the summary always shows under the item name, a switch above the
 * table opens every line at once, and a line can be opened on its own.
 */

export type SpecView = 'summary' | 'full';

/** A description worth showing: not empty and not a placeholder an import wrote. */
export const readSpec = (description: unknown): ParsedSpec | null => {
  if (isPlaceholderText(description)) return null;
  const spec = parseSpec(description);
  return spec.summary || spec.sections.length ? spec : null;
};

const TONE: Record<string, string> = {
  INCLUDES: 'text-emerald-700',
  EXCLUDES: 'text-rose-700',
};

/** Under the item name: the one-line summary and the switch for this line. */
export const LineSpecSummary: React.FC<{
  spec: ParsedSpec;
  open: boolean;
  /** Absent when the table shows every line in full. */
  onToggle?: () => void;
}> = ({ spec, open, onToggle }) => (
  <div className="mt-1 max-w-[520px]">
    {spec.summary && <p className="text-[11px] leading-relaxed text-slate-600">{spec.summary}</p>}
    {onToggle && spec.sections.length > 0 && (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="mt-1 text-left text-[11px] font-bold text-[#3D52A0] hover:text-[#334486] cursor-pointer"
      >
        {open ? 'Hide specification' : 'Full specification'}
      </button>
    )}
  </div>
);

/** The full specification: every section, set out across the width of the table. */
export const LineSpecDetail: React.FC<{ spec: ParsedSpec; note?: string }> = ({ spec, note }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 hud-row-in">
    {/* Columns, not a grid: a short section beside a long one leaves no gap. */}
    <div className="md:columns-2 gap-x-8">
      {spec.sections.map((sec, i) => (
        <div key={i} className="min-w-0 break-inside-avoid mb-3 last:mb-0">
          {sec.label && (
            <p className={`text-[10px] font-bold uppercase tracking-wider ${TONE[sec.label] || 'text-slate-500'}`}>
              {specLabel(sec.label)}
            </p>
          )}
          {sec.items.length === 1 ? (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{sec.items[0]}</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {sec.items.map((it, j) => (
                <li key={j} className="flex gap-2 text-xs leading-relaxed text-slate-700">
                  <span className="text-slate-400 shrink-0">•</span>
                  <span className="min-w-0">{it}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
    {note && <p className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-500">Note · {note}</p>}
  </div>
);

/** Above the table: summaries only, or every line in full. */
export const SpecViewSwitch: React.FC<{ value: SpecView; onChange: (v: SpecView) => void }> = ({ value, onChange }) => (
  <div className="inline-flex p-1 rounded-xl bg-slate-100" role="group" aria-label="How much of each specification to show">
    {([['summary', 'Summaries'], ['full', 'Full specifications']] as [SpecView, string][]).map(([v, label]) => (
      <button
        key={v}
        type="button"
        onClick={() => onChange(v)}
        aria-pressed={value === v}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
          value === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);
