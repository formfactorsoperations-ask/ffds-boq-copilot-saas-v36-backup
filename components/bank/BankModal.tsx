import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/lib/lucide-shim';
import '../projectHeader/projectHeader.css';

/*
  The window every Item bank dialog opens in (DESIGN.md "Modals", copied from
  AssignProjectsModal): the navy scrim, a white card that pops in, a brand
  eyebrow over the title, a body that scrolls and a footer strip.

  The bank had three looks for a dialog: a dark console, a slate one with
  underlined tabs and a brand-blue full-screen one. They now share this.
  Esc and a click outside close it, unless `locked` (while work is running).
*/

const WIDTH = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl', '2xl': 'max-w-4xl' } as const;

export interface BankModalProps {
  /** Names the window for screen readers; usually the title. */
  label: string;
  eyebrow?: string;
  title: React.ReactNode;
  blurb?: React.ReactNode;
  /** Sits under the title, inside the header: a view switch, a search. */
  tools?: React.ReactNode;
  /** The footer's buttons: Cancel on the left by convention, the one primary last. */
  footer?: React.ReactNode;
  onClose: () => void;
  /** While true the window cannot be closed (something is being worked out or saved). */
  locked?: boolean;
  size?: keyof typeof WIDTH;
  /** Classes for the scrolling body, in place of the default padding. */
  bodyClassName?: string;
  children: React.ReactNode;
}

const BankModal: React.FC<BankModalProps> = ({ label, eyebrow = 'Item bank', title, blurb, tools, footer, onClose, locked, size = 'lg', bodyClassName, children }) => {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !locked) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, locked]);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => { if (!locked) onClose(); }} />
      <div className={`phd-pop relative w-full ${WIDTH[size]} bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]`}>
        <div className="p-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{eyebrow}</p>
              <h3 className="font-bold text-slate-800 mt-1">{title}</h3>
              {blurb && <p className="text-xs text-slate-500 mt-1">{blurb}</p>}
            </div>
            {!locked && (
              <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"><X className="w-4 h-4" /></button>
            )}
          </div>
          {tools && <div className="mt-3">{tools}</div>}
        </div>
        <div className={`flex-1 overflow-y-auto ${bodyClassName ?? 'p-5'}`}>{children}</div>
        {footer && <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

export default BankModal;
