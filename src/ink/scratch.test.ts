import { describe, expect, it } from 'vitest';
import { isScribble, scratchTargets } from './scratch';
import { line } from './testUtils';
import type { Point } from './types';

const pts = (xy: [number, number][]): Point[] => xy.map(([x, y], i) => ({ x, y, t: i * 8, p: 0.5 }));

/** zig-zag across a box, `passes` times, 8 samples per pass */
function zigzag(x0: number, y0: number, w: number, h: number, passes: number): Point[] {
  const way: [number, number][] = [];
  for (let k = 0; k <= passes; k++) way.push([k % 2 === 0 ? x0 : x0 + w, y0 + (h * k) / passes]);
  const out: [number, number][] = [];
  for (let k = 1; k < way.length; k++) {
    const [ax, ay] = way[k - 1]!;
    const [bx, by] = way[k]!;
    for (let i = 0; i < 8; i++) out.push([ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8]);
  }
  return pts(out);
}

describe('scratch-to-erase', () => {
  it('recognises a zig-zag scribble', () => {
    expect(isScribble(zigzag(100, 100, 80, 40, 8))).toBe(true);
  });

  it('does not mistake handwriting for a scribble', () => {
    // an "S"/"8"-like curve and a plain stroke
    const s = pts(Array.from({ length: 40 }, (_, i) => [100 + 25 * Math.sin(i / 4), 100 + i * 2] as [number, number]));
    expect(isScribble(s)).toBe(false);
    expect(isScribble(pts(Array.from({ length: 30 }, (_, i) => [100 + i * 3, 100] as [number, number])))).toBe(false);
  });

  it('ignores tiny movements', () => {
    expect(isScribble(zigzag(100, 100, 6, 4, 8))).toBe(false);
  });

  it('picks the strokes under the scribble and leaves the others', () => {
    const under = line('under', 110, 120, 170, 120);
    const away = line('away', 400, 120, 460, 120);
    expect([...scratchTargets(zigzag(100, 100, 90, 40, 8), [under, away])]).toEqual(['under']);
  });

  it('keeps a scribble that covers nothing as ordinary ink', () => {
    expect(scratchTargets(zigzag(100, 100, 90, 40, 8), [line('far', 400, 120, 460, 120)]).size).toBe(0);
  });
});