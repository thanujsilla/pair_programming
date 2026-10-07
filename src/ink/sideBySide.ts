import { segmentLine, pathBounds } from '../recognition/models/symbolSegmenter';
import { strokeBounds } from './bounds';
import { straighten, typicalSize } from './rotate';
import type { Stroke } from './types';

/** A wider empty stretch than this many digit heights means "a new equation starts here". */
const BIG_GAP = 2.5;
const FLAT = 2;

const isEquals = (strokes: readonly Stroke[]): boolean =>
  strokes.length === 2 &&
  strokes.every((s) => {
    const b = pathBounds([s]);
    return b.right - b.left >= FLAT * Math.max(b.bottom - b.top, 1);
  });

/**
 * One row can hold several equations written side by side ("1+1= 2+2="). Cut it
 *  - after an "=" when another "=" follows later in the row (a line never has two), and
 *  - wherever a very wide gap separates two symbols.
 * Returns the strokes of each equation, left to right. A normal single equation comes back as is.
 */
export function splitSideBySide(strokes: readonly Stroke[], angle: number): Stroke[][] {
  if (strokes.length < 4) return [[...strokes]];
  const flat = straighten(strokes, angle);
  const items = segmentLine(flat);
  if (items.length < 2) return [[...strokes]];

  const glyph = typicalSize(flat.map(strokeBounds));
  const equalsAt = items.map((it) => it.kind === 'symbol' && isEquals(it.strokes));
  const laterEquals = (k: number) => equalsAt.slice(k + 1).some(Boolean);

  // cut positions (x, in the straightened frame) between neighbouring symbols
  const cuts: number[] = [];
  items.forEach((item, k) => {
    const next = items[k + 1];
    if (!next) return;
    const wide = next.bounds.left - item.bounds.right >= BIG_GAP * glyph;
    if ((equalsAt[k] && laterEquals(k)) || wide) cuts.push((item.bounds.right + next.bounds.left) / 2);
  });
  if (cuts.length === 0) return [[...strokes]];

  // every stroke (dots included) goes to the equation its centre falls in
  const groups: Stroke[][] = cuts.map(() => []).concat([[]]);
  strokes.forEach((original, i) => {
    const b = pathBounds([flat[i] as Stroke]);
    const cx = (b.left + b.right) / 2;
    groups[cuts.filter((c) => c < cx).length]!.push(original);
  });
  return groups.filter((g) => g.length > 0);
}
