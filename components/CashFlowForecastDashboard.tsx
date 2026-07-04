import React, { useState } from "react";
import { useCashFlowForecast } from "../hooks/useCashFlowForecast";
import { useOrg } from "../contexts/OrgContext";
import { formatCurrency, formatINR } from "../lib/utils";
import {
  IndianRupee,
  AlertTriangle,
  Calendar,
  Clock,
  RefreshCw,
  Bell,
  ShieldAlert,
  CheckCircle2,
  TrendingUp as TrendingUpIcon,
} from "lucide-react";
import { buildWhatsAppURL } from "../lib/whatsappUtils";
import { useStudioSettings } from "../hooks/useStudioSettings";

export function CashFlowForecastDashboard() {
  const { orgData } = useOrg();
  const studioId = orgData?.tenantId || "demo-tenant-01";
  const {
    overdueTotal,
    overdueItems,
    unscheduledTotal,
    unscheduledItems,
    monthlyForecast,
    loading,
    refresh,
  } = useCashFlowForecast(studioId);
  const { settings } = useStudioSettings(studioId);

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500 flex flex-col items-center gap-4">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p>Analyzing studio execution gates...</p>
      </div>
    );
  }

  // Flatten next 30 days essentially
  const now = new Date();
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const upcomingItems = monthlyForecast
    .flatMap((mf) => mf.items)
    .filter((item) => {
      if (!item.expectedDate) return false;
      const expected = new Date(item.expectedDate);
      // It is not overdue, and within next 30 days
      return item.status !== "overdue" && expected <= next30Days;
    });

  const next30DaysTotal = upcomingItems.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  const handleSendReminder = (item: any) => {
    const template = settings?.emailTemplates?.paymentRequest || "";
    const variables = {
      clientName: item.clientName || "Client",
      projectName: item.projectName,
      studioName: settings?.companyName || "Our Studio",
      amount: formatINR(item.amount || 0),
      milestone: item.milestoneLabel,
      daysPending: item.daysOverdue || 0,
      supportContact: settings?.clientPortalConfig?.supportContact || "",
    };

    const defaultTemplate =
      "Hi {clientName}, this is a gentle reminder that payment for {milestone} ({amount}) is due for your {projectName} project. Please let us know once processed. Thank you! — {studioName}";

    let rendered = template || defaultTemplate;
    const expectedKeys = Object.keys(variables);
    expectedKeys.forEach((key) => {
      const value = variables[key as keyof typeof variables];
      const regex = new RegExp(`{${key}}`, "g");
      if (value === undefined || value === null || value === "") {
        rendered = rendered.replace(regex, `[${key}]`);
      } else {
        rendered = rendered.replace(regex, String(value));
      }
    });

    const url = buildWhatsAppURL(item.clientPhone || "", rendered);
    window.open(url, "_blank");
  };

  const isEmpty =
    overdueItems.length === 0 &&
    upcomingItems.length === 0 &&
    unscheduledItems.length === 0;

  return (
    <div className="text-left w-full max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-end mb-10 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-4xl font-light tracking-tight text-indigo-950 leading-none mb-2">
            Finance & Analytics
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            Pending payments blocking procurement and operational cash
            execution.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-indigo-950 uppercase tracking-widest px-4 py-2 border-slate-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> REFRESH
        </button>
      </div>

      {isEmpty ? (
        <div className="bg-slate-50/50 border border-slate-200 p-16 text-center text-slate-400 flex flex-col items-center">
          <CheckCircle2 className="w-10 h-10 mb-6 text-slate-300" />
          <p className="font-light text-indigo-950 text-2xl tracking-tighter">
            No Pending Execution Gates
          </p>
          <p className="text-sm mt-2 max-w-md">
            There are currently no active or overdue payment requests blocking
            execution across any projects.
          </p>
        </div>
      ) : (
        <div className="space-y-16">
          {/* 1. Critical Blockers */}
          {overdueItems.length > 0 && (
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-8 bg-rose-500 rounded-full"></div>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-indigo-950">
                      Critical Blockers
                    </h3>
                    <p className="text-[11px] text-rose-500 font-bold uppercase tracking-[0.2em] mt-0.5">
                      Payment overdue • Execution halted
                    </p>
                  </div>
                </div>
                <h3 className="text-3xl font-light tracking-tighter text-indigo-950 mt-2 sm:mt-0">
                  {formatCurrency(overdueTotal)}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {overdueItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-slate-200 p-6 flex flex-col justify-between group hover:border-slate-400 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-bold px-2 py-1 uppercase tracking-[0.2em] rounded">
                            {item.daysOverdue} Days Overdue
                          </span>
                          {item.lastReminderAt && (
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                              Last nudge:{" "}
                              {new Date(
                                item.lastReminderAt.toDate
                                  ? item.lastReminderAt.toDate()
                                  : item.lastReminderAt,
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <h4 className="font-light tracking-tight text-indigo-950 text-xl">
                          {item.projectName}
                        </h4>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                          {item.milestoneLabel}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-light text-2xl text-indigo-950 tracking-tighter">
                          {formatCurrency(item.amount)}
                        </p>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleSendReminder(item)}
                        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase bg-indigo-950 text-white px-5 py-2.5 rounded-full hover:bg-indigo-900 transition-colors"
                      >
                        <Bell className="w-3 h-3" /> Escalation Nudge
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Upcoming Gates */}
          {upcomingItems.length > 0 && (
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-8 bg-indigo-950 rounded-full"></div>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-indigo-950">
                      Upcoming Execution Gates
                    </h3>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-0.5">
                      Next 30 days projection
                    </p>
                  </div>
                </div>
                <h3 className="text-3xl font-light tracking-tighter text-indigo-950 mt-2 sm:mt-0">
                  {formatCurrency(next30DaysTotal)}
                </h3>
              </div>

              <div className="bg-white border border-slate-200 divide-y divide-slate-100">
                {upcomingItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 hover:bg-slate-50/50 transition-colors group"
                  >
                    <div className="flex items-center gap-6 w-full sm:w-auto mb-4 sm:mb-0">
                      <div className="shrink-0 text-center">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">
                          {item.expectedDate
                            ? new Date(item.expectedDate).toLocaleString(
                                "default",
                                { month: "short" },
                              )
                            : "-"}
                        </span>
                        <span className="block text-2xl font-light tracking-tighter text-indigo-950 leading-none">
                          {item.expectedDate
                            ? new Date(item.expectedDate).getDate()
                            : "-"}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-light tracking-tight text-indigo-950 text-lg mb-1">
                          {item.projectName}
                        </h4>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                            {item.milestoneLabel}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="text-sm font-light text-indigo-950">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 w-full sm:w-auto text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleSendReminder(item)}
                        className="w-full sm:w-auto inline-flex items-center justify-center text-[10px] font-bold tracking-[0.2em] uppercase border border-slate-200 text-slate-600 bg-white px-5 py-2.5 rounded-full hover:bg-slate-50 hover:border-slate-300 transition-colors"
                      >
                        Prepare Invoice
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Unscheduled Items */}
          {unscheduledItems.length > 0 && (
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-8 bg-slate-300 rounded-full"></div>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-indigo-950">
                      Dormant Execution Gates
                    </h3>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-0.5">
                      Items without exact due dates
                    </p>
                  </div>
                </div>
                <h3 className="text-3xl font-light tracking-tighter text-slate-400 mt-2 sm:mt-0">
                  {formatCurrency(unscheduledTotal)}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(
                  unscheduledItems.reduce(
                    (acc, item) => {
                      if (!acc[item.projectName]) acc[item.projectName] = [];
                      acc[item.projectName].push(item);
                      return acc;
                    },
                    {} as Record<string, typeof unscheduledItems>,
                  ),
                ).map(([project, items]) => (
                  <div
                    key={project}
                    className="bg-white border border-slate-200 p-6 hover:border-slate-300 transition-colors"
                  >
                    <h4 className="font-light tracking-tight text-indigo-950 text-lg mb-4">
                      {project}
                    </h4>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {(items as any[]).map((i) => (
                        <span
                          key={i.id}
                          className="text-[9px] font-bold uppercase tracking-widest bg-slate-50 border border-slate-200 px-2 py-1 text-slate-500"
                        >
                          {i.milestoneLabel}
                        </span>
                      ))}
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        Locked Value
                      </span>
                      <span className="font-light text-indigo-950 text-xl tracking-tighter">
                        {formatCurrency(
                          (items as any[]).reduce((s, i) => s + i.amount, 0),
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CashFlowSummaryWidget({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { orgData } = useOrg();
  const studioId = orgData?.tenantId || "demo-tenant-01";
  const { currentMonthTotal, overdueTotal, loading } =
    useCashFlowForecast(studioId);

  if (loading) {
    return (
      <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-200 flex items-center justify-center h-full animate-pulse">
        <div className="h-4 bg-slate-200/50 w-1/2 rounded-full"></div>
      </div>
    );
  }

  if (currentMonthTotal === 0 && overdueTotal === 0) {
    return (
      <div
        className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200 flex flex-col justify-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors h-full"
        onClick={onNavigate}
      >
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] shrink-0">
            Execution Gates
          </p>
        </div>
        <p className="text-sm font-medium text-indigo-950 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" /> No active
          blockers
        </p>
      </div>
    );
  }

  return (
    <div
      onClick={onNavigate}
      className="bg-indigo-950/90 backdrop-blur-xl border border-indigo-800/50 p-8 rounded-[2rem] shadow-2xl shadow-indigo-950/20 shadow-xl flex flex-col justify-between group hover:-translate-y-1 transition-transform cursor-pointer h-full relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none text-white">
        <TrendingUpIcon className="w-24 h-24" />
      </div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Finance Gates Tracker
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 sm:gap-8 pb-1 relative z-10">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>{" "}
            Expected <span className="lowercase">this month</span>
          </p>
          <p className="text-3xl font-light tracking-tighter text-white leading-none">
            {currentMonthTotal > 0 ? formatCurrency(currentMonthTotal) : "—"}
          </p>
        </div>
        <div className="sm:pl-8 sm:border-l border-indigo-900">
          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>{" "}
            Blocked <span className="lowercase">overdue</span>
          </p>
          <p
            className={`text-3xl font-light tracking-tighter leading-none ${overdueTotal > 0 ? "text-rose-400" : "text-slate-500"}`}
          >
            {overdueTotal > 0 ? formatCurrency(overdueTotal) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
