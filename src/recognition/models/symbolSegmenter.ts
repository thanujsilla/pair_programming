import type { Rect } from '../../ink/bounds';
import type { Stroke } from '../../ink/types';

/** A group of strokes that together make one symbol (a digit, "+", "=", ...). */
export interface SymbolItem {
  kind: 'symbol';
  strokes: Stroke[];
  bounds: Rect;
}

/** A small mark that is probably a decimal point. */
export interface DotItem {
  kind: 'dot';
  bounds: Rect;
}

export type LineItem = SymbolItem | DotItem;

/** Strokes overlapping at least this much (of the narrower one's width) belong to one symbol. */
export const MERGE_OVERLAP = 0.5;
/** A stroke this small compared with the tallest one is a dot, not a symbol. */
export const DOT_RATIO = 0.25;
/** A decimal point sits in the lower part of the line. */
export const DOT_LOW = 0.55;
/** A bar is at least this many times wider than tall. */
export const BAR_ASPECT = 3;
/** Two flat bars on top of each other (an "=") only need to overlap this much: people stagger them. */
export const BAR_MERGE_OVERLAP = 0.2;

/** Bounds of the pen path itself (stroke thickness left out, so the pen width setting cannot matter). */
export function pathBounds(strokes: readonly Stroke[]): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < left) left = p.x;
      if (p.x > right) right = p.x;
      if (p.y < top) top = p.y;
      if (p.y > bottom) bottom = p.y;
    }
  }
  if (!Number.isFinite(left)) return { left: 0, top: 0, right: 0, bottom: 0 };
  return { left, top, right, bottom };
}

const width = (r: Rect) => r.right - r.left;
const height = (r: Rect) => r.bottom - r.top;
const size = (r: Rect) => Math.max(width(r), height(r));

/** Strokes narrower than this (px) are treated as a vertical line at one x position. */
const THIN = 2;

function xOverlapFraction(a: Rect, b: Rect): number {
  const [narrow, other] = width(a) <= width(b) ? [a, b] : [b, a];
  if (width(narrow) < THIN) {
    // a vertical stroke belongs to the other one if it stands inside its span
    const cx = (narrow.left + narrow.right) / 2;
    return cx >= other.left && cx <= other.right ? 1 : 0;
  }
  const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  return overlap <= 0 ? 0 : overlap / width(narrow);
}

/**
 * Split the strokes of one line into symbols and decimal points, left to right.
 * The result does not depend on the order the strokes were drawn in.
 */
export function segmentLine(strokes: readonly Stroke[]): LineItem[] {
  const usable = strokes.filter((s) => s.points.length > 0);
  if (usable.length === 0) return [];

  const boxes = usable.map((s) => pathBounds([s]));
  const tallest = Math.max(...boxes.map(height), 1);
  const lineTop = Math.min(...boxes.map((b) => b.top));
  const lineBottom = Math.max(...boxes.map((b) => b.bottom));
  const isTiny = (b: Rect) => size(b) <= DOT_RATIO * tallest;

  // 1. merge the regular strokes that sit on top of each other
  const regular = usable.map((_, i) => i).filter((i) => !isTiny(boxes[i]));
  const parent = new Map<number, number>(regular.map((i) => [i, i]));
  const find = (i: number): number => {
    let r = i;
    while (parent.get(r) !== r) r = parent.get(r) as number;
    return r;
  };
  const isFlat = (r: Rect) => width(r) >= BAR_ASPECT * Math.max(height(r), 1);
  for (let a = 0; a < regular.length; a++) {
    for (let b = a + 1; b < regular.length; b++) {
      const boxA = boxes[regular[a]];
      const boxB = boxes[regular[b]];
      const need = isFlat(boxA) && isFlat(boxB) ? BAR_MERGE_OVERLAP : MERGE_OVERLAP;
      if (xOverlapFraction(boxA, boxB) >= need) {
        parent.set(find(regular[a]), find(regular[b]));
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (const i of regular) {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  const symbols: SymbolItem[] = [...groups.values()].map((members) => {
    const strokesOf = members.map((i) => usable[i]);
    return { kind: 'symbol', strokes: strokesOf, bounds: pathBounds(strokesOf) };
  });

  // 2. small marks: part of a division sign, a decimal point, or noise
  const dots: DotItem[] = [];
  const isBar = new Set(symbols.filter((s) => s.strokes.length === 1 && width(s.bounds) >= BAR_ASPECT * Math.max(height(s.bounds), 1)));
  const tiny = usable.map((_, i) => i).filter((i) => isTiny(boxes[i]));
  for (const i of tiny) {
    const b = boxes[i];
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    const bar = symbols.find((s) => {
      const w = width(s.bounds);
      return isBar.has(s) && cx >= s.bounds.left - 0.3 * w && cx <= s.bounds.right + 0.3 * w && Math.abs(cy - (s.bounds.top + s.bounds.bottom) / 2) <= 0.6 * w + tallest * 0.3;
    });
    if (bar) {
      bar.strokes.push(usable[i]);
      bar.bounds = pathBounds(bar.strokes);
    } else if (symbols.length > 0 && cy >= lineTop + DOT_LOW * (lineBottom - lineTop)) {
      dots.push({ kind: 'dot', bounds: b });
    }
    // anything else (a speck high up, or a line with nothing but specks) is ignored
  }

  const items: LineItem[] = [...symbols, ...dots];
  items.sort((a, b) => a.bounds.left + a.bounds.right - (b.bounds.left + b.bounds.right));
  return items;
}