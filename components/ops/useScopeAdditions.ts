import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebaseClient";
import { Item } from "../../types";
import {
  ScopeAdditionRecord,
  ScopeAdditionSummary,
  normaliseAddition,
  summariseScopeAdditions,
  scopeAdditionsPath,
} from "../../lib/scopeAdditions";

/**
 * One project's scope additions, live.
 *
 * Subscribed rather than fetched, because the Scope Additions screen writes to
 * this same collection and the Money tab has to agree with it the moment a
 * payment is recorded -- two screens showing different contract values for one
 * project is the exact failure this work exists to remove.
 *
 * `loading` starts true and the summary is computed from an empty list until the
 * first snapshot lands. Callers must treat "no additions yet" and "not loaded
 * yet" differently: a Money tab that briefly renders a revised contract equal to
 * the frozen BOQ, then jumps, is worse than one that waits.
 */
export function useScopeAdditions(
  orgId: string | null | undefined,
  projectId: string | null | undefined,
  contractedExGst: number,
  baseMarginPct: number | null,
  bank?: Item[]
): { records: ScopeAdditionRecord[]; summary: ScopeAdditionSummary; loading: boolean; error: boolean } {
  const [records, setRecords] = useState<ScopeAdditionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!db || !orgId || !projectId) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    const unsub = onSnapshot(
      collection(db, scopeAdditionsPath(orgId, projectId)),
      (snap) => {
        setRecords(snap.docs.map((d) => normaliseAddition(d.id, d.data())));
        setLoading(false);
      },
      () => {
        /* A denied read is not an empty collection. Saying so lets the caller
           show "could not load" instead of a confident zero. */
        setError(true);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [orgId, projectId]);

  const summary = useMemo(
    () => summariseScopeAdditions(records, contractedExGst, baseMarginPct, bank),
    [records, contractedExGst, baseMarginPct, bank]
  );

  return { records, summary, loading, error };
}
