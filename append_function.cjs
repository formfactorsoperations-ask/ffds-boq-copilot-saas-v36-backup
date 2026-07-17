const fs = require('fs');

const funcCode = `
import { onSchedule } from "firebase-functions/v2/scheduler";

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
                const isNewThisWeek = !prevDrawingsMap.has(d.id) || prevDrawingsMap.get(d.id).currentRound !== d.currentRound;
                return { ...d, isNewThisWeek };
            });

            const prevScope = prevReport?.snapshot?.scopeAdditions || [];
            const prevScopeMap = new Map(prevScope.map((s: any) => [s.id, s]));
            const processedScope = scopeAdditions.map((s: any) => {
                const isNewThisWeek = !prevScopeMap.has(s.id) || prevScopeMap.get(s.id).status !== s.status;
                
                let amount = s.netImpact ? parseInt(s.netImpact, 10) : 0;
                let chargeLine = "No charge \u2014 absorbed by studio";
                if (s.chargeable) {
                    const fmtAmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
                    chargeLine = \`\${fmtAmt} \u00B7 \${s.id} (invoiced)\`;
                }
                return { ...s, isNewThisWeek, chargeLine };
            });

            const prevPayment = prevReport?.snapshot?.paymentStages || [];
            const prevPaymentMap = new Map(prevPayment.map((p: any) => [p.id, p]));
            const processedPayments = paymentStages.map((p: any) => {
                const isNewThisWeek = !prevPaymentMap.has(p.id) || prevPaymentMap.get(p.id).status !== p.status;
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

            const reportId = \`rep-\${Date.now()}\`;
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
`;

let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// Insert import at the top
code = code.replace(/import { onCall, HttpsError } from "firebase-functions\/v2\/https";/, 'import { onCall, HttpsError } from "firebase-functions/v2/https";\nimport { onSchedule } from "firebase-functions/v2/scheduler";');

code += '\n' + funcCode;

fs.writeFileSync('functions/src/index.ts', code);
console.log('Appended cloud function');
