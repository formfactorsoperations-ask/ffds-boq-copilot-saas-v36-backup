/**
 * Sample options: the three options for a typical home, for a first meeting.
 *
 * When an enquiry comes in, the client wants to know what a home like theirs
 * costs before anyone has made a project or a BOQ. This takes a size (2-BHK)
 * and a carpet area and prices the studio's three options with the same
 * generator a new project uses (lib/standardPackages): the studio's own
 * Standard templates, Item bank rates and Option setup. Nothing is saved.
 *
 * What the client sees is a RANGE, not a quote: each option priced for a home
 * ten per cent smaller and ten per cent larger than the area asked for, rounded
 * to ₹10,000. Room amounts are the option at the area asked for. Never a cost
 * or a margin.
 *
 * Pure.
 */
import type { Item, ProjectContext, ProposalTier } from '../types';
import { generateStandardPackages, type TemplateData } from './standardPackages';
import { typologiesOf } from './optionSetup';
import { lineSellRate } from './boqPricing';
import { asScopeBucket, isScopeBucket, SCOPE_BUCKET_META, type ScopeBucket } from './scopeBuckets';
import type { Grade } from './materialSpecs';

/** How far either side of the carpet area the range reaches. */
export const SAMPLE_SPREAD = 0.1;

/** A usual carpet area for each size, sq ft: what the page opens at. */
export const TYPICAL_CARPET: Record<number, number> = { 1: 500, 2: 850, 3: 1250, 4: 1800 };

const BHK = /^(\d)\s*-?\s*BHK$/i;
const bhkOf = (size: string): number => Number(size.match(BHK)?.[1]) || 2;

/** The sizes the studio has templates for, smallest first ("1-BHK" … "4-BHK"). */
export function sampleSizesOf(templates: TemplateData | null | undefined): string[] {
  return Object.keys(typologiesOf(templates || {}))
    .filter(k => BHK.test(k.trim()))
    .sort((a, b) => bhkOf(a) - bhkOf(b));
}

/** The size the page opens at: 2-BHK when the studio has it, else its first. */
export function defaultSampleSize(sizes: string[]): string | null {
  return sizes.find(s => bhkOf(s) === 2) || sizes[0] || null;
}

/** A usual carpet area for the size. */
export const typicalCarpetOf = (size: string): number => TYPICAL_CARPET[bhkOf(size)] || 1000;

/** Three usual areas to pick from: a little smaller, usual, a little larger, to the nearest 50 sq ft. */
export function usualAreasOf(size: string): number[] {
  const t = typicalCarpetOf(size);
  return [0.85, 1, 1.2].map(f => Math.round((t * f) / 50) * 50);
}

/** The carpet areas the range covers. */
export function bandOf(carpet: number, spread = SAMPLE_SPREAD): [number, number] {
  return [Math.round(carpet * (1 - spread)), Math.round(carpet * (1 + spread))];
}

/* ─────────────────────────── money, as the client reads it ─────────────────────────── */

const roundTo = (v: number, step: number, how: 'down' | 'up' | 'near' = 'near') =>
  (how === 'down' ? Math.floor(v / step) : how === 'up' ? Math.ceil(v / step) : Math.round(v / step)) * step;

const trim = (s: string) => s.replace(/\.0+$/, '');

/** ₹7.4 L, ₹1.25 Cr, ₹85,000. */
export function inLakhs(v: number): string {
  const n = Math.max(0, Number(v) || 0);
  if (n >= 1e7) return `₹${trim((n / 1e7).toFixed(2))} Cr`;
  if (n >= 1e5) return `₹${trim((n / 1e5).toFixed(1))} L`;
  return `₹${roundTo(n, 1000).toLocaleString('en-IN')}`;
}

/** "₹6.8 – 7.6 L", or both in full when they are not both in lakhs. */
export function rangeText(low: number, high: number): string {
  if (low >= 1e5 && high < 1e7 && low < 1e7) return `₹${trim((low / 1e5).toFixed(1))} – ${trim((high / 1e5).toFixed(1))} L`;
  return `${inLakhs(low)} – ${inLakhs(high)}`;
}

/* ─────────────────────────── the options ─────────────────────────── */

export interface SampleOption {
  grade: Grade;
  name: string;
  /** The finish, in the generator's words ("0.8mm laminate, standard hardware"). */
  finish: string;
  /** The option for the smallest and largest home in the band, rounded to ₹10,000. */
  low: number;
  high: number;
  /** The option at the area asked for, rounded to ₹10,000. */
  mid: number;
  /** ₹ per sq ft at the area asked for, to the nearest ₹50. */
  perSqft: number;
  /** Items this option has that the one before it does not, by name. */
  adds: string[];
}

export interface SampleLine {
  name: string;
  /** The options that include it. */
  in: Grade[];
}

export interface SampleRoom {
  /** The room's name in the BOQ. */
  id: string;
  /** What the client reads: the room, or "Across the home" for a scope. */
  label: string;
  detail?: string;
  /** sq ft, for a real room. */
  area?: number;
  /** Each option's amount for the room, rounded to ₹5,000; 0 when it has nothing there. */
  amounts: Partial<Record<Grade, number>>;
  lines: SampleLine[];
}

export interface SampleBook {
  size: string;
  carpet: number;
  band: [number, number];
  options: SampleOption[];
  rooms: SampleRoom[];
}

/** A name the Item bank keeps in capitals, in sentence case: "WARDROBE WITH LOFT" → "Wardrobe with loft". */
export function itemLabel(name: string): string {
  const n = String(name || '').trim();
  if (!n || n !== n.toUpperCase() || !/[A-Z]/.test(n)) return n;
  const lower = n.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const BUCKET_LABEL: Record<ScopeBucket, string> = {
  Civil: 'Civil work',
  Functional: 'Across the home',
  Others: 'Site services',
};

const gradeOf = (t: ProposalTier, i: number): Grade => ((t as any).specGrade as Grade) || (['E', 'C', 'P'][i] as Grade);

const finishOf = (t: ProposalTier): string => {
  const said = String(t.boq.find(l => l.rationale)?.rationale || '').split(' · ')[0];
  const plain = said.replace(/^(base|mid|top)\s+spec:\s*/i, '').trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
};

const contextFor = (size: string, area: number): ProjectContext => ({
  name: `Sample ${size}`,
  type: 'TURNKEY',
  area,
  ceilingHeight: 9.5,
  config: size,
  rooms: [],
} as unknown as ProjectContext);

/**
 * The three options for a home of this size and area, priced at the studio's
 * rates; null when the Item bank cannot price any of them.
 */
export function sampleOptions(args: {
  size: string;
  carpet: number;
  bank: Item[];
  templates: TemplateData;
  spread?: number;
}): SampleBook | null {
  const { size, bank, templates } = args;
  const carpet = Math.max(100, Math.round(Number(args.carpet) || typicalCarpetOf(size)));
  const band = bandOf(carpet, args.spread ?? SAMPLE_SPREAD);
  const bankMap = new Map(bank.map(i => [i.id, i]));
  const make = (area: number) => generateStandardPackages(contextFor(size, area), bank, templates, 'tiered');

  const mid = make(carpet);
  if (!mid.length || mid.every(t => !(t.summary?.totalSell > 0))) return null;
  const small = make(band[0]);
  const large = make(band[1]);

  const amountOf = (l: { bankId: string; qty: number }) => {
    const item = bankMap.get(l.bankId);
    return item ? lineSellRate(l, item) * (Number(l.qty) || 0) : 0;
  };

  const options: SampleOption[] = mid.map((t, i) => {
    const a = small[i]?.summary?.totalSell || 0;
    const b = large[i]?.summary?.totalSell || 0;
    const m = t.summary?.totalSell || 0;
    const lo = Math.min(a, b, m), hi = Math.max(a, b, m);
    const before = i > 0 ? new Set(mid[i - 1].boq.map(l => l.bankId)) : null;
    const adds = before
      ? [...new Set(t.boq.filter(l => !before.has(l.bankId)).map(l => bankMap.get(l.bankId)?.name).filter((n): n is string => !!n).map(itemLabel))]
      : [];
    return {
      grade: gradeOf(t, i),
      name: t.name,
      finish: finishOf(t),
      low: roundTo(lo, 10000, 'down'),
      high: roundTo(hi, 10000, 'up'),
      mid: roundTo(m, 10000),
      perSqft: roundTo(m / carpet, 50),
      adds,
    };
  });

  /* The rooms in the order the home lists them, then the scopes; only those an option has work in. */
  const order = (mid[0].projectContext?.rooms || []).map(r => r.name);
  mid.forEach(t => t.boq.forEach(l => { if (l.roomId && !order.includes(l.roomId)) order.push(l.roomId); }));
  const rooms: SampleRoom[] = [];
  const realFirst = [...order.filter(n => !isScopeBucket(n)), ...order.filter(n => isScopeBucket(n))];
  realFirst.forEach(id => {
    const amounts: Partial<Record<Grade, number>> = {};
    const lines = new Map<string, SampleLine>();
    mid.forEach((t, i) => {
      const g = gradeOf(t, i);
      const here = t.boq.filter(l => l.roomId === id);
      amounts[g] = roundTo(here.reduce((s, l) => s + amountOf(l), 0), 5000);
      here.forEach(l => {
        const name = itemLabel(bankMap.get(l.bankId)?.name || l.bankId);
        const line = lines.get(name) || { name, in: [] };
        if (!line.in.includes(g)) line.in.push(g);
        lines.set(name, line);
      });
    });
    if (!lines.size) return;
    const bucket = asScopeBucket(id);
    const room = (mid[0].projectContext?.rooms || []).find(r => r.name === id);
    rooms.push({
      id,
      label: bucket ? BUCKET_LABEL[bucket] : id,
      detail: bucket ? SCOPE_BUCKET_META[bucket].detail : undefined,
      area: !bucket && room && room.size > 0 ? Math.round(room.size) : undefined,
      amounts,
      /* What every option has first, then what the higher ones add. */
      lines: [...lines.values()].sort((x, y) => y.in.length - x.in.length),
    });
  });

  return { size, carpet, band, options, rooms };
}
