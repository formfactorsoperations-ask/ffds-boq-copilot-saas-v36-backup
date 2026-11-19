import { describe, it, expect, afterEach } from 'vitest';
import { figuresHidden, setFiguresHidden, toggleFiguresHidden, subscribeFiguresHidden, isHideFiguresShortcut } from '../../lib/figuresPrivacy';
import { seesStudioFinance, seesMargins, holdsFinanceRole, MARGIN_SCREENS, FINANCE_TABS } from '../../lib/roleAccess';

afterEach(() => setFiguresHidden(false));

describe('hide figures for a shared screen', () => {
  it('hides margins from every role, and nothing else', () => {
    expect(seesMargins('Owner')).toBe(true);
    setFiguresHidden(true);
    expect(seesMargins('Owner')).toBe(false);
    expect(seesMargins(['Admin', 'Designer'])).toBe(false);
    // Values, collections and the money screens stay: hiding figures is not a role change.
    expect(seesStudioFinance('Owner')).toBe(true);
    expect(holdsFinanceRole('Owner')).toBe(true);
    expect(seesStudioFinance('Designer')).toBe(false);
    expect(seesMargins('Designer')).toBe(false);
  });

  it('covers only the studio screens made of margins, never a project screen', () => {
    expect([...MARGIN_SCREENS].sort()).toEqual(['admin-templates-bank', 'bank', 'reports']);
    for (const tab of ['ops', 'analytics', 'payment-calc', 'project-reports']) {
      expect(FINANCE_TABS.has(tab)).toBe(true);
      expect(MARGIN_SCREENS.has(tab)).toBe(false);
    }
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
