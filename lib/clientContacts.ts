/*
  EVERYONE ON THE CLIENT'S SIDE.

  A project used to hold one client: a name, an email and a phone. Couples,
  parents and the family architect could not be added, so only one person
  could have a portal login or receive the minutes.

  The main contact stays exactly where it was (clientName, clientEmail,
  clientPhone), so the thirty-odd screens and documents that read those keep
  working unchanged: agreements are still signed by the main contact. The
  others are kept in `clientContacts`. Each person with an email can have
  their own portal login (the portal is opened by each login's own list of
  projects, so nothing else about the portal changes); `clientPortal`
  records, per email, when access was given or taken away.

  No imports from the app: shared by the screens and tests.
*/

export interface ClientContact {
  id: string;
  name: string;
  /** "Wife", "Father", "Their architect"... */
  role?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface PortalAccessMark {
  issuedAt?: number | null;
  issuedBy?: string | null;
  revokedAt?: number | null;
  revokedBy?: string | null;
}

export interface ClientPerson extends ClientContact {
  main: boolean;
  portal: 'on' | 'off' | 'none';
}

const EMAIL_RX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const isEmail = (s: unknown) => EMAIL_RX.test(String(s || '').trim());
export const normEmail = (s: unknown) => String(s || '').trim().toLowerCase();

/** The emails in a field that may hold several ("a@x.in, b@x.in"). */
export function splitEmails(s: unknown): string[] {
  return String(s || '').split(/[,;\s]+/).map((e) => e.trim()).filter(isEmail);
}

function portalOf(ctx: any, email: string | null | undefined): ClientPerson['portal'] {
  if (!isEmail(email)) return 'none';
  const m: PortalAccessMark | undefined = ctx?.clientPortal?.[normEmail(email)];
  return m?.issuedAt && !(m.revokedAt && m.revokedAt > m.issuedAt) ? 'on' : 'off';
}

/**
 * Everyone on the client's side, main contact first. A main email field that
 * holds several addresses (as some projects were saved) gives one person per
 * address, the first keeping the name.
 */
export function clientPeople(ctx: any): ClientPerson[] {
  const out: ClientPerson[] = [];
  const seen = new Set<string>();
  const mainEmails = splitEmails(ctx?.clientEmail);
  const mainName = String(ctx?.clientName || '').trim();
  const mainPhone = String(ctx?.clientPhone || '').trim() || null;
  if (mainName || mainEmails.length || mainPhone) {
    const email = mainEmails[0] || null;
    out.push({ id: 'main', name: mainName || email || 'Client', email, phone: mainPhone, role: null, main: true, portal: portalOf(ctx, email) });
    if (email) seen.add(normEmail(email));
  }
  mainEmails.slice(1).forEach((e, i) => {
    if (seen.has(normEmail(e))) return;
    seen.add(normEmail(e));
    out.push({ id: `main-${i + 1}`, name: e, email: e, phone: null, role: null, main: false, portal: portalOf(ctx, e) });
  });
  for (const c of (Array.isArray(ctx?.clientContacts) ? ctx.clientContacts : []) as ClientContact[]) {
    if (!c || !(String(c.name || '').trim() || isEmail(c.email))) continue;
    const key = normEmail(c.email);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push({
      id: String(c.id || key || out.length), name: String(c.name || c.email || '').trim(), role: c.role || null,
      email: isEmail(c.email) ? String(c.email).trim() : null, phone: String(c.phone || '').trim() || null,
      main: false, portal: portalOf(ctx, c.email),
    });
  }
  return out;
}

/** Every email on the client's side, main contact first, each once. */
export const clientEmails = (ctx: any): string[] => clientPeople(ctx).map((p) => p.email || '').filter(Boolean);

/** Who is signed in to the portal, by their login email. */
export function personByEmail(ctx: any, email: unknown): ClientPerson | null {
  const key = normEmail(email);
  return key ? clientPeople(ctx).find((p) => normEmail(p.email) === key) || null : null;
}

/** The context with portal access marked given or taken away for one email. */
export function withPortalMark(ctx: any, email: string, on: boolean, by: string | null, now: number = Date.now()) {
  const key = normEmail(email);
  const prev: PortalAccessMark = ctx?.clientPortal?.[key] || {};
  const mark: PortalAccessMark = on
    ? { issuedAt: now, issuedBy: by, revokedAt: null, revokedBy: null }
    : { ...prev, revokedAt: now, revokedBy: by };
  return { ...ctx, clientPortal: { ...(ctx?.clientPortal || {}), [key]: mark } };
}

/** Checks on the people before they are saved: a readable list of what is wrong. */
export function contactProblems(ctx: any): string[] {
  const out: string[] = [];
  const seen = new Map<string, string>();
  for (const p of clientPeople(ctx)) {
    if (!p.name.trim()) out.push('Someone has no name.');
    const k = normEmail(p.email);
    if (k) {
      if (seen.has(k)) out.push(`${p.email} is listed twice.`);
      seen.set(k, p.name);
    }
  }
  for (const c of (ctx?.clientContacts || []) as ClientContact[]) {
    if (c?.email && !isEmail(c.email)) out.push(`${c.name || 'Someone'}'s email does not look right.`);
  }
  return out;
}
