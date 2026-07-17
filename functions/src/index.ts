import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

import { GoogleGenAI } from "@google/genai";
import { formatINR } from "../../lib/utils";
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




export const compileWeeklyReports = onSchedule({
    schedule: "0 17 * * 5",
    timeZone: "Asia/Kolkata"
}, async (event) => {
    const orgsSnap = await admin.firestore().collection("organizations").get();
    const now = Date.now();
    
    // Determine periodStart and periodEnd
    const date = new Date();
    const periodEnd = date.toISOString().split('T')[0];
    date.setDate(date.getDate() - 7);
    const periodStart = date.toISOString().split('T')[0];

    for (const orgDoc of orgsSnap.docs) {
        const orgId = orgDoc.id;
        const projectsSnap = await orgDoc.ref.collection("projects").get();
        
        for (const projDoc of projectsSnap.docs) {
            const projectId = projDoc.id;
            const projectData = projDoc.data();
            
            // Iterate active projects (assume active if not explicitly completed/archived)
            if (projectData.status === 'completed' || projectData.status === 'archived') {
                continue;
            }

            // Check if existing draft for same period
            const reportsRef = projDoc.ref.collection("weeklyReports");
            const existingSnap = await reportsRef
                .where("periodEnd", "==", periodEnd)
                .where("status", "==", "draft")
                .limit(1)
                .get();
                
            if (!existingSnap.empty) {
                continue;
            }

            // READS
            const drawingSnap = await projDoc.ref.collection("drawingTracker").get();
            const drawings = drawingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const designGateSnap = await projDoc.ref.collection("designGate").doc("main").get();
            const designGate = designGateSnap.exists ? designGateSnap.data() : null;

            const paymentStagesSnap = await projDoc.ref.collection("paymentMilestones").get();
            const paymentStages = paymentStagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const scopeAdditionsSnap = await projDoc.ref.collection("projectUpdates").get();
            const scopeAdditions = scopeAdditionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const sofSnap = await projDoc.ref.collection("sofItems").get();
            const sofItems = sofSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const prevReportSnap = await reportsRef.orderBy("periodEnd", "desc").limit(1).get();
            const prevReport = !prevReportSnap.empty ? prevReportSnap.docs[0].data() : null;

            // DELTAS
            const prevDrawings = prevReport?.snapshot?.drawings || [];
            const prevDrawingsMap = new Map(prevDrawings.map((d: any) => [d.id, d]));
            const processedDrawings = drawings.map((d: any) => {
                const isNewThisWeek = !prevDrawingsMap.has(d.id) || (prevDrawingsMap.get(d.id) as any).currentRound !== d.currentRound;
                return { ...d, isNewThisWeek };
            });

            const prevScope = prevReport?.snapshot?.scopeAdditions || [];
            const prevScopeMap = new Map(prevScope.map((s: any) => [s.id, s]));
            const processedScope = scopeAdditions.map((s: any) => {
                const isNewThisWeek = !prevScopeMap.has(s.id) || (prevScopeMap.get(s.id) as any).status !== s.status;
                
                let amount = s.netImpact ? parseInt(s.netImpact, 10) : 0;
                let chargeLine = "No charge — absorbed by studio";
                if (s.chargeable) {
                    const fmtAmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
                    chargeLine = `${fmtAmt} · ${s.id} (invoiced)`;
                }
                // TODO: invoiceStatus and paymentGate are ABSENT per the audit. Leaving null.
        return { ...s, isNewThisWeek, chargeLine, invoiceStatus: null, paymentGate: null };
            });

            const prevPayment = prevReport?.snapshot?.paymentStages || [];
            const prevPaymentMap = new Map(prevPayment.map((p: any) => [p.id, p]));
            const processedPayments = paymentStages.map((p: any) => {
                const isNewThisWeek = !prevPaymentMap.has(p.id) || (prevPaymentMap.get(p.id) as any).status !== p.status;
                return { ...p, isNewThisWeek };
            });

            // HEALTH LABEL
            let healthLabel = 'on_track';
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
            let hasInvoiceOverdue = false;
            let hasGateBlocked = false;
            let hasClientOverdue = false;
            let hasCompanionGap = false;

            paymentStages.forEach((p: any) => {
                if (p.status === 'overdue' || (p.invoiceDate && (now - new Date(p.invoiceDate).getTime() > SEVEN_DAYS) && p.status !== 'paid')) {
                    hasInvoiceOverdue = true;
                }
            });

            if (designGate && !designGate.gateActivated && designGate.lastAssessedAt && (now - designGate.lastAssessedAt.toMillis() > FOURTEEN_DAYS)) {
                hasGateBlocked = true;
            }

            drawings.forEach((d: any) => {
                if (d.isGapFlagged) hasCompanionGap = true;
                if (d.rounds?.length > 0) {
                    const cur = d.rounds[d.currentRound - 1];
                    if (cur && cur.status === 'issued') {
                        if (cur.issuedAt && (now - cur.issuedAt > SEVEN_DAYS)) hasClientOverdue = true;
                    }
                }
            });

            if (hasInvoiceOverdue || hasGateBlocked) {
                healthLabel = 'at_risk';
            } else if (hasClientOverdue || hasCompanionGap) {
                healthLabel = 'attention';
            }

            // PROJECTION
            const contract = projectData.context?.contractSignoff || {};
            const engagement = projectData.engagement || {};
            
            const rawSnapshot = {
                drawings: processedDrawings,
                designGate,
                paymentStages: processedPayments,
                scopeAdditions: processedScope,
                sofItems,
                contract: {
                    signedAt: contract.signedAt || null,
                    tcAcknowledgedAt: engagement.acknowledgedAt || null
                },
                healthLabel
            };

            const sanitizeForClient = (data: any): any => {
                if (data === null || data === undefined) return data;
                if (Array.isArray(data)) return data.map(sanitizeForClient);
                if (typeof data === 'object') {
                    if (data.toMillis) return data.toMillis(); // convert timestamps
                    const sanitized: any = {};
                    for (const [key, value] of Object.entries(data)) {
                        if (['marginAmt', 'baseCost', 'unitCost', 'rate', 'classificationConfidence'].includes(key)) continue;
                        if (key === 'cause') {
                            if (value === 'CLIENT_REVISION') sanitized[key] = "Client-requested change";
                            else if (value === 'FFDS_DESIGN_MISS') sanitized[key] = "Studio correction";
                            else if (value === 'SITE_CONDITION') sanitized[key] = "Site condition adjustment";
                            else sanitized[key] = "Standard Iteration";
                            continue;
                        }
                        if (typeof value === 'string') {
                            if (value === 'CLIENT_REVISION') sanitized[key] = "Client-requested change";
                            else if (value === 'FFDS_DESIGN_MISS') sanitized[key] = "Studio correction";
                            else if (value === 'SITE_CONDITION') sanitized[key] = "Site condition adjustment";
                            else sanitized[key] = value;
                        } else {
                            sanitized[key] = sanitizeForClient(value);
                        }
                    }
                    return sanitized;
                }
                return data;
            };

            const cleanSnapshot = sanitizeForClient(rawSnapshot);

            const reportId = `rep-${Date.now()}`;
            await reportsRef.doc(reportId).set({
                id: reportId,
                periodStart,
                periodEnd,
                status: 'draft',
                createdAt: Date.now(),
                snapshot: cleanSnapshot
            });
        }
    }
});
