/*
  The studio's desks from inside a project (DESIGN.md "Project sidebar", page bar).

  A row of icon buttons at the right of the project page bar, before the
  hide-figures eye: Design Desk, Ops Desk, People and the Item Bank, the
  studio screens people reach for while they work on a project, so they no
  longer leave through Studio home to find them. Each is the size and shape of
  the eye beside it, and names itself on hover or focus with the sidebar's own
  tooltip (`psb-tip`). A click leaves the project for that screen, the same way
  the sidebar's menu leaves for Projects or Clients.

  Each icon is offered only to the roles that open that screen
  (`studioJumpItems`, from STUDIO_TAB_ROLES and the limited roles' allow-lists
  in lib/roleAccess), so a Designer sees Design Desk and People and nothing
  they would be turned away from. With nothing to offer, nothing is drawn.
*/
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { PenTool, Inbox, UserCheck, Library } from '@/lib/lucide-shim';
import { mayOpenStudioTab, isLimitedRole, limitedMayOpen } from '../../lib/roleAccess';
import type { RoleSet } from '../../lib/roles';
import './projectSidebar.css';

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
  const [tip, setTip] = useState<null | { x: number; y: number; item: StudioJumpItem }>(null);
  if (items.length === 0) return null;

  const show = (item: StudioJumpItem) => (e: React.SyntheticEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.bottom + 8, item });
  };
  const hide = () => setTip(null);

  return (
    <nav aria-label="Studio screens" className="hidden sm:flex items-center gap-1 shrink-0">
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <button key={i.route} type="button" aria-label={i.label}
            onClick={() => { hide(); onGo(i.route); }}
            onMouseEnter={show(i)} onMouseLeave={hide} onFocus={show(i)} onBlur={hide}
            className="w-10 h-10 shrink-0 grid place-items-center rounded-xl text-slate-500 transition-colors outline-none hover:bg-slate-100 hover:text-[#3D52A0] focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30">
            <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        );
      })}
      {/* Apart from the eye and the page's own controls. */}
      <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden="true" />
      {tip && createPortal(
        <div role="tooltip" className="fixed z-[320] pointer-events-none -translate-x-1/2" style={{ left: tip.x, top: tip.y }}>
          <div className="psb-tip" style={{ position: 'static' }}>{tip.item.label}<small>{tip.item.sub}</small></div>
        </div>,
        document.body,
      )}
    </nav>
  );
}
