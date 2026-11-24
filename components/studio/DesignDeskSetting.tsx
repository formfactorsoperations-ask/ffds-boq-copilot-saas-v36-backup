import React from 'react';
import { Segmented } from '../ui/kit';

/*
  WHICH DESIGN DESK the studio works on (Design Desk 2.0 rollout).

  One field on the studio's record, `designDesk`. The Design Desk tab draws the
  desk chosen here for everyone in the studio (components/designDesk2/
  DesignDeskSwitch). Both desks read the same drawings, notes and meetings, so
  nothing is moved or converted when the choice changes. The choice is part of
  the settings draft: it applies when the settings are saved, like every other
  field on this screen.
*/

export type DeskChoice = 'classic' | 'new';

export const deskChoiceOf = (org: { designDesk?: string } | null | undefined): DeskChoice => (org?.designDesk === 'new' ? 'new' : 'classic');

export default function DesignDeskSetting({ value, saved, onChange, highlight }: {
  /** The choice in the draft. */
  value: DeskChoice;
  /** The choice the studio is on now. */
  saved: DeskChoice;
  onChange: (v: DeskChoice) => void;
  highlight?: boolean;
}) {
  const pending = value !== saved;
  return (
    <div id="set-designDesk" className={`flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-wrap transition-shadow ${highlight ? 'ring-2 ring-[#3D52A0] ring-offset-2 hud-locate' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">
          {pending
            ? `Save to move the studio to the ${value === 'new' ? 'new' : 'old'} desk`
            : `The studio is on the ${saved === 'new' ? 'new' : 'old'} desk`}
        </p>
        <p className="text-xs text-slate-500">
          Everyone in the studio sees the desk chosen here on the Design Desk tab. Both desks use the same drawings, notes and meetings, so nothing is moved and you can change back at any time.
        </p>
      </div>
      <Segmented<DeskChoice>
        label="Design Desk"
        size="sm"
        value={value}
        onChange={onChange}
        options={[{ id: 'classic', label: 'Old desk' }, { id: 'new', label: 'New desk' }]}
      />
    </div>
  );
}
