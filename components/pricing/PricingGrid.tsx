import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  GitBranch, PieChart, GitCompareArrows, Gift, CalendarClock, Gauge, Pencil, CopyPlus, Unlink, Trash2,
  SlidersHorizontal, Upload, MoreHorizontal, Lock, CheckCircle2, AlertTriangle, RefreshCw, Eye, Undo2,
} from '@/lib/lucide-shim';
import { Item, ProjectContext, ProposalTier } from '../../types';
import { buildBankMap } from '../../lib/boqPricing';
import { optionPrice, type compareTiers } from '../../lib/tierComparison';
import { formatCurrency } from '../../lib/utils';
import { computeSchedule, contractInForce, gstTermsOf } from '../../lib/paymentSchedule';
import { SCOPE_PARTS, scopeSplit, dealFor, lowMarginLines, staleOffer, refreshedOffer, type OfferDiscount } from '../../lib/offers';
import { buildRevisionIndex, diffTiers } from '../../lib/boqVersions';
import { versionNo, sameOption, optionChains, type OptionChain } from '../../lib/optionChains';
import { IconTile, listV, rowV, DoneTick, Confetti, EASE } from '../people/PeopleBits';
import { cardV } from '../opsDesk/DeskBits';
import { CountUp } from '../ui/HudBits';

/*
  Pricing & Tiers as one grid (DESIGN.md "Pricing & Tiers motion").

  The owner found the screen disconnected: option columns on top, and under
  them a rail, a "Selected" panel and comparison tables in another style. Now
  every section is a band whose rows read across the same columns, one column
  per OPTION. An option's versions are steps inside its column (v1, v2...), so
  a client's change never becomes a fourth column, and "Changed since v1" says
  what moved, with the studio's reasons from the BOQ's change log.
*/

export interface GridColumn {
  chain: OptionChain;
  /** The version the column shows. */
  tier: ProposalTier;
  /** True when it is the newest version of its option. */
  latest: boolean;
  /** The version it was made from, in the same option. */
  prev?: ProposalTier;
}

export interface GridActions {
  select: (tierId: string) => void;
  pickVersion: (tierId: string) => void;
  editBoq?: (tierId: string) => void;
  newVersion: (tierId: string) => void;
  copyAsOption: (tierId: string) => void;
  ownOption: (tierId: string) => void;
  startRename: (tierId: string) => void;
  importBoq?: () => void;
  remove: (tierId: string) => void;
  approve: (tierId: string) => void;
  askRevert: () => void;
  keepApproval: () => void;
  revert: () => void;
  sync?: (tierId: string) => void;
  tuneMargin: (tierId: string) => void;
  startRevision: () => void;
  offers?: (tierId: string) => void;
  saveDiscounts: (next: OfferDiscount[]) => void;
}

interface Props {
  columns: GridColumn[];
  /** After signing: the options the client did not choose, folded to one line each. */
  notChosen: ProposalTier[];
  showNotChosen: boolean;
  onToggleNotChosen: () => void;
  allTiers: ProposalTier[];
  bank: Item[];
  projectContext: ProjectContext;
  activeTierId: string | null;
  specLabel?: Record<string, string>;
  comparison: ReturnType<typeof compareTiers>;
  studioMedianGm: number | null;
  benchmarksCount: number;
  signedTierId?: string | null;
  scopeFlowOn: boolean;
  revertOpen: boolean;
  revertToName: string | null;
  describeApproval: (t: ProposalTier) => string;
  canDelete: (tierId: string) => boolean;
  /** The option name being edited, in place. */
  renaming: { id: string | null; value: string; onChange: (v: string) => void; onSave: () => void; onKey: (e: React.KeyboardEvent<HTMLInputElement>) => void };
  actions: GridActions;
}

const EYEBROW = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
const CHIP = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider';
const SECONDARY = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50';
const PRIMARY = 'pp-press inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50';
const day = (ms: number) => new Date(ms || 0).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const money = (v: number) => formatCurrency(Math.round(v));
const signedMoney = (v: number) => `${v > 0 ? '+ ' : v < 0 ? '− ' : ''}${formatCurrency(Math.abs(Math.round(v)))}`;

/* The grid every band shares: its columns, the options in them, and the selected column's tint. */
const GridCtx = React.createContext<{ grid: React.CSSProperties; cols: any[]; tint: (id: string) => string; still: boolean }>({ grid: {}, cols: [], tint: () => '', still: true });

/* One band: a card whose rows read across the option columns. */
function Band({ icon, title, blurb, right, children, i }: { icon: React.ComponentType<any>; title: string; blurb?: string; right?: React.ReactNode; children: React.ReactNode; i: number }) {
  const { still } = React.useContext(GridCtx);
  return (
    <motion.section
      variants={still ? undefined : cardV}
      initial={still ? false : 'hidden'}
      animate="show"
      transition={{ delay: i * 0.05 }}
      style={{ transformPerspective: 1200 }}
      aria-label={title}
      className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <IconTile icon={icon} size="sm" className="!w-9 !h-9 !rounded-xl" />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-800">{title}</h3>
          {blurb && <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>}
        </div>
        {right}
      </div>
      <motion.div variants={still ? undefined : listV} initial={still ? false : 'hidden'} animate="show">{children}</motion.div>
    </motion.section>
  );
}

/* A row: its label on the left (kept in view while the columns scroll), one cell per option.
   A cell's content turns in again when its column switches version. */
function Row({ label, sub, cells, strong }: { key?: React.Key; label: React.ReactNode; sub?: React.ReactNode; cells: (c: any) => React.ReactNode; strong?: boolean }) {
  const { grid, cols, tint, still } = React.useContext(GridCtx);
  return (
    <motion.div variants={still ? undefined : rowV} className="grid border-t border-slate-100" style={grid}>
      <div className={`sticky left-0 z-10 bg-white px-5 py-2.5 text-xs ${strong ? 'font-bold text-slate-800' : 'font-semibold text-slate-600'}`}>
        {label}
        {sub && <p className="text-[10px] font-medium text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {cols.map((c) => (
        <div key={c.chain.root.id} className={`px-4 py-2.5 text-xs tabular-nums text-slate-800 transition-colors ${tint(c.tier.id)}`}>
          <motion.div key={c.tier.id} initial={still ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            {cells(c)}
          </motion.div>
        </div>
      ))}
    </motion.div>
  );
}

/* A bar that grows from the left. */
function Bar({ pct }: { pct: number }) {
  const { still } = React.useContext(GridCtx);
  return (
    <span className="block h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5" aria-hidden>
      <motion.span className="block h-full rounded-full bg-[#3D52A0]" initial={still ? false : { width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }} transition={{ duration: 0.7, ease: EASE }} />
    </span>
  );
}

export default function PricingGrid(props: Props) {
  const { columns, bank, projectContext, activeTierId, specLabel = {}, comparison, actions } = props;
  const ctx: any = projectContext || {};
  const still = useReducedMotion();
  const bankMap = useMemo(() => buildBankMap(bank || [], ctx.adHocItems), [bank, ctx.adHocItems]);
  const chains = useMemo(() => optionChains(props.allTiers), [props.allTiers]);
  const discounts: OfferDiscount[] = (ctx.financials?.discounts || []) as OfferDiscount[];
  const terms = gstTermsOf(ctx);
  const signed = contractInForce(ctx);
  const area = Number(ctx.area) || 0;
  const revisionIndex = useMemo(() => buildRevisionIndex(ctx.boqRevisions || []), [ctx.boqRevisions]);

  const cols = useMemo(() => columns.map((c) => {
    const t = c.tier;
    const price = optionPrice(t);
    const split = scopeSplit(t, bankMap);
    const deal = dealFor(t.summary, discounts, terms);
    const offers = discounts.filter((d) => !d.basis || sameOption(chains, d.basis.tierId, t.id));
    const milestones = signed ? [] : computeSchedule({ context: ctx, tierSummary: t.summary }).amounts;
    const diff = c.prev ? diffTiers(c.prev, t, bankMap, revisionIndex) : null;
    const moved = diff ? diff.rooms.flatMap((r) => r.lines).filter((l) => l.kind !== 'unchanged').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) : [];
    return { ...c, price, split, deal, offers, milestones, diff, moved, thin: lowMarginLines(t, bankMap) };
  }), [columns, bankMap, discounts, terms, signed, ctx, chains, revisionIndex]);

  const cheapest = Math.min(...cols.map((c) => c.price.total).filter((v) => v > 0));
  const grid = { gridTemplateColumns: `176px repeat(${Math.max(1, cols.length)}, minmax(240px, 1fr))` };
  const minWidth = 176 + Math.max(1, cols.length) * 240;
  const anyChange = cols.some((c) => c.prev);
  const milestoneNames = cols.find((c) => c.milestones.length)?.milestones.map((m) => m.name) || [];

  /* Approving draws a tick and a short burst on that column. */
  const [cheer, setCheer] = useState<string | null>(null);
  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(() => setCheer(null), 1600);
    return () => clearTimeout(t);
  }, [cheer]);

  const [showAll, setShowAll] = useState(false);

  const isSel = (id: string) => id === activeTierId;
  const tint = (id: string) => (isSel(id) ? 'bg-[#3D52A0]/5' : '');

  /* One band: a card whose rows read across the option columns. */
  const status = (c: typeof cols[number]) => {
    const t = c.tier;
    if (t.id === props.signedTierId) return <span className={`${CHIP} bg-emerald-100 text-emerald-700`}>Signed</span>;
    if (ctx.approvedTierId === t.id) return <span className={`${CHIP} bg-emerald-100 text-emerald-700`}>Approved</span>;
    if (!c.latest) return <span className={`${CHIP} bg-slate-100 text-slate-600`}>Earlier version</span>;
    if (t.lifecycleTag === 'Superseded') return <span className={`${CHIP} bg-slate-100 text-slate-600`}>Superseded</span>;
    if (isSel(t.id)) return <span className={`${CHIP} bg-[#3D52A0]/10 text-[#3D52A0]`}>Selected</span>;
    return <span className={`${CHIP} bg-slate-100 text-slate-600`}>Draft</span>;
  };

  const approval = (c: typeof cols[number]) => {
    const t = c.tier;
    if (t.id === props.signedTierId) {
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> In force · signed · read-only</p>
          <p className="text-[11px] text-emerald-800/80">A change goes through a Scope Revision the client signs, and the payment schedule follows.</p>
          <button type="button" onClick={actions.startRevision} className={PRIMARY}>Start a revision</button>
        </div>
      );
    }
    if (ctx.approvedTierId === t.id) {
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Frozen at approval</p>
          <p className="text-[11px] text-emerald-800/80">{money(c.price.total)} at {(t.summary.blendedGm ?? 0).toFixed(1)}%, {props.describeApproval(t)}. Editing its BOQ makes the next version.</p>
          {isSel(t.id) && (props.revertOpen ? (
            <>
              <p className="text-[11px] text-slate-700" data-testid="revert-approval-confirm">
                {t.name} goes back to a draft. {props.revertToName
                  ? <><b className="text-slate-900">{props.revertToName}</b> becomes the approved baseline again, at the value it was booked at.</>
                  : <>Nothing will be approved until you approve an option again.</>}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={actions.keepApproval} className={SECONDARY}>Keep approval</button>
                <button type="button" onClick={actions.revert} className={SECONDARY}><Undo2 className="w-3.5 h-3.5" /> Revert to draft</button>
              </div>
            </>
          ) : (
            <button type="button" onClick={actions.askRevert} className={SECONDARY}>Revert approval</button>
          ))}
        </div>
      );
    }
    if (props.scopeFlowOn && props.signedTierId) return null;
    if (!c.latest) {
      return <p className="text-[11px] text-slate-500">An earlier version, kept as it was. The newest is v{c.chain.versions.length}.</p>;
    }
    if (!isSel(t.id)) return null;
    return (
      <button type="button" onClick={() => { actions.approve(t.id); setCheer(t.id); }} className={PRIMARY}>
        <CheckCircle2 className="w-4 h-4" /> Approve option
      </button>
    );
  };

  return (
    <GridCtx.Provider value={{ grid, cols, tint, still: !!still }}>
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex flex-col gap-3" style={{ minWidth }}>

        {/* The options, with their versions, price and approval. */}
        <motion.section
          variants={still ? undefined : cardV} initial={still ? false : 'hidden'} animate="show" style={{ transformPerspective: 1200 }}
          aria-label="Options side by side" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="grid" style={grid}>
            <div className="sticky left-0 z-10 bg-white px-5 py-4">
              <p className={EYEBROW}>Options</p>
              <p className="text-[11px] text-slate-500 mt-1">Click one to select it. Its versions are under its name.</p>
            </div>
            {cols.map((c, i) => {
              const t = c.tier;
              const sel = isSel(t.id);
              return (
                <article
                  key={c.chain.root.id}
                  aria-label={t.name}
                  onClick={() => actions.select(t.id)}
                  className={`relative px-4 pt-5 pb-4 flex flex-col gap-3 cursor-pointer transition-colors ${tint(t.id)} hud-row-in`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {sel && <motion.span layoutId="pt-selected" className="absolute inset-x-0 top-0 h-[3px] bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  {cheer === t.id && <span className="absolute right-6 top-6"><Confetti pieces={16} spread={70} /></span>}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {props.renaming.id === t.id ? (
                        <input
                          type="text" autoFocus aria-label="Option name" value={props.renaming.value}
                          onChange={(e) => props.renaming.onChange(e.target.value)} onBlur={props.renaming.onSave} onKeyDown={props.renaming.onKey}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 rounded-lg border border-slate-300 text-sm font-bold outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
                        />
                      ) : (
                        <h3 className="font-bold text-slate-800 truncate" title="Double-click to rename" onDoubleClick={() => actions.startRename(t.id)}>{t.name}</h3>
                      )}
                      {specLabel[t.id] && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{specLabel[t.id]}</p>}
                    </div>
                    <span className="flex items-center gap-1 shrink-0">{cheer === t.id && <DoneTick size={22} />}{status(c)}</span>
                  </div>

                  {c.chain.versions.length > 1 && (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Versions of ${c.chain.root.name}`}>
                      {c.chain.versions.map((v) => {
                        const on = v.id === t.id;
                        return (
                          <button
                            key={v.id} type="button" aria-pressed={on}
                            title={v.name !== c.chain.root.name ? v.name : undefined}
                            onClick={(e) => { e.stopPropagation(); actions.pickVersion(v.id); }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${on ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                          >
                            v{versionNo(c.chain, v.id)} · {day(v.timestamp)}
                            {(ctx.approvedTierId === v.id || v.id === props.signedTierId) && <CheckCircle2 className="w-3 h-3" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <p className="text-2xl font-black text-slate-800 tracking-tight">
                      <span aria-hidden><CountUp value={Math.round(c.price.total)} format={money} /></span>
                      <span className="sr-only">{money(c.price.total)}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {area > 0 && <>₹{Math.round(c.price.total / area).toLocaleString('en-IN')}/sq ft · </>}
                      {(t.summary.blendedGm ?? 0).toFixed(1)}% margin
                      {cheapest > 0 && c.price.total > cheapest && <span className="text-amber-700"> · +{Math.round((c.price.total / cheapest - 1) * 100)}%</span>}
                    </p>
                    {c.price.designFee > 0 && (
                      <p className="text-[11px] text-slate-500 tabular-nums" data-testid="option-split">
                        work {money(c.price.work)} + design fee {money(c.price.designFee)}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">{t.summary.itemCount ?? t.boq?.length ?? 0} items · {(t.summary.blendedGm ?? 0).toFixed(1)}% GM</p>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>{approval(c)}</div>
                </article>
              );
            })}
          </div>
        </motion.section>

        {/* After signing, the options not chosen fold away. */}
        {props.notChosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500">
            <span className={EYEBROW}>Not chosen</span>
            {props.notChosen.map((t) => <span key={t.id} className="text-slate-600">{t.name} · {money(optionPrice(t).total)}</span>)}
            <button type="button" onClick={props.onToggleNotChosen} className="font-bold text-[#3D52A0] hover:text-[#334486]">{props.showNotChosen ? 'Fold them' : 'Show them'}</button>
          </div>
        )}

        {anyChange && (
          <Band i={1} icon={GitBranch} title="Changed since the previous version" blurb="What moved in each option's newest step, with the reasons from the BOQ's change log.">
            <Row label="Total" strong cells={(c) => (c.diff
              ? <span className={`font-bold ${c.diff.delta > 0 ? 'text-amber-700' : c.diff.delta < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {signedMoney(c.diff.delta)} vs v{versionNo(c.chain, c.prev!.id)} · {c.diff.added + c.diff.removed + c.diff.changed} lines
                </span>
              : <span className="text-slate-400">No earlier version</span>)} />
            <Row label="What moved" cells={(c) => (c.moved.length === 0
              ? <span className="text-slate-400">{c.diff ? 'Nothing priced moved' : '—'}</span>
              : <ul className="space-y-1">
                  {c.moved.slice(0, 4).map((l) => (
                    <li key={l.key} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : ''}{l.name}
                        <span className="block text-[10px] text-slate-400">{[l.room, l.reasons[0]?.reason].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={`shrink-0 font-semibold ${l.delta > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{signedMoney(l.delta)}</span>
                    </li>
                  ))}
                  {c.moved.length > 4 && <li className="text-[10px] text-slate-400">and {c.moved.length - 4} more</li>}
                </ul>)} />
          </Band>
        )}

        <Band i={2} icon={PieChart} title="Where the money goes" blurb="Each option's work, part by part: carpentry, functional, civil and the rest.">
          {SCOPE_PARTS.map((p) => (
            <Row key={p.id} label={p.label} sub={p.detail} cells={(c) => {
              const v = c.split.parts[p.id].value;
              return <><span className="font-semibold">{money(v)}</span><Bar pct={c.split.total > 0 ? (v / c.split.total) * 100 : 0} /></>;
            }} />
          ))}
        </Band>

        <Band
          i={3} icon={GitCompareArrows} title="What separates them" blurb="What each option covers, and where they differ in extent or specification."
          right={(comparison.coverage.length > 6 || comparison.only.length + comparison.extent.length + comparison.spec.length > 6) && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-bold text-[#3D52A0] hover:text-[#334486] shrink-0">
              {showAll ? 'Show fewer' : 'Show everything'}
            </button>
          )}
        >
          {comparison.coverage.slice(0, showAll ? undefined : 6).map((row) => (
            <Row key={`cov-${row.cat}`} label={row.cat} cells={(c) => {
              const cell: any = row.cells[c.tier.id];
              return !cell || cell.lines === 0
                ? <span className="text-slate-300">not covered</span>
                : <><span className="flex justify-between gap-2"><span className="font-semibold">{money(cell.value)}</span><span className="text-[10px] text-slate-400">{cell.lines} {cell.lines === 1 ? 'line' : 'lines'}</span></span><Bar pct={cell.share * 100} /></>;
            }} />
          ))}
          {comparison.only.slice(0, showAll ? undefined : 2).map((r) => (
            <Row key={`only-${r.bankId}`} label={r.name} sub={`Only in some · ${r.cat}`} cells={(c) => {
              const cell = r.cells[c.tier.id];
              return !cell ? <span className="text-slate-300">not included</span> : <span className="font-semibold text-emerald-700">{money(cell.value)} <span className="text-[10px] font-medium text-slate-400">{Number(cell.qty.toFixed(2))} {r.unit}</span></span>;
            }} />
          ))}
          {comparison.extent.slice(0, showAll ? undefined : 2).map((r) => (
            <Row key={`ext-${r.bankId}`} label={r.name} sub={`More of it · ${r.cat}`} cells={(c) => {
              const cell = r.cells[c.tier.id];
              return !cell ? <span className="text-slate-300">—</span> : <span className="font-semibold">{Number(cell.qty.toFixed(2))} {r.unit} <span className="text-[10px] font-medium text-slate-400">{money(cell.value)}</span></span>;
            }} />
          ))}
          {comparison.spec.slice(0, showAll ? undefined : 2).map((r) => (
            <Row key={`spec-${r.bankId}`} label={r.name} sub={`Different specification · ${r.cat}`} cells={(c) => {
              const cell = r.cells[c.tier.id];
              return !cell ? <span className="text-slate-300">—</span> : <span className="font-semibold">{money(cell.value)} <span className="text-[10px] font-medium text-slate-400">₹{Math.round(cell.rate).toLocaleString('en-IN')}/{r.unit}</span></span>;
            }} />
          ))}
          <Row label="Work" cells={(c) => <span className="font-semibold">{money(comparison.totals[c.tier.id] || 0)}</span>} />
          {cols.some((c) => c.price.designFee > 0) && <Row label="Design fee" cells={(c) => <span className="font-semibold">{money(c.price.designFee)}</span>} />}
          <Row label="Total" strong cells={(c) => <span className="font-black" data-testid={`coverage-total-${c.tier.id}`}>{money(c.price.total)}</span>} />
          {(comparison.same.length > 0 || (comparison.only.length === 0 && comparison.extent.length === 0 && comparison.spec.length === 0 && cols.length > 1)) && (
            <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
              {comparison.only.length === 0 && comparison.extent.length === 0 && comparison.spec.length === 0 && cols.length > 1
                ? <span className="text-amber-800"><b>These options are the same bill of quantities.</b> They differ only in margin, so there is nothing a client could choose between. Vary the specification, the extent, or what each includes.</span>
                : <><b className="text-slate-700">{comparison.same.length} items are the same in every option</b>: same scope, quantity and rate. They are not what the client is choosing between.</>}
            </div>
          )}
        </Band>

        <Band i={4} icon={Gift} title="Offers and what the client pays" blurb="Offers are written in Money & Offers. An offer priced on an earlier version follows the option.">
          <Row label="Offers" cells={(c) => (c.offers.length === 0
            ? <span className="text-slate-400">None yet</span>
            : <ul className="space-y-1.5">
                {c.offers.map((d) => {
                  const stale = staleOffer(d, c.tier.id, c.split, (a, b) => sameOption(chains, a, b));
                  const earlier = !!d.basis && d.basis.tierId !== c.tier.id;
                  return (
                    <li key={d.id}>
                      <span className="flex justify-between gap-2"><span className="truncate">{d.name}</span><span className="shrink-0 text-emerald-700">− {d.type === 'percentage' ? `${d.value}%` : money(d.value)}</span></span>
                      {stale !== null && (
                        <span className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                          <span>{earlier ? `Priced on v${versionNo(c.chain, d.basis!.tierId) || '?'}. On v${versionNo(c.chain, c.tier.id)} it is ${money(stale)}.` : `The BOQ changed: it is now ${money(stale)}.`}</span>
                          {c.latest && (
                            <button type="button" className="font-bold text-[#3D52A0] hover:text-[#334486]"
                              onClick={() => actions.saveDiscounts(discounts.map((x) => (x.id === d.id ? refreshedOffer(x, c.tier.id, stale) : x)))}>
                              Update
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>)} />
          <Row label="Client pays, with GST" strong cells={(c) => <span className="font-black">{money(c.deal.clientPays)}</span>} />
        </Band>

        {milestoneNames.length > 0 && (
          <Band i={5} icon={CalendarClock} title="Milestones" blurb="What the client pays, and when, as Money will bill it.">
            {milestoneNames.map((name, mi) => (
              <Row key={`${name}-${mi}`} label={name} cells={(c) => <span className="font-semibold">{c.milestones[mi] ? money(c.milestones[mi].invoiceTotal) : '—'}</span>} />
            ))}
          </Band>
        )}

        <Band i={6} icon={Gauge} title="Margin check" blurb={props.studioMedianGm === null ? 'No other priced projects to compare yet' : `Against the median of ${props.benchmarksCount} other priced ${props.benchmarksCount === 1 ? 'project' : 'projects'}.`}>
          {props.studioMedianGm !== null && (
            <Row label={`Studio median ${props.studioMedianGm.toFixed(1)}%`} cells={(c) => {
              const d = (c.tier.summary.blendedGm ?? 0) - props.studioMedianGm!;
              return <span className={`font-semibold ${d < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)} pts</span>;
            }} />
          )}
          <Row label="Above the 20% floor" cells={(c) => {
            const d = (c.tier.summary.blendedGm ?? 0) - 20;
            return <span className={`font-semibold ${d < 0 ? 'text-rose-700' : 'text-slate-800'}`}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)} pts</span>;
          }} />
          <Row label="Lines under 15% margin" cells={(c) => (c.thin > 0
            ? <span className="font-semibold text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{c.thin} {c.thin === 1 ? 'line' : 'lines'}</span>
            : <span className="text-slate-400">None</span>)} />
        </Band>

        {/* What can be done with each option. */}
        <section aria-label="Actions" className="bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in">
          <div className="grid" style={grid}>
            <div className="sticky left-0 z-10 bg-white rounded-l-2xl px-5 py-4"><p className={EYEBROW}>Do</p></div>
            {cols.map((c) => (
              <div key={c.chain.root.id} className={`px-4 py-4 flex flex-wrap gap-2 transition-colors ${tint(c.tier.id)}`}>
                <ColumnActions col={c} {...props} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
    </GridCtx.Provider>
  );
}

/* Edit BOQ, New version, Offers, and the rest under ⋯ (what used to be in the rail). */
function ColumnActions({ col, actions, projectContext, signedTierId, scopeFlowOn, canDelete }: { col: GridColumn } & Props) {
  const t = col.tier;
  const ctx: any = projectContext || {};
  const isSigned = t.id === signedTierId;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const item = 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-semibold text-slate-700 hover:bg-slate-100';
  const run = (fn: () => void) => () => { setOpen(false); fn(); };

  const latest = col.latest;
  const more = (
    <div className="relative" ref={box}>
      <button type="button" aria-label={`More for ${t.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={SECONDARY}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" aria-label={`More for ${t.name}`} className="phd-pop absolute right-0 bottom-full mb-2 z-30 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
          {latest && <button role="menuitem" type="button" className={item} onClick={run(() => actions.startRename(t.id))}><Pencil className="w-4 h-4 text-slate-400" /> Rename</button>}
          {latest && <button role="menuitem" type="button" className={item} onClick={run(() => actions.copyAsOption(t.id))}><CopyPlus className="w-4 h-4 text-slate-400" /> Copy as a new option</button>}
          {t.parentTierId && col.chain.versions.length > 1 && (
            <button role="menuitem" type="button" className={item} onClick={run(() => actions.ownOption(t.id))}><Unlink className="w-4 h-4 text-slate-400" /> Make it its own option</button>
          )}
          {latest && !isSigned && <button role="menuitem" type="button" className={item} onClick={run(() => actions.tuneMargin(t.id))}><SlidersHorizontal className="w-4 h-4 text-slate-400" /> Tune margin</button>}
          {latest && actions.importBoq && <button role="menuitem" type="button" className={item} onClick={run(actions.importBoq)}><Upload className="w-4 h-4 text-slate-400" /> Import a BOQ</button>}
          {latest && actions.sync && !scopeFlowOn && !isSigned && (
            <button role="menuitem" type="button" className={item} onClick={run(() => actions.sync!(t.id))}><RefreshCw className="w-4 h-4 text-slate-400" /> Sync to Payments & Revisions</button>
          )}
          {canDelete(t.id) && (
            <button role="menuitem" type="button" className={`${item} text-rose-700 hover:bg-rose-50`} onClick={run(() => actions.remove(t.id))}>
              <Trash2 className="w-4 h-4" /> Delete {col.chain.versions.length > 1 ? `v${versionNo(col.chain, t.id)}` : 'option'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (!latest) {
    return (
      <>
        <button type="button" onClick={() => actions.pickVersion(col.chain.versions[col.chain.versions.length - 1].id)} className={SECONDARY}>
          <Eye className="w-3.5 h-3.5" /> Back to v{col.chain.versions.length}
        </button>
        {more}
      </>
    );
  }

  return (
    <>
      {actions.editBoq && (
        <button type="button" onClick={() => actions.editBoq!(t.id)} className={SECONDARY}>
          <Pencil className="w-3.5 h-3.5" /> {isSigned ? 'View BOQ' : 'Edit BOQ'}
        </button>
      )}
      {!isSigned && (
        <button type="button" onClick={() => actions.newVersion(t.id)} className={SECONDARY} title="Copy this option into its next version, in the same column">
          <GitBranch className="w-3.5 h-3.5" /> New version
        </button>
      )}
      {actions.offers && (
        <button type="button" onClick={() => actions.offers!(t.id)} className={SECONDARY}><Gift className="w-3.5 h-3.5" /> Offers</button>
      )}
      {more}
    </>
  );
}
