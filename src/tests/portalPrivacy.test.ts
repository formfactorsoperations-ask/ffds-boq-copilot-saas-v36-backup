import { describe, it, expect } from 'vitest';
import { buildPortalView } from '../../lib/portalProjection';
import { buildClientBoqRows } from '../../lib/clientBoq';
import { clientVisibleAttendees, clientActionOwner } from '../../lib/clientPeople';

/*
  What a client must never receive: who the studio buys from, the studio's own
  notes, and how the price was built. These check the copy the client is sent,
  not the screen -- whatever is in the copy, the client has.
*/

const ctx: any = {
  name: 'Unique Vistas',
  clientName: 'Mr Prasad Naik',
  materialSelections: [{
    id: 'm1', itemName: 'Kitchen laminate', brand: 'Merino', finishCode: 'MR-1234',
    vendor: 'Shree Laminates, Thane', notes: 'Dealer gives us 18% off, do not mention',
    quotedPrice: 8250, allowancePrice: 9000, status: 'pending', clientVisibility: { state: 'published' },
  }],
};

const schedule: any = {
  tasks: [
    { id: 'exec-carp', title: 'Carpentry', kind: 'execution', dependencies: [], workDays: 10, status: 'pending',
      note: 'Ramesh mistri, pay 40% advance', earlyStart: { reason: 'Client approved demolition', at: 1, by: 'anish@ffds' } },
  ],
  holds: [{ id: 'h1', scope: 'trade', target: 'Carpentry', fromISO: '2026-11-02', workDays: 3,
    reason: 'Vendor unavailable', note: 'Ramesh at another site', by: 'ops@ffds', at: 1 }],
  markers: [{ id: 'mk1', atISO: '2026-11-01', kind: 'vendor_meeting', title: 'Carpenter rate negotiation' }],
  calendar: undefined,
  baselineAt: null,
};

const view = () => buildPortalView('p1', ctx, undefined, undefined, undefined, undefined, undefined, schedule);
const text = () => JSON.stringify(view());

describe('the copy a client is sent', () => {
  it('carries no vendor and no studio notes on a finish', () => {
    const m = view().context.materialSelections[0];
    expect(m.vendor).toBeUndefined();
    expect(m.notes).toBeUndefined();
    expect(text()).not.toContain('Shree Laminates');
    expect(text()).not.toContain('18% off');
    // What they need to recognise and decide on it still travels.
    expect(m.brand).toBe('Merino');
    expect(m.finishCode).toBe('MR-1234');
  });

  it('carries the programme without task notes, hold notes, who logged them, or meetings', () => {
    const s = view().context.clientSchedule;
    expect(s.tasks[0].note).toBeUndefined();
    expect(s.tasks[0].earlyStart).toEqual({ reason: '', at: 1 });
    expect(s.holds[0].note).toBeUndefined();
    expect(s.holds[0].by).toBeUndefined();
    expect(s.markers).toBeUndefined();
    // The hold window still moves the dates, so it travels.
    expect(s.holds[0]).toMatchObject({ fromISO: '2026-11-02', workDays: 3, target: 'Carpentry' });
    for (const secret of ['Ramesh', 'anish@ffds', 'ops@ffds', 'rate negotiation', '40% advance']) {
      expect(text()).not.toContain(secret);
    }
  });
});

describe('the drawings a client is sent', () => {
  const pub = { state: 'published' as const };
  const drawing = (id: string, roomName: string, title: string, addedAt: string) =>
    ({ id, roomName, title, url: `https://drive/${id}`, docType: 'gfc_drawing', addedAt, clientVisibility: pub });
  const docs = [
    drawing('d1', 'Master Bedroom', 'Elevation A', '2026-11-01T10:00:00Z'),
    drawing('d2', 'Master Bedroom', 'Elevation B', '2026-11-02T10:00:00Z'),
    drawing('d3', "Parents' Bedroom", 'Elevation A', '2026-11-03T10:00:00Z'),
    { ...drawing('d4', 'Kitchen', 'Draft elevation', '2026-11-04T10:00:00Z'), clientVisibility: { state: 'draft' as const } },
  ];
  const sent = () => buildPortalView('p1', { name: 'x', designDocuments: docs } as any).context.designDocuments;
  /* The same key the portal's drawingSets groups on. */
  const cards = (list: any[]) => new Set(list.map((d) =>
    `${(d.roomName || 'Overall').trim().toLowerCase()}|${(d.title || 'Drawing').trim().toLowerCase()}`)).size;

  it('keeps one card per drawing, as the studio preview shows it', () => {
    const published = docs.filter((d) => d.clientVisibility.state === 'published');
    expect(sent()).toHaveLength(3);
    expect(cards(sent())).toBe(cards(published));
  });

  it('carries the room, title, type and date of each drawing', () => {
    expect(sent()[0]).toMatchObject({
      roomName: 'Master Bedroom', title: 'Elevation A', docType: 'gfc_drawing', addedAt: '2026-11-01T10:00:00Z',
    });
  });

  it('still sends no draft drawing', () => {
    expect(JSON.stringify(sent())).not.toContain('Draft elevation');
  });
});

describe('a scope variation a client is sent', () => {
  it('carries its status and net price, not its line changes or rationale', () => {
    const u = buildPortalView('p1', { name: 'x', projectUpdates: [{
      id: 'v1', title: 'Wardrobe upgrade', date: '2026-11-04', type: 'client_upgrade', status: 'pending_approval', netImpact: 42000,
      changes: [{ boqItemId: 'b1', itemName: 'Wardrobe', changeType: 'upgrade', oldValue: 1, newValue: 2, delta: 1, rationale: 'carpenter quoted low' }],
      clientVisibility: { state: 'published' },
    }] } as any).context.projectUpdates[0];
    expect(u).toMatchObject({ status: 'pending_approval', netImpact: 42000, type: 'client_upgrade' });
    expect(u.changes).toBeUndefined();
    expect(JSON.stringify(u)).not.toContain('carpenter quoted low');
  });
});

describe('the client scope', () => {
  it('sends the sell rate only, never materials, labour or margin', () => {
    const rows = buildClientBoqRows({
      boq: [{ id: 'b1', bankId: 'k1', qty: 2 }],
      bank: [{ id: 'k1', name: 'Wardrobe', unit: 'sqft', materials: 1000, labor: 200, margin: 30 }],
    });
    const row: any = rows[0];
    expect(row.rate).toBeGreaterThan(0);
    for (const k of ['materials', 'labor', 'margin', 'marginOverride', 'baseRate', 'bankId']) {
      expect(row[k]).toBeUndefined();
    }
  });

  it("does not print the studio tools' bookkeeping as a description", () => {
    const rows = buildClientBoqRows({
      boq: [
        { id: 'a', item: 'TV unit', rate: 100, qty: 1, rationale: 'Added via Focus Studio Workspace' },
        { id: 'b', item: 'Shoe rack', rate: 100, qty: 1, rationale: 'Added from Bundle: Premium 3BHK' },
        { id: 'c', item: 'Vanity', rate: 100, qty: 1, rationale: 'Spec Note: 18mm BWP ply' },
      ],
      bank: [],
    });
    expect(rows[0].description).toBe('');
    expect(rows[1].description).toBe('');
    expect(rows[2].description).toBe('Spec Note: 18mm BWP ply');
  });
});

describe('who a client is shown from a meeting', () => {
  it('leaves vendors out of the attendees', () => {
    expect(clientVisibleAttendees(
      [{ name: 'Prasad', side: 'client' }, { name: 'Ramesh', side: 'vendor' }, { name: 'Anish', side: 'ffds' }],
    )).toEqual([{ name: 'Prasad', side: 'client' }, { name: 'Anish', side: 'ffds' }]);
    expect(clientVisibleAttendees(['Prasad', 'Ramesh', 'Anish'], [
      { name: 'Prasad', email: '', side: 'client' },
      { name: 'Ramesh', email: 'ramesh@carpentry.in', side: 'vendor' },
      { name: 'Anish', email: '', side: 'ffds' },
    ])).toEqual(['Prasad', 'Anish']);
  });

  it('names a vendor-owned action as the studio site team', () => {
    expect(clientActionOwner({ owner: 'vendor', ownerName: 'Ramesh' })).toBe('FFDS site team');
    expect(clientActionOwner({ owner: 'client', ownerName: 'Mr Naik' })).toBe('Mr Naik');
    expect(clientActionOwner({ owner: 'ffds' })).toBe('FFDS');
  });
});
