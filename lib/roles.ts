/*
  ONE PERSON, SEVERAL ROLES.

  A studio member may hold more than one role: the principal architect is an
  Admin and the Design Head. What they may do is everything any of their roles
  may do: who reviews drawings, runs meetings, opens a screen, asks all of
  them. Their "primary" role is the most senior one, and answers the
  questions about breadth -- whether they see the studio's money, whether
  they see only assigned projects -- which the database rules check too.
  The order makes that agree with the whole set: the roles that see money
  come first, and a Designer, the one role limited to assigned projects,
  comes after every role that sees them all.

  Shared by the app and the Cloud Functions; no imports.
*/

/** Most senior first. */
export const ROLE_ORDER = [
  'Super Admin', 'Owner', 'Admin', 'Ops Director', 'Design Head', 'Site Supervisor', 'Viewer', 'Designer', 'Vendor', 'Client',
] as const;

/** One role, several, or none. */
export type RoleSet = string | readonly string[] | null | undefined;

const rank = (r: string) => {
  const i = (ROLE_ORDER as readonly string[]).indexOf(r);
  return i < 0 ? ROLE_ORDER.length : i;
};

/** The roles as a clean list, most senior first, without repeats. */
export function rolesOf(r: RoleSet): string[] {
  const list = (Array.isArray(r) ? r : r ? [r] : []).map((x) => String(x || '').trim()).filter(Boolean);
  return [...new Set(list)].sort((a, b) => rank(a) - rank(b));
}

/** The most senior role, or '' when there is none. */
export const primaryRole = (r: RoleSet): string => rolesOf(r)[0] || '';

/** Whether any of the roles is in the set. */
export function hasRole(r: RoleSet, allowed: ReadonlySet<string> | readonly string[]): boolean {
  const has = (x: string) => (allowed instanceof Set ? allowed.has(x) : (allowed as readonly string[]).includes(x));
  return rolesOf(r).some(has);
}

/** A team row's roles: `roles` when it has them, with `role` (the older single field) folded in. */
export function memberRoles(m: { role?: unknown; roles?: unknown } | null | undefined): string[] {
  const list = Array.isArray(m?.roles) ? (m!.roles as unknown[]).map(String) : [];
  return rolesOf([...list, String(m?.role || '')]);
}

/** "Admin + Design Head". */
export const roleLabel = (r: RoleSet): string => rolesOf(r).join(' + ');
