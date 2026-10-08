import { describe, it, expect } from 'vitest';
import {
  needsMe, attention, reviewQueue, statsOf, readyRooms, matchesQuery, projectLook, switcherGroups, pushRecent,
  suggestions, dueOf, roundWarn, type DeskRow,
} from '../../lib/designDesk';
import { diffSheets } from '../../lib/sheetDiff';
import type { ReviewSummary, ReviewState } from '../../lib/drawingReview';

const NOW = new Date('2026-10-08T10:00:00');
const day = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * day).toISOString().slice(0, 10);

const person = (name: string) => ({ uid: name.toLowerCase(), email: `${name.toLowerCase()}@studio.in`, name });
let seq = 0;
function sheet(state: ReviewState | 'NONE', o: Partial<DeskRow> & { by?: string; review?: Partial<ReviewSummary> } = {}): DeskRow {
  seq++;
  const { by = 'Riya', review, ...rest } = o;
  return {
    id: `d${seq}`, projectId: 'p1', name: `Sheet ${seq}`, roomName: 'Kitchen', ...rest,
    review: state === 'NONE' ? undefined : {
      schema: 1, orgId: 's', projectId: rest.projectId || 'p1', drawingId: `d${seq}`, state, rev: seq, audience: 'client',
      versionId: 'v', versionNo: 1, pdfPath: 'x', thumbPath: null, pageCount: 1, openRoundId: null, attempts: 1,
      designer: person(by), submittedAt: NOW.getTime() - seq * 1000, decidedBy: null, decidedAt: null, reason: null,
      selfApproved: false, marksTotal: 0, marksOpen: 0, marksSeq: 0, updatedAt: 0, ...review,
    } as ReviewSummary,
  };
}

const head = { reviewer: true, email: 'head@studio.in' };
const riya = { reviewer: false, email: 'riya@studio.in' };

describe('who needs what', () => {
  it('the Design Head needs every sheet in review; a designer needs only their own to fix or send', () => {
    const rows = [sheet('IN_REVIEW'), sheet('CHANGES_REQUESTED'), sheet('DRAFT'), sheet('DRAFT', { by: 'Kabir' }), sheet('APPROVED'), sheet('NONE')];
    expect(rows.filter((d) => needsMe(d, head)).length).toBe(1);
    expect(attention(rows, riya)).toBe(2);
  });

  it('a Design Head who draws also needs her own returned sheets', () => {
    const rows = [sheet('CHANGES_REQUESTED', { by: 'Head' }), sheet('IN_REVIEW', { by: 'Head' })];
    expect(attention(rows, head)).toBe(2);
  });

  it('queues the overdue first, then the oldest sent', () => {
    const a = sheet('IN_REVIEW', { review: { submittedAt: 3 } });
    const b = sheet('IN_REVIEW', { review: { submittedAt: 1 } });
    const late = sheet('IN_REVIEW', { targetDate: iso(-2), review: { submittedAt: 9 } });
    expect(reviewQueue([a, b, late], null, NOW).map((d) => d.id)).toEqual([late.id, b.id, a.id]);
    expect(reviewQueue([a, sheet('IN_REVIEW', { projectId: 'p2' })], 'p1', NOW)).toHaveLength(1);
  });

  it('counts a project by state', () => {
    expect(statsOf([sheet('APPROVED'), sheet('APPROVED'), sheet('IN_REVIEW'), sheet('NONE'), sheet('DRAFT')]))
      .toEqual({ total: 5, approved: 2, review: 1, changes: 0, draft: 1, none: 1 });
  });
});

describe('rooms and search', () => {
  it('a room is ready to present when every client sheet in it is approved', () => {
    const rows = [
      sheet('APPROVED', { roomName: 'Kitchen' }), sheet('DRAFT', { roomName: 'Kitchen', name: 'Kitchen carpentry details', review: { audience: 'studio' } }),
      sheet('APPROVED', { roomName: 'Foyer' }), sheet('IN_REVIEW', { roomName: 'Foyer' }),
    ];
    expect(readyRooms(rows)).toEqual([{ projectId: 'p1', room: 'Kitchen' }]);
  });

  it('finds sheets by name, room, designer or project, every word', () => {
    const d = sheet('IN_REVIEW', { name: 'Wardrobe elevation', roomName: 'Master Bedroom', by: 'Kabir' });
    expect(matchesQuery(d, 'wardrobe kabir')).toBe(true);
    expect(matchesQuery(d, 'master', 'Harmony 704')).toBe(true);
    expect(matchesQuery(d, 'harmony', 'Harmony 704')).toBe(true);
    expect(matchesQuery(d, 'kitchen')).toBe(false);
  });
});

describe('projects', () => {
  it('gives every project a steady two-letter mark and colour', () => {
    expect(projectLook('abc', 'Harmony 704').code).toBe('H7');
    expect(projectLook('abc', 'Lakeview').code).toBe('LA');
    expect(projectLook('abc', 'Harmony 704')).toEqual(projectLook('abc', 'Harmony 704'));
  });

  it('orders the switcher: pinned, then waiting on you, then recently used', () => {
    const need: Record<string, number> = { b: 1, c: 4 };
    const g = switcherGroups(['a', 'b', 'c', 'd', 'e'], { pinned: ['e'], recent: ['d', 'a'], need: (id) => need[id] || 0 });
    expect(g).toEqual({ pinned: ['e'], needs: ['c', 'b'], rest: ['d', 'a'] });
  });

  it('keeps the most recent project first, once', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['a', 'b'], 'z', 2)).toEqual(['z', 'a']);
  });
});

describe('dates and rounds', () => {
  it('says how close a target date is', () => {
    expect(dueOf(iso(-2), NOW)?.label).toBe('Overdue 2 d');
    expect(dueOf(iso(0), NOW)?.label).toBe('Due today');
    expect(dueOf(iso(1), NOW)?.rank).toBe(1);
    expect(dueOf(null, NOW)).toBeNull();
  });

  it('flags a third round', () => {
    expect(roundWarn(sheet('IN_REVIEW', { review: { attempts: 2 } }).review)).toBe(0);
    expect(roundWarn(sheet('CHANGES_REQUESTED', { review: { attempts: 2 } }).review)).toBe(3);
    expect(roundWarn(sheet('APPROVED', { review: { attempts: 5 } }).review)).toBe(0);
  });
});

describe('worth a look', () => {
  const projectName = (id: string) => ({ p1: 'Harmony 704', p2: 'Palm Grove' } as Record<string, string>)[id] || '';

  it('points the Design Head at the overdue sheet, the third round and a long-returned sheet', () => {
    const late = sheet('IN_REVIEW', { targetDate: iso(-1), name: 'Wardrobe' });
    const r3 = sheet('IN_REVIEW', { review: { attempts: 3 }, name: 'Kitchen A' });
    const stale = sheet('CHANGES_REQUESTED', { review: { decidedAt: NOW.getTime() - 5 * day, marksOpen: 2, marksTotal: 2 }, by: 'Kabir' });
    const rows = [late, r3, stale];
    const s = suggestions({ scope: rows, all: rows, viewer: head, projectName, inScope: () => true, now: NOW.getTime() });
    expect(s.map((x) => x.kind)).toEqual(['overdue', 'round', 'stale']);
    expect(s[0].title).toBe('Wardrobe is overdue 1 d');
    expect(s[2].title).toContain('back with Kabir for 5 days');
  });

  it('points a designer at notes to fix, a ready sheet due soon and work in other projects', () => {
    const fix = sheet('CHANGES_REQUESTED', { review: { marksOpen: 1, marksTotal: 2 }, name: 'Dining unit' });
    const ready = sheet('DRAFT', { targetDate: iso(1) });
    const other = sheet('DRAFT', { projectId: 'p2' });
    const rows = [fix, ready, other, sheet('CHANGES_REQUESTED', { by: 'Kabir', review: { marksOpen: 3 } })];
    const s = suggestions({ scope: rows.filter((d) => d.projectId === 'p1'), all: rows, viewer: riya, projectName, inScope: (d) => d.projectId === 'p1', now: NOW.getTime(), limit: 5 });
    expect(s.map((x) => x.kind)).toEqual(['openNotes', 'readyDue', 'elsewhere']);
    expect(s[0].title).toBe('Dining unit: 1 note to fix');
    expect(s[2].sub).toBe('Palm Grove');
  });

  it('skips a dismissed card and shows the next one in its place', () => {
    const rows = [sheet('IN_REVIEW', { targetDate: iso(-1) }), sheet('IN_REVIEW', { review: { attempts: 4 } }), sheet('APPROVED', { roomName: 'Foyer' })];
    const all = suggestions({ scope: rows, all: rows, viewer: head, projectName, inScope: () => true, now: NOW.getTime() });
    const less = suggestions({ scope: rows, all: rows, viewer: head, projectName, inScope: () => true, now: NOW.getTime(), isDismissed: (k) => k === all[0].key });
    expect(less.map((x) => x.kind)).toEqual(['round', 'present']);
  });

  it('a dismissed card comes back when its sheet moves', () => {
    const d = sheet('IN_REVIEW', { targetDate: iso(-1) });
    const key = suggestions({ scope: [d], all: [d], viewer: head, projectName, inScope: () => true, now: NOW.getTime() })[0].key;
    const moved = { ...d, review: { ...d.review!, rev: d.review!.rev + 2 } };
    const again = suggestions({ scope: [moved], all: [moved], viewer: head, projectName, inScope: () => true, now: NOW.getTime(), isDismissed: (k) => k === key });
    expect(again[0]?.kind).toBe('overdue');
  });
});

describe('spot the changes', () => {
  const page = (w: number, h: number, ink: [number, number, number, number][] = []) => {
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    ink.forEach(([x0, y0, x1, y1]) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
    });
    return { data, width: w, height: h };
  };

  it('finds nothing on identical pages', () => {
    expect(diffSheets(page(300, 200, [[10, 10, 60, 20]]), page(300, 200, [[10, 10, 60, 20]]))).toEqual({ kind: 'same' });
  });

  it('boxes each area that changed, as fractions of the page', () => {
    const before = page(300, 200, [[20, 20, 80, 30]]);
    const after = page(300, 200, [[20, 20, 80, 30], [200, 150, 260, 170]]);
    const out = diffSheets(before, after);
    expect(out.kind).toBe('boxes');
    if (out.kind !== 'boxes') return;
    expect(out.boxes).toHaveLength(1);
    const b = out.boxes[0];
    expect(b.x).toBeLessThanOrEqual(200 / 300);
    expect(b.x + b.w).toBeGreaterThanOrEqual(260 / 300);
    expect(b.y).toBeLessThanOrEqual(150 / 200);
    expect(b.y + b.h).toBeGreaterThanOrEqual(170 / 200);
  });

  it('keeps separate changes apart', () => {
    const out = diffSheets(page(400, 300), page(400, 300, [[20, 20, 60, 40], [300, 220, 360, 260]]));
    expect(out.kind === 'boxes' && out.boxes.length).toBe(2);
  });

  it('says so when the page size changed or most of it is different', () => {
    expect(diffSheets(page(300, 200), page(200, 300)).kind).toBe('size');
    expect(diffSheets(page(300, 200), page(300, 200, [[0, 0, 300, 200]])).kind).toBe('mostly');
  });
});
