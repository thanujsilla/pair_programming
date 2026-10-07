import { describe, expect, it } from 'vitest';
import { strokeBounds } from './bounds';
import { estimateAngle, rotateStrokes, straighten } from './rotate';
import { tiltedEquation } from './testUtils';

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
