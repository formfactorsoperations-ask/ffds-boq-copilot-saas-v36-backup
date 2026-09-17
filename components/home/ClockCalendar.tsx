import React, { useState, useEffect } from "react";
import { FullProjectData } from "../../types";
import { Clock, Flag, ArrowRight, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTilt } from "./useTilt";
import MonthCalendar from "./MonthCalendar";
import { useCalendarData } from "./calendarData";

interface ClockCalendarProps {
  projects: FullProjectData[];
}

/** How far a day cell stands off the page, by how much is on it. */
const liftFor = (events: number, isToday: boolean) => {
  if (isToday) return 30;
  if (events >= 3) return 24;
  if (events === 2) return 17;
  if (events === 1) return 10;
  return 0;
};

export default function ClockCalendar({ projects }: ClockCalendarProps) {
  const clockTilt = useTilt(7);
  const pulseTilt = useTilt(6);

  const [time, setTime] = useState(new Date());

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

  /* Only the milestone list is still needed here -- the month grid and all of
     its date maths moved to MonthCalendar. */
  const { upcomingMilestones } = useCalendarData(projects);

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full font-['Plus_Jakarta_Sans']">
      {/* 1. Live Premium Clock Widget (lg:col-span-3) */}
      <div className="lg:col-span-3 cc-scene">
      <div
        ref={clockTilt.ref}
        onMouseMove={clockTilt.onMouseMove}
        onMouseLeave={clockTilt.onMouseLeave}
        className="cc-panel h-full bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden lg:h-[320px] transition-all"
      >
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

          {/* Analog dial. Face, ticks and each hand sit on their own Z plane,
              so the hands genuinely hover above the face and drop onto it. */}
          <div className="cc-dial relative mx-auto mt-2" style={{ width: 132, height: 132 }}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle at 34% 28%, #ffffff, #EEF3F9 62%, #E2E9F2)",
                boxShadow: "inset 0 2px 6px rgba(255,255,255,.9), inset 0 -8px 18px rgba(10,27,51,.07), 0 10px 26px -14px rgba(10,27,51,.5)",
              }}
            />

            <div className="cc-z1 absolute inset-0">
              {/* Ticks, shortened to leave room for the numerals inside them. */}
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={`t${i}`}
                  className="absolute rounded-full"
                  style={{
                    width: i % 3 === 0 ? 2.5 : 1.5,
                    height: i % 3 === 0 ? 7 : 4,
                    left: "50%",
                    top: 7,
                    marginLeft: i % 3 === 0 ? -1.25 : -0.75,
                    transformOrigin: `50% ${59 - (i % 3 === 0 ? 0 : 1.5)}px`,
                    transform: `rotate(${i * 30}deg)`,
                    background: i % 3 === 0 ? "#94A3B8" : "#CBD5E1",
                  }}
                />
              ))}

              {/* Hour numerals. Each is rotated out to its position and then
                  counter-rotated by the same angle, so 4 and 8 sit where they
                  belong without lying on their side. The quarters are darker,
                  which is what the eye actually uses to read a dial fast. */}
              {Array.from({ length: 12 }).map((_, i) => {
                const n = i === 0 ? 12 : i;
                const a = i * 30;
                const quarter = i % 3 === 0;
                return (
                  <span
                    key={`n${i}`}
                    className={`absolute left-1/2 top-1/2 tabular-nums select-none leading-none ${
                      quarter ? "text-[10px] font-extrabold" : "text-[9px] font-bold"
                    }`}
                    style={{
                      color: quarter ? "#475569" : "#94A3B8",
                      transform: `translate(-50%, -50%) rotate(${a}deg) translateY(-43px) rotate(${-a}deg)`,
                    }}
                  >
                    {n}
                  </span>
                );
              })}
            </div>

            {/* Hour, minute, second — each higher than the last. */}
            <div className="absolute inset-0" style={{ transform: "translateZ(26px)" }}>
              <span
                className="cc-hand bg-slate-800"
                style={{
                  width: 4.5, height: 34,
                  marginLeft: -2.25,
                  transform: `rotate(${((time.getHours() % 12) * 30) + time.getMinutes() * 0.5}deg)`,
                }}
              />
            </div>
            <div className="absolute inset-0" style={{ transform: "translateZ(36px)" }}>
              <span
                className="cc-hand bg-slate-600"
                style={{
                  width: 3.5, height: 48,
                  marginLeft: -1.75,
                  transform: `rotate(${time.getMinutes() * 6 + time.getSeconds() * 0.1}deg)`,
                }}
              />
            </div>
            <div className="absolute inset-0" style={{ transform: "translateZ(46px)" }}>
              <span
                className="cc-hand"
                style={{
                  width: 2, height: 54,
                  marginLeft: -1,
                  background: "#3D52A0",
                  transform: `rotate(${time.getSeconds() * 6}deg)`,
                }}
              />
              <span
                className="absolute rounded-full"
                style={{
                  width: 9, height: 9, left: "50%", top: "50%",
                  marginLeft: -4.5, marginTop: -4.5,
                  background: "#3D52A0",
                  boxShadow: "0 2px 5px rgba(10,27,51,.35)",
                }}
              />
            </div>
          </div>

          <div className="cc-z2 text-[19px] font-bold text-slate-900 tracking-tight leading-none flex items-baseline justify-center mt-3 tabular-nums">
            {formatTime(time).split(" ")[0]}
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded-md border border-sky-200/60 uppercase ml-1.5 select-none">
              {formatTime(time).split(" ")[1]}
            </span>
          </div>

          <div className="cc-z1 text-[12.5px] font-semibold text-slate-700 mt-2 tracking-tight text-center">
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
      </div>

      {/* 2. Month calendar — the shared component, so design A and design B
             cannot drift apart. */}
      <MonthCalendar projects={projects} className="lg:col-span-5" />

      {/* 3. Studio Pulse Tracker Widget (lg:col-span-4) */}
      <div className="lg:col-span-4 cc-scene">
      <div
        ref={pulseTilt.ref}
        onMouseMove={pulseTilt.onMouseMove}
        onMouseLeave={pulseTilt.onMouseLeave}
        className="cc-panel h-full bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-2xs lg:h-[320px] flex flex-col justify-between relative overflow-hidden transition-all"
      >
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
    </div>
  );
}
