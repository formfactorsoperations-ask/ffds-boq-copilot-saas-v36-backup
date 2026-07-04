import React from 'react';
import { ProjectContext } from '../../types';
import { Download, Rocket, Edit3 } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';

interface OnboardingKitPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function OnboardingKitPage({ projectContext }: OnboardingKitPageProps) {
    const { orgData } = useOrg();
    
    const studioName = orgData?.orgName || 'Form Factors Design Studio';
    const clientName = projectContext.clientName || 'Valued Client';
    const projectName = projectContext.name || 'Untitled Project';
    const area = projectContext.area || 0;
    const location = projectContext.location || 'Unknown Location';
    
    const displayDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    
    const designFee = projectContext.engagement?.designFee || projectContext.financials?.approvedDesignValue || 0;
    const executionValue = projectContext.engagement?.executionValue || projectContext.financials?.approvedExecutionValue || 0;
    const d1Amount = Math.round(designFee * 0.25);
    
    const docketRef = projectContext.engagement?.docketRef || `FFDS-OK-${new Date().getFullYear()}-702`;

    const handleDownloadPdf = () => {
        const el = document.getElementById('onboarding-kit-render');
        if (!el) return;

        import('html2pdf.js').then((module) => {
            const html2pdf = module as any;
            let html2pdfObj = html2pdf;
            if (typeof html2pdf === 'function') {
                html2pdfObj = html2pdf;
            } else if (html2pdf && typeof html2pdf.default === 'function') {
                html2pdfObj = html2pdf.default;
            } else if (html2pdf.default && typeof html2pdf.default.default === 'function') {
                html2pdfObj = html2pdf.default.default;
            }

            const opt = {
                margin: 0,
                filename: `Onboarding_Kit_${projectName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            setTimeout(() => {
                html2pdfObj().set(opt).from(el).save();
            }, 300);
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <div className="flex-none p-6 border-b border-slate-200 bg-white flex justify-between items-center z-10 sticky top-0 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Rocket className="w-6 h-6 text-indigo-600" />
                        Onboarding Kit
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Generate formal onboarding documentation setting the rules of engagement.</p>
                </div>
                <div className="flex items-center gap-3">
                                        <button
                        onClick={() => {
                            const el = document.getElementById('onboarding-kit-content');
                            if (!el) return;
                            const isEditable = el.contentEditable === 'true';
                            el.contentEditable = isEditable ? 'false' : 'true';
                            
                            // Visual feedback
                            const btn = document.getElementById('edit-doc-btn');
                            if (btn) {
                                if (!isEditable) {
                                    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M20 6L9 17l-5-5"></path></svg> Done Editing';
                                    btn.classList.replace('bg-white', 'bg-indigo-600');
                                    btn.classList.replace('text-slate-700', 'text-white');
                                    el.classList.add('outline-dashed', 'outline-2', 'outline-indigo-400', 'p-4', 'rounded-lg', 'bg-indigo-50/10');
                                } else {
                                    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg> Edit Document';
                                    btn.classList.replace('bg-indigo-600', 'bg-white');
                                    btn.classList.replace('text-white', 'text-slate-700');
                                    el.classList.remove('outline-dashed', 'outline-2', 'outline-indigo-400', 'p-4', 'rounded-lg', 'bg-indigo-50/10');
                                }
                            }
                        }}
                        id="edit-doc-btn"
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition-colors"
                    >
                        <Edit3 className="w-4 h-4" />
                        Edit Document
                    </button>
                    <button
                        onClick={handleDownloadPdf}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded hover:bg-slate-700 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Download PDF
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center pb-24">
                <div id="onboarding-kit-render" className="w-full">
                    <StudioDocumentShell orgData={orgData} docHeaderType="Onboarding Kit" docHeaderTitle={projectName}>
                        <div id="onboarding-kit-content" className="space-y-8 text-sm text-[#0F172A] transition-all" style={{ fontFamily: 'var(--font-sans)' }}>
                            
                            <div>
                                <h3 className="text-xl font-bold mb-2">Welcome, {clientName}.</h3>
                                <p className="text-slate-600">Your project is now reserved in our studio. This kit tells you exactly what happens next, what we need from you, how we'll work together — and how to complete your Sign-up & Concept payment, which sets everything in motion. Keep it handy; it answers most questions before they come up.</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 border border-slate-200 rounded-lg">
                                <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Project</div>
                                    <div className="font-semibold leading-tight">{projectName} <br/><span className="text-xs font-normal text-slate-500">{area} sq ft · {location}</span></div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Agreement Ref.</div>
                                    <div className="font-semibold">{docketRef}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Payment Requested</div>
                                    <div className="font-semibold leading-tight">D1 · Sign-up & Concept <br/><span className="text-xs font-normal text-slate-500">details in Section E</span></div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Target Handover</div>
                                    <div className="font-semibold leading-tight">TBD <br/><span className="text-xs font-normal text-slate-500">indicative, per proposal</span></div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">A. Your Project Team</h4>
                                <table className="w-full text-left text-[11px] border-collapse border border-slate-200">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="py-2 px-3">Role</th>
                                            <th className="py-2 px-3">Name</th>
                                            <th className="py-2 px-3">Responsible For</th>
                                            <th className="py-2 px-3 text-right">Reach Via</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">Principal Architect</td>
                                            <td className="py-2 px-3">{studioName}</td>
                                            <td className="py-2 px-3">Design direction, final approvals, escalations</td>
                                            <td className="py-2 px-3 text-right">Project WhatsApp group</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">Project Designer</td>
                                            <td className="py-2 px-3">Assigned at kickoff</td>
                                            <td className="py-2 px-3">Drawings, presentations, day-to-day design queries</td>
                                            <td className="py-2 px-3 text-right">Project WhatsApp group</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-3 font-semibold">Site Supervisor</td>
                                            <td className="py-2 px-3">Assigned before execution</td>
                                            <td className="py-2 px-3">Site coordination, vendor scheduling, quality checks</td>
                                            <td className="py-2 px-3 text-right">Project WhatsApp group</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <p className="text-[11px] text-slate-500 mt-2">One project, one WhatsApp group. Please avoid individual side-messages — decisions made outside the group cannot be tracked or honoured.</p>
                                
                                <div className="grid grid-cols-2 gap-4 mt-4 bg-slate-50 p-4 border border-slate-200 rounded-lg">
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Design Team Hours</div>
                                        <div className="font-semibold leading-tight">Tues–Sat, 10:30 AM – 6:30 PM <br/><span className="text-[10px] font-normal text-slate-500">messages outside hours answered next working day</span></div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Site Execution Hours</div>
                                        <div className="font-semibold leading-tight">10 AM – 6 PM <br/><span className="text-[10px] font-normal text-slate-500">per society fit-out rules</span></div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">B. Your Design Journey — Six Phases</h4>
                                <div className="space-y-4">
                                    <div className="flex gap-4 p-4 border border-slate-200 rounded-lg items-start">
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-sm shrink-0">1</div>
                                        <div>
                                            <div className="font-bold">Kickoff & Brief Freeze <span className="text-xs font-normal text-slate-500 ml-2">Week 1</span></div>
                                            <p className="text-sm text-slate-600 mt-1">We sit together, walk through your lifestyle, storage needs, and inspirations, and freeze the design brief in writing.</p>
                                            <p className="text-xs font-semibold text-indigo-700 mt-2">Your part: both decision-makers attend; bring the checklist in Section C.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 p-4 border border-slate-200 rounded-lg items-start">
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-sm shrink-0">2</div>
                                        <div>
                                            <div className="font-bold">Site Measurement & Survey <span className="text-xs font-normal text-slate-500 ml-2">Week 1–2</span></div>
                                            <p className="text-sm text-slate-600 mt-1">Our team measures the apartment, photographs every wall, and verifies electrical and plumbing positions against the builder plan.</p>
                                            <p className="text-xs font-semibold text-indigo-700 mt-2">Your part: arrange flat access and society entry permissions for our team.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 p-4 border border-slate-200 rounded-lg items-start">
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-sm shrink-0">3</div>
                                        <div>
                                            <div className="font-bold">Concept & Space Planning <span className="text-xs font-normal text-slate-500 ml-2">Week 2–4</span></div>
                                            <p className="text-sm text-slate-600 mt-1">Furniture layouts, zoning options, and the design direction — presented and refined with you until the layout is locked.</p>
                                            <p className="text-xs font-semibold text-indigo-700 mt-2">Your part: consolidated feedback as one list per review (see Section D, Rule 1).</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 p-4 border border-slate-200 rounded-lg items-start">
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-sm shrink-0">4</div>
                                        <div>
                                            <div className="font-bold">Design Development & 3D <span className="text-xs font-normal text-slate-500 ml-2">Week 4–8</span></div>
                                            <p className="text-sm text-slate-600 mt-1">Detailed designs and 3D visuals room by room, with materials, finishes, and lighting resolved. Unlocks the D2 milestone.</p>
                                            <p className="text-xs font-semibold text-indigo-700 mt-2">Your part: material & finish selections, recorded on your Client Portal.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 p-4 border border-slate-200 rounded-lg items-start">
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-sm shrink-0">5</div>
                                        <div>
                                            <div className="font-bold">Technical Drawings & BOQ Lock <span className="text-xs font-normal text-slate-500 ml-2">Week 8–11</span></div>
                                            <p className="text-sm text-slate-600 mt-1">Good-for-Construction drawings and the final Bill of Quantities. When every drawing is approved, the design phase formally closes — this is the Design Complete milestone, and it unlocks D3.</p>
                                            <p className="text-xs font-semibold text-indigo-700 mt-2">Your part: final drawing approvals on the portal — these are your sign-offs.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 p-4 border border-slate-200 rounded-lg items-start">
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-sm shrink-0">6</div>
                                        <div>
                                            <div className="font-bold">Execution & Handover <span className="text-xs font-normal text-slate-500 ml-2">~12–14 weeks on site</span></div>
                                            <p className="text-sm text-slate-600 mt-1">Material orders, site work, installation, and finishing — through to your final walkthrough, Handover Docket, and Warranty Certificate.</p>
                                            <p className="text-xs font-semibold text-indigo-700 mt-2">Your part: E1 clears before any vendor order is placed; site decisions via the group.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">C. What We Need From You — Before Kickoff</h4>
                                <ul className="space-y-3">
                                    <li className="flex gap-3 items-start p-3 border border-slate-200 rounded-lg">
                                        <div className="w-4 h-4 border border-slate-400 rounded-sm mt-0.5 shrink-0"></div>
                                        <div><strong className="block text-slate-800">Builder floor plan</strong><span className="text-slate-600 text-xs">The dimensioned plan from your agreement or possession kit — a photo is fine to start.</span></div>
                                    </li>
                                    <li className="flex gap-3 items-start p-3 border border-slate-200 rounded-lg">
                                        <div className="w-4 h-4 border border-slate-400 rounded-sm mt-0.5 shrink-0"></div>
                                        <div><strong className="block text-slate-800">Society fit-out rules & NOC requirements</strong><span className="text-slate-600 text-xs">Working hours, debris rules, interior permission forms — from your society office.</span></div>
                                    </li>
                                    <li className="flex gap-3 items-start p-3 border border-slate-200 rounded-lg">
                                        <div className="w-4 h-4 border border-slate-400 rounded-sm mt-0.5 shrink-0"></div>
                                        <div><strong className="block text-slate-800">Possession status & key access</strong><span className="text-slate-600 text-xs">Confirm when we can access the flat for measurement and, later, for site work.</span></div>
                                    </li>
                                    <li className="flex gap-3 items-start p-3 border border-slate-200 rounded-lg">
                                        <div className="w-4 h-4 border border-slate-400 rounded-sm mt-0.5 shrink-0"></div>
                                        <div><strong className="block text-slate-800">Inspiration images</strong><span className="text-slate-600 text-xs">10–20 saved images (Pinterest, Instagram, anywhere) — what you like matters more than why.</span></div>
                                    </li>
                                    <li className="flex gap-3 items-start p-3 border border-slate-200 rounded-lg">
                                        <div className="w-4 h-4 border border-slate-400 rounded-sm mt-0.5 shrink-0"></div>
                                        <div><strong className="block text-slate-800">Appliance list for the kitchen</strong><span className="text-slate-600 text-xs">Hob, chimney, refrigerator, dishwasher, water purifier — brands and sizes if already decided.</span></div>
                                    </li>
                                    <li className="flex gap-3 items-start p-3 border border-slate-200 rounded-lg">
                                        <div className="w-4 h-4 border border-slate-400 rounded-sm mt-0.5 shrink-0"></div>
                                        <div><strong className="block text-slate-800">Named decision-makers</strong><span className="text-slate-600 text-xs">Who gives final approvals? Design moves fastest when this is settled on day one.</span></div>
                                    </li>
                                </ul>
                            </div>
                            
                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">D. How We Work Together — Four Ground Rules</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 border border-slate-200 rounded-lg">
                                        <div className="text-xs font-bold text-slate-400 mb-1">R1</div>
                                        <div className="font-bold mb-1">Feedback comes consolidated, one batch per review round</div>
                                        <p className="text-xs text-slate-600">After each presentation or drawing issue, collect all comments from everyone at home into a single list before sending. Piecemeal feedback across days resets nothing and delays everything.</p>
                                    </div>
                                    <div className="p-4 border border-slate-200 rounded-lg">
                                        <div className="text-xs font-bold text-slate-400 mb-1">R2</div>
                                        <div className="font-bold mb-1">Every drawing includes two revision rounds</div>
                                        <p className="text-xs text-slate-600">Your design fee covers two rounds of each drawing type. Changes beyond Round 2 are chargeable as per the Agreement — we'll always tell you before anything becomes billable.</p>
                                    </div>
                                    <div className="p-4 border border-slate-200 rounded-lg">
                                        <div className="text-xs font-bold text-slate-400 mb-1">R3</div>
                                        <div className="font-bold mb-1">Changes after sign-off go through a Change Request</div>
                                        <p className="text-xs text-slate-600">Once a design is approved, any new addition or change is documented as a Change Request with its own quote, and work on it begins after that quote is settled. This protects your budget from silent creep.</p>
                                    </div>
                                    <div className="p-4 border border-slate-200 rounded-lg">
                                        <div className="text-xs font-bold text-slate-400 mb-1">R4</div>
                                        <div className="font-bold mb-1">Approvals live on your Client Portal, not in chat</div>
                                        <p className="text-xs text-slate-600">WhatsApp is for conversation; the portal is for record. Layout locks, material selections, and drawing approvals are confirmed on the portal so both sides always have the same version of the truth.</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="break-before-page">
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">E. Payment Schedule — Where You Stand</h4>
                                <p className="text-xs text-slate-600 mb-4">Payments are tied to milestones, never to calendar dates. Some design phases in Section B unlock a payment milestone when completed. Full terms are in your Agreement ({docketRef}).</p>
                                <table className="w-full text-left text-[11px] border-collapse border border-slate-200">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="py-2 px-3">Stage</th>
                                            <th className="py-2 px-3">Milestone Trigger</th>
                                            <th className="py-2 px-3 text-right">Share</th>
                                            <th className="py-2 px-3 text-right">Amount</th>
                                            <th className="py-2 px-3 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="bg-slate-50 border-b border-slate-200"><td colSpan={5} className="py-1 px-3 font-bold text-[10px] text-indigo-900 uppercase">Design Fees — ₹{(designFee || 0).toLocaleString('en-IN')}</td></tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">D1 · Sign-up & Concept</td>
                                            <td className="py-2 px-3">Agreement signed</td>
                                            <td className="py-2 px-3 text-right font-mono">25%</td>
                                            <td className="py-2 px-3 text-right font-mono">₹{d1Amount.toLocaleString('en-IN')}</td>
                                            <td className="py-2 px-3 text-right font-bold">Requested · due at kickoff</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">D2 · Design Development</td>
                                            <td className="py-2 px-3">Phase 4 milestone met</td>
                                            <td className="py-2 px-3 text-right font-mono">40%</td>
                                            <td className="py-2 px-3 text-right font-mono">₹{Math.round(designFee * 0.40).toLocaleString('en-IN')}</td>
                                            <td className="py-2 px-3 text-right text-slate-400 font-semibold">Upcoming</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">D3 · Design Completion</td>
                                            <td className="py-2 px-3">Design Complete milestone</td>
                                            <td className="py-2 px-3 text-right font-mono">35%</td>
                                            <td className="py-2 px-3 text-right font-mono">₹{Math.round(designFee * 0.35).toLocaleString('en-IN')}</td>
                                            <td className="py-2 px-3 text-right text-slate-400 font-semibold">Upcoming</td>
                                        </tr>
                                        <tr className="bg-slate-50 border-b border-slate-200"><td colSpan={5} className="py-1 px-3 font-bold text-[10px] text-indigo-900 uppercase">Execution Fees — on final BOQ value</td></tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">E1 · Material Order Advance</td>
                                            <td className="py-2 px-3">Before vendor orders are placed</td>
                                            <td className="py-2 px-3 text-right font-mono">40%</td>
                                            <td className="py-2 px-3 text-right font-mono">Per final BOQ</td>
                                            <td className="py-2 px-3 text-right text-slate-400 font-semibold">After design</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">E2 · Structure & First-Fix</td>
                                            <td className="py-2 px-3">Site milestone met</td>
                                            <td className="py-2 px-3 text-right font-mono">30%</td>
                                            <td className="py-2 px-3 text-right font-mono">Per final BOQ</td>
                                            <td className="py-2 px-3 text-right text-slate-400 font-semibold">After design</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">E3 · Finishing Advance</td>
                                            <td className="py-2 px-3">Site milestone met</td>
                                            <td className="py-2 px-3 text-right font-mono">20%</td>
                                            <td className="py-2 px-3 text-right font-mono">Per final BOQ</td>
                                            <td className="py-2 px-3 text-right text-slate-400 font-semibold">After design</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-semibold">E4 · Completion & Handover</td>
                                            <td className="py-2 px-3">Final walkthrough</td>
                                            <td className="py-2 px-3 text-right font-mono">10%</td>
                                            <td className="py-2 px-3 text-right font-mono">Per final BOQ</td>
                                            <td className="py-2 px-3 text-right text-slate-400 font-semibold">After design</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <p className="text-[11px] text-slate-500 mt-2">One rule worth knowing now: no vendor order is placed before E1 clears. Planning your funds around E1 keeps material deliveries on schedule.</p>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">E+. Completing Your Sign-up & Concept Payment</h4>
                                <div className="bg-[#16296B] rounded-xl p-6 text-white flex gap-6 items-center flex-wrap">
                                    <div className="flex-1 min-w-[260px] grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <div className="text-[9px] font-bold text-[#8FA3E8] uppercase tracking-widest mb-1">Beneficiary Name</div>
                                            <div className="font-bold">{studioName}</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-bold text-[#8FA3E8] uppercase tracking-widest mb-1">Bank Name</div>
                                            <div className="font-bold">HDFC Bank</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-bold text-[#8FA3E8] uppercase tracking-widest mb-1">IFSC Code</div>
                                            <div className="font-bold">HDFC0008843</div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="text-[9px] font-bold text-[#8FA3E8] uppercase tracking-widest mb-1">Account Number</div>
                                            <div className="font-mono text-lg tracking-widest">50200077315731</div>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-lg p-4 text-center min-w-[150px] text-slate-900">
                                        <div className="w-24 h-24 mx-auto mb-2 border-2 border-slate-200 rounded-md bg-[repeating-linear-gradient(0deg,#0F172A_0_4px,transparent_4px_8px),repeating-linear-gradient(90deg,#0F172A_0_4px,#fff_4px_8px)] opacity-80"></div>
                                        <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">D1 Amount</div>
                                        <div className="text-xl font-bold font-mono">₹{d1Amount.toLocaleString('en-IN')}</div>
                                        <div className="text-[9px] text-slate-500 font-semibold mt-1">Inclusive of GST · Scan to pay</div>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-2 text-center">Please share the transaction screenshot on the project WhatsApp group, or pay via the Client Portal.</p>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">F. Your Client Portal</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 border border-slate-200 rounded-lg">
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Portal Link</div>
                                        <div className="font-semibold leading-tight">portal.ffds.in/login <br/><span className="text-[10px] font-normal text-slate-500">invite emailed on D1 confirmation</span></div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sign In</div>
                                        <div className="font-semibold leading-tight">Email one-time code <br/><span className="text-[10px] font-normal text-slate-500">no password to remember</span></div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">You'll Find</div>
                                        <div className="font-semibold leading-tight">Drawings, selections, approvals <br/><span className="text-[10px] font-normal text-slate-500">payment records</span></div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Formal Approvals</div>
                                        <div className="font-semibold leading-tight">Portal only <br/><span className="text-[10px] font-normal text-slate-500">per Ground Rule R4</span></div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">G. The First 10 Days — Kickoff Plan</h4>
                                <table className="w-full text-left text-[11px] border-collapse border border-slate-200">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="py-2 px-3">Day</th>
                                            <th className="py-2 px-3">Milestone</th>
                                            <th className="py-2 px-3">What Happens</th>
                                            <th className="py-2 px-3 text-right">Who</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-mono font-bold">Day 1</td>
                                            <td className="py-2 px-3 font-semibold">Formal Onboarding</td>
                                            <td className="py-2 px-3">D1 confirmed, WhatsApp group created, portal invite sent, keys & society NOC in motion</td>
                                            <td className="py-2 px-3 text-right">Together</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-mono font-bold">Day 3</td>
                                            <td className="py-2 px-3 font-semibold">Requirement Analysis</td>
                                            <td className="py-2 px-3">Site measurement visit — flat access arranged, every wall measured & photographed</td>
                                            <td className="py-2 px-3 text-right">You arrange, we measure</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-mono font-bold">Day 7</td>
                                            <td className="py-2 px-3 font-semibold">Design Workshop</td>
                                            <td className="py-2 px-3">Kickoff sitting — lifestyle, layouts & logic, both decision-makers with the Section C checklist</td>
                                            <td className="py-2 px-3 text-right">Together</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-3 font-mono font-bold">Day 10</td>
                                            <td className="py-2 px-3 font-semibold">Concept Review</td>
                                            <td className="py-2 px-3">First concept presentation — visual direction and space planning options</td>
                                            <td className="py-2 px-3 text-right">FFDS</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">H. Acknowledgement</h4>
                                <p className="text-xs text-slate-600 mb-6">We've read this kit and understand how the project will run — the six phases, the four ground rules, and the milestone-linked payment schedule. This acknowledgement is a working understanding; the signed Agreement ({docketRef}) remains the governing document.</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 border border-dashed border-slate-300 rounded-xl bg-slate-50">
                                    <div>
                                        <div className="text-[10px] font-bold text-indigo-900 uppercase tracking-widest mb-4">For the Client</div>
                                        <div className="h-10 border-b-2 border-slate-300 mb-2"></div>
                                        <div className="font-bold text-sm">{clientName}</div>
                                        <div className="text-[10px] text-slate-500 mt-1">Acknowledged on portal or in writing</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-indigo-900 uppercase tracking-widest mb-4">For {studioName}</div>
                                        <div className="h-10 border-b-2 border-slate-300 mb-2"></div>
                                        <div className="font-bold text-sm">Authorised Signatory</div>
                                        <div className="text-[10px] text-slate-500 mt-1">{orgData?.officeAddress || 'Design Studio'}</div>
                                    </div>
                                </div>
                            </div>
                            
                        </div>
                    </StudioDocumentShell>
                </div>
            </div>
        </div>
    );
}
