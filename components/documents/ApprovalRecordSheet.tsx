import React, { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { DocumentIssue } from '../../types';
import { clientTotals } from '../../lib/scopeTotals';
import { downloadElementAsPdf, pdfFilename, PDF_CONTENT_WIDTH_PX } from '../../lib/documentPdf';

/*
  THE APPROVAL RECORD — one page, after the client approves in the portal.

  The Excel is the document; this page records that it was approved: who, from
  which login, when, from where, the totals they approved, and the fingerprint
  of the exact issued data. It replaces the signed PDF for a Scope Revision and
  a Detailed BOQ approved this way.
*/

const inr = (n?: number | null) =>
  n === null || n === undefined ? '—' : `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso?: string | number | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '—';

export function approvalTitle(issue: DocumentIssue): string {
  const s: any = issue.snapshot || {};
  return issue.kind === 'scope_revision' ? `Scope Revision ${s.number ?? issue.version} approved` : `Detailed BOQ v${s.version ?? issue.version} approved`;
}

export function ApprovalRecordSheet({ issue, studioName, studioAddress }: { issue: DocumentIssue; studioName: string; studioAddress?: string | null }) {
  const s: any = issue.snapshot || {};
  const d: any = issue.clientSignature || {};
  const revision = issue.kind === 'scope_revision';
  const before = revision ? s.v1?.total : null;
  const after = revision ? s.v2?.total : s.total;
  const rows = clientTotals(before ?? after ?? 0, after ?? 0, s.clientTotals);
  const kv: [string, React.ReactNode][] = [
    ['Project', `${s.projectName || ''}${s.location ? `, ${s.location}` : ''}`],
    ['Client', s.clientName && s.clientName !== 'Client' ? s.clientName : '—'],
    ['Approved by', `${d.signatoryName || '—'}${d.signatoryEmail ? ` (${d.signatoryEmail})` : ''}`],
    ['When', when(d.signedAt)],
    ['How', d.witnessedBy
      ? `Approved in person on a studio device, taken by ${d.witnessedBy}`
      : d.signatureType === 'portal_approval'
        ? 'Approved in the client portal, signed in to the account above'
        : 'Signed'],
    ...(revision
      ? ([['Replaces', `${s.v1?.reference || '—'} · ${inr(s.v1?.total)}`], ['New scope', `${s.v2?.reference || '—'} · ${inr(s.v2?.total)}`]] as [string, React.ReactNode][])
      : ([['Scope', `${s.reference || issue.reference} · ${inr(s.total)}`]] as [string, React.ReactNode][])),
    ['Document', `${issue.reference}, issued ${when(issue.issuedAt)}`],
    ['From', `${d.ipAddress && d.ipAddress !== 'unknown' ? d.ipAddress : 'address not recorded'}${d.userAgent ? ` · ${String(d.userAgent).slice(0, 90)}` : ''}`],
  ];
  return (
    <div style={{ width: PDF_CONTENT_WIDTH_PX, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: '#141A33', background: '#fff', padding: '8px 4px', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #141A33', paddingBottom: 8, gap: 12 }}>
        <b style={{ fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{studioName}</b>
        <span style={{ color: '#5B6382', textAlign: 'right', fontSize: 10.5 }}>Approval record<br />{issue.reference}</span>
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 800, margin: '18px 0 10px' }}>{approvalTitle(issue)}</h3>
      <span style={{ display: 'inline-block', border: '2px solid #0F7A55', color: '#0F7A55', borderRadius: 8, padding: '5px 12px', fontWeight: 800, letterSpacing: '0.06em', fontSize: 11.5, textTransform: 'uppercase' }}>
        {d.witnessedBy ? 'Approved in person' : d.signatureType === 'portal_approval' ? 'Approved in portal' : 'Approved'}
      </span>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <tbody>
          {kv.map(([k, v]) => (
            <tr key={k}>
              <td style={{ color: '#5B6382', padding: '5px 12px 5px 0', width: 150, verticalAlign: 'top' }}>{k}</td>
              <td style={{ fontWeight: 600, padding: '5px 0', verticalAlign: 'top' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ background: '#3D52A0', color: '#fff' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Totals approved</th>
            {revision && <th style={{ textAlign: 'right', padding: '6px 8px' }}>Before</th>}
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>{revision ? 'Approved' : 'Amount'}</th>
            {revision && <th style={{ textAlign: 'right', padding: '6px 8px' }}>Change</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderBottom: '1px solid #DCE1EE', fontWeight: r.key === 'total' ? 800 : 500 }}>
              <td style={{ padding: '6px 8px' }}>{r.label}</td>
              {revision && <td style={{ padding: '6px 8px', textAlign: 'right' }}>{inr(r.before)}</td>}
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{inr(r.after)}</td>
              {revision && <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Math.abs(r.change) < 0.005 ? inr(0) : `${r.change > 0 ? '+' : '−'}${inr(Math.abs(r.change))}`}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 10, background: '#F5F7FC', borderRadius: 6, padding: '7px 9px', marginTop: 16, wordBreak: 'break-all', color: '#33395A' }}>
        Document fingerprint · {d.contentHash || issue.contentHash || '—'}
        {d.docketHash ? <><br />Approval record · {d.docketHash}</> : null}
      </div>
      <p style={{ fontSize: 11, color: '#5B6382', marginTop: 14, lineHeight: 1.5 }}>
        The Excel workbook issued with this document is the approved scope; its fingerprint is printed on its Summary sheet.
        This page records the approval and is valid without a signature.{studioAddress ? ` ${studioName}, ${studioAddress}.` : ''}
      </p>
    </div>
  );
}

/** A button that renders the record off screen and downloads it as a one-page PDF. */
export function ApprovalRecordButton({ issue, studioName, studioAddress, className, label = 'Approval record' }: { issue: DocumentIssue; studioName: string; studioAddress?: string | null; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      await downloadElementAsPdf(ref.current, {
        filename: pdfFilename(issue.reference, 'Approval record'),
        title: approvalTitle(issue),
        studioName,
        ribbon: { label: 'Approved', tone: 'approved' },
      });
    } catch (e) {
      console.error('Approval record PDF failed', e);
      alert('The approval record could not be made just now. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" onClick={go} disabled={busy} className={className || 'px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5'}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} {label}
      </button>
      <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
        <div ref={ref}><ApprovalRecordSheet issue={issue} studioName={studioName} studioAddress={studioAddress} /></div>
      </div>
    </>
  );
}
