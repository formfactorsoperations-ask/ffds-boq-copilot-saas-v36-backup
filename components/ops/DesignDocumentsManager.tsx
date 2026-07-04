import React, { useState } from 'react';
import { ProjectContext, DesignDocument } from '../../types';
import { id as generateId } from '../../lib/utils';
import { Folder, Link as LinkIcon, Trash2, Plus, ArrowUpRight } from 'lucide-react';

interface DesignDocumentsManagerProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function DesignDocumentsManager({ projectContext, setProjectContext }: DesignDocumentsManagerProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newDoc, setNewDoc] = useState<Partial<DesignDocument>>({
        roomName: '',
        title: '',
        url: ''
    });

    const docs = projectContext.designDocuments || [];

    const handleSave = () => {
        if (!newDoc.roomName || !newDoc.title || !newDoc.url) {
            alert('Please fill all fields');
            return;
        }

        const docRecord: DesignDocument = {
            id: generateId(),
            roomName: newDoc.roomName,
            title: newDoc.title,
            url: newDoc.url,
            addedAt: new Date().toISOString()
        };

        setProjectContext(prev => ({
            ...prev,
            designDocuments: [...(prev.designDocuments || []), docRecord]
        }));
        setIsAdding(false);
        setNewDoc({ roomName: '', title: '', url: '' });
    };

    const handleDelete = (id: string) => {
        setProjectContext(prev => ({
            ...prev,
            designDocuments: (prev.designDocuments || []).filter(d => d.id !== id)
        }));
    };

    // Group by room
    const groupedDocs = docs.reduce((acc, doc) => {
        if (!acc[doc.roomName]) acc[doc.roomName] = [];
        acc[doc.roomName].push(doc);
        return acc;
    }, {} as Record<string, DesignDocument[]>);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-indigo-900">Approved Design Documents</h3>
                    <p className="text-sm text-slate-500">Share Google Drive links to finalized PDFs with the client securely.</p>
                </div>
                <button 
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-950 text-white text-sm font-bold rounded-lg hover:bg-indigo-900 transition-colors"
                >
                    {isAdding ? 'Cancel' : <><Plus className="w-4 h-4" /> Add Document Link</>}
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Room / Category</label>
                            <input 
                                type="text" 
                                value={newDoc.roomName}
                                onChange={e => setNewDoc({...newDoc, roomName: e.target.value})}
                                placeholder="e.g., Master Bedroom or Overall"
                                list="roomNames"
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <datalist id="roomNames">
                                <option value="Overall" />
                                {projectContext.rooms?.map(r => <option key={r.name} value={r.name} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Document Title</label>
                            <input 
                                type="text" 
                                value={newDoc.title}
                                onChange={e => setNewDoc({...newDoc, title: e.target.value})}
                                placeholder="e.g., 2D Furniture Layout, False Ceiling Plan"
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Google Drive Link</label>
                            <input 
                                type="url" 
                                value={newDoc.url}
                                onChange={e => setNewDoc({...newDoc, url: e.target.value})}
                                placeholder="https://drive.google.com/..."
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end pt-2">
                        <button 
                            onClick={handleSave}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            Save Link
                        </button>
                    </div>
                </div>
            )}

            {Object.keys(groupedDocs).length === 0 ? (
                <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl border-dashed">
                    <Folder className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No design documents shared yet.</p>
                    <p className="text-sm text-slate-400 mt-1">Links added here will be available to the client.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(groupedDocs).map(([roomName, roomDocs]) => (
                        <div key={roomName} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center justify-between">
                                <h4 className="font-bold text-indigo-900">{roomName}</h4>
                                <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                                    {roomDocs.length} {roomDocs.length === 1 ? 'Doc' : 'Docs'}
                                </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {roomDocs.map(doc => (
                                    <div key={doc.id} className="p-4 flex items-center justify-between group hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-start gap-3 overflow-hidden">
                                            <div className="mt-1 drop-shadow-sm min-w-fit">
                                                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                                                    <LinkIcon className="w-4 h-4" />
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-indigo-950 text-sm truncate" title={doc.title}>{doc.title}</p>
                                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-700 hover:underline flex items-center gap-1 mt-0.5 truncate">
                                                    View Document <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                                                </a>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(doc.id)}
                                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                            title="Delete Link"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
