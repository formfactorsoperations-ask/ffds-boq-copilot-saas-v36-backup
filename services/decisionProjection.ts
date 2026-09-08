import { ProjectDecisionRecord } from '../types';

/**
 * Projects the decision ledger onto the shape the client portal reads.
 *
 * The ledger in Firestore (projects/{id}/decisions) is the source of truth;
 * `projectContext.projectDecisions` is this projection of it. The two carry
 * different status vocabularies, so the mapping lives here rather than being
 * re-derived by each caller — it was originally written inline in the Decisions
 * screen, which meant the portal only stayed current while that screen was open.
 *
 * The App-level subscription is the single writer of the projection. Anything
 * that wants to *change* a decision must write to the ledger and let the
 * projection follow; writing to the projection is silently undone on the next
 * snapshot.
 */

/** Ledger status -> portal status. `null` means "do not show the client". */
function toPortalStatus(ledgerStatus: string): ProjectDecisionRecord['status'] | null {
  switch (ledgerStatus) {
    case 'notified':
    case 'drawing_pending':
    case 'drawing_sent':
      return 'pending';
    case 'signed':
      return 'confirmed';
    case 'disputed':
      return 'rejected';
    default:
      // 'draft' — logged internally but not released to the client yet, the same
      // way a document reaches them when issued rather than when drafted.
      return null;
  }
}

/** Firestore Timestamp | Date | string -> ISO string. */
function toIso(value: any): string | undefined {
  if (!value) return undefined;
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function toProjectDecisionRecords(ledger: any[]): ProjectDecisionRecord[] {
  return (ledger || []).reduce((acc: ProjectDecisionRecord[], d: any) => {
    const status = toPortalStatus(d?.status);
    if (!status) return acc;

    const createdIso = toIso(d.createdAt);
    acc.push({
      id: d.id,
      date: (createdIso || new Date().toISOString()).split('T')[0],
      /*
        The fallback title. This read 'Site decision' unconditionally, so every
        decision the studio saved without typing a title showed up in the
        client's portal as a site decision — including ones raised months
        before a site existed. The record's own nature decides it now, and the
        room name is a better fallback than either.
      */
      title: d.title
        || (d.roomName ? `${d.roomName} decision` : undefined)
        || (d.decisionNature === 'site' ? 'Site decision' : 'Design decision'),
      roomId: d.roomName || undefined,
      // Carried through so the portal does not have to guess.
      decisionNature: d.decisionNature || undefined,
      category: d.category || undefined,
      photoUrl: d.photoURL || undefined,
      /*
        Attaching a drawing is a required step before sign-off is requested, so
        the client was being asked to approve against a document the portal
        never showed them.
      */
      drawingUrl: d.drawingURL || undefined,
      /*
        Both halves of the exchange. A client who asked a question and was
        answered should see the answer where they asked it, not have to take
        the studio's word for it in an email thread.
      */
      clientQuery: d.signoff?.queryText || undefined,
      studioReply: d.studioReply || undefined,
      // The full thread. The two fields above are the last turn of it, kept
      // because older records have no `discussion` array to read.
      discussion: Array.isArray(d.discussion)
        ? d.discussion.map((m: any) => ({
            from: m?.from === 'studio' ? 'studio' as const : 'client' as const,
            text: String(m?.text || ''),
            at: toIso(m?.at),
            author: m?.author || undefined
          })).filter((m: any) => m.text)
        : undefined,
      status,
      selectedOption: d.signoff?.type === 'approved' ? 'Approved by client' : undefined,
      // Carried so the portal can sign off against the ledger itself — Firestore
      // rules allow an unauthenticated client to update only via this token.
      signoffToken: d.signoffToken || undefined,
      notifiedAt: toIso(d.notifiedAt) || toIso(d.signoffRequestSentAt),
      clientConfirmedAt: toIso(d.signoff?.respondedAt),
      description: d.decisionText || undefined,
      requestedBy: 'ffds',
      confirmingParty: d.signoff?.clientNameEntered || d.clientName || undefined,
      impactCost: d.impactCostValue ? String(d.impactCostValue) : undefined,
      impactSchedule: d.impactScheduleDays
        ? `${d.impactScheduleDays} day${d.impactScheduleDays === 1 ? '' : 's'}`
        : undefined
    });
    return acc;
  }, []);
}
