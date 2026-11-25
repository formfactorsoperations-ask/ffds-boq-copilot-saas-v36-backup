/*
  EDIT CLIENT / NEW CLIENT (DESIGN.md "Clients: conversations"; handoff 5.5).

  A client is not a record of its own: it is the projects that share an email
  and a name (lib/clientGroups). So editing a client writes the same details
  back to every one of its projects:

    - client name, phone and email (the email is their portal username);
    - area / city (`location`) and home type (`config`);
    - Actual / Dummy (`isDummy` and `projectCategory`);
    - the people on the account (`clientContacts`).

  The home or project name is each project's own, so it is written only to the
  project the card shows. There is no address and no "referred by" (owner's
  decision D5).

  Changing the email or the name changes the grouping key: the screen follows
  the client to the new one, and if another client already has it the two
  become one ("Merged with …"). Changing the email does not touch their portal
  login, which stays on the old email until access is given again.

  Pure, so the tests run it.
*/
import { clientKeyOf, type AggregatedClient } from './clientGroups';
import { contactProblems, isEmail, normEmail, splitEmails, type ClientContact } from './clientContacts';

export interface ClientForm {
  name: string;
  phone: string;
  email: string;
  /** The project the card shows: its name is edited here, the others keep theirs. */
  home: string;
  place: string;
  config: string;
  dummy: boolean;
  /** Everyone on the account besides the main contact. */
  people: ClientContact[];
}

/** The people on the account across its projects, each once, the main contact left out. */
export function otherPeople(projects: Array<{ context?: any }>, mainEmail: string): ClientContact[] {
  const out: ClientContact[] = [];
  const seen = new Set<string>([normEmail(mainEmail)].filter(Boolean));
  for (const p of projects) {
    for (const c of ((p.context?.clientContacts || []) as ClientContact[])) {
      if (!c || !(String(c.name || '').trim() || isEmail(c.email))) continue;
      const key = isEmail(c.email) ? normEmail(c.email) : `name:${String(c.name || '').trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: String(c.id || key), name: String(c.name || '').trim(), role: c.role || null, email: isEmail(c.email) ? String(c.email).trim() : null, phone: String(c.phone || '').trim() || null });
    }
  }
  return out;
}

/** The form, filled from the client and the project the card shows. */
export function formOf(client: AggregatedClient, primary: { context?: any }): ClientForm {
  const ctx = primary?.context || {};
  const email = splitEmails(ctx.clientEmail || client.clientEmail)[0] || '';
  return {
    name: client.clientName === 'Unknown Client' ? '' : client.clientName,
    phone: client.clientPhone || '',
    email,
    home: String(ctx.name || ''),
    place: client.clientLocation || '',
    config: String(ctx.config || client.configs[0] || ''),
    dummy: client.isDummy,
    people: otherPeople(client.projects, email),
  };
}

/** What is wrong with the form, in words; empty when it can be saved. */
export function formProblems(f: ClientForm): string[] {
  const out: string[] = [];
  if (!f.name.trim()) out.push('Add the client\'s name.');
  if (f.email.trim() && !isEmail(f.email)) out.push('The email does not look right.');
  const digits = f.phone.replace(/[^0-9]/g, '');
  if (f.phone.trim() && digits.length < 10) out.push('The phone needs at least 10 digits.');
  if (f.people.some((p) => !String(p.name || '').trim())) out.push('Someone has no name.');
  out.push(...contactProblems({ clientName: f.name, clientEmail: f.email, clientPhone: f.phone, clientContacts: f.people }));
  return [...new Set(out)];
}

/** The email field keeps any further addresses a project already had after the main one. */
function withMainEmail(existing: unknown, main: string): string {
  const rest = splitEmails(existing).slice(1).filter((e) => normEmail(e) !== normEmail(main));
  return [main.trim(), ...rest].filter(Boolean).join(', ');
}

/** The changes to write to one of the client's projects. */
export function patchFor(ctx: any, f: ClientForm, isPrimary: boolean): Record<string, any> {
  return {
    clientName: f.name.trim(),
    clientPhone: f.phone.trim(),
    clientEmail: withMainEmail(ctx?.clientEmail, f.email),
    location: f.place.trim(),
    config: f.config.trim(),
    isDummy: f.dummy,
    projectCategory: f.dummy ? 'dummy' : 'actual',
    clientContacts: f.people.map((c) => ({ id: c.id, name: String(c.name || '').trim(), role: c.role || null, email: c.email ? String(c.email).trim() : null, phone: c.phone ? String(c.phone).trim() : null })),
    ...(isPrimary && f.home.trim() ? { name: f.home.trim() } : {}),
  };
}

/** The client's key after the edit (lib/clientGroups). */
export const keyAfter = (f: ClientForm) => clientKeyOf(f.email.trim(), f.name.trim());

/** Their portal username changes: the warning to show before saving, or null. */
export function emailWarning(before: ClientForm, after: ClientForm): string | null {
  if (!before.email.trim() || normEmail(before.email) === normEmail(after.email)) return null;
  return `${after.name.trim() || before.name} signs in with ${before.email.trim()}. Their sign-in stays on the old email until you give access again.`;
}

/** Another client already at the new key: the edit makes the two one. */
export function mergesWith(clients: AggregatedClient[], selfKey: string, f: ClientForm): AggregatedClient | null {
  const key = keyAfter(f);
  if (key === selfKey) return null;
  return clients.find((c) => c.clientKey === key) || null;
}
