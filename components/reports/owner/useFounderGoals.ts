import { useEffect, useMemo, useRef, useState } from 'react';
import type { FullProjectData } from '../../../types';
import { classifyProject } from '../../../lib/projectClassification';
import { goalsReport, actualLeads, linesToOverheads, isCounted, type FounderPlan, type ProjectTag } from '../../../lib/founderGoals';
import type { ReportTargets } from '../../../lib/reportTargets';
import type { ProjectFact } from '../../../lib/ownerReports';
import type { Lead } from '../../../lib/leads';
import { loadPlan, savePlan } from '../../../services/founderGoalsService';

/*
  The founders' plan, shared by the Founders' goals and What if tabs: loaded
  once a tab opens, kept as they play, and saved a moment after they stop.
  Studio costs the founders list are folded back into Set targets' overheads,
  so break-even reads the same everywhere.
*/

const SAVE_AFTER_MS = 900;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useFounderPlan(tenantId: string, me: string, targets: ReportTargets, canSetTargets: boolean, saveTargets: (t: ReportTargets) => Promise<void>) {
  const [plan, setPlan] = useState<FounderPlan | null | undefined>(undefined);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<FounderPlan | null>(null);
  const deps = useRef({ targets, canSetTargets, saveTargets });
  deps.current = { targets, canSetTargets, saveTargets };

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
      const { targets: t, canSetTargets: can, saveTargets: saveT } = deps.current;
      if (p.studio && can) {
        const o = linesToOverheads(p.studio);
        if (o.salaries !== t.overheads.salaries || o.rent !== t.overheads.rent || o.other !== t.overheads.other) {
          await saveT({ ...t, overheads: o }).catch(() => undefined);
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

  const set = (patch: Partial<FounderPlan> | ((p: FounderPlan) => Partial<FounderPlan>)) => {
    setPlan((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) };
      latest.current = next;
      return next;
    });
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, SAVE_AFTER_MS);
  };

  return { plan, set, status };
}

/** Every project's tag, which are counted, and the goals report on the counted ones. */
export function useGoalsReport({ all, facts, leads, leadsRead, targets, roster, plan, now }: {
  all: FullProjectData[];
  facts: ProjectFact[];
  leads: Lead[];
  leadsRead: boolean;
  targets: ReportTargets;
  roster: { email: string; name: string; role: string }[];
  plan: FounderPlan | null | undefined;
  now: number;
}) {
  const tags = useMemo(() => {
    const m = new Map<string, ProjectTag>();
    for (const p of all) m.set(p.id, classifyProject(p));
    return m;
  }, [all]);
  const counted = useMemo(() => (plan ? facts.filter((f) => isCounted(f.id, tags.get(f.id) || 'untagged', plan)) : []), [facts, tags, plan]);
  /* Leads tied to a project the founders do not count are left out with it. */
  const notCounted = useMemo(() => new Set(plan ? all.filter((p) => !isCounted(p.id, tags.get(p.id) || 'untagged', plan) && tags.get(p.id) === 'test').map((p) => p.id) : []), [all, tags, plan]);
  const realLeads = useMemo(() => actualLeads(leads, notCounted), [leads, notCounted]);
  const team = useMemo(() => ({
    designers: roster.filter((m) => m.role === 'Designer').length,
    supervisors: roster.filter((m) => m.role === 'Site Supervisor').length,
    perDesigner: targets.projectsPerDesigner,
    perSupervisor: targets.sitesPerSupervisor,
  }), [roster, targets]);
  const report = useMemo(() => (plan ? goalsReport({
    facts: counted, leads: leadsRead ? realLeads : null, plan, overheads: targets.overheads, team, now,
  }) : null), [plan, counted, realLeads, leadsRead, targets.overheads, team, now]);
  return { tags, counted, realLeads, team, report };
}
