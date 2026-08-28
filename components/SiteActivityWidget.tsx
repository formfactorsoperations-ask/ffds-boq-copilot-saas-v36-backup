import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import { SiteVisitType, SiteVisit } from '../types';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  ChevronRight, 
  Video, 
  FileText, 
  CheckCircle2, 
  Users, 
  Plus, 
  ExternalLink,
  Sparkles,
  Link2,
  CalendarDays,
  Activity
} from 'lucide-react';
import { fetchUpcomingVisitsFromCalendar } from '../services/siteVisitService';
import { getCachedAccessToken } from '../services/authService';
import { connectGoogleCalendar } from '../services/googleCalendarService';

export const SiteActivityWidget = ({ 
  projectId, 
  studioId, 
  projectContextName, 
  studioSettings,
  onOpenHistory,
  onNavigateSettings,
  onLogSiteVisit,
  onLogMeeting
}: { 
  projectId: string, 
  studioId: string, 
  projectContextName: string,
  studioSettings: any,
  onOpenHistory: () => void,
  onNavigateSettings?: () => void,
  onLogSiteVisit?: () => void,
  onLogMeeting?: () => void
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
    }, (err) => console.error("Error fetching visits:", err));

    return () => unsubscribe();
  }, [projectId, studioId]);

  useEffect(() => {
    if (hasToken) {
      // Fetch upcoming events
      fetchUpcomingVisitsFromCalendar(studioSettings, projectContextName).then(events => {
        setUpcomingGcalEvents(events || []);
      }).catch(err => console.warn("Error fetching events:", err));
    }
  }, [projectContextName, studioSettings, hasToken]);

  const handleConnect = async () => {
    try {
      if (await connectGoogleCalendar()) setHasToken(true);
    } catch {
      alert("Failed to connect Google Calendar");
    }
  };

  const totalVisits = (visits || []).filter(v => v.type === 'site_visit' || v.type === 'measurement_survey').length;
  const totalMeetings = (visits || []).filter(v => v.type && v.type !== 'site_visit' && v.type !== 'measurement_survey').length;
  const totalMinutes = visits.reduce((acc, v) => acc + (v.durationMinutes || 0), 0);
  const syncedCount = (visits || []).filter(v => v.calendarSynced).length;
  const hours = Math.floor(totalMinutes / 60);

  const displayVisits = visits.slice(0, 3);
  const nextScheduled = upcomingGcalEvents?.[0];

  return (
    <div className="bg-white border border-slate-200/60 rounded-[24px] shadow-sm overflow-hidden flex flex-col h-full min-h-[480px] relative">
      {/* Premium brand gold accent line */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-400 via-[#B5945B] to-amber-200" />

      {/* Header with improved layout */}
      <div className="p-5 pb-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50/50 to-white">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-100/50 flex items-center justify-center text-slate-900">
            <Compass className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Site & Meetings</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Execution & alignment track</p>
          </div>
        </div>
        <button 
          onClick={onOpenHistory} 
          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-extrabold text-[#0066CC] flex items-center gap-1 uppercase tracking-wider transition"
        >
          <span>All Logs</span>
          <ChevronRight size={12}/>
        </button>
      </div>

      {/* Grid Stats: Polished Navy/Gold minimalist metrics block */}
      <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/40">
         <div className="p-3 text-center">
            <p className="text-xl font-black text-slate-900 leading-tight">{totalVisits}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Site Visits</p>
         </div>
         <div className="p-3 text-center">
            <p className="text-xl font-black text-slate-900 leading-tight">{totalMeetings}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Meetings</p>
         </div>
         <div className="p-3 text-center">
            <p className="text-xl font-black text-[#B5945B] leading-tight">{hours}h</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Time Spent</p>
         </div>
         <div className="p-3 text-center">
            <p className="text-xl font-black text-emerald-600 leading-tight">{syncedCount}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Synced</p>
         </div>
      </div>

      {/* Quick Action bar inside the widget */}
      {(onLogSiteVisit || onLogMeeting) && (
        <div className="px-5 py-3 bg-[#FAF9F5]/70 border-b border-slate-100 flex gap-2 justify-center shrink-0">
          {onLogSiteVisit && (
            <button 
              onClick={onLogSiteVisit} 
              className="flex-1 py-2 px-3 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-200 text-slate-700 hover:text-amber-800 rounded-xl text-[11px] font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus size={12} className="text-[#B5945B]" /> 
              <span>Log Site Visit</span>
            </button>
          )}
          {onLogMeeting && (
            <button 
              onClick={onLogMeeting} 
              className="flex-1 py-2 px-3 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-slate-700 hover:text-slate-900 rounded-xl text-[11px] font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus size={12} className="text-slate-900" /> 
              <span>Log Meeting</span>
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-grow overflow-y-auto p-5 space-y-5">
        
        {/* Next Contact Highlight Banner */}
        {nextScheduled ? (
          <div className="bg-[#FDFDFB] border border-slate-200/80 p-3.5 rounded-2xl relative overflow-hidden shrink-0 shadow-2xs">
            <div className="absolute -right-3 -top-3 opacity-10">
              <CalendarDays className="w-16 h-16 text-slate-800" />
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[#C5A85C] tracking-wider">
              <Sparkles className="w-3.5 h-3.5 fill-[#C5A85C] text-[#C5A85C] animate-pulse" />
              <span>Next Contact Scheduled</span>
            </div>
            <h4 className="text-xs font-black text-[#0F172A] mt-1 line-clamp-1">{nextScheduled.summary}</h4>
            
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-slate-600 font-bold">
              <span className="flex items-center gap-1">
                <Calendar size={11} className="text-slate-400" />
                {new Date(nextScheduled.start?.dateTime || nextScheduled.start?.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={11} className="text-slate-400" />
                {new Date(nextScheduled.start?.dateTime || nextScheduled.start?.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {nextScheduled.hangoutLink && (
              <a 
                href={nextScheduled.hangoutLink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 py-1 px-3 bg-amber-600 text-white rounded-lg text-[10px] font-extrabold hover:bg-amber-700 transition"
              >
                <Video size={12} />
                <span>Join Video Conference</span>
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        ) : null}

        {/* Recent Activity Timeline List */}
        {displayVisits.length > 0 ? (
          <div className="space-y-4">
             <div className="flex items-center justify-between">
               <p className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase">Recent Activity timeline</p>
               <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                 <Activity size={10} /> Live sync
               </span>
             </div>

             <div className="space-y-4 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
               {displayVisits.map((visit, index) => {
                 const isSite = visit.type === 'site_visit';
                 const dDate = visit.date?.toDate ? visit.date.toDate() : new Date(visit.date);
                 return (
                   <div key={visit.id || `visit-${index}`} className="flex gap-4 relative">
                     {/* Circular Timeline Node */}
                     <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm z-10 transition-all ${
                       isSite 
                         ? 'bg-amber-50 text-[#B5945B] border-amber-50' 
                         : 'bg-sky-50 text-slate-900 border-sky-50'
                     }`}>
                        {isSite ? <MapPin size={13} className="stroke-[2.5]" /> : <Users size={13} className="stroke-[2.5]" />}
                     </div>

                     <div className="flex-1 bg-slate-50/40 hover:bg-white rounded-2xl border border-slate-100 hover:border-slate-200 p-4 transition-all duration-200">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-black text-slate-900 leading-tight hover:text-[#B5945B] transition-colors">{visit.title}</p>
                          {visit.calendarSynced && (
                            <span className="flex items-center gap-0.5 text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-emerald-100 shrink-0">
                              Synced
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-slate-500 font-bold">
                           <span className="flex items-center gap-1"><Calendar size={11} className="text-slate-400" /> {dDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                           <span className="w-1 h-1 rounded-full bg-slate-300" />
                           <span className="flex items-center gap-1"><Clock size={11} className="text-slate-400" /> {visit.durationMinutes} mins</span>
                           {visit.location && (
                             <>
                               <span className="w-1 h-1 rounded-full bg-slate-300" />
                               <span className="flex items-center gap-1 truncate max-w-[120px]" title={visit.location}><MapPin size={11} className="text-slate-400" /> {visit.location}</span>
                             </>
                           )}
                        </div>

                        {/* Show Attendees badge row if they exist */}
                        {visit.attendees && visit.attendees.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-3 px-2.5 py-1.5 bg-white border border-slate-100 rounded-xl text-[10px] text-slate-500">
                            <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[8px]">Attendees:</span>
                            {visit.attendees.map((attendee, index) => (
                              <span key={index} className="bg-slate-50 px-2 py-0.5 rounded-full border border-slate-150 text-slate-600 font-extrabold text-[9px]">
                                {attendee}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Show notes snippet */}
                        {visit.notes && (
                          <p className="text-xs text-slate-500 leading-relaxed pl-1 line-clamp-2 italic border-l-2 border-slate-200 mt-2.5">
                            "{visit.notes}"
                          </p>
                        )}

                        {/* Show Google Meet URL link if available */}
                        {visit.googleMeetUrl && (
                          <div className="pt-2 flex justify-end">
                            <a 
                              href={visit.googleMeetUrl} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-[#0066CC] bg-sky-50/50 hover:bg-sky-100 hover:text-[#0055B3] px-3 py-1.5 rounded-lg border border-sky-100/40 transition-all cursor-pointer shadow-sm"
                            >
                              <Video size={12} />
                              <span>Join Google Meet</span>
                              <ExternalLink size={9} />
                            </a>
                          </div>
                        )}
                     </div>
                   </div>
                 )
               })}
             </div>
          </div>
        ) : (
          <div className="text-center text-slate-400 text-xs py-12 font-medium flex flex-col items-center justify-center gap-2">
             <Compass size={28} className="text-slate-300 stroke-[1.5]" />
             <span>No site visits or meetings logged yet.</span>
          </div>
        )}

        {onNavigateSettings && (
          <div className="pt-4 border-t border-slate-100">
             <button 
               onClick={onNavigateSettings}
               className="text-[10px] text-[#B5945B] hover:text-slate-900 font-extrabold flex items-center gap-1.5 transition-colors w-full text-left uppercase tracking-wider"
             >
               <Link2 size={12} />
               <span>Connect Google Calendar in settings to auto-sync</span>
             </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper Compass icon in case it's not imported
const Compass = ({ className, size = 16 }: { className?: string, size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);
