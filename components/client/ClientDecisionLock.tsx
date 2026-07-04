
import React from 'react';
import { ProposalDecision } from '../../types';
import { CheckIcon, ArrowRightIcon, ChevronDownIcon } from '../Icons';
import { useOrg } from '../../contexts/OrgContext';

interface ClientDecisionLockProps {
    level?: string;
    decision?: ProposalDecision;
    projectName: string;
    phoneNumber?: string;
    settings?: any; // The combined settings object
}

const ClientDecisionLock: React.FC<ClientDecisionLockProps> = ({ level, decision, projectName, phoneNumber, settings }) => {
    const { orgData } = useOrg();
    
    // If explicitly disabled in settings, don't show. Default to show if undefined.
    if (decision && decision.enabled === false) return null;

    // Use provided number, settings support contact, or fallback. Sanitize to digits only for API.
    const targetPhone = (phoneNumber || settings?.clientPortalConfig?.supportContact || "919137673996").replace(/[^0-9]/g, '');
    const encodedProjectName = encodeURIComponent(projectName || "My Project");
    const companyDisplayName = settings?.companyName || orgData?.orgName || 'Studio';
    const companyFirstName = companyDisplayName.split(' ')[0];

    const OPTIONS = level === 'LEVEL_1_5' ? [
        {
            title: "Approve Interim Scope",
            description: "Confirm that the updated scope and layout directions align with your expectations. This allows us to proceed to final material selections and 3D visualization.",
            nextSteps: ["Final Material Selection", "3D Visualization", "Final BOQ Generation", "Site Execution Kick-off"],
            clarification: "You have already completed the Project Initiation (₹4,999). No payment is required at this stage.",
            buttonText: "Approve & Proceed",
            waMessage: `Hi ${companyFirstName}, I approve the Interim Design & Scope Update for ${encodedProjectName}. Let's move to material selections!`
        },
        {
            title: "Request Scope Revisions",
            description: "If you feel certain items need to be added or removed before we lock the layout.",
            nextSteps: ["Review specific additions/removals", "Update Commercials", "Final Alignment"],
            buttonText: "Request Revisions",
            waMessage: `Hi ${companyFirstName}, I've reviewed the Interim Proposal for ${encodedProjectName} but need some revisions to the scope before we proceed.`
        }
    ] : [
        {
            title: "Proceed with Design-Only Engagement",
            description: "Secure professional planning clarity and design direction. Ideal if you have your own execution team but need a solid design foundation before starting work.",
            nextSteps: ["Design Kick-off Workshop", "Layout & Space Planning", "3D Visualization & Mood Boards", "GFC Drawing Production"],
            exclusions: ["Vendor coordination", "Site supervision", "Material procurement"],
            clarification: "A Project Initiation Fee of ₹4,999 is applicable to commence the design phase. This amount is fully adjustable against your final Design Fee.",
            buttonText: "Start Design Phase (₹4,999)",
            waMessage: `Hi ${companyFirstName}, I’m selecting Option 1 – Design Only for ${encodedProjectName}. Please share the link for the ₹4,999 Initiation Fee to start.`
        },
        {
            title: "Proceed with Design + PMC (Managed)",
            description: "End-to-end design finalisation plus professional execution management. We design the space and then manage your contractors to ensure quality and timeline adherence.",
            nextSteps: ["Detailed Design Finalization", "Vendor Selection & Onboarding", "Execution Timeline Lock", "Quality QC & Snagging"],
            clarification: "A Project Initiation Fee of ₹4,999 is applicable to commence the design & planning phase. This amount is fully adjustable against your final Design & PMC Fee.",
            buttonText: "Start Design + PMC (₹4,999)",
            waMessage: `Hi ${companyFirstName}, I’m selecting Option 2 – Design + PMC for ${encodedProjectName}. Please share the link for the ₹4,999 Initiation Fee to start.`
        },
        {
            title: "Turnkey Execution (Recommended)",
            description: "Full responsibility from design to handover. We handle everything including design, material procurement, labor management, and quality control.",
            nextSteps: ["Initiation Fee Processing", "Site Measurement & Validation", "Design Development (Layouts/3D)", "Final BOQ & Material Lock"],
            clarification: "A Project Initiation Fee of ₹4,999 is applicable to start the Design & Scope finalization phase. This is 100% adjustable against your final order value.",
            buttonText: "Start Turnkey (₹4,999)",
            waMessage: `Hi ${companyFirstName}, I’m selecting Option 3 – Turnkey Execution for ${encodedProjectName}. Please share the link for the ₹4,999 Initiation Fee.`
        }
    ];

    return (
        <section id="decision-lock" className="py-12 border-t border-slate-200 bg-slate-50/50 rounded-3xl mt-8 scroll-mt-20">
            <div className="px-6 md:px-10">
                <div className="mb-10 text-center md:text-left">
                    <span className="inline-block px-3 py-1 bg-indigo-950 text-white text-xs font-bold rounded-full mb-3 uppercase tracking-widest shadow-sm">Next Step</span>
                    <h2 className="text-3xl font-extrabold text-indigo-950 mb-2">Select Your Path Forward</h2>
                    <p className="text-slate-600 text-sm max-w-2xl mx-auto md:mx-0">
                        To move from "Estimate" to "Action", please confirm your preferred engagement model. This allows us to allocate the right design team and resources immediately.
                    </p>
                </div>

                <div className="flex flex-col gap-6 md:gap-8 max-w-4xl">
                    {OPTIONS.map((opt, idx) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                            
                            {/* Mobile: Collapsible Details - OPEN BY DEFAULT */}
                            <details className="group md:hidden" open>
                                <summary className="list-none p-5 flex items-center justify-between cursor-pointer select-none">
                                    <div>
                                        <h3 className="text-lg font-bold text-indigo-950 leading-tight">{opt.title}</h3>
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{opt.description}</p>
                                    </div>
                                    <div className="ml-3 text-slate-400 group-open:rotate-180 transition-transform">
                                        <ChevronDownIcon className="w-5 h-5" />
                                    </div>
                                </summary>
                                <div className="p-5 pt-0 border-t border-slate-100">
                                    <p className="text-sm text-slate-600 leading-relaxed mb-6 mt-4">{opt.description}</p>
                                    <div className="mb-6">
                                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2">Immediate Next Steps</p>
                                        <ul className="space-y-1.5">
                                            {opt.nextSteps.map((step, i) => (
                                                <li key={i} className="flex items-start gap-2 text-xs font-medium text-slate-700">
                                                    <CheckIcon className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                                    <span>{step}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    {opt.clarification && (
                                        <div className="mb-6 bg-blue-50 border-l-2 border-blue-300 p-3 rounded-r-lg">
                                            <p className="text-xs text-blue-900 font-medium leading-relaxed">
                                                {opt.clarification}
                                            </p>
                                        </div>
                                    )}
                                    <a 
                                        href={`https://wa.me/${targetPhone}?text=${opt.waMessage}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-indigo-950 text-white font-bold text-sm rounded-xl shadow-lg hover:bg-blue-900 transition-all"
                                    >
                                        <span>{opt.buttonText}</span>
                                        <ArrowRightIcon className="w-4 h-4" />
                                    </a>
                                </div>
                            </details>

                            {/* Desktop: Standard Card */}
                            <div className="hidden md:block p-8">
                                <div className="flex flex-col md:flex-row gap-8">
                                    <div className="flex-grow">
                                        <h3 className="text-xl font-bold text-indigo-950 mb-2">{opt.title}</h3>
                                        <p className="text-sm text-slate-600 leading-relaxed mb-6">{opt.description}</p>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2">Immediate Next Steps</p>
                                                <ul className="space-y-1.5">
                                                    {opt.nextSteps.map((step, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-xs font-medium text-slate-700">
                                                            <CheckIcon className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                                            <span>{step}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            
                                            <div className="space-y-4">
                                                {opt.exclusions && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Not Included</p>
                                                        <ul className="space-y-1.5">
                                                            {opt.exclusions.map((ex, i) => (
                                                                <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0"></span>
                                                                    <span>{ex}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {opt.clarification && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-2">Initiation Fee</p>
                                                        <p className="text-xs text-slate-600 font-medium italic leading-relaxed border-l-2 border-blue-200 pl-3">
                                                            {opt.clarification}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-shrink-0 md:w-64 flex flex-col justify-end">
                                        <a 
                                            href={`https://wa.me/${targetPhone}?text=${opt.waMessage}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-indigo-950 text-white font-bold text-sm rounded-xl shadow-lg hover:bg-blue-900 hover:scale-[1.02] transition-all group"
                                        >
                                            <span>{opt.buttonText}</span>
                                            <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-10 text-center md:text-left mb-20 md:mb-0">
                    <p className="text-xs text-slate-400 italic font-medium">
                        Once a direction is confirmed, {orgData?.orgName || 'we'} will align the project workflow accordingly.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default ClientDecisionLock;
