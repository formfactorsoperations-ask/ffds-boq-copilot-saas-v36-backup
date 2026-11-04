import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Route, Bike, Car, CarFront, CarTaxiFront, TrainFront, Footprints, HardHat, ShoppingBag, Handshake, Store, Sparkles, Plus, Check, X, Paperclip,
  Camera, Repeat, IndianRupee, Hourglass, BadgeCheck, Wallet, RefreshCw, Undo2, Pencil, ChevronDown,
} from '@/lib/lucide-shim';
import {
  CLAIM_PURPOSES, PURPOSE_LABELS, TRAVEL_MODES, MODE_LABELS, byKm, cleanClaim, recentTrips, totalsOf, inr,
  type Claim, type ClaimPurpose, type ClaimStatus, type ClaimsView, type TravelMode,
} from '../../lib/peopleClaims';
import { addDays, type Snapshot } from '../../lib/peopleDesk';
import { personName, todayOf } from '../../lib/peopleView';
import { runClaims, receiptOf, openReceipt } from '../../services/peopleClaimsService';
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
  const how = byKm(c.mode)
    ? `${c.km} km${c.roundTrip ? ' each way' : ''} by ${MODE_LABELS[c.mode].toLowerCase()}`
    : `${MODE_LABELS[c.mode]} fare`;
  const route = c.from || c.to ? ` · ${c.from || '…'} → ${c.to || c.place}` : '';
  return `${PURPOSE_LABELS[c.purpose]} · ${how}${c.extras ? ` + ${money(c.extras)} parking or tolls` : ''}${route}`;
}

/* ── The section ─────────────────────────────────────────────────────────── */

type Tab = 'mine' | 'decide' | 'pay';

export function TravelSection({ s, view, error, onRefresh, sites }: { s: Snapshot; view: ClaimsView | null; error: string | null; onRefresh: () => void; sites: string[] }) {
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
        {tab === 'mine' && <MyTrips view={view} onRepeat={(c) => setLogging(c)} onNotice={setNotice} />}
        {tab === 'decide' && view.founder && <ClaimApprovals s={s} view={view} onDone={setNotice} bare />}
        {tab === 'pay' && view.founder && <PayBack s={s} view={view} onDone={setNotice} />}
      </Panel>
      {logging && <LogTripSheet s={s} view={view} sites={sites} from={logging} onClose={() => setLogging(null)} onSaved={logged} />}
    </>
  );
}

/* ── Your trips ──────────────────────────────────────────────────────────── */

function MyTrips({ view, onRepeat, onNotice }: { view: ClaimsView; onRepeat: (c: Claim) => void; onNotice: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const withdraw = async (c: Claim) => {
    setBusy(c.id);
    setError(null);
    const r = await runClaims('withdraw', { claimId: c.id });
    setBusy(null);
    if ('error' in r) setError(r.error); else onNotice('Trip taken back.');
  };
  if (!view.mine.length) return <Empty icon={Route} text="No trips logged yet. Went to a site or a shop for work? Log it and get it paid back." />;
  return (
    <>
      <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
      {months.map((m) => {
        const t = totalsOf(m.list);
        return (
          <div key={m.month} className="mb-5 last:mb-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">{monthLabel(m.month)} · {t.trips} trip{t.trips === 1 ? '' : 's'} · {money(t.claimed)}</p>
            <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              <AnimatePresence initial={false}>
                {m.list.map((c) => (
                  <TripRow key={c.id} c={c} right={<>
                    {c.status === 'Pending' && <button type="button" className={btnSm} disabled={busy === c.id} onClick={() => withdraw(c)}><Undo2 className="w-3.5 h-3.5" />Take back</button>}
                    {c.status !== 'Pending' && <button type="button" className={`${btnSm} opacity-0 group-hover:opacity-100 focus:opacity-100`} onClick={() => onRepeat(c)}><Repeat className="w-3.5 h-3.5" />Again</button>}
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
        <p className="text-sm font-semibold text-slate-800 truncate">{who && <span>{who} · </span>}{c.place}</p>
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

interface Form { date: string; purpose: ClaimPurpose; place: string; from: string; to: string; mode: TravelMode; km: string; roundTrip: boolean; fare: string; extras: string; note: string }

function LogTripSheet({ s, view, sites, from, onClose, onSaved }: { s: Snapshot; view: ClaimsView; sites: string[]; from: Partial<Claim>; onClose: () => void; onSaved: (amount: number) => void }) {
  const today = todayOf(s);
  const start = (c: Partial<Claim>): Form => ({
    date: today, purpose: c.purpose || 'Site visit', place: c.place || '', from: c.from ?? 'Office', to: c.to || '', mode: c.mode || 'bike',
    km: c.km ? String(c.km) : '', roundTrip: c.roundTrip ?? true, fare: c.fare ? String(c.fare) : '', extras: c.extras ? String(c.extras) : '', note: '',
  });
  const [f, setF] = useState<Form>(() => start(from));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const [receipt, setReceipt] = useState<{ type: string; data: string; preview: string; name: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recent = useMemo(() => recentTrips(view.mine), [view.mine]);
  const places = useMemo(() => [...new Set([...sites, ...view.mine.map((c) => c.place)])].slice(0, 60), [sites, view.mine]);

  const check = useMemo(() => {
    try { return { ok: cleanClaim({ ...f, km: Number(f.km), fare: Number(f.fare), extras: f.extras ? Number(f.extras) : 0 }, view.rates, today) }; } catch (e: any) { return { err: String(e?.message || e) } as const; }
  }, [f, view.rates, today]);
  const ok = 'ok' in check ? check.ok : null;
  const rate = f.mode === 'bike' ? view.rates.bike : f.mode === 'car' ? view.rates.car : 0;
  const km = Number(f.km) || 0;
  const sum = byKm(f.mode) ? `${km || 0} km${f.roundTrip ? ' × 2' : ''} × ${money(rate)}` : 'Fare';

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError(null);
    try { const r = await receiptOf(file); setReceipt({ ...r, name: file.name }); } catch (e: any) { setError(String(e?.message || e)); }
    setReading(false);
  };
  const save = async () => {
    setTried(true);
    if (!ok) return;
    setSaving(true);
    setError(null);
    const r = await runClaims('log', { ...f, km: Number(f.km) || 0, fare: Number(f.fare) || 0, extras: Number(f.extras) || 0, receipt: receipt ? { type: receipt.type, data: receipt.data } : null });
    setSaving(false);
    if ('error' in r) { setError(r.error); return; }
    onSaved(ok.amount);
  };

  return (
    <Sheet eyebrow="Travel" title="Log a trip" sub={`Own bike ${money(view.rates.bike)} a km, own car ${money(view.rates.car)} a km; anything else at the fare you paid. A founder approves it.`} onClose={onClose}
      footer={<>
        <span className="mr-auto flex items-baseline gap-2" aria-live="polite">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">To claim</span>
          <motion.span key={ok?.amount || 0} initial={{ scale: 0.8, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }} className="text-lg font-black text-slate-800 tabular-nums">{money(ok?.amount || 0)}</motion.span>
        </span>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} disabled={saving || reading} onClick={save}><Check className="w-4 h-4" />{saving ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      {recent.length > 0 && !from.place && (
        <div>
          <Label>Same as before</Label>
          <div className="flex flex-wrap gap-2">
            {recent.map((c) => {
              const Icon = MODE_ICON[c.mode];
              return (
                <motion.button key={c.id} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => setF((x) => ({ ...start(c), date: x.date }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-[#3D52A0]/40 hover:text-[#3D52A0]">
                  <Repeat className="w-3.5 h-3.5" /><Icon className="w-3.5 h-3.5" />{c.place}{byKm(c.mode) ? ` · ${c.km} km` : ''}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <Label>When</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Glide id="trip-day" label="Day" value={f.date === today ? 'today' : f.date === addDays(today, -1) ? 'yesterday' : 'other'}
            onChange={(v) => { if (v === 'today') set('date', today); else if (v === 'yesterday') set('date', addDays(today, -1)); else set('date', addDays(today, -2)); }}
            options={[{ id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'other', label: 'Earlier' }]} />
          <AnimatePresence initial={false}>
            {f.date !== today && f.date !== addDays(today, -1) && (
              <motion.input key="d" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 170 }} exit={{ opacity: 0, width: 0 }} type="date" aria-label="Day of the trip" className={input}
                value={f.date} max={today} min={addDays(today, -90)} onChange={(e) => set('date', e.target.value)} />
            )}
          </AnimatePresence>
        </div>
      </div>

      <div>
        <Label>What for</Label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {CLAIM_PURPOSES.map((p) => <Choice key={p} id={`purpose-${p}`} on={f.purpose === p} icon={PURPOSE_ICON[p]} label={PURPOSE_LABELS[p]} group="purpose" onPick={() => set('purpose', p)} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <Label htmlFor="trip-place">Where</Label>
          <input id="trip-place" list="trip-places" className={input} value={f.place} maxLength={80} placeholder={f.purpose === 'Selections' ? 'Shop name' : 'Site or client'} onChange={(e) => set('place', e.target.value)} />
          <datalist id="trip-places">{places.map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <div><Label htmlFor="trip-from">From</Label><input id="trip-from" className={input} value={f.from} maxLength={80} placeholder="Office" onChange={(e) => set('from', e.target.value)} /></div>
        <div><Label htmlFor="trip-to">To</Label><input id="trip-to" className={input} value={f.to} maxLength={80} placeholder={f.place || 'Area'} onChange={(e) => set('to', e.target.value)} /></div>
      </div>

      <div>
        <Label>How you travelled</Label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {TRAVEL_MODES.map((m) => <Choice key={m} id={`mode-${m}`} on={f.mode === m} icon={MODE_ICON[m]} label={MODE_LABELS[m]} group="mode" onPick={() => set('mode', m)} />)}
        </div>
      </div>

      <motion.div layout className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-3 items-end">
        <AnimatePresence mode="popLayout" initial={false}>
          {byKm(f.mode) ? (
            <motion.div key="km" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <Label htmlFor="trip-km">Distance one way (km)</Label>
              <input id="trip-km" type="number" inputMode="decimal" min={0} step="0.1" className={input} value={f.km} placeholder="12" onChange={(e) => set('km', e.target.value)} />
            </motion.div>
          ) : (
            <motion.div key="fare" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <Label htmlFor="trip-fare">Fare paid (₹)</Label>
              <input id="trip-fare" type="number" inputMode="decimal" min={0} className={input} value={f.fare} placeholder="350" onChange={(e) => set('fare', e.target.value)} />
            </motion.div>
          )}
        </AnimatePresence>
        {byKm(f.mode) ? (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer select-none pb-2">
            <input type="checkbox" className="w-4 h-4 accent-[#3D52A0]" checked={f.roundTrip} onChange={(e) => set('roundTrip', e.target.checked)} />
            Return trip too
          </label>
        ) : <span className="hidden sm:block" />}
        <div>
          <Label htmlFor="trip-extras">Parking or tolls (₹)</Label>
          <input id="trip-extras" type="number" inputMode="decimal" min={0} className={input} value={f.extras} placeholder="0" onChange={(e) => set('extras', e.target.value)} />
        </div>
        <p className="sm:col-span-3 text-xs text-slate-500 flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5 text-[#3D52A0]" />
          {sum}{Number(f.extras) > 0 ? ` + ${money(Number(f.extras))}` : ''} = <b className="text-slate-800 tabular-nums">{money(ok?.amount || 0)}</b>
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-start">
        <div>
          <Label>Receipt</Label>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <AnimatePresence mode="wait" initial={false}>
            {receipt ? (
              <motion.div key="r" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center gap-2">
                {receipt.preview ? <img src={receipt.preview} alt="Receipt" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                  : <span className="w-14 h-14 rounded-lg border border-slate-200 bg-white grid place-items-center text-[10px] font-bold text-slate-500">PDF</span>}
                <button type="button" className={btnSm} onClick={() => setReceipt(null)}><X className="w-3.5 h-3.5" />Remove</button>
              </motion.div>
            ) : (
              <motion.button key="add" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={btnSec} disabled={reading} onClick={() => fileRef.current?.click()}>
                <Camera className="w-4 h-4" />{reading ? 'Reading…' : 'Add a photo'}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div>
          <Label htmlFor="trip-note">Note (optional)</Label>
          <input id="trip-note" className={input} value={f.note} maxLength={280} placeholder="Tile selection with the client" onChange={(e) => set('note', e.target.value)} />
        </div>
      </div>
      {tried && 'err' in check && <Notice text={check.err} tone="bad" />}
      {error && <Notice text={error} tone="bad" />}
    </Sheet>
  );
}

/** A tile to choose, with its icon that turns when chosen. */
const Choice: React.FC<{ id: string; on: boolean; icon: React.ComponentType<any>; label: string; group: string; onPick: () => void }> = ({ id, on, icon: Icon, label, group, onPick }) => {
  return (
    <motion.button type="button" role="radio" aria-checked={on} onClick={onPick} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
      className={`relative rounded-xl border px-2 py-2.5 flex flex-col items-center gap-1.5 text-center transition-colors ${on ? 'border-[#3D52A0] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-[#3D52A0]/40'}`}>
      {on && <motion.span layoutId={`choice-${group}`} className="absolute inset-0 rounded-xl bg-[#3D52A0] shadow-sm" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <motion.span key={String(on)} className="relative" initial={on ? { rotate: -25, scale: 0.6 } : false} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }}>
        <Icon className={`w-5 h-5 ${on ? 'text-white' : 'text-[#3D52A0]'}`} />
      </motion.span>
      <span className="relative text-[11px] font-bold leading-tight" id={id}>{label}</span>
    </motion.button>
  );
};

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
                          <span className="flex gap-1.5">
                            <button type="button" className={btnSm} disabled={!!busy} onClick={() => decide([c.id], 'approve', g.name)}><Check className="w-3.5 h-3.5" />Approve</button>
                            <button type="button" className={btnSm} disabled={!!busy} onClick={() => { setRejecting(c.id); setNote(''); }}><X className="w-3.5 h-3.5" />No</button>
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
                    <motion.div variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100">{g.list.map((c) => <TripRow key={c.id} c={c} />)}</motion.div>
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

