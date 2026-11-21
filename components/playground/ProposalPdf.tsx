import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Download, Send, X, Globe } from 'lucide-react';
import { Button, Chip } from '../ui/kit';
import type { BoqItem, Item, ProjectContext, ProposalTier, TermsSettings, PaymentStructure } from '../../types';
import { scopeSplit, splitPricingOf, dealFor, complimentaryKeys, type OfferDiscount } from '../../lib/offers';
import { gstTermsOf, scheduleFor, type ScheduleStage } from '../../lib/paymentSchedule';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { isPlaygroundTier } from '../../lib/playground/pricing';
import { proposalValidity, discountsOf } from '../../lib/playground/deal';
import { optionChains, latestOf } from '../../lib/optionChains';
import { hasCivilWork } from '../../lib/annexure';
import type { MaterialSpecsBank } from '../../lib/materialSpecs';
import {
  CONCERNS, pageOrder, itemsOf, paginateRooms, separatePage, materialsPage, annexOf, homeRooms, proposalFileName,
  type PdfRoom, type PdfRow, type PdfAnnexSection, type PageKey,
} from '../../lib/playground/proposal';
import { buildProposalPdf } from '../../lib/proposalPdf';
import { proposalTimeline, civilDaysOf, briefHome, answersTo, othersDecide, roomIncludes } from '../../lib/playground/brief';
import { inr } from './playgroundUi';
import { useOrg } from '../../contexts/OrgContext';
import { studioDetailsOf, logoForPdf, addressLines, hasContact, shortWeb, shortInstagram } from '../../lib/playground/studio';

/*
  The first proposal, as a PDF (BOQ Playground PR P, as in the approved mockup).

  A preview of the A4 pages over the screen, with how they are shaped (the lead
  profile's main concern), Download PDF and Send on WhatsApp. Sending records
  the proposal on the project: the date it went, how long it holds, the version.
  No page draws the plan with pieces, and none shows a cost or a markup.
*/

const LABEL_SM = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
const dateOf = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const qtyOf = (q: number) => (Math.round(q * 100) / 100).toLocaleString('en-IN');

const Kicker = ({ children }: { children: React.ReactNode }) => <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#3D52A0]">{children}</div>;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-2xl font-extrabold text-slate-900 mt-2">{children}</h2>;

function Page({ n, foot, children }: { n: number; foot: string; children: React.ReactNode }) {
  return (
    <section className="ff-page relative bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,.35)] rounded-sm mx-auto w-full" style={{ maxWidth: 794, aspectRatio: '210 / 297' }} data-pdf-page={n}>
      <div className="absolute inset-0 p-8 md:p-12 flex flex-col overflow-hidden">
        {children}
        <div className="mt-auto pt-4 flex justify-between text-[10px] text-slate-400 border-t border-slate-100"><span>{foot}</span><span className="tabular-nums">{n}</span></div>
      </div>
    </section>
  );
}

const COLS = (
  <colgroup><col /><col style={{ width: 92 }} /><col style={{ width: 40 }} /><col style={{ width: 66 }} /><col style={{ width: 84 }} /></colgroup>
);
/* The quantity, with the size it is for above it: "6.2 ft × 5.5 ft" over "34.1". */
function QtyCell({ r }: { r: PdfRow }) {
  return (
    <td className="py-1.5 px-1 text-right tabular-nums text-[12px] text-slate-600 whitespace-nowrap" data-pdf-qty>
      {r.size && <div className="text-slate-800 font-semibold">{r.size}</div>}
      <div className={r.size ? 'text-[11px] text-slate-400' : ''}>{qtyOf(r.qty)}</div>
    </td>
  );
}
const HEAD = (
  <thead><tr className={`text-left ${LABEL_SM}`}><th className="py-1 pr-2">Item</th><th className="py-1 px-1 text-right">Qty</th><th className="py-1 px-1">Unit</th><th className="py-1 px-1 text-right">Rate</th><th className="py-1 pl-1 text-right">Amount</th></tr></thead>
);

function RowLine({ r }: { r: PdfRow }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-1.5 pr-2">
        <div className="text-[12px] text-slate-800 font-semibold">{r.name}{r.free && <span className="text-emerald-700 text-[11px] font-semibold"> complimentary</span>}</div>
        {r.sub && <div className="text-[11px] text-slate-400 leading-snug">{r.sub}</div>}
      </td>
      <QtyCell r={r} />
      <td className="py-1.5 px-1 text-[11px] text-slate-400">{r.unit}</td>
      <td className="py-1.5 px-1 text-right tabular-nums text-[12px] text-slate-600 whitespace-nowrap">{inr(r.rate)}</td>
      <td className="py-1.5 pl-1 text-right tabular-nums text-[12px] font-semibold whitespace-nowrap text-slate-800">
        {r.free ? <><span className="line-through text-slate-400 font-normal mr-1">{inr(r.amount)}</span>₹0</> : inr(r.amount)}
      </td>
    </tr>
  );
}

function RoomTable({ b, detail }: { b: PdfRoom; detail: PriceDetail }) {
  /* Every line: rate and amount. Room totals: the items, and the room's total. A package: the items only. */
  const lines = detail === 'lines';
  return (
    <div className="mt-4" data-pdf-room={b.name}>
      <div className="flex items-baseline justify-between"><h3 className="text-[15px] font-bold text-slate-800">{b.name}</h3>{b.size && <span className="text-[11px] text-slate-400">{b.size} from the brief</span>}</div>
      <table className="w-full mt-1" style={{ tableLayout: 'fixed' }}>
        {lines ? COLS : <colgroup><col /><col style={{ width: 92 }} /><col style={{ width: 40 }} /></colgroup>}
        {lines ? HEAD : <thead><tr className={`text-left ${LABEL_SM}`}><th className="py-1 pr-2">Item</th><th className="py-1 px-1 text-right">Qty</th><th className="py-1 px-1">Unit</th></tr></thead>}
        <tbody>
          {b.rows.map(r => <React.Fragment key={r.id}>{lines ? <RowLine r={r} /> : (
            <tr className="border-t border-slate-100 align-top">
              <td className="py-1.5 pr-2"><div className="text-[12px] text-slate-800 font-semibold">{r.name}{r.free && <span className="text-emerald-700 text-[11px] font-semibold"> complimentary</span>}</div>{r.sub && <div className="text-[11px] text-slate-400 leading-snug">{r.sub}</div>}</td>
              <QtyCell r={r} />
              <td className="py-1.5 px-1 text-[11px] text-slate-400">{r.unit}</td>
            </tr>
          )}</React.Fragment>)}
          {detail !== 'package' && <tr className="border-t-2 border-slate-200"><td colSpan={lines ? 4 : 2} className="py-1.5 text-[12px] font-bold text-slate-800">{b.name} total</td><td className="py-1.5 text-right tabular-nums text-[13px] font-black">{inr(b.total)}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export type PriceDetail = 'package' | 'rooms' | 'lines';

function StageTable({ title, figures, stages }: { title: string; figures: string; stages: ScheduleStage[] }) {
  return (
    <>
      <tr><td colSpan={4} className="pt-3 pb-1"><b className="text-slate-800 text-[12px]">{title}</b> <span className="text-[11px] text-slate-500 tabular-nums">· {figures}</span></td></tr>
      {stages.map(x => (
        <tr key={x.id} className="border-t border-slate-100 align-top">
          <td className="py-1 pr-1 font-bold text-slate-500 tabular-nums">{x.code}</td>
          <td className="py-1 pr-2"><b className="text-slate-800">{x.name}</b>{x.trigger && <span className="block text-[10px] text-slate-500">{x.trigger}</span>}</td>
          <td className="py-1 px-1 text-right tabular-nums text-slate-500">{x.fixed ? '' : `${x.pct}%`}</td>
          <td className="py-1 pl-1 text-right tabular-nums font-semibold text-slate-800">{inr(x.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function AnnexBlock({ s }: { s: PdfAnnexSection }) {
  const L = ({ xs, ordered }: { xs: string[]; ordered?: boolean }) => (ordered
    ? <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-[11px] text-slate-600 leading-snug">{xs.map((x, i) => <li key={i}>{x}</li>)}</ol>
    : <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[11px] text-slate-600 leading-snug">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul>);
  return (
    <div data-annex={s.n}>
      <h4 className="mt-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-800">{s.n} · {s.title}</h4>
      {s.text && <p className="text-[11px] text-slate-600 mt-1">{s.text}</p>}
      {s.table && (
        <table className="mt-1 w-full text-[11px]"><tbody>
          {s.table.map(([a, v], i) => (
            <tr key={a} className={`border-t ${i === s.table!.length - 1 ? 'border-slate-300 font-bold text-slate-800' : 'border-slate-100 text-slate-600'}`}><td className="py-0.5">{a}</td><td className="py-0.5 text-right tabular-nums">{inr(v)}</td></tr>
          ))}
        </tbody></table>
      )}
      {s.items && <L xs={s.items} ordered={s.ordered} />}
      {s.pair && (
        <div className="grid grid-cols-2 gap-4">
          {[s.pair.a, s.pair.b].map(([t, xs]) => <div key={t}><div className="text-[10px] font-bold text-slate-500 mt-1">{t}</div><L xs={xs} /></div>)}
        </div>
      )}
    </div>
  );
}

export interface ProposalPdfProps {
  ctx: ProjectContext;
  tier: ProposalTier;
  tiers: ProposalTier[];
  bankMap: Map<string, Item>;
  specBank?: MaterialSpecsBank | null;
  termsSettings?: TermsSettings | null;
  paymentStructure?: PaymentStructure | null;
  studioName: string;
  userName?: string;
  /** The lead profile's main concern: the page order it shapes. */
  concern?: string | null;
  /** The client has booked: the portal is open. */
  booked?: boolean;
  /** Who else decides, from the lead profile: anyone but "None" adds the one-page summary (PR B). */
  decisionMakers?: string | null;
  /** The project Timeline's programme (useProjectProgramme): the timeline's design and site days. */
  programme?: { designWorkDays?: number; siteWorkDays?: number } | null;
  /** How much price the client sees: every line, room totals, or a package (proposal.priceDetail). */
  priceDetail?: PriceDetail;
  /** Records the proposal as sent, on this version, shaped for this concern, at this price detail. */
  onSent: (via: 'whatsapp', shapedFor: string, priceDetail: PriceDetail) => void;
  /** Puts the client's copy in their portal (after booking). */
  onPublish?: () => Promise<void>;
  onClose: () => void;
}

export default function ProposalPdf({ ctx, tier, tiers, bankMap, specBank, termsSettings, paymentStructure, studioName, userName, concern: concern0, booked, decisionMakers, programme, priceDetail, onSent, onPublish, onClose }: ProposalPdfProps) {
  const detail: PriceDetail = priceDetail || ctx.proposal?.priceDetail || 'lines';
  const [concern, setConcern] = useState<string>(ctx.proposal?.shapedFor || concern0 || 'Itemized Costs');
  const [busy, setBusy] = useState<null | 'download' | 'send'>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  /* The studio, from Studio settings: its logo on the cover, its details on the closing page. */
  const { orgData } = useOrg();
  const studio = useMemo(() => studioDetailsOf(orgData as any, studioName), [orgData, studioName]);
  const [logo, setLogo] = useState(studio.logo);
  const [logoOk, setLogoOk] = useState(true);
  useEffect(() => {
    let live = true;
    setLogo(studio.logo); setLogoOk(true);
    if (studio.logo) logoForPdf(studio.logo).then(l => { if (live) setLogo(l); });
    return () => { live = false; };
  }, [studio.logo]);
  const studioLabel = studio.name || studioName;

  const m = useMemo(() => {
    const boq: BoqItem[] = tier.boq || [];
    const pricing = splitPricingOf(tier, ctx.rooms, bankMap);
    const summaryOf = (t: ProposalTier) => (isPlaygroundTier(t) ? playgroundTierSummary(t, bankMap, ctx) : t.summary);
    const summary = summaryOf(tier);
    const discounts = discountsOf(ctx) as OfferDiscount[];
    const terms = gstTermsOf(ctx);
    const deal = dealFor(summary, discounts, terms);
    const schedule = scheduleFor(ctx, { tierSummary: summary }, { paymentStructure });
    const validity = proposalValidity(ctx, termsSettings, Date.now(), tier.id);
    const free = complimentaryKeys(discounts.filter(d => d.basis?.tierId === tier.id));
    const items = itemsOf({ boq, bankMap, pricing, rooms: ctx.rooms || [], free, specBank });
    const options = optionChains(tiers).map(latestOf).map(t => (t.id === tier.id ? tier : t));
    const optionRows = options.map(t => ({ t, split: scopeSplit(t, bankMap, splitPricingOf(t, ctx.rooms, bankMap)), work: summaryOf(t)?.totalSell || 0 }));
    const offers = discounts.map(d => ({ name: d.name, value: d.type === 'percentage' ? (d.target === 'design' ? deal.fee : deal.sell) * (d.value / 100) : d.value }));
    const civil = hasCivilWork(boq.map(l => ({ ...l, name: bankMap.get(l.bankId)?.name, cat: bankMap.get(l.bankId)?.cat })));
    /* From booking (the day the proposal holds until) to the keys (PR B). */
    const timeline = proposalTimeline({ start: validity.until, programme, config: ctx.config, civil, civilDays: civilDaysOf(termsSettings), target: (ctx as any).targetHandoverDate });
    return {
      summary, deal, schedule, validity, items, options: optionRows, offers, civil, timeline,
      separate: separatePage(boq, bankMap),
      materials: materialsPage(specBank, options, tier.id),
      home: briefHome(ctx),
      answers: answersTo(ctx.clientBrief, boq, bankMap, ctx.rooms || []),
      annex: annexOf({
        terms: termsSettings, studioName, gstRate: terms.rate, after: Math.max(0, deal.sell - deal.execOff), fee: deal.fee - deal.designOff, gst: deal.gst, total: deal.clientPays,
        initiationFee: schedule.initiationFee, boq, bankMap, validDays: validity.days, issued: validity.from,
        programme: { siteDays: timeline.siteDays, designDays: timeline.designDays, civilDays: timeline.civilDays },
      }),
    };
  }, [tier, tiers, ctx, bankMap, specBank, termsSettings, paymentStructure, studioName, programme]);

  const { deal, schedule: sc, validity: v, items } = m;
  const project = ctx.name || 'Your home';
  const foot = `${studioLabel} · ${project} · First proposal`;
  const after = Math.max(0, deal.sell - deal.execOff);
  const fee = deal.fee - deal.designOff;
  const roomNames = items.rooms.map(r => r.name);
  const flatOf = (byRoom: Record<string, number>) => Object.entries(byRoom).filter(([n]) => !roomNames.includes(n)).reduce((a, [, x]) => a + x, 0);

  /* Each page's content, by its key; a page with nothing to say is left out. */
  const pages: Partial<Record<PageKey, React.ReactNode[]>> = {};
  const showLogo = !!logo && logoOk;
  pages.cover = [(
    <div className="flex-1 flex flex-col" key="c">
    <div className="flex items-center justify-between gap-4" data-pdf-masthead>
      {showLogo
        ? <img src={logo} alt={studioLabel} data-pdf-logo className="h-14 max-w-[220px] object-contain object-left" onError={() => setLogoOk(false)} />
        : <span className="text-xl font-extrabold tracking-tight text-slate-900" data-pdf-wordmark>{studioLabel}</span>}
      {studio.tagline && <span className="text-[11px] text-slate-500 text-right max-w-[240px]">{studio.tagline}</span>}
    </div>
    <div className="flex-1 flex flex-col justify-center">
      <Kicker>Interior design proposal</Kicker>
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mt-3">{project}</h1>
      <p className="text-lg text-slate-500 mt-2">{[ctx.location, ctx.config, Number(ctx.area) ? `${Number(ctx.area).toLocaleString('en-IN')} sq ft carpet` : ''].filter(Boolean).join(' · ')}</p>
      {(ctx as any).theme && <p className="mt-4 text-[13px] text-slate-600">Style: {(ctx as any).theme}</p>}
      <div className="mt-10 grid grid-cols-2 gap-6 text-sm">
        {([['Prepared for', ctx.clientName || '—'], ['Prepared by', [userName, studioLabel].filter(Boolean).join(', ')], ['Date', dateOf(v.from)]] as [string, string][]).map(([a, b]) => (
          <div key={a}><div className={LABEL_SM}>{a}</div><div className="font-semibold text-slate-800 mt-1">{b}</div></div>
        ))}
        <div><div className={LABEL_SM}>Valid until</div><div className="font-semibold text-slate-800 mt-1">{dateOf(v.until)} <span className="font-normal text-slate-400">· {v.days} days</span></div></div>
      </div>
    </div>
    </div>
  )];
  /* The brief (PR B): the client's words, how the proposal answers them, their home, what design includes, and the timeline. */
  const T = m.timeline;
  const timelineBlock = (
    <div className="mt-4" data-pdf-timeline>
      <div className={LABEL_SM}>Your timeline</div>
      <div className="mt-2 space-y-1.5">
        {T.rows.map(r => (
          <div key={r.name} className="grid items-center gap-2 text-[11px]" style={{ gridTemplateColumns: '168px 104px minmax(0,1fr)' }}>
            <span className="text-slate-700 font-semibold">{r.name}</span>
            <span className="text-slate-500 tabular-nums">{shortDate(r.start)} – {shortDate(r.end)}</span>
            <span className="relative h-3 rounded bg-slate-100"><span className="absolute inset-y-0 rounded bg-[#3D52A0]" style={{ left: `${(r.offset / T.total) * 100}%`, width: `${(r.days / T.total) * 100}%` }} /></span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-slate-700">
        Book by <b>{dateOf(v.until)}</b> and your home is handed back by <b>{dateOf(T.handover)}</b>
        {T.target && T.weeksLate !== null ? (T.weeksLate <= 0 ? `, in time for your ${dateOf(T.target)} target` : `, about ${T.weeksLate} week${T.weeksLate > 1 ? 's' : ''} after your ${dateOf(T.target)} target`) : ''}.
        {T.civil && T.civilDays > 0 ? ` Civil work adds ${T.civilDays} working days: the bathrooms are rebuilt and waterproofed before carpentry goes in.` : ''}
        {' '}Durations are working days, Sundays off, {T.fromTimeline ? 'from the project Timeline' : 'from our standard programme'}.
      </p>
    </div>
  );
  const H = m.home;
  const timelineFirst = concern === 'Timeline';
  pages.brief = [(
    <React.Fragment key="brief">
      <Kicker>Your brief</Kicker><H2>What you told us</H2>
      {ctx.clientBrief?.trim() && (
        <blockquote className="mt-3 border-l-4 border-[#3D52A0] pl-4 text-[14px] text-slate-700 italic leading-relaxed" data-pdf-quote>
          “{ctx.clientBrief.trim()}”
          <span className="block not-italic text-[11px] text-slate-500 mt-1">{ctx.clientName || 'You'}, at our first meeting</span>
        </blockquote>
      )}
      {timelineFirst && timelineBlock}
      {m.answers.length > 0 && (
        <div className="mt-4">
          <div className={LABEL_SM}>How this proposal answers it</div>
          <div className="mt-1.5 space-y-1.5">
            {m.answers.map(a => <div key={a.topic} className="flex gap-2 text-[12px]"><span className="text-emerald-700 font-bold">✓</span><span><b className="text-slate-800">{a.topic}.</b> <span className="text-slate-600">{a.text}</span></span></div>)}
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className={LABEL_SM}>Your home</div>
          {H.line && <div className="text-[13px] font-semibold text-slate-800 mt-1">{H.line}</div>}
          {H.status && <div className="text-[12px] text-slate-600">{H.status}</div>}
          <div className="mt-2 flex flex-wrap gap-1">{H.scope.map(s => <span key={s.label} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.on ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-100 text-slate-400 line-through'}`}>{s.label}</span>)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className={LABEL_SM}>Your style</div>
          <div className="text-[13px] font-semibold text-slate-800 mt-1">{H.style || 'To be set with you at the first design meeting'}</div>
        </div>
      </div>
      {H.deliver.length > 0 && (
        <div className="mt-4">
          <div className={LABEL_SM}>What design includes</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">{H.deliver.map(d => <span key={d.label} className={d.on ? 'text-slate-700' : 'text-slate-400'}>{d.on ? '✓' : '—'} {d.label}{d.on ? '' : ', not in this scope'}</span>)}</div>
        </div>
      )}
      {!timelineFirst && timelineBlock}
    </React.Fragment>
  )];
  /* The proposal on one page, for everyone in the family who decides (PR B). */
  if (othersDecide(decisionMakers)) {
    const saved = deal.execOff + deal.designOff;
    pages.sum = [(
      <React.Fragment key="sum">
        <Kicker>On one page</Kicker><H2>The proposal in a minute</H2>
        <p className="text-[12px] text-slate-500 mt-1">For everyone in the family who decides with you. The pages after this one list every item.</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {([['Your investment', inr(deal.clientPays), `${tier.name}, all in with GST`], ['You save', inr(saved), `offers valid until ${dateOf(v.until)}`], ['To book', inr(sc.booking), `${sc.design.stages[0]?.code || 'D1'} of the design fee, with GST`]] as [string, string, string][]).map(([a, b, c], i) => (
            <div key={a} className={`rounded-lg p-3 ${i ? 'border border-slate-200' : 'bg-[#3D52A0] text-white'}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider ${i ? 'text-slate-500' : 'text-white/80'}`}>{a}</div>
              <div className="text-xl font-black tabular-nums mt-1" data-pdf-sum={a}>{b}</div>
              <div className={`text-[10px] ${i ? 'text-slate-500' : 'text-white/80'}`}>{c}</div>
            </div>
          ))}
        </div>
        <table className="mt-5 w-full text-[12px]" style={{ tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: 130 }} /><col />{detail !== 'package' && <col style={{ width: 96 }} />}</colgroup>
          <thead><tr className={`text-left ${LABEL_SM}`}><th className="py-1">Room</th><th className="py-1">What it includes</th>{detail !== 'package' && <th className="py-1 text-right">Amount</th>}</tr></thead>
          <tbody>
            {items.rooms.map(r => (
              <tr key={r.name} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 font-semibold text-slate-800">{r.name}</td>
                <td className="py-1.5 pr-2 text-slate-600">{roomIncludes(tier.boq || [], bankMap, r.name)}</td>
                {detail !== 'package' && <td className="py-1.5 text-right tabular-nums font-semibold">{inr(r.total)}</td>}
              </tr>
            ))}
            {items.flat && (
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 font-semibold text-slate-800">Across the flat</td>
                <td className="py-1.5 pr-2 text-slate-600">{[...new Set(items.flat.rows.map(x => x.name))].join(', ')}</td>
                {detail !== 'package' && <td className="py-1.5 text-right tabular-nums font-semibold">{inr(items.flat.total)}</td>}
              </tr>
            )}
            {detail !== 'package' && <tr className="border-t-2 border-slate-300"><td colSpan={2} className="py-1.5 font-bold text-slate-800">The work, {tier.name}</td><td className="py-1.5 text-right tabular-nums font-black">{inr(items.work)}</td></tr>}
          </tbody>
        </table>
        {m.options.length > 1 && detail !== 'package' && (
          <div className="mt-4 grid gap-2 text-[11px]" style={{ gridTemplateColumns: `repeat(${m.options.length}, minmax(0, 1fr))` }}>
            {m.options.map(o => <div key={o.t.id} className={`rounded-md border px-2 py-1.5 ${o.t.id === tier.id ? 'border-[#3D52A0]' : 'border-slate-200'}`}><b className="text-slate-800">{o.t.name}</b><div className="tabular-nums text-slate-600">{inr(o.work)}, the work</div></div>)}
          </div>
        )}
        <p className="mt-4 text-[12px] text-slate-700">Book by <b>{dateOf(v.until)}</b>; your home is handed back by <b>{dateOf(T.handover)}</b>.</p>
      </React.Fragment>
    )];
  }
  pages.how = [(
    <React.Fragment key="h">
      <Kicker>How we work</Kicker><H2>From this proposal to your keys</H2>
      <ol className="mt-5 space-y-3">
        {[['This proposal', 'What each room includes, the materials, the options and the price'], ['Booking', 'You choose how we work together and pay the booking amount; your portal login follows'], ['Site measurement', 'We measure every room'], ['Layout and design', 'Space planning, then 3D, until you approve the design'], ['Detailed BOQ', 'Every line, size and specification, approved by you in your portal'], ['Execution and handover', 'Built to the approved BOQ, with progress in your portal']].map(([t, d], i) => (
          <li key={t} className="flex gap-3"><span className="w-7 h-7 rounded-full bg-[#3D52A0] text-white text-xs font-bold grid place-items-center shrink-0">{i + 1}</span><span><b className="block text-[14px] text-slate-800">{t}</b><span className="text-[12px] text-slate-500">{d}</span></span></li>
        ))}
      </ol>
    </React.Fragment>
  )];
  const plan = ctx.planSheet?.imageUrl && ctx.planSheet.source !== 'blocks' && ctx.planSheet.source !== 'sketch' ? ctx.planSheet.imageUrl : null;
  pages.home = [(
    <React.Fragment key="home">
      <Kicker>Your home</Kicker><H2>{plan ? 'As in your builder’s plan' : 'Room by room, from the brief'}</H2>
      <p className="text-[12px] text-slate-500 mt-1">{plan ? 'Shown as you gave it to us. Nothing is placed on it yet: the layout comes after site measurement.' : 'The rooms and their sizes as we have them. The layout comes after site measurement.'}</p>
      {/* The builder's plan as the client gave it: never the plan with pieces drawn on it (the drawing gate). */}
      {plan && <div className="mt-4 rounded-lg border border-slate-200 overflow-hidden"><img src={plan} crossOrigin="anonymous" alt={`The builder’s plan of ${project}, as the client shared it`} className="w-full h-auto block max-h-[520px] object-contain" /></div>}
      <table className="mt-4 w-full text-[12px]"><thead><tr className={`text-left ${LABEL_SM}`}><th className="py-1">Room</th><th className="py-1 text-right">Size from the brief</th></tr></thead>
        <tbody>{homeRooms(ctx.rooms || []).map(r => <tr key={r.name} className="border-t border-slate-100"><td className="py-1 text-slate-700">{r.name}</td><td className="py-1 text-right tabular-nums text-slate-600">{r.size}</td></tr>)}</tbody>
      </table>
    </React.Fragment>
  )];
  const blocks = [...items.rooms, ...(items.flat ? [items.flat] : [])];
  pages.items = paginateRooms(blocks).map((grp, i, all) => (
    <React.Fragment key={`i${i}`}>
      <Kicker>Item by item</Kicker><H2>{i ? 'Room by room, continued' : 'Room by room'}</H2>
      {!i && <p className="text-[12px] text-slate-500 mt-1">{tier.name}, the recommended option. Sizes and quantities are allowances from the brief; the final ones follow site measurement and the approved design.{detail === 'package' ? ' The price is the package, on the investment page.' : ` Offers are applied on the investment page.${detail === 'lines' ? ' Each amount is rounded up to the nearest ₹100.' : ''}`}</p>}
      {grp.map(b => <React.Fragment key={b.name}><RoomTable b={b} detail={detail} /></React.Fragment>)}
      {i === all.length - 1 && detail !== 'package' && <div className="mt-4 pt-3 border-t-2 border-slate-800 flex items-baseline justify-between"><span className="font-bold text-slate-800">The work, {tier.name}</span><b className="tabular-nums text-lg" data-pdf-work>{inr(items.work)}</b></div>}
    </React.Fragment>
  ));
  if (m.separate) {
    const s = m.separate;
    const tbl = (rows: typeof s.actuals, last: string) => (
      <table className="mt-2 w-full text-[12px]" style={{ tableLayout: 'fixed' }}>
        <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 120 }} /></colgroup>
        <thead><tr className={`text-left ${LABEL_SM}`}><th className="py-1">Item</th><th className="py-1">Room</th><th className="py-1 text-right">{last}</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.line.id} className="border-t border-slate-100 align-top"><td className="py-1.5 pr-2"><div className="font-semibold text-slate-800">{r.name}</div>{r.words && <div className="text-[11px] text-slate-500">{r.words}</div>}</td><td className="py-1.5 text-slate-600">{r.room}</td><td className="py-1.5 text-right tabular-nums text-slate-700">{r.estimate !== null ? `≈ ${inr(r.estimate)}` : 'Your choice'}</td></tr>
        ))}</tbody>
      </table>
    );
    pages.sep = [(
      <React.Fragment key="sep">
        <Kicker>Separate from the price</Kicker><H2>Bought by you, and at actuals</H2>
        <p className="text-[12px] text-slate-500 mt-1">These are part of the design: we plan the space, points and fixings for them. They are not in your investment, the offers, GST or the payment schedule.</p>
        {s.actuals.length > 0 && <div className="mt-5"><div className="font-bold text-slate-800 text-[14px]">At actuals</div><p className="text-[11px] text-slate-500">We choose them with you and manage the vendor; you pay the vendor directly at actual cost. The figures are estimates.</p>{tbl(s.actuals, 'Estimate')}<div className="mt-1 text-right text-[12px] text-slate-600">Estimated <b className="tabular-nums">≈ {inr(s.estimate)}</b></div></div>}
        {s.client.length > 0 && <div className="mt-5"><div className="font-bold text-slate-800 text-[14px]">Bought by you</div><p className="text-[11px] text-slate-500">You choose and buy these; we help you pick and plan around them.</p>{tbl(s.client, '')}</div>}
      </React.Fragment>
    )];
  }
  if (m.materials) {
    const mt = m.materials;
    pages.mat = [(
      <React.Fragment key="mat">
        <Kicker>Materials and brands</Kicker><H2>{mt.options.length === 3 ? 'Three ways to finish it' : mt.options.length === 1 ? 'How it is finished' : `${mt.options.length} ways to finish it`}</H2>
        <p className="text-[12px] text-slate-500 mt-1">The same rooms and pieces in each option. What changes is the material, named with its brand or equivalent.</p>
        <table className="mt-4 w-full text-[11px]" style={{ tableLayout: 'fixed' }}>
          <thead><tr className="text-left"><th className={`py-2 w-[22%] ${LABEL_SM}`}>Part</th>{mt.options.map(o => <th key={o.name} className={`py-2 pr-2 text-[12px] font-bold ${o.recommended ? 'text-[#3D52A0]' : 'text-slate-800'}`}>{o.name}{o.recommended && <span className="font-semibold text-[10px]"> · recommended</span>}</th>)}</tr></thead>
          <tbody>{mt.rows.map(r => (
            <tr key={r.part} className="border-t border-slate-100 align-top"><td className="py-2 font-semibold text-slate-700">{r.part}</td>
              {r.cells.map((c, i) => <td key={i} className={`py-2 pr-2 ${mt.options[i].recommended ? 'bg-[#3D52A0]/[0.04]' : ''}`}>{c ? <><span className="text-slate-800">{c.words}</span>{c.brand && <span className="block text-slate-400">{c.brand}</span>}{c.range && <span className="block text-slate-500">{c.range}</span>}</> : '—'}</td>)}
            </tr>
          ))}</tbody>
        </table>
        {mt.ranges.length > 0 && (
          <div className="mt-5 rounded-lg border border-slate-200 p-4">
            <div className="font-bold text-slate-800 text-[13px]">Every finish is a range, not one shade</div>
            <p className="text-[11px] text-slate-500 mt-0.5">The pictures show one shade from each range. You choose the exact shade at Selections, from sample boards in the studio, after you approve the design. Any shade within a range costs the same.</p>
            <div className="mt-3 grid grid-cols-5 gap-2">{mt.ranges.slice(0, 5).map(r => (
              <div key={r.name}><div className="flex flex-wrap gap-0.5">{r.hexes.map((h, i) => <span key={i} className="w-3.5 h-3.5 rounded-full border border-slate-200" style={{ background: h }} />)}</div><div className="text-[11px] font-bold text-slate-800 mt-1 leading-tight">{r.name}</div><div className="text-[10px] text-slate-500">{r.count}+ {r.unit}</div></div>
            ))}</div>
          </div>
        )}
      </React.Fragment>
    )];
  }
  pages.inv = [(
    <React.Fragment key="inv">
      <Kicker>Your investment</Kicker><H2>{m.options.length > 1 ? `${m.options.length === 3 ? 'Three' : m.options.length} options, one recommended` : 'What it comes to'}</H2>
      {m.options.length > 1 && detail !== 'package' && (
        <>
          <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${m.options.length}, minmax(0, 1fr))` }}>{m.options.map(o => (
            <div key={o.t.id} className={`rounded-lg border-2 p-3 ${o.t.id === tier.id ? 'border-[#3D52A0]' : 'border-slate-200'}`}><div className="text-[12px] font-bold text-slate-800">{o.t.name}</div><div className="text-lg font-black tabular-nums mt-1">{inr(o.work)}</div><div className="text-[10px] text-slate-500">the work, before offers and GST</div></div>
          ))}</div>
          <table className="mt-4 w-full text-[12px]" style={{ tableLayout: 'fixed' }}>
            <thead><tr className={`text-left ${LABEL_SM}`}><th className="py-1">Room</th>{m.options.map(o => <th key={o.t.id} className={`py-1 text-right ${o.t.id === tier.id ? 'text-[#3D52A0]' : ''}`}>{(o.t.name || '').split(' ')[0]}</th>)}</tr></thead>
            <tbody>
              {[...roomNames, ...(m.options.some(o => flatOf(o.split.byRoom) > 0) ? ['Across the flat'] : [])].map(n => (
                <tr key={n} className="border-t border-slate-100"><td className="py-1 text-slate-700">{n}</td>{m.options.map(o => <td key={o.t.id} className={`py-1 text-right tabular-nums ${o.t.id === tier.id ? 'font-bold text-slate-800 bg-[#3D52A0]/[0.04]' : 'text-slate-600'}`}>{inr(n === 'Across the flat' ? flatOf(o.split.byRoom) : o.split.byRoom[n] || 0)}</td>)}</tr>
              ))}
              <tr className="border-t-2 border-slate-300"><td className="py-1.5 font-bold text-slate-800">The work</td>{m.options.map(o => <td key={o.t.id} className={`py-1.5 text-right tabular-nums font-black ${o.t.id === tier.id ? 'bg-[#3D52A0]/[0.04]' : ''}`}>{inr(o.work)}</td>)}</tr>
            </tbody>
          </table>
        </>
      )}
      <div className="mt-6 text-[13px]">
        <div className="font-bold text-slate-800 mb-1">{tier.name}, all in</div>
        <div className="flex justify-between py-1.5 border-b border-slate-100"><span>The work</span><b className="tabular-nums">{inr(deal.sell)}</b></div>
        {m.offers.map(o => <div key={o.name} className="flex justify-between py-1.5 border-b border-slate-100 text-emerald-700"><span>{o.name}</span><b className="tabular-nums">−{inr(o.value)}</b></div>)}
        <div className="flex justify-between py-1.5 border-b border-slate-100"><span>Design fee</span><b className="tabular-nums">{inr(deal.fee)}</b></div>
        <div className="flex justify-between py-1.5 border-b border-slate-100"><span>GST {gstTermsOf(ctx).rate}%</span><b className="tabular-nums">{inr(deal.gst)}</b></div>
        <div className="flex justify-between items-baseline pt-3"><span className="text-base font-bold">Your investment</span><b className="text-2xl font-black tabular-nums" data-pdf-pays>{inr(deal.clientPays)}</b></div>
        {deal.execOff + deal.designOff > 0 && <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-emerald-800 font-semibold">You save {inr(deal.execOff + deal.designOff)}. Offers valid until {dateOf(v.until)}.</div>}
      </div>
    </React.Fragment>
  )];
  pages.next = [(
    <React.Fragment key="next">
      <Kicker>Next step</Kicker><H2>How you would like to work with us</H2>
      <div className="mt-4 space-y-2.5">{[['Turnkey (recommended)', 'Design, materials, labour and quality, from design to handover. The price in this proposal.'], ['Design + PMC', 'We design and manage your contractors.'], ['Design only', 'We design; your team executes.']].map(([t, d], i) => (
        <div key={t} className={`rounded-lg border p-3 ${i ? 'border-slate-200' : 'border-[#3D52A0] bg-[#3D52A0]/[0.04]'}`}><b className="text-[13px] text-slate-800">{t}</b><p className="text-[12px] text-slate-500">{d}</p></div>
      ))}</div>
      <div className="mt-5">
        <div className="font-bold text-slate-800 text-[14px]">How you pay, for Turnkey</div>
        <p className="text-[11px] text-slate-500">Two schedules: one for the design fee, one for the work. Each amount includes GST{sc.gstRate ? ` at ${sc.gstRate}%` : ''}.</p>
        <table className="w-full text-[11px] mt-1" style={{ tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 44 }} /><col style={{ width: 96 }} /></colgroup>
          <tbody>
            <StageTable title="Design fee" figures={`${inr(fee)} + GST = ${inr(sc.design.total)}`} stages={sc.design.stages} />
            {sc.execution.stages.length > 0 && <StageTable title="The work" figures={`${inr(after)} after offers + GST = ${inr(sc.execution.total)}`} stages={sc.execution.stages} />}
            <tr className="border-t-2 border-slate-300"><td colSpan={3} className="py-1.5 font-bold text-slate-800 text-[12px]">Together</td><td className="py-1.5 text-right tabular-nums font-black text-[13px]">{inr(sc.total)}</td></tr>
          </tbody>
        </table>
        <div className="mt-3 rounded-md bg-[#3D52A0]/[0.06] px-3 py-2 text-[12px] text-slate-700"><b>To book:</b> {sc.design.stages[0]?.code || 'D1'}, {inr(sc.booking)}{sc.initiationFee > 0 ? ` (${inr(sc.design.stages[0]?.amount || 0)} less the ${inr(sc.initiationFee)} Project Initiation Fee you have paid)` : `, which is ${sc.design.stages[0]?.pct || 0}% of the design fee with GST`}. Your portal login follows the booking.</div>
        <p className="mt-2 text-[11px] text-slate-500">Design + PMC or Design only: the design-fee schedule applies and you pay your contractors directly; any PMC fee is set out in the agreement.</p>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Sizes are allowances from the brief. Final quantities follow site measurement and the approved design, in a Detailed BOQ you approve before work starts. Terms are in Annexure A.</p>
    </React.Fragment>
  )];
  const half = m.annex.findIndex(s => s.n === 7);
  pages.annex = [
    <React.Fragment key="a1"><Kicker>Annexure A</Kicker><H2>Commercial terms and conditions</H2><p className="text-[11px] text-slate-500 mt-1">Part of this proposal. Where it differs from the studio’s general terms for this project, this annexure prevails.</p>{m.annex.slice(0, half).map(s => <React.Fragment key={s.n}><AnnexBlock s={s} /></React.Fragment>)}</React.Fragment>,
    <React.Fragment key="a2"><Kicker>Annexure A, continued</Kicker>{m.annex.slice(half).map(s => <React.Fragment key={s.n}><AnnexBlock s={s} /></React.Fragment>)}
      <div className="mt-6 grid grid-cols-2 gap-8 text-[11px] text-slate-500"><div className="border-t border-slate-300 pt-1">{ctx.clientName || 'Client'} · date</div><div className="border-t border-slate-300 pt-1">For {studioLabel}{studio.signatory.name && <div className="text-slate-700 font-semibold mt-0.5">{studio.signatory.name}{studio.signatory.title ? `, ${studio.signatory.title}` : ''}</div>}</div></div>
    </React.Fragment>,
  ];
  /* The studio closes the proposal: who it is and how to reach it, from Studio settings (Studio identity and Money). */
  const contact: [string, React.ReactNode][] = ([
    ['Phone', studio.phone],
    ['Email', studio.email],
    ['Website', studio.website && shortWeb(studio.website)],
    ['Instagram', studio.instagram && shortInstagram(studio.instagram)],
  ] as [string, string][]).filter(([, x]) => !!x);
  const address = addressLines(studio);
  if (studioLabel && (hasContact(studio) || showLogo)) pages.studio = [(
    <div className="flex-1 flex flex-col" key="studio" data-pdf-studio>
      <div className="flex-1 flex flex-col justify-center">
        {showLogo
          ? <img src={logo} alt={studioLabel} className="h-20 max-w-[280px] object-contain object-left" onError={() => setLogoOk(false)} />
          : <div className="text-3xl font-extrabold tracking-tight text-slate-900">{studioLabel}</div>}
        {studio.tagline && <p className="text-[15px] text-slate-500 mt-3">{studio.tagline}</p>}
        <div className="mt-10"><Kicker>Thank you</Kicker></div>
        <p className="text-[13px] text-slate-600 mt-2 max-w-[460px]">
          {ctx.clientName ? `${ctx.clientName}, thank` : 'Thank'} you for considering {studioLabel} for {project}. We would be glad to talk it through, change what you would like changed, and begin when you are ready.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 text-[13px]">
          {address.length > 0 && (
            <div><div className={LABEL_SM}>Studio</div>
              {studio.legalName && studio.legalName !== studioLabel && <div className="font-semibold text-slate-800 mt-1">{studio.legalName}</div>}
              <div className="text-slate-700 mt-1 leading-snug">{address.map(l => <div key={l}>{l}</div>)}</div>
            </div>
          )}
          {contact.length > 0 && (
            <div><div className={LABEL_SM}>Reach us</div>
              <div className="mt-1 space-y-0.5">{contact.map(([k, x]) => <div key={k} className="text-slate-700"><span className="text-slate-400">{k}</span> <span className="font-semibold text-slate-800">{x}</span></div>)}</div>
            </div>
          )}
          {(studio.signatory.name || userName) && (
            <div><div className={LABEL_SM}>Your contacts</div>
              <div className="mt-1 space-y-0.5 text-slate-700">
                {userName && <div><span className="font-semibold text-slate-800">{userName}</span>, who prepared this proposal</div>}
                {studio.signatory.name && studio.signatory.name !== userName && <div><span className="font-semibold text-slate-800">{studio.signatory.name}</span>{studio.signatory.title ? `, ${studio.signatory.title}` : ''}</div>}
              </div>
            </div>
          )}
          {studio.gstin && <div><div className={LABEL_SM}>GSTIN</div><div className="font-semibold text-slate-800 mt-1 tabular-nums">{studio.gstin}</div></div>}
        </div>
        {studio.credentials.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">{studio.credentials.map(c => <span key={c} className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{c}</span>)}</div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">This proposal holds until {dateOf(v.until)}. Its terms are in Annexure A.</p>
    </div>
  )];

  /* The one-page summary only when others decide too; the brief always (PR B). */
  const order = pageOrder(concern, othersDecide(decisionMakers));
  const sheets = order.flatMap(k => pages[k] || []);

  const build = async () => {
    if (!root.current) throw new Error('The pages are not on screen');
    const pdf = await buildProposalPdf(root.current, 'portrait');
    /* A page that could not be drawn comes out as nothing: never hand the client a file short of pages. */
    const got = (pdf as any).getNumberOfPages?.() ?? sheets.length;
    if (got < sheets.length) throw new Error(`only ${got} of ${sheets.length} pages could be drawn. Close the preview, open it again and retry`);
    return pdf;
  };
  const name = proposalFileName(project, v.from);
  const download = async () => {
    setBusy('download'); setProblem(null);
    try { (await build()).save(name); } catch (e: any) { setProblem(`The PDF could not be made: ${e?.message || e}`); } finally { setBusy(null); }
  };
  const send = async () => {
    setBusy('send'); setProblem(null);
    try {
      const pdf = await build();
      const file = new File([pdf.output('blob')], name, { type: 'application/pdf' });
      const text = `${project}: our proposal for ${tier.name}, valid until ${dateOf(v.until)}.`;
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] }) && nav.share) await nav.share({ files: [file], title: name, text });
      else { pdf.save(name); window.open(`https://wa.me/?text=${encodeURIComponent(`${text} The PDF is attached.`)}`, '_blank', 'noopener'); }
      onSent('whatsapp', concern, detail);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setProblem(`It was not sent: ${e?.message || e}`);
    } finally { setBusy(null); }
  };

  /*
    Over the whole page, at the top of the document: nothing it sits inside
    (a panel marked no-print, a transformed or scrolled container) can hide
    or move what is shown and captured.
  */
  return createPortal(
    <div className="fixed inset-0 z-[350] flex flex-col phd-scrim bg-slate-100" role="dialog" aria-modal="true" aria-label="First proposal PDF preview">
      <header className="shrink-0 px-4 py-2.5 flex items-center gap-3 flex-wrap bg-white border-b border-slate-200">
        <span className="w-9 h-9 rounded-xl bg-[#3D52A0] text-white grid place-items-center"><FileText className="w-4 h-4" aria-hidden /></span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-800">First proposal · PDF</div>
          <div className="text-[11px] text-slate-500">{tier.name} · {sheets.length} pages · {detail === 'lines' ? 'every line priced' : detail === 'rooms' ? 'room totals' : 'a package price'} · valid {v.days} days · Annexure A from Terms & Payment{m.civil ? ' · renovation terms' : ''}</div>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500" title="The lead profile’s main concern. It changes the page order.">Shaped for
          <select value={concern} onChange={e => setConcern(e.target.value)} className="px-1.5 py-1 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-700">
            {CONCERNS.map(o => <option key={o}>{o}</option>)}
          </select>
        </label>
        {othersDecide(decisionMakers) && <Chip tone="brand">{decisionMakers} also decide: one-page summary added</Chip>}
        {v.issued && <Chip tone={v.expired ? 'warn' : 'good'}>{v.expired ? `Expired ${dateOf(v.until)}` : `Sent ${dateOf(v.from)}`}</Chip>}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* The first proposal never draws the plan with pieces, whatever the layout's state: the builder's plan only. */}
          <Chip tone="slate" title="The builder’s plan, unmarked. Drawings reach the client only after the layout is approved.">No drawing: the builder’s plan only</Chip>
          <Button size="sm" icon={Download} onClick={download} disabled={!!busy}>{busy === 'download' ? 'Making the PDF…' : 'Download PDF'}</Button>
          <Button size="sm" icon={Send} onClick={send} disabled={!!busy}>{busy === 'send' ? 'Making the PDF…' : 'Send on WhatsApp'}</Button>
          {booked && onPublish
            ? <Button size="sm" icon={Globe} onClick={async () => { setBusy('send'); setProblem(null); try { await onPublish(); } catch (e: any) { setProblem(`The portal was not updated: ${e?.message || e}`); } finally { setBusy(null); } }} disabled={!!busy}>Put in the portal</Button>
            : !booked && <span className="text-[11px] text-slate-400 max-w-[180px] leading-tight">Portal: after the client books</span>}
          <Button size="sm" icon={X} onClick={onClose}>Close</Button>
        </div>
      </header>
      {problem && <div role="alert" className="shrink-0 px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs font-semibold text-rose-700">{problem}</div>}
      <main className="flex-1 min-h-0 overflow-auto px-3 py-6">
        <div ref={root} className="hud-swap space-y-6">
          {sheets.map((body, i) => <React.Fragment key={i}><Page n={i + 1} foot={foot}>{body}</Page></React.Fragment>)}
        </div>
      </main>
    </div>,
    document.body,
  );
}

