import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formOf, formProblems, patchFor, keyAfter, emailWarning, mergesWith, otherPeople, type ClientForm } from '../../lib/clientEdit';
import { groupClients } from '../../lib/clientGroups';
import { classifyProject } from '../../lib/projectClassification';

const NOW = Date.parse('2026-11-25T12:00:00+05:30');
const project = (id: string, ctx: Record<string, any>): any => ({ id, lastModified: NOW, tiers: [], context: { projectCategory: 'actual', status: 'execution', ...ctx } });

const asha = [
  project('p1', { name: 'Asha Home', clientName: 'Asha Rao', clientEmail: 'asha@mail.com', clientPhone: '98200 11111', location: 'Thane', config: '3-BHK',
    clientContacts: [{ id: 'c1', name: 'Ravi Rao', role: 'Decides', email: 'ravi@mail.com', phone: null }] }),
  project('p2', { name: 'Asha Villa', clientName: 'Asha Rao', clientEmail: 'asha@mail.com', clientPhone: '98200 11111', location: 'Thane',
    clientContacts: [{ id: 'c9', name: 'Ravi', role: null, email: 'RAVI@mail.com', phone: null }, { id: 'c2', name: 'Meera', role: 'Kitchen', email: null, phone: '9000000000' }] }),
];
const [client] = groupClients(asha, { now: NOW });

describe('the Edit client form', () => {
  it('fills from the client and the project the card shows, with everyone else on the account once', () => {
    const f = formOf(client, asha[0]);
    expect(f).toMatchObject({ name: 'Asha Rao', phone: '98200 11111', email: 'asha@mail.com', home: 'Asha Home', place: 'Thane', config: '3-BHK', dummy: false });
    expect(f.people.map((p) => p.name)).toEqual(['Ravi Rao', 'Meera']);
    expect(otherPeople(asha, 'ravi@mail.com').map((p) => p.name)).toEqual(['Meera']);
  });

  it('needs a name, a real email and a whole phone number', () => {
    const ok = formOf(client, asha[0]);
    expect(formProblems(ok)).toEqual([]);
    expect(formProblems({ ...ok, name: ' ' })).toContain("Add the client's name.");
    expect(formProblems({ ...ok, email: 'asha@' })).toContain('The email does not look right.');
    expect(formProblems({ ...ok, phone: '9820' })).toContain('The phone needs at least 10 digits.');
    expect(formProblems({ ...ok, people: [{ id: 'x', name: '', role: null, email: 'z@z.com', phone: null }] })).toContain('Someone has no name.');
  });

  it('writes the same details to each project, and the home name only to the one shown', () => {
    const f: ClientForm = { ...formOf(client, asha[0]), phone: '98200 22222', home: 'Asha Residence', dummy: true };
    const a = patchFor(asha[0].context, f, true);
    const b = patchFor(asha[1].context, f, false);
    expect(a).toMatchObject({ clientPhone: '98200 22222', isDummy: true, projectCategory: 'dummy', name: 'Asha Residence', location: 'Thane' });
    expect(b.clientPhone).toBe('98200 22222');
    expect(b).not.toHaveProperty('name');
    expect(classifyProject({ context: { ...asha[1].context, ...b } })).toBe('test');
  });

  it('a phone edit on a client with two projects reaches both', () => {
    const f: ClientForm = { ...formOf(client, asha[0]), phone: '91234 56789' };
    const after = client.projects.map((p) => ({ ...p, context: { ...p.context, ...patchFor(p.context, f, p.id === 'p1') } }));
    expect(after.map((p) => p.context.clientPhone)).toEqual(['91234 56789', '91234 56789']);
    expect(groupClients(after, { now: NOW })).toHaveLength(1);
  });

  it("keeps a project's further email addresses when the main one changes", () => {
    const f: ClientForm = { ...formOf(client, asha[0]), email: 'asha.rao@mail.com' };
    expect(patchFor({ clientEmail: 'asha@mail.com, office@asha.in' }, f, true).clientEmail).toBe('asha.rao@mail.com, office@asha.in');
    expect(patchFor(asha[1].context, f, false).clientEmail).toBe('asha.rao@mail.com');
  });

  it('warns that their portal sign-in stays on the old email', () => {
    const before = formOf(client, asha[0]);
    expect(emailWarning(before, before)).toBeNull();
    expect(emailWarning(before, { ...before, email: 'ASHA@mail.com' })).toBeNull();
    expect(emailWarning(before, { ...before, email: 'asha.rao@mail.com' }))
      .toBe('Asha Rao signs in with asha@mail.com. Their sign-in stays on the old email until you give access again.');
  });

  it('follows the client to their new key, and says when two clients become one', () => {
    const other = project('p9', { name: 'Other', clientName: 'Asha R', clientEmail: 'asha@mail.com' });
    const all = groupClients([...asha, other], { now: NOW });
    const f = formOf(client, asha[0]);
    expect(keyAfter({ ...f, name: 'Asha R' })).toBe('asha@mail.com|asha r');
    expect(mergesWith(all, client.clientKey, { ...f, name: 'Asha R' })?.clientName).toBe('Asha R');
    expect(mergesWith(all, client.clientKey, f)).toBeNull();
    expect(mergesWith(all, client.clientKey, { ...f, name: 'Someone New' })).toBeNull();
  });
});

describe('who edits, and New client', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8');

  it('offers Edit only to the roles that give portal access', () => {
    const src = read('components/ClientsDirectory.tsx');
    expect(src).toMatch(/const canEdit = canPortal && !!onUpdateClientProject;/);
    expect(src).toMatch(/const CLIENT_LOGIN_ROLES = \['Super Admin', 'Owner', 'Admin', 'Ops Director'\];/);
    expect(src).toMatch(/onEdit=\{canEdit \? openEdit : undefined\}/);
  });

  it('starts a new client as a lead with the details filled in, through the same start window', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/setStartPrefill\(\{ name: client\.name, phone: client\.phone, email: client\.email, where: client\.where \}\);/);
    expect(app).toMatch(/onCreateClient=\{handleCreateNewClient\}/);
    expect(read('components/projects/StartProjectModal.tsx')).toMatch(/useState\(!!prefill\)/);
  });
});
