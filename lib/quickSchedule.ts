import type { PaymentMilestone } from '../types';
import { milestoneKind, shareOf, type MilestoneKind, type Track } from './moneyBoard';

/*
  Quick schedule: type the milestones, get the stages.

  The studio writes its milestones the way it says them ("Concept 25%, 3D,
  GFC drawings, Material advance, Civil, Finishing, Handover ₹1L") and this
  works out the payment stages from them: which track each one is on, its
  share, when it is earned, what it unlocks and the steps that earn it. The
  result is a draft; Money shows it and nothing is saved until it is approved.

  It reads words, not a model, so it is instant and gives the same answer every
  time. What it cannot tell, it guesses from the line before.
*/

export interface ParsedLine {
  name: string;
  track: Track;
  /** True when the track came from a "Design:" heading or a "design" / "site" word, not a guess. */
  trackSure: boolean;
  pct?: number;
  amount?: number;
  steps: string[];
}

export interface QuickStage {
  milestone: PaymentMilestone;
  kind: MilestoneKind;
  /** Where its share came from: typed by the studio, or worked out here. */
  from: 'typed' | 'auto' | 'kept';
}

export interface QuickDraft {
  stages: QuickStage[];
  /** The schedule to save: generated stages, plus what is kept (paid, invoiced, or a track left out). */
  milestones: PaymentMilestone[];
  /** Tracks the text says nothing about, which stay as they are. */
  untouched: Track[];
  warnings: string[];
}

const TRACK_HEAD: Record<string, Track> = {
  design: 'design', 'design fee': 'design', 'design fees': 'design', 'design stages': 'design', 'design milestones': 'design', d: 'design',
  execution: 'execution', 'execution stages': 'execution', 'execution milestones': 'execution', site: 'execution', 'site work': 'execution',
  build: 'execution', construction: 'execution', turnkey: 'execution', e: 'execution',
};

const EXEC_WORDS = /material|order|procure|mobili|civil|carcass|carpentry|ceiling|mep|electrical|plumb|tiling|tile|flooring|demolition|masonry|first[- ]?fix|second[- ]?fix|finish|paint|polish|laminat|shutter|hardware|install|fitting|furniture|handover|hand over|snag|keys?\b|site|execution|structure|woodwork|modular|kitchen|wardrobe/;
const DESIGN_WORDS = /advance|token|concept|sign[- ]?up|signing|booking|retainer|initiation|brief|moodboard|mood board|layout|3d|render|visuali|design|drawing|gfc|working|boq|presentation|space plan|measure/;

/** "1L", "1.5 lakh", "50k", "₹1,00,000", "Rs. 25000" → rupees. */
function readAmount(raw: string): number | undefined {
  const m = raw.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(l|lakh|lakhs|lac|k|cr|crore)?\b|([\d,]+(?:\.\d+)?)\s*(l|lakh|lakhs|lac|k|cr|crore)\b/i);
  if (!m) return undefined;
  const n = Number((m[1] || m[3] || '').replace(/,/g, ''));
  const unit = (m[2] || m[4] || '').toLowerCase();
  const mult = unit === 'k' ? 1e3 : unit === 'cr' || unit === 'crore' ? 1e7 : unit ? 1e5 : 1;
  const v = Math.round(n * mult);
  return v > 0 ? v : undefined;
}

/** Splits one line into milestones on commas (not those inside 1,00,000), semicolons, pipes and arrows. */
function pieces(line: string): string[] {
  return line.split(/(?<!\d),|,(?!\d)|;|\||→|->|=>/).map(s => s.trim()).filter(Boolean);
}

const tidy = (s: string) => s
  .replace(/^\s*(?:[-*•·]|\d{1,2}[.)]|[a-z][.)])\s+/i, '')
  .replace(/\(\s*\)/g, '')
  .replace(/\s{2,}/g, ' ')
  .replace(/^[\s\-–—:]+|[\s\-–—:@]+$/g, '')
  .trim();

function guessTrack(name: string): Track | null {
  const n = name.toLowerCase();
  const e = EXEC_WORDS.test(n), d = DESIGN_WORDS.test(n);
  if (e && !d) return 'execution';
  if (d && !e) return 'design';
  if (e && d) return /design|drawing|gfc|3d|render|concept|layout/.test(n) && !/handover|material|site|civil|finish/.test(n) ? 'design' : 'execution';
  return null;
}

/** Reads what the studio typed into milestones, each with its track, share or amount, and steps. */
export function parseMilestones(text: string, feeOnly = false): ParsedLine[] {
  const out: ParsedLine[] = [];
  let heading: Track | null = null;
  let last: Track = 'design';
  for (const rawLine of (text || '').split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    // "Design:" alone, or "Design: concept, 3D, GFC" — a heading for what follows.
    const head = line.match(/^\s*(?:[-*•·]\s*)?([a-z ]{1,20}?)\s*(?:stages|milestones)?\s*[:\-–—]\s*(.*)$/i);
    const headTrack = head ? TRACK_HEAD[head[1].trim().toLowerCase()] : undefined;
    let steps: string[] | null = null;
    // A heading on a line of its own holds until the next one; "Design: a, b" is for that line only.
    let lineTrack: Track | null = heading;
    if (headTrack) {
      line = head![2];
      if (!line.trim()) { heading = headTrack; continue; }
      lineTrack = headTrack;
    } else if (/^\s*(design|execution|site|build|construction)\s*$/i.test(line)) {
      heading = TRACK_HEAD[line.trim().toLowerCase()] || heading;
      continue;
    } else {
      // "3D design: layout, renders, material board" — the part after the colon is its steps.
      const withSteps = line.match(/^([^:]{2,60}):\s*(.+)$/);
      if (withSteps && !/^\s*[\d₹]/.test(withSteps[2])) { line = withSteps[1]; steps = pieces(withSteps[2]).map(tidy).filter(Boolean); }
    }
    const parts = steps ? [line] : pieces(line);
    for (const part of parts) {
      let p = part;
      const pctMatch = p.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      const pct = pctMatch ? Math.min(100, Number(pctMatch[1])) : undefined;
      if (pctMatch) p = p.replace(pctMatch[0], ' ');
      const amount = pct === undefined ? readAmount(p) : undefined;
      if (amount !== undefined) p = p.replace(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?\s*(?:l|lakh|lakhs|lac|k|cr|crore)?\b|[\d,]+(?:\.\d+)?\s*(?:l|lakh|lakhs|lac|k|cr|crore)\b/i, ' ');
      const name = tidy(p);
      if (!name) continue;
      const guessed = guessTrack(name);
      const track: Track = feeOnly ? 'design' : (lineTrack || guessed || last);
      out.push({ name: name.charAt(0).toUpperCase() + name.slice(1), track, trackSure: feeOnly || !!lineTrack || !!guessed, pct, amount, steps: steps || [] });
      last = track;
    }
  }
  return out;
}

/* How much of a track each kind of stage usually carries, before it is scaled to what is left. */
const WEIGHT: Record<MilestoneKind, number> = {
  concept: 25, model: 40, drawings: 35, design: 30,
  material: 40, build: 30, finish: 20, handover: 10, execution: 25,
};

interface Words { trigger: string; unlocks: string; steps: string[] }
const WORDS: Record<MilestoneKind, Words> = {
  concept: { trigger: 'On signing', unlocks: 'Site study, brief freeze and concept direction', steps: ['Agreement signed', 'Site measured', 'Brief frozen', 'Concept presented'] },
  model: { trigger: 'On presenting layouts and 3D for approval', unlocks: 'Detailed design and material direction', steps: ['Layout approved', '3D views shared', 'Materials chosen'] },
  drawings: { trigger: 'On release of GFC drawings and the final BOQ', unlocks: 'A construction-ready package; execution may begin', steps: ['Working drawings released', 'Final BOQ shared', 'Drawings signed off'] },
  design: { trigger: 'On approval of this stage', unlocks: 'The next design stage', steps: ['Presented to the client', 'Client sign-off'] },
  material: { trigger: 'Before any vendor orders are placed', unlocks: 'Procurement, mobilisation and first-fix', steps: ['Vendor orders placed', 'Site mobilised'] },
  build: { trigger: 'Civil, MEP, ceiling framework and carcasses in place', unlocks: 'Second-fix and finishing prep', steps: ['Civil work done', 'Electrical and plumbing first-fix', 'Ceiling framework up', 'Carcasses installed'] },
  finish: { trigger: 'Before final finishes begin', unlocks: 'Laminates, shutters, polish, paint and hardware', steps: ['Laminates and shutters on', 'Paint and polish done', 'Hardware fitted'] },
  handover: { trigger: 'On completion of all work', unlocks: 'Keys, dossier and warranty certificate', steps: ['Snag walk-through', 'Keys handed over', 'Dossier and warranty shared'] },
  execution: { trigger: 'On completion of this stage on site', unlocks: 'The next stage on site', steps: ['Work done on site', 'Checked by the site lead'] },
};

const cleared = (m: PaymentMilestone) => m.status === 'paid' || m.status === 'invoiced';
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Shares the percent left over the stages that did not say theirs, by how much each kind usually carries, in whole numbers. */
function spread(left: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const raw = weights.map(w => Math.max(0, left) * w / sum);
  const out = raw.map(v => Math.floor(v));
  let rest = Math.round(Math.max(0, left)) - out.reduce((s, v) => s + v, 0);
  // Largest remainders first, so 100 splits as 25 · 40 · 35 and not 24 · 40 · 36.
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--) out[order[k][1]]++;
  // A left that is not whole (locked shares like 37.5%) goes on the last one.
  const gap = round2(Math.max(0, left) - out.reduce((s, v) => s + v, 0));
  if (gap) out[out.length - 1] = round2(out[out.length - 1] + gap);
  return out;
}

/**
 * The payment stages from what the studio typed. Paid and invoiced milestones
 * stay as they are, first on their track; the stages share what is left. A
 * track the text says nothing about stays as it is. A typed name that matches
 * an unbilled milestone keeps that milestone's id and date.
 */
export function draftStages(args: {
  text: string;
  current: PaymentMilestone[];
  taxable: { design: number; execution: number };
  feeOnly?: boolean;
  newId: () => string;
}): QuickDraft {
  const { current, taxable, feeOnly = false, newId } = args;
  const lines = parseMilestones(args.text, feeOnly);
  const tracks: Track[] = feeOnly ? ['design'] : ['design', 'execution'];
  const warnings: string[] = [];
  const stages: QuickStage[] = [];
  const milestones: PaymentMilestone[] = [];
  const untouched: Track[] = [];
  const byName = new Map(current.filter(m => !cleared(m)).map(m => [m.name.trim().toLowerCase(), m]));

  for (const t of tracks) {
    const mine = lines.filter(l => l.track === t);
    const existing = current.filter(m => (m.type || 'design') === t);
    if (!mine.length) {
      if (existing.length) untouched.push(t);
      milestones.push(...existing);
      continue;
    }
    const base = taxable[t];
    const locked = existing.filter(cleared);
    locked.forEach(m => stages.push({ milestone: m, kind: milestoneKind(m), from: 'kept' }));
    milestones.push(...locked);
    const lockedPct = locked.reduce((s, m) => s + shareOf(m, base), 0);
    const typedPct = mine.reduce((s, l) => s + (l.pct || 0), 0);
    const fixedPct = mine.reduce((s, l) => s + (l.amount && base > 0 ? l.amount / base * 100 : 0), 0);
    const left = 100 - lockedPct - typedPct - fixedPct;
    const label = t === 'design' ? 'Design' : 'Execution';

    const kinds = mine.map((l, i) => {
      const k = milestoneKind({ name: l.name, type: t, isHandoverAdvance: t === 'execution' && i === mine.length - 1 && /handover|completion|keys?/i.test(l.name) });
      // "Advance" or "Token" opening the design track is the sign-up payment.
      return t === 'design' && k === 'design' && i === 0 && /advance|token|booking|retainer/i.test(l.name) ? 'concept' : k;
    });
    const auto = mine.map((l, i) => (l.pct === undefined && l.amount === undefined ? i : -1)).filter(i => i >= 0);
    const shares = spread(left, auto.map(i => WEIGHT[kinds[i]]));
    if (left < -0.5) warnings.push(`${label} adds up to ${round2(100 - left)}%. Bring the typed shares down to 100% or less.`);
    else if (!auto.length && Math.abs(left) >= 0.5) warnings.push(`${label} adds up to ${round2(100 - left)}%. Leave one stage without a share and it takes the rest.`);
    if (mine.some(l => l.amount) && base <= 0) warnings.push(`${label} has no taxable amount yet, so a fixed amount cannot be placed on it.`);

    mine.forEach((l, i) => {
      const kind = kinds[i];
      const w = WORDS[kind];
      const was = byName.get(l.name.toLowerCase());
      if (was) byName.delete(l.name.toLowerCase());
      const isHandover = t === 'execution' && (kind === 'handover' || (i === mine.length - 1 && !mine.some((x, j) => kinds[j] === 'handover')));
      const pct = l.pct !== undefined ? l.pct : l.amount !== undefined ? (base > 0 ? round2(l.amount / base * 100) : 0) : shares[auto.indexOf(i)];
      const m: PaymentMilestone = {
        id: was?.id || newId(),
        type: t,
        name: l.name,
        percentage: pct,
        description: was?.description || '',
        status: 'pending',
        isCustom: true,
        trigger: w.trigger,
        unlocks: i === mine.length - 1 && kind !== 'handover' ? (t === 'design' && !feeOnly ? 'Execution may begin' : w.unlocks) : w.unlocks,
        subSteps: (l.steps.length ? l.steps : w.steps).map(label => ({ id: newId(), label, isDone: false })),
        ...(was?.date ? { date: was.date } : {}),
        ...(l.amount !== undefined ? { isFixedAmount: true, fixedAmount: l.amount } : {}),
        ...(isHandover ? { isHandoverAdvance: true } : {}),
      } as PaymentMilestone;
      stages.push({ milestone: m, kind, from: l.pct !== undefined || l.amount !== undefined ? 'typed' : 'auto' });
      milestones.push(m);
    });
  }
  if (!feeOnly) {
    // The first line with no clue goes on design, where a schedule starts; only later guesses are worth a word.
    const guessed = lines.filter((l, i) => i > 0 && !l.trackSure).map(l => l.name);
    if (guessed.length && lines.length > 1) warnings.push(`Placed by the line before: ${guessed.join(', ')}. Add a "Design:" or "Execution:" heading if one is on the wrong track.`);
  }
  return { stages, milestones, untouched, warnings };
}

/** What to show in the box before anything is typed. */
export const QUICK_EXAMPLE = `Design: Sign-up & concept 25%, 3D & layouts, GFC drawings
Execution: Material advance 40%, Civil & carcass, Finishing, Handover ₹1L`;
