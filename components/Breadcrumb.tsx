import React from 'react';
import { motion } from 'framer-motion';

interface BreadcrumbProps {
    projectName: string;
    projectId: string;
    currentSection: string;
    setActiveTab: (tab: string) => void;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ projectName, projectId, currentSection, setActiveTab }) => {
    // Mapping from activeTab string to human-readable section name
    const getLocalSectionName = (tab: string) => {
        const t = tab.toLowerCase();
        if (t.includes('dashboard') || t.includes('overview')) return 'Overview';
        if (t.includes('editor') || t.includes('boq') || t.includes('versions') || t.includes('proposal') || t.includes('tier')) return 'BOQ & Proposals';
        if (t.includes('leadiq') || t.includes('strategy') || t.includes('site-vision') || t.includes('prompt')) return 'Strategy & AI';
        if (t.includes('execution') || t.includes('ops') || t.includes('revision') || t.includes('sof') || t.includes('paint') || t.includes('materials')) return 'Execution';
        if (t.includes('client-proposal') || t.includes('proposal-export') || t.includes('contract') || t.includes('portal') || t.includes('onboarding') || t.includes('email') || t.includes('client')) return 'Client Outputs';
        if (t.includes('payment-calc') || t.includes('timeline')) return 'Execution';
        if (t.includes('analytics')) return 'Analytics';

        // fallback: capitalise last segment
        const segments = t.split('-');
        const last = segments[segments.length - 1];
        return last.charAt(0).toUpperCase() + last.slice(1);
    };

    const sectionName = getLocalSectionName(currentSection);

    return (
        <div className="h-9 flex items-center px-8 border-b border-slate-200 bg-transparent text-[13px]">
            <button 
                onClick={() => setActiveTab('projects')}
                className="text-slate-500 hover:text-indigo-600 font-medium transition-colors cursor-pointer"
            >
                All Projects
            </button>
            
            <svg className="w-3.5 h-3.5 mx-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            
            <button 
                onClick={() => setActiveTab('dashboard')}
                className="text-slate-500 hover:text-indigo-600 font-medium transition-colors cursor-pointer truncate max-w-[200px]"
            >
                {projectName || 'Unnamed Project'}
            </button>

            <svg className="w-3.5 h-3.5 mx-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>

            <span className="text-slate-900 font-medium">
                {sectionName}
            </span>
        </div>
    );
};

export default Breadcrumb;
