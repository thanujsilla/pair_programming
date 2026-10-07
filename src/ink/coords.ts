/** Guard against 0, NaN or absurd devicePixelRatio values. */
export function sanitizeDpr(dpr: number): number {
  return Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 4) : 1;
}

/** Pointer position (client coordinates) -> position inside the canvas, in CSS pixels. */
export function clientToLocal(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
): { x: number; y: number } {
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/**
 * Size of the canvas backing store for a given CSS size and devicePixelRatio.
 * scaleX/scaleY are the exact CSS->device factors (they differ slightly from dpr
 * after rounding), so drawing stays aligned at fractional ratios like 1.25 or 1.5.
 */
export function backingSize(cssWidth: number, cssHeight: number, dpr: number) {
  const d = sanitizeDpr(dpr);
  const width = Math.max(1, Math.round(cssWidth * d));
  const height = Math.max(1, Math.round(cssHeight * d));
  return { width, height, scaleX: width / Math.max(1, cssWidth), scaleY: height / Math.max(1, cssHeight) };
}

/** CSS-pixel position -> device-pixel position. */
export function localToDevice(x: number, y: number, dpr: number): { x: number; y: number } {
  const d = sanitizeDpr(dpr);
  return { x: x * d, y: y * d };
}