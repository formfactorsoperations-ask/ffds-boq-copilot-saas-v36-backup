import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, renderHook, waitFor } from '@testing-library/react';

/*
  Design Desk 2.0, the two AI features on screen (components/designDesk2/ai.tsx).
  Gemini is stubbed: these check when it is asked, what is shown of its
  answer, and that the desk carries on when it cannot be reached.
*/

const h = vi.hoisted(() => ({ diff: null as any, name: null as any, kept: {} as Record<string, any>, notes: null as any, find: null as any, memos: [] as any[] }));
vi.mock('../../components/drawingReview/useSheetChanges', () => ({ useSheetChanges: () => h.diff }));
vi.mock('../../services/deskAiService', () => ({
  nameChanges: (...a: any[]) => h.name(...a),
  keptChangeNames: (k: string) => h.kept[k] || null,
  keepChangeNames: (k: string, v: any) => { h.kept[k] = v; },
  loadPastNotes: (...a: any[]) => h.notes(...a),
  findRepeats: (...a: any[]) => h.find(...a),
  keptRepeats: () => h.memos,
  keepRepeats: (_o: string, m: any) => { h.memos = [...h.memos.filter((x) => x.email !== m.email), m]; },
  freshMemo: (_o: string, email: string) => h.memos.find((m) => m.email === email && Date.now() - m.at < 86_400_000) || null,
}));

import { ChangeAi, ChangesNamed, RepeatCard, VerdictHint, useRepeats, type AiPage } from '../../components/designDesk2/ai';

const boxes = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, { x: 0.6, y: 0.5, w: 0.1, h: 0.1 }];
const note = { id: 'm7', versionId: 'v1', n: 4, page: 0, shape: { t: 'pin', x: 0.5, y: 0.5 }, text: 'Tall unit 600 deep' } as any;
const answer = { names: { 1: 'Tall unit moved left', 2: 'Dimension changed to 600' }, notes: { m7: { verdict: 'fixed', why: 'Depth now reads 600' } } };
const repeat = { title: 'Skirting height not marked', drawings: 3, notes: 4, examples: ['Master wardrobe', 'Kitchen plan', 'Living TV wall'], suggestion: 'Mark the skirting height.', latestAt: 1 };

beforeEach(() => {
  cleanup();
  h.diff = { busy: false, diff: { kind: 'boxes', boxes } };
  h.name = vi.fn(async () => answer);
  h.kept = {};
  h.notes = vi.fn(async () => [{ id: 'n1' }]);
  h.find = vi.fn(async () => [repeat]);
  h.memos = [];
});

describe('changes found for you', () => {
  const props = { pdfPath: 'now.pdf', prevPath: 'before.pdf', page: 0, pairKey: 'v1>v2', notes: [note], attempt: 0 };

  it('asks once for a pair of revisions, with the outlined areas and the last revision\'s notes', async () => {
    const onResult = vi.fn();
    const { unmount } = render(<ChangeAi {...props} onResult={onResult} />);
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(0, { busy: false, count: 2, result: answer }));
    expect(h.name).toHaveBeenCalledTimes(1);
    expect(h.name).toHaveBeenCalledWith({ currentPath: 'now.pdf', previousPath: 'before.pdf', page: 0, boxes, notes: [note] });
    unmount();
    /* Opening the same drawing again uses what was found; nothing is asked. */
    const again = vi.fn();
    render(<ChangeAi {...props} onResult={again} />);
    await waitFor(() => expect(again).toHaveBeenLastCalledWith(0, { busy: false, count: 2, result: answer }));
    expect(h.name).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when the page did not change and had no notes', async () => {
    h.diff = { busy: false, diff: { kind: 'same' } };
    const onResult = vi.fn();
    render(<ChangeAi {...props} notes={[]} onResult={onResult} />);
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(0, { busy: false, count: 0 }));
    expect(h.name).not.toHaveBeenCalled();
  });

  it('says so when the AI cannot be reached, and asks again on Try again', async () => {
    h.name = vi.fn(async () => { throw new Error('Gemini call failed'); });
    const onResult = vi.fn();
    const { rerender } = render(<ChangeAi {...props} onResult={onResult} />);
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(0, { busy: false, failed: true, count: 2 }));
    h.name = vi.fn(async () => answer);
    rerender(<ChangeAi {...props} attempt={1} onResult={onResult} />);
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(0, { busy: false, count: 2, result: answer }));
  });

  it('lists the named changes by their numbers, marked as the AI\'s', () => {
    const byPage: Record<number, AiPage> = { 0: { busy: false, count: 2, result: answer as any } };
    render(<ChangesNamed byPage={byPage} prevNo={2} pages={1} onRetry={vi.fn()} />);
    expect(screen.getByText('What changed since v2')).toBeTruthy();
    expect(screen.getByText('Named by AI')).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['1Tall unit moved left', '2Dimension changed to 600']);
    expect(screen.getByText(/The numbers match the outlines on the drawing\. Check each one yourself\./)).toBeTruthy();
  });

  it('shows it is looking, shows a failure with a way to retry, and shows nothing when nothing changed', () => {
    const onRetry = vi.fn();
    const { rerender, container } = render(<ChangesNamed byPage={{ 0: { busy: true, count: 2 } }} prevNo={2} pages={1} onRetry={onRetry} />);
    expect(screen.getByText('Looking at what changed since v2')).toBeTruthy();
    rerender(<ChangesNamed byPage={{ 0: { busy: false, failed: true, count: 2 } }} prevNo={2} pages={1} onRetry={onRetry} />);
    expect(screen.getByText(/the AI could not name them just now/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<ChangesNamed byPage={{ 0: { busy: false, count: 0 } }} prevNo={2} pages={1} onRetry={onRetry} />);
    expect(container.textContent).toBe('');
  });

  it('hints beside a note only when the AI could tell', () => {
    const { rerender, container } = render(<VerdictHint hint={{ verdict: 'fixed', why: 'Depth now reads 600' }} />);
    expect(screen.getByText('AI: looks fixed: Depth now reads 600')).toBeTruthy();
    rerender(<VerdictHint hint={{ verdict: 'same', why: '' }} />);
    expect(screen.getByText('AI: looks the same')).toBeTruthy();
    rerender(<VerdictHint hint={{ verdict: 'unsure', why: 'Too small to read' }} />);
    expect(container.textContent).toBe('');
    rerender(<VerdictHint />);
    expect(container.textContent).toBe('');
  });
});

describe('repeat mistakes', () => {
  const designer = { email: 'Rahul@Studio.in', name: 'Rahul Verma' };
  const row = (id: string, daysAgo = 2) => ({ id, projectId: 'p1', name: `Drawing ${id}`, review: { designer: { email: 'rahul@studio.in' }, marksTotal: 2, updatedAt: Date.now() - daysAgo * 86_400_000 } }) as any;
  const rows = [row('a'), row('b'), row('c'), row('now', 0)];

  it("reads the designer's other recent drawings once a day and remembers what it found", async () => {
    const { result, unmount } = renderHook(() => useRepeats('s', true, designer, rows, { projectId: 'p1', id: 'now' }));
    await waitFor(() => expect(result.current).toEqual([repeat]));
    expect(h.notes).toHaveBeenCalledWith('s', [rows[0], rows[1], rows[2]]);
    expect(h.memos[0]).toMatchObject({ email: 'rahul@studio.in', name: 'Rahul Verma', repeats: [repeat] });
    unmount();
    /* The next drawing from the same designer uses what is remembered. */
    const next = renderHook(() => useRepeats('s', true, designer, rows, { projectId: 'p1', id: 'a' }));
    await waitFor(() => expect(next.result.current).toEqual([repeat]));
    expect(h.find).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when it is off, or the designer has fewer than three other drawings with notes', async () => {
    renderHook(() => useRepeats('s', false, designer, rows, { projectId: 'p1', id: 'now' }));
    renderHook(() => useRepeats('s', true, designer, rows.slice(0, 2), { projectId: 'p1', id: 'now' }));
    renderHook(() => useRepeats('s', true, null, rows, { projectId: 'p1', id: 'now' }));
    await act(async () => { await Promise.resolve(); });
    expect(h.notes).not.toHaveBeenCalled();
    expect(h.find).not.toHaveBeenCalled();
  });

  it('stays quiet when the AI cannot be reached', async () => {
    h.find = vi.fn(async () => { throw new Error('down'); });
    const { result } = renderHook(() => useRepeats('s', true, designer, rows, { projectId: 'p1', id: 'now' }));
    await waitFor(() => expect(h.find).toHaveBeenCalled());
    expect(result.current).toEqual([]);
    expect(h.memos).toEqual([]);
  });

  it('shows the mistake beside the drawing, with a note ready to add', () => {
    const onUse = vi.fn();
    const { rerender, container } = render(<RepeatCard repeats={[repeat]} designerName="Rahul Verma" onUse={onUse} />);
    expect(screen.getByText('Keeps coming back from Rahul')).toBeTruthy();
    expect(screen.getByText('Found by AI')).toBeTruthy();
    expect(screen.getByText('Skirting height not marked')).toBeTruthy();
    expect(screen.getByText('Rahul has had this note on 3 drawings in the last 60 days (Master wardrobe, Kitchen plan, Living TV wall). Check it on this one.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add it as a note' }));
    expect(onUse).toHaveBeenCalledWith('Mark the skirting height.');
    /* Someone who cannot add notes sees the alert without the button; with nothing found there is no card. */
    rerender(<RepeatCard repeats={[repeat]} designerName="Rahul Verma" />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<RepeatCard repeats={[]} designerName="Rahul Verma" />);
    expect(container.textContent).toBe('');
  });
});
