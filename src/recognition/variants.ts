import { MAX_TILT, shearLevel, stackLevel, straighten } from '../ink/rotate';
import type { Stroke } from '../ink/types';
import type { EvalResult } from '../math';
import type { RecognitionResult } from './types';

/**
 * Ways of presenting a line to the recogniser, which only reads level, upright writing.
 *  - `turn`: rotate the line so its baseline is level (right for a page turned or writing turned with it)
 *  - `level`: shear it so the baseline is level but digits stay upright (right for upright digits on a slope)
 *  - `stack`: lay a vertical column of upright glyphs out as a row (right for "1 / + / 3 / =" written downwards)
 * A gentle slope gets turn + level, a vertical line gets turn + stack, and the better reading is kept.
 */
export interface Variant {
  readonly kind: 'turn' | 'level' | 'stack';
  readonly strokes: Stroke[];
}

export function variantsOf(strokes: readonly Stroke[], angle: number): Variant[] {
  const turn: Variant = { kind: 'turn', strokes: straighten(strokes, angle) };
  if (angle === 0) return [turn];
  if (Math.abs(angle) <= MAX_TILT) return [turn, { kind: 'level', strokes: shearLevel(strokes, angle) }];
  // within 30 deg of straight up or down: a column of glyphs, turned or upright
  if (Math.abs(Math.abs(angle) - Math.PI / 2) <= (30 * Math.PI) / 180) {
    return [turn, { kind: 'stack', strokes: stackLevel(strokes, angle) }];
  }
  return [turn];
}

export interface Reading {
  readonly kind: Variant['kind'];
  readonly out: RecognitionResult;
  readonly result: EvalResult;
}

const usable = (r: Reading): boolean => r.result.status === 'ok' || r.result.status === 'undefined';

/**
 * Choose between readings of the same line: a complete, evaluable one beats an unusable one, and
 * between two usable readings the one the model is more sure of wins (a tie keeps the first).
 */
export function pickReading(readings: readonly Reading[]): Reading {
  let best = readings[0] as Reading;
  for (const r of readings.slice(1)) {
    const better =
      (usable(r) && !usable(best)) ||
      (usable(r) === usable(best) && (r.out.confidence ?? 0) > (best.out.confidence ?? 0) + 1e-9);
    if (better) best = r;
  }
  return best;
}