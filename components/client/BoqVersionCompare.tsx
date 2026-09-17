import React, { useMemo, useState } from 'react';
import { ProposalTier, Item } from '../../types';
import { formatINR } from '../../lib/utils';
import {
  BoqVersion,
  BoqLineDiff,
  buildRevisionIndex,
  describeVersions,
  diffTiers,
} from '../../lib/boqVersions';
import { X, Check, Info } from 'lucide-react';

/**
 * Your scope, and what changed.
 *
 * The first version of this screen showed two identical lists of versions and a
 * signed total. Read as a client it failed at every question that matters: it
 * did not say which version was binding, it did not say why anything moved, and
 * because it defaulted to the newest tier as "current" while `approvedTierId`
 * pointed at the older one, it compared newest-to-oldest and announced a
 * ₹67,922 SAVING as a ₹67,922 INCREASE. On a screen whose entire job is trust,
 * that is the worst thing it could have done.
 *
 * The rebuild is organised around the three questions a client actually asks:
 *
 *   1. Which BOQ am I bound by?      → roles, stated on the versions themselves
 *   2. What changed, and why?        → the studio's own ledger, joined per line
 *   3. How much, and where?          → a diverging bar, so magnitude is visual
 *
 * Direction is normalised by date and cannot invert. Options are never
 * described as changes to a scope.
 */

interface Props {
  tiers: ProposalTier[];
  /** Bank + the project's ad-hoc items. Pricing is meaningless without it. */
  bankMap: Map<string, Item>;
  approvedTierId?: string;
  activeTierId?: string;
  /** `context.boqRevisions` — the studio's change ledger. */
  revisions?: any[];
  onClose: () => void;
}

const when = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ROLE: Record<string, { label: string; tone: string }> = {
  'approved':             { label: 'You approved this',  tone: 'bg-[#3D52A0] text-white' },
  'current':              { label: 'Current scope',      tone: 'bg-emerald-600 text-white' },
  'approved-and-current': { label: 'Approved & current', tone: 'bg-emerald-600 text-white' },
  'earlier':              { label: 'Earlier version',    tone: 'bg-slate-200 text-slate-600' },
  'chosen':               { label: 'Your package',       tone: 'bg-emerald-600 text-white' },
  'option':               { label: 'Also offered',       tone: 'bg-slate-200 text-slate-600' },
};

/** Up costs the client more (amber, look here); down is a saving (emerald). */
const toneOf = (n: number) =>
  n > 0 ? 'text-amber-700' : n < 0 ? 'text-emerald-700' : 'text-slate-400';

const Signed: React.FC<{ n: number; className?: string }> = ({ n, className = '' }) => (
  <span className={`tabular-nums font-bold ${toneOf(n)} ${className}`}>
    {n > 0 ? '+' : n < 0 ? '−' : ''}{formatINR(Math.abs(n))}
  </span>
);

export default function BoqVersionCompare({
  tiers, bankMap, approvedTierId, activeTierId, revisions, onClose,
}: Props) {
  const set = useMemo(
    () => describeVersions(tiers as any, bankMap, {
      approvedTierId, activeTierId, revisionCount: (revisions || []).length,
    }),
    [tiers, bankMap, approvedTierId, activeTierId, revisions],
  );

  const revIndex = useMemo(
    () => (revisions && revisions.length ? buildRevisionIndex(revisions) : undefined),
    [revisions],
  );

  const isRevision = set.mode === 'revisions';

  // Default to the comparison the client means: what they approved against what
  // is current. In options mode, their package against the next one along.
  const [picked, setPicked] = useState<string[]>(() => {
    const { approvedId, currentId, versions } = set;
    if (isRevision && approvedId && currentId && approvedId !== currentId) return [approvedId, currentId];
    if (versions.length >= 2) {
      const chosen = versions.find(v => v.role === 'chosen');
      if (chosen) {
        const other = versions.find(v => v.id !== chosen.id)!;
        return [chosen.id, other.id];
      }
      return [versions[versions.length - 2].id, versions[versions.length - 1].id];
    }
    return versions.map(v => v.id);
  });

  /*
    Always oldest → newest. The direction of a comparison is a fact about the
    dates, never about the order the client happened to click in — letting a
    click decide it is what turned a saving into an increase.
  */
  const [from, to] = useMemo(() => {
    const chosen = set.versions.filter(v => picked.includes(v.id)).sort((a, b) => a.at - b.at);
    return [chosen[0], chosen[1]];
  }, [picked, set.versions]);

  const tierOf = (id?: string) => tiers.find(t => t.id === id);
  const diff = useMemo(() => {
    const a = tierOf(from?.id), b = tierOf(to?.id);
    return a && b ? diffTiers(a, b, bankMap, revIndex) : null;
  }, [from, to, bankMap, revIndex]);

  const [showUnchanged, setShowUnchanged] = useState(false);

  const toggle = (id: string) =>
    setPicked(p =>
      p.includes(id)
        ? (p.length > 2 ? p.filter(x => x !== id) : p) // never fall below two
        : [...p, id].slice(-2),
    );

  /* ── version rail ─────────────────────────────────────────────────────── */

  const Chip: React.FC<{ v: BoqVersion }> = ({ v }) => {
    const on = picked.includes(v.id);
    const role = ROLE[v.role];
    return (
      <button
        onClick={() => toggle(v.id)}
        aria-pressed={on}
        className={`relative text-left rounded-2xl border-2 px-3.5 py-3 min-w-[190px] transition-all cursor-pointer ${
          on ? 'border-[#3D52A0] bg-white shadow-sm' : 'border-transparent bg-white/70 hover:bg-white'
        }`}
      >
        <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 ${role.tone}`}>
          {(v.role === 'current' || v.role === 'approved-and-current' || v.role === 'chosen') && <Check className="w-2.5 h-2.5" />}
          {role.label}
        </span>
        <span className="block text-[12px] font-bold text-slate-900 mt-1.5 leading-snug">{v.name}</span>
        <span className="block text-[10px] text-slate-500 font-semibold mt-0.5">
          {when(v.at)} · {v.itemCount} items
        </span>
        <span className="block text-sm font-extrabold text-slate-900 tabular-nums mt-1">{formatINR(v.total)}</span>
        {on && (
          <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#3D52A0] text-white grid place-items-center">
            <Check className="w-2.5 h-2.5" strokeWidth={3} />
          </span>
        )}
      </button>
    );
  };

  /* ── one line ─────────────────────────────────────────────────────────── */

  /**
   * A "was / now" pair, stacked.
   *
   * The line used to read "Quantity 64 → 13.5 Rate ₹1,382 → ₹1,440" on one
   * cramped row, which asks the client to hold four numbers in their head and
   * do the multiplication themselves. Stacking the two states — each with its
   * own quantity, rate and line total — turns it into something you read rather
   * than decode, and makes the arithmetic behind the delta visible.
   */
  const State: React.FC<{
    tone: 'was' | 'now';
    label: string;
    line?: { qty: number; unit?: string; rate: number; total: number };
    muted?: string;
  }> = ({ tone, label, line, muted }) => (
    <div
      className={`flex items-baseline gap-2.5 px-2.5 py-1.5 rounded-lg ${
        tone === 'was'
          ? 'bg-slate-50 border border-slate-100'
          : 'bg-sky-50/70 border border-sky-100'
      }`}
    >
      <span
        className={`text-[9px] font-black uppercase tracking-wider shrink-0 w-8 ${
          tone === 'was' ? 'text-slate-400' : 'text-[#3D52A0]'
        }`}
      >
        {label}
      </span>
      {line ? (
        <>
          <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
            {line.qty} {line.unit || ''} × {formatINR(line.rate)}
          </span>
          <span className="ml-auto text-[11px] font-bold text-slate-800 tabular-nums shrink-0">
            {formatINR(line.total)}
          </span>
        </>
      ) : (
        <span className="text-[11px] font-medium text-slate-400 italic">{muted}</span>
      )}
    </div>
  );

  const Line: React.FC<{ l: BoqLineDiff; scale: number }> = ({ l, scale }) => {
    const pct = scale > 0 ? Math.min(100, (Math.abs(l.delta) / scale) * 100) : 0;

    /*
      Compare at the precision the client is shown. Rates carry floating-point
      noise from the margin calculation, and a line whose quantity moved was
      rendering "Rate ₹952 → ₹952" beside it — a change that did not happen,
      on the one screen where an invented change is unforgivable.
    */
    const qtyMoved  = !!l.before && !!l.after && Math.round(l.before.qty * 100) !== Math.round(l.after.qty * 100);
    const rateMoved = !!l.before && !!l.after && Math.round(l.before.rate) !== Math.round(l.after.rate);

    const dot =
      l.kind === 'added' ? 'bg-emerald-500'
        : l.kind === 'removed' ? 'bg-rose-500'
        : l.kind === 'changed' ? 'bg-amber-500'
        : 'bg-slate-200';

    /** What moved, named — so the reason sits against a stated change. */
    const movement =
      l.kind === 'added'   ? 'Added to your scope'
      : l.kind === 'removed' ? 'Taken out of your scope'
      : qtyMoved && rateMoved ? 'Quantity and rate revised'
      : qtyMoved             ? 'Quantity revised'
      : rateMoved            ? 'Rate revised'
      : 'Repriced';

    return (
      <li className="px-5 py-3">
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-bold text-slate-900 leading-snug">{l.name}</p>
              <span className="text-right shrink-0 w-[104px]">
                {l.kind === 'unchanged'
                  ? <span className="text-[11px] text-slate-400 tabular-nums font-semibold">{formatINR(l.after?.total || 0)}</span>
                  : <Signed n={l.delta} className="text-xs" />}
                {/* Magnitude against the largest move in this comparison. Kept
                    to the width of the figure it belongs to — run full-bleed it
                    reads as a section rule rather than a bar. */}
                {l.kind !== 'unchanged' && pct > 0 && (
                  <span className="block mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                    <span
                      className={`block h-full rounded-full ${l.delta > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${pct}%`, marginLeft: 'auto' }}
                    />
                  </span>
                )}
              </span>
            </div>

            {l.kind === 'unchanged' ? (
              <p className="text-[10px] text-slate-500 font-medium tabular-nums mt-0.5">
                Unchanged · {l.after?.qty} {l.after?.unit || ''} at {formatINR(l.after?.rate || 0)}
              </p>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1.5 mb-1">
                  {movement}
                </p>
                <div className="space-y-1">
                  <State
                    tone="was"
                    label="Was"
                    line={l.before}
                    muted="Not in the earlier version"
                  />
                  <State
                    tone="now"
                    label="Now"
                    line={l.after}
                    muted="No longer part of your scope"
                  />
                </div>
              </>
            )}

            {/* The studio's own reason, in the studio's own words. */}
            {l.reasons.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Because</span>
                {l.reasons.map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-white text-[#334486] border border-sky-200"
                  >
                    {r.reason}
                  </span>
                ))}
                {l.reasons.find(r => r.note) && (
                  <span className="text-[10px] text-slate-500 italic">
                    &ldquo;{l.reasons.find(r => r.note)!.note}&rdquo;
                  </span>
                )}
              </div>
            )}

          </div>
        </div>
      </li>
    );
  };

  /* ── render ───────────────────────────────────────────────────────────── */

  const only = set.versions.length < 2;
  const lineScale = diff ? Math.max(...diff.rooms.flatMap(r => r.lines.map(l => Math.abs(l.delta))), 1) : 1;
  const roomScale = diff ? Math.max(...diff.rooms.map(r => Math.abs(r.delta)), 1) : 1;
  const movedRooms = diff ? diff.rooms.filter(r => r.delta !== 0) : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 w-full max-w-[1120px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isRevision ? 'Your scope, version by version' : 'The packages you were offered'}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isRevision
                ? 'Every version your studio has shared with you, and exactly what moved between them.'
                : 'These are alternatives you could choose between — not changes made to your scope.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {only ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-bold text-slate-800">There is only one version of your scope</p>
            <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
              Nothing has been revised. When your studio issues a revision, this is where you will see
              exactly what moved, what it costs, and why.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* 1. Which versions — one chronological rail, not two lists. */}
            <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                {isRevision ? 'Your versions, oldest first' : 'Packages offered'}
                <span className="ml-2 font-semibold tracking-normal normal-case text-slate-400">
                  — pick any two to compare
                </span>
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {set.versions.map(v => <Chip key={v.id} v={v} />)}
              </div>
            </div>

            {!diff ? (
              <p className="p-6 text-sm text-slate-500">Pick two versions to compare.</p>
            ) : (
              <>
                {/* 2. The answer, in a sentence. */}
                <div className="px-6 py-5 border-b border-slate-100">
                  <p className={`text-[26px] leading-none font-extrabold tracking-tight ${toneOf(diff.delta)}`}>
                    {diff.delta === 0
                      ? 'No change in price'
                      : `${formatINR(Math.abs(diff.delta))} ${diff.delta > 0 ? 'more' : 'less'}`}
                  </p>
                  <p className="text-[13px] text-slate-600 font-medium mt-2 leading-relaxed">
                    {isRevision ? (
                      <>
                        <b className="text-slate-900">{to?.name}</b> ({when(to?.at || 0)}) is{' '}
                        {diff.delta === 0 ? 'the same price as' : diff.delta > 0 ? 'more than' : 'less than'}{' '}
                        <b className="text-slate-900">{from?.name}</b> ({when(from?.at || 0)}).{' '}
                        {formatINR(diff.totalBefore)} → <b className="text-slate-900">{formatINR(diff.totalAfter)}</b>.
                      </>
                    ) : (
                      <>
                        <b className="text-slate-900">{to?.name}</b> costs{' '}
                        {diff.delta === 0 ? 'the same as' : diff.delta > 0 ? 'more than' : 'less than'}{' '}
                        <b className="text-slate-900">{from?.name}</b>.{' '}
                        {formatINR(diff.totalBefore)} → <b className="text-slate-900">{formatINR(diff.totalAfter)}</b>.
                      </>
                    )}
                  </p>

                  <p className="text-[11px] text-slate-500 font-semibold mt-2">
                    {diff.changed} changed · {diff.added} newly included · {diff.removed} no longer included
                  </p>

                  {/* The studio's reasons, counted. Only ever from the ledger. */}
                  {diff.reasonCounts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {diff.reasonCounts.map(r => (
                        <span
                          key={r.reason}
                          className="text-[10px] font-bold rounded-full px-2.5 py-1 bg-white border border-slate-200 text-slate-600"
                        >
                          {r.reason} <span className="text-slate-400">×{r.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Where it moved — magnitude you can see, not read. */}
                {movedRooms.length > 0 && (
                  <div className="px-6 py-4 border-b border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">
                      Where the money moved
                    </p>
                    <div className="space-y-1.5">
                      {movedRooms.map(r => {
                        const pct = (Math.abs(r.delta) / roomScale) * 50;
                        return (
                          <div key={r.room} className="flex items-center gap-3">
                            <span className="w-[136px] shrink-0 text-[11px] font-bold text-slate-700 truncate text-right">
                              {r.room}
                            </span>
                            <span className="relative flex-1 h-5 min-w-0">
                              <span className="absolute inset-y-0 left-1/2 w-px bg-slate-200" />
                              <span
                                className={`absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full ${
                                  r.delta > 0 ? 'bg-amber-400' : 'bg-emerald-400'
                                }`}
                                style={
                                  r.delta > 0
                                    ? { left: '50%', width: `${pct}%` }
                                    : { right: '50%', width: `${pct}%` }
                                }
                              />
                            </span>
                            <span className="w-[104px] shrink-0 text-right">
                              <Signed n={r.delta} className="text-[11px]" />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold mt-2.5 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" /> costs less
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400" /> costs more
                      </span>
                    </p>
                  </div>
                )}

                {/* 4. Every line. */}
                <div className="px-6 py-2.5 flex items-center justify-between border-b border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Line by line
                  </p>
                  <button
                    onClick={() => setShowUnchanged(s => !s)}
                    className="text-[11px] font-bold text-[#3D52A0] hover:underline cursor-pointer"
                  >
                    {showUnchanged ? 'Hide unchanged items' : 'Show unchanged items'}
                  </button>
                </div>

                {diff.rooms.map(room => {
                  const shown = room.lines.filter(l => showUnchanged || l.kind !== 'unchanged');
                  if (shown.length === 0) return null;
                  return (
                    <div key={room.room} className="border-b border-slate-100 last:border-b-0">
                      <div className="px-6 py-2 bg-slate-100 border-y border-slate-200 flex items-center justify-between sticky top-0 z-10">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{room.room}</p>
                        {room.delta !== 0 && <Signed n={room.delta} className="text-[11px]" />}
                      </div>
                      <ul className="divide-y divide-slate-50">
                        {shown.map(l => <Line key={l.key} l={l} scale={lineScale} />)}
                      </ul>
                    </div>
                  );
                })}

                <p className="px-6 py-4 text-[10px] text-slate-400 font-medium leading-relaxed flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>
                    Figures are the sell price of each line, matching your studio&rsquo;s own records. Items
                    marked as excluded or supplied by you are not part of these totals.
                    {revIndex && ' Reasons are taken from the change log your studio maintains against this project.'}
                  </span>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
