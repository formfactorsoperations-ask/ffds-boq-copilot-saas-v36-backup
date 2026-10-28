import { ProjectContext } from '../types';

/**
 * The studio's edits to an option's material specifications, kept with the
 * option rather than its name.
 *
 * Edits were stored as overrides[category][option name], so renaming an
 * option ("Comfort Upgrade (Copy)" to "Comfort Upgrade - Optimized") left
 * them behind under the old name and the proposal fell back to the generated
 * specs. They are now stored under the option's id. Edits saved under a name
 * before this still read, and move to the id when the option is renamed.
 */

type Overrides = Record<string, Record<string, string>>;
type Option = { id?: string; name: string };

/** The edited value for one category of one option, if there is one. */
export function specOverride(overrides: Overrides | undefined, category: string, option: Option): string | undefined {
  const row = overrides?.[category];
  if (!row) return undefined;
  return (option.id && row[option.id] !== undefined) ? row[option.id] : row[option.name];
}

/** The edits with `value` stored for this option, under its id. */
export function withSpecOverride(overrides: Overrides | undefined, category: string, option: Option, value: string): Overrides {
  const row = { ...(overrides?.[category] || {}) };
  if (option.id) {
    row[option.id] = value;
    // The same edit under the name would come back if the option took that name again.
    delete row[option.name];
  } else {
    row[option.name] = value;
  }
  return { ...(overrides || {}), [category]: row };
}

/** Edits saved under `oldName`, moved to the option's id. An edit already under the id wins. */
function rekeyed(overrides: Overrides, tierId: string, oldName: string): Overrides {
  let changed = false;
  const out: Overrides = {};
  Object.entries(overrides).forEach(([category, row]) => {
    if (row && oldName in row) {
      const { [oldName]: value, ...rest } = row;
      out[category] = tierId in rest ? rest : { ...rest, [tierId]: value };
      changed = true;
    } else {
      out[category] = row;
    }
  });
  return changed ? out : overrides;
}

/** The project once the option `tierId`, until now called `oldName`, has been renamed. */
export function contextWithTierRenamed(ctx: ProjectContext, tierId: string, oldName: string): ProjectContext {
  const moveIn = (content: any) => {
    const overrides = content?.materials?.overrides;
    if (!overrides) return content;
    const next = rekeyed(overrides, tierId, oldName);
    return next === overrides ? content : { ...content, materials: { ...content.materials, overrides: next } };
  };

  const proposalContent = moveIn(ctx.proposalContent);
  const byMode = ctx.proposalContentByMode;
  let proposalContentByMode = byMode;
  if (byMode) {
    const entries = Object.entries(byMode).map(([mode, content]) => [mode, moveIn(content)] as const);
    if (entries.some(([mode, content]) => content !== (byMode as any)[mode])) proposalContentByMode = Object.fromEntries(entries) as any;
  }
  if (proposalContent === ctx.proposalContent && proposalContentByMode === byMode) return ctx;
  return { ...ctx, proposalContent, proposalContentByMode };
}
