import React, { useState } from 'react';
import { Loader2, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { createMoMFromNotes, createEmptyMoM } from '../../services/momService';
import { SiteVisit, MOM } from '../../types';
import { auth } from '../../services/firebaseClient';

interface MomCaptureModalProps {
  visit: SiteVisit;
  projectId: string;
  studioId: string;
  projectContextName: string;
  onClose: () => void;
  onSuccess: (momId: string) => void;
}

export function MomCaptureModal({ visit, projectId, studioId, projectContextName, onClose, onSuccess }: MomCaptureModalProps) {
  const [notes, setNotes] = useState(visit.notes || '');
  const [loading, setLoading] = useState(false);

  const safeDate = () => {
    if (!visit.date) return Date.now();
    if (typeof visit.date === 'number') return visit.date;
    if (typeof visit.date === 'object' && 'toDate' in visit.date) return visit.date.toDate().getTime();
    const parsed = new Date(visit.date as string).getTime();
    return isNaN(parsed) ? Date.now() : parsed;
  };

  const handleStructureWithAI = async () => {
    if (!notes.trim()) return;
    setLoading(true);
    try {
      const momId = await createMoMFromNotes(
        studioId,
        projectId,
        projectContextName,
        visit.id,
        visit.type,
        visit.title,
        safeDate(),
        notes,
        visit.attendees?.join(', ') || '',
        auth.currentUser?.uid || 'unknown'
      );
      onSuccess(momId);
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to generate MoM. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipAI = async () => {
    setLoading(true);
    try {
      const momId = await createEmptyMoM(
        studioId,
        projectId,
        visit.id,
        visit.type,
        visit.title,
        safeDate(),
        auth.currentUser?.uid || 'unknown',
        visit.attendees || []
      );
      onSuccess(momId);
    } catch (error: any) {
      console.error(error);
      alert("Failed to create MoM draft");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
         {loading ? (
           <div className="p-16 flex flex-col items-center justify-center text-center space-y-4">
             <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-2">
               <Sparkles className="animate-pulse" size={32} />
             </div>
             <h2 className="text-2xl font-bold text-slate-900">Structuring Intelligence...</h2>
             <p className="text-slate-500 max-w-xs">Organizing your notes into actionable decisions, flags, and tasks.</p>
           </div>
         ) : (
           <>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-[#f1f5f9]">
               <div>
                  <h2 className="text-xl font-bold text-slate-900">Capture the meeting</h2>
                  <p className="text-sm text-slate-500 mt-1">Refining notes for: {visit.title}</p>
               </div>
               <button onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-white rounded-full p-2 shadow-sm">✕</button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
               <label className="block text-sm font-bold text-slate-700 mb-2">Raw Transcripts & Notes</label>
               <textarea
                 value={notes}
                 onChange={e => setNotes(e.target.value)}
                 className="w-full h-64 border border-slate-200 rounded-xl p-4 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-colors text-slate-700 text-sm"
                 placeholder="Type, paste, or drop a voice-note transcript. Don't worry about formatting."
               />
               <div className="flex items-center gap-2 mt-3 text-xs text-slate-500 font-medium">
                  <FileText size={14} /> Optional: paste transcript text here.
               </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-[#f1f5f9] flex flex-col gap-4">
               <button
                 onClick={handleStructureWithAI}
                 disabled={!notes.trim()}
                 className="w-full py-4 bg-[#1e3a8a] text-white rounded-xl font-bold text-lg hover:bg-[#1e3a8a]/90 transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
               >
                 <Sparkles size={20} /> Structure with AI
               </button>
               <button onClick={handleSkipAI} className="text-sm text-slate-500 font-bold hover:text-slate-800 transition">
                 Skip AI, write manually
               </button>
            </div>
           </>
         )}
      </div>
    </div>
  );
}
