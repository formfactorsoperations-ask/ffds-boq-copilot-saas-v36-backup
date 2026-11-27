import type { PaymentMilestone, DrawingTrackerItem } from '../types';
import type { ClientMoney } from './clientMoney';
import type { HubAlert } from './hubAlerts';
import type { ProjectPnl } from './projectPnl';
import { buildProjectRisk } from './projectRisk';
import { billableNow, collections, contractDrift, paymentBehaviour, DEFAULT_ESCALATION, type ChaseLevel, type EscalationThresholds } from './moneyIntel';
import { clientCopiesBehind, type ImpactStep } from './scheduleImpact';
import { summariseRisk } from './drawingIntel';
import { conversationOf, type ConversationId } from './projectConversations';

/*
  WHAT IS WRONG IN EACH CONVERSATION (smart workspace, PR 1; owner, 27 Nov
  2026: "mainly for owners and project leads", "yes you can use coloured
  reason").

  The Conversations workspace used to say what happened and what is next. This
  says what is at risk, in the conversation that owns the screen to fix it,
  from rules the app already has and tests:

    lib/projectRisk     decisions the client sits on, scope not frozen, an
                        unsigned agreement, snags, the handover date, a client
                        who sees nothing;
    lib/hubAlerts       the portal behind what was published, figures on it
                        out of date, a client question unanswered, a dispute;
    lib/moneyIntel      invoices past the chase ladder, work earned and not
                        invoiced, a schedule that no longer adds up to 100%;
    lib/scheduleImpact  copies the client holds that are older than the schedule;
    lib/drawingIntel    drawings past or near their target date.

  Nothing here writes or sends. Every signal opens the screen that owns it, and
  the conversation a signal shows in is the one that screen lives in
  (lib/projectConversations conversationOf), so a role that cannot open that
  screen never sees the signal. Rose is late; amber is someone's turn. A "watch"
  from projectRisk is left out: on a list, a line that is not yet a problem is
  noise.

  Pure, so the tests run it.
*/

export type SignalTone = 'late' | 'turn';

export interface Signal {
  id: string;
  conv: ConversationId;
  /** The screen that owns it. */
  route: string;
  tone: SignalTone;
  /** One short line for the conversation list. Never an amount: amounts sit behind the hide-figures eye on the cards. */
  line: string;
  /** The evidence, for Watch-outs. */
  detail: string;
  /** Sorts within a tone; late always sorts above turn. */
  weight: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/*
  projectRisk takes the project's P&L for its two money checks (cash exposure,
  margin). Those need purchase orders and the BOQ, which this view does not
  load, and they belong to PR 5 (margin pulse). With a P&L of nothing ordered
  and nothing received both read "clear", and every other check runs exactly
  as it does on Reports.
*/
const NO_PNL = {
  hasProcurement: false, committedCost: 0, receivedFromClient: 0, contractedTotal: 0, quotedMargin: 0, currentMargin: 0,
} as unknown as ProjectPnl;

const milestonesOf = (ctx: any): PaymentMilestone[] => (Array.isArray(ctx?.paymentMilestones) ? ctx.paymentMilestones : []);

/* ───────────── money ───────────── */

export interface MoneyLine { id: string; name: string; amount: number | null; days: number; level: ChaseLevel }
export interface MoneyPicture {
  /** Invoiced and unpaid, worst first; disputed invoices are left out (the dispute is said once). */
  unpaid: MoneyLine[];
  unpaidTotal: number | null;
  /** Work shown to be done (every sub-step ticked, or its date passed) and not yet invoiced. */
  earned: Array<{ id: string; name: string; amount: number | null; reason: string }>;
  earnedTotal: number | null;
  /** The milestone each track has reached, when nothing is shown to be done yet. */
  nextToBill: { name: string; amount: number | null } | null;
  /** The schedule's stages no longer add up to 100%. */
  drift: { design: number | null; execution: number | null } | null;
  /** Days from invoice to payment on this project, from at least two paid stages. */
  pays: { meanDays: number; settled: number } | null;
  /** Amounts are hidden (a role without them, or the figures taken out). */
  hidden: boolean;
}

/**
 * The Money conversation's card: what is late, what is earned and not
 * invoiced, whether the schedule adds up, and how this client pays. Amounts are
 * the client's side (lib/clientMoney), as their portal and invoices show them;
 * the studio's costs are not in it.
 */
export function moneyPicture(ctx: any, money: ClientMoney | null, opts: { now?: number; thresholds?: EscalationThresholds } = {}): MoneyPicture | null {
  const ms = milestonesOf(ctx);
  if (!money || !ms.length) return null;
  const now = opts.now ?? Date.now();
  const hidden = !!money.amountsHidden;
  const owed = new Map(money.milestones.map((m) => [m.id, m.owed]));
  const amountOf = (id: string) => (hidden ? null : owed.get(id) ?? null);

  /* collections() skips an invoice with no amount, so a hidden figure is passed as 1 and never shown. */
  const invoiced = money.milestones
    .filter((m) => m.status === 'invoiced' && !m.disputed)
    .map((m) => ({ id: m.id, name: m.name, amount: hidden ? 1 : m.owed || 1, invoicedAt: m.invoiceDate, invoiceNumber: m.invoiceNumber }));
  const chase = collections([], invoiced, opts.thresholds || DEFAULT_ESCALATION, now);
  const unpaid = chase.items.map((i) => ({ id: i.id, name: i.label, amount: amountOf(i.id), days: i.daysOutstanding, level: i.level }));

  const bill = billableNow(ms, (m) => (hidden ? 1 : owed.get(m.id) || 0), now);
  const earned = bill.items.filter((i) => i.earned).map((i) => ({ id: i.id, name: i.name, amount: amountOf(i.id), reason: i.reason }));
  const firstNext = bill.items.find((i) => !i.earned) || null;

  const d = contractDrift(ctx?.financials?.paymentRevisions, ms);
  const drift = d.designBalanced && d.executionBalanced ? null
    : { design: d.designBalanced ? null : d.designPct, execution: d.executionBalanced ? null : d.executionPct };

  const settled = ms
    .filter((m) => m.status === 'paid' && m.invoiceDate && m.paidDate)
    .map((m) => ({ id: m.id, triggeredAt: m.invoiceDate, receivedAt: m.paidDate, status: 'received' }));
  const b = paymentBehaviour(settled as any, now);

  const sum = (xs: Array<{ amount: number | null }>) => (hidden ? null : xs.reduce((s, x) => s + (x.amount || 0), 0));
  return {
    unpaid,
    unpaidTotal: sum(unpaid),
    earned,
    earnedTotal: sum(earned),
    nextToBill: !earned.length && firstNext ? { name: firstNext.name, amount: amountOf(firstNext.id) } : null,
    drift,
    pays: b.settled >= 2 && b.meanDays != null ? { meanDays: Math.round(b.meanDays), settled: b.settled } : null,
    hidden,
  };
}

/* ───────────── the ripple ───────────── */

/**
 * What the client holds that is older than the payment schedule, in the order
 * to bring it up to date (lib/scheduleImpact, the same steps Money shows).
 */
export function rippleSteps(ctx: any): ImpactStep[] {
  const ms = milestonesOf(ctx);
  if (!ms.length) return [];
  try { return clientCopiesBehind(ctx, ms); } catch { return []; }
}

/** Where a ripple step's button goes in the workspace: Money's "Generate" is done on the Money screen. */
export const rippleRoute = (s: ImpactStep): string => ('tab' in s.go ? s.go.tab : 'payment-calc');

/* ───────────── all of it ───────────── */

export interface SignalInput {
  context: any;
  money: ClientMoney | null;
  /** lib/hubAlerts for this project (components/ops/useHubAlerts). */
  alerts: HubAlert[];
  /** The Drawing Tracker's rows; null while they load or when the person cannot read them. */
  drawings: DrawingTrackerItem[] | null;
  now?: number;
  thresholds?: EscalationThresholds;
}

/** Every signal on the project, worst first: late before your turn, then by weight. */
export function projectSignals(i: SignalInput): Signal[] {
  const ctx = i.context || {};
  const now = i.now ?? Date.now();
  const out: Signal[] = [];
  const push = (s: Omit<Signal, 'conv'>) => {
    const conv = conversationOf(s.route);
    if (conv) out.push({ ...s, conv });
  };

  /* The project's own risk checks, as Reports shows them. */
  try {
    for (const r of buildProjectRisk(ctx, NO_PNL).active) {
      if (!r.route || (r.level !== 'critical' && r.level !== 'warning')) continue;
      push({ id: `risk-${r.id}`, route: r.route, tone: r.level === 'critical' ? 'late' : 'turn', line: r.title, detail: r.detail, weight: r.weight });
    }
  } catch { /* a project too old for a check: the others still run */ }

  /* The portal and the client's questions (the Hub's alerts). Unpaid invoices are said below, with their days. */
  for (const a of i.alerts || []) {
    if (a.id === 'invoiced') continue;
    const weight = a.id === 'dispute' ? 16 : a.id === 'drafts' ? 4 : 14;
    push({ id: `alert-${a.id}`, route: a.goTo, tone: 'turn', line: a.title, detail: [a.detail, a.when].filter(Boolean).join(' · '), weight });
  }

  /* Money: invoices past the chase ladder, work done and not invoiced, a schedule that no longer adds up. */
  const mp = moneyPicture(ctx, i.money, { now, thresholds: i.thresholds });
  if (mp) {
    const worst = mp.unpaid[0];
    if (worst && worst.level >= 1) {
      const more = mp.unpaid.filter((u) => u.level >= 1).length - 1;
      push({
        id: 'money-unpaid', route: 'payment-calc', tone: worst.level >= 2 ? 'late' : 'turn',
        line: `${worst.name} unpaid ${plural(worst.days, 'day')}`,
        detail: `Invoiced ${plural(worst.days, 'day')} ago and not paid${more > 0 ? `, and ${plural(more, 'other invoice')} past terms` : ''}.`,
        weight: worst.level >= 2 ? 22 : 12,
      });
    }
    if (mp.earned.length) {
      const first = mp.earned[0];
      push({
        id: 'money-earned', route: 'payment-calc', tone: 'turn',
        line: mp.earned.length === 1 ? `${first.name}: earned, not invoiced` : `${plural(mp.earned.length, 'stage')} earned, not invoiced`,
        detail: `${first.name}: ${first.reason}, and no invoice raised yet.`,
        weight: 11,
      });
    }
    if (mp.drift) {
      const parts = [mp.drift.design != null && `design stages add up to ${mp.drift.design}%`, mp.drift.execution != null && `execution stages add up to ${mp.drift.execution}%`].filter(Boolean);
      push({ id: 'money-drift', route: 'payment-calc', tone: 'turn', line: 'Payment stages do not add up to 100%', detail: `The ${parts.join(' and the ')}.`, weight: 12 });
    }
  }
  const ripple = rippleSteps(ctx);
  if (ripple.length) {
    push({
      id: 'ripple', route: 'payment-calc', tone: 'turn', line: 'Client holds an older payment schedule',
      detail: `${plural(ripple.length, 'step')} to bring what the client holds up to date, starting with: ${ripple[0].title.toLowerCase()}.`,
      weight: 13,
    });
  }

  /* Drawings past or near their target date. */
  if (i.drawings && i.drawings.length) {
    const r = summariseRisk(i.drawings, now);
    const first = r.queue[0]?.name;
    if (r.overdue) {
      push({ id: 'drawings-overdue', route: 'drawing-tracker', tone: 'late', line: `${plural(r.overdue, 'drawing')} past the target date`, detail: first ? `${first} is the furthest behind.` : '', weight: 15 });
    } else if (r.dueSoon) {
      push({ id: 'drawings-soon', route: 'drawing-tracker', tone: 'turn', line: `${plural(r.dueSoon, 'drawing')} due within a week`, detail: first ? `${first} is due first.` : '', weight: 6 });
    }
  }

  /* One signal per id (projectRisk and hubAlerts never share one, but a future rule might). */
  const seen = new Set<string>();
  return out
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .sort((a, b) => (a.tone === b.tone ? b.weight - a.weight : a.tone === 'late' ? -1 : 1));
}

/** The worst signal in one conversation; Whole project has none of its own (Watch-outs gathers them). */
export function signalOf(signals: Signal[], conv: ConversationId): Signal | null {
  if (conv === 'whole') return null;
  return signals.find((s) => s.conv === conv) || null;
}
