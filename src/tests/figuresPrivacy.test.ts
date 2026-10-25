import { describe, it, expect, afterEach } from 'vitest';
import { figuresHidden, setFiguresHidden, toggleFiguresHidden, subscribeFiguresHidden, isHideFiguresShortcut } from '../../lib/figuresPrivacy';
import { seesStudioFinance, holdsFinanceRole } from '../../lib/roleAccess';

afterEach(() => setFiguresHidden(false));

describe('hide figures for a shared screen', () => {
  it('stops every role seeing the studio money, without taking away what they may do', () => {
    expect(seesStudioFinance('Owner')).toBe(true);
    setFiguresHidden(true);
    expect(seesStudioFinance('Owner')).toBe(false);
    expect(seesStudioFinance(['Admin', 'Designer'])).toBe(false);
    expect(holdsFinanceRole('Owner')).toBe(true);
    expect(seesStudioFinance('Designer')).toBe(false);
  });

  it('is remembered in this browser and tells the app when it changes', () => {
    let calls = 0;
    const off = subscribeFiguresHidden(() => { calls += 1; });
    toggleFiguresHidden();
    expect(figuresHidden()).toBe(true);
    expect(window.localStorage.getItem('studiodesk.hideFigures')).toBe('1');
    setFiguresHidden(true); // no change, no call
    toggleFiguresHidden();
    off();
    expect(calls).toBe(2);
  });

  it('flips on Alt+Shift+H only', () => {
    const k = (o: Partial<KeyboardEvent>) => ({ altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, code: 'KeyH', key: 'H', ...o }) as KeyboardEvent;
    expect(isHideFiguresShortcut(k({ altKey: true, shiftKey: true }))).toBe(true);
    expect(isHideFiguresShortcut(k({ shiftKey: true }))).toBe(false);
    expect(isHideFiguresShortcut(k({ altKey: true, shiftKey: true, ctrlKey: true }))).toBe(false);
  });
});
