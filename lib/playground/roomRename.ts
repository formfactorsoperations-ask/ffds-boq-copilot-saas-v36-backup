/*
  A room renamed in the Brief, carried into the BOQ.

  A BOQ line knows its room by name (`roomId`), a whole-flat line's shares are
  keyed by room name (`byRoom.rooms`), and an offer off one room names it
  (lib/offers, `room-percent`). Renaming the room in the Brief changed none of
  them, so the BOQ kept the old name as a room of its own beside the new one.

  The Brief now renames once, when the name is done (components/
  ProjectContextCard), and App carries it into every option but the signed one
  (lib/scopeFlow keepLockedTier) and into the room offers. Lines already left
  under a name the Brief no longer has are moved by hand from their card in the
  Rooms lens (moveRoomLines).
*/
import type { BoqItem, ProjectContext, ProposalTier } from '../../types';
import { isScopeBucket } from '../scopeBuckets';

/** The name to rename to, or null when there is nothing to do. */
const target = (from: string, to: string) => {
  const t = (to || '').trim();
  return t && t !== from ? t : null;
};

/** The lines in `from` moved to `to`, and a shared line's share in `from` with them. Unchanged lines keep their identity. */
export function moveRoomLines(lines: BoqItem[], from: string, to: string): BoqItem[] {
  const t = target(from, to);
  if (!t || !lines?.length) return lines;
  let changed = false;
  const out = lines.map(l => {
    let n = l;
    if (l.roomId === from) n = { ...n, roomId: t };
    const shares = l.byRoom?.rooms;
    if (shares && Object.prototype.hasOwnProperty.call(shares, from)) {
      const { [from]: moved, ...rest } = shares;
      n = { ...n, byRoom: { ...l.byRoom!, rooms: { ...rest, [t]: rest[t] ?? moved } } };
    }
    if (n !== l) changed = true;
    return n;
  });
  return changed ? out : lines;
}

/** Every option's lines renamed, but the one the client signed (it stays as signed). */
export function renameRoomInTiers(tiers: ProposalTier[], from: string, to: string, signedTierId?: string | null): ProposalTier[] {
  if (!target(from, to)) return tiers;
  let changed = false;
  const out = tiers.map(tier => {
    if (signedTierId && tier.id === signedTierId) return tier;
    const boq = moveRoomLines(tier.boq || [], from, to);
    if (boq === tier.boq) return tier;
    changed = true;
    return { ...tier, boq };
  });
  return changed ? out : tiers;
}

/** The offers off that room name the room's new name. */
export function renameRoomInContext(ctx: ProjectContext, from: string, to: string): ProjectContext {
  const t = target(from, to);
  const discounts = ctx.financials?.discounts;
  if (!t || !discounts?.length) return ctx;
  let changed = false;
  const next = discounts.map((d: any) => {
    if (d?.basis?.kind !== 'room-percent' || d.basis.room !== from) return d;
    changed = true;
    return { ...d, basis: { ...d.basis, room: t }, name: typeof d.name === 'string' ? d.name.split(from).join(t) : d.name };
  });
  return changed ? { ...ctx, financials: { ...ctx.financials!, discounts: next } } : ctx;
}

/**
 * Whether a room may be renamed to `to`: a name, not a scope (Civil, Functional,
 * Others), and not another room's. Two rooms of one name would pour their lines together.
 */
export function renameProblem(names: string[], from: string, to: string): string | null {
  const t = (to || '').trim();
  if (!t) return 'A room needs a name.';
  if (t === from) return null;
  if (isScopeBucket(t)) return `${t} is a scope of the whole flat, not a room.`;
  if (names.some(n => n !== from && n.trim().toLowerCase() === t.toLowerCase())) return `There is already a room called ${t}.`;
  return null;
}
