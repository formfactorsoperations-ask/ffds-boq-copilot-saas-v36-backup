import React, { useMemo, useState } from 'react';
import { useFiguresHidden } from '../ui/HideFigures';
import { Gift, Percent, Wallet, Trash2, AlertTriangle, Layers } from '@/lib/lucide-shim';
import { Item, ProjectContext, ProposalTier } from '../../types';
import { buildBankMap } from '../../lib/boqPricing';
import { withDiscounts } from '../../lib/playground/deal';
import { formatINR as formatCurrency, id as newId } from '../../lib/utils';
import { computeSchedule, contractInForce, gstTermsOf } from '../../lib/paymentSchedule';
import { otherBenchmarks, medianGm } from '../../lib/tierBenchmarks';
import { optionChains, latestOf, chainOf, sameOption, versionNo } from '../../lib/optionChains';
import {
  SCOPE_PARTS, partLabel, scopeSplit, splitPricingOf, offerScope, offerDiscount, offerValue, offerName, staleOffer, refreshedOffer, marginWith, dealFor,
  type ScopePart, type OfferBasis, type OfferDiscount,
} from '../../lib/offers';

/*
  Money & Offers: the deal on one option, before it is signed.

  Replaces Health Check & Audit (stage 2), which the owner found told the
  studio nothing it could act on. This answers the questions a proposal
  meeting turns on: what is this option made of (carpentry, functional, civil),
  what can we give away and what does it cost us, and what will the client pay,
  milestone by milestone.

  Offers are the project's discounts (financials.discounts), edited only here:
  Money, the proposal, the agreement and issued documents read the same list.
*/

interface Props {
  tiers: ProposalTier[];
  bank: Item[];
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  activeTierId?: string | null;
  /** The studio's other projects, for the median margin Pricing & Tiers also compares against. */
  projects?: any[];
  projectId?: string;
  readOnly?: boolean;
}

type AddKind = 'part-percent' | 'complimentary' | 'other';

const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';
const field = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
const panel = 'bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in';
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

function PanelHead({ icon, title, blurb }: { icon: React.ReactNode; title: string; blurb: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <h2 className="font-bold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
      </div>
    </div>
  );
}

export default function MoneyOffersTab({ tiers, bank, projectContext, setProjectContext, activeTierId, projects = [], projectId, readOnly }: Props) {
  const ctx: any = projectContext || {};
  /* One entry per option: its newest version, the one the proposal carries (lib/optionChains). */
  const chains = useMemo(() => optionChains(tiers), [tiers]);
  const options = useMemo(() => chains.map(latestOf), [chains]);
  const [tierId, setTierId] = useState<string>(() => {
    const start = chainOf(chains, ctx.approvedTierId || activeTierId) || chains[0];
    return start ? latestOf(start).id : '';
  });
  const tier = options.find((t) => t.id === tierId) || (chainOf(chains, tierId) && latestOf(chainOf(chains, tierId)!)) || options[0];
  const same = (a: string, b: string) => sameOption(chains, a, b);
  const versionName = (id: string) => {
    const c = chainOf(chains, id);
    return c ? `v${versionNo(c, id)}` : '';
  };

  const bankMap = useMemo(() => buildBankMap(bank || [], ctx.adHocItems), [bank, ctx.adHocItems]);
  /* A Playground option's lines at their rounded amounts, as its summary has them (lib/offers splitPricingOf). */
  const split = useMemo(() => scopeSplit(tier, bankMap, splitPricingOf(tier, ctx.rooms, bankMap)), [tier, bankMap, ctx.rooms]);
  const discounts: OfferDiscount[] = (ctx.financials?.discounts || []) as OfferDiscount[];

  const benchmarks = useMemo(() => otherBenchmarks(projects, { id: projectId, name: projectId ? undefined : ctx.name }), [projects, projectId, ctx.name]);
  const median = useMemo(() => medianGm(benchmarks), [benchmarks]);
  const marginsHidden = useFiguresHidden();

  /* ---- the offer being written ---- */
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [part, setPart] = useState<ScopePart>('carpentry');
  const [percent, setPercent] = useState<number>(5);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [other, setOther] = useState({ name: '', value: 0, type: 'fixed' as 'fixed' | 'percentage', target: 'execution' as 'execution' | 'design' });

  const draftBasis: OfferBasis | null = !tier ? null
    : adding === 'part-percent' ? { kind: 'part-percent', part, percent: Number(percent) || 0, tierId: tier.id }
    : adding === 'complimentary' ? { kind: 'complimentary', part, lines: split.parts[part].lines.filter((l) => picked.has(l.key)).map((l) => ({ key: l.key, name: l.name })), tierId: tier.id }
    : null;
  const draftValue = draftBasis ? offerValue(draftBasis, split)
    : adding === 'other' ? (other.type === 'percentage' ? Math.round((other.target === 'execution' ? split.total : tier?.summary.designFee || 0) * (other.value / 100)) : other.value)
    : 0;
  const draftOnExecution = adding === 'other' ? (other.target === 'execution' ? draftValue : 0) : draftValue;
  const draftOk = adding === 'other' ? other.name.trim() && other.value > 0 : draftValue > 0;

  /* Through lib/playground/deal withDiscounts: the first offer on a project with no financials record keeps its GST on. */
  const save = (next: OfferDiscount[]) => setProjectContext((prev: any) => withDiscounts(prev, next));

  const add = () => {
    if (!draftOk || !tier) return;
    const d: OfferDiscount = draftBasis
      ? offerDiscount(newId(), draftBasis, split)
      : { id: newId(), name: other.name.trim(), type: other.type, value: Number(other.value), target: other.target };
    save([...discounts, d]);
    setAdding(null);
    setPicked(new Set());
    setOther({ name: '', value: 0, type: 'fixed', target: 'execution' });
  };
  const remove = (id: string) => save(discounts.filter((d) => d.id !== id));
  const refresh = (d: OfferDiscount, value: number) =>
    save(discounts.map((x) => (x.id === d.id ? refreshedOffer(x, tier.id, value) : x)));

  if (!tier) {
    return (
      <div className={panel}>
        <PanelHead icon={<Wallet className="w-4 h-4" />} title="No options yet" blurb="Generate or add an option in Pricing & Tiers first; its money and offers show here." />
      </div>
    );
  }

  /* ---- the deal on this option ---- */
  const terms = gstTermsOf(ctx);
  const deal = dealFor(tier.summary, discounts, terms);
  const { sell, fee, execOff, designOff, clientPays, margin } = deal;
  const gstTotal = deal.gst;
  const marginIfAdded = marginWith(sell, tier.summary.totalCost || 0, execOff + draftOnExecution);
  /* Worth flagging: a loss on the option, or a margin under the studio's usual one. */
  const belowMedian = (m: number | null) => m !== null && (m < 0 || (median !== null && m < median));
  const whyLow = (m: number | null) => (m !== null && m < 0 ? 'this option would make a loss' : `below the studio median of ${pct(median)}`);

  const signedOther = contractInForce(ctx) && ctx.approvedTierId && ctx.approvedTierId !== tier.id;
  const schedule = computeSchedule({ context: ctx, tierSummary: tier.summary });

  return (
    <div className="pb-12 space-y-4">
      {/* Which option */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap p-1 rounded-xl bg-slate-100 gap-1" role="tablist" aria-label="Option">
          {options.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tier.id}
              onClick={() => { setTierId(t.id); setPicked(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${t.id === tier.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.name}
              <span className="ml-2 text-xs font-semibold text-slate-500 tabular-nums">{formatCurrency(Math.round(t.summary.totalSell || 0))}</span>
            </button>
          ))}
        </div>
        {ctx.approvedTierId === tier.id && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">Approved option</span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_600px] min-w-0 space-y-4">
          {/* What the option is made of */}
          <section className={panel} aria-label="Where the money goes">
            <PanelHead icon={<Layers className="w-4 h-4" />} title="Where the money goes" blurb="This option's work value, part by part. Offers can be made against one part." />
            <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {SCOPE_PARTS.map((p, i) => {
                const v = split.parts[p.id].value;
                const share = split.total > 0 ? (v / split.total) * 100 : 0;
                return (
                  <li key={p.id} className="px-4 py-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-4 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{p.label}</p>
                      <p className="text-[11px] text-slate-500 truncate">{p.detail}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden>
                      <div className="h-full rounded-full bg-[#3D52A0]" style={{ width: `${share}%` }} />
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-800 tabular-nums">{formatCurrency(Math.round(v))}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">{share.toFixed(0)}% · {split.parts[p.id].lines.length} {split.parts[p.id].lines.length === 1 ? 'line' : 'lines'}</p>
                    </div>
                  </li>
                );
              })}
              <li className="px-4 py-3 flex justify-between text-sm">
                <span className="font-bold text-slate-800">Work value</span>
                <span className="font-black text-slate-800 tabular-nums">{formatCurrency(Math.round(split.total))}</span>
              </li>
            </ul>
          </section>

          {/* Offers */}
          <section className={panel} aria-label="Offers">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <PanelHead icon={<Gift className="w-4 h-4" />} title="Offers" blurb="Discounts and complimentary work. They come off before GST, on every document the client sees." />
              {!readOnly && !adding && (
                <button type="button" onClick={() => setAdding('part-percent')} className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">Add an offer</button>
              )}
            </div>

            {discounts.length === 0 && !adding && (
              <p className="mt-5 rounded-xl border border-slate-200 px-4 py-5 text-center text-xs text-slate-500">No offers on this project yet.</p>
            )}

            {discounts.length > 0 && (
              <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {discounts.map((d) => {
                  const stale = staleOffer(d, tier.id, split, same, { summary: tier.summary, others: discounts, terms });
                  const earlier = !!d.basis && d.basis.tierId !== tier.id && same(d.basis.tierId, tier.id);
                  const elsewhere = d.basis && d.basis.tierId !== tier.id && !earlier ? tiers.find((t) => t.id === d.basis!.tierId)?.name : null;
                  return (
                    <li key={d.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{d.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {d.basis ? `${offerScope(d.basis)} · ` : ''}{d.target === 'design' ? 'Off the design fee' : 'Off execution'}
                          {elsewhere ? ` · priced on ${elsewhere}` : ''}
                        </p>
                        {stale !== null && (
                          <p className="mt-1 text-[11px] text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {earlier
                              ? <>Priced on {versionName(d.basis!.tierId)}. On {versionName(tier.id)} it is {formatCurrency(stale)}.</>
                              : <>The BOQ changed: on it today this is {formatCurrency(stale)}.</>}
                            {!readOnly && <button type="button" onClick={() => refresh(d, stale)} className="ml-1 font-bold text-[#3D52A0] hover:text-[#334486]">Update</button>}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-black text-slate-800 tabular-nums whitespace-nowrap">
                        − {d.type === 'percentage' ? `${d.value}%` : formatCurrency(Math.round(d.value))}
                      </span>
                      {!readOnly && (
                        <button type="button" onClick={() => remove(d.id)} aria-label={`Remove ${d.name}`} className="p-1 -m-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {adding && (
              <div className="mt-5 rounded-xl border border-slate-200 p-4 space-y-4">
                <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-1" role="tablist" aria-label="Kind of offer">
                  {([['part-percent', 'Off a part'], ['complimentary', 'Complimentary'], ['other', 'Other discount']] as [AddKind, string][]).map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={adding === k} onClick={() => setAdding(k)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${adding === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
                  ))}
                </div>

                {adding !== 'other' && (
                  <div>
                    <label className={label} htmlFor="mo-part">Part of the job</label>
                    <select id="mo-part" className={field} value={part} onChange={(e) => { setPart(e.target.value as ScopePart); setPicked(new Set()); }}>
                      {SCOPE_PARTS.map((p) => <option key={p.id} value={p.id}>{p.label} · {formatCurrency(Math.round(split.parts[p.id].value))}</option>)}
                    </select>
                  </div>
                )}

                {adding === 'part-percent' && (
                  <div>
                    <label className={label} htmlFor="mo-pct">Percent off</label>
                    <input id="mo-pct" type="number" min={0} max={100} className={field} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
                  </div>
                )}

                {adding === 'complimentary' && (
                  <fieldset>
                    <legend className={label}>Give these free</legend>
                    {split.parts[part].lines.length === 0
                      ? <p className="text-xs text-slate-500">This option has no {partLabel(part).toLowerCase()} lines.</p>
                      : (
                        <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                          {split.parts[part].lines.map((l) => (
                            <li key={l.key}>
                              <label className="px-3 py-2 flex items-center gap-3 text-sm cursor-pointer hover:bg-slate-50">
                                <input type="checkbox" className="accent-[#3D52A0]" checked={picked.has(l.key)}
                                  onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(l.key)) n.delete(l.key); else n.add(l.key); return n; })} />
                                <span className="flex-1 min-w-0 truncate text-slate-700">{l.name} <span className="text-slate-400">· {l.room}</span></span>
                                <span className="tabular-nums text-slate-600">{formatCurrency(Math.round(l.total))}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                  </fieldset>
                )}

                {adding === 'other' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={label} htmlFor="mo-name">What it is</label>
                      <input id="mo-name" className={field} value={other.name} placeholder="e.g. Goodwill discount" onChange={(e) => setOther({ ...other, name: e.target.value })} />
                    </div>
                    <div>
                      <label className={label} htmlFor="mo-val">Amount</label>
                      <div className="flex gap-2">
                        <input id="mo-val" type="number" min={0} className={field} value={other.value || ''} onChange={(e) => setOther({ ...other, value: Number(e.target.value) })} />
                        <select aria-label="Percent or rupees" className={`${field} w-20`} value={other.type} onChange={(e) => setOther({ ...other, type: e.target.value as any })}>
                          <option value="fixed">₹</option>
                          <option value="percentage">%</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={label} htmlFor="mo-target">Comes off</label>
                      <select id="mo-target" className={field} value={other.target} onChange={(e) => setOther({ ...other, target: e.target.value as any })}>
                        <option value="execution">Execution</option>
                        <option value="design">Design fee</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600 space-y-1">
                  <p>Worth <b className="text-slate-800 tabular-nums">{formatCurrency(Math.round(draftValue))}</b>{draftBasis ? ` · "${offerName(draftBasis)}"` : ''}</p>
                  {/* Hide figures (lib/figuresPrivacy): what the offer is worth stays; what it does to the margin goes. */}
                  {!marginsHidden && (
                  <p>Margin on this option {pct(margin.after)} → <b className={belowMedian(marginIfAdded.after) ? 'text-amber-700' : 'text-slate-800'}>{pct(marginIfAdded.after)}</b>
                    {belowMedian(marginIfAdded.after) && <> · {whyLow(marginIfAdded.after)}</>}
                  </p>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setAdding(null); setPicked(new Set()); }} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50">Cancel</button>
                  <button type="button" onClick={add} disabled={!draftOk} className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50">Add the offer</button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="flex-[1_1_320px] min-w-0 space-y-4">
          {/* The deal */}
          <section className={panel} aria-label="The deal">
            <PanelHead icon={<Wallet className="w-4 h-4" />} title="The deal" blurb={`${tier.name}, with the offers above.`} />
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Execution</dt><dd className="tabular-nums text-slate-800">{formatCurrency(Math.round(sell))}</dd></div>
              {execOff > 0 && <div className="flex justify-between"><dt className="text-slate-600">Offers on execution</dt><dd className="tabular-nums text-emerald-700">− {formatCurrency(Math.round(execOff))}</dd></div>}
              <div className="flex justify-between"><dt className="text-slate-600">Design fee</dt><dd className="tabular-nums text-slate-800">{formatCurrency(Math.round(fee))}</dd></div>
              {designOff > 0 && <div className="flex justify-between"><dt className="text-slate-600">Offers on design</dt><dd className="tabular-nums text-emerald-700">− {formatCurrency(Math.round(designOff))}</dd></div>}
              <div className="flex justify-between"><dt className="text-slate-600">GST</dt><dd className="tabular-nums text-slate-800">{formatCurrency(Math.round(gstTotal))}</dd></div>
              <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                <dt className="font-bold text-slate-800">Client pays</dt>
                <dd className="text-2xl font-black text-slate-800 tabular-nums">{formatCurrency(Math.round(clientPays))}</dd>
              </div>
            </dl>
            {!marginsHidden && (
            <p className={`mt-2 text-[11px] ${belowMedian(margin.after) ? 'text-amber-700' : 'text-slate-500'}`}>
              Margin {pct(margin.before)}{execOff > 0 ? ` → ${pct(margin.after)} after offers` : ''}
              {median !== null ? ` · studio median ${pct(median)}` : ''}
            </p>
            )}
          </section>

          {/* Milestones */}
          <section className={panel} aria-label="Milestones">
            <PanelHead icon={<Percent className="w-4 h-4" />} title="Milestones" blurb={signedOther ? 'The signed option’s schedule, as Money bills it.' : 'What the client pays at each stage, as Money will bill it.'} />
            {schedule.amounts.length === 0 ? (
              <p className="mt-5 text-xs text-slate-500">No payment schedule yet. Set it up in Payment Schedule.</p>
            ) : (
              <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {schedule.amounts.map((m) => (
                  <li key={m.id} className="px-4 py-2.5 flex justify-between gap-3 text-sm">
                    <span className="text-slate-700 min-w-0 truncate">{m.name}</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(Math.round(m.invoiceTotal))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
