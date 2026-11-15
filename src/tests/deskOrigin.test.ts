/*
  Opening a sheet in Design Desk from a project records where it came from,
  so the Desk's back button can return there.
*/
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/firebaseClient', () => ({ db: null, storage: null, functions: null, auth: null }));

import { openInDesignReview, takeOpenRequest, returnFromDesk } from '../../services/drawingReviewService';

const tabs = () => {
  const seen: string[] = [];
  const on = (e: any) => seen.push(e.detail);
  window.addEventListener('change-tab', on);
  return { seen, off: () => window.removeEventListener('change-tab', on) };
};

describe('Design Desk remembers where a sheet came from', () => {
  it('hands over the sheet and its origin, once', () => {
    const t = tabs();
    openInDesignReview('p1', 'd1', { tab: 'drawing-tracker', label: 'Drawings' });
    expect(t.seen).toEqual(['design-review']);
    expect(takeOpenRequest()).toEqual({ projectId: 'p1', drawingId: 'd1', from: { tab: 'drawing-tracker', label: 'Drawings' } });
    expect(takeOpenRequest()).toBeNull();
    t.off();
  });

  it('opened with no origin, has none', () => {
    openInDesignReview('p1', 'd1');
    expect(takeOpenRequest()?.from).toBeNull();
  });

  it('goes back to the tab it came from', () => {
    const t = tabs();
    returnFromDesk({ tab: 'drawing-tracker', label: 'Drawings' });
    expect(t.seen).toEqual(['drawing-tracker']);
    t.off();
  });
});
