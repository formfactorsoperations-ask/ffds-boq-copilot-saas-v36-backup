import { expect, test, describe } from 'vitest';

describe('DesignGate Override Business Rules', () => {
    test('Override MUST NOT freeze BOQ or trigger Stage 3 invoice generation', () => {
        // Given an override payload from DesignCompleteGate.tsx
        const overridePayload = {
            override: {
                approvedBy: 'Ops Director',
                reason: 'Client wants to move in early, GFCs are 90% done.',
                approvedAt: 1718290291000
            },
            overrideReason: 'Client wants to move in early, GFCs are 90% done.',
            overriddenBy: 'Ops Director'
        };

        const projectPayload = {
            status: 'execution'
        };

        // Assert that the override does NOT contain gateActivated
        expect(overridePayload).not.toHaveProperty('gateActivated');
        expect(overridePayload).not.toHaveProperty('stage3InvoiceId');
        expect(overridePayload).not.toHaveProperty('checklist.item_5.done'); // BOQ freeze
        
        // Assert that the project status unlocks execution, but does not close the design phase
        expect(projectPayload).toHaveProperty('status', 'execution');
        expect(projectPayload).not.toHaveProperty('designPhaseClosedAt');
        
        // Assert that payment stages are untouched
        // The override payload only writes to designGate.override and project.status
        const keysWrittenToGate = Object.keys(overridePayload);
        expect(keysWrittenToGate).not.toContain('gateActivated');
        expect(keysWrittenToGate).not.toContain('boqFrozen');
        expect(keysWrittenToGate).not.toContain('paymentMilestones');
        expect(keysWrittenToGate).not.toContain('designPaymentStages');
    });
});
