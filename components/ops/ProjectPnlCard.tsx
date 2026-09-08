import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Lock, ChevronDown, AlertTriangle, Wallet } from 'lucide-react';
import { ProjectContext, FullBoqItem, PurchaseOrder } from '../../types';
import { db } from '../../services/dbService';
import { formatINR } from '../../lib/utils';
import { buildProjectPnl, CONFIDENCE_LABEL, CONFIDENCE_NOTE } from '../../lib/projectPnl';

/**
 * PROJECT P&L — the one question an owner actually asks.
 *
 * Built to answer "did this job make money", and to be honest about how much
 * of that answer is yet known. Two things it deliberately does NOT do:
 *
 *   - It does not present the quote as a result. Until purchase orders exist,
 *     cost is an estimate and the card says so rather than showing a margin
 *     that looks measured.
 *   - It does not compare against GST-inclusive revenue. See lib/projectPnl.ts.
 *
 * Purchase orders are not in the Dashboard's props, so they are fetched here.
 * Everything else is derived from data already on screen.
 */

interface Props {
  projectContext: ProjectContext;
  boq: FullBoqItem[];
  projectId: string | null;
  activeTier?: any;
  currentUserRole: string;
  variants?: any;
  onOpenProcurement?: () => void;
}

const Row: React.FC<{
  label: string; value: number; tone?: 'plain' | 'muted' | 'good' | 'bad';
  note?: string; strong?: boolean;
}> = ({ label, value, tone = 'plain', note, strong }) => (
  <div className="flex items-baseline justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
    <div className="min-w-0">
      <span className={`text-[12.5px] ${strong ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
        {label}
      </span>
      {note && <span className="block text-[10.5px] text-slate-400 leading-snug">{note}</span>}
    </div>
    <span className={`font-mono tabular-nums shrink-0 ${strong ? 'text-[15px] font-bold' : 'text-[13px] font-semibold'} ${
      tone === 'good' ? 'text-emerald-700'
      : tone === 'bad' ? 'text-rose-700'
      : tone === 'muted' ? 'text-slate-400'
      : 'text-slate-800'
    }`}>
      {formatINR(value)}
    </span>
  </div>
);

const ProjectPnlCard: React.FC<Props> = ({
  projectContext, boq, projectId, activeTier, currentUserRole, variants, onOpenProcurement,
}) => {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!projectId) { setPos([]); setLoading(false); return; }
    setLoading(true);
    db.getPurchaseOrders(projectId)
      .then(r => { if (alive) setPos(r || []); })
      .catch(() => { if (alive) setPos([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  const pnl = useMemo(
    () => buildProjectPnl(projectContext, boq, pos, activeTier, projectContext?.procurementModes || {}),
    [projectContext, boq, pos, activeTier],
  );

  const shell = (children: React.ReactNode) => (
    <div className="h-full">
      <motion.div
        variants={variants}
        className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col h-full min-h-[360px]"
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#B5945B]/30" />
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-900">
              <Wallet className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Project P&amp;L</h3>
          </div>
          <span className="text-[10px] font-semibold text-slate-400">Owner Access Only</span>
        </div>
        {children}
      </motion.div>
    </div>
  );

  /* Margin is the most sensitive number in the studio. Same gate the
     Financial Ledger uses, worded for this card. */
  if (currentUserRole === 'Designer') {
    return shell(
      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center bg-[#FAF9F6]/50 rounded-2xl border border-dashed border-[#B5945B]/25 p-6">
        <Lock className="w-7 h-7 text-[#B5945B] mb-2.5 stroke-[1.5]" />
        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">Margin Visibility Restricted</h4>
        <p className="text-xs text-slate-500 max-w-[240px] mt-1.5 leading-normal font-light">
          Cost and profit figures are hidden for Designer roles. Please contact the Studio Owner.
        </p>
      </div>,
    );
  }

  if (loading) {
    return shell(
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#0066CC] border-t-transparent rounded-full animate-spin" />
      </div>,
    );
  }

  if (pnl.contractedExecution <= 0 && pnl.plannedCost <= 0) {
    return shell(
      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm font-bold text-slate-700">Nothing to measure yet</p>
        <p className="text-xs text-slate-400 max-w-[260px] mt-1.5 leading-relaxed">
          Profit appears once the BOQ has priced items. Everything here is derived from it and from
          purchase orders raised against it.
        </p>
      </div>,
    );
  }

  const worse = pnl.marginMovement < 0;
  const moved = Math.abs(pnl.marginMovement) >= 1;
  /* With nothing ordered the cost side is entirely the BOQ estimate. Calling
     that "margin as it stands" dresses a quote up as a result. */
  const estimateOnly = !pnl.hasProcurement;

  return shell(
    <div className="flex-1 flex flex-col">

      {/* The headline: what this job is making now, and whether that has moved. */}
      <div className={`rounded-2xl p-4 border ${
        estimateOnly ? 'bg-slate-50 border-slate-200'
        : worse && moved ? 'bg-rose-50/60 border-rose-200/70'
        : 'bg-emerald-50/50 border-emerald-200/60'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[10px] font-black uppercase tracking-widest ${
              estimateOnly ? 'text-slate-500' : worse && moved ? 'text-rose-700' : 'text-emerald-700'
            }`}>
              {estimateOnly ? 'Expected margin, from the quote' : 'Margin as it stands'}
            </p>
            <p className="text-2xl font-extrabold tracking-tight text-slate-900 mt-1 font-mono tabular-nums">
              {formatINR(estimateOnly ? pnl.quotedMargin : pnl.currentMargin)}
            </p>
            <p className="text-[11.5px] text-slate-500 mt-0.5">
              {(estimateOnly ? pnl.quotedMarginPct : pnl.currentMarginPct).toFixed(1)}% of {formatINR(pnl.contractedTotal)} contracted
            </p>
          </div>
          {!estimateOnly && moved && (
            <span className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
              worse ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
            }`}>
              {worse ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
              {worse ? '' : '+'}{formatINR(pnl.marginMovement)}
            </span>
          )}
        </div>

        {estimateOnly ? (
          <div className="mt-3 pt-3 border-t border-slate-200/80">
            <p className="text-[11.5px] text-slate-600 leading-snug">
              Nothing has been ordered, so this is what the BOQ <em>predicts</em>, not what the job made.
            </p>
            {onOpenProcurement && (
              <button
                onClick={onOpenProcurement}
                className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0066CC] hover:bg-[#0055B3] text-white text-[11.5px] font-bold transition-colors cursor-pointer"
              >
                Add purchase orders
              </button>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 mt-2.5 leading-snug">
            {moved
              ? <>Quoted at <strong className="text-slate-700">{formatINR(pnl.quotedMargin)}</strong> ({pnl.quotedMarginPct.toFixed(1)}%). {worse ? 'This job is behind its quote.' : 'This job is ahead of its quote.'}</>
              : <>Level with the quote of <strong className="text-slate-700">{formatINR(pnl.quotedMargin)}</strong>.</>}
          </p>
        )}
      </div>

      {/* How much of that is known rather than assumed. */}
      <div className="mt-3 flex items-center gap-2.5">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#0066CC] transition-all duration-500"
            style={{ width: `${Math.min(100, pnl.coveragePct)}%` }}
          />
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-500 whitespace-nowrap">
          {Math.round(pnl.coveragePct)}% ordered
        </span>
      </div>
      <p className="text-[10.5px] text-slate-400 mt-1.5 leading-snug">
        {CONFIDENCE_NOTE[pnl.confidence]}
      </p>

      {pnl.overspend > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-900 leading-snug">
            <strong>{formatINR(pnl.overspend)}</strong> committed above budget across{' '}
            {pnl.overspentEnvelopes.length} {pnl.overspentEnvelopes.length === 1 ? 'package' : 'packages'}.
          </p>
        </div>
      )}

      {/* The four stages, which is what the whole thing rests on. */}
      <div className="mt-4">
        <Row label="Contracted, execution" value={pnl.contractedExecution} note="ex-GST, after discounts" />
        <Row label="Design fee" value={pnl.contractedDesign} note="ex-GST. No cost against it, so it is margin in full." tone="good" />
        <Row label="Planned cost" value={pnl.plannedCost} note="materials and labour, from the BOQ" />
        {pnl.hasProcurement ? (
          <>
            <Row label="Committed" value={pnl.committedCost} note={`${pnl.poCount} purchase order${pnl.poCount === 1 ? '' : 's'}`} tone={pnl.overspend > 0 ? 'bad' : 'plain'} />
            <Row label="Billed by vendors" value={pnl.billedCost} tone={pnl.billedCost > 0 ? 'plain' : 'muted'} />
            <Row label="Paid to vendors" value={pnl.paidCost} tone={pnl.paidCost > 0 ? 'plain' : 'muted'} />
          </>
        ) : (
          <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-[12.5px] font-medium text-slate-400">Committed, billed, paid</span>
            <span className="text-[12px] font-semibold text-slate-400">not entered yet</span>
          </div>
        )}
      </div>

      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] font-bold text-[#0066CC] hover:text-[#0055B3] cursor-pointer transition-colors"
      >
        {open ? 'Hide the rest' : 'Design fee, cash and rooms'}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-1 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Where the margin comes from</p>
              <Row
                label="Execution work"
                value={pnl.hasProcurement ? pnl.executionMarginCurrent : pnl.executionMarginQuoted}
                note="sell less material and labour"
                tone={(pnl.hasProcurement ? pnl.executionMarginCurrent : pnl.executionMarginQuoted) < 0 ? 'bad' : 'plain'}
              />
              <Row label="Design fee" value={pnl.contractedDesign} note="no cost against it" tone="good" />

              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4 mb-1">
                Cash, not profit &middot; GST {pnl.gstRate}% {pnl.gstOnExecution ? 'on design and execution' : 'on design fee only'}
              </p>
              <Row label="Received from client" value={pnl.receivedFromClient} note="incl. GST" tone="good" />
              <Row label="Invoiced, awaiting payment" value={pnl.awaitingPayment} note="raised but not yet paid" tone={pnl.awaitingPayment > 0 ? 'bad' : 'muted'} />
              <Row label="Not yet collected" value={pnl.uncollected} note="whole contract still outstanding, incl. GST" tone={pnl.uncollected > 0 ? 'bad' : 'muted'} />
              <Row label="Net in hand" value={pnl.cashPosition} note="received from client, less paid to vendors" strong tone={pnl.cashPosition < 0 ? 'bad' : 'good'} />

              {pnl.rooms.filter(r => r.quotedSell > 0).length > 0 && (
                <>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4 mb-2">Margin by room</p>
                  <div className="space-y-1.5">
                    {pnl.rooms.filter(r => r.quotedSell > 0).slice(0, 8).map(r => {
                      const drop = r.marginPct < r.quotedMarginPct - 0.5;
                      return (
                        <div key={r.roomId} className="flex items-center justify-between gap-3 text-[12px]">
                          <span className="text-slate-600 truncate">{r.roomId}</span>
                          <span className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                            <span className="text-slate-400 text-[11px]">{r.quotedMarginPct.toFixed(0)}%</span>
                            <span className="text-slate-300">&rarr;</span>
                            <span className={`font-bold ${drop ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {r.marginPct.toFixed(0)}%
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {onOpenProcurement && (
                <button
                  onClick={onOpenProcurement}
                  className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0066CC] hover:bg-[#0055B3] text-white text-[11.5px] font-bold transition-colors cursor-pointer"
                >
                  Open procurement
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
  );
};

export default ProjectPnlCard;
