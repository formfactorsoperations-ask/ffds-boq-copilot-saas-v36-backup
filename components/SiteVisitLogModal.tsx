import React, { useState, useEffect, useMemo } from 'react';
import { SiteVisitType, MOM } from '../types';
import {
  X, Calendar, Clock, MapPin, Video, Loader2, Plus, Sparkles, Users, Phone, Link2,
  Building2, HardHat, AlertTriangle, Check, CalendarRange,
} from 'lucide-react';
import { logSiteVisit } from '../services/siteVisitService';
import { useStudioSettings } from '../hooks/useStudioSettings';
import { useOrg } from '../contexts/OrgContext';
import { useProjectTeam } from '../services/projectTeam';
import { connectGoogleCalendar } from '../services/googleCalendarService';
import { getCachedAccessToken } from '../services/authService';
import { createMoMFromNotes } from '../services/momService';
import { auth, db as fsDb } from '../services/firebaseClient';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { meetingTypeLabel, toMillis } from '../lib/meetingTypes';
import { MomReviewModal } from './ops/MomReviewModal';

/*
  SCHEDULE A MEETING OR LOG A SITE VISIT.

  The form used to offer one kind of attendee -- whoever was typed in, usually
  the client -- so the studio's own people were never recorded and the AI tagged
  everyone in the notes as "client". It now takes attendees in three groups:
  the client (from the project), the studio team (from the team list, the
  designers on this project ticked for you) and vendors or others. Each person is
  stored with their side and role, beside the plain name and email lists every
  older screen still reads.

  "Save & draft MoM" saves the meeting, drafts the minutes from the notes and
  opens them for review. The old "Analyze" step wrote decisions, blockers and
  finish changes straight into the whole project on save, which could overwrite
  someone else's unsaved work; nothing is written to the project from here now.
*/

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

type Side = 'client' | 'ffds' | 'vendor';
interface Person {
  key: string;
  name: string;
  email: string;
  side: Side;
  role?: string;
}
type VirtualMode = 'google_meet' | 'link' | 'phone';

const EMAIL_RX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const lc = (s: unknown) => String(s || '').trim().toLowerCase();

const MEETING_CATEGORIES: { id: SiteVisitType; label: string; note: string }[] = [
  { id: 'client_meeting', label: 'Client meeting', note: 'Shared with the client · MoM to client' },
  { id: 'internal_meeting', label: 'Internal meeting', note: 'Studio only · never on the client portal' },
  { id: 'vendor_meeting', label: 'Vendor meeting', note: 'Studio and vendors · not on the client portal' },
];

const TITLE_IDEAS: Record<string, string[]> = {
  client_meeting: ['Design discussion', 'Revised BOQ walkthrough', 'Material selection'],
  internal_meeting: ['Weekly project review', 'Design review', 'Procurement planning'],
  vendor_meeting: ['Vendor coordination', 'Site handover to vendor', 'Material delivery planning'],
  site_visit: ['Site measurement', 'Progress review', 'Snag walkthrough'],
  measurement_survey: ['Site measurement'],
};

const DURATIONS = [30, 60, 90, 120];
const durationLabel = (m: number) => (m === 30 ? '30 min' : m === 60 ? '1 hour' : m === 90 ? '1.5 hours' : '2 hours');

export const SiteVisitLogModal: React.FC<SiteVisitLogModalProps> = ({
  isOpen, onClose, projectId, studioId, defaultType, projectContext, currentPhaseStep, currentPhaseTitle, onSuccess,
}) => {
  const { settings } = useStudioSettings(studioId);
  const { orgData, teamMembers, currentUserAuth } = useOrg() as any;
  const { designersOn } = useProjectTeam() as any;

  const [hasCalendarToken, setHasCalendarToken] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const [type, setType] = useState<SiteVisitType>(defaultType);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState<number>(60);
  const [customDuration, setCustomDuration] = useState('');

  const [isVirtual, setIsVirtual] = useState(false);
  const [virtualMode, setVirtualMode] = useState<VirtualMode>('google_meet');
  const [meetingLink, setMeetingLink] = useState('');
  const [location, setLocation] = useState('');

  const [clientPeople, setClientPeople] = useState<Person[]>([]);
  const [clientOn, setClientOn] = useState<Set<string>>(new Set());
  const [teamOn, setTeamOn] = useState<Set<string>>(new Set());
  const [others, setOthers] = useState<Person[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftRole, setDraftRole] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [addSide, setAddSide] = useState<'client' | 'vendor'>('vendor');
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [clientDraftName, setClientDraftName] = useState('');
  const [clientDraftEmail, setClientDraftEmail] = useState('');

  const [agenda, setAgenda] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState<{ visits: any[]; moms: any[] }>({ visits: [], moms: [] });

  const [saving, setSaving] = useState<null | 'save' | 'mom'>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewMom, setReviewMom] = useState<MOM | null>(null);

  const isSite = type === 'site_visit' || type === 'measurement_survey';
  const showsClient = type === 'client_meeting' || isSite;
  const projectName = projectContext?.name || 'Project';

  /* ---------------------------------------------------------------- people */

  /** The studio's people: the team list less client logins, plus the signatory. */
  const team: Person[] = useMemo(() => {
    const list: Person[] = [];
    const seen = new Set<string>();
    const raw: any[] = ((teamMembers?.length ? teamMembers : orgData?.team) || []) as any[];
    raw
      .filter((t) => lc(t?.role) !== 'client' && String(t?.name || t?.email || '').trim())
      .forEach((t) => {
        const key = lc(t.email) || lc(t.name);
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ key, name: t.name || t.email, email: String(t.email || '').trim(), side: 'ffds', role: t.title || t.role });
      });
    const sig = String(orgData?.signatoryName || '').trim();
    if (sig) {
      const first = lc(sig).replace(/^(ar|mr|mrs|ms|dr)\.?\s+/, '').split(/\s+/)[0];
      const already = list.some((p) => lc(p.name) === lc(sig) || lc(p.name).replace(/^(ar|mr|mrs|ms|dr)\.?\s+/, '').split(/\s+/)[0] === first);
      if (!already) list.unshift({ key: `sig:${lc(sig)}`, name: sig, email: '', side: 'ffds', role: orgData?.signatoryTitle || 'Principal' });
    }
    return list;
  }, [teamMembers, orgData]);

  /** Studio addresses, to catch a client email that is really the studio's. */
  const studioEmails = useMemo(() => new Set(team.map((p) => lc(p.email)).filter(Boolean).concat(lc(orgData?.contactEmail)).filter(Boolean)), [team, orgData]);

  /* ---------------------------------------------------------------- reset on open */
  useEffect(() => {
    if (!isOpen) return;
    setHasCalendarToken(!!getCachedAccessToken());
    setType(defaultType);
    setTitle('');
    setDate(new Date().toISOString().split('T')[0]);
    setStartTime('10:00');
    const site = defaultType === 'site_visit' || defaultType === 'measurement_survey';
    setDuration(site ? (settings?.calendarIntegration?.defaultSiteVisitDuration || 90) : (settings?.calendarIntegration?.defaultMeetingDuration || 60));
    setCustomDuration('');
    setIsVirtual(false);
    setVirtualMode('google_meet');
    setMeetingLink('');
    setLocation(projectContext?.location || '');
    setNotes('');
    setAgenda([]);
    setOthers([]);
    setError(null);
    setReviewMom(null);

    const clients: Person[] = [];
    if (projectContext?.clientName) {
      clients.push({ key: 'client:main', name: projectContext.clientName, email: String(projectContext.clientEmail || '').trim(), side: 'client', role: 'Client' });
    }
    setClientPeople(clients);
    setClientOn(new Set(clients.map((c) => c.key)));

    // The person scheduling, and the designers on this project, are ticked to start.
    const me = lc(currentUserAuth?.email);
    let assigned: string[] = [];
    try { assigned = (designersOn?.({ id: projectId, context: projectContext }) || []).map((e: any) => lc(typeof e === 'string' ? e : e?.email)); } catch { assigned = []; }
    setTeamOn(new Set(team.filter((p) => (me && lc(p.email) === me) || assigned.includes(lc(p.email))).map((p) => p.key)));

    // Earlier meetings and minutes, for title and agenda suggestions.
    const base = `organizations/${studioId}/projects/${projectId}`;
    Promise.all([
      getDocs(collection(fsDb, `${base}/siteVisits`)).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
      getDocs(collection(fsDb, `${base}/moms`)).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
    ]).then(([visits, moms]) => setHistory({ visits: visits as any[], moms: moms as any[] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultType, projectId, studioId]);

  /* ---------------------------------------------------------------- suggestions */

  const titleIdeas = useMemo(() => {
    const ideas: string[] = [];
    // A running series ("Design Discussion - Part 3") suggests its next part.
    const series = history.visits
      .filter((v) => v.type === type)
      .sort((a, b) => toMillis(b.date) - toMillis(a.date))
      .map((v) => String(v.title || '').match(/^(.*?)\s*[-–·:]\s*part\s*(\d+)\s*$/i))
      .find(Boolean);
    if (series) ideas.push(`${series[1].trim()} · Part ${Number(series[2]) + 1}`);
    (TITLE_IDEAS[type] || []).forEach((t) => { if (!ideas.some((i) => lc(i).startsWith(lc(t)))) ideas.push(t); });
    return ideas.slice(0, 4);
  }, [history.visits, type]);

  /** Actions still open in earlier minutes, newest first. */
  const openItems = useMemo(() => {
    const items: { text: string; ref: string; due?: number | null }[] = [];
    history.moms
      .filter((m) => m.status !== 'draft' || m.sharedAt)
      .sort((a, b) => toMillis(b.meetingDate) - toMillis(a.meetingDate))
      .forEach((m) => (m.actionItems || []).forEach((a: any) => {
        if (a?.status === 'open' && a?.text) items.push({ text: a.text, ref: m.momRef || 'MoM', due: a.dueDate || null });
      }));
    return items.slice(0, 6);
  }, [history.moms]);

  /* ---------------------------------------------------------------- derived */

  const selectedPeople: Person[] = useMemo(() => [
    ...(showsClient ? clientPeople.filter((p) => clientOn.has(p.key)) : []),
    ...team.filter((p) => teamOn.has(p.key)),
    ...others,
  ], [showsClient, clientPeople, clientOn, team, teamOn, others]);

  const counts = useMemo(() => ({
    client: selectedPeople.filter((p) => p.side === 'client').length,
    studio: selectedPeople.filter((p) => p.side === 'ffds').length,
    other: selectedPeople.filter((p) => p.side === 'vendor').length,
  }), [selectedPeople]);

  const clientEmailIsStudio = clientPeople.some((p) => p.email && studioEmails.has(lc(p.email)));
  const finalDuration = duration === 0 ? (parseInt(customDuration) || 60) : duration;
  const endTime = (() => {
    const [h, m] = startTime.split(':').map(Number);
    const t = h * 60 + m + finalDuration;
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  })();
  const prefix = settings?.calendarIntegration?.calendarEventPrefix || '[BOQ Copilot]';
  const previewTitle = `${prefix} ${meetingTypeLabel(type)}: ${title || (isSite ? 'Site visit' : 'Meeting')} — ${projectName}`;
  const whereText = isVirtual
    ? virtualMode === 'google_meet' ? 'Google Meet' : virtualMode === 'phone' ? 'Phone call' : 'Online link'
    : location || 'Venue to be set';
  const invited = selectedPeople.filter((p) => EMAIL_RX.test(p.email)).length;

  const timeSlots = useMemo(() => {
    const s: string[] = [];
    for (let i = 7; i <= 21; i++) { s.push(`${String(i).padStart(2, '0')}:00`); s.push(`${String(i).padStart(2, '0')}:30`); }
    return s;
  }, []);

  if (!isOpen) return null;

  /* ---------------------------------------------------------------- actions */

  const handleConnectCalendar = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      if (await connectGoogleCalendar()) setHasCalendarToken(true);
    } catch (e: any) {
      const code = e?.code || '';
      setError(code === 'auth/popup-blocked'
        ? 'Your browser blocked the Google pop-up. Allow pop-ups for this site and try again.'
        : code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user'
          ? 'Google sign-in was cancelled.'
          : 'Could not connect Google Calendar.');
    } finally {
      setIsConnecting(false);
    }
  };

  const addOther = () => {
    const name = draftName.trim();
    if (!name) return;
    setOthers([...others, { key: `o:${Date.now()}`, name, email: draftEmail.trim(), side: 'vendor', role: draftRole.trim() || 'Vendor' }]);
    setDraftName(''); setDraftEmail(''); setDraftRole('');
  };

  const addClient = () => {
    const name = clientDraftName.trim();
    if (!name) return;
    const p: Person = { key: `c:${Date.now()}`, name, email: clientDraftEmail.trim(), side: 'client', role: 'Client' };
    setClientPeople([...clientPeople, p]);
    setClientOn(new Set([...clientOn, p.key]));
    setClientDraftName(''); setClientDraftEmail(''); setAddingClient(false);
  };

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(key) ? n.delete(key) : n.add(key);
    apply(n);
  };

  const validate = (): string | null => {
    if (!title.trim()) return 'Add a purpose or title.';
    if (!date) return 'Pick a date.';
    if (duration === 0 && !(parseInt(customDuration) > 0)) return 'Enter the duration in minutes.';
    if (!isVirtual && !location.trim()) return 'Add the location, or tick Virtual meeting.';
    if (isVirtual && virtualMode === 'link' && !/^https?:\/\//i.test(meetingLink.trim())) return 'Paste the meeting link (starting with https://).';
    const badEmail = selectedPeople.find((p) => p.email && !EMAIL_RX.test(p.email));
    if (badEmail) return `${badEmail.name}'s email doesn't look right.`;
    return null;
  };

  const save = async (andDraft: boolean) => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    if (andDraft && !notes.trim()) { setError('Add the meeting notes first, then draft the MoM.'); return; }
    setError(null);
    setSaving(andDraft ? 'mom' : 'save');
    try {
      const people = selectedPeople.map(({ name, email, side, role }) => ({ name, email, side, role: role || null }));
      const virtualLabel = virtualMode === 'google_meet' ? 'Google Meet' : virtualMode === 'phone' ? 'Phone call' : meetingLink.trim();
      const visitId = await logSiteVisit(
        {
          type,
          title: title.trim(),
          date: new Date(date),
          startTime,
          durationMinutes: finalDuration,
          phaseStepNumber: currentPhaseStep,
          phaseTitle: currentPhaseTitle,
          // The plain lists every older screen reads, in the same order as `people`.
          attendees: people.map((p) => p.name),
          attendeeEmails: people.map((p) => p.email || ''),
          people,
          agenda,
          notes,
          location: isVirtual ? virtualLabel : location.trim(),
          isVirtual,
          meetingMode: isVirtual ? virtualMode : 'in_person',
          meetingLink: isVirtual && virtualMode === 'link' ? meetingLink.trim() : null,
          momData: null,
        } as any,
        projectId,
        studioId,
        projectContext,
        settings,
      );

      if (!andDraft) {
        onSuccess?.();
        onClose();
        return;
      }

      const known = [
        people.filter((p) => p.side === 'client').length && `Client side: ${people.filter((p) => p.side === 'client').map((p) => p.name).join(', ')}`,
        people.filter((p) => p.side === 'ffds').length && `Studio side ("ffds"): ${people.filter((p) => p.side === 'ffds').map((p) => `${p.name}${p.role ? ` (${p.role})` : ''}`).join(', ')}`,
        people.filter((p) => p.side === 'vendor').length && `Vendors/others ("vendor"): ${people.filter((p) => p.side === 'vendor').map((p) => `${p.name}${p.role ? ` (${p.role})` : ''}`).join(', ')}`,
      ].filter(Boolean).join('. ');

      const momId = await createMoMFromNotes(
        studioId, projectId, projectName, visitId, type, title.trim(),
        new Date(`${date}T${startTime}:00`).getTime(), notes, known, auth.currentUser?.uid || 'unknown',
      );
      const momRef = doc(fsDb, `organizations/${studioId}/projects/${projectId}/moms`, momId);
      // The attendees are who was invited, with the sides chosen here -- not the AI's guess.
      if (people.length) {
        await updateDoc(momRef, { attendees: people.map(({ name, side, role }) => ({ name, side, role: role || null })) });
      }
      const snap = await getDoc(momRef);
      onSuccess?.();
      if (snap.exists()) setReviewMom({ id: snap.id, ...(snap.data() as any) } as MOM);
      else onClose();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ? `Could not save: ${e.message}` : 'Could not save the meeting. Try again.');
    } finally {
      setSaving(null);
    }
  };

  if (reviewMom) {
    return (
      <MomReviewModal
        mom={reviewMom}
        projectId={projectId}
        studioId={studioId}
        projectContextName={projectName}
        onClose={() => { setReviewMom(null); onClose(); }}
      />
    );
  }

  /* ---------------------------------------------------------------- view */

  /*
    Calm by default. One column; choices as slim segmented switches; the people
    as one row of chips coloured by side, with suggestions to tap underneath
    instead of three boxed lists; earlier open items folded into one line.
    Sections ease in when they appear (svl-in), and not at all for anyone who
    asks the system for reduced motion.
  */
  const addPerson = () => {
    const name = draftName.trim();
    if (!name) return;
    const email = draftEmail.trim();
    if (addSide === 'client') {
      const p: Person = { key: `c:${Date.now()}`, name, email, side: 'client', role: 'Client' };
      setClientPeople([...clientPeople, p]);
      setClientOn(new Set([...clientOn, p.key]));
    } else {
      setOthers([...others, { key: `o:${Date.now()}`, name, email, side: 'vendor', role: draftRole.trim() || 'Vendor' }]);
    }
    setDraftName(''); setDraftEmail(''); setDraftRole('');
    setAddingClient(false);
  };

  const removePerson = (p: Person) => {
    if (p.side === 'client') toggle(clientOn, p.key, setClientOn);
    else if (p.side === 'ffds') toggle(teamOn, p.key, setTeamOn);
    else setOthers(others.filter((o) => o.key !== p.key));
  };

  const suggestions: Person[] = [
    ...(showsClient ? clientPeople.filter((p) => !clientOn.has(p.key)) : []),
    ...team.filter((p) => !teamOn.has(p.key)),
  ];

  const SIDE_DOT: Record<Side, string> = { client: 'bg-emerald-500', ffds: 'bg-[#3D52A0]', vendor: 'bg-amber-500' };
  const SIDE_WORD: Record<Side, string> = { client: 'Client', ffds: 'Studio', vendor: 'Vendor' };

  const label = 'block text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500';
  const input = 'w-full px-3.5 py-2.5 bg-slate-50/70 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 hover:bg-slate-100/70 focus:bg-white focus:border-[#3D52A0]/40 focus:ring-4 focus:ring-[#3D52A0]/10 outline-none transition';
  const seg = 'inline-flex flex-wrap gap-1 p-1 bg-slate-100/80 rounded-xl';
  const segBtn = (on: boolean) => `px-3 py-1.5 rounded-lg text-[13px] transition-all duration-200 ${on ? 'bg-white text-[#2C3C78] font-bold shadow-[0_1px_3px_rgba(20,26,51,0.12)]' : 'text-slate-600 font-medium hover:text-slate-900'}`;
  const categoryNote = MEETING_CATEGORIES.find((c) => c.id === type)?.note;

  return (
    <div className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center sm:p-4 svl-fade">
      <style>{`
        @keyframes svlIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        @keyframes svlUp { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes svlFade { from { opacity: 0; } to { opacity: 1; } }
        .svl-in { animation: svlIn .22s ease-out both; }
        .svl-up { animation: svlUp .28s cubic-bezier(.2,.8,.2,1) both; }
        .svl-fade { animation: svlFade .2s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .svl-in, .svl-up, .svl-fade { animation: none; } }
      `}</style>
      <div className="svl-up bg-white sm:rounded-2xl rounded-t-2xl shadow-[0_30px_80px_-30px_rgba(20,26,51,0.45)] w-full max-w-2xl flex flex-col max-h-[94vh] sm:max-h-[90vh] overflow-hidden font-sans">

        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[19px] font-extrabold text-slate-900 tracking-tight">{isSite ? 'Log a site visit' : 'Schedule a meeting'}</h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5 truncate">{projectName} · Stage {currentPhaseStep}, {currentPhaseTitle}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={seg}>
              <button type="button" onClick={() => setType('site_visit')} className={segBtn(isSite)}><HardHat size={13} className="inline mr-1 -mt-0.5" />Site visit</button>
              <button type="button" onClick={() => { if (isSite) setType('client_meeting'); }} className={segBtn(!isSite)}><Users size={13} className="inline mr-1 -mt-0.5" />Meeting</button>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-5 space-y-5">

          {/* Kind of meeting */}
          {!isSite && (
            <div className="space-y-1.5 svl-in">
              <div className={seg} role="radiogroup" aria-label="Meeting category">
                {MEETING_CATEGORIES.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={type === c.id} onClick={() => setType(c.id)} className={segBtn(type === c.id)}>
                    {c.label.replace(' meeting', '')}
                  </button>
                ))}
              </div>
              <p key={type} className="text-[12px] text-slate-500 svl-in">{categoryNote}</p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <label htmlFor="svl-title" className="sr-only">Purpose or title</label>
            <input id="svl-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-0 py-1.5 bg-transparent border-0 border-b-2 border-slate-200 text-[17px] font-bold text-slate-900 placeholder:font-semibold placeholder-slate-300 focus:border-[#3D52A0] outline-none transition"
              placeholder={isSite ? 'What is this visit for?' : 'What is this meeting about?'} />
            {titleIdeas.length > 0 && !title && (
              <div className="flex flex-wrap gap-1.5 svl-in">
                {titleIdeas.map((t) => (
                  <button key={t} type="button" onClick={() => setTitle(t)}
                    className="text-[12px] px-2.5 py-1 rounded-full text-slate-600 bg-slate-100/80 hover:bg-[#E8ECFB] hover:text-[#2C3C78] transition">{t}</button>
                ))}
              </div>
            )}
          </div>

          {/* When */}
          <div className="space-y-2">
            <span className={label}>When</span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input id="svl-date" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} pl-9 w-auto`} />
              </div>
              <div className="relative">
                <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select id="svl-time" aria-label="Start time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${input} pl-9 pr-3 w-auto appearance-none`}>
                  {timeSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className={seg} role="radiogroup" aria-label="Duration">
                {DURATIONS.map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={duration === d} onClick={() => setDuration(d)} className={segBtn(duration === d)}>
                    {d === 30 ? '30m' : d === 60 ? '1h' : d === 90 ? '1.5h' : '2h'}
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={duration === 0} onClick={() => setDuration(0)} className={segBtn(duration === 0)}>Other</button>
              </div>
              {duration === 0 && (
                <span className="flex items-center gap-1.5 svl-in">
                  <input type="number" min={15} step={15} value={customDuration} onChange={(e) => setCustomDuration(e.target.value)}
                    aria-label="Duration in minutes" placeholder="90" className={`${input} w-20 py-2`} />
                  <span className="text-xs text-slate-500">min</span>
                </span>
              )}
            </div>
          </div>

          {/* Where */}
          <div className="space-y-2">
            <span className={label}>Where</span>
            {!isSite && (
              <div className={seg} role="radiogroup" aria-label="Where">
                <button type="button" role="radio" aria-checked={!isVirtual} onClick={() => setIsVirtual(false)} className={segBtn(!isVirtual)}><MapPin size={13} className="inline mr-1 -mt-0.5" />In person</button>
                <button type="button" role="radio" aria-checked={isVirtual && virtualMode === 'google_meet'} onClick={() => { setIsVirtual(true); setVirtualMode('google_meet'); }} className={segBtn(isVirtual && virtualMode === 'google_meet')}><Video size={13} className="inline mr-1 -mt-0.5" />Google Meet</button>
                <button type="button" role="radio" aria-checked={isVirtual && virtualMode === 'link'} onClick={() => { setIsVirtual(true); setVirtualMode('link'); }} className={segBtn(isVirtual && virtualMode === 'link')}><Link2 size={13} className="inline mr-1 -mt-0.5" />Zoom / Teams</button>
                <button type="button" role="radio" aria-checked={isVirtual && virtualMode === 'phone'} onClick={() => { setIsVirtual(true); setVirtualMode('phone'); }} className={segBtn(isVirtual && virtualMode === 'phone')}><Phone size={13} className="inline mr-1 -mt-0.5" />Phone</button>
              </div>
            )}
            {!isVirtual && (
              <div key="inperson" className="space-y-1.5 svl-in">
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={input} placeholder="Venue or address" aria-label="Location" />
                <div className="flex flex-wrap gap-1.5">
                  {projectContext?.location && location !== projectContext.location && (
                    <button type="button" onClick={() => setLocation(projectContext.location)} className="text-[12px] px-2.5 py-1 rounded-full text-slate-600 bg-slate-100/80 hover:bg-[#E8ECFB] transition"><HardHat size={11} className="inline mr-1 -mt-0.5" />Site · {projectContext.location}</button>
                  )}
                  {orgData?.officeAddress && location !== orgData.officeAddress && (
                    <button type="button" onClick={() => setLocation(orgData.officeAddress)} className="text-[12px] px-2.5 py-1 rounded-full text-slate-600 bg-slate-100/80 hover:bg-[#E8ECFB] transition max-w-full truncate"><Building2 size={11} className="inline mr-1 -mt-0.5" />Studio</button>
                  )}
                </div>
              </div>
            )}
            {isVirtual && virtualMode === 'link' && (
              <input key="link" type="url" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} className={`${input} svl-in`} placeholder="https://zoom.us/j/… or Teams link" aria-label="Meeting link" />
            )}
            {isVirtual && virtualMode === 'google_meet' && (
              <p key="meet" className="text-[12px] text-slate-500 svl-in">
                {hasCalendarToken ? 'A Meet link is created when you save and goes out with the invite.' : <>The Meet link needs Google Calendar. <button type="button" onClick={handleConnectCalendar} disabled={isConnecting} className="font-bold text-[#3D52A0] hover:underline">{isConnecting ? 'Connecting…' : 'Connect Google'}</button></>}
              </p>
            )}
          </div>

          {/* Who */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className={label}>Who's attending</span>
              <span className="text-[11.5px] text-slate-500">
                {selectedPeople.length === 0 ? 'No one yet' : `${selectedPeople.length} · ${[showsClient && counts.client ? `${counts.client} client` : '', counts.studio ? `${counts.studio} studio` : '', counts.other ? `${counts.other} other` : ''].filter(Boolean).join(', ')}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedPeople.map((p) => (
                <span key={p.key} className="svl-in inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-white border border-slate-200 text-[12.5px] text-slate-800 shadow-[0_1px_2px_rgba(20,26,51,0.06)]"
                  title={[SIDE_WORD[p.side], p.role, p.email || 'no email'].filter(Boolean).join(' · ')}>
                  <span className={`w-1.5 h-1.5 rounded-full ${SIDE_DOT[p.side]}`} aria-hidden />
                  <span className="font-semibold">{p.name}</span>
                  {p.side !== 'client' && p.role && <span className="text-slate-400">{p.role}</span>}
                  {!p.email && <span className="text-amber-600 text-[11px]">no email</span>}
                  <button type="button" onClick={() => removePerson(p)} aria-label={`Remove ${p.name}`} className="p-0.5 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100"><X size={12} /></button>
                </span>
              ))}
              {!addingClient && (
                <button type="button" onClick={() => { setAddSide(showsClient ? 'client' : 'vendor'); setAddingClient(true); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-[12.5px] font-semibold text-slate-600 hover:border-[#3D52A0] hover:text-[#3D52A0] transition"><Plus size={13} />Someone else</button>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] text-slate-400">Add:</span>
                {suggestions.map((p) => (
                  <button key={p.key} type="button" onClick={() => (p.side === 'client' ? toggle(clientOn, p.key, setClientOn) : toggle(teamOn, p.key, setTeamOn))}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] text-slate-600 bg-slate-100/80 hover:bg-[#E8ECFB] hover:text-[#2C3C78] transition">
                    <span className={`w-1.5 h-1.5 rounded-full ${SIDE_DOT[p.side]}`} aria-hidden />{p.name}
                  </button>
                ))}
              </div>
            )}
            {addingClient && (
              <div className="svl-in rounded-xl bg-slate-50 p-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={seg} role="radiogroup" aria-label="Side">
                    {showsClient && <button type="button" role="radio" aria-checked={addSide === 'client'} onClick={() => setAddSide('client')} className={segBtn(addSide === 'client')}>Client side</button>}
                    <button type="button" role="radio" aria-checked={addSide === 'vendor'} onClick={() => setAddSide('vendor')} className={segBtn(addSide === 'vendor')}>Vendor / other</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Name" aria-label="Name" className={`${input} bg-white`} autoFocus />
                  {addSide === 'vendor'
                    ? <input value={draftRole} onChange={(e) => setDraftRole(e.target.value)} placeholder="Role, e.g. Carpenter" aria-label="Role" className={`${input} bg-white`} />
                    : <span className="hidden sm:block" />}
                  <input value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} placeholder="Email (optional)" aria-label="Email" className={`${input} bg-white`}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }} />
                </div>
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setAddingClient(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/60">Cancel</button>
                  <button type="button" onClick={addPerson} disabled={!draftName.trim()} className="px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white text-xs font-bold disabled:opacity-40">Add</button>
                </div>
              </div>
            )}
            {clientEmailIsStudio && showsClient && (
              <p className="svl-in text-[12px] text-rose-700 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-px" />The project's client email is a studio address, so the client won't get the invite or MoM. Fix it in project details.</p>
            )}
          </div>

          {/* Earlier open items, folded */}
          {openItems.length > 0 && (
            <div className="rounded-xl bg-amber-50/60">
              <button type="button" onClick={() => setAgendaOpen(!agendaOpen)} aria-expanded={agendaOpen}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left">
                <span className="text-[13px] text-amber-950"><b>{openItems.length} open item{openItems.length === 1 ? '' : 's'}</b> from earlier meetings{agenda.length ? ` · ${agenda.length} on the agenda` : ''}</span>
                <span className={`text-amber-800 text-xs font-bold transition-transform duration-200 ${agendaOpen ? 'rotate-180' : ''}`} aria-hidden>▾</span>
              </button>
              {agendaOpen && (
                <div className="svl-in px-3.5 pb-3 flex flex-wrap gap-1.5">
                  {openItems.map((it, i) => {
                    const on = agenda.includes(it.text);
                    const overdue = it.due && it.due < Date.now();
                    return (
                      <button key={i} type="button" onClick={() => setAgenda(on ? agenda.filter((a) => a !== it.text) : [...agenda, it.text])}
                        className={`text-left text-[12px] px-2.5 py-1.5 rounded-xl border transition ${on ? 'bg-white border-[#3D52A0] text-[#2C3C78] font-semibold' : 'bg-white/70 border-amber-200/70 text-amber-950 hover:bg-white'}`}>
                        {on && <Check size={12} className="inline mr-1 -mt-0.5" />}{it.text}<span className="text-slate-400"> · {it.ref}{overdue ? ' · overdue' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label htmlFor="svl-notes" className={label}>Notes or agenda</label>
            <textarea id="svl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
              className={`${input} resize-y leading-relaxed`}
              placeholder={isSite
                ? 'Rough notes are fine, e.g. False ceiling locked at 9\'4". Leak in the toilet duct. Living room marble confirmed.'
                : 'Rough notes are fine, e.g. Client chose beige marble over tiles. Divider signed off. Dining layout needed by Friday.'} />
            <p className="text-[11.5px] text-slate-400">Afterwards, paste rough notes and use <b className="text-slate-500">Save &amp; draft MoM</b>. You review every line before anything is sent.</p>
          </div>

          {!hasCalendarToken && !(isVirtual && virtualMode === 'google_meet') && (
            <p className="text-[12px] text-slate-500 flex items-center gap-1.5">
              <CalendarRange size={13} className="text-slate-400" />
              Google Calendar isn't connected, so no invites go out.
              <button type="button" onClick={handleConnectCalendar} disabled={isConnecting} className="font-bold text-[#3D52A0] hover:underline">{isConnecting ? 'Connecting…' : 'Connect'}</button>
            </p>
          )}

          {error && (
            <p role="alert" className="svl-in text-sm text-rose-800 bg-rose-50 rounded-xl px-3.5 py-2.5 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />{error}
            </p>
          )}
        </div>

        {/* Footer: the invite as it will go out */}
        <div className="px-5 sm:px-6 py-3.5 bg-[#3D52A0] text-white flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate">{title || (isSite ? 'Site visit' : 'Meeting')} <span className="font-normal text-[#D5DCF7]">· {meetingTypeLabel(type)}</span></p>
            <p className="text-[11.5px] text-[#D5DCF7] truncate">{date} · {startTime}–{endTime} · {whereText}{!isSite && hasCalendarToken ? ` · ${invited} invited` : ''}</p>
          </div>
          <div className="flex gap-2 justify-end shrink-0">
            <button type="button" onClick={onClose} disabled={!!saving} className="px-3 py-2 text-[#E3E8FB] hover:text-white text-sm font-semibold rounded-xl transition disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => save(false)} disabled={!!saving}
              className="px-3.5 py-2 border border-white/45 text-white text-sm font-bold rounded-xl hover:bg-white/10 transition disabled:opacity-50 flex items-center gap-2">
              {saving === 'save' && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
            <button type="button" onClick={() => save(true)} disabled={!!saving}
              className="px-4 py-2 bg-white text-[#2C3C78] text-sm font-extrabold rounded-xl hover:bg-[#F2F4FD] transition disabled:opacity-60 flex items-center gap-2">
              {saving === 'mom' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {saving === 'mom' ? 'Drafting MoM…' : 'Save & draft MoM'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
