import { describe, it, expect } from 'vitest';
import {
  scopeSplit, splitPricingOf, offerDiscount, offerValue, offerName, offerWhy, staleOffer, dealFor, specialAmount, complimentaryKeys,
  type OfferDiscount,
} from '../../lib/offers';
import { proposalValidity, withValidDays, followBoq, withComplimentary, withSpecial, clampDays, withDiscounts, withInitiationFee, bookingOf, withBooking } from '../../lib/playground/deal';
import { PLAYGROUND_PRICING, playgroundTotals, measureOfBoq, docPricingOf } from '../../lib/playground/pricing';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { scheduleFor, gstTermsOf } from '../../lib/paymentSchedule';
import { buildDetailedBoqSnapshot } from '../../lib/detailedBoq';
import { realRooms } from '../../lib/scopeBuckets';

const I = (id: string, name: string, cat: string, unit: string, materials: number, labor: number, margin = 25): any => ({ id, name, cat, unit, materials, labor, margin, specs: `${name} words` });
const bank: any[] = [
  I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft', 1500, 400),
  I('tv', 'TV unit', 'Carpentry', 'sq ft', 1400, 400),
  I('paint', 'Wall painting, two coats', 'Painting', 'sq ft', 18, 9),
  I('tile', 'Floor tiles, laid', 'Flooring', 'sq ft', 90, 40),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const rooms: any[] = [
  { name: 'Living', size: 182, unit: 'sq ft', plan: { x: 0, y: 0, w: 13, h: 14 }, height: 10 },
  { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 13, y: 0, w: 12, h: 10 }, height: 10 },
  /* A scope bucket is not a room: it never takes a share. */
  { name: 'Civil', size: 302, unit: 'sq ft' },
];
const boq: any[] = [
  /* A wardrobe drawn against the bedroom's wall: the painting behind it is left out. */
  { id: 'a', bankId: 'w', qty: 41.3, roomId: 'Bedroom', calcLength: 5.9, calcWidth: 7, sizeUnit: 'ft', place: { x: 14, y: 1, rot: 0 } },
  { id: 'b', bankId: 'tv', qty: 7.88, roomId: 'Living' },
  { id: 'c', bankId: 'tile', qty: 120, roomId: 'Bedroom' },
  { id: 'p', bankId: 'paint', qty: 0, roomId: 'Whole flat', byRoom: { basis: 'wallPaint', rooms: {}, client: 'rooms' } },
];
const tier: any = { id: 't1', name: 'Comfort Upgrade', boq, boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING, summary: {} };
const ctx0: any = { name: 'Palacia – 3BHK', rooms, designFeeType: 'percentage', designFee: 10, gstRate: 18, financials: { discounts: [] } };
const summaryOf = (t = tier, c = ctx0) => playgroundTierSummary(t, bankMap, c);
const terms = gstTermsOf(ctx0);
const split = () => scopeSplit(tier, bankMap, splitPricingOf(tier, ctx0.rooms, bankMap));
let n = 0;
const newId = () => `o${++n}`;

describe('one price for a Playground option, wherever it is read', () => {
  it('Money’s summary, the offers’ split and the documents price as the Playground screen does', () => {
    const screen = playgroundTotals(boq, bankMap, { rules: PLAYGROUND_PRICING, rooms: realRooms(rooms), measure: measureOfBoq(boq, bankMap) });
    // The wardrobe hides wall: the painting is less than with nothing drawn.
    const bare = playgroundTotals(boq, bankMap, { rules: PLAYGROUND_PRICING, rooms: realRooms(rooms) });
    expect(screen.sell).toBeLessThan(bare.sell);
    expect(summaryOf().totalSell).toBe(screen.sell);
    expect(split().total).toBe(screen.sell);
    const doc = buildDetailedBoqSnapshot({ context: ctx0, tier, bankMap, version: 1, reference: 'X', approval: { mode: 'portal' } as any });
    expect(doc.total).toBe(screen.sell);
    expect(docPricingOf(tier, rooms, bankMap)!.rooms!.map(r => r.name)).toEqual(['Living', 'Bedroom']);
  });

  it('splits the work by room, a whole-flat line’s shares in their rooms, adding up to the work', () => {
    const s = split();
    expect(Object.keys(s.byRoom).sort()).toEqual(['Bedroom', 'Living']);
    expect(Object.values(s.byRoom).reduce((a, b) => a + b, 0)).toBe(s.total);
    Object.values(s.byRoom).forEach(v => expect(v % 100).toBe(0));
  });
});

describe('offers on the Deal lens', () => {
  it('an offer off one room is that room’s share of the work, named for the room', () => {
    const s = split();
    const basis = { kind: 'room-percent' as const, room: 'Bedroom', percent: 10, tierId: 't1' };
    expect(offerValue(basis, s)).toBe(Math.round(s.byRoom.Bedroom * 0.1));
    expect(offerName(basis)).toBe('10% off the Bedroom');
    expect(offerWhy(basis, s)).toBe(`10% of the room’s ₹${s.byRoom.Bedroom.toLocaleString('en-IN')}`);
  });

  it('a special price lands on its target, with every kind of GST', () => {
    const s = split();
    const part = offerDiscount('x', { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 't1' }, s);
    for (const c of [ctx0, { ...ctx0, financials: { billablePercent: 40 } }, { ...ctx0, financials: { executionGstEnabled: false } }]) {
      const t = gstTermsOf(c);
      const before = dealFor(summaryOf(tier, c), [part], t).clientPays;
      const target = Math.floor(before / 50000) * 50000;
      const next = withSpecial([part], 't1', target, s, { summary: summaryOf(tier, c), terms: t }, newId)!;
      expect(next).toHaveLength(2);
      expect(next[1]).toMatchObject({ name: 'Special price', type: 'fixed', target: 'execution', basis: { kind: 'special', target } });
      expect(Math.round(dealFor(summaryOf(tier, c), next, t).clientPays)).toBe(target);
      // The schedule Money bills adds up to the same figure.
      const sch = scheduleFor({ ...c, financials: { ...(c.financials || {}), discounts: next } }, { tierSummary: summaryOf(tier, c) });
      expect(Math.abs(sch.total - target)).toBeLessThanOrEqual(1);
    }
  });

  it('a special price replaces the one before it, and is refused at or above what the client pays', () => {
    const s = split();
    const pays = dealFor(summaryOf(), [], terms).clientPays;
    expect(specialAmount(pays + 10, { summary: summaryOf(), others: [], terms })).toBeNull();
    expect(withSpecial([], 't1', pays, s, { summary: summaryOf(), terms }, newId)).toBeNull();
    const one = withSpecial([], 't1', pays - 5000, s, { summary: summaryOf(), terms }, newId)!;
    const two = withSpecial(one, 't1', pays - 9000, s, { summary: summaryOf(), terms }, newId)!;
    expect(two).toHaveLength(1);
    expect(Math.round(dealFor(summaryOf(), two, terms).clientPays)).toBe(Math.round(pays - 9000));
  });

  it('complimentary lines are one offer per option, found in whatever part they are in', () => {
    const s = split();
    let d: OfferDiscount[] = [];
    d = withComplimentary(d, 't1', { key: 'b', name: 'TV unit' }, true, s, 'carpentry', newId);
    d = withComplimentary(d, 't1', { key: 'c', name: 'Floor tiles, laid' }, true, s, 'carpentry', newId);
    expect(d).toHaveLength(1);
    const tv = s.parts.carpentry.lines.find(l => l.key === 'b')!.total;
    const tiles = s.parts.civil.lines.find(l => l.key === 'c')!.total;
    expect(d[0].value).toBe(tv + tiles);
    expect(d[0].name).toBe('Complimentary: TV unit, Floor tiles, laid');
    expect([...complimentaryKeys(d)]).toEqual(['b', 'c']);
    d = withComplimentary(d, 't1', { key: 'b', name: 'TV unit' }, false, s, 'carpentry', newId);
    d = withComplimentary(d, 't1', { key: 'c', name: 'Floor tiles, laid' }, false, s, 'carpentry', newId);
    expect(d).toEqual([]);
  });

  it('follows the BOQ: a changed line re-prices its offers, and the special price still meets its target', () => {
    const s = split();
    const part = offerDiscount('x', { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 't1' }, s);
    const room = offerDiscount('y', { kind: 'room-percent', room: 'Living', percent: 10, tierId: 't1' }, s);
    const hand = { id: 'h', name: 'Goodwill', type: 'fixed' as const, value: 5000, target: 'execution' as const };
    const target = Math.floor(dealFor(summaryOf(), [part, room, hand], terms).clientPays / 10000) * 10000;
    const d = withSpecial([part, room, hand], 't1', target, s, { summary: summaryOf(), terms }, newId)!;
    expect(followBoq(d, 't1', s, { summary: summaryOf(), terms })).toBeNull();

    const grown: any = { ...tier, boq: boq.map(l => (l.id === 'b' ? { ...l, qty: 20 } : l)) };
    const s2 = scopeSplit(grown, bankMap, splitPricingOf(grown, rooms, bankMap));
    const sum2 = summaryOf(grown);
    const next = followBoq(d, 't1', s2, { summary: sum2, terms })!;
    expect(next.find(x => x.id === 'x')!.value).toBe(offerValue(part.basis!, s2));
    expect(next.find(x => x.id === 'y')!.value).toBe(offerValue(room.basis!, s2));
    expect(next.find(x => x.id === 'h')).toBe(hand);
    expect(Math.round(dealFor(sum2, next, terms).clientPays)).toBe(target);
    // Money reads the special price as current once it is.
    const sp = next.find(x => x.basis?.kind === 'special')!;
    expect(staleOffer(sp, 't1', s2, undefined, { summary: sum2, others: next, terms })).toBeNull();
  });
});

describe('how long the proposal holds', () => {
  const now = Date.UTC(2026, 10, 19, 6);
  it('the studio’s days from Terms & Payment until the project has its own', () => {
    const v = proposalValidity(ctx0, { proposalValidityDays: 21 }, now);
    expect(v).toMatchObject({ days: 21, studioDays: 21, issued: false, expired: false });
    expect(v.until.getTime() - now).toBe(21 * 864e5);
    expect(proposalValidity(ctx0, null, now).days).toBe(15);
    const own = withValidDays(ctx0, 30);
    expect(own.proposal).toEqual({ validDays: 30 });
    expect(proposalValidity(own, { proposalValidityDays: 21 }, now).days).toBe(30);
    expect(clampDays(0)).toBe(1);
    expect(clampDays(400)).toBe(90);
  });

  it('once issued it runs from the issue date, and expires after it', () => {
    const issuedAt = Date.UTC(2026, 10, 1);
    const ctx = { ...ctx0, proposal: { issuedAt, validDays: 15, validUntil: issuedAt + 15 * 864e5 } };
    const v = proposalValidity(ctx, null, now);
    expect(v.issued).toBe(true);
    expect(v.expired).toBe(true);
    expect(v.until.getTime()).toBe(issuedAt + 15 * 864e5);
    expect(proposalValidity(ctx, null, issuedAt + 864e5).expired).toBe(false);
  });
});

describe('writing the offers', () => {
  it('the first offer on a project with no financials record keeps the GST it was billed with', () => {
    const bare: any = { name: 'x', rooms };
    const before = gstTermsOf(bare);
    expect(before.executionGst).toBe(true);
    expect(gstTermsOf(withDiscounts(bare, [])).executionGst).toBe(true);
    expect(gstTermsOf(withInitiationFee(bare, 4999))).toEqual(before);
    // A project that chose no GST on the work keeps that.
    const off: any = { ...bare, financials: { executionGstEnabled: false, billablePercent: 30 } };
    expect(withDiscounts(off, []).financials).toEqual({ executionGstEnabled: false, billablePercent: 30, discounts: [] });
  });
});

describe('how the client books (Ops decides it on the proposal)', () => {
  const sched = (d1: number, paid = 0) => ({ design: { stages: [{ code: 'D1', trigger: 'On signing', amount: d1 }] }, initiationFee: paid });

  it('D1 directly, as before: D1 less any initiation fee already paid', () => {
    expect(bookingOf(undefined, sched(29500))).toMatchObject({ by: 'd1', amount: 29500, initiation: false });
    expect(bookingOf({ booking: { by: 'd1' } }, sched(29500, 4999))).toMatchObject({ by: 'd1', amount: 24501, initiation: true });
  });

  it('the initiation fee: ₹4,999 unless Ops sets another, adjusted against D1, the rest due with D1', () => {
    expect(bookingOf({ booking: { by: 'initiation' } }, sched(29500))).toMatchObject({ by: 'initiation', amount: 4999, fee: 4999, balance: 24501, trigger: 'On signing', initiation: true });
    expect(bookingOf({ booking: { by: 'initiation', fee: 10000 } }, sched(29500))).toMatchObject({ amount: 10000, balance: 19500 });
    // Already paid: nothing more to book with; the fee paid is what was asked.
    expect(bookingOf({ booking: { by: 'initiation' } }, sched(29500, 4999))).toMatchObject({ amount: 0, fee: 4999, balance: 24501 });
    // A fee over D1 covers it.
    expect(bookingOf({ booking: { by: 'initiation' } }, sched(3000))).toMatchObject({ amount: 4999, balance: 0 });
  });

  it('is saved on the proposal; switching back to the fee keeps the amount Ops set', () => {
    const c0: any = { proposal: { validDays: 21 } };
    let c = withBooking(c0, 'initiation', 7500);
    expect(c.proposal).toEqual({ validDays: 21, booking: { by: 'initiation', fee: 7500 } });
    c = withBooking(c, 'initiation');
    expect(c.proposal!.booking).toEqual({ by: 'initiation', fee: 7500 });
    c = withBooking(c, 'd1');
    expect(c.proposal!.booking).toEqual({ by: 'd1' });
  });
});
