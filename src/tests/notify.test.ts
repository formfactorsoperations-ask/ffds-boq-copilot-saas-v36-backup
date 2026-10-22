import { describe, it, expect } from 'vitest';
import {
  approversOf, clientActionDraft, escalationDraft, foldGroups, foldedTitle, initialsOf, isOpen, leadDraft,
  peopleDrafts, resolveAudience, reviewDraft, siteDraft, stamp, tabCounts, type Stored,
} from '../../lib/notify';
import type { Person } from '../../lib/peopleDesk';

const team = [
  { id: 'tm-owner', name: 'Vikram Kale', email: 'Vikram@ff.in', role: 'Owner' },
  { id: 'tm-od', name: 'Meera Das', email: 'meera@ff.in', role: 'Ops Director' },
  { id: 'tm-cr', name: 'Riya Menon', email: 'riya@ff.in', role: 'Client Relations' },
  { id: 'tm-cr2', name: 'Kabir Shah', email: 'kabir@ff.in', role: 'Client Relations' },
  { id: 'tm-dh', name: 'Tanvi Desai', email: 'tanvi@ff.in', role: 'Admin', roles: ['Design Head'] },
  { id: 'tm-des', name: 'Arjun Rao', email: 'arjun@ff.in', role: 'Designer' },
  { id: 'tm-site', name: 'Sanjay K', email: 'sanjay@ff.in', role: 'Site Supervisor' },
  { id: 'tm-client', name: 'A client typed in', email: 'client@home.in', role: 'Client' },
];
const project = { actor: 'Mr Prasad Naik', projectId: 'p1', projectName: 'Harmony 704' };

describe('who is told', () => {
  it('a client message goes to Client Relations on the project and the Ops Director, nobody else', () => {
    const d = clientActionDraft({ type: 'sendMessage', text: 'Please keep the wardrobe in walnut.' }, project)!;
    expect(d.level).toBe('needs');
    expect(d.route).toBe('comms-tracker');
    const to = resolveAudience(d.to, { team, assigned: ['riya@ff.in', 'arjun@ff.in'] });
    expect(to.sort()).toEqual(['meera@ff.in', 'riya@ff.in']);
  });

  it('reads a person\'s extra roles, lowercases addresses and never includes clients', () => {
    const to = resolveAudience({ roles: ['Design Head', 'Owner', 'Client'], emails: ['client@home.in'] }, { team });
    expect(to.sort()).toEqual(['tanvi@ff.in', 'vikram@ff.in']);
  });

  it('never tells the person who made the change', () => {
    const to = resolveAudience({ roles: ['Ops Director', 'Owner'] }, { team, actorEmail: 'MEERA@ff.in' });
    expect(to).toEqual(['vikram@ff.in']);
  });

  it('drops addresses that are not on the team', () => {
    expect(resolveAudience({ emails: ['stranger@x.com', 'riya@ff.in'] }, { team })).toEqual(['riya@ff.in']);
  });

  it('finds Site Supervisors by the site list as well as the assignment', () => {
    const d = siteDraft({ type: 'resolveBlocker', blockerId: 'b1' }, { ...project, actor: 'Meera Das' })!;
    const to = resolveAudience(d.to, { team, assigned: ['riya@ff.in'], site: ['sanjay@ff.in'], actorEmail: 'meera@ff.in' });
    expect(to.sort()).toEqual(['riya@ff.in', 'sanjay@ff.in']);
  });
});

describe('client portal actions', () => {
  it('only some actions interrupt, and reading is left for a summary', () => {
    const lv = (type: string, extra = {}) => clientActionDraft({ type, ...extra }, project)?.level ?? null;
    expect(lv('requestIssueChanges', { message: 'x' })).toBe('needs');
    expect(lv('raiseDispute', { reason: 'x' })).toBe('needs');
    expect(lv('querySelection', { question: 'x' })).toBe('needs');
    expect(lv('approveIssue', { name: 'P Naik' })).toBe('update');
    expect(lv('signDocument', { docType: 'contract' })).toBe('update');
    expect(lv('documentView')).toBeNull();
    expect(lv('documentDownload')).toBeNull();
  });

  it('names the document that was signed and quotes what the client wrote, clipped', () => {
    expect(clientActionDraft({ type: 'signDocument', docType: 'contract' }, project)!.title).toBe('Mr Prasad Naik signed the Execution Agreement');
    const long = 'a'.repeat(300);
    const line = clientActionDraft({ type: 'sendMessage', text: long }, project)!.line;
    expect(line.length).toBeLessThanOrEqual(122);
    expect(line.startsWith('“')).toBe(true);
  });

  it('a question about a finish goes to the project\'s Designer and Client Relations', () => {
    const d = clientActionDraft({ type: 'querySelection', question: 'Matte or gloss?' }, project)!;
    expect(resolveAudience(d.to, { team, assigned: ['arjun@ff.in', 'kabir@ff.in'] }).sort()).toEqual(['arjun@ff.in', 'kabir@ff.in']);
  });
});

describe('People', () => {
  const p = (id: string, accessRole: Person['accessRole'], managerId = '', email = `${id}@ff.in`): Person =>
    ({ id, name: id[0].toUpperCase() + id.slice(1) + ' Test', title: '', teamId: 't', managerId, accessRole, active: true, email });
  const people = [p('boss', 'admin'), p('ops', 'ops'), p('lead', 'manager'), p('riya', 'employee', 'lead'), p('solo', 'employee')];
  const tz = 'Asia/Kolkata';

  it('goes to the person\'s manager, or to Ops and admins when they have none', () => {
    expect(approversOf(people[3], people)).toEqual(['lead@ff.in']);
    expect(approversOf(people[4], people).sort()).toEqual(['boss@ff.in', 'ops@ff.in']);
  });

  it('a check-in is an update for the manager, grouped by day, and says when it was late', () => {
    const session = { id: 'at1', employeeId: 'riya', date: '2026-10-22', checkIn: '2026-10-22T05:01:00.000Z', mode: 'WFH' as const, site: '', version: 1 };
    const [d] = peopleDrafts({ action: 'checkin', session }, { actor: people[3], employee: people[3], people, timezone: tz, late: true });
    expect(d).toMatchObject({ level: 'update', group: 'checkin:2026-10-22', title: 'Riya Test checked in late', route: 'people' });
    expect(d.line).toBe('10:31 AM · from home');
    expect(d.to.emails).toEqual(['lead@ff.in']);
  });

  it('a leave request needs the approver; the decision goes back to the person who asked', () => {
    const request = { id: 'rq1', employeeId: 'riya', kind: 'leave' as const, type: 'PL' as const, start: '2026-10-23', end: '2026-10-24', portion: 'Full day' as const, days: [{ date: '2026-10-23', units: 1 }, { date: '2026-10-24', units: 1 }], reason: '', status: 'Pending' as const, version: 1, createdAt: '', decisions: [] };
    const [ask] = peopleDrafts({ action: 'request', request }, { actor: people[3], employee: people[3], people, timezone: tz });
    expect(ask).toMatchObject({ level: 'needs', title: 'Riya Test asked for planned leave', line: '2026-10-23 to 2026-10-24 · 2 days', action: 'Review' });
    const [told] = peopleDrafts({ action: 'decide', request: { ...request, status: 'Approved' } }, { actor: people[2], employee: people[3], people, timezone: tz });
    expect(told).toMatchObject({ level: 'update', title: 'Your planned leave was approved' });
    expect(told.to.emails).toEqual(['riya@ff.in']);
  });

  it('a correction the person approved themselves tells nobody', () => {
    const request = { id: 'rq2', employeeId: 'boss', kind: 'correction' as const, type: 'PL' as const, start: '2026-10-20', end: '2026-10-20', portion: 'Full day' as const, days: [], reason: '', status: 'Approved' as const, version: 1, createdAt: '', decisions: [] };
    expect(peopleDrafts({ action: 'correction', request }, { actor: people[0], employee: people[0], people, timezone: tz })).toEqual([]);
  });
});

describe('the other server calls', () => {
  it('an escalation needs the leads; its decision goes back to whoever raised it', () => {
    const esc = { title: 'Payment unanswered: Milestone 2', projectName: 'Harmony 704', raisedBy: 'riya@ff.in', decision: 'Call them' };
    expect(escalationDraft(esc, 'raised', { projectId: 'p1', leads: ['vikram@ff.in'], projectOps: [] }).to.emails).toEqual(['vikram@ff.in']);
    expect(escalationDraft(esc, 'decided', { projectId: 'p1', leads: [], projectOps: ['kabir@ff.in'] }).to.emails).toEqual(['riya@ff.in']);
    expect(escalationDraft({ ...esc, auto: true }, 'decided', { projectId: 'p1', leads: [], projectOps: ['kabir@ff.in'] }).to.emails).toEqual(['kabir@ff.in']);
  });

  it('a sheet sent for review needs the Design Head; a returned one needs its designer', () => {
    const p = { projectId: 'p1', projectName: 'Harmony 704', sheet: 'Kitchen elevation', actor: 'Arjun Rao', designerEmail: 'arjun@ff.in' };
    expect(reviewDraft('submit', p)!.to.roles).toEqual(['Design Head']);
    expect(reviewDraft('return', { ...p, actor: 'Tanvi Desai' })!).toMatchObject({ level: 'needs', title: 'Kitchen elevation came back with changes' });
    expect(reviewDraft('approve', { ...p, designerEmail: null })).toBeNull();
  });

  it('a blocker needs the project\'s Client Relations and the leads; other site actions are quieter', () => {
    const d = siteDraft({ type: 'blocker', text: 'Waiting on the ceiling drawing' }, { ...project, actor: 'Sanjay K' })!;
    expect(d).toMatchObject({ level: 'needs', title: 'Site blocked at Harmony 704', route: 'site-ops' });
    expect(siteDraft({ type: 'material' }, { ...project, actor: 'Sanjay K' })).toBeNull();
  });

  it('a website enquiry goes to its owner and the Ops Director', () => {
    const d = leadDraft({ name: 'Aditi Joshi', wants: 'Kitchen, Wardrobes', home: '3 BHK, Baner' }, 'Riya@ff.in');
    expect(resolveAudience(d.to, { team }).sort()).toEqual(['meera@ff.in', 'riya@ff.in']);
    expect(d.line).toBe('Kitchen, Wardrobes · 3 BHK, Baner');
  });
});

describe('in the app', () => {
  const n = (id: string, over: Partial<Stored> = {}): Stored => ({
    ...stamp({ kind: 'people.checkin', area: 'team', level: 'update', title: `${id} checked in`, line: '', projectId: null, projectName: null, route: 'people', action: null, actor: id, group: 'checkin:2026-10-22', to: {} }, 1000),
    id, ...over,
  });

  it('folds a burst of check-ins into one entry, newest first', () => {
    const folded = foldGroups([n('a', { at: 1 }), n('b', { at: 3 }), n('c', { at: 2 }), n('d', { group: null, kind: 'client.message', at: 4 })]);
    expect(folded.map((f) => [f.id, f.count])).toEqual([['d', 1], ['b', 3]]);
    expect(foldedTitle(folded[1])).toBe('3 people checked in');
  });

  it('leaves out what is done or snoozed, until the snooze ends', () => {
    expect(isOpen({ doneAt: 5, snoozedUntil: null })).toBe(false);
    expect(isOpen({ doneAt: null, snoozedUntil: 2000 }, 1000)).toBe(false);
    expect(isOpen({ doneAt: null, snoozedUntil: 2000 }, 3000)).toBe(true);
  });

  it('counts what needs you, and unread updates, by top-bar tab', () => {
    const counts = tabCounts([n('a'), n('b', { readAt: 5 }), n('c', { level: 'needs', area: 'clients' }), n('d', { level: 'needs', area: 'clients', doneAt: 9 })]);
    expect(counts).toEqual({ people: { needs: 0, unread: 1 }, 'ops-desk': { needs: 1, unread: 0 } });
  });

  it('makes initials from a name, without the title', () => {
    expect(initialsOf('Mr Prasad Naik')).toBe('PN');
    expect(initialsOf('Riya')).toBe('R');
    expect(initialsOf('')).toBe('S');
  });
});
