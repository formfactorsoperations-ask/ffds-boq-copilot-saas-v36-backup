import React from 'react';
import { DocumentIssue } from '../../types';
import { SignatureMode } from '../../services/documentReleaseEngine';

/**
 * The execution stamp, on the paper.
 *
 * Every issue has carried `clientSignature` and `counterSignature` since the
 * reading room was built, and not one sheet rendered them — so a client who
 * signed the Terms Docket could reopen it and find a document that looked
 * exactly as unsigned as before, and the studio's own copy said nothing either.
 * The evidence existed and was invisible on the only artefact anyone actually
 * looks at.
 *
 * Rendered here rather than in each sheet: it is the same block for all six
 * kinds, and the six sheets would drift.
 *
 * The wording follows what the document asked for. A payment schedule is
 * acknowledged, not signed, and calling that a signature would overstate what
 * the client did.
 */
export const ExecutionStamp: React.FC<{ issue: DocumentIssue; mode: SignatureMode }> = ({ issue, mode }) => {
  const client = issue.clientSignature;
  const studio = issue.counterSignature;
  if (!client && !studio) return null;

  const verb = mode === 'signature' ? 'Signed' : mode === 'acknowledge' ? 'Acknowledged' : 'Confirmed read';
  const when = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  const Party: React.FC<{ label: string; sig: any; verb: string; align?: 'left' | 'right' }> = ({ label, sig, verb, align = 'left' }) => (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-0.5">{label}</p>
      {sig ? (
        <>
          {/* A drawn mark sits above the printed name; a typed one IS the
              name, so printing it twice just looked like a mistake. */}
          {sig.signatureDataUrl && sig.signatureType !== 'type' ? (
            <>
              <img src={sig.signatureDataUrl} alt="" className={`h-9 w-auto max-w-[170px] object-contain mt-1 ${align === 'right' ? 'object-right ml-auto' : 'object-left'}`} />
              <p className="text-[10.5px] font-bold text-slate-800 mt-1.5">{sig.signatoryName}</p>
            </>
          ) : (
            <p
              className="text-[16px] text-slate-900 mt-1 leading-tight truncate"
              style={{ fontFamily: sig.typedFont || '"Dancing Script", cursive' }}
            >
              {sig.signatoryName}
            </p>
          )}
          {sig.signatoryRole && <p className="text-[9.5px] text-slate-500">{sig.signatoryRole}</p>}
          <p className="text-[9.5px] text-slate-500 mt-0.5">{verb} {when(sig.signedAt)}</p>
          {sig.docketHash && (
            <p className="text-[8.5px] font-mono text-slate-400 mt-0.5 break-all">
              {String(sig.docketHash).slice(0, 24)}
            </p>
          )}
        </>
      ) : (
        <p className="text-[10.5px] text-slate-400 italic mt-3">Awaited</p>
      )}
    </div>
  );

  return (
    <div className="mt-8 pt-5 border-t-2 border-slate-800 doc-execution-stamp">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Execution</p>
        {client?.verified && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            Verified
          </span>
        )}
      </div>

      {/* Studio left, client right — the way parties sit on an executed page.
          The rule between the columns is gone: with one side often reading
          only "Awaited" it drew a line down an empty half. */}
      <div className="grid grid-cols-2 gap-8 items-start">
        <Party label="For the studio" sig={studio} verb="Counter-signed" align="left" />
        <Party label="By the client" sig={client} verb={verb} align="right" />
      </div>

      {client?.readingEvidence && (
        <p className="text-[9px] text-slate-400 mt-3 leading-relaxed text-right">
          Recorded against issue {issue.reference} · v{issue.version}. The content hash above fixes the
          exact wording that was on screen when this was {verb.toLowerCase()}.
        </p>
      )}
    </div>
  );
};

export default ExecutionStamp;
