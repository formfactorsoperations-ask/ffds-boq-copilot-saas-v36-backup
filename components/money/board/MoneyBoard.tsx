import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Landmark, Percent, Banknote, Coins, CalendarClock, FileSignature, Gauge, Eye, Check, Pencil, Sparkles, History } from '@/lib/lucide-shim';
import { Button, Chip } from '../../ui/kit';
import { CountUp } from '../../ui/HudBits';
import { IconTile, Glide } from '../../people/PeopleBits';
import { formatCurrency } from '../../../lib/utils';
import './moneyBoardStyles';

/*
  The Money board (DESIGN.md → "Money motion"): Money opens on the design and
  execution milestones side by side, with the tax plate on each track. This
  file is the frame: the header and its ring, the four tiles, the bar that
  says a tax change is being previewed, and the two columns.
*/

const money = (v: number) => formatCurrency(Math.round(v));
const Fig: React.FC<{ v: number; className?: string }> = ({ v, className }) => <CountUp value={Math.round(v)} format={money} className={className} />;

export interface BoardTotals {
  contract: number;
  collected: number;
  withClient: number;
  earned: number;
  notEarned: number;
  taxable: number;
  gst: number;
  cash: number;
}

export interface BoardTile {
  key: string;
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ComponentType<any>;
  tone: 'brand' | 'ok' | 'warn' | 'bad' | 'slate';
  onClick?: () => void;
  meter?: { pct: number; tone: 'ok' | 'warn' | 'bad' };
}

export interface BoardPreview {
  before: number;
  after: number;
  gstBefore: number;
  gstAfter: number;
  cashBefore: number;
  cashAfter: number;
  changed: number;
  locked: number;
  needReason: boolean;
  reason: string;
  onReason: (v: string) => void;
  onApply: () => void;
  onDiscard: () => void;
}

const Ring: React.FC<{ t: BoardTotals }> = ({ t }) => {
  const R = 40, C = 2 * Math.PI * R, total = Math.max(1, t.contract);
  let off = 0;
  const seg = (v: number, colour: string) => {
    const len = C * Math.max(0, v) / total;
    const el = <circle cx="48" cy="48" r={R} fill="none" stroke={colour} strokeWidth="11" strokeDasharray={`${len} ${C}`} strokeDashoffset={-off} />;
    off += len;
    return el;
  };
  const pct = t.contract > 0 ? t.collected / t.contract * 100 : 0;
  return (
    <div className="relative w-24 h-24 shrink-0 pp-ring-in">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90 mb-ring" aria-hidden>
        <circle cx="48" cy="48" r={R} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="11" />
        {seg(t.collected, '#3D52A0')}
        {seg(t.withClient, '#F59E0B')}
        {seg(t.earned, 'rgba(61,82,160,0.4)')}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-xl font-black text-slate-800 tabular-nums leading-none"><CountUp value={Math.round(pct)} format={v => `${Math.round(v)}%`} /></span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Collected</span>
      </div>
    </div>
  );
};

export const MoneyBoard: React.FC<{
  totals: BoardTotals;
  milestoneCount: number;
  status: { label: string; tone: 'brand' | 'warn' | 'good' | 'bad' };
  tab: 'board' | 'history';
  onTab: (t: 'board' | 'history') => void;
  historyCount: number;
  onSchedule: () => void;
  scheduleLabel: string;
  onEdit: () => void;
  readOnly?: boolean;
  tiles: BoardTile[];
  preview: BoardPreview | null;
  versionPill?: React.ReactNode;
  notices?: React.ReactNode;
  columns: React.ReactNode;
  breakdown?: React.ReactNode;
  history?: React.ReactNode;
}> = (p) => {
  const t = p.totals;
  const legend: [string, number, string][] = [
    ['Collected', t.collected, 'bg-[#3D52A0]'],
    ['With client', t.withClient, 'bg-amber-500'],
    ['Earned, to invoice', t.earned, 'bg-[#3D52A0]/40'],
    ['Not earned yet', t.notEarned, 'bg-slate-200'],
  ];
  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hud-panel-in">
        <div className="flex flex-wrap items-start gap-5">
          <div className="group flex gap-3.5 min-w-0 flex-1">
            <IconTile icon={Wallet} size="lg" />
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2.5 text-xl font-bold text-slate-800 tracking-tight">
                Money
                <Chip tone={p.status.tone}><span className="w-1.5 h-1.5 rounded-full bg-current" />{p.status.label}</Chip>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pp-live" />Live</span>
              </h2>
              <p className="text-xs text-slate-600 mt-1 tabular-nums"><Fig v={t.collected} /> collected of <b className="text-slate-800"><Fig v={t.contract} /></b> · {p.milestoneCount} {p.milestoneCount === 1 ? 'milestone' : 'milestones'}</p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {([['Taxable', t.taxable, Landmark], ['GST', t.gst, Percent], ['Cash', t.cash, Banknote]] as [string, number, React.ComponentType<any>][]).map(([l, v, I]) => (
                  <span key={l} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    <I className="w-3.5 h-3.5 text-[#3D52A0]" />{l} <b className="text-slate-800 tabular-nums"><Fig v={v} /></b>
                  </span>
                ))}
                {p.versionPill}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
            <Ring t={t} />
            <div className="grid grid-cols-[10px_auto_auto] gap-x-3 gap-y-1.5 items-center text-xs">
              {legend.map(([l, v, c]) => (
                <React.Fragment key={l}>
                  <span className={`w-2 h-2 rounded-full ${c}`} />
                  <span className="text-slate-600">{l}</span>
                  <b className="text-right text-slate-800 tabular-nums"><Fig v={v} /></b>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Glide id="money-tab" label="Money view" value={p.tab} onChange={p.onTab}
            options={[{ id: 'board', label: `Milestones · ${p.milestoneCount}` }, { id: 'history', label: p.historyCount ? `History · ${p.historyCount}` : 'History', icon: History }]} />
          <span className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={FileSignature} onClick={p.onSchedule}>{p.scheduleLabel}</Button>
            {!p.readOnly && <Button size="sm" variant="primary" icon={Pencil} className="pp-press" onClick={p.onEdit}>Edit milestones</Button>}
          </span>
        </div>
      </section>

      {p.tab === 'board' ? (
        <motion.div key="board" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4">
          {p.notices}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {p.tiles.map((tile, i) => {
              const body = (
                <>
                  <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <IconTile icon={tile.icon} tone={tile.tone} size="sm" />{tile.label}
                  </span>
                  <span className="mt-1.5 block text-lg font-black text-slate-800 tabular-nums leading-tight">{tile.value}</span>
                  {tile.meter && (
                    <span className="relative mt-1.5 block h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <motion.span className={`absolute inset-y-0 left-0 rounded-full ${tile.meter.tone === 'bad' ? 'bg-rose-500' : tile.meter.tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        initial={{ width: 0 }} animate={{ width: `${Math.min(100, tile.meter.pct / 2)}%` }} transition={{ duration: 0.8 }} />
                      <span className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-600" title="The yearly limit" />
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] text-slate-500">{tile.sub}</span>
                </>
              );
              const cls = 'group pp-lift min-w-0 text-left bg-white rounded-2xl border border-slate-200 px-4 py-3';
              return (
                <motion.div key={tile.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="grid">
                  {tile.onClick ? <button type="button" onClick={tile.onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>}
                </motion.div>
              );
            })}
          </div>

          <AnimatePresence>
            {p.preview && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}
                className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[#3D52A0] bg-white px-4 py-3 shadow-lg">
                <IconTile icon={Eye} size="md" />
                <div className="flex-1 min-w-[240px] text-xs text-slate-700 space-y-1">
                  <p className="text-sm font-bold text-slate-800">Previewing a change. Nothing is saved yet.</p>
                  <p className="tabular-nums">Client pays {money(p.preview.before)} → <b className="text-slate-800"><Fig v={p.preview.after} /></b>
                    {' '}· GST {money(p.preview.gstBefore)} → <Fig v={p.preview.gstAfter} /> · cash {money(p.preview.cashBefore)} → <Fig v={p.preview.cashAfter} /></p>
                  <p>{p.preview.changed} unpaid milestone{p.preview.changed === 1 ? '' : 's'} change, shown on the cards below.
                    {p.preview.locked > 0 && ` ${p.preview.locked} paid or invoiced keep${p.preview.locked === 1 ? 's' : ''} the figures ${p.preview.locked === 1 ? 'it was' : 'they were'} billed at.`}</p>
                  {p.preview.needReason && (
                    <input value={p.preview.reason} onChange={e => p.preview!.onReason(e.target.value)} aria-label="Why the tax terms are changing"
                      placeholder="Why? For example: client wants more billed with GST"
                      className="mt-1 w-full max-w-md px-3 py-1.5 rounded-lg border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
                  )}
                </div>
                <Button size="sm" variant="secondary" onClick={p.preview.onDiscard}>Discard</Button>
                <Button size="sm" variant="primary" icon={Check} className="pp-press" disabled={p.preview.needReason && p.preview.reason.trim().length < 3} onClick={p.preview.onApply}>Apply to the schedule</Button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-start">{p.columns}</div>
          {p.breakdown}
        </motion.div>
      ) : (
        <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4">
          {p.history}
        </motion.div>
      )}
    </div>
  );
};

export const BOARD_ICONS = { Coins, CalendarClock, FileSignature, Gauge, Sparkles };
