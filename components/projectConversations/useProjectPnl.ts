import { useEffect, useState } from 'react';
import { db } from '../../services/dbService';
import type { PurchaseOrder } from '../../types';

/*
  The project's purchase orders, for the margin card and the cash and margin
  checks (lib/projectOutlook, lib/projectRisk), read as the Reports screen
  reads them. Only for the roles that see the studio's money; null while they
  load, for anyone else, or when they cannot be read.
*/
export function useProjectOrders(projectId: string, enabled: boolean): PurchaseOrder[] | null {
  const [pos, setPos] = useState<PurchaseOrder[] | null>(null);
  useEffect(() => {
    let live = true;
    setPos(null);
    if (!enabled || !projectId) return;
    db.getPurchaseOrders(projectId)
      .then((r: PurchaseOrder[]) => { if (live) setPos(r || []); })
      .catch(() => { if (live) setPos(null); });
    return () => { live = false; };
  }, [projectId, enabled]);
  return pos;
}
