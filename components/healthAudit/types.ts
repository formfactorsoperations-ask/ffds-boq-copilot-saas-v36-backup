import { FullBoqItem, ProjectContext, ProposalTier, SnagItem } from '../../types';

export type HealthGrade = 'PRIME' | 'SOUND' | 'CAUTION' | 'CRITICAL';

export interface PillarScore {
  score: number; // 0 - 25
  maxScore: 25;
  grade: HealthGrade;
  title: string;
  summary: string;
  findings: Array<{
    type: 'ok' | 'warning' | 'critical' | 'info';
    message: string;
    actionable?: boolean;
    actionId?: string;
  }>;
}

export interface ProjectHealthReport {
  compositeScore: number; // 0 - 100
  overallGrade: HealthGrade;
  statusLabel: string;
  headlineSummary: string;
  primaryRisk: string;
  nextRecommendedAction: string;
  pillars: {
    scopeCompleteness: PillarScore;
    marginIntegrity: PillarScore;
    cashflowHardgates: PillarScore;
    siteGovernance: PillarScore;
  };
  metrics: {
    /** BOQ lines at LIST sell price. Not what the client agreed to pay. */
    listSell: number;
    /** What the client actually contracted for, ex-GST and after discounts.
        This is the number every profit figure on this screen is built from. */
    contractedExecution: number;
    /** listSell - contractedExecution. Shown so the correction is visible. */
    discountValue: number;
    /** Whether revenue came from the signed contract or fell back to BOQ list. */
    revenueSource: 'contract' | 'boq_list';
    /** True when no design fee is configured, so the fee is genuinely zero. */
    designFeeConfigured: boolean;
    totalSell: number;
    totalCost: number;
    netProfit: number;
    grossMarginPct: number;
    blendedMarginPct: number;
    designFee: number;
    materialCost: number;
    laborCost: number;
    materialRatio: number; // 0-100%
    laborRatio: number; // 0-100%
    skewHealth: 'balanced' | 'labor_underestimated' | 'material_heavy' | 'labor_heavy';
    totalItems: number;
    marginDragCount: number; // items < 18%
    zeroRateCount: number;
    unmappedRoomCount: number;
    missingEssentialTrades: string[];
    openSnagCount: number;
    criticalSnagCount: number;
    e1PaymentCleared: boolean;
    e1PaymentAmount: number;
    e1PaidAmount: number;
    boqFrozen: boolean;
    contractSigned: boolean;
  };
  smartActions: SmartActionItem[];
}

export interface SmartActionItem {
  id: string;
  type: 'auto_fix_margins' | 'inject_trade' | 'map_rooms' | 'review_gate' | 'fix_zero_rates';
  title: string;
  badge: string;
  impact: string;
  description: string;
  urgency: 'high' | 'medium' | 'low';
  data?: any;
}
