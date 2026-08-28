import {
  FullBoqItem, PurchaseOrder, ProcurementMode, POScope, Vendor, POStatus,
} from '../types';
import { calculateSellPrice } from './utils';

// ============================================================================
// procurement — derives budget envelopes from the BOQ and rolls purchase
// orders up against them. No I/O. Budgets are never stored, only computed.
// ============================================================================

export const envelopeKey = (roomId: string, category: string) => `${roomId || 'Unassigned'}::${category}`;

/** Categories usually bought whole from one subcontractor. */
export const TURNKEY_DEFAULT_CATEGORIES = ['Modular Kitchen'];

export function defaultModeFor(category: string): ProcurementMode {
  return TURNKEY_DEFAULT_CATEGORIES.includes(category) ? 'turnkey' : 'split';
}

/** POs in these states represent real commitments. Drafts and cancellations don't. */
const COMMITTED_STATUSES: POStatus[] = ['issued', 'received', 'closed'];
export const isCommitted = (po: PurchaseOrder) => COMMITTED_STATUSES.includes(po.status);

/** The rate actually used for cost — mirrors the pricing engine in App.tsx.
 *  `baseRate` overrides the MATERIALS portion only; labour always comes from the bank. */
export const effectiveMaterials = (i: FullBoqItem) =>
  i.baseRate !== undefined ? i.baseRate : (i.materials || 0);

export interface Envelope {
  key: string;
  roomId: string;
  category: string;
  mode: ProcurementMode;

  // Budget — derived from the BOQ, never stored
  budgetMaterials: number;
  budgetLabour: number;
  budgetTotal: number;

  // Committed — issued POs
  committedMaterials: number;
  committedLabour: number;
  committedTurnkey: number;
  committedTotal: number;

  billedTotal: number;
  paidTotal: number;

  /** committedTotal − budgetTotal, floored at 0 */
  overBy: number;
  pctCommitted: number;
  poCount: number;
}

/**
 * Build one envelope per room × category present in the BOQ.
 * `pos` may contain orders for envelopes that no longer exist in the BOQ —
 * those are returned too, with a zero budget, so money is never hidden.
 */
export function buildEnvelopes(
  boq: FullBoqItem[],
  pos: PurchaseOrder[],
  modes: Record<string, ProcurementMode> = {},
): Envelope[] {
  const map = new Map<string, Envelope>();

  const ensure = (roomId: string, category: string): Envelope => {
    const key = envelopeKey(roomId, category);
    let e = map.get(key);
    if (!e) {
      e = {
        key, roomId: roomId || 'Unassigned', category,
        mode: modes[key] || defaultModeFor(category),
        budgetMaterials: 0, budgetLabour: 0, budgetTotal: 0,
        committedMaterials: 0, committedLabour: 0, committedTurnkey: 0, committedTotal: 0,
        billedTotal: 0, paidTotal: 0, overBy: 0, pctCommitted: 0, poCount: 0,
      };
      map.set(key, e);
    }
    return e;
  };

  // --- budgets from the BOQ -------------------------------------------------
  (boq || []).forEach(i => {
    if (!i) return;
    const e = ensure(i.roomId || 'Unassigned', i.cat || 'Other');
    const qty = i.qty || 0;
    e.budgetMaterials += effectiveMaterials(i) * qty;
    e.budgetLabour += (i.labor || 0) * qty;
  });

  // --- commitments from POs ------------------------------------------------
  (pos || []).forEach(po => {
    if (!po || po.status === 'cancelled') return;
    const e = ensure(po.roomId, po.category);
    e.poCount += 1;
    if (!isCommitted(po)) return;                  // drafts don't commit money

    const amt = po.total || 0;
    e.committedTotal += amt;
    if (po.scope === 'material') e.committedMaterials += amt;
    else if (po.scope === 'labour') e.committedLabour += amt;
    else e.committedTurnkey += amt;

    // Billed: the vendor's bill if entered, otherwise nothing yet.
    if (po.billAmount != null) e.billedTotal += po.billAmount;
    e.paidTotal += (po.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  });

  return [...map.values()].map(e => {
    e.budgetTotal = e.budgetMaterials + e.budgetLabour;
    e.overBy = Math.max(0, e.committedTotal - e.budgetTotal);
    e.pctCommitted = e.budgetTotal > 0 ? (e.committedTotal / e.budgetTotal) * 100 : 0;
    return e;
  }).sort((a, b) => b.budgetTotal - a.budgetTotal);
}

/** What a NEW po of `amount` would do to an envelope. Used for the live warning. */
export function previewImpact(env: Envelope | undefined, amount: number) {
  if (!env) return null;
  const after = env.committedTotal + amount;
  return {
    before: env.committedTotal,
    after,
    budget: env.budgetTotal,
    over: Math.max(0, after - env.budgetTotal),
    willExceed: after > env.budgetTotal,
  };
}

// ---------------------------------------------------------------------------
// Margin: quoted vs actual, per room
// ---------------------------------------------------------------------------
export interface RoomMargin {
  roomId: string;
  quotedSell: number;
  plannedCost: number;
  committed: number;
  billed: number;
  /** Cost used for the live margin: billed where known, else committed, else planned. */
  effectiveCost: number;
  marginPct: number;
  quotedMarginPct: number;
}

export function buildRoomMargins(
  boq: FullBoqItem[],
  pos: PurchaseOrder[],
  modes: Record<string, ProcurementMode> = {},
): RoomMargin[] {
  const envs = buildEnvelopes(boq, pos, modes);
  const byRoom = new Map<string, RoomMargin>();

  const ensure = (roomId: string): RoomMargin => {
    const r = roomId || 'Unassigned';
    let m = byRoom.get(r);
    if (!m) {
      m = { roomId: r, quotedSell: 0, plannedCost: 0, committed: 0, billed: 0,
            effectiveCost: 0, marginPct: 0, quotedMarginPct: 0 };
      byRoom.set(r, m);
    }
    return m;
  };

  (boq || []).forEach(i => {
    if (!i) return;
    const m = ensure(i.roomId);
    const qty = i.qty || 0;
    const mat = effectiveMaterials(i);
    const margin = i.marginOverride ?? i.margin ?? 0;
    m.quotedSell += calculateSellPrice(mat, i.labor || 0, margin) * qty;
    m.plannedCost += (mat + (i.labor || 0)) * qty;
  });

  envs.forEach(e => {
    const m = ensure(e.roomId);
    m.committed += e.committedTotal;
    m.billed += e.billedTotal;
  });

  return [...byRoom.values()].map(m => {
    // Committed is the best forward-looking view; fall back to plan where nothing is ordered.
    m.effectiveCost = m.committed > 0 ? Math.max(m.committed, m.billed) : m.plannedCost;
    m.marginPct = m.quotedSell > 0 ? ((m.quotedSell - m.effectiveCost) / m.quotedSell) * 100 : 0;
    m.quotedMarginPct = m.quotedSell > 0 ? ((m.quotedSell - m.plannedCost) / m.quotedSell) * 100 : 0;
    return m;
  }).sort((a, b) => b.quotedSell - a.quotedSell);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const poOutstanding = (po: PurchaseOrder) => {
  const owed = po.billAmount != null ? po.billAmount : po.total;
  const paid = (po.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  return Math.max(0, owed - paid);
};

export const poPaid = (po: PurchaseOrder) =>
  (po.payments || []).reduce((s, p) => s + (p.amount || 0), 0);

/** Per-project sequential number: PO/YYMM/001 */
export function nextPoNumber(existing: PurchaseOrder[]): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const n = String((existing?.length || 0) + 1).padStart(3, '0');
  return `PO/${yy}${mm}/${n}`;
}

export function vendorsFor(vendors: Vendor[], scope: POScope, category?: string): Vendor[] {
  return (vendors || []).filter(v =>
    v.active !== false &&
    (v.supplies || []).includes(scope) &&
    (!category || !v.categories?.length || v.categories.includes(category)),
  );
}
