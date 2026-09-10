import { Item, Room } from '../types';

// ============================================================================
// scopeBuckets — the parts of a BOQ that belong to the project, not to a room.
//
// "Functional" and "Others" were being stored as rooms, each one handed
// `size: projectContext.area` — the whole flat. So a 904 sq ft flat with eight
// real rooms reported a total room area of ~2,710 sq ft, and every whole-house
// quantity (painting, false ceiling, electrical) was measured against three
// times the property. The flooring pass then priced a second entire floor under
// "Others", because a bucket with an area looks exactly like a large dry room.
//
// A bucket is not a room. It has no dimensions, nothing is measured from it,
// and it exists to say which part of the job a line belongs to:
//
//   Civil       floors, tiling, waterproofing, demolition
//   Functional  painting, false ceiling, electrical, plumbing — the flat's services
//   Others      debris, protection, cleaning — site services for the job
//
// Civil lines keep their real room, so 52.9 sq ft is still legibly the master
// bathroom and still editable as such; the bucket is how they are grouped and
// read, not how they are measured.
// ============================================================================

export type ScopeBucket = 'Civil' | 'Functional' | 'Others';

export const SCOPE_BUCKETS: ScopeBucket[] = ['Civil', 'Functional', 'Others'];

export const SCOPE_BUCKET_META: Record<ScopeBucket, { label: string; detail: string }> = {
  Civil:      { label: 'Civil',      detail: 'Flooring, tiling, waterproofing and demolition' },
  Functional: { label: 'Functional', detail: 'Painting, false ceiling, electrical and plumbing across the flat' },
  Others:     { label: 'Others',     detail: 'Debris removal, floor protection and site services' },
};

/**
 * Is this room name actually a bucket?
 *
 * Case-insensitive and trimmed: real BOQs carry "Functional" and "FUNCTIONAL"
 * as separate strings, and a bucket that fails to be recognised is a bucket
 * that gets measured as a room.
 */
export function isScopeBucket(name: string | undefined): boolean {
  const n = (name || '').trim().toLowerCase();
  return n === 'civil' || n === 'functional' || n === 'others';
}

/** The bucket a name refers to, normalised to its canonical spelling. */
export function asScopeBucket(name: string | undefined): ScopeBucket | null {
  const n = (name || '').trim().toLowerCase();
  if (n === 'civil') return 'Civil';
  if (n === 'functional') return 'Functional';
  if (n === 'others') return 'Others';
  return null;
}

/**
 * Only the rooms that are rooms.
 *
 * Every area calculation goes through this. A project saved before buckets were
 * separated still has them sitting in `rooms`, so filtering at read time is what
 * makes the fix retroactive without a migration anyone has to run.
 */
export function realRooms(rooms: Room[] | undefined): Room[] {
  return (rooms || []).filter(r => !isScopeBucket(r?.name));
}

/**
 * The three scopes, present on every project.
 *
 * They were removed from `rooms` entirely, which fixed the measurement — a
 * bucket carrying the whole flat's area was being counted as a room — and broke
 * everything downstream that iterates rooms to decide what to render. A scope
 * that exists nowhere cannot be shown, selected, or added to.
 *
 * So they exist, with `size: 0`. `realRooms` still filters them out of every
 * measurement by name, so nothing can be derived from them; they are there to
 * be a place a line can live and a heading a reader can see.
 */
export function ensureScopeRooms(rooms: Room[] | undefined): Room[] {
  const list = [...(rooms || [])];
  const present = new Set(
    list.map(r => asScopeBucket(r?.name)).filter((x): x is ScopeBucket => !!x),
  );

  // Any legacy bucket-room keeps its position but loses the area it should
  // never have had — that area is what caused the three-times over-measure.
  const normalised = list.map(r => {
    const bucket = asScopeBucket(r?.name);
    return bucket ? { ...r, name: bucket, size: 0, unit: 'sq ft' as const } : r;
  });

  const missing = SCOPE_BUCKETS.filter(b => !present.has(b))
    .map(name => ({ name, size: 0, unit: 'sq ft' as const }));

  /* Uniqueness is enforced here too, so every path that produces rooms gets
     both invariants from one call and none of them can forget. */
  return uniqueRoomNames([...normalised, ...missing]);
}

/**
 * Room names, made unique.
 *
 * A room's name IS its identity — `BoqItem.roomId` holds the name, and every
 * editor groups by it. A floor plan that labels three rooms "Toilet" and three
 * "Bedroom", which is what plans do, therefore produced one group called Toilet
 * holding three vanities and three sanitary installs. The items were right, one
 * per bathroom; they collapsed into a single heading and read as triplication.
 *
 * Numbering is applied only where there is a collision, so a plan with one
 * kitchen still says "Kitchen" and not "Kitchen 1". The first occurrence keeps
 * the bare name, which matches how anyone would write it out by hand.
 *
 * Scopes are passed through untouched — there is exactly one Civil.
 */
export function uniqueRoomNames(rooms: Room[] | undefined): Room[] {
  const list = rooms || [];
  const counts = new Map<string, number>();
  list.forEach(r => {
    const n = (r?.name || '').trim();
    if (!n || isScopeBucket(n)) return;
    counts.set(n, (counts.get(n) || 0) + 1);
  });

  const used = new Map<string, number>();
  return list.map(r => {
    const name = (r?.name || '').trim();
    if (!name || isScopeBucket(name) || (counts.get(name) || 0) < 2) return r;
    const nth = (used.get(name) || 0) + 1;
    used.set(name, nth);
    return { ...r, name: `${name} ${nth}` };
  });
}

/*
  Plan labels, written the way a studio writes them.

  A drawing says "Living", "Toilet", "Bedroom" — draughting shorthand, repeated
  as often as the rooms repeat. That is fine on a drawing and wrong on a BOQ a
  client reads, where "Toilet 2" means nothing and "Common Bathroom" means
  something.

  DANGEROUS TO RUN LATE: a room's name is the identity a BOQ line carries, so
  renaming a room after lines exist orphans them. This runs only where rooms are
  created — plan analysis and auto-mapping — never on open, never on save.
*/

/** Labels a plan produces. Anything else is a studio's own words, left alone. */
const GENERIC_LABEL =
  /^(bed\s?room|bed|master\s?bed\s?room|guest\s?bed\s?room|kids?\s?bed\s?room|toilet|bath|bathroom|wc|washroom|master\s?bath\s?room|common\s?bath\s?room|powder\s?room|living|living\s?room|hall|drawing|dining|dining\s?room|kitchen|balcony|terrace|deck|utility|foyer|entrance|entry|passage|store|study)\s*\d*$/i;

/** What a single room of each family is called when it is the only one. */
const CANONICAL_LABEL: Record<string, string> = {
  living: 'Living Room',
  dining: 'Dining Room',
  bedroom: 'Master Bedroom',
  bathroom: 'Master Bathroom',

  /*
    Deliberately absent: kitchen, utility, foyer, balcony.

    A family label is not a better name than the word already on the drawing. The
    balcony family covers balconies, terraces and decks — canonicalising it
    renamed a Terrace to "Balcony", which is a different thing on a different
    floor. Where the plan's word is already what a client would read, it stands.
  */
};

/**
 * Rank names within a family, largest first.
 *
 * The master bedroom is the biggest one, and the master bathroom is the biggest
 * bathroom. That is a proxy, not a fact — a plan does not say which bathroom is
 * attached to which bedroom — but it is the convention a studio would apply by
 * hand, and it is right far more often than "Toilet 2".
 */
const FAMILY_RANKS: Record<string, string[]> = {
  bedroom: ['Master Bedroom', 'Guest Bedroom', 'Kids Bedroom', 'Bedroom 4', 'Bedroom 5'],
  bathroom: ['Master Bathroom', 'Common Bathroom', 'Powder Room', 'Bathroom 4'],
};

export function polishRoomNames(
  rooms: Room[] | undefined,
  familyOf: (name: string) => string,
): Room[] {
  const list = rooms || [];

  // Only the generic labels are in play; anything the studio typed is theirs.
  const editable = list.filter(r => r?.name && !isScopeBucket(r.name) && GENERIC_LABEL.test(r.name.trim()));
  const byFamily = new Map<string, Room[]>();
  editable.forEach(r => {
    const f = familyOf(r.name);
    if (!byFamily.has(f)) byFamily.set(f, []);
    byFamily.get(f)!.push(r);
  });

  const rename = new Map<Room, string>();
  byFamily.forEach((members, family) => {
    if (members.length === 1) {
      const label = CANONICAL_LABEL[family];
      if (label) rename.set(members[0], label);
      return;
    }
    const ranks = FAMILY_RANKS[family];
    if (!ranks) return;   // several kitchens, say — numbering handles it
    [...members]
      .sort((a, z) => (z.size || 0) - (a.size || 0))
      .forEach((r, i) => rename.set(r, ranks[i] || `${ranks[0].split(' ').slice(-1)[0]} ${i + 1}`));
  });

  return list.map(r => (rename.has(r) ? { ...r, name: rename.get(r)! } : r));
}

/** The buckets a project has picked up, in canonical order. */
export function bucketsInUse(rooms: Room[] | undefined): ScopeBucket[] {
  const found = new Set(
    (rooms || []).map(r => asScopeBucket(r?.name)).filter((b): b is ScopeBucket => !!b),
  );
  return SCOPE_BUCKETS.filter(b => found.has(b));
}

/**
 * Which bucket a bank item belongs to when it is not tied to a room.
 *
 * Category first, because that is the studio's own classification and a name is
 * a description. "FLOOR PROTECTION" is Site Services however much it sounds
 * like flooring — the mistake that priced 1,039 units of dust sheeting.
 */
export function bucketForItem(item: Pick<Item, 'cat' | 'name'> | undefined): ScopeBucket {
  const cat = (item?.cat || '').toLowerCase();
  const name = (item?.name || '').toLowerCase();

  if (cat.includes('site service') || /debris|protection|cleaning|disposal|scaffold/.test(name)) {
    return 'Others';
  }
  if (cat.includes('paint') || cat.includes('electrical') || cat.includes('hvac')) {
    return 'Functional';
  }
  if (/false ceiling|pop\b/.test(name)) return 'Functional';
  if (cat.includes('civil') || cat.includes('plumbing')) return 'Civil';
  return 'Others';
}
