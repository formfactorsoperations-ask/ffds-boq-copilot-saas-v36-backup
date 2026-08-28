/**
 * SIGNATURE STATUS PANEL
 *
 * The one, single secondary signing surface — embedded wherever a document
 * page needs to show where a signature stands and offer a way to complete it
 * outside the client portal.
 *
 * Before this, four different pages (Terms Docket, Execution Agreement,
 * Handover Docket, and the Level 3 contract view) each carried their own
 * signing widget: their own status banner, their own "send email link" flow,
 * their own manual-override wiring, and in Execution Agreement's case, its own
 * in-person signing pad. Four implementations of the same idea, none of them
 * aware the others existed.
 *
 * The PRIMARY signing surface is the client portal's Reading Room — the client
 * reads the actual document and signs it there, with full reading evidence.
 * This panel is the fallback for when that is not possible: the client is on
 * site with no device, prefers to sign in person on the studio's tablet, or
 * already signed something on paper before the portal existed. Both fallback
 * routes write through the exact same canonical engine as the portal, so a
 * signature captured here is indistinguishable from one captured there.
 */

import React, { useState, useMemo } from 'react';
import {
  ProjectContext,
  ClientDocumentKind,
  DigitalSignatureDocket,
  FullProjectData
} from '../../types';
import { resolveApprovals, buildSignoffPatch, AgreementKind } from '../../services/clientApprovalEngine';
import {
  getCurrentIssue,
  resolveDocumentState,
  signIssue,
  agreementKindFor
} from '../../services/documentIssueEngine';
import { getOpenQueries } from '../../services/documentQueryEngine';
import { documentTitle, documentMode } from '../../services/documentReleaseEngine';
import DocumentReadingRoom from '../client/DocumentReadingRoom';
import SignatureCertificate from '../client/SignatureCertificate';
import ManualAcceptanceOverrideModal from '../ops/ManualAcceptanceOverrideModal';
import {
  ShieldCheck,
  PenTool,
  ShieldAlert,
  FileCheck,
  Clock,
  Eye,
  AlertTriangle,
  MessageCircleQuestion,
  Send
} from 'lucide-react';

interface SignatureStatusPanelProps {
  kind: ClientDocumentKind;
  projectContext: ProjectContext;
  setProjectContext: (updater: any) => void;
  projectId?: string;
  currentUserName?: string;
  /** Compact removes the surrounding card chrome, for embedding inside another card. */
  compact?: boolean;
  /**
   * Renders only the buttons, not the status text — for hosts that already show
   * their own status line (the Documents hub's release rows) and would
   * otherwise end up with two descriptions of the same state stacked on top of
   * each other. The buttons and everything they do stay identical either way;
   * this is the one implementation regardless of how it's dressed.
   */
  actionsOnly?: boolean;
}

const mins = (seconds?: number) => {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m} min ${seconds % 60}s` : `${seconds}s`;
};

const ago = (ts?: number | string | null) => {
  if (!ts) return null;
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

const SignatureStatusPanel: React.FC<SignatureStatusPanelProps> = ({
  kind,
  projectContext,
  setProjectContext,
  projectId,
  currentUserName = 'Studio',
  compact = false,
  actionsOnly = false
}) => {
  const [signingOnDevice, setSigningOnDevice] = useState(false);
  const [recordingOffline, setRecordingOffline] = useState(false);
  const [viewingCertificate, setViewingCertificate] = useState(false);

  const issue = useMemo(() => getCurrentIssue(projectContext, kind), [projectContext, kind]);
  const docState = useMemo(() => resolveDocumentState(projectContext, kind), [projectContext, kind]);
  const agreementKind: AgreementKind | null = agreementKindFor(kind);
  const approvals = useMemo(() => resolveApprovals(projectContext, 1), [projectContext]);
  const agreement = agreementKind ? approvals[agreementKind] : null;
  const openQueries = useMemo(() => getOpenQueries(projectContext, kind), [projectContext, kind]);

  const mode = documentMode(kind);
  const title = documentTitle(kind);
  const lastViewed = projectContext.documents?.lastViewedAt?.[kind];
  const evidence = agreement?.record?.docket?.readingEvidence;

  const projectData: FullProjectData = useMemo(
    () =>
      ({
        id: projectId || (projectContext as any).id || 'project',
        lastModified: Date.now(),
        context: projectContext,
        tiers: [],
        materials: [],
        timeline: []
      }) as any,
    [projectId, projectContext]
  );

  const wrap = (children: React.ReactNode) =>
    compact ? (
      <div className="space-y-3">{children}</div>
    ) : (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">{children}</div>
    );

  // ── Not released yet ────────────────────────────────────────────────────
  if (!issue) {
    return wrap(
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-700">Not sent to the client yet</p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            This document has not been released. Send it from the Documents hub — releasing
            freezes a copy the client reads and signs, so it stays separate from whatever you
            edit here afterwards.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'docs' }))}
            className="mt-2.5 px-3.5 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Go to Documents
          </button>
        </div>
      </div>
    );
  }

  // ── Review-only / acknowledge-mode: nothing to sign here ────────────────
  if (mode !== 'signature') {
    return wrap(
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
        <p className="text-[11px] text-slate-500">
          {mode === 'acknowledge'
            ? 'This document only needs the client to confirm they have it — no signature required.'
            : 'This document is informational — nothing for the client to confirm.'}
        </p>
      </div>
    );
  }

  // ── Client has a question, unresolved ───────────────────────────────────
  if (docState === 'queried' && openQueries.length > 0) {
    return wrap(
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0066CC]/10 text-[#0066CC] flex items-center justify-center shrink-0">
          <MessageCircleQuestion className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900">
            {openQueries.length} question{openQueries.length === 1 ? '' : 's'} from the client
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5 italic">
            &ldquo;{openQueries[0].question}&rdquo;
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'docs' }))}
            className="mt-2.5 px-3.5 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            Answer in Documents
          </button>
        </div>
      </div>
    );
  }

  // ── Signed / executed ────────────────────────────────────────────────────
  const isSigned = docState === 'signed' || docState === 'executed';
  if (isSigned) {
    if (actionsOnly) {
      return (
        <>
          <button
            onClick={() => setViewingCertificate(true)}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
          >
            View certificate
          </button>
          {viewingCertificate && issue && (
            <SignatureCertificate
              issue={issue}
              documentTitle={title}
              record={(agreement?.record as any) || null}
              studioName={currentUserName}
              clientName={projectContext.clientName}
              projectName={projectContext.name}
              onClose={() => setViewingCertificate(false)}
            />
          )}
        </>
      );
    }
    return (
      <>
        {wrap(
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  agreement?.disputed
                    ? 'bg-rose-100 text-rose-600'
                    : agreement?.recordedOffline
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {agreement?.disputed ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <FileCheck className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900">
                  {agreement?.disputed ? 'Client contested this record' : `Signed by ${agreement?.signedBy || 'client'}`}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {agreement?.signedAt
                    ? new Date(agreement.signedAt as any).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })
                    : ''}
                  {agreement?.recordedOffline && ` · recorded offline by ${agreement.recordedBy}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setViewingCertificate(true)}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer shrink-0"
            >
              View certificate
            </button>
          </div>
        )}
        {viewingCertificate && issue && (
          <SignatureCertificate
            issue={issue}
            documentTitle={title}
            record={(agreement?.record as any) || null}
            studioName={currentUserName}
            clientName={projectContext.clientName}
            projectName={projectContext.name}
            onClose={() => setViewingCertificate(false)}
          />
        )}
      </>
    );
  }

  // ── Released, unsigned: read receipt + the two backup routes ────────────
  const dwell = mins(evidence?.totalDwellSeconds);

  const backupButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setSigningOnDevice(true)}
        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0066CC] hover:bg-[#0055B3] text-white cursor-pointer flex items-center gap-1.5"
      >
        <PenTool className="w-3.5 h-3.5" />
        Sign here
      </button>
      <button
        onClick={() => setRecordingOffline(true)}
        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        Record offline
      </button>
    </div>
  );

  if (actionsOnly) {
    return (
      <>
        {backupButtons}
        {signingOnDevice && (
          <DocumentReadingRoom
            kind={kind}
            projectData={projectData}
            onClose={() => setSigningOnDevice(false)}
            onSignComplete={docket => {
              const stamped: DigitalSignatureDocket = {
                ...docket,
                ipAddress: 'Studio device — signed in person',
                witnessedBy: docket.witnessedBy || currentUserName
              };
              if (stamped.issueId) setProjectContext(signIssue(stamped.issueId, stamped));
              if (agreementKind) {
                setProjectContext(buildSignoffPatch(agreementKind, stamped, { surface: 'client_portal' }));
              }
              setSigningOnDevice(false);
            }}
          />
        )}
        {recordingOffline && (
          <ManualAcceptanceOverrideModal
            documentTitle={title}
            projectName={projectContext.name}
            defaultClientName={projectContext.clientName}
            defaultClientEmail={projectContext.clientEmail}
            recordedByUser={currentUserName}
            issueId={issue.id}
            contentHash={issue.contentHash}
            onClose={() => setRecordingOffline(false)}
            onConfirmOverride={docket => {
              if (docket.issueId) setProjectContext(signIssue(docket.issueId, docket));
              if (agreementKind) {
                const medium = docket.manualOverride?.approvalMedium;
                setProjectContext(
                  buildSignoffPatch(agreementKind, docket, {
                    surface: 'studio_manual',
                    via:
                      medium === 'whatsapp_approval'
                        ? 'WhatsApp'
                        : medium === 'email_confirmation'
                          ? 'email'
                          : null
                  })
                );
              }
              setRecordingOffline(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {wrap(
        <>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900">
                Sent to {projectContext.clientName || 'the client'} — awaiting their signature
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                <span>v{issue.version} · sent {ago(issue.issuedAt)}</span>
                {lastViewed ? (
                  <span className="text-[#0066CC] flex items-center gap-1">
                    <Eye className="w-3 h-3" /> opened {ago(lastViewed)}
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold">never opened</span>
                )}
                {dwell && <span>read for {dwell}</span>}
                {evidence && (issue.materialSections?.length || 0) > 0 && (
                  <span>
                    {evidence.sectionsAcknowledged?.length || 0}/{issue.materialSections?.length || 0} key
                    terms ticked
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            The client can sign this themselves from their portal — these are for when that is
            not possible.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSigningOnDevice(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0066CC] hover:bg-[#0055B3] text-white cursor-pointer flex items-center gap-1.5"
            >
              <PenTool className="w-3.5 h-3.5" />
              Sign here
            </button>
            <button
              onClick={() => setRecordingOffline(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Record offline
            </button>
          </div>
        </>
      )}

      {/* Backup route 1 — client signs here, on this device, with staff present. */}
      {signingOnDevice && (
        <DocumentReadingRoom
          kind={kind}
          projectData={projectData}
          onClose={() => setSigningOnDevice(false)}
          onSignComplete={docket => {
            const stamped: DigitalSignatureDocket = {
              ...docket,
              ipAddress: 'Studio device — signed in person',
              witnessedBy: docket.witnessedBy || currentUserName
            };
            if (stamped.issueId) setProjectContext(signIssue(stamped.issueId, stamped));
            if (agreementKind) {
              setProjectContext(buildSignoffPatch(agreementKind, stamped, { surface: 'client_portal' }));
            }
            setSigningOnDevice(false);
          }}
        />
      )}

      {/* Backup route 2 — a signature already given on paper, email or WhatsApp. */}
      {recordingOffline && (
        <ManualAcceptanceOverrideModal
          documentTitle={title}
          projectName={projectContext.name}
          defaultClientName={projectContext.clientName}
          defaultClientEmail={projectContext.clientEmail}
          recordedByUser={currentUserName}
          issueId={issue.id}
          contentHash={issue.contentHash}
          onClose={() => setRecordingOffline(false)}
          onConfirmOverride={docket => {
            if (docket.issueId) setProjectContext(signIssue(docket.issueId, docket));
            if (agreementKind) {
              const medium = docket.manualOverride?.approvalMedium;
              setProjectContext(
                buildSignoffPatch(agreementKind, docket, {
                  surface: 'studio_manual',
                  via:
                    medium === 'whatsapp_approval'
                      ? 'WhatsApp'
                      : medium === 'email_confirmation'
                        ? 'email'
                        : null
                })
              );
            }
            setRecordingOffline(false);
          }}
        />
      )}
    </>
  );
};

export default SignatureStatusPanel;
