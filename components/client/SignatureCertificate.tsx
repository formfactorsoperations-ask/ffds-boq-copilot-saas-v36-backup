/**
 * SIGNATURE CERTIFICATE
 *
 * Portable proof of what was executed: the content hash of the exact bytes the
 * client was shown, both signatures, and the record of how the document was
 * read before it was signed.
 *
 * This page is the argument for the whole reading-evidence design. A squiggle
 * on its own proves very little; a squiggle attached to "opened 10:14, spent
 * 14 minutes, acknowledged five named terms individually" is a different thing
 * entirely if it is ever questioned.
 */

import React, { useRef } from 'react';
import { DocumentIssue, SignoffRecord, ReadingEvidence } from '../../types';
import { X, Printer, ShieldCheck, FileCheck, AlertCircle } from 'lucide-react';

interface SignatureCertificateProps {
  issue: DocumentIssue;
  documentTitle: string;
  record: SignoffRecord | null;
  studioName: string;
  clientName?: string;
  projectName?: string;
  onClose: () => void;
}

const MEDIUM_LABEL: Record<string, string> = {
  paper_wet_ink: 'Wet-ink signature on paper',
  email_confirmation: 'Email confirmation',
  whatsapp_approval: 'WhatsApp confirmation',
  in_person_verbal: 'Verbal confirmation, in person'
};

const fmt = (v: any, withTime = true) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  });
};

const duration = (seconds: number) => {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s.toString().padStart(2, '0')} s` : `${s} s`;
};

const Row: React.FC<{ label: string; children?: any }> = ({ label, children }) => (
  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-1.5 border-b border-slate-100 last:border-b-0">
    <dt className="w-40 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {label}
    </dt>
    <dd className="flex-1 min-w-0 text-xs text-slate-800 font-semibold break-words">{children}</dd>
  </div>
);

const SignatureCertificate: React.FC<SignatureCertificateProps> = ({
  issue,
  documentTitle,
  record,
  studioName,
  clientName,
  projectName,
  onClose
}) => {
  const sheetRef = useRef<any>(null);
  const docket = record?.docket;
  const evidence: ReadingEvidence | undefined = docket?.readingEvidence;
  const manual = docket?.manualOverride;
  const counter = issue.counterSignature;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex flex-col">
      <header className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <FileCheck className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 truncate">Certificate of Execution</h2>
            <p className="text-[11px] text-slate-400 truncate">{documentTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print / Save PDF</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div
          ref={sheetRef}
          className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-7"
        >
          {/* Masthead */}
          <header className="border-b-2 border-slate-900 pb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0066CC] mb-1">
              {studioName}
            </p>
            <h1 className="text-[22px] font-black text-slate-900 leading-tight tracking-tight">
              Certificate of Execution
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {documentTitle} · {projectName || '—'}
            </p>
          </header>

          {/* The record */}
          <section>
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-900 mb-2">
              The document
            </h3>
            <dl>
              <Row label="Document">
                {documentTitle} · Version {issue.version}
              </Row>
              <Row label="Reference">{issue.reference}</Row>
              <Row label="Content hash">
                <span className="font-mono text-[11px] break-all">{issue.contentHash}</span>
              </Row>
              <Row label="Issued">
                {fmt(issue.issuedAt)} IST · by {issue.issuedBy || studioName}
              </Row>
            </dl>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-2">
              The content hash fixes the exact wording that was on screen when this document
              was signed. Later edits to studio settings or templates do not alter this record.
            </p>
          </section>

          {/* Client execution */}
          <section>
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-900 mb-2">
              Client execution
            </h3>

            {!record || record.status !== 'signed' ? (
              <p className="text-xs text-slate-500 italic">This document has not been executed.</p>
            ) : (
              <>
                <dl>
                  <Row label="Signatory">
                    {record.signedBy || record.clientName || clientName || 'Client'}
                  </Row>
                  <Row label="Signed">{fmt(record.signedAt)} IST</Row>
                  <Row label="Method">
                    {manual?.isOverride
                      ? MEDIUM_LABEL[manual.approvalMedium] || 'Recorded offline'
                      : docket?.signatureType === 'draw'
                        ? 'Drawn signature'
                        : docket?.signatureType === 'type'
                          ? 'Typed signature'
                          : docket?.signatureType === 'upload'
                            ? 'Uploaded signature'
                            : 'Electronic signature'}
                  </Row>
                  <Row label="Origin">{record.ipAddress || docket?.ipAddress || '—'}</Row>
                  {docket?.witnessedBy && <Row label="Witnessed by">{docket.witnessedBy}</Row>}
                </dl>

                {record.signatureDataUrl && (
                  <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50/60 inline-block">
                    <img
                      src={record.signatureDataUrl}
                      alt="Client signature"
                      className="h-16 object-contain"
                    />
                  </div>
                )}

                {/* Offline provenance — stated plainly, never dressed as a seal. */}
                {manual?.isOverride && (
                  <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                    <p className="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Recorded offline
                    </p>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      Entered in this portal by <strong>{manual.recordedBy}</strong> on{' '}
                      {fmt(manual.recordedAt, false)}. Reason on file: {manual.overrideReason}
                    </p>
                    {manual.attachmentUrl && (
                      <a
                        href={manual.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[11px] font-bold text-amber-900 underline mt-1"
                      >
                        View the signed copy
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Reading record */}
          {record?.status === 'signed' && (
            <section>
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-900 mb-2">
                Reading record
              </h3>

              {!evidence ? (
                <p className="text-xs text-slate-500 leading-relaxed">
                  {manual?.isOverride
                    ? 'Signed offline, so no in-portal reading record exists for this execution.'
                    : 'This signature predates in-portal reading records.'}
                </p>
              ) : (
                <>
                  <dl>
                    <Row label="Opened">{fmt(evidence.openedAt)} IST</Row>
                    <Row label="Time engaged">{duration(evidence.totalDwellSeconds)}</Row>
                    <Row label="Document scrolled">{evidence.maxScrollPercent}%</Row>
                    <Row label="Downloaded">{evidence.documentDownloaded ? 'Yes' : 'No'}</Row>
                    <Row label="Device">
                      <span className="font-normal text-[11px] text-slate-500">
                        {evidence.viewport} · {evidence.device}
                      </span>
                    </Row>
                  </dl>

                  {(evidence.sectionsAcknowledged?.length || 0) > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Key terms acknowledged individually —{' '}
                        {evidence.sectionsAcknowledged.length} of {issue.materialSections?.length || 0}
                      </p>
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-collapse" style={{ minWidth: 460 }}>
                          <thead className="bg-slate-50">
                            <tr>
                              {['Ref', 'Term', 'Read for', 'Confirmed at'].map(h => (
                                <th
                                  key={h}
                                  className="py-2 px-3 border-b border-slate-200 font-bold text-slate-700 text-[10px] uppercase tracking-wider whitespace-nowrap"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {evidence.sectionsAcknowledged.map(sec => {
                              const meta = issue.materialSections?.find(m => m.ref === sec.ref);
                              return (
                                <tr key={sec.ref} className="border-b border-slate-100 last:border-b-0">
                                  <td className="py-2 px-3 font-mono text-[11px] text-slate-500 tabular-nums">
                                    {sec.ref}
                                  </td>
                                  <td className="py-2 px-3 text-[11px] text-slate-800 font-semibold">
                                    {meta?.title || '—'}
                                  </td>
                                  <td className="py-2 px-3 text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                                    {duration(sec.dwellSeconds)}
                                  </td>
                                  <td className="py-2 px-3 text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                                    {fmt(sec.acknowledgedAt)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Studio counter-execution */}
          <section>
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-900 mb-2">
              Studio counter-execution
            </h3>
            {counter ? (
              <>
                <dl>
                  <Row label="Signatory">
                    {counter.signatoryName}
                    {counter.signatoryRole ? `, ${counter.signatoryRole}` : ''}
                  </Row>
                  <Row label="Signed">{fmt(counter.signedAt)} IST</Row>
                </dl>
                {counter.signatureDataUrl && (
                  <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50/60 inline-block">
                    <img
                      src={counter.signatureDataUrl}
                      alt="Studio signature"
                      className="h-16 object-contain"
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500 italic">
                Awaiting counter-signature by {studioName}.
              </p>
            )}
          </section>

          <footer className="pt-5 border-t border-slate-200 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Executed under the Information Technology Act, 2000. This certificate is generated
              from the project record held by {studioName} and reflects the state of that record
              at the time of printing.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default SignatureCertificate;
