/*
  The smart workspace, PR 2 (owner, 27 Nov 2026): the Design card, the client
  pulse and next move, this week's update, handover readiness
  (lib/projectCare), and the site and quiet signals (lib/projectSignals).
*/
import { describe, it, expect } from 'vitest';
import { designPicture, holderLine, projectPulse, projectNextMove, digestLine, handoverReadiness, inWork } from '../../lib/projectCare';
import { projectSignals, signalOf } from '../../lib/projectSignals';
import { lastActivityOf } from '../../lib/projectCatchUp';
import { opsSettingsOf } from '../../lib/opsDesk';
import { CHECKLIST_TEMPLATES } from '../../lib/clientCare';
import type { StoryItem } from '../../lib/projectThread';

const NOW = Date.parse('2026-11-27T10:00:00+05:30'); // a Friday
const DAY = 86400000;
const iso = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);

const rows: any[] = [
  { id: 'k', projectId: 'p1', name: 'Kitchen elevations', siteDate: iso(2), review: { state: 'IN_REVIEW', submittedAt: NOW - 2 * DAY } },
  { id: 'w', projectId: 'p1', name: 'Master bed wardrobe', siteDate: iso(-1), review: { state: 'CHANGES_REQUESTED', decidedAt: NOW - 3 * DAY, designer: { name: 'Riya Shah' } } },
  { id: 'l', projectId: 'p1', name: 'Living room plan', siteDate: iso(40), review: { state: 'DRAFT', updatedAt: NOW } },
];
const items: any[] = [
  { id: 'k', name: 'Kitchen elevations', rounds: [] },
  { id: 'w', name: 'Master bed wardrobe', rounds: [] },
  { id: 'c', name: 'Pooja unit', rounds: [{ roundNumber: 1, issuedAt: NOW - 9 * DAY, status: 'issued' }] },
];
const meetings: any[] = [{
  id: 'mt1', state: 'CLOSED', closedAt: NOW - DAY, includedRounds: 2,
  rooms: [{ room: 'Kitchen', round: 3, changes: [{}, {}], charge: { status: 'to_bill' } }, { room: 'Living', round: 1, changes: [], charge: { status: 'waived' } }],
}];

describe('designPicture: what will hold up site', () => {
  const pic = designPicture({ projectId: 'p1', projectName: 'Palacia', rows, items, meetings, now: NOW })!;

  it('lists the drawings late for site or that will be, most urgent first, with who holds them', () => {
    expect(pic.site.map((s) => [s.name, s.risk.state])).toEqual([['Master bed wardrobe', 'late'], ['Kitchen elevations', 'risk']]);
    expect(holderLine(pic.site[0], 'Riya Shah')).toBe('With Riya 3 days');
    expect(holderLine(pic.site[1])).toBe('With the Design Head 2 days');
  });

  it('names the drawing the client has had longest, past a week', () => {
    expect(pic.clientHolding).toEqual({ count: 1, worst: { name: 'Pooja unit', days: 9 } });
  });

  it('lists the rounds still to bill or waive, and none for a role that does not bill', () => {
    expect(pic.rounds.map((r) => [r.room, r.round])).toEqual([['Kitchen', 3]]);
    expect(designPicture({ projectId: 'p1', projectName: 'Palacia', rows, items, meetings: null, now: NOW })!.rounds).toEqual([]);
  });

  it('says nothing when nothing is at risk', () => {
    expect(designPicture({ projectId: 'p1', projectName: 'P', rows: [rows[2]], items: [], meetings: [], now: NOW })).toBeNull();
  });
});

describe('projectPulse and the next move', () => {
  const money: any = {
    projectValue: 100, totalPaid: 0, balanceDue: 100,
    milestones: [{ id: 'm1', type: 'design', name: 'Sign-up', percentage: 40, status: 'invoiced', owed: 10590, invoiceNumber: 'FF-01', invoiceDate: iso(-30), date: null }],
  };
  const care = {
    followUps: [{ id: 'f', projectId: 'p1', at: NOW - 20 * DAY, channel: 'call', outcome: 'replied', note: 'Mood: Anxious about delays.', by: 'x', byName: 'Asha' }] as any[],
    escalations: [], decisions: [], moms: [], visits: [], checklists: {},
  };

  it('works the pulse out as the Ops Desk does, with every point it lost', () => {
    const p = projectPulse({ project: { id: 'p1', name: 'Palacia', targetHandover: null }, money, care, settings: opsSettingsOf({}), now: NOW });
    expect(p.score).toBeLessThan(80);
    expect(p.reasons.some((r) => /late/.test(r.label) && r.points < 0)).toBe(true);
    expect(p.reasons.some((r) => /Not heard from them in 20 days/.test(r.label))).toBe(true);
  });

  it('says to chase a payment more than 15 days past due', () => {
    expect(projectNextMove({ status: 'won', money, followUps: care.followUps, now: NOW }).label).toMatch(/chase the payment/);
  });
});

describe('digestLine: this week’s update', () => {
  it('is due only on a project in work', () => {
    expect(digestLine(null, { inWork: false, now: NOW })).toBeNull();
    expect(inWork({ status: 'lead' }, NOW)).toBe(false);
  });

  it('asks for it from Thursday when nothing is written, and says where it stands after', () => {
    expect(digestLine(null, { inWork: true, now: NOW })).toMatchObject({ tone: 'turn', text: 'This week’s update is still to write' });
    expect(digestLine(null, { inWork: true, now: NOW - 3 * DAY })).toBeNull(); // Tuesday
    expect(digestLine({ status: 'pending_review', preparedByName: 'Mayuri' } as any, { inWork: true, now: NOW })).toMatchObject({ tone: 'turn', detail: 'Written by Mayuri' });
    expect(digestLine({ status: 'sent', sentAt: NOW } as any, { inWork: true, now: NOW })).toMatchObject({ tone: 'done' });
    expect(digestLine({ status: 'skipped' } as any, { inWork: true, now: NOW })).toBeNull();
  });
});

describe('handoverReadiness', () => {
  it('is one figure from the Execution phase on, and nothing before', () => {
    const first = CHECKLIST_TEMPLATES.handover[0];
    const r = handoverReadiness({ status: 'execution' }, { handover: { items: [{ id: first.id, state: 'done' }] } as any }, NOW)!;
    expect(r.total).toBe(CHECKLIST_TEMPLATES.handover.length);
    expect(r.done).toBe(1);
    expect(r.pct).toBe(Math.round(100 / r.total));
    expect(r.outstanding).not.toContain(first.label);
    expect(handoverReadiness({ status: 'won' }, {}, NOW)).toBeNull();
    expect(handoverReadiness({ status: 'proposal_sent' }, {}, NOW)).toBeNull();
  });
});

describe('the site and quiet signals', () => {
  it('puts drawings that will hold up site on Design, rose', () => {
    const s = projectSignals({ context: { status: 'won' }, money: null, alerts: [], drawings: [], siteRows: rows, now: NOW });
    expect(signalOf(s, 'design')).toMatchObject({ id: 'drawings-site', tone: 'late', line: '2 drawings will hold up site' });
  });

  it('calls a live project quiet after ten days with nothing recorded, and not a finished one', () => {
    const quiet = (status: string) => projectSignals({ context: { status }, money: null, alerts: [], drawings: null, lastActivityAt: NOW - 12 * DAY, now: NOW });
    expect(signalOf(quiet('won'), 'chat')).toMatchObject({ id: 'quiet', line: 'Quiet for 12 days' });
    expect(quiet('completed').map((x) => x.id)).not.toContain('quiet');
  });

  it('reads the last activity from the story, never from a sticker that only says where things stand', () => {
    const story = [
      { id: 'a', at: NOW - 12 * DAY, kind: 'event', side: 'studio', text: 'a', projectId: 'p1', convs: ['plan'], route: null },
      { id: 's', at: NOW, kind: 'sticker', tone: 'bad', side: 'studio', text: 'Unpaid', projectId: 'p1', convs: ['money'], route: null },
    ] as StoryItem[];
    expect(lastActivityOf(story)).toBe(NOW - 12 * DAY);
    expect(lastActivityOf([])).toBeNull();
  });
});

describe('Open in Clients (lib/clientsOpen)', () => {
  it('hands the project to the Clients screen once', async () => {
    const { askClientsToOpen, takeClientsOpen } = await import('../../lib/clientsOpen');
    askClientsToOpen('p1');
    expect(takeClientsOpen()).toBe('p1');
    expect(takeClientsOpen()).toBeNull();
  });
});
