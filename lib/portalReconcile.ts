/**
 * Recovering client actions that the project document lost.
 *
 * A project is stored twice and the portal keeps a third copy — the projection
 * at projects/{id}/portalView/current. For a period, the submitClientAction
 * callable wrote only one of the two project documents, and the loader let the
 * other one win: every confirmation, signature, dispute and question raised
 * from the real portal was discarded on the next load, then written back over
 * both copies by the studio's auto-save.
 *
 * The projection was never in that path. Nothing but a Release rewrites it, so
 * it still holds what the client did even where the project forgot. That makes
 * it the only surviving record, and this reads it back.
 *
 * The rules for who owns what are not restated here. `mergeClientOwned` already
 * encodes them and is what the live app uses, so this asks it for the merged
 * result and then describes the difference. A finding therefore cannot claim
 * something the apply step would not actually do — the two are the same
 * computation, read twice.
 */

import { mergeClientOwned } from './clientOwned';

export interface ReconcileFinding {
  area: 'Finish' | 'Document' | 'Sign-off';
  label: string;
  detail: string;
}

export interface PortalDrift {
  findings: ReconcileFinding[];
  /** The context to store. Already merged; the caller only has to save it. */
  merged: any;
}

const asDate = (v: any): string => {
  const t = Date.parse(String(v || ''));
  if (!t) return '';
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const on = (v: any): string => {
  const d = asDate(v);
  return d ? ` on ${d}` : '';
};

const quote = (s: any): string => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
};

const issueLabel = (i: any): string =>
  i?.title || i?.name || i?.docType || i?.kind || i?.id || 'Document';

const SIGNOFFS: { key: string; label: string }[] = [
  { key: 'designAgreementSignoff', label: 'Design agreement' },
  { key: 'executionSignoff', label: 'Execution start' },
  { key: 'handoverSignoff', label: 'Handover' },
];

function describe(before: any, after: any): ReconcileFinding[] {
  const found: ReconcileFinding[] = [];
  const push = (area: ReconcileFinding['area'], label: string, detail: string) =>
    found.push({ area, label, detail });

  // ── finishes ────────────────────────────────────────────────────────
  const wasById = new Map<string, any>(
    (before?.materialSelections || []).map((m: any) => [m.id, m]),
  );
  (after?.materialSelections || []).forEach((m: any) => {
    const was = wasById.get(m.id);
    if (!was) return;
    const label = m.itemName || m.id;

    if (m.clientConfirmedAt && !was.clientConfirmedAt) {
      push('Finish', label, `confirmed by the client${on(m.clientConfirmedAt)}`);
    }
    if (m.changeReason && m.changeReason !== was.changeReason) {
      push('Finish', label, `question${on(m.changeRequestedAt)} — “${quote(m.changeReason)}”`);
    }
  });

  // ── documents ───────────────────────────────────────────────────────
  const wasIssues = new Map<string, any>(
    (before?.documents?.issues || []).map((i: any) => [i.id, i]),
  );
  (after?.documents?.issues || []).forEach((i: any) => {
    const was = wasIssues.get(i.id);
    if (!was) {
      push('Document', issueLabel(i), 'an issue the project no longer held');
      return;
    }
    if (i.clientSignature && !was.clientSignature) {
      push('Document', issueLabel(i), `signed by the client${on(i.clientSignature?.signedAt || i.clientSignature?.at)}`);
    }
  });

  const queriesWas = (before?.documents?.queries || []).length;
  const queriesNow = (after?.documents?.queries || []).length;
  if (queriesNow > queriesWas) {
    const n = queriesNow - queriesWas;
    push('Document', 'Clause queries', `${n} quer${n === 1 ? 'y' : 'ies'} raised by the client`);
  }

  /*
    A view stamp is worth restoring but not worth a line of its own per
    document — "they opened it" is one fact however many times it is recorded.
  */
  if (JSON.stringify(before?.documents?.lastViewedAt || {}) !== JSON.stringify(after?.documents?.lastViewedAt || {})) {
    push('Document', 'Opened-by-client stamps', 'when the client last opened what was issued');
  }

  // ── sign-offs ───────────────────────────────────────────────────────
  SIGNOFFS.forEach(({ key, label }) => {
    if (JSON.stringify(before?.[key]) === JSON.stringify(after?.[key])) return;
    const status = after?.[key]?.status;
    push('Sign-off', label, `${status ? `${status} ` : ''}acknowledgement${on(after?.[key]?.signedAt || after?.[key]?.at)}`);
  });

  return found;
}

/**
 * What the projection holds that the project does not.
 *
 * Returns null when they agree — which is the common case and the one worth
 * making cheap, since a sweep runs over every project.
 */
export function findPortalDrift(context: any, viewContext: any): PortalDrift | null {
  if (!context || !viewContext) return null;

  /* Identity, not deep equality: mergeClientOwned returns its first argument
     unchanged when there is nothing to carry across. */
  const merged = mergeClientOwned(context, viewContext);
  if (merged === context) return null;

  const findings = describe(context, merged);

  /*
    A merge that changed something no line describes still has to be applied —
    but it must not be reported as an empty result, which would read as "no
    drift" beside a project the sweep is about to rewrite.
  */
  if (!findings.length) {
    findings.push({ area: 'Finish', label: 'Client record', detail: 'differences the portal holds and the project does not' });
  }

  return { merged, findings };
}
