import { describe, it, expect } from 'vitest';
import { matchFile, cleanShape, allowed, laneOf, canReview, canUpload, guessAudience, safeId, uploadPrefix, toView, toPage, turnShape } from '../../lib/drawingReview';

const drawings = [
  { id: 'k1', name: 'Kitchen Elevation', roomName: 'Kitchen' },
  { id: 'k2', name: 'Kitchen Carpentry Detail', roomName: 'Kitchen' },
  { id: 'w1', name: 'Wardrobe Elevation', roomName: 'Master Bedroom' },
  { id: 'w2', name: 'Wardrobe Carpentry Detail', roomName: 'Master Bedroom' },
  { id: 't1', name: 'TV Unit Elevation', roomName: 'Living' },
];

describe('which drawing a dropped file is', () => {
  it('takes a file named after one drawing', () => {
    expect(matchFile('Kitchen_Carpentry_Detail_r2.pdf', drawings)).toMatchObject({ kind: 'exact', id: 'k2' });
    expect(matchFile('tv unit elevation FINAL.pdf', drawings)).toMatchObject({ kind: 'exact', id: 't1' });
  });
  it('asks when the name fits more than one drawing', () => {
    const m = matchFile('wardrobe.pdf', drawings);
    expect(m.kind).toBe('choose');
    expect(m.kind === 'choose' && m.options).toEqual(expect.arrayContaining(['w1', 'w2']));
  });
  it('asks with every drawing when nothing fits, and never creates one', () => {
    const m = matchFile('scan0042.pdf', drawings);
    expect(m.kind === 'choose' && m.options.length).toBe(drawings.length);
  });
  it('refuses CAD files and anything that is not a PDF', () => {
    expect(matchFile('kitchen.dwg', drawings).kind).toBe('refused');
    expect(matchFile('kitchen.jpg', drawings).kind).toBe('refused');
  });
});

describe('the steps a sheet can take', () => {
  it('follows the review order', () => {
    expect(allowed('finalize', null)).toBe(true);
    expect(allowed('submit', { state: 'DRAFT' })).toBe(true);
    expect(allowed('submit', { state: 'IN_REVIEW' })).toBe(false);
    expect(allowed('approve', { state: 'IN_REVIEW' })).toBe(true);
    expect(allowed('approve', { state: 'DRAFT' })).toBe(false);
    expect(allowed('finalize', { state: 'IN_REVIEW' })).toBe(false);
    expect(allowed('finalize', { state: 'APPROVED' })).toBe(true);
  });
  it('puts each state in its lane', () => {
    expect(laneOf(null)).toBe('desk');
    expect(laneOf({ state: 'CHANGES_REQUESTED' })).toBe('desk');
    expect(laneOf({ state: 'IN_REVIEW' })).toBe('review');
    expect(laneOf({ state: 'APPROVED' })).toBe('approved');
  });
  it('lets the Design Head decide and designers upload, never decide', () => {
    expect(canReview('Design Head')).toBe(true);
    expect(canReview('Designer')).toBe(false);
    expect(canUpload('Designer')).toBe(true);
    expect(canUpload('Viewer')).toBe(false);
  });
});

describe('turning the sheet', () => {
  const turns = [0, 90, 180, 270] as const;
  it('puts a point back exactly where it was', () => {
    for (const t of turns) {
      const [x, y] = toPage(toView([0.2, 0.7], t), t);
      expect(x).toBeCloseTo(0.2); expect(y).toBeCloseTo(0.7);
    }
  });
  it('turns clockwise: the page’s top-left corner goes to the top-right at 90°', () => {
    expect(toView([0, 0], 90)).toEqual([1, 0]);
    expect(toView([1, 0], 90)).toEqual([1, 1]);
    expect(toView([0, 0], 180)).toEqual([1, 1]);
    expect(toView([0, 0], 270)).toEqual([0, 1]);
  });
  it('keeps a box a box, the same size', () => {
    const box = { t: 'rect' as const, x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
    const v = turnShape(box, 90, 'view');
    expect(v.t === 'rect' && [v.w, v.h].map((n) => +n.toFixed(4))).toEqual([0.1, 0.3]);
    const back = turnShape(v, 90, 'page');
    expect(back.t === 'rect' && [back.x, back.y, back.w, back.h].map((n) => +n.toFixed(4))).toEqual([0.1, 0.2, 0.3, 0.1]);
  });
});

describe('marks and paths', () => {
  it('keeps shapes on the page and drops anything else', () => {
    expect(cleanShape({ t: 'pin', x: 0.5, y: 0.25 })).toEqual({ t: 'pin', x: 0.5, y: 0.25 });
    expect(cleanShape({ t: 'rect', x: 0.1, y: 0.1, w: 0, h: 0.2 })).toBeNull();
    expect(cleanShape({ t: 'pin', x: 4, y: 0 })).toBeNull();
    expect(cleanShape({ t: 'script', x: 0, y: 0 })).toBeNull();
  });
  it('refuses ids that could climb out of their folder', () => {
    expect(safeId('dwg_custom_123')).toBe(true);
    expect(safeId('../other')).toBe(false);
    expect(safeId('a/b')).toBe(false);
    expect(uploadPrefix('s', 'p', 'd', 'u')).toBe('drawingReview/s/p/d/uploads/u/');
  });
  it('guesses who a drawing is for', () => {
    expect(guessAudience('Kitchen Carpentry Detail')).toBe('studio');
    expect(guessAudience('Electrical Layout')).toBe('studio');
    expect(guessAudience('Kitchen Elevation')).toBe('client');
  });
});
