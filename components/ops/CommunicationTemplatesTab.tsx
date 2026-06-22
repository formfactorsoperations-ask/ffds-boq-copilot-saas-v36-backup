import React, { useState, useEffect } from 'react';
import { CommunicationTemplateItem } from '../../types';
import { resolveTemplate, stripHtml, EMAIL_TEMPLATE_LIBRARY } from '../../lib/templateEngine';
import { CheckCircle2, ChevronDown, ChevronUp, Copy, Edit2, RotateCcw, Save, Trash2, Search, Filter, Eye, PenTool } from 'lucide-react';
import { db } from '../../services/dbService';
import { useOrg } from '../../contexts/OrgContext';

export default function CommunicationTemplatesTab({ settings, updateSettings, onSaved, studioId }: any) {
    const { currentRole } = useOrg();
    const [templates, setTemplates] = useState<CommunicationTemplateItem[]>([]);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [previewKey, setPreviewKey] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [copySuccess, setCopySuccess] = useState('');

    useEffect(() => {
        if (settings && settings.emailTemplateLibrary && settings.emailTemplateLibrary.length > 0) {
            setTemplates(settings.emailTemplateLibrary);
        } else {
            setTemplates(EMAIL_TEMPLATE_LIBRARY);
        }
    }, [settings]);

    const categories = ['All', ...new Set(templates.map(t => t.category))];

    const filteredTemplates = templates.filter(t => {
        if (filterCategory !== 'All' && t.category !== filterCategory) return false;
        if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const handleEdit = (item: CommunicationTemplateItem) => {
        setEditingKey(item.key);
        setEditForm(JSON.parse(JSON.stringify(item)));
        setPreviewKey(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const newTemplates = templates.map(t => t.key === editForm.key ? { ...editForm, isCustomised: true, lastEditedAt: Date.now() } : t);
        setTemplates(newTemplates);
        await updateSettings('emailTemplateLibrary', newTemplates);
        onSaved();
        setEditingKey(null);
        setIsSaving(false);
    };

    const handleResetAll = async () => {
        if (!window.confirm("Restore missing defaults? Your custom edits will be preserved.")) return;
        setIsSaving(true);
        try {
            // @ts-ignore
            if (db.resetDefaultTemplates) {
                // @ts-ignore
                const newTpls = await db.resetDefaultTemplates(studioId);
                if (newTpls) setTemplates(newTpls);
                onSaved();
            }
        } catch (e) {
            console.error(e);
        }
        setIsSaving(false);
    };

    const handleSeedFFDSVoice = async () => {
        if (!window.confirm("This will update all un-customised templates with the approved FFDS voice. Customised templates will not be changed. Proceed?")) return;
        setIsSaving(true);
        try {
            // @ts-ignore
            if (db.seedRewrittenTemplates) {
                // @ts-ignore
                const newTpls = await db.seedRewrittenTemplates(studioId);
                if (newTpls) setTemplates(newTpls);
                onSaved();
                alert("FFDS voice templates have been successfully applied to all un-customised items.");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to apply FFDS templates.");
        }
        setIsSaving(false);
    };

    const handlePreviewSample = (item: CommunicationTemplateItem) => {
        setPreviewKey(previewKey === item.key ? null : item.key);
        setEditingKey(null);
    };

    const sampleVariables = {
        clientName: "Rahul Sharma",
        projectName: "Villa 32, Prestige",
        studioName: "FFDS",
        designerName: "Neha",
        designerTitle: "Lead Architect",
        date: "24 Nov 2024",
        studioPhone: "+91 98765 43210",
        studioEmail: "hello@ffds.in",
        amount: "₹14,50,000",
        invoiceRef: "INV-2024-001",
        dueDate: "30 Nov 2024",
        portalLink: "https://portal.ffds.in/v32",
        roomName: "Kitchen Area",
        decisionText: "Revise counter height from 34\" to 36\" and shift hob centerline by 3\" left to line up with kitchen cabinetry",
        category: "Site Condition / Cabinetry Alignment",
        presentees: "Rahul Sharma (Client), Vinod (Site Lead)",
        drawingURL: "https://drive.google.com/file/d/villa32_kitchen_revised_drawing/view",
        signoffUrl: "https://portal.ffds.in/signoff/villa32_kitchen_counter",
        expiryDate: "24 Dec 2024"
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight">Communication Template Library</h2>
                    <p className="text-sm text-slate-500 mt-1">Manage standard email and WhatsApp scripts for your studio.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {currentRole === 'super_admin' && (
                        <button onClick={handleSeedFFDSVoice} disabled={isSaving} className="text-xs font-semibold px-3 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg flex items-center gap-1.5 transition-colors">
                            <PenTool className="w-3.5 h-3.5" /> Restore FFDS Templates
                        </button>
                    )}
                    <button onClick={handleResetAll} disabled={isSaving} className="text-xs font-medium px-3 py-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 text-slate-600 transition-colors">
                        <RotateCcw className="w-3.5 h-3.5" /> Restore Defaults
                    </button>
                </div>
            </div>

            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search templates..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select 
                        value={filterCategory} 
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            <div className="p-6 flex flex-col gap-6 max-h-[800px] overflow-y-auto">
                {filteredTemplates.length === 0 ? (
                    <div className="text-center text-slate-500 py-12">No templates found.</div>
                ) : (
                    filteredTemplates.map(template => (
                        <div key={template.key} className="border border-slate-200 rounded-xl bg-white overflow-hidden hover:shadow-md transition-shadow">
                            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                        {template.title}
                                        {template.isCustomised && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full tracking-wider uppercase">Customised</span>}
                                    </h3>
                                    <div className="text-xs text-slate-500 font-medium flex gap-3 mt-1.5">
                                        <span>Phase: <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{template.phase}</span></span>
                                        <span>Category: <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{template.category}</span></span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handlePreviewSample(template)}
                                        className="text-xs font-semibold px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 rounded-lg flex items-center gap-1.5 transition-colors"
                                    >
                                        <Eye className="w-3.5 h-3.5" />Preview
                                    </button>
                                    <button 
                                        onClick={() => handleEdit(template)}
                                        className="text-xs font-semibold px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg flex items-center gap-1.5 transition-colors"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />Edit
                                    </button>
                                </div>
                            </div>

                            {editingKey === template.key && (
                                <div className="p-5 border-t border-slate-100 bg-white space-y-5 animate-in fade-in slide-in-from-top-2">
                                    <div className="bg-blue-50/50 p-3 flex rounded-xl border border-blue-100 text-xs font-medium text-blue-800 leading-relaxed max-w-3xl">
                                        Available variables: {Array.from(new Set([...(template.variables || []), 'designerTitle'])).map(v => <code key={v} className="mx-1 px-1 py-0.5 bg-white rounded border border-blue-200">{`{${v}}`}</code>)}
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email Subject</label>
                                            <input 
                                                value={editForm.email?.subject || ''} 
                                                onChange={e => setEditForm({...editForm, email: {...editForm.email, subject: e.target.value}})}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email Body</label>
                                            <textarea 
                                                value={editForm.email?.body || ''} 
                                                onChange={e => setEditForm({...editForm, email: {...editForm.email, body: e.target.value}})}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-lg h-40 resize-y text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">WhatsApp Message</label>
                                            <textarea 
                                                value={editForm.whatsapp?.body || ''} 
                                                onChange={e => setEditForm({...editForm, whatsapp: {...editForm.whatsapp, body: e.target.value}})}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-lg h-24 resize-y text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                                        <button onClick={() => setEditingKey(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                                        <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                                            <Save className="w-4 h-4" /> Save Template
                                        </button>
                                    </div>
                                </div>
                            )}

                            {previewKey === template.key && (
                                <div className="p-5 border-t border-slate-100 bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Email Preview</h4>
                                        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-3">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">Subject</p>
                                                <p className="font-semibold text-sm text-slate-900" dangerouslySetInnerHTML={{__html: resolveTemplate(template.email?.subject || '', sampleVariables)}}></p>
                                            </div>
                                            <hr className="border-slate-100" />
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Body</p>
                                                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{__html: resolveTemplate(template.email?.body || '', sampleVariables)}}></p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                         <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div> WhatsApp Preview</h4>
                                         <div className="bg-[#E7F6D5] border border-[#D1ECA6] p-4 rounded-xl rounded-tr-none shadow-sm relative ml-4 mr-12 mt-2">
                                            <p className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{__html: resolveTemplate(template.whatsapp?.body || '', sampleVariables)}}></p>
                                         </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
