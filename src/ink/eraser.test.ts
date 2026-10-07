import { describe, expect, it } from 'vitest';
import { distToSegment, eraseCircle, strokeHit } from './eraser';
import { dot, line } from './testUtils';

let n = 0;
const makeId = () => `p${++n}`;

describe('distToSegment', () => {
  it('measures to the nearest point on the segment', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBe(3); // above the middle
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBe(5); // beyond the start: distance to the endpoint
    expect(distToSegment(3, 4, 0, 0, 0, 0)).toBe(5); // zero-length segment
  });
});

describe('strokeHit', () => {
  const s = line('a', 0, 0, 100, 0, 11, 4);
  it('hits within radius + half the stroke width', () => {
    expect(strokeHit(s, 50, 11, 10)).toBe(true); // 11 <= 10 + 2
    expect(strokeHit(s, 50, 13, 10)).toBe(false);
  });
  it('hits a dot only when close', () => {
    const d = dot('d', 10, 10, 4);
    expect(strokeHit(d, 14, 10, 3)).toBe(true);
    expect(strokeHit(d, 30, 10, 3)).toBe(false);
  });
});

describe('eraseCircle (pixel eraser)', () => {
  it('returns null when the stroke is untouched', () => {
    expect(eraseCircle(line('a', 0, 0, 100, 0), 50, 50, 10, makeId)).toBeNull();
  });

  it('splits a line into two pieces and leaves a gap', () => {
    const pieces = eraseCircle(line('a', 0, 0, 100, 0, 21, 2), 50, 0, 10, makeId);
    expect(pieces).not.toBeNull();
    expect(pieces).toHaveLength(2);
    const [left, right] = pieces!;
    const maxLeftX = Math.max(...left!.points.map((p) => p.x));
    const minRightX = Math.min(...right!.points.map((p) => p.x));
    expect(maxLeftX).toBeLessThan(50 - 10);
    expect(minRightX).toBeGreaterThan(50 + 10);
    // pieces keep the width and get fresh unique ids
    expect(left!.width).toBe(2);
    expect(new Set(pieces!.map((p) => p.id)).size).toBe(2);
  });

  it('cuts even when points are far apart (sparse input)', () => {
    // only 2 points 100px apart: the eraser lands between them
    const pieces = eraseCircle(line('a', 0, 0, 100, 0, 2, 2), 50, 0, 8, makeId);
    expect(pieces).toHaveLength(2);
  });

  it('trims the end of a stroke into one piece', () => {
    const pieces = eraseCircle(line('a', 0, 0, 100, 0, 21, 2), 0, 0, 12, makeId);
    expect(pieces).toHaveLength(1);
    expect(Math.min(...pieces![0]!.points.map((p) => p.x))).toBeGreaterThan(12);
  });

  it('erases a short stroke completely', () => {
    expect(eraseCircle(line('a', 0, 0, 6, 0, 7, 2), 3, 0, 12, makeId)).toEqual([]);
  });

  it('erases a dot whole', () => {
    expect(eraseCircle(dot('d', 10, 10), 12, 10, 5, makeId)).toEqual([]);
    expect(eraseCircle(dot('d', 10, 10), 80, 80, 5, makeId)).toBeNull();
  });

  it('drops single-point fragments so they cannot become fake decimal points', () => {
    // A tiny stroke whose only surviving sample would be a lone point.
    const tiny = line('t', 0, 0, 30, 0, 4, 2);
    const pieces = eraseCircle(tiny, 12, 0, 8, makeId)!;
    for (const p of pieces) expect(p.points.length).toBeGreaterThanOrEqual(2);
  });
});
describe('stroke color', () => {
  it('pieces left by the pixel eraser keep the color of the original stroke', () => {
    const s = { ...line('c', 0, 0, 100, 0, 11, 4), color: '#c62828' };
    const pieces = eraseCircle(s, 50, 0, 8, makeId);
    expect(pieces?.length).toBe(2);
    expect(pieces?.every((p) => p.color === '#c62828')).toBe(true);
  });
});
