import { PaymentAdvance, PaymentMilestone, PaymentSchedule, ProjectContext } from '../types';

/**
 * WHAT THE PAYMENT SCHEDULE PAGE NEEDS TO KNOW ABOUT ITSELF.
 *
 * Three questions the page used to answer badly, or not at all:
 *
 *   1. Has each stage been paid? The schedule froze each advance's status at
 *      the moment it was generated, so a stage paid last week still read
 *      "pending". The live answer is on `paymentMilestones` (Money), which is
 *      where the studio raises invoices and marks them paid.
 *   2. Is the execution value still moving? While the design phase runs the
 *      BOQ is not frozen, so every execution amount on the schedule is an
 *      estimate. The client should be told so on the document itself.
 *   3. Which version comes next? Once the client holds a version, the next
 *      draft has to be numbered above it, or v1 is "revised" into another v1.
 */

// ---------------------------------------------------------------------------
// PAYMENT STATUS PER STAGE
// ---------------------------------------------------------------------------

export type AdvancePaymentState = 'cleared' | 'invoiced' | 'pending';

export interface AdvancePaymentStatus {
  state: AdvancePaymentState;
  /** Short, client-safe wording for the Status column. */
  label: string;
  /** The day it was marked paid, or the invoice date, when known. */
  date?: string | null;
  /** The invoice number, when one was raised. */
  invoiceRef?: string | null;
}

const stripGross = (s: string | undefined) => (s || '').replace(' (Gross)', '').trim().toLowerCase();

/** Which milestone a schedule stage was generated from. */
export function milestoneForAdvance(
  adv: PaymentAdvance,
  milestones: PaymentMilestone[] | undefined
): PaymentMilestone | null {
  const list = milestones || [];
  if (!list.length) return null;

  const byId = (adv as any).milestoneId ? list.find(m => m.id === (adv as any).milestoneId) : undefined;
  if (byId) return byId;

  const type: PaymentMilestone['type'] = adv.phase === 'design' ? 'design' : 'execution';
  const ofType = list.filter(m => m.type === type);

  const label = stripGross(adv.label);
  const named = ofType.filter(m => stripGross(m.name) === label);
  if (named.length === 1) return named[0];

  /* Codes were handed out in order within a phase (D1, D2 … / E1, E2 …), so
     the number in the code is the stage's position among that phase's
     milestones. */
  const n = parseInt((adv.advanceCode || '').replace(/\D/g, ''), 10);
  if (n > 0 && n <= ofType.length) return ofType[n - 1];
  return named[0] || null;
}

/**
 * The live payment status of one stage.
 *
 * The milestone wins: it is where payments are recorded. A schedule with no
 * matching milestone falls back to the status frozen on the advance itself.
 */
export function advancePaymentStatus(
  adv: PaymentAdvance,
  milestones: PaymentMilestone[] | undefined
): AdvancePaymentStatus {
  const m = milestoneForAdvance(adv, milestones);
  const raw: string | undefined = m ? m.status : adv.status === 'received' ? 'paid' : adv.status === 'advance_requested' ? 'invoiced' : 'pending';

  if (raw === 'paid') {
    return {
      state: 'cleared',
      label: 'Cleared',
      date: m?.paidDate || m?.invoiceDate || (adv.receivedAt ? new Date(adv.receivedAt).toISOString().slice(0, 10) : null),
      invoiceRef: m?.invoiceNumber || adv.invoiceRef || null
    };
  }
  if (raw === 'invoiced') {
    return {
      state: 'invoiced',
      label: 'Invoiced',
      date: m?.invoiceDate || null,
      invoiceRef: m?.invoiceNumber || adv.invoiceRef || null
    };
  }
  return { state: 'pending', label: 'Pending', date: null, invoiceRef: null };
}

/** "2026-11-12" → "12 Nov 2026". Anything unparseable comes back as given. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// PROVISIONAL EXECUTION VALUE
// ---------------------------------------------------------------------------

export const DEFAULT_PROVISIONAL_NOTE =
  'The design phase is in progress. Execution amounts in this schedule are based on the current estimate and may change once the BOQ is finalised. A revised schedule will be issued for your confirmation if they do.';

/** While the BOQ is not frozen, the execution value is still an estimate. */
export function designInProgress(ctx: ProjectContext | null | undefined): boolean {
  const c = (ctx || {}) as any;
  return !c.boqFrozen && !c.operativeBoqVersion;
}

/**
 * The note printed under the execution table, or null for none.
 *
 * `provisionalNote` on a schedule is three-valued:
 *   - undefined: the studio has not chosen, so the note shows while the design
 *     phase is in progress, in the default wording;
 *   - null or '': the studio switched it off;
 *   - text: the studio's own wording, shown as written.
 */
export function resolveProvisionalNote(
  schedule: Pick<PaymentSchedule, 'provisionalNote'> | null | undefined,
  ctx: ProjectContext | null | undefined
): string | null {
  const v = schedule?.provisionalNote;
  if (v === undefined) return designInProgress(ctx) ? DEFAULT_PROVISIONAL_NOTE : null;
  const text = (v || '').trim();
  return text ? text : null;
}

// ---------------------------------------------------------------------------
// VERSIONING
// ---------------------------------------------------------------------------

/**
 * The version number the client already holds, 0 when they hold none.
 *
 * A schedule can reach the client three ways: marked sent on the page, frozen
 * into a document issue from the Documents board, or locked into the
 * engagement on the older flow. Whichever is highest is what they have.
 */
export function heldScheduleVersion(
  schedules: PaymentSchedule[] | undefined,
  issued: { scheduleVersion?: number | null; lockedVersion?: number | null }
): number {
  const sent = (schedules || [])
    .filter(s => s.status !== 'draft')
    .reduce((m, s) => Math.max(m, s.version || 0), 0);
  return Math.max(sent, issued.scheduleVersion || 0, issued.lockedVersion || 0);
}

/**
 * The number for the next draft: the open draft keeps its own number while it
 * is still above what the client holds; otherwise it goes one above.
 */
export function nextScheduleVersion(
  schedules: PaymentSchedule[] | undefined,
  held: number
): number {
  const draft = (schedules || []).find(s => s.status === 'draft');
  if (draft && draft.version > held) return draft.version;
  const highest = (schedules || []).reduce((m, s) => Math.max(m, s.version || 0), 0);
  return Math.max(highest, held) + 1;
}
