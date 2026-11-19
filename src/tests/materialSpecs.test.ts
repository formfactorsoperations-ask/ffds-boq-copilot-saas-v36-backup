import { describe, it, expect } from 'vitest';
import {
  seedFromPackages, packageTables, saveNewVersion, newVersionProblem, addMaterial, updateMaterial,
  currentVersion, versionsOf, versionAt, versionsAppendOnly, materialSpecsDocId, bankFromDoc,
  canEditMaterialSpecs, materialsIn,
} from '../../lib/materialSpecs';
import { PREDEFINED_SPECS } from '../../lib/comparison';

const seed = seedFromPackages(PREDEFINED_SPECS, 100);
const hardware = seed.materials.find(m => m.fam === 'hardware-system')!;

describe('the seed', () => {
  it('reproduces today’s package tables exactly', () => {
    expect(packageTables(seed)).toEqual(PREDEFINED_SPECS);
  });

  it('keeps one family per row and one material per distinct entry', () => {
    expect(seed.families.map(f => f.name)).toEqual(Object.keys(PREDEFINED_SPECS['Comfort Upgrade']));
    // Hardware is the same at every grade: one material, used at all three.
    expect(materialsIn(seed, 'hardware-system')).toEqual([{ id: 'hardware-system-1', fam: 'hardware-system', name: 'SS Soft-Close Channels', grades: ['E', 'C', 'P'] }]);
    // Plywood for wet areas differs at each grade: three materials.
    expect(materialsIn(seed, 'plywood-kitchen-bath').map(m => m.grades)).toEqual([['E'], ['C'], ['P']]);
    expect(seed.versions.every(v => v.v === 1)).toBe(true);
  });

  it('gives outer finishes a cost factor, and nothing else', () => {
    const finish = seed.families.filter(f => f.finish).map(f => f.name);
    expect(finish).toEqual(['Laminate – Outer Finish']);
    seed.versions.forEach(v => {
      const fam = seed.materials.find(m => m.id === v.mat)!.fam;
      expect(v.costFactor !== undefined).toBe(fam === 'laminate-outer-finish');
    });
  });
});

describe('saving a new version', () => {
  const v2 = saveNewVersion(seed, hardware.id, { words: 'SS soft-close hinges and telescopic channels', brand: 'Ebco', note: 'Telescopic channels named' }, 'Anish K.', 200);

  it('appends v2 and leaves v1 as it was', () => {
    expect(versionsOf(v2, hardware.id).map(x => x.v)).toEqual([1, 2]);
    expect(currentVersion(v2, hardware.id)).toEqual({ mat: hardware.id, v: 2, words: 'SS soft-close hinges and telescopic channels', brand: 'Ebco', note: 'Telescopic channels named', by: 'Anish K.', at: 200 });
    expect(versionAt(v2, hardware.id, 1)!.words).toBe('SS Soft-Close Channels');
    expect(versionsAppendOnly(seed, v2)).toBe(true);
    expect(v2.updatedBy).toBe('Anish K.');
    // The seed object itself is untouched.
    expect(versionsOf(seed, hardware.id).length).toBe(1);
  });

  it('refuses an empty, unexplained or unchanged version', () => {
    expect(newVersionProblem(seed, hardware.id, { words: ' ', note: 'x' })).toMatch(/what the client reads/);
    expect(newVersionProblem(seed, hardware.id, { words: 'New', note: '' })).toMatch(/why/);
    expect(newVersionProblem(seed, hardware.id, { words: 'SS Soft-Close Channels', note: 'again' })).toMatch(/Nothing has changed/);
    expect(newVersionProblem(seed, 'nope', { words: 'x', note: 'x' })).toMatch(/not in the bank/);
    expect(() => saveNewVersion(seed, hardware.id, { words: '', note: 'x' }, 'A', 1)).toThrow();
  });

  it('carries a finish’s cost factor, and lets a factor alone make a version', () => {
    const outer = materialsIn(seed, 'laminate-outer-finish')[0];
    expect(newVersionProblem(seed, outer.id, { words: currentVersion(seed, outer.id)!.words, note: 'Priced lower', costFactor: 0.85 })).toBeNull();
    const next = saveNewVersion(seed, outer.id, { words: currentVersion(seed, outer.id)!.words, note: 'Priced lower', costFactor: 0.85 }, 'A', 2);
    expect(currentVersion(next, outer.id)!.costFactor).toBe(0.85);
    expect(newVersionProblem(seed, outer.id, { words: 'x', note: 'x', costFactor: 0 })).toMatch(/cost factor/);
  });
});

describe('append only', () => {
  it('catches a changed, removed or reordered version', () => {
    const changed = { versions: seed.versions.map((v, i) => (i === 0 ? { ...v, words: 'edited' } : v)) };
    const removed = { versions: seed.versions.slice(1) };
    const reordered = { versions: [seed.versions[1], seed.versions[0], ...seed.versions.slice(2)] };
    expect(versionsAppendOnly(seed, changed)).toBe(false);
    expect(versionsAppendOnly(seed, removed)).toBe(false);
    expect(versionsAppendOnly(seed, reordered)).toBe(false);
    expect(versionsAppendOnly(null, seed)).toBe(true);
  });
});

describe('materials', () => {
  it('adds a material at v1 and renames one without touching its versions', () => {
    const added = addMaterial(seed, { fam: 'hardware-system', name: 'Hettich system', grades: ['P'], words: 'Hettich soft-close hinges and tandem runners', brand: 'Hettich' }, 'A', 3);
    const m = materialsIn(added, 'hardware-system')[1];
    expect(m).toEqual({ id: 'hardware-system-2', fam: 'hardware-system', name: 'Hettich system', grades: ['P'] });
    expect(currentVersion(added, m.id)!.v).toBe(1);
    expect(versionsAppendOnly(seed, added)).toBe(true);
    const renamed = updateMaterial(added, m.id, { name: 'Hettich', grades: ['C', 'P'] }, 'A', 4);
    expect(renamed.materials.find(x => x.id === m.id)).toMatchObject({ name: 'Hettich', grades: ['C', 'P'] });
    expect(renamed.versions).toBe(added.versions);
    expect(() => addMaterial(seed, { fam: 'nope', name: 'x', grades: [], words: 'x' }, 'A', 1)).toThrow(/family/);
  });
});

describe('where it lives and who edits it', () => {
  it('is one document per studio', () => {
    expect(materialSpecsDocId('studio_a')).toBe('material_specs_studio_a');
    expect(materialSpecsDocId('demo-tenant-01')).toBe('material_specs');
    expect(bankFromDoc(null)).toBeNull();
    expect(bankFromDoc({ versions: [] })).toEqual({ families: [], materials: [], versions: [], recipes: {} });
  });

  it('is edited by the Owner and Super Admin only', () => {
    expect(canEditMaterialSpecs('Owner')).toBe(true);
    expect(canEditMaterialSpecs('Super Admin')).toBe(true);
    expect(canEditMaterialSpecs('Admin')).toBe(false);
    expect(canEditMaterialSpecs('Designer')).toBe(false);
    expect(canEditMaterialSpecs('Admin', ['Owner'])).toBe(true);
  });
});
