import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search, Users } from 'lucide-react';
import { useProjectTeam, initialsOf, colourOf } from '../../services/projectTeam';
import './projectHeader.css';

interface Props {
  project: { id: string; context?: any };
  /** `sm` for the Projects list cards. */
  size?: 'md' | 'sm';
  align?: 'left' | 'right';
}

/**
 * The faces of the Designers on a project, and the way to change them (A1 from
 * the header mockups). Anyone may see who is on a project; only the studio's
 * senior roles can tick people on or off. Clicks stay inside, so the control
 * can sit on a project card without opening the project.
 */
export default function ProjectTeamButton({ project, size = 'md', align = 'right' }: Props) {
  const { designers, designersOn, toggle, canAssign } = useProjectTeam();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const on = designersOn(project);
  const onPeople = on.map((email) => designers.find((d) => d.email === email) || { email, name: email.split('@')[0], role: 'Designer' });

  /* Place the list under the faces, kept on screen. */
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = 300;
    const left = align === 'right' ? r.right - width : r.left;
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const reflow = () => place();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = designers.filter((d) => !q.trim() || `${d.name} ${d.email}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Designers on this project: ${onPeople.map((p) => p.name).join(', ') || 'none'}`}
        title={onPeople.length ? onPeople.map((p) => p.name).join(', ') : 'No Designer yet'}
        className={`phd-faces ${size === 'sm' ? 'sm' : ''} rounded-full p-0.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#7091E6]/60`}
      >
        {onPeople.slice(0, 3).map((p) => (
          <span key={p.email} className="phd-face" style={{ background: colourOf(p.email) }}>{initialsOf(p.name)}</span>
        ))}
        {onPeople.length > 3 && <span className="phd-face" style={{ background: '#5A628A' }}>+{onPeople.length - 3}</span>}
        {(canAssign || onPeople.length === 0) && (
          <span className="phd-face add">{onPeople.length === 0 && !canAssign ? <Users className="w-3 h-3" /> : <Plus className="w-3 h-3" />}</span>
        )}
      </button>

      {open && pos && createPortal(
        /* Rendered on the page, not inside the button: a project card is a 3D
           surface whose layers would otherwise paint over the list. */
        <div
          ref={popRef}
          role="dialog"
          aria-label="Designers on this project"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="phd-pop z-[400] w-[300px] bg-white rounded-2xl border border-slate-200 shadow-[0_24px_60px_-24px_rgba(18,24,47,0.45)] p-3"
        >
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400 px-1 mb-2">Designers on this project</p>
          {designers.length > 4 && (
            <label className="flex items-center gap-2 px-2.5 py-1.5 mb-2 rounded-xl border border-slate-200 text-[12.5px] text-slate-500">
              <Search className="w-3.5 h-3.5" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a Designer…" className="flex-1 outline-none bg-transparent text-slate-800" />
            </label>
          )}
          {designers.length === 0 && (
            <p className="text-[12px] text-slate-500 px-1 py-2">
              Nobody on the studio team has the Designer role yet. Add them in Studio settings → Team.
            </p>
          )}
          <div className="max-h-[260px] overflow-y-auto">
            {shown.map((d) => {
              const isOn = on.includes(d.email);
              if (!canAssign && !isOn) return null;
              return (
                <button
                  key={d.email}
                  type="button"
                  disabled={!canAssign}
                  aria-pressed={isOn}
                  onClick={() => toggle(project, d.email)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors ${canAssign ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'}`}
                >
                  <span className="w-7 h-7 rounded-full grid place-items-center text-[10.5px] font-extrabold text-white shrink-0" style={{ background: colourOf(d.email) }}>
                    {initialsOf(d.name)}
                  </span>
                  <span className="flex-1 min-w-0 leading-tight">
                    <span className="block text-[13px] font-bold text-slate-900 truncate">{d.name}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{d.email}</span>
                  </span>
                  {canAssign && (
                    <span className={`w-5 h-5 rounded-md grid place-items-center border-2 transition-all ${isOn ? 'bg-[#1F4D45] border-[#1F4D45] text-white scale-105' : 'border-slate-300 text-transparent'}`}>
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 px-1 pt-2 border-t border-slate-100 mt-1">
            {canAssign ? 'Designers see only the projects they are ticked on.' : 'The studio decides who works on a project.'}
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}
