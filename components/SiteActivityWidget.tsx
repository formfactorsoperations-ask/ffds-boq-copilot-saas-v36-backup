import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import { SiteVisitType, SiteVisit } from '../types';
import { Calendar, Clock, MapPin, ChevronRight, Video, FileText, CheckCircle2 } from 'lucide-react';
import { fetchUpcomingVisitsFromCalendar } from '../services/siteVisitService';
import { getCachedAccessToken } from '../services/authService';
import { connectGoogleCalendar } from '../services/googleCalendarService';

export const SiteActivityWidget = ({ 
  projectId, 
  studioId, 
  projectContextName, 
  studioSettings,
  onOpenHistory,
  onNavigateSettings
}: { 
  projectId: string, 
  studioId: string, 
  projectContextName: string,
  studioSettings: any,
  onOpenHistory: () => void,
  onNavigateSettings?: () => void
}) => {
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [upcomingGcalEvents, setUpcomingGcalEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState(!!getCachedAccessToken());

  useEffect(() => {
    if (!projectId?.trim() || !studioId?.trim()) return;

    const q = query(
      collection(db, `organizations/${studioId}/projects/${projectId}/siteVisits`),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data: SiteVisit[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as SiteVisit));
      setVisits(data.filter(v => v.status !== 'cancelled'));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [projectId, studioId]);

  useEffect(() => {
    if (hasToken) {
      // Fetch upcoming events
      fetchUpcomingVisitsFromCalendar(studioSettings, projectContextName).then(events => {
        setUpcomingGcalEvents(events);
      });
    }
  }, [projectContextName, studioSettings, hasToken]);

  const handleConnect = async () => {
    try {
      if (await connectGoogleCalendar()) setHasToken(true);
    } catch {
      alert("Failed to connect Google Calendar");
    }
  };

  const totalVisits = (visits || []).filter(v => v.type === 'site_visit').length;
  const totalMeetings = (visits || []).filter(v => v.type === 'client_meeting').length;
  const totalMinutes = visits.reduce((acc, v) => acc + (v.durationMinutes || 0), 0);
  const syncedCount = (visits || []).filter(v => v.calendarSynced).length;
  const hours = Math.floor(totalMinutes / 60);

  const displayVisits = visits.slice(0, 3);

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
        <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
           <MapPin size={18} className="text-slate-500"/> Site & Meetings
        </h3>
        <button onClick={onOpenHistory} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center">
           History <ChevronRight size={16}/>
        </button>
      </div>

      <div className="grid grid-cols-4 divide-x border-b">
         <div className="p-3 text-center">
            <p className="text-xl font-bold text-indigo-900">{totalVisits}</p>
            <p className="text-xs text-slate-500 font-medium">Visits</p>
         </div>
         <div className="p-3 text-center">
            <p className="text-xl font-bold text-indigo-900">{totalMeetings}</p>
            <p className="text-xs text-slate-500 font-medium">Meetings</p>
         </div>
         <div className="p-3 text-center">
            <p className="text-xl font-bold text-indigo-900">{hours}h</p>
            <p className="text-xs text-slate-500 font-medium">Time Logged</p>
         </div>
         <div className="p-3 text-center">
            <p className="text-xl font-bold text-emerald-600">{syncedCount}</p>
            <p className="text-xs text-slate-500 font-medium">GCal Synced</p>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {hasToken && upcomingGcalEvents.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase flex items-center gap-1.5"><Calendar size={12}/> Upcoming (GCal)</p>
            {upcomingGcalEvents.map(ev => {
              const start = new Date(ev.start?.dateTime || ev.start?.date);
              return (
                <div key={ev.id} className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 flex gap-3">
                  <div className="text-center">
                     <p className="text-xs text-indigo-500 font-bold uppercase">{start.toLocaleString('default', { month: 'short' })}</p>
                     <p className="text-lg font-bold text-indigo-900 leading-none">{start.getDate()}</p>
                  </div>
                  <div className="flex-1">
                     <p className="text-sm font-medium text-indigo-900 line-clamp-1">{ev.summary}</p>
                     <p className="text-xs text-slate-500 mt-0.5">{start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {displayVisits.length > 0 ? (
          <div className="space-y-3">
             <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase">Recent Logs</p>
             {displayVisits.map(visit => {
               const isSite = visit.type === 'site_visit';
               const dDate = visit.date?.toDate ? visit.date.toDate() : new Date(visit.date);
               return (
                 <div key={visit.id} className={`p-3 rounded-lg border flex gap-3 ${isSite ? 'border-orange-100 bg-orange-50/30' : 'border-blue-100 bg-blue-50/30'}`}>
                    <div className="text-2xl mt-0.5">{isSite ? '🏗️' : '🤝'}</div>
                    <div className="flex-1 min-w-0">
                       <p className="text-sm font-medium text-indigo-950 truncate">{visit.title}</p>
                       <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Calendar size={12}/> {dDate.toLocaleDateString()}</span>
                          <span className="flex items-center gap-1"><Clock size={12}/> {visit.durationMinutes}m</span>
                       </div>
                    </div>
                    {visit.calendarSynced && (
                      <div title="Synced to Google Calendar" className="text-emerald-500 opacity-80"><CheckCircle2 size={16}/></div>
                    )}
                 </div>
               )
             })}
          </div>
        ) : (
          <div className="text-center text-slate-500 text-sm py-6">No site visits or meetings logged yet.</div>
        )}

        {onNavigateSettings && (
          <div className="pt-3 border-t border-slate-100 mt-4">
             <button 
               onClick={onNavigateSettings}
               className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors w-full text-left"
             >
               → Connect Google Calendar in Settings to auto-sync.
             </button>
          </div>
        )}
      </div>
    </div>
  );
};
