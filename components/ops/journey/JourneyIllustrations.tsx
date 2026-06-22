import React from 'react';

// Common wrapper for phase color inheritance
const BaseIllu: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-full h-full ${className}`}>
        {children}
    </svg>
);

export const IlluLeadProfiled = () => (
    <BaseIllu>
        <circle cx="32" cy="24" r="8" />
        <path d="M16 48c0-8 8-12 16-12 5.5 0 10.5 2 13.5 5" />
        <circle cx="48" cy="48" r="6" />
        <path d="M52 52l4 4" />
        <path d="M48 45v6 M45 48h6" />
    </BaseIllu>
);

export const IlluTermsDocketAcknowledged = () => (
    <BaseIllu>
        <path d="M22 10h20v44H22z" />
        <path d="M28 20h8 M28 28h8" />
        <circle cx="44" cy="44" r="10" fill="currentColor" fillOpacity="0.1" />
        <path d="M40 44l3 3 6-6" />
    </BaseIllu>
);

export const IlluDiscoveryScheduled = () => (
    <BaseIllu>
        <rect x="14" y="16" width="36" height="32" rx="4" />
        <path d="M14 26h36" />
        <path d="M22 10v12 M42 10v12" />
        <circle cx="24" cy="36" r="2" fill="currentColor" />
        <circle cx="32" cy="36" r="2" fill="currentColor" />
        <circle cx="40" cy="36" r="2" fill="currentColor" />
    </BaseIllu>
);

export const IlluDiscoveryCompleted = () => (
    <BaseIllu>
        <circle cx="20" cy="24" r="6" />
        <path d="M12 40c0-6 4-10 8-10h0c4 0 8 4 8 10" />
        <circle cx="44" cy="24" r="6" />
        <path d="M36 40c0-6 4-10 8-10h0c4 0 8 4 8 10" />
        <path d="M28 16c2-4 8-4 10 0 1 2 0 4-2 6l-3 4-3-4c-2-2-3-4-2-6z" />
    </BaseIllu>
);

export const IlluBriefFrozen = () => (
    <BaseIllu>
        <path d="M16 16h32v32H16z" />
        <path d="M32 16v32 M16 32h32" />
        <circle cx="32" cy="32" r="12" fill="white" />
        <path d="M28 32l3 3 6-6" />
    </BaseIllu>
);

export const IlluSpacePlanningPresented = () => (
    <BaseIllu>
        <path d="M12 16h40v32H12z" />
        <path d="M28 16v32" />
        <rect x="16" y="24" width="8" height="12" />
        <rect x="36" y="20" width="12" height="8" />
    </BaseIllu>
);

export const IlluSpacePlanningApproved = () => (
    <BaseIllu>
        <path d="M12 16h40v32H12z" strokeDasharray="4 4" />
        <path d="M28 16v32" strokeDasharray="4 4" />
        <circle cx="40" cy="36" r="10" fill="currentColor" fillOpacity="0.1" />
        <path d="M36 36l3 3 6-6" />
    </BaseIllu>
);

export const IlluVisuals3dDeveloped = () => (
    <BaseIllu>
        <path d="M32 12l16 8v16l-16 8-16-8V20z" />
        <path d="M16 20l16 8 16-8" />
        <path d="M32 28v16" />
    </BaseIllu>
);

export const IlluVisuals3dShared = () => (
    <BaseIllu>
        <path d="M26 18l12 6v12l-12 6-12-6V24z" />
        <path d="M14 24l12 6 12-6" />
        <path d="M26 30v12" />
        <path d="M42 32h10 M48 28l4 4-4 4" />
    </BaseIllu>
);

export const IlluRevisionsIncorporated = () => (
    <BaseIllu>
        <path d="M20 18h16v28H20z" />
        <path d="M24 26h8 M24 34h8" />
        <path d="M46 32a10 10 0 1 0-4 8" />
        <path d="M42 40v-4h4" />
    </BaseIllu>
);

export const IlluDesignApproved = () => (
    <BaseIllu>
        <circle cx="32" cy="32" r="20" strokeWidth="3" />
        <path d="M22 32l7 7 13-13" strokeWidth="3" />
    </BaseIllu>
);

export const IlluBoqShared = () => (
    <BaseIllu>
        <path d="M20 14h16v36H20z" />
        <path d="M24 22h8 M24 28h8 M24 34h4" />
        <path d="M42 32h10 M48 28l4 4-4 4" />
    </BaseIllu>
);

export const IlluPaymentScheduleSent = () => (
    <BaseIllu>
        <path d="M18 12h28v40H18z" />
        <path d="M24 24h16 M24 32h16 M24 40h16" />
        <circle cx="28" cy="24" r="1" />
        <circle cx="28" cy="32" r="1" />
        <circle cx="28" cy="40" r="1" />
    </BaseIllu>
);

export const IlluAgreementSigned = () => (
    <BaseIllu>
        <path d="M20 12h24v40H20z" />
        <path d="M26 40c4-4 6 2 12-2 2-1 3-3 2-4" />
        <path d="M40 34l2-8-4-2" />
    </BaseIllu>
);

export const IlluDesignFeeReceived = () => (
    <BaseIllu>
        <rect x="12" y="20" width="28" height="20" rx="2" />
        <path d="M12 28h28" />
        <circle cx="44" cy="40" r="10" fill="currentColor" fillOpacity="0.1" />
        <path d="M40 40l3 3 6-6" />
    </BaseIllu>
);

export const IlluOnboardingKitSent = () => (
    <BaseIllu>
        <path d="M14 20h36v24H14z" />
        <path d="M14 20l18 12 18-12" />
        <path d="M40 38h16 M52 34l4 4-4 4" />
    </BaseIllu>
);

export const IlluWorkingDrawingsDone = () => (
    <BaseIllu>
        <path d="M16 16h32v32H16z" />
        <path d="M20 20v24h24" />
        <path d="M28 28l12-8v16" />
        <path d="M12 40l4-4 4 4" />
    </BaseIllu>
);

export const IlluExecAdvance1Received = () => (
    <BaseIllu>
        <rect x="10" y="24" width="24" height="16" rx="2" />
        <path d="M10 30h24" />
        <path d="M40 44v-8 M46 44v-16 M52 44v-24" />
    </BaseIllu>
);

export const IlluContractorMobilised = () => (
    <BaseIllu>
        <path d="M20 36c0-6 6-12 12-12s12 6 12 12v4H20v-4z" />
        <path d="M16 40h32" />
        <circle cx="44" cy="24" r="8" fill="currentColor" fillOpacity="0.1" />
        <path d="M41 24l2 2 4-4" />
    </BaseIllu>
);

export const IlluBaselineInspectionDone = () => (
    <BaseIllu>
        <path d="M22 14h20v36H22z" />
        <path d="M22 26h20 M22 38h20 M32 14v36" />
        <circle cx="40" cy="40" r="8" fill="white" />
        <path d="M46 46l6 6" />
        <circle cx="40" cy="40" r="8" />
    </BaseIllu>
);

export const IlluExecStartNotified = () => (
    <BaseIllu>
        <path d="M16 44V24l16-10 16 10v20" />
        <path d="M24 44v-12h16v12" />
        <path d="M42 20h12 M50 16l4 4-4 4" />
    </BaseIllu>
);

export const IlluPhase1WorkComplete = () => (
    <BaseIllu>
        <path d="M20 44h24v8H20z" />
        <path d="M24 36h16v8H24z" />
        <path d="M28 28h8v8h-8z" />
    </BaseIllu>
);

export const IlluExecAdvance2Received = () => (
    <BaseIllu>
        <rect x="16" y="24" width="32" height="20" rx="2" />
        <circle cx="48" cy="20" r="10" fill="currentColor" fillOpacity="0.1" />
        <path d="M44 20l2 2 4-4 M46 26l2 2 4-4" />
    </BaseIllu>
);

export const IlluPhase2WorkComplete = () => (
    <BaseIllu>
        <path d="M20 16h24v32H20z" />
        <path d="M32 16v32" />
        <circle cx="28" cy="32" r="1.5" />
        <circle cx="36" cy="32" r="1.5" />
        <circle cx="42" cy="42" r="10" fill="currentColor" fillOpacity="0.1" />
        <path d="M38 42l3 3 6-6" />
    </BaseIllu>
);

export const IlluSelectionsLocked = () => (
    <BaseIllu>
        <path d="M16 16h16v16H16z" />
        <path d="M32 16h16v16H32z" />
        <path d="M16 32h16v16H16z" />
        <circle cx="40" cy="36" r="4" />
        <path d="M36 40h8v8h-8z" />
    </BaseIllu>
);

export const IlluExecAdvance3Requested = () => (
    <BaseIllu>
        <path d="M20 14h24v38H20z" />
        <path d="M28 24h8 M28 32h8" />
        <circle cx="40" cy="40" r="8" fill="white" />
        <circle cx="40" cy="40" r="8" />
        <path d="M40 36v4l3 2" />
    </BaseIllu>
);

export const IlluPhase3Underway = () => (
    <BaseIllu>
        <path d="M16 16h32v32H16z" />
        <path d="M28 20v16 M28 36h4v8 M30 48v4 M30 46v2" />
        <rect x="24" y="20" width="8" height="16" rx="2" />
    </BaseIllu>
);

export const IlluPhase3WorkComplete = () => (
    <BaseIllu>
        <path d="M28 24v12h4v8 M30 44v4" />
        <rect x="24" y="24" width="8" height="12" rx="2" />
        <circle cx="42" cy="32" r="10" fill="currentColor" fillOpacity="0.1" />
        <path d="M38 32l3 3 6-6" />
    </BaseIllu>
);

export const IlluSiteUpdateShared = () => (
    <BaseIllu>
        <path d="M16 16h24v24H16z" />
        <circle cx="24" cy="24" r="3" />
        <path d="M16 34l6-6 10 10" />
        <path d="M34 40h16 M46 36l4 4-4 4" />
    </BaseIllu>
);

export const IlluPrehandoverWalkthrough = () => (
    <BaseIllu>
        <path d="M16 36V22l16-10 16 10v14" />
        <circle cx="28" cy="40" r="2" />
        <path d="M28 42v6 M28 44h4 M26 48l2-4 2 4 M38 40h8 M42 36l4 4-4 4" />
    </BaseIllu>
);

export const IlluSnagListShared = () => (
    <BaseIllu>
        <path d="M22 12h20v40H22z" />
        <circle cx="28" cy="22" r="1.5" />
        <circle cx="28" cy="30" r="1.5" />
        <path d="M34 22h4 M34 30h4 M34 38h4" />
        <path d="M28 38l-2 2 4 4" stroke="red" className="text-current" />
    </BaseIllu>
);

export const IlluHandoverAdvanceReceived = () => (
    <BaseIllu>
        <circle cx="24" cy="32" r="4" />
        <path d="M28 32h10v4h4v-4h4v4h4v-4" />
        <circle cx="36" cy="44" r="8" fill="currentColor" fillOpacity="0.1" />
        <path d="M36 40v8 M32 44h8" />
    </BaseIllu>
);

export const IlluHandoverDossierSent = () => (
    <BaseIllu>
        <path d="M16 18h24v32H16z" />
        <path d="M20 22h24v32H20z" />
        <circle cx="44" cy="42" r="8" fill="currentColor" fillOpacity="0.1" />
        <path d="M41 42l2 2 4-4" />
    </BaseIllu>
);

export const IlluKeysHandedOver = () => (
    <BaseIllu>
        <circle cx="24" cy="32" r="6" />
        <path d="M30 32h16v6h4v-6h4v6h4v-6" />
        <path d="M42 20h12 M50 16l4 4-4 4" />
    </BaseIllu>
);

export const IlluWarrantyActivated = () => (
    <BaseIllu>
        <path d="M32 12l10 8 2 12-8 10-12-2-8-10 2-12z" />
        <path d="M26 32l4 4 8-8" />
    </BaseIllu>
);

export const ILLU_MAP: Record<string, React.FC> = {
    'lead_profiled': IlluLeadProfiled,
    'terms_docket_acknowledged': IlluTermsDocketAcknowledged,
    'discovery_scheduled': IlluDiscoveryScheduled,
    'discovery_completed': IlluDiscoveryCompleted,
    'brief_frozen': IlluBriefFrozen,
    'space_planning_presented': IlluSpacePlanningPresented,
    'space_planning_approved': IlluSpacePlanningApproved,
    'visuals_3d_developed': IlluVisuals3dDeveloped,
    'visuals_3d_shared': IlluVisuals3dShared,
    'revisions_incorporated': IlluRevisionsIncorporated,
    'design_approved': IlluDesignApproved,
    'boq_shared': IlluBoqShared,
    'payment_schedule_sent': IlluPaymentScheduleSent,
    'agreement_signed': IlluAgreementSigned,
    'design_fee_received': IlluDesignFeeReceived,
    'onboarding_kit_sent': IlluOnboardingKitSent,
    'working_drawings_done': IlluWorkingDrawingsDone,
    'exec_advance_1_received': IlluExecAdvance1Received,
    'contractor_mobilised': IlluContractorMobilised,
    'baseline_inspection_done': IlluBaselineInspectionDone,
    'exec_start_notified': IlluExecStartNotified,
    'phase1_work_complete': IlluPhase1WorkComplete,
    'exec_advance_2_received': IlluExecAdvance2Received,
    'phase2_work_complete': IlluPhase2WorkComplete,
    'selections_locked': IlluSelectionsLocked,
    'exec_advance_3_requested': IlluExecAdvance3Requested,
    'phase3_underway': IlluPhase3Underway,
    'phase3_work_complete': IlluPhase3WorkComplete,
    'site_update_shared': IlluSiteUpdateShared,
    'prehandover_walkthrough': IlluPrehandoverWalkthrough,
    'snag_list_shared': IlluSnagListShared,
    'handover_advance_received': IlluHandoverAdvanceReceived,
    'handover_dossier_sent': IlluHandoverDossierSent,
    'keys_handed_over': IlluKeysHandedOver,
    'warranty_activated': IlluWarrantyActivated
};
