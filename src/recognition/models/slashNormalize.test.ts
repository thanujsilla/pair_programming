import { describe, expect, it } from 'vitest';
import { line } from '../../ink/testUtils';
import type { Stroke } from '../../ink/types';
import { separateSlashes } from './slashNormalize';
import { pathBounds } from './symbolSegmenter';

const box = (ids: string[], strokes: readonly { id: string }[]) =>
  pathBounds(strokes.filter((s) => ids.includes(s.id)) as never);

/** A closed loop standing in for a "0": one stroke from (465,390) round to (560,480). */
const loop = (id: string): Stroke => ({
  id,
  width: 2,
  points: [[465, 390], [560, 390], [560, 480], [465, 480], [465, 390]].map(([x, y], t) => ({ x: x!, y: y!, t, p: 0.5 })),
});

describe('separateSlashes', () => {
  // "1 / 0" drawn so that the slash leans over both neighbours
  const drawn = () => [
    line('one', 463, 333, 455, 400),
    line('slash', 418, 453, 527, 336),
    loop('zero'),
  ];

  it('replaces the slash by a small ÷ and moves the neighbours apart', () => {
    const out = separateSlashes(drawn());
    expect(out.find((s) => s.id === 'slash')).toBeUndefined();
    expect(out.map((s) => s.id)).toEqual(expect.arrayContaining(['slash~bar', 'slash~up', 'slash~down']));
    const sign = box(['slash~bar', 'slash~up', 'slash~down'], out);
    expect(box(['one'], out).right).toBeLessThan(sign.left);
    expect(box(['zero'], out).left).toBeGreaterThan(sign.right);
  });

  it('leaves the two diagonals of an × alone', () => {
    const cross = [line('l', 100, 100, 100, 180), line('a', 130, 100, 190, 180), line('b', 130, 180, 190, 100), line('r', 220, 100, 220, 180)];
    expect(separateSlashes(cross)).toEqual(cross);
  });

  it('leaves a 7 alone (flat bar on its top)', () => {
    const seven = [line('x', 60, 100, 60, 180), line('bar', 100, 100, 160, 100), line('stem', 160, 100, 110, 180), line('y', 200, 100, 200, 180)];
    expect(separateSlashes(seven)).toEqual(seven);
  });

  it('leaves a slash that is already clear of its neighbours (the model reads it) and ordinary lines', () => {
    const clear = [line('a', 100, 100, 100, 180), line('s', 160, 190, 200, 100), line('b', 280, 100, 280, 180)];
    expect(separateSlashes(clear).map((s) => s.id)).toContain('s');
    const plain = [line('a', 100, 100, 100, 180), line('b', 160, 100, 160, 180)];
    expect(separateSlashes(plain)).toEqual(plain);
  });
});
