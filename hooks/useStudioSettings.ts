import { useState, useEffect } from 'react';
import { db as firestoreDb } from '../services/firebaseClient';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { COMMUNICATION_TEMPLATE_DEFAULT } from '../constants';
import { db } from '../services/dbService';
import { EMAIL_TEMPLATE_LIBRARY } from '../lib/templateEngine';

export interface StudioSettings {
  designProcess?: {
    steps: { stepNumber: number; title: string; description: string; deliverables: string[]; clientSignoffRequired?: boolean; triggersMilestoneLabel?: string | null; defaultDuration?: number }[];
    totalSteps: number;
    processSummary: string;
  };
  feeStructure?: {
    designFeeMin: number;
    designFeeMax: number;
    feeNote: string;
    revisionPolicy: string;
    siteVisitPolicy: string;
  };
  paymentMilestones?: {
    milestones: { label: string; percent: number; trigger: string; description: string }[];
    paymentNote: string;
    totalMustEqual100: boolean;
    overdueDaysThreshold?: number;
    escalation?: {
      reminderDays: number;
      warnDays: number;
      pauseDays: number;
      autoSendReminder: boolean;
    };
  };
  projectTerms?: {
    warrantyPeriod: string;
    standardInclusions: string[];
    standardExclusions: string[];
    contractClauses: { clauseTitle: string; clauseText: string }[];
  };
  onboardingProcess?: {
    welcomeMessage: string;
    steps: { stepNumber: number; title: string; description: string; ownerRole: 'studio' | 'client' }[];
    kickoffChecklist: string[];
  };
  emailTemplates?: {
    proposalIntro: string;
    onboardingWelcome: string;
    paymentRequest: string;
    projectUpdate: string;
    handoverNote: string;
  };
  clientPortalConfig?: {
    portalTitle: string;
    introMessage: string;
    supportContact: string;
    showTimeline: boolean;
    showPayments: boolean;
    showDocuments: boolean;
  };
  sofSettings?: {
    changeRequestSignoffThreshold: number;
    allowZeroCostChanges: boolean;
    changeRequestNote: string;
  };
  calendarIntegration?: {
    defaultReminderMinutes: number;
    calendarEventPrefix: string;
    autoAddClientToMeetings: boolean;
    defaultMeetingDuration: number;
    defaultSiteVisitDuration: number;
  };
  communicationTemplate?: import('../types').CommunicationTemplateItem[];
  emailTemplateLibrary?: import('../types').CommunicationTemplateItem[];
}

const defaultFFDSSettings: StudioSettings = {
  designProcess: {
    steps: [
      { stepNumber: 1, title: "Discovery & SOF", description: "Requirement gathering and initial SOF freeze", deliverables: ["Signed SOF"], clientSignoffRequired: true, triggersMilestoneLabel: "Booking", defaultDuration: 7 },
      { stepNumber: 2, title: "Concept & 3D", description: "Moodboards, layouts, and initial 3Ds", deliverables: ["Moodboard", "3D Views"], clientSignoffRequired: true, triggersMilestoneLabel: "Design Approval", defaultDuration: 14 },
      { stepNumber: 3, title: "Procurement & Carpentry", description: "Sourcing materials and basic structural carpentry", deliverables: ["Material Orders", "Carcass Complete"], clientSignoffRequired: false, triggersMilestoneLabel: "Execution Start", defaultDuration: 21 },
      { stepNumber: 4, title: "Finishes & Installation", description: "Paint, polish, and final fixture installation", deliverables: ["Painted Walls", "Installed Fixtures"], clientSignoffRequired: false, defaultDuration: 14 },
      { stepNumber: 5, title: "Handover", description: "Deep cleaning and final handover to client", deliverables: ["Snagging List Resolved"], clientSignoffRequired: true, triggersMilestoneLabel: "Handover", defaultDuration: 7 }
    ],
    totalSteps: 5,
    processSummary: "Standard 5-step design and execution process."
  },
  feeStructure: {
    designFeeMin: 10,
    designFeeMax: 12,
    feeNote: "Fees are calculated as a percentage of total execution cost.",
    revisionPolicy: "2 major layout revisions included.",
    siteVisitPolicy: "Up to 10 site visits included during execution."
  },
  paymentMilestones: {
    milestones: [
      { label: "Booking", percent: 10, trigger: "Contract Signing", description: "To commence design" },
      { label: "Design Approval", percent: 40, trigger: "3D Signoff", description: "Before procurement starts" },
      { label: "Execution Start", percent: 40, trigger: "Material on site", description: "When carpentry begins" },
      { label: "Handover", percent: 10, trigger: "Project completion", description: "Final walk-through" }
    ],
    paymentNote: "Work pauses if payments are delayed beyond 3 working days.",
    totalMustEqual100: true,
    overdueDaysThreshold: 7,
    escalation: { reminderDays: 3, warnDays: 7, pauseDays: 14, autoSendReminder: false }
  },
  projectTerms: {
    warrantyPeriod: "1 year from handover",
    standardInclusions: ["Fixed furniture", "Loose furniture", "False ceiling"],
    standardExclusions: ["White goods", "Civil changes if any structural"],
    contractClauses: [
      { clauseTitle: "Force Majeure", clauseText: "Standard delays beyond our control." }
    ]
  },
  onboardingProcess: {
    welcomeMessage: "Welcome to Form Factors Design Studio!",
    steps: [
      { stepNumber: 1, title: "Fill Questionnaire", description: "Tell us about your style", ownerRole: "client" }
    ],
    kickoffChecklist: ["Site keys handed over", "Society NOC acquired"]
  },
  emailTemplates: {
    proposalIntro: "Hi {clientName},\n\nPlease find the proposal for {projectName} by {studioName}.",
    onboardingWelcome: "Welcome {clientName}!",
    paymentRequest: "A milestone has been reached for {projectName}.",
    projectUpdate: "Weekly update for {projectName}.",
    handoverNote: "Congratulations on your new space, {clientName}!"
  },
  clientPortalConfig: {
    portalTitle: "Your Design Journey",
    introMessage: "Track your home interiors progress here.",
    supportContact: "operations@formfactors.in",
    showTimeline: true,
    showPayments: true,
    showDocuments: true
  },
  sofSettings: {
    changeRequestSignoffThreshold: 5000,
    allowZeroCostChanges: true,
    changeRequestNote: "All change requests are subject to revised timeline and cost approval."
  },
  calendarIntegration: {
    defaultReminderMinutes: 30,
    calendarEventPrefix: "[BOQ Copilot]",
    autoAddClientToMeetings: true,
    defaultMeetingDuration: 60,
    defaultSiteVisitDuration: 90,
  },
  communicationTemplate: COMMUNICATION_TEMPLATE_DEFAULT,
  emailTemplateLibrary: EMAIL_TEMPLATE_LIBRARY,
};

const defaultEmptySettings: StudioSettings = {
  designProcess: { steps: [], totalSteps: 0, processSummary: "" },
  feeStructure: { designFeeMin: 0, designFeeMax: 0, feeNote: "", revisionPolicy: "", siteVisitPolicy: "" },
  paymentMilestones: { milestones: [], paymentNote: "", totalMustEqual100: true, overdueDaysThreshold: 7, escalation: { reminderDays: 3, warnDays: 7, pauseDays: 14, autoSendReminder: false } },
  projectTerms: { warrantyPeriod: "", standardInclusions: [], standardExclusions: [], contractClauses: [] },
  onboardingProcess: { welcomeMessage: "", steps: [], kickoffChecklist: [] },
  emailTemplates: { proposalIntro: "", onboardingWelcome: "", paymentRequest: "", projectUpdate: "", handoverNote: "" },
  clientPortalConfig: { portalTitle: "", introMessage: "", supportContact: "", showTimeline: true, showPayments: true, showDocuments: true },
  sofSettings: { changeRequestSignoffThreshold: 5000, allowZeroCostChanges: true, changeRequestNote: "" },
  calendarIntegration: {
    defaultReminderMinutes: 30,
    calendarEventPrefix: "[BOQ Copilot]",
    autoAddClientToMeetings: true,
    defaultMeetingDuration: 60,
    defaultSiteVisitDuration: 90,
  },
  communicationTemplate: COMMUNICATION_TEMPLATE_DEFAULT,
  emailTemplateLibrary: EMAIL_TEMPLATE_LIBRARY,
};

export function useStudioSettings(studioId: string) {
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!studioId) return;

    let isMounted = true;
    
    async function loadSettings() {
      if (!firestoreDb) {
        const defaultData = defaultFFDSSettings;
        if (isMounted) setSettings(defaultData);
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(firestoreDb, `studios/${studioId}/settings/main`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const fetchedData = docSnap.data() as Partial<StudioSettings>;
          const defaultData = defaultFFDSSettings;
          
          if (!fetchedData.emailTemplateLibrary || fetchedData.emailTemplateLibrary.length === 0) {
              fetchedData.emailTemplateLibrary = EMAIL_TEMPLATE_LIBRARY;
              if ((db as any).seedDefaultTemplates) {
                  (db as any).seedDefaultTemplates(studioId);
              }
          }
          
          // Force apply the 5-step process if the saved version is old and only has 2 steps
          if (fetchedData?.designProcess?.steps && fetchedData.designProcess.steps.length === 0) { fetchedData.designProcess = defaultFFDSSettings.designProcess; }
          if (studioId === 'demo-tenant-01' && fetchedData?.designProcess?.steps && fetchedData.designProcess.steps.length < 5) {
             fetchedData.designProcess = defaultFFDSSettings.designProcess;
          }

          if (isMounted) {
            setSettings({ ...defaultData, ...fetchedData } as StudioSettings);
          }
        } else {
          // Migration logic
          const defaultData = defaultFFDSSettings;
          await setDoc(docRef, defaultData);
          if (isMounted) setSettings(defaultData);
        }
      } catch (err: any) {
        console.error("Error fetching studio settings", err);
        const defaultData = defaultFFDSSettings;
        if (isMounted) {
            setSettings(defaultData);
            setError(err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadSettings();

    return () => { isMounted = false; };
  }, [studioId]);

  const updateSettings = async (section: keyof StudioSettings, data: any) => {
    try {
      if (firestoreDb && studioId) {
        const docRef = doc(firestoreDb, `studios/${studioId}/settings/main`);
        await updateDoc(docRef, {
          [section]: data
        });
      }
      setSettings(prev => prev ? { ...prev, [section]: data } : null);
    } catch (err) {
      console.error("Error updating studio settings", err);
      throw err;
    }
  };

  return { settings, updateSettings, loading, error };
}
