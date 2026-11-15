import React, { useMemo } from 'react';
import { Pencil, Gift, AlertTriangle } from '@/lib/lucide-shim';
import { Item, ProjectContext, ProposalTier } from '../../types';
import { buildBankMap } from '../../lib/boqPricing';
import { optionPrice } from '../../lib/tierComparison';
import { formatCurrency } from '../../lib/utils';
import { computeSchedule, contractInForce, gstTermsOf } from '../../lib/paymentSchedule';
import { SCOPE_PARTS, scopeSplit, dealFor, lowMarginLines, type OfferDiscount } from '../../lib/offers';

/*
  Every option side by side: the first thing on Pricing & Tiers.

  The owner's complaint was that comparing tiers, editing one, and seeing its
  money and milestones meant three different screens. Each column now carries
  what the decision turns on: the price, margin, what it is made of
  (carpentry, functional, civil, others), the offers on it, what the client
  pays and when, and lines priced too thin. "Edit BOQ" opens that option's BOQ
  over this screen (App's BOQ slide-over), so nothing is lost by editing.
*/

interface Props {
  tiers: ProposalTier[];
  bank: Item[];
  projectContext: ProjectContext;
  activeTierId: string | null;
  setActiveTierId: (id: string) => void;
  /** The sentence that says how an option is built (lib/tierComparison specLabel). */
  specLabel?: Record<string, string>;
  /** Opens this option's BOQ over Pricing & Tiers. */
  onEditBoq?: (tierId: string) => void;
  /** Money & Offers, for this option. */
  onOffers?: (tierId: string) => void;
}

export default function OptionColumns({ tiers, bank, projectContext, activeTierId, setActiveTierId, specLabel = {}, onEditBoq, onOffers }: Props) {
  const ctx: any = projectContext || {};
  const bankMap = useMemo(() => buildBankMap(bank || [], ctx.adHocItems), [bank, ctx.adHocItems]);
  const discounts: OfferDiscount[] = (ctx.financials?.discounts || []) as OfferDiscount[];
  const terms = gstTermsOf(ctx);
  const signed = contractInForce(ctx);
  const area = Number(ctx.area) || 0;
  const cheapest = Math.min(...tiers.map((t) => optionPrice(t).total).filter((v) => v > 0));

  const cols = useMemo(() => tiers.map((t) => {
    const price = optionPrice(t);
    const split = scopeSplit(t, bankMap);
    const deal = dealFor(t.summary, discounts, terms);
    const offers = discounts.filter((d) => !d.basis || d.basis.tierId === t.id);
    const milestones = signed ? [] : computeSchedule({ context: ctx, tierSummary: t.summary }).amounts;
    return { t, price, split, deal, offers, milestones, thin: lowMarginLines(t, bankMap) };
  }), [tiers, bankMap, discounts, terms, signed, ctx]);

  if (tiers.length === 0) return null;

  return (
    <section aria-label="Options side by side" className="w-full">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Options side by side</p>
          <p className="text-xs text-slate-500 mt-0.5">Price, margin, what each is made of, offers and milestones. Edit an option’s BOQ without leaving.</p>
        </div>
      </div>
      <div
        className="grid gap-4 overflow-x-auto pb-1"
        style={{ gridAutoFlow: 'column', gridAutoColumns: `minmax(300px, ${tiers.length <= 3 ? '1fr' : '340px'})` }}
      >
        {cols.map(({ t, price, split, deal, offers, milestones, thin }, i) => {
          const active = t.id === activeTierId;
          const approved = ctx.approvedTierId === t.id;
          return (
            <article
              key={t.id}
              aria-label={t.name}
              className={`bg-white rounded-2xl border p-5 flex flex-col gap-4 hud-panel-in ${active ? 'border-[#3D52A0] ring-1 ring-[#3D52A0]/30' : 'border-slate-200'} shadow-sm`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => setActiveTierId(t.id)} className="text-left min-w-0" aria-pressed={active}>
                  <h3 className="font-bold text-slate-800 truncate">{t.name}</h3>
                  {specLabel[t.id] && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{specLabel[t.id]}</p>}
                </button>
                <span className="flex gap-1 shrink-0">
                  {approved && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">Approved</span>}
                  {active && !approved && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#3D52A0]/10 text-[#3D52A0]">Selected</span>}
                </span>
              </div>

              <div>
                <p className="text-2xl font-black text-slate-800 tabular-nums tracking-tight">{formatCurrency(Math.round(price.total))}</p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {area > 0 && <>₹{Math.round(price.total / area).toLocaleString('en-IN')}/sq ft · </>}
                  {(t.summary.blendedGm ?? 0).toFixed(1)}% margin
                  {cheapest > 0 && price.total > cheapest && <span className="text-amber-700"> · +{Math.round((price.total / cheapest - 1) * 100)}%</span>}
                </p>
                {price.designFee > 0 && (
                  <p className="text-[11px] text-slate-500 tabular-nums" data-testid="option-split">
                    work {formatCurrency(Math.round(price.work))} + design fee {formatCurrency(Math.round(price.designFee))}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Where the money goes</p>
                <ul className="space-y-1.5">
                  {SCOPE_PARTS.map((p) => {
                    const v = split.parts[p.id].value;
                    const share = split.total > 0 ? (v / split.total) * 100 : 0;
                    return (
                      <li key={p.id} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                        <span className="text-slate-600">{p.label}</span>
                        <span className="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden><span className="block h-full rounded-full bg-[#3D52A0]" style={{ width: `${share}%` }} /></span>
                        <span className="tabular-nums text-slate-700 text-right">{formatCurrency(Math.round(v))}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Offers</p>
                {offers.length === 0
                  ? <p className="text-xs text-slate-500">None yet.</p>
                  : offers.map((d) => (
                    <p key={d.id} className="text-xs text-slate-700 flex justify-between gap-2">
                      <span className="truncate">{d.name}</span>
                      <span className="tabular-nums text-emerald-700 shrink-0">− {d.type === 'percentage' ? `${d.value}%` : formatCurrency(Math.round(d.value))}</span>
                    </p>
                  ))}
                <p className="text-xs flex justify-between gap-2 pt-1 border-t border-slate-200">
                  <span className="font-semibold text-slate-800">Client pays, with GST</span>
                  <span className="font-black text-slate-800 tabular-nums">{formatCurrency(Math.round(deal.clientPays))}</span>
                </p>
              </div>

              {milestones.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Milestones</p>
                  <ul className="space-y-1">
                    {milestones.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2 text-xs">
                        <span className="text-slate-600 truncate">{m.name}</span>
                        <span className="tabular-nums text-slate-800">{formatCurrency(Math.round(m.invoiceTotal))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {thin > 0 && (
                <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {thin} {thin === 1 ? 'line' : 'lines'} under 15% margin
                </p>
              )}

              <div className="mt-auto flex gap-2">
                {onEditBoq && (
                  <button type="button" onClick={() => onEditBoq(t.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50">
                    <Pencil className="w-3.5 h-3.5" /> Edit BOQ
                  </button>
                )}
                {onOffers && (
                  <button type="button" onClick={() => onOffers(t.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50">
                    <Gift className="w-3.5 h-3.5" /> Offers
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
