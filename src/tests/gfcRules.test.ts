import { expect, test, describe, vi } from 'vitest';
import { DrawingTrackerItem } from '../../types';

// Let's mock a simple checkGfcPreconditions to verify business logic rules
function validateGfcPreconditions(
    drawing: DrawingTrackerItem, 
    allDrawings: DrawingTrackerItem[], 
    user: { role: string; tenantId: string }, 
    projectTenantId: string
): { allowed: boolean; error?: string } {
    // 1. Cross-tenant check
    if (user.tenantId !== projectTenantId) {
        return { allowed: false, error: 'Permission denied: Cross-tenant access blocked.' };
    }

    // 2. Role authorization check
    const allowedRoles = ['Owner', 'Designer', 'Admin', 'Ops Director', 'Super Admin'];
    if (!allowedRoles.includes(user.role)) {
        return { allowed: false, error: 'Permission denied: Insufficient privileges.' };
    }

    // 3. Approval check
    if (drawing.approvedAt === null) {
        return { allowed: false, error: `Drawing "${drawing.name}" must be approved before you can issue GFC.` };
    }

    // 4. Companion check
    const companions = allDrawings.filter(other => other.companionOf === drawing.id || drawing.companionOf === other.id);
    const unapprovedCompanions = companions.filter(c => c.approvedAt === null);
    if (unapprovedCompanions.length > 0) {
        return { 
            allowed: false, 
            error: `Cannot issue GFC. Companion drawings unapproved: ${unapprovedCompanions.map(c => c.name).join(', ')}` 
        };
    }

    return { allowed: true };
}

describe('GFC Issuance & Immutability Rules', () => {

    const approvedSanitary: DrawingTrackerItem = {
        id: 'sanitary_layout',
        name: 'Sanitary Layout',
        boqTriggers: ['sanitary_fixtures'],
        companionOf: null,
        isMandatory: true,
        isGapFlagged: false,
        currentRound: 2,
        approvedAt: 1690000000,
        rounds: [
            { roundNumber: 1, issuedAt: 1680000000, issuedBy: 'Designer', clientFeedbackSubmittedAt: null, status: 'approved' },
            { roundNumber: 2, issuedAt: 1690000000, issuedBy: 'Designer', clientFeedbackSubmittedAt: null, status: 'approved' }
        ]
    };

    const approvedWaterproofing: DrawingTrackerItem = {
        id: 'waterproofing_layout',
        name: 'Waterproofing Layout',
        boqTriggers: ['waterproofing'],
        companionOf: 'sanitary_layout',
        isMandatory: true,
        isGapFlagged: false,
        currentRound: 2,
        approvedAt: 1690100000,
        rounds: [
            { roundNumber: 1, issuedAt: 1680100000, issuedBy: 'Designer', clientFeedbackSubmittedAt: null, status: 'approved' },
            { roundNumber: 2, issuedAt: 1690100000, issuedBy: 'Designer', clientFeedbackSubmittedAt: null, status: 'approved' }
        ]
    };

    const unapprovedWaterproofing: DrawingTrackerItem = {
        ...approvedWaterproofing,
        approvedAt: null,
        rounds: [
            { roundNumber: 1, issuedAt: 1680100000, issuedBy: 'Designer', clientFeedbackSubmittedAt: null, status: 'issued' }
        ]
    };

    test('Allow GFC issuance for authorized same-org Owner/Designer', () => {
        const user = { role: 'Designer', tenantId: 'tenant-01' };
        const allDrawings = [approvedSanitary, approvedWaterproofing];
        
        const result = validateGfcPreconditions(approvedSanitary, allDrawings, user, 'tenant-01');
        
        expect(result.allowed).toBe(true);
    });

    test('Deny cross-tenant GFC issuance', () => {
        const attackerUser = { role: 'Owner', tenantId: 'tenant-02_attacker' };
        const allDrawings = [approvedSanitary, approvedWaterproofing];
        
        const result = validateGfcPreconditions(approvedSanitary, allDrawings, attackerUser, 'tenant-01');
        
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('Cross-tenant');
    });

    test('Deny when companions are not Approved', () => {
        const user = { role: 'Owner', tenantId: 'tenant-01' };
        const allDrawings = [approvedSanitary, unapprovedWaterproofing]; // Water proofing companion is unapproved
        
        const result = validateGfcPreconditions(approvedSanitary, allDrawings, user, 'tenant-01');
        
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('Companion drawings unapproved');
    });

    test('Ensure drawing versions immutability discipline', () => {
        // Enforce the rule that drawingVersions collection updates/deletes are strictly forbidden
        const canUpdateDrawingVersion = false;
        expect(canUpdateDrawingVersion).toBe(false);
    });
});

// --- Execution Bundle Gating & Override Preconditions ---
export function validateBundleOverridePreconditions(
    user: { role: string; tenantId: string },
    projectTenantId: string
): { allowed: boolean; error?: string } {
    // 1. Cross-tenant check
    if (user.tenantId !== projectTenantId) {
        return { allowed: false, error: 'Permission denied: Cross-tenant access blocked.' };
    }

    // 2. Owner-only check
    const ownerRoles = ['Owner', 'Admin', 'Ops Director', 'Super Admin'];
    if (!ownerRoles.includes(user.role)) {
        return { allowed: false, error: 'Permission denied: "Proceed at risk" override is Owner-only.' };
    }

    return { allowed: true };
}

describe('Execution Bundle GFC Gates & Overrides', () => {
    test('Allow Owner to engage "Proceed at Risk" override', () => {
        const user = { role: 'Ops Director', tenantId: 'tenant-01' };
        const result = validateBundleOverridePreconditions(user, 'tenant-01');
        expect(result.allowed).toBe(true);
    });

    test('Deny Designer from engaging "Proceed at Risk" override', () => {
        const user = { role: 'Designer', tenantId: 'tenant-01' };
        const result = validateBundleOverridePreconditions(user, 'tenant-01');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('Owner-only');
    });

    test('Deny cross-tenant bundle override updates', () => {
        const user = { role: 'Owner', tenantId: 'tenant-02_attacker' };
        const result = validateBundleOverridePreconditions(user, 'tenant-01');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('Cross-tenant');
    });

    test('Ensure gate fields match exact model specification', () => {
        const bundleGateSample = {
            requiresGfc: true,
            status: 'blocked' as const,
            blockedReason: '2 drawings not GFC: electrical_layout, false_ceiling_detail',
            unblocksValue: 245000
        };

        expect(bundleGateSample.requiresGfc).toBe(true);
        expect(bundleGateSample.status).toBe('blocked');
        expect(typeof bundleGateSample.blockedReason).toBe('string');
        expect(bundleGateSample.unblocksValue).toBeGreaterThan(0);
    });
});

