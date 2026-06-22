import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    const tierId = approvedTierId || activeTierId;
    if (!tierId) return [];
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return [];

    const bankMap = new Map(bank.map((i) => [i.id, i]));
    if (projectContext?.adHocItems) {
      projectContext.adHocItems.forEach((i) => bankMap.set(i.id, i));
    }

    return (tier.boq || []).map((boqItem) => {
      const bankItem = bankMap.get(boqItem.bankId);
      let rate = 0;
      if (bankItem) {
        rate = calculateSellPrice(
          bankItem.materials,
          bankItem.labor,
          boqItem.marginOverride ?? bankItem.margin,
        );
      } else if (boqItem.selectedRate) {
        rate = boqItem.selectedRate;
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
  }, [tiers, bank, approvedTierId, activeTierId, projectContext?.adHocItems]);

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
  const unpaidExecutionPct = unpaidExecutionMilestones.reduce(
    (sum, m) => sum + m.percentage,
    0,
  );

  let lockedExecutionBase = 0;
  paidExecutionMilestones.forEach((m) => {
    lockedExecutionBase +=
      (m.lockedTaxableBase || originalNetExecution) * (m.percentage / 100);
  });
  const remainingExecutionBase = revisedTotal - lockedExecutionBase;

  const paidDesignMilestones = designMilestones.filter(
    (m) => m.status === "paid" || m.status === "invoiced",
  );
  const unpaidDesignMilestones = designMilestones.filter(
    (m) => m.status !== "paid" && m.status !== "invoiced",
  );
  const unpaidDesignPct = unpaidDesignMilestones.reduce(
    (sum, m) => sum + m.percentage,
    0,
  );

  let lockedDesignBase = 0;
  paidDesignMilestones.forEach((m) => {
    lockedDesignBase +=
      (m.lockedTaxableBase || originalNetDesign) * (m.percentage / 100);
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
    const originalBaseAmount = isExecution
      ? originalNetExecution * (m.percentage / 100)
      : originalNetDesign * (m.percentage / 100);

    let originalBillable = isExecution
      ? originalBaseAmount * (billablePercent / 100)
      : originalBaseAmount;
    let originalCash = isExecution
      ? originalBaseAmount * (Math.max(0, 100 - billablePercent) / 100)
      : 0;
    const applicableGstRate = isExecution
      ? executionGstEnabled
        ? gstRate
        : 0
      : gstRate;
    let originalGST = originalBillable * (applicableGstRate / 100);
    let originalTotal = originalBillable + originalCash + originalGST;

    // Revised Calculation
    let revisedBaseAmount = 0;
    if (isExecution) {
      if (isCleared) {
        revisedBaseAmount =
          (m.lockedTaxableBase || originalNetExecution) * (m.percentage / 100);
      } else {
        const relativePct =
          unpaidExecutionPct > 0 ? m.percentage / unpaidExecutionPct : 0;
        revisedBaseAmount = remainingExecutionBase * relativePct;
      }
    } else {
      if (isCleared) {
        revisedBaseAmount =
          (m.lockedTaxableBase || originalNetDesign) * (m.percentage / 100);
      } else {
        const relativePct =
          unpaidDesignPct > 0 ? m.percentage / unpaidDesignPct : 0;
        revisedBaseAmount = remainingDesignBase * relativePct;
      }
    }

    let revisedBillable = isExecution
      ? revisedBaseAmount * (billablePercent / 100)
      : revisedBaseAmount;
    let revisedCash = isExecution
      ? revisedBaseAmount * (Math.max(0, 100 - billablePercent) / 100)
      : 0;
    let revisedGST = revisedBillable * (applicableGstRate / 100);
    let revisedTotal = revisedBillable + revisedCash + revisedGST;

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
          <span className="text-indigo-600 font-medium">
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
          <span className="text-indigo-600 font-medium">
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
          <div className="text-indigo-600 font-medium">
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
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Baseline BOQ</h3>
          <p className="text-sm text-slate-500">
            The single source of truth. Locked and read-only.
          </p>
        </div>
        <div className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold flex items-center gap-1">
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          Approved Baseline
        </div>
      </div>
      <Card className="p-0 border border-slate-200">
        <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium">Section</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium text-right">Rate (₹)</th>
              <th className="px-4 py-3 font-medium text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {baselineBoq.map((item: any, idx: number) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-600">{item.section}</td>
                <td className="px-4 py-2 font-medium text-slate-800">
                  {item.item}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {item.qty} {item.unit}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {formatINR(item.rate)}
                </td>
                <td className="px-4 py-2 text-right font-medium text-slate-700">
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
    return (
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-6">
          <Card className="p-4 border border-slate-200 bg-white shadow-sm">
            <h4 className="font-semibold text-slate-800 mb-4">
              Natural Language Input
            </h4>
            <textarea
              className="w-full h-24 p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              placeholder="e.g. Remove partition in entrance, add arch design, update MB wardrobe size to 84 sqft..."
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
            />
            <button className="mt-3 w-full py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium text-sm hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Parse Intent (Coming Soon)
            </button>
          </Card>

          <Card className="p-4 border border-slate-200 bg-white shadow-sm">
            <h4 className="font-semibold text-slate-800 mb-4">
              Manual Action Entry
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Action Type
                </label>
                <select
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  value={manualForm.type}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      type: e.target.value as ActionType,
                    })
                  }
                >
                  <option value="ADD">Add New Item</option>
                  <option value="REMOVE">Remove Item</option>
                  <option value="REPLACE">Replace Item</option>
                  <option value="REVISE_QTY">Revise Quantity</option>
                  <option value="REVISE_RATE">Revise Rate</option>
                  <option value="MARK_PENDING">Mark Pending Decision</option>
                  <option value="APPROVE_PENDING">Approve Pending Item</option>
                  <option value="MARK_VENDOR">Mark Vendor Direct</option>
                </select>
              </div>

              {manualForm.type !== "ADD" && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Target Item
                  </label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                    value={manualForm.targetItemId}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        targetItemId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select item...</option>
                    {currentRevisionBoq
                      .filter((i: any) => i.status !== "Removed")
                      .map((item: any, idx: number) => (
                        <option key={idx} value={item.id}>
                          {item.section} - {item.item}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {manualForm.type === "ADD" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Section
                    </label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                      placeholder="e.g. Living Room"
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
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Item Name
                    </label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                      placeholder="e.g. False Ceiling"
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
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Unit
                      </label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="sqft"
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
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
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
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Rate (₹)
                      </label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
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
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    New Quantity
                  </label>
                  <input
                    type="number"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
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
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    New Rate (₹)
                  </label>
                  <input
                    type="number"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
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
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      New Item Name
                    </label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                      value={manualForm.newItemName}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          newItemName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      New Rate (₹)
                    </label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                      value={manualForm.newRate}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          newRate: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Reason Category
                </label>
                <select
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  value={manualForm.reasonCategory}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      reasonCategory: e.target.value,
                    })
                  }
                >
                  <option>Design Upgrade</option>
                  <option>Site Condition</option>
                  <option>Client Request</option>
                  <option>Value Engineering</option>
                  <option>Correction</option>
                </select>
              </div>

              {(manualForm.type === "ADD" || manualForm.type === "REPLACE") && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Inclusions (One per line)
                    </label>
                    <textarea
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm h-20 resize-none"
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
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Exclusions (One per line)
                    </label>
                    <textarea
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm h-20 resize-none"
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
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="Add context..."
                  value={manualForm.note}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, note: e.target.value })
                  }
                />
              </div>

              <button
                className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors"
                onClick={handleApplyManualAction}
              >
                Apply Change
              </button>
            </div>
          </Card>
        </div>

        <div className="col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-slate-800">
              Current Revision Preview
            </h4>
            {actions.length > 0 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={handleUndo}
                  className="text-sm text-slate-500 hover:text-rose-600 flex items-center gap-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                  Undo Last Action
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to delete all revision actions? This cannot be undone.",
                      )
                    ) {
                      setActions([]);
                      showToast("All actions deleted");
                    }
                  }}
                  className="text-sm text-slate-500 hover:text-rose-600 flex items-center gap-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Clear All
                </button>
              </div>
            )}
          </div>
          <Card className="p-0 overflow-hidden border border-slate-200 h-[600px] flex flex-col">
            <div className="overflow-y-auto flex-grow">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Total (₹)
                    </th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(new Set(currentRevisionBoq.map((r: any) => r.section))).map((section: any) => {
                    const sectionItems = currentRevisionBoq.filter((r: any) => r.section === section);
                    return (
                      <React.Fragment key={section}>
                        <tr className="bg-slate-100/50">
                          <td colSpan={4} className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                            {section}
                          </td>
                        </tr>
                        {sectionItems.map((item: any, idx: number) => {
                          let rowClass = "hover:bg-slate-50";
                          if (item.status === "Added")
                            rowClass += " bg-emerald-50/50";
                          if (item.status === "Removed")
                            rowClass += " bg-rose-50/50 opacity-50 line-through";
                          if (item.status === "Revised" || item.status === "Replaced")
                            rowClass += " bg-amber-50/50";
                          if (item.status === "Pending Decision")
                            rowClass += " bg-purple-50/50";

                          return (
                            <tr key={`${section}-${idx}`} className={rowClass}>
                              <td className="px-4 py-3 pl-6">
                                <div className="font-medium text-slate-800">
                                  {item.item}
                                </div>
                                {item.note && (
                                  <div className="text-xs text-slate-500 mt-0.5 italic">
                                    "{item.note}"
                                  </div>
                                )}
                                {item.status === "Vendor Direct" && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 font-semibold">
                                    Billed at actuals — estimate only
                                  </div>
                                )}
                                {item.status === "Pending Decision" && (
                                  <div className="text-[10px] text-purple-500 mt-0.5 font-semibold">
                                    Awaiting client confirmation
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600">
                                {item.qty} {item.unit}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-700">
                                {formatINR(item.total)}
                              </td>
                              <td className="px-4 py-3 border-l border-slate-100/50">
                                <span
                                  className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    item.status === "Approved"
                                      ? "bg-slate-100 text-slate-500"
                                      : item.status === "Added"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : item.status === "Removed"
                                          ? "bg-rose-100 text-rose-700 font-semibold"
                                          : item.status === "Vendor Direct"
                                            ? "bg-slate-100 text-slate-600"
                                            : item.status === "Pending Decision"
                                              ? "border border-purple-300 text-purple-700 bg-purple-50"
                                              : "bg-amber-100 text-amber-700"
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
      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">
            Structured Change Log
          </h3>
          <button
            onClick={() => exportToExcel("internal")}
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-medium shadow-sm hover:bg-slate-50"
          >
            Export Log
          </button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Change Detail</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {actions.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No actions recorded yet.
                </td>
              </tr>
            ) : (
              [...actions].reverse().map((action) => (
                <tr key={action.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-[10px] font-bold tracking-wider">
                      {action.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {action.item}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatChangeDetail(action)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {action.reasonCategory}
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
                      className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-rose-50 transition-colors"
                      title="Delete Action"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-800">
            Generated Scope Annexures
          </h3>
        </div>
        <div className="p-4">
          {tiers.filter((t) => t.name.startsWith("Annexure")).length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              No scope annexures generated yet. Sync a revision to create one.
            </p>
          ) : (
            <div className="space-y-3">
              {tiers
                .filter((t) => t.name.startsWith("Annexure"))
                .map((tier) => (
                  <div
                    key={tier.id}
                    className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  >
                    <div>
                      <h4 className="font-medium text-slate-800">
                        {tier.name}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {tier.summary?.itemCount || 0} items •{" "}
                        {formatINR(tier.summary?.totalSell || 0)}
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
                      className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-md transition-colors"
                      title="Delete Annexure"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm mb-4 gap-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold text-slate-800">
              {totalChangesCount} changes from original scope
            </span>
            <div className="hidden md:block h-4 w-px bg-slate-300"></div>
            {clientData.netSaving > 0 ? (
              <span className="font-bold text-emerald-600">
                Net saving: {formatINR(clientData.netSaving)}
              </span>
            ) : clientData.netSaving < 0 ? (
              <span className="font-bold text-amber-600">
                Net addition: {formatINR(Math.abs(clientData.netSaving))}
              </span>
            ) : (
              <span className="font-bold text-slate-600">No net change</span>
            )}
            <div className="hidden md:block h-4 w-px bg-slate-300"></div>
            <button
              onClick={() => setShowDetailedClientView(!showDetailedClientView)}
              className="text-indigo-600 hover:text-indigo-800 font-medium underline"
            >
              {showDetailedClientView
                ? "Show summarized view"
                : "Show detailed view"}
            </button>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={exportToPDF}
              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-medium shadow-sm hover:bg-slate-50"
            >
              Export to PDF
            </button>
            <button
              onClick={() => exportToExcel("client")}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-indigo-700"
            >
              Export to Excel
            </button>
          </div>
        </div>

        {!showDetailedClientView ? (
          <div className="space-y-6">
            {(clientData.variable.pending.length > 0 ||
              clientData.variable.actuals.length > 0) && (
              <div className="bg-amber-50 rounded-lg border border-amber-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-amber-100/50 border-b border-amber-200">
                  <h4 className="font-bold text-amber-900">
                    Items not yet in your confirmed total
                  </h4>
                </div>
                <div className="divide-y divide-amber-100/50">
                  {clientData.variable.actuals.map((item, idx) => (
                    <div
                      key={`act-${idx}`}
                      className="px-4 py-3 flex justify-between items-center bg-white"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-800">
                          {item.item}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                          Vendor-direct at actuals
                        </span>
                        <span className="font-bold text-slate-800">
                          Est. {formatINR(item.revTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {clientData.variable.pending.map((item, idx) => (
                    <div
                      key={`pen-${idx}`}
                      className="px-4 py-3 flex justify-between items-center bg-white"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-800">
                          {item.item}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                          Pending your confirmation
                        </span>
                        <span className="font-bold text-slate-800">
                          Est. {formatINR(item.revTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 bg-amber-100/30 text-xs text-amber-800 border-t border-amber-200">
                  These estimates are subject to change. We will confirm costs
                  with you before proceeding.
                  <span className="font-bold ml-1">
                    Your maximum total if all estimates are confirmed:{" "}
                    {formatINR(maximumTotal)}
                  </span>
                </div>
              </div>
            )}

            {clientData.reductions.length > 0 && (
              <div className="bg-white rounded-lg border border-emerald-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200 flex justify-between items-center">
                  <h4 className="font-bold text-emerald-900">
                    Scope reductions
                  </h4>
                  <span className="font-bold text-emerald-600">
                    −{formatINR(clientData.totalReductionValue)}
                  </span>
                </div>
                <div className="divide-y divide-emerald-50">
                  {clientData.reductions.map((item, idx) => (
                    <div
                      key={`red-${idx}`}
                      className="px-4 py-3 flex justify-between items-center hover:bg-slate-50"
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                        <span className="font-medium text-slate-800">
                          {item.item}
                        </span>
                        {item.reasonCategory && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full w-fit">
                            {item.reasonCategory}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col md:flex-row items-end md:items-center gap-1 md:gap-6">
                        <span className="text-xs md:text-sm text-slate-500">
                          {item.revTotal === 0
                            ? "Removed from scope"
                            : formatINR(item.revTotal)}
                        </span>
                        <span className="font-bold text-emerald-600 md:w-24 text-right">
                          −{formatINR(item.origTotal - item.revTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clientData.additions.length > 0 && (
              <div className="bg-white rounded-lg border border-rose-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 flex justify-between items-center">
                  <h4 className="font-bold text-rose-900">Scope additions</h4>
                  <span className="font-bold text-amber-600">
                    +{formatINR(clientData.totalAdditionValue)}
                  </span>
                </div>
                <div className="divide-y divide-rose-50">
                  {clientData.additions.map((item, idx) => (
                    <div
                      key={`add-${idx}`}
                      className="px-4 py-3 flex justify-between items-center hover:bg-slate-50"
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                        <span className="font-medium text-slate-800">
                          {item.item}
                        </span>
                        {item.reasonCategory && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full w-fit">
                            {item.reasonCategory}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-end gap-6 md:w-32">
                        <span className="font-bold text-amber-600 text-right">
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
          <Card className="p-0 overflow-hidden border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-800 text-white">
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
                        <tr className="bg-amber-400 text-slate-900 font-bold">
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
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Detailed Specs & Inclusions
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Clear breakdown of what is included and excluded per item.
            </p>
          </div>
        </div>

        <Card className="p-6 overflow-hidden border-slate-200 shadow-sm rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="px-4 py-3 font-semibold w-1/4">Item</th>
                  <th className="px-4 py-3 font-semibold w-1/4">Section</th>
                  <th className="px-4 py-3 font-semibold w-1/4">Inclusions</th>
                  <th className="px-4 py-3 font-semibold w-1/4">Exclusions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentRevisionBoq
                  .filter((item: any) => item.status !== "Removed")
                  .map((item: any, idx: number) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-4 font-medium text-slate-800 align-top">
                        {item.item}
                      </td>
                      <td className="px-4 py-4 text-slate-500 align-top">
                        {item.section}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {item.inclusions && item.inclusions.length > 0 ? (
                          <ul className="list-disc pl-4 space-y-1 text-slate-600 text-xs">
                            {item.inclusions.map((inc: string, i: number) => (
                              <li key={i}>{inc}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400 italic text-xs">
                            Standard specs apply
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {item.exclusions && item.exclusions.length > 0 ? (
                          <ul className="list-disc pl-4 space-y-1 text-slate-600 text-xs">
                            {item.exclusions.map((exc: string, i: number) => (
                              <li key={i}>{exc}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400 italic text-xs">
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
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Client Pack Generation
            </h3>
            <p className="text-sm text-slate-500">
              End-to-end BOQ and Design Fee communication.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(!projectContext?.designFeeType ||
              projectContext?.designFeeType === "percentage") && (
              <>
                <label className="text-sm font-medium text-slate-700">
                  Design Fee %:
                </label>
                <input
                  type="number"
                  value={designFeePercentage}
                  onChange={(e) =>
                    setDesignFeePercentage(Number(e.target.value))
                  }
                  className="w-20 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </>
            )}
            {projectContext?.designFeeType === "fixed_lumpsum" && (
              <span className="text-sm font-medium text-slate-700">
                Fixed Design Fee: {formatINR(projectContext.designFee || 0)}
              </span>
            )}
            {projectContext?.designFeeType === "fixed_sqft" && (
              <span className="text-sm font-medium text-slate-700">
                Fixed Design Fee:{" "}
                {formatINR(
                  (projectContext.designFee || 0) * (projectContext.area || 0),
                )}
              </span>
            )}
            <div className="h-6 w-px bg-slate-300 mx-1"></div>
            <label className="text-sm font-medium text-slate-700">
              Initiation Fee Paid:
            </label>
            <input
              type="number"
              value={initiationFee}
              onChange={(e) => setInitiationFee(Number(e.target.value))}
              className="w-24 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Executive Summary & Tone */}
        <div className="grid grid-cols-1 gap-6">
          <Card className="p-6 border border-slate-200 bg-white shadow-sm flex flex-col items-end">
            <div className="flex justify-between items-center mb-4 w-full">
              <h4 className="font-semibold text-slate-800 uppercase tracking-wider text-sm">
                Executive Summary
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">
                  Tone:
                </span>
                <select
                  value={summaryTone}
                  onChange={(e) => setSummaryTone(e.target.value)}
                  className="p-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-slate-50"
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
              className="w-full h-24 p-3 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed focus:ring-2 focus:ring-indigo-500 mb-4"
              placeholder="Enter custom summary..."
            />
            <button
              onClick={handleCopyWhatsapp}
              className={`px-4 py-2 border rounded-lg text-sm font-medium shadow-sm transition-all flex items-center gap-2 ${
                isWhatsappCopied
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {isWhatsappCopied ? (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied ✓
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
                    <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" />
                  </svg>
                  Copy WhatsApp message
                </>
              )}
            </button>
          </Card>
        </div>

        {/* Impact Visibility */}
        <div className="grid grid-cols-2 gap-6">
          <Card className="p-6 border-2 border-slate-800 bg-slate-800 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">
              🏗️
            </div>
            <h4 className="font-semibold text-slate-200 mb-4 uppercase tracking-wider text-xs">
              BOQ Impact
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Original BOQ Total</span>
                <span className="font-medium">{formatINR(originalTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">
                  Revised BOQ (Pre-discount)
                </span>
                <span className="font-medium">
                  {formatINR(rawRevisedExecutionTotal)}
                </span>
              </div>
              {asActualsTotal > 0 && (
                <>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>As Actuals (Vendor Direct)</span>
                    <span className="font-medium">
                      {formatINR(asActualsTotal)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-tight mb-2">
                    Billed at actuals. Vendor quotes shared before purchase.
                  </div>
                </>
              )}
              {pendingDecisionTotal > 0 && (
                <>
                  <div className="flex justify-between text-sm text-amber-500">
                    <span>Pending Decision (Excluded)</span>
                    <span className="font-medium">
                      {formatINR(pendingDecisionTotal)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-tight">
                    Items marked pending confirmation are excluded from your
                    confirmed total. They will be added to your invoice only
                    after you confirm the scope.
                  </div>
                </>
              )}
              {executionDiscountVal > 0 && (
                <div className="flex justify-between text-sm text-emerald-400">
                  <span>Discounts Applied</span>
                  <span className="font-medium">
                    -{formatINR(executionDiscountVal)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-300 font-medium">
                  Net Revised BOQ
                </span>
                <span className="font-bold text-white">
                  {formatINR(revisedTotal)}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-700 flex justify-between items-center">
                <span className="font-medium text-slate-300">
                  Net BOQ Variance
                </span>
                <span
                  className={`text-xl font-bold px-3 py-1 rounded-lg ${netDelta > 0 ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"}`}
                >
                  {netDelta > 0 ? "+" : ""}
                  {formatINR(netDelta)}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-2 border-indigo-600 bg-indigo-600 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">
              💎
            </div>
            <h4 className="font-semibold text-indigo-200 mb-4 uppercase tracking-wider text-xs">
              Design Fee Impact
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-indigo-300">
                  Original Design Fee{" "}
                  {!projectContext?.designFeeType ||
                  projectContext?.designFeeType === "percentage"
                    ? `(${designFeePercentage}%)`
                    : "(Fixed)"}
                </span>
                <span className="font-medium">
                  {formatINR(originalDesignFee)}
                </span>
              </div>
              {(!projectContext?.designFeeType ||
                projectContext?.designFeeType === "percentage") && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-indigo-300">Revised BOQ Base</span>
                    <span className="font-medium">
                      {formatINR(rawRevisedExecutionTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-indigo-300">
                      As Actuals (Vendor Direct)
                    </span>
                    <span className="font-medium">
                      {formatINR(asActualsTotal)}
                    </span>
                  </div>
                  {pendingDecisionTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-indigo-300">
                        Pending Decision (Excluded)
                      </span>
                      <span className="font-medium text-amber-300">
                        {formatINR(pendingDecisionTotal)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-indigo-300">Total Design Base</span>
                    <span className="font-medium">
                      {formatINR(rawRevisedDesignBaseTotal)}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-indigo-300">
                  Revised Fee (Pre-discount)
                </span>
                <span className="font-medium">
                  {formatINR(rawRevisedDesignFee)}
                </span>
              </div>
              {designDiscountVal > 0 && (
                <div className="flex justify-between text-sm text-emerald-300">
                  <span>Discounts Applied</span>
                  <span className="font-medium">
                    -{formatINR(designDiscountVal)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-indigo-200 font-medium">
                  Net Revised Fee
                </span>
                <span className="font-bold text-white">
                  {formatINR(revisedDesignFee)}
                </span>
              </div>
              <div className="pt-3 border-t border-indigo-500 flex justify-between items-center">
                <span className="font-medium text-indigo-200">
                  Net Fee Variance
                </span>
                <span
                  className={`text-xl font-bold px-3 py-1 rounded-lg ${designFeeDelta > 0 ? "bg-white/20 text-white" : "bg-white/20 text-white"}`}
                >
                  {designFeeDelta > 0 ? "+" : ""}
                  {formatINR(designFeeDelta)}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Section Breakdown */}
        {sectionBreakdown.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {sectionBreakdown.map((s) => (
              <Card
                key={s.section}
                className="p-4 border border-slate-200 bg-slate-50"
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium text-slate-800">{s.section}</div>
                  <div
                    className={`text-sm font-semibold ${s.delta > 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {s.delta > 0 ? "+" : ""}
                    {formatINR(s.delta)}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Original: {formatINR(s.original)} → Revised:{" "}
                  {formatINR(s.revised)}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Export Actions */}
        <div className="grid grid-cols-2 gap-6 mt-6">
          <Card
            className="p-6 border border-slate-200 bg-white shadow-sm hover:border-indigo-400 hover:shadow-md transition-all group cursor-pointer"
            onClick={exportToPDF}
          >
            <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">
              📄
            </div>
            <h4 className="font-semibold text-slate-800 mb-2">
              Client Review PDF
            </h4>
            <p className="text-sm text-slate-500 mb-4">
              Clean PDF with summary, section breakdown, and design fee impact.
            </p>
            <div className="flex items-center gap-2 text-indigo-600 text-sm font-medium">
              <span>Download PDF</span>
              <span className="group-hover:translate-x-1 transition-transform">
                →
              </span>
            </div>
          </Card>

          <Card
            className="p-6 border border-slate-200 bg-white shadow-sm hover:border-emerald-400 hover:shadow-md transition-all group cursor-pointer"
            onClick={() => exportToExcel("client")}
          >
            <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">
              📊
            </div>
            <h4 className="font-semibold text-slate-800 mb-2">
              Detailed Excel
            </h4>
            <p className="text-sm text-slate-500 mb-4">
              Full itemized breakdown of all changes for client records.
            </p>
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
              <span>Download Excel</span>
              <span className="group-hover:translate-x-1 transition-transform">
                →
              </span>
            </div>
          </Card>
        </div>

        {/* Sync to Payments */}
        {setProjectContext && (
          <div className="mt-6 flex justify-end">
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
                    adHocItems: mergedAdHocItems,
                    financials: {
                      ...prevFinancials,
                      approvedExecutionValue: rawRevisedExecutionTotal,
                      approvedDesignValue: rawRevisedDesignFee,
                      designFeePercentage: designFeePercentage,
                      paymentRevisions: [
                        ...(prevFinancials.paymentRevisions || []),
                        newRevision,
                      ],
                    },
                  };
                });

                if (setTiers) {
                  const dateStr = new Date().toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  });
                  const newTier: ProposalTier = {
                    id: "tier_" + Math.random().toString(36).substring(2, 9),
                    name: `Annexure - BOQ Revision (${dateStr})`,
                    timestamp: Date.now(),
                    projectContext: { ...projectContext },
                    boq: currentRevisionBoq
                      .filter(
                        (b: any) => b.qty > 0 && b.status !== "Vendor Direct",
                      )
                      .map((b: any) => ({
                        id: b.id,
                        bankId: b.bankId || b.id, // Fallback if no bankId
                        roomId: b.section,
                        qty: b.qty,
                        marginOverride:
                          b.marginOverride !== undefined
                            ? b.marginOverride
                            : undefined,
                        selectedRate: b.rate, // capture revised rate
                        rationale: b.item // PRESAVE NAME FOR LEGACY ITEMS
                      })),
                    summary: {
                      totalSell: rawRevisedExecutionTotal,
                      totalCost: rawRevisedExecutionTotal * 0.7, // approximation
                      totalGm: 30, // approximation
                      itemCount: currentRevisionBoq.length,
                      totalRevenue: rawRevisedExecutionTotal,
                      designFee: 0,
                      blendedGm: 30,
                    },
                  };
                  setTiers((prev) => [...prev, newTier]);
                }

                showToast(
                  "Successfully synced revised values to Payment Calculator and created a new scope Annexure version.",
                );
              }}
              className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
              <span>Approve & Sync to Payments</span>
              <span>→</span>
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
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
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
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          Revision Studio
        </h1>
        <p className="text-slate-500">
          BOQ Revision Workflow Engine & Change Management
        </p>
      </div>

      <div className="flex-grow p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
            {[
              { id: "baseline", label: "1. Baseline BOQ" },
              { id: "actions", label: "2. Revision Actions" },
              { id: "log", label: "3. Change Log" },
              { id: "client-view", label: "4. Client Presentation View" },
              { id: "client-specs", label: "5. Detailed Specs & Inclusions" },
              { id: "client-pack", label: "6. Export & Communications" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "baseline" && renderBaseline()}
            {activeTab === "actions" && renderActionEntry()}
            {activeTab === "log" && renderChangeLog()}
            {activeTab === "client-view" && renderClientView()}
            {activeTab === "client-specs" && renderClientSpecs()}
            {activeTab === "client-pack" && renderClientPack()}
          </motion.div>
        </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 bg-slate-900 text-white px-6 py-3 rounded-lg shadow-xl font-medium text-sm z-50 flex items-center gap-3"
          >
            <span>✨</span>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
