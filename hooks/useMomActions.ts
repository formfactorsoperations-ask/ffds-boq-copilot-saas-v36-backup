import { useState, useEffect } from 'react';
import { db } from '../services/firebaseClient';
import { collection, query, onSnapshot, collectionGroup } from 'firebase/firestore';
import { MOM, MOMActionItem } from '../types';

export function useMomActions(projectId?: string, studioId?: string) {
    const [openActions, setOpenActions] = useState<number>(0);
    const [overdueActions, setOverdueActions] = useState<number>(0);

    useEffect(() => {
        if (!studioId) return;
        
        let q;
        if (projectId) {
            q = query(collection(db, `organizations/${studioId}/projects/${projectId}/moms`));
        } else {
            // Global rollup
            q = query(collectionGroup(db, 'moms'));
        }

        const unsub = onSnapshot(q, (snap) => {
            let open = 0;
            let overdue = 0;
            const now = Date.now();
            
            snap.docs.forEach(d => {
                const mom = d.data() as MOM;
                // Only count for non-draft moms, and if global, only for this studio
                // Firestore collectionGroup doesn't easily filter by studioId in the path without a field,
                // but since it's a demo we'll assume it's fine or we filter by path.
                if (mom.status !== 'draft') {
                    if (!projectId && !d.ref.path.includes(studioId)) return;

                    (mom.actionItems || []).forEach(a => {
                        if (a.status === 'open') {
                            open++;
                            if (a.dueDate && a.dueDate < now) overdue++;
                        }
                    });
                }
            });
            setOpenActions(open);
            setOverdueActions(overdue);
        });

        return () => unsub();
    }, [projectId, studioId]);

    return { openActions, overdueActions };
}
