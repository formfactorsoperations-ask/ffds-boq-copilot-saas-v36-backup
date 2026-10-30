import { Item, BoqItem } from '../types';
import { calculateSellPrice } from './utils';

/**
 * BOQ PRICING — one implementation of what a line is worth.
 *
 * `tier.boq` stores `{ bankId, qty, roomId, baseRate, marginOverride }` and
 * nothing else: no name, no rate, no room. The name comes from the item bank,
 * the rate is computed, and `roomId` happens to hold the room's name.
 *
 * This mirrors `tiersWithCalculatedSummaries` in App.tsx line for line, and it
 * exists because the alternative — a second, hand-rolled reading of the same
 * fields — is what produced a comparison screen showing every item as "Item",
 * every room as "OTHER" and every total as ₹0. Two implementations of one truth
 * always drift; on a client portal the drift is a credibility problem, not a
 * rounding one.
 *
 * The three details that are easy to miss and were all missed:
 *
 *   • `baseRate` on the line is a FROZEN materials cost and overrides the
 *     bank's current one — the bank moves, a quoted BOQ must not.
 *   • the labour override is `b.labor`, not `b.baseLabor`.
 *   • lines marked deleted, substituted, excluded or client_procured are not
 *     part of the total at all. Summing them overstated a scope by 7%.
 */

/** Statuses that take a line out of the priced scope entirely. */
const NON_BILLABLE = new Set(['deleted', 'substituted', 'excluded', 'client_procured']);

export const isBillable = (b: BoqItem): boolean => !NON_BILLABLE.has((b as any).boqStatus);

/*
  AS ACTUALS — scope the client pays the vendor for directly.

  A line marked "As actuals" (or named "… (AS ACTUALS)") is still part of the
  scope: it stays in the BOQ, the client sees it, and the studio manages it.
  But FFDS does not invoice it, so it is not in FFDS's total, the payment
  schedule or GST. Its amount is an estimate, kept beside the total.

  A design fee set as a percentage is still charged on it: the studio designs
  that work whoever pays for the material (designFeeFor below).
*/
const AS_ACTUALS_NAME = /\bas[\s-]*actuals?\b/i;

export function isAsActuals(b: any, name?: string | null): boolean {
  return b?.boqStatus === 'as_actuals' || b?.asActuals === true || AS_ACTUALS_NAME.test(String(name ?? b?.name ?? ''));
}

export interface ResolvedBoqLine {
  /** Stable across versions: the bank id, else room + name. */
  key: string;
  room: string;
  name: string;
  unit?: string;
  qty: number;
  /** Sell rate per unit, margin applied. */
  rate: number;
  /** rate × qty. */
  total: number;
  /** Present but not billable — shown, never summed. */
  billable: boolean;
  /** In scope but paid directly to the vendor: shown, kept out of FFDS's total. */
  asActuals: boolean;
  status?: string;
}

/**
 * One line, priced exactly as the studio prices it.
 *
 * `bankMap` must include the project's own `adHocItems`, or lines added outside
 * the bank resolve to a name of "Item" and a rate of zero.
 */
export function resolveBoqLine(b: any, bankMap: Map<string, Item>): ResolvedBoqLine {
  const item = bankMap.get(b.bankId);
  const qty = Number(b.qty) || 0;

  let rate = 0;
  if (item) {
    const effectiveMaterials = b.baseRate !== undefined ? b.baseRate : item.materials;
    const effectiveLabor = b.labor !== undefined ? b.labor : item.labor;
    const margin = b.marginOverride ?? item.margin;
    rate = calculateSellPrice(effectiveMaterials, effectiveLabor, margin);
  } else {
    // Not in the bank: price off whatever the line itself carries.
    const margin = b.marginOverride ?? 0;
    const effectiveMaterials = b.materials !== undefined ? b.materials : (b.baseRate !== undefined ? b.baseRate : 0);
    const effectiveLabor = b.labor !== undefined ? b.labor : 0;
    if (effectiveMaterials > 0 || effectiveLabor > 0) {
      rate = calculateSellPrice(effectiveMaterials, effectiveLabor, margin);
    } else if (b.selectedRate) {
      rate = Number(b.selectedRate) || 0;
    }
  }

  // `roomId` holds the room's NAME on every project inspected — it is not a
  // foreign key despite the field name.
  const room = (b.roomId || b.room || b.roomName || 'Other').toString().trim() || 'Other';
  const name = (item?.name || b.name || b.item || 'Unnamed item').toString().trim();

  return {
    key: (b.bankId || `${room}|${name}`).toString().toLowerCase(),
    room,
    name,
    unit: item?.unit || b.unit,
    qty,
    rate,
    total: rate * qty,
    billable: isBillable(b),
    asActuals: isAsActuals(b, name),
    status: (b as any).boqStatus,
  };
}

export function resolveBoqLines(boq: any[], bankMap: Map<string, Item>): ResolvedBoqLine[] {
  return (boq || []).map(b => resolveBoqLine(b, bankMap));
}

/** The scope value FFDS invoices — billable lines, as-actuals left out, matching the studio's own summary. */
export function boqTotal(boq: any[], bankMap: Map<string, Item>): number {
  return resolveBoqLines(boq, bankMap)
    .filter(l => l.billable && !l.asActuals)
    .reduce((sum, l) => sum + l.total, 0);
}

/** The estimate of what the client pays vendors directly ("as actuals"). */
export function asActualsTotal(boq: any[], bankMap: Map<string, Item>): number {
  return resolveBoqLines(boq, bankMap)
    .filter(l => l.billable && l.asActuals)
    .reduce((sum, l) => sum + l.total, 0);
}

/**
 * The design fee on a scope. A percentage fee is charged on FFDS's work AND the
 * as-actuals estimate; a lump sum or a rate per square foot does not depend on
 * either. `designFee` defaults to 10 (%), as it always has.
 */
export function designFeeFor(
  ctx: { designFeeType?: string; designFee?: number; area?: number } | null | undefined,
  work: number,
  asActuals = 0,
): number {
  const c: any = ctx || {};
  if (c.designFeeType === 'fixed_lumpsum') return c.designFee || 0;
  if (c.designFeeType === 'fixed_sqft') return (c.designFee || 0) * (c.area || 0);
  return (work + asActuals) * ((c.designFee || 10) / 100);
}

/** Bank plus the project's ad-hoc items, which is what pricing actually needs. */
export function buildBankMap(bank: Item[], adHocItems?: Item[]): Map<string, Item> {
  const map = new Map<string, Item>((bank || []).map(i => [i.id, i]));
  (adHocItems || []).forEach(i => map.set(i.id, i));
  return map;
}
