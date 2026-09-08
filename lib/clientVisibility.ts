/**
 * What the client is allowed to see.
 *
 * ── The problem this replaces ────────────────────────────────────────────────
 * The portal decided what to hide by checking, in six separate places, five
 * different fields: `isInternal`, `isPrivate`, `clientVisible === false`,
 * `shareWithClient === false`, and `visibility === 'internal' | 'private'`.
 *
 * Every one was a *hide* flag, so anything ops created was visible to the
 * client by default and stayed visible unless someone remembered the right one
 * of five names. For a surface carrying financials, drawings and contracts,
 * that is the wrong default and the wrong number of names.
 *
 * ── The model ───────────────────────────────────────────────────────────────
 * One field, `clientVisibility`, on every publishable item. Absent means draft
 * means the client sees nothing. Ops publishes deliberately, and every publish
 * is stamped with who and when so "I was never shown this" has an answer.
 *
 * Read state through `isVisibleToClient`. Never test the raw field, and never
 * add a sixth alias.
 */

export type ClientVisibilityState = 'draft' | 'published' | 'hidden';

export interface ClientVisibility {
  state: ClientVisibilityState;
  /** ISO string. Set on the transition into `published`. */
  publishedAt?: string;
  /** uid or email of whoever published it. */
  publishedBy?: string;
  /** Recorded when ops pulls something back, so the reason survives. */
  hiddenAt?: string;
  hiddenReason?: string;
}

/** Anything that can be shown to or withheld from a client. */
export interface Publishable {
  clientVisibility?: ClientVisibility;
  [key: string]: any;
}

/**
 * The legacy hide-flags, in the order the portal used to check them. Retained
 * only so un-migrated records still behave sanely; nothing new should set them.
 */
function legacyWantsHidden(item: Publishable): boolean {
  return (
    item?.isInternal === true ||
    item?.isPrivate === true ||
    item?.clientVisible === false ||
    item?.shareWithClient === false ||
    item?.visibility === 'internal' ||
    item?.visibility === 'private'
  );
}

/**
 * Whether an item may be shown to the client.
 *
 * The single gate. Every client-facing read path goes through this, so the rule
 * lives in one place and can be changed in one place.
 */
export function isVisibleToClient(item: Publishable | null | undefined): boolean {
  if (!item) return false;
  const v = item.clientVisibility;

  // Migrated items answer for themselves.
  if (v?.state) return v.state === 'published';

  // Un-migrated: an explicit legacy hide still hides. Everything else is
  // treated as draft — not visible — because defaulting to visible is exactly
  // the leak this model exists to close.
  if (legacyWantsHidden(item)) return false;
  return false;
}

/** True when the item has not yet been through the migration. */
export function isUnmigrated(item: Publishable | null | undefined): boolean {
  return !!item && !item.clientVisibility?.state;
}

export function publish(by?: string): ClientVisibility {
  return { state: 'published', publishedAt: new Date().toISOString(), publishedBy: by };
}

export function hide(reason?: string, prior?: ClientVisibility): ClientVisibility {
  return {
    ...(prior || { state: 'hidden' }),
    state: 'hidden',
    hiddenAt: new Date().toISOString(),
    hiddenReason: reason
  };
}

export function draft(): ClientVisibility {
  return { state: 'draft' };
}

/**
 * Move one legacy record onto the model.
 *
 * Anything the old flags explicitly hid becomes `hidden`, keeping ops' original
 * intent. Everything else becomes `draft` — deliberately not `published`. The
 * old default was "visible unless flagged", so publishing wholesale would carry
 * forward every item nobody remembered to hide.
 */
export function migrateVisibility(item: Publishable): ClientVisibility {
  if (item?.clientVisibility?.state) return item.clientVisibility;
  return legacyWantsHidden(item)
    ? { state: 'hidden', hiddenAt: new Date().toISOString(), hiddenReason: 'Carried over from previous internal-only flag' }
    : { state: 'draft' };
}

/**
 * The bulk restore: publish everything a project already had, up to a cut-off.
 *
 * Migration leaves live portals empty, which is safe but abrupt for a client
 * mid-project. This is the one click that puts back what they could already
 * see, without also publishing anything ops had hidden on purpose.
 *
 * `dateOf` reads whatever timestamp that item type carries; items with no date
 * are included, since an undated record is usually older than the cut-off.
 */
export function publishEverythingUpTo<T extends Publishable>(
  items: T[],
  cutoff: Date,
  by?: string,
  dateOf: (item: T) => string | number | undefined = (i) => i.date || i.createdAt || i.issuedAt
): T[] {
  const stamp = publish(by);
  return (items || []).map((item) => {
    const current = item.clientVisibility?.state ?? migrateVisibility(item).state;
    // Never resurrect something ops deliberately hid.
    if (current === 'hidden') return item;
    const raw = dateOf(item);
    const when = raw ? new Date(raw).getTime() : 0;
    if (raw && !isNaN(when) && when > cutoff.getTime()) return item;
    return { ...item, clientVisibility: stamp };
  });
}

/** Convenience for ops-facing lists: how a project's items break down. */
export function visibilityBreakdown(items: Publishable[]): {
  published: number; draft: number; hidden: number; unmigrated: number;
} {
  const out = { published: 0, draft: 0, hidden: 0, unmigrated: 0 };
  (items || []).forEach((i) => {
    if (isUnmigrated(i)) out.unmigrated++;
    const s = i.clientVisibility?.state ?? migrateVisibility(i).state;
    if (s === 'published') out.published++;
    else if (s === 'hidden') out.hidden++;
    else out.draft++;
  });
  return out;
}
