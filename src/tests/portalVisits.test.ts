import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  nextVisit, portalStatus, portalStatusForViewer, bestLine, sessionsSince, tabIdOf, tabLabel, privacyLine,
  TRACKING_SINCE_MS, SESSION_GAP_MS, THROTTLE_MS, RECENT_SESSIONS, type PortalVisit,
} from '../../lib/portalVisits';
import { buildThread, EMPTY_RECORDS } from '../../lib/clientThread';
import { buildRows, sortRows } from '../../lib/clientList';
import { groupClients } from '../../lib/clientGroups';

const NOW = Date.parse('2026-12-10T15:00:00+05:30');
const MIN = 60000;
const DAY = 86400000;
const ping = (tab: string, now: number) => ({ uid: 'u1', email: 'asha@mail.com', tenantId: 't1', projectId: 'p1', tab, now });

const visit = (over: Partial<PortalVisit> = {}): PortalVisit => ({
  uid: 'u1', email: 'asha@mail.com', tenantId: 't1', projectId: 'p1', firstAt: NOW - 5 * DAY, lastAt: NOW - 3 * DAY,
  lastTab: 'documents', sessions: 3, tabs: { documents: 3 }, recent: [], ...over,
});

describe('a ping', () => {
  it('starts a visit, with a session and its tab', () => {
    expect(nextVisit(null, ping('financials', NOW))).toEqual({
      uid: 'u1', email: 'asha@mail.com', tenantId: 't1', projectId: 'p1', firstAt: NOW, lastAt: NOW, lastTab: 'financials',
      sessions: 1, tabs: { financials: 1 }, recent: [{ at: NOW, tabs: ['financials'] }],
    });
  });

  it('writes nothing for the same tab within 45 seconds, but does for a new tab', () => {
    const v = nextVisit(null, ping('overview', NOW))!;
    expect(nextVisit(v, ping('overview', NOW + THROTTLE_MS - 1000))).toBeNull();
    expect(nextVisit(v, ping('documents', NOW + 5000))).not.toBeNull();
    expect(nextVisit(v, ping('overview', NOW + THROTTLE_MS + 1000))!.lastAt).toBe(NOW + THROTTLE_MS + 1000);
  });

  it('counts a tab once a session, and starts a new session after 30 minutes away', () => {
    let v = nextVisit(null, ping('documents', NOW))!;
    v = nextVisit(v, ping('financials', NOW + MIN))!;
    v = nextVisit(v, ping('documents', NOW + 2 * MIN))!;
    expect(v.sessions).toBe(1);
    expect(v.tabs).toEqual({ documents: 1, financials: 1 });
    expect(v.recent).toEqual([{ at: NOW, tabs: ['documents', 'financials'] }]);
    v = nextVisit(v, ping('documents', NOW + 2 * MIN + SESSION_GAP_MS + 1))!;
    expect(v.sessions).toBe(2);
    expect(v.tabs.documents).toBe(2);
    expect(v.recent[0].tabs).toEqual(['documents']);
    expect(v.firstAt).toBe(NOW);
  });

  it('keeps the last 20 sessions', () => {
    let v = nextVisit(null, ping('overview', NOW))!;
    for (let i = 1; i <= 30; i++) v = nextVisit(v, ping('overview', NOW + i * (SESSION_GAP_MS + MIN)))!;
    expect(v.sessions).toBe(31);
    expect(v.recent).toHaveLength(RECENT_SESSIONS);
  });

  it('stores anything but an approved tab as other', () => {
    expect(tabIdOf('financials')).toBe('financials');
    expect(tabIdOf('drawings')).toBe('drawings');
    expect(tabIdOf('approvals')).toBe('other');
    expect(tabIdOf('designRecord')).toBe('other');
    expect(tabIdOf(42)).toBe('other');
    expect(tabLabel('financials')).toBe('Payments');
  });
});

describe('the portal status line, first match wins', () => {
  const p = (ctx: any) => ({ context: ctx });
  const given = (at: number) => ({ status: 'execution', clientPortal: { 'asha@mail.com': { issuedAt: at, issuedBy: 'o', revokedAt: null, revokedBy: null } } });

  it('1. on the portal now, for 2 minutes after a ping', () => {
    const l = portalStatus(p(given(NOW - 9 * DAY)), [visit({ lastAt: NOW - MIN, lastTab: 'financials' })], NOW);
    expect(l).toMatchObject({ rule: 1, text: 'On the portal now · Payments', tone: 'brand', live: true });
  });

  it('2. last visit, and how many times they opened it (once for one)', () => {
    expect(portalStatus(p(given(NOW - 9 * DAY)), [visit({ lastAt: NOW - 3 * MIN, sessions: 1 })], NOW))
      .toMatchObject({ rule: 2, text: 'Last visit 3 min ago · opened once', tone: 'slate' });
    expect(portalStatus(p(given(NOW - 9 * DAY)), [visit(), visit({ uid: 'u2', sessions: 2, lastAt: NOW - 30 * DAY })], NOW).text)
      .toBe('Last visit 3 days ago · opened 5 times');
  });

  it('3. access given after tracking began, no visit: not opened yet', () => {
    const l = portalStatus(p(given(TRACKING_SINCE_MS + 2 * DAY)), [], NOW);
    expect(l.rule).toBe(3);
    expect(l.text).toMatch(/^Portal not opened yet · access given 27 Nov 2026$/);
    expect(l.tone).toBe('warn');
  });

  it('4. access given before tracking began, no visit since', () => {
    const l = portalStatus(p({ status: 'execution', portalAccess: { token: 'x', issuedAt: '2026-10-01T10:00:00Z' } }), [], NOW);
    expect(l).toMatchObject({ rule: 4, text: 'Portal not opened since tracking began on 25 Nov 2026', tone: 'warn' });
  });

  it('5. no access, in the pipeline or lost: project not won', () => {
    for (const status of ['lead', 'proposal_sent', 'negotiation', 'lost']) {
      expect(portalStatus(p({ status }), [], NOW)).toMatchObject({ rule: 5, text: 'Project not won — no portal yet', tone: 'slate' });
    }
  });

  it('6. no access, delivered, never issued: legacy project', () => {
    expect(portalStatus(p({ status: 'completed' }), [], NOW)).toMatchObject({ rule: 6, text: 'Legacy project — handed over before the portal', tone: 'slate' });
  });

  it('7. no access, won or on site: no portal access yet, with Give access', () => {
    for (const status of ['won', 'execution', 'work_paused']) {
      expect(portalStatus(p({ status }), [], NOW)).toMatchObject({ rule: 7, text: 'No portal access yet', tone: 'warn', giveAccess: true });
    }
    /* Access taken away from everyone counts as none. */
    const revoked = { status: 'execution', clientPortal: { 'a@b.c': { issuedAt: NOW - 9 * DAY, revokedAt: NOW - DAY } } };
    expect(portalStatus(p(revoked), [], NOW).rule).toBe(7);
  });

  it('shows a Viewer only whether access was given', () => {
    expect(portalStatusForViewer(p(given(NOW - DAY)))).toMatchObject({ text: 'Portal access given' });
    expect(portalStatusForViewer(p({ status: 'execution' }))).toMatchObject({ text: 'No portal access yet' });
    expect(JSON.stringify(portalStatusForViewer(p(given(NOW - DAY))))).not.toMatch(/visit|now|opened/i);
  });

  it('takes the best line across a client: on now, then last visit, then the rest', () => {
    const a = portalStatus(p({ status: 'lead' }), [], NOW);
    const b = portalStatus(p(given(NOW - 9 * DAY)), [visit()], NOW);
    const c = portalStatus(p(given(NOW - 9 * DAY)), [visit({ lastAt: NOW - MIN })], NOW);
    expect(bestLine([a, b])!.rule).toBe(2);
    expect(bestLine([a, b, c])!.rule).toBe(1);
  });

  it('counts the sittings since our last message', () => {
    const v = visit({ recent: [{ at: NOW - DAY, tabs: ['documents'] }, { at: NOW - 3 * DAY, tabs: ['overview'] }, { at: NOW - 9 * DAY, tabs: ['overview'] }] });
    expect(sessionsSince([v], NOW - 4 * DAY)).toBe(2);
  });

  it('says portal visits are recorded, with the studio name or "the studio"', () => {
    expect(privacyLine('Form Factors')).toBe('We record when you open this portal and which pages you view, so Form Factors can follow up on time.');
    expect(privacyLine(null)).toContain('so the studio can follow up');
  });
});

describe('visits on the Clients screen', () => {
  it('adds "First opened the portal" and one card a day with the tabs opened', () => {
    const v = visit({ firstAt: NOW - 5 * DAY, recent: [
      { at: NOW - 2 * 3600000, tabs: ['financials'] },
      { at: NOW - 3 * 3600000, tabs: ['documents', 'financials'] },
      { at: NOW - 2 * DAY, tabs: ['overview'] },
    ] });
    const t = buildThread({ clientName: 'Asha', projects: [{ id: 'p1', name: 'Asha Home', context: {} }], money: {}, now: NOW, records: EMPTY_RECORDS, portalVisits: [v] });
    expect(t.map((e) => [e.text, e.meta])).toEqual([
      ['First opened the portal', 'asha@mail.com'],
      ['On the portal · Everything', null],
      ['On the portal · Documents, Payments', '2 visits'],
    ]);
    expect(t.every((e) => e.source === 'portal' && e.side === 'client')).toBe(true);
  });

  it('adds nothing when no visits are passed, as for a Viewer', () => {
    const t = buildThread({ clientName: 'Asha', projects: [{ id: 'p1', name: 'Asha Home', context: {} }], money: {}, now: NOW, records: EMPTY_RECORDS });
    expect(t).toEqual([]);
  });

  it('puts a client on the portal now second in the list, with the tab as the preview', () => {
    const projects: any[] = [
      { id: 'p1', lastModified: NOW - DAY, tiers: [], context: { clientName: 'Asha', status: 'execution', projectCategory: 'actual' } },
      { id: 'p2', lastModified: NOW - DAY, tiers: [], context: { clientName: 'Ravi', status: 'execution', projectCategory: 'actual' } },
      { id: 'p3', lastModified: NOW - DAY, tiers: [], context: { clientName: 'Neel', status: 'lead', projectCategory: 'actual', scopeFlow: { enabledAt: NOW - 3600000 } } },
    ];
    const rows = buildRows(groupClients(projects, { now: NOW }), {}, [], { amountsHidden: false, now: NOW, visits: [visit({ projectId: 'p2', lastAt: NOW - MIN, lastTab: 'documents' })] });
    const ravi = rows.find((r) => r.client.clientName === 'Ravi')!;
    expect(ravi.onPortalNow).toBe('documents');
    expect(ravi.preview).toMatchObject({ who: 'portal', text: 'On the portal now · Documents' });
    expect(sortRows(rows, { since: NOW, seen: {} }).map((r) => r.client.clientName)).toEqual(['Neel', 'Ravi', 'Asha']);
  });
});

describe('the portal', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8');

  it('pings for a real client only, never for the studio preview', () => {
    expect(read('components/ClientPortal.tsx')).toMatch(/usePortalPing\(projectData\?\.id, [^)]*, source === 'client'\);/);
  });

  it('says so under the sign-in button and in the account menu', () => {
    expect(read('components/ClientLoginScreen.tsx')).toMatch(/text-xs text-slate-500">\{privacyLine\(studio\?\.name\)\}/);
    expect(read('components/client/ClientAccountMenu.tsx')).toMatch(/text-xs text-slate-500">\{privacyLine\(studioName\)\}/);
  });

  it('writes the visit doc only from the callable, never the project document', () => {
    const fn = read('functions/src/portalVisits.ts');
    expect(fn).toMatch(/projects\/\$\{projectId\}\/portalVisits\/\$\{uid\}/);
    expect(fn).not.toMatch(/firstUsedAt|\.update\(|context\./);
    expect(fn).toMatch(/profile\.role !== "Client"/);
  });
});
