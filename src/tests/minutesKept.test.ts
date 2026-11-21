import { describe, it, expect, beforeEach } from 'vitest';
import { keptKey, readKept, writeKept, dropKept, dropKeptUnder, sweepKept, KEEP_FOR_MS } from '../../lib/minutesKept';

const NOW = new Date('2026-11-21T11:00:00+05:30').getTime();

describe('what was typed on the minutes, kept on the device', () => {
  beforeEach(() => window.localStorage.clear());

  it('names the person and the minutes in the key', () => {
    expect(keptKey('review', 'S1', 'Anish@FFDS.in', 'p1', 'm1', 1700)).toBe('review:s1:anish@ffds.in:p1:m1:1700');
    expect(keptKey('write', 's1', '', null, 'm1')).toBe('write:s1:-:-:m1');
  });

  it('reads back what was written, with when', () => {
    writeKept('k', { general: 'Check the laminate line' }, undefined, NOW);
    expect(readKept('k', undefined, NOW + 1000)).toEqual({ value: { general: 'Check the laminate line' }, at: NOW });
  });

  it('keeps nothing without a key', () => {
    writeKept(null, 'x');
    expect(window.localStorage.length).toBe(0);
    expect(readKept(null)).toBeNull();
  });

  it('forgets what is dropped', () => {
    writeKept('k', 'x');
    dropKept('k');
    expect(readKept('k')).toBeNull();
  });

  it('drops a key and the keys below it, and nothing else', () => {
    writeKept('write:a:m1', 1);
    writeKept('write:a:m1:rough', 'notes');
    writeKept('write:a:m1:new:t1', 'half a point');
    writeKept('write:a:m10', 'another meeting');
    dropKeptUnder('write:a:m1');
    expect(readKept('write:a:m1')).toBeNull();
    expect(readKept('write:a:m1:rough')).toBeNull();
    expect(readKept('write:a:m1:new:t1')).toBeNull();
    expect(readKept('write:a:m10')?.value).toBe('another meeting');
  });

  it('does not bring back what is over a month old, or what is not ours', () => {
    writeKept('old', 'x', undefined, NOW - KEEP_FOR_MS - 1);
    expect(readKept('old', undefined, NOW)).toBeNull();
    window.localStorage.setItem('ffds:minutes-kept:v1:broken', '{not json');
    expect(readKept('broken')).toBeNull();
  });

  it('sweeps old entries and leaves other storage alone', () => {
    writeKept('old', 'x', undefined, NOW - KEEP_FOR_MS - 1);
    writeKept('fresh', 'y', undefined, NOW);
    window.localStorage.setItem('something-else', 'z');
    sweepKept(undefined, NOW);
    expect(window.localStorage.getItem('ffds:minutes-kept:v1:old')).toBeNull();
    expect(readKept('fresh', undefined, NOW)?.value).toBe('y');
    expect(window.localStorage.getItem('something-else')).toBe('z');
  });
});
