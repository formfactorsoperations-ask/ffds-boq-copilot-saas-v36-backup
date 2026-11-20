import { describe, it, expect } from 'vitest';
import { changesBetween, changeWhy, scopeChanges, roomDelta, shortInr, PART_LABELS } from '../../lib/playground/changes';
import { versionPlace, nextVersionOf } from '../../lib/playground/versions';
import { PLAYGROUND_PRICING, playgroundTotals } from '../../lib/playground/pricing';

const I = (id: string, name: string, cat: string, unit: string, materials: number, labor: number, margin = 25): any => ({ id, name, cat, unit, materials, labor, margin, specs: '' });
const bank: any[] = [
  I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft', 1500, 400),
  I('tv', 'TV back panelling', 'Carpentry', 'sq ft', 900, 300),
  I('cr', 'Crockery unit', 'Carpentry', 'sq ft', 1250, 400, 28),
  I('bar', 'Bar unit', 'Carpentry', 'sq ft', 1500, 500),
  I('st', 'Study unit with bookshelf', 'Carpentry', 'sq ft', 1300, 400),
  I('hw', 'Hinged wardrobe', 'Carpentry', 'sq ft', 1300, 400),
  I('sofa', 'Three-seater sofa, loose', 'Furniture', 'nos', 55000, 0, 0),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const rooms: any[] = [
  { name: 'Living', size: 182, unit: 'sq ft', plan: { x: 0, y: 0, w: 13, h: 14 } },
  { name: 'Master Bedroom', size: 156, unit: 'sq ft', plan: { x: 0, y: 14, w: 12, h: 13 } },
];
const opts = { base: { rules: PLAYGROUND_PRICING, rooms }, cur: { rules: PLAYGROUND_PRICING, rooms } };
const v1: any[] = [
  { id: 'a', bankId: 'w', qty: 42, roomId: 'Master Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft', place: { x: 1, y: 20, rot: 270 } },
  { id: 'b', bankId: 'tv', qty: 40, roomId: 'Living', baseRate: 900, materialSpecs: { 'Outer finish': { id: 'lam-designer', v: 1 } } },
  { id: 'c', bankId: 'cr', qty: 28, roomId: 'Living' },
  { id: 'd', bankId: 'bar', qty: 18, roomId: 'Living' },
  { id: 'e', bankId: 'w', qty: 30, roomId: 'Living', place: { x: 5, y: 1, rot: 0 } },
  { id: 'f', bankId: 'w', qty: 20, roomId: 'Living', specs: 'Old words' },
  { id: 'g', bankId: 'w', qty: 24, roomId: 'Master Bedroom' },
  { id: 'h', bankId: 'cr', qty: 10, roomId: 'Master Bedroom' },
];
const v2: any[] = [
  { ...v1[0], qty: 56, calcLength: 8 },
  { ...v1[1], baseRate: 1100, materialSpecs: { 'Outer finish': { id: 'veneer-natural', v: 1 } } },
  { ...v1[2], marginOverride: 25 },
  // d: the bar unit is taken out.
  { ...v1[4], place: { x: 7, y: 1, rot: 0 } },
  { ...v1[5], specs: 'New words' },
  { ...v1[6], bankId: 'hw' },
  { ...v1[7], qty: 12, marginOverride: 30 },
  { id: 'n', bankId: 'st', qty: 20, roomId: 'Living' },
];

describe('what changed since the last version', () => {
  const c = changesBetween(v1, v2, bankMap, opts);

  it('tags each line as the mockup does', () => {
    expect(Object.fromEntries([...c.out].map(([id, e]) => [id, e.tag]))).toEqual({
      a: 'SIZE', b: 'RATE', c: 'RATE', e: 'MOVED', f: 'SPEC', g: 'REDESIGNED', h: 'SIZE + RATE', n: 'NEW', d: 'REMOVED',
    });
    expect(c.out.get('d')!.gone).toBe(true);
    // A move is not a scope change.
    expect(scopeChanges(c).map(([id]) => id)).not.toContain('e');
    expect(c.out.get('e')!.d).toBe(0);
  });

  it('the five parts add up exactly to the change in price, on the rounded amounts', () => {
    const t1 = playgroundTotals(v1, bankMap, opts.base).sell, t2 = playgroundTotals(v2, bankMap, opts.cur).sell;
    expect(c.before).toBe(t1);
    expect(c.after).toBe(t2);
    const sum = PART_LABELS.reduce((a, [k]) => a + c.parts[k], 0);
    expect(sum).toBe(t2 - t1);
    expect(c.parts.new).toBe(c.out.get('n')!.d);
    expect(c.parts.removed).toBe(c.out.get('d')!.d);
    expect(c.parts.redesign).toBe(c.out.get('g')!.d);
    // Every amount is a whole ₹100.
    [...c.out.values()].forEach(e => expect(Math.abs(e.d % 100)).toBe(0));
  });

  it('they add up whatever changes, on any BOQ', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let run = 0; run < 40; run++) {
      const base = v1.map(l => ({ ...l, qty: Math.round(rnd() * 600) / 10 }));
      const cur = base.filter(() => rnd() > 0.2).map(l => {
        const x: any = { ...l };
        if (rnd() > 0.5) x.qty = Math.round(rnd() * 600) / 10;
        if (rnd() > 0.6) x.marginOverride = Math.round(rnd() * 40);
        if (rnd() > 0.7) x.baseRate = Math.round(rnd() * 3000);
        if (rnd() > 0.85) x.bankId = 'st';
        if (rnd() > 0.9) x.boqStatus = 'client_procured';
        return x;
      });
      if (rnd() > 0.5) cur.push({ id: `n${run}`, bankId: 'bar', qty: Math.round(rnd() * 300) / 10, roomId: 'Living' });
      const k = changesBetween(base, cur, bankMap, opts);
      const sum = PART_LABELS.reduce((a, [p]) => a + k.parts[p], 0);
      expect(Math.round(sum)).toBe(Math.round(k.after - k.before));
    }
  });

  it('says why each changed', () => {
    const why = (id: string) => changeWhy(c.out.get(id)!, v2.find(l => l.id === id) || c.out.get(id)!.was!, bankMap, { ...opts, materialName: m => ({ 'lam-designer': 'Designer laminate, 1 mm', 'veneer-natural': 'Natural veneer, teak' } as any)[m] });
    expect(why('a')).toBe('6′ × 7′ = 42 sq ft → 8′ × 7′ = 56 sq ft');
    expect(why('b')).toBe('Finish designer laminate → natural veneer · Cost ₹1,200 → ₹1,400');
    expect(why('c')).toBe('Markup 28.0% → 25.0%');
    expect(why('d')).toBe('Taken out');
    expect(why('e')).toBe('Moved, same price');
    expect(why('f')).toBe('Client words changed');
    expect(why('g')).toBe('Was Sliding wardrobe');
    expect(why('h')).toBe('10 sq ft → 12 sq ft · Markup 28.0% → 30.0%');
    expect(why('n')).toBe('Added');
    // The client's copy leaves markup and cost out.
    expect(changeWhy(c.out.get('c')!, v2[2], bankMap, { ...opts, studio: false })).toBe('Rate revised');
  });

  it('a line bought by the client now is out of the price', () => {
    const k = changesBetween(v1, v1.map(l => (l.id === 'c' ? { ...l, boqStatus: 'client_procured' } : l)), bankMap, opts);
    expect(k.out.get('c')!.tag).toBe('REMOVED');
    expect(changeWhy(k.out.get('c')!, { ...v1[2], boqStatus: 'client_procured' }, bankMap, opts)).toBe('Included → Bought by you');
    expect(k.parts.removed).toBe(k.after - k.before);
  });

  it('what each room changed by, a removed line in the room it was in; short tags', () => {
    expect(roomDelta(c, 'Living', v2)).toBe(['b', 'c', 'n', 'd', 'f'].reduce((a, id) => a + (c.out.get(id)?.d || 0), 0));
    expect(shortInr(48720)).toBe('48.7k');
    expect(shortInr(-34500)).toBe('34.5k');
    expect(shortInr(133000)).toBe('1.33L');
    expect(shortInr(500)).toBe('500');
  });
});

describe('versions of an option', () => {
  const t1: any = { id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: v1 };
  const t2: any = { id: 't2', name: 'Comfort Upgrade', timestamp: 2, parentTierId: 't1', boq: v2 };
  const other: any = { id: 'o', name: 'Premium', timestamp: 3, boq: [] };

  it('knows its number, the one before and whether a newer one exists', () => {
    const p2 = versionPlace([t1, t2, other], 't2')!;
    expect([p2.n, p2.previous?.id, p2.latest.id, p2.superseded]).toEqual([2, 't1', 't2', false]);
    const p1 = versionPlace([t1, t2, other], 't1')!;
    expect([p1.n, p1.previous, p1.superseded]).toEqual([1, undefined, true]);
    expect(versionPlace([t1, t2, other], 'o')!.versions.map(v => v.id)).toEqual(['o']);
  });

  it('a new version is a deep copy, a draft linked to the one it came from', () => {
    const n = nextVersionOf({ ...t2, approval: { at: 1, by: 'x' }, lifecycleTag: 'Approved while booking' } as any, 't3', 99);
    expect(n).toMatchObject({ id: 't3', name: 'Comfort Upgrade', parentTierId: 't2', timestamp: 99, lifecycleTag: 'Draft' });
    expect((n as any).approval).toBeUndefined();
    expect(n.boq).toEqual(v2);
    expect(n.boq).not.toBe(v2);
  });
});
