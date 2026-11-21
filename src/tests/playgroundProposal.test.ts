import { describe, it, expect } from 'vitest';
import {
  pageOrder, itemsOf, paginateRooms, separatePage, materialsPage, annexOf, issueProposal, sentProposalTier, allowanceOf, sizeOfLine, exclusionsOf,
} from '../../lib/playground/proposal';
import { PLAYGROUND_PRICING } from '../../lib/playground/pricing';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { splitPricingOf } from '../../lib/offers';
import { proposalValidity } from '../../lib/playground/deal';
import { sentTierIds } from '../../lib/lineSpecs';
import { studioStandard } from '../../lib/materialSpecs';

const I = (id: string, name: string, cat: string, unit: string, materials: number, labor: number, extra: any = {}): any => ({ id, name, cat, unit, materials, labor, margin: 25, specs: `${name} words`, ...extra });
const bank: any[] = [
  I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft', 1500, 400),
  I('tv', 'TV unit', 'Carpentry', 'sq ft', 1400, 400),
  I('paint', 'Wall painting, two coats', 'Painting', 'sq ft', 18, 9),
  I('lights', 'Decorative lights', 'Lighting', 'nos', 3000, 0, { supply: 'actuals' }),
  I('hob', 'Hob', 'Appliances', 'nos', 25000, 0, { supply: 'client' }),
  I('demo', 'Debris removal', 'Civil', 'lumpsum', 8000, 0),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const rooms: any[] = [
  { name: 'Living', size: 182, unit: 'sq ft', plan: { x: 0, y: 0, w: 13, h: 14 }, height: 10 },
  { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 13, y: 0, w: 12, h: 10 }, height: 10 },
];
const boq: any[] = [
  { id: 'a', bankId: 'w', qty: 41.3, roomId: 'Bedroom', calcLength: 5.9, calcWidth: 7, sizeUnit: 'ft', place: { x: 14, y: 1, rot: 0 } },
  { id: 'b', bankId: 'tv', qty: 7.88, roomId: 'Living', calcLength: 3.5, calcWidth: 2.25, sizeUnit: 'ft' },
  { id: 'p', bankId: 'paint', qty: 0, roomId: 'Whole flat', byRoom: { basis: 'wallPaint', rooms: {}, client: 'rooms' } },
  { id: 'l', bankId: 'lights', qty: 4, roomId: 'Living', boqStatus: 'as_actuals' },
  { id: 'h', bankId: 'hob', qty: 1, roomId: 'Living', boqStatus: 'client_procured' },
  { id: 'd', bankId: 'demo', qty: 1, roomId: 'Whole flat' },
];
const tier: any = { id: 't1', name: 'Comfort Upgrade', boq, boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING };
const ctx: any = { name: 'Palacia', rooms, designFeeType: 'percentage', designFee: 10 };
const pricing = splitPricingOf(tier, rooms, bankMap);

describe('the page order', () => {
  it('follows the main concern, Annexure A then the studio last, the summary only with other decision makers', () => {
    expect(pageOrder('Itemized Costs', false)).toEqual(['cover', 'brief', 'how', 'home', 'items', 'sep', 'mat', 'inv', 'next', 'annex', 'studio']);
    expect(pageOrder('Overall Budget', false).slice(0, 3)).toEqual(['cover', 'brief', 'inv']);
    expect(pageOrder('Trust', false).slice(0, 2)).toEqual(['cover', 'how']);
    const d = pageOrder('Design Details', false);
    expect(d.indexOf('mat')).toBeLessThan(d.indexOf('items'));
    expect(pageOrder('Timeline', true)[1]).toBe('sum');
    for (const c of ['Itemized Costs', 'Overall Budget', 'Trust', 'Design Details', 'Timeline', null]) expect(pageOrder(c, true).slice(-2)).toEqual(['annex', 'studio']);
  });
});

describe('room by room', () => {
  it('every item of the option, each amount as Money reads it, adding up to the work', () => {
    const it0 = itemsOf({ boq, bankMap, pricing, rooms, free: new Set(['b']) });
    expect(it0.work).toBe(playgroundTierSummary(tier, bankMap, ctx).totalSell);
    expect(it0.rooms.map(r => r.name)).toEqual(['Living', 'Bedroom']);
    const living = it0.rooms[0];
    // The painting is shared into each room, measured from it; items at actuals and bought by the client are left out.
    expect(living.rows.map(r => r.name)).toEqual(['TV unit', 'Wall painting, two coats']);
    expect(living.rows[1].sub).toMatch(/measured from the room/);
    // The size is shown with the quantity, width × height; the materials under the name.
    expect(living.rows[0]).toMatchObject({ free: true, size: '3.5 ft × 2.25 ft', sub: 'TV unit words' });
    expect(living.rows[1].size).toBeUndefined();
    it0.rooms.flatMap(r => r.rows).forEach(r => expect(r.amount % 100).toBe(0));
    expect(it0.flat!.rows.map(r => r.name)).toEqual(['Debris removal']);
    expect(it0.rooms.reduce((a, r) => a + r.total, 0) + it0.flat!.total).toBe(it0.work);
  });

  it('a drawn piece is allowed for at its drawn size', () => {
    // In plain feet: "5.9 ft", a second decimal only where the size has one.
    expect(allowanceOf(boq[0], bankMap)).toBe('up to 5.9 ft × 7 ft');
    expect(sizeOfLine(boq[0], bankMap)).toBe('5.9 ft × 7 ft');
    expect(sizeOfLine({ id: 'r', bankId: 'w', qty: 12, unit: 'r ft', calcLength: 8.25, sizeUnit: 'ft' } as any, new Map([['w', { ...bankMap.get('w'), unit: 'r ft' }]]))).toBe('8.25 ft long');
    expect(allowanceOf({ id: 'x', bankId: 'w', qty: 5 } as any, bankMap)).toBe('');
  });

  it('pages keep a room whole and start a new page when one would not fit', () => {
    const room = (name: string, n: number) => ({ name, size: '', total: 0, rows: Array.from({ length: n }, (_, i) => ({ id: `${name}${i}`, name: 'x', sub: '', qty: 1, unit: 'nos', rate: 1, amount: 1 })) });
    const pages = paginateRooms([room('A', 10), room('B', 10), room('C', 10), room('D', 30)]);
    // 372 px a room: two do not fit the first page's 700, two fit the next 800; a 972 px room has a page of its own.
    expect(pages.map(p => p.map(r => r.name))).toEqual([['A'], ['B', 'C'], ['D']]);
  });

  it('the separate page lists items at actuals and bought by the client, and is left out without them', () => {
    const s = separatePage(boq, bankMap)!;
    expect(s.actuals.map(r => r.name)).toEqual(['Decorative lights']);
    expect(s.client.map(r => r.name)).toEqual(['Hob']);
    expect(separatePage(boq.filter(l => !l.boqStatus), bankMap)).toBeNull();
  });
});

describe('three ways to finish it', () => {
  it('each option’s grade picks its materials, part by part, with the ranges', () => {
    const bankS = studioStandard();
    const opts = [{ id: 'e', name: 'Essential Elegance' }, { id: 't1', name: 'Comfort Upgrade' }, { id: 'p', name: 'Complete Harmony' }];
    const m = materialsPage(bankS, opts, 't1')!;
    expect(m.options.map(o => [o.grade, o.recommended])).toEqual([['E', false], ['C', true], ['P', false]]);
    expect(m.rows.length).toBeGreaterThan(5);
    const outer = m.rows.find(r => /outer/i.test(r.part))!;
    expect(new Set(outer.cells.map(c => c?.words)).size).toBe(3);
    expect(m.ranges.length).toBeGreaterThan(0);
    expect(materialsPage(null, opts, 't1')).toBeNull();
  });
});

describe('Annexure A', () => {
  const issued = new Date(2026, 10, 20);
  const a = annexOf({ terms: null, studioName: 'Form Factors', gstRate: 18, after: 500000, fee: 50000, gst: 99000, total: 649000, initiationFee: 4999, boq, bankMap, validDays: 15, issued });
  it('twelve clauses, the figures from the deal, the validity with its dates', () => {
    expect(a.map(s => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(a[1].table).toEqual([['The work, after offers', 500000], ['Design fee', 50000], ['GST at 18%', 99000], ['Total', 649000]]);
    const v = a[10].items!.find(x => /valid for 15 days/.test(x))!;
    expect(v).toMatch(/20 November 2026, until 5 December 2026/);
    expect(v).toMatch(/offers in it lapse/);
    expect(JSON.stringify(a)).not.toMatch(/✕|\{\{/);
    // Items at actuals or bought by the client are named in the scope.
    expect(a[5].items!.some(x => /Bought by you, and at actuals/.test(x))).toBe(true);
  });
  it('the exclusions and assumptions follow the BOQ', () => {
    expect(exclusionsOf(boq, bankMap)).toContain('Flooring, tiling and stone work');
    const args = { terms: null, studioName: 'F', gstRate: 18, after: 1, fee: 1, gst: 1, total: 3, initiationFee: 0, bankMap, validDays: 15, issued };
    const interiors = annexOf({ ...args, boq: boq.filter(l => l.id !== 'd') });
    const civil = annexOf({ ...args, boq: [...boq.filter(l => l.id !== 'd'), { id: 'c', bankId: 'demo', qty: 1, roomId: 'Living', civil: { type: 'break' } }] });
    expect(civil[8].pair!.a[1]).not.toEqual(interiors[8].pair!.a[1]);
  });
});

describe('sending it', () => {
  it('records the issue on the version, holds it for its days, and keeps each send', () => {
    const at = Date.UTC(2026, 10, 20, 6);
    let c = issueProposal(ctx, { tierId: 't1', at, via: 'whatsapp', days: 15, shapedFor: 'Trust', by: 'Anish' });
    expect(c.proposal).toMatchObject({ issuedAt: at, validDays: 15, validUntil: at + 15 * 864e5, tierId: 't1', shapedFor: 'Trust', priceDetail: 'lines' });
    expect(sentProposalTier(c)).toBe('t1');
    expect(sentTierIds(c).has('t1')).toBe(true);
    expect(proposalValidity(c, null, at, 't1').issued).toBe(true);
    // A newer version is a draft until it is sent in its turn.
    expect(proposalValidity(c, null, at, 't2').issued).toBe(false);
    c = issueProposal(c, { tierId: 't2', at: at + 864e5, via: 'whatsapp', days: 21 });
    expect(c.proposal).toMatchObject({ tierId: 't2', validDays: 21 });
    expect((c.proposal as any).sends).toHaveLength(2);
  });
});
