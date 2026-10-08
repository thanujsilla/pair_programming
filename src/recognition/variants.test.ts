import { describe, expect, it } from 'vitest';
import { shearLevel } from '../ink/rotate';
import { strokeBounds } from '../ink/bounds';
import { line } from '../ink/testUtils';
import { calculate } from '../math';
import { pickReading, variantsOf, type Reading } from './variants';

const reading = (kind: Reading['kind'], text: string, confidence?: number): Reading => ({
  kind,
  out: confidence === undefined ? { text } : { text, confidence },
  result: calculate(text),
});

describe('variantsOf', () => {
  const strokes = [line('a', 0, 100, 40, 90), line('b', 100, 75, 140, 65)];

  it('gives one variant for level lines and upside-down lines', () => {
    expect(variantsOf(strokes, 0).map((v) => v.kind)).toEqual(['turn']);
    expect(variantsOf(strokes, Math.PI).map((v) => v.kind)).toEqual(['turn']);
  });

  it('gives a turned and a stacked version for a vertical column (turned glyphs or upright glyphs)', () => {
    expect(variantsOf(strokes, Math.PI / 2).map((v) => v.kind)).toEqual(['turn', 'stack']);
    expect(variantsOf(strokes, -Math.PI / 2).map((v) => v.kind)).toEqual(['turn', 'stack']);
  });

  it('also stacks a slope within 30 deg of vertical, and only turns anything else', () => {
    expect(variantsOf(strokes, (70 * Math.PI) / 180).map((v) => v.kind)).toEqual(['turn', 'stack']);
    expect(variantsOf(strokes, (200 * Math.PI) / 180).map((v) => v.kind)).toEqual(['turn']);
  });

  it('gives both a turned and a levelled version for a gentle slope', () => {
    expect(variantsOf(strokes, -0.4).map((v) => v.kind)).toEqual(['turn', 'level']);
  });
});

describe('shearLevel', () => {
  it('keeps upright strokes upright and flattens strokes drawn along the slope', () => {
    const angle = Math.atan2(-30, 100); // rising to the right
    const upright = line('v', 50, 0, 50, 60);
    const along = line('h', 0, 40, 100, 10);
    const [v, h] = shearLevel([upright, along], angle);
    const vb = strokeBounds(v!);
    const hb = strokeBounds(h!);
    // (a box includes the pen width, 2)
    expect(vb.right - vb.left).toBeLessThan(3); // still vertical
    expect(hb.bottom - hb.top).toBeLessThan(3); // now flat
  });
});

describe('pickReading', () => {
  it('prefers the reading the model is more sure of', () => {
    const best = pickReading([reading('turn', '1 \\div 3 =', 0.987), reading('level', '1 + 3 =', 0.9999)]);
    expect(best.kind).toBe('level');
  });

  it('prefers a complete reading over an unusable one, even if less sure', () => {
    const best = pickReading([reading('turn', '1 +', 0.99), reading('level', '1 + 3 =', 0.6)]);
    expect(best.kind).toBe('level');
  });

  it('keeps the first reading on a tie or when there is no confidence', () => {
    expect(pickReading([reading('turn', '1 + 3 ='), reading('level', '1 + 3 =')]).kind).toBe('turn');
    expect(pickReading([reading('turn', '1 + 3 =', 0.9), reading('level', '1 + 3 =', 0.9)]).kind).toBe('turn');
  });

  it('returns the only reading', () => {
    expect(pickReading([reading('turn', '2 + 2 =', 0.5)]).kind).toBe('turn');
  });
});