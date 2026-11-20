import { useEffect, useState } from 'react';
import type { PaymentStructure, TermsSettings } from '../../types';

/**
 * Terms & Payment for the proposal (PR P): the stages when Money has no
 * schedule saved, and the validity period and Annexure A. Loaded once per
 * studio; until it arrives (or if it cannot be read) the defaults stand.
 */
export function useStudioTerms(tenantId: string | null | undefined, enabled = true) {
  const [terms, setTerms] = useState<{ paymentStructure: PaymentStructure | null; termsSettings: TermsSettings | null }>({ paymentStructure: null, termsSettings: null });
  useEffect(() => {
    if (!enabled || !tenantId) return;
    let live = true;
    (async () => {
      try {
        const { getPaymentStructure, getTermsSettings } = await import('../../services/engagementService');
        const [paymentStructure, termsSettings] = await Promise.all([
          getPaymentStructure(tenantId).catch(() => null),
          getTermsSettings(tenantId).catch(() => null),
        ]);
        if (live) setTerms({ paymentStructure, termsSettings });
      } catch { /* the defaults stand */ }
    })();
    return () => { live = false; };
  }, [enabled, tenantId]);
  return terms;
}
