import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/lib/lucide-shim';
import '../projectHeader/projectHeader.css';

/*
  The BOQ, opened over Pricing & Tiers.

  "Edit BOQ" on an option's column used to mean leaving the comparison for the
  BOQ Editor and finding the way back. The same editor now opens here, over the
  screen, for that option; closing it shows the column with its new figures.
  The editor saves as it always has. Rendered through a portal so a transformed
  panel on the page cannot trap it.
*/
export default function BoqSlideOver({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[300]" role="dialog" aria-label={`Edit BOQ: ${title}`}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop absolute inset-y-0 right-0 w-full max-w-[1240px] bg-slate-50 border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Edit BOQ</p>
            <h2 className="font-bold text-slate-800 truncate">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Changes save as you go. Close to see the option’s column with its new figures.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">Done</button>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
