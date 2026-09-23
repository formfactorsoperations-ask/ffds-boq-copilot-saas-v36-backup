import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, X as XIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { parseDateInput, describeParsed } from '../../lib/parseDateInput';

/*
  One date control for the whole app.

  Every date in this product was a bare `type="date"`: a 10px hit target on
  the milestone rows, dd/mm/yyyy typing everywhere else, and no way to say
  the thing people actually mean — today, a fortnight out, end of the month.

  The panel used to be four shortcut buttons above that same native input,
  which left the common case quick and everything else exactly as awkward as
  before. Reaching March 2024 to date a legacy invoice meant typing into a
  field that rejects half of what you type.

  So the panel is now a real month grid with its own navigation, and the month
  title is a button: one click gives twelve months and a year stepper, so any
  month in any year is two clicks away rather than eighteen. The shortcuts
  stayed — they are still the fastest way to say "a fortnight out".

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

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PANEL_W = 296;
/*
  Measured, not estimated. These decide whether the panel opens below the field
  or flips above it, so a guess here puts a calendar off the bottom of the
  screen on the last row of a long schedule.
*/
const PANEL_H = { days: 458, months: 236 };

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The 42 cells of a month grid, starting on the Sunday on or before the 1st. */
function monthGrid(view: Date): Date[] {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const DateField: React.FC<DateFieldProps> = ({
    value, onChange, placeholder = 'Set a date', size = 'md',
    showRelative = false, clearable = true, disabled = false, title, className = '', min,
}) => {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'days' | 'months'>('days');
    /* What has been typed, and what the parser made of it. */
    const [typed, setTyped] = useState('');
    const [at, setAt] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const current = value ? value.slice(0, 10) : '';
    const selected = useMemo(() => (current ? parse(current) : null), [current]);
    const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
    const floor = useMemo(() => (min ? parse(min) : null), [min]);

    /* The month on screen, and the day the keyboard is on. */
    const [view, setView] = useState<Date>(() => selected || today);
    const [cursor, setCursor] = useState<Date>(() => selected || today);

    useEffect(() => {
        if (!open) return;
        const start = selected || today;
        setView(start);
        setCursor(start);
        setMode('days');
        setTyped('');
    }, [open]);   // deliberately only on open — re-centring mid-navigation would fight the user

    const place = useCallback(() => {
        const r = triggerRef.current?.getBoundingClientRect();
        if (!r) return;
        const h = PANEL_H[mode];
        /* Below by default, above when there is no room for it there. */
        const below = r.bottom + 6;
        const top = below + h > window.innerHeight - 8 && r.top - h - 6 > 8
            ? r.top - h - 6
            : Math.max(8, Math.min(below, window.innerHeight - h - 8));
        setAt({
            top,
            // Nudged back inside when the field sits near the right edge.
            left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8)),
        });
    }, [mode]);

    useEffect(() => { if (open) place(); }, [open, mode, place]);

    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
        };
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
        window.addEventListener('scroll', follow, true);
        window.addEventListener('resize', follow);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            document.removeEventListener('mousedown', away);
            window.removeEventListener('scroll', follow, true);
            window.removeEventListener('resize', follow);
        };
    }, [open, place]);

    const parsed = useMemo(() => (typed.trim() ? parseDateInput(typed) : null), [typed]);

    const blocked = useCallback((d: Date) => !!floor && d < floor, [floor]);
    const pick = (d: Date) => { if (blocked(d)) return; onChange(iso(d)); setOpen(false); };

    /* Arrows walk the grid, Enter takes the day under the cursor. */
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return; }
        /*
          Arrows walk the grid, but only when the grid has the keyboard. The box
          above is a text field: hijacking its arrows would stop the caret
          moving through what has been typed.
        */
        if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
        if (mode !== 'days') return;
        const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (step[e.key] !== undefined) {
            e.preventDefault();
            const next = addDays(cursor, step[e.key]);
            setCursor(next);
            if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) setView(next);
            return;
        }
        if (e.key === 'PageUp' || e.key === 'PageDown') {
            e.preventDefault();
            const next = addMonths(cursor, e.key === 'PageUp' ? -1 : 1);
            setCursor(next); setView(next);
            return;
        }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(cursor); }
    };

    const trigger = size === 'sm'
        ? `inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
            open ? 'border-[#ADBBDA] bg-[#F6F7FB]' : 'border-transparent hover:border-[#E2E5F0] hover:bg-[#F6F7FB]/60'
          } ${current ? 'text-[#3A416B]' : 'text-[#8E96B8]'}`
        : `w-full inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold transition-colors ${
            open ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/20' : 'border-slate-200 hover:border-[#ADBBDA]'
          } ${current ? 'text-slate-800' : 'text-slate-400'}`;

    const navBtn = 'p-1.5 rounded-lg text-[#5A628A] hover:bg-[#EDE8F5] hover:text-[#3D52A0] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';

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
                    role="dialog"
                    aria-label="Choose a date"
                    tabIndex={-1}
                    onKeyDown={onKeyDown}
                    style={{ position: 'fixed', top: at.top, left: at.left, width: PANEL_W, zIndex: 9999 }}
                    className="rounded-2xl border border-[#E2E5F0] bg-white shadow-2xl p-3 outline-none"
                >
                    {/*
                      Typing, for a date already known.

                      The calendar is the right control for looking at a month and
                      the wrong one for transcribing twelve invoices off paperwork.
                      Day-first, and anything not understood says so rather than
                      guessing -- a wrong date here reaches the client's portal.
                    */}
                    <div className="mb-2">
                        <input
                            type="text"
                            value={typed}
                            autoFocus
                            onChange={e => {
                                setTyped(e.target.value);
                                const hit = parseDateInput(e.target.value);
                                if (hit) { const d = parse(hit); if (d) { setView(d); setCursor(d); } }
                            }}
                            onKeyDown={e => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                const hit = parseDateInput(typed);
                                const d = hit ? parse(hit) : null;
                                if (d) pick(d);
                            }}
                            placeholder="Type a date, or pick one below"
                            className="w-full text-xs font-semibold rounded-lg border border-[#E2E5F0] bg-white px-2.5 py-2 text-[#3A416B] placeholder:text-[#ADBBDA] placeholder:font-medium focus:border-[#3D52A0] focus:ring-2 focus:ring-[#3D52A0]/20 focus:outline-none"
                        />
                        {typed.trim() !== '' && (
                            parsed
                                ? (
                                    <p className="mt-1 text-[10px] font-bold text-[#3D52A0] px-0.5">
                                        {describeParsed(parsed)} &middot; press Enter
                                    </p>
                                )
                                : (
                                    <p className="mt-1 text-[10px] font-semibold text-[#ADBBDA] px-0.5">
                                        Try 23 jul 24, 23/7/24, next friday, +6w, end of march
                                    </p>
                                )
                        )}
                    </div>

                    {/* Month, year, and the two ways to move through them. */}
                    <div className="flex items-center justify-between gap-1">
                        <button
                            type="button"
                            className={navBtn}
                            aria-label={mode === 'days' ? 'Previous month' : 'Previous year'}
                            onClick={() => setView(v => mode === 'days' ? addMonths(v, -1) : new Date(v.getFullYear() - 1, v.getMonth(), 1))}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <button
                            type="button"
                            onClick={() => setMode(m => (m === 'days' ? 'months' : 'days'))}
                            className="flex-1 text-center text-[13px] font-extrabold text-[#12182F] rounded-lg py-1 hover:bg-[#F6F7FB] transition-colors cursor-pointer"
                            title={mode === 'days' ? 'Jump to another month' : 'Back to the days'}
                        >
                            {mode === 'days'
                                ? `${view.toLocaleDateString('en-IN', { month: 'long' })} ${view.getFullYear()}`
                                : view.getFullYear()}
                        </button>

                        <button
                            type="button"
                            className={navBtn}
                            aria-label={mode === 'days' ? 'Next month' : 'Next year'}
                            onClick={() => setView(v => mode === 'days' ? addMonths(v, 1) : new Date(v.getFullYear() + 1, v.getMonth(), 1))}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {mode === 'months' ? (
                        <div className="grid grid-cols-3 gap-1.5 mt-3">
                            {MONTHS.map((m, i) => {
                                const isThis = selected && selected.getFullYear() === view.getFullYear() && selected.getMonth() === i;
                                return (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => { setView(new Date(view.getFullYear(), i, 1)); setMode('days'); }}
                                        className={`text-xs font-bold rounded-lg py-2.5 border transition-colors cursor-pointer ${
                                            isThis
                                                ? 'bg-[#3D52A0] text-white border-[#3D52A0]'
                                                : 'bg-[#F6F7FB] text-[#3A416B] border-[#E2E5F0] hover:bg-[#EDE8F5] hover:border-[#ADBBDA]'
                                        }`}
                                    >{m}</button>
                                );
                            })}
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-7 mt-2 mb-1">
                                {WEEKDAYS.map((d, i) => (
                                    <span key={i} className="text-center text-[10px] font-black uppercase text-[#ADBBDA]">{d}</span>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-0.5">
                                {monthGrid(view).map((d, i) => {
                                    const outside = d.getMonth() !== view.getMonth();
                                    const isSelected = !!selected && sameDay(d, selected);
                                    const isToday = sameDay(d, today);
                                    const isCursor = sameDay(d, cursor);
                                    const off = blocked(d);
                                    return (
                                        <button
                                            key={i}
                                            type="button"
                                            disabled={off}
                                            onClick={() => pick(d)}
                                            onMouseEnter={() => setCursor(d)}
                                            title={format(iso(d))}
                                            className={`h-8 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                                                off
                                                    ? 'text-[#CBD1E4] cursor-not-allowed'
                                                    : isSelected
                                                        ? 'bg-[#3D52A0] text-white cursor-pointer'
                                                        : outside
                                                            ? 'text-[#CBD1E4] hover:bg-[#F6F7FB] cursor-pointer'
                                                            : 'text-[#3A416B] hover:bg-[#EDE8F5] cursor-pointer'
                                            } ${!isSelected && isToday ? 'ring-1 ring-[#7091E6]' : ''} ${
                                                !isSelected && isCursor ? 'bg-[#F6F7FB]' : ''
                                            }`}
                                        >{d.getDate()}</button>
                                    );
                                })}
                            </div>

                            {/* The shortcuts stay: still the fastest way to say "a fortnight out". */}
                            <div className="grid grid-cols-2 gap-1.5 mt-3 pt-3 border-t border-[#EDEFF7]">
                                {PRESETS.map(p => {
                                    const d = p.of();
                                    const v = iso(d);
                                    return (
                                        <button
                                            key={p.label}
                                            type="button"
                                            disabled={blocked(d)}
                                            onClick={() => pick(d)}
                                            title={format(v)}
                                            className={`text-[11px] font-semibold rounded-lg px-2 py-1.5 border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                                v === current
                                                    ? 'bg-[#3D52A0] text-white border-[#3D52A0]'
                                                    : 'bg-[#F6F7FB] text-[#3A416B] border-[#E2E5F0] hover:bg-[#EDE8F5] hover:border-[#ADBBDA]'
                                            }`}
                                        >{p.label}</button>
                                    );
                                })}
                            </div>

                            {clearable && current && (
                                <button
                                    type="button"
                                    onClick={() => { onChange(''); setOpen(false); }}
                                    className="w-full mt-1.5 text-[11px] font-semibold text-[#8E96B8] hover:text-rose-600 rounded-lg py-1.5 transition-colors cursor-pointer"
                                >
                                    Clear the date
                                </button>
                            )}
                        </>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
};

export default DateField;
