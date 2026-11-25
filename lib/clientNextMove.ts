/*
  NEXT MOVE: what one client is waiting for, and the message to send.

  The Clients screen (DESIGN.md "Clients: conversations") shows it on the
  client card and preselects its template in the composer. The rules, first
  match wins:

    1. They owe, and a milestone is overdue more than 15 days → chase it.
    2. Dormant → reopen it or let it go.
    3. In the pipeline and quiet for 10 days or more → worth a call.
    4. Delivered → ask for the referral.
    5. Live (won, on site or paused) → keep the updates going.
    6. Otherwise → move it along.

  "Due" is the invoice date for an invoiced milestone and the planned date for
  one not yet invoiced. A milestone held in an open payment dispute is owed but
  not chased (lib/disputes). Nothing here is a figure: the money stays on the
  card's Money section, for the roles that see it.

  Pure, so the tests run it.
*/
import type { ClientMilestone } from './clientMoney';
import type { ClientBucket } from './clientGroups';

/** The four WhatsApp templates on the Clients screen, by id. */
export type TemplateId = 'update' | 'review' | 'milestone' | 'touchpoint';

export interface NextMove {
  label: string;
  /** One line under the label saying why, when there is more to say. */
  why: string | null;
  template: TemplateId;
  tone: 'warn' | 'go' | 'plain';
}

export interface NextMoveInput {
  bucket: ClientBucket;
  /** Their milestones, across their projects. Amounts are not read. */
  milestones: ClientMilestone[];
  /** Days since the studio last logged contact; null when nothing is logged. */
  quietDays: number | null;
  /** Portal visits since our last message, once visits are recorded. */
  portalOpensSinceLastMessage?: number;
  now: number;
}

const DAY = 24 * 60 * 60 * 1000;
export const CHASE_AFTER_DAYS = 15;
export const QUIET_AFTER_DAYS = 10;

const isPaid = (status: string) => status === 'paid' || status === 'received';

/** When an unpaid milestone fell due: the invoice date once invoiced, else its planned date. */
export function dueAtOf(m: Pick<ClientMilestone, 'status' | 'invoiceDate' | 'date'>): number | null {
  if (isPaid(m.status)) return null;
  const raw = m.status === 'invoiced' ? m.invoiceDate : m.date;
  const t = raw ? Date.parse(raw.length === 10 ? `${raw}T00:00:00+05:30` : raw) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** They owe now: an invoice raised and not yet paid. */
export const owesNow = (milestones: ClientMilestone[]): boolean =>
  milestones.some((m) => m.status === 'invoiced');

/** The most days any unpaid milestone not under dispute is past due; 0 when none is. */
export function overdueDays(milestones: ClientMilestone[], now: number): number {
  let most = 0;
  for (const m of milestones) {
    if (m.disputed) continue;
    const due = dueAtOf(m);
    if (due == null) continue;
    most = Math.max(most, Math.floor((now - due) / DAY));
  }
  return most;
}

const times = (n: number) => (n === 1 ? 'once' : `${n} times`);

export function nextMove(i: NextMoveInput): NextMove {
  const overdue = overdueDays(i.milestones, i.now);
  if (owesNow(i.milestones) && overdue > CHASE_AFTER_DAYS) {
    return { label: 'Invoice out — chase the payment', why: `A payment is ${overdue} days past due.`, template: 'milestone', tone: 'warn' };
  }
  if (i.bucket === 'lost') {
    return { label: 'Dormant — reopen it or let it go', why: null, template: 'touchpoint', tone: 'plain' };
  }
  if (i.bucket === 'pipeline' && (i.quietDays == null || i.quietDays >= QUIET_AFTER_DAYS)) {
    const opens = i.portalOpensSinceLastMessage || 0;
    return {
      label: i.quietDays == null ? 'No contact logged yet — worth a call' : `Quiet ${i.quietDays} days — worth a call`,
      why: opens > 0 ? `Opened the portal ${times(opens)} since your last message.` : null,
      template: 'review',
      tone: 'warn',
    };
  }
  if (i.bucket === 'delivered') {
    return { label: 'Delivered — ask for the referral', why: null, template: 'touchpoint', tone: 'plain' };
  }
  if (i.bucket === 'active') {
    return { label: 'On site — keep the updates going', why: null, template: 'update', tone: 'go' };
  }
  return { label: 'In the pipeline — move it along', why: null, template: 'review', tone: 'go' };
}
