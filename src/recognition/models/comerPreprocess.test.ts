import { describe, expect, it } from 'vitest';
import { line } from '../../ink/testUtils';
import { MAX_W, MIN_W, MODEL_H, PAD, W_ALIGN, buildMask, planRender, resamplePoints } from './comerPreprocess';

describe('planRender', () => {
  it('returns null when there is nothing to draw', () => {
    expect(planRender([])).toBeNull();
  });

  it('scales the content to fit the target height and aligns the width to 64', () => {
    const plan = planRender([line('a', 10, 20, 110, 60)])!; // 100 x 40 of ink
    const rawW = 100 + PAD * 2;
    const rawH = 40 + PAD * 2;
    expect(plan.scale).toBeCloseTo(128 / rawH, 6);
    expect(plan.contentH).toBe(Math.round(rawH * plan.scale));
    expect(plan.canvasW % W_ALIGN).toBe(0);
    expect(plan.canvasW).toBeGreaterThanOrEqual(plan.contentW);
    expect(plan.canvasW).toBeGreaterThanOrEqual(MIN_W);
    expect(rawW).toBeGreaterThan(0);
  });

  it('never exceeds the maximum width, however long the line', () => {
    const plan = planRender([line('a', 0, 0, 5000, 40)])!;
    expect(plan.canvasW).toBeLessThanOrEqual(MAX_W);
    expect(plan.contentW).toBeLessThanOrEqual(MAX_W);
  });

  it('handles a single point and a perfectly flat bar', () => {
    expect(planRender([{ id: 'p', points: [{ x: 5, y: 5, t: 0, p: 0.5 }], width: 2 }])).not.toBeNull();
    const bar = planRender([line('b', 0, 10, 80, 10)])!;
    expect(Number.isFinite(bar.scale)).toBe(true);
  });

  it('does not depend on where on the page the writing is', () => {
    const a = planRender([line('a', 0, 0, 100, 40)])!;
    const b = planRender([line('a', 700, 500, 800, 540)])!;
    expect(b.scale).toBeCloseTo(a.scale, 9);
    expect(b.canvasW).toBe(a.canvasW);
  });
});

describe('buildMask', () => {
  it('marks only the written area as valid (0)', () => {
    const mask = buildMask({ contentW: 100, contentH: 50, canvasW: 128 });
    expect(mask.length).toBe(MODEL_H * 128);
    expect(mask.reduce((n, v) => n + (v === 0 ? 1 : 0), 0)).toBe(100 * 50);
    expect(mask[0]).toBe(0);
    expect(mask[50 * 128]).toBe(1);
    expect(mask[99]).toBe(0);
    expect(mask[100]).toBe(1);
  });
});

describe('resamplePoints', () => {
  it('keeps both ends and spaces points evenly', () => {
    const pts = resamplePoints([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
    expect(pts.length).toBe(6);
  });
  it('passes a single point through and survives repeated points', () => {
    expect(resamplePoints([{ x: 1, y: 2 }], 3)).toEqual([{ x: 1, y: 2 }]);
    expect(() => resamplePoints([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 4, y: 1 }], 2)).not.toThrow();
  });
});
