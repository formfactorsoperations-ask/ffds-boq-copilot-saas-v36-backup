import React, { useMemo, useState } from 'react';
import { BoqItem, Item, AIStrategy, FullBoqItem, ProposalTier, ProjectContext } from '../types';
import { computeProjectHealth } from './healthAudit/healthEngine';
import { HealthIndexRadar } from './healthAudit/HealthIndexRadar';
import { SmartActionQueue } from './healthAudit/SmartActionQueue';
import { ForensicMarginMatrix } from './healthAudit/ForensicMarginMatrix';
import { GateReadinessAudit } from './healthAudit/GateReadinessAudit';
import { StressTestLab } from './healthAudit/StressTestLab';
import ScenarioSimulator from './ScenarioSimulator';
import MarginOptimizer from './MarginOptimizer';
import ProfitabilityHotspots from './ProfitabilityHotspots';
import {
  ShieldCheck,
  Activity,
  BarChart3,
  Sliders,
  Lock
} from 'lucide-react';

interface AnalyticsTabProps {
  boq: FullBoqItem[];
  setBoq: React.Dispatch<React.SetStateAction<BoqItem[]>>;
  bank: Item[];
  activeTab: string;
  aiStrategy: AIStrategy;
  tiers?: ProposalTier[];
  projectContext?: ProjectContext;
  /** Real role from orgData. Repricing is owner-only. */
  currentUserRole?: string;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  boq,
  setBoq,
  bank,
  activeTab: _activeTab,
  aiStrategy,
  tiers = [],
  projectContext,
  currentUserRole = 'Designer'
}) => {
  const [subView, setSubView] = useState<'diagnostic' | 'margins' | 'gates' | 'simulator'>('diagnostic');

  /* Only owners reprice, and never once the BOQ is frozen. Both guards are
     passed down rather than assumed by the children -- this screen used to send
     isOwner={true} unconditionally. */
  const canReprice = currentUserRole !== 'Designer';

  // Compute Comprehensive Real-Time Project Health Report
  const healthReport = useMemo(() => {
    return computeProjectHealth(boq, projectContext, tiers);
  }, [boq, projectContext, tiers]);

  if (boq.length === 0) {
    return (
      <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto my-12 space-y-4">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Health Check & Forensic Audit</h3>
        <p className="text-sm text-slate-500 leading-relaxed">
          No line items found in the current BOQ scope. Add rooms and specifications in the BOQ builder to run forensic health diagnostics, margin audits, and hard-gate checks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8" id="health-check-audit">
      {/* 1. TOP NAVIGATION PILLS BAR */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-3 rounded-3xl border border-slate-200 shadow-xs">
        <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setSubView('diagnostic')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shrink-0 ${subView === 'diagnostic' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Activity className="w-4 h-4 text-blue-600" />
            Health Diagnostic HQ
          </button>

          <button
            onClick={() => setSubView('margins')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shrink-0 ${subView === 'margins' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            Margin Forensic Ledger
          </button>

          <button
            onClick={() => setSubView('gates')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shrink-0 ${subView === 'gates' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Lock className="w-4 h-4 text-purple-600" />
            Hard-Gate Radar
          </button>

          <button
            onClick={() => setSubView('simulator')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shrink-0 ${subView === 'simulator' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Sliders className="w-4 h-4 text-amber-600" />
            Stress-Test Lab
          </button>
        </div>
      </div>

      {/* 2. TAB CONTENT VIEWS */}

      {/* VIEW 1: HEALTH DIAGNOSTIC HQ */}
      {subView === 'diagnostic' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <HealthIndexRadar
            report={healthReport}
            onSelectAction={actionId => {
              if (actionId === 'auto_fix_margins') setSubView('margins');
              else if (actionId === 'review_gate') setSubView('gates');
            }}
          />

          <SmartActionQueue
            smartActions={healthReport.smartActions}
            boq={boq}
            setBoq={setBoq}
            bank={bank}
            boqFrozen={healthReport.metrics.boqFrozen}
            canEdit={canReprice}
          />

        </div>
      )}

      {/* VIEW 2: MARGIN FORENSIC LEDGER */}
      {subView === 'margins' && (
        <div className="animate-in fade-in duration-300">
          <ForensicMarginMatrix
            boq={boq}
            setBoq={setBoq}
            isOwner={canReprice}
            boqFrozen={healthReport.metrics.boqFrozen}
          />
        </div>
      )}

      {/* VIEW 3: HARD-GATE COMPLIANCE RADAR */}
      {subView === 'gates' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <GateReadinessAudit
            projectContext={projectContext}
            boq={boq}
            totalSell={healthReport.metrics.totalSell}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MarginOptimizer
              boq={boq}
              setBoq={setBoq}
              aiStrategy={aiStrategy}
            />
            <ProfitabilityHotspots
              boq={boq}
            />
          </div>
        </div>
      )}

      {/* VIEW 4: STRESS-TEST LAB & SIMULATOR */}
      {subView === 'simulator' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <StressTestLab
            totalSell={healthReport.metrics.totalSell}
            totalCost={healthReport.metrics.totalCost}
            materialCost={healthReport.metrics.materialCost}
            laborCost={healthReport.metrics.laborCost}
            designFee={healthReport.metrics.designFee}
          />

          <ScenarioSimulator
            boq={boq}
            projectContext={projectContext}
          />
        </div>
      )}
    </div>
  );
};

export default AnalyticsTab;
