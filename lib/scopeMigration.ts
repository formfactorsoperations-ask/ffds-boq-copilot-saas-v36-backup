import { BoqItem, Item, Room } from '../types';
import { ScopeBucket, asScopeBucket, bucketForItem, realRooms } from './scopeBuckets';

// ============================================================================
// scopeMigration — putting every BOQ line somewhere it belongs.
//
// "Functional" and "Others" are the studio's own format and every legacy
// project is written in it. The problem was never the buckets; it was that they
// were stored as *rooms* carrying the whole flat's area, so an eight-room
// 904 sq ft project measured 2,710 sq ft and the floor got priced twice.
//
// So the buckets stay, as scopes. Every project has Civil, Functional and
// Others whether or not anything was ever put in them, and this decides which
// one a line belongs to when it does not belong to a room.
//
// The one rule that matters: a line already sitting in a real room is never
// moved. Painting assigned to the master bedroom is a deliberate, room-wise
// decision by whoever priced it, and a migration that "tidied" it into
// Functional would be destroying an estimator's work to satisfy a naming
// scheme.
// ============================================================================

export interface ScopeAssignment {
  itemId: string;
  from: string;
  to: ScopeBucket;
  /** Why, in the words the studio would use. */
  reason: string;
}

/** Names that have meant "not a room" at some point in this codebase's life. */
const NON_ROOM_ALIASES = /^(general scope|general|unassigned|misc|miscellaneous|na|n\/a|-)?$/i;

/**
 * Where a single line should sit.
 *
 * Returns null when the line is already where it belongs — a real room, or the
 * correct scope under its canonical spelling.
 */
export function reassignmentFor(
  line: BoqItem,
  bankItem: Item | undefined,
  roomNames: Set<string>,
): ScopeAssignment | null {
  const current = (line.roomId || '').trim();

  // A real room wins, always. Nothing below second-guesses an estimator.
  if (current && roomNames.has(current)) return null;

  const target = bucketForItem(bankItem);

  const canonical = asScopeBucket(current);
  if (canonical) {
    /*
      Already in a scope — so its spelling is normalised ("FUNCTIONAL" and
      "Functional" were being counted as two buckets), and it is re-classified
      if it is in the wrong one.

      Re-classifying here but never re-rooming above is the same rule, not two.
      A room assignment carries information the item does not have — *which*
      bedroom the wardrobe is in — so overriding it destroys an estimator's
      work. A scope assignment carries nothing the item does not already imply:
      debris removal belongs in Others whatever it was filed under, and the old
      AI prompt filed plenty of it wrongly.
    */
    if (canonical === target) return canonical === current ? null
      : { itemId: line.id, from: current, to: canonical, reason: 'Scope name normalised' };
    return {
      itemId: line.id, from: current, to: target,
      reason: `${bankItem?.cat || 'This item'} belongs in ${target}`,
    };
  }
  if (NON_ROOM_ALIASES.test(current)) {
    return {
      itemId: line.id, from: current || '(none)', to: target,
      reason: current ? `"${current}" is not a room` : 'No room was set',
    };
  }

  /*
    A room name that no longer exists — renamed, deleted, or typed by hand into
    an import. The line is real and priced; it just has nowhere to live, and
    "Unassigned" is where BOQ lines go to be forgotten about.
  */
  return {
    itemId: line.id, from: current, to: target,
    reason: `No room named "${current}" in this project`,
  };
}

/**
 * Every line that needs re-homing, without changing anything.
 *
 * Separated from the write so a caller can say how many and why before the
 * studio decides — a silent rewrite of a priced BOQ is not something to do on
 * someone's behalf while they are looking at another screen.
 */
export function planScopeMigration(
  boq: BoqItem[] | undefined,
  bank: Item[] | undefined,
  rooms: Room[] | undefined,
): ScopeAssignment[] {
  const bankMap = new Map<string, Item>((bank || []).map(i => [i.id, i]));
  const roomNames = new Set(realRooms(rooms).map(r => r.name));
  return (boq || [])
    .map(line => reassignmentFor(line, bankMap.get(line.bankId), roomNames))
    .filter((a): a is ScopeAssignment => a !== null);
}

/** Apply a plan. Lines not in the plan are returned untouched, by identity. */
export function applyScopeMigration(boq: BoqItem[], plan: ScopeAssignment[]): BoqItem[] {
  if (!plan.length) return boq;
  const byId = new Map(plan.map(a => [a.itemId, a.to]));
  return boq.map(line => (byId.has(line.id) ? { ...line, roomId: byId.get(line.id)! } : line));
}

/**
 * The resolved home of a line, for display, without writing anything.
 *
 * The editor uses this so a legacy project reads correctly the moment it is
 * opened, whether or not anyone has run the migration. Display and storage are
 * allowed to disagree; a reader seeing "Unassigned" on work that is plainly
 * debris removal is not.
 */
export function resolvedRoomId(
  line: BoqItem,
  bankItem: Item | undefined,
  roomNames: Set<string>,
): string {
  const move = reassignmentFor(line, bankItem, roomNames);
  return move ? move.to : (line.roomId || '').trim();
}
