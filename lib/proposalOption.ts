import { ProjectContext } from '../types';

/**
 * The option a Level 2 proposal is written for.
 *
 * Level 2 used to take the approved option and, with nothing approved, fall
 * back to the first one while still calling it "Approved option" — so a
 * proposal for an option nobody had approved told the client it was. The
 * studio now picks the option (`proposalOptionId`); without a pick it is the
 * approved option, then the first. Whether that option really is approved is
 * returned alongside, so the wording can say "approved" only when it is.
 */
export interface ProposalOption<T> {
  tier: T | undefined;
  /** The option is the project's approved baseline. */
  approved: boolean;
  /** Its position among the options, for "Option B". */
  index: number;
}

export function proposalOption<T extends { id: string }>(
  tiers: T[],
  ctx: Pick<ProjectContext, 'proposalOptionId' | 'approvedTierId'> | undefined,
): ProposalOption<T> {
  const byId = (id?: string) => (id ? tiers.find(t => t.id === id) : undefined);
  const tier = byId(ctx?.proposalOptionId) || byId(ctx?.approvedTierId) || tiers[0];
  return {
    tier,
    approved: !!tier && tier.id === ctx?.approvedTierId,
    index: tier ? tiers.indexOf(tier) : -1,
  };
}

/** "Option A", "Option B" … as the proposal names them. */
export const optionLabel = (index: number) => `Option ${String.fromCharCode(65 + Math.max(0, index))}`;

/**
 * A Level 2 heading written for one option, shown for another.
 *
 * "[Tier Name]" is the placeholder the template ships with. Older projects
 * saved the text with an option's name already in it, so "the X package"
 * naming another option is pointed at this one too. An option that is not
 * approved is not described as "the approved scope".
 */
export function forOption(text: string, optionName: string, otherNames: string[], approved: boolean): string {
  let out = text.split('[Tier Name]').join(optionName);
  otherNames
    .filter(n => n && n !== optionName)
    .forEach(n => { out = out.split(`the ${n} package`).join(`the ${optionName} package`); });
  if (!approved) out = out.replace(/\bapproved scope\b/g, 'proposed scope');
  return out;
}
