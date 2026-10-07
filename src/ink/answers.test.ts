import { describe, expect, it } from 'vitest';
import { ANSWER_GAP, answerFontSize, layoutAnswer } from './answers';

const anchor = { left: 100, top: 100, right: 300, bottom: 140 };

describe('answerFontSize', () => {
  it('follows the handwriting height within limits', () => {
    expect(answerFontSize(anchor)).toBeCloseTo(36);
    expect(answerFontSize({ left: 0, top: 0, right: 10, bottom: 10 })).toBe(24);
    expect(answerFontSize({ left: 0, top: 0, right: 10, bottom: 200 })).toBe(64);
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