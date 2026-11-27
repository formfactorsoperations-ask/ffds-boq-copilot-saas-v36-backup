/*
  How a renovation is timed (the owner, Nov 2026).

  A finished flat being redone is not timed like a vacant one. It starts with
  taking out what is there today and clearing the debris (the strip-out), sized
  by the flat: a working day per 100 sq ft, at least 4 and at most 12. And when
  the family lives in the home during the work, the work goes room by room
  around them, so the site work takes longer: 25% by default. Raw shell and
  semi-finished flats are timed as before.

  The numbers are the studio's, in Studio settings → Terms & Payment (beside
  "Civil work adds"). The Timeline builds the strip-out as a stage of its own
  (lib/scheduleBuilder), and the proposal reads the Timeline, so a document and
  the chart say the same days.

  Pure.
*/
import type { ProjectContext, TermsSettings } from '../types';

export interface RenovationRules {
  /** Strip-out working days per 100 sq ft of the flat. */
  stripOutPer100: number;
  stripOutMin: number;
  stripOutMax: number;
  /** How much longer the site work takes when the family lives in the home, in %. */
  livedInPercent: number;
}

export const DEFAULT_RENOVATION: RenovationRules = { stripOutPer100: 1, stripOutMin: 4, stripOutMax: 12, livedInPercent: 25 };

const num = (v: unknown, d: number, lo = 0, hi = 1000) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo ? Math.min(hi, n) : d;
};

/** The studio's renovation rules, the defaults where it has none. */
export function renovationRulesOf(terms: Pick<TermsSettings, 'renovation'> | null | undefined): RenovationRules {
  const r = terms?.renovation || {};
  const min = Math.round(num(r.stripOutMin, DEFAULT_RENOVATION.stripOutMin, 0, 60));
  return {
    stripOutPer100: num(r.stripOutPer100, DEFAULT_RENOVATION.stripOutPer100, 0, 10),
    stripOutMin: min,
    stripOutMax: Math.max(min, Math.round(num(r.stripOutMax, DEFAULT_RENOVATION.stripOutMax, 0, 90))),
    livedInPercent: Math.round(num(r.livedInPercent, DEFAULT_RENOVATION.livedInPercent, 0, 200)),
  };
}

/** A finished flat being redone. */
export const isRenovation = (ctx: Pick<ProjectContext, 'propertyStatus'> | null | undefined) => ctx?.propertyStatus === 'finished';

export interface RenovationPlan {
  renovation: boolean;
  /** Working days to take out what is there and clear the debris. 0 when not a renovation. */
  stripOutDays: number;
  livedIn: boolean;
  /** How much longer the site work takes lived in, in %; 0 when vacant or not a renovation. */
  livedInPercent: number;
  /** The flat's area the strip-out was sized by. */
  areaSqFt: number;
}

/** The flat's area: the Brief's, else its rooms'. */
const areaOf = (ctx: any) => {
  const a = Number(ctx?.area);
  if (a > 0) return a;
  return (Array.isArray(ctx?.rooms) ? ctx.rooms : []).reduce((s: number, r: any) => s + (Number(r?.size) || 0), 0);
};

export function renovationPlan(ctx: Partial<ProjectContext> | null | undefined, rules: RenovationRules = DEFAULT_RENOVATION): RenovationPlan {
  const area = areaOf(ctx);
  if (!isRenovation(ctx as any)) return { renovation: false, stripOutDays: 0, livedIn: false, livedInPercent: 0, areaSqFt: area };
  const sized = Math.ceil((area / 100) * rules.stripOutPer100);
  const stripOutDays = Math.max(rules.stripOutMin, Math.min(rules.stripOutMax, sized || rules.stripOutMin));
  const livedIn = !!ctx?.livedInDuringWork;
  return { renovation: true, stripOutDays, livedIn, livedInPercent: livedIn ? rules.livedInPercent : 0, areaSqFt: area };
}

/** Site working days, longer when the family lives in the home. */
export const livedInDays = (days: number, plan: Pick<RenovationPlan, 'livedInPercent'>) =>
  plan.livedInPercent > 0 ? Math.round(days * (1 + plan.livedInPercent / 100)) : days;
