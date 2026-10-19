import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, FileText, CheckCircle2 } from '@/lib/lucide-shim';
import { opsSettingsOf } from '../../lib/opsDesk';
import { primaryRole } from '../../lib/roles';
import { startMinutes } from '../../services/minutesService';
import '../projectHeader/projectHeader.css';
import { createMoMFromNotes, createEmptyMoM } from '../../services/momService';
import { SiteVisit, MOM } from '../../types';
import { auth } from '../../services/firebaseClient';
import { useOrg } from '../../contexts/OrgContext';

interface MomCaptureModalProps {
  visit: SiteVisit;
  projectId: string;
  studioId: string;
  projectContextName: string;
  onClose: () => void;
  onSuccess: (momId: string) => void;
}

/*
  With the new minutes flow on (Studio settings → Ops Desk), minutes start
  straight from the meeting: who and when are filled in, and the writer lands
  in the composer, where notes and speech become points. The notes form below
  is the older way, kept until the new flow is complete.
*/
export function MomCaptureModal(props: MomCaptureModalProps) {
  const { orgData } = useOrg() as any;
  return opsSettingsOf(orgData).newMinutes ? <StartNewMinutes {...props} /> : <LegacyMomCaptureModal {...props} />;
}

function visitMillis(visit: SiteVisit): number {
  const d: any = visit.date;
  if (!d) return Date.now();
  if (typeof d === 'number') return d;
  if (typeof d?.toDate === 'function') return d.toDate().getTime();
  const parsed = new Date(d).getTime();
  if (isNaN(parsed)) return Date.now();
  /* A date and a start time ("14:30"), in India's time. */
  if (/^\d{1,2}:\d{2}$/.test(String(visit.startTime || '')) && typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const t = new Date(`${d}T${String(visit.startTime).padStart(5, '0')}:00+05:30`).getTime();
    return isNaN(t) ? parsed : t;
  }
  return parsed;
}

function StartNewMinutes({ visit, projectId, studioId, onClose, onSuccess }: MomCaptureModalProps) {
  const { orgData, teamMembers, currentUserAuth, currentRole, currentRoles } = useOrg() as any;
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const team: any[] = orgData?.team || teamMembers || [];
    const email = String(currentUserAuth?.email || '').toLowerCase();
    const mine = team.find((t) => String(t?.email || '').toLowerCase() === email);
    const me = { email, name: mine?.name || currentUserAuth?.displayName || email, role: mine?.title || primaryRole(currentRoles?.length ? currentRoles : [currentRole]) || null };
    const fromPeople = (visit.people || []).map((p) => ({ name: p.name || p.email, side: p.side, role: p.role || undefined, present: true }));
    const named = fromPeople.length ? fromPeople : (visit.attendees || []).filter(Boolean).map((n) => {
      const t = team.find((x) => String(x?.name || '').toLowerCase() === String(n).toLowerCase());
      return t ? { name: n, side: 'ffds', role: t.title || t.role, present: true } : { name: n, side: 'client', present: true };
    });
    const attendees = named.some((a) => a.side === 'ffds' && a.name.toLowerCase() === String(me.name).toLowerCase())
      ? named : [...named, { name: me.name, side: 'ffds', role: me.role || undefined, present: true }];
    startMinutes(studioId, projectId, {
      meetingId: visit.id,
      meetingType: visit.type || 'client_meeting',
      meetingTitle: visit.title || 'Meeting',
      meetingDate: visitMillis(visit),
      durationMinutes: visit.durationMinutes || null,
      venue: visit.isVirtual ? (visit.googleMeetUrl ? 'Google Meet' : 'Online') : visit.location || null,
      attendees: attendees as any,
      notes: visit.notes || '',
    }, me, currentUserAuth?.uid || 'unknown')
      .then(onSuccess)
      .catch((e) => { console.error(e); setError(e?.code === 'permission-denied' ? 'You cannot write minutes on this project.' : 'The minutes could not be started. Check your connection and try again.'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Starting the minutes">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={error ? onClose : undefined} />
      <div className="phd-pop relative w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-center">
        {error ? (
          <>
            <p className="text-sm font-bold text-slate-800">{error}</p>
            <button type="button" onClick={onClose} className="mt-4 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50">Close</button>
          </>
        ) : (
          <p className="text-sm font-semibold text-slate-700 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-[#3D52A0]" />Starting the minutes from {visit.title || 'the meeting'}…</p>
        )}
      </div>
    </div>
  );
}

function LegacyMomCaptureModal({ visit, projectId, studioId, projectContextName, onClose, onSuccess }: MomCaptureModalProps) {
  const { teamMembers, orgData } = useOrg() as any;
  const [notes, setNotes] = useState(visit.notes || '');
  const [loading, setLoading] = useState(false);

  const safeDate = () => {
    if (!visit.date) return Date.now();
    if (typeof visit.date === 'number') return visit.date;
    if (typeof visit.date === 'object' && 'toDate' in visit.date) return visit.date.toDate().getTime();
    const parsed = new Date(visit.date as string).getTime();
    return isNaN(parsed) ? Date.now() : parsed;
  };

  /*
    Who was there, and on which side. The AI used to get the client names only,
    so every studio member it read in the notes came back as "client".
  */
  const knownAttendees = () => {
    const listed = (visit.attendees || []).filter(Boolean).join(', ');
    const team = [
      ...((teamMembers || []) as any[]).filter((t) => String(t?.role || '').toLowerCase() !== 'client'),
      ...(orgData?.signatoryName ? [{ name: orgData.signatoryName, title: orgData.signatoryTitle || 'Principal' }] : []),
    ]
      .map((t) => `${t.name}${t.title ? ` (${t.title})` : ''}`)
      .filter(Boolean)
      .join(', ');
    return [
      listed && `Listed for this meeting: ${listed}`,
      team && `Studio team, side "ffds" (only include those named in the notes): ${team}`,
    ].filter(Boolean).join('. ');
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
        knownAttendees(),
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
    <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/60 z-[60] flex items-center justify-center p-4">
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
