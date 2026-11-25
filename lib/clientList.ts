/*
  THE CLIENTS LIST: one row per client, as the Clients screen shows it
  (DESIGN.md "Clients: conversations", approved 25 Nov 2026).

  Worked out from records the studio already keeps: the client accounts
  (lib/clientGroups), their money as the client sees it (lib/clientMoney, with
  the amounts already taken out for a role that does not see them), and the
  Ops Desk follow-up log (projects/{id}/followUps, lib/opsDesk). Nothing is
  stored twice and nothing is a studio-wide figure: no counts, no totals.

  - **Last contact** is the latest line in the follow-up log for any of the
    client's projects. Nothing logged means no contact we know of.
  - **Quiet** is no contact for 10 days or more, dormant clients aside.
  - **New activity** is something the client did (a reply logged, a message
    sent from their portal) since this person last opened them.
  - **Newly added** is a client whose every project was opened in the last
    three days. Projects carry no created date; a project opened from a lead
    (or started blank) records when in `scopeFlow.enabledAt`, so that is used.

  Sorted newly added first, then new activity, then most recent contact.

  Pure, so the tests run it.
*/
import type { FullProjectData } from '../types';
import type { FollowUp } from './opsDesk';
import type { ClientMoney, ClientMilestone } from './clientMoney';
import { heardFromClient } from './clientCare';
import { STATUS_TO_BUCKET, type AggregatedClient } from './clientGroups';
import { nextMove, owesNow, QUIET_AFTER_DAYS, type NextMove } from './clientNextMove';

const DAY = 24 * 60 * 60 * 1000;
export const NEW_FOR_DAYS = 3;

export type ClientFilter = 'all' | 'new' | 'owes' | 'quiet';

export interface ClientMoneySummary {
  /** True for a role that does not see amounts: no figures, no ₹ chip, no "Owes us". */
  hidden: boolean;
  /** This client's portfolio: the value of their projects. Null where hidden. */
  portfolio: number | null;
  /** Raised and not yet paid. Null where hidden. */
  owedNow: number | null;
  owes: boolean;
  milestones: ClientMilestone[];
}

export interface ClientRow {
  client: AggregatedClient;
  /** The project the client is mostly about now: the liveliest, then the latest. */
  primary: FullProjectData;
  money: ClientMoneySummary;
  lastContactAt: number | null;
  quietDays: number | null;
  /** The one-line preview: what was last logged. */
  preview: { who: 'you' | 'logged'; text: string; at: number } | null;
  /** The last thing the client did, when known. */
  clientActivityAt: number | null;
  isNew: boolean;
  nextMove: NextMove;
}

const BUCKET_RANK: Record<string, number> = { active: 4, pipeline: 3, delivered: 2, lost: 1 };
const bucketOf = (p: FullProjectData) => STATUS_TO_BUCKET[p.context?.status || 'draft'] || 'pipeline';

/** The client's liveliest project (active, then pipeline, delivered, dormant), the latest first within each. */
export function primaryProject(projects: FullProjectData[]): FullProjectData {
  return [...projects].sort((a, b) =>
    (BUCKET_RANK[bucketOf(b)] - BUCKET_RANK[bucketOf(a)]) || ((b.lastModified || 0) - (a.lastModified || 0)))[0];
}

/** When a project was opened, where it says: `scopeFlow.enabledAt` is set as it is created. */
export const addedAtOf = (p: FullProjectData): number | null => {
  const t = Number((p.context as any)?.scopeFlow?.enabledAt);
  return Number.isFinite(t) && t > 0 ? t : null;
};

/** What a follow-up line says, without the capture's "WhatsApp chat:" lead-in or its mood. */
export const lineText = (note: string) =>
  String(note || '').replace(/^(WhatsApp chat|Call):\s*/, '').replace(/\s*Mood:.*$/, '').replace(/\s+/g, ' ').trim();

/** The last thing the client did on their side, from the records already loaded. */
function lastClientActivity(projects: FullProjectData[], lines: FollowUp[]): number | null {
  let at = 0;
  for (const f of lines) if (heardFromClient(f)) at = Math.max(at, f.at || 0);
  for (const p of projects) {
    for (const m of ((p.context as any)?.clientMessages || []) as any[]) {
      const t = Date.parse(m?.sentAt || '');
      if (Number.isFinite(t)) at = Math.max(at, t);
    }
  }
  return at || null;
}

/** One project's money, as the client sees it, joined across the client's projects. */
export function moneySummary(client: AggregatedClient, moneyByProject: Record<string, ClientMoney | null>, hidden: boolean): ClientMoneySummary {
  const milestones = client.projects.flatMap((p) => moneyByProject[p.id]?.milestones || []);
  const owes = owesNow(milestones);
  if (hidden) return { hidden, portfolio: null, owedNow: null, owes, milestones };
  const owedNow = milestones.filter((m) => m.status === 'invoiced').reduce((s, m) => s + (m.owed || 0), 0);
  return { hidden, portfolio: client.totalValue, owedNow, owes, milestones };
}

export function buildRows(
  clients: AggregatedClient[],
  moneyByProject: Record<string, ClientMoney | null>,
  followUps: FollowUp[],
  opts: { amountsHidden: boolean; now: number },
): ClientRow[] {
  const byProject = new Map<string, FollowUp[]>();
  for (const f of followUps) {
    const list = byProject.get(f.projectId) || [];
    list.push(f);
    byProject.set(f.projectId, list);
  }
  return clients.map((client) => {
    const lines = client.projects.flatMap((p) => byProject.get(p.id) || []).sort((a, b) => (b.at || 0) - (a.at || 0));
    const last = lines[0] || null;
    const lastContactAt = last ? last.at : null;
    const quietDays = lastContactAt != null ? Math.max(0, Math.floor((opts.now - lastContactAt) / DAY)) : null;
    const added = client.projects.map(addedAtOf);
    const isNew = added.every((t) => t != null) && Math.min(...(added as number[])) > opts.now - NEW_FOR_DAYS * DAY;
    const money = moneySummary(client, moneyByProject, opts.amountsHidden);
    return {
      client,
      primary: primaryProject(client.projects),
      money,
      lastContactAt,
      quietDays,
      preview: last ? { who: last.outcome === 'reminded' ? 'you' : 'logged', text: lineText(last.note), at: last.at } : null,
      clientActivityAt: lastClientActivity(client.projects, lines),
      isNew,
      nextMove: nextMove({ bucket: client.bucket, milestones: money.milestones, quietDays, now: opts.now }),
    };
  });
}

/** Seen markers: when this person last opened each client, and when they first used the screen. */
export interface SeenMarks { since: number; seen: Record<string, number> }

export const hasNewActivity = (r: ClientRow, marks: SeenMarks): boolean =>
  r.clientActivityAt != null && r.clientActivityAt > (marks.seen[r.client.clientKey] ?? marks.since);

export const isQuiet = (r: ClientRow): boolean =>
  r.client.bucket !== 'lost' && (r.quietDays == null || r.quietDays >= QUIET_AFTER_DAYS);

export function matchesSearch(r: ClientRow, q: string): boolean {
  const t = q.toLowerCase().trim();
  if (!t) return true;
  const c = r.client;
  return [c.clientName, c.clientEmail, c.clientPhone, c.clientLocation, ...c.configs, ...c.projects.map((p) => p.context?.name || '')]
    .some((s) => String(s || '').toLowerCase().includes(t));
}

export function filterRows(rows: ClientRow[], f: ClientFilter, marks: SeenMarks): ClientRow[] {
  if (f === 'new') return rows.filter((r) => hasNewActivity(r, marks));
  if (f === 'owes') return rows.filter((r) => !r.money.hidden && r.money.owes);
  if (f === 'quiet') return rows.filter(isQuiet);
  return rows;
}

/** Newly added, then new activity, then the most recent contact (none last), then the latest change. */
export function sortRows(rows: ClientRow[], marks: SeenMarks): ClientRow[] {
  return [...rows].sort((a, b) =>
    (Number(b.isNew) - Number(a.isNew))
    || (Number(hasNewActivity(b, marks)) - Number(hasNewActivity(a, marks)))
    || ((b.lastContactAt ?? -1) - (a.lastContactAt ?? -1))
    || (b.client.lastActivity - a.client.lastActivity));
}
