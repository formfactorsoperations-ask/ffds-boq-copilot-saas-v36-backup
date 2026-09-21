import React, { useState, useEffect, useMemo, useRef, lazy, Suspense, useCallback } from "react";
import SuccessWithNextToast from './components/SuccessWithNextToast';
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import Sidebar from "./components/Header";
import Breadcrumb from "./components/Breadcrumb";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { JourneyProvider } from "./services/journeyEngine";
import LockedState from "./components/LockedState";
import { diffHistory, appendHistory } from "./lib/projectHistory";
import ProjectContextCard from "./components/ProjectContextCard";
import { useOrg } from "./contexts/OrgContext";
import PageTitleBlock from "./components/PageTitleBlock";
import { PageHeaderProvider } from "./contexts/PageHeaderContext";
import { BackgroundBeamsWithCollision } from "./components/ui/background-beams-with-collision";
import StudioHomeOrbit from "./components/StudioHomeOrbit";
import StudioFooter from "./components/home/StudioFooter";
import DataPrivacyPage from "./components/studio/DataPrivacyPage";
import SupportDeskPage from "./components/studio/SupportDeskPage";
import TermsOfUsePage from "./components/studio/TermsOfUsePage";
import { readLastTabs, recordLastTab, LastTabs } from "./services/lastVisitedTabs";
import { readAttentionState, writeAttentionEntry, AttentionState, AttentionEntry } from "./services/attentionState";
import { buildProjectTemplate } from "./lib/cloneProject";
import { ensureScopeRooms } from "./lib/scopeBuckets";
import { showSuccessWithNext } from "./components/SuccessWithNextToast";
import { OfflineIndicator } from "./components/OfflineIndicator";

// Helper for resilient lazy loading of dynamic modules with automatic single retry and window reload fallback
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      console.warn("Dynamic import failed, retrying after backoff...", error);
      await new Promise(res => setTimeout(res, 500));
      try {
        return await factory();
      } catch (retryErr) {
        console.error("Dynamic import failed after retry:", retryErr);
        const hasReloaded = sessionStorage.getItem("chunk_reload_done");
        if (!hasReloaded) {
          sessionStorage.setItem("chunk_reload_done", "true");
          window.location.reload();
          return new Promise(() => {}) as any;
        }
        throw retryErr;
      }
    }
  });
}

// Lazy-loaded Views & Tabs to reduce bundle size and memory footprint during compilation
const DocumentsHub = lazyWithRetry(() => import("./components/DocumentsHub"));
const TemplatesAndBankTab = lazyWithRetry(() => import("./components/TemplatesAndBankTab"));
const Dashboard = lazyWithRetry(() => import("./components/Dashboard"));
const StudioDashboard = lazyWithRetry(() => import("./components/StudioDashboard"));
const ProjectListTab = lazyWithRetry(() => import("./components/ProjectListTab"));
const BankTab = lazyWithRetry(() => import("./components/BankTab"));
const TemplateEditorTab = lazyWithRetry(() => import("./components/TemplateEditorTab"));
const AIStrategyTab = lazyWithRetry(() => import("./components/AIStrategyTab"));
const ProjectSetupWizard = lazyWithRetry(() => import("./components/ProjectSetupWizard"));
const LeadBrainTab = lazyWithRetry(() => import("./components/LeadBrainTab"));
const TimelineTab = lazyWithRetry(() => import("./components/TimelineTab"));
const MaterialTab = lazyWithRetry(() => import("./components/MaterialTab"));
const SOFBoardTab = lazyWithRetry(() => import("./components/SOFBoardTab"));
const ExecutionAgreementPage = lazyWithRetry(() => import("./components/client/ExecutionAgreementPage"));
const DesignCompleteGate = lazyWithRetry(() => import("./components/ops/DesignCompleteGate"));
const OnboardingKitPage = lazyWithRetry(() => import("./components/client/OnboardingKitPage"));
const EmailDraftsTab = lazyWithRetry(() => import("./components/EmailDraftsTab"));
const SiteOpsTab = lazyWithRetry(() => import("./components/SiteOpsTab"));
const ClientTab = lazyWithRetry(() => import("./components/client/ClientTab"));
const AnalyticsTab = lazyWithRetry(() => import("./components/AnalyticsTab"));
const OperationsTab = lazyWithRetry(() => import("./components/OperationsTab"));
const ProjectHistory = lazyWithRetry(() => import("./components/ProjectHistory"));
const PaymentCalculatorTab = lazyWithRetry(() => import("./components/PaymentCalculatorTab"));
const RevisionStudio = lazyWithRetry(() => import("./components/RevisionStudio"));
const ClientPortal = lazyWithRetry(() => import("./components/ClientPortal"));
const ClientsDirectory = lazyWithRetry(() => import("./components/ClientsDirectory"));
const StudioReports = lazyWithRetry(() => import("./components/StudioReports"));

const LoginScreen = lazyWithRetry(() => import("./components/LoginScreen"));
const LandingPage = lazyWithRetry(() => import("./components/marketing/LandingPage"));
const LandingPageOrbit = lazyWithRetry(() => import("./components/marketing/LandingPageOrbit"));
const TeamTab = lazyWithRetry(() => import("./components/TeamTab"));
const SubscriptionTab = lazyWithRetry(() => import("./components/SubscriptionTab"));
const StudioSetupWizard = lazyWithRetry(() => import("./components/StudioSetupWizard"));
const StudioSettingsShell = lazyWithRetry(() => import("./components/StudioSettingsShell"));
const SuperAdminDashboard = lazyWithRetry(() => import("./components/SuperAdminDashboard"));
const ClientLoginScreen = lazyWithRetry(() => import("./components/ClientLoginScreen"));
const AgreementSignoffPage = lazyWithRetry(() => import("./components/AgreementSignoffPage"));
const SelectionConfirmPage = lazyWithRetry(() => import("./pages/SelectionConfirmPage"));
const CommunicationTracker = lazyWithRetry(() => import("./components/ops/CommunicationTrackerPage").then(module => ({ default: module.CommunicationTracker })));
const TermsDocketPage = lazyWithRetry(() => import("./components/client/TermsDocketPage"));
const HandoverDocketPage = lazyWithRetry(() => import("./components/client/HandoverDocketPage"));
const PaymentSchedulePage = lazyWithRetry(() => import("./components/client/PaymentSchedulePage"));
const SnagListReportPage = lazyWithRetry(() => import("./components/client/SnagListReportPage"));
const QualityChecklistReportPage = lazyWithRetry(() => import("./components/client/QualityChecklistReportPage"));
const MomAcknowledgePage = lazyWithRetry(() => import("./components/client/MomAcknowledgePage").then(module => ({ default: module.MomAcknowledgePage })));
const ProjectJourneyPage = lazyWithRetry(() => import("./components/ops/journey/ProjectJourneyPage"));
const ProjectReportsTab = lazyWithRetry(() => import("./components/ops/ProjectReportsTab"));
const DrawingTrackerModule = lazyWithRetry(() => import("./components/ops/DrawingTrackerModule"));
const ScopeAdditionsModule = lazyWithRetry(() => import("./components/ops/ScopeAdditionsModule"));
const SupervisorMobileApp = lazyWithRetry(() => import("./components/SupervisorMobileApp"));

import {
  FullProjectData,
  ProjectContext,
  ProjectStatus,
  HistoryEvent,
  ProposalTier,
  Item,
  AIStrategy,
  MaterialSuggestion,
  TimelinePhase,
  LeadProfile,
  DecisionBrainOutput,
  ActiveProject,
  AIStatus,
  BoqItem,
  FullBoqItem,
  ExecutionBundle,
  SOFItem,
  ExecutionBundleStatus,
} from "./types";
import { db, hydrateProjectDetail, projectFromDoc } from "./services/dbService";
import { mergeClientOwned } from "./lib/clientOwned";
import { db as firestoreDb } from "./services/firebaseClient";
import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp, onSnapshot, query, orderBy } from "firebase/firestore";
import { toProjectDecisionRecords } from "./services/decisionProjection";
import { issuePortalAccess, projectIdFromToken } from "./services/portalAccessService";
import { readPortalView } from "./services/portalViewService";
import { onAuthStateChanged } from "firebase/auth";
import { auth as firebaseAuth } from "./services/firebaseClient";
import PortalPublishControls from "./components/ops/PortalPublishControls";
import { buildClientBoqRows, baselineFromSentRows, ClientBoqRow } from "./lib/clientBoq";
import { sendPortalAccessLink } from "./services/emailService";
import { verifyApiKey } from "./services/geminiService";
import { id as generateId, calculateSellPrice, calculateCostFromSell } from "./lib/utils";
import { initCommunicationLog } from "./services/communicationTrackerService";
import { INITIAL_TEMPLATES } from "./lib/standardPackages";
import { INITIAL_BANK } from "./constants";
import { SaveIcon, UploadIcon, NewFileIcon } from "./components/Icons";
import Card from "./components/shared/Card";

// Default Empty Context
const DEFAULT_CONTEXT: ProjectContext = {
  name: "New Project",
  location: "Mumbai",
  area: 0,
  config: "2-BHK",
  rooms: [],
};

// Default Profile
const DEFAULT_LEAD_PROFILE: LeadProfile = {
  iterationsToClose: '1',
  hiddenDecisionMakers: 'None',
  primaryFrictionPoint: 'Overall Budget',
  communicationPreference: 'WhatsApp',
};

export default function App() {
  // Global State
  console.log("App.tsx is rendering...");
  const { orgData, currentUserAuth, currentRole, teamMembers } = useOrg();
  const [activeTab, setActiveTab] = useState("home");
  const [showWizardOverride, setShowWizardOverride] = useState(false);
  useEffect(() => {
    const handleTabChange = (e: any) => {
        if (e.detail) {
            setActiveTab(e.detail);
        }
    };
    window.addEventListener('change-tab', handleTabChange);
    return () => window.removeEventListener('change-tab', handleTabChange);
  }, []);

  /*
    The marketing page is for people who arrived at the front door.

    A client following a portal link did not: they were sent somewhere specific
    by their studio, and being shown a pitch for the product first — with a
    single "Open the studio" button as the only way past it — reads as a wrong
    link. The initial value cannot decide that on its own, because the portal id
    is parsed inside init(), so the effect below retracts it as soon as we know.
  */
  const [showLanding, setShowLanding] = useState(
    () => !localStorage.getItem("ffds_seen_landing"),
  );
  useEffect(() => {
    if (!showLanding) localStorage.setItem("ffds_seen_landing", "1");
  }, [showLanding]);

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>("checking");

  // Data Libraries
  const [projectLibrary, setProjectLibrary] = useState<FullProjectData[]>([]);
  const [bank, setBank] = useState<Item[]>([]);
  const [draftBank, setDraftBank] = useState<Item[]>([]);
  const [isDraftBankMode, setIsDraftBankMode] = useState(false);
  const [templates, setTemplates] = useState(INITIAL_TEMPLATES);

  // Active Project State
  const [activeInternalId, setActiveInternalId] = useState<string | null>(null);

  /*
    The decision ledger for the open project.

    This subscription used to live inside the Decisions screen, which meant
    projectContext.projectDecisions -- the array the client portal reads -- only
    caught up while that screen was mounted. Sign off a decision, leave the tab,
    and the portal kept showing it as pending.

    It has to be the ONLY listener on this query: a second onSnapshot on the
    same target puts the Firestore SDK into an inconsistent state ("INTERNAL
    ASSERTION FAILED (ID: b815)"), which is why the screen now reads this array
    rather than opening its own.
  */
  /*
    The single source of truth for which app a visitor gets.

    Reads users/{uid} once per sign-in. A `Client` role lands in the portal,
    everything else in the studio app, wherever they arrived from.
  */
  useEffect(() => {
    if (!firebaseAuth) {
      setAuthResolved(true);
      return;
    }
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        setAuthProfile(null);
        setAuthResolved(true);
        return;
      }
      try {
        const snap = await getDoc(doc(firestoreDb, "users", user.uid));
        const data = snap.exists() ? (snap.data() as any) : {};
        setAuthProfile({
          uid: user.uid,
          email: user.email || undefined,
          role: data.role || "Admin",
          tenantId: data.tenantId,
          projectIds: data.projectIds || [],
        });
      } catch {
        // No profile readable: treat as a studio user, which the studio rules
        // will then constrain. Never as a client, since that would hand out a
        // project view on a failed read.
        setAuthProfile({ uid: user.uid, email: user.email || undefined, role: "Admin", projectIds: [] });
      }
      setAuthResolved(true);
    });
    return () => unsub();
  }, []);

  const [decisionLedger, setDecisionLedger] = useState<any[]>([]);

  useEffect(() => {
    if (!firestoreDb || !activeInternalId) {
      setDecisionLedger([]);
      return;
    }

    const q = query(
      collection(firestoreDb, "projects", activeInternalId, "decisions"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
          ...d.data(),
        })) as any[];
        setDecisionLedger(fetched);

        const projected = toProjectDecisionRecords(fetched);
        setProjectContext((prev) => {
          const current = (prev as any).projectDecisions || [];
          if (JSON.stringify(current) === JSON.stringify(projected)) return prev;
          return { ...prev, projectDecisions: projected } as any;
        });
      },
      (err) => console.error("Error subscribing to decision ledger:", err),
    );

    return () => unsubscribe();
  }, [activeInternalId]);
  const [projectArchitecture, setProjectArchitecture] = useState<'legacy' | 'canonical'>('canonical');
  const [projectContext, setProjectContext] =
    useState<ProjectContext>(DEFAULT_CONTEXT);
  const [tiers, setTiers] = useState<ProposalTier[]>([]);
  const [activeTierId, setActiveTierId] = useState<string | null>(null);

  const [activeProject, setActiveProject] = useState<ActiveProject | null>(
    null,
  ); // Execution State

  // AI & Auxiliary State
  const [aiStrategy, setAiStrategy] = useState<AIStrategy>("balanced");
  const [materialSuggestions, setMaterialSuggestions] = useState<
    MaterialSuggestion[]
  >([]);
  const [timelinePhases, setTimelinePhases] = useState<TimelinePhase[]>([]);
  const [leadProfile, setLeadProfile] =
    useState<LeadProfile>(DEFAULT_LEAD_PROFILE);
  const [decisionBrainOutput, setDecisionBrainOutput] =
    useState<DecisionBrainOutput | null>(null);

  // Client View Mode (for shared links/preview if implemented)
  const [isClientView, setIsClientView] = useState(false);
  const [clientViewData, setClientViewData] = useState<FullProjectData | null>(
    null,
  );
  const [portalProjectId, setPortalProjectId] = useState<string | null>(null);

  /*
    Who is signed in, and what they are allowed to be.

    The app used to decide this from localStorage: `ffds_app_mode = "ops"` put
    any visitor straight into the studio app with no check on whether anybody
    was signed in. Mode is now derived from the account -- the URL and local
    storage can suggest a destination, never grant one.
  */
  const [authProfile, setAuthProfile] = useState<
    { uid: string; email?: string; role: string; tenantId?: string; projectIds: string[] } | null
  >(null);
  const [authResolved, setAuthResolved] = useState(false);
  /** Branding for the client door, read from the public organizations doc. */
  const [portalStudioBrand, setPortalStudioBrand] = useState<{
    name?: string;
    logo?: string;
    /* Carried so the door can offer a way to ask for credentials rather than
       telling a locked-out client to contact a studio it will not name. */
    phone?: string;
    email?: string;
  }>({});
  /** Why a portal link was refused, shown on the login screen. */
  const [portalDenied, setPortalDenied] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<
    | "loading"
    | "login"
    | "ops"
    | "client"
    | "selection_confirm"
    | "agreement_signoff"
    | "booking_approval"
    | "mom_acknowledge"
  >("loading");
  const [signoffToken, setSignoffToken] = useState<string | null>(null);
  const [agreementSignoffToken, setAgreementSignoffToken] = useState<
    string | null
  >(null);
  const [selectionConfirmToken, setSelectionConfirmToken] = useState<
    string | null
  >(null);
  const [momToken, setMomToken] = useState<string | null>(null);
  const [clientPortalProject, setClientPortalProject] =
    useState<FullProjectData | null>(null);

  const [confirmReset, setConfirmReset] = useState(false);
  const [highlightedBankItemId, setHighlightedBankItemId] = useState<
    string | null
  >(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Ref to access active ID inside async effects without stale closures
  const activeIdRef = useRef(activeInternalId);
  useEffect(() => {
    activeIdRef.current = activeInternalId;
  }, [activeInternalId]);

  // --- INITIALIZATION ---
  useEffect(() => {
    const init = async () => {
      const searchStr = window.location.search;
      const hashStr = window.location.hash;
      const urlParams = new URLSearchParams(searchStr);
      
      // Also extract params if in hash (e.g. #/?agreementSignoff=... or #?agreementSignoff=...)
      let hashParams = new URLSearchParams();
      if (hashStr.includes("?")) {
        hashParams = new URLSearchParams(hashStr.substring(hashStr.indexOf("?")));
      }

      const signoffQueryToken = urlParams.get("signoff") || hashParams.get("signoff");
      const agreementQueryToken = 
        urlParams.get("agreementSignoff") || hashParams.get("agreementSignoff") ||
        urlParams.get("agreement") || hashParams.get("agreement") ||
        urlParams.get("contractSignoff") || hashParams.get("contractSignoff");
      const pinQuery = urlParams.get("pin") || hashParams.get("pin");

      if (agreementQueryToken) {
        setAgreementSignoffToken(agreementQueryToken);
        setAppMode("agreement_signoff");
        setIsDataLoaded(true);
        return;
      }

      if (pinQuery) {
        setAgreementSignoffToken(pinQuery);
        setAppMode("agreement_signoff");
        setIsDataLoaded(true);
        return;
      }

      if (signoffQueryToken) {
        const isAgreementToken = 
          signoffQueryToken.includes("AGREEMENT") ||
          signoffQueryToken.startsWith("EXEC") ||
          signoffQueryToken.startsWith("DESIGN_") ||
          signoffQueryToken.startsWith("TERMS_") ||
          signoffQueryToken.startsWith("PROPOSAL_") ||
          signoffQueryToken.startsWith("HANDOVER_") ||
          signoffQueryToken.startsWith("SEC-");

        if (isAgreementToken) {
          setAgreementSignoffToken(signoffQueryToken);
          setAppMode("agreement_signoff");
          setIsDataLoaded(true);
          return;
        }

        // Not an agreement token, so it is a decision one. Decisions are
        // approved in the client portal now; there is no standalone page to
        // send them to, and pretending otherwise would strand them.
        setIsDataLoaded(true);
        return;
      }

      const path = window.location.pathname;
      const cleanHash = hashStr.replace(/^#\/?/, '/');
      const testPaths = [path, cleanHash];

      for (const p of testPaths) {
        if (p.startsWith("/agreement-signoff/") || p.startsWith("/agreement/")) {
          const token = p.split("/")[2]?.split("?")[0];
          if (token) {
            setAgreementSignoffToken(token);
            setAppMode("agreement_signoff");
            setIsDataLoaded(true);
            return;
          }
        }

        // /signoff/ carries agreement tokens only now; the decision sign-off
        // page was removed and those approvals happen in the client portal.
        if (p.startsWith("/signoff/")) {
          const token = p.split("/")[2]?.split("?")[0];
          if (token) {
            const isAgreementToken = 
              token.includes("AGREEMENT") ||
              token.startsWith("EXEC") ||
              token.startsWith("DESIGN_") ||
              token.startsWith("TERMS_") ||
              token.startsWith("PROPOSAL_") ||
              token.startsWith("HANDOVER_") ||
              token.startsWith("SEC-");

            if (isAgreementToken) {
              setAgreementSignoffToken(token);
              setAppMode("agreement_signoff");
              setIsDataLoaded(true);
              return;
            }

            setIsDataLoaded(true);
            return;
          }
        }
      }
      if (path.startsWith("/selection-confirm/")) {
        const token = path.split("/")[2];
        if (token) {
          setSelectionConfirmToken(token);
          setAppMode("selection_confirm");
          setIsDataLoaded(true);
          return;
        }
      }
      if (path.startsWith("/booking-approval/")) {
        const token = path.split("/")[2];
        if (token) {
          setSignoffToken(token); // reusing token state or create new
          setAppMode("booking_approval");
          setIsDataLoaded(true);
          return;
        }
      }
      if (path.startsWith("/mom/")) {
        const token = path.split("/")[2];
        if (token) {
          setMomToken(token);
          setAppMode("mom_acknowledge");
          setIsDataLoaded(true);
          return;
        }
      }
      if (path === "/studio-settings") {
        setActiveTab("studio-settings");
      }

      // `portal` now carries an access token, not a bare project id. The id is
      // only a claim extracted from it; verifyPortalToken decides.
      const portalToken = urlParams.get("portal");
      const portalId = portalToken ? projectIdFromToken(portalToken) : null;

      if (portalId) {
        setPortalProjectId(portalId);
      }

      verifyApiKey().then((status) => setAiStatus(status));

      const timeoutWrapper = <T,>(
        promise: Promise<T>,
        ms = 5000,
      ): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), ms),
          ),
        ]);
      };

      let storedBank = INITIAL_BANK;
      let storedDraftBank = INITIAL_BANK;
      let storedTemplates = INITIAL_TEMPLATES;
      let storedProjects: FullProjectData[] = [];

      try {
        const [bankResult, draftBankResult, templatesResult, projectsResult] = await Promise.allSettled([
          timeoutWrapper(db.getBank(), 5000),
          timeoutWrapper(db.getDraftBank(), 5000),
          timeoutWrapper(db.getTemplates(), 5000),
          timeoutWrapper(db.getProjects(), 8000)
        ]);

        if (bankResult.status === 'fulfilled') {
          storedBank = bankResult.value;
        } else {
          console.warn("Bank fetch timeout or error, falling back locally");
          const p = localStorage.getItem("ffds_item_bank");
          storedBank = p ? JSON.parse(p) : INITIAL_BANK;
        }

        if (draftBankResult.status === 'fulfilled') {
          storedDraftBank = draftBankResult.value;
        } else {
          const p = localStorage.getItem("ffds_draft_item_bank");
          storedDraftBank = p ? JSON.parse(p) : storedBank;
        }

        if (templatesResult.status === 'fulfilled') {
          storedTemplates = templatesResult.value || INITIAL_TEMPLATES;
        } else {
          const p = localStorage.getItem("ffds_templates");
          storedTemplates = p ? JSON.parse(p) : INITIAL_TEMPLATES;
        }

        if (projectsResult.status === 'fulfilled') {
          storedProjects = projectsResult.value;
        } else {
          console.warn("Failed to load projects from DB, falling back to local memory:", projectsResult.reason);
          storedProjects = [];
        }

      } catch (e) {
        console.warn("Fatal error during DB initialization, using local fallbacks", e);
      }

      // --- FIX: Merge missing items from INITIAL_BANK and fix incorrect categories ---
      const initialBankMap = new Map(INITIAL_BANK.map((i) => [i.id, i]));
      let bankModified = false;

      storedBank = storedBank.map((item) => {
        const initialItem = initialBankMap.get(item.id);
        // Sync category with INITIAL_BANK if it exists
        if (initialItem && item.cat !== initialItem.cat) {
          bankModified = true;
          return { ...item, cat: initialItem.cat };
        }
        // Clean up any weird categories like "1", "2" or lowercase "carpentry"
        if (!initialItem) {
          let newCat = item.cat || "General";
          if (newCat.toLowerCase() === "carpentry") newCat = "Carpentry";
          else if (newCat === "1" || newCat === "2") newCat = "General";

          if (newCat !== item.cat) {
            bankModified = true;
            return { ...item, cat: newCat };
          }
        }
        return item;
      });

      const storedIds = new Set(storedBank.map((i) => i.id));
      const newItems = INITIAL_BANK.filter((i) => !storedIds.has(i.id));

      if (newItems.length > 0 || bankModified) {
        console.log(
          `Merging ${newItems.length} new items into bank and fixing categories...`,
        );
        storedBank = [...newItems, ...storedBank];
      }

      // --- DEDUPLICATE STORED BANK ---
      const uniqueStoredBankMap = new Map<string, Item>();
      storedBank.forEach((item) => {
        uniqueStoredBankMap.set(item.id, item);
      });
      storedBank = Array.from(uniqueStoredBankMap.values());

      if (newItems.length > 0 || bankModified) {
        await db.saveBank(storedBank);
      }
      // --------------------------------------------------------------------------------

      setBank(storedBank);
      setDraftBank(storedDraftBank);
      setTemplates(storedTemplates);
      setProjectLibrary(storedProjects);

      setIsDataLoaded(true);

      /*
        The mode is no longer decided here.

        A portal link says which project the visitor is heading for, and the
        studio whose branding the sign-in should wear. It grants nothing on its
        own -- the effect below opens a portal only once somebody has signed in
        as a client. localStorage no longer gets a vote at all; `ffds_app_mode`
        set by hand used to be enough to enter the studio app.
      */
      if (portalId) {
        localStorage.setItem("ffds_client_project_id", portalId);
      }

      /*
        Deliberately does NOT set the mode.

        init() finishes asynchronously, so an unconditional setAppMode("login")
        here lands after the role effect has already decided and silently undoes
        it -- a signed-in studio user was being shown the sign-in screen. The
        effect keyed on the resolved account is the only writer of the mode.
      */
    };
    init();
  }, []);

  /*
    Retract the marketing page for anyone it was not written for.

    Two cases: a portal link, which names a project and so is addressed to one
    client; and an account that is already signed in, for whom a pitch page is
    simply an extra click on the way back to their own work. Writing it through
    state rather than the render condition means it also survives the client
    door handing off to the studio door, which clears portalProjectId.
  */
  useEffect(() => {
    if (portalProjectId || authProfile) setShowLanding(false);
  }, [portalProjectId, authProfile]);

  /*
    Whose name the client door wears.

    Best effort only: a portal link names a project, the project names a tenant,
    and the tenant's organizations document is public profile data. If any step
    is unreadable the door simply shows no branding rather than failing -- it is
    decoration, not a gate.
  */
  useEffect(() => {
    if (!portalProjectId || authProfile) return;
    let cancelled = false;
    (async () => {
      try {
        const projectSnap = await getDoc(doc(firestoreDb, "projects", portalProjectId));
        const tenantId = projectSnap.exists() ? (projectSnap.data() as any)?.tenantId : null;
        if (!tenantId || cancelled) return;
        const orgSnap = await getDoc(doc(firestoreDb, "organizations", tenantId));
        if (!orgSnap.exists() || cancelled) return;
        const org = orgSnap.data() as any;
        const looksLikeAnId = !org.orgName || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(String(org.orgName));
        setPortalStudioBrand({
          name: looksLikeAnId ? undefined : org.orgName,
          logo: org.orgLogo || undefined,
          phone: org.contactPhone || undefined,
          email: org.contactEmail || undefined,
        });
      } catch {
        // Unbranded door.
      }
    })();
    return () => { cancelled = true; };
  }, [portalProjectId, authProfile]);

  /*
    Identity decides the destination.

    A Client role opens the portal, everything else opens the studio app --
    whichever door they came through. Which project a client sees comes from
    their own users/{uid}.projectIds, intersected with whatever the link asked
    for, so a link for somebody else's project opens nothing.
  */
  useEffect(() => {
    if (!authResolved || !isDataLoaded) return;

    if (!authProfile) {
      setAppMode("login");
      return;
    }

    // A fresh attempt: whatever stopped the last one is no longer the reason.
    setPortalDenied(null);

    if (authProfile.role !== "Client") {
      setAppMode("ops");
      return;
    }

    const asked = localStorage.getItem("ffds_client_project_id");
    const allowed = authProfile.projectIds || [];
    const target = asked && allowed.includes(asked) ? asked : allowed[0];
    if (!target) {
      setPortalDenied("This login is not attached to a project yet. Please contact your studio.");
      setAppMode("login");
      return;
    }

    let cancelled = false;
    (async () => {
      /*
        The portal renders from the published projection, never the project
        document. buildPortalView already strips rates, margins and anything
        not published; reading it here is what makes "not shown to the client"
        mean "never sent to the client".
      */
      const view = await readPortalView(target);
      if (cancelled) return;
      if (!view) {
        setPortalDenied("Your project is not published yet. Please contact your studio.");
        setAppMode("login");
        return;
      }
      setClientPortalProject({
        id: target,
        lastModified: Date.now(),
        context: view.context,
      } as any);
      setAppMode("client");
    })();

    return () => { cancelled = true; };
  }, [authResolved, authProfile, isDataLoaded]);

  // Re-fetch all data when tenantId changes (multi-tenant isolation safety)
  useEffect(() => {
    if (!orgData?.tenantId) return;
    
    // Skip if data is not loaded yet (since init() will load it anyway)
    if (!isDataLoaded) return;

    async function reloadTenantData() {
      console.log(`Tenant changed to ${orgData?.tenantId} - reloading library...`);
      try {
        const [bankResult, draftBankResult, templatesResult, projectsResult] = await Promise.allSettled([
          db.getBank(),
          db.getDraftBank(),
          db.getTemplates(),
          db.getProjects()
        ]);

        if (bankResult.status === 'fulfilled') setBank(bankResult.value);
        if (draftBankResult.status === 'fulfilled') setDraftBank(draftBankResult.value);
        if (templatesResult.status === 'fulfilled') setTemplates(templatesResult.value || INITIAL_TEMPLATES);
        if (projectsResult.status === 'fulfilled') {
          setProjectLibrary(projectsResult.value);
          console.log(`Successfully reloaded ${projectsResult.value.length} projects for tenant ${orgData?.tenantId}`);
        }
      } catch (err) {
        console.error("Error reloading tenant data:", err);
      }
    }
    
    reloadTenantData();
  }, [orgData?.tenantId, isDataLoaded]);

  // Refresh Project Library on Tab Switch with Smart Merge
  useEffect(() => {
    if (activeTab === "projects") {
      db.getProjects().then((fetchedProjects) => {
        setProjectLibrary((currentLib) => {
          // Critical: If we have an active project in memory (e.g. just created/imported),
          // ensure it overrides the DB fetch if the DB is stale/empty.
          const currentActiveId = activeIdRef.current;
          if (currentActiveId) {
            const inMemoryActive = currentLib.find(
              (p) => p.id === currentActiveId,
            );
            if (inMemoryActive) {
              const dbIndex = fetchedProjects.findIndex(
                (p) => p.id === currentActiveId,
              );

              if (dbIndex === -1) {
                // Project exists locally but not in DB yet -> Prepend it
                return [inMemoryActive, ...fetchedProjects];
              } else {
                // Project exists in DB, but check which is newer
                if (
                  inMemoryActive.lastModified >
                  fetchedProjects[dbIndex].lastModified
                ) {
                  fetchedProjects[dbIndex] = inMemoryActive;
                }
              }
            }
          }
          return fetchedProjects;
        });
      });
    }
  }, [activeTab]);

  // Auto-save Item Bank (Critical for Excel Imports Persistence)
  useEffect(() => {
    if (isDataLoaded && bank.length > 0) {
      const timeout = setTimeout(() => {
        db.saveBank(bank);
      }, 1000); // 1 second debounce
      return () => clearTimeout(timeout);
    }
  }, [bank, isDataLoaded]);

  useEffect(() => {
    if (isDataLoaded && draftBank.length > 0) {
      const timeout = setTimeout(() => {
        db.saveDraftBank(draftBank);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [draftBank, isDataLoaded]);

  // Sync AdHoc Items to Bank
  useEffect(() => {
    if (projectContext?.adHocItems && projectContext.adHocItems.length > 0) {
      setBank((prevBank) => {
        const seenIds = new Set(prevBank.map((item) => item.id));
        const uniqueNewItems: Item[] = [];
        projectContext.adHocItems!.forEach((adHocItem) => {
          if (!seenIds.has(adHocItem.id)) {
            seenIds.add(adHocItem.id);
            uniqueNewItems.push(adHocItem);
          }
        });
        if (uniqueNewItems.length > 0) {
          const updated = [...prevBank, ...uniqueNewItems];
          db.saveBank(updated).catch((err) =>
            console.error("Failed to sync adhoc items to DB:", err),
          );
          return updated;
        }
        return prevBank;
      });
    }
  }, [projectContext?.adHocItems]);

  // --- CALCULATED VALUES ---

  const tiersWithCalculatedSummaries = useMemo(() => {
    const bankMap = new Map<string, Item>(bank.map((i) => [i.id, i]));

    // Also ensure adHocItems are in the map, so local ad-hoc items resolve properly
    if (projectContext?.adHocItems) {
      projectContext.adHocItems.forEach((i) => bankMap.set(i.id, i));
    }

    return tiers.map((tier) => {
      let totalSell = 0;
      let totalCost = 0;
      let activeItemCount = 0;

      tier.boq.forEach((b) => {
        const item = bankMap.get(b.bankId);
        let itemCost = 0;
        let itemSell = 0;

        if (item) {
          const effectiveMaterials = b.baseRate !== undefined ? b.baseRate : item.materials;
          const effectiveLabor = b.labor !== undefined ? b.labor : item.labor;
          const cost = (effectiveMaterials + effectiveLabor) * b.qty;
          const margin = b.marginOverride ?? item.margin;
          itemCost = cost;
          itemSell =
            calculateSellPrice(effectiveMaterials, effectiveLabor, margin) * b.qty;
        } else {
          // Safe calculation if item is completely missing from bank and adHocItems
          const margin = b.marginOverride ?? 0;
          const effectiveMaterials = b.materials !== undefined ? b.materials : (b.baseRate !== undefined ? b.baseRate : 0);
          const effectiveLabor = b.labor !== undefined ? b.labor : 0;
          if (effectiveMaterials > 0 || effectiveLabor > 0) {
            const cost = (effectiveMaterials + effectiveLabor) * b.qty;
            itemCost = cost;
            itemSell = calculateSellPrice(effectiveMaterials, effectiveLabor, margin) * b.qty;
          } else if (b.selectedRate) {
            itemSell = b.selectedRate * b.qty;
            itemCost = calculateCostFromSell(itemSell, margin);
          } else {
            itemCost = 0;
            itemSell = 0;
          }
        }

        const status = b.boqStatus;
        if (status !== 'deleted' && status !== 'substituted' && status !== 'excluded' && status !== 'client_procured') {
          totalCost += itemCost;
          totalSell += itemSell;
          activeItemCount++;
        }
      });

      // Design Fee Calc
      let designFee = 0;
      if (projectContext.designFeeType === "fixed_lumpsum")
        designFee = projectContext.designFee || 0;
      else if (projectContext.designFeeType === "fixed_sqft")
        designFee =
          (projectContext.designFee || 0) * (projectContext.area || 0);
      else designFee = totalSell * ((projectContext.designFee || 10) / 100);

      const totalRevenue = totalSell + designFee;
      const execProfit = totalSell - totalCost;
      const totalProfit = execProfit + designFee;
      const blendedGm =
        totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      const totalGm = totalSell > 0 ? (execProfit / totalSell) * 100 : 0;

      return {
        ...tier,
        summary: {
          totalSell,
          totalCost,
          totalGm,
          itemCount: activeItemCount,
          totalRevenue,
          designFee,
          blendedGm,
        },
        executionTotal: totalSell, // for easy access
      };
    });
  }, [tiers, bank, projectContext]);

  // Update Project Library State IMMEDIATELY when active project changes
  // This ensures that if user navigates to "My Projects" before auto-save completes, they see up-to-date data
  useEffect(() => {
    if (activeInternalId && projectContext) {
      setProjectLibrary((prev) => {
        const idx = prev.findIndex((p) => p.id === activeInternalId);

        const updatedProject: FullProjectData = {
          id: activeInternalId,
          architecture: projectArchitecture,
          lastModified: Date.now(),
          context: projectContext,
          tiers: tiersWithCalculatedSummaries, // Use calculated tiers
          activeTierId,
          activeProject,
          materials: materialSuggestions,
          timeline: timelinePhases,
          leadProfile,
          decisionBrainOutput,
        };

        if (idx === -1) {
          // NEW PROJECT: Prepend to list immediately
          return [updatedProject, ...prev];
        } else {
          // EXISTING PROJECT: Update in place
          const newLib = [...prev];
          newLib[idx] = updatedProject;
          return newLib;
        }
      });
    }
  }, [
    projectContext,
    tiersWithCalculatedSummaries,
    activeTierId,
    activeProject,
    materialSuggestions,
    timelinePhases,
    leadProfile,
    decisionBrainOutput,
    activeInternalId,
    projectArchitecture,
  ]);

  // Track project history changes via pure diff engine
  const prevContextRef = useRef<{ id: string | null; context: ProjectContext } | null>(null);

  // Prevent infinite loops and concurrent auto-promotion attempts
  const isPromotingRef = useRef<Record<string, boolean>>({});
  const lastPromoteAttemptRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (activeInternalId && projectContext) {
      // If we switched projects or just initialized, establish baseline without diff
      if (
        prevContextRef.current === null ||
        prevContextRef.current.id !== activeInternalId
      ) {
        prevContextRef.current = { id: activeInternalId, context: projectContext };
        return;
      }

      const prev = prevContextRef.current.context;
      // If identical reference, nothing changed
      if (prev === projectContext) return;

      const diffs = diffHistory(prev, projectContext, currentRole || "You");
      
      // Update baseline immediately
      prevContextRef.current = { id: activeInternalId, context: projectContext };

      if (diffs.length > 0) {
        console.log("DIFF HISTORY TRIGGERED DIFFS: ", diffs);
        const updatedHistory = appendHistory(projectContext.history, diffs);
        // Pre-update the ref to avoid double triggers on the resulting state update
        prevContextRef.current = {
          id: activeInternalId,
          context: { ...projectContext, history: updatedHistory },
        };
        setProjectContext((prevCtx) => {
          if ((prevCtx.history?.length || 0) === updatedHistory.length) return prevCtx;
          return { ...prevCtx, history: updatedHistory };
        });
      }
    } else {
      prevContextRef.current = null;
    }
  }, [projectContext, activeInternalId, currentRole]);

  /*
    Watch the open project for changes this session did not make.

    A client's sign-off, query, dispute or selection confirmation is applied
    server-side by the submitClientAction callable, straight onto the project
    document. This session knows nothing about it — and then auto-save writes
    the whole project from memory every couple of seconds, replacing the stored
    context with one that never had the client's change in it. An
    acknowledgement recorded at 23:16 was gone by 23:17, overwritten by a
    session that had loaded before it arrived.

    Only the fields a client can actually change are merged. Taking the whole
    remote context would mean the studio losing whatever they were editing at
    the moment a snapshot landed — the same overwrite, pointed the other way.
  */
  /*
    The last client-owned state seen on the server, kept so the auto-save can
    carry it even when a write is already in flight. A snapshot updates React
    state, but a save queued before that snapshot arrived holds the older
    context — and it is that save which was erasing signatures.
  */
  const remoteClientOwnedRef = useRef<any>(null);

  useEffect(() => {
    if (!firestoreDb || !activeInternalId) return;

    const unsub = onSnapshot(
      doc(firestoreDb, "projects", activeInternalId),
      (snap) => {
        /*
          Skip our own writes. They are already in state, and a snapshot for
          one would merge a value into itself on every auto-save.
        */
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;

        const remote = projectFromDoc(snap.id, snap.data());
        const remoteContext = remote?.context;
        if (!remoteContext) return;

        /*
          No timestamp comparison here, deliberately.

          The first version skipped any snapshot whose `lastModified` was not
          newer than this session's last save. But those two stamps come from
          two different clocks — the browser's and the Cloud Function's — and
          comparing them is meaningless. Whenever the function's clock read
          behind the browser's, every client change was discarded on arrival and
          only appeared after a reload, when the reference had reset to zero.

          `hasPendingWrites` already excludes our own writes, and Firestore
          delivers current state rather than a replay, so a snapshot that
          differs is a snapshot with something in it we do not have.
        */

        remoteClientOwnedRef.current = remoteContext;

        setProjectContext((prev: any) => {
          if (!prev) return prev;
          /*
            A merge, not a replacement. Taking the remote copy wholesale would
            drop a version the studio has just issued; the merge keeps the
            studio's list and carries the client's signatures onto it.
          */
          const merged = mergeClientOwned(prev, remoteContext);
          if (merged === prev) return prev;
          console.log("Merged client changes from the portal");
          return merged;
        });
      },
      (err) => console.warn("Could not watch the open project", err),
    );

    return () => unsub();
  }, [activeInternalId]);

  // Auto-save Project to DB
  useEffect(() => {
    if (activeInternalId && projectContext) {
      console.log(
        "Auto-save useEffect triggered for project:",
        activeInternalId,
      );
        const projectToSave: FullProjectData = {
        id: activeInternalId,
        architecture: projectArchitecture,
        lastModified: Date.now(),
        context: projectContext,
        tiers: tiersWithCalculatedSummaries, // SAVE CALCULATED TIERS
        activeTierId: activeTierId,
        activeProject: activeProject,
        materials: materialSuggestions,
        timeline: timelinePhases,
        leadProfile: leadProfile,
        decisionBrainOutput: decisionBrainOutput,
      };

      // Debounce save
      const timeout = setTimeout(() => {
        console.log("Calling db.saveProject...");
        /*
          Fold in whatever the server last showed for the fields a client owns.

          Without this, a save queued moments before a client's acknowledgement
          arrived would still write the context it captured — and the signature
          the client had just given would be gone. The merge keeps this
          session's own work and refuses only to drop theirs.
        */
        const safeToSave = remoteClientOwnedRef.current
          ? { ...projectToSave, context: mergeClientOwned(projectToSave.context as any, remoteClientOwnedRef.current) }
          : projectToSave;
        db.saveProject(safeToSave);
        /*
          Keep the library entry in step with what was just written.

          Several handlers — status changes, quick field edits — build a whole
          project payload from `projectLibrary` and save that. The auto-save
          never updated the library, so its entry stayed at whatever was loaded
          when the project was opened. Any one of those handlers would then
          write that stale copy back over the cloud, and a document that had
          gained two approved annexures reverted to the state it was in when the
          project was opened.

          The library is a cache of what is stored; it has to be updated when
          what is stored changes.
        */
        setProjectLibrary((prev) =>
          prev.map((p) => (p.id === activeInternalId ? { ...p, ...projectToSave } : p)),
        );
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [
    projectContext,
    tiersWithCalculatedSummaries,
    activeTierId,
    activeProject,
    materialSuggestions,
    timelinePhases,
    leadProfile,
    decisionBrainOutput,
    activeInternalId,
    projectArchitecture,
  ]);

  // Auto-promote project to Stage 5 (Execution) ONLY if project is 'won' and all Stage 4 design gates are completed
  useEffect(() => {
    if (!activeInternalId || !orgData?.tenantId || !projectContext) return;
    
    // Only consider auto-promoting if the project is currently 'won' (Stage 4)
    // Never auto-promote projects that are draft, lead, proposal_sent, negotiation, work_paused, completed, or lost
    if (projectContext.status !== 'won') return;

    const currentStage = projectContext.lifecycle?.stage || 1;
    if (currentStage >= 5) return;

    // Prevent concurrent promotion attempts or rapid retries (within 5 seconds) on errors/stale state
    const now = Date.now();
    const lastAttempt = lastPromoteAttemptRef.current[activeInternalId] || 0;
    if (isPromotingRef.current[activeInternalId] || (now - lastAttempt < 5000)) {
      return;
    }

    const checkAndPromote = async () => {
      const projectId = activeInternalId;
      if (isPromotingRef.current[projectId]) return;

      isPromotingRef.current[projectId] = true;
      lastPromoteAttemptRef.current[projectId] = Date.now();

      try {
        const orgId = orgData.tenantId;

        // 1. Check Onboarding Kit completion
        const onboardingCompleted = !!(projectContext.onboardingData || projectContext.onboardingContent);

        // 2. Check Payment Schedule completion
        const paymentScheduleCompleted = !!(projectContext.paymentMilestones && projectContext.paymentMilestones.length > 0);

        // 3. Check Design Gate completion
        const gateSnap = await getDocs(collection(firestoreDb, `organizations/${orgId}/projects/${projectId}/designGate`));
        const gateDoc = gateSnap.docs.find(d => d.id === 'main');
        const gateData = gateDoc?.data();
        const designGateCompleted = !!(gateData && gateData.gateActivated);

        // 4. Check Drawing Tracker completion
        const drawingsSnap = await getDocs(collection(firestoreDb, `organizations/${orgId}/projects/${projectId}/drawingTracker`));
        const drawings = drawingsSnap.docs.map(d => d.data());
        const drawingsCompleted = drawings.length > 0 ? drawings.every((d: any) => d.approvedAt != null) : false;

        if (onboardingCompleted && paymentScheduleCompleted && designGateCompleted && drawingsCompleted) {
          console.log(`Auto-promoting project ${projectId} to Stage 5 (Execution). All approvals verified.`);
          
          // Import advance dynamically
          const { advance } = await import('./services/lifecycleService');
          
          // Advance directly to Stage 5 (the service will auto-activate the design gate)
          const updatedLifecycle = await advance(orgId, projectId, { type: 'ADVANCE', toStage: 5 });

          // Update project context in state
          const updatedCtx: ProjectContext = {
            ...projectContext,
            status: 'execution',
            lifecycle: updatedLifecycle,
          };
          setProjectContext(updatedCtx);

          // Update project library
          setProjectLibrary((prev) =>
            prev.map((p) => (p.id === projectId ? { ...p, context: updatedCtx, lastModified: Date.now() } : p))
          );

          // Update firestore document to enable the Execution tab
          const batch = writeBatch(firestoreDb);
          batch.set(doc(firestoreDb, `organizations/${orgId}/projects`, projectId), {
            status: 'execution',
            'context.status': 'execution',
            'context.lifecycle': updatedLifecycle
          }, { merge: true });

          // Trigger live feed event
          const feedRef = doc(collection(firestoreDb, `organizations/${orgId}/projects/${projectId}/liveFeed`));
          batch.set(feedRef, {
            type: 'milestone',
            text: `⚡ Project auto-promoted to Execution stage (Stage 5) after verifying all approvals!`,
            timestamp: serverTimestamp()
          });

          await batch.commit();
        }
      } catch (err) {
        console.error("Failed to auto-promote project to execution:", err);
      } finally {
        isPromotingRef.current[projectId] = false;
      }
    };

    checkAndPromote();
  }, [activeInternalId, projectContext?.status, projectContext?.paymentMilestones, projectContext?.onboardingData, projectContext?.lifecycle?.stage, orgData?.tenantId]);

  const activeCalculatedTier = useMemo(() => {
    return tiersWithCalculatedSummaries.find((t) => t.id === activeTierId);
  }, [tiersWithCalculatedSummaries, activeTierId]);

  /*
    The scope in the form the client receives.

    Built here because this is where the tier and the item bank are both in
    scope; the projection has neither. lib/clientBoq strips the cost side —
    bankId, materials, labour, margin — and keeps only the sell rate, so what
    is stored is what a client may see rather than what the UI happens to draw.
  */
  /*
    The baseline stored with the client's own copy of the scope.

    Preferred over anything derived from the tier chain, because it is the one
    that lasts. Once written it is never replaced, so "Was ..." keeps meaning
    the figure in the BOQ the client first received rather than whatever the
    most recent annexure happened to supersede.
  */
  const [storedBoqBaseline, setStoredBoqBaseline] = useState<ClientBoqRow[] | null>(null);
  useEffect(() => {
    if (!activeInternalId) { setStoredBoqBaseline(null); return; }
    let cancelled = false;
    readPortalView(activeInternalId).then(view => {
      if (cancelled) return;
      const ctx: any = view?.context || {};
      /*
        `clientBoq` is NOT a baseline. Those rows are the current scope, changes
        already applied — using them directly made the comparison find nothing
        and every marker disappeared. Unwound through `change.from` they give
        back the original, which is what the markers were measured against.
      */
      setStoredBoqBaseline(ctx.clientBoqBaseline || baselineFromSentRows(ctx.clientBoq) || null);
    });
    return () => { cancelled = true; };
  }, [activeInternalId]);

  /** Rooms, as both the baseline and the current rows need them. */
  const clientBoqRooms = (projectContext as any)?.rooms;

  /*
    What the markers are measured against.

    Two sources, in this order:

      1. The root of the tier chain, walking `parentTierId` to its end. This is
         the authoritative original — the BOQ the client first approved — and
         every annexure since shows against it, so the markers accumulate
         rather than each approval erasing the last one's.
      2. The baseline stored with the client's copy, when the chain cannot be
         resolved. The saved project document has been observed holding a single
         tier with `parentTierId` pointing at a version that is not in it, so
         the chain is not something to rely on alone.

    The stored copy is the fallback and not the preference, deliberately. It was
    the other way round and it went wrong: a projection written while the
    markers were broken became the permanent baseline, and no later correction
    could dislodge it. A derived value should lose to a source of truth, never
    outrank it.

    Built without the revision log — those entries belong to the current
    version, and applying them to an ancestor would compare it against itself.
  */
  const clientBoqBaseline = useMemo((): ClientBoqRow[] | undefined => {
    const tier: any = activeCalculatedTier;
    if (!tier) return storedBoqBaseline || undefined;

    const rootTier = (() => {
      const seen = new Set<string>();
      let cursor: any = tier;
      while (cursor?.parentTierId && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        const next: any = tiersWithCalculatedSummaries.find((t: any) => t.id === cursor.parentTierId);
        if (!next) break;
        cursor = next;
      }
      // A tier with no ancestry is the original: nothing to compare against.
      return cursor === tier ? undefined : cursor;
    })();

    const source = rootTier?.fullBoq || rootTier?.boq || [];
    if (!source.length) return storedBoqBaseline || undefined;
    return buildClientBoqRows({ boq: source, bank, rooms: clientBoqRooms, revisions: [] });
  }, [storedBoqBaseline, activeCalculatedTier, tiersWithCalculatedSummaries, bank, clientBoqRooms]);

  const clientBoqRows = useMemo(() => {
    const tier: any = activeCalculatedTier;
    const source = tier?.fullBoq || tier?.boq || [];
    if (!source.length) return [];

    return buildClientBoqRows({
      boq: source,
      bank,
      rooms: clientBoqRooms,
      revisions: (projectContext as any)?.boqRevisions,
      previous: clientBoqBaseline,
    });
  }, [activeCalculatedTier, bank, clientBoqRooms, projectContext, clientBoqBaseline]);

  const fullBoqForActiveTier = useMemo((): FullBoqItem[] => {
    if (!activeTierId) return [];
    const activeTier = tiers.find((t) => t.id === activeTierId);
    if (!activeTier) return [];

    const bankMap = new Map<string, Item>(bank.map((i) => [i.id, i]));

    return (activeTier.boq || [])
      .map((b) => {
        const item = bankMap.get(b.bankId) || ({
          id: b.bankId,
          name: b.name || "Custom / Legacy Item",
          cat: b.cat || b.category || b.roomId || "General Scope",
          materials: b.baseRate !== undefined ? b.baseRate : 0,
          labor: 0,
          margin: b.marginOverride ?? 0,
          unit: b.unit || "lumpsum",
          specs: "Details missing from bank",
        } as Item);

        const effectiveMargin = b.marginOverride ?? item.margin;
        const effectiveMaterials = b.baseRate !== undefined ? b.baseRate : item.materials;
        return {
          ...item,
          ...b,
          id: b.id,
          materials: effectiveMaterials,
          margin: effectiveMargin,
        } as FullBoqItem;
      });
  }, [activeTierId, tiers, bank]);

  const setBoqForActiveTier: React.Dispatch<React.SetStateAction<BoqItem[]>> = (
    action,
  ) => {
    setTiers((prevTiers) =>
      prevTiers.map((tier) => {
        if (tier.id === activeTierId) {
          const newBoq =
            typeof action === "function" ? action(tier.boq) : action;
          return { ...tier, boq: newBoq };
        }
        return tier;
      }),
    );
  };

  const executionBoq = useMemo(() => {
    if (!activeProject) return [];
    
    // Find the most up-to-date approved/annexure tier by timestamp, fallback to activeProject.tierId
    let tier = tiers.find((t) => t.id === activeProject.tierId);
    if (tiers.length > 0) {
      const sortedTiers = [...tiers].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      if (sortedTiers[0]) {
        tier = sortedTiers[0];
      }
    }

    if (!tier) return [];
    const bankMap = new Map<string, Item>(bank.map((i) => [i.id, i]));
    if (projectContext?.adHocItems) {
      projectContext.adHocItems.forEach((i) => bankMap.set(i.id, i));
    }

    return (tier.boq || []).map((b) => {
      const item =
        bankMap.get(b.bankId) ||
        ({
          id: b.bankId,
          name: b.name || "Custom / Legacy Item",
          cat: b.cat || b.category || b.roomId || "General Scope",
          materials: b.baseRate !== undefined ? b.baseRate : 0,
          labor: 0,
          margin: b.marginOverride ?? 0,
          unit: b.unit || "lumpsum",
          specs: "Details missing from bank",
        } as Item);

      const effectiveMargin = b.marginOverride ?? item.margin;
      const effectiveMaterials = b.baseRate !== undefined ? b.baseRate : item.materials;
      return {
        ...item,
        ...b,
        id: b.id,
        materials: effectiveMaterials,
        margin: effectiveMargin,
      } as FullBoqItem;
    });
  }, [activeProject, tiers, bank, projectContext?.adHocItems]);

  // --- HANDLERS ---

  const handleOpenProject = (project: FullProjectData, targetTab?: string) => {
    setActiveInternalId(project.id);
    setProjectArchitecture(project.architecture || 'legacy');
    /*
      Both room invariants applied on open, so they reach projects saved before
      either existed and nobody has to run a migration:

        - Civil, Functional and Others exist, at zero area. They were stored as
          rooms carrying the whole flat, which measured the property three times.
        - Room names are unique. A plan labels three rooms "Toilet", and the name
          is the identity a BOQ line carries, so three bathrooms collapsed into
          one heading and read as triplicated items.
    */
    const opened = project.context || DEFAULT_CONTEXT;
    setProjectContext({ ...opened, rooms: ensureScopeRooms(opened.rooms) });
    setTiers(project.tiers || []);

    /*
      Restore any version whose lines were left out of the project document.

      BOQ detail lives in projects/{id}/tierBoq/{tierId} so a project cannot
      outgrow Firestore's document limit and start losing versions. Tiers that
      still carry their lines inline need nothing, so this does no work at all
      for a project that fits — and for one that does not, it is what makes the
      history whole before anything reads it.

      Deliberately after the state is set: the project opens immediately, and
      the versions fill in when they arrive rather than holding up the screen.
    */
    hydrateProjectDetail(project)
      .then((full) => {
        if (full !== project && full.tiers?.length) {
          setTiers((current) =>
            // Only if the user has not moved on to another project meanwhile.
            activeIdRef.current === project.id ? full.tiers : current,
          );
        }
      })
      .catch(() => {});

    setActiveTierId(project.activeTierId || null);
    setActiveProject(project.activeProject || null);
    setMaterialSuggestions(project.materials || []);
    setTimelinePhases(project.timeline || []);
    setLeadProfile(project.leadProfile || DEFAULT_LEAD_PROFILE);
    setDecisionBrainOutput(project.decisionBrainOutput || null);
    setActiveTab(targetTab || "dashboard");
  };

  const handleCreateNewProject = () => {
    const newId = generateId();
    setActiveInternalId(newId);
    setProjectArchitecture('canonical');
    setProjectContext(DEFAULT_CONTEXT);
    setTiers([]);
    setActiveTierId(null);
    setActiveProject(null);
    setMaterialSuggestions([]);
    setTimelinePhases([]);
    setLeadProfile(DEFAULT_LEAD_PROFILE);
    setDecisionBrainOutput(null);
    setActiveTab("dashboard");

    // Initialize communication tracker with studio defaults
    if (orgData?.tenantId) {
      initCommunicationLog(newId, orgData.tenantId).catch((err) =>
        console.error("Found error initializing comm track:", err),
      );
    }
  };

  /**
   * Issue a fresh portal link for a project and email it to the client.
   *
   * Minting a new token invalidates the previous link, which is what you want
   * if a client forwards one by mistake — reissuing is also the revoke button.
   */
  const handleRequestPortalLink = async (project: FullProjectData) => {
    const access = issuePortalAccess(project.id, project.context?.clientEmail);
    const updated: FullProjectData = {
      ...project,
      context: { ...project.context, portalAccess: access } as any,
      lastModified: Date.now(),
    };
    try {
      await db.saveProject(updated);
      setProjectLibrary((prev) => prev.map((p) => (p.id === project.id ? updated : p)));
    } catch (e) {
      console.error("Could not store portal access token", e);
      return;
    }

    const link = `${window.location.origin}/?portal=${access.token}`;
    const res = await sendPortalAccessLink(
      project.context?.clientEmail || "",
      project.context?.name || "your project",
      project.context?.clientName || "",
      link,
      access.expiresAt,
    );
    // Delivery is best-effort: the token is already live, so ops can copy the
    // link from the project if the email bounced.
    if (!res.success) {
      console.warn("Portal link generated but not emailed:", res.error, link);
    }
  };

  const handleDeleteProject = async (id: string) => {
    // 1. Optimistic UI Update: Remove immediately from list
    setProjectLibrary((prev) => prev.filter((p) => p.id !== id));

    // 2. If deleting the currently active project, reset the workspace
    if (activeInternalId === id) {
      setActiveInternalId(null);
      setProjectArchitecture('canonical');
      setProjectContext(DEFAULT_CONTEXT);
      setTiers([]);
      setActiveTierId(null);
      setActiveProject(null);
      setActiveTab("projects");
    }

    // 3. Perform actual deletion in background
    await db.deleteProject(id);
    // No need to fetch freshProjects immediately as we've already updated the UI.
    // Consistency will be restored on next reload or sync.
  };

  /**
   * CLONE AS TEMPLATE.
   *
   * This used to be `JSON.parse(JSON.stringify(project))` with a new id, which
   * carried the source client's name, phone, signed agreements, payment
   * milestones with money received against them, and their portal access token
   * into the new project. `buildProjectTemplate` copies the SHAPE of the job
   * from an allowlist instead, so nothing about the old client can ride along.
   */
  const handleDuplicateProject = async (project: FullProjectData) => {
    const { project: template, summary } = buildProjectTemplate(project, {
      newId: generateId(),
      newTierId: () => generateId(),
    });

    setProjectLibrary((prev) => [template, ...prev]);
    await db.saveProject(template);

    // Open it straight away: the point is to start work, not to admire a copy.
    handleOpenProject(template);

    const carried = [
      summary.rooms ? `${summary.rooms} room${summary.rooms === 1 ? '' : 's'}` : null,
      summary.boqItems ? `${summary.boqItems} priced item${summary.boqItems === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' and ');

    showSuccessWithNext(
      carried
        ? `Template created with ${carried}. Client details, payments and sign-offs were not copied.`
        : 'Template created. Client details, payments and sign-offs were not copied.',
    );
  };

  const handleProjectStatusChange = async (
    projectId: string,
    newStatus: ProjectStatus,
    note?: string,
  ) => {
    const validStatuses: ProjectStatus[] = [
      'lead',
      'draft',
      'proposal_sent',
      'negotiation',
      'won',
      'execution',
      'work_paused',
      'completed',
      'lost',
    ];
    const sanitizedStatus: ProjectStatus = validStatuses.includes(newStatus)
      ? newStatus
      : 'draft';

    let targetStage = 1;
    if (sanitizedStatus === 'lead') targetStage = 1;
    else if (sanitizedStatus === 'draft') targetStage = 2;
    else if (sanitizedStatus === 'proposal_sent' || sanitizedStatus === 'negotiation') targetStage = 3;
    else if (sanitizedStatus === 'won') targetStage = 4;
    else if (sanitizedStatus === 'execution' || sanitizedStatus === 'work_paused') targetStage = 5;
    else if (sanitizedStatus === 'completed') targetStage = 6;
    else if (sanitizedStatus === 'lost') targetStage = 0;

    const existingProject = projectLibrary.find((p) => p.id === projectId);
    const prevContext = existingProject?.context || (activeInternalId === projectId ? projectContext : undefined);
    const prevStatus = prevContext?.status && validStatuses.includes(prevContext.status)
      ? prevContext.status
      : 'draft';

    const historyEntry: HistoryEvent = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      at: Date.now(),
      actor: orgData?.role || 'Ops Director',
      category: 'stage',
      summary: `Status updated from "${prevStatus}" to "${sanitizedStatus}"`,
      detail: note || null,
    };

    const newHistory = [historyEntry, ...(prevContext?.history || [])].slice(0, 50);

    const updatedContext: ProjectContext = {
      ...(prevContext || projectContext),
      status: sanitizedStatus,
      currentStage: targetStage > 0 ? targetStage : prevContext?.currentStage,
      lifecycle: {
        ...(prevContext?.lifecycle || { stage: 1, subState: 'active', gates: {} as any, enteredStageAt: Date.now(), updatedAt: Date.now() }),
        stage: (targetStage > 0 ? targetStage : (prevContext?.lifecycle?.stage || 1)) as any,
        updatedAt: Date.now(),
      },
      history: newHistory,
      ...(sanitizedStatus === 'proposal_sent' && !prevContext?.proposalSentAt ? { proposalSentAt: new Date().toISOString() } : {}),
      ...(sanitizedStatus === 'completed' ? { handoverDate: Date.now(), journeySummary: { ...(prevContext?.journeySummary || { done: 10, total: 10, pct: 100, active: 0, phaseProgress: [] }), pct: 100 } } : {}),
      ...(sanitizedStatus === 'execution' ? { executionApprovedByFFDS: true } : {}),
    };

    let updatedActiveProject = existingProject?.activeProject || (activeInternalId === projectId ? activeProject : null);
    if ((sanitizedStatus === 'execution' || sanitizedStatus === 'won' || sanitizedStatus === 'work_paused') && !updatedActiveProject) {
      const projectTiers = existingProject?.tiers || (activeInternalId === projectId ? tiers : []);
      const approvedTier = projectTiers.find((t) => t.id === updatedContext.approvedTierId) || projectTiers[0];
      updatedActiveProject = {
        tierId: approvedTier?.id || 'tier_1',
        budget: 0,
        startDate: new Date().toISOString().split('T')[0],
        expenses: [],
        status: sanitizedStatus === 'work_paused' ? 'work_paused' : 'active',
        executionData: {
          bundles: [],
          actions: [],
          procurement: [],
          lastUpdated: Date.now(),
          updates: [
            {
              id: `upd_${Date.now()}`,
              timestamp: Date.now(),
              text: `Project transitioned to ${sanitizedStatus === 'won' ? 'Won' : sanitizedStatus === 'work_paused' ? 'Work Paused' : 'Execution'}. Site mobilization and procurement tracking active.`,
              author: orgData?.role || 'Ops Director',
              type: 'progress',
            },
          ],
          blockers: sanitizedStatus === 'work_paused' ? [
            {
              id: `blk_${Date.now()}`,
              type: 'decision',
              description: note || 'Site work paused pending client/site resolution.',
              impactLevel: 'critical',
              blockedBundleIds: [],
              owner: 'ops',
              financialImpact: 0,
              daysDelayed: 0,
              resolved: false,
            },
          ] : [],
          decisions: [],
          sofItems: [],
        },
      };
    }

    // 1. Update active view state if currently inside this project's workspace
    if (activeInternalId === projectId) {
      setProjectContext(updatedContext);
      if (updatedActiveProject) {
        setActiveProject(updatedActiveProject);
      }
    }

    // 2. Build complete project structure to persist
    const baseProject: FullProjectData = existingProject || ({
      id: projectId,
      architecture: projectArchitecture,
      lastModified: Date.now(),
      context: updatedContext,
      tiers: (activeInternalId === projectId ? tiersWithCalculatedSummaries : []) || [],
      activeTierId: activeInternalId === projectId ? activeTierId : null,
      activeProject: updatedActiveProject,
      materials: (activeInternalId === projectId ? materialSuggestions : []) || [],
      timeline: (activeInternalId === projectId ? timelinePhases : []) || [],
      leadProfile: (activeInternalId === projectId ? leadProfile : DEFAULT_LEAD_PROFILE),
      decisionBrainOutput: (activeInternalId === projectId ? decisionBrainOutput : null),
    } as FullProjectData);

    const projectToPersist: FullProjectData = {
      ...baseProject,
      context: updatedContext,
      activeProject: updatedActiveProject || baseProject.activeProject,
      lastModified: Date.now(),
    };

    // 3. Update projectLibrary synchronously so boards, filters, and cards reflect instantly
    setProjectLibrary((prev) => {
      const idx = prev.findIndex((p) => p.id === projectId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = projectToPersist;
        return next;
      }
      return [projectToPersist, ...prev];
    });

    // 4. Persist project changes to database
    await db.saveProject(projectToPersist);
  };

  const handleQuickProjectUpdate = async (
    projectId: string,
    field: string,
    value: any,
  ) => {
    if (field === 'status') {
      return handleProjectStatusChange(projectId, value as ProjectStatus);
    }

    setProjectLibrary((prev) =>
      prev.map((p) => {
        if (p.id === projectId) {
          const updated = {
            ...p,
            context: { ...p.context, [field]: value },
            lastModified: Date.now(),
          };
          db.saveProject(updated).catch(console.error); // Background save
          return updated;
        }
        return p;
      }),
    );

    // Also update projectContext if we are currently viewing this project
    if (activeInternalId === projectId) {
      setProjectContext((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleClearProject = () => {
    if (confirmReset) {
      handleCreateNewProject();
      setConfirmReset(false);
    } else {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
    }
  };

  const handleDownloadBackup = () => {
    if (!activeInternalId) return;
    const projectData: FullProjectData = {
      id: activeInternalId,
      architecture: projectArchitecture,
      lastModified: Date.now(),
      context: projectContext,
      tiers,
      activeTierId,
      activeProject,
      materials: materialSuggestions,
      timeline: timelinePhases,
      leadProfile,
      decisionBrainOutput,
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(projectContext.name || "Unnamed_Project").replace(/\s+/g, "_")}_Backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.context && data.tiers) {
          // It's a valid project file
          handleOpenProject(data as FullProjectData);
        } else {
          alert("Invalid project file format.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to parse project file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset
  };

  const handleViewInBank = (bankId: string) => {
    setHighlightedBankItemId(bankId);
    setActiveTab("bank");
  };

  const handleAddItemsFromPrompt = (
    itemsToAdd: { item: Item; qty: number }[],
  ) => {
    if (!activeTierId) return;

    // Sync entirely new items to bank so they aren't lost to "Custom / Legacy Item"
    const newBankItems: Item[] = [];
    itemsToAdd.forEach((toAdd) => {
      if (!bank.find((b) => b.id === toAdd.item.id)) {
        newBankItems.push(toAdd.item);
      }
    });

    if (newBankItems.length > 0) {
      setBank((prev) => [...prev, ...newBankItems]);
    }

    const newBoqItems: BoqItem[] = itemsToAdd.map(({ item, qty }) => ({
      id: generateId(),
      bankId: item.id,
      qty,
      roomId: "General", // Default room for prompt adds
      rationale: item.name || "Added via Prompt",
    }));

    setTiers((prev) =>
      prev.map((tier) => {
        if (tier.id !== activeTierId) return tier;
        return { ...tier, boq: [...tier.boq, ...newBoqItems] };
      }),
    );
  };

  const handleExportHtml = (fileName?: string, orientation: 'portrait' | 'landscape' = 'portrait') => {
    const originalTab = activeTab;
    setActiveTab("client");
    setTimeout(() => {
      const clientViewNode = document.querySelector(".vnext-proposal-wrapper");
      if (!clientViewNode) {
        alert(
          "Could not find proposal content. Ensure you are on the Client Proposal tab.",
        );
        return;
      }
      const doc = document.cloneNode(true) as Document;
      const proposalWrapper = doc.querySelector(".vnext-proposal-wrapper");
      if (proposalWrapper) {
        doc.body.innerHTML = "";
        doc.body.appendChild(proposalWrapper);
        doc.body.className = "luxe-proposal-active";
        doc.title = `${projectContext.name || "Unnamed Project"} - Proposal`;
      }
      doc
        .querySelectorAll(
          '.no-print, script[type="module"], script[type="importmap"]',
        )
        .forEach((el) => el.remove());

      // The exported file had no @page size, so opening it and hitting print
      // produced whatever sheet the browser last used. Pin it here too.
      const pageStyle = doc.createElement('style');
      pageStyle.textContent = `@page { size: A4 ${orientation}; margin: 12mm; }`;
      doc.head.appendChild(pageStyle);

      // Interactive Script for Static HTML
      const script = document.createElement("script");
      script.textContent = `
              document.addEventListener('DOMContentLoaded', () => {
                // 1. Auto-expand details for print/desktop
                if (window.innerWidth >= 768) {
                    document.querySelectorAll('details.scan-first').forEach(d => {
                        d.setAttribute('open', 'true');
                    });
                }

                // 2. Interactive Tier Switching Logic
                const cards = document.querySelectorAll('.tier-option-card');
                const contents = document.querySelectorAll('.roomwise-content');

                if(cards.length > 0) {
                    cards.forEach(card => {
                        card.addEventListener('click', () => {
                            const selectedId = card.getAttribute('data-tier-id');
                            
                            // A. Update Card Styles
                            cards.forEach(c => {
                                const cId = c.getAttribute('data-tier-id');
                                const isRec = c.getAttribute('data-recommended') === 'true';
                                const badge = c.querySelector('.viewing-badge');
                                const recBadge = c.querySelector('.rec-badge');
                                const priceContainer = c.querySelector('.price-container');
                                const cta = c.querySelector('.cta-text');

                                // Reset to base state (remove all possible active/specific classes)
                                c.classList.remove(
                                    'border-2', 'border-sky-900', 'bg-white', 'shadow-lg', 'scale-[1.02]', 'z-10', 'ring-2', 'ring-slate-100', // Active
                                    'border-slate-200', 'shadow-sm', 'hover:border-slate-400', // Rec Inactive
                                    'border', 'border-slate-200', 'bg-[#F7F7F6]', 'hover:bg-white', 'hover:shadow-sm' // Def Inactive
                                );
                                
                                if(priceContainer) priceContainer.classList.remove('bg-slate-50');

                                if (cId === selectedId) {
                                    // Set Active Styling
                                    c.classList.add('border-2', 'border-sky-900', 'bg-white', 'shadow-lg', 'scale-[1.02]', 'z-10', 'ring-2', 'ring-slate-100');
                                    if(badge) badge.classList.remove('hidden');
                                    if(recBadge) recBadge.classList.add('hidden'); // Hide Rec badge if active
                                    if(priceContainer) priceContainer.classList.add('bg-slate-50', 'border', 'border-slate-200');
                                    
                                    if(cta) {
                                        cta.textContent = 'Showing Room-wise Scope Below ↓';
                                        cta.classList.remove('text-slate-400', 'group-hover:text-slate-600');
                                        cta.classList.add('text-[#3D52A0]');
                                    }
                                } else {
                                    // Set Inactive Styling
                                    if (isRec) {
                                        c.classList.add('border-2', 'border-slate-200', 'bg-white', 'shadow-sm', 'hover:border-slate-400');
                                        if(recBadge) recBadge.classList.remove('hidden');
                                    } else {
                                        c.classList.add('border', 'border-slate-200', 'bg-[#F7F7F6]', 'hover:bg-white', 'hover:shadow-sm');
                                    }
                                    
                                    if(priceContainer) priceContainer.classList.add('bg-white', 'border', 'border-slate-200');
                                    if(badge) badge.classList.add('hidden');
                                    
                                    if(cta) {
                                        cta.textContent = 'Click to View Detailed Scope';
                                        cta.classList.add('text-slate-400', 'group-hover:text-slate-600');
                                        cta.classList.remove('text-[#3D52A0]');
                                    }
                                }
                            });

                            // B. Show/Hide Room-wise Content
                            contents.forEach(content => {
                                if (content.id === 'roomwise-content-' + selectedId) {
                                    content.style.display = 'block';
                                } else {
                                    content.style.display = 'none';
                                }
                            });
                        });
                    });
                }
              });
            `;
      doc.body.appendChild(script);

      const htmlContent = doc.documentElement.outerHTML;
      const blob = new Blob([`<!DOCTYPE html>${htmlContent}`], {
        type: "text/html",
      });
      const url = URL.createObjectURL(blob);
      const finalName = fileName
        ? fileName
        : `${(projectContext.name || "Unnamed_Project").replace(/\s+/g, "_")}_Proposal`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `${finalName}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActiveTab(originalTab);
    }, 100);
  };

  const handleApproveTier = (tierId: string) => {
    setProjectContext((prev) => ({ ...prev, approvedTierId: tierId }));
    setActiveTierId(tierId);
  };

  const handleStartExecution = () => {
    const tier = tiersWithCalculatedSummaries.find(
      (t) => t.id === projectContext.approvedTierId,
    );
    if (!tier) {
      alert("No approved tier found. Please approve an option first.");
      return;
    }

    // Initialize Execution Data
    const bundles: ExecutionBundle[] = [];
    const createBundle = (
      id: string,
      name: string,
      trade: string,
      cats: string[],
    ): ExecutionBundle | null => {
      const items = executionBoq.filter((i) => cats.includes(i.cat));
      if (items.length === 0) return null;
      return {
        id,
        code: id.toUpperCase(),
        name,
        trade,
        itemIds: items.map((i) => i.id),
        totalValue: items.reduce((sum, i) => sum + i.rate * i.qty, 0),
        status: "locked" as ExecutionBundleStatus,
        gate: "standard",
        completionPercentage: 0,
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      };
    };

    const b1 = createBundle("b_civil", "Civil Prep & Execution", "Civil", [
      "Civil",
      "Demolition",
    ]);
    const b2 = createBundle("b_mep", "MEP Rough-in & Final", "MEP", [
      "Electrical",
      "Plumbing",
      "MEP",
    ]);
    const b3 = createBundle("b_ceiling", "False Ceiling & Framing", "Gypsum", [
      "False Ceiling",
      "Gypsum",
    ]);
    const b4 = createBundle("b_flooring", "Flooring & Tiling", "Civil", [
      "Flooring",
      "Tiling",
    ]);
    const b5 = createBundle(
      "b_carpentry",
      "Custom Carpentry & Millwork",
      "Carpentry",
      ["Carpentry", "Modular", "Kitchen", "Wardrobe"],
    );
    const b6 = createBundle("b_painting", "Painting & Finishing", "Painting", [
      "Painting",
      "Finishing",
    ]);

    [b1, b2, b3, b4, b5, b6].forEach((b) => {
      if (b) bundles.push(b);
    });

    if (bundles.length === 0) {
      bundles.push({
        id: "b_general",
        code: "GEN",
        name: "General Execution",
        trade: "General",
        itemIds: executionBoq.map((i) => i.id),
        totalValue: executionBoq.reduce((sum, i) => sum + i.rate * i.qty, 0),
        status: "locked" as ExecutionBundleStatus,
        gate: "standard",
        completionPercentage: 0,
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      });
    }

    const sofItems: SOFItem[] = [];
    executionBoq
      .filter((i) =>
        [
          "Flooring",
          "Tiling",
          "Carpentry",
          "Modular",
          "Kitchen",
          "Wardrobe",
          "Painting",
          "Finishing",
          "Electrical",
          "Plumbing",
        ].includes(i.cat),
      )
      .forEach((item, index) => {
        if (!item) return;
        const itemName = (item.name || "").toLowerCase();
        if (
          itemName.includes("provide") ||
          itemName.includes("finish") ||
          itemName.includes("fixture")
        ) {
          const bundle = bundles.find((b) => b.itemIds.includes(item.id));
          sofItems.push({
            id: `sof_${index}`,
            name: item.name,
            category: item.cat,
            location: item.roomId || "General",
            linkedBundleId: bundle?.id || bundles[0].id,
            specifications: { brand: "TBD", code: "TBD", finish: "TBD" },
            status: "pending",
            leadTimeDays: 14,
          });
        }
      });

    const newProject: ActiveProject = {
      tierId: tier.id,
      budget: tier.summary.totalRevenue,
      startDate: new Date().toISOString(),
      expenses: [],
      status: "active",
      executionData: {
        bundles,
        sofItems,
        blockers: [],
        actions: [],
        decisions: [],
        procurement: [],
        lastUpdated: Date.now(),
      },
    };
    setActiveProject(newProject);
    setActiveTab("dashboard");
  };

  const MotionDiv = motion.div as any;

  // Render Logic
    /* Where this person last was, per project. Loaded once on sign-in and
       kept current by the effect below; "Continue where you left off" reads it
       to reopen the tab you actually stopped on. */
    const [lastTabs, setLastTabs] = useState<LastTabs>({});
    /* Snoozed and dismissed items on the home worklist. Optimistic locally so
       a tile disappears on click, then persisted. */
    const [attention, setAttention] = useState<AttentionState>({});

    useEffect(() => {
      let alive = true;
      readLastTabs(currentUserAuth?.uid).then((m) => alive && setLastTabs(m));
      readAttentionState(currentUserAuth?.uid).then((m) => alive && setAttention(m));
      return () => { alive = false; };
    }, [currentUserAuth?.uid]);

    const handleAttentionChange = useCallback((projectId: string, entry: AttentionEntry) => {
      setAttention((prev) => ({ ...prev, [projectId]: entry }));
      writeAttentionEntry(currentUserAuth?.uid, projectId, entry);
    }, [currentUserAuth?.uid]);

    const isProjectTab = ![
    "home",
    "reports",
    "projects",
    "clients",
    "bank",
    "templates",
    "ai-settings",
    "setup-wizard",
    "studio-settings",
    "terms-and-payment",
    "communication-templates",
    "saas-dashboard",
    "admin-templates-bank",
    "data-privacy",
    "support",
    "terms-of-use",
  ].includes(activeTab);

  /* One effect rather than touching forty-six setActiveTab calls. Only fires
     inside an open project, and only for project-scoped tabs -- landing on
     Reports should not become "where you left off" in a site. */
  useEffect(() => {
    if (!isProjectTab || !activeInternalId || !currentUserAuth?.uid) return;
    setLastTabs((prev) =>
      prev[activeInternalId] === activeTab ? prev : { ...prev, [activeInternalId]: activeTab }
    );
    recordLastTab(currentUserAuth.uid, activeInternalId, activeTab);
  }, [isProjectTab, activeInternalId, activeTab, currentUserAuth?.uid]);

  const hasProjectData = !!activeInternalId;

  // Top Header layout (sidebar width is 0px)
  const sidebarWidth = '0px';
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const PROJECT_WORKFLOW_ROUTES = [
    "dashboard",
    "boq-editor",
    "leadiq",
    "timeline",
    "payment-calc",
    "materials",
    "execution-agreement",
    "terms-docket",
    "handover-docket",
    "payment-schedule",
    "client-portal",
    "onboarding",
    "emails",
    "client",
    "analytics",
    "site-ops",
    "ops",
    "snaglist",
  ];

  const showFloatingBar =
    hasProjectData && PROJECT_WORKFLOW_ROUTES.includes(activeTab);

  if (appMode === "loading" || !isDataLoaded) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f8fafc] select-none overflow-hidden relative">
        {/* Soft high-tech background grids & glowing spots */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_65%)]" />

        <div className="relative flex flex-col items-center justify-center z-10">
          {/* GLASS ARC REACTOR HOUSING */}
          <div className="relative w-36 h-36 flex items-center justify-center bg-white/70 backdrop-blur-xl rounded-full border border-slate-200/80 shadow-[0_12px_40px_rgba(31,38,135,0.06),inset_0_0_20px_rgba(255,255,255,0.6)]">
            
            {/* Outer HUD Ring (Slow Counter-Clockwise Rotation) */}
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 25, ease: "linear", repeat: Infinity }}
              className="absolute w-32 h-32 rounded-full border border-dashed border-[#3D52A0]/15" 
            />
            
            {/* Outer Segmented Ring with Gaps */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 10, ease: "linear", repeat: Infinity }}
              className="absolute w-28 h-28 rounded-full border-2 border-[#3D52A0]/20 border-t-transparent border-b-transparent" 
            />
            
            {/* Golden/Brass Outer Containment Ring - matching the gold theme palette */}
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 15, ease: "linear", repeat: Infinity }}
              className="absolute w-24 h-24 rounded-full border-4 border-double border-amber-500/25 opacity-80" 
            />

            {/* 8 Radial Magnetic Coils (Glow Core Panels in Gold/Indigo) */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 18, ease: "linear", repeat: Infinity }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2.5 h-5 bg-[#3D52A0]/15 rounded-[1px] border border-sky-400/20"
                  style={{
                    transform: `rotate(${i * 45}deg) translateY(-26px)`,
                    boxShadow: '0 0 6px rgba(99,102,241,0.1)'
                  }}
                />
              ))}
            </motion.div>

            {/* Inner High-Frequency Plasma Flux (Very Fast Spin) */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, ease: "linear", repeat: Infinity }}
              className="absolute w-14 h-14 rounded-full border border-[#3D52A0] border-l-transparent border-r-transparent shadow-[0_0_12px_rgba(99,102,241,0.2)]" 
            />

            {/* Main Core: Highly Concentrated Glow Core */}
            <div className="relative w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.35),0_0_40px_rgba(99,102,241,0.15),inset_0_0_2px_rgba(99,102,241,0.5)] border border-sky-100">
              <motion.div 
                animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
                className="w-6 h-6 rounded-full bg-sky-50 border border-sky-200 absolute" 
              />
              <motion.div 
                animate={{ scale: [0.9, 1.1, 0.9] }}
                transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}
                className="w-4 h-4 rounded-full bg-[#3D52A0]/20 border border-sky-400" 
              />
            </div>

            {/* Fine HUD Crosshair lines */}
            <div className="absolute w-36 h-[1px] bg-slate-400/5" />
            <div className="absolute h-36 w-[1px] bg-slate-400/5" />
          </div>
        </div>
      </div>
    );
  }

  if (appMode === "agreement_signoff" && agreementSignoffToken) {
    return <AgreementSignoffPage token={agreementSignoffToken} />;
  }

  if (appMode === "selection_confirm" && selectionConfirmToken) {
    return <SelectionConfirmPage token={selectionConfirmToken} />;
  }

  if (appMode === "mom_acknowledge" && momToken) {
    return <MomAcknowledgePage token={momToken} />;
  }

  /* The public page is what a visitor lands on. Signing in is one click past
     it, and anyone returning is taken straight to the sign-in screen. */
  if (appMode === "login" && showLanding && !portalProjectId && !authProfile) {
    /* Two public pages exist side by side. `?landing=orbit` shows the orbit
       variant; anything else keeps the original, so the default path is
       unchanged for every visitor who does not ask for it. */
    const wantsOrbit =
      new URLSearchParams(window.location.search).get("landing") === "orbit";
    return wantsOrbit
      ? <LandingPageOrbit onEnter={() => setShowLanding(false)} />
      : <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  /*
    The client door.

    It has to answer for a signed-in client as well as a signed-out one. The
    condition used to be `portalProjectId && !authProfile`, so a client who
    signed in successfully and was then refused a project — unpublished
    projection, or a link for a project not on their account — failed both
    halves and fell through to the *studio* sign-in screen below. From where
    they stood, correct credentials had bounced them to a page for staff, with
    nothing said. `portalDenied` was being set for exactly this and had nowhere
    to appear.
  */
  const clientSession = authProfile?.role === "Client";
  if (appMode === "login" && (portalProjectId || clientSession)) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
        <ClientLoginScreen
          studio={portalStudioBrand}
          notice={portalDenied}
          signedInAs={clientSession ? authProfile?.email : undefined}
          onSignOut={() => {
            firebaseAuth?.signOut().catch(() => {});
            localStorage.removeItem("ffds_app_mode");
            localStorage.removeItem("ffds_client_project_id");
            setPortalDenied(null);
          }}
        />
      </Suspense>
    );
  }

  if (appMode === "login") {
    return (
      <LoginScreen
        onLoginOps={() => {
          localStorage.setItem("ffds_app_mode", "ops");
          setAppMode("ops");
        }}
      />
    );
  }

  if (appMode === "client" && clientPortalProject) {
    return (
      <ClientPortal
        projectData={clientPortalProject}
        bank={bank}
        source="client"
        onLogout={() => {
          // A real session now, so signing out has to end it.
          firebaseAuth?.signOut().catch(() => {});
          localStorage.removeItem("ffds_app_mode");
          localStorage.removeItem("ffds_client_project_id");
          setAppMode("login");
        }}
        /*
          Local only. A client session no longer saves the project document —
          its changes travel as actions through the submitClientAction callable,
          which is the only write path the rules leave open to them. This keeps
          the view they are looking at in step with what they just did.
        */
        onProjectUpdate={(updatedProject) => {
          setClientPortalProject(updatedProject);
        }}
      />
    );
  }

  if (appMode === "ops" && currentRole === "Site Supervisor") {
    const myTeamMember = teamMembers?.find(
      (m) => m.email.toLowerCase() === currentUserAuth?.email?.toLowerCase(),
    );

    return (
      <SupervisorMobileApp
        projects={projectLibrary.filter((p) => {
          if (
            !p.context ||
            !["won", "execution", "work_paused", "completed"].includes(
              p.context.status || "",
            )
          )
            return false;

          // If no one is assigned, they shouldn't see it (or maybe they should? The user specifically requested assignment functionality because "active sites are not assigned", which implies they expect that they need to assign them).
          // We will restrict it strictly to assigned sites to match the requested mental model.
          if (myTeamMember) {
            return p.context.assignedSupervisors?.includes(myTeamMember.id);
          }

          // Fallback if team member sync failed
          return false;
        })}
        onLogout={() => {
          localStorage.removeItem("ffds_app_mode");
          setAppMode("login");
        }}
        onProjectUpdate={async (updatedProject) => {
          await db.saveProject(updatedProject);
          setProjectLibrary((prev) =>
            prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
          );
        }}
      />
    );
  }

  if (isClientView && clientViewData) {
    return (
      <div className="pt-3 pb-8 px-4 lg:px-6">
        <ClientTab
          tiers={clientViewData.tiers.map((t) => ({
            ...t,
            projectContext: clientViewData.context as ProjectContext,
          }))}
          bank={[]}
          materialSuggestions={clientViewData.materials}
          timelinePhases={clientViewData.timeline}
          setTimelinePhases={() => {}}
          isClientViewOnly={true}
          projectContext={clientViewData.context as ProjectContext}
        />
      </div>
    );
  }

  console.log("App render returned JSX!");
  return (
    <PageHeaderProvider route={activeTab}>
      <div className={`min-h-screen overflow-x-hidden relative ${isProjectTab && hasProjectData ? "md:h-screen md:overflow-hidden" : ""}`}>
        {/* Global Background Beams with Collision Animation */}
        <div className="fixed inset-0 pointer-events-none z-[50] overflow-hidden">
          <BackgroundBeamsWithCollision className="w-full h-full min-h-screen bg-transparent pointer-events-none" />
        </div>
        <div className="relative z-10 w-full min-h-screen">
      {orgData.isSetupComplete === false ? (
        <div className="w-full bg-slate-50 min-h-screen flex items-center justify-center">
          <StudioSetupWizard onComplete={() => setActiveTab("projects")} />
        </div>
      ) : (
        <>
          <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-[60]">
            <div className="font-bold text-lg text-slate-800">FORM FACTORS</div>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 -mr-2 text-slate-600"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>

          <div
            className={`fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/50 z-[70] md:hidden transition-opacity ${isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <Sidebar
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              setIsMobileMenuOpen(false);
            }}
            aiStatus={aiStatus}
            logo={projectContext.logoImage}
            onLogout={() => {
              localStorage.removeItem("ffds_app_mode");
              localStorage.removeItem("ffds_client_project_id");
              setAppMode("login");
            }}
            pendingCommsCount={projectContext.commsSummary?.pendingCount || 0}
            commsHealthScore={projectContext.commsSummary?.healthScore || 0}
            autoCollapse={false}
            isHidden={isProjectTab && hasProjectData}
            className={`transition-transform duration-300 z-[80] ${isMobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"}`}
          />
          
          <main
            className={`w-full relative flex flex-col bg-[#F4F7FB] ${isProjectTab && hasProjectData ? "ws-fill" : "app-fill"}`}
            style={{
              /* The studio nav is a bar now, so it costs height rather than
                 width. `--sidebar-w` is pinned at 0 and kept only because
                 other layout still reads it; the top offset comes from the
                 fill classes, NOT from an inline var under a transition —
                 Chrome will not recompute a transitioned margin when the
                 custom property behind it changes, which left a 54px gap at
                 the top of every project. */
              marginLeft: 'var(--sidebar-w, 0px)',
              width: 'calc(100% - var(--sidebar-w, 0px))',
            }}
          >
            {/* MOBILE ONLY TOP NAVBAR */}
            <div className="md:hidden h-14 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-[60]">
               <button
                  className="p-2 -ml-2 text-slate-500 hover:text-slate-900"
                  onClick={() => setIsMobileMenuOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                </button>
                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-widest">
                  FORM FACTORS DESIGN STUDIO
                </span>
            </div>

            {/* PROJECT WORKSPACE WRAPPER */}
            {/* ACTIVE_WORKSPACE_BLOCK */}
            {isProjectTab && hasProjectData ? (
              <JourneyProvider
                projectId={activeInternalId!}
                projectContext={projectContext}
                setProjectContext={setProjectContext}
              >
                <ProjectWorkspace
                  projectId={activeInternalId!}
                  projectContext={projectContext}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  currentRole={orgData?.role || "Admin"}
                  setProjectContext={setProjectContext}
                  // Must match the condition that actually renders the wizard
                  // below, or the workspace titles the page wrong and shows the
                  // process widget over a wizard that is standing open.
                  isWizard={activeTab === "dashboard" && (tiers.length === 0 || showWizardOverride)}
                  onStatusChange={(status, note) => handleProjectStatusChange(activeInternalId!, status, note)}
                  onLeaveProject={(targetTab?: string) => {
                    setActiveProject(null);
                    localStorage.removeItem("ffds_client_project_id");
                    if (targetTab) {
                      setActiveTab(targetTab);
                    } else {
                      setActiveTab('projects');
                    }
                  }}
                >
                <div className={`flex-grow h-full overflow-y-auto ${activeTab === "client" || activeTab === "client-boq-pack" ? "" : "pt-3 pb-8 px-4 lg:px-6"}`}>
                  <AnimatePresence mode="wait">
                <MotionDiv
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <Suspense fallback={
                    <div className="p-12 flex flex-col items-center justify-center text-slate-400 space-y-3">
                      <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Loading View...</span>
                    </div>
                  }>
                  {/*
                    The "Required Action" banner that sat here is gone.

                    It pushed itself above whatever tab you had open whenever the
                    journey held a manual step whose linkedTab matched — so
                    opening the Project Dashboard on a new lead was met with a
                    green "Discovery Scheduled / Complete Step" prompt that had
                    nothing to do with the screen you asked for, and offered to
                    advance the journey from a page that only reports on it.

                    The same steps are marked done on the Ops Matrix, which is
                    where the journey lives, so nothing was lost with it.
                  */}

                  {/* GLOBAL TABS - SECTION 1 */}
                  {activeTab === "home" && (
                    <StudioHomeOrbit
                      projects={projectLibrary}
                      onOpenProject={handleOpenProject}
                      onCreateNew={handleCreateNewProject}
                      onNavigate={setActiveTab}
                      role={orgData?.role || "Admin"}
                      userName={currentUserAuth?.displayName || currentUserAuth?.email || "there"}
                      lastTabs={lastTabs}
                      attention={attention}
                      onAttentionChange={handleAttentionChange}
                      // ACTIVE_STUDIO_HOME
                    />
                  )}
                  {activeTab === "reports" && (
                    <StudioReports
                      projects={projectLibrary}
                      onNavigate={setActiveTab}
                      onOpenProject={(id) => {
                        const p = projectLibrary.find(x => x.id === id);
                        if (p) handleOpenProject(p, "project-reports");
                      }}
                      // ACTIVE_STUDIO_REPORTS
                    />
                  )}
                  {activeTab === "projects" && (
                    <ProjectListTab
                      projects={projectLibrary}
                      activeProjectId={activeInternalId}
                      onOpenProject={handleOpenProject}
                      onCreateNew={handleCreateNewProject}
                      onDeleteProject={handleDeleteProject}
                      onDuplicateProject={handleDuplicateProject}
                      onQuickUpdate={handleQuickProjectUpdate}
                      onStatusChange={handleProjectStatusChange}
                      // ACTIVE_PROJECTS
                    />
                  )}
                  {activeTab === "clients" && (
                    <ClientsDirectory
                      projects={projectLibrary}
                      onOpenProject={handleOpenProject}
                      onCreateNew={handleCreateNewProject}
                      // ACTIVE_CLIENTS
                    />
                  )}
                  {activeTab === "admin-templates-bank" && (
                    <TemplatesAndBankTab
                      bank={bank}
                      setBank={setBank}
                      templates={templates}
                      setTemplates={setTemplates}
                      isDraftBankMode={isDraftBankMode}
                      setIsDraftBankMode={setIsDraftBankMode}
                      draftBank={draftBank}
                      setDraftBank={setDraftBank}
                      aiStrategy={aiStrategy}
                      highlightedBankItemId={highlightedBankItemId}
                      setHighlightedBankItemId={setHighlightedBankItemId}
                      projects={projectLibrary}
                      // ACTIVE_ADMIN_TEMPLATES_BANK
                    />
                  )}

                  {/* The slim footer, on the working screens only.

                      Home renders the full one. Here it is the plate alone --
                      studio, place, year, classification -- because the
                      capability columns would link to the page you are already
                      on and the statement would repeat itself five times. */}
                  {activeTab === "data-privacy" && <DataPrivacyPage />}
                  {activeTab === "support" && <SupportDeskPage />}
                  {activeTab === "terms-of-use" && <TermsOfUsePage />}

{activeTab === "bank" && (
                    <div className="space-y-4">
                      {/* ACTIVE_BANK */}
                      <div className="flex justify-end gap-3 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm w-full">
                        <div className="text-sm font-medium text-slate-700">
                          Currently Editing:{" "}
                          <span
                            className={
                              isDraftBankMode
                                ? "text-amber-600 font-bold"
                                : "text-emerald-600 font-bold"
                            }
                          >
                            {isDraftBankMode
                              ? "Draft Sandbox"
                              : "Live Item Bank"}
                          </span>
                        </div>
                        <button
                          onClick={() => setIsDraftBankMode(!isDraftBankMode)}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border ${isDraftBankMode ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"}`}
                        >
                          Switch to{" "}
                          {isDraftBankMode ? "Live Bank" : "Draft Sandbox"}
                        </button>
                        {isDraftBankMode && (
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  "Are you sure you want to completely overwrite the LIVE item bank with your Draft sandbox? This will affect new projects and prices.",
                                )
                              ) {
                                setBank(draftBank);
                                setIsDraftBankMode(false);
                                alert(
                                  "Draft successfully published to Live Bank!",
                                );
                              }
                            }}
                            className="px-4 py-2 bg-[#3D52A0] text-white rounded-lg text-sm font-bold hover:bg-[#334486] shadow-sm transition-colors"
                          >
                            Publish Draft to Live
                          </button>
                        )}
                        {!isDraftBankMode && (
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  "This will wipe your current Sandbox Draft and mirror the Live Bank. Continue?",
                                )
                              ) {
                                setDraftBank(bank);
                                setIsDraftBankMode(true);
                              }
                            }}
                            className="px-4 py-2 bg-[#3D52A0]/90 text-white rounded-lg text-sm font-bold hover:bg-[#334486] backdrop-blur-md border border-white/20 shadow-md shadow-sky-600/20 transition-all"
                          >
                            Sync Draft from Live
                          </button>
                        )}
                      </div>
                      <BankTab
                        bank={isDraftBankMode ? draftBank : bank}
                        setBank={isDraftBankMode ? setDraftBank : setBank}
                        aiStrategy={aiStrategy}
                        highlightedBankItemId={highlightedBankItemId}
                        onHighlightClear={() => setHighlightedBankItemId(null)}
                        projects={projectLibrary}
                      />
                    </div>
                  )}
                  {activeTab === "templates" && (
                    <TemplateEditorTab
                      bank={bank}
                      templates={templates}
                      setTemplates={setTemplates}
                      // ACTIVE_TEMPLATES
                    />
                  )}
                  {activeTab === "ai-settings" && (
                    <AIStrategyTab
                      aiStrategy={aiStrategy}
                      setAiStrategy={setAiStrategy}
                      // ACTIVE_AI_SETTINGS
                    />
                  )}

                  {/* SAAS SETTINGS */}
                  {activeTab === "saas-dashboard" && <SuperAdminDashboard />}
                  {[
                    "studio-settings",
                    "terms-and-payment",
                    "setup-wizard",
                    "communication-templates",
                  ].includes(activeTab) && (
                    <StudioSettingsShell
                      activeTab={activeTab}
                      setActiveTab={setActiveTab}
                      onDownloadBackup={handleDownloadBackup}
                      onImportProject={handleLoadProject}
                      onClearProject={handleClearProject}
                      confirmReset={confirmReset}
                      // ACTIVE_SAAS_SETTINGS_BLOCK_1
                    />
                  )}

                  {/* Mounted after every page branch, not beside one.
                      Placed mid-chain it rendered ABOVE the content on any
                      route declared further down -- which is how it ended up
                      over the top of Settings. Being structurally last is what
                      makes it a footer on every route rather than on the ones
                      that happen to sit above it. */}
                  {["projects", "clients", "reports", "admin-templates-bank",
                    "data-privacy", "support", "terms-of-use", "studio-settings",
                    "terms-and-payment", "communication-templates",
                    "ai-settings"].includes(activeTab) && (
                    <StudioFooter variant="slim" onNavigate={setActiveTab} />
                  )}

                  {/* PROJECT TABS - Only render if project exists - BLOCK 1 */}
                  {isProjectTab && hasProjectData ? (
                    <>
                      {/* Dashboard or Wizard - BLOCK 1 */}
                      {activeTab === "dashboard" &&
                        (tiers.length === 0 || showWizardOverride ? (
                          <div className="flex justify-center items-center h-full">
                            <ProjectSetupWizard
                              setTiers={setTiers}
                              bank={bank}
                              projectContext={projectContext}
                              setProjectContext={setProjectContext}
                              setActiveTierId={setActiveTierId}
                              setAiStrategy={setAiStrategy}
                              setMaterialSuggestions={setMaterialSuggestions}
                              setTimelinePhases={setTimelinePhases}
                              leadProfile={leadProfile}
                              /* BLOCK_1_MARKER */
                              setLeadProfile={setLeadProfile}
                              setDecisionBrainOutput={setDecisionBrainOutput}
                              templates={templates}
                              onComplete={() => setShowWizardOverride(false)}
                              onCancel={tiers.length > 0 ? () => setShowWizardOverride(false) : undefined}
                            />
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <Dashboard
                              onModifyBrief={() => setShowWizardOverride(true)}
                              activeTier={activeCalculatedTier}
                              setActiveTab={setActiveTab}
                              fullBoq={
                                activeProject
                                  ? executionBoq
                                  : fullBoqForActiveTier
                              }
                              projectContext={projectContext}
                              setProjectContext={setProjectContext}
                              activeProject={activeProject}
                              setActiveProject={setActiveProject}
                              tiers={tiersWithCalculatedSummaries}
                              bank={bank}
                              projectId={activeInternalId}
                              projectArchitecture={projectArchitecture}
                              onUpgradeArchitecture={async () => {
                                  if (activeInternalId) {
                                      const fullProject: FullProjectData = {
                                          id: activeInternalId,
                                          architecture: projectArchitecture,
                                          lastModified: Date.now(),
                                          context: projectContext,
                                          tiers: tiersWithCalculatedSummaries,
                                          activeTierId,
                                          activeProject,
                                          materials: materialSuggestions,
                                          timeline: timelinePhases,
                                          leadProfile,
                                          decisionBrainOutput,
                                      };
                                      await db.upgradeLegacyProject(fullProject);
                                      setProjectArchitecture('canonical');
                                      alert("Project architecture upgraded successfully! Backend rules and triggers will now run.");
                                  }
                              }}
                            />
                          </div>
                        ))}

                      {/* IN_BLOCK_1_TABS */}
                      {activeTab === "project-journey" && (
                        <ProjectJourneyPage
                          projectId={activeInternalId!}
                          projectContext={projectContext}
                          /* Closing a project screen returns you to that project, not out
                             of it. This sent people to the studio Projects list, which
                             discards the project context they were working in. */
                          onClose={() => setActiveTab("dashboard")}
                          onNavigate={setActiveTab}
                        />
                      )}

                      {activeTab === "project-reports" && (
                        <ProjectReportsTab
                          projectContext={projectContext}
                          boq={activeProject ? executionBoq : fullBoqForActiveTier}
                          projectId={activeInternalId}
                          activeTier={activeCalculatedTier}
                          allProjects={projectLibrary}
                          currentUserRole={orgData?.role || 'Admin'}
                          setActiveTab={setActiveTab}
                        />
                      )}

                      {/* IN_BLOCK_1_STUDIO_DASHBOARD */}
                      {activeTab === "boq-editor" && (
                        <StudioDashboard
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          tiers={tiersWithCalculatedSummaries}
                          setTiers={setTiers}
                          activeTierId={activeTierId}
                          bank={bank}
                          aiStrategy={aiStrategy}
                          onViewInBank={handleViewInBank}
                          onSaveProject={handleDownloadBackup}
                          projectId={activeInternalId || ""}
                          projectArchitecture={projectArchitecture}
                          onUpgradeArchitecture={async () => {
                                  if (activeInternalId) {
                                      const fullProject: FullProjectData = {
                                          id: activeInternalId,
                                          architecture: projectArchitecture,
                                          lastModified: Date.now(),
                                          context: projectContext,
                                          tiers: tiersWithCalculatedSummaries,
                                          activeTierId,
                                          activeProject,
                                          materials: materialSuggestions,
                                          timeline: timelinePhases,
                                          leadProfile,
                                          decisionBrainOutput,
                                      };
                                      await db.upgradeLegacyProject(fullProject);
                                      setProjectArchitecture('canonical');
                                      alert("Project architecture upgraded successfully! Backend rules and triggers will now run.");
                                  }
                              }}
                        />
                      )}
                      {activeTab === "leadiq" && (
                        <LeadBrainTab
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          leadProfile={leadProfile}
                          setLeadProfile={setLeadProfile}
                          onStrategyChange={setDecisionBrainOutput}
                          setActiveTab={setActiveTab}
                          aiStrategy={aiStrategy}
                          projectId={activeInternalId || undefined}
                          tiers={tiers}
                          setTiers={setTiers}
                          activeTierId={activeTierId}
                          bank={bank}
                        />
                      )}
                      {activeTab === "drawing-tracker" && (
                        <DrawingTrackerModule
                          projectId={activeInternalId!}
                          projectContext={projectContext}
                          fullBoq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                        />
                      )}
                      {/* IN_BLOCK_1_SCOPE_ADDITIONS */}
                      {activeTab === "scope-additions" && (
                        <ScopeAdditionsModule
                          projectId={activeInternalId!}
                          projectContext={projectContext}
                          bank={bank}
                          setProjectContext={setProjectContext}
                        />
                      )}
                      {activeTab === "timeline" && (
                        <TimelineTab
                          projectId={activeInternalId}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          boq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          phases={timelinePhases}
                          setPhases={setTimelinePhases}
                        />
                      )}
                      
                      {activeTab === "payment-calc" && (
                        <PaymentCalculatorTab
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          activeTier={activeCalculatedTier}
                          tiers={tiersWithCalculatedSummaries}
                          allProjects={projectLibrary} // NEW: Passing full library for global calculation
                          projectId={activeInternalId!}
                          bank={bank}
                          fullBoq={activeProject ? executionBoq : fullBoqForActiveTier}
                          setBoq={setBoqForActiveTier}
                          aiStrategy={aiStrategy}
                        />
                      )}
                      {activeTab === "materials" && (
                        <MaterialTab
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          activeTier={activeCalculatedTier || undefined}
                          bank={bank}
                          projectId={activeInternalId!}
                          decisionLedger={decisionLedger}
                        />
                      )}

                      {(activeTab === "terms-docket" || activeTab === "payment-schedule") && (
                        <div className="mb-6">

                        </div>
                      )}

                      {activeTab === "terms-docket" && (
                        <TermsDocketPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          tenantId={orgData?.tenantId}
                          projectId={activeInternalId || (projectContext as any).id || ''}
                        />
                      )}
                      {activeTab === "snaglist" && (
                        <SnagListReportPage
                          projectContext={projectContext}
                          onBack={() => setActiveTab("docs")}
                        />
                      )}
                      {activeTab === "checklist" && (
                        <QualityChecklistReportPage
                          projectContext={projectContext}
                          onBack={() => setActiveTab("docs")}
                        />
                      )}
                      {activeTab === "handover-docket" && (
                        <HandoverDocketPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          projectId={activeInternalId || (projectContext as any).id || ''}
                        />
                      )}
                      {activeTab === "payment-schedule" && (
                        <PaymentSchedulePage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          activeTier={activeCalculatedTier}
                        />
                      )}
                      {activeTab === "execution-agreement" && (
                        <ExecutionAgreementPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          tenantId={orgData?.tenantId}
                          projectId={activeInternalId || (projectContext as any).id || ''}
                          activeTier={activeCalculatedTier}
                          fullBoq={activeProject ? executionBoq : fullBoqForActiveTier}
                        />
                      )}
                      {activeTab === "design-gate" && (
                        <DesignCompleteGate
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          fullBoq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          currentRole={currentRole}
                        />
                      )}
                      {activeTab === "client-portal" && (
                        <>
                        {/* Ops-only. Sits above the preview because ops must see
                            the state of items the client cannot see at all. */}
                        <PortalPublishControls
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          currentUser={currentUserAuth?.email || currentUserAuth?.displayName || undefined}
                          projectId={activeInternalId || undefined}
                          clientBoq={clientBoqRows}
                          clientBoqBaseline={clientBoqBaseline}
                        />
                        <ClientPortal
                          clientBoq={clientBoqRows}
                          projectData={{
                            id: activeInternalId!,
                            lastModified: Date.now(),
                            context: projectContext,
                            tiers: tiersWithCalculatedSummaries,
                            materials: materialSuggestions,
                            timeline: timelinePhases,
                            activeTierId: activeTierId,
                            activeProject: activeProject,
                            leadProfile: leadProfile,
                            decisionBrainOutput: decisionBrainOutput,
                          }}
                          bank={bank}
                          onProjectUpdate={(updated) => {
                            // Approvals recorded while the studio previews the
                            // portal must persist — otherwise a sign-off taken
                            // in-office is lost on tab change.
                            setProjectContext(updated.context);
                          }}
                        />
                        </>
                      )}
                      {activeTab === "onboarding" && (
                        <OnboardingKitPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                        />
                      )}
                      {activeTab === "emails" && (
                        <EmailDraftsTab
                          projectContext={projectContext}
                          tiers={tiersWithCalculatedSummaries}
                        />
                      )}
                      {activeTab === "docs" && (
                        <DocumentsHub
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          projectId={activeInternalId!}
                          projectData={{
                            id: activeInternalId!,
                            lastModified: Date.now(),
                            context: projectContext,
                            tiers: tiersWithCalculatedSummaries,
                            materials: materialSuggestions,
                            timeline: timelinePhases,
                            activeTierId: activeTierId,
                          } as any}
                          onNavigate={(route) => setActiveTab(route)}
                        />
                      )}
                      {activeTab === "comms-tracker" && (
                        <CommunicationTracker
                          projectId={activeInternalId!}
                          studioId={orgData?.tenantId || "demo-tenant-01"}
                          projectContext={projectContext}
                          teamMembers={[]}
                          currentUserName={
                            currentUserAuth?.displayName ||
                            currentUserAuth?.email ||
                            "Unknown User"
                          }
                          currentUserId={currentUserAuth?.uid || "unknown"}
                        />
                      )}
                      {activeTab === "client" && (
                        <ClientTab
                          tiers={tiersWithCalculatedSummaries}
                          bank={bank}
                          materialSuggestions={materialSuggestions}
                          timelinePhases={timelinePhases}
                          setTimelinePhases={setTimelinePhases}
                          projectContext={projectContext}
                          decisionBrainOutput={decisionBrainOutput}
                          leadProfile={leadProfile}
                          setProjectContext={setProjectContext}
                          onExportHtml={handleExportHtml}
                        />
                      )}
                      {activeTab === "revision-studio" && (
                        <RevisionStudio
                          tiers={tiersWithCalculatedSummaries}
                          approvedTierId={projectContext.approvedTierId}
                          activeTierId={activeTierId}
                          bank={bank}
                          setBank={setBank}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          setTiers={setTiers}
                          setActiveTierId={setActiveTierId}
                        />
                      )}
                      {activeTab === "analytics" && (
                        <AnalyticsTab
                          boq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          setBoq={setBoqForActiveTier}
                          bank={bank}
                          activeTab={activeTab}
                          aiStrategy={aiStrategy}
                          tiers={tiersWithCalculatedSummaries}
                          projectContext={projectContext}
                          currentUserRole={orgData?.role || 'Admin'}
                        />
                      )}
                      {(activeTab === "site-ops" ||
                        activeTab === "update-client-feed" ||
                        activeTab === "record-decision" ||
                        activeTab === "mom-action-tracker") && (
                        <SiteOpsTab
                          key={activeTab}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          decisionBrainOutput={decisionBrainOutput}
                          boq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          projectId={activeInternalId!}
                          decisionLedger={decisionLedger}
                          activeProject={activeProject}
                          onProjectUpdate={setActiveProject}
                          onNavigateToTab={setActiveTab}
                          initialModule={
                            activeTab === "update-client-feed"
                              ? "client-updates"
                              : activeTab === "record-decision"
                                ? "decision-tracker"
                                : activeTab === "mom-action-tracker"
                                  ? "action-tracker"
                                  : "execution"
                          }
                          onAddCalculatedItem={(
                            name,
                            cat,
                            qty,
                            unit,
                            roomId,
                          ) => {
                            if (!activeTierId) return;
                            const newBankItem: Item = {
                              id: generateId(),
                              name,
                              cat,
                              specs: "Added from Site Ops calculator",
                              unit,
                              materials: 0,
                              labor: 0,
                              margin: 0,
                            };
                            setBank((prev) => [...prev, newBankItem]);

                            const newBoqItem: BoqItem = {
                              id: generateId(),
                              bankId: newBankItem.id,
                              qty,
                              roomId,
                              rationale: "Calculated value",
                            };
                            setTiers((prev) =>
                              prev.map((tier) => {
                                if (tier.id !== activeTierId) return tier;
                                return {
                                  ...tier,
                                  boq: [...tier.boq, newBoqItem],
                                };
                              }),
                            );
                          }}
                        />
                      )}
                      {activeTab === "ops" && (
                        <OperationsTab
                          tiers={tiersWithCalculatedSummaries}
                          setTiers={setTiers}
                          activeTierId={activeTierId}
                          setActiveTierId={setActiveTierId}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          bank={bank}
                          setBank={setBank} // NEW: Pass bank setter for dynamic creation
                          setActiveTab={setActiveTab}
                          projects={projectLibrary}
                          templates={templates}
                        />
                      )}
                      {activeTab === "history" && (
                        <ProjectHistory
                          projectContext={projectContext}
                          activeInternalId={activeInternalId}
                        />
                      )}
                    </>
                  ) : (
                    /* Fallback if project tab requested but no project active */
                    isProjectTab &&
                    !hasProjectData && (
                      <div className="flex flex-col items-center justify-center h-[50vh]">
                        <p className="text-slate-400 mb-4">
                          No active project selected.
                        </p>
                        <button
                          onClick={() => setActiveTab("projects")}
                          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold"
                        >
                          Go to Projects
                        </button>
                      </div>
                    )
                  )}
                  </Suspense>
                </MotionDiv>
              </AnimatePresence>
                </div>
              </ProjectWorkspace>
              <SuccessWithNextToast projectId={activeInternalId || undefined} projectContext={projectContext} />
              </JourneyProvider>
            ) : (
              <div className={`flex-grow h-full overflow-y-auto ${activeTab === "client" || activeTab === "client-boq-pack" ? "" : "pt-3 pb-8 px-4 lg:px-6"}`}>
                  {activeTab !== "client" && activeTab !== "client-boq-pack" && (
                    <PageTitleBlock route={activeTab} />
                  )}
                  <AnimatePresence mode="wait">
                <MotionDiv
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <Suspense fallback={
                    <div className="p-12 flex flex-col items-center justify-center text-slate-400 space-y-3">
                      <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Loading View...</span>
                    </div>
                  }>
                  {/* GLOBAL TABS */}
                  {activeTab === "home" && (
                    <StudioHomeOrbit
                      projects={projectLibrary}
                      onOpenProject={handleOpenProject}
                      onCreateNew={handleCreateNewProject}
                      onNavigate={setActiveTab}
                      role={orgData?.role || "Admin"}
                      userName={currentUserAuth?.displayName || currentUserAuth?.email || "there"}
                      lastTabs={lastTabs}
                      attention={attention}
                      onAttentionChange={handleAttentionChange}
                    />
                  )}
                  {activeTab === "reports" && (
                    <StudioReports
                      projects={projectLibrary}
                      onNavigate={setActiveTab}
                      onOpenProject={(id) => {
                        const p = projectLibrary.find(x => x.id === id);
                        if (p) handleOpenProject(p, "project-reports");
                      }}
                    />
                  )}
                  {activeTab === "projects" && (
                    <ProjectListTab
                      projects={projectLibrary}
                      activeProjectId={activeInternalId}
                      onOpenProject={handleOpenProject}
                      onCreateNew={handleCreateNewProject}
                      onDeleteProject={handleDeleteProject}
                      onDuplicateProject={handleDuplicateProject}
                      onQuickUpdate={handleQuickProjectUpdate}
                      onStatusChange={handleProjectStatusChange}
                    />
                  )}
                  {activeTab === "clients" && (
                    <ClientsDirectory
                      projects={projectLibrary}
                      onOpenProject={handleOpenProject}
                      onCreateNew={handleCreateNewProject}
                    />
                  )}
                  {activeTab === "admin-templates-bank" && (
                    <TemplatesAndBankTab
                      bank={bank}
                      setBank={setBank}
                      templates={templates}
                      setTemplates={setTemplates}
                      isDraftBankMode={isDraftBankMode}
                      setIsDraftBankMode={setIsDraftBankMode}
                      draftBank={draftBank}
                      setDraftBank={setDraftBank}
                      aiStrategy={aiStrategy}
                      highlightedBankItemId={highlightedBankItemId}
                      setHighlightedBankItemId={setHighlightedBankItemId}
                      projects={projectLibrary}
                    />
                  )}

                  {/* The slim footer, on the working screens only.

                      Home renders the full one. Here it is the plate alone --
                      studio, place, year, classification -- because the
                      capability columns would link to the page you are already
                      on and the statement would repeat itself five times. */}
                  {activeTab === "data-privacy" && <DataPrivacyPage />}
                  {activeTab === "support" && <SupportDeskPage />}
                  {activeTab === "terms-of-use" && <TermsOfUsePage />}

{activeTab === "bank" && (
                    <div className="space-y-4">
                      <div className="flex justify-end gap-3 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm w-full">
                        <div className="text-sm font-medium text-slate-700">
                          Currently Editing:{" "}
                          <span
                            className={
                              isDraftBankMode
                                ? "text-amber-600 font-bold"
                                : "text-emerald-600 font-bold"
                            }
                          >
                            {isDraftBankMode
                              ? "Draft Sandbox"
                              : "Live Item Bank"}
                          </span>
                        </div>
                        <button
                          onClick={() => setIsDraftBankMode(!isDraftBankMode)}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border ${isDraftBankMode ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"}`}
                        >
                          Switch to{" "}
                          {isDraftBankMode ? "Live Bank" : "Draft Sandbox"}
                        </button>
                        {isDraftBankMode && (
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  "Are you sure you want to completely overwrite the LIVE item bank with your Draft sandbox? This will affect new projects and prices.",
                                )
                              ) {
                                setBank(draftBank);
                                setIsDraftBankMode(false);
                                alert(
                                  "Draft successfully published to Live Bank!",
                                );
                              }
                            }}
                            className="px-4 py-2 bg-[#3D52A0] text-white rounded-lg text-sm font-bold hover:bg-[#334486] shadow-sm transition-colors"
                          >
                            Publish Draft to Live
                          </button>
                        )}
                        {!isDraftBankMode && (
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  "This will wipe your current Sandbox Draft and mirror the Live Bank. Continue?",
                                )
                              ) {
                                setDraftBank(bank);
                                setIsDraftBankMode(true);
                              }
                            }}
                            className="px-4 py-2 bg-[#3D52A0]/90 text-white rounded-lg text-sm font-bold hover:bg-[#334486] backdrop-blur-md border border-white/20 shadow-md shadow-sky-600/20 transition-all"
                          >
                            Sync Draft from Live
                          </button>
                        )}
                      </div>
                      <BankTab
                        bank={isDraftBankMode ? draftBank : bank}
                        setBank={isDraftBankMode ? setDraftBank : setBank}
                        aiStrategy={aiStrategy}
                        highlightedBankItemId={highlightedBankItemId}
                        onHighlightClear={() => setHighlightedBankItemId(null)}
                        projects={projectLibrary}
                      />
                    </div>
                  )}
                  {activeTab === "templates" && (
                    <TemplateEditorTab
                      bank={bank}
                      templates={templates}
                      setTemplates={setTemplates}
                    />
                  )}
                  {activeTab === "ai-settings" && (
                    <AIStrategyTab
                      aiStrategy={aiStrategy}
                      setAiStrategy={setAiStrategy}
                    />
                  )}

                  {/* SAAS SETTINGS */}
                  {activeTab === "saas-dashboard" && <SuperAdminDashboard />}
                  {[
                    "studio-settings",
                    "terms-and-payment",
                    "setup-wizard",
                    "communication-templates",
                  ].includes(activeTab) && (
                    <StudioSettingsShell
                      activeTab={activeTab}
                      setActiveTab={setActiveTab}
                      onDownloadBackup={handleDownloadBackup}
                      onImportProject={handleLoadProject}
                      onClearProject={handleClearProject}
                      confirmReset={confirmReset}
                    />
                  )}

                  {/* Mounted after every page branch, not beside one.
                      Placed mid-chain it rendered ABOVE the content on any
                      route declared further down -- which is how it ended up
                      over the top of Settings. Being structurally last is what
                      makes it a footer on every route rather than on the ones
                      that happen to sit above it. */}
                  {["projects", "clients", "reports", "admin-templates-bank",
                    "data-privacy", "support", "terms-of-use", "studio-settings",
                    "terms-and-payment", "communication-templates",
                    "ai-settings"].includes(activeTab) && (
                    <StudioFooter variant="slim" onNavigate={setActiveTab} />
                  )}

                  {/* PROJECT TABS - Only render if project exists - BLOCK 2 */}
                  {isProjectTab && hasProjectData ? (
                    <>
                      {/* Dashboard or Wizard - BLOCK 2 */}
                      {activeTab === "dashboard" &&
                        (tiers.length === 0 || showWizardOverride ? (
                          <div className="flex justify-center items-center h-full">
                            <ProjectSetupWizard
                              setTiers={setTiers}
                              bank={bank}
                              projectContext={projectContext}
                              setProjectContext={setProjectContext}
                              setActiveTierId={setActiveTierId}
                              setAiStrategy={setAiStrategy}
                              setMaterialSuggestions={setMaterialSuggestions}
                              setTimelinePhases={setTimelinePhases}
                              leadProfile={leadProfile}
                              setLeadProfile={setLeadProfile}
                              setDecisionBrainOutput={setDecisionBrainOutput}
                              templates={templates}
                              onComplete={() => setShowWizardOverride(false)}
                              onCancel={tiers.length > 0 ? () => setShowWizardOverride(false) : undefined}
                            />
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <Dashboard
                              onModifyBrief={() => setShowWizardOverride(true)}
                              activeTier={activeCalculatedTier}
                              setActiveTab={setActiveTab}
                              fullBoq={
                                activeProject
                                  ? executionBoq
                                  : fullBoqForActiveTier
                              }
                              projectContext={projectContext}
                              setProjectContext={setProjectContext}
                              activeProject={activeProject}
                              setActiveProject={setActiveProject}
                              tiers={tiersWithCalculatedSummaries}
                              bank={bank}
                              projectId={activeInternalId}
                              projectArchitecture={projectArchitecture}
                              onUpgradeArchitecture={async () => {
                                  if (activeInternalId) {
                                      const fullProject: FullProjectData = {
                                          id: activeInternalId,
                                          architecture: projectArchitecture,
                                          lastModified: Date.now(),
                                          context: projectContext,
                                          tiers: tiersWithCalculatedSummaries,
                                          activeTierId,
                                          activeProject,
                                          materials: materialSuggestions,
                                          timeline: timelinePhases,
                                          leadProfile,
                                          decisionBrainOutput,
                                      };
                                      await db.upgradeLegacyProject(fullProject);
                                      setProjectArchitecture('canonical');
                                      alert("Project architecture upgraded successfully! Backend rules and triggers will now run.");
                                  }
                              }}
                            />

                            <ProjectContextCard
                              projectContext={projectContext}
                              setProjectContext={setProjectContext}
                              aiStrategy={aiStrategy}
                              onSaveProject={handleDownloadBackup}
                              projectId={activeInternalId || undefined}
                              hideExecutionControls={true}
                            />
                          </div>
                        ))}

                      {/* IN_BLOCK_2_TABS */}
                      {activeTab === "project-journey" && (
                        <ProjectJourneyPage
                          projectId={activeInternalId!}
                          projectContext={projectContext}
                          /* Closing a project screen returns you to that project, not out
                             of it. This sent people to the studio Projects list, which
                             discards the project context they were working in. */
                          onClose={() => setActiveTab("dashboard")}
                          onNavigate={setActiveTab}
                        />
                      )}

                      {activeTab === "project-reports" && (
                        <ProjectReportsTab
                          projectContext={projectContext}
                          boq={activeProject ? executionBoq : fullBoqForActiveTier}
                          projectId={activeInternalId}
                          activeTier={activeCalculatedTier}
                          allProjects={projectLibrary}
                          currentUserRole={orgData?.role || 'Admin'}
                          setActiveTab={setActiveTab}
                        />
                      )}

                      {activeTab === "boq-editor" && (
                        <StudioDashboard
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          tiers={tiersWithCalculatedSummaries}
                          setTiers={setTiers}
                          activeTierId={activeTierId}
                          bank={bank}
                          aiStrategy={aiStrategy}
                          onViewInBank={handleViewInBank}
                          onSaveProject={handleDownloadBackup}
                          projectId={activeInternalId || ""}
                          projectArchitecture={projectArchitecture}
                          onUpgradeArchitecture={async () => {
                                  if (activeInternalId) {
                                      const fullProject: FullProjectData = {
                                          id: activeInternalId,
                                          architecture: projectArchitecture,
                                          lastModified: Date.now(),
                                          context: projectContext,
                                          tiers: tiersWithCalculatedSummaries,
                                          activeTierId,
                                          activeProject,
                                          materials: materialSuggestions,
                                          timeline: timelinePhases,
                                          leadProfile,
                                          decisionBrainOutput,
                                      };
                                      await db.upgradeLegacyProject(fullProject);
                                      setProjectArchitecture('canonical');
                                      alert("Project architecture upgraded successfully! Backend rules and triggers will now run.");
                                  }
                              }}
                        />
                      )}
                      {activeTab === "leadiq" && (
                        <LeadBrainTab
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          leadProfile={leadProfile}
                          setLeadProfile={setLeadProfile}
                          onStrategyChange={setDecisionBrainOutput}
                          setActiveTab={setActiveTab}
                          aiStrategy={aiStrategy}
                          projectId={activeInternalId || undefined}
                          tiers={tiers}
                          setTiers={setTiers}
                          activeTierId={activeTierId}
                          bank={bank}
                        />
                      )}
                      {activeTab === "drawing-tracker" && (
                        <DrawingTrackerModule
                          projectId={activeInternalId!}
                          projectContext={projectContext}
                          fullBoq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                        />
                      )}
                      {activeTab === "scope-additions" && (
                        <ScopeAdditionsModule
                          projectId={activeInternalId!}
                          projectContext={projectContext}
                          bank={bank}
                          setProjectContext={setProjectContext}
                        />
                      )}
                      {activeTab === "timeline" && (
                        <TimelineTab
                          projectId={activeInternalId}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          boq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          phases={timelinePhases}
                          setPhases={setTimelinePhases}
                        />
                      )}
                      
                      {activeTab === "payment-calc" && (
                        <PaymentCalculatorTab
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          activeTier={activeCalculatedTier}
                          tiers={tiersWithCalculatedSummaries}
                          allProjects={projectLibrary} // NEW: Passing full library for global calculation
                          projectId={activeInternalId!}
                          bank={bank}
                          fullBoq={activeProject ? executionBoq : fullBoqForActiveTier}
                          setBoq={setBoqForActiveTier}
                          aiStrategy={aiStrategy}
                        />
                      )}
                      {activeTab === "materials" && (
                        <MaterialTab
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          activeTier={activeCalculatedTier || undefined}
                          bank={bank}
                          projectId={activeInternalId!}
                          decisionLedger={decisionLedger}
                        />
                      )}

                      {(activeTab === "terms-docket" || activeTab === "payment-schedule") && (
                        <div className="mb-6">

                        </div>
                      )}

                      {activeTab === "terms-docket" && (
                        <TermsDocketPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          tenantId={orgData?.tenantId}
                          projectId={activeInternalId || (projectContext as any).id || ''}
                        />
                      )}
                      {activeTab === "snaglist" && (
                        <SnagListReportPage
                          projectContext={projectContext}
                          onBack={() => setActiveTab("docs")}
                        />
                      )}
                      {activeTab === "checklist" && (
                        <QualityChecklistReportPage
                          projectContext={projectContext}
                          onBack={() => setActiveTab("docs")}
                        />
                      )}
                      {activeTab === "handover-docket" && (
                        <HandoverDocketPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          projectId={activeInternalId || (projectContext as any).id || ''}
                        />
                      )}
                      {activeTab === "payment-schedule" && (
                        <PaymentSchedulePage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          activeTier={activeCalculatedTier}
                        />
                      )}
                      {activeTab === "execution-agreement" && (
                        <ExecutionAgreementPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          tenantId={orgData?.tenantId}
                          projectId={activeInternalId || (projectContext as any).id || ''}
                          activeTier={activeCalculatedTier}
                          fullBoq={activeProject ? executionBoq : fullBoqForActiveTier}
                        />
                      )}
                      {activeTab === "design-gate" && (
                        <DesignCompleteGate
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          fullBoq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          currentRole={currentRole}
                        />
                      )}
                      {activeTab === "client-portal" && (
                        <>
                        {/* Ops-only. Sits above the preview because ops must see
                            the state of items the client cannot see at all. */}
                        <PortalPublishControls
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          currentUser={currentUserAuth?.email || currentUserAuth?.displayName || undefined}
                          projectId={activeInternalId || undefined}
                          clientBoq={clientBoqRows}
                          clientBoqBaseline={clientBoqBaseline}
                        />
                        <ClientPortal
                          clientBoq={clientBoqRows}
                          projectData={{
                            id: activeInternalId!,
                            lastModified: Date.now(),
                            context: projectContext,
                            tiers: tiersWithCalculatedSummaries,
                            materials: materialSuggestions,
                            timeline: timelinePhases,
                            activeTierId: activeTierId,
                            activeProject: activeProject,
                            leadProfile: leadProfile,
                            decisionBrainOutput: decisionBrainOutput,
                          }}
                          bank={bank}
                          onProjectUpdate={(updated) => {
                            // Approvals recorded while the studio previews the
                            // portal must persist — otherwise a sign-off taken
                            // in-office is lost on tab change.
                            setProjectContext(updated.context);
                          }}
                        />
                        </>
                      )}
                      {activeTab === "onboarding" && (
                        <OnboardingKitPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                        />
                      )}
                      {activeTab === "emails" && (
                        <EmailDraftsTab
                          projectContext={projectContext}
                          tiers={tiersWithCalculatedSummaries}
                        />
                      )}
                      {activeTab === "docs" && (
                        <DocumentsHub
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          projectId={activeInternalId!}
                          projectData={{
                            id: activeInternalId!,
                            lastModified: Date.now(),
                            context: projectContext,
                            tiers: tiersWithCalculatedSummaries,
                            materials: materialSuggestions,
                            timeline: timelinePhases,
                            activeTierId: activeTierId,
                          } as any}
                          onNavigate={(route) => setActiveTab(route)}
                        />
                      )}
                      {activeTab === "comms-tracker" && (
                        <CommunicationTracker
                          projectId={activeInternalId!}
                          studioId={orgData?.tenantId || "demo-tenant-01"}
                          projectContext={projectContext}
                          teamMembers={[]}
                          currentUserName={
                            currentUserAuth?.displayName ||
                            currentUserAuth?.email ||
                            "Unknown User"
                          }
                          currentUserId={currentUserAuth?.uid || "unknown"}
                        />
                      )}
                      {activeTab === "client" && (
                        <ClientTab
                          tiers={tiersWithCalculatedSummaries}
                          bank={bank}
                          materialSuggestions={materialSuggestions}
                          timelinePhases={timelinePhases}
                          setTimelinePhases={setTimelinePhases}
                          projectContext={projectContext}
                          decisionBrainOutput={decisionBrainOutput}
                          leadProfile={leadProfile}
                          setProjectContext={setProjectContext}
                          onExportHtml={handleExportHtml}
                        />
                      )}
                      {activeTab === "revision-studio" && (
                        <RevisionStudio
                          tiers={tiersWithCalculatedSummaries}
                          approvedTierId={projectContext.approvedTierId}
                          activeTierId={activeTierId}
                          bank={bank}
                          setBank={setBank}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          setTiers={setTiers}
                          setActiveTierId={setActiveTierId}
                        />
                      )}
                      {activeTab === "analytics" && (
                        <AnalyticsTab
                          boq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          setBoq={setBoqForActiveTier}
                          bank={bank}
                          activeTab={activeTab}
                          aiStrategy={aiStrategy}
                          tiers={tiersWithCalculatedSummaries}
                          projectContext={projectContext}
                          currentUserRole={orgData?.role || 'Admin'}
                        />
                      )}
                      {(activeTab === "site-ops" ||
                        activeTab === "update-client-feed" ||
                        activeTab === "record-decision" ||
                        activeTab === "mom-action-tracker") && (
                        <SiteOpsTab
                          key={activeTab}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          decisionBrainOutput={decisionBrainOutput}
                          boq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          projectId={activeInternalId!}
                          decisionLedger={decisionLedger}
                          activeProject={activeProject}
                          onProjectUpdate={setActiveProject}
                          onNavigateToTab={setActiveTab}
                          initialModule={
                            activeTab === "update-client-feed"
                              ? "client-updates"
                              : activeTab === "record-decision"
                                ? "decision-tracker"
                                : activeTab === "mom-action-tracker"
                                  ? "action-tracker"
                                  : "execution"
                          }
                          onAddCalculatedItem={(
                            name,
                            cat,
                            qty,
                            unit,
                            roomId,
                          ) => {
                            if (!activeTierId) return;
                            const newBankItem: Item = {
                              id: generateId(),
                              name,
                              cat,
                              specs: "Added from Site Ops calculator",
                              unit,
                              materials: 0,
                              labor: 0,
                              margin: 0,
                            };
                            setBank((prev) => [...prev, newBankItem]);

                            const newBoqItem: BoqItem = {
                              id: generateId(),
                              bankId: newBankItem.id,
                              qty,
                              roomId,
                              rationale: "Calculated value",
                            };
                            setTiers((prev) =>
                              prev.map((tier) => {
                                if (tier.id !== activeTierId) return tier;
                                return {
                                  ...tier,
                                  boq: [...tier.boq, newBoqItem],
                                };
                              }),
                            );
                          }}
                        />
                      )}
                      {activeTab === "ops" && (
                        <OperationsTab
                          tiers={tiersWithCalculatedSummaries}
                          setTiers={setTiers}
                          activeTierId={activeTierId}
                          setActiveTierId={setActiveTierId}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          bank={bank}
                          setBank={setBank} // NEW: Pass bank setter for dynamic creation
                          setActiveTab={setActiveTab}
                          projects={projectLibrary}
                          templates={templates}
                        />
                      )}
                    </>
                  ) : (
                    /* Fallback if project tab requested but no project active */
                    isProjectTab &&
                    !hasProjectData && (
                      <div className="flex flex-col items-center justify-center h-[50vh]">
                        <p className="text-slate-400 mb-4">
                          No active project selected.
                        </p>
                        <button
                          onClick={() => setActiveTab("projects")}
                          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold"
                        >
                          Go to Projects
                        </button>
                      </div>
                    )
                  )}
                  </Suspense>
                </MotionDiv>
              </AnimatePresence>
              </div>
            )}
          </main>
        </>
      )}
      {!(isProjectTab && hasProjectData) && (
        <SuccessWithNextToast projectId={activeInternalId || undefined} projectContext={projectContext} />
      )}
      <OfflineIndicator />
        </div>
    </div>
    </PageHeaderProvider>
  );
}