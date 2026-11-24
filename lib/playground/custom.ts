/*
  A custom item, added straight to the BOQ (components/playground/CustomItemModal):
  something the Item Bank does not have. It is kept with the project
  (`adHocItems`), which every price, document and the client's portal already
  read, and App keeps a copy in the Item Bank so it can be picked again
  (lib/bankMatch addToBank).

  Its price comes one of two ways:
    cost  the studio's finance roles give material, labour and a margin;
    rate  anyone else gives the rate the client pays, and the trade's usual
          margin (the bank's average for it) stands behind it as the cost.
*/
import type { Item, Room } from '../../types';
import { calculateCostFromSell } from '../utils';
import { basisOfUnit } from '../boqSize';
import { civilDims, DOOR_SQFT } from './civil';
import { ftin, round2 } from './geometry';

export interface CustomInput {
  name: string;
  room: string;
  cat: string;
  unit: string;
  qty: number;
  specs: string;
  /** The rate the client pays, per unit (the "rate" way). */
  rate: number;
  /** Cost per unit and margin % (the "cost" way). */
  materials: number;
  labor: number;
  margin: number;
}

/** The units a custom item is offered, the bank's own first. */
const COMMON_UNITS = ['nos', 'sq ft', 'r ft', 'lump sum', 'set', 'sq m', 'r m'];
const DEFAULT_MARGIN = 25;

/** The trades and units the bank uses, most used first, and each trade's usual margin. */
export function customDefaults(bank: Item[]): { cats: string[]; units: string[]; marginFor: (cat: string) => number } {
  const count = (key: (i: Item) => string) => {
    const n = new Map<string, number>();
    (bank || []).forEach(i => { const k = (key(i) || '').trim(); if (k) n.set(k, (n.get(k) || 0) + 1); });
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const cats = count(i => i.cat);
  const units = [...new Set([...count(i => i.unit), ...COMMON_UNITS])];
  const margins = new Map<string, number[]>();
  (bank || []).forEach(i => { if (Number.isFinite(i.margin) && i.margin > 0) margins.set(i.cat, [...(margins.get(i.cat) || []), i.margin]); });
  const marginFor = (cat: string) => {
    const m = margins.get(cat);
    return m?.length ? Math.round((m.reduce((a, b) => a + b, 0) / m.length) * 10) / 10 : DEFAULT_MARGIN;
  };
  return { cats: cats.length ? (cats.includes('Others') ? cats : [...cats, 'Others']) : ['Carpentry', 'Civil', 'Others'], units, marginFor };
}

/** The item a custom entry makes, or what is missing. */
export function customItem(f: CustomInput, way: 'cost' | 'rate', newId: () => string): { ok: true; item: Item } | { ok: false; problem: string } {
  const name = f.name.trim();
  if (!name) return { ok: false, problem: 'Give it a name.' };
  if (!(f.qty > 0)) return { ok: false, problem: 'Give it a quantity.' };
  const margin = Math.max(0, Number(f.margin) || 0);
  let materials: number, labor: number;
  if (way === 'rate') {
    if (!(f.rate > 0)) return { ok: false, problem: 'Give it a rate.' };
    materials = Math.round(calculateCostFromSell(f.rate, margin) * 100) / 100;
    labor = 0;
  } else {
    materials = Math.max(0, Number(f.materials) || 0);
    labor = Math.max(0, Number(f.labor) || 0);
    if (!(materials + labor > 0)) return { ok: false, problem: 'Give it a cost.' };
  }
  return { ok: true, item: { id: `custom-${newId()}`, name, cat: f.cat || 'Others', unit: f.unit || 'nos', specs: f.specs.trim(), materials, labor, margin } };
}

/* ───────────────────────────── a custom work, measured from its room ───────────────────────────── */


/** What a custom work is measured by, as the Works tab measures the bank's own. */
export type MeasureBy = 'floor' | 'walls' | 'walls7' | 'ceiling' | 'perimeter' | 'skirting';

export const MEASURES: { id: MeasureBy; label: string; basis: 'area' | 'length' }[] = [
  { id: 'floor', label: 'The floor', basis: 'area' },
  { id: 'walls', label: 'The walls, to the ceiling', basis: 'area' },
  { id: 'walls7', label: 'The walls, to 7′', basis: 'area' },
  { id: 'ceiling', label: 'The ceiling', basis: 'area' },
  { id: 'perimeter', label: 'Round the walls', basis: 'length' },
  { id: 'skirting', label: 'Round the walls, less the doors', basis: 'length' },
];

/** The measures a unit can take: by area, or by length; none for a count or a lump sum. */
export const measuresFor = (unit: string) => {
  const b = basisOfUnit(unit);
  return MEASURES.filter(m => m.basis === b);
};

/** What its name suggests it is measured by: a floor by default, the walls for paint and tiles to the walls. */
export function suggestMeasure(name: string, unit: string): MeasureBy | null {
  const b = basisOfUnit(unit);
  if (b !== 'area' && b !== 'length') return null;
  const n = name.toLowerCase();
  if (b === 'length') return /skirting|beading|profile|cornice/.test(n) ? 'skirting' : 'perimeter';
  if (/ceiling|cove/.test(n)) return 'ceiling';
  if (/dado|wall\s*til/.test(n)) return 'walls7';
  if (/paint|putty|wallpaper|panel|cladding|texture/.test(n)) return 'walls';
  return 'floor';
}

const doorsOf = (n: number) => `${n} door${n > 1 ? 's' : ''}`;

/** The quantity a room gives, and the sum in words. Null when the room has no size. */
export function measureRoom(by: MeasureBy, room: Room | undefined): { qty: number; how: string } | null {
  const d = civilDims(room);
  if (!d) return null;
  switch (by) {
    case 'floor': return { qty: round2(d.area), how: `the floor, ${ftin(d.w)} × ${ftin(d.h)}` };
    case 'ceiling': return { qty: round2(d.area), how: `the ceiling, ${ftin(d.w)} × ${ftin(d.h)}` };
    case 'walls': return { qty: round2(Math.max(0, d.per * d.height - d.doors * DOOR_SQFT)), how: `${ftin(d.per)} of wall × ${ftin(d.height)}, less ${doorsOf(d.doors)}` };
    case 'walls7': return { qty: round2(Math.max(0, d.per * 7 - d.doors * DOOR_SQFT)), how: `${ftin(d.per)} of wall × 7′, less ${doorsOf(d.doors)}` };
    case 'perimeter': return { qty: round2(d.per), how: `round the walls, ${ftin(d.per)}` };
    case 'skirting': return { qty: round2(Math.max(0, d.per - d.doors * 3)), how: `round the walls, ${ftin(d.per)}, less ${doorsOf(d.doors)}` };
  }
}
