import { describe, expect, it } from 'vitest';
import { writeExpression } from '../../testing/syntheticWriter';
import { line } from '../../ink/testUtils';
import { splitTrailingEquals } from './trailingEquals';

const write = (text: string, seed = 1) => writeExpression(text, seed, { messiness: 0.4, x: 30, baseline: 120, height: 60 });

describe('splitTrailingEquals', () => {
  it('finds a drawn "=" and removes its two strokes', () => {
    const strokes = write('3+4=');
    const { hasEquals, rest } = splitTrailingEquals(strokes);
    expect(hasEquals).toBe(true);
    expect(rest.length).toBe(strokes.length - 2);
  });

  it('finds the "=" on long lines and with several seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(splitTrailingEquals(write('18+4×3÷2−5=', seed)).hasEquals).toBe(true);
    }
  });

  it('accepts a very small "=" next to tall digits', () => {
    const strokes = [line('d', 20, 20, 24, 100), line('b1', 80, 60, 102, 61), line('b2', 86, 80, 100, 81)]; // bars 22 and 14 px, digit 80 px
    expect(splitTrailingEquals(strokes).hasEquals).toBe(true);
  });

  it('still ignores a lone short dash and a dash with a dot', () => {
    expect(splitTrailingEquals([line('d', 20, 20, 24, 100), line('b1', 80, 60, 102, 61)]).hasEquals).toBe(false);
    const dotStroke = { id: 'dot', points: [{ x: 90, y: 40, t: 0, p: 0.5 }], width: 3 };
    expect(splitTrailingEquals([line('d', 20, 20, 24, 100), line('b1', 80, 60, 102, 61), dotStroke]).hasEquals).toBe(false);
  });

  it('says no when there is no "="', () => {
    const strokes = write('3+4');
    const out = splitTrailingEquals(strokes);
    expect(out.hasEquals).toBe(false);
    expect(out.rest).toBe(strokes);
  });

  it('does not mistake a division sign at the end for "="', () => {
    for (let seed = 1; seed <= 20; seed++) expect(splitTrailingEquals(write('12÷', seed)).hasEquals).toBe(false);
  });

  it('does not mistake a lone minus for "="', () => {
    expect(splitTrailingEquals(write('5−', 3)).hasEquals).toBe(false);
  });

  it('ignores an "=" in the middle of the line', () => {
    expect(splitTrailingEquals(write('3=4+1', 2)).hasEquals).toBe(false);
  });

  it('leaves a line that is only "=" alone', () => {
    expect(splitTrailingEquals(write('=', 2)).hasEquals).toBe(false);
  });

  it('handles empty input', () => {
    expect(splitTrailingEquals([])).toEqual({ hasEquals: false, rest: [] });
  });
});