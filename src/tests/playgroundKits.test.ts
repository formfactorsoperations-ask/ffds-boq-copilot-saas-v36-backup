import { describe, it, expect } from 'vitest';
import {
  kitFromBundle, kitsOf, kitKind, fitOf, kitRows, rowOn, kitApply, kitStartRooms, kitCandidates, kitHasCivil, roomAsKit, kitAddsDebris, kitItemNames,
} from '../../lib/playground/kits';
import { ADDON_BUNDLES } from '../../lib/standardPackages';
import { INITIAL_BANK } from '../../constants';
import { boxOf } from '../../lib/playground/placing';
import { drawOf, footprintOf, pieceSize } from '../../lib/playground/pieces';

const I = (id: string, name: string, cat: string, unit: string, materials: number, labor: number, margin = 25): any => ({ id, name, cat, unit, materials, labor, margin, specs: '' });
/* The mockup's bank, near enough. */
const bank: any[] = [
  I('b52', 'Remove existing floor tiles', 'Civil', 'sq ft', 10, 8),
  I('b53', 'Floor tiles, laid', 'Flooring', 'sq ft', 90, 42),
  I('b54', 'Wall tiles to 7 ft, laid', 'Tiling', 'sq ft', 80, 40),
  I('b55', 'Waterproofing, floor and upstand', 'Civil', 'sq ft', 30, 22),
  I('b56', 'Debris removal', 'Civil', 'lot', 9000, 5400),
  I('b42', 'Plumbing points, bathroom', 'Plumbing', 'nos', 1500, 900),
  I('b25', 'Vanity unit with mirror', 'Carpentry', 'nos', 14000, 4000),
  I('b27', 'Shower glass partition', 'Glass', 'nos', 18000, 3000),
  I('b15', 'Sliding wardrobe', 'Carpentry', 'sq ft', 1500, 400),
  I('b16', 'Study table with shelf', 'Carpentry', 'sq ft', 1100, 400),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
/* Two bathrooms of different sizes, a bedroom, a living room with no plan. */
const rooms: any[] = [
  { name: 'Master Bathroom', size: 28, unit: 'sq ft', plan: { x: 0, y: 0, w: 4, h: 7 } },
  { name: 'Common Bath', size: 31.5, unit: 'sq ft', plan: { x: 4, y: 0, w: 4.5, h: 7 } },
  { name: 'Bedroom 2', size: 130, unit: 'sq ft', plan: { x: 8.5, y: 0, w: 10, h: 13 } },
  { name: 'Living', size: 200, unit: 'sq ft' },
];
const bathKit = kitFromBundle({
  id: 'k-bath', name: 'Bathroom renovation (full)', kinds: ['toilet'], itemIds: [],
  items: [
    { itemId: 'b52', fit: 'floorRemove' }, { itemId: 'b55', fit: 'waterproof' }, { itemId: 'b53', fit: 'floor' }, { itemId: 'b54', fit: 'walls7' },
    { itemId: 'b42', fit: 'fixed', qty: 4 }, { itemId: 'b25', fit: 'piece' }, { itemId: 'b27', fit: 'piece' }, { itemId: 'b56', fit: 'fixed' },
  ],
}, 'Add-on bundles');
let n = 0;
const newId = () => `k${++n}`;

describe('kits from the Item Bank’s bundles', () => {
  it('a bundle saved before kits reads its items by whether they draw; an older `items` shape is passed over', () => {
    const old = kitFromBundle({ id: 'c1', name: 'Bedroom set', itemIds: ['b15', 'b16', 'b42'], items: [{ id: 'b15', name: 'Sliding wardrobe' }] }, 'Room Bundles & Kits');
    expect(old.items).toEqual([{ itemId: 'b15' }, { itemId: 'b16' }, { itemId: 'b42' }]);
    expect(old.kinds).toEqual([]);
    expect(old.items.map(k => fitOf(k, bankMap.get(k.itemId)))).toEqual(['piece', 'piece', 'fixed']);
    // Edited in the Item Bank since it was saved: an item taken out is out, one put in comes in.
    const edited = kitFromBundle({ id: 'c2', name: 'x', itemIds: ['b15', 'b42'], items: [{ itemId: 'b15', fit: 'piece' }, { itemId: 'b16', fit: 'piece' }] }, 'Room Bundles & Kits');
    expect(edited.items).toEqual([{ itemId: 'b15', fit: 'piece' }, { itemId: 'b42' }]);
    // A piece that does not draw is fixed.
    expect(fitOf({ fit: 'piece' }, bankMap.get('b42'))).toBe('fixed');
  });

  it('the standard add-on bundles are kits too, for their rooms; the studio’s own come first', () => {
    const kits = kitsOf([{ id: 'c1', name: 'Mine', itemIds: ['b15'] }], ADDON_BUNDLES as any);
    expect(kits.map(k => [k.name, k.source, k.kinds])).toEqual([
      ['Mine', 'Room Bundles & Kits', []],
      ['Bathroom Renovation (Full)', 'Add-on bundles', ['toilet']],
      ['Kitchen Essentials', 'Add-on bundles', ['kitchen']],
      ['Electrical Rewiring', 'Add-on bundles', []],
    ]);
    // Every add-on item is in the default bank, and each says how it is sized.
    const def = new Map((INITIAL_BANK as any[]).map(b => [b.id, b]));
    ADDON_BUNDLES.forEach(b => { expect((b as any).items.map((k: any) => k.itemId)).toEqual(b.itemIds); (b as any).items.forEach((k: any) => expect(def.has(k.itemId)).toBe(true)); });
    expect(kitHasCivil(kits[1], def as any)).toBe(true);
    expect(kitHasCivil(kits[2], def as any)).toBe(true);
    expect(kitHasCivil(kits[3], def as any)).toBe(false);
    expect(kitItemNames(kits[0], bankMap)).toEqual(['Sliding wardrobe']);
    expect([kitKind(kits[0], bankMap), ...kits.slice(1).map(k => kitKind(k, def as any))]).toEqual(['carpentry', 'civil and fittings', 'civil and fittings', 'services']);
    // Given the bank, items it lacks are left out, and a kit with none is not offered.
    expect(kitsOf([{ id: 'c1', name: 'Mine', itemIds: ['b15', 'gone'] }, { id: 'c2', name: 'Gone', itemIds: ['gone'] }], [], bankMap).map(k => [k.name, k.items])).toEqual([['Mine', [{ itemId: 'b15' }]]]);
  });

  it('opens on the room it was dropped on, else on up to two rooms of its kinds', () => {
    expect(kitStartRooms(bathKit, rooms)).toEqual(['Master Bathroom', 'Common Bath']);
    expect(kitStartRooms(bathKit, rooms, 'Common Bath')).toEqual(['Common Bath']);
    const any = kitFromBundle({ id: 'x', name: 'x', itemIds: ['b15'] }, 'Room Bundles & Kits');
    expect(kitStartRooms(any, rooms)).toEqual([]);
    expect(kitCandidates(bathKit, rooms, ['Bedroom 2']).map(r => r.name)).toEqual(['Master Bathroom', 'Common Bath', 'Bedroom 2']);
    expect(kitCandidates(any, rooms, []).map(r => r.name)).toEqual(['Master Bathroom', 'Common Bath', 'Bedroom 2', 'Living']);
  });
});

describe('a kit sized from the room it lands in', () => {
  it('each line is sized from its own room: civil from the floor and walls, pieces at their size, fixed as the kit says', () => {
    const a = kitRows(bathKit, rooms[0], { boq: [], bankMap, newId });
    const b = kitRows(bathKit, rooms[1], { boq: [], bankMap, newId });
    // Debris is not a room's line.
    expect(a.rows.map(r => r.item.id)).toEqual(['b52', 'b55', 'b53', 'b54', 'b42', 'b25', 'b27']);
    expect(a.rows.map(r => [r.fit, r.qty])).toEqual([['floorRemove', 28], ['waterproof', 28 + 22], ['floor', 28], ['walls7', 22 * 7 - 21], ['fixed', 4], ['piece', 1], ['piece', 1]]);
    expect(b.rows.map(r => r.qty).slice(0, 4)).toEqual([32, 55, 32, 23 * 7 - 21]);
    expect(a.rows.map(r => r.why)).toEqual([
      '4′ × 7′ floor', 'the floor and a 1′ upstand on 22′ of wall', '4′ × 7′ floor', '22′ of wall × 7′, less 1 door', 'As in the Item Bank',
      'Placed on a free wall, 2′6″ wide', 'Placed on a free wall, 3′ wide',
    ]);
    expect(a.rows.every(r => rowOn(r, {}))).toBe(true);
    expect(a.missing).toEqual([]);
  });

  it('a line already in the room is unticked and says so; a tick overrides it', () => {
    const boq: any[] = [
      { id: 'v', bankId: 'b25', qty: 1, roomId: 'Master Bathroom' },
      { id: 'f', bankId: 'b53', qty: 28, roomId: 'Master Bathroom', civil: { type: 'floor' } },
      // The same item elsewhere is no duplicate; a deleted one is gone.
      { id: 'w', bankId: 'b54', qty: 10, roomId: 'Common Bath', civil: { type: 'walls7' } },
      { id: 'g', bankId: 'b27', qty: 1, roomId: 'Master Bathroom', boqStatus: 'deleted' },
    ];
    const { rows } = kitRows(bathKit, rooms[0], { boq, bankMap, newId });
    const dups = rows.filter(r => r.dup);
    expect(dups.map(r => r.item.id)).toEqual(['b53', 'b25']);
    expect(dups.every(r => r.why === 'Already in this room' && !rowOn(r, {}))).toBe(true);
    expect(rowOn(dups[1], { [dups[1].key]: false })).toBe(true);
    expect(rowOn(rows[0], { [rows[0].key]: true })).toBe(false);
  });

  it('fixed lines without a quantity take the Item Bank’s rule for the room; a count stays 1; an item gone from the bank is named', () => {
    const k = kitFromBundle({ id: 'f', name: 'f', itemIds: [], items: [{ itemId: 'gen-061', fit: 'fixed' }, { itemId: 'gen-063', fit: 'fixed' }, { itemId: 'gone', fit: 'fixed' }] }, 'Add-on bundles');
    const def = new Map((INITIAL_BANK as any[]).map(b => [b.id, b]));
    const { rows, missing } = kitRows(k, rooms[2], { boq: [], bankMap: def as any, newId });
    expect(rows.map(r => [r.qty, r.why])).toEqual([[149.5, 'From the room’s 130 sq ft'], [1, 'As in the Item Bank']]);
    expect(missing).toEqual(['gone']);
  });
});

describe('applying a kit', () => {
  it('a full bathroom renovation goes into both bathrooms in one step, each measured, debris once', () => {
    let k = 0;
    const r = kitApply({ kit: bathKit, rooms, picked: ['Master Bathroom', 'Common Bath'], off: {}, boq: [], bank, bankMap, newId: () => `a${++k}`, prepare: l => ({ ...l, specs: 'words' }) });
    if (!r) throw new Error('nothing added');
    const by = (room: string) => r.added.filter(l => l.roomId === room);
    expect(by('Master Bathroom').map(l => [l.bankId, l.qty])).toEqual([['b52', 28], ['b55', 50], ['b53', 28], ['b54', 133], ['b42', 4], ['b25', 1], ['b27', 1]]);
    expect(by('Common Bath').map(l => [l.bankId, l.qty])).toEqual([['b52', 32], ['b55', 55], ['b53', 32], ['b54', 140], ['b42', 4], ['b25', 1], ['b27', 1]]);
    expect(r.added.filter(l => l.bankId === 'b56')).toEqual([expect.objectContaining({ roomId: 'Whole flat', qty: 1 })]);
    expect(r.added.filter(l => l.roomId !== 'Whole flat').every(l => l.specs === 'words')).toBe(true);
    expect(r.message).toBe('Bathroom renovation (full): 14 lines in Master Bathroom and Common Bath, sized from each room. Debris removal added once, across the flat.');
    // Pieces are placed inside their room and not on each other.
    const placed = r.added.filter(l => l.place);
    expect(placed).toHaveLength(4);
    placed.forEach(l => {
      const room = rooms.find(x => x.name === l.roomId).plan;
      const it = bankMap.get(l.bankId);
      const box = boxOf({ fp: footprintOf(pieceSize(l, it, drawOf(it)!)), place: l.place! });
      expect(box.x >= room.x - 0.01 && box.y >= room.y - 0.01 && box.x + box.w <= room.x + room.w + 0.01 && box.y + box.h <= room.y + room.h + 0.01).toBe(true);
    });
    expect(r.waiting).toBe(0);
    // Again: what is there is unticked, so nothing more comes in.
    expect(kitApply({ kit: bathKit, rooms, picked: ['Master Bathroom', 'Common Bath'], off: {}, boq: r.boq, bank, bankMap, newId })).toBeNull();
    expect(kitAddsDebris(bathKit, r.boq, bank, bankMap)).toBe(false);
  });

  it('only what is ticked comes in; a piece with no room on the plan waits for a place', () => {
    const bed = kitFromBundle({ id: 'b', name: 'Bedroom, standard', kinds: ['bedroom'], itemIds: ['b15', 'b16'] }, 'Room Bundles & Kits');
    const { rows } = kitRows(bed, rooms[3], { boq: [], bankMap, newId });
    const r = kitApply({ kit: bed, rooms, picked: ['Living'], off: { [rows[1].key]: true }, boq: [], bank, bankMap, newId });
    expect(r!.added.map(l => [l.bankId, !!l.place])).toEqual([['b15', false]]);
    expect(r!.waiting).toBe(1);
    expect(r!.message).toBe('Bedroom, standard: 1 line in Living, sized from the room.');
  });
});

describe('a room saved as a kit', () => {
  it('each line keeps how it is sized; lines of the room’s own and walls drawn where they are stay behind', () => {
    const boq: any[] = [
      { id: '1', bankId: 'b25', qty: 1, roomId: 'Master Bathroom', place: { x: 1, y: 1, rot: 0 } },
      { id: '2', bankId: 'b53', qty: 28, roomId: 'Master Bathroom', civil: { type: 'floor' } },
      { id: '3', bankId: 'b42', qty: 3, roomId: 'Master Bathroom' },
      { id: '4', bankId: 'custom', name: 'Client’s own mirror', qty: 1, roomId: 'Master Bathroom' },
      { id: '5', bankId: 'b52', qty: 4, roomId: 'Master Bathroom', civil: { type: 'break', segment: [0, 1, 0, 3] } },
      { id: '6', bankId: 'b56', qty: 1, roomId: 'Whole flat' },
      { id: '7', bankId: 'b15', qty: 42, roomId: 'Bedroom 2' },
    ];
    const s = roomAsKit({ room: rooms[0], boq, bankMap, project: 'Palacia – 3BHK (Template)', existing: [{ name: 'Master Bathroom, Palacia' }], id: 'kit-1' });
    expect(s!.bundle).toEqual({
      id: 'kit-1', name: 'Master Bathroom, Palacia (2)',
      description: 'Saved from Master Bathroom in Palacia: each item with how it is sized in the room it lands in.',
      itemIds: ['b25', 'b53', 'b42'],
      items: [{ itemId: 'b25', fit: 'piece' }, { itemId: 'b53', fit: 'floor' }, { itemId: 'b42', fit: 'fixed', qty: 3 }],
      kinds: ['toilet'],
    });
    expect(s!.skipped).toBe(2);
    // It reads back as the same kit.
    const back = kitFromBundle(s!.bundle, 'Room Bundles & Kits');
    expect(back.items).toEqual(s!.bundle.items);
    expect(roomAsKit({ room: rooms[3], boq, bankMap, id: 'x' })).toBeNull();
  });
});
