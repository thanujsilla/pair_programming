import { strokeBounds, type Rect } from './bounds';
import { typicalSize } from './rotate';
import type { Stroke } from './types';

/** A bar is at least this many times wider than tall. */
const BAR_ASPECT = 3;
/** ...and at least this long compared with a typical digit, so a small minus is not a fraction bar. */
const MIN_BAR = 0.6;
/** Numerator and denominator must be at least this big compared with the bar (a dot of a "÷" is not). */
const MIN_PART = 0.25;
/** ...and no further from the bar than this many bar-lengths. */
const MAX_GAP = 0.6;
/** ...and roughly above/below the bar sideways. */
const SIDE_SLACK = 0.15;

const width = (r: Rect) => r.right - r.left;
const height = (r: Rect) => r.bottom - r.top;
const isFlat = (r: Rect) => width(r) >= BAR_ASPECT * Math.max(height(r), 1);

/**
 * Stacked fractions: a long flat bar with ink right above it and right below it.
 * Returns the strokes of each fraction (bar, numerator, denominator). A bar with nothing on one
 * side (a minus, one bar of an "=", a "÷" with its dots) is not a fraction.
 * Pure geometry, so the line grouper and the recognizer agree on what a fraction is.
 */
export function findFractions(strokes: readonly Stroke[]): Stroke[][] {
  if (strokes.length < 3) return [];
  const boxes = strokes.map(strokeBounds);
  const size = typicalSize(boxes);
  const found: Stroke[][] = [];

  boxes.forEach((bar, i) => {
    const w = width(bar);
    if (!isFlat(bar) || w < MIN_BAR * size) return;
    const mid = (bar.left + bar.right) / 2;
    const above: Stroke[] = [];
    const below: Stroke[] = [];
    boxes.forEach((b, j) => {
      if (j === i || isFlat(b) || Math.max(width(b), height(b)) < MIN_PART * w) return;
      const cx = (b.left + b.right) / 2;
      if (Math.abs(cx - mid) > w / 2 + SIDE_SLACK * w) return;
      if (b.bottom <= bar.bottom && bar.top - b.bottom <= MAX_GAP * w) above.push(strokes[j] as Stroke);
      else if (b.top >= bar.top && b.top - bar.bottom <= MAX_GAP * w) below.push(strokes[j] as Stroke);
    });
    if (above.length > 0 && below.length > 0) found.push([strokes[i] as Stroke, ...above, ...below]);
  });
  return found;
}
