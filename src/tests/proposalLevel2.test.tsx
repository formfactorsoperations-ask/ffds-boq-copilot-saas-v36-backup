/*
  Level 2 of the client proposal, rendered from the Proposal tab with live state.

  What the studio reported on 1-BHK Kalpataru Expansia: with nothing approved,
  Level 2 took the first option and still called it "Approved option" and its
  scope "approved"; there was no way to write Level 2 for any other option;
  and its material specifications differed from the ones Level 1 had shown
  for the same option.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant', orgName: 'Test Studio' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Priya Shah' } }),
}));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, loading: false, updateSettings: vi.fn() }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/dbService', () => ({ db: {} }));
vi.mock('../../services/engagementService', async (orig) => ({ ...(await orig() as any), getPaymentStructure: vi.fn(async () => null) }));
vi.mock('../../components/ops/ProposalAcceptanceCard', () => ({ default: () => null }));

import ClientTab from '../../components/client/ClientTab';
import { proposalOption, forOption } from '../../lib/proposalOption';
import { specOverride, withSpecOverride, contextWithTierRenamed } from '../../lib/specOverrides';
import { generateLocalComparison, builtInSpecsFor } from '../../lib/comparison';
import { contextWithTierCopied } from '../../lib/specOverrides';

afterEach(cleanup);

const tier = (id: string, name: string, totalSell: number): any => ({
  id, name, timestamp: 1, boq: [],
  summary: { totalSell, designFee: Math.round(totalSell / 10), totalRevenue: Math.round(totalSell * 1.1), totalCost: 0, totalGm: 0, itemCount: 0, blendedGm: 25 },
});

const TIERS = [tier('ess', 'Essential Elegance', 632324), tier('com', 'Comfort Upgrade', 907236)];

function Harness({ ctx: initial, probe }: { ctx?: any; probe?: (ctx: any) => void }) {
  const [ctx, setCtx] = useState<any>({ name: 'Kalpataru Expansia', config: '1-BHK', activeProposalLevel: 'LEVEL_2', ...initial });
  probe?.(ctx);
  return <ClientTab tiers={TIERS} bank={[]} materialSuggestions={[]} timelinePhases={[]} setTimelinePhases={() => undefined} projectContext={ctx} setProjectContext={setCtx} />;
}

/* The option named on the proposal itself, not in the picker above it. */
const onPage = (text: string) => screen.getAllByText(text).filter(e => e.tagName !== 'OPTION');

const optionPicker = () => screen.getByRole('combobox', { name: 'Option the Level 2 proposal is for' }) as HTMLSelectElement;

/* The cells of the specification table, row by row: category and value. */
const specRows = () => {
  const table = document.querySelector('#material-specs table')!;
  return Array.from(table.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent));
};

describe('Level 2: the option it is written for', () => {
  it('with nothing approved, does not call the option approved', () => {
    render(<Harness />);
    expect(optionPicker().value).toBe('ess');
    expect(screen.queryByText(/Approved option/)).toBeNull();
    expect(onPage('Option A · Essential Elegance')).toHaveLength(1);
    expect(screen.getByText(/proposed scope for the Essential Elegance package/)).toBeTruthy();
    expect(screen.queryByText(/approved scope for/)).toBeNull();
  });

  it('presents an option that is not approved for review, not as locked', () => {
    render(<Harness />);
    expect(screen.getByText('Project Blueprint for Your Review')).toBeTruthy();
    expect(screen.getByText(/detailed execution roadmap for the Essential Elegance option/)).toBeTruthy();
    expect(screen.getByText(/Once you approve this option/)).toBeTruthy();
    expect(screen.queryByText(/locking in the scope/)).toBeNull();
    expect(screen.getByText('Proposed Scope Value')).toBeTruthy();
    expect(screen.queryByText('Locked Scope Value')).toBeNull();
  });

  it('can be written for any option, and the choice is kept on the project', () => {
    let ctx: any;
    render(<Harness probe={c => { ctx = c; }} />);
    fireEvent.change(optionPicker(), { target: { value: 'com' } });
    expect(ctx.proposalOptionId).toBe('com');
    expect(onPage('Option B · Comfort Upgrade')).toHaveLength(1);
    expect(screen.getByText(/proposed scope for the Comfort Upgrade package/)).toBeTruthy();
    expect(screen.getByText(/roadmap for the Comfort Upgrade option/)).toBeTruthy();
  });

  it('for the approved option, says approved and keeps the scope-lock wording', () => {
    render(<Harness ctx={{ approvedTierId: 'com' }} />);
    expect(optionPicker().value).toBe('com');
    expect(within(optionPicker()).getByText('Option B · Comfort Upgrade (approved)')).toBeTruthy();
    expect(onPage('Approved option · Comfort Upgrade')).toHaveLength(1);
    expect(screen.getByText(/approved scope for the Comfort Upgrade package/)).toBeTruthy();
    expect(screen.getByText('Project Blueprint & Scope Lock')).toBeTruthy();
    expect(screen.getByText(/locking in the scope/)).toBeTruthy();
    expect(screen.getByText('Locked Scope Value')).toBeTruthy();
  });

  it('an option other than the approved one can still be picked, and is not called approved', () => {
    render(<Harness ctx={{ approvedTierId: 'com', proposalOptionId: 'ess' }} />);
    expect(onPage('Option A · Essential Elegance')).toHaveLength(1);
    expect(screen.queryByText(/Approved option/)).toBeNull();
  });
});

describe('Level 2: material specifications match Level 1', () => {
  it('shows the Level 1 rows for the option, studio edits included', () => {
    const overrides = { 'Hardware System': { 'Comfort Upgrade': 'Hettich soft-close, as agreed' } };
    const content = { materials: { overrides } };

    // Level 1: every option side by side. Take the Comfort Upgrade column.
    render(<Harness ctx={{ activeProposalLevel: 'LEVEL_1', proposalContent: content }} />);
    const l1 = specRows().map(r => [r[0], r[2]]);
    cleanup();

    render(<Harness ctx={{ proposalOptionId: 'com', proposalContent: content }} />);
    const l2 = specRows();
    expect(l2).toEqual(l1);
    expect(l2.find(r => r[0] === 'Hardware System')![1]).toBe('Hettich soft-close, as agreed');
  });
});

describe('proposalOption', () => {
  const tiers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('takes the pick, then the approved option, then the first', () => {
    expect(proposalOption(tiers, { proposalOptionId: 'c', approvedTierId: 'b' })).toEqual({ tier: { id: 'c' }, approved: false, index: 2 });
    expect(proposalOption(tiers, { approvedTierId: 'b' })).toEqual({ tier: { id: 'b' }, approved: true, index: 1 });
    expect(proposalOption(tiers, {})).toEqual({ tier: { id: 'a' }, approved: false, index: 0 });
  });
  it('ignores a pick whose option has been deleted', () => {
    expect(proposalOption(tiers, { proposalOptionId: 'gone', approvedTierId: 'b' }).tier).toEqual({ id: 'b' });
  });
});

describe('forOption', () => {
  it('fills in the placeholder, and repoints a name saved into older text', () => {
    expect(forOption('the approved scope for the [Tier Name] package.', 'B', ['A', 'B'], true)).toBe('the approved scope for the B package.');
    expect(forOption('the approved scope for the A package.', 'B', ['A', 'B'], false)).toBe('the proposed scope for the B package.');
  });
  it('does not mistake one name for a longer one', () => {
    expect(forOption('for the Comfort Upgrade (Copy) package.', 'Comfort Upgrade (Copy)', ['Comfort Upgrade', 'Comfort Upgrade (Copy)'], true))
      .toBe('for the Comfort Upgrade (Copy) package.');
  });
});

describe('material specs follow the option, not its name', () => {
  it('an edit kept by id shows after a rename; an edit kept by name still shows', () => {
    const renamed = [{ ...TIERS[0] }, { ...TIERS[1], name: 'Comfort Upgrade - Optimized', originalName: 'Comfort Upgrade' }];
    const overrides = { 'Hardware System': { com: 'Hettich soft-close' }, 'Paint Finish': { 'Essential Elegance': 'Royale Shyne' } };
    function Renamed() {
      const [ctx, setCtx] = useState<any>({ name: 'Flat', activeProposalLevel: 'LEVEL_1', proposalContent: { materials: { overrides } } });
      return <ClientTab tiers={renamed} bank={[]} materialSuggestions={[]} timelinePhases={[]} setTimelinePhases={() => undefined} projectContext={ctx} setProjectContext={setCtx} />;
    }
    render(<Renamed />);
    const rows = Object.fromEntries(specRows().map(r => [r[0], r.slice(1)]));
    expect(rows['Hardware System'][1]).toBe('Hettich soft-close');
    expect(rows['Paint Finish'][0]).toBe('Royale Shyne');
    // The built-in specs of the name it was created with.
    expect(rows['Plywood (Kitchen & Bath)'][1]).not.toBe('-');
  });

  it('a renamed standard option keeps its built-in specs', () => {
    const before = generateLocalComparison([TIERS[1]], []).materialMatrix.find(r => r.feature === 'Plywood (Kitchen & Bath)')!;
    const after = generateLocalComparison([{ ...TIERS[1], name: 'Comfort Plus', originalName: 'Comfort Upgrade' }], []).materialMatrix.find(r => r.feature === 'Plywood (Kitchen & Bath)')!;
    expect(before['Comfort Upgrade']).toBeTruthy();
    expect(after['Comfort Plus']).toBe(before['Comfort Upgrade']);
  });

  it('withSpecOverride stores by id and drops the copy under the name', () => {
    const out = withSpecOverride({ Paint: { 'Comfort Upgrade': 'old', ess: 'x' } }, 'Paint', { id: 'com', name: 'Comfort Upgrade' }, 'new');
    expect(out).toEqual({ Paint: { com: 'new', ess: 'x' } });
    expect(specOverride(out, 'Paint', { id: 'com', name: 'Anything' })).toBe('new');
  });

  it('a rename moves name-keyed edits to the id, in every proposal mode, without overwriting one already there', () => {
    const ctx: any = {
      proposalContent: { materials: { overrides: { Paint: { Old: 'a' }, Hardware: { Old: 'b', t1: 'kept' } } } },
      proposalContentByMode: { DESIGN_ONLY: { materials: { overrides: { Paint: { Old: 'c' } } } }, TURNKEY: { title: 'x' } },
    };
    const out: any = contextWithTierRenamed(ctx, 't1', 'Old');
    expect(out.proposalContent.materials.overrides).toEqual({ Paint: { t1: 'a' }, Hardware: { t1: 'kept' } });
    expect(out.proposalContentByMode.DESIGN_ONLY.materials.overrides).toEqual({ Paint: { t1: 'c' } });
    expect(out.proposalContentByMode.TURNKEY).toBe(ctx.proposalContentByMode.TURNKEY);
    expect(contextWithTierRenamed(ctx, 't9', 'Nobody')).toBe(ctx);
  });
});

describe('a copy has the specs of the option it was copied from', () => {
  const original: any = { ...TIERS[1] };
  const copy: any = { ...TIERS[1], id: 'copy', name: 'Comfort Upgrade (Copy)', parentTierId: 'com' };
  const renamedCopy: any = { ...copy, name: 'Comfort Upgrade - Optimized', originalName: 'Comfort Upgrade (Copy)' };
  const copyOfCopy: any = { ...TIERS[1], id: 'copy2', name: 'Comfort Upgrade - Optimized (Copy)', parentTierId: 'copy' };
  const plywood = (tiers: any[], name: string) =>
    generateLocalComparison(tiers, []).materialMatrix.find(r => r.feature === 'Plywood (Kitchen & Bath)')![name];

  it('a copy, a renamed copy, and a copy of a copy show the original package\'s built-in specs', () => {
    const builtIn = plywood([original], 'Comfort Upgrade');
    expect(builtIn).toBeTruthy();
    expect(plywood([original, copy], 'Comfort Upgrade (Copy)')).toBe(builtIn);
    expect(plywood([original, renamedCopy], 'Comfort Upgrade - Optimized')).toBe(builtIn);
    expect(plywood([original, renamedCopy, copyOfCopy], 'Comfort Upgrade - Optimized (Copy)')).toBe(builtIn);
  });

  it('without the original, or in a loop of copies, there is nothing to inherit', () => {
    expect(builtInSpecsFor(copy, [copy])).toBeUndefined();
    const a: any = { id: 'a', name: 'A', parentTierId: 'b' };
    const b: any = { id: 'b', name: 'B', parentTierId: 'a' };
    expect(builtInSpecsFor(a, [a, b])).toBeUndefined();
  });

  it('on the proposal, the copy\'s column matches the original\'s', () => {
    function Copies() {
      const [ctx, setCtx] = useState<any>({ name: 'Flat', activeProposalLevel: 'LEVEL_1' });
      return <ClientTab tiers={[original, renamedCopy]} bank={[]} materialSuggestions={[]} timelinePhases={[]} setTimelinePhases={() => undefined} projectContext={ctx} setProjectContext={setCtx} />;
    }
    render(<Copies />);
    specRows().forEach(r => expect(r[2]).toBe(r[1]));
  });

  it('contextWithTierCopied snapshots the edits; one already on the copy stays', () => {
    const ctx: any = { proposalContent: { materials: { overrides: { Paint: { com: 'a' }, Hardware: { 'Comfort Upgrade': 'b', copy: 'own' }, Other: { ess: 'z' } } } } };
    const out: any = contextWithTierCopied(ctx, { id: 'com', name: 'Comfort Upgrade' }, 'copy');
    expect(out.proposalContent.materials.overrides).toEqual({ Paint: { com: 'a', copy: 'a' }, Hardware: { 'Comfort Upgrade': 'b', copy: 'own' }, Other: { ess: 'z' } });
    expect(contextWithTierCopied({ name: 'x' } as any, { id: 'com', name: 'C' }, 'copy')).toEqual({ name: 'x' });
  });
});
