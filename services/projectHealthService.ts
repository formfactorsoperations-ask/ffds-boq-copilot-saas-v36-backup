/*
  The Projects screen's drawing counts (lib/projectHealth): one listener on
  organizations/{tenantId}/projectHealth, which functions/src/projectHealth.ts
  keeps. The first time an Owner, Admin or Ops Director opens the screen and
  the studio has no counts yet (just after the function is deployed), it asks
  the function to count every project once; after that the trigger keeps them.
*/
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseClient';
import type { DrawingCounts } from '../lib/projectHealth';

const SENIOR = new Set(['Super Admin', 'Owner', 'Admin', 'Ops Director']);
const ASKED = 'sd.projectHealth.rebuilt';

export function useProjectHealth(tenantId: string | null | undefined, role?: string | null): Map<string, DrawingCounts> {
  const [map, setMap] = useState<Map<string, DrawingCounts>>(new Map());
  useEffect(() => {
    if (!tenantId || !db) return;
    let first = true;
    const unsub = onSnapshot(
      collection(db, `organizations/${tenantId}/projectHealth`),
      (snap) => {
        const next = new Map<string, DrawingCounts>();
        snap.docs.forEach((d) => {
          const v: any = d.data();
          if (v?.drawings) next.set(d.id, { total: Number(v.drawings.total) || 0, issued: Number(v.drawings.issued) || 0 });
        });
        setMap(next);
        if (first && snap.empty && role && SENIOR.has(role)) askForCounts(tenantId);
        first = false;
      },
      () => { /* No counts readable: the rings show drawings as not counted yet. */ },
    );
    return () => unsub();
  }, [tenantId, role]);
  return map;
}

function askForCounts(tenantId: string) {
  try {
    if (sessionStorage.getItem(ASKED) === tenantId) return;
    sessionStorage.setItem(ASKED, tenantId);
  } catch { /* fine: it asks once per page load instead */ }
  if (!functions) return;
  httpsCallable(functions, 'rebuildProjectHealth')({ tenantId }).catch(() => { /* not deployed yet: the rings wait */ });
}
