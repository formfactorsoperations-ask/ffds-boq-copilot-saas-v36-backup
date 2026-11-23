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
}

/** Studio cash this financial year as a share of the limit, with this project's cash part swapped in. */
export function studioCashPct(otherProjectsCash: number, projectCash: number, limit: number): number {
  return limit > 0 ? (Math.max(0, otherProjectsCash) + Math.max(0, projectCash)) / limit * 100 : 0;
}
