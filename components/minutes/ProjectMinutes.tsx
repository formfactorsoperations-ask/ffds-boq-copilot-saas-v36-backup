import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, ListChecks, CalendarClock, Pencil, X, Loader2, Check } from '@/lib/lucide-shim';
import { useOrg } from '../../contexts/OrgContext';
import { opsSettingsOf } from '../../lib/opsDesk';
import { primaryRole } from '../../lib/roles';
import { isNewMinutes, statusChip, templateById, STAGES, waitingFromMinutes, fmtShortDay, type ChipTone } from '../../lib/minutes';
import { meetingTypeLabel } from '../../lib/meetingTypes';
import { projectMinutes, markFiled } from '../../services/minutesService';
import { MomReviewModal } from '../ops/MomReviewModal';
import { MomCaptureModal } from '../ops/MomCaptureModal';
import { clientContactOf } from '../../lib/minutes';
import { Panel, Chip, Seg, btnPri, btnSm, BRAND_EYEBROW } from './MinutesBits';

/*
  THE PROJECT'S MINUTES (mockup 11).

  One list for the whole project, from the first call to handover, filtered
  by stage. Older minutes sit alongside new ones, marked "Earlier format".
  Open actions are counted across all of them, the next meeting comes from
  the latest minutes, and design changes from the minutes are listed until
  someone marks them on the sheets.
*/

const ISSUED = ['finalised', 'shared', 'acknowledged', 'correction_requested'];
const OLD_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: 'Draft', tone: 'slate' }, pending_review: { label: 'With a lead', tone: 'amber' }, finalised: { label: 'Finalised', tone: 'brand' },
  shared: { label: 'Shared', tone: 'brand' }, acknowledged: { label: 'Acknowledged', tone: 'emerald' }, correction_requested: { label: 'Correction asked', tone: 'rose' },
};

export default function ProjectMinutes({ projectId, projectContext, stage, onClose }: {
  projectId: string;
  projectContext?: any;
  stage?: number | null;
  onClose: () => void;
}) {
  const { orgData, currentUserAuth, currentRole, currentRoles, teamMembers } = useOrg() as any;
  const studioId: string = orgData?.tenantId || '';
  const newFlow = opsSettingsOf(orgData).newMinutes;
  const [moms, setMoms] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState<any | null>(null);
  const [writing, setWriting] = useState(false);
  const [filing, setFiling] = useState(false);

  const load = () => { projectMinutes(studioId, projectId).then(setMoms).catch(() => setMoms([])); };
  useEffect(load, [studioId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const stageOf = (m: any): number => Number(m.stage) || templateById(m.template)?.stage || 0;
  const list = useMemo(() => (moms || []).filter((m) => filter === 'all' || String(stageOf(m)) === filter), [moms, filter]);
  const stagesHere = useMemo(() => [...new Set((moms || []).map(stageOf).filter(Boolean))].sort(), [moms]);

  const counts = useMemo(() => {
    const now = Date.now();
    const monthAgo = now - 30 * 86400000;
    let client = 0, studio = 0, overdue = 0, done = 0;
    for (const m of moms || []) {
      if (!ISSUED.includes(String(m.status))) continue;
      for (const a of m.actionItems || []) {
        if (a.status === 'done') { if ((m.updatedAt || m.meetingDate || 0) > monthAgo) done++; continue; }
        if (a.status === 'cancelled') continue;
        if (a.owner === 'client') client++; else studio++;
        if (a.dueDate && a.dueDate < now) overdue++;
      }
    }
    return { client, studio, overdue, done };
  }, [moms]);
  const next = useMemo(() => (moms || []).find((m) => m.nextMeeting?.date)?.nextMeeting || null, [moms]);
  const changes = useMemo(() => waitingFromMinutes(moms || [], 'designChanges'), [moms]);

  const markChanges = async () => {
    setFiling(true);
    try {
      const email = String(currentUserAuth?.email || '').toLowerCase();
      const name = ((orgData?.team || teamMembers || []) as any[]).find((t) => String(t?.email || '').toLowerCase() === email)?.name || email;
      const me = { email, name, role: primaryRole(currentRoles?.length ? currentRoles : [currentRole]) || null };
      const byMom = new Map<string, string[]>();
      for (const c of changes) byMom.set(c.momId, [...(byMom.get(c.momId) || []), c.item.lineId]);
      for (const [momId, ids] of byMom) await markFiled(studioId, projectId, momId, ids, me, 'design changes');
      load();
    } finally { setFiling(false); }
  };

  const chipOf = (m: any) => {
    if (isNewMinutes(m)) { const c = statusChip(m); return <Chip tone={c.tone}>{c.label}</Chip>; }
    const c = OLD_STATUS[String(m.status)] || OLD_STATUS.draft;
    return <Chip tone={c.tone}>{c.label}</Chip>;
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="The project's minutes">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-[1200px] bg-[#F6F7FB] sm:rounded-3xl border border-slate-200 shadow-2xl overflow-clip flex flex-col max-h-full sm:max-h-[92vh]">
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className={BRAND_EYEBROW}>Minutes · {projectContext?.name || 'Project'}</p>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Every meeting, from the first call to handover</h1>
          </div>
          {newFlow && <button type="button" className={btnPri} onClick={() => setWriting(true)}><Plus className="w-4 h-4" />New minutes</button>}
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl grid place-items-center text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel icon={FileText} title="Minutes" blurb={moms ? `${moms.length} in all, newest first` : 'Loading…'}>
            <Seg label="Stage" value={filter} onChange={setFilter} small
              options={[{ id: 'all', label: `All ${moms?.length || 0}` }, ...stagesHere.map((s) => ({ id: String(s), label: STAGES[s] || `Stage ${s}` }))]} />
            {!moms ? <p className="mt-4 text-xs text-slate-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading the minutes…</p> : !list.length ? (
              <p className="mt-4 text-sm text-slate-500">No minutes here yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 mt-3">
                {list.map((m, i) => (
                  <button key={m.id} type="button" onClick={() => setOpen(m)} className="w-full flex flex-wrap items-center gap-3 py-3 text-left hover:bg-slate-50 rounded-lg px-1 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                    <span className="text-xs font-bold text-slate-500 w-28 tabular-nums">{m.momRef}</span>
                    <span className="flex-1 min-w-[180px]">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{m.meetingTitle || meetingTypeLabel(m.meetingType)}</span>
                      <span className="block text-[11px] text-slate-500">{stageOf(m) ? STAGES[stageOf(m)] : meetingTypeLabel(m.meetingType)} · {m.meetingDate ? fmtShortDay(Number(m.meetingDate)) : ''}</span>
                    </span>
                    {!isNewMinutes(m) && <Chip>Earlier format</Chip>}
                    {chipOf(m)}
                  </button>
                ))}
              </div>
            )}
          </Panel>
          <div className="space-y-5 min-w-0">
            <Panel icon={ListChecks} title="Open actions" blurb="From all minutes, old and new">
              <div className="grid grid-cols-2 gap-2">
                {([['Client', counts.client], ['Studio', counts.studio], ['Overdue', counts.overdue], ['Done this month', counts.done]] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-slate-200 px-3 py-2"><p className={`text-xl font-black tabular-nums ${k === 'Overdue' && v ? 'text-rose-700' : 'text-slate-800'}`}>{v}</p><p className="text-[11px] text-slate-500">{k}</p></div>
                ))}
              </div>
            </Panel>
            <Panel icon={CalendarClock} title="Next meeting" blurb="From the latest minutes">
              <p className="text-sm text-slate-700">{next?.date ? `${next.date}${next.time ? `, ${next.time}` : ''}${next.purpose ? `: ${next.purpose}` : ''}` : 'Not set in the minutes yet.'}</p>
            </Panel>
            {changes.length > 0 && (
              <Panel icon={Pencil} title="Design changes from the minutes" blurb="For the designer, until they are on the sheets">
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {changes.map((c) => <li key={`${c.momId}:${c.item.lineId}`}><b className="text-slate-800">{c.item.room ? `${c.item.room}: ` : ''}</b>{c.item.text}{c.item.sheet ? ` · ${c.item.sheet}` : ''}<span className="text-slate-500"> · {c.ref}</span></li>)}
                </ul>
                <button type="button" className={`${btnSm} mt-3`} disabled={filing} onClick={markChanges}>{filing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}All on the sheets</button>
              </Panel>
            )}
          </div>
        </div>
      </div>
      {open && (
        <MomReviewModal mom={open} projectId={projectId} studioId={studioId} projectContextName={projectContext?.name}
          client={clientContactOf(projectContext)} onClose={() => { setOpen(null); load(); }} />
      )}
      {writing && (
        <MomCaptureModal
          visit={{ id: `ops-${Date.now()}`, type: 'client_meeting', title: '', date: Date.now(), notes: '', attendees: projectContext?.clientName ? [projectContext.clientName] : [], phaseStepNumber: stage || 0 } as any}
          projectId={projectId} studioId={studioId} projectContextName={projectContext?.name || 'Project'}
          onClose={() => setWriting(false)}
          onSuccess={async (momId) => {
            setWriting(false);
            const all = await projectMinutes(studioId, projectId).catch(() => []);
            setMoms(all);
            const m = all.find((x) => x.id === momId);
            if (m) setOpen(m);
          }} />
      )}
    </div>
  );
}
