/*
  The studio's desks from inside a project (DESIGN.md "Project sidebar", page bar).

  "Studio ▾" at the right of the project page bar, before the hide-figures eye.
  It opens a short list (`phd-pop`) of the studio screens people reach for
  while they work on a project -- Design Desk, Ops Desk, People and the Item
  Bank -- so they no longer have to leave through Studio home and find them in
  the top bar. A pick leaves the project for that screen, the same way the
  sidebar's own menu leaves for Projects or Clients.

  Each row is offered only to the roles that open that screen
  (`studioJumpItems`, from STUDIO_TAB_ROLES and the limited roles' allow-lists
  in lib/roleAccess), so a Designer sees Design Desk and People and nothing
  they would be turned away from. With nothing to offer, no button is drawn.
*/
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, PenTool, Inbox, UserCheck, Library } from '@/lib/lucide-shim';
import { mayOpenStudioTab, isLimitedRole, limitedMayOpen } from '../../lib/roleAccess';
import type { RoleSet } from '../../lib/roles';
import { IconChip } from '../ui/kit';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export interface StudioJumpItem { route: string; label: string; sub: string; icon: React.ElementType }

/** The desks, in the order the studio's top bar lists them. The item bank lives in Templates & Bank, which opens on it. */
export const STUDIO_JUMP: StudioJumpItem[] = [
  { route: 'design-review', label: 'Design Desk', sub: 'Drawings to review, send and present', icon: PenTool },
  { route: 'ops-desk', label: 'Ops Desk', sub: 'Follow-ups, meetings and leads', icon: Inbox },
  { route: 'people', label: 'People', sub: 'Your day, your leave and who is in', icon: UserCheck },
  { route: 'admin-templates-bank', label: 'Item Bank', sub: 'Catalogue items, rates and packages', icon: Library },
];

/** The desks these roles may open: the top bar's rule, and a limited role's allow-list. */
export function studioJumpItems(role?: RoleSet): StudioJumpItem[] {
  return STUDIO_JUMP.filter((i) => mayOpenStudioTab(i.route, role) && (!isLimitedRole(role) || limitedMayOpen(role as RoleSet, i.route)));
}

export default function StudioJump({ role, onGo }: { role?: RoleSet; onGo: (route: string) => void }) {
  const items = studioJumpItems(role);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  if (items.length === 0) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows: HTMLButtonElement[] = list.current ? Array.from(list.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')) : [];
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    rows[(i + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
  };

  return (
    <div ref={box} className="relative shrink-0" onKeyDown={onKey}>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Studio screens"
        title="Design Desk, Ops Desk, People and the Item Bank"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'h-10 px-2.5 inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold transition-colors outline-none',
          'focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30',
          open ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
        )}>
        <LayoutGrid className="w-[18px] h-[18px]" aria-hidden="true" />
        <span className="hidden sm:inline">Studio</span>
        <ChevronDown className={cx('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div ref={list} role="menu" aria-label="Studio screens" style={{ transformOrigin: 'top right' }}
          className="phd-pop absolute right-0 top-full mt-2 z-40 w-80 max-w-[86vw] p-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl">
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Studio</div>
          {items.map((i) => (
            <button key={i.route} type="button" role="menuitem"
              onClick={() => { setOpen(false); onGo(i.route); }}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left outline-none hover:bg-slate-50 focus:bg-slate-50">
              <IconChip icon={i.icon} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 truncate">{i.label}</span>
                <span className="block text-xs text-slate-500 truncate">{i.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
