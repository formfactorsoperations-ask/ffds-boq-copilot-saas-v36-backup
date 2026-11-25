import { describe, it, expect } from 'vitest';
import { nextMove, overdueDays, owesNow, dueAtOf } from '../../lib/clientNextMove';
import type { ClientMilestone } from '../../lib/clientMoney';

const NOW = Date.parse('2026-11-25T12:00:00+05:30');
const DAY = 86400000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const day = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

const m = (over: Partial<ClientMilestone>): ClientMilestone => ({
  id: 'm1', type: 'design', name: 'Design advance', percentage: null, status: 'pending', owed: null,
  invoiceNumber: null, invoiceDate: null, date: null, ...over,
});

describe('when a milestone is due', () => {
  it('is the invoice date once invoiced, the planned date before, and never once paid', () => {
    expect(dueAtOf(m({ status: 'invoiced', invoiceDate: iso(3), date: day(30) }))).toBe(Date.parse(iso(3)));
    expect(dueAtOf(m({ status: 'pending', date: '2026-11-01' }))).toBe(Date.parse('2026-11-01T00:00:00+05:30'));
    expect(dueAtOf(m({ status: 'paid', invoiceDate: iso(40) }))).toBeNull();
    expect(dueAtOf(m({ status: 'pending' }))).toBeNull();
  });

  it('counts overdue days over unpaid milestones, leaving disputed ones out', () => {
    const list = [
      m({ id: 'a', status: 'invoiced', invoiceDate: iso(20) }),
      m({ id: 'b', status: 'invoiced', invoiceDate: iso(40), disputed: true }),
      m({ id: 'c', status: 'paid', invoiceDate: iso(90) }),
    ];
    expect(overdueDays(list, NOW)).toBe(20);
    expect(owesNow(list)).toBe(true);
    expect(owesNow([m({ status: 'pending', date: day(30) })])).toBe(false);
  });
});

describe('next move, first match wins', () => {
  const base = { milestones: [] as ClientMilestone[], quietDays: 2, now: NOW };

  it('1. owes with an invoice more than 15 days out: chase it', () => {
    const r = nextMove({ ...base, bucket: 'active', milestones: [m({ status: 'invoiced', invoiceDate: iso(16) })] });
    expect(r.label).toBe('Invoice out — chase the payment');
    expect(r.template).toBe('milestone');
    expect(r.why).toContain('16 days');
  });

  it('owing for 15 days or fewer is not yet a chase', () => {
    const r = nextMove({ ...base, bucket: 'active', milestones: [m({ status: 'invoiced', invoiceDate: iso(15) })] });
    expect(r.label).toBe('On site — keep the updates going');
  });

  it('a late planned payment that is not invoiced is not owed, so no chase', () => {
    const r = nextMove({ ...base, bucket: 'active', milestones: [m({ status: 'pending', date: day(40) })] });
    expect(r.template).toBe('update');
  });

  it('2. dormant', () => {
    const r = nextMove({ ...base, bucket: 'lost' });
    expect(r).toMatchObject({ label: 'Dormant — reopen it or let it go', template: 'touchpoint' });
  });

  it('3. pipeline and quiet 10 days or more: worth a call, with portal opens when known', () => {
    expect(nextMove({ ...base, bucket: 'pipeline', quietDays: 10 })).toMatchObject({ label: 'Quiet 10 days — worth a call', template: 'review', why: null });
    expect(nextMove({ ...base, bucket: 'pipeline', quietDays: null }).label).toBe('No contact logged yet — worth a call');
    expect(nextMove({ ...base, bucket: 'pipeline', quietDays: 12, portalOpensSinceLastMessage: 3 }).why).toBe('Opened the portal 3 times since your last message.');
    expect(nextMove({ ...base, bucket: 'pipeline', quietDays: 12, portalOpensSinceLastMessage: 1 }).why).toBe('Opened the portal once since your last message.');
  });

  it('4. delivered: ask for the referral', () => {
    expect(nextMove({ ...base, bucket: 'delivered' })).toMatchObject({ label: 'Delivered — ask for the referral', template: 'touchpoint' });
  });

  it('5. live: keep the updates going', () => {
    expect(nextMove({ ...base, bucket: 'active' })).toMatchObject({ label: 'On site — keep the updates going', template: 'update' });
  });

  it('6. otherwise: move it along', () => {
    expect(nextMove({ ...base, bucket: 'pipeline', quietDays: 3 })).toMatchObject({ label: 'In the pipeline — move it along', template: 'review' });
  });

  it('a chase comes before dormant', () => {
    const r = nextMove({ ...base, bucket: 'lost', milestones: [m({ status: 'invoiced', invoiceDate: iso(30) })] });
    expect(r.template).toBe('milestone');
  });
});
