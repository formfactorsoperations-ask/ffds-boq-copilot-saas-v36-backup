import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { cleanScale, lengthLabel, measureLabel, paperMm, scaleFromKnown } from '../../lib/measure';
import { MeasureBar, MeasureLayer, type Measure } from '../../components/designDesk2/measure';

/*
  Design Desk 2.0, Phase 3A: Measure on the drawing (lib/measure.ts and
  components/designDesk2/measure.tsx).
*/

/* An A3 sheet lying landscape: 420 x 297 mm, in points. */
const A3 = { w: (420 / 25.4) * 72, h: (297 / 25.4) * 72 };

describe('measuring a line', () => {
  it('turns a line on the page into millimetres on paper, across, down and at an angle', () => {
    expect(paperMm({ x: 0, y: 0.5, x2: 1, y2: 0.5 }, A3.w, A3.h)).toBeCloseTo(420, 5);
    expect(paperMm({ x: 0.2, y: 0, x2: 0.2, y2: 1 }, A3.w, A3.h)).toBeCloseTo(297, 5);
    expect(paperMm({ x: 0, y: 0, x2: 0.5, y2: 0.5 }, A3.w, A3.h)).toBeCloseTo(Math.hypot(210, 148.5), 5);
    expect(paperMm({ x: 0, y: 0, x2: 1, y2: 1 }, 0, 0)).toBe(0);
  });

  it('reads a scale the way a person types it', () => {
    expect(cleanScale('20')).toBe(20);
    expect(cleanScale('1:50')).toBe(50);
    expect(cleanScale(' 1 : 25 ')).toBe(25);
    expect(cleanScale('7.5')).toBe(7.5);
    expect(cleanScale('')).toBeNull();
    expect(cleanScale('0')).toBeNull();
    expect(cleanScale('abc')).toBeNull();
    expect(cleanScale(99999)).toBeNull();
  });

  it('works the scale out from a dimension written on the drawing, settling on a usual scale when close', () => {
    /* A 2400 mm wall drawn 119 mm long on paper is 1 : 20, give or take the hand. */
    expect(scaleFromKnown(119, 2400)).toBe(20);
    expect(scaleFromKnown(48.5, 2400)).toBe(50);
    /* Nothing usual near it: the scale is kept as worked out. */
    expect(scaleFromKnown(100, 3367)).toBe(33.67);
    expect(scaleFromKnown(0.2, 2400)).toBeNull();
    expect(scaleFromKnown(100, 0)).toBeNull();
  });

  it('says a length in millimetres, and in metres once it is a metre or more', () => {
    expect(lengthLabel(845.4)).toBe('845 mm');
    expect(lengthLabel(1240)).toBe('1,240 mm (1.24 m)');
    expect(lengthLabel(125000)).toBe('1,25,000 mm (125.00 m)');
    expect(measureLabel(62, 20)).toBe('1,240 mm (1.24 m)');
    expect(measureLabel(62.4, null)).toBe('62 mm on paper');
  });
});

describe('Measure on screen', () => {
  const line: Measure = { id: 1, page: 0, x: 0.2, y: 0.3, x2: 0.7, y2: 0.3, paper: 62 };
  beforeEach(cleanup);

  it('labels each line with its real length, or its length on paper until the scale is set', () => {
    const { rerender } = render(<MeasureLayer list={[line]} turn={0} scale={20} />);
    expect(screen.getByText('1,240 mm (1.24 m)')).toBeTruthy();
    rerender(<MeasureLayer list={[line]} turn={0} scale={null} />);
    expect(screen.getByText('62 mm on paper')).toBeTruthy();
    /* Nothing is drawn on a page with no lines. */
    rerender(<MeasureLayer list={[]} turn={0} scale={20} />);
    expect(screen.queryByLabelText('Measurements')).toBeNull();
  });

  it('sets the scale by typing it, by a usual scale, or from the last line', () => {
    const onScale = vi.fn();
    const { rerender } = render(<MeasureBar scale={null} last={null} count={0} onScale={onScale} onClear={vi.fn()} />);
    expect(screen.getByText('Type the scale from the title block, or drag along a dimension you know.')).toBeTruthy();
    const box = screen.getByLabelText("The drawing's scale, 1 to");
    fireEvent.change(box, { target: { value: '25' } });
    fireEvent.blur(box);
    expect(onScale).toHaveBeenLastCalledWith(25);
    fireEvent.click(screen.getByRole('button', { name: '1:50' }));
    expect(onScale).toHaveBeenLastCalledWith(50);
    /* With a line drawn along a 1240 mm dimension. */
    rerender(<MeasureBar scale={null} last={line} count={1} onScale={onScale} onClear={vi.fn()} />);
    expect(screen.getByText('62 mm on paper')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set the scale from this line' }));
    fireEvent.change(screen.getByLabelText('The real length of the last line, in millimetres'), { target: { value: '1240' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the scale' }));
    expect(onScale).toHaveBeenLastCalledWith(20);
  });

  it('reads the last line at the scale, and clears the lines', () => {
    const onClear = vi.fn();
    render(<MeasureBar scale={20} last={line} count={2} onScale={vi.fn()} onClear={onClear} />);
    expect(screen.getByRole('status').textContent).toBe('1,240 mm (1.24 m)');
    expect(screen.getByRole('button', { name: '1:20' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Clear the measurements' }));
    expect(onClear).toHaveBeenCalled();
  });
});
