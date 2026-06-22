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

      let currentStartDate = new Date(kickoffDate);

      steps.forEach((step) => {
        const duration = step.defaultDuration || 14; // Default to 14 if not set
        const endDate = new Date(currentStartDate);
        endDate.setDate(endDate.getDate() + duration);

        const phaseData: TimelinePhaseData = {
          stepNumber: step.stepNumber,
          title: step.title,
          startDate: currentStartDate.toISOString(),
          endDate: endDate.toISOString(),
          durationDays: duration,
        };

        const docRef = doc(phasesRef, String(step.stepNumber));
        batch.set(docRef, phaseData);
        createdPhases.push(phaseData);

        // Next start date is end date + 1 day
        currentStartDate = new Date(endDate);
        currentStartDate.setDate(currentStartDate.getDate() + 1);
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

      let currentStartDate = new Date(sortedPhases[targetIndex].startDate);
      let lastEndDate = currentStartDate; // fallback

      for (let i = targetIndex; i < sortedPhases.length; i++) {
        const phase = sortedPhases[i];
        const duration =
          i === targetIndex ? newDurationDays : phase.durationDays;

        const endDate = new Date(currentStartDate);
        endDate.setDate(endDate.getDate() + duration);

        batch.update(doc(phasesRef, String(phase.stepNumber)), {
          startDate: currentStartDate.toISOString(),
          endDate: endDate.toISOString(),
          durationDays: duration,
        });

        lastEndDate = endDate;

        // Next start date
        currentStartDate = new Date(endDate);
        currentStartDate.setDate(currentStartDate.getDate() + 1);
      }

      // Update project estimated completion date
      const projectRef = doc(
        firestoreDb,
        `studios/${studioId}/projects`,
        projectId,
      );
      batch.set(
        projectRef,
        { estimatedCompletionDate: lastEndDate.toISOString() },
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

  return {
    phases,
    loading,
    buildTimelineFromTemplate,
    updatePhaseDuration,
    resetTimeline,
  };
}
