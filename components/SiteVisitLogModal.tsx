import React, { useState, useEffect } from 'react';
import { SiteVisitType } from '../types';
import { X, Calendar, Clock, MapPin, Users, FileText, Video, Loader2, CheckCircle2, Plus, Sparkles, Map, CalendarRange } from 'lucide-react';
import { logSiteVisit } from '../services/siteVisitService';
import { db } from '../services/dbService';
import { useStudioSettings } from '../hooks/useStudioSettings';

interface SiteVisitLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  studioId: string;
  defaultType: SiteVisitType;
  projectContext: any;
  currentPhaseStep: number;
  currentPhaseTitle: string;
  onSuccess?: () => void;
}

import { connectGoogleCalendar } from '../services/googleCalendarService';
import { getCachedAccessToken } from '../services/authService';

export const SiteVisitLogModal: React.FC<SiteVisitLogModalProps> = ({
  isOpen, onClose, projectId, studioId, defaultType, projectContext, currentPhaseStep, currentPhaseTitle, onSuccess
}) => {
  const { settings } = useStudioSettings(studioId);
  const [hasCalendarToken, setHasCalendarToken] = useState<boolean>(false);

  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHasCalendarToken(!!getCachedAccessToken());
    }
  }, [isOpen]);

  const handleConnectCalendar = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const success = await connectGoogleCalendar();
      if (success) {
        setHasCalendarToken(true);
      }
    } catch (e: any) {
      console.error(e);
      let errorMsg = "Failed to connect to Google Calendar.";
      if (e.code === 'auth/popup-blocked') {
        errorMsg = "Popup was blocked by your browser. Please allow popups for this site.";
      } else if (e.code === 'auth/cancelled-popup-request' || e.code === 'auth/popup-closed-by-user') {
        errorMsg = "Google sign-in was cancelled.";
      }
      alert(errorMsg);
    } finally {
      setIsConnecting(false);
    }
  };

  const [type, setType] = useState<SiteVisitType>(defaultType);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState<number>(60);
  const [customDuration, setCustomDuration] = useState('');
  
  const [location, setLocation] = useState(projectContext?.location || '');
  const [isVirtual, setIsVirtual] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);

  const [currAttendeeName, setCurrAttendeeName] = useState('');
  const [currAttendeeEmail, setCurrAttendeeEmail] = useState('');

  const handleAddAttendee = () => {
    const name = currAttendeeName.trim();
    if (!name) return;
    const email = currAttendeeEmail.trim();
    setAttendees([...attendees, name]);
    setAttendeeEmails([...attendeeEmails, email]);
    setCurrAttendeeName('');
    setCurrAttendeeEmail('');
  };

  const handleExtract = async () => {
    if (!notes.trim()) return;
    setIsAnalyzing(true);
    try {
        const res = await fetch('/api/parse-mom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawNotes: notes })
        });
        const { success, data, error } = await res.json();
        if (success) {
            setParsedData(data);
        } else {
            alert(error || 'Failed to analyze MoM.');
        }
    } catch (e) {
        console.error(e);
        alert('Error analyzing site notes.');
    } finally {
        setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    setType(defaultType);
    setTitle('');
    setDate(new Date().toISOString().split('T')[0]);
    setStartTime('10:00');
    setDuration(defaultType === 'site_visit' ? (settings?.calendarIntegration?.defaultSiteVisitDuration || 90) : (settings?.calendarIntegration?.defaultMeetingDuration || 60));
    setLocation(projectContext?.location || '');
    setIsVirtual(false);
    setCurrAttendeeName('');
    setCurrAttendeeEmail('');
    
    if (defaultType === 'client_meeting' && projectContext?.clientName) {
      setAttendees([projectContext.clientName]);
      if (projectContext.clientEmail && settings?.calendarIntegration?.autoAddClientToMeetings !== false) {
        setAttendeeEmails([projectContext.clientEmail]);
      }
    } else {
      setAttendees([]);
      setAttendeeEmails([]);
    }
  }, [isOpen, defaultType, projectContext, settings]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let finalDuration = duration === 0 ? parseInt(customDuration) || 60 : duration;
    
    try {
      if (parsedData) {
        const projects = await db.getProjects();
        const project = projects.find(p => p.id === projectId);
        if (project && project.activeProject) {
            const exData = project.activeProject.executionData || {
                bundles: [], sofItems: [], blockers: [], actions: [], decisions: [], procurement: []
            };
            
            const currentDecisions = exData.decisions || [];
            const currentBlockers = exData.blockers || [];
            const currentSOF = exData.sofItems || [];

            const newDecisions = (parsedData.decisions || []).map((d: any, i: number) => ({
                id: `d-mom-${Date.now()}-${i}`, ...d, createdAt: Date.now()
            }));

            const newBlockers = (parsedData.blockers || []).map((b: any, i: number) => ({
                id: `b-mom-${Date.now()}-${i}`, bundleId: 'general', ...b, reportedAt: Date.now()
            }));

            const newSOF = (parsedData.sofChanges || []).map((s: any, i: number) => ({
                id: `s-mom-${Date.now()}-${i}`, itemId: s.item, baselineSpec: s.original || 'Unknown', targetSpec: s.new, status: 'pending'
            }));

            project.activeProject.executionData = {
                ...exData,
                decisions: [...currentDecisions, ...newDecisions],
                blockers: [...currentBlockers, ...newBlockers],
                sofItems: [...currentSOF, ...newSOF],
                lastUpdated: Date.now()
            };
            
            await db.saveProject(project);
        }
      }

      await logSiteVisit(
        {
          type,
          title, // string, required
          date: new Date(date), // save as JS Date, Firestore auto-converts to Timestamp on addDoc if not passed via Timestamp.fromDate, actually passing Timestamp or Date is fine if we use Timestamp.fromDate, but our sync logic uses .split if it's strings. Wait! In syncSiteVisitToCalendar we handle string/Timestamp.
          startTime,
          durationMinutes: finalDuration,
          phaseStepNumber: currentPhaseStep,
          phaseTitle: currentPhaseTitle,
          attendees,
          attendeeEmails,
          notes,
          location: isVirtual ? '' : location,
          isVirtual,
          momData: parsedData || null,
        },
        projectId,
        studioId,
        projectContext,
        settings
      );
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to log visit");
    } finally {
      setLoading(false);
    }
  };

  const isSite = type === 'site_visit';
  const prefix = settings?.calendarIntegration?.calendarEventPrefix || "[BOQ Copilot]";
  const typeLabel = isSite ? 'Site Visit' : 'Client Meeting';
  const previewTitle = `${prefix} ${typeLabel} — ${projectContext?.name || 'Project'} · ${currentPhaseTitle}`;

  // generate time slots
  const timeSlots = [];
  for (let i = 8; i <= 20; i++) {
    timeSlots.push(`${i.toString().padStart(2, '0')}:00`);
    timeSlots.push(`${i.toString().padStart(2, '0')}:30`);
  }

  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-[3px] z-50 flex items-center justify-center p-4 transition-all duration-300">
      <div className="bg-stone-50 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] border border-stone-200 overflow-hidden animate-scaleIn">
        
        {/* Luxury Header */}
        <div className="px-6 py-5 bg-white border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isSite ? 'bg-amber-500 animate-pulse' : 'bg-indigo-500 animate-pulse'}`}></span>
              <h2 className="text-base font-bold text-stone-900 tracking-tight font-sans">
                {isSite ? 'Log Dynamic Site Visit' : 'Schedule Client Interaction'}
              </h2>
            </div>
            <p className="text-stone-500 text-xs mt-0.5">
              Form Factors Design Studio (FFDS) Execution Intelligence
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* The Tab switcher */}
            <div className="bg-stone-100 p-1 rounded-xl border border-stone-200 flex items-center gap-1">
              <button 
                type="button"
                onClick={() => setType('site_visit')}
                className={`flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  type === 'site_visit' 
                    ? 'bg-amber-600 text-white shadow-sm' 
                    : 'text-stone-600 hover:text-stone-950 hover:bg-stone-50'
                }`}
              >
                🏗️ Site
              </button>
              <button 
                type="button"
                onClick={() => setType('client_meeting')}
                className={`flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  type === 'client_meeting' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-stone-600 hover:text-stone-950 hover:bg-stone-50'
                }`}
              >
                🤝 Meeting
              </button>
            </div>
            
            <button 
              type="button"
              onClick={onClose} 
              className="p-1.5 text-stone-400 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X size={18}/>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {!hasCalendarToken && (
            <div className="p-4 bg-amber-50/80 border border-amber-200/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-amber-300/80">
              <div className="flex gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg text-amber-700 mt-0.5 sm:mt-0">
                  <CalendarRange size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900">Calendar Sync Required</h4>
                  <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
                    Connect your Google Calendar to automatically log travels, block time-slots on your calendar, and generate Google Meet invites.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleConnectCalendar}
                disabled={isConnecting}
                className="w-full sm:w-auto px-4 py-2 bg-stone-900 text-white text-xs font-semibold rounded-lg shadow-sm hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 tracking-wide text-nowrap"
              >
                {isConnecting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-amber-400" />
                    <span>Connect Google</span>
                  </>
                )}
              </button>
            </div>
          )}

          <div className="space-y-5">
             <div className="space-y-1.5">
               <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">Purpose / Title *</label>
               <input 
                 required
                 type="text" 
                 value={title}
                 onChange={(e) => setTitle(e.target.value)}
                 className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-stone-900 focus:ring-0 transition-all duration-200 text-stone-900 placeholder-stone-400 text-sm"
                 placeholder={isSite ? "e.g., False ceiling progress & material spec review" : "e.g., 3D presentation and material sampling sign-off"}
               />
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">Date *</label>
                  <div className="relative">
                    <Calendar size={16} className="absolute left-3.5 top-3.5 text-stone-400 pointer-events-none" />
                    <input 
                      required 
                      type="date" 
                      value={date} 
                      onChange={(e) => setDate(e.target.value)} 
                      className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-stone-900 focus:ring-0 transition-all duration-200 text-stone-900 text-sm"
                    />
                  </div>
               </div>
               <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">Start Time *</label>
                  <div className="relative">
                    <Clock size={16} className="absolute left-3.5 top-3.5 text-stone-400 pointer-events-none" />
                    <select 
                      required 
                      value={startTime} 
                      onChange={(e) => setStartTime(e.target.value)} 
                      className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-stone-900 focus:ring-0 transition-all duration-200 text-stone-900 text-sm appearance-none bg-no-repeat bg-[right_14px_center]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2378716c' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")`, backgroundSize: '16px' }}
                    >
                      {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
               </div>
             </div>

             <div className="space-y-2">
                <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">Duration</label>
                <div className="flex flex-wrap gap-2 items-center">
                   {[30, 60, 90, 120].map(dur => (
                     <button
                       key={dur} 
                       type="button"
                       onClick={() => setDuration(dur)}
                       className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-all duration-150 ${
                         duration === dur 
                           ? 'bg-stone-900 border-stone-900 text-white shadow-sm' 
                           : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                       }`}
                     >
                       {dur === 30 ? '30 Min' : dur === 60 ? '1 Hour' : dur === 90 ? '1.5 Hours' : '2 Hours'}
                     </button>
                   ))}
                   <button
                       type="button"
                       onClick={() => setDuration(0)}
                       className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-all duration-150 ${
                         duration === 0 
                           ? 'bg-stone-900 border-stone-900 text-white shadow-sm' 
                           : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                       }`}
                   >
                     Custom
                   </button>
                   {duration === 0 && (
                     <div className="flex items-center gap-2 ml-1 animate-fadeIn">
                       <input 
                         type="number" 
                         min="15" 
                         value={customDuration} 
                         onChange={(e) => setCustomDuration(e.target.value)}
                         className="w-20 px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg text-stone-900 focus:bg-white focus:border-stone-900 focus:ring-0" 
                         placeholder="Mins" 
                         required
                       />
                       <span className="text-xs text-stone-500 font-medium font-mono">minutes</span>
                     </div>
                   )}
                </div>
             </div>

             <div className="p-3.5 bg-stone-100/60 border border-stone-200/80 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-stone-200 text-stone-600 rounded-lg">
                    <Map size={16} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-800 uppercase tracking-wider">Project Timeline Link</label>
                    <p className="text-xs font-semibold text-stone-900">{currentPhaseTitle}</p>
                  </div>
                </div>
                <div className="bg-stone-200/80 text-stone-800 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono">
                  Step {currentPhaseStep}
                </div>
             </div>

             <div className="space-y-1.5">
               <div className="flex justify-between items-center">
                 <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">Location / Venue</label>
                 {!isSite && (
                   <label className="flex items-center gap-2 text-xs font-medium text-stone-600 cursor-pointer select-none hover:text-stone-900 transition-colors">
                     <input 
                       type="checkbox" 
                       checked={isVirtual} 
                       onChange={(e) => setIsVirtual(e.target.checked)} 
                       className="rounded border-stone-300 text-stone-950 focus:ring-0" 
                     />
                     <span className="flex items-center gap-1">
                       <Video size={13} className={isVirtual ? "text-emerald-500" : "text-stone-400"} />
                       Virtual meeting
                     </span>
                   </label>
                 )}
               </div>
               
               <div className="relative">
                 {isVirtual ? 
                   <Video size={16} className="absolute left-3.5 top-3.5 text-emerald-500 pointer-events-none" /> :
                   <MapPin size={16} className="absolute left-3.5 top-3.5 text-stone-400 pointer-events-none" />
                 }
                 <input 
                   type="text" 
                   value={isVirtual ? "Google Meet invite details will be automatically attached" : location}
                   onChange={(e) => setLocation(e.target.value)}
                   disabled={isVirtual}
                   className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-stone-900 focus:ring-0 transition-all duration-200 text-stone-900 text-sm disabled:bg-stone-100 disabled:text-stone-400 placeholder-stone-400"
                   placeholder="e.g., 5th Floor, Hiranandani Estate Tower A or contractor shed"
                   required={!isVirtual}
                 />
               </div>
             </div>

             {!isSite && (
               <div className="space-y-2">
                 <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">
                   Attendees & Stakeholders
                 </label>
                 <div className="border border-stone-200 bg-stone-50/40 rounded-xl p-4 space-y-3.5">
                    
                    {attendees.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                         {attendees.map((att, i) => {
                            const email = attendeeEmails[i];
                            return (
                              <div 
                                key={i} 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 border border-stone-200 text-stone-800 text-xs font-medium shadow-sm"
                              >
                                <Users size={12} className="text-stone-500" />
                                <span>{att}</span>
                                {email && (
                                  <span className="text-[10px] text-stone-400 font-mono">({email})</span>
                                )}
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    const newAtts = [...attendees];
                                    const newEmails = [...attendeeEmails];
                                    newAtts.splice(i, 1);
                                    newEmails.splice(i, 1); 
                                    setAttendees(newAtts);
                                    setAttendeeEmails(newEmails);
                                  }} 
                                  className="text-stone-400 hover:text-stone-650 p-0.5 rounded-full hover:bg-stone-200 transition-colors"
                                >
                                  <X size={12}/>
                                </button>
                              </div>
                            );
                         })}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 italic">No custom attendees added. Project owner is included automatically.</p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
                      <div className="relative flex-1">
                        <Users size={15} className="absolute left-3 top-3 text-stone-400 pointer-events-none" />
                        <input 
                          type="text" 
                          placeholder="Attendee Name" 
                          value={currAttendeeName}
                          onChange={(e) => setCurrAttendeeName(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-xs focus:border-stone-900 focus:ring-0"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (currAttendeeName.trim()) {
                                handleAddAttendee();
                              }
                            }
                          }}
                        />
                      </div>
                      
                      <input 
                        type="email" 
                        placeholder="Email Address (optional)" 
                        value={currAttendeeEmail}
                        onChange={(e) => setCurrAttendeeEmail(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs focus:border-stone-900 focus:ring-0"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (currAttendeeName.trim()) {
                              handleAddAttendee();
                            }
                          }
                        }}
                      />

                      <button
                        type="button"
                        onClick={handleAddAttendee}
                        disabled={!currAttendeeName.trim()}
                        className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-bold hover:bg-stone-800 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus size={14} />
                        <span>Add</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-500">
                      Enter attendee name and click <span className="font-semibold">Add</span> or press <span className="font-semibold">Enter</span>. Email is used to share MoMs, schedules, and Google Calendar details.
                    </p>
                 </div>
               </div>
             )}

             <div className="space-y-2">
               <div className="flex justify-between items-center">
                 <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">Notes, Minutes of Meeting (MoM) or Agenda</label>
                 <button
                   type="button"
                   onClick={handleExtract}
                   disabled={isAnalyzing || !notes.trim()}
                   className="text-[11px] font-bold bg-amber-650/10 text-amber-900 hover:bg-amber-600/25 active:bg-amber-600/35 px-3 py-1.5 rounded-lg border border-amber-200/50 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                 >
                   {isAnalyzing ? (
                     <Loader2 size={13} className="animate-spin text-amber-800" />
                   ) : (
                     <Sparkles size={13} className="text-amber-700" />
                   )}
                   <span>{isAnalyzing ? 'Extracting Insights...' : 'Analyze with MoM Copilot'}</span>
                 </button>
               </div>
               
               <textarea 
                 value={notes}
                 onChange={(e) => setNotes(e.target.value)}
                 rows={4}
                 className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-stone-900 focus:ring-0 resize-none text-stone-900 text-sm placeholder-stone-400"
                 placeholder={
                   isSite 
                     ? "e.g., Brick mortar thickness issue resolved on site. False ceiling height locked at 9'4\". Plumber reported leak in toilet duct (Blocker!). Corrected baseline specs for living area marble." 
                     : "e.g., Client finalized premium Italian beige marble instead of custom tiles. Living room divider design signed off. Client requested delivery schedule of dining table. Needs draft layout by tomorrow."
                 }
               />
               
               {parsedData && (
                 <div className="bg-stone-55 border border-stone-200 rounded-xl p-4 space-y-3.5 shadow-inner">
                   <div className="flex items-center justify-between border-b border-stone-200/80 pb-2">
                     <p className="text-xs font-bold text-stone-850 uppercase tracking-wider flex items-center gap-1.5">
                       <Sparkles size={14} className="text-amber-600" />
                       <span>MoM Execution Insights Extracted</span>
                     </p>
                     <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-mono">
                       SYNC READY
                     </span>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     {/* Decisions */}
                     <div className="space-y-2 bg-white p-3 rounded-lg border border-stone-150 shadow-sm">
                       <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                         <CheckCircle2 size={12} className="text-stone-400" />
                         <span>Decisions & Signoffs</span>
                       </p>
                       {parsedData.decisions?.length > 0 ? (
                         <ul className="list-none text-xs text-stone-700 space-y-1.5">
                           {parsedData.decisions.map((d: any, i: number) => (
                             <li key={i} className="flex gap-1.5 items-start">
                               <span className="text-amber-500 font-bold mt-0.5">•</span>
                               <span>{d.title}</span>
                             </li>
                           ))}
                         </ul>
                       ) : (
                         <p className="text-[11px] text-stone-400 italic">No decisions parsed.</p>
                       )}
                     </div>
                     
                     {/* Blockers */}
                     <div className="space-y-2 bg-white p-3 rounded-lg border border-stone-150 shadow-sm">
                       <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wide flex items-center gap-1">
                         <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                         <span>Execution Blockers</span>
                       </p>
                       {parsedData.blockers?.length > 0 ? (
                         <ul className="list-none text-xs text-rose-800 space-y-1.5">
                           {parsedData.blockers.map((b: any, i: number) => (
                             <li key={i} className="flex gap-1.5 items-start bg-rose-50/50 p-1 rounded">
                               <span className="text-rose-500 font-bold mt-0.5">•</span>
                               <div>
                                 <span className="font-semibold">{b.title}</span>
                                 <span className="text-[10px] text-rose-400 block font-mono">Impact: {b.impact}</span>
                               </div>
                             </li>
                           ))}
                         </ul>
                       ) : (
                         <p className="text-[11px] text-stone-400 italic">No blockers parsed.</p>
                       )}
                     </div>
                     
                     {/* Schedule of Finishes (SOF) Variances */}
                     <div className="space-y-2 bg-white p-3 rounded-lg border border-stone-150 shadow-sm">
                       <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1 flex-wrap">
                         <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                         <span>SOF Variances</span>
                       </p>
                       {parsedData.sofChanges?.length > 0 ? (
                         <ul className="list-none text-xs text-stone-700 space-y-1.5">
                           {parsedData.sofChanges.map((s: any, i: number) => (
                             <li key={i} className="flex gap-1.5 items-baseline">
                               <span className="text-amber-500 font-bold">•</span>
                               <div className="leading-tight">
                                 <span className="font-semibold block text-stone-800">{s.item}</span>
                                 <span className="text-[10px] font-mono text-stone-400 block">{s.original || 'Baseline'} ➔ <span className="text-amber-600 font-semibold">{s.new}</span></span>
                               </div>
                             </li>
                           ))}
                         </ul>
                       ) : (
                         <p className="text-[11px] text-stone-400 italic">No SOF variances parsed.</p>
                       )}
                     </div>
                   </div>
                   
                   <p className="text-[10px] text-stone-500 font-medium leading-normal">
                     * Extracting MoM will automatically update active items, flag site blockers, and register Schedule of Finishes variances under active execution boards upon saving.
                   </p>
                 </div>
               )}
             </div>
          </div>
        </form>

        {/* Premium Charcoal Footer containing Live Calendar Sync Data */}
        <div className="p-5 border-t bg-stone-900 text-stone-200 rounded-b-2xl flex flex-col sm:flex-row gap-5 items-stretch sm:items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 bg-stone-880 w-fit px-2 py-0.5 rounded border border-stone-800">
              <span className={`w-1.5 h-1.5 rounded-full ${isSite ? 'bg-amber-500' : 'bg-indigo-500'}`}></span>
              <p className="text-[9px] font-bold text-stone-400 tracking-wider uppercase">Google Calendar Synchronization</p>
            </div>
            <p className="text-xs font-semibold text-stone-100 truncate">{previewTitle}</p>
            <p className="text-[10px] text-stone-400 mt-0.5 font-mono">
              {date} · {startTime} ({duration === 0 ? customDuration || '0' : duration} minutes duration)
            </p>
          </div>
          
          <div className="flex gap-3 justify-end items-center">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={loading} 
              className="px-4 py-2 text-stone-400 hover:text-stone-100 font-semibold text-xs rounded-lg transition-colors duration-150 disabled:opacity-40"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || !title} 
              onClick={handleSubmit} 
              className="px-5 py-2.5 bg-stone-100 text-stone-950 font-bold text-xs rounded-xl hover:bg-white active:bg-stone-200 shadow-lg disabled:bg-stone-800 disabled:text-stone-600 disabled:shadow-none disabled:border disabled:border-stone-800 transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={13} className="animate-spin text-stone-950" />}
              <span>{hasCalendarToken ? 'Save & Sync Event' : 'Save Event'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
