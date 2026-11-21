/**
 * What separates the studio's three options, as numbers the owner sets.
 *
 * Three figures per option, read by the one generator (lib/standardPackages):
 *
 *   material   the materials rate, as a share of the Item Bank rate, on the
 *              trades where grade is a real choice (carpentry, kitchen, glass,
 *              decor, loose furniture)
 *   margin     the item's margin, as a share of its own
 *   ceiling    how much of the false ceiling area the option takes
 *
 * They were written in the generator: 0.88 / 1.00 / 1.35, 0.85 / 1.00 / 1.25
 * and 35% / 60% / 85%. Those are still what a studio starts from, so nothing
 * moves until the owner changes one. Comfort is the baseline: its materials
 * and margin are the Item Bank's, and only its ceiling share can change.
 *
 * Saved with the Standard templates, beside the typologies, under one reserved
 * key, so every reader of the templates has them and they are saved, exported
 * and imported together:
 *
 *   { '3-BHK': {…}, __setup: { E: ['material=0.88', 'margin=0.85', 'ceiling=0.35'], C: […], P: […] } }
 *
 * Everything that lists typologies reads them through `typologiesOf`.
 *
 * Pure.
 */
import { GRADES, type Grade } from './materialSpecs';

export const SETUP_KEY = '__setup';

export interface OptionSetup {
  material: number;
  margin: number;
  ceiling: number;
}

export type OptionSetups = Record<Grade, OptionSetup>;

/** What the generator used before the owner could set it. */
export const STANDARD_SETUP: OptionSetups = {
  E: { material: 0.88, margin: 0.85, ceiling: 0.35 },
  C: { material: 1, margin: 1, ceiling: 0.6 },
  P: { material: 1.35, margin: 1.25, ceiling: 0.85 },
};

/** The limits a figure is kept within. */
export const SETUP_LIMITS: Record<keyof OptionSetup, [number, number]> = {
  material: [0.5, 2.5],
  margin: [0.5, 2],
  ceiling: [0, 1],
};

type Templates = Record<string, Record<string, string[]>>;

/** The typologies, without the option setup. */
export function typologiesOf<T extends Templates>(templates: T | null | undefined): T {
  if (!templates || !(SETUP_KEY in templates)) return (templates || {}) as T;
  const { [SETUP_KEY]: _setup, ...rest } = templates as Templates;
  return rest as T;
}

const clamp = (k: keyof OptionSetup, v: number) => Math.min(SETUP_LIMITS[k][1], Math.max(SETUP_LIMITS[k][0], v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** The setup with every figure within its limits and Comfort held at the Item Bank's rate and margin. */
export function cleanSetup(setup: Partial<Record<Grade, Partial<OptionSetup>>> | null | undefined): OptionSetups {
  const out = {} as OptionSetups;
  GRADES.forEach(g => {
    const s = { ...STANDARD_SETUP[g] };
    (Object.keys(s) as (keyof OptionSetup)[]).forEach(k => {
      const v = Number(setup?.[g]?.[k]);
      if (Number.isFinite(v)) s[k] = round(clamp(k, v));
    });
    out[g] = g === 'C' ? { ...s, material: 1, margin: 1 } : s;
  });
  return out;
}

/** The studio's option setup: its own figures, the standard for any it has not set. */
export function optionSetupOf(templates: Templates | null | undefined): OptionSetups {
  const raw = templates?.[SETUP_KEY];
  if (!raw) return cleanSetup(null);
  const read: Partial<Record<Grade, Partial<OptionSetup>>> = {};
  GRADES.forEach(g => {
    const row: Partial<OptionSetup> = {};
    (raw[g] || []).forEach(entry => {
      const [k, v] = String(entry).split('=');
      if (k === 'material' || k === 'margin' || k === 'ceiling') row[k] = Number(v);
    });
    read[g] = row;
  });
  return cleanSetup(read);
}

/** True when the setup is what a studio starts from. */
export function isStandardSetup(setup: OptionSetups): boolean {
  return GRADES.every(g => (Object.keys(STANDARD_SETUP[g]) as (keyof OptionSetup)[]).every(k => Math.abs(setup[g][k] - STANDARD_SETUP[g][k]) < 0.0005));
}

/** The templates with this option setup. The standard, or null, clears it. */
export function withOptionSetup<T extends Templates>(templates: T, setup: OptionSetups | null): T {
  const rest = typologiesOf(templates);
  const clean = setup ? cleanSetup(setup) : null;
  if (!clean || isStandardSetup(clean)) return { ...rest };
  const saved: Record<string, string[]> = {};
  GRADES.forEach(g => { saved[g] = [`material=${clean[g].material}`, `margin=${clean[g].margin}`, `ceiling=${clean[g].ceiling}`]; });
  return { ...rest, [SETUP_KEY]: saved };
}
