import type { Point } from './types';

export const INK_COLOR = '#1f1d1a';

/** Pen colors offered in the toolbar (the first one is the default ink). */
export const PEN_COLORS: readonly { name: string; value: string }[] = [
  { name: 'Ink black', value: INK_COLOR },
  { name: 'Blue', value: '#1f4fd8' },
  { name: 'Red', value: '#c62828' },
  { name: 'Green', value: '#2e7d32' },
  { name: 'Purple', value: '#7b3fb0' },
  { name: 'Orange', value: '#e07a10' },
];

/** Accepts only #rgb / #rrggbb, so a stray value can never reach the canvas style. */
export function sanitizeColor(value: string | undefined): string {
  return value !== undefined && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : INK_COLOR;
}

/** Draw one stroke as a smooth curve (quadratic through midpoints). */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  width: number,
  color: string = INK_COLOR,
): void {
  if (points.length === 0) return;
  const first = points[0] as Point;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (points.length === 1) {
    // a dot (e.g. a decimal point)
    ctx.beginPath();
    ctx.arc(first.x, first.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as Point;
    const n = points[i + 1] as Point;
    ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2);
  }
  const last = points[points.length - 1] as Point;
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}