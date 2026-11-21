import { describe, it, expect } from 'vitest';
import { BANK_USAGE_KIND, bankUsageFileName, buildBankUsageExport } from '../../lib/bankUsageExport';
import { boqTotal, buildBankMap } from '../../lib/boqPricing';

/*
  The Item Bank holds several copies of one item, each at its own rate. The
  usage export says which project line points at which copy and what the line
  is priced at, so a copy is never merged or hidden blind. It reads the bank
  and the projects; it must change neither and must not carry client details.
*/

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1260, labor: 540, margin: 15, ...over,
});

const bank = () => [
  item('gen-015', 'KING SIZE BED WITH STORAGE'),
  item('ADHOC_a1', 'KING SIZE BED WITH STORAGE', { unit: 'SQFT.', materials: 1596, labor: 684, margin: 0 }),
  item('gen-014', 'WARDOBE WITH LOFT', { materials: 1300, labor: 550 }),
];

const project = (over: any = {}): any => ({
  id: 'p1',
  lastModified: 1750000000000,
  activeTierId: 't1',
  activeProject: { tierId: 't1', status: 'completed' },
  context: {
    name: 'Tower B 1204', clientName: 'Asha Menon', clientPhone: '9820012345', location: 'Powai', status: 'closed',
    adHocItems: [item('ADHOC_a1', 'KING SIZE BED WITH STORAGE', { unit: 'SQFT.', materials: 1500, labor: 600, margin: 0 })],
    revision: { actions: [{ newValue: { bankId: 'ADHOC_zz', item: 'Pooja unit' } }] },
  },
  tiers: [{
    id: 't1', name: 'Premium', timestamp: 1740000000000, lifecycleTag: 'Current contract', approval: { at: 1741000000000, by: 'Owner' },
    boq: [
      { id: 'l1', bankId: 'gen-015', qty: 40, roomId: 'Master Bedroom' },
      { id: 'l2', bankId: 'ADHOC_a1', qty: 30, roomId: 'Kids Bedroom', baseRate: 1500 },
      { id: 'l3', bankId: 'gen-014', qty: 60, baseRate: 1400, labor: 500, marginOverride: 25, rateSnapshotAt: { seconds: 1742000000 } },
      { id: 'l4', bankId: 'gone-1', qty: 2, name: 'Old custom shelf', baseRate: 900, marginOverride: 10 },
      { id: 'l5', bankId: 'gen-014', qty: 10, boqStatus: 'deleted' },
    ],
  }],
  canonical: { boq: { version: 2, approvedAt: 1741000000000, items: [{ bankId: 'gen-015', name: 'KING SIZE BED WITH STORAGE', unit: 'sq ft', qty: 40, materials: 1260, labor: 540, margin: 15 }], totalValue: 82800 } },
  leadProfile: { name: 'Asha Menon', phone: '9820012345' },
  ...over,
});

describe('Item Bank usage export', () => {
  const out = buildBankUsageExport(bank(), [project()], { studio: 'Form Factors', at: Date.UTC(2026, 10, 20) });
  const p = out.projects[0];
  const line = (id: string) => p.tiers[0].lines.find(l => l.id === id)!;

  it('carries the bank whole and names what it is', () => {
    expect(out.kind).toBe(BANK_USAGE_KIND);
    expect(out.bank).toHaveLength(3);
    expect(bankUsageFileName('Form Factors', Date.UTC(2026, 10, 20))).toBe('Form_Factors_Item_Bank_Usage_2026-11-20.json');
  });

  it('prices a line as the BOQ does and says which figures still follow the item', () => {
    const l = line('l1');
    expect(l.source).toBe('bank');
    expect(l.rate).toBeCloseTo((1260 + 540) * 1.15, 5);
    expect(l.total).toBeCloseTo(l.rate * 40, 5);
    expect(l.follows).toEqual(['materials', 'labor', 'margin']);
  });

  it('reads the project\'s own copy of an item before the bank\'s', () => {
    const l = line('l2');
    expect(l.source).toBe('own');
    // Own copy: labour 600, margin 0. The bank's copy says 684.
    expect(l.rate).toBeCloseTo(1500 + 600, 5);
    expect(l.follows).toEqual(['labor', 'margin']);
    expect(p.ownItems.map(i => i.id)).toEqual(['ADHOC_a1']);
  });

  it('marks a line that carries all three figures as fixed', () => {
    const l = line('l3');
    expect(l.follows).toEqual([]);
    expect(l.rate).toBeCloseTo((1400 + 500) * 1.25, 5);
    expect(l.rateSnapshotAt).toBe(1742000000000);
  });

  it('keeps a line whose item is in neither place, priced off its own fields', () => {
    const l = line('l4');
    expect(l.source).toBe('none');
    expect(l.name).toBe('Old custom shelf');
    expect(l.rate).toBeCloseTo(900 * 1.1, 5);
  });

  it('totals an option exactly as the studio does, deleted lines left out', () => {
    const t = p.tiers[0];
    const ctx = project().context;
    expect(t.total).toBeCloseTo(boqTotal(project().tiers[0].boq, buildBankMap(bank(), ctx.adHocItems)), 5);
    expect(line('l5').billable).toBe(false);
    expect(t.lifecycleTag).toBe('Current contract');
    expect(t.approvedAt).toBe(1741000000000);
  });

  it('carries the approved baseline and the project\'s standing', () => {
    expect(p.name).toBe('Tower B 1204');
    expect(p.status).toBe('closed');
    expect(p.executionStatus).toBe('completed');
    expect(p.baseline?.lines[0]).toMatchObject({ bankId: 'gen-015', qty: 40, margin: 15 });
  });

  it('carries a project\'s own item figures exactly as stored, a list included', () => {
    const odd = buildBankUsageExport(bank(), [project({ context: { name: 'Hiranandani One', adHocItems: [item('own-9', 'PANELING', { materials: [1440], labor: [], margin: 0 })] } })]);
    expect(odd.projects[0].ownItems[0]).toMatchObject({ materials: [1440], labor: [], margin: 0 });
  });

  it('finds bank ids outside the options, so no reference is missed', () => {
    expect(p.otherRefs).toEqual([{ path: 'context.revision.actions[].newValue', bankId: 'ADHOC_zz' }]);
  });

  it('leaves the client out', () => {
    const text = JSON.stringify(out);
    expect(text).not.toContain('Asha Menon');
    expect(text).not.toContain('9820012345');
    expect(text).not.toContain('Powai');
    expect(text).not.toContain('Master Bedroom');
  });

  it('changes neither the bank nor the projects', () => {
    const b = bank();
    const ps = [project()];
    const before = JSON.stringify({ b, ps });
    buildBankUsageExport(b, ps);
    expect(JSON.stringify({ b, ps })).toBe(before);
  });

  it('survives projects with nothing in them', () => {
    const empty = buildBankUsageExport(bank(), [{ id: 'p2' } as any, null as any, { id: 'p3', context: {}, tiers: [{ id: 't', boq: null }] } as any]);
    expect(empty.projects.map(x => x.id)).toEqual(['p2', 'p3']);
    expect(empty.projects[1].tiers[0].lines).toEqual([]);
  });
});
