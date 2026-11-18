import React from 'react';
import { motion } from 'framer-motion';
import { PenTool, HardHat } from '@/lib/lucide-shim';
import { Chip } from '../../ui/kit';
import { IconTile } from '../../people/PeopleBits';
import { formatCurrency } from '../../../lib/utils';
import type { PaymentMilestone } from '../../../types';
import type { MilestoneAmount } from '../../../lib/paymentSchedule';
import { milestoneKind, type CardState, type Track } from '../../../lib/moneyBoard';
import { KIND_ICON } from './TrackColumn';
import './moneyBoardStyles';

/*
  The milestones at a glance (DESIGN.md → "Money motion"): one read-only table
  per track, a row per milestone, above the editable cards. A row opens its
  card. While a tax change is previewed, a figure that moves is shaded and
  keeps its old value struck through.
*/

const money = (v: number) => formatCurrency(Math.round(v));

const STATUS: Record<CardState, { label: string; tone: 'good' | 'warn' | 'brand' | 'slate' }> = {
  paid: { label: 'Paid', tone: 'good' },
  invoiced: { label: 'With client', tone: 'warn' },
  earned: { label: 'Earned', tone: 'brand' },
  next: { label: 'Up next', tone: 'slate' },
  later: { label: 'Later', tone: 'slate' },
};

export interface SummaryTrack {
  track: Track;
  milestones: PaymentMilestone[];
  states: Record<string, CardState>;
  amounts: Record<string, MilestoneAmount>;
  saved?: Record<string, MilestoneAmount>;
  shares: Record<string, number>;
}

const dateOf = (v?: string) => {
  if (!v) return null;
  const d = new Date(v.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const Cell: React.FC<{ now: number; was?: number; strong?: boolean }> = ({ now, was, strong }) => {
  const moved = was !== undefined && Math.round(was) !== Math.round(now);
  return (
    <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${moved ? 'bg-[#3D52A0]/5' : ''}`}>
      <span className={strong ? 'font-black text-slate-800' : 'text-slate-700'}>{money(now)}</span>
      {moved && <s className="block text-[10px] text-slate-400">{money(was!)}</s>}
    </td>
  );
};

const TrackTable: React.FC<{ t: SummaryTrack; index: number; onOpen: (id: string) => void }> = ({ t, index, onOpen }) => {
  const rows = t.milestones.filter(m => t.amounts[m.id]);
  const showCash = t.track === 'execution' || rows.some(m => (t.amounts[m.id]?.cash || 0) > 0);
  const sum = (k: 'base' | 'gst' | 'cash' | 'owed', src = t.amounts) => rows.reduce((x, m) => x + (src[m.id]?.[k] || 0), 0);
  const sumSaved = (k: 'base' | 'gst' | 'cash' | 'owed') => (t.saved ? sum(k, t.saved) : undefined);
  const head = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap';
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <IconTile icon={t.track === 'design' ? PenTool : HardHat} size="sm" />
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800">{t.track === 'design' ? 'Design milestones' : 'Execution milestones'}</h3>
          <p className="text-[11px] text-slate-500">{rows.length} {rows.length === 1 ? 'milestone' : 'milestones'} · click a row to open its card</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-y border-slate-200">
            <tr>
              <th className={`${head} text-left`}>Milestone</th>
              <th className={`${head} text-right`}>Share</th>
              <th className={`${head} text-right`}>Taxable</th>
              <th className={`${head} text-right`}>GST</th>
              {showCash && <th className={`${head} text-right`}>Cash</th>}
              <th className={`${head} text-right`}>Client pays</th>
              <th className={`${head} text-left`}>Status</th>
              <th className={`${head} text-left`}>Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((m, i) => {
              const a = t.amounts[m.id], s = t.saved?.[m.id], st = STATUS[t.states[m.id] || 'later'];
              const Icon = KIND_ICON[milestoneKind(m)];
              const fixed = m.isFixedAmount && m.fixedAmount !== undefined;
              return (
                <motion.tr key={m.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 + i * 0.03 }}
                  onClick={() => onOpen(m.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(m.id); } }}
                  className="cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:bg-[#3D52A0]/5">
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2 min-w-[160px]">
                      <span className="w-5 text-[11px] font-bold text-slate-400 tabular-nums">{i + 1}</span>
                      <Icon className="w-4 h-4 text-[#3D52A0] shrink-0" />
                      <span className="font-semibold text-slate-800 truncate">{m.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-slate-600">
                    {fixed ? <span title={`Fixed ${money(m.fixedAmount || 0)} before GST`}>₹ · ≈{Math.round((t.shares[m.id] || 0) * 10) / 10}%</span> : `${Number(m.percentage) || 0}%`}
                  </td>
                  <Cell now={a.base} was={s?.base} />
                  <Cell now={a.gst} was={s?.gst} />
                  {showCash && <Cell now={a.cash} was={s?.cash} />}
                  <Cell now={a.owed} was={s?.owed} strong />
                  <td className="px-3 py-2.5"><Chip tone={st.tone}>{st.label}</Chip></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                    {dateOf(m.date)
                      || (m.status === 'paid' && dateOf(m.paidDate) ? `Paid ${dateOf(m.paidDate)}` : null)
                      || (m.status === 'paid' || m.status === 'invoiced' ? '—' : <span className="text-amber-700">No date</span>)}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
            <tr>
              <td className="px-3 py-2.5 text-slate-800">Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{Math.round(rows.reduce((x, m) => x + (t.shares[m.id] || 0), 0) * 10) / 10}%</td>
              <Cell now={sum('base')} was={sumSaved('base')} />
              <Cell now={sum('gst')} was={sumSaved('gst')} />
              {showCash && <Cell now={sum('cash')} was={sumSaved('cash')} />}
              <Cell now={sum('owed')} was={sumSaved('owed')} strong />
              <td className="px-3 py-2.5" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </motion.section>
  );
};

export const MilestoneSummary: React.FC<{ tracks: SummaryTrack[]; onOpen: (id: string) => void }> = ({ tracks, onOpen }) => (
  <div className="grid gap-4 grid-cols-1">
    {tracks.map((t, i) => <TrackTable key={t.track} t={t} index={i} onOpen={onOpen} />)}
  </div>
);
