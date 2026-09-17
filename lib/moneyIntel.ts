import { PaymentMilestone, PaymentRevision } from '../types';

/*
  What the money screen knows but has never said out loud.

  Four questions decide whether a project is actually collecting: who is
  late and by how much, what has been earned but not yet invoiced, what is
  due to arrive and when, and whether the schedule still adds up to the
  contract it was written against. Every field needed is already stored —
  milestone dates and statuses, payment-request timestamps and escalation
  levels, the revision log — none of it was being read.

  Amounts are NOT computed here. The Money screen derives milestone values
  through a long chain of taxable bases, discounts, fixed-amount overrides
  and tier selection; duplicating that would guarantee the two drift apart.
  Callers pass `amountOf` and this module stays about timing and state.
*/

const DAY = 86_400_000;

export function msOf(val: any): number {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'object') {
        if (typeof val.seconds === 'number') return val.seconds * 1000;
        if (typeof val.toDate === 'function') {
            const d = val.toDate();
            return d instanceof Date ? d.getTime() : 0;
        }
    }
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
}

const dayDiff = (from: number, to: number) =>
    from && to ? Math.floor((to - from) / DAY) : 0;

/** Anything shaped like a payment request; kept loose so the hook's type is not a dependency. */
export interface RequestLike {
    id: string;
    milestoneLabel?: string;
    amount?: number | null;
    status?: 'pending' | 'overdue' | 'received' | string;
    triggeredAt?: any;
    overdueAt?: any;
    reminderCount?: number;
    lastReminderAt?: any;
    escalationLevel?: 0 | 1 | 2 | 3;
}

export interface EscalationThresholds {
    reminderDays: number;
    warnDays: number;
    pauseDays: number;
}

export const DEFAULT_ESCALATION: EscalationThresholds = {
    reminderDays: 7,
    warnDays: 14,
    pauseDays: 30,
};

// ── who is late ──────────────────────────────────────────────────────────

export type ChaseLevel = 0 | 1 | 2 | 3;

export const CHASE_LABEL: Record<ChaseLevel, string> = {
    0: 'Within terms',
    1: 'Reminder due',
    2: 'Needs a call',
    3: 'Hold the work',
};

export interface ChaseItem {
    id: string;
    label: string;
    amount: number | null;
    daysOutstanding: number;
    level: ChaseLevel;
    remindersSent: number;
    daysSinceReminder: number | null;
}

export interface Collections {
    items: ChaseItem[];
    /** Anything past the reminder threshold. */
    chaseNow: number;
    amountOutstanding: number;
    amountOverdue: number;
    worst: ChaseItem | null;
    thresholds: EscalationThresholds;
}

/**
 * The ladder the studio already configured, applied to what is actually open.
 *
 * `useEscalationProtocol` computes these same levels and writes them back to
 * Firestore, but nothing has ever displayed them. This derives the level from
 * the timestamps so the screen is correct whether or not that job has run.
 */
export function collections(
    requests: RequestLike[],
    thresholds: EscalationThresholds = DEFAULT_ESCALATION,
    now = Date.now(),
): Collections {
    const open = (requests || []).filter(r => r.status === 'pending' || r.status === 'overdue');

    const items: ChaseItem[] = open.map(r => {
        const since = msOf(r.triggeredAt);
        const days = since ? dayDiff(since, now) : 0;
        let level: ChaseLevel = 0;
        if (since) {
            if (days >= thresholds.pauseDays) level = 3;
            else if (days >= thresholds.warnDays) level = 2;
            else if (days >= thresholds.reminderDays) level = 1;
        }
        const lastRem = msOf(r.lastReminderAt);
        return {
            id: r.id,
            label: r.milestoneLabel || 'Payment',
            amount: r.amount ?? null,
            daysOutstanding: days,
            level,
            remindersSent: r.reminderCount || 0,
            daysSinceReminder: lastRem ? dayDiff(lastRem, now) : null,
        };
    });

    // Worst first: the one to deal with before the others.
    items.sort((a, b) => (b.level - a.level) || (b.daysOutstanding - a.daysOutstanding));

    return {
        items,
        chaseNow: items.filter(i => i.level >= 1).length,
        amountOutstanding: items.reduce((s, i) => s + (i.amount || 0), 0),
        amountOverdue: items.filter(i => i.level >= 1).reduce((s, i) => s + (i.amount || 0), 0),
        worst: items[0] || null,
        thresholds,
    };
}

// ── what has been earned but not invoiced ────────────────────────────────

export interface BillableItem {
    id: string;
    name: string;
    type: 'design' | 'execution';
    amount: number;
    /** Why it is up for billing. */
    reason: string;
    /** True when the work is demonstrably done, not merely next in line. */
    earned: boolean;
}

export interface Billable {
    items: BillableItem[];
    total: number;
    /** Of `total`, the part backed by completed work rather than sequence. */
    earnedTotal: number;
}

/**
 * What is up for billing next, and how strong the claim is.
 *
 * The first version of this asked for completed sub-steps or a past date.
 * That was wrong for this app: milestones here carry neither by default —
 * every one of a real project's seven had `subSteps: []` and `date: null` —
 * so the rule could never fire on the data it was written for.
 *
 * Billing in this model runs in sequence per track, and the screen already
 * encodes that as `firstPendingIndex`: the first milestone that is not paid
 * or invoiced is the one due. That is the primary signal here. Sub-steps and
 * dates still count, and are marked `earned`, because those are evidence the
 * work is actually done rather than simply next in the queue.
 */
export function billableNow(
    milestones: PaymentMilestone[],
    amountOf: (m: PaymentMilestone) => number,
    now = Date.now(),
): Billable {
    const list = milestones || [];
    const open = (m: PaymentMilestone) => m.status !== 'invoiced' && m.status !== 'paid';

    const items: BillableItem[] = [];
    const seen = new Set<string>();

    const push = (m: PaymentMilestone, reason: string, earned: boolean) => {
        if (seen.has(m.id)) return;
        const amount = amountOf(m);
        if (!amount) return;
        seen.add(m.id);
        items.push({ id: m.id, name: m.name, type: m.type, amount, reason, earned });
    };

    // Explicit evidence first, so it wins the reason when both apply.
    for (const m of list) {
        if (!open(m)) continue;

        const steps = m.subSteps || [];
        if (steps.length > 0 && steps.every(s => s.isDone)) {
            push(m, 'every sub-step ticked', true);
            continue;
        }

        const due = m.date ? new Date(m.date + 'T00:00:00').getTime() : 0;
        if (due && !isNaN(due) && due <= now) {
            push(m, m.trigger ? `${m.trigger} — date passed` : 'scheduled date passed', true);
        }
    }

    // Then whichever milestone each track has reached.
    for (const type of ['design', 'execution'] as const) {
        const track = list.filter(m => m.type === type);
        const next = track.find(open);
        if (next) push(next, `next in the ${type} track`, false);
    }

    items.sort((a, b) => (Number(b.earned) - Number(a.earned)) || (b.amount - a.amount));

    return {
        items,
        total: items.reduce((s, i) => s + i.amount, 0),
        earnedTotal: items.filter(i => i.earned).reduce((s, i) => s + i.amount, 0),
    };
}

// ── what is due to arrive, and when ──────────────────────────────────────

export interface RunwayMonth {
    key: string;      // YYYY-MM
    label: string;    // "Oct 26"
    expected: number;
    cumulative: number;
    isPast: boolean;
}

export interface Runway {
    months: RunwayMonth[];
    scheduled: number;
    /** Milestones with no date — money that cannot be forecast at all. */
    undated: number;
    undatedAmount: number;
    peak: number;
}

export function runway(
    milestones: PaymentMilestone[],
    amountOf: (m: PaymentMilestone) => number,
    now = Date.now(),
): Runway {
    const buckets = new Map<string, number>();
    let undated = 0;
    let undatedAmount = 0;
    let scheduled = 0;

    for (const m of milestones || []) {
        if (m.status === 'paid') continue;
        const amount = amountOf(m);
        if (!amount) continue;

        if (!m.date) {
            undated++;
            undatedAmount += amount;
            continue;
        }
        const t = new Date(m.date + 'T00:00:00');
        if (isNaN(t.getTime())) {
            undated++;
            undatedAmount += amount;
            continue;
        }
        const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
        buckets.set(key, (buckets.get(key) || 0) + amount);
        scheduled += amount;
    }

    const thisMonth = new Date(now);
    const nowKey = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}`;

    const months: RunwayMonth[] = [];
    let cumulative = 0;
    for (const key of Array.from(buckets.keys()).sort()) {
        const expected = buckets.get(key) || 0;
        cumulative += expected;
        const [y, mo] = key.split('-');
        const d = new Date(Number(y), Number(mo) - 1, 1);
        months.push({
            key,
            label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
            expected,
            cumulative,
            isPast: key < nowKey,
        });
    }

    return {
        months,
        scheduled,
        undated,
        undatedAmount,
        peak: months.reduce((mx, m) => Math.max(mx, m.expected), 0),
    };
}

// ── how this client actually pays ────────────────────────────────────────

export interface PaymentBehaviour {
    /** Requests that were raised and then settled — the only ones measurable. */
    settled: number;
    /** Raised and still open. */
    open: number;
    meanDays: number | null;
    fastestDays: number | null;
    slowestDays: number | null;
}

/**
 * Days between asking and being paid.
 *
 * Only a request that carries both a trigger time and a receipt can be
 * measured, so `settled` is the sample size and is always shown next to the
 * average — "22 days" off one payment is not a pattern, and the screen should
 * not let it read like one.
 */
export function paymentBehaviour(requests: RequestLike[], now = Date.now()): PaymentBehaviour {
    const list = requests || [];
    const spans: number[] = [];

    for (const r of list) {
        const from = msOf(r.triggeredAt);
        const to = msOf((r as any).receivedAt);
        if (!from || !to || to < from) continue;
        spans.push(Math.max(0, Math.round((to - from) / DAY)));
    }

    const open = list.filter(r => r.status === 'pending' || r.status === 'overdue').length;

    if (spans.length === 0) {
        return { settled: 0, open, meanDays: null, fastestDays: null, slowestDays: null };
    }

    return {
        settled: spans.length,
        open,
        meanDays: spans.reduce((a, b) => a + b, 0) / spans.length,
        fastestDays: Math.min(...spans),
        slowestDays: Math.max(...spans),
    };
}

/** The same measure taken across a set of projects, for comparison. */
export interface Benchmark {
    projects: number;
    settled: number;
    meanDays: number | null;
}

export function benchmarkOf(perProject: RequestLike[][]): Benchmark {
    const spans: number[] = [];
    let projects = 0;
    for (const reqs of perProject || []) {
        const b = paymentBehaviour(reqs);
        if (b.settled > 0) {
            projects++;
            // Re-expand so every payment weighs the same, not every project.
            for (const r of reqs) {
                const from = msOf(r.triggeredAt);
                const to = msOf((r as any).receivedAt);
                if (from && to && to >= from) spans.push(Math.round((to - from) / DAY));
            }
        }
    }
    return {
        projects,
        settled: spans.length,
        meanDays: spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null,
    };
}

// ── dates from the programme ─────────────────────────────────────────────

export interface PhaseLike {
    stepNumber: number;
    title?: string;
    startDate?: string;
    endDate?: string;
}

export interface StepLike {
    stepNumber: number;
    title?: string;
    triggersMilestoneLabel?: string | null;
}

export interface SettingsMilestoneLike {
    label: string;
    trigger?: string;
}

export interface DerivedDate {
    id: string;
    name: string;
    date: string;
    /** The phase the date came from. */
    from: string;
    /** `mapped` = the studio configured this step to trigger this milestone.
     *  `placed` = positioned on the programme by where it falls in the schedule. */
    how: 'mapped' | 'placed';
}

export interface Derivation {
    proposals: DerivedDate[];
    unmatched: { name: string; reason: string }[];
    /** No timeline at all is a different problem from a bad mapping. */
    phaseCount: number;
}

const norm = (v: string | undefined | null) => (v || '').trim().toLowerCase();
const isoOf = (v: string | undefined) => (v || '').slice(0, 10);

/**
 * Target dates read off the project's real programme.
 *
 * Two routes, and the proposal says which one it took.
 *
 * The exact route is the one the app already models: the studio configures a
 * design step to trigger a named milestone, and that step has a phase on the
 * timeline, so the milestone inherits the phase's end date — a milestone
 * becomes billable when the step completes.
 *
 * That route needs `triggersMilestoneLabel` configured and milestone names
 * matching the studio's labels, and on a real project neither held: the
 * milestones were named "Sign-up & Concept", "Design Development"… while the
 * studio's labels were "Booking", "Design Approval". So there is a second
 * route: place each milestone on the programme by where it sits in its own
 * schedule. The third design milestone of three lands at the end of the
 * programme's design span. It is positional rather than configured, which is
 * why it is labelled `placed` and not silently mixed in with `mapped`.
 *
 * Both routes only ever return dates that belong to a real phase. Nothing is
 * averaged or invented — a date a client will see comes off the programme.
 */
export function deriveDatesFromTimeline(
    milestones: PaymentMilestone[],
    phases: PhaseLike[],
    steps: StepLike[],
    settingsMilestones: SettingsMilestoneLike[],
): Derivation {
    const proposals: DerivedDate[] = [];
    const unmatched: { name: string; reason: string }[] = [];

    const ordered = (phases || [])
        .filter(ph => isoOf(ph.endDate))
        .slice()
        .sort((a, b) => a.stepNumber - b.stepNumber);

    if (ordered.length === 0) {
        for (const ms of milestones || []) {
            if (ms.status === 'paid' || ms.status === 'invoiced') continue;
            unmatched.push({ name: ms.name, reason: 'this project has no timeline phases with end dates' });
        }
        return { proposals, unmatched, phaseCount: 0 };
    }

    const phaseByStep = new Map<number, PhaseLike>();
    for (const ph of ordered) phaseByStep.set(ph.stepNumber, ph);

    const open = (x: PaymentMilestone) => x.status !== 'paid' && x.status !== 'invoiced';

    /*
      Where the programme stops being design and starts being execution.

      Without this the positional route spread each track across the whole
      timeline, so the last design milestone landed on the last phase — it
      put "Design Completion" on Handover, which is obviously wrong and is
      exactly the sort of date that would reach a client.

      The studio's own configuration answers it when present: the step that
      triggers the execution-start milestone is the boundary. Otherwise the
      phase list is divided in proportion to how many milestones each track
      carries, which at least keeps design inside the early phases.
    */
    const designCount = (milestones || []).filter(x => x.type === 'design').length;
    const execCount = (milestones || []).filter(x => x.type === 'execution').length;

    let splitAt = -1;
    const execStartStep = (steps || []).find(st => /execution/i.test(st.triggersMilestoneLabel || ''));
    if (execStartStep) {
        const at = ordered.findIndex(ph => ph.stepNumber >= execStartStep.stepNumber);
        if (at > 0) splitAt = at;
    }
    if (splitAt < 0) {
        const total = designCount + execCount;
        splitAt = total > 0
            ? Math.min(ordered.length - 1, Math.max(1, Math.round((designCount / total) * ordered.length)))
            : Math.max(1, Math.floor(ordered.length / 2));
    }

    // Each track gets its own window of the programme, never the whole of it.
    const windowFor = (type: 'design' | 'execution') =>
        type === 'design' ? ordered.slice(0, splitAt) : ordered.slice(splitAt);

    for (const type of ['design', 'execution'] as const) {
        const track = (milestones || []).filter(x => x.type === type);
        if (track.length === 0) continue;

        const band = windowFor(type);
        const usable = band.length > 0 ? band : ordered;

        track.forEach((ms, idx) => {
            if (!open(ms)) return;

            // Route 1 — the configured mapping, when it exists.
            const sm = (settingsMilestones || []).find(
                x => norm(x.label) === norm(ms.name) || (!!ms.trigger && norm(x.trigger) === norm(ms.trigger)),
            );
            if (sm) {
                const step = (steps || []).find(st => norm(st.triggersMilestoneLabel) === norm(sm.label));
                const phase = step ? phaseByStep.get(step.stepNumber) : undefined;
                const iso = phase ? isoOf(phase.endDate) : '';
                if (iso) {
                    if (ms.date !== iso) {
                        proposals.push({
                            id: ms.id, name: ms.name, date: iso,
                            from: phase!.title || `Step ${step!.stepNumber}`, how: 'mapped',
                        });
                    }
                    return;
                }
            }

            // Route 2 — position it inside this track's window of the programme.
            const fraction = (idx + 1) / track.length;               // 1/3, 2/3, 3/3 …
            const slot = Math.min(usable.length - 1, Math.max(0, Math.ceil(fraction * usable.length) - 1));
            const phase = usable[slot];
            const iso = isoOf(phase.endDate);
            if (!iso) {
                unmatched.push({ name: ms.name, reason: 'the matching phase has no end date' });
                return;
            }
            if (ms.date === iso) return;
            proposals.push({
                id: ms.id, name: ms.name, date: iso,
                from: phase.title || `Step ${phase.stepNumber}`, how: 'placed',
            });
        });
    }

    return { proposals, unmatched, phaseCount: ordered.length };
}

// ── does the schedule still match the contract ───────────────────────────

export interface Drift {
    revisions: number;
    /** Latest recorded contract value minus the earliest, across both components. */
    valueMoved: number;
    lastRevisedOn: string | null;
    /** Milestone percentages should total 100 per component. */
    designPct: number;
    executionPct: number;
    designBalanced: boolean;
    executionBalanced: boolean;
    reasons: string[];
}

/**
 * The quiet failure this catches: the contract value is revised, the
 * milestones are not re-based, and the schedule stops summing to what was
 * signed. Percentages are checked per component because design and execution
 * each total 100 in this model.
 */
export function contractDrift(
    revisions: PaymentRevision[] | undefined,
    milestones: PaymentMilestone[],
): Drift {
    const revs = (revisions || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let valueMoved = 0;
    for (const r of revs) {
        const ex = (r.newExecutionValue ?? 0) - (r.previousExecutionValue ?? 0);
        const de = (r.newDesignValue ?? 0) - (r.previousDesignValue ?? 0);
        valueMoved += ex + de;
    }

    const pctOf = (type: 'design' | 'execution') =>
        (milestones || [])
            .filter(m => m.type === type && !m.isFixedAmount)
            .reduce((s, m) => s + (Number(m.percentage) || 0), 0);

    const designPct = Math.round(pctOf('design') * 100) / 100;
    const executionPct = Math.round(pctOf('execution') * 100) / 100;

    const hasDesign = (milestones || []).some(m => m.type === 'design');
    const hasExecution = (milestones || []).some(m => m.type === 'execution');

    // A tenth of a percent is rounding, not drift.
    const near100 = (v: number) => Math.abs(v - 100) < 0.1;

    return {
        revisions: revs.length,
        valueMoved,
        lastRevisedOn: revs.length ? (revs[revs.length - 1].date || null) : null,
        designPct,
        executionPct,
        designBalanced: !hasDesign || near100(designPct),
        executionBalanced: !hasExecution || near100(executionPct),
        reasons: revs.map(r => r.reason || '').filter(Boolean),
    };
}
