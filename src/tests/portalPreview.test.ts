import { describe, it, expect } from 'vitest';
import { applyPreviewEdit, sameJson, viewDifferences, differenceLabels } from '../../lib/portalPreview';
import { buildPortalView } from '../../lib/portalProjection';

/*
  The studio's preview draws from the client's copy, and edits made there are
  applied back to the project. The copy leaves out costs, vendors, notes and
  drafts; none of that may be lost by an edit made in the preview.
*/

const pub = { state: 'published' as const };

const live: any = {
  name: 'Test · Portal parity',
  clientName: 'Test Client',
  internalNotes: 'Margin 32% on carpentry -- never to the client',
  materialSelections: [
    { id: 'm1', itemName: 'Kitchen laminate', brand: 'Merino', vendor: 'Shree Laminates', notes: '18% off', quotedPrice: 8250, status: 'pending', clientVisibility: pub },
    { id: 'm2', itemName: 'Draft tile', vendor: 'Kajaria dealer', status: 'pending' },
    { id: 'm3', itemName: 'Wardrobe shutters', brand: 'Greenlam', vendor: 'Greenlam depot', status: 'pending', clientVisibility: pub },
  ],
  designDocuments: [
    { id: 'd1', roomName: 'Master Bedroom', title: 'Elevation A', url: 'u1', docType: 'gfc_drawing', addedAt: '2026-11-01', clientVisibility: pub, uploadedBy: 'tanvi@studio' },
  ],
  paymentMilestones: [
    { id: 'p1', name: 'Booking', percentage: 10, internalNote: 'chase hard' },
    { id: 'p2', name: 'Design', percentage: 20 },
  ],
};

const copy = () => buildPortalView('p1', live).context as any;

describe('an edit made in the preview', () => {
  it('changes only what the edit changed, keeping every field the copy leaves out', () => {
    const before = copy();
    const after = {
      ...before,
      materialSelections: before.materialSelections.map((m: any) =>
        m.id === 'm3' ? { ...m, status: 'change_requested', changeReason: 'Can we see a matte finish?' } : m),
    };
    const next = applyPreviewEdit(live, before, after);
    const m3 = next.materialSelections.find((m: any) => m.id === 'm3');
    expect(m3).toMatchObject({ status: 'change_requested', changeReason: 'Can we see a matte finish?', vendor: 'Greenlam depot' });
    const m1 = next.materialSelections.find((m: any) => m.id === 'm1');
    expect(m1).toEqual(live.materialSelections[0]);
    // The draft the copy never carried is still there, untouched and in place.
    expect(next.materialSelections.map((m: any) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(next.materialSelections[1]).toBe(live.materialSelections[1]);
    expect(next.internalNotes).toBe(live.internalNotes);
    expect(next.designDocuments).toBe(live.designDocuments);
  });

  it('keeps the project exactly as it was when nothing changed', () => {
    const before = copy();
    expect(applyPreviewEdit(live, before, JSON.parse(JSON.stringify(before)))).toBe(live);
  });

  it('adds what the edit added, and adds no part of the copy that the project does not keep', () => {
    const before = copy();
    const added = { id: 'u9', title: 'Site cleared', status: 'published', clientVisibility: pub };
    const after = { ...before, projectUpdates: [...(before.projectUpdates || []), added] };
    const next: any = applyPreviewEdit(live, before, after);
    expect(next.projectUpdates).toEqual([added]);
    expect(next.portalStudio).toBeUndefined();
    expect(next.clientBoq).toBeUndefined();
  });

  it('writes a signature onto a milestone by position, keeping its internal note', () => {
    const before = copy();
    const after = { ...before, paymentMilestones: before.paymentMilestones.map((m: any, i: number) => (i === 0 ? { ...m, clientAcknowledgedAt: '2026-11-06' } : m)) };
    const next: any = applyPreviewEdit(live, before, after);
    expect(next.paymentMilestones[0]).toMatchObject({ id: 'p1', clientAcknowledgedAt: '2026-11-06', internalNote: 'chase hard' });
  });

  it('records a document signature without disturbing the rest of the document record', () => {
    const withDocs: any = { ...live, documents: { issues: [{ id: 'i1', kind: 'terms_docket', version: 1, clientVisibility: pub, internalReviewer: 'mayuri', content: 'x' }], lastViewedAt: {} } };
    const before: any = buildPortalView('p1', withDocs).context;
    const after = { ...before, documents: { ...before.documents, issues: before.documents.issues.map((i: any) => ({ ...i, clientSignature: { name: 'Test Client' } })) } };
    const next: any = applyPreviewEdit(withDocs, before, after);
    expect(next.documents.issues[0]).toMatchObject({ id: 'i1', clientSignature: { name: 'Test Client' }, internalReviewer: 'mayuri', content: 'x' });
  });
});

describe('whether the client has what the preview shows', () => {
  it('is the same copy after a round trip through storage', () => {
    const v = buildPortalView('p1', live);
    const stored = JSON.parse(JSON.stringify({ ...v, builtAt: 'later' }));
    expect(viewDifferences(stored, v)).toEqual([]);
  });

  it('names the drawings when a drawing changed, even with the same count', () => {
    const v = buildPortalView('p1', live) as any;
    const sent = JSON.parse(JSON.stringify(v));
    sent.context.designDocuments[0].roomName = undefined;
    expect(differenceLabels(viewDifferences(sent, v))).toEqual(['drawings']);
  });

  it('treats a Firestore timestamp and the same instant as equal', () => {
    expect(sameJson({ at: { seconds: 10, nanoseconds: 0 } }, { at: new Date(10000) })).toBe(true);
  });

  it('ignores the scope baseline, which the portal never draws', () => {
    const v = buildPortalView('p1', live) as any;
    const sent = JSON.parse(JSON.stringify(v));
    const preview = { ...v, context: { ...v.context, clientBoqBaseline: [{ id: 'b1', item: 'Wardrobe', total: 1 }] } };
    expect(viewDifferences(sent, preview)).toEqual([]);
  });

  it('says everything differs when the client has no copy', () => {
    expect(viewDifferences(null, buildPortalView('p1', live))).toEqual(['everything']);
  });
});
