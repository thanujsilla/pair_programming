import type { Rect } from './bounds';

export type AnswerKind = 'ok' | 'undefined' | 'error' | 'running';

/** What to draw next to a line. `anchor` is the ink the answer sits beside. */
export interface AnswerLabel {
  text: string;
  kind: AnswerKind;
  anchor: Rect;
  /** height of a digit in this line, when the anchor alone (a tilted line's "=") does not show it */
  glyphHeight?: number;
  /**
   * For a line that is not written left to right: where the answer text starts (just past the "=",
   * gap included) and the direction it runs in, so the answer is turned the same way as the "=".
   */
  from?: { x: number; y: number };
  angle?: number;
  /** A column of upright glyphs: the answer goes upright below (read downwards) or above (read upwards) the "=" */
  side?: 'below' | 'above';
  /** 0..1 from the recognition model, when it reports one */
  confidence?: number;
}

/** Below this the model is unsure of what it read, so the answer is drawn faded with a "?". */
export const LOW_CONFIDENCE = 0.8;

export const isLowConfidence = (label: Pick<AnswerLabel, 'confidence' | 'kind'>): boolean =>
  label.kind === 'ok' && label.confidence !== undefined && label.confidence < LOW_CONFIDENCE;

/** Identity of a shown answer: a new key means a new answer, which gets the write-in animation. */
export const answerKey = (label: AnswerLabel): string =>
  `${Math.round(label.anchor.right)}:${Math.round(label.anchor.top)}:${label.kind}:${label.text}`;

export const ANSWER_GAP = 14;
const EDGE_MARGIN = 8;

/**
 * The answer is written as big as the handwriting it follows: digits of the handwritten height.
 * (A handwriting font's digits are about 0.75 of its font size tall, hence the factor.)
 */
export const ANSWER_SIZE_FACTOR = 1.3;

/** Font size for an answer, from the height of one digit in the line (page units). */
export function answerFontSize(anchor: Rect, glyphHeight?: number): number {
  const h = glyphHeight ?? anchor.bottom - anchor.top;
  return Math.max(12, h * ANSWER_SIZE_FACTOR);
}

/**
 * Where to draw the answer text (vertically centred, left-aligned).
 * Normally just right of the anchor; if it would run off the canvas it goes
 * under the line instead.
 */
export function layoutAnswer(
  anchor: Rect,
  textWidth: number,
  canvasWidth: number,
  fontSize: number,
): { x: number; y: number } {
  const x = anchor.right + ANSWER_GAP;
  if (x + textWidth <= canvasWidth - EDGE_MARGIN) {
    return { x, y: (anchor.top + anchor.bottom) / 2 };
  }
  return { x: anchor.left, y: anchor.bottom + fontSize * 0.7 };
}
/** Upright answer under or over the anchor (the "=" of a vertical column), left-aligned with it. */
export function layoutAnswerSide(anchor: Rect, fontSize: number, side: 'below' | 'above'): { x: number; y: number } {
  return side === 'below'
    ? { x: anchor.left, y: anchor.bottom + ANSWER_GAP + fontSize * 0.5 }
    : { x: anchor.left, y: anchor.top - ANSWER_GAP - fontSize * 0.5 };
}

/** A typical handwriting font's stems are about this fraction of its size thick. */
const NATIVE_STEM = 0.07;

/**
 * Extra outline (in page units) that makes the answer's strokes as thick as the user's pen. Never negative:
 * a font cannot be made thinner than it is.
 */
export function answerOutline(fontSize: number, penWidth?: number): number {
  if (penWidth === undefined || !(penWidth > 0)) return 0;
  return Math.max(0, penWidth - fontSize * NATIVE_STEM);
}