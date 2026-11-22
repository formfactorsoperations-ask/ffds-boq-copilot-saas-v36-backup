/*
  One edit, every option (the BOQ Editor's "Edit: All options").

  The options were generated from one template: the same rooms and items, each
  at its own grade, rate and margin, with a few extras in the higher ones.
  After that they were separate copies, so a change made in one had to be made
  again in the other two.

  An edit is split in two:

    scope  what is in the flat: a line added or deleted, moved, resized, its
           quantity, which room it is in, how a whole-flat line is shared, its
           civil work, and whether it is bought by the client or at actuals.
           This is applied to every option.
    spec   what it is built to: finish and materials, rate and margin. This is
           what makes the options different, so it stays in the option edited.

  A line is matched across options by its item and its room (and, for civil
  work, its kind); two of the same item in one room are matched in order. A
  line added to every option is priced at each option's own grade, as the
  generator prices it (lib/standardPackages priceForOption).
*/
import type { BoqItem } from '../../types';

/** The fields that say what is in the flat, rather than what it is built to. */
export const SCOPE_FIELDS = ['qty', 'calcLength', 'calcWidth', 'calcMultiplier', 'sizeUnit', 'place', 'roomId', 'byRoom', 'civil', 'boqStatus'] as const;
type ScopeField = typeof SCOPE_FIELDS[number];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A line's kind across options: its item, its room, its civil kind. */
const baseOf = (l: BoqItem) => `${l.bankId}|${l.roomId || ''}|${(l.civil as { type?: string } | undefined)?.type || ''}`;

/** Each line's key across options: its kind, and which of that kind it is. */
export function lineKeys(boq: BoqItem[]): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  (boq || []).forEach(l => {
    const base = baseOf(l);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    out.set(l.id, `${base}#${n}`);
  });
  return out;
}

export interface ScopeEdit {
  /** Lines added, in the order they were added. */
  added: BoqItem[];
  /** Keys of the lines deleted. */
  removed: string[];
  /** Keys of the lines changed, with the scope fields as they now are (undefined: cleared). */
  changed: { key: string; patch: Partial<Record<ScopeField, unknown>> }[];
  /** How many lines of each kind the edited option has now: an option that already has them is not given more (debris removal, once across the flat). */
  counts: Record<string, number>;
}

export const isEmptyEdit = (e: ScopeEdit) => !e.added.length && !e.removed.length && !e.changed.length;

/** The scope part of one edit: what was added, deleted, and changed in scope. A finish, rate or margin change is none of it. */
export function scopeEdit(before: BoqItem[], after: BoqItem[]): ScopeEdit {
  const keys = lineKeys(before);
  const now = new Map(after.map(l => [l.id, l]));
  const was = new Map(before.map(l => [l.id, l]));
  const added = after.filter(l => !was.has(l.id));
  const removed = before.filter(l => !now.has(l.id)).map(l => keys.get(l.id)!);
  const changed: ScopeEdit['changed'] = [];
  before.forEach(b => {
    const a = now.get(b.id);
    if (!a || a === b) return;
    const patch: Partial<Record<ScopeField, unknown>> = {};
    SCOPE_FIELDS.forEach(f => { if (!same((b as any)[f], (a as any)[f])) patch[f] = (a as any)[f]; });
    if (Object.keys(patch).length) changed.push({ key: keys.get(b.id)!, patch });
  });
  const counts: Record<string, number> = {};
  after.forEach(l => { const k = baseOf(l); counts[k] = (counts[k] || 0) + 1; });
  return { added, removed, changed, counts };
}

export interface Applied {
  boq: BoqItem[];
  /** How many changes landed. */
  applied: number;
  /** Changes to a line this option does not have (deleted or never in it): left alone. */
  missed: number;
}

/**
 * The edit, made in another option. `price` prices a line added here at this
 * option's grade; `newId` names it.
 */
export function applyScopeEdit(edit: ScopeEdit, target: BoqItem[], price: (line: BoqItem) => BoqItem, newId: () => string): Applied {
  const keys = lineKeys(target);
  const byKey = new Map<string, string>();
  keys.forEach((k, id) => byKey.set(k, id));
  let applied = 0, missed = 0;
  const drop = new Set<string>();
  edit.removed.forEach(k => { const id = byKey.get(k); if (id) { drop.add(id); applied++; } else missed++; });
  const patches = new Map<string, Partial<Record<ScopeField, unknown>>>();
  edit.changed.forEach(c => { const id = byKey.get(c.key); if (id) { patches.set(id, c.patch); applied++; } else missed++; });
  let boq = target.filter(l => !drop.has(l.id)).map(l => {
    const p = patches.get(l.id);
    if (!p) return l;
    const next: any = { ...l };
    Object.entries(p).forEach(([f, v]) => { if (v === undefined) delete next[f]; else next[f] = v; });
    return next as BoqItem;
  });
  /* Of each kind, an option is given no more than the edited option now has. */
  const have: Record<string, number> = {};
  boq.forEach(l => { const k = baseOf(l); have[k] = (have[k] || 0) + 1; });
  const fresh = edit.added.filter(l => {
    const k = baseOf(l);
    if ((have[k] || 0) >= (edit.counts[k] ?? Infinity)) return false;
    have[k] = (have[k] || 0) + 1;
    return true;
  }).map(l => {
    const line: any = { id: newId(), bankId: l.bankId };
    SCOPE_FIELDS.forEach(f => { if ((l as any)[f] !== undefined) line[f] = (l as any)[f]; });
    /* A line of the project's own (no Item Bank item) keeps its own words and rate. */
    ['name', 'unit', 'cat', 'specs', 'materials', 'labor', 'rationale'].forEach(f => { if ((l as any)[f] !== undefined && line[f] === undefined) line[f] = (l as any)[f]; });
    return price(line as BoqItem);
  });
  if (fresh.length) { boq = [...boq, ...fresh]; applied += fresh.length; }
  return { boq, applied, missed };
}

/** "Essential Elegance and Complete Harmony" */
export const namesOf = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
