/*
  The page bar's breadcrumb inside a project (DESIGN.md "Project sidebar", page bar).

  "Scope & Strategy ▾ / [ Pricing & Tiers | BOQ Editor | Money & Offers ]"

  - The stage opens a list of every stage: the one the project is at says NOW,
    locked ones are greyed with their note, and a stage opens its first screen.
  - On a wide screen the stage's screens sit beside it as a Segmented choice,
    so the screen next door is one click away. Narrower, the screen's name opens
    the same choice as a list.
  - Project Hub screens read "Project Hub / Ops Matrix ▾" and list the hub.

  It is fed the sidebar's own stages and hub, so the two show the same screens,
  the same role filtering and the same locks.
*/
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Lock, Check } from '@/lib/lucide-shim';
import { Segmented } from '../ui/kit';
import type { SidebarStage, SidebarHubItem } from './ProjectSidebar';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export interface PageCrumbsProps {
  activeTab: string;
  /** The page's name, as the bar has always shown it. */
  title: string;
  stages: SidebarStage[];
  hub: SidebarHubItem[];
  home: { route: string; label: string };
  onGo: (route: string, stage?: number) => void;
}

interface MenuRow { key: string; label: string; on?: boolean; now?: boolean; locked?: boolean; note?: string; onPick?: () => void }

/** A crumb that opens a short list under it. Escape, a click outside or a pick closes it. */
function CrumbMenu({ trigger, triggerClass, label, rows, children }: {
  trigger: React.ReactNode; triggerClass: string; label: string; rows: MenuRow[]; children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    const first = list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items: HTMLButtonElement[] = list.current ? Array.from(list.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')) : [];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    next?.focus();
  };

  return (
    <div ref={box} className="relative min-w-0" onKeyDown={onKey}>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(o => !o)} className={triggerClass}>
        {trigger}
        <ChevronDown className={cx('w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div ref={list} role="menu" aria-label={label} style={{ transformOrigin: 'top left' }}
          className="phd-pop absolute left-0 top-full mt-2 z-40 w-72 max-w-[86vw] max-h-[70vh] overflow-y-auto p-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl">
          {children}
          {rows.map(r => (
            <button key={r.key} type="button" role="menuitem" aria-disabled={r.locked || undefined}
              aria-current={r.on ? 'page' : undefined} title={r.locked ? r.note : undefined}
              onClick={() => { if (r.locked) return; setOpen(false); r.onPick?.(); }}
              className={cx(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm outline-none',
                r.locked ? 'cursor-not-allowed text-slate-400' : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-50',
                r.on && 'bg-[#3D52A0]/10 text-[#3D52A0] font-semibold hover:bg-[#3D52A0]/10 focus:bg-[#3D52A0]/10',
              )}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.label}</span>
                {r.locked && r.note && <span className="block text-[11px] text-slate-400 truncate">{r.note}</span>}
              </span>
              {r.now && <span className="text-[10px] font-extrabold tracking-[0.08em] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">NOW</span>}
              {r.locked && <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              {r.on && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PARENT = 'inline-flex items-center gap-1 max-w-[220px] px-2 py-1 -mx-1 rounded-lg text-[13px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 whitespace-nowrap';
const SCREEN = 'inline-flex items-center gap-1 min-w-0 px-2 py-1 -mx-1 rounded-lg hover:bg-slate-100';

export default function PageCrumbs({ activeTab, title, stages, hub, home, onGo }: PageCrumbsProps) {
  const stage = stages.find(s => s.screens.some(x => x.route === activeTab));
  const inHub = !stage && hub.some(h => h.route === activeTab);
  const parentLabel = stage ? stage.label : inHub ? 'Project Hub' : 'Project';

  const stageRows: MenuRow[] = stages.map(s => ({
    key: `s${s.stage}`,
    label: s.label,
    on: s.stage === stage?.stage,
    now: s.state === 'now',
    locked: s.locked || s.screens.length === 0,
    note: s.locked ? (s.lockNote || 'Locked') : undefined,
    onPick: () => { const first = s.screens[0]; if (first) onGo(first.route, s.stage); },
  }));

  /* The screens beside this one: the stage's, or the hub's. */
  const siblings = stage
    ? stage.screens.map(x => ({ route: x.route, label: x.label, stage: stage.stage as number | undefined }))
    : inHub ? hub.map(h => ({ route: h.route, label: h.label, stage: undefined as number | undefined })) : [];
  const siblingRows: MenuRow[] = siblings.map(x => ({
    key: x.route, label: x.label, on: x.route === activeTab, onPick: () => onGo(x.route, x.stage),
  }));

  const NAME = 'text-base font-extrabold text-slate-800 tracking-tight truncate';

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex items-center gap-2">
      <div className="hidden sm:block shrink-0">
        <CrumbMenu label={`${parentLabel}: change stage`} triggerClass={PARENT} rows={stageRows}
          trigger={<span className="truncate">{parentLabel}</span>}>
          {home.route !== activeTab && (
            <>
              <button type="button" role="menuitem" onClick={() => onGo(home.route)}
                className="w-full flex items-center px-3 py-2 rounded-xl text-left text-sm text-slate-700 outline-none hover:bg-slate-50 focus:bg-slate-50">
                {home.label}
              </button>
              <div className="my-1 mx-3 border-t border-slate-100" />
            </>
          )}
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Journey</div>
        </CrumbMenu>
      </div>
      <span className="hidden sm:inline text-slate-300" aria-hidden="true">/</span>

      {siblings.length > 1 ? (
        <>
          {/* The page's name stays its heading for screen readers. */}
          <h1 className="sr-only">{title}</h1>
          {/* Wide: the stage's screens in a row. */}
          {stage && (
            <div className="hidden xl:block min-w-0">
              <Segmented size="sm" label={`${stage.label} screens`} value={activeTab}
                options={siblings.map(x => ({ id: x.route, label: x.label }))}
                onChange={(route) => { if (route !== activeTab) onGo(route, stage.stage); }} />
            </div>
          )}
          {/* Narrower, and always for the hub: the screen's name opens its neighbours. */}
          <div className={cx('min-w-0', stage && 'xl:hidden')}>
            <CrumbMenu label={`${title}: other screens`} triggerClass={SCREEN} rows={siblingRows}
              trigger={<span className={NAME}>{title}</span>} />
          </div>
        </>
      ) : <h1 className={NAME}>{title}</h1>}
    </nav>
  );
}
