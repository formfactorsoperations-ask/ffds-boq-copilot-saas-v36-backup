/**
 * The project dashboard ("Hub").
 *
 * This file owns the project-level state the page needs — the Ops Matrix
 * journey, the stage, the next-action list, stage advances and the logging
 * dialogs — and hands it to Project Home, which draws the page
 * (components/projectHome/ProjectHome.tsx).
 */
import React, { useState, useEffect } from 'react';
import { ProjectContext, ProposalTier, FullBoqItem, ActiveProject, Item, SiteVisitType } from '../types';
import { db } from '../services/firebaseClient';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useOrg } from '../contexts/OrgContext';
import { SiteVisitLogModal } from './SiteVisitLogModal';
import { useProjectJourney } from '../hooks/useProjectJourney';
import { PHASES } from '../constants/journeyConstants';
import { getNextActions } from '../services/nextActionEngine';
import SiteVisitHistory from '../pages/SiteVisitHistory';
import ProjectHome from './projectHome/ProjectHome';

interface DashboardProps {
    activeTier?: ProposalTier;
    fullBoq: FullBoqItem[];
    projectContext: ProjectContext;
    setActiveTab: (tab: string) => void;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeProject: ActiveProject | null;
    setActiveProject: (project: ActiveProject | null) => void;
    tiers: ProposalTier[];
    bank: Item[];
    projectId: string | null;
    projectArchitecture?: 'legacy' | 'canonical';
    onUpgradeArchitecture?: () => void;
    onModifyBrief?: () => void;
}

// The lifecycle's own stage names, as the site-visit log files them.
const STAGE_DETAILS_FOR_SYNC = [
    { id: 1, name: "Initial Consultation" },
    { id: 2, name: "Scope & Strategy" },
    { id: 3, name: "Proposal & Revisions" },
    { id: 4, name: "Agreement & Design" },
    { id: 5, name: "Execution" },
    { id: 6, name: "Handover & Closeout" }
];

const Dashboard: React.FC<DashboardProps> = ({ activeTier, fullBoq, projectContext, setActiveTab, setProjectContext, activeProject, tiers, projectId, projectArchitecture, onUpgradeArchitecture, onModifyBrief }) => {
    const { orgData } = useOrg();
    const studioId = orgData?.tenantId || 'demo-tenant-01';
    const [selections, setSelections] = useState<any[]>([]);

    const journey = useProjectJourney(projectId!, projectContext);

    const advanceLifecycle = async (newStage: number) => {
        if (!projectId || !orgData?.id) return;
        try {
            const { advance } = await import('../services/lifecycleService');
            const updatedLifecycle = await advance(orgData.id, projectId, { type: 'ADVANCE', toStage: newStage });
            setProjectContext((prev: any) => ({
                ...prev,
                lifecycle: updatedLifecycle
            }));
        } catch (e) {
            console.error("Failed to advance lifecycle:", e);
        }
    };

    useEffect(() => {
        if (!activeProject?.id) return;
        const q = collection(db, 'projects', activeProject.id, 'selections');
        const unsub = onSnapshot(q, snap => {
            setSelections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
            // Unhandled here would fail the Firestore queue for the whole page.
            console.warn('Selections unavailable:', (err as any)?.code || err);
            setSelections([]);
        });
        return () => unsub();
    }, [activeProject?.id]);

    // Context wins so edits made in the Materials tab show here straight away.
    const allSelections = projectContext.materialSelections?.length ? projectContext.materialSelections : selections;
    const sofItems = activeProject?.executionData?.sofItems || [];

    const [siteVisitModalOpen, setSiteVisitModalOpen] = useState(false);
    const [siteVisitType, setSiteVisitType] = useState<SiteVisitType>('site_visit');
    const [showSiteVisitHistory, setShowSiteVisitHistory] = useState(false);

    const currentStageNum = (typeof projectContext.lifecycle?.stage === 'number') ? projectContext.lifecycle.stage : 1;
    const actualPhaseIdx = journey.activeSteps.length > 0
        ? journey.activeSteps[0].phase
        : (journey.overall.done === journey.overall.total ? PHASES.length - 1 : 0);
    const isMismatch = (currentStageNum - 1) !== actualPhaseIdx;

    const currentUserRole = orgData?.role || 'Admin';
    const nextActionsCtx = {
        project: projectContext,
        designPaymentStages: projectContext.paymentMilestones,
        designGate: projectContext.designGate,
        drawingTrackerSummary: null,
        scopeAdditionsSummary: { pending: (projectContext.scopeAdditions || []).filter((s: any) => s.status === 'pending_approval' || s.status === 'pending').length },
        timeline: null
    };
    const nextActionsList = getNextActions(nextActionsCtx, currentUserRole || 'Admin');

    const resumeProject = async () => {
        setProjectContext((prev: any) => ({ ...prev, status: 'execution' }));
        if (projectId && db) {
            await updateDoc(doc(db, 'projects', projectId), { status: 'execution' }).catch(() => {});
        }
    };

    return (
        <div className="w-full min-h-screen pb-12">
            <ProjectHome
                projectId={projectId || ''}
                studioId={studioId}
                projectContext={projectContext}
                setProjectContext={setProjectContext}
                setActiveTab={setActiveTab}
                activeTier={activeTier}
                tiers={tiers}
                fullBoq={fullBoq}
                currentUserRole={currentUserRole}
                journey={journey}
                nextActions={nextActionsList}
                stage={currentStageNum}
                actualPhaseIdx={actualPhaseIdx}
                isMismatch={isMismatch}
                advanceLifecycle={advanceLifecycle}
                onLogSiteVisit={() => { setSiteVisitType('site_visit'); setSiteVisitModalOpen(true); }}
                onLogMeeting={() => { setSiteVisitType('client_meeting'); setSiteVisitModalOpen(true); }}
                onOpenHistory={() => setShowSiteVisitHistory(true)}
                modalOpen={siteVisitModalOpen || showSiteVisitHistory}
                projectArchitecture={projectArchitecture}
                onUpgradeArchitecture={onUpgradeArchitecture}
                onModifyBrief={onModifyBrief}
                onResumeProject={resumeProject}
                sofItems={sofItems}
                selections={allSelections}
            />

            <SiteVisitLogModal
              isOpen={siteVisitModalOpen}
              onClose={() => setSiteVisitModalOpen(false)}
              projectId={projectId || ''}
              studioId={studioId}
              defaultType={siteVisitType}
              projectContext={projectContext}
              currentPhaseStep={currentStageNum}
              currentPhaseTitle={STAGE_DETAILS_FOR_SYNC[currentStageNum - 1]?.name || "Agreement & Design"}
            />
            {showSiteVisitHistory && (
              <SiteVisitHistory
                projectId={projectId || ''}
                studioId={studioId}
                onClose={() => setShowSiteVisitHistory(false)}
                projectContext={projectContext}
              />
            )}
        </div>
    );
};

export default Dashboard;
