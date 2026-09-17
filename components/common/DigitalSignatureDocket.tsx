import React from 'react';
import { 
  ShieldCheck, 
  FileCheck2, 
  ExternalLink, 
  RotateCcw, 
  Printer, 
  CheckCircle2,
  Building2,
  Clock,
  Globe,
  Fingerprint
} from 'lucide-react';
import { DigitalSignatureDocket, ManualOverrideMeta } from '../../types';

interface DigitalSignatureDocketProps {
  docket?: DigitalSignatureDocket;
  documentTitle: string;
  projectId?: string;
  projectName?: string;
  studioName?: string;
  onReset?: () => void;
  canReset?: boolean;
  className?: string;
}

export default function DigitalSignatureDocketView({
  docket,
  documentTitle,
  projectId = '',
  projectName = '',
  studioName = 'The Studio',
  onReset,
  canReset = false,
  className = ''
}: DigitalSignatureDocketProps) {
  if (!docket) return null;

  const isOverride = docket.manualOverride?.isOverride || docket.signatureType === 'manual_override';
  const formattedDate = docket.signedAt ? new Date(docket.signedAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) : 'Recorded';

  return (
    <div className={`bg-white border border-slate-300/80 rounded-2xl p-6 sm:p-8 shadow-xs break-inside-avoid relative overflow-hidden text-left ${className}`}>
      {/* Subtle Gold Hairline Brand Accent (Per Design System Guidelines) */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#3D52A0]" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-100 text-slate-800 rounded-xl border border-slate-200 shrink-0">
            <ShieldCheck className="w-6 h-6 text-[#3D52A0]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Certificate of Digital Acceptance
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                {isOverride ? 'Ops Override Verified' : 'Legally Binding & Sealed'}
              </span>
            </div>
            <h4 className="text-base font-extrabold text-slate-900 mt-0.5">
              {documentTitle}
            </h4>
          </div>
        </div>

        <div className="text-left sm:text-right text-xs">
          <span className="text-slate-400 block font-medium">Document Reference</span>
          <span className="font-mono text-slate-700 font-bold">
            {projectId ? `DOC-${projectId.slice(0, 8).toUpperCase()}` : 'DOC-SECURE-SIGN'}
          </span>
        </div>
      </div>

      {/* Main Docket Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6 text-xs">
        {/* Left Column: Signatory & Verification Meta */}
        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                Signatory Party
              </span>
              <span className="font-bold text-slate-900">{docket.signatoryName}</span>
            </div>

            {docket.signatoryEmail && (
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  Signatory Email
                </span>
                <span className="text-slate-800 font-medium">{docket.signatoryEmail}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                Execution Timestamp
              </span>
              <span className="text-slate-800 font-medium">{formattedDate}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                Signing Mode
              </span>
              <span className="text-slate-800 font-bold uppercase text-[10px]">
                {docket.signatureType === 'draw' && 'Handwritten Digital Draw'}
                {docket.signatureType === 'type' && 'Cryptographic Typed Monogram'}
                {docket.signatureType === 'upload' && 'Uploaded Signature Graphic'}
                {docket.signatureType === 'manual_override' && 'Ops Manual Hardcopy / Written Record'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                Network / Host
              </span>
              <span className="font-mono text-[11px] text-slate-600">
                {docket.ipAddress || 'Internal Studio Network'}
              </span>
            </div>
          </div>

          {/* Tamper-Proof Audit Hash */}
          <div className="p-3 bg-slate-50/60 border border-slate-200 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <Fingerprint className="w-3.5 h-3.5 text-[#3D52A0]" />
              <span>Tamper-Proof Audit Hash (SHA-256)</span>
            </div>
            <p className="font-mono text-[10px] text-slate-600 break-all select-all">
              {docket.docketHash}
            </p>
          </div>
        </div>

        {/* Right Column: Signature Rendering / Monogram */}
        <div className="flex flex-col justify-between space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center min-h-[160px] text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              Digitally Affixed Signature
            </span>

            {docket.signatureDataUrl ? (
              <img 
                src={docket.signatureDataUrl} 
                alt={`Signature of ${docket.signatoryName}`} 
                className="max-h-20 max-w-full object-contain filter drop-shadow-xs"
              />
            ) : (
              <div className="p-3 border border-slate-300 rounded-lg bg-white shadow-2xs">
                <p className="font-serif italic text-lg text-slate-900 font-bold px-4 py-1">
                  {docket.signatoryName}
                </p>
              </div>
            )}

            <div className="mt-3 pt-2 border-t border-slate-200/80 w-full text-center">
              <span className="text-[10px] font-bold text-slate-700 block">
                {docket.signatoryName}
              </span>
              <span className="text-[9px] text-slate-400 uppercase tracking-widest">
                Authorized Signatory
              </span>
            </div>
          </div>

          {/* Manual Override Details (If applicable) */}
          {docket.manualOverride && docket.manualOverride.isOverride && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-amber-950 text-[11px]">
                <span>Ops Director Override Record</span>
                <span className="text-[10px] font-normal text-amber-800">
                  Recorded by {docket.manualOverride.recordedBy}
                </span>
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                <strong>Medium:</strong> {docket.manualOverride.approvalMedium.replace(/_/g, ' ')}
              </p>
              {docket.manualOverride.overrideReason && (
                <p className="text-[11px] text-amber-900/80 italic">
                  "{docket.manualOverride.overrideReason}"
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Audit Statement */}
      <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          <span>Issued & Maintained by <strong className="text-slate-700">{studioName}</strong></span>
        </div>

        <div className="flex items-center gap-3 no-print">
          {canReset && onReset && (
            <button
              onClick={onReset}
              className="text-xs text-slate-400 hover:text-slate-700 font-bold underline flex items-center gap-1 cursor-pointer transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Sign-Off (Admin)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
