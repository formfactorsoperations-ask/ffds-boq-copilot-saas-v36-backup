import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  GitBranch, ChartPie, GitCompareArrows, Gift, Gauge, Pencil, CopyPlus, Unlink, Trash2, HandCoins,
  SlidersHorizontal, Upload, MoreHorizontal, Lock, CheckCircle2, AlertTriangle, RefreshCw, Eye, Undo2,
  Hammer, Zap, BrickWall, Package, ChefHat, PaintRoller, LampCeiling, Droplets, Flower2, Truck, AirVent,
  Grid3x3, Lightbulb, Armchair, Frame, PanelsTopLeft, Blinds, HardHat, Bath, Sprout, Gem, Crown, Sparkles,
  ChevronRight, BadgeCheck, CalendarRange,
} from '@/lib/lucide-shim';
import { Item, ProjectContext, ProposalTier } from '../../types';
import { buildBankMap } from '../../lib/boqPricing';
import { optionPrice, type compareTiers } from '../../lib/tierComparison';
import { formatCurrency } from '../../lib/utils';
import { computeSchedule, contractInForce, gstTermsOf } from '../../lib/paymentSchedule';
import { SCOPE_PARTS, scopeSplit, dealFor, lowMarginLines, staleOffer, refreshedOffer, type OfferDiscount, type ScopePart, type SplitLine } from '../../lib/offers';
import { buildRevisionIndex, diffTiers } from '../../lib/boqVersions';
import { versionNo, sameOption, optionChains, type OptionChain } from '../../lib/optionChains';
import { IconTile, Ring, Tilt, DoneTick, Confetti, EASE, listV, rowV } from '../people/PeopleBits';
import { cardV, deskSectionV } from '../opsDesk/DeskBits';
import { CountUp } from '../ui/HudBits';

/*
  Pricing & Tiers as one grid (DESIGN.md "Pricing & Tiers motion").

  One column per OPTION, its versions (v1, v2...) inside it, so a client's
  change never becomes a fourth column. The option cards carry what decides
  a choice -- price, margin, what it is made of, approval, actions -- and
  under them ONE view at a time, picked from a switcher: where the money
  goes, what is different, offers and payments, margin, versions and the
  contract. The owner found a page of stacked sections too long to scroll.

  "Where the money goes" is the check on the figures: each part opens to the
  trades that make it up, and each trade to its BOQ lines, and the parts add up to the option's work, which
  the screen says in so many words (or says by how much it does not).
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
  /** The studio's own projects closest in size (shown under Margin). */
  comparables?: React.ReactNode;
  /** The contract's value from booking to today (shown under Versions & contract). */
  history?: React.ReactNode;
  /** True when the contract has a value over time to show. */
  hasHistory?: boolean;
  /** "3 options · 4 versions", and the buttons that act on every option (Add option, Regenerate). */
  summary?: string;
  toolbar?: React.ReactNode;
}

type Lens = 'money' | 'diff' | 'pay' | 'margin' | 'history';

const EYEBROW = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
const CHIP = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider';
const SECONDARY = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50';
const PRIMARY = 'pp-press inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50';
const day = (ms: number) => new Date(ms || 0).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const money = (v: number) => formatCurrency(Math.round(v));
const signedMoney = (v: number) => `${v > 0 ? '+ ' : v < 0 ? '− ' : ''}${formatCurrency(Math.abs(Math.round(v)))}`;

/* Each part of the job, its icon and its shade of the brand (no new accent colours). */
const PART_LOOK: Record<ScopePart, { icon: React.ComponentType<any>; shade: string }> = {
  carpentry: { icon: Hammer, shade: 'bg-[#3D52A0]' },
  functional: { icon: Zap, shade: 'bg-[#3D52A0]/65' },
  civil: { icon: BrickWall, shade: 'bg-[#3D52A0]/40' },
  others: { icon: Package, shade: 'bg-[#3D52A0]/20' },
};

/** An icon for a trade or category, read from its name. */
export function tradeIcon(name: string): React.ComponentType<any> {
  const n = (name || '').toLowerCase();
  if (/kitchen/.test(n)) return ChefHat;
  if (/ceiling/.test(n)) return LampCeiling;
  if (/paint/.test(n)) return PaintRoller;
  if (/light/.test(n)) return Lightbulb;
  if (/electric/.test(n)) return Zap;
  if (/plumb|sanitary/.test(n)) return Droplets;
  if (/bath/.test(n)) return Bath;
  if (/hvac|air/.test(n)) return AirVent;
  if (/til|floor/.test(n)) return Grid3x3;
  if (/demolition|site|debris/.test(n)) return /site|debris/.test(n) ? Truck : HardHat;
  if (/civil|masonry|plaster|stone|marble|granite|waterproof/.test(n)) return BrickWall;
  if (/glass|mirror/.test(n)) return PanelsTopLeft;
  if (/decor|art/.test(n)) return Flower2;
  if (/blind|curtain|furnish/.test(n)) return Blinds;
  if (/furniture|loose|sofa/.test(n)) return Armchair;
  if (/panel|tv/.test(n)) return Frame;
  if (/carpentry|wood|wardrobe|joinery|modular/.test(n)) return Hammer;
  return Package;
}

/* The grid every row shares: its columns, the options in them, and the selected column's tint. */
const GridCtx = React.createContext<{ grid: React.CSSProperties; cols: any[]; tint: (id: string) => string; still: boolean }>({ grid: {}, cols: [], tint: () => '', still: true });

/* A row: its label on the left (kept in view while the columns scroll), one cell per option.
   A cell's content turns in again when its column switches version. */
function Row({ label, sub, cells, strong, icon, onLabel, open, title }: {
  key?: React.Key; label: React.ReactNode; sub?: React.ReactNode; cells: (c: any) => React.ReactNode; strong?: boolean;
  icon?: React.ComponentType<any>; onLabel?: () => void; open?: boolean; title?: string;
}) {
  const { grid, cols, tint, still } = React.useContext(GridCtx);
  const Icon = icon;
  const head = (
    <span className="flex items-start gap-2 min-w-0">
      {onLabel && <ChevronRight className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400 transition-transform duration-300 ${open ? 'rotate-90' : ''}`} />}
      {Icon && <IconTile icon={Icon} size="sm" className="!w-7 !h-7 !rounded-lg [&>svg]:!w-3.5 [&>svg]:!h-3.5" />}
      <span className="min-w-0">
        <span className="block">{label}</span>
        {sub && <span className="block text-[10px] font-medium text-slate-400 mt-0.5">{sub}</span>}
      </span>
    </span>
  );
  return (
    <motion.div variants={still ? undefined : rowV} className="group grid border-t border-slate-100" style={grid}>
      <div title={title} className={`sticky left-0 z-10 bg-white px-5 py-2.5 text-xs ${strong ? 'font-bold text-slate-800' : 'font-semibold text-slate-600'}`}>
        {onLabel
          ? <button type="button" onClick={onLabel} aria-expanded={!!open} className="w-full text-left hover:text-slate-900">{head}</button>
          : head}
      </div>
      {cols.map((c) => (
        <div key={c.chain.root.id} className={`px-4 py-2.5 text-xs tabular-nums text-slate-800 transition-colors duration-300 ${tint(c.tier.id)}`}>
          <motion.div key={c.tier.id} initial={still ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            {cells(c)}
          </motion.div>
        </div>
      ))}
    </motion.div>
  );
}

/* A bar that grows from the left. */
function Bar({ pct, shade = 'bg-[#3D52A0]', delay = 0 }: { pct: number; shade?: string; delay?: number }) {
  const { still } = React.useContext(GridCtx);
  return (
    <span className="block h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5" aria-hidden>
      <motion.span className={`block h-full rounded-full ${shade}`} initial={still ? false : { width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }} transition={{ duration: 0.8, ease: EASE, delay }} />
    </span>
  );
}

/* What an option is made of, as one bar of four shades that fill in one after another. */
function PartsBar({ split, still }: { split: ReturnType<typeof scopeSplit>; still: boolean }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 gap-[2px]" role="img"
      aria-label={SCOPE_PARTS.map((p) => `${p.label} ${split.total > 0 ? Math.round((split.parts[p.id].value / split.total) * 100) : 0}%`).join(', ')}>
      {SCOPE_PARTS.map((p, i) => {
        const pct = split.total > 0 ? (split.parts[p.id].value / split.total) * 100 : 0;
        if (pct <= 0) return null;
        return (
          <motion.span key={p.id} className={`h-full ${PART_LOOK[p.id].shade}`} title={`${p.label} ${Math.round(pct)}%`}
            initial={still ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: EASE, delay: 0.25 + i * 0.12 }} />
        );
      })}
    </div>
  );
}

export default function PricingGrid(props: Props) {
  const { columns, bank, projectContext, activeTierId, specLabel = {}, comparison, actions } = props;
  const ctx: any = projectContext || {};
  const still = !!useReducedMotion();
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
  /* The cheapest option is a sprout, the dearest a crown, the ones between a gem. */
  const byPrice = [...cols].sort((a, b) => a.price.total - b.price.total).map((c) => c.tier.id);
  const medal = (id: string) => (cols.length === 1 ? Sparkles : byPrice[0] === id ? Sprout : byPrice[byPrice.length - 1] === id ? Crown : Gem);

  const grid = { gridTemplateColumns: `184px repeat(${Math.max(1, cols.length)}, minmax(250px, 1fr))` };
  const minWidth = 184 + Math.max(1, cols.length) * 250;
  const anyChange = cols.some((c) => c.prev);
  const milestoneNames = cols.find((c) => c.milestones.length)?.milestones.map((m) => m.name) || [];
  const diffCount = comparison.only.length + comparison.extent.length + comparison.spec.length;

  const lenses: { id: Lens; label: string; icon: React.ComponentType<any>; count?: number }[] = [
    { id: 'money', label: 'Where the money goes', icon: ChartPie },
    { id: 'diff', label: 'What’s different', icon: GitCompareArrows, count: diffCount },
    { id: 'pay', label: 'Offers & payments', icon: HandCoins },
    { id: 'margin', label: 'Margin', icon: Gauge },
    ...((anyChange || props.hasHistory) ? [{ id: 'history' as Lens, label: 'Versions & contract', icon: GitBranch, count: cols.filter((c) => c.prev).length || undefined }] : []),
  ];
  const [lens, setLens] = useState<Lens>('money');
  const shownLens = lenses.some((l) => l.id === lens) ? lens : 'money';

  const [openParts, setOpenParts] = useState<Set<ScopePart>>(new Set());
  const togglePart = (p: ScopePart) => setOpenParts((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const allOpen = openParts.size === SCOPE_PARTS.length;
  /* A trade opens to its BOQ lines, keyed "part|trade". */
  const [openTrades, setOpenTrades] = useState<Set<string>>(new Set());
  const toggleTrade = (k: string) => setOpenTrades((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [showAll, setShowAll] = useState(false);

  /* Approving draws a tick and a burst on that option. */
  const [cheer, setCheer] = useState<string | null>(null);
  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(() => setCheer(null), 1800);
    return () => clearTimeout(t);
  }, [cheer]);

  const isSel = (id: string) => id === activeTierId;
  const tint = (id: string) => (isSel(id) ? 'bg-[#3D52A0]/5' : '');

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
          <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5"><BadgeCheck className="w-4 h-4" /> Frozen at approval</p>
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
    if (!c.latest) return <p className="text-[11px] text-slate-500">An earlier version, kept as it was. The newest is v{c.chain.versions.length}.</p>;
    if (!isSel(t.id)) return null;
    return (
      <button type="button" onClick={() => { actions.approve(t.id); setCheer(t.id); }} className={`${PRIMARY} w-full`}>
        <CheckCircle2 className="w-4 h-4" /> Approve option
      </button>
    );
  };

  /* ---- the views under the options ---- */

  const moneyView = (
    <>
      {SCOPE_PARTS.map((p, pi) => {
        const open = openParts.has(p.id);
        const trades: string[] = Array.from(new Set<string>(cols.flatMap((c) => c.split.parts[p.id].trades.map((t: any) => t.trade as string))))
          .sort((a, b) => cols.reduce((s, c) => s + (c.split.parts[p.id].trades.find((t: any) => t.trade === b)?.value || 0), 0) - cols.reduce((s, c) => s + (c.split.parts[p.id].trades.find((t: any) => t.trade === a)?.value || 0), 0));
        return (
          <React.Fragment key={p.id}>
            <Row
              icon={PART_LOOK[p.id].icon} label={p.label} title={p.detail} sub={`${trades.length} ${trades.length === 1 ? 'trade' : 'trades'} · ${open ? 'close' : 'open'}`} strong
              onLabel={() => togglePart(p.id)} open={open}
              cells={(c) => {
                const v = c.split.parts[p.id].value;
                const share = c.split.total > 0 ? (v / c.split.total) * 100 : 0;
                return (
                  <>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-black text-slate-800"><CountUp value={Math.round(v)} format={money} /></span>
                      <span className="text-[10px] font-bold text-slate-400">{share.toFixed(0)}%</span>
                    </span>
                    <Bar pct={share} shade={PART_LOOK[p.id].shade} delay={pi * 0.08} />
                  </>
                );
              }}
            />
            {open && trades.map((trade) => {
              const tk = `${p.id}|${trade}`;
              const tradeOpen = openTrades.has(tk);
              /* Its lines, matched across the options by item and room, the largest first. */
              const lineKey = (l: SplitLine) => `${l.name}\u001f${l.room}`;
              const linesOf = (c: any): SplitLine[] => c.split.parts[p.id].lines.filter((l: SplitLine) => l.trade === trade);
              const sumOf = (c: any, k: string) => linesOf(c).filter((l) => lineKey(l) === k);
              const keys = tradeOpen
                ? Array.from(new Set<string>(cols.flatMap((c) => linesOf(c).map(lineKey))))
                  .sort((a, b) => cols.reduce((s, c) => s + sumOf(c, b).reduce((x, l) => x + l.total, 0), 0) - cols.reduce((s, c) => s + sumOf(c, a).reduce((x, l) => x + l.total, 0), 0))
                : [];
              return (
                <React.Fragment key={tk}>
                  <Row icon={tradeIcon(trade)} label={<span className="font-medium">{trade}</span>} sub={tradeOpen ? 'close' : 'open'}
                    onLabel={() => toggleTrade(tk)} open={tradeOpen} cells={(c) => {
                    const t = c.split.parts[p.id].trades.find((x: any) => x.trade === trade);
                    return !t ? <span className="text-slate-300">not in this option</span>
                      : <span className="flex justify-between gap-2"><span className="font-semibold">{money(t.value)}</span><span className="text-[10px] text-slate-400">{t.lines} {t.lines === 1 ? 'line' : 'lines'}</span></span>;
                  }} />
                  {keys.map((k) => {
                    const [name, room] = k.split('\u001f');
                    return (
                      <Row key={`${tk}\u001f${k}`} title={`${name} · ${room}`}
                        label={<span className="block pl-9 font-medium text-slate-700">{name}</span>}
                        sub={<span className="block pl-9">{room}</span>}
                        cells={(c) => {
                          const ls = sumOf(c, k);
                          if (!ls.length) return <span className="text-slate-300">not in this option</span>;
                          const total = ls.reduce((x, l) => x + l.total, 0);
                          const qty = ls.reduce((x, l) => x + (l.qty || 0), 0);
                          const unit = ls[0].unit;
                          return (
                            <span className="flex justify-between gap-2">
                              <span>{money(total)}</span>
                              <span className="text-[10px] text-slate-400">{Number(qty.toFixed(2))}{unit ? ` ${unit}` : ''}</span>
                            </span>
                          );
                        }} />
                    );
                  })}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
      <Row label="Work" strong sub="The four parts, added up" cells={(c) => {
        const gap = Math.round(c.price.work) - Math.round(c.split.total);
        return (
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-black">{money(c.price.work)}</span>
            {Math.abs(gap) <= 1
              ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> adds up</span>
              : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> parts are {signedMoney(-gap)} off</span>}
          </span>
        );
      }} />
      {cols.some((c) => c.split.asActuals > 0) && (
        <Row label="As actuals" sub="Paid to vendors directly; not in the price" cells={(c) => <span className="text-slate-500">{c.split.asActuals > 0 ? money(c.split.asActuals) : '—'}</span>} />
      )}
      {cols.some((c) => c.price.designFee > 0) && <Row label="Design fee" cells={(c) => <span className="font-semibold">{money(c.price.designFee)}</span>} />}
      <Row label="Total" strong cells={(c) => <span className="text-sm font-black" data-testid={`coverage-total-${c.tier.id}`}>{money(c.price.total)}</span>} />
    </>
  );

  const diffRows = [
    ...comparison.only.map((r) => ({ r, kind: 'Only in some' as const })),
    ...comparison.extent.map((r) => ({ r, kind: 'More of it' as const })),
    ...comparison.spec.map((r) => ({ r, kind: 'Different specification' as const })),
  ];
  const diffView = (
    <>
      {diffRows.length === 0 && cols.length > 1 && (
        <div className="border-t border-slate-100 px-5 py-4 text-xs text-amber-800">
          <b>These options are the same bill of quantities.</b> They differ only in margin, so there is nothing a client could choose between. Vary the specification, the extent, or what each includes.
        </div>
      )}
      {diffRows.slice(0, showAll ? undefined : 8).map(({ r, kind }) => (
        <Row key={`${kind}-${r.bankId}`} icon={tradeIcon(`${r.cat} ${r.name}`)} label={r.name} sub={`${kind} · ${r.cat}`} cells={(c) => {
          const cell = r.cells[c.tier.id];
          if (!cell) return <span className="text-slate-300">{kind === 'Only in some' ? 'not included' : '—'}</span>;
          if (kind === 'Only in some') return <span className="font-semibold text-emerald-700">{money(cell.value)} <span className="text-[10px] font-medium text-slate-400">{Number(cell.qty.toFixed(2))} {r.unit}</span></span>;
          if (kind === 'More of it') return <span className="font-semibold">{Number(cell.qty.toFixed(2))} {r.unit} <span className="text-[10px] font-medium text-slate-400">{money(cell.value)}</span></span>;
          return <span className="font-semibold">{money(cell.value)} <span className="text-[10px] font-medium text-slate-400">₹{Math.round(cell.rate).toLocaleString('en-IN')}/{r.unit}</span></span>;
        }} />
      ))}
      {(diffRows.length > 8 || comparison.same.length > 0) && (
        <div className="border-t border-slate-100 px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>{comparison.same.length > 0 && <><b className="text-slate-700">{comparison.same.length} items are the same in every option</b>: same scope, quantity and rate.</>}</span>
          {diffRows.length > 8 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="font-bold text-[#3D52A0] hover:text-[#334486]">
              {showAll ? 'Show fewer' : `Show all ${diffRows.length}`}
            </button>
          )}
        </div>
      )}
    </>
  );

  const payView = (
    <>
      <Row icon={Gift} label="Offers" sub="Written in Money & Offers" cells={(c) => (c.offers.length === 0
        ? <span className="text-slate-400">None yet</span>
        : <ul className="space-y-1.5">
            {c.offers.map((d: OfferDiscount) => {
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
      <Row icon={HandCoins} label="Client pays, with GST" strong cells={(c) => <span className="text-sm font-black"><CountUp value={Math.round(c.deal.clientPays)} format={money} /></span>} />
      {milestoneNames.map((name, mi) => (
        <Row key={`${name}-${mi}`} icon={CalendarRange} label={name} sub={mi === 0 ? 'Milestones, as Money will bill them' : undefined}
          cells={(c) => <span className="font-semibold">{c.milestones[mi] ? money(c.milestones[mi].invoiceTotal) : '—'}</span>} />
      ))}
    </>
  );

  const marginView = (
    <>
      {props.studioMedianGm !== null ? (
        <Row icon={Gauge} label={`Studio median ${props.studioMedianGm.toFixed(1)}%`} sub={`Of ${props.benchmarksCount} other priced ${props.benchmarksCount === 1 ? 'project' : 'projects'}`} cells={(c) => {
          const d = (c.tier.summary.blendedGm ?? 0) - props.studioMedianGm!;
          return <span className={`font-semibold ${d < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)} pts</span>;
        }} />
      ) : (
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">No other priced projects to compare yet</div>
      )}
      <Row icon={BadgeCheck} label="Above the 20% floor" cells={(c) => {
        const d = (c.tier.summary.blendedGm ?? 0) - 20;
        return <span className={`font-semibold ${d < 0 ? 'text-rose-700' : 'text-slate-800'}`}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)} pts</span>;
      }} />
      <Row icon={AlertTriangle} label="Lines under 15% margin" cells={(c) => (c.thin > 0
        ? <span className="font-semibold text-amber-700">{c.thin} {c.thin === 1 ? 'line' : 'lines'}</span>
        : <span className="text-slate-400">None</span>)} />
      {props.comparables && <div className="border-t border-slate-100 px-5 py-4">{props.comparables}</div>}
    </>
  );

  const historyView = (
    <>
      {anyChange && (
        <>
          <Row icon={GitBranch} label="Changed since the previous version" strong cells={(c) => (c.diff
            ? <span className={`font-bold ${c.diff.delta > 0 ? 'text-amber-700' : c.diff.delta < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                {signedMoney(c.diff.delta)} vs v{versionNo(c.chain, c.prev!.id)} · {c.diff.added + c.diff.removed + c.diff.changed} lines
              </span>
            : <span className="text-slate-400">No earlier version</span>)} />
          <Row label="What moved" sub="With the room, and the reason from the change log" cells={(c) => (c.moved.length === 0
            ? <span className="text-slate-400">{c.diff ? 'Nothing priced moved' : '—'}</span>
            : <ul className="space-y-1">
                {c.moved.slice(0, 5).map((l: any) => (
                  <li key={l.key} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : ''}{l.name}
                      <span className="block text-[10px] text-slate-400">{[l.room, l.reasons[0]?.reason].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={`shrink-0 font-semibold ${l.delta > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{signedMoney(l.delta)}</span>
                  </li>
                ))}
                {c.moved.length > 5 && <li className="text-[10px] text-slate-400">and {c.moved.length - 5} more</li>}
              </ul>)} />
        </>
      )}
      {props.history && <div className="border-t border-slate-100 px-5 py-4">{props.history}</div>}
    </>
  );

  const views: Record<Lens, React.ReactNode> = { money: moneyView, diff: diffView, pay: payView, margin: marginView, history: historyView };

  return (
    <GridCtx.Provider value={{ grid, cols, tint, still }}>
      <div className="w-full overflow-x-auto pb-1">
        <div className="flex flex-col gap-4" style={{ minWidth }}>

          {/* The options: one card each, with versions, price, margin, what it is made of, approval and actions. */}
          <section aria-label="Options side by side" className="grid gap-3" style={grid}>
            {/* The left column holds what acts on every option, so the cards do not float right of an empty gap. */}
            <div className="sticky left-0 z-10 bg-slate-50 flex flex-col gap-3 pt-1">
              <div>
                <p className={EYEBROW}>{props.summary || 'Options'}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Click a card to select it. A client’s change is a new version in the same card.</p>
              </div>
              {props.toolbar && <div className="flex flex-col gap-2">{props.toolbar}</div>}
            </div>
            {cols.map((c, i) => {
              const t = c.tier;
              const sel = isSel(t.id);
              const gm = t.summary.blendedGm ?? 0;
              const tone = props.studioMedianGm !== null && gm < props.studioMedianGm ? 'warn' : gm < 20 ? 'warn' : 'ok';
              return (
                <motion.div key={c.chain.root.id} variants={still ? undefined : cardV} initial={still ? false : 'hidden'} animate="show"
                  transition={{ delay: i * 0.07 }} style={{ transformPerspective: 1200 }} className="min-w-0">
                    <article
                      aria-label={t.name}
                      onClick={() => actions.select(t.id)}
                      className={`group relative h-full bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3.5 cursor-pointer transition-[border-color,box-shadow] duration-300 ${sel ? 'border-[#3D52A0] shadow-md ring-4 ring-[#3D52A0]/10' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      {sel && <motion.span layoutId="pt-selected" className="absolute inset-x-5 top-0 h-1 rounded-b-full bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                      {cheer === t.id && <span className="absolute right-10 top-8"><Confetti pieces={28} spread={130} size={1.2} /></span>}

                      <div className="flex items-start gap-3">
                        <IconTile icon={medal(t.id)} size="lg" tone={sel ? 'brand' : 'slate'} />
                        <div className="min-w-0 flex-1">
                          {props.renaming.id === t.id ? (
                            <input
                              type="text" autoFocus aria-label="Option name" value={props.renaming.value}
                              onChange={(e) => props.renaming.onChange(e.target.value)} onBlur={props.renaming.onSave} onKeyDown={props.renaming.onKey}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1 rounded-lg border border-slate-300 text-sm font-bold outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
                            />
                          ) : (
                            <h3 className="font-bold text-slate-800 line-clamp-2 break-words" title="Double-click to rename" onDoubleClick={() => actions.startRename(t.id)}>{t.name}</h3>
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
                                className={`relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${on ? 'border-[#3D52A0] text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                              >
                                {on && <motion.span layoutId={`pt-ver-${c.chain.root.id}`} className="absolute inset-0 rounded-full bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                                <span className="relative inline-flex items-center gap-1">
                                  v{versionNo(c.chain, v.id)} · {day(v.timestamp)}
                                  {(ctx.approvedTierId === v.id || v.id === props.signedTierId) && <CheckCircle2 className="w-3 h-3" />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* The price plate tilts to the pointer. The controls around it stay still, so a click lands where it is aimed. */}
                      <Tilt max={7} className="rounded-xl">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[26px] font-black text-slate-800 tracking-tight leading-none">
                            <span aria-hidden><CountUp value={Math.round(c.price.total)} format={money} /></span>
                            <span className="sr-only">{money(c.price.total)}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums mt-1.5">
                            {area > 0 && <>₹{Math.round(c.price.total / area).toLocaleString('en-IN')}/sq ft</>}
                            {cheapest > 0 && c.price.total > cheapest && <span className="text-amber-700"> · +{Math.round((c.price.total / cheapest - 1) * 100)}% over the lowest</span>}
                          </p>
                          {c.price.designFee > 0 && (
                            <p className="text-[11px] text-slate-500 tabular-nums" data-testid="option-split">
                              work {money(c.price.work)} + design fee {money(c.price.designFee)}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400">{t.summary.itemCount ?? t.boq?.length ?? 0} items · {gm.toFixed(1)}% GM</p>
                        </div>
                        <Ring value={Math.max(0, gm) / 50} size={78} stroke={7} tone={tone as any} label={`${gm.toFixed(1)}% margin`}>
                          <span className="block text-sm font-black text-slate-800 leading-none tabular-nums">{gm.toFixed(0)}%</span>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">margin</span>
                        </Ring>
                      </div>

                      <div>
                        <PartsBar split={c.split} still={still} />
                        <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {SCOPE_PARTS.map((p) => {
                            const Icon = PART_LOOK[p.id].icon;
                            const v = c.split.parts[p.id].value;
                            return (
                              <li key={p.id} className="flex items-center gap-1.5 text-[11px] text-slate-600 min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${PART_LOOK[p.id].shade}`} />
                                <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-300 group-hover:-rotate-12" />
                                <span className="truncate">{p.label}</span>
                                <span className="ml-auto font-bold text-slate-800 tabular-nums">{c.split.total > 0 ? Math.round((v / c.split.total) * 100) : 0}%</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      </div>
                      </Tilt>

                      <div onClick={(e) => e.stopPropagation()}>{approval(c)}</div>
                      <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap gap-2">
                        <ColumnActions col={c} {...props} />
                      </div>
                    </article>
                </motion.div>
              );
            })}
          </section>

          {/* After signing, the options not chosen fold away. */}
          {props.notChosen.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500">
              <span className={EYEBROW}>Not chosen</span>
              {props.notChosen.map((t) => <span key={t.id} className="text-slate-600">{t.name} · {money(optionPrice(t).total)}</span>)}
              <button type="button" onClick={props.onToggleNotChosen} className="font-bold text-[#3D52A0] hover:text-[#334486]">{props.showNotChosen ? 'Fold them' : 'Show them'}</button>
            </div>
          )}

          {/* One view at a time, under the options. */}
          <section aria-label={lenses.find((l) => l.id === shownLens)?.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hud-panel-in">
            <div className="sticky left-0 flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-100" style={{ maxWidth: '100vw' }}>
              <div role="tablist" aria-label="View" className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100">
                {lenses.map((l) => {
                  const on = l.id === shownLens;
                  const Icon = l.icon;
                  return (
                    <button key={l.id} type="button" role="tab" aria-selected={on} onClick={() => setLens(l.id)}
                      className={`group relative px-3.5 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${on ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                      {on && <motion.span layoutId="pt-lens" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                      <span className="relative inline-flex items-center gap-2">
                        <Icon className={`w-4 h-4 transition-transform duration-300 ${on ? 'text-[#3D52A0] scale-110' : 'group-hover:-rotate-12'}`} />
                        {l.label}
                        {!!l.count && <span className={`px-1.5 rounded-full text-[10px] tabular-nums ${on ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-200 text-slate-600'}`}>{l.count}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {shownLens === 'money' && (
                <button type="button" onClick={() => setOpenParts(allOpen ? new Set() : new Set(SCOPE_PARTS.map((p) => p.id)))}
                  className="text-xs font-bold text-[#3D52A0] hover:text-[#334486]">
                  {allOpen ? 'Close every part' : 'Open every part'}
                </button>
              )}
            </div>
            <motion.div key={shownLens} variants={still ? undefined : deskSectionV} initial={still ? false : 'hidden'} animate="show" style={{ transformPerspective: 1400 }}>
              <motion.div variants={still ? undefined : listV} initial={still ? false : 'hidden'} animate="show">
                {views[shownLens]}
              </motion.div>
            </motion.div>
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
          {latest && actions.offers && <button role="menuitem" type="button" className={item} onClick={run(() => actions.offers!(t.id))}><Gift className="w-4 h-4 text-slate-400" /> Offers in Money & Offers</button>}
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
      {more}
    </>
  );
}
