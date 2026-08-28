import React, { useState, useEffect, useRef } from 'react';
import { CommunicationTemplateItem } from '../../types';
import { resolveTemplate, EMAIL_TEMPLATE_LIBRARY } from '../../lib/templateEngine';
import { 
  Check, 
  Copy, 
  Edit2, 
  Eye, 
  Filter, 
  RotateCcw, 
  Save, 
  Search, 
  Sparkles,
  Mail,
  MessageSquare,
  ShieldCheck,
  Tag,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Undo2,
  Send,
  ExternalLink,
  Code
} from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';

// Helper to reliably merge Firestore settings with the baseline template library
function getValidTemplates(settings: any): CommunicationTemplateItem[] {
    let source: any[] = [];
    if (settings && Array.isArray(settings.emailTemplateLibrary) && settings.emailTemplateLibrary.length > 0) {
        source = settings.emailTemplateLibrary;
    } else if (settings && Array.isArray(settings.communicationTemplate) && settings.communicationTemplate.length > 0) {
        source = settings.communicationTemplate;
    }

    if (source && source.length > 0) {
        const customMap = new Map(source.map((item: any) => [item?.key, item]));
        return EMAIL_TEMPLATE_LIBRARY.map(defaultItem => {
            const custom = customMap.get(defaultItem.key);
            if (custom && custom.title) {
                return {
                    ...defaultItem,
                    ...custom,
                    email: { ...defaultItem.email, ...(custom.email || {}) },
                    whatsapp: { ...defaultItem.whatsapp, ...(custom.whatsapp || {}) }
                };
            }
            return defaultItem;
        });
    }

    return EMAIL_TEMPLATE_LIBRARY;
}

const COMMON_DYNAMIC_TAGS = [
  { tag: 'clientName', label: 'Client Name', desc: 'Full legal name of the client party' },
  { tag: 'projectName', label: 'Project Name', desc: 'Project site or apartment name' },
  { tag: 'amount', label: 'Amount / Valuation', desc: 'Formatted currency (e.g. ₹14,50,000)' },
  { tag: 'signoffUrl', label: 'Signoff URL', desc: 'Direct SSL zero-friction signature link' },
  { tag: 'pinCode', label: 'Access PIN', desc: 'Anti-phishing document security PIN' },
  { tag: 'docTitle', label: 'Document Title', desc: 'Execution Agreement / Proposal / Handover' },
  { tag: 'studioName', label: 'Studio Name', desc: 'Dynamic multi-tenant studio name' },
  { tag: 'studioPhone', label: 'Studio Phone', desc: 'Official studio direct phone' },
  { tag: 'studioEmail', label: 'Studio Email', desc: 'Official operations email' },
  { tag: 'designerName', label: 'Designer Name', desc: 'Assigned Lead Designer or PM' },
  { tag: 'date', label: 'Date', desc: 'Current or milestone date' },
  { tag: 'dueDate', label: 'Due Date', desc: 'Payment or selection deadline' },
  { tag: 'invoiceRef', label: 'Invoice Ref', desc: 'Invoice number (e.g. INV-2026-001)' },
  { tag: 'drawingURL', label: 'Drawing URL', desc: 'Link to PDF or GFC drawing' },
  { tag: 'roomName', label: 'Room Name', desc: 'Room or scope zone' }
];

export default function CommunicationTemplatesTab({ settings, updateSettings, onSaved }: any) {
    const { orgData } = useOrg();
    const studioName = settings?.companyName || settings?.studioName || orgData?.name || 'Form Factors Design Studio';
    const studioPhone = settings?.phone || settings?.studioPhone || '+91 98765 43210';
    const studioEmail = settings?.email || settings?.contactEmail || 'operations@formfactors.in';

    const [templates, setTemplates] = useState<CommunicationTemplateItem[]>(() => getValidTemplates(settings));
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [previewKey, setPreviewKey] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<CommunicationTemplateItem | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
    const [copySuccessKey, setCopySuccessKey] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<'subject' | 'emailBody' | 'whatsappBody'>('emailBody');

    const subjectInputRef = useRef<HTMLInputElement | null>(null);
    const emailBodyRef = useRef<HTMLTextAreaElement | null>(null);
    const whatsappBodyRef = useRef<HTMLTextAreaElement | null>(null);

    // Sync when settings change from Firestore
    useEffect(() => {
        setTemplates(getValidTemplates(settings));
    }, [settings]);

    const categories = ['All', ...Array.from(new Set(templates.map(t => t?.category).filter(Boolean)))];

    const filteredTemplates = templates.filter(t => {
        if (!t || !t.title) return false;
        if (filterCategory !== 'All' && t.category !== filterCategory) return false;
        if (search) {
            const query = search.toLowerCase();
            const matchTitle = (t.title || '').toLowerCase().includes(query);
            const matchKey = (t.key || '').toLowerCase().includes(query);
            const matchCategory = (t.category || '').toLowerCase().includes(query);
            const matchSubject = (t.email?.subject || '').toLowerCase().includes(query);
            const matchBody = (t.email?.body || '').toLowerCase().includes(query);
            if (!matchTitle && !matchKey && !matchCategory && !matchSubject && !matchBody) return false;
        }
        return true;
    });

    const handleEdit = (item: CommunicationTemplateItem) => {
        setEditingKey(item.key);
        setEditForm(JSON.parse(JSON.stringify(item)));
        setPreviewKey(null);
    };

    const handleSave = async () => {
        if (!editForm) return;
        setIsSaving(true);
        try {
            const newTemplates = templates.map(t => 
                t.key === editForm.key ? { ...editForm, isCustomised: true, lastEditedAt: Date.now() } : t
            );
            setTemplates(newTemplates);
            if (updateSettings) {
                await updateSettings('emailTemplateLibrary', newTemplates);
                await updateSettings('communicationTemplate', newTemplates);
            }
            if (onSaved) onSaved();
            setSaveSuccessMsg(`Template "${editForm.title}" saved globally!`);
            setTimeout(() => setSaveSuccessMsg(null), 3500);
            setEditingKey(null);
        } catch (err) {
            console.error("Failed to save template edits", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetSingle = async (key: string) => {
        const defaultItem = EMAIL_TEMPLATE_LIBRARY.find(t => t.key === key);
        if (!defaultItem) return;
        if (!window.confirm(`Reset "${defaultItem.title}" to factory default?`)) return;

        setIsSaving(true);
        try {
            const newTemplates = templates.map(t => t.key === key ? { ...defaultItem, isCustomised: false } : t);
            setTemplates(newTemplates);
            if (updateSettings) {
                await updateSettings('emailTemplateLibrary', newTemplates);
                await updateSettings('communicationTemplate', newTemplates);
            }
            if (editingKey === key) {
                setEditForm(JSON.parse(JSON.stringify(defaultItem)));
            }
            setSaveSuccessMsg(`Restored factory default for "${defaultItem.title}"`);
            setTimeout(() => setSaveSuccessMsg(null), 3000);
        } catch (e) {
            console.error("Failed to reset template", e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetAll = async () => {
        if (!window.confirm("Restore all global communication templates to standard defaults? Any custom edits across all scripts will be reset.")) return;
        setIsSaving(true);
        try {
            setTemplates(EMAIL_TEMPLATE_LIBRARY);
            if (updateSettings) {
                await updateSettings('emailTemplateLibrary', EMAIL_TEMPLATE_LIBRARY);
                await updateSettings('communicationTemplate', EMAIL_TEMPLATE_LIBRARY);
            }
            if (onSaved) onSaved();
            setEditingKey(null);
            setPreviewKey(null);
            setSaveSuccessMsg("All templates restored to standard defaults.");
            setTimeout(() => setSaveSuccessMsg(null), 3000);
        } catch (e) {
            console.error("Failed to restore default templates", e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleInsertTag = (tag: string) => {
        if (!editForm) return;
        const tagText = `{${tag}}`;

        if (activeField === 'subject') {
            const current = editForm.email?.subject || '';
            const input = subjectInputRef.current;
            if (input) {
                const start = input.selectionStart || current.length;
                const end = input.selectionEnd || current.length;
                const updated = current.substring(0, start) + tagText + current.substring(end);
                setEditForm({
                    ...editForm,
                    email: { ...(editForm.email || {}), subject: updated }
                });
                setTimeout(() => {
                    input.focus();
                    input.setSelectionRange(start + tagText.length, start + tagText.length);
                }, 0);
            } else {
                setEditForm({
                    ...editForm,
                    email: { ...(editForm.email || {}), subject: current + ' ' + tagText }
                });
            }
        } else if (activeField === 'emailBody') {
            const current = editForm.email?.body || '';
            const textarea = emailBodyRef.current;
            if (textarea) {
                const start = textarea.selectionStart || current.length;
                const end = textarea.selectionEnd || current.length;
                const updated = current.substring(0, start) + tagText + current.substring(end);
                setEditForm({
                    ...editForm,
                    email: { ...(editForm.email || {}), body: updated }
                });
                setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(start + tagText.length, start + tagText.length);
                }, 0);
            } else {
                setEditForm({
                    ...editForm,
                    email: { ...(editForm.email || {}), body: current + '\n' + tagText }
                });
            }
        } else if (activeField === 'whatsappBody') {
            const current = editForm.whatsapp?.body || '';
            const textarea = whatsappBodyRef.current;
            if (textarea) {
                const start = textarea.selectionStart || current.length;
                const end = textarea.selectionEnd || current.length;
                const updated = current.substring(0, start) + tagText + current.substring(end);
                setEditForm({
                    ...editForm,
                    whatsapp: { ...(editForm.whatsapp || {}), body: updated }
                });
                setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(start + tagText.length, start + tagText.length);
                }, 0);
            } else {
                setEditForm({
                    ...editForm,
                    whatsapp: { ...(editForm.whatsapp || {}), body: current + ' ' + tagText }
                });
            }
        }
    };

    const handleCopyWhatsapp = (item: CommunicationTemplateItem) => {
        const text = resolveTemplate(item.whatsapp?.body || item.email?.body || '', sampleVariables);
        navigator.clipboard.writeText(text);
        setCopySuccessKey(item.key);
        setTimeout(() => setCopySuccessKey(null), 2500);
    };

    const sampleVariables = {
        clientName: "Rahul Sharma",
        projectName: "Lodha Amara 2BHK",
        studioName: studioName,
        designerName: "Neha Verma",
        designerTitle: "Lead Project Architect",
        date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        studioPhone: studioPhone,
        studioEmail: studioEmail,
        amount: "₹14,50,000",
        invoiceRef: "INV-2026-001",
        dueDate: "30 Nov 2026",
        portalLink: "https://studio.portal/client/lodha-2bhk",
        roomName: "Living & Master Suite",
        decisionText: "Finalized modular veneer finish and recessed warm LED profile details",
        category: "Scope & Material Execution",
        presentees: "Rahul Sharma (Client), Vinod (Site Lead)",
        drawingURL: "https://drive.google.com/file/d/gfc_drawings_rev2/view",
        signoffUrl: "https://studio.portal/?agreementSignoff=EXEC_AGREEMENT_sample_token",
        pinCode: "SEC-8492",
        docketHash: "SHA256:8F9E2A7B1C4D5E6F7A8B9C0D1E2F3A4B",
        docTitle: "Integrated Interior Execution Agreement",
        expiryDate: "30 Dec 2026"
    };

    return (
        <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden text-left space-y-0">
            
            {/* Header */}
            <div className="px-6 py-6 border-b border-slate-100 bg-slate-50/70 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="p-1.5 bg-sky-50 text-[#0066CC] rounded-lg">
                            <Mail className="w-4 h-4" />
                        </span>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">
                            Global Email & Communication Templates
                        </h2>
                        <span className="px-2.5 py-0.5 bg-sky-100 text-[#0055B3] text-[10px] font-mono font-bold rounded-full">
                            {templates.length} Active Scripts
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                        Configure global studio email notifications, WhatsApp messages, and digital signature invitations across all project lifecycles.
                    </p>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                    <button 
                        type="button"
                        onClick={handleResetAll} 
                        disabled={isSaving} 
                        className="text-xs font-bold px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl flex items-center gap-1.5 text-slate-700 transition shadow-2xs cursor-pointer"
                    >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Restore All Standard Defaults
                    </button>
                </div>
            </div>

            {/* Notification Toast */}
            {saveSuccessMsg && (
                <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{saveSuccessMsg}</span>
                </div>
            )}

            {/* Filter & Search Bar */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/40 flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search scripts by title, keyword, or subject..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 pr-4 py-2.5 w-full border border-slate-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-[#0066CC] outline-none transition"
                    />
                </div>
                <div className="flex items-center gap-2 shrink-0 overflow-x-auto pb-1 md:pb-0">
                    <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                    <select 
                        value={filterCategory} 
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white focus:ring-2 focus:ring-[#0066CC] outline-none cursor-pointer"
                    >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {/* Templates List */}
            <div className="p-6 space-y-4 max-h-[850px] overflow-y-auto">
                {filteredTemplates.length === 0 ? (
                    <div className="text-center py-16 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <p className="text-sm font-bold text-slate-600">No communication templates found matching your search.</p>
                        <button 
                            type="button"
                            onClick={() => { setSearch(''); setFilterCategory('All'); }} 
                            className="mt-2 text-xs text-[#0066CC] font-bold underline cursor-pointer"
                        >
                            Clear Filters & Show All
                        </button>
                    </div>
                ) : (
                    filteredTemplates.map(template => (
                        <div key={template.key} className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-2xs hover:border-slate-300 transition-all">
                            
                            {/* Card Item Header */}
                            <div className="p-5 bg-slate-50/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-extrabold text-slate-900 text-sm">{template.title}</h3>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                                            template.phase === 'execution' 
                                                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                                : 'bg-sky-50 text-[#0055B3] border-sky-200'
                                        }`}>
                                            {template.phase || 'design'} phase
                                        </span>
                                        {template.isCustomised ? (
                                            <span className="text-[9px] bg-purple-50 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                                                Studio Customized
                                            </span>
                                        ) : (
                                            <span className="text-[9px] bg-slate-100 text-slate-600 border border-slate-200 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                                                Standard Default
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 font-medium">
                                        Category: <strong className="text-slate-800 font-semibold">{template.category || 'General'}</strong>
                                        <span className="mx-2 text-slate-300">·</span>
                                        Key: <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">{template.key}</code>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                    <button 
                                        type="button"
                                        onClick={() => handleCopyWhatsapp(template)}
                                        className="text-xs font-bold px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                                        title="Copy WhatsApp script with sample resolved data"
                                    >
                                        {copySuccessKey === template.key ? (
                                            <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!</>
                                        ) : (
                                            <><Copy className="w-3.5 h-3.5 text-emerald-600" /> Copy WhatsApp</>
                                        )}
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => setPreviewKey(previewKey === template.key ? null : template.key)}
                                        className={`text-xs font-bold px-3 py-1.5 border rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                                            previewKey === template.key 
                                                ? 'bg-slate-900 text-white border-slate-900' 
                                                : 'bg-white border-slate-200 text-slate-700 hover:text-[#0066CC] hover:border-sky-200'
                                        }`}
                                    >
                                        <Eye className="w-3.5 h-3.5" /> Preview
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => handleEdit(template)}
                                        className={`text-xs font-bold px-3.5 py-1.5 border rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                                            editingKey === template.key 
                                                ? 'bg-[#0066CC] text-white border-[#0066CC]' 
                                                : 'bg-[#0066CC] text-white hover:bg-[#0055B3] border-[#0066CC]'
                                        }`}
                                    >
                                        <Edit2 className="w-3.5 h-3.5" /> Configure
                                    </button>
                                </div>
                            </div>

                            {/* FULL RICH EDITOR WITH DYNAMIC VARIABLE INSERTER & LIVE DUAL PREVIEW */}
                            {editingKey === template.key && editForm && (
                                <div className="p-6 border-t border-slate-200 bg-white space-y-6">
                                    
                                    {/* Dynamic Variable Pill Box */}
                                    <div className="bg-sky-50/70 p-4 rounded-2xl border border-sky-100 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-sky-950 flex items-center gap-1.5">
                                                <Tag className="w-3.5 h-3.5 text-[#0066CC]" /> Click Tag to Insert at Cursor:
                                            </span>
                                            <span className="text-[10px] text-sky-700 font-medium">
                                                Active Target: <strong className="uppercase font-bold">{activeField}</strong>
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {COMMON_DYNAMIC_TAGS.map(item => (
                                                <button
                                                    key={item.tag}
                                                    type="button"
                                                    onClick={() => handleInsertTag(item.tag)}
                                                    className="px-2.5 py-1 bg-white hover:bg-sky-100 hover:border-sky-300 border border-sky-200 rounded-lg text-xs font-mono font-bold text-[#0055B3] shadow-2xs transition cursor-pointer flex items-center gap-1"
                                                    title={item.desc}
                                                >
                                                    <span>{`{${item.tag}}`}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Split Edit Inputs & Real-time Live Preview */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        
                                        {/* Left: Edit Form */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                                    Email Subject Line
                                                </label>
                                                <input 
                                                    ref={subjectInputRef}
                                                    type="text"
                                                    onFocus={() => setActiveField('subject')}
                                                    value={editForm.email?.subject || ''} 
                                                    onChange={e => setEditForm({ ...editForm, email: { ...(editForm.email || {}), subject: e.target.value } })}
                                                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none transition" 
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                                    Email Body Copy
                                                </label>
                                                <textarea 
                                                    ref={emailBodyRef}
                                                    onFocus={() => setActiveField('emailBody')}
                                                    value={editForm.email?.body || ''} 
                                                    onChange={e => setEditForm({ ...editForm, email: { ...(editForm.email || {}), body: e.target.value } })}
                                                    rows={8}
                                                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none transition leading-relaxed" 
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                                    WhatsApp Message Copy
                                                </label>
                                                <textarea 
                                                    ref={whatsappBodyRef}
                                                    onFocus={() => setActiveField('whatsappBody')}
                                                    value={editForm.whatsapp?.body || ''} 
                                                    onChange={e => setEditForm({ ...editForm, whatsapp: { ...(editForm.whatsapp || {}), body: e.target.value } })}
                                                    rows={4}
                                                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none transition leading-relaxed" 
                                                />
                                            </div>
                                        </div>

                                        {/* Right: Real-time Live Rendering Preview */}
                                        <div className="space-y-4">
                                            <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3 text-xs">
                                                <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                                                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#0066CC] flex items-center gap-1.5">
                                                        <Mail className="w-3.5 h-3.5" /> Live Email Client Preview
                                                    </span>
                                                    <span className="text-[10px] font-mono text-slate-400">256-Bit TLS Seal</span>
                                                </div>

                                                <div className="space-y-2">
                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Subject Line</span>
                                                        <span className="font-extrabold text-slate-900 text-xs block">
                                                            {resolveTemplate(editForm.email?.subject || '', sampleVariables)}
                                                        </span>
                                                    </div>

                                                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                                                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                            {resolveTemplate(editForm.email?.body || '', sampleVariables)}
                                                        </p>

                                                        {/* Anti-phishing seal mockup */}
                                                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-500 font-mono">
                                                            <div className="font-bold text-[#0066CC] mb-0.5">🔒 OFFICIAL VERIFICATION SEAL</div>
                                                            <div>PIN: {sampleVariables.pinCode} · HASH: {sampleVariables.docketHash.slice(0, 20)}...</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* WhatsApp Bubble Preview */}
                                            <div className="bg-[#E7F6D5] border border-[#D1ECA6] p-4 rounded-2xl rounded-tr-none shadow-2xs text-xs text-emerald-950 font-medium space-y-1.5">
                                                <div className="flex items-center justify-between text-[10px] text-emerald-800 font-bold mb-1">
                                                    <span className="flex items-center gap-1">
                                                        <MessageSquare className="w-3 h-3" /> WhatsApp Script
                                                    </span>
                                                    <span>Today 10:30 AM</span>
                                                </div>
                                                <p className="whitespace-pre-wrap leading-relaxed">
                                                    {resolveTemplate(editForm.whatsapp?.body || editForm.email?.body || '', sampleVariables)}
                                                </p>
                                            </div>
                                        </div>

                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
                                        <button 
                                            type="button"
                                            onClick={() => handleResetSingle(template.key)} 
                                            className="text-xs font-bold text-slate-500 hover:text-rose-600 transition cursor-pointer"
                                        >
                                            Reset this script to standard default
                                        </button>

                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <button 
                                                type="button"
                                                onClick={() => setEditingKey(null)} 
                                                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={handleSave} 
                                                disabled={isSaving} 
                                                className="px-6 py-2.5 text-xs font-bold text-white bg-[#0066CC] rounded-xl hover:bg-[#0055B3] transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                                            >
                                                <Save className="w-3.5 h-3.5" /> Save Global Script
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Collapsible Preview Panel */}
                            {previewKey === template.key && editingKey !== template.key && (
                                <div className="p-5 border-t border-slate-200 bg-slate-50/80 grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1.5">
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-[#0066CC]"></div> Resolved Email Preview
                                        </h4>
                                        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs space-y-2 text-xs">
                                            <div>
                                                <span className="text-[10px] font-bold text-slate-400 block uppercase">Subject</span>
                                                <span className="font-extrabold text-slate-900">{resolveTemplate(template.email?.subject || '', sampleVariables)}</span>
                                            </div>
                                            <hr className="border-slate-100" />
                                            <div>
                                                <span className="text-[10px] font-bold text-slate-400 block uppercase mb-1">Body</span>
                                                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{resolveTemplate(template.email?.body || '', sampleVariables)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div> WhatsApp Message Bubble Preview
                                        </h4>
                                        <div className="bg-[#E7F6D5] border border-[#D1ECA6] p-4 rounded-xl rounded-tr-none shadow-2xs text-xs text-emerald-950 font-medium whitespace-pre-wrap leading-relaxed">
                                            {resolveTemplate(template.whatsapp?.body || template.email?.body || '', sampleVariables)}
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
