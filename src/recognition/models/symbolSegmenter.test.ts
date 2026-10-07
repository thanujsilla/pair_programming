import { describe, expect, it } from 'vitest';
import { dot, line } from '../../ink/testUtils';
import type { Stroke } from '../../ink/types';
import { segmentLine } from './symbolSegmenter';

const kinds = (s: Stroke[]) => segmentLine(s).map((i) => i.kind);
const point = (id: string, x: number, y: number): Stroke => ({ id, points: [{ x, y, t: 0, p: 0.5 }], width: 3 });

// a line of writing about 60 px tall, baseline at y = 100
const one = (id: string, x: number) => line(id, x, 40, x + 6, 100);
const plus = (x: number) => [line(`ph${x}`, x, 78, x + 36, 78), line(`pv${x}`, x + 18, 60, x + 18, 96)];
const equals = (x: number) => [line(`e1${x}`, x, 70, x + 40, 70), line(`e2${x}`, x + 2, 86, x + 42, 86)];

describe('segmentLine', () => {
  it('returns nothing for no strokes', () => {
    expect(segmentLine([])).toEqual([]);
  });

  it('joins the bars of an equals sign even when they are staggered sideways', () => {
    // overlap is only 24 of 50 px (48%), as in real handwriting
    expect(kinds([line('b1', 596, 90, 648, 91), line('b2', 624, 112, 674, 114)])).toEqual(['symbol']);
    expect(kinds([line('c1', 20, 90, 70, 91), line('c2', 62, 110, 112, 111)])).toEqual(['symbol', 'symbol']); // 8 px overlap: two separate bars
  });

  it('keeps separate digits separate, left to right', () => {
    const items = segmentLine([one('b', 100), one('a', 20), one('c', 180)]);
    expect(items.map((i) => i.kind)).toEqual(['symbol', 'symbol', 'symbol']);
    expect(items.map((i) => i.bounds.left)).toEqual([20, 100, 180]);
  });

  it('joins the two strokes of a plus, an equals sign and a cross', () => {
    expect(kinds(plus(20))).toEqual(['symbol']);
    expect(kinds(equals(20))).toEqual(['symbol']);
    expect(kinds([line('x1', 20, 60, 60, 100), line('x2', 60, 60, 20, 100)])).toEqual(['symbol']);
  });

  it('joins a hair-thin vertical stroke to the bar it crosses (not only an exactly vertical one)', () => {
    const wobbly: Stroke = { id: 'v', width: 3, points: [{ x: 38.0, y: 60, t: 0, p: 0.5 }, { x: 38.4, y: 78, t: 1, p: 0.5 }, { x: 38.3, y: 96, t: 2, p: 0.5 }] };
    expect(kinds([line('h', 20, 78, 56, 78), wobbly])).toEqual(['symbol']);
  });

  it('does not depend on drawing order', () => {
    const strokes = [one('a', 0), ...plus(60), one('b', 140), ...equals(200)];
    const forward = segmentLine(strokes).map((i) => (i.kind === 'symbol' ? i.strokes.length : 0));
    const backward = segmentLine([...strokes].reverse()).map((i) => (i.kind === 'symbol' ? i.strokes.length : 0));
    expect(forward).toEqual([1, 2, 1, 2]);
    expect(backward).toEqual(forward);
  });

  it('reads a small low mark between digits as a decimal point', () => {
    expect(kinds([one('a', 20), point('d', 60, 97), one('b', 80)])).toEqual(['symbol', 'dot', 'symbol']);
    expect(kinds([one('a', 20), dot('d', 60, 97, 5), one('b', 80)])).toEqual(['symbol', 'dot', 'symbol']);
  });

  it('puts the dots of a division sign into the bar', () => {
    const bar = line('bar', 20, 80, 70, 80);
    const items = segmentLine([one('a', 0), bar, point('up', 45, 62), point('down', 45, 98), one('b', 100)]);
    expect(items.map((i) => i.kind)).toEqual(['symbol', 'symbol', 'symbol']);
    expect(items[1].kind === 'symbol' && items[1].strokes.length).toBe(3);
  });

  it('ignores a speck floating high above the line', () => {
    expect(kinds([one('a', 20), point('speck', 60, 30), one('b', 80)])).toEqual(['symbol', 'symbol']);
  });

  it('does not glue neighbours that only touch at the edge', () => {
    expect(kinds([line('s1', 20, 40, 60, 100), line('s2', 55, 40, 95, 100)])).toEqual(['symbol', 'symbol']);
  });

  it('ignores a lone speck with no writing, and empty strokes', () => {
    expect(segmentLine([point('d', 5, 5)]).filter((i) => i.kind === 'dot')).toEqual([]);
    expect(() => segmentLine([{ id: 'e', points: [], width: 2 }, one('a', 0)])).not.toThrow();
  });
});