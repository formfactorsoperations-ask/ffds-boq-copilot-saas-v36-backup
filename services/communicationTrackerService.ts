import { db } from '../services/firebaseClient';
import { collection, doc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { COMMUNICATION_TEMPLATE_DEFAULT } from '../constants';
import { CommunicationLogItem, CommunicationTemplateItem } from '../types';

export const initCommunicationLog = async (projectId: string, studioId: string) => {
    if (!db) return;
    
    // Get template from studio settings
    const settingsRef = doc(db, `studios/${studioId}/settings/main`);
    const settingsSnap = await getDoc(settingsRef);
    let template: CommunicationTemplateItem[] = COMMUNICATION_TEMPLATE_DEFAULT;
    if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data.communicationTemplate) {
            template = data.communicationTemplate;
        }
    }
    
    const batch = writeBatch(db);
    const logRef = collection(db, `projects/${projectId}/communicationLog`);
    
    template.forEach(t => {
        const itemDoc = doc(logRef, t.key);
        const logData: CommunicationLogItem = {
            key: t.key,
            status: 'pending',
            sentAt: null,
            sentBy: null,
            sentByName: null,
            sentVia: null,
            invoiceRef: null,
            notes: '',
            lastUpdatedAt: serverTimestamp()
        };
        batch.set(itemDoc, logData);
    });
    
    // Update project summary
    const projectRef = doc(db, 'projects', projectId);
    batch.set(projectRef, {
        commsHealth: 0,
        commsSentCount: 0,
        commsPendingCount: template.length,
        commsOverdueCount: 0,
        commsLastUpdatedAt: serverTimestamp()
    }, { merge: true });
    
    await batch.commit();
};

export const updateCommunicationLog = async (projectId: string, logUpdate: Partial<CommunicationLogItem> & {key: string}, newHealthStats: any) => {
    if (!db) return;
    const batch = writeBatch(db);
    
    const logDoc = doc(db, `projects/${projectId}/communicationLog`, logUpdate.key);
    batch.set(logDoc, {
        ...logUpdate,
        lastUpdatedAt: serverTimestamp()
    }, { merge: true });
    
    const projectRef = doc(db, 'projects', projectId);
    batch.set(projectRef, {
        ...newHealthStats,
        commsLastUpdatedAt: serverTimestamp()
    }, { merge: true });
    
    await batch.commit();
};
