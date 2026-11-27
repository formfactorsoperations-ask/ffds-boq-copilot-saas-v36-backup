import React from 'react';
import { Segmented } from '../ui/kit';
import type { StudioWorkspaceChoice } from '../../lib/projectView';

/*
  WHICH PROJECT WORKSPACE the studio sees (lib/projectView.ts): Classic, each
  person's own choice, or Conversations for everyone. One field on the studio's
  record, `projectWorkspace`, saved with the settings draft like the Projects
  screen choice beside it. Both views draw the same screens from the same data,
  so nothing is moved or converted, and the studio can change back at any time.
*/

export { studioWorkspaceOf } from '../../lib/projectView';

const LINE: Record<StudioWorkspaceChoice, string> = {
  classic: 'Everyone sees the Classic project workspace',
  choose: 'Each person chooses Classic or Conversations from their own menu',
  conversations: 'Everyone sees the Conversations workspace, and can go back to Classic from their own menu',
};

export default function ProjectWorkspaceSetting({ value, saved, onChange, highlight }: {
  value: StudioWorkspaceChoice;
  saved: StudioWorkspaceChoice;
  onChange: (v: StudioWorkspaceChoice) => void;
  highlight?: boolean;
}) {
  const pending = value !== saved;
  return (
    <div id="set-projectWorkspace" className={`flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-wrap transition-shadow ${highlight ? 'ring-2 ring-[#3D52A0] ring-offset-2 hud-locate' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{pending ? `Save to change: ${LINE[value].toLowerCase()}` : LINE[saved]}</p>
        <p className="text-xs text-slate-500">
          Conversations shows a project as its conversations (Money, BOQ, Documents and the rest), with every screen in a full-screen window. Both views show the same project, so you can change back at any time.
        </p>
      </div>
      <Segmented<StudioWorkspaceChoice>
        label="Project workspace"
        size="sm"
        value={value}
        onChange={onChange}
        options={[{ id: 'classic', label: 'Classic' }, { id: 'choose', label: 'Each person chooses' }, { id: 'conversations', label: 'Conversations' }]}
      />
    </div>
  );
}
