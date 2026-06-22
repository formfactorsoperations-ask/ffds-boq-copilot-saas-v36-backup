import React, { useState, useEffect } from 'react';
import { MOM, MOMActionItem } from '../../types';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, auth } from '../../services/firebaseClient';
import { CheckCircle2, Circle, Clock, MessageCircle, AlertTriangle, ExternalLink, Calendar, Search, Filter, Trash2, FileText } from 'lucide-react';
import { MomReviewModal } from './MomReviewModal';

interface MomActionTrackerProps {
  projectId: string;
  studioId: string;
  onOpenMom?: (momId: string) => void;
}

export function MomActionTracker({ projectId, studioId, onOpenMom }: MomActionTrackerProps) {
  const [moms, setMoms] = useState<MOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'actions' | 'history'>('actions');
  const [filter, setFilter] = useState<'open' | 'overdue' | 'mine' | 'client' | 'ffds'>('open');
  const [selectedMomId, setSelectedMomId] = useState<string | null>(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!projectId || !studioId) return;
    const q = query(collection(db, `organizations/${studioId}/projects/${projectId}/moms`), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
       const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as MOM)).filter(m => m.status !== 'draft');
       setMoms(data);
       setLoading(false);
    });
    return () => unsub();
  }, [projectId, studioId]);

  const toggleActionStatus = async (momId: string, actionId: string, currentStatus: string) => {
    const mom = moms.find(m => m.id === momId);
    if (!mom) return;
    const items = mom.actionItems || [];
    const idx = items.findIndex(a => a.id === actionId);
    if (idx === -1) return;
    const newItems = [...items];
    newItems[idx].status = currentStatus === 'open' ? 'done' : 'open';
    await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, momId), {
       actionItems: newItems
    });
  };

  const deleteMom = async (momId: string) => {
    if (window.confirm('Are you sure you want to delete this Minutes of Meeting? This action cannot be undone.')) {
        try {
            await deleteDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, momId));
        } catch (error) {
            console.error("Error deleting MoM: ", error);
            alert("Failed to delete MoM. Please try again.");
        }
    }
  };

  const getFilteredActions = () => {
     let allActions: { action: MOMActionItem, mom: MOM }[] = [];
     moms.forEach(mom => {
         (mom.actionItems || []).forEach(a => {
             allActions.push({ action: a, mom });
         });
     });

     const now = Date.now();

     return allActions.filter(({ action }) => {
         if (filter === 'open' && action.status !== 'open') return false;
         if (filter === 'overdue') {
             if (action.status !== 'open') return false;
             if (!action.dueDate || action.dueDate > now) return false;
         }
         if (filter === 'mine') {
             // simplified logic; assumes owner is ffds or logged in user logic can apply
             if (action.owner !== 'ffds') return false; 
         }
         if (filter === 'client' && action.owner !== 'client') return false;
         if (filter === 'ffds' && action.owner !== 'ffds') return false;
         return true;
     }).sort((a, b) => {
         const tA = a.action.dueDate || 0;
         const tB = b.action.dueDate || 0;
         if (tA === tB) return b.mom.meetingDate - a.mom.meetingDate;
         if (!tA) return 1;
         if (!tB) return -1;
         return tA - tB;
     });
  };

  const filtered = getFilteredActions();
  const openCount = moms.reduce((acc, m) => acc + (m.actionItems?.filter(a => a.status === 'open').length || 0), 0);

  if (loading) {
      return <div className="p-8 text-center text-slate-500">Loading Tracker...</div>;
  }


  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[500px] flex flex-col">
       <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div>
               <h2 className="text-xl font-bold text-slate-900 font-serif">MOMs & Actions</h2>
               {viewMode === 'actions' ? (
                   <p className="text-sm text-slate-500">{openCount} open actions across all meetings</p>
               ) : (
                   <p className="text-sm text-slate-500">{moms.length} total meetings recorded</p>
               )}
           </div>
           
           <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
               <div className="flex bg-slate-100 p-1 rounded-lg">
                   <button 
                       onClick={() => setViewMode('actions')}
                       className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition ${viewMode === 'actions' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                       Action Tracker
                   </button>
                   <button 
                       onClick={() => setViewMode('history')}
                       className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition ${viewMode === 'history' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                       MOM History
                   </button>
               </div>

               {viewMode === 'actions' && (
                   <div className="flex bg-slate-100 p-1 rounded-lg">
                       <FilterButton active={filter === 'open'} onClick={() => setFilter('open')}>Open ({openCount})</FilterButton>
                       <FilterButton active={filter === 'overdue'} onClick={() => setFilter('overdue')}>Overdue</FilterButton>
                       <FilterButton active={filter === 'client'} onClick={() => setFilter('client')}>Client Action</FilterButton>
                       <FilterButton active={filter === 'ffds'} onClick={() => setFilter('ffds')}>FFDS Action</FilterButton>
                   </div>
               )}
           </div>
       </div>

       <div className="flex-1 overflow-y-auto w-full p-0">
           {viewMode === 'actions' ? (
               filtered.length === 0 ? (
                   <div className="p-10 text-center text-slate-500">
                       <CheckCircle2 size={40} className="mx-auto text-emerald-200 mb-3" />
                       <p className="font-medium text-slate-700">All caught up & clear!</p>
                       <p className="text-sm mt-1">No actions match your current filter.</p>
                   </div>
               ) : (
                   <table className="w-full text-left border-collapse">
                       <thead className="bg-[#f8fafc] sticky top-0 z-10 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                           <tr>
                               <th className="py-3 px-4 border-b">Status</th>
                               <th className="py-3 px-4 border-b max-w-sm">Task</th>
                               <th className="py-3 px-4 border-b">Owner</th>
                               <th className="py-3 px-4 border-b">Due Date</th>
                               <th className="py-3 px-4 border-b">Source</th>
                               <th className="py-3 px-4 border-b text-right">Nudge</th>
                           </tr>
                       </thead>
                       <tbody className="text-sm border-b border-slate-100">
                           {filtered.map(({ action, mom }, idx) => {
                               const isOverdue = action.status === 'open' && action.dueDate && action.dueDate < Date.now();
                               
                               return (
                                   <tr key={`${mom.id}-${action.id}`} className="hover:bg-indigo-50/30 transition-colors border-b border-slate-50">
                                       <td className="py-3 px-4">
                                           <button onClick={() => toggleActionStatus(mom.id, action.id, action.status)} className="flex items-center justify-center p-1 hover:scale-110 transition cursor-pointer">
                                               {action.status === 'done' ? (
                                                   <CheckCircle2 size={20} className="text-emerald-500" />
                                               ) : (
                                                   <Circle size={20} className="text-slate-300 hover:text-indigo-400" />
                                               )}
                                           </button>
                                       </td>
                                       <td className="py-3 px-4 max-w-sm">
                                           <span className={`font-medium ${action.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                               {action.text}
                                           </span>
                                           {action.flags?.scope && <span className="ml-2 inline-block px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-md uppercase font-bold tracking-widest">Scope</span>}
                                           {action.flags?.cost && <span className="ml-2 inline-block px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-md uppercase font-bold tracking-widest">Cost</span>}
                                       </td>
                                       <td className="py-3 px-4">
                                           <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${action.owner === 'client' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-700'}`}>
                                               {action.owner || 'unknown'}
                                           </span>
                                       </td>
                                       <td className="py-3 px-4">
                                           {action.dueDate ? (
                                               <span className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                                                   <Calendar size={14} />
                                                   {new Date(action.dueDate).toLocaleDateString('en-GB')}
                                                   {isOverdue && <AlertTriangle size={14} className="ml-1 text-red-500" />}
                                               </span>
                                           ) : <span className="text-slate-400 italic text-xs">No date</span>}
                                       </td>
                                       <td className="py-3 px-4">
                                           <button 
                                               onClick={() => onOpenMom ? onOpenMom(mom.id) : setSelectedMomId(mom.id)}
                                               className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-xs font-semibold uppercase tracking-wider"
                                           >
                                               <ExternalLink size={14} />
                                               {mom.momRef || 'View MoM'}
                                           </button>
                                           <p className="text-[10px] text-slate-400 font-medium">
                                              {new Date(mom.meetingDate).toLocaleDateString('en-GB')}
                                           </p>
                                       </td>
                                       <td className="py-3 px-4 text-right">
                                           {(isOverdue && action.owner === 'client') ? (
                                               <a 
                                                  href={`https://wa.me/?text=${encodeURIComponent(`Hi! Gentle remainder regarding an action item tracking from our meeting on ${new Date(mom.meetingDate).toLocaleDateString('en-GB')}:\n\n- ${action.text}`)}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 px-2 py-1 rounded text-xs font-bold"
                                               >
                                                   <MessageCircle size={14} /> Remind
                                               </a>
                                           ) : null}
                                       </td>
                                   </tr>
                               )
                           })}
                       </tbody>
                   </table>
               )
           ) : (
               moms.length === 0 ? (
                   <div className="p-10 text-center text-slate-500">
                       <FileText size={40} className="mx-auto text-slate-200 mb-3" />
                       <p className="font-medium text-slate-700">No Meetings Recorded</p>
                       <p className="text-sm mt-1">Capture a meeting to see it here.</p>
                   </div>
               ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                       {moms.map((mom) => (
                           <div key={mom.id} className="border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-white flex flex-col justify-between group">
                               <div>
                                   <div className="flex justify-between items-start mb-3">
                                       <div>
                                           <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                               {mom.momRef}
                                           </h3>
                                           <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                                               <Calendar size={12} />
                                               {new Date(mom.meetingDate).toLocaleDateString('en-GB')}
                                           </p>
                                       </div>
                                       <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider
                                           ${mom.status === 'acknowledged' ? 'bg-emerald-100 text-emerald-700' : 
                                             mom.status === 'shared' ? 'bg-indigo-100 text-indigo-700' : 
                                             mom.status === 'finalised' ? 'bg-blue-100 text-blue-700' : 
                                             'bg-slate-100 text-slate-600'}`}
                                       >
                                           {mom.status}
                                       </span>
                                   </div>
                                   <p className="text-sm text-slate-700 font-medium line-clamp-2 mb-4">
                                       {mom.meetingTitle}
                                   </p>

                                   <div className="flex gap-4 text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                       <div className="flex flex-col">
                                           <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Decisions</span>
                                           <span className="font-semibold text-slate-800">{mom.decisions?.length || 0}</span>
                                       </div>
                                       <div className="w-px bg-slate-200"></div>
                                       <div className="flex flex-col">
                                           <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Actions</span>
                                           <span className="font-semibold text-slate-800">{mom.actionItems?.length || 0}</span>
                                       </div>
                                       <div className="w-px bg-slate-200"></div>
                                       <div className="flex flex-col">
                                           <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Open Tasks</span>
                                           <span className="font-semibold text-amber-600">{mom.actionItems?.filter(a => a.status === 'open').length || 0}</span>
                                       </div>
                                   </div>
                               </div>

                               <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-100">
                                    <button 
                                        onClick={() => onOpenMom ? onOpenMom(mom.id) : setSelectedMomId(mom.id)}
                                        className="text-indigo-600 hover:text-indigo-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                                    >
                                        <ExternalLink size={14} /> View Details
                                    </button>
                                    <button 
                                        onClick={() => deleteMom(mom.id)}
                                        className="text-slate-400 hover:text-red-600 transition-colors p-1"
                                        title="Delete MoM"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                               </div>
                           </div>
                       ))}
                   </div>
               )
           )}
       </div>
       {selectedMomId && (
           <MomReviewModal 
               mom={moms.find(m => m.id === selectedMomId)!}
               projectId={projectId}
               studioId={studioId}
               onClose={() => setSelectedMomId(null)}
           />
       )}
    </div>
  );
}

function FilterButton({ active, onClick, children }: any) {
    return (
        <button 
            onClick={onClick}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition ${active ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
        >
            {children}
        </button>
    )
}
