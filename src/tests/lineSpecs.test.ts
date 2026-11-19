import { describe, it, expect } from 'vitest';
import { studioStandard, withStandard, seedFromPackages, saveNewVersion, setRecipePart, versionsAppendOnly } from '../../lib/materialSpecs';
import {
  suggestedRecipeId, recipeOf, gradeOf, specsFromRecipe, composeWords, withRecipeSpecs, staleParts, updatedLine,
  withPart, withOwnWords, withRecipeWords, finishDelta, offersUpdates, sentTierIds,
} from '../../lib/lineSpecs';

const bank = studioStandard();
const wardrobe: any = { id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: 'Typed words', materials: 1000, labor: 400, margin: 25 };
const sofa: any = { id: 's', name: 'Three-seater sofa', cat: 'Furniture', unit: 'nos', specs: 'Linen', materials: 50000, labor: 0, margin: 20 };
const line = (o: any = {}) => ({ id: 'l1', bankId: 'w', qty: 40, roomId: 'Bedroom', baseRate: 1000, ...o });

describe('the studio standard', () => {
  it('holds the mockup’s families, materials at v1 and recipes', () => {
    expect(bank.families.map(f => f.name)).toEqual(['Plywood & boards', 'Outer finishes', 'Inner finishes', 'Hardware', 'Handles', 'Countertops', 'Glass & mirror', 'Paint', 'False ceiling', 'Electrical']);
    expect(bank.versions.every(v => v.v === 1)).toBe(true);
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
      Carcass: { id: 'ply-bwr', v: 1 }, 'Outer finish': { id: 'lam-oak', v: 1 }, 'Inner finish': { id: 'in-white', v: 1 },
      Hardware: { id: 'hw-ss', v: 1 }, Handles: { id: 'hd-profile', v: 1 },
    });
    expect(l.specs).toBe('18 mm BWR-grade plywood carcass (Century Club equivalent); 1 mm textured designer laminate outside (Merino · Greenlam · Royale Touche); 0.8 mm white laminate inside (Merino equivalent); soft-close stainless steel hinges and telescopic channels (Ebco equivalent); concealed aluminium profile handles (Hettich equivalent).');
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
