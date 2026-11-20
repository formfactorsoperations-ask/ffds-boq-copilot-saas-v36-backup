import { describe, it, expect } from 'vitest';
import {
  civilItems, civilQty, civilDerivation, segmentFor, withSegmentLength, toggleRoomCivil, addWallCivil, fromBrief,
  syncedCivil, missingStandardItems, briefCivilAsk, briefFloorRooms, canRefloor, civilLine, BREAK_NOTE, isWet, type CivilContext,
} from '../../lib/playground/civil';
import { resizeRoom } from '../../lib/playground/roomEdges';
import { replacePlan } from '../../lib/playground/planSheet';
import { playgroundTotals, PLAYGROUND_PRICING, lineAmount } from '../../lib/playground/pricing';
import { scopeSplit } from '../../lib/offers';
import { hasCivilWork } from '../../lib/annexure';
import { INITIAL_BANK } from '../../constants';

const I = (id: string, name: string, cat: string, unit: string, materials: number, labor: number, specs = '', margin = 25): any => ({ id, name, cat, unit, materials, labor, margin, specs });
/* The mockup's civil items. */
const bank: any[] = [
  I('b50', 'Wall demolition, brick', 'Civil', 'sq ft', 22, 14, 'Breaking brick wall with plaster, making good the edges.'),
  I('b51', 'New wall, 4.5″ brick', 'Civil', 'sq ft', 100, 68),
  I('b52', 'Remove existing floor tiles', 'Civil', 'sq ft', 10, 8),
  I('b53', 'Floor tiles, laid', 'Flooring', 'sq ft', 90, 42),
  I('b54', 'Wall tiles to 7 ft, laid', 'Tiling', 'sq ft', 80, 40),
  I('b55', 'Waterproofing, floor and upstand', 'Civil', 'sq ft', 30, 22),
  I('b56', 'Debris removal', 'Civil', 'lot', 9000, 5400),
  I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft', 1500, 400),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
/* A bathroom 6′ × 8′, 10′ high, one door; a bedroom beside it; a kitchen; a living room. */
const rooms: any[] = [
  { name: 'Bath 2', size: 48, unit: 'sq ft', kind: 'toilet', plan: { x: 0, y: 0, w: 6, h: 8 } },
  { name: 'Bedroom 2', size: 120, unit: 'sq ft', plan: { x: 6, y: 0, w: 12, h: 10 } },
  { name: 'Kitchen', size: 80, unit: 'sq ft', plan: { x: 18, y: 0, w: 10, h: 8 } },
  { name: 'Living Room', size: 224, unit: 'sq ft', plan: { x: 0, y: 10, w: 16, h: 14 } },
];
const bath = rooms[0];
let n = 0;
const ctx: CivilContext = { bank, bankMap, rooms, newId: () => `c${++n}` };

describe('each quantity rule, on a fixture room', () => {
  it('measures re-flooring, wall tiles to 7′ and waterproofing from the room', () => {
    expect(civilQty({ type: 'floor' }, bath, 'sq ft')).toBe(48);
    expect(civilQty({ type: 'floorRemove' }, bath, 'sq ft')).toBe(48);
    // 28 ft of wall × 7 ft, less one 3 × 7 door.
    expect(civilQty({ type: 'walls7' }, bath, 'sq ft')).toBe(28 * 7 - 21);
    // The floor and a 1 ft upstand round 28 ft of wall.
    expect(civilQty({ type: 'waterproof' }, bath, 'sq ft')).toBe(48 + 28);
    expect(civilQty({ type: 'walls7' }, { ...bath, doors: 2 }, 'sq ft')).toBe(28 * 7 - 42);
  });

  it('measures a wall broken or built: its length × the room’s height', () => {
    expect(civilQty({ type: 'break', segment: [6, 2, 6, 6] }, rooms[1], 'sq ft')).toBe(40);
    expect(civilQty({ type: 'build', segment: [8, 5, 14, 5] }, { ...rooms[1], height: 9 }, 'sq ft')).toBe(54);
    // An item priced by the running foot takes the length; one priced by the job, 1.
    expect(civilQty({ type: 'break', segment: [6, 2, 6, 6] }, rooms[1], 'rft')).toBe(4);
    expect(civilQty({ type: 'walls7' }, bath, 'rft')).toBe(28);
    expect(civilQty({ type: 'floor' }, bath, 'lumpsum')).toBe(1);
  });

  it('says how each is measured', () => {
    expect(civilDerivation({ type: 'floor' }, bath)).toBe('6′ × 8′ floor');
    expect(civilDerivation({ type: 'walls7' }, bath)).toBe('28′ of wall × 7′, less 1 door');
    expect(civilDerivation({ type: 'waterproof' }, bath)).toBe('the floor and a 1′ upstand on 28′ of wall');
    expect(civilDerivation({ type: 'build', segment: [8, 5, 14, 5] }, rooms[1])).toBe('6′ long × 10′ high, 4.5″ thick');
  });

  it('a room with no plan measures from its length and width, else its area', () => {
    expect(civilQty({ type: 'floor' }, { name: 'Store', size: 0, unit: 'sq ft', length: 5, width: 4 } as any, 'sq ft')).toBe(20);
    expect(civilQty({ type: 'waterproof' }, { name: 'Store', size: 36, unit: 'sq ft' } as any, 'sq ft')).toBe(36 + 24);
    expect(civilQty({ type: 'floor' }, { name: 'Store', size: 0, unit: 'sq ft' } as any, 'sq ft')).toBeNull();
  });
});

describe('a wall break snaps to the nearest wall', () => {
  const bed = rooms[1];
  it('a drag near a wall runs along it, on the 3″ grid, inside the room', () => {
    // Pressed 0.4 ft in from the left wall, dragged down: the left wall, x = 6.
    expect(segmentFor('break', bed, [6.4, 2.1], [6.9, 6.05])).toEqual([6, 2, 6, 6]);
    // Near the bottom wall, dragged right past the room: clamped to the room's end.
    expect(segmentFor('break', bed, [14, 9.6], [21, 9.4])).toEqual([14, 10, 18, 10]);
  });
  it('a click gives a 3 ft break on the nearest wall; too short is nothing', () => {
    expect(segmentFor('break', bed, [12, 0.3], [12, 0.3])).toEqual([10.5, 0, 13.5, 0]);
    // In the corner, the nearer wall wins: 0.1 ft from the top, 0.2 ft from the left.
    expect(segmentFor('break', bed, [6.2, 0.1], [6.2, 0.4])).toEqual([6, 0, 7.75, 0]);
    expect(segmentFor('break', bed, [6.1, 5], [6.1, 5])).toEqual([6, 3.5, 6, 6.5]);
  });
  it('a new wall runs inside the room the way the drag goes; a click lays 4 ft across the longer side', () => {
    expect(segmentFor('build', bed, [8, 5.1], [14, 5.6])).toEqual([8, 5, 14, 5]);
    expect(segmentFor('build', bed, [9, 1], [9.4, 7])).toEqual([9, 1, 9, 7]);
    expect(segmentFor('build', bed, [12, 5], [12, 5])).toEqual([10, 5, 14, 5]);
  });
  it('a segment’s length is typed from its start, kept in the room', () => {
    expect(withSegmentLength([6, 2, 6, 6], 5.1, bed)).toEqual([6, 2, 6, 7]);
    expect(withSegmentLength([8, 5, 14, 5], 40, bed)).toEqual([8, 5, 18, 5]);
  });
});

describe('the Item Bank’s civil items', () => {
  it('finds each by its name and unit', () => {
    const c = civilItems(bank);
    expect(Object.fromEntries(Object.entries(c.items).map(([k, v]) => [k, v!.id]))).toEqual({
      break: 'b50', build: 'b51', floorRemove: 'b52', floor: 'b53', floorWet: 'b53', walls7: 'b54', waterproof: 'b55', debris: 'b56',
    });
  });

  it('reads the studio’s default bank: a lift-and-lay floor item and laminate are not a new floor, anti-skid tiles are for bathrooms', () => {
    const c = civilItems(INITIAL_BANK as any);
    // Re-flooring is two lines, the old floor out and the new one in: "Demolish and install" is neither.
    expect(c.items.floor).toBeUndefined();
    expect(c.items.floorRemove).toBeUndefined();
    expect(c.items.floorWet!.name).toBe('ANTI-SKID FLOOR TILES');
    expect(canRefloor(c)).toBe(false);
    expect(c.items.walls7!.name).toBe('DEMOLISH AND INSTALL - WALL TILES');
    expect(c.items.debris!.name).toBe('DEBRIS REMOVAL');
    expect(c.items.break).toBeUndefined();
    expect(c.items.waterproof).toBeUndefined();
    // The Owner can add the missing standard items; nothing it already has.
    let k = 0;
    const add = missingStandardItems(INITIAL_BANK as any, () => `s${++k}`);
    expect(add.map(i => i.name)).toEqual(['Wall demolition, brick', 'New wall, 4.5″ brick', 'Remove existing floor tiles', 'Floor tiles, laid', 'Waterproofing, floor and upstand']);
    // Starting rates at a 25% markup: ₹45 a sq ft for the wall demolition.
    expect(Math.round((add[0].materials + add[0].labor) * 1.25)).toBe(45);
    // With them in, a room re-floors in the mockup's two lines; a bathroom lays the bank's anti-skid tiles.
    const full = [...(INITIAL_BANK as any[]), ...add];
    const after = civilItems(full);
    expect(canRefloor(after)).toBe(true);
    expect(missingStandardItems(full, () => 'x')).toEqual([]);
    const fctx: CivilContext = { bank: full, bankMap: new Map(full.map(b => [b.id, b])), rooms, newId: () => `f${++n}` };
    const dry = toggleRoomCivil([], rooms[1], 'floor', fctx);
    if ('problem' in dry) throw new Error(dry.problem);
    expect(dry.added.filter(l => l.civil).map(l => [fctx.bankMap.get(l.bankId)!.name, l.qty])).toEqual([['Remove existing floor tiles', 120], ['Floor tiles, laid', 120]]);
    const wet = toggleRoomCivil([], bath, 'floor', fctx);
    if ('problem' in wet) throw new Error(wet.problem);
    expect(wet.added.filter(l => l.civil).map(l => fctx.bankMap.get(l.bankId)!.name)).toEqual(['Remove existing floor tiles', 'ANTI-SKID FLOOR TILES']);
    // A kitchen takes the ordinary floor.
    const kit = toggleRoomCivil([], rooms[2], 'floor', fctx);
    if ('problem' in kit) throw new Error(kit.problem);
    expect(kit.added.filter(l => l.civil).map(l => fctx.bankMap.get(l.bankId)!.name)).toEqual(['Remove existing floor tiles', 'Floor tiles, laid']);
  });

  it('re-flooring needs both items: without one it says which to add', () => {
    const noRemove = { ...ctx, bank: bank.filter(b => b.id !== 'b52') };
    const r = toggleRoomCivil([], rooms[1], 'floor', noRemove);
    expect(r).toEqual({ problem: 'No item in the Item Bank to take up the old floor: add one such as “Remove existing floor tiles”, priced per sq ft.' });
    expect(canRefloor(civilItems(noRemove.bank))).toBe(false);
    // A raw shell has no old floor: only the new one goes in.
    expect(canRefloor(civilItems(noRemove.bank), 'raw_shell')).toBe(true);
    const raw = toggleRoomCivil([], rooms[1], 'floor', { ...noRemove, site: 'raw_shell' });
    if ('problem' in raw) throw new Error(raw.problem);
    expect(raw.added.filter(l => l.civil).map(l => l.civil!.type)).toEqual(['floor']);
    const noLay = toggleRoomCivil([], rooms[1], 'floor', { ...ctx, bank: bank.filter(b => b.id !== 'b53') });
    expect('problem' in noLay && noLay.problem).toBe('No item in the Item Bank for the new floor: add one such as “Floor tiles, laid”, priced per sq ft.');
  });
});

describe('adding civil work', () => {
  it('re-flooring is the old floor out and the new one in; debris comes in once; clicking again takes it out', () => {
    const r1 = toggleRoomCivil([], bath, 'floor', ctx);
    if ('problem' in r1) throw new Error(r1.problem);
    expect(r1.added.map(l => [l.bankId, l.qty, l.roomId])).toEqual([['b52', 48, 'Bath 2'], ['b53', 48, 'Bath 2'], ['b56', 1, 'Whole flat']]);
    expect(r1.added[0].civil).toEqual({ type: 'floorRemove' });
    expect(r1.debris).toBe(true);
    expect(r1.message).toBe('Bath 2: remove existing floor tiles, 48 sq ft; floor tiles, laid, 48 sq ft, measured from the plan.');
    const r2 = toggleRoomCivil(r1.boq, bath, 'walls7', ctx);
    if ('problem' in r2) throw new Error(r2.problem);
    expect(r2.added.map(l => l.bankId)).toEqual(['b54']);
    expect(r2.debris).toBe(false);
    const r3 = toggleRoomCivil(r2.boq, bath, 'floor', ctx);
    if ('problem' in r3) throw new Error(r3.problem);
    expect(r3.removed.map(l => l.bankId)).toEqual(['b52', 'b53']);
    expect(r3.message).toBe('Bath 2: re-floor a room taken out.');
    expect(r3.boq.map(l => l.bankId)).toEqual(['b56', 'b54']);
  });

  it('waterproofing is for wet rooms; a tool with no item says what to add', () => {
    expect(isWet(rooms[2])).toBe(true);
    expect(toggleRoomCivil([], rooms[1], 'waterproof', ctx)).toEqual({ problem: 'Waterproofing is for bathrooms and the kitchen.' });
    const none = toggleRoomCivil([], bath, 'waterproof', { ...ctx, bank: bank.filter(b => b.id !== 'b55') });
    expect('problem' in none && none.problem).toMatch(/No item in the Item Bank for waterproofing/);
  });

  it('a wall break is measured, priced and carries the structure note into the Detailed BOQ', () => {
    const r = addWallCivil([], 'break', rooms[1], [6, 2, 6, 6], ctx);
    if ('problem' in r) throw new Error(r.problem);
    const l = r.added[0];
    expect(l).toMatchObject({ bankId: 'b50', qty: 40, roomId: 'Bedroom 2', civil: { type: 'break', segment: [6, 2, 6, 6] } });
    expect(l.specs).toBe(`Breaking brick wall with plaster, making good the edges. ${BREAK_NOTE}`);
    expect(r.message).toBe('Break a wall in Bedroom 2: 4′ long × 10′ high, 40 sq ft, measured from the plan.');
    expect(hasCivilWork(r.boq as any)).toBe(true);
  });
});

describe('Start from the brief', () => {
  const project: any = { propertyStatus: 'finished', civilScope: { bathrooms: true, flooring: true } };

  it('lays out the bathrooms and the flooring in one step, each line measured, debris once', () => {
    // The brief names no rooms for the flooring: the living and dining rooms, as in the mockup.
    expect(briefCivilAsk(project, rooms)).toBe('the bathroom redone and new flooring in the living room');
    const r = fromBrief([], { ...ctx, project });
    if ('problem' in r) throw new Error(r.problem);
    const civil = r.added.filter(l => l.civil);
    // The bathroom: waterproofing, old floor out, new floor, wall tiles. The living room: old floor out, new floor.
    expect(civil.filter(l => l.roomId === 'Bath 2').map(l => l.civil!.type)).toEqual(['waterproof', 'floorRemove', 'floor', 'walls7']);
    expect(civil.filter(l => l.roomId === 'Living Room').map(l => [l.civil!.type, l.qty])).toEqual([['floorRemove', 224], ['floor', 224]]);
    expect(civil.filter(l => l.roomId === 'Bedroom 2' || l.roomId === 'Kitchen')).toEqual([]);
    expect(civil).toHaveLength(4 + 2);
    expect(civil.every(l => l.qty > 0)).toBe(true);
    expect(r.added.filter(l => l.bankId === 'b56')).toHaveLength(1);
    expect(r.message).toBe('From the brief: 6 civil lines for the bathroom redone and new flooring in the living room, measured from the plan.');
    // Again: nothing more to add.
    const again = fromBrief(r.boq, { ...ctx, project });
    expect(again).toEqual({ problem: 'The brief’s civil work is already on the plan.' });
  });

  it('a brief with no civil work says so; the kitchen’s dado comes from kitchen civil', () => {
    expect('problem' in fromBrief([], { ...ctx, project: { propertyStatus: 'finished' } })).toBe(true);
    const k = fromBrief([], { ...ctx, project: { propertyStatus: 'finished', civilScope: { kitchenCivil: true } } });
    if ('problem' in k) throw new Error(k.problem);
    expect(k.added.filter(l => l.civil).map(l => [l.roomId, l.civil!.type])).toEqual([['Kitchen', 'walls7']]);
  });
});

describe('Replace flooring, room by room', () => {
  const on = (clientBrief?: string, propertyStatus = 'finished'): any => ({ propertyStatus, clientBrief, civilScope: { flooring: true } });
  const floored = (p: any) => briefFloorRooms(p, rooms).rooms.map(r => r.name);

  it('re-floors the rooms the brief names', () => {
    expect(floored(on('Replace the flooring in bedroom 2 and the kitchen. Modern look.'))).toEqual(['Bedroom 2', 'Kitchen']);
    expect(briefCivilAsk(on('Replace the flooring in bedroom 2 and the kitchen.'), rooms)).toBe('new flooring in the bedroom 2 and the kitchen');
    expect(floored(on('Vitrified tiles for the living room floor'))).toEqual(['Living Room']);
    expect(floored(on('New flooring in all bedrooms'))).toEqual(['Bedroom 2', 'Kitchen', 'Living Room']);
    // A clause that keeps a floor is not a re-floor; the next one is.
    expect(floored(on('Keep existing flooring in the bedrooms. New flooring in the kitchen.'))).toEqual(['Kitchen']);
  });

  it('the whole flat when the brief says so, or the site is a raw shell; otherwise the living and dining rooms', () => {
    expect(briefFloorRooms(on('Civil refresh to the entire flooring'), rooms)).toMatchObject({ throughout: true });
    expect(floored(on('Civil refresh to the entire flooring'))).toEqual(['Bedroom 2', 'Kitchen', 'Living Room']);
    expect(briefCivilAsk(on('Civil refresh to the entire flooring'), rooms)).toBe('new flooring throughout');
    expect(floored(on(undefined, 'raw_shell'))).toEqual(['Bedroom 2', 'Kitchen', 'Living Room']);
    expect(floored(on('Warm minimal, lots of storage'))).toEqual(['Living Room']);
    // The mockup's flat: the living and dining rooms, in its words.
    const flat: any[] = [{ name: 'Living' }, { name: 'Dining' }, { name: 'Master Bedroom' }, { name: 'Bath 1' }, { name: 'Bath 2' }];
    expect(briefCivilAsk({ propertyStatus: 'finished', civilScope: { bathrooms: true, flooring: true } }, flat))
      .toBe('both bathrooms redone and new flooring in the living and dining rooms');
    expect(briefCivilAsk(on(), [{ name: 'Living / Dining' }, { name: 'Kitchen' }] as any)).toBe('new flooring in the living and dining room');
    expect(briefCivilAsk(on(), [{ name: 'Living Rm.' }, { name: 'Dining Room' }, { name: 'Kitchen' }] as any)).toBe('new flooring in the living and dining rooms');
    // A flat with neither: every room.
    expect(briefCivilAsk(on(), [{ name: 'Bedroom' }, { name: 'Kitchen' }] as any)).toBe('new flooring throughout');
  });

  it('a raw shell lays the new floor only: there is no old floor to take up', () => {
    const r = fromBrief([], { ...ctx, project: on(undefined, 'raw_shell') });
    if ('problem' in r) throw new Error(r.problem);
    const floors = r.added.filter(l => l.civil && (l.civil.type === 'floor' || l.civil.type === 'floorRemove'));
    expect(floors.map(l => [l.roomId, l.civil!.type])).toEqual([['Bath 2', 'floor'], ['Bedroom 2', 'floor'], ['Kitchen', 'floor'], ['Living Room', 'floor']]);
  });
});

describe('civil quantities follow the plan', () => {
  const start = (() => {
    const a = toggleRoomCivil([], bath, 'floor', ctx) as any;
    const b = addWallCivil(a.boq, 'break', rooms[1], [6, 2, 6, 6], ctx) as any;
    return b.boq as any[];
  })();

  it('resizing a room moves its civil quantities, and a break on the moved wall moves with it', () => {
    // The bedroom's left wall pulled from 6 ft to 7 ft: the bath, whose whole wall it is, grows with it.
    const r = resizeRoom({ rooms, boq: start, bankMap, name: 'Bedroom 2', edge: 'left', to: 7 })!;
    expect(r.changed).toEqual(['Bedroom 2', 'Bath 2']);
    const synced = syncedCivil(r.boq, r.rooms, bankMap);
    expect(synced.find(l => l.civil?.type === 'floor')!.qty).toBe(56);
    const brk = synced.find(l => l.civil?.type === 'break')!;
    expect(brk.civil!.segment).toEqual([7, 2, 7, 6]);
    // Live pricing reads the rooms too, before anything is stored.
    const before = playgroundTotals(start, bankMap, { rules: PLAYGROUND_PRICING, rooms }).sell;
    const after = playgroundTotals(start, bankMap, { rules: PLAYGROUND_PRICING, rooms: r.rooms }).sell;
    expect(after).toBeGreaterThan(before);
    const floor = start.find(l => l.civil?.type === 'floor');
    expect(lineAmount(floor, bankMap, { rules: PLAYGROUND_PRICING, rooms: r.rooms })).toBe(Math.ceil(132 * 1.25 * 56 / 100) * 100);
  });

  it('a new plan moves a break with its room', () => {
    const r = replacePlan({ rooms, boq: start, bankMap, oldSheet: undefined, at: 1, rects: [{ name: 'Bedroom 2', plan: { x: 30, y: 5, w: 12, h: 10 } }] });
    expect(r.boq.find(l => l.civil?.type === 'break')!.civil!.segment).toEqual([30, 7, 30, 11]);
  });

  it('civil lines are the Civil part for offers, whatever their category', () => {
    const tier: any = { boq: start };
    const s = scopeSplit(tier, bankMap);
    expect(s.parts.civil.lines.map(l => l.trade).sort()).toEqual(['Demolition', 'Demolition', 'Flooring']);
    // A floor item filed under Flooring, and the debris under Site services as the studio files it.
    expect(s.parts.others.lines.map(l => l.name)).toEqual(['Debris removal']);
  });

  it('a civil line on its own is still a line: it keeps its qty when its room is gone', () => {
    const l = civilLine('floor', bath, bank[3], () => 'x');
    expect(syncedCivil([l], [], bankMap)[0]).toBe(l);
  });
});
