import type { Stroke } from '../../ink/types';
import { pathBounds, segmentLine, BAR_ASPECT } from './symbolSegmenter';

/** The longest a division bar may be, as a fraction of the tallest symbol on the line. */
export const MAX_BAR = 0.6;
/** The dots sit this far from the bar, as a fraction of the bar's (new) length, at least and at most. */
const DOT_MIN = 0.3;
const DOT_MAX = 0.5;

const size = (s: Stroke) => {
  const b = pathBounds([s]);
  return { w: b.right - b.left, h: b.bottom - b.top, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 };
};

/**
 * People draw "÷" with a long bar and dots far away from it, and the model then reads it as "−".
 * This redraws each division sign (one flat bar plus two dots) shorter and with the dots closer,
 * the way the model saw it in training. Everything else is left exactly as it was.
 * Returns new strokes; the input is not changed.
 */
export function normalizeDivision(strokes: readonly Stroke[]): readonly Stroke[] {
  const items = segmentLine(strokes);
  const symbols = items.filter((i) => i.kind === 'symbol');
  const replaced = new Map<Stroke, Stroke>();

  for (const sym of symbols) {
    if (sym.strokes.length !== 3) continue;
    const bars = sym.strokes.filter((s) => {
      const z = size(s);
      return z.w >= BAR_ASPECT * Math.max(z.h, 1);
    });
    if (bars.length !== 1) continue;
    const bar = bars[0];
    const dots = sym.strokes.filter((s) => s !== bar);
    const b = size(bar);
    const above = dots.filter((d) => size(d).cy < b.cy);
    const below = dots.filter((d) => size(d).cy >= b.cy);
    if (above.length !== 1 || below.length !== 1) continue; // not a division sign

    let tallest = 0;
    for (const other of symbols) if (other !== sym) tallest = Math.max(tallest, other.bounds.bottom - other.bounds.top);
    if (tallest <= 0) continue; // nothing to compare with
    const k = Math.min(1, (MAX_BAR * tallest) / b.w);
    if (k >= 1) continue; // already compact

    const newLen = b.w * k;
    const move = (s: Stroke, fx: (x: number) => number, fy: (y: number) => number): Stroke => ({
      ...s,
      points: s.points.map((p) => ({ ...p, x: fx(p.x), y: fy(p.y) })),
    });
    const sx = (x: number) => b.cx + (x - b.cx) * k;
    replaced.set(bar, move(bar, sx, (y) => b.cy + (y - b.cy) * k));
    for (const d of [above[0], below[0]]) {
      const z = size(d);
      const off = Math.min(DOT_MAX * newLen, Math.max(DOT_MIN * newLen, Math.abs(z.cy - b.cy) * k));
      const targetCy = b.cy + (z.cy < b.cy ? -off : off);
      replaced.set(d, move(d, sx, (y) => y - z.cy + targetCy));
    }
  }
  return replaced.size === 0 ? strokes : strokes.map((s) => replaced.get(s) ?? s);
}
