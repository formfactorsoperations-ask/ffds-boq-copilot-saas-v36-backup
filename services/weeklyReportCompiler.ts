import { GoogleGenAI } from "@google/genai";
import { query, orderBy, limit, where } from 'firebase/firestore';
import { formatINR } from '../lib/utils';

function getValueAtPath(obj: any, path: string) {
    if (!obj || !path) return undefined;
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;
    for (const key of keys) {
        if (current === undefined || current === null) return undefined;
        current = current[key];
    }
    return current;
}
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { WeeklyPulseReport, ProjectContext, FullProjectData } from '../types';
import { db as dbService } from './dbService';
import { ACTIVITY_WHITELIST, PROGRESS_COVERAGE_TEMPLATE, UNCLASSIFIED_REVISION_ASSURANCE } from './reportSentenceMapping';

export async function syncWeeklyReport(
    orgId: string, 
    projectId: string, 
    reportId: string, 
    currentPulse: WeeklyPulseReport, 
    projectContext: ProjectContext,
    projectData: FullProjectData
): Promise<WeeklyPulseReport> {
    if (currentPulse.status === 'published') {
        return currentPulse; // Read-only once published
    }

    let updatedPulse = { ...currentPulse };
    
    // 1. Fetch live source data
    const paymentGatesRef = collection(db, `organizations/${orgId}/projects/${projectId}/paymentGates`);
    const gatesSnap = await getDocs(paymentGatesRef);
    const paymentGates = gatesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    const drawingTrackerRef = collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`);
    const drawingsSnap = await getDocs(drawingTrackerRef);
    const drawingTracker = drawingsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    
    const feedRef = collection(db, `organizations/${orgId}/projects/${projectId}/liveFeed`);
    const feedSnap = await getDocs(feedRef);
    const feed = feedSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    
    const scopeAdditionsRef = collection(db, `organizations/${orgId}/projects/${projectId}/scopeAdditions`);
    const saSnap = await getDocs(scopeAdditionsRef);
    const scopeAdditions = saSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    
    const decisionsRef = collection(db, `organizations/${orgId}/projects/${projectId}/decisions`);
    const decisionsSnap = await getDocs(decisionsRef);
    const decisions = decisionsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // 2. PAYMENT PLAN - VERBATIM RULE
    updatedPulse.paymentPlan = paymentGates.map(gate => ({
        gate_name: gate.gate_name,
        type: gate.type,
        status: gate.status,
        invoice_raised_date: gate.invoice_raised_date,
        paid_date: gate.paid_date,
        amount: gate.amount, // if available
        percentage: gate.percentage,
        order: gate.order
    })).sort((a, b) => (a.order || 0) - (b.order || 0));

    // 3. avgClearanceDays
    let totalDays = 0;
    let paidCount = 0;
    updatedPulse.paymentPlan.forEach(gate => {
        if (gate.status === 'paid' && gate.invoice_raised_date && gate.paid_date) {
            const raised = new Date(gate.invoice_raised_date).getTime();
            const paid = new Date(gate.paid_date).getTime();
            if (paid >= raised) {
                totalDays += (paid - raised) / (1000 * 60 * 60 * 24);
                paidCount++;
            }
        }
    });
    if (paidCount > 0) {
        updatedPulse.avgClearanceDays = Math.round(totalDays / paidCount);
    } else {
        delete updatedPulse.avgClearanceDays; 
    }

    // 4. deterministic health label
    const pendingInvoices = updatedPulse.paymentPlan.filter(g => g.status === 'invoice_raised').length;
    const isDelayed = pendingInvoices > 0 && updatedPulse.avgClearanceDays && updatedPulse.avgClearanceDays > 7;
    updatedPulse.healthLabel = isDelayed ? 'Delayed' : (pendingInvoices > 0 ? 'At Risk' : 'On Track');

    // ENRICHMENT 1: ACTIVITY
    const startMs = new Date(currentPulse.startDate).getTime();
    const endMs = new Date(currentPulse.endDate).getTime();
    
    const activities: { date: string, text: string }[] = [];
    feed.forEach(event => {
        let tsMs = 0;
        if (event.timestamp?.seconds) {
            tsMs = event.timestamp.seconds * 1000;
        } else if (event.timestamp) {
            tsMs = new Date(event.timestamp).getTime();
        }
        
        if (tsMs >= startMs && tsMs <= endMs) {
            const text = event.text || '';
            let mappedText = null;
            for (const rule of ACTIVITY_WHITELIST) {
                if (rule.pattern.test(text)) {
                    mappedText = rule.template;
                    break;
                }
            }
            if (mappedText) {
                activities.push({
                    date: new Date(tsMs).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                    text: mappedText
                });
            }
        }
    });
    updatedPulse.activities = activities.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // ENRICHMENT 2: VELOCITY
    let clientReviewTotal = 0;
    let studioTurnaroundTotal = 0;
    let clientReviewCount = 0;
    let studioTurnaroundCount = 0;
    let totalEligibleClientRounds = 0;
    let totalEligibleStudioRounds = 0;
    
    drawingTracker.forEach(drawing => {
        if (drawing.rounds && drawing.rounds.length > 0) {
            for (let i = 0; i < drawing.rounds.length; i++) {
                const round = drawing.rounds[i];
                if (round.issuedAt) {
                    totalEligibleClientRounds++;
                    if (round.clientFeedbackSubmittedAt) {
                        clientReviewTotal += (round.clientFeedbackSubmittedAt - round.issuedAt);
                        clientReviewCount++;
                        
                        if (i + 1 < drawing.rounds.length) {
                            const nextRound = drawing.rounds[i + 1];
                            totalEligibleStudioRounds++;
                            if (nextRound.issuedAt) {
                                studioTurnaroundTotal += (nextRound.issuedAt - round.clientFeedbackSubmittedAt);
                                studioTurnaroundCount++;
                            }
                        }
                    }
                }
            }
        }
    });
    
    const clientCoverage = totalEligibleClientRounds > 0 ? clientReviewCount / totalEligibleClientRounds : 0;
    const studioCoverage = totalEligibleStudioRounds > 0 ? studioTurnaroundCount / totalEligibleStudioRounds : 0;
    const coveragePercent = Math.min(clientCoverage, studioCoverage) * 100;
    
    if (coveragePercent >= 60) {
        updatedPulse.velocity = {
            clientAvgHours: clientReviewCount > 0 ? (clientReviewTotal / clientReviewCount) / (1000 * 60 * 60) : undefined,
            studioAvgHours: studioTurnaroundCount > 0 ? (studioTurnaroundTotal / studioTurnaroundCount) / (1000 * 60 * 60) : undefined,
            coveragePercent
        };
    } else {
        delete updatedPulse.velocity;
    }

    // ENRICHMENT 3: CATEGORY PROGRESS
    // Use projectContext.rooms and currentPulse.roomProgress
    // Assuming each item in BOQ has a category. We can get categories from projectContext.weeklyRoomProgress? No, from activeProject tiers?
    const categoryMap = new Map<string, { total: number, covered: number, sum: number }>();
    if (projectData?.activeProject?.tierId && projectData.tiers) {
        const activeTier = projectData.tiers.find(t => t.id === projectData.activeProject?.tierId);
        if (activeTier?.boq) {
            activeTier.boq.forEach(item => {
                const cat = (item as any).cat || (item as any).category || 'General';
                const room = item.roomId || 'General';
                if (!categoryMap.has(cat)) {
                    categoryMap.set(cat, { total: 0, covered: 0, sum: 0 });
                }
            });
            // We need unique rooms per category
            const catRooms = new Map<string, Set<string>>();
            activeTier.boq.forEach(item => {
                const cat = (item as any).cat || (item as any).category || 'General';
                const room = item.roomId || 'General';
                if (!catRooms.has(cat)) catRooms.set(cat, new Set());
                catRooms.get(cat)!.add(room);
            });
            
            catRooms.forEach((rooms, cat) => {
                let sum = 0;
                let covered = 0;
                rooms.forEach(r => {
                    const progress = currentPulse.roomProgress?.[r] || 0;
                    sum += progress;
                    if (progress > 0) covered++;
                });
                const total = rooms.size;
                categoryMap.set(cat, {
                    total,
                    covered,
                    sum: total > 0 ? Math.round(sum / total) : 0
                });
            });
        }
    }
    
    updatedPulse.categoryProgress = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        percentage: data.sum,
        roomsCovered: data.covered,
        totalRooms: data.total
    }));

    // ENRICHMENT 4: OPEN ITEMS
    const openItemsClient: { text: string; date?: string; type: string }[] = [];
    const openItemsStudio: { text: string; date?: string; type: string }[] = [];
    
    // Client - Drawings
    drawingTracker.forEach(d => {
        if (d.rounds?.length > 0) {
            const cur = d.rounds[d.currentRound - 1];
            if (cur && cur.status === 'issued') { // Client has it
                openItemsClient.push({ text: `Review Drawing: ${d.name}`, type: 'Drawing' });
            }
        }
    });
    
    // Client - SOF pending
    if (projectData.activeProject?.executionData?.sofItems) {
        projectData.activeProject.executionData.sofItems.forEach(sof => {
            if (sof.status === 'pending' || sof.status === 'draft') {
                openItemsClient.push({ text: `Pending Selection: ${sof.name}`, type: 'Selection' });
            }
        });
    }
    
    // Client - Unpaid SA
    scopeAdditions.forEach(sa => {
        if (sa.paymentGate && !sa.paymentGate.workAuthorized) {
            openItemsClient.push({ text: `Unpaid Scope Addition: ${sa.id}`, type: 'Finance' });
        }
    });
    
    // Studio - Decisions
    decisions.forEach(dec => {
        if (!['notified', 'drawing_sent', 'signed', 'disputed'].includes(dec.status)) {
            openItemsStudio.push({ text: `Pending Decision: ${dec.decisionText}`, type: 'Decision' });
        }
    });
    
    // Studio - Timeline
    if (projectData.timeline && projectData.activeProject?.startDate) {
        const startTs = new Date(projectData.activeProject.startDate).getTime();
        const nowTs = Date.now();
        const tenDaysTs = nowTs + 10 * 24 * 60 * 60 * 1000;
        
        projectData.timeline.forEach(task => {
            if ((task as any).status !== 'completed') {
                const taskDueTs = startTs + (task.startDay + (task.durationDays || (task as any).duration || 0)) * 24 * 60 * 60 * 1000;
                if (taskDueTs >= nowTs && taskDueTs <= tenDaysTs) {
                    openItemsStudio.push({ 
                        text: `Milestone Due: ${(task.phaseName || (task as any).title)}`, 
                        date: new Date(taskDueTs).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                        type: 'Timeline' 
                    });
                }
            }
        });
    }
    
    updatedPulse.openItems = {
        client: openItemsClient,
        studio: openItemsStudio
    };

    // ENRICHMENT 5: REVISION LEDGER
    const revisions: any[] = [];
    let clientRequested = 0;
    let siteCondition = 0;
    let internalRefinement = 0;
    let unclassified = 0;
    const chargeableSummary: string[] = [];
    
    drawingTracker.forEach(drawing => {
        if (drawing.rounds && drawing.rounds.length > 1) {
            drawing.rounds.forEach((round: any) => {
                if (round.roundNumber > 1 && round.cause) {
                    let clientLabel = 'Standard Iteration';
                    if (round.cause === 'CLIENT_REVISION') {
                        clientLabel = 'Client Requested Change';
                        clientRequested++;
                    } else if (round.cause === 'SITE_CONDITION') {
                        clientLabel = 'Site Condition Adaptation';
                        siteCondition++;
                    } else if (round.cause === 'FFDS_DESIGN_MISS') {
                        clientLabel = 'Internal Design Refinement';
                        internalRefinement++;
                    } else {
                        unclassified++;
                    }
                    
                    if (round.chargeable) {
                        chargeableSummary.push(`${drawing.name} (Round ${round.roundNumber}) - ${clientLabel}`);
                    }

                    revisions.push({
                        id: `rev-${drawing.id}-${round.roundNumber}`,
                        drawing: drawing.name || drawing.id,
                        change: round.requestDescription || `Revision Round ${round.roundNumber}`,
                        category: round.cause,
                        clientRevisionLabel: clientLabel,
                        charge: round.chargeable ? 'Chargeable' : 'Included'
                    });
                }
            });
        }
    });
    updatedPulse.revisions = revisions;
    updatedPulse.revisionLedger = {
        clientRequested,
        siteCondition,
        internalRefinement,
        unclassified,
        chargeableSummary
    };

    updatedPulse.status = 'building';
    updatedPulse.syncCount = (updatedPulse.syncCount || 0) + 1;
    updatedPulse.syncedAt = Date.now();
    
    if (updatedPulse.weekNumber > 1 && projectContext.weeklyPulseReports) {
        const prev = projectContext.weeklyPulseReports.find(w => w.weekNumber === updatedPulse.weekNumber - 1);
        if (prev) {
            updatedPulse.deltas = {
                paidStages: (updatedPulse.paymentPlan.filter(p => p.status === 'paid').length) - ((prev.paymentPlan || []).filter(p => p.status === 'paid').length),
                revisions: (updatedPulse.revisions?.length || 0) - (prev.revisions?.length || 0)
            };
        }
    }

    
    // SELF-HEALING CORRECTIONS
    if (updatedPulse.corrections && updatedPulse.corrections.length > 0) {
        for (let i = 0; i < updatedPulse.corrections.length; i++) {
            const corr = updatedPulse.corrections[i];
            if (corr.state === 'active') {
                const freshValue = getValueAtPath(updatedPulse, corr.fieldPath);
                // Simple equality check. If it's an object, JSON stringify for comparison
                const isEqual = typeof freshValue === 'object' && typeof corr.correctedValue === 'object' 
                    ? JSON.stringify(freshValue) === JSON.stringify(corr.correctedValue)
                    : freshValue == corr.correctedValue;
                
                if (isEqual) {
                    updatedPulse.corrections[i].state = 'retired';
                    // close the mismatch task
                    if (corr.mismatchTaskId) {
                        try {
                            const taskRef = doc(db, `organizations/${orgId}/projects/${projectId}/tasks/${corr.mismatchTaskId}`);
                            await setDoc(taskRef, { status: 'resolved' }, { merge: true });
                        } catch (e) {
                            console.error('Failed to close mismatch task', e);
                        }
                    }
                }
            }
        }
    }

    return updatedPulse;
}
import { db } from './firebaseClient';

export function clientRevisionLabel(cause: string) {
    if (cause === 'CLIENT_REVISION') return "Client-requested change";
    if (cause === 'FFDS_DESIGN_MISS') return "Studio correction";
    if (cause === 'SITE_CONDITION') return "Site condition adjustment";
    return "Standard Iteration";
}

export function sanitizeDataForClient(data: any): any {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) {
        return data.map(sanitizeDataForClient);
    }
    if (typeof data === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(data)) {
            // Forbidden fields
            if (['marginAmt', 'baseCost', 'unitCost', 'rate', 'classificationConfidence'].includes(key)) {
                continue;
            }
            
            // Map causes
            if (key === 'cause') {
                sanitized[key] = clientRevisionLabel(value as string);
                continue;
            }
            
            // Strip out raw enums if they happen to be values
            if (typeof value === 'string') {
                if (value === 'CLIENT_REVISION') sanitized[key] = "Client-requested change";
                else if (value === 'FFDS_DESIGN_MISS') sanitized[key] = "Studio correction";
                else if (value === 'SITE_CONDITION') sanitized[key] = "Site condition adjustment";
                else sanitized[key] = value;
            } else {
                sanitized[key] = sanitizeDataForClient(value);
            }
        }
        return sanitized;
    }
    return data;
}


export async function generateReportNarrative(snapshot: any, attempt = 1): Promise<{ weekAtAGlance: string, comingUpNextWeek: string } | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You write the narrative for a weekly client progress report for an interior design project. You receive a JSON snapshot of verified project state. Write:
1. weekAtAGlance: 3–5 sentences, warm-professional, plain English, no jargon.
2. comingUpNextWeek: 2–3 sentences.
HARD RULES: Use ONLY facts present in the JSON. NEVER invent numbers, dates, amounts, percentages or names. Every number you mention must appear verbatim in the JSON. Refer to money only as already formatted in the JSON. Do not speculate about client satisfaction. Do not apologise. If execution.locked is true, state plainly that execution begins after the Design Complete Gate. Return ONLY strict JSON: { "weekAtAGlance": string, "comingUpNextWeek": string }. No markdown fences.

SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}`;

    try {
        const response = await ai.models.generateContent({ 
            model: 'gemini-3.5-flash', 
            contents: prompt, 
            config: { 
                temperature: 0.2, 
                responseMimeType: "application/json" 
            } 
        });
        
        let text = response.text || '';
        // Some robust JSON parsing in case of markdown fences
        if (text.startsWith('```')) {
            const lines = text.split('\n');
            if (lines.length > 2) {
                text = lines.slice(1, -1).join('\n');
            }
        }
        const narrative = JSON.parse(text);
        
        // POST-PROCESSING GUARD
        const snapshotStr = JSON.stringify(snapshot);
        const combinedText = (narrative.weekAtAGlance || '') + ' ' + (narrative.comingUpNextWeek || '');
        const numberRegex = /(?:₹\s*)?[\d,]+(?:\.\d+)?/g;
        const matches = combinedText.match(numberRegex) || [];
        
        let failed = false;
        for (const match of matches) {
            if (!snapshotStr.includes(match)) {
                failed = true;
                break;
            }
        }
        
        if (failed) {
            if (attempt === 1) {
                return generateReportNarrative(snapshot, 2);
            }
            return null; // verification failed twice
        }
        
        return {
            weekAtAGlance: narrative.weekAtAGlance || '',
            comingUpNextWeek: narrative.comingUpNextWeek || ''
        };
    } catch (e) {
        if (attempt === 1) {
            return generateReportNarrative(snapshot, 2);
        }
        return null;
    }
}

export async function compileWeeklyReport(orgId: string, projectId: string, periodStart: string, periodEnd: string) {
    // 1. Read sources
    const projectRef = doc(db, `organizations/${orgId}/projects/${projectId}`);
    const projectSnap = await getDoc(projectRef);
    const projectData = projectSnap.data() || {};
    
    const drawingSnap = await getDocs(collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`));
    const drawings = drawingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const designGateSnap = await getDoc(doc(db, `organizations/${orgId}/projects/${projectId}/designGate/main`));
    const designGate = designGateSnap.exists() ? designGateSnap.data() : null;

    const milestonesSnap = await getDocs(collection(db, `organizations/${orgId}/projects/${projectId}/paymentMilestones`));
    const paymentStages = milestonesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    const projectUpdatesSnap = await getDocs(collection(db, `organizations/${orgId}/projects/${projectId}/projectUpdates`));
    const scopeAdditions = projectUpdatesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    const sofSnap = await getDocs(collection(db, `organizations/${orgId}/projects/${projectId}/sofItems`));
    const sofItems = sofSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // Get previous report snapshot
    const reportsRef = collection(db, `organizations/${orgId}/projects/${projectId}/weeklyReports`);
    const prevReportQ = query(reportsRef, orderBy('periodEnd', 'desc'), limit(1));
    const prevReportSnap = await getDocs(prevReportQ);
    const prevReport = !prevReportSnap.empty ? prevReportSnap.docs[0].data() : null;

    // 2. Health Label logic
    let healthLabel: 'on_track' | 'at_risk' | 'attention' = 'on_track';
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

    let hasInvoiceOverdue = false;
    let hasGateBlocked = false;
    let hasClientOverdue = false;
    let hasCompanionGap = false;

    // payment logic
    paymentStages.forEach(p => {
        if (p.status === 'overdue' || (p.invoiceDate && (now - new Date(p.invoiceDate).getTime() > SEVEN_DAYS) && p.status !== 'paid')) {
            hasInvoiceOverdue = true;
        }
    });

    // design gate check
    if (designGate && !designGate.gateActivated && designGate.lastAssessedAt && (now - designGate.lastAssessedAt.toMillis() > FOURTEEN_DAYS)) {
        hasGateBlocked = true;
    }

    // drawing companion gaps
    drawings.forEach((d: any) => {
        if (d.isGapFlagged) hasCompanionGap = true;
        if (d.rounds?.length > 0) {
            const cur = d.rounds[d.currentRound - 1];
            if (cur && cur.status === 'issued') { // Client has it
                // Assuming client overdue check
                if (cur.issuedAt && (now - cur.issuedAt > SEVEN_DAYS)) hasClientOverdue = true;
            }
        }
    });

    if (hasInvoiceOverdue || hasGateBlocked) {
        healthLabel = 'at_risk';
    } else if (hasClientOverdue || hasCompanionGap) {
        healthLabel = 'attention';
    }

    // 3. Process drawings & deltas
    const prevDrawings = prevReport?.snapshot?.drawings || [];
    const prevDrawingsMap = new Map(prevDrawings.map((d: any) => [d.id, d]));
    
    const processedDrawings = drawings.map((d: any) => {
        const isNewThisWeek = !prevDrawingsMap.has(d.id) || (prevDrawingsMap.get(d.id) as any).currentRound !== d.currentRound;
        return { ...d, isNewThisWeek };
    });

    // scope additions delta
    const prevScope = prevReport?.snapshot?.scopeAdditions || [];
    const prevScopeMap = new Map(prevScope.map((s: any) => [s.id, s]));
    const processedScope = scopeAdditions.map((s: any) => {
        const isNewThisWeek = !prevScopeMap.has(s.id) || (prevScopeMap.get(s.id) as any).status !== s.status;
        
        let amount = s.netImpact ? parseInt(s.netImpact, 10) : 0;
        let chargeLine = "No charge \u2014 absorbed by studio"; // Note: not using FFDS!
        if (s.chargeable) {
            chargeLine = `${formatINR(amount)} \u00B7 ${s.id} (invoiced)`;
        }
        // TODO: invoiceStatus and paymentGate are ABSENT per the audit. Leaving null.
        return { ...s, isNewThisWeek, chargeLine, invoiceStatus: null, paymentGate: null };
    });

    // payment delta
    const prevPayment = prevReport?.snapshot?.paymentStages || [];
    const prevPaymentMap = new Map(prevPayment.map((p: any) => [p.id, p]));
    const processedPayments = paymentStages.map((p: any) => {
        const isNewThisWeek = !prevPaymentMap.has(p.id) || (prevPaymentMap.get(p.id) as any).status !== p.status;
        return { ...p, isNewThisWeek };
    });

    // contract fields
    const contract = projectData.context?.contractSignoff || {};
    const engagement = projectData.engagement || {};

    const rawSnapshot = {
        drawings: processedDrawings,
        designGate,
        paymentStages: processedPayments,
        scopeAdditions: processedScope,
        sofItems,
        contract: {
            signedAt: contract.signedAt || null, // from ProjectContext
            tcAcknowledgedAt: engagement.acknowledgedAt || null // from ProjectEngagement
        },
        healthLabel
    };

    const cleanSnapshot = sanitizeDataForClient(rawSnapshot);

    const reportId = `rep-${Date.now()}`;
    const reportRef = doc(db, `organizations/${orgId}/projects/${projectId}/weeklyReports/${reportId}`);
    
    const narrativeResult = await generateReportNarrative(cleanSnapshot);
    const newReport = {
        id: reportId,
        periodStart,
        periodEnd,
        status: 'draft',
        createdAt: Date.now(),
        snapshot: cleanSnapshot,
        narrative: narrativeResult 
            ? { ...narrativeResult, approvedByOwner: false } 
            : null,
        narrativeError: narrativeResult ? null : 'Failed to verify narrative facts against project data.'
    };

    await setDoc(reportRef, newReport);
    return newReport;
}
