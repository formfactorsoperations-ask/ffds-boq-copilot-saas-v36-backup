import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant', orgName: 'Test Studio' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'] }),
}));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));

import {
  annexureOf, fillClause, validityDaysOf, validUntil, validitySentence, warrantySentence, hasCivilWork,
  assumptionsFor, ANNEXURE_DEFAULTS, DEFAULT_VALIDITY_DAYS, ANNEXURE_SECTIONS,
} from '../../lib/annexure';
import { ClientBookletProposal } from '../../components/client/ClientBookletProposal';
import { FFDS_TERMS_DEFAULTS } from '../../services/engagementService';
import type { ProposalTier, TermsSettings } from '../../types';

afterEach(cleanup);

describe('validity', () => {
  it('follows the studio’s setting, 15 days by default', () => {
    expect(validityDaysOf(null)).toBe(DEFAULT_VALIDITY_DAYS);
    expect(DEFAULT_VALIDITY_DAYS).toBe(15);
    expect(validityDaysOf({ proposalValidityDays: 30 })).toBe(30);
    expect(validityDaysOf({ proposalValidityDays: 0 })).toBe(15);
    expect(validityDaysOf({ proposalValidityDays: NaN })).toBe(15);
  });

  it('runs from the issue date', () => {
    const issued = new Date(2026, 10, 19);
    expect(validUntil(issued, 15).toDateString()).toBe(new Date(2026, 11, 4).toDateString());
    const s = validitySentence(21, issued);
    expect(s).toMatch(/^This proposal is valid for 21 days from 19 November 2026, until 10 December 2026, and supersedes all prior estimates/);
  });
});

describe('warranty', () => {
  it('reads Terms & Payment’s warranty periods', () => {
    expect(warrantySentence('Form Factors', FFDS_TERMS_DEFAULTS.warrantyPeriods)).toBe(
      'Form Factors provides a workmanship warranty from handover of 12 months on civil work and carpentry, and 6 months on painting and electrical executed under this contract, covering manufacturing and installation defects.');
    expect(warrantySentence('Studio', [{ trade: 'All work', months: 1 }])).toContain('of 1 month on all work');
  });

  it('uses the standard periods when the studio has saved none, and the old line when it cleared them', () => {
    expect(warrantySentence('Studio', undefined)).toContain('12 months on civil work and carpentry');
    expect(warrantySentence('Studio', [])).toContain('6 months from handover on carpentry');
  });
});

describe('assumptions', () => {
  it('switch to the renovation set only with civil lines', () => {
    const a = annexureOf(null);
    expect(hasCivilWork([{ name: 'Sliding wardrobe', cat: 'Carpentry' }])).toBe(false);
    expect(hasCivilWork([{ name: 'Wall painting', cat: 'Painting' }, { name: 'False ceiling', cat: 'Ceiling' }])).toBe(false);
    expect(hasCivilWork([{ name: 'Wall demolition, brick', cat: 'Civil' }])).toBe(true);
    expect(hasCivilWork([{ name: 'Waterproofing, floor and upstand', category: 'Bathroom' }])).toBe(true);
    expect(hasCivilWork([{ name: 'Remove existing floor tiles', cat: 'Flooring' }])).toBe(true);
    expect(hasCivilWork([{ name: 'Anything', civil: { type: 'break' } }])).toBe(true);
    // A civil line taken out of the scope does not count.
    expect(hasCivilWork([{ name: 'Wall demolition', cat: 'Civil', boqStatus: 'excluded' }])).toBe(false);
    expect(assumptionsFor(a, false).map(x => x.text)).toContain('No structural alteration, waterproofing or slab work required');
    const reno = assumptionsFor(a, true).map(x => x.text).join(' ');
    expect(reno).toMatch(/structural engineer/);
    expect(reno).not.toMatch(/No structural alteration/);
  });
});

describe('the studio’s wording', () => {
  it('defaults to today’s wording, with the booklet’s edit keys', () => {
    const a = annexureOf(undefined);
    expect(a).toEqual(ANNEXURE_DEFAULTS);
    expect(a.paymentTerms[0]).toEqual({ id: 'e5896545', text: 'All stage payments are payable in advance of the corresponding stage. Material orders are placed only against cleared funds.' });
    expect(ANNEXURE_SECTIONS.map(s => s.key).sort()).toEqual(Object.keys(ANNEXURE_DEFAULTS).sort());
  });

  it('takes a saved list in place of the default, list by list', () => {
    const a = annexureOf({ annexure: { materials: [{ id: 'm1', text: 'Our own words.' }, { id: '', text: 'No id yet.' }] } });
    expect(a.materials).toEqual([{ id: 'm1', text: 'Our own words.' }, { id: 'materials.1', text: 'No id yet.' }]);
    expect(a.taxes).toBe(ANNEXURE_DEFAULTS.taxes);
    // An emptied list stays empty: the studio removed every clause.
    expect(annexureOf({ annexure: { closing: [] } }).closing).toEqual([]);
  });

  it('fills the project’s figures into a clause', () => {
    expect(fillClause('Fee {{initiationFee}} at {{ gstRate }}%, {{unknown}}', { initiationFee: '₹4,999', gstRate: '18' }))
      .toBe('Fee ₹4,999 at 18%, {{unknown}}');
  });
});

/* ───────────────────────── the booklet's Annexure A ───────────────────────── */

const tier = (fullBoq: any[]): ProposalTier => ({
  id: 't1', name: 'Comfort', timestamp: 0, boq: [], projectContext: {} as any,
  summary: { totalSell: 500000, totalCost: 400000, totalGm: 20, itemCount: 1, totalRevenue: 550000, designFee: 50000, blendedGm: 20 },
  fullBoq,
} as any);

const renderTerms = (terms: TermsSettings | null, fullBoq: any[] = [{ name: 'Sliding wardrobe', cat: 'Carpentry', boqStatus: 'included_ffds_scope' }]) => render(
  <ClientBookletProposal
    termsOnly
    tiers={[tier(fullBoq)]}
    projectContext={{ clientName: 'A Client', projectName: 'Palacia', gstRate: 18 } as any}
    timelinePhases={[]}
    paymentMilestones={[]}
    level="LEVEL_2"
    settings={{ companyName: 'Form Factors Design Studio' }}
    termsSettings={terms}
    isClientViewOnly
  />,
);

describe('Annexure A in the booklet', () => {
  it('reads as before for an interiors-only project', () => {
    renderTerms(FFDS_TERMS_DEFAULTS);
    expect(screen.getByText('All stage payments are payable in advance of the corresponding stage. Material orders are placed only against cleared funds.')).toBeTruthy();
    expect(screen.getByText(/The Project Initiation Fee of ₹4,999 is adjusted against the Design 1 invoice/)).toBeTruthy();
    expect(screen.getByText('Existing walls, slab, flooring and plumbing sound and reusable as-is')).toBeTruthy();
    expect(screen.getByText(/GST shall be applicable on amounts invoiced by Form Factors Design Studio at the prevailing statutory rate, currently 18%/)).toBeTruthy();
    expect(screen.queryByText(/structural engineer/)).toBeNull();
  });

  it('states the studio’s validity and warranty', () => {
    renderTerms({ ...FFDS_TERMS_DEFAULTS, proposalValidityDays: 21 });
    expect(screen.getByText(/This proposal is valid for 21 days from/)).toBeTruthy();
    expect(screen.getByText(/12 months on civil work and carpentry, and 6 months on painting and electrical/)).toBeTruthy();
  });

  it('prints the studio’s own wording from Terms & Payment', () => {
    renderTerms({ ...FFDS_TERMS_DEFAULTS, annexure: { materials: [{ id: 'own', text: 'Samples are signed off at the studio.' }] } });
    expect(screen.getByText('Samples are signed off at the studio.')).toBeTruthy();
    expect(screen.queryByText(/Final brands, shades and finishes are selected/)).toBeNull();
  });

  it('switches to the renovation assumptions with civil lines', () => {
    renderTerms(FFDS_TERMS_DEFAULTS, [
      { name: 'Sliding wardrobe', cat: 'Carpentry' },
      { name: 'Wall demolition, brick', cat: 'Civil' },
    ]);
    expect(screen.getByText(/walls marked for breaking are non-structural/)).toBeTruthy();
    expect(screen.queryByText('No structural alteration, waterproofing or slab work required')).toBeNull();
  });
});
