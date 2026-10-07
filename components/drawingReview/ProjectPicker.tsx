import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

/*
  WHICH PROJECT AM I LOOKING AT.

  Many projects share a working name ("New Project"), so every project is
  shown with its client underneath. A designer with a few projects sees them
  all as tabs, the open one plainly marked. A studio lead with dozens gets one
  clear button that opens a searchable list, projects with sheets waiting on
  top.
*/

export interface PickerProject {
  id: string;
  name: string;
  client?: string;
}

interface Props {
  projects: PickerProject[];
  projectId: string | null;
  onPick: (id: string) => void;
  /** Sheets needing attention per project, shown as a count and sorted first. */
  counts?: Record<string, number>;
  /** The project open elsewhere in the app, marked so it is easy to find. */
  activeId?: string | null;
}

const TABS_UP_TO = 4;

export default function ProjectPicker({ projects, projectId, onPick, counts = {}, activeId }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const current = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => search.current?.focus(), 20);
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const sorted = useMemo(() => [...projects].sort((a, b) =>
    (counts[b.id] || 0) - (counts[a.id] || 0)
    || Number(b.id === activeId) - Number(a.id === activeId)
    || a.name.localeCompare(b.name)), [projects, counts, activeId]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? sorted.filter((p) => `${p.name} ${p.client || ''}`.toLowerCase().includes(t)) : sorted;
  }, [sorted, q]);

  const badge = (id: string, on: boolean) => counts[id]
    ? <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${on ? 'bg-white/20 text-white' : 'bg-[#EEF0FF] text-[#3D52A0]'}`}>{counts[id]}</span>
    : null;

  if (projects.length <= 1) {
    return current ? (
      <div className="min-w-0">
        <p className="text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[#66786F]">Project</p>
        <p className="truncate font-display text-[17px] font-semibold text-[#14211E]">{current.name}{current.client && <span className="ml-2 font-sans text-[13px] font-semibold text-[#66786F]">{current.client}</span>}</p>
      </div>
    ) : null;
  }

  /* A few projects: all of them in view, the open one filled in. */
  if (projects.length <= TABS_UP_TO) {
    return (
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Project">
        {sorted.map((p) => {
          const on = p.id === projectId;
          return (
            <button key={p.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(p.id)}
              className={`flex min-w-[160px] max-w-[280px] items-center gap-2 rounded-xl border px-3.5 py-2 text-left transition ${on ? 'border-[#14211E] bg-[#14211E] text-white shadow-md' : 'border-[#E1E7E3] bg-white text-[#2A3B37] hover:border-[#98A79F]'}`}>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-bold">{p.name}</span>
                {p.client && <span className={`block truncate text-[11.5px] font-semibold ${on ? 'text-white/70' : 'text-[#66786F]'}`}>{p.client}</span>}
              </span>
              {badge(p.id, on)}
            </button>
          );
        })}
      </div>
    );
  }

  /* Many projects: one clear button, a searchable list behind it. */
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox"
        className="flex w-full max-w-[460px] items-center gap-3 rounded-2xl border border-[#E1E7E3] bg-white px-4 py-2.5 text-left shadow-sm transition hover:border-[#98A79F]">
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[#66786F]">Project</span>
          <span className="block truncate font-display text-[17px] font-semibold text-[#14211E]">{current?.name || 'Choose a project'}</span>
          {current?.client && <span className="block truncate text-[12.5px] font-semibold text-[#66786F]">{current.client}</span>}
        </span>
        <span className="shrink-0 rounded-full bg-[#F3F6F4] px-2.5 py-1 text-[11.5px] font-bold text-[#2A3B37]">{projects.length} projects</span>
        <ChevronDown size={18} className={`shrink-0 text-[#66786F] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-[115] mt-2 w-[min(460px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[#E1E7E3] bg-white shadow-2xl">
          <label className="flex items-center gap-2 border-b border-[#ECF0ED] px-3.5 py-2.5">
            <Search size={16} className="text-[#98A79F]" />
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by project or client"
              onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) { onPick(shown[0].id); setOpen(false); setQ(''); } }}
              className="w-full bg-transparent text-[14px] outline-none placeholder:text-[#98A79F]" />
          </label>
          <ul role="listbox" aria-label="Projects" className="max-h-[360px] overflow-y-auto py-1">
            {shown.length ? shown.map((p) => {
              const on = p.id === projectId;
              return (
                <li key={p.id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => { onPick(p.id); setOpen(false); setQ(''); }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition ${on ? 'bg-[#EEF0FF]' : 'hover:bg-[#F3F6F4]'}`}>
                    <span className="w-4 shrink-0">{on && <Check size={16} className="text-[#3D52A0]" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13.5px] ${on ? 'font-extrabold text-[#3D52A0]' : 'font-bold text-[#14211E]'}`}>{p.name}</span>
                      {(p.client || p.id === activeId) && (
                        <span className="block truncate text-[11.5px] font-semibold text-[#66786F]">
                          {[p.client, p.id === activeId && 'open in the app'].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {counts[p.id] ? <span className="shrink-0 rounded-full bg-[#EEF0FF] px-2 py-0.5 text-[11px] font-extrabold text-[#3D52A0]">{counts[p.id]} in review</span> : null}
                  </button>
                </li>
              );
            }) : <li className="px-4 py-6 text-center text-[13px] text-[#66786F]">No project matches “{q}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
