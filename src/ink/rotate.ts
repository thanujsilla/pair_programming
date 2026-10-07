import { strokeBounds, type Rect } from './bounds';
import type { Stroke } from './types';

export interface Pt {
  x: number;
  y: number;
}

/** Lines tilted less than this are left alone (normal hand wobble). */
export const MIN_TILT = (6 * Math.PI) / 180;
/** Steeper than this is not "a line of writing" any more. */
export const MAX_TILT = (60 * Math.PI) / 180;

const CONSISTENT_WITHIN = (15 * Math.PI) / 180;
const MIN_CONSISTENT_SHARE = 0.7;

export const rectCentre = (r: Rect): Pt => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Height of a typical "full-size" stroke (ignores dots and minus bars). */
export function typicalSize(boxes: readonly Rect[]): number {
  const sizes = boxes.map((b) => Math.max(b.right - b.left, b.bottom - b.top)).sort((a, b) => a - b);
  if (sizes.length === 0) return 0;
  return sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * 0.75))] as number;
}

/** Rotate a point by `angle` (radians) around `about`. */
function rotatePoint(x: number, y: number, cos: number, sin: number, about: Pt): Pt {
  const dx = x - about.x;
  const dy = y - about.y;
  return { x: about.x + dx * cos - dy * sin, y: about.y + dx * sin + dy * cos };
}

/** A copy of the strokes rotated by `angle` radians around `about` (ids, widths and colours are kept). */
export function rotateStrokes(strokes: readonly Stroke[], angle: number, about: Pt): Stroke[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p, ...rotatePoint(p.x, p.y, cos, sin, about) })),
  }));
}

export function centreOf(strokes: readonly Stroke[]): Pt {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const s of strokes) {
    const b = strokeBounds(s);
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }
  return strokes.length ? { x: (left + right) / 2, y: (top + bottom) / 2 } : { x: 0, y: 0 };
}

/** The strokes turned so that a line of writing at `angle` becomes horizontal. */
export function straighten(strokes: readonly Stroke[], angle: number): Stroke[] {
  if (angle === 0) return [...strokes];
  return rotateStrokes(strokes, -angle, centreOf(strokes));
}

/**
 * Which way is this writing running? Robust median of the directions between pairs of
 * stroke centres (Theil-Sen), in radians (0 = flat, negative = rising to the right).
 * Returns 0 when there is not enough ink, or when the pairs disagree
 * (e.g. two short rows stacked on top of each other are not one tilted line).
 */
export function estimateAngle(strokes: readonly Stroke[]): number {
  if (strokes.length < 3) return 0;
  const boxes = strokes.map(strokeBounds);
  const size = typicalSize(boxes);
  if (size <= 0) return 0;
  const centres = boxes.map(rectCentre).sort((a, b) => a.x - b.x);

  const angles: number[] = [];
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      const a = centres[i] as Pt;
      const b = centres[j] as Pt;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx < 0.3 * size || Math.hypot(dx, dy) < 0.6 * size) continue; // same glyph: says nothing
      angles.push(Math.atan2(dy, dx));
    }
  }
  if (angles.length === 0) return 0;

  const m = median(angles);
  const agree = angles.filter((a) => Math.abs(a - m) <= CONSISTENT_WITHIN).length;
  if (agree / angles.length < MIN_CONSISTENT_SHARE) return 0;
  return Math.abs(m) > MAX_TILT ? 0 : m;
}
