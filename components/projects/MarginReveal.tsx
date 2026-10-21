import React, { useState } from 'react';
import { Eye, EyeOff } from '@/lib/lucide-shim';

/*
  A project card's margin, kept covered until asked for.

  The Projects grid is often on screen with a client or a vendor in the room,
  and the margin was printed on every card. It now sits behind two dots:
  pointing at it (or tabbing to it) rolls the figure up into view, and a click
  or tap keeps it there until the next click. The click never opens the
  project underneath.

  Plain transitions only (no new keyframes), and none under reduced motion.
*/

const roll = 'transition-all duration-300 ease-out motion-reduce:transition-none';

const MarginReveal: React.FC<{ value: number }> = ({ value }) => {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const shown = hover || pinned;
  const Icon = pinned ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setPinned((p) => !p); }}
      /* Pointing counts for a mouse only, and focus for the keyboard only: on a
         phone the tap alone decides, so a second tap covers it again. */
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); }}
      onPointerLeave={() => setHover(false)}
      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setHover(true); }}
      onBlur={() => setHover(false)}
      aria-pressed={pinned}
      aria-label={shown ? `Margin ${value}%` : 'Show the margin'}
      title={pinned ? 'Click to hide the margin' : 'Click to keep the margin showing'}
      className="relative z-10 text-right rounded-lg px-1.5 py-1 -mx-1.5 -my-1 cursor-pointer transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30"
    >
      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-0.5 flex items-center justify-end gap-1">
        <Icon className={`w-2.5 h-2.5 transition-colors ${shown ? 'text-[#3D52A0]' : 'text-slate-300'}`} />
        Margin
      </p>
      <span className="relative block h-3.5 min-w-[2.5rem] overflow-hidden text-sm font-semibold leading-none tabular-nums">
        <span
          aria-hidden
          className={`block text-slate-300 tracking-[0.2em] ${roll} ${shown ? '-translate-y-full opacity-0 blur-[2px]' : 'translate-y-0 opacity-100 blur-0'}`}
        >
          ••
        </span>
        <span
          aria-hidden
          className={`absolute inset-0 text-slate-700 ${roll} ${shown ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-full opacity-0 blur-[2px]'}`}
        >
          {value}%
        </span>
      </span>
    </button>
  );
};

export default MarginReveal;
