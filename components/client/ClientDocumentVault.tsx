/**
 * CLIENT DOCUMENT VAULT
 *
 * One place for every document the studio has given the client — what it is,
 * which version they hold, where it stands, and the one action that makes sense
 * right now.
 *
 * Documents not yet released are shown too, greyed, with their release condition
 * stated plainly. Hiding them would leave the client guessing what is still
 * coming; inventing a status for them would be worse.
 */

import React, { useMemo, useState } from 'react';
import {
  FullProjectData,
  ClientDocumentKind,
  DocumentState,
  DocumentIssue,
  SignoffRecord
} from '../../types';
import { PROJECT_DOCUMENTS } from '../../lib/documentActions';
import {
  getCurrentIssue,
  getIssueHistory,
  resolveDocumentState,
  agreementKindFor
} from '../../services/documentIssueEngine';
import { resolveApprovals } from '../../services/clientApprovalEngine';
import { documentStatusLabel } from '../../services/documentReleaseEngine';
import { getQueries } from '../../services/documentQueryEngine';
import { getAddenda } from '../../services/documentReleaseEngine';
import SignatureCertificate from './SignatureCertificate';
import {
  FileText,
  FileCheck,
  Clock,
  Download,
  ChevronRight,
  ChevronDown,
  MessageCircleQuestion,
  AlertCircle,
  Eye,
  Lock
} from 'lucide-react';

interface ClientDocumentVaultProps {
  projectData: FullProjectData;
  studioName: string;
  /** `issueId` targets a specific issue — used to open an addendum. */
  onOpenDocument: (kind: ClientDocumentKind, issueId?: string) => void;
  /** Ask a question about the document as a whole, not one clause. */
  onAskQuestion?: (kind: ClientDocumentKind) => void;
}

/** Why a document the client cannot see yet does not exist yet. */
const RELEASE_CONDITION: Record<string, string> = {
  terms_docket: 'Prepared at the start of your engagement.',
  payment_schedule: 'Issued alongside your Terms of Engagement.',
  onboarding_kit: 'Shared once you have accepted the proposal.',
  execution_agreement: 'Drawn up once your design and BOQ are approved and frozen.',
  handover_docket: 'Issued after the joint snag walk-through, once finishing works are signed off.',
  snag_list: 'Every defect raised on site, and how each one was closed.'
};

const STATE_CHIP: Record<DocumentState, { label: string; tone: string }> = {
  draft: { label: 'Not yet released', tone: 'bg-slate-100 text-slate-500' },
  issued: { label: 'Ready to read & sign', tone: 'bg-amber-500 text-white' },
  viewed: { label: 'In progress', tone: 'bg-amber-100 text-amber-900' },
  queried: { label: 'Your question is with the studio', tone: 'bg-[#0066CC] text-white' },
  amended: { label: 'Updated — please review', tone: 'bg-amber-500 text-white' },
  /* `label` is a fallback only. The live wording comes from
     documentStatusLabel(state, kind, 'client') so an acknowledgement is never
     described to the client as a signature. */
  signed: { label: 'Signed', tone: 'bg-emerald-100 text-emerald-800' },
  executed: { label: 'Fully executed', tone: 'bg-emerald-600 text-white' }
};

const ACTION_LABEL: Record<DocumentState, string> = {
  draft: '',
  issued: 'Read & sign',
  viewed: 'Continue reading',
  queried: 'View your question',
  amended: 'View what changed',
  signed: 'View certificate',
  executed: 'View certificate'
};

const ClientDocumentVault: React.FC<ClientDocumentVaultProps> = ({
  projectData,
  studioName,
  onOpenDocument,
  onAskQuestion
}) => {
  const context = projectData.context;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [certificateFor, setCertificateFor] = useState<ClientDocumentKind | null>(null);

  const approvals = useMemo(() => resolveApprovals(context, 1), [context]);

  const rows = useMemo(() => {
    return PROJECT_DOCUMENTS.filter(d => d.clientVisible).map(doc => {
      const kind = doc.documentKind as ClientDocumentKind | undefined;
      const issue = kind ? getCurrentIssue(context, kind, { clientView: true }) : null;
      const state: DocumentState = kind ? resolveDocumentState(context, kind, { clientView: true }) : 'draft';
      const history = kind ? getIssueHistory(context, kind, { clientView: true }) : [];
      const allQueries = kind ? getQueries(context, kind) : [];
      const openQueries = allQueries.filter(q => q.status === 'open');
      // A studio reply the client has not been shown yet is worth surfacing —
      // it is the answer they were waiting on.
      const answeredQueries = allQueries.filter(
        q => q.status === 'answered' && q.replies.some(r => r.side === 'studio')
      );
      const addenda = issue ? getAddenda(context, issue.id) : [];
      const agreementKind = kind ? agreementKindFor(kind) : null;
      const agreement = agreementKind ? approvals[agreementKind] : null;

      return {
        id: doc.id,
        name: doc.name,
        group: doc.group,
        kind,
        issue,
        state,
        history,
        openQueries,
        answeredQueries,
        addenda,
        agreement,
        readable: !!kind && !!issue
      };
    });
  }, [context, approvals]);

  const grouped = useMemo(() => {
    const out: Record<string, typeof rows> = {};
    rows.forEach(r => {
      if (!out[r.group]) out[r.group] = [] as any;
      out[r.group].push(r);
    });
    return out;
  }, [rows]);

  const certRow = rows.find(r => r.kind === certificateFor);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-5 mb-5">
          <div className="space-y-1.5">
            <h3 className="font-black text-slate-900 text-xl tracking-tight flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-[#0066CC]" />
              Your Documents
            </h3>
            <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
              Everything your studio has issued to you, with the version you hold and where each
              one stands. Documents still to come are listed with when to expect them.
            </p>
          </div>
          <div className="px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-center shrink-0 min-w-[130px]">
            <p className="text-2xl font-black text-emerald-700 leading-none tabular-nums">
              {rows.filter(r => r.state === 'signed' || r.state === 'executed').length}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
              Signed
            </p>
          </div>
        </div>

        <div className="space-y-7">
          {(['Proposal', 'Agreement & Design', 'Execution'] as const).map(group => {
            const items = grouped[group];
            if (!items || items.length === 0) return null;

            return (
              <div key={group} className="space-y-2.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                  {group}
                </h4>

                {items.map(row => {
                  const chip = STATE_CHIP[row.state];
                  /* Tone from the map, wording from the shared vocabulary. */
                  const chipLabel = row.kind ? documentStatusLabel(row.state, row.kind, 'client') : chip.label;
                  const isOpen = expanded === row.id;
                  const older = row.history.filter(h => h.id !== row.issue?.id);

                  return (
                    <div
                      key={row.id}
                      className={`rounded-2xl border transition-colors ${
                        row.readable ? 'border-slate-200 bg-white' : 'border-slate-200/70 bg-slate-50/60'
                      }`}
                    >
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              row.state === 'signed' || row.state === 'executed'
                                ? 'bg-emerald-50 text-emerald-600'
                                : row.readable
                                  ? 'bg-[#0066CC]/10 text-[#0066CC]'
                                  : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {row.state === 'signed' || row.state === 'executed' ? (
                              <FileCheck className="w-4 h-4" />
                            ) : row.readable ? (
                              <FileText className="w-4 h-4" />
                            ) : (
                              <Lock className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5
                                className={`text-sm font-bold ${
                                  row.readable ? 'text-slate-900' : 'text-slate-500'
                                }`}
                              >
                                {row.name}
                              </h5>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${chip.tone}`}
                              >
                                {chipLabel}
                              </span>
                              {row.agreement?.recordedOffline && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                                  Recorded offline
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {row.issue ? (
                                <>
                                  Version {row.issue.version} · {row.issue.reference} · issued{' '}
                                  {new Date(row.issue.issuedAt).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </>
                              ) : (
                                RELEASE_CONDITION[row.kind || ''] ||
                                'Your studio will release this when it is ready.'
                              )}
                            </p>

                            {row.openQueries.length > 0 && (
                              <p className="text-[11px] text-[#0055B3] font-semibold mt-1 flex items-center gap-1.5">
                                <MessageCircleQuestion className="w-3 h-3" />
                                {row.openQueries.length} question
                                {row.openQueries.length === 1 ? '' : 's'} awaiting a reply
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                          {older.length > 0 && (
                            <button
                              onClick={() => setExpanded(isOpen ? null : row.id)}
                              className="px-2.5 py-2 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer flex items-center gap-1"
                            >
                              {older.length} earlier
                              {isOpen ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                          )}

                          {row.readable && row.kind && (
                            <button
                              onClick={() =>
                                row.state === 'signed' || row.state === 'executed'
                                  ? setCertificateFor(row.kind!)
                                  : onOpenDocument(row.kind!)
                              }
                              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-colors ${
                                row.state === 'issued' || row.state === 'amended'
                                  ? 'bg-[#0066CC] hover:bg-[#0055B3] text-white'
                                  : row.state === 'signed' || row.state === 'executed'
                                    ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                    : 'bg-[#0066CC] hover:bg-[#0055B3] text-white'
                              }`}
                            >
                              {row.state === 'signed' || row.state === 'executed' ? (
                                <FileCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                              {ACTION_LABEL[row.state]}
                            </button>
                          )}

                          {/* On every document, not only on a clause inside the
                              reading room. A client who wants to ask about a
                              document should not have to open it, find a clause
                              and comment on that one instead. */}
                          {onAskQuestion && row.kind && (
                            <button
                              onClick={() => onAskQuestion(row.kind!)}
                              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 border border-slate-200 hover:border-sky-300 hover:text-[#0055B3] transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Ask a question
                            </button>
                          )}

                          {row.readable && row.kind && (
                            <button
                              onClick={() => onOpenDocument(row.kind!)}
                              title="Open and download"
                              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}

                          {!row.readable && (
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 px-2">
                              <Clock className="w-3.5 h-3.5" />
                              Not yet issued
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Answers from the studio */}
                      {row.answeredQueries.length > 0 && (
                        <div className="px-4 pb-3 -mt-1 space-y-2">
                          {row.answeredQueries.map(q => {
                            const reply = [...q.replies].reverse().find(r => r.side === 'studio');
                            if (!reply) return null;
                            return (
                              <div
                                key={q.id}
                                className="p-3 rounded-xl bg-[#0066CC]/6 border border-[#0066CC]/20"
                              >
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#0055B3] mb-1">
                                  Your studio answered — clause {q.clauseRef}
                                </p>
                                <p className="text-[11px] text-slate-600 italic mb-1.5">
                                  &ldquo;{q.question}&rdquo;
                                </p>
                                <p className="text-[11px] text-slate-800 leading-relaxed">
                                  {reply.text}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {reply.by} ·{' '}
                                  {new Date(reply.at).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short'
                                  })}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Addenda — variations to a document already signed */}
                      {row.addenda.length > 0 && (
                        <div className="px-4 pb-4 -mt-1 space-y-2">
                          {row.addenda.map(a => (
                            <div
                              key={a.id}
                              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                a.clientSignature
                                  ? 'bg-emerald-50/50 border-emerald-200'
                                  : 'bg-amber-50/60 border-amber-300'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h6 className="text-xs font-bold text-slate-900">
                                    Addendum &mdash; {a.reference}
                                  </h6>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      a.clientSignature
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-500 text-white'
                                    }`}
                                  >
                                    {a.clientSignature ? 'Signed' : 'Needs your signature'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                                  {a.amendmentSummary}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  Varies clause {(a.amendsClauses || []).join(', ')} of the signed
                                  document. The original stays exactly as you signed it.
                                </p>
                              </div>
                              <button
                                onClick={() => row.kind && onOpenDocument(row.kind, a.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer shrink-0 ${
                                  a.clientSignature
                                    ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                    : 'bg-[#0066CC] hover:bg-[#0055B3] text-white'
                                }`}
                              >
                                {a.clientSignature ? 'View' : 'Read & sign'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {isOpen && older.length > 0 && (
                        <div className="px-4 pb-4 pt-0">
                          <div className="border-t border-slate-100 pt-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Earlier versions
                            </p>
                            {older.map(v => (
                              <div
                                key={v.id}
                                className="flex items-center justify-between gap-3 text-[11px] py-1"
                              >
                                <span className="text-slate-600">
                                  Version {v.version} · {v.reference}
                                </span>
                                <span className="text-slate-400 tabular-nums shrink-0">
                                  {new Date(v.issuedAt).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: '2-digit'
                                  })}
                                  {v.supersededAt ? ' · superseded' : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-2.5 px-1">
        <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed max-w-2xl">
          Every signed document keeps a certificate showing exactly what you agreed to, when, and
          how it was read. Open a signed document above to view or print it.
        </p>
      </div>

      {certificateFor && certRow?.issue && (
        <SignatureCertificate
          issue={certRow.issue}
          documentTitle={certRow.name}
          record={(certRow.agreement?.record as SignoffRecord) || null}
          studioName={studioName}
          clientName={context.clientName}
          projectName={context.name}
          onClose={() => setCertificateFor(null)}
        />
      )}
    </div>
  );
};

export default ClientDocumentVault;
