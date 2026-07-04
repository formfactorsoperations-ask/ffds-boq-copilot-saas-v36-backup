
import React, { useState } from 'react';
import { ProjectContext, ProposalLevel } from '../../types';
import { formatClientValue } from '../../lib/utils';
import { ArrowRightIcon } from '../Icons';
import { useOrg } from '../../contexts/OrgContext';

interface ClientCoverProps {
    projectContext: ProjectContext;
    investmentMin: number;
    investmentMax: number;
    level?: ProposalLevel;
    designFee?: number;
    executionTotal?: number;
}

const THEME_IMAGES: Record<string, string> = {
    modern: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=2574&auto=format&fit=crop",
    minimalist: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?q=80&w=2670&auto=format&fit=crop",
    classic: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=2653&auto=format&fit=crop",
    industrial: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2500&auto=format&fit=crop",
    bohemian: "https://images.unsplash.com/photo-1615529182904-14819c35db37?q=80&w=2680&auto=format&fit=crop",
    luxury: "https://images.unsplash.com/photo-1631679706909-1844bbd07221?q=80&w=2592&auto=format&fit=crop"
};

const LEVEL_2_IMAGE = "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2531&auto=format&fit=crop"; 

const ClientCover: React.FC<ClientCoverProps> = ({ projectContext, investmentMin, investmentMax, level = 'LEVEL_1', designFee, executionTotal }) => {
    const { orgData } = useOrg();
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const [imgError, setImgError] = useState(false);
    
    const targetImage = level === 'LEVEL_2' 
        ? LEVEL_2_IMAGE 
        : (THEME_IMAGES[projectContext.theme?.toLowerCase() || 'modern'] || THEME_IMAGES['modern']);

    const coverImage = imgError ? THEME_IMAGES['modern'] : targetImage;
    const isFixedPrice = investmentMin === investmentMax;

    const currentStyle = projectContext.coverStyle || 'photo';

    const handleExploreClick = (e: React.MouseEvent) => {
        e.preventDefault();
        const snapshotSection = document.getElementById('snapshot') || document.getElementById('l2-snapshot');
        if (snapshotSection) {
            snapshotSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const l1Content = projectContext.proposalContent?.cover || { title: "Executive Summary", text: `Thank you for inviting us to envision your new home. This proposal outlines a turnkey execution plan tailored for your ${projectContext.config} at ${projectContext.location}.` };
    
    const l15Content = {
        title: "Interim Design & Cost Update",
        text: "Thank you for your continued collaboration. Since our initial conceptual alignment, we have further refined the scope and design direction. This interim proposal captures the updated scope based on our recent discussions, providing clarity on the revised investment value before we move into final material selections and execution readiness.\n\nPlease review this snapshot to ensure we are aligned before proceeding."
    };

    const l2Content = projectContext.proposalContent?.l2_cover || {
        title: "Execution Readiness & Scope Lock",
        text: "We have transitioned from design concepts to a production-ready plan. This document creates a definitive baseline for the **Execution Scope**, specifying exactly what will be built, the materials to be used, and the final investment value.\n\nThis is the blueprint for your project. Approving this document freezes the scope, allowing us to generate technical GFC drawings and initiate material procurement with zero ambiguity."
    };

    const RenderCoverPage = () => {
        const brandColor = orgData?.themeColor || '#0f172a';
        
        switch (currentStyle) {
            case 'minimal':
                return (
                    <div className="relative w-full min-h-[600px] h-screen print:h-[28.5cm] bg-white flex flex-col justify-between p-12 lg:p-24 border-b border-slate-200 print:page-break-after-always">
                        <div className="flex justify-end">
                            {projectContext.logoImage ? (
                                <img src={projectContext.logoImage} alt="Logo" className="h-16 object-contain" />
                            ) : (
                                <div className="text-2xl font-black text-indigo-950 tracking-tighter uppercase">{orgData?.orgName?.toUpperCase() || 'FORM FACTORS STUDIO'}</div>
                            )}
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <h1 className="text-6xl md:text-8xl font-black text-indigo-950 tracking-tighter mb-4 px-4">{projectContext.name}</h1>
                            <p className="text-2xl text-slate-500 font-light">{level === 'LEVEL_2' ? 'Design Finalisation & Readiness' : level === 'LEVEL_1_5' ? 'Interim Design & Scope Review' : 'Interior Design Concept'}</p>
                        </div>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-t border-slate-200 pt-8 mt-auto gap-8 text-left md:text-right">
                            <div className="text-left w-full md:w-auto">
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">Prepared For</p>
                                <p className="text-xl font-bold text-indigo-950">{projectContext.clientName || 'Valued Client'}</p>
                                <p className="text-slate-600">{today}</p>
                            </div>
                            <div className="w-full md:w-auto">
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1 text-left md:text-right">Prepared By</p>
                                <p className="text-xl font-bold text-indigo-950">{orgData?.orgName || 'Form Factors Studio'}</p>
                                <p className="text-slate-600">{orgData?.contactEmail}</p>
                            </div>
                        </div>
                    </div>
                );
            case 'bold':
                return (
                    <div className="relative w-full min-h-[600px] h-screen print:h-[28.5cm] flex flex-col justify-between p-12 lg:p-24 text-white print:page-break-after-always" style={{ backgroundColor: brandColor }}>
                        <div>
                            {projectContext.logoImage ? (
                                <img src={projectContext.logoImage} alt="Logo" className="h-16 object-contain opacity-90 brightness-0 invert" />
                            ) : (
                                <div className="text-2xl font-black tracking-tighter uppercase">{orgData?.orgName?.toUpperCase() || 'FORM FACTORS STUDIO'}</div>
                            )}
                        </div>
                        <div className="flex-1 flex flex-col justify-center max-w-4xl">
                            <h1 className="text-6xl md:text-8xl leading-none font-black tracking-tighter mb-6">{projectContext.name}</h1>
                            <p className="text-2xl font-light opacity-80 mb-12">Interior Design Proposal</p>
                            <div className="w-24 h-1 bg-white/20 mb-12"></div>
                            <div>
                                <p className="text-lg font-medium opacity-90">{projectContext.clientName || 'Valued Client'}</p>
                                <p className="text-lg opacity-70">{today}</p>
                            </div>
                        </div>
                    </div>
                );
            case 'photo':
            default:
                return (
                    <div className="relative w-full min-h-[600px] h-screen print:h-[28.5cm] flex flex-col md:flex-row bg-white overflow-hidden print:page-break-after-always border-b border-slate-200">
                        <div className="w-full md:w-1/2 h-1/2 md:h-full relative bg-indigo-950">
                            <img src={coverImage} alt="Interior Design Theme" className="w-full h-full object-cover opacity-90" onError={() => setImgError(true)} />
                        </div>
                        <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col justify-between p-8 md:p-12 lg:p-20">
                            <div className="flex justify-end mb-8 md:mb-0">
                                {projectContext.logoImage ? (
                                    <img src={projectContext.logoImage} alt="Logo" className="h-12 md:h-16 object-contain" />
                                ) : (
                                    <div className="text-xl md:text-2xl font-black text-indigo-950 tracking-tighter uppercase">{orgData?.orgName?.toUpperCase() || 'FORM FACTORS STUDIO'}</div>
                                )}
                            </div>
                            <div className="flex-1 flex flex-col justify-center">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 w-fit bg-slate-50">
                                    {level === 'LEVEL_2' ? 'Planning & Readiness' : level === 'LEVEL_1_5' ? 'Interim Proposal' : 'Concept Proposal'}
                                </div>
                                <h1 className="text-4xl md:text-5xl lg:text-7xl font-black text-indigo-950 tracking-tighter mb-4">{projectContext.name}</h1>
                                <p className="text-lg md:text-xl text-slate-500">{projectContext.config} • {projectContext.location}</p>
                            </div>
                            <div className="border-t border-slate-200 pt-8 mt-8">
                                <p className="text-[10px] md:text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">Prepared For</p>
                                <p className="text-lg md:text-xl font-bold text-indigo-950">{projectContext.clientName || 'Valued Client'}</p>
                                <p className="text-slate-600 text-sm md:text-base">{today}</p>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <section className="bg-white print:flex print:flex-col print:justify-between">
            <RenderCoverPage />

            <div className="max-w-6xl mx-auto px-5 md:px-8 py-10 md:py-14 print:py-8 print:page-break-before-auto">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                    <div className="lg:col-span-7">
                        {/* Logo Placement */}
                        <div className="mb-8 flex items-center gap-4">
                            {projectContext.logoImage ? (
                                <img 
                                    src={projectContext.logoImage} 
                                    alt="Logo" 
                                    className="w-auto object-contain" 
                                    style={{ height: projectContext.logoHeight || 80 }}
                                />
                            ) : (
                                <div className="text-2xl font-black text-indigo-950 tracking-tighter uppercase">
                                    {orgData?.orgName?.toUpperCase() || 'FORM FACTORS STUDIO'}
                                </div>
                            )}
                        </div>

                                                {level === 'LEVEL_2' ? (
                            <>
                                <h2 className="text-2xl font-bold text-indigo-900 mb-4">{l2Content.title}</h2>
                                <p className="text-slate-600 text-base md:text-lg leading-relaxed mb-8 whitespace-pre-line">
                                    {l2Content.text}
                                </p>
                            </>
                        ) : level === 'LEVEL_1_5' ? (
                            <>
                                <h2 className="text-2xl font-bold text-indigo-900 mb-4">{l15Content.title}</h2>
                                <p className="text-slate-600 text-base md:text-lg leading-relaxed mb-8 whitespace-pre-line">
                                    {l15Content.text}
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-bold text-indigo-900 mb-4">{l1Content.title}</h2>
                                <p className="text-slate-600 text-base md:text-lg leading-relaxed mb-8 whitespace-pre-line">
                                    {l1Content.text}
                                </p>
                                {/* Mobile Jump Button */}
                                <div className="md:hidden mt-4 mb-8">
                                    <a href="#decision-lock" className="flex items-center gap-2 text-indigo-700 font-bold text-sm bg-indigo-50 border border-indigo-100 px-4 py-3 rounded-xl justify-between shadow-sm active:bg-indigo-100">
                                        <span>Already reviewed? Jump to Next Steps</span>
                                        <ArrowRightIcon className="w-4 h-4" />
                                    </a>
                                </div>
                            </>
                        )}

                        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Client Information</h3>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Client Name</p>
                                    <p className="text-base font-bold text-indigo-950">{projectContext.clientName || 'Valued Client'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Project Name</p>
                                    <p className="text-base font-bold text-indigo-950">{projectContext.name}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Location</p>
                                    <p className="text-base font-bold text-indigo-950">{projectContext.location}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Date</p>
                                    <p className="text-base font-bold text-indigo-950">{today}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-5 hidden md:block">
                        <div className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 p-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>
                            </div>
                            
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                {isFixedPrice ? 'Locked Scope Value' : 'Investment Snapshot'}
                            </div>
                            <div className="text-sm font-bold text-slate-600 mb-1">
                                {isFixedPrice ? 'Project Investment (Design-led)' : 'Typical Range'}
                            </div>
                            <div className="text-3xl font-extrabold text-indigo-950 tracking-tight">
                                {isFixedPrice 
                                    ? formatClientValue(investmentMin) 
                                    : `${formatClientValue(investmentMin)} – ${formatClientValue(investmentMax)}`
                                }
                            </div>

                            {isFixedPrice && executionTotal !== undefined && designFee !== undefined && (
                                <div className="mt-4 flex items-center justify-between px-4 py-3 bg-indigo-50/70 rounded-xl text-xs border border-indigo-100/50">
                                    <div className="flex flex-col">
                                        <span className="text-slate-500 font-bold tracking-wider uppercase text-[9px]">Execution Core</span>
                                        <span className="font-extrabold text-indigo-950 text-base">{formatClientValue(executionTotal)}</span>
                                    </div>
                                    <div className="text-indigo-300 font-bold">+</div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-slate-500 font-bold tracking-wider uppercase text-[9px]">Design Fee</span>
                                        <span className="font-extrabold text-indigo-950 text-base">{formatClientValue(designFee)}</span>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 text-[11px] text-slate-400 font-medium border-t border-slate-100 pt-3">
                                Excludes GST (18%) • Excludes Loose Furniture & Appliances
                            </div>

                            <div className="mt-8 space-y-4">
                                <div className="flex items-center gap-3 text-sm text-slate-700">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 text-xs">✓</div>
                                    <p><span className="font-bold">End-to-End Execution</span></p>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-700">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 text-xs">✓</div>
                                    <p><span className="font-bold">Transparent Material Specs</span></p>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-700">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 text-xs">✓</div>
                                    <p><span className="font-bold">Fixed Timeline Commitment</span></p>
                                </div>
                            </div>

                            <div className="mt-8 no-print">
                                <button 
                                    onClick={handleExploreClick}
                                    className="w-full inline-flex items-center justify-center px-4 py-4 rounded-xl bg-indigo-950 text-white font-bold text-sm hover:bg-indigo-950 hover:scale-[1.02] transition-all shadow-lg"
                                >
                                    Explore Proposal Details
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ClientCover;
