import React, { useState } from 'react';
import { Check, Receipt } from '@/lib/lucide-shim';
import type { AsActualsInContract } from '../../lib/asActualsCorrection';
import type { RevisionMoneyPreview } from '../../lib/revisionMoneyPreview';

/*
  The approved value on this project still includes as-actuals, which the
  client pays the vendors for directly. One card says so, shows what taking
  them out does to the milestones, and does it on a confirmed click. Drawn in
  the Money tab's own card language.
*/

const inr = (n: number) => `${Math.round(n) < 0 ? '−' : ''}₹${Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-IN')}`;
const sgn = (n: number) => (Math.round(n) === 0 ? '—' : `${n > 0 ? '+' : '−'}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`);

interface Props {
  c: AsActualsInContract;
  preview: RevisionMoneyPreview;
  onApply: () => void;
}

export default function AsActualsCorrectionPanel({ c, preview: p, onApply }: Props) {
  const [confirm, setConfirm] = useState(false);
  const moved = p.rows.filter(r => Math.abs(r.change) >= 1);
  return (
    <section className="relative overflow-hidden bg-white border border-[#E2E5F0] rounded-2xl px-5 py-4 pl-6 mny-rise" aria-label="As actuals in the approved value">
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-500" />
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Receipt className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-[#12182F]">{inr(c.asActuals)} of as actuals is in the approved value</h4>
            <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border-amber-200">Not FFDS’s to invoice</span>
          </div>
          <p className="text-xs text-[#5A628A] mt-0.5 max-w-3xl">
            {c.tierName} has items marked as actuals, which the client pays the vendors for directly. The approved execution value still counts them:
            {' '}{inr(c.from)} where FFDS’s own work is {inr(c.to)}. Taking them out lowers the milestones still to come; invoiced and paid ones keep what they were billed at. The design fee does not change.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs tabular-nums text-[#5A628A]">
            <span>Contract, with GST: <span className="line-through text-[#8E96B8]">{inr(p.grossNow)}</span> <b className="text-[#12182F]">{inr(p.grossRevised)}</b></span>
            <span>Still to collect: <span className="line-through text-[#8E96B8]">{inr(p.now.totals.remainingBalance)}</span> <b className="text-[#12182F]">{inr(p.revised.totals.remainingBalance)}</b></span>
            {moved.length > 0 && <span>{moved.map(r => `${(r.name || '').replace(' (Gross)', '')} ${sgn(r.change)}`).join(' · ')}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {confirm ? (
            <>
              <button type="button" onClick={() => setConfirm(false)} className="px-3 py-2 rounded-xl border border-[#E2E5F0] bg-white text-xs font-bold text-[#5A628A] hover:bg-[#F6F7FB] cursor-pointer">Cancel</button>
              <button type="button" onClick={onApply} className="px-3.5 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Yes, take {inr(c.asActuals)} out</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="px-3.5 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold cursor-pointer">Take as actuals out of FFDS’s total</button>
          )}
        </div>
      </div>
      {confirm && (
        <p className="text-[11px] text-[#8E96B8] mt-2 hud-swap">
          The approved execution value becomes {inr(c.to)}, the change is logged under History, and the next Payment Schedule version is staged as a draft for you to release to the client from Documents.
        </p>
      )}
    </section>
  );
}
