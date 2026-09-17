import React from "react";
import { CalendarDays, ArrowRight, Flag } from "lucide-react";
import { FullProjectData } from "../../types";

/**
 * WEEK AHEAD
 *
 * Replaces a band that took a full screen to say nothing: a live clock (the
 * operating system has one), a month grid with no events on it, and a
 * "Studio Pulse" panel that read "NO UPCOMING MILESTONES".
 *
 * Three things had to change. It only occupies space when it has something to
 * say. It shows the dates themselves rather than a grid you have to scan. And
 * when it is empty it says WHY and what to do about it, because the emptiness
 * is a data gap the studio can close in one field -- the same
 * `targetHandoverDate` the risk engine needs to track slippage.
 */

const MONEY_STATUSES = ["won", "execution", "work_paused", "completed"];
const HORIZON_DAYS = 30;

interface Milestone {
  when: Date;
  daysOut: number;
  label: string;
  project: FullProjectData;
}

const parse = (v?: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export function buildWeekAhead(projects: FullProjectData[]): Milestone[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: Milestone[] = [];

  for (const p of projects || []) {
    const ctx: any = p.context || {};
    if (!MONEY_STATUSES.includes(ctx.status || "")) continue;

    const candidates: [string | undefined, string][] = [
      [ctx.targetHandoverDate, "Target handover"],
      [ctx.sofFreezeDate, "BOQ freeze"],
      [ctx.paymentScheduleConfig?.possessionDate, "Site possession"],
      [ctx.paymentScheduleConfig?.signupDate, "Contract signup"],
    ];

    for (const [raw, label] of candidates) {
      const d = parse(raw);
      if (!d) continue;
      d.setHours(0, 0, 0, 0);
      const daysOut = Math.round((d.getTime() - today.getTime()) / 86400000);
      // Just-passed dates still matter; a handover three days overdue is news.
      if (daysOut < -7 || daysOut > HORIZON_DAYS) continue;
      out.push({ when: d, daysOut, label, project: p });
    }
  }
  return out.sort((a, b) => a.daysOut - b.daysOut);
}

const relative = (d: number) =>
  d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d}d`;

interface Props {
  projects: FullProjectData[];
  onOpenProject: (p: FullProjectData, tab?: string) => void;
}

const WeekAhead: React.FC<Props> = ({ projects, onOpenProject }) => {
  const items = React.useMemo(() => buildWeekAhead(projects), [projects]);

  return (
    <div className="space-y-3.5">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-sky-600" />
        <span>Week Ahead</span>
        {items.length > 0 && (
          <span className="text-[10px] font-bold text-slate-400 tabular-nums">{items.length}</span>
        )}
      </h3>

      {items.length === 0 ? (
        /* Empty for a reason, and the reason is fixable. */
        <div className="bg-white/90 border border-dashed border-slate-200 rounded-2xl px-4 py-4">
          <div className="flex items-start gap-2.5">
            <Flag className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-slate-700">No dates to watch</p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Set a target handover date on your live projects and the run-up
                appears here &mdash; and slippage starts being tracked on the
                project report.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((m, i) => {
            const late = m.daysOut < 0;
            const soon = m.daysOut >= 0 && m.daysOut <= 7;
            return (
              <button
                key={`${m.project.id}-${m.label}-${i}`}
                onClick={() => onOpenProject(m.project, "timeline")}
                className="w-full text-left bg-white/90 border border-slate-200/80 rounded-xl px-3.5 py-2.5 flex items-center gap-3 hover:border-sky-300 hover:bg-sky-50/30 transition-colors cursor-pointer group hud-row"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="shrink-0 w-11 text-center">
                  <p className={`text-[15px] font-bold leading-none tabular-nums ${
                    late ? "text-rose-600" : soon ? "text-amber-600" : "text-slate-700"
                  }`}>
                    {m.when.getDate()}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">
                    {m.when.toLocaleString("en-GB", { month: "short" })}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-slate-800 truncate leading-tight">{m.label}</p>
                  <p className="text-[10.5px] text-slate-400 truncate mt-0.5">
                    {m.project.context?.name || "Unnamed project"}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold whitespace-nowrap ${
                  late ? "text-rose-600" : soon ? "text-amber-600" : "text-slate-400"
                }`}>
                  {relative(m.daysOut)}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 group-hover:text-[#3D52A0] transition-colors" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WeekAhead;
