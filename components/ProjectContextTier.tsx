import React, { useState } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { ProjectContext } from '../types';

interface Props {
  projectContext: ProjectContext;
}

/**
 * Project detail, expanded from the project bar.
 *
 * This used to be a five-tile strip inside Brief & Site, where three of the five
 * tiles (name, client, area) simply repeated the project bar directly above it.
 * Living here instead means it costs no content space, and every project page can
 * reach it rather than just one.
 *
 * Collapsed by default; the choice is remembered per browser.
 */
const STORAGE_KEY = 'ffds_project_details_open';

export const ProjectContextTier: React.FC<Props> = ({ projectContext }) => {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* private mode */ }
      return next;
    });
  };

  const cells: { label: string; value: string; meta?: React.ReactNode }[] = [
    {
      label: 'Location',
      value: projectContext.location || 'No location set',
      meta: <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{projectContext.name || 'Untitled Project'}</span>,
    },
    {
      label: 'Contact',
      value: projectContext.clientPhone || 'No telephone',
      meta: projectContext.clientName || 'Unnamed client',
    },
    {
      label: 'Config',
      value: projectContext.config || 'No config set',
      meta: projectContext.area ? `${projectContext.area} sq ft` : 'Area not set',
    },
    {
      label: 'Style',
      value: projectContext.theme || 'Not specified',
      meta: `Ceiling ${projectContext.ceilingHeight || 9.5} ft`,
    },
    {
      label: 'Milestone',
      value: (projectContext.status || 'lead').replace('_', ' '),
      meta: projectContext.clientEmail || '—',
    },
  ];

  return (
    <>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-[#0066CC] bg-sky-50 border border-sky-100 hover:bg-sky-100 transition-colors shrink-0 cursor-pointer"
      >
        Details
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="w-full order-last grid grid-cols-2 md:grid-cols-5 border-t border-slate-100 mt-2 pt-2 -mx-4 px-4">
          {cells.map(c => (
            <div key={c.label} className="px-3 py-1.5 border-r border-slate-100 last:border-r-0">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">{c.label}</div>
              <div className="text-[13px] font-bold text-slate-900 tracking-tight capitalize truncate">{c.value}</div>
              <div className="text-[10px] text-slate-500 truncate">{c.meta}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default ProjectContextTier;
