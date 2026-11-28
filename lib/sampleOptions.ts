/**
 * Sample options: the three options for a typical home, for a first meeting.
 *
 * When an enquiry comes in, the client wants to know what a home like theirs
 * costs before anyone has made a project or a BOQ. This takes a size (2-BHK)
 * and a carpet area and gives each of the studio's three options as a RANGE:
 * the carpet area times the studio's own rate per sq ft for that option, low
 * and high. The rates are the owner's (saved on the studio record as
 * `sampleRates`), opening at the figures the owner gave on 28 Nov 2026:
 * ₹1,600–1,800, ₹2,200–2,400 and ₹2,600–2,800 per sq ft.
 *
 * The first version priced the options with the BOQ generator. That came out
 * far below what the studio quotes, because a Standard template holds only
 * part of the scope a real project carries. The generator still says WHAT each
 * option includes (from the studio's Standard templates): never what it costs.
 *
 * Nothing is saved. Never a cost or a margin.
 *
 * Pure.
 */
import type { Item, ProjectContext, ProposalTier } from '../types';
import { generateStandardPackages, type TemplateData } from './standardPackages';
import { typologiesOf } from './optionSetup';
import { asScopeBucket, isScopeBucket, SCOPE_BUCKET_META, type ScopeBucket } from './scopeBuckets';
import { GRADES, type Grade } from './materialSpecs';

/* ─────────────────────────── sizes ─────────────────────────── */

/** The sizes offered. */
export const SAMPLE_SIZES = ['1-BHK', '2-BHK', '3-BHK', '4-BHK'];

/** A usual carpet area for each size, sq ft: what the page opens at. */
export const TYPICAL_CARPET: Record<number, number> = { 1: 500, 2: 850, 3: 1250, 4: 1800 };

const BHK = /^(\d)\s*-?\s*BHK$/i;
const bhkOf = (size: string): number => Number(String(size).trim().match(BHK)?.[1]) || 2;

/** The size the page opens at. */
export const DEFAULT_SAMPLE_SIZE = '2-BHK';

/** A usual carpet area for the size. */
export const typicalCarpetOf = (size: string): number => TYPICAL_CARPET[bhkOf(size)] || 1000;

/** Three usual areas to pick from: a little smaller, usual, a little larger, to the nearest 50 sq ft. */
export function usualAreasOf(size: string): number[] {
  const t = typicalCarpetOf(size);
  return [0.85, 1, 1.2].map(f => Math.round((t * f) / 50) * 50);
}

/** The studio's typology for this size ("2-BHK", "2 bhk"), or null when it has none. */
export function typologyFor(size: string, templates: TemplateData | null | undefined): string | null {
  return Object.keys(typologiesOf(templates || {})).find(k => BHK.test(k.trim()) && bhkOf(k) === bhkOf(size)) || null;
}

/* ─────────────────────────── the owner's rates ─────────────────────────── */

/** ₹ per sq ft for each option, low and high. */
export type SampleRates = Record<Grade, [number, number]>;

/** The owner's figures (28 Nov 2026), until the studio saves its own. */
export const DEFAULT_SAMPLE_RATES: SampleRates = { E: [1600, 1800], C: [2200, 2400], P: [2600, 2800] };

/** The limits a rate is kept within, ₹ per sq ft. */
export const RATE_LIMITS: [number, number] = [100, 50000];

/** A rate pair kept within the limits, low first; null when either is not a number. */
function cleanPair(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const a = Number(v[0]), b = Number(v[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const clamp = (n: number) => Math.round(Math.min(RATE_LIMITS[1], Math.max(RATE_LIMITS[0], n)));
  return [clamp(Math.min(a, b)), clamp(Math.max(a, b))];
}

/** The studio's rates: its own for an option it has set, the owner's figures for the rest. */
export function sampleRatesOf(saved: unknown): SampleRates {
  const raw = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const out = {} as SampleRates;
  GRADES.forEach(g => { out[g] = cleanPair(raw[g]) || [...DEFAULT_SAMPLE_RATES[g]] as [number, number]; });
  return out;
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

/** A name the Item bank keeps in capitals, in sentence case: "WARDROBE WITH LOFT" → "Wardrobe with loft". */
export function itemLabel(name: string): string {
  const n = String(name || '').trim();
  if (!n || n !== n.toUpperCase() || !/[A-Z]/.test(n)) return n;
  const lower = n.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/* ─────────────────────────── the options ─────────────────────────── */

export interface SampleOption {
  grade: Grade;
  name: string;
  /** The finish, in the generator's words ("1mm laminate, soft-close hardware"); empty with no template. */
  finish: string;
  /** Carpet area × the option's low and high rate, to ₹10,000 (low down, high up). */
  low: number;
  high: number;
  /** ₹ per sq ft, low and high. */
  rate: [number, number];
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
  lines: SampleLine[];
}

export interface SampleBook {
  size: string;
  carpet: number;
  options: SampleOption[];
  /** What each option includes, room by room, from the studio's Standard template; empty without one. */
  rooms: SampleRoom[];
}

/** The options' names, as the generator gives them. */
export const OPTION_NAMES: Record<Grade, string> = { E: 'Essential Elegance', C: 'Comfort Upgrade', P: 'Complete Harmony' };

const BUCKET_LABEL: Record<ScopeBucket, string> = {
  Civil: 'Civil work',
  Functional: 'Across the home',
  Others: 'Site services',
};

const gradeOf = (t: ProposalTier, i: number): Grade => ((t as any).specGrade as Grade) || GRADES[i];

const finishOf = (t: ProposalTier | undefined): string => {
  const said = String(t?.boq.find(l => l.rationale)?.rationale || '').split(' · ')[0];
  const plain = said.replace(/^(base|mid|top)\s+spec:\s*/i, '').trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
};

const contextFor = (typology: string, area: number): ProjectContext => ({
  name: `Sample ${typology}`,
  type: 'TURNKEY',
  area,
  ceilingHeight: 9.5,
  config: typology,
  rooms: [],
} as unknown as ProjectContext);

/** The generator's three options for the studio's template of this size, or none. */
function templateOptions(size: string, carpet: number, bank: Item[], templates: TemplateData): ProposalTier[] {
  const typology = typologyFor(size, templates);
  if (!typology || !bank.length) return [];
  try { return generateStandardPackages(contextFor(typology, carpet), bank, templates, 'tiered'); } catch { return []; }
}

/**
 * The three options for a home of this size and area: each a range from the
 * studio's rates, and what it includes from the studio's Standard template.
 */
export function sampleOptions(args: {
  size: string;
  carpet: number;
  rates?: SampleRates | null;
  bank?: Item[];
  templates?: TemplateData;
}): SampleBook {
  const { size } = args;
  const carpet = Math.max(100, Math.round(Number(args.carpet) || typicalCarpetOf(size)));
  const rates = sampleRatesOf(args.rates);
  const bank = args.bank || [];
  const bankMap = new Map(bank.map(i => [i.id, i]));
  const tiers = templateOptions(size, carpet, bank, args.templates || {});
  const byGrade = new Map(tiers.map((t, i) => [gradeOf(t, i), t]));
  const namesIn = (t: ProposalTier | undefined) => new Set((t?.boq || []).map(l => l.bankId));

  const options: SampleOption[] = GRADES.map((g, i) => {
    const t = byGrade.get(g);
    const before = i > 0 ? byGrade.get(GRADES[i - 1]) : undefined;
    const had = namesIn(before);
    const adds = before && t
      ? [...new Set(t.boq.filter(l => !had.has(l.bankId)).map(l => bankMap.get(l.bankId)?.name).filter((n): n is string => !!n).map(itemLabel))]
      : [];
    const [lo, hi] = rates[g];
    return {
      grade: g,
      name: t?.name || OPTION_NAMES[g],
      finish: finishOf(t),
      low: roundTo(carpet * lo, 10000, 'down'),
      high: roundTo(carpet * hi, 10000, 'up'),
      rate: [lo, hi],
      adds,
    };
  });

  /* The rooms in the order the home lists them, then the scopes; only those an option has work in. */
  const rooms: SampleRoom[] = [];
  if (tiers.length) {
    const listed = tiers[0].projectContext?.rooms || [];
    const order = listed.map(r => r.name);
    tiers.forEach(t => t.boq.forEach(l => { if (l.roomId && !order.includes(l.roomId)) order.push(l.roomId); }));
    [...order.filter(n => !isScopeBucket(n)), ...order.filter(n => isScopeBucket(n))].forEach(id => {
      const lines = new Map<string, SampleLine>();
      tiers.forEach((t, i) => {
        const g = gradeOf(t, i);
        t.boq.filter(l => l.roomId === id).forEach(l => {
          const name = itemLabel(bankMap.get(l.bankId)?.name || l.bankId);
          const line = lines.get(name) || { name, in: [] };
          if (!line.in.includes(g)) line.in.push(g);
          lines.set(name, line);
        });
      });
      if (!lines.size) return;
      const bucket = asScopeBucket(id);
      const room = listed.find(r => r.name === id);
      rooms.push({
        id,
        label: bucket ? BUCKET_LABEL[bucket] : id,
        detail: bucket ? SCOPE_BUCKET_META[bucket].detail : undefined,
        area: !bucket && room && room.size > 0 ? Math.round(room.size) : undefined,
        /* What every option has first, then what the higher ones add. */
        lines: [...lines.values()].sort((x, y) => y.in.length - x.in.length),
      });
    });
  }

  return { size, carpet, options, rooms };
}
