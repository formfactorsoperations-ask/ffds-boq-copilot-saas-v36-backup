import { ProjectContext, ClientDocumentKind, DocumentState } from '../types';
import { resolveDocumentState, getCurrentIssue } from '../services/documentIssueEngine';

// ============================================================================
// DOCUMENT COMPLETENESS
//
// Six client documents, and the honest answer to "where are they".
//
// Two rules keep this from crying wolf, and both come from the app's own
// definitions rather than from a guess:
//
//   1. A DOCUMENT THAT IS NOT DUE YET IS NOT MISSING. `spineModel` already
//      records where each document sits in the lifecycle -- terms and payment
//      make stage 2 real, the execution agreement is the stage 4 gate, the
//      handover pair closes stage 6. Counting a handover docket against a lead
//      would put every project permanently in the red, and a meter that is
//      always red is a meter nobody reads.
//
//   2. NOT EVERY DOCUMENT IS SIGNED. Only terms, the execution agreement and
//      the handover docket carry an agreement record; the snag list carries the
//      client's signature on the issue itself. The payment schedule and the
//      onboarding kit are ISSUED and never signed -- `spineModel` calls marking
//      those "signature pending" a phantom task, and it was. For those two,
//      issued IS complete.
//
// State itself is not recomputed here. `resolveDocumentState` already handles
// addenda, reissue-after-signature, open queries and re-reads; duplicating that
// would guarantee the card and the reading room eventually disagree.
// ============================================================================

/** What the card shows, rolled up from the seven-state lifecycle. */
export type DocStatus =
  | 'not_due'    // lifecycle has not reached it
  | 'missing'    // due, never issued
  | 'draft'      // being prepared
  | 'issued'     // with the client, signature still owed
  | 'attention'  // queried, or amended after signing
  | 'complete';  // signed, executed, or issued where no signature is owed

export interface DocSlot {
  kind: ClientDocumentKind;
  /** Short enough for a card tooltip. */
  label: string;
  /** One word, for the ring's label list. */
  short: string;
  dueStage: number;
  needsSignature: boolean;
  state: DocumentState;
  status: DocStatus;
  detail: string;
}

export interface DocumentCompleteness {
  slots: DocSlot[];
  /** Documents the lifecycle has actually reached. */
  dueCount: number;
  completeCount: number;
  pct: number;
  /** Due but not complete, worst first. */
  outstanding: DocSlot[];
  /** The one line the project card has room for. */
  headline: string | null;
  /** Work is at or past the contract gate and the agreement is not signed. */
  unsignedContract: boolean;
}

interface DocDef {
  kind: ClientDocumentKind;
  label: string;
  short: string;
  dueStage: number;
  needsSignature: boolean;
}

/* Stages mirror spineModel's STAGE_OF_DOCUMENT. The snag list is absent there
   (it is cast rather than fully keyed); it gates handover, so it sits at 6. */
export const DOCUMENT_SLOTS: DocDef[] = [
  { kind: 'terms_docket',        label: 'Terms of engagement', short: 'Terms',      dueStage: 2, needsSignature: true  },
  { kind: 'payment_schedule',    label: 'Payment schedule',    short: 'Payment',    dueStage: 2, needsSignature: false },
  { kind: 'onboarding_kit',      label: 'Onboarding kit',      short: 'Onboarding', dueStage: 2, needsSignature: false },
  { kind: 'execution_agreement', label: 'Execution agreement', short: 'Contract',   dueStage: 4, needsSignature: true  },
  { kind: 'snag_list',           label: 'Snag list',           short: 'Snags',      dueStage: 6, needsSignature: true  },
  { kind: 'handover_docket',     label: 'Handover docket',     short: 'Handover',   dueStage: 6, needsSignature: true  },
];

const STATE_WORD: Record<DocumentState, string> = {
  draft: 'Not issued',
  issued: 'Issued, unopened',
  viewed: 'Read by the client',
  queried: 'Client has raised a query',
  amended: 'Amended since signature',
  signed: 'Signed',
  executed: 'Signed and counter-signed',
};

/** Worst first, so the headline names the thing that actually matters. */
const SEVERITY: Record<DocStatus, number> = {
  missing: 4, attention: 3, issued: 2, draft: 1, complete: 0, not_due: 0,
};

export function buildDocumentCompleteness(
  context: ProjectContext | null | undefined,
): DocumentCompleteness {
  const ctx: any = context || {};
  const stage: number = ctx?.lifecycle?.stage || ctx?.currentStage || 1;

  const slots: DocSlot[] = DOCUMENT_SLOTS.map(def => {
    const state: DocumentState = context
      ? resolveDocumentState(context, def.kind)
      : 'draft';
    const issue = context ? getCurrentIssue(context, def.kind) : null;
    const due = stage >= def.dueStage;

    let status: DocStatus;
    if (!due) {
      status = 'not_due';
    } else if (state === 'signed' || state === 'executed') {
      status = 'complete';
    } else if (state === 'queried' || state === 'amended') {
      status = 'attention';
    } else if (state === 'issued' || state === 'viewed') {
      // Issued is the finish line for anything the client never signs.
      status = def.needsSignature ? 'issued' : 'complete';
    } else {
      // 'draft' -- an issue exists only if the studio started one.
      status = issue ? 'draft' : 'missing';
    }

    const detail = !due
      ? `Not due until stage ${def.dueStage}`
      : status === 'missing'
        ? 'Due now, not issued'
        : STATE_WORD[state];

    return { ...def, state, status, detail };
  });

  const dueSlots = slots.filter(s => s.status !== 'not_due');
  const completeCount = dueSlots.filter(s => s.status === 'complete').length;
  const outstanding = dueSlots
    .filter(s => s.status !== 'complete')
    .sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status]);

  const contract = slots.find(s => s.kind === 'execution_agreement')!;
  const unsignedContract = contract.status !== 'not_due' && contract.status !== 'complete';

  let headline: string | null = null;
  if (unsignedContract) {
    headline = contract.status === 'missing'
      ? 'Execution agreement not issued'
      : contract.status === 'attention'
        ? 'Execution agreement amended since signing'
        : 'Execution agreement unsigned';
  } else if (outstanding.length === 1) {
    headline = `${outstanding[0].label} — ${outstanding[0].detail.toLowerCase()}`;
  } else if (outstanding.length > 1) {
    headline = `${outstanding.length} documents outstanding`;
  }

  return {
    slots,
    dueCount: dueSlots.length,
    completeCount,
    pct: dueSlots.length > 0 ? Math.round((completeCount / dueSlots.length) * 100) : 100,
    outstanding,
    headline,
    unsignedContract,
  };
}

/** Colours come from the shared report palette's semantics, as hex for pips. */
export const DOC_STATUS_COLOUR: Record<DocStatus, string> = {
  complete:  '#0E7C5A',
  issued:    '#0066CC',
  attention: '#C77700',
  draft:     '#94A3B8',
  missing:   '#B4436A',
  not_due:   '#E9EDF2',
};
