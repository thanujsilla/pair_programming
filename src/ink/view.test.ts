import { describe, expect, it } from 'vitest';
import { IDENTITY_VIEW, MAX_SCALE, MIN_SCALE, clampScale, clampView, panBy, toScreen, toWorld, zoomAt } from './view';

describe('view', () => {
  it('converts screen <-> world and back', () => {
    const v = { scale: 2.5, x: -40, y: 120 };
    const w = toWorld(v, 300, 200);
    const s = toScreen(v, w.x, w.y);
    expect(s.x).toBeCloseTo(300, 9);
    expect(s.y).toBeCloseTo(200, 9);
  });

  it('identity view changes nothing', () => {
    expect(toWorld(IDENTITY_VIEW, 12, 34)).toEqual({ x: 12, y: 34 });
  });

  it('zooming keeps the point under the cursor fixed', () => {
    const v = { scale: 1.5, x: 30, y: -20 };
    const before = toWorld(v, 400, 250);
    const z = zoomAt(v, 2, 400, 250);
    const after = toWorld(z, 400, 250);
    expect(z.scale).toBeCloseTo(3, 9);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('keeps the point fixed even when the scale is clamped', () => {
    const z = zoomAt({ scale: 5, x: 0, y: 0 }, 10, 100, 100);
    expect(z.scale).toBe(MAX_SCALE);
    expect(toWorld(z, 100, 100).x).toBeCloseTo(100 / 5 * 1, 9);
  });

  it('clamps and sanitises the scale', () => {
    expect(clampScale(0.001)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(NaN)).toBe(1);
  });

  it('cannot zoom out past the page (100 %)', () => {
    expect(MIN_SCALE).toBe(1);
    expect(zoomAt(IDENTITY_VIEW, 0.5, 100, 100).scale).toBe(1);
  });

  it('keeps a zoomed page covering the screen (no endless scrolling)', () => {
    const v = clampView({ scale: 2, x: 500, y: -9999 }, 800, 600);
    expect(v).toEqual({ scale: 2, x: 0, y: -600 });
    expect(clampView({ scale: 2, x: -9999, y: 100 }, 800, 600)).toEqual({ scale: 2, x: -800, y: 0 });
    expect(clampView({ scale: 2, x: -300, y: -200 }, 800, 600)).toEqual({ scale: 2, x: -300, y: -200 });
  });

  it('at 100 % the page cannot be moved at all', () => {
    expect(clampView({ scale: 1, x: 50, y: -70 }, 800, 600)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('pans', () => {
    expect(panBy(IDENTITY_VIEW, 5, -7)).toEqual({ scale: 1, x: 5, y: -7 });
  });
});