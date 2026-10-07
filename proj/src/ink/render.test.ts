import { describe, expect, it } from 'vitest';
import { INK_COLOR, PEN_COLORS, sanitizeColor } from './render';

describe('pen colors', () => {
  it('offers several distinct colors and starts with the default ink', () => {
    expect(PEN_COLORS.length).toBeGreaterThan(1);
    expect(PEN_COLORS[0]?.value).toBe(INK_COLOR);
    expect(new Set(PEN_COLORS.map((c) => c.value)).size).toBe(PEN_COLORS.length);
  });
  it('every palette color is valid', () => {
    for (const c of PEN_COLORS) expect(sanitizeColor(c.value)).toBe(c.value);
  });
  it('falls back to the default ink for missing or odd values', () => {
    expect(sanitizeColor(undefined)).toBe(INK_COLOR);
    expect(sanitizeColor('red; background:url(x)')).toBe(INK_COLOR);
    expect(sanitizeColor('#12')).toBe(INK_COLOR);
    expect(sanitizeColor('#abc')).toBe('#abc');
  });
});
