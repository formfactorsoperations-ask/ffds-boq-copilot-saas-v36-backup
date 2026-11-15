import { describe, it, expect } from 'vitest';
import {
  advancePaymentStatus,
  milestoneForAdvance,
  resolveProvisionalNote,
  designInProgress,
  heldScheduleVersion,
  nextScheduleVersion,
  DEFAULT_PROVISIONAL_NOTE
} from '../../lib/paymentScheduleStatus';
import { buildSnapshot } from '../../services/documentReleaseEngine';

const adv = (over: any = {}) => ({
  advanceCode: 'D1',
  label: 'Sign-up & Concept',
  phase: 'design',
  percentage: 25,
  amount: 31209,
  dueCondition: 'On signing',
  unlocks: '',
  status: 'pending',
  invoiceRef: null,
  receivedAt: null,
  isHandoverAdvance: false,
  ...over
}) as any;

const milestones: any[] = [
  { id: 'm1', type: 'design', name: 'Sign-up & Concept', percentage: 25, description: '', status: 'paid', paidDate: '2026-11-12', invoiceNumber: 'INV-01' },
  { id: 'm2', type: 'design', name: 'Design Development', percentage: 40, description: '', status: 'invoiced', invoiceDate: '2026-11-14', invoiceNumber: 'INV-02' },
  { id: 'm3', type: 'design', name: 'Design Completion', percentage: 35, description: '', status: 'pending' },
  { id: 'm4', type: 'execution', name: 'Mobilisation (Gross)', percentage: 40, description: '' }
];

describe('payment status per stage', () => {
  it('reads cleared, invoiced and pending from Money', () => {
    expect(advancePaymentStatus(adv(), milestones)).toMatchObject({ state: 'cleared', label: 'Cleared', date: '2026-11-12', invoiceRef: 'INV-01' });
    expect(advancePaymentStatus(adv({ advanceCode: 'D2', label: 'Design Development' }), milestones)).toMatchObject({ state: 'invoiced', date: '2026-11-14' });
    expect(advancePaymentStatus(adv({ advanceCode: 'D3', label: 'Design Completion' }), milestones).state).toBe('pending');
  });

  it('is live: a stage frozen as pending reads cleared once Money says paid', () => {
    expect(advancePaymentStatus(adv({ status: 'pending' }), milestones).state).toBe('cleared');
  });

  it('matches by milestone id first, then name, then position in the phase', () => {
    expect(milestoneForAdvance(adv({ milestoneId: 'm3', label: 'Anything' }), milestones)?.id).toBe('m3');
    expect(milestoneForAdvance(adv({ advanceCode: 'E1', phase: 'execution', label: 'Mobilisation' }), milestones)?.id).toBe('m4');
    expect(milestoneForAdvance(adv({ advanceCode: 'D2', label: 'Renamed stage' }), milestones)?.id).toBe('m2');
  });

  it('falls back to the status on the advance when there are no milestones', () => {
    expect(advancePaymentStatus(adv({ status: 'received' }), []).state).toBe('cleared');
    expect(advancePaymentStatus(adv({ status: 'advance_requested' }), undefined).state).toBe('invoiced');
    expect(advancePaymentStatus(adv(), []).state).toBe('pending');
  });
});

describe('note on execution amounts', () => {
  const designing = { boqFrozen: false } as any;
  const frozen = { boqFrozen: true } as any;

  it('shows the standard wording while design is in progress, when the studio has not chosen', () => {
    expect(designInProgress(designing)).toBe(true);
    expect(designInProgress({ operativeBoqVersion: 'v2' } as any)).toBe(false);
    expect(resolveProvisionalNote({}, designing)).toBe(DEFAULT_PROVISIONAL_NOTE);
    expect(resolveProvisionalNote({}, frozen)).toBeNull();
  });

  it('honours the studio: off stays off, own wording is kept', () => {
    expect(resolveProvisionalNote({ provisionalNote: null }, designing)).toBeNull();
    expect(resolveProvisionalNote({ provisionalNote: '   ' }, designing)).toBeNull();
    expect(resolveProvisionalNote({ provisionalNote: 'Our words.' }, frozen)).toBe('Our words.');
  });

  it('is frozen into the client copy as text when released', () => {
    const ctx: any = {
      clientName: 'Client', name: 'Project', boqFrozen: false,
      paymentSchedules: [{ id: 'ps1', version: 1, versionLabel: 'v1.0', status: 'draft', docketRef: 'DOC-1', advances: [adv()], snapshotEngagement: { designFee: 100000, executionValue: 0 } }]
    };
    expect(buildSnapshot('payment_schedule', ctx).schedule.provisionalNote).toBe(DEFAULT_PROVISIONAL_NOTE);
    ctx.paymentSchedules[0].provisionalNote = null;
    expect(buildSnapshot('payment_schedule', ctx).schedule.provisionalNote).toBeNull();
  });
});

describe('numbering a revision', () => {
  const s = (version: number, status: string) => ({ id: `ps${version}`, version, status } as any);

  it('a first draft is v1, and regenerating it keeps v1', () => {
    expect(nextScheduleVersion([], 0)).toBe(1);
    expect(nextScheduleVersion([s(1, 'draft')], 0)).toBe(1);
  });

  it('a revision goes above the version the client holds', () => {
    expect(nextScheduleVersion([s(1, 'sent')], heldScheduleVersion([s(1, 'sent')], {}))).toBe(2);
    // v1 released from the Documents board but never marked sent on the page.
    const held = heldScheduleVersion([s(1, 'draft')], { scheduleVersion: 1 });
    expect(held).toBe(1);
    expect(nextScheduleVersion([s(1, 'draft')], held)).toBe(2);
  });

  it('an open revision keeps its own number when regenerated', () => {
    expect(nextScheduleVersion([s(1, 'sent'), s(2, 'draft')], 1)).toBe(2);
  });

  it('counts a version locked into the engagement on the older flow', () => {
    expect(heldScheduleVersion([], { lockedVersion: 3 })).toBe(3);
    expect(nextScheduleVersion([], 3)).toBe(4);
  });
});
