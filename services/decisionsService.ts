import { collection, doc, setDoc, updateDoc, serverTimestamp, getDocs, query, where, Timestamp, collectionGroup, getDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from './firebaseClient';

export interface SignoffData {
    type: 'approved' | 'queried' | null;
    respondedAt: Timestamp | null;
    clientNameEntered: string | null;
    queryText: string | null;
    ipAddress: string | null;
    clientEmail?: string | null;
}

/** One turn in the conversation about a decision. */
export interface DecisionMessage {
    from: 'client' | 'studio';
    text: string;
    at: Timestamp;
    /** Who said it, when we know. */
    author?: string;
}

export interface DecisionData {
    id?: string;
    title?: string;
    decisionText: string;
    roomName: string;
    category: 'Site Condition' | 'Client Request' | 'Design Upgrade' | 'Value Engineering';
    /**
     * Design decision or site decision. Set explicitly by the studio; when it
     * is absent the portal falls back to the project's stage, since nothing can
     * be held up on site before execution has started.
     */
    decisionNature?: 'design' | 'site';
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
    /**
     * Which studio issued this. Stamped at creation so the unauthenticated
     * sign-off page can look up the right branding -- it has the decision and
     * nothing else, and studioSettings is keyed by tenant.
     */
    studioId?: string;
    impactCostValue?: number;
    impactScheduleDays?: number;
    /** The studio's answer to a client query. Set by replyToDecisionQuery. */
    studioReply?: string | null;
    studioRepliedAt?: Timestamp | null;
    /**
     * Every question and answer, in order.
     *
     * `signoff.queryText` and `studioReply` each hold only the most recent turn,
     * so a second question overwrote the first and the whole exchange was lost.
     * They are still written -- other screens read them -- but this array is the
     * record. Append-only; nothing here is ever replaced.
     */
    discussion?: DecisionMessage[];
}

/**
 * Creates a new decision document in the project's decisions subcollection.
 */
export async function saveDecision(projectId: string, decisionData: Partial<DecisionData>) {
    if (!auth.currentUser) throw new Error("Must be logged in to create a decision");
    
    const decisionsRef = collection(db, 'projects', projectId, 'decisions');
    const newDecisionRef = doc(decisionsRef);
    const decisionId = newDecisionRef.id;
    
    const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const token = `${projectId}_${decisionId}_${randomPart}`;
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);
    
    const payload: DecisionData = {
        title: decisionData.title || '',
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
        signoffToken: token,
        tokenExpiresAt: Timestamp.fromDate(tokenExpiresAt),
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
        projectName: decisionData.projectName || '',
        studioId: decisionData.studioId || 'demo-tenant-01',
        impactCostValue: decisionData.impactCostValue || 0,
        impactScheduleDays: decisionData.impactScheduleDays || 0
    };
    
    /*
      Written only when the studio actually chose one. The field was declared on
      DecisionData and passed in by the Decisions screen, but never made it into
      this payload -- so every decision was stored with no nature and the portal
      fell back to guessing from the project's stage. Omitting the key rather
      than writing null keeps "absent on older records" meaning what it says,
      and Firestore rejects an explicit undefined.
    */
    if (decisionData.decisionNature) {
        payload.decisionNature = decisionData.decisionNature;
    }

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
        ...(type === 'queried' && queryText
            ? { discussion: arrayUnion({ from: 'client', text: queryText, at: Timestamp.now(), author: 'Manual Ops Entry' }) }
            : {}),
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
        ...(type === 'queried' && queryText
            ? { discussion: arrayUnion({ from: 'client', text: queryText, at: Timestamp.now(), author: clientName || 'Client' }) }
            : {}),
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

/**
 * Answer a client's query and put the decision back in front of them.
 *
 * A queried decision could only be moved by uploading a revised drawing, which
 * made every question a drawing request. Most are not: "which finish did you
 * mean?" needs a sentence, not a blueprint. This records the answer and returns
 * the decision to awaiting-sign-off, leaving the drawing exactly as it was.
 *
 * The reply is stored rather than emailed-and-forgotten so the portal can show
 * the client what they were told, next to the question they asked.
 */
export async function replyToDecisionQuery(projectId: string, decisionId: string, replyText: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    await updateDoc(docRef, {
        studioReply: replyText,
        studioRepliedAt: serverTimestamp(),
        /* Timestamp.now() rather than serverTimestamp(): Firestore rejects a
           sentinel inside an array element. */
        discussion: arrayUnion({
            from: 'studio',
            text: replyText,
            at: Timestamp.now()
        }),
        // Back to the client. The drawing and its signoff token are untouched --
        // nothing about the drawing changed. `signoff` is left alone too: it
        // holds the question that was asked, and clearing it to make the status
        // tidy would delete the client's own words from the audit trail.
        status: 'drawing_sent'
    });
}

/**
 * Stamp the issuing studio onto a decision that predates the field.
 *
 * Decisions created before `studioId` existed cannot tell the unauthenticated
 * sign-off page which tenant's branding to load, so it falls back to a default
 * that is somebody else's. Rather than a migration, this backfills whenever the
 * studio next notifies or re-requests sign-off -- both of which already run
 * authenticated and already know the studio.
 */
export async function ensureDecisionStudio(projectId: string, decisionId: string, studioId?: string) {
    if (!studioId) return;
    try {
        const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
        const snap = await getDoc(docRef);
        if (snap.exists() && !snap.data().studioId) {
            await updateDoc(docRef, { studioId });
        }
    } catch {
        // Branding is not worth failing a notification over.
    }
}

export async function deleteDecision(projectId: string, decisionId: string) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    await deleteDoc(docRef);
}

export async function updateDecisionText(projectId: string, decisionId: string, decisionText: string, title?: string, impactCostValue?: number, impactScheduleDays?: number) {
    const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
    const updateData: any = { decisionText };
    if (title !== undefined) updateData.title = title;
    if (impactCostValue !== undefined) updateData.impactCostValue = impactCostValue;
    if (impactScheduleDays !== undefined) updateData.impactScheduleDays = impactScheduleDays;
    await updateDoc(docRef, updateData);
}
