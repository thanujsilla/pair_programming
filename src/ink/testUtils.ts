import type { Point, Stroke } from './types';

/** Straight test stroke from (x0,y0) to (x1,y1) with n points. */
export function line(id: string, x0: number, y0: number, x1: number, y1: number, n = 21, width = 2): Stroke {
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    points.push({ x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, t: i * 10, p: 0.5 });
  }
  return { id, points, width };
}

export function dot(id: string, x: number, y: number, width = 4): Stroke {
  return { id, points: [{ x, y, t: 0, p: 0.5 }], width };
}

/** `1 + 4 =` style strokes laid out along a line at `angle`. */
export function tiltedEquation(angle: number, prefix = 't'): Stroke[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (i: number, u: number, v: number) => {
    const x = i * 85 + u * 55;
    const y = (v - 0.5) * 70;
    return [400 + x * c - y * s, 400 + x * s + y * c] as const;
  };
  const seg = (id: string, i: number, a: readonly [number, number], b: readonly [number, number]) => {
    const [x0, y0] = at(i, ...a);
    const [x1, y1] = at(i, ...b);
    return line(`${prefix}${id}`, x0, y0, x1, y1);
  };
  return [
    seg('1', 0, [0.5, 0], [0.5, 1]),
    seg('+h', 1, [0, 0.5], [1, 0.5]),
    seg('+v', 1, [0.5, 0.2], [0.5, 0.8]),
    seg('4a', 2, [0.7, 0], [0, 0.7]),
    seg('4b', 2, [0, 0.7], [1, 0.7]),
    seg('4c', 2, [0.7, 0.2], [0.7, 1]),
    seg('=1', 3, [0, 0.35], [1, 0.35]),
    seg('=2', 3, [0, 0.65], [1, 0.65]),
  ];
}
