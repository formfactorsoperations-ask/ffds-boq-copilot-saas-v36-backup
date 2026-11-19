import { useEffect, useMemo, useState } from 'react';
import { withStandard, type MaterialSpecsBank } from '../../lib/materialSpecs';
import { watchMaterialSpecs, saveMaterialSpecs } from '../../services/materialSpecsService';

/*
  The studio's Material specs bank, followed live (BOQ Playground S1/S2).

  `bank` is what the screens use: the saved bank with anything of the studio
  standard it lacks added after it (lib/materialSpecs withStandard), or the
  standard itself until the Owner first saves. `save` checks the write is
  append-only against what was last read.
*/
export interface MaterialSpecsState {
  bank: MaterialSpecsBank;
  stored: MaterialSpecsBank | null;
  loaded: boolean;
  error: string | null;
  save: (next: MaterialSpecsBank) => Promise<void>;
}

export function useMaterialSpecs(tenantId: string | undefined, enabled = true): MaterialSpecsState {
  const [stored, setStored] = useState<MaterialSpecsBank | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    try {
      return watchMaterialSpecs(
        tenantId,
        (b) => { setStored(b); setLoaded(true); setError(null); },
        (e) => { setLoaded(true); setError(e.message); },
      );
    } catch (e: any) {
      // No database (a test, or offline): the standard stands in.
      setLoaded(true);
      return undefined;
    }
  }, [tenantId, enabled]);
  const bank = useMemo(() => withStandard(stored), [stored]);
  /* The saved bank is shown at once; the live listener confirms it. */
  const save = async (next: MaterialSpecsBank) => { await saveMaterialSpecs(tenantId, next, stored); setStored(next); };
  return { bank, stored, loaded, error, save };
}
