/**
 * BOQ Playground PR C — the Civil layer, for renovations.
 *
 * Civil work drawn on the plan, each a BOQ line with `civil` saying what it is
 * and how it is measured, so its quantity comes from the plan and follows it:
 *
 *   break        a wall broken: its length along the wall × the room's height
 *   build        a new wall: its length × the room's height
 *   floorRemove  the old floor taken up: the room's floor area
 *   floor        the new floor laid: the room's floor area
 *   walls7       wall tiles to 7′: the room's walls to 7′, less 21 sq ft a door
 *   waterproof   the floor and a 1′ upstand round the walls
 *
 * A break and a new wall are drawn as a segment on the plan (a break snaps to
 * the nearest wall of the room); the others are whole rooms, toggled on and
 * off. Re-flooring is two lines, the old floor out and the new one in, unless
 * the Item Bank's floor item does both. Debris removal is added once, across
 * the flat, with the first civil line. "Start from the brief" lays out what the
 * project's civil scope asks for (lib/civilScope) in one step.
 *
 * Each line is priced from an Item Bank item found by name (the studio's own
 * names: "Wall demolition", "Floor tiles, laid", "Waterproofing"…). When the
 * bank has none for a tool, the tool says so; the Owner can add the standard
 * civil items to the Item Bank. A break carries "check structure and society
 * approval" in its words, into the Detailed BOQ.
 *
 * Pure.
 */
import type { BoqCivil, BoqItem, Item, PropertyStatus, ProjectContext, Room } from '../../types';
import type { RoomKind } from '../takeoff';
import { basisOfUnit } from '../boqSize';
import { resolveCivilScope } from '../civilScope';
import { DEFAULT_HEIGHT_FT, kindOf } from './rooms';
import { ftin, roomRect, roundTo3in, round2, clamp } from './geometry';

export type CivilType = BoqCivil['type'];
export type Segment = NonNullable<BoqCivil['segment']>;
/** The tools on the Civil panel. Re-flooring adds the old floor out and the new one in. */
export type CivilTool = 'break' | 'build' | 'floor' | 'walls7' | 'waterproof';

export const CIVIL_TOOLS: { tool: CivilTool; label: string; hint: string; colour: string }[] = [
  { tool: 'break', label: 'Break a wall', hint: 'Drag along a wall', colour: '#e11d48' },
  { tool: 'build', label: 'Build a wall', hint: 'Drag inside a room', colour: '#334155' },
  { tool: 'floor', label: 'Re-floor a room', hint: 'Click a room: old tiles out, new in', colour: '#d97706' },
  { tool: 'walls7', label: 'Wall tiles to 7′', hint: 'Click a bathroom or the kitchen', colour: '#3D52A0' },
  { tool: 'waterproof', label: 'Waterproofing', hint: 'Click a wet room', colour: '#0284c7' },
];
export const toolOf = (t: CivilTool) => CIVIL_TOOLS.find(x => x.tool === t)!;
/** The tool a line belongs to: the old floor out belongs to re-flooring. */
export const toolOfType = (t: CivilType): CivilTool => (t === 'floorRemove' ? 'floor' : t);
/** What a line is, in a word for its trade (offers, the Sheet). */
export const CIVIL_TRADE: Record<CivilType, string> = {
  break: 'Demolition', build: 'Masonry', floorRemove: 'Demolition', floor: 'Flooring', walls7: 'Tiling', waterproof: 'Waterproofing',
};

/** The words a wall break carries into the Detailed BOQ (plan: "check structure and society approval"). */
export const BREAK_NOTE = 'Check structure and society approval before the wall is broken.';
/** Each door takes this much off the wall tiles, sq ft (3′ × 7′). */
export const DOOR_SQFT = 21;
const WET: RoomKind[] = ['toilet', 'kitchen', 'utility'];
export const isWet = (room: Pick<Room, 'name' | 'kind'>) => WET.includes(kindOf(room));

/* ───────────────────────────── the Item Bank's civil items ───────────────────────────── */

const ACTUALS = /as\s*actuals?|\(actuals?\)/i;
const TESTS: Record<CivilType | 'debris', (n: string) => boolean> = {
  break: n => /\b(demoli\w*|break\w*|dismantl\w*|hack\w*)\b/.test(n) && /\bwalls?\b/.test(n) && !/\btil|niche/.test(n),
  build: n => (/\b(new|brick|block|aac|partition)\b.*\bwalls?\b|\bwalls?\b.*\b(construction|masonry|brick|block)\b|\bmasonry\b/.test(n)) && !/niche|glass|panel|paper|til|paint|demoli|break/.test(n),
  floorRemove: n => /\b(remov\w*|hack\w*|dismantl\w*|demoli\w*)\b/.test(n) && /\b(floor\w*|tiles?)\b/.test(n) && !/\b(install\w*|laying|laid|lay|new|relay\w*)\b/.test(n) && !/wall\s*til|dado/.test(n),
  floor: n => /\b(floor\w*|vitrified)\b/.test(n) && !/\b(wall\s*til\w*|dado|skirting|false\s*ceiling|polish\w*|cleaning|protection)\b/.test(n) && !(/\b(remov\w*|hack\w*|dismantl\w*)\b/.test(n) && !/\b(install\w*|laying|laid|relay\w*)\b/.test(n)),
  walls7: n => /\bwall\s*til\w*|\bdado\b/.test(n),
  waterproof: n => /\bwater\s*proof\w*|\bwaterproof\w*/.test(n),
  debris: n => /\bdebris\b/.test(n),
};

export interface CivilItems {
  items: Partial<Record<CivilType | 'debris', Item>>;
  /** The floor item lifts the old floor too ("Demolish and install – flooring tiles"): no separate line for it. */
  floorDoesBoth: boolean;
}

/**
 * The Item Bank item each civil line is priced from, found by name. A measured
 * line needs an item priced by area or length; tiles bought at actuals and
 * lump sums are passed over (debris excepted). Of several, a tile beats a
 * laminate for the floor, and a civil category beats another.
 */
export function civilItems(bank: Item[]): CivilItems {
  const out: CivilItems['items'] = {};
  const norm = (i: Item) => `${i.name} ${i.cat || ''}`.toLowerCase();
  (Object.keys(TESTS) as (CivilType | 'debris')[]).forEach(t => {
    const fits = bank.filter(i => {
      const n = norm(i);
      if (!TESTS[t](n) || ACTUALS.test(n)) return false;
      if (t === 'debris') return true;
      const basis = basisOfUnit(i.unit);
      return basis === 'area' || basis === 'length';
    });
    const score = (i: Item) => {
      const n = norm(i);
      return (basisOfUnit(i.unit) === 'area' ? 4 : 0)
        + (/civil|floor|tiling|demolition|waterproof/i.test(i.cat || '') ? 2 : 0)
        + (t === 'floor' && /\btil|vitrified/.test(n) ? 3 : 0)
        // Re-flooring is old tiles out, new in: an item that does both is the one.
        + (t === 'floor' && /\b(demoli\w*|remov\w*)\b/.test(n) && /\b(install\w*|lay\w*|laid)\b/.test(n) ? 2 : 0);
    };
    const best = [...fits].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
    if (best) out[t] = best;
  });
  const f = out.floor;
  return { items: out, floorDoesBoth: !!f && /\b(demoli\w*|remov\w*|hack\w*)\b/i.test(f.name) };
}

/** The standard civil items, for an Item Bank that has none: names, units and starting rates (the Owner sets their own). */
export const STANDARD_CIVIL_ITEMS: { key: CivilType | 'debris'; name: string; cat: string; unit: string; rate: number; specs: string }[] = [
  { key: 'break', name: 'Wall demolition, brick', cat: 'Civil', unit: 'sq ft', rate: 45, specs: 'Breaking brick wall with plaster, making good the edges.' },
  { key: 'build', name: 'New wall, 4.5″ brick', cat: 'Civil', unit: 'sq ft', rate: 210, specs: '4.5″ brick wall, plastered both sides, ready for paint.' },
  { key: 'floorRemove', name: 'Remove existing floor tiles', cat: 'Civil', unit: 'sq ft', rate: 22, specs: 'Hacking the existing tiles and bed to a level base.' },
  { key: 'floor', name: 'Floor tiles, laid', cat: 'Flooring', unit: 'sq ft', rate: 165, specs: 'Vitrified tiles on a mortar bed; tile allowance ₹90 per sq ft, chosen at Selections.' },
  { key: 'walls7', name: 'Wall tiles to 7 ft, laid', cat: 'Tiling', unit: 'sq ft', rate: 150, specs: 'Wall tiles to 7 ft; tile allowance ₹70 per sq ft, chosen at Selections.' },
  { key: 'waterproof', name: 'Waterproofing, floor and upstand', cat: 'Civil', unit: 'sq ft', rate: 65, specs: 'Two-coat polymer waterproofing on the floor and 1 ft up the walls, with a ponding test.' },
  { key: 'debris', name: 'Debris removal', cat: 'Civil', unit: 'lot', rate: 18000, specs: 'Carting all debris away to an approved dump.' },
];

/**
 * The standard civil items the bank lacks, as Item Bank items: a starting rate
 * at a 25% markup (cost 80% of the rate, materials and labour 60 : 40).
 */
export function missingStandardItems(bank: Item[], newId: () => string): Item[] {
  const have = civilItems(bank);
  return STANDARD_CIVIL_ITEMS
    .filter(s => !have.items[s.key] && !(s.key === 'floorRemove' && have.floorDoesBoth))
    .map(s => {
      const cost = s.rate / 1.25;
      return { id: newId(), name: s.name, cat: s.cat, unit: s.unit, specs: s.specs, materials: Math.round(cost * 0.6), labor: Math.round(cost * 0.4), margin: 25 } as Item;
    });
}

/* ───────────────────────────── measuring ───────────────────────────── */

export interface CivilDims { w: number; h: number; area: number; per: number; height: number; doors: number }

/** A room's floor, walls and height, from the plan (else its own length and width, else its area). */
export function civilDims(room: Room | undefined): CivilDims | null {
  if (!room) return null;
  const r = roomRect(room);
  let w = 0, h = 0;
  if (r) { w = r.w; h = r.h; }
  else if (Number(room.length) > 0 && Number(room.width) > 0) { w = Number(room.length); h = Number(room.width); }
  else if (Number(room.size) > 0) { w = h = Math.sqrt(Number(room.size)); }
  else return null;
  return { w, h, area: w * h, per: 2 * (w + h), height: Number(room.height) > 0 ? Number(room.height) : DEFAULT_HEIGHT_FT, doors: Math.max(1, Number(room.doors) || 1) };
}

export const segLength = (g: Segment) => Math.hypot(g[2] - g[0], g[3] - g[1]);

/**
 * The quantity a civil line takes from the plan, in its item's unit: sq ft for
 * an item priced by area, running feet for one priced by length, 1 for a count.
 */
export function civilQty(civil: BoqCivil, room: Room | undefined, unit?: string): number | null {
  const d = civilDims(room);
  if (!d) return null;
  const basis = basisOfUnit(unit) || 'area';
  if (basis === 'count' || basis === 'lump') return 1;
  const len = civil.segment ? segLength(civil.segment) : 0;
  const area = (() => {
    switch (civil.type) {
      case 'break': case 'build': return len * d.height;
      case 'floor': case 'floorRemove': return d.area;
      case 'walls7': return Math.max(0, d.per * 7 - d.doors * DOOR_SQFT);
      case 'waterproof': return d.area + d.per;
    }
  })();
  const run = civil.type === 'break' || civil.type === 'build' ? len : d.per;
  return Math.round(basis === 'length' ? run : area);
}

/** How the quantity is worked out, in words (the mockup's "How it is measured"). */
export function civilDerivation(civil: BoqCivil, room: Room | undefined): string {
  const d = civilDims(room);
  if (!d) return 'The room has no size yet';
  switch (civil.type) {
    case 'break': case 'build':
      return `${ftin(civil.segment ? segLength(civil.segment) : 0)} long × ${ftin(d.height)} high${civil.type === 'build' ? ', 4.5″ thick' : ''}`;
    case 'floor': case 'floorRemove': return `${ftin(d.w)} × ${ftin(d.h)} floor`;
    case 'walls7': return `${ftin(d.per)} of wall × 7′, less ${d.doors} door${d.doors > 1 ? 's' : ''}`;
    case 'waterproof': return `the floor and a 1′ upstand on ${ftin(d.per)} of wall`;
  }
}

const unitOf = (l: BoqItem, bankMap: Map<string, Item>) => bankMap.get(l.bankId)?.unit || (l as any).unit;

/** The line with its quantity from the plan (a line not on a civil room keeps its own). */
export function withCivilQty<T extends BoqItem>(line: T, rooms: Room[], bankMap: Map<string, Item>): T {
  if (!line.civil) return line;
  const q = civilQty(line.civil, rooms.find(r => r.name === line.roomId), unitOf(line, bankMap));
  return q == null || q === line.qty ? line : { ...line, qty: q };
}

/* ───────────────────────────── segments: a wall broken or built ───────────────────────────── */

/**
 * The segment a drag draws in a room, axis-aligned, on the 3″ grid, at least
 * 1 ft long. A break snaps to the room's nearest wall and runs along it; a new
 * wall runs inside the room the way the drag mostly goes. A click with no drag
 * gives a 3 ft break, or a 4 ft wall across the room's longer side.
 */
export function segmentFor(tool: 'break' | 'build', room: Room, a: [number, number], b: [number, number]): Segment | null {
  const r = roomRect(room);
  if (!r) return null;
  const q = roundTo3in;
  const [ax, ay] = a, [bx, by] = b;
  const moved = Math.hypot(bx - ax, by - ay) > 0.6;
  const cx = (v: number) => q(clamp(v, r.x, r.x + r.w));
  const cy = (v: number) => q(clamp(v, r.y, r.y + r.h));
  const H = (x1: number, x2: number, y: number): Segment | null => { x1 = cx(x1); x2 = cx(x2); return x2 - x1 >= 1 ? [x1, q(y), x2, q(y)] : null; };
  const V = (y1: number, y2: number, x: number): Segment | null => { y1 = cy(y1); y2 = cy(y2); return y2 - y1 >= 1 ? [q(x), y1, q(x), y2] : null; };
  if (tool === 'break') {
    const walls: [number, 'h' | 'v', number][] = [
      [Math.abs(ay - r.y), 'h', r.y], [Math.abs(ay - (r.y + r.h)), 'h', r.y + r.h],
      [Math.abs(ax - r.x), 'v', r.x], [Math.abs(ax - (r.x + r.w)), 'v', r.x + r.w],
    ];
    const [, dir, at] = walls.sort((p, s) => p[0] - s[0])[0];
    return dir === 'h'
      ? H(moved ? Math.min(ax, bx) : ax - 1.5, moved ? Math.max(ax, bx) : ax + 1.5, at)
      : V(moved ? Math.min(ay, by) : ay - 1.5, moved ? Math.max(ay, by) : ay + 1.5, at);
  }
  const hor = moved ? Math.abs(bx - ax) >= Math.abs(by - ay) : r.w >= r.h;
  return hor
    ? H(moved ? Math.min(ax, bx) : ax - 2, moved ? Math.max(ax, bx) : ax + 2, cy(ay))
    : V(moved ? Math.min(ay, by) : ay - 2, moved ? Math.max(ay, by) : ay + 2, cx(ax));
}

/** The segment at a new length, from its start, kept inside its room. */
export function withSegmentLength(g: Segment, length: number, room: Room | undefined): Segment {
  const r = roomRect(room);
  const L = Math.max(1, roundTo3in(length));
  if (g[1] === g[3]) return [g[0], g[1], r ? Math.min(r.x + r.w, g[0] + L) : g[0] + L, g[3]];
  return [g[0], g[1], g[2], r ? Math.min(r.y + r.h, g[1] + L) : g[1] + L];
}

/** The segment moved by dx, dy (its room moved on a new plan). */
export const movedSegment = (g: Segment, dx: number, dy: number): Segment => [round2(g[0] + dx), round2(g[1] + dy), round2(g[2] + dx), round2(g[3] + dy)];

/* ───────────────────────────── adding civil lines ───────────────────────────── */

export interface CivilContext {
  bank: Item[];
  bankMap: Map<string, Item>;
  rooms: Room[];
  newId: () => string;
}

/** The room every line across the flat sits in. */
export const FLAT_ROOM = 'Whole flat';

/** A civil line in a room, priced from its item, its quantity from the plan. */
export function civilLine(type: CivilType, room: Room, item: Item, newId: () => string, segment?: Segment): BoqItem {
  const civil: BoqCivil = segment ? { type, segment } : { type };
  const line: BoqItem = {
    id: newId(), bankId: item.id, qty: civilQty(civil, room, item.unit) ?? 0, roomId: room.name, baseRate: item.materials, civil,
    ...(type === 'break' ? { specs: `${String(item.specs || '').trim()}${item.specs ? ' ' : ''}${BREAK_NOTE}` } : {}),
  };
  return line;
}

/** The debris line, added once across the flat with the first civil line, if the bank has the item and the BOQ has none. */
export function debrisLine(boq: BoqItem[], ctx: CivilContext): BoqItem | null {
  const item = civilItems(ctx.bank).items.debris;
  if (!item) return null;
  const has = boq.some(l => l.boqStatus !== 'deleted' && (l.bankId === item.id || /\bdebris\b/i.test(String(ctx.bankMap.get(l.bankId)?.name || (l as any).name || ''))));
  if (has) return null;
  return { id: ctx.newId(), bankId: item.id, qty: 1, roomId: FLAT_ROOM, baseRate: item.materials };
}

export interface CivilChange {
  boq: BoqItem[];
  /** The lines added (debris included). */
  added: BoqItem[];
  removed: BoqItem[];
  debris: boolean;
  /** What happened, in words, for the toast. */
  message: string;
}
export type CivilResult = CivilChange | { problem: string };

const live = (l: BoqItem) => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted';
const unitWord = (item: Item) => String(item.unit || '').trim();

/** The lines a room tool adds (or would add) to a room. */
function roomLines(tool: 'floor' | 'walls7' | 'waterproof', room: Room, ctx: CivilContext): BoqItem[] | { problem: string } {
  const { items, floorDoesBoth } = civilItems(ctx.bank);
  const label = toolOf(tool).label;
  if (tool === 'floor') {
    if (!items.floor) return { problem: `No item in the Item Bank for ${label.toLowerCase()}: add one such as “Floor tiles, laid”, priced per sq ft.` };
    const out = [civilLine('floor', room, items.floor, ctx.newId)];
    if (!floorDoesBoth && items.floorRemove) out.unshift(civilLine('floorRemove', room, items.floorRemove, ctx.newId));
    return out;
  }
  const item = items[tool];
  if (!item) return { problem: `No item in the Item Bank for ${label.toLowerCase()}: add one such as “${STANDARD_CIVIL_ITEMS.find(s => s.key === tool)!.name}”, priced per sq ft.` };
  return [civilLine(tool, room, item, ctx.newId)];
}

/**
 * A room tool clicked on a room: re-flooring, wall tiles or waterproofing put
 * in, or taken out when the room already has them. Waterproofing is for wet
 * rooms. Debris removal comes in with the first civil line.
 */
export function toggleRoomCivil(boq: BoqItem[], room: Room, tool: 'floor' | 'walls7' | 'waterproof', ctx: CivilContext): CivilResult {
  const has = boq.filter(l => live(l) && l.civil && l.roomId === room.name && toolOfType(l.civil.type) === tool);
  const label = toolOf(tool).label;
  if (has.length) {
    const ids = new Set(has.map(l => l.id));
    return { boq: boq.filter(l => !ids.has(l.id)), added: [], removed: has, debris: false, message: `${room.name}: ${label.toLowerCase()} taken out.` };
  }
  if (tool === 'waterproof' && !isWet(room)) return { problem: 'Waterproofing is for bathrooms and the kitchen.' };
  const lines = roomLines(tool, room, ctx);
  if ('problem' in lines) return lines;
  const debris = debrisLine(boq, ctx);
  const added = [...lines, ...(debris ? [debris] : [])];
  const words = lines.map(l => `${String(ctx.bankMap.get(l.bankId)?.name || '').toLowerCase()}, ${l.qty} ${unitWord(ctx.bankMap.get(l.bankId)!)}`).join('; ');
  return { boq: [...boq, ...added], added, removed: [], debris: !!debris, message: `${room.name}: ${words}, measured from the plan.` };
}

/** A wall broken or built along a segment in a room. */
export function addWallCivil(boq: BoqItem[], tool: 'break' | 'build', room: Room, segment: Segment, ctx: CivilContext): CivilResult {
  const item = civilItems(ctx.bank).items[tool];
  const label = toolOf(tool).label;
  if (!item) return { problem: `No item in the Item Bank to ${label.toLowerCase()}: add one such as “${STANDARD_CIVIL_ITEMS.find(s => s.key === tool)!.name}”, priced per sq ft.` };
  const line = civilLine(tool, room, item, ctx.newId, segment);
  const debris = debrisLine(boq, ctx);
  const added = [line, ...(debris ? [debris] : [])];
  return {
    boq: [...boq, ...added], added, removed: [], debris: !!debris,
    message: `${label} in ${room.name}: ${civilDerivation(line.civil!, room)}, ${line.qty} ${unitWord(item)}, measured from the plan.`,
  };
}

/* ───────────────────────────── from the brief ───────────────────────────── */

/** "Renovation" for a finished flat; what the panel's chip says of the site. */
export const SITE_LABEL: Record<PropertyStatus, string> = { finished: 'Renovation', semi_finished: 'Semi-finished', raw_shell: 'Raw shell' };

/** What the brief's civil scope asks the plan for, in words: "both bathrooms redone and new flooring". */
export function briefCivilAsk(ctx: Partial<ProjectContext> | null | undefined, rooms: Room[]): string {
  const s = resolveCivilScope(ctx || undefined);
  const baths = rooms.filter(r => kindOf(r) === 'toilet').length;
  const parts: string[] = [];
  if (s.bathrooms) parts.push(`${baths === 2 ? 'both bathrooms' : baths === 1 ? 'the bathroom' : baths > 2 ? `all ${baths} bathrooms` : 'the bathrooms'} redone`);
  if (s.flooring) parts.push('new flooring');
  if (s.kitchenCivil) parts.push('the kitchen’s dado tiles');
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
}

/**
 * What "Start from the brief" lays out: each bathroom waterproofed, re-floored
 * and tiled to 7′ (bathrooms); every other room re-floored (flooring); the
 * kitchen's walls tiled (kitchen civil). What a room already has is skipped;
 * debris comes in once.
 */
export function fromBrief(boq: BoqItem[], ctx: CivilContext & { project: Partial<ProjectContext> | null | undefined }): CivilResult {
  const scope = resolveCivilScope(ctx.project || undefined);
  const planned = ctx.rooms.filter(r => roomRect(r));
  const wants: [Room, 'floor' | 'walls7' | 'waterproof'][] = [];
  planned.forEach(r => {
    const k = kindOf(r);
    if (scope.bathrooms && k === 'toilet') wants.push([r, 'waterproof'], [r, 'floor'], [r, 'walls7']);
    if (scope.flooring && k !== 'toilet') wants.push([r, 'floor']);
    if (scope.kitchenCivil && k === 'kitchen') wants.push([r, 'walls7']);
  });
  if (!wants.length) return { problem: 'The brief asks for no civil work on these rooms. Draw what the site needs with the tools.' };
  const added: BoqItem[] = [];
  const missing = new Set<string>();
  wants.forEach(([room, tool]) => {
    const already = [...boq, ...added].some(l => live(l) && l.civil && l.roomId === room.name && toolOfType(l.civil.type) === tool);
    if (already) return;
    const lines = roomLines(tool, room, ctx);
    if ('problem' in lines) { missing.add(toolOf(tool).label); return; }
    added.push(...lines);
  });
  if (!added.length) return { problem: missing.size ? `The Item Bank has no item for ${[...missing].join(', ').toLowerCase()}.` : 'The brief’s civil work is already on the plan.' };
  const debris = debrisLine(boq, ctx);
  if (debris) added.push(debris);
  const civilCount = added.filter(l => l.civil).length;
  const ask = briefCivilAsk(ctx.project, ctx.rooms);
  return {
    boq: [...boq, ...added], added, removed: [], debris: !!debris,
    message: `From the brief: ${civilCount} civil line${civilCount === 1 ? '' : 's'}${ask ? ` for ${ask}` : ''}, measured from the plan.${missing.size ? ` No Item Bank item for ${[...missing].join(', ').toLowerCase()}.` : ''}`,
  };
}

/* ───────────────────────────── following the plan ───────────────────────────── */

/** Every civil line's quantity brought in line with its room (after the plan or a room changed). */
export const syncedCivil = (boq: BoqItem[], rooms: Room[], bankMap: Map<string, Item>) =>
  (boq || []).map(l => (l.civil ? withCivilQty(l, rooms, bankMap) : l));

/** The civil lines in a room, and the total of a list. */
export const civilIn = (boq: BoqItem[], room: string) => boq.filter(l => live(l) && l.civil && l.roomId === room);
export const isCivil = (l: BoqItem) => !!l.civil;
