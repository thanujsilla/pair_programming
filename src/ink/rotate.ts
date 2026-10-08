import { strokeBounds, unionRect, type Rect } from './bounds';
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

/**
 * How tall one handwritten digit is: the median height of the upright strokes, ignoring flat bars
 * (minus, equals, fraction bars) and dots. This is what the answer is sized by, so it matches the
 * digits however long a fraction bar or an "=" happens to be.
 */
export function digitHeight(boxes: readonly Rect[]): number {
  const upright = boxes.map((b) => ({ h: b.bottom - b.top, w: b.right - b.left })).filter(({ h, w }) => h >= 0.5 * w);
  if (upright.length === 0) return typicalSize(boxes);
  const tallest = Math.max(...upright.map((u) => u.h));
  const heights = upright.map((u) => u.h).filter((h) => h >= 0.45 * tallest);
  return median(heights);
}

/** Rotate a point by `angle` (radians) around `about`. */
export function rotatePoint(x: number, y: number, cos: number, sin: number, about: Pt): Pt {
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

const STEEP_BAND = (30 * Math.PI) / 180; // "vertical" writing: within this of straight up/down
const FLAT_BAR = 2; // a bar is at least this many times wider than tall

/** Centres of the strokes, plus the typical glyph size (0 when there is nothing to measure). */
function measure(strokes: readonly Stroke[]): { centres: Pt[]; size: number } {
  const boxes = strokes.map(strokeBounds);
  return { centres: boxes.map(rectCentre), size: typicalSize(boxes) };
}

/**
 * Do these ink strokes form an "=" (two flat bars one above the other)? Returns the x of each
 * such pair. Used to tell which end of a line is its end: the "=" comes last.
 */
function equalsPairs(flat: readonly Stroke[], size: number): Pt[] {
  const bars = flat
    .map(strokeBounds)
    .filter((b) => b.right - b.left >= FLAT_BAR * Math.max(b.bottom - b.top, 1) && b.right - b.left >= 0.3 * size);
  const out: Pt[] = [];
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      const a = bars[i] as Rect;
      const b = bars[j] as Rect;
      const wa = a.right - a.left;
      const wb = b.right - b.left;
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (overlap < 0.6 * Math.min(wa, wb) || Math.min(wa, wb) < 0.6 * Math.max(wa, wb)) continue;
      const dy = Math.abs(rectCentre(a).y - rectCentre(b).y);
      const w = (wa + wb) / 2;
      if (dy < 0.05 * w || dy > 0.9 * w || dy > 0.8 * size) continue;
      out.push({ x: (rectCentre(a).x + rectCentre(b).x) / 2, y: (rectCentre(a).y + rectCentre(b).y) / 2 });
    }
  }
  return out;
}

/**
 * Which end of an (already straightened) line holds the "="? 1 = right (normal reading),
 * -1 = left (the writing runs the other way), 0 = cannot tell.
 */
function equalsEnd(flat: readonly Stroke[]): 1 | -1 | 0 {
  const { size } = measure(flat);
  if (size <= 0) return 0;
  const boxes = flat.map(strokeBounds);
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.right));
  const xs = equalsPairs(flat, size).map((p) => p.x);
  const atRight = xs.some((x) => x >= right - 1.2 * size);
  const atLeft = xs.some((x) => x <= left + 1.2 * size);
  if (atRight) return 1;
  return atLeft ? -1 : 0;
}

/**
 * Writing that runs (nearly) straight down the page, e.g. a whole equation turned a quarter
 * turn. Directions between pairs of stroke centres, measured from the vertical; same
 * consistency rules as for flat writing. Returns the reading angle for top-to-bottom (about
 * +90 deg), or 0 when the strokes do not form a steep line.
 */
export function estimateSteepAngle(strokes: readonly Stroke[]): number {
  if (strokes.length < 3) return 0;
  const { centres, size } = measure(strokes);
  if (size <= 0) return 0;
  const xs = centres.map((c) => c.x);
  const ys = centres.map((c) => c.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  if (spanY < 1.2 * spanX) return 0; // cheap rejection: not taller than wide

  const sorted = [...centres].sort((a, b) => a.y - b.y);
  const angles: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i] as Pt;
      const b = sorted[j] as Pt;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dy < 0.3 * size || Math.hypot(dx, dy) < 0.6 * size) continue;
      angles.push(Math.atan2(dx, dy)); // measured from straight down
    }
  }
  if (angles.length === 0) return 0;
  const m = median(angles);
  const agree = angles.filter((a) => Math.abs(a - m) <= CONSISTENT_WITHIN).length;
  if (agree / angles.length < MIN_CONSISTENT_SHARE) return 0;
  if (Math.abs(m) > STEEP_BAND) return 0;
  return Math.PI / 2 - m;
}

/**
 * For a column of upright glyphs: is the "=" (two flat bars) at the bottom (1) or the top (-1) of the
 * column? 0 when there is none.
 */
function equalsEndVertical(strokes: readonly Stroke[]): 1 | -1 | 0 {
  const { size } = measure(strokes);
  if (size <= 0) return 0;
  const pairs = equalsPairs(strokes, size);
  if (pairs.length === 0) return 0;
  const boxes = strokes.map(strokeBounds);
  const top = Math.min(...boxes.map((b) => b.top));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  if (pairs.some((p) => p.y >= bottom - 1.2 * size)) return 1;
  return pairs.some((p) => p.y <= top + 1.2 * size) ? -1 : 0;
}

/**
 * Steep writing may run downwards (normal for a turned page) or upwards: the "=" decides. The "=" is
 * either two upright bars standing at one end (the glyphs were turned too) or two flat bars at the
 * bottom/top (a column of upright glyphs).
 */
function steepDirection(strokes: readonly Stroke[], down: number): number {
  const turned = equalsEnd(straighten(strokes, down));
  if (turned !== 0) return turned === -1 ? down - Math.PI : down;
  return equalsEndVertical(strokes) === -1 ? down - Math.PI : down;
}

/** Like `estimateAngle`, but only for steep (vertical) writing, with its direction decided. 0 if not steep. */
export function estimateSteepDirected(strokes: readonly Stroke[]): number {
  const steep = estimateSteepAngle(strokes);
  return steep === 0 ? 0 : steepDirection(strokes, steep);
}

/**
 * Level a rising or falling line by shearing instead of turning it: every point moves straight up
 * or down so the baseline becomes horizontal. Upright strokes (the digits) stay upright and strokes
 * drawn along the slope (the bars of "=" and "+") become flat. Turning keeps shapes but tilts the
 * digits; shearing keeps the digits upright but slants curves, so the recogniser is given both.
 * Only meaningful for gentle slopes (|angle| < 60 deg).
 */
export function shearLevel(strokes: readonly Stroke[], angle: number): Stroke[] {
  if (angle === 0) return [...strokes];
  const slope = Math.tan(angle);
  const about = centreOf(strokes);
  return strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p, y: p.y - slope * (p.x - about.x) })),
  }));
}

/**
 * Which way is this writing running? Radians; 0 = flat and left to right, negative = rising to
 * the right, about +90 deg = reading downwards, about -90 deg = reading upwards, 180 deg = upside down.
 * Flat and slightly tilted writing: robust median (Theil-Sen) of the directions between pairs of
 * stroke centres. Steep writing: see `estimateSteepAngle`. Returns 0 when there is not enough ink,
 * or when the pairs disagree (two short rows stacked on top of each other are not one tilted line).
 */
export function estimateAngle(strokes: readonly Stroke[]): number {
  const flat = estimateFlatAngle(strokes);
  if (flat !== 0) return flat;
  const steep = estimateSteepAngle(strokes);
  if (steep !== 0) return steepDirection(strokes, steep);
  // flat but upside down: the "=" is at the left end and nowhere else
  if (strokes.length >= 4 && equalsEnd(strokes) === -1) return Math.PI;
  return 0;
}

function estimateFlatAngle(strokes: readonly Stroke[]): number {
  if (strokes.length < 3) return 0;
  const { centres: unsorted, size } = measure(strokes);
  if (size <= 0) return 0;
  const centres = [...unsorted].sort((a, b) => a.x - b.x);

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

const JOIN_GAP = 0.4; // flat bars or dots this close (in digit heights) along the column belong to one symbol
const SMALL = 0.3; // a mark smaller than this many digit heights, in both directions, is a dot

/**
 * Lay a column of UPRIGHT glyphs out as a row, keeping each glyph upright: strokes are grouped into
 * symbols along the column, then each symbol is moved sideways into reading order on one level.
 * `angle` > 0 means the column is read from the top down, < 0 from the bottom up.
 */
export function stackLevel(strokes: readonly Stroke[], angle: number): Stroke[] {
  if (strokes.length === 0) return [];
  const boxes = strokes.map(strokeBounds);
  const digit = digitHeight(boxes);
  const flat = (b: Rect) => b.right - b.left >= FLAT_BAR * Math.max(b.bottom - b.top, 1);
  const small = (b: Rect) => b.right - b.left <= SMALL * digit && b.bottom - b.top <= SMALL * digit;

  // symbols = runs of strokes that overlap along the column (or are the bars/dots of one symbol)
  const order = strokes.map((_, i) => i).sort((i, j) => (boxes[i] as Rect).top - (boxes[j] as Rect).top);
  const groups: { idx: number[]; top: number; bottom: number; last: Rect }[] = [];
  for (const i of order) {
    const b = boxes[i] as Rect;
    const g = groups[groups.length - 1];
    const gap = g ? b.top - g.bottom : Infinity;
    const near = g !== undefined && gap <= JOIN_GAP * digit && (flat(b) && flat(g.last) ? true : small(b) || small(g.last));
    if (g && (gap <= 0 || near)) {
      g.idx.push(i);
      g.bottom = Math.max(g.bottom, b.bottom);
      g.last = b;
    } else {
      groups.push({ idx: [i], top: b.top, bottom: b.bottom, last: b });
    }
  }
  if (angle < 0) groups.reverse(); // read from the bottom up

  // place the symbols left to right, on a common level, keeping the spacing the column had
  const moved = new Map<number, { dx: number; dy: number }>();
  let cursor = 0;
  let prevGap = 0;
  groups.forEach((g, k) => {
    const gb = g.idx.map((i) => boxes[i] as Rect).reduce(unionRect);
    const w = gb.right - gb.left;
    if (k > 0) cursor += Math.min(1.5 * digit, Math.max(0.2 * digit, prevGap));
    const cx = cursor + w / 2;
    for (const i of g.idx) moved.set(i, { dx: cx - (gb.left + gb.right) / 2, dy: -(gb.top + gb.bottom) / 2 });
    cursor += w;
    const next = groups[k + 1];
    prevGap = next ? (angle < 0 ? g.top - next.bottom : next.top - g.bottom) : 0;
  });
  return strokes.map((s, i) => {
    const m = moved.get(i) as { dx: number; dy: number };
    return { ...s, points: s.points.map((p) => ({ ...p, x: p.x + m.dx, y: p.y + m.dy })) };
  });
}