/**
 * BOQ Playground S2 — a line's specification, built from the Material specs bank.
 *
 * An Item Bank item names a recipe (carpentry, kitchen base units, vanity…).
 * The recipe says which material fills each part of the item at each option
 * grade. A new line takes, for its option's grade, each part's material at the
 * material's current version, and its words are written from them to `specs`,
 * so every PDF, export and portal screen reads them as it reads typed words.
 *
 * A line keeps the versions it was given. When the Owner saves a newer version
 * of a material, a draft option is offered the update ("v2 → v3", Update); an
 * option sent to the client, signed or frozen is never offered it, and its
 * words never change. Words typed by hand (`specsOwn`) stop following.
 *
 * The outer finish is the one part that prices the piece: its version carries
 * a cost factor, applied to the line's materials rate (lib/playground/finishes).
 *
 * A version priced as a range (PR M) is named as one in the words ("any of
 * 250+ shades"). A part may carry a `shade` from the range: it is named in the
 * words and colours the drawing, and never changes the price.
 *
 * Pure.
 */
import type { Item, BoqItem, ProposalTier, ProjectContext, LineMaterialSpec } from '../types';
import {
  currentVersion, versionAt, type Grade, type MaterialRange, type MaterialSpecsBank, type Recipe, type RecipePart,
} from './materialSpecs';
import { drawOf } from './playground/pieces';
import { finishUpdates, finishBaseOf } from './playground/finishes';
import { lockedTierId } from './scopeFlow';

/** What a part's words get after them: "18 mm BWR-grade plywood carcass". */
const SUFFIX: Record<string, string> = {
  Carcass: ' carcass', 'Base board': ' base', 'Outer finish': ' outside', 'Inner finish': ' inside', Shutters: ' shutters', Countertop: ' counter',
};
/** Brands not worth naming to a client. */
const PLAIN_BRAND = /local|branded/i;

/* ───────────────────────────── recipes and grades ───────────────────────────── */

/** The recipe an item of this kind would usually take, if any. Loose furniture takes none. */
export function suggestedRecipeId(item: Pick<Item, 'name' | 'cat' | 'draw'> | null | undefined): string | null {
  if (!item) return null;
  const kind = drawOf(item)?.kind;
  switch (kind) {
    case 'wardrobe': case 'cabinet': case 'tv': case 'desk': case 'loft': return 'carp';
    case 'panel': return 'panel';
    case 'base': return 'kitchen';
    case 'wallunit': return 'wall';
    case 'vanity': return 'vanity';
    case 'glass': return 'glass';
    default: break;
  }
  const text = `${item.name || ''} ${item.cat || ''}`;
  if (/false\s*ceiling|gypsum|pop\s*ceiling/i.test(text)) return 'ceil';
  if (/paint|emulsion/i.test(text)) return 'paint';
  if (/switch|wiring|electrical\s*point|points/i.test(text) && !/light\s*fitting/i.test(text)) return 'elec';
  return null;
}

/** The item's recipe: the one it names, else the suggestion for its kind; none when it says none. */
export function recipeOf(item: Pick<Item, 'name' | 'cat' | 'draw' | 'recipeId'> | null | undefined, bank: MaterialSpecsBank): Recipe | null {
  if (!item || item.recipeId === null) return null;
  const id = typeof item.recipeId === 'string' && item.recipeId ? item.recipeId : suggestedRecipeId(item);
  return (id && bank.recipes[id]) || null;
}

/** The option's grade: its own, else read from its name, else Comfort. */
export function gradeOf(tier: Pick<ProposalTier, 'name' | 'specGrade'> | null | undefined): Grade {
  if (tier?.specGrade) return tier.specGrade;
  const n = tier?.name || '';
  if (/essential/i.test(n)) return 'E';
  if (/complete|harmony|premium|luxury/i.test(n)) return 'P';
  return 'C';
}

/** The recipe's outer-finish part, if it has one. */
export const finishPartOf = (recipe: Recipe | null | undefined): RecipePart | undefined => recipe?.parts.find(p => p.finish);

/** Each part's material at the grade, at its current version. */
export function specsFromRecipe(bank: MaterialSpecsBank, recipe: Recipe, grade: Grade): Record<string, LineMaterialSpec> {
  const out: Record<string, LineMaterialSpec> = {};
  recipe.parts.forEach(p => {
    const id = p.byGrade[grade];
    const v = currentVersion(bank, id)?.v;
    if (id && v) out[p.part] = { id, v };
  });
  return out;
}

/* ───────────────────────────── words ───────────────────────────── */

/** The range a part is priced as, at its version: none on a version that is a single spec. */
export const rangeOf = (bank: MaterialSpecsBank, spec: LineMaterialSpec | null | undefined): MaterialRange | undefined =>
  (spec ? versionAt(bank, spec.id, spec.v)?.range : undefined);

/**
 * One part in words: "18 mm BWR-grade plywood carcass (Century Club equivalent)".
 * A part priced as a range names it: "1 mm textured designer laminate outside,
 * any of 250+ shades (Merino · Greenlam · Royale Touche)", or with a shade
 * picked, "…outside, Smoked oak or any of 250+ shades (…)".
 */
export function partWords(bank: MaterialSpecsBank, part: string, spec: LineMaterialSpec): string {
  const h = versionAt(bank, spec.id, spec.v);
  if (!h) return '';
  const brand = h.brand && !PLAIN_BRAND.test(h.brand) ? ` (${h.brand})` : '';
  const r = h.range;
  const range = r ? `, ${spec.shade ? `${spec.shade} or any` : 'any'} of ${Number(r.count).toLocaleString('en-IN')}+ ${r.unit}` : '';
  return `${h.words}${SUFFIX[part] || ''}${range}${brand}`;
}

/** The words a line's materials make, as the client reads them. */
export function composeWords(bank: MaterialSpecsBank, specs: Record<string, LineMaterialSpec> | null | undefined): string {
  const parts = Object.entries(specs || {}).map(([part, s]) => partWords(bank, part, s)).filter(Boolean);
  if (!parts.length) return '';
  const t = parts.join('; ');
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
}

/* ───────────────────────────── pricing a finish ───────────────────────────── */

/** The cost factor of a material at a version: an outer finish's, else 1. */
export const costFactorOf = (bank: MaterialSpecsBank, spec: LineMaterialSpec | null | undefined) =>
  (spec ? Number(versionAt(bank, spec.id, spec.v)?.costFactor) || 1 : 1);

/**
 * What the client's amount moves by if the finish part takes `mat` (at its
 * current version): the materials rate before any finish × the change in the
 * factor, marked up, × the quantity.
 */
export function finishDelta(bank: MaterialSpecsBank, line: BoqItem, item: Item | undefined, part: string, mat: string, markup: number, qty: number): number {
  const cur = line.materialSpecs?.[part];
  const next = currentVersion(bank, mat);
  if (!next) return 0;
  return finishBaseOf(line, item) * ((Number(next.costFactor) || 1) - costFactorOf(bank, cur)) * (1 + (Number(markup) || 0) / 100) * (Number(qty) || 0);
}

/* ───────────────────────────── lines ───────────────────────────── */

/** The words and pricing that follow from a line's materials. Own words are kept. */
function settle(bank: MaterialSpecsBank, line: BoqItem, item: Item | undefined, recipe: Recipe | null): BoqItem {
  let next: BoqItem = line;
  if (!line.specsOwn) next = { ...next, specs: composeWords(bank, line.materialSpecs) };
  const fin = finishPartOf(recipe);
  const spec = fin && line.materialSpecs?.[fin.part];
  if (spec) {
    const f = costFactorOf(bank, spec);
    const u = finishUpdates(next, item, f);
    if (u && (f !== 1 || next.finishBase != null)) next = { ...next, ...u };
  }
  return next;
}

/**
 * A new line from an item, with its parts from the item's recipe at the
 * option's grade, its words, and its finish priced. An item with no recipe
 * keeps the Item Bank's words, as today.
 */
export function withRecipeSpecs(line: BoqItem, item: Item | undefined, bank: MaterialSpecsBank | null | undefined, grade: Grade): BoqItem {
  if (!bank || !item) return line;
  const recipe = recipeOf(item, bank);
  if (!recipe) return line;
  const materialSpecs = specsFromRecipe(bank, recipe, grade);
  if (!Object.keys(materialSpecs).length) return line;
  return settle(bank, { ...line, materialSpecs, specsOwn: undefined }, item, recipe);
}

/** The parts of a line on an older version than the bank's current one. */
export function staleParts(bank: MaterialSpecsBank, line: Pick<BoqItem, 'materialSpecs'>): string[] {
  return Object.entries(line.materialSpecs || {})
    .filter(([, s]) => (currentVersion(bank, s.id)?.v || 0) > s.v)
    .map(([part]) => part);
}

/** The line with every part on its material's current version, words written again (unless its own). */
export function updatedLine(bank: MaterialSpecsBank, line: BoqItem, item: Item | undefined): BoqItem {
  if (!line.materialSpecs || !staleParts(bank, line).length) return line;
  const materialSpecs: Record<string, LineMaterialSpec> = {};
  Object.entries(line.materialSpecs).forEach(([part, s]) => {
    materialSpecs[part] = { ...s, v: currentVersion(bank, s.id)?.v || s.v };
  });
  return settle(bank, { ...line, materialSpecs }, item, item ? recipeOf(item, bank) : null);
}

/** The line with one part changed to another material, at its current version. */
export function withPart(bank: MaterialSpecsBank, line: BoqItem, item: Item | undefined, part: string, mat: string): BoqItem {
  const v = currentVersion(bank, mat)?.v;
  if (!v || !line.materialSpecs?.[part]) return line;
  const materialSpecs = { ...line.materialSpecs, [part]: { id: mat, v } };
  return settle(bank, { ...line, materialSpecs }, item, item ? recipeOf(item, bank) : null);
}

/**
 * The line shown in a shade of its range: the words name it, the drawing takes
 * its colour, and the price does not move (every shade in a range costs the
 * same). `null` leaves the shade for Selections.
 */
export function withShade(bank: MaterialSpecsBank, line: BoqItem, item: Item | undefined, part: string, shade: string | null): BoqItem {
  const s = line.materialSpecs?.[part];
  if (!s || !rangeOf(bank, s)) return line;
  const { shade: _old, ...rest } = s;
  const materialSpecs = { ...line.materialSpecs, [part]: shade ? { ...rest, shade } : rest };
  return settle(bank, { ...line, materialSpecs }, item, item ? recipeOf(item, bank) : null);
}

/** The colour a part is shown in: its shade's, when one is picked from the range's examples. */
export function shadeHexOf(bank: MaterialSpecsBank, spec: LineMaterialSpec | null | undefined): string | undefined {
  if (!spec?.shade) return undefined;
  return rangeOf(bank, spec)?.examples.find(e => e.name === spec.shade)?.hex;
}

/** "Write my own": the words as they are now, kept by hand from here on. */
export const withOwnWords = (line: BoqItem, words?: string): BoqItem =>
  ({ ...line, specsOwn: true, ...(words != null ? { specs: words } : {}) });

/** "Back to the recipe": the words follow the materials again. */
export function withRecipeWords(bank: MaterialSpecsBank, line: BoqItem): BoqItem {
  const { specsOwn: _o, ...rest } = line;
  return { ...rest, specs: composeWords(bank, line.materialSpecs) } as BoqItem;
}

/* ───────────────────────────── who is offered an update ───────────────────────────── */

/** Options the client has been sent or has signed: their lines stay on their versions. */
export function sentTierIds(ctx: Pick<ProjectContext, 'documents'> & Partial<ProjectContext> | null | undefined): Set<string> {
  const out = new Set<string>();
  ((ctx as any)?.documents?.issues || []).forEach((i: any) => { const t = i?.snapshot?.tierId; if (t) out.add(String(t)); });
  const locked = lockedTierId(ctx as ProjectContext);
  if (locked) out.add(locked);
  /* The version the first proposal went out on (PR P). */
  const p = (ctx as any)?.proposal;
  if (p?.issuedAt && p.tierId) out.add(String(p.tierId));
  return out;
}

/** True when this option may take newer versions: a draft, not frozen, not sent, not signed. */
export function offersUpdates(tier: Pick<ProposalTier, 'id'> | null | undefined, ctx: Partial<ProjectContext> | null | undefined, frozen: boolean): boolean {
  if (!tier || frozen) return false;
  return !sentTierIds(ctx as any).has(tier.id);
}
