import { ProjectContext } from '../types';
import { ProjectPnl } from './projectPnl';

// ============================================================================
// WHAT IS HAMPERING THIS PROJECT
//
// Lagging numbers — margin, collections — tell you a job went wrong after it
// did. These are the conditions that make it go wrong, each computed from data
// the app already holds and each with a specific thing to go and do.
//
// Every signal states the evidence it is built on. A risk panel that cannot
// show its working gets ignored the third time it cries wolf.
// ============================================================================

export type RiskLevel = 'critical' | 'warning' | 'watch' | 'clear';

export interface RiskSignal {
  id: string;
  level: RiskLevel;
  title: string;
  /** Neutral name of the check, for when it passes. `title` names the problem,
      which reads as an alarm in a list of things that are fine. */
  check: string;
  /** What the number actually is, in words. */
  detail: string;
  /** Where to go and fix it. */
  route?: string;
  action?: string;
  /** 0-100, for the summary gauge. Higher is worse. */
  weight: number;
}

const DAY = 86400000;
const daysSince = (t?: number | string | null) => {
  if (!t) return null;
  const ms = typeof t === 'number' ? t : Date.parse(t);
  if (!ms || isNaN(ms)) return null;
  return Math.floor((Date.now() - ms) / DAY);
};

const inr = (n: number) =>
  n >= 10000000 ? `₹${(n / 10000000).toFixed(2)} Cr`
  : n >= 100000 ? `₹${(n / 100000).toFixed(1)} L`
  : `₹${Math.round(n).toLocaleString('en-IN')}`;

export interface RiskReport {
  signals: RiskSignal[];
  /** Only those needing attention, worst first. */
  active: RiskSignal[];
  /** 0-100. 0 is a clean project. */
  score: number;
  headline: string;
}

export function buildProjectRisk(context: ProjectContext | null | undefined, pnl: ProjectPnl): RiskReport {
  const ctx: any = context || {};
  const stage: number = ctx?.lifecycle?.stage || ctx?.currentStage || 1;
  const status: string = ctx?.status || '';

  /* A finished or abandoned job cannot be "held up". Once the project is
     closed, the forward-looking signals — unfrozen scope, an unsigned
     agreement, a silent portal, a slipping handover — are describing a race
     that is already over, and firing them buries the ones that still matter.
     Money still moves after handover, so cash, margin and snags stay live on a
     completed job; nothing stays live on one that was lost or archived. */
  const finished = status === 'completed';
  const abandoned = status === 'lost' || status === 'archived';
  const closed = finished || abandoned;
  const executing = stage >= 5 && !closed;
  const signals: RiskSignal[] = [];

  // ── 1. Decisions the client is sitting on ────────────────────────────────
  // Design cannot proceed past an unanswered decision, and every day of it
  // pushes the whole programme.
  {
    const decisions: any[] = ctx.projectDecisions || [];
    const waiting = decisions.filter(d =>
      d && d.status === 'pending' && d.notifiedAt && !d.clientConfirmedAt,
    );
    const ages = waiting.map(d => daysSince(d.notifiedAt) ?? 0);
    const oldest = ages.length ? Math.max(...ages) : 0;
    const level: RiskLevel = closed ? 'clear'
      : oldest >= 14 ? 'critical' : oldest >= 7 ? 'warning' : waiting.length > 0 ? 'watch' : 'clear';
    signals.push({
      id: 'decision-latency',
      level,
      title: 'Decisions waiting on the client',
      check: 'Client decisions',
      detail: closed
        ? 'Project is closed, so nothing is outstanding.'
        : waiting.length === 0
        ? 'Nothing is sitting with the client.'
        : `${waiting.length} sent and unanswered. Oldest is ${oldest} day${oldest === 1 ? '' : 's'} old.`,
      route: 'record-decision',
      action: 'Chase decisions',
      weight: level === 'critical' ? 25 : level === 'warning' ? 15 : level === 'watch' ? 6 : 0,
    });
  }

  // ── 2. Funding the client's job out of your own pocket ───────────────────
  // Committing more to vendors than has been collected is the single most
  // common way a profitable job still sinks a small studio.
  {
    const exposure = pnl.committedCost - pnl.receivedFromClient;
    const ratio = pnl.contractedTotal > 0 ? exposure / pnl.contractedTotal : 0;
    const level: RiskLevel = abandoned ? 'clear'
      : exposure <= 0 ? 'clear' : ratio >= 0.25 ? 'critical' : ratio >= 0.1 ? 'warning' : 'watch';
    signals.push({
      id: 'cash-exposure',
      level,
      title: 'Studio funding the job',
      check: 'Cash position',
      detail: exposure <= 0
        ? 'Collections are ahead of what has been committed to vendors.'
        : `${inr(exposure)} committed to vendors beyond what the client has paid.`,
      route: 'payment-calc',
      action: 'Raise the next invoice',
      weight: level === 'critical' ? 25 : level === 'warning' ? 15 : level === 'watch' ? 5 : 0,
    });
  }

  // ── 3. Building against an unfrozen scope ────────────────────────────────
  {
    const frozen = !!ctx.boqFrozen || !!ctx?.designGate?.gateActivated;
    const level: RiskLevel = closed ? 'clear'
      : executing && !frozen ? 'critical' : !frozen && stage >= 4 ? 'warning' : 'clear';
    signals.push({
      id: 'scope-not-frozen',
      level,
      title: 'Scope not frozen',
      check: 'Scope freeze',
      detail: closed
        ? 'Project is closed. Scope is settled either way.'
        : frozen
        ? 'BOQ is frozen, so extras have to be raised as variations.'
        : executing
          ? 'Site work is running against a BOQ that can still change. Extras will not be chargeable.'
          : 'The BOQ is not frozen yet. Freeze it at the Design Gate before site starts.',
      route: 'design-gate',
      action: 'Open Design Gate',
      weight: level === 'critical' ? 25 : level === 'warning' ? 10 : 0,
    });
  }

  // ── 4. Working without a signed contract ─────────────────────────────────
  {
    const signed = ctx?.executionSignoff?.status === 'signed' || ctx?.contractSignoff?.status === 'signed';
    const level: RiskLevel = closed ? 'clear'
      : executing && !signed ? 'critical' : stage >= 4 && !signed ? 'warning' : 'clear';
    signals.push({
      id: 'contract-unsigned',
      level,
      title: 'Execution agreement unsigned',
      check: 'Execution agreement',
      detail: closed
        ? (signed ? 'Signed and on file.' : 'Project closed without a signed agreement on file.')
        : signed
        ? 'Signed and on file.'
        : executing
          ? 'Work is on site with nothing signed. There is no contractual basis to bill or to enforce scope.'
          : 'Not yet signed. It should be before mobilisation.',
      route: 'execution-agreement',
      action: 'Send for signature',
      weight: level === 'critical' ? 20 : level === 'warning' ? 8 : 0,
    });
  }

  // ── 5. Margin slipping away from the quote ───────────────────────────────
  {
    const slip = pnl.hasProcurement ? pnl.quotedMargin - pnl.currentMargin : 0;
    const slipPct = pnl.quotedMargin > 0 ? slip / pnl.quotedMargin : 0;
    const level: RiskLevel =
      abandoned || !pnl.hasProcurement ? 'clear'
      : slipPct >= 0.25 ? 'critical'
      : slipPct >= 0.1 ? 'warning'
      : slip > 0 ? 'watch' : 'clear';
    signals.push({
      id: 'margin-erosion',
      level,
      title: 'Margin eroding',
      check: 'Margin vs quote',
      detail: !pnl.hasProcurement
        ? 'Nothing ordered yet, so there is nothing to compare against the quote.'
        : slip <= 0
          ? 'Costs are tracking at or under the quote.'
          : `${inr(slip)} of quoted margin has gone, ${Math.round(slipPct * 100)}% of what the job was meant to make.`,
      route: 'materials',
      action: 'Review purchase orders',
      weight: level === 'critical' ? 22 : level === 'warning' ? 12 : level === 'watch' ? 4 : 0,
    });
  }

  // ── 6. Snags ageing near handover ────────────────────────────────────────
  {
    const snags: any[] = ctx.snagList || [];
    const open = snags.filter(s => s && s.status !== 'resolved' && s.status !== 'verified');
    const ages = open.map(s => daysSince(s.raisedAt) ?? 0);
    const oldest = ages.length ? Math.max(...ages) : 0;
    const nearHandover = stage >= 6;
    const level: RiskLevel =
      abandoned || open.length === 0 ? 'clear'
      : nearHandover && open.length > 0 ? 'critical'
      : oldest >= 21 ? 'warning'
      : 'watch';
    signals.push({
      id: 'snags-open',
      level,
      title: 'Snags still open',
      check: 'Snag list',
      detail: open.length === 0
        ? 'No open defects.'
        : `${open.length} open, oldest ${oldest} day${oldest === 1 ? '' : 's'}${nearHandover ? '. Handover cannot be signed with these outstanding.' : '.'}`,
      route: 'site-ops',
      action: 'Open snag list',
      weight: level === 'critical' ? 18 : level === 'warning' ? 10 : level === 'watch' ? 4 : 0,
    });
  }

  // ── 7. Handover date under threat ────────────────────────────────────────
  {
    const target = ctx.targetHandoverDate ? Date.parse(ctx.targetHandoverDate) : null;
    const daysLeft = target && !isNaN(target) ? Math.ceil((target - Date.now()) / DAY) : null;
    const pct = ctx?.journeySummary?.pct ?? 0;
    const level: RiskLevel =
      closed || daysLeft == null ? 'clear'
      : daysLeft < 0 && pct < 100 ? 'critical'
      : daysLeft <= 30 && pct < 70 ? 'warning'
      : daysLeft <= 60 && pct < 50 ? 'watch'
      : 'clear';
    signals.push({
      id: 'handover-slip',
      level,
      title: 'Handover date at risk',
      check: 'Handover date',
      detail: finished
        ? 'Handed over.'
        : abandoned
        ? 'Project closed, so the handover date no longer applies.'
        : daysLeft == null
        ? 'No target handover date set, so slippage cannot be tracked.'
        : daysLeft < 0
          ? `Target passed ${Math.abs(daysLeft)} days ago with the journey at ${pct}%.`
          : `${daysLeft} days to target with the journey at ${pct}%.`,
      route: 'timeline',
      action: 'Open timeline',
      weight: level === 'critical' ? 20 : level === 'warning' ? 12 : level === 'watch' ? 5 : 0,
    });
  }

  // ── 8. The client cannot see anything ────────────────────────────────────
  {
    const updates: any[] = ctx.siteUpdates || [];
    const published = updates.filter(u => u && u.clientVisibility === 'published');
    const last = published.length
      ? Math.max(...published.map(u => Date.parse(u.date || u.createdAt) || 0))
      : null;
    const age = last ? daysSince(last) : null;
    const level: RiskLevel =
      !executing ? 'clear'
      : age == null ? 'warning'
      : age >= 21 ? 'critical'
      : age >= 10 ? 'warning'
      : 'clear';
    signals.push({
      id: 'client-dark',
      level,
      title: 'Client has gone dark',
      check: 'Client updates',
      detail: finished
        ? 'Project is handed over, so updates are no longer expected.'
        : abandoned
        ? 'Project is closed.'
        : !executing
        ? 'Not in execution, so site updates are not expected yet.'
        : age == null
          ? 'Nothing has ever been published to the portal during execution.'
          : `Last published update was ${age} days ago.`,
      route: 'client-portal',
      action: 'Publish an update',
      weight: level === 'critical' ? 15 : level === 'warning' ? 8 : 0,
    });
  }

  const active = signals
    .filter(s => s.level !== 'clear')
    .sort((a, b) => b.weight - a.weight);

  const score = Math.min(100, signals.reduce((s, x) => s + x.weight, 0));
  const crit = active.filter(s => s.level === 'critical').length;

  const headline =
    score === 0 && finished ? 'Handed over and clear.'
    : score === 0 && abandoned ? 'Project is closed.'
    : score === 0 ? 'Nothing is holding this project up.'
    : crit > 0 ? `${crit} thing${crit === 1 ? '' : 's'} actively holding this project up.`
    : `${active.length} thing${active.length === 1 ? '' : 's'} worth watching.`;

  return { signals, active, score, headline };
}

export const RISK_TONE: Record<RiskLevel, { text: string; bg: string; border: string; dot: string }> = {
  critical: { text: 'text-rose-800',    bg: 'bg-rose-50',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  warning:  { text: 'text-amber-800',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  watch:    { text: 'text-sky-800',     bg: 'bg-sky-50',     border: 'border-sky-200',     dot: 'bg-sky-500' },
  clear:    { text: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};
