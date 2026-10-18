/**
 * Who a client is shown, from a meeting the studio recorded.
 *
 * A meeting the client attended can still have had a carpenter or a supplier
 * in the room, and the studio records them -- by name, by role, sometimes with
 * an email -- because the studio needs to know who was there. The client does
 * not: the studio's vendors are the studio's business. Every place the portal
 * lists attendees or action owners goes through here.
 */

type Side = 'client' | 'ffds' | 'studio' | 'vendor' | 'unknown' | string;

interface PersonLike { name?: string; email?: string; side?: Side }

const isVendor = (p: any) => !!p && typeof p === 'object' && p.side === 'vendor';

/**
 * Attendees safe to show. `people` (site visits) carries each person's side in
 * the same order as `attendees`; minutes carry the side on the attendee itself.
 * A plain name with no side is kept -- there is nothing to judge it by.
 */
export function clientVisibleAttendees(
  attendees: (string | PersonLike)[] | undefined,
  people?: PersonLike[] | undefined,
): (string | PersonLike)[] {
  if (Array.isArray(people) && people.length) {
    return people.filter(p => !isVendor(p)).map(p => p.name || p.email || 'Participant');
  }
  return (attendees || []).filter(a => !isVendor(a));
}

/** The owner of an action item, as the client should read it. */
export function clientActionOwner(item: { owner?: string; ownerName?: string } | undefined, fallback = 'Project Lead'): string {
  if (!item) return fallback;
  if (item.owner === 'vendor') return 'FFDS site team';
  if (item.owner === 'client') return item.ownerName || 'You';
  if (item.owner === 'ffds') return item.ownerName || 'FFDS';
  return item.ownerName || item.owner || fallback;
}
