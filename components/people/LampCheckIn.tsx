import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type Variants } from 'framer-motion';
import { AlertTriangle, ArrowRight, ExternalLink, FolderOpen, LogIn, LogOut, MapPin, X } from '@/lib/lucide-shim';
import type { Mode } from '../../lib/peopleDesk';
import { Glide, DoneTick, Confetti, Notice, MODE_ICON, EASE } from './PeopleBits';
import { LABEL, INPUT, Button, Chip } from '../ui/kit';
import '../projectHeader/projectHeader.css';

/*
  THE LAMP: starting and ending the day (DESIGN.md → "People: the lamp").

  Check in and Check out on the My day card open this window: a room at night,
  lit only by the moon through an arched window, and a floor lamp. The cord
  sways a little, asking to be pulled. Pull it (drag it down and let go, or
  press it): the chain swings, the lamp head wobbles, the bulb flickers on,
  the room warms and its picture and plant come out of the dark, dust drifts
  in the light, and the card to start or end the day swings in beside it,
  its edge catching the lamp's glow. Checking out turns the light off again;
  the shade keeps a little afterglow as it fades.

  The window only shows the choice and the button: the check-in and check-out
  themselves stay in MyDayCard, so the card and the window always agree.

  Colours: the room is the scrim's navy, the moonlight slate and brand, the
  lamp light amber; the lamp is slate cloth and amber brass; the card is the
  People glass with brand text. Under reduced motion nothing sways or
  flickers: the light is already on and the card already there.
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
  /** An earlier day still open, its correction waiting on the approver. */
  awaitingNote?: string | null;
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
const CORD = 80;
/* Pulled this far (px) and let go, the lamp switches. */
const PULL = 26;

/* The light comes on with a flicker, as a real bulb does, and goes off softly. */
const glowV: Variants = {
  on: { opacity: [0, 0.8, 0.1, 0.9, 0.35, 1], transition: { duration: 0.8, times: [0, 0.12, 0.26, 0.46, 0.6, 1], ease: 'easeOut' } },
  off: { opacity: 0, transition: { duration: 0.45, ease: 'easeIn' } },
};
/* The shade: the same flicker on, a slow afterglow off. */
const shadeV: Variants = {
  on: glowV.on,
  off: { opacity: 0, transition: { duration: 1.6, ease: [0.4, 0, 0.2, 1] } },
};
/* The room's things: out of the dark when the lamp is on. */
const roomV: Variants = {
  on: { opacity: 1, transition: { duration: 0.9, delay: 0.25, ease: 'easeOut' } },
  off: { opacity: 0.22, transition: { duration: 0.8, ease: 'easeIn' } },
};

/** The lamp: a pleated shade on a brass pole and tripod, its light, and dust in the light. */
function Lamp({ lit, still }: { lit: boolean; still: boolean }) {
  const state = lit ? 'on' : 'off';
  /* Dust: a few dozen motes drifting up through the cone, each its own pace. */
  const motes = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const t = (i * 37) % 100 / 100;
    const y = 160 + ((i * 53) % 270);
    const spread = 40 + (y - 128) * 0.42;
    return { x: 120 + (t - 0.5) * 2 * spread * 0.8, y, r: i % 5 === 0 ? 1.9 : i % 2 ? 1.1 : 1.4, d: 6 + (i % 7), rise: 18 + (i % 4) * 8, drift: (i % 2 ? 1 : -1) * (4 + (i % 3) * 3), delay: (i % 9) * 0.45 };
  }), []);
  const pleats = Array.from({ length: 13 }, (_, i) => i);
  return (
    <svg width={240} height={460} viewBox="0 0 240 460" className="absolute inset-0 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="lamp-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FEF3C7" stopOpacity="0.6" />
          <stop offset="0.35" stopColor="#FDE68A" stopOpacity="0.26" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lamp-core" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFBEB" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lamp-pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FDE68A" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#F59E0B" stopOpacity="0.18" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lamp-bloom" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FEF3C7" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#FCD34D" stopOpacity="0.16" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lamp-shade-off" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0F172A" />
          <stop offset="0.38" stopColor="#334155" />
          <stop offset="0.62" stopColor="#1E293B" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
        <radialGradient id="lamp-shade-on" cx="0.5" cy="0.85" r="0.85">
          <stop offset="0" stopColor="#FFFBEB" />
          <stop offset="0.45" stopColor="#FEF3C7" />
          <stop offset="0.8" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </radialGradient>
        <linearGradient id="lamp-shade-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B45309" stopOpacity="0.45" />
          <stop offset="0.3" stopColor="#B45309" stopOpacity="0" />
          <stop offset="0.7" stopColor="#B45309" stopOpacity="0" />
          <stop offset="1" stopColor="#B45309" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="lamp-brass" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#78350F" />
          <stop offset="0.45" stopColor="#F59E0B" />
          <stop offset="0.6" stopColor="#D97706" />
          <stop offset="1" stopColor="#78350F" />
        </linearGradient>
        <filter id="lamp-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id="lamp-feather" x="-30%" y="-10%" width="160%" height="130%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>

      {/* The light: a bloom round the shade, a feathered cone, a bright core, a pool on the floor. */}
      <motion.g initial={false} animate={state} variants={glowV}>
        <motion.g animate={lit && !still ? { opacity: [1, 0.86, 1, 0.93, 1] } : { opacity: 1 }}
          transition={lit && !still ? { duration: 5.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}>
          <ellipse cx="120" cy="96" rx="150" ry="110" fill="url(#lamp-bloom)" />
          <path d="M56 128 L184 128 L310 448 L-70 448 Z" fill="url(#lamp-cone)" filter="url(#lamp-feather)" />
          <path d="M86 128 L154 128 L210 448 L30 448 Z" fill="url(#lamp-core)" filter="url(#lamp-feather)" />
          <ellipse cx="120" cy="448" rx="180" ry="24" fill="url(#lamp-pool)" />
          <ellipse cx="120" cy="30" rx="54" ry="22" fill="url(#lamp-bloom)" />
        </motion.g>
      </motion.g>

      {/* Floor shadow, deeper when lit from above */}
      <motion.ellipse cx="120" cy="448" rx="74" ry="6" fill="#020617" initial={false} animate={{ opacity: lit ? 0.75 : 0.45 }} transition={{ duration: 0.6 }} />

      {/* Cable from the foot, across the floor */}
      <path d="M121 334 C 126 384, 152 432, 236 448" fill="none" stroke="#334155" strokeWidth="1.8" />

      {/* Tripod and pole */}
      <g stroke="url(#lamp-brass)" strokeLinecap="round">
        <line x1="120" y1="322" x2="56" y2="447" strokeWidth="5" />
        <line x1="120" y1="322" x2="184" y2="447" strokeWidth="5" />
      </g>
      <line x1="120" y1="322" x2="127" y2="440" stroke="#78350F" strokeWidth="4" strokeLinecap="round" />
      <rect x="117.75" y="128" width="4.5" height="196" rx="2" fill="url(#lamp-brass)" />
      <rect x="119" y="128" width="1.2" height="196" fill="#FEF3C7" opacity={lit ? 0.75 : 0.25} />
      <circle cx="56" cy="447" r="3" fill="#FCD34D" opacity="0.85" />
      <circle cx="184" cy="447" r="3" fill="#FCD34D" opacity="0.85" />
      <rect x="112" y="313" width="16" height="15" rx="4" fill="#92400E" />
      <rect x="114" y="315" width="12" height="4" rx="2" fill="#FCD34D" opacity="0.6" />

      {/* Under the shade: the bulb, seen when lit. */}
      <motion.g initial={false} animate={state} variants={glowV}>
        <ellipse cx="120" cy="127" rx="64" ry="8" fill="#FFFBEB" filter="url(#lamp-soft)" />
        <circle cx="120" cy="116" r="11" fill="#FFFBEB" />
        <circle cx="120" cy="116" r="18" fill="#FEF3C7" opacity="0.6" filter="url(#lamp-soft)" />
      </motion.g>

      {/* The shade: dark cloth when off, lit through from inside when on. */}
      <path d="M74 40 L166 40 L190 126 Q120 136 50 126 Z" fill="url(#lamp-shade-off)" />
      <motion.path d="M74 40 L166 40 L190 126 Q120 136 50 126 Z" fill="url(#lamp-shade-on)" initial={false} animate={state} variants={shadeV} />
      <motion.path d="M74 40 L166 40 L190 126 Q120 136 50 126 Z" fill="url(#lamp-shade-edge)" initial={false} animate={state} variants={shadeV} />
      {pleats.map((i) => (
        <line key={i} x1={74 + i * (92 / 12)} y1="41" x2={50 + i * (140 / 12)} y2={126 + Math.sin((i / 12) * Math.PI) * 4.5}
          stroke={lit ? '#B45309' : '#F8FAFC'} strokeOpacity={lit ? 0.16 : 0.05} strokeWidth="1" style={{ transition: 'stroke 600ms, stroke-opacity 600ms' }} />
      ))}
      <ellipse cx="120" cy="40" rx="46" ry="3.5" fill={lit ? '#FFFBEB' : '#334155'} style={{ transition: 'fill 500ms' }} />
      <path d="M50 126 Q120 136 190 126" fill="none" stroke={lit ? '#FCD34D' : '#475569'} strokeWidth="1.6" style={{ transition: 'stroke 500ms' }} />
      <circle cx="120" cy="30" r="5.5" fill="url(#lamp-brass)" />
      <circle cx="118.5" cy="28.5" r="1.6" fill="#FEF3C7" opacity="0.8" />
      <line x1="120" y1="35" x2="120" y2="40" stroke="#92400E" strokeWidth="2" />

      {/* Dust in the light */}
      {!still && motes.map((m, i) => (
        <motion.circle key={i} cx={m.x} cy={m.y} r={m.r} fill="#FFFBEB"
          initial={false}
          animate={lit ? { opacity: [0, 0.85, 0.5, 0], y: [0, -m.rise * 0.5, -m.rise], x: [0, m.drift, m.drift * 0.4] } : { opacity: 0 }}
          transition={lit ? { duration: m.d, repeat: Infinity, ease: 'easeInOut', delay: 0.6 + m.delay } : { duration: 0.4 }} />
      ))}
    </svg>
  );
}

/** The pull chain: drag the brass bead down and let go, or press it. It swings after. */
function Cord({ lit, onPull, disabled, still, focusRef, onTug, idle }: {
  lit: boolean; onPull: () => void; disabled: boolean; still: boolean; focusRef: React.RefObject<HTMLButtonElement | null>; onTug: () => void; idle: boolean;
}) {
  const y = useMotionValue(0);
  const swing = useMotionValue(0);
  const length = useTransform(y, (v) => CORD + Math.max(0, v));
  const dragged = useRef(false);

  /* Not pulled yet: the chain sways a little, asking to be pulled. */
  useEffect(() => {
    if (still || !idle) return;
    const c = animate(swing, [0, 4, 0, -4, 0], { duration: 3.2, repeat: Infinity, ease: 'easeInOut' });
    return () => c.stop();
  }, [still, idle]);

  const release = () => {
    if (still) return;
    animate(swing, 0, { type: 'spring', stiffness: 90, damping: 3.5, velocity: 140 });
  };
  const tug = () => {
    if (disabled) return;
    if (still) { onPull(); return; }
    onTug();
    animate(y, [0, 42, 0], { duration: 0.55, times: [0, 0.35, 1], ease: 'easeOut' });
    window.setTimeout(() => { onPull(); release(); }, 200);
  };
  const chain = lit ? '#FDE68A' : '#94A3B8';
  return (
    <motion.div className="absolute" style={{ left: CORD_X, top: CORD_Y, rotate: swing, transformOrigin: '0px 0px' }}>
      <motion.span aria-hidden className="absolute left-0 top-0 w-1 -ml-0.5"
        style={{ height: length, backgroundImage: `radial-gradient(circle at 50% 50%, ${chain} 1.3px, transparent 1.7px)`, backgroundSize: '4px 5px', backgroundRepeat: 'repeat-y', transition: 'background-image 400ms' }} />
      <motion.button ref={focusRef} type="button" disabled={disabled}
        aria-label={lit ? 'Pull the cord to turn the lamp off' : 'Pull the cord to turn the lamp on'}
        className="group absolute left-0 grid place-items-center w-11 h-14 rounded-full cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:cursor-default"
        style={{ top: CORD - 8, x: '-50%', y }}
        drag={disabled || still ? false : 'y'} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} dragSnapToOrigin
        onDragStart={() => { dragged.current = true; onTug(); }}
        onDragEnd={(_, info) => { if (info.offset.y > PULL) onPull(); release(); }}
        onClick={() => { if (dragged.current) { dragged.current = false; return; } tug(); }}>
        {/* The brass bead, with a glint, and a glow while the lamp is dark. */}
        <span className="relative block">
          {!lit && !still && !disabled && (
            <motion.span aria-hidden className="absolute -inset-2 rounded-full bg-amber-400/25 blur-sm"
              animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.9, 1.15, 0.9] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
          )}
          <span className={`relative block w-4 h-6 rounded-full shadow-lg transition-transform group-hover:scale-110 ${lit ? 'bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500' : 'bg-gradient-to-b from-amber-400 via-amber-600 to-amber-800'}`}>
            <span className="absolute left-1 top-1 w-1 h-2 rounded-full bg-amber-50/70" />
          </span>
        </span>
      </motion.button>
    </motion.div>
  );
}

/** The room: night through an arched window, a picture and a plant that come out of the dark. */
function Room({ lit }: { lit: boolean }) {
  const state = lit ? 'on' : 'off';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* The wall warms round the lamp (on a wide screen, across the whole room: see Ambient). */}
      <motion.div className="absolute inset-0 md:hidden" initial={false} animate={state} variants={glowV}
        style={{ background: 'radial-gradient(70% 60% at 50% 26%, rgba(245, 158, 11, 0.30), rgba(217, 119, 6, 0.10) 45%, transparent 75%)' }} />

      {/* The window, with stars and the moon, and its light on the floor. */}
      <div className="absolute left-[7%] top-[11%] w-[19%] max-w-[104px] aspect-[3/5] rounded-t-full overflow-hidden border-[3px] border-slate-700 bg-gradient-to-b from-[#3D52A0]/40 via-[#3D52A0]/15 to-slate-900/40">
        <span className="absolute right-[18%] top-[16%] w-[26%] aspect-square rounded-full bg-slate-200 shadow-[0_0_18px_4px_rgba(226,232,240,0.35)]" />
        {[[22, 30], [60, 44], [34, 58], [72, 70], [18, 76], [48, 24]].map(([l, t], i) => (
          <motion.span key={i} className="absolute w-0.5 h-0.5 rounded-full bg-slate-200" style={{ left: `${l}%`, top: `${t}%` }}
            animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2 + i * 0.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }} />
        ))}
        <span className="absolute inset-y-0 left-1/2 w-[3px] -ml-px bg-slate-700" />
        <span className="absolute inset-x-0 top-[55%] h-[3px] bg-slate-700" />
      </div>
      <motion.div className="absolute inset-0" initial={false} animate={{ opacity: lit ? 0.35 : 1 }} transition={{ duration: 0.8 }}
        style={{ clipPath: 'polygon(8% 85%, 24% 85%, 40% 100%, 6% 100%)', background: 'linear-gradient(180deg, rgba(203, 213, 225, 0.16), rgba(61, 82, 160, 0.04))', filter: 'blur(5px)' }} />

      {/* A picture on the wall: the studio's colours, a hill and a sun. */}
      <motion.div className="absolute right-[9%] top-[15%] w-[17%] max-w-[92px] aspect-[4/5] rounded-sm border-[4px] border-amber-900 bg-slate-800 shadow-xl overflow-hidden"
        initial={false} animate={state} variants={roomV}>
        <span className="absolute inset-[10%] bg-slate-100 overflow-hidden">
          <span className="absolute left-[24%] top-[18%] w-[30%] aspect-square rounded-full bg-amber-400" />
          <span className="absolute -left-[20%] -bottom-[30%] w-[90%] aspect-square rounded-full bg-[#3D52A0]" />
          <span className="absolute -right-[30%] -bottom-[40%] w-[90%] aspect-square rounded-full bg-[#3D52A0]/60" />
        </span>
      </motion.div>

      {/* A plant in a pot, rim-lit by the lamp. */}
      <motion.svg className="absolute right-[7%] bottom-[7%] w-[16%] max-w-[92px]" viewBox="0 0 90 130" initial={false} animate={state} variants={roomV}>
        <g fill="#1E293B" stroke={lit ? '#D97706' : '#334155'} strokeWidth="1.2" style={{ transition: 'stroke 700ms' }}>
          <path d="M45 82 C 30 60, 10 52, 4 30 C 22 36, 38 50, 45 82 Z" />
          <path d="M45 82 C 44 52, 50 26, 62 6 C 66 34, 58 58, 45 82 Z" />
          <path d="M45 82 C 56 62, 74 54, 88 46 C 82 66, 64 76, 45 82 Z" />
          <path d="M45 82 C 36 70, 26 66, 16 64 C 24 76, 34 80, 45 82 Z" />
        </g>
        <path d="M24 82 H66 L60 126 H30 Z" fill="#334155" />
        <path d="M22 80 H68 V88 H22 Z" fill="#475569" />
        <path d="M24 82 H32 L30 126" fill="#64748B" opacity="0.35" />
      </motion.svg>

      {/* The floor, and the wall meeting it. */}
      <div className="absolute inset-x-0 bottom-0 h-[16%] md:hidden bg-gradient-to-b from-slate-900/70 to-slate-950/80 border-t border-slate-700/40" />
    </div>
  );
}

/** On a wide screen the wall's glow and the floor run under the card too, centred on the lamp. */
function Ambient({ lit }: { lit: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
      <motion.div className="absolute inset-0" initial={false} animate={lit ? 'on' : 'off'} variants={glowV}
        style={{ background: 'radial-gradient(52% 70% at calc(50% - 200px) 24%, rgba(245, 158, 11, 0.30), rgba(217, 119, 6, 0.10) 45%, transparent 78%)' }} />
      <div className="absolute inset-x-0 bottom-0 h-[16%] bg-gradient-to-b from-slate-900/70 to-slate-950/80 border-t border-slate-700/40" />
    </div>
  );
}

export default function LampCheckIn(p: LampCheckInProps) {
  const still = !!useReducedMotion();
  const [lit, setLit] = useState(still);
  const [touched, setTouched] = useState(false);
  const [flash, setFlash] = useState(0);
  const head = useMotionValue(0);
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
    const t = window.setTimeout(() => goRef.current?.focus({ preventScroll: true }), still ? 0 : 900);
    return () => window.clearTimeout(t);
  }, [lit]);

  /* Day ended: lights out. */
  useEffect(() => {
    if (!finished || starting) return;
    const t = window.setTimeout(() => setLit(false), 1000);
    return () => window.clearTimeout(t);
  }, [finished, starting]);

  /* A tug on the chain: the lamp head nods towards it and wobbles back. */
  const tug = () => {
    setTouched(true);
    if (still) return;
    animate(head, 0, { type: 'spring', stiffness: 160, damping: 5, velocity: 26 });
  };
  const pull = () => {
    if (busy || finished) return;
    setTouched(true);
    setLit((l) => {
      if (!l) setFlash((f) => f + 1);
      return !l;
    });
  };
  const showCard = lit || (finished && !starting);
  const confirmLabel = starting
    ? (p.phase === 'locating' ? 'Finding you…' : p.phase === 'saving' ? 'Starting your day…' : 'Start my day')
    : (p.phase === 'saving' ? 'Ending your day…' : 'End my day');
  const canConfirm = !busy && !(starting && p.mode === 'Site' && !p.site);
  const line: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/60 backdrop-blur-sm" onClick={() => { if (!busy) p.onClose(); }} />
      <div className="phd-pop relative w-full max-w-[940px] max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-3xl border border-slate-700/60 shadow-2xl bg-[#12182F]">
        <button type="button" onClick={p.onClose} disabled={busy} aria-label="Close"
          className="absolute right-3 top-3 z-20 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50">
          <X className="w-4 h-4" />
        </button>

        <Ambient lit={lit} />
        <div className="relative grid md:grid-cols-[1fr_400px] md:min-h-[560px] items-center">
          {/* The room and the lamp */}
          <div className="relative h-[330px] md:h-[560px] md:self-stretch">
            <Room lit={lit} />
            <div className="relative flex justify-center pt-6 md:pt-12 h-full">
              <div className="relative w-[240px] h-[460px] origin-top scale-[0.62] md:scale-100">
              <motion.div className="relative w-full h-full" style={{ rotate: head, transformOrigin: '50% 100%' }}>
                <Lamp lit={lit} still={still} />
                <Cord lit={lit} onPull={pull} onTug={tug} disabled={busy || finished} still={still} focusRef={cordRef} idle={!touched && !lit} />
                <AnimatePresence>
                  {!lit && !finished && (
                    <motion.p key="hint" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.6, duration: 0.4 }}
                      className={`${LABEL} !text-slate-300 absolute whitespace-nowrap flex items-center gap-2 pointer-events-none`} style={{ left: CORD_X + 24, top: CORD_Y + CORD + 6 }}>
                      <span className="w-6 h-px bg-slate-500" />Pull the cord
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
              </div>
            </div>
            {/* The moment the bulb catches: a warm wash over the room. */}
            {!still && flash > 0 && (
              <motion.div key={flash} aria-hidden className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(80% 70% at 50% 24%, rgba(254, 243, 199, 0.45), transparent 70%)' }}
                initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} transition={{ duration: 0.9, times: [0, 0.2, 1], delay: 0.35 }} />
            )}
          </div>

          {/* The card */}
          <div className="relative px-4 pb-4 md:p-6 md:pl-0 min-h-[120px]" style={{ perspective: 1200 }}>
            <AnimatePresence mode="wait">
              {showCard ? (
                <motion.div key="card" className="relative rounded-3xl pp-glass p-6 overflow-hidden"
                  style={{ transformOrigin: '0% 50%' }}
                  initial={still ? false : { opacity: 0, x: 36, rotateY: -24, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1, transition: { duration: 0.8, ease: EASE, delay: still ? 0 : 0.45 } }}
                  exit={{ opacity: 0, x: 20, rotateY: -12, transition: { duration: 0.3 } }}>
                  {/* The edge nearest the lamp catches its light. */}
                  <motion.span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-amber-200/40 via-amber-100/10 to-transparent"
                    initial={false} animate={{ opacity: lit ? 1 : 0 }} transition={{ duration: 0.8 }} />
                  <div className="relative flex items-center gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{title}</p>
                    {p.practice && <Chip tone="warn" title="Nothing you do here is saved">Practice</Chip>}
                  </div>

                  <AnimatePresence mode="wait">
                    {finished ? (
                      <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        className="relative flex flex-col items-center text-center gap-3 py-8" role="status">
                        <span className="relative"><Confetti pieces={30} spread={110} /><DoneTick size={56} /></span>
                        <p className="font-bold text-slate-800">{p.done}</p>
                      </motion.div>
                    ) : (
                      <motion.div key="form" className="relative flex flex-col gap-4" exit={{ opacity: 0 }}
                        initial={still ? false : 'hidden'} animate="show"
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: still ? 0 : 0.75 } } }}>
                        <div className="mt-1">
                          <motion.h3 variants={line} className="text-2xl font-bold text-slate-800 tracking-tight leading-tight">
                            {starting ? `Good ${p.partOfDay}, ${p.name}.` : `Good work today, ${p.name}.`}
                          </motion.h3>
                          <motion.p variants={line} className="text-2xl font-bold text-[#3D52A0] tracking-tight leading-tight">
                            {starting ? "The light's on for you." : 'Time to switch off.'}
                          </motion.p>
                          <motion.p variants={line} className="text-xs text-slate-500 mt-2">{p.dateLabel} · {p.timeLabel}</motion.p>
                        </div>

                        {starting ? (
                          <>
                            {p.awaitingNote && (
                              <motion.p variants={line} className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{p.awaitingNote}
                              </motion.p>
                            )}
                            <motion.div variants={line}>
                              <p className={`${LABEL} mb-1.5`}>Where are you working</p>
                              <Glide id="lamp-mode" label="Where are you working" value={p.mode} onChange={p.onMode} disabled={busy}
                                options={[{ id: 'Office', label: 'Office', icon: MODE_ICON.Office }, { id: 'Site', label: 'Site', icon: MODE_ICON.Site }, { id: 'WFH', label: 'From home', icon: MODE_ICON.WFH }]} />
                            </motion.div>
                            {p.mode === 'Site' && (
                              <div>
                                <label className={`${LABEL} block mb-1.5`} htmlFor="lamp-site">Which site</label>
                                <select id="lamp-site" className={INPUT} value={p.site} onChange={(e) => p.onSite(e.target.value)} disabled={busy}>
                                  <option value="">Choose a site</option>
                                  {p.sites.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            )}
                            <motion.p variants={line} className="text-[11px] text-slate-500 flex items-start gap-1.5">
                              {p.mode !== 'WFH' && <MapPin className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />}{p.note}
                            </motion.p>
                          </>
                        ) : (
                          <>
                            <motion.div variants={line} className="grid grid-cols-3 gap-2">
                              {[['In at', p.inAt], ['Worked', p.worked], ['Where', p.where]].map(([k, v]) => (
                                <div key={k} className="rounded-xl border border-slate-200 bg-white px-3 py-2 min-w-0">
                                  <p className={LABEL}>{k}</p>
                                  <p className="text-sm font-black text-slate-800 tabular-nums truncate mt-0.5">{v || '—'}</p>
                                </div>
                              ))}
                            </motion.div>
                            {p.updateUrl && (
                              <motion.div variants={line} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <span className="text-xs text-slate-600 flex-1">Before you go: your daily work update.</span>
                                <a className="inline-flex items-center gap-1 text-xs font-bold text-[#3D52A0] hover:underline whitespace-nowrap" href={p.updateUrl} target="_blank" rel="noopener noreferrer">
                                  <FolderOpen className="w-3.5 h-3.5" />Open<ExternalLink className="w-3 h-3" />
                                </a>
                              </motion.div>
                            )}
                          </>
                        )}

                        <AnimatePresence>{p.problem && <Notice text={p.problem} tone="bad" onClose={p.onDismissProblem} />}</AnimatePresence>

                        <motion.div variants={line} className="flex flex-col gap-2 pt-1">
                          <button ref={goRef} type="button" onClick={p.onConfirm} disabled={!canConfirm}
                            className="pp-press w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 focus-visible:ring-offset-2">
                            {p.phase === 'locating'
                              ? <span className="pp-radar relative w-4 h-4 grid place-items-center rounded-full"><MapPin className="w-4 h-4" /></span>
                              : starting ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                            {confirmLabel}
                            {!busy && <ArrowRight className="w-4 h-4" />}
                          </button>
                          <Button variant="quiet" onClick={p.onClose} disabled={busy}>{starting ? 'Not now' : 'Keep working'}</Button>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div key="dark" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.35, duration: 0.5 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  className="text-center md:text-left px-2 py-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{title}</p>
                  <p className="text-2xl font-bold text-slate-200 tracking-tight leading-tight mt-2">
                    {starting ? 'It’s a little dark in here.' : 'Ready to call it a day?'}
                  </p>
                  <p className="text-sm font-semibold text-slate-400 mt-2">{starting ? 'Pull the lamp’s cord to begin.' : 'Pull the cord to wrap up.'}</p>
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
