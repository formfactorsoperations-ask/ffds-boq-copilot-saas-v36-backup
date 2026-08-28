import React, { useState, useRef } from 'react';
import { ProjectContext, SiteUpdateRecord } from '../../types';
import { id as generateId } from '../../lib/utils';
import { 
  Camera, 
  Plus, 
  Trash2, 
  Send, 
  Wand2, 
  MessageCircle, 
  Copy, 
  CheckCircle2, 
  Grid, 
  Clock, 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Image as ImageIcon,
  X,
  Sparkles,
  Activity
} from 'lucide-react';
import { parseQuickSiteUpdate, generateWeeklyUpdateSummary } from '../../services/geminiService';
import { useOrg } from '../../contexts/OrgContext';

interface ClientUpdatesManagerProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeProject?: any;
}

export default function ClientUpdatesManager({ projectContext, setProjectContext, activeProject }: ClientUpdatesManagerProps) {
    const { orgData } = useOrg();
    const [viewMode, setViewMode] = useState<'feed' | 'timeline'>('feed');
    const [isAdding, setIsAdding] = useState(false);
    const [newUpdate, setNewUpdate] = useState<Partial<SiteUpdateRecord>>({
        title: '',
        description: '',
        author: `${orgData?.orgName || 'Studio'} Site Supervisor`,
        tags: [],
        date: new Date().toISOString()
    });
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [rawInput, setRawInput] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [deletingUpdateId, setDeletingUpdateId] = useState<string | null>(null);

    const [summaryModalOpen, setSummaryModalOpen] = useState(false);
    const [whatsappSummary, setWhatsappSummary] = useState('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [copied, setCopied] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const siteUpdates = projectContext.siteUpdates || [];

    // Helper for formatting markdown insertion
    const insertFormatting = (prefix: string, suffix: string = '') => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selected = text.substring(start, end);
        const replacement = prefix + selected + suffix;
        
        setNewUpdate(prev => ({
            ...prev,
            description: text.substring(0, start) + replacement + text.substring(end)
        }));
        
        // Refocus and place cursor
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + prefix.length + selected.length + suffix.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 50);
    };

    // FileReader to handle offline/client-side base64 images
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    setUploadedImages(prev => [...prev, reader.result as string]);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveUploadedImage = (idx: number) => {
        setUploadedImages(prev => prev.filter((_, i) => i !== idx));
    };

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
            author: newUpdate.type === 'design' ? `${orgData?.orgName || 'Studio'} Design Team` : `${orgData?.orgName || 'Studio'} Site Supervisor`,
            tags: newUpdate.tags || [],
            images: uploadedImages.length > 0 ? uploadedImages : undefined
        };

        setProjectContext(prev => ({
            ...prev,
            siteUpdates: [updateRecord, ...(prev.siteUpdates || [])]
        }));

        setIsAdding(false);
        setNewUpdate({ title: '', description: '', author: `${orgData?.orgName || 'Studio'} Site Supervisor`, tags: [], date: new Date().toISOString() });
        setUploadedImages([]);
    };

    const handleDeleteUpdate = (id: string) => {
        setDeletingUpdateId(id);
    };

    const confirmDeleteUpdate = () => {
        if (!deletingUpdateId) return;
        const idToDelete = deletingUpdateId;
        setProjectContext(prev => ({
            ...prev,
            siteUpdates: (prev.siteUpdates || []).filter(u => u.id !== idToDelete)
        }));
        setDeletingUpdateId(null);
    };

    // Client-side visual renderer for Markdown
    const renderFormattedText = (text: string) => {
        if (!text) return null;
        const lines = text.split('\n');
        return lines.map((line, idx) => {
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                return (
                    <li key={idx} className="ml-4 list-disc text-sm text-slate-600 mb-1 leading-relaxed">
                        {renderInlineFormatting(line.trim().substring(2))}
                    </li>
                );
            }
            const numMatch = line.trim().match(/^(\d+)\.\s(.*)/);
            if (numMatch) {
                return (
                    <li key={idx} className="ml-4 list-decimal text-sm text-slate-600 mb-1 leading-relaxed">
                        {renderInlineFormatting(numMatch[2])}
                    </li>
                );
            }
            return (
                <p key={idx} className="text-sm text-slate-600 mb-2 leading-relaxed font-medium">
                    {renderInlineFormatting(line)}
                </p>
            );
        });
    };

    const renderInlineFormatting = (text: string) => {
        const boldRegex = /\*\*(.*?)\*\*/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        
        while ((match = boldRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }
            parts.push(<strong key={match.index} className="font-extrabold text-slate-900">{match[1]}</strong>);
            lastIndex = boldRegex.lastIndex;
        }
        
        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }
        
        return parts.length > 0 ? parts : text;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
                <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <Camera className="w-5 h-5 text-[#0066CC]" />
                        Live Client Feed & Daily Site Journal
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Share photo updates, site logs, and quick progress digests directly with the client.</p>
                </div>
                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    {/* View Switcher */}
                    <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner flex items-center shrink-0">
                        <button
                            onClick={() => setViewMode('feed')}
                            className={`p-1.5 rounded-lg transition-all flex items-center gap-1 text-[10px] uppercase font-black tracking-wider ${viewMode === 'feed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                            title="List Feed View"
                        >
                            <Grid className="w-3.5 h-3.5" /> Feed
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={`p-1.5 rounded-lg transition-all flex items-center gap-1 text-[10px] uppercase font-black tracking-wider ${viewMode === 'timeline' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                            title="Timeline Progress View"
                        >
                            <Clock className="w-3.5 h-3.5" /> Timeline
                        </button>
                    </div>

                    <button 
                        onClick={handleGenerateSummary}
                        disabled={siteUpdates.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 shadow-sm"
                    >
                        <MessageCircle className="w-4 h-4" /> Weekly WhatsApp Digest
                    </button>
                    
                    <button 
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-xs"
                    >
                        {isAdding ? 'Cancel' : <><Plus className="w-4 h-4" /> New Update</>}
                    </button>
                </div>
            </div>

            {/* WhatsApp modal summary */}
            {summaryModalOpen && (
                <div className="fixed inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
                            <h3 className="font-black text-emerald-900 text-sm flex items-center gap-2 uppercase tracking-wider">
                                <MessageCircle className="w-5 h-5 text-emerald-600" /> WhatsApp Update Draft
                            </h3>
                            <button onClick={() => setSummaryModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            {isGeneratingSummary ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="w-9 h-9 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Drafting summary with AI...</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans text-slate-700 max-h-96 overflow-y-auto">
                                        {whatsappSummary}
                                    </div>
                                    <button 
                                        onClick={handleCopySummary}
                                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 transition-colors uppercase text-xs tracking-wider shadow-md shadow-emerald-100"
                                    >
                                        {copied ? <><CheckCircle2 className="w-5 h-5" /> Copied to Clipboard</> : <><Copy className="w-5 h-5" /> Copy for WhatsApp</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add new update form */}
            {isAdding && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                            <Camera className="w-5 h-5 text-[#0066CC]" />
                            Post Site Progress Update
                        </h4>
                    </div>

                    {/* AI Quick Add Section */}
                    <div className="bg-sky-50/50 p-4 rounded-2xl border border-sky-100">
                        <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Wand2 className="w-3.5 h-3.5" /> AI Autocompiler
                        </label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={rawInput}
                                onChange={e => setRawInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleQuickParse()}
                                placeholder="e.g., 'Finished master bedroom tile floor, plumbing lines in toilet tested and ready'"
                                className="flex-1 px-4 py-2.5 bg-white border border-sky-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                                disabled={isParsing}
                            />
                            <button 
                                onClick={handleQuickParse} 
                                disabled={isParsing || !rawInput.trim()}
                                className="px-5 py-2.5 bg-[#0066CC] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#0055B3] disabled:opacity-50 flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                            >
                                {isParsing ? 'Parsing...' : <><Sparkles className="w-3.5 h-3.5" /> Auto-Fill</>}
                            </button>
                        </div>
                        <p className="text-[10px] text-[#0066CC] font-semibold mt-2">Type rough notes from site checkups. AI will structure, correct nomenclature, and add appropriate tags.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Update Title</label>
                            <input 
                                type="text" 
                                value={newUpdate.title}
                                onChange={e => setNewUpdate({...newUpdate, title: e.target.value})}
                                placeholder="e.g., Tiling Completion & Sanitary Testing"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Update Category</label>
                            <select
                                value={newUpdate.type || 'site'}
                                onChange={e => setNewUpdate({...newUpdate, type: e.target.value as 'site' | 'design'})}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                            >
                                <option value="site">Site Execution Progress</option>
                                <option value="design">Design Meeting / Revision update</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Post Date</label>
                            <input 
                                type="date" 
                                value={newUpdate.date ? new Date(newUpdate.date).toLocaleDateString('en-CA') : ''}
                                onChange={e => {
                                    if (e.target.value) {
                                        const d = new Date(e.target.value);
                                        const now = new Date();
                                        d.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
                                        setNewUpdate({...newUpdate, date: d.toISOString()});
                                    }
                                }}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Rich text formatting tools for description */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Update Description</label>
                            <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => insertFormatting('**', '**')}
                                    className="p-1 hover:bg-white rounded text-slate-600 transition-colors"
                                    title="Bold"
                                >
                                    <Bold className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => insertFormatting('*', '*')}
                                    className="p-1 hover:bg-white rounded text-slate-600 transition-colors"
                                    title="Italic"
                                >
                                    <Italic className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => insertFormatting('\n- ')}
                                    className="p-1 hover:bg-white rounded text-slate-600 transition-colors"
                                    title="Bullet List"
                                >
                                    <List className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => insertFormatting('\n1. ')}
                                    className="p-1 hover:bg-white rounded text-slate-600 transition-colors"
                                    title="Numbered List"
                                >
                                    <ListOrdered className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                        <textarea 
                            ref={textareaRef}
                            value={newUpdate.description}
                            onChange={e => setNewUpdate({...newUpdate, description: e.target.value})}
                            placeholder="Describe what occurred. Highlight milestones achieved, delays faced, or upcoming schedules. Use tools above for formatting."
                            rows={4}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-[#0066CC] focus:outline-none resize-none leading-relaxed"
                        />
                    </div>

                    {/* Progress photo attachments */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress Photos</label>
                        
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-sm"
                            >
                                <ImageIcon className="w-4 h-4 text-slate-500" /> Select Photos
                            </button>
                            <input 
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                multiple
                                accept="image/*"
                                className="hidden"
                            />
                            <span className="text-[10px] font-semibold text-slate-400">Attach photos from today's site audit</span>
                        </div>

                        {uploadedImages.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
                                {uploadedImages.map((img, idx) => (
                                    <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 shadow-inner group">
                                        <img src={img} alt="" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveUploadedImage(idx)}
                                            className="absolute top-1 right-1 p-1 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/80 hover:bg-rose-600 text-white rounded-full transition-colors shadow"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tags input */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Post Tags</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                placeholder="Press Enter to add tag (e.g. Living, Tiles, Civil)"
                                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                            />
                            <button onClick={handleAddTag} className="px-4 py-2 bg-sky-50 hover:bg-sky-100 text-[#0055B3] border border-sky-100 rounded-xl text-xs font-black uppercase tracking-wider">Add</button>
                        </div>
                        {newUpdate.tags && newUpdate.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {newUpdate.tags.map(tag => (
                                    <span key={tag} className="flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-100 px-2 py-1 rounded-lg text-xs font-bold">
                                        {tag}
                                        <button onClick={() => handleRemoveTag(tag)} className="text-sky-400 hover:text-[#0066CC]"><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button 
                            onClick={handleSaveUpdate}
                            className="flex items-center gap-1.5 px-6 py-3 bg-[#0066CC] text-white font-black rounded-xl hover:bg-[#0055B3] transition-colors shadow-md shadow-sky-100 uppercase text-xs tracking-wider"
                        >
                            <Send className="w-4 h-4" /> Publish Update & Send
                        </button>
                    </div>
                </div>
            )}

            {/* View Mode content */}
            <div className="space-y-4">
                {siteUpdates.length === 0 && !isAdding ? (
                    <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
                        <Camera className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h4 className="font-bold text-slate-900 mb-1 text-sm">No Updates Published yet</h4>
                        <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4">
                            Log updates with photo attachments and bullet lists to keep the client aligned during the execution phase.
                        </p>
                        <button
                            onClick={() => setIsAdding(true)}
                            className="px-4 py-2 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-[#0055B3] transition-all"
                        >
                            Publish First Update
                        </button>
                    </div>
                ) : viewMode === 'timeline' ? (
                    /* Elegant visual timeline */
                    <div className="relative pl-6 sm:pl-10 space-y-8 before:absolute before:left-2 before:sm:left-4 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
                        {siteUpdates.map((update, idx) => {
                            const isSite = update.type !== 'design';
                            return (
                                <div key={update.id} className="relative">
                                    {/* Circle node on the timeline line */}
                                    <div className={`absolute -left-6 sm:-left-10 top-1 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center ${isSite ? 'border-sky-500' : 'border-[#0066CC]'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${isSite ? 'bg-sky-500' : 'bg-[#0066CC]'}`} />
                                    </div>

                                    {/* Timeline Event Content */}
                                    <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-5 relative group">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                        {new Date(update.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </span>
                                                    <span className="text-slate-300">·</span>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{update.author}</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleDeleteUpdate(update.id)}
                                                    className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                                    title="Delete Update"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            <h4 className="font-black text-slate-900 text-base tracking-tight">{update.title}</h4>
                                            
                                            <div className="space-y-1.5 text-slate-600 pt-1">
                                                {renderFormattedText(update.description)}
                                            </div>

                                            {update.tags && update.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 pt-1">
                                                    {update.tags.map(tag => (
                                                        <span key={tag} className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Image Attachments inside timeline box */}
                                        {update.images && update.images.length > 0 && (
                                            <div className="md:w-64 shrink-0 grid grid-cols-2 gap-2 self-stretch">
                                                {update.images.map((img, i) => (
                                                    <div key={i} className={`rounded-2xl overflow-hidden border border-slate-100 shadow-inner ${update.images?.length === 1 ? 'col-span-2' : ''}`}>
                                                        <img src={img} alt="" className="w-full h-full object-cover aspect-square" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* Direct List Feed view with edit-ability */
                    <div className="space-y-4">
                        {siteUpdates.map(update => (
                            <div key={update.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start justify-between gap-6 group">
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            {new Date(update.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{update.author}</span>
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-base mb-1 tracking-tight">{update.title}</h4>
                                        <div className="space-y-1.5 text-slate-600">
                                            {renderFormattedText(update.description)}
                                        </div>
                                    </div>

                                    {/* Photo Grid */}
                                    {update.images && update.images.length > 0 && (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-2">
                                            {update.images.map((img, i) => (
                                                <div key={i} className="aspect-video rounded-xl overflow-hidden border border-slate-100 shadow-inner">
                                                    <img src={img} alt="" className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {update.tags && update.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {update.tags.map(tag => (
                                                <span key={tag} className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button 
                                    onClick={() => handleDeleteUpdate(update.id)}
                                    className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all self-start cursor-pointer"
                                    title="Delete Update"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* In-app Delete Confirmation Modal */}
            {deletingUpdateId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                                <Trash2 className="w-5 h-5 text-rose-600" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 text-sm">Delete Site Update?</h4>
                                <p className="text-xs text-slate-500">This action will remove the record and attached photos.</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-150">
                            Are you sure you want to permanently delete this update from the live client feed?
                        </p>

                        <div className="flex justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeletingUpdateId(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteUpdate}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-xs cursor-pointer"
                            >
                                Delete Update
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
