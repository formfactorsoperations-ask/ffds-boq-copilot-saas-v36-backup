import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from '@/lib/lucide-shim';
import { useProjectDirectory, useProjectTeam, initialsOf, colourOf } from '../../services/projectTeam';
import './projectHeader.css';

interface Props {
  /** Fixed from a Designer's Team row (A2); chosen in the window from the Projects list (A3). */
  designerEmail?: string;
  onClose: () => void;
}

const LIVE = new Set(['won', 'execution', 'work_paused', 'negotiation', 'proposal_sent', 'draft', 'lead']);

/**
 * Hand one Designer a set of projects in one go.
 *
 * Opened from a Designer's row in Studio settings → Team (A2), or from the
 * Projects list (A3), where the Designer is picked first. Every project the
 * studio has is listed with a tick; saving writes the whole set at once
 * through services/projectTeam, so the header faces, the Team row and the
 * Projects list all show the same thing straight away.
 */
export default function AssignProjectsModal({ designerEmail, onClose }: Props) {
  const directory = useProjectDirectory();
  const { designers, designersOn, setDesignerProjects, canAssign } = useProjectTeam();
  const [email, setEmail] = useState<string>((designerEmail || designers[0]?.email || '').toLowerCase());
  const [q, setQ] = useState('');
  const [liveOnly, setLiveOnly] = useState(true);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // The ticks start from what this Designer is on now.
  useEffect(() => {
    setTicked(new Set(directory.filter((p) => designersOn(p).includes(email)).map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, directory.length]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const person = designers.find((d) => d.email === email);
  const shown = useMemo(() => directory
    .filter((p) => !liveOnly || LIVE.has(String(p.status || 'draft')) || ticked.has(p.id))
    .filter((p) => !q.trim() || `${p.name} ${p.client || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(ticked.has(b.id)) - Number(ticked.has(a.id)) || a.name.localeCompare(b.name)),
  [directory, liveOnly, q, ticked]);

  const flip = (id: string) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    if (!email) return;
    setSaving(true);
    try {
      await setDesignerProjects(email, directory, Array.from(ticked));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Assign projects">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="p-5 pb-3 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Assign projects</p>
              <h3 className="text-[16px] font-extrabold text-slate-900 mt-1">Which projects does this Designer work on?</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>

          {designerEmail ? (
            person && (
              <div className="mt-3 flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-extrabold text-white" style={{ background: colourOf(person.email) }}>{initialsOf(person.name)}</span>
                <span className="leading-tight"><b className="text-[13.5px] text-slate-900">{person.name}</b><span className="block text-[11.5px] text-slate-500">{person.email}</span></span>
              </div>
            )
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {designers.length === 0 && <p className="text-[12.5px] text-slate-500">Nobody on the studio team has the Designer role yet. Add them in Studio settings → Team.</p>}
              {designers.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => setEmail(d.email)}
                  aria-pressed={email === d.email}
                  className={`inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border text-[12px] font-bold transition-colors ${email === d.email ? 'border-[#1F4D45] bg-[#F1F7F5] text-[#1F4D45]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  <span className="w-6 h-6 rounded-full grid place-items-center text-[9.5px] font-extrabold text-white" style={{ background: colourOf(d.email) }}>{initialsOf(d.name)}</span>
                  {d.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-[12.5px] text-slate-500">
              <Search className="w-3.5 h-3.5" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project or client…" className="flex-1 outline-none bg-transparent text-slate-800" />
            </label>
            <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} className="accent-[#3D52A0]" />
              Live only
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {shown.length === 0 && <p className="text-[12.5px] text-slate-500 p-4 text-center">No projects match.</p>}
          {shown.map((p) => {
            const on = ticked.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => flip(p.id)}
                aria-pressed={on}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-slate-50 cursor-pointer"
              >
                <span className={`w-5 h-5 rounded-md grid place-items-center border-2 shrink-0 transition-all ${on ? 'bg-[#1F4D45] border-[#1F4D45] text-white scale-105' : 'border-slate-300 text-transparent'}`}>
                  <Check className="w-3 h-3" />
                </span>
                <span className="flex-1 min-w-0 leading-tight">
                  <span className="block text-[13px] font-bold text-slate-900 truncate">{p.name}</span>
                  <span className="block text-[11.5px] text-slate-500 truncate">{p.client || 'No client'} · {String(p.status || 'draft').replace(/_/g, ' ')}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-[12px] text-slate-600"><b className="text-slate-900">{ticked.size}</b> project{ticked.size === 1 ? '' : 's'} ticked</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-[12px] font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={!canAssign || !email || saving}
              className="px-5 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] text-white text-[12px] font-extrabold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
