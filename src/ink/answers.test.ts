import { describe, expect, it } from 'vitest';
import { ANSWER_GAP, ANSWER_SIZE_FACTOR, answerFontSize, answerOutline, layoutAnswer } from './answers';

const anchor = { left: 100, top: 100, right: 300, bottom: 140 };

describe('answerFontSize', () => {
  it('scales with the size of the handwriting, with no upper limit', () => {
    expect(answerFontSize(anchor, 40)).toBeCloseTo(40 * ANSWER_SIZE_FACTOR);
    expect(answerFontSize(anchor, 120)).toBeCloseTo(120 * ANSWER_SIZE_FACTOR);
    expect(answerFontSize(anchor, 300)).toBeCloseTo(300 * ANSWER_SIZE_FACTOR);
  });

  it('is twice as big for handwriting twice as big', () => {
    expect(answerFontSize(anchor, 80) / answerFontSize(anchor, 40)).toBeCloseTo(2);
  });

  it('falls back to the anchor height, and never gets unreadably small', () => {
    expect(answerFontSize(anchor)).toBeCloseTo(40 * ANSWER_SIZE_FACTOR);
    expect(answerFontSize({ left: 0, top: 0, right: 5, bottom: 4 })).toBe(12);
  });
});

describe('layoutAnswer', () => {
  it('sits right of the line, vertically centred', () => {
    expect(layoutAnswer(anchor, 40, 800, 36)).toEqual({ x: 300 + ANSWER_GAP, y: 120 });
  });

  it('drops under the line when there is no room on the right', () => {
    const pos = layoutAnswer(anchor, 600, 800, 36);
    expect(pos.x).toBe(100);
    expect(pos.y).toBeCloseTo(140 + 36 * 0.7);
  });

  it('still fits when the text ends right at the margin', () => {
    const width = 800 - 8 - (300 + ANSWER_GAP);
    expect(layoutAnswer(anchor, width, 800, 36).x).toBe(300 + ANSWER_GAP);
  });
});
describe('answerOutline', () => {
  it('thickens the answer to the pen width, never below the font own stems', () => {
    expect(answerOutline(40, 8)).toBeCloseTo(8 - 40 * 0.07);
    expect(answerOutline(40, 1)).toBe(0);
    expect(answerOutline(40)).toBe(0);
    expect(answerOutline(40, Number.NaN)).toBe(0);
  });
  it('a thicker pen gives a thicker answer', () => {
    expect(answerOutline(40, 10)).toBeGreaterThan(answerOutline(40, 5));
  });
});