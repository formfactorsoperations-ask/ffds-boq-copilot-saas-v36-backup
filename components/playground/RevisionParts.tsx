import React from 'react';
import { Check, X } from 'lucide-react';
import { Button, LABEL } from '../ui/kit';
import type { BoqItem, Item } from '../../types';
import type { RevisionResult } from '../../lib/scopeRevision';
import { scopeChanges, changeWhy, type Changes } from '../../lib/playground/changes';
import type { LineAmountOptions } from '../../lib/playground/pricing';
import { resolveBoqLine } from '../../lib/boqPricing';
import { TagChip, Delta } from './ChangesParts';
import { inr } from './playgroundUi';

/*
  A signed BOQ revised on the plan (BOQ Playground PR R2, the mockup's
  "Issue it to the client"): the signed and revised prices and the change;
  the change six ways, as the Scope Revision document has it; and what the
  client reads, line by line, with each reason. No cost or markup goes in it.
*/

export function RevisionIssueModal({ number, reference, result, changes, cur, bankMap, opts, need, reasons, issuing, error, onClose, onIssue }: {
  number: number;
  reference: string;
  result: RevisionResult;
  changes: Changes;
  cur: BoqItem[];
  bankMap: Map<string, Item>;
  opts: { base: LineAmountOptions; cur: LineAmountOptions };
  need: Set<string>;
  reasons: Record<string, string>;
  issuing: boolean;
  error?: string | null;
  onClose: () => void;
  onIssue: () => void;
}) {
  const dd = result.change;
  const b = result.bridge;
  const six: [string, number][] = [['New items', b.new], ['Quantity', b.qty], ['Rate', b.rate], ['Redesigned', b.redesign], ['Compared by section', b.section], ['Removed', b.removed]];
  const byId = new Map(cur.map(l => [l.id, l]));
  const rows = scopeChanges(changes).filter(([id]) => need.has(id));
  const missing = rows.filter(([id]) => !(reasons[id] || '').trim()).length;
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-4">
      <div onClick={onClose} className="absolute inset-0 phd-scrim bg-slate-900/40" aria-hidden />
      <section className="relative w-full max-w-[600px] max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl phd-pop" role="dialog" aria-modal="true" aria-labelledby="pg-issue-title">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Scope revision {number} · {reference}</div>
            <h2 id="pg-issue-title" className="text-lg font-bold text-slate-800">Issue it to the client</h2>
            <p className="text-xs text-slate-500">The same Scope Revision document the app sends today, built from these changes. No cost, markup or internal note goes in it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {([['Signed', inr(result.v1Total), 'text-slate-800'], ['Revised', inr(result.v2Total), 'text-slate-800'], ['Change', `${dd >= 0 ? '+' : '−'}${inr(Math.abs(dd))}`, dd > 0 ? 'text-rose-600' : 'text-emerald-600']] as const).map(([a, v, c]) => (
              <div key={a} className="rounded-2xl border border-slate-200 p-3 text-center"><div className={LABEL}>{a}</div><div className={`text-lg font-black tabular-nums ${c}`}>{v}</div></div>
            ))}
          </div>
          <div>
            <div className={`${LABEL} mb-1.5`}>The change, six ways</div>
            <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-sm" data-six>
              {six.map(([n, v]) => (
                <div key={n} className="px-3 py-1.5 flex justify-between">
                  <span className={Math.abs(v) < 1 ? 'text-slate-400' : 'text-slate-700'}>{n}</span>
                  {Math.abs(v) < 1 ? <b className="text-slate-300">—</b> : <Delta d={v} />}
                </div>
              ))}
              <div className="px-3 py-1.5 flex justify-between bg-slate-50 font-bold"><span>Adds up to</span><span className="tabular-nums">{dd >= 0 ? '+' : '−'}{inr(Math.abs(dd))}</span></div>
            </div>
          </div>
          <div>
            <div className={`${LABEL} mb-1.5`}>What the client reads, line by line</div>
            <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {rows.map(([id, e]) => {
                const l = e.gone ? e.was! : byId.get(id)!;
                return (
                  <div key={id} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 flex-1 min-w-0 truncate">{resolveBoqLine(l, bankMap).name} <span className="font-normal text-slate-500">· {l.roomId || 'Whole flat'}</span></span>
                      <TagChip tag={e.tag} />
                      <Delta d={e.d} />
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      {changeWhy(e, l, bankMap, { ...opts, studio: false })}
                      {reasons[id] ? <> · <b className="text-slate-700">{reasons[id]}</b></> : <> · <b className="text-amber-700">no reason yet</b></>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Markups and costs are left out of the client’s copy; a markup change reads as a revised rate.</p>
          </div>
          {missing > 0 && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{missing} change{missing > 1 ? 's have' : ' has'} no reason. The client reads the reason beside each change, so it cannot be issued yet.</div>}
          {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</div>}
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b className="text-slate-800">What happens next.</b> The client reads and signs it in the portal, as today. Until then the signed BOQ stays the contract and this revision is read-only. Once signed, apply it here and the Playground opens on it.</div>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 rounded-b-3xl">
          <Button onClick={onClose}>Back to the changes</Button>
          <Button variant="primary" icon={Check} disabled={missing > 0 || issuing} onClick={onIssue}>Issue to the client</Button>
        </div>
      </section>
    </div>
  );
}
