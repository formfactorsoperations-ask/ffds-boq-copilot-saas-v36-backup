/**
 * The Material specs bank (BOQ Playground S1).
 *
 * The materials a BOQ line's specification is built from — plywood, outer
 * finishes, hardware, paint — each kept with every version it has had. One
 * document per studio: master_data/material_specs_<tenant> (the FFDS studio's
 * is `material_specs`, as its item bank is `item_bank`).
 *
 *   families   the kinds of material, in the order the package tables list them
 *   materials  each material: its family, name and the option grades it is
 *              used at (E Essential, C Comfort, P Premium)
 *   versions   every version of every material, oldest first. APPEND ONLY: a
 *              new version is added, an old one is never changed or removed,
 *              so a sent or signed BOQ that named v1 can always say what v1
 *              was. The Firestore rule refuses any write that would not.
 *   recipes    which material fills each part of an item at each grade (PR S2)
 *
 * Outer finishes (a family marked `finish`) carry a cost factor on each
 * version: what that finish does to a piece's price (lib/playground/finishes.ts).
 *
 * Only the Owner (and Super Admin) saves a new version; everyone else in the
 * studio reads the bank. The bank is seeded from the package tables the
 * comparison already prints (lib/comparison.ts PREDEFINED_SPECS), so on day
 * one it says exactly what today's proposals say.
 *
 * Pure: the screen and Firestore are in components/ and services/.
 */
import { PREDEFINED_SPECS } from './comparison';

export type Grade = 'E' | 'C' | 'P';
export const GRADES: Grade[] = ['E', 'C', 'P'];

/** The option each grade stands for in the package tables. */
export const GRADE_TIER: Record<Grade, string> = { E: 'Essential Elegance', C: 'Comfort Upgrade', P: 'Complete Harmony' };

export interface MaterialFamily {
  id: string;
  name: string;
  /** An outer finish: its versions carry a cost factor. */
  finish?: boolean;
}

export interface Material {
  id: string;
  fam: string;
  name: string;
  /** The grades the material is used at, e.g. ['C', 'P']. */
  grades: Grade[];
}

export interface MaterialVersion {
  mat: string;
  /** 1, 2, 3… per material. */
  v: number;
  /** What a client reads, e.g. "SS Soft-Close Channels". */
  words: string;
  brand?: string;
  /** Why this version: "Telescopic channels named". */
  note: string;
  by: string;
  at: number;
  /** Outer finishes only: what this finish does to a piece's price (1 = as priced). */
  costFactor?: number;
}

export interface MaterialSpecsBank {
  families: MaterialFamily[];
  materials: Material[];
  versions: MaterialVersion[];
  /** item recipe id → its parts (PR S2). */
  recipes: Record<string, unknown>;
  updatedAt?: number;
  updatedBy?: string;
}

/** The bank's document id in master_data for a studio. */
export function materialSpecsDocId(tenantId: string | null | undefined): string {
  const t = tenantId || 'demo-tenant-01';
  return t === 'demo-tenant-01' ? 'material_specs' : `material_specs_${t}`;
}

const slug = (s: string) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';

/** The outer-finish row of the package tables. */
const FINISH_FAMILY = /outer\s*finish/i;

/**
 * The bank as today's package tables describe it: one family per row, one
 * material per distinct entry in a row, used at the grades whose column holds
 * it, each at version 1.
 */
export function seedFromPackages(
  packages: Record<string, Record<string, string>> = PREDEFINED_SPECS,
  at = 0,
  by = 'Studio standard',
): MaterialSpecsBank {
  const families: MaterialFamily[] = [];
  const materials: Material[] = [];
  const versions: MaterialVersion[] = [];
  const rows: string[] = [];
  GRADES.forEach(g => Object.keys(packages[GRADE_TIER[g]] || {}).forEach(r => { if (!rows.includes(r)) rows.push(r); }));
  rows.forEach(row => {
    const fam: MaterialFamily = { id: slug(row), name: row, ...(FINISH_FAMILY.test(row) ? { finish: true } : {}) };
    families.push(fam);
    const byWords = new Map<string, Grade[]>();
    GRADES.forEach(g => {
      const words = packages[GRADE_TIER[g]]?.[row];
      if (words == null) return;
      byWords.set(words, [...(byWords.get(words) || []), g]);
    });
    let n = 0;
    byWords.forEach((grades, words) => {
      n++;
      const id = `${fam.id}-${n}`;
      materials.push({ id, fam: fam.id, name: words, grades });
      versions.push({ mat: id, v: 1, words, note: 'From the package tables', by, at, ...(fam.finish ? { costFactor: 1 } : {}) });
    });
  });
  return { families, materials, versions, recipes: {}, updatedAt: at, updatedBy: by };
}

/** Every version of a material, oldest first. */
export const versionsOf = (bank: MaterialSpecsBank, mat: string) =>
  bank.versions.filter(x => x.mat === mat).sort((a, b) => a.v - b.v);

/** A material's latest version. */
export const currentVersion = (bank: MaterialSpecsBank, mat: string): MaterialVersion | undefined => {
  const vs = versionsOf(bank, mat);
  return vs[vs.length - 1];
};

/** A material at a given version, or its latest when that version is not known. */
export const versionAt = (bank: MaterialSpecsBank, mat: string, v: number): MaterialVersion | undefined =>
  versionsOf(bank, mat).find(x => x.v === v) || currentVersion(bank, mat);

export const materialsIn = (bank: MaterialSpecsBank, fam: string) => bank.materials.filter(m => m.fam === fam);
export const familyOf = (bank: MaterialSpecsBank, mat: string) => bank.families.find(f => f.id === bank.materials.find(m => m.id === mat)?.fam);

/**
 * The package tables from the bank: for each option, each family's words at
 * that grade (the latest version). On a fresh seed this is the package tables.
 */
export function packageTables(bank: MaterialSpecsBank): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  GRADES.forEach(g => {
    const table: Record<string, string> = {};
    bank.families.forEach(f => {
      const m = materialsIn(bank, f.id).find(x => x.grades.includes(g));
      const cur = m && currentVersion(bank, m.id);
      if (cur) table[f.name] = cur.words;
    });
    out[GRADE_TIER[g]] = table;
  });
  return out;
}

export interface NewVersion {
  words: string;
  brand?: string;
  note: string;
  costFactor?: number;
}

/** Why a new version cannot be saved, or null when it can. */
export function newVersionProblem(bank: MaterialSpecsBank, mat: string, next: NewVersion): string | null {
  const cur = currentVersion(bank, mat);
  if (!bank.materials.some(m => m.id === mat)) return 'That material is not in the bank.';
  const words = String(next.words || '').trim();
  if (!words) return 'Write what the client reads for this material.';
  if (!String(next.note || '').trim()) return 'Say why there is a new version, in a few words.';
  if (next.costFactor != null && !(Number(next.costFactor) > 0 && Number(next.costFactor) <= 5)) return 'A cost factor is a number above 0 and up to 5.';
  const finish = !!familyOf(bank, mat)?.finish;
  const sameFactor = !finish || Number(next.costFactor ?? cur?.costFactor ?? 1) === Number(cur?.costFactor ?? 1);
  if (cur && cur.words === words && (cur.brand || '') === String(next.brand || '').trim() && sameFactor) {
    return 'Nothing has changed from the current version.';
  }
  return null;
}

/** The bank with a new version of one material appended. Earlier versions are untouched. */
export function saveNewVersion(bank: MaterialSpecsBank, mat: string, next: NewVersion, by: string, at: number): MaterialSpecsBank {
  const problem = newVersionProblem(bank, mat, next);
  if (problem) throw new Error(problem);
  const cur = currentVersion(bank, mat);
  const finish = !!familyOf(bank, mat)?.finish;
  const brand = String(next.brand || '').trim();
  const version: MaterialVersion = {
    mat, v: (cur?.v || 0) + 1,
    words: String(next.words).trim(),
    ...(brand ? { brand } : {}),
    note: String(next.note).trim(),
    by, at,
    ...(finish ? { costFactor: Number(next.costFactor ?? cur?.costFactor ?? 1) } : {}),
  };
  return { ...bank, versions: [...bank.versions, version], updatedAt: at, updatedBy: by };
}

/** A new material in a family, at version 1. */
export function addMaterial(
  bank: MaterialSpecsBank,
  input: { fam: string; name: string; grades: Grade[]; words: string; brand?: string; costFactor?: number },
  by: string,
  at: number,
): MaterialSpecsBank {
  const fam = bank.families.find(f => f.id === input.fam);
  if (!fam) throw new Error('Choose a family for the material.');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Name the material.');
  if (!String(input.words || '').trim()) throw new Error('Write what the client reads for this material.');
  let n = materialsIn(bank, fam.id).length + 1;
  while (bank.materials.some(m => m.id === `${fam.id}-${n}`)) n++;
  const id = `${fam.id}-${n}`;
  const brand = String(input.brand || '').trim();
  return {
    ...bank,
    materials: [...bank.materials, { id, fam: fam.id, name, grades: GRADES.filter(g => input.grades.includes(g)) }],
    versions: [...bank.versions, {
      mat: id, v: 1, words: String(input.words).trim(), ...(brand ? { brand } : {}),
      note: 'First version', by, at, ...(fam.finish ? { costFactor: Number(input.costFactor ?? 1) } : {}),
    }],
    updatedAt: at, updatedBy: by,
  };
}

/** A material's name or grades changed. Its versions are untouched. */
export function updateMaterial(bank: MaterialSpecsBank, mat: string, patch: { name?: string; grades?: Grade[] }, by: string, at: number): MaterialSpecsBank {
  return {
    ...bank,
    materials: bank.materials.map(m => (m.id !== mat ? m : {
      ...m,
      ...(patch.name != null && patch.name.trim() ? { name: patch.name.trim() } : {}),
      ...(patch.grades ? { grades: GRADES.filter(g => patch.grades!.includes(g)) } : {}),
    })),
    updatedAt: at, updatedBy: by,
  };
}

/**
 * True when `after` keeps every version `before` had, in order and unchanged,
 * and only adds after them. The Firestore rule checks the same thing.
 */
export function versionsAppendOnly(before: Pick<MaterialSpecsBank, 'versions'> | null | undefined, after: Pick<MaterialSpecsBank, 'versions'>): boolean {
  const a = before?.versions || [];
  const b = after.versions || [];
  if (b.length < a.length) return false;
  return a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]));
}

/** A bank read from Firestore, made whole: anything missing reads as empty. */
export function bankFromDoc(data: any): MaterialSpecsBank | null {
  if (!data || typeof data !== 'object') return null;
  return {
    families: Array.isArray(data.families) ? data.families : [],
    materials: Array.isArray(data.materials) ? data.materials : [],
    versions: Array.isArray(data.versions) ? data.versions : [],
    recipes: data.recipes && typeof data.recipes === 'object' ? data.recipes : {},
    ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
    ...(data.updatedBy ? { updatedBy: data.updatedBy } : {}),
  };
}

/** Who may save a new version: the Owner, and Super Admin. Everyone else reads. */
export const canEditMaterialSpecs = (role: string | null | undefined, roles?: string[] | null) =>
  [role, ...(roles || [])].some(r => r === 'Owner' || r === 'Super Admin');
