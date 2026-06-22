import React, { useState } from 'react';
import { ProjectContext, SiteUpdateRecord } from '../../types';
import { id as generateId } from '../../lib/utils';
import { Camera, Plus, Trash2, Send, Wand2, MessageCircle, Copy, CheckCircle2 } from 'lucide-react';
import { parseQuickSiteUpdate, generateWeeklyUpdateSummary } from '../../services/geminiService';

interface ClientUpdatesManagerProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function ClientUpdatesManager({ projectContext, setProjectContext }: ClientUpdatesManagerProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newUpdate, setNewUpdate] = useState<Partial<SiteUpdateRecord>>({
        title: '',
        description: '',
        author: 'FFDS Site Supervisor',
        tags: [],
        date: new Date().toISOString()
    });
    const [tagInput, setTagInput] = useState('');
    const [rawInput, setRawInput] = useState('');
    const [isParsing, setIsParsing] = useState(false);

    const [summaryModalOpen, setSummaryModalOpen] = useState(false);
    const [whatsappSummary, setWhatsappSummary] = useState('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [copied, setCopied] = useState(false);

    const siteUpdates = projectContext.siteUpdates || [];

    const handleAddTag = () => {
        if (tagInput.trim() && !newUpdate.tags?.includes(tagInput.trim())) {
            setNewUpdate(prev => ({ ...prev, tags: [...(prev.tags || []), tagInput.trim()] }));
            setTagInput('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setNewUpdate(prev => ({ ...prev, tags: prev.tags?.filter(t => t !== tagToRemove) }));
    };

    const handleQuickParse = async () => {
        if (!rawInput.trim()) return;
        setIsParsing(true);
        try {
            const parsed = await parseQuickSiteUpdate(rawInput);
            setNewUpdate(prev => ({
                ...prev,
                title: parsed.title || prev.title,
                description: parsed.description || prev.description,
                tags: parsed.tags || prev.tags
            }));
            setRawInput('');
        } catch (error) {
            console.error("Failed to parse", error);
        } finally {
            setIsParsing(false);
        }
    };

    const handleGenerateSummary = async () => {
        setSummaryModalOpen(true);
        setIsGeneratingSummary(true);
        setCopied(false);
        try {
            const summary = await generateWeeklyUpdateSummary(siteUpdates, projectContext);
            setWhatsappSummary(summary);
        } catch (error) {
            setWhatsappSummary("Failed to generate summary.");
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const handleCopySummary = () => {
        navigator.clipboard.writeText(whatsappSummary);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveUpdate = () => {
        if (!newUpdate.title || !newUpdate.description) {
            alert('Title and description are required.');
            return;
        }

        const updateRecord: SiteUpdateRecord = {
            id: generateId(),
            date: newUpdate.date || new Date().toISOString(),
            title: newUpdate.title,
            description: newUpdate.description,
            type: newUpdate.type || 'site',
            author: newUpdate.type === 'design' ? 'FFDS Design Team' : 'FFDS Site Supervisor',
            tags: newUpdate.tags || []
        };

        setProjectContext(prev => ({
            ...prev,
            siteUpdates: [updateRecord, ...(prev.siteUpdates || [])]
        }));

        setIsAdding(false);
        setNewUpdate({ title: '', description: '', author: 'FFDS Site Supervisor', tags: [], date: new Date().toISOString() });
    };

    const handleDeleteUpdate = (id: string) => {
        setProjectContext(prev => ({
            ...prev,
            siteUpdates: (prev.siteUpdates || []).filter(u => u.id !== id)
        }));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Client Portal Live Feed</h3>
                    <p className="text-sm text-slate-500">Post real-time site updates directly to the client's portal.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleGenerateSummary}
                        disabled={siteUpdates.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 text-sm font-bold rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50"
                    >
                        <MessageCircle className="w-4 h-4" /> WhatsApp Summary
                    </button>
                    <button 
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        {isAdding ? 'Cancel' : <><Plus className="w-4 h-4" /> New Update</>}
                    </button>
                </div>
            </div>

            {summaryModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
                            <h3 className="font-bold text-emerald-800 flex items-center gap-2">
                                <MessageCircle className="w-5 h-5" /> Weekly WhatsApp Summary
                            </h3>
                            <button onClick={() => setSummaryModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>
                        <div className="p-6">
                            {isGeneratingSummary ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
                                    <p className="text-slate-500 font-medium animate-pulse">Drafting summary...</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm whitespace-pre-wrap font-sans text-slate-700 max-h-96 overflow-y-auto">
                                        {whatsappSummary}
                                    </div>
                                    <button 
                                        onClick={handleCopySummary}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
                                    >
                                        {copied ? <><CheckCircle2 className="w-5 h-5" /> Copied to Clipboard</> : <><Copy className="w-5 h-5" /> Copy for WhatsApp</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isAdding && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                            <Camera className="w-5 h-5 text-slate-400" />
                            Draft New Site Update
                        </h4>
                    </div>

                    {/* AI Quick Add Section */}
                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                        <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Wand2 className="w-3 h-3" /> Quick Add via AI
                        </label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={rawInput}
                                onChange={e => setRawInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleQuickParse()}
                                placeholder="e.g., 'Finished living room false ceiling today, starting paint tomorrow'"
                                className="flex-1 p-3 bg-white border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                disabled={isParsing}
                            />
                            <button 
                                onClick={handleQuickParse} 
                                disabled={isParsing || !rawInput.trim()}
                                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isParsing ? 'Parsing...' : 'Auto-Fill'}
                            </button>
                        </div>
                        <p className="text-[10px] text-indigo-500 mt-2">Type raw updates from site supervisors. AI will structure it into a professional update.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Title</label>
                            <input 
                                type="text" 
                                value={newUpdate.title}
                                onChange={e => setNewUpdate({...newUpdate, title: e.target.value})}
                                placeholder="e.g., Civil Work Commenced"
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Update Type</label>
                            <select
                                value={newUpdate.type || 'site'}
                                onChange={e => setNewUpdate({...newUpdate, type: e.target.value as 'site' | 'design'})}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="site">Site Execution Progress</option>
                                <option value="design">Design Meeting & Updates</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date</label>
                            <input 
                                type="date" 
                                value={newUpdate.date ? new Date(newUpdate.date).toLocaleDateString('en-CA') : ''}
                                onChange={e => {
                                    if (e.target.value) {
                                        const d = new Date(e.target.value);
                                        // Keep current time, just change the date
                                        const now = new Date();
                                        d.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
                                        setNewUpdate({...newUpdate, date: d.toISOString()});
                                    }
                                }}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                        <textarea 
                            value={newUpdate.description}
                            onChange={e => setNewUpdate({...newUpdate, description: e.target.value})}
                            placeholder="Provide details about the progress..."
                            rows={3}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tags (Press Enter to add)</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                                placeholder="e.g., Civil, Living Room"
                                className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button onClick={handleAddTag} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-300">Add</button>
                        </div>
                        {newUpdate.tags && newUpdate.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {newUpdate.tags.map(tag => (
                                    <span key={tag} className="flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-md text-xs font-medium">
                                        {tag}
                                        <button onClick={() => handleRemoveTag(tag)} className="text-blue-400 hover:text-blue-600"><Trash2 className="w-3 h-3" /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button 
                            onClick={handleSaveUpdate}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Send className="w-4 h-4" /> Post to Client Portal
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {siteUpdates.length === 0 ? (
                    <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl border-dashed">
                        <Camera className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">No site updates posted yet.</p>
                        <p className="text-sm text-slate-400 mt-1">Updates posted here will appear instantly in the Client Portal's Live Feed.</p>
                    </div>
                ) : (
                    siteUpdates.map(update => (
                        <div key={update.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between gap-4 group">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-slate-400">
                                        {new Date(update.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                    <span className="text-xs font-medium text-slate-500">{update.author}</span>
                                </div>
                                <h4 className="font-bold text-slate-800 text-base mb-1">{update.title}</h4>
                                <p className="text-sm text-slate-600 mb-3">{update.description}</p>
                                {update.tags && update.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {update.tags.map(tag => (
                                            <span key={tag} className="text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md">{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => handleDeleteUpdate(update.id)}
                                className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete Update"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
