import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Plus, Check } from '@/lib/lucide-shim';
import { useOrg } from '../../contexts/OrgContext';
import { useProjectTeam } from '../../services/projectTeam';
import { loadLeads, createLead, saveLead, withTouch } from '../../services/leadsService';
import {
  LEAD_SOURCES, LEAD_STAGES, leadName, leadToProject, leadOpenedAsProject, quickLeadDraft, startableLeads, draftProblems,
  type Lead, type LeadSource,
} from '../../lib/leads';
import '../projectHeader/projectHeader.css';

/*
  New Project starts from a lead.

  Projects could be opened from the Home or Projects screen whether or not the
  enquiry was on the Ops Desk, so the two never met: the lead sat in Ops Desk
  with no project, and the project began with none of the lead's people,
  brief or history. Now the studio picks the lead (or adds it right here), and
  the project opens the way Ops Desk opens one: the lead's details on the
  project, the lead linked and moved to Proposal sent, its owner assigned.

  Only those who run the desk may do it (Owner, Admin, Ops Director): the same
  people who can see every lead and open a project from Ops Desk. Anyone else
  is told whom to ask. A practice or demo project needs no lead and is tagged
  Dummy, so it stays out of the desk and the numbers.
*/

interface Props {
  /** Owner, Admin, Ops Director or Super Admin: may see the leads and open a project. */
  canStart: boolean;
  /** Creates and saves the project from the lead's details; resolves to its id. */
  createProject: (context: Record<string, any>) => Promise<string>;
  /** Opens the project just created, in its setup. */
  onOpened: (projectId: string) => void;
  /** A practice or demo project, without a lead. */
  onPractice: () => void;
  onClose: () => void;
}

const field = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]';
const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';

export default function StartProjectModal({ canStart, createProject, onOpened, onPractice, onClose }: Props) {
  const { orgData, currentUserAuth } = useOrg();
  const tenantId = orgData?.tenantId || '';
  const me = {
    email: String(currentUserAuth?.email || '').toLowerCase(),
    name: currentUserAuth?.displayName || currentUserAuth?.email || 'Studio',
  };
  const { toggle: assign } = useProjectTeam();

  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [quick, setQuick] = useState({ name: '', phone: '', email: '', where: '', source: 'walkin' as LeadSource });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canStart || !tenantId) return;
    let live = true;
    loadLeads(tenantId, me.email, true)
      .then((ls) => { if (live) setLeads(startableLeads(ls)); })
      .catch((e) => { if (live) { setLeads([]); setLoadError(e?.message || 'The leads could not be read.'); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart, tenantId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  /* No leads to pick from: go straight to adding one. */
  useEffect(() => { if (leads && leads.length === 0) setAdding(true); }, [leads]);

  const shown = useMemo(() => (leads || []).filter((l) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [leadName(l), l.home.where, l.home.type, ...l.people.flatMap((p) => [p.name, p.phone, p.email])]
      .join(' ').toLowerCase().includes(t);
  }), [leads, q]);

  const quickProblems = draftProblems(quickLeadDraft(quick, Date.now()));

  const openFrom = async (lead: Lead) => {
    const projectId = await createProject(leadToProject(lead));
    const opened = leadOpenedAsProject(lead, projectId);
    await saveLead(withTouch(opened.lead, opened.touch, me), me.email);
    if (lead.ownerEmail && lead.ownerEmail !== me.email) await assign({ id: projectId }, lead.ownerEmail).catch(() => undefined);
    onOpened(projectId);
  };

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      if (adding) {
        if (quickProblems.length) throw new Error(`Add ${quickProblems.join(', ')}.`);
        const lead = await createLead(quickLeadDraft(quick, Date.now()), { tenantId, me, owner: me });
        await openFrom(lead);
      } else {
        const lead = (leads || []).find((l) => l.id === picked);
        if (!lead) throw new Error('Pick the lead this project is for.');
        await openFrom(lead);
      }
    } catch (e: any) {
      setError(e?.message || 'The project could not be started. Try again.');
      setBusy(false);
    }
  };

  const stageOf = (l: Lead) => LEAD_STAGES.find((s) => s.id === l.stage)?.label || l.stage;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Start a project">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="phd-pop relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="p-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">New project</p>
              <h3 className="font-bold text-slate-800 mt-1">{canStart ? 'Which lead is this for?' : 'Projects start from a lead'}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {canStart
                  ? 'Every project starts from a lead in Ops Desk, so the client, their brief and the history come with it.'
                  : 'A project is opened from its lead in Ops Desk. Ask an Owner, Admin or Ops Director to open it for you.'}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="w-4 h-4" /></button>
          </div>

          {canStart && !adding && (leads?.length || 0) > 0 && (
            <label className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-500 focus-within:ring-2 focus-within:ring-[#3D52A0]/30 focus-within:border-[#3D52A0]">
              <Search className="w-3.5 h-3.5" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a lead by name, phone or place…" aria-label="Find a lead" className="flex-1 outline-none bg-transparent text-slate-800" />
            </label>
          )}
        </div>

        {canStart && (
          <div className="flex-1 overflow-y-auto p-2">
            {leads === null && <p className="text-xs text-slate-500 p-4 text-center">Reading the leads…</p>}
            {loadError && <p className="text-xs text-rose-600 px-4 pt-3">{loadError}</p>}

            {!adding && leads && leads.length > 0 && (
              <>
                {shown.length === 0 && <p className="text-xs text-slate-500 p-4 text-center">No lead matches. Add it below.</p>}
                <ul className="divide-y divide-slate-100">
                  {shown.map((l, i) => {
                    const on = picked === l.id;
                    return (
                      <li key={l.id} className="hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                        <button
                          type="button"
                          onClick={() => setPicked(l.id)}
                          aria-pressed={on}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left ${on ? 'bg-[#3D52A0]/10' : 'hover:bg-slate-50'}`}
                        >
                          <span className={`w-5 h-5 rounded-full grid place-items-center border-2 shrink-0 ${on ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'border-slate-300 text-transparent'}`}>
                            <Check className="w-3 h-3" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-slate-800 truncate">{leadName(l)}</span>
                            <span className="block text-xs text-slate-500 truncate">
                              {[l.home.type, l.home.where.split(/[·,]/)[0].trim(), stageOf(l), l.ownerName ? `${l.ownerName}’s lead` : ''].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {adding ? (
              <div className="p-3 space-y-3">
                {leads && leads.length > 0 && (
                  <button type="button" onClick={() => setAdding(false)} className="text-xs font-bold text-[#3D52A0] hover:text-[#334486]">‹ Pick an existing lead</button>
                )}
                <p className="text-sm font-semibold text-slate-800">{leads && leads.length === 0 ? 'No open leads yet. Add this one.' : 'Add the lead'}</p>
                <div>
                  <label className={label} htmlFor="sp-name">Client name</label>
                  <input id="sp-name" className={field} value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} placeholder="e.g. Rahul Sharma" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label} htmlFor="sp-phone">Phone</label>
                    <input id="sp-phone" className={field} value={quick.phone} onChange={(e) => setQuick({ ...quick, phone: e.target.value })} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className={label} htmlFor="sp-email">Email</label>
                    <input id="sp-email" className={field} value={quick.email} onChange={(e) => setQuick({ ...quick, email: e.target.value })} placeholder="name@example.com" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label} htmlFor="sp-where">Where</label>
                    <input id="sp-where" className={field} value={quick.where} onChange={(e) => setQuick({ ...quick, where: e.target.value })} placeholder="Building, area" />
                  </div>
                  <div>
                    <label className={label} htmlFor="sp-source">Came from</label>
                    <select id="sp-source" className={field} value={quick.source} onChange={(e) => setQuick({ ...quick, source: e.target.value as LeadSource })}>
                      {LEAD_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">It goes on the Ops Desk as your lead, already linked to this project.</p>
              </div>
            ) : leads && leads.length > 0 && (
              <div className="p-3">
                <button type="button" onClick={() => { setAdding(true); setPicked(null); }} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3D52A0] hover:text-[#334486]">
                  <Plus className="w-3.5 h-3.5" /> Not in Ops Desk yet? Add the lead
                </button>
              </div>
            )}
          </div>
        )}

        <div className="p-4 border-t border-slate-100 bg-slate-50">
          {error && <p className="text-xs text-rose-600 mb-2" role="alert">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            {canStart ? (
              <button type="button" onClick={onPractice} disabled={busy} className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
                Practice or demo project (no lead)
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">
                {canStart ? 'Cancel' : 'Close'}
              </button>
              {canStart && (
                <button
                  type="button"
                  onClick={start}
                  disabled={busy || (adding ? quickProblems.length > 0 : !picked)}
                  className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50"
                >
                  {busy ? 'Starting…' : adding ? 'Add lead and start' : 'Start the project'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
