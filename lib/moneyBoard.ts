import type { PaymentMilestone } from '../types';

/*
  The Money board: what each milestone card shows, worked out without React.

  Money opens on the design and execution milestones side by side. Each card
  says where its milestone stands (paid, with the client, earned, up next or
  later), and the tax terms on each track can be previewed before they are
  applied. The arithmetic stays in lib/paymentSchedule.ts; this file only
  decides what the board says about it.
*/

/*
  `void` and `dropped` are for a terminated project (lib/termination): an
  invoice raised and never paid is cancelled, replaced by the settlement, and
  a milestone never billed will not be.
*/
export type CardState = 'paid' | 'invoiced' | 'earned' | 'next' | 'later' | 'void' | 'dropped';
export type Track = 'design' | 'execution';

/**
 * Where each milestone stands. `earned` comes from `billableNow` (every
 * sub-step ticked, or its date has passed); the first milestone still to come
 * on a track is "up next", the rest "later".
 */
export function cardStates(milestones: PaymentMilestone[], earnedIds: Set<string>, terminated = false): Record<string, CardState> {
  const out: Record<string, CardState> = {};
  const seenNext: Record<string, boolean> = {};
  for (const m of milestones || []) {
    if (m.status === 'paid') { out[m.id] = 'paid'; continue; }
    /* Terminated: nothing is up next. What was billed and not paid is cancelled; the rest is never billed. */
    if (terminated) { out[m.id] = m.status === 'invoiced' ? 'void' : 'dropped'; continue; }
    if (m.status === 'invoiced') { out[m.id] = 'invoiced'; continue; }
    if (earnedIds.has(m.id)) { out[m.id] = 'earned'; continue; }
    const t = m.type || 'design';
    out[m.id] = seenNext[t] ? 'later' : 'next';
    seenNext[t] = true;
  }
  return out;
}

export type MilestoneKind = 'concept' | 'model' | 'drawings' | 'material' | 'build' | 'finish' | 'handover' | 'design' | 'execution';

/** Which icon a milestone carries, from what it is called. Studios name stages their own way, so this reads the words. */
export function milestoneKind(m: { name?: string; type?: string; isHandoverAdvance?: boolean }): MilestoneKind {
  const n = (m.name || '').toLowerCase();
  if (m.isHandoverAdvance || /handover|hand over|completion &|key|closeout|close-out/.test(n)) return 'handover';
  if (/concept|sign[- ]?up|signing|booking|retainer|initiation|brief/.test(n)) return 'concept';
  if (/3d|develop|render|layout|visuali/.test(n)) return 'model';
  if (/drawing|gfc|working|completion|detail|blueprint/.test(n)) return 'drawings';
  if (/material|order|procure|mobili|advance/.test(n) && m.type === 'execution') return 'material';
  if (/finish|paint|polish|laminat|fitting|shutter/.test(n)) return 'finish';
  if (/carcass|civil|structure|ceiling|first[- ]fix|carpentry|frame|mep/.test(n)) return 'build';
  return m.type === 'execution' ? 'execution' : 'design';
}

/** A milestone's share of its track, counting a fixed amount at what it is worth against the taxable base. */
export function shareOf(m: Pick<PaymentMilestone, 'percentage' | 'isFixedAmount' | 'fixedAmount'>, taxableBase: number): number {
  if (m.isFixedAmount && m.fixedAmount !== undefined) return taxableBase > 0 ? (Number(m.fixedAmount) || 0) / taxableBase * 100 : 0;
  return Number(m.percentage) || 0;
}

/** What a track's milestones add up to, in percent. Within half a percent of 100 counts as whole: a fixed amount rarely lands on a round share. */
export function trackTotal(rows: PaymentMilestone[], taxableBase: number): { pct: number; whole: boolean } {
  const pct = rows.reduce((s, m) => s + shareOf(m, taxableBase), 0);
  return { pct, whole: Math.abs(pct - 100) < 0.5 };
}

const cleared = (m: PaymentMilestone) => m.status === 'paid' || m.status === 'invoiced';

/** Puts the difference from 100% on the last milestone that is billed by percent and not yet invoiced. */
export function balanceTrack(rows: PaymentMilestone[], taxableBase: number): PaymentMilestone[] {
  const diff = Math.round((100 - trackTotal(rows, taxableBase).pct) * 100) / 100;
  if (!diff) return rows;
  const idx = [...rows].reverse().findIndex(m => !cleared(m) && !m.isFixedAmount);
  if (idx < 0) return rows;
  const at = rows.length - 1 - idx;
  return rows.map((m, i) => (i === at ? { ...m, percentage: Math.max(0, Math.round(((Number(m.percentage) || 0) + diff) * 100) / 100), isCustom: true } : m));
}

/** Fixed amounts still to bill on a track, against what is left to bill on it. */
export function fixedOverflow(rows: PaymentMilestone[], taxableBase: number, lockedBase: number): { over: boolean; left: number } {
  const fixed = rows.filter(m => !cleared(m) && m.isFixedAmount).reduce((s, m) => s + (Number(m.fixedAmount) || 0), 0);
  const left = Math.max(0, taxableBase - lockedBase);
  return { over: fixed > left + 1, left };
}

/** The tax terms the board previews and applies. */
export interface TaxTerms {
  billablePercent: number;
  designBillablePercent: number;
  executionGstEnabled: boolean;
  designGstEnabled: boolean;
  gstRate: number;
}

export function sameTerms(a: TaxTerms, b: TaxTerms): boolean {
  return a.billablePercent === b.billablePercent && a.designBillablePercent === b.designBillablePercent
    && a.executionGstEnabled === b.executionGstEnabled && a.designGstEnabled === b.designGstEnabled && a.gstRate === b.gstRate;
}

/** What moved between two sets of terms, in words, for History. */
export function termsChanges(a: TaxTerms, b: TaxTerms): string[] {
  const out: string[] = [];
  if (a.billablePercent !== b.billablePercent) out.push(`Execution taxable share ${a.billablePercent}% → ${b.billablePercent}%`);
  if (a.designBillablePercent !== b.designBillablePercent) out.push(`Design taxable share ${a.designBillablePercent}% → ${b.designBillablePercent}%`);
  if (a.executionGstEnabled !== b.executionGstEnabled) out.push(`GST on execution ${b.executionGstEnabled ? 'turned on' : 'turned off'}`);
  if (a.designGstEnabled !== b.designGstEnabled) out.push(`GST on design ${b.designGstEnabled ? 'turned on' : 'turned off'}`);
  if (a.gstRate !== b.gstRate) out.push(`GST rate ${a.gstRate}% → ${b.gstRate}%`);
  return out;
}

/** What moved between two schedules, in words, for History. */
export function scheduleChanges(before: PaymentMilestone[], after: PaymentMilestone[]): string[] {
  const out: string[] = [];
  const was = new Map((before || []).map(m => [m.id, m]));
  const share = (m: PaymentMilestone) => (m.isFixedAmount && m.fixedAmount !== undefined ? `₹${Math.round(m.fixedAmount).toLocaleString('en-IN')} fixed` : `${Number(m.percentage) || 0}%`);
  for (const m of after || []) {
    const o = was.get(m.id);
    if (!o) { out.push(`${m.name} added at ${share(m)}`); continue; }
    if (share(o) !== share(m)) out.push(`${m.name} ${share(o)} → ${share(m)}`);
    if (o.name !== m.name) out.push(`${o.name} renamed ${m.name}`);
  }
  const now = new Set((after || []).map(m => m.id));
  for (const o of before || []) if (!now.has(o.id)) out.push(`${o.name} removed`);
  return out;
}

/** A change to the schedule or its tax terms, kept on the project so History can say what moved and why. */
export interface ScheduleChange {
  id: string;
  date: string;
  kind: 'schedule' | 'terms';
  changes: string[];
  reason?: string;
  /** What the client pays, before and after. */
  before?: number;
  after?: number;
  /**
   * The milestones as they were just before this change, so History can put
   * the schedule back. Older entries have none and cannot be restored.
   */
  snapshot?: PaymentMilestone[];
}

/** Fields that record billing. A restore never takes these from the past: what was invoiced or paid stays so. */
const BILLING_KEYS = ['status', 'invoiceNumber', 'invoiceDate', 'paidDate', 'lockedTaxableBase', 'lockedBillablePercent', 'lockedGstRate',
  'zohoInvoiceId', 'discountAmount', 'discountReason'] as const;

/** A copy of the milestones fit to keep in History (no undefined fields, which Firestore refuses). */
export function snapshotOf(milestones: PaymentMilestone[]): PaymentMilestone[] {
  return JSON.parse(JSON.stringify(milestones || []));
}

/** An issued schedule version's advances, read back as milestones (the issued document keeps no milestone ids). */
export function milestonesFromIssued(advances: any[]): PaymentMilestone[] {
  return (advances || []).map((a, i) => ({
    id: `issued_${i}`,
    type: a.phase === 'design' ? 'design' : 'execution',
    name: a.label || a.advanceCode || `Stage ${i + 1}`,
    percentage: Number(a.percentage) || 0,
    ...(a.isFixedAmount ? { isFixedAmount: true, fixedAmount: Number(a.fixedAmount) || 0 } : {}),
    description: a.advanceCode || '',
    trigger: a.dueCondition || '',
    unlocks: a.unlocks || '',
    ...(a.isHandoverAdvance ? { isHandoverAdvance: true } : {}),
    status: 'pending',
  } as PaymentMilestone));
}

/**
 * The schedule as it was in `past`, made safe to save now.
 *
 * - A milestone invoiced or paid since then keeps how it was billed: its
 *   share and its invoice stay as they are now, first on its track.
 * - A past milestone that still exists keeps its id, so its dates and steps
 *   and any invoice on it stay linked; billing fields always come from now.
 * - A past milestone that has since been billed under another id is not
 *   asked for twice: one with the same name and track is matched to it.
 * - A track that no longer adds up to 100% (because something billed since
 *   carries a different share) gets the difference on its last milestone
 *   still billed by percent.
 */
export function restoreSchedule(past: PaymentMilestone[], current: PaymentMilestone[], taxable: Record<Track, number>): { draft: PaymentMilestone[]; notes: string[] } {
  const notes: string[] = [];
  const now = new Map((current || []).map(m => [m.id, m]));
  const key = (m: PaymentMilestone) => `${m.type || 'design'}|${(m.name || '').trim().toLowerCase()}`;
  const billedNow = (current || []).filter(cleared);
  const billedIds = new Set(billedNow.map(m => m.id));
  const billedKeys = new Set(billedNow.map(key));
  /* An issued schedule keeps no milestone ids: match its rows to today's unbilled ones by track and name, so links and dates hold. */
  const freeByKey = new Map((current || []).filter(m => !cleared(m)).map(m => [key(m), m]));
  const pastIds = new Set((past || []).map(m => m.id));
  past = (past || []).map(m => {
    if (now.has(m.id)) return m;
    const match = freeByKey.get(key(m));
    if (match && !pastIds.has(match.id)) { freeByKey.delete(key(m)); return { ...match, ...m, id: match.id }; }
    return m;
  });
  const out: PaymentMilestone[] = [];
  (['design', 'execution'] as Track[]).forEach(t => {
    const keep = billedNow.filter(m => (m.type || 'design') === t);
    const rest = (past || []).filter(m => (m.type || 'design') === t && !billedIds.has(m.id) && !billedKeys.has(key(m)))
      .map(m => {
        const live = now.get(m.id);
        const copy: any = { ...m, isCustom: true };
        BILLING_KEYS.forEach(k => { delete copy[k]; if (live && (live as any)[k] !== undefined) copy[k] = (live as any)[k]; });
        if (!copy.status) copy.status = 'pending';
        return copy as PaymentMilestone;
      });
    keep.forEach(m => {
      const was = (past || []).find(p => p.id === m.id || key(p) === key(m));
      if (!was) notes.push(`${m.name} was billed after this version, so it stays in the schedule as billed.`);
      else if (Math.abs(shareOf(was, taxable[t]) - shareOf(m, taxable[t])) >= 0.5) notes.push(`${m.name} was billed after this version, so it keeps the share it was billed at.`);
    });
    let list = [...keep, ...rest];
    if (list.length && !trackTotal(list, taxable[t]).whole) {
      list = balanceTrack(list, taxable[t]);
      const last = [...list].reverse().find(m => !cleared(m) && !m.isFixedAmount);
      if (last) notes.push(`${t === 'design' ? 'Design' : 'Execution'} did not add up to 100% with what is billed now, so ${last.name} takes the difference.`);
    }
    out.push(...list);
  });
  return { draft: out, notes };
}

/** Studio cash this financial year as a share of the limit, with this project's cash part swapped in. */
export function studioCashPct(otherProjectsCash: number, projectCash: number, limit: number): number {
  return limit > 0 ? (Math.max(0, otherProjectsCash) + Math.max(0, projectCash)) / limit * 100 : 0;
}
