import { describe, expect, it } from 'vitest';
import { dot, line } from '../../ink/testUtils';
import type { Stroke } from '../../ink/types';
import { MAX_BAR, normalizeDivision } from './divisionNormalize';
import { pathBounds } from './symbolSegmenter';

const digit = (id: string, x: number) => line(id, x, 40, x + 6, 140); // 100 px tall
const width = (s: Stroke) => {
  const b = pathBounds([s]);
  return b.right - b.left;
};
/** a division sign: bar from x to x+len at y=90, dots 40 px above and below */
const divide = (x: number, len: number) => [line('bar', x, 90, x + len, 90), dot('up', x + len / 2, 50), dot('down', x + len / 2, 130)];

describe('normalizeDivision', () => {
  it('shortens a long bar and brings the dots closer', () => {
    const input = [digit('a', 20), ...divide(100, 340), digit('b', 520)];
    const out = normalizeDivision(input);
    const bar = out.find((s) => s.id === 'bar')!;
    expect(width(bar)).toBeCloseTo(MAX_BAR * 100, 0);
    const up = pathBounds([out.find((s) => s.id === 'up')!]);
    const down = pathBounds([out.find((s) => s.id === 'down')!]);
    expect(down.top - up.top).toBeLessThan(80); // was 80 apart
    expect(up.top).toBeLessThan(90); // still above the bar
    expect(down.top).toBeGreaterThan(90); // still below it
  });

  it('keeps the middle of the sign where it was', () => {
    const out = normalizeDivision([digit('a', 20), ...divide(100, 340)]);
    const b = pathBounds([out.find((s) => s.id === 'bar')!]);
    expect((b.left + b.right) / 2).toBeCloseTo(270, 0);
  });

  it('does not touch the other strokes', () => {
    const input = [digit('a', 20), ...divide(100, 340), digit('b', 520)];
    const out = normalizeDivision(input);
    expect(out.find((s) => s.id === 'a')).toBe(input[0]);
    expect(out.find((s) => s.id === 'b')).toBe(input[4]);
  });

  it('leaves a compact division sign alone', () => {
    const input = [digit('a', 20), ...divide(100, 50), digit('b', 200)];
    expect(normalizeDivision(input)).toBe(input);
  });

  it('leaves a plain minus alone, however long', () => {
    const input = [digit('a', 20), line('m', 100, 90, 440, 90), digit('b', 520)];
    expect(normalizeDivision(input)).toBe(input);
  });

  it('leaves a division sign with only one dot alone', () => {
    const input = [digit('a', 20), line('bar', 100, 90, 440, 90), dot('up', 270, 50), digit('b', 520)];
    expect(normalizeDivision(input)).toBe(input);
  });

  it('does nothing when there is nothing to compare the bar with', () => {
    const input = divide(100, 340);
    expect(normalizeDivision(input)).toBe(input);
    expect(normalizeDivision([])).toEqual([]);
  });

  it('does not change its input', () => {
    const input = [digit('a', 20), ...divide(100, 340)];
    const before = JSON.stringify(input);
    normalizeDivision(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
