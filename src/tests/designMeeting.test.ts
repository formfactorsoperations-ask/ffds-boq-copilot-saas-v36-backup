import { describe, it, expect } from 'vitest';
import { presentableRooms, clientRoundsByRoom, includedRoundsFrom, isOverIncluded, cleanChanges, cleanFee, meetingSummary, revisionCharges, portalDesignRecord, cleanSignerName, cleanSignature, confirmationLine, type DesignMeeting, type MeetingRoom } from '../../lib/designMeeting';
import { buildPortalView } from '../../lib/portalProjection';
import { allowed, clientPending, refusal } from '../../lib/drawingReview';

const sheet = (id: string, room: string, state: string | null, extra: any = {}) => ({
  id, name: extra.name || `Sheet ${id}`, roomName: room,
  review: state ? { state, versionId: `${id}v`, versionNo: 1, audience: extra.audience || 'client', clientChanges: extra.clientChanges || null } : null,
});
const room = (name: string, outcome: MeetingRoom['outcome'], extra: Partial<MeetingRoom> = {}): MeetingRoom => ({ room: name, sheets: [], outcome, changes: [], round: 0, charge: null, ...extra });
const meeting = (id: string, state: DesignMeeting['state'], rooms: MeetingRoom[], closedAt = 1): DesignMeeting => ({
  id, orgId: 's', projectId: 'p', projectName: 'P', state, rev: 1, attendees: '', includedRounds: 2, rooms,
  startedAt: 0, startedBy: { uid: 'u', email: 'e', name: 'n' }, closedAt, closedBy: null,
});

describe('rooms ready to present', () => {
  it('a room is ready when every client sheet is approved; studio sheets do not count', () => {
    const rooms = presentableRooms([
      sheet('a', 'Kitchen', 'APPROVED'), sheet('b', 'Kitchen', 'DRAFT', { audience: 'studio', name: 'Kitchen carpentry details' }),
      sheet('c', 'Foyer', 'APPROVED'), sheet('d', 'Foyer', 'IN_REVIEW', { name: 'Foyer ceiling' }),
      sheet('e', 'Kids', null, { name: 'Kids elevation' }),
      sheet('f', 'Utility', 'DRAFT', { audience: 'studio' }),
    ]);
    expect(rooms.map((r) => [r.room, r.ready])).toEqual([['Kitchen', true], ['Foyer', false], ['Kids', false]]);
    expect(rooms.find((r) => r.room === 'Kitchen')!.sheets.map((s) => s.id)).toEqual(['a']);
    expect(rooms.find((r) => r.room === 'Foyer')!.why).toBe('Foyer ceiling is with the Design Head');
    expect(rooms.find((r) => r.room === 'Kids')!.why).toBe('Kids elevation has no PDF yet');
  });

  it('a room waiting on client changes from an earlier meeting cannot be presented again yet', () => {
    const [r] = presentableRooms([sheet('a', 'Kitchen', 'APPROVED', { name: 'Kitchen A', clientChanges: { pending: true } })]);
    expect(r.ready).toBe(false);
    expect(r.why).toBe('Kitchen A has client changes waiting for the Design Head');
  });
});

describe('revision rounds per room', () => {
  it('counts closed meetings where the client asked for changes, per room', () => {
    const ms = [
      meeting('m1', 'CLOSED', [room('Kitchen', 'changes'), room('Living', 'agreed')]),
      meeting('m2', 'CLOSED', [room('Kitchen', 'changes')]),
      meeting('m3', 'CANCELLED', [room('Kitchen', 'changes')]),
      meeting('m4', 'OPEN', [room('Living', 'changes')]),
    ];
    expect(clientRoundsByRoom(ms)).toEqual({ Kitchen: 2 });
    expect(clientRoundsByRoom(ms, 'm2')).toEqual({ Kitchen: 1 });
    expect(isOverIncluded(3, 2)).toBe(true);
    expect(isOverIncluded(2, 2)).toBe(false);
  });

  it('takes the included rounds from the signed terms, then the studio terms, then 2', () => {
    expect(includedRoundsFrom({ engagement: { lockedSnapshot: { termsSettings: { includedRevisionRounds: 3 } } } }, { includedRevisionRounds: 1 })).toBe(3);
    expect(includedRoundsFrom({}, { includedRevisionRounds: 1 })).toBe(1);
    expect(includedRoundsFrom({}, { includedRevisionRounds: 0 })).toBe(0);
    expect(includedRoundsFrom(undefined, undefined)).toBe(2);
    expect(includedRoundsFrom({}, { includedRevisionRounds: 'abc' })).toBe(2);
  });
});

describe('what the function accepts', () => {
  it('keeps pins, boxes and arrows on the room\'s sheets, numbered, and drops the rest', () => {
    const out = cleanChanges([
      { drawingId: 'a', page: 0, shape: { t: 'pin', x: 0.4, y: 0.5 }, text: 'Lighter shade on the shutters' },
      { drawingId: 'zzz', page: 0, shape: { t: 'pin', x: 0.4, y: 0.5 }, text: 'Not in this room' },
      { drawingId: 'a', page: 0, shape: { t: 'pen', pts: [[0.1, 0.1], [0.2, 0.2]] }, text: 'Sketch' },
      { drawingId: 'a', page: 1, shape: { t: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, text: '  ' },
      { drawingId: 'a', page: 1, shape: { t: 'arrow', x: 0.1, y: 0.1, x2: 0.3, y2: 0.3 }, text: 'Move the <b>door</b>' },
    ], [{ drawingId: 'a' }]);
    expect(out.map((c) => [c.n, c.shape.t, c.text])).toEqual([[1, 'pin', 'Lighter shade on the shutters'], [2, 'arrow', 'Move the bdoor/b']]);
  });

  it('reads a fee as whole rupees, or nothing', () => {
    expect(cleanFee('15000')).toBe(15000);
    expect(cleanFee(2499.6)).toBe(2500);
    expect(cleanFee('')).toBeNull();
    expect(cleanFee(-1)).toBeNull();
    expect(cleanFee('abc')).toBeNull();
  });
});

describe('summaries and the billing list', () => {
  it('says what a meeting decided', () => {
    expect(meetingSummary({ rooms: [room('A', 'agreed'), room('B', 'agreed'), room('C', 'changes'), room('D', null)] })).toBe('2 rooms agreed, 1 room with changes');
    expect(meetingSummary({ rooms: [room('A', null)] })).toBe('Nothing decided');
  });

  it('lists chargeable rounds from closed meetings, newest first', () => {
    const by = { uid: 'u', email: 'e', name: 'n' };
    const charge = { status: 'to_bill' as const, fee: null, note: null, ref: null, decidedBy: by, decidedAt: 1, updatedBy: by, updatedAt: 1 };
    const list = revisionCharges([
      meeting('old', 'CLOSED', [room('Kitchen', 'changes', { round: 3, charge })], 10),
      meeting('new', 'CLOSED', [room('Living', 'changes', { round: 3, charge }), room('Foyer', 'agreed')], 20),
      meeting('open', 'OPEN', [room('Bath', 'changes', { charge })]),
    ]);
    expect(list.map((x) => `${x.meeting.id}:${x.room.room}`)).toEqual(['new:Living', 'old:Kitchen']);
  });
});

describe('client changes on an approved sheet', () => {
  const approved = { state: 'APPROVED' as const, clientChanges: { meetingId: 'm', at: 1, count: 2, pending: true, by: { uid: 'u', email: 'e', name: 'n' } } };
  it('wait for the Design Head, and a new PDF waits until she has dealt with them', () => {
    expect(clientPending(approved)).toBe(true);
    expect(allowed('clientReturn', approved)).toBe(true);
    expect(allowed('clientKeep', approved)).toBe(true);
    expect(allowed('finalize', approved)).toBe(false);
    expect(refusal('finalize', approved)).toMatch(/Design Head sends them to you first/);
  });
  it('once dealt with, the sheet behaves as before', () => {
    const done = { ...approved, clientChanges: { ...approved.clientChanges, pending: false } };
    expect(allowed('clientReturn', done)).toBe(false);
    expect(allowed('finalize', done)).toBe(true);
    expect(allowed('clientReturn', { state: 'IN_REVIEW' })).toBe(false);
  });
});

describe('the client\'s design record', () => {
  const by = { uid: 'u', email: 'e', name: 'Mayuri' };
  const sheetOf = (id: string) => ({ drawingId: id, name: `Sheet ${id}`, versionId: `${id}v2`, versionNo: 2, pdfPath: `x/${id}.pdf`, thumbPath: null, pageCount: 1 });
  const charge = { status: 'to_bill' as const, fee: 15000, note: 'internal', ref: 'INV-1', decidedBy: by, decidedAt: 1, updatedBy: by, updatedAt: 1 };
  const held = { ...meeting('m1', 'CLOSED', [
    room('Kitchen', 'changes', { sheets: [sheetOf('k1')], round: 3, charge, changes: [{ n: 1, drawingId: 'k1', page: 0, shape: { t: 'pin', x: 0.1, y: 0.1 }, text: 'Lighter shutters' }] }),
    room('Living', 'agreed', { sheets: [sheetOf('l1')] }),
    room('Foyer', null),
  ], 20), attendees: 'Mr Mehta', startedBy: by };

  it('shows held meetings only, newest first, room by room, with nothing about billing or files', () => {
    const rec = portalDesignRecord([meeting('open', 'OPEN', []), { ...meeting('old', 'CLOSED', [room('Bath', 'agreed')], 5), startedBy: by }, held]);
    expect(rec.map((m) => m.id)).toEqual(['m1', 'old']);
    expect(rec[0]).toEqual({
      id: 'm1', heldAt: 20, attendees: 'Mr Mehta', presentedBy: 'Mayuri', confirmation: null,
      rooms: [
        { room: 'Kitchen', outcome: 'changes', sheets: [{ name: 'Sheet k1', versionNo: 2 }], changes: ['Lighter shutters'] },
        { room: 'Living', outcome: 'agreed', sheets: [{ name: 'Sheet l1', versionNo: 2 }], changes: [] },
      ],
    });
    expect(JSON.stringify(rec)).not.toMatch(/15000|INV-1|internal|pdf/);
  });

  it('carries the confirmation, but never the signature image', () => {
    const signed = { ...held, confirmation: { via: 'studio' as const, name: 'Rahul Mehta', email: null, uid: null, at: 30, signature: 'data:image/png;base64,AAAA' } };
    const [r] = portalDesignRecord([signed]);
    expect(r.confirmation).toEqual({ via: 'studio', name: 'Rahul Mehta', at: 30 });
    expect(confirmationLine(r.confirmation, () => '8 Oct')).toBe('Signed by Rahul Mehta in the studio, 8 Oct');
    expect(confirmationLine({ via: 'portal', name: 'Rahul', at: 1 }, () => '8 Oct')).toBe('Confirmed by Rahul in the portal, 8 Oct');
    expect(confirmationLine(null, () => '')).toBe('Waiting for the client to confirm');
  });

  it('rides on the portal view, and is left out when there is none', () => {
    const rec = portalDesignRecord([held]);
    expect(buildPortalView('p', { name: 'P' } as any, undefined, undefined, undefined, undefined, undefined, undefined, rec).designRecord).toEqual(rec);
    expect('designRecord' in buildPortalView('p', { name: 'P' } as any, undefined, undefined, undefined, undefined, undefined, undefined, [])).toBe(false);
  });

  it('accepts a typed name and a drawn PNG, nothing else', () => {
    expect(cleanSignerName('  Rahul   Mehta ')).toBe('Rahul Mehta');
    expect(cleanSignerName('R')).toBeNull();
    expect(cleanSignerName('<b>Rahul</b>')).toBe('bRahul/b');
    expect(cleanSignature(`data:image/png;base64,${'A'.repeat(300)}`)).toBeTruthy();
    expect(cleanSignature('data:image/png;base64,AAA')).toBeNull();
    expect(cleanSignature(`data:image/svg+xml;base64,${'A'.repeat(300)}`)).toBeNull();
    expect(cleanSignature(`javascript:${'A'.repeat(300)}`)).toBeNull();
  });
});
