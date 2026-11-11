import { describe, it, expect } from 'vitest';
import {
  addWorkingDays, workingDaysSince, reminderDue, approvalStage, mayDeem, awaitingFrom, approvalEmail, approvalSheets,
  sheetLine, cleanEmails, cleanLink, blankApproval, needsApproval, GENERAL_ROOM, type ClientApproval,
} from '../../lib/designMeeting';

/*
  The client's written approval after a design meeting: 5 working days to
  answer (Monday to Saturday, India time), reminders on working days 3 and 5,
  overdue after, and only then may the Design Head take the drawings as approved.
*/

/* Noon in India on a given date. */
const ist = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00+05:30`).getTime();
/* 2026-11-07 is a Saturday; 2026-11-08 a Sunday. */
const SAT = ist('2026-11-07', 18);

const sent = (o: Partial<ClientApproval> = {}): ClientApproval => ({
  ...blankApproval(), sentAt: SAT, dueAt: addWorkingDays(SAT, 5), sentTo: ['client@example.com'], ...o,
});

describe('working days', () => {
  it('skips Sundays and ends the day in India', () => {
    /* Sat evening + 5 working days: Mon 9, Tue 10, Wed 11, Thu 12, Fri 13 Nov, to 23:59:59.999 IST. */
    expect(addWorkingDays(SAT, 5)).toBe(ist('2026-11-14', 0) - 1);
    expect(addWorkingDays(ist('2026-11-13'), 1)).toBe(ist('2026-11-15', 0) - 1); // Friday + 1 = Saturday
    expect(addWorkingDays(ist('2026-11-14'), 1)).toBe(ist('2026-11-17', 0) - 1); // Saturday + 1 = Monday
  });

  it('counts the working days gone, not the day it was sent', () => {
    expect(workingDaysSince(SAT, ist('2026-11-08'))).toBe(0);
    expect(workingDaysSince(SAT, ist('2026-11-09'))).toBe(1);
    expect(workingDaysSince(SAT, ist('2026-11-11'))).toBe(3);
  });
});

describe('reminders on working days 3 and 5', () => {
  it('sends each one once, in turn', () => {
    expect(reminderDue(sent(), ist('2026-11-10'))).toBeNull();
    expect(reminderDue(sent(), ist('2026-11-11'))).toBe(0);
    expect(reminderDue(sent({ reminders: [1] }), ist('2026-11-11'))).toBeNull();
    expect(reminderDue(sent({ reminders: [1] }), ist('2026-11-13'))).toBe(1);
    expect(reminderDue(sent({ reminders: [1, 2] }), ist('2026-11-20'))).toBeNull();
  });

  it('never reminds an email not sent, or a meeting already answered', () => {
    expect(reminderDue(blankApproval(), ist('2026-11-20'))).toBeNull();
    expect(reminderDue(sent({ status: 'approved' }), ist('2026-11-20'))).toBeNull();
    expect(reminderDue(sent({ status: 'changes' }), ist('2026-11-20'))).toBeNull();
  });
});

describe('where an approval stands', () => {
  it('moves presented, sent, overdue, and lets the Design Head deem only after the date', () => {
    expect(approvalStage({ approval: blankApproval() })).toBe('presented');
    expect(approvalStage({ approval: sent() }, ist('2026-11-13'))).toBe('sent');
    expect(approvalStage({ approval: sent() }, ist('2026-11-14'))).toBe('overdue');
    expect(mayDeem(sent(), ist('2026-11-13'))).toBe(false);
    expect(mayDeem(sent(), ist('2026-11-14'))).toBe(true);
    expect(approvalStage({ approval: sent({ status: 'approved', answeredAt: 5 }) })).toBe('approved');
    expect(approvalStage({ approval: sent({ status: 'changes', answeredAt: 5 }) })).toBe('changes');
    /* A signature on the record is written approval too. */
    expect(approvalStage({ approval: blankApproval(), confirmation: { via: 'studio', name: 'G', at: 9 } as any })).toBe('approved');
  });

  it('asks for approval only when the client agreed a room', () => {
    expect(needsApproval({ state: 'CLOSED', rooms: [{ outcome: 'changes' }] as any })).toBe(false);
    expect(needsApproval({ state: 'CLOSED', rooms: [{ outcome: 'agreed' }] as any })).toBe(true);
    expect(needsApproval({ state: 'OPEN', rooms: [{ outcome: 'agreed' }] as any })).toBe(false);
  });

  it('lists the drawings still waiting, from the latest meeting that agreed each', () => {
    const sh = (drawingId: string, versionNo = 1) => ({ drawingId, name: drawingId, versionId: 'v', versionNo, pdfPath: null, thumbPath: null, pageCount: 1 });
    const room = (outcome: any, sheets: any[]) => ({ room: 'Study', outcome, sheets, changes: [], round: 0, charge: null });
    const out = awaitingFrom([
      { id: 'a', state: 'CLOSED', closedAt: 1, approval: sent(), rooms: [room('agreed', [sh('d1'), sh('d2')])] },
      { id: 'b', state: 'CLOSED', closedAt: 2, approval: sent({ status: 'approved', answeredAt: 3 }), rooms: [room('agreed', [sh('d2', 2)])] },
    ] as any, ist('2026-11-11'));
    expect(Object.keys(out)).toEqual(['d1']);
    expect(out.d1).toMatchObject({ meetingId: 'a', stage: 'sent', days: 3 });
  });
});

describe('the approval email', () => {
  const m = { rooms: [
    { room: 'Master Bedroom', outcome: 'agreed', sheets: [{ drawingId: 'w1', name: 'Wardrobe detail', versionNo: 2 }] },
    { room: 'Study room', outcome: 'agreed', sheets: [{ drawingId: 'b1', name: 'Study room – Bookshelf detail', versionNo: 1 }] },
    { room: 'Kitchen', outcome: 'changes', sheets: [{ drawingId: 'k1', name: 'Kitchen Elevation', versionNo: 1 }] },
  ] } as any;

  it('lists only the agreed rooms, room first', () => {
    expect(approvalSheets(m).map((s) => sheetLine(s.room, s.name))).toEqual(['Master Bedroom – Wardrobe detail', 'Study room – Bookshelf detail']);
    expect(sheetLine(GENERAL_ROOM, 'Furniture Layout')).toBe('Furniture Layout');
  });

  it('says what the studio says, with the Drive link and the date to answer by', () => {
    const e = approvalEmail({ kind: 'request', clientName: 'Ms. Sharma', projectName: 'Harmony 704', sheets: approvalSheets(m), driveLink: 'https://drive.google.com/drive/folders/abc', dueAt: addWorkingDays(SAT, 5), senderName: 'Riya', studioName: 'Form Factors' });
    expect(e.subject).toBe('Drawings for approval – Harmony 704');
    expect(e.text).toContain('Hi Ms. Sharma,');
    expect(e.text).toContain('1. Master Bedroom – Wardrobe detail');
    expect(e.text).toContain('reply to this email with “Approved”');
    expect(e.text).toContain('If we do not hear from you by Fri, 13 Nov 2026, we will take the above drawings as approved');
    expect(e.html).toContain('href="https://drive.google.com/drive/folders/abc"');
  });

  it('escapes what people typed, and words the reminders', () => {
    const e = approvalEmail({ kind: 'reminder', reminder: 1, clientName: '<b>X</b>', projectName: 'P', sheets: [{ room: 'R', name: 'A & B' }], driveLink: null, dueAt: addWorkingDays(SAT, 5), senderName: '', studioName: '' });
    expect(e.subject).toBe('Final reminder: drawings for approval – P');
    expect(e.html).not.toContain('<b>X</b>');
    expect(e.html).toContain('R – A &amp; B');
    expect(approvalEmail({ kind: 'reminder', reminder: 0, clientName: 'X', projectName: 'P', sheets: [], driveLink: null, dueAt: 0, senderName: '', studioName: '' }).subject).toBe('Reminder: drawings for approval – P');
  });

  it('takes addresses and links only when they are real', () => {
    expect(cleanEmails('A@x.com, b@y.in')).toEqual(['a@x.com', 'b@y.in']);
    expect(cleanEmails('not an email')).toBeNull();
    expect(cleanEmails('')).toEqual([]);
    expect(cleanLink('https://drive.google.com/x')).toBe('https://drive.google.com/x');
    expect(cleanLink('javascript:alert(1)')).toBeNull();
    expect(cleanLink('http://drive.google.com/x')).toBeNull();
  });
});
