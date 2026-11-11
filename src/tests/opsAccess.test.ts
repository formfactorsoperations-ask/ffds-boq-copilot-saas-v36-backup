/*
  Who sees what on the Ops Desk (lib/opsAccess) and the Client Relations copy
  that follows it (functions/src/teamViewStrip opsViewOf). Made-up data only.
*/
import { describe, it, expect } from 'vitest';
import {
  opsAccessOf, maskAmounts, opsExtrasOf, acceptedProposalOf, coversOf, activeCovers, coverEmailsFor, nextCoverEnd, endOfDayIST, NO_ACCESS,
  type OpsAccess,
} from '../../lib/opsAccess';
import { opsViewOf } from '../../functions/src/teamViewStrip';

const ALL: OpsAccess = { site: true, messages: true, proposal: true, drive: true, cover: true };
const NOW = new Date('2026-11-11T14:00:00+05:30').getTime();

const project: any = {
  id: 'p1', tenantId: 'studio',
  context: {
    name: 'Unique Vistas', clientName: 'Mr Naik', status: 'execution',
    clientMessages: [
      { id: 'm1', text: 'Paid ₹4,80,000 for Payment 2 today.', sentAt: '2026-11-10T10:00:00Z', sentBy: 'Mr Naik' },
      { id: 'm2', text: 'Can you do it for 3.2 lakh? Call me on 98200 41120 on 14/11.', sentAt: '2026-11-10T11:00:00Z', sentBy: 'Mr Naik', aboutLabel: 'Quote Rs 50,000' },
    ],
    proposalAcceptance: { accepted: true, at: 1, via: 'email', tierName: 'Option B · Warm modern', amount: 3420000 },
    financials: { approvedExecutionValue: 3420000 },
  },
  activeProject: {
    executionData: {
      updates: [{ id: 'u1', date: '2026-11-10', text: 'Carpentry 70%', images: ['https://x/1.jpg'], cost: 12000 }],
      blockers: [{ id: 'b1', description: 'Laminate late', financialImpact: 9000, resolved: false }],
      procurement: [{ item: 'Ply', rate: 72 }],
      sofItems: [{ id: 's1', unitPrice: 42000 }],
    },
  },
};

describe('the switches', () => {
  it('start off, and only true turns one on', () => {
    expect(opsAccessOf({})).toEqual(NO_ACCESS);
    expect(opsAccessOf({ opsDesk: { access: { site: true, messages: 'yes', drive: 1 } } })).toEqual({ ...NO_ACCESS, site: true });
  });

  it('with every switch off, the copy is what it was before', () => {
    const view = opsViewOf(project);
    expect(view.opsAccess).toEqual(NO_ACCESS);
    expect(view.siteWork).toBeUndefined();
    expect(view.portalMessages).toBeUndefined();
    expect(view.acceptedProposal).toBeUndefined();
    expect(view.driveFolder).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('4,80,000');
    expect(JSON.stringify(view)).not.toContain('Warm modern');
  });

  it('with every switch on, adds what each names and no money', () => {
    const view = opsViewOf(project, ALL, { link: 'https://drive.google.com/drive/folders/abc' });
    const json = JSON.stringify(view);
    expect(view.siteWork.updates[0]).toMatchObject({ id: 'u1', text: 'Carpentry 70%', images: ['https://x/1.jpg'] });
    expect(view.siteWork.blockers[0]).toMatchObject({ id: 'b1', description: 'Laminate late' });
    expect(view.acceptedProposal).toEqual({ name: 'Option B · Warm modern', at: 1, via: 'email' });
    expect(view.driveFolder).toBe('https://drive.google.com/drive/folders/abc');
    expect(view.portalMessages).toHaveLength(2);
    for (const bad of ['12000', '9000', '3420000', '42000', '4,80,000', '3.2 lakh', '50,000', 'procurement', 'financialImpact', 'unitPrice']) expect(json).not.toContain(bad);
  });

  it('keeps a Drive link only to Drive', () => {
    expect(opsExtrasOf(project, ALL, { link: 'https://evil.example/x' }).driveFolder).toBeNull();
    expect(opsExtrasOf(project, ALL, null).driveFolder).toBeNull();
  });
});

describe('amounts in a message', () => {
  it('masks rupee figures however they are written', () => {
    expect(maskAmounts('Paid ₹4,80,000 today')).toBe('Paid ₹ amount today');
    expect(maskAmounts('Rs. 50,000/- by Friday')).toBe('₹ amount by Friday');
    expect(maskAmounts('INR 1200')).toBe('₹ amount');
    expect(maskAmounts('about 3.2 lakh')).toBe('about ₹ amount');
    expect(maskAmounts('1.5 crore for the villa')).toBe('₹ amount for the villa');
    expect(maskAmounts('sent 25,000 yesterday')).toBe('sent ₹ amount yesterday');
  });

  it('leaves dates, phone numbers and small counts alone', () => {
    expect(maskAmounts('Call 98200 41120 on 14/11 at 6, 2 rooms')).toBe('Call 98200 41120 on 14/11 at 6, 2 rooms');
  });
});

describe('the accepted proposal', () => {
  it('names the accepted tier, or the option chosen, never a price', () => {
    expect(acceptedProposalOf({ proposalDecision: { enabled: true, selected: 'b', options: [{ id: 'a', title: 'Classic' }, { id: 'b', title: 'Coastal' }] } })).toEqual({ name: 'Coastal', at: null, via: null });
    expect(acceptedProposalOf({ proposalAcceptance: { accepted: false, tierName: 'B' } })).toBeNull();
    expect(acceptedProposalOf({})).toBeNull();
  });
});

describe('cover for a colleague', () => {
  const org = (cover: boolean, until: number) => ({
    opsDesk: { access: { cover }, cover: [{ id: 'c1', email: 'Anushka@S.in', name: 'Anushka', forEmail: 'priya@s.in', forName: 'Priya', projectIds: ['p1', 'p2'], until, by: 'anish@s.in', at: 1 }] },
  });

  it('adds the person covering to the projects named, while it lasts', () => {
    expect(coverEmailsFor('p1', org(true, NOW + 3600000), NOW)).toEqual(['anushka@s.in']);
    expect(coverEmailsFor('p3', org(true, NOW + 3600000), NOW)).toEqual([]);
  });

  it('ends by itself, and is nothing while the switch is off', () => {
    expect(coverEmailsFor('p1', org(true, NOW - 1), NOW)).toEqual([]);
    expect(activeCovers(org(false, NOW + 3600000), NOW)).toEqual([]);
    expect(coversOf(org(false, NOW + 3600000))).toHaveLength(1);
  });

  it('knows when the next one ends', () => {
    const covers = coversOf({ opsDesk: { cover: [{ email: 'a', projectIds: [], until: NOW + 5 }, { email: 'b', projectIds: [], until: NOW + 2 }, { email: 'c', projectIds: [], until: NOW - 1 }] } });
    expect(nextCoverEnd(covers, NOW)).toBe(NOW + 2);
    expect(nextCoverEnd([], NOW)).toBeNull();
    expect(new Date(endOfDayIST('2026-11-14')).toISOString()).toBe('2026-11-14T18:29:59.999Z');
  });
});
