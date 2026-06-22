import { collection, addDoc, doc, getDoc, runTransaction, Timestamp, query, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { MOM, SiteVisitType } from '../types';

export const createMoMFromNotes = async (
    studioId: string,
    projectId: string,
    projectName: string,
    meetingId: string,
    meetingType: SiteVisitType | "internal" | "vendor",
    meetingTitle: string,
    meetingDate: number,
    rawNotes: string,
    knownAttendees: string,
    userId: string
): Promise<string> => {
    
    // 1. Structure the Notes
    let momData;
    try {
        const response = await fetch('/api/structure-mom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName,
                projectType: 'Interior Execution',
                knownAttendees,
                meetingDate: !isNaN(Number(meetingDate)) && meetingDate > 0 ? new Date(meetingDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                rawNotes
            })
        });
        
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error?.message || data.error || 'Failed to parse MoM');
        }
        momData = data.data;
    } catch (error) {
        console.error("Error creating MoM from notes:", error);
        throw error;
    }

    // 2. Transact: increment mom configuration, create doc
    const seqRef = doc(db, `organizations/${studioId}/sequences/moms`);
    const momRefColl = collection(db, `organizations/${studioId}/projects/${projectId}/moms`);
    
    let momId = '';

    await runTransaction(db, async (transaction) => {
        const seqDoc = await transaction.get(seqRef);
        let currentSeq = 1;
        if (seqDoc.exists()) {
            currentSeq = (seqDoc.data()?.current || 0) + 1;
            transaction.update(seqRef, { current: currentSeq });
        } else {
            transaction.set(seqRef, { current: currentSeq });
        }

        const year = new Date().getFullYear();
        const momRefNumber = `MOM-${year}-${currentSeq.toString().padStart(3, '0')}`;

        const newDocRef = doc(momRefColl);
        
        const mom: Omit<MOM, 'id'> = {
            momRef: momRefNumber,
            meetingId,
            meetingType,
            meetingTitle,
            meetingDate: meetingDate,
            createdBy: userId,
            createdAt: Date.now(),
            status: "draft",
            attendees: momData.attendees || [],
            rawNotes,
            decisions: (momData.decisions || []).map((d: any, i: number) => ({
                id: `d-${Date.now()}-${i}`,
                text: d.text || ""
            })),
            actionItems: (momData.actionItems || []).map((a: any, i: number) => ({
                id: `a-${Date.now()}-${i}`,
                text: a.text || "Untitled Action",
                owner: a.owner || "unknown",
                ownerName: a.ownerName || null,
                status: "open",
                dueDate: a.dueDateText ? (calculateTimestamp(a.dueDateText) || null) : null,
                flags: {
                    scope: !!a.flags?.scope,
                    drawing: !!a.flags?.drawing,
                    siteCondition: !!a.flags?.siteCondition,
                    cost: !!a.flags?.cost
                }
            })),
            notes: (momData.notes || []).map((n: any, i: number) => ({
                id: `n-${Date.now()}-${i}`,
                text: n.text || ""
            })),
            scopeFlagSummary: momData.scopeFlagSummary || null,
            aiGenerated: true,
            aiModel: "gemini-2.5-flash",
            aiConfidence: momData.confidence || 0.9,
        };

        transaction.set(newDocRef, mom);
        momId = newDocRef.id;
    });

    return momId;
};

export const createEmptyMoM = async (
    studioId: string,
    projectId: string,
    meetingId: string,
    meetingType: SiteVisitType | "internal" | "vendor",
    meetingTitle: string,
    meetingDate: number,
    userId: string,
    attendees: string[]
): Promise<string> => {
    const seqRef = doc(db, `organizations/${studioId}/sequences/moms`);
    const momRefColl = collection(db, `organizations/${studioId}/projects/${projectId}/moms`);
    
    let momId = '';

    await runTransaction(db, async (transaction) => {
        const seqDoc = await transaction.get(seqRef);
        let currentSeq = 1;
        if (seqDoc.exists()) {
            currentSeq = (seqDoc.data()?.current || 0) + 1;
            transaction.update(seqRef, { current: currentSeq });
        } else {
            transaction.set(seqRef, { current: currentSeq });
        }

        const year = new Date().getFullYear();
        const momRefNumber = `MOM-${year}-${currentSeq.toString().padStart(3, '0')}`;

        const newDocRef = doc(momRefColl);
        
        const mom: Omit<MOM, 'id'> = {
            momRef: momRefNumber,
            meetingId,
            meetingType,
            meetingTitle,
            meetingDate: meetingDate,
            createdBy: userId,
            createdAt: Date.now(),
            status: "draft",
            attendees: attendees.map(a => ({ name: a, side: "unknown" })),
            rawNotes: "",
            decisions: [],
            actionItems: [],
            notes: [],
            aiGenerated: false,
        };

        transaction.set(newDocRef, mom);
        momId = newDocRef.id;
    });

    return momId;
};

// basic heuristic to match dates
function calculateTimestamp(dateStr: string): number | undefined {
    if (!dateStr) return undefined;
    
    // Very coarse approximation if the AI gives e.g., "Tomorrow", "Next Week", or an ISO string.
    const cleanStr = dateStr.toLowerCase().trim();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    
    if (cleanStr.includes('tomorrow')) return now + day;
    if (cleanStr.includes('eod') || cleanStr.includes('today')) return now + day/2; // rough
    
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) return parsed;
    
    return undefined; // Handled as unresolved due date
}

export const getMomsForProject = async (studioId: string, projectId: string): Promise<MOM[]> => {
    const momsColl = collection(db, `organizations/${studioId}/projects/${projectId}/moms`);
    // no index natively needed if we just grab all and sort on client, but index by date requested
    const momsSnapshot = await getDocs(momsColl);
    return momsSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
    })) as MOM[];
};
