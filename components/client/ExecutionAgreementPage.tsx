import React, { useRef, useState } from 'react';
import { ProjectContext } from '../../types';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { FileText, Download } from 'lucide-react';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { ShieldCheckIcon, CheckBadgeIcon } from '../Icons';
import { sendAgreementSignoffRequest } from '../../services/emailService';

interface ExecutionAgreementPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    tenantId?: string;
    activeTier?: any;
    fullBoq?: any[];
}

export default function ExecutionAgreementPage({ projectContext, setProjectContext, tenantId, activeTier, fullBoq }: ExecutionAgreementPageProps) {
    const { orgData } = useOrg();
    const { settings } = useStudioSettings(tenantId || '');
    const [isGenerating, setIsGenerating] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Get the latest payment schedule for milestones
    const paymentSchedules = projectContext.paymentSchedules || [];
    let latestSchedule: any = null;
    if (paymentSchedules.length > 0) {
        latestSchedule = paymentSchedules.reduce((prev: any, curr: any) => (prev.version > curr.version) ? prev : curr);
    }
    const executionAdvances = latestSchedule?.advances?.filter((a: any) => a.phase === 'execution' || a.phase === 'handover') || null;
    const allAdvances = latestSchedule?.advances || null;

    const handleDownloadPdf = () => {
        const element = contentRef.current;
        if (!element) return;
        setIsGenerating(true);

        import('html2pdf.js').then((module) => {
            let html2pdfObj: any;
            const html2pdf = module as any;
            if (typeof html2pdf === 'function') {
                html2pdfObj = html2pdf;
            } else if (html2pdf && typeof html2pdf.default === 'function') {
                html2pdfObj = html2pdf.default;
            } else if (html2pdf.default && typeof html2pdf.default.default === 'function') {
                html2pdfObj = html2pdf.default.default;
            }

            if (!html2pdfObj) {
                alert("PDF tools not loading");
                setIsGenerating(false);
                return;
            }

            const opt = {
                margin: [0, 0, 0, 0],
                filename: `FFDS-Execution-Agreement-${(projectContext as any).projectId || 'Draft'}.pdf`,
                image: { type: 'jpeg' as const, quality: 1 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true, windowWidth: 800 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
                pagebreak: { mode: ['css', 'legacy'] }
            };

            html2pdfObj().set(opt).from(element).toPdf().get('pdf').then((pdf: any) => {
                // PDF generated
            }).save().finally(() => {
                setIsGenerating(false);
            });
        }).catch(err => {
            console.error("Failed to load html2pdf", err);
            setIsGenerating(false);
        });
    };

    // Derived values
    const clientName = projectContext.clientName || 'Client Name';
    const clientAddress = (projectContext as any).projectAddress || 'Client Address';
    const clientEmail = projectContext.clientEmail || 'Client Email';
    const clientPhone = projectContext.clientPhone || 'Client Mobile';
    
    const studioName = settings?.companyName || orgData.orgName || 'Form Factors Design Studio';
    const studioAddress = orgData.officeAddress || '534, 5th Floor, Lodha Signet A, Kolshet Road, Thane West, Maharashtra 400607';
    const studioEmail = orgData.contactEmail || 'formfactors.operations@gmail.com';
    const repName = orgData.signatoryName || 'Principal Name';
    
    const projectName = projectContext.name || 'Project Name';
    const projectId = (projectContext as any).projectId || 'Project ID';
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const estimatedDuration = settings?.procurementLeadTimeWeeks ? (settings.procurementLeadTimeWeeks * 7 + 45) : 60; // Just an estimate fallback

    const executionTotal = activeTier?.summary?.totalSell || activeTier?.executionTotal || (projectContext.contractContent as any)?.totalValue || 0;
    const designFee = activeTier?.summary?.designFee || (projectContext.contractContent as any)?.designFee || 0;
    const gstAmount = (executionTotal + designFee) * 0.18; // Simple calculation if not provided
    const grandTotal = executionTotal + designFee + gstAmount;

    // Group BOQ
    const groupedBoq: { [key: string]: any[] } = {};
    (fullBoq || []).forEach((item: any) => {
        const roomName = item.roomId || 'General';
        if (!groupedBoq[roomName]) groupedBoq[roomName] = [];
        groupedBoq[roomName].push(item);
    });

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in pb-16">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                        <FileText className="w-5 h-5 text-indigo-700" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Execution Agreement</h3>
                        <p className="text-xs text-slate-500">Integrated FFDS Template</p>
                    </div>
                </div>
                <button 
                    onClick={handleDownloadPdf} 
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold shadow hover:bg-indigo-700 transition disabled:opacity-50"
                >
                    <Download className="w-4 h-4" />
                    {isGenerating ? 'Generating PDF...' : 'Download PDF'}
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto p-4 sm:p-8 flex justify-center">
                <div ref={contentRef} className="execution-agreement-container" style={{ width: '210mm', backgroundColor: '#ececf2' }}>
                    <style dangerouslySetInnerHTML={{__html: `
                        .ea-doc * { box-sizing: border-box; }
                        .ea-doc {
                            margin: 0;
                            padding: 0;
                            color: #334155;
                            font-family: 'Open Sans', ui-sans-serif, system-ui, sans-serif;
                            font-size: 13px;
                            line-height: 1.6;
                            text-align: left;
                        }
                        .ea-page {
                            width: 210mm;
                            min-height: 297mm;
                            margin: 0 auto 18px auto;
                            background: #fff;
                            padding: 20mm 18mm;
                            page-break-after: always;
                            position: relative;
                        }
                        .ea-page:last-child { page-break-after: auto; margin-bottom: 0; }
                        .ea-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            border-bottom: 4px solid #1e1b4b;
                            padding-bottom: 16px;
                            margin-bottom: 24px;
                        }
                        .ea-logo {
                            letter-spacing: 5px;
                            font-weight: 700;
                            font-size: 16px;
                            text-transform: uppercase;
                            color: #1e1b4b;
                        }
                        .ea-tagline {
                            color: #64748b;
                            font-size: 11px;
                            margin-top: 4px;
                            letter-spacing: .2px;
                        }
                        .ea-meta {
                            text-align: right;
                            font-size: 10.5px;
                            color: #64748b;
                            text-transform: uppercase;
                            letter-spacing: 1.2px;
                        }
                        .ea-doc h1, .ea-doc h2, .ea-doc h3 { margin: 0; color: #1e1b4b; font-family: 'Open Sans', sans-serif; }
                        .ea-doc h1 {
                            font-size: 26px;
                            line-height: 1.2;
                            margin: 24px 0 12px;
                            letter-spacing: .2px;
                            font-weight: 800;
                        }
                        .ea-doc h2 {
                            font-size: 18px;
                            margin: 24px 0 16px;
                            text-transform: uppercase;
                            letter-spacing: 1.5px;
                            border-bottom: 2px solid #1e1b4b;
                            padding-bottom: 8px;
                            font-weight: 700;
                        }
                        .ea-doc h3 {
                            font-size: 14px;
                            margin: 16px 0 8px;
                            text-transform: uppercase;
                            letter-spacing: .8px;
                            font-weight: 700;
                        }
                        .ea-doc p { margin: 0 0 10px; }
                        .ea-lead { color: #475569; max-width: 620px; }
                        .ea-grid-2 {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 16px;
                            margin: 16px 0;
                        }
                        .ea-grid-3 {
                            display: grid;
                            grid-template-columns: 1fr 1fr 1fr;
                            gap: 12px;
                            margin: 16px 0;
                        }
                        .ea-box {
                            border: 1px solid #e2e8f0;
                            border-radius: 8px;
                            padding: 16px;
                            background: #fff;
                        }
                        .ea-box.soft { background: #f8fafc; }
                        .ea-box.brand { background: #eff6ff; border-left: 4px solid #1e1b4b; }
                        .ea-box.warn { background: #fefce8; border-left: 4px solid #eab308; }
                        .ea-label {
                            font-size: 10px;
                            color: #64748b;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                            margin-bottom: 4px;
                            font-weight: 700;
                        }
                        .ea-value { font-size: 14px; font-weight: 700; color: #1e1b4b; }
                        .ea-placeholder {
                            color: #1e1b4b;
                            font-weight: 600;
                        }
                        .ea-doc table {
                            width: 100%;
                            border-collapse: collapse;
                            margin: 12px 0 16px;
                            font-size: 12px;
                        }
                        .ea-doc th {
                            background: #1e1b4b;
                            color: #fff;
                            padding: 10px;
                            text-align: left;
                            font-size: 10px;
                            text-transform: uppercase;
                            letter-spacing: .8px;
                        }
                        .ea-doc td {
                            border-bottom: 1px solid #f1f5f9;
                            padding: 9px 10px;
                            vertical-align: top;
                            color: #475569;
                        }
                        .ea-doc tr:nth-child(even) {
                            background: #fcfcfd;
                        }
                        .ea-doc tr:hover td {
                            background: #f8fafc;
                        }
                        .ea-num { width: 40px; text-align: center; }
                        .ea-right { text-align: right; }
                        .ea-small { font-size: 11px; color: #64748b; }
                        .ea-clause {
                            display: grid;
                            grid-template-columns: 42px 1fr;
                            gap: 8px;
                            margin: 8px 0;
                        }
                        .ea-clause .ea-no {
                            color: #1e1b4b;
                            font-weight: 700;
                        }
                        .ea-doc ul { margin: 8px 0 12px 0; padding-left: 24px; list-style-type: disc !important; list-style-position: outside !important; }
                        .ea-doc ol { margin: 8px 0 12px 0; padding-left: 24px; list-style-type: decimal !important; list-style-position: outside !important; }
                        .ea-doc li { margin: 6px 0; padding-left: 4px; display: list-item !important; }
                        .ea-sig-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 32px;
                            margin-top: 32px;
                        }
                        .ea-sig-line {
                            border-top: 1px solid #1e1b4b;
                            padding-top: 10px;
                            min-height: 70px;
                        }
                        .ea-footer {
                            position: absolute;
                            bottom: 10mm;
                            left: 18mm;
                            right: 18mm;
                            display: flex;
                            justify-content: space-between;
                            color: #94a3b8;
                            font-size: 9px;
                            border-top: 1px solid #e2e8f0;
                            padding-top: 7px;
                        }
                        .ea-avoid-break { break-inside: avoid; page-break-inside: avoid; }
                        .ea-toc td:first-child { width: 42px; font-weight: 700; color: #1e1b4b; }
                        .ea-annex-title {
                            background: transparent;
                            color: #1e1b4b;
                            padding-bottom: 8px;
                            border-bottom: 2px solid #1e1b4b;
                            margin-top: 32px;
                            margin-bottom: 16px;
                            font-weight: 700;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                            font-size: 18px;
                        }
                        @media print {
                            .ea-doc { background: #fff; }
                            .ea-page { margin: 0; box-shadow: none; width: 210mm; min-height: 297mm; }
                        }
                    `}} />
                    
                    <div className="ea-doc">
                        {/* Page 1 */}
                        <section className="ea-page">
                            <header className="ea-header">
                                <div>
                                    <div className="ea-logo">{studioName}</div>
                                    <div className="ea-tagline">Minimal Design, Maximum Impact.</div>
                                </div>
                                <div className="ea-meta">
                                    Integrated Agreement<br />Design-Led Turnkey Interior Execution<br />Version: FFDS-EA-2026-V2
                                </div>
                            </header>

                            <h1>Integrated Interior Execution Agreement</h1>
                            <p className="ea-lead">This Agreement is intended to govern the complete commercial, design, execution, payment, approval, handover, warranty, and dispute framework for the project described below. It is to be read together with the approved BOQ, drawings, payment schedule, and project annexures issued at the start of execution. Handover and snag records are to be created later during project close-out, and are not part of the pre-execution annexures.</p>

                            <div className="ea-grid-2">
                                <div className="ea-box">
                                    <div className="ea-label">Client</div>
                                    <div className="ea-value"><span className="ea-placeholder">{clientName}</span></div>
                                    <p className="ea-small">Address: <span className="ea-placeholder">{clientAddress}</span></p>
                                    <p className="ea-small">Email: <span className="ea-placeholder">{clientEmail}</span></p>
                                    <p className="ea-small">Mobile: <span className="ea-placeholder">{clientPhone}</span></p>
                                </div>
                                <div className="ea-box">
                                    <div className="ea-label">Service Partner / Studio</div>
                                    <div className="ea-value">{studioName}</div>
                                    <p className="ea-small">{studioAddress}</p>
                                    <p className="ea-small">Email: {studioEmail}</p>
                                    <p className="ea-small">Authorised Representative: <span className="ea-placeholder">{repName}</span></p>
                                </div>
                            </div>

                            <div className="ea-grid-3">
                                <div className="ea-box soft"><div className="ea-label">Project Name</div><div className="ea-value"><span className="ea-placeholder">{projectName}</span></div></div>
                                <div className="ea-box soft"><div className="ea-label">Project Address</div><div className="ea-value"><span className="ea-placeholder">{clientAddress}</span></div></div>
                                <div className="ea-box soft"><div className="ea-label">Project ID</div><div className="ea-value"><span className="ea-placeholder">{projectId}</span></div></div>
                            </div>

                            <div className="ea-grid-3">
                                <div className="ea-box soft"><div className="ea-label">Agreement Date</div><div className="ea-value"><span className="ea-placeholder">{dateStr}</span></div></div>
                                <div className="ea-box soft"><div className="ea-label">Estimated Duration</div><div className="ea-value"><span className="ea-placeholder">{estimatedDuration} Working Days</span></div></div>
                                <div className="ea-box soft"><div className="ea-label">Commencement Trigger</div><div className="ea-value">Site Handover + Advance Clearance</div></div>
                            </div>

                            <h2>Financial Summary</h2>
                            <table>
                                <thead>
                                    <tr><th>Particulars</th><th className="ea-right">Amount</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td>Execution Works Value, excluding GST</td><td className="ea-right">₹ <span className="ea-placeholder">{formatCurrency(executionTotal).replace('₹','')}</span></td></tr>
                                    <tr><td>Design / Professional Fees, if billed under this Agreement</td><td className="ea-right">₹ <span className="ea-placeholder">{formatCurrency(designFee).replace('₹','')}</span></td></tr>
                                    <tr><td>GST, if applicable</td><td className="ea-right">₹ <span className="ea-placeholder">{formatCurrency(gstAmount).replace('₹','')}</span></td></tr>
                                    <tr><td><strong>Grand Total</strong></td><td className="ea-right"><strong>₹ <span className="ea-placeholder">{formatCurrency(grandTotal).replace('₹','')}</span></strong></td></tr>
                                </tbody>
                            </table>
                            <p className="ea-small">Amounts, taxes, inclusions, exclusions, as-actuals, allowances, and provisional sums shall be governed by the final signed BOQ and invoice schedule.</p>

                            <div className="ea-box warn ea-avoid-break">
                                <strong>Client Acceptance Note:</strong> By signing this Agreement, approving it digitally, making payment against the invoice, or allowing commencement of work, the Client confirms that the Client has read, understood, and accepted this Agreement, the BOQ, payment schedule, approved drawings, material specifications, annexures, and the Terms of Engagement forming part of this document.
                            </div>

                            <h2>Document Index</h2>
                            <table className="ea-toc">
                                <tbody>
                                    <tr><td>1</td><td>Preamble, Definitions, Contract Documents and Order of Precedence</td></tr>
                                    <tr><td>2</td><td>Scope of Work, BOQ, Exclusions and As-Actuals</td></tr>
                                    <tr><td>3</td><td>Design Deliverables, Approvals, Revisions and Change Requests</td></tr>
                                    <tr><td>4</td><td>Payments, Taxes, Pause Rights and Material Ownership</td></tr>
                                    <tr><td>5</td><td>Execution, Site Protocol, Timeline and Client Responsibilities</td></tr>
                                    <tr><td>6</td><td>Materials, Site Conditions, Tolerances and Substitutions</td></tr>
                                    <tr><td>7</td><td>Completion, Handover, Snag Closure and Warranty</td></tr>
                                    <tr><td>8</td><td>Intellectual Property, Confidentiality and Portfolio Use</td></tr>
                                    <tr><td>9</td><td>Termination, Liability, Indemnity, Force Majeure and Dispute Resolution</td></tr>
                                    <tr><td>10</td><td>Acceptance, Digital Sign-Off and Annexures</td></tr>
                                </tbody>
                            </table>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 1</span></div>
                        </section>

                        {/* Page 2 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Integrated Execution Agreement</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>1. Preamble, Definitions and Contract Documents</h2>
                            <div className="ea-clause"><div className="ea-no">1.1</div><div>This Interior Execution Agreement is entered into between <strong><span className="ea-placeholder">{clientName}</span></strong> and <strong>{studioName}</strong> for the design-led interior execution works at the project site described in this Agreement.</div></div>
                            <div className="ea-clause"><div className="ea-no">1.2</div><div>{studioName} is a design-led interior design and execution studio. {studioName} shall act as the Client's design and execution coordination partner for the agreed scope. {studioName} may perform work through its own team, vendors, contractors, artisans, consultants, and service providers.</div></div>
                            <div className="ea-clause"><div className="ea-no">1.3</div><div>The Client confirms that the project scope, commercial value, assumptions, exclusions, payment milestones, drawings, material specifications, and execution approach have been reviewed before acceptance of this Agreement.</div></div>

                            <h3>1.4 Definitions</h3>
                            <table>
                                <thead>
                                    <tr><th>Term</th><th>Meaning</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td>Agreement</td><td>This Integrated Interior Execution Agreement, including all annexures and documents incorporated by reference.</td></tr>
                                    <tr><td>BOQ</td><td>The final bill of quantities approved by the Client, including quantities, unit rates, item descriptions, inclusions, exclusions, allowances, and as-actuals.</td></tr>
                                    <tr><td>GFC Drawings</td><td>Good for Construction drawings issued by {studioName} for execution after design approvals.</td></tr>
                                    <tr><td>As-Actuals</td><td>Items where the final payable value depends on actual vendor bill, site measurement, final selection, quantity, brand, model, or market cost.</td></tr>
                                    <tr><td>Change Request</td><td>Any addition, deletion, modification, upgrade, rework, preference change, specification change, quantity change, design change, or site requirement arising after approval or commencement.</td></tr>
                                    <tr><td>Substantial Completion</td><td>The stage at which major works under the agreed BOQ are completed and the premises can be functionally used, even if minor snags remain.</td></tr>
                                    <tr><td>Snag</td><td>A minor workmanship defect, adjustment, alignment issue, touch-up, finishing issue, or rectification that does not prevent functional use of the space.</td></tr>
                                    <tr><td>Incomplete Work</td><td>A BOQ item that has not been substantially installed or delivered at all, excluding snags, adjustments, third-party delays, manufacturer defects, and client-supplied item issues.</td></tr>
                                </tbody>
                            </table>

                            <h3>1.5 Contract Documents</h3>
                            <p>The following documents together constitute the complete agreement between the parties:</p>
                            <ol>
                                <li>This Integrated Interior Execution Agreement.</li>
                                <li>Final approved BOQ and commercial summary.</li>
                                <li>Payment Schedule and invoices issued by {studioName}.</li>
                                <li>Approved design drawings, GFC drawings, 3D views, mood boards, and material/selection sheets.</li>
                                <li>Approved Change Requests and revised BOQs issued after this Agreement.</li>
                                <li>Future site notes, Minutes of Meeting, WhatsApp/email approvals, handover records, and snag records created during execution or close-out, to the extent consistent with this Agreement.</li>
                            </ol>

                            <h3>1.6 Order of Precedence</h3>
                            <div className="ea-box brand ea-avoid-break">
                                <p>In case of inconsistency between documents, the following order shall apply:</p>
                                <ol>
                                    <li>Approved Change Requests issued after this Agreement.</li>
                                    <li>This Integrated Interior Execution Agreement.</li>
                                    <li>Final approved BOQ, commercial summary, and payment schedule.</li>
                                    <li>GFC drawings and approved material/finish sheets.</li>
                                    <li>Earlier design presentations, 3D views, concept notes, estimates, discussions, WhatsApp messages, and verbal conversations.</li>
                                </ol>
                                <p>Earlier discussions, informal communications, verbal assurances, indicative estimates, and unapproved options shall not override the signed/approved contract documents.</p>
                            </div>

                            <h3>1.7 Authorised Client Representatives</h3>
                            <div className="ea-clause"><div className="ea-no">1.7.1</div><div>Only the following persons are authorised to approve scope, design, materials, BOQ changes, Change Requests, site decisions, payment confirmations, and handover records:</div></div>
                            <table>
                                <thead>
                                    <tr><th>Name</th><th>Relationship / Role</th><th>Email</th><th>Mobile</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td><span className="ea-placeholder">{clientName}</span></td><td><span className="ea-placeholder">Client</span></td><td><span className="ea-placeholder">{clientEmail}</span></td><td><span className="ea-placeholder">{clientPhone}</span></td></tr>
                                    <tr><td><span className="ea-placeholder">Name 2</span></td><td><span className="ea-placeholder">Role</span></td><td><span className="ea-placeholder">Email</span></td><td><span className="ea-placeholder">Mobile</span></td></tr>
                                </tbody>
                            </table>
                            <div className="ea-clause"><div className="ea-no">1.7.2</div><div>Instructions from relatives, residents, children, domestic help, society staff, contractors, vendors, neighbours, or any third party shall not be binding on {studioName} unless confirmed in writing by an authorised Client representative.</div></div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 2</span></div>
                        </section>

                        {/* Page 3 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Scope, BOQ and Exclusions</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>2. Scope of Work, BOQ, Exclusions and As-Actuals</h2>
                            <div className="ea-clause"><div className="ea-no">2.1</div><div>The scope of work shall be strictly limited to items expressly listed in the final approved BOQ and this Agreement. Any item not expressly mentioned as included shall be treated as excluded.</div></div>
                            <div className="ea-clause"><div className="ea-no">2.2</div><div>The BOQ forms an integral part of this Agreement. Quantities, rates, brands, specifications, finishes, item descriptions, execution assumptions, and exclusions shall be read together with the approved drawings and material specifications.</div></div>
                            <div className="ea-clause"><div className="ea-no">2.3</div><div>BOQ quantities are based on approved drawings and site assumptions available at the time of commercial finalisation. Final quantities may change due to site measurement, design changes, structural/site constraints, Client-requested changes, or actual work carried out. Such changes shall be billed or adjusted as applicable.</div></div>
                            <div className="ea-clause"><div className="ea-no">2.4</div><div>Any addition, deletion, material change, specification upgrade, dimensional change, relocation, rework, redesign, or modification after BOQ/design approval shall be treated as a Change Request and may affect cost and timeline.</div></div>

                            <h3>2.5 Room-Wise Included Scope</h3>
                            <table>
                                <thead>
                                    <tr><th>Area</th><th>Included Items</th><th>Key Notes</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td>Living Room</td><td><span className="ea-placeholder">As per BOQ</span></td><td>Only approved carpentry, paneling, lighting, finishes, loose items, and decor expressly listed in BOQ are included.</td></tr>
                                    <tr><td>Kitchen</td><td><span className="ea-placeholder">As per BOQ</span></td><td>Kitchen appliances, gas work, chimney duct, hob, sink, faucet, hardware upgrades, organisers, and countertop are included only if expressly listed.</td></tr>
                                    <tr><td>Master Bedroom</td><td><span className="ea-placeholder">As per BOQ</span></td><td>Mattress, loose furniture, AC, curtains, bedding, decor, and electronics are excluded unless listed.</td></tr>
                                    <tr><td>Bedroom 2 / Kids / Guest</td><td><span className="ea-placeholder">As per BOQ</span></td><td>Study units, wardrobes, beds, lofts, paneling, and electrical scope are governed by approved drawings and BOQ.</td></tr>
                                    <tr><td>Bathrooms</td><td><span className="ea-placeholder">As per BOQ</span></td><td>Sanitaryware, CP fittings, geysers, exhaust fans, drains, waterproofing, tile work, and plumbing are included only if expressly listed.</td></tr>
                                    <tr><td>Functional Works</td><td><span className="ea-placeholder">As per BOQ</span></td><td>Cut-outs, concealed conditions, additional points, repairs, and rewiring beyond BOQ are chargeable.</td></tr>
                                    <tr><td>Site Services</td><td><span className="ea-placeholder">As per BOQ</span></td><td>Society deposits, penalties, lift charges, loading/unloading charges, security requirements, and special permissions are excluded unless listed.</td></tr>
                                </tbody>
                            </table>

                            <h3>2.6 Standard Exclusions</h3>
                            <p>Unless expressly included in the BOQ, the following are excluded:</p>
                            <ul>
                                <li>Society deposits, permissions, NOCs, move-in/move-out charges, lift protection, building penalties, working-hour penalties, and society-imposed charges.</li>
                                <li>Major civil work, waterproofing, structural work, slab/beam modification, wall breaking, window/door frame replacement, aluminium/window work, grills, and external façade work.</li>
                                <li>White goods, appliances, televisions, music systems, AC machines, geysers, exhaust fans, kitchen equipment, gas pipeline work, water purifiers, soft furnishings, mattresses, loose decor, curtains, plants, art, and accessories.</li>
                                <li>Sanitaryware, CP fittings, tiles, stone, quartz, lights, fans, switches, automation, loose furniture, and hardware upgrades unless listed as included.</li>
                                <li>Repairs arising from seepage, leakage, termite, pests, structural defects, voltage fluctuations, existing electrical/plumbing faults, building-source issues, or third-party work.</li>
                                <li>Any work requested after handover, other than legitimate warranty-covered workmanship snags.</li>
                            </ul>

                            <h3>2.7 As-Actuals, Allowances and Provisional Sums</h3>
                            <div className="ea-clause"><div className="ea-no">2.7.1</div><div>Items marked as As-Actuals, Provisional, Allowance, To Be Finalised, Client Selection, Vendor Actuals, or equivalent shall be billed based on actual cost, final selected model, brand, specification, quantity, vendor invoice, site measurement, transport, taxes, and handling/coordination charges if applicable.</div></div>
                            <div className="ea-clause"><div className="ea-no">2.7.2</div><div>For client-procured or directly paid vendor items, {studioName}’s role is limited to design coordination and execution integration unless otherwise agreed in writing. {studioName} shall not be responsible for product quality, vendor delay, shortage, warranty, service, breakage, delivery, installation defect, compatibility, or after-sales support for such items.</div></div>
                            <div className="ea-clause"><div className="ea-no">2.7.3</div><div>Any delay caused by client selections, vendor approvals, client-procured items, product availability, direct vendor delays, delayed payments to vendors, or defective/incorrect materials shall extend the project timeline and may result in remobilisation charges.</div></div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 3</span></div>
                        </section>

                        {/* Page 4 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Design, Approvals and Change Requests</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>3. Design Deliverables, Approvals, Revisions and Change Requests</h2>

                            <h3>3.1 Design Deliverables</h3>
                            <table>
                                <thead>
                                    <tr><th>Deliverable</th><th>Included / Not Included</th><th>Notes</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td>Space Planning</td><td><span className="ea-placeholder">Included</span></td><td>Layouts as per agreed design scope.</td></tr>
                                    <tr><td>3D Views</td><td><span className="ea-placeholder">Included</span></td><td>Number of views and rooms as per design scope. 3D views represent design intent.</td></tr>
                                    <tr><td>GFC Drawings</td><td><span className="ea-placeholder">Included</span></td><td>Civil, electrical, ceiling, plumbing, carpentry, furniture, detail drawings, as applicable.</td></tr>
                                    <tr><td>Material and Selection Sheets</td><td><span className="ea-placeholder">Included</span></td><td>Final finishes, materials, laminates, veneers, stone, paint, lights, fittings, hardware, etc.</td></tr>
                                    <tr><td>BOQ and Payment Schedule</td><td>Included</td><td>Commercial document for execution and milestone billing.</td></tr>
                                </tbody>
                            </table>

                            <h3>3.2 Design Visuals and Execution Reality</h3>
                            <div className="ea-box brand ea-avoid-break">
                                <p>3D views, mood boards, sketches, renders, and presentations are visual representations intended to communicate design intent. Final execution shall be governed by approved GFC drawings, site measurements, BOQ, material samples, technical feasibility, and available products.</p>
                                <p>Minor variations in shade, texture, grain, lighting effect, proportions, depth, visibility, joinery lines, hardware placement, site fitment, and alignment due to site conditions, product availability, material behaviour, or execution practicality shall not be treated as defects if within commercially acceptable tolerance.</p>
                            </div>

                            <h3>3.3 Revision Policy</h3>
                            <div className="ea-clause"><div className="ea-no">3.3.1</div><div>Unless otherwise stated in the design scope, {studioName} shall provide up to <strong>two design options/revision rounds per room or design area</strong> during the design phase.</div></div>
                            <div className="ea-clause"><div className="ea-no">3.3.2</div><div>Additional revisions, preference changes, re-design, alternate design directions, repeated option development, or revisions after design sign-off shall be chargeable at the rates specified in Annexure B or as quoted by {studioName}.</div></div>
                            <div className="ea-clause"><div className="ea-no">3.3.3</div><div>Any change requested after procurement, fabrication, cutting, ordering, installation, or site execution has commenced shall be treated as rework and shall be chargeable, even if the change arises from Client preference.</div></div>

                            <h3>3.4 Approval Protocol</h3>
                            <div className="ea-clause"><div className="ea-no">3.4.1</div><div>Approvals may be given through email, WhatsApp, signed document, digital approval link, payment against invoice, selection confirmation, or other written confirmation by an authorised Client representative.</div></div>
                            <div className="ea-clause"><div className="ea-no">3.4.2</div><div>Verbal discussions, phone calls, site conversations, or instructions to contractors shall not constitute binding approvals unless confirmed in writing by an authorised Client representative and acknowledged by {studioName}.</div></div>
                            <div className="ea-clause"><div className="ea-no">3.4.3</div><div>Client approvals shall be provided within 48 hours unless a different timeline is agreed. Delay in approval shall extend the project timeline and may affect material availability, vendor scheduling, and cost.</div></div>
                            <div className="ea-clause"><div className="ea-no">3.4.4</div><div>Once drawings, materials, specifications, or BOQ are approved, {studioName} may proceed with procurement, fabrication, and execution. Any subsequent change shall be a Change Request.</div></div>

                            <h3>3.5 Change Request Process</h3>
                            <ol>
                                <li>Client submits request through email or WhatsApp to {studioName}.</li>
                                <li>{studioName} reviews feasibility, cost, timeline impact, procurement impact, design impact, and site constraints.</li>
                                <li>{studioName} issues written quote/revised BOQ/payment requirement, where applicable.</li>
                                <li>Client approves in writing and clears the applicable advance/payment.</li>
                                <li>{studioName} schedules the change subject to labour, vendor, material, and site availability.</li>
                            </ol>
                            <div className="ea-clause"><div className="ea-no">3.5.1</div><div>No Change Request shall be executed unless approved in writing by the Client and accepted by {studioName}. {studioName} may refuse a Change Request if it is unsafe, technically unsuitable, commercially impractical, inconsistent with approved design intent, dependent on unavailable labour/material, or likely to compromise project quality.</div></div>
                            <div className="ea-clause"><div className="ea-no">3.5.2</div><div>Any approved Change Request may result in a revised payment schedule. {studioName} is not required to proceed with the changed work unless the applicable advance has been received and cleared.</div></div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 4</span></div>
                        </section>

                        {/* Page 5 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Payments and Commercial Protection</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>4. Payments, Taxes, Pause Rights and Material Ownership</h2>

                            <h3>4.1 Advance Payment Principle</h3>
                            <div className="ea-box warn ea-avoid-break">
                                <p><strong>All {studioName} project payments are advance-linked.</strong> No stage of design, procurement, fabrication, site execution, installation, handover, warranty documentation, or snag rectification is required to commence or continue unless the corresponding invoice has been paid and cleared.</p>
                                <p>Payment is treated as received only after funds are credited and cleared in {studioName}’s designated bank account.</p>
                            </div>

                            <h3>4.2 Execution Milestones</h3>
                            <table>
                                <thead>
                                    <tr><th>Stage</th><th>Trigger</th><th>%</th><th>Amount</th><th>Due</th></tr>
                                </thead>
                                <tbody>
                                    {executionAdvances ? executionAdvances.map((m: any, i: number) => {
                                        const amount = m.amount || (executionTotal * (m.percentage / 100));
                                        return (
                                        <tr key={i}>
                                            <td>{m.label}</td>
                                            <td>{m.dueCondition}</td>
                                            <td>{m.percentage}%</td>
                                            <td>₹ {formatCurrency(amount).replace('₹','')}</td>
                                            <td>Before stage begins</td>
                                        </tr>
                                    )}) : projectContext.paymentMilestones?.filter((m: any) => m.type === 'execution').map((m, i) => (
                                        <tr key={i}>
                                            <td>{m.name}</td>
                                            <td>{m.description}</td>
                                            <td>{m.percentage}%</td>
                                            <td>₹ {formatCurrency(executionTotal * (m.percentage / 100)).replace('₹','')}</td>
                                            <td>Before stage begins</td>
                                        </tr>
                                    )) || (
                                        <>
                                            <tr><td>Execution Advance 1</td><td>Agreement acceptance / site mobilisation / procurement start</td><td>10%</td><td>₹ <span className="ea-placeholder">{formatCurrency(executionTotal * 0.10).replace('₹','')}</span></td><td>Before commencement</td></tr>
                                            <tr><td>Execution Advance 2</td><td>Structural / carpentry / civil / procurement stage</td><td>40%</td><td>₹ <span className="ea-placeholder">{formatCurrency(executionTotal * 0.40).replace('₹','')}</span></td><td>Before stage begins</td></tr>
                                            <tr><td>Execution Advance 3</td><td>Finishing / installation / painting / final site stage</td><td>40%</td><td>₹ <span className="ea-placeholder">{formatCurrency(executionTotal * 0.40).replace('₹','')}</span></td><td>Before stage begins</td></tr>
                                            <tr><td>Final Advance</td><td>Substantial completion / pre-handover / handover readiness</td><td>10%</td><td>₹ <span className="ea-placeholder">{formatCurrency(executionTotal * 0.10).replace('₹','')}</span></td><td>Before handover documents, keys, access cards, warranty certificate, and final dossier release</td></tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                            <p className="ea-small">Milestone percentages may be modified for a specific project in Annexure A. If there is a conflict, the signed Annexure A payment schedule shall apply.</p>

                            <h3>4.3 Taxes and Statutory Charges</h3>
                            <div className="ea-clause"><div className="ea-no">4.3.1</div><div>GST shall be applicable as per law on all taxable invoices unless expressly stated otherwise. Any future change in tax rate, cess, government levy, or statutory charge shall be borne by the Client.</div></div>
                            <div className="ea-clause"><div className="ea-no">4.3.2</div><div>Bank charges, payment gateway charges, TDS implications, foreign remittance charges, and any withholding shall be addressed separately. Invoice value must be received in full unless TDS is legally applicable and proper certificate is provided.</div></div>

                            <h3>4.4 Non-Payment, Pause Rights and Remobilisation</h3>
                            <div className="ea-clause"><div className="ea-no">4.4.1</div><div>If any invoice remains unpaid beyond its due date, {studioName} may pause design work, procurement, fabrication, site execution, supervision, installation, handover, warranty documentation, and snag closure without liability for delay.</div></div>
                            <div className="ea-clause"><div className="ea-no">4.4.2</div><div>Any payment delay shall automatically extend the project timeline by the actual delay period plus reasonable remobilisation time required to reschedule labour, vendors, materials, and site activity.</div></div>
                            <div className="ea-clause"><div className="ea-no">4.4.3</div><div>Invoices unpaid for more than 7 calendar days from due date may carry delayed payment charges at 1.5% per month or the maximum legally permissible rate, whichever is lower, along with recovery costs, legal costs, and remobilisation costs if applicable.</div></div>
                            <div className="ea-clause"><div className="ea-no">4.4.4</div><div>{studioName} may withhold non-installed materials, loose items, handover dossier, keys/access cards in {studioName} possession, warranty certificate, final drawings, vendor details, and project closure documents until full payment clearance.</div></div>

                            <h3>4.5 Ownership of Materials and Work-in-Progress</h3>
                            <div className="ea-clause"><div className="ea-no">4.5.1</div><div>Materials, fittings, hardware, loose items, work-in-progress, drawings, documentation, and products procured or created by {studioName} shall remain the property of {studioName} until full payment for the relevant stage/item has been received and cleared.</div></div>
                            <div className="ea-clause"><div className="ea-no">4.5.2</div><div>If the Client terminates, delays, or defaults after procurement or fabrication has commenced, {studioName} may recover committed costs, vendor cancellation charges, labour charges, storage charges, remobilisation charges, and value of completed work before releasing any project material or deliverable.</div></div>

                            <h3>4.6 No Set-Off Against Snags</h3>
                            <div className="ea-clause"><div className="ea-no">4.6.1</div><div>The Client may not withhold milestone payments or final advance against snag items. Snags are post-completion rectifications covered under snag/warranty protocol and do not constitute grounds to delay payment unless the item is an incomplete work item as defined in this Agreement.</div></div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 5</span></div>
                        </section>

                        {/* Page 6 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Execution and Site Protocol</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>5. Execution, Site Protocol, Timeline and Client Responsibilities</h2>

                            <h3>5.1 Commencement Conditions</h3>
                            <p>{studioName} shall commence execution only after all of the following are completed:</p>
                            <ol>
                                <li>Agreement acceptance and payment of applicable advance.</li>
                                <li>Client provides vacant/uninterrupted site access as required for the agreed scope.</li>
                                <li>Society/building permissions, deposits, work timings, lift access, and site rules are confirmed by the Client.</li>
                                <li>Power, water, toilet access, storage space, and work area availability are provided.</li>
                                <li>Critical design drawings, material selections, and BOQ are approved.</li>
                            </ol>

                            <h3>5.2 Client Responsibilities</h3>
                            <ul>
                                <li>Provide timely approvals, decisions, information, site access, permissions, and payments.</li>
                                <li>Ensure society/building permissions and compliance with building rules.</li>
                                <li>Ensure no unauthorised person gives instructions to {studioName} contractors/vendors.</li>
                                <li>Clear direct vendor payments, as-actuals, client-procured items, and third-party invoices on time.</li>
                                <li>Keep valuables, personal belongings, documents, fragile items, and existing loose items removed or protected before work starts.</li>
                                <li>Inform {studioName} in writing of any known leakage, seepage, termite, electrical, plumbing, structural, or society-related restriction before commencement.</li>
                            </ul>

                            <h3>5.3 Site Access and Safety</h3>
                            <div className="ea-clause"><div className="ea-no">5.3.1</div><div>All Client site visits during execution shall be coordinated in advance with {studioName}. Unannounced visits during active construction are discouraged for safety, workflow, and liability reasons.</div></div>
                            <div className="ea-clause"><div className="ea-no">5.3.2</div><div>The Client shall not directly instruct, supervise, argue with, or interfere with {studioName} contractors, labour, vendors, or artisans. Any instruction must be routed through {studioName}.</div></div>
                            <div className="ea-clause"><div className="ea-no">5.3.3</div><div>Any rework, rectification, damage, delay, or cost arising from unauthorised Client instructions to contractors/vendors shall be charged to the Client.</div></div>
                            <div className="ea-clause"><div className="ea-no">5.3.4</div><div>{studioName} may restrict site access during high-risk activities, wet work, electrical work, carpentry cutting, polishing, painting, ceiling work, or active installation.</div></div>

                            <h3>5.4 Timeline</h3>
                            <div className="ea-clause"><div className="ea-no">5.4.1</div><div>The project duration is an estimated working-day schedule, not a fixed-date guarantee, unless specifically agreed in writing. The timeline starts only after commencement conditions are fulfilled.</div></div>
                            <div className="ea-clause"><div className="ea-no">5.4.2</div><div>Timeline excludes Sundays, public holidays, labour holidays, building/society restricted days, force majeure events, and days on which work cannot be performed due to reasons beyond {studioName}’s control.</div></div>

                            <h3>5.5 Timeline Exclusions and Extensions</h3>
                            <p>The project timeline shall be extended for delays caused by:</p>
                            <ul>
                                <li>Client approval delays, payment delays, scope changes, design changes, selection delays, or late information.</li>
                                <li>Society permissions, lift access, restricted working hours, noise restrictions, building shutdowns, security restrictions, or neighbour complaints.</li>
                                <li>Client-supplied items, direct vendors, vendor delays, material shortage, product discontinuation, market availability, transport delay, or manufacturer service delays.</li>
                                <li>Concealed site conditions, seepage, leakage, structural/plumbing/electrical defects, termite, uneven surfaces, building defects, or required corrective works.</li>
                                <li>Force majeure, public disruption, weather, strikes, government action, accidents, illness, labour shortages, supply chain disruption, or any cause beyond {studioName}’s reasonable control.</li>
                            </ul>
                            <div className="ea-clause"><div className="ea-no">5.5.1</div><div>Any such delay shall extend the timeline by the actual delay period plus reasonable remobilisation time.</div></div>

                            <h3>5.6 Supervision and Updates</h3>
                            <div className="ea-clause"><div className="ea-no">5.6.1</div><div>{studioName} shall provide periodic supervision as required for the execution stage. Continuous full-time site presence is not included unless separately agreed and billed.</div></div>
                            <div className="ea-clause"><div className="ea-no">5.6.2</div><div>Weekly or periodic updates shall be shared through the agreed communication channel. Urgent operational decisions may be communicated by WhatsApp/email.</div></div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 6</span></div>
                        </section>

                        {/* Page 7 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Materials, Site Conditions and Tolerances</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>6. Materials, Site Conditions, Tolerances and Substitutions</h2>

                            <h3>6.1 Site Measurement and Existing Conditions</h3>
                            <div className="ea-clause"><div className="ea-no">6.1.1</div><div>{studioName}’s scope and estimate are based on visible and reasonably assessable site conditions at the time of proposal and measurement. Concealed or latent defects discovered later shall be treated as additional work.</div></div>
                            <div className="ea-clause"><div className="ea-no">6.1.2</div><div>Concealed issues may include seepage, leakage, dampness, termite damage, pest infestation, uneven walls/floors, slab/beam deviations, weak plaster, structural cracks, plumbing faults, electrical faults, voltage instability, waterproofing failure, building-source defects, or previous contractor defects.</div></div>
                            <div className="ea-clause"><div className="ea-no">6.1.3</div><div>Any additional work, material, testing, rectification, waiting period, or redesign required due to such conditions shall be charged separately and may affect timeline.</div></div>

                            <h3>6.2 Material Selection and Batch Variation</h3>
                            <div className="ea-clause"><div className="ea-no">6.2.1</div><div>Natural and manufactured materials, including veneer, wood, laminate, stone, tiles, fabric, leatherette, metal, paint, polish, wallpaper, glass, mirror, and hardware, may have shade, grain, texture, reflection, batch, and finish variations.</div></div>
                            <div className="ea-clause"><div className="ea-no">6.2.2</div><div>Commercially acceptable variations, manufacturer batch differences, natural material behaviour, polish/paint shade variation due to lighting/site conditions, and minor finish variations shall not be treated as defects.</div></div>
                            <div className="ea-clause"><div className="ea-no">6.2.3</div><div>The Client is responsible for reviewing and approving samples, catalogues, product specifications, and selection sheets before procurement wherever samples are provided or made available.</div></div>

                            <h3>6.3 Material Availability and Substitution</h3>
                            <div className="ea-clause"><div className="ea-no">6.3.1</div><div>If an approved material, product, model, colour, finish, hardware, appliance, fitting, or vendor item becomes unavailable, discontinued, delayed, defective, or commercially impractical, {studioName} may propose an equivalent or commercially reasonable alternative for Client approval.</div></div>
                            <div className="ea-clause"><div className="ea-no">6.3.2</div><div>Any cost or timeline impact from such substitution, waiting period, or reselection shall be borne by the Client unless caused solely by {studioName}’s wilful default.</div></div>

                            <h3>6.4 Execution Tolerances</h3>
                            <p>The Client acknowledges that interior execution is site-specific and subject to practical tolerances. The following shall not be considered defects if within normal industry standards and not affecting functional use:</p>
                            <ul>
                                <li>Minor dimensional variation due to wall/floor/ceiling unevenness or site constraints.</li>
                                <li>Minor shutter gaps, alignment adjustments, hardware tuning, and settlement adjustments.</li>
                                <li>Minor paint/polish/laminate shade variation due to batch, lighting, reflection, or viewing angle.</li>
                                <li>Visible joints where technically necessary or as per material size limitations.</li>
                                <li>Minor variation between 3D/renders and actual site execution due to site measurement, technical feasibility, or material availability.</li>
                                <li>Cut-outs, service access panels, grooves, profiles, and technical modifications required for lights, AC, electrical, plumbing, hardware, and maintenance access.</li>
                            </ul>

                            <h3>6.5 Third-Party and Manufacturer Products</h3>
                            <div className="ea-clause"><div className="ea-no">6.5.1</div><div>Products such as appliances, lights, fans, switches, sanitaryware, CP fittings, hardware, modular accessories, laminates, wallpapers, glass, mirrors, loose furniture, and decor items are subject to manufacturer warranty and vendor terms.</div></div>
                            <div className="ea-clause"><div className="ea-no">6.5.2</div><div>{studioName} shall not be liable for manufacturer defects, product failure, service delays, spare part issues, warranty refusal, colour variation, delivery damage, incorrect product supply, or after-sales service for third-party products. {studioName} may assist in coordination as a professional courtesy or chargeable service, as applicable.</div></div>

                            <h3>6.6 Existing Items and Retained Client Materials</h3>
                            <div className="ea-clause"><div className="ea-no">6.6.1</div><div>If existing doors, windows, flooring, furniture, plumbing, wiring, walls, or fittings are retained and modified, {studioName} shall not be responsible for hidden weaknesses, age-related damage, incompatibility, finish mismatch, or reduced life of the existing item.</div></div>
                            <div className="ea-clause"><div className="ea-no">6.6.2</div><div>Polishing, relamination, refitting, reusing, or modifying existing items carries inherent risk. Any additional repair, replacement, or rework required shall be chargeable unless expressly included.</div></div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 7</span></div>
                        </section>

                        {/* Page 8 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Completion, Handover and Warranty</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>7. Completion, Handover, Snag Closure and Warranty</h2>

                            <h3>7.1 Substantial Completion</h3>
                            <div className="ea-clause"><div className="ea-no">7.1.1</div><div>Works shall be considered substantially complete when major installation and finishing works under the agreed BOQ are completed and the premises can be functionally used, even if minor snag items, adjustments, touch-ups, manufacturer service visits, or third-party pending items remain.</div></div>
                            <div className="ea-clause"><div className="ea-no">7.1.2</div><div>Minor snags, polish touch-ups, paint touch-ups, shutter alignment, hardware tuning, replacement of defective third-party product, manufacturer service call, pending client-supplied item, or vendor delayed item shall not be treated as incomplete execution.</div></div>

                            <h3>7.2 Pre-Handover Inspection and Snag List</h3>
                            <div className="ea-clause"><div className="ea-no">7.2.1</div><div>Upon substantial completion, {studioName} shall invite the Client for a pre-handover inspection. A joint snag list shall be prepared and recorded through email, WhatsApp, site note, or digital record.</div></div>
                            <div className="ea-clause"><div className="ea-no">7.2.2</div><div>The Client must identify and record all visible snag items within 7 calendar days of handover or {studioName}’s written handover readiness communication, whichever is earlier. Items raised after this period shall be treated as warranty/maintenance requests, subject to coverage.</div></div>
                            <div className="ea-clause"><div className="ea-no">7.2.3</div><div>{studioName} shall address legitimate snag items within a reasonable timeline, subject to payment clearance, site access, vendor availability, product availability, and nature of rectification. Standard snags are targeted within 14 working days unless dependent on vendors/materials/manufacturer service.</div></div>

                            <h3>7.3 Final Advance and Handover Release</h3>
                            <div className="ea-box warn ea-avoid-break">
                                <p>The final advance is due upon substantial completion / handover readiness. It releases the handover dossier, warranty certificate, final closure documents, keys/access cards held by {studioName}, and any final deliverables. The final advance is not conditional upon complete closure of snag items.</p>
                                <p>Withholding the final advance against snag items shall be treated as breach of payment terms. {studioName} remains committed to addressing legitimate snag items in accordance with this Agreement after payment clearance and site access.</p>
                            </div>

                            <h3>7.4 Deemed Handover</h3>
                            <div className="ea-clause"><div className="ea-no">7.4.1</div><div>The project shall be deemed handed over if the Client takes possession of the premises, shifts belongings, starts using the premises, permits third-party work, restricts {studioName} access, delays inspection after {studioName} offers handover, or otherwise assumes control of the site.</div></div>
                            <div className="ea-clause"><div className="ea-no">7.4.2</div><div>Warranty period, final payment obligation, site-risk transfer, and post-handover responsibilities shall begin from the date of actual or deemed handover, whichever is earlier.</div></div>

                            <h3>7.5 Warranty</h3>
                            <table>
                                <thead>
                                    <tr><th>Category</th><th>Standard Warranty</th><th>Coverage</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td>{studioName} Workmanship</td><td>6 months from handover / deemed handover unless a project-specific warranty certificate states otherwise</td><td>Workmanship defects in {studioName}-executed carpentry, installation, finishing, and agreed trade works under normal usage.</td></tr>
                                    <tr><td>Third-Party Products</td><td>As per manufacturer/vendor warranty</td><td>Lights, appliances, hardware, fittings, sanitaryware, loose products, modular accessories, and similar products.</td></tr>
                                    <tr><td>Client-Supplied Items</td><td>No {studioName} warranty</td><td>{studioName} may assist with coordination where separately agreed.</td></tr>
                                </tbody>
                            </table>
                            <div className="ea-clause"><div className="ea-no">7.5.1</div><div>Warranty shall be valid only after all outstanding payments, including Change Requests, as-actuals, and final advance, have been cleared in full.</div></div>
                            <div className="ea-clause"><div className="ea-no">7.5.2</div><div>Warranty claims must be submitted in writing with clear photos/videos and description. {studioName} shall assess the reported issue within a reasonable time, subject to availability and site access.</div></div>

                            <h3>7.6 Warranty Exclusions</h3>
                            <p>Warranty does not cover:</p>
                            <ul>
                                <li>Misuse, negligence, overloading, impact damage, scratches, dents, stains, burns, chemical damage, water damage, pest/termite damage, unauthorised modifications, or third-party work.</li>
                                <li>Seepage, leakage, dampness, mould, building-source water issues, plumbing line failure, waterproofing failure, structural movement, cracks, or society/building defects.</li>
                                <li>Voltage fluctuations, electrical supply issues, earthing issues, appliance failures, product defects, manufacturer defects, or normal wear and tear.</li>
                                <li>Natural material movement, minor shade variation, fading, polish ageing, hardware settlement, routine maintenance, cleaning, or adjustment required due to use.</li>
                                <li>Issues caused by AC leakage, plants, wet mopping, water stagnation, improper cleaning, lack of ventilation, or high humidity.</li>
                            </ul>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 8</span></div>
                        </section>

                        {/* Page 9 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">IP, Termination and Liability</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>8. Intellectual Property, Confidentiality and Portfolio Use</h2>
                            <div className="ea-clause"><div className="ea-no">8.1</div><div>All design concepts, layouts, 3D views, drawings, BOQs, specifications, design documents, schedules, checklists, methods, templates, and documentation prepared by {studioName} remain the intellectual property of {studioName}.</div></div>
                            <div className="ea-clause"><div className="ea-no">8.2</div><div>Upon full payment clearance, the Client receives a non-exclusive, non-transferable licence to use the final approved design and documents only for the agreed project site. The Client may not reuse, reproduce, share, sell, adapt, or execute the design at another site without written permission from {studioName}.</div></div>
                            <div className="ea-clause"><div className="ea-no">8.3</div><div>Unpaid or partially paid drawings, BOQs, designs, and deliverables may be withheld and shall not be used by the Client or any third party.</div></div>
                            <div className="ea-clause"><div className="ea-no">8.4</div><div>Each party shall keep confidential the other party’s non-public commercial, personal, design, and project information. This obligation does not prevent {studioName} from maintaining internal records, legal records, vendor coordination records, or statutory/tax documentation.</div></div>
                            <div className="ea-clause"><div className="ea-no">8.5</div><div>{studioName} may photograph or video record the project for internal documentation, quality records, portfolio, website, social media, case studies, awards, and marketing, provided personal/private items are not intentionally displayed. If the Client requires privacy restrictions, the Client must notify {studioName} in writing before shoot scheduling.</div></div>

                            <h2>9. Termination, Liability, Indemnity, Force Majeure and Dispute Resolution</h2>

                            <h3>9.1 Termination by Client</h3>
                            <div className="ea-clause"><div className="ea-no">9.1.1</div><div>The Client may terminate this Agreement by written notice. On termination, {studioName} shall be entitled to payment for all completed work, work-in-progress, design work, procurement, committed vendor costs, cancellation charges, labour charges, site costs, supervision, documentation, storage, taxes, and demobilisation/remobilisation costs up to the date of termination.</div></div>
                            <div className="ea-clause"><div className="ea-no">9.1.2</div><div>Advances for stages already commenced, procured, fabricated, scheduled, or committed are non-refundable to the extent of work done and costs committed. Refund, if any, shall be calculated only after reconciliation and deduction of all dues.</div></div>
                            <div className="ea-clause"><div className="ea-no">9.1.3</div><div>{studioName} shall not be required to hand over unpaid drawings, documents, vendor details, non-installed materials, or work-in-progress unless all outstanding amounts are settled.</div></div>

                            <h3>9.2 Termination or Suspension by {studioName}</h3>
                            <div className="ea-clause"><div className="ea-no">9.2.1</div><div>{studioName} may suspend or terminate the engagement if payments remain unpaid, Client repeatedly delays approvals, site access is denied, Client or representatives interfere with contractors/vendors, unsafe or unlawful conditions exist, Client conduct becomes abusive/threatening, or continuation becomes commercially/operationally impractical.</div></div>
                            <div className="ea-clause"><div className="ea-no">9.2.2</div><div>Before termination, {studioName} shall provide written notice and reasonable opportunity to cure the breach, unless the issue involves safety, abuse, threat, illegality, or non-payment beyond a reasonable period.</div></div>

                            <h3>9.3 Limitation of Liability</h3>
                            <div className="ea-clause"><div className="ea-no">9.3.1</div><div>{studioName}’s aggregate liability under this Agreement shall not exceed the amount actually received by {studioName} for the specific affected work item giving rise to the claim, except where liability cannot be excluded under applicable law.</div></div>
                            <div className="ea-clause"><div className="ea-no">9.3.2</div><div>{studioName} shall not be liable for indirect, incidental, consequential, punitive, remote, or special losses, including loss of rent, loss of business, mental distress, alternate accommodation costs, loss of opportunity, delay damages, third-party claims, or inconvenience, except where such exclusion is not permitted by law.</div></div>
                            <div className="ea-clause"><div className="ea-no">9.3.3</div><div>{studioName} shall not be liable for defects, delays, or losses arising from client-supplied materials, direct vendors, manufacturer products, building-source defects, society restrictions, concealed site conditions, third-party work, Client instructions, or post-handover modifications.</div></div>

                            <h3>9.4 Client Indemnity</h3>
                            <div className="ea-clause"><div className="ea-no">9.4.1</div><div>The Client shall indemnify and hold {studioName} harmless against claims, costs, losses, damages, penalties, and liabilities arising from incorrect Client information, unauthorised instructions, delayed payments, society violations, third-party interference, client-supplied materials, direct vendors, unlawful site conditions, or Client breach of this Agreement.</div></div>

                            <h3>9.5 Force Majeure</h3>
                            <div className="ea-clause"><div className="ea-no">9.5.1</div><div>Neither party shall be liable for delay or failure caused by events beyond reasonable control, including natural events, labour unrest, strikes, accidents, illness, epidemic, government action, transport disruption, material shortage, vendor disruption, civil disturbance, power/water failure, fire, flood, or building restrictions. Timelines shall extend by the period of disruption plus remobilisation time.</div></div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 9</span></div>
                        </section>

                        {/* Page 10 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Legal Terms and Acceptance</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <h2>9.6 Governing Law, Dispute Resolution and Jurisdiction</h2>
                            <div className="ea-clause"><div className="ea-no">9.6.1</div><div>This Agreement shall be governed by the laws of India.</div></div>
                            <div className="ea-clause"><div className="ea-no">9.6.2</div><div>In the event of any dispute, the parties shall first attempt amicable resolution for 15 working days from the date of written dispute notice.</div></div>
                            <div className="ea-clause"><div className="ea-no">9.6.3</div><div>If unresolved, the dispute shall be referred to arbitration by a sole arbitrator mutually appointed by the parties. The arbitration shall be conducted in accordance with the Arbitration and Conciliation Act, 1996, as amended. The seat and venue of arbitration shall be Thane, Maharashtra. The language of arbitration shall be English.</div></div>
                            <div className="ea-clause"><div className="ea-no">9.6.4</div><div>Subject to the arbitration clause and without prejudice to any non-excludable statutory remedies available under applicable law, courts at Thane/Mumbai, Maharashtra shall have jurisdiction.</div></div>

                            <h2>10. Notices, Digital Sign-Off and Acceptance</h2>

                            <h3>10.1 Notices</h3>
                            <div className="ea-clause"><div className="ea-no">10.1.1</div><div>Project notices, invoices, approvals, Change Requests, payment reminders, site communications, and dispute notices may be sent by email, WhatsApp, courier, hand delivery, or digital project platform to the contact details stated in this Agreement.</div></div>
                            <div className="ea-clause"><div className="ea-no">10.1.2</div><div>The Client shall promptly notify {studioName} of any change in contact details. Communications sent to the last provided email/mobile shall be treated as validly delivered unless bounced or returned.</div></div>

                            <h3>10.2 Digital Sign-Off and Electronic Records</h3>
                            <div className="ea-clause"><div className="ea-no">10.2.1</div><div>This Agreement may be accepted by physical signature, digital signature, electronic sign-off link, email confirmation, WhatsApp confirmation, payment against invoice, or commencement permission. Electronic records, timestamps, email records, IP logs, WhatsApp confirmations, and payment records may be used as evidence of acceptance.</div></div>
                            <div className="ea-clause"><div className="ea-no">10.2.2</div><div>If the Agreement is accepted digitally, {studioName} should retain the final PDF/HTML version, acceptance timestamp, Client email/mobile, sign-off log, invoice/payment record, and document version as part of the project record.</div></div>

                            <h3>10.3 Entire Agreement</h3>
                            <div className="ea-clause"><div className="ea-no">10.3.1</div><div>This Agreement, together with the final BOQ, approved drawings, payment schedule, annexures, and approved Change Requests, constitutes the entire understanding between the parties and supersedes all earlier proposals, quotations, discussions, estimates, presentations, and communications to the extent inconsistent with this Agreement.</div></div>
                            <div className="ea-clause"><div className="ea-no">10.3.2</div><div>No waiver, amendment, or relaxation shall be valid unless recorded in writing by {studioName}. A one-time goodwill gesture or exception shall not create a precedent or waiver of {studioName}’s contractual rights.</div></div>

                            <h2>Acceptance and Sign-Off</h2>
                            <p>The parties confirm that they have read, understood, and agreed to the terms of this Agreement and its annexures.</p>

                            <div className="ea-grid-2">
                                <div className="ea-box soft">
                                    <div className="ea-label">Place of Signing</div>
                                    <div className="ea-value"><span className="ea-placeholder">Mumbai / Thane / Other</span></div>
                                </div>
                                <div className="ea-box soft">
                                    <div className="ea-label">Date</div>
                                    <div className="ea-value"><span className="ea-placeholder">{dateStr}</span></div>
                                </div>
                            </div>

                            <div className="ea-sig-grid">
                                <div className="ea-sig-line">
                                    <div className="ea-label">Client Signature</div>
                                    <p>Name: <span className="ea-placeholder">{clientName}</span></p>
                                    <p>Email/Mobile: <span className="ea-placeholder">{clientEmail} / {clientPhone}</span></p>
                                    <p>Date: <span className="ea-placeholder">{dateStr}</span></p>
                                </div>
                                <div className="ea-sig-line">
                                    <div className="ea-label">For {studioName}</div>
                                    <p>Authorised Signatory: <span className="ea-placeholder">{repName}</span></p>
                                    <p>Designation: <span className="ea-placeholder">{orgData.signatoryTitle || 'Authorized Signatory'}</span></p>
                                    <p>Date: <span className="ea-placeholder">{dateStr}</span></p>
                                </div>
                            </div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 10</span></div>
                        </section>

                        {/* Page 11 */}
                        <section className="ea-page">
                            <header className="ea-header"><div><div className="ea-logo">{studioName}</div><div className="ea-tagline">Annexures</div></div><div className="ea-meta">Project ID: <span className="ea-placeholder">{projectId}</span></div></header>

                            <div className="ea-annex-title">Annexure A: Payment Schedule</div>
                            <table>
                                <thead>
                                    <tr><th>Invoice / Stage</th><th>Trigger</th><th>Amount</th><th>GST</th><th>Total</th><th>Due Date</th><th>Unlocks</th></tr>
                                </thead>
                                <tbody>
                                    {allAdvances ? allAdvances.map((m: any, i: number) => {
                                        const amount = m.amount || ((m.phase === 'execution' || m.phase === 'handover' ? executionTotal : designFee) * (m.percentage / 100));
                                        const gst = amount * 0.18;
                                        const total = amount + gst;
                                        return (
                                            <tr key={i}>
                                                <td>{m.label}</td>
                                                <td>{m.dueCondition}</td>
                                                <td>₹{formatCurrency(amount).replace('₹','')}</td>
                                                <td>₹{formatCurrency(gst).replace('₹','')}</td>
                                                <td>₹{formatCurrency(total).replace('₹','')}</td>
                                                <td><span className="ea-placeholder">Before Stage</span></td>
                                                <td><span className="ea-placeholder">{m.unlocks || m.label + ' progression'}</span></td>
                                            </tr>
                                        );
                                    }) : projectContext.paymentMilestones?.map((m: any, i) => {
                                        const amount = (m.type === 'execution' ? executionTotal : designFee) * (m.percentage / 100);
                                        const gst = amount * 0.18;
                                        const total = amount + gst;
                                        return (
                                            <tr key={i}>
                                                <td>{m.name}</td>
                                                <td>{m.description}</td>
                                                <td>₹{formatCurrency(amount).replace('₹','')}</td>
                                                <td>₹{formatCurrency(gst).replace('₹','')}</td>
                                                <td>₹{formatCurrency(total).replace('₹','')}</td>
                                                <td><span className="ea-placeholder">Before Stage</span></td>
                                                <td><span className="ea-placeholder">{m.name} progression</span></td>
                                            </tr>
                                        );
                                    }) || (
                                        <>
                                            <tr><td>Execution Advance 1</td><td>Start / Mobilisation</td><td>₹</td><td>₹</td><td>₹</td><td><span className="ea-placeholder">Date</span></td><td>Mobilisation, procurement planning, site preparation</td></tr>
                                            <tr><td>Execution Advance 2</td><td>Structural / Procurement</td><td>₹</td><td>₹</td><td>₹</td><td><span className="ea-placeholder">Date</span></td><td>Carpentry/civil/procurement stage</td></tr>
                                            <tr><td>Execution Advance 3</td><td>Finishing</td><td>₹</td><td>₹</td><td>₹</td><td><span className="ea-placeholder">Date</span></td><td>Finishing, installation, painting, final works</td></tr>
                                            <tr><td>Final Advance</td><td>Substantial Completion / Handover Readiness</td><td>₹</td><td>₹</td><td>₹</td><td><span className="ea-placeholder">Date</span></td><td>Handover dossier, warranty certificate, final release</td></tr>
                                        </>
                                    )}
                                </tbody>
                            </table>

                            <div className="ea-annex-title">Annexure B: Revision and Change Request Charges</div>
                            <table>
                                <thead>
                                    <tr><th>Item</th><th>Included</th><th>Charge Beyond Included Scope</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td>Design Options / Revisions</td><td>Up to 2 per room / area, unless otherwise agreed</td><td>₹ <span className="ea-placeholder">Rate</span> per revision / room / drawing</td></tr>
                                    <tr><td>Site Revisit for Client Change</td><td>As per agreed schedule</td><td>₹ <span className="ea-placeholder">Rate</span> per visit</td></tr>
                                    <tr><td>Rework After Approval</td><td>Not included</td><td>Actual cost + labour + material + vendor charges + coordination fee</td></tr>
                                    <tr><td>Additional Drawings</td><td>As per design scope</td><td>₹ <span className="ea-placeholder">Rate</span> per drawing / package</td></tr>
                                </tbody>
                            </table>

                            <div className="ea-annex-title">Annexure C: As-Actuals and Client-Procured Items</div>
                            <table>
                                <thead>
                                    <tr><th>Category</th><th>Procurement By</th><th>Payment By</th><th>{studioName} Responsibility</th><th>Notes</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td>Lights / Fans / Switches</td><td><span className="ea-placeholder">Client / {studioName} / Vendor</span></td><td><span className="ea-placeholder">Client / {studioName}</span></td><td>Design coordination and installation only if included</td><td>Product warranty by manufacturer</td></tr>
                                    <tr><td>Sanitaryware / CP Fittings</td><td><span className="ea-placeholder">Client / {studioName} / Vendor</span></td><td><span className="ea-placeholder">Client / {studioName}</span></td><td>Coordination only unless BOQ includes supply</td><td>Vendor delay extends timeline</td></tr>
                                    <tr><td>Tiles / Stone / Countertop</td><td><span className="ea-placeholder">Client / {studioName} / Vendor</span></td><td><span className="ea-placeholder">Client / {studioName}</span></td><td>Selection support and integration</td><td>Batch variation applies</td></tr>
                                    <tr><td>Appliances</td><td>Client</td><td>Client</td><td>Design provision only unless otherwise stated</td><td>Installation by brand/vendor unless included</td></tr>
                                    <tr><td>Loose Furniture / Decor</td><td><span className="ea-placeholder">Client / {studioName}</span></td><td><span className="ea-placeholder">Client / {studioName}</span></td><td>As per BOQ</td><td>Delivery damage/warranty by vendor unless supplied by {studioName}</td></tr>
                                </tbody>
                            </table>

                            <div className="ea-annex-title">Annexure D: Scope Exclusion Checklist</div>
                            <table>
                                <thead>
                                    <tr><th className="ea-num">No.</th><th>Item</th><th>Included?</th><th>Remarks</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td className="ea-num">1</td><td>Society permissions, deposits, lift charges and penalties</td><td>No, unless stated</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">2</td><td>Major civil, waterproofing, structural, window/façade work</td><td>No, unless stated</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">3</td><td>Appliances, AC, geysers, exhaust, white goods</td><td>No, unless stated</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">4</td><td>Loose furniture, mattresses, curtains, decor, art</td><td>No, unless stated</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">5</td><td>Repairs due to seepage, leakage, termite, voltage or building defects</td><td>No</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">6</td><td>Rework due to client preference after approval</td><td>No</td><td>Chargeable Change Request</td></tr>
                                </tbody>
                            </table>

                            <div className="ea-annex-title">Annexure E: Execution Start Readiness Checklist</div>
                            <p className="ea-small">This annexure is to be completed before site mobilisation. It records pre-execution dependencies so that delays caused by missing approvals, access, selections, permissions, or client-supplied items are clearly attributable.</p>
                            <table>
                                <thead>
                                    <tr><th className="ea-num">No.</th><th>Readiness Item</th><th>Status</th><th>Responsibility</th><th>Target / Remarks</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td className="ea-num">1</td><td>Site handover date confirmed</td><td><span className="ea-placeholder">Pending / Done</span></td><td>Client / {studioName}</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">2</td><td>Society permissions, work timings, lift rules, deposits and access protocols confirmed</td><td><span className="ea-placeholder">Pending / Done</span></td><td>Client</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">3</td><td>Keys, access cards, parking/loading access, power and water availability confirmed</td><td><span className="ea-placeholder">Pending / Done</span></td><td>Client</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">4</td><td>Approved BOQ, scope exclusions and payment schedule signed off</td><td><span className="ea-placeholder">Pending / Done</span></td><td>Client / {studioName}</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">5</td><td>Initial execution advance received and cleared</td><td><span className="ea-placeholder">Pending / Done</span></td><td>Client</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">6</td><td>GFC drawings / execution drawings issued for relevant starting works</td><td><span className="ea-placeholder">Pending / Done</span></td><td>{studioName}</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">7</td><td>Critical material selections and finish approvals locked for starting works</td><td><span className="ea-placeholder">Pending / Done</span></td><td>Client / {studioName}</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">8</td><td>Client-procured / as-actual items required for starting works identified</td><td><span className="ea-placeholder">Pending / Done</span></td><td>Client / {studioName}</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">9</td><td>Existing site conditions, concealed-risk areas and dependencies recorded, wherever visible</td><td><span className="ea-placeholder">Pending / Done</span></td><td>{studioName} / Client</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                    <tr><td className="ea-num">10</td><td>Authorised client representatives and official communication channel confirmed</td><td><span className="ea-placeholder">Pending / Done</span></td><td>Client / {studioName}</td><td><span className="ea-placeholder">Remarks</span></td></tr>
                                </tbody>
                            </table>

                            <div className="ea-annex-title mt-6">Annexure F: Final Approved BOQ & Technical Specifications</div>
                            <p className="ea-small mb-3">The execution shall strictly follow the approved Bill of Quantities (BOQ) version listed below. Any variations must be documented as Change Requests.</p>
                            
                            {Object.entries(groupedBoq).map(([room, items]) => (
                                <div key={`boq-${room}`} className="ea-avoid-break mb-6">
                                    <h4 className="ea-label" style={{ background: '#f7f7fa', padding: '6px', borderBottom: '2px solid #28216f' }}>{room}</h4>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th className="ea-num">No.</th>
                                                <th>Category</th>
                                                <th>Description & Specifications</th>
                                                <th className="ea-num">Qty</th>
                                                <th className="ea-num">Unit</th>
                                                <th className="ea-right">Rate</th>
                                                <th className="ea-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((item: any, index: number) => {
                                                const rate = item.unitCost !== undefined ? item.unitCost : calculateSellPrice(item.materials, item.labor, item.margin);
                                                const amount = item.finalCost !== undefined ? item.finalCost : rate * item.qty;
                                                const currentSpec = projectContext.contractContent?.boqItemSpecOverrides?.[item.id] !== undefined 
                                                    ? projectContext.contractContent.boqItemSpecOverrides[item.id] 
                                                    : (item.internalSpecs || item.specs || item.commercialNote || '');
                                                return (
                                                    <tr key={item.id}>
                                                        <td className="ea-num">{index + 1}</td>
                                                        <td style={{fontSize: '9.5px', fontWeight: 'bold'}}>{item.cat || item.category || '-'}</td>
                                                        <td>
                                                            <strong>{item.name || item.description || 'Item'}</strong>
                                                            {currentSpec && <div className="ea-small" style={{marginTop: '4px'}}>{currentSpec}</div>}
                                                        </td>
                                                        <td className="ea-num">{item.qty}</td>
                                                        <td className="ea-num" style={{fontSize: '9px'}}>{item.unit}</td>
                                                        <td className="ea-right">{formatCurrency(rate).replace('₹','')}</td>
                                                        <td className="ea-right" style={{fontWeight: 'bold'}}>{formatCurrency(amount).replace('₹','')}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                            
                            <div className="ea-box ea-avoid-break mt-6" style={{ background: '#f1f0fb', borderLeft: '4px solid #28216f', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>Total Execution Value</div>
                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#28216f' }}>₹{formatCurrency(executionTotal).replace('₹','')}</div>
                            </div>

                            <div className="ea-box warn ea-avoid-break mt-6">
                                <strong>Close-Out Records:</strong> Handover checklists, snag lists, warranty claims, and closure records shall be prepared separately at substantial completion / handover stage. They are not pre-filled annexures to this Agreement because they arise only after execution has progressed.
                            </div>

                            <div className="ea-footer"><span>{studioName} Integrated Execution Agreement</span><span>Page 11</span></div>
                        </section>

                    </div>
                </div>
            </div>
            
            {/* Sign-off & Execution Protocol */}
            <div className="mt-8 pt-8 border-t-4 border-indigo-950 break-inside-avoid">
                <h3 className="text-lg font-bold text-indigo-950 uppercase tracking-wide mb-6 font-opensans">
                    Acceptance & Sign-off
                </h3>
                
                <ExecutionAgreementSignoffBlock 
                    clientName={clientName} 
                    location={projectContext.location || 'Site'} 
                    projectId={projectId} 
                    setProjectContext={setProjectContext} 
                    projectContext={projectContext} 
                    grandTotal={grandTotal} 
                    tenantId={tenantId}
                />
            </div>
        </div>
    );
}

const ExecutionAgreementSignoffBlock: React.FC<{ clientName: string, location: string, projectId: string, setProjectContext: any, projectContext: ProjectContext, grandTotal: number, tenantId?: string }> = ({ clientName, location, projectId, setProjectContext, projectContext, grandTotal, tenantId }) => {
    const { orgData } = useOrg();
    const [isSending, setIsSending] = useState(false);
    const [showSendConfirm, setShowSendConfirm] = useState(false);
    const [showMarkManual, setShowMarkManual] = useState(false);
    const [manualRef, setManualRef] = useState("Digital Confirmation");
    const [localError, setLocalError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const currentSignoff = (projectContext as any).executionSignoff;
    const status = currentSignoff?.status || 'pending';

    const getSignoffUrl = (token: string) => {
        let appDomain = import.meta.env.VITE_APP_DOMAIN || window.location.origin;
        if (appDomain.includes('ais-dev-')) {
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        return `${appDomain}/?agreementSignoff=${token}`;
    };

    const sendEmailSignoff = async () => {
        setLocalError(null);
        if (!projectContext.clientEmail || !projectContext.clientEmail.trim()) {
            setLocalError("Client email is required to send the digital agreement. Please enter a valid email address in the input field below.");
            return;
        }

        setIsSending(true);
        try {
            await new Promise(r => setTimeout(r, 100));
            // We use the wrapper container for html2pdf
            const element = document.querySelector('.execution-agreement-container');
            let pdfBase64;
            if (element) {
                try {
                    const html2pdfModule = await import('html2pdf.js');
                    const html2pdfObj = ((html2pdfModule as any).default || html2pdfModule) as any;
                    if (typeof html2pdfObj !== 'function') throw new Error("html2pdf library loaded incorrectly");
                    
                    const opt = {
                        margin: [0, 0, 0, 0],
                        filename: 'Execution_Agreement.pdf',
                        image: { type: 'jpeg' as const, quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true, logging: false },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
                    };
                    pdfBase64 = await html2pdfObj().set(opt).from(element).outputPdf('datauristring');
                } catch (pdfErr) {
                    console.error("PDF generation failed, falling back without attachment", pdfErr);
                }
            }

            const result = await sendAgreementSignoffRequest(projectId || '', projectContext, grandTotal, pdfBase64, tenantId || orgData?.tenantId || 'demo-tenant-01');
            
            if (!result.success) {
                setLocalError(`Error sending email (domain not verified?): ${result.error}`);
                return;
            }

            const newSignoff = {
                status: 'sent',
                token: result.token,
                sentAt: new Date().toISOString()
            };

            setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
            setShowSendConfirm(false);
        } catch (err: any) {
            setLocalError(`System error: ${err.message}`);
        } finally {
            setIsSending(false);
        }
    };

    const handleMarkExecuted = () => {
        setLocalError(null);
        if (!manualRef.trim()) {
            setLocalError("Please enter an approval reference.");
            return;
        }
        const newSignoff = {
            status: 'signed',
            clientName: 'Manual Ops Entry',
            ipAddress: 'Internal',
            refId: manualRef,
            signedAt: new Date().toISOString()
        };
        setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
        setShowMarkManual(false);
    };

    const handleReset = () => {
        setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: { status: 'pending' } }));
    };

    const handleCopy = (txt: string) => {
        navigator.clipboard.writeText(txt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // View: EXECUTED (Stamped)
    if (status === 'signed') {
        const timestamp = currentSignoff?.signedAt ? new Date(currentSignoff.signedAt).toLocaleString() : 'N/A';
        const refIdText = currentSignoff?.refId || `Token: ${currentSignoff?.token?.slice(-6) || 'Manual'}`;

        return (
            <div className="mt-4 relative group break-inside-avoid">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur opacity-10 group-hover:opacity-20 transition duration-500"></div>
                <div className="relative bg-white border-2 border-emerald-500/30 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between overflow-hidden gap-4">
                    <div className="absolute -right-4 -bottom-4 text-emerald-50 opacity-20 pointer-events-none">
                        <CheckBadgeIcon className="w-32 h-32" />
                    </div>
                    <div className="flex-1 z-10 w-full sm:w-auto">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-emerald-100 text-emerald-700 p-1 rounded-full"><CheckBadgeIcon className="w-5 h-5"/></span>
                            <h4 className="text-lg font-black text-emerald-800 uppercase tracking-widest">Digitally Executed</h4>
                        </div>
                        <p className="text-sm text-slate-600 font-medium">
                            Authorized by <span className="font-bold text-indigo-950">{currentSignoff?.clientName || clientName}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1 font-mono">Ref: {refIdText} • {timestamp}</p>
                        {currentSignoff?.ipAddress && currentSignoff?.ipAddress !== 'Internal' && (
                            <p className="text-[10px] text-slate-400 font-mono mt-1">IP: {currentSignoff.ipAddress}</p>
                        )}
                        <div className="mt-3">
                            <button onClick={handleReset} className="text-xs text-slate-400 font-bold hover:text-slate-600 underline cursor-pointer">Reset to Pending (Admin)</button>
                        </div>
                    </div>
                    <div className="text-right z-10 shrink-0">
                        <div className="border-2 border-emerald-600 text-emerald-700 px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest rotate-[-12deg] opacity-80 inline-block bg-white">
                            {currentSignoff?.ipAddress === 'Internal' ? 'Studio Verified' : 'Client Signed'}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // View: SENT
    if (status === 'sent') {
        const sentTimestamp = currentSignoff?.sentAt ? new Date(currentSignoff.sentAt).toLocaleString() : 'N/A';
        const link = currentSignoff?.token ? getSignoffUrl(currentSignoff.token) : '';

        return (
            <div className="mt-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl p-6 relative break-inside-avoid">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex-grow w-full md:w-auto">
                         <h4 className="text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                             Awaiting Client Signature
                         </h4>
                         <p className="text-xs max-w-xl">
                             Digital agreement active at {sentTimestamp}. Sent to <strong>{projectContext.clientEmail || 'Client'}</strong>.
                         </p>

                         {link && (
                             <div className="mt-4 p-4 bg-white rounded-lg border border-amber-200 shadow-sm">
                                 <div className="flex items-center justify-between mb-2 pb-2 border-b border-amber-100">
                                     <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Digital Sign-Off URL</span>
                                     <button 
                                         onClick={() => handleCopy(link)}
                                         className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold rounded transition-all flex items-center gap-1 cursor-pointer"
                                     >
                                         {copied ? "Copied!" : "Copy Link"}
                                     </button>
                                 </div>
                                 <div className="text-[11px] font-mono break-all text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                                     {link}
                                 </div>
                                 <div className="mt-3 flex gap-2">
                                     <a 
                                         href={link} 
                                         target="_blank" 
                                         rel="noopener noreferrer" 
                                         className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold tracking-tight inline-flex items-center gap-1 shadow-sm cursor-pointer"
                                     >
                                         Open Sign-Off Screen &rarr;
                                     </a>
                                 </div>
                             </div>
                         )}

                         <div className="flex items-center gap-2 mt-4 text-xs font-bold">
                             <button onClick={() => setShowSendConfirm(true)} disabled={isSending} className="underline text-amber-700 hover:text-amber-900 cursor-pointer">
                                 {isSending ? 'Sending...' : 'Resend Email'}
                             </button>
                             <span className="text-amber-300">|</span>
                             <button onClick={handleReset} className="underline text-amber-700 hover:text-amber-900 cursor-pointer">Cancel Request</button>
                         </div>
                         {showSendConfirm && (
                             <div className="mt-4 p-4 border border-amber-300 bg-amber-100 rounded flex flex-col gap-2">
                                 <p className="text-xs font-bold">Confirm Resend Execution Agreement?</p>
                                 <div className="flex items-center gap-2">
                                     <button onClick={sendEmailSignoff} className="px-3 py-1 bg-amber-600 text-white rounded text-xs cursor-pointer">Yes, Resend</button>
                                     <button onClick={() => setShowSendConfirm(false)} className="px-3 py-1 bg-transparent border border-amber-600 text-amber-700 rounded text-xs cursor-pointer">Cancel</button>
                                 </div>
                             </div>
                         )}
                         {localError && <p className="text-red-600 text-xs mt-2">{localError}</p>}
                    </div>
                    <div className="no-print shrink-0 border-l border-amber-200 pl-6 space-y-2 w-full md:w-auto">
                        <button 
                            onClick={() => setShowMarkManual(!showMarkManual)}
                            className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-800 text-[10px] font-bold rounded-lg shadow-sm hover:bg-amber-100 transition-all uppercase tracking-widest cursor-pointer"
                        >
                            Override: Mark Executed
                        </button>
                        {showMarkManual && (
                             <div className="mt-2 p-3 border border-amber-300 bg-amber-100 rounded flex flex-col gap-2">
                                 <input type="text" value={manualRef} onChange={e => setManualRef(e.target.value)} className="text-xs p-1 border rounded w-full" placeholder="Reference (e.g. WhatsApp)" />
                                 <div className="flex items-center gap-2">
                                     <button onClick={handleMarkExecuted} className="px-3 py-1 bg-amber-700 text-white rounded text-xs cursor-pointer">Confirm Override</button>
                                     <button onClick={() => setShowMarkManual(false)} className="px-3 py-1 bg-transparent border border-amber-700 text-amber-800 rounded text-xs cursor-pointer">Cancel</button>
                                 </div>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // View: PENDING (Instructions)
    return (
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-6 relative break-inside-avoid">
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                <div className="flex-grow">
                    <h4 className="text-sm font-bold text-indigo-950 uppercase tracking-widest mb-2 flex items-center gap-2">
                        Execution Protocol
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-xl mb-4">
                        <strong>No physical signature required.</strong> To execute this agreement, click "Send agreement" to securely email the digital sign-off link to the client.
                    </p>

                    <div className="mt-4 mb-5 p-4 border rounded-xl bg-indigo-50/50 border-indigo-150 max-w-xl">
                        <label className="block text-[11px] font-bold text-indigo-950 uppercase tracking-wider mb-1.5">
                            Client Email Address Setup
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input 
                                type="email" 
                                value={projectContext.clientEmail || ''} 
                                onChange={e => {
                                    const emailVal = e.target.value;
                                    setProjectContext?.((prev: any) => ({ ...prev, clientEmail: emailVal }));
                                }} 
                                className="flex-grow text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm" 
                                placeholder="Enter client's email address (e.g. client@example.com)" 
                            />
                            {projectContext.clientEmail && projectContext.clientEmail.includes('@') ? (
                                <span className="bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-bold tracking-tight rounded-md px-3 py-2 flex items-center justify-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                    Configured
                                </span>
                            ) : (
                                <span className="bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold tracking-tight rounded-md px-3 py-2 flex items-center justify-center gap-1">
                                    &#9888; Email Missing
                                </span>
                            )}
                        </div>
                        {!projectContext.clientEmail && (
                            <p className="text-[10px] text-red-600 font-semibold mt-2">
                                * An email address is required to dispatch the execution link. Please enter it above.
                            </p>
                        )}
                    </div>
                    {localError && (
                        <div className="text-red-600 text-xs mb-4 p-3.5 bg-red-50 rounded-lg border border-red-200/60 leading-relaxed">
                            <div className="font-bold mb-1">Email Transfer Interrupted:</div>
                            <p className="text-slate-600 text-[11px] mb-2">
                                {localError}
                            </p>
                            <div className="pt-2.5 border-t border-red-200/50 flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="font-bold text-red-800 text-[10px] uppercase tracking-wider block">Sandbox Controls:</span>
                                <button 
                                    onClick={async () => {
                                        setLocalError(null);
                                        setIsSending(true);
                                        try {
                                            const randomPart = Math.random().toString(36).substring(2, 15);
                                            const token = `EXEC_AGREEMENT_${projectId}_${randomPart}`;
                                            const newSignoff = {
                                                status: 'sent',
                                                token: token,
                                                sentAt: new Date().toISOString()
                                            };
                                            setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
                                        } catch (e: any) {
                                            setLocalError(e.message);
                                        } finally {
                                            setIsSending(false);
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md text-[10px] shadow-sm uppercase tracking-wider cursor-pointer inline-block text-center"
                                >
                                    Force Generate Digital Sign-Off Link (Sandbox Bypass)
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Admin Control - Hidden in Print */}
                <div className="no-print shrink-0 flex flex-col gap-2 min-w-[200px]">
                    {!showSendConfirm ? (
                        <button 
                            onClick={() => setShowSendConfirm(true)}
                            disabled={isSending}
                            className="flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition-all w-full"
                        >
                            <ShieldCheckIcon className="w-4 h-4" /> {isSending ? 'Sending...' : 'Send to Client'}
                        </button>
                    ) : (
                        <div className="p-3 border border-indigo-200 bg-indigo-50 rounded-lg flex flex-col gap-2">
                            <p className="text-xs font-bold text-indigo-900">Send Agreement via Email?</p>
                            <div className="flex items-center gap-2">
                                <button onClick={sendEmailSignoff} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-xs flex-1">Confirm</button>
                                <button onClick={() => setShowSendConfirm(false)} className="px-3 py-1 bg-white border border-indigo-200 text-indigo-700 font-bold rounded text-xs flex-1">Cancel</button>
                            </div>
                        </div>
                    )}
                    
                    {!showMarkManual ? (
                        <button 
                            onClick={() => setShowMarkManual(true)}
                            className="flex justify-center items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-[10px] uppercase tracking-widest font-bold rounded-lg hover:bg-slate-50 transition-all w-full"
                        >
                            Mark Manually
                        </button>
                    ) : (
                        <div className="p-3 border border-slate-200 bg-white shadow-sm rounded-lg flex flex-col gap-2 mt-2">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Manual Approval Reference</p>
                            <input type="text" value={manualRef} onChange={e => setManualRef(e.target.value)} className="text-xs p-2 border border-slate-200 rounded w-full outline-none focus:border-slate-400" placeholder="e.g. Email from Client" />
                            <div className="flex items-center gap-2">
                                <button onClick={handleMarkExecuted} className="px-3 py-2 bg-indigo-900 hover:bg-indigo-950 text-white font-bold rounded text-xs flex-1">Mark Executed</button>
                                <button onClick={() => setShowMarkManual(false)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded text-xs flex-1">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Print Fallback Visual Lines */}
            <div className="mt-8 pt-6 border-t border-slate-200/60 grid grid-cols-2 gap-12 opacity-40 grayscale print:opacity-60">
                <div>
                    <div className="h-8 border-b border-slate-300 mb-1"></div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Client Authorization</p>
                </div>
                <div>
                    <div className="h-8 border-b border-slate-300 mb-1"></div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Studio Representative</p>
                </div>
            </div>
        </div>
    );
}
