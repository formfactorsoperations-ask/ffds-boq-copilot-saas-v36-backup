import { useEffect, useMemo, useState } from "react";
import { FullProjectData, PurchaseOrder } from "../../types";
import { db } from "../../services/dbService";
import { buildLiveObservations, LiveObservationResult } from "../../lib/liveObservations";
import { classifyProject } from "../../lib/projectClassification";

/**
 * Purchase orders for every project that is not tagged as test data, converted
 * into observations the memory library can read.
 *
 * Fetched per project because that is how procurement stores them. The result
 * starts empty and fills in, which is the honest order: an empty map reads as
 * "no procurement recorded", which is exactly true while the fetch is in flight
 * and stays true afterwards for a studio that has not raised any POs.
 */
export function useLiveObservations(projects: FullProjectData[]): LiveObservationResult & { loading: boolean } {
  const [posByProject, setPosByProject] = useState<Record<string, PurchaseOrder[]>>({});
  const [loading, setLoading] = useState(true);

  /* Test projects are excluded before the fetch, not after: their purchase
     orders are not the studio's spending history and there is no reason to
     read them. */
  const real = useMemo(
    () => (projects || []).filter((p) => classifyProject(p) !== "test"),
    [projects]
  );

  useEffect(() => {
    let alive = true;
    if (!real.length) { setLoading(false); return; }
    setLoading(true);
    Promise.all(
      real.map((p) =>
        db.getPurchaseOrders(p.id)
          .then((r) => [p.id, r || []] as const)
          .catch(() => [p.id, []] as const)
      )
    )
      .then((pairs) => {
        if (!alive) return;
        const map: Record<string, PurchaseOrder[]> = {};
        pairs.forEach(([id, r]) => { map[id] = r as PurchaseOrder[]; });
        setPosByProject(map);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [real]);

  const result = useMemo(
    () => buildLiveObservations(real, posByProject),
    [real, posByProject]
  );

  return { ...result, loading };
}
