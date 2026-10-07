import { describe, expect, it } from 'vitest';
import { findFractions } from './fractions';
import { groupLines } from './lineGrouper';
import { line } from './testUtils';

// a stacked 1/2 with the "=" to its right (proportions of a real drawing)
const fraction = (tag: string, y: number) => [
  line(`${tag}n`, 100, y, 100, y + 100), // numerator "1"
  line(`${tag}bar`, 50, y + 125, 200, y + 125), // bar
  line(`${tag}d`, 80, y + 150, 130, y + 250), // denominator (any tall stroke)
];
const equals = (tag: string, y: number) => [line(`${tag}e1`, 300, y + 90, 420, y + 90), line(`${tag}e2`, 300, y + 140, 420, y + 140)];

describe('findFractions', () => {
  it('finds a bar with ink above and below', () => {
    const f = findFractions(fraction('a', 0));
    expect(f).toHaveLength(1);
    expect(f[0]!.map((s) => s.id).sort()).toEqual(['abar', 'ad', 'an']);
  });

  it('does not take a minus, the bars of "=", or a "÷" for a fraction', () => {
    expect(findFractions([line('a', 0, 0, 0, 40), line('m', 20, 20, 60, 20), line('b', 80, 0, 80, 40)])).toEqual([]);
    expect(findFractions([line('a', 0, 0, 0, 100), line('e1', 30, 40, 100, 40), line('e2', 30, 60, 100, 60)])).toEqual([]);
    const divide = [line('bar', 0, 50, 100, 50), line('up', 50, 30, 52, 30), line('down', 50, 70, 52, 70), line('x', 200, 0, 200, 100)];
    expect(findFractions(divide)).toEqual([]);
  });

  it('does not take a "+" (its vertical stroke crosses the bar)', () => {
    expect(findFractions([line('a', 0, 0, 0, 100), line('h', 30, 50, 90, 50), line('v', 60, 20, 60, 80), line('b', 130, 0, 130, 100)])).toEqual([]);
  });
});

describe('groupLines: stacked fractions', () => {
  it('keeps numerator, bar, denominator and "=" on one line', () => {
    const lines = groupLines([...fraction('a', 100), ...equals('a', 100)]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.strokes).toHaveLength(5);
  });

  it('keeps two fractions written one below the other as two lines', () => {
    const lines = groupLines([...fraction('a', 100), ...equals('a', 100), ...fraction('b', 500), ...equals('b', 500)]);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.strokes.length === 5)).toBe(true);
  });
});
