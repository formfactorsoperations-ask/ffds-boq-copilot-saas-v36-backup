import { clientPending, stateOf, type ReviewSummary } from './drawingReview';
import { revisionCharges, type DesignMeeting } from './designMeeting';
import type { FlowRow } from './designDesk2';

/*
  DESIGN DESK 2.0, PHASE 3A: the smart features that need no AI.

  Each of these reads facts the app already has and says one plain thing
  about them. They are pure functions, so every rule here can be tested
  without Firebase, and nothing here decides anything about a drawing.

    site date     when site needs a drawing, and whether the steps it still
                  has to go through fit before that date;
    missing       a drawing whose companion is already approved or released
                  while it is not (the Drawings tab's gap flag);
    rounds        revision rounds past the included ones that nobody has
                  billed or waived yet;
    nudges        who has held a drawing for more than a day.
*/

const DAY = 86_400_000;
const first = (n?: string | null) => String(n || '').split(/[\s@]/)[0] || 'The designer';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dayOf = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
const studioOnly = (d: FlowRow) => d.review?.audience === 'studio';

/** A row with the tracker facts Phase 3A reads (services/drawingReviewService: toDrawing). */
export interface SmartRow extends FlowRow {
  id: string;
  projectId: string;
  /** The day site needs this drawing, YYYY-MM-DD. Set by the studio's leads on the drawing. */
  siteDate?: string | null;
  /** The Drawings tab's gap flag: its companion drawing is ahead of it, or missing. */
  isGapFlagged?: boolean;
  /** The id of the drawing this one is paired with (a plan and its elevation). */
  companionOf?: string | null;
}

/* ------------------------------------------------------------ the site date */

/** A YYYY-MM-DD date a person typed, or null. */
export function cleanDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T00:00:00`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 4) < '2000' ? null : s;
}

/**
 * The days a drawing usually still needs before it can go to site, from the
 * steps it has left: two to draw or correct it, one for the Design Head's
 * check, and seven for the client's written approval (the five working days
 * the approval email gives). A drawing kept inside the studio has no client
 * step.
 */
export function daysStillNeeded(d: FlowRow): number {
  const s = stateOf(d.review);
  const client = studioOnly(d) ? 0 : 7;
  if (d.gfcStatus === 'issued') return 0;
  if (s === 'NONE' || s === 'DRAFT' || s === 'CHANGES_REQUESTED') return 2 + 1 + client;
  if (s === 'IN_REVIEW' || clientPending(d.review)) return 1 + client;
  return studioOnly(d) || d.approvedAt != null ? 0 : client;
}

export type SiteState = 'late' | 'risk' | 'ready' | 'ok';
export interface SiteRisk {
  state: SiteState;
  /** Days from today to the site date; negative once it has passed. */
  days: number;
  /** "1 Dec" */
  date: string;
  /** A short label for a tag: "Site needs it 1 Dec". */
  label: string;
  /** One plain sentence. */
  line: string;
}

/**
 * What the site date means for a drawing today. Null when it has no site date
 * or is already sent to site. `late`: the date has passed. `risk`: the steps
 * it still has do not fit before the date. `ready`: it is approved and only
 * needs sending, with the date close. `ok`: on track.
 */
export function siteRisk(d: SmartRow, now = new Date()): SiteRisk | null {
  const iso = cleanDate(d.siteDate);
  if (!iso || d.gfcStatus === 'issued') return null;
  const t = new Date(`${iso}T00:00:00`);
  const days = Math.round((dayOf(t) - dayOf(now)) / DAY);
  const date = t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const need = daysStillNeeded(d);
  if (days < 0) return { state: 'late', days, date, label: `Site needed it ${date}`, line: `Site needed it on ${date}. It is not sent to site yet.` };
  if (need > days) return { state: 'risk', days, date, label: `Site needs it ${date}`, line: `Site needs it on ${date}. At this pace it will be late: it still needs about ${plural(need, 'day')} and there ${days === 1 ? 'is' : 'are'} ${days}.` };
  if (need === 0 && days <= 3) return { state: 'ready', days, date, label: `Site needs it ${date}`, line: `Site needs it on ${date}. It is approved: send it to site.` };
  return { state: 'ok', days, date, label: `Site needs it ${date}`, line: `Site needs it on ${date}. It is on track.` };
}

/** The drawings that are late for site or will be at this pace, the most urgent first. */
export function siteRisks<T extends SmartRow>(rows: T[], now = new Date()): { d: T; risk: SiteRisk }[] {
  return rows.map((d) => ({ d, risk: siteRisk(d, now) }))
    .filter((x): x is { d: T; risk: SiteRisk } => !!x.risk && x.risk.state !== 'ok')
    .sort((a, b) => a.risk.days - b.risk.days);
}

/* ------------------------------------------------------------ missing drawings */

export interface Missing<T extends SmartRow> { d: T; line: string }

/**
 * Drawings the BOQ needs that are behind their pair: the Drawings tab flags a
 * drawing when its companion is approved or released and it is not, or when
 * the companion is not in the tracker at all. One that is itself approved or
 * sent to site is not missing any more.
 */
export function missingDrawings<T extends SmartRow>(rows: T[]): Missing<T>[] {
  return rows
    .filter((d) => d.isGapFlagged && d.gfcStatus !== 'issued' && stateOf(d.review) !== 'APPROVED')
    .map((d) => {
      const pair = d.companionOf ? rows.find((x) => x.projectId === d.projectId && x.id === d.companionOf) : null;
      const s = stateOf(d.review);
      const where = s === 'NONE' ? 'has no drawing uploaded yet' : s === 'IN_REVIEW' ? 'is still with the Design Head' : 'is not approved yet';
      return { d, line: pair ? `${d.name} ${where}, and ${pair.name}, which goes with it, is already ahead.` : `${d.name} ${where}, and the drawing that goes with it is not in the list.` };
    });
}

/* ------------------------------------------------------------ rounds to bill */

export interface RoundToBill { projectId: string; projectName: string; meetingId: string; room: string; round: number; included: number; changes: number; closedAt: number }

/** Every revision round past the included ones that is still waiting to be billed or waived, newest first. */
export function roundsToBill(byProject: Record<string, DesignMeeting[] | undefined>, nameOf: (projectId: string) => string): RoundToBill[] {
  return Object.entries(byProject).flatMap(([projectId, list]) => revisionCharges(list || [])
    .filter(({ room }) => room.charge?.status === 'to_bill')
    .map(({ meeting, room }) => ({ projectId, projectName: nameOf(projectId), meetingId: meeting.id, room: room.room, round: room.round, included: meeting.includedRounds, changes: room.changes.length, closedAt: meeting.closedAt || 0 })))
    .sort((a, b) => b.closedAt - a.closedAt);
}

/* ------------------------------------------------------------ nudges */

/** A drawing is nudged once someone has held it this long. */
export const NUDGE_AFTER_MS = DAY;
/** The daily reminder does not repeat within this time; a retried run sends nothing twice. */
export const NUDGE_DAILY_GAP_MS = 20 * 3_600_000;
/** A person pressing Nudge waits this long after the last reminder. */
export const NUDGE_BUTTON_GAP_MS = 4 * 3_600_000;

export interface Held {
  /** Whose turn it is. */
  who: 'head' | 'designer';
  since: number;
  /** Whole days held. */
  days: number;
  /** What they are asked to do, in a few words. */
  ask: string;
}

/**
 * Who in the studio is holding a drawing, and since when. Null when nobody in
 * the studio is: it has no PDF, it is approved, or it is with the client (the
 * client's reminders are the approval email's own).
 */
export function heldBy(r: Partial<ReviewSummary> | null | undefined, now = Date.now()): Held | null {
  const s = stateOf(r);
  const at = (t?: number | null) => (typeof t === 'number' && t > 0 ? t : 0);
  const held = (who: Held['who'], since: number, ask: string): Held | null =>
    (since ? { who, since, days: Math.max(0, Math.floor((now - since) / DAY)), ask } : null);
  if (s === 'IN_REVIEW') return held('head', at(r?.submittedAt), 'check it');
  if (clientPending(r)) return held('head', at(r?.clientChanges?.at), "go through the client's changes");
  if (s === 'CHANGES_REQUESTED') return held('designer', at(r?.decidedAt), 'make the changes and upload it again');
  if (s === 'DRAFT') return held('designer', at(r?.updatedAt), 'send it to the Design Head');
  return null;
}

/** The holder is due a reminder: held for more than a day, and not reminded within `gap`. */
export function nudgeDue(r: (Partial<ReviewSummary> & { nudgedAt?: number | null }) | null | undefined, now = Date.now(), gap = NUDGE_DAILY_GAP_MS): Held | null {
  const h = heldBy(r, now);
  if (!h || now - h.since < NUDGE_AFTER_MS) return null;
  return r?.nudgedAt && now - r.nudgedAt < gap ? null : h;
}

/** The daily reminder stops after this many days, so a drawing left aside does not ring for ever; Nudge still works. */
export const NUDGE_DAILY_STOPS_AFTER_DAYS = 14;

/** The holder is due the daily reminder. */
export function dailyNudgeDue(r: (Partial<ReviewSummary> & { nudgedAt?: number | null }) | null | undefined, now = Date.now()): Held | null {
  const h = nudgeDue(r, now);
  return h && h.days <= NUDGE_DAILY_STOPS_AFTER_DAYS ? h : null;
}

/** Whether Nudge can be pressed now, and if not, why. */
export function canNudge(r: (Partial<ReviewSummary> & { nudgedAt?: number | null }) | null | undefined, now = Date.now()): { ok: boolean; why: string; held: Held | null } {
  const held = heldBy(r, now);
  if (!held) return { ok: false, why: 'Nobody in the studio is holding this drawing right now.', held };
  if (r?.nudgedAt && now - r.nudgedAt < NUDGE_BUTTON_GAP_MS) return { ok: false, why: 'A reminder went a short while ago. Try again in a few hours.', held };
  return { ok: true, why: '', held };
}

/** Who a nudge goes to, in words: "the Design Head" or the designer's first name. */
export const nudgeTarget = (r: Partial<ReviewSummary> | null | undefined, h: Held) => (h.who === 'head' ? 'the Design Head' : first(r?.designer?.name));

/** A message to paste into WhatsApp, for a studio without the automatic WhatsApp reminders. */
export function nudgeText(p: { sheet: string; projectName: string; held: Held; to: string }): string {
  return `Reminder: ${p.sheet} (${p.projectName}) has been waiting ${p.held.days >= 1 ? plural(p.held.days, 'day') : 'since today'} for ${p.to === 'the Design Head' ? 'the Design Head' : p.to} to ${p.held.ask}. Please open it in Design Desk.`;
}
