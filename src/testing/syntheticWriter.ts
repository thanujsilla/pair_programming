import type { Point, Stroke } from '../ink/types';
import { between, gauss, makeRng } from './rng';

type P = readonly [number, number];

interface Glyph {
  /** control points of each stroke, in a unit box (x right, y down) */
  strokes: readonly (readonly P[])[];
  /** size relative to the text height */
  w: number;
  h: number;
  /** vertical centre, as a fraction of the text height above the baseline */
  centre: number;
  /** space after the symbol, relative to the text height */
  advance: number;
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 14): P[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + rx * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2), cy + ry * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2)] as P);

const DIGIT = { w: 0.6, h: 1, centre: 0.5, advance: 0.35 };
const OP = { centre: 0.45, advance: 0.35 };

/** Simple single-stroke letterforms. Clean and unusual-free on purpose: this is test data, not real handwriting. */
const GLYPHS: Record<string, Glyph> = {
  '0': { ...DIGIT, strokes: [ellipse(0.5, 0.5, 0.45, 0.5)] },
  '1': { ...DIGIT, w: 0.35, strokes: [[[0.1, 0.28], [0.6, 0.0], [0.6, 1.0]]] },
  '2': { ...DIGIT, strokes: [[[0.1, 0.25], [0.3, 0.02], [0.7, 0.05], [0.88, 0.3], [0.1, 1.0], [0.92, 1.0]]] },
  '3': { ...DIGIT, strokes: [[[0.1, 0.1], [0.5, 0.0], [0.85, 0.2], [0.45, 0.5], [0.9, 0.75], [0.5, 1.0], [0.1, 0.9]]] },
  '4': { ...DIGIT, strokes: [[[0.6, 0.0], [0.05, 0.65], [0.95, 0.65]], [[0.65, 0.3], [0.65, 1.0]]] },
  '5': { ...DIGIT, strokes: [[[0.85, 0.0], [0.2, 0.0], [0.15, 0.45], [0.6, 0.4], [0.9, 0.65], [0.6, 1.0], [0.1, 0.9]]] },
  '6': { ...DIGIT, strokes: [[[0.8, 0.05], [0.35, 0.3], [0.15, 0.7], [0.4, 1.0], [0.8, 0.85], [0.7, 0.55], [0.2, 0.6]]] },
  '7': { ...DIGIT, strokes: [[[0.1, 0.05], [0.9, 0.05], [0.4, 1.0]]] },
  '8': { ...DIGIT, strokes: [[...ellipse(0.5, 0.25, 0.33, 0.25), ...ellipse(0.5, 0.74, 0.42, 0.26)]] },
  '9': { ...DIGIT, strokes: [[[0.2, 0.95], [0.65, 0.7], [0.85, 0.3], [0.6, 0.0], [0.2, 0.15], [0.3, 0.45], [0.8, 0.4]]] },
  '+': { ...OP, w: 0.55, h: 0.55, strokes: [[[0, 0.5], [1, 0.5]], [[0.5, 0], [0.5, 1]]] },
  '−': { ...OP, w: 0.5, h: 0.02, strokes: [[[0, 0.5], [1, 0.5]]] },
  '×': { ...OP, w: 0.5, h: 0.5, strokes: [[[0.1, 0.1], [0.9, 0.9]], [[0.9, 0.1], [0.1, 0.9]]] },
  '÷': { ...OP, w: 0.55, h: 0.62, strokes: [[[0, 0.5], [1, 0.5]], [[0.5, 0.1], [0.5, 0.1]], [[0.5, 0.9], [0.5, 0.9]]] },
  '=': { ...OP, w: 0.55, h: 0.32, strokes: [[[0, 0.1], [1, 0.1]], [[0, 0.9], [1, 0.9]]] },
  '.': { w: 0.04, h: 0.04, centre: 0.03, advance: 0.25, strokes: [[[0.5, 0.5]]] },
};

/** Catmull-Rom curve through the control points. */
function smooth(points: readonly P[], perSegment = 6): P[] {
  if (points.length < 2) return [...points];
  const out: P[] = [];
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export interface WriteOptions {
  /** x of the first symbol */
  x?: number;
  /** y of the baseline */
  baseline?: number;
  /** height of a digit, in pixels */
  height?: number;
  /** 0 = tidy, 1 = shaky (default 0.5) */
  messiness?: number;
  width?: number;
}

/** "Handwrite" a line of text as strokes. Same seed, same ink. */
export function writeExpression(text: string, seed: number, opts: WriteOptions = {}): Stroke[] {
  const rng = makeRng(seed);
  const H = opts.height ?? 60;
  const baseline = opts.baseline ?? 140;
  const mess = opts.messiness ?? 0.5;
  let x = opts.x ?? 40;
  let t = 0;
  let n = 0;
  const strokes: Stroke[] = [];

  for (const ch of Array.from(text)) {
    const g = GLYPHS[ch];
    if (!g) continue;
    const sw = 1 + gauss(rng) * 0.07 * (0.4 + mess);
    const sh = 1 + gauss(rng) * 0.07 * (0.4 + mess);
    const gw = Math.max(g.w * H * sw, 1);
    const gh = Math.max(g.h * H * sh, 1);
    const angle = (gauss(rng) * 3 * (0.4 + mess) * Math.PI) / 180;
    const shear = gauss(rng) * 0.06 * (0.4 + mess);
    const cy = baseline - g.centre * H + gauss(rng) * 0.025 * H * mess;
    const cx = x + gw / 2;
    const jitter = 0.03 * mess;

    for (const control of g.strokes) {
      const wobbled: P[] = control.map(([u, v]) => [u + gauss(rng) * jitter, v + gauss(rng) * jitter] as P);
      const pts = control.length === 1 ? [wobbled[0], wobbled[0], wobbled[0]] : smooth(wobbled);
      const points: Point[] = pts.map(([u, v]) => {
        let px = (u - 0.5) * gw;
        const py = (v - 0.5) * gh;
        px += -py * shear;
        const rx = px * Math.cos(angle) - py * Math.sin(angle);
        const ry = px * Math.sin(angle) + py * Math.cos(angle);
        t += 8;
        return { x: cx + rx + gauss(rng) * 0.004 * H, y: cy + ry + gauss(rng) * 0.004 * H, t, p: 0.5 };
      });
      strokes.push({ id: `syn-${seed}-${n++}`, points, width: opts.width ?? 3 });
      t += 120;
    }
    x += gw + (g.advance + between(rng, -0.08, 0.12)) * H;
  }
  return strokes;
}