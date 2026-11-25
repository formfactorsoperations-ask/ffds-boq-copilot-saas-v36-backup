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

/*
  Lines moved to another room by hand: dragged in the Sheet, or picked in a
  line's Room. A whole-flat line shared into the rooms stays where it is (its
  shares are its rooms), and so does a civil line, which is measured from its
  room on the plan. A piece drawn on the plan leaves it: its place is in the
  room it came from, so it is placed again in the new one.
*/
export const movable = (l: BoqItem) => !l.byRoom && !l.civil;

export interface MovedLines { boq: BoqItem[]; moved: number; offPlan: number; kept: number }

export function moveLinesTo(boq: BoqItem[], ids: string[], to: string): MovedLines {
  const want = new Set(ids);
  const room = (to || '').trim();
  let moved = 0, offPlan = 0, kept = 0;
  if (!room) return { boq, moved, offPlan, kept };
  const out = boq.map(l => {
    if (!want.has(l.id) || l.roomId === room) return l;
    if (!movable(l)) { kept++; return l; }
    moved++;
    if (l.place) { offPlan++; const { place: _p, ...rest } = l; return { ...rest, roomId: room }; }
    return { ...l, roomId: room };
  });
  return { boq: moved ? out : boq, moved, offPlan, kept };
}

/** What a move says: how many went, and what came off the plan or stayed. */
export function movedWords(r: MovedLines, to: string, name?: string): string {
  const what = r.moved === 1 && name ? name : `${r.moved} line${r.moved === 1 ? '' : 's'}`;
  const parts = [`${what} moved to ${to}.`];
  if (r.offPlan) parts.push(r.offPlan === 1 && r.moved === 1 ? 'It was drawn on the plan in its old room, so it is off the plan now: place it again from its panel.' : `${r.offPlan} of them came off the plan: place them again from their panels.`);
  if (r.kept) parts.push(`${r.kept} stayed where ${r.kept === 1 ? 'it was' : 'they were'}: a whole-flat or civil line follows its rooms.`);
  parts.push(`Undo puts ${r.moved === 1 ? 'it' : 'them'} back.`);
  return parts.join(' ');
}
