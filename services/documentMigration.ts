import { ProjectContext, DocumentIssue } from '../types';

export interface LegacyAuditResult {
  withdrawable: Array<{
    issueId: string;
    kind: string;
    version: number;
    reference: string;
    seenByClient: boolean;
  }>;
  signedLegacy: Array<{
    issueId: string;
    kind: string;
    version: number;
    reference: string;
  }>;
}

export function auditLegacyIssues(context: ProjectContext): LegacyAuditResult {
  if (!context?.documents?.issues) return { withdrawable: [], signedLegacy: [] };
  
  const withdrawable: LegacyAuditResult['withdrawable'] = [];
  const signedLegacy: LegacyAuditResult['signedLegacy'] = [];

  context.documents.issues.forEach(issue => {
    // If it's already withdrawn or superseded, it's not active anyway
    if (issue.withdrawnAt || issue.supersededAt) return;
    
    // A legacy issue is one missing a snapshot, or one that has an old format
    if (!issue.snapshot) {
      if ((issue as any).signedAt || (issue as any).status === 'signed') {
        signedLegacy.push({
          issueId: issue.id,
          kind: issue.kind,
          version: issue.version,
          reference: issue.reference
        });
      } else {
        withdrawable.push({
          issueId: issue.id,
          kind: issue.kind,
          version: issue.version,
          reference: issue.reference,
          seenByClient: !!(context.documents?.lastViewedAt as any)?.[issue.kind]
        });
      }
    }
  });

  return { withdrawable, signedLegacy };
}

export function withdrawLegacyIssues() {
  return (prev: ProjectContext): ProjectContext => {
    if (!prev.documents?.issues) return prev;
    
    const now = Date.now();
    const newIssues = prev.documents.issues.map(issue => {
      if (!issue.withdrawnAt && !issue.supersededAt && !issue.snapshot) {
        return {
          ...issue,
          withdrawnAt: now,
          withdrawnReason: 'Legacy format unsupported by new renderer'
        };
      }
      return issue;
    });

    return {
      ...prev,
      documents: {
        ...prev.documents,
        issues: newIssues
      }
    };
  };
}

export function describeAudit(audit: LegacyAuditResult): string {
  const wCount = audit?.withdrawable?.length || 0;
  const sCount = audit?.signedLegacy?.length || 0;
  if (wCount === 0 && sCount === 0) {
    return 'No legacy documents found.';
  }
  const parts: string[] = [];
  if (wCount > 0) {
    parts.push(`Found ${wCount} legacy document(s) that were released before the studio sheets existed. The new renderer cannot display these documents correctly because they lack the required data snapshot.`);
  }
  if (sCount > 0) {
    parts.push(`${sCount} signed legacy document(s) will be kept as signed records.`);
  }
  return parts.join(' ');
}
