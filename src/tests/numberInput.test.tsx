import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseNumberInput, formatNumberInput, splitUnitCost } from '../../lib/numberInput';
import NumberField from '../../components/NumberField';

afterEach(cleanup);

describe('parseNumberInput', () => {
  it('reads numbers the way they are typed', () => {
    expect(parseNumberInput('3200')).toEqual({ kind: 'number', value: 3200 });
    expect(parseNumberInput('3,200')).toEqual({ kind: 'number', value: 3200 });
    expect(parseNumberInput('₹ 3,200.50')).toEqual({ kind: 'number', value: 3200.5 });
    expect(parseNumberInput('12.5%')).toEqual({ kind: 'number', value: 12.5 });
    expect(parseNumberInput('.6')).toEqual({ kind: 'number', value: 0.6 });
    expect(parseNumberInput('-4')).toEqual({ kind: 'number', value: -4 });
    expect(parseNumberInput('0')).toEqual({ kind: 'number', value: 0 });
  });

  it('tells half-typed from wrong', () => {
    expect(parseNumberInput('')).toEqual({ kind: 'empty' });
    expect(parseNumberInput('  ')).toEqual({ kind: 'empty' });
    expect(parseNumberInput('12.')).toEqual({ kind: 'partial' });
    expect(parseNumberInput('-')).toEqual({ kind: 'partial' });
    expect(parseNumberInput('.')).toEqual({ kind: 'partial' });
    expect(parseNumberInput('12a')).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('1.2.3')).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('abc')).toEqual({ kind: 'invalid' });
  });
});

describe('formatNumberInput', () => {
  it('shows a figure without noise', () => {
    expect(formatNumberInput(3200)).toBe('3200');
    expect(formatNumberInput(41.83333)).toBe('41.83');
    expect(formatNumberInput(2.5)).toBe('2.5');
    expect(formatNumberInput(0.6, 4)).toBe('0.6');
    expect(formatNumberInput(undefined)).toBe('');
    expect(formatNumberInput(null)).toBe('');
    expect(formatNumberInput(NaN)).toBe('');
  });
});

describe('splitUnitCost', () => {
  it("keeps the line's material : labour split", () => {
    expect(splitUnitCost(3200, 2400, 800)).toEqual({ materials: 2400, labor: 800 });
    expect(splitUnitCost(4000, 2400, 800)).toEqual({ materials: 3000, labor: 1000 });
  });

  it('a cost below the labour is no longer raised back to it', () => {
    // The old rule: material = max(0, cost − labour), so 500 became 800.
    const s = splitUnitCost(500, 2400, 800);
    expect(s).toEqual({ materials: 375, labor: 125 });
    expect(s.materials + s.labor).toBe(500);
  });

  it('always adds back to exactly the cost typed', () => {
    for (const total of [3200.5, 1999.99, 7, 0.01, 12345.67]) {
      const s = splitUnitCost(total, 1260, 540);
      expect(Math.round((s.materials + s.labor) * 100) / 100).toBe(total);
    }
  });

  it('a line with no cost yet takes the fallback split, else all material', () => {
    expect(splitUnitCost(1000, 0, 0, 0.65)).toEqual({ materials: 650, labor: 350 });
    expect(splitUnitCost(1000, 0, 0)).toEqual({ materials: 1000, labor: 0 });
    expect(splitUnitCost(-5, 100, 100)).toEqual({ materials: 0, labor: 0 });
  });
});

/** Keys as a keyboard sends them: each one appends to what the box shows now. */
const typeKeys = (el: HTMLInputElement, keys: string) => {
  for (const k of keys) fireEvent.change(el, { target: { value: el.value + k } });
};

function Field(props: { initial?: number; live?: boolean; allowEmpty?: boolean; min?: number; onCommit?: (v: number | undefined) => void }) {
  const [v, setV] = useState<number | undefined>(props.initial);
  return (
    <>
      <NumberField aria-label="n" value={v} live={props.live} allowEmpty={props.allowEmpty} min={props.min}
        onCommit={n => { props.onCommit?.(n); setV(n); }} />
      <output data-testid="saved">{v === undefined ? 'none' : String(v)}</output>
    </>
  );
}

describe('NumberField', () => {
  const box = () => screen.getByLabelText('n') as HTMLInputElement;
  const saved = () => screen.getByTestId('saved').textContent;

  it('an emptied box stays empty while typing — no "0" to type after', () => {
    render(<Field initial={34} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '' } });
    expect(box().value).toBe('');
    typeKeys(box(), '2.5');
    expect(box().value).toBe('2.5');
    expect(saved()).toBe('2.5');
  });

  it('keeps a half-typed decimal', () => {
    render(<Field initial={10} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '12.' } });
    expect(box().value).toBe('12.');
    typeKeys(box(), '5');
    expect(saved()).toBe('12.5');
  });

  it('"12." left in the box saves as 12', () => {
    render(<Field initial={10} live={false} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '12.' } });
    fireEvent.blur(box());
    expect(saved()).toBe('12');
    expect(box().value).toBe('12');
  });

  it('live=false saves only when the box is left', () => {
    const onCommit = vi.fn();
    render(<Field initial={3200} live={false} onCommit={onCommit} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '' } });
    typeKeys(box(), '4000');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.blur(box());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(4000);
  });

  it('an emptied box left goes back to its figure', () => {
    render(<Field initial={34} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.blur(box());
    expect(box().value).toBe('34');
    expect(saved()).toBe('34');
  });

  it('allowEmpty lets a box be cleared', () => {
    render(<Field initial={7} allowEmpty />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.blur(box());
    expect(saved()).toBe('none');
  });

  it('Escape takes back what a live box saved while typing', () => {
    render(<Field initial={34} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '99' } });
    expect(saved()).toBe('99');
    fireEvent.keyDown(box(), { key: 'Escape' });
    fireEvent.blur(box());
    expect(saved()).toBe('34');
    expect(box().value).toBe('34');
  });

  it('reads commas and the rupee sign', () => {
    render(<Field initial={0} live={false} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '₹3,200' } });
    fireEvent.blur(box());
    expect(saved()).toBe('3200');
  });

  it('refuses what it cannot read and keeps the old figure', () => {
    render(<Field initial={34} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '3x' } });
    fireEvent.blur(box());
    expect(saved()).toBe('34');
  });

  it('holds to its minimum', () => {
    render(<Field initial={5} min={0} live={false} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '-3' } });
    fireEvent.blur(box());
    expect(saved()).toBe('0');
  });

  it('is a text box with a decimal keypad, so scrolling never changes it', () => {
    render(<Field initial={1} />);
    expect(box().type).toBe('text');
    expect(box().inputMode).toBe('decimal');
  });
});
