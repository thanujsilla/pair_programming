import type { Stroke } from './types';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Bounding box of the visible ink (includes half the stroke width). */
const cache = new WeakMap<Stroke, Rect>();

export function strokeBounds(stroke: Stroke): Rect {
  const hit = cache.get(stroke);
  if (hit) return hit; // strokes are never changed after they are made
  const r = computeBounds(stroke);
  cache.set(stroke, r);
  return r;
}

function computeBounds(stroke: Stroke): Rect {
  if (stroke.points.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of stroke.points) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  const h = stroke.width / 2;
  return { left: left - h, top: top - h, right: right + h, bottom: bottom + h };
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}