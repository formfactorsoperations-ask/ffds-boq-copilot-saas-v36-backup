import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertTriangle, Loader2, X } from 'lucide-react';
import { ClientDocumentKind, DocumentIssue, FullProjectData, ProjectContext, SignoffRecord } from '../../types';
import DocumentRenderer from './DocumentRenderer';
import { CertificateBody, CertificateApproval, signoffFromIssue } from '../client/SignatureCertificate';
import { buildSnapshot, documentTitle, getReleaseReadiness } from '../../services/documentReleaseEngine';
import { downloadElementAsPdf, pdfFilename, PDF_CONTENT_WIDTH_PX, PdfRibbon } from '../../lib/documentPdf';

/**
 * DOWNLOAD A DOCUMENT AS A PDF — for the studio's Documents board and the
 * client's document vault.
 *
 *  - An issued document downloads as issued: the frozen snapshot, through the
 *    same renderer the client reads, so the PDF is the paper they were shown.
 *  - A signed or approved one gets its Certificate of Execution as a last page.
 *  - A document never issued (studio only) downloads as a DRAFT built from
 *    today's project data, stamped on every page. If the project is missing
 *    something the document needs, the studio is told what instead.
 */

interface Studio {
  orgName?: string | null;
  officeAddress?: string | null;
  contactEmail?: string | null;
}

export interface DownloadTarget {
  kind: ClientDocumentKind;
  /** The issue to download. Null downloads a draft (studio only). */
  issue: DocumentIssue | null;
  /** The signature held in the approvals record (terms, agreement, handover). */
  agreementRecord?: SignoffRecord | null;
}

interface Job {
  kind: ClientDocumentKind;
  issue: DocumentIssue;
  draft: boolean;
  certificate: { record: SignoffRecord | null; approval: CertificateApproval | null } | null;
  filename: string;
  title: string;
  ribbon: PdfRibbon;
}

/** The status every page of the PDF carries in its corner. */
function ribbonFor(draft: boolean, certificate: Job['certificate']): PdfRibbon {
  if (draft) return { label: 'Draft', tone: 'draft' };
  if (certificate?.record?.status === 'signed') return { label: 'Signed', tone: 'signed' };
  if (certificate?.approval) return { label: 'Approved', tone: 'approved' };
  return { label: 'Issued', tone: 'issued' };
}

/**
 * The certificate a document carries, or null when it has none yet.
 */
export function certificateFor(
  issue: DocumentIssue,
  context: ProjectContext,
  agreementRecord?: SignoffRecord | null,
): Job['certificate'] {
  const record = (agreementRecord?.status === 'signed' ? agreementRecord : null) || signoffFromIssue(issue);
  if (record) return { record, approval: null };
  if (issue.recordedApproval) {
    return { record: null, approval: { type: 'recorded', ...issue.recordedApproval } };
  }
  if (issue.signedVia) {
    const via = (context.documents?.issues || []).find(i => i.id === issue.signedVia) || null;
    return {
      record: null,
      approval: {
        type: 'via',
        reference: via?.reference || 'its scope revision',
        title: via ? documentTitle(via.kind) : 'Scope Revision',
        record: signoffFromIssue(via),
      },
    };
  }
  return null;
}

/** Documents prepared in the Revision Studio have no draft outside it. */
const NO_DRAFT: Partial<Record<ClientDocumentKind, string>> = {
  detailed_boq: 'The Detailed BOQ is recorded in the Revision Studio. It can be downloaded once it is.',
  scope_revision: 'A Scope Revision is prepared in the Revision Studio. It can be downloaded once it is issued there.',
};

export function useDocumentDownload(args: {
  context: ProjectContext;
  projectData?: FullProjectData;
  studio: Studio;
  /** Studio surfaces may download drafts; the client's never does. */
  allowDrafts: boolean;
}) {
  const { context, projectData, studio, allowDrafts } = args;
  const [job, setJob] = useState<Job | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'block'; text: string } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const studioName = studio.orgName || 'Form Factors Design Studio';

  const say = (tone: 'ok' | 'block', text: string) => {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(m => (m?.text === text ? null : m)), tone === 'ok' ? 4000 : 9000);
  };

  /** Whether a draft can be built for this kind right now, and if not, why. */
  const draftProblem = useCallback((kind: ClientDocumentKind): string | null => {
    if (!allowDrafts) return 'Available once your studio issues it.';
    if (NO_DRAFT[kind]) return NO_DRAFT[kind]!;
    const readiness = getReleaseReadiness(kind, context, projectData);
    return readiness.blockers.length ? `Not ready for a draft yet: ${readiness.blockers[0]}` : null;
  }, [allowDrafts, context, projectData]);

  const download = useCallback((target: DownloadTarget) => {
    if (job) return;
    const title = documentTitle(target.kind);
    const project = context.name || 'Project';
    if (target.issue) {
      const certificate = certificateFor(target.issue, context, target.agreementRecord);
      setJob({
        kind: target.kind,
        issue: target.issue,
        draft: false,
        certificate,
        filename: pdfFilename(project, title, target.issue.reference),
        title,
        ribbon: ribbonFor(false, certificate),
      });
      return;
    }
    const problem = draftProblem(target.kind);
    if (problem) {
      say('block', problem);
      return;
    }
    const snapshot = buildSnapshot(target.kind, context, projectData, {
      orgName: studio.orgName || undefined,
      officeAddress: studio.officeAddress || undefined,
      contactEmail: studio.contactEmail || undefined,
    });
    setJob({
      kind: target.kind,
      issue: {
        id: `draft-${target.kind}`,
        kind: target.kind,
        version: 0,
        reference: 'DRAFT',
        issuedAt: Date.now(),
        issuedBy: 'Draft',
        snapshot,
        contentHash: '',
        materialSections: [],
      } as DocumentIssue,
      draft: true,
      certificate: null,
      filename: pdfFilename(project, title, 'DRAFT'),
      title,
      ribbon: ribbonFor(true, null),
    });
  }, [job, context, projectData, studio, draftProblem]);

  // Once the stage has rendered, draw it and save.
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    (async () => {
      try {
        // Two frames for layout, then images (signatures, logos) decoded.
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = stageRef.current;
        if (!el) throw new Error('The document did not render.');
        await Promise.all(Array.from(el.querySelectorAll<HTMLImageElement>('img')).map((img: HTMLImageElement) =>
          img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = () => r(null); })
        ));
        if (cancelled) return;
        await downloadElementAsPdf(el, {
          filename: job.filename,
          title: `${job.title} · ${context.name || ''}`.trim(),
          studioName,
          contactEmail: studio.contactEmail || undefined,
          draft: job.draft,
          ribbon: job.ribbon,
        });
        if (!cancelled) say('ok', `${job.filename} downloaded.`);
      } catch (e: any) {
        if (!cancelled) say('block', `The PDF could not be made: ${e?.message || e}`);
      } finally {
        if (!cancelled) setJob(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const stage = (
    <>
      {job && createPortal(
        <div
          ref={stageRef}
          aria-hidden
          style={{ position: 'fixed', left: -20000, top: 0, width: PDF_CONTENT_WIDTH_PX, background: '#fff', zIndex: -1, pointerEvents: 'none' }}
        >
          <DocumentRenderer issue={job.issue} surface="print" studioName={studioName} />
          {job.certificate && (
            <div data-pdf-break-before className="bg-white pt-2 space-y-7">
              <CertificateBody
                issue={job.issue}
                documentTitle={job.title}
                record={job.certificate.record}
                approval={job.certificate.approval}
                studioName={studioName}
                clientName={context.clientName}
                projectName={context.name}
              />
            </div>
          )}
        </div>,
        document.body,
      )}
      {(job || message) && createPortal(
        <div className="fixed bottom-5 right-5 z-[120] max-w-sm" role="status">
          <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[12.5px] shadow-lg bg-white ${
            job ? 'border-slate-200 text-slate-700' : message?.tone === 'ok' ? 'border-emerald-200 text-emerald-900' : 'border-rose-200 text-rose-900'
          }`}>
            {job
              ? <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin text-[#3D52A0]" />
              : message?.tone === 'ok'
                ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />}
            <span className="flex-1">{job ? `Preparing ${job.title}${job.draft ? ' (draft)' : ''}…` : message?.text}</span>
            {!job && <button onClick={() => setMessage(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100 cursor-pointer"><X className="w-4 h-4" /></button>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );

  return { download, draftProblem, busyKind: job?.kind || null, stage };
}
