import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { stepsOf, whereLine } from '../../lib/designDesk2';

/*
  THE STUDIO APPROVES A DRAWING; THE CLIENT SIGNS IT OFF.

  The Design Head and the co-owner asked for this on 25 Nov 2026: with
  "approved by the studio" and "approved by the client" on the same screens,
  nobody could tell at a glance which of the two a drawing had. So on every
  screen the studio reads about drawings, "approve" is the Design Head's word
  and "sign off" is the client's, and neither is used for the other
  (DESIGN.md, "Words: approve and sign off").

  What the client reads is not covered here: the studio's own email to the
  client (lib/designMeeting.ts, approvalEmail) keeps its wording, and the
  portal says "confirm".
*/

const ROOT = process.cwd();
const walk = (dir: string): string[] => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

/* The screens and rules where staff follow a drawing. */
const FILES = [
  ...walk('components/designDesk2'), ...walk('components/drawingReview'),
  'components/opsDesk/DrawingApprovals.tsx', 'components/opsDesk/DeskScreens.tsx', 'components/opsDesk/ClientsView.tsx', 'components/opsDesk/OpsDeskPage.tsx',
  'components/ops/DrawingTrackerModule.tsx', 'components/ops/DesignCompleteGate.tsx', 'components/studio/GoogleDriveCard.tsx',
  'lib/designDesk2.ts', 'lib/meetingMinutes.ts', 'lib/deskSmart.ts', 'lib/designGate.ts',
  'functions/src/designMeeting.ts',
];

/* A file's words without its comments, which may explain the history. */
const words = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* The client's answer, said the old way. */
const CLIENT_AS_APPROVAL = [
  /approved by (the )?client/i, /client approves/i, /the client approved it/i, /client('s|’s)? (written )?approval/i,
  /approval (email|overdue|in writing)/i, /written approval/i, /send for approval/i, /drawings for approval/i,
  /take(n|s)? (it |them |drawings )?as approved/i, /record approval/i, /ask the client to approve/i,
];
/* The Design Head's check, said the client's way. */
const STUDIO_AS_SIGN_OFF = [/signed off by the design head/i, /approving signs off/i, /recently signed off/i];

describe('the studio approves, the client signs off', () => {
  it('no screen that follows a drawing calls the client\'s answer an approval', () => {
    const found = FILES.flatMap((f) => CLIENT_AS_APPROVAL.filter((re) => re.test(words(f))).map((re) => `${f}: ${re}`));
    expect(found).toEqual([]);
  });
  it('no screen calls the Design Head\'s approval a sign-off', () => {
    const found = FILES.flatMap((f) => STUDIO_AS_SIGN_OFF.filter((re) => re.test(words(f))).map((re) => `${f}: ${re}`));
    expect(found).toEqual([]);
  });
  it('a drawing\'s steps and its sentence use the two words for the two sides', () => {
    const row = (extra: any) => ({ id: 'a', projectId: 'p', name: 'Kitchen plan', review: { state: 'APPROVED', versionId: 'v', versionNo: 2, audience: 'client' }, ...extra }) as any;
    const head = { reviewer: true, email: 'head@studio.in' };
    expect(stepsOf(row({})).labels).toEqual(['Upload the drawing', 'Design Head checks', 'Client signs off', 'Sent to site']);
    expect(whereLine(row({}), head)).toBe('Approved by the studio. Show it to the client at the next meeting.');
    expect(whereLine(row({ approvedAt: 5 }), head)).toBe('The client signed it off. It can go to site.');
  });
  it('the Drawings tab shows a final drawing as signed off, or approved when it is studio-only', () => {
    const src = words('components/ops/DrawingTrackerModule.tsx');
    expect(src).toMatch(/audience === 'studio' \? 'Approved · studio only' : 'Signed off'/);
    expect(src).toMatch(/'Approved · ready for client'/);
    expect(src).toMatch(/\{ key: 'Approved', label: 'Signed off' \}/);
  });
  it('the email the client reads keeps the studio\'s own wording', () => {
    expect(fs.readFileSync(path.join(ROOT, 'lib/designMeeting.ts'), 'utf8')).toMatch(/Drawings for approval – \$\{i\.projectName\}/);
  });
});
