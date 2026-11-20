import React, { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Copy, Download } from 'lucide-react';
import { Button, Chip, Segmented, LABEL } from '../ui/kit';
import type { BoqItem, Item, ProjectContext, ProposalTier, PaymentStructure, Room, PlanSheet } from '../../types';
import { sheetOf, isPdfSheet } from '../../lib/playground/planSheet';
import { scopeSplit, splitPricingOf, dealFor, complimentaryKeys, type OfferDiscount } from '../../lib/offers';
import { gstTermsOf, scheduleFor } from '../../lib/paymentSchedule';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { isPlaygroundTier, lineAmount, lineAmountsByRoom, sharesOf, withPlanQty } from '../../lib/playground/pricing';
import { resolveBoqLine } from '../../lib/boqPricing';
import { discountsOf } from '../../lib/playground/deal';
import { optionChains, latestOf } from '../../lib/optionChains';
import { realRooms } from '../../lib/scopeBuckets';
import { ftin } from '../../lib/playground/geometry';
import { shadeHexOf } from '../../lib/lineSpecs';
import { currentVersion, type MaterialSpecsBank } from '../../lib/materialSpecs';
import { materialsPage, allowanceOf } from '../../lib/playground/proposal';
import { chaptersOf, piecesIn, finishChoice, askedLine, askDelta, withAsks, type Asks } from '../../lib/playground/meeting';
import { lineSupply } from '../../lib/playground/supply';
import { ArtDefs, PieceArt, PieceThumb, artOfSpecs } from './pieceArt';
import { inr } from './playgroundUi';

/*
  The meeting view (BOQ Playground PR P, as in the approved mockup): the
  proposal presented on screen once the layout is approved, so the rooms are
  drawn. Chapters down the side; how much price the client sees (a package, room
  totals, or every line); a finish the client asks for is priced as it would be,
  and the asks become the option's next version. Never a cost or a markup.
*/

export type PriceDetail = 'package' | 'rooms' | 'lines';

const dateOf = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** The flat drawn from above: the rooms, the pieces in their finishes, one room picked out. */
function DrawnPlan({ rooms, boq, bankMap, specBank, focus, className, sheet }: { rooms: Room[]; boq: BoqItem[]; bankMap: Map<string, Item>; specBank?: MaterialSpecsBank | null; focus?: string; className: string; sheet?: PlanSheet | null }) {
  /* The builder's plan under the rooms, placed as the Plan lens places it, once its scale is set. */
  const underlay = sheet?.imageUrl && Number(sheet.ftPerPx) > 0 && sheet.imagePx && !isPdfSheet(sheet) ? sheet : null;
  const rs = rooms.filter(r => r.plan);
  if (!rs.length) return null;
  const f = focus ? rs.find(r => r.name === focus) : undefined;
  const xs = rs.map(r => r.plan!);
  const minX = Math.min(...xs.map(p => p.x)), minY = Math.min(...xs.map(p => p.y));
  const maxX = Math.max(...xs.map(p => p.x + p.w)), maxY = Math.max(...xs.map(p => p.y + p.h));
  const vb = f ? `${f.plan!.x - 1.4} ${f.plan!.y - 1.4} ${f.plan!.w + 2.8} ${f.plan!.h + 2.8}` : `${minX - 1} ${minY - 1} ${maxX - minX + 2} ${maxY - minY + 2}`;
  return (
    <svg viewBox={vb} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      <ArtDefs />
      {underlay && (
        <image href={underlay.imageUrl} x={-(underlay.origin?.x || 0) * underlay.ftPerPx!} y={-(underlay.origin?.y || 0) * underlay.ftPerPx!}
          width={underlay.imagePx!.w * underlay.ftPerPx!} height={underlay.imagePx!.h * underlay.ftPerPx!} preserveAspectRatio="none" />
      )}
      {rs.map(r => (
        <rect key={r.name} x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h}
          fill={focus === r.name ? 'rgba(61,82,160,.12)' : 'rgba(61,82,160,.03)'} stroke={focus === r.name ? '#3D52A0' : 'rgba(15,23,42,.45)'} strokeWidth={focus === r.name ? 0.18 : 0.08} />
      ))}
      {piecesIn(boq, bankMap).map(p => {
        const a = specBank ? artOfSpecs(p.line.materialSpecs, specBank.materials, s => shadeHexOf(specBank, s)) : {};
        return (
          <g key={p.id} transform={`translate(${p.place.x} ${p.place.y}) rotate(${p.place.rot})`}>
            <PieceArt kind={p.draw.kind} w={p.size.w} d={p.size.d} words={p.line.specs ?? p.item?.specs} high={p.draw.mount === 'high'} fill={a.fill} base={a.base} top={a.top} />
          </g>
        );
      })}
    </svg>
  );
}

const H = ({ k, t, sub }: { k: string; t: string; sub?: string }) => (
  <>
    <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#3D52A0]">{k}</div>
    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-800 mt-1">{t}</h1>
    {sub && <p className="text-slate-500 mt-2 max-w-2xl">{sub}</p>}
  </>
);

export interface MeetingViewProps {
  ctx: ProjectContext;
  tier: ProposalTier;
  tiers: ProposalTier[];
  bankMap: Map<string, Item>;
  specBank?: MaterialSpecsBank | null;
  paymentStructure?: PaymentStructure | null;
  studioName: string;
  userName?: string;
  priceDetail: PriceDetail;
  onPriceDetail: (p: PriceDetail) => void;
  /** The option is the client's approved one. */
  approved: boolean;
  /** Makes the option the client's approved one; absent where it cannot be done from. */
  onApprove?: () => void;
  /** The option's next version, with the client's asks made. */
  onNewVersion?: (boq: BoqItem[]) => void;
  /** The same pages, as the PDF. */
  onPdf: () => void;
  onClose: () => void;
}

export default function MeetingView({ ctx, tier, tiers, bankMap, specBank, paymentStructure, studioName, userName, priceDetail: pv, onPriceDetail, approved, onApprove, onNewVersion, onPdf, onClose }: MeetingViewProps) {
  const [ch, setCh] = useState(0);
  const [asks, setAsks] = useState<Asks>({});
  const boq: BoqItem[] = tier.boq || [];
  const rooms = useMemo(() => realRooms(ctx.rooms || []), [ctx.rooms]);
  const pricing = useMemo(() => splitPricingOf(tier, ctx.rooms, bankMap), [tier, ctx.rooms, bankMap]);
  const m = useMemo(() => {
    const summaryOf = (t: ProposalTier) => (isPlaygroundTier(t) ? playgroundTierSummary(t, bankMap, ctx) : t.summary);
    const summary = summaryOf(tier);
    const discounts = discountsOf(ctx) as OfferDiscount[];
    const deal = dealFor(summary, discounts, gstTermsOf(ctx));
    const split = scopeSplit(tier, bankMap, pricing);
    const options = optionChains(tiers).map(latestOf).map(t => (t.id === tier.id ? tier : t));
    return {
      deal, split, discounts, options,
      work: (t: ProposalTier) => summaryOf(t)?.totalSell || 0,
      schedule: scheduleFor(ctx, { tierSummary: summary }, { paymentStructure }),
      free: complimentaryKeys(discounts.filter(d => d.basis?.tierId === tier.id)),
      mats: materialsPage(specBank, options, tier.id),
    };
  }, [tier, tiers, ctx, bankMap, pricing, paymentStructure, specBank]);
  const chapters = useMemo(() => chaptersOf(rooms, boq, m.options.length), [rooms, boq, m.options.length]);
  const cur = chapters[Math.min(ch, chapters.length - 1)];
  const delta = askDelta(boq, asks, specBank, bankMap, pricing);
  const nAsks = Object.keys(asks).length;
  const go = (key: string) => setCh(Math.max(0, chapters.findIndex(c => c.key === key)));
  const amountOf = (l: BoqItem) => lineAmount(pricing ? withPlanQty(l, bankMap, pricing) : l, bankMap, pricing || {});
  const roomOf = (name: string) => rooms.find(r => r.name === name);
  const sizeOf = (r?: Room) => (r?.plan ? `${ftin(r.plan.w)} × ${ftin(r.plan.h)}` : '');
  const pieceCount = (name: string) => boq.filter(l => l.roomId === name).length;
  const roomTotal = (name: string) => m.split.byRoom[name] || 0;
  const valid = ctx.proposal?.validUntil ? dateOf(new Date(ctx.proposal.validUntil)) : null;

  const sheet = useMemo(() => sheetOf(ctx as any), [ctx]);
  const drawnBoq = useMemo(() => withAsks(boq, asks, specBank, bankMap), [boq, asks, specBank, bankMap]);
  const plan = (focus?: string, cls = 'w-full h-auto') => <DrawnPlan rooms={rooms} boq={drawnBoq} bankMap={bankMap} specBank={specBank} focus={focus} className={cls} sheet={sheet} />;

  const welcome = (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-8 items-center">
      <div>
        <H k={`Proposal · ${dateOf(new Date())}`} t={ctx.name || 'Your home'} sub="A home planned room by room: every piece drawn to size, every material named, every rupee accounted for." />
        <div className="mt-6 grid grid-cols-3 gap-3">
          {([['Carpet area', Number(ctx.area) ? `${Number(ctx.area).toLocaleString('en-IN')} sq ft` : '—'], ['Rooms', String(rooms.length)], ['Option', tier.name || '']] as [string, string][]).map(([a, b]) => (
            <div key={a} className="rounded-2xl bg-white border border-slate-200 p-3"><div className={LABEL}>{a}</div><div className="text-sm font-bold text-slate-800 mt-0.5">{b}</div></div>
          ))}
        </div>
        {pv !== 'package' && (
          <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-4">
            <div className={LABEL}>Your investment, all in</div>
            <div className="text-3xl font-black tabular-nums mt-1" data-meeting-pays>{inr(m.deal.clientPays)}</div>
            {m.deal.execOff + m.deal.designOff > 0 && <div className="text-sm font-semibold text-emerald-700 mt-0.5">including savings of {inr(m.deal.execOff + m.deal.designOff)}</div>}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-4">Prepared by {[userName, studioName].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="rounded-3xl bg-white border border-slate-200 p-3 shadow-sm">{plan()}</div>
    </div>
  );

  const home = (
    <>
      <H k="Your home" t={`${rooms.length} rooms, one plan`} sub="Tap a room to walk through it." />
      <div className="mt-6 grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 items-start">
        <div className="rounded-3xl bg-white border border-slate-200 p-3">{plan()}</div>
        <div className="rounded-3xl bg-white border border-slate-200 divide-y divide-slate-100">
          {chapters.filter(c => c.room).map(c => (
            <button key={c.key} type="button" onClick={() => go(c.key)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
              <span className="w-12 h-10 shrink-0">{plan(c.room, 'w-12 h-10')}</span>
              <span className="flex-1 min-w-0"><span className="block font-bold text-slate-800">{c.room}</span><span className="block text-xs text-slate-500">{pieceCount(c.room!)} items · {sizeOf(roomOf(c.room!))}</span></span>
              {pv !== 'package' && <b className="tabular-nums text-slate-800">{inr(roomTotal(c.room!))}</b>}
              <ChevronRight className="w-4 h-4 text-slate-300" aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </>
  );

  const roomChapter = (name: string) => {
    const r = roomOf(name);
    const ls = boq.filter(l => l.roomId === name && l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted');
    const shared = boq.filter(l => l.byRoom && (sharesOf(pricing ? withPlanQty(l, bankMap, pricing) : l, pricing || {})?.get(name) || 0) > 0);
    const d = askDelta(ls, asks, specBank, bankMap, pricing);
    const idx = chapters.filter(c => c.room).findIndex(c => c.room === name) + 1;
    return (
      <>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0"><H k={`Room ${idx}`} t={name} sub={[sizeOf(r), r?.plan ? `${Math.round(r.plan.w * r.plan.h)} sq ft` : ''].filter(Boolean).join(', ')} /></div>
          {pv !== 'package' && (
            <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3 text-right">
              <div className={LABEL}>This room</div>
              <div className="text-2xl font-black tabular-nums">{inr(roomTotal(name) + d)}</div>
              {d !== 0 && <div className={`text-xs font-bold ${d > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{d > 0 ? '+' : '−'}{inr(Math.abs(d))} with your changes</div>}
            </div>
          )}
        </div>
        <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 items-start">
          <div className="rounded-3xl bg-white border border-slate-200 p-3 lg:sticky lg:top-0">{plan(name)}</div>
          <div className="space-y-3">
            {ls.map(l => {
              const item = bankMap.get(l.bankId);
              const al = askedLine(specBank, l, item, asks);
              const c = finishChoice(specBank, l, item);
              const res = resolveBoqLine(al, bankMap);
              const supply = lineSupply(l, bankMap);
              const piece = piecesIn([al], bankMap)[0];
              const art = piece && specBank ? artOfSpecs(al.materialSpecs, specBank.materials, s => shadeHexOf(specBank, s)) : {};
              const dd = amountOf(al) - amountOf(l);
              const free = m.free.has(String(l.id));
              return (
                <article key={l.id} className={`rounded-2xl bg-white border p-4 ${asks[String(l.id)] ? 'border-amber-300' : 'border-slate-200'}`} data-meeting-line={l.id}>
                  <div className="flex items-start gap-3">
                    <span className="w-16 h-12 shrink-0 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">{piece && <PieceThumb kind={piece.draw.kind} w={piece.size.w} d={piece.size.d} words={al.specs} fill={art.fill} base={art.base} top={art.top} className="w-16 h-12" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-bold text-slate-800">{res.name}{free && <> <Chip tone="good">Complimentary</Chip></>}{supply === 'client' && <> <Chip tone="slate">You buy this</Chip></>}</h3>
                        {pv === 'lines' && res.billable && !supply && <b className="tabular-nums text-slate-800 whitespace-nowrap">{free ? <><span className="line-through text-slate-400 font-semibold mr-1">{inr(amountOf(al))}</span>₹0</> : inr(amountOf(al))}</b>}
                      </div>
                      {al.specs && <p className="text-sm text-slate-600 mt-0.5">{al.specs}</p>}
                      <div className="text-xs text-slate-400 mt-1 tabular-nums">{[allowanceOf(l, bankMap), `${Math.round(res.qty * 100) / 100} ${res.unit}`].filter(Boolean).join(' · ')}</div>
                      {c && specBank && (
                        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap" role="group" aria-label={`Finish for ${res.name}`}>
                          <span className="text-[11px] font-bold text-slate-500 mr-1">Finish</span>
                          {c.options.map(o => {
                            const on = (asks[String(l.id)] || c.current) === o.id;
                            const hex = currentVersion(specBank, o.id)?.range?.examples?.[0]?.hex || o.base || '#e2e8f0';
                            return (
                              <button key={o.id} type="button" aria-pressed={on} title={o.name}
                                onClick={() => setAsks(a => { const n = { ...a }; if (o.id === c.current) delete n[String(l.id)]; else n[String(l.id)] = o.id; return n; })}
                                className={`rounded-lg p-0.5 border-2 ${on ? 'border-[#3D52A0]' : 'border-transparent hover:border-slate-300'}`}>
                                <span className="block w-10 h-6 rounded" style={{ background: hex }} />
                                <span className="block text-[10px] font-bold text-slate-600">{o.name.split(/[ ,]/)[0]}{o.id === c.current ? ' ·' : ''}</span>
                              </button>
                            );
                          })}
                          {dd !== 0 && pv !== 'package' && <span className={`ml-1 text-xs font-bold ${dd > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{dd > 0 ? '+' : '−'}{inr(Math.abs(dd))}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {shared.length > 0 && (
              <div className="rounded-2xl bg-white border border-slate-200 p-4">
                <div className={`${LABEL} mb-2`}>Services in this room</div>
                {shared.map(l => {
                  const q = sharesOf(withPlanQty(l, bankMap, pricing || {}), pricing || {})?.get(name) || 0;
                  return (
                    <div key={l.id} className="flex items-baseline justify-between gap-2 py-1 text-sm">
                      <span className="text-slate-700">{resolveBoqLine(l, bankMap).name} <span className="text-slate-400 tabular-nums">· {Math.round(q * 100) / 100} {resolveBoqLine(l, bankMap).unit}</span></span>
                      {pv === 'lines' && <b className="tabular-nums">{inr(lineAmountsByRoom(withPlanQty(l, bankMap, pricing || {}), bankMap, pricing || {}).get(name) || 0)}</b>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  const materials = (
    <>
      <H k="Materials" t="What your home is made of" sub="Every material named, with the brand or its equivalent. Each line in your BOQ uses one of these." />
      {m.mats ? (
        <div className="mt-6 grid md:grid-cols-2 gap-3">
          {m.mats.rows.map(r => {
            const c = r.cells[m.mats!.options.findIndex(o => o.recommended)];
            return c ? (
              <div key={r.part} className="rounded-2xl bg-white border border-slate-200 p-4">
                <div className={`${LABEL} mb-2`}>{r.part}</div>
                <div className="text-sm font-semibold text-slate-800">{c.words}</div>
                <div className="text-xs text-slate-500">{[c.brand, c.range].filter(Boolean).join(' · ')}</div>
              </div>
            ) : null;
          })}
        </div>
      ) : <p className="mt-6 text-sm text-slate-500">The materials are named on each line.</p>}
    </>
  );

  const options = (
    <>
      <H k="Your options" t={m.options.length === 3 ? 'Three ways to finish it' : `${m.options.length} ways to finish it`} sub="The same plan and the same pieces. What changes is the finish, the board and the hardware." />
      <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(3, m.options.length)}, minmax(0, 1fr))` }}>
        {m.options.map((t, i) => {
          const on = t.id === tier.id;
          const col = m.mats?.options.findIndex(o => o.name === t.name) ?? i;
          return (
            <div key={t.id} className={`rounded-3xl bg-white border-2 p-5 ${on ? 'border-[#3D52A0] shadow-lg' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-slate-800">{t.name}</h3>{on && <Chip tone="brand">Recommended</Chip>}</div>
              {!(pv === 'package' && !on) && <><div className="text-2xl font-black tabular-nums mt-2">{inr(m.work(t))}</div><div className="text-[11px] text-slate-500">the work, before offers and GST</div></>}
              <ul className="mt-4 space-y-2">
                {(m.mats?.rows || []).slice(0, 4).map(r => (r.cells[col] ? <li key={r.part} className="text-sm"><span className="text-slate-500 text-xs block">{r.part}</span><span className="text-slate-800 font-semibold">{r.cells[col]!.words}</span></li> : null))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );

  const stages = [...m.schedule.design.stages.map(x => [x, 'design fee'] as const), ...m.schedule.execution.stages.map(x => [x, 'work'] as const)];
  const invest = (
    <>
      <H k="Investment" t="What it comes to" sub={`${valid ? `Offers valid until ${valid}. ` : ''}Prices as in the BOQ of ${dateOf(new Date(tier.timestamp || Date.now()))}.`} />
      <div className="mt-6 grid lg:grid-cols-2 gap-6 items-start">
        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <div className="flex justify-between py-2 text-slate-700"><span>The work, {tier.name}</span><b className="tabular-nums">{inr(m.deal.sell)}</b></div>
          {m.discounts.map(d => <div key={d.id} className="flex justify-between py-2 text-emerald-700"><span>{d.name}</span><b className="tabular-nums">−{inr(d.type === 'percentage' ? (d.target === 'design' ? m.deal.fee : m.deal.sell) * d.value / 100 : d.value)}</b></div>)}
          <div className="flex justify-between py-2 text-slate-700 border-t border-slate-100"><span>Design fee</span><b className="tabular-nums">{inr(m.deal.fee)}</b></div>
          <div className="flex justify-between py-2 text-slate-700"><span>GST {gstTermsOf(ctx).rate}%</span><b className="tabular-nums">{inr(m.deal.gst)}</b></div>
          <div className="flex justify-between items-baseline pt-4 mt-2 border-t-2 border-slate-800"><span className="text-lg font-bold">Your investment</span><b className="text-3xl font-black tabular-nums">{inr(m.deal.clientPays)}</b></div>
          {m.deal.execOff + m.deal.designOff > 0 && <div className="mt-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 font-semibold">You save {inr(m.deal.execOff + m.deal.designOff)} on this proposal</div>}
          {delta !== 0 && <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">Your {nAsks} finish change{nAsks > 1 ? 's' : ''} would {delta > 0 ? 'add' : 'save'} {inr(Math.abs(delta))} before GST. We will send them as the next version.</div>}
        </div>
        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <div className="font-bold text-slate-800">How you pay</div>
          <div className="mt-3 divide-y divide-slate-100">
            {stages.map(([x, g]) => (
              <div key={x.id} className="py-2.5 flex items-center gap-3">
                <span className="w-9 h-7 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center text-xs font-bold">{x.code}</span>
                <span className="flex-1"><b className="block text-sm text-slate-800">{x.name}</b>{x.trigger && <span className="block text-xs text-slate-500">{x.trigger}</span>}</span>
                <span className="text-right"><b className="block tabular-nums">{inr(x.amount)}</b>{!x.fixed && <span className="block text-xs text-slate-400">{x.pct}% of the {g}, with GST</span>}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  const next = (
    <>
      <H k="Next step" t="Shall we begin?" />
      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-white border border-slate-200 p-5 md:col-span-2">
          <div className={LABEL}>{tier.name}</div>
          <div className="text-3xl font-black tabular-nums mt-1">{inr(m.deal.clientPays)}</div>
          <p className="text-sm text-slate-500 mt-1">{boq.length} lines across {rooms.length} rooms{m.deal.execOff + m.deal.designOff > 0 ? `, with ${inr(m.deal.execOff + m.deal.designOff)} of savings` : ''}. Booking is {m.schedule.design.stages[0]?.code || 'D1'} of the design fee, with GST: {inr(m.schedule.booking)}.</p>
          {nAsks > 0 && (
            <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4">
              <div className="text-sm font-bold text-amber-900">You asked for {nAsks} change{nAsks > 1 ? 's' : ''}</div>
              <ul className="mt-1 text-sm text-amber-900/80 list-disc pl-5">
                {Object.entries(asks).map(([id, mat]) => <li key={id}>{resolveBoqLine(boq.find(l => String(l.id) === id)!, bankMap).name}: {(specBank?.materials.find(x => x.id === mat)?.name || '').split(',')[0].toLowerCase()}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {approved ? <Chip tone="good">Approved by the client</Chip> : onApprove ? <Button variant="primary" icon={Check} onClick={onApprove}>The client approves {tier.name}</Button> : null}
            {nAsks > 0 && onNewVersion && <Button icon={Copy} onClick={() => onNewVersion(withAsks(boq, asks, specBank, bankMap))}>Make a new version with {nAsks} change{nAsks > 1 ? 's' : ''}</Button>}
          </div>
        </div>
        <div className="rounded-3xl bg-white border border-slate-200 p-5 space-y-2">
          <div className="font-bold text-slate-800">Send it to them</div>
          <p className="text-xs text-slate-500">The same pages, as the booklet PDF.</p>
          <Button icon={Download} onClick={onPdf}>Booklet PDF</Button>
        </div>
      </div>
    </>
  );

  const body = cur.key === 'welcome' ? welcome : cur.key === 'home' ? home : cur.room ? roomChapter(cur.room) : cur.key === 'materials' ? materials : cur.key === 'options' ? options : cur.key === 'invest' ? invest : next;
  const last = ch >= chapters.length - 1;

  return (
    <div className="fixed inset-0 z-[350] flex flex-col phd-scrim bg-slate-50" role="dialog" aria-modal="true" aria-label="Presenting the proposal">
      <header className="shrink-0 px-4 py-2.5 flex items-center gap-3 flex-wrap bg-white border-b border-slate-200">
        <span className="px-2 py-1 rounded-md border border-slate-300 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-600 leading-tight max-w-[120px]">{studioName.split(/\s+/).slice(0, 2).join(' ')}</span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-800">{ctx.name || 'Proposal'}</div>
          <div className="text-[11px] text-slate-500">{tier.name} · presenting</div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 hidden md:inline">Prices</span>
          <Segmented size="sm" label="Prices shown" value={pv} onChange={onPriceDetail}
            options={[{ id: 'package', label: 'Package' }, { id: 'rooms', label: 'Room totals' }, { id: 'lines', label: 'Every line' }]} />
          {nAsks > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold tabular-nums">{nAsks} change{nAsks > 1 ? 's' : ''}{pv !== 'package' && delta !== 0 ? ` · ${delta > 0 ? '+' : '−'}${inr(Math.abs(delta))}` : ''}</span>}
          <Button size="sm" icon={X} onClick={onClose}>Exit</Button>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex">
        <nav className="hidden md:flex w-56 shrink-0 flex-col gap-0.5 p-3 border-r border-slate-200 bg-white overflow-auto" aria-label="Chapters">
          {chapters.map((c, i) => (
            <button key={c.key} type="button" onClick={() => setCh(i)} aria-current={i === ch ? 'step' : undefined}
              className={`text-left px-3 py-2 rounded-xl ${c.room ? 'pl-6 text-[13px]' : 'text-sm font-semibold'} ${i === ch ? 'bg-[#3D52A0] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{c.title}</button>
          ))}
        </nav>
        <main className="flex-1 min-w-0 overflow-auto">
          <div key={cur.key} className="max-w-[1120px] mx-auto px-5 md:px-8 py-8 hud-swap">{body}</div>
        </main>
      </div>
      <footer className="shrink-0 px-4 py-2.5 flex items-center justify-between bg-white border-t border-slate-200">
        <Button size="sm" icon={ChevronLeft} onClick={() => setCh(c => Math.max(0, c - 1))} disabled={ch === 0}>Back</Button>
        <span className="text-xs text-slate-500 tabular-nums">{ch + 1} of {chapters.length} · {cur.title}</span>
        <Button size="sm" variant="primary" icon={ChevronRight} onClick={() => (last ? onClose() : setCh(c => c + 1))}>{last ? 'Done' : 'Next'}</Button>
      </footer>
    </div>
  );
}
