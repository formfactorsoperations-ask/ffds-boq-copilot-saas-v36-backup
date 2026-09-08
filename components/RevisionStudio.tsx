import React, { useState, useMemo, useEffect } from "react";
import { usePageHeader } from '../contexts/PageHeaderContext';
import { motion, AnimatePresence } from "framer-motion";
import {
  History,
  CheckCircle2,
  RefreshCw,
  FileText,
  Edit3,
  Sparkles,
  PlusCircle,
  Trash2,
  ArrowRight,
  Copy,
  Check,
  Layers,
  LayoutGrid,
  Send,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  ShieldAlert,
  PieChart,
  HelpCircle,
  FileSpreadsheet,
  Lock,
  AlertTriangle,
  MessageSquare,
  ChevronRight,
  Share2,
  Eye,
  Sliders,
  FileCheck,
  Download,
  X,
  ChevronDown
} from "lucide-react";
import Card from "./shared/Card";
import {
  ProposalTier,
  Item,
  ProjectContext,
  RevisionAction,
  ActionType,
  PaymentMilestone,
  FinancialConfig,
} from "../types";
import {
  calculateSellPrice,
  formatINR,
  getClientViewItems,
} from "../lib/utils";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useOrg } from "../contexts/OrgContext";
import { generateClientNote } from "../services/geminiService";
import { INITIAL_BANK } from "../constants";

interface RevisionStudioProps {
  tiers: ProposalTier[];
  approvedTierId?: string;
  activeTierId?: string;
  bank: Item[];
  setBank?: React.Dispatch<React.SetStateAction<Item[]>>;
  projectContext?: ProjectContext;
  setProjectContext?: (
    context: ProjectContext | ((prev: ProjectContext) => ProjectContext),
  ) => void;
  setTiers?: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
  setActiveTierId?: (id: string | null) => void;
}

export default function RevisionStudio({
  tiers,
  approvedTierId,
  activeTierId,
  bank,
  setBank,
  projectContext,
  setProjectContext,
  setTiers,
  setActiveTierId,
}: RevisionStudioProps) {
  const { orgData } = useOrg();
  const [activeTab, setActiveTab] = useState("actions");
  const [showBaselineModal, setShowBaselineModal] = useState(false);
  const [showDetailedClientView, setShowDetailedClientView] = useState(false);
  const [isWhatsappCopied, setIsWhatsappCopied] = useState(false);
  const [actions, setActions] = useState<RevisionAction[]>(
    projectContext?.boqRevisions || [],
  );
  const [nlInput, setNlInput] = useState("");
  const [designFeePercentage, setDesignFeePercentage] = useState<number>(
    projectContext?.financials?.designFeePercentage || 8,
  );
  const [initiationFee, setInitiationFee] = useState<number>(
    projectContext?.financials?.initiationFeePaid || 4999,
  );
  const [summaryTone, setSummaryTone] = useState("Partnership");
  const [customSummary, setCustomSummary] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync actions to projectContext
  useEffect(() => {
    if (setProjectContext && actions !== projectContext?.boqRevisions) {
      setProjectContext((prev) => ({
        ...prev,
        boqRevisions: actions,
      }));
    }
  }, [actions, setProjectContext]);

  // Sync financials
  useEffect(() => {
    if (setProjectContext) {
      setProjectContext((prev) => {
        const currentFinancials = prev.financials || ({} as any);
        if (
          currentFinancials.designFeePercentage !== designFeePercentage ||
          currentFinancials.initiationFeePaid !== initiationFee
        ) {
          return {
            ...prev,
            financials: {
              ...currentFinancials,
              designFeePercentage,
              initiationFeePaid: initiationFee,
            },
          };
        }
        return prev;
      });
    }
  }, [designFeePercentage, initiationFee, setProjectContext]);

  // Sync from projectContext if it changes externally
  useEffect(() => {
    if (
      projectContext?.boqRevisions &&
      projectContext.boqRevisions !== actions
    ) {
      setActions(projectContext.boqRevisions);
    }
  }, [projectContext?.boqRevisions]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (msg: string) => setToastMessage(msg);

  const [selectedTierId, setSelectedTierId] = useState<string | null>(
    () => approvedTierId || activeTierId || (tiers && tiers[0]?.id) || null
  );

  // Keep selectedTierId updated if approvedTierId or activeTierId props change externally (e.g. from TierManager sync)
  useEffect(() => {
    if (approvedTierId) {
      setSelectedTierId(approvedTierId);
    } else if (activeTierId) {
      setSelectedTierId(activeTierId);
    }
  }, [approvedTierId, activeTierId]);

  const currentSelectedTier = useMemo(() => {
    return (
      (tiers || []).find((t) => t.id === selectedTierId) ||
      (tiers || []).find((t) => t.id === approvedTierId) ||
      (tiers || []).find((t) => t.id === activeTierId) ||
      (tiers && tiers[0]) ||
      null
    );
  }, [tiers, selectedTierId, approvedTierId, activeTierId]);

  const availableVersions = useMemo(() => {
    return (tiers || []).map((t) => {
      const isApproved = t.id === (projectContext?.approvedTierId || approvedTierId);
      const isActive = t.id === activeTierId;
      const isCurrentSelected = t.id === currentSelectedTier?.id;

      const executionValue = t.summary?.totalSell || t.summary?.totalRevenue || 0;
      const designValue =
        t.summary?.designFee ||
        (projectContext?.designFeeType === "fixed_lumpsum"
          ? projectContext.designFee || 0
          : projectContext?.designFeeType === "fixed_sqft"
          ? (projectContext.designFee || 0) * (projectContext.area || 0)
          : executionValue *
            ((projectContext?.financials?.designFeePercentage ||
              projectContext?.designFee ||
              8) /
              100));

      let lifecycleBadge: string = t.lifecycleTag || "";
      if (!lifecycleBadge) {
        if (isApproved) {
          lifecycleBadge = t.name.toLowerCase().includes("annexure")
            ? "Approved Annexure"
            : t.name.toLowerCase().includes("revision")
            ? "Approved Revision"
            : "Approved Contract";
        } else if (isActive) {
          lifecycleBadge = "Active Option";
        } else {
          lifecycleBadge = "Option";
        }
      } else if (isApproved && lifecycleBadge === "Approved while booking") {
        lifecycleBadge = t.name.toLowerCase().includes("annexure")
          ? "Approved Annexure"
          : t.name.toLowerCase().includes("revision")
          ? "Approved Revision"
          : "Approved Contract";
      }

      return {
        id: t.id,
        name: t.name,
        timestamp: t.timestamp,
        lifecycleTag: lifecycleBadge,
        executionValue,
        designValue,
        itemCount: t.boq?.length || 0,
        isApproved,
        isActive,
        isCurrentSelected,
      };
    });
  }, [
    tiers,
    projectContext?.approvedTierId,
    approvedTierId,
    projectContext?.designFeeType,
    projectContext?.designFee,
    projectContext?.area,
    projectContext?.financials?.designFeePercentage,
    activeTierId,
    currentSelectedTier?.id,
  ]);

  const handleSetAsActiveBaseline = (tierId: string) => {
    const targetTier = (tiers || []).find((t) => t.id === tierId);
    if (!targetTier) return;

    setSelectedTierId(tierId);
    if (setActiveTierId) setActiveTierId(tierId);

    if (setProjectContext) {
      setProjectContext((prev) => {
        const prevFinancials = prev.financials || ({} as any);
        const execVal =
          targetTier.summary?.totalSell || targetTier.summary?.totalRevenue || 0;
        const desVal = targetTier.summary?.designFee || 0;
        return {
          ...prev,
          approvedTierId: tierId,
          boqRevisions: [],
          financials: {
            ...prevFinancials,
            approvedExecutionValue: execVal,
            approvedDesignValue: desVal,
          },
        };
      });
    }
    setActions([]);
    showToast(
      `Set "${targetTier.name}" as the active baseline and synchronized project financials.`,
    );
  };

  const handleSyncFromTier = (tierId: string) => {
    const targetTier = (tiers || []).find((t) => t.id === tierId);
    if (!targetTier) return;
    setSelectedTierId(tierId);
    setActions([]);
    if (setProjectContext) {
      setProjectContext((prev) => ({
        ...prev,
        boqRevisions: [],
      }));
    }
    showToast(
      `Reset draft actions and synced clean baseline from "${targetTier.name}".`,
    );
  };

  const [manualForm, setManualForm] = useState({
    type: "REVISE_QTY" as ActionType,
    targetItemId: "",
    newItemName: "",
    newSection: "",
    newUnit: "nos",
    newQty: 1,
    newRate: 0,
    reasonCategory: "Design Upgrade",
    note: "",
    inclusions: "",
    exclusions: "",
  });

  // 1. Derive Baseline BOQ
  const baselineBoq = useMemo(() => {
    if (!currentSelectedTier) return [];

    const bankMap = new Map(bank.map((i) => [i.id, i]));
    if (projectContext?.adHocItems) {
      projectContext.adHocItems.forEach((i) => bankMap.set(i.id, i));
    }

    return (currentSelectedTier.boq || []).map((boqItem) => {
      const initialBankItem = INITIAL_BANK.find((i) => i.id === boqItem.bankId);
      const bankItem = bankMap.get(boqItem.bankId) || initialBankItem;
      /*
        The line's own rate wins over anything derived from the bank.

        This had the order the other way round: it computed from the bank
        whenever a bank item existed, and only looked at `selectedRate` when
        there was none. So a line whose rate had been revised and approved —
        which is exactly what `selectedRate` records — was displayed at the
        bank's rate instead. The Living Room base cabinet showed 3,520 here
        while the approved BOQ, the client portal and the annexure total all
        had it at 4,500.

        This is the same order of preference buildClientBoqRows uses, so ops
        and the client are now reading one number.
      */
      let rate = 0;
      if (boqItem.selectedRate !== undefined && Number(boqItem.selectedRate) > 0) {
        rate = Number(boqItem.selectedRate);
      } else if (bankItem) {
        rate = calculateSellPrice(
          boqItem.baseRate !== undefined ? boqItem.baseRate : bankItem.materials,
          bankItem.labor,
          boqItem.marginOverride ?? bankItem.margin,
        );
      }

      const itemTitle =
        bankItem?.name ||
        (boqItem as any).name ||
        boqItem.rationale ||
        "Custom / Old Item";
      const itemUnit = bankItem?.unit || "lumpsum";
      const itemCat = bankItem?.cat || "General Scope";

      return {
        id: boqItem.id,
        bankId: boqItem.bankId,
        section: (() => {
          let s = boqItem.roomId || itemCat || "General Scope";
          if (["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(s))
            return "General Scope";
          const lowerS = s.toLowerCase();
          if (
            [
              "carpentry",
              "civil",
              "electrical",
              "plumbing",
              "painting",
              "decor",
              "hvac",
              "site services",
              "loose furniture",
              "glass & mirror",
            ].includes(lowerS)
          )
            return "General Scope";
          return s;
        })(),
        item: itemTitle,
        unit: itemUnit,
        qty: boqItem.qty,
        rate: rate,
        total: rate * boqItem.qty,
        status: "Approved",
        inclusions: boqItem.inclusions || [],
        exclusions: boqItem.exclusions || [],
      };
    });
  }, [currentSelectedTier, bank, projectContext?.adHocItems]);

  // 2. Derive Current Revision BOQ
  const currentRevisionBoq = useMemo(() => {
    let workingBoq = JSON.parse(JSON.stringify(baselineBoq));

    actions.forEach((action) => {
      if (action.type === "ADD") {
        workingBoq.push({
          id: action.id,
          bankId: "ADHOC_" + action.id,
          roomId: action.section,
          section: action.section,
          item: action.item,
          unit: action.newValue.unit || "nos",
          qty: action.newValue.qty || 1,
          rate: action.newValue.rate || 0,
          total: (action.newValue.qty || 1) * (action.newValue.rate || 0),
          marginOverride: 0,
          status: "Added",
          note: action.note,
          reasonCategory: action.reasonCategory,
          inclusions: action.newValue.inclusions || [],
          exclusions: action.newValue.exclusions || [],
        });
      } else {
        const targetIndex = workingBoq.findIndex((i: any) =>
          action.targetId
            ? i.id === action.targetId
            : i.section === action.section && i.item === action.item,
        );
        if (targetIndex >= 0) {
          if (action.type === "REMOVE") {
            workingBoq[targetIndex].status = "Removed";
            workingBoq[targetIndex].qty = 0;
            workingBoq[targetIndex].total = 0;
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === "REVISE_QTY") {
            workingBoq[targetIndex].qty = action.newValue;
            workingBoq[targetIndex].total =
              action.newValue * workingBoq[targetIndex].rate;
            workingBoq[targetIndex].status = "Revised";
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === "REVISE_RATE") {
            workingBoq[targetIndex].rate = action.newValue;
            workingBoq[targetIndex].total =
              workingBoq[targetIndex].qty * action.newValue;
            workingBoq[targetIndex].status = "Revised";
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === "MARK_PENDING") {
            workingBoq[targetIndex].previousStatus =
              workingBoq[targetIndex].status;
            workingBoq[targetIndex].status = "Pending Decision";
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === "APPROVE_PENDING") {
            workingBoq[targetIndex].status =
              workingBoq[targetIndex].previousStatus || "Approved";
            if (action.note) workingBoq[targetIndex].note = action.note;
            if (action.reasonCategory)
              workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === "MARK_VENDOR") {
            workingBoq[targetIndex].status = "Vendor Direct";
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === "REPLACE") {
            workingBoq[targetIndex].item = action.newValue.item;
            workingBoq[targetIndex].rate = action.newValue.rate;
            workingBoq[targetIndex].total =
              workingBoq[targetIndex].qty * action.newValue.rate;
            workingBoq[targetIndex].status = "Replaced";
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
            if (action.newValue.inclusions)
              workingBoq[targetIndex].inclusions = action.newValue.inclusions;
            if (action.newValue.exclusions)
              workingBoq[targetIndex].exclusions = action.newValue.exclusions;
          }
        }
      }
    });

    return workingBoq;
  }, [baselineBoq, actions]);

  // --- FINANCIAL CALCULATIONS ---
  const originalTotal = useMemo(
    () => baselineBoq.reduce((sum: number, item: any) => sum + item.total, 0),
    [baselineBoq],
  );

  usePageHeader({
    actions: currentSelectedTier ? (
      <button
        onClick={() => setShowBaselineModal(true)}
        className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-xl text-xs font-bold text-emerald-950 flex items-center gap-1.5 transition-all shadow-2xs hover:scale-[1.01] cursor-pointer"
        title="Click to view locked contractual Baseline BOQ scope"
      >
        <Lock className="w-3.5 h-3.5 text-emerald-600" />
        <span>Contract Baseline: {currentSelectedTier.name}</span>
        <span className="text-emerald-300">•</span>
        <span className="text-emerald-700">{formatINR(originalTotal)}</span>
      </button>
    ) : null
  }, [currentSelectedTier?.name, originalTotal]);
  const rawRevisedExecutionTotal = useMemo(
    () =>
      currentRevisionBoq.reduce((sum: number, item: any) => {
        if (
          item.status === "Vendor Direct" ||
          item.status === "Pending Decision"
        )
          return sum;
        return sum + item.total;
      }, 0),
    [currentRevisionBoq],
  );
  const asActualsTotal = useMemo(
    () =>
      currentRevisionBoq.reduce((sum: number, item: any) => {
        if (item.status === "Vendor Direct") return sum + item.total;
        return sum;
      }, 0),
    [currentRevisionBoq],
  );
  const pendingDecisionTotal = useMemo(
    () =>
      currentRevisionBoq.reduce((sum: number, item: any) => {
        if (item.status === "Pending Decision") return sum + item.total;
        return sum;
      }, 0),
    [currentRevisionBoq],
  );
  const rawRevisedDesignBaseTotal = useMemo(
    () =>
      currentRevisionBoq.reduce((sum: number, item: any) => {
        if (item.status === "Pending Decision") return sum;
        return sum + item.total;
      }, 0),
    [currentRevisionBoq],
  );

  const discounts = projectContext?.financials?.discounts || [];
  const calculateDiscountValue = (
    base: number,
    target: "execution" | "design",
  ) => {
    const targetDiscounts = discounts.filter((d) => d.target === target);
    let totalDeduction = 0;
    targetDiscounts.forEach((d) => {
      if (d.type === "percentage") {
        totalDeduction += base * (d.value / 100);
      } else {
        totalDeduction += d.value;
      }
    });
    return totalDeduction;
  };

  const originalExecutionDiscountVal = calculateDiscountValue(
    originalTotal,
    "execution",
  );
  const originalNetExecution = Math.max(
    0,
    originalTotal - originalExecutionDiscountVal,
  );

  const executionDiscountVal = calculateDiscountValue(
    rawRevisedExecutionTotal,
    "execution",
  );
  const revisedTotal = Math.max(
    0,
    rawRevisedExecutionTotal - executionDiscountVal,
  );
  const netDelta = revisedTotal - originalNetExecution;
  const isIncrease = netDelta > 0;

  const calculateDesignFee = (executionValue: number) => {
    if (projectContext?.designFeeType === "fixed_lumpsum")
      return projectContext.designFee || 0;
    if (projectContext?.designFeeType === "fixed_sqft")
      return (projectContext.designFee || 0) * (projectContext.area || 0);
    return executionValue * (designFeePercentage / 100);
  };

  const originalDesignFee = calculateDesignFee(originalTotal);
  const originalDesignDiscountVal = calculateDiscountValue(
    originalDesignFee,
    "design",
  );
  const originalNetDesign = Math.max(
    0,
    originalDesignFee - originalDesignDiscountVal,
  );

  const rawRevisedDesignFee = calculateDesignFee(rawRevisedDesignBaseTotal);
  const designDiscountVal = calculateDiscountValue(
    rawRevisedDesignFee,
    "design",
  );
  const revisedDesignFee = Math.max(0, rawRevisedDesignFee - designDiscountVal);
  const designFeeDelta = revisedDesignFee - originalNetDesign;

  // --- MILESTONE CALCULATIONS ---
  const activeTier = tiers.find((t) => t.id === activeTierId) || tiers[0];
  const paymentMilestones = projectContext?.paymentMilestones || [];

  const executionMilestones = paymentMilestones.filter(
    (m) => m.type === "execution",
  );
  const designMilestones = paymentMilestones.filter((m) => m.type === "design");

  const paidExecutionMilestones = executionMilestones.filter(
    (m) => m.status === "paid" || m.status === "invoiced",
  );
  const unpaidExecutionMilestones = executionMilestones.filter(
    (m) => m.status !== "paid" && m.status !== "invoiced",
  );

  let lockedExecutionBase = 0;
  paidExecutionMilestones.forEach((m) => {
    if (m.isFixedAmount && m.fixedAmount !== undefined) {
      lockedExecutionBase += m.fixedAmount;
    } else {
      lockedExecutionBase +=
        (m.lockedTaxableBase || originalNetExecution) * (m.percentage / 100);
    }
  });
  const remainingExecutionBase = revisedTotal - lockedExecutionBase;

  const paidDesignMilestones = designMilestones.filter(
    (m) => m.status === "paid" || m.status === "invoiced",
  );
  const unpaidDesignMilestones = designMilestones.filter(
    (m) => m.status !== "paid" && m.status !== "invoiced",
  );

  let lockedDesignBase = 0;
  paidDesignMilestones.forEach((m) => {
    if (m.isFixedAmount && m.fixedAmount !== undefined) {
      lockedDesignBase += m.fixedAmount;
    } else {
      lockedDesignBase +=
        (m.lockedTaxableBase || originalNetDesign) * (m.percentage / 100);
    }
  });
  const remainingDesignBase = revisedDesignFee - lockedDesignBase;

  const calculateMilestone = (
    m: PaymentMilestone,
    isExecution: boolean,
    idx: number,
  ) => {
    const financials = projectContext?.financials;
    const gstRate = projectContext?.gstRate || 18;
    const billablePercent = financials?.billablePercent ?? 100;
    const executionGstEnabled = financials?.executionGstEnabled ?? true;
    const initiationFee = financials?.initiationFeePaid || 0;

    const isCleared = m.status === "paid" || m.status === "invoiced";

    // Original Calculation
    let originalBaseAmount = 0;
    if (m.isFixedAmount && m.fixedAmount !== undefined) {
      originalBaseAmount = m.fixedAmount;
    } else {
      originalBaseAmount = isExecution
        ? originalNetExecution * (m.percentage / 100)
        : originalNetDesign * (m.percentage / 100);
    }
    
    originalBaseAmount = Math.round(originalBaseAmount);

    let originalBillable = Math.round(isExecution
      ? originalBaseAmount * (billablePercent / 100)
      : originalBaseAmount);
    let originalCash = Math.round(isExecution
      ? originalBaseAmount * (Math.max(0, 100 - billablePercent) / 100)
      : 0);
    const applicableGstRate = isExecution
      ? executionGstEnabled
        ? gstRate
        : 0
      : gstRate;
    let originalGST = Math.round(originalBillable * (applicableGstRate / 100));
    let originalTotal = Math.round(originalBillable + originalCash + originalGST);

    // Revised Calculation
    let revisedBaseAmount = 0;
    if (isExecution) {
      if (isCleared) {
        revisedBaseAmount = m.isFixedAmount && m.fixedAmount !== undefined
          ? m.fixedAmount
          : (m.lockedTaxableBase || originalNetExecution) * (m.percentage / 100);
      } else {
        if (m.isFixedAmount && m.fixedAmount !== undefined) {
          revisedBaseAmount = m.fixedAmount;
        } else {
          const fixedPendingTotal = unpaidExecutionMilestones.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
          const remainingBaseForPercentages = Math.max(0, remainingExecutionBase - fixedPendingTotal);
          
          const unpaidPctExcludingFixed = unpaidExecutionMilestones.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
          const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
          revisedBaseAmount = remainingBaseForPercentages * relativePct;
        }
      }
    } else {
      if (isCleared) {
        revisedBaseAmount = m.isFixedAmount && m.fixedAmount !== undefined
          ? m.fixedAmount
          : (m.lockedTaxableBase || originalNetDesign) * (m.percentage / 100);
      } else {
        if (m.isFixedAmount && m.fixedAmount !== undefined) {
          revisedBaseAmount = m.fixedAmount;
        } else {
          const fixedPendingTotal = unpaidDesignMilestones.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
          const remainingBaseForPercentages = Math.max(0, remainingDesignBase - fixedPendingTotal);
          
          const unpaidPctExcludingFixed = unpaidDesignMilestones.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
          const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
          revisedBaseAmount = remainingBaseForPercentages * relativePct;
        }
      }
    }

    revisedBaseAmount = Math.round(revisedBaseAmount);

    let revisedBillable = Math.round(isExecution
      ? revisedBaseAmount * (billablePercent / 100)
      : revisedBaseAmount);
    let revisedCash = Math.round(isExecution
      ? revisedBaseAmount * (Math.max(0, 100 - billablePercent) / 100)
      : 0);
    let revisedGST = Math.round(revisedBillable * (applicableGstRate / 100));
    let revisedTotal = Math.round(revisedBillable + revisedCash + revisedGST);

    let deductedInitiationFee = 0;
    if (!isExecution && idx === 0 && initiationFee > 0) {
      deductedInitiationFee = Math.min(originalTotal, initiationFee);
      originalTotal = Math.max(0, originalTotal - initiationFee);
      revisedTotal = Math.max(0, revisedTotal - initiationFee);
    }

    return {
      originalTaxable: originalBillable,
      originalGst: originalGST,
      originalTotal: originalTotal,
      revisedTaxable: revisedBillable,
      revisedGst: revisedGST,
      revisedTotal: revisedTotal,
      deductedInitiationFee,
      isCleared,
    };
  };

  const handleAddAction = (
    action: Omit<RevisionAction, "id" | "timestamp">,
  ) => {
    const newAction: RevisionAction = {
      ...action,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    };
    setActions([...actions, newAction]);
  };

  const handleUndo = () => {
    setActions(actions.slice(0, -1));
  };

  const handleApplyManualAction = () => {
    if (manualForm.type === "ADD") {
      if (!manualForm.newItemName || !manualForm.newSection)
        return showToast("Please provide section and item name.");
      handleAddAction({
        type: "ADD",
        section: manualForm.newSection,
        item: manualForm.newItemName,
        newValue: {
          unit: manualForm.newUnit,
          qty: Number(manualForm.newQty),
          rate: Number(manualForm.newRate),
          inclusions: manualForm.inclusions
            ? manualForm.inclusions.split("\n").filter((s) => s.trim())
            : [],
          exclusions: manualForm.exclusions
            ? manualForm.exclusions.split("\n").filter((s) => s.trim())
            : [],
        },
        reasonCategory: manualForm.reasonCategory,
        note: manualForm.note,
      });
    } else {
      if (!manualForm.targetItemId)
        return showToast("Please select a target item.");
      const existingItem = currentRevisionBoq.find(
        (i: any) => i.id === manualForm.targetItemId,
      );
      if (!existingItem)
        return showToast("Item not found in current revision.");

      let newValue: any = null;
      let oldValue: any = null;

      if (manualForm.type === "REVISE_QTY") {
        newValue = Number(manualForm.newQty);
        oldValue = existingItem.qty;
      } else if (manualForm.type === "REVISE_RATE") {
        newValue = Number(manualForm.newRate);
        oldValue = existingItem.rate;
      } else if (manualForm.type === "REPLACE") {
        if (!manualForm.newItemName)
          return showToast("Please provide a new item name for replacement.");
        newValue = {
          item: manualForm.newItemName,
          rate: Number(manualForm.newRate),
          inclusions: manualForm.inclusions
            ? manualForm.inclusions.split("\n").filter((s) => s.trim())
            : [],
          exclusions: manualForm.exclusions
            ? manualForm.exclusions.split("\n").filter((s) => s.trim())
            : [],
        };
        oldValue = { item: existingItem.item, rate: existingItem.rate };
      }

      handleAddAction({
        type: manualForm.type,
        targetId: existingItem.id,
        section: existingItem.section,
        item: existingItem.item,
        oldValue,
        newValue,
        reasonCategory: manualForm.reasonCategory,
        note: manualForm.note,
      });
    }

    // Reset some form fields
    setManualForm((prev) => ({
      ...prev,
      note: "",
      newQty: 1,
      newRate: 0,
      newItemName: "",
    }));
  };

  const formatChangeDetail = (action: RevisionAction) => {
    if (action.type === "ADD") {
      return (
        <span className="text-emerald-600 font-medium">
          Added: {action.newValue.qty} {action.newValue.unit} @{" "}
          {formatINR(action.newValue.rate)}
        </span>
      );
    }
    if (action.type === "REMOVE") {
      return <span className="text-rose-600 font-medium">Removed</span>;
    }
    if (action.type === "REVISE_QTY") {
      return (
        <>
          <span className="line-through text-slate-400 mr-2">
            {action.oldValue}
          </span>
          <span className="text-[#0066CC] font-medium">
            ➔ {action.newValue}
          </span>
        </>
      );
    }
    if (action.type === "REVISE_RATE") {
      return (
        <>
          <span className="line-through text-slate-400 mr-2">
            {formatINR(action.oldValue)}
          </span>
          <span className="text-[#0066CC] font-medium">
            ➔ {formatINR(action.newValue)}
          </span>
        </>
      );
    }
    if (action.type === "REPLACE") {
      return (
        <div className="text-xs">
          <div className="line-through text-slate-400">
            {action.oldValue.item} ({formatINR(action.oldValue.rate)})
          </div>
          <div className="text-[#0066CC] font-medium">
            ➔ {action.newValue.item} ({formatINR(action.newValue.rate)})
          </div>
        </div>
      );
    }
    if (
      action.type === "MARK_PENDING" ||
      action.type === "MARK_VENDOR" ||
      action.type === "APPROVE_PENDING"
    ) {
      return (
        <span className="text-purple-600 font-medium">Status Updated</span>
      );
    }
    return null;
  };

  const renderBaseline = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500" />
            <h3 className="text-lg font-bold text-slate-900">Baseline BOQ</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Contractual Source of Truth. Locked & read-only approved scope.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200/80 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Approved Baseline</span>
          </div>
          <div className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold">
            {baselineBoq.length} Line Items
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Total Baseline Value
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {formatINR(originalTotal)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Excl. taxes & milestone deductions</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Total Scope Sections
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {new Set(baselineBoq.map((i: any) => i.section)).size}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Space & trade breakdown</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Active Baseline Version
          </div>
          <div className="text-base font-bold text-[#0066CC] truncate">
            {currentSelectedTier?.name || "Contract Baseline"}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Approved contract specification</div>
        </div>
      </div>

      <Card className="p-0 border border-slate-200/80 shadow-sm overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100/70 text-slate-700 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-5 py-3.5">Section</th>
                <th className="px-5 py-3.5">Item Name & Details</th>
                <th className="px-5 py-3.5 text-right">Quantity</th>
                <th className="px-5 py-3.5 text-right">Rate (₹)</th>
                <th className="px-5 py-3.5 text-right">Total Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {baselineBoq.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3 text-xs font-semibold text-slate-600">
                    <span className="px-2.5 py-1 bg-slate-100 rounded-md">
                      {item.section}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-semibold text-slate-800">
                    {item.item}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600 font-medium">
                    {item.qty} <span className="text-xs text-slate-400 font-normal">{item.unit}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600 font-medium">
                    {formatINR(item.rate)}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900">
                    {formatINR(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  const renderActionEntry = () => {
    const actionTypes: { type: ActionType; label: string; icon: any; color: string }[] = [
      { type: "ADD", label: "+ Add Item", icon: PlusCircle, color: "hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50" },
      { type: "REVISE_QTY", label: "✎ Revise Qty", icon: Edit3, color: "hover:border-amber-500 hover:text-amber-700 hover:bg-amber-50" },
      { type: "REVISE_RATE", label: "⚡ Revise Rate", icon: TrendingUp, color: "hover:border-[#0066CC] hover:text-[#0055B3] hover:bg-sky-50" },
      { type: "REPLACE", label: "⇄ Replace Item", icon: RefreshCw, color: "hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50" },
      { type: "REMOVE", label: "⛔ Remove", icon: Trash2, color: "hover:border-rose-500 hover:text-rose-700 hover:bg-rose-50" },
      { type: "MARK_PENDING", label: "❓ Mark Pending", icon: HelpCircle, color: "hover:border-purple-500 hover:text-purple-700 hover:bg-purple-50" },
      { type: "APPROVE_PENDING", label: "✓ Approve Pending", icon: CheckCircle2, color: "hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50" },
      { type: "MARK_VENDOR", label: "🏬 Vendor Direct", icon: FileText, color: "hover:border-slate-500 hover:text-slate-700 hover:bg-slate-100" },
    ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-5">
          {/* Version & Target Scope Control Panel */}
          {availableVersions.length > 0 && (
            <Card className="p-4 border border-slate-200/90 bg-white shadow-xs rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-800 text-xs font-bold">
                  <History className="w-3.5 h-3.5 text-[#0066CC]" />
                  <span>Proposal / Version Target:</span>
                </div>
                {currentSelectedTier && (
                  <span className="text-[11px] font-extrabold text-[#0055B3] bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                    {formatINR(currentSelectedTier.executionValue)}
                  </span>
                )}
              </div>

              <div className="relative">
                <select
                  value={selectedTierId || ""}
                  onChange={(e) => setSelectedTierId(e.target.value)}
                  className="w-full appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-900 font-bold text-xs pl-3 pr-8 py-2 rounded-xl focus:ring-2 focus:ring-[#0066CC] transition-all cursor-pointer"
                >
                  {availableVersions.map((ver) => (
                    <option key={ver.id} value={ver.id}>
                      {ver.name} ({formatINR(ver.executionValue)}) {ver.isApproved ? "— [APPROVED BASELINE]" : ver.lifecycleTag ? `— [${ver.lifecycleTag}]` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                {currentSelectedTier &&
                  currentSelectedTier.id !== projectContext?.approvedTierId ? (
                    <button
                      onClick={() => handleSetAsActiveBaseline(currentSelectedTier.id)}
                      className="flex-1 py-1.5 px-2 text-[11px] font-bold text-white bg-[#0066CC] hover:bg-[#0055B3] rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Set Active Baseline</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md flex items-center gap-1 border border-emerald-200/60">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Active Contract Baseline
                    </span>
                  )}

                {actions.length > 0 && currentSelectedTier && (
                  <button
                    onClick={() => handleSyncFromTier(currentSelectedTier.id)}
                    className="py-1.5 px-2.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all flex items-center gap-1"
                    title="Clear draft actions"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reset ({actions.length})</span>
                  </button>
                )}
              </div>
            </Card>
          )}

          {/* Manual Action Form */}
          <Card className="p-5 border border-slate-200/80 bg-white shadow-sm rounded-2xl">
            <h4 className="font-bold text-slate-900 text-sm mb-3.5">
              Scope Workbench & Action Entry
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Select Action Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {actionTypes.map((act) => {
                    const isSelected = manualForm.type === act.type;
                    return (
                      <button
                        key={act.type}
                        type="button"
                        onClick={() =>
                          setManualForm({
                            ...manualForm,
                            type: act.type,
                          })
                        }
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border text-left flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-[#0066CC] border-[#0066CC] text-white shadow-xs"
                            : `bg-slate-50/80 border-slate-200 text-slate-700 ${act.color}`
                        }`}
                      >
                        <act.icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{act.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {manualForm.type !== "ADD" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Target BOQ Item
                  </label>
                  <select
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50/50 focus:ring-2 focus:ring-[#0066CC]"
                    value={manualForm.targetItemId}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        targetItemId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select item from current BOQ...</option>
                    {currentRevisionBoq
                      .filter((i: any) => i.status !== "Removed")
                      .map((item: any, idx: number) => (
                        <option key={idx} value={item.id}>
                          [{item.section}] {item.item} ({formatINR(item.total)})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {manualForm.type === "ADD" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Space / Section
                    </label>
                    <input
                      type="text"
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                      placeholder="e.g. Living Room, Master Bedroom"
                      value={manualForm.newSection}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          newSection: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      New Item Description
                    </label>
                    <input
                      type="text"
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                      placeholder="e.g. Cove lighting with Philips LED strip"
                      value={manualForm.newItemName}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          newItemName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Unit
                      </label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                        placeholder="sqft / RFT"
                        value={manualForm.newUnit}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            newUnit: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                        value={manualForm.newQty}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            newQty: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Rate (₹)
                      </label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                        value={manualForm.newRate}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            newRate: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {manualForm.type === "REVISE_QTY" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Updated Quantity
                  </label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                    value={manualForm.newQty}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        newQty: Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {manualForm.type === "REVISE_RATE" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Updated Rate (₹)
                  </label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                    value={manualForm.newRate}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        newRate: Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {manualForm.type === "REPLACE" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Replacement Item Name
                    </label>
                    <input
                      type="text"
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                      placeholder="e.g. Veneer Paneling instead of Laminate"
                      value={manualForm.newItemName}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          newItemName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        New Qty
                      </label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                        value={manualForm.newQty}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            newQty: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        New Rate (₹)
                      </label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                        value={manualForm.newRate}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            newRate: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason Category
                </label>
                <select
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50/50"
                  value={manualForm.reasonCategory}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      reasonCategory: e.target.value,
                    })
                  }
                >
                  <option value="Client Preference">Client Preference</option>
                  <option value="Site Condition">Site Condition</option>
                  <option value="Design Refinement">Design Refinement</option>
                  <option value="Budget Alignment">Budget Alignment</option>
                  <option value="Vendor Substitution">Vendor Substitution</option>
                </select>
              </div>

              {(manualForm.type === "ADD" || manualForm.type === "REPLACE") && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Inclusions (One per line)
                    </label>
                    <textarea
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs h-16 resize-none focus:ring-2 focus:ring-[#0066CC]"
                      placeholder="Premium hardware&#10;Soft-close hinges"
                      value={manualForm.inclusions}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          inclusions: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Exclusions (One per line)
                    </label>
                    <textarea
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs h-16 resize-none focus:ring-2 focus:ring-[#0066CC]"
                      placeholder="Civil modifications&#10;Electrical wiring"
                      value={manualForm.exclusions}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          exclusions: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Revision Notes (Optional Context)
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0066CC]"
                  placeholder="e.g. Agreed in site meeting on 12th Oct"
                  value={manualForm.note}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, note: e.target.value })
                  }
                />
              </div>

              <button
                className="w-full py-3 bg-[#0066CC] text-white rounded-xl font-bold text-xs hover:bg-[#0055B3] transition-all shadow-sm flex items-center justify-center gap-2"
                onClick={handleApplyManualAction}
              >
                <PlusCircle className="w-4 h-4" />
                <span>Apply Change Action</span>
              </button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">
                  Live Revised BOQ Preview
                </h4>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                  {actions.length} Staged Actions
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time calculated BOQ impact with staged modifications.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                  netDelta > 0
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : netDelta < 0
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {netDelta > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                ) : netDelta < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                ) : null}
                <span>
                  {netDelta === 0
                    ? "No Net Change"
                    : `${netDelta > 0 ? "+" : ""}${formatINR(netDelta)}`}
                </span>
              </div>

              {actions.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUndo}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Undo Last</span>
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to delete all revision actions? This cannot be undone.",
                        )
                      ) {
                        setActions([]);
                        showToast("All actions cleared.");
                      }
                    }}
                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <Card className="p-0 overflow-hidden border border-slate-200/80 shadow-sm rounded-2xl h-[820px] flex flex-col bg-white">
            <div className="overflow-y-auto flex-grow">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/80 text-slate-700 sticky top-0 border-b border-slate-200 z-10 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Item Description</th>
                    <th className="px-4 py-3 text-right">Qty & Unit</th>
                    <th className="px-4 py-3 text-right">Revised Amount (₹)</th>
                    <th className="px-4 py-3">Status Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(new Set(currentRevisionBoq.map((r: any) => r.section))).map((section: any) => {
                    const sectionItems = currentRevisionBoq.filter((r: any) => r.section === section);
                    return (
                      <React.Fragment key={section}>
                        <tr className="bg-slate-50/90 font-bold border-y border-slate-200/60">
                          <td colSpan={4} className="px-4 py-2 text-[11px] text-slate-700 uppercase tracking-wider">
                            {section}
                          </td>
                        </tr>
                        {sectionItems.map((item: any, idx: number) => {
                          let rowClass = "hover:bg-slate-50/80";
                          if (item.status === "Added")
                            rowClass += " bg-emerald-50/40";
                          if (item.status === "Removed")
                            rowClass += " bg-rose-50/40 opacity-50 line-through";
                          if (item.status === "Revised" || item.status === "Replaced")
                            rowClass += " bg-amber-50/40";
                          if (item.status === "Pending Decision")
                            rowClass += " bg-purple-50/40";

                          return (
                            <tr key={`${section}-${idx}`} className={rowClass}>
                              <td className="px-4 py-3 pl-6">
                                <div className="font-semibold text-slate-800">
                                  {item.item}
                                </div>
                                {item.note && (
                                  <div className="text-[11px] text-slate-500 mt-0.5 italic">
                                    "{item.note}"
                                  </div>
                                )}
                                {item.status === "Vendor Direct" && (
                                  <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                    Billed at actuals — estimate only
                                  </div>
                                )}
                                {item.status === "Pending Decision" && (
                                  <div className="text-[10px] text-purple-600 font-semibold mt-0.5">
                                    Awaiting client confirmation
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600 font-medium">
                                {item.qty} <span className="text-[10px] text-slate-400">{item.unit}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                {formatINR(item.total)}
                              </td>
                              <td className="px-4 py-3 border-l border-slate-100">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    item.status === "Approved"
                                      ? "bg-slate-100 text-slate-600"
                                      : item.status === "Added"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : item.status === "Removed"
                                          ? "bg-rose-100 text-rose-800 font-semibold"
                                          : item.status === "Vendor Direct"
                                            ? "bg-slate-100 text-slate-700"
                                            : item.status === "Pending Decision"
                                              ? "border border-purple-300 text-purple-800 bg-purple-50"
                                              : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {item.status === "Vendor Direct"
                                    ? "Vendor direct"
                                    : item.status === "Pending Decision"
                                      ? "Pending decision"
                                      : item.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const renderChangeLog = () => (
    <div className="space-y-6">
      <Card className="p-0 overflow-hidden border border-slate-200/80 shadow-sm rounded-2xl bg-white">
        <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/80 flex justify-between items-center flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#0066CC]" />
              <h3 className="font-bold text-slate-900 text-sm">
                Structured Audit & Change Log
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete chronological audit trail of all revision actions applied to this project.
            </p>
          </div>
          <button
            onClick={() => exportToExcel("internal")}
            className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Log to Excel</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/60 text-slate-600 border-b border-slate-200 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Action Type</th>
                <th className="px-4 py-3">Target / New Item</th>
                <th className="px-4 py-3">Change Variance</th>
                <th className="px-4 py-3">Reason Category</th>
                <th className="px-4 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {actions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-slate-400 font-medium"
                  >
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    No revision actions recorded yet in this workspace session.
                  </td>
                </tr>
              ) : (
                [...actions].reverse().map((action) => (
                  <tr key={action.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                      {new Date(action.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold tracking-wider uppercase border border-slate-200/60">
                        {action.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {action.item}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {formatChangeDetail(action)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-medium">
                      <span className="px-2 py-0.5 bg-sky-50 text-[#0055B3] rounded-md text-[10px] font-bold">
                        {action.reasonCategory || "Uncategorized"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              "Delete this specific revision action?",
                            )
                          ) {
                            setActions((prev) =>
                              prev.filter((a) => a.id !== action.id),
                            );
                            showToast("Action deleted successfully.");
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Action"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden border border-slate-200/80 shadow-sm rounded-2xl bg-white">
        <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0066CC]" />
            <h3 className="font-bold text-slate-900 text-sm">
              Generated Scope Annexures
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Annexures created upon syncing revisions into distinct version tiers.
          </p>
        </div>
        <div className="p-5">
          {tiers.filter((t) => t.name.startsWith("Annexure")).length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs italic">
              No scope annexures generated yet. Click "Sync Revision as New Tier" when staged changes are complete.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tiers
                .filter((t) => t.name.startsWith("Annexure"))
                .map((tier, index) => (
                  <div
                    key={`${tier.id}-${index}`}
                    className="flex items-center justify-between p-4 border border-slate-200/80 rounded-xl bg-slate-50/50 hover:bg-white transition-all shadow-2xs"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">
                        {tier.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {tier.summary?.itemCount || 0} items •{" "}
                        <span className="font-bold text-slate-800">{formatINR(tier.summary?.totalSell || 0)}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            "Are you sure you want to delete this annexure? This cannot be undone.",
                          )
                        ) {
                          if (setTiers) {
                            setTiers((prev) =>
                              prev.filter((t) => t.id !== tier.id),
                            );
                            showToast("Annexure deleted successfully.");
                          }
                        }
                      }}
                      className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                      title="Delete Annexure"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  const exportToExcel = async (type: "client" | "internal") => {
    try {
      let exportData: any[] = [];
      let sheetName = "BOQ Revision";

      if (type === "client") {
        const originalTotal = baselineBoq.reduce(
          (sum: number, item: any) => sum + item.total,
          0,
        );
        const rawRevisedExecutionTotal = currentRevisionBoq.reduce(
          (sum: number, item: any) => {
            if (
              item.status === "Vendor Direct" ||
              item.status === "Pending Decision"
            )
              return sum;
            return sum + item.total;
          },
          0,
        );
        const rawRevisedDesignBaseTotal = currentRevisionBoq.reduce(
          (sum: number, item: any) => {
            if (item.status === "Pending Decision") return sum;
            return sum + item.total;
          },
          0,
        );

        const discounts = projectContext?.financials?.discounts || [];
        const calculateDiscountValue = (
          base: number,
          target: "execution" | "design",
        ) => {
          const targetDiscounts = discounts.filter((d) => d.target === target);
          let totalDeduction = 0;
          targetDiscounts.forEach((d) => {
            if (d.type === "percentage") {
              totalDeduction += base * (d.value / 100);
            } else {
              totalDeduction += d.value;
            }
          });
          return totalDeduction;
        };

        const originalExecutionDiscountVal = calculateDiscountValue(
          originalTotal,
          "execution",
        );
        const originalNetExecution = Math.max(
          0,
          originalTotal - originalExecutionDiscountVal,
        );

        const executionDiscountVal = calculateDiscountValue(
          rawRevisedExecutionTotal,
          "execution",
        );
        const revisedTotal = Math.max(
          0,
          rawRevisedExecutionTotal - executionDiscountVal,
        );
        const netDelta = revisedTotal - originalNetExecution;

        const calculateDesignFee = (executionValue: number) => {
          if (projectContext?.designFeeType === "fixed_lumpsum")
            return projectContext.designFee || 0;
          if (projectContext?.designFeeType === "fixed_sqft")
            return (projectContext.designFee || 0) * (projectContext.area || 0);
          return executionValue * (designFeePercentage / 100);
        };

        const originalDesignFee = calculateDesignFee(originalTotal);
        const originalDesignDiscountVal = calculateDiscountValue(
          originalDesignFee,
          "design",
        );
        const originalNetDesign = Math.max(
          0,
          originalDesignFee - originalDesignDiscountVal,
        );

        const rawRevisedDesignFee = calculateDesignFee(
          rawRevisedDesignBaseTotal,
        );
        const designDiscountVal = calculateDiscountValue(
          rawRevisedDesignFee,
          "design",
        );
        const revisedDesignFee = Math.max(
          0,
          rawRevisedDesignFee - designDiscountVal,
        );
        const designFeeDelta = revisedDesignFee - originalNetDesign;

        exportData.push({
          Section: "EXECUTIVE SUMMARY",
          Item: "",
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
          Inclusions: "",
          Exclusions: "",
        });
        exportData.push({
          Section: "Original BOQ Total",
          Item: `${formatINR(originalTotal)}`,
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });
        exportData.push({
          Section: "Revised BOQ Total (Pre-discount)",
          Item: `${formatINR(rawRevisedExecutionTotal)}`,
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });
        if (executionDiscountVal > 0) {
          exportData.push({
            Section: "Execution Discounts Applied",
            Item: `-${formatINR(executionDiscountVal)}`,
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
        }
        exportData.push({
          Section: "Net Revised BOQ Total",
          Item: `${formatINR(revisedTotal)}`,
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });
        exportData.push({
          Section: "Net BOQ Variance",
          Item: `${formatINR(netDelta)}`,
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });
        exportData.push({
          Section: `Original Design Fee ${!projectContext?.designFeeType || projectContext?.designFeeType === "percentage" ? `(${designFeePercentage}%)` : "(Fixed)"}`,
          Item: `${formatINR(originalDesignFee)}`,
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });

        const asActualsTotal = currentRevisionBoq.reduce(
          (sum: number, item: any) => {
            if (item.status === "Vendor Direct") return sum + item.total;
            return sum;
          },
          0,
        );

        const pendingDecisionTotal = currentRevisionBoq.reduce(
          (sum: number, item: any) => {
            if (item.status === "Pending Decision") return sum + item.total;
            return sum;
          },
          0,
        );

        if (
          !projectContext?.designFeeType ||
          projectContext?.designFeeType === "percentage"
        ) {
          exportData.push({
            Section: "As Actuals (Vendor Direct)",
            Item: `${formatINR(asActualsTotal)}`,
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
          if (pendingDecisionTotal > 0) {
            exportData.push({
              Section: "Pending Decision (Excluded)",
              Item: `${formatINR(pendingDecisionTotal)}`,
              "Original Quantity": "",
              "Original Rate": "",
              "Original Total": "",
              "Revised Quantity": "",
              "Revised Rate": "",
              "Revised Total": "",
              Status: "",
              "Reason / Notes": "",
            });
          }
          exportData.push({
            Section: "Total Design Base",
            Item: `${formatINR(rawRevisedDesignBaseTotal)}`,
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
        }

        exportData.push({
          Section: `Revised Design Fee (Pre-discount)`,
          Item: `${formatINR(rawRevisedDesignFee)}`,
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });
        if (designDiscountVal > 0) {
          exportData.push({
            Section: "Design Discounts Applied",
            Item: `-${formatINR(designDiscountVal)}`,
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
        }
        exportData.push({
          Section: `Net Revised Design Fee`,
          Item: `${formatINR(revisedDesignFee)}`,
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });
        if (initiationFee > 0) {
          exportData.push({
            Section: `Less: Initiation Fee Paid`,
            Item: `-${formatINR(initiationFee)}`,
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
          exportData.push({
            Section: `Balance Design Fee`,
            Item: `${formatINR(revisedDesignFee - initiationFee)}`,
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
        }
        exportData.push({
          Section: "Net Design Fee Variance",
          Item: `${formatINR(designFeeDelta)}`,
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });
        exportData.push({
          Section: "",
          Item: "",
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });

        const activeTier = tiers.find((t) => t.id === activeTierId) || tiers[0];
        const paymentMilestones = projectContext?.paymentMilestones || [];
        const designMilestones = paymentMilestones.filter(
          (m) => m.type === "design",
        );
        const executionMilestones = paymentMilestones.filter(
          (m) => m.type === "execution",
        );

        if (designMilestones.length > 0) {
          exportData.push({
            Section: "UPDATED PAYMENT STAGES - DESIGN",
            Item: "",
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
          exportData.push({
            Section: "Milestone",
            Item: "Percentage",
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "Original Total",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "Revised Total",
            Status: "Status",
            "Reason / Notes": "Variance",
          });
          designMilestones.forEach((m, idx) => {
            if (!m) return;
            const current = calculateMilestone(m, false, idx);
            const variance = current.revisedTotal - current.originalTotal;
            if (current.deductedInitiationFee > 0) {
              exportData.push({
                Section: m.name + " (Gross)",
                Item: `${m.percentage}%`,
                "Original Quantity": "",
                "Original Rate": "",
                "Original Total": `${formatINR(Math.round(current.originalTotal + current.deductedInitiationFee))}`,
                "Revised Quantity": "",
                "Revised Rate": "",
                "Revised Total": `${formatINR(Math.round(current.revisedTotal + current.deductedInitiationFee))}`,
                Status: current.isCleared
                  ? m.status === "paid"
                    ? "Paid"
                    : "Invoiced"
                  : "Open",
                "Reason / Notes": "",
              });
              exportData.push({
                Section: "↳ Less: Project Initiation Fee (Paid)",
                Item: "-",
                "Original Quantity": "",
                "Original Rate": "",
                "Original Total": `-${formatINR(Math.round(current.deductedInitiationFee))}`,
                "Revised Quantity": "",
                "Revised Rate": "",
                "Revised Total": `-${formatINR(Math.round(current.deductedInitiationFee))}`,
                Status: "Paid",
                "Reason / Notes": "",
              });
              exportData.push({
                Section: "↳ Balance Payable",
                Item: "-",
                "Original Quantity": "",
                "Original Rate": "",
                "Original Total": `${formatINR(Math.round(current.originalTotal))}`,
                "Revised Quantity": "",
                "Revised Rate": "",
                "Revised Total": `${formatINR(Math.round(current.revisedTotal))}`,
                Status: current.isCleared
                  ? m.status === "paid"
                    ? "Paid"
                    : "Invoiced"
                  : "Open",
                "Reason / Notes": `${variance > 0 ? "+" : ""}${variance !== 0 ? `${formatINR(Math.round(variance))}` : "-"}`,
              });
            } else {
              exportData.push({
                Section: m.name,
                Item: `${m.percentage}%`,
                "Original Quantity": "",
                "Original Rate": "",
                "Original Total": `${formatINR(Math.round(current.originalTotal))}`,
                "Revised Quantity": "",
                "Revised Rate": "",
                "Revised Total": `${formatINR(Math.round(current.revisedTotal))}`,
                Status: current.isCleared
                  ? m.status === "paid"
                    ? "Paid"
                    : "Invoiced"
                  : "Open",
                "Reason / Notes": `${variance > 0 ? "+" : ""}${variance !== 0 ? `${formatINR(Math.round(variance))}` : "-"}`,
              });
            }
          });
          exportData.push({
            Section: "",
            Item: "",
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
        }

        if (executionMilestones.length > 0) {
          exportData.push({
            Section: "UPDATED PAYMENT STAGES - EXECUTION",
            Item: "",
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
          exportData.push({
            Section: "Milestone",
            Item: "Percentage",
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "Original Total",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "Revised Total",
            Status: "Status",
            "Reason / Notes": "Variance",
          });
          executionMilestones.forEach((m, idx) => {
            if (!m) return;
            const current = calculateMilestone(m, true, idx);
            const variance = current.revisedTotal - current.originalTotal;
            exportData.push({
              Section: m.name,
              Item: `${m.percentage}%`,
              "Original Quantity": "",
              "Original Rate": "",
              "Original Total": `${formatINR(Math.round(current.originalTotal))}`,
              "Revised Quantity": "",
              "Revised Rate": "",
              "Revised Total": `${formatINR(Math.round(current.revisedTotal))}`,
              Status: current.isCleared
                ? m.status === "paid"
                  ? "Paid"
                  : "Invoiced"
                : "Open",
              "Reason / Notes": `${variance > 0 ? "+" : ""}${variance !== 0 ? `${formatINR(Math.round(variance))}` : "-"}`,
            });
          });
          exportData.push({
            Section: "",
            Item: "",
            "Original Quantity": "",
            "Original Rate": "",
            "Original Total": "",
            "Revised Quantity": "",
            "Revised Rate": "",
            "Revised Total": "",
            Status: "",
            "Reason / Notes": "",
          });
        }

        exportData.push({
          Section: "DETAILED BREAKDOWN",
          Item: "",
          "Original Quantity": "",
          "Original Rate": "",
          "Original Total": "",
          "Revised Quantity": "",
          "Revised Rate": "",
          "Revised Total": "",
          Status: "",
          "Reason / Notes": "",
        });

        const itemizedData = currentRevisionBoq.map((r: any) => {
          const originalItem = baselineBoq.find((b: any) => b.id === r.id);
          const originalTotal = originalItem ? originalItem.total : 0;
          const originalQty = originalItem ? originalItem.qty : 0;
          const originalRate = originalItem ? originalItem.rate : 0;

          let statusText = "As per agreed design";
          if (r.status === "Added")
            statusText = "Added based on design development";
          else if (r.status === "Removed") statusText = "Removed from scope";
          else if (r.status === "Revised" || r.status === "Replaced")
            statusText = "Revised as per final design";
          else if (r.status === "Pending Decision")
            statusText = "Pending client confirmation";
          else if (r.status === "Vendor Direct")
            statusText = "As Actuals (Vendor Direct)";

          return {
            Section: r.section,
            Item: r.item,
            "Original Quantity": originalQty,
            "Original Rate": originalRate,
            "Original Total": originalTotal,
            "Revised Quantity": r.qty,
            "Revised Rate": r.rate,
            "Revised Total":
              r.status === "Vendor Direct" ? "As Actuals" : r.total,
            Status: statusText,
            "Reason / Notes":
              (r.reasonCategory ? `[${r.reasonCategory}] ` : "") +
              (r.note || ""),
            Inclusions: r.inclusions ? r.inclusions.join("\n") : "",
            Exclusions: r.exclusions ? r.exclusions.join("\n") : "",
          };
        });

        exportData = exportData.concat(itemizedData);

        baselineBoq.forEach((b: any) => {
          const exists = currentRevisionBoq.find((r: any) => r.id === b.id);
          if (!exists) {
            exportData.push({
              Section: b.section,
              Item: b.item,
              "Original Quantity": b.qty,
              "Original Rate": b.rate,
              "Original Total": b.total,
              "Revised Quantity": 0,
              "Revised Rate": 0,
              "Revised Total": 0,
              Status: "Removed",
              "Reason / Notes": "",
              Inclusions: b.inclusions ? b.inclusions.join("\n") : "",
              Exclusions: b.exclusions ? b.exclusions.join("\n") : "",
            });
          }
        });
      } else {
        sheetName = "Change Log";
        exportData = [...actions].reverse().map((action) => ({
          Time: new Date(action.timestamp).toLocaleString(),
          "Action Type": action.type,
          Section: action.section,
          Item: action.item,
          "Change Detail": formatChangeDetail(action),
          "Reason Category": action.reasonCategory,
          Note: action.note || "",
        }));
      }

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BOQ_Revision_${type}.xlsx`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error("Error generating Excel:", err);
      showToast(
        "Could not generate Excel. Please ensure your browser allows downloads.",
      );
    }
  };

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const marginX = 20;

      // Gemini Enrichment Step
      showToast("Generating PDF... Analyzing changes...");
      const changedItems = currentRevisionBoq.filter(
        (r) => r.status !== "Approved",
      );
      const enrichedChangedItems = await Promise.all(
        changedItems.map(async (item) => ({
          ...item,
          clientNote: await generateClientNote({
            ...item,
            changeType: item.status,
            description: item.item,
            origTotal:
              baselineBoq.find(
                (b) => b.section === item.section && b.item === item.item,
              )?.total || 0,
            revTotal: item.total,
          }),
        })),
      );

      const getClientNote = (item) => {
        const enriched = enrichedChangedItems.find((e) => e.id === item.id);
        return enriched && enriched.clientNote
          ? enriched.clientNote
          : item.note;
      };

      let currentY = 20;

      // ---- Helper function for Text & Typography ----
      const writeText = (
        text,
        x,
        y,
        size,
        color,
        font = "helvetica",
        style = "normal",
        align: "left" | "center" | "right" | "justify" = "left",
      ) => {
        doc.setFontSize(size);
        doc.setFont(font, style);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text((text || "").replace(/₹/g, "Rs. "), x, y, { align });
      };

      // ---- 1. HEADER (Editorial Style) ----
      doc.setFillColor(248, 250, 252); // Soft slate-50 background for header
      doc.rect(0, 0, pageWidth, 45, "F");

      // Studio Name
      writeText(
        orgData?.orgName?.toUpperCase() || "FORM FACTORS STUDIO",
        marginX,
        22,
        22,
        [15, 23, 42],
        "helvetica",
        "bold",
      );
      writeText(
        "REVISION PACK",
        marginX,
        32,
        10,
        [100, 116, 139],
        "helvetica",
        "bold",
      );

      // Project Details (Right aligned)
      writeText(
        `Project: ${projectContext?.name || "Untitled"}`,
        pageWidth - marginX,
        22,
        10,
        [15, 23, 42],
        "helvetica",
        "bold",
        "right",
      );
      writeText(
        `Date: ${new Date().toLocaleDateString("en-IN")}`,
        pageWidth - marginX,
        28,
        9,
        [100, 116, 139],
        "helvetica",
        "normal",
        "right",
      );
      if (projectContext?.clientName) {
        writeText(
          `Client: ${projectContext.clientName}`,
          pageWidth - marginX,
          34,
          9,
          [100, 116, 139],
          "helvetica",
          "normal",
          "right",
        );
      }

      currentY = 60;

      // ---- 2. CALCULATIONS FOR FINANCIALS (Needed for Hero & Cards) ----
      const pdfOriginalExecution = originalNetExecution;
      const pdfRevisedExecution = revisedTotal;

      const discounts = projectContext?.financials?.discounts || [];
      const calculateDiscountValue = (base, target) => {
        let deduction = 0;
        discounts
          .filter((d) => d.target === target)
          .forEach((d) => {
            deduction +=
              d.type === "percentage" ? base * (d.value / 100) : d.value;
          });
        return deduction;
      };

      const gstRate = projectContext?.gstRate || 18;
      const origExecGst =
        projectContext?.financials?.executionGstEnabled !== false
          ? pdfOriginalExecution * (gstRate / 100)
          : 0;
      const revExecGst =
        projectContext?.financials?.executionGstEnabled !== false
          ? pdfRevisedExecution * (gstRate / 100)
          : 0;

      const designFeePercentage =
        projectContext?.financials?.designFeePercentage || 8;
      const calculateDesignFee = (executionValue) => {
        if (projectContext?.designFeeType === "fixed_lumpsum")
          return projectContext.designFee || 0;
        if (projectContext?.designFeeType === "fixed_sqft")
          return (projectContext.designFee || 0) * (projectContext.area || 0);
        return executionValue * (designFeePercentage / 100);
      };

      const pOriginalTotal = baselineBoq.reduce(
        (sum, item) => sum + item.total,
        0,
      );
      const origDesignFee = calculateDesignFee(pOriginalTotal);
      const origDesignNet = Math.max(
        0,
        origDesignFee - calculateDiscountValue(origDesignFee, "design"),
      );
      const origDesignGst = origDesignNet * (gstRate / 100);
      const finalOriginalTotal =
        pdfOriginalExecution + origExecGst + origDesignNet + origDesignGst;

      const pRawRevisedDesignBaseTotal = currentRevisionBoq.reduce(
        (sum, item) => {
          if (item.status === "Pending Decision") return sum;
          return sum + item.total;
        },
        0,
      );

      const revDesignFee = calculateDesignFee(pRawRevisedDesignBaseTotal);
      const revDesignNet = Math.max(
        0,
        revDesignFee - calculateDiscountValue(revDesignFee, "design"),
      );
      const revDesignGst = revDesignNet * (gstRate / 100);
      const finalRevisedTotal =
        pdfRevisedExecution + revExecGst + revDesignNet + revDesignGst;
      const grandTotalVariance = finalRevisedTotal - finalOriginalTotal;

      const itemsPendingDec = currentRevisionBoq.filter(
        (i) => i.status === "Pending Decision",
      );
      const pendingCount = itemsPendingDec.length;
      const totalItemsCount = currentRevisionBoq.length;

      // ---- 3. HERO STATES ----
      if (pendingCount > 0) {
        // STATE A: Pending Items
        const amberDark = [99, 56, 6]; // #633806
        const amberMed = [133, 79, 11]; // #854f0b

        writeText(
          "YOUR INPUT NEEDED",
          marginX,
          currentY,
          10,
          amberMed,
          "helvetica",
          "bold",
        );
        currentY += 8;

        const pluralS = pendingCount === 1 ? "" : "s";
        const verb = pendingCount === 1 ? "needs" : "need";
        writeText(
          `${pendingCount} item${pluralS} ${verb} your confirmation`,
          marginX,
          currentY,
          20,
          amberDark,
          "helvetica",
          "bold",
        );
        currentY += 8;

        itemsPendingDec.forEach((item) => {
          const itemText =
            `· ${item.item}   ·   ${formatINR(item.total)}`.replace(
              /₹/g,
              "Rs. ",
            );
          writeText(
            itemText,
            marginX,
            currentY,
            13,
            amberMed,
            "helvetica",
            "normal",
          );
          currentY += 6;
        });
        currentY += 2;

        writeText(
          `All other ${totalItemsCount - pendingCount} items are confirmed.`,
          marginX,
          currentY,
          13,
          [100, 116, 139],
          "helvetica",
          "normal",
        );
        currentY += 16;
      } else {
        // STATE B: Confirm & Final
        writeText(
          "REVISED PROJECT TOTAL",
          marginX,
          currentY,
          10,
          [100, 116, 139],
          "helvetica",
          "bold",
        );
        currentY += 10;
        writeText(
          formatINR(finalRevisedTotal).replace(/₹/g, "Rs. "),
          marginX,
          currentY,
          28,
          [26, 26, 46],
          "helvetica",
          "bold",
        );
        currentY += 8;
        writeText(
          `Incl. ${gstRate}% GST   ·   ${totalItemsCount} items confirmed`,
          marginX,
          currentY,
          13,
          [100, 116, 139],
          "helvetica",
          "normal",
        );
        currentY += 16;
      }

      // ---- 4. FINANCIAL SUMMARY CARDS ----
      const cardSpacing = 6;
      const cardWidth = (pageWidth - marginX * 2 - cardSpacing * 2) / 3;

      const drawInfoCard = (x, title, valueText, subText, valColor) => {
        doc.setFillColor(248, 250, 252);
        doc.rect(x, currentY, cardWidth, 28, "F");

        writeText(
          title,
          x + 5,
          currentY + 7,
          10,
          [100, 116, 139],
          "helvetica",
          "normal",
        );
        writeText(
          valueText,
          x + 5,
          currentY + 16,
          16,
          valColor,
          "helvetica",
          "bold",
        );
        writeText(
          subText,
          x + 5,
          currentY + 23,
          9,
          [148, 163, 184],
          "helvetica",
          "normal",
        );
      };

      // Card 1
      drawInfoCard(
        marginX,
        "Original estimate",
        formatINR(finalOriginalTotal).replace(/₹/g, "Rs. "),
        "incl. GST",
        [15, 23, 42],
      );

      // Card 2
      drawInfoCard(
        marginX + cardWidth + cardSpacing,
        "Revised total",
        formatINR(finalRevisedTotal).replace(/₹/g, "Rs. "),
        "incl. GST",
        [15, 23, 42],
      );

      // Card 3
      let varColor = [100, 116, 139]; // Grey (0 variance)
      let varSign = "";
      if (grandTotalVariance > 0) {
        varColor = [220, 38, 38]; // Red
        varSign = "+";
      } else if (grandTotalVariance < 0) {
        varColor = [5, 150, 105]; // Green
        varSign = "-";
      }
      const varValStr =
        grandTotalVariance === 0
          ? "No change"
          : `${varSign}${formatINR(Math.abs(grandTotalVariance)).replace(/₹/g, "Rs. ")}`;
      drawInfoCard(
        marginX + (cardWidth + cardSpacing) * 2,
        "Revision variance",
        varValStr,
        "vs. original estimate",
        varColor,
      );

      currentY += 36;

      // ---- 5. EXECUTIVE SUMMARY TEXT ----
      let summaryText = customSummary;
      if (!summaryText) {
        const isIncrease = netDelta > 0;
        const toneSummaries = {
          Partnership: `As your execution partner, ${orgData?.orgName || "we"} are committed to complete transparency. Following our recent design discussions and site evaluations, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon. Compared to the earlier estimate, the current revision shows a net cost ${isIncrease ? "increase" : "reduction"} of ${formatINR(Math.abs(netDelta))}, driven by scope optimization and design upgrades. The design fee has also been adjusted accordingly. This revision ensures that there are no surprises during execution and that our procurement aligns perfectly with your expectations.`,
          Neutral: `The revised BOQ reflects scope alignment based on finalised design discussions. Compared to the earlier estimate, the current revision shows a net cost ${isIncrease ? "addition" : "reduction"} of ${formatINR(Math.abs(netDelta))}. The design fee has also been adjusted accordingly.`,
          Firm: `This document contains the finalised revised BOQ for the project. To ensure complete transparency and maintain our execution schedule, all discussed scope changes have been incorporated. The revised BOQ total reflects a net cost ${isIncrease ? "addition" : "reduction"} of ${formatINR(Math.abs(netDelta))} from the original estimate.`,
          "Payment-aligned": `Following our recent design discussions, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon. The revised project estimate shows a net ${isIncrease ? "addition" : "reduction"} of ${formatINR(Math.abs(netDelta))}. As our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly.`,
        };
        summaryText =
          toneSummaries[summaryTone] || toneSummaries["Partnership"];
      }
      let summaryToPrint = summaryText || "";
      summaryToPrint = summaryToPrint.replace(/₹/g, "Rs. ");
      const summaryLines = doc.splitTextToSize(
        summaryToPrint,
        pageWidth - marginX * 2,
      );

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(summaryLines, marginX, currentY);

      currentY += summaryLines.length * 5 + 12;

      // ---- 4. HIGHLIGHTS & OUT-OF-SCOPE ITEMS ----
      const pendingItems = currentRevisionBoq.filter(
        (i) => i.status === "Pending Decision",
      );
      const vendorItems = currentRevisionBoq.filter(
        (i) => i.status === "Vendor Direct",
      );

      if (pendingItems.length > 0 || vendorItems.length > 0) {
        if (currentY > pageHeight - 60) {
          doc.addPage();
          currentY = marginX;
        }

        writeText(
          "IMPORTANT SCOPE NOTES",
          marginX,
          currentY,
          12,
          [15, 23, 42],
          "helvetica",
          "bold",
        );
        currentY += 6;

        const scopeNotes = [];
        pendingItems.forEach((pi) => {
          scopeNotes.push([
            pi.item,
            `Rs. ${formatINR(pi.total).replace(/₹/g, "")}`,
            "Pending Confirmation",
            pi.note ||
              "To be confirmed by client. Excluded from current total.",
          ]);
        });
        vendorItems.forEach((vi) => {
          scopeNotes.push([
            vi.item,
            "As Actuals",
            "Vendor Direct",
            vi.note ||
              "Procured directly from vendor. Excluded from studio total.",
          ]);
        });

        autoTable(doc, {
          startY: currentY,
          head: [["ITEM", "AMOUNT (EST)", "STATUS", "REMARKS"]],
          body: scopeNotes,
          theme: "plain",
          headStyles: {
            fillColor: [248, 250, 252],
            textColor: [100, 116, 139],
            fontStyle: "bold",
            fontSize: 8,
            cellPadding: 4,
          },
          styles: {
            font: "helvetica",
            fontSize: 9,
            textColor: [51, 65, 85],
            cellPadding: 4,
          },
          columnStyles: {
            0: { fontStyle: "bold", textColor: [15, 23, 42], cellWidth: 50 },
            1: { cellWidth: 30 },
            2: { fontStyle: "italic", textColor: [180, 83, 9], cellWidth: 35 },
            3: { cellWidth: "auto" }, // fill remaining
          },
          willDrawCell: (data) => {
            if (data.section === "body") {
              doc.setDrawColor(241, 245, 249);
              doc.setLineWidth(0.5);
              doc.line(
                data.cell.x,
                data.cell.y + data.cell.height,
                data.cell.x + data.cell.width,
                data.cell.y + data.cell.height,
              );
            }
          },
        });
        currentY = (doc as any).lastAutoTable.finalY + 16;
      }

      // ---- 5. DETAILED BOQ BREAKDOWN ----
      doc.addPage();
      currentY = 25;
      writeText(
        "DETAILED BOQ BREAKDOWN",
        marginX,
        currentY,
        12,
        [15, 23, 42],
        "helvetica",
        "bold",
      );
      currentY += 8;

      const sections = Array.from(
        new Set([
          ...baselineBoq.map((b) => b.section),
          ...currentRevisionBoq.map((r) => r.section),
        ]),
      );

      const boqBody = [];
      sections.forEach((section) => {
        const sectionItems = currentRevisionBoq.filter(
          (r) => r.section === section,
        );
        const sectionOrigTotal = baselineBoq
          .filter((b) => b.section === section)
          .reduce((sum, i) => sum + i.total, 0);
        const sectionRevTotal = sectionItems.reduce(
          (sum, i) =>
            i.status === "Vendor Direct" || i.status === "Pending Decision"
              ? sum
              : sum + i.total,
          0,
        );
        const sectionVar = sectionRevTotal - sectionOrigTotal;

        // Section Header Row
        boqBody.push([
          {
            content: section.toUpperCase(),
            styles: {
              fontStyle: "bold",
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
            },
          },
          { content: "", styles: { fillColor: [241, 245, 249] } },
          {
            content: formatINR(sectionOrigTotal).replace(/₹/g, "Rs. "),
            styles: {
              halign: "right",
              fontStyle: "bold",
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
            },
          },
          {
            content: formatINR(sectionRevTotal).replace(/₹/g, "Rs. "),
            styles: {
              halign: "right",
              fontStyle: "bold",
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
            },
          },
          {
            content:
              sectionVar === 0
                ? "-"
                : (sectionVar > 0
                    ? `+${formatINR(sectionVar)}`
                    : `-${formatINR(Math.abs(sectionVar))}`
                  ).replace(/₹/g, "Rs. "),
            styles: {
              halign: "right",
              fontStyle: "bold",
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
            },
          },
        ]);

        sectionItems.forEach((item) => {
          const origItem = baselineBoq.find(
            (b) => b.section === section && b.item === item.item,
          );
          const origTotal = origItem ? origItem.total : 0;
          const variance =
            item.status === "Vendor Direct" ||
            item.status === "Pending Decision"
              ? 0
              : item.total - origTotal;

          let statusText = item.status === "Approved" ? "-" : item.status;
          if (item.reasonCategory) statusText = item.reasonCategory;

          const displayOrig = origTotal === 0 ? "-" : formatINR(origTotal);
          const displayRev =
            item.status === "Vendor Direct"
              ? "As Actuals"
              : item.status === "Pending Decision"
                ? "Pending"
                : formatINR(item.total);
          const displayVar =
            variance === 0
              ? "-"
              : variance > 0
                ? `+${formatINR(variance)}`
                : `-${formatINR(Math.abs(variance))}`;

          boqBody.push([
            {
              content: `${item.item}\n${getClientNote(item) ? "> " + getClientNote(item) : ""}`,
              styles: { textColor: [51, 65, 85] },
            },
            {
              content: statusText,
              styles: {
                textColor:
                  item.status === "Approved" ? [148, 163, 184] : [217, 119, 6],
              },
            },
            {
              content: displayOrig.replace(/₹/g, "Rs. "),
              styles: { halign: "right" },
            },
            {
              content: displayRev.replace(/₹/g, "Rs. "),
              styles: { halign: "right" },
            },
            {
              content: displayVar.replace(/₹/g, "Rs. "),
              styles: {
                halign: "right",
                textColor:
                  variance > 0
                    ? [220, 38, 38]
                    : variance < 0
                      ? [5, 150, 105]
                      : [100, 116, 139],
              },
            },
          ]);
        });
      });

      autoTable(doc, {
        startY: currentY,
        head: [
          [
            "ITEM & DESCRIPTION",
            "STATUS / REASON",
            "ORIGINAL",
            "REVISED",
            "VARIANCE",
          ],
        ],
        body: boqBody,
        theme: "plain",
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [100, 116, 139],
          fontStyle: "bold",
          fontSize: 8,
        },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: 78 },
          1: { cellWidth: 35 },
          2: { cellWidth: 22 },
          3: { cellWidth: 22 },
          4: { cellWidth: 23 },
        },
        didDrawCell: (data) => {
          // Header border
          if (data.section === "head") {
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(1);
            doc.line(
              data.cell.x,
              data.cell.y + data.cell.height,
              data.cell.x + data.cell.width,
              data.cell.y + data.cell.height,
            );
          }
        },
        willDrawCell: (data) => {
          if (
            data.section === "body" &&
            data.row.raw[0]?.styles?.fontStyle !== "bold"
          ) {
            // Subtle line between normal items
            doc.setDrawColor(241, 245, 249);
            doc.setLineWidth(0.5);
            doc.line(
              data.cell.x,
              data.cell.y + data.cell.height,
              data.cell.x + data.cell.width,
              data.cell.y + data.cell.height,
            );
          }
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 20;

      // ---- 6. FOOTER / SIGN-OFF ----
      if (currentY > pageHeight - 40) {
        doc.addPage();
        currentY = marginX;
      }

      writeText(
        "MOVING FORWARD TOGETHER",
        marginX,
        currentY,
        12,
        [15, 23, 42],
        "helvetica",
        "bold",
      );
      currentY += 8;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const signOffLines = [
        "As your execution partner, our goal is complete transparency and zero surprises.",
        "1. Please review the detailed breakdown above.",
        "2. Let us know if any item needs further value engineering or discussion.",
        "3. Once aligned, provide your formal approval so we can lock in procurement rates.",
        "4. We will then update the payment milestones and proceed with execution seamlessly.",
        "",
        `Thank you for trusting ${orgData?.orgName || "Form Factors Studio"} with your vision.`,
      ];
      doc.text(signOffLines, marginX, currentY, { lineHeightFactor: 1.5 });

      // ---- 6. ANNEXURES EXPORT ----
      doc.addPage();
      currentY = marginX;
      writeText(
        `Annexure Scope: Final Revised BOQ`,
        marginX,
        currentY,
        14,
        [15, 23, 42],
        "helvetica",
        "bold",
      );
      currentY += 15;

      const annexBoqBody: any[] = [];
      const validItems = currentRevisionBoq.filter(
        (b) =>
          b.status !== "Removed" &&
          b.status !== "Vendor Direct" &&
          b.status !== "Pending Decision",
      );
      const annexSections = Array.from(
        new Set(validItems.map((b: any) => b.section || "Uncategorized")),
      );

      let grandSubtotal = 0;
      annexSections.forEach((section) => {
        const sectionItems = validItems.filter(
          (b: any) => (b.section || "Uncategorized") === section,
        );
        const sectionTotal = sectionItems.reduce(
          (sum, item) => sum + (item.total || 0),
          0,
        );
        grandSubtotal += sectionTotal;

        annexBoqBody.push([
          {
            content: String(section).toUpperCase(),
            styles: {
              fontStyle: "bold",
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
            },
          },
          { content: "", styles: { fillColor: [241, 245, 249] } },
          { content: "", styles: { fillColor: [241, 245, 249] } },
          { content: "", styles: { fillColor: [241, 245, 249] } },
          {
            content: formatINR(sectionTotal).replace(/₹/g, "Rs. "),
            styles: {
              halign: "right",
              fontStyle: "bold",
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
            },
          },
        ]);

        sectionItems.forEach((item) => {
          let unit = item.unit || "nos";
          if (item.unit === "lumpsum" || item.unit === "LUMPSUM")
            unit = "LUMPSUM";

          annexBoqBody.push([
            { content: item.item, styles: { textColor: [51, 65, 85] } },
            { content: unit, styles: { textColor: [51, 65, 85] } },
            {
              content: item.qty?.toString() || "-",
              styles: { halign: "right" },
            },
            {
              content: formatINR(item.rate || 0).replace(/₹/g, "Rs. "),
              styles: { halign: "right" },
            },
            {
              content: formatINR(item.total || 0).replace(/₹/g, "Rs. "),
              styles: { halign: "right" },
            },
          ]);
        });
      });

      // Add Grand Total
      annexBoqBody.push([
        {
          content: "GRAND TOTAL",
          colSpan: 4,
          styles: {
            fontStyle: "bold",
            fillColor: [226, 232, 240],
            textColor: [15, 23, 42],
          },
        },
        {
          content: formatINR(grandSubtotal).replace(/₹/g, "Rs. "),
          styles: {
            halign: "right",
            fontStyle: "bold",
            fillColor: [226, 232, 240],
            textColor: [15, 23, 42],
          },
        },
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [["ITEM", "UNIT", "QTY", "RATE", "TOTAL"]],
        body: annexBoqBody,
        theme: "plain",
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [100, 116, 139],
          fontStyle: "bold",
          fontSize: 8,
        },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
        },
      });

      // Add thin page borders on all pages
      const totalPages = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        // Left line
        doc.line(10, 10, 10, pageHeight - 10);
      }

      doc.save(
        `${projectContext?.name || "Project"}_Revision_Pack_${new Date().toISOString().split("T")[0]}.pdf`,
      );
      showToast("PDF Pack generated successfully!");
    } catch (err) {
      console.error("Error generating PDF:", err);
      showToast("Could not generate PDF. Please try again.");
    }
  };

  const renderClientView = () => {
    const sections = Array.from(
      new Set([
        ...baselineBoq.map((b: any) => b.section),
        ...currentRevisionBoq.map((r: any) => r.section),
      ]),
    );

    const revisionItemsForClient = currentRevisionBoq.map((item: any) => {
      const origItem = baselineBoq.find(
        (b: any) => b.section === item.section && b.item === item.item,
      );
      const origTotal = origItem ? origItem.total : 0;

      let actionType = "";
      if (item.status === "Added") actionType = "ADD";
      else if (item.status === "Removed") actionType = "REMOVE";
      else if (item.status === "Pending Decision") actionType = "MARK_PENDING";
      else if (item.status === "Vendor Direct") actionType = "MARK_VENDOR";
      else if (item.status === "Revised" || item.status === "Replaced")
        actionType = "REVISE_QTY";

      return {
        id: item.id,
        item: item.item,
        itemName: item.item,
        actionType,
        reasonCategory: item.reasonCategory,
        origTotal,
        revTotal: item.total,
        status: item.status,
      };
    });

    const clientData = getClientViewItems(revisionItemsForClient);
    const totalChangesCount =
      clientData.reductions.length +
      clientData.additions.length +
      clientData.variable.pending.length +
      clientData.variable.actuals.length;

    const variableSum =
      clientData.variable.pending.reduce((s, i) => s + (i.revTotal || 0), 0) +
      clientData.variable.actuals.reduce((s, i) => s + (i.revTotal || 0), 0);
    const maximumTotal = revisedTotal + variableSum;

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/60">
              {totalChangesCount} changes from original scope
            </span>
            <div className="hidden md:block h-4 w-px bg-slate-200"></div>
            {clientData.netSaving > 0 ? (
              <span className="font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/80 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                Net saving: {formatINR(clientData.netSaving)}
              </span>
            ) : clientData.netSaving < 0 ? (
              <span className="font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/80 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                Net addition: {formatINR(Math.abs(clientData.netSaving))}
              </span>
            ) : (
              <span className="font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">No net change</span>
            )}
            <div className="hidden md:block h-4 w-px bg-slate-200"></div>
            <button
              onClick={() => setShowDetailedClientView(!showDetailedClientView)}
              className="text-[#0066CC] hover:text-[#0055B3] font-bold underline transition-colors flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {showDetailedClientView
                  ? "Switch to summarized view"
                  : "Switch to itemized view"}
              </span>
            </button>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={exportToPDF}
              className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold shadow-2xs hover:bg-slate-50 transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export PDF</span>
            </button>
            <button
              onClick={() => exportToExcel("client")}
              className="px-3.5 py-2 bg-[#0066CC] text-white rounded-xl text-xs font-bold shadow-2xs hover:bg-[#0055B3] transition-all flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {!showDetailedClientView ? (
          <div className="space-y-6">
            {(clientData.variable.pending.length > 0 ||
              clientData.variable.actuals.length > 0) && (
              <div className="bg-amber-50/70 rounded-2xl border border-amber-200/80 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-amber-100/60 border-b border-amber-200/80 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-800" />
                    <h4 className="font-bold text-amber-950 text-xs uppercase tracking-wider">
                      Estimates & Items Pending Confirmation
                    </h4>
                  </div>
                </div>
                <div className="divide-y divide-amber-100/60 bg-white">
                  {clientData.variable.actuals.map((item, idx) => (
                    <div
                      key={`act-${idx}`}
                      className="px-5 py-3.5 flex justify-between items-center hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-xs">
                          {item.item}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                          Vendor-direct at actuals
                        </span>
                        <span className="font-bold text-slate-900 text-xs">
                          Est. {formatINR(item.revTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {clientData.variable.pending.map((item, idx) => (
                    <div
                      key={`pen-${idx}`}
                      className="px-5 py-3.5 flex justify-between items-center hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-xs">
                          {item.item}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                          Pending client confirmation
                        </span>
                        <span className="font-bold text-slate-900 text-xs">
                          Est. {formatINR(item.revTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-amber-100/40 text-xs text-amber-900 border-t border-amber-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <span>These estimates are subject to formal confirmation before placement.</span>
                  <span className="font-bold bg-amber-200/60 px-3 py-1 rounded-lg text-amber-950">
                    Max Total if confirmed: {formatINR(maximumTotal)}
                  </span>
                </div>
              </div>
            )}

            {clientData.reductions.length > 0 && (
              <div className="bg-white rounded-2xl border border-emerald-200/80 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-emerald-50/80 border-b border-emerald-200/80 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-emerald-700" />
                    <h4 className="font-bold text-emerald-950 text-xs uppercase tracking-wider">
                      Scope Reductions & Value Engineering
                    </h4>
                  </div>
                  <span className="font-extrabold text-emerald-700 text-sm">
                    −{formatINR(clientData.totalReductionValue)}
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {clientData.reductions.map((item, idx) => (
                    <div
                      key={`red-${idx}`}
                      className="px-5 py-3.5 flex justify-between items-center hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="font-bold text-slate-800 text-xs">
                          {item.item}
                        </span>
                        {item.reasonCategory && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full w-fit">
                            {item.reasonCategory}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-500 font-medium hidden sm:inline">
                          {item.revTotal === 0
                            ? "Removed from scope"
                            : formatINR(item.revTotal)}
                        </span>
                        <span className="font-bold text-emerald-600 text-right">
                          −{formatINR(item.origTotal - item.revTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clientData.additions.length > 0 && (
              <div className="bg-white rounded-2xl border border-rose-200/80 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-rose-50/80 border-b border-rose-200/80 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-rose-700" />
                    <h4 className="font-bold text-rose-950 text-xs uppercase tracking-wider">
                      Scope Additions & Design Enhancements
                    </h4>
                  </div>
                  <span className="font-extrabold text-amber-700 text-sm">
                    +{formatINR(clientData.totalAdditionValue)}
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {clientData.additions.map((item, idx) => (
                    <div
                      key={`add-${idx}`}
                      className="px-5 py-3.5 flex justify-between items-center hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="font-bold text-slate-800 text-xs">
                          {item.item}
                        </span>
                        {item.reasonCategory && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full w-fit">
                            {item.reasonCategory}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-end gap-6">
                        <span className="font-bold text-amber-700 text-right text-xs">
                          +{formatINR(item.revTotal - item.origTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Card className="p-0 overflow-hidden border border-slate-200/80 shadow-sm rounded-2xl bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">
                      Item
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">
                      UOM
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider text-right">
                      Orig. Qty
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider text-right">
                      Orig. Total
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider text-right">
                      Rev. Qty
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider text-right">
                      Rev. Total
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider text-right">
                      Variance
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">
                      Reason / Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sections.map((section) => {
                    const sectionItems = currentRevisionBoq.filter(
                      (r: any) => r.section === section,
                    );
                    const sectionOrigTotal = baselineBoq
                      .filter((b: any) => b.section === section)
                      .reduce((sum: number, i: any) => sum + i.total, 0);
                    const sectionRevTotal = sectionItems.reduce(
                      (sum: number, i: any) => {
                        if (i.status === "Vendor Direct") return sum;
                        return sum + i.total;
                      },
                      0,
                    );
                    const sectionVariance = sectionRevTotal - sectionOrigTotal;

                    return (
                      <React.Fragment key={section}>
                        <tr className="bg-slate-100/90 text-slate-800 font-bold border-y border-slate-200">
                          <td colSpan={3} className="px-4 py-2 uppercase">
                            {section}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {formatINR(sectionOrigTotal)}
                          </td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2 text-right">
                            {formatINR(sectionRevTotal)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {sectionVariance > 0 ? "+" : ""}
                            {formatINR(sectionVariance)}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                        {sectionItems.map((item: any, idx: number) => {
                          const origItem = baselineBoq.find(
                            (b: any) =>
                              b.section === section && b.item === item.item,
                          );
                          const origQty = origItem ? origItem.qty : 0;
                          const origTotal = origItem ? origItem.total : 0;
                          const variance = item.total - origTotal;

                          let rowClass = "bg-white";
                          let statusText = "As per agreed design";

                          if (item.status === "Added") {
                            rowClass = "bg-emerald-50";
                            statusText = "Added based on design development";
                          } else if (item.status === "Removed") {
                            rowClass = "bg-rose-50 text-slate-500";
                            statusText = "Removed from scope";
                          } else if (
                            item.status === "Revised" ||
                            item.status === "Replaced"
                          ) {
                            rowClass = "bg-blue-50";
                            statusText = "Revised as per final design";
                          } else if (item.status === "Pending Decision") {
                            rowClass = "bg-purple-50";
                            statusText = "Pending client confirmation";
                          } else if (item.status === "Vendor Direct") {
                            rowClass = "bg-orange-50 text-orange-800";
                            statusText = "As Actuals (Vendor Direct)";
                          }

                          const displayTotal =
                            item.status === "Vendor Direct"
                              ? "As Actuals"
                              : `${formatINR(item.total)}`;
                          const displayVariance =
                            item.status === "Vendor Direct"
                              ? "-"
                              : (variance > 0 ? "+" : "") +
                                (variance !== 0
                                  ? `${formatINR(variance)}`
                                  : "-");

                          return (
                            <tr
                              key={idx}
                              className={`hover:brightness-95 transition-all ${rowClass}`}
                            >
                              <td className="px-4 py-3 font-medium">
                                {item.item}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">
                                {item.unit || "SQFT"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {origQty || "-"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {formatINR(origTotal)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                {item.qty || "-"}
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                {displayTotal}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-medium ${variance > 0 ? "text-rose-600" : variance < 0 ? "text-emerald-600" : "text-slate-400"}`}
                              >
                                {displayVariance}
                              </td>
                              <td className="px-4 py-3 text-xs font-semibold italic">
                                {statusText}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600">
                                {item.reasonCategory && (
                                  <span className="font-semibold text-slate-800 block mb-0.5">
                                    [{item.reasonCategory}]
                                  </span>
                                )}
                                {item.note}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  };

  const renderClientSpecs = () => {
    return (
      <div className="space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0066CC]" />
              <h2 className="text-lg font-bold text-slate-900">
                Detailed Specifications & Material Inclusions
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Itemized technical inclusions, hardware grades, and exclusions for total clarity.
            </p>
          </div>
        </div>

        <Card className="p-0 overflow-hidden border border-slate-200/80 shadow-sm rounded-2xl bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider">
                  <th className="px-5 py-3.5 w-1/4">Space / Section</th>
                  <th className="px-5 py-3.5 w-1/4">Scope Item</th>
                  <th className="px-5 py-3.5 w-1/4">Material & Hardware Inclusions</th>
                  <th className="px-5 py-3.5 w-1/4">Explicit Exclusions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentRevisionBoq
                  .filter((item: any) => item.status !== "Removed")
                  .map((item: any, idx: number) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-5 py-4 font-bold text-slate-700 align-top">
                        <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-800 text-[11px] font-semibold border border-slate-200/60 inline-block">
                          {item.section}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-900 align-top text-xs">
                        {item.item}
                        {item.unit && (
                          <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                            {item.qty} {item.unit}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        {item.inclusions && item.inclusions.length > 0 ? (
                          <ul className="space-y-1.5 text-slate-700 text-xs font-medium">
                            {item.inclusions.map((inc: string, i: number) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{inc}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400 italic text-[11px] font-normal">
                            Standard studio specifications apply
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        {item.exclusions && item.exclusions.length > 0 ? (
                          <ul className="space-y-1.5 text-slate-700 text-xs font-medium">
                            {item.exclusions.map((exc: string, i: number) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                <span>{exc}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400 italic text-[11px] font-normal">
                            None specified
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  const renderClientPack = () => {
    const sectionBreakdown = Array.from(
      new Set([
        ...baselineBoq.map((b: any) => b.section),
        ...currentRevisionBoq.map((r: any) => r.section),
      ]),
    )
      .map((section) => {
        const orig = baselineBoq
          .filter((b: any) => b.section === section)
          .reduce((sum: number, item: any) => sum + item.total, 0);
        const rev = currentRevisionBoq
          .filter((r: any) => r.section === section)
          .reduce((sum: number, item: any) => {
            if (item.status === "Vendor Direct") return sum;
            return sum + item.total;
          }, 0);
        return {
          section,
          original: orig,
          revised: rev,
          delta: rev - orig,
        };
      })
      .filter((s) => s.delta !== 0);

    const defaultSummary = `The revised BOQ reflects scope alignment based on finalised design discussions. Compared to the earlier estimate, the current revision shows a net cost ${isIncrease ? "addition" : "reduction"} of ${formatINR(Math.abs(netDelta))}, driven by scope optimisation and design upgrades. The design fee has also been adjusted accordingly.`;

    const handleCopyWhatsapp = () => {
      const netSaving = -netDelta;
      const clientName = projectContext?.clientName || "Client";
      const projectName = projectContext?.name || "your project";
      const studioName = orgData?.name || "Studio";

      const pendingItems = currentRevisionBoq.filter(
        (r: any) => r.status === "Pending Decision",
      );
      const actualsItems = currentRevisionBoq.filter(
        (r: any) => r.status === "Vendor Direct",
      );

      let msg = `Hi ${clientName},\n\nWe have revised the scope for ${projectName} after our design discussions.\n\n`;

      if (netSaving > 0) {
        msg += `Good news — the revised scope results in a saving of ${formatINR(netSaving)} on your total.\n\n`;
      } else if (netSaving < 0) {
        msg += `The revised scope includes ${formatINR(Math.abs(netSaving))} in additions based on items we discussed.\n\n`;
      }

      if (pendingItems.length > 0) {
        const itemNames = pendingItems.map((i: any) => i.item).join(", ");
        msg += `Note: ${pendingItems.length} item(s) are pending your decision — ${itemNames}. These are not included in your current total.\n\n`;
      }

      if (actualsItems.length > 0) {
        const itemNames = actualsItems.map((i: any) => i.item).join(", ");
        msg += `${actualsItems.length} item(s) will be billed at vendor actuals — ${itemNames}. We will share quotes before purchase.\n\n`;
      }

      msg += `Sending the detailed revision document now. Please reply to confirm your approval once reviewed.\n\n${studioName}`;

      navigator.clipboard.writeText(msg);
      setIsWhatsappCopied(true);
      setTimeout(() => setIsWhatsappCopied(false), 2000);
    };

    return (
      <div className="space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-[#0066CC]" />
              <h3 className="text-lg font-bold text-slate-900">
                Client Communication & Commercial Pack
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              End-to-end BOQ revision summary, design fee impact, WhatsApp messaging, and PDF exports.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-slate-50/80 p-2 rounded-xl border border-slate-200/60 text-xs">
            {(!projectContext?.designFeeType ||
              projectContext?.designFeeType === "percentage") && (
              <div className="flex items-center gap-2">
                <label className="font-semibold text-slate-700">
                  Design Fee %:
                </label>
                <input
                  type="number"
                  value={designFeePercentage}
                  onChange={(e) =>
                    setDesignFeePercentage(Number(e.target.value))
                  }
                  className="w-16 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-center focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                />
              </div>
            )}
            {projectContext?.designFeeType === "fixed_lumpsum" && (
              <span className="font-semibold text-slate-700">
                Fixed Fee: <strong className="text-slate-900">{formatINR(projectContext.designFee || 0)}</strong>
              </span>
            )}
            {projectContext?.designFeeType === "fixed_sqft" && (
              <span className="font-semibold text-slate-700">
                Fixed Fee:{" "}
                <strong className="text-slate-900">
                  {formatINR(
                    (projectContext.designFee || 0) * (projectContext.area || 0),
                  )}
                </strong>
              </span>
            )}
            <div className="h-4 w-px bg-slate-300"></div>
            <div className="flex items-center gap-2">
              <label className="font-semibold text-slate-700">
                Initiation Fee Paid:
              </label>
              <input
                type="number"
                value={initiationFee}
                onChange={(e) => setInitiationFee(Number(e.target.value))}
                className="w-24 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-center focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Executive Summary & Tone */}
        <Card className="p-5 border border-slate-200/80 bg-white shadow-sm rounded-2xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0066CC]" />
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Client Executive Summary & Copy Generator
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">
                Tone Persona:
              </span>
              <select
                value={summaryTone}
                onChange={(e) => setSummaryTone(e.target.value)}
                className="p-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-[#0066CC] bg-slate-50 focus:outline-none"
              >
                <option value="Partnership">Partnership Tone</option>
                <option value="Neutral">Neutral Tone</option>
                <option value="Firm">Firm Tone</option>
                <option value="Payment-aligned">Payment-aligned Tone</option>
              </select>
            </div>
          </div>
          <textarea
            value={customSummary || defaultSummary}
            onChange={(e) => setCustomSummary(e.target.value)}
            className="w-full h-24 p-3 border border-slate-200/80 rounded-xl text-xs text-slate-700 leading-relaxed focus:ring-2 focus:ring-[#0066CC] focus:outline-none mb-3 bg-slate-50/50"
            placeholder="Enter custom executive summary for the client..."
          />
          <div className="flex justify-end">
            <button
              onClick={handleCopyWhatsapp}
              className={`px-4 py-2 border rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-2 ${
                isWhatsappCopied
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isWhatsappCopied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Copied to Clipboard ✓</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span>Copy WhatsApp Message</span>
                </>
              )}
            </button>
          </div>
        </Card>

        {/* Impact Visibility */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card className="p-6 border border-slate-800 bg-slate-900 text-white shadow-md rounded-2xl relative overflow-hidden">
            <div className="flex items-center gap-2 mb-4 text-slate-300">
              <Layers className="w-4 h-4 text-[#0066CC]" />
              <h4 className="font-bold uppercase tracking-wider text-xs">
                BOQ Execution Value Impact
              </h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Original Baseline BOQ</span>
                <span className="font-bold text-slate-200">{formatINR(originalTotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">
                  Revised BOQ (Gross)
                </span>
                <span className="font-bold text-slate-200">
                  {formatINR(rawRevisedExecutionTotal)}
                </span>
              </div>
              {asActualsTotal > 0 && (
                <div className="flex justify-between text-xs text-slate-400 border-l-2 border-slate-700 pl-2">
                  <span>As Actuals (Vendor Direct)</span>
                  <span className="font-bold">
                    {formatINR(asActualsTotal)}
                  </span>
                </div>
              )}
              {pendingDecisionTotal > 0 && (
                <div className="flex justify-between text-xs text-amber-400 border-l-2 border-amber-500/50 pl-2">
                  <span>Pending Client Decision (Excluded)</span>
                  <span className="font-bold">
                    {formatINR(pendingDecisionTotal)}
                  </span>
                </div>
              )}
              {executionDiscountVal > 0 && (
                <div className="flex justify-between text-xs text-emerald-400">
                  <span>Discounts Applied</span>
                  <span className="font-bold">
                    -{formatINR(executionDiscountVal)}
                  </span>
                </div>
              )}
              <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                <span className="font-semibold text-slate-300 text-xs">
                  Net Revised Execution BOQ
                </span>
                <span className="font-bold text-white text-base">
                  {formatINR(revisedTotal)}
                </span>
              </div>
              <div className="pt-2 flex justify-between items-center">
                <span className="font-semibold text-slate-400 text-xs">
                  Net Scope Variance
                </span>
                <span
                  className={`text-sm font-bold px-2.5 py-1 rounded-lg ${netDelta > 0 ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"}`}
                >
                  {netDelta > 0 ? "+" : ""}
                  {formatINR(netDelta)}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-sky-900 bg-gradient-to-br from-[#004D99] to-[#0066CC] text-white shadow-md rounded-2xl relative overflow-hidden">
            <div className="flex items-center gap-2 mb-4 text-sky-200">
              <TrendingUp className="w-4 h-4 text-amber-300" />
              <h4 className="font-bold uppercase tracking-wider text-xs">
                Design Fee Impact
              </h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-sky-200 font-medium">
                  Original Design Fee{" "}
                  {!projectContext?.designFeeType ||
                  projectContext?.designFeeType === "percentage"
                    ? `(${designFeePercentage}%)`
                    : "(Fixed)"}
                </span>
                <span className="font-bold text-white">
                  {formatINR(originalDesignFee)}
                </span>
              </div>
              {(!projectContext?.designFeeType ||
                projectContext?.designFeeType === "percentage") && (
                <>
                  <div className="flex justify-between text-xs text-sky-100">
                    <span>Revised BOQ Base</span>
                    <span className="font-semibold">
                      {formatINR(rawRevisedExecutionTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-sky-100">
                    <span>Total Design Base</span>
                    <span className="font-semibold">
                      {formatINR(rawRevisedDesignBaseTotal)}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-xs text-sky-100">
                <span>Revised Fee (Gross)</span>
                <span className="font-semibold">
                  {formatINR(rawRevisedDesignFee)}
                </span>
              </div>
              {designDiscountVal > 0 && (
                <div className="flex justify-between text-xs text-emerald-300">
                  <span>Discounts Applied</span>
                  <span className="font-semibold">
                    -{formatINR(designDiscountVal)}
                  </span>
                </div>
              )}
              <div className="pt-3 border-t border-white/20 flex justify-between items-center">
                <span className="font-semibold text-sky-100 text-xs">
                  Net Revised Design Fee
                </span>
                <span className="font-bold text-white text-base">
                  {formatINR(revisedDesignFee)}
                </span>
              </div>
              <div className="pt-2 flex justify-between items-center">
                <span className="font-semibold text-sky-200 text-xs">
                  Net Fee Variance
                </span>
                <span className="text-sm font-bold px-2.5 py-1 bg-white/20 text-white rounded-lg">
                  {designFeeDelta > 0 ? "+" : ""}
                  {formatINR(designFeeDelta)}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Section Breakdown */}
        {sectionBreakdown.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {sectionBreakdown.map((s) => (
              <Card
                key={s.section}
                className="p-3.5 border border-slate-200/80 bg-slate-50/60 rounded-xl"
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="font-bold text-slate-800 text-xs">{s.section}</div>
                  <div
                    className={`text-xs font-bold ${s.delta > 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {s.delta > 0 ? "+" : ""}
                    {formatINR(s.delta)}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 font-medium">
                  {formatINR(s.original)} → <span className="font-bold text-slate-800">{formatINR(s.revised)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Export Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Card
            className="p-5 border border-slate-200/80 bg-white shadow-2xs hover:border-[#0066CC] hover:shadow-md transition-all group cursor-pointer rounded-2xl flex items-center justify-between"
            onClick={exportToPDF}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#0066CC] flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-xs">
                  Client Review PDF Annexure
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Print-ready document with scope summary & payment impact.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#0066CC] group-hover:translate-x-1 transition-transform" />
          </Card>

          <Card
            className="p-5 border border-slate-200/80 bg-white shadow-2xs hover:border-emerald-500 hover:shadow-md transition-all group cursor-pointer rounded-2xl flex items-center justify-between"
            onClick={() => exportToExcel("client")}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-xs">
                  Detailed Itemized Excel
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Full itemized spreadsheet breakdown of baseline vs revised.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-1 transition-transform" />
          </Card>
        </div>

        {/* Sync to Payments */}
        {setProjectContext && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                const newAdHocItems = currentRevisionBoq
                  .filter((b: any) => b.bankId && b.bankId.startsWith("ADHOC_"))
                  .map((b: any) => ({
                    id: b.bankId,
                    name: b.item,
                    unit: b.unit,
                    materials: Math.round(b.rate * 0.7),
                    labor: Math.round(b.rate * 0.3),
                    margin: 0,
                    specs: "",
                    cat: b.section,
                    subcategory: "Ad-hoc",
                  }));

                if (setBank && newAdHocItems.length > 0) {
                  setBank((prev) => {
                    const merged = [...prev];
                    newAdHocItems.forEach((newBI: any) => {
                      if (!merged.find((i) => i.id === newBI.id)) {
                        merged.push(newBI as any);
                      }
                    });
                    return merged;
                  });
                }

                const newTierId = "tier_" + Math.random().toString(36).substring(2, 9);

                setProjectContext((prev) => {
                  const prevFinancials: FinancialConfig = prev.financials || {
                    initiationFeePaid: initiationFee,
                    billablePercent: 100,
                    executionGstEnabled: true,
                    projectedCashValue: 0,
                    taxLimitYearly: 2000000,
                    goodwillDiscount: 0,
                    discounts: [],
                    paymentRevisions: [],
                    approvedExecutionValue: originalNetExecution,
                    approvedDesignValue: originalNetDesign,
                    designFeePercentage: designFeePercentage,
                  };

                  const snapshots = prevFinancials.paymentSnapshots || [];
                  const updatedSnapshots = [...snapshots];
                  if (prev.approvedTierId) {
                    const previousTier = tiers.find(t => t.id === prev.approvedTierId);
                    const previousName = previousTier?.name || "Previous Version";
                    if (!updatedSnapshots.some(s => s.tierId === prev.approvedTierId)) {
                      updatedSnapshots.push({
                        tierId: prev.approvedTierId,
                        tierName: previousName,
                        timestamp: Date.now(),
                        approvedExecutionValue: prevFinancials.approvedExecutionValue ?? 0,
                        approvedDesignValue: prevFinancials.approvedDesignValue ?? 0,
                        milestones: prev.paymentMilestones || [],
                        billablePercent: prevFinancials.billablePercent,
                        executionGstEnabled: prevFinancials.executionGstEnabled,
                      });
                    }
                  }

                  const newRevision = {
                    id: Math.random().toString(36).substring(2, 9),
                    date: new Date().toISOString(),
                    previousExecutionValue:
                      prevFinancials.approvedExecutionValue ||
                      originalNetExecution,
                    newExecutionValue: rawRevisedExecutionTotal,
                    previousDesignValue:
                      prevFinancials.approvedDesignValue || originalNetDesign,
                    newDesignValue: rawRevisedDesignFee,
                    reason: "Synced from Revision Studio",
                  };

                  const currentAdHocItems = prev.adHocItems || [];
                  const mergedAdHocItems = [...currentAdHocItems];
                  newAdHocItems.forEach((newItem: any) => {
                    if (!mergedAdHocItems.find((i) => i.id === newItem.id)) {
                      mergedAdHocItems.push(newItem);
                    }
                  });

                  return {
                    ...prev,
                    approvedTierId: newTierId,
                    boqRevisions: [],
                    adHocItems: mergedAdHocItems,
                    financials: {
                      ...prevFinancials,
                      approvedExecutionValue: rawRevisedExecutionTotal,
                      approvedDesignValue: rawRevisedDesignFee,
                      designFeePercentage: designFeePercentage,
                      paymentSnapshots: updatedSnapshots,
                      paymentRevisions: [
                        ...(prevFinancials.paymentRevisions || []),
                        newRevision,
                      ],
                    },
                  };
                });

                setSelectedTierId(newTierId);
                if (setActiveTierId) {
                  setActiveTierId(newTierId);
                }
                setActions([]);

                if (setTiers) {
                  const dateStr = new Date().toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const newTier: ProposalTier = {
                    id: newTierId,
                    name: `Annexure - BOQ Revision (${dateStr})`,
                    timestamp: Date.now(),
                    parentTierId: selectedTierId || approvedTierId || activeTierId,
                    lifecycleTag: "Revised after design",
                    projectContext: { ...projectContext },
                    boq: currentRevisionBoq
                      .filter(
                        (b: any) => b.qty > 0 && b.status !== "Vendor Direct",
                      )
                      .map((b: any) => ({
                        id: b.id,
                        bankId: b.bankId || b.id,
                        roomId: b.section,
                        qty: b.qty,
                        marginOverride:
                          b.marginOverride !== undefined
                            ? b.marginOverride
                            : undefined,
                        selectedRate: b.rate,
                        rationale: b.item
                      })),
                    summary: {
                      totalSell: rawRevisedExecutionTotal,
                      totalCost: rawRevisedExecutionTotal * 0.7,
                      totalGm: 30,
                      itemCount: currentRevisionBoq.length,
                      totalRevenue: rawRevisedExecutionTotal,
                      designFee: 0,
                      blendedGm: 30,
                    },
                  };
                  setTiers((prev) => prev.map(t => {
                    if (t.id === approvedTierId) {
                      return { ...t, lifecycleTag: 'Superseded' };
                    }
                    return t;
                  }).concat(newTier));
                }

                showToast(
                  "Successfully synced revised values to Payment Calculator and created a new scope Annexure version.",
                );
              }}
              className="px-6 py-3 bg-[#0066CC] text-white font-bold rounded-xl shadow-md hover:bg-[#0055B3] transition-all flex items-center gap-2 text-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve Revision & Sync to Payment Calculator</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        )}

        {/* Updated Payment Stages Preview */}
        {(() => {
          const activeTier =
            tiers.find((t) => t.id === activeTierId) || tiers[0];
          const paymentMilestones = projectContext?.paymentMilestones || [];
          if (paymentMilestones.length === 0) return null;

          const designMilestones = paymentMilestones.filter(
            (m) => m.type === "design",
          );
          const executionMilestones = paymentMilestones.filter(
            (m) => m.type === "execution",
          );

          return (
            <div className="mt-6 space-y-6 flex flex-col">
              {designMilestones.length > 0 && (
                <Card className="p-6 border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <h4 className="font-semibold text-slate-800 uppercase tracking-wider text-sm mb-4">
                    Design fee schedule
                  </h4>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                    {designMilestones.flatMap((m, idx) => {
                      const current = calculateMilestone(m, false, idx);
                      const isCleared = current.isCleared;
                      const statBadge = isCleared ? m.status : "Open";

                      const rowStyle = {
                        borderBottom: "1px solid #f1f5f9",
                        padding: "12px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                      };

                      const rows = [];
                      if (current.deductedInitiationFee > 0) {
                        rows.push(
                          <div key={`${idx}-gross`} style={rowStyle}>
                            <span className="font-medium text-slate-800">
                              {m.name} (Gross)
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-900">
                                {formatINR(
                                  Math.round(
                                    current.revisedTotal +
                                      current.deductedInitiationFee,
                                  ),
                                )}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isCleared ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                              >
                                {statBadge}
                              </span>
                            </div>
                          </div>,
                        );
                        rows.push(
                          <div
                            key={`${idx}-init`}
                            style={{ ...rowStyle, backgroundColor: "#fffbeb" }}
                          >
                            <span className="text-amber-800 pl-4">
                              ↳ Less: Project Initiation Fee (Paid)
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-amber-700">
                                -
                                {formatINR(
                                  Math.round(current.deductedInitiationFee),
                                )}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                Paid
                              </span>
                            </div>
                          </div>,
                        );
                        rows.push(
                          <div
                            key={`${idx}-bal`}
                            style={{ ...rowStyle, backgroundColor: "#eff6ff" }}
                          >
                            <span className="text-blue-800 font-medium pl-4">
                              ↳ Balance Payable
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-blue-800">
                                {formatINR(Math.round(current.revisedTotal))}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isCleared ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                              >
                                {statBadge}
                              </span>
                            </div>
                          </div>,
                        );
                      } else {
                        rows.push(
                          <div key={`${idx}`} style={rowStyle}>
                            <span className="font-medium text-slate-800">
                              {m.name}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-900">
                                {formatINR(Math.round(current.revisedTotal))}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isCleared ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                              >
                                {statBadge}
                              </span>
                            </div>
                          </div>,
                        );
                      }
                      return rows;
                    })}
                  </div>
                </Card>
              )}

              {executionMilestones.length > 0 && (
                <Card className="p-6 border border-slate-200 bg-white shadow-sm overflow-x-auto w-full">
                  <h4 className="font-semibold text-slate-800 uppercase tracking-wider text-sm mb-6">
                    Payment journey
                  </h4>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      width: "100%",
                      gap: 0,
                      minWidth: "400px",
                    }}
                  >
                    {executionMilestones.map((m, idx) => {
                      const current = calculateMilestone(m, true, idx);
                      const isLast = idx === executionMilestones.length - 1;

                      let circleBg = "#f9f8f6";
                      let circleBorder = "#d3d1c7";
                      let circleColor = "#888";
                      let circleContent = (idx + 1).toString();
                      const statUpper = m.status
                        ? m.status.toUpperCase()
                        : "OPEN";

                      if (statUpper === "PAID") {
                        circleBg = "#eaf3de";
                        circleBorder = "#97c459";
                        circleColor = "#3b6d11";
                        circleContent = "✓";
                      } else if (statUpper === "INVOICED") {
                        circleBg = "#faeeda";
                        circleBorder = "#ef9f27";
                        circleColor = "#854f0b";
                        circleContent = "●";
                      }

                      return (
                        <React.Fragment key={idx}>
                          <div
                            style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                minWidth: "28px",
                                minHeight: "28px",
                                borderRadius: "50%",
                                border: `2px solid ${circleBorder}`,
                                backgroundColor: circleBg,
                                color: circleColor,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "12px",
                                fontWeight: "bold",
                                zIndex: 2,
                              }}
                            >
                              {circleContent}
                            </div>
                            <div
                              style={{
                                maxWidth: "72px",
                                fontSize: "10px",
                                textAlign: "center",
                                color: "#666",
                                marginTop: "4px",
                                lineHeight: "1.2",
                              }}
                            >
                              {m.name}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "#1a1a2e",
                                marginTop: "2px",
                              }}
                            >
                              {formatINR(Math.round(current.revisedTotal))}
                            </div>
                            <div
                              style={{
                                fontSize: "9px",
                                textTransform: "uppercase",
                                color: "#aaa",
                                marginTop: "2px",
                              }}
                            >
                              {statUpper === "PAID"
                                ? "PAID"
                                : statUpper === "INVOICED"
                                  ? "INVOICED"
                                  : "OPEN"}
                            </div>
                          </div>
                          {!isLast && (
                            <div
                              style={{
                                flex: 1,
                                height: "2px",
                                background: "#e0ddd6",
                                marginTop: "13px",
                                marginLeft: "-2px",
                                marginRight: "-2px",
                                zIndex: 1,
                              }}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          );
        })()}

        {/* Communication Drafts */}
        <div className="grid grid-cols-1 gap-6 mt-6">
          <Card className="p-6 border border-slate-200 bg-white shadow-sm">
            <h4 className="font-semibold text-slate-800 uppercase tracking-wider text-sm mb-4">
              Communication Drafts
            </h4>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h5 className="font-medium text-slate-700 text-sm">
                    Email Draft
                  </h5>
                  <button
                    onClick={() => {
                      let emailBody = "";
                      const deltaText =
                        netDelta === 0
                          ? "no net change in cost"
                          : `net ${isIncrease ? "increase" : "decrease"} of ${formatINR(Math.abs(netDelta))}`;

                      const activeTier =
                        tiers.find((t) => t.id === activeTierId) || tiers[0];
                      const paymentMilestones =
                        projectContext?.paymentMilestones || [];
                      const designMilestones = paymentMilestones.filter(
                        (m) => m.type === "design",
                      );
                      const executionMilestones = paymentMilestones.filter(
                        (m) => m.type === "execution",
                      );

                      let paymentSummaryText = "";
                      if (designMilestones.length > 0) {
                        paymentSummaryText += `\n\n🔹 **Updated Design Fees:**\n${designMilestones
                          .map((m, idx) => {
                            const current = calculateMilestone(m, false, idx);
                            if (current.deductedInitiationFee > 0) {
                              return `- ${m.name} (Gross) (${m.percentage}%): ${formatINR(Math.round(current.revisedTotal + current.deductedInitiationFee))} (incl. GST)\n  ↳ Less: Project Initiation Fee (Paid): -${formatINR(Math.round(current.deductedInitiationFee))}\n  ↳ Balance Payable: ${formatINR(Math.round(current.revisedTotal))}`;
                            }
                            return `- ${m.name} (${m.percentage}%): ${formatINR(Math.round(current.revisedTotal))} (incl. GST)`;
                          })
                          .join("\n")}`;
                      }
                      if (executionMilestones.length > 0) {
                        paymentSummaryText += `\n\n🔸 **Updated Execution Milestones:**\n${executionMilestones
                          .map((m, idx) => {
                            const current = calculateMilestone(m, true, idx);
                            return `- ${m.name} (${m.percentage}%): ${formatINR(Math.round(current.revisedTotal))} (incl. GST)`;
                          })
                          .join("\n")}`;
                      }

                      if (summaryTone === "Neutral") {
                        emailBody = `Dear Client,\n\nTransparency and alignment are core to how we execute projects at ${orgData.orgName}. Following our recent design discussions and site evaluations, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon.\n\nThe original BOQ was ${formatINR(originalTotal)}, and the revised BOQ is ${formatINR(revisedTotal)} (after discounts), resulting in ${deltaText}.\n\nThe design fee has also been adjusted accordingly to ${formatINR(revisedDesignFee)} (after discounts).\n\nThis revision ensures that there are no surprises during execution and that our procurement aligns perfectly with your expectations. As our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly:${paymentSummaryText}\n\nWe have attached both a summary PDF and a detailed Excel breakdown for your review. Please let us know if you have any questions.\n\nBest regards,\n${orgData.orgName}`;
                      } else if (summaryTone === "Firm") {
                        emailBody = `Dear Client,\n\nAttached is the finalized revised BOQ for your project.\n\nTo ensure complete transparency and maintain our execution schedule, the scope changes discussed have been incorporated. The revised BOQ total stands at ${formatINR(revisedTotal)} (after discounts), reflecting ${deltaText} from the original estimate.\n\nThe corresponding design fee is now ${formatINR(revisedDesignFee)} (after discounts).\n\nAs our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly:${paymentSummaryText}\n\nPlease review the attached PDF and Excel documents. We require your formal approval on these revised figures to proceed with the next execution phase without delays.\n\nBest regards,\n${orgData.orgName}`;
                      } else {
                        emailBody = `Dear Client,\n\nTransparency and alignment are core to how we execute projects at ${orgData.orgName}. Following our recent design discussions and site evaluations, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon.\n\nThe revised project estimate is ${formatINR(revisedTotal)} (after discounts) (${deltaText}). The updated design fee is ${formatINR(revisedDesignFee)} (after discounts).\n\nThis revision ensures that there are no surprises during execution and that our procurement aligns perfectly with your expectations. As our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly:${paymentSummaryText}\n\nPlease review the attached PDF and Excel breakdowns. Kindly approve the revised BOQ so we can process the upcoming payment milestone and continue execution smoothly.\n\nBest regards,\n${orgData.orgName}`;
                      }
                      navigator.clipboard.writeText(emailBody);
                    }}
                    className="text-xs text-[#0066CC] hover:text-[#0055B3] font-medium"
                  >
                    Copy Email
                  </button>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap font-mono">
                  {(() => {
                    const deltaText =
                      netDelta === 0
                        ? "no net change in cost"
                        : `a net ${isIncrease ? "increase" : "decrease"} of ${formatINR(Math.abs(netDelta))}`;
                    const activeTier =
                      tiers.find((t) => t.id === activeTierId) || tiers[0];
                    const paymentMilestones =
                      projectContext?.paymentMilestones || [];
                    const designMilestones = paymentMilestones.filter(
                      (m) => m.type === "design",
                    );
                    const executionMilestones = paymentMilestones.filter(
                      (m) => m.type === "execution",
                    );

                    let paymentSummaryText = "";
                    if (designMilestones.length > 0) {
                      paymentSummaryText += `\n\n🔹 **Updated Design Fees:**\n${designMilestones
                        .map((m, idx) => {
                          const current = calculateMilestone(m, false, idx);
                          if (current.deductedInitiationFee > 0) {
                            return `- ${m.name} (Gross) (${m.percentage}%): ${formatINR(Math.round(current.revisedTotal + current.deductedInitiationFee))} (incl. GST)\n  ↳ Less: Project Initiation Fee (Paid): -${formatINR(Math.round(current.deductedInitiationFee))}\n  ↳ Balance Payable: ${formatINR(Math.round(current.revisedTotal))}`;
                          }
                          return `- ${m.name} (${m.percentage}%): ${formatINR(Math.round(current.revisedTotal))} (incl. GST)`;
                        })
                        .join("\n")}`;
                    }
                    if (executionMilestones.length > 0) {
                      paymentSummaryText += `\n\n🔸 **Updated Execution Milestones:**\n${executionMilestones
                        .map((m, idx) => {
                          const current = calculateMilestone(m, true, idx);
                          return `- ${m.name} (${m.percentage}%): ${formatINR(Math.round(current.revisedTotal))} (incl. GST)`;
                        })
                        .join("\n")}`;
                    }

                    if (summaryTone === "Neutral")
                      return `Dear Client,\n\nTransparency and alignment are core to how we execute projects at ${orgData.orgName}. Following our recent design discussions and site evaluations, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon.\n\nThe original BOQ was ${formatINR(originalTotal)}, and the revised BOQ is ${formatINR(revisedTotal)} (after discounts), resulting in ${deltaText}.\n\nThe design fee has also been adjusted accordingly to ${formatINR(revisedDesignFee)} (after discounts).\n\nThis revision ensures that there are no surprises during execution and that our procurement aligns perfectly with your expectations. As our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly:${paymentSummaryText}\n\nWe have attached both a summary PDF and a detailed Excel breakdown for your review. Please let us know if you have any questions.\n\nBest regards,\n${orgData.orgName}`;
                    if (summaryTone === "Firm")
                      return `Dear Client,\n\nAttached is the finalized revised BOQ for your project.\n\nTo ensure complete transparency and maintain our execution schedule, the scope changes discussed have been incorporated. The revised BOQ total stands at ${formatINR(revisedTotal)} (after discounts), reflecting ${deltaText} from the original estimate.\n\nThe corresponding design fee is now ${formatINR(revisedDesignFee)} (after discounts).\n\nAs our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly:${paymentSummaryText}\n\nPlease review the attached PDF and Excel documents. We require your formal approval on these revised figures to proceed with the next execution phase without delays.\n\nBest regards,\n${orgData.orgName}`;
                    if (summaryTone === "Payment-aligned")
                      return `Dear Client,\n\nTransparency and alignment are core to how we execute projects at ${orgData.orgName}. Following our recent design discussions and site evaluations, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon.\n\nThe revised project estimate is ${formatINR(revisedTotal)} (after discounts) (${deltaText}). The updated design fee is ${formatINR(revisedDesignFee)} (after discounts).\n\nThis revision ensures that there are no surprises during execution and that our procurement aligns perfectly with your expectations. As our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly:${paymentSummaryText}\n\nPlease review the attached PDF and Excel breakdowns. Kindly approve the revised BOQ so we can process the upcoming payment milestone and continue execution smoothly.\n\nBest regards,\n${orgData.orgName}`;
                  })()}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h5 className="font-medium text-slate-700 text-sm">
                    WhatsApp Draft
                  </h5>
                  <button
                    onClick={() => {
                      let waBody = "";
                      const waDeltaText =
                        netDelta === 0
                          ? "no net change in cost ⚖️"
                          : `${isIncrease ? "📈 +" : "📉 -"}${formatINR(Math.abs(netDelta))}`;
                      if (summaryTone === "Neutral") {
                        waBody = `Hi! 👋 We've updated the project BOQ based on our latest discussions. The net revised total is ${formatINR(revisedTotal)} (${waDeltaText}). I've emailed you the detailed PDF and Excel files. Let me know when you have a moment to review! 📄✨`;
                      } else if (summaryTone === "Firm") {
                        waBody = `Hi, the revised BOQ is ready and emailed to you. 📄 The net updated total is ${formatINR(revisedTotal)} (${waDeltaText}). Please review the attached documents and provide your approval so we can keep the execution on schedule. Thanks! ⏳`;
                      } else {
                        waBody = `Hi! 👋 To ensure complete transparency before the next payment stage, we've updated the BOQ to reflect our finalized scope. The net revised total is ${formatINR(revisedTotal)} (${waDeltaText}). I've emailed you the detailed breakdown along with the updated payment stages. Please review and approve so we can proceed smoothly! 🚀`;
                      }
                      navigator.clipboard.writeText(waBody);
                    }}
                    className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                  >
                    Copy WhatsApp
                  </button>
                </div>
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 text-sm text-slate-700 whitespace-pre-wrap font-mono">
                  {(() => {
                    const waDeltaText =
                      netDelta === 0
                        ? "no net change in cost"
                        : `${isIncrease ? "+" : "-"}${formatINR(Math.abs(netDelta))}`;
                    if (summaryTone === "Neutral")
                      return `Hi! We've updated the project BOQ based on our latest discussions. The net revised total is ${formatINR(revisedTotal)} (${waDeltaText}). I've emailed you the detailed PDF and Excel files. Let me know when you have a moment to review!`;
                    if (summaryTone === "Firm")
                      return `Hi, the revised BOQ is ready and emailed to you. The net updated total is ${formatINR(revisedTotal)} (${waDeltaText}). Please review the attached documents and provide your approval so we can keep the execution on schedule. Thanks!`;
                    if (summaryTone === "Payment-aligned")
                      return `Hi! To ensure complete transparency before the next payment stage, we've updated the BOQ to reflect our finalized scope. The net revised total is ${formatINR(revisedTotal)} (${waDeltaText}). I've emailed you the detailed breakdown along with the updated payment stages. Please review and approve so we can proceed smoothly!`;
                  })()}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-50/50 relative">
      {/* Main Full-Width Workspace (Uses maximum available screen real estate) */}
      <div className="flex-grow p-4 sm:p-5 overflow-y-auto">
        <div className="w-full space-y-4">
          {/* Streamlined 3-Tab Navigation Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-200/70 p-1.5 rounded-2xl border border-slate-200 w-full">
            {[
              { id: "actions", label: "1. Revision Workbench", icon: Edit3 },
              {
                id: "client-presentation",
                label: "2. Client Presentation & Specs",
                icon: FileText,
              },
              { id: "export-comms", label: "3. Export & Communications", icon: Share2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                    isActive
                      ? "bg-white text-[#0055B3] shadow-xs border border-slate-200/90"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? "text-[#0066CC]" : "text-slate-400"
                    }`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Tab Content */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "actions" && renderActionEntry()}
            {activeTab === "client-presentation" && (
              <div className="space-y-6">
                {renderClientView()}
                {renderClientSpecs()}
              </div>
            )}
            {activeTab === "export-comms" && (
              <div className="space-y-6">
                {renderClientPack()}
                {renderChangeLog()}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Baseline Scope Modal Window */}
      <AnimatePresence>
        {showBaselineModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6"
            onClick={() => setShowBaselineModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm text-white">
                      Approved Contractual Baseline BOQ — {currentSelectedTier?.name}
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Locked source of truth • Baseline Total: {formatINR(originalTotal)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBaselineModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto space-y-6 flex-grow">
                {renderBaseline()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-6 right-6 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white px-6 py-3 rounded-xl shadow-xl font-medium text-sm z-[100] flex items-center gap-3"
          >
            <span>✨</span>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
