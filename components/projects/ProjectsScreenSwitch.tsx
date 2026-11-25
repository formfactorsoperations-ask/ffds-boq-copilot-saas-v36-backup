import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import ProjectListTab from '../ProjectListTab';
import type { FullProjectData, ProjectStatus } from '../../types';

/*
  WHICH PROJECTS SCREEN the studio sees on the Projects tab.

  The glass folders (components/ProjectListTab) stay the default until the
  owner accepts the new screen (DESIGN.md "Projects: journey, needs you, one
  list"). The studio is moved to the new screen, and back, in Studio settings
  > Data & integrations (components/studio/ProjectsScreenSetting). Both
  screens take the same props and read the same projects.
*/

const ProjectsJourney = React.lazy(() => import('./journey/ProjectsJourney'));

export interface ProjectsScreenProps {
  projects: FullProjectData[];
  activeProjectId: string | null;
  onOpenProject: (project: FullProjectData, route?: string) => void;
  onCreateNew: () => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (project: FullProjectData) => void;
  onQuickUpdate?: (projectId: string, field: string, value: any) => void;
  onStatusChange?: (projectId: string, newStatus: ProjectStatus, note?: string) => Promise<void> | void;
  loading?: boolean;
}

export default function ProjectsScreenSwitch(props: ProjectsScreenProps) {
  const { orgData } = useOrg();
  if (orgData?.projectsScreen === 'journey') {
    return (
      <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>}>
        <ProjectsJourney {...props} />
      </Suspense>
    );
  }
  return <ProjectListTab {...props} />;
}
