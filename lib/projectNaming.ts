/**
 * Telling two projects with the same name apart.
 *
 * Sixteen projects were called "New Project". Nine of them were empty, but
 * seven had real BOQs — 244 lines in one — and nothing on the list distinguished
 * them. Finding a specific one meant opening them in turn, and any report that
 * groups by name silently merged them.
 *
 * The cause is not the list, it is the birth: every new project is handed the
 * same default name and most are never renamed. So this does two jobs — it
 * hands a new project a name that is already distinct, and where names collide
 * anyway it says what tells them apart.
 *
 * The distinguishing detail is the CLIENT where there is one, and the date the
 * project was created where there is not. That ordering is deliberate: asked to
 * find one of the sixteen, the client name was what identified it. A date only
 * separates projects made on different days, and six of these were made on the
 * same one.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * When the project was made, read out of its own id.
 *
 * Ids are minted as `${Date.now().toString(36)}-${random}-${n}`, so the created
 * time is already in there and does not need a field that older projects would
 * not have. Range-checked rather than trusted: an id in another shape decodes
 * to something absurd, and a project stamped 1973 is worse than no date at all.
 */
export function createdAtFromId(id: string): number | null {
  const head = String(id || '').split('-')[0];
  if (!head) return null;
  const ms = parseInt(head, 36);
  if (!Number.isFinite(ms)) return null;
  const year2015 = 1420070400000;
  const soon = Date.now() + 365 * 24 * 60 * 60 * 1000;
  return ms > year2015 && ms < soon ? ms : null;
}

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function shortTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const createdMs = (p: any): number =>
  createdAtFromId(p?.id) ?? (Number(p?.lastModified) || 0);

/**
 * The detail that tells this project from another wearing the same name.
 *
 * `level` escalates only when the level below it did not separate them. The
 * first attempt at this stopped at the date and produced SEVEN rows reading
 * "New Project · 30 Aug" — which is worse than leaving them alone, because a
 * row that looks disambiguated and is not invites picking the wrong one.
 */
export function projectSuffix(p: any, level: 0 | 1 = 0): string {
  const client = String(p?.context?.clientName || '').trim();
  const ms = createdMs(p);

  if (level === 0) return client || (ms ? shortDate(ms) : '');

  // Everything available, for the handful a client or a date could not split.
  if (client && ms) return `${client} · ${shortDate(ms)}`;
  if (client) return client;
  return ms ? `${shortDate(ms)}, ${shortTime(ms)}` : '';
}

export const nameOf = (p: any): string =>
  String(p?.context?.name || (p as any)?.name || '').trim() || 'Unnamed Project';

/**
 * Display names for a whole list, suffixed only where they collide.
 *
 * A project whose name is already unique is left completely alone — appending
 * a client to every row would be noise on the many to solve the few, and the
 * card shows the client underneath already.
 */
export function buildDisplayNames(projects: any[]): Map<string, string> {
  const counts = new Map<string, number>();
  (projects || []).forEach((p) => {
    const n = nameOf(p).toLowerCase();
    counts.set(n, (counts.get(n) || 0) + 1);
  });

  const out = new Map<string, string>();
  const colliding: any[] = [];

  (projects || []).forEach((p) => {
    if (!p?.id) return;
    const name = nameOf(p);
    if ((counts.get(name.toLowerCase()) || 0) < 2) out.set(p.id, name);
    else colliding.push(p);
  });

  const label = (p: any, level: 0 | 1) => {
    const suffix = projectSuffix(p, level);
    return suffix ? `${nameOf(p)} · ${suffix}` : nameOf(p);
  };

  /*
    Three passes, each only over what the one before failed to separate.

    A date splits most of them; it does not split the seven started on 30 August,
    and nothing derivable splits two rows with the same client and the same
    minute. So the detail escalates, and a number is the last resort rather than
    the first — it is the only one of the three that carries no meaning.
  */
  const resolve = (group: any[], level: 0 | 1) => {
    const buckets = new Map<string, any[]>();
    group.forEach((p) => {
      const key = label(p, level);
      buckets.set(key, [...(buckets.get(key) || []), p]);
    });

    buckets.forEach((members, key) => {
      if (members.length === 1) { out.set(members[0].id, key); return; }
      if (level === 0) { resolve(members, 1); return; }

      // Oldest first, so the numbering does not reshuffle when one is renamed.
      [...members]
        .sort((a, b) => createdMs(a) - createdMs(b))
        .forEach((p, i) => out.set(p.id, `${key} (${i + 1})`));
    });
  };

  if (colliding.length) resolve(colliding, 0);
  return out;
}

/**
 * A name for a project being created now, distinct from the ones that exist.
 *
 * Dated rather than numbered, so the name still says something a month later.
 * The counter only appears when a second project is started the same day, which
 * is the one case a date cannot separate.
 */
export function nextDefaultProjectName(base: string, projects: any[]): string {
  const taken = new Set((projects || []).map((p) => nameOf(p).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;

  const dated = `${base} · ${shortDate(Date.now())}`;
  if (!taken.has(dated.toLowerCase())) return dated;

  for (let n = 2; n < 500; n++) {
    const candidate = `${dated} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return dated;
}
