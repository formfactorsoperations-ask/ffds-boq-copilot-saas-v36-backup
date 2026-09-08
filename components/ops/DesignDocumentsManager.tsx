import React, { useState } from 'react';
import { ProjectContext, DesignDocument } from '../../types';
import { id as generateId } from '../../lib/utils';
import { 
    Folder, 
    Link as LinkIcon, 
    Trash2, 
    Plus, 
    ArrowUpRight, 
    Image as ImageIcon, 
    Layers, 
    FileText, 
    ExternalLink, 
    Eye,
    Sparkles,
    Filter,
    Search,
    X,
    Check,
    Copy,
    LayoutGrid,
    List,
    ChevronLeft,
    ChevronRight,
    Maximize2,
    Share2,
    Download,
    Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExtendedDesignDocument extends DesignDocument {
    docType?: '3d_render' | 'gfc_drawing' | 'layout' | 'moodboard';
    thumbnailUrl?: string;
}

interface DesignDocumentsManagerProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function DesignDocumentsManager({ projectContext, setProjectContext }: DesignDocumentsManagerProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
    const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    
    // Lightbox modal state
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    
    // Toast notification state
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const [newDoc, setNewDoc] = useState<{
        roomName: string;
        title: string;
        url: string;
        docType: '3d_render' | 'gfc_drawing' | 'layout' | 'moodboard';
        thumbnailUrl: string;
    }>({
        roomName: 'Overall',
        title: '',
        url: '',
        docType: '3d_render',
        thumbnailUrl: ''
    });

    /**
     * The site photo album.
     *
     * Progress photographs are not deliverables and were never a good fit for
     * this vault — dozens a week, full resolution, and nobody wants them
     * paginated. They live in the studio's Drive; this records where, and the
     * portal shows the client one link on Design & Scope.
     */
    const sitePhotos = projectContext.sitePhotosLink;
    const [editingPhotos, setEditingPhotos] = useState(false);
    const [photoDraft, setPhotoDraft] = useState({ url: '', label: '' });

    const openPhotoEditor = () => {
        setPhotoDraft({ url: sitePhotos?.url || '', label: sitePhotos?.label || '' });
        setEditingPhotos(true);
    };

    const saveSitePhotos = () => {
        const url = photoDraft.url.trim();
        if (!url) { showToast('⚠️ Paste the Drive folder link first'); return; }
        if (!/^https?:\/\//i.test(url)) { showToast('⚠️ The link must start with http:// or https://'); return; }
        setProjectContext(prev => ({
            ...prev,
            sitePhotosLink: {
                url,
                label: photoDraft.label.trim() || undefined,
                updatedAt: new Date().toISOString(),
            },
        }));
        setEditingPhotos(false);
        showToast('✅ Site photo album linked — the client can now open it');
    };

    const removeSitePhotos = () => {
        setProjectContext(prev => {
            const next: any = { ...prev };
            delete next.sitePhotosLink;
            return next;
        });
        setEditingPhotos(false);
        showToast('🗑️ Site photo album unlinked from the portal');
    };

    const docs: ExtendedDesignDocument[] = (projectContext.designDocuments || []) as ExtendedDesignDocument[];

    const handleSave = () => {
        if (!newDoc.roomName || !newDoc.title || !newDoc.url) {
            showToast('⚠️ Please provide Room, Title, and Document Link');
            return;
        }

        const docRecord: ExtendedDesignDocument = {
            id: generateId(),
            roomName: newDoc.roomName,
            title: newDoc.title,
            url: newDoc.url,
            docType: newDoc.docType,
            thumbnailUrl: newDoc.thumbnailUrl || (newDoc.docType === '3d_render' && newDoc.url.match(/\.(jpeg|jpg|png|webp|avif)/i) ? newDoc.url : undefined),
            addedAt: new Date().toISOString()
        };

        setProjectContext(prev => ({
            ...prev,
            designDocuments: [...(prev.designDocuments || []), docRecord]
        }));
        setIsAdding(false);
        setNewDoc({ roomName: 'Overall', title: '', url: '', docType: '3d_render', thumbnailUrl: '' });
        showToast('✅ Deliverable saved & synced to Client Portal');
    };

    const handleDelete = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setProjectContext(prev => ({
            ...prev,
            designDocuments: (prev.designDocuments || []).filter(d => d.id !== id)
        }));
        if (lightboxIndex !== null) setLightboxIndex(null);
        showToast('🗑️ Deliverable removed');
    };

    const handleCopyLink = (url: string, title: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        navigator.clipboard.writeText(url).then(() => {
            showToast(`📋 Direct link for "${title}" copied to clipboard`);
        }).catch(() => {
            showToast('⚠️ Could not copy link automatically');
        });
    };

    // Filter docs
    const filteredDocs = docs.filter(d => {
        // Search filter
        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase();
            const matchesTitle = d.title.toLowerCase().includes(q);
            const matchesRoom = d.roomName.toLowerCase().includes(q);
            const matchesUrl = (d.url || '').toLowerCase().includes(q);
            if (!matchesTitle && !matchesRoom && !matchesUrl) return false;
        }
        // Type filter
        if (selectedTypeFilter !== 'all') {
            const docType = d.docType || '3d_render';
            if (docType !== selectedTypeFilter) return false;
        }
        // Room filter
        if (selectedRoomFilter !== 'all' && d.roomName !== selectedRoomFilter) {
            return false;
        }
        return true;
    });

    // Group by room
    const groupedDocs = filteredDocs.reduce((acc, doc) => {
        const room = doc.roomName || 'Overall';
        if (!acc[room]) acc[room] = [];
        acc[room].push(doc);
        return acc;
    }, {} as Record<string, ExtendedDesignDocument[]>);

    const renderCount = docs.filter(d => d.docType === '3d_render' || !d.docType).length;
    const gfcCount = docs.filter(d => d.docType === 'gfc_drawing').length;
    const layoutCount = docs.filter(d => d.docType === 'layout').length;
    const moodboardCount = docs.filter(d => d.docType === 'moodboard').length;

    const availableRooms = Array.from(new Set([
        'Overall',
        ...(projectContext.rooms?.map(r => r.name) || []),
        ...docs.map(d => d.roomName)
    ].filter(Boolean)));

    const activeLightboxDoc = lightboxIndex !== null && filteredDocs[lightboxIndex] ? filteredDocs[lightboxIndex] : null;

    const isDirectImage = (docItem: ExtendedDesignDocument) => {
        return Boolean(docItem.thumbnailUrl || (docItem.url && docItem.url.match(/\.(jpeg|jpg|png|webp|avif)/i)));
    };

    const getDocTypeBadge = (type?: string) => {
        switch (type) {
            case '3d_render':
                return { label: '3D Render', bg: 'bg-amber-500 text-slate-950 font-black' };
            case 'gfc_drawing':
                return { label: 'GFC Drawing', bg: 'bg-[#0066CC] text-white font-black' };
            case 'layout':
                return { label: '2D Layout', bg: 'bg-indigo-600 text-white font-black' };
            case 'moodboard':
                return { label: 'Moodboard', bg: 'bg-emerald-600 text-white font-black' };
            default:
                return { label: '3D Render', bg: 'bg-amber-500 text-slate-950 font-black' };
        }
    };

    return (
        <div className="space-y-5 w-full text-left">
            {/* Toast Banner */}
            <AnimatePresence>
                {toastMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs font-bold flex items-center gap-2"
                    >
                        <span>{toastMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Metrics Dashboard & High-Density Action Bar */}
            <div className="bg-white/90 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/60">
                                Design Deliverables Vault
                            </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold tracking-tight mt-1 text-slate-900">
                            3D Renders & Technical Drawings
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-1 max-w-2xl leading-relaxed">
                            Centralized repository for high-resolution 3D perspectives, GFC working sheets, and 2D layouts. All published files automatically reflect on the Client Portal.
                        </p>
                    </div>

                    <button 
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
                    >
                        {isAdding ? 'Cancel Add' : <><Plus className="w-4 h-4" /> Add 3D Render / Drawing</>}
                    </button>
                </div>

                {/* Metric Filter Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    {[
                        { id: '3d_render', label: '3D Renders', count: renderCount, icon: ImageIcon, activeBg: 'bg-amber-50 border-amber-300 text-amber-900', dot: 'bg-amber-500' },
                        { id: 'gfc_drawing', label: 'GFC Drawings', count: gfcCount, icon: Layers, activeBg: 'bg-blue-50 border-blue-300 text-blue-900', dot: 'bg-[#0066CC]' },
                        { id: 'layout', label: '2D Layouts', count: layoutCount, icon: FileText, activeBg: 'bg-indigo-50 border-indigo-300 text-indigo-900', dot: 'bg-indigo-500' },
                        { id: 'moodboard', label: 'Moodboards', count: moodboardCount, icon: Sparkles, activeBg: 'bg-emerald-50 border-emerald-300 text-emerald-900', dot: 'bg-emerald-500' }
                    ].map(card => {
                        const isSelected = selectedTypeFilter === card.id;
                        return (
                            <button
                                key={card.id}
                                type="button"
                                onClick={() => setSelectedTypeFilter(isSelected ? 'all' : card.id)}
                                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                    isSelected 
                                        ? `${card.activeBg} ring-2 ring-[#0066CC]/20 shadow-2xs` 
                                        : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/80 text-slate-700'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 flex items-center gap-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${card.dot}`} />
                                        {card.label}
                                    </span>
                                    <card.icon className="w-3.5 h-3.5 opacity-60" />
                                </div>
                                <div className="text-xl font-extrabold font-mono text-slate-900 mt-2 tabular-nums">
                                    {card.count}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/*
                Site photo album — one Drive link, not a file store.

                The portal carried a "Site feed" lens that filtered the project
                spine down to site updates. It subtracted from a page rather
                than adding a view, and progress photographs belong somewhere
                built for albums. Set the folder link once and the client opens
                it from Design & Scope; leave it blank and nothing is shown.
            */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-[#0066CC] flex items-center justify-center shrink-0">
                            <Camera className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-900 tracking-tight">Site Progress Photos</h4>
                            {sitePhotos ? (
                                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed break-all">
                                    {sitePhotos.label ? <span className="font-bold text-slate-700">{sitePhotos.label} · </span> : null}
                                    <span className="text-slate-400">{sitePhotos.url}</span>
                                    {sitePhotos.updatedAt && (
                                        <span className="block text-slate-400 mt-0.5">
                                            Linked {new Date(sitePhotos.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · visible on the Client Portal
                                        </span>
                                    )}
                                </p>
                            ) : (
                                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed max-w-xl">
                                    Keep the album in Google Drive and link it here. Nothing is shown to the client until a link is set.
                                </p>
                            )}
                        </div>
                    </div>

                    {!editingPhotos && (
                        <div className="flex items-center gap-2 shrink-0">
                            {sitePhotos && (
                                <a
                                    href={sitePhotos.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" /> Open album
                                </a>
                            )}
                            <button
                                type="button"
                                onClick={openPhotoEditor}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0066CC] hover:bg-[#0055B3] text-white shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                            >
                                {sitePhotos ? 'Change link' : 'Link Drive album'}
                            </button>
                        </div>
                    )}
                </div>

                <AnimatePresence>
                    {editingPhotos && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 mt-4 border-t border-slate-100">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        Google Drive folder link
                                    </label>
                                    <input
                                        type="url"
                                        value={photoDraft.url}
                                        onChange={e => setPhotoDraft({ ...photoDraft, url: e.target.value })}
                                        placeholder="https://drive.google.com/drive/folders/..."
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-[#0066CC] outline-none"
                                    />
                                    <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                                        Set the folder to &ldquo;Anyone with the link can view&rdquo; in Drive, or the client lands on a request-access screen.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        Label <span className="text-slate-400 font-medium normal-case tracking-normal">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={photoDraft.label}
                                        onChange={e => setPhotoDraft({ ...photoDraft, label: e.target.value })}
                                        placeholder="Weekly site progress"
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-[#0066CC] outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={saveSitePhotos}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0066CC] hover:bg-[#0055B3] text-white shadow-2xs transition-colors cursor-pointer"
                                >
                                    Save link
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingPhotos(false)}
                                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                {sitePhotos && (
                                    <button
                                        type="button"
                                        onClick={removeSitePhotos}
                                        className="ml-auto px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    >
                                        Remove from portal
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Add Deliverable Drawer / Form */}
            <AnimatePresence>
                {isAdding && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white p-5 rounded-2xl border-2 border-[#0066CC]/30 shadow-md space-y-4 overflow-hidden"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                Upload & Sync New Deliverable
                            </h4>
                            <span className="text-[11px] text-slate-400 font-medium">Instantly updates Client Portal</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                    Document Type
                                </label>
                                <select
                                    value={newDoc.docType}
                                    onChange={e => setNewDoc({ ...newDoc, docType: e.target.value as any })}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#0066CC] outline-none"
                                >
                                    <option value="3d_render">🎨 3D Render / Visual Perspective</option>
                                    <option value="gfc_drawing">📐 GFC Working Drawing / Detail Sheet</option>
                                    <option value="layout">📑 2D Layout / Furniture Plan</option>
                                    <option value="moodboard">🪵 Moodboard & Material Specs</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                    Room / Zone
                                </label>
                                <select
                                    value={newDoc.roomName}
                                    onChange={e => setNewDoc({ ...newDoc, roomName: e.target.value })}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#0066CC] outline-none"
                                >
                                    {availableRooms.map(room => (
                                        <option key={room} value={room}>{room}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                    Deliverable Title
                                </label>
                                <input 
                                    type="text" 
                                    value={newDoc.title}
                                    onChange={e => setNewDoc({ ...newDoc, title: e.target.value })}
                                    placeholder="e.g. Master Bedroom 3D View 1, Crockery Unit Detail"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-[#0066CC] outline-none"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                    Document Link (Google Drive / Figma / Image URL)
                                </label>
                                <input 
                                    type="url" 
                                    value={newDoc.url}
                                    onChange={e => setNewDoc({ ...newDoc, url: e.target.value })}
                                    placeholder="https://drive.google.com/... or direct image link"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-[#0066CC] outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                    Thumbnail Image Link (Optional)
                                </label>
                                <input 
                                    type="url" 
                                    value={newDoc.thumbnailUrl}
                                    onChange={e => setNewDoc({ ...newDoc, thumbnailUrl: e.target.value })}
                                    placeholder="https://... (Direct image preview URL)"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-[#0066CC] outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button 
                                type="button"
                                onClick={handleSave}
                                className="flex items-center gap-2 px-5 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl transition-colors shadow-2xs cursor-pointer"
                            >
                                <Plus className="w-4 h-4" /> Save & Sync to Client
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Filter & Live Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text"
                        placeholder="Search deliverables by title, room, or link..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                    />
                    {searchQuery && (
                        <button 
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Filters & View Toggle */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Type Filter Pills */}
                    <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
                        {[
                            { id: 'all', label: 'All' },
                            { id: '3d_render', label: '3D Renders' },
                            { id: 'gfc_drawing', label: 'GFCs' },
                            { id: 'layout', label: '2D Plans' }
                        ].map(f => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setSelectedTypeFilter(f.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    selectedTypeFilter === f.id
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Room Selector */}
                    <select
                        value={selectedRoomFilter}
                        onChange={e => setSelectedRoomFilter(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                    >
                        <option value="all">All Rooms</option>
                        {availableRooms.map(room => (
                            <option key={room} value={room}>{room}</option>
                        ))}
                    </select>

                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white text-[#0066CC] shadow-2xs' : 'text-slate-400 hover:text-slate-700'}`}
                            title="Grid View"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white text-[#0066CC] shadow-2xs' : 'text-slate-400 hover:text-slate-700'}`}
                            title="Compact List View"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Document Deliverables Gallery */}
            {filteredDocs.length === 0 ? (
                <div className="text-center py-16 bg-white/90 border border-dashed border-slate-200/90 rounded-2xl space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                        <ImageIcon className="w-6 h-6" />
                    </div>
                    <p className="text-slate-800 font-bold text-sm">No 3D renders or drawings match your search.</p>
                    <p className="text-xs text-slate-400">Click &quot;Add 3D Render / Drawing&quot; above to link new files.</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="space-y-6">
                    {Object.entries(groupedDocs).map(([roomName, roomDocs]) => (
                        <div key={roomName} className="space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                                    {roomName}
                                </h4>
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {roomDocs.length} {roomDocs.length === 1 ? 'deliverable' : 'deliverables'}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                                {roomDocs.map(doc => {
                                    const hasImg = isDirectImage(doc);
                                    const badge = getDocTypeBadge(doc.docType);
                                    const docIndex = filteredDocs.findIndex(fd => fd.id === doc.id);

                                    return (
                                        <motion.div 
                                            key={doc.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.98 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-2xs hover:shadow-md transition-all group flex flex-col justify-between"
                                        >
                                            {/* Thumbnail / Image Box */}
                                            <div 
                                                className="aspect-16/10 bg-slate-100 relative overflow-hidden flex items-center justify-center cursor-pointer"
                                                onClick={() => setLightboxIndex(docIndex >= 0 ? docIndex : null)}
                                            >
                                                {hasImg ? (
                                                    <img 
                                                        src={doc.thumbnailUrl || doc.url} 
                                                        alt={doc.title} 
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center p-4 text-center">
                                                        <FileText className="w-8 h-8 text-slate-300 mb-1" />
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Document Sheet</span>
                                                    </div>
                                                )}

                                                <span className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider shadow-2xs ${badge.bg}`}>
                                                    {badge.label}
                                                </span>

                                                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setLightboxIndex(docIndex >= 0 ? docIndex : null);
                                                        }}
                                                        className="p-2 bg-white text-slate-900 rounded-lg shadow-md hover:bg-slate-100 transition-colors cursor-pointer"
                                                        title="Preview Deliverable"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleCopyLink(doc.url, doc.title, e)}
                                                        className="p-2 bg-white text-slate-900 rounded-lg shadow-md hover:bg-slate-100 transition-colors cursor-pointer"
                                                        title="Copy Share Link"
                                                    >
                                                        <Copy className="w-4 h-4 text-[#0066CC]" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Details & Footer */}
                                            <div className="p-3.5 flex flex-col justify-between flex-1 gap-2.5">
                                                <div>
                                                    <h5 className="font-bold text-slate-900 text-xs line-clamp-2" title={doc.title}>
                                                        {doc.title}
                                                    </h5>
                                                    <span className="text-[10px] text-slate-400 mt-0.5 block font-medium">
                                                        {doc.addedAt ? new Date(doc.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Design Deliverable'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                                    <a 
                                                        href={doc.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0066CC] hover:underline"
                                                    >
                                                        <span>Open Link</span>
                                                        <ArrowUpRight className="w-3 h-3" />
                                                    </a>

                                                    <div className="flex items-center gap-1">
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => handleCopyLink(doc.url, doc.title, e)}
                                                            className="p-1 text-slate-400 hover:text-[#0066CC] rounded transition-colors cursor-pointer"
                                                            title="Copy Link"
                                                        >
                                                            <Share2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => handleDelete(doc.id, e)}
                                                            className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                                            title="Delete File"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* Compact List View */
                <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
                    <div className="divide-y divide-slate-100">
                        {filteredDocs.map((doc) => {
                            const badge = getDocTypeBadge(doc.docType);
                            const docIndex = filteredDocs.findIndex(fd => fd.id === doc.id);

                            return (
                                <div key={doc.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div 
                                            className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer"
                                            onClick={() => setLightboxIndex(docIndex >= 0 ? docIndex : null)}
                                        >
                                            {isDirectImage(doc) ? (
                                                <img src={doc.thumbnailUrl || doc.url} alt={doc.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <FileText className="w-5 h-5 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <h5 className="font-bold text-slate-900 text-xs truncate">{doc.title}</h5>
                                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-medium">
                                                <span className="font-bold text-slate-600">{doc.roomName || 'Overall'}</span>
                                                <span>•</span>
                                                <span>{doc.addedAt ? new Date(doc.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Design File'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider ${badge.bg}`}>
                                            {badge.label}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => setLightboxIndex(docIndex >= 0 ? docIndex : null)}
                                            className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                                            title="Preview"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={(e) => handleCopyLink(doc.url, doc.title, e)}
                                            className="p-1.5 text-[#0066CC] hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                                            title="Copy Share Link"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>

                                        <a 
                                            href={doc.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                                            title="Open External Link"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </a>

                                        <button
                                            type="button"
                                            onClick={(e) => handleDelete(doc.id, e)}
                                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Interactive Lightbox Preview Modal */}
            <AnimatePresence>
                {activeLightboxDoc && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
                        onClick={() => setLightboxIndex(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider ${getDocTypeBadge(activeLightboxDoc.docType).bg}`}>
                                            {getDocTypeBadge(activeLightboxDoc.docType).label}
                                        </span>
                                        <span className="text-xs font-bold text-slate-500">{activeLightboxDoc.roomName || 'Overall'}</span>
                                    </div>
                                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate mt-0.5">{activeLightboxDoc.title}</h3>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                        type="button"
                                        onClick={(e) => handleCopyLink(activeLightboxDoc.url, activeLightboxDoc.title, e)}
                                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                        <Share2 className="w-3.5 h-3.5 text-[#0066CC]" />
                                        <span>Share Link</span>
                                    </button>

                                    <a 
                                        href={activeLightboxDoc.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="px-3 py-1.5 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                        <span>Open Original</span>
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>

                                    <button 
                                        type="button"
                                        onClick={() => setLightboxIndex(null)}
                                        className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body / Image Stage */}
                            <div className="flex-1 bg-slate-950 flex items-center justify-center p-4 min-h-[320px] max-h-[65vh] relative overflow-hidden">
                                {isDirectImage(activeLightboxDoc) ? (
                                    <img 
                                        src={activeLightboxDoc.thumbnailUrl || activeLightboxDoc.url} 
                                        alt={activeLightboxDoc.title} 
                                        className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                                    />
                                ) : (
                                    <div className="text-center p-8 text-white space-y-3">
                                        <FileText className="w-16 h-16 text-slate-500 mx-auto" />
                                        <p className="text-sm font-bold">External Document / Cloud Folder</p>
                                        <p className="text-xs text-slate-400 max-w-sm mx-auto">This file is hosted externally on Google Drive or Figma. Click below to view the sheet in a new browser window.</p>
                                        <a 
                                            href={activeLightboxDoc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold text-xs rounded-xl shadow-md transition-all"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            <span>Open Document in New Tab</span>
                                        </a>
                                    </div>
                                )}

                                {/* Prev / Next Step Buttons */}
                                {lightboxIndex !== null && filteredDocs.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setLightboxIndex(lightboxIndex > 0 ? lightboxIndex - 1 : filteredDocs.length - 1);
                                            }}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white transition-all cursor-pointer shadow-lg"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setLightboxIndex(lightboxIndex < filteredDocs.length - 1 ? lightboxIndex + 1 : 0);
                                            }}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white transition-all cursor-pointer shadow-lg"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                                <span>Item {lightboxIndex! + 1} of {filteredDocs.length}</span>
                                <span>{activeLightboxDoc.addedAt ? `Added on ${new Date(activeLightboxDoc.addedAt).toLocaleDateString('en-IN')}` : ''}</span>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
