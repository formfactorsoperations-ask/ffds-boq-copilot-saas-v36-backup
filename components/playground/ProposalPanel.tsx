import React, { useMemo, useState } from 'react';
import { FileText, Play, Send, AlertTriangle } from 'lucide-react';
import { Button, Segmented, LABEL } from '../ui/kit';
import type { Item, ProjectContext, ProposalTier, PaymentStructure, TermsSettings } from '../../types';
import type { MaterialSpecsBank } from '../../lib/materialSpecs';
import { gradeOf } from '../../lib/lineSpecs';
import { specTable } from '../../lib/playground/proposal';
import { issueProposal } from '../../lib/playground/proposal';
import { proposalValidity, bookingOf, withBooking, type BookWith } from '../../lib/playground/deal';
import { scheduleFor } from '../../lib/paymentSchedule';
import { isPlaygroundTier } from '../../lib/playground/pricing';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { inr } from './playgroundUi';
import type { Journey } from '../../lib/playground/meeting';
import ProposalPdf, { type PriceDetail } from './ProposalPdf';
import MeetingView from './MeetingView';

/*
  The Client Proposal, built from the Playground (BOQ Playground PR P, as in
  the approved mockup's Client proposal screen).

  For a project whose proposal is a Playground version: the first-proposal PDF,
  the meeting view once the layout is approved, publishing to the client's
  portal once they have booked, and one switch for how much price detail the
  client sees. Under it, the material specifications, built from the BOQ.
*/

const TILES: [string, string][] = [
  ['Cover', 'Project, date, offer validity'], ['How we work', 'Credentials and the journey'], ['Your home', 'The builder’s plan, unmarked'],
  ['Item by item', 'Each item: allowance, qty, rate, amount'], ['Room totals', 'A subtotal under every room'], ['Materials', 'The options, brands named'],
  ['Investment', 'Options room by room, offers, fee, GST'], ['Next step', 'Engagement, payment, booking'],
];

export interface ProposalPanelProps {
  ctx: ProjectContext;
  setCtx: React.Dispatch<React.SetStateAction<ProjectContext>>;
  /** The option the proposal is for: its newest version. */
  tier: ProposalTier;
  tiers: ProposalTier[];
  bankMap: Map<string, Item>;
  specBank?: MaterialSpecsBank | null;
  termsSettings?: TermsSettings | null;
  paymentStructure?: PaymentStructure | null;
  journey: Journey;
  studioName: string;
  userName?: string;
  leadConcern?: string | null;
  /** Who else decides, from the lead profile (PR B). */
  decisionMakers?: string | null;
  /** The project Timeline's programme (PR B). */
  programme?: { designWorkDays?: number; siteWorkDays?: number } | null;
  /** Writes the client's portal copy (services/portalRelease, as today). */
  onPublish?: (ctx: ProjectContext) => Promise<unknown>;
  /** Opens the option in the BOQ Editor. */
  onOpenBoq?: () => void;
}

export default function ProposalPanel({ ctx, setCtx, tier, tiers, bankMap, specBank, termsSettings, paymentStructure, journey, studioName, userName, leadConcern, decisionMakers, programme, onPublish, onOpenBoq }: ProposalPanelProps) {
  const [pdf, setPdf] = useState(false);
  const [meeting, setMeeting] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; t: string } | null>(null);
  const detail: PriceDetail = ctx.proposal?.priceDetail || 'lines';
  const setDetail = (p: PriceDetail) => setCtx(prev => ({ ...prev, proposal: { ...(prev.proposal || {}), priceDetail: p } }));
  const names = useMemo(() => Object.fromEntries(tiers.map(t => [gradeOf(t), t.name])), [tiers]);
  const table = useMemo(() => specTable(specBank, tier, bankMap, names), [specBank, tier, bankMap, names]);
  const publish = onPublish && (async () => {
    setNote(null);
    try { await onPublish(ctx); setNote({ ok: true, t: 'The client’s portal now has this proposal: Design & Scope → Scope, and Financials.' }); }
    catch (e: any) { setNote({ ok: false, t: `The portal was not updated: ${e?.message || e}` }); }
  });
  const validity = proposalValidity(ctx, termsSettings, Date.now(), tier.id);
  /* How the client books, as Ops decides it: the initiation fee, or D1 directly. The PDF's "To book" and Annexure A follow it. */
  const booking = useMemo(() => {
    const summary = isPlaygroundTier(tier) ? playgroundTierSummary(tier, bankMap, ctx) : tier.summary;
    return bookingOf(ctx.proposal, scheduleFor(ctx, { tierSummary: summary }, { paymentStructure }));
  }, [ctx, tier, bankMap, paymentStructure]);
  const setBooking = (by: BookWith) => setCtx(prev => withBooking(prev, by));

  return (
    <div className="space-y-4 no-print" aria-label="Client proposal, built from the Playground" role="region">
      <section className="rounded-3xl bg-white border border-slate-200 p-6 hud-panel-in">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="min-w-0 flex-1 basis-80">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Client proposal</div>
            <h1 className="text-2xl font-bold text-slate-800">Built from the Playground</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              {!journey.booked ? 'This client has not booked: they get the first-proposal PDF, presented on screen and sent after. No drawing.'
                : !journey.layoutApproved ? 'Booked: the portal is open. Drawings wait for the layout to be approved.'
                : 'Layout approved: the meeting view and the portal may show the rooms drawn.'}
              {' '}{tier.name}{validity.issued ? `, sent ${validity.from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="primary" icon={FileText} onClick={() => setPdf(true)}>First proposal PDF</Button>
            {journey.layoutApproved && <Button icon={Play} onClick={() => setMeeting(true)}>Meeting view</Button>}
            {journey.booked && publish && <Button icon={Send} onClick={publish}>Publish to the portal</Button>}
          </div>
        </div>
        {note && <p role="status" className={`mt-3 text-xs font-semibold ${note.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{note.t}</p>}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {TILES.map(([t, d], i) => (
            <div key={t} className="rounded-2xl border border-slate-200 p-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="text-[10px] font-bold text-slate-400 tabular-nums">{i + 1}</div>
              <div className="text-sm font-bold text-slate-800">{t}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap text-xs text-slate-600">
          <span className={LABEL}>Prices shown</span>
          <Segmented size="sm" label="Price detail" value={detail} onChange={setDetail}
            options={[{ id: 'package', label: 'Package only' }, { id: 'rooms', label: 'Room totals' }, { id: 'lines', label: 'Every line' }]} />
          <span>One switch for how much price detail the client sees, in the PDF and the meeting.</span>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-slate-600">
          <span className={LABEL}>To book</span>
          <Segmented<BookWith> size="sm" label="To book, the client pays" value={booking.by} onChange={setBooking}
            options={[{ id: 'initiation', label: 'Initiation fee' }, { id: 'd1', label: `${booking.code} directly` }]} />
          <span data-booking-says>
            {booking.by === 'initiation'
              ? <>The client books with the Project Initiation Fee, <b className="text-slate-800 tabular-nums">{inr(booking.amount)}</b>; {booking.balance > 0 ? `the rest of ${booking.code}, ${inr(booking.balance)}, follows with ${booking.code}` : `it covers ${booking.code} in full`}. Set the amount in the Deal lens.</>
              : <>The client books with {booking.code}, <b className="text-slate-800 tabular-nums">{inr(booking.amount)}</b>{booking.paid ? ` (${inr(booking.d1)} less the ${inr(booking.paid)} initiation fee paid)` : ''}.</>}
          </span>
        </div>
      </section>

      {table && (
        <>
          <section className="rounded-3xl border hud-glass p-6 hud-panel-in">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Client proposal · section 4</div>
            <h2 className="text-2xl font-bold text-slate-800">Material specifications</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">Built from the BOQ. Each cell lists the materials the option’s lines use, with the version they use; nothing here is typed by hand.</p>
            {table.stale > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {table.stale} line{table.stale === 1 ? '' : 's'} in {tier.name} use{table.stale === 1 ? 's' : ''} an older spec. The client sees what those lines say until you update them in the BOQ.
                {onOpenBoq && <button type="button" onClick={onOpenBoq} className="ml-auto font-bold underline">Open the BOQ</button>}
              </div>
            )}
          </section>
          <section className="rounded-3xl bg-white border border-slate-200 overflow-hidden" aria-label="Material specifications">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 820 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className={`text-left px-4 py-3 ${LABEL} w-44`}>Material</th>
                    {table.grades.map(g => (
                      <th key={g.grade} className="text-left px-4 py-3">
                        <div className={`text-sm font-bold ${g.fromBoq ? 'text-[#3D52A0]' : 'text-slate-800'}`}>{g.name}</div>
                        <div className="text-[11px] font-semibold text-slate-500">{g.fromBoq ? 'this option · from its BOQ' : 'from the Item Bank recipes'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {table.rows.map((r, i) => (
                    <tr key={r.fam} className="hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                      <th scope="row" className="text-left align-top px-4 py-3 text-sm font-semibold text-slate-800">{r.name}</th>
                      {r.cells.map((c, ci) => (
                        <td key={ci} className={`align-top px-4 py-3 ${table.grades[ci].fromBoq ? 'bg-[#3D52A0]/[0.03]' : ''}`}>
                          {c.length ? c.map(e => {
                            const old = e.versions.some(v => v < e.current);
                            return (
                              <div key={e.mat} className="mb-1.5 flex items-start gap-2">
                                {e.swatch && <span className="w-4 h-4 rounded mt-0.5 shrink-0 border border-slate-200" style={{ background: e.swatch }} aria-hidden />}
                                <div>
                                <div className="text-sm text-slate-800">{e.words}</div>
                                <div className="text-[11px] text-slate-500">{e.brand}{e.brand ? ' · ' : ''}<span className={old ? 'text-amber-700 font-bold' : 'text-[#3D52A0] font-bold'}>v{e.versions.join(', v')}{old ? ` (v${e.current} out)` : ''}</span>{table.grades[ci].fromBoq && c.length > 1 ? ` · ${e.lines} lines` : ''}</div>
                                </div>
                              </div>
                            );
                          }) : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500">Lines with their own words (written by hand) show those words in the BOQ and are left out of this table. Items with no recipe, such as plumbing and loose furniture, are not listed.</div>
          </section>
        </>
      )}

      {pdf && (
        <ProposalPdf ctx={ctx} tier={tier} tiers={tiers} bankMap={bankMap} specBank={specBank} termsSettings={termsSettings} paymentStructure={paymentStructure}
          studioName={studioName} userName={userName} concern={leadConcern} decisionMakers={decisionMakers} programme={programme} booked={journey.booked} priceDetail={detail}
          onSent={(via, shapedFor, priceDetail) => setCtx(prev => issueProposal(prev, { tierId: tier.id, at: Date.now(), via, days: validity.days, shapedFor, priceDetail, by: userName }))}
          onPublish={publish ? async () => { await publish(); } : undefined}
          onClose={() => setPdf(false)} />
      )}
      {meeting && (
        <MeetingView ctx={ctx} tier={tier} tiers={tiers} bankMap={bankMap} specBank={specBank} paymentStructure={paymentStructure}
          studioName={studioName} userName={userName} priceDetail={detail} onPriceDetail={setDetail}
          approved={ctx.approvedTierId === tier.id}
          onPdf={() => { setMeeting(false); setPdf(true); }}
          onClose={() => setMeeting(false)} />
      )}
    </div>
  );
}
