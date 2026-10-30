import React, { useMemo, useState } from "react";
import { FullProjectData } from "../types";
import { getSingleProjectValue } from "../lib/financialsUtils";
import { ReportScope, SCOPE_LABEL, inScope, countClasses, classifyProject } from "../lib/projectClassification";
import { holdsFinanceRole } from "../lib/roleAccess";
import { useOrg } from "../contexts/OrgContext";
import { StudioBar, BarStrip, BarChip, BarButton } from "./ui/StudioBar";
import BulkTagPanel from "./reports/BulkTagPanel";
import StudioMemoryView from "./reports/StudioMemoryView";
import OwnerScorecard, { type Section } from "./reports/owner/OwnerScorecard";
import SalesSection from "./reports/owner/SalesSection";
import MoneySection from "./reports/owner/MoneySection";
import DeliverySection from "./reports/owner/DeliverySection";
import TargetsModal from "./reports/owner/TargetsModal";
import FoundersGoalsTab from "./reports/owner/FoundersGoalsTab";
import { isFounder } from "../lib/founderGoals";
import { useOwnerReportData } from "./reports/owner/useOwnerReportData";
import { Empty } from "./reports/owner/ReportBits";
import { Dot } from "./ui/HudBits";
import {
  periodWindow, overdueAt, lateSites, bookedIn, salesReport, inr,
  type OwnerReportInput, type ReportPeriod,
} from "../lib/ownerReports";
import { BarChart3, Lock, Tags, Target } from "@/lib/lucide-shim";
export { getSingleProjectValue };

/*
  REPORTS: the numbers a studio owner runs the business by.

  Rebuilt from the mockups approved on 29 Oct 2026. The page opens on a
  scorecard of eight figures, each against its target and the period before,
  and each card opens the section behind it: Sales, Money, and Delivery and
  team. Studio memory, the Zoho history and benchmarks, stays as the last
  section. Founders' goals (mockup approved 30 Oct 2026) sits before it, for
  the two founders only (lib/founderGoals), and always counts actual work.
  The arithmetic lives in lib/ownerReports; this file is the shell.

  Top-tab layout (DESIGN.md): the shell's title row names the page, then the
  StudioBar, then a toolbar with the period on the left and what is counted
  on the right.
*/

interface StudioReportsProps {
  projects: FullProjectData[];
  onNavigate?: (tab: string) => void;
  /** Open one project, on one of its tabs (its Reports tab when none is named). */
  onOpenProject?: (projectId: string, tab?: string) => void;
  /** Projects whose stored data was changed from this screen, for App to merge. */
  onProjectsPatched?: (updated: FullProjectData[]) => void;
}

const SECTIONS: { id: Section; label: string; founders?: boolean }[] = [
  { id: "scorecard", label: "Scorecard" },
  { id: "sales", label: "Sales" },
  { id: "money", label: "Money" },
  { id: "delivery", label: "Delivery and team" },
  { id: "goals", label: "Founders' goals", founders: true },
  { id: "memory", label: "Studio memory" },
];
const PERIODS: { id: ReportPeriod; label: (now: number) => string }[] = [
  { id: "month", label: (now) => periodWindow("month", now).label },
  { id: "quarter", label: () => "Last 3 months" },
  { id: "fy", label: (now) => periodWindow("fy", now).label },
];
const SECTION_KEY = "ffds_reports_section";
const PERIOD_KEY = "ffds_reports_period";
const remembered = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
};
const remember = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* private window */ } };

const Segmented: React.FC<{ label: string; options: { id: string; label: string; amber?: boolean; locked?: boolean }[]; value: string; onChange: (id: string) => void }> = ({ label, options, value, onChange }) => (
  <div role="group" aria-label={label} className="inline-flex self-start p-1 rounded-xl bg-slate-100 flex-wrap">
    {options.map((o) => (
      <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
          value === o.id ? (o.amber ? "bg-white text-amber-700 shadow-sm" : "bg-white text-slate-800 shadow-sm") : "text-slate-500 hover:text-slate-800"
        }`}>
        {o.locked && <Lock className="w-3 h-3 inline-block mr-1 -mt-px" />}{o.label}
      </button>
    ))}
  </div>
);

export default function StudioReports({ projects, onNavigate, onOpenProject, onProjectsPatched }: StudioReportsProps) {
  const { currentRoles, currentRole, orgData, currentUserAuth } = useOrg() as any;
  const me = String(currentUserAuth?.email || "").toLowerCase();
  const founder = isFounder(me);
  const sections = SECTIONS.filter((s) => !s.founders || founder);
  const [section, setSectionState] = useState<Section>(() => remembered(SECTION_KEY, sections.map((s) => s.id), "scorecard"));
  const [period, setPeriodState] = useState<ReportPeriod>(() => remembered(PERIOD_KEY, ["month", "quarter", "fy"] as const, "month"));
  /* Strict by default: only what the studio has tagged as actual work. */
  const [scope, setScope] = useState<ReportScope>("actual");
  const [tagging, setTagging] = useState(false);
  const [settingTargets, setSettingTargets] = useState(false);
  const [now] = useState(() => Date.now());

  const setSection = (s: Section) => { setSectionState(s); remember(SECTION_KEY, s); };
  const setPeriod = (p: ReportPeriod) => { setPeriodState(p); remember(PERIOD_KEY, p); };

  const all = projects || [];
  /* Founders' goals counts actual work only, whatever the view picker says. */
  const goals = section === "goals" && founder;
  const scoped = useMemo(() => all.filter((p) => inScope(p, goals ? "actual" : scope)), [all, scope, goals]);
  const counts = useMemo(() => countClasses(all, getSingleProjectValue), [all]);
  const untagged = useMemo(() => all.filter((p) => classifyProject(p) === "untagged"), [all]);

  const data = useOwnerReportData(scoped);
  const canSetTargets = holdsFinanceRole(currentRoles?.length ? currentRoles : currentRole) && data.targetsReadable;

  const input: OwnerReportInput = useMemo(() => ({
    facts: data.facts,
    leads: data.leads,
    headcount: data.headcount,
    names: data.names,
    roles: data.roles,
    roster: data.roster,
    targets: data.targets,
    lateAfterDays: data.lateAfterDays,
    period,
    now,
  }), [data.facts, data.leads, data.headcount, data.names, data.roles, data.roster, data.targets, data.lateAfterDays, period, now]);

  /* What the bar counts: the things waiting on the owner, each a tap from its section. */
  const chips = useMemo(() => {
    const od = overdueAt(input.facts, now, input.lateAfterDays);
    const late = lateSites(input.facts, now).length;
    const quiet = input.leads ? salesReport(input).quiet.length : 0;
    const signed = bookedIn(input.facts, periodWindow(period, now).cur).count;
    return { od, late, quiet, signed };
  }, [input, now, period]);

  const openProject = (id: string, tab?: string) => onOpenProject?.(id, tab);
  const w = periodWindow(period, now);

  return (
    <div className="w-full px-4 pb-16 flex flex-col gap-4">
      <StudioBar>
        <BarStrip label="Needs you">
          {chips.od.value > 0 && <BarChip n={chips.od.invoices} word={`${chips.od.invoices === 1 ? "invoice" : "invoices"} overdue, ${inr(chips.od.value)}`} tone="bad" onClick={() => setSection("money")} />}
          {chips.late > 0 && <BarChip n={chips.late} word={chips.late === 1 ? "site running late" : "sites running late"} tone="warn" onClick={() => setSection("delivery")} />}
          {chips.quiet > 0 && <BarChip n={chips.quiet} word={chips.quiet === 1 ? "proposal quiet 14 days" : "proposals quiet 14 days"} tone="warn" onClick={() => setSection("sales")} />}
          <BarChip n={chips.signed} word={`${chips.signed === 1 ? "contract" : "contracts"} signed, ${w.label}`} tone="ok" onClick={() => setSection("sales")} />
          {data.loading && <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-500"><Dot tone="ok" live />Reading purchase orders and payments</span>}
        </BarStrip>
        {untagged.length > 0 && (
          <BarButton onClick={() => setTagging(true)}><Tags className="w-4 h-4" />Classify {untagged.length} {untagged.length === 1 ? "project" : "projects"}</BarButton>
        )}
        {canSetTargets && <BarButton primary onClick={() => setSettingTargets(true)}><Target className="w-4 h-4" />Set targets</BarButton>}
      </StudioBar>

      <Segmented label="Report sections" value={section} onChange={(id) => setSection(id as Section)}
        options={sections.map((s) => ({ id: s.id, label: s.label, locked: s.founders }))} />

      {section !== "memory" && !goals && (
        <div className="pt-1 pb-3 border-b border-slate-200/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Segmented label="Period" value={period} onChange={(id) => setPeriod(id as ReportPeriod)}
              options={PERIODS.map((p) => ({ id: p.id, label: p.label(now) }))} />
            <span className="text-xs text-slate-500">Compared {w.compareLabel}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-500">
              Counting <b className="text-slate-800">{scoped.length} {scoped.length === 1 ? "project" : "projects"}</b>
              {scope === "test" && <b className="text-amber-700">, test records only</b>}
              {scope === "all" && counts.test > 0 && <b className="text-amber-700">, including {counts.test} test</b>}
            </span>
            <Segmented label="Which projects" value={scope} onChange={(id) => setScope(id as ReportScope)}
              options={(["actual", "untagged", "all", "test"] as ReportScope[]).map((k) => ({ id: k, label: SCOPE_LABEL[k], amber: k === "test" }))} />
          </div>
        </div>
      )}

      {tagging && (
        <BulkTagPanel projects={untagged} onClose={() => setTagging(false)} onSaved={(updated) => onProjectsPatched?.(updated)} />
      )}

      <div key={section} className="hud-swap">
        {section === "memory" ? (
          <StudioMemoryView projects={all} />
        ) : goals ? (
          <FoundersGoalsTab tenantId={String(orgData?.tenantId || "")} me={me} all={all} facts={data.facts}
            leads={data.leads || []} leadsRead={data.leads !== null && !data.leadsLoading}
            targets={data.targets} roster={data.roster} canSetTargets={canSetTargets} saveTargets={data.saveTargets}
            onOpenProject={(id) => openProject(id)} />
        ) : all.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in max-w-lg mx-auto text-center">
            <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="font-bold text-slate-800">No projects to report on yet</h3>
            <p className="text-xs text-slate-500 mt-1">Once projects are proposed, signed and paid, these reports fill in.</p>
          </div>
        ) : scoped.length === 0 ? (
          <Empty>No projects are {scope === "actual" ? "tagged as actual work" : "in this view"} yet. Pick another view on the right, or classify projects.</Empty>
        ) : section === "scorecard" ? (
          <OwnerScorecard input={input} onSection={setSection} onOpenProject={openProject} onSetTargets={canSetTargets ? () => setSettingTargets(true) : undefined} />
        ) : section === "sales" ? (
          <SalesSection input={input} onOpenProject={openProject} onOpenLeads={onNavigate ? () => onNavigate("ops-desk") : undefined} />
        ) : section === "money" ? (
          <MoneySection input={input} onOpenProject={openProject} onSetTargets={canSetTargets ? () => setSettingTargets(true) : undefined} />
        ) : (
          <DeliverySection input={input} onOpenProject={openProject} />
        )}
      </div>

      {settingTargets && (
        <TargetsModal targets={data.targets} onClose={() => setSettingTargets(false)} onSave={data.saveTargets} />
      )}
    </div>
  );
}
