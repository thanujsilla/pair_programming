import type { Stroke } from '../../ink/types';
import { pathBounds } from './symbolSegmenter';

/** A "/" is a nearly straight stroke leaning this much (degrees from flat). */
const MIN_LEAN = 25;
const MAX_LEAN = 75;
/** chord length / path length: how straight it must be */
const MIN_STRAIGHT = 0.9;
/** at least this tall compared with the other strokes' median height */
const MIN_HEIGHT = 0.8;
/** air left on each side of the slash after separating (in tallest-stroke heights) */
const AIR = 0.15;

const rect = (s: Stroke) => pathBounds([s]);

function pathLength(s: Stroke): number {
  let len = 0;
  for (let i = 1; i < s.points.length; i++) len += Math.hypot(s.points[i]!.x - s.points[i - 1]!.x, s.points[i]!.y - s.points[i - 1]!.y);
  return len;
}

/** Does the straight stroke rise to the right at a slash-like angle? */
function isSlashShape(s: Stroke): boolean {
  if (s.points.length < 2) return false;
  const a = s.points[0]!;
  const b = s.points[s.points.length - 1]!;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const rising = (b.x - a.x) * (b.y - a.y) < 0; // one end is right and up of the other
  const lean = (Math.atan2(dy, dx) * 180) / Math.PI;
  const len = pathLength(s);
  return rising && lean >= MIN_LEAN && lean <= MAX_LEAN && len > 0 && Math.hypot(dx, dy) / len >= MIN_STRAIGHT;
}

function segmentsCross(a: Stroke, b: Stroke): boolean {
  const A = rect(a);
  const B = rect(b);
  // two straight strokes cross when their boxes overlap and each one's ends lie on opposite sides of the other
  if (A.right < B.left || B.right < A.left || A.bottom < B.top || B.bottom < A.top) return false;
  const side = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const [a0, a1] = [a.points[0]!, a.points[a.points.length - 1]!];
  const [b0, b1] = [b.points[0]!, b.points[b.points.length - 1]!];
  return side(a0, a1, b0) !== side(a0, a1, b1) && side(b0, b1, a0) !== side(b0, b1, a1);
}

const shift = (s: Stroke, dx: number): Stroke => ({ ...s, points: s.points.map((p) => ({ ...p, x: p.x + dx })) });

const xOverlap = (a: { left: number; right: number }, b: { left: number; right: number }) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left);

/** Overlapping area as a share of the smaller box (0..1). */
function boxOverlap(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const small = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top));
  return small > 0 ? (w * h) / small : 0;
}

/** Chord leans like a slash or backslash (any straightness): part of an ×, a 7's stem, a slash. */
function leansLikeDiagonal(s: Stroke): boolean {
  if (s.points.length < 2) return false;
  const a = s.points[0]!;
  const b = s.points[s.points.length - 1]!;
  const lean = (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
  return lean >= MIN_LEAN && lean <= MAX_LEAN;
}

function isDivisionSlash(s: Stroke, all: readonly Stroke[]): boolean {
  if (!isSlashShape(s)) return false;
  const others = all.filter((o) => o !== s);
  if (others.length === 0) return false;
  const b = rect(s);
  const heights = others.map((o) => rect(o)).map((r) => r.bottom - r.top).sort((x, y) => x - y);
  if (b.bottom - b.top < MIN_HEIGHT * (heights[heights.length >> 1] as number)) return false;
  // "×": another slanted stroke crosses it, or sits on top of it
  if (others.some((o) => (isSlashShape(o) || isBackSlash(o)) && segmentsCross(s, o))) return false;
  if (others.some((o) => leansLikeDiagonal(o) && boxOverlap(rect(o), b) >= 0.4)) return false;
  // two strokes drawn on the same spot with about the same size are one symbol (the two halves of an ×)
  const big = Math.max(b.right - b.left, b.bottom - b.top);
  if (
    others.some((o) => {
      const r = rect(o);
      const size = Math.max(r.right - r.left, r.bottom - r.top);
      const dist = Math.hypot((r.left + r.right) / 2 - (b.left + b.right) / 2, (r.top + r.bottom) / 2 - (b.top + b.bottom) / 2);
      return size >= 0.6 * big && size <= 1.6 * big && dist <= 0.25 * big;
    })
  )
    return false;
  // only worth fixing when it really leans over a neighbouring digit
  if (!others.some((o) => !leansLikeDiagonal(o) && xOverlap(rect(o), b) > 0)) return false;
  // a 7: a flat bar sits on the top end
  const topEnd = s.points.reduce((t, p) => (p.y < t.y ? p : t), s.points[0]!);
  const w = b.right - b.left;
  return !others.some((o) => {
    const r = rect(o);
    const flat = r.right - r.left >= 3 * Math.max(r.bottom - r.top, 1);
    return flat && topEnd.x >= r.left - 0.1 * w && topEnd.x <= r.right + 0.1 * w && Math.abs(topEnd.y - (r.top + r.bottom) / 2) <= 0.3 * (b.bottom - b.top);
  });
}

/** The "÷" that replaces a slash is this long, as a fraction of the tallest other symbol. */
const DIV_LEN = 0.45;
/** its dots sit this far from the bar, as a fraction of the bar length */
const DIV_DOT = 0.4;

const stroke = (id: string, from: { x: number; y: number }, to: { x: number; y: number }, like: Stroke): Stroke => ({
  id,
  width: like.width,
  ...(like.color ? { color: like.color } : {}),
  points: [
    { x: from.x, y: from.y, t: 0, p: 0.5 },
    { x: to.x, y: to.y, t: 10, p: 0.5 },
  ],
});

/**
 * People write division as a slash that leans over its neighbours ("1/0" with the slash cutting into the 1
 * and the 0), and the model cannot read that. A slash means "÷", so it is redrawn as a small "÷" (bar and two dots)
 * in the same place, and the left and right parts of the line are moved apart to make room.
 * Crossed diagonals ("×") and a 7's stem are left alone. New strokes get ids `<slash id>~bar|up|down`.
 */
export function separateSlashes(strokes: readonly Stroke[]): readonly Stroke[] {
  let current = [...strokes];
  const slashIds = strokes.filter((s) => isDivisionSlash(s, strokes)).map((s) => s.id);

  for (const id of slashIds) {
    const slash = current.find((s) => s.id === id);
    if (!slash) continue;
    const sb = rect(slash);
    const cx = (sb.left + sb.right) / 2;
    const cy = (sb.top + sb.bottom) / 2;
    const rest = current.filter((o) => o !== slash);
    const tallest = Math.max(0, ...rest.map((o) => rect(o).bottom - rect(o).top));
    const len = DIV_LEN * tallest;
    const air = AIR * tallest;
    const left = rest.filter((o) => (rect(o).left + rect(o).right) / 2 < cx);
    const right = rest.filter((o) => (rect(o).left + rect(o).right) / 2 >= cx);
    const dl = left.length ? Math.max(0, Math.max(...left.map((o) => rect(o).right)) - (cx - len / 2 - air)) : 0;
    const dr = right.length ? Math.max(0, cx + len / 2 + air - Math.min(...right.map((o) => rect(o).left))) : 0;
    const lset = new Set(left);
    const rset = new Set(right);
    const off = DIV_DOT * len;
    const sign = [
      stroke(`${id}~bar`, { x: cx - len / 2, y: cy }, { x: cx + len / 2, y: cy }, slash),
      stroke(`${id}~up`, { x: cx, y: cy - off }, { x: cx + 1, y: cy - off }, slash),
      stroke(`${id}~down`, { x: cx, y: cy + off }, { x: cx + 1, y: cy + off }, slash),
    ];
    current = current.flatMap((s) => (s === slash ? sign : lset.has(s) ? [shift(s, -dl)] : rset.has(s) ? [shift(s, dr)] : [s]));
  }
  return current;
}

/** A straight stroke leaning the other way ("\"). */
function isBackSlash(s: Stroke): boolean {
  const a = s.points[0]!;
  const b = s.points[s.points.length - 1]!;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const lean = (Math.atan2(dy, dx) * 180) / Math.PI;
  const len = pathLength(s);
  return (b.x - a.x) * (b.y - a.y) > 0 && lean >= MIN_LEAN && lean <= MAX_LEAN && len > 0 && Math.hypot(dx, dy) / len >= MIN_STRAIGHT;
}
