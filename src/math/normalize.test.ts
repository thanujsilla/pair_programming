import { describe, expect, it } from 'vitest';
import { calculate, normalizeRecognized } from './index';

describe('normalizeRecognized', () => {
  it.each([
    ['1 8 + 4 \\times 3 =', '18+4×3='],
    ['6 \\div 3 =', '6÷3='],
    ['1 . 5 - 2 =', '1.5−2='],
    ['3 x 4 =', '3×4='],
    ['3 X 4 =', '3×4='],
    ['1,5+1=', '1.5+1='],
    ['8 / 2 =', '8÷2='],
    ['7 * 2 =', '7×2='],
    ['\\frac{6}{3} =', '(6)÷(3)='],
    ['\\left( 1 + 2 \\right) \\times 3 =', '(1+2)×3='],
    ['2 \\cdot 5 =', '2×5='],
    ['a + 1 =', 'a+1='], // unknown symbols pass through; the tokenizer rejects them later
  ])('%s', (raw, expected) => {
    expect(normalizeRecognized(raw)).toBe(expected);
  });
});

describe('calculate (normalize + evaluate)', () => {
  it('works end to end on LaTeX-style output', () => {
    expect(calculate('1 8 + 4 \\times 3 =')).toEqual({ status: 'ok', value: '30' });
    expect(calculate('\\frac{6}{0} =')).toEqual({ status: 'undefined' });
    expect(calculate('5 +')).toEqual({ status: 'incomplete' });
  });
});