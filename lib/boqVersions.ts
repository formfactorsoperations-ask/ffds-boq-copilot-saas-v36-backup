import { ProposalTier, Item } from '../types';
import { ResolvedBoqLine, resolveBoqLines } from './boqPricing';

/**
 * BOQ VERSIONS — what a client is priced against, and what moved to get there.
 *
 * Two things live in `tiers` and they are NOT the same thing:
 *
 *   • OPTIONS — "Essential Elegance / Comfort Upgrade / Complete Harmony",
 *     written in the same second, no revision ledger. Packages offered side by
 *     side for the client to choose between.
 *   • REVISIONS — a booking BOQ and the annexure that revises it, 57 days and
 *     53 ledger entries apart.
 *
 * Telling a client "your scope changed by +₹10,080" when they are looking at
 * two packages they were offered is a lie about their contract.
 * `describeVersions` separates the two and the UI says something different for
 * each.
 *
 * `context.boqRevisions` is the studio's own change ledger — every entry names
 * the item, the section, a reasonCategory ("Client Request", "Value
 * Engineering", "Design Upgrade", "Site Condition", "Correction") and an
 * optional note. It is the only honest answer to "why", and it is joined onto
 * the computed diff here so a client sees the studio's reason next to the money.
 */

/** Commercial states a client may see. `Draft` is the studio's own workings. */
const CLIENT_VISIBLE_TAGS = new Set([
  'Approved while booking',
  'Revised after design',
  'Superseded',
  'Current contract',
]);

export type VersionRole =
  | 'approved'             // what the client signed at booking
  | 'current'              // what they are priced against now
  | 'approved-and-current' // never revised
  | 'earlier'              // a superseded step in the chain
  | 'chosen'               // options mode: the package they went with
  | 'option';              // options mode: also offered

export interface BoqVersion {
  id: string;
  name: string;
  /** The studio's own lifecycle tag, where it set one. */
  tag?: string;
  at: number;
  total: number;
  itemCount: number;
  parentId?: string;
  role: VersionRole;
}

export interface VersionSet {
  /** 'revisions' = a chain over time. 'options' = packages offered together. */
  mode: 'revisions' | 'options';
  /** Chronological, oldest first — the order a client experienced them in. */
  versions: BoqVersion[];
  approvedId?: string;
  currentId?: string;
}

export type BoqLine = ResolvedBoqLine;

export type ChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';

/** One entry from the studio's change ledger, in client-facing language. */
export interface RevisionNote {
  type: string;
  /** 'At your request', 'Cost saving', … */
  reason: string;
  note?: string;
  at: number;
}

export interface BoqLineDiff {
  key: string;
  room: string;
  name: string;
  kind: ChangeKind;
  before?: BoqLine;
  after?: BoqLine;
  /** after.total − before.total. Negative is a saving. */
  delta: number;
  /** The studio's stated reasons, where the ledger records one. */
  reasons: RevisionNote[];
}

export interface BoqDiff {
  rooms: { room: string; lines: BoqLineDiff[]; delta: number }[];
  added: number;
  removed: number;
  changed: number;
  totalBefore: number;
  totalAfter: number;
  delta: number;
  /** Count of changed lines by client-facing reason, from the ledger. */
  reasonCounts: { reason: string; count: number }[];
}

const linesOf = (tier: ProposalTier, bankMap: Map<string, Item>): BoqLine[] =>
  resolveBoqLines(tier.boq || [], bankMap);

const totalOf = (lines: BoqLine[]) =>
  lines.filter(l => l.billable).reduce((s, l) => s + l.total, 0);

/* ── the change ledger ─────────────────────────────────────────────────── */

/** Ledger types that move money. The rest are ops workflow, not scope. */
const SCOPE_CHANGE_TYPES = new Set(['ADD', 'REMOVE', 'REVISE_QTY', 'REVISE_RATE']);

/** The studio's internal category, said the way a client would say it. */
const REASON_LABEL: Record<string, string> = {
  'Client Request':    'At your request',
  'Value Engineering': 'Cost saving',
  'Design Upgrade':    'Design upgrade',
  'Site Condition':    'Site condition',
  'Correction':        'Correction',
};

const norm = (s: any) => String(s ?? '').trim().toLowerCase();

export interface RevisionIndex {
  byItemRoom: Map<string, any[]>;
  byItem: Map<string, any[]>;
}

const push = (m: Map<string, any[]>, k: string, v: any) => {
  if (!k || k === '|') return;
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

export function buildRevisionIndex(revisions: any[]): RevisionIndex {
  const idx: RevisionIndex = { byItemRoom: new Map(), byItem: new Map() };
  (revisions || [])
    .filter(r => SCOPE_CHANGE_TYPES.has(r?.type))
    .forEach(r => {
      push(idx.byItemRoom, `${norm(r.item)}|${norm(r.section)}`, r);
      push(idx.byItem, norm(r.item), r);
    });
  return idx;
}

/**
 * Reasons for one line, restricted to the window between the two versions.
 *
 * The window matters: without it a change made before the client ever approved
 * would be presented as the reason for a revision that came months later.
 *
 * `targetId` is regenerated per tier and matches only about half the ledger, so
 * item + section is the join, falling back to the item name alone.
 */
function reasonsFor(
  line: { name: string; room: string },
  idx: RevisionIndex | undefined,
  from: number,
  to: number,
): RevisionNote[] {
  if (!idx) return [];
  const hits =
    idx.byItemRoom.get(`${norm(line.name)}|${norm(line.room)}`) ||
    idx.byItem.get(norm(line.name)) ||
    [];

  /*
    One chip per distinct reason. The ledger records a separate entry every
    time ops touched a line, so a line edited twice at the client's request
    rendered "AT YOUR REQUEST" twice — which reads as two separate requests.
    The first note found for a reason is kept.
  */
  const byReason = new Map<string, RevisionNote>();
  hits
    .filter(r => {
      const at = Number(r.timestamp) || 0;
      return at > from && at <= to;
    })
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .forEach(r => {
      const reason = REASON_LABEL[r.reasonCategory] || r.reasonCategory || 'Revised';
      const note = r.note && String(r.note).trim() ? String(r.note).trim() : undefined;
      const seen = byReason.get(reason);
      if (!seen) {
        byReason.set(reason, { type: r.type, reason, note, at: Number(r.timestamp) || 0 });
      } else if (!seen.note && note) {
        seen.note = note;
      }
    });
  return [...byReason.values()];
}

/* ── which versions, and what each one is ──────────────────────────────── */

/**
 * The versions a client may see and the role each plays.
 *
 * Roles are read off the project, never guessed: `approvedTierId` is what they
 * signed, a 'Current contract' tag or the newest tier is what they are priced
 * against now. Where those are the same tier the client is told so plainly
 * rather than being shown a version compared against itself.
 */
export function describeVersions(
  tiers: ProposalTier[],
  bankMap: Map<string, Item>,
  opts: { approvedTierId?: string; activeTierId?: string; revisionCount?: number } = {},
): VersionSet {
  const visible = (tiers || []).filter(
    t => !t.lifecycleTag || CLIENT_VISIBLE_TAGS.has(t.lifecycleTag),
  );

  const built: BoqVersion[] = visible
    .map(t => {
      const lines = linesOf(t, bankMap);
      return {
        id: t.id,
        name: t.name || 'Scope',
        tag: t.lifecycleTag,
        at: t.timestamp || 0,
        // The studio's own figure where it exists; the same computation where
        // it does not. Verified equal on every tier of every project.
        total: t.summary?.totalSell ?? totalOf(lines),
        itemCount: lines.filter(l => l.billable).length,
        parentId: t.parentTierId,
        role: 'option' as VersionRole,
      };
    })
    .sort((a, b) => a.at - b.at);

  /*
    Options are written in one go; revisions accumulate over days. A spread of
    under an hour with no ledger entry is a set of packages, not a history —
    every "New Project" in the library has a spread of exactly 0 minutes,
    while the one real revision chain spans 57 days and 53 ledger entries.
  */
  const spread = built.length > 1 ? built[built.length - 1].at - built[0].at : 0;
  const mode: VersionSet['mode'] =
    (opts.revisionCount || 0) > 0 || spread > 60 * 60 * 1000 ? 'revisions' : 'options';

  const has = (id?: string) => !!id && built.some(v => v.id === id);
  const approvedId =
    (has(opts.approvedTierId) && opts.approvedTierId) ||
    (has(opts.activeTierId) && opts.activeTierId) ||
    undefined;

  const currentId =
    mode === 'revisions'
      ? built.find(v => v.tag === 'Current contract')?.id || built[built.length - 1]?.id
      : approvedId;

  built.forEach(v => {
    if (mode === 'options') {
      v.role = v.id === approvedId ? 'chosen' : 'option';
      return;
    }
    if (v.id === approvedId && v.id === currentId) v.role = 'approved-and-current';
    else if (v.id === approvedId) v.role = 'approved';
    else if (v.id === currentId) v.role = 'current';
    else v.role = 'earlier';
  });

  return { mode, versions: built, approvedId, currentId };
}

/* ── the diff ──────────────────────────────────────────────────────────── */

/** What changed going from `before` to `after`. */
export function diffTiers(
  before: ProposalTier,
  after: ProposalTier,
  bankMap: Map<string, Item>,
  revisionIndex?: RevisionIndex,
): BoqDiff {
  /*
    Non-billable lines are excluded from both sides: a line the client is not
    paying for is not part of their scope, and showing one as "removed" when it
    was only ever marked excluded would be alarming and wrong.

    Lines are keyed by item AND room, then merged. Keying on the bank id alone
    silently dropped every repeat of an item that appears in more than one room
    — three projects reconciled to the wrong total because of it, one of them
    reporting a ₹1,19,680 revision as no change at all. Two lines of the same
    item in the same room are one line to a client, so they are summed rather
    than one overwriting the other.
  */
  const collect = (tier: ProposalTier) => {
    const map = new Map<string, BoqLine>();
    linesOf(tier, bankMap)
      .filter(l => l.billable)
      .forEach(l => {
        const key = `${l.key}|${norm(l.room)}`;
        const seen = map.get(key);
        if (!seen) {
          map.set(key, { ...l, key });
          return;
        }
        const qty = seen.qty + l.qty;
        const total = seen.total + l.total;
        map.set(key, { ...seen, qty, total, rate: qty ? total / qty : seen.rate });
      });
    return map;
  };

  const a = collect(before);
  const b = collect(after);

  const from = before.timestamp || 0;
  const to = after.timestamp || Number.MAX_SAFE_INTEGER;

  const lines: BoqLineDiff[] = [];
  let added = 0, removed = 0, changed = 0;

  b.forEach((next, key) => {
    const prev = a.get(key);
    const reasons = reasonsFor(next, revisionIndex, from, to);
    if (!prev) {
      added++;
      lines.push({ key, room: next.room, name: next.name, kind: 'added', after: next, delta: next.total, reasons });
      return;
    }
    const moved = prev.qty !== next.qty || prev.rate !== next.rate || prev.total !== next.total;
    if (moved) changed++;
    lines.push({
      key, room: next.room, name: next.name,
      kind: moved ? 'changed' : 'unchanged',
      before: prev, after: next,
      delta: next.total - prev.total,
      reasons: moved ? reasons : [],
    });
  });

  a.forEach((prev, key) => {
    if (b.has(key)) return;
    removed++;
    lines.push({
      key, room: prev.room, name: prev.name, kind: 'removed',
      before: prev, delta: -prev.total,
      reasons: reasonsFor(prev, revisionIndex, from, to),
    });
  });

  /*
    Grouped by room, case-insensitively.

    Real BOQs carry "Functional" and "FUNCTIONAL" as separate strings, and
    grouping on the raw value split one room into two sections with two
    subtotals — which reads to a client as either a mistake or a double charge.
    The first spelling seen wins as the label.
  */
  const byRoom = new Map<string, { label: string; lines: BoqLineDiff[] }>();
  lines.forEach(l => {
    const key = norm(l.room);
    if (!byRoom.has(key)) byRoom.set(key, { label: l.room.trim(), lines: [] });
    byRoom.get(key)!.lines.push(l);
  });

  const rooms = [...byRoom.values()]
    .map(({ label, lines: ls }) => ({
      room: label,
      lines: ls.sort((x, y) => {
        const rank = { changed: 0, added: 1, removed: 2, unchanged: 3 } as Record<ChangeKind, number>;
        return rank[x.kind] - rank[y.kind] || Math.abs(y.delta) - Math.abs(x.delta);
      }),
      delta: ls.reduce((s, l) => s + l.delta, 0),
    }))
    .sort((x, y) => {
      const xm = x.lines.some(l => l.kind !== 'unchanged') ? 0 : 1;
      const ym = y.lines.some(l => l.kind !== 'unchanged') ? 0 : 1;
      return xm - ym || Math.abs(y.delta) - Math.abs(x.delta);
    });

  const tally = new Map<string, number>();
  lines.forEach(l => {
    const seen = new Set<string>();
    l.reasons.forEach(r => {
      if (seen.has(r.reason)) return;
      seen.add(r.reason);
      tally.set(r.reason, (tally.get(r.reason) || 0) + 1);
    });
  });
  const reasonCounts = [...tally.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((x, y) => y.count - x.count);

  const totalBefore = [...a.values()].reduce((s, l) => s + l.total, 0);
  const totalAfter = [...b.values()].reduce((s, l) => s + l.total, 0);

  return {
    rooms, added, removed, changed, reasonCounts,
    totalBefore, totalAfter, delta: totalAfter - totalBefore,
  };
}
