/*
  Can this finish actually be ordered, and will it arrive in time?

  The schedule of finishes screen could say how many items existed and how many
  the client had confirmed. Neither is the question a studio has at 9am. The
  questions are: which of these can I raise a purchase order for today, which
  are missing something before I can, which has the client been sitting on, and
  which will miss the site date if I do not order it this week.

  All four are answerable from fields the record already carries -- vendor,
  rate, quantity, lead time, when the confirmation went out -- and none of them
  were being read. This works them out.
*/

import { MaterialSelection, ProjectContext } from '../types';

export type Bucket = 'locked' | 'ready' | 'blocked' | 'awaiting' | 'not_started';

export interface Blocker {
  key: 'vendor' | 'rate' | 'qty' | 'sample' | 'finish';
  label: string;
}

export interface LeadRisk {
  level: 'late' | 'tight';
  /** The last day an order can be placed and still land before the anchor date. */
  orderBy: Date;
  daysOfSlack: number;
}

export interface SelectionAssessment {
  bucket: Bucket;
  blockers: Blocker[];
  leadRisk: LeadRisk | null;
  /** Days since the confirmation request went out, if it is still unanswered. */
  staleDays: number | null;
}

/** Mirrors the status migration the screen already applies. */
function normaliseStatus(status: any): string {
  const s = String(status || '').toLowerCase();
  if (s === 'pending' || s === 'sent') return 'sent_for_approval';
  if (s === 'approved' || s === 'confirmed') return 'confirmed';
  return s;
}

const LOCKED = new Set(['confirmed', 'locked', 'ordered', 'delivered', 'installed']);

/**
 * What stops this item being ordered right now.
 *
 * A purchase order needs somebody to buy from, a price to buy at and a
 * quantity to buy. The sample and the finish code are not order-blocking, but
 * a schedule of finishes without them cannot be checked on site, so they are
 * reported at a lower weight.
 */
export function findBlockers(sel: MaterialSelection): Blocker[] {
  const out: Blocker[] = [];
  if (!sel.vendor || !String(sel.vendor).trim() || /^unknown/i.test(String(sel.vendor))) {
    out.push({ key: 'vendor', label: 'No vendor' });
  }
  if (!sel.quotedPrice || Number(sel.quotedPrice) <= 0) out.push({ key: 'rate', label: 'No rate' });
  if (!sel.estimatedQty || Number(sel.estimatedQty) <= 0) out.push({ key: 'qty', label: 'No quantity' });
  if (!sel.photos || sel.photos.length === 0) out.push({ key: 'sample', label: 'No sample' });
  if (!sel.finishCode || !String(sel.finishCode).trim()) out.push({ key: 'finish', label: 'No finish code' });
  return out;
}

/** Blockers that genuinely stop a purchase order, as opposed to weakening the record. */
export const ORDER_BLOCKING = new Set(['vendor', 'rate', 'qty']);

function parseDate(value?: string | number | null): Date | null {
  if (!value) return null;
  const d = new Date(value as any);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Whether the lead time still fits before the date the item is needed.
 *
 * Anchored on the target handover, falling back to the SOF freeze date, because
 * those are the two dates a studio actually commits to. With neither set there
 * is nothing to be late against and this returns null rather than inventing a
 * deadline.
 */
export function assessLeadTime(
  sel: MaterialSelection,
  ctx: Partial<ProjectContext> | undefined,
  now: Date = new Date(),
): LeadRisk | null {
  const lead = Number(sel.leadTimeDays) || 0;
  if (lead <= 0) return null;

  const anchor = parseDate((ctx as any)?.targetHandoverDate) || parseDate((ctx as any)?.sofFreezeDate);
  if (!anchor) return null;

  const orderBy = new Date(anchor.getTime() - lead * 86400000);
  const slack = Math.round((orderBy.getTime() - now.getTime()) / 86400000);

  if (slack < 0) return { level: 'late', orderBy, daysOfSlack: slack };
  if (slack <= 7) return { level: 'tight', orderBy, daysOfSlack: slack };
  return null;
}

/** How long the client has been sitting on a confirmation request. */
export function staleDaysFor(sel: MaterialSelection, now: Date = new Date()): number | null {
  if (normaliseStatus(sel.status) !== 'sent_for_approval') return null;
  const sent = parseDate(sel.confirmationSentAt);
  if (!sent) return null;
  return Math.max(0, Math.round((now.getTime() - sent.getTime()) / 86400000));
}

export function assess(
  sel: MaterialSelection,
  ctx?: Partial<ProjectContext>,
  now: Date = new Date(),
): SelectionAssessment {
  const status = normaliseStatus(sel.status);
  const blockers = findBlockers(sel);
  const leadRisk = assessLeadTime(sel, ctx, now);
  const staleDays = staleDaysFor(sel, now);

  let bucket: Bucket;
  if (LOCKED.has(status)) bucket = 'locked';
  else if (status === 'sent_for_approval') bucket = 'awaiting';
  else if (status === 'to_select' || !status) bucket = 'not_started';
  else bucket = blockers.some((b) => ORDER_BLOCKING.has(b.key)) ? 'blocked' : 'ready';

  // An item nobody is waiting on, that has everything it needs, is orderable —
  // whatever label the status happens to carry.
  if (bucket === 'not_started' && blockers.filter((b) => ORDER_BLOCKING.has(b.key)).length === 0) {
    bucket = 'ready';
  }

  return { bucket, blockers, leadRisk, staleDays };
}

export interface SofSummary {
  total: number;
  locked: number;
  ready: number;
  blocked: number;
  awaiting: number;
  notStarted: number;
  /** Items whose lead time no longer fits, or only just does. */
  atRisk: number;
  /** Items the client has held for more than a week. */
  stale: number;
  /** Every distinct order-blocking gap, most common first. */
  topGaps: { label: string; count: number }[];
}

export function summarise(
  list: MaterialSelection[],
  ctx?: Partial<ProjectContext>,
  now: Date = new Date(),
): SofSummary {
  const counts: Record<Bucket, number> = { locked: 0, ready: 0, blocked: 0, awaiting: 0, not_started: 0 };
  const gaps: Record<string, number> = {};
  let atRisk = 0, stale = 0;

  list.forEach((sel) => {
    const a = assess(sel, ctx, now);
    counts[a.bucket]++;
    if (a.leadRisk) atRisk++;
    if (a.staleDays !== null && a.staleDays >= 7) stale++;
    a.blockers.filter((b) => ORDER_BLOCKING.has(b.key)).forEach((b) => {
      gaps[b.label] = (gaps[b.label] || 0) + 1;
    });
  });

  return {
    total: list.length,
    locked: counts.locked,
    ready: counts.ready,
    blocked: counts.blocked,
    awaiting: counts.awaiting,
    notStarted: counts.not_started,
    atRisk,
    stale,
    topGaps: Object.entries(gaps).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  ready: 'Ready to order',
  blocked: 'Missing details',
  awaiting: 'With the client',
  not_started: 'Not chosen yet',
  locked: 'Confirmed',
};
