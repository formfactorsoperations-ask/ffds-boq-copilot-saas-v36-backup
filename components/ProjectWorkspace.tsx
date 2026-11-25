import { isTerminated } from '../lib/termination';
import ProjectAlertBar from './projectAlerts/ProjectAlertBar';
import React, { useState, useEffect, useMemo } from 'react';
import { ProjectContextTier } from './ProjectContextTier';
import { ProjectContext, ProjectStatus, FullProjectData } from '../types';
import { STAGE_LABELS, PHASES } from '../constants/journeyConstants';
import { Lock, CheckCircle2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, X, Compass, Activity, Check, Info, Settings, Edit3, AlertTriangle, LayoutGrid, Handshake, Palette, Layers, FileText, Truck, Hammer, Key, Sparkles, SlidersHorizontal, Eye, Pencil } from '@/lib/lucide-shim';
import { NAV_CONFIG, ALWAYS_ON_BAND } from './navConfig';
import { getPageMeta } from './pageMeta';
import { engagementOf, navItemsFor, stageLabel, routeLabel, isRouteHidden, engagementDef } from '../lib/engagement';
import { useProjectJourney } from '../hooks/useProjectJourney';
import { useOrg } from '../contexts/OrgContext';
import { seesStudioFinance, holdsFinanceRole, isDesignerRole, isLimitedRole, DESIGNER_EDITABLE_TABS, limitedMayOpen, limitedHomeTab } from '../lib/roleAccess';
import { FFDSLogo } from './FFDSLogo';
import ViewOnlyGuard from './ViewOnlyGuard';
import ProjectTeamButton from './projectHeader/ProjectTeamButton';
import StudioMenuButton from './projectHeader/StudioMenuButton';
import './projectHeader/projectHeader.css';
import PageTitleBlock from './PageTitleBlock';
import ProjectSidebar, { type SidebarStage, type SidebarHubItem } from './projectNav/ProjectSidebar';
import PageCrumbs from './projectNav/PageCrumbs';
import { usePageHeaderSlots } from '../contexts/PageHeaderContext';
import { LogOut, Home, Building2, Users, BarChart3, Library, CreditCard, Menu } from '@/lib/lucide-shim';
import ProjectStatusTransitionModal from './ProjectStatusTransitionModal';
import { FloatingDock, FloatingDockItem } from './ui/floating-dock';
import { useHubAlerts } from './ops/useHubAlerts';
import NotifyBell from './notify/NotifyBell';
import { HideFiguresButton } from './ui/HideFigures';
import StudioJump from './projectNav/StudioJump';
import LiveStamp from './notify/LiveStamp';
import { useInbox } from './notify/NotifyContext';
import { Count } from './notify/NotifyBits';

const WORKSPACE_STATUS_MAP: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  lead: { label: "New Lead", color: "text-blue-700", bg: "bg-blue-50 hover:bg-blue-100", border: "border-blue-200" },
  draft: { label: "Drafting", color: "text-slate-700", bg: "bg-slate-100 hover:bg-slate-200", border: "border-slate-200" },
  proposal_sent: { label: "Proposal Sent", color: "text-[#3D52A0]", bg: "bg-sky-50 hover:bg-sky-100", border: "border-sky-200" },
  negotiation: { label: "Negotiation", color: "text-amber-700", bg: "bg-amber-50 hover:bg-amber-100", border: "border-amber-200" },
  won: { label: "Won", color: "text-emerald-700", bg: "bg-emerald-50 hover:bg-emerald-100", border: "border-emerald-200" },
  execution: { label: "In Execution", color: "text-purple-700", bg: "bg-purple-50 hover:bg-purple-100", border: "border-purple-200" },
  work_paused: { label: "Work Paused", color: "text-rose-700", bg: "bg-rose-50 hover:bg-rose-100", border: "border-rose-200" },
  completed: { label: "Completed", color: "text-teal-700", bg: "bg-teal-50 hover:bg-teal-100", border: "border-teal-200" },
  lost: { label: "Lost", color: "text-slate-500", bg: "bg-slate-100 hover:bg-slate-200", border: "border-slate-200" },
};

/*
  The project's progress as a ring that fills to its value when the project
  opens (H1 in the header mockups).
*/
/* Page names for screens that do a different job on a design-only project (lib/engagement.ts). */
const ENGAGEMENT_PAGE_TITLES: Partial<Record<string, Record<string, { title: string; subtitle: string }>>> = {
  design_only: {
    'design-gate': { title: 'GFC Release', subtitle: 'Checks that must clear before the GFC set goes to the client' },
    'handover-docket': { title: 'Design Closeout', subtitle: 'Final drawing set issued and the client’s sign-off' },
    materials: { title: 'Selections & Orders', subtitle: 'Finishes and fittings chosen with the client' },
  },
};

/*
  The page's figures and the version it is acting on (the PageHeader slots),
  in the merged sub-tab row. They used to sit in a title row of their own under
  four header rows; the owner found the header taking a third of the screen.
*/
/* "New Project · 14 Nov (2)" → "NP": the project's tile in the sidebar. */
const initialsOf = (name: string) => (name.match(/[A-Za-z]+/g) || ['P']).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const HeaderFigures: React.FC = () => {
  const { badge, vitals } = usePageHeaderSlots();
  if (!badge && !(vitals && vitals.length)) return null;
  return (
    <div className="hidden lg:flex items-center gap-3 min-w-0 pl-3 border-l border-slate-200">
      {badge && (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#3D52A0]/10 text-[#3D52A0] whitespace-nowrap truncate max-w-[180px]" title={badge}>{badge}</span>
      )}
      {(vitals || []).slice(0, 4).map((v) => (
        <span key={v.label} className="leading-tight whitespace-nowrap">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{v.label}</span>
          <span className={`block text-xs font-bold tabular-nums ${v.tone === 'good' ? 'text-emerald-600' : v.tone === 'warn' ? 'text-amber-600' : 'text-slate-800'}`}>{v.value}</span>
        </span>
      ))}
    </div>
  );
};

function ProgressRing({ pct }: { pct: number }) {
  const C = 2 * Math.PI * 15;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(Math.max(0, Math.min(100, pct))), 60);
    return () => window.clearTimeout(t);
  }, [pct]);
  return (
    <span className="phd-ring relative w-[38px] h-[38px] shrink-0 inline-block" aria-label={`${pct}% through the project`}>
      <svg viewBox="0 0 38 38" aria-hidden="true" className="w-[38px] h-[38px] -rotate-90">
        <circle className="bg" cx="19" cy="19" r="15" fill="none" stroke="#E2E5F0" strokeWidth="4" />
        <circle className="fg" cx="19" cy="19" r="15" fill="none" stroke="#3D52A0" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - shown / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-[#3D52A0]">{pct}%</span>
    </span>
  );
}

export function ProjectWorkspace({
  projectId,
  projectContext,
  activeTab,
  setActiveTab,
  children,
  currentRole,
  setProjectContext,
  isWizard = false,
  onLeaveProject,
  onStatusChange,
  tierSummary,
}: {
  projectId: string;
  projectContext: ProjectContext;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
  currentRole: string;
  setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
  isWizard?: boolean;
  onLeaveProject?: (targetTab?: string) => void;
  onStatusChange?: (status: ProjectStatus, note?: string) => Promise<void> | void;
  /** The billed option's summary, for the termination and dispute windows (components/projectAlerts). */
  tierSummary?: { totalSell?: number; designFee?: number };
}) {
  const { orgData, currentUserAuth, currentRoles } = useOrg();
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const lifecycle = projectContext.lifecycle || { stage: 1, subState: 'pending', gates: {} };
  const currentStage = lifecycle.stage;

  /*
    The rail for this project's engagement. A design-only project has no BOQ,
    pricing, execution agreement or site screens, and its Design Gate and
    Handover Docket do the jobs of GFC Release and Design Closeout.
  */
  const engagement = engagementOf(projectContext);
  const NAV = useMemo(() => NAV_CONFIG.map(s => ({
    ...s,
    label: stageLabel(engagement, s.stage, s.label),
    items: navItemsFor(engagement, s.items),
  })), [engagement]);
  const BAND = useMemo(() => navItemsFor(engagement, ALWAYS_ON_BAND), [engagement]);

  /*
    Scoping, pricing and the proposal are how the work is won, so they open the
    moment a project exists.

    They used to wait on currentStage >= 2, which is only reached when a design
    or proposal document is signed off. The one screen that could produce that
    signature sat inside the locked stage 3, so the only way in was the manual
    advance — which marks the proposalAccepted gate done in order to unlock the
    screens where the proposal is written. Unlocking honestly beats recording
    an acceptance that has not happened.

    Stage 4 onward still waits for the client's yes.
  */
  const isStageLocked = (stageNum: number) => {
    if (stageNum <= 3) return false;
    if (stageNum === 4) return currentStage < 2;
    return currentStage < stageNum;
  };
  
  const journey = useProjectJourney(projectId, projectContext);

  const activeTabStage = NAV.find(s => s.items.some(item => item.route === activeTab))?.stage || currentStage;
  const [selectedStage, setSelectedStage] = useState<number>(activeTabStage);

  useEffect(() => {
    const found = NAV.find(s => s.items.some(item => item.route === activeTab));
    if (found) {
      setSelectedStage(found.stage);
    }
  }, [activeTab]);

  // Helper to get lock text
  const getLockNote = (stage: number) => {
    if (stage === 6 && !(lifecycle.gates as any)?.designGateActive?.done) {
      const gate = routeLabel(engagement, 'design-gate', 'Design Gate');
      return { text: `Unlocks when the ${gate} is activated.`, linkText: `Go to ${gate} →`, linkRoute: "design-gate" };
    }
    // generic fallback for other stages if they somehow lock
    return { text: "Unlocks when prerequisite gates are met.", linkText: "Go to Overview →", linkRoute: "dashboard" };
  };

  /* Money screens for anyone outside studio finance; for a Designer,
     everything outside their allow-list (lib/roleAccess). */
  const isDesigner = isDesignerRole(currentRole);
  /* Client Relations works like a Designer here: its own allow-list, all of it look-only for now. */
  const isLimited = isLimitedRole(currentRole);
  const hubAlerts = useHubAlerts(projectId, projectContext);
  const limitedHome = limitedHomeTab(currentRole);
  /* R1 in the header mockups: on a Designer's tabs, "view" marks the ones
     they can only look at. The Drawing Tracker, which they work in, has none. */
  const accessBadge = (route?: string): string | null =>
    isLimited && route && !(isDesigner && DESIGNER_EDITABLE_TABS.has(route)) ? 'view only' : null;
  const hiddenForRole = (item: any): boolean =>
    (!seesStudioFinance(currentRole) && !!item?.money) ||
    (isLimited && !limitedMayOpen(currentRole, item?.route));


  /* Notes on this project, by the screen they open: a red number where someone is waiting on you, a dot for something new (lib/notify). */
  const inbox = useInbox();
  const noted = inbox?.forProject(projectId) || {};

  /* What the project sidebar shows (components/projectNav/ProjectSidebar). */
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => { setMobileNav(false); }, [activeTab]);
  const workspaceStatusBase = WORKSPACE_STATUS_MAP[(projectContext.status && WORKSPACE_STATUS_MAP[projectContext.status]) ? projectContext.status : 'draft'];
  /* A project dropped part-way reads Terminated, not Lost (lib/termination). */
  const workspaceStatus = isTerminated(projectContext) ? { ...workspaceStatusBase, label: 'Terminated' } : workspaceStatusBase;
  const sidebarStages: SidebarStage[] = NAV.map(s => {
    const screens = s.items.filter(i => !hiddenForRole(i)).map(i => ({ route: i.route, label: i.label, readOnly: !!accessBadge(i.route) }));
    const locked = isStageLocked(s.stage);
    return {
      stage: s.stage, label: s.label, screens, locked,
      lockNote: locked ? getLockNote(s.stage).text : undefined,
      state: (s.stage < currentStage ? 'done' : s.stage === currentStage ? 'now' : 'todo') as SidebarStage['state'],
    };
  }).filter(s => !(isLimited && s.screens.length === 0));
  const sidebarHub: SidebarHubItem[] = BAND.filter(item => !hiddenForRole(item)).map(item => {
    let badge = item.statusBadge ? item.statusBadge(projectContext) : null;
    if (!seesStudioFinance(currentRole) && badge) badge = badge.replace(/₹/g, '');
    const readOnly = !!accessBadge(item.route);
    return { route: item.route, label: item.label, badge, tone: readOnly ? 'warn' : (item.badgeTone ? item.badgeTone(projectContext) : null), readOnly };
  });

  /*
    The page bar names the screen with the same words as the sidebar row that
    opened it, so the two cannot drift apart ("Versions & Revision Studio" used
    to open a page titled "Revisions", "Messages" one titled "Client Messages").
    pageMeta only names screens the sidebar does not list.
  */
  const homeLabel = isDesigner ? 'Drawings' : isLimited ? 'Messages' : 'Hub';
  const sidebarLabel = activeTab === (isLimited ? limitedHome : 'dashboard') ? homeLabel
    : (BAND.find(i => i.route === activeTab)?.label || NAV.flatMap(s => s.items).find(i => i.route === activeTab)?.label);
  const screenTitle = isWizard ? (getPageMeta('project-setup')?.title || '')
    : (ENGAGEMENT_PAGE_TITLES[engagement]?.[activeTab]?.title || sidebarLabel || getPageMeta(activeTab)?.title || '');

  /* Opens a screen from the sidebar or the page bar's breadcrumb. */
  const goTo = (route: string, stage?: number) => {
    if (stage) setSelectedStage(stage);
    else if (route === 'dashboard' || BAND.some(i => i.route === route)) setSelectedStage(0);
    setActiveTab(route);
  };
  const homeRoute = isLimited ? limitedHome : 'dashboard';

  return (
    <div className="flex h-full bg-slate-50">
      {/* The project sidebar (components/projectNav/ProjectSidebar): it replaced the five header rows. */}
      <ProjectSidebar
        projectId={projectId}
        activeTab={activeTab}
        onGo={goTo}
        home={{ route: homeRoute, label: homeLabel }}
        stages={sidebarStages}
        selectedStage={activeTab === 'dashboard' || BAND.some(i => i.route === activeTab) ? null : selectedStage}
        hub={sidebarHub}
        counts={(route) => ({ needs: noted[route]?.needs || 0, unread: noted[route]?.unread || 0 })}
        project={{
          name: projectContext.name || 'Untitled Project',
          sub: [projectContext.clientName || 'No client yet', projectContext.location, projectContext.area ? `${projectContext.area} sq ft` : ''].filter(Boolean).join(' · '),
          initials: initialsOf(projectContext.name || 'Project'),
        }}
        status={{ label: workspaceStatus.label, disabled: isLimited, onClick: () => { if (!isLimited) setIsStatusModalOpen(true); } }}
        progress={{
          pct: Math.round(projectContext.journeySummary?.pct ?? journey.overall.pct ?? 0),
          /* A terminated project has no next step. */
          next: isLimited ? undefined : isTerminated(projectContext) ? 'Project terminated' : (journey.nextStep?.title || 'Up next'),
          onClick: isLimited ? undefined : () => setActiveTab('project-journey'),
        }}
        projectTools={<><ProjectContextTier projectContext={projectContext} projectId={projectId} setProjectContext={setProjectContext} /><ProjectTeamButton project={{ id: projectId, context: projectContext }} size="sm" align="left" /></>}
        studioHome={{ label: 'Studio home', onClick: () => onLeaveProject?.(isLimited ? 'projects' : 'home') }}
        bellProject={!isLimited ? {
          name: [projectContext?.name || 'This project', projectContext?.clientName].filter(Boolean).join(' · '),
          alerts: hubAlerts.alerts, onGo: setActiveTab, onDismiss: hubAlerts.dismiss,
        } : undefined}
        user={{ name: currentUserAuth?.displayName || (currentUserAuth?.email ? String(currentUserAuth.email).split('@')[0] : 'Signed in'), role: String(currentRole) }}
        menu={[
          { label: 'Projects', icon: Building2, onClick: () => onLeaveProject?.('projects') },
          ...(!isLimited ? [{ label: 'Clients', icon: Users, onClick: () => onLeaveProject?.('clients') }] : []),
          ...(seesStudioFinance(currentRole) ? [{ label: 'Reports', icon: BarChart3, onClick: () => onLeaveProject?.('reports') }] : []),
        ]}
        mobileOpen={mobileNav}
        onMobileClose={() => setMobileNav(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* The page bar: where you are, the page's figures, and what has just changed. */}
        <div className="h-14 shrink-0 bg-white border-b border-slate-200 px-3 sm:px-5 flex items-center gap-3 min-w-0 relative z-30">
          <button type="button" onClick={() => setMobileNav(true)} aria-label="Open the project menu" className="md:hidden w-9 h-9 grid place-items-center rounded-xl text-slate-600 hover:bg-slate-100">
            <Menu className="w-5 h-5" />
          </button>
          {isWizard ? (
            <h1 className="text-base font-extrabold text-slate-800 tracking-tight truncate">{screenTitle}</h1>
          ) : (
            /* Where you are, and a way to the screens beside it (components/projectNav/PageCrumbs). */
            <PageCrumbs activeTab={activeTab} title={screenTitle} stages={sidebarStages} hub={sidebarHub}
              home={{ route: homeRoute, label: homeLabel }} onGo={goTo} />
          )}
          <HeaderFigures />
          <div className="ml-auto shrink-0 flex items-center gap-2">
            <LiveStamp match={(n) => n.projectId === projectId} className="hidden lg:inline-flex" />
            {/* The studio's desks, one click from any project screen (components/projectNav/StudioJump). */}
            <StudioJump role={currentRoles?.length ? currentRoles : currentRole} onGo={(route) => onLeaveProject?.(route)} />
            {holdsFinanceRole(currentRole) && <HideFiguresButton />}
            {isLimited && !(isDesigner && DESIGNER_EDITABLE_TABS.has(activeTab)) && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700"
                title={isDesigner ? 'You can edit the Drawing Tracker. Other screens are read-only for you.' : 'Messages, Timeline, Decisions, Drawings, Design Gate and Brief & Site are read-only for you.'}>
                <Eye className="w-3 h-3" /> Read-only
              </span>
            )}
            {isDesigner && !DESIGNER_EDITABLE_TABS.has(activeTab) && (
              <button type="button" onClick={() => setActiveTab(limitedHome)} className="px-3 py-1.5 rounded-xl bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold whitespace-nowrap">
                Open Drawing Tracker
              </button>
            )}
          </div>
        </div>

        {/* Terminated, or a payment dispute open: said on every screen of the project (components/projectAlerts/ProjectAlertBar). */}
        {!isWizard && (
          <ProjectAlertBar context={projectContext} setProjectContext={setProjectContext as any} tierSummary={tierSummary}
            role={currentRoles?.length ? currentRoles : currentRole}
            actor={String((currentUserAuth as any)?.displayName || (currentUserAuth as any)?.email || currentRole || 'Studio')} />
        )}

      {/*
        The one scroll area and the one gutter for every project screen. App.tsx
        used to wrap each screen in a second padded scroll box inside this one,
        which gave pages two scrollbars and a double margin.
      */}
      <div className="flex flex-1 overflow-hidden min-w-0">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 min-w-0 pb-10 w-full">
        {/* The dashboard route shows the setup wizard until the project has tiers,
            so the title has to follow the screen rather than the route. */}
        <PageTitleBlock
          compact
          route={isWizard ? 'project-setup' : activeTab}
          {...(!isWizard && ENGAGEMENT_PAGE_TITLES[engagement]?.[activeTab] ? ENGAGEMENT_PAGE_TITLES[engagement]![activeTab] : {})}
        />
        {/* Everything but the Drawing Tracker is look-only for a Designer. */}
        <ViewOnlyGuard active={isLimited && !(isDesigner && DESIGNER_EDITABLE_TABS.has(activeTab))}>
          {/* A screen this engagement has no use for, reached by an old link or a bookmark. */}
          {isRouteHidden(engagement, activeTab) ? (
            <div className="max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-800">Not part of a {engagementDef(engagement).adjective} project</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    This is a {engagementDef(engagement).adjective} project, so the studio does not price, contract or run the execution here.
                    If the client has asked the studio to build, change the engagement in Project setup.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => setActiveTab('dashboard')}
                      className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">
                      Open Project setup
                    </button>
                    <button type="button" onClick={() => setActiveTab('drawing-tracker')}
                      className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50">
                      Go to Drawings
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : children}
        </ViewOnlyGuard>
      </div>
      </div>
      </div>


      {/* In-Workspace Status Transition Modal */}
      {isStatusModalOpen && (
        <ProjectStatusTransitionModal
          project={{
            id: projectId,
            lastModified: Date.now(),
            context: projectContext,
          }}
          isOpen={isStatusModalOpen}
          onClose={() => setIsStatusModalOpen(false)}
          onStatusChange={async (_projId, newStatus, note) => {
            if (onStatusChange) {
              await onStatusChange(newStatus, note);
            } else if (setProjectContext) {
              setProjectContext((prev) => ({ ...prev, status: newStatus }));
            }
            setIsStatusModalOpen(false);
          }}
          onClassificationChange={setProjectContext ? (isDummy) => {
            setProjectContext((prev) => ({ ...prev, isDummy, projectCategory: isDummy ? 'dummy' : 'actual' }));
          } : undefined}
        />
      )}

     
    
    </div>
  );
}
