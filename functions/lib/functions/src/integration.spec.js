"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testBulkStatusChangeOnFrozenProject = void 0;
const admin = require("firebase-admin");
// Initialize Firebase Admin (would normally use a test project or emulator)
if (!admin.apps.length) {
    admin.initializeApp({ projectId: "test-ffds-ops" });
}
const db = admin.firestore();
const testBulkStatusChangeOnFrozenProject = async () => {
    // This is an integration test intended to be run against the Firebase Emulator suite
    const orgId = "integration-test-org";
    const projectId = "frozen-project";
    // 1. Setup Frozen Project
    await db.collection(`organizations/${orgId}/projects`).doc(projectId).set({
        name: "Test Frozen Project",
        boqFrozen: true
    });
    // 2. Setup BOQ Item
    const itemId = "item-1";
    const itemRef = db.collection(`organizations/${orgId}/projects/${projectId}/boqItems`).doc(itemId);
    await itemRef.set({
        name: "Test Item",
        boqStatus: "included_ffds_scope",
        statusHistory: []
    });
    // Wait for triggers to settle (if emulator)
    await new Promise(r => setTimeout(r, 1000));
    // 3. Attempt direct write bypassing UI (Bulk status change, NO Change Order)
    console.log("Attempting direct write on frozen project without CO ref...");
    await itemRef.update({
        boqStatus: 'deleted',
        statusHistory: [{
                from: "included_ffds_scope",
                to: "deleted",
                changedBy: "Owner",
                changedAt: new Date().toISOString()
            }] // No changeOrderRef!
    });
    // 4. Wait for Cloud Function validation to run
    await new Promise(r => setTimeout(r, 2000));
    // 5. Verify the server-side trigger reverted the write
    const finalDoc = await itemRef.get();
    const finalData = finalDoc.data();
    if ((finalData === null || finalData === void 0 ? void 0 : finalData.boqStatus) === "included_ffds_scope") {
        console.log("✅ INTEGRATION TEST PASSED: Server correctly blocked status change on frozen project without changeOrderRef and reverted.");
        return true;
    }
    else {
        console.error("❌ INTEGRATION TEST FAILED: Server allowed the status change despite frozen state without changeOrderRef.");
        return false;
    }
};
exports.testBulkStatusChangeOnFrozenProject = testBulkStatusChangeOnFrozenProject;
//# sourceMappingURL=integration.spec.js.map