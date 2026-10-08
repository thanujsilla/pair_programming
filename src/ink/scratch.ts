import { strokeBounds } from './bounds';
import type { Point, Stroke } from './types';

const MIN_REVERSALS = 4; // a zig-zag of at least five passes
const MIN_PATH_RATIO = 5; // the pen travelled this many times the scribble's diagonal
const COVERED = 0.7; // share of a stroke's points that must lie under the scribble
const PAD = 6;

/**
 * Is this pen movement a scribble ("scratch it out") rather than handwriting? Many quick
 * back-and-forth passes in a small area: no digit or operator has that many direction changes.
 * `minSize` is the smallest scribble that counts, in page units.
 */
export function isScribble(points: readonly Point[], minSize = 24): boolean {
  if (points.length < 12) return false;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let path = 0;
  points.forEach((p, i) => {
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
    if (i > 0) path += Math.hypot(p.x - (points[i - 1] as Point).x, p.y - (points[i - 1] as Point).y);
  });
  const w = right - left;
  const h = bottom - top;
  const diag = Math.hypot(w, h);
  if (diag < minSize || path < MIN_PATH_RATIO * diag) return false;

  // direction changes along the longer side, ignoring wobble smaller than 15% of it
  const useX = w >= h;
  const threshold = 0.15 * (useX ? w : h);
  const at = (p: Point) => (useX ? p.x : p.y);
  let reversals = 0;
  let dir = 0; // 0 = not moving yet, 1 = going up the axis, -1 = coming back
  let extreme = at(points[0] as Point);
  for (const p of points) {
    const v = at(p);
    if (dir === 0) {
      if (Math.abs(v - extreme) > threshold) {
        dir = v > extreme ? 1 : -1;
        extreme = v;
      }
    } else if (dir === 1) {
      if (v > extreme) extreme = v;
      else if (extreme - v > threshold) {
        reversals++;
        dir = -1;
        extreme = v;
      }
    } else if (v < extreme) extreme = v;
    else if (v - extreme > threshold) {
      reversals++;
      dir = 1;
      extreme = v;
    }
  }
  return reversals >= MIN_REVERSALS;
}

/**
 * Ids of the strokes a scribble scratches out: those lying (mostly) under it. Empty when the
 * movement is not a scribble, or covers nothing, in which case it is kept as ordinary ink.
 */
export function scratchTargets(points: readonly Point[], strokes: readonly Stroke[], minSize = 24): Set<string> {
  const out = new Set<string>();
  if (!isScribble(points, minSize)) return out;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const box = {
    left: Math.min(...xs) - PAD,
    right: Math.max(...xs) + PAD,
    top: Math.min(...ys) - PAD,
    bottom: Math.max(...ys) + PAD,
  };
  for (const s of strokes) {
    const b = strokeBounds(s);
    if (b.right < box.left || b.left > box.right || b.bottom < box.top || b.top > box.bottom) continue;
    const inside = s.points.filter((p) => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom);
    if (inside.length >= COVERED * s.points.length) out.add(s.id);
  }
  return out;
}