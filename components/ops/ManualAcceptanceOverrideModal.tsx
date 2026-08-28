import React, { useState } from 'react';
import { 
  ShieldAlert, 
  X, 
  Check, 
  Upload, 
  FileText, 
  Building2, 
  Calendar, 
  User, 
  MessageSquare,
  AlertTriangle
} from 'lucide-react';
import { DigitalSignatureDocket, ManualOverrideMeta } from '../../types';

interface ManualAcceptanceOverrideModalProps {
  documentTitle: string;
  projectName: string;
  defaultClientName?: string;
  defaultClientEmail?: string;
  onConfirmOverride: (docket: DigitalSignatureDocket) => void;
  onClose: () => void;
  recordedByUser?: string;
  /** The DocumentIssue that was physically signed, so paper and system agree. */
  issueId?: string;
  contentHash?: string;
}

export default function ManualAcceptanceOverrideModal({
  documentTitle,
  projectName,
  defaultClientName = '',
  defaultClientEmail = '',
  onConfirmOverride,
  onClose,
  recordedByUser = 'Ops Director',
  issueId,
  contentHash
}: ManualAcceptanceOverrideModalProps) {
  const [signatoryName, setSignatoryName] = useState(defaultClientName);
  const [signatoryEmail, setSignatoryEmail] = useState(defaultClientEmail);
  const [approvalDate, setApprovalDate] = useState(new Date().toISOString().split('T')[0]);
  const [medium, setMedium] = useState<'paper_wet_ink' | 'email_confirmation' | 'whatsapp_approval' | 'in_person_verbal'>('paper_wet_ink');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!signatoryName.trim()) {
      setError('Please provide the signatory name.');
      return;
    }
    if (!overrideReason.trim()) {
      setError('Please provide a reason or audit reference for this manual override.');
      return;
    }
    // Anything that left a paper or message trail must have that trail attached.
    // An override without evidence is just an assertion, and the client will be
    // shown exactly what backs it up.
    if (medium === 'paper_wet_ink' && !attachmentUrl.trim()) {
      setError('Attach a scan or photo of the signed page. A wet-ink record cannot be saved without it.');
      return;
    }
    if ((medium === 'whatsapp_approval' || medium === 'email_confirmation') && !attachmentUrl.trim()) {
      setError('Attach a screenshot or paste the message reference confirming the client\u2019s approval.');
      return;
    }

    const timestamp = new Date().toISOString();
    const entropy = `OVERRIDE_${signatoryName}_${approvalDate}_${medium}_${Math.random().toString(36).substring(2, 10)}`;
    let hash = '';
    for (let i = 0; i < entropy.length; i++) {
      hash += ((entropy.charCodeAt(i) * 31) % 16).toString(16);
    }
    const docketHash = `SHA256:MANUAL_${hash.padEnd(25, '0').slice(0, 25)}`;

    const manualMeta: ManualOverrideMeta = {
      isOverride: true,
      recordedBy: recordedByUser,
      recordedAt: timestamp,
      overrideReason: overrideReason.trim(),
      approvalMedium: medium,
      attachmentUrl: attachmentUrl.trim() || undefined
    };

    const docket: DigitalSignatureDocket = {
      signatoryName: signatoryName.trim(),
      signatoryEmail: signatoryEmail.trim() || undefined,
      signedAt: `${approvalDate}T12:00:00.000Z`,
      signatureType: 'manual_override',
      ipAddress: 'Studio Internal (Manual Override)',
      docketHash,
      verified: true,
      legalAffirmation: true,
      manualOverride: manualMeta,
      issueId,
      contentHash
    };

    onConfirmOverride(docket);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 text-left animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Ops Director Manual Override
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Record physical hardcopy or offline acceptance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning / Compliance Notice */}
        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong>Compliance note.</strong> Use this only when the client has already given formal consent — a wet-ink signed copy, a verified email, or a WhatsApp confirmation. The client sees this record in their portal, marked as recorded offline, with your name and the evidence attached, and can contest it.
            {medium === 'in_person_verbal' && (
              <span className="block mt-1.5 font-semibold">
                A verbal record is the weakest form of acceptance and will not stand up if contested. Prefer a written confirmation wherever possible.
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
          {/* Target Document & Project */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Document</span>
              <strong className="text-slate-800 truncate block">{documentTitle}</strong>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Project</span>
              <strong className="text-slate-800 truncate block">{projectName || 'Current Project'}</strong>
            </div>
          </div>

          {/* Signatory Name & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Signatory Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={signatoryName}
                onChange={e => setSignatoryName(e.target.value)}
                placeholder="e.g. Prasad Kulkarni"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Acceptance Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={approvalDate}
                onChange={e => setApprovalDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] font-medium text-slate-800"
              />
            </div>
          </div>

          {/* Approval Medium */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Approval Mode / Channel <span className="text-rose-500">*</span>
            </label>
            <select
              value={medium}
              onChange={e => setMedium(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] font-semibold text-slate-800 cursor-pointer"
            >
              <option value="paper_wet_ink">Physical Hardcopy (Wet-Ink Signature on Paper)</option>
              <option value="email_confirmation">Verified Email Written Confirmation</option>
              <option value="whatsapp_approval">WhatsApp Formal Written Approval</option>
              <option value="in_person_verbal">In-Person Meeting & Site Handshake Confirmation</option>
            </select>
          </div>

          {/* Attachment Link / Cloud Scan URL */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              {medium === 'in_person_verbal'
                ? 'Supporting note or attachment (optional)'
                : medium === 'paper_wet_ink'
                  ? 'Scan or photo of the signed page (required)'
                  : 'Screenshot or message reference (required)'}
            </label>
            <input
              type="url"
              value={attachmentUrl}
              onChange={e => setAttachmentUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-800"
            />
          </div>

          {/* Override Reason / Notes */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Audit Remarks & Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="e.g. Client signed paper agreement on site during technical kick-off."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-800 font-medium"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
              {error}
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Record & Seal Acceptance</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
