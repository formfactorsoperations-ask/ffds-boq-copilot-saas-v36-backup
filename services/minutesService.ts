import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, updateDoc, deleteField, where } from 'firebase/firestore';
import { db } from './firebaseClient';
import { apiFetch } from './apiFetch';
import { calculateTimestamp } from './momService';
import {
  toLegacy, withStep, openFromEarlier, fromStructured, queueScopeLines, withQueueState, splitPrivate, outboxOf,
  templateById, templateTopics, designReviewFrom, emptyTopic, studioFollowUps, followUpId, type PrivatePart,
  type DesignReviewRecord, type MinutesContent, type MinutesTopic, type ReviewNote, type Signed, type TrailEntry, type CarriedAction,
} from '../lib/minutes';

/*
  Reading and writing minutes in the new format (lib/minutes.ts).

  Every write keeps the older fields -- decisions, actionItems, notes,
  carriedForward -- in step with the topics, so the screens that read minutes
  the old way (the action tracker, the scope queue, the Ops Desk lists) see
  the same minutes. The database rules decide who may move the minutes on:
  Client Relations writes, sends for approval and sends approved minutes; only
  a lead approves (firestore.rules, "THE MINUTES REVIEW STEP").
*/

const momPath = (studioId: string, projectId: string) => `organizations/${studioId}/projects/${projectId}/moms`;
export const minutesDoc = (studioId: string, projectId: string, momId: string) => doc(db, momPath(studioId, projectId), momId);

export interface Me { email: string; name: string; role?: string | null }
const signed = (me: Me, at: number): Signed => ({ email: me.email, name: me.name, role: me.role || null, at });
const step = (s: TrailEntry['step'], me: Me, at: number, note?: string | null): TrailEntry =>
  ({ step: s, at, by: me.email, byName: me.name, note: note ?? null });

/** Firestore refuses `undefined`; drop it everywhere (it means "not set"). */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}

/** The studio's own lines, kept beside the minutes where no client can read them (lib/minutes splitPrivate). */
export const privateDoc = (studioId: string, projectId: string, momId: string) =>
  doc(db, `${momPath(studioId, projectId)}/${momId}/private`, 'studio');

async function writePrivate(studioId: string, projectId: string, momId: string, topics: MinutesContent['topics']) {
  const { priv } = splitPrivate(topics);
  await setDoc(privateDoc(studioId, projectId, momId), clean({ ...priv, updatedAt: Date.now() }));
}

/*
  A revision answering a client's correction is written while the client can
  still read the minutes document, so its working copy and the reviewer's
  notes on it are kept beside the minutes, where no client rule reaches:
  moms/{id}/private/revision. Revisions started before this was so kept them
  on the minutes as `pendingRevision`; those are still read, and cleared on
  approval.
*/
export const revisionDoc = (studioId: string, projectId: string, momId: string) =>
  doc(db, `${momPath(studioId, projectId)}/${momId}/private`, 'revision');

export interface RevisionPart { content?: MinutesContent | null; reviewNotes?: ReviewNote[]; reviewedTopics?: MinutesTopic[] | null }

async function writeRevision(studioId: string, projectId: string, momId: string, part: RevisionPart) {
  await setDoc(revisionDoc(studioId, projectId, momId), clean({ ...part, updatedAt: Date.now() }), { merge: true });
}

/** The working copy and notes of a revision, as they change; null when there is none. */
export function watchRevision(studioId: string, projectId: string, momId: string, on: (r: RevisionPart | null) => void) {
  return onSnapshot(revisionDoc(studioId, projectId, momId), (s) => on(s.exists() ? (s.data() as RevisionPart) : null), () => on(null));
}

/** The topics as the client may read them: studio-only lines taken out. */
const sharedTopics = (topics: MinutesContent['topics']) => splitPrivate(topics).shared;

/** The content fields, with the older fields written from them. Studio-only lines never go here. */
function contentWrite(c: MinutesContent) {
  const topics = sharedTopics(c.topics);
  const legacy = toLegacy(topics, c.carried || []);
  return clean({
    topics,
    summary: c.summary ?? null,
    carried: c.carried || [],
    nextMeeting: c.nextMeeting ?? null,
    attendees: c.attendees || [],
    ...legacy,
  });
}

/** The next MOM-2026-014: the studio's numbering, unchanged. */
async function nextRef(tx: any, studioId: string): Promise<string> {
  const seqRef = doc(db, `organizations/${studioId}/sequences/moms`);
  const seqDoc = await tx.get(seqRef);
  const n = (seqDoc.exists() ? Number(seqDoc.data()?.current || 0) : 0) + 1;
  if (seqDoc.exists()) tx.update(seqRef, { current: n });
  else tx.set(seqRef, { current: n });
  return `MOM-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;
}

export interface MeetingSeed {
  meetingId: string;
  meetingType: string;
  meetingTitle: string;
  meetingDate: number;
  durationMinutes?: number | null;
  venue?: string | null;
  attendees: { name: string; side: string; role?: string; present?: boolean }[];
  /** Notes already taken on the meeting; offered in Quick capture. */
  notes?: string;
  /** The template it starts from (lib/minutes MEETING_TEMPLATES), and the project's stage. */
  template?: string | null;
  stage?: number | null;
  /** Design review minutes: the review held in Design Desk, which comes in locked. */
  designReview?: DesignReviewRecord | null;
}

/**
 * Start minutes from the meeting that happened: who and when are filled in,
 * and last meeting's open actions come first.
 */
export async function startMinutes(studioId: string, projectId: string, seed: MeetingSeed, me: Me, uid: string): Promise<string> {
  const earlier = await getDocs(collection(db, momPath(studioId, projectId)))
    .then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    .catch(() => [] as any[]);
  const carried = openFromEarlier(earlier);
  const now = Date.now();
  let id = '';
  await runTransaction(db, async (tx) => {
    const momRef = await nextRef(tx, studioId);
    const ref = doc(collection(db, momPath(studioId, projectId)));
    tx.set(ref, clean({
      format: 2,
      momRef,
      meetingId: seed.meetingId,
      meetingType: seed.meetingType,
      meetingTitle: seed.meetingTitle,
      meetingDate: seed.meetingDate,
      meetingEnd: seed.durationMinutes ? seed.meetingDate + seed.durationMinutes * 60000 : null,
      venue: seed.venue || null,
      createdBy: uid,
      createdAt: now,
      status: 'draft',
      rawNotes: seed.notes || '',
      aiGenerated: false,
      trail: [step('written', me, now)],
      preparedBy: signed(me, now),
      template: seed.template || null,
      stage: seed.stage ?? null,
      ...(seed.designReview ? { designReview: seed.designReview } : {}),
      ...contentWrite({
        /* From a design review the rooms are already recorded; the writer adds what was said around them. */
        topics: seed.designReview ? [emptyTopic('Also discussed', now)] : templateById(seed.template) ? templateTopics(templateById(seed.template)!) : [],
        carried, attendees: seed.attendees, summary: null, nextMeeting: null,
      }),
    }));
    id = ref.id;
  });
  return id;
}

/** Save what is being written. A revision saves into its working copy; the client keeps the minutes they have. */
export async function saveContent(studioId: string, projectId: string, momId: string, c: MinutesContent, revision: boolean) {
  const ref = minutesDoc(studioId, projectId, momId);
  await writePrivate(studioId, projectId, momId, c.topics);
  if (revision) {
    await writeRevision(studioId, projectId, momId, { content: { ...c, topics: sharedTopics(c.topics), revisionNote: c.revisionNote ?? null } });
    return;
  }
  await updateDoc(ref, { ...contentWrite(c), updatedAt: Date.now() });
}

export interface ReviewMeta { projectName: string }

/** Client Relations: send the minutes (or a revision of them) to the Ops Director. */
export async function sendForApproval(studioId: string, projectId: string, mom: any, c: MinutesContent, me: Me, meta: ReviewMeta) {
  const now = Date.now();
  const revision = mom.revisionStage === 'draft';
  const review = {
    reviewTenantId: studioId,
    reviewProjectId: projectId,
    reviewProjectName: meta.projectName || '',
    reviewRequestedBy: me.email,
    reviewRequestedAt: now,
    trail: withStep(mom.trail, step('sent_for_approval', me, now, revision ? `Revision ${Number(mom.rev || 0) + 1}` : null)),
  };
  const ref = minutesDoc(studioId, projectId, mom.id);
  await writePrivate(studioId, projectId, mom.id, c.topics);
  if (revision) {
    await writeRevision(studioId, projectId, mom.id, { content: { ...c, topics: sharedTopics(c.topics), revisionNote: c.revisionNote ?? null } });
    await updateDoc(ref, clean({ ...review, revisionStage: 'pending_review', updatedAt: now }));
  } else {
    await updateDoc(ref, clean({ ...review, ...contentWrite(c), preparedBy: signed(me, now), status: 'pending_review', updatedAt: now }));
  }
}

/** The Ops Director: back to the writer, with notes on the lines they are about. */
export async function returnWithNotes(studioId: string, projectId: string, mom: any, notes: ReviewNote[], me: Me) {
  const now = Date.now();
  const revision = mom.revisionStage === 'pending_review';
  const seen = revision ? mom.pendingRevision?.topics : mom.topics;
  const trail = withStep(mom.trail, step('returned', me, now, `${notes.length} note${notes.length === 1 ? '' : 's'}`));
  if (revision) {
    /* The client can read these minutes: the notes on a revision stay beside them. */
    await writeRevision(studioId, projectId, mom.id, { reviewNotes: notes, reviewedTopics: seen || [] });
    await updateDoc(minutesDoc(studioId, projectId, mom.id), clean({ revisionStage: 'draft', trail, updatedAt: now }));
    return;
  }
  await updateDoc(minutesDoc(studioId, projectId, mom.id), clean({
    status: 'draft',
    reviewNotes: notes,
    reviewedTopics: seen || [],
    trail,
    updatedAt: now,
  }));
}

/**
 * The Ops Director approves. A first issue becomes "finalised"; a revision
 * replaces the issued minutes, which are kept as they were. With `content`,
 * the lead wrote them and approves in one step: their name goes on both lines.
 * Actions from the last meeting marked done or dropped are closed on the
 * minutes they came from.
 */
export interface ApproveOptions {
  projectName?: string;
  /** Studio actions also become follow-ups on their owners' Ops Desk (Studio settings → Ops Desk). */
  followUps?: boolean;
}

export async function approve(studioId: string, projectId: string, mom: any, me: Me, content?: MinutesContent | null, opts: ApproveOptions = {}) {
  const now = Date.now();
  const ref = minutesDoc(studioId, projectId, mom.id);
  const revision = mom.revisionStage === 'pending_review' || mom.revisionStage === 'draft';
  const changes = (mom.trail || []).filter((t: TrailEntry) => t.step === 'returned').length;
  const note = content ? 'Written and approved in one step' : changes ? `after ${changes} return${changes === 1 ? '' : 's'}` : null;
  const trail = withStep(content ? withStep(mom.trail, step('sent_for_approval', me, now)) : mom.trail, step('approved', me, now, note));
  const common = {
    status: 'finalised',
    approvedBy: signed(me, now),
    ...(content ? { preparedBy: signed(me, now) } : {}),
    /* The review stays with the studio: the client can read issued minutes. */
    reviewNotes: [],
    reviewedTopics: null,
    rawNotes: '',
    trail,
    updatedAt: now,
  };
  if (content) await writePrivate(studioId, projectId, mom.id, content.topics);
  const queued = (c: MinutesContent): MinutesContent => ({ ...c, topics: queueScopeLines(sharedTopics(c.topics || []), me.email, now) });
  if (revision) {
    const next: MinutesContent = queued(content || mom.pendingRevision || { topics: [] });
    const snapshot = clean({
      rev: mom.rev || 0, topics: mom.topics || [], summary: mom.summary ?? null, decisions: mom.decisions || [],
      actionItems: mom.actionItems || [], notes: mom.notes || [], approvedBy: mom.approvedBy || null,
      sentAt: mom.sentAt || mom.sharedAt || null, correctionRequest: mom.correctionRequest || null,
    });
    await updateDoc(ref, {
      ...contentWrite(next),
      ...clean(common),
      outbox: clean(outboxOf(next.topics)),
      rev: Number(mom.rev || 0) + 1,
      revisedAt: now,
      revisedBy: me.email,
      revisionNote: next.revisionNote ?? null,
      previousRevisions: [...(mom.previousRevisions || []), snapshot],
      correctionRequest: null,
      pendingRevision: deleteField(),
      revisionStage: deleteField(),
      acknowledgedBy: deleteField(),
      acknowledgedAt: deleteField(),
      ackChannel: deleteField(),
      emailedAt: null,
      emailedTo: [],
    });
  } else {
    const issued: MinutesContent = content || {
      topics: mom.topics || [], summary: mom.summary ?? null, carried: mom.carried || [],
      nextMeeting: mom.nextMeeting ?? null, attendees: mom.attendees || [],
    };
    const q = queued(issued);
    await updateDoc(ref, { ...contentWrite(q), ...clean(common), outbox: clean(outboxOf(q.topics)) });
  }
  if (revision) await deleteDoc(revisionDoc(studioId, projectId, mom.id)).catch(() => undefined);
  await closeCarried(studioId, projectId, (content || mom).carried || []);
  if (opts.followUps) {
    const issued = content || (revision ? mom.pendingRevision : mom) || {};
    await addFollowUps(studioId, projectId, { ...mom, topics: sharedTopics(issued.topics || []) }, me, opts.projectName || mom.reviewProjectName || '', now);
  }
}

/**
 * The studio's actions onto their owners' Ops Desk, as follow-ups logged by
 * the approver (lib/opsDesk FollowUp). One per action: approving a revision
 * again finds the follow-up already there and leaves it.
 */
async function addFollowUps(studioId: string, projectId: string, mom: any, me: Me, projectName: string, now: number) {
  for (const f of studioFollowUps(mom.topics)) {
    try {
      await setDoc(doc(db, `projects/${projectId}/followUps`, followUpId(mom.id, f.lineId)), {
        tenantId: studioId,
        projectId,
        projectName,
        at: now,
        by: me.email,
        byName: me.name,
        channel: 'meeting',
        note: `From the minutes ${mom.momRef || ''}: ${f.text}`.slice(0, 2000),
        subject: null,
        outcome: 'info',
        next: { text: f.text, ownerEmail: f.ownerEmail, ownerName: f.ownerName, due: f.due },
        nextDone: false,
        manual: true,
      });
    } catch (e: any) {
      /* Already there from an earlier approval (the rules refuse a second write), or not this person's to add. */
      if (e?.code !== 'permission-denied') console.warn('Could not add a follow-up from the minutes', f.lineId, e);
    }
  }
}

/** Mark actions from earlier minutes done or dropped, on those minutes. */
async function closeCarried(studioId: string, projectId: string, carried: CarriedAction[]) {
  const byMom = new Map<string, CarriedAction[]>();
  for (const c of carried) if (c.momId && c.actionId && (c.outcome === 'done' || c.outcome === 'drop')) byMom.set(c.momId, [...(byMom.get(c.momId) || []), c]);
  for (const [momId, list] of byMom) {
    try {
      const ref = minutesDoc(studioId, projectId, momId);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const data: any = snap.data();
      const items = (data.actionItems || []).map((a: any) => {
        const hit = list.find((c) => c.actionId === a.id);
        return hit ? { ...a, status: hit.outcome === 'done' ? 'done' : 'cancelled' } : a;
      });
      const topics = (data.topics || []).map((t: MinutesTopic) => ({
        ...t,
        lines: t.lines.map((l) => {
          const hit = list.find((c) => c.actionId === l.id);
          return hit ? { ...l, status: hit.outcome === 'done' ? 'done' : 'cancelled' } : l;
        }),
      }));
      await updateDoc(ref, clean({ actionItems: items, ...(data.format === 2 ? { topics } : {}) }));
    } catch (e) {
      console.warn('Could not close an earlier action', momId, e);
    }
  }
}

/** Client Relations (or a lead): approved minutes go to the client. */
export async function markSent(studioId: string, projectId: string, mom: any, me: Me, channels: string[], emailedTo: string[], shareToken: string | null) {
  const now = Date.now();
  await updateDoc(minutesDoc(studioId, projectId, mom.id), clean({
    status: 'shared',
    sharedAt: now,
    sentAt: now,
    sentBy: signed(me, now),
    /* What puts the minutes in the client's portal (lib/clientVisibility): without it the portal leaves them out. */
    clientVisibility: { state: 'published', publishedAt: new Date(now).toISOString(), publishedBy: me.email },
    ...(emailedTo.length ? { emailedAt: now, emailedTo } : {}),
    ...(shareToken ? { shareToken } : {}),
    trail: withStep(mom.trail, step('sent', me, now, channels.join(' · '))),
    updatedAt: now,
  }));
}

/** Client Relations answers a correction: a revision, written beside the minutes the client has. */
export async function startRevision(studioId: string, projectId: string, mom: any, me: Me) {
  const now = Date.now();
  const working: MinutesContent = clean({
    topics: withQueueState(mom.topics || [], mom.actionItems), summary: mom.summary ?? null, carried: mom.carried || [],
    nextMeeting: mom.nextMeeting ?? null, attendees: mom.attendees || [], revisionNote: '',
  });
  await writeRevision(studioId, projectId, mom.id, { content: working, reviewNotes: [], reviewedTopics: null });
  await updateDoc(minutesDoc(studioId, projectId, mom.id), clean({
    revisionStage: 'draft',
    trail: withStep(mom.trail, step('revision_started', me, now, `Revision ${Number(mom.rev || 0) + 1}`)),
    updatedAt: now,
  }));
  return working;
}

/** Pasted notes into lines, each marked "from notes · check". */
export async function notesToTopics(input: { projectName: string; knownAttendees: string; meetingDate: number; rawNotes: string }): Promise<{ topics: MinutesTopic[]; summary: string }> {
  const res = await apiFetch('/api/structure-minutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectName: input.projectName,
      knownAttendees: input.knownAttendees,
      meetingDate: new Date(input.meetingDate || Date.now()).toISOString().slice(0, 10),
      rawNotes: input.rawNotes,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Could not read the notes. Try again.');
  const topics = (data.data?.topics || []).map((t: any) => ({
    ...t,
    lines: (t?.lines || []).map((l: any) => ({ ...l, due: l?.dueDateText ? calculateTimestamp(String(l.dueDateText), input.meetingDate) ?? null : null })),
  }));
  return { topics: fromStructured({ ...data.data, topics }), summary: String(data.data?.summary || '').trim() };
}

export interface WaitingMinutes { id: string; projectId: string; projectName: string; status: string; meetingTitle?: string; momRef?: string; meetingDate?: number; raw: any }

const asWaiting = (d: any): WaitingMinutes => {
  const m = d.data();
  return { id: d.id, projectId: m.reviewProjectId || d.ref.parent.parent?.id || '', projectName: m.reviewProjectName || '', status: 'pending_review', meetingTitle: m.meetingTitle, momRef: m.momRef, meetingDate: m.meetingDate, raw: { id: d.id, ...m } };
};

/** Revisions waiting for approval (first issues come with the Ops Desk's own query). */
export async function revisionsWaiting(tenantId: string): Promise<WaitingMinutes[]> {
  const s = await getDocs(query(collectionGroup(db, 'moms'), where('reviewTenantId', '==', tenantId), where('revisionStage', '==', 'pending_review')));
  return s.docs.map(asWaiting);
}

/** The lead's queue: first issues and revisions waiting for approval, oldest first. */
export async function waitingForApproval(tenantId: string): Promise<WaitingMinutes[]> {
  const [first, revisions] = await Promise.all([
    getDocs(query(collectionGroup(db, 'moms'), where('reviewTenantId', '==', tenantId), where('status', '==', 'pending_review'))).then((s) => s.docs.map(asWaiting)).catch(() => [] as WaitingMinutes[]),
    revisionsWaiting(tenantId).catch(() => [] as WaitingMinutes[]),
  ]);
  return [...first, ...revisions]
    .filter((m) => m.raw?.format === 2)
    .sort((a, b) => (a.raw.reviewRequestedAt || 0) - (b.raw.reviewRequestedAt || 0));
}

/** Live minutes, as they move between people. */
export function watchMinutes(studioId: string, projectId: string, momId: string, on: (m: any) => void, onError?: (e: any) => void) {
  return onSnapshot(minutesDoc(studioId, projectId, momId), (s) => { if (s.exists()) on({ id: s.id, ...(s.data() as any) }); }, onError);
}

/**
 * Internal and vendor meetings: no approval and never sent to the client.
 * Saved straight to the project's log, with a name and a time.
 */
export async function saveToLog(studioId: string, projectId: string, mom: any, c: MinutesContent, me: Me) {
  const now = Date.now();
  await writePrivate(studioId, projectId, mom.id, c.topics);
  await updateDoc(minutesDoc(studioId, projectId, mom.id), clean({
    ...contentWrite(c),
    status: 'finalised',
    loggedAt: now,
    preparedBy: signed(me, now),
    trail: withStep(mom.trail, step('logged', me, now)),
    updatedAt: now,
  }));
}

/** The studio's own lines, as they change. */
export function watchPrivate(studioId: string, projectId: string, momId: string, on: (p: PrivatePart | null) => void) {
  return onSnapshot(privateDoc(studioId, projectId, momId), (s) => on(s.exists() ? (s.data() as PrivatePart) : null), () => on(null));
}

/** Requirements, selections or design changes added where they belong: marked so they are not offered again. */
export async function markFiled(studioId: string, projectId: string, momId: string, lineIds: string[], me: Me, where: string) {
  const now = Date.now();
  const patch: Record<string, any> = { updatedAt: now };
  for (const id of lineIds) patch[`filed.${id}`] = { at: now, by: me.email, byName: me.name, where };
  await updateDoc(minutesDoc(studioId, projectId, momId), patch);
}

/** Every minutes of one project, newest first. */
export async function projectMinutes(studioId: string, projectId: string): Promise<any[]> {
  const s = await getDocs(collection(db, momPath(studioId, projectId)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => (Number(b.meetingDate) || 0) - (Number(a.meetingDate) || 0));
}

/**
 * The project's design reviews held in Design Desk, newest first, as minutes
 * keep them (lib/minutes designReviewFrom). A lead reads the meetings
 * themselves; Client Relations, who may not see revision fees, reads the
 * client-safe copy in the portal view.
 */
export async function loadDesignReviews(studioId: string, projectId: string): Promise<DesignReviewRecord[]> {
  const pick = (list: any[]) => list.map(designReviewFrom).filter((r): r is DesignReviewRecord => !!r).sort((a, b) => b.heldAt - a.heldAt);
  try {
    const s = await getDocs(query(collection(db, `organizations/${studioId}/projects/${projectId}/designMeetings`), where('state', '==', 'CLOSED')));
    return pick(s.docs.map((d) => ({ ...(d.data() as any), id: d.id })));
  } catch {
    const v = await getDoc(doc(db, 'projects', projectId, 'portalView', 'current')).catch(() => null);
    return pick((v?.exists() ? (v.data() as any)?.designRecord : null) || []);
  }
}
