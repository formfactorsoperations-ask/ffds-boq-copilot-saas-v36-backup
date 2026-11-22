import React, { useState } from 'react';
import { Button, LABEL } from '../ui/kit';

/*
  "Edit all 3" in the BOQ Playground's bar (lib/playground/allOptions): one
  edit, every option. Its own control, so it is found: a brand-outlined
  button with the options as a stack of cards and a switch. Turned on, it
  fills brand, the cards fan out, a ripple leaves it, and the bar takes a brand
  ring for as long as it stays on (DESIGN.md "BOQ Playground motion").
  The first time, a tip under it says what it does.
*/

/** The options as a stack of cards; on, they fan out. */
function OptionStack({ on }: { on: boolean }) {
  const card = (i: number) => ({
    transform: on ? `rotate(${(i - 1) * 16}deg) translateY(${i === 1 ? -1 : 0}px)` : `translate(${(i - 1) * 1.5}px, ${(1 - i) * 1.5}px)`,
    transition: 'transform 420ms cubic-bezier(.34,1.56,.64,1)',
    transformBox: 'fill-box' as const,
    transformOrigin: '50% 100%',
  });
  return (
    <svg viewBox="0 0 20 16" className="w-5 h-4 shrink-0" aria-hidden focusable="false" data-option-stack={on ? 'fanned' : 'stacked'}>
      {[0, 1, 2].map(i => (
        <rect key={i} x="5" y="2" width="10" height="12" rx="2" style={card(i)}
          fill={on ? (i === 1 ? '#fff' : 'rgba(255,255,255,.55)') : (i === 1 ? '#3D52A0' : 'rgba(61,82,160,.35)')}
          stroke={on ? '#3D52A0' : '#fff'} strokeWidth="1" />
      ))}
    </svg>
  );
}

export function AllOptionsToggle({ count, on, names, onChange, coach, onCoachDone }: {
  /** How many options an edit would reach, this one included. */
  count: number;
  on: boolean;
  /** The other options, by name, for the tip. */
  names: string;
  onChange: (on: boolean) => void;
  /** Show the first-time tip under it. */
  coach: boolean;
  onCoachDone: () => void;
}) {
  const [pulse, setPulse] = useState(0);
  const set = (v: boolean) => { if (v) setPulse(p => p + 1); onChange(v); };
  return (
    <div className="relative shrink-0">
      <button type="button" role="switch" aria-checked={on} aria-label={`Edit all ${count} options at once`} onClick={() => set(!on)}
        title={`What you add, delete, move or resize goes into all ${count} options, each at its own grade. Finish, rate and margin stay in the option you edit.`}
        className={`relative px-2.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap border transition-[background-color,border-color,color,box-shadow] duration-300 ${on
          ? 'bg-[#3D52A0] border-[#3D52A0] text-white shadow-md'
          : 'bg-white border-[#3D52A0]/40 text-[#3D52A0] hover:bg-[#3D52A0]/[0.06]'} ${coach && !on ? 'pg-beckon' : ''}`}>
        <OptionStack on={on} />
        <span>{on ? `Editing all ${count}` : `Edit all ${count}`}</span>
        <span className={`relative w-7 h-4 rounded-full transition-colors duration-300 ${on ? 'bg-white/30' : 'bg-[#3D52A0]/15'}`} aria-hidden>
          <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full shadow-sm transition-transform duration-300 ${on ? 'translate-x-3 bg-white' : 'translate-x-0 bg-[#3D52A0]'}`} />
        </span>
        {pulse > 0 && <span key={pulse} className="pg-ripple absolute inset-0 rounded-xl pointer-events-none" aria-hidden />}
      </button>
      {coach && (
        <div role="dialog" aria-label="New: edit all options at once" className="phd-pop absolute left-0 top-full mt-2.5 z-40 w-[300px] rounded-2xl bg-white border border-[#3D52A0]/25 shadow-2xl p-3.5">
          <span className="absolute -top-1.5 left-6 w-3 h-3 rotate-45 bg-white border-l border-t border-[#3D52A0]/25" aria-hidden />
          <div className={`${LABEL} text-[#3D52A0]`}>New</div>
          <div className="font-bold text-slate-800 mt-0.5">One edit, all {count} options</div>
          <p className="text-xs text-slate-500 mt-1">Turn this on and what you add, delete, move or resize goes into {names} too, each at its own grade. Finish, rate and margin stay in each option.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => { set(true); onCoachDone(); }}>Turn it on</Button>
            <Button size="sm" onClick={onCoachDone}>Got it</Button>
          </div>
        </div>
      )}
    </div>
  );
}
