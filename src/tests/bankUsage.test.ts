/*
  Which projects use a bank item: by the line's bank id, or by its name.
  The index must answer exactly as the walk over every line used to.
*/
import { describe, it, expect } from 'vitest';
import { bankUsageIndex, projectsUsingItem } from '../../lib/bankUsage';

const projects: any[] = [
  { id: 'p1', tiers: [{ boq: [{ bankId: 'a', name: 'Wardrobe' }, { name: '  king size BED ' }] }] },
  { id: 'p2', tiers: [{ boq: null }, {}], canonical: { boq: { items: [{ bankId: 'a' }, { name: 'TV unit' }] } } },
  { id: 'p3' },
];

/** The rule as the bank screens wrote it out, line by line. */
const slow = (item: any) => {
  const name = (item.name || '').trim().toLowerCase();
  const hit = new Set<string>();
  const uses = (l: any) => (l.bankId && l.bankId === item.id) || (l.name && l.name.trim().toLowerCase() === name);
  projects.forEach((p) => {
    p.tiers?.forEach((t: any) => t.boq?.forEach((l: any) => { if (uses(l)) hit.add(p.id); }));
    p.canonical?.boq?.items?.forEach((l: any) => { if (uses(l)) hit.add(p.id); });
  });
  return [...hit].sort();
};

describe('which projects use a bank item', () => {
  const index = bankUsageIndex(projects);
  const items = [
    { id: 'a', name: 'Something else' },
    { id: 'b', name: 'King Size Bed' },
    { id: 'c', name: 'tv unit' },
    { id: 'a', name: 'TV UNIT' },
    { id: 'd', name: '' },
    { id: 'e', name: 'Nobody uses this' },
  ];

  it.each(items)('answers as the walk over every line did: $id "$name"', (item) => {
    expect([...projectsUsingItem(index, item)].sort()).toEqual(slow(item));
  });

  it('finds an item by id and by name together, and nothing for an unnamed new item', () => {
    expect([...projectsUsingItem(index, items[3])].sort()).toEqual(['p1', 'p2']);
    expect(projectsUsingItem(index, items[4]).size).toBe(0);
  });

  it('copes with no projects', () => {
    expect(projectsUsingItem(bankUsageIndex(undefined), items[0]).size).toBe(0);
  });
});
