/*
  BRINGING OLDER MINUTES INTO THE NEW FORMAT (the MoM overhaul, mockup 12).

  A one-time step in Studio settings, run by an Owner, Admin or Ops Director:
  check first, then review, then apply. Nothing changes until it is applied,
  and nothing is ever sent to a client.

  Older minutes live in four places:

    moms            organizations/{org}/projects/{p}/moms, the minutes as
                    the studio writes them today. These are brought across
                    in place: same document, same ref (MOM-2026-014).
    projectCopies   projects/{p}/moms, an older copy kept on the project.
    visits          minutes saved inside a site visit (`momData`).
    history         the project's "Meeting notes" (context.momHistory).

  The last three are copied into the studio's minutes as new documents,
  each once (a ref already there is not copied again). The copies are
  studio records: the client keeps seeing the originals exactly where they
  saw them before, so a copy is never shown in the portal.

  Wording and refs stay as they are. Decisions, actions and notes become
  lines under one topic, "Discussion". Statuses carry over unchanged, and
  minutes that were finalised before this process are marked "Approved
  before the new process", since nobody recorded who approved them.

  Anything unclear is listed for a person to decide first, and left out
  unless they bring it across as it is.

  Pure functions, no imports from the app: shared by the screen and tests.
*/

import { fromLegacy, type MinutesTopic, type TrailEntry, type Signed } from './minutes';

export type MigrationSource = 'moms' | 'projectCopies' | 'visits' | 'history';

export const SOURCE_LABEL: Record<MigrationSource, string> = {
  moms: 'Minutes on projects',
  projectCopies: 'Older project copies',
  visits: 'Notes inside site visits',
  history: 'Minutes history on the project',
};

export type IssueKind = 'owner_unknown' | 'no_owner' | 'correction_open' | 'never_shown';

export interface MigrationIssue { kind: IssueKind; text: string }

export interface MigrationCandidate {
  /** Unique across the run: project, source and the id there. */
  key: string;
  source: MigrationSource;
  projectId: string;
  projectName: string;
  /** The minutes document it becomes: the same one for `moms`, a new one otherwise. */
  momId: string;
  momRef: string;
  title: string;
  meetingDate: number;
  status: string;
  issues: MigrationIssue[];
  /** Nothing structured, only the notes as typed: they come across as one note. */
  notesOnly: boolean;
  raw: any;
}

export interface ProjectSources {
  projectId: string;
  projectName: string;
  moms: any[];
  projectCopies: any[];
  visits: any[];
  history: any[];
}

export interface MigrationPlan {
  candidates: MigrationCandidate[];
  /** Already in the new format, or already brought across. */
  alreadyNew: number;
  bySource: Record<MigrationSource, number>;
}

const STATUSES = ['draft', 'pending_review', 'finalised', 'shared', 'acknowledged', 'correction_requested'];
const ISSUED = ['finalised', 'shared', 'acknowledged', 'correction_requested'];
const GENERIC_OWNERS = /^(studio|ffds|site team|team|vendor|client|contractor|tbd|-)$/i;

/** The new status for an older one. They are the same words; anything else reads as a draft. */
export function mapStatus(s: unknown): string {
  const v = String(s || '').toLowerCase().trim();
  if (STATUSES.includes(v)) return v;
  if (v === 'final' || v === 'approved' || v === 'issued') return 'finalised';
  if (v === 'sent' || v === 'published') return 'shared';
  if (v === 'confirmed' || v === 'signed') return 'acknowledged';
  return 'draft';
}

const millis = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

const text = (v: any) => String(typeof v === 'string' ? v : v?.text || '').trim();

/** Decisions, actions and notes of an older record, wherever it kept them. */
function partsOf(raw: any) {
  const src = raw?.momData && typeof raw.momData === 'object' ? { ...raw.momData, ...raw } : raw || {};
  const asList = (v: any) => (Array.isArray(v) ? v : []);
  const decisions = asList(src.decisions?.length ? src.decisions : raw?.momData?.decisions)
    .map((d: any, i: number) => ({ id: String(d?.id || `d${i + 1}`), text: text(d) })).filter((d: any) => d.text);
  const actions = asList(src.actionItems?.length ? src.actionItems : src.actions || raw?.momData?.actionItems)
    .map((a: any, i: number) => ({
      id: String(a?.id || `a${i + 1}`), text: text(a), owner: a?.owner || '', ownerName: a?.ownerName || (typeof a?.owner === 'string' && !['client', 'ffds', 'vendor'].includes(a.owner) ? a.owner : null),
      dueDate: millis(a?.dueDate) || null, status: a?.status === 'done' || a?.status === 'cancelled' ? a.status : 'open', flags: a?.flags || {},
    })).filter((a: any) => a.text);
  const notes = asList(src.notes).map((n: any, i: number) => ({ id: String(n?.id || `n${i + 1}`), text: text(n) })).filter((n: any) => n.text);
  const loose = [src.rawNotes, typeof src.notes === 'string' ? src.notes : '', src.summary, src.discussionPoints]
    .map((x) => (typeof x === 'string' ? x.trim() : '')).find(Boolean) || '';
  return { decisions, actions, notes, loose, src };
}

function issuesOf(raw: any, status: string, team: { name: string }[], wasShown: boolean): MigrationIssue[] {
  const out: MigrationIssue[] = [];
  const names = team.map((t) => String(t.name || '').toLowerCase().trim()).filter(Boolean);
  const known = (n: string) => {
    const v = n.toLowerCase().trim();
    return names.some((t) => t === v || t.split(/\s+/)[0] === v.split(/\s+/)[0]);
  };
  const { actions } = partsOf(raw);
  const unknown = new Set<string>();
  let noOwner = 0;
  for (const a of actions) {
    if (a.status !== 'open') continue;
    const side = ['client', 'vendor'].includes(a.owner) ? a.owner : 'ffds';
    if (!a.ownerName && !a.owner) noOwner++;
    else if (side === 'ffds' && a.ownerName && !GENERIC_OWNERS.test(a.ownerName) && !known(a.ownerName)) unknown.add(a.ownerName);
  }
  for (const n of unknown) out.push({ kind: 'owner_unknown', text: `“${n}” owns an action and matches no one on the team` });
  if (noOwner) out.push({ kind: 'no_owner', text: `${noOwner} open action${noOwner === 1 ? ' has' : 's have'} no owner` });
  if (status === 'correction_requested') out.push({ kind: 'correction_open', text: 'A correction was asked and never answered' });
  if ((status === 'shared' || status === 'acknowledged') && !wasShown) out.push({ kind: 'never_shown', text: 'Shared, but the client portal never showed it. It stays hidden' });
  return out;
}

/**
 * What a check finds: every older record, once, with what needs a person's
 * look. `shown` says whether the portal showed an older record (lib/clientVisibility).
 */
export function planMigration(projects: ProjectSources[], team: { name: string }[], shown: (m: any) => boolean): MigrationPlan {
  const candidates: MigrationCandidate[] = [];
  const bySource: Record<MigrationSource, number> = { moms: 0, projectCopies: 0, visits: 0, history: 0 };
  let alreadyNew = 0;
  for (const p of projects) {
    const refs = new Set<string>();
    const ids = new Set<string>();
    for (const m of p.moms) {
      ids.add(String(m.id));
      if (m.momRef) refs.add(String(m.momRef));
    }
    const add = (source: MigrationSource, raw: any, momId: string) => {
      const { decisions, actions, notes, loose, src } = partsOf(raw);
      const ref = String(src.momRef || '');
      if (source !== 'moms') {
        if ((ref && refs.has(ref)) || ids.has(momId)) return;
        if (!decisions.length && !actions.length && !notes.length && !loose) return;
        if (ref) refs.add(ref);
        ids.add(momId);
      }
      const status = source === 'moms' ? mapStatus(raw.status) : mapStatus(src.status || (source === 'history' ? 'shared' : 'draft'));
      bySource[source]++;
      candidates.push({
        key: `${p.projectId}:${source}:${raw.id}`,
        source,
        projectId: p.projectId,
        projectName: p.projectName,
        momId,
        momRef: ref,
        title: String(src.meetingTitle || src.title || src.subject || (source === 'visits' ? raw.title : '') || 'Meeting'),
        meetingDate: millis(src.meetingDate || src.date || raw.date),
        status,
        issues: issuesOf(raw, status, team, source === 'moms' ? shown(raw) : true),
        notesOnly: !decisions.length && !actions.length && !notes.length,
        raw,
      });
    };
    for (const m of p.moms) {
      if (m?.format === 2) { alreadyNew++; continue; }
      add('moms', m, String(m.id));
    }
    for (const m of p.projectCopies) add('projectCopies', m, String(m.id));
    for (const v of p.visits) if (v?.momData && typeof v.momData === 'object') add('visits', v, `mig-visit-${v.id}`);
    for (const h of p.history) if (h?.id) add('history', h, `mig-history-${h.id}`);
  }
  candidates.sort((a, b) => b.meetingDate - a.meetingDate);
  return { candidates, alreadyNew, bySource };
}

export const BEFORE_PROCESS = 'Approved before the new process';

/**
 * The fields that bring one record across. For `moms` they are merged into
 * the document as it is; for the other sources they make a new document.
 */
export function migratedFields(c: MigrationCandidate, me: { email: string; name: string }, runId: string, now: number): Record<string, any> {
  const { decisions, actions, notes, loose, src } = partsOf(c.raw);
  let topics: MinutesTopic[] = fromLegacy({ decisions, actionItems: actions, notes });
  if (!topics.length && loose) topics = [{ id: 'discussion', title: 'Discussion', lines: [{ id: 'n1', kind: 'note', text: loose.slice(0, 4000) }] }];
  const issued = ISSUED.includes(c.status);
  const at = (v: any, d: number) => millis(v) || d;
  const held = c.meetingDate || at(src.createdAt, now);
  const step = (s: TrailEntry['step'], when: number, byName: string, by = ''): TrailEntry => ({ step: s, at: when, by, byName, note: 'Before the new process' });
  const trail: TrailEntry[] = [step('written', at(src.createdAt, held), String(src.preparedBy?.name || 'The studio'))];
  if (issued) trail.push(step('approved', at(src.finalisedAt || src.approvedAt, held), BEFORE_PROCESS));
  if (['shared', 'acknowledged', 'correction_requested'].includes(c.status)) trail.push(step('sent', at(src.sharedAt || src.sentAt, held), 'The studio'));
  if (c.status === 'acknowledged') trail.push(step('confirmed', at(src.acknowledgedAt, held), String(src.acknowledgedBy || 'The client')));
  if (c.status === 'correction_requested') trail.push(step('correction_asked', at(src.correctionRequest?.at, held), String(src.correctionRequest?.by || 'The client')));
  const approvedBy: Signed | null = issued ? (src.approvedBy?.name ? src.approvedBy : { email: '', name: BEFORE_PROCESS, role: null, at: at(src.finalisedAt || src.approvedAt, held) }) : null;
  const migration = { migratedAt: now, migratedBy: me.email, migratedFrom: c.source, migrationRun: runId };
  const common = { format: 2, topics, carried: [], trail, ...(approvedBy ? { approvedBy } : {}), ...migration };
  if (c.source === 'moms') return common;
  /* A copy: the client keeps reading the original where it was, so the copy is never shown in the portal. */
  return {
    ...common,
    momRef: c.momRef,
    meetingId: String(src.meetingId || (c.source === 'visits' ? c.raw.id : '') || ''),
    meetingType: String(src.meetingType || src.type || 'client_meeting'),
    meetingTitle: c.title,
    meetingDate: held,
    status: c.status,
    createdAt: at(src.createdAt, held),
    createdBy: String(src.createdBy || me.email),
    summary: typeof src.summary === 'string' ? src.summary : null,
    attendees: (Array.isArray(src.attendees) ? src.attendees : [])
      .map((a: any) => (typeof a === 'string' ? { name: a, side: 'client' } : { name: String(a?.name || ''), side: String(a?.side || 'client'), ...(a?.role ? { role: String(a.role) } : {}) }))
      .filter((a: any) => a.name),
    decisions, actionItems: actions, notes,
    rawNotes: loose,
    ...(c.status === 'acknowledged' ? { acknowledgedBy: String(src.acknowledgedBy || ''), acknowledgedAt: at(src.acknowledgedAt, held) } : {}),
    clientVisibility: { state: 'hidden', hiddenAt: new Date(now).toISOString(), hiddenReason: 'A studio copy of older minutes; the client reads the original' },
  };
}

/** How long the originals are kept, with an undo. */
export const KEEP_DAYS = 90;
