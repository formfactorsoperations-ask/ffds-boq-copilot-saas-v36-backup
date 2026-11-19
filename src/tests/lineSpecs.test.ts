import { describe, it, expect } from 'vitest';
import { studioStandard, withStandard, seedFromPackages, saveNewVersion, setRecipePart, versionsAppendOnly, currentVersion, newVersionProblem, RANGE_NOTE } from '../../lib/materialSpecs';
import {
  suggestedRecipeId, recipeOf, gradeOf, specsFromRecipe, composeWords, withRecipeSpecs, staleParts, updatedLine,
  withPart, withOwnWords, withRecipeWords, finishDelta, offersUpdates, sentTierIds, withShade, shadeHexOf, rangeOf,
} from '../../lib/lineSpecs';
import { lineAmount } from '../../lib/playground/pricing';
import { PLAYGROUND_PRICING } from '../../lib/playground/pricing';

const bank = studioStandard();
const wardrobe: any = { id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: 'Typed words', materials: 1000, labor: 400, margin: 25 };
const sofa: any = { id: 's', name: 'Three-seater sofa', cat: 'Furniture', unit: 'nos', specs: 'Linen', materials: 50000, labor: 0, margin: 20 };
const line = (o: any = {}) => ({ id: 'l1', bankId: 'w', qty: 40, roomId: 'Bedroom', baseRate: 1000, ...o });

describe('the studio standard', () => {
  it('holds the mockup’s families, materials at v1, finishes, tops and paint as ranges at v2, and recipes', () => {
    expect(bank.families.map(f => f.name)).toEqual(['Plywood & boards', 'Outer finishes', 'Inner finishes', 'Hardware', 'Handles', 'Countertops', 'Glass & mirror', 'Paint', 'False ceiling', 'Electrical']);
    expect(bank.versions.filter(v => v.v === 1)).toHaveLength(bank.materials.length);
    expect(bank.versions.filter(v => v.v === 2).map(v => v.mat)).toEqual(['lam-ash', 'lam-oak', 'ven-walnut', 'lam-graphite', 'acr-ivory', 'top-granite', 'top-quartz', 'pt-tractor', 'pt-royale']);
    expect(bank.versions.filter(v => v.v === 1).every(v => !v.range)).toBe(true);
    expect(Object.keys(bank.recipes)).toEqual(['carp', 'panel', 'kitchen', 'wall', 'vanity', 'glass', 'ceil', 'paint', 'elec']);
    expect(bank.versions.find(v => v.mat === 'ven-walnut')!.costFactor).toBe(1.3);
  });

  it('a bank saved before recipes gets the standard added after it, append-only', () => {
    const old = seedFromPackages();
    const merged = withStandard(old);
    expect(versionsAppendOnly(old, merged)).toBe(true);
    expect(merged.recipes.carp).toBeTruthy();
    expect(merged.materials.slice(0, old.materials.length)).toEqual(old.materials);
  });

  it('a recipe part only takes a material of its own family', () => {
    const b = setRecipePart(bank, 'carp', 'Hardware', 'C', 'hw-hettich', 'Owner', 5);
    expect(b.recipes.carp.parts.find(p => p.part === 'Hardware')!.byGrade.C).toBe('hw-hettich');
    expect(() => setRecipePart(bank, 'carp', 'Hardware', 'C', 'ply-mr', 'Owner', 5)).toThrow(/own family/);
  });
});

describe('recipes and grades', () => {
  it('suggests a recipe by kind; loose furniture takes none; an item can say none', () => {
    expect(suggestedRecipeId(wardrobe)).toBe('carp');
    expect(suggestedRecipeId({ name: 'Kitchen base unit', cat: 'Modular Kitchen' } as any)).toBe('kitchen');
    expect(suggestedRecipeId({ name: 'Wall painting', cat: 'Painting' } as any)).toBe('paint');
    expect(suggestedRecipeId(sofa)).toBeNull();
    expect(recipeOf({ ...wardrobe, recipeId: null }, bank)).toBeNull();
    expect(recipeOf({ ...wardrobe, recipeId: 'panel' }, bank)!.id).toBe('panel');
  });

  it('reads the grade from the option', () => {
    expect(gradeOf({ name: 'Essential Elegance' })).toBe('E');
    expect(gradeOf({ name: 'Comfort Upgrade' })).toBe('C');
    expect(gradeOf({ name: 'Complete Harmony' })).toBe('P');
    expect(gradeOf({ name: 'Option B', specGrade: 'P' })).toBe('P');
    expect(gradeOf({ name: 'Option B' })).toBe('C');
  });
});

describe('a new line', () => {
  it('takes each part at the grade, at the current version, and its words', () => {
    const l = withRecipeSpecs(line() as any, wardrobe, bank, 'C');
    expect(l.materialSpecs).toEqual({
      Carcass: { id: 'ply-bwr', v: 1 }, 'Outer finish': { id: 'lam-oak', v: 2 }, 'Inner finish': { id: 'in-white', v: 1 },
      Hardware: { id: 'hw-ss', v: 1 }, Handles: { id: 'hd-profile', v: 1 },
    });
    expect(l.specs).toBe('18 mm BWR-grade plywood carcass (Century Club equivalent); 1 mm textured designer laminate outside, any of 250+ shades (Merino · Greenlam · Royale Touche); 0.8 mm white laminate inside (Merino equivalent); soft-close stainless steel hinges and telescopic channels (Ebco equivalent); concealed aluminium profile handles (Hettich equivalent).');
    expect(l.baseRate).toBe(1000);
  });

  it('an Essential line takes the standard laminate and its cost factor on materials', () => {
    const l = withRecipeSpecs(line() as any, wardrobe, bank, 'E');
    expect(l.materialSpecs!['Outer finish'].id).toBe('lam-ash');
    expect(l.baseRate).toBe(850);
    expect(l.finishBase).toBe(1000);
    expect(l.specs!.startsWith('18 mm MR-grade plywood carcass')).toBe(true);
    expect(l.specs).toContain('brushed steel knobs');
    expect(l.specs).not.toContain('local make');
  });

  it('an item with no recipe keeps the Item Bank’s words', () => {
    const l = withRecipeSpecs({ id: 'x', bankId: 's', qty: 1 } as any, sofa, bank, 'C');
    expect(l.materialSpecs).toBeUndefined();
    expect(l.specs).toBeUndefined();
  });
});

describe('versions', () => {
  const l = withRecipeSpecs(line() as any, wardrobe, bank, 'C');
  const v2 = saveNewVersion(bank, 'hw-ss', { words: 'soft-close hinges and Hafele channels', brand: 'Hafele equivalent', note: 'Hafele named' }, 'Owner', 10);

  it('a new version leaves existing lines’ words unchanged, byte for byte', () => {
    const before = JSON.stringify(l);
    expect(staleParts(v2, l)).toEqual(['Hardware']);
    expect(JSON.stringify(l)).toBe(before);
    expect(composeWords(v2, l.materialSpecs)).toBe(l.specs);
  });

  it('Update takes the line to the current versions and rewrites its words', () => {
    const u = updatedLine(v2, l, wardrobe);
    expect(u.materialSpecs!.Hardware).toEqual({ id: 'hw-ss', v: 2 });
    expect(u.specs).toContain('soft-close hinges and Hafele channels (Hafele equivalent)');
    expect(staleParts(v2, u)).toEqual([]);
  });

  it('own words do not follow an update; Back to the recipe writes them again', () => {
    const own = withOwnWords(l, 'As discussed on site.');
    const u = updatedLine(v2, own, wardrobe);
    expect(u.specs).toBe('As discussed on site.');
    expect(u.materialSpecs!.Hardware.v).toBe(2);
    const back = withRecipeWords(v2, u);
    expect(back.specsOwn).toBeUndefined();
    expect(back.specs).toContain('Hafele');
  });

  it('only a draft is offered the update: not frozen, not sent, not signed', () => {
    const ctx: any = { documents: { issues: [{ kind: 'proposal', snapshot: { tierId: 't-sent' } }] } };
    expect(sentTierIds(ctx).has('t-sent')).toBe(true);
    expect(offersUpdates({ id: 't1' }, ctx, false)).toBe(true);
    expect(offersUpdates({ id: 't-sent' }, ctx, false)).toBe(false);
    expect(offersUpdates({ id: 't1' }, ctx, true)).toBe(false);
  });
});

describe('parts and finishes', () => {
  const l = withRecipeSpecs(line() as any, wardrobe, bank, 'C');

  it('changing a part rewrites the words', () => {
    const h = withPart(bank, l, wardrobe, 'Hardware', 'hw-hettich');
    expect(h.materialSpecs!.Hardware).toEqual({ id: 'hw-hettich', v: 1 });
    expect(h.specs).toContain('tandem drawer runners (Hettich)');
  });

  it('a finish prices the piece on its materials, and never stacks', () => {
    const walnut = withPart(bank, l, wardrobe, 'Outer finish', 'ven-walnut');
    expect(walnut.baseRate).toBe(1300);
    expect(walnut.finishBase).toBe(1000);
    const ash = withPart(bank, walnut, wardrobe, 'Outer finish', 'lam-ash');
    expect(ash.baseRate).toBe(850);
    const back = withPart(bank, ash, wardrobe, 'Outer finish', 'lam-oak');
    expect(back.baseRate).toBe(1000);
  });

  it('a finish tile says what the amount moves by', () => {
    // 1000 materials × (1.3 − 1) × 1.25 markup × 40 sq ft
    expect(finishDelta(bank, l as any, wardrobe, 'Outer finish', 'ven-walnut', 25, 40)).toBeCloseTo(15000);
    expect(finishDelta(bank, l as any, wardrobe, 'Outer finish', 'lam-oak', 25, 40)).toBe(0);
  });
});

describe('materials as ranges (PR M)', () => {
  /* The bank as a studio saved it before ranges: every material at v1. */
  const saved = { ...bank, versions: bank.versions.filter(v => v.v === 1) };
  const onV1 = withRecipeSpecs(line() as any, wardrobe, saved, 'C');
  const merged = withStandard(saved);

  it('arrive as v2 of each finish, top and paint, appended to a saved bank', () => {
    expect(versionsAppendOnly(saved, merged)).toBe(true);
    expect(currentVersion(merged, 'lam-oak')).toMatchObject({ v: 2, note: RANGE_NOTE, words: '1 mm textured designer laminate', costFactor: 1, range: { count: 250, unit: 'shades' } });
    expect(currentVersion(merged, 'pt-royale')!.range!.count).toBe(1800);
    expect(currentVersion(merged, 'hw-ss')!.v).toBe(1);
    // Applying it again adds nothing.
    expect(withStandard(merged).versions).toHaveLength(merged.versions.length);
  });

  it('a material the Owner moved on keeps their words; the range is added on top', () => {
    const own = saveNewVersion(saved, 'lam-oak', { words: '1 mm Merino designer laminate', note: 'Merino named', costFactor: 1.1 }, 'Owner', 9);
    const m = withStandard(own);
    expect(currentVersion(m, 'lam-oak')).toMatchObject({ v: 3, words: '1 mm Merino designer laminate', costFactor: 1.1, range: { count: 250 } });
  });

  it('lines on v1 keep their words', () => {
    expect(onV1.materialSpecs!['Outer finish']).toEqual({ id: 'lam-oak', v: 1 });
    expect(onV1.specs).toContain('1 mm textured designer laminate outside (Merino · Greenlam · Royale Touche)');
    expect(composeWords(merged, onV1.materialSpecs)).toBe(onV1.specs);
    expect(staleParts(merged, onV1)).toEqual(['Outer finish']);
  });

  it('a draft updated to v2 reads “any of 250+ shades”, naming the range and the brands', () => {
    const u = updatedLine(merged, onV1, wardrobe);
    expect(u.materialSpecs!['Outer finish']).toEqual({ id: 'lam-oak', v: 2 });
    expect(u.specs).toContain('1 mm textured designer laminate outside, any of 250+ shades (Merino · Greenlam · Royale Touche)');
    expect(u.baseRate).toBe(onV1.baseRate);
  });

  it('a signed BOQ is unchanged: it is not offered v2, and its words read the same against the new bank', () => {
    const ctx: any = { contractSnapshot: { lockedTierId: 't-signed' }, documents: { issues: [{ snapshot: { tierId: 't-signed' } }] } };
    expect(offersUpdates({ id: 't-signed' }, ctx, false)).toBe(false);
    expect(composeWords(merged, onV1.materialSpecs)).toBe(onV1.specs);
  });

  it('a shade never changes a price; it names the shade and colours the drawing', () => {
    const l = withRecipeSpecs(line() as any, wardrobe, bank, 'E');
    const ctx = { rules: PLAYGROUND_PRICING };
    const map = new Map([['w', wardrobe]]);
    const s = withShade(bank, l, wardrobe, 'Outer finish', 'Teak');
    expect(s.materialSpecs!['Outer finish']).toEqual({ id: 'lam-ash', v: 2, shade: 'Teak' });
    expect(s.baseRate).toBe(l.baseRate);
    expect(s.finishBase).toBe(l.finishBase);
    expect(lineAmount(s, map as any, ctx)).toBe(lineAmount(l, map as any, ctx));
    expect(s.specs).toContain('1 mm standard laminate outside, Teak or any of 300+ shades (Merino · Greenlam · Century)');
    expect(shadeHexOf(bank, s.materialSpecs!['Outer finish'])).toBe('#a0744c');
    const back = withShade(bank, s, wardrobe, 'Outer finish', null);
    expect(back.materialSpecs!['Outer finish']).toEqual({ id: 'lam-ash', v: 2 });
    expect(back.specs).toBe(l.specs);
  });

  it('a part on a single spec takes no shade; another material drops it', () => {
    expect(withShade(bank, onV1, wardrobe, 'Outer finish', 'Elm')).toBe(onV1);
    expect(rangeOf(bank, onV1.materialSpecs!.Hardware)).toBeUndefined();
    const s = withShade(bank, withRecipeSpecs(line() as any, wardrobe, bank, 'C'), wardrobe, 'Outer finish', 'Elm');
    expect(withPart(bank, s, wardrobe, 'Outer finish', 'ven-walnut').materialSpecs!['Outer finish']).toEqual({ id: 'ven-walnut', v: 2 });
  });

  it('paint and countertops name their ranges too', () => {
    const paint = composeWords(bank, { Paint: { id: 'pt-tractor', v: 2 } });
    expect(paint).toBe('Two coats of Tractor emulsion over putty and primer, any of 1,500+ shades (Asian Paints).');
    expect(composeWords(bank, { Countertop: { id: 'top-granite', v: 2 } })).toBe('18 mm black granite, polished edge counter, any of 25+ colours.');
  });

  it('a new version keeps the range unless the Owner changes it; an example needs a name and a colour', () => {
    const v3 = saveNewVersion(bank, 'lam-oak', { words: '1 mm designer laminate', note: 'Shorter' }, 'Owner', 9);
    expect(currentVersion(v3, 'lam-oak')!.range!.count).toBe(250);
    const r = currentVersion(bank, 'lam-oak')!.range!;
    const more = { ...r, examples: [...r.examples, { name: 'Walnut 21071', hex: '#6a4a32', code: 'Merino 21071' }] };
    expect(newVersionProblem(bank, 'lam-oak', { words: '1 mm textured designer laminate', brand: 'Merino · Greenlam · Royale Touche', note: 'Example', range: more })).toBeNull();
    expect(newVersionProblem(bank, 'lam-oak', { words: '1 mm textured designer laminate', brand: 'Merino · Greenlam · Royale Touche', note: 'Example', range: r })).toMatch(/Nothing has changed/);
    expect(newVersionProblem(bank, 'lam-oak', { words: 'x', note: 'n', range: { ...r, examples: [{ name: '', hex: '#fff' }] } })).toMatch(/name and a colour/);
    const saved3 = saveNewVersion(bank, 'lam-oak', { words: '1 mm textured designer laminate', brand: 'Merino · Greenlam · Royale Touche', note: 'Example', range: more }, 'Owner', 9);
    expect(currentVersion(saved3, 'lam-oak')!.range!.examples.at(-1)).toEqual({ name: 'Walnut 21071', hex: '#6a4a32', code: 'Merino 21071' });
  });
});
