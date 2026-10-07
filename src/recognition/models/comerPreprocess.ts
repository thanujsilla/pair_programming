import type { Stroke } from '../../ink/types';

/** Geometry of the model input (same conventions as ink-on / CROHME training images). */
export const MODEL_H = 256;
export const MAX_W = 1024;
export const MIN_W = 128;
export const W_ALIGN = 64;
export const TARGET_H = 128;
export const PAD = 16;
/** pen thickness in model pixels; measured on 300 test lines: 2px 88%, 3px 93%, 4.5px 96% */
export const DEFAULT_STROKE_PX = 4;

export interface RenderPlan {
  minX: number;
  minY: number;
  /** source -> model pixel scale */
  scale: number;
  /** size of the written content in model pixels */
  contentW: number;
  contentH: number;
  /** width of the whole model image (multiple of 64) */
  canvasW: number;
}

/** Work out how to scale and place the strokes. Returns null when there is nothing to draw. */
export function planRender(strokes: readonly Stroke[]): RenderPlan | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return null;

  const rawW = Math.max(1, Math.ceil(maxX - minX)) + PAD * 2;
  const rawH = Math.max(1, Math.ceil(maxY - minY)) + PAD * 2;
  const scale = Math.min(TARGET_H / rawH, MAX_W / rawW);
  const contentW = Math.max(1, Math.round(rawW * scale));
  const contentH = Math.max(1, Math.round(rawH * scale));
  const canvasW = Math.min(MAX_W, Math.max(MIN_W, Math.ceil((contentW + PAD) / W_ALIGN) * W_ALIGN));
  return { minX, minY, scale, contentW, contentH, canvasW };
}

/** Points spaced `interval` apart along the path (keeps the first and last point). */
export function resamplePoints<P extends { x: number; y: number }>(points: readonly P[], interval: number): { x: number; y: number }[] {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const out = [{ x: points[0].x, y: points[0].y }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    let d = interval - carry;
    while (d <= dist) {
      out.push({ x: a.x + (dx * d) / dist, y: a.y + (dy * d) / dist });
      d += interval;
    }
    carry = dist - (d - interval);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (tail.x !== last.x || tail.y !== last.y) out.push({ x: last.x, y: last.y });
  return out;
}

/** The model's input tensors. */
export interface ModelInput {
  tensor: Float32Array; // [1,1,H,W] grayscale 0..1, white ink on black
  mask: Uint8Array; // [1,H,W] 1 = padding
  height: number;
  width: number;
}

/** Build the padding mask: 0 inside the written area, 1 elsewhere. */
export function buildMask(plan: Pick<RenderPlan, 'contentW' | 'contentH' | 'canvasW'>): Uint8Array {
  const mask = new Uint8Array(MODEL_H * plan.canvasW);
  for (let y = 0; y < MODEL_H; y++) {
    for (let x = 0; x < plan.canvasW; x++) {
      mask[y * plan.canvasW + x] = y < plan.contentH && x < plan.contentW ? 0 : 1;
    }
  }
  return mask;
}

/** Draw the strokes into a canvas and read it back as model input. Works in a worker (OffscreenCanvas). */
export function strokesToInput(strokes: readonly Stroke[], strokePx = DEFAULT_STROKE_PX): ModelInput | null {
  const plan = planRender(strokes);
  if (!plan) return null;
  const canvas = new OffscreenCanvas(plan.canvasW, MODEL_H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, plan.canvasW, MODEL_H);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokePx;

  const map = (p: { x: number; y: number }) => ({
    x: (p.x - plan.minX + PAD) * plan.scale,
    y: (p.y - plan.minY + PAD) * plan.scale,
  });

  for (const s of strokes) {
    if (s.points.length === 0) continue;
    const pts = resamplePoints(s.points.map(map), 2);
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, strokePx / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }
    ctx.stroke();
  }

  const { data } = ctx.getImageData(0, 0, plan.canvasW, MODEL_H);
  const tensor = new Float32Array(plan.canvasW * MODEL_H);
  for (let i = 0; i < tensor.length; i++) {
    const o = i * 4;
    tensor[i] = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
  }
  return { tensor, mask: buildMask(plan), height: MODEL_H, width: plan.canvasW };
}