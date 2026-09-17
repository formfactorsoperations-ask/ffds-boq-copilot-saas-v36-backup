import React, { useState } from 'react';
import { Item, AIStrategy } from '../../types';
import { auditAiTemplate, AiTemplateAuditResult } from '../../services/geminiService';
import { ShieldCheck, AlertTriangle, CheckCircle, Sparkles, Loader2, X, Plus, ArrowRight, Layers, FileCheck } from 'lucide-react';

interface AiTemplateAuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  configName: string;
  rooms: Record<string, string[]>;
  bank: Item[];
  aiStrategy?: AIStrategy;
  onAddMissingItems: (itemsToAdd: Array<{ roomType: string; itemId: string }>) => void;
}

export const AiTemplateAuditDrawer: React.FC<AiTemplateAuditDrawerProps> = ({
  isOpen,
  onClose,
  configName,
  rooms,
  bank,
  aiStrategy = 'balanced',
  onAddMissingItems
}) => {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AiTemplateAuditResult | null>(null);
  const [appliedGaps, setAppliedGaps] = useState<Set<number>>(new Set());

  const bankMap = React.useMemo(() => new Map<string, Item>(bank.map(i => [i.id, i])), [bank]);

  const runAudit = React.useCallback(async () => {
    setIsAuditing(true);
    setAuditResult(null);
    setAppliedGaps(new Set());
    try {
      const result = await auditAiTemplate(configName, rooms, bank, aiStrategy as AIStrategy);
      setAuditResult(result);
    } catch (err) {
      console.error("Audit failed:", err);
    } finally {
      setIsAuditing(false);
    }
  }, [configName, rooms, bank, aiStrategy]);

  React.useEffect(() => {
    if (isOpen) {
      runAudit();
    }
  }, [isOpen, runAudit]);

  if (!isOpen) return null;

  const handleApplySingleGap = (idx: number, gap: any) => {
    if (!gap.suggestedBankItemIds || gap.suggestedBankItemIds.length === 0) return;
    const additions = gap.suggestedBankItemIds.map((itemId: string) => ({
      roomType: gap.roomType || 'general',
      itemId
    }));
    onAddMissingItems(additions);
    setAppliedGaps(prev => new Set(prev).add(idx));
  };

  const handleApplyAllGaps = () => {
    if (!auditResult?.missingTrades) return;
    const allAdditions: Array<{ roomType: string; itemId: string }> = [];
    auditResult.missingTrades.forEach((gap, idx) => {
      if (gap.suggestedBankItemIds && gap.suggestedBankItemIds.length > 0) {
        gap.suggestedBankItemIds.forEach(id => {
          allAdditions.push({
            roomType: gap.roomType || 'general',
            itemId: id
          });
        });
        setAppliedGaps(prev => new Set(prev).add(idx));
      }
    });
    if (allAdditions.length > 0) {
      onAddMissingItems(allAdditions);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-sky-950 text-white flex items-center justify-between border-b border-sky-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold tracking-tight">AI Scope Auditor & Gap Detector</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400 text-slate-950">
                  Live Audit
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Target Typology: <span className="font-bold text-white">{configName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {isAuditing && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-4 bg-sky-50 text-[#3D52A0] rounded-full animate-spin">
                <Loader2 className="w-8 h-8" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Auditing Trade Completeness...</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Checking for standard MEP, civil protection, deep cleaning, and hardware omissions against interior best practices.
                </p>
              </div>
            </div>
          )}

          {auditResult && !isAuditing && (
            <div className="space-y-6 animate-in fade-in-50 duration-300">
              {/* Score Banner */}
              <div className="p-4 bg-gradient-to-br from-slate-50 to-sky-50/60 border border-sky-100 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scope Health Score</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-3xl font-black text-slate-900">{auditResult.score}</span>
                    <span className="text-xs text-slate-500 font-bold">/ 100</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 max-w-md">{auditResult.summary}</p>
                </div>
                <div className={`p-4 rounded-2xl flex flex-col items-center justify-center shrink-0 border ${
                  auditResult.score >= 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <ShieldCheck className="w-7 h-7 mb-1" />
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    {auditResult.score >= 85 ? 'Production Ready' : 'Optimization Recommended'}
                  </span>
                </div>
              </div>

              {/* Strengths */}
              {auditResult.strengths && auditResult.strengths.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Verified Strengths</span>
                  <div className="space-y-1.5">
                    {auditResult.strengths.map((str, idx) => (
                      <div key={idx} className="p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl flex items-center gap-2.5 text-xs text-emerald-900 font-medium">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{str}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Trades / Gaps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Identified Scope Gaps & Recommendations ({auditResult.missingTrades.length})
                  </span>
                  {auditResult.missingTrades.length > 0 && (
                    <button
                      onClick={handleApplyAllGaps}
                      className="px-3 py-1 bg-[#3D52A0] hover:bg-[#334486] text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      Auto-Add All Missing
                    </button>
                  )}
                </div>

                {auditResult.missingTrades.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
                    No critical trade gaps detected. Your master list has comprehensive coverage across carpentry, MEP, and civil works.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {auditResult.missingTrades.map((gap, idx) => {
                      const isApplied = appliedGaps.has(idx);
                      return (
                        <div
                          key={idx}
                          className={`p-4 border rounded-2xl transition-all ${
                            isApplied ? 'bg-emerald-50/40 border-emerald-200 opacity-75' : 'bg-white border-slate-200 hover:border-sky-300 shadow-sm'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold uppercase tracking-wide">
                                  {gap.trade}
                                </span>
                                <span className="text-xs font-bold text-slate-800 capitalize">
                                  Target Room: {gap.roomType}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{gap.reason}</p>
                            </div>
                            <button
                              onClick={() => handleApplySingleGap(idx, gap)}
                              disabled={isApplied || (!gap.suggestedBankItemIds || gap.suggestedBankItemIds.length === 0)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 ml-3 ${
                                isApplied
                                  ? 'bg-emerald-100 text-emerald-800 cursor-default'
                                  : 'bg-sky-50 text-[#3D52A0] hover:bg-[#3D52A0] hover:text-white border border-sky-200'
                              }`}
                            >
                              {isApplied ? (
                                <>
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  Added
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  Add to Scope
                                </>
                              )}
                            </button>
                          </div>

                          {gap.suggestedBankItemIds && gap.suggestedBankItemIds.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 items-center">
                              <span className="text-[10px] text-slate-400 font-semibold">Suggested Bank Items:</span>
                              {gap.suggestedBankItemIds.map(id => {
                                const item = bankMap.get(id);
                                return (
                                  <span key={id} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-medium">
                                    {item ? item.name : id}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tier Strategy Advice */}
              {auditResult.tierStrategyAdvice && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Tier Formulation Guide
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-3 bg-white border border-slate-200 rounded-xl">
                      <p className="font-bold text-emerald-700 mb-1">1. Base (Essential)</p>
                      <p className="text-slate-600 text-[11px] leading-relaxed">{auditResult.tierStrategyAdvice.essential}</p>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 rounded-xl">
                      <p className="font-bold text-[#334486] mb-1">2. Mid (Comfort)</p>
                      <p className="text-slate-600 text-[11px] leading-relaxed">{auditResult.tierStrategyAdvice.comfort}</p>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 rounded-xl">
                      <p className="font-bold text-purple-700 mb-1">3. Top (Harmony)</p>
                      <p className="text-slate-600 text-[11px] leading-relaxed">{auditResult.tierStrategyAdvice.harmony}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button
            onClick={runAudit}
            disabled={isAuditing}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-white transition-colors"
          >
            Re-Audit Template
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white rounded-lg text-xs font-bold transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
