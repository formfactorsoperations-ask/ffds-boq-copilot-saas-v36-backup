/*
  Pricing & Tiers as one grid: one column per option, its versions inside it.

  The owner found the screen disconnected (columns on top, a rail and tables
  in another style below) and asked what happens when a revision comes. A
  revision is now a version in the same column -- never a fourth column -- and
  offers priced on an earlier version follow the option.
*/
import React, { useMemo, useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 't' }, currentRole: 'Owner', currentRoles: ['Owner'], currentUserAuth: { displayName: 'Priya Shah' } }),
}));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import TierManager from '../../components/TierManager';
import BoqSlideOver from '../../components/pricing/BoqSlideOver';
import { buildBankMap } from '../../lib/boqPricing';
import { dealFor, lowMarginLines, scopeSplit, staleOffer, refreshedOffer, type OfferDiscount } from '../../lib/offers';
import { optionChains, latestOf, versionNo, sameOption, chainOf } from '../../lib/optionChains';
import { signedLinesFrom } from '../../lib/scopeRevision';
import { startDraft, addCustom } from '../../lib/scopeDraft';
import { revisedTierPreview } from '../../lib/revisionMoneyPreview';

afterEach(cleanup);

const item = (id: string, name: string, cat: string, materials: number, margin: number) => ({ id, name, cat, unit: 'sqft', materials, labor: 0, margin }) as any;
const BANK = [item('w', 'Wardrobe', 'Carpentry', 1000, 0), item('p', 'Wall paint', 'Painting', 100, 0), item('t', 'Tiling', 'Civil', 300, 20)];
const line = (id: string, bankId: string, qty: number, roomId: string, extra: any = {}) => ({ id, bankId, qty, roomId, ...extra });
const tier = (id: string, name: string, boq: any[], sell: number, fee: number, cost: number, extra: any = {}) =>
  ({ id, name, timestamp: 1, boq, summary: { totalSell: sell, totalCost: cost, totalGm: 0, itemCount: boq.length, totalRevenue: sell + fee, designFee: fee, blendedGm: ((sell - cost) / sell) * 100 }, ...extra }) as any;

const ESS = tier('ess', 'Essential', [line('1', 'w', 10, 'Bed'), line('2', 'p', 10, 'Functional')], 11000, 1000, 9000);
const COM = tier('com', 'Comfort', [line('3', 'w', 12, 'Bed'), line('4', 'p', 10, 'Functional'), line('5', 't', 5, 'Civil')], 14800, 1200, 11500, { timestamp: 2 });
const OFFER = { id: 'o1', name: '5% off carpentry', type: 'fixed', target: 'execution', value: 600, basis: { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 'com' } };
const CTX: any = {
  name: 'Flat', area: 500,
  financials: { executionGstEnabled: true, designGstEnabled: true, billablePercent: 100, discounts: [OFFER] },
  paymentMilestones: [{ id: 'm1', name: 'Booking', type: 'design', percentage: 100 }, { id: 'm2', name: 'Material advance', type: 'execution', percentage: 100 }],
};

/* Pricing & Tiers with its state, as App keeps it. */
function Harness({ initial = [ESS, COM], ctx = CTX, active = 'com', probe, onEditBoq }: { initial?: any[]; ctx?: any; active?: string; probe?: (s: any) => void; onEditBoq?: (id: string, lines?: string[]) => void }) {
  const [tiers, setTiers] = useState<any[]>(initial);
  const [context, setContext] = useState<any>(ctx);
  const [activeId, setActiveId] = useState<string | null>(active);
  probe?.({ tiers, ctx: context, active: activeId });
  return (
    <TierManager tiers={tiers} setTiers={setTiers as any} activeTierId={activeId} setActiveTierId={setActiveId}
      projectContext={context} setProjectContext={setContext} bank={BANK} setActiveTab={() => undefined} onEditBoq={onEditBoq} />
  );
}

const column = (name: string) => screen.getByRole('article', { name });
const menu = (name: string) => fireEvent.click(screen.getByRole('button', { name: `More for ${name}` }));
/* The view under the options, picked from the switcher. */
const view = (name: string) => { fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) })); return screen.getByRole('region', { name }); };

describe('Options and their versions (lib/optionChains)', () => {
  const v1 = tier('a', 'Comfort', [], 1, 0, 0, { timestamp: 10 });
  const v2 = tier('b', 'Comfort', [], 1, 0, 0, { timestamp: 20, parentTierId: 'a' });
  const v3 = tier('c', 'Comfort', [], 1, 0, 0, { timestamp: 30, parentTierId: 'b' });
  const other = tier('x', 'Essential', [], 1, 0, 0, { timestamp: 5 });
  const orphan = tier('o', 'Orphan', [], 1, 0, 0, { parentTierId: 'gone' });

  it('groups each option with its versions, oldest first, and keeps an orphaned copy as an option', () => {
    const chains = optionChains([v3, other, v1, orphan, v2]);
    expect(chains.map((c) => c.root.id)).toEqual(['x', 'a', 'o']);
    const comfort = chainOf(chains, 'c')!;
    expect(comfort.versions.map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(latestOf(comfort).id).toBe('c');
    expect(versionNo(comfort, 'b')).toBe(2);
    expect(sameOption(chains, 'a', 'c')).toBe(true);
    expect(sameOption(chains, 'a', 'x')).toBe(false);
  });
});

describe('Offers follow the option across versions', () => {
  it('reports an offer priced on v1 with v2’s figure, and Update moves it onto v2', () => {
    const map = buildBankMap(BANK);
    const v2 = { ...COM, id: 'com2', parentTierId: 'com', boq: [...COM.boq, line('6', 'w', 8, 'Study')] };
    const chains = optionChains([COM, v2]);
    const split = scopeSplit(v2, map);
    const now = staleOffer(OFFER as OfferDiscount, 'com2', split, (a, b) => sameOption(chains, a, b));
    expect(now).toBe(1000); // 5% of 20 sq ft of wardrobe at ₹1,000
    expect(staleOffer(OFFER as OfferDiscount, 'ess', scopeSplit(ESS, map), (a, b) => sameOption(chains, a, b))).toBeNull();
    const moved = refreshedOffer(OFFER as OfferDiscount, 'com2', now!);
    expect(moved.value).toBe(1000);
    expect(moved.basis!.tierId).toBe('com2');
  });

  it('works out the deal the same way Money & Offers does, and counts thin lines', () => {
    const d = dealFor({ totalSell: 10000, designFee: 1000, totalCost: 8000 }, [{ id: 'x', name: 'x', type: 'fixed', value: 1000, target: 'execution' }], { rate: 18, billablePercent: 100, executionGst: true, designGst: true });
    expect(d.clientPays).toBe(11800);
    expect(lowMarginLines(COM, buildBankMap(BANK))).toBe(2);
  });
});

describe('Pricing & Tiers grid', () => {
  it('draws a column per option with its price, parts, offers, milestones and thin lines', () => {
    render(<Harness />);
    const com = column('Comfort');
    expect(within(com).getByText('₹ 16,000')).toBeTruthy(); // the exact figure, for screen readers, beside the count-up
    expect(within(com).getByTestId('option-split').textContent).toContain('work ₹ 14,800');
    expect(within(com).getByText('Selected')).toBeTruthy();
    expect(within(view('Where the money goes')).getByText('Carpentry')).toBeTruthy();
    expect(screen.getByTestId('coverage-total-com').textContent).toBe('₹ 16,000');
    const pay = view('Offers & payments');
    expect(within(pay).getAllByText('5% off carpentry')).toHaveLength(1);
    expect(within(pay).getByText('Material advance')).toBeTruthy();
    expect(within(view('Margin')).getAllByText('2 lines')).toHaveLength(2); // both options price wardrobe and paint at 0%
  });

  it('each part opens to its trades, and the parts add up to the work', () => {
    render(<Harness />);
    const money = view('Where the money goes');
    expect(within(money).getAllByText('adds up')).toHaveLength(2);
    fireEvent.click(within(money).getByRole('button', { name: /^Functional/ }));
    expect(within(money).getByText('Painting')).toBeTruthy();
    fireEvent.click(within(money).getByRole('button', { name: 'Open every part' }));
    expect(within(money).getAllByText('Civil')).toHaveLength(2); // the part, and the trade inside it
  });

  it('a trade opens to its BOQ lines, with each option’s amount and quantity', () => {
    render(<Harness />);
    const money = view('Where the money goes');
    fireEvent.click(within(money).getByRole('button', { name: /^Carpentry/ }));
    expect(within(money).queryByText('Wardrobe')).toBeNull();
    fireEvent.click(within(money).getByRole('button', { name: /^Carpentry\s*open$/ }));
    const row = within(money).getByText('Wardrobe').closest('.grid')!;
    expect(row.textContent).toContain('Bed');
    expect(row.textContent).toContain('₹ 10,000'); // Essential: 10 sqft
    expect(row.textContent).toContain('10 sqft');
    expect(row.textContent).toContain('₹ 12,000'); // Comfort: 12 sqft
    expect(row.textContent).toContain('12 sqft');
    fireEvent.click(within(money).getByRole('button', { name: /^Carpentry\s*close$/ }));
    expect(within(money).queryByText('Wardrobe')).toBeNull();
  });

  it('follows the BOQ as it is edited: a line moved to another category moves part', async () => {
    const props = { setTiers: () => undefined, activeTierId: 'com', setActiveTierId: () => undefined, projectContext: CTX, setProjectContext: () => undefined, bank: BANK, setActiveTab: () => undefined } as any;
    const { rerender } = render(<TierManager tiers={[COM]} {...props} />);
    const carpentry = () => screen.getByRole('button', { name: /^Carpentry/ }).closest('.grid')!.textContent;
    await waitFor(() => expect(carpentry()).toContain('₹ 12,000'));
    // The BOQ Editor's Design Category writes `cat` onto the line.
    const edited = { ...COM, boq: COM.boq.map((l: any) => (l.id === '3' ? { ...l, cat: 'Civil' } : l)) };
    rerender(<TierManager tiers={[edited]} {...props} />);
    await waitFor(() => expect(carpentry()).toContain('₹ 0'));
    expect(screen.getByRole('button', { name: /^Civil/ }).closest('.grid')!.textContent).toContain('₹ 13,800'); // 12,000 moved in beside the tiling's 1,800
  });

  it('selecting a column selects the option', () => {
    let s: any;
    render(<Harness probe={(x) => { s = x; }} />);
    fireEvent.click(within(column('Essential')).getByText('Essential'));
    expect(s.active).toBe('ess');
  });

  it('New version keeps the option in its column, as v2, and says what changed', () => {
    let s: any;
    render(<Harness probe={(x) => { s = x; }} />);
    fireEvent.click(within(column('Comfort')).getByRole('button', { name: /New version/ }));
    expect(s.tiers).toHaveLength(3);
    const v2 = s.tiers[2];
    expect(v2.parentTierId).toBe('com');
    expect(v2.name).toBe('Comfort');
    expect(v2.lifecycleTag).toBe('Draft');
    expect(s.active).toBe(v2.id);
    // Still two columns; Comfort now has v1 and v2.
    expect(screen.getAllByRole('article')).toHaveLength(2);
    const versions = within(column('Comfort')).getByRole('group', { name: 'Versions of Comfort' });
    expect(within(versions).getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringMatching(/^v1/), expect.stringMatching(/^v2/)]);
    expect(within(view('Versions & contract')).getAllByText(/vs v1/)).toHaveLength(1);
  });

  it('an earlier version opens as it was, and Back returns to the newest', () => {
    let s: any;
    const v2 = { ...COM, id: 'com2', parentTierId: 'com', timestamp: 3 };
    render(<Harness initial={[ESS, COM, v2]} active="com2" probe={(x) => { s = x; }} />);
    fireEvent.click(within(column('Comfort')).getByRole('button', { name: /^v1/ }));
    expect(s.active).toBe('com');
    expect(within(column('Comfort')).getByText('Earlier version')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back to v2/ }));
    expect(s.active).toBe('com2');
  });

  it('an offer priced on v1 says so on v2, and Update brings it onto v2', () => {
    let s: any;
    const v2 = { ...COM, id: 'com2', parentTierId: 'com', timestamp: 3, boq: [...COM.boq, line('6', 'w', 8, 'Study')] };
    render(<Harness initial={[ESS, COM, v2]} active="com2" probe={(x) => { s = x; }} />);
    const offers = view('Offers & payments');
    expect(within(offers).getByText(/Priced on v1\. On v2 it is ₹ 1,000\./)).toBeTruthy();
    fireEvent.click(within(offers).getByRole('button', { name: 'Update' }));
    expect(s.ctx.financials.discounts[0]).toMatchObject({ value: 1000, basis: { tierId: 'com2' } });
  });

  it('Edit BOQ on an approved option makes its next version and opens that', () => {
    let s: any;
    const onEditBoq = vi.fn();
    render(<Harness ctx={{ ...CTX, approvedTierId: 'com' }} probe={(x) => { s = x; }} onEditBoq={onEditBoq} />);
    fireEvent.click(within(column('Comfort')).getByRole('button', { name: /Edit BOQ/ }));
    const v2 = s.tiers.find((t: any) => t.parentTierId === 'com');
    expect(v2).toBeTruthy();
    expect(onEditBoq).toHaveBeenCalledWith(v2.id);
    expect(s.ctx.approvedTierId).toBe('com');
  });

  /* Where the money goes → Carpentry → its trade → the wardrobe line, in Comfort's column. */
  const openWardrobe = () => {
    const money = view('Where the money goes');
    fireEvent.click(within(money).getByRole('button', { name: /^Carpentry/ }));
    fireEvent.click(within(money).getByRole('button', { name: /^Carpentry\s*open$/ }));
    fireEvent.click(within(money).getByRole('button', { name: 'Open Wardrobe, Bed, in the BOQ Editor for Comfort' }));
  };

  it('a line in Where the money goes opens the BOQ Editor at that line', () => {
    let s: any;
    const onEditBoq = vi.fn();
    render(<Harness active="ess" probe={(x) => { s = x; }} onEditBoq={onEditBoq} />);
    openWardrobe();
    expect(onEditBoq).toHaveBeenCalledWith('com', ['3']);
    expect(s.active).toBe('com');
    expect(s.tiers).toHaveLength(2); // a draft: nothing made, nothing asked
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a line on an approved option asks first, and opens its next version at that line', () => {
    let s: any;
    const onEditBoq = vi.fn();
    render(<Harness ctx={{ ...CTX, approvedTierId: 'com' }} probe={(x) => { s = x; }} onEditBoq={onEditBoq} />);
    openWardrobe();
    const ask = screen.getByRole('dialog', { name: 'Open Comfort in the BOQ Editor' });
    expect(ask.textContent).toContain('Editing it makes v2. v1 stays as approved');
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(onEditBoq).not.toHaveBeenCalled();
    expect(s.tiers).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open Wardrobe, Bed, in the BOQ Editor for Comfort' })); // still open
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open v2' }));
    const v2 = s.tiers.find((t: any) => t.parentTierId === 'com');
    expect(v2.boq.map((l: any) => l.id)).toContain('3'); // the copy keeps its lines' ids
    expect(onEditBoq).toHaveBeenCalledWith(v2.id, ['3']);
    expect(s.ctx.approvedTierId).toBe('com');
  });

  it('Copy as a new option makes a column; Make it its own option moves a version out', () => {
    let s: any;
    const v2 = { ...COM, id: 'com2', name: 'Comfort Plus', parentTierId: 'com', timestamp: 3 };
    render(<Harness initial={[ESS, COM, v2]} active="com2" probe={(x) => { s = x; }} />);
    menu('Comfort Plus');
    fireEvent.click(screen.getByRole('menuitem', { name: /Make it its own option/ }));
    expect(s.tiers.find((t: any) => t.id === 'com2').parentTierId).toBeUndefined();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    menu('Essential');
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy as a new option/ }));
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(s.tiers[s.tiers.length - 1]).toMatchObject({ name: 'Essential (Copy)' });
    expect(s.tiers[s.tiers.length - 1].parentTierId).toBeUndefined();
  });

  it('approving cheers the column and freezes it', () => {
    let s: any;
    render(<Harness probe={(x) => { s = x; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve option' }));
    expect(s.ctx.approvedTierId).toBe('com');
    expect(within(column('Comfort')).getByText('Frozen at approval')).toBeTruthy();
  });

  it('once signed, the options the client did not choose fold away', () => {
    const signed = {
      ...CTX, approvedTierId: 'com', scopeFlow: { enabled: true },
      documents: { issues: [{ id: 'd1', kind: 'detailed_boq', version: 1, snapshot: { tierId: 'com' }, clientSignature: { name: 'Client' } }] },
    };
    render(<Harness ctx={signed} />);
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Comfort']);
    expect(within(column('Comfort')).getByText('Signed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start a revision' })).toBeTruthy();
    expect(within(column('Comfort')).queryByRole('button', { name: /New version/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
});

describe('A scope revision open on the signed version', () => {
  /* Palacia: Scope Revision 1 sat in draft, and Pricing & Tiers still offered to start one, with no sign of its figures. */
  const map = buildBankMap(BANK);
  const signedLines = signedLinesFrom(COM.boq, map, null);
  const draft = addCustom(startDraft(signedLines, COM.boq, map), 'Study', { name: 'Study table', unit: 'nos', qty: 1, rate: 5000 });
  const withRevision = (status = 'draft') => ({
    ...CTX, approvedTierId: 'com', scopeFlow: { enabled: true },
    documents: { issues: [{ id: 'd1', kind: 'detailed_boq', version: 1, snapshot: { tierId: 'com' }, clientSignature: { name: 'Client' } }] },
    scopeRevisions: [{ id: 'r1', number: 1, status, baseTierId: 'com', createdAt: 1, createdBy: 'P', updatedAt: 2, imported: [], settings: {}, draft }],
  });

  it('is priced as a version beside the signed one, with the new item in it', () => {
    const p = revisedTierPreview(withRevision() as any, [ESS, COM], BANK)!;
    expect(p).toMatchObject({ number: 1, state: 'draft', baseTierId: 'com' });
    expect(p.tier.summary.totalSell).toBe(signedLines.reduce((t, l) => t + l.amount, 0) + 5000);
    expect(p.tier.boq.some((b: any) => /Study table/.test(b.name || b.item || ''))).toBe(true);
  });

  it('offers to continue it instead of starting another, and shows its figures beside the signed version', () => {
    render(<Harness ctx={withRevision()} />);
    expect(screen.queryByRole('button', { name: 'Start a revision' })).toBeNull();
    expect(within(column('Comfort')).getByRole('button', { name: 'Continue Scope Revision 1' })).toBeTruthy();
    const money = screen.getByRole('region', { name: 'Where the money goes' });
    expect(within(money).getByText('Scope Revision 1')).toBeTruthy();
    expect(within(money).getByText('in draft')).toBeTruthy();
  });

  it('once approved, opens it to apply', () => {
    const c: any = withRevision('signed');
    c.scopeRevisions[0].issueId = 'sr1';
    c.documents.issues.push({ id: 'sr1', kind: 'scope_revision', version: 1, reference: 'REV-01', clientSignature: { name: 'Client' },
      snapshot: { v1: { total: 14800 }, v2: { total: 19800 } } });
    render(<Harness ctx={c} />);
    expect(within(column('Comfort')).getByRole('button', { name: 'Open Scope Revision 1' })).toBeTruthy();
  });
});

describe('BOQ slide-over', () => {
  it('shows the option’s editor over the screen and closes with Done or Esc', () => {
    const onClose = vi.fn();
    render(<BoqSlideOver title="Comfort" onClose={onClose}><p>the editor</p></BoqSlideOver>);
    expect(screen.getByRole('dialog', { name: 'Edit BOQ: Comfort' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
