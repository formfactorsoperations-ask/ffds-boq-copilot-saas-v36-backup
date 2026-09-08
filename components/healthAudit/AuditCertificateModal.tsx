import React from 'react';
import { ProjectHealthReport, PillarScore } from './types';
import { ProjectContext } from '../../types';
import { formatCurrency, formatINR } from '../../lib/utils';
import { Printer, X, ShieldCheck, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

interface AuditCertificateModalProps {
  report: ProjectHealthReport;
  projectContext?: ProjectContext;
  onClose: () => void;
}

export const AuditCertificateModal: React.FC<AuditCertificateModalProps> = ({
  report,
  projectContext,
  onClose
}) => {
  const handlePrint = () => {
    window.print();
  };

  const projectName = projectContext?.name || 'Interior Design Project';
  const clientName = projectContext?.clientName || 'Client';
  const location = projectContext?.location || 'Site Location';
  const area = projectContext?.area ? `${projectContext.area} sq.ft.` : 'Full Scope';
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const auditRef = `AUD-${(projectContext as any)?.id?.substring(0, 8)?.toUpperCase() || 'BOQ'}-${Date.now().toString(36).toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-8 md:p-12 space-y-8 relative print:max-h-none print:shadow-none print:border-0 print:p-0">
        {/* Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 print:hidden">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
            <FileText className="w-4 h-4 text-[#B5945B]" />
            Executive Project Health & Forensic Audit Certificate
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" /> Print Certificate
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINT DOCUMENT BODY */}
        <div className="space-y-8 print:space-y-6">
          {/* Header Block */}
          <div className="border-b-2 border-slate-900 pb-6 flex justify-between items-start">
            <div>
              <span className="text-[10px] font-mono font-bold tracking-[0.25em] text-[#B5945B] uppercase block mb-1">
                Forensic Health & Audit Certificate
              </span>
              <h1 className="text-3xl font-serif text-slate-900 tracking-tight">
                {projectName}
              </h1>
              <p className="text-xs text-slate-600 mt-1 font-sans">
                {clientName} · {location} · {area}
              </p>
            </div>

            <div className="text-right font-mono text-xs text-slate-600 space-y-1">
              <div>Ref: <strong className="text-slate-900">{auditRef}</strong></div>
              <div>Date: {dateStr}</div>
              <div>Status: <span className="font-bold text-slate-900">{report.statusLabel}</span></div>
            </div>
          </div>

          {/* Primary Health Score & High Level Diagnosis */}
          <div className="grid grid-cols-3 gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="col-span-1 border-r border-slate-200 pr-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Health Index</span>
              <div className="text-4xl font-mono font-light text-slate-900 mt-1">
                {report.compositeScore}<span className="text-lg text-slate-400">/100</span>
              </div>
              <p className="text-xs font-bold text-slate-700 mt-1 uppercase tracking-wider">
                Grade: {report.overallGrade}
              </p>
            </div>

            <div className="col-span-2 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Executive Finding</span>
              <p className="text-sm text-slate-800 leading-relaxed font-serif italic">
                "{report.headlineSummary}"
              </p>
              <div className="text-xs text-slate-600 pt-1">
                <strong>Next Step:</strong> {report.nextRecommendedAction}
              </div>
            </div>
          </div>

          {/* Financial Architecture Summary */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
              Commercial Health & Profitability Baseline
            </h3>

            <div className="grid grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-500 uppercase block">Total Execution Volume</span>
                <span className="font-bold text-slate-900 text-sm">{formatINR(report.metrics.totalSell)}</span>
              </div>
              <div className="p-3 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-500 uppercase block">Total Direct Cost</span>
                <span className="font-bold text-slate-900 text-sm">{formatINR(report.metrics.totalCost)}</span>
              </div>
              <div className="p-3 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-500 uppercase block">Blended Gross Margin</span>
                <span className="font-bold text-emerald-800 text-sm">{report.metrics.blendedMarginPct.toFixed(1)}%</span>
              </div>
              <div className="p-3 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-500 uppercase block">Net Profit Yield</span>
                <span className="font-bold text-slate-900 text-sm">{formatINR(report.metrics.netProfit)}</span>
              </div>
            </div>
          </div>

          {/* 4 Pillars Forensic Summary */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
              Four-Pillar Forensic Breakdown
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              {Object.values(report.pillars).map((p: PillarScore, idx) => (
                <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-900">{p.title}</span>
                    <span className="font-mono text-slate-700">{p.score}/{p.maxScore}</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-600">
                    {p.findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-[#B5945B] mt-0.5">•</span>
                        <span>{f.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Hard-Gate Verification Docket */}
          <div className="border-t border-slate-200 pt-6 space-y-2 text-xs">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 uppercase tracking-widest">
              <span>Domain Governance Checkpoints</span>
              <span>Architectural Verification</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Proposal Gate</div>
                <div className="font-bold text-slate-900">VERIFIED</div>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">BOQ Freeze</div>
                <div className="font-bold text-slate-900">{report.metrics.boqFrozen ? 'LOCKED' : 'EDITABLE'}</div>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">E1 Advance Gate</div>
                <div className="font-bold text-slate-900">{report.metrics.e1PaymentCleared ? 'CLEARED' : 'PENDING'}</div>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Open Snags</div>
                <div className="font-bold text-slate-900">{report.metrics.openSnagCount} ITEMS</div>
              </div>
            </div>
          </div>

          {/* Signature & Audit Stamp */}
          <div className="pt-8 border-t border-slate-900 flex justify-between items-end text-xs">
            <div className="space-y-1">
              <div className="w-48 border-b border-slate-400 pb-1" />
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Solutions Architect / Studio Lead</p>
            </div>
            <div className="text-right text-[10px] font-mono text-slate-400">
              <div>BOQ Copilot · Enterprise Health Engine</div>
              <div>Audit Docket ID: {auditRef}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
