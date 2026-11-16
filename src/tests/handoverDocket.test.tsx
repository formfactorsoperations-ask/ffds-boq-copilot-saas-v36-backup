/*
  The Handover Docket: the studio's page and the client's copy of it.

  The client's copy is HandoverDocketSheet, drawn by DocumentRenderer from the
  snapshot frozen at release. The studio's page used to keep its own copy of the
  markup and disagreed with the client's in two ways:

  - on a design-only project the page showed the Design Closeout, while the
    client was sent a Certificate of Completion with a workmanship warranty and
    a care guide, none of which apply;
  - the page had a date picker of its own that was never saved, so the studio
    could download a PDF dated one day while the client's copy said another.

  The page now draws the same sheet, the snapshot freezes the engagement, and
  both copies print the project's handover date.

  handoverDocket.turnkeyPortal.html is the client's copy of a turnkey docket as
  it rendered before any of this changed. A turnkey client must keep receiving
  exactly that document.
*/
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { name: 'Form Factors', contactEmail: 'studio@example.com' } }),
}));
vi.mock('../../hooks/useStudioSettings', () => ({
  useStudioSettings: () => ({ settings: {}, loading: false, updateSettings: vi.fn() }),
}));

import { releaseDocument } from '../../services/documentReleaseEngine';
import DocumentRenderer from '../../components/documents/DocumentRenderer';
import HandoverDocketPage from '../../components/client/HandoverDocketPage';
import { handoverDisplayDate, drawingsIssuedOf } from '../../lib/handoverDocket';

const TODAY = new Date('2026-11-16T06:00:00Z');
const HANDED_OVER = Date.UTC(2026, 9, 3, 6); // 3 October 2026
const ORG = { orgName: 'Form Factors', contactEmail: 'studio@example.com' };
const terms = { warrantyPeriods: [{ months: 18, label: 'Workmanship' }] };

const project = (extra: Record<string, any> = {}): any => ({
  name: 'Juhu Residence',
  clientName: 'Mr & Mrs Shah',
  location: 'Juhu',
  clientEmail: 'c@example.com',
  snagList: [{ roomId: 'r1', title: 'Hinge', status: 'resolved' }],
  drawingTracker: { a: {}, b: {}, c: {} },
  documents: { issues: [] },
  handoverDate: HANDED_OVER,
  engagement: { lockedSnapshot: { termsSettings: terms } },
  ...extra,
});

/** Release the docket as the studio does, and return the issue the portal reads. */
const release = (ctx: any) => {
  const next = releaseDocument('handover_docket', ctx, undefined, { issuedBy: 'studio', org: ORG, reference: 'HD-1' })(ctx);
  return next.documents!.issues.slice(-1)[0];
};

const portal = (issue: any) =>
  render(<DocumentRenderer issue={issue} surface="portal" studioName="Form Factors" />).container;

const studioPage = (ctx: any) =>
  render(<HandoverDocketPage projectContext={ctx} setProjectContext={vi.fn()} projectId="juhu-1" />).container;

/**
 * The document itself, without the Project Ref value. The portal has never
 * been given a project reference (DocumentRenderer passes none), so that one
 * cell differs between the two copies before and after this change.
 */
const docketOf = (root: HTMLElement): string => {
  const el = root.querySelector('#handover-docket-render')!.cloneNode(true) as HTMLElement;
  const label = Array.from(el.querySelectorAll('div')).find((d) => d.children.length === 0 && d.textContent === 'Project Ref')!;
  (label.nextElementSibling as HTMLElement).textContent = '';
  return el.outerHTML;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the client copy of a turnkey docket', () => {
  const golden = fs.readFileSync(path.join(__dirname, 'handoverDocket.turnkeyPortal.html'), 'utf8');

  test('is exactly the document turnkey clients received before', () => {
    expect(portal(release(project())).innerHTML).toBe(golden);
  });

  test('is the same when the project is stored as turnkey explicitly', () => {
    const issue = release(project({ engagementType: 'turnkey' }));
    expect(issue.snapshot.engagementType).toBe('turnkey');
    expect(portal(issue).innerHTML).toBe(golden);
  });
});

describe('the client copy of a design-only docket', () => {
  test('freezes the engagement and the drawing count at release', () => {
    const issue = release(project({ engagementType: 'design_only' }));
    expect(issue.snapshot.engagementType).toBe('design_only');
    expect(issue.snapshot.drawingsIssued).toBe(3);
  });

  test('is the Design Closeout, with no warranty or care guide', () => {
    const text = portal(release(project({ engagementType: 'design_only' }))).textContent!;
    expect(text).toContain('Design Closeout');
    expect(text).toContain('Design Completion');
    expect(text).toContain('Date of Closeout');
    expect(text).toContain('The GFC set issued (3 drawings).');
    expect(text).toContain('100% of the design fee cleared.');
    expect(text).not.toContain('Certificate of Completion');
    expect(text).not.toContain('Warranty');
    expect(text).not.toContain('Care & Maintenance');
    expect(text).not.toContain('Site Clearance');
  });

  test('a docket released before the engagement was frozen stays as it was issued', () => {
    const issue = release(project({ engagementType: 'design_only' }));
    delete issue.snapshot.engagementType;
    delete issue.snapshot.drawingsIssued;
    const text = portal(issue).textContent!;
    expect(text).toContain('Certificate of Completion');
    expect(text).toContain('Warranty Certificate');
  });
});

describe('the studio page draws the document the client receives', () => {
  for (const engagementType of ['turnkey', 'design_only']) {
    test(`${engagementType}: same markup on both sides`, () => {
      const ctx = project({ engagementType });
      const client = docketOf(portal(release(ctx)));
      cleanup();
      expect(docketOf(studioPage(ctx))).toBe(client);
    });
  }
});

describe('the date', () => {
  test('the page prints the project handover date and has no date picker of its own', () => {
    const page = studioPage(project());
    expect(page.querySelector('input[type="date"]')).toBeNull();
    expect(page.textContent).toContain('3/10/2026');
    expect(page.textContent).not.toContain('Dated today until');
  });

  test('until the handover is marked, both copies say today and the page says why', () => {
    const ctx = project({ handoverDate: undefined });
    expect(release(ctx).snapshot.displayDate).toBe('16/11/2026');
    const page = studioPage(ctx);
    expect(page.querySelector('#handover-docket-render')!.textContent).toContain('16/11/2026');
    expect(page.textContent).toContain('Dated today until the handover is marked');
  });

  test('handoverDisplayDate', () => {
    expect(handoverDisplayDate(HANDED_OVER)).toBe('3/10/2026');
    expect(handoverDisplayDate(null, TODAY.getTime())).toBe('16/11/2026');
  });
});

test('drawingsIssuedOf counts the drawing tracker', () => {
  expect(drawingsIssuedOf({ drawingTracker: { a: {}, b: {} } })).toBe(2);
  expect(drawingsIssuedOf({ drawingTracker: [{}, {}, {}] })).toBe(3);
  expect(drawingsIssuedOf({})).toBe(0);
  expect(drawingsIssuedOf(null)).toBe(0);
});
