import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ClientPortal from '../ClientPortal';
import PortalPublishControls from './PortalPublishControls';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import {
  buildReleaseView, gatherPortalRelease, portalStudioFrom,
  type PortalReleaseGathered, type PortalReleaseInputs,
} from '../../services/portalRelease';
import { portalTokenOf } from '../../services/portalAccessService';
import { applyPreviewEdit } from '../../lib/portalPreview';
import type { ClientBoqRow } from '../../lib/clientBoq';
import type { PortalMoney } from '../../lib/portalMoney';
import type { Item, ProjectContext, ProjectSchedule } from '../../types';

/*
  THE CLIENT PORTAL TAB: WHAT THE CLIENT WILL SEE, AND WHETHER THEY DO.

  The portal below is drawn from the client's copy of this project, built by
  the same code a send uses (services/portalRelease buildReleaseView). What is
  on this screen is what the client will see once it is sent -- not a second
  rendering of the project that can disagree with theirs.

  It stays the studio's working screen: approvals taken in person, answers and
  updates are saved to the project. They are made to the copy and applied to
  the project by lib/portalPreview applyPreviewEdit, which changes only what the
  edit changed, so nothing the copy leaves out (costs, vendors, notes, drafts)
  can be lost through this screen.

  The panel above compares this with the copy the client actually has, in full,
  and says which parts differ until it is sent.
*/

interface Props {
  projectId: string;
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  currentUser?: string;
  clientBoq?: ClientBoqRow[];
  clientBoqBaseline?: ClientBoqRow[];
  portalMoney?: PortalMoney;
  clientSchedule?: ProjectSchedule;
  bank: Item[];
}

export default function StudioPortalPreview({
  projectId, projectContext, setProjectContext, currentUser,
  clientBoq, clientBoqBaseline, portalMoney, clientSchedule, bank,
}: Props) {
  const { orgData } = useOrg() as any;
  const { settings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');

  const inputs: PortalReleaseInputs = useMemo(() => ({
    projectId,
    tenantId: orgData?.tenantId,
    orgData,
    settings,
    clientBoq,
    clientBoqBaseline,
    portalMoney,
    clientSchedule,
  }), [projectId, orgData, settings, clientBoq, clientBoqBaseline, portalMoney, clientSchedule]);

  /*
    What a send reads from outside the project: studio details, scope
    additions, the saved schedule, the design meetings. Read when the tab opens,
    when the window regains focus, and after every send, so the preview does not
    run on a stale copy of any of them.
  */
  const [gathered, setGathered] = useState<PortalReleaseGathered | null>(null);
  const [gatherTick, setGatherTick] = useState(0);
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  useEffect(() => {
    let alive = true;
    gatherPortalRelease(inputsRef.current)
      .then((g) => { if (alive) setGathered(g); })
      .catch(() => { if (alive) setGathered({ studio: portalStudioFrom(settings, orgData) }); });
    return () => { alive = false; };
  }, [projectId, orgData?.tenantId, settings, gatherTick]);
  useEffect(() => {
    const again = () => setGatherTick((t) => t + 1);
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, []);

  /* The client's copy, exactly as a send would store it now. */
  const view = useMemo(
    () => (gathered ? buildReleaseView(projectContext, inputs, gathered) : null),
    [projectContext, inputs, gathered],
  );

  const onPreviewEdit = useCallback((before: ProjectContext, after: ProjectContext) => {
    setProjectContext((prev) => applyPreviewEdit(prev, before, after));
  }, [setProjectContext]);

  return (
    <>
      {/* Ops-only. Sits above the preview because ops must see the state of
          items the client cannot see at all. */}
      <PortalPublishControls
        projectContext={projectContext}
        setProjectContext={setProjectContext}
        currentUser={currentUser}
        projectId={projectId}
        clientBoq={clientBoq}
        clientBoqBaseline={clientBoqBaseline}
        portalMoney={portalMoney}
        clientSchedule={clientSchedule}
        previewView={view}
        onSent={() => setGatherTick((t) => t + 1)}
      />
      {view ? (
        <ClientPortal
          source="preview"
          projectData={{
            id: projectId,
            lastModified: Date.now(),
            context: view.context as any,
            scopeAdditions: (view as any).scopeAdditions,
            designRecord: (view as any).designRecord,
          } as any}
          bank={bank}
          portalToken={portalTokenOf(projectContext)}
          onPreviewEdit={onPreviewEdit}
        />
      ) : (
        <div className="hud-panel-in rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-xs font-medium text-slate-500">
          Building the client&rsquo;s view…
        </div>
      )}
    </>
  );
}
