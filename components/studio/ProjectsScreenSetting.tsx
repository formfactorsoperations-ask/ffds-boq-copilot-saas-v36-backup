import React from 'react';
import { Segmented } from '../ui/kit';

/*
  WHICH PROJECTS SCREEN the studio sees (the journey screen's rollout,
  DESIGN.md "Projects: journey, needs you, one list").

  One field on the studio's record, `projectsScreen`. The Projects tab draws
  the screen chosen here for everyone in the studio
  (components/projects/ProjectsScreenSwitch). Both screens read the same
  projects, so nothing is moved or converted when the choice changes. The
  glass folders stay the default until the owner accepts the new screen. The
  choice is part of the settings draft: it applies when the settings are saved.
*/

export type ProjectsScreenChoice = 'folders' | 'journey';

export const projectsScreenOf = (org: { projectsScreen?: string } | null | undefined): ProjectsScreenChoice =>
  org?.projectsScreen === 'journey' ? 'journey' : 'folders';

export default function ProjectsScreenSetting({ value, saved, onChange, highlight }: {
  /** The choice in the draft. */
  value: ProjectsScreenChoice;
  /** The choice the studio is on now. */
  saved: ProjectsScreenChoice;
  onChange: (v: ProjectsScreenChoice) => void;
  highlight?: boolean;
}) {
  const pending = value !== saved;
  const name = (v: ProjectsScreenChoice) => (v === 'journey' ? 'new Projects screen' : 'glass folders');
  return (
    <div id="set-projectsScreen" className={`flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-wrap transition-shadow ${highlight ? 'ring-2 ring-[#3D52A0] ring-offset-2 hud-locate' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">
          {pending ? `Save to move the studio to the ${name(value)}` : `The studio is on the ${name(saved)}`}
        </p>
        <p className="text-xs text-slate-500">
          Everyone in the studio sees the screen chosen here on the Projects tab. Both show the same projects, so nothing is moved and you can change back at any time.
        </p>
      </div>
      <Segmented<ProjectsScreenChoice>
        label="Projects screen"
        size="sm"
        value={value}
        onChange={onChange}
        options={[{ id: 'folders', label: 'Glass folders' }, { id: 'journey', label: 'New screen' }]}
      />
    </div>
  );
}
