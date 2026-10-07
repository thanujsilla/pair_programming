import type { Point, Stroke } from './types';

export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Does the eraser circle (x, y, radius) touch any visible ink of this stroke? */
export function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const r = radius + stroke.width / 2;
  const pts = stroke.points;
  if (pts.length === 0) return false;
  const first = pts[0] as Point;
  if (pts.length === 1) return Math.hypot(first.x - x, first.y - y) <= r;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= r) return true;
  }
  return false;
}

/** Insert points so no two neighbours are further apart than maxGap. */
function densify(points: readonly Point[], maxGap: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const b = points[i] as Point;
    if (i > 0) {
      const a = points[i - 1] as Point;
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / maxGap);
      for (let k = 1; k < n; k++) {
        const f = k / n;
        out.push({
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          t: a.t + (b.t - a.t) * f,
          p: a.p + (b.p - a.p) * f,
        });
      }
    }
    out.push(b);
  }
  return out;
}

/**
 * Pixel eraser: cut the part of the stroke inside the circle.
 * Returns null if the stroke is untouched, [] if it is fully erased,
 * otherwise the remaining pieces (as new strokes). Real vector splitting, so
 * the recognizer never sees ink that has been erased.
 */
export function eraseCircle(
  stroke: Stroke,
  x: number,
  y: number,
  radius: number,
  makeId: () => string,
): Stroke[] | null {
  if (!strokeHit(stroke, x, y, radius)) return null;
  if (stroke.points.length <= 1) return []; // a dot is erased whole

  const r = radius + stroke.width / 2;
  const dense = densify(stroke.points, Math.max(1, r / 2));
  const pieces: Stroke[] = [];
  let run: Point[] = [];
  let removed = 0;

  const flush = () => {
    // Fragments of a single point are dropped, otherwise they would read as decimal points.
    if (run.length >= 2) pieces.push({ id: makeId(), points: run, width: stroke.width, ...(stroke.color ? { color: stroke.color } : {}) });
    run = [];
  };

  for (const p of dense) {
    if (Math.hypot(p.x - x, p.y - y) <= r) {
      removed++;
      flush();
    } else {
      run.push(p);
    }
  }
  flush();

  return removed === 0 ? null : pieces;
}