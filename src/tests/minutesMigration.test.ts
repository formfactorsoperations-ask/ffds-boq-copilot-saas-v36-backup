import { describe, it, expect } from 'vitest';
import { planMigration, migratedFields, mapStatus, BEFORE_PROCESS, type ProjectSources } from '../../lib/minutesMigration';
import { openFromEarlier, clientMaySee } from '../../lib/minutes';

const team = [{ name: 'Tanvi Shah' }, { name: 'Anushka Rao' }];
const me = { email: 'od@a.com', name: 'Anish K' };
const NOW = new Date('2026-10-19T12:00:00+05:30').getTime();

const older = (over: any = {}) => ({
  id: 'm1', momRef: 'MOM-2026-014', meetingTitle: 'Site visit', meetingType: 'site_visit', meetingDate: 100, status: 'acknowledged',
  acknowledgedBy: 'Mr Naik', acknowledgedAt: 300, sharedAt: 200, clientVisibility: { state: 'published' },
  decisions: [{ id: 'd1', text: 'L-shaped kitchen.' }],
  actionItems: [{ id: 'a1', text: 'Send the elevation.', owner: 'ffds', ownerName: 'Tanvi', dueDate: 500, status: 'open', flags: {} }],
  notes: [{ id: 'n1', text: 'Client prefers 3000K.' }],
  ...over,
});
const project = (over: Partial<ProjectSources> = {}): ProjectSources => ({ projectId: 'p1', projectName: 'Unique Vistas', moms: [], projectCopies: [], visits: [], history: [], ...over });
const shown = (m: any) => m?.clientVisibility?.state === 'published';

describe('the check', () => {
  it('finds older minutes in all four places, each once', () => {
    const plan = planMigration([project({
      moms: [older(), { id: 'new', format: 2, status: 'draft' }],
      projectCopies: [older({ id: 'copy' }), { id: 'c2', momRef: 'MOM-2025-002', status: 'shared', decisions: [{ text: 'Old one.' }] }],
      visits: [{ id: 'v1', title: 'Measurement', momData: { decisions: [{ text: 'Survey done.' }], status: 'finalised' } }, { id: 'v2', notes: 'no minutes' }],
      history: [{ id: 'h1', title: 'First call', date: 50, decisions: [{ text: 'Wall comes down.' }] }],
    })], team, shown);
    expect(plan.alreadyNew).toBe(1);
    expect(plan.bySource).toEqual({ moms: 1, projectCopies: 1, visits: 1, history: 1 });
    expect(plan.candidates.map((c) => `${c.source}:${c.momId}`).sort()).toEqual(['history:mig-history-h1', 'moms:m1', 'projectCopies:c2', 'visits:mig-visit-v1']);
  });
  it('lists what needs a look', () => {
    const plan = planMigration([project({ moms: [
      older({ id: 'a', actionItems: [{ id: 'x', text: 'Fix the door.', owner: 'ffds', ownerName: 'Sharma ji', status: 'open' }] }),
      older({ id: 'b', actionItems: [{ id: 'x', text: 'Who?', owner: '', status: 'open' }] }),
      older({ id: 'c', status: 'correction_requested' }),
      older({ id: 'd', status: 'shared', clientVisibility: undefined }),
      older({ id: 'e', actionItems: [{ id: 'x', text: 'Site team to clean.', owner: 'ffds', ownerName: 'Site team', status: 'open' }] }),
    ] })], team, shown);
    const kinds = Object.fromEntries(plan.candidates.map((c) => [c.momId, c.issues.map((i) => i.kind)]));
    expect(kinds).toEqual({ a: ['owner_unknown'], b: ['no_owner'], c: ['correction_open'], d: ['never_shown'], e: [] });
  });
  it('maps statuses', () => {
    expect(['draft', 'approved', 'sent', 'confirmed', 'weird'].map(mapStatus)).toEqual(['draft', 'finalised', 'shared', 'acknowledged', 'draft']);
  });
});

describe('bringing one across', () => {
  it('keeps the wording, the ref and the confirmation, and marks the old approval', () => {
    const [c] = planMigration([project({ moms: [older()] })], team, shown).candidates;
    const f = migratedFields(c, me, 'run1', NOW);
    expect(f.format).toBe(2);
    expect(f.topics[0].title).toBe('Discussion');
    expect(f.topics[0].lines.map((l: any) => [l.kind, l.text])).toEqual([['decision', 'L-shaped kitchen.'], ['action', 'Send the elevation.'], ['note', 'Client prefers 3000K.']]);
    expect(f.approvedBy.name).toBe(BEFORE_PROCESS);
    expect(f.trail.map((t: any) => t.step)).toEqual(['written', 'approved', 'sent', 'confirmed']);
    expect(f.momRef).toBeUndefined();
    expect(f.status).toBeUndefined();
    /* Open actions carry on into the next minutes. */
    const after = { ...older(), ...f };
    expect(openFromEarlier([after]).map((x) => x.text)).toEqual(['Send the elevation.']);
    /* What the client saw, they still see; nothing new is shown. */
    expect(clientMaySee(after, shown(after))).toBe(true);
    expect(clientMaySee({ ...after, clientVisibility: undefined }, false)).toBe(false);
  });
  it('a copy is a studio record, never shown in the portal', () => {
    const plan = planMigration([project({ history: [{ id: 'h1', title: 'First call', date: 50, decisions: [{ text: 'Wall comes down.' }], clientVisibility: { state: 'published' } }] })], team, shown);
    const f = migratedFields(plan.candidates[0], me, 'run1', NOW);
    expect(f.status).toBe('shared');
    expect(f.clientVisibility.state).toBe('hidden');
    expect(clientMaySee(f, shown(f))).toBe(false);
  });
  it('notes only come across as one note', () => {
    const plan = planMigration([project({ visits: [{ id: 'v', title: 'Walkthrough', momData: { rawNotes: 'Talked about the balcony.' } }] })], team, shown);
    expect(plan.candidates[0].notesOnly).toBe(true);
    expect(migratedFields(plan.candidates[0], me, 'r', NOW).topics[0].lines[0].text).toBe('Talked about the balcony.');
  });
});
