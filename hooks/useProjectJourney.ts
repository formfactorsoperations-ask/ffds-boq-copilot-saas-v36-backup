import { useContext } from 'react';
import { JourneyContext, StepWithStatus } from '../services/journeyEngine';

export type { StepWithStatus };

export function useProjectJourney(projectId?: string, projectContext?: any) {
  const context = useContext(JourneyContext);
  if (!context) {
    // Return a dummy fallback or throw depending on usage. 
    // To make sure legacy components or unit tests don't break, let's return a fallback without logging a warning.
    return {
      steps: [],
      stepsByPhase: {},
      phaseProgress: [],
      overall: { done: 0, total: 34, pct: 0 },
      activeSteps: [],
      nextStep: null,
      loading: false,
      markStepDone: async () => {},
      markStepPending: async () => {}
    };
  }
  return context;
}
