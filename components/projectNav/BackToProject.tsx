/*
  The way back into a project (DESIGN.md "Project sidebar", page bar).

  Leaving a project for a studio screen -- a studio icon in the page bar
  (StudioJump), Studio home, or the sidebar's own menu -- remembers the
  project and the screen it was on. Every studio screen then opens with one
  slim row above its title: "← Back to Palacia – 3BHK · Brief & Site". A click
  reopens the project on that screen, as it was left; the row's × forgets it.
  Opening any project another way forgets it too (App.tsx).
*/
import React from 'react';
import { ArrowLeft, X } from '@/lib/lucide-shim';
import { Button } from '../ui/kit';
import { getPageMeta } from '../pageMeta';

export interface ProjectReturn {
  /** The project's id, so the row shows only while that project is still the one held open. */
  id: string;
  /** The project screen that was left. */
  tab: string;
  name: string;
}

/** The screen's name as the page bar showed it, or nothing when it has none. */
export const returnScreenLabel = (tab: string): string => getPageMeta(tab)?.title || '';

export default function BackToProject({ to, onBack, onDismiss }: { to: ProjectReturn; onBack: () => void; onDismiss: () => void }) {
  const screen = returnScreenLabel(to.tab);
  const name = to.name || 'the project';
  return (
    <div className="hud-panel-in flex items-center gap-1 mb-3 print:hidden">
      <Button size="sm" variant="secondary" icon={ArrowLeft} onClick={onBack} className="min-w-0 max-w-full"
        title={`Back to ${name}${screen ? `, ${screen}` : ''}`}>
        <span className="truncate">Back to <b>{name}</b>{screen && <span className="font-semibold text-slate-500"> · {screen}</span>}</span>
      </Button>
      <button type="button" onClick={onDismiss} aria-label="Forget the way back"
        className="w-7 h-7 shrink-0 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30">
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
