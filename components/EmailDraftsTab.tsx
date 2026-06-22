import React, { useState } from 'react';
import { ProjectContext, ProposalTier } from '../types';
import { useOrg } from '../contexts/OrgContext';
import { useStudioSettings } from '../hooks/useStudioSettings';
import { resolveTemplate, stripHtml, EMAIL_TEMPLATE_LIBRARY } from '../lib/templateEngine';
import { CheckCircle2, Copy, Search, Filter, Mail, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';

interface EmailDraftsTabProps {
    projectContext: ProjectContext & { id?: string };
    tiers?: ProposalTier[];
}

const EmailDraftsTab: React.FC<EmailDraftsTabProps> = ({ projectContext, tiers }) => {
    const { orgData, currentUserAuth } = useOrg();
    const { settings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [copySuccess, setCopySuccess] = useState('');

    const templates = settings?.emailTemplateLibrary && settings.emailTemplateLibrary.length > 0
        ? settings.emailTemplateLibrary
        : EMAIL_TEMPLATE_LIBRARY;
    const categories = ['All', ...new Set(templates.map(t => t.category))];

    const filteredTemplates = templates.filter(t => {
        if (filterCategory !== 'All' && t.category !== filterCategory) return false;
        if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const getVariables = () => {
        return {
            clientName: projectContext?.clientName || '{Client Name}',
            projectName: projectContext?.name || '{Project Name}',
            // @ts-ignore
            studioName: settings?.branding?.orgName || 'Studio',
            // @ts-ignore
            studioPhone: settings?.branding?.contactInfo || '',
            studioEmail: '',
            designerName: currentUserAuth?.displayName || 'Designer',
            // @ts-ignore
            designerTitle: settings?.team?.[currentUserAuth?.uid || '']?.title || 'Architect',
            date: format(new Date(), 'dd MMM yyyy'),
            amount: '₹0', // Can be refined later with actual milestones
            invoiceRef: '',
            dueDate: '',
            portalLink: window.location.origin + '/client?project=' + (projectContext.id || 'new')
        };
    };

    const vars = getVariables();

    const handleCopy = (html: string, type: string) => {
        const text = stripHtml(html);
        navigator.clipboard.writeText(text);
        setCopySuccess(type);
        setTimeout(() => setCopySuccess(''), 2000);
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Project Communication Scripts</h2>
                    <p className="text-sm text-slate-500 mt-1">Pre-filled templates based on {projectContext?.name || 'this project'}</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Search scripts..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <select 
                        value={filterCategory} 
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="w-full sm:w-auto border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {filteredTemplates.length === 0 ? (
                    <div className="text-center text-slate-500 py-12 bg-white rounded-2xl border border-slate-200">No communication scripts found for this criteria.</div>
                ) : (
                    filteredTemplates.map(template => (
                        <div key={template.key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                        {template.title}
                                    </h3>
                                    <div className="text-xs text-slate-500 font-medium flex gap-3 mt-1.5 align-center">
                                        <span>Phase: <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{template.phase}</span></span>
                                        <span>Category: <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">{template.category}</span></span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Email Side */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /> Email Draft</h4>
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 relative group">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Subject</p>
                                        <div 
                                            className="text-slate-900 font-semibold text-sm pr-12"
                                            dangerouslySetInnerHTML={{ __html: resolveTemplate(template.email?.subject || '', vars) }}
                                        />
                                        <button 
                                            onClick={() => handleCopy(resolveTemplate(template.email?.subject || '', vars), `${template.key}_subject`)}
                                            className="absolute top-3 right-3 text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all flex items-center gap-1 text-xs"
                                        >
                                            {copySuccess === `${template.key}_subject` ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 relative group">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Body</p>
                                        <div 
                                            className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed pr-12"
                                            dangerouslySetInnerHTML={{ __html: resolveTemplate(template.email?.body || '', vars) }}
                                        />
                                        <button 
                                            onClick={() => handleCopy(resolveTemplate(template.email?.body || '', vars), `${template.key}_body`)}
                                            className="absolute top-3 right-3 text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all flex items-center gap-1 text-xs"
                                        >
                                            {copySuccess === `${template.key}_body` ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                                
                                {/* WhatsApp Side */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-green-700 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp Draft</h4>
                                    <div className="bg-[#E7F6D5] rounded-2xl rounded-tr-none p-5 border border-[#D1ECA6] relative group shadow-sm mr-8 mt-2">
                                        <div 
                                            className="text-green-900 whitespace-pre-wrap text-sm leading-relaxed pr-8"
                                            dangerouslySetInnerHTML={{ __html: resolveTemplate(template.whatsapp?.body || '', vars) }}
                                        />
                                        <button 
                                            onClick={() => handleCopy(resolveTemplate(template.whatsapp?.body || '', vars), `${template.key}_wa`)}
                                            className="absolute top-3 right-3 text-green-600 hover:text-green-800 p-1.5 rounded-lg hover:bg-green-100 border border-transparent hover:border-green-200 transition-all flex items-center gap-1 text-xs"
                                        >
                                            {copySuccess === `${template.key}_wa` ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default EmailDraftsTab;
