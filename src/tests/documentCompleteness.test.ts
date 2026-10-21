import { describe, it, expect } from 'vitest';
import { buildDocumentCompleteness } from '../../lib/documentCompleteness';

/*
  The project card and the project report both read this. A document only
  counts once the client has done their part: signed it, or confirmed it where
  a confirmation is all that is owed. Sent is not signed off, and staged is not
  even sent.
*/

const published = { state: 'published' as const };
const T0 = 1_000_000;

const issue = (kind: string, extra: Record<string, any> = {}) => ({
  id: `di-${kind}-1`, kind, version: 1, reference: 'DOC-1', issuedAt: T0, issuedBy: 'Studio',
  snapshot: {}, contentHash: 'x', materialSections: [], supersedes: null, supersededAt: null,
  counterSignature: null, clientVisibility: published, ...extra,
});

const ctx = (issues: any[], lastViewedAt: Record<string, number> = {}): any => ({
  name: 'Unique Vistas',
  clientName: 'Mr Prasad Naik',
  currentStage: 2,
  documents: { issues, queries: [], lastViewedAt },
});

const slot = (r: ReturnType<typeof buildDocumentCompleteness>, kind: string) =>
  r.slots.find(s => s.kind === kind)!;

describe('document completeness', () => {
  it('does not count a payment schedule or onboarding kit the client has not confirmed', () => {
    const r = buildDocumentCompleteness(ctx(
      [issue('payment_schedule'), issue('onboarding_kit')],
      { onboarding_kit: T0 + 5 },
    ));

    expect(slot(r, 'payment_schedule').status).toBe('issued');
    expect(slot(r, 'payment_schedule').detail).toBe('Sent, not yet opened or confirmed');
    expect(slot(r, 'onboarding_kit').status).toBe('issued');
    expect(slot(r, 'onboarding_kit').detail).toBe('Read by the client, not yet confirmed');
    expect(r.completeCount).toBe(0);
  });

  it('counts them once the client confirms', () => {
    const r = buildDocumentCompleteness(ctx([
      issue('payment_schedule', { clientSignature: { signedAt: T0 + 10 } }),
      issue('onboarding_kit', { clientSignature: { signedAt: T0 + 10 } }),
    ]));

    expect(slot(r, 'payment_schedule').status).toBe('complete');
    expect(slot(r, 'payment_schedule').detail).toBe('Confirmed by the client');
    expect(slot(r, 'onboarding_kit').status).toBe('complete');
    expect(r.completeCount).toBe(2);
  });

  it('reads a terms docket the client has opened but not signed as outstanding', () => {
    const r = buildDocumentCompleteness(ctx([issue('terms_docket')], { terms_docket: T0 + 5 }));

    expect(slot(r, 'terms_docket').status).toBe('issued');
    expect(slot(r, 'terms_docket').detail).toBe('Read by the client, not yet signed');
    expect(r.outstanding.map(s => s.kind)).toContain('terms_docket');
  });

  it('treats an issue staged but not published as still with the studio', () => {
    const r = buildDocumentCompleteness(ctx([
      issue('payment_schedule', { clientVisibility: { state: 'draft' } }),
    ]));

    expect(slot(r, 'payment_schedule').status).toBe('draft');
    expect(slot(r, 'payment_schedule').detail).toBe('Prepared, not yet published to the client');
  });

  it('marks a due document that was never issued as missing', () => {
    const r = buildDocumentCompleteness(ctx([]));

    expect(slot(r, 'onboarding_kit').status).toBe('missing');
    expect(r.dueCount).toBe(3);
    expect(r.headline).toBe('3 documents outstanding');
  });
});
