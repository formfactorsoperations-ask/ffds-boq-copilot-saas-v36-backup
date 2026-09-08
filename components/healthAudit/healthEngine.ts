import { calculateProjectFinancials } from '../../lib/financialsUtils';
import { BoqItem, FullBoqItem, ProjectContext, ProposalTier, SnagItem, Item } from '../../types';
import { calculateSellPrice, calculateGrossMargin, formatCurrency, generateId } from '../../lib/utils';
import { HealthGrade, PillarScore, ProjectHealthReport, SmartActionItem } from './types';

// Standard essential trades for interior fit-out projects
export const ESSENTIAL_TRADES = [
  { key: 'carpentry', label: 'Carpentry & Modular Storage', aliases: ['carpentry', 'woodwork', 'modular', 'wardrobe', 'kitchen', 'cabinet', 'storage', 'plywood'] },
  { key: 'electrical', label: 'Electrical & First-Fix Wiring', aliases: ['electrical', 'wiring', 'lighting', 'switch', 'light', 'point', 'conduit'] },
  { key: 'false_ceiling', label: 'False Ceiling & Gypsum Grid', aliases: ['ceiling', 'false ceiling', 'gypsum', 'pop', 'cove'] },
  { key: 'painting', label: 'Painting & Surface Finishes', aliases: ['painting', 'paint', 'polish', 'duco', 'texture', 'primer', 'wall'] },
  { key: 'civil_masonry', label: 'Civil, Demolition & Wet Works', aliases: ['civil', 'demolition', 'masonry', 'tile', 'flooring', 'grouting', 'waterproofing', 'plumbing'] },
  { key: 'protection_cleaning', label: 'Surface Protection & Deep Clean', aliases: ['protection', 'cleaning', 'deep clean', 'corrugated sheet', 'bubble wrap', 'debris', 'handover clean'] }
];

// Helper to determine Grade from score
export function getGradeFromScore(score: number, maxScore: number = 25): HealthGrade {
  const pct = (score / maxScore) * 100;
  if (pct >= 85) return 'PRIME';
  if (pct >= 70) return 'SOUND';
  if (pct >= 50) return 'CAUTION';
  return 'CRITICAL';
}

// Compute comprehensive project health report
/**
 * REVENUE COMES FROM THE CONTRACT, NOT THE QUOTE.
 *
 * This engine used to build its profit figures by summing every BOQ line at its
 * LIST sell price. It had no discount handling at all, so every rupee the studio
 * negotiated away was still being reported as profit. On a real project that read
 * as Rs 2,27,400 net profit against an actual Rs 80,463 -- 2.8x too high.
 *
 * `calculateProjectFinancials` is the one place discounts are applied, and it is
 * what the P&L card, the Reports tab and the portfolio table all use. This engine
 * now uses it too, so a project's margin means the same thing on every screen.
 *
 * The BOQ list total is kept as `listSell` because per-item margin analysis still
 * needs it -- but it is never the basis of a profit number.
 */
export function computeProjectHealth(
  boq: FullBoqItem[],
  projectContext?: ProjectContext,
  tiers: ProposalTier[] = []
): ProjectHealthReport {
  let totalCost = 0;
  let totalSell = 0; // reassigned below to contracted revenue
  let materialCost = 0;
  let laborCost = 0;
  let marginDragCount = 0;
  let zeroRateCount = 0;
  const itemCategories = new Set<string>();

  // 1. BOQ Line Items Financial & Anomaly Scan
  boq.forEach(item => {
    const qty = Number(item.qty) || 0;
    const mat = Number(item.materials) || 0;
    const lab = Number(item.labor) || 0;
    const unitCost = mat + lab;
    const margin = Number(item.margin) || 0;
    const unitSell = calculateSellPrice(mat, lab, margin);
    
    const lineCost = unitCost * qty;
    const lineSell = unitSell * qty;

    totalCost += lineCost;
    totalSell += lineSell;
    materialCost += mat * qty;
    laborCost += lab * qty;

    if (item.cat) itemCategories.add(item.cat.toLowerCase());
    if (unitCost === 0 || unitSell === 0 || qty === 0) {
      zeroRateCount++;
    }
    if (margin < 18) {
      marginDragCount++;
    }
  });

  // BOQ lines at list price. Useful for per-item analysis, never for profit.
  const listSell = totalSell;

  // ---- Contracted revenue, ex-GST and after discounts ----
  const ctxAny = projectContext as any;
  const activeTier =
    tiers.find(t => t.id === (ctxAny?.approvedTierId || ctxAny?.activeTierId)) || tiers[0];

  let contractedExecution = 0;
  let contractedDesign = 0;
  let revenueSource: 'contract' | 'boq_list' = 'boq_list';
  let designFeeConfigured = false;

  if (projectContext) {
    const fin = calculateProjectFinancials(projectContext, activeTier) as any;
    contractedExecution = Number(fin?.taxableExecution) || 0;
    contractedDesign = Number(fin?.taxableDesign) || 0;
    if (contractedExecution > 0) revenueSource = 'contract';
  }

  /* A design fee that was never configured is ZERO. The previous version
     invented 10% of sell here, which both overstated profit and made pillar 3's
     "No Design Fee configured" deduction unreachable -- it checks for exactly 0,
     and the invented fee was never 0. */
  if (contractedDesign > 0) {
    designFeeConfigured = true;
  } else if (projectContext) {
    const { designFee: df, designFeeType: dft, area } = projectContext;
    if (dft === 'fixed_lumpsum' && df) { contractedDesign = df; designFeeConfigured = true; }
    else if (dft === 'fixed_sqft' && df) { contractedDesign = df * (area || 0); designFeeConfigured = true; }
    else if (dft && df) { contractedDesign = listSell * (df / 100); designFeeConfigured = true; }
  }

  // Fall back to list only when there is no contract to read (BOQ-only preview).
  const executionRevenue = revenueSource === 'contract' ? contractedExecution : listSell;
  const designFee = contractedDesign;
  const discountValue = Math.max(0, listSell - executionRevenue);

  const netProfit = (executionRevenue - totalCost) + designFee;
  const totalRevenue = executionRevenue + designFee;
  const grossMarginPct = calculateGrossMargin(executionRevenue, totalCost);
  const blendedMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Everything downstream that used to mean "sell" now means contracted revenue.
  totalSell = executionRevenue;

  // Material vs Labor equilibrium
  const totalDirectCost = materialCost + laborCost;
  const materialRatio = totalDirectCost > 0 ? (materialCost / totalDirectCost) * 100 : 70;
  const laborRatio = totalDirectCost > 0 ? (laborCost / totalDirectCost) * 100 : 30;

  let skewHealth: 'balanced' | 'labor_underestimated' | 'material_heavy' | 'labor_heavy' = 'balanced';
  if (laborRatio < 15 && totalDirectCost > 0) skewHealth = 'labor_underestimated';
  else if (laborRatio > 45) skewHealth = 'labor_heavy';
  else if (materialRatio > 85) skewHealth = 'material_heavy';

  // Room coverage
  const definedRooms = projectContext?.rooms || [];
  const boqRoomIds = new Set(boq.map(b => b.roomId).filter(Boolean));
  const unmappedRooms = definedRooms.filter(r => !boqRoomIds.has(r.id));

  // Essential Trades Check
  const missingEssentialTrades: string[] = [];
  const allItemText = boq.map(b => `${b.name} ${b.cat || ''} ${b.specs || ''}`.toLowerCase()).join(' ');

  ESSENTIAL_TRADES.forEach(trade => {
    const isPresent = trade.aliases.some(alias => allItemText.includes(alias) || Array.from(itemCategories).some(c => c.includes(alias)));
    if (!isPresent) {
      missingEssentialTrades.push(trade.label);
    }
  });

  // Snag & Execution Gate metrics
  const snagList: SnagItem[] = projectContext?.snagList || [];
  const openSnags = snagList.filter(s => s.status === 'open' || s.status === 'in_progress');
  const criticalSnags = openSnags.filter(s => s.severity === 'high');

  // Milestone / E1 status
  const milestones = projectContext?.paymentMilestones || [];
  const e1Milestone = milestones.find(m => 
    m.id?.includes('E1') || 
    m.id?.includes('e1') || 
    m.name?.toLowerCase().includes('order advance') || 
    m.name?.toLowerCase().includes('material advance') || 
    m.name?.toLowerCase().includes('e1') ||
    (m as any).title?.toLowerCase().includes('order advance') ||
    (m as any).title?.toLowerCase().includes('material advance') ||
    (m as any).title?.toLowerCase().includes('e1')
  );

  const mReceivedAmount = (e1Milestone as any)?.receivedAmount;
  const mAmount = (e1Milestone as any)?.amount || e1Milestone?.fixedAmount || (totalSell * ((e1Milestone?.percentage || 40) / 100));

  const e1PaymentCleared = Boolean(e1Milestone?.status === 'paid' || (mReceivedAmount && mReceivedAmount >= mAmount));
  const e1PaymentAmount = mAmount || (totalSell * 0.40);
  const e1PaidAmount = mReceivedAmount || (e1PaymentCleared ? e1PaymentAmount : 0);

  const boqFrozen = Boolean(projectContext?.boqFrozen || (projectContext?.designGate as any)?.status === 'frozen');
  const contractSigned = Boolean(
    projectContext?.executionSignoff?.signedAt || 
    projectContext?.contractSignoff?.signedAt || 
    projectContext?.termsSignoff?.signedAt
  );

  // ==========================================
  // PILLAR 1: SCOPE & BOQ COMPLETENESS (25 pts)
  // ==========================================
  let p1Score = 25;
  const p1Findings: PillarScore['findings'] = [];

  if (boq.length === 0) {
    p1Score = 0;
    p1Findings.push({ type: 'critical', message: 'BOQ is empty. No line items loaded.' });
  } else {
    // Room coverage
    if (unmappedRooms.length > 0) {
      const deduction = Math.min(6, unmappedRooms.length * 2);
      p1Score -= deduction;
      p1Findings.push({
        type: 'warning',
        message: `${unmappedRooms.length} room(s) (${unmappedRooms.map(r => r.name).join(', ')}) have no line items in the BOQ.`,
        actionable: true,
        actionId: 'map_rooms'
      });
    } else {
      p1Findings.push({ type: 'ok', message: `100% room coverage: All ${definedRooms.length || 'configured'} room(s) contain quoted line items.` });
    }

    // Missing trades
    if (missingEssentialTrades.length > 0) {
      const deduction = Math.min(8, missingEssentialTrades.length * 2);
      p1Score -= deduction;
      p1Findings.push({
        type: 'warning',
        message: `Missing baseline fit-out trade(s): ${missingEssentialTrades.slice(0, 3).join(', ')}.`,
        actionable: true,
        actionId: 'inject_trade'
      });
    } else {
      p1Findings.push({ type: 'ok', message: 'Comprehensive trade coverage: Core interior fit-out trades detected.' });
    }

    // Zero rate / qty anomalies
    if (zeroRateCount > 0) {
      p1Score -= Math.min(5, zeroRateCount * 1.5);
      p1Findings.push({
        type: 'critical',
        message: `${zeroRateCount} line item(s) have ₹0 rate or 0 quantity anomalies.`,
        actionable: true,
        actionId: 'fix_zero_rates'
      });
    } else {
      p1Findings.push({ type: 'ok', message: 'Pricing validity: Zero line item rate anomalies.' });
    }
  }
  p1Score = Math.max(0, Math.min(25, Math.round(p1Score)));

  // ==========================================
  // PILLAR 2: MARGIN & COMMERCIAL INTEGRITY (25 pts)
  // ==========================================
  let p2Score = 25;
  const p2Findings: PillarScore['findings'] = [];

  /* Gross margin threshold.
     These cut-offs were written when `calculateGrossMargin` returned MARKUP, so
     they read 15 / 22 and quoted a "28-35%" target -- all markup figures. The
     function now returns a true margin, so each one is restated: 15 markup is
     13.0 margin, 22 is 18.0, and the 28-35 target band is 22-26. The studio's
     pricing intent is unchanged; only the units are honest. */
  if (grossMarginPct < 13) {
    p2Score -= 12;
    p2Findings.push({ type: 'critical', message: `Gross margin (${grossMarginPct.toFixed(1)}%) is critically below the safe floor of 17%.` });
  } else if (grossMarginPct < 18) {
    p2Score -= 6;
    p2Findings.push({ type: 'warning', message: `Gross margin (${grossMarginPct.toFixed(1)}%) is tight. Target band is 22-26% (a 28-35% markup).` });
  } else {
    p2Findings.push({ type: 'ok', message: `Robust execution gross margin at ${grossMarginPct.toFixed(1)}% (Blended ${blendedMarginPct.toFixed(1)}%).` });
  }

  // Margin drags
  if (marginDragCount > 0) {
    const dragRatio = marginDragCount / (boq.length || 1);
    const deduction = Math.min(6, Math.round(dragRatio * 15) + (marginDragCount > 3 ? 3 : 1));
    p2Score -= deduction;
    p2Findings.push({
      type: 'warning',
      message: `${marginDragCount} item(s) are priced with sub-18% margins causing margin dilution.`,
      actionable: true,
      actionId: 'auto_fix_margins'
    });
  } else {
    p2Findings.push({ type: 'ok', message: 'Margin distribution is healthy: No low-margin drag items found.' });
  }

  // Material vs Labor Skew
  if (skewHealth === 'labor_underestimated') {
    p2Score -= 4;
    p2Findings.push({ type: 'warning', message: `Labor allocation (${laborRatio.toFixed(0)}%) is abnormally low. Risk of site execution cost blowout.` });
  } else if (skewHealth === 'labor_heavy') {
    p2Score -= 3;
    p2Findings.push({ type: 'info', message: `Labor ratio (${laborRatio.toFixed(0)}%) is elevated. Verify high custom craftsmanship scope.` });
  } else {
    p2Findings.push({ type: 'ok', message: `Balanced cost split: ${materialRatio.toFixed(0)}% Materials to ${laborRatio.toFixed(0)}% Labor.` });
  }
  p2Score = Math.max(0, Math.min(25, Math.round(p2Score)));

  // ==========================================
  // PILLAR 3: CASH FLOW & HARD-GATES (25 pts)
  // ==========================================
  let p3Score = 25;
  const p3Findings: PillarScore['findings'] = [];

  // E1 Hard Gate Rule
  if (boq.length > 0 && !e1PaymentCleared) {
    p3Score -= 8;
    p3Findings.push({
      type: 'warning',
      message: 'E1 Material Advance (40%) not cleared yet. Hard Gate: No vendor POs allowed before E1 settlement.',
      actionable: true,
      actionId: 'review_gate'
    });
  } else if (e1PaymentCleared) {
    p3Findings.push({ type: 'ok', message: 'E1 Material Advance Gate cleared. Site procurement authorization active.' });
  }

  // Design Fee structure
  if (!designFeeConfigured || designFee === 0) {
    p3Score -= 5;
    p3Findings.push({ type: 'warning', message: 'No Design Fee configured. Studio absorbs all design overheads into execution.' });
  } else {
    p3Findings.push({ type: 'ok', message: `Design Fee active: ${formatCurrency(designFee)} milestone protection.` });
  }

  // Milestone completeness
  if (milestones.length === 0) {
    p3Score -= 4;
    p3Findings.push({ type: 'info', message: 'Custom payment milestones not initialized. Using standard 40/30/20/10 execution tracks.' });
  } else {
    const overdueCount = milestones.filter(m => (m.status as string) === 'overdue' || (m.date && new Date(m.date) < new Date() && m.status !== 'paid')).length;
    if (overdueCount > 0) {
      p3Score -= Math.min(6, overdueCount * 3);
      p3Findings.push({ type: 'critical', message: `${overdueCount} payment milestone(s) currently overdue.` });
    }
  }
  p3Score = Math.max(0, Math.min(25, Math.round(p3Score)));

  // ==========================================
  // PILLAR 4: SITE GOVERNANCE & AUDIT (25 pts)
  // ==========================================
  let p4Score = 25;
  const p4Findings: PillarScore['findings'] = [];

  // Contract / Signoff Governance
  if (contractSigned) {
    p4Findings.push({ type: 'ok', message: 'Digital Agreement / Contract signed with valid timestamp & audit trail.' });
  } else {
    p4Score -= 5;
    p4Findings.push({ type: 'warning', message: 'Client execution agreement pending digital signature signoff.' });
  }

  // BOQ Baseline Freeze
  if (boqFrozen) {
    p4Findings.push({ type: 'ok', message: 'BOQ baseline is locked & frozen against unauthorized rate edits.' });
  } else {
    p4Score -= 3;
    p4Findings.push({ type: 'info', message: 'BOQ baseline is unfrozen (editable state).' });
  }

  // Snag density
  if (criticalSnags.length > 0) {
    p4Score -= Math.min(8, criticalSnags.length * 3);
    p4Findings.push({ type: 'critical', message: `${criticalSnags.length} high-severity site snag(s) open requiring resolution.` });
  } else if (openSnags.length > 0) {
    p4Score -= Math.min(4, openSnags.length * 1);
    p4Findings.push({ type: 'warning', message: `${openSnags.length} open snag item(s) logged in site snag tracker.` });
  } else {
    p4Findings.push({ type: 'ok', message: 'Snag Health Clean: Zero open blockers logged.' });
  }
  p4Score = Math.max(0, Math.min(25, Math.round(p4Score)));

  // ==========================================
  // COMPOSITE INDEX & VERDICT
  // ==========================================
  const compositeScore = p1Score + p2Score + p3Score + p4Score;
  const overallGrade = getGradeFromScore(compositeScore, 100);

  let statusLabel = 'PRIME HEALTH';
  let headlineSummary = 'Project is commercially and operationally sound with high margin security and verified governance.';
  let primaryRisk = 'None identified. Standard site monitoring recommended.';
  let nextRecommendedAction = 'Proceed with milestone tracking and procurement cadence.';

  if (compositeScore < 50) {
    statusLabel = 'CRITICAL RISK';
    headlineSummary = 'Severe commercial or operational vulnerabilities detected. Project requires immediate corrective intervention.';
    primaryRisk = grossMarginPct < 15 ? 'Unviable margin structure' : 'Incomplete scope and missing financial hard gates';
    nextRecommendedAction = 'Execute 1-Click Auto-Fix for margins and complete missing room scopes before proceeding.';
  } else if (compositeScore < 70) {
    statusLabel = 'CAUTION REQUIRED';
    headlineSummary = 'Moderate operational or cash-flow risks detected. Minor adjustments needed to secure target profit.';
    primaryRisk = marginDragCount > 0 ? `${marginDragCount} sub-par margin items diluting profit` : 'Pending client contract execution';
    nextRecommendedAction = 'Normalize low margin line items and ensure E1 advance is received.';
  } else if (compositeScore < 85) {
    statusLabel = 'SOUND POSITION';
    headlineSummary = 'Healthy project profile with minor optimization opportunities.';
    primaryRisk = unmappedRooms.length > 0 ? 'Partial room scope definitions' : 'Pending final milestone clear';
    nextRecommendedAction = 'Review missing trade suggestions and freeze BOQ baseline.';
  }

  // ==========================================
  // SMART ACTIONS GENERATOR
  // ==========================================
  const smartActions: SmartActionItem[] = [];

  if (marginDragCount > 0) {
    const potentialRecovery = boq.reduce((acc, item) => {
      if ((item.margin || 0) < 25) {
        const cost = (item.materials + item.labor) * item.qty;
        const currentSell = calculateSellPrice(item.materials, item.labor, item.margin) * item.qty;
        const targetSell = calculateSellPrice(item.materials, item.labor, 28) * item.qty;
        return acc + (targetSell - currentSell);
      }
      return acc;
    }, 0);

    smartActions.push({
      id: 'auto_fix_margins',
      type: 'auto_fix_margins',
      title: 'Smart Margin Normalizer',
      badge: 'PROFIT RECOVERY',
      impact: `+${formatCurrency(potentialRecovery)} Net Margin`,
      description: `Automatically adjust ${marginDragCount} items with sub-18% margins up to healthy studio standard (28%).`,
      urgency: 'high',
      data: { marginDragCount, potentialRecovery }
    });
  }

  if (missingEssentialTrades.length > 0) {
    smartActions.push({
      id: 'inject_trade',
      type: 'inject_trade',
      title: 'Auto-Inject Missing Baseline Trades',
      badge: 'SCOPE SAFETY',
      impact: 'Eliminates Unquoted Site Variation Claims',
      description: `Add standard bundles for ${missingEssentialTrades[0]} and protection packs to safeguard site budget.`,
      urgency: 'medium',
      data: { missingTrades: missingEssentialTrades }
    });
  }

  if (unmappedRooms.length > 0) {
    smartActions.push({
      id: 'map_rooms',
      type: 'map_rooms',
      title: 'Room Scope Completeness Sync',
      badge: 'COVERAGE GAP',
      impact: `${unmappedRooms.length} Rooms Unquoted`,
      description: `Configure items for ${unmappedRooms.map(r => r.name).join(', ')} to prevent scope omissions.`,
      urgency: 'medium',
      data: { unmappedRooms }
    });
  }

  if (zeroRateCount > 0) {
    smartActions.push({
      id: 'fix_zero_rates',
      type: 'fix_zero_rates',
      title: 'Zero-Rate & Pricing Anomaly Purge',
      badge: 'ESTIMATION BUG',
      impact: `${zeroRateCount} Items Flagged`,
      description: 'Highlight and apply bank baseline rates to ₹0 cost or quantity items.',
      urgency: 'high',
      data: { zeroRateCount }
    });
  }

  return {
    compositeScore,
    overallGrade,
    statusLabel,
    headlineSummary,
    primaryRisk,
    nextRecommendedAction,
    pillars: {
      scopeCompleteness: {
        score: p1Score,
        maxScore: 25,
        grade: getGradeFromScore(p1Score, 25),
        title: 'Scope & Specification Completeness',
        summary: unmappedRooms.length > 0 ? `${unmappedRooms.length} room(s) unquoted` : 'All rooms and trades covered',
        findings: p1Findings
      },
      marginIntegrity: {
        score: p2Score,
        maxScore: 25,
        grade: getGradeFromScore(p2Score, 25),
        title: 'Margin & Commercial Integrity',
        summary: `Blended margin: ${blendedMarginPct.toFixed(1)}%`,
        findings: p2Findings
      },
      cashflowHardgates: {
        score: p3Score,
        maxScore: 25,
        grade: getGradeFromScore(p3Score, 25),
        title: 'Cash Flow & Milestone Hard-Gates',
        summary: e1PaymentCleared ? 'E1 Gate Cleared' : 'E1 Advance Pending',
        findings: p3Findings
      },
      siteGovernance: {
        score: p4Score,
        maxScore: 25,
        grade: getGradeFromScore(p4Score, 25),
        title: 'Site Governance & Quality Audit',
        summary: `${openSnags.length} open snags · ${contractSigned ? 'Contract Signed' : 'Signoff Pending'}`,
        findings: p4Findings
      }
    },
    metrics: {
      listSell,
      contractedExecution: executionRevenue,
      discountValue,
      revenueSource,
      designFeeConfigured,
      totalSell,
      totalCost,
      netProfit,
      grossMarginPct,
      blendedMarginPct,
      designFee,
      materialCost,
      laborCost,
      materialRatio,
      laborRatio,
      skewHealth,
      totalItems: boq.length,
      marginDragCount,
      zeroRateCount,
      unmappedRoomCount: unmappedRooms.length,
      missingEssentialTrades,
      openSnagCount: openSnags.length,
      criticalSnagCount: criticalSnags.length,
      e1PaymentCleared,
      e1PaymentAmount,
      e1PaidAmount,
      boqFrozen,
      contractSigned
    },
    smartActions
  };
}

// Standard Baseline Template Injector for missing essential trades
export function generateEssentialTradeItems(tradeKey: string, roomId?: string): BoqItem[] {
  const generated: BoqItem[] = [];
  const targetRoom = roomId || 'room-general';

  if (tradeKey.includes('protection') || tradeKey.includes('cleaning')) {
    generated.push({
      id: generateId(),
      bankId: 'bank-prot-01',
      qty: 1,
      marginOverride: 25,
      roomId: targetRoom,
      rationale: 'Surface floor protection (corrugated sheet + bubble wrap) & post-work deep chemical cleaning'
    });
  } else if (tradeKey.includes('electrical')) {
    generated.push({
      id: generateId(),
      bankId: 'bank-elec-firstfix',
      qty: 15,
      marginOverride: 30,
      roomId: targetRoom,
      rationale: 'First-fix conduit laying, point shifting and master modular back-boxes'
    });
  } else if (tradeKey.includes('ceiling')) {
    generated.push({
      id: generateId(),
      bankId: 'bank-ceiling-cove',
      qty: 180,
      marginOverride: 28,
      roomId: targetRoom,
      rationale: 'Standard perimeter gypsum false ceiling with concealed LED cove trough'
    });
  }
  return generated;
}
