import React, { useState } from 'react';
import { ProjectContext } from '../../types';
import { useOrg } from '../../contexts/OrgContext';
import {
  ENGAGEMENTS, EngagementType, canChangeEngagement, engagementDef, engagementOf,
  isFeeOnly, offeredEngagements, proposalModeFor,
} from '../../lib/engagement';
import { Briefcase } from '@/lib/lucide-shim';

/**
 * Apply an engagement to a project's context.
 *
 * Besides storing the choice, it points the proposal at the matching template
 * and, for a fee-only engagement, moves a percentage fee to a rate per sq ft:
 * a percentage of an execution value the studio is not selling comes to ₹0.
 */
export function applyEngagement(prev: ProjectContext, to: EngagementType, org?: any): ProjectContext {
  const next: ProjectContext = { ...prev, engagementType: to, activeProposalMode: proposalModeFor(to) };
  if (isFeeOnly(to) && (!prev.designFeeType || prev.designFeeType === 'percentage')) {
    next.designFeeType = 'fixed_sqft';
    next.designFee = Number(org?.designOnlyFeePerSqft) || 0;
  }
  return next;
}

/*
  What the studio has been engaged to do on this project. Shown in Project
  setup and in the new-project wizard, only when the studio offers more than
  one kind of engagement (Studio settings → Engagements).
*/
export default function EngagementPicker({ projectContext, setProjectContext }: {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}) {
  const { orgData } = useOrg();
  const [blocked, setBlocked] = useState<string | null>(null);
  const current = engagementOf(projectContext);
  const offered = offeredEngagements(orgData);
  const options = ENGAGEMENTS.filter((e) => offered.includes(e.id) || e.id === current);

  if (options.length < 2) return null;

  // A project already under way may have a BOQ and a proposal priced on it.
  const underWay = (projectContext.lifecycle?.stage || 1) > 1 || !!projectContext.approvedTierId;

  const choose = (to: EngagementType) => {
    if (to === current) return;
    const change = canChangeEngagement(projectContext, to);
    if (!change.ok) {
      setBlocked(change.reason || 'This project cannot change engagement.');
      return;
    }
    setBlocked(null);
    if (!change.upgrade && isFeeOnly(to) && underWay) {
      const ok = window.confirm(
        `Make this a ${engagementDef(to).adjective} project? The BOQ stays saved but leaves the project rail, and Money bills the design fee only.`,
      );
      if (!ok) return;
    }
    setProjectContext((prev) => applyEngagement(prev, to, orgData));
  };

  return (
    <div className="glass-light rounded-2xl border border-[#3D52A0]/15 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)] hud-panel-in">
      <div className="px-6 py-4 glass-light border-b border-[#3D52A0]/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">
          <Briefcase className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h5 className="font-bold text-slate-800">Engagement</h5>
          <p className="text-xs text-slate-500">What the studio has been engaged to do on this project</p>
        </div>
      </div>
      <div className="p-6 space-y-3">
        <div className="inline-flex flex-wrap p-1 rounded-xl bg-slate-100" role="radiogroup" aria-label="Engagement">
          {options.map((e) => {
            const on = e.id === current;
            return (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(e.id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  on ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {e.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">{engagementDef(current).blurb}.</p>
        {isFeeOnly(current) && (
          <p className="text-[11px] text-slate-500">
            The BOQ, pricing, execution agreement and site screens are off the project rail, and Money bills the design fee only.
            You can move the project to turnkey later if the client asks the studio to build; the design fee stays as agreed.
          </p>
        )}
        {blocked && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{blocked}</p>
        )}
      </div>
    </div>
  );
}
