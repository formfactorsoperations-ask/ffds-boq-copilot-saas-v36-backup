import { collection, doc, setDoc, updateDoc, serverTimestamp, getDocs, query, where, Timestamp, collectionGroup, getDoc } from 'firebase/firestore';
import { db, auth } from './firebaseClient';

export interface SignoffData {
    type: 'approved' | 'queried' | null;
    respondedAt: Timestamp | null;
    clientNameEntered: string | null;
    queryText: string | null;
    ipAddress: string | null;
    clientEmail?: string | null;
}

export interface DecisionData {
    id?: string;
    decisionText: string;
    roomName: string;
    category: 'Site Condition' | 'Client Request' | 'Design Upgrade' | 'Value Engineering';
    presentees: string;
    boqImpact: 'none' | 'rate_change' | 'new_item';
    photoURL: string | null;
    drawingURL: string | null;
    status: 'draft' | 'notified' | 'drawing_pending' | 'drawing_sent' | 'signed' | 'disputed';
    emailStatus?: 'Sent' | 'Failed' | 'Skipped';
    emailError?: string | null;
    notifiedAt: Timestamp | null;
    drawingUploadedAt: Timestamp | null;
    signoffRequestSentAt: Timestamp | null;
    signoffToken: string | null;
    tokenExpiresAt: Timestamp | null;
    clientName: string;
    clientEmail: string;
    signoff: SignoffData;
    createdBy: string;
    createdAt: any;
    projectId: string;
    projectName: string;
}

/**
 * Creates a new decision document in the project's decisions subcollection.
 */
export async function saveDecision(projectId: string, decisionData: Partial<DecisionData>) {
    if (!auth.currentUser) throw new Error("Must be logged in to create a decision");
    
    const decisionsRef = collection(db, 'projects', projectId, 'decisions');
    const newDecisionRef = doc(decisionsRef);
    
    const payload: DecisionData = {
        decisionText: decisionData.decisionText || '',
        roomName: decisionData.roomName || '',
        category: decisionData.category as any || 'Site Condition',
        presentees: decisionData.presentees || '',
        boqImpact: decisionData.boqImpact as any || 'none',
        photoURL: null,
        drawingURL: null,
        status: 'draft',
        notifiedAt: null,
        drawingUploadedAt: null,
        signoffRequestSentAt: null,
        signoffToken: null,
        tokenExpiresAt: null,
        clientName: decisionData.clientName || '',
        clientEmail: decisionData.clientEmail || '',
        signoff: {
            type: null,
            respondedAt: null,
            clientNameEntered: null,
            queryText: null,
            ipAddress: null
        },
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        projectId: projectId,
        projectName: decisionData.projectName || ''
    };
    
    await setDoc(newDecisionRef, payload);
    return newDecisionRef.id;
}

/**
 * Updates the photo URL for a decision.
 */
export async function updateDecisionPhoto(projectId: string, decisionId: string, photoURL: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    await updateDoc(docRef, {
        photoURL
    });
}

/**
 * Updates the drawing URL, sets token, and updates status to drawing_pending.
 */
export async function updateDecisionDrawing(projectId: string, decisionId: string, drawingURL: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    
    const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const token = `${projectId}_${decisionId}_${randomPart}`;
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);
    
    await updateDoc(docRef, {
        drawingURL,
        drawingUploadedAt: serverTimestamp(),
        signoffToken: token,
        tokenExpiresAt: Timestamp.fromDate(tokenExpiresAt),
        status: 'drawing_pending'
    });
}

/**
 * Marks a decision as notified (Email 1).
 */
export async function markDecisionNotified(projectId: string, decisionId: string, emailStatus: string = 'Skipped', emailError?: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    await updateDoc(docRef, {
        notifiedAt: serverTimestamp(),
        status: 'notified',
        emailStatus,
        emailError: emailError || null
    });
}

/**
 * Marks signoff request sent (Email 2).
 */
export async function markSignoffSent(projectId: string, decisionId: string, emailStatus: string = 'Skipped', emailError?: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    await updateDoc(docRef, {
        signoffRequestSentAt: serverTimestamp(),
        status: 'drawing_sent',
        emailStatus,
        emailError: emailError || null
    });
}

export async function getDecisionByToken(token: string) {
    // Parse composite token if available to bypass collectionGroup query which requires missing indexes
    const parts = token.split('_');
    if (parts.length >= 3) {
        const projectId = parts[0];
        const decisionId = parts[1];
        const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().signoffToken === token) {
            return { id: docSnap.id, ...docSnap.data() } as DecisionData;
        }
        return null;
    }
    
    // Fallback using collectionGroup (will fail if index is not deployed, but safe to try)
    const q = query(collectionGroup(db, 'decisions'), where('signoffToken', '==', token));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
        return null; // Return null if not found
    }
    
    const docData = querySnapshot.docs[0];
    return { id: docData.id, ...docData.data() } as DecisionData;
}

/**
 * Records the client's signoff on a decision. Uses collectionGroup query.
 */
export async function recordManualSignoff(projectId: string, decisionId: string, type: 'approved' | 'queried', queryText: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    const newStatus = type === 'approved' ? 'signed' : 'disputed';
    
    await updateDoc(docRef, {
        status: newStatus,
        signoff: {
            type,
            respondedAt: serverTimestamp(),
            clientNameEntered: 'Manual Ops Entry',
            queryText: queryText || null,
            ipAddress: 'Internal'
        }
    });
}

export async function recordClientSignoff(token: string, type: 'approved' | 'queried', clientName: string, queryText: string, ipAddress: string) {
    let targetDocRef = null;
    let data = null;

    // Direct fetch using composite token
    const parts = token.split('_');
    if (parts.length >= 3) {
        const projectId = parts[0];
        const decisionId = parts[1];
        targetDocRef = doc(db, 'projects', projectId, 'decisions', decisionId);
        const docSnap = await getDoc(targetDocRef);
        const docData = docSnap.data() as any;
        if (docSnap.exists() && docData?.signoffToken === token) {
            data = docData;
        }
    }

    if (!targetDocRef || !data) {
        // Fallback for non-composite token (will fail without Firestore collectionGroup index)
        const q = query(collectionGroup(db, 'decisions'), where('signoffToken', '==', token));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            throw new Error("Invalid or expired signoff token.");
        }
        targetDocRef = querySnapshot.docs[0].ref;
        data = querySnapshot.docs[0].data();
    }
    
    if (data.tokenExpiresAt && data.tokenExpiresAt.toDate() < new Date()) {
        throw new Error("Signoff token has expired.");
    }
    
    const newStatus = type === 'approved' ? 'signed' : 'disputed';
    
    await updateDoc(targetDocRef, {
        status: newStatus,
        signoff: {
            type,
            respondedAt: serverTimestamp(),
            clientNameEntered: clientName,
            queryText: queryText || null,
            ipAddress: ipAddress || null,
            clientEmail: data.clientEmail || null
        }
    });
}

import { deleteDoc } from 'firebase/firestore';

export async function deleteDecision(projectId: string, decisionId: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    await deleteDoc(docRef);
}

export async function updateDecisionText(projectId: string, decisionId: string, decisionText: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    await updateDoc(docRef, { decisionText });
}
