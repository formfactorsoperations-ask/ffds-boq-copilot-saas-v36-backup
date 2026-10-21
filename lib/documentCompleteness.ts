import { ProjectContext, ClientDocumentKind, DocumentState } from '../types';
import { resolveDocumentState, getCurrentIssue } from '../services/documentIssueEngine';
import { isVisibleToClient } from './clientVisibility';

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
//   2. NOT EVERY DOCUMENT IS SIGNED, BUT EVERY ONE IS SIGNED OFF. Terms, the
//      execution agreement, the snag list and the handover docket take the
//      client's signature. The payment schedule and the onboarding kit take a
//      one-tick confirmation instead (`documentReleaseEngine` calls this
//      'acknowledge' mode), written onto the issue the same way. Neither is
//      done until the client has done their part. This used to count those two
//      as complete the moment they were sent, so the card said "signed" about
//      documents the client had never confirmed, and disagreed with the
//      Documents board and the client's own portal about the same project.
//
//   3. STAGED IS NOT SENT. An issue ops has prepared but not yet published is
//      invisible to the client, so it is still on the studio's desk. The
//      Documents board already reads it that way; so does this.
//
// State itself is not recomputed here. `resolveDocumentState` already handles
// addenda, reissue-after-signature, open queries and re-reads; duplicating that
// would guarantee the card and the reading room eventually disagree.
// ============================================================================

/** What the card shows, rolled up from the seven-state lifecycle. */
export type DocStatus =
  | 'not_due'    // lifecycle has not reached it
  | 'missing'    // due, never issued
  | 'draft'      // being prepared, or staged but not published
  | 'issued'     // with the client, signature or confirmation still owed
  | 'attention'  // queried, or amended after signing
  | 'complete';  // signed, executed, or confirmed by the client

/** What the client owes on the document: a signature, or a confirmation. */
export type SignOff = 'signature' | 'confirmation';

export interface DocSlot {
  kind: ClientDocumentKind;
  /** Short enough for a card tooltip. */
  label: string;
  /** One word, for the ring's label list. */
  short: string;
  dueStage: number;
  signOff: SignOff;
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
  signOff: SignOff;
}

/* Stages mirror spineModel's STAGE_OF_DOCUMENT. The snag list is absent there
   (it is cast rather than fully keyed); it gates handover, so it sits at 6. */
export const DOCUMENT_SLOTS: DocDef[] = [
  { kind: 'terms_docket',        label: 'Terms of engagement', short: 'Terms',      dueStage: 2, signOff: 'signature'    },
  { kind: 'payment_schedule',    label: 'Payment schedule',    short: 'Payment',    dueStage: 2, signOff: 'confirmation' },
  { kind: 'onboarding_kit',      label: 'Onboarding kit',      short: 'Onboarding', dueStage: 2, signOff: 'confirmation' },
  { kind: 'execution_agreement', label: 'Execution agreement', short: 'Contract',   dueStage: 4, signOff: 'signature'    },
  { kind: 'snag_list',           label: 'Snag list',           short: 'Snags',      dueStage: 6, signOff: 'signature'    },
  { kind: 'handover_docket',     label: 'Handover docket',     short: 'Handover',   dueStage: 6, signOff: 'signature'    },
];

/* Says what the client still owes, not only where the document sits, so a
   tooltip or headline never reads as finished while a sign-off is outstanding. */
const STATE_WORD: Record<SignOff, Record<DocumentState, string>> = {
  signature: {
    draft: 'Not issued',
    issued: 'Sent, not yet opened or signed',
    viewed: 'Read by the client, not yet signed',
    queried: 'Client has raised a query',
    amended: 'Amended since signature, signature owed again',
    signed: 'Signed by the client',
    executed: 'Signed and counter-signed',
  },
  confirmation: {
    draft: 'Not issued',
    issued: 'Sent, not yet opened or confirmed',
    viewed: 'Read by the client, not yet confirmed',
    queried: 'Client has raised a query',
    amended: 'Reissued since confirmation, confirmation owed again',
    signed: 'Confirmed by the client',
    executed: 'Confirmed by the client',
  },
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

    /* Mirrors the Documents board's "staged" test: only a stored issue can be
       staged, and a signed one is settled whatever happens to it next. */
    const stored = !!issue && (context?.documents?.issues || []).some(i => i.id === issue.id);
    const staged = stored && !isVisibleToClient(issue as any)
      && state !== 'signed' && state !== 'executed';

    let status: DocStatus;
    if (!due) {
      status = 'not_due';
    } else if (state === 'signed' || state === 'executed') {
      status = 'complete';
    } else if (staged) {
      status = 'draft';
    } else if (state === 'queried' || state === 'amended') {
      status = 'attention';
    } else if (state === 'issued' || state === 'viewed') {
      // With the client. Sent is not signed off, whichever kind of sign-off it is.
      status = 'issued';
    } else {
      // 'draft' -- an issue exists only if the studio started one.
      status = issue ? 'draft' : 'missing';
    }

    const detail = !due
      ? `Not due until stage ${def.dueStage}`
      : status === 'missing'
        ? 'Due now, not issued'
        : staged
          ? 'Prepared, not yet published to the client'
          : STATE_WORD[def.signOff][state];

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
  issued:    '#3D52A0',
  attention: '#C77700',
  draft:     '#94A3B8',
  missing:   '#B4436A',
  not_due:   '#E9EDF2',
};
