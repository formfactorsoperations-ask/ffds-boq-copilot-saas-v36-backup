/*
  3D renders and reference files, under Project Hub > Drawings.

  This was the "3D Renders & Drawings" tab inside Execution & Ops, a stage that
  stays locked until the agreement is signed, while the drawings themselves sat
  in the hub from the first sketch. It now sits under the drawing tracker as one
  summary-first section, closed until someone opens it (plan item 9).
*/
import React, { useState } from 'react';
import { Image } from 'lucide-react';
import type { ProjectContext } from '../../types';
import DesignDocumentsManager from '../ops/DesignDocumentsManager';
import SectionStack from './SectionStack';

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export function rendersLine(ctx: Pick<ProjectContext, 'designDocuments'>) {
  const n = (ctx.designDocuments || []).length;
  return n === 0
    ? { summary: 'No renders or files uploaded yet', tone: 'none' as const }
    : { summary: `${n} ${n === 1 ? 'file' : 'files'} · shown to the client in their portal`, tone: 'none' as const };
}

export default function RendersSection({ projectContext, setProjectContext }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-6">
      <SectionStack
        label="Renders and files"
        open={open}
        onOpen={setOpen}
        sections={[{
          id: 'renders',
          title: '3D renders and reference files',
          icon: Image,
          line: rendersLine(projectContext),
          render: () => <DesignDocumentsManager projectContext={projectContext} setProjectContext={setProjectContext} embedded />,
        }]}
      />
    </div>
  );
}
