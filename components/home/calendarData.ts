import React from "react";
import { FullProjectData } from "../../types";

/**
 * Milestone dates, derived from the project set.
 *
 * Lifted out of ClockCalendar so the month grid can be placed on its own --
 * design B puts it in the right-hand rail while design A keeps it in the
 * three-panel strip -- without either copy re-deriving the dates. Two copies
 * of this would disagree the first time a date field was added.
 *
 * Moved verbatim; no behaviour is changed here.
 */
export interface MilestoneEvent { label: string; project: string }
export type ImportantDates = Record<string, { events: MilestoneEvent[] }>;
export interface UpcomingMilestone {
  date: Date; dateStr: string; label: string; project: string;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function useCalendarData(projects: FullProjectData[]) {
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


  return { importantDates, upcomingMilestones };
}

/** Six rows of cells for the given month, with neighbouring-month padding. */
export function buildCalendarDays(year: number, month: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ day: d, month: m, year: y, isCurrentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, month, year, isCurrentMonth: true });

  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    cells.push({ day: i, month: m, year: y, isCurrentMonth: false });
  }
  return cells;
}

export const isSameDay = (day: number, m: number, y: number) => {
  const t = new Date();
  return t.getDate() === day && t.getMonth() === m && t.getFullYear() === y;
};

/** How far a day cell stands off the page, by how much is on it. */
export const liftFor = (events: number, isToday: boolean) => {
  if (isToday) return 30;
  if (events >= 3) return 24;
  if (events === 2) return 17;
  if (events === 1) return 10;
  return 0;
};
