import type { Rect } from './bounds';

export type AnswerKind = 'ok' | 'undefined' | 'error' | 'running';

/** What to draw next to a line. `anchor` is the ink the answer sits beside. */
export interface AnswerLabel {
  text: string;
  kind: AnswerKind;
  anchor: Rect;
  /** height of a digit in this line, when the anchor alone (a tilted line's "=") does not show it */
  glyphHeight?: number;
}

export const ANSWER_GAP = 14;
const EDGE_MARGIN = 8;

/** Answer text is about as tall as the handwriting it follows. */
export function answerFontSize(anchor: Rect, glyphHeight?: number): number {
  const h = glyphHeight ?? anchor.bottom - anchor.top;
  return Math.min(64, Math.max(24, h * 0.9));
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