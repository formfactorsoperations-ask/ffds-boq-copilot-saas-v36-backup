/*
  Standard templates are saved when someone edits them (hooks/useStudioTemplates).

  They were read from the database but never written back, so an edit in
  Templates & Bank, the Option setup included, was gone on the next reload.
  What is read is never written: a read that fell back to the defaults must
  not overwrite the studio's real templates.
*/
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStudioTemplates } from '../../hooks/useStudioTemplates';
import { INITIAL_TEMPLATES } from '../../lib/standardPackages';
import { withOptionSetup, cleanSetup, optionSetupOf } from '../../lib/optionSetup';

describe('saving the Standard templates', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('saves an edit a second after the last change, once', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useStudioTemplates(INITIAL_TEMPLATES, save));
    act(() => { result.current.editTemplates(prev => ({ ...prev, '5-BHK': { living: [] } })); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { result.current.editTemplates(prev => ({ ...prev, '5-BHK': { living: ['gen-005'] } })); });
    expect(save).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]['5-BHK']).toEqual({ living: ['gen-005'] });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves the Option setup the way the editor writes it', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useStudioTemplates(INITIAL_TEMPLATES, save));
    const setup = cleanSetup({ P: { material: 1.5 } });
    act(() => { result.current.editTemplates(prev => withOptionSetup(prev, setup)); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(optionSetupOf(save.mock.calls[0][0]).P.material).toBe(1.5);
  });

  it('never saves what was read', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useStudioTemplates(INITIAL_TEMPLATES, save));
    act(() => { result.current.setTemplates({ '2-BHK': { living: ['gen-005'] } }); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.templates).toEqual({ '2-BHK': { living: ['gen-005'] } });
  });

  it('drops an unsaved edit when the templates are read again (a tenant switch)', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useStudioTemplates(INITIAL_TEMPLATES, save));
    act(() => { result.current.editTemplates(prev => ({ ...prev, x: {} })); });
    act(() => { result.current.setTemplates(INITIAL_TEMPLATES); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(save).not.toHaveBeenCalled();
  });

  it('saves at once when the page is closed before the second is up', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useStudioTemplates(INITIAL_TEMPLATES, save));
    act(() => { result.current.editTemplates(prev => ({ ...prev, x: {} })); });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(save).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps going when a save fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useStudioTemplates(INITIAL_TEMPLATES, save));
    act(() => { result.current.editTemplates(prev => ({ ...prev, x: {} })); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.templates).toHaveProperty('x');
    err.mockRestore();
  });
});
