import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { clientKeyOf, groupClients } from '../../lib/clientGroups';
import { buildRows, filterRows, sortRows, matchesSearch, hasNewActivity, isQuiet, lineText, primaryProject, type SeenMarks } from '../../lib/clientList';
import type { FollowUp } from '../../lib/opsDesk';

const NOW = Date.parse('2026-11-25T12:00:00+05:30');
const DAY = 86400000;

const project = (id: string, ctx: Record<string, any>, extra: Record<string, any> = {}): any => ({
  id, lastModified: NOW - DAY, tiers: [], activeTierId: null, activeProject: null,
  context: { projectCategory: 'actual', status: 'execution', ...ctx }, ...extra,
});

const line = (projectId: string, daysAgo: number, over: Partial<FollowUp> = {}): FollowUp => ({
  id: `${projectId}-${daysAgo}`, tenantId: 't', projectId, projectName: '', at: NOW - daysAgo * DAY, by: 'a@studio', byName: 'A',
  channel: 'whatsapp', note: 'Sent the update', subject: null, outcome: 'reminded', next: null, nextDone: false, manual: true, ...over,
});

describe('the client grouping key', () => {
  it('is email AND name, lower-cased and trimmed', () => {
    expect(clientKeyOf(' Girish@Mail.com ', 'Mr. Girish ')).toBe('girish@mail.com|mr. girish');
    expect(clientKeyOf(null, 'Asha')).toBe('|asha');
  });

  it('keeps a shared inbox from merging different people, and merges a real repeat client', () => {
    const list = groupClients([
      project('a', { clientEmail: 'studio@ffds.in', clientName: 'Asha' }),
      project('b', { clientEmail: 'studio@ffds.in', clientName: 'Ravi' }),
      project('c', { clientEmail: 'asha@mail.com', clientName: 'Asha Rao' }),
      project('d', { clientEmail: 'ASHA@mail.com', clientName: 'asha rao' }),
      project('e', {}),
    ], { now: NOW });
    expect(list.map((c) => c.projects.length).sort()).toEqual([1, 1, 2]);
  });

  it('is the key Home counts clients by', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../components/home/useStudioHomeData.ts'), 'utf8');
    expect(src).toMatch(/import \{ clientKeyOf \} from "\.\.\/\.\.\/lib\/clientGroups"/);
    expect(src).toMatch(/clientKeys\.add\(clientKeyOf\(clientEmail, clientName\)\)/);
  });

  it('leaves the account value out when amounts are hidden', () => {
    const [c] = groupClients([project('a', { clientName: 'Asha' })], { amounts: false, now: NOW });
    expect(c.totalValue).toBeNull();
    expect(c.isVip).toBe(false);
  });

  it('files a client as dummy only when every project is tagged so', () => {
    const list = groupClients([
      project('a', { clientName: 'Asha', projectCategory: 'dummy', isDummy: true }),
      project('b', { clientName: 'Asha', projectCategory: 'actual' }),
      project('c', { clientName: 'Ravi', projectCategory: 'dummy', isDummy: true }),
    ], { now: NOW });
    expect(list.find((c) => c.clientName === 'Asha')!.isDummy).toBe(false);
    expect(list.find((c) => c.clientName === 'Ravi')!.isDummy).toBe(true);
  });
});

describe('the clients list', () => {
  const projects = [
    project('p1', { clientName: 'Asha', name: 'Asha Home', location: 'Thane', status: 'proposal_sent' }),
    project('p2', { clientName: 'Ravi', name: 'Ravi Flat', status: 'execution' }),
    project('p3', { clientName: 'Meera', name: 'Meera Villa', status: 'lost' }),
    project('p4', { clientName: 'Neel', name: 'Neel Home', status: 'lead', scopeFlow: { enabled: true, enabledAt: NOW - DAY } }),
  ];
  const clients = groupClients(projects, { now: NOW });
  const follow = [
    line('p1', 12),
    line('p2', 2, { outcome: 'replied', channel: 'call', note: 'Call: Happy with the kitchen Mood: Pleased.' }),
  ];
  const marks: SeenMarks = { since: NOW - 5 * DAY, seen: {} };
  const rows = buildRows(clients, {}, follow, { amountsHidden: false, now: NOW });
  const byName = (n: string) => rows.find((r) => r.client.clientName === n)!;

  it('previews the last logged line as You / Logged, without the mood', () => {
    expect(byName('Asha').preview).toMatchObject({ who: 'you', text: 'Sent the update' });
    expect(byName('Ravi').preview).toMatchObject({ who: 'logged', text: 'Happy with the kitchen' });
    expect(byName('Meera').preview).toBeNull();
    expect(lineText('WhatsApp chat: Will sign this week Mood: Positive ("yes").')).toBe('Will sign this week');
  });

  it('is quiet after 10 days without contact, dormant clients aside', () => {
    expect(isQuiet(byName('Asha'))).toBe(true);
    expect(isQuiet(byName('Ravi'))).toBe(false);
    expect(isQuiet(byName('Meera'))).toBe(false);
    expect(filterRows(rows, 'quiet', marks).map((r) => r.client.clientName).sort()).toEqual(['Asha', 'Neel']);
  });

  it('marks new activity since this person last opened the client', () => {
    expect(hasNewActivity(byName('Ravi'), marks)).toBe(true);
    expect(hasNewActivity(byName('Ravi'), { ...marks, seen: { [byName('Ravi').client.clientKey]: NOW } })).toBe(false);
    expect(hasNewActivity(byName('Asha'), marks)).toBe(false);
  });

  it('sorts newly added, then new activity, then the most recent contact', () => {
    expect(sortRows(rows, marks).map((r) => r.client.clientName)).toEqual(['Neel', 'Ravi', 'Asha', 'Meera']);
  });

  it('searches names, places and projects', () => {
    expect(rows.filter((r) => matchesSearch(r, 'thane')).map((r) => r.client.clientName)).toEqual(['Asha']);
    expect(rows.filter((r) => matchesSearch(r, 'villa')).map((r) => r.client.clientName)).toEqual(['Meera']);
  });

  it('opens on the liveliest project', () => {
    const p = primaryProject([project('x', { status: 'completed' }), project('y', { status: 'execution' }, { lastModified: NOW - 9 * DAY })]);
    expect(p.id).toBe('y');
  });

  it('shows who owes, but no figures and no Owes us where amounts are hidden', () => {
    const money = { p2: { projectValue: null, totalPaid: null, balanceDue: null, amountsHidden: true, milestones: [{ id: 'm', type: 'design' as const, name: 'Advance', percentage: null, status: 'invoiced', owed: null, invoiceNumber: 'INV-1', invoiceDate: '2026-11-01', date: null }] } };
    const hidden = buildRows(clients, money, follow, { amountsHidden: true, now: NOW });
    const ravi = hidden.find((r) => r.client.clientName === 'Ravi')!;
    expect(ravi.money).toMatchObject({ hidden: true, portfolio: null, owedNow: null, owes: true });
    expect(filterRows(hidden, 'owes', marks)).toEqual([]);
    expect(ravi.nextMove.template).toBe('milestone');
  });
});
