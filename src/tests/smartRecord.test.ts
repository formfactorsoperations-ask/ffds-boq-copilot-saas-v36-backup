/*
  Smart Record and the scope-creep catcher (smart workspace, PR 3; owner,
  27 Nov 2026): notes sorted into kinds, what filing writes, and extra work
  checked against the BOQ and the Item bank (lib/smartRecord).
*/
import { describe, it, expect } from 'vitest';
import { normaliseNotes, filingPlan, scopeCheck, askScopeAddition, takeScopeAddition, RECORD_GROUPS } from '../../lib/smartRecord';

const raw = {
  summary: 'Walked the site with the client. Living layout agreed; a pooja unit asked for.',
  items: [
    { kind: 'decision', text: 'Living room layout approved', room: 'living', category: 'Client Request' },
    { kind: 'snag', text: 'Hall ceiling 20 mm off level, fix before paint', room: 'Hall', severity: 'high' },
    { kind: 'extra_work', text: 'Pooja unit in the passage', room: '' },
    { kind: 'client_promise', text: 'Pay the design balance by Friday', due: '2026-11-29' },
    { kind: 'our_promise', text: 'Send the shutter samples' },
    { kind: 'nonsense', text: 'dropped' },
    { kind: 'snag', text: '' },
  ],
};
const ROOMS = ['Living Room', 'Hall', 'Kitchen'];

describe('normaliseNotes', () => {
  const n = normaliseNotes(raw, ROOMS);

  it('keeps known kinds with words, and drops the rest', () => {
    expect(n.items.map((i) => i.kind)).toEqual(['decision', 'snag', 'extra_work', 'client_promise', 'our_promise']);
    expect(n.items.every((i) => i.selected)).toBe(true);
  });

  it('names rooms the way the project does, and keeps a date only when it is real', () => {
    expect(n.items[0].room).toBe('Living Room');
    expect(n.items[1].room).toBe('Hall');
    expect(n.items[3].due).toBe('2026-11-29');
    expect(normaliseNotes({ items: [{ kind: 'date', text: 'x', due: 'Friday' }] }).items[0].due).toBeNull();
  });

  it('gives a decision a category and a snag a severity, defaulting safely', () => {
    expect(n.items[0].category).toBe('Client Request');
    expect(n.items[1].severity).toBe('high');
    const d = normaliseNotes({ items: [{ kind: 'decision', text: 'x', category: 'Whatever' }, { kind: 'snag', text: 'y', severity: 'urgent' }] }).items;
    expect(d[0].category).toBe('Client Request');
    expect(d[1].severity).toBe('medium');
  });

  it('covers every kind in RECORD_GROUPS with a place it goes', () => {
    expect(RECORD_GROUPS.every((g) => g.becomes.length > 0)).toBe(true);
  });
});

describe('filingPlan', () => {
  const n = normaliseNotes(raw, ROOMS);

  it('files each ticked kind where the studio keeps it', () => {
    const p = filingPlan(n, 'site_visit', '2026-11-27', 'owner', 'Mrs. Mehta');
    expect(p.followUps[0]).toMatchObject({ note: expect.stringMatching(/^Site visit: Walked the site/), outcome: 'promised', next: null });
    expect(p.followUps.slice(1).map((f) => f.next?.text)).toEqual(['Check: Pay the design balance by Friday', 'Send the shutter samples']);
    expect(p.followUps[1].next?.due).toBe('2026-11-29');
    expect(p.followUps[2].next?.due).toBe('2026-11-29'); // two days on, when no date was said
    expect(p.decisions).toEqual([expect.objectContaining({ title: 'Living room layout approved', roomName: 'Living Room', category: 'Client Request', presentees: 'Mrs. Mehta' })]);
    expect(p.snags).toEqual([expect.objectContaining({ roomName: 'Hall', severity: 'high', status: 'open', raisedBy: 'owner' })]);
    expect(p.extras.map((e) => e.text)).toEqual(['Pooja unit in the passage']);
  });

  it('files nothing that was not ticked', () => {
    const none = { ...n, items: n.items.map((i) => ({ ...i, selected: false })) };
    const p = filingPlan(none, 'meeting', '2026-11-27', 'designer');
    expect(p.followUps).toHaveLength(1);
    expect(p.followUps[0].outcome).toBe('info');
    expect(p.decisions).toEqual([]);
    expect(p.snags).toEqual([]);
    expect(p.extras).toEqual([]);
  });
});

describe('scopeCheck: the scope-creep catcher', () => {
  const bank: any[] = [
    { id: 'b1', name: 'Pooja Unit', unit: 'nos', materials: 30000, labor: 8000, margin: 20 },
    { id: 'b2', name: 'Shoe Rack', unit: 'nos', materials: 9000, labor: 2000, margin: 20 },
    { id: 'b3', name: 'Pooja Unit (Marble Back)', unit: 'nos', materials: 42000, labor: 9000, margin: 20 },
  ];
  const boq = [{ id: 'l1', name: 'TV Unit' }, { id: 'l2', name: 'Shoe Rack' }];

  it('says when the work is not in the BOQ by name, and what the bank would price it at', () => {
    const c = scopeCheck('Pooja unit in the passage', boq, bank);
    expect(c.inBoq).toBeNull();
    expect(c.bank[0]).toMatchObject({ id: 'b1', name: 'Pooja Unit', unit: 'nos' });
    expect(c.bank[0].rate).toBeGreaterThan(38000);
  });

  it('says when it reads as a line already in the BOQ', () => {
    expect(scopeCheck('Shoe rack', boq, bank).inBoq).toEqual({ name: 'Shoe Rack' });
  });

  it('offers nothing from the bank when nothing is like it', () => {
    expect(scopeCheck('Repaint the gate', boq, bank).bank).toEqual([]);
  });
});

describe('handing a request to Scope Additions', () => {
  it('opens the form with the request, once, for that project only', () => {
    askScopeAddition('p1', 'Pooja unit in the passage');
    expect(takeScopeAddition('p2')).toBeNull();
    expect(takeScopeAddition('p1')).toBe('Pooja unit in the passage');
    expect(takeScopeAddition('p1')).toBeNull();
  });
});
