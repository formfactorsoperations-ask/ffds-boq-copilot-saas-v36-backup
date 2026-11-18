import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type Variants } from 'framer-motion';
import { ArrowRight, ExternalLink, FolderOpen, LogIn, LogOut, MapPin, X } from '@/lib/lucide-shim';
import type { Mode } from '../../lib/peopleDesk';
import { Glide, DoneTick, Confetti, Notice, MODE_ICON, EASE } from './PeopleBits';
import { LABEL, INPUT, Button, Chip } from '../ui/kit';
import '../projectHeader/projectHeader.css';

/*
  THE LAMP: starting and ending the day (DESIGN.md → "People: the lamp").

  Check in and Check out on the My day card open this window: a dark room and
  a floor lamp. Pull the lamp's cord (drag it down, or press it) and the light
  flickers on, the room warms, and the card to start or end the day rises in
  beside it. Checking out turns the light off again before the window closes.

  The window only shows the choice and the button: the check-in and check-out
  themselves stay in MyDayCard, so the card and the window always agree.

  Colours: the room is the scrim's navy; the light is amber; the lamp is slate
  and amber brass; the card is the People glass with brand text. Under reduced
  motion the light is already on and the card already there.
*/

export interface LampCheckInProps {
  kind: 'in' | 'out';
  /** The person's first name, for the greeting. */
  name: string;
  /** "Wednesday, 18 November" and "9:41 AM", from the card. */
  dateLabel: string;
  timeLabel: string;
  /** Morning, afternoon or evening, by the studio's clock. */
  partOfDay: 'morning' | 'afternoon' | 'evening';
  /* Starting the day */
  mode: Mode;
  onMode: (m: Mode) => void;
  site: string;
  onSite: (s: string) => void;
  sites: string[];
  /** What is recorded and when lateness starts: one line under the choice. */
  note: string;
  /* Ending the day */
  inAt?: string;
  worked?: string;
  where?: string;
  updateUrl?: string;
  /* Both */
  phase: 'idle' | 'locating' | 'saving' | 'done' | 'update';
  done: string | null;
  problem: string | null;
  onDismissProblem: () => void;
  onConfirm: () => void;
  onClose: () => void;
  /** A practice run (?try-lamp): the card says so, and nothing is saved. */
  practice?: boolean;
}

/* The cord hangs from the shade's rim, this far, in the lamp's own pixels. */
const CORD_X = 176;
const CORD_Y = 126;
const CORD = 78;
/* Pulled this far (px) and let go, the lamp switches. */
const PULL = 28;

/* The light comes on with a flicker, as a real bulb does, and goes off softly. */
const glowV: Variants = {
  on: { opacity: [0, 0.75, 0.15, 0.95, 0.45, 1], transition: { duration: 0.75, times: [0, 0.14, 0.28, 0.48, 0.62, 1], ease: 'easeOut' } },
  off: { opacity: 0, transition: { duration: 0.5, ease: 'easeIn' } },
};

/* Dust caught in the light. */
const MOTES = [
  { x: 92, y: 210, d: 5.5 }, { x: 150, y: 250, d: 7 }, { x: 70, y: 300, d: 6.2 }, { x: 178, y: 330, d: 8 },
  { x: 118, y: 360, d: 6.8 }, { x: 54, y: 380, d: 7.4 }, { x: 196, y: 220, d: 6 }, { x: 132, y: 190, d: 5.2 },
];

function Lamp({ lit, still }: { lit: boolean; still: boolean }) {
  const state = lit ? 'on' : 'off';
  const pleats = Array.from({ length: 11 }, (_, i) => i);
  return (
    <svg width={240} height={460} viewBox="0 0 240 460" className="absolute inset-0 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="lamp-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FDE68A" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#FCD34D" stopOpacity="0.16" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lamp-pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FCD34D" stopOpacity="0.5" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lamp-shade-off" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1E293B" />
          <stop offset="0.45" stopColor="#334155" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id="lamp-shade-on" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FEF3C7" />
          <stop offset="0.5" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="lamp-brass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#78350F" />
          <stop offset="0.5" stopColor="#D97706" />
          <stop offset="1" stopColor="#92400E" />
        </linearGradient>
        <filter id="lamp-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>

      {/* The light: a cone down to the floor, a pool on it, a little up through the top. */}
      <motion.g initial={false} animate={state} variants={glowV}>
        <path d="M54 128 L186 128 L300 446 L-60 446 Z" fill="url(#lamp-cone)" />
        <ellipse cx="120" cy="446" rx="170" ry="20" fill="url(#lamp-pool)" />
        <ellipse cx="120" cy="38" rx="56" ry="10" fill="#FEF3C7" opacity="0.35" filter="url(#lamp-soft)" />
        <ellipse cx="120" cy="128" rx="58" ry="9" fill="#FFFBEB" filter="url(#lamp-soft)" />
      </motion.g>

      {/* Floor shadow */}
      <ellipse cx="120" cy="448" rx="78" ry="6" fill="#020617" opacity="0.55" />

      {/* Cable from the foot, across the floor */}
      <path d="M121 332 C 126 380, 150 430, 214 446" fill="none" stroke="#475569" strokeWidth="1.6" />

      {/* Tripod and pole */}
      <g stroke="url(#lamp-brass)" strokeLinecap="round">
        <line x1="120" y1="322" x2="58" y2="446" strokeWidth="5" />
        <line x1="120" y1="322" x2="182" y2="446" strokeWidth="5" />
        <line x1="120" y1="322" x2="126" y2="440" strokeWidth="4" opacity="0.7" />
      </g>
      <rect x="117.75" y="130" width="4.5" height="194" rx="2" fill="url(#lamp-brass)" />
      <circle cx="58" cy="446" r="3" fill="#FCD34D" opacity="0.8" />
      <circle cx="182" cy="446" r="3" fill="#FCD34D" opacity="0.8" />
      <rect x="113" y="314" width="14" height="14" rx="4" fill="#92400E" />
      <rect x="115" y="316" width="10" height="4" rx="2" fill="#FCD34D" opacity="0.55" />

      {/* The shade: dark cloth when off, lit from inside when on. */}
      <path d="M72 40 L168 40 L190 128 L50 128 Z" fill="url(#lamp-shade-off)" />
      <motion.path d="M72 40 L168 40 L190 128 L50 128 Z" fill="url(#lamp-shade-on)" initial={false} animate={state} variants={glowV} />
      {pleats.map((i) => (
        <line key={i} x1={72 + i * 9.6} y1="41" x2={50 + i * 14} y2="127" stroke={lit ? '#B45309' : '#F8FAFC'} strokeOpacity={lit ? 0.18 : 0.06} strokeWidth="1" />
      ))}
      <ellipse cx="120" cy="40" rx="48" ry="4" fill={lit ? '#FFFBEB' : '#475569'} />
      <ellipse cx="120" cy="128" rx="70" ry="5" fill={lit ? '#FFFBEB' : '#0F172A'} stroke={lit ? '#FCD34D' : '#334155'} strokeWidth="1" />
      <circle cx="120" cy="30" r="5" fill="url(#lamp-brass)" />
      <line x1="120" y1="34" x2="120" y2="40" stroke="#92400E" strokeWidth="2" />

      {/* Dust in the light */}
      {!still && MOTES.map((m, i) => (
        <motion.circle key={i} cx={m.x} cy={m.y} r={i % 3 === 0 ? 1.8 : 1.2} fill="#FEF3C7"
          initial={false}
          animate={lit ? { opacity: [0.15, 0.8, 0.15], y: [0, -16, 0], x: [0, i % 2 ? 6 : -6, 0] } : { opacity: 0 }}
          transition={lit ? { duration: m.d, repeat: Infinity, ease: 'easeInOut', delay: i * 0.35 } : { duration: 0.4 }} />
      ))}
    </svg>
  );
}

/** The cord: drag the knob down and let go, or press it. */
function Cord({ lit, onPull, disabled, still, focusRef }: { lit: boolean; onPull: () => void; disabled: boolean; still: boolean; focusRef: React.RefObject<HTMLButtonElement | null> }) {
  const y = useMotionValue(0);
  const length = useTransform(y, (v) => CORD + Math.max(0, v));
  const dragged = useRef(false);
  const tug = () => {
    if (disabled) return;
    if (still) { onPull(); return; }
    animate(y, [0, 40, 0], { duration: 0.5, times: [0, 0.35, 1], ease: 'easeOut' });
    window.setTimeout(onPull, 180);
  };
  return (
    <div className="absolute" style={{ left: CORD_X, top: CORD_Y }}>
      <motion.span aria-hidden className={`absolute left-0 top-0 w-0.5 -ml-px rounded-full ${lit ? 'bg-amber-200/80' : 'bg-slate-400/70'}`} style={{ height: length }} />
      <motion.button ref={focusRef} type="button" disabled={disabled}
        aria-label={lit ? 'Pull the cord to turn the lamp off' : 'Pull the cord to turn the lamp on'}
        className="absolute left-0 grid place-items-center w-10 h-12 rounded-full cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 disabled:cursor-default"
        style={{ top: CORD - 6, x: '-50%', y }}
        drag={disabled || still ? false : 'y'} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.55 }} dragSnapToOrigin
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={(_, info) => { if (info.offset.y > PULL) onPull(); }}
        onClick={() => { if (dragged.current) { dragged.current = false; return; } tug(); }}>
        <span className={`block w-3.5 h-6 rounded-full shadow-md ${lit ? 'bg-gradient-to-b from-amber-200 to-amber-500' : 'bg-gradient-to-b from-amber-500 to-amber-800'}`} />
      </motion.button>
    </div>
  );
}

export default function LampCheckIn(p: LampCheckInProps) {
  const still = !!useReducedMotion();
  const [lit, setLit] = useState(still);
  const cordRef = useRef<HTMLButtonElement | null>(null);
  const goRef = useRef<HTMLButtonElement | null>(null);
  const busy = p.phase === 'locating' || p.phase === 'saving';
  const finished = p.phase === 'done' && !!p.done;
  const starting = p.kind === 'in';
  const title = starting ? 'Start your day' : 'End your day';

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) p.onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, p.onClose]);

  /* The cord takes focus first; once the light is on, the button does. */
  useEffect(() => { if (!lit) cordRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!lit) return;
    const t = window.setTimeout(() => goRef.current?.focus({ preventScroll: true }), still ? 0 : 650);
    return () => window.clearTimeout(t);
  }, [lit]);

  /* Day ended: lights out. */
  useEffect(() => {
    if (!finished || starting) return;
    const t = window.setTimeout(() => setLit(false), 900);
    return () => window.clearTimeout(t);
  }, [finished, starting]);

  const pull = () => { if (!busy && !finished) setLit((l) => !l); };
  const showCard = lit || (finished && !starting);
  const confirmLabel = starting
    ? (p.phase === 'locating' ? 'Finding you…' : p.phase === 'saving' ? 'Starting your day…' : 'Start my day')
    : (p.phase === 'saving' ? 'Ending your day…' : 'End my day');
  const canConfirm = !busy && !(starting && p.mode === 'Site' && !p.site);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/60 backdrop-blur-sm" onClick={() => { if (!busy) p.onClose(); }} />
      <div className="phd-pop relative w-full max-w-[920px] max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-3xl border border-slate-700/60 shadow-2xl bg-[#12182F]">
        {/* The room, warming when the light is on. */}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0" initial={false} animate={lit ? 'on' : 'off'} variants={glowV}
          style={{ background: 'radial-gradient(120% 90% at 24% 30%, rgba(245, 158, 11, 0.30), rgba(217, 119, 6, 0.10) 38%, transparent 70%)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950/60 to-transparent" />

        <button type="button" onClick={p.onClose} disabled={busy} aria-label="Close"
          className="absolute right-3 top-3 z-20 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50">
          <X className="w-4 h-4" />
        </button>

        <div className="relative grid md:grid-cols-[1fr_400px] md:min-h-[540px] items-center">
          {/* The lamp */}
          <div className="relative flex justify-center pt-8 md:pt-6 h-[320px] md:h-[540px]">
            <div className="relative w-[240px] h-[460px] origin-top scale-[0.6] md:scale-100 md:mt-6">
              <Lamp lit={lit} still={still} />
              <Cord lit={lit} onPull={pull} disabled={busy || finished} still={still} focusRef={cordRef} />
              <AnimatePresence>
                {!lit && !finished && (
                  <motion.p key="hint" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.5, duration: 0.4 }}
                    className={`${LABEL} !text-slate-400 absolute whitespace-nowrap flex items-center gap-2 pointer-events-none`} style={{ left: CORD_X + 22, top: CORD_Y + CORD + 4 }}>
                    <span className="w-6 h-px bg-slate-500" />Pull the cord
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* The card */}
          <div className="relative px-4 pb-4 md:p-6 md:pl-0 min-h-[120px]">
            <AnimatePresence mode="wait">
              {showCard ? (
                <motion.div key="card" className="relative rounded-3xl pp-glass p-6"
                  initial={still ? false : { opacity: 0, x: 28, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: 0.55, ease: EASE, delay: still ? 0 : 0.35 } }}
                  exit={{ opacity: 0, x: 16, transition: { duration: 0.25 } }}>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{title}</p>
                    {p.practice && <Chip tone="warn" title="Nothing you do here is saved">Practice</Chip>}
                  </div>

                  <AnimatePresence mode="wait">
                    {finished ? (
                      <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        className="flex flex-col items-center text-center gap-3 py-8" role="status">
                        <span className="relative"><Confetti pieces={26} spread={100} /><DoneTick size={56} /></span>
                        <p className="font-bold text-slate-800">{p.done}</p>
                      </motion.div>
                    ) : (
                      <motion.div key="form" initial={false} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                        <div className="mt-1">
                          <h3 className="text-2xl font-bold text-slate-800 tracking-tight leading-tight">
                            {starting ? `Good ${p.partOfDay}, ${p.name}.` : `Good work today, ${p.name}.`}
                          </h3>
                          <p className="text-2xl font-bold text-[#3D52A0] tracking-tight leading-tight">
                            {starting ? "The light's on for you." : 'Time to switch off.'}
                          </p>
                          <p className="text-xs text-slate-500 mt-2">{p.dateLabel} · {p.timeLabel}</p>
                        </div>

                        {starting ? (
                          <>
                            <div>
                              <p className={`${LABEL} mb-1.5`}>Where are you working</p>
                              <Glide id="lamp-mode" label="Where are you working" value={p.mode} onChange={p.onMode} disabled={busy}
                                options={[{ id: 'Office', label: 'Office', icon: MODE_ICON.Office }, { id: 'Site', label: 'Site', icon: MODE_ICON.Site }, { id: 'WFH', label: 'From home', icon: MODE_ICON.WFH }]} />
                            </div>
                            {p.mode === 'Site' && (
                              <div>
                                <label className={`${LABEL} block mb-1.5`} htmlFor="lamp-site">Which site</label>
                                <select id="lamp-site" className={INPUT} value={p.site} onChange={(e) => p.onSite(e.target.value)} disabled={busy}>
                                  <option value="">Choose a site</option>
                                  {p.sites.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            )}
                            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                              {p.mode !== 'WFH' && <MapPin className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />}{p.note}
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-2">
                              {[['In at', p.inAt], ['Worked', p.worked], ['Where', p.where]].map(([k, v]) => (
                                <div key={k} className="rounded-xl border border-slate-200 bg-white px-3 py-2 min-w-0">
                                  <p className={LABEL}>{k}</p>
                                  <p className="text-sm font-black text-slate-800 tabular-nums truncate mt-0.5">{v || '—'}</p>
                                </div>
                              ))}
                            </div>
                            {p.updateUrl && (
                              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <span className="text-xs text-slate-600 flex-1">Before you go: your daily work update.</span>
                                <a className="inline-flex items-center gap-1 text-xs font-bold text-[#3D52A0] hover:underline whitespace-nowrap" href={p.updateUrl} target="_blank" rel="noopener noreferrer">
                                  <FolderOpen className="w-3.5 h-3.5" />Open<ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </>
                        )}

                        <AnimatePresence>{p.problem && <Notice text={p.problem} tone="bad" onClose={p.onDismissProblem} />}</AnimatePresence>

                        <div className="flex flex-col gap-2 pt-1">
                          <button ref={goRef} type="button" onClick={p.onConfirm} disabled={!canConfirm}
                            className="pp-press w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 focus-visible:ring-offset-2">
                            {p.phase === 'locating'
                              ? <span className="pp-radar relative w-4 h-4 grid place-items-center rounded-full"><MapPin className="w-4 h-4" /></span>
                              : starting ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                            {confirmLabel}
                            {!busy && <ArrowRight className="w-4 h-4" />}
                          </button>
                          <Button variant="quiet" onClick={p.onClose} disabled={busy}>{starting ? 'Not now' : 'Keep working'}</Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div key="dark" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.3 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  className="text-center md:text-left px-2 py-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{title}</p>
                  <p className="text-sm font-semibold text-slate-300 mt-2">{starting ? 'Pull the lamp’s cord to begin.' : 'Pull the cord to wrap up.'}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Drag it down and let go, or press it.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
