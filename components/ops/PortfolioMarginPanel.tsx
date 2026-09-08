import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, AlertTriangle, ChevronRight } from 'lucide-react';
import { FullProjectData, PurchaseOrder } from '../../types';
import { db } from '../../services/dbService';
import { formatINR } from '../../lib/utils';
import { calculateProjectFinancials } from '../../lib/financialsUtils';

/**
 * PORTFOLIO MARGIN — the same question as the project P&L card, one level up.
 *
 * Cost comes from the active tier's `summary.totalCost` rather than by
 * re-assembling every project's BOQ: the summary is already the BOQ rolled up,
 * and doing it the other way would mean loading the rate bank and the full
 * item list for every project just to reach a number that is sitting there.
 *
 * Purchase orders ARE fetched per project, because committed and billed exist
 * nowhere else. Only projects carrying real money are included — a lead has no
 * margin to speak of, and padding the table with them hides the ones that do.
 */

interface Props {
  projects: FullProjectData[];
  onOpenProject?: (projectId: string) => void;
  variants?: any;
}

const MONEY_STATUSES = ['won', 'execution', 'work_paused', 'completed'];

interface Row {
  id: string;
  name: string;
  client: string;
  status: string;
  contracted: number;
  plannedCost: number;
  committed: number;
  billed: number;
  effectiveCost: number;
  quotedMargin: number;
  currentMargin: number;
  quotedPct: number;
  currentPct: number;
  hasPos: boolean;
}

const PortfolioMarginPanel: React.FC<Props> = ({ projects, onOpenProject, variants }) => {
  const [posByProject, setPosByProject] = useState<Record<string, PurchaseOrder[]>>({});
  const [loading, setLoading] = useState(true);

  const moneyProjects = useMemo(
    () => (projects || []).filter(p => MONEY_STATUSES.includes(p.context?.status || '')),
    [projects],
  );

  useEffect(() => {
    let alive = true;
    if (!moneyProjects.length) { setLoading(false); return; }
    setLoading(true);
    Promise.all(
      moneyProjects.map(p =>
        db.getPurchaseOrders(p.id).then(r => [p.id, r || []] as const).catch(() => [p.id, []] as const),
      ),
    ).then(pairs => {
      if (!alive) return;
      const map: Record<string, PurchaseOrder[]> = {};
      pairs.forEach(([id, r]) => { map[id] = r as PurchaseOrder[]; });
      setPosByProject(map);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [moneyProjects]);

  const rows: Row[] = useMemo(() => moneyProjects.map(p => {
    const tier = (p.tiers || []).find(t => t.id === (p.activeTierId || p.context?.approvedTierId)) || (p.tiers || [])[0];
    const fin = calculateProjectFinancials(p.context, tier) as any;

    const contracted  = (fin.taxableExecution || 0) + (fin.taxableDesign || 0);
    const plannedCost = (tier as any)?.summary?.totalCost || 0;

    const pos = (posByProject[p.id] || []).filter(
      po => po && po.status !== 'cancelled' && ['issued', 'received', 'closed'].includes(po.status),
    );
    const committed = pos.reduce((s, po) => s + (po.total || 0), 0);
    const billed    = pos.reduce((s, po) => s + (po.billAmount != null ? po.billAmount : 0), 0);

    /* Same rule as the project card: real numbers where they exist, the plan
       where they do not. At portfolio level there is no envelope breakdown,
       so this is a whole-project switch rather than a per-package one. */
    const effectiveCost = committed > 0 ? Math.max(committed, billed) : plannedCost;

    const quotedMargin  = contracted - plannedCost;
    const currentMargin = contracted - effectiveCost;

    return {
      id: p.id,
      name: p.context?.name || 'Untitled',
      client: p.context?.clientName || '',
      status: p.context?.status || '',
      contracted, plannedCost, committed, billed, effectiveCost,
      quotedMargin, currentMargin,
      quotedPct:  contracted > 0 ? (quotedMargin / contracted) * 100 : 0,
      currentPct: contracted > 0 ? (currentMargin / contracted) * 100 : 0,
      hasPos: committed > 0,
    };
  }).filter(r => r.contracted > 0)
    .sort((a, b) => a.currentPct - b.currentPct), [moneyProjects, posByProject]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    contracted: a.contracted + r.contracted,
    planned:    a.planned + r.plannedCost,
    effective:  a.effective + r.effectiveCost,
    quoted:     a.quoted + r.quotedMargin,
    current:    a.current + r.currentMargin,
  }), { contracted: 0, planned: 0, effective: 0, quoted: 0, current: 0 }), [rows]);

  const totalPct = totals.contracted > 0 ? (totals.current / totals.contracted) * 100 : 0;
  const movement = totals.current - totals.quoted;
  const anyPos = rows.some(r => r.hasPos);

  if (!loading && rows.length === 0) return null;

  return (
    <motion.div variants={variants} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-900">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Portfolio Margin</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Live, from BOQ and purchase orders &middot; {rows.length} project{rows.length === 1 ? '' : 's'} carrying money
            </p>
          </div>
        </div>
        {!loading && (
          <div className="text-right">
            <p className="text-2xl font-light text-slate-900 tabular-nums leading-none">{totalPct.toFixed(1)}%</p>
            <p className="text-[10px] text-slate-500 mt-1">
              {formatINR(totals.current)} on {formatINR(totals.contracted)}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-10 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#0066CC] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {!anyPos && (
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-600 leading-snug">
                No purchase orders on any of these projects, so every figure below is still the quote.
                Raise POs to see what the studio is actually making.
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-5">Project</th>
                  <th className="py-2.5 px-2 text-right">Contracted</th>
                  <th className="py-2.5 px-2 text-right">Planned cost</th>
                  <th className="py-2.5 px-2 text-right">Committed</th>
                  <th className="py-2.5 px-2 text-right">Margin</th>
                  <th className="py-2.5 px-5 text-right">Quoted &rarr; now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600 font-medium">
                {rows.map(r => {
                  const slipped = r.currentPct < r.quotedPct - 0.5;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onOpenProject?.(r.id)}
                      className={`hover:bg-slate-50/70 transition-colors ${onOpenProject ? 'cursor-pointer' : ''}`}
                    >
                      <td className="py-3 px-5">
                        <span className="font-semibold text-slate-800 block truncate max-w-[190px]">{r.name}</span>
                        {r.client && <span className="text-[10px] text-slate-400">{r.client}</span>}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums">{formatINR(r.contracted)}</td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-500">{formatINR(r.plannedCost)}</td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums">
                        {r.hasPos ? formatINR(r.committed) : <span className="text-slate-300">&mdash;</span>}
                      </td>
                      <td className={`py-3 px-2 text-right font-mono tabular-nums font-bold ${
                        r.currentMargin < 0 ? 'text-rose-700' : 'text-slate-800'
                      }`}>
                        {formatINR(r.currentMargin)}
                      </td>
                      <td className="py-3 px-5 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-400">{r.quotedPct.toFixed(0)}%</span>
                        <span className="text-slate-300 mx-1">&rarr;</span>
                        <span className={`font-bold ${slipped ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {r.currentPct.toFixed(0)}%
                        </span>
                        {onOpenProject && <ChevronRight className="w-3 h-3 inline ml-1.5 text-slate-300" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-slate-800 font-bold">
                  <td className="py-3 px-5 text-[11px] uppercase tracking-wider">Portfolio</td>
                  <td className="py-3 px-2 text-right font-mono tabular-nums">{formatINR(totals.contracted)}</td>
                  <td className="py-3 px-2 text-right font-mono tabular-nums">{formatINR(totals.planned)}</td>
                  <td className="py-3 px-2 text-right font-mono tabular-nums">
                    {anyPos ? formatINR(totals.effective) : <span className="text-slate-300">&mdash;</span>}
                  </td>
                  <td className="py-3 px-2 text-right font-mono tabular-nums">{formatINR(totals.current)}</td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums">
                    {Math.abs(movement) >= 1 ? (
                      <span className={movement < 0 ? 'text-rose-700' : 'text-emerald-700'}>
                        {movement < 0 ? '' : '+'}{formatINR(movement)}
                      </span>
                    ) : (
                      <span className="text-slate-400">on plan</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="px-5 py-3 text-[10px] text-slate-400 border-t border-slate-50 leading-snug">
            Contracted and margin are ex-GST and include the design fee, which carries no cost.
            Sorted thinnest margin first.
          </p>
        </>
      )}
    </motion.div>
  );
};

export default PortfolioMarginPanel;
