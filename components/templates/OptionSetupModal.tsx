import React, { useState } from 'react';
import { X, Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button, LABEL, INPUT } from '../ui/kit';
import NumberField from '../NumberField';
import { GRADES, GRADE_TIER, type Grade } from '../../lib/materialSpecs';
import { STANDARD_SETUP, SETUP_LIMITS, cleanSetup, isStandardSetup, type OptionSetup, type OptionSetups } from '../../lib/optionSetup';

/*
  Option setup (Standard templates): what separates the studio's three options,
  as figures the owner sets (lib/optionSetup.ts). They were written in the
  generator. The standard figures are what it used, so nothing moves until one
  is changed; Comfort is the baseline, its materials and margin the Item Bank's.
*/

const ROWS: { key: keyof OptionSetup; label: string; blurb: string }[] = [
  { key: 'material', label: 'Materials rate', blurb: 'Of the Item Bank rate, on carpentry, kitchen, glass, decor and loose furniture. Labour does not move.' },
  { key: 'margin', label: 'Margin', blurb: 'Of each item’s own margin, kept between 10% and 45%.' },
  { key: 'ceiling', label: 'False ceiling', blurb: 'Of the false ceiling area the plan measures.' },
];

export default function OptionSetupModal({ setup: saved, onSave, onClose }: {
  setup: OptionSetups;
  onSave: (next: OptionSetups | null) => void;
  onClose: () => void;
}) {
  const [setup, setSetup] = useState<OptionSetups>(saved);
  const set = (g: Grade, k: keyof OptionSetup, pct: number | undefined) => {
    if (pct === undefined) return;
    setSetup(s => cleanSetup({ ...s, [g]: { ...s[g], [k]: pct / 100 } }));
  };
  const changed = JSON.stringify(setup) !== JSON.stringify(saved);
  const standard = isStandardSetup(setup);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Option setup"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="phd-scrim absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-4 flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><SlidersHorizontal className="w-4 h-4" aria-hidden /></span>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800">Option setup</h2>
            <p className="text-xs text-slate-500">What separates the three options in every BOQ the studio generates. Comfort is the baseline: the Item Bank’s own rate and margin.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>

        <div className="px-6 pb-5 flex-1 min-h-0 overflow-auto">
          <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
            <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-3 px-4 py-2.5 bg-slate-50 rounded-t-2xl">
              <span className={LABEL}>Figure</span>
              {GRADES.map(g => <span key={g} className={LABEL}>{GRADE_TIER[g]}</span>)}
            </div>
            {ROWS.map(row => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-3 px-4 py-3 items-start hud-row-in">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{row.label}</div>
                  <div className="text-[11px] text-slate-500">{row.blurb}</div>
                </div>
                {GRADES.map(g => {
                  const fixed = g === 'C' && row.key !== 'ceiling';
                  return (
                    <label key={g} className="block">
                      <span className="sr-only">{row.label}, {GRADE_TIER[g]}, percent</span>
                      <span className="flex items-center gap-1.5">
                        <NumberField aria-label={`${row.label}, ${GRADE_TIER[g]}, percent`} live decimals={0} disabled={fixed}
                          min={SETUP_LIMITS[row.key][0] * 100} max={SETUP_LIMITS[row.key][1] * 100}
                          value={Math.round(setup[g][row.key] * 100)} onCommit={v => set(g, row.key, v)}
                          className={`${INPUT} tabular-nums text-right`} />
                        <span className="text-xs font-semibold text-slate-500">%</span>
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-1">
                        {fixed ? 'Item Bank' : `Standard ${Math.round(STANDARD_SETUP[g][row.key] * 100)}%`}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            These apply to options made from now on: the setup wizard, Regenerate, Quick build and 3-Tier Simulation. Options already made keep their figures.
          </p>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto"><Button icon={RotateCcw} disabled={standard} onClick={() => setSetup(cleanSetup(null))}>Back to the standard</Button></span>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Check} disabled={!changed} onClick={() => { onSave(standard ? null : setup); onClose(); }}>Save setup</Button>
        </div>
      </div>
    </div>
  );
}
