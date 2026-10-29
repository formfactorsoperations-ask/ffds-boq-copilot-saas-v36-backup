import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import type { FullProjectData } from '../../../types';
import { db } from '../../../services/dbService';
import { db as fsDb } from '../../../services/firebaseClient';
import { useOrg } from '../../../contexts/OrgContext';
import { usePeople } from '../../../services/peopleService';
import { useProjectTeam } from '../../../services/projectTeam';
import { loadLeads } from '../../../services/leadsService';
import { loadTargets, saveTargets } from '../../../services/reportTargetsService';
import { assignedDesignersFor } from '../../../lib/roleAccess';
import { opsSettingsOf } from '../../../lib/opsDesk';
import { normaliseAddition, scopeAdditionsPath } from '../../../lib/scopeAdditions';
import { computeSchedule } from '../../../lib/schedule';
import { DEFAULT_TARGETS, type ReportTargets } from '../../../lib/reportTargets';
import {
  projectFact, dateOf, MONEY_STATUSES, LIVE_STATUSES,
  type AdditionFact, type ProjectFact, type ScheduleFact,
} from '../../../lib/ownerReports';
import type { Lead } from '../../../lib/leads';

/*
  Everything the owner's reports read, loaded once per set of projects.

  Read rather than subscribed: this is a report, and listeners across every
  project would be dozens of subscriptions to keep a few figures current. Each
  project's own screens subscribe, which is where live matters. A read that
  fails leaves its part empty and says so, never a zero that reads as a fact.
*/

type Loaded<T> = Record<string, T>;

async function each<T>(ids: string[], read: (id: string) => Promise<T>, empty: T): Promise<Loaded<T>> {
  const pairs = await Promise.all(ids.map(async (id) => {
    try { return [id, await read(id)] as const; } catch { return [id, empty] as const; }
  }));
  return Object.fromEntries(pairs);
}

const LIVE_ADDITION = (s: string) => s !== 'cancelled' && s !== 'void' && s !== 'draft';

export function useOwnerReportData(projects: FullProjectData[]) {
  const { orgData, currentUserAuth } = useOrg() as any;
  const tenantId: string = String(orgData?.tenantId || '');
  const me: string = String(currentUserAuth?.email || '').toLowerCase();
  const { map: teamMap } = useProjectTeam();
  const people = usePeople(true);

  const moneyIds = useMemo(() => projects.filter((p) => MONEY_STATUSES.includes(p.context?.status || '')).map((p) => p.id), [projects]);
  const activeIds = useMemo(() => projects.filter((p) => ['won', ...LIVE_STATUSES].includes(p.context?.status || '')).map((p) => p.id), [projects]);
  const moneyKey = moneyIds.join('|');
  const activeKey = activeIds.join('|');

  const [pos, setPos] = useState<Loaded<any[]>>({});
  const [additions, setAdditions] = useState<Loaded<AdditionFact[]>>({});
  const [schedules, setSchedules] = useState<Loaded<ScheduleFact | null>>({});
  const [decisions, setDecisions] = useState<Loaded<any[]>>({});
  const [leads, setLeads] = useState<Lead[] | null | undefined>(undefined);
  const [targets, setTargets] = useState<ReportTargets | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      each(moneyIds, async (id) => (await db.getPurchaseOrders(id)) || [], [] as any[]),
      each(moneyIds, async (id) => {
        if (!fsDb || !tenantId) return [];
        const snap = await getDocs(collection(fsDb, scopeAdditionsPath(tenantId, id)));
        return snap.docs.map((d) => {
          const a = normaliseAddition(d.id, d.data());
          return {
            createdAt: dateOf(a.createdAt),
            exGst: (a.executionSubtotal || 0) + (a.designFeeBase || 0),
            authorised: a.workAuthorized,
            live: LIVE_ADDITION(a.invoiceStatus),
            collected: (a.designFeePaid ? a.designFeeTotal : 0) + (a.executionPaid ? a.executionTotal : 0),
          } as AdditionFact;
        });
      }, [] as AdditionFact[]),
    ]).then(([p, a]) => { if (alive) { setPos(p); setAdditions(a); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyKey, tenantId]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      each(activeIds, async (id) => {
        const s: any = await db.getSchedule(id);
        if (!s || !Array.isArray(s.tasks) || !s.tasks.length) return s?.targetHandoverISO ? { finishAt: null, targetAt: dateOf(s.targetHandoverISO), holdReason: null } : null;
        const r = computeSchedule(s);
        const hold = ((s.holds || []) as any[]).filter((h) => h && !h.liftedAt).sort((x, y) => (y.workDays || 0) - (x.workDays || 0))[0];
        return { finishAt: dateOf(r.finishISO), targetAt: dateOf(s.targetHandoverISO), holdReason: hold?.reason ? String(hold.reason) : null } as ScheduleFact;
      }, null as ScheduleFact | null),
      each(activeIds, async (id) => {
        if (!fsDb) return [];
        const snap = await getDocs(collection(fsDb, 'projects', id, 'decisions'));
        return snap.docs.map((d) => d.data());
      }, [] as any[]),
    ]).then(([s, d]) => { if (alive) { setSchedules(s); setDecisions(d); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEffect(() => {
    let alive = true;
    if (!tenantId) { setLeads(null); return; }
    loadLeads(tenantId, me, true).then((l) => { if (alive) setLeads(l); }).catch(() => { if (alive) setLeads(null); });
    return () => { alive = false; };
  }, [tenantId, me]);

  useEffect(() => {
    let alive = true;
    loadTargets(tenantId).then((t) => { if (alive) setTargets(t); });
    return () => { alive = false; };
  }, [tenantId]);

  /* Names and roles: People first, the studio's team list after it. */
  const team: any[] = ((orgData as any)?.team as any[]) || [];
  const { names, roles, headcount, roster } = useMemo(() => {
    const n: Record<string, string> = {};
    const r: Record<string, string> = {};
    for (const m of team) {
      const e = String(m?.email || '').toLowerCase();
      if (!e) continue;
      if (m.name) n[e] = m.name;
      if (m.role) r[e] = m.role;
    }
    const staff = (people.snapshot?.people || []).filter((p: any) => p.active !== false);
    for (const p of staff) if (p.email && p.name) n[String(p.email).toLowerCase()] = p.name;
    const listed = team.filter((m) => m?.email && !['Client', 'Vendor'].includes(m.role)).length;
    const seen = new Set<string>();
    const roster = team
      .map((m) => ({ email: String(m?.email || '').trim().toLowerCase(), name: String(m?.name || ''), role: String(m?.role || '') }))
      .filter((m) => m.email && !seen.has(m.email) && seen.add(m.email));
    return { names: n, roles: r, headcount: staff.length || listed || null, roster };
  }, [team, people.snapshot]);

  const facts: ProjectFact[] = useMemo(() => {
    const designersByProject: Record<string, string[]> = {};
    for (const p of projects) designersByProject[p.id] = assignedDesignersFor(p, teamMap);
    return projects.map((p) => projectFact(p, {
      posByProject: pos, additionsByProject: additions, decisionsByProject: decisions,
      schedulesByProject: schedules, designersByProject,
    }));
  }, [projects, pos, additions, decisions, schedules, teamMap]);

  const save = async (t: ReportTargets) => {
    const saved = await saveTargets(tenantId, t, me);
    setTargets(saved);
  };

  return {
    facts,
    leads: leads === undefined ? [] : leads,
    leadsLoading: leads === undefined,
    targets: targets || DEFAULT_TARGETS,
    targetsReadable: targets !== null,
    names, roles, headcount, roster,
    peopleFromSnapshot: !!people.snapshot,
    lateAfterDays: opsSettingsOf(orgData).paymentDueDays,
    loading,
    saveTargets: save,
  };
}
