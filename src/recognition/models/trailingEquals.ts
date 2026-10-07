import type { Stroke } from '../../ink/types';
import { pathBounds, segmentLine } from './symbolSegmenter';

/** A flat stroke is at least this many times wider than tall. */
const FLAT_ASPECT = 2;
/** Each bar of an "=" must be at least this long compared with the tallest other symbol (people draw small ones). */
const MIN_BAR_LENGTH = 0.1;

const w = (s: Stroke) => {
  const b = pathBounds([s]);
  return { width: b.right - b.left, height: b.bottom - b.top };
};

export interface EqualsSplit {
  /** true when the line ends with a hand-drawn "=" (two flat strokes stacked at the right end) */
  hasEquals: boolean;
  /** the strokes without that "=" (all strokes when there is none) */
  rest: readonly Stroke[];
}

/**
 * Finds an "=" at the right end of a line by its shape: the last symbol is exactly two flat bars.
 * The model sometimes forgets to write the "=" (or mistakes a "÷" for one), so the recognizer
 * reads the rest of the line without it and puts the "=" back itself.
 */
export function splitTrailingEquals(strokes: readonly Stroke[]): EqualsSplit {
  const none: EqualsSplit = { hasEquals: false, rest: strokes };
  const items = segmentLine(strokes);
  if (items.length < 2) return none;

  const last = items[items.length - 1];
  if (last.kind !== 'symbol' || last.strokes.length !== 2) return none;
  const bars = last.strokes.map(w);
  if (!bars.every((b) => b.width >= FLAT_ASPECT * Math.max(b.height, 1))) return none;

  let tallest = 0;
  for (const item of items.slice(0, -1)) tallest = Math.max(tallest, item.bounds.bottom - item.bounds.top);
  if (tallest <= 0 || !bars.every((b) => b.width >= MIN_BAR_LENGTH * tallest)) return none;

  const drop = new Set<Stroke>(last.strokes);
  return { hasEquals: true, rest: strokes.filter((s) => !drop.has(s)) };
}