import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules for Settings & Engagement', () => {
    beforeAll(async () => {
        testEnv = await initializeTestEnvironment({
            projectId: 'demo-tenant-01',
            firestore: {
                rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'),
            },
        });
    });

    afterAll(async () => {
        await testEnv.cleanup();
    });

    beforeEach(async () => {
        await testEnv.clearFirestore();
    });

    const getContext = (uid: string, tenantId: string, role: string) => {
        return testEnv.authenticatedContext(uid, { tenantId, role });
    };

    it('should allow Owner to write settings.terms', async () => {
        const db = getContext('owner1', 'tenantA', 'Owner').firestore();
        const settingsRef = db.doc('organizations/tenantA/settings/terms');
        await assertSucceeds(settingsRef.set({ some: 'data' }));
    });

    it('should deny Designer to write settings.terms', async () => {
        const db = getContext('designer1', 'tenantA', 'Designer').firestore();
        const settingsRef = db.doc('organizations/tenantA/settings/terms');
        await assertFails(settingsRef.set({ some: 'data' }));
    });

    it('should allow any tenant member to read settings', async () => {
        const db = getContext('designer1', 'tenantA', 'Designer').firestore();
        const settingsRef = db.doc('organizations/tenantA/settings/terms');
        await assertSucceeds(settingsRef.get());
    });

    it('should allow Owner to update project engagement', async () => {
        const adminDb = testEnv.unauthenticatedContext().firestore();
        // Setup initial project
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('organizations/tenantA/projects/proj1').set({ tenantId: 'tenantA', engagement: { designFee: 100 } });
        });

        const db = getContext('owner1', 'tenantA', 'Owner').firestore();
        const projectRef = db.doc('organizations/tenantA/projects/proj1');
        await assertSucceeds(projectRef.update({ engagement: { designFee: 200 } }));
    });

    it('should deny Designer to update project engagement', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('organizations/tenantA/projects/proj1').set({ tenantId: 'tenantA', engagement: { designFee: 100 } });
        });

        const db = getContext('designer1', 'tenantA', 'Designer').firestore();
        const projectRef = db.doc('organizations/tenantA/projects/proj1');
        await assertFails(projectRef.update({ engagement: { designFee: 200 } }));
    });
});
