import React from 'react';
import { ENGAGEMENTS, EngagementType, PMC_AVAILABLE, offeredEngagements } from '../../lib/engagement';
import { Check } from '@/lib/lucide-shim';

/*
  Which kinds of engagement this studio takes on.

  Only the ones switched on are offered when a project is set up. A studio
  that never does design-only work never sees the choice; FFDS, which does
  turnkey and design-only work but not PMC yet, sees those two.
*/
export default function EngagementSettings({ org, canEdit, onChange }: {
  org: any;
  canEdit: boolean;
  onChange: (next: EngagementType[]) => void;
}) {
  const offered = offeredEngagements(org);

  const toggle = (id: EngagementType) => {
    const on = offered.includes(id);
    // A studio offers at least one kind of engagement.
    if (on && offered.length === 1) return;
    const next = on ? offered.filter((x) => x !== id) : [...offered, id];
    onChange(ENGAGEMENTS.map((e) => e.id).filter((x) => next.includes(x)));
  };

  return (
    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
      {ENGAGEMENTS.map((e, i) => {
        const on = offered.includes(e.id);
        const unavailable = e.id === 'design_pmc' && !PMC_AVAILABLE;
        const last = on && offered.length === 1;
        const disabled = !canEdit || unavailable || last;
        return (
          <label
            key={e.id}
            className={`flex items-start gap-3 px-4 py-3 hud-row-in ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50'}`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              disabled={disabled}
              onChange={() => toggle(e.id)}
            />
            <span
              aria-hidden
              className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                on ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'bg-white border-slate-300 text-transparent'
              } ${unavailable ? 'opacity-50' : ''}`}
            >
              <Check className="w-3.5 h-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-semibold ${unavailable ? 'text-slate-400' : 'text-slate-800'}`}>{e.label}</span>
                {unavailable && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                    Coming next
                  </span>
                )}
                {last && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#3D52A0]/10 text-[#3D52A0]">
                    Always on
                  </span>
                )}
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">{e.blurb}</span>
              {unavailable && (
                <span className="block text-[11px] text-slate-500 mt-1">
                  Opens once its tender BOQ, PMC agreement and contractor bills screens are in.
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
