/**
 * PAYMENT SCHEDULE SHEET
 *
 * The Advance Payment Schedule document itself — the studio's real, branded,
 * versioned sheet, lifted verbatim out of PaymentSchedulePage so it can be
 * rendered in more than one place.
 *
 * This exists because the client portal was showing a DIFFERENT payment
 * schedule to the one the studio authored: a generic table rebuilt from
 * scratch, with none of the branding, none of the GST columns, and amounts
 * reading zero. A client must see the exact document the studio produced.
 *
 * So there is now one renderer. The studio page renders it live from the
 * current draft; the client portal renders it from the frozen snapshot taken
 * at release. Same component, same markup, same styles — only the data source
 * differs.
 */

import React from 'react';
import { ProjectContext, PaymentSchedule } from '../../types';

export interface PaymentScheduleSheetProps {
  /** The real versioned schedule from projectContext.paymentSchedules. */
  schedule: PaymentSchedule;
  projectContext: ProjectContext;
  /** Studio identity — passed in rather than read from context, so the frozen
   *  snapshot can carry whatever was true at the time of issue. */
  org: {
    orgName?: string;
    officeAddress?: string;
    contactEmail?: string;
    signatoryName?: string;
    signatoryTitle?: string;
  };
  /** Fallback fee source when the schedule carries no engagement snapshot. */
  activeTier?: any;
  /** False hides money (Designer role). Clients always see their own figures. */
  showAmounts?: boolean;
  /** Renders the PDF-preview chrome around the sheet. */
  previewMode?: boolean;
}

const PaymentScheduleSheet: React.FC<PaymentScheduleSheetProps> = ({
  schedule: latestSchedule,
  projectContext,
  org,
  activeTier,
  showAmounts = true,
  previewMode = false
}) => {
  // ── Derivations, lifted with the markup so both callers stay identical ──
  const orgData = org || {};
  const isOwner = showAmounts;

  const sortByCode = (a: any, b: any) => {
    const numA = parseInt((a.advanceCode || '').replace(/\D/g, '') || '0', 10);
    const numB = parseInt((b.advanceCode || '').replace(/\D/g, '') || '0', 10);
    return (numA && numB) ? numA - numB : 0;
  };

  const advances = latestSchedule?.advances || [];
  const designAdvances = advances.filter(a => a.phase === 'design').sort(sortByCode);
  const allExecutionAdvances = advances
    .filter(a => a.phase === 'execution' || a.phase === 'handover' || (a as any).isHandoverAdvance)
    .sort(sortByCode);
  const handoverAdvances = allExecutionAdvances.filter(
    a => a.phase === 'handover' || (a as any).isHandoverAdvance || (a.label && a.label.toLowerCase().includes('handover'))
  );

  const studioName = orgData.orgName || '[set in Studio Settings]';
  const signatoryName = orgData.signatoryName || latestSchedule?.snapshotTermsConfig?.signatory?.name || '[Principal Name]';
  const signatoryTitle = orgData.signatoryTitle || latestSchedule?.snapshotTermsConfig?.signatory?.title || '[Principal Title]';

  const baseDesignFee =
    latestSchedule?.snapshotEngagement?.designFee ||
    projectContext.financials?.approvedDesignValue ||
    activeTier?.summary?.designFee || 0;
  const baseExecutionValue =
    latestSchedule?.snapshotEngagement?.executionValue ||
    projectContext.financials?.approvedExecutionValue ||
    activeTier?.summary?.totalSell || 0;

  const termsDockets = projectContext.termsDockets || [];
  const latestDocket = termsDockets.length
    ? termsDockets.reduce((prev, curr) => (prev.generatedAt > curr.generatedAt ? prev : curr))
    : null;
  const resolvedDocketRef =
    latestSchedule?.docketRef && latestSchedule.docketRef !== '____'
      ? latestSchedule.docketRef
      : (projectContext.engagement?.docketRef || latestDocket?.docketRef || '____');

  // Advance amounts are derived from the percentage against the frozen base, so
  // a schedule stored without amounts still renders real figures rather than zero.
  advances.forEach((adv: any) => {
    const base = adv.phase === 'design' ? baseDesignFee : baseExecutionValue;
    const expected = Math.round((adv.percentage / 100) * base);
    if (!adv.amount || adv.amount === 0) adv.amount = expected;
  });

  const designPctTotal = designAdvances.reduce((s, a) => s + a.percentage, 0);
  const designAmountTotal = designAdvances.reduce((s, a) => s + (a.amount || 0), 0);
  const executionPctTotal = allExecutionAdvances.reduce((s, a) => s + a.percentage, 0);
  const executionAmountTotal = allExecutionAdvances.reduce((s, a) => s + (a.amount || 0), 0);

  return (
            <div id="payment-schedule-pdf-render" className={`payment-schedule-template ${previewMode ? 'print-only' : ''}`}>
                <style dangerouslySetInnerHTML={{__html: `
                    :root{
                        --ink:#1f2328; --ink-soft:#3f464e; --muted:#727a82;
                        --line:#e6e3dc; --line-soft:#efece6; --paper:#fbfaf7; --card:#ffffff;
                        --slate:#1f2328; --accent:#1e3a8a; --accent-soft:#eef2fb; --gold:#b08d57;
                    }
                    .payment-schedule-template {
                        background:var(--paper); color:var(--ink);
                        font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
                        line-height:1.6; font-size:14px; -webkit-font-smoothing:antialiased;
                        width: 100%; max-width: 820px;
                    }
                    .payment-schedule-template * { box-sizing:border-box; }
                    .payment-schedule-template .sheet{max-width:820px; margin:0 auto; background:var(--card); padding:40px 52px 50px;}
                    .payment-schedule-template header.mast{border-bottom:2px solid var(--slate); padding-bottom:18px; display:flex; justify-content:space-between; align-items:flex-end;}
                    .payment-schedule-template .brand{font-size:14px; letter-spacing:.22em; text-transform:uppercase; font-weight:800;}
                    .payment-schedule-template .tagline{font-size:11px; color:var(--muted); letter-spacing:.05em; margin-top:3px;}
                    .payment-schedule-template .docnum{font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); font-weight:700; text-align:right;}
                    .payment-schedule-template .title{margin:20px 0 4px; font-size:21px; font-weight:800; letter-spacing:-.01em;}
                    .payment-schedule-template .preamble{font-size:12.5px; color:var(--ink-soft); margin:0 0 14px;}
                    .payment-schedule-template .metabar{display:grid; grid-template-columns:1fr 1fr 1fr; border:1px solid var(--line); border-radius:10px; overflow:hidden; margin:18px 0 6px;}
                    .payment-schedule-template .metabar div{padding:10px 14px; border-bottom:1px solid var(--line-soft); border-right:1px solid var(--line-soft);}
                    .payment-schedule-template .metabar div:nth-child(3n){border-right:none;}
                    .payment-schedule-template .metabar div:nth-child(-n+3){background:#faf9f5;}
                    .payment-schedule-template .metabar .k{font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700;}
                    .payment-schedule-template .metabar .v{font-weight:700; color:var(--ink); margin-top:2px; font-size:13px;}
                    .payment-schedule-template .valuebar{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:14px 0 6px;}
                    .payment-schedule-template .vb{border:1px solid var(--line); border-radius:10px; padding:12px 16px; background:#fff;}
                    .payment-schedule-template .vb .k{font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700;}
                    .payment-schedule-template .vb .v{font-weight:800; color:var(--slate); font-size:18px; margin-top:3px; font-variant-numeric:tabular-nums;}
                    .payment-schedule-template h2.sec{font-size:13px; letter-spacing:.1em; text-transform:uppercase; font-weight:800; color:var(--slate);
                        margin:24px 0 8px; padding-top:14px; border-top:1px solid var(--line); display:flex; align-items:center; gap:10px;}
                    .payment-schedule-template .pill{font-size:9.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; padding:2px 9px; border-radius:999px;}
                    .payment-schedule-template .pill.d{background:var(--accent-soft); color:var(--accent);} 
                    .payment-schedule-template .pill.e{background:#f3efe7; color:var(--gold);}
                    .payment-schedule-template table{width:100%; border-collapse:collapse; margin:4px 0; font-size:13px;}
                    .payment-schedule-template thead th{background:var(--slate); color:#fff; text-align:left; padding:7px 10px; font-size:10px; letter-spacing:.05em; text-transform:uppercase; font-weight:700;}
                    .payment-schedule-template thead th.r{text-align:right;}
                    .payment-schedule-template tbody td{padding:9px 10px; border-bottom:1px solid var(--line-soft); vertical-align:top; color:var(--ink-soft); font-size: 12.5px;}
                    .payment-schedule-template tbody td .nm{font-weight:700; color:var(--ink); display:block;}
                    .payment-schedule-template tbody td .sm{font-size:11.5px; color:var(--muted);}
                    .payment-schedule-template td.pct{text-align:right; font-weight:800; color:var(--slate); font-variant-numeric:tabular-nums; white-space:nowrap;}
                    .payment-schedule-template td.amt{text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; font-weight:600; color:var(--ink);}
                    .payment-schedule-template tfoot td{padding:8px 10px; font-weight:800; color:var(--slate); border-top:2px solid var(--slate); font-variant-numeric:tabular-nums; font-size: 13px;}
                    .payment-schedule-template tfoot td.r{text-align:right;}
                    .payment-schedule-template .highlight{background:#fdf8ef; border:1px solid #ecdcc0; border-left:3px solid var(--gold); border-radius:0 10px 10px 0; padding:12px 16px; margin:16px 0;}
                    .payment-schedule-template .highlight .lab{font-size:10px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:#8a6b34; display:block; margin-bottom:5px;}
                    .payment-schedule-template .highlight p{margin:0; color:#5c4a2a; font-size:12.5px;}
                    .payment-schedule-template .note{font-size:11px; color:var(--muted); margin:8px 0 0; font-style:italic;}
                    .payment-schedule-template .sig{display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:32px;}
                    .payment-schedule-template .sig .line{border-top:1px solid var(--ink); padding-top:9px; margin-top:40px; font-size:12px; color:var(--muted);}
                    .payment-schedule-template .sig .line b{display:block; color:var(--ink); font-size:12.5px; margin-bottom:2px;}
                    .payment-schedule-template footer{margin-top:32px; padding-top:12px; border-top:1px solid var(--line); font-size:10.5px; color:var(--muted); text-align:center; letter-spacing:.04em;}
                    @media print{ 
                        .payment-schedule-template {background:#fff;} 
                        .payment-schedule-template .sheet{padding:0 8px;} 
                        .payment-schedule-template .sec-group { break-inside: avoid; page-break-inside: avoid; }
                        .payment-schedule-template h2.sec{break-after:avoid;}
                        .payment-schedule-template .highlight, .payment-schedule-template tr{break-inside:avoid; page-break-inside:avoid;} 
                        .payment-schedule-template footer { display: none; }
                    }
                    @media(max-width:600px){ 
                        .payment-schedule-template .sheet{padding:32px 22px 56px;} 
                        .payment-schedule-template .metabar{grid-template-columns:1fr;} 
                        .payment-schedule-template .metabar div{border-right:none;} 
                        .payment-schedule-template .valuebar, .payment-schedule-template .sig{grid-template-columns:1fr;} 
                    }
                `}} />

                <div className="sheet">
                    <header className="mast">
                        <div>
                            <div className="brand">{orgData.orgName || 'Form Factors Design Studio'}</div>
                            <div className="tagline">Minimal Design. Maximum Impact.</div>
                        </div>
                        <div className="docnum">Document 2 of 2<br/>Payment Schedule</div>
                    </header>

                    <h1 className="title">Advance Payment Schedule</h1>
                    <p className="preamble">Project-specific advance payment structure for this engagement. Governed by and to be read alongside the Terms of Engagement Governing Docket ({resolvedDocketRef === '____' ? '----' : resolvedDocketRef}). It may be revised by mutual agreement; revisions do not require re-acknowledgement of the Docket.</p>

                    <div className="metabar">
                        <div><div className="k">Version</div><div className="v">v{latestSchedule.version}.0</div></div>
                        <div><div className="k">Issued</div><div className="v">{new Date(latestSchedule.issuedAt).toLocaleDateString('en-IN')}</div></div>
                        <div><div className="k">Governs Docket</div><div className="v">{resolvedDocketRef === '____' ? '----' : resolvedDocketRef}</div></div>
                        <div><div className="k">Client</div><div className="v">{projectContext.clientName}</div></div>
                        <div><div className="k">Project</div><div className="v">{projectContext.name}</div></div>
                        <div><div className="k">GST</div><div className="v">18% extra</div></div>
                    </div>

                    <div className="valuebar">
                        <div className="vb"><div className="k">Design Fee (excl. GST)</div><div className="v">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${baseDesignFee.toLocaleString('en-IN')}` : '[HIDDEN]'}</div></div>
                        <div className="vb"><div className="k">Execution Value (excl. GST)</div><div className="v">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${baseExecutionValue.toLocaleString('en-IN')}` : '[HIDDEN]'}</div></div>
                    </div>

                    {designAdvances.length > 0 && (
                        <div className="sec-group" id="sec-A" data-section-ref="A">
                            <h2 className="sec">A &middot; Design Phase <span className="pill d">% OF DESIGN FEE</span></h2>
                            <table>
                                <thead><tr><th>STAGE</th><th>PAID WHEN</th><th className="r">%</th><th className="r">AMOUNT (EXCL. GST)</th><th className="r">+18% GST</th><th className="r">TOTAL (INCL. GST)</th></tr></thead>
                                <tbody>
                                    {designAdvances.map((adv, i) => (
                                        <tr key={`d-${i}`}>
                                            <td><span className="nm">{adv.advanceCode || `D${i+1}`} &middot; {adv.label}</span><span className="sm">{adv.unlocks || ''}</span></td>
                                            <td>{adv.dueCondition}</td>
                                            <td className="pct">{adv.percentage}%</td>
                                            <td className="amt">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${(adv.amount || 0).toLocaleString('en-IN')}` : '--'}</td>
                                            <td className="amt text-slate-500">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 0.18).toLocaleString('en-IN')}` : '--'}</td>
                                            <td className="amt font-bold">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 1.18).toLocaleString('en-IN')}` : '--'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot><tr><td colSpan={2}>Design Fee total</td><td className="r">{designPctTotal}%</td><td className="r">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${designAmountTotal.toLocaleString('en-IN')}` : '--'}</td><td className="r">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${Math.round(designAmountTotal * 0.18).toLocaleString('en-IN')}` : '--'}</td><td className="r">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${Math.round(designAmountTotal * 1.18).toLocaleString('en-IN')}` : '--'}</td></tr></tfoot>
                            </table>
                        </div>
                    )}

                    {allExecutionAdvances.length > 0 && (
                        <div className="sec-group" id="sec-B" data-section-ref="B">
                            <h2 className="sec">B &middot; Execution Phase <span className="pill e">% OF EXECUTION VALUE</span></h2>
                            <table>
                                <thead><tr><th>STAGE</th><th>PAID WHEN</th><th className="r">%</th><th className="r">AMOUNT (EXCL. GST)</th><th className="r">+18% GST</th><th className="r">TOTAL (INCL. GST)</th></tr></thead>
                                <tbody>
                                    {allExecutionAdvances.map((adv, i) => (
                                        <tr key={`e-${i}`}>
                                            <td><span className="nm">{adv.advanceCode || `E${i+1}`} &middot; {adv.label}</span><span className="sm">{adv.unlocks || ''}</span></td>
                                            <td>{adv.dueCondition}</td>
                                            <td className="pct">{adv.percentage}%</td>
                                            <td className="amt">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${(adv.amount || 0).toLocaleString('en-IN')}` : '--'}</td>
                                            <td className="amt text-slate-500">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 0.18).toLocaleString('en-IN')}` : '--'}</td>
                                            <td className="amt font-bold">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 1.18).toLocaleString('en-IN')}` : '--'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot><tr><td colSpan={2}>Execution total</td><td className="r">{executionPctTotal}%</td><td className="r">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${executionAmountTotal.toLocaleString('en-IN')}` : '--'}</td><td className="r">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round(executionAmountTotal * 0.18).toLocaleString('en-IN')}` : '--'}</td><td className="r">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round(executionAmountTotal * 1.18).toLocaleString('en-IN')}` : '--'}</td></tr></tfoot>
                            </table>
                            <p className="note">Percentages are fixed; amounts are calculated from the values above. Each payment is triggered by the completed milestone shown, not by a calendar date.</p>
                            <p className="note" style={{ marginTop: '6px', lineHeight: '1.5' }}>
                                <strong>GST &amp; Statutory Applicability:</strong> Goods and Services Tax (GST) is a statutory levy governed by prevailing Government of India tax regulations and shall apply in accordance with the specific commercial and execution structure stipulated in the signed Execution Agreement. Milestone GST values indicated in this schedule reflect standard applicable statutory rates (18%) and are subject to final tax invoice terms, SAC/HSN classifications, direct procurement allowances, and executed agreement conditions.
                            </p>
                        </div>
                    )}

                    {handoverAdvances.length > 0 && (
                        <div className="highlight">
                            <span className="lab">Regarding the Completion &amp; Handover Advance</span>
                            <p>{latestSchedule.snapshotPaymentStructure?.handoverClause || "The Completion & Handover Advance unlocks the formal handover package — keys, dossier and warranty certificate. It is due upon completion of all installation and finishing work and is not conditional upon snag clearance. Snag items are addressed under warranty as per Clause 6.4 of the Terms of Engagement Governing Docket."}</p>
                        </div>
                    )}

                    <div className="sig">
                        <div><div className="line"><b>Client Signature &amp; Date</b>{projectContext.clientName}</div></div>
                        <div><div className="line"><b>For {studioName}</b>{signatoryName} &middot; {signatoryTitle}</div></div>
                    </div>

                    <footer>{orgData.orgName || 'Form Factors Design Studio'} &middot; Minimal Design. Maximum Impact. &middot; {orgData.officeAddress || '[studio address]'} &middot; {orgData.contactEmail || 'formfactors.operations@gmail.com'}</footer>
                </div>
            </div>
  );
};

export default PaymentScheduleSheet;
