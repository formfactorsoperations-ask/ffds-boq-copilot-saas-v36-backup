import type { DocumentIssue, ProjectContext } from '../types';
import { publish } from './clientVisibility';

/*
  A SCOPE CHANGE THE CLIENT AGREED TO WITHOUT SIGNING ANYTHING.

  Clients are often unwilling to put every revision in writing: they agree in a
  meeting, on a call or on WhatsApp, and asking them to approve each version in
  the portal stalls the work. The studio records that agreement on the issue
  (who recorded it, when the client agreed, how, and a note), which counts as
  approved everywhere a signature or a portal approval does. The Detailed BOQ
  has always allowed this ("The client already approved it"); this gives a
  Scope Revision the same option.

  A recorded agreement is the studio's statement, not the client's: the
  approval record says so plainly, and the client sees it in their portal as
  "agreed", with nothing to sign.
*/

export type AgreedVia = 'meeting' | 'call' | 'whatsapp' | 'email' | 'other';

export const AGREED_VIA: { value: AgreedVia; label: string; phrase: string }[] = [
  { value: 'meeting', label: 'In a meeting', phrase: 'in a meeting' },
  { value: 'call', label: 'On a call', phrase: 'on a call' },
  { value: 'whatsapp', label: 'On WhatsApp', phrase: 'on WhatsApp' },
  { value: 'email', label: 'By email', phrase: 'by email' },
  { value: 'other', label: 'Other', phrase: '' },
];

export const agreedViaPhrase = (how?: string | null) => AGREED_VIA.find((v) => v.value === how)?.phrase || '';

export interface AgreementInput {
  approvedAt: number;
  recordedBy: string;
  how: AgreedVia;
  note: string;
}

/** Records the client's agreement on an issue and makes sure the client can see it. */
export function recordAgreement(issueId: string, a: AgreementInput) {
  return (prev: ProjectContext): ProjectContext => {
    if (!prev.documents) return prev;
    return {
      ...prev,
      documents: {
        ...prev.documents,
        issues: prev.documents.issues.map((i) =>
          i.id === issueId && !i.clientSignature && !i.recordedApproval
            ? {
                ...i,
                recordedApproval: { approvedAt: a.approvedAt, recordedBy: a.recordedBy, recordedAt: Date.now(), note: a.note.trim(), how: a.how },
                clientVisibility: i.clientVisibility?.state === 'published' ? i.clientVisibility : publish(a.recordedBy),
              }
            : i,
        ),
      },
    };
  };
}

export interface ApprovalInfo {
  kind: 'portal' | 'person' | 'recorded' | 'signed';
  name: string | null;
  email: string | null;
  at: number | null;
  how: string | null;
  note: string | null;
  recordedBy: string | null;
  recordedAt: number | null;
  witnessedBy: string | null;
  ip: string | null;
  userAgent: string | null;
}

/** However an issue was approved, in one shape for the screens and the record. */
export function approvalOf(issue: DocumentIssue | null | undefined): ApprovalInfo | null {
  if (!issue) return null;
  const d: any = issue.clientSignature;
  if (d) {
    return {
      kind: d.witnessedBy ? 'person' : d.signatureType === 'portal_approval' ? 'portal' : 'signed',
      name: d.signatoryName || null,
      email: d.signatoryEmail || null,
      at: d.signedAt ? new Date(d.signedAt).getTime() : null,
      how: null,
      note: null,
      recordedBy: null,
      recordedAt: null,
      witnessedBy: d.witnessedBy || null,
      ip: d.ipAddress || null,
      userAgent: d.userAgent || null,
    };
  }
  const r: any = issue.recordedApproval;
  if (r) {
    return {
      kind: 'recorded',
      name: null,
      email: null,
      at: r.approvedAt || null,
      how: r.how || null,
      note: r.note || null,
      recordedBy: r.recordedBy || null,
      recordedAt: r.recordedAt || null,
      witnessedBy: null,
      ip: null,
      userAgent: null,
    };
  }
  return null;
}

/** "Approved in the portal", "Agreed on WhatsApp", ... (callers add who recorded it). */
export function approvalLabel(a: ApprovalInfo): string {
  if (a.kind === 'recorded') {
    const via = agreedViaPhrase(a.how);
    return `Agreed${via ? ` ${via}` : ''}`;
  }
  return a.kind === 'person' ? 'Approved in person' : a.kind === 'portal' ? 'Approved in the portal' : 'Signed';
}
