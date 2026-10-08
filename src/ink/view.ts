/**
 * The camera over the page. A world point (where strokes live) appears on screen at
 * `world * scale + (x, y)`. Strokes always stay in world coordinates, so zooming and
 * panning never change the ink or what the recogniser sees.
 */
export interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export const IDENTITY_VIEW: View = { scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 1; // the page is exactly one screen; you can only zoom in
export const MAX_SCALE = 6;

export const clampScale = (s: number): number =>
  Number.isFinite(s) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)) : 1;

export function toWorld(v: View, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
}

export function toScreen(v: View, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
}

/** Zoom by `factor` keeping the page point under screen position (sx, sy) where it is. */
export function zoomAt(v: View, factor: number, sx: number, sy: number): View {
  const scale = clampScale(v.scale * factor);
  const k = scale / v.scale;
  return { scale, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
}

export const panBy = (v: View, dx: number, dy: number): View => ({ ...v, x: v.x + dx, y: v.y + dy });

/**
 * Keep the zoomed page covering the screen: you can scroll around a zoomed page but never past its
 * edges (the page is one screen at 100 %, so there is no endless scrolling; use a new page for more room).
 */
export function clampView(v: View, width: number, height: number): View {
  const scale = clampScale(v.scale);
  return {
    scale,
    x: Math.min(0, Math.max(width * (1 - scale), v.x)),
    y: Math.min(0, Math.max(height * (1 - scale), v.y)),
  };
}