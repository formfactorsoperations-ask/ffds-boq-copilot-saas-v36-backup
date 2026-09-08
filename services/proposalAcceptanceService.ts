import { ProjectContext } from '../types';

/**
 * PROPOSAL ACCEPTANCE — the studio's own record that the client said yes.
 *
 * Deliberately standalone. It does NOT read or write
 * `lifecycle.gates.proposalAccepted`, which the journey engine owns and derives
 * from the project's own progression. Two writers on one field is how that gate
 * ended up meaning different things on different screens.
 *
 * So this is a separate indicator: ops records who accepted, how, and which
 * version of the numbers they were looking at. The journey continues to move on
 * its own terms; this simply says, on the record, that the commercials were
 * agreed — something the system previously had no way to express at all.
 *
 * Acceptance names WHAT was accepted. Without the tier and the figure,
 * "accepted" stops meaning anything the moment the scope is revised.
 */

export type AcceptanceChannel = 'portal' | 'email' | 'verbal' | 'written';

export const CHANNEL_LABEL: Record<AcceptanceChannel, string> = {
  portal: 'Accepted in the client portal',
  email: 'Accepted by email',
  verbal: 'Accepted verbally',
  written: 'Accepted on a signed document',
};

export interface ResolvedAcceptance {
  accepted: boolean;
  at: number | null;
  via: AcceptanceChannel | null;
  acceptedBy: string | null;
  tierId: string | null;
  tierName: string | null;
  amount: number | null;
  reference: string | null;
  recordedBy: string | null;
}

const EMPTY: ResolvedAcceptance = {
  accepted: false, at: null, via: null, acceptedBy: null,
  tierId: null, tierName: null, amount: null, reference: null, recordedBy: null,
};

/** What has actually been recorded — nothing is inferred from elsewhere. */
export function resolveProposalAcceptance(context: ProjectContext | undefined): ResolvedAcceptance {
  const rec = context?.proposalAcceptance;
  if (!rec || typeof rec.accepted !== 'boolean' || !rec.accepted) return EMPTY;
  return {
    accepted: true,
    at: rec.at ?? null,
    via: (rec.via as AcceptanceChannel) ?? null,
    acceptedBy: rec.acceptedBy ?? null,
    tierId: rec.tierId ?? null,
    tierName: rec.tierName ?? null,
    amount: rec.amount ?? null,
    reference: rec.reference ?? null,
    recordedBy: rec.recordedBy ?? null,
  };
}

export function recordProposalAcceptance(args: {
  via: AcceptanceChannel;
  acceptedBy: string;
  tierId?: string | null;
  tierName?: string | null;
  amount?: number | null;
  reference?: string | null;
  at?: number | null;
  recordedBy?: string | null;
}): (prev: ProjectContext) => ProjectContext {
  const now = Date.now();
  return (prev: ProjectContext): ProjectContext => ({
    ...prev,
    proposalAcceptance: {
      accepted: true,
      at: args.at ?? now,
      via: args.via,
      acceptedBy: args.acceptedBy || null,
      tierId: args.tierId ?? null,
      tierName: args.tierName ?? null,
      amount: args.amount ?? null,
      reference: args.reference || null,
      recordedBy: args.recordedBy || null,
      recordedAt: now,
    },
  });
}

/** Withdraw a record made in error. */
export function revokeProposalAcceptance(): (prev: ProjectContext) => ProjectContext {
  return (prev: ProjectContext): ProjectContext => ({
    ...prev,
    proposalAcceptance: {
      accepted: false, at: null, via: null, acceptedBy: null,
      tierId: null, tierName: null, amount: null, reference: null,
      recordedBy: null, recordedAt: Date.now(),
    },
  });
}
