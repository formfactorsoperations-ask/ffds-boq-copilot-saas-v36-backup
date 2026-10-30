import React, { useState } from 'react';
import { ArrowRight, ChevronDown, Eye } from '@/lib/lucide-shim';
import type { PendingRevision, RevisionMoneyPreview } from '../../lib/revisionMoneyPreview';

/*
  The Money tab's preview of an open Scope Revision: every milestone now, and
  once the revision is applied. Read-only: the figures the studio bills stay on
  the approved scope until the client approves and the studio applies it.

  Drawn in the Money tab's own card language (the hairline #E2E5F0 card, ink
  #12182F, muted #5A628A), so it reads as part of that screen.
*/

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const sgn = (n: number) => {
  const r = Math.round(n);
  return r === 0 ? '—' : `${r > 0 ? '+' : '−'}₹${Math.abs(r).toLocaleString('en-IN')}`;
};
const tone = (n: number) => (n > 0.5 ? 'text-rose-700' : n < -0.5 ? 'text-emerald-700' : 'text-[#8E96B8]');

const STATE: Record<PendingRevision['state'], { chip: string; tint: string; line: string }> = {
  draft: {
    chip: 'Draft',
    tint: 'bg-[#F6F7FB] text-[#5A628A] border-[#E2E5F0]',
    line: 'Still being revised. These figures follow the draft as you edit it.',
  },
  with_client: {
    chip: 'With the client',
    tint: 'bg-amber-50 text-amber-800 border-amber-200',
    line: 'Waiting for the client’s approval. Nothing here is billed until they approve it and you apply it.',
  },
  sent_back: {
    chip: 'Sent back for changes',
    tint: 'bg-amber-50 text-amber-800 border-amber-200',
    line: 'The client sent this version back. Reopen it in Versions & Revision Studio to revise it.',
  },
  approved: {
    chip: 'Approved, not applied',
    tint: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    line: 'The client approved it. Apply it in Versions & Revision Studio to make these the figures you bill.',
  },
};

const STATUS: Record<string, string> = { paid: 'Paid', invoiced: 'Invoiced', pending: 'Upcoming' };

interface Props {
  rev: PendingRevision;
  preview: RevisionMoneyPreview;
  /** Overview: a one-line summary that opens the milestones. */
  compact?: boolean;
  onOpen?: () => void;
}

export default function RevisionMoneyPanel({ rev, preview: p, compact, onOpen }: Props) {
  const [open, setOpen] = useState(true);
  const st = STATE[rev.state];
  const moved = p.rows.filter(r => Math.abs(r.change) >= 1);
  const title = `If Scope Revision ${rev.number} is applied`;

  if (compact) {
    return (
      <button type="button" onClick={onOpen}
        className="group w-full text-left bg-white border border-[#E2E5F0] rounded-2xl px-5 py-4 mny-rise flex flex-wrap items-center gap-x-4 gap-y-2 cursor-pointer hover:border-[#ADBBDA] transition-colors">
        <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Eye className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-[#12182F]">{title}</h4>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${st.tint}`}>{st.chip}</span>
          </div>
          <p className="text-xs text-[#5A628A] mt-0.5">
            Contract {inr(p.grossNow)} → {inr(p.grossRevised)} <b className={tone(p.grossRevised - p.grossNow)}>({sgn(p.grossRevised - p.grossNow)})</b> · {moved.length} milestone{moved.length === 1 ? '' : 's'} change. A preview: nothing is billed until it is applied.
          </p>
        </div>
        <span className="text-xs font-bold text-[#3D52A0] flex items-center gap-1 shrink-0">See each milestone <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
      </button>
    );
  }

  const figures: [string, number, number][] = [
    ['Execution, after discount', p.taxableNow, p.taxableRevised],
    ['Contract, with GST', p.grossNow, p.grossRevised],
    ['Still to collect', p.now.totals.remainingBalance, p.revised.totals.remainingBalance],
  ];
  const overBilled = p.revised.overBilled.find(o => o.track === 'execution');

  return (
    <section className="bg-white border border-[#E2E5F0] rounded-2xl mny-rise overflow-hidden" aria-label={title}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="w-full text-left px-5 py-4 flex flex-wrap items-start gap-3 cursor-pointer">
        <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Eye className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-[#12182F]">{title}</h4>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${st.tint}`}>{st.chip}</span>
            {rev.reference && <span className="text-[11px] text-[#8E96B8]">{rev.reference}</span>}
          </div>
          <p className="text-xs text-[#5A628A] mt-0.5 max-w-3xl">
            A preview of how the milestones change on the revised BOQ ({inr(rev.v1Total)} → {inr(rev.v2Total)} before discount), with this project’s discount, GST and billing split. {st.line}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-[#8E96B8] shrink-0 mt-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 hud-swap">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {figures.map(([k, a, b]) => (
              <div key={k} className="rounded-xl border border-[#E2E5F0] bg-[#F6F7FB] px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A628A]">{k}</div>
                <div className="flex items-baseline gap-2 flex-wrap mt-1 tabular-nums">
                  <span className="text-xs text-[#8E96B8] line-through decoration-[#ADBBDA]">{inr(a)}</span>
                  <span className="text-lg font-black text-[#12182F]">{inr(b)}</span>
                  <span className={`text-xs font-bold ${tone(b - a)}`}>{sgn(b - a)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E2E5F0]">
            <table className="w-full text-sm tabular-nums min-w-[560px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-[#5A628A] bg-[#F6F7FB]">
                  <th className="text-left px-4 py-2.5">Milestone</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-right px-3 py-2.5">Now</th>
                  <th className="text-right px-3 py-2.5">If applied</th>
                  <th className="text-right px-4 py-2.5">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDEFF7]">
                {p.rows.map((r, i) => (
                  <tr key={r.id} className="hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-[#12182F]">{(r.name || '').replace(' (Gross)', '')}</div>
                      <div className="text-[11px] text-[#8E96B8]">{r.type === 'design' ? 'Design' : 'Execution'}{r.cleared ? ' · billed, so it keeps its amount' : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#5A628A]">{STATUS[r.status] || r.status}</td>
                    <td className="px-3 py-2.5 text-right text-[#5A628A]">{inr(r.now)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-[#12182F]">{inr(r.revised)}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${tone(r.change)}`}>{sgn(r.change)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(p.unscheduled !== 0 || overBilled) && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              {overBilled
                ? <>Execution already billed is {inr(overBilled.overBy)} more than the revised execution. When the revision is applied, the revised Payment Schedule shows it as a credit to the client.</>
                : p.unscheduled > 0
                  ? <>{inr(p.unscheduled)} of the revised execution has no milestone left to carry it. When the revision is applied, the revised Payment Schedule adds it as a balance stage.</>
                  : <>{inr(-p.unscheduled)} is owed back to the client on the revised execution. When the revision is applied, the revised Payment Schedule shows it as a credit.</>}
            </p>
          )}
          <p className="text-[11px] text-[#8E96B8]">Amounts are what the client pays at each milestone, GST and any cash share included, worked out the same way as the milestones below. Invoiced and paid milestones keep what they were billed at; the change falls on the milestones still to come.</p>
        </div>
      )}
    </section>
  );
}
