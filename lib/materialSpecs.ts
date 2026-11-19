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
 *   recipes    which material fills each part of an item at each grade (PR S2):
 *              a carpentry recipe says Carcass is MR ply at Essential, BWR at
 *              Comfort, BWP at Premium, and so on part by part
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
  /** How it is drawn: a pattern on the plan (pg-w-oak) and its base colour. Finishes and tops only. */
  swatch?: string;
  base?: string;
}

/** One part of a recipe: the family it is chosen from and the material at each grade. */
export interface RecipePart {
  part: string;
  fam: string;
  byGrade: Record<Grade, string>;
  /** The outer finish: chosen on the piece as a tile, and it prices the piece. */
  finish?: boolean;
}

/** Which material fills each part of an item, at each grade. Shared by every item of its kind. */
export interface Recipe {
  id: string;
  name: string;
  parts: RecipePart[];
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
  /** recipe id → the recipe (PR S2). */
  recipes: Record<string, Recipe>;
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

/* ───────────────────────────── the studio standard (PR S2) ───────────────────────────── */

const STD_AT = 0;
const STD_BY = 'Studio standard';
type StdMat = [fam: string, id: string, name: string, words: string, brand: string, grades: string, extra?: { swatch?: string; base?: string; factor?: number }];

/** The families a line's parts are chosen from, in the order the screen lists them. */
export const STANDARD_FAMILIES: MaterialFamily[] = [
  { id: 'ply', name: 'Plywood & boards' },
  { id: 'lam', name: 'Outer finishes', finish: true },
  { id: 'inner', name: 'Inner finishes' },
  { id: 'hw', name: 'Hardware' },
  { id: 'handle', name: 'Handles' },
  { id: 'top', name: 'Countertops' },
  { id: 'glass', name: 'Glass & mirror' },
  { id: 'paint', name: 'Paint' },
  { id: 'ceil', name: 'False ceiling' },
  { id: 'elec', name: 'Electrical' },
];

const STANDARD_MATERIALS: StdMat[] = [
  ['ply', 'ply-mr', 'MR plywood, 18 mm', '18 mm MR-grade plywood', 'Greenply MR equivalent', 'E'],
  ['ply', 'ply-bwr', 'BWR plywood, 18 mm', '18 mm BWR-grade plywood', 'Century Club equivalent', 'C'],
  ['ply', 'ply-bwp', 'BWP marine plywood, 18 mm', '18 mm BWP marine plywood', 'Century Sainik 710 equivalent', 'P'],
  ['ply', 'ply-hdhmr', 'HDHMR board, 18 mm', '18 mm HDHMR board', 'Action Tesa equivalent', ''],
  ['lam', 'lam-ash', 'Standard laminate, 1 mm', '1 mm standard laminate', 'Merino · Greenlam · Century', 'E', { swatch: 'pg-w-ash', base: '#e2d3bb', factor: 0.85 }],
  ['lam', 'lam-oak', 'Designer laminate, 1 mm', '1 mm textured designer laminate', 'Merino · Greenlam · Royale Touche', 'C', { swatch: 'pg-w-oak', base: '#c9a37a', factor: 1 }],
  ['lam', 'ven-walnut', 'Natural veneer, 4 mm', '4 mm natural veneer, PU lacquered', 'Greenlam Decowood · Century Veneers', 'P', { swatch: 'pg-w-walnut', base: '#7a5436', factor: 1.3 }],
  ['lam', 'lam-graphite', 'Super-matt laminate, 1 mm', '1 mm super-matt anti-fingerprint laminate', 'Greenlam Clads · Merino Ultra-matt', '', { swatch: 'pg-w-graphite', base: '#4b505a', factor: 1.05 }],
  ['lam', 'acr-ivory', 'Acrylic high gloss', 'high-gloss acrylic', 'Rehau · Merino Acrylic', '', { swatch: 'pg-g-ivory', base: '#efe8da', factor: 1.22 }],
  ['inner', 'in-white', 'White inner laminate, 0.8 mm', '0.8 mm white laminate', 'Merino equivalent', 'ECP'],
  ['hw', 'hw-ss', 'Soft-close hinges and channels', 'soft-close stainless steel hinges and telescopic channels', 'Ebco equivalent', 'EC'],
  ['hw', 'hw-hettich', 'Hettich soft-close system', 'soft-close hinges and tandem drawer runners', 'Hettich', 'P'],
  ['handle', 'hd-knob', 'Brushed steel knobs', 'brushed steel knobs', 'local make', 'E'],
  ['handle', 'hd-profile', 'Aluminium profile handles', 'concealed aluminium profile handles', 'Hettich equivalent', 'CP'],
  ['top', 'top-granite', 'Granite, 18 mm', '18 mm black granite, polished edge', 'local make', 'E', { swatch: 'pg-st-granite', base: '#2d2f33' }],
  ['top', 'top-quartz', 'Quartz, 20 mm', '20 mm quartz, rounded edge', 'Caesarstone equivalent', 'CP', { swatch: 'pg-st-quartz', base: '#ecebe7' }],
  ['glass', 'gl-tough', 'Toughened glass, 10 mm', '10 mm toughened glass with SS fittings', 'Saint-Gobain equivalent', 'ECP'],
  ['paint', 'pt-tractor', 'Tractor emulsion', 'two coats of Tractor emulsion over putty and primer', 'Asian Paints', 'E'],
  ['paint', 'pt-royale', 'Royale Matt emulsion', 'two coats of Royale Matt emulsion over putty and primer', 'Asian Paints', 'CP'],
  ['ceil', 'cl-gyproc', 'Gypsum board on GI, 12.5 mm', '12.5 mm gypsum board on GI framing', 'Gyproc equivalent', 'ECP'],
  ['elec', 'el-gm', 'GM modular switches', 'modular switches with FR copper wiring', 'GM / Polycab equivalent', 'EC'],
  ['elec', 'el-legrand', 'Legrand Arteor switches', 'Arteor modular switches with FR copper wiring', 'Legrand / Finolex', 'P'],
];

const P = (part: string, fam: string, E: string, C: string, Pm: string, finish?: boolean): RecipePart =>
  ({ part, fam, byGrade: { E, C, P: Pm }, ...(finish ? { finish: true } : {}) });

/** The studio's standard recipes, one per kind of item. */
export const STANDARD_RECIPES: Recipe[] = [
  { id: 'carp', name: 'Carpentry', parts: [
    P('Carcass', 'ply', 'ply-mr', 'ply-bwr', 'ply-bwp'),
    P('Outer finish', 'lam', 'lam-ash', 'lam-oak', 'ven-walnut', true),
    P('Inner finish', 'inner', 'in-white', 'in-white', 'in-white'),
    P('Hardware', 'hw', 'hw-ss', 'hw-ss', 'hw-hettich'),
    P('Handles', 'handle', 'hd-knob', 'hd-profile', 'hd-profile'),
  ] },
  { id: 'panel', name: 'Wall panelling', parts: [
    P('Base board', 'ply', 'ply-mr', 'ply-bwr', 'ply-bwp'),
    P('Outer finish', 'lam', 'lam-ash', 'lam-oak', 'ven-walnut', true),
  ] },
  { id: 'kitchen', name: 'Kitchen base units', parts: [
    P('Carcass', 'ply', 'ply-bwr', 'ply-bwp', 'ply-bwp'),
    P('Shutters', 'lam', 'lam-ash', 'acr-ivory', 'acr-ivory', true),
    P('Countertop', 'top', 'top-granite', 'top-quartz', 'top-quartz'),
    P('Hardware', 'hw', 'hw-ss', 'hw-ss', 'hw-hettich'),
  ] },
  { id: 'wall', name: 'Kitchen wall units', parts: [
    P('Carcass', 'ply', 'ply-bwr', 'ply-bwp', 'ply-bwp'),
    P('Shutters', 'lam', 'lam-ash', 'acr-ivory', 'acr-ivory', true),
    P('Hardware', 'hw', 'hw-ss', 'hw-ss', 'hw-hettich'),
  ] },
  { id: 'vanity', name: 'Vanity', parts: [
    P('Carcass', 'ply', 'ply-bwp', 'ply-bwp', 'ply-bwp'),
    P('Outer finish', 'lam', 'lam-ash', 'lam-oak', 'ven-walnut', true),
    P('Countertop', 'top', 'top-granite', 'top-quartz', 'top-quartz'),
  ] },
  { id: 'glass', name: 'Glass', parts: [P('Glass', 'glass', 'gl-tough', 'gl-tough', 'gl-tough')] },
  { id: 'ceil', name: 'False ceiling', parts: [P('Board', 'ceil', 'cl-gyproc', 'cl-gyproc', 'cl-gyproc')] },
  { id: 'paint', name: 'Painting', parts: [P('Paint', 'paint', 'pt-tractor', 'pt-royale', 'pt-royale')] },
  { id: 'elec', name: 'Electrical', parts: [P('Switches and wiring', 'elec', 'el-gm', 'el-gm', 'el-legrand')] },
];

/**
 * The bank a studio starts from: the families, materials and recipes the
 * Playground was designed with, each material at version 1.
 */
export function studioStandard(): MaterialSpecsBank {
  const materials: Material[] = STANDARD_MATERIALS.map(([fam, id, name, , , grades, x]) => ({
    id, fam, name, grades: GRADES.filter(g => grades.includes(g)),
    ...(x?.swatch ? { swatch: x.swatch } : {}), ...(x?.base ? { base: x.base } : {}),
  }));
  const versions: MaterialVersion[] = STANDARD_MATERIALS.map(([fam, id, , words, brand, , x]) => ({
    mat: id, v: 1, words, brand, note: 'First version', by: STD_BY, at: STD_AT,
    ...(fam === 'lam' ? { costFactor: x?.factor ?? 1 } : {}),
  }));
  const recipes: Record<string, Recipe> = {};
  STANDARD_RECIPES.forEach(r => { recipes[r.id] = r; });
  return { families: STANDARD_FAMILIES, materials, versions, recipes, updatedAt: STD_AT, updatedBy: STD_BY };
}

/**
 * A saved bank with anything of the studio standard it lacks added after it:
 * families, materials (at v1) and recipes it does not have. What it has is
 * kept as it is, and nothing is removed, so a save of the result is append-only.
 */
export function withStandard(bank: MaterialSpecsBank | null | undefined): MaterialSpecsBank {
  const std = studioStandard();
  if (!bank) return std;
  const fams = new Set(bank.families.map(f => f.id));
  const mats = new Set(bank.materials.map(m => m.id));
  const added = std.materials.filter(m => !mats.has(m.id));
  const addedIds = new Set(added.map(m => m.id));
  return {
    ...bank,
    families: [...bank.families, ...std.families.filter(f => !fams.has(f.id))],
    materials: [...bank.materials, ...added],
    versions: [...bank.versions, ...std.versions.filter(v => addedIds.has(v.mat))],
    recipes: { ...std.recipes, ...(bank.recipes || {}) },
  };
}

/** The recipe with one part's material at one grade changed. */
export function setRecipePart(bank: MaterialSpecsBank, recipeId: string, part: string, grade: Grade, mat: string, by: string, at: number): MaterialSpecsBank {
  const r = bank.recipes[recipeId];
  if (!r) throw new Error('That recipe is not in the bank.');
  const m = bank.materials.find(x => x.id === mat);
  const p = r.parts.find(x => x.part === part);
  if (!p) throw new Error('That part is not in the recipe.');
  if (!m || m.fam !== p.fam) throw new Error('Pick a material from the part’s own family.');
  const parts = r.parts.map(x => (x.part !== part ? x : { ...x, byGrade: { ...x.byGrade, [grade]: mat } }));
  return { ...bank, recipes: { ...bank.recipes, [recipeId]: { ...r, parts } }, updatedAt: at, updatedBy: by };
}
