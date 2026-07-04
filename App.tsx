import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import Sidebar from "./components/Header";
import Breadcrumb from "./components/Breadcrumb";
import Dashboard from "./components/Dashboard";
import StudioDashboard from "./components/StudioDashboard";
import ProjectListTab from "./components/ProjectListTab";
import BankTab from "./components/BankTab";
import TemplateEditorTab from "./components/TemplateEditorTab";
import AIStrategyTab from "./components/AIStrategyTab";
import ProjectSetupWizard from "./components/ProjectSetupWizard";
import PhaseTransitionWidget from "./components/PhaseTransitionWidget";
import LeadBrainTab from "./components/LeadBrainTab";
import TimelineTab from "./components/TimelineTab";
import MaterialTab from "./components/MaterialTab";
import ContractTab from "./components/ContractTab";
import ExecutionAgreementPage from "./components/client/ExecutionAgreementPage";
import DesignCompleteGate from "./components/ops/DesignCompleteGate";
import OnboardingKitPage from "./components/client/OnboardingKitPage";
import EmailDraftsTab from "./components/EmailDraftsTab";
import SiteOpsTab from "./components/SiteOpsTab";
import ClientTab from "./components/ClientTab";
import AnalyticsTab from "./components/AnalyticsTab";
import OperationsTab from "./components/OperationsTab";
import ProjectContextCard from "./components/ProjectContextCard";
import PaymentCalculatorTab from "./components/PaymentCalculatorTab";
import RevisionStudio from "./components/RevisionStudio";
import ClientPortal from "./components/ClientPortal";
import LoginScreen from "./components/LoginScreen";
import TeamTab from "./components/TeamTab";
import SubscriptionTab from "./components/SubscriptionTab";
import StudioSetupWizard from "./components/StudioSetupWizard";
import StudioSettingsTab from "./components/studio/StudioSettingsTab";
import StudioSettingsShell from "./components/StudioSettingsShell";
import SuperAdminDashboard from "./components/SuperAdminDashboard";
import SignoffPage from "./components/SignoffPage";
import AgreementSignoffPage from "./components/AgreementSignoffPage";
import SelectionConfirmPage from "./pages/SelectionConfirmPage";
import { CommunicationTracker } from "./components/ops/CommunicationTrackerPage";
import TermsDocketPage from "./components/client/TermsDocketPage";
import HandoverDocketPage from "./components/client/HandoverDocketPage";
import PaymentSchedulePage from "./components/client/PaymentSchedulePage";
import { EngagementLifecycleWidget } from "./components/ops/EngagementLifecycleWidget";
import { MomAcknowledgePage } from "./components/client/MomAcknowledgePage";
import ProjectJourneyPage from "./components/ops/journey/ProjectJourneyPage";
import ManualStepCompleter from "./components/ops/journey/ManualStepCompleter";
import DrawingTrackerModule from "./components/ops/DrawingTrackerModule";
import ScopeAdditionsModule from "./components/ops/ScopeAdditionsModule";
import SupervisorMobileApp from "./components/SupervisorMobileApp";
import { useOrg } from "./contexts/OrgContext";

import {
  FullProjectData,
  ProjectContext,
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
import { db } from "./services/dbService";
import { verifyApiKey } from "./services/geminiService";
import { id as generateId, calculateSellPrice } from "./lib/utils";
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
  const [activeTab, setActiveTab] = useState("projects");
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
  const [appMode, setAppMode] = useState<
    | "loading"
    | "login"
    | "ops"
    | "client"
    | "signoff"
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
      const urlParams = new URLSearchParams(window.location.search);
      const signoffQueryToken = urlParams.get("signoff");
      if (signoffQueryToken) {
        setSignoffToken(signoffQueryToken);
        setAppMode("signoff");
        setIsDataLoaded(true);
        return;
      }

      const agreementQueryToken = urlParams.get("agreementSignoff");
      if (agreementQueryToken) {
        setAgreementSignoffToken(agreementQueryToken);
        setAppMode("agreement_signoff");
        setIsDataLoaded(true);
        return;
      }

      const path = window.location.pathname;
      if (path.startsWith("/signoff/")) {
        const token = path.split("/")[2];
        if (token) {
          setSignoffToken(token);
          setAppMode("signoff");
          setIsDataLoaded(true);
          return; // short circuit, no need to load full ops environment for public signoff link
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

      const portalId = urlParams.get("portal");

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
          const p = localStorage.getItem("ffds_project_library");
          storedProjects = p ? JSON.parse(p) : [];
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

      // Determine initial app mode
      const savedMode = localStorage.getItem("ffds_app_mode");

      if (portalId) {
        // If they have a portal link, force them to login unless they are already logged in as client for this project
        if (
          savedMode === "client" &&
          localStorage.getItem("ffds_client_project_id") === portalId
        ) {
          const project = storedProjects.find((p) => p.id === portalId);
          if (project) {
            setClientPortalProject(project);
            setAppMode("client");
          } else {
            setAppMode("login");
          }
        } else {
          setAppMode("login");
        }
      } else {
        if (savedMode === "ops") {
          setAppMode("ops");
        } else if (savedMode === "client") {
          const savedProjectId = localStorage.getItem("ffds_client_project_id");
          const project = storedProjects.find((p) => p.id === savedProjectId);
          if (project) {
            setClientPortalProject(project);
            setAppMode("client");
          } else {
            setAppMode("login");
          }
        } else {
          setAppMode("login");
        }
      }
    };
    init();
  }, []);

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

      tier.boq.forEach((b) => {
        const item = bankMap.get(b.bankId);
        let itemCost = 0;
        let itemSell = 0;

        if (item) {
          const cost = (item.materials + item.labor) * b.qty;
          const margin = b.marginOverride ?? item.margin;
          itemCost = cost;
          itemSell =
            calculateSellPrice(item.materials, item.labor, margin) * b.qty;
        } else {
          // Safe calculation if item is completely missing from bank and adHocItems
          const margin = b.marginOverride ?? 0;
          if (b.selectedRate) {
            itemSell = b.selectedRate * b.qty;
            itemCost = itemSell / (1 + margin);
          } else {
            itemCost = 0;
            itemSell = 0;
          }
        }

        totalCost += itemCost;
        totalSell += itemSell;
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
          itemCount: tier.boq?.length || 0,
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
  ]);

  // Auto-save Project to DB
  useEffect(() => {
    if (activeInternalId && projectContext) {
      console.log(
        "Auto-save useEffect triggered for project:",
        activeInternalId,
      );
      const projectToSave: FullProjectData = {
        id: activeInternalId,
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
        db.saveProject(projectToSave);
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
  ]);

  const activeCalculatedTier = useMemo(() => {
    return tiersWithCalculatedSummaries.find((t) => t.id === activeTierId);
  }, [tiersWithCalculatedSummaries, activeTierId]);

  const fullBoqForActiveTier = useMemo((): FullBoqItem[] => {
    if (!activeTierId) return [];
    const activeTier = tiers.find((t) => t.id === activeTierId);
    if (!activeTier) return [];

    const bankMap = new Map<string, Item>(bank.map((i) => [i.id, i]));

    return (activeTier.boq || [])
      .map((b) => {
        const item = bankMap.get(b.bankId);
        if (!item) return null;
        const effectiveMargin = b.marginOverride ?? item.margin;
        return {
          ...item,
          ...b,
          id: b.id,
          margin: effectiveMargin,
        } as FullBoqItem;
      })
      .filter((item) => item !== null) as FullBoqItem[];
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
    const tier = tiers.find((t) => t.id === activeProject.tierId);
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
          cat: b.roomId || "General Scope",
          materials: 0,
          labor: 0,
          margin: b.marginOverride ?? 0,
          unit: "lumpsum",
          specs: "Details missing from bank",
        } as Item);

      const effectiveMargin = b.marginOverride ?? item.margin;
      return {
        ...item,
        ...b,
        id: b.id,
        margin: effectiveMargin,
      } as FullBoqItem;
    });
  }, [activeProject, tiers, bank, projectContext?.adHocItems]);

  // --- HANDLERS ---

  const handleOpenProject = (project: FullProjectData) => {
    setActiveInternalId(project.id);
    setProjectContext(project.context || DEFAULT_CONTEXT);
    setTiers(project.tiers || []);
    setActiveTierId(project.activeTierId || null);
    setActiveProject(project.activeProject || null);
    setMaterialSuggestions(project.materials || []);
    setTimelinePhases(project.timeline || []);
    setLeadProfile(project.leadProfile || DEFAULT_LEAD_PROFILE);
    setDecisionBrainOutput(project.decisionBrainOutput || null);
    setActiveTab("dashboard");
  };

  const handleCreateNewProject = () => {
    const newId = generateId();
    setActiveInternalId(newId);
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

  const handleDeleteProject = async (id: string) => {
    // 1. Optimistic UI Update: Remove immediately from list
    setProjectLibrary((prev) => prev.filter((p) => p.id !== id));

    // 2. If deleting the currently active project, reset the workspace
    if (activeInternalId === id) {
      setActiveInternalId(null);
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

  const handleDuplicateProject = async (project: FullProjectData) => {
    // Deep clone to avoid reference issues
    const clonedProject = JSON.parse(JSON.stringify(project));
    const contextToUse = clonedProject.context || DEFAULT_CONTEXT;

    const duplicated: FullProjectData = {
      ...clonedProject,
      id: generateId(),
      context: { ...contextToUse, name: `${contextToUse.name} (Copy)` },
      lastModified: Date.now(),
    };

    // Optimistic UI Update
    setProjectLibrary((prev) => [duplicated, ...prev]);

    // Save to DB
    await db.saveProject(duplicated);
  };

  const handleQuickProjectUpdate = async (
    projectId: string,
    field: string,
    value: any,
  ) => {
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

  const handleExportHtml = (fileName?: string) => {
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
        doc.title = `${projectContext.name || "Unnamed Project"} - FFDS Proposal`;
      }
      doc
        .querySelectorAll(
          '.no-print, script[type="module"], script[type="importmap"]',
        )
        .forEach((el) => el.remove());

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
                                    'border-2', 'border-indigo-900', 'bg-white', 'shadow-lg', 'scale-[1.02]', 'z-10', 'ring-2', 'ring-slate-100', // Active
                                    'border-slate-200', 'shadow-sm', 'hover:border-slate-400', // Rec Inactive
                                    'border', 'border-slate-200', 'bg-[#F7F7F6]', 'hover:bg-white', 'hover:shadow-sm' // Def Inactive
                                );
                                
                                if(priceContainer) priceContainer.classList.remove('bg-slate-50');

                                if (cId === selectedId) {
                                    // Set Active Styling
                                    c.classList.add('border-2', 'border-indigo-900', 'bg-white', 'shadow-lg', 'scale-[1.02]', 'z-10', 'ring-2', 'ring-slate-100');
                                    if(badge) badge.classList.remove('hidden');
                                    if(recBadge) recBadge.classList.add('hidden'); // Hide Rec badge if active
                                    if(priceContainer) priceContainer.classList.add('bg-slate-50', 'border', 'border-slate-200');
                                    
                                    if(cta) {
                                        cta.textContent = 'Showing Room-wise Scope Below ↓';
                                        cta.classList.remove('text-slate-400', 'group-hover:text-slate-600');
                                        cta.classList.add('text-indigo-600');
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
                                        cta.classList.remove('text-indigo-600');
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
  const isProjectTab = ![
    "projects",
    "bank",
    "templates",
    "ai-settings",
    "team",
    "subscription",
    "setup-wizard",
    "studio-settings",
    "terms-and-payment",
    "saas-dashboard",
  ].includes(activeTab);
  const hasProjectData = !!activeInternalId;

  const PROJECT_WORKFLOW_ROUTES = [
    "dashboard",
    "boq-editor",
    "leadiq",
    "timeline",
    "payment-calc",
    "materials",
    "contract",
    "client-portal",
    "onboarding",
    "emails",
    "client",
    "analytics",
    "site-ops",
    "ops",
  ];

  const showFloatingBar =
    hasProjectData && PROJECT_WORKFLOW_ROUTES.includes(activeTab);

  if (appMode === "loading" || !isDataLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-8">
          <motion.svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            animate={{ rotate: 360 }}
            transition={{ duration: 6, ease: "linear", repeat: Infinity }}
          >
            <defs>
              <linearGradient
                id="ring-gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#d97706" /> {/* amber-600 */}
                <stop offset="30%" stopColor="#fbbf24" /> {/* amber-400 */}
                <stop offset="70%" stopColor="#a78bfa" /> {/* violet-400 */}
                <stop offset="100%" stopColor="#818cf8" /> {/* indigo-400 */}
              </linearGradient>
            </defs>
            <motion.circle
              cx="80"
              cy="80"
              r="76"
              stroke="url(#ring-gradient)"
              strokeWidth="1"
              strokeOpacity="0.3"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
              cx="80"
              cy="80"
              r="62"
              stroke="url(#ring-gradient)"
              strokeWidth="2"
              strokeOpacity="0.5"
              animate={{ scale: [1, 1.05, 1], rotate: [0, -360] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              style={{ originX: "50%", originY: "50%" }}
              strokeDasharray="120 40 80 40"
              strokeLinecap="round"
            />
            <motion.circle
              cx="80"
              cy="80"
              r="46"
              stroke="url(#ring-gradient)"
              strokeWidth="4"
              strokeOpacity="0.9"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.3,
              }}
              strokeLinecap="round"
              strokeDasharray="250 40"
            />
          </motion.svg>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="flex flex-col items-center gap-1.5"
          >
            <div className="text-[11px] font-black tracking-[0.2em] text-indigo-900 uppercase">
              Establishing Studio Workspace
            </div>
            <div className="text-[9px] font-bold tracking-[0.3em] text-slate-400 uppercase">
              Execution Engine
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (appMode === "signoff" && signoffToken) {
    return <SignoffPage token={signoffToken} />;
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

  if (appMode === "login") {
    return (
      <LoginScreen
        projects={projectLibrary}
        portalProjectId={portalProjectId}
        onLoginClient={(project) => {
          localStorage.setItem("ffds_app_mode", "client");
          localStorage.setItem("ffds_client_project_id", project.id);
          setClientPortalProject(project);
          setAppMode("client");
        }}
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
        onLogout={() => {
          localStorage.removeItem("ffds_app_mode");
          localStorage.removeItem("ffds_client_project_id");
          setAppMode("login");
        }}
        onProjectUpdate={async (updatedProject) => {
          await db.saveProject(updatedProject);
          setClientPortalProject(updatedProject);
          // Also update projectLibrary if needed
          setProjectLibrary((prev) =>
            prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
          );
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
      <div className="p-4 md:p-8">
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
    <div className="min-h-screen overflow-x-hidden relative">
      {orgData.isSetupComplete === false ? (
        <div className="w-full bg-slate-50 min-h-screen flex items-center justify-center">
          <StudioSetupWizard onComplete={() => setActiveTab("projects")} />
        </div>
      ) : (
        <>
          <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-[60]">
            <div className="font-bold text-lg text-indigo-900">FORM FACTORS</div>
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
            className={`fixed inset-0 bg-indigo-950/50 z-[70] md:hidden transition-opacity ${isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
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
            projectContext={projectContext}
            className={`transition-transform duration-300 md:translate-x-0 z-[80] w-64 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
          />

          <main className="md:ml-64 w-full md:w-[calc(100%-16rem)] relative min-h-screen flex flex-col bg-slate-50">
            {isProjectTab &&
              hasProjectData &&
              activeTab !== "studio-settings" && (
                <div className="print:hidden">
                  <Breadcrumb
                    projectName={projectContext?.name || "Untitled Project"}
                    projectId={activeInternalId!}
                    currentSection={activeTab}
                    setActiveTab={setActiveTab}
                  />
                </div>
              )}
            {activeTab === "studio-settings" && (
              <div className="print:hidden">
                <div className="h-9 flex items-center px-8 border-b border-slate-200 bg-transparent text-[13px]">
                  <span className="text-slate-500 font-medium">Studio</span>
                  <svg
                    className="w-3.5 h-3.5 mx-2 text-slate-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span className="text-indigo-950 font-medium">Settings</span>
                </div>
              </div>
            )}
            <div className="print:hidden">{/* Floating UI Removed */}</div>

            <div
              className={`flex-grow ${activeTab === "client" || activeTab === "client-boq-pack" ? "" : "p-2 sm:p-4 md:p-8"}`}
            >
              <AnimatePresence mode="wait">
                <MotionDiv
                  key={activeTab}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* MANUAL STEP COMPLETER PROMPT */}
                  {activeInternalId && (
                    <ManualStepCompleter
                      projectId={activeInternalId}
                      projectContext={projectContext}
                      activeTab={activeTab}
                    />
                  )}

                  {/* GLOBAL TABS */}
                  {activeTab === "projects" && (
                    <ProjectListTab
                      projects={projectLibrary}
                      activeProjectId={activeInternalId}
                      onOpenProject={handleOpenProject}
                      onCreateNew={handleCreateNewProject}
                      onDeleteProject={handleDeleteProject}
                      onDuplicateProject={handleDuplicateProject}
                      onQuickUpdate={handleQuickProjectUpdate}
                    />
                  )}
                  {activeTab === "bank" && (
                    <div className="space-y-4">
                      <div className="flex justify-end gap-3 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-w-7xl mx-auto">
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
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm transition-colors"
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
                            className="px-4 py-2 bg-indigo-950 text-white rounded-lg text-sm font-bold hover:bg-indigo-900 shadow-sm transition-colors"
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
                    "team",
                    "subscription",
                    "setup-wizard",
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

                  {/* PROJECT TABS - Only render if project exists */}
                  {isProjectTab && hasProjectData ? (
                    <>
                      {/* Dashboard or Wizard */}
                      {activeTab === "dashboard" &&
                        (tiers.length === 0 ? (
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
                            />
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <Dashboard
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
                            />

                            <ProjectContextCard
                              projectContext={projectContext}
                              setProjectContext={setProjectContext}
                              aiStrategy={aiStrategy}
                              onSaveProject={handleDownloadBackup}
                              projectId={activeInternalId || undefined}
                            />
                          </div>
                        ))}

                      {activeTab === "project-journey" && (
                        <ProjectJourneyPage
                          projectId={activeInternalId!}
                          projectContext={projectContext}
                          onClose={() => setActiveTab("projects")} // Fallback just in case
                          onNavigate={setActiveTab}
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
                        />
                      )}
                      {activeTab === "leadiq" && (
                        <LeadBrainTab
                          projectContext={projectContext}
                          leadProfile={leadProfile}
                          setLeadProfile={setLeadProfile}
                          onStrategyChange={setDecisionBrainOutput}
                          setActiveTab={setActiveTab}
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
                          allProjects={projectLibrary} // NEW: Passing full library for global calculation
                        />
                      )}
                      {activeTab === "materials" && (
                        <MaterialTab
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          activeTier={activeCalculatedTier}
                          bank={bank}
                        />
                      )}

                      {(activeTab === "terms-docket" || activeTab === "payment-schedule") && (
                        <div className="mb-6">
                          <EngagementLifecycleWidget projectContext={projectContext} setProjectContext={setProjectContext} />
                        </div>
                      )}

                      {activeTab === "terms-docket" && (
                        <TermsDocketPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          tenantId={orgData?.tenantId}
                        />
                      )}
                      {activeTab === "handover-docket" && (
                        <HandoverDocketPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                        />
                      )}
                      {activeTab === "payment-schedule" && (
                        <PaymentSchedulePage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          activeTier={activeCalculatedTier}
                        />
                      )}
                      {activeTab === "contract" && (
                        <ContractTab
                          projectId={activeInternalId || ""}
                          tiers={tiersWithCalculatedSummaries}
                          activeTier={activeCalculatedTier}
                          timelinePhases={timelinePhases}
                          bank={bank}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                        />
                      )}
                      {activeTab === "execution-agreement" && (
                        <ExecutionAgreementPage
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          tenantId={orgData?.tenantId}
                          activeTier={activeCalculatedTier}
                          fullBoq={activeProject ? executionBoq : fullBoqForActiveTier}
                        />
                      )}
                      {activeTab === "design-gate" && (
                        <DesignCompleteGate
                          projectId={activeInternalId || ""}
                          projectContext={projectContext}
                          fullBoq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                        />
                      )}
                      {activeTab === "client-portal" && (
                        <ClientPortal
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
                        />
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
                        />
                      )}
                      {(activeTab === "site-ops" ||
                        activeTab === "update-client-feed" ||
                        activeTab === "record-decision") && (
                        <SiteOpsTab
                          key={activeTab}
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          decisionBrainOutput={decisionBrainOutput}
                          boq={
                            activeProject ? executionBoq : fullBoqForActiveTier
                          }
                          projectId={activeInternalId!}
                          activeProject={activeProject}
                          onProjectUpdate={setActiveProject}
                          initialModule={
                            activeTab === "update-client-feed"
                              ? "client-updates"
                              : activeTab === "record-decision"
                                ? "decision-tracker"
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
                </MotionDiv>
              </AnimatePresence>
            </div>
            <div className="print:hidden">{/* Sidekick Removed */}</div>
          </main>
        </>
      )}
    </div>
  );
}
