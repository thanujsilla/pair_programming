import { describe, expect, it } from 'vitest';
import { evaluateLine } from './evaluate';

const ok = (value: string) => ({ status: 'ok', value });

describe('operator precedence (BODMAS)', () => {
  it.each([
    ['18+4×3=', '30'],
    ['2+3×4−5=', '9'],
    ['2×3+4×5=', '26'],
    ['100−10−5=', '85'], // left-associative
    ['20÷5÷2=', '2'],
    ['10÷4=', '2.5'],
    ['(2+3)×4=', '20'],
  ])('%s', (input, expected) => {
    expect(evaluateLine(input)).toEqual(ok(expected));
  });
});

describe('decimals', () => {
  it.each([
    ['0.1+0.2=', '0.3'], // no float error
    ['1.5×2=', '3'],
    ['.5+.5=', '1'],
    ['5.+1=', '6'],
    ['1÷3=', '0.3333333333'],
    ['2÷3=', '0.6666666667'],
  ])('%s', (input, expected) => {
    expect(evaluateLine(input)).toEqual(ok(expected));
  });
});

describe('negative numbers', () => {
  it.each([
    ['−5+3=', '-2'],
    ['-5+3=', '-2'], // ASCII hyphen
    ['3×−2=', '-6'],
    ['2−−3=', '5'],
    ['0×−1=', '0'], // no "-0"
  ])('%s', (input, expected) => {
    expect(evaluateLine(input)).toEqual(ok(expected));
  });
});

describe('large numbers', () => {
  it('multiplies exactly', () => {
    expect(evaluateLine('123456789×987654321=')).toEqual(ok('121932631112635269'));
  });
});

describe('division by zero', () => {
  it.each(['5÷0=', '0÷0=', '1÷(2−2)=', '3+5÷0='])('%s is undefined', (input) => {
    expect(evaluateLine(input)).toEqual({ status: 'undefined' });
  });
  it('0÷5 is fine', () => {
    expect(evaluateLine('0÷5=')).toEqual(ok('0'));
  });
});

describe('incomplete input (no terminal "=")', () => {
  it.each(['', '=', '18+4×3', '18+'])('"%s"', (input) => {
    expect(evaluateLine(input)).toEqual({ status: 'incomplete' });
  });
});

describe('malformed input returns an error value', () => {
  it.each(['18+=', '×3=', '3×=', '1.2.3=', '.=', '(1+2=', '1+2)=', '1=2=', 'abc=', '3 4 +=', '()='])(
    '%s',
    (input) => {
      expect(evaluateLine(input).status).toBe('error');
    },
  );
});

describe('never throws', () => {
  it('survives garbage and very deep input', () => {
    const inputs = ['((((((((((', '=====', '+-×÷', '\u0000\uFFFF=', '1+'.repeat(20000) + '1=', '('.repeat(50000) + '1='];
    for (const input of inputs) {
      expect(() => evaluateLine(input)).not.toThrow();
    }
  });
});