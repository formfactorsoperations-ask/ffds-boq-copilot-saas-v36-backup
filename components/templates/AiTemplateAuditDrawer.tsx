import React, { useState } from 'react';
import { Item, AIStrategy } from '../../types';
import { auditAiTemplate, AiTemplateAuditResult } from '../../services/geminiService';
import { ShieldCheck, AlertCircle, CheckCircle, Sparkles, Plus, RefreshCw } from 'lucide-react';
import BankModal from '../bank/BankModal';
import { Button, Chip, EmptyState, LABEL } from '../ui/kit';
import { Ring } from '../people/PeopleBits';
import { CountUp } from '../ui/HudBits';
import { GRADE_TIER } from '../../lib/materialSpecs';

/*
  Standard templates → AI audit: AI reads the open typology and says what a
  full interior of that kind usually has that this one lacks, with items from
  the Item bank to fill each gap. A gap is filled only when its Add is clicked.
*/

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
  /* The audit failing used to leave an empty window with nothing said. */
  const [failed, setFailed] = useState<string | null>(null);

  const bankMap = React.useMemo(() => new Map<string, Item>(bank.map(i => [i.id, i])), [bank]);

  const runAudit = React.useCallback(async () => {
    setIsAuditing(true);
    setAuditResult(null);
    setFailed(null);
    setAppliedGaps(new Set());
    try {
      const result = await auditAiTemplate(configName, rooms, bank, aiStrategy as AIStrategy);
      setAuditResult(result);
    } catch (err: any) {
      console.error("Audit failed:", err);
      setFailed(err?.message || 'AI could not read the typology. Please try again.');
    } finally {
      setIsAuditing(false);
    }
  }, [configName, rooms, bank, aiStrategy]);

  /*
    It runs once each time the window opens. It used to run again whenever the
    typology changed, which adding a gap's items does: the first Add threw the
    whole audit away and started another.
  */
  const run = React.useRef(runAudit);
  run.current = runAudit;
  React.useEffect(() => {
    if (isOpen) run.current();
  }, [isOpen]);

  if (!isOpen) return null;

  const gaps = auditResult?.missingTrades || [];
  const fillable = (gap: { suggestedBankItemIds?: string[] }) => !!gap.suggestedBankItemIds && gap.suggestedBankItemIds.length > 0;
  const toFill = gaps.filter((g, i) => fillable(g) && !appliedGaps.has(i)).length;

  const handleApplySingleGap = (idx: number, gap: any) => {
    if (!fillable(gap)) return;
    onAddMissingItems(gap.suggestedBankItemIds.map((itemId: string) => ({ roomType: gap.roomType || 'general', itemId })));
    setAppliedGaps(prev => new Set(prev).add(idx));
  };

  const handleApplyAllGaps = () => {
    const allAdditions: Array<{ roomType: string; itemId: string }> = [];
    const done = new Set(appliedGaps);
    gaps.forEach((gap, idx) => {
      if (!fillable(gap) || done.has(idx)) return;
      gap.suggestedBankItemIds.forEach(id => allAdditions.push({ roomType: gap.roomType || 'general', itemId: id }));
      done.add(idx);
    });
    if (allAdditions.length > 0) onAddMissingItems(allAdditions);
    setAppliedGaps(done);
  };

  const score = Math.max(0, Math.min(100, Number(auditResult?.score) || 0));
  const advice = auditResult?.tierStrategyAdvice;

  return (
    <BankModal
      label="AI audit" eyebrow={`Standard templates · ${configName}`} title="AI audit"
      blurb="What a full interior of this kind usually has that this typology lacks. A gap is filled only when you add it."
      size="xl" onClose={onClose} locked={isAuditing}
      footer={
        <>
          <Button icon={RefreshCw} onClick={runAudit} disabled={isAuditing}>Audit again</Button>
          <Button variant="primary" onClick={onClose} disabled={isAuditing}>Done</Button>
        </>
      }
    >
      {isAuditing && (
        <div className="rounded-xl border border-slate-200 p-5 flex items-center gap-3 hud-scanning" role="status">
          <span className="w-4 h-4 border-2 border-[#3D52A0] border-t-transparent rounded-full motion-safe:animate-spin shrink-0" />
          <span className="text-xs text-slate-600">Reading {configName}: its rooms, trades and what each option would get.</span>
        </div>
      )}

      {failed && !isAuditing && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-2 text-xs text-rose-800" role="alert">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden />
          <span>{failed}</span>
        </div>
      )}

      {auditResult && !isAuditing && (
        <div className="space-y-5 hud-panel-in">
          {/* The score, as AI gives it. */}
          <div className="rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4">
            <Ring value={score / 100} size={84} stroke={8} tone={score >= 85 ? 'ok' : 'warn'} label={`Score ${score} of 100`}>
              <span className="text-xl font-black text-slate-800 tabular-nums"><CountUp value={score} /></span>
            </Ring>
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-800">Score, out of 100</span>
                <Chip tone={score >= 85 ? 'good' : 'warn'}>{score >= 85 ? 'Ready to use' : 'Worth a look'}</Chip>
              </div>
              <p className="text-xs text-slate-600 mt-1">{auditResult.summary}</p>
            </div>
          </div>

          {/* What is missing. */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span className={LABEL}>What is missing ({gaps.length})</span>
              {toFill > 0 && (
                <Button size="sm" variant="primary" onClick={handleApplyAllGaps}>
                  <Sparkles className="w-3.5 h-3.5" aria-hidden />Add all {toFill}
                </Button>
              )}
            </div>
            {gaps.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="Nothing found missing" text="AI found carpentry, services and civil work covered in this typology." />
            ) : (
              <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {gaps.map((gap, idx) => {
                  const isApplied = appliedGaps.has(idx);
                  const can = fillable(gap);
                  return (
                    <li key={idx} className={`hud-row-in p-4 transition-colors ${isApplied ? 'bg-slate-50' : ''}`} style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 basis-64">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip tone="warn">{gap.trade}</Chip>
                            <span className="text-sm font-semibold text-slate-800 capitalize">{String(gap.roomType || 'general').replace(/_/g, ' ')}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1.5">{gap.reason}</p>
                        </div>
                        {isApplied ? (
                          <span className="hud-row-in flex items-center gap-1.5 text-xs font-bold text-emerald-700 shrink-0"><CheckCircle className="w-4 h-4" aria-hidden />Added</span>
                        ) : (
                          <Button size="sm" icon={Plus} onClick={() => handleApplySingleGap(idx, gap)} disabled={!can}
                            title={can ? undefined : 'The Item bank has nothing for this. Add an item there first.'} className="shrink-0">Add to the room</Button>
                        )}
                      </div>
                      {can ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">From the Item bank:</span>
                          {gap.suggestedBankItemIds.map(id => (
                            <span key={id} className="px-2 py-0.5 rounded-full border border-slate-200 text-[11px] font-semibold text-slate-700">{bankMap.get(id)?.name || id}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-slate-500">
                          The Item bank has nothing for this{gap.suggestedNewItemName ? <>. AI suggests adding <b className="font-semibold text-slate-700">{gap.suggestedNewItemName}</b></> : ''}.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* What it already does well. */}
          {auditResult.strengths && auditResult.strengths.length > 0 && (
            <div>
              <span className={`${LABEL} block mb-1.5`}>What it already covers</span>
              <ul className="space-y-1.5">
                {auditResult.strengths.map((str, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-px" aria-hidden />
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* How AI would split it across the three options. */}
          {advice && (
            <div>
              <span className={`${LABEL} block mb-1.5`}>How AI would split it across the options</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {([['E', advice.essential], ['C', advice.comfort], ['P', advice.harmony]] as const).map(([g, text]) => (
                  <div key={g} className={`p-3 rounded-xl border ${g === 'C' ? 'border-[#3D52A0]/30 bg-[#3D52A0]/[0.03]' : 'border-slate-200'}`}>
                    <p className={`${LABEL} mb-1`}>{GRADE_TIER[g]}</p>
                    <p className="text-xs text-slate-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </BankModal>
  );
};
