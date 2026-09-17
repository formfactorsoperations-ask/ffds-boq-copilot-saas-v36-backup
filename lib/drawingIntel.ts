import { DrawingTrackerItem, DrawingRevision, DrawingRound } from '../types';

/*
  What the drawing tracker knows but has never said out loud.

  Three questions run this screen and none of them were being answered:
  who is holding up each drawing, what the rework is costing the studio, and
  which drawings will miss their date. The data for all three is already on
  the record — rounds carry issue and feedback timestamps, revisions carry a
  cause and a chargeable flag, drawings carry a target date — it was simply
  never read.

  Everything here is pure. The screen renders these; it does not recompute
  them inline, so the definition of "late" lives in one place.
*/

const DAY = 86_400_000;

/** Firestore hands timestamps back in three shapes depending on the path. */
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

const daysBetween = (from: number, to: number) =>
    from && to ? Math.max(0, Math.floor((to - from) / DAY)) : 0;

// ── who is holding the drawing ───────────────────────────────────────────

export type HoldState = 'not_started' | 'with_studio' | 'with_client' | 'approved';

export interface Turnaround {
    state: HoldState;
    /**
     * Days the client has had the current round. `null` means the round is
     * genuinely with the client but nobody recorded when it went out, so the
     * age is unknown rather than zero.
     */
    daysWithClient: number | null;
    /** Mean days the client took on rounds they have already answered. */
    meanResponseDays: number | null;
    /** Rounds the client has actually closed — what meanResponseDays averages. */
    answeredRounds: number;
    currentRound: number;
}

/**
 * A round is with the client from the moment it goes out until feedback
 * lands. See the note inside on why both the timestamps and `status` are
 * consulted rather than either alone.
 */
export function turnaroundOf(d: DrawingTrackerItem, now = Date.now()): Turnaround {
    const rounds: DrawingRound[] = d.rounds || [];
    const answered = rounds.filter(r => msOf(r.issuedAt) && msOf(r.clientFeedbackSubmittedAt));

    const meanResponseDays = answered.length
        ? answered.reduce((sum, r) => sum + daysBetween(msOf(r.issuedAt), msOf(r.clientFeedbackSubmittedAt)), 0) / answered.length
        : null;

    if (d.approvedAt) {
        return { state: 'approved', daysWithClient: 0, meanResponseDays, answeredRounds: answered.length, currentRound: d.currentRound || rounds.length };
    }

    /*
      The latest round that is out and not yet answered.

      Timestamps decide when they exist, but they are not always written:
      a round can be moved to `in_review` by hand without an `issuedAt`, and
      reading timestamps alone reported those drawings as sitting with nobody
      — which contradicted every other count on the screen. Status is the
      fallback, and when it is the only evidence the age is unknown, not zero.
    */
    const openByDate = rounds
        .filter(r => msOf(r.issuedAt) && !msOf(r.clientFeedbackSubmittedAt) && r.status !== 'approved')
        .sort((a, b) => b.roundNumber - a.roundNumber)[0];

    const openByStatus = rounds
        .filter(r => (r.status === 'in_review' || r.status === 'issued') && !msOf(r.clientFeedbackSubmittedAt))
        .sort((a, b) => b.roundNumber - a.roundNumber)[0];

    const open = openByDate || openByStatus;

    if (open) {
        const issued = msOf(open.issuedAt);
        return {
            state: 'with_client',
            daysWithClient: issued ? daysBetween(issued, now) : null,
            meanResponseDays,
            answeredRounds: answered.length,
            currentRound: open.roundNumber,
        };
    }

    const everIssued = rounds.some(r => msOf(r.issuedAt) || r.status === 'issued' || r.status === 'in_review');
    return {
        state: everIssued ? 'with_studio' : 'not_started',
        daysWithClient: 0,
        meanResponseDays,
        answeredRounds: answered.length,
        currentRound: d.currentRound || rounds.length,
    };
}

export interface TurnaroundSummary {
    withClient: number;
    /** With the client, but no issue date was recorded, so age is unknown. */
    withClientUndated: number;
    withStudio: number;
    notStarted: number;
    approved: number;
    /** Drawings the client has held longer than the stale threshold. */
    stale: number;
    staleAfterDays: number;
    /** Mean client response across every answered round on the project. */
    meanResponseDays: number | null;
    /** The single worst offender, for the one line worth putting in a meeting. */
    worst: { name: string; days: number } | null;
}

export function summariseTurnaround(
    drawings: DrawingTrackerItem[],
    staleAfterDays = 7,
    now = Date.now(),
): TurnaroundSummary {
    let withClient = 0, withClientUndated = 0, withStudio = 0, notStarted = 0, approved = 0, stale = 0;
    let responseSum = 0, responseCount = 0;
    let worst: { name: string; days: number } | null = null;

    for (const d of drawings) {
        const t = turnaroundOf(d, now);
        if (t.state === 'with_client') {
            withClient++;
            if (t.daysWithClient === null) {
                withClientUndated++;
            } else {
                if (t.daysWithClient > staleAfterDays) stale++;
                if (!worst || t.daysWithClient > worst.days) worst = { name: d.name, days: t.daysWithClient };
            }
        } else if (t.state === 'with_studio') withStudio++;
        else if (t.state === 'not_started') notStarted++;
        else approved++;

        if (t.meanResponseDays !== null) {
            responseSum += t.meanResponseDays * t.answeredRounds;
            responseCount += t.answeredRounds;
        }
    }

    return {
        withClient, withClientUndated, withStudio, notStarted, approved, stale, staleAfterDays,
        meanResponseDays: responseCount ? responseSum / responseCount : null,
        worst,
    };
}

// ── what the rework costs ────────────────────────────────────────────────

export interface RevisionEconomics {
    total: number;
    /** The client changed their mind. */
    client: number;
    /** The studio got it wrong — this is rework you absorb. */
    ours: number;
    /** Site made it necessary. */
    site: number;
    chargeable: number;
    /** Chargeable but with no invoice against it yet. */
    unbilled: number;
    /** Revisions inside the free rounds, which can never be charged. */
    withinFreeRounds: number;
    freeRoundLimit: number;
    /** Share of revisions the studio caused, 0–1. The number that matters. */
    ourShare: number;
    /** Drawings that have burned more rounds than the free allowance. */
    overRunDrawings: string[];
}

/**
 * `chargeable` is already forced false for rounds 1–2 when revisions are read
 * (the first two rounds are included in the fee), so that allowance is a fact
 * about the data, not a rule applied here. It is surfaced so the screen can
 * say why a revision could not be charged.
 */
export function revisionEconomics(
    revisionsByDrawing: Record<string, DrawingRevision[]>,
    drawings: DrawingTrackerItem[] = [],
    freeRoundLimit = 2,
): RevisionEconomics {
    const all: DrawingRevision[] = [];
    for (const key of Object.keys(revisionsByDrawing)) {
        for (const r of revisionsByDrawing[key] || []) all.push(r);
    }

    const ours = all.filter(r => r.cause === 'FFDS_DESIGN_MISS').length;
    const client = all.filter(r => r.cause === 'CLIENT_REVISION').length;
    const site = all.filter(r => r.cause === 'SITE_CONDITION').length;
    const chargeable = all.filter(r => r.chargeable).length;
    const unbilled = all.filter(r => r.chargeable && !r.chargeInvoiceId).length;
    const withinFreeRounds = all.filter(r => (r.roundNumber || 0) <= freeRoundLimit).length;

    const overRunDrawings = drawings
        .filter(d => (d.currentRound || 0) > freeRoundLimit && !d.approvedAt)
        .map(d => d.name);

    return {
        total: all.length,
        client, ours, site, chargeable, unbilled,
        withinFreeRounds, freeRoundLimit,
        ourShare: all.length ? ours / all.length : 0,
        overRunDrawings,
    };
}

// ── which drawings will miss the date ────────────────────────────────────

export type RiskState = 'overdue' | 'due_soon' | 'on_track' | 'no_date' | 'done';

export interface DateRisk {
    state: RiskState;
    /** Negative when the target has passed. */
    daysToTarget: number | null;
    priority: 'high' | 'normal' | 'low';
}

export function dateRisk(d: DrawingTrackerItem, now = Date.now(), dueSoonDays = 7): DateRisk {
    const priority = (d.priority || 'normal') as 'high' | 'normal' | 'low';
    if (d.approvedAt) return { state: 'done', daysToTarget: null, priority };
    if (!d.targetDate) return { state: 'no_date', daysToTarget: null, priority };

    const target = new Date(d.targetDate + 'T00:00:00').getTime();
    if (isNaN(target)) return { state: 'no_date', daysToTarget: null, priority };

    const today = new Date(now).setHours(0, 0, 0, 0);
    const days = Math.round((target - today) / DAY);

    if (days < 0) return { state: 'overdue', daysToTarget: days, priority };
    if (days <= dueSoonDays) return { state: 'due_soon', daysToTarget: days, priority };
    return { state: 'on_track', daysToTarget: days, priority };
}

export interface RiskSummary {
    overdue: number;
    dueSoon: number;
    onTrack: number;
    noDate: number;
    /** Worst overdue first, then soonest due — the order to work in. */
    queue: { name: string; id: string; risk: DateRisk }[];
}

export function summariseRisk(drawings: DrawingTrackerItem[], now = Date.now()): RiskSummary {
    let overdue = 0, dueSoon = 0, onTrack = 0, noDate = 0;
    const queue: { name: string; id: string; risk: DateRisk }[] = [];

    for (const d of drawings) {
        const risk = dateRisk(d, now);
        if (risk.state === 'overdue') { overdue++; queue.push({ name: d.name, id: d.id, risk }); }
        else if (risk.state === 'due_soon') { dueSoon++; queue.push({ name: d.name, id: d.id, risk }); }
        else if (risk.state === 'on_track') onTrack++;
        else if (risk.state === 'no_date') noDate++;
    }

    queue.sort((a, b) => {
        const av = a.risk.daysToTarget ?? 0;
        const bv = b.risk.daysToTarget ?? 0;
        if (av !== bv) return av - bv;
        const rank = { high: 0, normal: 1, low: 2 };
        return rank[a.risk.priority] - rank[b.risk.priority];
    });

    return { overdue, dueSoon, onTrack, noDate, queue };
}

// ── shared display helpers ───────────────────────────────────────────────

export const HOLD_LABEL: Record<HoldState, string> = {
    not_started: 'Not started',
    with_studio: 'With the studio',
    with_client: 'With the client',
    approved: 'Approved',
};

export function plural(n: number, one: string, many?: string) {
    return n === 1 ? one : (many || one + 's');
}
