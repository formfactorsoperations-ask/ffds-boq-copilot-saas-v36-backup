/**
 * DOCUMENT RENDERER — the client portal's view of a released document.
 *
 * THE RULE: the app is the source of truth for every client document. Nothing
 * here rebuilds a document. Each case hands the frozen snapshot to the very same
 * Sheet component the studio page renders, so what the client reads and signs is
 * the document the studio produced — same branding, same clause numbering, same
 * tables, same figures.
 *
 * This file exists only to pick the right sheet and unpack the snapshot into it.
 * If you find yourself writing document markup in here, something has gone wrong.
 */

import React from 'react';
import { DocumentIssue } from '../../types';
import { DocumentSurface } from './DocumentBlocks';
import TermsDocketSheet from './TermsDocketSheet';
import PaymentScheduleSheet from './PaymentScheduleSheet';
import ExecutionAgreementSheet from './ExecutionAgreementSheet';
import HandoverDocketSheet from './HandoverDocketSheet';
import OnboardingKitSheet from './OnboardingKitSheet';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';

export interface DocumentRendererProps {
  /** The frozen issue. Never a live context object. */
  issue: DocumentIssue;
  surface: DocumentSurface;
  onClauseQuery?: (ref: string, excerpt: string) => void;
  /** Section refs changed since the reader last saw the document. */
  highlightRefs?: string[];
  studioName?: string;
}

/** Shown when a snapshot predates its sheet, or the document isn't out yet. */
const Unavailable: React.FC<{ what: string }> = ({ what }) => (
  <article className="doc-body">
    <p className="text-[13px] text-slate-500 leading-relaxed">
      This {what} is being prepared by your studio and will appear here once issued.
    </p>
  </article>
);

/**
 * A minimal ProjectContext shim built from the snapshot. The sheets read client
 * and project identity plus a few fallbacks; all of it was frozen at release, so
 * nothing reaches back into live project data.
 */
const shimContext = (snap: any) =>
  ({
    clientName: snap.clientName,
    name: snap.projectName,
    location: snap.location,
    clientEmail: snap.clientEmail,
    clientPhone: snap.clientPhone,
    area: snap.area,
    financials: snap.financials || {},
    engagement: { docketRef: snap.engagementDocketRef || snap.docketRef },
    termsDockets: [],
    paymentMilestones: snap.milestonesList || [],
    gstRate: snap.gstRate ?? 18
  }) as any;

const DocumentRenderer: React.FC<DocumentRendererProps> = ({
  issue,
  studioName = 'Design Studio'
}) => {
  const snap = issue.snapshot || {};
  const org = snap.org || {};
  const orgName = org.orgName || studioName;

  switch (issue.kind) {
    // ── Terms of Engagement ────────────────────────────────────────────────
    case 'terms_docket': {
      if (!snap.termsSettings) return <Unavailable what="docket" />;
      return (
        <TermsDocketSheet
          activeTermsConfig={snap.termsSettings}
          latestDocket={snap.latestDocket || { docketRef: issue.reference, status: 'issued' }}
          snapshotClientData={snap.snapshotClientData}
          orgData={{ ...org, orgName }}
        />
      );
    }

    // ── Payment Schedule ───────────────────────────────────────────────────
    case 'payment_schedule': {
      if (!snap.schedule) return <Unavailable what="payment schedule" />;
      return (
        <PaymentScheduleSheet
          schedule={snap.schedule}
          projectContext={shimContext(snap)}
          org={{ ...org, orgName }}
          showAmounts
        />
      );
    }

    // ── Master Execution Agreement ─────────────────────────────────────────
    case 'execution_agreement': {
      if (!snap.milestonesList && !snap.boq) return <Unavailable what="agreement" />;
      return (
        <ExecutionAgreementSheet
          projectContext={shimContext(snap)}
          orgData={{ ...org, orgName }}
          studioName={orgName}
          studioAddress={org.officeAddress}
          studioEmail={org.contactEmail}
          repName={org.signatoryName}
          clientName={snap.clientName}
          clientAddress={snap.clientAddress}
          clientEmail={snap.clientEmail}
          clientPhone={snap.clientPhone}
          projectName={snap.projectName}
          agreementDate={snap.agreementDate}
          dateStr={snap.dateStr}
          commencementTrigger={snap.commencementTrigger}
          estimatedDuration={snap.estimatedDuration}
          designFee={snap.designFee || 0}
          executionTotal={snap.executionTotal || 0}
          grandTotal={snap.grandTotal || 0}
          gstAmount={snap.gstAmount}
          gstRate={snap.gstRate ?? 18}
          milestonesList={snap.milestonesList || []}
          allAdvances={snap.allAdvances}
          boq={snap.boq}
          boqItemSpecOverrides={snap.boqItemSpecOverrides}
          groupedBoq={snap.groupedBoq}
          overrides={snap.overrides}
          calculateSellPrice={calculateSellPrice as any}
          formatCurrency={formatCurrency as any}
          /* No edit affordances for the client — read-only by omission. */
        />
      );
    }

    // ── Handover & Acceptance Docket ───────────────────────────────────────
    case 'handover_docket': {
      return (
        <HandoverDocketSheet
          projectContext={shimContext(snap)}
          studioName={orgName}
          clientName={snap.clientName}
          projectName={snap.projectName}
          displayDate={snap.displayDate || ''}
          defaultWarrantyPeriod={snap.defaultWarrantyPeriod}
          org={{
            orgLogo: org.orgLogo,
            contactEmail: org.contactEmail,
            contactPhone: org.contactPhone,
            officeAddress: org.officeAddress
          }}
        />
      );
    }

    // ── Onboarding Kit ─────────────────────────────────────────────────────
    case 'onboarding_kit': {
      return (
        <OnboardingKitSheet
          projectContext={shimContext(snap)}
          orgData={{ ...org, orgName }}
          studioName={orgName}
          clientName={snap.clientName}
          projectName={snap.projectName}
          location={snap.location}
          area={snap.area}
          designFee={snap.designFee}
          d1Amount={snap.d1Amount}
          docketRef={snap.docketRef}
          officeAddress={org.officeAddress}
        />
      );
    }

    default:
      return <Unavailable what="document" />;
  }
};

export default DocumentRenderer;
