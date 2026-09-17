import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, X as XIcon } from 'lucide-react';

/*
  One date control for the whole app.

  Every date in this product was a bare `type="date"`: a 10px hit target on
  the milestone rows, dd/mm/yyyy typing everywhere else, and no way to say
  the thing people actually mean — today, a fortnight out, end of the month.
  The native picker is kept for arbitrary dates, because it is the control
  people already know and it handles locale and keyboard for free. What is
  added around it is the shortcut for the common case and a readable value.

  The panel renders in a portal with fixed coordinates. Several of the places
  this is used sit inside `overflow-hidden` cards, which would otherwise clip
  an absolutely positioned panel.
*/

export interface DateFieldProps {
    /** ISO yyyy-mm-dd, or empty. */
    value?: string | null;
    /** Called with a new ISO date, or '' when cleared. */
    onChange: (iso: string) => void;
    placeholder?: string;
    /** 'md' is a bordered form field; 'sm' is an inline value that borders on hover. */
    size?: 'sm' | 'md';
    /** Show "in 12 days" next to the date. Useful for anything with a deadline. */
    showRelative?: boolean;
    clearable?: boolean;
    disabled?: boolean;
    title?: string;
    className?: string;
    /** Earliest selectable date, ISO. */
    min?: string;
}

const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parsed at local midnight; `new Date('2026-10-18')` is UTC and lands a day early east of Greenwich. */
const parse = (v: string) => {
    const d = new Date(v.slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
};

const format = (v: string) => {
    const d = parse(v);
    return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

const relative = (v: string) => {
    const d = parse(v);
    if (!d) return '';
    const days = Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days === -1) return 'yesterday';
    return days > 0 ? `in ${days} days` : `${-days} days ago`;
};

const PRESETS: { label: string; of: () => Date }[] = [
    { label: 'Today', of: () => new Date() },
    { label: '+1 week', of: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d; } },
    { label: '+2 weeks', of: () => { const d = new Date(); d.setDate(d.getDate() + 14); return d; } },
    { label: 'End of month', of: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0); } },
];

const DateField: React.FC<DateFieldProps> = ({
    value, onChange, placeholder = 'Set a date', size = 'md',
    showRelative = false, clearable = true, disabled = false, title, className = '', min,
}) => {
    const [open, setOpen] = useState(false);
    const [at, setAt] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const current = value ? value.slice(0, 10) : '';

    const place = useCallback(() => {
        const r = triggerRef.current?.getBoundingClientRect();
        if (!r) return;
        const W = 248;
        setAt({
            top: Math.min(r.bottom + 6, window.innerHeight - 170),
            // Nudged back inside when the field sits near the right edge.
            left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
        };
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        /*
          Fixed coordinates go stale as soon as anything scrolls, so follow the
          trigger rather than close. The listener is on the capture phase
          because several of these fields sit inside their own scrolling
          cards, and a scroll there never reaches window in the bubble phase.
        */
        let frame = 0;
        const follow = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => { frame = 0; place(); });
        };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        window.addEventListener('scroll', follow, true);
        window.addEventListener('resize', follow);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', key);
            window.removeEventListener('scroll', follow, true);
            window.removeEventListener('resize', follow);
        };
    }, [open, place]);

    const pick = (v: string) => { onChange(v); setOpen(false); };

    const trigger = size === 'sm'
        ? `inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
            open ? 'border-[#ADBBDA] bg-[#F6F7FB]' : 'border-transparent hover:border-[#E2E5F0] hover:bg-[#F6F7FB]/60'
          } ${current ? 'text-[#3A416B]' : 'text-[#8E96B8]'}`
        : `w-full inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold transition-colors ${
            open ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/20' : 'border-slate-200 hover:border-[#ADBBDA]'
          } ${current ? 'text-slate-800' : 'text-slate-400'}`;

    return (
        <div className={`relative ${size === 'sm' ? 'inline-block' : ''} ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                title={title}
                onClick={() => { if (!disabled) { place(); setOpen(o => !o); } }}
                className={`${trigger} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
                <CalendarIcon className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0 ${current ? 'text-[#3D52A0]' : 'text-[#8E96B8]'}`} />
                <span className="truncate">{current ? format(current) : placeholder}</span>
                {showRelative && current && (
                    <span className="text-[#8E96B8] font-medium shrink-0">· {relative(current)}</span>
                )}
                {size === 'md' && <span className="flex-1" />}
                {clearable && current && !disabled && (
                    <span
                        role="button"
                        tabIndex={0}
                        aria-label="Clear the date"
                        title="Clear"
                        onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onChange(''); setOpen(false); } }}
                        className="shrink-0 text-[#ADBBDA] hover:text-rose-600 transition-colors"
                    >
                        <XIcon className="w-3 h-3" />
                    </span>
                )}
            </button>

            {open && at && createPortal(
                <div
                    ref={panelRef}
                    style={{ position: 'fixed', top: at.top, left: at.left, width: 248, zIndex: 9999 }}
                    className="rounded-xl border border-[#E2E5F0] bg-white shadow-xl p-2.5"
                >
                    <div className="grid grid-cols-2 gap-1.5">
                        {PRESETS.map(p => {
                            const v = iso(p.of());
                            return (
                                <button
                                    key={p.label}
                                    type="button"
                                    onClick={() => pick(v)}
                                    title={format(v)}
                                    className={`text-[11px] font-semibold rounded-lg px-2 py-1.5 border transition-colors ${
                                        v === current
                                            ? 'bg-[#3D52A0] text-white border-[#3D52A0]'
                                            : 'bg-[#F6F7FB] text-[#3A416B] border-[#E2E5F0] hover:bg-[#EDE8F5] hover:border-[#ADBBDA]'
                                    }`}
                                >{p.label}</button>
                            );
                        })}
                    </div>

                    <div className="mt-2 pt-2 border-t border-[#EDEFF7]">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-[#ADBBDA] mb-1">
                            Or pick a day
                        </span>
                        <input
                            type="date"
                            autoFocus
                            value={current}
                            min={min}
                            onChange={e => { if (e.target.value) pick(e.target.value); }}
                            className="w-full text-xs font-semibold rounded-lg border border-[#E2E5F0] bg-white px-2 py-1.5 text-[#3A416B] focus:border-[#3D52A0] focus:ring-2 focus:ring-[#3D52A0]/20 focus:outline-none"
                        />
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

export default DateField;
