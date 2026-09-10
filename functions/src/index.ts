import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

import { GoogleGenAI } from "@google/genai";
import { formatINR } from "../../lib/utils";
import * as logger from "firebase-functions/logger";

/*
  Platform admin read-models. Kept in their own module: they are the only
  functions that read across every tenant, and that is worth being able to see
  at a glance rather than buried in this file.
*/
export { platformOverview, platformIntegritySweep } from "./platformAdmin";
export { platformRepairDocuments } from "./platformRepair";
import * as pako from "pako";
import { buildSignoffPatch, buildDisputePatch } from "../../services/clientApprovalEngine";
import { recordDocumentView, signIssue } from "../../services/documentIssueEngine";
import { raiseQuery } from "../../services/documentQueryEngine";
import { buildPortalView } from "../../lib/portalProjection";

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
        const unitCost = afterData.unitCost !== undefined ? afterData.unitCost : ((afterData.materials || afterData.baseRate || 0) + (afterData.labor || 0));
        const marginPct = afterData.marginPct !== undefined ? afterData.marginPct : (afterData.marginOverride ?? afterData.margin ?? 0);
        const taxPct = afterData.taxPct || 0;

        const baseCost = qty * unitCost;
        const marginAmt = baseCost * (marginPct / 100);
        const taxAmt = (baseCost + marginAmt) * (taxPct / 100);
        const finalCost = baseCost + marginAmt + taxAmt;

        if (
            afterData.unitCost !== unitCost ||
            afterData.marginPct !== marginPct ||
            afterData.baseCost !== baseCost ||
            afterData.marginAmt !== marginAmt ||
            afterData.taxAmt !== taxAmt ||
            afterData.finalCost !== finalCost
        ) {
            await change.after.ref.update({
                unitCost,
                marginPct,
                baseCost,
                marginAmt,
                taxAmt,
                finalCost
            });
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
         marginPct: (byRoomMap[k].baseCost + byRoomMap[k].marginAmt) > 0 ? (byRoomMap[k].marginAmt / (byRoomMap[k].baseCost + byRoomMap[k].marginAmt)) * 100 : 0
    }));

    const byCategory = Object.keys(byCategoryMap).map(k => ({
         category: k,
         baseCost: byCategoryMap[k].baseCost,
         marginAmt: byCategoryMap[k].marginAmt,
         itemCount: byCategoryMap[k].itemCount,
         marginPct: (byCategoryMap[k].baseCost + byCategoryMap[k].marginAmt) > 0 ? (byCategoryMap[k].marginAmt / (byCategoryMap[k].baseCost + byCategoryMap[k].marginAmt)) * 100 : 0
    }));

    const marginAnalytics = {
         blendedMarginPct: (totalFirmBase + totalFirmMargin) > 0 ? (totalFirmMargin / (totalFirmBase + totalFirmMargin)) * 100 : 0,
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

// ============================================================================
// CLIENT PORTAL LOGINS
//
// A client signs in with an email and a password the studio gives them, exactly
// as ops does. Both live in the same Firebase Auth project and the same app;
// what differs is the `role` on their users/{uid} document, which is what the
// app routes on.
//
// This has to run in a function rather than the browser. The client SDK's
// createUserWithEmailAndPassword *switches the signed-in user*, so a studio
// creating a client login from their own tab would be signed out of their own
// account every time. The Admin SDK has no such side effect.
// ============================================================================

/** Readable, unambiguous temp password — no l/1/O/0, said aloud over a phone. */
function generateTempPassword(): string {
    const words = ['amber', 'cedar', 'delta', 'ember', 'fable', 'grove', 'haven', 'ivory', 'jasper', 'linen', 'marble', 'nectar', 'onyx', 'pearl', 'quartz', 'raven', 'slate', 'thistle', 'umber', 'willow'];
    const pick = () => words[Math.floor(Math.random() * words.length)];
    const digits = String(Math.floor(Math.random() * 90) + 10);
    return `${pick()}-${pick()}-${digits}`;
}

/** The caller must be signed in and belong to the tenant they are acting for. */
async function assertStudioCaller(request: any, tenantId: string) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const callerSnap = await db.collection("users").doc(request.auth.uid).get();
    const caller = callerSnap.exists ? callerSnap.data() : null;
    const callerRole = caller?.role || "";
    if (callerRole === "Client") {
        throw new HttpsError("permission-denied", "Clients cannot issue logins.");
    }
    const callerTenant = caller?.tenantId;
    const isSuperAdmin = callerRole === "Super Admin";
    if (!isSuperAdmin && callerTenant !== tenantId) {
        throw new HttpsError("permission-denied", "You can only manage your own studio's clients.");
    }
}

/**
 * Create (or re-point) a client login for one project.
 *
 * Idempotent on email: an existing client account gains the project rather than
 * colliding, so a client with three projects has one login, not three.
 */
export const createClientLogin = onCall(withDiagnostics("createClientLogin", async (request) => {
    const { email, projectId, tenantId, clientName } = request.data || {};
    if (!email || !projectId || !tenantId) {
        throw new HttpsError("invalid-argument", "email, projectId and tenantId are required.");
    }
    await assertStudioCaller(request, tenantId);

    const normalised = String(email).trim().toLowerCase();
    const tempPassword = generateTempPassword();

    let userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(normalised);
        await admin.auth().updateUser(userRecord.uid, { password: tempPassword });
    } catch (e: any) {
        if (e?.code !== "auth/user-not-found") throw e;
        userRecord = await admin.auth().createUser({
            email: normalised,
            password: tempPassword,
            displayName: clientName || undefined,
        });
    }

    const userRef = db.collection("users").doc(userRecord.uid);
    const existing = await userRef.get();
    const priorProjects: string[] = existing.exists ? (existing.data()?.projectIds || []) : [];

    // Refuse to convert a studio account into a client one.
    if (existing.exists && existing.data()?.role && existing.data()?.role !== "Client") {
        throw new HttpsError(
            "failed-precondition",
            "That email already belongs to a studio user. Use a different email for the client."
        );
    }

    await userRef.set({
        email: normalised,
        role: "Client",
        tenantId,
        projectIds: Array.from(new Set([...priorProjects, projectId])),
        mustChangePassword: true,
        updatedAt: Date.now(),
    }, { merge: true });

    return { uid: userRecord.uid, email: normalised, tempPassword };
}));

/** Issue a fresh temp password for an existing client login. */
export const resetClientPassword = onCall(withDiagnostics("resetClientPassword", async (request) => {
    const { email, tenantId } = request.data || {};
    if (!email || !tenantId) {
        throw new HttpsError("invalid-argument", "email and tenantId are required.");
    }
    await assertStudioCaller(request, tenantId);

    const normalised = String(email).trim().toLowerCase();
    const userRecord = await admin.auth().getUserByEmail(normalised);

    const userSnap = await db.collection("users").doc(userRecord.uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== "Client") {
        throw new HttpsError("failed-precondition", "That email is not a client login.");
    }
    if (userSnap.data()?.tenantId !== tenantId) {
        throw new HttpsError("permission-denied", "That client belongs to another studio.");
    }

    const tempPassword = generateTempPassword();
    await admin.auth().updateUser(userRecord.uid, { password: tempPassword });
    await db.collection("users").doc(userRecord.uid).set({ mustChangePassword: true, updatedAt: Date.now() }, { merge: true });

    return { uid: userRecord.uid, email: normalised, tempPassword };
}));

/* ────────────────────────────────────────────────────────────────────────────
   THE CLIENT'S WRITE PATH
   ────────────────────────────────────────────────────────────────────────────

   A portal client needs to change a few things about their project: record that
   they opened a document, sign one, query a clause in one, dispute one, and
   confirm a material selection.

   Until now the browser did it, by saving the entire project document. The rule
   that allowed it had to be this broad:

     allow update: if ... ||
       request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['context', 'lastModified', 'isCompressed', 'compressedData']);

   — no authentication at all, and `context` is the whole project: every rate,
   every internal note, every unpublished draft, the portal access token. Anyone
   who knew a project id could replace all of it.

   Narrowing that rule is not possible. A project of any size is stored as a
   deflated blob in `compressedData`, and security rules cannot see inside it,
   so there is no field-level condition that could permit "the client may set
   documents.views" and nothing else.

   So the client stops writing the document. It sends the *action* it wants
   taken, and this decides whether that action is allowed and what it means. The
   patch is computed here, from the same engines the browser uses — they are
   pure functions over a context, which is why they can be shared rather than
   reimplemented and left to drift.
*/


/** The whole project document, whether or not it was stored compressed. */
function readStoredProject(data: any): { project: any; wasCompressed: boolean } {
    if (data?.isCompressed && data?.compressedData) {
        const bytes = Buffer.from(data.compressedData, "base64");
        // pako's typings expose the text form as inflate(...) -> string only via
        // the untyped overload; decode the bytes ourselves and keep it honest.
        const json = Buffer.from(pako.inflate(bytes)).toString("utf-8");
        return { project: JSON.parse(json), wasCompressed: true };
    }
    return { project: data, wasCompressed: false };
}

/** Put it back the way it was found. */
function writeableProject(project: any, wasCompressed: boolean, previous: any): any {
    if (!wasCompressed) return { ...project, lastModified: Date.now() };
    const deflated = pako.deflate(JSON.stringify({ ...project, lastModified: Date.now() }));
    return {
        ...previous,
        lastModified: Date.now(),
        isCompressed: true,
        compressedData: Buffer.from(deflated).toString("base64"),
    };
}

/**
 * Establish that the caller is this project's client.
 *
 * Their own users/{uid} document is the authority — the same record that
 * decides which app they get. A portal link is not consulted: it names a
 * project, it does not grant one, and it can be forwarded to anybody.
 */
async function assertPortalClient(request: any, projectId: string) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
    if (!projectId || typeof projectId !== "string") {
        throw new HttpsError("invalid-argument", "No project was named.");
    }

    const profile = await db.collection("users").doc(uid).get();
    const data = profile.data() || {};
    const allowed: string[] = data.projectIds || [];

    if (data.role !== "Client" || !allowed.includes(projectId)) {
        // Same answer whether the project does not exist or is somebody
        // else's — the difference would tell a prober which ids are real.
        throw new HttpsError("permission-denied", "This project is not open to you.");
    }

    return { uid, email: request.auth?.token?.email as string | undefined, profile: data };
}

/**
 * Apply one client action to a project.
 *
 * Every branch returns a patch function built by a shared engine. Anything the
 * client sends that is not one of these is refused: the action name is a closed
 * set, not a path into the document.
 */
function patchFor(action: any, actor: string): (prev: any) => any {
    switch (action?.type) {
        case "documentView":
            return recordDocumentView(action.kind);

        case "signDocument":
            return buildSignoffPatch(action.docType, action.docket, { surface: "client_portal" });

        case "signIssue":
            return signIssue(action.issueId, action.docket);

        case "raiseQuery":
            return raiseQuery({
                issueId: action.issueId,
                documentKind: action.documentKind,
                clauseRef: action.clauseRef || "",
                clauseExcerpt: action.clauseExcerpt || "",
                question: action.question,
                raisedBy: actor,
            });

        case "raiseDispute":
            return buildDisputePatch(action.kind, action.reason, actor);

        case "confirmSelection":
            /*
              Written here rather than shared, because there is no engine for it
              — and this is the shape the portal has always produced. The client
              may only move a selection to approved, and only one they were
              shown: no rate, no name, no other field is reachable from here.
            */
            return (prev: any) => ({
                ...prev,
                materialSelections: (prev?.materialSelections || []).map((m: any) =>
                    m.id === action.selectionId
                        ? { ...m, status: "approved", clientConfirmedAt: new Date().toISOString() }
                        : m,
                ),
            });

        default:
            throw new HttpsError("invalid-argument", `Unknown action: ${String(action?.type)}`);
    }
}

export const submitClientAction = onCall({ cors: true }, async (request) => {
    const projectId: string = request.data?.projectId;
    const action = request.data?.action;

    const { email, profile } = await assertPortalClient(request, projectId);
    const actor = profile.displayName || email || "Client";

    const ref = db.collection("projects").doc(projectId);

    /*
      In a transaction because the studio saves the same document every couple
      of seconds while a project is open. Read-modify-write outside one would
      lose whichever of the two finished second, and the client's signature is
      the more likely loser: it is one write against a stream of them.
    */
    const viewRef = ref.collection("portalView").doc("current");

    await db.runTransaction(async (tx) => {
        // Every read before any write — a transaction requires it.
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "This project no longer exists.");
        const viewSnap = await tx.get(viewRef);

        const stored = snap.data() as any;
        const { project, wasCompressed } = readStoredProject(stored);
        const nextContext = patchFor(action, actor)(project.context || {});

        tx.set(ref, writeableProject({ ...project, context: nextContext }, wasCompressed, stored));

        /*
          Rebuild the client's own copy, so their action is there when they come
          back to it.

          The portal renders from this projection, not from the project — so
          before this, a client could sign a document, watch it turn signed, and
          find it unsigned again on refresh, waiting on the studio to publish.
          The signature was recorded; they just could not see it.

          Only ever rebuilt, never created. If the studio has not published this
          project, a client action must not be the thing that publishes it —
          that decision belongs to the studio, and buildPortalView filters by
          what is published rather than deciding it.

          Three things are carried across rather than rebuilt: the scope, the
          baseline its change markers are measured against, and the studio's
          contact and bank details. None of them can be derived from the project
          context — they are assembled by the studio's session and sent with the
          projection — so recomputing here would quietly empty them.
        */
        if (viewSnap.exists) {
            const previous = (viewSnap.data() as any)?.context || {};
            const rebuilt = buildPortalView(
                projectId,
                nextContext,
                previous.portalStudio,
                previous.clientBoq,
                previous.clientBoqBaseline,
            );
            tx.set(viewRef, rebuilt as any);
        }
    });

    logger.info("Client action applied", { projectId, type: action?.type });
    return { ok: true };
});
