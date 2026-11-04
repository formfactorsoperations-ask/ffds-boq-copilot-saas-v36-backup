import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Route, Bike, Car, CarFront, Building2, FolderOpen, Target, UserPlus, Search, ArrowLeftRight, MoveRight, CarTaxiFront, TrainFront, Footprints, HardHat, ShoppingBag, Handshake, Store, Sparkles, Plus, Check, X, Paperclip,
  Camera, Repeat, ArrowRight, IndianRupee, Hourglass, BadgeCheck, Wallet, RefreshCw, Pencil, ChevronDown, Trash2,
} from '@/lib/lucide-shim';
import {
  CLAIM_PURPOSES, PURPOSE_LABELS, TRAVEL_MODES, MODE_LABELS, FOR_KINDS, FOR_LABELS, forOf, byKm, canDelete, kmAmount, recentTrips, totalsOf, inr,
  type Claim, type ClaimPurpose, type ClaimStatus, type ClaimsView, type TravelMode, type ForKind,
} from '../../lib/peopleClaims';
import { addDays, type Snapshot } from '../../lib/peopleDesk';
import { personName, todayOf } from '../../lib/peopleView';
import { runClaims, receiptOf, openReceipt } from '../../services/peopleClaimsService';
import { loadLeads } from '../../services/leadsService';
import { isOpen as leadIsOpen, leadName, LEAD_STAGES } from '../../lib/leads';
import { useOrg } from '../../contexts/OrgContext';
import { Sheet, Label, input, btnPri, btnSec, btnSm } from '../opsDesk/OpsDeskPanels';
import { CountUp } from '../ui/HudBits';
import { Panel, Empty, Notice, Glide, Skeleton, IconTile, Avatar, Confetti, listV, rowV, EASE, type RingTone } from './PeopleBits';

/*
  TRAVEL CLAIMS (lib/peopleClaims.ts; the owner, 4 Nov 2026).

  Designers travel to sites and shop for selections; this is where they log a
  trip and get it paid back. Logging takes a few taps: when, why, where, how,
  and the distance or the fare (the studio's rate a km does the sum). A recent
  trip can be repeated in one tap. The founders approve or turn down each
  trip (or all of a person's at once) and mark them paid back.
*/

export const MODE_ICON: Record<TravelMode, React.ComponentType<any>> = {
  bike: Bike, car: Car, cab: CarFront, auto: CarTaxiFront, transit: TrainFront, other: Footprints,
};
export const PURPOSE_ICON: Record<ClaimPurpose, React.ComponentType<any>> = {
  'Site visit': HardHat, Selections: ShoppingBag, 'Client meeting': Handshake, 'Vendor visit': Store, Other: Sparkles,
};
export const FOR_ICON: Record<ForKind, React.ComponentType<any>> = { project: FolderOpen, lead: Target, enquiry: UserPlus, studio: Building2 };
const FOR_PICK: Record<ForKind, string> = { project: 'A project', lead: 'A lead', enquiry: 'New enquiry, not in the studio yet', studio: 'The studio (office errand)' };
const STATUS_TINT: Record<ClaimStatus, string> = {
  Pending: 'bg-amber-100 text-amber-700', Approved: 'bg-emerald-100 text-emerald-700', Paid: 'bg-[#3D52A0]/10 text-[#3D52A0]',
  Rejected: 'bg-rose-100 text-rose-700', Withdrawn: 'bg-slate-100 text-slate-600',
};
const STATUS_WORD: Record<ClaimStatus, string> = { Pending: 'Waiting', Approved: 'Approved', Paid: 'Paid back', Rejected: 'Not approved', Withdrawn: 'Taken back' };
const STATUS_TONE: Record<ClaimStatus, RingTone> = { Pending: 'warn', Approved: 'ok', Paid: 'brand', Rejected: 'bad', Withdrawn: 'slate' };
const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';
const niceDay = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const money = (v: number) => inr(v);

/** How the trip is described in a line: "12 km each way by own bike" or "Cab fare". */
export function tripLine(c: Claim): string {
  const how = c.km
    ? `${c.km} km each way by ${MODE_LABELS[c.mode].toLowerCase()}`
    : c.mode === 'other' ? 'other travel' : `by ${MODE_LABELS[c.mode].toLowerCase()}`;
  const route = c.from || c.to ? ` · ${c.from || '…'} ${c.roundTrip ? '⇄' : '→'} ${c.to || c.place}` : '';
  return `${PURPOSE_LABELS[c.purpose]} · ${c.roundTrip ? 'Round trip' : 'One way'} ${how}${c.extras ? ` + ${money(c.extras)} parking or tolls` : ''}${route}`;
}

/* ── The section ─────────────────────────────────────────────────────────── */

type Tab = 'mine' | 'decide' | 'pay';

export function TravelSection({ s, view, error, onRefresh, projects }: { s: Snapshot; view: ClaimsView | null; error: string | null; onRefresh: () => void; projects: PickItem[] }) {
  const [logging, setLogging] = useState<Partial<Claim> | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [notice, setNotice] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(t); }, [notice]);
  useEffect(() => { if (!burst) return; const t = window.setTimeout(() => setBurst(0), 1600); return () => window.clearTimeout(t); }, [burst]);

  if (!view) {
    return (
      <Panel icon={Route} title="Travel claims" blurb="Log a trip to a site, a shop or a client, and get it paid back.">
        {error ? <Empty icon={Route} text={error}><button type="button" className={btnSec} onClick={onRefresh}><RefreshCw className="w-4 h-4" />Try again</button></Empty>
          : <Skeleton className="h-56 rounded-2xl" />}
      </Panel>
    );
  }
  const month = todayOf(s).slice(0, 7);
  const t = totalsOf(view.mine.filter((c) => c.date.slice(0, 7) === month));
  const logged = (amount: number) => { setLogging(null); setBurst(Date.now()); setNotice(`Trip logged: ${money(amount)}. The founders have it now.`); setTab('mine'); };

  return (
    <>
      <Panel icon={Route} title="Travel claims" blurb={view.founder ? 'Your trips, and the studio’s to approve and pay back.' : 'Log a trip to a site, a shop or a client. A founder approves it and pays it back.'}
        aside={<button type="button" className="pp-press inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]" onClick={() => setLogging({})}><Plus className="w-4 h-4" />Log a trip</button>}>
        <AnimatePresence>{notice && <Notice text={notice} onClose={() => setNotice(null)} />}</AnimatePresence>
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 mt-1 mb-5">
          {burst > 0 && <Confetti pieces={24} spread={130} />}
          {([[IndianRupee, view.founder ? 'You claimed this month' : 'Claimed this month', t.claimed, 'brand'], [Hourglass, 'Your trips waiting', t.waiting, 'warn'], [BadgeCheck, 'Approved', t.approved, 'ok'], [Wallet, 'Paid back to you', t.paid, 'brand']] as const).map(([Icon, k, v, tone], i) => (
            <motion.div key={k} initial={{ opacity: 0, y: 8, rotateX: -40 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: i * 0.07, duration: 0.5, ease: EASE }} style={{ transformPerspective: 600 }}
              className="group rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3">
              <IconTile icon={Icon} tone={tone} size="sm" />
              <span className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight">{k}</p>
                <p className="text-sm font-black text-slate-800 tabular-nums mt-1"><CountUp value={v} format={money} /></p></span>
            </motion.div>
          ))}
        </div>
        {view.founder && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Glide id="travel-tab" label="Show" value={tab} onChange={setTab} options={[
              { id: 'mine', label: 'My trips' },
              { id: 'decide', label: `To approve${view.toDecide.length ? ` · ${view.toDecide.length}` : ''}` },
              { id: 'pay', label: `To pay back${view.toPay.length ? ` · ${view.toPay.length}` : ''}` },
            ]} />
            <RatesEditor view={view} onDone={setNotice} />
          </div>
        )}
        {tab === 'mine' && <MyTrips view={view} onRepeat={(c) => setLogging(c)} onLog={() => setLogging({})} onNotice={setNotice} />}
        {tab === 'decide' && view.founder && <ClaimApprovals s={s} view={view} onDone={setNotice} bare />}
        {tab === 'pay' && view.founder && <PayBack s={s} view={view} onDone={setNotice} />}
      </Panel>
      {logging && <LogTripSheet s={s} view={view} projects={projects} from={logging} onClose={() => setLogging(null)} onSaved={logged} />}
    </>
  );
}

/* ── Your trips ──────────────────────────────────────────────────────────── */

function MyTrips({ view, onRepeat, onLog, onNotice }: { view: ClaimsView; onRepeat: (c: Claim) => void; onLog: () => void; onNotice: (m: string) => void }) {
  const [shown, setShown] = useState(40);
  const months = useMemo(() => {
    const out: { month: string; list: Claim[] }[] = [];
    for (const c of view.mine.slice(0, shown)) {
      const m = c.date.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.month === m) last.list.push(c); else out.push({ month: m, list: [c] });
    }
    return out;
  }, [view.mine, shown]);
  if (!view.mine.length) return <FirstTrip onLog={onLog} />;
  return (
    <>
      {months.map((m) => {
        const t = totalsOf(m.list);
        return (
          <div key={m.month} className="mb-5 last:mb-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">{monthLabel(m.month)} · {t.trips} trip{t.trips === 1 ? '' : 's'} · {money(t.claimed)}</p>
            <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              <AnimatePresence initial={false}>
                {m.list.map((c) => (
                  <TripRow key={c.id} c={c} right={<>
                    {c.status !== 'Pending' && <button type="button" className={`${btnSm} opacity-0 group-hover:opacity-100 focus:opacity-100`} onClick={() => onRepeat(c)}><Repeat className="w-3.5 h-3.5" />Again</button>}
                    {(c.status === 'Pending' || c.status === 'Rejected' || c.status === 'Withdrawn') && <DeleteTrip c={c} onDone={onNotice} />}
                  </>} />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        );
      })}
      {view.mine.length > shown && <button type="button" className={btnSm} onClick={() => setShown((n) => n + 40)}>Show more</button>}
    </>
  );
}

/** No trips yet: a little road with each way of travelling riding along it, and the one thing to do. */
function FirstTrip({ onLog }: { onLog: () => void }) {
  const modes: TravelMode[] = ['bike', 'auto', 'cab', 'transit'];
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-8 flex flex-col items-center gap-4 text-center">
      <span className="relative w-full max-w-sm h-12">
        <motion.span className="absolute left-0 right-0 top-1/2 border-t-2 border-dashed border-[#3D52A0]/30" style={{ transformOrigin: '0 50%' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, ease: EASE }} />
        <span className="absolute left-0 top-1/2 -translate-y-1/2 z-10"><IconTile icon={Building2} size="sm" tone="slate" /></span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 z-10"><IconTile icon={HardHat} size="sm" tone="ok" /></span>
        {modes.map((m, i) => {
          const Icon = MODE_ICON[m];
          return (
            <motion.span key={m} className="absolute top-1/2 -mt-3.5 w-7 h-7 rounded-full bg-white border border-slate-200 text-[#3D52A0] grid place-items-center shadow-sm"
              initial={{ left: '10%', opacity: 0 }} animate={{ left: ['10%', '82%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 3.2, delay: 0.6 + i * 0.8, repeat: Infinity, repeatDelay: 0, ease: 'easeInOut', times: [0, 0.1, 0.9, 1] }}>
              <Icon className="w-3.5 h-3.5" />
            </motion.span>
          );
        })}
      </span>
      <p className="text-sm font-semibold text-slate-800">Went to a site, a shop or a client for work?</p>
      <p className="text-xs text-slate-500 -mt-2">Log the trip in four taps and get it paid back.</p>
      <motion.button type="button" onClick={onLog} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} animate={{ boxShadow: ['0 0 0 0 rgba(61,82,160,0.35)', '0 0 0 10px rgba(61,82,160,0)'] }} transition={{ boxShadow: { duration: 1.6, repeat: Infinity } }}
        className="pp-press inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]"><Plus className="w-4 h-4" />Log your first trip</motion.button>
    </div>
  );
}

/** A bin that asks first: "Delete this trip?" in rose, then the trip slides away. Deleting also removes its receipt. */
export const DeleteTrip: React.FC<{ c: Claim; onDone?: (m: string) => void }> = ({ c, onDone }) => {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    const r = await runClaims('delete', { claimId: c.id });
    setBusy(false);
    if ('error' in r) { setError(r.error); return; }
    onDone?.(`Deleted: ${c.place}, ${money(c.amount)}.`);
  };
  return (
    <AnimatePresence mode="wait" initial={false}>
      {asking ? (
        <motion.span key="ask" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }} className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="text-xs font-semibold text-rose-700">{error || 'Delete this trip?'}</span>
          <button type="button" disabled={busy} onClick={go} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />{busy ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" className={btnSm} disabled={busy} onClick={() => { setAsking(false); setError(null); }}>Keep</button>
        </motion.span>
      ) : (
        <motion.button key="bin" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} whileHover={{ rotate: -14, scale: 1.08 }} whileTap={{ scale: 0.9 }}
          onClick={() => setAsking(true)} aria-label="Delete this trip" title="Delete this trip"
          className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-rose-600 hover:bg-rose-50">
          <Trash2 className="w-4 h-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
};

/** One trip: how, when, where, what it came to and where it stands. */
export const TripRow: React.FC<{ c: Claim; who?: string; right?: React.ReactNode }> = ({ c, who, right }) => {
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const last = [...c.decisions].reverse().find((d) => d.status === 'Rejected' || d.status === 'Approved' || d.status === 'Paid');
  const receipt = async () => { setOpening(true); setProblem(await openReceipt(c.id)); setOpening(false); };
  return (
    <motion.div variants={rowV} layout exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }} className="group flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 transition-colors">
      <IconTile icon={MODE_ICON[c.mode]} size="sm" tone={STATUS_TONE[c.status]} />
      <div className="w-14 shrink-0 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{new Date(`${c.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short' })}</p>
        <p className="text-sm font-black text-slate-800 tabular-nums">{new Date(`${c.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">{who && <span>{who} · </span>}<span className="truncate">{c.place}</span>
          <ForChip c={c} /></p>
        <p className="text-[11px] text-slate-500 truncate">{tripLine(c)}</p>
        {(c.note || (c.status === 'Rejected' && last?.note)) && (
          <p className="text-[11px] text-slate-600 truncate">{c.note ? `“${c.note}”` : ''}{c.status === 'Rejected' && last?.note ? `${c.note ? ' · ' : ''}${last.byName}: “${last.note}”` : ''}</p>
        )}
        {problem && <p className="text-[11px] text-rose-700">{problem}</p>}
      </div>
      {c.receipt && (
        <button type="button" onClick={receipt} disabled={opening} aria-label="Open the receipt" title="Open the receipt"
          className="w-8 h-8 rounded-lg grid place-items-center text-slate-500 hover:bg-white hover:text-[#3D52A0] border border-transparent hover:border-slate-200"><Paperclip className="w-4 h-4" /></button>
      )}
      <span className="text-sm font-black text-slate-800 tabular-nums w-20 text-right">{money(c.amount)}</span>
      <span className={`${chip} ${STATUS_TINT[c.status]}`}>{STATUS_WORD[c.status]}</span>
      {right}
    </motion.div>
  );
};

/* ── Logging a trip ──────────────────────────────────────────────────────── */

/*
  Four short steps (the owner, 4 Nov 2026: "make this easier, with animation"):
  where and when, what for, how, and what it cost. Picking a tile moves on by
  itself. Above them a trip ticket fills in as you answer: the route draws
  itself, the way you travelled rides along it, and the amount lands at the
  end. By own bike or car the cost can be worked out from the km.
*/
interface Form { forKind: ForKind | null; forId: string; forName: string; date: string; purpose: ClaimPurpose | null; place: string; from: string; to: string; mode: TravelMode | null; amount: string; km: string; roundTrip: boolean; note: string }
const STEPS = ['Who for', 'Where', 'What for', 'How', 'Cost'] as const;
/** A project or lead to pick: its id, its name and a second line. */
export interface PickItem { id: string; name: string; sub: string }

function LogTripSheet({ s, view, projects, from, onClose, onSaved }: { s: Snapshot; view: ClaimsView; projects: PickItem[]; from: Partial<Claim>; onClose: () => void; onSaved: (amount: number) => void }) {
  const leads = useLeadPicks();
  const sites = useMemo(() => projects.map((p) => p.name), [projects]);
  const today = todayOf(s);
  const repeat = !!from.place;
  const [f, setF] = useState<Form>(() => ({
    forKind: from.for?.kind || null, forId: from.for?.id || '', forName: from.for?.name || '',
    date: today, purpose: from.purpose || null, place: from.place || '', from: from.from ?? 'Office', to: from.to || '', mode: from.mode || null,
    amount: from.amount ? String(from.amount) : '', km: from.km ? String(from.km) : '', roundTrip: from.roundTrip ?? true, note: '',
  }));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const [step, setStep] = useState(repeat ? 4 : 0);
  const [find, setFind] = useState('');
  const [dir, setDir] = useState(1);
  const [kmOpen, setKmOpen] = useState(!!from.km);
  const [receipt, setReceipt] = useState<{ type: string; data: string; preview: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recent = useMemo(() => recentTrips(view.mine), [view.mine]);
  const places = useMemo(() => {
    const all = [...new Set([...view.mine.map((c) => c.place), ...sites])];
    const q = f.place.trim().toLowerCase();
    return all.filter((p) => !q || (p.toLowerCase().includes(q) && p.toLowerCase() !== q)).slice(0, 6);
  }, [sites, view.mine, f.place]);

  const amount = Math.round(Number(f.amount) || 0);
  const rate = f.mode === 'car' ? view.rates.car : view.rates.bike;
  const fromKm = kmAmount(Number(f.km) || 0, f.roundTrip, rate);
  const forOk = !!f.forKind && (f.forKind === 'studio' || ((f.forKind === 'enquiry' || !!f.forId) && f.forName.trim().length >= 2));
  const ready = [forOk, f.place.trim().length >= 2, !!f.purpose, !!f.mode, amount > 0];
  const go = (to: number) => { setDir(to > step ? 1 : -1); setStep(to); };
  const pick = <K extends 'purpose' | 'mode'>(k: K, v: Form[K]) => { set(k, v); window.setTimeout(() => go(k === 'purpose' ? 3 : 4), 260); };
  /* A project or lead picked: the place starts as its name, and on to Where. */
  const pickFor = (kind: ForKind, item?: PickItem) => {
    setF((x) => ({ ...x, forKind: kind, forId: item?.id || '', forName: item?.name || (kind === 'studio' ? 'Studio' : kind === x.forKind ? x.forName : ''), place: x.place || (item && kind === 'project' ? item.name : x.place) }));
    if (item || kind === 'studio') window.setTimeout(() => go(1), 260);
  };
  const again = (c: Claim) => {
    const was = forOf(c);
    setF((x) => ({ ...x, forKind: c.for ? was.kind : null, forId: was.id, forName: c.for ? was.name : '', purpose: c.purpose, place: c.place, from: c.from, to: c.to, mode: c.mode, amount: String(c.amount), km: c.km ? String(c.km) : '', roundTrip: c.roundTrip }));
    setKmOpen(!!c.km);
    go(c.for ? 4 : 0);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError(null);
    try { setReceipt(await receiptOf(file)); } catch (e: any) { setError(String(e?.message || e)); }
    setReading(false);
  };
  const send = async () => {
    const first = ready.findIndex((x) => !x);
    if (first >= 0) { go(first); return; }
    setSaving(true);
    setError(null);
    const r = await runClaims('log', {
      for: { kind: f.forKind, id: f.forId, name: f.forKind === 'studio' ? 'Studio' : f.forName }, date: f.date, purpose: f.purpose, place: f.place, from: f.from, to: f.to, mode: f.mode, amount, note: f.note,
      km: kmOpen && byKm(f.mode as TravelMode) ? Number(f.km) || 0 : 0, roundTrip: f.roundTrip,
      receipt: receipt ? { type: receipt.type, data: receipt.data } : null,
    });
    setSaving(false);
    if ('error' in r) { setError(r.error); return; }
    setSent(true);
    window.setTimeout(() => onSaved(amount), 1300);
  };

  return (
    <Sheet eyebrow="Travel" title="Log a trip" sub="Five quick steps. A founder approves it and pays it back." onClose={onClose}
      footer={<>
        <span className="mr-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">Step {step + 1} of {STEPS.length}</span>
        {step > 0 && <button type="button" className={btnSec} onClick={() => go(step - 1)} disabled={saving || sent}>Back</button>}
        {step < STEPS.length - 1
          ? <button type="button" className={btnPri} disabled={!ready[step]} onClick={() => go(step + 1)}>Next<ArrowRight className="w-4 h-4" /></button>
          : <button type="button" className={btnPri} disabled={saving || reading || sent || !ready[4]} onClick={send}><Check className="w-4 h-4" />{sent ? 'Sent' : saving ? 'Sending…' : `Send ${amount ? money(amount) : ''} for approval`}</button>}
      </>}>
      <TripTicket f={f} amount={amount} sent={sent} today={today} />

      <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Steps">
        {STEPS.map((label, i) => (
          <button key={label} type="button" role="tab" aria-selected={step === i} disabled={i > 0 && !ready.slice(0, i).every(Boolean)} onClick={() => go(i)}
            className="group flex flex-col gap-1.5 text-left disabled:cursor-not-allowed">
            <span className="relative h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <motion.span className="absolute inset-y-0 left-0 rounded-full bg-[#3D52A0]" initial={false} animate={{ width: i < step || (i === step && ready[i]) ? '100%' : i === step ? '35%' : '0%' }} transition={{ duration: 0.4, ease: EASE }} />
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${step === i ? 'text-[#3D52A0]' : ready[i] ? 'text-slate-600' : 'text-slate-400'}`}>{ready[i] && i !== step ? '✓ ' : ''}{label}</span>
          </button>
        ))}
      </div>

      <div className="relative min-h-[230px]">
        {/* The next step slides in at once: waiting for the last one to leave (mode="wait") could stall on a blank step, e.g. after "Earlier" was picked. */}
          <motion.div key={step} initial={{ opacity: 0, x: dir * 36 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, ease: EASE }} className="flex flex-col gap-4">
            {step === 0 && (
              <>
                {recent.length > 0 && (
                  <div>
                    <Label>Same as before</Label>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((c) => {
                        const Icon = MODE_ICON[c.mode];
                        return (
                          <motion.button key={c.id} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => again(c)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-[#3D52A0]/40 hover:text-[#3D52A0]">
                            <Repeat className="w-3.5 h-3.5" /><Icon className="w-3.5 h-3.5" />{c.place} · {money(c.amount)}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <Label>Who was this trip for?</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {FOR_KINDS.map((k, i) => <Choice key={k} i={i} on={f.forKind === k} icon={FOR_ICON[k]} label={FOR_PICK[k]} group="for" onPick={() => { setFind(''); pickFor(k); }} />)}
                  </div>
                </div>
                {(f.forKind === 'project' || f.forKind === 'lead') && (
                  <PickList key={f.forKind} items={f.forKind === 'project' ? projects : leads} chosen={f.forId} find={find} onFind={setFind}
                    empty={f.forKind === 'project' ? 'No projects to show. If it is not in the studio yet, pick New enquiry.' : leads === null ? 'Only founders and Client Relations can see leads. Pick New enquiry and type the name instead.' : 'No open leads. Pick New enquiry and type the name instead.'}
                    onPick={(item) => pickFor(f.forKind as ForKind, item)} />
                )}
                {f.forKind === 'enquiry' && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Label htmlFor="trip-enquiry">Who is the enquiry from?</Label>
                    <input id="trip-enquiry" autoFocus className={`${input} text-base py-3`} value={f.forName} maxLength={80} placeholder="Client name, e.g. Mrs Kapoor, Powai flat"
                      onChange={(e) => set('forName', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ready[0]) go(1); }} />
                    <p className="text-[11px] text-slate-500 mt-1.5">Not in the studio yet. Founders see it by this name in the reports.</p>
                  </motion.div>
                )}
              </>
            )}
            {step === 1 && (
              <>
                <div>
                  <Label htmlFor="trip-place">Where did you go?</Label>
                  <input id="trip-place" autoFocus className={`${input} text-base py-3`} value={f.place} maxLength={80} placeholder="The site, shop or client"
                    onChange={(e) => set('place', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ready[1]) go(2); }} />
                  <AnimatePresence initial={false}>
                    {places.length > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-1.5 mt-2">
                        {places.map((p, i) => (
                          <motion.button key={p} type="button" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => set('place', p)}
                            className="px-2.5 py-1 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-xs font-semibold hover:bg-[#3D52A0]/20">{p}</motion.button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div>
                  <Label>One way or round trip?</Label>
                  <Glide id="trip-way" label="One way or round trip" value={f.roundTrip ? 'round' : 'one'} onChange={(v) => set('roundTrip', v === 'round')}
                    options={[{ id: 'one', label: 'One way' }, { id: 'round', label: 'Round trip (there and back)' }]} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                  <div><Label htmlFor="trip-from">From</Label><input id="trip-from" className={input} value={f.from} maxLength={80} placeholder="Office" onFocus={(e) => e.target.select()} onChange={(e) => set('from', e.target.value)} /></div>
                  <div>
                    <Label>When</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Glide id="trip-day" label="Day" value={f.date === today ? 'today' : f.date === addDays(today, -1) ? 'yesterday' : 'other'}
                        onChange={(v) => set('date', v === 'today' ? today : v === 'yesterday' ? addDays(today, -1) : addDays(today, -2))}
                        options={[{ id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'other', label: 'Earlier' }]} />
                      {f.date !== today && f.date !== addDays(today, -1) && (
                        <input type="date" aria-label="Day of the trip" className={`${input} w-40`} value={f.date} max={today} min={addDays(today, -90)} onChange={(e) => set('date', e.target.value)} />
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
            {step === 2 && (
              <div>
                <Label>What was it for?</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CLAIM_PURPOSES.map((p, i) => <Choice key={p} i={i} on={f.purpose === p} icon={PURPOSE_ICON[p]} label={PURPOSE_LABELS[p]} group="purpose" onPick={() => pick('purpose', p)} />)}
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <Label>How did you get there?</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TRAVEL_MODES.map((m, i) => <Choice key={m} i={i} on={f.mode === m} icon={MODE_ICON[m]} label={MODE_LABELS[m]} group="mode" onPick={() => pick('mode', m)} />)}
                </div>
              </div>
            )}
            {step === 4 && (
              <>
                <div>
                  <Label htmlFor="trip-amount">{f.roundTrip ? 'What did the round trip cost, there and back?' : 'What did the trip cost, one way?'}</Label>
                  <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 focus-within:border-[#3D52A0] bg-white px-4 py-2 transition-colors">
                    <IndianRupee className="w-6 h-6 text-[#3D52A0]" />
                    <input id="trip-amount" autoFocus type="number" inputMode="numeric" min={0} className="flex-1 min-w-0 text-2xl font-black text-slate-800 tabular-nums outline-none bg-transparent" placeholder="0"
                      value={f.amount} onChange={(e) => set('amount', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
                    <span className="text-xs text-slate-500">{f.mode && !byKm(f.mode) ? 'the fare, with any parking or tolls' : 'fuel, parking, tolls'}</span>
                  </div>
                </div>
                {f.mode && byKm(f.mode) && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                    <button type="button" onClick={() => setKmOpen((o) => !o)} aria-expanded={kmOpen} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#3D52A0]">
                      <Route className="w-4 h-4" />Work it out from km<span className="text-xs font-normal text-slate-500">at {money(rate)} a km</span>
                      <motion.span className="ml-auto inline-flex" animate={{ rotate: kmOpen ? 180 : 0 }}><ChevronDown className="w-4 h-4" /></motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {kmOpen && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-4 pb-3 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input aria-label="Distance one way, in km" type="number" inputMode="decimal" min={0} step="0.1" className={`${input.replace('w-full ', '')} w-24`} value={f.km} placeholder="12" onChange={(e) => set('km', e.target.value)} /><span className="whitespace-nowrap">km one way</span>
                          </label>
                          <span className="text-xs font-semibold text-slate-600">{f.roundTrip ? 'Round trip, so twice' : 'One way'}</span>
                          <span className="text-xs text-slate-500 tabular-nums">{Number(f.km) || 0} km{f.roundTrip ? ' × 2' : ''} × {money(rate)} = <b className="text-slate-800">{money(fromKm)}</b></span>
                          <button type="button" className={`${btnSm} ml-auto`} disabled={!fromKm} onClick={() => set('amount', String(fromKm))}><Check className="w-3.5 h-3.5" />Use {money(fromKm)}</button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-start">
                  <div>
                    <Label>Receipt</Label>
                    <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
                    {receipt ? (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                        {receipt.preview ? <img src={receipt.preview} alt="Receipt" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
                          : <span className="w-12 h-12 rounded-lg border border-slate-200 bg-white grid place-items-center text-[10px] font-bold text-slate-500">PDF</span>}
                        <button type="button" className={btnSm} onClick={() => setReceipt(null)}><X className="w-3.5 h-3.5" />Remove</button>
                      </motion.div>
                    ) : (
                      <button type="button" className={btnSec} disabled={reading} onClick={() => fileRef.current?.click()}><Camera className="w-4 h-4" />{reading ? 'Reading…' : 'Add a photo'}</button>
                    )}
                  </div>
                  <div><Label htmlFor="trip-note">Note (optional)</Label><input id="trip-note" className={input} value={f.note} maxLength={280} placeholder="Tile selection with the client" onChange={(e) => set('note', e.target.value)} /></div>
                </div>
              </>
            )}
          </motion.div>
      </div>
      {error && <Notice text={error} tone="bad" />}
    </Sheet>
  );
}

/** The trip as a ticket, filling in as it is logged: the route draws itself and the way you travelled rides along it. */
const TripTicket: React.FC<{ f: Form; amount: number; sent: boolean; today: string }> = ({ f, amount, sent, today }) => {
  const Mode = f.mode ? MODE_ICON[f.mode] : Route;
  const Why = f.purpose ? PURPOSE_ICON[f.purpose] : Sparkles;
  const day = f.date === today ? 'Today' : f.date === addDays(today, -1) ? 'Yesterday' : niceDay(f.date);
  const going = f.place.trim().length >= 2;
  return (
    <motion.div className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#3D52A0] to-[#334486] text-white px-5 py-4 shadow-[0_18px_34px_-20px_rgba(61,82,160,0.8)]">
      <span aria-hidden className="absolute -left-3 top-1/2 -mt-3 w-6 h-6 rounded-full bg-white" />
      <span aria-hidden className="absolute -right-3 top-1/2 -mt-3 w-6 h-6 rounded-full bg-white" />
      {sent && <Confetti pieces={26} spread={150} />}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
        <span className="shrink-0">{day}</span>
        <AnimatePresence mode="popLayout" initial={false}>
          {f.forKind && (
            <motion.span key={`${f.forKind}${f.forName}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="min-w-0 inline-flex items-center gap-1 normal-case tracking-normal text-[11px] text-white">
              {React.createElement(FOR_ICON[f.forKind], { className: 'w-3 h-3 shrink-0' })}<span className="truncate">{f.forKind === 'studio' ? 'Studio' : f.forName || FOR_LABELS[f.forKind]}</span>
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence mode="popLayout" initial={false}>
          {f.purpose && (
            <motion.span key={f.purpose} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15">
              <Why className="w-3 h-3" />{PURPOSE_LABELS[f.purpose]}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <span className="text-sm font-bold truncate max-w-[30%]">{f.from || 'Office'}</span>
        <span className="relative flex-1 h-8">
          <motion.span className="absolute left-0 right-0 top-1/2 border-t-2 border-dashed border-white/50" style={{ transformOrigin: '0 50%' }} initial={false} animate={{ scaleX: going ? 1 : 0.15, opacity: going ? 1 : 0.5 }} transition={{ duration: 0.6, ease: EASE }} />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={String(f.roundTrip)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute left-1/2 -translate-x-1/2 top-full -mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80 whitespace-nowrap">
              {f.roundTrip ? <ArrowLeftRight className="w-3 h-3" /> : <MoveRight className="w-3 h-3" />}{f.roundTrip ? 'Round trip' : 'One way'}
            </motion.span>
          </AnimatePresence>
          <motion.span key={f.mode || 'none'} className="absolute top-1/2 -mt-4 w-8 h-8 rounded-full bg-white text-[#3D52A0] grid place-items-center shadow"
            initial={{ left: '0%', scale: 0.4, rotate: -30 }} animate={going ? { left: ['0%', 'calc(100% - 32px)'], scale: 1, rotate: 0 } : { left: '0%', scale: 1, rotate: 0 }}
            transition={going ? { left: { duration: 2.2, repeat: Infinity, repeatType: f.roundTrip ? 'reverse' : 'loop', ease: 'easeInOut' }, scale: { type: 'spring', stiffness: 400, damping: 14 }, rotate: { duration: 0.4 } } : { type: 'spring', stiffness: 400, damping: 14 }}>
            <Mode className="w-4 h-4" />
          </motion.span>
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={going ? f.place : 'where'} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className={`text-sm font-bold truncate max-w-[34%] ${going ? '' : 'text-white/50'}`}>{going ? f.place : 'Where?'}</motion.span>
        </AnimatePresence>
      </div>
      <div className="flex items-end justify-between gap-3 mt-5">
        <span className="text-[11px] text-white/80">{f.mode ? MODE_LABELS[f.mode] : 'How you travelled'}{f.km && Number(f.km) > 0 && f.mode && byKm(f.mode) ? ` · ${f.km} km each way` : ''}</span>
        <span className="text-right">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">To claim</span>
          <motion.span key={amount} initial={{ scale: 0.7, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }} className="block text-2xl font-black tabular-nums">{money(amount)}</motion.span>
        </span>
      </div>
      <AnimatePresence>
        {sent && (
          <motion.span initial={{ opacity: 0, scale: 2, rotate: -30 }} animate={{ opacity: 1, scale: 1, rotate: -12 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 rounded-xl border-2 border-white text-white text-sm font-black uppercase tracking-[0.2em] bg-white/10 backdrop-blur-sm">Sent</motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/** What a trip was for, as a small chip: the project, lead or enquiry by name, or the studio. */
export const ForChip: React.FC<{ c: Claim }> = ({ c }) => {
  const f = forOf(c);
  const Icon = FOR_ICON[f.kind];
  const tint = !c.for ? 'bg-slate-100 text-slate-500' : f.kind === 'project' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : f.kind === 'lead' ? 'bg-amber-100 text-amber-700' : f.kind === 'enquiry' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
  return (
    <span title={`${FOR_LABELS[f.kind]}: ${f.name}`} className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold max-w-[180px] ${tint}`}>
      <Icon className="w-3 h-3 shrink-0" /><span className="truncate">{c.for ? (f.kind === 'studio' ? 'Studio' : f.name) : 'Not linked'}</span>
    </span>
  );
};

/** The studio's leads this person may see (founders all, Client Relations their own); null when they may see none. */
function useLeadPicks(): PickItem[] | null {
  const org: any = useOrg();
  const tenant = String(org?.orgData?.tenantId || '');
  const email = String(org?.currentUserAuth?.email || '');
  const [list, setList] = useState<PickItem[] | null>(null);
  useEffect(() => {
    if (!tenant || !email) return;
    let live = true;
    const shape = (all: any[]) => all.filter((l) => leadIsOpen(l) || (l.stage === 'won' && !l.projectId))
      .map((l) => ({ id: l.id, name: leadName(l), sub: [LEAD_STAGES.find((x) => x.id === l.stage)?.label, l.home?.area || l.home?.city].filter(Boolean).join(' · ') }));
    loadLeads(tenant, email, true)
      .catch(() => loadLeads(tenant, email, false))
      .then((all) => { if (live) setList(shape(all)); })
      .catch(() => { if (live) setList(null); });
    return () => { live = false; };
  }, [tenant, email]);
  return list;
}

/** A searchable list of projects or leads; picking one moves on. */
const PickList: React.FC<{ items: PickItem[] | null; chosen: string; find: string; onFind: (v: string) => void; empty: string; onPick: (item: PickItem) => void }> = ({ items, chosen, find, onFind, empty, onPick }) => {
  const q = find.trim().toLowerCase();
  const shown = (items || []).filter((x) => !q || `${x.name} ${x.sub}`.toLowerCase().includes(q)).slice(0, 40);
  if (!items || !items.length) return <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-slate-600 rounded-xl border border-dashed border-slate-300 px-4 py-3">{empty}</motion.p>;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
      <label className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input autoFocus aria-label="Find" className={`${input} pl-9`} placeholder="Type to find" value={find} onChange={(e) => onFind(e.target.value)} />
      </label>
      <motion.div variants={listV} initial="hidden" animate="show" role="radiogroup" className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
        {shown.map((x) => (
          <motion.button key={x.id} variants={rowV} type="button" role="radio" aria-checked={chosen === x.id} onClick={() => onPick(x)}
            className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${chosen === x.id ? 'bg-[#3D52A0] text-white' : 'hover:bg-slate-50'}`}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold truncate">{x.name}</span>
              {x.sub && <span className={`block text-[11px] truncate ${chosen === x.id ? 'text-white/80' : 'text-slate-500'}`}>{x.sub}</span>}
            </span>
            {chosen === x.id && <Check className="w-4 h-4 shrink-0" />}
          </motion.button>
        ))}
        {shown.length === 0 && <p className="px-3 py-3 text-xs text-slate-500">Nothing matches “{find}”.</p>}
      </motion.div>
    </motion.div>
  );
};

/** A tile to choose: it pops in, lifts when pointed at, and its icon turns when chosen. */
const Choice: React.FC<{ i: number; on: boolean; icon: React.ComponentType<any>; label: string; group: string; onPick: () => void }> = ({ i, on, icon: Icon, label, group, onPick }) => (
  <motion.button type="button" role="radio" aria-checked={on} onClick={onPick} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay: i * 0.04, type: 'spring', stiffness: 420, damping: 26 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }}
    className={`relative rounded-2xl border px-3 py-4 flex flex-col items-center gap-2 text-center transition-colors ${on ? 'border-[#3D52A0] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-[#3D52A0]/40 hover:shadow-sm'}`}>
    {on && <motion.span layoutId={`choice-${group}`} className="absolute inset-0 rounded-2xl bg-[#3D52A0] shadow-sm" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
    <motion.span key={String(on)} className="relative" initial={on ? { rotate: -25, scale: 0.6 } : false} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }}>
      <Icon className={`w-6 h-6 ${on ? 'text-white' : 'text-[#3D52A0]'}`} />
    </motion.span>
    <span className="relative text-xs font-bold leading-tight">{label}</span>
  </motion.button>
);

/* ── Founders: approving ─────────────────────────────────────────────────── */

/** Trips waiting for a founder, person by person: approve or turn down each, or approve all of someone's at once. */
export function ClaimApprovals({ s, view, onDone, bare = false }: { s: Snapshot; view: ClaimsView; onDone: (m: string) => void; bare?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [stamped, setStamped] = useState<Record<string, 'Approved' | 'Rejected'>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, Claim[]>();
    for (const c of view.toDecide) m.set(c.personId, [...(m.get(c.personId) || []), c]);
    return [...m.entries()].map(([personId, list]) => ({ personId, name: personName(s, personId), list, total: list.reduce((n, c) => n + c.amount, 0) }));
  }, [view.toDecide, s]);
  const decide = async (ids: string[], decision: 'approve' | 'reject', who: string) => {
    const key = ids.join(',');
    setBusy(key);
    setError(null);
    setStamped((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, decision === 'approve' ? 'Approved' : 'Rejected'])) }));
    const r = await runClaims('decide', { claimIds: ids, decision, note: decision === 'reject' ? note.trim() : '' });
    setBusy(null);
    if ('error' in r) { setError(r.error); setStamped((x) => { const y = { ...x }; ids.forEach((id) => delete y[id]); return y; }); return; }
    setRejecting(null);
    setNote('');
    onDone(decision === 'approve' ? `Approved ${ids.length === 1 ? 'the trip' : `${ids.length} trips`} for ${who}.` : `Not approved. ${who} will see why.`);
  };
  const body = (
    <>
      <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
      {groups.length === 0 ? <Empty icon={BadgeCheck} text="No trips waiting for you. All clear." /> : (
        <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {groups.map((g) => (
              <motion.div key={g.personId} variants={rowV} layout exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }} className="group rounded-2xl border border-slate-200 overflow-hidden pp-lift">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <Avatar name={g.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{g.name}</p>
                    <p className="text-[11px] text-slate-500">{g.list.length} trip{g.list.length === 1 ? '' : 's'} waiting · {money(g.total)}</p>
                  </div>
                  {g.list.length > 1 && (
                    <button type="button" className={btnPri} disabled={!!busy} onClick={() => decide(g.list.map((c) => c.id), 'approve', g.name)}><Check className="w-4 h-4" />Approve all {money(g.total)}</button>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  <AnimatePresence initial={false}>
                    {g.list.map((c) => (
                      <div key={c.id} className="relative">
                        <TripRow c={c} right={rejecting === c.id ? null : (
                          <span className="flex items-center gap-1.5">
                            <button type="button" className={btnSm} disabled={!!busy} onClick={() => decide([c.id], 'approve', g.name)}><Check className="w-3.5 h-3.5" />Approve</button>
                            <button type="button" className={btnSm} disabled={!!busy} onClick={() => { setRejecting(c.id); setNote(''); }}><X className="w-3.5 h-3.5" />No</button>
                            {canDelete(s.me, c) && <DeleteTrip c={c} onDone={onDone} />}
                          </span>
                        )} />
                        <AnimatePresence>
                          {rejecting === c.id && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-3 pb-3 flex flex-wrap items-center gap-2">
                              <input autoFocus aria-label="Why not" className={`${input} flex-1 min-w-[200px]`} maxLength={280} placeholder="Why not, in a few words. They will see it." value={note} onChange={(e) => setNote(e.target.value)} />
                              <button type="button" className={btnSm} disabled={!!busy || note.trim().length < 3} onClick={() => decide([c.id], 'reject', g.name)}><X className="w-3.5 h-3.5" />Don’t approve</button>
                              <button type="button" className={btnSm} onClick={() => setRejecting(null)}>Back</button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <AnimatePresence>
                          {stamped[c.id] && (
                            /* A stamp lands on the trip while the decision is saved. */
                            <motion.span aria-hidden initial={{ opacity: 0, scale: 1.8, rotate: -24 }} animate={{ opacity: 1, scale: 1, rotate: -12 }} exit={{ opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 360, damping: 16 }}
                              className={`pointer-events-none absolute right-24 top-1/2 -mt-4 px-3 py-1 rounded-lg border-2 text-xs font-black uppercase tracking-[0.14em] bg-white/90 ${stamped[c.id] === 'Approved' ? 'border-emerald-500 text-emerald-600' : 'border-rose-500 text-rose-600'}`}>
                              {stamped[c.id] === 'Approved' ? 'Approved' : 'Not approved'}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </>
  );
  if (bare) return body;
  if (!groups.length) return null;
  return <Panel icon={Route} title="Travel claims" blurb="Trips waiting for a founder, oldest first. Approve one, or all of someone’s at once.">{body}</Panel>;
}

/* ── Founders: paying back ───────────────────────────────────────────────── */

function PayBack({ s, view, onDone }: { s: Snapshot; view: ClaimsView; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, Claim[]>();
    for (const c of view.toPay) m.set(c.personId, [...(m.get(c.personId) || []), c]);
    return [...m.entries()].map(([personId, list]) => ({ personId, name: personName(s, personId), list, total: list.reduce((n, c) => n + c.amount, 0) })).sort((a, b) => b.total - a.total);
  }, [view.toPay, s]);
  const pay = async (g: { personId: string; name: string; list: Claim[]; total: number }) => {
    setBusy(g.personId);
    setError(null);
    setBurst(g.personId);
    const r = await runClaims('pay', { claimIds: g.list.map((c) => c.id) });
    setBusy(null);
    if ('error' in r) { setError(r.error); setBurst(null); return; }
    onDone(`${money(g.total)} marked as paid back to ${g.name}. They have been told.`);
  };
  if (!groups.length) return <Empty icon={Wallet} text="Nothing approved is waiting to be paid back." />;
  const total = groups.reduce((n, g) => n + g.total, 0);
  return (
    <>
      <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
      <p className="text-xs text-slate-500 mb-3">Approved and not yet paid: <b className="text-slate-800 tabular-nums">{money(total)}</b> to {groups.length} {groups.length === 1 ? 'person' : 'people'}. Mark it paid once the money has gone; each person is told.</p>
      <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {groups.map((g) => (
            <motion.div key={g.personId} variants={rowV} layout exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.25 } }} className="relative group rounded-2xl border border-slate-200 overflow-hidden pp-lift">
              {burst === g.personId && <Confetti pieces={20} spread={110} />}
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={g.name} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === g.personId ? null : g.personId)} aria-expanded={open === g.personId}>
                  <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">{g.name}<motion.span animate={{ rotate: open === g.personId ? 180 : 0 }} className="inline-flex"><ChevronDown className="w-4 h-4 text-slate-400" /></motion.span></p>
                  <p className="text-[11px] text-slate-500">{g.list.length} approved trip{g.list.length === 1 ? '' : 's'}, {g.list[0].date === g.list[g.list.length - 1].date ? niceDay(g.list[0].date) : `${niceDay(g.list[0].date)} to ${niceDay(g.list[g.list.length - 1].date)}`}</p>
                </button>
                <span className="text-lg font-black text-slate-800 tabular-nums"><CountUp value={g.total} format={money} /></span>
                <button type="button" className={btnPri} disabled={busy === g.personId} onClick={() => pay(g)}><Wallet className="w-4 h-4" />{busy === g.personId ? 'Saving…' : 'Mark paid'}</button>
              </div>
              <AnimatePresence initial={false}>
                {open === g.personId && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="border-t border-slate-100">
                    <motion.div variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100"><AnimatePresence initial={false}>{g.list.map((c) => <TripRow key={c.id} c={c} right={canDelete(s.me, c) ? <DeleteTrip c={c} onDone={onDone} /> : null} />)}</AnimatePresence></motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

/* ── Founders: the rates ─────────────────────────────────────────────────── */

function RatesEditor({ view, onDone }: { view: ClaimsView; onDone: (m: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [bike, setBike] = useState(String(view.rates.bike));
  const [car, setCar] = useState(String(view.rates.car));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await runClaims('rates', { bike: Number(bike), car: Number(car) });
    setBusy(false);
    if ('error' in r) { setError(r.error); return; }
    setEditing(false);
    onDone('Rates saved. New trips use them.');
  };
  return (
    <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-600">
      {editing ? (
        <>
          <label className="flex items-center gap-1">Bike ₹<input aria-label="Bike rate a km" type="number" min={0} className={`${input} w-20 py-1`} value={bike} onChange={(e) => setBike(e.target.value)} />/km</label>
          <label className="flex items-center gap-1">Car ₹<input aria-label="Car rate a km" type="number" min={0} className={`${input} w-20 py-1`} value={car} onChange={(e) => setCar(e.target.value)} />/km</label>
          <button type="button" className={btnSm} disabled={busy} onClick={save}><Check className="w-3.5 h-3.5" />Save</button>
          <button type="button" className={btnSm} onClick={() => setEditing(false)}>Cancel</button>
          {error && <span className="text-rose-700 w-full text-right">{error}</span>}
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1"><Bike className="w-3.5 h-3.5 text-[#3D52A0]" />{money(view.rates.bike)}/km</span>
          <span className="inline-flex items-center gap-1"><Car className="w-3.5 h-3.5 text-[#3D52A0]" />{money(view.rates.car)}/km</span>
          <button type="button" className={btnSm} onClick={() => { setBike(String(view.rates.bike)); setCar(String(view.rates.car)); setEditing(true); }}><Pencil className="w-3.5 h-3.5" />Rates</button>
        </>
      )}
    </div>
  );
}

