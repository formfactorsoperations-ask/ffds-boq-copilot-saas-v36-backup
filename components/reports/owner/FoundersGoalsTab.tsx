import React, { useMemo, useState } from 'react';
import type { FullProjectData } from '../../../types';
import { shortDate } from '../../../lib/founderGoals';
import type { ReportTargets } from '../../../lib/reportTargets';
import type { ProjectFact } from '../../../lib/ownerReports';
import type { Lead } from '../../../lib/leads';
import { Dot } from '../../ui/HudBits';
import { Chip, Empty } from './ReportBits';
import FoundersGoals from './FoundersGoals';
import { useFounderPlan, useGoalsReport, type SaveStatus } from './useFounderGoals';
import { Lock } from '@/lib/lucide-shim';

/*
  The Founders' goals tab: the founders' plan (useFounderPlan), the report on
  the projects they count (useGoalsReport), and the screen.
*/

export interface FoundersTabProps {
  tenantId: string;
  me: string;
  all: FullProjectData[];
  /** Every project's facts; the founders' choices decide which count. */
  facts: ProjectFact[];
  leads: Lead[];
  leadsRead: boolean;
  targets: ReportTargets;
  roster: { email: string; name: string; role: string }[];
  canSetTargets: boolean;
  saveTargets: (t: ReportTargets) => Promise<void>;
  onOpenProject: (id: string) => void;
  /** Open the Founders' goals tab. */
  onGoals?: () => void;
}

export const SavedNote: React.FC<{ status: SaveStatus }> = ({ status }) => (
  <span className="text-xs text-slate-500" aria-live="polite">
    {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? <b className="text-rose-700">Not saved: check the connection</b> : ''}
  </span>
);

export const FoundersOnly = () => (
  <Chip><span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" />Founders only</span></Chip>
);

export const PlanState: React.FC<{ plan: unknown }> = ({ plan }) =>
  plan === undefined
    ? <div className="flex items-center gap-2 text-xs text-slate-500 py-6"><Dot tone="ok" live />Reading the founders' plan</div>
    : <Empty>The founders' plan could not be read. Check the connection and open the tab again; if it keeps happening, the Firestore rules for founderGoals may not be published yet.</Empty>;

export default function FoundersGoalsTab(props: FoundersTabProps) {
  const { tenantId, me, all, facts, leads, leadsRead, targets, roster, canSetTargets, saveTargets, onOpenProject } = props;
  const { plan, set, status } = useFounderPlan(tenantId, me, targets, canSetTargets, saveTargets);
  const [now] = useState(() => Date.now());
  const { tags, counted, realLeads, report } = useGoalsReport({ all, facts, leads, leadsRead, targets, roster, plan, now });
  const counts = useMemo(() => {
    const c = { actual: 0, test: 0, untagged: 0 };
    for (const t of tags.values()) c[t]++;
    return c;
  }, [tags]);

  if (!plan || !report) return <PlanState plan={plan} />;
  const countedIds = new Set(counted.map((f) => f.id));
  const leftOut = all.length - all.filter((p) => countedIds.has(p.id)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="pt-1 pb-3 border-b border-slate-200/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold text-slate-800">{report.quarter.label} · {report.quarter.span}</span>
          <span className="text-xs text-slate-500">{report.fy.label} · today is {shortDate(now)}</span>
          <SavedNote status={status} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip tone="ok">Counting {countedIds.size} {countedIds.size === 1 ? 'project' : 'projects'}{leadsRead ? ` and ${realLeads.length} leads` : ''}</Chip>
          <Chip>{leftOut} left out{counts.test || counts.untagged ? `: ${counts.test} dummy, ${counts.untagged} untagged by default` : ''}</Chip>
          <FoundersOnly />
        </div>
      </div>
      <FoundersGoals r={report} plan={plan} set={set} onOpenProject={onOpenProject} leadsRead={leadsRead} facts={facts} tags={tags} />
    </div>
  );
}
