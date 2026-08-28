import React, { useState, useEffect } from "react";
import { FullProjectData } from "../../types";
import { Clock, Calendar, ChevronLeft, ChevronRight, Pin, Flag, ArrowRight, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ClockCalendarProps {
  projects: FullProjectData[];
}

export default function ClockCalendar({ projects }: ClockCalendarProps) {
  const [time, setTime] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format time: HH:MM:SS AM/PM
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  // Format date: Day, Month Date, Year
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Extract all IMPORTANT milestones/dates from active projects
  const importantDates = React.useMemo(() => {
    const dates: Record<string, { events: { label: string; project: string }[] }> = {};

    const addEvent = (dateVal: any, label: string, project: string) => {
      if (!dateVal) return;
      try {
        let dStr = "";
        if (typeof dateVal === "number") {
          dStr = new Date(dateVal).toISOString().split("T")[0];
        } else if (typeof dateVal === "string") {
          dStr = new Date(dateVal).toISOString().split("T")[0];
        } else if (dateVal && dateVal.seconds) { // Firestore timestamp
          dStr = new Date(dateVal.seconds * 1000).toISOString().split("T")[0];
        } else {
          dStr = new Date(dateVal).toISOString().split("T")[0];
        }

        if (dStr && dStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          if (!dates[dStr]) {
            dates[dStr] = { events: [] };
          }
          const exists = dates[dStr].events.some(
            (e) => e.label === label && e.project === project
          );
          if (!exists) {
            dates[dStr].events.push({ label, project });
          }
        }
      } catch (e) {
        // Skip invalid dates safely
      }
    };

    for (const p of projects) {
      const pName = p.context?.name || "Unnamed Project";
      const status = p.context?.status || "";
      const isWonOrDelivered = ["won", "execution", "work_paused", "completed"].includes(status);
      
      // Limit strictly to active or completed client projects to filter out draft noise
      if (!isWonOrDelivered) continue;

      // 1. Target Handover (Critical)
      if (p.context?.targetHandoverDate) {
        addEvent(p.context.targetHandoverDate, "Target Handover", pName);
      }
      // 2. Actual Handover (Critical)
      if (p.context?.handoverDate) {
        addEvent(p.context.handoverDate, "Actual Handover", pName);
      }
      // 3. SOF / BOQ Freeze (Atomic threshold)
      if (p.context?.sofFreezeDate) {
        addEvent(p.context.sofFreezeDate, "BOQ Frozen / Invoice Trigger", pName);
      }
      // 4. Contract Signup Date (Contractual threshold)
      if (p.context?.paymentScheduleConfig?.signupDate) {
        addEvent(p.context.paymentScheduleConfig.signupDate, "Contract Signup", pName);
      }
      // 5. Site Possession Date (Operations start)
      if (p.context?.paymentScheduleConfig?.possessionDate) {
        addEvent(p.context.paymentScheduleConfig.possessionDate, "Site Possession", pName);
      }
    }
    return dates;
  }, [projects]);

  // Extract a flattened chronological list of upcoming milestones
  const upcomingMilestones = React.useMemo(() => {
    const list: { date: Date; dateStr: string; label: string; project: string }[] = [];
    const todayStr = new Date().toISOString().split("T")[0];

    Object.keys(importantDates).forEach((dateStr) => {
      const entry = importantDates[dateStr];
      if (entry && entry.events) {
        entry.events.forEach((ev) => {
          list.push({
            date: new Date(dateStr),
            dateStr,
            label: ev.label,
            project: ev.project,
          });
        });
      }
    });

    // Sort ascending (chronological)
    list.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Filter to future & today's milestones only
    return list.filter((item) => item.dateStr >= todayStr);
  }, [importantDates]);

  // Calendar math
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const calendarDays = [];

  // Previous month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    calendarDays.push({ day: d, month: m, year: y, isCurrentMonth: false });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({ day: i, month, year, isCurrentMonth: true });
  }

  // Next month padding to reach 42 cells (6 rows)
  const remainingCells = 42 - calendarDays.length;
  for (let i = 1; i <= remainingCells; i++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    calendarDays.push({ day: i, month: m, year: y, isCurrentMonth: false });
  }

  const isToday = (day: number, m: number, y: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === m && today.getFullYear() === y;
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  // Relative days formatting helper for Milestones list
  const getRelativeDays = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return `In ${diffDays} days`;
  };

  const formatMilestoneDay = (date: Date) => {
    return date.getDate();
  };

  const formatMilestoneMonth = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  };

  // State to track currently hovered date details for popover
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full font-['Plus_Jakarta_Sans']">
      {/* 1. Live Premium Clock Widget (lg:col-span-3) */}
      <div className="lg:col-span-3 bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden lg:h-[320px] h-auto transition-all">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                LIVE TRACK
              </span>
            </div>
            <Clock className="w-4 h-4 text-sky-600" />
          </div>

          <div className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-none flex items-baseline mt-3.5 tabular-nums">
            {formatTime(time).split(" ")[0]}
            <span className="text-[10px] font-bold px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg border border-sky-200/60 uppercase ml-2 select-none">
              {formatTime(time).split(" ")[1]}
            </span>
          </div>

          <div className="text-sm font-semibold text-slate-700 mt-4 tracking-tight">
            {formatDate(time)}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
          <span>GMT+5:30 • IST Zone</span>
          <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 uppercase tracking-wider text-[9px]">
            Active Session
          </span>
        </div>
      </div>

      {/* 2. Interactive Premium Month Calendar (lg:col-span-5) */}
      <div className="lg:col-span-5 bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-2xs lg:h-[320px] h-auto flex flex-col justify-between relative z-10 hover:z-20 transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-600" />
            <h4 className="text-sm font-bold text-slate-800 tracking-tight">
              {monthNames[month]} {year}
            </h4>
          </div>
          <div className="flex gap-1">
            <button 
              onClick={prevMonth}
              className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={nextMonth}
              className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Calendar Grid Container with precise spacing */}
        <div className="flex-1 flex flex-col justify-between">
          {/* Days Header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 gap-1 relative">
            {calendarDays.map((cell, idx) => {
              const dateStr = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
              const important = importantDates[dateStr];
              const hasEvents = important && important.events.length > 0;
              const isTodayCell = isToday(cell.day, cell.month, cell.year);

              let bgClass = "hover:bg-slate-50";
              let textClass = cell.isCurrentMonth ? "text-slate-700" : "text-slate-300";
              let borderClass = "border-transparent";

              if (isTodayCell) {
                bgClass = "bg-gradient-to-r from-sky-500 to-sky-600 text-white font-bold shadow-2xs";
                textClass = "text-white";
              } else if (hasEvents) {
                bgClass = "bg-sky-50/80 hover:bg-sky-100/60 font-semibold text-sky-800";
                textClass = "text-sky-800";
                borderClass = "border-sky-200/80";
              }

              const isCellHovered = hoveredDate === dateStr;

              return (
                <div 
                  key={idx}
                  onMouseEnter={() => hasEvents && setHoveredDate(dateStr)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className={`group h-8 w-full max-w-[34px] mx-auto flex flex-col items-center justify-center rounded-lg text-xs font-medium relative transition-all border ${bgClass} ${textClass} ${borderClass} cursor-pointer`}
                >
                  <span>{cell.day}</span>
                  {hasEvents && !isTodayCell && (
                    <span className="absolute bottom-[2px] w-1 h-1 rounded-full bg-sky-500"></span>
                  )}
                  {hasEvents && isTodayCell && (
                    <span className="absolute bottom-[2px] w-1 h-1 rounded-full bg-white"></span>
                  )}

                  {/* Elegant absolute popover hover tooltip */}
                  <AnimatePresence>
                    {hasEvents && isCellHovered && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-[999] bg-slate-900 text-white p-3.5 rounded-xl shadow-lg w-60 border border-slate-800 pointer-events-none text-left flex flex-col font-['Plus_Jakarta_Sans']"
                      >
                        <div className="font-semibold text-sky-400 text-[10px] mb-2 flex items-center gap-1.5 border-b border-slate-800 pb-1.5 uppercase tracking-wider">
                          <Pin className="w-3.5 h-3.5 text-sky-400 rotate-45" />
                          <span>{cell.day} {monthNames[cell.month]} {cell.year}</span>
                        </div>
                        <div className="space-y-2 max-h-24 overflow-y-auto custom-scrollbar">
                          {important.events.map((ev, eIdx) => (
                            <div key={eIdx} className="flex flex-col border-l-2 border-sky-400 pl-2.5 py-0.5 leading-snug">
                              <span className="font-semibold text-sky-200 text-xs">{ev.label}</span>
                              <span className="text-slate-300 text-[10px] truncate font-normal">{ev.project}</span>
                            </div>
                          ))}
                        </div>
                        {/* Tooltip Arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-r border-b border-slate-800 rotate-45 -mt-1"></div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Studio Pulse Tracker Widget (lg:col-span-4) */}
      <div className="lg:col-span-4 bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-2xs lg:h-[320px] h-auto flex flex-col justify-between relative overflow-hidden transition-all">
        <div>
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
              </span>
              <h4 className="text-xs font-bold text-sky-700 uppercase tracking-wider">
                STUDIO PULSE
              </h4>
            </div>
            {upcomingMilestones.length > 0 && (
              <span className="text-[10px] font-semibold px-2.5 py-0.5 bg-sky-50 text-sky-700 rounded-full border border-sky-200/60 uppercase tracking-wider">
                {upcomingMilestones.length} Upcoming
              </span>
            )}
          </div>

          <motion.div 
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.08
                }
              }
            }}
            className="space-y-3 max-h-[195px] overflow-y-auto custom-scrollbar pr-0.5"
          >
            {upcomingMilestones.length > 0 ? (
              upcomingMilestones.slice(0, 3).map((item, idx) => {
                const relativeText = getRelativeDays(item.dateStr);
                const isUrgent = relativeText === "Today" || relativeText === "Tomorrow";

                return (
                  <motion.div 
                    key={idx} 
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120 } }
                    }}
                    whileHover={{ scale: 1.01, x: 2, transition: { duration: 0.15 } }}
                    className="flex items-center gap-3 text-left group cursor-pointer"
                  >
                    {/* Compact Date Box */}
                    <div className="flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/80 shrink-0 group-hover:border-sky-300 group-hover:bg-sky-50/40 transition-all duration-150">
                      <span className="text-sm font-bold text-slate-800 leading-none tabular-nums">
                        {formatMilestoneDay(item.date)}
                      </span>
                      <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none mt-1">
                        {formatMilestoneMonth(item.date)}
                      </span>
                    </div>

                    {/* Milestone details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {item.label}
                        </span>
                        {relativeText && (
                          <span className={`text-[9px] font-semibold shrink-0 px-2 py-0.5 rounded-md ${
                            isUrgent ? "text-amber-800 bg-amber-50 border border-amber-200/60" : "text-slate-500 bg-slate-50 border border-slate-200/60"
                          }`}>
                            {relativeText}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-normal text-slate-500 truncate mt-0.5">
                        {item.project}
                      </span>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Flag className="w-6 h-6 text-slate-300 mb-2 stroke-1" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  No upcoming milestones
                </p>
                <p className="text-[11px] text-slate-400 mt-1 font-normal">
                  All design tracks are currently aligned.
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Minimal dynamic footer indicator */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          <span className="truncate">Portfolio Execution Track</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-sky-600 transition-colors" />
        </div>
      </div>
    </div>
  );
}
