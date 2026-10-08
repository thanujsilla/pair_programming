import { describe, expect, it } from 'vitest';
import { fitAlong } from './inkEngine';

const view = { scale: 1, x: 0, y: 0 };

describe('fitAlong', () => {
  it('leaves an answer that fits alone', () => {
    expect(fitAlong({ x: 100, y: 100 }, 0, 300, view, 1000, 800)).toBe(1);
  });

  it('shrinks an answer that would run off the right edge, down to half', () => {
    expect(fitAlong({ x: 800, y: 100 }, 0, 400, view, 1000, 800)).toBeCloseTo(0.5, 6);
    expect(fitAlong({ x: 800, y: 100 }, 0, 250, view, 1000, 800)).toBeCloseTo(0.8, 6);
  });

  it('works in the writing direction, e.g. a column read downwards', () => {
    expect(fitAlong({ x: 100, y: 700 }, Math.PI / 2, 200, view, 1000, 800)).toBeCloseTo(0.5, 6);
    expect(fitAlong({ x: 100, y: 100 }, Math.PI / 2, 200, view, 1000, 800)).toBe(1);
  });

  it('works upside down (running left)', () => {
    expect(fitAlong({ x: 150, y: 400 }, Math.PI, 200, view, 1000, 800)).toBeCloseTo(0.75, 6);
  });
});