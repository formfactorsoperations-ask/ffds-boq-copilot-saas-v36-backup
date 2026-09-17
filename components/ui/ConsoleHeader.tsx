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
  /*
    Optional: a single percentage suits a screen with one ratio worth reporting.
    Where the useful answer is a breakdown rather than a number -- how many items
    can be ordered, how many are blocked, how many the client is holding -- pass
    `panel` instead and render that.
  */
  gauge?: { pct: number; label: string; sub: string };
  /** Replaces the dial entirely. */
  panel?: React.ReactNode;
  /** Chips, buttons — whatever this tab needs beneath its dial. */
  aside?: React.ReactNode;
  /** Primary actions for this screen, sitting under the blurb. */
  actions?: React.ReactNode;
  /*
    The screen's sections, rendered under the rule.

    Option B: tabs belong with the title they qualify, inside the same raised
    card. Left to float below the header they drifted -- on the schedule of
    finishes they had ended up 733px beneath their own heading, past a dial and
    four stat tiles, so you met the content before you knew there were sections.
  */
  tabs?: React.ReactNode;
}

const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({
  title, state, tone, live, blurb, search, gauge, aside, actions, panel, tabs,
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
        <div className="hud-rule h-px bg-gradient-to-r from-[#3D52A0]/50 to-transparent mt-3" />
        <p className="text-slate-500 text-sm mt-2 max-w-xl">{blurb}</p>

        {/*
          Tabs and search share a line, directly under the blurb.

          Stacked separately they were two of five rows of chrome before any
          content. Side by side they also read correctly: the search filters
          what the selected tab is showing, so sitting next to it says so
          without needing a label.
        */}
        {(tabs || search) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {tabs && <div className="min-w-0">{tabs}</div>}
            {search && (
              <div className="relative grow basis-[240px] max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
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
        )}

        {/*
          Actions sit under the tabs, not above them.

          Above, the primary button was the first thing after the blurb and
          the sections were buried beneath it -- so the screen offered an
          action before saying what you were looking at. Below, "Add
          selection" is also nearest the list it adds to.
        */}
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {(panel || gauge) && (
        <div className="rounded-2xl border p-5 shrink-0 hud-well">
          {panel || (gauge && <Gauge pct={gauge.pct} label={gauge.label} sub={gauge.sub} tone={tone} />)}
          {aside}
        </div>
      )}
    </div>
  </header>
);

export default ConsoleHeader;
