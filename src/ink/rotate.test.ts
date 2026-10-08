import { describe, expect, it } from 'vitest';
import { strokeBounds } from './bounds';
import { digitHeight, estimateAngle, rotateStrokes, stackLevel, straighten } from './rotate';
import { columnEquation, tiltedEquation } from './testUtils';

const deg = (d: number) => (d * Math.PI) / 180;

describe('estimateAngle', () => {
  it('is 0 for level writing', () => {
    expect(Math.abs(estimateAngle(tiltedEquation(0)))).toBeLessThan(deg(2));
  });

  it.each([-45, -30, -20, 15, 30, 45])('measures a tilt of %i degrees', (d) => {
    expect(estimateAngle(tiltedEquation(deg(d)))).toBeCloseTo(deg(d), 1);
  });

  it('gives up on too little ink', () => {
    expect(estimateAngle(tiltedEquation(deg(20)).slice(0, 2))).toBe(0);
  });

  it('does not call two stacked rows one tilted line', () => {
    const top = tiltedEquation(0, 'a');
    const bottom = tiltedEquation(0, 'b').map((s) => ({
      ...s,
      points: s.points.map((p) => ({ ...p, y: p.y + 60 })),
    }));
    expect(estimateAngle([...top.slice(0, 3), ...bottom.slice(0, 2)])).toBe(0);
  });
});

describe('straighten', () => {
  it('makes a tilted line level again and keeps ids', () => {
    const tilted = tiltedEquation(deg(-25));
    const flat = straighten(tilted, estimateAngle(tilted));
    expect(flat.map((s) => s.id)).toEqual(tilted.map((s) => s.id));
    const tops = flat.map((s) => strokeBounds(s));
    const span = Math.max(...tops.map((b) => b.bottom)) - Math.min(...tops.map((b) => b.top));
    expect(span).toBeLessThan(80); // one digit tall, not 120+
  });

  it('rotating there and back is the identity', () => {
    const s = tiltedEquation(0);
    const back = rotateStrokes(rotateStrokes(s, deg(33), { x: 10, y: 20 }), deg(-33), { x: 10, y: 20 });
    expect(back[3]!.points[2]!.x).toBeCloseTo(s[3]!.points[2]!.x, 6);
    expect(back[3]!.points[2]!.y).toBeCloseTo(s[3]!.points[2]!.y, 6);
  });
});

describe('writing in any direction', () => {
  it('reads a column turned a quarter turn clockwise as reading downwards (+90 deg)', () => {
    const a = estimateAngle(tiltedEquation(Math.PI / 2));
    expect(a).toBeCloseTo(Math.PI / 2, 1);
  });

  it('reads a column turned the other way as reading upwards (-90 deg), using the "=" at the top', () => {
    const a = estimateAngle(tiltedEquation(-Math.PI / 2));
    expect(a).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('reads upside-down writing as 180 deg', () => {
    expect(Math.abs(estimateAngle(tiltedEquation(Math.PI)))).toBeCloseTo(Math.PI, 1);
  });

  it('keeps ordinary left-to-right writing at 0', () => {
    expect(estimateAngle(tiltedEquation(0))).toBe(0);
  });

  it('straightening a vertical column makes it a flat row again', () => {
    const strokes = tiltedEquation(Math.PI / 2);
    const flat = straighten(strokes, estimateAngle(strokes));
    const boxes = flat.map(strokeBounds);
    const height = Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top));
    const width = Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left));
    expect(width).toBeGreaterThan(2 * height);
  });
});

describe('digitHeight', () => {
  const box = (w: number, h: number) => ({ left: 0, top: 0, right: w, bottom: h });

  it('is the height of the digits, ignoring long bars and dots', () => {
    // 1, long fraction bar, 0, the two bars of "=", a dot
    const boxes = [box(10, 95), box(250, 6), box(70, 91), box(160, 60), box(160, 60), box(8, 8)];
    expect(digitHeight(boxes)).toBeCloseTo(93, 0);
  });

  it('falls back to the typical size when there are only flat bars', () => {
    expect(digitHeight([box(100, 5), box(100, 5)])).toBeGreaterThan(0);
  });
});

describe('a column of upright glyphs', () => {
  it('is read downwards when its "=" is at the bottom, upwards when it is at the top', () => {
    expect(estimateAngle(columnEquation(true))).toBeCloseTo(Math.PI / 2, 1);
    expect(estimateAngle(columnEquation(false))).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('is laid out as a level row of upright glyphs by stackLevel', () => {
    const strokes = columnEquation(true);
    const row = stackLevel(strokes, Math.PI / 2);
    const boxes = row.map(strokeBounds);
    const w = Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left));
    const h = Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top));
    expect(w).toBeGreaterThan(2.5 * h); // a wide, level row
    // glyphs are only moved, never turned: every stroke keeps its own shape
    row.forEach((s, i) => {
      const a = strokeBounds(strokes[i]!);
      const b = strokeBounds(s);
      expect(b.right - b.left).toBeCloseTo(a.right - a.left, 6);
      expect(b.bottom - b.top).toBeCloseTo(a.bottom - a.top, 6);
    });
    // reading order: "1" first (leftmost), "=" last (rightmost)
    const order = row.map((s, i) => ({ id: strokes[i]!.id, x: strokeBounds(s).left })).sort((p, q) => p.x - q.x);
    expect(order[0]!.id).toBe('c1');
    expect(order[order.length - 1]!.id.startsWith('c=')).toBe(true);
  });

  it('reads a column written from the bottom up with its first glyph on the left', () => {
    const strokes = columnEquation(false);
    const row = stackLevel(strokes, -Math.PI / 2);
    const order = row.map((s, i) => ({ id: strokes[i]!.id, x: strokeBounds(s).left })).sort((p, q) => p.x - q.x);
    expect(order[0]!.id).toBe('c1');
  });
});