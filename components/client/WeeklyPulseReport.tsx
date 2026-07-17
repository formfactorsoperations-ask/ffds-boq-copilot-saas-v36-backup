import React from 'react';
import { formatINR } from '../../lib/utils';

export interface WeeklyPulseReportProps {
  report: any;
  studioSettings: any;
}

export function WeeklyPulseReport({ report, studioSettings }: WeeklyPulseReportProps) {
  if (!report) return null;

  const narrative = report.narrative || {};
  const snapshot = report.snapshot || {};

  const companyName = studioSettings?.companyName || studioSettings?.footer?.orgName || '—';
  const address = studioSettings?.address || '—';
  const phone = studioSettings?.phone || studioSettings?.footer?.phoneNumber || studioSettings?.contactPhone || '—';
  const email = studioSettings?.email || studioSettings?.footer?.contactInfo || '—';
  const footerText = studioSettings?.footerText || studioSettings?.footer?.tagline || '—';
  const logo = studioSettings?.logo || null;

  const drawings = snapshot.drawings || [];
  const paymentStages = snapshot.paymentStages || [];
  const scopeAdditions = snapshot.scopeAdditions || [];
  const sofItems = snapshot.sofItems || [];
  const designGate = snapshot.designGate || {};
  const contract = snapshot.contract || {};

  const pendingDrawings = drawings.filter((d: any) => d.status === 'issued' || (d.rounds && d.rounds[d.currentRound - 1]?.status === 'issued'));
  const pendingSof = sofItems.filter((s: any) => s.status === 'pending' || s.status === 'draft');
  const pendingPayments = paymentStages.filter((p: any) => p.status === 'overdue' || p.status === 'issued' || p.status === 'pending');

  return (
    <div className="w-full max-w-4xl mx-auto bg-white text-[#1a2332] font-sans print:m-0 print:max-w-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        .pulse-report { font-family: 'Plus Jakarta Sans', sans-serif; }
        .pulse-report .text-ink { color: #1a2332; }
        .pulse-report .text-slate { color: #5a6577; }
        .pulse-report .border-gold { border-color: #c6a96c; }
        .pulse-report .text-gold { color: #c6a96c; }
        @media print {
          .pulse-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 20mm; }
          .avoid-break { page-break-inside: avoid; }
        }
      `}</style>

      <div className="pulse-report w-full p-8 print:p-0">
        {/* 1. Masthead */}
        <div className="flex justify-between items-end pb-6 border-b border-gold border-solid border-[1px]">
          <div>
            {logo ? <img src={logo} alt={companyName} className="h-12 mb-2" /> : <div className="h-12 flex items-center text-xl font-bold text-ink">{companyName}</div>}
          </div>
          <div className="text-right text-sm text-slate">
            <p>{address}</p>
            <p>{phone} | {email}</p>
          </div>
        </div>

        <div className="mt-8 mb-6 avoid-break">
          <h1 className="text-3xl font-bold text-ink">Weekly Progress Report</h1>
          <p className="text-slate mt-1">Period: {report.periodStart || '—'} to {report.periodEnd || '—'}</p>
        </div>

        {/* 2. Week at a Glance */}
        <div className="mb-8 avoid-break">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1">Week at a Glance</h2>
          <p className="text-ink leading-relaxed whitespace-pre-wrap">{narrative.weekAtAGlance || '—'}</p>
        </div>

        {/* 3. Project Governance */}
        <div className="mb-8 avoid-break">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1">Project Governance</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border border-[#e2e8f0] bg-white">
              <p className="text-sm text-slate mb-1">Contract Signed</p>
              <p className="font-medium text-ink">{contract.signedAt ? new Date(contract.signedAt).toLocaleDateString('en-GB') : '—'}</p>
            </div>
            <div className="p-4 border border-[#e2e8f0] bg-white">
              <p className="text-sm text-slate mb-1">T&C Acknowledged</p>
              <p className="font-medium text-ink">{contract.tcAcknowledgedAt ? new Date(contract.tcAcknowledgedAt).toLocaleDateString('en-GB') : '—'}</p>
            </div>
          </div>
        </div>

        {/* 4. Design Progress */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1 avoid-break">Design Progress</h2>
          <div className="grid grid-cols-4 gap-4 mb-4 avoid-break">
            <div className="p-4 border border-[#e2e8f0]">
              <p className="text-sm text-slate mb-1">Total</p>
              <p className="text-xl font-semibold text-ink">{drawings.length}</p>
            </div>
            <div className="p-4 border border-[#e2e8f0]">
              <p className="text-sm text-slate mb-1">In Progress</p>
              <p className="text-xl font-semibold text-ink">{drawings.filter((d: any) => d.status === 'in_progress' || d.status === 'draft').length}</p>
            </div>
            <div className="p-4 border border-[#e2e8f0]">
              <p className="text-sm text-slate mb-1">In Review</p>
              <p className="text-xl font-semibold text-ink">{pendingDrawings.length}</p>
            </div>
            <div className="p-4 border border-[#e2e8f0]">
              <p className="text-sm text-slate mb-1">Approved</p>
              <p className="text-xl font-semibold text-ink">{drawings.filter((d: any) => d.status === 'approved' || d.status === 'completed').length}</p>
            </div>
          </div>

          <table className="w-full text-left border-collapse avoid-break">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="py-2 text-sm font-medium text-slate">Drawing Name</th>
                <th className="py-2 text-sm font-medium text-slate">Status</th>
                <th className="py-2 text-sm font-medium text-slate">Round</th>
              </tr>
            </thead>
            <tbody>
              {drawings.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-slate text-center border-b border-[#e2e8f0]">No drawings tracked.</td></tr>
              )}
              {drawings.map((d: any, idx: number) => {
                const isComplete = d.status === 'approved' || d.status === 'completed';
                return (
                  <tr key={d.id || idx} className="border-b border-[#e2e8f0]">
                    <td className="py-3 text-ink">
                      {d.isNewThisWeek && <span className="text-gold mr-2 text-xs">Δ</span>}
                      {d.name || d.id || '—'}
                    </td>
                    <td className="py-3 text-ink">
                      {isComplete ? '● ' : '○ '}
                      {d.status || '—'}
                    </td>
                    <td className="py-3 text-ink">{d.currentRound || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 5. Revisions This Week */}
        <div className="mb-8 avoid-break">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1">Revisions This Week</h2>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="py-2 text-sm font-medium text-slate">Item</th>
                <th className="py-2 text-sm font-medium text-slate">Net Impact</th>
                <th className="py-2 text-sm font-medium text-slate">Status</th>
                <th className="py-2 text-sm font-medium text-slate">Charge Line</th>
              </tr>
            </thead>
            <tbody>
              {scopeAdditions.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-slate text-center border-b border-[#e2e8f0]">No revisions recorded this week.</td></tr>
              )}
              {scopeAdditions.map((s: any, idx: number) => {
                const isComplete = s.status === 'approved' || s.status === 'paid';
                return (
                  <tr key={s.id || idx} className="border-b border-[#e2e8f0]">
                    <td className="py-3 text-ink">
                      {s.isNewThisWeek && <span className="text-gold mr-2 text-xs">Δ</span>}
                      {s.title || s.id || '—'}
                    </td>
                    <td className="py-3 text-ink">{s.netImpact ? formatINR(s.netImpact) : '—'}</td>
                    <td className="py-3 text-ink">
                      {isComplete ? '● ' : '○ '}
                      {s.status || '—'}
                    </td>
                    <td className="py-3 text-ink">{s.chargeLine || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 6. Financial Summary */}
        <div className="mb-8 avoid-break">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1">Financial Summary</h2>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="py-2 text-sm font-medium text-slate">Payment Stage</th>
                <th className="py-2 text-sm font-medium text-slate">Amount</th>
                <th className="py-2 text-sm font-medium text-slate">Status</th>
              </tr>
            </thead>
            <tbody>
              {paymentStages.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-slate text-center border-b border-[#e2e8f0]">No payment stages defined.</td></tr>
              )}
              {paymentStages.map((p: any, idx: number) => {
                const isComplete = p.status === 'paid';
                return (
                  <tr key={p.id || idx} className="border-b border-[#e2e8f0]">
                    <td className="py-3 text-ink">
                      {p.isNewThisWeek && <span className="text-gold mr-2 text-xs">Δ</span>}
                      {p.name || p.label || p.id || '—'}
                    </td>
                    <td className="py-3 text-ink">{p.amount ? formatINR(p.amount) : '—'}</td>
                    <td className="py-3 text-ink">
                      {isComplete ? '● ' : '○ '}
                      {p.status || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 7. Execution Update */}
        <div className="mb-8 avoid-break">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1">Execution Update</h2>
          {designGate?.gateActivated ? (
             <div className="p-4 border border-[#e2e8f0] bg-white">
                <p className="text-ink font-medium">Design Complete Gate Activated</p>
                <p className="text-slate text-sm mt-1">
                  Execution phase is active. 
                  {designGate?.assessedAt ? ` Activated on ${new Date(designGate.assessedAt).toLocaleDateString('en-GB')}` : ''}
                </p>
             </div>
          ) : (
             <div className="p-4 border border-[#e2e8f0] bg-white relative overflow-hidden">
                <div className="flex items-center mb-2">
                   <p className="text-ink font-medium">Execution Locked</p>
                </div>
                <p className="text-slate text-sm">Execution begins after the Design Complete Gate is cleared.</p>
                {designGate?.overrideReason && (
                   <div className="mt-4 pt-4 border-t border-[#e2e8f0]">
                      <p className="text-xs font-semibold text-slate uppercase mb-1">Gate Override Active</p>
                      <p className="text-sm text-ink italic">"{designGate.overrideReason}"</p>
                      <p className="text-xs text-slate mt-1">— {designGate.overriddenBy || 'Studio Approver'}</p>
                   </div>
                )}
             </div>
          )}
        </div>

        {/* 8. Selections & SOF */}
        <div className="mb-8 avoid-break">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1">Selections & SOF</h2>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="py-2 text-sm font-medium text-slate">Item</th>
                <th className="py-2 text-sm font-medium text-slate">Status</th>
              </tr>
            </thead>
            <tbody>
              {sofItems.length === 0 && (
                <tr><td colSpan={2} className="py-4 text-slate text-center border-b border-[#e2e8f0]">No selections required.</td></tr>
              )}
              {sofItems.map((sof: any, idx: number) => {
                const isComplete = sof.status === 'approved' || sof.status === 'completed';
                return (
                  <tr key={sof.id || idx} className="border-b border-[#e2e8f0]">
                    <td className="py-3 text-ink">{sof.name || sof.id || '—'}</td>
                    <td className="py-3 text-ink">
                      {isComplete ? '● ' : '○ '}
                      {sof.status || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 9. Decisions Needed From You */}
        <div className="mb-8 avoid-break">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1">Decisions Needed From You</h2>
          {pendingDrawings.length === 0 && pendingSof.length === 0 && pendingPayments.length === 0 ? (
            <p className="text-slate italic">No pending actions required at this time.</p>
          ) : (
            <ul className="list-disc pl-5 text-ink space-y-2">
              {pendingPayments.map((p: any, idx: number) => (
                <li key={`pay-${idx}`}>Please review payment: <strong>{p.name || p.label || p.id}</strong> ({p.amount ? formatINR(p.amount) : '—'})</li>
              ))}
              {pendingDrawings.map((d: any, idx: number) => (
                <li key={`draw-${idx}`}>Please review drawing: <strong>{d.name || d.id}</strong></li>
              ))}
              {pendingSof.map((s: any, idx: number) => (
                <li key={`sof-${idx}`}>Please finalize selection: <strong>{s.name || s.id}</strong></li>
              ))}
            </ul>
          )}
        </div>

        {/* 10. Coming Up Next Week */}
        <div className="mb-12 avoid-break">
          <h2 className="text-sm font-semibold text-ink mb-3 uppercase tracking-wider border-b border-[#e2e8f0] pb-1">Coming Up Next Week</h2>
          <p className="text-ink leading-relaxed whitespace-pre-wrap">{narrative.comingUpNextWeek || '—'}</p>
        </div>

        {/* 11. Footer */}
        <div className="pt-6 border-t border-gold border-solid border-[1px] text-center text-sm text-slate avoid-break">
          <p className="font-medium text-ink">{companyName}</p>
          <p>{footerText}</p>
        </div>
      </div>
    </div>
  );
}
