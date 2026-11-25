import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, FileText, Search } from 'lucide-react';
import { commandResults, type CommandItem, type JourneyRow } from '../../../lib/projectsJourney';
import { LABEL } from '../../ui/kit';
import { ProjectPhoto } from './parts';
import '../../projectHeader/projectHeader.css';

/*
  Ctrl K (DESIGN.md "Projects: journey, needs you, one list"). Empty, it offers
  Do next and Recent projects; as you type, Projects, Do next and Jump to (the
  screens of the projects that match). ↑ ↓ move, ↵ opens or does, Esc clears
  the words and then closes.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export default function CommandBar({ rows, onRun, onClose }: {
  rows: JourneyRow[];
  onRun: (item: CommandItem) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const items = useMemo(() => commandResults(rows, q), [rows, q]);
  const cur = Math.min(at, Math.max(items.length - 1, 0));

  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 30); return () => clearTimeout(t); }, []);
  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-cmd-index="${cur}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [cur]);

  const key = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((cur + 1) % Math.max(n, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((cur - 1 + n) % Math.max(n, 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[cur]) onRun(items[cur]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (q) { setQ(''); setAt(0); } else onClose(); }
  };

  let group = '';
  return createPortal(
    <div className="pj-overlay fixed inset-0 z-[300] flex items-start justify-center px-4 pt-[9vh] pb-4" role="dialog" aria-modal="true" aria-label="Find a project or do its next step">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-[760px] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 shrink-0" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setAt(0); }}
            onKeyDown={key}
            placeholder="Find a project or do its next step…"
            aria-label="Find a project or do its next step"
            className="flex-1 min-w-0 bg-transparent outline-none text-xl font-semibold text-slate-800 placeholder:text-slate-400"
          />
          <span className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-md px-1.5 bg-slate-50">Esc</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto pb-1.5" role="listbox" aria-label="Results">
          {items.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className="font-bold text-slate-800">Nothing found</p>
              <p className="text-xs text-slate-500 mt-1">Try a client, a place or a stage.</p>
            </div>
          )}
          {items.map((it, i) => {
            const head = it.group !== group;
            group = it.group;
            const on = i === cur;
            const tone = it.row.next?.tone;
            return (
              <React.Fragment key={`${it.group}:${it.row.id}:${it.title}`}>
                {head && <p className={cx(LABEL, 'px-5 pt-3 pb-1.5')}>{it.group}</p>}
                <div
                  role="option"
                  aria-selected={on}
                  data-cmd-index={i}
                  onMouseEnter={() => setAt(i)}
                  onClick={() => onRun(it)}
                  className={cx('mx-2.5 flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer', on && 'bg-[#3D52A0]/10')}
                >
                  {it.kind === 'project' ? (
                    <ProjectPhoto row={it.row} className="w-[34px] h-[34px] rounded-[10px]" label={false} />
                  ) : (
                    <span className={cx('w-[34px] h-[34px] rounded-[10px] grid place-items-center shrink-0',
                      on ? 'bg-[#3D52A0] text-white' : 'bg-slate-100',
                      !on && (it.kind === 'file' ? 'text-slate-500' : tone === 'red' ? 'text-rose-600' : tone === 'gold' ? 'text-amber-700' : 'text-[#3D52A0]'))}>
                      {it.kind === 'file' ? <FileText className="w-4 h-4" /> : tone === 'red' ? <AlertTriangle className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{it.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">{it.sub}</p>
                  </div>
                  {on && <span className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-md px-1.5 bg-slate-50">↵</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex gap-3.5 px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          <span><span className="text-[11px] font-bold border border-slate-200 rounded-md px-1.5 bg-white">↑</span> <span className="text-[11px] font-bold border border-slate-200 rounded-md px-1.5 bg-white">↓</span> move</span>
          <span><span className="text-[11px] font-bold border border-slate-200 rounded-md px-1.5 bg-white">↵</span> open or do</span>
          <span className="ml-auto hidden sm:inline">Try a client, a place or a stage</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
