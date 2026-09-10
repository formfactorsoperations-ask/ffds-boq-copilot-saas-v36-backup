import { useState, useEffect } from 'react';
import { db } from '../services/firebaseClient';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { CommunicationLogItem, PaymentMilestone } from '../types';
import { useStudioSettings } from './useStudioSettings';

export function useCommunicationLog(projectId: string, studioId: string) {
  const { settings, loading: settingsLoading } = useStudioSettings(studioId);
  const [logs, setLogs] = useState<CommunicationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [paymentMilestones, setPaymentMilestones] = useState<PaymentMilestone[]>([]);
  
  useEffect(() => {
    /*
      Every exit from this effect has to clear `loading`.

      It began at `true` and was only ever cleared inside the snapshot
      callback, so any path that never reaches one — no project id, no
      Firestore, or a listen that fails — left the tracker showing
      "Loading tracker..." for ever. That is what a missing security rule
      looked like from the outside: not an error, just a page that never
      arrived.
    */
    if (!projectId || !db) {
      setLoading(false);
      return;
    }

    const logRef = collection(db, `projects/${projectId}/communicationLog`);
    const unsubscribe = onSnapshot(
      logRef,
      (snapshot) => {
        const data = snapshot.docs.map(d => d.data() as CommunicationLogItem);
        setLogs(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        // Most often a rules denial. Say so rather than hang.
        console.error('Communication log listener failed', err);
        setError(err as Error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !db) return;
    
    const pRef = doc(db, 'projects', projectId);
    const unSub = onSnapshot(
      pRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPaymentMilestones(data.context?.paymentMilestones || []);
        }
      },
      (err) => console.error('Project listener failed (payment milestones)', err),
    );
    return () => unSub();
  }, [projectId]);
  
  const template = settings?.emailTemplateLibrary?.length ? settings.emailTemplateLibrary : (settings?.communicationTemplate || []);
  
  const mergedItems = template.map(t => {
      const log = logs.find(l => l.key === t.key) || {
          key: t.key,
          status: 'pending',
          sentAt: null,
          sentBy: null,
          sentByName: null,
          sentVia: null,
          invoiceRef: null,
          notes: '',
          lastUpdatedAt: null
      };
      
      let needsAttention = false;
      
      if (log.status === 'pending') {
          if (t.linkedFeature === 'payment_calc') {
              const hasInvoiced = paymentMilestones.some(m => m.status === 'invoiced' || m.status === 'paid');
              if (hasInvoiced) needsAttention = true;
          } else if (t.linkedFeature === 'client_proposal' && t.key === 'proposal_sent') {
              // Could check if proposal was exported recently. We'll simplify and say false unless explicitly tracked. 
              needsAttention = false; 
          }
      }
      
      return { template: t, log: { ...log, needsAttention } as CommunicationLogItem };
  });

  const designItems = mergedItems.filter(m => m.template.phase === 'design').sort((a,b) => a.template.defaultOrder - b.template.defaultOrder);
  const executionItems = mergedItems.filter(m => m.template.phase === 'execution').sort((a,b) => a.template.defaultOrder - b.template.defaultOrder);
  
  const requiredItems = mergedItems.filter(m => m.template.isRequired);
  const requiredSentCount = requiredItems.filter(m => m.log.status === 'sent' || m.log.status === 'not_applicable').length;
  const healthScore = requiredItems.length > 0 ? Math.round((requiredSentCount / requiredItems.length) * 100) : 100;
  
  const sentCount = mergedItems.filter(m => m.log.status === 'sent').length;
  const pendingCount = mergedItems.filter(m => m.log.status === 'pending').length;
  const naCount = mergedItems.filter(m => m.log.status === 'not_applicable').length;
  
  // Also pass back raw merged items for calculations
  return {
      mergedItems,
      designItems,
      executionItems,
      healthScore,
      sentCount,
      pendingCount,
      naCount,
      loading: loading || settingsLoading,
      error
  };
}
