/*
  One header for every console screen.

  Started as the settings header; the templates and bank library needed the
  same frame, so it moved here rather than being copied. Three screens now use
  it: studio settings, communication templates, and the studio library.

  The two tabs had been built at different times and looked it: the settings
  side had an instrument-panel header with a readiness dial, while the templates
  side opened with a rounded card, its own heading, a pill counter and a
  differently-styled search. Switching between them read as moving between two
  applications.

  Both answer the same shape of question -- how much of this is set up -- so
  both get the same frame: title, state light, drawn rule, one search, and a
  dial on the right reporting the ratio that matters for that tab.
*/

import React from 'react';
import { Gauge, Dot } from './HudBits';
import { Search, X } from 'lucide-react';

export interface ConsoleHeaderProps {
  title: string;
  /** Sits beside the title in small caps — the state, not a description. */
  state: string;
  tone: 'ok' | 'warn' | 'bad';
  live?: boolean;
  blurb: string;
  /** Omit where the screen's own search lives closer to what it filters. */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    /** Rendered under the input — results, or nothing. */
    results?: React.ReactNode;
  };
  gauge: { pct: number; label: string; sub: string };
  /** Chips, buttons — whatever this tab needs beneath its dial. */
  aside?: React.ReactNode;
  /** Primary actions for this screen, sitting under the blurb. */
  actions?: React.ReactNode;
}

const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({
  title, state, tone, live, blurb, search, gauge, aside, actions,
}) => (
  <header className="rounded-2xl border px-6 py-6 hud-glass mb-6">
    <div className="flex items-start justify-between gap-8 flex-wrap">
      <div className="min-w-0 flex-1 basis-[420px]">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight truncate">{title}</h1>
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 shrink-0">
            <Dot tone={tone} live={live} />
            {state}
          </span>
        </div>
        <div className="hud-rule h-px bg-gradient-to-r from-[#0066CC]/50 to-transparent mt-3" />
        <p className="text-slate-500 text-sm mt-2 max-w-xl">{blurb}</p>
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}

        {search && (
          <div className="relative mt-4 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#0066CC]/30 focus:border-[#0066CC]"
            />
            {search.value && (
              <button
                onClick={() => search.onChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {search.results}
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-5 shrink-0 hud-well">
        <Gauge pct={gauge.pct} label={gauge.label} sub={gauge.sub} tone={tone} />
        {aside}
      </div>
    </div>
  </header>
);

export default ConsoleHeader;
