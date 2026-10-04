import { apiFetch } from './apiFetch';
import { collection, addDoc, doc, getDoc, runTransaction, Timestamp, query, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { MOM, SiteVisitType } from '../types';
import { FLASH_MODEL } from "../constants/aiModels";

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
        const response = await apiFetch('/api/structure-mom', {
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
                dueDate: a.dueDateText ? (calculateTimestamp(a.dueDateText, meetingDate) || null) : null,
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
            summary: momData.summary || null,
            aiGenerated: true,
            aiModel: FLASH_MODEL,
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

/*
  A due date from the words in the notes, counted from the MEETING's date.

  This understood only "tomorrow", "today" and full dates, counted from now: the
  everyday phrasings -- "by Thursday", "from Monday", "next week", "12 Oct" --
  came back empty, so the MoM showed no due dates at all. A day and month with
  no year ("12 Oct") also parsed as 2001 in Chrome.
*/
export function calculateTimestamp(dateStr: string, anchorMs: number = Date.now()): number | undefined {
    if (!dateStr) return undefined;
    const s = dateStr.toLowerCase().trim();
    const DAY = 24 * 60 * 60 * 1000;
    const anchor = new Date(anchorMs);
    anchor.setHours(18, 0, 0, 0);
    const base = anchor.getTime();

    if (/\b(today|eod|end of (the )?day)\b/.test(s)) return base;
    if (/\btomorrow\b/.test(s)) return base + DAY;
    if (/\bday after tomorrow\b/.test(s)) return base + 2 * DAY;

    const inN = s.match(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/);
    if (inN) return base + Number(inN[1]) * (inN[2].startsWith('week') ? 7 : 1) * DAY;
    if (/\bnext week\b/.test(s)) return base + 7 * DAY;
    if (/\b(end of (the )?week|this week|eow)\b/.test(s)) {
        const toSat = (6 - anchor.getDay() + 7) % 7;
        return base + toSat * DAY;
    }

    const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}|\\b${d.slice(0, 3)}\\b`).test(s));
    if (wd >= 0) {
        let ahead = (wd - anchor.getDay() + 7) % 7;
        if (ahead === 0) ahead = 7; // "Monday" said on a Monday means next Monday
        if (/\bnext\b/.test(s) && ahead < 7) ahead += 7;
        return base + ahead * DAY;
    }

    // "12 Oct", "12th October", "Oct 12": this year, or next if already past.
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const dm = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/) || s.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (dm) {
        const [dayStr, monStr] = /^\d/.test(dm[1]) ? [dm[1], dm[2]] : [dm[2], dm[1]];
        const mon = MONTHS.indexOf(monStr.slice(0, 3));
        const d = Number(dayStr);
        if (mon >= 0 && d >= 1 && d <= 31 && !/\b\d{4}\b/.test(s)) {
            const out = new Date(anchor.getFullYear(), mon, d, 18, 0, 0, 0);
            if (out.getTime() < base - DAY) out.setFullYear(out.getFullYear() + 1);
            return out.getTime();
        }
    }

    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed) && new Date(parsed).getFullYear() >= anchor.getFullYear() - 1) return parsed;

    return undefined; // left for the studio to set in review
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
