import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FullProjectData } from '../../../types';
import { classifyProject } from '../../../lib/projectClassification';
import { goalsReport, actualLeads, linesToOverheads, shortDate, type FounderPlan } from '../../../lib/founderGoals';
import type { ReportTargets } from '../../../lib/reportTargets';
import type { ProjectFact } from '../../../lib/ownerReports';
import type { Lead } from '../../../lib/leads';
import { loadPlan, savePlan } from '../../../services/founderGoalsService';
import { Dot } from '../../ui/HudBits';
import { Chip, Empty } from './ReportBits';
import FoundersGoals from './FoundersGoals';
import { Lock } from '@/lib/lucide-shim';

/*
  The Founders' goals tab: loads the founders' plan, keeps it as they type,
  saves it a moment after they stop, and hands the worked-out report to the
  screen. Studio costs the founders list are folded back into Set targets'
  overheads, so break-even reads the same on both tabs.
*/

const SAVE_AFTER_MS = 900;

export default function FoundersGoalsTab({ tenantId, me, all, facts, leads, leadsRead, targets, roster, canSetTargets, saveTargets, onOpenProject }: {
  tenantId: string;
  me: string;
  all: FullProjectData[];
  facts: ProjectFact[];
  leads: Lead[];
  leadsRead: boolean;
  targets: ReportTargets;
  roster: { email: string; name: string; role: string }[];
  canSetTargets: boolean;
  saveTargets: (t: ReportTargets) => Promise<void>;
  onOpenProject: (id: string) => void;
}) {
  const [plan, setPlan] = useState<FounderPlan | null | undefined>(undefined);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [now] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<FounderPlan | null>(null);

  useEffect(() => {
    let alive = true;
    loadPlan(tenantId).then((p) => { if (alive) { setPlan(p); latest.current = p; } });
    return () => { alive = false; };
  }, [tenantId]);

  const flush = async () => {
    const p = latest.current;
    if (!p) return;
    setStatus('saving');
    try {
      await savePlan(tenantId, p, me);
      if (p.studio && canSetTargets) {
        const o = linesToOverheads(p.studio);
        const t = targets.overheads;
        if (o.salaries !== t.salaries || o.rent !== t.rent || o.other !== t.other) {
          await saveTargets({ ...targets, overheads: o }).catch(() => undefined);
        }
      }
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };
  /* Save what is pending when the tab closes, rather than drop it. */
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void flush(); } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const set = (patch: Partial<FounderPlan>) => {
    setPlan((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...patch };
      latest.current = next;
      return next;
    });
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, SAVE_AFTER_MS);
  };

  const testIds = useMemo(() => new Set(all.filter((p) => classifyProject(p) === 'test').map((p) => p.id)), [all]);
  const counts = useMemo(() => {
    const c = { actual: 0, test: 0, untagged: 0 };
    for (const p of all) c[classifyProject(p)]++;
    return c;
  }, [all]);
  const realLeads = useMemo(() => actualLeads(leads, testIds), [leads, testIds]);
  const team = useMemo(() => ({
    designers: roster.filter((m) => m.role === 'Designer').length,
    supervisors: roster.filter((m) => m.role === 'Site Supervisor').length,
    perDesigner: targets.projectsPerDesigner,
    perSupervisor: targets.sitesPerSupervisor,
  }), [roster, targets]);

  const report = useMemo(() => (plan ? goalsReport({
    facts, leads: leadsRead ? realLeads : null, plan, overheads: targets.overheads, team, now,
  }) : null), [plan, facts, realLeads, leadsRead, targets.overheads, team, now]);

  if (plan === undefined) {
    return <div className="flex items-center gap-2 text-xs text-slate-500 py-6"><Dot tone="ok" live />Reading the founders' plan</div>;
  }
  if (plan === null || !report) {
    return <Empty>The founders' plan could not be read. Check the connection and open the tab again; if it keeps happening, the Firestore rules for founderGoals may not be published yet.</Empty>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="pt-1 pb-3 border-b border-slate-200/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold text-slate-800">{report.quarter.label} · {report.quarter.span}</span>
          <span className="text-xs text-slate-500">{report.fy.label} · today is {shortDate(now)}</span>
          <span className="text-xs text-slate-500" aria-live="polite">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? <b className="text-rose-700">Not saved: check the connection</b> : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip tone="ok">Counting {counts.actual} actual {counts.actual === 1 ? 'project' : 'projects'}{leadsRead ? ` and ${realLeads.length} leads` : ''}</Chip>
          <Chip>{counts.test} dummy and {counts.untagged} untagged left out</Chip>
          <Chip><span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" />Founders only</span></Chip>
        </div>
      </div>
      <FoundersGoals r={report} plan={plan} set={set} onOpenProject={onOpenProject} leadsRead={leadsRead} />
    </div>
  );
}
