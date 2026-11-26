import type { PaymentMilestone } from '../types';
import { milestoneKind, shareOf, type MilestoneKind, type Track } from './moneyBoard';

/*
  Quick schedule: each track as a ring of its milestones.

  The studio shapes the schedule by choosing, not typing: drag the boundary
  between two stages, tap a stage for − / +, add a stage by splitting one, or
  start from the studio default, front-loaded or even. A ring always adds up
  to 100%, so a track can never be left short or over.

  Paid and invoiced milestones are locked: they keep their share and nothing
  moves across them. Everything here is plain arithmetic on the ring; the
  modal (components/money/board/QuickScheduleModal.tsx) draws it, and Money
  prices and saves the result like any other schedule change.
*/

export interface RingSeg {
  id: string;
  name: string;
  /** Share of the track, 0-100. Whole numbers once moved; a saved 37.5 stays 37.5 until touched. */
  pct: number;
  /** Paid or invoiced: keeps its share, no handle on either side. */
  locked: boolean;
}

/** A stage is never smaller than this on the ring. */
export const RING_MIN = 1;
/** A slice is never drawn narrower than this, so a 2% stage can still be grabbed. */
export const RING_MIN_DRAWN = 9;

const r2 = (v: number) => Math.round(v * 100) / 100;
const cleared = (m: PaymentMilestone) => m.status === 'paid' || m.status === 'invoiced';

/** A track's milestones as a ring, a fixed amount counted at its share of the track. */
export function ringOf(milestones: PaymentMilestone[], track: Track, taxableBase: number): RingSeg[] {
  return milestones.filter(m => (m.type || 'design') === track)
    .map(m => ({ id: m.id, name: m.name, pct: r2(shareOf(m, taxableBase)), locked: cleared(m) }));
}

export const ringTotal = (segs: RingSeg[]) => r2(segs.reduce((s, x) => s + x.pct, 0));
const cum = (segs: RingSeg[]) => segs.reduce<number[]>((a, s) => [...a, r2(a[a.length - 1] + s.pct)], [0]);

/** Can the boundary before stage `i` move? Only between two unlocked stages. */
export const movable = (segs: RingSeg[], i: number) => i > 0 && i < segs.length && !segs[i - 1].locked && !segs[i].locked;

/** Moves the boundary before stage `i` to `at` (percent round the ring), keeping both stages at RING_MIN or more. */
export function moveBoundary(segs: RingSeg[], i: number, at: number): RingSeg[] {
  if (!movable(segs, i)) return segs;
  const c = cum(segs);
  const v = Math.max(c[i - 1] + RING_MIN, Math.min(c[i + 1] - RING_MIN, at));
  return segs.map((s, k) => (k === i - 1 ? { ...s, pct: r2(v - c[i - 1]) } : k === i ? { ...s, pct: r2(c[i + 1] - v) } : s));
}

/** The stage that gives or takes when stage `i` is nudged: the next unlocked one, else the one before. */
export function partnerOf(segs: RingSeg[], i: number): number {
  for (let k = i + 1; k < segs.length; k++) if (!segs[k].locked) return k;
  for (let k = i - 1; k >= 0; k--) if (!segs[k].locked) return k;
  return -1;
}

/** Changes stage `i` by `d` points, taken from (or given to) `partner`. */
export function nudge(segs: RingSeg[], i: number, d: number, partner = partnerOf(segs, i)): RingSeg[] {
  if (partner < 0 || segs[i]?.locked || segs[partner]?.locked) return segs;
  const a = r2(segs[i].pct + d), b = r2(segs[partner].pct - d);
  if (a < RING_MIN || b < RING_MIN) return segs;
  return segs.map((s, k) => (k === i ? { ...s, pct: a } : k === partner ? { ...s, pct: b } : s));
}

/** The unlocked stage a new one splits from: the one asked for, else the biggest. */
function splitFrom(segs: RingSeg[], at?: number): number {
  if (at !== undefined && segs[at] && !segs[at].locked) return at;
  return segs.reduce((m, s, k) => (!s.locked && (m < 0 || s.pct > segs[m].pct) ? k : m), -1);
}

/** Adds a stage after `at` (or the biggest) by splitting that stage in two. On an empty ring it takes what is left. */
export function splitStage(segs: RingSeg[], name: string, id: string, at?: number): RingSeg[] {
  const left = r2(100 - ringTotal(segs));
  const from = splitFrom(segs, at);
  if (from < 0) return left >= RING_MIN ? [...segs, { id, name, pct: left, locked: false }] : segs;
  const s = segs[from];
  if (s.pct < RING_MIN * 2) return segs;
  const half = Math.floor(s.pct / 2);
  const out = [...segs];
  out.splice(from, 1, { ...s, pct: r2(s.pct - half) }, { id, name, pct: half, locked: false });
  return out;
}

/** Takes a stage out; its share goes to the stage before it, else the one after. */
export function removeStage(segs: RingSeg[], id: string): RingSeg[] {
  const i = segs.findIndex(s => s.id === id);
  if (i < 0 || segs[i].locked) return segs;
  let to = -1;
  for (let k = i - 1; k >= 0 && to < 0; k--) if (!segs[k].locked) to = k;
  for (let k = i + 1; k < segs.length && to < 0; k++) if (!segs[k].locked) to = k;
  if (to < 0) return segs;
  return segs.map((s, k) => (k === to ? { ...s, pct: r2(s.pct + segs[i].pct) } : s)).filter(s => s.id !== id);
}

/** Whole numbers in proportion to `weights` that add up to `total` (largest remainders first; a fraction goes on the last). */
export function spread(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const raw = weights.map(w => Math.max(0, total) * w / sum);
  const out = raw.map(v => Math.floor(v));
  let rest = Math.floor(Math.max(0, total)) - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--) out[order[k][1]]++;
  const gap = r2(Math.max(0, total) - out.reduce((s, v) => s + v, 0));
  if (gap) out[out.length - 1] = r2(out[out.length - 1] + gap);
  return out;
}

export type Shape = 'studio' | 'front' | 'even';
export interface StudioStage { name: string; pct: number }

/**
 * Starts the unlocked part of a ring again from a shape. Locked stages keep
 * their share and the shape fills what is left.
 * - studio: the studio's stages for this track; when some are billed, the
 *   studio's stages after them, so a paid sign-up is not asked for twice.
 * - front: the stages there are now, more up front, less at the end.
 * - even: the stages there are now, the same share each.
 */
export function reshape(segs: RingSeg[], shape: Shape, studio: StudioStage[] | undefined, newId: () => string): RingSeg[] {
  const locked = segs.filter(s => s.locked), open = segs.filter(s => !s.locked);
  const left = r2(100 - ringTotal(locked));
  let names = open.map(s => s.name), weights: number[];
  if (shape === 'studio' && studio?.length) {
    const rest = studio.slice(Math.min(locked.length, studio.length - 1));
    names = rest.map(s => s.name);
    weights = rest.map(s => Math.max(0, Number(s.pct) || 0));
  } else if (shape === 'front') {
    weights = names.map((_, i) => Math.pow(names.length - i, 1.6));
  } else {
    weights = names.map(() => 1);
  }
  if (!names.length) return segs;
  const pcts = spread(left, weights);
  const byName = new Map(open.map(s => [s.name.trim().toLowerCase(), s]));
  return [...locked, ...names.map((name, i) => {
    const same = byName.get(name.trim().toLowerCase());
    if (same) byName.delete(name.trim().toLowerCase());
    return { id: same?.id || (shape !== 'studio' ? open[i]?.id : undefined) || newId(), name, pct: pcts[i], locked: false };
  })];
}

/** How wide each slice is drawn: one under RING_MIN_DRAWN is drawn at it, the rest share what is left. */
export function drawnWidths(vals: number[], min = RING_MIN_DRAWN): number[] {
  if (vals.length * min >= 100) return vals.map(() => 100 / Math.max(1, vals.length));
  const small = vals.filter(v => v < min).length, big = vals.filter(v => v >= min).reduce((s, v) => s + v, 0) || 1;
  const k = (100 - small * min) / big;
  return vals.map(v => (v < min ? min : v * k));
}

/* The stages a studio adds most, offered as chips under each ring. */
export const STAGE_LIBRARY: Record<Track, string[]> = {
  design: ['Sign-up & concept', 'Site measure & brief', '3D & layouts', 'Material selection', 'GFC drawings', 'Final BOQ'],
  execution: ['Material advance', 'Civil & demolition', 'Electrical & plumbing', 'False ceiling', 'Carpentry & carcass', 'Finishes', 'Handover'],
};

interface Words { trigger: string; unlocks: string; steps: string[] }
const WORDS: Record<MilestoneKind, Words> = {
  concept: { trigger: 'On signing', unlocks: 'Site study, brief freeze and concept direction', steps: ['Agreement signed', 'Site measured', 'Brief frozen', 'Concept presented'] },
  model: { trigger: 'On presenting layouts and 3D for approval', unlocks: 'Detailed design and material direction', steps: ['Layout approved', '3D views shared', 'Materials chosen'] },
  drawings: { trigger: 'On release of GFC drawings and the final BOQ', unlocks: 'A construction-ready package; execution may begin', steps: ['Working drawings released', 'Final BOQ shared', 'Drawings signed off'] },
  design: { trigger: 'On approval of this stage', unlocks: 'The next design stage', steps: ['Presented to the client', 'Client sign-off'] },
  material: { trigger: 'Before any vendor orders are placed', unlocks: 'Procurement, mobilisation and first-fix', steps: ['Vendor orders placed', 'Site mobilised'] },
  build: { trigger: 'Civil, MEP, ceiling framework and carcasses in place', unlocks: 'Second-fix and finishing prep', steps: ['Work done on site', 'Checked by the site lead'] },
  finish: { trigger: 'Before final finishes begin', unlocks: 'Laminates, shutters, polish, paint and hardware', steps: ['Laminates and shutters on', 'Paint and polish done', 'Hardware fitted'] },
  handover: { trigger: 'On completion of all work', unlocks: 'Keys, dossier and warranty certificate', steps: ['Snag walk-through', 'Keys handed over', 'Dossier and warranty shared'] },
  execution: { trigger: 'On completion of this stage on site', unlocks: 'The next stage on site', steps: ['Work done on site', 'Checked by the site lead'] },
};

export const kindOf = (name: string, track: Track) => milestoneKind({ name, type: track, isHandoverAdvance: track === 'execution' && /handover|hand over|keys?\b/i.test(name) });

/**
 * The schedule to save from the rings. Locked milestones are kept as they
 * are; a milestone whose share did not move is kept as it is (a fixed amount
 * stays fixed); one that moved is billed by percent from now on; a new stage
 * gets its trigger, what it unlocks and the steps that earn it.
 */
export function milestonesFromRings(
  rings: Partial<Record<Track, RingSeg[]>>,
  current: PaymentMilestone[],
  taxable: Record<Track, number>,
  newId: () => string,
): PaymentMilestone[] {
  const byId = new Map(current.map(m => [m.id, m]));
  const out: PaymentMilestone[] = [];
  (['design', 'execution'] as Track[]).forEach(t => {
    const segs = rings[t];
    if (!segs) return;
    segs.forEach((s, i) => {
      const was = byId.get(s.id);
      if (was && (cleared(was) || Math.abs(r2(shareOf(was, taxable[t])) - s.pct) < 0.005)) { out.push(was); return; }
      if (was) { out.push({ ...was, percentage: s.pct, isFixedAmount: false, fixedAmount: undefined, isCustom: true }); return; }
      const kind = kindOf(s.name, t), w = WORDS[kind];
      const last = i === segs.length - 1;
      out.push({
        id: s.id, type: t, name: s.name, percentage: s.pct, description: '', status: 'pending', isCustom: true,
        trigger: w.trigger, unlocks: w.unlocks,
        subSteps: w.steps.map(label => ({ id: newId(), label, isDone: false })),
        ...(t === 'execution' && (kind === 'handover' || (last && /handover|completion/i.test(s.name))) ? { isHandoverAdvance: true } : {}),
      } as PaymentMilestone);
    });
  });
  return out;
}
