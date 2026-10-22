import React, { createContext, useContext } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { EASE, IconTile, Skeleton, type RingTone } from '../people/PeopleBits';
import type { OpsSettings, QueueItem, WaitingItem, FollowUp, Escalation } from '../../lib/opsDesk';
import type { Lead } from '../../lib/leads';
import type { DoneToday } from '../../lib/opsTeam';
import type { DeskRecord } from '../../services/opsPeopleService';
import type { OpsMom } from '../../services/opsDeskService';
import type { VisitRequest } from '../../lib/clientCare';
import type { ClientMoney } from '../../lib/clientMoney';
import type { PulseRow } from './ClientCare';
import type { LogPrefill, Person } from './OpsDeskPanels';

/*
  The pieces every screen of the Ops Desk shares (DESIGN.md → "Ops Desk
  motion"): the Studio settings card with an icon tile that turns on hover,
  the grouped rail with its sliding highlight, chips, empty and loading
  states, and the desk itself as a context, so each panel reads what it needs
  instead of being handed thirty props.
*/

/* ── The desk, as every panel sees it ────────────────────────────────────── */

export type Section =
  | 'today' | 'leads' | 'pulse' | 'waiting' | 'payments' | 'visits' | 'minutes' | 'prep'
  | 'log' | 'checklists' | 'escalations' | 'team' | 'ask' | 'guide';

export interface DeskProjectFull {
  id: string;
  name: string;
  clientName: string;
  clientEmail: string;
  status: string;
  targetHandover: string | null;
  money: ClientMoney | null;
  location: string;
  config: string;
  raw: any;
}

export interface DeskActions {
  go: (s: Section) => void;
  log: (p: LogPrefill) => void;
  escalate: (p: LogPrefill) => void;
  capture: () => void;
  openItem: (q: QueueItem) => void;
  openClient: (projectId: string) => void;
  openLead: (leadId: string) => void;
  addLead: () => void;
  bookVisit: (projectId: string) => void;
  openProject: (projectId: string, tab?: string) => void;
  markDone: (f: FollowUp) => Promise<void>;
  later: (q: QueueItem) => void;
  /** Send a ready message on WhatsApp and log it as a reminder. */
  sendReminder: (w: WaitingItem, text: string) => Promise<void>;
  refresh: () => void;
  closeDay: () => void;
}

export interface Desk {
  tenantId: string;
  studioName: string;
  me: Person;
  /** Owner, Admin, Ops Director (or Super Admin): decides escalations, approves minutes, sees everyone. */
  isLead: boolean;
  isCR: boolean;
  canWrite: boolean;
  /** Whether this person sees the studio's money: amounts are left out for everyone else. */
  seesMoney: boolean;
  now: number;
  loading: boolean;
  settings: OpsSettings;
  team: Person[];
  projects: DeskProjectFull[];
  queue: QueueItem[];
  waiting: WaitingItem[];
  followUps: FollowUp[];
  escalations: Escalation[];
  moms: OpsMom[];
  visits: VisitRequest[];
  pulseRows: PulseRow[];
  leads: Lead[];
  done: DoneToday[];
  record: DeskRecord | null;
  /** Ids moved to the end of today with "Later today". */
  bumped: string[];
  act: DeskActions;
}

const DeskContext = createContext<Desk | null>(null);
export const DeskProvider = DeskContext.Provider;
export function useDesk(): Desk {
  const d = useContext(DeskContext);
  if (!d) throw new Error('useDesk outside the Ops Desk');
  return d;
}

/* ── Motion ──────────────────────────────────────────────────────────────── */

/** A section arriving: it rises and turns up to face you, in depth. */
export const deskSectionV: Variants = {
  hidden: { opacity: 0, y: 18, rotateX: -8, scale: 0.985 },
  show: { opacity: 1, y: 0, rotateX: 0, scale: 1, transition: { duration: 0.5, ease: EASE } },
  exit: { opacity: 0, y: -10, rotateX: 6, transition: { duration: 0.18 } },
};

/** A card that rises and settles, for the panels inside a section. */
export const cardV: Variants = {
  hidden: { opacity: 0, y: 16, rotateX: -6 },
  show: { opacity: 1, y: 0, rotateX: 0, transition: { duration: 0.48, ease: EASE } },
};

/* ── The card (DESIGN.md Panel), with a tile that turns on hover ─────────── */

export const Panel: React.FC<{
  icon: React.ComponentType<any>; title: string; blurb?: string; right?: React.ReactNode; children?: React.ReactNode;
  className?: string; tone?: RingTone; tour?: string;
}> = ({ icon, title, blurb, right, children, className = '', tone = 'brand', tour }) => {
  const still = useReducedMotion();
  return (
    <motion.section variants={still ? undefined : cardV} initial={still ? false : 'hidden'} animate="show" data-tour={tour}
      style={{ transformPerspective: 1200 }}
      className={`group bg-white rounded-2xl border border-slate-200 shadow-sm p-6 ${className}`}>
      <div className={`flex items-start gap-3 ${children ? 'mb-5' : ''}`}>
        <IconTile icon={icon} tone={tone} size="sm" className="!w-9 !h-9 !rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-800">{title}</h2>
          {blurb && <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>}
        </div>
        {right}
      </div>
      {children}
    </motion.section>
  );
};

/* ── Chips, eyebrows, empty and loading ──────────────────────────────────── */

export type ChipTone = 'brand' | 'slate' | 'amber' | 'emerald' | 'rose';
const CHIP: Record<ChipTone, string> = {
  brand: 'bg-[#3D52A0]/10 text-[#3D52A0]', slate: 'bg-slate-100 text-slate-600', amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700', rose: 'bg-rose-100 text-rose-700',
};
export const Chip: React.FC<{ tone?: ChipTone; children: React.ReactNode; title?: string }> = ({ tone = 'slate', children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${CHIP[tone]}`}>{children}</span>
);

export const EYEBROW = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
export const BRAND_EYEBROW = 'text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]';

export const Empty: React.FC<{ text: string; icon?: React.ComponentType<any> }> = ({ text, icon: Icon }) => (
  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center">
    {Icon && <span className="pp-float inline-grid place-items-center w-10 h-10 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] mb-2"><Icon className="w-5 h-5" /></span>}
    <p className="text-xs text-slate-500">{text}</p>
  </div>
);

export const Loading: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="flex flex-col gap-2" aria-label="Loading your desk">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}
  </div>
);

export const Avatar: React.FC<{ name: string; client?: boolean; size?: 'sm' | 'md' }> = ({ name, client, size = 'sm' }) => {
  const initials = String(name || '').replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <span title={name} className={`${size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-10 h-10 text-xs'} shrink-0 rounded-full grid place-items-center font-bold text-white ${client ? 'bg-slate-700' : 'bg-[#3D52A0]'}`}>
      {initials}
    </span>
  );
};

/* ── The rail, grouped, with a highlight that slides ─────────────────────── */

export interface RailItem { id: Section; label: string; icon: React.ComponentType<any>; n?: number; alert?: boolean; tour?: string }
export interface RailGroup { label?: string; items: RailItem[] }

export const Rail: React.FC<{ groups: RailGroup[]; on: Section; onPick: (s: Section) => void }> = ({ groups, on, onPick }) => {
  let i = 0;
  return (
    <nav aria-label="Ops Desk sections" className="lg:sticky lg:top-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
      {groups.map((g, gi) => (
        <div key={gi} className={`flex lg:flex-col gap-1 shrink-0 ${gi ? 'lg:pt-2' : ''}`}>
          {g.label && <p className={`${EYEBROW} hidden lg:block px-3 pt-1 pb-1`}>{g.label}</p>}
          {g.items.map((x) => {
            const Icon = x.icon;
            const active = on === x.id;
            const delay = (i++) * 30;
            return (
              <button key={x.id} type="button" onClick={() => onPick(x.id)} aria-current={active ? 'page' : undefined} data-tour={x.tour}
                className={`relative lg:w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors hud-row-in whitespace-nowrap ${active ? 'text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                style={{ animationDelay: `${delay}ms` }}>
                {active && (
                  <motion.span layoutId="desk-rail" className="absolute inset-0 rounded-xl bg-[#3D52A0] shadow-sm hud-rail-active"
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }} />
                )}
                <Icon className={`relative w-4 h-4 shrink-0 transition-transform ${active ? 'text-white scale-110' : 'text-slate-400'}`} />
                <span className="relative text-sm font-semibold flex-1 min-w-0 truncate">{x.label}</span>
                {!!x.n && (
                  <span className={`relative text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${active ? 'bg-white/20 text-white' : x.alert ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{x.n}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** What the first-week guide can see this person has already done. */
export const seenSteps = (d: Pick<Desk, 'followUps' | 'moms' | 'leads' | 'escalations' | 'me'>) => ({
  logged: d.followUps.some((f) => f.by === d.me.email),
  minutes: d.moms.some((m) => String(m.raw?.preparedBy?.email || '').toLowerCase() === d.me.email),
  lead: d.leads.some((l) => l.createdBy === d.me.email),
  escalated: d.escalations.some((e) => e.raisedBy === d.me.email),
});

export const fmtDay = (key?: string | null) => (key ? new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
export const fmtWhen = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toUpperCase();
export const firstName = (n: string) => String(n || '').trim().split(/[\s@]+/)[0] || 'there';

/** A phone number as WhatsApp and the dialler take it: digits, with India's code when none is given. */
export function dialable(phone: string | null | undefined): string {
  const d = String(phone || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return d.slice(1);
  const digits = d.replace(/^0+/, '');
  return digits.length === 10 ? `91${digits}` : digits;
}
export const waLink = (phone: string | null | undefined, text: string) => {
  const n = dialable(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
};
