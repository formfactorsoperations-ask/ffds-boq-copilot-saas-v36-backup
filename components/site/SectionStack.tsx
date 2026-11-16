/*
  Summary-first sections (DESIGN.md "Summary-first sections", plan item 9).

  The Execution & Site screens used to nest tabs three deep. Each screen now
  stacks its tools instead: a closed section is one line saying where that tool
  stands, and one section is open at a time. The screen opens the section that
  needs someone first, so a new user reads the page top to bottom and lands on
  the right tool without learning a row of tabs.

  The tools render unchanged inside a section; each takes an `embedded` prop
  that drops its own title, because the section row already names it.
*/
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Dot } from '../ui/HudBits';
import type { SectionLine } from '../../lib/siteSections';

export interface StackSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  line: SectionLine;
  /** Rendered only while the section is open. */
  render: () => React.ReactNode;
}

interface Props {
  sections: StackSection[];
  open: string | null;
  onOpen: (id: string | null) => void;
  /** Names the stack for screen readers, e.g. "Quality & snags". */
  label: string;
}

export default function SectionStack({ sections, open, onOpen, label }: Props) {
  return (
    <div className="space-y-3" role="list" aria-label={label}>
      {sections.map((s, i) => {
        const isOpen = open === s.id;
        const Icon = s.icon;
        return (
          <section
            key={s.id}
            role="listitem"
            data-testid={`site-section-${s.id}`}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`site-section-body-${s.id}`}
              onClick={() => onOpen(isOpen ? null : s.id)}
              className={`w-full flex items-center gap-3 px-5 py-4 text-left rounded-2xl transition-colors ${isOpen ? '' : 'hover:bg-slate-50'}`}
            >
              <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0">
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-slate-800">{s.title}</span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  {s.line.tone !== 'none' && <Dot tone={s.line.tone} />}
                  <span className="truncate">{s.line.summary}</span>
                </span>
              </span>
              <span
                className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 transition-transform duration-200 ${
                  isOpen ? 'rotate-90 bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-100 text-slate-400'
                }`}
                aria-hidden
              >
                <ChevronRight className="w-4 h-4" />
              </span>
            </button>
            {isOpen && (
              <div id={`site-section-body-${s.id}`} key={s.id} className="hud-swap border-t border-slate-100 p-5 min-w-0">
                {s.render()}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
