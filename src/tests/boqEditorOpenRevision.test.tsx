/*
  The BOQ Editor on a signed version offered "Start a revision" even with Scope
  Revision 1 already in draft (Palacia). It now continues the open one.
*/
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Priya Shah' } }),
}));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, updateSettings: vi.fn() }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/dbService', () => ({ db: {} }));
vi.mock('../../contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }));
vi.mock('../../services/geminiService', () => ({ estimateQuantity: vi.fn(), isAiAvailable: () => false, refineItemSpecs: vi.fn(), generateLumpsumBreakdown: vi.fn() }));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import StudioDashboard from '../../components/StudioDashboard';
import { buildBankMap } from '../../lib/boqPricing';
import { signedLinesFrom } from '../../lib/scopeRevision';
import { startDraft, addCustom } from '../../lib/scopeDraft';

afterEach(cleanup);

const bank: any[] = [{ id: 'wardrobe', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', materials: 1000, labor: 0, margin: 0 }];
const boq = [{ id: 'l1', bankId: 'wardrobe', qty: 40, roomId: 'Bedroom' }];
const tier: any = { id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq, summary: { totalSell: 40000, designFee: 4000, totalRevenue: 44000 } };
const signedCtx = (revisions: any[] = []) => ({
  name: 'Palacia', approvedTierId: 't1', scopeFlow: { enabled: true },
  documents: { issues: [{ id: 'd1', kind: 'detailed_boq', version: 1, reference: 'DOC-BQ-v1', snapshot: { tierId: 't1', total: 40000 }, clientSignature: { name: 'Client' } }] },
  scopeRevisions: revisions,
});

const draftRevision = () => {
  const map = buildBankMap(bank);
  const signed = signedLinesFrom(boq, map, null);
  const draft = addCustom(startDraft(signed, boq, map), 'Study', { name: 'Study table', unit: 'nos', qty: 1, rate: 5000 });
  return { id: 'r1', number: 1, status: 'draft', baseTierId: 't1', createdAt: 1, createdBy: 'P', updatedAt: 2, imported: [], settings: {}, draft };
};

const editor = (ctx: any, onStartRevision = vi.fn()) => render(
  <StudioDashboard projectContext={ctx} setProjectContext={vi.fn()} tiers={[tier]} setTiers={vi.fn() as any} activeTierId="t1"
    bank={bank} aiStrategy={'balanced' as any} onViewInBank={() => undefined} onSaveProject={vi.fn(async () => undefined)} projectId=""
    onStartRevision={onStartRevision} />,
);

describe('The BOQ Editor on the signed version', () => {
  it('starts a revision when none is open', () => {
    editor(signedCtx());
    expect(screen.getByRole('button', { name: /Start a revision/ })).toBeTruthy();
  });

  it('continues the revision already in draft instead of starting another', () => {
    const go = vi.fn();
    editor(signedCtx([draftRevision()]), go);
    expect(screen.queryByRole('button', { name: /Start a revision/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Continue Scope Revision 1/ }));
    expect(go).toHaveBeenCalled();
    expect(screen.getByText(/Scope Revision 1 is in draft: ₹45,000 of work against ₹40,000 signed/)).toBeTruthy();
  });
});
