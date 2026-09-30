import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid } from 'lucide-react';
import './projectHeader.css';

export interface StudioMenuItem {
  tab: string;
  label: string;
  icon: React.ElementType;
}

interface Props {
  items: StudioMenuItem[];
  onGo: (tab: string) => void;
}

/**
 * The studio's own screens, folded into one menu in the project bar.
 *
 * The list is drawn on the page rather than inside the bar: the bar's items
 * arrive with a short animation, and an animating element keeps whatever is
 * inside it underneath the rows below -- the list opened, but behind the
 * stage row, so it looked like nothing happened.
 */
export default function StudioMenuButton({ items, onGo }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
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
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Studio screens"
        title="Studio screens"
        className="phd-lift w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-slate-50 border border-slate-200 text-slate-600 hover:bg-[#E8ECFB] hover:text-[#3D52A0] cursor-pointer"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          className="phd-pop z-[400] w-52 bg-white rounded-2xl border border-slate-200 shadow-[0_24px_60px_-24px_rgba(18,24,47,0.45)] p-1.5"
        >
          {items.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onGo(tab); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#3D52A0] cursor-pointer"
            >
              <Icon className="w-4 h-4 opacity-70" />
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
