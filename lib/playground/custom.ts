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
import type { Item } from '../../types';
import { calculateCostFromSell } from '../utils';

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
