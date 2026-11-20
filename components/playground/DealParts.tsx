import React, { useState } from 'react';
import { Target, Percent, Gift, Map as MapIcon, List, X, Plus, Clock, Lock, ArrowRight } from 'lucide-react';
import { Button, Chip } from '../ui/kit';
import {
  SCOPE_PARTS, offerDiscount, offerWhy, dealFor, complimentaryKeys,
  type OfferDiscount, type ScopeSplit, type SplitLine, type ScopePart,
} from '../../lib/offers';
import type { GstTerms, OneSchedule, ScheduleStage } from '../../lib/paymentSchedule';
import { withComplimentary, withSpecial, type Validity } from '../../lib/playground/deal';
import { inr } from './playgroundUi';

/*
  The Deal lens (BOQ Playground PR P, as in the approved mockup).

  The deal on the option   the work from the BOQ, each offer as a saving with
                           its reason, the design fee, GST and what the client
                           pays; the margin before and after, for the studio only
  Give an offer            off a part of the job, off one room, complimentary
                           lines, or a special price typed all in; how long the
                           proposal holds
  Payment schedule         Money's saved schedule for the project, else the
                           studio's: design fee and the work as two schedules,
                           with GST, and the booking amount

  Offers are the project's discounts: Money, the proposal and the agreement
  read this list, and what the client pays is `dealFor` on it.
*/

export interface DealFee {
  /** 'percentage' (of the work before offers), 'fixed_lumpsum' or 'fixed_sqft'. */
  type: string;
  value: number;
}

const dateOf = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const digits = (s: string) => Number(String(s).replace(/[^0-9.]/g, '')) || 0;
const SMALL_INPUT = 'px-1.5 py-1 rounded-md border border-slate-300 text-right text-sm font-bold tabular-nums bg-white disabled:bg-slate-50';
const PICK_INPUT = 'px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white';

/** What a discount comes off, as Money applies it. */
const amountOf = (d: OfferDiscount, sell: number, fee: number) =>
  (d.type === 'percentage' ? (d.target === 'design' ? fee : sell) * (d.value / 100) : d.value);

export function DealLens({
  tierId, optionName, summary, lineCount, rounded, split, discounts, terms, schedule, validity, fee, floor, seesMargins, locked, lockedWhy,
  rooms, pickLines, newId, onDiscounts, onFee, onDays, onInitiation, onNote,
}: {
  tierId: string;
  optionName: string;
  summary: { totalSell?: number; designFee?: number; totalCost?: number };
  /** Billable lines in the work. */
  lineCount: number;
  /** Each amount is rounded up to ₹100 (a Playground version). */
  rounded: boolean;
  split: ScopeSplit;
  discounts: OfferDiscount[];
  terms: GstTerms;
  schedule: OneSchedule;
  validity: Validity;
  fee: DealFee;
  floor: number;
  seesMargins: boolean;
  /** Signed, superseded or frozen: the deal is shown, not changed. */
  locked: boolean;
  /** Why it cannot be changed, and where it can be. */
  lockedWhy?: { text: string; action?: { label: string; onClick: () => void } } | null;
  /** The rooms with work in them, in the plan's order. */
  rooms: string[];
  /** The billable lines, in the BOQ's order, to give at no charge. */
  pickLines: SplitLine[];
  newId: () => string;
  onDiscounts: (next: OfferDiscount[], msg?: string) => void;
  onFee: (value: number) => void;
  onDays: (days: number) => void;
  onInitiation: (value: number) => void;
  onNote: (msg: string) => void;
}) {
  const deal = dealFor(summary, discounts, terms);
  const sell = deal.sell;
  const after = Math.max(0, sell - deal.execOff);
  const special = { summary, terms };
  const free = complimentaryKeys(discounts.filter(d => d.basis?.tierId === tierId));
  const [part, setPart] = useState<ScopePart>('carpentry');
  const [pct, setPct] = useState('5');
  const [room, setRoom] = useState(rooms[0] || '');
  const [roomPct, setRoomPct] = useState('10');
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState('');
  const roomNow = rooms.includes(room) ? room : rooms[0] || '';

  const m = deal.margin;
  const under = m.after !== null && m.after < floor;
  const added = 'Offer added. The proposal and Money read it from here.';
  const addPart = () => {
    const p = digits(pct);
    if (!(p > 0)) return;
    onDiscounts([...discounts, offerDiscount(newId(), { kind: 'part-percent', part, percent: p, tierId }, split)], added);
  };
  const addRoom = () => {
    const p = digits(roomPct);
    if (!(p > 0) || !roomNow) return;
    onDiscounts([...discounts, offerDiscount(newId(), { kind: 'room-percent', room: roomNow, percent: p, tierId }, split)], added);
  };
  const setSpecial = () => {
    const t = digits(target);
    const next = withSpecial(discounts, tierId, t, split, special, newId);
    if (!next) { onNote(`Type what the client should pay, below ${inr(deal.clientPays)}.`); return; }
    setTarget('');
    onDiscounts(next, added);
  };
  const pick = (l: SplitLine, on: boolean) =>
    onDiscounts(withComplimentary(discounts, tierId, l, on, split, partOfSplitLine(split, l.key), newId),
      on ? `${l.name} is complimentary` : `${l.name} is charged again`);

  const row = (label: React.ReactNode, value: string, tone = 'text-slate-800') => (
    <div className="flex items-baseline justify-between gap-3 py-2"><span className="text-sm text-slate-600">{label}</span><b className={`tabular-nums ${tone}`}>{value}</b></div>
  );
  const feeLabel = fee.type === 'fixed_lumpsum' ? 'a fixed sum' : fee.type === 'fixed_sqft' ? '₹ per sq ft of carpet' : '% of the work before offers';

  return (
    <div className="p-4 grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] hud-swap" role="region" aria-label="Deal">
      {locked && lockedWhy && (
        <div className="xl:col-span-2 rounded-2xl bg-white border border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap" role="note" aria-label="Why the deal is read-only">
          <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 grid place-items-center shrink-0"><Lock className="w-4 h-4" aria-hidden /></span>
          <p className="flex-1 min-w-[240px] text-xs text-slate-600">{lockedWhy.text}</p>
          {lockedWhy.action && <Button size="sm" variant="primary" icon={ArrowRight} onClick={lockedWhy.action.onClick}>{lockedWhy.action.label}</Button>}
        </div>
      )}
      <section className="rounded-2xl bg-white border border-slate-200 p-5">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Target className="w-4 h-4" aria-hidden /></span>
          <div>
            <h2 className="font-bold text-slate-800 leading-tight">The deal on {optionName}</h2>
            <p className="text-[11px] text-slate-500">Saved as the project’s offers, so Money, the proposal and the agreement read the same figures</p>
          </div>
        </div>
        {validity.expired && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2 text-xs text-amber-900" role="status">
            <Clock className="w-4 h-4 shrink-0 mt-px" aria-hidden />
            <span><b>Expired on {dateOf(validity.until)}.</b> Issued {dateOf(validity.from)}, valid for {validity.days} days; the offers lapsed with it. Issuing it again makes a new version with a new date.</span>
          </div>
        )}
        <div className="mt-3 divide-y divide-slate-100">
          {row(<>Work, from the BOQ <span className="text-[11px] text-slate-400">· {lineCount} line{lineCount === 1 ? '' : 's'}{rounded ? ', each rounded up to ₹100' : ''}</span></>, inr(sell))}
          {discounts.map(d => (
            <div key={d.id} className="py-2 flex items-start gap-2 hud-row-in" data-offer={d.id}>
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center shrink-0">
                {d.basis?.kind === 'complimentary' ? <Gift className="w-3.5 h-3.5" aria-hidden /> : d.basis?.kind === 'special' ? <Target className="w-3.5 h-3.5" aria-hidden /> : <Percent className="w-3.5 h-3.5" aria-hidden />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-800">{d.name}</span>
                <span className="block text-[11px] text-slate-500">{d.basis ? offerWhy(d.basis, split) : d.target === 'design' ? 'Off the design fee, written in Money & Offers' : 'Off the work, written in Money & Offers'}</span>
              </span>
              <b className="tabular-nums text-emerald-700">−{inr(amountOf(d, sell, deal.fee))}</b>
              {!locked && (
                <button type="button" onClick={() => onDiscounts(discounts.filter(x => x.id !== d.id), 'Offer taken back.')} aria-label={`Remove ${d.name}`}
                  className="p-1 rounded-md text-slate-400 hover:bg-slate-100"><X className="w-3.5 h-3.5" aria-hidden /></button>
              )}
            </div>
          ))}
          {row('Work after offers', inr(after))}
          <div className="flex items-center justify-between gap-3 py-2">
            <label htmlFor="deal-fee" className="text-sm text-slate-600">Design fee <span className="text-[11px] text-slate-400">· {feeLabel}</span></label>
            <span className="flex items-center gap-2">
              <input id="deal-fee" key={`${fee.type}:${fee.value}`} defaultValue={fee.value} disabled={locked} inputMode="decimal"
                onBlur={e => { const v = digits(e.target.value); if (v !== fee.value) onFee(v); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className={`${fee.type === 'percentage' ? 'w-14' : 'w-24'} ${SMALL_INPUT}`} />
              {fee.type === 'percentage' && <span className="text-xs text-slate-500">%</span>}
              <b className="tabular-nums w-24 text-right">{inr(deal.fee)}</b>
            </span>
          </div>
          {row(<>GST {terms.rate}% <span className="text-[11px] text-slate-400">· on the work and the fee, as Money bills it</span></>, inr(deal.gst))}
          <div className="flex items-baseline justify-between gap-3 pt-3">
            <span className="text-base font-bold text-slate-800">Client pays</span>
            <b className="text-2xl font-black tabular-nums" data-deal-pays>{inr(deal.clientPays)}</b>
          </div>
        </div>
        {seesMargins && m.before !== null && (
          <div className={`mt-4 rounded-xl p-3 ${under ? 'bg-rose-50 border border-rose-200' : 'bg-slate-50 border border-slate-200'}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Margin on the work <span className="text-slate-400">· studio only</span></span>
              <span className="tabular-nums font-bold"><span className="text-slate-500">{m.before.toFixed(1)}%</span> → <span className={under ? 'text-rose-700' : 'text-emerald-700'}>{(m.after ?? 0).toFixed(1)}%</span></span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-200 relative overflow-hidden" aria-hidden>
              <div className={`absolute inset-y-0 left-0 ${under ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(0, ((m.after ?? 0) / 40) * 100))}%` }} />
              <div className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: `${Math.min(100, (floor / 40) * 100)}%` }} />
            </div>
            <p className={`text-[11px] mt-1.5 ${under ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
              {under ? `Under your ${floor}% floor. Take an offer back, or raise rates in Tune before you present.` : `Your floor is ${floor}%. Offers come off the work the client sees; markups in Tune never show.`}
            </p>
          </div>
        )}
      </section>

      <div className="space-y-4">
        <section className={`rounded-2xl bg-white border border-slate-200 p-5 ${locked ? 'opacity-60 pointer-events-none' : ''}`} aria-label="Give an offer">
          <h3 className="font-bold text-slate-800">Give an offer</h3>
          <p className="text-[11px] text-slate-500">Each is shown to the client as a saving, with its reason. It follows the BOQ: change a line and the offer re-prices.</p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><Percent className="w-3.5 h-3.5 text-[#3D52A0]" aria-hidden />Off a part of the job</div>
              <div className="mt-2 mb-2 flex gap-1.5">
                <label className="sr-only" htmlFor="deal-part">Part</label>
                <select id="deal-part" value={part} onChange={e => setPart(e.target.value as ScopePart)} className={`flex-1 min-w-0 ${PICK_INPUT}`}>
                  {SCOPE_PARTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <label className="sr-only" htmlFor="deal-pct">Percent off the part</label>
                <input id="deal-pct" value={pct} onChange={e => setPct(e.target.value)} inputMode="decimal" className="w-12 px-1.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-right tabular-nums" />
                <span className="self-center text-xs text-slate-500">%</span>
              </div>
              <Button size="sm" icon={Plus} onClick={addPart} aria-label="Add the offer off a part">Add</Button>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><MapIcon className="w-3.5 h-3.5 text-[#3D52A0]" aria-hidden />Off one room</div>
              <div className="mt-2 mb-2 flex gap-1.5">
                <label className="sr-only" htmlFor="deal-room">Room</label>
                <select id="deal-room" value={roomNow} onChange={e => setRoom(e.target.value)} className={`flex-1 min-w-0 ${PICK_INPUT}`}>
                  {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <label className="sr-only" htmlFor="deal-rpct">Percent off the room</label>
                <input id="deal-rpct" value={roomPct} onChange={e => setRoomPct(e.target.value)} inputMode="decimal" className="w-12 px-1.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-right tabular-nums" />
                <span className="self-center text-xs text-slate-500">%</span>
              </div>
              <Button size="sm" icon={Plus} onClick={addRoom} disabled={!roomNow} aria-label="Add the offer off a room">Add</Button>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><Gift className="w-3.5 h-3.5 text-[#3D52A0]" aria-hidden />Complimentary items</div>
              <p className="text-[11px] text-slate-500 mt-1 mb-2">Pick lines to give at no charge. They stay in the BOQ, marked complimentary.</p>
              <Button size="sm" icon={List} onClick={() => setPicking(v => !v)} aria-expanded={picking}>{picking ? 'Close the list' : 'Pick lines'}</Button>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-[#3D52A0]" aria-hidden />Special price</div>
              <p className="text-[11px] text-slate-500 mt-1">Type what the client should pay, all in. The difference becomes one offer.</p>
              <div className="mt-1.5 flex gap-1.5">
                <label className="sr-only" htmlFor="deal-target">Client pays</label>
                <input id="deal-target" value={target} onChange={e => setTarget(e.target.value)} inputMode="numeric"
                  onKeyDown={e => { if (e.key === 'Enter') setSpecial(); }}
                  placeholder={(Math.floor(deal.clientPays / 50000) * 50000).toLocaleString('en-IN')}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-bold tabular-nums" />
                <Button size="sm" onClick={setSpecial} aria-label="Set the special price">Set</Button>
              </div>
            </div>
          </div>
          {picking && (
            <div className="mt-3 rounded-xl border border-[#3D52A0]/25 max-h-64 overflow-auto divide-y divide-slate-100 hud-panel-in" role="group" aria-label="Lines to give at no charge">
              {pickLines.map(l => (
                <label key={l.key} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={free.has(l.key)} onChange={e => pick(l, e.target.checked)} aria-label={`${l.name} in ${l.room}, complimentary`} className="w-3.5 h-3.5 accent-[#3D52A0]" />
                  <span className="flex-1 min-w-0 truncate"><b className="font-semibold text-slate-700">{l.name}</b> <span className="text-slate-400">· {l.room}</span></span>
                  <span className="tabular-nums font-bold">{inr(l.total)}</span>
                </label>
              ))}
              {pickLines.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No priced lines on this option yet.</p>}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs flex-wrap">
            {validity.issued ? (
              <span className="text-slate-600">Issued {dateOf(validity.from)} · valid for <b className="text-slate-800">{validity.days} days</b>, until <b className="text-slate-800">{dateOf(validity.until)}</b></span>
            ) : (
              <>
                <label htmlFor="deal-days" className="text-slate-600">Proposal valid for</label>
                <input id="deal-days" key={validity.days} defaultValue={validity.days} inputMode="numeric"
                  onBlur={e => { const v = Math.round(digits(e.target.value)); if (v && v !== validity.days) onDays(v); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-12 px-1.5 py-1 rounded-lg border border-slate-300 font-bold text-right tabular-nums" />
                <span className="text-slate-600">days, until <b className="text-slate-800">{dateOf(validity.until)}</b></span>
              </>
            )}
            <span className="text-[11px] text-slate-400">Studio default {validity.studioDays}, from Terms & Payment. The offers lapse with it.</span>
          </div>
        </section>
        <PaymentPanel schedule={schedule} fee={deal.fee - deal.designOff} after={after} clientPays={deal.clientPays} locked={locked} onInitiation={onInitiation} />
      </div>
    </div>
  );
}

/** The part a line of the split is in. */
function partOfSplitLine(split: ScopeSplit, key: string): ScopePart {
  return SCOPE_PARTS.find(p => split.parts[p.id].lines.some(l => l.key === key))?.id || 'others';
}

const WHERE: Record<OneSchedule['source'], string> = {
  money: 'From Money → Payment schedule, saved for this project',
  studio: 'From Studio settings → Terms & Payment, as no schedule is saved for this project in Money',
  defaults: 'The standard stages, as no schedule is saved in Money or in Terms & Payment',
};

function StageRows({ stages, tone }: { stages: ScheduleStage[]; tone: string }) {
  return (
    <div className="divide-y divide-slate-100">
      {stages.map(x => (
        <div key={x.id} className="py-1.5 flex items-start gap-2 text-xs">
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums shrink-0 ${tone}`}>{x.code}</span>
          <span className="flex-1 min-w-0">
            <b className="text-slate-800">{x.name}</b>{!x.fixed && <span className="text-slate-400"> · {x.pct}%</span>}
            {x.trigger && <span className="block text-[10px] text-slate-500 leading-snug">{x.trigger}</span>}
          </span>
          <b className="tabular-nums whitespace-nowrap">{inr(x.amount)}</b>
        </div>
      ))}
    </div>
  );
}

export function PaymentPanel({ schedule: s, fee, after, clientPays, locked, onInitiation }: {
  schedule: OneSchedule;
  /** The design fee after any offer on it, ex-GST. */
  fee: number;
  /** The work after offers, ex-GST. */
  after: number;
  clientPays: number;
  locked: boolean;
  onInitiation: (value: number) => void;
}) {
  const box = (title: string, figures: React.ReactNode, stages: ScheduleStage[], tone: string) => (
    <div className="mt-2 rounded-xl border border-slate-200 px-3 py-1">
      <div className="py-1.5 flex justify-between gap-2 text-[11px] border-b border-slate-100">
        <span className="font-bold text-slate-700">{title}</span>
        <span className="text-slate-500 tabular-nums text-right">{figures}</span>
      </div>
      <StageRows stages={stages} tone={tone} />
    </div>
  );
  const ret = Math.min(s.initiationFee, s.design.stages[0]?.amount || 0);
  const same = Math.abs(s.total - Math.round(clientPays)) <= 1;
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-5" aria-label="Payment schedule">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-800">Payment schedule</h3>
          <p className="text-[11px] text-slate-500">{WHERE[s.source]}. The proposal, the agreement and Money read this one schedule.</p>
        </div>
        <Chip tone={s.source === 'money' ? 'brand' : 'slate'}>{s.source === 'money' ? 'This project, in Money' : 'Studio standard'}</Chip>
      </div>
      {box('Design fee', <>{inr(fee)} + GST = <b className="text-slate-800">{inr(s.design.total)}</b></>, s.design.stages, 'bg-[#3D52A0]/10 text-[#3D52A0]')}
      {s.execution.stages.length > 0 && box('The work, after offers', <>{inr(after)} + GST = <b className="text-slate-800">{inr(s.execution.total)}</b></>, s.execution.stages, 'bg-slate-100 text-slate-600')}
      <div className="mt-3 flex items-center gap-2 text-xs flex-wrap">
        <label htmlFor="deal-ret" className="text-slate-600">Initiation fee paid</label>
        <input id="deal-ret" key={s.initiationFee} defaultValue={s.initiationFee.toLocaleString('en-IN')} disabled={locked} inputMode="numeric"
          onBlur={e => { const v = Math.max(0, Math.round(digits(e.target.value))); if (v !== s.initiationFee) onInitiation(v); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-24 px-2 py-1 rounded-lg border border-slate-300 font-bold text-right tabular-nums disabled:bg-slate-50" />
        <span className="text-[11px] text-slate-400">the Project Initiation Fee, adjusted against D1</span>
      </div>
      <div className="mt-2 rounded-xl bg-[#3D52A0]/[0.05] border border-[#3D52A0]/15 px-3 py-2 flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-700"><b>Booking amount</b> · D1 with GST{ret ? `, less the ${inr(ret)} initiation fee` : ''}</span>
        <b className="tabular-nums text-base" data-deal-booking>{inr(s.booking)}</b>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        Both schedules: <b className="text-slate-700 tabular-nums">{inr(s.total)}</b>{same ? ', the same as Client pays' : `; Client pays ${inr(clientPays)}`}
      </div>
    </section>
  );
}
