import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import { SiteVisitType, SiteVisit, MOM } from '../types';
import { Calendar, Clock, MapPin, X, Users, Loader2, Video, FileText, CheckCircle2, ChevronRight, Download } from 'lucide-react';
import { updateCalendarEventNotes } from '../services/siteVisitService';
import { useStudioSettings } from '../hooks/useStudioSettings';
import { MomCaptureModal } from '../components/ops/MomCaptureModal';
import { MomReviewModal } from '../components/ops/MomReviewModal';

export default function SiteVisitHistory({ 
  projectId, 
  studioId,
  onClose,
  projectContext 
}: { 
  projectId: string, 
  studioId: string,
  onClose: () => void,
  projectContext?: any
}) {
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [moms, setMoms] = useState<MOM[]>([]);
  const [loading, setLoading] = useState(true);
  const { settings } = useStudioSettings(studioId);

  const [captureVisit, setCaptureVisit] = useState<SiteVisit | null>(null);
  const [reviewMomId, setReviewMomId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId?.trim() || !studioId?.trim()) return;

    const q = query(
      collection(db, `organizations/${studioId}/projects/${projectId}/siteVisits`),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data: SiteVisit[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as SiteVisit));
      setVisits(data);
      setLoading(false);
    });

    const mq = query(
      collection(db, `organizations/${studioId}/projects/${projectId}/moms`)
    );
    const mUnsubscribe = onSnapshot(mq, (snap) => {
      const data: MOM[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as MOM));
      setMoms(data);
    });

    return () => {
      unsubscribe();
      mUnsubscribe();
    };
  }, [projectId, studioId]);

  return (
    <div className="fixed inset-0 bg-indigo-950/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        
        <div className="p-5 border-b flex items-center justify-between bg-slate-50 rounded-t-xl">
           <div>
             <h2 className="text-xl font-bold text-indigo-950">Site Log & Meetings History</h2>
             <p className="text-sm text-slate-500 mt-1">{projectContext?.name}</p>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="relative">
                 <select 
                   className="appearance-none bg-indigo-600 text-white font-bold text-sm px-4 py-2 pr-8 rounded-lg shadow-sm outline-none cursor-pointer hover:bg-indigo-700 transition"
                   value=""
                   onChange={(e) => {
                      const v = visits.find(v => v.id === e.target.value);
                      if (v) setCaptureVisit(v);
                   }}
                 >
                    <option value="" disabled>+ New MoM</option>
                    {visits.map(v => (
                       <option key={v.id} value={v.id}>{v.title} - {new Date(v.date?.toDate ? v.date.toDate() : v.date).toLocaleDateString()}</option>
                    ))}
                 </select>
                 <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white text-xs">▼</span>
              </div>
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50"><X size={20}/></button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
          ) : visits.length === 0 ? (
            <div className="text-center p-12 text-slate-500">No site visits or meetings found.</div>
          ) : (
            <div className="space-y-6">
              {visits.map((visit) => (
                <VisitCard 
                  key={visit.id} 
                  visit={visit} 
                  mom={moms.find(m => m.meetingId === visit.id)}
                  settings={settings} 
                  projectId={projectId} 
                  studioId={studioId} 
                  projectContext={projectContext}
                  onCaptureClick={() => setCaptureVisit(visit)}
                  onReviewClick={(momId) => setReviewMomId(momId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {captureVisit && (
        <MomCaptureModal
           visit={captureVisit}
           projectId={projectId}
           studioId={studioId}
           projectContextName={projectContext?.name || 'Project'}
           onClose={() => setCaptureVisit(null)}
           onSuccess={(momId) => {
              setCaptureVisit(null);
              setReviewMomId(momId);
           }}
        />
      )}

      {reviewMomId && moms.find(m => m.id === reviewMomId) && (
        <MomReviewModal
           mom={moms.find(m => m.id === reviewMomId)!}
           projectId={projectId}
           studioId={studioId}
           onClose={() => setReviewMomId(null)}
        />
      )}
    </div>
  );
}

import { syncSiteVisitToCalendar } from '../services/siteVisitService';
import { connectGoogleCalendar } from '../services/googleCalendarService';
import { getCachedAccessToken } from '../services/authService';

function VisitCard({ visit, mom, settings, projectId, studioId, projectContext, onCaptureClick, onReviewClick }: { key?: string | number, visit: SiteVisit, mom?: MOM, settings: any, projectId: string, studioId: string, projectContext: any, onCaptureClick: () => void, onReviewClick: (momId: string) => void }) {
  const isSite = visit.type === 'site_visit';
  const dDate = visit.date?.toDate ? visit.date.toDate() : new Date(visit.date);
  
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState(visit.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      if (!projectId || !studioId || !visit.id) return;
      await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/siteVisits`, visit.id), {
        notes: notesInput
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNotes(false);
      setEditingNotes(false);
    }
  };

  const handleRetrySync = async () => {
    setIsRetrying(true);
    try {
      if (!getCachedAccessToken()) {
         const success = await connectGoogleCalendar();
         if (!success) {
           alert("Could not connect to Google Calendar.");
           setIsRetrying(false);
           return;
         }
      }
      if (!projectId || !studioId || !visit.id) return;
      
      try {
        await syncSiteVisitToCalendar(visit.id, visit, projectId, studioId, projectContext, settings);
      } catch (err: any) {
        if (err.message && (err.message.includes('401') || err.message.includes('403'))) {
          // Token expired or was revoked. connectGoogleCalendar() handles the popup.
          const success = await connectGoogleCalendar();
          if (success) {
            await syncSiteVisitToCalendar(visit.id, visit, projectId, studioId, projectContext, settings);
          } else {
            alert("Could not connect to Google Calendar.");
          }
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      console.error("Retry sync failed:", err);
      alert(err.message || "Retry failed");
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden ${visit.status === 'cancelled' ? 'opacity-60 grayscale' : ''}`}>
      <div className={`p-4 border-b flex items-center justify-between ${isSite ? 'bg-orange-50/50 border-orange-100' : 'bg-blue-50/50 border-blue-100'}`}>
         <div className="flex items-center gap-3">
           <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-sm ${isSite ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
              {isSite ? '🏗️' : '🤝'}
           </div>
           <div>
             <h3 className="font-bold text-indigo-950">{visit.title}</h3>
             <div className="flex items-center gap-2 mt-0.5 mt-1 text-xs font-semibold text-slate-500 tracking-wide uppercase">
                <span>Phase: {visit.phaseTitle} (Step {visit.phaseStepNumber})</span>
                {visit.status === 'cancelled' && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded">Cancelled</span>}
             </div>
           </div>
         </div>
         <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 font-bold text-slate-700">
              <Calendar size={14} className="text-slate-400"/> {dDate.toLocaleDateString()}
            </div>
            <div className="flex items-center justify-end gap-1.5 text-sm text-slate-500 mt-1">
              <Clock size={14}/> {visit.startTime} ({visit.durationMinutes}m)
            </div>
         </div>
      </div>
            <div className="p-4 grid grid-cols-3 gap-6">
         <div className="col-span-2 space-y-4">
            <div>
               <div className="flex items-center justify-between mb-1.5">
                   <h4 className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><FileText size={12}/> Notes / Agenda</h4>
                   {(!mom) ? (
                       <button onClick={onCaptureClick} className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md hover:bg-indigo-100 flex items-center gap-1">
                           <FileText size={12}/> Create MoM
                       </button>
                   ) : (
                       <button onClick={() => onReviewClick(mom.id)} className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md hover:bg-emerald-100 flex items-center gap-1">
                           <FileText size={12}/> View / Edit MoM
                       </button>
                   )}
               </div>
               <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{visit.notes || <span className="text-slate-400 italic">No notes logged.</span>}</p>
            </div>
            
            {mom && (
               <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 space-y-4 mt-4">
                  <div className="flex justify-between items-center border-b border-indigo-100 pb-2">
                     <div>
                         <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                           <CheckCircle2 size={14} className="text-indigo-500" />
                           Minutes of Meeting Generated
                         </p>
                         <p className="text-[10px] text-indigo-600 mt-0.5">Ref: {mom.momRef} | Status: {mom.status}</p>
                     </div>
                  </div>
                  
                  {mom.decisions?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Decisions</p>
                      <ul className="list-disc pl-4 text-xs text-slate-700 space-y-1">
                        {mom.decisions.map((d) => <li key={d.id}>{d.text}</li>)}
                      </ul>
                    </div>
                  )}
                  
                  {mom.actionItems?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-rose-500 uppercase mb-1">Action Items</p>
                      <ul className="list-disc pl-4 text-xs text-rose-700 space-y-1">
                        {mom.actionItems.map((a) => (
                           <li key={a.id}>
                               {a.text} 
                               <span className="text-rose-500 font-semibold"> (Owner: {a.ownerName || a.owner})</span>
                               {a.dueDate && (
                                   <span className="text-slate-400 ml-1">- Due: {new Date(a.dueDate).toLocaleDateString()}</span>
                               )}
                               <div className="flex gap-1 mt-0.5">
                                 {a.flags?.cost && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded">COST IMPACT</span>}
                                 {a.flags?.scope && <span className="text-[8px] bg-red-100 text-red-700 px-1 rounded">SCOPE ADDITION</span>}
                                 {a.flags?.drawing && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">DRAWING REVISION</span>}
                               </div>
                           </li>
                        ))}
                      </ul>
                    </div>
                  )}
               </div>
            )}
         </div>

         <div className="space-y-4">
            <div>
               <h4 className="text-xs font-bold uppercase text-slate-500 mb-1.5">Participants</h4>
               <div className="flex flex-wrap gap-1">
                 {visit.attendees?.length ? visit.attendees.map((a, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">{a}</span>
                 )) : <span className="text-xs text-slate-400">None added</span>}
               </div>
            </div>
            <div>
               <h4 className="text-xs font-bold uppercase text-slate-500 mb-1.5">Location</h4>
               {visit.isVirtual ? (
                 <p className="text-sm text-slate-700 flex items-center gap-1.5"><Video size={14} className="text-emerald-500"/> Virtual Meeting</p>
               ) : (
                 <p className="text-sm text-slate-700 flex items-start gap-1.5"><MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/> <span className="line-clamp-2">{visit.location || 'Not specified'}</span></p>
               )}
            </div>

            {visit.googleMeetUrl && (
              <a href={visit.googleMeetUrl} target="_blank" rel="noopener noreferrer" className="block text-center mt-2 w-full px-3 py-1.5 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-md border border-emerald-200 hover:bg-emerald-100 transition-colors">
                Join Google Meet
              </a>
            )}

            <div className="pt-2 border-t mt-2">
              {visit.calendarSynced ? (
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                  <CheckCircle2 size={14}/> Synced to Calendar
                </div>
              ) : visit.calendarSyncError ? (
                <div className="flex flex-col items-start gap-2 w-full">
                  <div className="flex items-start gap-1.5 text-xs font-medium text-red-600 break-words w-full">
                    <X size={14} className="shrink-0 mt-0.5"/> 
                    <span className="flex-1 overflow-hidden break-words">{visit.calendarSyncError}</span>
                  </div>
                  <button 
                    onClick={handleRetrySync} 
                    disabled={isRetrying}
                    className="px-3 py-1 bg-white text-slate-700 rounded-md border shadow-sm hover:bg-slate-50 disabled:opacity-50 font-bold text-xs"
                  >
                    {isRetrying ? 'Retrying...' : 'Retry Calendar Sync'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 shrink-0">
                  <Loader2 size={12} className="animate-spin" /> Syncing...
                </div>
              )}
            </div>
         </div>
      </div>
    </div>
  )
}
