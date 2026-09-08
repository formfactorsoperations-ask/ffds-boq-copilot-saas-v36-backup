/**
 * DOCUMENT RELEASE PANEL
 *
 * The studio's side of the client document flow: what has been sent, what the
 * client has done with it, and what to send next.
 *
 * The read receipts here are the quiet win. The portal already records exactly
 * how a document was read — when it was opened, which key terms were ticked and
 * how long each took — but until now none of that was visible to the people
 * chasing the signature. "Opened twice, stopped at the payment section, never
 * signed" is a different phone call from "never opened it".
 */

import React, { useMemo, useState } from 'react';
import {
  ProjectContext,
  FullProjectData,
  ClientDocumentKind,
  DocumentIssue,
  DocumentState
} from '../../types';
import {
  RELEASABLE_DOCUMENTS,
  getReleaseReadiness,
  releaseDocument,
  releasePack,
  recordReminder,
  getAddenda,
  documentTitle
} from '../../services/documentReleaseEngine';
import {
  getCurrentIssue,
  resolveDocumentState,
  agreementKindFor
} from '../../services/documentIssueEngine';
import { resolveApprovals } from '../../services/clientApprovalEngine';
import { getQueries } from '../../services/documentQueryEngine';
import { signIssue } from '../../services/documentIssueEngine';
import { buildSignoffPatch } from '../../services/clientApprovalEngine';
import DocumentReadingRoom from '../client/DocumentReadingRoom';
import ManualAcceptanceOverrideModal from './ManualAcceptanceOverrideModal';
import { documentMode } from '../../services/documentReleaseEngine';
import {
  Send,
  Check,
  Clock,
  Eye,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Bell,
  FileText,
  X,
  Layers,
  MessageCircleQuestion,
  PenTool,
  ShieldAlert
} from 'lucide-react';

interface DocumentReleasePanelProps {
  projectContext: ProjectContext;
  setProjectContext: (updater: any) => void;
  projectData?: FullProjectData;
  currentUserName?: string;
}

const STATE_LABEL: Record<DocumentState, { label: string; tone: string }> = {
  draft: { label: 'Not sent', tone: 'bg-slate-100 text-slate-500' },
  issued: { label: 'Sent — not opened', tone: 'bg-amber-100 text-amber-900' },
  viewed: { label: 'Opened — not signed', tone: 'bg-amber-500 text-white' },
  queried: { label: 'Client has a question', tone: 'bg-[#0066CC] text-white' },
  amended: { label: 'Re-issued — awaiting re-read', tone: 'bg-amber-500 text-white' },
  signed: { label: 'Signed', tone: 'bg-emerald-100 text-emerald-800' },
  executed: { label: 'Fully executed', tone: 'bg-emerald-600 text-white' }
};

const ago = (ts?: number | null) => {
  if (!ts) return null;
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

const mins = (seconds?: number) => {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m} min ${seconds % 60}s` : `${seconds}s`;
};

const DocumentReleasePanel: React.FC<DocumentReleasePanelProps> = ({
  projectContext,
  setProjectContext,
  projectData,
  currentUserName = 'Studio'
}) => {
  const [confirming, setConfirming] = useState<ClientDocumentKind | null>(null);
  const [releaseNote, setReleaseNote] = useState('');
  const [asPack, setAsPack] = useState(true);

  // Backup signing routes. The client portal is the primary place a document
  // gets signed; these exist for when that is not possible — the client is on
  // site with no laptop, or signed on paper weeks ago.
  const [signingOnDevice, setSigningOnDevice] = useState<ClientDocumentKind | null>(null);
  const [recordingOffline, setRecordingOffline] = useState<ClientDocumentKind | null>(null);

  const approvals = useMemo(() => resolveApprovals(projectContext, 1), [projectContext]);

  const rows = useMemo(
    () =>
      RELEASABLE_DOCUMENTS.map(def => {
        const issue = getCurrentIssue(projectContext, def.kind);
        const state = resolveDocumentState(projectContext, def.kind);
        const readiness = getReleaseReadiness(def.kind, projectContext, projectData);
        const agreementKind = agreementKindFor(def.kind);
        const agreement = agreementKind ? approvals[agreementKind] : null;
        const evidence = agreement?.record?.docket?.readingEvidence;
        const lastViewed = projectContext.documents?.lastViewedAt?.[def.kind];
        const addenda = issue ? getAddenda(projectContext, issue.id) : [];
        const openQueries = getQueries(projectContext, def.kind).filter(q => q.status === 'open');

        return { def, issue, state, readiness, agreement, evidence, lastViewed, addenda, openQueries };
      }),
    [projectContext, projectData, approvals]
  );

  const doRelease = (kind: ClientDocumentKind) => {
    const def = RELEASABLE_DOCUMENTS.find(d => d.kind === kind)!;
    const kinds = asPack && def.packWith ? [kind, ...def.packWith] : [kind];

    setProjectContext((prev: ProjectContext) =>
      releasePack(kinds, prev, projectData, {
        issuedBy: currentUserName,
        via: ['portal'],
        note: releaseNote.trim() || undefined
      })(prev)
    );

    setConfirming(null);
    setReleaseNote('');
  };

  const confirmDef = RELEASABLE_DOCUMENTS.find(d => d.kind === confirming);
  const confirmRow = rows.find(r => r.def.kind === confirming);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-[#0066CC]" />
            Documents to the client
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Releasing freezes a copy. The client reads and signs that copy, not the live settings.
          </p>
        </div>
      </div>

      {rows.map(row => {
        const chip = STATE_LABEL[row.state];
        const sent = !!row.issue;
        const staleDays = row.issue ? Math.floor((Date.now() - row.issue.issuedAt) / 86400000) : 0;
        const needsNudge = sent && (row.state === 'issued' || row.state === 'viewed') && staleDays >= 3;

        return (
          <div
            key={row.def.kind}
            className={`rounded-2xl border p-4 ${
              needsNudge ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-slate-900">{row.def.title}</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${chip.tone}`}>
                    {chip.label}
                  </span>
                  <span
                    title={row.def.modeReason}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.def.mode === 'signature'
                        ? 'bg-slate-900 text-white'
                        : row.def.mode === 'acknowledge'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {row.def.mode === 'signature'
                      ? 'Signature required'
                      : row.def.mode === 'acknowledge'
                        ? 'Acknowledge'
                        : 'Review only'}
                  </span>
                  {row.openQueries.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0066CC] text-white flex items-center gap-1">
                      <MessageCircleQuestion className="w-3 h-3" />
                      {row.openQueries.length}
                    </span>
                  )}
                  {row.addenda.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                      {row.addenda.length} addend{row.addenda.length === 1 ? 'um' : 'a'}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{row.def.purpose}</p>

                {/* ── Read receipts ───────────────────────────────────────── */}
                {sent && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                    <span className="text-slate-500">
                      <strong className="text-slate-700">v{row.issue!.version}</strong> ·{' '}
                      {row.issue!.reference} · sent {ago(row.issue!.issuedAt)}
                    </span>

                    {row.lastViewed ? (
                      <span className="text-slate-600 flex items-center gap-1">
                        <Eye className="w-3 h-3 text-[#0066CC]" />
                        opened {ago(row.lastViewed)}
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        never opened
                      </span>
                    )}

                    {row.evidence && (
                      <>
                        <span className="text-slate-600">
                          read for <strong>{mins(row.evidence.totalDwellSeconds)}</strong>
                        </span>
                        <span className="text-slate-600">
                          {row.evidence.sectionsAcknowledged?.length || 0} of{' '}
                          {row.issue?.materialSections?.length || 0} key terms ticked
                        </span>
                        <span className="text-slate-600">
                          {row.evidence.maxScrollPercent}% scrolled
                        </span>
                      </>
                    )}

                    {(row.issue!.reminders || []).length > 0 && (
                      <span className="text-slate-400">
                        {row.issue!.reminders!.length} reminder
                        {row.issue!.reminders!.length === 1 ? '' : 's'} sent
                      </span>
                    )}
                  </div>
                )}

                {/* ── Readiness ───────────────────────────────────────────── */}
                {!sent && row.readiness.blockers.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {row.readiness.blockers.map((b, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-rose-700 font-semibold flex items-start gap-1.5"
                      >
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {!sent && row.readiness.ready && row.readiness.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {row.readiness.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-amber-700 flex items-start gap-1.5"
                      >
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Actions ──────────────────────────────────────────────── */}
              <div className="flex items-center gap-2 shrink-0">
                {needsNudge && (
                  <button
                    onClick={() =>
                      setProjectContext(recordReminder(row.def.kind, currentUserName, 'portal'))
                    }
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    Nudge
                  </button>
                )}

                {/* Backup signing — only for documents that actually need a
                    signature, and only once they have been released. */}
                {sent &&
                  documentMode(row.def.kind) === 'signature' &&
                  row.state !== 'signed' &&
                  row.state !== 'executed' && (
                    <>
                      <button
                        onClick={() => setSigningOnDevice(row.def.kind)}
                        title="Client signs here, on this device, with you present"
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        Sign here
                      </button>
                      <button
                        onClick={() => setRecordingOffline(row.def.kind)}
                        title="Record a signature already given on paper, email or WhatsApp"
                        className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer flex items-center gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Record offline
                      </button>
                    </>
                  )}

                {row.state === 'signed' || row.state === 'executed' ? (
                  <span className="px-3 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Signed
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setConfirming(row.def.kind);
                      setAsPack(true);
                      setReleaseNote('');
                    }}
                    disabled={!row.readiness.ready}
                    className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 bg-[#0066CC] hover:bg-[#0055B3] disabled:bg-slate-200 disabled:text-slate-400 text-white"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sent ? 'Re-issue' : 'Release to client'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Addenda ────────────────────────────────────────────────── */}
            {row.addenda.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                {row.addenda.map(a => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="min-w-0">
                      <strong className="text-slate-800">{a.reference}</strong>
                      <span className="text-slate-500"> — {a.amendmentSummary}</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        a.clientSignature
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {a.clientSignature ? 'Signed' : 'Awaiting signature'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Backup route 1: client signs on the studio's device ──────────── */}
      {signingOnDevice && projectData && (
        <DocumentReadingRoom
          kind={signingOnDevice}
          projectData={{ ...projectData, context: projectContext }}
          onClose={() => setSigningOnDevice(null)}
          onSignComplete={(docket) => {
            // Signed by the client in the room, on a studio device. That is a
            // genuine electronic signature with full reading evidence — not an
            // override — so it takes the same path as a portal signature.
            const stamped = {
              ...docket,
              ipAddress: 'Studio device — signed in person',
              witnessedBy: currentUserName
            };
            if (stamped.issueId) setProjectContext(signIssue(stamped.issueId, stamped));
            const agreement = agreementKindFor(signingOnDevice);
            if (agreement) {
              setProjectContext(buildSignoffPatch(agreement, stamped, { surface: 'client_portal' }));
            }
            setSigningOnDevice(null);
          }}
        />
      )}

      {/* ── Backup route 2: record a signature given offline ──────────────── */}
      {recordingOffline && (
        <ManualAcceptanceOverrideModal
          documentTitle={documentTitle(recordingOffline)}
          projectName={projectContext.name}
          defaultClientName={projectContext.clientName}
          defaultClientEmail={projectContext.clientEmail}
          recordedByUser={currentUserName}
          issueId={getCurrentIssue(projectContext, recordingOffline)?.id}
          contentHash={getCurrentIssue(projectContext, recordingOffline)?.contentHash}
          onClose={() => setRecordingOffline(null)}
          onConfirmOverride={(docket) => {
            if (docket.issueId) setProjectContext(signIssue(docket.issueId, docket));
            const agreement = agreementKindFor(recordingOffline);
            if (agreement) {
              const medium = docket.manualOverride?.approvalMedium;
              setProjectContext(
                buildSignoffPatch(agreement, docket, {
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
            setRecordingOffline(null);
          }}
        />
      )}

      {/* ── Release confirmation ─────────────────────────────────────────── */}
      {confirming && confirmDef && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-[#0066CC]" />
                Release {confirmDef.title}
              </h3>
              <button
                onClick={() => setConfirming(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                A copy is frozen now and appears in{' '}
                <strong>{projectContext.clientName || 'the client'}</strong>&rsquo;s portal under
                <strong> Your Documents</strong>. Later changes to Studio Settings will not affect
                what they see or sign.
                {confirmRow?.issue && (
                  <>
                    {' '}
                    This becomes <strong>version {confirmRow.issue.version + 1}</strong>, and the
                    client is shown what changed since the version they read.
                  </>
                )}
              </p>

              {confirmDef.packWith && confirmDef.packWith.length > 0 && (
                <label className="flex items-start gap-3 p-3 rounded-xl bg-[#0066CC]/8 border border-[#0066CC]/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asPack}
                    onChange={e => setAsPack(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#0066CC] shrink-0"
                  />
                  <span>
                    <span className="block text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      Send as a pack
                    </span>
                    <span className="block text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      Also release{' '}
                      {confirmDef.packWith.map(k => documentTitle(k)).join(' and ')}. These
                      normally go out together — the terms are hard to judge without the payment
                      stages beside them.
                    </span>
                  </span>
                </label>
              )}

              {confirmRow && confirmRow.readiness.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                  {confirmRow.readiness.warnings.map((w, i) => (
                    <p
                      key={i}
                      className="text-[11px] text-amber-900 flex items-start gap-1.5 leading-relaxed"
                    >
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  Note to the client (optional)
                </label>
                <textarea
                  value={releaseNote}
                  onChange={e => setReleaseNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Clause 4.2 reflects what we agreed on the call — everything else is our standard docket."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#0066CC] resize-none"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => doRelease(confirming)}
                className="px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Release
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentReleasePanel;
