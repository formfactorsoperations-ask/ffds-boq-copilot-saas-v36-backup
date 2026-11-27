import React from 'react';
import { Target, ArrowRight, Lock, Gift, Percent } from 'lucide-react';
import { Button, Chip, LABEL } from '../ui/kit';
import { CountUp } from '../ui/HudBits';
import { SCOPE_PARTS, dealFor, type OfferDiscount, type ScopeSplit } from '../../lib/offers';
import type { GstTerms } from '../../lib/paymentSchedule';
import { offerAmount } from './DealParts';
import { inr } from './playgroundUi';

/*
  The deal dock (the owner chose option B of the "Deal side by side" mockup,
  27 Nov 2026).

  A slim rail beside the BOQ Editor's lenses with the figures of the Deal lens:
  what the client pays, the margin against the floor, the work, the offers, the
  design fee and GST, and the work part by part. It reads the same option the
  lens is editing, so a changed quantity or rate re-prices it at once. It shows
  the deal; offers are given in the Deal lens, which "Give an offer" opens.

  `compact` is the one-line strip shown above a line's or a room's inspector,
  and on a narrow screen, where a full rail would crowd the work.
*/

export interface DealDockProps {
  optionName: string;
  summary: { totalSell?: number; designFee?: number; totalCost?: number };
  discounts: OfferDiscount[];
  terms: GstTerms;
  split: ScopeSplit;
  floor: number;
  /** Margins are for the studio's eyes only (useSeesMargins). */
  seesMargins: boolean;
  /** Signed, sent, superseded or frozen, or no finance role: the deal is shown, not changed. */
  locked: boolean;
  compact?: boolean;
  onOpenDeal: () => void;
}

export function DealDock({ optionName, summary, discounts, terms, split, floor, seesMargins, locked, compact, onOpenDeal }: DealDockProps) {
  const deal = dealFor(summary, discounts, terms);
  const m = deal.margin;
  const showMargin = seesMargins && m.before !== null;
  const after = m.after ?? 0;
  const under = showMargin && after < floor;
  const tone = under ? 'text-rose-700' : 'text-emerald-700';

  if (compact) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-3 py-2.5 flex items-center gap-3 hud-panel-in" role="region" aria-label="The deal, live">
        <span className="w-8 h-8 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Target className="w-4 h-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className={LABEL}>Client pays</div>
          <CountUp value={Math.round(deal.clientPays)} format={inr} className="block text-base font-black text-slate-800 tabular-nums leading-tight" />
        </div>
        {showMargin && (
          <div className="text-right">
            <div className={LABEL}>Margin</div>
            <div className={`text-sm font-bold tabular-nums ${tone}`}>{after.toFixed(1)}%</div>
          </div>
        )}
        <Button size="sm" variant="quiet" onClick={onOpenDeal}>Open Deal</Button>
      </div>
    );
  }

  const parts = SCOPE_PARTS.map(p => ({ ...p, value: split.parts[p.id]?.value || 0 })).filter(p => p.value > 0);
  const top = Math.max(1, ...parts.map(p => p.value));

  return (
    <div className="p-3 flex flex-col gap-3 hud-panel-in" role="region" aria-label="The deal, live">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>The deal, live</span>
        <button type="button" onClick={onOpenDeal} className="text-[11px] font-bold text-[#3D52A0] hover:text-[#334486] inline-flex items-center gap-1">
          Open Deal<ArrowRight className="w-3 h-3" aria-hidden />
        </button>
      </div>

      <section className="rounded-2xl bg-white border border-slate-200 p-4">
        <p className="text-xs text-slate-500">Client pays · {optionName}</p>
        <CountUp value={Math.round(deal.clientPays)} format={inr} className="block text-2xl font-black text-slate-800 tabular-nums" />
        {showMargin && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Margin <span className="text-slate-400">· studio only</span></span>
              <span className={`font-bold tabular-nums ${tone}`}>{after.toFixed(1)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 relative overflow-hidden" aria-hidden>
              <div className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${under ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(0, (after / 40) * 100))}%` }} />
              <div className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: `${Math.min(100, (floor / 40) * 100)}%` }} />
            </div>
            <p className={`mt-1 text-[11px] ${under ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
              {under ? `Under your ${floor}% floor.` : `Your floor is ${floor}%.`}
            </p>
          </div>
        )}
        <dl className="mt-3 text-xs divide-y divide-slate-100">
          <div className="flex justify-between gap-2 py-1.5"><dt className="text-slate-500">Work</dt><dd className="font-semibold text-slate-800 tabular-nums">{inr(deal.sell)}</dd></div>
          {deal.execOff > 0 && <div className="flex justify-between gap-2 py-1.5"><dt className="text-slate-500">Offers</dt><dd className="font-semibold text-emerald-700 tabular-nums">−{inr(deal.execOff)}</dd></div>}
          <div className="flex justify-between gap-2 py-1.5"><dt className="text-slate-500">Design fee</dt><dd className="font-semibold text-slate-800 tabular-nums">{inr(Math.max(0, deal.fee - deal.designOff))}</dd></div>
          <div className="flex justify-between gap-2 py-1.5"><dt className="text-slate-500">GST {terms.rate}%</dt><dd className="font-semibold text-slate-800 tabular-nums">{inr(deal.gst)}</dd></div>
        </dl>
      </section>

      {parts.length > 0 && (
        <section className="rounded-2xl bg-white border border-slate-200 p-3 flex flex-col gap-2" aria-label="Where the money goes">
          <span className={LABEL}>Where the money goes</span>
          {parts.map((p, i) => (
            <div key={p.id} className="hud-row-in text-xs" style={{ animationDelay: `${i * 30}ms` }} title={p.detail}>
              <div className="flex justify-between gap-2"><span className="text-slate-700">{p.label}</span><span className="font-semibold text-slate-800 tabular-nums">{inr(p.value)}</span></div>
              <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-[#3D52A0] transition-[width] duration-500" style={{ width: `${(p.value / top) * 100}%` }} /></div>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl bg-white border border-slate-200 p-3 text-xs" aria-label="Offers">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>Offers</span>
          {locked && <Chip tone="slate"><Lock className="w-3 h-3 inline -mt-px mr-1" aria-hidden />Fixed</Chip>}
        </div>
        {discounts.length ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {discounts.map((d, i) => (
              <li key={d.id} className="hud-row-in flex items-center gap-2" style={{ animationDelay: `${i * 30}ms` }}>
                <span className="text-emerald-700 shrink-0">{d.basis?.kind === 'complimentary' ? <Gift className="w-3.5 h-3.5" aria-hidden /> : <Percent className="w-3.5 h-3.5" aria-hidden />}</span>
                <span className="flex-1 min-w-0 truncate text-slate-700">{d.name}</span>
                <b className="tabular-nums text-emerald-700">−{inr(offerAmount(d, deal.sell, deal.fee))}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-slate-500">None yet.</p>
        )}
        <div className="mt-2.5">
          <Button size="sm" variant="secondary" className="w-full" onClick={onOpenDeal}>{locked ? 'See the deal' : 'Give an offer'}</Button>
        </div>
      </section>
    </div>
  );
}
