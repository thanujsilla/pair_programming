import { describe, expect, it } from 'vitest';
import { strokeBounds, unionRect } from './bounds';
import { dot, line } from './testUtils';

describe('strokeBounds', () => {
  it('includes half the stroke width on every side', () => {
    expect(strokeBounds(line('a', 10, 20, 50, 40, 5, 4))).toEqual({ left: 8, top: 18, right: 52, bottom: 42 });
  });
  it('handles a dot', () => {
    expect(strokeBounds(dot('d', 10, 10, 4))).toEqual({ left: 8, top: 8, right: 12, bottom: 12 });
  });
  it('returns an empty box for a stroke with no points', () => {
    expect(strokeBounds({ id: 'x', points: [], width: 2 })).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});

describe('unionRect', () => {
  it('covers both rectangles', () => {
    expect(
      unionRect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 5, top: -5, right: 20, bottom: 8 }),
    ).toEqual({ left: 0, top: -5, right: 20, bottom: 10 });
  });
});