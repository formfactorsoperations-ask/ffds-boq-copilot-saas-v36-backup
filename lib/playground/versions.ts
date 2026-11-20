/**
 * BOQ Playground — Classic and Playground versions, and whole-flat services.
 *
 * A version made in the Playground carries `boqFormat: 'playground'` and the
 * Playground's pricing rules (every client amount rounded up to ₹100, no design
 * fee on actuals). Anything else is a Classic BOQ and is priced exactly as
 * before. An older project opens as Classic, as it is; "Make a Playground
 * version" copies its lines, with their rates, into the next version, and the
 * Classic version stays as it was.
 *
 * Whole-flat services — painting, false ceiling, electrical — are one line
 * each, shared into the rooms (BoqItem.byRoom, lib/playground/rooms.ts). A line
 * the studio priced for the whole flat can be shared; painting can be added as
 * a wall line and a ceiling line measured from the plan.
 */
import type { Item, BoqItem, ProposalTier, Room, ShareBasis } from '../../types';
import { inferBasis } from '../takeoff';
import { PLAYGROUND_PRICING, isPlaygroundTier, playgroundTotals, designFeeForTier } from './pricing';
import { byRoomQty, withByRoomQty, type MeasureContext } from './rooms';
import { withCivilQty } from './civil';
import { isScopeBucket } from '../scopeBuckets';
import { optionChains, chainOf, latestOf, versionNo, previousVersion } from '../optionChains';

export type BoqFormat = 'playground' | 'classic';

/** Which editor's rules a version follows. */
export const boqFormatOf = (tier: Pick<ProposalTier, 'boqFormat' | 'pricingRules'> | null | undefined): BoqFormat =>
  isPlaygroundTier(tier) ? 'playground' : 'classic';

export const BOQ_FORMAT_LABEL: Record<BoqFormat, string> = { playground: 'Playground BOQ', classic: 'Classic BOQ' };

/** How a project's latest BOQ was made, for the tag on its folder (PR T). */
export type BoqTag = BoqFormat | 'none';
export const BOQ_TAG_LABEL: Record<BoqTag, string> = { ...BOQ_FORMAT_LABEL, none: 'No BOQ yet' };

/**
 * The project's BOQ tag: the format of its latest version that has lines
 * (newest by timestamp, else the last listed), or none. A version whose lines
 * were trimmed from the project list still counts by its summary.
 */
export function boqTagOf(tiers: Pick<ProposalTier, 'boq' | 'boqFormat' | 'pricingRules' | 'timestamp' | 'summary'>[] | null | undefined): BoqTag {
  const withLines = (tiers || []).map((t, i) => ({ t, i })).filter(({ t }) =>
    (t.boq?.length || 0) > 0 || !!(t as any).boqTrimmed || Number(t.summary?.itemCount) > 0);
  if (!withLines.length) return 'none';
  const latest = withLines.reduce((a, b) => {
    const ta = Number(a.t.timestamp) || 0, tb = Number(b.t.timestamp) || 0;
    return tb > ta || (tb === ta && b.i > a.i) ? b : a;
  });
  return boqFormatOf(latest.t);
}

/**
 * The next version of a Classic option, as a Playground BOQ. Every line keeps
 * its id, quantity, room and markup; a line priced off the bank today has the
 * bank's materials rate frozen onto it, so the copy is priced as the original
 * was. The original is untouched.
 */
export function makePlaygroundVersion(src: ProposalTier, newId: string, at: number, bankMap: Map<string, Item>): ProposalTier {
  const copy: ProposalTier = JSON.parse(JSON.stringify(src));
  delete (copy as any).approval;
  return {
    ...copy,
    id: newId,
    timestamp: at,
    parentTierId: src.id,
    lifecycleTag: 'Draft',
    boqFormat: 'playground',
    pricingRules: { ...PLAYGROUND_PRICING },
    boq: (copy.boq || []).map(line => {
      const item = bankMap.get(line.bankId);
      return line.baseRate === undefined && item ? { ...line, baseRate: item.materials } : line;
    }),
  };
}

/** How a whole-flat service is shared into rooms, read off its item; null when it is not one. */
export function shareBasisFor(item: Pick<Item, 'name' | 'unit'> | null | undefined): ShareBasis | null {
  if (!item) return null;
  switch (inferBasis(item.name, item.unit)) {
    case 'wallPaint': return /ceiling/i.test(item.name) ? 'ceilingPaint' : 'wallPaint';
    case 'ceilingPaint': return 'ceilingPaint';
    case 'falseCeiling': return 'falseCeiling';
    case 'lightPoint': return 'points';
    default: return /electrical|wiring|switch/i.test(item.name) ? 'points' : null;
  }
}

/** True when a line is priced for the whole flat rather than one room. */
export const isWholeFlatLine = (line: Pick<BoqItem, 'roomId'>) =>
  !line.roomId || /^(whole\s*flat|unassigned|general scope)$/i.test(line.roomId.trim()) || isScopeBucket(line.roomId);

/** Lines priced for the whole flat that could be shared into rooms, with the basis each would use. */
export function wholeFlatCandidates(boq: BoqItem[], bankMap: Map<string, Item>): { line: BoqItem; basis: ShareBasis }[] {
  const out: { line: BoqItem; basis: ShareBasis }[] = [];
  (boq || []).forEach(line => {
    if (line.byRoom || !isWholeFlatLine(line)) return;
    const basis = shareBasisFor(bankMap.get(line.bankId));
    if (basis) out.push({ line, basis });
  });
  return out;
}

/** The line shared into the rooms by `basis`; its quantity becomes the sum of the shares. */
export function shareIntoRooms<T extends BoqItem>(line: T, basis: ShareBasis, rooms: Room[], ctx: MeasureContext = {}): T {
  const byRoom = { basis, rooms: {}, client: 'flat' as const };
  return { ...line, byRoom, qty: byRoomQty(byRoom, rooms, ctx) };
}

/** The line back to one figure for the flat, at the quantity it has now. */
export function unshare<T extends BoqItem>(line: T): T {
  const { byRoom: _, ...rest } = line;
  return rest as T;
}

/**
 * Painting as two lines measured from the plan: walls and ceilings, each shared
 * into the rooms. Uses the bank's wall and ceiling painting items; when the
 * bank has one painting item only, both lines use it. Null when there is none.
 */
export function paintingFromPlan(
  bank: Item[],
  rooms: Room[],
  newId: () => string,
  ctx: MeasureContext = {},
): { lines: BoqItem[]; wall: Item; ceiling: Item } | null {
  const painting = (bank || []).filter(i => inferBasis(i.name, i.unit) === 'wallPaint' || inferBasis(i.name, i.unit) === 'ceilingPaint');
  const wall = painting.find(i => /wall/i.test(i.name)) || painting.find(i => !/ceiling/i.test(i.name)) || painting[0];
  const ceiling = painting.find(i => /ceiling/i.test(i.name)) || wall;
  if (!wall || !ceiling) return null;
  const line = (item: Item, basis: ShareBasis): BoqItem => shareIntoRooms(
    { id: newId(), bankId: item.id, qty: 0, roomId: 'Whole flat', baseRate: item.materials, rationale: `${basis === 'wallPaint' ? 'Walls' : 'Ceilings'} measured from the plan` },
    basis, rooms, ctx,
  );
  return { lines: [line(wall, 'wallPaint'), line(ceiling, 'ceilingPaint')], wall, ceiling };
}

/** Every whole-flat line, and every civil line (PR C), with its quantity brought in line with the rooms (after the plan changed). */
export const syncedWholeFlat = (boq: BoqItem[], rooms: Room[], ctx: MeasureContext = {}, bankMap?: Map<string, Item>) =>
  (boq || []).map(l => (l.byRoom ? withByRoomQty(l, rooms, ctx) : l.civil && bankMap ? withCivilQty(l, rooms, bankMap) : l));

/**
 * A Playground option's summary, priced by its rules: what App's tier summary
 * holds for every option. Classic options keep App's own computation.
 */
export function playgroundTierSummary(
  tier: ProposalTier,
  bankMap: Map<string, Item>,
  ctx: { designFeeType?: string; designFee?: number; area?: number; rooms?: Room[] } | null | undefined,
) {
  const rules = tier.pricingRules || PLAYGROUND_PRICING;
  const rooms = (ctx?.rooms || []) as Room[];
  const t = playgroundTotals(tier.boq || [], bankMap, { rules, rooms });
  const designFee = designFeeForTier(ctx, t.sell, t.asActuals, rules);
  const totalRevenue = t.sell + designFee;
  const execProfit = t.sell - t.cost;
  return {
    totalSell: t.sell,
    totalCost: t.cost,
    totalGm: t.sell > 0 ? (execProfit / t.sell) * 100 : 0,
    itemCount: t.itemCount,
    totalRevenue,
    designFee,
    blendedGm: totalRevenue > 0 ? ((execProfit + designFee) / totalRevenue) * 100 : 0,
    asActualsTotal: t.asActuals,
  };
}

/* ───────────────────────────── versions of an option (PR R) ───────────────────────────── */

export interface VersionPlace {
  /** The option's versions, oldest first. */
  versions: ProposalTier[];
  /** This tier's number in them, from 1. */
  n: number;
  /** The version it came from, if any: what "Show changes since" compares against. */
  previous?: ProposalTier;
  /** The newest version, the one being worked on. */
  latest: ProposalTier;
  /** A newer version exists: this one is kept as it was. */
  superseded: boolean;
}

/** Where a tier sits among its option's versions (lib/optionChains). */
export function versionPlace(tiers: ProposalTier[], tierId: string): VersionPlace | null {
  const chain = chainOf(optionChains(tiers), tierId);
  const tier = (tiers || []).find(t => t.id === tierId);
  if (!chain || !tier) return null;
  const latest = latestOf(chain);
  return { versions: chain.versions, n: versionNo(chain, tierId), previous: previousVersion(chain, tier), latest, superseded: latest.id !== tierId };
}

/**
 * An option's next version, as Pricing & Tiers makes it: a deep copy, a new
 * draft, the same name, linked to the one it came from (which stays as it was).
 */
export function nextVersionOf(src: ProposalTier, id: string, at: number): ProposalTier {
  const copy: ProposalTier = { ...JSON.parse(JSON.stringify(src)), id, timestamp: at, lifecycleTag: 'Draft', parentTierId: src.id, name: src.name };
  delete (copy as { approval?: unknown }).approval;
  return copy;
}
