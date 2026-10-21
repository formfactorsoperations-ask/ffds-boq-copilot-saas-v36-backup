import type { DocumentIssue } from '../types';

/*
  A SCOPE REVISION THE CLIENT SENDS BACK FOR CHANGES.

  Until now the client could only approve a revision in the portal. A client
  who did not agree had no way to say so there, so the revision simply sat
  "awaiting your approval" while the real conversation happened on WhatsApp,
  and the studio's Revisions screen could not tell a client who disagreed from
  one who had not looked.

  Sending it back is the honest alternative to approving, and it is built so
  that neither side can use it against the other:

  - It changes nothing that is in force. The approved scope, the payment
    schedule and the project's figures move only when the studio applies an
    approved revision, and a revision that has been sent back cannot be
    approved, recorded as agreed or applied.
  - It is a request in the client's words, never an edit. The client cannot
    change a quantity or a rate, or approve part of a revision: the studio
    sends a complete new version, which the client approves or sends back as a
    whole.
  - It is recorded the way an approval is: the name typed, the login, the
    server's clock, the address and browser, and the fingerprint of exactly
    the version they were reading. It cannot be edited or taken back from the
    portal; a client who changes their mind tells the studio, who can send the
    same version again.
  - Each version can be sent back once. Once it is, it is the studio's to
    revise.
*/

/** What the client may say the change is about. A closed set: anything else is dropped. */
export const CHANGE_TOPICS: { value: ScopeChangeTopic; label: string }[] = [
  { value: 'quantities', label: 'Quantities' },
  { value: 'rates', label: 'Rates' },
  { value: 'add', label: 'Items to add' },
  { value: 'remove', label: 'Items to remove' },
  { value: 'specification', label: 'Finish or specification' },
  { value: 'other', label: 'Something else' },
];

export type ScopeChangeTopic = 'quantities' | 'rates' | 'add' | 'remove' | 'specification' | 'other';

export const CHANGE_NOTE_MIN = 10;
export const CHANGE_NOTE_MAX = 2000;

/** The client's request, written onto the issue they sent back. */
export interface ScopeChangeRequest {
  /** What they want changed, in their words. */
  message: string;
  topics: ScopeChangeTopic[];
  /** The name they typed. */
  name: string;
  /** The login it arrived with (server), or null from a studio device. */
  email: string | null;
  /** ISO time: the server's clock from the portal, the device's from a studio preview. */
  at: string;
  ip: string | null;
  userAgent: string | null;
  /** The fingerprint of the version they were reading. */
  contentHash: string | null;
  reference: string | null;
  /** 'portal' from the client's own login; 'studio_device' when taken in person. */
  via: 'portal' | 'studio_device';
  witnessedBy?: string | null;
}

export interface ChangeRequestMeta {
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  via?: 'portal' | 'studio_device';
  witnessedBy?: string | null;
}

/** A refusal, with the code the server turns into its own error. */
export class ChangeRequestRefused extends Error {
  constructor(public code: 'invalid-argument' | 'not-found' | 'failed-precondition' | 'already-exists', message: string) {
    super(message);
    this.name = 'ChangeRequestRefused';
  }
}

const clean = (s: unknown, max: number) =>
  String(s ?? '').replace(/[<>]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

export const isApprovedScopeIssue = (i: Partial<DocumentIssue> | null | undefined) =>
  !!(i && (i.clientSignature || i.recordedApproval || i.signedVia));

/** Sent back by the client and not approved since: the studio's to revise. */
export const isSentBack = (i: Partial<DocumentIssue> | null | undefined) =>
  !!(i && (i as any).changesRequested && !isApprovedScopeIssue(i));

/** Why this issue cannot be approved or recorded as agreed, or null when it can. */
export function sentBackBlock(i: Partial<DocumentIssue> | null | undefined): string | null {
  return isSentBack(i) ? 'You sent this version back for changes. The studio will send you a revised version to approve.' : null;
}

/**
 * The patch that records the request. Throws ChangeRequestRefused when the
 * request cannot be taken; the server maps the code onto its own error.
 */
export function requestChangesPatch(
  issueId: string,
  input: { name: unknown; message: unknown; topics?: unknown; contentHash?: string | null },
  meta: ChangeRequestMeta,
  now: () => Date = () => new Date(),
): (prev: any) => any {
  const name = clean(input.name, 80).replace(/\s+/g, ' ');
  const message = clean(input.message, CHANGE_NOTE_MAX);
  if (name.length < 2) throw new ChangeRequestRefused('invalid-argument', 'Type your name.');
  if (message.length < CHANGE_NOTE_MIN) {
    throw new ChangeRequestRefused('invalid-argument', 'Tell the studio what you would like changed.');
  }
  const allowed = new Set(CHANGE_TOPICS.map((t) => t.value));
  const topics = Array.from(new Set((Array.isArray(input.topics) ? input.topics : []).map(String)))
    .filter((t): t is ScopeChangeTopic => allowed.has(t as ScopeChangeTopic));

  return (prev: any) => {
    const issue = (prev?.documents?.issues || []).find((i: any) => i.id === issueId);
    if (!issue) throw new ChangeRequestRefused('not-found', 'This document is no longer available.');
    if (issue.kind !== 'scope_revision') {
      throw new ChangeRequestRefused('failed-precondition', 'Only a scope revision can be sent back from here. Message the studio instead.');
    }
    if (issue.withdrawnAt) throw new ChangeRequestRefused('failed-precondition', 'The studio has already withdrawn this version.');
    if (isApprovedScopeIssue(issue)) throw new ChangeRequestRefused('already-exists', 'This version is already approved.');
    if (issue.changesRequested) throw new ChangeRequestRefused('already-exists', 'You have already sent this version back. The studio is revising it.');
    if (issue.clientVisibility?.state !== 'published') {
      throw new ChangeRequestRefused('failed-precondition', 'This document has not been shared with you yet.');
    }
    if (input.contentHash && issue.contentHash && input.contentHash !== issue.contentHash) {
      throw new ChangeRequestRefused('failed-precondition', 'This document changed since you opened it. Refresh the page and review it again.');
    }

    const at = now();
    const via = meta.via || 'portal';
    const request: ScopeChangeRequest = {
      message,
      topics,
      name,
      email: meta.email || null,
      at: at.toISOString(),
      ip: meta.ip || null,
      userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 300) : null,
      contentHash: issue.contentHash || null,
      reference: issue.reference || null,
      via,
      ...(meta.witnessedBy ? { witnessedBy: String(meta.witnessedBy).slice(0, 80) } : {}),
    };
    const number = issue.snapshot?.number ?? issue.version;
    const topicWords = topics.map((t) => CHANGE_TOPICS.find((c) => c.value === t)!.label.toLowerCase()).join(', ');

    return {
      ...prev,
      documents: {
        ...prev.documents,
        issues: prev.documents.issues.map((i: any) => (i.id === issueId ? { ...i, changesRequested: request } : i)),
      },
      /* In the studio's client messages too, so Client Comms shows it as unanswered. */
      clientMessages: [
        ...(prev?.clientMessages || []),
        {
          id: `cm-${at.getTime()}-sr`,
          text: `Sent Scope Revision ${number} (${issue.reference || 'revised BOQ'}) back for changes${topicWords ? ` (${topicWords})` : ''}: ${message}`,
          sentAt: at.toISOString(),
          sentBy: name,
          readAt: null,
          readBy: null,
          aboutKind: 'document',
          aboutId: issue.id,
          aboutLabel: `Scope Revision ${number}`,
        },
      ],
    };
  };
}

/**
 * The version of the same revision the client sent back before this one, if
 * any: the portal and the email say this one answers it.
 */
export function previousSentBack(issues: DocumentIssue[] | undefined, issue: DocumentIssue | null | undefined): DocumentIssue | null {
  if (!issue || issue.kind !== 'scope_revision') return null;
  const number = (issue.snapshot as any)?.number;
  return (issues || [])
    .filter((i) => i.id !== issue.id && i.kind === 'scope_revision' && (i as any).changesRequested
      && (i.snapshot as any)?.number === number && (i.issuedAt || 0) < (issue.issuedAt || 0))
    .sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0))[0] || null;
}

/** Every time a revision went back to the studio, newest first: the record the studio revises from. */
export function sentBackHistory(issues: DocumentIssue[] | undefined, revisionNumber: number): { issue: DocumentIssue; request: ScopeChangeRequest }[] {
  return (issues || [])
    .filter((i) => i.kind === 'scope_revision' && (i as any).changesRequested && (i.snapshot as any)?.number === revisionNumber)
    .map((i) => ({ issue: i, request: (i as any).changesRequested as ScopeChangeRequest }))
    .sort((a, b) => Date.parse(b.request.at) - Date.parse(a.request.at));
}

export const topicLabels = (topics?: ScopeChangeTopic[] | null) =>
  (topics || []).map((t) => CHANGE_TOPICS.find((c) => c.value === t)?.label).filter(Boolean) as string[];
