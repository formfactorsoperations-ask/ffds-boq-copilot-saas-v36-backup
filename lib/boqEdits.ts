/**
 * Taking lines out of a BOQ, and putting them back where they were.
 *
 * Every view deletes through here so a delete is one step with one undo, and
 * an undone line returns to its old place in the list rather than the end —
 * a BOQ's order is how the studio reads it.
 */

export interface RemovedLine<T> {
  line: T;
  /** Its position in the BOQ before it was removed. */
  index: number;
}

export function removeLines<T extends { id: string }>(boq: T[], ids: Iterable<string>): { boq: T[]; removed: RemovedLine<T>[] } {
  const idSet = new Set(ids);
  const removed: RemovedLine<T>[] = [];
  const kept: T[] = [];
  (boq || []).forEach((line, index) => {
    if (idSet.has(line.id)) removed.push({ line, index });
    else kept.push(line);
  });
  return { boq: kept, removed };
}

/** Puts removed lines back at their old positions. A line already present is not added twice. */
export function restoreLines<T extends { id: string }>(boq: T[], removed: RemovedLine<T>[]): T[] {
  const present = new Set((boq || []).map(l => l.id));
  const out = [...(boq || [])];
  [...removed]
    .filter(r => !present.has(r.line.id))
    .sort((a, z) => a.index - z.index)
    .forEach(({ line, index }) => out.splice(Math.min(index, out.length), 0, line));
  return out;
}
