import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

import { GoogleGenAI } from "@google/genai";
import * as logger from "firebase-functions/logger";

const withDiagnostics = (functionName: string, handler: (request: any) => Promise<any>) => {
    return async (request: any) => {
        try {
            return await handler(request);
        } catch (e: any) {
            logger.error(`[Diagnostics for ${functionName}] Underlying error:`, {
                message: e.message,
                stack: e.stack,
                code: e.code,
                status: e.status,
                details: e.details,
                unauthenticated: !request.auth
            });
            // Re-throw so client still gets the standard error
            if (e instanceof HttpsError) {
                throw e;
            }
            throw new HttpsError("internal", e.message || "Internal server error.");
        }
    };
};

// TASK 4: MIGRATION SCRIPT (one-time, reversible)
export const migrateBoqItemsToContractualFormat = onCall(withDiagnostics("migrateBoqItemsToContractualFormat", async (request) => {
    const orgId = request.data.orgId;
    if (!orgId) {
        throw new HttpsError("invalid-argument", "orgId is required.");
    }

    const migrationLogRef = db.collection(`organizations/${orgId}/migrations`).doc('boq_contractual_v2');
    await migrationLogRef.set({
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'running',
    });

    let itemsMigrated = 0;
    let projectsTouched = 0;
    const errors: any[] = [];

    try {
        const projectsSnapshot = await db.collection(`organizations/${orgId}/projects`).get();
        for (const projectDoc of projectsSnapshot.docs) {
            projectsTouched++;
            const boqItemsRef = projectDoc.ref.collection('boqItems');
            const snapshot = await boqItemsRef.get();
            
            let batch = db.batch();
            let countInBatch = 0;

            for (const itemDoc of snapshot.docs) {
                const data = itemDoc.data();
                if (!data.boqStatus) { // Idempotent check
                    
                    batch.update(itemDoc.ref, {
                        boqStatus: "included_ffds_scope",
                        linkage: { type: "direct_execution", refId: null, label: "Migrated — pre-contractual item" },
                        changeOrderRef: null,
                        statusHistory: [{ 
                            from: null, 
                            to: "included_ffds_scope", 
                            changedBy: "system_migration",
                            changedAt: admin.firestore.Timestamp.now(), 
                            changeOrderRef: null, 
                            reason: "Schema migration v2" 
                        }],
                        rateSnapshotAt: null,
                        commercialNote: data.notes || ""
                    });

                    countInBatch++;
                    itemsMigrated++;

                    if (countInBatch >= 400) {
                        await batch.commit();
                        batch = db.batch();
                        countInBatch = 0;
                    }
                }
            }
            
            if (countInBatch > 0) {
                await batch.commit();
            }
        }

        await migrationLogRef.update({
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            itemsMigrated,
            projectsTouched,
            errors
        });

        return { success: true, itemsMigrated, projectsTouched, errors };

    } catch (e: any) {
        await migrationLogRef.update({
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'failed',
            error: e.message
        });
        throw new HttpsError("internal", e.message);
    }
}));

// TASK 2 & 3: BOQ CALCULATION & STATUS TRANSITION RULES
export const calculateBoqTotalsAndValidateRules = onDocumentWritten("organizations/{orgId}/projects/{projectId}/boqItems/{itemId}", async (event) => {
    const change = event.data;
    if (!change) return; // Should not happen in standard conditions

    const beforeData = change.before.data();
    const afterData = change.after.data();

    const orgId = event.params.orgId;
    const projectId = event.params.projectId;

    // RULE: NEVER hard-delete a boqItem document. "deleted" is a status.
    if (!change.after.exists) {
        // Technically we can't "reject" a deletion from an async trigger after it happens, 
        // to block it strongly we must use Firestore Rules (done in task 5).
        // But for completeness, we log this as illegal.
        console.error(`Illegal hard-deletion of boqItem ${event.params.itemId}`);
        return;
    }

    if (beforeData && afterData) {
        // STATUS TRANSITIONS VALIDATION
        const projectDoc = await db.collection(`organizations/${orgId}/projects`).doc(projectId).get();
        const projectData = projectDoc.data() || {};
        
        if (beforeData.boqStatus !== afterData.boqStatus) {
            
            // 1. Must append statusHistory
            const beforeHistoryLength = beforeData.statusHistory?.length || 0;
            const afterHistoryLength = afterData.statusHistory?.length || 0;
            
            if (afterHistoryLength <= beforeHistoryLength) {
                // Wait, cannot reject async write directly to client. Usually handled by transactions/rules.
                // Reverting the status change here if invalid.
                console.error("Missing status history tracking");
                // Restore old state (primitive rollback)
                await change.after.ref.update({
                    boqStatus: beforeData.boqStatus,
                    statusHistory: beforeData.statusHistory || []
                });
                return;
            }

            // 2. Frozen BoQ gate OR transitions to deleted, substituted, approved_variation, or from on_hold back to included_ffds_scope REQUIRE non-null changeOrderRef
            const reqChangeOrderStatuses = ["deleted", "substituted", "approved_variation"];
            const isOnHoldToIncluded = beforeData.boqStatus === "on_hold" && afterData.boqStatus === "included_ffds_scope";
            const lastHistoryEntry = afterData.statusHistory[afterData.statusHistory.length - 1];
            
            if (projectData.boqFrozen && !lastHistoryEntry?.changeOrderRef) {
                console.error(`Project is frozen. Any status change requires a changeOrderRef`);
                await change.after.ref.update({ boqStatus: beforeData.boqStatus, statusHistory: beforeData.statusHistory || [] });
                return;
            }

            if ((reqChangeOrderStatuses.includes(afterData.boqStatus) || isOnHoldToIncluded) && !lastHistoryEntry?.changeOrderRef) {
                console.error(`Status ${afterData.boqStatus} requires changeOrderRef`);
                await change.after.ref.update({ boqStatus: beforeData.boqStatus, statusHistory: beforeData.statusHistory || [] });
                return;
            }

            // 3. substituted requires successorItemId
            if (afterData.boqStatus === "substituted") {
                if (!afterData.successorItemId) {
                    console.error("Substituting an item requires a successorItemId");
                    await change.after.ref.update({ boqStatus: beforeData.boqStatus, statusHistory: beforeData.statusHistory });
                    return;
                }
                // Verify the successor item exists and has the same change order ref
                const successorDoc = await change.after.ref.parent.doc(afterData.successorItemId).get();
                if (!successorDoc.exists || successorDoc.data()?.changeOrderRef !== afterData.changeOrderRef) {
                    console.error("Successor item does not match change order ref or doesn't exist");
                    await change.after.ref.update({ boqStatus: beforeData.boqStatus, statusHistory: beforeData.statusHistory });
                    return;
                }
            }

            // 4. After Design Complete Gate (project.boqFrozen === true), ALL status changes require changeOrderRef
            if (projectData.boqFrozen === true && !afterData.changeOrderRef) {
                console.error("Post-frost changes require changeOrderRef");
                await change.after.ref.update({ boqStatus: beforeData.boqStatus, statusHistory: beforeData.statusHistory });
                return;
            }
        }
    }

    // TASK 2: STATUS-DRIVEN TOTALS LOGIC
    // Recalculate totals across the entire project's boqItems
    if (afterData) {
        // Calculate fields for this item just to ensure it's up to date based on the existing per-item formula
        const qty = afterData.qty || 0;
        const unitCost = afterData.unitCost || 0;
        const marginPct = afterData.marginPct || 0;
        const taxPct = afterData.taxPct || 0;

        const baseCost = qty * unitCost;
        const marginAmt = baseCost * (marginPct / 100);
        const taxAmt = (baseCost + marginAmt) * (taxPct / 100);
        const finalCost = baseCost + marginAmt + taxAmt;

        if (afterData.baseCost !== baseCost || afterData.finalCost !== finalCost) {
            await change.after.ref.update({ baseCost, marginAmt, taxAmt, finalCost });
            return; // let the subsequent trigger recalculate the totals
        }
    }

    // Now calculate project totals
    const allItemsSnapshot = await db.collection(`organizations/${orgId}/projects/${projectId}/boqItems`).get();
    
    let grandTotal = 0;
    let firmTotal = 0;
    let estimateExposure = 0;
    let excludedValue = 0;
    const statusCounts: Record<string, number> = {};

    let totalFirmBase = 0;
    let totalFirmMargin = 0;
    
    const byRoomMap: Record<string, { baseCost: number, marginAmt: number }> = {};
    const byCategoryMap: Record<string, { baseCost: number, marginAmt: number, itemCount: number }> = {};
    
    const floorViolations: any[] = [];
    let asActualsValue = 0;
    let provisionalValue = 0;
    
    // Fetch org settings for margin floors
    const orgDoc = await db.collection(`organizations`).doc(orgId).get();
    const marginFloors = orgDoc.data()?.settings?.marginFloors || { default: 15, byCategory: {} };

    for (const doc of allItemsSnapshot.docs) {
        const data = doc.data();
        const status = data.boqStatus || "included_ffds_scope";
        const fCost = data.finalCost || 0;
        const bCost = data.baseCost || 0;
        const mAmt = data.marginAmt || 0;
        const mPct = data.marginPct || 0;

        statusCounts[status] = (statusCounts[status] || 0) + 1;

        // Analytics accumulations
        if (status === "included_ffds_scope" || status === "approved_variation") {
            grandTotal += fCost;
            firmTotal += fCost;
            totalFirmBase += bCost;
            totalFirmMargin += mAmt;
            
            const roomId = data.roomId || 'General';
            if (!byRoomMap[roomId]) byRoomMap[roomId] = { baseCost: 0, marginAmt: 0 };
            byRoomMap[roomId].baseCost += bCost;
            byRoomMap[roomId].marginAmt += mAmt;
            
            const cat = data.category || 'Uncategorized';
            if (!byCategoryMap[cat]) byCategoryMap[cat] = { baseCost: 0, marginAmt: 0, itemCount: 0 };
            byCategoryMap[cat].baseCost += bCost;
            byCategoryMap[cat].marginAmt += mAmt;
            byCategoryMap[cat].itemCount += 1;
            
            const floorPct = marginFloors.byCategory?.[cat] ?? marginFloors.default ?? 15;
            if (mPct < floorPct) {
                floorViolations.push({ itemId: doc.id, description: data.description, marginPct: mPct, floorPct });
            }
        } 
        else if (status === "as_actuals" || status === "provisional_sum" || status === "pending_finalisation") {
            grandTotal += fCost;
            estimateExposure += fCost;
            if (status === "as_actuals") asActualsValue += fCost;
            if (status === "provisional_sum") provisionalValue += fCost;
        } 
        else if (status === "excluded" || status === "client_procured" || status === "on_hold" || status === "deleted" || status === "substituted") {
            excludedValue += fCost;
        }
    }

    const byRoom = Object.keys(byRoomMap).map(k => ({
         roomId: k,
         roomName: k, // Optional: look up real name if you have it
         baseCost: byRoomMap[k].baseCost,
         marginAmt: byRoomMap[k].marginAmt,
         marginPct: byRoomMap[k].baseCost > 0 ? (byRoomMap[k].marginAmt / byRoomMap[k].baseCost) * 100 : 0
    }));

    const byCategory = Object.keys(byCategoryMap).map(k => ({
         category: k,
         baseCost: byCategoryMap[k].baseCost,
         marginAmt: byCategoryMap[k].marginAmt,
         itemCount: byCategoryMap[k].itemCount,
         marginPct: byCategoryMap[k].baseCost > 0 ? (byCategoryMap[k].marginAmt / byCategoryMap[k].baseCost) * 100 : 0
    }));

    const marginAnalytics = {
         blendedMarginPct: totalFirmBase > 0 ? (totalFirmMargin / totalFirmBase) * 100 : 0,
         totalFirmBase,
         totalFirmMargin,
         byRoom,
         byCategory,
         floorViolations,
         estimateRisk: { asActualsValue, provisionalValue },
         updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection(`organizations/${orgId}/projects/${projectId}/marginAnalytics`).doc('current').set(marginAnalytics, { merge: true });

    await db.collection(`organizations/${orgId}/projects`).doc(projectId).update({
        grandTotal,
        firmTotal,
        estimateExposure,
        excludedValue,
        statusCounts
    });
});

import * as crypto from "crypto";

function generateContentHash(items: any[]) {
    const canonicalize = (obj: any): any => {
        if (Array.isArray(obj)) {
            return obj.map(canonicalize);
        } else if (obj !== null && typeof obj === 'object') {
            const sorted: any = {};
            Object.keys(obj).sort().forEach(key => {
                sorted[key] = canonicalize(obj[key]);
            });
            return sorted;
        }
        return obj;
    };
    
    // Sort items by ID for stable array order, then canonicalize keys
    const sortedItems = [...items].sort((a,b) => (a.id || "").localeCompare(b.id || ""));
    const canonicalArray = canonicalize(sortedItems);
    
    return crypto.createHash('sha256').update(JSON.stringify(canonicalArray)).digest('hex');
}

