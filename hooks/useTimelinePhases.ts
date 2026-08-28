import { useState, useEffect } from "react";
import {
  doc,
  collection,
  onSnapshot,
  getDocs,
  writeBatch,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db as firestoreDb } from "../services/firebaseClient";
import { StudioSettings } from "./useStudioSettings";
import { StepProgress } from "./useStepProgress";
import {
  DEFAULT_CALENDAR,
  toDayNum,
  toISO,
  isWorkingDay,
  nextWorkingDay,
  workSpanEnd,
  workingDaysBetween,
  shiftByWorkingDays,
} from "../lib/schedule";

export interface TimelinePhaseData {
  stepNumber: number;
  title: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  durationDays: number;
  isDelayed?: boolean;
}

export interface MergedTimelinePhase extends TimelinePhaseData {
  stepProgress?: StepProgress;
}

export function useTimelinePhases(projectId: string, studioId: string) {
  const [phases, setPhases] = useState<MergedTimelinePhase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId?.trim() || !studioId?.trim() || !firestoreDb) {
      setLoading(false);
      return;
    }

    const phasesRef = collection(
      firestoreDb,
      `studios/${studioId}/projects/${projectId}/timelinePhases`,
    );
    const stepsRef = collection(
      firestoreDb,
      `studios/${studioId}/projects/${projectId}/stepProgress`,
    );

    let phasesData: TimelinePhaseData[] = [];
    let stepsData: StepProgress[] = [];

    const updateMergedPhases = () => {
      const merged: MergedTimelinePhase[] = phasesData.map((phase) => {
        const stepProg = stepsData.find(
          (s) => s.stepNumber === phase.stepNumber,
        );

        // Determine if delayed
        let isDelayed = false;
        if (phase.endDate) {
          const end = new Date(phase.endDate);
          const now = new Date();
          if (now > end && stepProg?.status !== "completed") {
            isDelayed = true;
          }
        }

        return {
          ...phase,
          isDelayed,
          stepProgress: stepProg,
        };
      });
      merged.sort((a, b) => a.stepNumber - b.stepNumber);
      setPhases(merged);
      setLoading(false);
    };

    const unsubscribePhases = onSnapshot(phasesRef, (snapshot) => {
      phasesData = snapshot.docs.map((doc) => doc.data() as TimelinePhaseData);
      updateMergedPhases();
    });

    const unsubscribeSteps = onSnapshot(stepsRef, (snapshot) => {
      stepsData = snapshot.docs.map((doc) => doc.data() as StepProgress);
      updateMergedPhases();
    });

    return () => {
      unsubscribePhases();
      unsubscribeSteps();
    };
  }, [projectId, studioId]);

  const buildTimelineFromTemplate = async (
    kickoffDate: string,
    processSteps: StudioSettings["designProcess"]["steps"],
  ) => {
    if (!firestoreDb || !projectId || !studioId) {
      console.error("Missing db, projectId, or studioId", {
        firestoreDb: !!firestoreDb,
        projectId,
        studioId,
      });
      return [];
    }

    try {
      const phasesRef = collection(
        firestoreDb,
        `studios/${studioId}/projects/${projectId}/timelinePhases`,
      );
      const existingSnaps = await getDocs(phasesRef);
      if (!existingSnaps.empty) {
        console.log("Timeline already exists. Not auto-building.");
        return existingSnaps.docs.map((d) => d.data() as TimelinePhaseData);
      }

      const steps = processSteps || [];

      if (steps.length === 0) {
        console.error("No steps defined in studio settings.");
        throw new Error("Your studio's design process has no steps defined. Please configure them in Settings.");
      }

      const batch = writeBatch(firestoreDb);
      const createdPhases: TimelinePhaseData[] = [];

      let currentStartDayNum = toDayNum(kickoffDate.slice(0, 10));

      steps.forEach((step) => {
        const duration = step.defaultDuration || 14; // Default to 14 if not set
        const startDay = nextWorkingDay(DEFAULT_CALENDAR, currentStartDayNum);
        const endDay = workSpanEnd(DEFAULT_CALENDAR, startDay, duration);

        const phaseData: TimelinePhaseData = {
          stepNumber: step.stepNumber,
          title: step.title,
          startDate: toISO(startDay) + "T00:00:00.000Z",
          endDate: toISO(endDay) + "T23:59:59.000Z",
          durationDays: duration,
        };

        const docRef = doc(phasesRef, String(step.stepNumber));
        batch.set(docRef, phaseData);
        createdPhases.push(phaseData);

        // Next start day number
        currentStartDayNum = endDay + 1;
      });

      // Update project kickoff and estimated completion date
      const projectRef = doc(
        firestoreDb,
        `studios/${studioId}/projects`,
        projectId,
      );
      const lastPhase = createdPhases[createdPhases.length - 1];
      batch.set(
        projectRef,
        {
          kickoffDate,
          estimatedCompletionDate: lastPhase.endDate,
        },
        { merge: true },
      );

      await batch.commit();
      return createdPhases;
    } catch (err: any) {
      console.error("Error building timeline from template:", err);
      throw new Error(err.message || "Failed to generate timeline");
    }
  };

  const updatePhaseDuration = async (
    stepNumber: number,
    newDurationDays: number,
  ) => {
    if (!firestoreDb || !projectId || !studioId) return;

    try {
      // Find the phase and subsequent ones
      const sortedPhases = [...phases].sort(
        (a, b) => a.stepNumber - b.stepNumber,
      );
      const targetIndex = sortedPhases.findIndex(
        (p) => p.stepNumber === stepNumber,
      );
      if (targetIndex === -1) return;

      const batch = writeBatch(firestoreDb);
      const phasesRef = collection(
        firestoreDb,
        `studios/${studioId}/projects/${projectId}/timelinePhases`,
      );

      let currentStartDayNum = toDayNum(sortedPhases[targetIndex].startDate.slice(0, 10));
      let lastEndDayNum = currentStartDayNum;

      for (let i = targetIndex; i < sortedPhases.length; i++) {
        const phase = sortedPhases[i];
        const duration =
          i === targetIndex ? newDurationDays : phase.durationDays;

        const startDay = nextWorkingDay(DEFAULT_CALENDAR, currentStartDayNum);
        const endDay = workSpanEnd(DEFAULT_CALENDAR, startDay, duration);

        batch.update(doc(phasesRef, String(phase.stepNumber)), {
          startDate: toISO(startDay) + "T00:00:00.000Z",
          endDate: toISO(endDay) + "T23:59:59.000Z",
          durationDays: duration,
        });

        lastEndDayNum = endDay;

        // Next start date
        currentStartDayNum = endDay + 1;
      }

      // Update project estimated completion date
      const projectRef = doc(
        firestoreDb,
        `studios/${studioId}/projects`,
        projectId,
      );
      batch.set(
        projectRef,
        { estimatedCompletionDate: toISO(lastEndDayNum) + "T23:59:59.000Z" },
        { merge: true },
      );

      await batch.commit();
    } catch (err) {
      console.error("Error updating phase duration:", err);
    }
  };

  const resetTimeline = async () => {
    if (!firestoreDb || !projectId || !studioId) return;
    try {
      const phasesRef = collection(
        firestoreDb,
        `studios/${studioId}/projects/${projectId}/timelinePhases`,
      );
      const snaps = await getDocs(phasesRef);
      const batch = writeBatch(firestoreDb);
      snaps.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      setPhases([]);
    } catch (err) {
      console.error("Error resetting timeline:", err);
      alert("Failed to clear timeline.");
    }
  };

  const updatePhaseDates = async (
    stepNumber: number,
    newStartDateStr: string,
    newEndDateStr: string,
  ) => {
    if (!firestoreDb || !projectId || !studioId) return;

    try {
      const sortedPhases = [...phases].sort(
        (a, b) => a.stepNumber - b.stepNumber,
      );
      const targetIndex = sortedPhases.findIndex(
        (p) => p.stepNumber === stepNumber,
      );
      if (targetIndex === -1) return;

      const batch = writeBatch(firestoreDb);
      const phasesRef = collection(
        firestoreDb,
        `studios/${studioId}/projects/${projectId}/timelinePhases`,
      );

      const targetStartDayNum = toDayNum(newStartDateStr.slice(0, 10));
      const targetEndDayNum = toDayNum(newEndDateStr.slice(0, 10));

      // Calculate new duration in working days
      const diffWorkingDays = workingDaysBetween(DEFAULT_CALENDAR, targetStartDayNum, targetEndDayNum);
      const duration = Math.max(1, diffWorkingDays);

      let currentStartDayNum = targetStartDayNum;
      let lastEndDayNum = targetEndDayNum;

      for (let i = targetIndex; i < sortedPhases.length; i++) {
        const phase = sortedPhases[i];
        const stepDuration = i === targetIndex ? duration : phase.durationDays;

        const startDay = nextWorkingDay(DEFAULT_CALENDAR, currentStartDayNum);
        const endDay = workSpanEnd(DEFAULT_CALENDAR, startDay, stepDuration);

        batch.update(doc(phasesRef, String(phase.stepNumber)), {
          startDate: toISO(startDay) + "T00:00:00.000Z",
          endDate: toISO(endDay) + "T23:59:59.000Z",
          durationDays: stepDuration,
        });

        lastEndDayNum = endDay;

        // Next start date is end date + 1 day
        currentStartDayNum = endDay + 1;
      }

      // Update project estimated completion date
      const projectRef = doc(
        firestoreDb,
        `studios/${studioId}/projects`,
        projectId,
      );
      batch.set(
        projectRef,
        { estimatedCompletionDate: toISO(lastEndDayNum) + "T23:59:59.000Z" },
        { merge: true },
      );

      await batch.commit();
    } catch (err) {
      console.error("Error updating phase dates:", err);
    }
  };

  const shiftTimelinePhases = async (stepNumber: number, daysToShift: number) => {
    if (!firestoreDb || !projectId || !studioId || daysToShift === 0) return;
    try {
      const sortedPhases = [...phases].sort((a, b) => a.stepNumber - b.stepNumber);
      const targetIndex = sortedPhases.findIndex(p => p.stepNumber === stepNumber);
      if (targetIndex === -1) return;

      const batch = writeBatch(firestoreDb);
      const phasesRef = collection(firestoreDb, `studios/${studioId}/projects/${projectId}/timelinePhases`);
      
      let lastEndDayNum = toDayNum(new Date().toISOString().slice(0, 10));
      for (let i = targetIndex; i < sortedPhases.length; i++) {
        const phase = sortedPhases[i];
        const startDay = toDayNum(phase.startDate.slice(0, 10));
        const endDay = toDayNum(phase.endDate.slice(0, 10));

        let newStartDay = startDay;
        let newEndDay = endDay;

        if (daysToShift > 0) {
          newStartDay = shiftByWorkingDays(DEFAULT_CALENDAR, startDay, daysToShift);
          newEndDay = shiftByWorkingDays(DEFAULT_CALENDAR, endDay, daysToShift);
        } else if (daysToShift < 0) {
          const absShift = Math.abs(daysToShift);
          
          let dS = startDay, movedS = 0;
          while (movedS < absShift) {
            dS--;
            if (isWorkingDay(DEFAULT_CALENDAR, dS)) movedS++;
          }
          newStartDay = dS;

          let dE = endDay, movedE = 0;
          while (movedE < absShift) {
            dE--;
            if (isWorkingDay(DEFAULT_CALENDAR, dE)) movedE++;
          }
          newEndDay = dE;
        }

        batch.update(doc(phasesRef, String(phase.stepNumber)), {
          startDate: toISO(newStartDay) + "T00:00:00.000Z",
          endDate: toISO(newEndDay) + "T23:59:59.000Z"
        });
        lastEndDayNum = newEndDay;
      }

      const projectRef = doc(firestoreDb, `studios/${studioId}/projects`, projectId);
      batch.set(projectRef, { estimatedCompletionDate: toISO(lastEndDayNum) + "T23:59:59.000Z" }, { merge: true });

      await batch.commit();
    } catch (err) {
      console.error("Error shifting timeline:", err);
    }
  };

  return {
    phases,
    loading,
    buildTimelineFromTemplate,
    updatePhaseDuration,
    updatePhaseDates,
    shiftTimelinePhases,
    resetTimeline,
  };
}
