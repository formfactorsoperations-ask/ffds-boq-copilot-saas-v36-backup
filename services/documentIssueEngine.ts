/**
 * DOCUMENT ISSUE ENGINE
 *
 * Makes "what the studio released" a real object rather than a live re-render.
 *
 * The client signs an immutable, hashed snapshot. If Studio Settings change next
 * month — a warranty period, a grace period, a jurisdiction — the signed record
 * is unaffected, and the certificate can still prove what was on screen at the
 * moment the signature was taken.
 *
 * `engagement.lockedSnapshot` already did this for the terms + payment pair.
 * This generalises it to every document kind, adds a content hash, and adds the
 * version chain that makes amendment redlines possible.
 */

import {
  ProjectContext,
  ClientDocumentKind,
  DocumentIssue,
  DocumentState,
  MaterialSection,
  ProjectDocumentState,
  IssueDiffEntry,
  TermsSettings,
  TermsSection
} from '../types';
import { resolveApprovals, AgreementKind } from './clientApprovalEngine';
import { draft as draftVisibility, isVisibleToClient } from '../lib/clientVisibility';

// ---------------------------------------------------------------------------
// HASHING
// ---------------------------------------------------------------------------

/** Stable stringify — key order must not change the hash. */
function stableStringify(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Deterministic FNV-1a over the stable serialisation, widened to 32 hex chars.
 *
 * This is an integrity anchor and a change detector, not a security boundary —
 * its audit value comes from being reproducible, not from being expensive to
 * forge. Formatted as `SHA256:<hex>` to match the docket-hash convention already
 * used across the app.
 */
export function hashSnapshot(snapshot: any): string {
  const input = stableStringify(snapshot);
  // Four independently seeded FNV-1a passes, concatenated to 32 hex characters.
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const parts = seeds.map(seed => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).toUpperCase().padStart(8, '0');
  });
  return `SHA256:${parts.join('')}`;
}

// ---------------------------------------------------------------------------
// MATERIAL SECTIONS
// ---------------------------------------------------------------------------

/**
 * Which sections genuinely bind the client, and therefore deserve an individual
 * acknowledgement. Chosen by meaning rather than position, because studios amend
 * and renumber their own sections.
 *
 * Capped at six. Fifteen tick boxes on boilerplate reads as an obstacle course
 * and trains people to click through — which destroys the evidence.
 */
const MATERIAL_MATCHERS: {
  test: RegExp;
  summary: string;
  dwell: number;
  priority: number;
}[] = [
  {
    // Specific before broad: this title also contains the word "advance",
    // which would otherwise be swallowed by the payment matcher below.
    test: /snag|pre-handover|handover inspection/i,
    summary: 'The final advance is due when the work is finished, not when snags are closed. Snags are fixed under warranty.',
    dwell: 8,
    priority: 4
  },
  {
    test: /advance|payment framework|payment schedule/i,
    summary: 'Every payment is made in advance, before that phase of work starts. Work pauses if an advance is overdue.',
    dwell: 8,
    priority: 1
  },
  {
    test: /termination|refund|cancel/i,
    summary: 'Advances for a phase that has already started are not refundable. This is what you can and cannot recover if you stop the project.',
    dwell: 8,
    priority: 2
  },
  {
    test: /change request|scope addition|variation/i,
    summary: 'Any change to agreed scope is priced and approved in writing before it is built.',
    dwell: 8,
    priority: 3
  },
  {
    test: /limitation of liability|liability/i,
    summary: "The studio's total liability is capped at the design fees you have paid.",
    dwell: 8,
    priority: 5
  },
  {
    test: /warranty/i,
    summary: 'What is covered after handover, for how long, and what falls outside it.',
    dwell: 4,
    priority: 6
  },
  {
    test: /dispute|jurisdiction/i,
    summary: 'Disputes go to mediation first, then to the courts named here.',
    dwell: 4,
    priority: 7
  }
];

/** Picks the binding sections out of an authored terms configuration. */
export function deriveMaterialSections(sections: TermsSection[] | undefined): MaterialSection[] {
  if (!sections || sections.length === 0) return [];

  const picked: (MaterialSection & { priority: number })[] = [];

  sections.forEach(section => {
    // First matcher whose concern has not already been claimed. A section title
    // can legitimately match several patterns; taking the first match outright
    // would silently drop the section when that slot is already filled.
    const match = MATERIAL_MATCHERS.find(
      m => m.test.test(section.title || '') && !picked.some(p => p.priority === m.priority)
    );
    if (!match) return;
    picked.push({
      ref: String(section.n),
      title: section.title,
      plainSummary: match.summary,
      minDwellSeconds: match.dwell,
      priority: match.priority
    });
  });

  return picked
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 6)
    .sort((a, b) => Number(a.ref) - Number(b.ref))
    .map(({ priority, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// ISSUING
// ---------------------------------------------------------------------------

const emptyState = (): ProjectDocumentState => ({ issues: [], queries: [], lastViewedAt: {} });

/**
 * Freezes a snapshot and releases it to the client.
 *
 * Returns a context updater — same shape as `buildSignoffPatch` — so callers can
 * use it inside a functional setState and merge against fresh context.
 */
export function issueDocument(
  kind: ClientDocumentKind,
  snapshot: any,
  opts: {
    issuedBy: string;
    reference: string;
    materialSections?: MaterialSection[];
  }
): (prev: ProjectContext) => ProjectContext {
  const now = Date.now();

  return (prev: ProjectContext): ProjectContext => {
    const base = prev || ({} as ProjectContext);
    const state = base.documents || emptyState();
    const existing = state.issues.filter(i => i.kind === kind);
    const current = existing.sort((a, b) => b.version - a.version)[0] || null;

    const issue: DocumentIssue = {
      id: `di-${kind}-${now}`,
      kind,
      version: (current?.version || 0) + 1,
      reference: opts.reference,
      issuedAt: now,
      issuedBy: opts.issuedBy,
      snapshot,
      contentHash: hashSnapshot(snapshot),
      materialSections: opts.materialSections || [],
      supersedes: current?.id || null,
      supersededAt: null,
      // Staged, not sent. Ops publishes it from the portal controls; until
      // then the client keeps reading whichever issue they had.
      clientVisibility: draftVisibility(),
      counterSignature: null
    };

    const issues = state.issues.map(i =>
      i.id === current?.id ? { ...i, supersededAt: now } : i
    );

    return {
      ...base,
      documents: {
        ...state,
        issues: [...issues, issue]
      }
    };
  };
}

/** Stamps that the client opened the current issue of this document. */
export function recordDocumentView(
  kind: ClientDocumentKind
): (prev: ProjectContext) => ProjectContext {
  const now = Date.now();
  return (prev: ProjectContext): ProjectContext => {
    const base = prev || ({} as ProjectContext);
    const state = base.documents || emptyState();
    return {
      ...base,
      documents: {
        ...state,
        lastViewedAt: { ...(state.lastViewedAt || {}), [kind]: now }
      }
    };
  };
}

/**
 * Records the client's signature against one specific issue.
 *
 * The three gated agreements also write through `buildSignoffPatch`, which keeps
 * every legacy alias and the lifecycle gates in step. Addenda have no gate of
 * their own, so the issue-level signature is the whole record for them.
 */
export function signIssue(
  issueId: string,
  docket: any
): (prev: ProjectContext) => ProjectContext {
  return (prev: ProjectContext): ProjectContext => {
    const state = prev?.documents;
    if (!state) return prev;
    return {
      ...prev,
      documents: {
        ...state,
        issues: state.issues.map(i => (i.id === issueId ? { ...i, clientSignature: docket } : i))
      }
    };
  };
}

/** Records the studio's counter-signature against the current issue. */
export function counterSignIssue(
  kind: ClientDocumentKind,
  docket: any
): (prev: ProjectContext) => ProjectContext {
  return (prev: ProjectContext): ProjectContext => {
    const base = prev || ({} as ProjectContext);
    const state = base.documents || emptyState();
    const current = getCurrentIssue(base, kind);
    if (!current) return base;
    return {
      ...base,
      documents: {
        ...state,
        issues: state.issues.map(i =>
          i.id === current.id ? { ...i, counterSignature: docket } : i
        )
      }
    };
  };
}

// ---------------------------------------------------------------------------
// READING
// ---------------------------------------------------------------------------

/**
 * The live issue for a document kind.
 *
 * Back-compatibility matters here: projects created before this engine existed
 * carry their terms in `engagement.lockedSnapshot`. Rather than migrating data,
 * synthesise a version-1 issue from it on read, so existing projects work
 * untouched.
 */
export interface IssueViewOptions {
  /**
   * Restrict to issues the client is allowed to see.
   *
   * Ops must always see the true latest — that is how they know something is
   * staged — so this is opt-in, and every client-facing caller passes it.
   * Nothing reaches a client until ops publishes it; an issue with no
   * visibility recorded has not been published and does not show.
   */
  clientView?: boolean;
}

/**
 * Whether a legacy document was actually released to the client.
 *
 * Not every document exists as a DocumentIssue. `getCurrentIssue` synthesises
 * the Terms of Engagement and the Payment Schedule from the engagement record
 * and the last terms docket, for projects that predate the issue model.
 *
 * That fallback used to run regardless of who was asking — twenty lines below a
 * filter whose own comment reads "an issue with no visibility recorded is not a
 * decision ops has made, so it is not one the client sees". So on any project
 * with engagement data, a client could be shown a terms docket or a payment
 * schedule the studio had never released.
 *
 * Blocking the fallback outright for clients was not the answer either: on
 * older projects these documents genuinely were issued, through the flow that
 * existed at the time, and hiding them would take away a contract the client
 * has already signed. Both records say plainly whether that happened — a
 * docket carries `sentAt` and a status past 'draft', an engagement carries
 * `issuedAt` and the same — so the question is answerable rather than guessed.
 */
function legacyWasReleased(context: ProjectContext, kind: ClientDocumentKind): boolean {
  const ctx = context as any;

  if (kind === 'terms_docket') {
    const dockets = context.termsDockets || [];
    const latest = dockets[dockets.length - 1] as any;
    if (latest && (latest.sentAt || latest.acknowledgedAt || (latest.status && latest.status !== 'draft'))) {
      return true;
    }
  }

  const engagement = ctx.engagement;
  return !!(engagement && (engagement.issuedAt || engagement.acknowledgedAt || engagement.status === 'issued' || engagement.status === 'acknowledged'));
}

export function getCurrentIssue(
  context: ProjectContext,
  kind: ClientDocumentKind,
  opts: IssueViewOptions = {}
): DocumentIssue | null {
  if (!context) return null;
  // Withdrawn issues stay in history but are no longer the live document, so a
  // retired legacy release falls back to draft and can be re-issued from the app.
  const issues = (context.documents?.issues || []).filter(
    i => i.kind === kind && !i.withdrawnAt && !i.addendumTo
         // Published only. An issue with no visibility recorded is not a
         // decision ops has made, so it is not one the client sees.
         && (!opts.clientView || isVisibleToClient(i as any))
  );
  if (issues.length > 0) {
    return issues.sort((a, b) => b.version - a.version)[0];
  }

  /*
    Past this point everything is synthesised from legacy records rather than
    read from an issue the studio published. A client only sees it if it was
    genuinely released to them.
  */
  /*
    Whether this was released is a fact about the document, not about who is
    asking. It used to be consulted only for `clientView`, so the client's
    portal said "Not yet released" while the studio's board said "Sent" about
    the same never-sent draft.

    The studio still needs the synthesised snapshot -- the release panel has to
    render the draft in order to release it -- so this no longer returns null
    for them. It marks the issue instead, and `resolveDocumentState` refuses to
    call an unreleased document issued.
  */
  const released = legacyWasReleased(context, kind);
  if (opts.clientView && !released) return null;

  const ctx = context as any;

  if (kind === 'terms_docket') {
    const engagement = ctx.engagement;
    const dockets = context.termsDockets || [];
    const latestDocket = dockets[dockets.length - 1];

    const termsSettings: TermsSettings | null =
      engagement?.lockedSnapshot?.termsSettings ||
      latestDocket?.snapshotTermsConfig ||
      null;

    if (!termsSettings) return null;

    /*
      The shape TermsDocketSheet actually reads.

      This used to carry `clientName` / `projectName` at the top level only.
      DocumentRenderer passes `snapshotClientData={snap.snapshotClientData}` to
      the sheet, and the sheet falls back to its own placeholder labels when
      that is absent — so a client opening their Terms of Engagement was shown
      a contract headed "CLIENT NAME: Client Name / PROJECT NAME: Project Name
      / DATE ISSUED: Date Issued". The values were on the project all along;
      they were being handed over under the wrong key.

      `latestDocket` and `org` are supplied for the same reason: the sheet reads
      them, and a synthesised issue must present the same shape as one built by
      `buildSnapshot`, or the two render differently for no visible reason.
    */
    const legacyIssuedAt =
      engagement?.issuedAt || latestDocket?.sentAt || latestDocket?.generatedAt || Date.now();

    const snapshotClientData = latestDocket?.snapshotClientData || {
      clientName: context.clientName,
      projectName: context.name,
      date: new Date(legacyIssuedAt).toLocaleDateString('en-IN'),
    };

    const snapshot = {
      termsSettings,
      snapshotClientData,
      latestDocket: latestDocket
        ? { docketRef: latestDocket.docketRef, status: latestDocket.status }
        : { docketRef: engagement?.docketRef || '—', status: 'issued' },
      org: {
        orgName: null,
        signatoryName: termsSettings?.signatory?.name || null,
        signatoryTitle: termsSettings?.signatory?.title || null,
      },
      clientName: context.clientName || latestDocket?.snapshotClientData?.clientName || 'Client',
      projectName: context.name,
      location: context.location,
      issuedOn: latestDocket?.snapshotClientData?.date || null
    };

    return {
      id: `di-terms_docket-legacy`,
      kind: 'terms_docket',
      version: 1,
      reference: engagement?.docketRef || latestDocket?.docketRef || '—',
      issuedAt: legacyIssuedAt,
      issuedBy: latestDocket?.sentBy || 'Studio',
      snapshot,
      contentHash: hashSnapshot(snapshot),
      materialSections: deriveMaterialSections(termsSettings.sections),
      legacyNeverReleased: !released,
      supersedes: null,
      supersededAt: null,
      counterSignature: null
    };
  }

  if (kind === 'payment_schedule') {
    const advances = ctx.engagement?.lockedSnapshot?.advances;
    if (!advances) return null;
    const snapshot = {
      advances,
      paymentStructure: ctx.engagement?.lockedSnapshot?.paymentStructure || null,
      designFee: ctx.engagement?.designFee ?? null,
      executionValue: ctx.engagement?.executionValue ?? null,
      gstRate: context.gstRate ?? 18
    };
    return {
      id: 'di-payment_schedule-legacy',
      kind: 'payment_schedule',
      version: ctx.engagement?.paymentScheduleVersion || 1,
      reference: ctx.engagement?.docketRef || '—',
      issuedAt: ctx.engagement?.issuedAt || Date.now(),
      issuedBy: 'Studio',
      snapshot,
      contentHash: hashSnapshot(snapshot),
      materialSections: [],
      legacyNeverReleased: !released,
      supersedes: null,
      supersededAt: null,
      counterSignature: null
    };
  }

  return null;
}

/** Every issue for a kind, newest first. */
export function getIssueHistory(
  context: ProjectContext,
  kind: ClientDocumentKind,
  opts: IssueViewOptions = {}
): DocumentIssue[] {
  /*
    History obeys the same publish gate as `getCurrentIssue`, and it did not.

    A re-issued Payment Schedule that ops had not yet published still appeared
    in the client's portal — filed under "Earlier versions", because the client
    was correctly being shown v1 as current while v2 sat unpublished. So the
    client saw a NEWER version described as older, and clicking it opened
    nothing. Withdrawn issues and addenda are excluded for the same reason they
    are excluded from `getCurrentIssue`: neither is a version of this document.
  */
  const issues = (context?.documents?.issues || []).filter(
    i => i.kind === kind
      && !i.withdrawnAt
      && !i.addendumTo
      && (!opts.clientView || isVisibleToClient(i as any))
  );
  if (issues.length === 0) {
    const synthesised = getCurrentIssue(context, kind, opts);
    return synthesised ? [synthesised] : [];
  }
  return issues.sort((a, b) => b.version - a.version);
}

/** Maps a document kind onto the agreement it gates, where one exists. */
export function agreementKindFor(kind: ClientDocumentKind): AgreementKind | null {
  if (kind === 'terms_docket') return 'terms';
  if (kind === 'execution_agreement') return 'contract';
  if (kind === 'handover_docket') return 'handover';
  return null;
}

/**
 * The six-state lifecycle. Resolution runs most-advanced first, so a signed
 * document is never reported as merely viewed.
 */
export function resolveDocumentState(
  context: ProjectContext,
  kind: ClientDocumentKind,
  opts: IssueViewOptions = {}
): DocumentState {
  if (!context) return 'draft';

  const issue = getCurrentIssue(context, kind, opts);
  const agreementKind = agreementKindFor(kind);

  let signed = false;
  if (agreementKind) {
    const approvals = resolveApprovals(context, 1);
    signed = approvals[agreementKind].state === 'signed';
  } else {
    // Acknowledge-mode documents have no agreement record to consult — the
    // client's confirmation is written onto the issue itself. Without this,
    // a confirmed payment schedule reads as "sent, never opened" forever.
    signed = !!issue?.clientSignature;
  }

  // A signed document with an unsigned addendum against it is not finished —
  // the client still owes a signature on the variation.
  const unsignedAddendum = (context.documents?.issues || []).some(
    i => i.addendumTo && i.addendumTo === issue?.id && !i.clientSignature
  );

  /*
    A REISSUE after the client signed.

    `signed` above comes from the agreement record, and that record is attached
    to the version the client actually put their name to — not to whatever is
    current now. So a signed terms docket that the studio then reissues as v2
    was still reported as 'signed': the portal showed "Signed", the client was
    never told a newer version existed, and the studio had no signature on the
    document that is actually live.

    The current issue supersedes an earlier one and carries no signature of its
    own, so the signature on file belongs to the superseded version. That is an
    amendment awaiting signature, exactly like an addendum.
  */
  const reissuedAfterSignature = !!issue && !!issue.supersedes && !issue.clientSignature;

  if (signed && (unsignedAddendum || reissuedAfterSignature)) return 'amended';
  if (signed && issue?.counterSignature) return 'executed';
  if (signed) return 'signed';
  if (!issue) return 'draft';

  /*
    Nothing was sent, so nothing downstream of sending can be true.

    `lastViewedAt` is checked below, and on a document that was never released
    that stamp cannot have come from the client -- they had nothing to open.
    Comparing the two turned a studio preview into "Opened 23 days ago".
  */
  if (issue.legacyNeverReleased) return 'draft';

  const openQuery = (context.documents?.queries || []).some(
    q => q.issueId === issue.id && q.status === 'open'
  );
  if (openQuery) return 'queried';

  const lastViewed = context.documents?.lastViewedAt?.[kind] || 0;

  // Re-issued after the client last read it — they owe a re-read, not a re-sign.
  if (issue.supersedes && lastViewed > 0 && lastViewed < issue.issuedAt) return 'amended';

  if (lastViewed >= issue.issuedAt) return 'viewed';

  return 'issued';
}

// ---------------------------------------------------------------------------
// DIFFING
// ---------------------------------------------------------------------------

const PRIMITIVE = (v: any) => v === null || v === undefined || typeof v !== 'object';

function describe(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return Array.isArray(v) ? `${v.length} item(s)` : 'section';
  return String(v);
}

/**
 * Field-level differences between two issues, phrased for a client.
 *
 * Re-reading fourteen sections to find one changed number is how deals die. The
 * redline is what turns an amendment from a chore into a thirty-second check.
 */
export function diffIssues(prev: DocumentIssue, next: DocumentIssue): IssueDiffEntry[] {
  const out: IssueDiffEntry[] = [];

  const walk = (a: any, b: any, path: string, label: string, depth: number) => {
    if (depth > 6 || out.length > 60) return;

    if (PRIMITIVE(a) || PRIMITIVE(b)) {
      if (a !== b) {
        out.push({
          path,
          label,
          before: describe(a),
          after: describe(b),
          changeType: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed'
        });
      }
      return;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        const item = b[i] || a[i];
        const itemLabel =
          item && typeof item === 'object' && (item.title || item.ref || item.label)
            ? `${label} — ${item.title || item.ref || item.label}`
            : `${label} [${i + 1}]`;
        walk(a[i], b[i], `${path}[${i}]`, itemLabel, depth + 1);
      }
      return;
    }

    const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
    keys.forEach(k => {
      const child = a?.[k] ?? b?.[k];
      const childLabel =
        child && typeof child === 'object' && (child.title || child.label)
          ? String(child.title || child.label)
          : `${label ? `${label} — ` : ''}${humanise(k)}`;
      walk(a?.[k], b?.[k], path ? `${path}.${k}` : k, childLabel, depth + 1);
    });
  };

  walk(prev.snapshot, next.snapshot, '', '', 0);
  return out;
}

function humanise(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, c => c.toUpperCase());
}

/** Section refs touched by a diff, for highlighting in the reader. */
export function changedSectionRefs(diff: IssueDiffEntry[]): string[] {
  const refs = new Set<string>();
  diff.forEach(d => {
    const m = d.path.match(/sections\[(\d+)\]/);
    if (m) refs.add(String(Number(m[1]) + 1));
  });
  return Array.from(refs);
}
