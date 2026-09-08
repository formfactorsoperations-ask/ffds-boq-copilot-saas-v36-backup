import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, Pin, Flag } from "lucide-react";
import { FullProjectData } from "../../types";
import { useTilt } from "./useTilt";
import {
  useCalendarData, buildCalendarDays, isSameDay, liftFor, MONTH_NAMES,
} from "./calendarData";

/**
 * The month grid, on its own.
 *
 * One implementation, two homes: design A renders it as the middle panel of
 * the three-panel strip, design B puts it in the right-hand rail beside the
 * worklist. Both get it from here, so the grid can never drift between them.
 *
 * Depth carries information rather than decorating: a day is lifted by HOW
 * MUCH IS ON IT, and a day with several things renders as a stack of cards, so
 * a busy date is literally thicker. Today stands highest.
 */

interface Props {
  projects: FullProjectData[];
  /** Wrapper classes — the grid column span, when placed in one. */
  className?: string;
  /** Fixed height suits the three-panel strip; the rail lets it size itself. */
  fixedHeight?: boolean;
  /** Folds the next milestone into the footer, replacing a separate panel. */
  showNextMilestone?: boolean;
}

export default function MonthCalendar({
  projects, className = "", fixedHeight = true, showNextMilestone = false,
}: Props) {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [hoveredDate, setHoveredDate] = React.useState<string | null>(null);
  const tilt = useTilt(4);

  const { importantDates, upcomingMilestones } = useCalendarData(projects);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const calendarDays = buildCalendarDays(year, month);

  const next = upcomingMilestones[0];
  const daysAway = next
    ? Math.round(
        (new Date(next.dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000
      )
    : 0;

  return (
    <div className={`cc-scene ${className}`}>
      <div
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        className={`cc-panel h-full bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between relative z-10 hover:z-20 transition-all ${
          fixedHeight ? "lg:h-[320px]" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-600" />
            <h4 className="text-sm font-bold text-slate-800 tracking-tight">
              {MONTH_NAMES[month]} {year}
            </h4>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Rests at a slight backward tilt, like a card on a desk, and
              straightens when reached for so nothing is read at an angle. */}
          <div className="cc-desk grid grid-cols-7 gap-1 relative">
            {calendarDays.map((cell, idx) => {
              const dateStr = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
              const important = importantDates[dateStr];
              const hasEvents = !!important && important.events.length > 0;
              const isTodayCell = isSameDay(cell.day, cell.month, cell.year);

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
              const eventCount = hasEvents ? important!.events.length : 0;
              const lift = liftFor(eventCount, isTodayCell);
              const understoreys = Math.min(Math.max(eventCount - 1, 0), 2);

              return (
                <div
                  key={idx}
                  onMouseEnter={() => hasEvents && setHoveredDate(dateStr)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className={`cc-day group h-8 w-full max-w-[34px] mx-auto flex flex-col items-center justify-center rounded-lg text-xs font-medium relative border ${bgClass} ${textClass} ${borderClass} cursor-pointer`}
                  style={{
                    ["--cc-lift" as any]: `${lift}px`,
                    boxShadow: lift
                      ? `0 ${Math.round(lift * 0.55)}px ${Math.round(lift * 1.1)}px -${Math.round(lift * 0.42)}px rgba(10,27,51,${isTodayCell ? 0.42 : 0.24})`
                      : undefined,
                  }}
                >
                  {Array.from({ length: understoreys }).map((_, k) => (
                    <span
                      key={k}
                      aria-hidden
                      className="cc-day-stack border"
                      style={{
                        transform: `translateZ(-${(k + 1) * 5}px) translateY(${(k + 1) * 1.5}px)`,
                        background: isTodayCell ? "#0A62C4" : "#DCEBFA",
                        borderColor: isTodayCell ? "#0A62C4" : "#C3DDF5",
                      }}
                    />
                  ))}
                  <span className="relative">{cell.day}</span>
                  {hasEvents && !isTodayCell && (
                    <span className="absolute bottom-[2px] w-1 h-1 rounded-full bg-sky-500" />
                  )}
                  {hasEvents && isTodayCell && (
                    <span className="absolute bottom-[2px] w-1 h-1 rounded-full bg-white" />
                  )}

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
                          <span>{cell.day} {MONTH_NAMES[cell.month]} {cell.year}</span>
                        </div>
                        <div className="space-y-2 max-h-24 overflow-y-auto custom-scrollbar">
                          {important!.events.map((ev, eIdx) => (
                            <div
                              key={eIdx}
                              className="flex flex-col border-l-2 border-sky-400 pl-2.5 py-0.5 leading-snug"
                            >
                              <span className="text-[12px] font-semibold">{ev.label}</span>
                              <span className="text-[11px] text-slate-400">{ev.project}</span>
                            </div>
                          ))}
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-r border-b border-slate-800 rotate-45 -mt-1" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {/* What lands next, folded in rather than given a panel of its own —
            it was one line of content occupying a third of a row. */}
        {showNextMilestone && (
          <div className="cc-z1 mt-4 pt-3 border-t border-slate-100">
            {next ? (
              <div className="flex items-center gap-2.5">
                <Flag className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-semibold text-slate-800 truncate">
                    {next.label}
                  </span>
                  <span className="block text-[11.5px] text-slate-500 truncate">
                    {next.project}
                  </span>
                </span>
                <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200/60 rounded-md px-2 py-0.5 shrink-0">
                  {daysAway <= 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`}
                </span>
              </div>
            ) : (
              <p className="text-[11.5px] text-slate-400 font-medium uppercase tracking-wider">
                No upcoming milestones
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
