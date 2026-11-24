import { describe, it, expect } from 'vitest';
import { canNudge, cleanDate, daysStillNeeded, heldBy, missingDrawings, nudgeTarget, roundsToBill, siteRisk, siteRisks, type SmartRow } from '../../lib/deskSmart';
import { nudgeDraft } from '../../lib/notify';
import type { DesignMeeting } from '../../lib/designMeeting';

/*
  Design Desk 2.0, Phase 3A: the smart features that need no AI
  (lib/deskSmart.ts): the site date, missing drawings, rounds to bill, nudges.
*/

const NOW = new Date('2026-11-24T10:00:00');
const T = NOW.getTime();
const DAY = 86_400_000;
const who = { uid: 'r', email: 'rahul@studio.in', name: 'Rahul Verma' };
const row = (id: string, state: string | null, x: Partial<SmartRow> & { audience?: string; review?: any } = {}): SmartRow => ({
  id, projectId: 'p1', name: x.name || `Drawing ${id}`, roomName: 'Kitchen',
  review: state ? { state, audience: x.audience || 'client', designer: who, versionId: 'v1', versionNo: 1, ...(x.review || {}) } as any : undefined,
  ...x,
} as SmartRow);

describe('the site date', () => {
  it('reads only a real YYYY-MM-DD date', () => {
    expect(cleanDate('2026-12-01')).toBe('2026-12-01');
    expect(cleanDate(' 2026-12-01 ')).toBe('2026-12-01');
    expect(cleanDate('01/12/2026')).toBeNull();
    expect(cleanDate('2026-13-40')).toBeNull();
    expect(cleanDate('')).toBeNull();
    expect(cleanDate(null)).toBeNull();
  });

  it('counts the days a drawing still needs from the steps it has left', () => {
    expect(daysStillNeeded(row('a', null))).toBe(10);
    expect(daysStillNeeded(row('a', 'CHANGES_REQUESTED'))).toBe(10);
    expect(daysStillNeeded(row('a', 'IN_REVIEW'))).toBe(8);
    expect(daysStillNeeded(row('a', 'APPROVED'))).toBe(7);
    expect(daysStillNeeded(row('a', 'APPROVED', { approvedAt: T }))).toBe(0);
    /* A drawing kept inside the studio has no client step. */
    expect(daysStillNeeded(row('a', 'DRAFT', { audience: 'studio' }))).toBe(3);
    expect(daysStillNeeded(row('a', 'IN_REVIEW', { audience: 'studio' }))).toBe(1);
    expect(daysStillNeeded(row('a', 'APPROVED', { audience: 'studio' }))).toBe(0);
  });

  it('says nothing without a site date, or once the drawing is sent to site', () => {
    expect(siteRisk(row('a', 'IN_REVIEW'), NOW)).toBeNull();
    expect(siteRisk(row('a', 'APPROVED', { siteDate: '2026-11-20', gfcStatus: 'issued' }), NOW)).toBeNull();
  });

  it('warns when the steps left do not fit before the date', () => {
    const risk = siteRisk(row('a', 'IN_REVIEW', { siteDate: '2026-12-01' }), NOW)!;
    expect(risk.state).toBe('risk');
    expect(risk.days).toBe(7);
    expect(risk.label).toBe('Site needs it 1 Dec');
    expect(risk.line).toBe('Site needs it on 1 Dec. At this pace it will be late: it still needs about 8 days and there are 7.');
    /* The same date is fine for a drawing that only needs sending, or has room to spare. */
    expect(siteRisk(row('a', 'APPROVED', { siteDate: '2026-12-01', approvedAt: T }), NOW)!.state).toBe('ok');
    expect(siteRisk(row('a', 'IN_REVIEW', { siteDate: '2026-12-10' }), NOW)!.state).toBe('ok');
  });

  it('says it is late once the date has passed, and ready when it only needs sending', () => {
    const late = siteRisk(row('a', 'DRAFT', { siteDate: '2026-11-20' }), NOW)!;
    expect(late.state).toBe('late');
    expect(late.line).toBe('Site needed it on 20 Nov. It is not sent to site yet.');
    const ready = siteRisk(row('a', 'APPROVED', { siteDate: '2026-11-26', approvedAt: T }), NOW)!;
    expect(ready.state).toBe('ready');
    expect(ready.line).toBe('Site needs it on 26 Nov. It is approved: send it to site.');
  });

  it('lists the drawings at risk, the most urgent first, and leaves out the ones on track', () => {
    const rows = [row('ok', 'IN_REVIEW', { siteDate: '2026-12-20' }), row('risk', 'IN_REVIEW', { siteDate: '2026-11-28' }), row('late', null, { siteDate: '2026-11-21' }), row('none', 'DRAFT')];
    expect(siteRisks(rows, NOW).map((x) => x.d.id)).toEqual(['late', 'risk']);
  });
});

describe('missing drawings', () => {
  it('are the ones the Drawings tab flags beside their pair, until they are approved or sent to site', () => {
    const rows = [
      row('kitchen_detail', null, { name: 'Kitchen Detail Drawing', isGapFlagged: true, companionOf: 'kitchen_elevation' }),
      row('kitchen_elevation', 'APPROVED', { name: 'Kitchen Elevation', companionOf: 'kitchen_detail' }),
      row('waterproofing', 'IN_REVIEW', { name: 'Waterproofing Layout', isGapFlagged: true, companionOf: 'gone' }),
      row('done', 'APPROVED', { isGapFlagged: true, companionOf: 'kitchen_elevation' }),
      row('sent', 'DRAFT', { isGapFlagged: true, gfcStatus: 'issued' }),
      row('fine', 'DRAFT'),
    ];
    expect(missingDrawings(rows).map((m) => m.line)).toEqual([
      'Kitchen Detail Drawing has no drawing uploaded yet, and Kitchen Elevation, which goes with it, is already ahead.',
      'Waterproofing Layout is still with the Design Head, and the drawing that goes with it is not in the list.',
    ]);
  });
});

describe('rounds to bill', () => {
  const charge = (status: string) => ({ status, fee: null, note: null, ref: null, decidedBy: who, decidedAt: T, updatedBy: who, updatedAt: T });
  const meeting = (id: string, closedAt: number, rooms: any[]): DesignMeeting => ({ id, orgId: 's', projectId: 'p1', projectName: 'Mehta', state: 'CLOSED', rev: 1, attendees: '', includedRounds: 2, startedAt: closedAt - 1000, startedBy: who, closedAt, closedBy: who, rooms });
  const room = (name: string, round: number, status: string | null) => ({ room: name, sheets: [], outcome: 'changes', round, changes: [{}, {}], charge: status ? charge(status) : null });

  it('lists only the rounds still waiting to be billed or waived, newest first, across projects', () => {
    const out = roundsToBill({
      p1: [meeting('m1', T - 5 * DAY, [room('Living & dining', 3, 'to_bill'), room('Kitchen', 3, 'waived'), room('Master bedroom', 1, null)])],
      p2: [meeting('m2', T - DAY, [room('Kitchen', 4, 'to_bill')]), meeting('m3', T - 9 * DAY, [room('Pooja', 3, 'billed')])],
      p3: undefined,
    }, (id) => ({ p1: 'Mehta Residence', p2: 'Kapoor Villa' } as any)[id] || id);
    expect(out.map((r) => `${r.projectName}/${r.room}/${r.round}/${r.included}/${r.changes}`)).toEqual(['Kapoor Villa/Kitchen/4/2/2', 'Mehta Residence/Living & dining/3/2/2']);
  });
});

describe('nudges', () => {
  const r = (state: string, x: any = {}) => ({ state, designer: who, ...x });

  it('know who is holding a drawing and since when', () => {
    expect(heldBy(r('IN_REVIEW', { submittedAt: T - 2 * DAY - 5000 }), T)).toEqual({ who: 'head', since: T - 2 * DAY - 5000, days: 2, ask: 'check it' });
    expect(heldBy(r('CHANGES_REQUESTED', { decidedAt: T - 3 * DAY }), T)).toMatchObject({ who: 'designer', days: 3, ask: 'make the changes and upload it again' });
    expect(heldBy(r('DRAFT', { updatedAt: T - 3600_000 }), T)).toMatchObject({ who: 'designer', days: 0, ask: 'send it to the Design Head' });
    expect(heldBy(r('APPROVED', { clientChanges: { pending: true, at: T - DAY } }), T)).toMatchObject({ who: 'head', days: 1, ask: "go through the client's changes" });
    /* Approved and with the client, or with no PDF: nobody in the studio is holding it. */
    expect(heldBy(r('APPROVED', { decidedAt: T - 9 * DAY }), T)).toBeNull();
    expect(heldBy(undefined, T)).toBeNull();
  });

  it('let the button be pressed a few hours apart, and say why not', () => {
    expect(canNudge(r('APPROVED'), T)).toMatchObject({ ok: false, why: 'Nobody in the studio is holding this drawing right now.' });
    expect(canNudge(r('IN_REVIEW', { submittedAt: T - 2 * DAY, nudgedAt: T - 3600_000 }), T)).toMatchObject({ ok: false, why: 'A reminder went a short while ago. Try again in a few hours.' });
    expect(canNudge(r('IN_REVIEW', { submittedAt: T - 2 * DAY, nudgedAt: T - 5 * 3600_000 }), T).ok).toBe(true);
  });

  it('name who is reminded', () => {
    const head = heldBy(r('IN_REVIEW', { submittedAt: T - 2 * DAY }), T)!;
    const designer = heldBy(r('CHANGES_REQUESTED', { decidedAt: T - DAY }), T)!;
    expect(nudgeTarget(r('IN_REVIEW'), head)).toBe('the Design Head');
    expect(nudgeTarget(r('CHANGES_REQUESTED'), designer)).toBe('Rahul');
  });

  it('go to the Design Head role or to the designer, and to nobody when the designer is unknown', () => {
    const base = { projectId: 'p1', projectName: 'Kapoor Villa', sheet: 'Master wardrobe', days: 2, ask: 'check it' };
    expect(nudgeDraft({ ...base, who: 'head', by: 'Priya' })).toMatchObject({
      kind: 'design.nudge', level: 'needs', route: 'design-review', title: 'Master wardrobe has waited 2 days for you',
      line: 'Priya sent a reminder: please check it', to: { roles: ['Design Head'] },
    });
    expect(nudgeDraft({ ...base, who: 'designer', designerEmail: 'Rahul@Studio.in', by: 'Anish' })).toMatchObject({ line: 'Anish sent a reminder: please check it', to: { emails: ['rahul@studio.in'] } });
    expect(nudgeDraft({ ...base, who: 'designer', designerEmail: null })).toBeNull();
  });
});
