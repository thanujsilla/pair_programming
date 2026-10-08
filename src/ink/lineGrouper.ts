import { strokeBounds, unionRect, type Rect } from './bounds';
import { findFractions } from './fractions';
import { splitSideBySide } from './sideBySide';
import { MIN_TILT, centreOf, digitHeight, estimateAngle, rectCentre, rotatePoint, straighten, typicalSize } from './rotate';
import type { Stroke } from './types';

/** One handwritten line (one equation). Lines are ordered top to bottom. */
export interface Line {
  readonly index: number;
  /** strokes in the order they were drawn */
  readonly strokes: readonly Stroke[];
  readonly bounds: Rect;
  /**
   * Changes whenever the ink in this line changes (stroke ids are never reused),
   * so it doubles as a cache key and as the "dirty line" detector.
   */
  readonly signature: string;
  /**
   * Direction of the writing in radians (0 = horizontal, negative = rising to the right).
   * The recognizer is given the strokes straightened by this angle.
   */
  readonly angle: number;
  /** The ink at the right-hand end of the line (the "="): the answer is drawn beside it. */
  readonly endBounds: Rect;
  /** Height of one handwritten digit (bars and dots ignored): the answer is written this big. */
  readonly glyphHeight: number;
  /**
   * The point just past the last symbol (the "="), in the writing direction, centred on it: the
   * answer starts here and runs along `angle`, so it follows the orientation of the "=".
   */
  readonly tail: { readonly x: number; readonly y: number };
}

interface Interval {
  top: number;
  bottom: number;
}

const SMALL_MARK_RATIO = 0.4; // minus signs, dots and commas are short compared with digits
const SMALL_MARK_SLACK = 0.25; // how far outside the line a small mark may sit
const MIN_OVERLAP = 0.5; // tall strokes must overlap this much of the shorter one

const height = (i: Interval) => i.bottom - i.top;

/** Do two vertical ranges belong to the same handwritten line? */
function sameLine(a: Interval, b: Interval): boolean {
  const [small, big] = height(a) <= height(b) ? [a, b] : [b, a];
  const hs = height(small);
  const hb = height(big);
  if (hs <= SMALL_MARK_RATIO * hb) {
    // A flat bar or dot: judged by its centre, with some slack for a low decimal point.
    const c = (small.top + small.bottom) / 2;
    const slack = SMALL_MARK_SLACK * hb;
    return c >= big.top - slack && c <= big.bottom + slack;
  }
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return overlap >= MIN_OVERLAP * hs;
}

interface Cluster {
  strokes: Stroke[];
  bounds: Rect;
}

/**
 * Add one cluster to a set that is already fully merged. Only the newcomer can create new
 * merges (the others' boxes did not change), so we just keep absorbing whatever it matches.
 */
function insertCluster(clusters: Cluster[], fresh: Cluster): void {
  let current = fresh;
  for (let i = 0; i < clusters.length; ) {
    const other = clusters[i] as Cluster;
    if (sameLine(other.bounds, current.bounds)) {
      current = { strokes: [...other.strokes, ...current.strokes], bounds: unionRect(other.bounds, current.bounds) };
      clusters.splice(i, 1);
      i = 0; // the grown box may now match clusters we already passed
    } else {
      i++;
    }
  }
  clusters.push(current);
}

/** Group strokes into rows by vertical position only (the normal, horizontal case). */
function clusterRows(strokes: readonly Stroke[]): Cluster[] {
  const clusters: Cluster[] = [];
  // a stacked fraction (numerator, bar, denominator) is one unit even though its parts sit on different rows
  const inFraction = new Set<Stroke>();
  for (const parts of findFractions(strokes)) {
    const fresh = parts.filter((s) => !inFraction.has(s));
    if (fresh.length === 0) continue;
    for (const s of fresh) inFraction.add(s);
    insertCluster(clusters, { strokes: fresh, bounds: fresh.map(strokeBounds).reduce(unionRect) });
  }
  for (const s of strokes) if (!inFraction.has(s)) insertCluster(clusters, { strokes: [s], bounds: strokeBounds(s) });
  return clusters;
}

const NEAR_FACTOR = 1.5; // clusters further apart than this many digit sizes are not neighbours

function gap(a: Rect, b: Rect): number {
  const gx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const gy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return Math.hypot(gx, gy);
}

/** Tilt of a set of strokes, or 0 when it is (nearly) flat or not a single line. */
function tiltOf(strokes: readonly Stroke[]): number {
  const a = estimateAngle(strokes);
  return Math.abs(a) >= MIN_TILT ? a : 0;
}

/**
 * Writing that runs diagonally breaks the "same height" rule, so neighbouring pieces are
 * joined when, together, they form ONE straight line at a consistent angle
 * (checked by straightening them and asking the row rule again).
 */
function mergeTilted(input: Cluster[]): Cluster[] {
  const clusters = [...input];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < clusters.length && !changed; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i] as Cluster;
        const b = clusters[j] as Cluster;
        if (a.strokes.length + b.strokes.length < 3) continue;
        const strokes = [...a.strokes, ...b.strokes];
        const size = typicalSize(strokes.map(strokeBounds));
        // cheap rejection first: far apart
        if (gap(a.bounds, b.bounds) > NEAR_FACTOR * size) continue;
        // Do the two pieces, together, form ONE straight line (flat, tilted or turned a quarter turn)?
        // Their boxes may well overlap sideways on a diagonal line, so that cannot be used to rule a merge
        // out; the guards are the consistent-angle test and the single-row check after straightening.
        const angle = tiltOf(strokes);
        if (angle === 0) continue;
        if (clusterRows(straighten(strokes, angle)).length !== 1) continue;
        clusters[i] = { strokes, bounds: unionRect(a.bounds, b.bounds) };
        clusters.splice(j, 1);
        changed = true;
        break;
      }
    }
  }
  return clusters;
}

/** The ink at the right end of a straightened line, as a box in the page's own coordinates. */
function endOf(strokes: readonly Stroke[], angle: number, glyph: number, fallback: Rect): Rect {
  const flat = straighten(strokes, angle).map(strokeBounds);
  const right = Math.max(...flat.map((b) => b.right));
  let end: Rect | null = null;
  strokes.forEach((s, i) => {
    const b = flat[i] as Rect;
    if (rectCentre(b).x >= right - 0.9 * glyph) end = end ? unionRect(end, strokeBounds(s)) : strokeBounds(s);
  });
  return end ?? fallback;
}

/** Where the writing ends, in page coordinates: just past the last symbol, level with its middle. */
function tailOf(strokes: readonly Stroke[], angle: number, glyph: number): { x: number; y: number } {
  const flat = straighten(strokes, angle).map(strokeBounds);
  const right = Math.max(...flat.map((b) => b.right));
  let end: Rect | null = null;
  for (const b of flat) if (rectCentre(b).x >= right - 0.9 * glyph) end = end ? unionRect(end, b) : b;
  const at = end ?? flat.reduce(unionRect);
  // the straightened frame is the page turned by -angle around the strokes' centre; turn the point back
  return rotatePoint(right, (at.top + at.bottom) / 2, Math.cos(angle), Math.sin(angle), centreOf(strokes));
}

/**
 * Split all strokes into lines. Works on geometry only, so the result does not depend on
 * drawing order or on what was written. Horizontal rows are found by height; diagonal
 * writing is then joined up and its angle measured.
 */
export function groupLines(strokes: readonly Stroke[]): Line[] {
  const order = new Map(strokes.map((s, i) => [s.id, i]));
  const byTime = (a: Stroke, b: Stroke) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);

  const pieces: Cluster[] = [];
  for (const c of mergeTilted(clusterRows(strokes))) {
    // one row may hold several equations side by side
    const groups = splitSideBySide(c.strokes, tiltOf(c.strokes));
    if (groups.length === 1) pieces.push(c);
    else for (const g of groups) pieces.push({ strokes: g, bounds: g.map(strokeBounds).reduce(unionRect) });
  }

  return pieces
    .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left)
    .map((c, index) => {
      const sorted = [...c.strokes].sort(byTime);
      const angle = tiltOf(sorted);
      const flat = angle === 0 ? sorted : straighten(sorted, angle);
      const flatBoxes = flat.map(strokeBounds);
      const size = typicalSize(flatBoxes); // also counts long bars: used to find the end of the line
      return {
        index,
        strokes: sorted,
        bounds: c.bounds,
        signature: sorted.map((s) => s.id).join(','),
        angle,
        endBounds: endOf(sorted, angle, size, c.bounds),
        glyphHeight: digitHeight(flatBoxes),
        tail: tailOf(sorted, angle, size),
      };
    });
}